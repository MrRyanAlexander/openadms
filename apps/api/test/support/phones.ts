// A phone as a test holds one (ADR-437, 439, 440): its device key made in software, enrolled
// through the API's own request under a master passcode of the test's own, and able to sign the
// server's challenge as a real one's secure hardware does (ECDSA P-256 with SHA-256, DER, in
// base64). The installation's own master passcode is unknown to a test: each test adds a
// version inside its undone piece of work and enrols under that.
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';

import {
  phoneChallengeAnswerSchema,
  phoneEnrolledAnswerSchema,
  phoneProvenAnswerSchema,
} from '@open-adms/contracts';
import { PhoneProofRules } from '@open-adms/domain';
import { expect } from 'vitest';

import { PasswordHasher } from '../../src/sign-in/password-hasher.ts';
import type { Tx } from './database.ts';
import type { Answer, Served } from './served.ts';
import { passwordKey } from './sign-in.ts';

export const passcode = 'osprey-landing-marsh';

const versions = new WeakMap<object, number>();

// The firm's master passcode for this test: a version of the test's own, now the one in force.
export async function passcodeSet(tx: Tx): Promise<number> {
  const last = (await tx.masterPasscode.aggregate({ _max: { version: true } }))._max.version ?? 0;
  // As the installer makes it: no key, no seed, until its first right use (ADR-542).
  const hash = await new PasswordHasher(passwordKey).hashWithoutKey(passcode);
  await tx.masterPasscode.create({ data: { version: last + 1, hash } });
  versions.set(tx, last + 1);
  return last + 1;
}

// A phone's key pair, made in software: the private half never leaves this object.
export class SoftwareKey {
  private readonly privateKey: KeyObject;
  // The public half as a phone sends it: base64 SubjectPublicKeyInfo.
  readonly publicKey: string;

  constructor() {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  }

  // The phone's answer to a challenge: its signature over what the domain says a phone signs.
  signed(challenge: string): string {
    return createSign('SHA256')
      .update(PhoneProofRules.signed(challenge))
      .sign({ key: this.privateKey, dsaEncoding: 'der' })
      .toString('base64');
  }
}

export interface TestPhone {
  readonly id: string;
  readonly name: string;
  readonly masterPasscodeVersion: number;
  readonly key: SoftwareKey;
}

// A phone enrolled as a real one is: by the API's own request, under the test's passcode.
export async function enrolledPhone(served: Served, tx: Tx, name: string): Promise<TestPhone> {
  if (!versions.has(tx)) await passcodeSet(tx);
  const key = new SoftwareKey();
  const answer = await served.ask('POST', '/phones/enrolments', {
    payload: { name, passcode, publicKey: key.publicKey },
  });
  expect([answer.status, answer.code], `enrolling ${name}`).toEqual([200, undefined]);
  const { deviceId, masterPasscodeVersion } = phoneEnrolledAnswerSchema.parse(answer.body);
  return { id: deviceId, name, masterPasscodeVersion, key };
}

export const challengeFor = (served: Served, deviceId: string): Promise<Answer> =>
  served.ask('POST', `/phones/${deviceId}/challenges`);

export const proofOf = (
  served: Served,
  deviceId: string,
  proof: { challenge: string; signature: string; passcode?: string },
): Promise<Answer> => served.ask('POST', `/phones/${deviceId}/proofs`, { payload: proof });

// A challenge asked for and answered by the phone's own key: what a sync begins with.
export async function answered(
  served: Served,
  phone: Pick<TestPhone, 'id' | 'key'>,
): Promise<{ challenge: string; signature: string; answer: Answer }> {
  const asked = await challengeFor(served, phone.id);
  expect([asked.status, asked.code]).toEqual([200, undefined]);
  const { challenge } = phoneChallengeAnswerSchema.parse(asked.body);
  const signature = phone.key.signed(challenge);
  return {
    challenge,
    signature,
    answer: await proofOf(served, phone.id, { challenge, signature }),
  };
}

// A proof that must work: the token it gave.
export async function proven(
  served: Served,
  phone: Pick<TestPhone, 'id' | 'key'>,
): Promise<string> {
  const { answer } = await answered(served, phone);
  expect([answer.status, answer.code]).toEqual([200, undefined]);
  return phoneProvenAnswerSchema.parse(answer.body).token;
}

// A proof that must work, made with the test's passcode beside the phone's signature: the master
// user at the phone, which counts as somebody signed in on it for what it sends (ADR-531). The
// token it gave.
export async function provenWithPasscode(
  served: Served,
  phone: Pick<TestPhone, 'id' | 'key'>,
): Promise<string> {
  const asked = await challengeFor(served, phone.id);
  expect([asked.status, asked.code]).toEqual([200, undefined]);
  const { challenge } = phoneChallengeAnswerSchema.parse(asked.body);
  const answer = await proofOf(served, phone.id, {
    challenge,
    signature: phone.key.signed(challenge),
    passcode,
  });
  expect([answer.status, answer.code], 'proving the phone with the passcode').toEqual([
    200,
    undefined,
  ]);
  return phoneProvenAnswerSchema.parse(answer.body).token;
}

// The tokens of the master user at each phone, by the token of the phone's own proof.
const senders = new Map<string, string>();

// A phone proven both ways at once, as a test's phone that sends and does a monitor's things too
// (ADR-531): by its key alone, the token returned, and with the passcode beside it, the token
// `senderOf` gives for it. Two challenges a millisecond apart, the earlier answered first, since
// a phone answers only a challenge made after the last it answered; the clock is put back.
export async function provenBoth(
  served: Served,
  phone: Pick<TestPhone, 'id' | 'key'>,
): Promise<string> {
  const now = served.clock.now();
  served.clock.at = new Date(now.getTime() - 1);
  const earlier = phoneChallengeAnswerSchema.parse(
    (await challengeFor(served, phone.id)).body,
  ).challenge;
  served.clock.at = now;
  const asMaster = await proofOf(served, phone.id, {
    challenge: earlier,
    signature: phone.key.signed(earlier),
    passcode,
  });
  expect([asMaster.status, asMaster.code], 'proving the phone with the passcode').toEqual([
    200,
    undefined,
  ]);
  const token = await proven(served, phone);
  senders.set(token, phoneProvenAnswerSchema.parse(asMaster.body).token);
  return token;
}

// What a phone proven both ways sends with: the master user at it. Any other token as it is.
export const senderOf = (token: string): string => senders.get(token) ?? token;

// A phone that holds nothing turned in under the test's passcode, as "Sync and turn in" does
// once everything is on the server (ADR-488): from then on its key is revoked.
export async function turnedIn(served: Served, token: string): Promise<void> {
  const answer = await served.ask('POST', '/phones/current/turn-ins', {
    bearer: token,
    payload: {
      passcode,
      holds: { unplannedAssignments: [], passcodeUses: [], records: [], held: [], photos: [] },
      lastUsed: [],
    },
  });
  expect([answer.status, answer.code], 'turning the phone in').toEqual([200, undefined]);
  expect(answer.body).toEqual({ turnedIn: true, wipe: true, numbers: [] });
}
