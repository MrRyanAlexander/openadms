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
//   flagged, ADR-134). **One whose key its turn-in revoked proves nothing**, and a token it was
//   given before stops at once: the phone is read on every request.
// - **Any phone may prove itself with its key and the master passcode together** (ADR-531): the
//   master user is then at the phone, which counts as somebody signed in on it for what it sends,
//   nobody else being. Its signature is checked first, then the passcode by the one check every
//   act under it shares (a wrong one counts as at enrolment), and the use is a security event.
//   It is given a token of a second kind, signed for that purpose alone: the door takes it as
//   the key's proof with the master user at the phone besides.
// - **One whose key the firm's time revoked** (REQ-214; ADR-520 (2), 530) proves itself only so.
//   Without the passcode it is told the passcode is needed, and only once its signature is its
//   own.
// - **A refused proof writes nothing**: nothing a stranger sends grows the database (ADR-401).
import {
  byDeviceKey,
  underMasterPasscode,
  type Database,
  type DeviceKeyRevocation,
  type DeviceStatus,
} from '@open-adms/db';
import { PhoneProofRules } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { DeviceKeys } from './device-keys.ts';
import type { MasterPasscodeCheck } from './master-passcode-check.ts';
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
  | 'SPENT'
  // The firm's time revoked the key, and no passcode was sent beside it: the one refusal the
  // phone is told apart (MASTER_PASSCODE_NEEDED), since only its own signature reaches it.
  | 'PASSCODE_NEEDED'
  // The passcode sent beside the signature wasn't taken.
  | 'PASSCODE_REFUSED';

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
  // Whether the firm's time revoked its key (ADR-530): it proved itself with the master passcode.
  readonly keyRevoked: boolean;
  // Whether it proved itself with the master passcode beside its key: the master user is at it,
  // somebody signed in for what it sends (ADR-531).
  readonly withPasscode: boolean;
}

export interface PhoneProofParts {
  readonly rules: PhoneProofRules;
  readonly challenges: PhoneChallenges;
  readonly keys: DeviceKeys;
  readonly tokens: PhoneTokens;
  // The tokens of a phone whose key the firm's time revoked, signed for that purpose alone.
  readonly underPasscode: PhoneTokens;
  readonly passcode: MasterPasscodeCheck;
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

  async prove(
    deviceId: string,
    challenge: string,
    signature: string,
    passcode?: string,
  ): Promise<ProofOutcome> {
    const { rules, challenges, keys, tokens, underPasscode, clock } = this.parts;
    const now = clock.now();
    const made = challenges.read(challenge, now);
    if (made?.deviceId !== deviceId) return { proven: false, why: 'NO_CHALLENGE' };
    const phone = await this.db.$read((tx) =>
      tx.device.findUnique({
        where: { id: deviceId },
        select: { publicKey: true, keyRevokedBy: true, lastAnsweredChallengeMadeAt: true },
      }),
    );
    if (phone === null) return { proven: false, why: 'NO_PHONE' };
    if (phone.keyRevokedBy === 'TURN_IN') return { proven: false, why: 'KEY_REVOKED' };
    if (!keys.signedBy(phone.publicKey, PhoneProofRules.signed(challenge), signature)) {
      return { proven: false, why: 'NOT_SIGNED' };
    }
    if (!rules.unspent(made.madeAt, phone.lastAnsweredChallengeMadeAt)) {
      return { proven: false, why: 'SPENT' };
    }
    const revoked = phone.keyRevokedBy === 'FIRM_TIME';
    if (revoked && passcode === undefined) return { proven: false, why: 'PASSCODE_NEEDED' };
    let checked: Awaited<ReturnType<MasterPasscodeCheck['check']>> | undefined;
    if (passcode !== undefined) {
      checked = await this.parts.passcode.check(passcode, now, deviceId);
      if (!checked.taken) return { proven: false, why: 'PASSCODE_REFUSED' };
    }
    // Compared again and written in one statement, under the row's lock: of two answers to one
    // challenge, or of a revocation and an answer, only one stands.
    const { count } = await this.db.$write(byDeviceKey(deviceId), (tx) =>
      tx.device.updateMany({
        where: {
          id: deviceId,
          keyRevokedBy: phone.keyRevokedBy,
          OR: [
            { lastAnsweredChallengeMadeAt: null },
            { lastAnsweredChallengeMadeAt: { lt: made.madeAt } },
          ],
        },
        data: { lastAnsweredChallengeMadeAt: made.madeAt },
      }),
    );
    if (count !== 1) return { proven: false, why: 'SPENT' };
    if (checked?.taken === true) {
      const taken = checked;
      await this.db.$write(underMasterPasscode(deviceId), (tx) =>
        this.parts.passcode.used(tx, taken, now, { deviceId }),
      );
    }
    const kind = checked === undefined ? tokens : underPasscode;
    return { proven: true, token: kind.make(deviceId, now), expiresInSeconds: kind.seconds };
  }

  // The phone a token is of, read now; undefined when the token isn't one the API made, has
  // run out, or names a phone whose key is revoked otherwise than its kind of token allows: a
  // token of a proof by the key alone, a key that stands; one of a proof with the passcode, a
  // key that stands or one the firm's time revoked and nobody has turned in since.
  async proven(token: string | undefined): Promise<ProvenPhone | undefined> {
    const { tokens, underPasscode, clock } = this.parts;
    const now = clock.now();
    const byKey = tokens.deviceOf(token, now);
    const deviceId = byKey ?? underPasscode.deviceOf(token, now);
    if (deviceId === undefined) return undefined;
    const withPasscode = byKey === undefined;
    const phone = await this.db.$read((tx) =>
      tx.device.findUnique({
        where: { id: deviceId },
        select: {
          name: true,
          status: true,
          outOfServiceAt: true,
          masterPasscodeVersion: true,
          keyRevokedBy: true,
        },
      }),
    );
    if (phone === null) return undefined;
    const allowed: readonly (DeviceKeyRevocation | null)[] = withPasscode
      ? [null, 'FIRM_TIME']
      : [null];
    if (!allowed.includes(phone.keyRevokedBy)) return undefined;
    return {
      deviceId,
      name: phone.name,
      status: phone.status,
      outOfServiceAt: phone.outOfServiceAt,
      masterPasscodeVersion: phone.masterPasscodeVersion,
      keyRevoked: phone.keyRevokedBy !== null,
      withPasscode,
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
