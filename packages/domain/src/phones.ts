// The firm's phones and its master passcode, as the back office changes them (ARCHITECTURE §7.4,
// §7.5; spec/acceptance/02-people-and-devices.md AC-02-21, 23, 59; spec/acceptance/10-api-and-sync.md
// AC-10-24; ADR-106, 134, 240, 281, 403, 428).
//
// - **A phone is taken out of service once**, as lost or retired, from the moment it is marked
//   (ADR-134). Its record is kept; what it made later arrives flagged, never refused.
// - **The master passcode** is 8 to 128 characters, each Unicode code point one character, and
//   never a password known from breaches: the rule the installer asks of the firm's first one
//   (`tools/setup`, which keeps its own copy, having no domain to read). No composition rule and
//   no age (NIST SP 800-63B-4 §3.1.1.2): the firm changes it when it chooses (ADR-106).
import { passwordAsKept, type BreachedPasswords, type PasswordProblem } from './passwords.ts';

// How a phone leaves service, as the database's DeviceStatus keeps them.
export const phoneRemovals = ['LOST', 'RETIRED'] as const;

export type PhoneRemoval = (typeof phoneRemovals)[number];

export interface PhoneRemovalRefusal {
  readonly code: 'ALREADY_OUT_OF_SERVICE';
  readonly message: string;
}

export class PhoneRules {
  // Why this phone can't be taken out of service now, or nothing.
  removalRefusal(phone: {
    readonly name: string;
    readonly outOfServiceAt: Date | null;
  }): PhoneRemovalRefusal | null {
    if (phone.outOfServiceAt === null) return null;
    return {
      code: 'ALREADY_OUT_OF_SERVICE',
      message: `${phone.name} was already taken out of service. Nothing was changed.`,
    };
  }
}

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
  static readonly shortest = 8;
  static readonly longest = 128;
  private readonly breached: BreachedPasswords;

  constructor(breached: BreachedPasswords) {
    this.breached = breached;
  }

  // Why the passcode is refused, or undefined when it is taken.
  problem(passcode: string): PasswordProblem | undefined {
    const length = Array.from(passwordAsKept(passcode)).length;
    if (length < MasterPasscodeRules.shortest) {
      return {
        code: 'PASSWORD_TOO_SHORT',
        message: `The master passcode needs at least ${String(MasterPasscodeRules.shortest)} characters.`,
      };
    }
    if (length > MasterPasscodeRules.longest) {
      return {
        code: 'PASSWORD_TOO_LONG',
        message: `The master passcode can have at most ${String(MasterPasscodeRules.longest)} characters.`,
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
