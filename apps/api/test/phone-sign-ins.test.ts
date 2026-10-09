// A monitor signs in on a phone, online, against the database (ARCHITECTURE §6, Device sessions,
// Abuse; §7.2; spec/acceptance/02-people-and-devices.md AC-02-39; spec/acceptance/10-api-and-
// sync.md AC-10-18, 19, 32; BACKLOG 2.5.2, C90, C112, C113; ADR-105, 134, 409, 417, 440, 441,
// 443). NIST SP 800-63B-4 §2.2.3, §3.2.2, §5.1; OWASP ASVS 5.0 V6, V7, V16. The real process,
// in this test's own memory, on the installation's database as `adms_api`: it needs `pnpm
// local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts).
import {
  endpoints,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  phoneMonitorAnswerSchema,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationPolicy } from '../src/policy.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone, passcode, proven, type TestPhone } from './support/phones.ts';
import { notTaken } from './support/review.ts';
import { danasEmail, long, worldOn, type Answer, type Served } from './support/served.ts';
import { told } from './support/setup.ts';
import { Outbox } from './support/sign-in.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const refused = [401, 'SIGN_IN_REFUSED'];
const notSignedIn = [401, 'NOT_SIGNED_IN'];
const twelveHours = 12 * 3600;

// The firm's practice: a monitor's own phone number without the area code (ADR-105).
interface Monitor {
  readonly userId: string;
  readonly monitorNumber: string;
  readonly password: string;
}

// A monitor created as a real one is: on a proven phone, under the master passcode (ADR-442).
async function created(
  served: Served,
  token: string,
  name: string,
  password: string,
): Promise<Monitor> {
  const answer = await served.ask('POST', '/phones/current/monitors', {
    bearer: token,
    payload: { name, password, passcode },
  });
  expect(told(answer), `creating ${name}`).toEqual([200, undefined]);
  const { userId, monitorNumber } = monitorCreatedAnswerSchema.parse(answer.body);
  return { userId, monitorNumber, password };
}

const signIn = (served: Served, bearer: string | undefined, body: object): Promise<Answer> =>
  served.ask('POST', '/phones/current/sign-ins', {
    payload: body,
    ...(bearer === undefined ? {} : { bearer }),
  });

// A sign-in that must work: the monitor's session token.
async function signedIn(served: Served, bearer: string, monitor: Monitor): Promise<string> {
  const answer = await signIn(served, bearer, {
    monitorNumber: monitor.monitorNumber,
    password: monitor.password,
  });
  expect(told(answer)).toEqual([200, undefined]);
  return monitorSignedInAnswerSchema.parse(answer.body).token;
}

const whoIsOn = (served: Served, bearer?: string, monitorSession?: string): Promise<Answer> =>
  served.ask('GET', '/phones/current/monitor', {
    ...(bearer === undefined ? {} : { bearer }),
    ...(monitorSession === undefined ? {} : { monitorSession }),
  });

// The phone and Lee Morgan, created on it; the phone's token.
async function leeOn(
  served: Served,
  tx: Tx,
  name = 'P1-COL-1',
): Promise<{ phone: TestPhone; token: string; lee: Monitor }> {
  const phone = await enrolledPhone(served, tx, name);
  const token = await proven(served, phone);
  const lee = await created(served, token, 'Lee Morgan', '5550142');
  return { phone, token, lee };
}

const events = async (tx: Tx, requestId: string) =>
  (
    await tx.securityEvent.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: { kind: true, userId: true, deviceId: true },
    })
  ).map((event) => Object.values(event));

const audited = async (tx: Tx, requestId: string) =>
  (
    await tx.auditRecord.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: { tableName: true, operation: true, actorId: true, source: true, deviceId: true },
    })
  ).map((record) => Object.values(record));

const tries = (tx: Tx, userId: string) =>
  tx.userCredential.findUniqueOrThrow({
    where: { userId },
    select: { failedSignIns: true, lockedUntil: true },
  });

describe('who may sign in on a phone', () => {
  it('AC-02-39 a monitor’s ID and password open a session only from a phone that has proved itself: with no proof, with a back-office session, or at the back office’s sign-in they open nothing; a back-office user can’t sign in on a phone', async () => {
    // The exact lists: a new one is added here on purpose.
    expect(
      endpoints
        .filter(({ access }) => access === 'MONITOR_ON_PHONE')
        .map(({ name, roles, permission }) => [name, roles, permission]),
    ).toEqual([
      ['signOutOnPhone', undefined, undefined],
      ['phoneMonitor', undefined, undefined],
    ]);
    await world(async (served, tx) => {
      const { token, lee } = await leeOn(served, tx);
      const whole = { monitorNumber: lee.monitorNumber, password: lee.password };
      expect(told(await signIn(served, undefined, whole))).toEqual([401, 'PHONE_NOT_PROVEN']);
      expect(told(await signIn(served, 'not-a-token', whole))).toEqual([401, 'PHONE_NOT_PROVEN']);
      const dana = await served.signedIn(danasEmail, long);
      const asDana = await served.ask('POST', '/phones/current/sign-ins', {
        cookies: dana.cookies,
        csrf: dana.csrf,
        payload: whole,
      });
      expect(told(asDana)).toEqual([401, 'PHONE_NOT_PROVEN']);
      // The back office's sign-in takes an email address, and refuses a monitor whatever is typed.
      for (const email of [lee.monitorNumber, `${lee.monitorNumber}@gates.example`]) {
        const atTheOffice = await served.ask('POST', '/sessions', {
          payload: { email, password: lee.password },
        });
        expect(told(atTheOffice), email).toEqual(refused);
      }
      // Dana on a phone, with her own password: she has no Monitor ID.
      expect(
        told(await signIn(served, token, { monitorNumber: 'dana.reyes', password: long })),
      ).toEqual(refused);
      const notWhole: [object, string][] = [
        [{ monitorNumber: lee.monitorNumber }, 'password in the body is missing.'],
        [{ password: lee.password }, 'monitorNumber in the body is missing.'],
        [{ ...whole, monitorNumber: ' ' }, 'monitorNumber in the body is blank.'],
        [{ ...whole, passcode }, 'the body has a field this request doesn’t take.'],
      ];
      for (const [body, words] of notWhole) {
        const answer = await signIn(served, token, body);
        expect(told(answer), words).toEqual([400, 'BAD_REQUEST']);
        expect(notTaken(answer), words).toContain(words);
      }
      expect(await tx.session.count({ where: { userId: lee.userId } })).toBe(0);
      expect(await tries(tx, lee.userId)).toEqual({ failedSignIns: 0, lockedUntil: null });
    });
  });

  it('ADR-441 (6)(c) a phone taken out of service signs nobody in, and its try is never a wrong try; a monitor signed in on it before keeps their session, to hand its work over', async () => {
    await world(async (served, tx) => {
      const { phone, token, lee } = await leeOn(served, tx);
      const session = await signedIn(served, token, lee);
      await tx.device.update({
        where: { id: phone.id },
        data: { status: 'LOST', outOfServiceAt: served.clock.now() },
      });
      for (const password of [lee.password, '5550143']) {
        const answer = await signIn(served, token, { monitorNumber: lee.monitorNumber, password });
        expect([told(answer), (answer.body as { message?: string }).message]).toEqual([
          [409, 'PHONE_OUT_OF_SERVICE'],
          'Not signed in: this phone was taken out of service. A monitor signs in on a phone in service.',
        ]);
        expect(await audited(tx, answer.requestId)).toEqual([]);
      }
      expect(await tries(tx, lee.userId)).toEqual({ failedSignIns: 0, lockedUntil: null });
      expect(told(await whoIsOn(served, token, session))).toEqual([200, undefined]);
    });
  });
});

describe('a monitor signs in on a phone', () => {
  it('AC-02-39 Lee Morgan signs in on P1-COL-1 with their Monitor ID and password: the session names the phone and lasts twelve hours, its token is kept only as a hash, and the records are Lee’s, from that phone', async () => {
    await world(async (served, tx) => {
      // 6:45 am in Bayline County, at the staging area. A Monitor ID typed in lower case is taken.
      served.clock.at = new Date('2026-10-12T10:45:00Z');
      const { phone, token, lee } = await leeOn(served, tx);
      const answer = await signIn(served, token, {
        monitorNumber: ` ${lee.monitorNumber.toLowerCase()} `,
        password: lee.password,
      });
      expect(told(answer)).toEqual([200, undefined]);
      const made = monitorSignedInAnswerSchema.parse(answer.body);
      expect(made).toMatchObject({
        userId: lee.userId,
        monitorNumber: lee.monitorNumber,
        name: 'Lee Morgan',
        expiresInSeconds: twelveHours,
      });
      const [sessionId] = made.token.split('.');
      const kept = await tx.session.findUniqueOrThrow({ where: { id: sessionId ?? '' } });
      expect(kept).toMatchObject({
        userId: lee.userId,
        deviceId: phone.id,
        createdAt: new Date('2026-10-12T10:45:00Z'),
        expiresAt: new Date('2026-10-12T22:45:00Z'),
        revokedAt: null,
      });
      expect(kept.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(made.token.includes(kept.refreshTokenHash)).toBe(false);
      const written = [lee.userId, 'DEVICE', phone.id];
      expect(await audited(tx, answer.requestId)).toEqual([
        ['security_event', 'INSERT', ...written],
        ['session', 'INSERT', ...written],
      ]);
      expect(await events(tx, answer.requestId)).toEqual([['SIGN_IN', lee.userId, phone.id]]);
      const now = await whoIsOn(served, token, made.token);
      expect(told(now)).toEqual([200, undefined]);
      expect(phoneMonitorAnswerSchema.parse(now.body)).toEqual({
        userId: lee.userId,
        monitorNumber: lee.monitorNumber,
        name: 'Lee Morgan',
        expiresInSeconds: twelveHours,
      });
    });
  });

  it('ADR-441 (6)(b) the session takes the phone and the monitor together, and lasts the shift: quiet doesn’t end it, twelve hours do', async () => {
    await world(async (served, tx) => {
      const { phone, token, lee } = await leeOn(served, tx);
      const session = await signedIn(served, token, lee);
      // The monitor's token alone, or on another phone, opens nothing.
      expect(told(await whoIsOn(served, undefined, session))).toEqual([401, 'PHONE_NOT_PROVEN']);
      expect(told(await whoIsOn(served, token))).toEqual(notSignedIn);
      expect(told(await whoIsOn(served, token, 'not-a-session'))).toEqual(notSignedIn);
      // The session's id with a secret that isn't its own: the server holds only the hash.
      const [sessionId] = session.split('.');
      const guessed = `${sessionId ?? ''}.${'A'.repeat(43)}`;
      expect(told(await whoIsOn(served, token, guessed))).toEqual(notSignedIn);
      // Sent to the back office as a session's cookies, it is no back-office session.
      for (const [url, cookies] of [
        ['/sessions/csrf', { '__Host-adms-refresh': session }],
        ['/sessions/current', { '__Host-adms-access': session }],
      ] as const) {
        expect(told(await served.ask('GET', url, { cookies })), url).toEqual(notSignedIn);
      }
      const other = await enrolledPhone(served, tx, 'P1-COL-2');
      expect(told(await whoIsOn(served, await proven(served, other), session))).toEqual(
        notSignedIn,
      );
      // Out of signal all day: eleven hours and fifty-nine minutes later, with a fresh proof.
      served.clock.later(11 * 60 + 59);
      const later = await proven(served, phone);
      const asked = await whoIsOn(served, later, session);
      expect(told(asked)).toEqual([200, undefined]);
      expect(phoneMonitorAnswerSchema.parse(asked.body).expiresInSeconds).toBe(60);
      served.clock.later(1);
      expect(told(await whoIsOn(served, await proven(served, phone), session))).toEqual(
        notSignedIn,
      );
    });
  });
});

describe('a monitor’s session ends at once', () => {
  it('ASVS 7.4.1 when they sign out, and when another monitor signs in on the phone: one monitor at a time', async () => {
    await world(async (served, tx) => {
      const { token, lee } = await leeOn(served, tx);
      const first = await signedIn(served, token, lee);
      const out = await served.ask('POST', '/phones/current/sign-outs', {
        bearer: token,
        monitorSession: first,
      });
      expect([told(out), out.body]).toEqual([[200, undefined], { status: 'signed-out' }]);
      expect(told(await whoIsOn(served, token, first))).toEqual(notSignedIn);
      expect(
        told(
          await served.ask('POST', '/phones/current/sign-outs', {
            bearer: token,
            monitorSession: first,
          }),
        ),
      ).toEqual(notSignedIn);
      const again = await signedIn(served, token, lee);
      const sam = await created(served, token, 'Sam Grant', '5550177');
      const samsSession = await signedIn(served, token, sam);
      expect(told(await whoIsOn(served, token, again))).toEqual(notSignedIn);
      expect(told(await whoIsOn(served, token, samsSession))).toEqual([200, undefined]);
    });
  });

  it('ASVS 7.4.2 when an admin sets their password anew or archives them, and when the phone’s key is revoked', async () => {
    await world(async (served, tx) => {
      const { phone, token, lee } = await leeOn(served, tx);
      const session = await signedIn(served, token, lee);
      const dana = await served.signedIn(danasEmail, long);
      const set = await served.ask('POST', `/people/${lee.userId}/passwords`, {
        cookies: dana.cookies,
        csrf: dana.csrf,
        payload: { password: '5550199' },
      });
      expect(told(set)).toEqual([200, undefined]);
      expect(told(await whoIsOn(served, token, session))).toEqual(notSignedIn);
      expect(
        told(
          await signIn(served, token, { monitorNumber: lee.monitorNumber, password: lee.password }),
        ),
      ).toEqual(refused);
      const second = await signedIn(served, token, { ...lee, password: '5550199' });
      const archived = await served.ask('POST', `/people/${lee.userId}/archivings`, {
        cookies: dana.cookies,
        csrf: dana.csrf,
      });
      expect(told(archived)).toEqual([200, undefined]);
      expect(told(await whoIsOn(served, token, second))).toEqual(notSignedIn);
      expect(
        told(
          await signIn(served, token, { monitorNumber: lee.monitorNumber, password: '5550199' }),
        ),
      ).toEqual(refused);
      // Sam, on the same phone: the phone is lost, synced, confirmed and wiped.
      const sam = await created(served, token, 'Sam Grant', '5550177');
      const samsSession = await signedIn(served, token, sam);
      await tx.device.update({
        where: { id: phone.id },
        data: { status: 'LOST', outOfServiceAt: served.clock.now() },
      });
      expect(told(await whoIsOn(served, token, samsSession))).toEqual([200, undefined]);
      await tx.device.update({
        where: { id: phone.id },
        data: { keyRevokedAt: served.clock.now() },
      });
      expect(told(await whoIsOn(served, token, samsSession))).toEqual([401, 'PHONE_NOT_PROVEN']);
    });
  });
});

describe('wrong tries at a monitor’s login on a phone', () => {
  it('AC-10-18, AC-10-19 are refused by one code, counted on the monitor’s own record and written as security events naming the phone; a Monitor ID nobody has writes nothing; a right one starts the count again', async () => {
    await world(async (served, tx) => {
      const { phone, token, lee } = await leeOn(served, tx);
      const nobody = await signIn(served, token, { monitorNumber: 'M999999', password: '5550142' });
      expect(told(nobody)).toEqual(refused);
      expect(Object.keys(nobody.body as object).sort()).toEqual(['code', 'requestId']);
      expect(await audited(tx, nobody.requestId)).toEqual([]);
      const wrong = await signIn(served, token, {
        monitorNumber: lee.monitorNumber,
        password: '5550143',
      });
      expect(told(wrong)).toEqual(refused);
      expect(await audited(tx, wrong.requestId)).toEqual([
        ['user_credential', 'UPDATE', lee.userId, 'DEVICE', phone.id],
        ['security_event', 'INSERT', lee.userId, 'DEVICE', phone.id],
      ]);
      expect(await events(tx, wrong.requestId)).toEqual([['SIGN_IN_FAILED', lee.userId, phone.id]]);
      expect(await tries(tx, lee.userId)).toEqual({ failedSignIns: 1, lockedUntil: null });
      await signedIn(served, token, lee);
      expect(await tries(tx, lee.userId)).toEqual({ failedSignIns: 0, lockedUntil: null });
    });
  });

  it('ADR-441 (6)(a) wait from the fifth in a row and lock at the policy’s count: while locked the right password is refused too, until an admin sets it anew; one address is stopped at its own fourth; a monitor isn’t mailed at the lock', async () => {
    const outbox = new Outbox();
    await world(
      async (served, tx) => {
        const { phone, token, lee } = await leeOn(served, tx);
        // Even a monitor the firm keeps an address for has no reset by email to be sent to.
        await tx.user.update({
          where: { id: lee.userId },
          data: { email: 'lee.morgan@gates.example' },
        });
        const wrongly = { monitorNumber: lee.monitorNumber, password: '5550143' };
        for (let wrong = 1; wrong <= 4; wrong += 1) {
          expect(told(await signIn(served, token, wrongly)), String(wrong)).toEqual(refused);
        }
        // The address's fifth is stopped before the login is touched, right or wrong.
        const limited = await signIn(served, token, { ...wrongly, password: lee.password });
        expect(told(limited)).toEqual([429, 'LIMITED']);
        expect(await audited(tx, limited.requestId)).toEqual([]);
        served.from = '198.51.100.21';
        expect(told(await signIn(served, token, wrongly))).toEqual(refused);
        const waiting = new Date(served.clock.now().getTime() + 30_000);
        expect(await tries(tx, lee.userId)).toEqual({ failedSignIns: 5, lockedUntil: waiting });
        // While it waits, the right password is refused and nothing is written.
        const during = await signIn(served, token, { ...wrongly, password: lee.password });
        expect(told(during)).toEqual(refused);
        expect(await audited(tx, during.requestId)).toEqual([]);
        served.clock.later(1);
        expect(told(await signIn(served, await proven(served, phone), wrongly))).toEqual(refused);
        served.clock.later(2);
        const fresh = await proven(served, phone);
        const locking = await signIn(served, fresh, wrongly);
        expect(told(locking)).toEqual(refused);
        expect(await events(tx, locking.requestId)).toEqual([
          ['SIGN_IN_FAILED', lee.userId, phone.id],
          ['LOCKOUT', lee.userId, phone.id],
        ]);
        expect(outbox.sent.filter(({ to }) => to === 'lee.morgan@gates.example')).toEqual([]);
        served.clock.later(120);
        served.from = '198.51.100.22';
        const later = await proven(served, phone);
        expect(told(await signIn(served, later, { ...wrongly, password: lee.password }))).toEqual(
          refused,
        );
        const dana = await served.signedIn(danasEmail, long);
        const set = await served.ask('POST', `/people/${lee.userId}/passwords`, {
          cookies: dana.cookies,
          csrf: dana.csrf,
          payload: { password: lee.password },
        });
        expect(told(set)).toEqual([200, undefined]);
        await signedIn(served, later, lee);
      },
      outbox,
      installationPolicy({ SIGN_IN_TRIES_BEFORE_LOCK: '7' }),
    );
  });
});

describe('a monitor’s calls on a phone', () => {
  it('AC-10-40 are counted for the monitor, whatever address they come from', async () => {
    await world(
      async (served, tx) => {
        const { token, lee } = await leeOn(served, tx);
        const session = await signedIn(served, token, lee);
        for (const from of ['198.51.100.31', '198.51.100.32', '198.51.100.33']) {
          served.from = from;
          expect(told(await whoIsOn(served, token, session)), from).toEqual([200, undefined]);
        }
        served.from = '198.51.100.34';
        expect(told(await whoIsOn(served, token, session))).toEqual([429, 'LIMITED']);
      },
      undefined,
      installationPolicy({ RATE_LIMIT_REQUESTS_PER_ACCOUNT: '3' }),
    );
  });
});

describe('the log', () => {
  it('AC-10-32 says that a monitor signed in or out on a phone, or why not, by code and id: never the Monitor ID, the password, the name or a token', async () => {
    await world(async (served, tx) => {
      const { phone, token, lee } = await leeOn(served, tx);
      expect(
        told(
          await signIn(served, token, { monitorNumber: lee.monitorNumber, password: '5550143' }),
        ),
      ).toEqual(refused);
      const session = await signedIn(served, token, lee);
      await served.ask('POST', '/phones/current/sign-outs', {
        bearer: token,
        monitorSession: session,
      });
      const parsed = served.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(
        parsed
          .filter(({ msg }) => /\b(signed (in|out)|sign-in) on a phone\b/i.test(String(msg)))
          .map(({ msg, why, deviceId, userId }) => [msg, why, deviceId, userId]),
      ).toEqual([
        ['A monitor’s sign-in on a phone was refused.', 'WRONG', phone.id, undefined],
        ['A monitor signed in on a phone.', undefined, phone.id, lee.userId],
        ['A monitor signed out on a phone.', undefined, phone.id, lee.userId],
      ]);
      const log = served.lines.join('\n');
      for (const secret of [
        lee.monitorNumber,
        lee.password,
        '5550143',
        'Lee Morgan',
        session,
        token,
      ]) {
        expect(log.includes(secret), secret).toBe(false);
      }
    });
  });
});
