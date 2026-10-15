// A use of the master passcode a phone logged with no connection, reported by that phone,
// against the database (ARCHITECTURE §7's notes, §7.2, §7.3, §7.5, §10;
// spec/acceptance/02-people-and-devices.md AC-02-23, 42, 46; spec/acceptance/10-api-and-sync.md
// AC-10-19, 27; BACKLOG 2.5.4, C46, C122…C125; ADR-100, 106, 438, 456 (3), (5)(e), 462, 464;
// REQ-202b, 209). The real process, in this test's own memory, on the installation's database
// as `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each
// test's work is undone (support/database.ts).
import { randomUUID } from 'node:crypto';

import {
  endpoints,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  openPasscodeSessionOnPhoneEndpoint,
  passcodeUseAnswerSchema,
  removePhoneEndpoint,
  reportPasscodeUseEndpoint,
  writeAssignmentEndpoint,
} from '@open-adms/contracts';
import { deviceKeyActorId, masterPasscodeActorId, type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone, passcode, proven, type TestPhone } from './support/phones.ts';
import { notTaken } from './support/review.ts';
import { danasEmail, long, worldOn, type Answer, type Served } from './support/served.ts';
import { ask, p1Priced, saved, told } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const monday = '2026-10-12';
// 6:30 am on Monday in Bayline County, at the Landfill's tower.
const mondayMorning = new Date('2026-10-12T10:30:00Z');
// 1:05 pm: the phone finds signal.
const mondayAfternoon = new Date('2026-10-12T17:05:00Z');
// Bayline County's clock in October: UTC−04:00.
const offset = -240;

const report = (served: Served, bearer: string | undefined, payload: object): Promise<Answer> =>
  served.ask('POST', reportPasscodeUseEndpoint.path, {
    payload,
    ...(bearer === undefined ? {} : { bearer }),
  });

// What a report was answered: `SAVED`, `ALREADY_SAVED`, or `NOT_SAVED` and why.
async function answered(served: Served, bearer: string, payload: { id: string }) {
  const answer = await report(served, bearer, payload);
  expect(told(answer)).toEqual([200, undefined]);
  const read = passcodeUseAnswerSchema.parse(answer.body);
  expect(read.useId).toBe(payload.id);
  return { said: [read.answer, read.reason], requestId: answer.requestId };
}

// P1 as Dana prices it; the Landfill tower's phone, enrolled and proven; Tariq Patel and Sam
// Grant, created on it. Dana planned Sam's Monday on that phone; Tariq has no assignment.
async function theTowersPhone(served: Served, tx: Tx) {
  served.clock.at = mondayMorning;
  const dana = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx);
  const phone = await enrolledPhone(served, tx, 'P1-TWR-LF');
  const token = await proven(served, phone);
  const created = async (name: string, password: string) => {
    const made = await served.ask('POST', '/phones/current/monitors', {
      bearer: token,
      payload: { name, password, passcode },
    });
    expect(told(made), name).toEqual([200, undefined]);
    return { ...monitorCreatedAnswerSchema.parse(made.body), password };
  };
  const tariq = await created('Tariq Patel', '5550177');
  const sam = await created('Sam Grant', '5550142');
  const samsPlan = saved(
    writeAssignmentEndpoint,
    await ask(served, dana, writeAssignmentEndpoint, {
      ids: priced.ids,
      payload: {
        personId: sam.userId,
        workDate: monday,
        fieldEventKinds: ['DISPOSAL'],
        certifying: false,
        formDocumentTypes: [],
        siteId: null,
        deviceId: phone.id,
        payItemIds: [],
      },
    }),
  ).record;
  // What the phone logged at 13:00 by its own clock, with an id of its own each time.
  const logged = (use: string, personId: string | null, more: object = {}) => ({
    id: randomUUID(),
    use,
    personId,
    loggedAt: '2026-10-12T17:00:00.000Z',
    deviceUtcOffsetMinutes: offset,
    ...more,
  });
  return { dana, priced, phone, token, tariq, sam, samsPlan, logged };
}

type Monitor = Awaited<ReturnType<typeof theTowersPhone>>['tariq'];

// The monitor signs in on the phone, online: what the sign-in answered.
async function signedIn(served: Served, token: string, monitor: Monitor) {
  const answer = await served.ask('POST', '/phones/current/sign-ins', {
    bearer: token,
    payload: { monitorNumber: monitor.monitorNumber, password: monitor.password },
  });
  expect(told(answer)).toEqual([200, undefined]);
  return monitorSignedInAnswerSchema.parse(answer.body);
}

const select = {
  id: true,
  kind: true,
  userId: true,
  deviceId: true,
  occurredAt: true,
  deviceUtcOffsetMinutes: true,
  masterPasscodeSession: true,
  createdAt: true,
} as const;

// The security events a request wrote, by kind (the first takes the phone's own id, so ids say
// nothing of the order).
const events = async (tx: Tx, requestId: string) =>
  (await tx.securityEvent.findMany({ where: { requestId }, orderBy: { kind: 'asc' }, select })).map(
    (event) => [
      event.kind,
      event.userId,
      event.deviceId,
      event.occurredAt.toISOString(),
      event.deviceUtcOffsetMinutes,
      event.masterPasscodeSession,
    ],
  );

// What a report answered "not saved" writes: the held record a person resolves, as the device
// key's actor on the phone that sent it (ADR-526 (5)).
const heldFor = (phone: TestPhone) => [
  ['held_record', 'INSERT', deviceKeyActorId, 'DEVICE', phone.id],
];

const audited = async (tx: Tx, requestId: string) =>
  (
    await tx.auditRecord.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: { tableName: true, operation: true, actorId: true, source: true, deviceId: true },
    })
  ).map((record) => Object.values(record));

// How many security events that phone reported (one the server saw itself carries no offset),
// how many unplanned assignments the server holds, and how many sessions there are on the phone.
const written = async (tx: Tx, phone: TestPhone) => [
  await tx.securityEvent.count({
    where: { deviceId: phone.id, deviceUtcOffsetMinutes: { not: null } },
  }),
  await tx.assignment.count({ where: { origin: 'UNPLANNED' } }),
  await tx.session.count({ where: { deviceId: phone.id } }),
];

const lines = (served: Served, msg: string) =>
  served.lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line['msg'] === msg);

const said = 'A phone reported a use of the master passcode it logged.';

describe('who may report one', () => {
  it('AC-10-27 it is a proven phone’s call, with nobody signed in and no passcode sent: no token, a back-office session and a body that isn’t whole are refused, and nothing is written', async () => {
    const { access, roles, permission } =
      endpoints.find(({ name }) => name === 'reportPasscodeUse') ?? {};
    expect([access, roles, permission]).toEqual(['PROVEN_PHONE', undefined, undefined]);
    await world(async (served, tx) => {
      const { dana, phone, token, sam, logged } = await theTowersPhone(served, tx);
      const sent = logged('MONITOR_SWITCH', sam.userId);
      const notProven = [401, 'PHONE_NOT_PROVEN'];
      expect(told(await report(served, undefined, sent))).toEqual(notProven);
      expect(told(await report(served, 'not-a-token', sent))).toEqual(notProven);
      const asDana = await served.ask('POST', reportPasscodeUseEndpoint.path, {
        payload: sent,
        cookies: dana.cookies,
        csrf: dana.csrf,
      });
      expect(told(asDana)).toEqual(notProven);
      const { loggedAt, ...noTime } = sent;
      expect(loggedAt).toBe('2026-10-12T17:00:00.000Z');
      const { use, ...noUse } = sent;
      expect(use).toBe('MONITOR_SWITCH');
      const { personId, ...nobodySaid } = sent;
      expect(personId).toBe(sam.userId);
      for (const [payload, words] of [
        [noTime, 'loggedAt'],
        [noUse, 'use'],
        // Who it was for is always said, as a monitor's id or as nobody.
        [nobodySaid, 'personId'],
        // What arrives as an unplanned assignment, or was done with a connection, is no use
        // a phone reports this way.
        [logged('SETUP', sam.userId), 'use'],
        [logged('DEVICE_SWITCH', sam.userId), 'use'],
        [logged('AS_MONITOR', sam.userId), 'use'],
        [logged('MASTER_PASSCODE_LOCKOUT', null), 'use'],
        // A switch and a session are for a monitor; a wrong try was for nobody.
        [logged('MONITOR_SWITCH', null), 'personId'],
        [logged('SESSION_AS_MONITOR', null), 'personId'],
        [logged('TEMPORARY_SESSION', null), 'personId'],
        [logged('WRONG_TRY', sam.userId), 'personId'],
        [logged('MONITOR_SWITCH', sam.monitorNumber), 'personId'],
        // The phone's instant is a UTC instant; its offset travels beside it.
        [logged('WRONG_TRY', null, { loggedAt: '2026-10-12T13:00:00-04:00' }), 'loggedAt'],
        [logged('WRONG_TRY', null, { loggedAt: '12-Oct-2026 13:00' }), 'loggedAt'],
        [logged('WRONG_TRY', null, { deviceUtcOffsetMinutes: 841 }), 'deviceUtcOffsetMinutes'],
        [logged('WRONG_TRY', null, { deviceUtcOffsetMinutes: -721 }), 'deviceUtcOffsetMinutes'],
        [logged('WRONG_TRY', null, { deviceUtcOffsetMinutes: -240.5 }), 'deviceUtcOffsetMinutes'],
        [logged('WRONG_TRY', null, { id: 'the third try' }), 'id'],
      ] as const) {
        const refused = await report(served, token, payload);
        expect(told(refused), words).toEqual([400, 'BAD_REQUEST']);
        expect(notTaken(refused), words).toContain(words);
      }
      // What a phone never says: the passcode, what was typed, the phone, the security
      // event's kind, how many tries, when the server received it.
      for (const more of [
        { passcode },
        { typed: 'osprey-landing' },
        { deviceId: phone.id },
        { kind: 'SIGN_IN' },
        { masterPasscodeSession: 'TEMPORARY' },
        { failedTries: 0 },
        { createdAt: '2026-10-12T17:00:00.000Z' },
      ]) {
        const refused = await report(served, token, logged('MONITOR_SWITCH', sam.userId, more));
        expect(told(refused), JSON.stringify(more)).toEqual([400, 'BAD_REQUEST']);
      }
      expect(await written(tx, phone)).toEqual([0, 0, 0]);
    });
  });
});

describe('a switch to a monitor who has their own assignment', () => {
  it('AC-02-46, REQ-202b the phone passes from Tariq to Sam under the master passcode at 13:00 with no connection, and Dana planned Sam’s day: reported at 13:05, it is a phone switched and a use of the passcode naming Sam at the phone’s own time, written as the master passcode’s actor; no assignment is made, and Sam’s own sign-in takes the one Dana planned; no wrong try is counted and no name is logged', async () => {
    await world(async (served, tx) => {
      const { phone, sam, samsPlan, logged } = await theTowersPhone(served, tx);
      served.clock.at = mondayAfternoon;
      const token = await proven(served, phone);
      served.lines.length = 0;
      const sent = logged('MONITOR_SWITCH', sam.userId);
      const { said: first, requestId } = await answered(served, token, sent);
      expect(first).toEqual(['SAVED', null]);
      const at = '2026-10-12T17:00:00.000Z';
      expect(await events(tx, requestId)).toEqual([
        ['DEVICE_SWITCH', sam.userId, phone.id, at, offset, null],
        ['MASTER_PASSCODE_USE', sam.userId, phone.id, at, offset, null],
      ]);
      // The phone's own id is the switch's; when the server wrote it is the database's own
      // clock, never the phone's.
      const kept = await tx.securityEvent.findUniqueOrThrow({ where: { id: sent.id }, select });
      expect(kept.kind).toBe('DEVICE_SWITCH');
      expect(Math.abs(kept.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
      // REQ-209: whoever held the passcode is not known. Never Sam, never the device key.
      const byThePasscode = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, requestId)).toEqual([
        ['security_event', 'INSERT', ...byThePasscode],
        ['security_event', 'INSERT', ...byThePasscode],
      ]);
      // The server checked no passcode: nothing counts for or against it.
      expect(await tx.masterPasscodeTries.count()).toBe(0);
      expect(await written(tx, phone)).toEqual([2, 0, 0]);
      const [line] = lines(served, said);
      expect(line).toMatchObject({
        deviceId: phone.id,
        useId: sent.id,
        use: 'MONITOR_SWITCH',
        answer: 'SAVED',
      });
      const log = served.lines.join('\n');
      for (const never of ['Sam', sam.monitorNumber, sam.userId, passcode]) {
        expect(log, never).not.toContain(never);
      }
      // Sam then signs in with his own Monitor ID and password, and the phone takes his plan.
      expect((await signedIn(served, token, sam)).assignment?.id).toBe(samsPlan.id);
    });
  });

  it('AC-05-40 reported again, it is already saved and nothing is written twice, whatever the second report says; its id sent by another phone, or the id of an event the server saw itself, is not saved', async () => {
    await world(async (served, tx) => {
      const { phone, token, tariq, sam, logged } = await theTowersPhone(served, tx);
      const sent = logged('MONITOR_SWITCH', sam.userId);
      expect((await answered(served, token, sent)).said).toEqual(['SAVED', null]);
      const first = await tx.securityEvent.findUniqueOrThrow({ where: { id: sent.id }, select });
      const again = await answered(served, token, sent);
      expect(again.said).toEqual(['ALREADY_SAVED', null]);
      expect(await audited(tx, again.requestId)).toEqual([]);
      // The first stands: a phone never changes one by reporting it anew.
      const changed = { ...sent, use: 'TEMPORARY_SESSION', personId: tariq.userId };
      expect((await answered(served, token, changed)).said).toEqual(['ALREADY_SAVED', null]);
      expect(await tx.securityEvent.findUniqueOrThrow({ where: { id: sent.id }, select })).toEqual(
        first,
      );
      expect(await written(tx, phone)).toEqual([2, 0, 0]);
      // Another phone can't claim it, or learn anything of it but that the id is held.
      const other = await enrolledPhone(served, tx, 'P1-COL-1');
      const others = await proven(served, other);
      const held = ['NOT_SAVED', 'ID_ALREADY_HELD'];
      expect((await answered(served, others, sent)).said).toEqual(held);
      // An event the server saw itself (Sam created on this phone under the passcode) is no
      // phone's report.
      const seen = await tx.securityEvent.findFirstOrThrow({
        where: { kind: 'MASTER_PASSCODE_USE', userId: sam.userId, deviceUtcOffsetMinutes: null },
        select: { id: true },
      });
      const claimed = await answered(served, token, { ...sent, id: seen.id });
      expect(claimed.said).toEqual(held);
      // Held for a person, as is every report answered not saved (ADR-526 (5)).
      expect(await audited(tx, claimed.requestId)).toEqual(heldFor(phone));
      expect(await written(tx, phone)).toEqual([2, 0, 0]);
      expect(await written(tx, other)).toEqual([0, 0, 0]);
    });
  });
});

describe('a session opened on the phone with no connection', () => {
  it('AC-02-42, REQ-202b as the phone’s monitor at 06:45 and the temporary session at 13:00: each reported is one use of the master passcode that says which way and for whom, at the phone’s own time; never a sign-in, and the server opens no session for it', async () => {
    await world(async (served, tx) => {
      const { phone, tariq, sam, logged } = await theTowersPhone(served, tx);
      served.clock.at = mondayAfternoon;
      const token = await proven(served, phone);
      served.lines.length = 0;
      const morning = '2026-10-12T10:45:00.000Z';
      const asTariq = logged('SESSION_AS_MONITOR', tariq.userId, { loggedAt: morning });
      const forSam = logged('TEMPORARY_SESSION', sam.userId);
      const first = await answered(served, token, asTariq);
      const second = await answered(served, token, forSam);
      expect([first.said, second.said]).toEqual([
        ['SAVED', null],
        ['SAVED', null],
      ]);
      expect(await events(tx, first.requestId)).toEqual([
        ['MASTER_PASSCODE_USE', tariq.userId, phone.id, morning, offset, 'AS_MONITOR'],
      ]);
      expect(await events(tx, second.requestId)).toEqual([
        [
          'MASTER_PASSCODE_USE',
          sam.userId,
          phone.id,
          '2026-10-12T17:00:00.000Z',
          offset,
          'TEMPORARY',
        ],
      ]);
      const ids = await tx.securityEvent.findMany({
        where: { id: { in: [asTariq.id, forSam.id] } },
        select: { id: true },
      });
      expect(ids.map(({ id }) => id).sort()).toEqual([asTariq.id, forSam.id].sort());
      const byThePasscode = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, first.requestId)).toEqual([
        ['security_event', 'INSERT', ...byThePasscode],
      ]);
      expect(await tx.securityEvent.count({ where: { kind: 'SIGN_IN', deviceId: phone.id } })).toBe(
        0,
      );
      expect(await written(tx, phone)).toEqual([2, 0, 0]);
      expect(await tx.masterPasscodeTries.count()).toBe(0);
      expect(lines(served, said).map((line) => [line['use'], line['answer']])).toEqual([
        ['SESSION_AS_MONITOR', 'SAVED'],
        ['TEMPORARY_SESSION', 'SAVED'],
      ]);
      const log = served.lines.join('\n');
      for (const never of ['Tariq', 'Sam', tariq.userId, sam.monitorNumber, passcode]) {
        expect(log, never).not.toContain(never);
      }
    });
  });

  it('ADR-462 one monitor at a time: a switch or a session saved ends the session of whoever was signed in on the phone before it, by the phone’s clock; it ends neither the monitor’s own nor one opened since, and a wrong try ends none', async () => {
    await world(async (served, tx) => {
      const { phone, token, tariq, sam, logged } = await theTowersPhone(served, tx);
      const on = (bearer: string, monitorSession: string) =>
        served.ask('GET', '/phones/current/monitor', { bearer, monitorSession });
      const stillOn = [200, undefined];
      const signedOut = [401, 'NOT_SIGNED_IN'];
      // Tariq signs in at 06:30.
      const tariqs = (await signedIn(served, token, tariq)).token;
      // A wrong try at 13:00 ends nothing; nor does a switch to Sam the phone says was made
      // at 06:20, before Tariq signed in; nor a session for Tariq himself.
      for (const sent of [
        logged('WRONG_TRY', null),
        logged('MONITOR_SWITCH', sam.userId, { loggedAt: '2026-10-12T10:20:00.000Z' }),
        logged('TEMPORARY_SESSION', sam.userId, { loggedAt: '2026-10-12T10:20:00.000Z' }),
        logged('SESSION_AS_MONITOR', tariq.userId),
      ]) {
        expect((await answered(served, token, sent)).said, sent.use).toEqual(['SAVED', null]);
        expect(told(await on(token, tariqs)), sent.use).toEqual(stillOn);
      }
      // The temporary session for Sam opened at 13:00 with no connection, reported at 13:05.
      served.clock.at = mondayAfternoon;
      const afternoon = await proven(served, phone);
      const forSam = logged('TEMPORARY_SESSION', sam.userId);
      const { said: first, requestId } = await answered(served, afternoon, forSam);
      expect(first).toEqual(['SAVED', null]);
      expect(told(await on(afternoon, tariqs))).toEqual(signedOut);
      const byThePasscode = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, requestId)).toEqual([
        ['security_event', 'INSERT', ...byThePasscode],
        ['session', 'UPDATE', ...byThePasscode],
      ]);
      // Tariq signs in again at 13:05; a switch to Sam logged at 13:00 came before it and
      // ends nothing of his, and one logged at 13:10 does.
      const tariqsNext = (await signedIn(served, afternoon, tariq)).token;
      const before = logged('MONITOR_SWITCH', sam.userId);
      expect((await answered(served, afternoon, before)).said).toEqual(['SAVED', null]);
      expect(told(await on(afternoon, tariqsNext))).toEqual(stillOn);
      const after = logged('MONITOR_SWITCH', sam.userId, { loggedAt: '2026-10-12T17:10:00.000Z' });
      expect((await answered(served, afternoon, after)).said).toEqual(['SAVED', null]);
      expect(told(await on(afternoon, tariqsNext))).toEqual(signedOut);
      // Sam signs in; a later switch to Sam is his own, and sent again it writes nothing.
      const sams = (await signedIn(served, afternoon, sam)).token;
      const later = logged('MONITOR_SWITCH', sam.userId, { loggedAt: '2026-10-12T17:30:00.000Z' });
      expect((await answered(served, afternoon, later)).said).toEqual(['SAVED', null]);
      expect(told(await on(afternoon, sams))).toEqual(stillOn);
      const repeated = await answered(served, afternoon, later);
      expect(repeated.said).toEqual(['ALREADY_SAVED', null]);
      expect(await audited(tx, repeated.requestId)).toEqual([]);
    });
  });
});

describe('a wrong try at the passcode on a phone', () => {
  it('ADR-456 (5)(e), REQ-202b six wrong tries the phone logged with no connection are six failed tries in the security log, about nobody, at the phone’s own time; none counts toward the server’s own check, which takes the right passcode at once and neither waits nor locks', async () => {
    await world(async (served, tx) => {
      const { phone, tariq, logged } = await theTowersPhone(served, tx);
      served.clock.at = mondayAfternoon;
      const token = await proven(served, phone);
      const sent = Array.from({ length: 6 }, (_, nth) =>
        logged('WRONG_TRY', null, { loggedAt: `2026-10-12T16:5${String(nth)}:00.000Z` }),
      );
      for (const [nth, one] of sent.entries()) {
        const { said: answer, requestId } = await answered(served, token, one);
        expect(answer).toEqual(['SAVED', null]);
        expect(await events(tx, requestId)).toEqual([
          [
            'MASTER_PASSCODE_FAILED',
            null,
            phone.id,
            `2026-10-12T16:5${String(nth)}:00.000Z`,
            offset,
            null,
          ],
        ]);
      }
      expect(await written(tx, phone)).toEqual([6, 0, 0]);
      // The server's own count stands where it stood, and no lock was written.
      expect(await tx.masterPasscodeTries.count()).toBe(0);
      expect(await tx.securityEvent.count({ where: { kind: 'MASTER_PASSCODE_LOCKOUT' } })).toBe(0);
      // With a connection again, the right passcode is taken at once: no wait from the fifth.
      const opened = await served.ask('POST', openPasscodeSessionOnPhoneEndpoint.path, {
        bearer: token,
        payload: { personId: tariq.userId, kind: 'AS_MONITOR', passcode },
      });
      expect(told(opened)).toEqual([200, undefined]);
      // Sent again, each is kept once.
      for (const one of sent) {
        expect((await answered(served, token, one)).said).toEqual(['ALREADY_SAVED', null]);
      }
      expect(await written(tx, phone)).toEqual([6, 0, 1]);
    });
  });
});

describe('kept as reported', () => {
  it('never refused over eligibility: for a monitor archived since, and from a phone taken out of service', async () => {
    await world(async (served, tx) => {
      const { dana, phone, token, tariq, logged } = await theTowersPhone(served, tx);
      // Tariq is archived on Tuesday; the phone is marked lost. Monday's acts were still done.
      await tx.user.update({ where: { id: tariq.userId }, data: { archivedAt: new Date() } });
      saved(
        removePhoneEndpoint,
        await ask(served, dana, removePhoneEndpoint, {
          ids: { deviceId: phone.id },
          payload: { status: 'LOST' },
        }),
      );
      for (const sent of [
        logged('SESSION_AS_MONITOR', tariq.userId),
        logged('MONITOR_SWITCH', tariq.userId),
        logged('WRONG_TRY', null),
      ]) {
        expect((await answered(served, token, sent)).said, sent.use).toEqual(['SAVED', null]);
      }
      expect(await written(tx, phone)).toEqual([4, 0, 0]);
    });
  });

  it('it is not saved where it names somebody who is no monitor: nobody the firm has, somebody of the back office, the master passcode itself; each is said, nothing of it is kept as a use, and it is held for a person exactly as sent', async () => {
    await world(async (served, tx, who) => {
      const { phone, token, logged } = await theTowersPhone(served, tx);
      for (const personId of [randomUUID(), who.dana, who.luis, masterPasscodeActorId]) {
        for (const use of ['MONITOR_SWITCH', 'SESSION_AS_MONITOR', 'TEMPORARY_SESSION']) {
          const report = logged(use, personId);
          const { said: answer, requestId } = await answered(served, token, report);
          expect(answer, `${use} ${personId}`).toEqual(['NOT_SAVED', 'NOT_A_MONITOR']);
          expect(await audited(tx, requestId), use).toEqual(heldFor(phone));
          const held = await tx.heldRecord.findFirstOrThrow({ where: { sentId: report.id } });
          expect([held.syncId, held.reason, held.message]).toEqual([
            null,
            'REPORT_NOT_SAVED',
            'Not saved: this use of the master passcode is for someone who isn’t a monitor the server has. Held on the server for review.',
          ]);
        }
      }
      expect(await written(tx, phone)).toEqual([0, 0, 0]);
      expect(await tx.heldRecord.count({ where: { deviceId: phone.id } })).toBe(12);
    });
  });
});
