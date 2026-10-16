// What the database's own constraints refused, told plainly (ARCHITECTURE §5, §6, Output;
// AC-01-80; AC-10-33, 38; T-26; BACKLOG C60; ADR-097, 424). The database enforces the rules
// itself, so a request may be refused there and nowhere before: a second place for one contractor
// on a project, a time zone that isn't an IANA name, a record the request names that isn't on
// record. That is the caller's to hear, in plain words, and never an internal error.
//
// What is told is a plain code, and plain words where this file has them for the constraint; the
// constraint's own name, the table and the statement stay inside the server (the log says the
// constraint, by its name). **What is the server's own failure stays one:** a write the login has
// no grant for, a delete refused. A statement stopped by its time limit is no refusal either: the
// database was busy, and the caller is told to wait (database-busy.ts; ADR-524).
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
  // Enrolment (task 2.5.1): one key, one phone (AC-02-16).
  device_public_key_key: 'Not enrolled: a phone is already enrolled with that key.',
  assignment_origin_check:
    'Not saved: an assignment written on the board says who wrote it; one made on a phone has no author and always its phone.',
  assignment_system_actor_check:
    'Not saved: an assignment is for a person and written by a person.',
  // A closed project changes no more (ADR-529 (b)): the database's own guard, on every record.
  project_closed: 'Not saved: the project is closed, and nothing in it changes.',
  assignment_withdrawal_note_check:
    'Not saved: a withdrawal’s note is a withdrawn assignment’s, 500 characters at most.',
  // A person's employer and its ID for them (AC-02-03; ADR-527 (12)).
  user_employer_number_check:
    'Not saved: an employer’s ID for a person is kept only beside their employer.',
  user_employer_id_fkey: 'Not saved: a person’s employer is one of the firm’s contractors.',
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
  flag_acceptance_accepted_once: 'Not saved: the flag is already accepted.',
  invoice_lock_load_locked_once: 'Not saved: the ticket is already locked as invoiced.',
  invoice_lock_haul_out_locked_once: 'Not saved: the ticket is already locked as invoiced.',
  invoice_lock_unit_rate_ticket_locked_once: 'Not saved: the ticket is already locked as invoiced.',
  invoice_batch_project_id_fkey: 'Not saved: the project an invoice batch is for isn’t on record.',
  // Corrections to a ticket's own records (task 2.4.4, part 2): what each kind of field event
  // records is the database's to hold (ADR-325), so a correction may be refused here alone.
  field_event_load_call_check:
    'Not saved: only a disposal and a haul-out collection have a load call, a whole number from 0 to 100.',
  field_event_scale_receipt_check:
    'Not saved: only a disposal and a haul-out disposal point at a scale receipt.',
  field_event_estimate_check:
    'Not saved: a split load’s collection has its suffix and its estimate together, and no other field event has an estimate.',
  field_event_number_typed_check:
    'Not saved: a reason for a typed number belongs only on a number that was typed.',
  field_event_typed_capacity_check:
    'Not saved: a typed capacity belongs only on a truck keyed in by hand.',
  field_event_address_check:
    'Not saved: an address says whether it was looked up or typed, and only an address does.',
  field_event_debris_type_check:
    'Not saved: the debris type isn’t one of the form for this kind of ticket.',
  field_event_field_tag_check:
    'Not saved: only a collection, a haul-out collection and unit rate work take a field tag.',
  field_event_roe_number_check:
    'Not saved: only a collection and unit rate work carry an ROE number.',
  field_event_carried_count_check:
    'Not saved: only a disposal has a count of the tickets its load carries.',
  field_event_unit_rate_check:
    'Not saved: only unit rate work records a kind of work, a payable type, a pay item, a count, a measurement, a root ball, a survey number or "marked ineligible".',
  field_event_measurement_check:
    'Not saved: a measurement says whether it was read as a circumference or a diameter, and only a measurement does.',
  field_event_monitor_check: 'Not saved: a field event’s monitor is a person.',
  field_event_item_kind_check: 'Not saved: only unit rate work has item lines.',
  carried_ticket_kind_check: 'Not saved: only a load’s collection lists the tickets it carries.',
  // An ROE and the forms corrected, a quarantined record resolved, a field event created in the
  // back office (task 2.4.4, part 3).
  field_event_kind_in_workflow_check:
    'Not saved: a collection and a disposal are a load’s, a haul-out collection and a haul-out disposal a haul-out’s, and a unit rate event unit rate work’s.',
  field_event_split_suffix_check:
    'Not saved: only a collection and a haul-out collection take a split’s suffix, in capital letters.',
  field_event_project_id_fkey: 'Not saved: the project a field event is for isn’t on record.',
  field_event_monitor_id_fkey: 'Not saved: the monitor a field event names isn’t on record.',
  field_event_project_id_site_id_fkey:
    'Not saved: a field event’s site is one of its own project’s sites.',
  field_event_item_item_name_id_fkey: 'Not saved: an item line names an item on the firm’s list.',
  // A certification's measured boxes (task 2.4.4, part 4).
  certification_box_measurements_check:
    'Not saved: a box holds the measurements of its own shape and no other, each a whole number of inches of 1 or more.',
  roe_project_id_roe_number_key: 'Not saved: the project already has an ROE with that number.',
  roe_scope_item_pick_check:
    'Not saved: an ROE’s scope takes a debris type of the project’s load form, or a payable type.',
  roe_scope_item_project_id_form_id_form_document_type_fkey:
    'Not saved: a debris type in an ROE’s scope is one on its own project’s load form.',
  roe_scope_item_payable_type_id_fkey:
    'Not saved: the payable type an ROE’s scope names isn’t on the firm’s list.',
  survey_work_type_id_fkey: 'Not saved: a survey’s work type is one on the firm’s list.',
  incident_incident_type_id_fkey: 'Not saved: an incident’s type is one on the firm’s list.',
  incident_incident_sub_type_id_fkey:
    'Not saved: an incident’s sub-type is one on the firm’s list.',
  incident_project_id_contractor_id_fkey:
    'Not saved: the contractor an incident names is one on its own project.',
  drop_off_log_project_id_site_id_fkey:
    'Not saved: a drop-off log’s site is one of its own project’s sites.',
  // Every captured field correctable, and records made in the back office (task 2.8.7): the
  // services ask what they can first; these are what only the database answers.
  certification_project_id_cert_number_key:
    'Not saved: the project already has a certification with that number.',
  certification_project_id_prime_id_fkey:
    'Not saved: a certification’s prime is one of its own project’s primes.',
  certification_prime_id_fkey: 'Not saved: the prime a certification names isn’t on record.',
  certification_vehicle_type_check:
    'Not saved: what was certified is picked from the firm’s list or typed, never both.',
  certification_vehicle_type_id_fkey:
    'Not saved: the vehicle type a certification names isn’t on the firm’s list.',
  certification_crew_type_id_fkey:
    'Not saved: the crew type a certification names isn’t on the firm’s list.',
  certification_kind_check:
    'Not saved: a container has a capacity and no crew type; a crew has no capacity.',
  certification_subs_check:
    'Not saved: a second-tier sub works under a first-tier sub, and one contractor is in one tier.',
  certification_certified_by_id_fkey: 'Not saved: the monitor who certified it isn’t on record.',
  certification_created_reason_id_fkey: 'Not saved: the reason picked isn’t on the firm’s list.',
  certification_project_id_replaces_id_fkey:
    'Not saved: a certification replaces one of its own project’s.',
  certification_project_id_replaces_id_key:
    'Not saved: that certification is already replaced by another.',
  certification_helper_user_id_fkey: 'Not saved: a helper picked isn’t on record.',
  certification_box_primary_check:
    'Not saved: box 0 is the primary, the main interior: a rectangle that adds, never taken off.',
  certification_box_feature_check:
    'Not saved: every box after the primary is a feature, picked from the firm’s list or typed, never both.',
  certification_box_feature_id_fkey: 'Not saved: the feature a box names isn’t on the firm’s list.',
  certification_box_radius_corner_check: 'Not saved: a radius corner is always subtracted.',
  roe_answers_check:
    'Not saved: answers to a form’s own fields come with the version of the ROE form they answer.',
  survey_monitor_id_fkey: 'Not saved: the monitor a survey names isn’t on record.',
  incident_monitor_id_fkey: 'Not saved: the monitor an incident names isn’t on record.',
  drop_off_log_monitor_id_fkey: 'Not saved: the monitor a drop-off log names isn’t on record.',
  survey_created_reason_id_fkey: 'Not saved: the reason picked isn’t on the firm’s list.',
  incident_created_reason_id_fkey: 'Not saved: the reason picked isn’t on the firm’s list.',
  drop_off_log_created_reason_id_fkey: 'Not saved: the reason picked isn’t on the firm’s list.',
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

// The closed project's guard (ADR-529 (b)) is a trigger, which the driver hands on with no
// constraint's name: it is known by its own words, which never leave the server, as the last
// admin's guard is (people.ts).
const closedProjectGuard = [
  'The project is closed: nothing in it',
  'A closed project changes no more',
];

function constraintOf(cause: DriverCause | undefined): string | undefined {
  const named = cause?.constraint?.index;
  if (typeof named === 'string') return named;
  const message = cause?.originalMessage;
  if (typeof message !== 'string') return undefined;
  if (closedProjectGuard.some((words) => message.startsWith(words))) return 'project_closed';
  return /constraint "(\w+)"/.exec(message)?.[1];
}
