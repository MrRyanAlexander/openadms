// A phone's sync, whole, against the database (ARCHITECTURE §9 (1), (3), (4), (6), (7), §10;
// spec/acceptance/05-sync.md AC-05-03, 04, 15, 16, 20, 45, 47; spec/acceptance/10-api-and-sync.md
// AC-10-35, 46, 51; AC-02-23, AC-05-48; spec/DATA-MODEL.md §4.5; BACKLOG 2.6.2, C64, C69, C122,
// C126…C132, C136; ADR-022, 052, 065, 100, 420, 453, 454, 466…473, 481; KD-56; REQ-016, 203, 308c). The real process, in this test's own
// memory, on the installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm
// installer`, and fails saying so. Each test's work is undone (support/database.ts).
import { randomUUID } from 'node:crypto';

import {
  addFieldTagEndpoint,
  changeMasterPasscodeEndpoint,
  endpoints,
  listPhonesEndpoint,
  monitorCreatedAnswerSchema,
  removePhoneEndpoint,
  sentWeight,
  syncAnswerRead,
  syncAnsweredSchema,
  syncExamples,
  syncBytesAtMost,
  syncedRecordBytesAtMost,
  syncPhoneEndpoint,
  syncSentSchema,
  type SyncedCertification,
  type SyncedFieldEvent,
  type SyncAnswered,
  type SyncedPhoto,
  type SyncSent,
} from '@open-adms/contracts';
import { deviceKeyActorId, type Actor, type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Certifications } from '../src/certification/certifications.ts';
import { NumberAllocator, SeriesMovedOn } from '../src/numbering/number-allocator.ts';
import { OfflineChecks } from '../src/phone/offline-checks.ts';
import { PasscodeUses } from '../src/phone/passcode-uses.ts';
import { PhoneAssignments } from '../src/phone/phone-assignments.ts';
import { PhoneLoginList } from '../src/phone/phone-login-list.ts';
import { UnplannedAssignments } from '../src/phone/unplanned-assignments.ts';
import { isMediaKey } from '../src/media/media-store.ts';
import { HeldThings } from '../src/sync/held.ts';
import { Intake } from '../src/sync/intake.ts';
import { sentFingerprint, Sync } from '../src/sync/sync.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { opens } from './support/offline-check.ts';
import { enrolledPhone, passcode, provenWithPasscode } from './support/phones.ts';
import { shippedPolicy } from './support/process.ts';
import { notTaken } from './support/review.ts';
import {
  danasEmail,
  long,
  worldOn,
  type Answer,
  type People,
  type Served,
} from './support/served.ts';
import { ask, p1Priced, saved, told } from './support/setup.ts';
import { Outbox, sealingKey } from './support/sign-in.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// 1:05 pm on Monday in Bayline County: the phone finds signal.
const mondayAfternoon = new Date('2026-10-12T17:05:00Z');
const held = ' Held on the server for review.';

// P1 as Dana prices it; the collection phone, enrolled and proven; Kim Nguyen's Monday on P1,
// planned by Dana: loads at both ends, and certifying.
// A phone in service, as the door reads one, for a sync built by hand.
const inService = (deviceId: string) =>
  ({ deviceId, status: 'ACTIVE', keyRevoked: false }) as const;

// What a sync brought a phone in service: never nothing (ADR-531).
function passcodeOf(answered: SyncAnswered): NonNullable<SyncAnswered['masterPasscode']> {
  if (answered.masterPasscode === null) throw new Error('The sync brought no passcode’s check.');
  return answered.masterPasscode;
}

async function kimOnP1(served: Served, tx: Tx, who: People) {
  served.clock.at = mondayAfternoon;
  const dana = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx);
  const projectId = priced.project.id;
  const phone = await enrolledPhone(served, tx, 'P1-COL-1');
  // Somebody signed in on it (ADR-531): the master user, by the passcode beside its proof.
  const token = await provenWithPasscode(served, phone);
  const assignment = await tx.assignment.create({
    data: {
      personId: who.kim,
      workDate: new Date('2026-10-12'),
      projectId,
      fieldEventKinds: ['COLLECTION', 'DISPOSAL'],
      certifying: true,
      origin: 'PLANNED',
      madeById: who.dana,
    },
  });
  // A field event as Kim's phone sends it, under an id of the phone's own.
  const event = (more: Partial<SyncedFieldEvent> = {}): SyncedFieldEvent => ({
    ...syncExamples.collection,
    id: randomUUID(),
    projectId,
    monitorId: who.kim,
    assignmentId: assignment.id,
    setupVersion: 1,
    formDebrisTypeId: null,
    ...more,
  });
  const disposal = (more: Partial<SyncedFieldEvent> = {}): SyncedFieldEvent =>
    event({
      kind: 'DISPOSAL',
      startedAt: '2026-10-12T14:22:00.000Z',
      endedAt: '2026-10-12T14:26:00.000Z',
      address: null,
      addressSource: null,
      loadCall: 85,
      // A disposal marks no waypoint (ADR-581).
      waypoints: [],
      ...more,
    });
  // One sync as the phone sends it: every part, empty where there is nothing.
  const sync = (more: Partial<SyncSent> = {}): SyncSent => ({
    clockAt: served.clock.now().toISOString(),
    deviceUtcOffsetMinutes: -240,
    unplannedAssignments: [],
    passcodeUses: [],
    records: [],
    photos: [],
    lastUsed: [],
    // It holds the check of the passcode it was enrolled under, and no lists.
    holds: { masterPasscodeVersion: phone.masterPasscodeVersion, listsProjectId: null },
    ...more,
  });
  return { dana, priced, projectId, phone, token, assignment, event, disposal, sync };
}

const send = (served: Served, bearer: string | undefined, payload: object): Promise<Answer> =>
  served.ask('POST', syncPhoneEndpoint.path, {
    payload,
    ...(bearer === undefined ? {} : { bearer }),
  });

// A sync that must be answered: the answer as the client's own rule reads it.
async function synced(served: Served, bearer: string, sent: SyncSent) {
  const answer = await send(served, bearer, sent);
  expect(told(answer)).toEqual([200, undefined]);
  const read = syncAnswerRead(sent, answer.body);
  if (read === null) throw new Error('What came back is no answer to the sync sent.');
  return { ...read, requestId: answer.requestId };
}

const syncsOf = (tx: Tx, deviceId: string) =>
  tx.sync.findMany({ where: { deviceId }, orderBy: { id: 'asc' } });

const ledgerOf = async (tx: Tx, deviceId: string) =>
  (await tx.syncedRecord.findMany({ where: { deviceId }, orderBy: { recordId: 'asc' } })).map(
    ({ recordId, recordKind, syncId, answer }) => [recordId, recordKind, syncId, answer],
  );

// The jobs a project's syncs queued, oldest first: who asked (nobody) and the tickets named.
const jobsOf = async (tx: Tx, projectId: string) =>
  (
    await tx.reconciliationJob.findMany({
      where: { projectId, trigger: 'SYNC' },
      orderBy: { id: 'asc' },
      select: { requestedById: true, tickets: { select: { workflow: true, ticketNumber: true } } },
    })
  ).map(({ requestedById, tickets }) => [
    requestedById,
    ...tickets.map(({ workflow, ticketNumber }) => `${workflow} ${ticketNumber}`).sort(),
  ]);

const heldOf = (tx: Tx, deviceId: string) =>
  tx.heldRecord.findMany({ where: { deviceId }, orderBy: { id: 'asc' } });

describe('who may sync', () => {
  it('AC-05-03, AC-10-46, ADR-531 a sync is a proven phone’s with somebody signed in on it (its monitor, or the master user by the passcode at its proof: offline-sign-ins.test.ts), and a caller with no phone’s token sends nothing that is taken', async () => {
    const { access, roles, permission, method, path } =
      endpoints.find(({ name }) => name === 'syncPhone') ?? {};
    expect([access, roles, permission, method, path]).toEqual([
      'PHONE_IN_USE',
      undefined,
      undefined,
      'POST',
      '/phones/current/syncs',
    ]);
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const sent = p.sync({ records: [{ record: 'FIELD_EVENT', fieldEvent: p.event() }] });
      const refused = [401, 'PHONE_NOT_PROVEN'];
      expect(told(await send(served, undefined, sent))).toEqual(refused);
      expect(told(await send(served, 'not-a-token', sent))).toEqual(refused);
      const asDana = await served.ask('POST', syncPhoneEndpoint.path, {
        payload: sent,
        cookies: p.dana.cookies,
        csrf: p.dana.csrf,
      });
      expect(told(asDana)).toEqual(refused);
      // AC-10-35: a sync never says which phone it is from; one that does is no sync.
      expect(notTaken(await send(served, p.token, { ...sent, deviceId: p.phone.id }))).toBe(
        'Not taken: the body has a field this request doesn’t take.',
      );
      expect(await syncsOf(tx, p.phone.id)).toEqual([]);
      expect(await tx.fieldEvent.count({ where: { projectId: p.projectId } })).toBe(0);
    });
  });
});

describe('a sync is kept with both clocks', () => {
  it('AC-05-03, 04, 16, AC-10-51 a phone whose clock is 2 h 14 m ahead syncs a load’s two field events: the sync is written first with the difference, each record is saved with its row in the ledger, and its ticket is queued for reconciliation, which nobody waits for', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const collection = p.event();
      const disposal = p.disposal();
      const phonesClock = new Date(mondayAfternoon.getTime() + (2 * 60 + 14) * 60_000);
      const sent = p.sync({
        clockAt: phonesClock.toISOString(),
        records: [
          { record: 'FIELD_EVENT', fieldEvent: collection },
          { record: 'FIELD_EVENT', fieldEvent: disposal },
        ],
      });
      const answered = await synced(served, p.token, sent);
      expect(answered.records).toEqual([
        { answer: 'SAVED', id: collection.id, notes: [] },
        { answer: 'SAVED', id: disposal.id, notes: [] },
      ]);
      expect([answered.unplannedAssignments, answered.passcodeUses, answered.numbers]).toEqual([
        [],
        [],
        [],
      ]);
      // It holds the passcode's check in force and no lists: nothing more is brought.
      expect([answered.masterPasscode, answered.setupVersion]).toEqual([
        { version: p.phone.masterPasscodeVersion, check: null },
        null,
      ]);

      const [sync, ...others] = await syncsOf(tx, p.phone.id);
      if (sync === undefined) throw new Error('No sync was written.');
      expect(others).toEqual([]);
      expect([
        sync.startedAt,
        sync.deviceClockAt,
        sync.deviceUtcOffsetMinutes,
        sync.clockDifferenceSeconds,
        sync.setupVersionSent,
      ]).toEqual([mondayAfternoon, phonesClock, -240, 8040n, null]);
      // The phone's own act: written as its device key's actor, on that phone.
      const [written] = await tx.auditRecord.findMany({
        where: { tableName: 'sync', recordId: sync.id },
      });
      expect([written?.operation, written?.actorId, written?.source, written?.deviceId]).toEqual([
        'INSERT',
        deviceKeyActorId,
        'DEVICE',
        p.phone.id,
      ]);

      // The server says which phone made them; each lands PENDING, concluded by nobody here.
      const events = await tx.fieldEvent.findMany({
        where: { projectId: p.projectId },
        orderBy: { startedAt: 'asc' },
      });
      expect(
        events.map((event) => [
          event.id,
          event.kind,
          event.source,
          event.deviceId,
          event.monitorId,
          event.status,
          event.receivedAt,
        ]),
      ).toEqual([
        [collection.id, 'COLLECTION', 'DEVICE', p.phone.id, who.kim, 'PENDING', mondayAfternoon],
        [disposal.id, 'DISPOSAL', 'DEVICE', p.phone.id, who.kim, 'PENDING', mondayAfternoon],
      ]);
      expect(await ledgerOf(tx, p.phone.id)).toEqual(
        [
          [collection.id, 'FIELD_EVENT', sync.id, 'SAVED'],
          [disposal.id, 'FIELD_EVENT', sync.id, 'SAVED'],
        ].sort(([a = ''], [b = '']) => a.localeCompare(b)),
      );
      // A ledger row is the monitor's write, from the phone, as its record is.
      const [row] = await tx.auditRecord.findMany({
        where: { tableName: 'synced_record', recordId: disposal.id },
      });
      expect([row?.actorId, row?.source, row?.deviceId]).toEqual([who.kim, 'DEVICE', p.phone.id]);
      // Each record queued its own ticket, in its own piece of work; no person asked.
      expect(await jobsOf(tx, p.projectId)).toEqual([
        [null, 'LOAD 101001'],
        [null, 'LOAD 101001'],
      ]);
      expect(await tx.completedLoad.count({ where: { projectId: p.projectId } })).toBe(0);
      // The log says which phone and how many of what: never a record or its id.
      const logged = served.lines.filter((line) => line.includes('A phone synced.')).join('\n');
      expect(logged).toContain(sync.id);
      expect(logged).toContain('"clockDifferenceSeconds":8040');
      expect(logged).toContain('"records":{"SAVED":2}');
      expect(logged).not.toContain(collection.id);
      expect(logged).not.toContain('101001');
    });
  });
});

describe('who a phone’s record names (ADR-543)', () => {
  it('AC-10-110 every field event is saved as sent, and the ledger keeps whether the person it names held that phone over its field time: their own session there; or the board’s assignment of theirs on that very phone with nobody else signed in on it then; never somebody else’s session, or an assignment with no phone', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      // Kim's own day on this very phone, as the board planned it.
      const onThisPhone = await tx.assignment.create({
        data: {
          personId: who.kim,
          workDate: new Date('2026-10-12'),
          projectId: p.projectId,
          fieldEventKinds: ['COLLECTION'],
          origin: 'PLANNED',
          madeById: who.dana,
          deviceId: p.phone.id,
        },
      });
      // Ana Brooks is created on the phone under the passcode, and signs in on it at 1:05 pm.
      const createdAna = await served.ask('POST', '/phones/current/monitors', {
        bearer: p.token,
        payload: { name: 'Ana Brooks', password: '5550143', passcode },
      });
      expect(told(createdAna)).toEqual([200, undefined]);
      const ana = monitorCreatedAnswerSchema.parse(createdAna.body);
      const signIn = await served.ask('POST', '/phones/current/sign-ins', {
        bearer: p.token,
        payload: { monitorNumber: ana.monitorNumber, password: '5550143' },
      });
      expect(told(signIn)).toEqual([200, undefined]);
      served.clock.later(30);
      // 1:10 to 1:20 pm, while Ana holds the phone; and 9:05 to 9:40 am, before anybody did.
      const whileAnas = {
        startedAt: '2026-10-12T17:10:00.000Z',
        endedAt: '2026-10-12T17:20:00.000Z',
      };
      const records = {
        anasOwn: p.event({ ...whileAnas, ticketNumber: '101044', monitorId: ana.userId }),
        kimsWhileAnas: p.event({ ...whileAnas, ticketNumber: '101045' }),
        kimsOnHerPhoneWhileAnas: p.event({
          ...whileAnas,
          ticketNumber: '101046',
          assignmentId: onThisPhone.id,
        }),
        kimsOnHerPhoneBefore: p.event({ ticketNumber: '101047', assignmentId: onThisPhone.id }),
      };
      // The phone's token has run out meanwhile: it proves itself again, the master user at it.
      const answered = await synced(
        served,
        await provenWithPasscode(served, p.phone),
        p.sync({
          records: Object.values(records).map((fieldEvent) => ({
            record: 'FIELD_EVENT' as const,
            fieldEvent,
          })),
        }),
      );
      expect(answered.records.map(({ answer }) => answer)).toEqual(Array(4).fill('SAVED'));
      const kept = new Map(
        (
          await tx.syncedRecord.findMany({
            where: { deviceId: p.phone.id },
            select: { recordId: true, monitorId: true, monitorSignedIn: true },
          })
        ).map((row) => [row.recordId, [row.monitorId, row.monitorSignedIn]]),
      );
      expect(Object.values(records).map((record) => kept.get(record.id))).toEqual([
        [ana.userId, true],
        [who.kim, false],
        [who.kim, false],
        [who.kim, true],
      ]);
      // Nothing was refused: each is the field event its phone sent.
      expect(
        await tx.fieldEvent.count({
          where: { id: { in: Object.values(records).map((r) => r.id) } },
        }),
      ).toBe(4);
    });
  });
});

describe('a record made in a session under the master passcode', () => {
  it('AC-02-42, ADR-534 (11) a field event made in a session the master passcode opened says which way, as the phone’s monitor or the temporary session, and one made in the monitor’s own says none; a temporary session’s is the temporary mark it always kept; the database holds the two to agree', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const own = p.event();
      const asMonitor = { ...p.disposal(), masterPasscodeSession: 'AS_MONITOR' as const };
      const temporary = {
        ...p.event(),
        ticketNumber: '101002',
        masterPasscodeSession: 'TEMPORARY' as const,
      };
      const answered = await synced(
        served,
        p.token,
        p.sync({
          records: [
            { record: 'FIELD_EVENT', fieldEvent: own },
            { record: 'FIELD_EVENT', fieldEvent: asMonitor },
            { record: 'FIELD_EVENT', fieldEvent: temporary },
          ],
        }),
      );
      expect(answered.records.map(({ answer }) => answer)).toEqual(['SAVED', 'SAVED', 'SAVED']);
      const marks = async (id: string) => {
        const event = await tx.fieldEvent.findUniqueOrThrow({ where: { id } });
        return [event.masterPasscodeSession, event.temporarySession];
      };
      expect([await marks(own.id), await marks(asMonitor.id), await marks(temporary.id)]).toEqual([
        [null, false],
        ['AS_MONITOR', false],
        ['TEMPORARY', true],
      ]);
    });
  });
});

describe('a record is stored once', () => {
  it('AC-02-45, AC-05-08, AC-08-06, T-05 a record its monitor submitted is sealed: sent again under its id with its load call changed, it is answered “already saved”, and the server keeps what it stored; nothing is written and nothing queued', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const disposal = p.disposal({ ticketNumber: '101020' });
      await synced(
        served,
        p.token,
        p.sync({ records: [{ record: 'FIELD_EVENT', fieldEvent: disposal }] }),
      );
      const stored = () => tx.fieldEvent.findUniqueOrThrow({ where: { id: disposal.id } });
      const audited = () =>
        tx.auditRecord.count({ where: { tableName: 'field_event', recordId: disposal.id } });
      const before = { event: await stored(), audited: await audited() };
      const jobs = await jobsOf(tx, p.projectId);
      expect(before.event.loadCall).toBe(85);

      // The phone was tampered with after the monitor submitted it: 85% is now 95%.
      const again = await synced(
        served,
        p.token,
        p.sync({ records: [{ record: 'FIELD_EVENT', fieldEvent: { ...disposal, loadCall: 95 } }] }),
      );
      expect(again.records).toEqual([{ answer: 'ALREADY_SAVED', id: disposal.id }]);
      expect(await stored()).toEqual(before.event);
      expect(await audited()).toBe(before.audited);
      expect(await jobsOf(tx, p.projectId)).toEqual(jobs);
      expect(await tx.heldRecord.count({ where: { deviceId: p.phone.id } })).toBe(0);
      expect(await tx.quarantinedRecord.count({ where: { projectId: p.projectId } })).toBe(0);
    });
  });

  it('AC-05-15, 16, 20, 45, REQ-016 a sync sent again is answered “already saved” from the ledger and stores nothing twice; a second disposal on the ticket is kept in quarantine and never answered “saved”, however often it is sent; neither stops the record sent with it', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const collection = p.event({ ticketNumber: '101020' });
      const disposal = p.disposal({ ticketNumber: '101020' });
      const first = p.sync({
        records: [
          { record: 'FIELD_EVENT', fieldEvent: collection },
          { record: 'FIELD_EVENT', fieldEvent: disposal },
        ],
      });
      await synced(served, p.token, first);
      const jobs = await jobsOf(tx, p.projectId);

      // The answer was lost on the way: the phone sends the whole sync again.
      const again = await synced(served, p.token, first);
      expect(again.records).toEqual([
        { answer: 'ALREADY_SAVED', id: collection.id },
        { answer: 'ALREADY_SAVED', id: disposal.id },
      ]);
      expect(await tx.fieldEvent.count({ where: { projectId: p.projectId } })).toBe(2);
      expect(await tx.quarantinedRecord.count({ where: { projectId: p.projectId } })).toBe(0);
      expect(await jobsOf(tx, p.projectId)).toEqual(jobs);
      const [firstSync, secondSync] = await syncsOf(tx, p.phone.id);
      // Each call is a sync of its own; the ledger still names the one that brought each.
      expect((await ledgerOf(tx, p.phone.id)).map(([, , syncId]) => syncId)).toEqual([
        firstSync?.id,
        firstSync?.id,
      ]);
      expect(secondSync?.id).not.toBe(firstSync?.id);

      // AC-05-17: the tower scans 101020 a second time, a record with an id of its own.
      const second = p.disposal({
        ticketNumber: '101020',
        startedAt: '2026-10-12T15:40:00.000Z',
        endedAt: '2026-10-12T15:44:00.000Z',
      });
      const next = p.event({ ticketNumber: '101021' });
      const more = p.sync({
        records: [
          { record: 'FIELD_EVENT', fieldEvent: second },
          { record: 'FIELD_EVENT', fieldEvent: disposal },
          { record: 'FIELD_EVENT', fieldEvent: next },
        ],
      });
      const quarantined = {
        answer: 'QUARANTINED',
        id: second.id,
        reason: 'DUPLICATE_FIELD_EVENT',
        message:
          'Ticket 101020: this ticket already has a disposal. Not saved: kept in quarantine for review.',
        heldBy: disposal.id,
      };
      const expected = [
        quarantined,
        { answer: 'ALREADY_SAVED', id: disposal.id },
        { answer: 'SAVED', id: next.id, notes: [] },
      ];
      expect((await synced(served, p.token, more)).records).toEqual(expected);
      const [, , thirdSync] = await syncsOf(tx, p.phone.id);
      const ledger = await ledgerOf(tx, p.phone.id);
      expect(ledger.find(([id]) => id === second.id)).toEqual([
        second.id,
        'FIELD_EVENT',
        thirdSync?.id,
        'QUARANTINED',
      ]);
      // A quarantined record queues nothing: the worker never reads it. The collection of
      // 101021 names 101020 too: one truck loading both at once, each reads the other.
      expect(await jobsOf(tx, p.projectId)).toEqual([
        ...jobs,
        [null, 'LOAD 101020', 'LOAD 101021'],
      ]);

      // Sent again, it is the same quarantined record, still not saved, and nothing is added.
      expect((await synced(served, p.token, more)).records).toEqual([
        quarantined,
        { answer: 'ALREADY_SAVED', id: disposal.id },
        { answer: 'ALREADY_SAVED', id: next.id },
      ]);
      expect(await tx.quarantinedRecord.count({ where: { projectId: p.projectId } })).toBe(1);
      expect(await ledgerOf(tx, p.phone.id)).toEqual(ledger);
      expect(await heldOf(tx, p.phone.id)).toEqual([]);
    });
  });
});

describe('what could not be saved is held for a person', () => {
  it('AC-05-45, AC-10-37, ADR-468 what stands in a record’s place and can’t be read is answered “not saved” with plain words, held exactly as sent, once however often it is sent, and never stops the record beside it', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const good = p.event({ ticketNumber: '101030' });
      const overfull = p.disposal({ ticketNumber: '101030', loadCall: 140 });
      const sent = {
        ...p.sync(),
        records: [
          { record: 'FIELD_EVENT', fieldEvent: overfull },
          'not a record',
          null,
          { record: 'FIELD_EVENT', fieldEvent: good },
        ],
      };
      const answer = await send(served, p.token, sent);
      expect(told(answer)).toEqual([200, undefined]);
      const { records } = syncAnsweredSchema.parse(answer.body);
      expect(records.map((record) => [record.answer, record.id])).toEqual([
        ['NOT_SAVED', overfull.id],
        ['NOT_SAVED', null],
        ['NOT_SAVED', null],
        ['SAVED', good.id],
      ]);
      const [unread] = records;
      if (unread?.answer !== 'NOT_SAVED') throw new Error('Saved.');
      expect([unread.reason, unread.message]).toEqual([
        'NOT_A_RECORD',
        `Not saved: this record can’t be read: fieldEvent.loadCall in this record can’t be more than 100.${held}`,
      ]);
      expect(unread.message).not.toContain('140');
      expect(await tx.fieldEvent.count({ where: { projectId: p.projectId } })).toBe(1);

      const [sync] = await syncsOf(tx, p.phone.id);
      const kept = await heldOf(tx, p.phone.id);
      expect(
        kept.map((one) => [
          one.syncId,
          one.sentId,
          one.projectId,
          one.sentMonitorId,
          one.payload,
          one.sentSha256,
          one.reason,
          one.message.endsWith(held),
          one.receivedAt,
          one.resolvedById,
        ]),
      ).toEqual([
        [
          sync?.id,
          overfull.id,
          p.projectId,
          who.kim,
          { record: 'FIELD_EVENT', fieldEvent: overfull },
          sentFingerprint({ record: 'FIELD_EVENT', fieldEvent: overfull }),
          'NOT_A_RECORD',
          true,
          mondayAfternoon,
          null,
        ],
        [
          sync?.id,
          null,
          null,
          null,
          'not a record',
          sentFingerprint('not a record'),
          'NOT_A_RECORD',
          true,
          mondayAfternoon,
          null,
        ],
        [
          sync?.id,
          null,
          null,
          null,
          null,
          sentFingerprint(null),
          'NOT_A_RECORD',
          true,
          mondayAfternoon,
          null,
        ],
      ]);
      // Held as the phone's own act; the audit log says one was made and holds no second copy
      // of what was sent.
      const [made] = await tx.auditRecord.findMany({
        where: { tableName: 'held_record', recordId: kept[0]?.id ?? '' },
      });
      expect([made?.operation, made?.actorId, made?.source, made?.deviceId]).toEqual([
        'INSERT',
        deviceKeyActorId,
        'DEVICE',
        p.phone.id,
      ]);
      expect((made?.newValue as { payload?: unknown }).payload).toBe('[kept out of the audit]');
      // No ledger row for what wasn't stored, and nothing queued for it.
      expect((await ledgerOf(tx, p.phone.id)).map(([id]) => id)).toEqual([good.id]);
      // The log never repeats a record, or what one that couldn't be read was told.
      const logged = served.lines.join('\n');
      expect(logged).toContain('"records":{"NOT_SAVED":3,"SAVED":1}');
      expect(logged).not.toContain('loadCall');
      expect(logged).not.toContain(overfull.id);

      // The phone keeps what was not saved and sends it again, its fields in another order:
      // the same three held records, and nothing more.
      const reordered = Object.fromEntries(Object.entries(overfull).reverse());
      const again = await send(served, p.token, {
        ...p.sync(),
        records: [{ fieldEvent: reordered, record: 'FIELD_EVENT' }, 'not a record', null],
      });
      expect(
        syncAnsweredSchema.parse(again.body).records.map((record) => [record.answer, record.id]),
      ).toEqual([
        ['NOT_SAVED', overfull.id],
        ['NOT_SAVED', null],
        ['NOT_SAVED', null],
      ]);
      expect((await heldOf(tx, p.phone.id)).map((one) => one.id)).toEqual(
        kept.map((one) => one.id),
      );
      // Anything changed is another thing sent, and is held too.
      await send(served, p.token, { ...p.sync(), records: ['not a record either'] });
      expect(await tx.heldRecord.count({ where: { deviceId: p.phone.id } })).toBe(4);
    });
  });

  it('AC-05-51, AC-10-41, ADR-504 a sync of a mebibyte is read whole and one a byte heavier is refused before it is read, so no phone sends one; a record heavier than a record may be is answered “not saved” under its id and held for a person, never left on the phone to be refused at every try, and the record beside it is saved', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const good = p.event({ ticketNumber: '101031' });
      // Kim's survey, its own answers past what a record may weigh: four hundred thousand
      // characters a monitor could not type at the curb, but that the answers' bounds allow.
      const [, , , , example] = syncExamples.records;
      if (example?.record !== 'SURVEY') throw new Error('The fifth example is no survey.');
      const answers = Object.fromEntries(
        Array.from({ length: 100 }, (_, index) => [`answer-${String(index)}`, 'x'.repeat(4000)]),
      );
      const survey = {
        record: 'SURVEY',
        survey: {
          ...example.survey,
          id: randomUUID(),
          projectId: p.projectId,
          monitorId: who.kim,
          assignmentId: p.assignment.id,
          answers,
        },
      } as const;
      expect(sentWeight(survey)).toBeGreaterThan(syncedRecordBytesAtMost);
      // What stands after them makes the sync weigh exactly what a sync may.
      const weighed = (extra: number) => {
        const sent = {
          ...p.sync(),
          records: [survey, { record: 'FIELD_EVENT', fieldEvent: good }, ''],
        };
        const filler = 'y'.repeat(syncBytesAtMost - sentWeight(sent) + extra);
        return { ...sent, records: [survey, { record: 'FIELD_EVENT', fieldEvent: good }, filler] };
      };
      expect(sentWeight(weighed(0))).toBe(syncBytesAtMost);
      expect(syncBytesAtMost).toBe(shippedPolicy.requestBodyLimitBytes);

      const heavier = await send(served, p.token, weighed(1));
      expect(told(heavier)).toEqual([413, 'TOO_LARGE']);
      expect(await syncsOf(tx, p.phone.id)).toEqual([]);

      const answer = await send(served, p.token, weighed(0));
      expect(told(answer)).toEqual([200, undefined]);
      const { records } = syncAnsweredSchema.parse(answer.body);
      expect(records.map((record) => [record.answer, record.id])).toEqual([
        ['NOT_SAVED', survey.survey.id],
        ['SAVED', good.id],
        ['NOT_SAVED', null],
      ]);
      const [unread] = records;
      if (unread?.answer !== 'NOT_SAVED') throw new Error('Saved.');
      expect([unread.reason, unread.message]).toEqual([
        'NOT_A_RECORD',
        `Not saved: this record can’t be read: it weighs more than a record may, 256 KiB as sent.${held}`,
      ]);
      expect(
        (await heldOf(tx, p.phone.id)).map((one) => [
          one.sentId,
          one.projectId,
          one.sentMonitorId,
          one.reason,
          sentWeight(one.payload),
        ]),
      ).toEqual([
        [survey.survey.id, p.projectId, who.kim, 'NOT_A_RECORD', sentWeight(survey)],
        [null, null, null, 'NOT_A_RECORD', sentWeight(weighed(0).records[2])],
      ]);
      expect((await ledgerOf(tx, p.phone.id)).map(([id]) => id)).toEqual([good.id]);
    });
  });

  it('C122, C126, C128 the phone’s reports go first, each through its own service: a record made under an unplanned assignment that was not saved is not tried, and is held; one made under an assignment the same sync saved is saved', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const setUp = {
        ...syncExamples.unplanned,
        id: randomUUID(),
        projectId: p.projectId,
        personId: who.kim,
        siteId: null,
      };
      // A project the server doesn't have: the assignment made under it can't be kept.
      const nowhere = { ...setUp, id: randomUUID(), projectId: randomUUID() };
      const switched = { ...syncExamples.switched, id: randomUUID(), personId: who.kim };
      const under = p.disposal({ ticketNumber: '101040', assignmentId: setUp.id });
      const lost = p.disposal({ ticketNumber: '101041', assignmentId: nowhere.id });
      const sent = p.sync({
        unplannedAssignments: [nowhere, setUp],
        passcodeUses: [switched],
        records: [
          { record: 'FIELD_EVENT', fieldEvent: lost },
          { record: 'FIELD_EVENT', fieldEvent: under },
        ],
      });
      const answered = await synced(served, p.token, sent);
      expect(answered.unplannedAssignments).toEqual([
        { assignmentId: nowhere.id, answer: 'NOT_SAVED', reason: 'UNKNOWN_PROJECT' },
        { assignmentId: setUp.id, answer: 'SAVED', reason: null },
      ]);
      expect(answered.passcodeUses).toEqual([
        { useId: switched.id, answer: 'SAVED', reason: null },
      ]);
      expect(answered.records).toEqual([
        {
          answer: 'NOT_SAVED',
          id: lost.id,
          reason: 'ASSIGNMENT_NOT_SAVED',
          message: `Not saved: the assignment this record was made under was not saved.${held}`,
        },
        { answer: 'SAVED', id: under.id, notes: [] },
      ]);
      const made = await tx.assignment.findUniqueOrThrow({ where: { id: setUp.id } });
      expect([made.origin, made.deviceId, made.personId]).toEqual([
        'UNPLANNED',
        p.phone.id,
        who.kim,
      ]);
      expect(await tx.securityEvent.count({ where: { id: switched.id } })).toBe(1);
      expect(
        (await tx.fieldEvent.findMany({ where: { projectId: p.projectId } })).map(({ id }) => id),
      ).toEqual([under.id]);
      // The report answered “not saved” is held too, first, as it came, with no project the
      // server has (ADR-526 (5)); then the record made under it.
      const [report, kept, ...others] = await heldOf(tx, p.phone.id);
      expect(others).toEqual([]);
      expect([
        report?.sentId,
        report?.projectId,
        report?.sentMonitorId,
        report?.reason,
        report?.message,
        report?.syncId === kept?.syncId,
        report?.payload,
      ]).toEqual([
        nowhere.id,
        nowhere.projectId,
        who.kim,
        'REPORT_NOT_SAVED',
        `Not saved: this unplanned assignment names a project the server doesn’t have.${held}`,
        true,
        nowhere,
      ]);
      expect([kept?.sentId, kept?.projectId, kept?.sentMonitorId, kept?.reason]).toEqual([
        lost.id,
        p.projectId,
        who.kim,
        'ASSIGNMENT_NOT_SAVED',
      ]);
      // Sent again, each is known: nothing is written twice.
      const again = await synced(served, p.token, sent);
      expect(again.unplannedAssignments.map(({ answer }) => answer)).toEqual([
        'NOT_SAVED',
        'ALREADY_SAVED',
      ]);
      expect(again.passcodeUses.map(({ answer }) => answer)).toEqual(['ALREADY_SAVED']);
      expect(again.records.map(({ answer }) => answer)).toEqual(['NOT_SAVED', 'ALREADY_SAVED']);
      expect(await tx.heldRecord.count({ where: { deviceId: p.phone.id } })).toBe(2);
    });
  });

  it('C69, C128 a record that names something the server doesn’t have is refused by the database’s own constraints: it is answered “not saved” in plain words, never an error and never the database’s, and held; the record beside it is saved', async () => {
    await world(async (served, tx, who, within) => {
      const p = await kimOnP1(served, tx, who);
      // In the process each record is its own piece of work, so the database's refusal undoes
      // that record alone. A test's whole work is one piece: here each write stands behind a
      // savepoint, which is what a piece of work of its own comes to.
      const each = {
        ...within,
        $read: within.$read,
        $write: async <T>(actor: Actor, work: (inner: Tx) => Promise<T>): Promise<T> => {
          await tx.$executeRaw`SAVEPOINT one_piece_of_work`;
          try {
            const done = await within.$write(actor, work);
            await tx.$executeRaw`RELEASE SAVEPOINT one_piece_of_work`;
            return done;
          } catch (error) {
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT one_piece_of_work`;
            throw error;
          }
        },
      } as unknown as Database;
      const requestNow = (): undefined => undefined;
      const { clock } = served;
      const sync = new Sync(each, {
        intake: new Intake(each, clock, shippedPolicy),
        certifications: new Certifications(each, clock, shippedPolicy),
        unplanned: new UnplannedAssignments(each, { clock, requestNow }),
        uses: new PasscodeUses(each, { clock, requestNow }),
        numbers: new NumberAllocator(each, clock, shippedPolicy),
        loginList: new PhoneLoginList(each, {
          assignments: new PhoneAssignments(each),
          offline: new OfflineChecks(sealingKey),
          clock,
          entriesPerCall: shippedPolicy.loginListEntriesPerCall,
        }),
        held: new HeldThings(each, clock),
        clock,
      });
      // A project nobody set up, a site that is no site of P1's, and a real load between them.
      const elsewhere = p.event({ ticketNumber: '101050', projectId: randomUUID() });
      const good = p.event({ ticketNumber: '101051' });
      const noSite = p.disposal({ ticketNumber: '101051', siteId: randomUUID() });
      const sent = p.sync({
        records: [
          { record: 'FIELD_EVENT', fieldEvent: elsewhere },
          { record: 'FIELD_EVENT', fieldEvent: good },
          { record: 'FIELD_EVENT', fieldEvent: noSite },
        ],
      });
      const { answered } = await sync.received(inService(p.phone.id), syncSentSchema.parse(sent));
      expect(syncAnswerRead(sent, answered)).not.toBeNull();
      const message = `Not saved: this record names something the server doesn’t have: its project, its monitor, its assignment, or something picked from a list.${held}`;
      expect(answered.records).toEqual([
        { answer: 'NOT_SAVED', id: elsewhere.id, reason: 'NAMES_NO_RECORD', message },
        { answer: 'SAVED', id: good.id, notes: [] },
        { answer: 'NOT_SAVED', id: noSite.id, reason: 'NAMES_NO_RECORD', message },
      ]);
      expect(
        (
          await tx.fieldEvent.findMany({
            where: { id: { in: [elsewhere.id, good.id, noSite.id] } },
          })
        ).map(({ id }) => id),
      ).toEqual([good.id]);
      expect((await ledgerOf(tx, p.phone.id)).map(([id]) => id)).toEqual([good.id]);
      // The project is only what the record said: it names nothing, and is kept as sent.
      expect(
        (await heldOf(tx, p.phone.id)).map((one) => [one.sentId, one.projectId, one.reason]),
      ).toEqual([
        [elsewhere.id, elsewhere.projectId, 'NAMES_NO_RECORD'],
        [noSite.id, p.projectId, 'NAMES_NO_RECORD'],
      ]);
    });
  });
});

describe('a phone’s daily budget of held records (ADR-546)', () => {
  it('AC-10-113 a phone that makes the server hold more in a day than the firm’s budget is still received and held, record by record; once a day it is a security event, every admin is told by mail, never what was sent, and the phones list marks it', async () => {
    await world(async (served, tx, who, within) => {
      const p = await kimOnP1(served, tx, who);
      const outbox = new Outbox();
      const held = new HeldThings(within, served.clock, {
        bytesPerDay: shippedPolicy.phoneHeldBytesPerDay,
        recordsPerDay: 2,
        mail: outbox,
      });
      // A report sent to its own endpoint, held with no sync (ADR-526 (5)).
      const notice = {
        reason: 'REPORT_NOT_SAVED',
        message: 'Not saved: the server couldn’t keep this report.',
      } as const;
      const names = { id: null, projectId: null, monitorId: null };
      for (let each = 1; each <= 4; each += 1) {
        await held.held(p.phone.id, null, { garbage: `sent ${String(each)}` }, notice, names);
      }
      // The same thing again is the same held record, and counts nothing more.
      await held.held(p.phone.id, null, { garbage: 'sent 4' }, notice, names);
      const kept = await heldOf(tx, p.phone.id);
      expect(kept.map(({ sentBytes }) => sentBytes)).toEqual([20, 20, 20, 20]);
      const passed = await tx.securityEvent.findMany({
        where: { deviceId: p.phone.id, kind: 'PHONE_HELD_BUDGET_PASSED' },
      });
      expect(passed).toHaveLength(1);
      expect(outbox.sent.map(({ to, subject }) => [to, subject])).toEqual([
        [danasEmail, 'The phone P1-COL-1 is sending more than it should'],
      ]);
      expect(outbox.sent[0]?.text).toContain('3 records');
      expect(outbox.sent[0]?.text).not.toContain('garbage');
      // A day later the count starts again.
      served.clock.later(24 * 60 + 1);
      for (let each = 5; each <= 7; each += 1) {
        await held.held(p.phone.id, null, { garbage: `sent ${String(each)}` }, notice, names);
      }
      expect(
        await tx.securityEvent.count({
          where: { deviceId: p.phone.id, kind: 'PHONE_HELD_BUDGET_PASSED' },
        }),
      ).toBe(2);
      // Dana, signed in again a day later, reads the phones list.
      const dana = await served.signedIn(danasEmail, long);
      const phones = await ask(served, dana, listPhonesEndpoint, { query: '?limit=200' });
      expect(
        listPhonesEndpoint.answer.parse(phones.body).phones.find(({ id }) => id === p.phone.id)
          ?.heldBudgetPassedAt,
      ).toBe(served.clock.now().toISOString());
    });
  });
});

describe('a certification made on a phone', () => {
  it('C129, ADR-469 Kim certifies Rivera’s self-loader as 730416: it is made by certify with its row in the ledger and its job; sent again it is already saved; another certification with its number, and a crew with a box, are not saved, told why, and held', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      // The example world's 730416, with what this test's world has: its dog box typed.
      const certification: SyncedCertification = {
        ...syncExamples.certification,
        id: randomUUID(),
        projectId: p.projectId,
        primeId: p.priced.coastline,
        vehicleTypeId: null,
        vehicleTypeOther: 'Self-loader',
        certifiedById: who.kim,
        assignmentId: p.assignment.id,
        helperIds: [],
        boxes: syncExamples.certification.boxes.map((box, position) => ({
          ...box,
          featureId: null,
          featureOther: position === 0 ? null : 'Dog box',
        })),
      };
      const first = await synced(
        served,
        p.token,
        p.sync({ records: [{ record: 'CERTIFICATION', certification }] }),
      );
      expect(first.records).toEqual([{ answer: 'SAVED', id: certification.id, notes: [] }]);
      const made = await tx.certification.findUniqueOrThrow({ where: { id: certification.id } });
      expect([made.certNumber, made.deviceId, made.certifiedById, made.capacityCy]).toEqual([
        '730416',
        p.phone.id,
        who.kim,
        48,
      ]);
      const [sync] = await syncsOf(tx, p.phone.id);
      expect(await ledgerOf(tx, p.phone.id)).toEqual([
        [certification.id, 'CERTIFICATION', sync?.id, 'SAVED'],
      ]);
      // With no ticket on its number, a job that names none: its own flags are the run's.
      expect(await jobsOf(tx, p.projectId)).toEqual([[null]]);

      const copy = { ...certification, id: randomUUID() };
      const crew = {
        ...certification,
        id: randomUUID(),
        certNumber: '730417',
        kind: 'CREW' as const,
      };
      const next = await synced(
        served,
        p.token,
        p.sync({
          records: [
            { record: 'CERTIFICATION', certification },
            { record: 'CERTIFICATION', certification: copy },
            { record: 'CERTIFICATION', certification: crew },
          ],
        }),
      );
      expect(next.records).toEqual([
        { answer: 'ALREADY_SAVED', id: certification.id },
        {
          answer: 'NOT_SAVED',
          id: copy.id,
          reason: 'CERTIFICATION_REFUSED',
          message: `Not saved: this project already has a certification ${certification.certNumber}.${held}`,
        },
        {
          answer: 'NOT_SAVED',
          id: crew.id,
          reason: 'CERTIFICATION_REFUSED',
          message: `Not saved: A crew is not measured: it has no boxes and no capacity.${held}`,
        },
      ]);
      expect(await tx.certification.count({ where: { projectId: p.projectId } })).toBe(1);
      expect(
        (await heldOf(tx, p.phone.id)).map((one) => [one.sentId, one.sentMonitorId, one.reason]),
      ).toEqual([
        [copy.id, who.kim, 'CERTIFICATION_REFUSED'],
        [crew.id, who.kim, 'CERTIFICATION_REFUSED'],
      ]);
      // The driver's licence number is in no log (ASVS V16).
      const licence = certification.driverLicenceNumber;
      if (licence !== null) expect(served.lines.join('\n')).not.toContain(licence);
    });
  });
});

// A photograph Kim's phone took of one of its records, under an id of the phone's own.
const photoOf = (
  p: { readonly projectId: string },
  who: People,
  owner: SyncedPhoto['owner'],
  more: Partial<SyncedPhoto> = {},
): SyncedPhoto => ({
  ...syncExamples.pilePhoto,
  id: randomUUID(),
  projectId: p.projectId,
  owner,
  takenById: who.kim,
  ...more,
});

describe('a photograph’s record', () => {
  it('AC-05-05, ADR-481 Kim’s collection and its photograph in one sync, the photograph after: the server makes where its file is kept and the phone names none; both fingerprints are as the phone said them; it joins the ledger and queues its ticket; sent again changed it is already saved and nothing moves', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const collection = p.event({ ticketNumber: '101030' });
      const photo = photoOf(p, who, { kind: 'FIELD_EVENT', id: collection.id });
      const first = await synced(
        served,
        p.token,
        p.sync({ records: [{ record: 'FIELD_EVENT', fieldEvent: collection }], photos: [photo] }),
      );
      expect([first.records, first.photos]).toEqual([
        [{ answer: 'SAVED', id: collection.id, notes: [] }],
        [{ answer: 'SAVED', id: photo.id, notes: [] }],
      ]);
      // Where its file is kept is never in the answer.
      expect(JSON.stringify(first)).not.toContain('projects/');
      const stored = () => tx.photo.findUniqueOrThrow({ where: { id: photo.id } });
      const kept = await stored();
      expect([
        kept.fieldEventId,
        kept.view,
        kept.deviceId,
        kept.capturedAt,
        kept.originalSha256,
        kept.uploadedSha256,
        kept.objectKey,
        kept.depthObjectKey,
        kept.uploadedAt,
        kept.receivedAt,
      ]).toEqual([
        collection.id,
        null,
        p.phone.id,
        new Date(photo.capturedAt),
        photo.originalSha256,
        photo.uploadedSha256,
        `projects/${p.projectId}/photos/${photo.id}`,
        null,
        null,
        mondayAfternoon,
      ]);
      expect(isMediaKey(kept.objectKey)).toBe(true);
      const [sync] = await syncsOf(tx, p.phone.id);
      expect(await ledgerOf(tx, p.phone.id)).toEqual(
        [
          [collection.id, 'FIELD_EVENT', sync?.id, 'SAVED'],
          [photo.id, 'PHOTO', sync?.id, 'SAVED'],
        ].sort(([a = ''], [b = '']) => a.localeCompare(b)),
      );
      const [written] = await tx.auditRecord.findMany({
        where: { tableName: 'photo', recordId: photo.id },
      });
      expect([written?.actorId, written?.source, written?.deviceId]).toEqual([
        who.kim,
        'DEVICE',
        p.phone.id,
      ]);
      // Its ticket again: a pay item may require a photograph.
      expect(await jobsOf(tx, p.projectId)).toEqual([
        [null, 'LOAD 101030'],
        [null, 'LOAD 101030'],
      ]);
      const logged = served.lines.filter((line) => line.includes('A phone synced.')).join('\n');
      expect(logged).toContain('"photos":{"SAVED":1}');
      expect(logged).not.toContain(photo.id);

      // Sent again with other fingerprints: what the server has stands (ADR-477).
      const audited = await tx.auditRecord.count({ where: { tableName: 'photo' } });
      const again = await synced(
        served,
        p.token,
        p.sync({
          photos: [{ ...photo, originalSha256: 'b'.repeat(64), uploadedSha256: 'c'.repeat(64) }],
        }),
      );
      expect(again.photos).toEqual([{ answer: 'ALREADY_SAVED', id: photo.id }]);
      expect(await stored()).toEqual(kept);
      expect(await tx.auditRecord.count({ where: { tableName: 'photo' } })).toBe(audited);
      expect(await jobsOf(tx, p.projectId)).toHaveLength(2);
    });
  });

  it('ADR-481, 526, C129 a photograph whose record is held is kept with it, saved; one whose record the server has nowhere is not tried: answered “not saved”, told why and held; sent again once its record is saved, it is saved; one of a record kept in quarantine belongs to the quarantined record', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      // A disposal whose load call can't be one: held for a person.
      const wrong = p.disposal({ ticketNumber: '101031', loadCall: 150 });
      const ofWrong = photoOf(p, who, { kind: 'FIELD_EVENT', id: wrong.id });
      const later = p.event({ ticketNumber: '101032' });
      const ofLater = photoOf(p, who, { kind: 'FIELD_EVENT', id: later.id });
      const ownerNotSaved = {
        answer: 'NOT_SAVED',
        reason: 'OWNER_NOT_SAVED',
        message: `Not saved: the record this photograph belongs to isn’t saved on the server.${held}`,
      };
      const first = await synced(
        served,
        p.token,
        p.sync({
          records: [{ record: 'FIELD_EVENT', fieldEvent: wrong }],
          photos: [ofWrong, ofLater],
        }),
      );
      expect(first.records.map(({ answer }) => answer)).toEqual(['NOT_SAVED']);
      expect(first.photos).toEqual([
        { answer: 'SAVED', id: ofWrong.id, notes: [] },
        { ...ownerNotSaved, id: ofLater.id },
      ]);
      const heldNow = await heldOf(tx, p.phone.id);
      expect(
        heldNow.map((one) => [one.sentId, one.projectId, one.sentMonitorId, one.reason]),
      ).toEqual([
        [wrong.id, p.projectId, who.kim, 'NOT_A_RECORD'],
        [ofLater.id, p.projectId, who.kim, 'OWNER_NOT_SAVED'],
      ]);
      // Kept with the record held for a person, its files to come as any photograph's do.
      const withHeld = await tx.photo.findMany({ where: { projectId: p.projectId } });
      expect(
        withHeld.map((one) => [one.id, one.heldRecordId, one.fieldEventId, one.deviceId]),
      ).toEqual([[ofWrong.id, heldNow[0]?.id, null, p.phone.id]]);
      expect(await ledgerOf(tx, p.phone.id)).toEqual([
        [ofWrong.id, 'PHOTO', (await syncsOf(tx, p.phone.id))[0]?.id, 'SAVED'],
      ]);

      // Its record arrives; the photograph sent again is saved, and the held one stays for a
      // person to close.
      const second = await synced(
        served,
        p.token,
        p.sync({ records: [{ record: 'FIELD_EVENT', fieldEvent: later }], photos: [ofLater] }),
      );
      expect(second.photos).toEqual([{ answer: 'SAVED', id: ofLater.id, notes: [] }]);
      expect(await tx.heldRecord.count({ where: { deviceId: p.phone.id } })).toBe(2);

      // A second collection on 101032 waits in quarantine; its photograph is the quarantined
      // record's, and nothing else's.
      const second101032 = p.event({ ticketNumber: '101032' });
      const ofSecond = photoOf(p, who, { kind: 'FIELD_EVENT', id: second101032.id });
      const third = await synced(
        served,
        p.token,
        p.sync({
          records: [{ record: 'FIELD_EVENT', fieldEvent: second101032 }],
          photos: [ofSecond],
        }),
      );
      expect([third.records[0]?.answer, third.photos]).toEqual([
        'QUARANTINED',
        [{ answer: 'SAVED', id: ofSecond.id, notes: [] }],
      ]);
      const kept = await tx.photo.findUniqueOrThrow({ where: { id: ofSecond.id } });
      expect([kept.quarantinedRecordId, kept.fieldEventId]).toEqual([second101032.id, null]);

      // A photograph of a record of another kind than it says, and one with a view that is no
      // certification's: neither is tried.
      const asRoe = photoOf(p, who, { kind: 'ROE', id: later.id });
      const withView = photoOf(p, who, { kind: 'FIELD_EVENT', id: later.id }, { view: 'LEFT' });
      const withPlace = {
        ...photoOf(p, who, { kind: 'FIELD_EVENT', id: later.id }),
        objectKey: 'x',
      };
      const fourth = await synced(
        served,
        p.token,
        p.sync({ photos: [asRoe, withView, withPlace] }),
      );
      expect(
        fourth.photos.map((one) => [one.id, 'reason' in one ? one.reason : one.answer]),
      ).toEqual([
        [asRoe.id, 'OWNER_NOT_SAVED'],
        [withView.id, 'NOT_A_RECORD'],
        [withPlace.id, 'NOT_A_RECORD'],
      ]);
      expect(fourth.photos.slice(1).map((one) => ('message' in one ? one.message : ''))).toEqual([
        `Not saved: this record can’t be read: view in this record isn’t taken as it stands.${held}`,
        `Not saved: this record can’t be read: this record has a field this request doesn’t take.${held}`,
      ]);
    });
  });

  it('C82, AC-04-77, ADR-179 Kim certifies 730416 and sends its five photographs after it in the same sync: each names its view, one with a depth file beside it; each is in the ledger, and the run is asked to look at the certifications again', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const certification: SyncedCertification = {
        ...syncExamples.certification,
        id: randomUUID(),
        projectId: p.projectId,
        primeId: p.priced.coastline,
        vehicleTypeId: null,
        vehicleTypeOther: 'Self-loader',
        certifiedById: who.kim,
        assignmentId: p.assignment.id,
        helperIds: [],
        boxes: syncExamples.certification.boxes.map((box, position) => ({
          ...box,
          featureId: null,
          featureOther: position === 0 ? null : 'Dog box',
        })),
      };
      const five = syncExamples.certificationPhotos.map((photo) =>
        photoOf(
          p,
          who,
          { kind: 'CERTIFICATION', id: certification.id },
          {
            view: photo.view,
            depthSha256: photo.depthSha256,
          },
        ),
      );
      const answered = await synced(
        served,
        p.token,
        p.sync({ records: [{ record: 'CERTIFICATION', certification }], photos: five }),
      );
      expect(answered.photos).toEqual(five.map(({ id }) => ({ answer: 'SAVED', id, notes: [] })));
      const kept = await tx.photo.findMany({
        where: { certificationId: certification.id },
        orderBy: { id: 'asc' },
      });
      expect(
        kept.map((photo) => [photo.view, photo.objectKey, photo.depthObjectKey, photo.depthSha256]),
      ).toEqual(
        [...five]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((photo) => [
            photo.view,
            `projects/${p.projectId}/photos/${photo.id}`,
            photo.depthSha256 === null ? null : `projects/${p.projectId}/photos/${photo.id}.depth`,
            photo.depthSha256,
          ]),
      );
      for (const photo of kept) {
        expect(isMediaKey(photo.objectKey)).toBe(true);
        if (photo.depthObjectKey !== null) expect(isMediaKey(photo.depthObjectKey)).toBe(true);
      }
      expect((await ledgerOf(tx, p.phone.id)).filter(([, kind]) => kind === 'PHOTO')).toHaveLength(
        5,
      );
      // The certification's own job, then one a photograph: the run checks its views by themselves.
      expect(await jobsOf(tx, p.projectId)).toEqual([
        [null],
        [null],
        [null],
        [null],
        [null],
        [null],
      ]);
    });
  });
});

describe('the numbers a phone holds', () => {
  it('AC-05-47, C64 a phone reports the last number it used of a series and is topped up to a full block; a series its project doesn’t have is not topped up, and stops nothing', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const load = { projectId: p.projectId, series: 'LOAD' as const };
      const elsewhere = { projectId: randomUUID(), series: 'LOAD' as const };
      const first = await synced(
        served,
        p.token,
        p.sync({
          lastUsed: [
            { ...elsewhere, lastUsedNumber: null },
            { ...load, lastUsedNumber: null },
          ],
        }),
      );
      const [none, held] = first.numbers;
      expect(none).toEqual({ ...elsewhere, toppedUp: false, blocks: [] });
      const [block, ...others] = held?.blocks ?? [];
      if (block === undefined) throw new Error('No block was cut.');
      expect(others).toEqual([]);
      expect([
        held?.toppedUp,
        block.lastNumber - block.firstNumber + 1,
        block.lastUsedNumber,
      ]).toEqual([true, 1000, null]);
      // A block is the phone's own: cut as its device key's actor, whoever is signed in.
      const cut = await tx.numberBlock.findFirstOrThrow({ where: { deviceId: p.phone.id } });
      const [written] = await tx.auditRecord.findMany({
        where: { tableName: 'number_block', recordId: cut.id, operation: 'INSERT' },
      });
      expect([written?.actorId, written?.source, written?.deviceId]).toEqual([
        deviceKeyActorId,
        'DEVICE',
        p.phone.id,
      ]);

      // Six numbers used: topped up to a thousand unused again, however few it used.
      const lastUsedNumber = block.firstNumber + 5;
      const next = await synced(
        served,
        p.token,
        p.sync({ lastUsed: [{ ...load, lastUsedNumber }] }),
      );
      const [now] = next.numbers;
      expect(now?.toppedUp).toBe(true);
      expect(now?.blocks.map((each) => each.lastUsedNumber)).toEqual([lastUsedNumber, null]);
      expect(
        (now?.blocks ?? []).reduce(
          (sum, each) =>
            sum + each.lastNumber - Math.max(each.firstNumber - 1, each.lastUsedNumber ?? 0),
          0,
        ),
      ).toBe(1000);
    });
  });
});

describe('AC-10-88 a phone taken out of service only sends (ADR-065, 134, 473, 531)', () => {
  it('its records are saved, and each series it reports is answered with the blocks it holds, never topped up; it is brought no check of the passcode and no setup version, whatever version it holds; the database cuts it no block', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const load = { projectId: p.projectId, series: 'LOAD' as const };
      const first = await synced(
        served,
        p.token,
        p.sync({ lastUsed: [{ ...load, lastUsedNumber: null }] }),
      );
      const [held] = first.numbers;
      expect(held?.toppedUp).toBe(true);
      saved(
        removePhoneEndpoint,
        await ask(served, p.dana, removePhoneEndpoint, {
          ids: { deviceId: p.phone.id },
          payload: { status: 'LOST' },
        }),
      );
      const collection = p.event();
      const used = (held?.blocks[0]?.firstNumber ?? 0) + 999;
      const sent = p.sync({
        records: [{ record: 'FIELD_EVENT', fieldEvent: collection }],
        lastUsed: [{ ...load, lastUsedNumber: used }],
        holds: { masterPasscodeVersion: null, listsProjectId: p.projectId },
      });
      const answered = await synced(served, p.token, sent);
      expect(answered.records).toEqual([{ answer: 'SAVED', id: collection.id, notes: [] }]);
      expect(answered.numbers).toEqual([{ ...load, toppedUp: false, blocks: held?.blocks }]);
      expect([answered.masterPasscode, answered.setupVersion]).toEqual([null, null]);
      expect(await tx.numberBlock.count({ where: { deviceId: p.phone.id } })).toBe(1);
      // Its report is not taken: the block's last used number stays as the server had it.
      const block = await tx.numberBlock.findFirstOrThrow({ where: { deviceId: p.phone.id } });
      expect([block.status, block.lastUsedNumber]).toEqual(['ISSUED', null]);
    });
  });

  it('a top-up asked of a phone marked out of service meanwhile is not taken, under the lock its row is read with (the database refuses its block too: packages/db)', async () => {
    await world(async (served, tx, who, within) => {
      const p = await kimOnP1(served, tx, who);
      const load = { projectId: p.projectId, series: 'LOAD' as const };
      await synced(served, p.token, p.sync({ lastUsed: [{ ...load, lastUsedNumber: null }] }));
      saved(
        removePhoneEndpoint,
        await ask(served, p.dana, removePhoneEndpoint, {
          ids: { deviceId: p.phone.id },
          payload: { status: 'RETIRED' },
        }),
      );
      const allocator = new NumberAllocator(within, served.clock, shippedPolicy);
      const outcome = await allocator.topUp(
        { person: deviceKeyActorId, deviceId: p.phone.id },
        { ...load, lastUsedNumber: null },
      );
      expect(outcome.saved ? 'saved' : outcome.refusal.code).toBe('PHONE_OUT_OF_SERVICE');
    });
  });
});

describe('a top-up that loses the race for its series', () => {
  it('AC-05-51, ADR-505 every phone of a project syncing at once tops up from one series: a top-up that loses the race every time is not taken at this sync, the phone told it holds what it held, and its records are saved all the same; any other failure is the server’s', async () => {
    await world(async (served, tx, who, within) => {
      const p = await kimOnP1(served, tx, who);
      const load = { projectId: p.projectId, series: 'LOAD' as const };
      const first = await synced(
        served,
        p.token,
        p.sync({ lastUsed: [{ ...load, lastUsedNumber: null }] }),
      );
      const [cut] = first.numbers[0]?.blocks ?? [];
      if (cut === undefined) throw new Error('No block was cut.');
      // An allocator whose series another phone moves on at every try, or that fails otherwise.
      const tries: string[] = [];
      const losing = (failure: () => Error) =>
        new (class extends NumberAllocator {
          override topUp(): never {
            tries.push(failure().name);
            throw failure();
          }
        })(within, served.clock, shippedPolicy);
      const syncWith = (numbers: NumberAllocator) =>
        new Sync(within, {
          intake: new Intake(within, served.clock, shippedPolicy),
          certifications: new Certifications(within, served.clock, shippedPolicy),
          unplanned: new UnplannedAssignments(within, {
            clock: served.clock,
            requestNow: () => undefined,
          }),
          uses: new PasscodeUses(within, { clock: served.clock, requestNow: () => undefined }),
          numbers,
          loginList: new PhoneLoginList(within, {
            assignments: new PhoneAssignments(within),
            offline: new OfflineChecks(sealingKey),
            clock: served.clock,
            entriesPerCall: shippedPolicy.loginListEntriesPerCall,
          }),
          held: new HeldThings(within, served.clock),
          clock: served.clock,
        });
      const collection = p.event({ ticketNumber: String(cut.firstNumber) });
      const sent = p.sync({
        records: [{ record: 'FIELD_EVENT', fieldEvent: collection }],
        lastUsed: [{ ...load, lastUsedNumber: cut.firstNumber }],
      });
      const { answered } = await syncWith(losing(() => new SeriesMovedOn())).received(
        inService(p.phone.id),
        syncSentSchema.parse(sent),
      );
      expect(syncAnswerRead(sent, answered)).not.toBeNull();
      expect([tries, answered.records, answered.numbers]).toEqual([
        ['SeriesMovedOn', 'SeriesMovedOn', 'SeriesMovedOn'],
        [{ answer: 'SAVED', id: collection.id, notes: [] }],
        [{ ...load, toppedUp: false, blocks: [cut] }],
      ]);

      tries.length = 0;
      const again = p.sync({ lastUsed: [{ ...load, lastUsedNumber: cut.firstNumber }] });
      await expect(
        syncWith(losing(() => new Error('The database went away.'))).received(
          inService(p.phone.id),
          syncSentSchema.parse(again),
        ),
      ).rejects.toThrow('The database went away.');
      expect(tries).toEqual(['Error']);
    });
  });
});

describe('what a sync brings besides its answers', () => {
  it('AC-02-23, AC-05-48 a phone that holds no check of the master passcode is brought the one in force at its sync, with nobody signed in; once Dana changes the passcode its next sync brings the new version’s, and the version its record holds moves then, as the device key’s actor on that phone; a phone that holds it is brought no check and nothing but the sync is written', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const enrolledUnder = p.phone.masterPasscodeVersion;
      const holding = (masterPasscodeVersion: number | null) =>
        p.sync({ holds: { masterPasscodeVersion, listsProjectId: null } });
      const versionHeld = async () =>
        (await tx.device.findUniqueOrThrow({ where: { id: p.phone.id } })).masterPasscodeVersion;

      const first = await synced(served, p.token, holding(null));
      expect(passcodeOf(first).version).toBe(enrolledUnder);
      expect([
        await opens(passcode, passcodeOf(first).check),
        await opens('osprey-landing-march', passcodeOf(first).check),
      ]).toEqual([true, false]);
      // Not the server's own hash: a check of this phone's, made from it.
      const inForce = await tx.masterPasscode.findUniqueOrThrow({
        where: { version: enrolledUnder },
      });
      expect(JSON.stringify(first)).not.toContain(inForce.hash.split('$').at(-1) ?? 'none');

      const changedTo = 'cordgrass-jetty-heron';
      saved(
        changeMasterPasscodeEndpoint,
        await ask(served, p.dana, changeMasterPasscodeEndpoint, {
          payload: { currentPassword: long, passcode: changedTo },
        }),
      );
      // Until the phone syncs, its record holds the version it was enrolled under.
      expect(await versionHeld()).toBe(enrolledUnder);
      const second = await synced(served, p.token, holding(enrolledUnder));
      expect(passcodeOf(second).version).toBe(enrolledUnder + 1);
      expect([
        await opens(changedTo, passcodeOf(second).check),
        await opens(passcode, passcodeOf(second).check),
      ]).toEqual([true, false]);
      expect(await versionHeld()).toBe(enrolledUnder + 1);
      const audited = await tx.auditRecord.findMany({
        where: { requestId: second.requestId },
        orderBy: { id: 'asc' },
      });
      expect(
        audited.map(({ tableName, operation, actorId, deviceId, source, changedFields }) => [
          tableName,
          operation,
          actorId,
          deviceId,
          source,
          operation === 'UPDATE' ? changedFields : [],
        ]),
      ).toEqual([
        ['sync', 'INSERT', deviceKeyActorId, p.phone.id, 'DEVICE', []],
        ['device', 'UPDATE', deviceKeyActorId, p.phone.id, 'DEVICE', ['master_passcode_version']],
      ]);

      const third = await synced(served, p.token, holding(enrolledUnder + 1));
      expect(third.masterPasscode).toEqual({ version: enrolledUnder + 1, check: null });
      expect(
        (await tx.auditRecord.findMany({ where: { requestId: third.requestId } })).map(
          ({ tableName }) => tableName,
        ),
      ).toEqual(['sync']);
      // The log says the version and whether a check went: never the check.
      const logged = served.lines.filter((line) => line.includes('A phone synced.'));
      expect(
        logged.map((line) => /"masterPasscodeCheckSent":(true|false)/.exec(line)?.[1]),
      ).toEqual(['true', 'true', 'false']);
      expect(logged.join('\n')).not.toContain('argon2id');
    });
  });

  it('AC-05-48, ADR-453 a phone that says whose lists it holds is brought that project’s setup version, as its phones are shown it now, and the sync’s own row says which was sent, written once; after Dana adds a field tag the next sync brings the next version; a phone that holds no lists, or names a project the server doesn’t have, is brought none, and nothing is refused; never the lists themselves', async () => {
    await world(async (served, tx, who) => {
      const p = await kimOnP1(served, tx, who);
      const holding = (listsProjectId: string | null) =>
        p.sync({
          holds: { masterPasscodeVersion: p.phone.masterPasscodeVersion, listsProjectId },
        });
      const versions = async () =>
        (
          await tx.setupManifest.findMany({
            where: { projectId: p.projectId },
            orderBy: { version: 'asc' },
          })
        ).map(({ version }) => version);
      expect(await versions()).toEqual([]);

      const first = await synced(served, p.token, holding(p.projectId));
      expect(first.setupVersion).toEqual({ projectId: p.projectId, version: 1 });
      expect(await versions()).toEqual([1]);
      // The version is made and the sync's row says it was sent, each the phone's own act.
      const audited = await tx.auditRecord.findMany({
        where: { requestId: first.requestId },
        orderBy: { id: 'asc' },
      });
      expect(
        audited.map(({ tableName, operation, actorId, deviceId, changedFields }) => [
          tableName,
          operation,
          actorId,
          deviceId,
          operation === 'UPDATE' ? changedFields : [],
        ]),
      ).toEqual([
        ['sync', 'INSERT', deviceKeyActorId, p.phone.id, []],
        ['setup_manifest', 'INSERT', deviceKeyActorId, p.phone.id, []],
        ['sync', 'UPDATE', deviceKeyActorId, p.phone.id, ['setup_version_sent']],
      ]);
      // A number, never the lists: no site, pay item or debris type is named.
      const text = JSON.stringify(first);
      for (const never of ['sites', 'payItems', 'debrisTypes', 'certifications', 'roes']) {
        expect(text, never).not.toContain(never);
      }

      // Nothing moved: the same version, and no new one is made.
      const again = await synced(served, p.token, holding(p.projectId));
      expect(again.setupVersion).toEqual({ projectId: p.projectId, version: 1 });
      saved(
        addFieldTagEndpoint,
        await ask(served, p.dana, addFieldTagEndpoint, {
          ids: p.priced.ids,
          payload: { name: 'Mixed' },
        }),
      );
      const moved = await synced(served, p.token, holding(p.projectId));
      expect(moved.setupVersion).toEqual({ projectId: p.projectId, version: 2 });
      expect(await versions()).toEqual([1, 2]);

      // No lists held, and a project nobody set up: none is brought, and nothing is refused.
      const none = await synced(served, p.token, holding(null));
      const elsewhere = await synced(served, p.token, holding(randomUUID()));
      expect([none.setupVersion, elsewhere.setupVersion]).toEqual([null, null]);
      expect((await syncsOf(tx, p.phone.id)).map((sync) => sync.setupVersionSent)).toEqual([
        1,
        1,
        2,
        null,
        null,
      ]);
      expect(await versions()).toEqual([1, 2]);
      const logged = served.lines.filter((line) => line.includes('A phone synced.'));
      expect(logged.map((line) => /"setupVersionSent":(\d+|null)/.exec(line)?.[1])).toEqual([
        '1',
        '1',
        '2',
        'null',
        'null',
      ]);
    });
  });
});
