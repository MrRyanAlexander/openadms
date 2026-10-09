// What the back office may do to a record after the worker has looked at it, and what it is
// told when it may not (spec/parts/08-review-and-corrections.md; adms-exceptions §4.3a,
// "Corrections: in place, by permission"; ADR-022, 028, 039, 050, 051, 156, 173, 364; KD-25).
//
// A reviewer's action is open to an admin, and to a manager/analyst only with that action's own
// grant; nobody else corrects a record. Nothing here judges the choice itself: renumbering a
// phantom is saved like any renumber, and the audit trail is the backstop (ADR-051). What is
// refused is only what can't be a record at all: a number that is blank, a split suffix where
// none belongs, a number another field event of the same kind holds, a reason that isn't
// offered for the use, a quarantined record resolved twice, a void of a number no field event
// is under, a second void of a void ticket, an unvoid of one that isn't void, an acceptance of
// a flag that no longer stands or is accepted already (ADR-365); a lock on a ticket that isn't
// QC Approved and COMPLETED, a second lock, an unlock of a ticket that isn't locked, and a change
// to a ticket while its lock stands (ADR-367).
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
    | 'NOT_ON_THIS_PROJECT'
    | 'NOT_A_TICKET'
    | 'ALREADY_VOID'
    | 'NOT_VOID'
    | 'FLAG_CLEARED'
    | 'ALREADY_ACCEPTED'
    | 'LOCKED_AS_INVOICED'
    | 'NOT_QCD_ALONE'
    | 'NOT_WHOLE'
    | 'NOT_COMPLETED'
    | 'NOT_QC_APPROVED'
    | 'ALREADY_LOCKED'
    | 'NOT_LOCKED'
    | 'BATCH_NAME_BLANK'
    | 'BATCH_NAME_USED'
    | 'BATCH_ON_ANOTHER_PROJECT';
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

// A person's void of a ticket, and its unvoid (adms-exceptions "Correct, void or accept";
// ADR-028, 060, 360, 365). A void names a ticket as the worker groups one: nothing asks whether
// the work happened, which is the reviewer's call.
export class TicketVoiding {
  private readonly ticket: {
    readonly ticketNumber: string;
    // How many field events are under the number, in its project and workflow.
    readonly fieldEvents: number;
    // A person's void in force on it.
    readonly voidInForce: boolean;
    // Its field events stand at VOID: a person's void the worker has read, or a rule's.
    readonly standsVoid: boolean;
  };

  constructor(ticket: {
    ticketNumber: string;
    fieldEvents: number;
    voidInForce: boolean;
    standsVoid: boolean;
  }) {
    this.ticket = ticket;
  }

  // Why it can't be voided, or nothing.
  voidRefusal(): ReviewRefusal | null {
    const { ticketNumber, fieldEvents, voidInForce, standsVoid } = this.ticket;
    if (fieldEvents === 0) {
      return {
        code: 'NOT_A_TICKET',
        message: `No field event of this project is under ${ticketNumber}: there is no such ticket to void. Nothing was saved.`,
      };
    }
    if (voidInForce || standsVoid) {
      return {
        code: 'ALREADY_VOID',
        message: `Ticket ${ticketNumber} is already void. Nothing was saved.`,
      };
    }
    return null;
  }

  // Why it can't be unvoided, or nothing.
  unvoidRefusal(): ReviewRefusal | null {
    const { ticketNumber, voidInForce, standsVoid } = this.ticket;
    if (voidInForce || standsVoid) return null;
    return {
      code: 'NOT_VOID',
      message: `Ticket ${ticketNumber} isn’t void. Nothing was changed.`,
    };
  }
}

// Accepting a flag that is right as it is (adms-validation §5.4b; spec/FLAGS.md §1; ADR-166,
// 365). Any flag that stands may be accepted, once; a flag the worker has cleared is history.
export class FlagAccepting {
  private readonly flag: {
    readonly message: string;
    readonly cleared: boolean;
    readonly accepted: boolean;
  };

  constructor(flag: { message: string; cleared: boolean; accepted: boolean }) {
    this.flag = flag;
  }

  refusal(): ReviewRefusal | null {
    const { message, cleared, accepted } = this.flag;
    if (cleared) {
      return {
        code: 'FLAG_CLEARED',
        message: `This flag no longer stands ("${message}"): there is nothing to accept. Nothing was saved.`,
      };
    }
    if (accepted) {
      return {
        code: 'ALREADY_ACCEPTED',
        message: `This flag is already accepted ("${message}"). Nothing was saved.`,
      };
    }
    return null;
  }
}

// The back office's QC status, as the database's QcStatus keeps it (ADR-107). A record nobody
// has marked is at QC Review.
export const qcStatuses = ['QC_REVIEW', 'QC_APPROVED', 'QC_ISSUES', 'QC_VOID'] as const;
export type QcStatusName = (typeof qcStatuses)[number];

const qcInWords: Record<QcStatusName, string> = {
  QC_REVIEW: 'QC Review',
  QC_APPROVED: 'QC Approved',
  QC_ISSUES: 'QC Issues',
  QC_VOID: 'QC Void',
};

// A change to a ticket's own records while it is locked as invoiced: its field events, their
// lines and photographs, a void, an acceptance. A locked ticket is unlocked first (ADR-057, 367).
export class LockedTicket {
  private readonly ticketNumbers: readonly string[];

  constructor(ticketNumbers: readonly string[]) {
    this.ticketNumbers = ticketNumbers;
  }

  refusal(): ReviewRefusal | null {
    const [first] = this.ticketNumbers;
    if (first === undefined) return null;
    return {
      code: 'LOCKED_AS_INVOICED',
      message: `Ticket ${first} is locked as invoiced: unlock it first. Nothing was changed.`,
    };
  }
}

// A field event named as a ticket to QC or lock on its own. Only a unit rate ticket is: a load
// or a haul-out is QC'd and locked as its completed record, a split as one (ADR-168, 295).
export class TicketOnItsOwn {
  private readonly kind: FieldEventKindName;

  constructor(kind: FieldEventKindName) {
    this.kind = kind;
  }

  refusal(): ReviewRefusal | null {
    if (this.kind === 'UNIT_RATE') return null;
    return {
      code: 'NOT_QCD_ALONE',
      message: `A ${kindInWords[this.kind]} is never QC’d or locked on its own: its completed load or haul-out is, once the ticket is whole. Nothing was saved.`,
    };
  }
}

// A ticket as the lock reads it: a completed load, a completed haul-out or a unit rate ticket.
export interface LockableTicket {
  readonly ticketNumber: string;
  // Its completed record was dissolved: the ticket is no longer whole.
  readonly dissolved: boolean;
  // The status its field events stand at, each once.
  readonly statuses: readonly string[];
  readonly qcStatus: QcStatusName;
  // A lock in force on it.
  readonly locked: boolean;
}

// Locking a ticket as invoiced, and unlocking it (adms-ledger-audit §6.1d; ADR-057, 067, 121,
// 367). Only a ticket that is whole, COMPLETED and QC Approved locks: one in review is resolved
// first, and QC Review, QC Issues and QC Void all block. A void ticket bills nothing and isn't
// locked. The lock holds no amount: a COMPLETED ticket that bills nothing locks like any other.
export class InvoiceLocking {
  private readonly ticket: LockableTicket;

  constructor(ticket: LockableTicket) {
    this.ticket = ticket;
  }

  lockRefusal(): ReviewRefusal | null {
    const { ticketNumber, dissolved, statuses, qcStatus, locked } = this.ticket;
    if (locked) {
      return {
        code: 'ALREADY_LOCKED',
        message: `Ticket ${ticketNumber} is already locked as invoiced. Nothing was changed.`,
      };
    }
    if (dissolved) {
      return {
        code: 'NOT_WHOLE',
        message: `Ticket ${ticketNumber} is no longer whole: there is nothing to lock until it is. Nothing was locked.`,
      };
    }
    if (statuses.length !== 1 || statuses[0] !== 'COMPLETED') {
      const why = statuses.includes('VOID')
        ? 'is void: it bills nothing and isn’t locked as invoiced'
        : statuses.includes('MANUAL_REVIEW')
          ? 'is in review: every flag on it is fixed or accepted before it is locked as invoiced'
          : 'isn’t completed yet';
      return {
        code: 'NOT_COMPLETED',
        message: `Ticket ${ticketNumber} ${why}. Nothing was locked.`,
      };
    }
    if (qcStatus !== 'QC_APPROVED') {
      return {
        code: 'NOT_QC_APPROVED',
        message: `Ticket ${ticketNumber} is at ${qcInWords[qcStatus]}: only a QC Approved ticket can be locked as invoiced. Nothing was locked.`,
      };
    }
    return null;
  }

  // Nothing but the lock itself is asked: people are trusted not to unlock without good reason,
  // and the audit log records who did (Part 9, invoicing, step 4).
  unlockRefusal(): ReviewRefusal | null {
    return this.ticket.locked ? null : this.notLocked();
  }

  // What a person is told who unlocks, or names a batch for, a ticket with no lock in force.
  notLocked(): ReviewRefusal {
    return {
      code: 'NOT_LOCKED',
      message: `Ticket ${this.ticket.ticketNumber} isn’t locked as invoiced. Nothing was changed.`,
    };
  }
}

// An invoice batch's name: the firm's own words, used once on a project (ADR-228, 363).
export class BatchName {
  readonly name: string;

  constructor(name: string) {
    this.name = name.trim();
  }

  refusal(): ReviewRefusal | null {
    if (this.name !== '') return null;
    return {
      code: 'BATCH_NAME_BLANK',
      message: 'An invoice batch needs a name. Nothing was saved.',
    };
  }

  // The name another batch of the project holds: the database's own key refused it.
  used(): ReviewRefusal {
    return {
      code: 'BATCH_NAME_USED',
      message: `This project already has an invoice batch named "${this.name}". Nothing was saved.`,
    };
  }

  // A batch of another project, named for a lock.
  static onAnotherProject(): ReviewRefusal {
    return {
      code: 'BATCH_ON_ANOTHER_PROJECT',
      message: 'A ticket is locked in a batch of its own project. Nothing was locked.',
    };
  }
}
