// What the server decides about a record as it arrives from a phone (spec/parts/05-sync.md;
// spec/acceptance/05-sync.md; adms-exceptions §4.3a; ARCHITECTURE §9; ADR-022, 052, 236, 329 (5),
// 338, 467, 468, 472). Three things only, since sync refuses nothing over eligibility: whether a
// GPS fix can be one, what a record kept in quarantine is told, and what one that could not be
// saved is told. Everything else about a record is taken as sent and judged later, by the worker.
import type { FieldEventKindName } from './field-event-details.ts';

// A fix as a phone sends it: whatever it had for each half.
export interface SentFix {
  readonly latitude: unknown;
  readonly longitude: unknown;
}

// A fix that can be one: both halves, exact decimals as text (invariant 15).
export interface ReadableFix {
  readonly latitude: string;
  readonly longitude: string;
}

// What the server keeps of a sent fix: the fix, or none; and, when what was sent couldn't be a
// fix, exactly what was sent, so the record is kept without it and the flag can be raised.
export interface FixReading {
  readonly fix: ReadableFix | null;
  readonly unreadable: SentFix | null;
}

const decimal = /^-?\d+(\.\d+)?$/;

export class GpsFix {
  private readonly sent: SentFix;

  constructor(sent: SentFix) {
    this.sent = sent;
  }

  // No fix at all is taken: a phone has whatever fix it had (ADR-083). Half a fix, a latitude
  // past 90, a longitude past 180 and anything that isn't a decimal can't be a fix (ADR-329 (5)).
  read(): FixReading {
    const { latitude, longitude } = this.sent;
    if (absent(latitude) && absent(longitude)) return { fix: null, unreadable: null };
    if (within(latitude, 90) && within(longitude, 180)) {
      return { fix: { latitude, longitude }, unreadable: null };
    }
    return { fix: null, unreadable: { latitude: latitude ?? null, longitude: longitude ?? null } };
  }
}

function absent(half: unknown): half is null | undefined {
  return half === null || half === undefined;
}

// The size is compared, never kept: what is kept is the text as sent.
function within(half: unknown, limit: number): half is string {
  return typeof half === 'string' && decimal.test(half) && Math.abs(Number(half)) <= limit;
}

// Why a record is in quarantine, as the database keeps it.
export const quarantineReasons = ['DUPLICATE_FIELD_EVENT', 'DUPLICATE_ROE_NUMBER'] as const;
export type QuarantineReason = (typeof quarantineReasons)[number];

// What a phone is told of a record that was not saved (ADR-022; REQ-308c).
export interface QuarantineNotice {
  readonly reason: QuarantineReason;
  readonly message: string;
}

const kindInWords: Record<FieldEventKindName, string> = {
  COLLECTION: 'collection',
  DISPOSAL: 'disposal',
  HAUL_OUT_COLLECTION: 'haul-out collection',
  HAUL_OUT_DISPOSAL: 'haul-out disposal',
  UNIT_RATE: 'unit rate event',
};

const kept = 'Not saved: kept in quarantine for review.';

// A record kept in quarantine: why, and what its phone is told.
export class Quarantine implements QuarantineNotice {
  readonly reason: QuarantineReason;
  readonly message: string;

  private constructor(reason: QuarantineReason, message: string) {
    this.reason = reason;
    this.message = message;
  }

  // A second field event of one kind on one ticket: the ticket has one of each kind (one
  // collection for each property of a split), and a load dumps once (ADR-022, 155, 236).
  static duplicateFieldEvent(
    kind: FieldEventKindName,
    ticketNumber: string,
    splitSuffix: string,
  ): Quarantine {
    const number = splitSuffix === '' ? ticketNumber : `${ticketNumber}-${splitSuffix}`;
    return new Quarantine(
      'DUPLICATE_FIELD_EVENT',
      `Ticket ${number}: this ticket already has a ${kindInWords[kind]}. ${kept}`,
    );
  }

  // An ROE made on a phone whose number another ROE of the project already has (ADR-149).
  static duplicateRoeNumber(roeNumber: string): Quarantine {
    return new Quarantine(
      'DUPLICATE_ROE_NUMBER',
      `ROE ${roeNumber}: this project already has an ROE with that number. ${kept}`,
    );
  }
}

// Why a record a phone sent is not saved (ADR-467): it isn't a record at all, something it
// names is no record the server has, the assignment it was made under was itself not saved, it
// is a certification its own rules refuse (ADR-469), or it is a photograph whose record the
// server doesn't have saved (ADR-481). The server holds it exactly as sent for
// a person (ADR-468, 471, 472), and it stays on its phone too. Never a judgement of the work:
// nothing is refused over eligibility (ADR-052).
export const notSavedReasons = [
  'NOT_A_RECORD',
  'NAMES_NO_RECORD',
  'ASSIGNMENT_NOT_SAVED',
  'CERTIFICATION_REFUSED',
  'OWNER_NOT_SAVED',
] as const;
export type NotSavedReason = (typeof notSavedReasons)[number];

// What a phone is told of such a record.
export interface NotSavedNotice {
  readonly reason: NotSavedReason;
  readonly message: string;
}

const notSavedLead = 'Not saved: ';
const heldForReview = 'Held on the server for review.';

export class NotSaved implements NotSavedNotice {
  readonly reason: NotSavedReason;
  readonly message: string;

  private constructor(reason: NotSavedReason, message: string) {
    this.reason = reason;
    this.message = message;
  }

  // What was sent fails its schema: `why` is the contract's own words for which field and how,
  // never a value that was sent.
  static notARecord(why: string): NotSaved {
    return new NotSaved('NOT_A_RECORD', `Not saved: this record can’t be read: ${why}.`);
  }

  // Its project, its monitor, its assignment, or something picked that isn't its project's: the
  // database's own constraints refuse it.
  static namesNoRecord(): NotSaved {
    return new NotSaved(
      'NAMES_NO_RECORD',
      'Not saved: this record names something the server doesn’t have: its project, its monitor, its assignment, or something picked from a list.',
    );
  }

  // The unplanned assignment it was made under was answered "not saved" (ADR-457).
  static assignmentNotSaved(): NotSaved {
    return new NotSaved(
      'ASSIGNMENT_NOT_SAVED',
      'Not saved: the assignment this record was made under was not saved.',
    );
  }

  // A certification its own rules refuse (ADR-469): measurements that give no capacity, a
  // replacement that doesn't say why, a sub typed into both tiers. `why` is the rule's own
  // words, as the certifying phone's copy of it says them.
  static certificationRefused(why: string): NotSaved {
    const said = why.startsWith(notSavedLead) ? why.slice(notSavedLead.length) : why;
    return new NotSaved('CERTIFICATION_REFUSED', `${notSavedLead}${said}`);
  }

  // A certification whose number another certification of its project already has: a cert
  // number is one certification's (ADR-045). Never the other certification's own details.
  static certNumberHeld(certNumber: string): NotSaved {
    return new NotSaved(
      'CERTIFICATION_REFUSED',
      `${notSavedLead}this project already has a certification ${certNumber}.`,
    );
  }

  // A certification that replaces one another certification has already replaced: a
  // certification is replaced once (ADR-082, 469 (5)).
  static replacedAlready(): NotSaved {
    return new NotSaved(
      'CERTIFICATION_REFUSED',
      `${notSavedLead}the certification this one replaces has already been replaced.`,
    );
  }

  // A photograph whose record the server has not saved: held, kept in quarantine elsewhere,
  // not yet sent, or not of the kind the photograph says (ADR-481). Sent again once its record
  // is saved, it is saved with it.
  static ownerNotSaved(): NotSaved {
    return new NotSaved(
      'OWNER_NOT_SAVED',
      `${notSavedLead}the record this photograph belongs to isn’t saved on the server.`,
    );
  }

  // The same notice once the server holds what was sent for a person (ADR-468, 472): its words
  // say so, and only then. Still never "saved".
  static heldForReview(notice: NotSavedNotice): NotSavedNotice {
    return { reason: notice.reason, message: `${notice.message} ${heldForReview}` };
  }
}
