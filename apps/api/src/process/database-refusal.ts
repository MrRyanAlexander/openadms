// What the database's own constraints refused, told plainly (ARCHITECTURE §5, §6, Output;
// AC-01-80; AC-10-33, 38; T-26; BACKLOG C60; ADR-097, 424). The database enforces the rules
// itself, so a request may be refused there and nowhere before: a second place for one contractor
// on a project, a time zone that isn't an IANA name, a record the request names that isn't on
// record. That is the caller's to hear, in plain words, and never an internal error.
//
// What is told is a plain code, and plain words where this file has them for the constraint; the
// constraint's own name, the table and the statement stay inside the server (the log says the
// constraint, by its name). **What is the server's own failure stays one:** a write the login has
// no grant for, a delete refused, a statement stopped by its time limit.
//
// Each task that puts a service behind an endpoint adds the words for the constraints its
// requests can reach; one with no words here is still answered plainly, by its kind.
import type { ErrorCode } from '@open-adms/contracts';

export interface DatabaseRefusal {
  readonly code: Extract<
    ErrorCode,
    'ALREADY_HELD' | 'UNKNOWN_RECORD' | 'REFUSED_BY_THE_DATABASE' | 'NOT_FOUND'
  >;
  readonly status: number;
  readonly said: string;
  // For the log only: the SQLSTATE, and the constraint by its name where the database named one.
  readonly sqlState?: string;
  readonly constraint?: string;
}

type Kind = Pick<DatabaseRefusal, 'code' | 'status' | 'said'>;

// By SQLSTATE: unique_violation; foreign_key_violation; check_violation, exclusion_violation,
// not_null_violation, invalid_text_representation, invalid_parameter_value.
const already: Kind = {
  code: 'ALREADY_HELD',
  status: 409,
  said: 'Not saved: there is already one of these.',
};
const unknown: Kind = {
  code: 'UNKNOWN_RECORD',
  status: 422,
  said: 'Not saved: something this names isn’t on record.',
};
const value: Kind = {
  code: 'REFUSED_BY_THE_DATABASE',
  status: 422,
  said: 'Not saved: a value isn’t one that can be kept.',
};
const kinds: Readonly<Record<string, Kind>> = {
  '23505': already,
  '23503': unknown,
  '23514': value,
  '23P01': value,
  '23502': value,
  '22P02': value,
  '22023': value,
};

// The plain words for a constraint, by its name in the database.
const words: Readonly<Record<string, string>> = {
  // Setup, steps 1 to 4 (task 2.4.2).
  project_time_zone_named_check:
    'Not saved: the time zone must be an IANA name, such as America/New_York.',
  project_time_zone_known_check:
    'Not saved: the time zone must be an IANA name, such as America/New_York.',
  project_active_window_check: 'Not saved: the active window ends before it starts.',
  project_load_call_limits_check:
    'Not saved: a load-call limit is a whole number from 0 to 100, or empty to switch it off.',
  project_site_circle_check: 'Not saved: the site circle is 1 metre or more.',
  project_stump_fill_depth_check: 'Not saved: the stump fill depth is 1 inch or more.',
  project_kind_of_work_project_id_kind_of_work_id_key:
    'Not saved: a kind of unit rate work is named twice.',
  project_number_series_project_id_series_key:
    'Not saved: the project already has that number series.',
  project_number_series_ticket_range_check:
    'Not saved: a ticket number series starts at 100,001 or above.',
  control_range_range_check:
    'Not saved: a range starts at 1 or above and ends at or after its start.',
  control_ranges_never_overlap:
    'Not saved: the range shares a number with another range of the same series.',
  project_contractor_project_id_contractor_id_key:
    'Not saved: that contractor already has a place on the project.',
  project_contractor_project_id_as_prime_id_key:
    'Not saved: that contractor already has a place on the project.',
};

const notFound: DatabaseRefusal = {
  code: 'NOT_FOUND',
  status: 404,
  said: 'Nothing with that id is on record.',
};

interface DriverCause {
  readonly originalCode?: unknown;
  readonly originalMessage?: unknown;
  readonly constraint?: { readonly index?: unknown };
}

// How Prisma hands on what Postgres said: the driver's own error, kept on the one it throws.
function causeOf(thrown: unknown): DriverCause | undefined {
  if (typeof thrown !== 'object' || thrown === null) return undefined;
  const meta = (thrown as { meta?: { driverAdapterError?: { cause?: unknown } } }).meta;
  const cause = meta?.driverAdapterError?.cause;
  return typeof cause === 'object' && cause !== null ? cause : undefined;
}

// The refusal a thrown error is, where it is one of the database's to tell; undefined for
// anything else, which stays the server's failure.
export function databaseRefusalOf(thrown: unknown): DatabaseRefusal | undefined {
  if (typeof thrown !== 'object' || thrown === null) return undefined;
  const { name, code } = thrown as { name?: unknown; code?: unknown };
  if (name !== 'PrismaClientKnownRequestError') return undefined;
  // A record a call needed, by its id, that isn't there: nothing was written.
  if (code === 'P2025') return notFound;
  const cause = causeOf(thrown);
  const sqlState = cause?.originalCode;
  if (typeof sqlState !== 'string') return undefined;
  const kind = kinds[sqlState];
  if (kind === undefined) return undefined;
  const constraint = constraintOf(cause);
  return {
    ...kind,
    said: (constraint === undefined ? undefined : words[constraint]) ?? kind.said,
    sqlState,
    ...(constraint === undefined ? {} : { constraint }),
  };
}

function constraintOf(cause: DriverCause | undefined): string | undefined {
  const named = cause?.constraint?.index;
  if (typeof named === 'string') return named;
  const message = cause?.originalMessage;
  return typeof message === 'string' ? /constraint "(\w+)"/.exec(message)?.[1] : undefined;
}
