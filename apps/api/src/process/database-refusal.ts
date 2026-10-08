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
  // Setup, steps 5, 6 and 8: forms, pay items, rules (task 2.4.2, part 2).
  form_project_id_document_type_key:
    'Not saved: the project already has a form for that document type.',
  form_gps_required_check: 'Not saved: "GPS required" is stated on an ROE form, and on no other.',
  form_incident_offers_check:
    'Not saved: what an incident offers is stated on an incident form, and on no other.',
  form_debris_type_form_id_debris_type_id_key:
    'Not saved: that debris type is already on the form.',
  form_debris_type_document_type_check:
    'Not saved: a debris type goes on a load or a haul-out form.',
  form_definition_document_type_check:
    'Not saved: only an ROE, survey, incident or drop-off log form takes the firm’s own fields.',
  pay_item_project_id_code_key: 'Not saved: the project already has a pay item with that code.',
  pay_item_crew_time_conversion_check:
    'Not saved: a pay item by the hour converts crew time per hour, one by the crew day per day, and no other pay item has a conversion.',
  pay_item_crew_day_hours_check:
    'Not saved: a crew day by exact division states its day length, over 0 and up to 24 hours; no other pay item states one.',
  pay_item_rate_pay_item_id_prime_id_key:
    'Not saved: that prime already has a rate on the pay item.',
  pay_item_rate_project_id_prime_id_fkey: 'Not saved: a rate is for one of the project’s primes.',
  rule_document_type_check: 'Not saved: a rule goes on a load, haul-out or unit rate form.',
  rule_project_id_contract_id_fkey: 'Not saved: a rule names one of the project’s contracts.',
  rule_criterion_operator_check:
    'Not saved: a criterion has an operator its kind of value doesn’t take.',
  rule_criterion_value_check:
    'Not saved: a criterion’s value isn’t the kind it takes: a number, a date or text; both ends on a BETWEEN, the lower first; none on IS EMPTY.',
  rule_criterion_pick_value_check:
    'Not saved: a criterion that takes no picked value was given one.',
  rule_criterion_pick_form_id_form_debris_type_id_fkey:
    'Not saved: a debris type a rule picks is one on the rule’s form.',
  rule_action_pay_item_check: 'Not saved: only an Add transaction names a pay item.',
  rule_action_slot_check: 'Not saved: a Void ticket takes no transaction #.',
  rule_action_project_id_pay_item_id_fkey:
    'Not saved: an Add transaction names one of the project’s pay items.',
  // Setup, steps 3, 4 and 7: the merge, sites and the map (task 2.4.2, part 3).
  disposal_site_dates_check: 'Not saved: the site closes before it is activated.',
  disposal_site_coordinates_check:
    'Not saved: a latitude is from -90 to 90 and a longitude from -180 to 180.',
  disposal_site_haul_outs_check:
    'Not saved: "Haul-outs leave here" is ticked only on a TDSR/DMS site.',
  disposal_site_tipping_fee_site_id_pay_item_id_key:
    'Not saved: the site is already linked to that pay item.',
  disposal_site_tipping_fee_project_id_pay_item_id_fkey:
    'Not saved: a site’s tipping fee pay item is one of its own project’s pay items.',
  zone_map_version_id_name_key: 'Not loaded: two zones of the map have the same name.',
  map_version_boundary_check: 'Not loaded: the boundary isn’t a shape.',
  zone_geometry_check: 'Not loaded: a zone isn’t a shape.',
  site_area_version_geometry_check: 'Not saved: that isn’t a shape.',
  // Dispatch: a day's assignments (task 2.4.3, part 2).
  assignment_project_id_site_id_fkey:
    'Not saved: an assignment’s site is one of its own project’s sites.',
  assignment_person_id_fkey: 'Not saved: the person an assignment is for isn’t on record.',
  assignment_device_id_fkey: 'Not saved: the phone an assignment names isn’t on record.',
  assignment_origin_check:
    'Not saved: an assignment written on the board says who wrote it; one made on a phone has no author and always its phone.',
  assignment_system_actor_check:
    'Not saved: an assignment is for a person and written by a person.',
  assignment_form_document_types_check:
    'Not saved: the forms an assignment names are an ROE, a survey, an incident or a drop-off log.',
  assignment_pay_item_assignment_id_pay_item_id_key:
    'Not saved: that pay item is already named on the assignment.',
  assignment_pay_item_project_id_assignment_id_fkey:
    'Not saved: an assignment names the unit rate pay items of its own project.',
  assignment_pay_item_project_id_pay_item_id_kind_of_work_id_fkey:
    'Not saved: an assignment names the unit rate pay items of its own project.',
  // Review's marks (task 2.4.4, part 1). The service asks each of these first: the database
  // answers only where two people act at the same moment, or the project isn't on record.
  ticket_void_voided_once: 'Not saved: the ticket is already void.',
  flag_acceptance_flag_id_key: 'Not saved: the flag is already accepted.',
  invoice_lock_load_locked_once: 'Not saved: the ticket is already locked as invoiced.',
  invoice_lock_haul_out_locked_once: 'Not saved: the ticket is already locked as invoiced.',
  invoice_lock_unit_rate_ticket_locked_once: 'Not saved: the ticket is already locked as invoiced.',
  invoice_batch_project_id_fkey: 'Not saved: the project an invoice batch is for isn’t on record.',
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
