// A monitor created on a phone under the master passcode, against the database (ARCHITECTURE
// §6, Abuse; §7.0, §7.5; spec/acceptance/02-people-and-devices.md AC-02-01, 07;
// spec/acceptance/10-api-and-sync.md AC-10-22, 32; BACKLOG 2.5.2, C111, C112; ADR-105, 120,
// 402 (5), 438, 441, 442). NIST SP 800-63B-4 §3.1.1.2, §3.2.2; OWASP ASVS 5.0 V6, V16. The real
// process, in this test's own memory, on the test database as `adms_api`: it needs
// `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts).
import {
  createMonitorOnPhoneEndpoint,
  endpoints,
  monitorCreatedAnswerSchema,
} from '@open-adms/contracts';
import { masterPasscodeActorId, type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PasswordHasher } from '../src/sign-in/password-hasher.ts';
import { testSettings, openTestDatabase, type Tx } from './support/database.ts';
import { enrolledPhone, passcode, proven, SoftwareKey } from './support/phones.ts';
import { notTaken } from './support/review.ts';
import { danasEmail, long, worldOn, type Answer, type Served } from './support/served.ts';
import { told } from './support/setup.ts';
import { passwordKey } from './support/sign-in.ts';

let db: Database;

beforeAll(() => {
  db = openTestDatabase(testSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const wrongPasscode = 'marsh-landing-osprey';
// The firm's practice: a monitor's own phone number without the area code (ADR-105).
const lee = { name: 'Lee Morgan', password: '5550142', phone: '850-555-0142' };
const refused = [401, 'MASTER_PASSCODE_REFUSED'];

const create = (served: Served, bearer: string | undefined, monitor: object): Promise<Answer> =>
  served.ask('POST', '/phones/current/monitors', {
    payload: monitor,
    ...(bearer === undefined ? {} : { bearer }),
  });

const tries = (tx: Tx, version: number) =>
  tx.masterPasscodeTries.findUnique({
    where: { version },
    select: { failedTries: true, lockedUntil: true },
  });

const events = async (tx: Tx, requestId: string) =>
  (
    await tx.securityEvent.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: { kind: true, userId: true, deviceId: true, occurredAt: true },
    })
  ).map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() }));

const audited = async (tx: Tx, requestId: string) =>
  (
    await tx.auditRecord.findMany({
      where: { requestId },
      orderBy: { id: 'asc' },
      select: { tableName: true, operation: true, actorId: true, source: true, deviceId: true },
    })
  ).map((record) => Object.values(record));

const monitors = (tx: Tx) => tx.user.count({ where: { role: 'MONITOR' } });

describe('who may create a monitor', () => {
  it('AC-02-07 it takes a phone that has proved itself and the master passcode: no token, a back-office session or a request that isn’t whole creates nobody, and no passcode is tried', async () => {
    const { access, roles, permission } =
      endpoints.find((one) => one === createMonitorOnPhoneEndpoint) ?? {};
    expect([access, roles, permission]).toEqual(['PROVEN_PHONE', undefined, undefined]);
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      const version = phone.masterPasscodeVersion;
      const before = await monitors(tx);
      const whole = { ...lee, passcode };
      // The right passcode with no proven phone opens nothing.
      expect(told(await create(served, undefined, whole))).toEqual([401, 'PHONE_NOT_PROVEN']);
      expect(told(await create(served, 'not-a-token', whole))).toEqual([401, 'PHONE_NOT_PROVEN']);
      const dana = await served.signedIn(danasEmail, long);
      const asDana = await served.ask('POST', '/phones/current/monitors', {
        cookies: dana.cookies,
        csrf: dana.csrf,
        payload: whole,
      });
      expect(told(asDana)).toEqual([401, 'PHONE_NOT_PROVEN']);
      const token = await proven(served, phone);
      const notWhole: [object, string][] = [
        [{ ...lee }, 'passcode in the body is missing.'],
        [{ name: lee.name, passcode }, 'password in the body is missing.'],
        [{ ...whole, name: ' ' }, 'name in the body is blank.'],
        // The Monitor ID is the system's: nobody types one.
        [{ ...whole, monitorNumber: 'M004132' }, 'the body has a field this request doesn’t take.'],
        [{ ...whole, role: 'ADMIN' }, 'the body has a field this request doesn’t take.'],
      ];
      for (const [monitor, words] of notWhole) {
        const answer = await create(served, token, monitor);
        expect(told(answer), words).toEqual([400, 'BAD_REQUEST']);
        expect(notTaken(answer), words).toContain(words);
      }
      expect(await monitors(tx)).toBe(before);
      expect(await tries(tx, version)).toBeNull();
    });
  });

  it('a phone taken out of service creates nobody, whatever passcode it sends, and its try is never a wrong try', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      await tx.device.update({
        where: { id: phone.id },
        data: {
          status: 'LOST',
          outOfServiceAt: new Date('2026-10-12T22:10:00.000Z'),
          outOfServiceMarkedAt: new Date('2026-10-12T22:10:00.000Z'),
        },
      });
      served.clock.at = new Date('2026-10-13T12:00:00.000Z');
      const token = await proven(served, phone);
      const before = await monitors(tx);
      for (const given of [passcode, wrongPasscode]) {
        const answer = await create(served, token, { ...lee, passcode: given });
        expect([told(answer), (answer.body as { message?: string }).message]).toEqual([
          [409, 'PHONE_OUT_OF_SERVICE'],
          // The door's, before the service is asked (ADR-531).
          'Not done: this phone was taken out of service. It only sends what it holds and is turned in.',
        ]);
        expect(await audited(tx, answer.requestId)).toEqual([]);
      }
      expect(await monitors(tx)).toBe(before);
      expect(await tries(tx, phone.masterPasscodeVersion)).toBeNull();
    });
  });
});

describe('a monitor is created on a phone', () => {
  it('AC-02-07, AC-02-01 Lee Morgan is created on P1-COL-1 under the master passcode: the system issues the Monitor ID, the password is kept only as its slow hash, and the records name the master passcode, on that phone, with Lee as who they are about', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      // 6:40 am in Bayline County, at the staging area, with a connection.
      served.clock.at = new Date('2026-10-12T10:40:00Z');
      const token = await proven(served, phone);
      const answer = await create(served, token, { ...lee, passcode });
      expect(told(answer)).toEqual([200, undefined]);
      // Never the password, its hash or the passcode in the answer.
      expect(Object.keys(answer.body as object).sort()).toEqual([
        'monitorNumber',
        'name',
        'userId',
      ]);
      const made = monitorCreatedAnswerSchema.parse(answer.body);
      expect(made.name).toBe('Lee Morgan');
      // Read one at a time: a piece of work has one connection.
      const kept = await tx.user.findUniqueOrThrow({ where: { id: made.userId } });
      expect(kept).toMatchObject({
        name: 'Lee Morgan',
        role: 'MONITOR',
        monitorNumber: made.monitorNumber,
        phone: '850-555-0142',
        email: null,
        viewerKind: null,
        contractorId: null,
        archivedAt: null,
      });
      expect(await tx.userPermission.count({ where: { userId: made.userId } })).toBe(0);
      expect(await tx.session.count({ where: { userId: made.userId } })).toBe(0);
      const credential = await tx.userCredential.findUniqueOrThrow({
        where: { userId: made.userId },
      });
      // Whoever typed it knows it, and that is the firm's practice: it isn't marked to change.
      expect(credential).toMatchObject({
        passwordChangeRequired: false,
        failedSignIns: 0,
        twoStepSecret: null,
      });
      const hash = credential.passwordHash ?? '';
      expect(hash).toMatch(/^\$argon2id\$/);
      const hasher = new PasswordHasher(passwordKey);
      expect(await hasher.verify('5550142', hash)).toBe(true);
      expect(await hasher.verify('5550143', hash)).toBe(false);
      // The audit log names the master passcode's own actor, on that phone: never a person.
      const written = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, answer.requestId)).toEqual([
        ['user', 'INSERT', ...written],
        ['user_credential', 'INSERT', ...written],
        ['security_event', 'INSERT', ...written],
      ]);
      // The use says which phone and which monitor.
      expect(await events(tx, answer.requestId)).toEqual([
        {
          kind: 'MASTER_PASSCODE_USE',
          userId: made.userId,
          deviceId: phone.id,
          occurredAt: '2026-10-12T10:40:00.000Z',
        },
      ]);
      // The next one's ID is the next of the one series.
      const next = await create(served, token, {
        name: 'Sam Grant',
        password: '5550177',
        passcode,
      });
      expect(told(next)).toEqual([200, undefined]);
      const second = monitorCreatedAnswerSchema.parse(next.body);
      expect(Number(second.monitorNumber.slice(1))).toBe(Number(made.monitorNumber.slice(1)) + 1);
      expect((await tx.user.findUniqueOrThrow({ where: { id: second.userId } })).phone).toBeNull();
    });
  });

  it('AC-10-32 the log says that a monitor was created and on which phone, by id: never the passcode, the password, their name or their number', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      const token = await proven(served, phone);
      expect(told(await create(served, token, { ...lee, passcode: wrongPasscode }))).toEqual(
        refused,
      );
      const answer = await create(served, token, { ...lee, passcode });
      const { userId } = monitorCreatedAnswerSchema.parse(answer.body);
      const parsed = served.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(
        parsed
          .filter(({ msg }) => /\ba monitor\b/i.test(String(msg)))
          .map(({ msg, why, deviceId, userId: created }) => [msg, why, deviceId, created]),
      ).toEqual([
        ['Creating a monitor on a phone was refused.', 'WRONG', phone.id, undefined],
        [
          'A monitor was created on a phone under the master passcode.',
          undefined,
          phone.id,
          userId,
        ],
      ]);
      const log = served.lines.join('\n');
      for (const secret of [passcode, wrongPasscode, lee.password, lee.name, lee.phone, token]) {
        expect(log.includes(secret), secret).toBe(false);
      }
    });
  });
});

describe('the master passcode entered wrong on a phone', () => {
  it('AC-10-22 a wrong passcode creates nobody and is refused by one code; it is a security event naming the phone, and counts on the same record as a wrong try at enrolment; a right one starts the count again', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      const version = phone.masterPasscodeVersion;
      const token = await proven(served, phone);
      const before = await monitors(tx);
      const wrong = await create(served, token, { ...lee, passcode: wrongPasscode });
      expect(told(wrong)).toEqual(refused);
      expect(Object.keys(wrong.body as object).sort()).toEqual(['code', 'requestId']);
      const written = [masterPasscodeActorId, 'DEVICE', phone.id];
      expect(await audited(tx, wrong.requestId)).toEqual([
        ['master_passcode_tries', 'INSERT', ...written],
        ['security_event', 'INSERT', ...written],
      ]);
      expect(
        (await events(tx, wrong.requestId)).map(({ kind, userId, deviceId }) => [
          kind,
          userId,
          deviceId,
        ]),
      ).toEqual([['MASTER_PASSCODE_FAILED', null, phone.id]]);
      // A wrong try at enrolment, on a phone nobody knows yet: the same count.
      const enrolment = await served.ask('POST', '/phones/enrolments', {
        payload: {
          name: 'P1-COL-2',
          passcode: wrongPasscode,
          publicKey: new SoftwareKey().publicKey,
        },
      });
      expect(told(enrolment)).toEqual([401, 'ENROLMENT_REFUSED']);
      expect(await tries(tx, version)).toEqual({ failedTries: 2, lockedUntil: null });
      expect(await monitors(tx)).toBe(before);
      expect(told(await create(served, token, { ...lee, passcode }))).toEqual([200, undefined]);
      expect(await tries(tx, version)).toEqual({ failedTries: 0, lockedUntil: null });
      expect(await monitors(tx)).toBe(before + 1);
    });
  });

  it('AC-10-22, AC-10-108 the fifth wrong try in a row makes the next wait, wherever each was made: while it waits the right passcode creates nobody from an address that tried it wrong, and nothing is written; one address is stopped at its own fourth', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      const version = phone.masterPasscodeVersion;
      const token = await proven(served, phone);
      const before = await monitors(tx);
      for (let wrong = 1; wrong <= 4; wrong += 1) {
        expect(
          told(await create(served, token, { ...lee, passcode: wrongPasscode })),
          String(wrong),
        ).toEqual(refused);
      }
      // The address's fifth is stopped before the passcode is touched, right or wrong.
      for (const given of [wrongPasscode, passcode]) {
        const limited = await create(served, token, { ...lee, passcode: given });
        expect(told(limited)).toEqual([429, 'LIMITED']);
        expect(await audited(tx, limited.requestId)).toEqual([]);
      }
      expect(await tries(tx, version)).toEqual({ failedTries: 4, lockedUntil: null });
      // The fifth in a row, from another address.
      served.from = '198.51.100.11';
      expect(told(await create(served, token, { ...lee, passcode: wrongPasscode }))).toEqual(
        refused,
      );
      const waiting = new Date(served.clock.now().getTime() + 30_000);
      expect(await tries(tx, version)).toEqual({ failedTries: 5, lockedUntil: waiting });
      // While it waits, from the address that tried it wrong last (ADR-541).
      const during = await create(served, token, { ...lee, passcode });
      expect(told(during)).toEqual(refused);
      expect(await audited(tx, during.requestId)).toEqual([]);
      expect(await monitors(tx)).toBe(before);
      // After the wait.
      served.clock.later(1);
      expect(told(await create(served, token, { ...lee, passcode }))).toEqual([200, undefined]);
      expect(await tries(tx, version)).toEqual({ failedTries: 0, lockedUntil: null });
    });
  });
});

describe('a monitor’s password', () => {
  it('ADR-105, 402 (5) is the firm’s practice: seven digits are taken, with no rule of length, list or words; one over the longest is refused in plain words to whoever holds the passcode, and is no wrong try', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      const token = await proven(served, phone);
      const before = await monitors(tx);
      // On every list of breached passwords, and far under fifteen characters.
      for (const password of ['1234567', 'password', 'Lee Morgan']) {
        const answer = await create(served, token, { ...lee, password, passcode });
        expect(told(answer), password).toEqual([200, undefined]);
      }
      const tooLong = await create(served, token, {
        ...lee,
        password: '5'.repeat(129),
        passcode,
      });
      expect([told(tooLong), (tooLong.body as { message?: string }).message]).toEqual([
        [422, 'PASSWORD_TOO_LONG'],
        'A password can have at most 128 characters.',
      ]);
      expect(await audited(tx, tooLong.requestId)).toEqual([]);
      expect(await tries(tx, phone.masterPasscodeVersion)).toBeNull();
      expect(await monitors(tx)).toBe(before + 3);
    });
  });
});
