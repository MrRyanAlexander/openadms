// A session opened on a phone under the master passcode, with a connection, against the
// database (ARCHITECTURE §6, Device sessions, Abuse; §7.2, §7.3, §7.5; spec/acceptance/02-people-
// and-devices.md AC-02-42; spec/acceptance/10-api-and-sync.md AC-10-19, 22, 32; BACKLOG 2.5.4,
// C113, C114, C122, C123; ADR-095, 106, 120, 438, 443, 456 (3)(d), (5)(d), 462; REQ-202b). NIST
// SP 800-63B-4 §3.2.2 and its session chapter; OWASP ASVS 5.0 6.3.1, 7.2.4, 7.4.1, 16.3.1. The
// real process, in this test's own memory, on the installation's database as `adms_api`: it
// needs `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts).
import { randomUUID } from 'node:crypto';

import {
  endpoints,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  openPasscodeSessionOnPhoneEndpoint,
  passcodeSessionOpenedAnswerSchema,
  phoneMonitorAnswerSchema,
  reportUnplannedAssignmentEndpoint,
  unplannedAssignmentAnswerSchema,
} from '@open-adms/contracts';
import { masterPasscodeActorId, type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone, passcode, proven, type TestPhone } from './support/phones.ts';
import { danasEmail, long, worldOn, type Answer, type Served } from './support/served.ts';
import { p1Priced, told } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const wrongPasscode = 'heron-landing-marsh';
const refused = [401, 'MASTER_PASSCODE_REFUSED'];
const notSignedIn = [401, 'NOT_SIGNED_IN'];
const twelveHours = 12 * 3600;
// 6:30 am on Monday in Bayline County (UTC−04:00 in October), and 6 pm that day.
const mondayMorning = new Date('2026-10-12T10:30:00Z');
const mondayEvening = new Date('2026-10-12T22:00:00Z');
// Monday ends there at 04:00 UTC on Tuesday.
const mondayEnds = '2026-10-13T04:00:00.000Z';

const open = (served: Served, bearer: string | undefined, payload: object): Promise<Answer> =>
  served.ask('POST', openPasscodeSessionOnPhoneEndpoint.path, {
    payload,
    ...(bearer === undefined ? {} : { bearer }),
  });

// A session that must open: what the phone is answered.
async function opened(served: Served, bearer: string, personId: string, kind: string) {
  const answer = await open(served, bearer, { personId, kind, passcode });
  expect(told(answer), kind).toEqual([200, undefined]);
  return { ...passcodeSessionOpenedAnswerSchema.parse(answer.body), requestId: answer.requestId };
}

const whoIsOn = (served: Served, bearer: string, monitorSession: string): Promise<Answer> =>
  served.ask('GET', '/phones/current/monitor', { bearer, monitorSession });

interface Monitor {
  readonly userId: string;
  readonly monitorNumber: string;
  readonly name: string;
  readonly password: string;
}

// P1 as Dana prices it; the Landfill tower's phone, enrolled and proven; Tariq Patel and Lee
// Morgan, created on it, neither with an assignment.
async function theTowersPhone(served: Served, tx: Tx, at = mondayMorning) {
  served.clock.at = at;
  const dana = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx);
  const phone = await enrolledPhone(served, tx, 'P1-TWR-LF');
  const token = await proven(served, phone);
  const created = async (name: string, password: string): Promise<Monitor> => {
    const made = await served.ask('POST', '/phones/current/monitors', {
      bearer: token,
      payload: { name, password, passcode },
    });
    expect(told(made), name).toEqual([200, undefined]);
    return { ...monitorCreatedAnswerSchema.parse(made.body), password };
  };
  const tariq = await created('Tariq Patel', '5550177');
  const lee = await created('Lee Morgan', '5550142');
  // The supervisor sets the phone up for a monitor, on Monday by its own clock: reported.
  const setUpFor = async (monitor: Monitor): Promise<string> => {
    const id = randomUUID();
    const answer = await served.ask('POST', reportUnplannedAssignmentEndpoint.path, {
      bearer: token,
      payload: {
        id,
        projectId: priced.project.id,
        personId: monitor.userId,
        fieldEventKinds: ['DISPOSAL'],
        certifying: false,
        formDocumentTypes: [],
        siteId: null,
        payItemIds: [],
        occasion: 'SETUP',
        madeAt: mondayMorning.toISOString(),
        deviceUtcOffsetMinutes: -240,
      },
    });
    expect(unplannedAssignmentAnswerSchema.parse(answer.body).answer).toBe('SAVED');
    return id;
  };
  return { dana, priced, phone, token, tariq, lee, setUpFor };
}

// The monitor signs in on the phone with their own ID and password: their session's token.
async function signedIn(served: Served, token: string, monitor: Monitor): Promise<string> {
  const answer = await served.ask('POST', '/phones/current/sign-ins', {
    bearer: token,
    payload: { monitorNumber: monitor.monitorNumber, password: monitor.password },
  });
  expect(told(answer)).toEqual([200, undefined]);
  return monitorSignedInAnswerSchema.parse(answer.body).token;
}

const sessions = async (tx: Tx, phone: TestPhone) =>
  (
    await tx.session.findMany({
      where: { deviceId: phone.id },
      orderBy: { id: 'asc' },
      select: {
        userId: true,
        masterPasscodeSession: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    })
  ).map((row) => [
    row.userId,
    row.masterPasscodeSession,
    row.createdAt.toISOString(),
    row.expiresAt.toISOString(),
    row.revokedAt?.toISOString() ?? null,
  ]);

const events = async (tx: Tx, requestId: string) =>
  (
    await tx.securityEvent.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: { kind: true, userId: true, deviceId: true, occurredAt: true },
    })
  ).map((event) => [event.kind, event.userId, event.deviceId, event.occurredAt.toISOString()]);

const audited = async (tx: Tx, requestId: string) =>
  (
    await tx.auditRecord.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: { tableName: true, operation: true, actorId: true, source: true, deviceId: true },
    })
  ).map((record) => Object.values(record));

const tries = (tx: Tx, version: number) =>
  tx.masterPasscodeTries.findUnique({
    where: { version },
    select: { failedTries: true, lockedUntil: true },
  });

describe('who may open a session under the master passcode', () => {
  it('AC-02-42 it takes a phone that has proved itself and the master passcode: no token, a back-office session or a request that isn’t whole opens nothing, and no passcode is tried', async () => {
    const { access, roles, permission } =
      endpoints.find(({ name }) => name === 'openPasscodeSessionOnPhone') ?? {};
    expect([access, roles, permission]).toEqual(['PROVEN_PHONE', undefined, undefined]);
    await world(async (served, tx) => {
      const { dana, phone, token, tariq } = await theTowersPhone(served, tx);
      const asked = { personId: tariq.userId, kind: 'AS_MONITOR', passcode };
      const notProven = [401, 'PHONE_NOT_PROVEN'];
      expect(told(await open(served, undefined, asked))).toEqual(notProven);
      expect(told(await open(served, 'not-a-token', asked))).toEqual(notProven);
      const asDana = await served.ask('POST', openPasscodeSessionOnPhoneEndpoint.path, {
        payload: asked,
        cookies: dana.cookies,
        csrf: dana.csrf,
      });
      expect(told(asDana)).toEqual(notProven);
      for (const body of [
        { personId: tariq.userId, kind: 'AS_MONITOR' },
        { personId: tariq.userId, passcode },
        { kind: 'AS_MONITOR', passcode },
        { ...asked, kind: 'SUPERVISOR' },
        { ...asked, personId: tariq.monitorNumber },
        { ...asked, passcode: '' },
        { ...asked, expiresAt: '2027-01-01T00:00:00Z' },
      ]) {
        expect(told(await open(served, token, body)), JSON.stringify(body)).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
      expect(await sessions(tx, phone)).toEqual([]);
      expect(await tries(tx, phone.masterPasscodeVersion)).toBeNull();
    });
  });

  it('a phone taken out of service opens none, whatever passcode it sends, and its try is never a wrong try', async () => {
    await world(async (served, tx) => {
      const { phone, tariq } = await theTowersPhone(served, tx);
      await tx.device.update({
        where: { id: phone.id },
        data: { status: 'LOST', outOfServiceAt: new Date('2026-10-12T22:10:00.000Z') },
      });
      served.clock.at = new Date('2026-10-13T12:00:00.000Z');
      const token = await proven(served, phone);
      for (const given of [passcode, wrongPasscode]) {
        const answer = await open(served, token, {
          personId: tariq.userId,
          kind: 'TEMPORARY',
          passcode: given,
        });
        expect([told(answer), (answer.body as { message?: string }).message]).toEqual([
          [409, 'PHONE_OUT_OF_SERVICE'],
          'Not opened: this phone was taken out of service. A session is opened on a phone in service.',
        ]);
        expect(await audited(tx, answer.requestId)).toEqual([]);
      }
      expect(await sessions(tx, phone)).toEqual([]);
      expect(await tries(tx, phone.masterPasscodeVersion)).toBeNull();
    });
  });

  it('it is for a field monitor in service: for somebody of the back office, a monitor archived or an id nobody has, it opens nothing and says so in plain words to whoever holds the passcode; no wrong try, and no use is written', async () => {
    await world(async (served, tx) => {
      const { phone, token, tariq, lee } = await theTowersPhone(served, tx);
      const dana = await tx.user.findFirstOrThrow({
        where: { email: danasEmail },
        select: { id: true },
      });
      await tx.user.update({ where: { id: lee.userId }, data: { archivedAt: mondayMorning } });
      for (const personId of [dana.id, lee.userId, randomUUID()]) {
        const answer = await open(served, token, { personId, kind: 'TEMPORARY', passcode });
        expect([told(answer), (answer.body as { message?: string }).message], personId).toEqual([
          [422, 'NOT_A_MONITOR'],
          'Not opened: a session under the master passcode is for a field monitor in service. Pick the monitor from the phone’s list.',
        ]);
        expect(await audited(tx, answer.requestId)).toEqual([]);
      }
      expect(await sessions(tx, phone)).toEqual([]);
      expect(await tries(tx, phone.masterPasscodeVersion)).toBeNull();
      // A wrong passcode is told nothing of who is a monitor: one code, before anybody is read.
      const wrong = await open(served, token, {
        personId: dana.id,
        kind: 'TEMPORARY',
        passcode: wrongPasscode,
      });
      expect(told(wrong)).toEqual(refused);
      const forTariq = await open(served, token, {
        personId: tariq.userId,
        kind: 'TEMPORARY',
        passcode: wrongPasscode,
      });
      expect(told(forTariq)).toEqual(refused);
    });
  });
});

describe('a session opened under the master passcode', () => {
  it('AC-02-42 as the phone’s monitor: the supervisor signs in as Tariq with the passcode. The session is Tariq’s on that phone, marked as the master passcode’s, written as the master passcode’s actor with a use of the passcode naming the phone and Tariq; it lasts as a monitor’s own, and the phone takes his assignment', async () => {
    await world(async (served, tx) => {
      const { phone, token, tariq, setUpFor } = await theTowersPhone(served, tx);
      const assignmentId = await setUpFor(tariq);
      const made = await opened(served, token, tariq.userId, 'AS_MONITOR');
      expect([
        made.userId,
        made.monitorNumber,
        made.name,
        made.masterPasscodeSession,
        made.expiresInSeconds,
        made.assignment?.id,
        made.noAssignment,
      ]).toEqual([
        tariq.userId,
        tariq.monitorNumber,
        'Tariq Patel',
        'AS_MONITOR',
        twelveHours,
        assignmentId,
        null,
      ]);
      const at = mondayMorning.toISOString();
      expect(await sessions(tx, phone)).toEqual([
        [tariq.userId, 'AS_MONITOR', at, '2026-10-12T22:30:00.000Z', null],
      ]);
      // Whoever held the passcode is not known: the records name the passcode, never Tariq.
      const written = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, made.requestId)).toEqual([
        ['security_event', 'INSERT', ...written],
        ['session', 'INSERT', ...written],
      ]);
      expect(await events(tx, made.requestId)).toEqual([
        ['MASTER_PASSCODE_USE', tariq.userId, phone.id, at],
      ]);
      // The phone's calls carry its token as a monitor's own, and are told which it is.
      const now = await whoIsOn(served, token, made.token);
      expect(told(now)).toEqual([200, undefined]);
      expect(phoneMonitorAnswerSchema.parse(now.body)).toEqual({
        userId: tariq.userId,
        monitorNumber: tariq.monitorNumber,
        name: 'Tariq Patel',
        expiresInSeconds: twelveHours,
        masterPasscodeSession: 'AS_MONITOR',
      });
      // Nothing the server keeps is the token.
      expect(
        await tx.session.count({ where: { refreshTokenHash: { contains: made.token } } }),
      ).toBe(0);
    });
  });

  it('AC-02-42 the temporary session, for a monitor picked from the roster: marked as that, and it ends at the end of the project’s day, by the project’s own time zone; after it the monitor signs in properly', async () => {
    await world(async (served, tx) => {
      // 6 pm on Monday in Bayline County: the day has six hours left.
      const { phone, token, lee, setUpFor } = await theTowersPhone(served, tx, mondayEvening);
      await setUpFor(lee);
      const made = await opened(served, token, lee.userId, 'TEMPORARY');
      expect([made.masterPasscodeSession, made.expiresInSeconds, made.name]).toEqual([
        'TEMPORARY',
        6 * 3600,
        'Lee Morgan',
      ]);
      expect(await sessions(tx, phone)).toEqual([
        [lee.userId, 'TEMPORARY', mondayEvening.toISOString(), mondayEnds, null],
      ]);
      // A second before midnight there it stands; at midnight it has ended.
      served.clock.at = new Date('2026-10-13T03:59:59Z');
      const late = await proven(served, phone);
      const before = await whoIsOn(served, late, made.token);
      expect(phoneMonitorAnswerSchema.parse(before.body)).toMatchObject({
        expiresInSeconds: 1,
        masterPasscodeSession: 'TEMPORARY',
      });
      served.clock.at = new Date(mondayEnds);
      expect(told(await whoIsOn(served, late, made.token))).toEqual(notSignedIn);
      // Lee's own sign-in is unmarked and lasts its twelve hours.
      const own = await signedIn(served, late, lee);
      expect(phoneMonitorAnswerSchema.parse((await whoIsOn(served, late, own)).body)).toMatchObject(
        {
          expiresInSeconds: twelveHours,
          masterPasscodeSession: null,
        },
      );
    });
  });

  it('ADR-462 a temporary session never outlasts a monitor’s own sign-in, and with no assignment for the phone to take there is no project’s day: the hours alone end it', async () => {
    await world(async (served, tx) => {
      // 6:30 am: midnight is seventeen and a half hours off.
      const { phone, token, tariq, lee, setUpFor } = await theTowersPhone(served, tx);
      await setUpFor(tariq);
      const early = await opened(served, token, tariq.userId, 'TEMPORARY');
      expect([early.expiresInSeconds, early.assignment === null]).toEqual([twelveHours, false]);
      // Lee has no assignment that day: opened all the same, and told there is none.
      served.clock.at = mondayEvening;
      const late = await proven(served, phone);
      const none = await opened(served, late, lee.userId, 'TEMPORARY');
      expect([none.expiresInSeconds, none.assignment, none.noAssignment]).toEqual([
        twelveHours,
        null,
        'NONE_THAT_DAY',
      ]);
      // As the phone's monitor it lasts its hours whatever the day: Tariq's, opened at 6 pm
      // with six hours of Monday left, is twelve; the temporary one then would be six.
      const asTariq = await opened(served, late, tariq.userId, 'AS_MONITOR');
      expect(asTariq.expiresInSeconds).toBe(twelveHours);
      expect((await opened(served, late, tariq.userId, 'TEMPORARY')).expiresInSeconds).toBe(
        6 * 3600,
      );
    });
  });

  it('ADR-456 (5)(d) one monitor at a time on a phone: a session under the passcode ends whoever was signed in on it, and a monitor’s own sign-in ends a session under the passcode', async () => {
    await world(async (served, tx) => {
      const { phone, token, tariq, lee } = await theTowersPhone(served, tx);
      const lees = await signedIn(served, token, lee);
      expect(told(await whoIsOn(served, token, lees))).toEqual([200, undefined]);
      served.clock.later(1);
      const made = await opened(served, token, tariq.userId, 'TEMPORARY');
      expect(told(await whoIsOn(served, token, lees))).toEqual(notSignedIn);
      expect(told(await whoIsOn(served, token, made.token))).toEqual([200, undefined]);
      const written = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, made.requestId)).toEqual([
        ['session', 'UPDATE', ...written],
        ['security_event', 'INSERT', ...written],
        ['session', 'INSERT', ...written],
      ]);
      // One opened again for the same monitor ends the first: a token is good for one session.
      served.clock.later(1);
      const again = await opened(served, token, tariq.userId, 'AS_MONITOR');
      expect(told(await whoIsOn(served, token, made.token))).toEqual(notSignedIn);
      served.clock.later(1);
      const own = await signedIn(served, token, lee);
      expect(told(await whoIsOn(served, token, again.token))).toEqual(notSignedIn);
      expect(told(await whoIsOn(served, token, own))).toEqual([200, undefined]);
      expect(
        (await sessions(tx, phone)).map(([userId, kind, , , revoked]) => [
          userId,
          kind,
          revoked !== null,
        ]),
      ).toEqual([
        [lee.userId, null, true],
        [tariq.userId, 'TEMPORARY', true],
        [tariq.userId, 'AS_MONITOR', true],
        [lee.userId, null, false],
      ]);
    });
  });

  it('it ends as a monitor’s own does: signed out, and when the monitor is archived', async () => {
    await world(async (served, tx) => {
      const { token, tariq, lee } = await theTowersPhone(served, tx);
      const first = await opened(served, token, tariq.userId, 'TEMPORARY');
      const out = await served.ask('POST', '/phones/current/sign-outs', {
        bearer: token,
        monitorSession: first.token,
      });
      expect(told(out)).toEqual([200, undefined]);
      expect(told(await whoIsOn(served, token, first.token))).toEqual(notSignedIn);
      const second = await opened(served, token, lee.userId, 'AS_MONITOR');
      await tx.user.update({ where: { id: lee.userId }, data: { archivedAt: mondayMorning } });
      expect(told(await whoIsOn(served, token, second.token))).toEqual(notSignedIn);
    });
  });
});

describe('the passcode it is opened under', () => {
  it('AC-10-22 a wrong passcode opens nothing and is refused by one code; it is a security event naming the phone, counted on the one record of the version in force; a right one starts the count again', async () => {
    await world(async (served, tx) => {
      const { phone, token, tariq } = await theTowersPhone(served, tx);
      const version = phone.masterPasscodeVersion;
      const wrong = await open(served, token, {
        personId: tariq.userId,
        kind: 'AS_MONITOR',
        passcode: wrongPasscode,
      });
      expect(told(wrong)).toEqual(refused);
      expect(Object.keys(wrong.body as object).sort()).toEqual(['code', 'requestId']);
      const written = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, wrong.requestId)).toEqual([
        ['master_passcode_tries', 'INSERT', ...written],
        ['security_event', 'INSERT', ...written],
      ]);
      expect(await events(tx, wrong.requestId)).toEqual([
        ['MASTER_PASSCODE_FAILED', null, phone.id, mondayMorning.toISOString()],
      ]);
      expect(await tries(tx, version)).toEqual({ failedTries: 1, lockedUntil: null });
      expect(await sessions(tx, phone)).toEqual([]);
      await opened(served, token, tariq.userId, 'AS_MONITOR');
      expect(await tries(tx, version)).toEqual({ failedTries: 0, lockedUntil: null });
      expect((await sessions(tx, phone)).length).toBe(1);
    });
  });

  it('AC-10-22 while the passcode waits after wrong tries the right one opens nothing either, and nothing is written; one address is stopped at its own fourth', async () => {
    await world(async (served, tx) => {
      const { phone, token, tariq } = await theTowersPhone(served, tx);
      const asked = { personId: tariq.userId, kind: 'AS_MONITOR' };
      for (let tried = 0; tried < 4; tried += 1) {
        expect(told(await open(served, token, { ...asked, passcode: wrongPasscode }))).toEqual(
          refused,
        );
      }
      // The address's fifth is stopped before the passcode is touched.
      const limited = await open(served, token, { ...asked, passcode });
      expect(told(limited)).toEqual([429, 'LIMITED']);
      expect(await tries(tx, phone.masterPasscodeVersion)).toMatchObject({ failedTries: 4 });
      served.from = '198.51.100.11';
      expect(told(await open(served, token, { ...asked, passcode: wrongPasscode }))).toEqual(
        refused,
      );
      // The fifth wrong try in a row: the passcode waits, wherever the next comes from.
      served.from = '198.51.100.12';
      const waiting = await open(served, token, { ...asked, passcode });
      expect(told(waiting)).toEqual(refused);
      expect(await audited(tx, waiting.requestId)).toEqual([]);
      expect(await sessions(tx, phone)).toEqual([]);
    });
  });
});

describe('the log', () => {
  it('AC-10-32 says that a session was opened under the master passcode, on which phone, for whom and which way, by id: never the passcode, the token, the monitor’s name or their number; and why one was refused, by code', async () => {
    await world(async (served, tx) => {
      const { phone, token, tariq, setUpFor } = await theTowersPhone(served, tx);
      const assignmentId = await setUpFor(tariq);
      const from = served.lines.length;
      await open(served, token, {
        personId: tariq.userId,
        kind: 'TEMPORARY',
        passcode: wrongPasscode,
      });
      const made = await opened(served, token, tariq.userId, 'TEMPORARY');
      const lines = served.lines.slice(from);
      const said = lines
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((line) => String(line['msg']).includes('under the master passcode'))
        .map((line) => [
          line['msg'],
          line['why'],
          line['deviceId'],
          line['userId'],
          line['masterPasscodeSession'],
          line['assignmentId'],
        ]);
      expect(said).toEqual([
        [
          'A session under the master passcode was refused.',
          'WRONG',
          phone.id,
          undefined,
          undefined,
          undefined,
        ],
        [
          'A session was opened on a phone under the master passcode.',
          undefined,
          phone.id,
          tariq.userId,
          'TEMPORARY',
          assignmentId,
        ],
      ]);
      const text = lines.join('\n');
      for (const never of [
        passcode,
        wrongPasscode,
        made.token,
        token,
        'Tariq',
        tariq.monitorNumber,
      ]) {
        expect(text.includes(never), never).toBe(false);
      }
    });
  });
});
