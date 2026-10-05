// What the server decides about a record as it arrives from a phone (spec/parts/05-sync.md;
// spec/acceptance/05-sync.md; adms-exceptions §4.3a; ARCHITECTURE §9; ADR-022, 052, 236, 329 (5),
// 338). Two things only, since sync refuses nothing over eligibility: whether a GPS fix can be
// one, and what a record kept in quarantine is told. Everything else about a record is taken as
// sent and judged later, by the worker.
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
