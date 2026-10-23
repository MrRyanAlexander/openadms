// A phone turned in under the master passcode, against the database (ARCHITECTURE §7.4, §7.5, §8;
// spec/acceptance/02-people-and-devices.md AC-02-58, 60, 61; spec/acceptance/05-sync.md AC-05-56;
// spec/acceptance/10-api-and-sync.md AC-10-22, 32, 46; spec/THREAT-MODEL.md T-02, T-11; BACKLOG
// 2.6.5, C47, C64, C126, C139; ADR-065, 096, 134, 468, 488; REQ-202a, 202b, 209). OWASP API
// Security Top 10 API1, API2, API6; ASVS 5.0 V16.3. The real process, in this test's own memory,
// on the test database as `adms_api`: it needs `pnpm local:up` after `pnpm installer`,
// and fails saying so. Each test's work is undone (support/database.ts). A photograph's file is
// kept in a store of this test's own, in memory: where files live is `photo-files.test.ts`'s.
import { randomUUID } from 'node:crypto';

import {
  endpoints,
  syncAnsweredSchema,
  syncExamples,
  syncPhoneEndpoint,
  turnInPhoneEndpoint,
  type TurnInHolds,
} from '@open-adms/contracts';
import { masterPasscodeActorId, type Database } from '@open-adms/db';
import { TurnInRules } from '@open-adms/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sentFingerprint } from '../src/sync/sync.ts';
import { testSettings, openTestDatabase, type Tx } from './support/database.ts';
import {
  jpeg,
  Kept,
  kimsOther,
  kimsPhone,
  mondayEvening,
  nothingHeld,
  notProven,
  png,
  refused,
  turnedIn,
  turnIn,
} from './support/kims-phone.ts';
import {
  answered,
  passcode,
  proven,
  provenWithPasscode,
  type TestPhone,
} from './support/phones.ts';
import { notTaken } from './support/review.ts';
import { worldOn } from './support/served.ts';
import { told } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openTestDatabase(testSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const turningIn = (work: Parameters<typeof world>[0]) =>
  world(work, undefined, undefined, { media: new Kept() });

const deviceOf = async (tx: Tx, phone: TestPhone) =>
  (({ status, outOfServiceAt, keyRevokedAt }) => [
    status,
    outOfServiceAt?.toISOString() ?? null,
    keyRevokedAt?.toISOString() ?? null,
  ])(await tx.device.findUniqueOrThrow({ where: { id: phone.id } }));

const blocksOf = async (tx: Tx, phone: TestPhone) =>
  (
    await tx.numberBlock.findMany({
      where: { deviceId: phone.id },
      orderBy: [{ series: 'asc' }, { firstNumber: 'asc' }],
    })
  ).map(({ series, firstNumber, lastNumber, lastUsedNumber, status, endedAt }) => [
    series,
    firstNumber,
    lastNumber,
    lastUsedNumber,
    status,
    endedAt?.toISOString() ?? null,
  ]);

// The security events a request wrote, by kind, and who wrote them.
const eventsOf = async (tx: Tx, requestId: string) =>
  (
    await tx.securityEvent.findMany({
      where: { requestId },
      orderBy: { kind: 'asc' },
      select: { kind: true, deviceId: true, userId: true, occurredAt: true },
    })
  ).map(({ kind, deviceId, userId, occurredAt }) => [
    kind,
    deviceId,
    userId,
    occurredAt.toISOString(),
  ]);

const actorsOf = async (tx: Tx, requestId: string) => [
  ...new Set(
    (await tx.auditRecord.findMany({ where: { requestId }, select: { actorId: true } })).map(
      ({ actorId }) => actorId,
    ),
  ),
];

describe('who may turn a phone in', () => {
  it('AC-10-46, API2 a turn-in is a proven phone’s, with the master passcode: nobody need be signed in, and a caller with no phone’s token is refused before anything is read', async () => {
    const { access, roles, permission, method, path } =
      endpoints.find(({ name }) => name === 'turnInPhone') ?? {};
    expect([access, roles, permission, method, path]).toEqual([
      'PROVEN_PHONE',
      undefined,
      undefined,
      'POST',
      '/phones/current/turn-ins',
    ]);
    await turningIn(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      const sent = { passcode, holds: nothingHeld, lastUsed: [] };
      expect(told(await turnIn(served, undefined, sent))).toEqual(notProven);
      expect(told(await turnIn(served, 'not-a-token', sent))).toEqual(notProven);
      const asDana = await served.ask('POST', turnInPhoneEndpoint.path, {
        payload: sent,
        cookies: p.dana.cookies,
        csrf: p.dana.csrf,
      });
      expect(told(asDana)).toEqual(notProven);
      // A turn-in never says which phone it is: the phone proved that.
      expect(notTaken(await turnIn(served, p.token, { ...sent, deviceId: p.phone.id }))).toBe(
        'Not taken: the body has a field this request doesn’t take.',
      );
      // API4: what a phone holds is bounded, each named once.
      const twice = randomUUID();
      expect(
        told(
          await turnIn(served, p.token, {
            ...sent,
            holds: { ...nothingHeld, records: [twice, twice] },
          }),
        ),
      ).toEqual([400, 'BAD_REQUEST']);
      expect(await deviceOf(tx, p.phone)).toEqual(['ACTIVE', null, null]);
    });
  });

  it('AC-10-22 a passcode that isn’t taken is refused by one code and counted as at enrolment; nothing is wiped and nothing changes', async () => {
    await turningIn(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      const wrong = await turnIn(served, p.token, {
        passcode: 'heron-landing-marsh',
        holds: nothingHeld,
        lastUsed: [],
      });
      expect(told(wrong)).toEqual(refused);
      expect(Object.keys(wrong.body as object).sort()).toEqual(['code', 'requestId']);
      expect(await eventsOf(tx, wrong.requestId)).toEqual([
        ['MASTER_PASSCODE_FAILED', p.phone.id, null, mondayEvening.toISOString()],
      ]);
      expect(await deviceOf(tx, p.phone)).toEqual(['ACTIVE', null, null]);
      // The phone still proves itself, to a challenge made after the last it answered.
      served.clock.later(1);
      await proven(served, p.phone);
    });
  });
  it('AC-10-22 one address is stopped at its fourth wrong try: its fifth is answered 429 before the passcode is touched, and the phone is not turned in', async () => {
    await turningIn(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      for (let wrong = 1; wrong <= 4; wrong += 1) {
        expect(
          told(
            await turnIn(served, p.token, {
              passcode: 'heron-landing-marsh',
              holds: nothingHeld,
              lastUsed: [],
            }),
          ),
        ).toEqual(refused);
      }
      const stopped = await turnIn(served, p.token, { passcode, holds: nothingHeld, lastUsed: [] });
      expect(told(stopped)).toEqual([429, 'LIMITED']);
      expect(await eventsOf(tx, stopped.requestId)).toEqual([]);
      expect(await deviceOf(tx, p.phone)).toEqual(['ACTIVE', null, null]);
    });
  });
});

describe('a phone turned in', () => {
  it('AC-02-58, AC-02-61, AC-05-56, AC-10-46 a phone in service whose every record, report and file the server has is told to wipe: the unused rest of a series it reports is handed back, one it doesn’t report retired whole; it is out of service as retired, its sessions end, its key is revoked and refused at once; the use and the turn-in are security events, written as the master passcode’s actor', async () => {
    await turningIn(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      // Lee Morgan, created on the phone and signed in: a session on it.
      const made = await served.ask('POST', '/phones/current/monitors', {
        bearer: p.token,
        payload: { name: 'Lee Morgan', password: '5550142', passcode },
      });
      expect(told(made)).toEqual([200, undefined]);
      const lee = made.body as { monitorNumber: string };
      const signIn = await served.ask('POST', '/phones/current/sign-ins', {
        bearer: p.token,
        payload: { monitorNumber: lee.monitorNumber, password: '5550142' },
      });
      expect(told(signIn)).toEqual([200, undefined]);
      const leesSession = (signIn.body as { token: string }).token;
      // Monday's work: a collection with its photograph, a thing that is no record (held for a
      // person under its id), another with no id at all (held under its fingerprint), and the
      // phone's first blocks of the load and unit rate series.
      const collection = p.collection();
      const file = jpeg();
      const photo = p.photographOf(collection, file);
      const noRecord = { record: 'FIELD_EVENT', fieldEvent: { id: randomUUID() } };
      const noId = 'a line the phone could not read back';
      const load = { projectId: p.projectId, series: 'LOAD' as const };
      const unitRate = { projectId: p.projectId, series: 'UNIT_RATE' as const };
      // And what it logged under the passcode: the phone set up for Kim, and passed to her.
      const setUp = { ...syncExamples.unplanned, id: randomUUID(), projectId: p.projectId };
      const report = { ...setUp, personId: who.kim, siteId: null };
      const switched = { ...syncExamples.switched, id: randomUUID(), personId: who.kim };
      const first = await p.sync({
        unplannedAssignments: [report],
        passcodeUses: [switched],
        records: [{ record: 'FIELD_EVENT', fieldEvent: collection }, noRecord, noId] as never[],
        photos: [photo],
        lastUsed: [
          { ...load, lastUsedNumber: null },
          { ...unitRate, lastUsedNumber: null },
        ],
      });
      expect([
        first.unplannedAssignments.map(({ answer }) => answer),
        first.passcodeUses.map(({ answer }) => answer),
        first.records.map(({ answer }) => answer),
      ]).toEqual([['SAVED'], ['SAVED'], ['SAVED', 'NOT_SAVED', 'NOT_SAVED']]);
      const [loadBlock] = first.numbers[0]?.blocks ?? [];
      const [unitRateBlock] = first.numbers[1]?.blocks ?? [];
      if (loadBlock === undefined || unitRateBlock === undefined) {
        throw new Error('No block was cut.');
      }
      await p.upload(photo.id, file);
      // It gave out three load numbers since.
      const lastLoad = loadBlock.firstNumber + 2;
      served.clock.later(1);
      const turnInAt = served.clock.now().toISOString();
      const answer = await turnedIn(served, p.token, {
        passcode,
        holds: {
          unplannedAssignments: [report.id],
          passcodeUses: [switched.id],
          records: [collection.id, noRecord.fieldEvent.id],
          held: [sentFingerprint(noId)],
          photos: [photo.id],
        },
        lastUsed: [{ ...load, lastUsedNumber: lastLoad }],
      });
      expect(answer).toEqual({
        turnedIn: true,
        wipe: true,
        numbers: [
          {
            ...load,
            ended: 'RECLAIMED',
            blocks: [{ ...loadBlock, lastUsedNumber: lastLoad }],
          },
          { ...unitRate, ended: 'RETIRED', blocks: [unitRateBlock] },
        ],
        requestId: answer.requestId,
      });
      expect(await blocksOf(tx, p.phone)).toEqual([
        ['LOAD', loadBlock.firstNumber, loadBlock.lastNumber, lastLoad, 'RECLAIMED', turnInAt],
        [
          'UNIT_RATE',
          unitRateBlock.firstNumber,
          unitRateBlock.lastNumber,
          null,
          'RETIRED',
          turnInAt,
        ],
      ]);
      expect(await deviceOf(tx, p.phone)).toEqual(['RETIRED', turnInAt, turnInAt]);
      expect(
        (await tx.session.findMany({ where: { deviceId: p.phone.id } })).map(
          ({ revokedAt }) => revokedAt?.toISOString() ?? null,
        ),
      ).toEqual([turnInAt]);
      expect(await eventsOf(tx, answer.requestId)).toEqual([
        ['MASTER_PASSCODE_USE', p.phone.id, null, turnInAt],
        ['DEVICE_TURN_IN', p.phone.id, null, turnInAt],
      ]);
      // Whoever holds the passcode is not known: every write is the master passcode's own.
      expect(await actorsOf(tx, answer.requestId)).toEqual([masterPasscodeActorId]);
      // Its key is revoked: the token it holds stops at once, with its monitor's session, and
      // a new proof is refused and writes nothing.
      expect(told(await served.ask('GET', '/phones/current', { bearer: p.token }))).toEqual(
        notProven,
      );
      expect(
        told(
          await served.ask('GET', '/phones/current/monitor', {
            bearer: p.token,
            monitorSession: leesSession,
          }),
        ),
      ).toEqual(notProven);
      expect(told((await answered(served, p.phone)).answer)).toEqual(notProven);
      // A turn-in sent again, as a phone whose answer was lost would, is no proven phone's.
      expect(
        told(await turnIn(served, p.token, { passcode, holds: nothingHeld, lastUsed: [] })),
      ).toEqual(notProven);
      // ADR-065: the unused rest of its load block is cut again for the next phone, once.
      const next = await kimsOther(served, tx, who, p.projectId, 'P1-COL-2', p.dana);
      const topped = await next.sync({ lastUsed: [{ ...load, lastUsedNumber: null }] });
      expect(topped.numbers[0]?.blocks[0]?.firstNumber).toBe(lastLoad + 1);
    });
  });

  it('AC-02-58, ADR-096 a phone that holds what the server doesn’t have is not turned in: each thing is named back as the phone named it, nothing is wiped and nothing changes; the passcode’s use is logged all the same', async () => {
    await turningIn(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      const collection = p.collection();
      const file = jpeg();
      // Its photograph's record is saved, but its file is still only on the phone; another's
      // file is kept, and the depth file beside it is still only on the phone.
      const photo = p.photographOf(collection, file);
      const another = jpeg();
      const depth = png();
      const withDepth = p.photographOf(collection, another, depth);
      const load = { projectId: p.projectId, series: 'LOAD' as const };
      await p.sync({
        records: [{ record: 'FIELD_EVENT', fieldEvent: collection }],
        photos: [photo, withDepth],
        lastUsed: [{ ...load, lastUsedNumber: null }],
      });
      await p.upload(withDepth.id, another);
      const before = await blocksOf(tx, p.phone);
      const neverSent = {
        unplannedAssignments: [randomUUID()],
        passcodeUses: [randomUUID()],
        records: [randomUUID()],
        held: [sentFingerprint('never sent')],
      };
      const answer = await turnedIn(served, p.token, {
        passcode,
        holds: {
          unplannedAssignments: neverSent.unplannedAssignments,
          passcodeUses: neverSent.passcodeUses,
          records: [collection.id, ...neverSent.records],
          held: neverSent.held,
          photos: [photo.id, withDepth.id],
        },
        lastUsed: [{ ...load, lastUsedNumber: null }],
      });
      expect(answer).toEqual({
        turnedIn: false,
        wipe: false,
        message: new TurnInRules().notConfirmed({ records: 4, files: 2 }),
        notOnTheServer: { ...neverSent, photos: [photo.id, withDepth.id] },
        requestId: answer.requestId,
      });
      expect(answer.turnedIn ? null : answer.message).toBe(
        'Not turned in: the server doesn’t have 4 records and 2 photographs’ files this phone holds yet. Nothing was wiped and nothing was changed. Sync the phone again, then turn it in.',
      );
      expect(await deviceOf(tx, p.phone)).toEqual(['ACTIVE', null, null]);
      expect(await blocksOf(tx, p.phone)).toEqual(before);
      expect(await eventsOf(tx, answer.requestId)).toEqual([
        ['MASTER_PASSCODE_USE', p.phone.id, null, mondayEvening.toISOString()],
      ]);
      // Once its files are sent and the rest is on the server, it is turned in.
      await p.upload(photo.id, file);
      await p.upload(withDepth.id, depth, 'depth');
      const now = await turnedIn(served, p.token, {
        passcode,
        holds: { ...nothingHeld, records: [collection.id], photos: [photo.id, withDepth.id] },
        lastUsed: [{ ...load, lastUsedNumber: null }],
      });
      expect([
        now.turnedIn,
        now.wipe,
        now.turnedIn ? now.numbers.map(({ ended }) => ended) : null,
      ]).toEqual([true, true, ['RECLAIMED']]);
    });
  });

  it('API1 a phone confirms only what it sent itself: another phone’s record, report or photograph is not on the server for it', async () => {
    await turningIn(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      const other = await kimsOther(served, tx, who, p.projectId, 'P1-COL-2', p.dana);
      const theirs = other.collection();
      const file = jpeg();
      const theirPhoto = other.photographOf(theirs, file);
      const setUp = { ...syncExamples.unplanned, id: randomUUID(), projectId: p.projectId };
      const theirReport = { ...setUp, personId: who.kim, siteId: null };
      const theirUse = { ...syncExamples.switched, id: randomUUID(), personId: who.kim };
      const theirNoRecord = { record: 'FIELD_EVENT', fieldEvent: { id: randomUUID() } };
      const theirNoId = 'a line the other phone could not read back';
      await other.sync({
        unplannedAssignments: [theirReport],
        passcodeUses: [theirUse],
        records: [
          { record: 'FIELD_EVENT', fieldEvent: theirs },
          theirNoRecord,
          theirNoId,
        ] as never[],
        photos: [theirPhoto],
      });
      await other.upload(theirPhoto.id, file);
      const theirsAll: TurnInHolds = {
        unplannedAssignments: [theirReport.id],
        passcodeUses: [theirUse.id],
        records: [theirs.id, theirNoRecord.fieldEvent.id],
        held: [sentFingerprint(theirNoId)],
        photos: [theirPhoto.id],
      };
      const answer = await turnedIn(served, p.token, { passcode, holds: theirsAll, lastUsed: [] });
      expect([answer.turnedIn, answer.turnedIn ? null : answer.notOnTheServer]).toEqual([
        false,
        theirsAll,
      ]);
      // The phone that sent them is turned in on them.
      const theirsIn = await turnedIn(served, other.token, {
        passcode,
        holds: theirsAll,
        lastUsed: [],
      });
      expect(theirsIn.turnedIn).toBe(true);
      expect(await deviceOf(tx, p.phone)).toEqual(['ACTIVE', null, null]);
    });
  });

  it('AC-02-60, AC-02-61, AC-05-54 a phone marked lost that turns up is received and turned in like any other: its blocks are retired whole whatever it reports, and it stays lost from the moment it was marked', async () => {
    await turningIn(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      const load = { projectId: p.projectId, series: 'LOAD' as const };
      const first = await p.sync({ lastUsed: [{ ...load, lastUsedNumber: null }] });
      const [block] = first.numbers[0]?.blocks ?? [];
      if (block === undefined) throw new Error('No block was cut.');
      // Luis marks it lost at 6:30 pm; it turns up on Wednesday, still proves itself and syncs
      // what it made since: received, never refused (the flag is the worker's).
      const removal = await served.ask('POST', `/phones/${p.phone.id}/removals`, {
        ...p.dana,
        payload: { status: 'LOST' },
      });
      expect(told(removal)).toEqual([200, undefined]);
      served.clock.at = new Date('2026-10-14T22:00:00Z');
      // The master user at it: the phone out of service only sends (ADR-531).
      const token = await provenWithPasscode(served, p.phone);
      const afterward = p.collection();
      const wednesday = await served.ask('POST', syncPhoneEndpoint.path, {
        bearer: token,
        payload: {
          clockAt: served.clock.now().toISOString(),
          deviceUtcOffsetMinutes: -240,
          unplannedAssignments: [],
          passcodeUses: [],
          records: [{ record: 'FIELD_EVENT', fieldEvent: afterward }],
          photos: [],
          lastUsed: [],
          holds: { masterPasscodeVersion: p.phone.masterPasscodeVersion, listsProjectId: null },
        },
      });
      expect(syncAnsweredSchema.parse(wednesday.body).records).toEqual([
        { answer: 'SAVED', id: afterward.id, notes: [] },
      ]);
      const answer = await turnedIn(served, token, {
        passcode,
        holds: { ...nothingHeld, records: [afterward.id] },
        lastUsed: [{ ...load, lastUsedNumber: block.firstNumber }],
      });
      const turnInAt = served.clock.now().toISOString();
      expect([answer.turnedIn, answer.turnedIn ? answer.numbers : null]).toEqual([
        true,
        [{ ...load, ended: 'RETIRED', blocks: [{ ...block, lastUsedNumber: block.firstNumber }] }],
      ]);
      expect(await deviceOf(tx, p.phone)).toEqual(['LOST', mondayEvening.toISOString(), turnInAt]);
    });
  });

  it('AC-10-32 the log says a phone was turned in, or why not, by its id and a count: never the passcode, nor anything the phone named', async () => {
    await turningIn(async (served, tx, who) => {
      const p = await kimsPhone(served, tx, who);
      const unknown = randomUUID();
      await turnedIn(served, p.token, {
        passcode,
        holds: { ...nothingHeld, records: [unknown] },
        lastUsed: [],
      });
      await turnedIn(served, p.token, { passcode, holds: nothingHeld, lastUsed: [] });
      const logged = served.lines.join('\n');
      expect(logged).toContain('A phone was not turned in');
      expect(logged).toContain('"notOnTheServer":1');
      expect(logged).toContain('A phone was turned in under the master passcode');
      expect(logged).toContain(p.phone.id);
      expect(logged).not.toContain(passcode);
      expect(logged).not.toContain(unknown);
    });
  });
});
