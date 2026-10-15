// The firm's phones and its master passcode, as the back office changes them (ARCHITECTURE §7.4,
// §7.5; spec/acceptance/02-people-and-devices.md AC-02-21, 23, 59; spec/acceptance/10-api-and-sync.md
// AC-10-24; ADR-106, 134, 240, 281, 403, 428).
//
// - **A phone is taken out of service**, as lost or retired, from the moment it is marked or from
//   a removal time stated by hand, never after now nor before it was enrolled (ADR-134, 530). Its
//   record is kept; what it made later arrives flagged, never refused. A lost phone may then be
//   made retired, and a found one put back in service, while its key stands (ADR-530).
// - **A lost phone's key** is revoked once it has stood out of service the firm's hours, counted
//   from its last mark (ADR-520 (1), 530): `PhoneKeyRules`.
// - **The master passcode** is the policy's 8 to 128 characters, each Unicode code point one
//   character, and never a password known from breaches: the rule the installer asks of the
//   firm's first one (`tools/setup`, which reads the same two values from policy.env, having no
//   domain to read). No composition rule and no age (NIST SP 800-63B-4 §3.1.1.2): the firm
//   changes it when it chooses (ADR-106).
import { passwordAsKept, type BreachedPasswords, type PasswordProblem } from './passwords.ts';
import type { Policy } from './policy.ts';

// How a phone leaves service, as the database's DeviceStatus keeps them.
export const phoneRemovals = ['LOST', 'RETIRED'] as const;

export type PhoneRemoval = (typeof phoneRemovals)[number];

export interface PhoneRemovalRefusal {
  readonly code: 'ALREADY_OUT_OF_SERVICE' | 'IN_SERVICE' | 'KEY_REVOKED' | 'REMOVAL_TIME_REFUSED';
  readonly message: string;
}

// A phone as the back office's rules read it.
export interface PhoneStanding {
  readonly name: string;
  readonly status: 'ACTIVE' | PhoneRemoval;
  readonly enrolledAt: Date;
  readonly outOfServiceAt: Date | null;
  readonly keyRevokedAt: Date | null;
}

// What a removal asks: the kind, and a removal time stated by hand where the person gave one.
export interface RemovalAsked {
  readonly status: PhoneRemoval;
  readonly outOfServiceAt?: Date | undefined;
}

export class PhoneRules {
  // Why this phone can't be taken out of service as asked now, or nothing. A phone in service is
  // marked lost or retired; a lost one may be made retired, its removal time kept unless one is
  // stated; nothing else changes a phone already out of service, and nothing changes a revoked
  // key's phone. A removal time stated by hand is never after now nor before its enrolment.
  removalRefusal(phone: PhoneStanding, asked: RemovalAsked, now: Date): PhoneRemovalRefusal | null {
    if (phone.keyRevokedAt !== null) return this.revoked(phone);
    const lostMadeRetired = phone.status === 'LOST' && asked.status === 'RETIRED';
    if (phone.status !== 'ACTIVE' && !lostMadeRetired) {
      return {
        code: 'ALREADY_OUT_OF_SERVICE',
        message: `${phone.name} was already taken out of service as ${phone.status === 'LOST' ? 'lost' : 'retired'}. Nothing was changed.`,
      };
    }
    const stated = asked.outOfServiceAt;
    if (stated !== undefined && (stated > now || stated < phone.enrolledAt)) {
      return {
        code: 'REMOVAL_TIME_REFUSED',
        message: `A removal time is never after now, nor before ${phone.name} was enrolled. Nothing was changed.`,
      };
    }
    return null;
  }

  // The removal time the phone is given: the one stated, else a lost phone made retired keeps
  // its own, else now.
  removedAt(phone: PhoneStanding, asked: RemovalAsked, now: Date): Date {
    return asked.outOfServiceAt ?? phone.outOfServiceAt ?? now;
  }

  // Why this phone can't be put back in service, or nothing: only a phone out of service whose
  // key stands. A revoked key is never trusted again: the phone is wiped and enrolled anew.
  returnRefusal(phone: PhoneStanding): PhoneRemovalRefusal | null {
    if (phone.keyRevokedAt !== null) return this.revoked(phone);
    if (phone.status === 'ACTIVE') {
      return {
        code: 'IN_SERVICE',
        message: `${phone.name} is in service. Nothing was changed.`,
      };
    }
    return null;
  }

  private revoked(phone: PhoneStanding): PhoneRemovalRefusal {
    return {
      code: 'KEY_REVOKED',
      message: `${phone.name}’s key is revoked, so it stays as it is. Wipe the phone and enrol it again to use it. Nothing was changed.`,
    };
  }
}

// When a phone out of service has its key revoked by the firm's time (REQ-214; ADR-520 (1),
// 530): its last mark plus the firm's hours. Off (no hours), never.
export class PhoneKeyRules {
  // The firm's setting as the release starts it: the policy's hours, nought for off.
  static startingHours(policy: Pick<Policy, 'phoneKeyRevokedAfterHours'>): number | null {
    return policy.phoneKeyRevokedAfterHours === 0 ? null : policy.phoneKeyRevokedAfterHours;
  }

  // The moment a phone marked then is due, or null when the firm has it off.
  dueAt(markedAt: Date, hours: number | null): Date | null {
    return hours === null ? null : new Date(markedAt.getTime() + hours * 3_600_000);
  }

  // The latest mark a phone may carry and be due now: what the worker asks the database for.
  markedBy(now: Date, hours: number): Date {
    return new Date(now.getTime() - hours * 3_600_000);
  }

  due(markedAt: Date | null, hours: number | null, now: Date): boolean {
    if (markedAt === null) return false;
    const at = this.dueAt(markedAt, hours);
    return at !== null && at <= now;
  }
}

// The most hours a firm may keep a lost phone's key: a year (the database's check too).
export const phoneKeyHoursAtMost = 8760;

// How a block of numbers ends when its phone is turned in (ADR-065, 134, 488): its unused rest
// handed back for the next phone, or the whole block retired; as the database's
// NumberBlockStatus keeps them.
export const turnedInBlocks = ['RECLAIMED', 'RETIRED'] as const;

export type TurnedInBlocks = (typeof turnedInBlocks)[number];

// A phone turned in under the master passcode ("Sync and turn in", ARCHITECTURE §8; AC-02-58,
// 61; ADR-065, 096, 134, 488).
//
// - **Nothing is wiped before the server has it** (ADR-096): the phone is told to wipe only
//   when every record and every photograph's file it still holds is on the server. A record the
//   server holds for a person, not saved, is on the server (ADR-468 (2)); a photograph whose file
//   isn't kept is not, since its file is only on the phone.
// - **Its numbers end with it** (ADR-065): a phone in hand that reports the last number it used
//   of a series has the unused rest of that series' blocks handed back; a series it doesn't
//   report is retired whole, since nobody can be sure what it used of it; and a lost phone's
//   blocks are retired whole whatever it reports, as they would have been had it never turned up.
export class TurnInRules {
  blocksEnd(
    phone: { readonly status: 'ACTIVE' | PhoneRemoval },
    reported: boolean,
  ): TurnedInBlocks {
    return phone.status !== 'LOST' && reported ? 'RECLAIMED' : 'RETIRED';
  }

  // What a supervisor is told when the phone holds something the server doesn't have: the phone
  // keeps everything and is not wiped.
  notConfirmed(missing: { readonly records: number; readonly files: number }): string {
    const counted = (count: number, one: string, many: string) =>
      `${String(count)} ${count === 1 ? one : many}`;
    const parts = [
      ...(missing.records > 0 ? [counted(missing.records, 'record', 'records')] : []),
      ...(missing.files > 0
        ? [counted(missing.files, 'photograph’s file', 'photographs’ files')]
        : []),
    ];
    return `Not turned in: the server doesn’t have ${parts.join(' and ')} this phone holds yet. Nothing was wiped and nothing was changed. Sync the phone again, then turn it in.`;
  }
}

export class MasterPasscodeRules {
  private readonly shortest: number;
  private readonly longest: number;
  private readonly breached: BreachedPasswords;

  constructor(
    policy: Pick<Policy, 'masterPasscodeMinimumLength' | 'masterPasscodeMaximumLength'>,
    breached: BreachedPasswords,
  ) {
    this.shortest = policy.masterPasscodeMinimumLength;
    this.longest = policy.masterPasscodeMaximumLength;
    this.breached = breached;
  }

  // Why the passcode is refused, or undefined when it is taken.
  problem(passcode: string): PasswordProblem | undefined {
    const length = Array.from(passwordAsKept(passcode)).length;
    if (length < this.shortest) {
      return {
        code: 'PASSWORD_TOO_SHORT',
        message: `The master passcode needs at least ${String(this.shortest)} characters.`,
      };
    }
    if (length > this.longest) {
      return {
        code: 'PASSWORD_TOO_LONG',
        message: `The master passcode can have at most ${String(this.longest)} characters.`,
      };
    }
    if (this.breached.has(passcode)) {
      return {
        code: 'PASSWORD_BREACHED',
        message: 'That is on a list of passwords known from breaches. Choose another.',
      };
    }
    return undefined;
  }
}
