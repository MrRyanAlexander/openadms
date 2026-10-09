// A phone proves which phone it is (ARCHITECTURE §6, Device sessions; §7.4, §9 (1);
// spec/acceptance/02-people-and-devices.md AC-02-18; spec/acceptance/05-sync.md AC-05-03;
// spec/acceptance/10-api-and-sync.md AC-10-45, 46; spec/THREAT-MODEL.md T-02, T-11; BACKLOG C110,
// C111; ADR-134, 436, 437, 440). NIST SP 800-63B-4 §3.1.6 (single-factor cryptographic
// authentication), §3.2.7 (replay resistance), §5.1; OWASP ASVS 5.0 6.7.2, 11.2.3, 11.6.1.
//
// - **Nobody is signed in, and nobody need be there**: a supervisor syncs a phone its monitor
//   has walked away from. So what is written is stated as the device key's own actor, for that
//   phone (ADR-440), never as a person.
// - **The challenge is the server's own** (phone-challenges.ts): made for that phone, kept
//   nowhere, good for the policy's time. Anybody may ask for one, for any id: asking reads
//   nothing and tells nothing of which phones the firm has.
// - **The proof is the phone's signature over it**, checked against the public key kept at
//   enrolment (device-keys.ts). Nothing the server holds could make one.
// - **A challenge is good once**, kept on the phone's own record: the moment the challenge was
//   made is written there only if it is later than the last one the phone answered, compared
//   and written in one statement under the row's lock, so two answers to one challenge can't
//   both pass, in this process or another. The database holds the column to the same rule.
// - **A phone merely taken out of service still proves itself** (its work is received and
//   flagged, ADR-134). **One whose key is revoked proves nothing**, and a token it was given
//   before stops at once: the phone is read on every request.
// - **A refused proof writes nothing**: nothing a stranger sends grows the database (ADR-401).
import { byDeviceKey, type Database, type DeviceStatus } from '@open-adms/db';
import { PhoneProofRules } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { DeviceKeys } from './device-keys.ts';
import type { PhoneChallenges } from './phone-challenges.ts';
import type { PhoneTokens } from './phone-tokens.ts';

// Why a proof was refused: for the server's log only. A caller is never told which.
export type ProofRefused =
  // Not a challenge the server made for that phone, or one that has run out.
  | 'NO_CHALLENGE'
  // Nobody enrolled a phone by that id.
  | 'NO_PHONE'
  | 'KEY_REVOKED'
  // The signature isn't that phone's key's over that challenge.
  | 'NOT_SIGNED'
  // The phone has proved itself with that challenge, or with a later one.
  | 'SPENT';

export type ProofOutcome =
  | { readonly proven: true; readonly token: string; readonly expiresInSeconds: number }
  | { readonly proven: false; readonly why: ProofRefused };

export interface Challenge {
  readonly challenge: string;
  readonly expiresInSeconds: number;
}

// The phone a token is of, as the database has it now.
export interface ProvenPhone {
  readonly deviceId: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly outOfServiceAt: Date | null;
  readonly masterPasscodeVersion: number;
}

export interface PhoneProofParts {
  readonly rules: PhoneProofRules;
  readonly challenges: PhoneChallenges;
  readonly keys: DeviceKeys;
  readonly tokens: PhoneTokens;
  readonly clock: Clock;
  // How long a challenge may still be answered, in seconds: what the caller is told.
  readonly challengeSeconds: number;
}

export class PhoneProofs {
  private readonly db: Database;
  private readonly parts: PhoneProofParts;

  constructor(db: Database, parts: PhoneProofParts) {
    this.db = db;
    this.parts = parts;
  }

  // A challenge for the phone to sign. Nothing is read and nothing is kept.
  challenge(deviceId: string): Challenge {
    const { challenges, clock, challengeSeconds } = this.parts;
    return {
      challenge: challenges.make(deviceId, clock.now()),
      expiresInSeconds: challengeSeconds,
    };
  }

  async prove(deviceId: string, challenge: string, signature: string): Promise<ProofOutcome> {
    const { rules, challenges, keys, tokens, clock } = this.parts;
    const now = clock.now();
    const made = challenges.read(challenge, now);
    if (made?.deviceId !== deviceId) return { proven: false, why: 'NO_CHALLENGE' };
    const phone = await this.db.$read((tx) =>
      tx.device.findUnique({
        where: { id: deviceId },
        select: { publicKey: true, keyRevokedAt: true, lastAnsweredChallengeMadeAt: true },
      }),
    );
    if (phone === null) return { proven: false, why: 'NO_PHONE' };
    if (phone.keyRevokedAt !== null) return { proven: false, why: 'KEY_REVOKED' };
    if (!keys.signedBy(phone.publicKey, PhoneProofRules.signed(challenge), signature)) {
      return { proven: false, why: 'NOT_SIGNED' };
    }
    if (!rules.unspent(made.madeAt, phone.lastAnsweredChallengeMadeAt)) {
      return { proven: false, why: 'SPENT' };
    }
    // Compared again and written in one statement, under the row's lock: of two answers to one
    // challenge, or of a revocation and an answer, only one stands.
    const { count } = await this.db.$write(byDeviceKey(deviceId), (tx) =>
      tx.device.updateMany({
        where: {
          id: deviceId,
          keyRevokedAt: null,
          OR: [
            { lastAnsweredChallengeMadeAt: null },
            { lastAnsweredChallengeMadeAt: { lt: made.madeAt } },
          ],
        },
        data: { lastAnsweredChallengeMadeAt: made.madeAt },
      }),
    );
    if (count !== 1) return { proven: false, why: 'SPENT' };
    return { proven: true, token: tokens.make(deviceId, now), expiresInSeconds: tokens.seconds };
  }

  // The phone a token is of, read now; undefined when the token isn't one the API made, has
  // run out, or names a phone whose key is revoked.
  async proven(token: string | undefined): Promise<ProvenPhone | undefined> {
    const deviceId = this.parts.tokens.deviceOf(token, this.parts.clock.now());
    if (deviceId === undefined) return undefined;
    const phone = await this.db.$read((tx) =>
      tx.device.findUnique({
        where: { id: deviceId },
        select: {
          name: true,
          status: true,
          outOfServiceAt: true,
          masterPasscodeVersion: true,
          keyRevokedAt: true,
        },
      }),
    );
    if (phone?.keyRevokedAt !== null) return undefined;
    return {
      deviceId,
      name: phone.name,
      status: phone.status,
      outOfServiceAt: phone.outOfServiceAt,
      masterPasscodeVersion: phone.masterPasscodeVersion,
    };
  }

  // The version of the master passcode in force, for a phone to learn that its check is old.
  async masterPasscodeVersionInForce(): Promise<number> {
    const { _max } = await this.db.$read((tx) =>
      tx.masterPasscode.aggregate({ _max: { version: true } }),
    );
    if (_max.version === null) throw new Error('The database holds no master passcode.');
    return _max.version;
  }
}
