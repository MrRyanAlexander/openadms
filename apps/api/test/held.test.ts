// What a sync held for a person, read and resolved by the back office, and a phone whose held
// things are resolved turned in, against the database (spec/parts/05-sync.md step 6;
// spec/parts/08-review-and-corrections.md, "One review queue"; spec/acceptance/05-sync.md
// AC-05-46; spec/acceptance/10-api-and-sync.md AC-10-73…76; ARCHITECTURE §8, §9; BACKLOG 2.8.4,
// C106, C137, C139, C141; ADR-468, 471, 481, 482, 488, 526; REQ-212). OWASP ASVS 5.0 V5, V8,
// V16; API Security Top 10 API1, API3, API4, API5. The real process, in this test's own memory,
// on the installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm
// installer`, and fails saying so. Each test's work is undone (support/database.ts). Files are
// kept in a store of this test's own, in memory.
import { randomUUID } from 'node:crypto';

import {
  closeHeldRecordEndpoint,
  closeSetAsideFileEndpoint,
  heldRecordsAnswerSchema,
  listHeldRecordsEndpoint,
  listQuarantinedRecordsEndpoint,
  listSetAsideFilesEndpoint,
  quarantinedRecordsAnswerSchema,
  reportPasscodeUseEndpoint,
  saveHeldRecordEndpoint,
  setAsideFileEndpoint,
  setAsideFilesAnswerSchema,
  syncExamples,
  type SyncedCertification,
  type SyncedFieldEvent,
} from '@open-adms/contracts';
import { type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Certifications } from '../src/certification/certifications.ts';
import { photoPlaces } from '../src/media/photo-places.ts';
import { HeldReview } from '../src/review/held-review.ts';
import { Intake } from '../src/sync/intake.ts';
import { sentFingerprint } from '../src/sync/sync.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { jpeg, Kept, kimsPhone, nothingHeld, sha256Of, turnedIn } from './support/kims-phone.ts';
import { passcode, senderOf } from './support/phones.ts';
import { shippedPolicy } from './support/process.ts';
import { jobsFor, luisHolds } from './support/review.ts';
import { worldOn, type Served } from './support/served.ts';
import { ask, notSaved, saved, told, type Browser } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);
const withFiles = (work: Parameters<typeof world>[0]) =>
  world(work, undefined, undefined, { media: new Kept() });

const held = ' Held on the server for review.';

// What the back office reads, a page at a time.
const page = async (served: Served, signed: Browser, query: string) =>
  heldRecordsAnswerSchema.parse(
    (await ask(served, signed, listHeldRecordsEndpoint, { query })).body,
  );

// Kim's Monday on P1, synced in one go: 101031, a collection whose load call can't be one
// (held), with its photograph (kept with it); 101032, a collection saved, with a photograph
// whose file comes across wrong (set aside); a second collection on 101032 (quarantined); and a
// line the phone couldn't read back (held, with no id).
async function kimsMonday(served: Served, tx: Tx, who: Parameters<typeof kimsPhone>[2]) {
  const p = await kimsPhone(served, tx, who);
  const wrong: SyncedFieldEvent = { ...p.collection(), ticketNumber: '101031', loadCall: 150 };
  const fileOfWrong = jpeg();
  const ofWrong = p.photographOf(wrong, fileOfWrong);
  const good: SyncedFieldEvent = { ...p.collection(), ticketNumber: '101032' };
  const fileOfGood = jpeg();
  const ofGood = p.photographOf(good, fileOfGood);
  const second: SyncedFieldEvent = { ...p.collection(), ticketNumber: '101032' };
  const noId = 'a line the phone could not read back';
  const answered = await p.sync({
    records: [
      { record: 'FIELD_EVENT', fieldEvent: wrong },
      { record: 'FIELD_EVENT', fieldEvent: good },
      { record: 'FIELD_EVENT', fieldEvent: second },
      noId,
    ] as never[],
    photos: [ofWrong, ofGood],
  });
  expect(answered.records.map(({ answer }) => answer)).toEqual([
    'NOT_SAVED',
    'SAVED',
    'QUARANTINED',
    'NOT_SAVED',
  ]);
  expect(answered.photos.map(({ answer }) => answer)).toEqual(['SAVED', 'SAVED']);
  // The photograph of the record held arrives whole; the other's file comes across wrong.
  await p.upload(ofWrong.id, fileOfWrong);
  const swapped = jpeg();
  await p.upload(ofGood.id, swapped);
  return { p, wrong, ofWrong, good, ofGood, fileOfGood, second, noId, swapped };
}

describe('what waits for a person, read', () => {
  it('AC-10-73 the back office reads what a sync held, by phone or by project, waiting or resolved, a page at a time, each exactly as sent; a file set aside beside its photograph and its bytes as kept; a quarantined record with what the phone sent and the record that holds its number', async () => {
    await withFiles(async (served, tx, who) => {
      const m = await kimsMonday(served, tx, who);
      const luis = await luisHolds(served, tx, who.luis);
      const byPhone = await page(served, luis, `?deviceId=${m.p.phone.id}`);
      expect(byPhone.next).toBeNull();
      expect(
        byPhone.heldRecords.map((one) => [
          one.sentId,
          one.projectId,
          one.sentMonitorId,
          one.sentAs,
          one.reason,
          one.photos,
          one.syncId === byPhone.heldRecords[0]?.syncId,
          one.resolution,
        ]),
      ).toEqual([
        [
          m.wrong.id,
          m.p.projectId,
          who.kim,
          'FIELD_EVENT',
          'NOT_A_RECORD',
          [m.ofWrong.id],
          true,
          null,
        ],
        [null, null, null, null, 'NOT_A_RECORD', [], true, null],
      ]);
      expect(byPhone.heldRecords.map(({ sent }) => sent)).toEqual([
        JSON.parse(JSON.stringify({ record: 'FIELD_EVENT', fieldEvent: m.wrong })),
        m.noId,
      ]);
      expect(byPhone.heldRecords[1]?.message).toBe(
        `Not saved: this record can’t be read: this record isn’t the kind of value this request takes.${held}`,
      );
      // By project: only what named one; a page of one says where the next begins.
      const byProject = await page(served, luis, `?projectId=${m.p.projectId}`);
      expect(byProject.heldRecords.map(({ sentId }) => sentId)).toEqual([m.wrong.id]);
      const first = await page(served, luis, `?deviceId=${m.p.phone.id}&limit=1`);
      expect(first.heldRecords.length).toBe(1);
      const rest = await page(
        served,
        luis,
        `?deviceId=${m.p.phone.id}&limit=1&after=${String(first.next)}`,
      );
      expect([rest.heldRecords[0]?.sentId, rest.next]).toEqual([null, null]);
      expect((await page(served, luis, '?waiting=false')).heldRecords).toEqual([]);
      expect(
        told(await ask(served, luis, listHeldRecordsEndpoint, { query: '?limit=201' })),
      ).toEqual([400, 'BAD_REQUEST']);

      // A file set aside, beside its photograph, never saying where either is kept.
      const setAside = setAsideFilesAnswerSchema.parse(
        (
          await ask(served, luis, listSetAsideFilesEndpoint, {
            query: `?projectId=${m.p.projectId}`,
          })
        ).body,
      );
      expect(setAside.setAsideFiles).toEqual([
        {
          id: setAside.setAsideFiles[0]?.id,
          photoId: m.ofGood.id,
          file: 'photo',
          deviceId: m.p.phone.id,
          receivedSha256: sha256Of(m.swapped),
          byteCount: m.swapped.length,
          contentType: 'image/jpeg',
          receivedAt: setAside.setAsideFiles[0]?.receivedAt,
          photograph: {
            projectId: m.p.projectId,
            belongsTo: { kind: 'FIELD_EVENT', id: m.good.id },
            fingerprinted: sha256Of(m.fileOfGood),
            kept: false,
          },
          resolvedById: null,
          resolvedAt: null,
          resolution: null,
        },
      ]);
      const places = photoPlaces(m.p.projectId, m.ofGood.id, false);
      const read = await ask(served, luis, setAsideFileEndpoint, {
        ids: { setAsideFileId: String(setAside.setAsideFiles[0]?.id) },
      });
      expect([read.status, read.bytes.equals(m.swapped)]).toEqual([200, true]);
      expect([
        read.headers['content-type'],
        read.headers['content-disposition'],
        read.headers['x-content-type-options'],
        String(read.headers['content-security-policy']).endsWith('; sandbox'),
      ]).toEqual([
        'image/jpeg',
        `attachment; filename="${String(setAside.setAsideFiles[0]?.id)}-set-aside.jpg"`,
        'nosniff',
        true,
      ]);
      expect(JSON.stringify([setAside, read.headers])).not.toContain(places.objectKey);
      expect(
        told(
          await ask(served, luis, setAsideFileEndpoint, { ids: { setAsideFileId: randomUUID() } }),
        ),
      ).toEqual([404, 'NOT_FOUND']);

      // The quarantined collection, with what it was sent as and the collection holding 101032.
      const quarantined = quarantinedRecordsAnswerSchema.parse(
        (await ask(served, luis, listQuarantinedRecordsEndpoint, { query: '?waiting=true' })).body,
      );
      expect(
        quarantined.quarantinedRecords.map((one) => [
          one.id,
          one.deviceId,
          one.monitorId,
          one.reason,
          one.holder.kind,
          one.holder.kind === 'FIELD_EVENT' ? one.holder.fieldEvent.id : null,
          (one.sent as { fieldEvent: { ticketNumber: string } }).fieldEvent.ticketNumber,
        ]),
      ).toEqual([
        [
          m.second.id,
          m.p.phone.id,
          who.kim,
          'DUPLICATE_FIELD_EVENT',
          'FIELD_EVENT',
          m.good.id,
          '101032',
        ],
      ]);
      // Nobody signed in reads none of it.
      for (const endpoint of [
        listHeldRecordsEndpoint,
        listSetAsideFilesEndpoint,
        listQuarantinedRecordsEndpoint,
      ]) {
        expect(told(await ask(served, undefined, endpoint)), endpoint.name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
      }
    });
  });
});

describe('what a sync held, resolved', () => {
  it('AC-10-74 Luis, who holds correct, saves 101031 as it should have been: a field event under the id its phone made, as the phone’s record, written as him from the back office with his reason; its photograph moves to it and its ticket is queued; the held record stays as sent, marked resolved once; the phone’s copy sent again is already saved', async () => {
    await withFiles(async (served, tx, who, within) => {
      const m = await kimsMonday(served, tx, who);
      const [waiting] = (await page(served, await luisHolds(served, tx, who.luis), '')).heldRecords;
      if (waiting === undefined) throw new Error('Nothing is held.');
      const asSent = await tx.heldRecord.findUniqueOrThrow({ where: { id: waiting.id } });
      const fixed: SyncedFieldEvent = { ...m.wrong, loadCall: null };
      const save = (signed: Browser, record: object, note = 'Load call typed as 150: none taken') =>
        ask(served, signed, saveHeldRecordEndpoint, {
          ids: { heldRecordId: waiting.id },
          payload: { record, note },
        });
      const record = { record: 'FIELD_EVENT', fieldEvent: fixed };
      // Correct is its permission: void alone isn't.
      const voider = await luisHolds(served, tx, who.luis, 'VOID');
      expect(told(await save(voider, record))).toEqual([403, 'NOT_ALLOWED']);
      // The service asks again inside its own piece of work, whatever the door asked.
      const review = new HeldReview(within, served.clock, shippedPolicy, {
        intake: new Intake(within, served.clock, shippedPolicy),
        certifications: new Certifications(within, served.clock, shippedPolicy),
      });
      const asked = await review.save(who.luis, waiting.id, record as never, 'In process');
      expect(asked.saved ? null : asked.refusal.code).toBe('NOT_PERMITTED');
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'CORRECT' } });
      const luis = voider;
      // Another id, another kind, no reason: nothing changes.
      expect(
        notSaved(
          await save(luis, { record: 'FIELD_EVENT', fieldEvent: { ...fixed, id: randomUUID() } }),
        ),
      ).toEqual([
        'NOT_THE_ID_SENT',
        `A record saved from a held one keeps the id its phone made, ${m.wrong.id}. Nothing was changed.`,
      ]);
      const survey = syncExamples.records.find((one) => one.record === 'SURVEY');
      if (survey?.record !== 'SURVEY') throw new Error('No example survey.');
      expect(
        notSaved(
          await save(luis, {
            record: 'SURVEY',
            survey: { ...survey.survey, id: m.wrong.id, projectId: m.p.projectId },
          }),
        ),
      ).toEqual([
        'NOT_THE_KIND_SENT',
        'This held record was sent as a field event: it is saved as one. Nothing was changed.',
      ]);
      expect(
        told(
          await ask(served, luis, saveHeldRecordEndpoint, {
            ids: { heldRecordId: waiting.id },
            payload: { record },
          }),
        ),
      ).toEqual([400, 'BAD_REQUEST']);
      const answer = await save(luis, record);
      const { record: resolved, queued } = saved(saveHeldRecordEndpoint, answer);
      expect([resolved.resolvedById, resolved.resolution, resolved.photos]).toEqual([
        who.luis,
        'Saved as corrected: a field event under the id its phone made, with its photographs.',
        [],
      ]);
      // 101032, worked by the same truck that morning, is its neighbour, and is queued with it.
      expect(queued).toMatchObject({ tickets: 2, lockedAsInvoiced: 0 });
      expect(await jobsFor(tx, m.p.projectId, who.luis)).toEqual([
        ['CORRECTION', 'LOAD 101031', 'LOAD 101032'],
      ]);
      const event = await tx.fieldEvent.findUniqueOrThrow({ where: { id: m.wrong.id } });
      expect([
        event.ticketNumber,
        event.source,
        event.deviceId,
        event.monitorId,
        event.loadCall,
        event.status,
        event.receivedAt.toISOString(),
      ]).toEqual([
        '101031',
        'DEVICE',
        m.p.phone.id,
        who.kim,
        null,
        'PENDING',
        asSent.receivedAt.toISOString(),
      ]);
      const audit = await tx.auditRecord.findFirstOrThrow({
        where: { tableName: 'field_event', recordId: m.wrong.id },
      });
      expect([audit.operation, audit.actorId, audit.source, audit.reason]).toEqual([
        'INSERT',
        who.luis,
        'BACK_OFFICE',
        'Load call typed as 150: none taken',
      ]);
      const moved = await tx.photo.findUniqueOrThrow({ where: { id: m.ofWrong.id } });
      expect([moved.fieldEventId, moved.heldRecordId, moved.uploadedAt === null]).toEqual([
        m.wrong.id,
        null,
        false,
      ]);
      const kept = await tx.heldRecord.findUniqueOrThrow({ where: { id: waiting.id } });
      expect([kept.payload, kept.sentSha256]).toEqual([asSent.payload, asSent.sentSha256]);
      expect(notSaved(await save(luis, record))[0]).toBe('ALREADY_RESOLVED');
      // The phone's own copy, sent again as it was, still can't be read: it is the same held
      // record, nothing is added, and the phone's turn-in confirms it by its id.
      const again = await m.p.sync({ records: [{ record: 'FIELD_EVENT', fieldEvent: m.wrong }] });
      expect(again.records.map(({ answer }) => answer)).toEqual(['NOT_SAVED']);
      expect(await tx.heldRecord.count({ where: { deviceId: m.p.phone.id } })).toBe(2);
      // A record held because the unplanned assignment it was made under wasn't kept: saved as
      // corrected under Kim's planned one, the phone's copy sent again is already saved.
      const unkept = {
        ...syncExamples.unplanned,
        id: randomUUID(),
        projectId: randomUUID(),
        personId: who.kim,
      };
      const planned = m.p.collection();
      const named = { ...planned, ticketNumber: '101033', assignmentId: unkept.id };
      const sending = {
        unplannedAssignments: [unkept],
        records: [{ record: 'FIELD_EVENT' as const, fieldEvent: named }],
      };
      expect((await m.p.sync(sending)).records.map(({ answer }) => answer)).toEqual(['NOT_SAVED']);
      const namedHeld = await tx.heldRecord.findFirstOrThrow({ where: { sentId: named.id } });
      saved(
        saveHeldRecordEndpoint,
        await ask(served, luis, saveHeldRecordEndpoint, {
          ids: { heldRecordId: namedHeld.id },
          payload: {
            record: {
              record: 'FIELD_EVENT',
              fieldEvent: { ...named, assignmentId: planned.assignmentId },
            },
            note: 'Kim had her own assignment that day',
          },
        }),
      );
      const resent = await m.p.sync({ records: [{ record: 'FIELD_EVENT', fieldEvent: named }] });
      expect(resent.records).toEqual([{ answer: 'ALREADY_SAVED', id: named.id }]);
      expect(
        (await tx.fieldEvent.findUniqueOrThrow({ where: { id: named.id } })).assignmentId,
      ).toBe(planned.assignmentId);
    });
  });

  it('AC-10-74 a certification held because its number was taken is saved under another, with its five photographs; one whose number is taken again is refused, and a report is closed, never saved', async () => {
    await withFiles(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      const coastline = await tx.contractor.findFirstOrThrow({
        where: { name: { startsWith: 'Coastline' } },
      });
      const assignmentId = p.collection().assignmentId;
      const certification = (more: Partial<SyncedCertification>): SyncedCertification => ({
        ...syncExamples.certification,
        id: randomUUID(),
        projectId: p.projectId,
        primeId: coastline.id,
        vehicleTypeId: null,
        vehicleTypeOther: 'Self-loader',
        certifiedById: who.kim,
        assignmentId,
        helperIds: [],
        boxes: syncExamples.certification.boxes.map((box, position) => ({
          ...box,
          featureId: null,
          featureOther: position === 0 ? null : 'Dog box',
        })),
        ...more,
      });
      const first = certification({});
      const typo = certification({ vehicleTypeOther: 'Dump trailer' });
      const views = syncExamples.certificationPhotos.map((photo) => ({
        ...photo,
        id: randomUUID(),
        projectId: p.projectId,
        owner: { kind: 'CERTIFICATION' as const, id: typo.id },
        takenById: who.kim,
      }));
      const nowhere = {
        ...syncExamples.unplanned,
        id: randomUUID(),
        projectId: randomUUID(),
        personId: who.kim,
      };
      const answered = await p.sync({
        unplannedAssignments: [nowhere],
        records: [
          { record: 'CERTIFICATION', certification: first },
          { record: 'CERTIFICATION', certification: typo },
        ],
        photos: views,
      });
      expect(answered.records.map(({ answer }) => answer)).toEqual(['SAVED', 'NOT_SAVED']);
      expect(answered.photos.map(({ answer }) => answer)).toEqual(Array(5).fill('SAVED'));
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT', 'VOID');
      const all = await page(served, luis, `?deviceId=${p.phone.id}`);
      const [report, typoHeld] = all.heldRecords;
      expect([report?.sentAs, report?.reason, typoHeld?.sentAs, typoHeld?.photos.length]).toEqual([
        'REPORT',
        'REPORT_NOT_SAVED',
        'CERTIFICATION',
        5,
      ]);
      const saveAs = (number: string) =>
        ask(served, luis, saveHeldRecordEndpoint, {
          ids: { heldRecordId: String(typoHeld?.id) },
          payload: {
            record: { record: 'CERTIFICATION', certification: { ...typo, certNumber: number } },
            note: 'Sheet 730416 was typed twice: this truck is 730418',
          },
        });
      expect(notSaved(await saveAs('730416'))).toEqual([
        'NUMBER_HELD',
        'This project already has a certification 730416. Nothing was changed.',
      ]);
      const done = saved(saveHeldRecordEndpoint, await saveAs('730418'));
      expect(done.record.resolution).toBe(
        'Saved as corrected: a certification under the id its phone made, with its photographs.',
      );
      const made = await tx.certification.findUniqueOrThrow({ where: { id: typo.id } });
      expect([made.certNumber, made.deviceId, made.capacityCy]).toEqual(['730418', p.phone.id, 48]);
      expect(await tx.photo.count({ where: { certificationId: typo.id } })).toBe(5);
      // A report is closed, never saved.
      expect(
        notSaved(
          await ask(served, luis, saveHeldRecordEndpoint, {
            ids: { heldRecordId: String(report?.id) },
            payload: {
              record: { record: 'CERTIFICATION', certification: first },
              note: 'Saved',
            },
          }),
        )[0],
      ).toBe('CLOSED_ONLY');
    });
  });

  it('AC-10-75 Luis, who holds void, closes what never becomes a record and a file set aside: each kept as it was, marked who, when and why, once; correct alone closes neither', async () => {
    await withFiles(async (served, tx, who) => {
      const m = await kimsMonday(served, tx, who);
      const corrector = await luisHolds(served, tx, who.luis, 'CORRECT');
      const [, noId] = (await page(served, corrector, '')).heldRecords;
      const close = (signed: Browser, payload: object) =>
        ask(served, signed, closeHeldRecordEndpoint, {
          ids: { heldRecordId: String(noId?.id) },
          payload,
        });
      const reason = { note: 'A line the phone wrote itself: no work' };
      expect(told(await close(corrector, reason))).toEqual([403, 'NOT_ALLOWED']);
      await tx.userPermission.create({ data: { userId: who.luis, permission: 'VOID' } });
      const luis = corrector;
      expect(told(await close(luis, {}))).toEqual([400, 'BAD_REQUEST']);
      const closed = saved(closeHeldRecordEndpoint, await close(luis, reason));
      expect([closed.record.resolvedById, closed.record.resolution, closed.record.sent]).toEqual([
        who.luis,
        'Closed, never to be saved: what was sent stays here, with its photographs.',
        m.noId,
      ]);
      expect(notSaved(await close(luis, reason))[0]).toBe('ALREADY_RESOLVED');
      const audit = await tx.auditRecord.findFirstOrThrow({
        where: { tableName: 'held_record', recordId: String(noId?.id), operation: 'UPDATE' },
      });
      expect([audit.actorId, audit.source, audit.reason]).toEqual([
        who.luis,
        'BACK_OFFICE',
        reason.note,
      ]);
      const file = await tx.setAsideFile.findFirstOrThrow({ where: { photoId: m.ofGood.id } });
      const shut = saved(
        closeSetAsideFileEndpoint,
        await ask(served, luis, closeSetAsideFileEndpoint, {
          ids: { setAsideFileId: file.id },
          payload: { note: 'The phone’s copy is damaged; this is what it has' },
        }),
      );
      expect([shut.record.id, shut.record.resolution, shut.record.photograph.kept]).toEqual([
        file.id,
        'Closed: the photograph’s own file won’t come; this file stays beside it.',
        false,
      ]);
    });
  });

  it('AC-10-76, AC-02-58 a report the server can’t keep is held, at a sync and at its own endpoint; a photograph whose record is nowhere is held; a phone holding either, or a file set aside, is turned in once a person has resolved each', async () => {
    await withFiles(async (served, tx, who) => {
      const m = await kimsMonday(served, tx, who);
      const { p } = m;
      // A use of the passcode for nobody the firm has, reported at its own endpoint; and a
      // photograph of a record the phone never sent.
      const use = { ...syncExamples.switched, id: randomUUID(), personId: randomUUID() };
      const reported = await served.ask('POST', reportPasscodeUseEndpoint.path, {
        bearer: senderOf(p.token),
        payload: use,
      });
      expect(reported.body).toEqual({
        useId: use.id,
        answer: 'NOT_SAVED',
        reason: 'NOT_A_MONITOR',
      });
      const orphan = p.photographOf({ ...p.collection(), id: randomUUID() }, jpeg());
      const answered = await p.sync({ photos: [orphan] });
      expect(answered.photos.map((one) => ('reason' in one ? one.reason : one.answer))).toEqual([
        'OWNER_NOT_SAVED',
      ]);
      const heldUse = await tx.heldRecord.findFirstOrThrow({ where: { sentId: use.id } });
      expect([heldUse.syncId, heldUse.reason]).toEqual([null, 'REPORT_NOT_SAVED']);
      const holds = {
        ...nothingHeld,
        passcodeUses: [use.id],
        records: [m.wrong.id, m.good.id, m.second.id],
        held: [sentFingerprint(m.noId)],
        photos: [m.ofWrong.id, m.ofGood.id, orphan.id],
      };
      const before = await turnedIn(served, p.token, { passcode, holds, lastUsed: [] });
      expect([before.turnedIn, before.turnedIn ? null : before.notOnTheServer.photos]).toEqual([
        false,
        [m.ofGood.id, orphan.id],
      ]);
      // A person closes the photograph that never had a record, and the file set aside.
      const luis = await luisHolds(served, tx, who.luis, 'VOID');
      const orphanHeld = await tx.heldRecord.findFirstOrThrow({ where: { sentId: orphan.id } });
      saved(
        closeHeldRecordEndpoint,
        await ask(served, luis, closeHeldRecordEndpoint, {
          ids: { heldRecordId: orphanHeld.id },
          payload: { note: 'Taken by mistake: no record' },
        }),
      );
      const file = await tx.setAsideFile.findFirstOrThrow({ where: { photoId: m.ofGood.id } });
      saved(
        closeSetAsideFileEndpoint,
        await ask(served, luis, closeSetAsideFileEndpoint, {
          ids: { setAsideFileId: file.id },
          payload: { note: 'The phone’s copy is damaged' },
        }),
      );
      const after = await turnedIn(served, p.token, { passcode, holds, lastUsed: [] });
      expect([after.turnedIn, after.wipe]).toEqual([true, true]);
    });
  });
});

describe('what the sweep filed (C137, C139)', () => {
  it('C137, C139 a photograph sent under an upper-case id is kept at a lower-case place; a kept file whose bytes no longer say the type it was kept under is never handed back as the photograph’s', async () => {
    const store = new Kept();
    await world(
      async (served, tx, who) => {
        const p = await kimsPhone(served, tx, who);
        const collection = p.collection();
        const file = jpeg();
        const photo = { ...p.photographOf(collection, file) };
        const shouted = { ...photo, id: photo.id.toUpperCase() };
        const answered = await p.sync({
          records: [{ record: 'FIELD_EVENT', fieldEvent: collection }],
          photos: [shouted],
        });
        expect(answered.photos.map(({ answer }) => answer)).toEqual(['SAVED']);
        const kept = await tx.photo.findUniqueOrThrow({ where: { id: photo.id } });
        expect(kept.objectKey).toBe(photoPlaces(p.projectId, photo.id, false).objectKey);
        expect(kept.objectKey).toBe(kept.objectKey.toLowerCase());
        await p.upload(photo.id, file);
        // The store says another type than the bytes it holds: the server's own failure.
        const stored = store.files.get(kept.objectKey);
        if (stored === undefined) throw new Error('The file was not kept.');
        store.files.set(kept.objectKey, { ...stored, contentType: 'image/png' });
        const luis = await luisHolds(served, tx, who.luis);
        const read = await served.ask('GET', `/photographs/${photo.id}/files/photo`, {
          cookies: luis.cookies,
        });
        expect([read.status, read.bytes.includes(file)]).toEqual([500, false]);
      },
      undefined,
      undefined,
      { media: store },
    );
  });
});
