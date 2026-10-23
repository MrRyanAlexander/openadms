// A phone enrolled under the master passcode, against the database (ARCHITECTURE §6, Abuse;
// §7.1, §7.4, §7.5; spec/acceptance/02-people-and-devices.md AC-02-15, 16, 18;
// spec/acceptance/10-api-and-sync.md AC-10-22, 32, 44; BACKLOG 2.5.1, C45, C93, C110; ADR-106,
// 240, 416, 436…439). NIST SP 800-63B-4 §3.1.6, §3.2.2; OWASP ASVS 5.0 V6, V11, V16. The real
// process, in this test's own memory, on the test database as `adms_api`: it needs
// `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts).
//
// The installation's own master passcode is unknown to a test: each test adds a version of its
// own inside its undone piece of work, and enrols under that.
import { ECDH, generateKeyPairSync } from 'node:crypto';

import {
  changeMasterPasscodeEndpoint,
  endpoints,
  enrolPhoneEndpoint,
  phoneEnrolledAnswerSchema,
} from '@open-adms/contracts';
import { masterPasscodeActorId, type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationPolicy } from '../src/policy.ts';
import { DeviceKeys } from '../src/phone/device-keys.ts';
import { PasswordHasher } from '../src/sign-in/password-hasher.ts';
import { testSettings, openTestDatabase, type Tx } from './support/database.ts';
import { notTaken } from './support/review.ts';
import { danasEmail, long, worldOn, type Answer, type Served } from './support/served.ts';
import { ask, told } from './support/setup.ts';
import { Outbox, passwordKey } from './support/sign-in.ts';

let db: Database;

beforeAll(() => {
  db = openTestDatabase(testSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const passcode = 'heron-marsh-ferry';
const wrongPasscode = 'ferry-marsh-heron';
const newPasscode = 'delphine-ferry-marsh';

// The firm's master passcode for this test: a version of the test's own, now the one in force.
async function passcodeSet(tx: Tx): Promise<number> {
  const last = (await tx.masterPasscode.aggregate({ _max: { version: true } }))._max.version ?? 0;
  const hash = await new PasswordHasher(passwordKey).hashWithoutKey(passcode);
  await tx.masterPasscode.create({ data: { version: last + 1, hash } });
  return last + 1;
}

// A phone's key pair, made in software: the public half as a phone sends it.
function softwareKey(): string {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
}

// The same key with its point written short: a second spelling a phone could send.
function writtenShort(publicKey: string): string {
  const der = Buffer.from(publicKey, 'base64');
  const short = ECDH.convertKey(
    der.subarray(der.length - 65),
    'prime256v1',
    undefined,
    undefined,
    'compressed',
  );
  // The 26-byte header of the whole form, but for the two lengths the shorter point changes.
  const header = Buffer.from('3039301306072a8648ce3d020106082a8648ce3d030107032200', 'hex');
  return Buffer.concat([header, short as Buffer]).toString('base64');
}

const enrol = (served: Served, phone: object): Promise<Answer> =>
  served.ask('POST', '/phones/enrolments', { payload: phone });

const tries = (tx: Tx, version: number) =>
  tx.masterPasscodeTries.findUnique({
    where: { version },
    select: { failedTries: true, lockedUntil: true },
  });

const events = async (tx: Tx, requestId?: string) =>
  (
    await tx.securityEvent.findMany({
      where: {
        kind: { in: ['MASTER_PASSCODE_USE', 'MASTER_PASSCODE_FAILED', 'MASTER_PASSCODE_LOCKOUT'] },
        ...(requestId === undefined ? {} : { requestId }),
      },
      orderBy: { id: 'asc' },
      select: { kind: true, userId: true, deviceId: true, occurredAt: true },
    })
  ).map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() }));

const audited = (tx: Tx, requestId: string) =>
  tx.auditRecord.findMany({
    where: { requestId },
    orderBy: { id: 'asc' },
    select: {
      tableName: true,
      operation: true,
      actorId: true,
      source: true,
      deviceId: true,
      domain: true,
    },
  });

describe('who may enrol a phone', () => {
  it('AC-02-18 nobody need be signed in: the master passcode opens it; a request that isn’t whole is refused by its schema, and nothing is tried', async () => {
    const { access, roles, permission } = endpoints.find((one) => one === enrolPhoneEndpoint) ?? {};
    expect([access, roles, permission]).toEqual(['ANYBODY', undefined, undefined]);
    await world(async (served, tx) => {
      const version = await passcodeSet(tx);
      const publicKey = softwareKey();
      const refused: [object, string][] = [
        [{ name: 'P1-COL-1', publicKey }, 'passcode in the body is missing.'],
        [{ name: 'P1-COL-1', passcode }, 'publicKey in the body is missing.'],
        [{ name: ' ', passcode, publicKey }, 'name in the body is blank.'],
        [
          { name: 'P1-COL-1', passcode, publicKey, projectId: 'P1' },
          'the body has a field this request doesn’t take.',
        ],
      ];
      for (const [phone, words] of refused) {
        const answer = await enrol(served, phone);
        expect(told(answer), words).toEqual([400, 'BAD_REQUEST']);
        expect(notTaken(answer), words).toContain(words);
      }
      expect(await tries(tx, version)).toBeNull();
      expect(await events(tx)).toEqual([]);
    });
  });
});

describe('a phone is enrolled', () => {
  it('AC-02-15, AC-02-18, AC-10-44 P1-COL-1 is enrolled under the master passcode: the server is sent and keeps its public key only, written one way; the record names the master passcode, on that phone, never a person; the use is a security event', async () => {
    await world(async (served, tx) => {
      const version = await passcodeSet(tx);
      const publicKey = softwareKey();
      // 9:50 am in Bayline County, at the office, with a connection.
      served.clock.at = new Date('2026-10-12T13:50:00Z');
      const answer = await enrol(served, { name: 'P1-COL-1', passcode, publicKey });
      expect(told(answer)).toEqual([200, undefined]);
      const { deviceId, masterPasscodeVersion } = phoneEnrolledAnswerSchema.parse(answer.body);
      expect(masterPasscodeVersion).toBe(version);
      // Never the passcode, its hash or a key in the answer.
      expect(Object.keys(answer.body as object).sort()).toEqual([
        'deviceId',
        'masterPasscodeVersion',
      ]);
      const phone = await tx.device.findUniqueOrThrow({ where: { id: deviceId } });
      expect(phone).toEqual({
        id: deviceId,
        name: 'P1-COL-1',
        publicKey: new DeviceKeys().kept(publicKey),
        status: 'ACTIVE',
        masterPasscodeVersion: version,
        enrolledAt: new Date('2026-10-12T13:50:00Z'),
        outOfServiceAt: null,
        outOfServiceMarkedAt: null,
        outOfServiceReasonId: null,
        keyRevokedAt: null,
        keyRevokedBy: null,
        lastAnsweredChallengeMadeAt: null,
      });
      // No project, no monitor; and the audit log names the master passcode's own actor. Its
      // first right use keys the installer's verifier and seals its offline seed (ADR-542).
      const written = { actorId: masterPasscodeActorId, source: 'DEVICE', deviceId };
      expect(await audited(tx, answer.requestId)).toEqual([
        { ...written, tableName: 'device', operation: 'INSERT', domain: 'SECURITY' },
        { ...written, tableName: 'master_passcode', operation: 'UPDATE', domain: 'SECURITY' },
        { ...written, tableName: 'master_passcode', operation: 'UPDATE', domain: 'SECURITY' },
        { ...written, tableName: 'security_event', operation: 'INSERT', domain: 'SECURITY' },
      ]);
      const upgraded = await tx.masterPasscode.findUniqueOrThrow({ where: { version } });
      expect(upgraded.hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1,keyid=djI\$/);
      expect(upgraded.offlineSeed).toMatch(/^v2\./);
      // Its next use writes neither again.
      const second = await enrol(served, { name: 'P1-COL-2', publicKey: softwareKey(), passcode });
      expect((await audited(tx, second.requestId)).map(({ tableName }) => tableName)).toEqual([
        'device',
        'security_event',
      ]);
      expect(await events(tx, answer.requestId)).toEqual([
        {
          kind: 'MASTER_PASSCODE_USE',
          userId: null,
          deviceId,
          occurredAt: '2026-10-12T13:50:00.000Z',
        },
      ]);
      expect(await tries(tx, version)).toBeNull();
    });
  });

  it('AC-02-16, AC-10-44 the key is kept written one way, so the same key sent in its short spelling is the same key: a second phone can’t be enrolled with it', async () => {
    await world(async (served, tx) => {
      await passcodeSet(tx);
      const publicKey = softwareKey();
      const first = await enrol(served, { name: 'P1-COL-1', passcode, publicKey });
      expect(told(first)).toEqual([200, undefined]);
      const kept = new DeviceKeys().kept(publicKey);
      expect(new DeviceKeys().kept(writtenShort(publicKey))).toBe(kept);
      // The database's own refusal, told plainly; it ends this test's piece of work.
      const copy = await enrol(served, {
        name: 'P1-COL-1 (a copy)',
        passcode,
        publicKey: writtenShort(publicKey),
      });
      expect([told(copy), (copy.body as { message?: string }).message]).toEqual([
        [409, 'ALREADY_HELD'],
        'Not enrolled: a phone is already enrolled with that key.',
      ]);
    });
  });

  it('AC-10-44 the passcode was right and what was sent is no key of the kind a phone makes: told so, nothing enrolled, and not a wrong try at the passcode', async () => {
    await world(async (served, tx) => {
      const version = await passcodeSet(tx);
      const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const sent: Record<string, string> = {
        'an RSA key': rsa.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
        'no key at all': 'c3RvcnktUDEtQ09MLTE=',
        'not base64': 'story-P1-COL-1',
      };
      const before = await tx.device.count();
      for (const [what, publicKey] of Object.entries(sent)) {
        const answer = await enrol(served, { name: 'P1-COL-1', passcode, publicKey });
        expect([told(answer), (answer.body as { message?: string }).message], what).toEqual([
          [422, 'DEVICE_KEY_REFUSED'],
          'Not enrolled: what the phone sent isn’t a public key of the kind a phone makes.',
        ]);
      }
      expect(await tx.device.count()).toBe(before);
      expect(await tries(tx, version)).toBeNull();
      expect(await events(tx)).toEqual([]);
    });
  });
});

describe('the master passcode entered wrong', () => {
  it('AC-10-22, AC-10-108 each wrong try is refused by one code, counted against the passcode’s version and written as a security event by the passcode’s own actor; the fifth in a row makes the next wait, and while it waits the right passcode is refused too, from an address that tried it wrong, and nothing is written; after the wait the right one enrols there and the count starts again', async () => {
    await world(async (served, tx) => {
      const version = await passcodeSet(tx);
      const publicKey = softwareKey();
      const phone = { name: 'P1-COL-1', publicKey };
      for (let wrong = 1; wrong <= 5; wrong += 1) {
        // An address is stopped at its own fourth wrong try (below), so the fifth comes from
        // another.
        if (wrong === 5) served.from = '198.51.100.11';
        const answer = await enrol(served, { ...phone, passcode: wrongPasscode });
        expect(told(answer), String(wrong)).toEqual([401, 'ENROLMENT_REFUSED']);
        expect(Object.keys(answer.body as object).sort()).toEqual(['code', 'requestId']);
        // The count (made at the first wrong try, and at the fifth its wait too), then the event.
        const counted = wrong === 1 ? ['INSERT'] : wrong === 5 ? ['UPDATE', 'UPDATE'] : ['UPDATE'];
        expect(
          (await audited(tx, answer.requestId)).map((record) => [
            record.tableName,
            record.operation,
            record.actorId,
            record.source,
            record.deviceId,
            record.domain,
          ]),
        ).toEqual(
          [
            ...counted.map((operation) => ['master_passcode_tries', operation]),
            ['security_event', 'INSERT'],
          ].map((written) => [...written, masterPasscodeActorId, 'DEVICE', null, 'SECURITY']),
        );
      }
      // Thirty seconds, the policy's first wait.
      const waiting = new Date(served.clock.now().getTime() + 30_000);
      expect(await tries(tx, version)).toEqual({ failedTries: 5, lockedUntil: waiting });
      expect(
        (await events(tx)).map(({ kind, userId, deviceId }) => [kind, userId, deviceId]),
      ).toEqual(Array.from({ length: 5 }, () => ['MASTER_PASSCODE_FAILED', null, null]));
      // While it waits: the right passcode too, from the address that tried it wrong last.
      const during = await enrol(served, { ...phone, passcode });
      expect(told(during)).toEqual([401, 'ENROLMENT_REFUSED']);
      expect(await audited(tx, during.requestId)).toEqual([]);
      expect(await tries(tx, version)).toEqual({ failedTries: 5, lockedUntil: waiting });
      // After it.
      served.clock.later(1);
      const after = await enrol(served, { ...phone, passcode });
      expect(told(after)).toEqual([200, undefined]);
      expect(await tries(tx, version)).toEqual({ failedTries: 0, lockedUntil: null });
      expect((await events(tx)).at(-1)?.kind).toBe('MASTER_PASSCODE_USE');
    });
  });

  it('AC-10-22 one address is stopped at its fourth wrong try: its fifth is answered 429 before the passcode is touched, so it is never a wrong try there', async () => {
    await world(async (served, tx) => {
      const version = await passcodeSet(tx);
      const phone = { name: 'P1-COL-1', publicKey: softwareKey() };
      for (let wrong = 1; wrong <= 4; wrong += 1) {
        expect(told(await enrol(served, { ...phone, passcode: wrongPasscode }))).toEqual([
          401,
          'ENROLMENT_REFUSED',
        ]);
      }
      for (const given of [wrongPasscode, passcode]) {
        const answer = await enrol(served, { ...phone, passcode: given });
        expect(told(answer)).toEqual([429, 'LIMITED']);
        expect(await audited(tx, answer.requestId)).toEqual([]);
      }
      expect(await tries(tx, version)).toEqual({ failedTries: 4, lockedUntil: null });
      // Somebody else, at the office: the right passcode enrols.
      served.from = '198.51.100.11';
      expect(told(await enrol(served, { ...phone, passcode }))).toEqual([200, undefined]);
    });
  });

  it('AC-10-22 at the policy’s count of wrong tries in a row enrolment is locked: a security event of its own, every admin told by mail, and the right passcode refused however long anybody waits, until an admin changes the master passcode', async () => {
    const outbox = new Outbox();
    await world(
      async (served, tx) => {
        const version = await passcodeSet(tx);
        const phone = { name: 'P1-COL-1', publicKey: softwareKey() };
        for (let wrong = 1; wrong <= 7; wrong += 1) {
          served.from = `198.51.100.${String(20 + wrong)}`;
          // Past whatever wait the try before put on it.
          served.clock.later(61);
          const answer = await enrol(served, { ...phone, passcode: wrongPasscode });
          expect(told(answer), String(wrong)).toEqual([401, 'ENROLMENT_REFUSED']);
        }
        expect((await tries(tx, version))?.failedTries).toBe(7);
        expect((await events(tx)).map(({ kind }) => kind).slice(-2)).toEqual([
          'MASTER_PASSCODE_FAILED',
          'MASTER_PASSCODE_LOCKOUT',
        ]);
        // Told at the first wait, then at the lock.
        expect(outbox.sent.map(({ to, subject }) => [to, subject])).toEqual([
          [danasEmail, 'Your firm’s master passcode is being entered wrong'],
          [danasEmail, 'Your firm’s master passcode is locked'],
        ]);
        expect(outbox.sent.some(({ text }) => text.includes(wrongPasscode))).toBe(false);
        // A day later, the right passcode, from an address that has tried nothing.
        served.from = '198.51.100.40';
        served.clock.later(24 * 60);
        const locked = await enrol(served, { ...phone, passcode });
        expect(told(locked)).toEqual([401, 'ENROLMENT_REFUSED']);
        expect(await audited(tx, locked.requestId)).toEqual([]);
        // Dana changes the master passcode: a new version, which has no wrong tries.
        const dana = await served.signedIn(danasEmail, long);
        const changed = await ask(served, dana, changeMasterPasscodeEndpoint, {
          payload: { currentPassword: long, passcode: newPasscode },
        });
        expect(told(changed)).toEqual([200, undefined]);
        expect(told(await enrol(served, { ...phone, passcode }))).toEqual([
          401,
          'ENROLMENT_REFUSED',
        ]);
        const enrolled = await enrol(served, { ...phone, passcode: newPasscode });
        expect(told(enrolled)).toEqual([200, undefined]);
        expect(phoneEnrolledAnswerSchema.parse(enrolled.body).masterPasscodeVersion).toBe(
          version + 1,
        );
        // The old version's record stands as it was; the new one counted the old passcode
        // given after the change, and the right one started its count again.
        expect((await tries(tx, version))?.failedTries).toBe(7);
        expect(await tries(tx, version + 1)).toEqual({ failedTries: 0, lockedUntil: null });
      },
      outbox,
      installationPolicy({ SIGN_IN_TRIES_BEFORE_LOCK: '7' }),
    );
  });
});

describe('a stranger at the master passcode (ADR-541)', () => {
  it('AC-10-108 a stranger who keeps the passcode waiting holds only their own addresses: the right passcode from the office enrols while it waits, and every admin is told by mail at the first wait, never the passcode', async () => {
    const outbox = new Outbox();
    await world(async (served, tx) => {
      const version = await passcodeSet(tx);
      const phone = { name: 'P1-COL-1', publicKey: softwareKey() };
      // Two addresses of a stranger's, four wrong tries and one: the passcode waits.
      for (let wrong = 1; wrong <= 5; wrong += 1) {
        served.from = wrong === 5 ? '203.0.113.6' : '203.0.113.5';
        expect(told(await enrol(served, { ...phone, passcode: wrongPasscode }))).toEqual([
          401,
          'ENROLMENT_REFUSED',
        ]);
      }
      expect((await tries(tx, version))?.failedTries).toBe(5);
      expect(outbox.sent.map(({ to, subject }) => [to, subject])).toEqual([
        [danasEmail, 'Your firm’s master passcode is being entered wrong'],
      ]);
      expect(outbox.sent[0]?.text).toContain('entered wrong 5 times in a row');
      expect(outbox.sent[0]?.text).not.toContain(wrongPasscode);
      // The stranger is held by the wait, the right passcode included.
      expect(told(await enrol(served, { ...phone, passcode }))).toEqual([401, 'ENROLMENT_REFUSED']);
      // A supervisor at the office, who tried nothing, enrols while it waits: the count starts
      // again, and nobody is mailed again.
      served.from = '198.51.100.30';
      const enrolled = await enrol(served, { ...phone, passcode });
      expect(told(enrolled)).toEqual([200, undefined]);
      expect(await tries(tx, version)).toEqual({ failedTries: 0, lockedUntil: null });
      expect(outbox.sent).toHaveLength(1);
    }, outbox);
  });

  it('AC-10-108 a burst of wrong tries sent at once from one address is let through no further than the address’s limit, each try counted in turn: the rest are answered 429 and never tried', async () => {
    await world(async (served, tx) => {
      const version = await passcodeSet(tx);
      served.from = '203.0.113.7';
      const answers = await Promise.all(
        Array.from({ length: 12 }, () =>
          enrol(served, { name: 'P1-COL-1', publicKey: softwareKey(), passcode: wrongPasscode }),
        ),
      );
      const statuses = answers.map((answer) => answer.status).sort();
      expect(statuses.filter((status) => status === 401)).toHaveLength(4);
      expect(statuses.filter((status) => status === 429)).toHaveLength(8);
      expect((await tries(tx, version))?.failedTries).toBe(4);
      expect(
        (await events(tx)).filter(({ kind }) => kind === 'MASTER_PASSCODE_FAILED'),
      ).toHaveLength(4);
    });
  });

  it('AC-10-108 a burst from many addresses at once is counted try by try: once the fifth puts the wait on it, the rest from addresses that tried it wrong are refused unchecked, and the count is never the burst’s', async () => {
    await world(async (served, tx) => {
      const version = await passcodeSet(tx);
      // Each address tries twice at once: the second of each is held once the wait stands.
      const answers = await Promise.all(
        Array.from({ length: 16 }, (_, each) => {
          served.from = `203.0.113.${String(20 + Math.floor(each / 2))}`;
          return enrol(served, {
            name: 'P1-COL-1',
            publicKey: softwareKey(),
            passcode: wrongPasscode,
          });
        }),
      );
      expect(answers.every((answer) => answer.status === 401)).toBe(true);
      // Five checked before the wait, then at most one from each address not yet refused; the
      // second try of every address that tried was held, unchecked.
      const counted = (await tries(tx, version))?.failedTries ?? 0;
      expect(counted).toBeGreaterThanOrEqual(5);
      expect(counted).toBeLessThanOrEqual(10);
      expect(
        (await events(tx)).filter(({ kind }) => kind === 'MASTER_PASSCODE_FAILED'),
      ).toHaveLength(counted);
    });
  });
});

describe('the log', () => {
  it('AC-10-32 after a phone was enrolled and after a wrong try, every line is structured and carries its request’s id, and none holds the master passcode, the wrong one that was typed, the key or the phone’s name', async () => {
    await world(async (served, tx) => {
      await passcodeSet(tx);
      const publicKey = softwareKey();
      const name = 'P1-TWR-LF';
      const wrong = await enrol(served, { name, passcode: wrongPasscode, publicKey });
      const right = await enrol(served, { name, passcode, publicKey });
      expect([told(wrong), told(right)]).toEqual([
        [401, 'ENROLMENT_REFUSED'],
        [200, undefined],
      ]);
      const parsed = served.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      const said = parsed.filter((line) => typeof line['msg'] === 'string');
      expect(
        said
          .filter(
            (line) => line['requestId'] !== undefined && String(line['msg']).includes('enrol'),
          )
          .map((line) => [line['msg'], line['why'], line['requestId']]),
      ).toEqual([
        ['An enrolment was refused.', 'WRONG', wrong.requestId],
        ['A phone was enrolled under the master passcode.', undefined, right.requestId],
      ]);
      const log = served.lines.join('\n');
      for (const secret of [passcode, wrongPasscode, publicKey, name]) {
        expect(log).not.toContain(secret);
      }
      expect(log).not.toContain(new DeviceKeys().kept(publicKey));
      for (const answer of [wrong, right]) {
        expect(answer.text).not.toContain(passcode);
        expect(answer.text).not.toContain(publicKey);
      }
    });
  });
});
