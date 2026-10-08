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
