// What the back office may do to a record after the worker has looked at it, and what it is
// told when it may not (spec/parts/08-review-and-corrections.md; adms-exceptions §4.3a,
// "Corrections: in place, by permission"; ADR-022, 028, 039, 050, 051, 156, 173, 364; KD-25).
//
// A reviewer's action is open to an admin, and to a manager/analyst only with that action's own
// grant; nobody else corrects a record. Nothing here judges the choice itself: renumbering a
// phantom is saved like any renumber, and the audit trail is the backstop (ADR-051). What is
// refused is only what can't be a record at all: a number that is blank, a split suffix where
// none belongs, a number another field event of the same kind holds, a reason that isn't
// offered for the use, a quarantined record resolved twice.
import type { FieldEventKindName } from './field-event-details.ts';

// The grants a reviewer's action asks for, as the database's Permission keeps them.
export const reviewPermissions = [
  'CORRECT',
  'RENUMBER',
  'VOID',
  'ACCEPT_FLAG',
  'QC',
  'LOCK_INVOICED',
  'UNLOCK_INVOICED',
] as const;
export type ReviewPermission = (typeof reviewPermissions)[number];

const permissionInWords: Record<ReviewPermission, { grant: string; action: string }> = {
  CORRECT: { grant: 'correct', action: 'correct a record' },
  RENUMBER: { grant: 'renumber', action: 'renumber a record' },
  VOID: { grant: 'void', action: 'void or unvoid a ticket' },
  ACCEPT_FLAG: { grant: 'accept flags', action: 'accept a flag' },
  QC: { grant: 'QC', action: 'set a QC status' },
  LOCK_INVOICED: { grant: 'lock as invoiced', action: 'lock a ticket as invoiced' },
  UNLOCK_INVOICED: { grant: 'unlock', action: 'unlock an invoiced ticket' },
};

export type ReviewerRole = 'ADMIN' | 'MANAGER_ANALYST' | 'MONITOR' | 'READ_ONLY_VIEWER' | 'SYSTEM';

// The person acting, as these rules read them: their role, whether they have been archived, and
// the grants they hold now (one taken away isn't among them).
export interface ReviewingPerson {
  readonly name: string;
  readonly role: ReviewerRole;
  readonly archived: boolean;
  readonly granted: readonly string[];
}

export interface ReviewRefusal {
  readonly code:
    | 'NOT_PERMITTED'
    | 'NUMBER_BLANK'
    | 'NUMBER_UNCHANGED'
    | 'SUFFIX_NOT_ON_THIS_KIND'
    | 'SUFFIX_NOT_LETTERS'
    | 'NUMBER_HELD'
    | 'ROE_NUMBER_HELD'
    | 'REASON_NOT_OFFERED'
    | 'ALREADY_RESOLVED'
    | 'GPS_UNREADABLE'
    | 'NOT_ON_THIS_PROJECT';
  readonly message: string;
}

export class Reviewer {
  private readonly person: ReviewingPerson;

  constructor(person: ReviewingPerson) {
    this.person = person;
  }

  // Why this person may not do it, or nothing: an admin may do every action; a manager/analyst
  // the ones granted; a monitor, a read-only viewer and the system actor none (ADR-050, 051).
  refusal(permission: ReviewPermission): ReviewRefusal | null {
    const { name, role, archived, granted } = this.person;
    const allowed =
      !archived &&
      (role === 'ADMIN' || (role === 'MANAGER_ANALYST' && granted.includes(permission)));
    if (allowed) return null;
    const { grant, action } = permissionInWords[permission];
    return {
      code: 'NOT_PERMITTED',
      message: `${name} may not ${action}: it takes an admin, or a manager/analyst granted "${grant}". Nothing was changed.`,
    };
  }
}

const kindInWords: Record<FieldEventKindName, string> = {
  COLLECTION: 'collection',
  DISPOSAL: 'disposal',
  HAUL_OUT_COLLECTION: 'haul-out collection',
  HAUL_OUT_DISPOSAL: 'haul-out disposal',
  UNIT_RATE: 'unit rate event',
};

// The kinds that record one property or one pile of a split, so carry its suffix (ADR-055, 295).
const kindsWithASuffix: readonly FieldEventKindName[] = ['COLLECTION', 'HAUL_OUT_COLLECTION'];

// A number as a record is written under: the bare number and, on a split's collection, its
// suffix. Two fields, never one string (ADR-062).
export interface NumberWritten {
  readonly ticketNumber: string;
  readonly splitSuffix: string;
}

const written = (number: NumberWritten): string =>
  number.splitSuffix === '' ? number.ticketNumber : `${number.ticketNumber}-${number.splitSuffix}`;

// A renumber of one field event: the number it has, and the one a reviewer gives it.
export class Renumber {
  readonly from: NumberWritten;
  readonly to: NumberWritten;
  private readonly kind: FieldEventKindName;

  constructor(kind: FieldEventKindName, from: NumberWritten, to: NumberWritten) {
    this.kind = kind;
    this.from = from;
    this.to = { ticketNumber: to.ticketNumber.trim(), splitSuffix: to.splitSuffix.trim() };
  }

  // Why it can't be saved, or nothing. Whether the work is real isn't asked: that is the
  // reviewer's call, and the audit log's to keep (ADR-028, 051).
  refusal(): ReviewRefusal | null {
    const { from, to, kind } = this;
    if (to.ticketNumber === '') {
      return {
        code: 'NUMBER_BLANK',
        message: 'A ticket number can’t be blank. Nothing was changed.',
      };
    }
    if (to.splitSuffix !== '' && !kindsWithASuffix.includes(kind)) {
      return {
        code: 'SUFFIX_NOT_ON_THIS_KIND',
        message: `A ${kindInWords[kind]} takes no split suffix: only a split’s collections do. Nothing was changed.`,
      };
    }
    if (!/^[A-Z]*$/.test(to.splitSuffix)) {
      return {
        code: 'SUFFIX_NOT_LETTERS',
        message: `A split suffix is capital letters (A, B…), not "${to.splitSuffix}". Nothing was changed.`,
      };
    }
    if (to.ticketNumber === from.ticketNumber && to.splitSuffix === from.splitSuffix) {
      return {
        code: 'NUMBER_UNCHANGED',
        message: `It is already numbered ${written(from)}. Nothing was changed.`,
      };
    }
    return null;
  }

  // The number another field event of its kind holds: the database's own key refused it.
  held(): ReviewRefusal {
    return {
      code: 'NUMBER_HELD',
      message: `Ticket ${written(this.to)} already has a ${kindInWords[this.kind]}: a ticket has one of each kind. Nothing was changed.`,
    };
  }
}

// A reason picked from the firm's list, and the use it is picked for (ADR-173).
export type ReasonUseName = 'VOID' | 'TYPED_NUMBER' | 'ACCEPT_FLAG' | 'BACK_OFFICE_RECORD';

const useInWords: Record<ReasonUseName, string> = {
  VOID: 'voiding a ticket',
  TYPED_NUMBER: 'a typed ticket number',
  ACCEPT_FLAG: 'accepting a flag',
  BACK_OFFICE_RECORD: 'a record created in the back office',
};

export class PickedReason {
  private readonly reason: {
    readonly name: string;
    readonly uses: readonly string[];
    readonly archived: boolean;
  };

  constructor(reason: { name: string; uses: readonly string[]; archived: boolean }) {
    this.reason = reason;
  }

  // A reason is picked from the ones the firm offers for that use, never another list's.
  refusal(use: ReasonUseName): ReviewRefusal | null {
    const { name, uses, archived } = this.reason;
    if (!archived && uses.includes(use)) return null;
    return {
      code: 'REASON_NOT_OFFERED',
      message: `"${name}" isn’t a reason the firm offers for ${useInWords[use]}. Nothing was saved.`,
    };
  }
}

// Resolving a quarantined record: whether it still can be, and the words its record keeps for
// how (ADR-022, 338, 364). Either way the record stays, with what the phone sent exactly as sent.
export class QuarantineResolution {
  // How it was resolved already; nothing while it waits.
  private readonly standing: string | null;

  constructor(standing: string | null) {
    this.standing = standing;
  }

  // A record is resolved once: afterwards it stays as it was resolved.
  refusal(): ReviewRefusal | null {
    if (this.standing === null) return null;
    return {
      code: 'ALREADY_RESOLVED',
      message: `This quarantined record is already resolved (${this.standing}). Nothing was changed.`,
    };
  }

  // Real work under a taken number: it became a record of its own under the number it should
  // have had, keeping the id its phone made.
  renumbered(to: string): string {
    return `Renumbered to ${to}: saved as a record of its own, with its photographs.`;
  }

  // The same work sent twice under two ids: the record that holds the number is the record.
  secondCopy(): string {
    return 'A second copy of the record that holds its number: nothing was made from it.';
  }

  // An ROE's new number that another ROE of the project holds, or none at all.
  roeNumberHeld(roeNumber: string): ReviewRefusal {
    return roeNumber === ''
      ? { code: 'NUMBER_BLANK', message: 'An ROE number can’t be blank. Nothing was changed.' }
      : {
          code: 'ROE_NUMBER_HELD',
          message: `ROE ${roeNumber}: this project already has an ROE with that number. Nothing was changed.`,
        };
  }
}
