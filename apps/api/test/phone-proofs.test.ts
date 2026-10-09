// A phone proves which phone it is, against the database (ARCHITECTURE §6, Device sessions;
// §7.4, §9 (1); spec/acceptance/02-people-and-devices.md AC-02-18; spec/acceptance/05-sync.md
// AC-05-03; spec/acceptance/10-api-and-sync.md AC-10-32, 45, 46; spec/THREAT-MODEL.md T-02, T-11;
// BACKLOG 2.5.1, C110, C111; ADR-134, 436, 437, 440). NIST SP 800-63B-4 §3.1.6, §3.2.7, §5.1;
// OWASP ASVS 5.0 6.7.2, 11.2.3, 11.6.1. The real process, in this test's own memory, on the
// installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm installer`, and
// fails saying so. Each test's work is undone (support/database.ts).
//
// A test's phone holds a key made in software and is enrolled by the API's own request
// (support/phones.ts): nothing here writes a phone by hand.
import { randomUUID } from 'node:crypto';

import {
  endpoints,
  phoneChallengeAnswerSchema,
  phoneProvenAnswerSchema,
  provenPhoneAnswerSchema,
} from '@open-adms/contracts';
import { deviceKeyActorId, type Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationPolicy } from '../src/policy.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import {
  answered,
  challengeFor,
  enrolledPhone,
  proofOf,
  proven,
  SoftwareKey,
} from './support/phones.ts';
import { notTaken } from './support/review.ts';
import { danasEmail, long, worldOn, type Answer, type Served } from './support/served.ts';
import { told } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const refused = [401, 'PHONE_NOT_PROVEN'];

const current = (served: Served, bearer?: string): Promise<Answer> =>
  served.ask('GET', '/phones/current', bearer === undefined ? {} : { bearer });

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
      changedFields: true,
    },
  });

const lastAnswered = async (tx: Tx, id: string): Promise<string | undefined> =>
  (await tx.device.findUniqueOrThrow({ where: { id } })).lastAnsweredChallengeMadeAt?.toISOString();

describe('who may ask', () => {
  it('AC-02-18, AC-05-03 nobody need be signed in for a challenge or a proof; what a proven phone may ask takes its token, and nothing else opens it', async () => {
    expect(
      ['challengePhone', 'provePhone', 'provenPhone'].map((named) => {
        const { access, roles, permission } = endpoints.find(({ name }) => name === named) ?? {};
        return [access, roles, permission];
      }),
    ).toEqual([
      ['ANYBODY', undefined, undefined],
      ['ANYBODY', undefined, undefined],
      ['PROVEN_PHONE', undefined, undefined],
    ]);
    // The exact list of what is open to a proven phone: a new one is added here on purpose.
    expect(
      endpoints.filter(({ access }) => access === 'PROVEN_PHONE').map(({ name }) => name),
    ).toEqual(['provenPhone']);
    await world(async (served) => {
      // Dana is signed in at the back office: her session is no phone's proof.
      const dana = await served.signedIn(danasEmail, long);
      const asDana = await served.ask('GET', '/phones/current', { cookies: dana.cookies });
      expect(told(asDana)).toEqual(refused);
      expect(told(await current(served))).toEqual(refused);
      for (const bearer of ['', 'not-a-token', randomUUID(), `${randomUUID()}.1.a.b`]) {
        expect(told(await current(served, bearer)), bearer).toEqual(refused);
      }
    });
  });

  it('a request that isn’t whole is refused by its schema, and which field is said', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      const { challenge } = phoneChallengeAnswerSchema.parse(
        (await challengeFor(served, phone.id)).body,
      );
      const signature = phone.key.signed(challenge);
      const notWhole: [string, object, string][] = [
        [phone.id, { challenge }, 'signature in the body is missing.'],
        [phone.id, { signature }, 'challenge in the body is missing.'],
        [
          phone.id,
          { challenge, signature, deviceId: phone.id },
          'the body has a field this request doesn’t take.',
        ],
        ['P1-COL-1', { challenge, signature }, 'deviceId in the path'],
      ];
      for (const [id, body, words] of notWhole) {
        const answer = await served.ask('POST', `/phones/${id}/proofs`, { payload: body });
        expect(told(answer), words).toEqual([400, 'BAD_REQUEST']);
        expect(notTaken(answer), words).toContain(words);
      }
      expect(told(await served.ask('POST', '/phones/P1-COL-1/challenges'))).toEqual([
        400,
        'BAD_REQUEST',
      ]);
      expect(await lastAnswered(tx, phone.id)).toBeUndefined();
    });
  });
});

describe('a phone proves itself', () => {
  it('AC-02-18, AC-05-03 P1-COL-1 asks for a challenge at 12:05, signs it with the key it made at enrolment and is given a token good for the policy’s fifteen minutes; the record says which challenge it answered, written as the device key’s own actor on that phone, never a person', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      // 12:05 in Bayline County, at the edge of signal.
      served.clock.at = new Date('2026-10-12T16:05:00.000Z');
      const asked = await challengeFor(served, phone.id);
      expect(told(asked)).toEqual([200, undefined]);
      const { challenge, expiresInSeconds } = phoneChallengeAnswerSchema.parse(asked.body);
      expect(expiresInSeconds).toBe(120);
      // Asking writes nothing, and reads nothing of the phone.
      expect(await audited(tx, asked.requestId)).toEqual([]);
      expect(await lastAnswered(tx, phone.id)).toBeUndefined();
      served.clock.later(0.25);
      const answer = await proofOf(served, phone.id, {
        challenge,
        signature: phone.key.signed(challenge),
      });
      expect(told(answer)).toEqual([200, undefined]);
      const given = phoneProvenAnswerSchema.parse(answer.body);
      expect(given.expiresInSeconds).toBe(15 * 60);
      expect(Object.keys(answer.body as object).sort()).toEqual(['expiresInSeconds', 'token']);
      // The moment the challenge was made, kept on the phone's own record.
      expect(await lastAnswered(tx, phone.id)).toBe('2026-10-12T16:05:00.000Z');
      expect(await audited(tx, answer.requestId)).toEqual([
        {
          tableName: 'device',
          operation: 'UPDATE',
          actorId: deviceKeyActorId,
          source: 'DEVICE',
          deviceId: phone.id,
          domain: 'SECURITY',
          changedFields: ['last_answered_challenge_made_at'],
        },
      ]);
      // What the token opens: the phone as the server has it, and never a key.
      const mine = await current(served, given.token);
      expect(told(mine)).toEqual([200, undefined]);
      expect(provenPhoneAnswerSchema.parse(mine.body)).toEqual({
        deviceId: phone.id,
        name: 'P1-COL-1',
        status: 'ACTIVE',
        outOfServiceAt: null,
        masterPasscodeVersion: phone.masterPasscodeVersion,
        masterPasscodeVersionInForce: phone.masterPasscodeVersion,
      });
      expect(mine.text).not.toContain(phone.key.publicKey);
    });
  });

  it('a token runs out after the policy’s minutes, and the phone proves itself again for another; a token is no cookie, and a changed one is nobody’s', async () => {
    await world(
      async (served, tx) => {
        const phone = await enrolledPhone(served, tx, 'P1-COL-1');
        const token = await proven(served, phone);
        served.clock.later(2);
        expect(told(await current(served, token))).toEqual([200, undefined]);
        // Sent as a cookie, as a browser would by itself, it opens nothing.
        expect(
          told(await served.ask('GET', '/phones/current', { cookies: { authorization: token } })),
        ).toEqual(refused);
        // One sign changed, or another phone's id put in its place.
        const other = await enrolledPhone(served, tx, 'P1-TWR-TDSR');
        const [, expires, random, signature] = token.split('.');
        for (const changed of [
          `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`,
          `${other.id}.${String(expires)}.${String(random)}.${String(signature)}`,
          `${phone.id}.${String(Number(expires) + 60_000)}.${String(random)}.${String(signature)}`,
        ]) {
          expect(told(await current(served, changed)), changed).toEqual(refused);
        }
        served.clock.later(1);
        expect(told(await current(served, token))).toEqual(refused);
        const again = await proven(served, phone);
        expect(again).not.toBe(token);
        expect(told(await current(served, again))).toEqual([200, undefined]);
      },
      undefined,
      installationPolicy({ PHONE_TOKEN_MINUTES: '3' }),
    );
  });
});

describe('a proof that isn’t one', () => {
  it('AC-10-45 P1-COL-1 proved itself at 12:05; somebody who recorded that exchange sends the same signed answer again, and it proves nothing: nothing is written, and the phone’s next sync signs a challenge the server has just made', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      served.clock.at = new Date('2026-10-12T16:05:00.000Z');
      const first = await answered(served, phone);
      expect(told(first.answer)).toEqual([200, undefined]);
      // The same answer again, a moment later, well inside the challenge's two minutes.
      served.clock.later(0.1);
      const replayed = await proofOf(served, phone.id, {
        challenge: first.challenge,
        signature: first.signature,
      });
      expect(told(replayed)).toEqual(refused);
      expect(Object.keys(replayed.body as object).sort()).toEqual(['code', 'requestId']);
      expect(await audited(tx, replayed.requestId)).toEqual([]);
      expect(await lastAnswered(tx, phone.id)).toBe('2026-10-12T16:05:00.000Z');
      // A challenge made before the one it answered is passed by too, signed or not.
      served.clock.at = new Date('2026-10-12T16:06:00.000Z');
      const older = phoneChallengeAnswerSchema.parse((await challengeFor(served, phone.id)).body);
      served.clock.later(0.5);
      const newer = await answered(served, phone);
      expect(told(newer.answer)).toEqual([200, undefined]);
      expect(
        told(
          await proofOf(served, phone.id, {
            challenge: older.challenge,
            signature: phone.key.signed(older.challenge),
          }),
        ),
      ).toEqual(refused);
      expect(await lastAnswered(tx, phone.id)).toBe('2026-10-12T16:06:30.000Z');
    });
  });

  it('AC-10-46 a caller that holds no enrolled phone’s key proves nothing: another key’s signature, another phone’s challenge, a challenge the server didn’t make or one run out, a phone nobody enrolled; each is refused by the one code and nothing is written', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      const tower = await enrolledPhone(served, tx, 'P1-TWR-TDSR');
      const stranger = new SoftwareKey();
      const made = async (id: string) =>
        phoneChallengeAnswerSchema.parse((await challengeFor(served, id)).body).challenge;
      const mine = await made(phone.id);
      const towers = await made(tower.id);
      const nobodys = randomUUID();
      const forNobody = await made(nobodys);
      const [named = '', signature = ''] = mine.split('.');
      const tries: [string, string, { challenge: string; signature: string }][] = [
        ['a stranger’s key', phone.id, { challenge: mine, signature: stranger.signed(mine) }],
        ['the tower’s key', phone.id, { challenge: mine, signature: tower.key.signed(mine) }],
        [
          'the tower’s challenge, signed by this phone',
          phone.id,
          { challenge: towers, signature: phone.key.signed(towers) },
        ],
        [
          'its own challenge and signature, sent as the tower',
          tower.id,
          { challenge: mine, signature: phone.key.signed(mine) },
        ],
        [
          'a challenge changed by one sign',
          phone.id,
          {
            challenge: `${named}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`,
            signature: phone.key.signed(mine),
          },
        ],
        ['no signature at all', phone.id, { challenge: mine, signature: 'AAAA' }],
        [
          'a phone nobody enrolled',
          nobodys,
          { challenge: forNobody, signature: stranger.signed(forNobody) },
        ],
      ];
      for (const [what, id, proof] of tries) {
        const answer = await proofOf(served, id, proof);
        expect(told(answer), what).toEqual(refused);
        expect(await audited(tx, answer.requestId), what).toEqual([]);
      }
      // Two minutes on, the challenge has run out, rightly signed or not.
      served.clock.later(2);
      expect(
        told(
          await proofOf(served, phone.id, { challenge: mine, signature: phone.key.signed(mine) }),
        ),
      ).toEqual(refused);
      for (const id of [phone.id, tower.id]) expect(await lastAnswered(tx, id)).toBeUndefined();
      // A refused proof is no wrong try at a secret: the office's other phone is not held back.
      expect(told((await answered(served, tower)).answer)).toEqual([200, undefined]);
    });
  });

  it('AC-10-46, AC-02-60 a phone merely taken out of service still proves itself, and the token says so; once its key is revoked it proves nothing, and a token it was given before stops at once', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      // Luis marks it lost at 6:10 pm on Monday.
      const lostAt = new Date('2026-10-12T22:10:00.000Z');
      await tx.device.update({
        where: { id: phone.id },
        data: { status: 'LOST', outOfServiceAt: lostAt },
      });
      served.clock.at = new Date('2026-10-13T12:00:00.000Z');
      const token = await proven(served, phone);
      const mine = await current(served, token);
      expect(provenPhoneAnswerSchema.parse(mine.body)).toMatchObject({
        status: 'LOST',
        outOfServiceAt: lostAt.toISOString(),
      });
      // It synced, was confirmed and wiped: its key is revoked.
      await tx.device.update({
        where: { id: phone.id },
        data: { keyRevokedAt: new Date('2026-10-13T12:05:00.000Z') },
      });
      expect(told(await current(served, token))).toEqual(refused);
      served.clock.later(6);
      const after = await answered(served, phone);
      expect(told(after.answer)).toEqual(refused);
      expect(await audited(tx, after.answer.requestId)).toEqual([]);
      expect(await lastAnswered(tx, phone.id)).toBe('2026-10-13T12:00:00.000Z');
    });
  });

  it('a phone learns from its token’s answer that the master passcode has changed since its check was made', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      const token = await proven(served, phone);
      const held = await tx.masterPasscode.findUniqueOrThrow({
        where: { version: phone.masterPasscodeVersion },
      });
      await tx.masterPasscode.create({
        data: { version: phone.masterPasscodeVersion + 1, hash: held.hash },
      });
      expect(provenPhoneAnswerSchema.parse((await current(served, token)).body)).toMatchObject({
        masterPasscodeVersion: phone.masterPasscodeVersion,
        masterPasscodeVersionInForce: phone.masterPasscodeVersion + 1,
      });
    });
  });
});

describe('the log', () => {
  it('AC-10-32 after a proof and after a refused one, every line is structured and carries its request’s id, and none holds the challenge, the signature, the token or the key', async () => {
    await world(async (served, tx) => {
      const phone = await enrolledPhone(served, tx, 'P1-TWR-LF');
      const right = await answered(served, phone);
      const token = phoneProvenAnswerSchema.parse(right.answer.body).token;
      const replayed = await proofOf(served, phone.id, {
        challenge: right.challenge,
        signature: right.signature,
      });
      await current(served, token);
      const parsed = served.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(
        parsed
          .filter(
            (line) => line['requestId'] !== undefined && /proof|proved/.test(String(line['msg'])),
          )
          .map((line) => [line['msg'], line['why'], line['deviceId'], line['requestId']]),
      ).toEqual([
        ['A phone proved itself.', undefined, phone.id, right.answer.requestId],
        ['A phone’s proof was refused.', 'SPENT', undefined, replayed.requestId],
      ]);
      const log = served.lines.join('\n');
      for (const secret of [right.challenge, right.signature, token, phone.key.publicKey]) {
        expect(log).not.toContain(secret);
      }
      // Nor any part of the token but the phone's id, which is no secret.
      for (const part of token.split('.').slice(2)) expect(log).not.toContain(part);
    });
  });
});
