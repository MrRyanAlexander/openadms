// The setup tables a client user or an auditor sees, and how each is told to be theirs
// (ADR-315; the viewers' guard migration, `guard_viewer`), for the tests that hold every one of
// them to the same policies, views and grants. A field event's item lines and carried tickets are
// here too, seen with the field event they belong to (ADR-325), and scale receipts and
// photographs, seen with their project (ADR-326), and ROEs, their scope lines, surveys, incidents
// and drop-off logs, seen with theirs (ADR-327); the field event itself is one of
// the row-level security guard's four tables, held by name in the tests. The completed load was
// one of those four until it took `guard_viewer`'s line with the other derived records (ADR-340).
// A contractor user sees the rows of a table that are its own (`own`: whose work a ticket is, told
// by the certification, ADR-361), and nothing of the others.
import { listTables } from './lists.ts';

export interface Sight {
  // PROJECT: a row of one of their projects. PART_OF: a row whose parent they see. NAMED_BY: a
  // firm-wide row something they see names. FIRM: a firm-wide list, every row.
  sight: 'PROJECT' | 'PART_OF' | 'NAMED_BY' | 'FIRM';
  // The policy's question, as the catalog words it.
  seen: string;
  // Columns no viewer reads.
  hidden: string[];
  // Columns that name a private citizen: left out of the view and the grant too, and shown by
  // viewer_<table>_citizen to a viewer the firm lets see private citizens (ADR-328, 336).
  citizen: string[];
  // Whether a contractor user sees the rows that are its own contractor's (ADR-361).
  own: boolean;
}

const ownProject = '(viewer_sees_project(project_id) AND viewer_sees_every_ticket())';
const exists = (relation: string, where: string): string =>
  `(EXISTS ( SELECT 1\n   FROM ${relation}\n  WHERE (${where})))`;

const project = (hidden: string[] = [], citizen: string[] = []): Sight => ({
  sight: 'PROJECT',
  seen: ownProject,
  hidden,
  citizen,
  own: false,
});
// A table of which a contractor user sees its own rows: `own` is the question that says a row
// is, as the catalog words it (ADR-361).
const projectOrOwn = (own: string, hidden: string[] = []): Sight => ({
  sight: 'PROJECT',
  seen: `(viewer_sees_project(project_id) AND (viewer_sees_every_ticket() OR ${own}))`,
  hidden,
  citizen: [],
  own: true,
});
// The row is the field event a contractor user sees (its certification names its contractor).
const itsFieldEvent = (table: string, link: string): string =>
  exists('field_event', `field_event.id = ${table}.${link}`);
const partOf = (table: string, parent: string, link: string, hidden: string[] = []): Sight => ({
  sight: 'PART_OF',
  seen: exists(parent, `${parent}.id = ${table}.${link}`),
  hidden,
  citizen: [],
  own: false,
});
const namedBy = (
  table: string,
  relation: string,
  column: string,
  hidden: string[] = [],
): Sight => ({
  sight: 'NAMED_BY',
  seen: exists(relation, `${relation}.${column} = ${table}.id`),
  hidden,
  citizen: [],
  own: false,
});

const contact = ['contact_name', 'contact_email', 'contact_phone'];

export const viewerSights: Record<string, Sight> = {
  project_kind_of_work: project(),
  // A project's number series and its control ranges are its setup (ADR-323).
  project_number_series: project(),
  control_range: project(),
  // A contractor user: its own place on the project and, a prime, its subs' (ADR-361).
  project_contractor: projectOrOwn(
    '(viewer_is_contractor(contractor_id) OR viewer_is_contractor(prime_id))',
  ),
  contract: project(),
  form: project(),
  form_debris_type: partOf('form_debris_type', 'form', 'form_id'),
  form_definition: partOf('form_definition', 'form', 'form_id'),
  field_tag: project(),
  pay_item: project(),
  pay_item_rate: project(),
  pay_item_crew_day_step: partOf('pay_item_crew_day_step', 'pay_item', 'pay_item_id'),
  disposal_site: project(),
  disposal_site_label: partOf('disposal_site_label', 'disposal_site', 'site_id'),
  disposal_site_tipping_fee: project(),
  site_area_version: partOf('site_area_version', 'disposal_site', 'site_id', ['uploaded_file_key']),
  map_version: project(['uploaded_file_key', 'zones_file_key']),
  zone: partOf('zone', 'map_version', 'map_version_id'),
  rule: project(),
  rule_criterion: project(),
  rule_criterion_pick: project(),
  rule_action: project(),
  rule_action_item: partOf('rule_action_item', 'rule_action', 'action_id'),
  // A certification, without its driver's phone or licence number (ADR-169, 321).
  // A contractor user: the certifications that name its contractor, as the prime or as either
  // tier of sub; whose work a ticket is hangs on this one question (ADR-361).
  certification: projectOrOwn(
    '(viewer_is_contractor(prime_id) OR viewer_is_contractor(first_tier_sub_id) OR viewer_is_contractor(second_tier_sub_id))',
    ['driver_phone', 'driver_licence_number'],
  ),
  certification_box: partOf('certification_box', 'certification', 'certification_id'),
  certification_helper: partOf('certification_helper', 'certification', 'certification_id'),
  field_event_item: partOf('field_event_item', 'field_event', 'field_event_id'),
  carried_ticket: partOf('carried_ticket', 'field_event', 'field_event_id'),
  field_event_waypoint: partOf('field_event_waypoint', 'field_event', 'field_event_id'),
  // A project's scale receipts; and its photographs' records, without where the files are kept
  // (ADR-326).
  // A contractor user: a receipt one of its field events points at, and the photographs of its
  // field events, its certifications and those receipts (ADR-361).
  scale_receipt: projectOrOwn(
    exists('field_event', 'field_event.scale_receipt_id = scale_receipt.id'),
  ),
  photo: projectOrOwn(
    `(${[
      itsFieldEvent('photo', 'field_event_id'),
      exists('certification', 'certification.id = photo.certification_id'),
      exists('scale_receipt', 'scale_receipt.id = photo.scale_receipt_id'),
    ].join(' OR ')})`,
    ['object_key', 'depth_object_key'],
  ),
  // A project's ROEs with what each allows, and its forms: surveys, incidents, drop-off logs
  // (ADR-327). An ROE's owner, and a drop-off log's resident and where their debris came from,
  // are a private citizen's (ADR-336).
  roe: project([], ['owner_name']),
  roe_scope_item: project(),
  survey: project(),
  incident: project(),
  drop_off_log: project([], ['resident_name', 'origin_address']),
  // That a record of their project waits in quarantine, why and what holds its number; the
  // record as sent may name a private citizen, an ROE's owner (ADR-338).
  quarantined_record: project([], ['payload']),
  // That a record of their project could not be saved and is held for a person, and why; what
  // was sent may name a private citizen (ADR-468 (5), 471).
  // Its size, what a phone's daily budget counts, is the API's alone (ADR-546).
  held_record: project(['sent_bytes'], ['payload']),
  // What the worker concluded for their project: its completed loads and haul-outs, each with
  // its collection rows, and its flags (ADR-340).
  // A contractor user: a completed record with its disposal event, a property's or a pile's row
  // with its collection event; no flag (ADR-361).
  completed_load: projectOrOwn(itsFieldEvent('completed_load', 'disposal_event_id')),
  completed_load_collection: projectOrOwn(
    itsFieldEvent('completed_load_collection', 'collection_event_id'),
  ),
  completed_haul_out: projectOrOwn(itsFieldEvent('completed_haul_out', 'disposal_event_id')),
  completed_haul_out_collection: projectOrOwn(
    itsFieldEvent('completed_haul_out_collection', 'collection_event_id'),
  ),
  flag: project(),
  // People's marks on their projects' records: the QC status, a flag's acceptance, a void, a lock
  // as invoiced without its unlock's note, and its batch (ADR-363).
  // A contractor user: a lock on a completed record or a unit rate ticket it sees, and a batch
  // that holds one of those, by whose name it pulls its report (ADR-228); no other mark.
  qc_mark: project(),
  invoice_lock: projectOrOwn(
    `(${[
      exists('completed_load', 'completed_load.id = invoice_lock.completed_load_id'),
      exists('completed_haul_out', 'completed_haul_out.id = invoice_lock.completed_haul_out_id'),
      itsFieldEvent('invoice_lock', 'field_event_id'),
    ].join(' OR ')})`,
    ['unlock_note'],
  ),
  invoice_batch: projectOrOwn(
    exists('invoice_lock', 'invoice_lock.invoice_batch_id = invoice_batch.id'),
  ),
  flag_acceptance: project(),
  ticket_void: project(),
  ticket_unvoid: project(),
  client: namedBy('client', 'viewer_project_setup', 'client_id', [...contact, 'notes']),
  declaration_event: namedBy('declaration_event', 'viewer_project_setup', 'declaration_event_id'),
  contractor: namedBy('contractor', 'project_contractor', 'contractor_id', contact),
  ...Object.fromEntries(
    listTables
      .filter((table) => table !== 'field_tag')
      .map((table): [string, Sight] => [
        table,
        {
          sight: 'FIRM',
          seen: 'viewer_sees_every_ticket()',
          hidden: [],
          citizen: [],
          own: false,
        },
      ]),
  ),
};

export const viewedTables = Object.keys(viewerSights);

// A field event's policy, held by name in the tests: a client user and an auditor see their
// projects' field events, a contractor user the ones whose certification it sees (ADR-361).
export const fieldEventSeen = projectOrOwn(
  exists('certification', 'certification.id = field_event.certification_id'),
).seen;

// The views that run with the owner's rights and hold the viewer's questions themselves, beside
// the citizen views: a line's rate and amount, for a client user, an auditor and the line's own
// prime's contractor user; and the three names of setup every viewer of a project reads
// (ADR-361).
export const moneyView = 'viewer_transaction_money';
export const nameViews = [
  'viewer_debris_type_name',
  'viewer_disposal_site_name',
  'viewer_pay_item_name',
];

// The views that show a private citizen's columns, one for each table that has any.
export const citizenViews = Object.entries(viewerSights)
  .filter(([, sight]) => sight.citizen.length > 0)
  .map(([table]) => `viewer_${table}_citizen`);

// The tables no read-only viewer reads at all: no view, no grant (ADR-281, 286, 315).
export const unseenTables = [
  'user',
  'user_permission',
  'user_viewer_project',
  'device',
  'master_passcode',
  // Sign-in's records are the API's alone (ADR-397…399).
  'user_credential',
  'session',
  'security_event',
  'master_passcode_tries',
  'number_block',
  'assignment',
  'assignment_pay_item',
  // A run of the worker and what it decided for each ticket are the back office's (ADR-340).
  'reconciliation_run',
  'reconciliation_decision',
  // The job queue is the API's and the worker's (ADR-418).
  'reconciliation_job',
  'reconciliation_job_ticket',
  // A setup version is the back office's to read (ADR-453).
  'setup_manifest',
  // A sync and the idempotency ledger are the API's and the worker's (ADR-471).
  'sync',
  'synced_record',
  // A file set aside is the API's, for the back office (ADR-482).
  'set_aside_file',
  'audit_record',
];
