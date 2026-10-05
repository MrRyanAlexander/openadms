// The setup tables a client user or an auditor sees, and how each is told to be theirs
// (ADR-315; the viewers' guard migration, `guard_viewer`), for the tests that hold every one of
// them to the same policies, views and grants. A field event's item lines and carried tickets are
// here too, seen with the field event they belong to (ADR-325), and scale receipts and
// photographs, seen with their project (ADR-326), and ROEs, their scope lines, surveys, incidents
// and drop-off logs, seen with theirs (ADR-327); the field event itself is one of
// the row-level security guard's four tables, held by name in the tests. The completed load was
// one of those four until it took `guard_viewer`'s line with the other derived records (ADR-340).
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
}

const ownProject = '(viewer_sees_project(project_id) AND viewer_sees_every_ticket())';
const exists = (relation: string, where: string): string =>
  `(EXISTS ( SELECT 1\n   FROM ${relation}\n  WHERE (${where})))`;

const project = (hidden: string[] = [], citizen: string[] = []): Sight => ({
  sight: 'PROJECT',
  seen: ownProject,
  hidden,
  citizen,
});
const partOf = (table: string, parent: string, link: string): Sight => ({
  sight: 'PART_OF',
  seen: exists(parent, `${parent}.id = ${table}.${link}`),
  hidden: [],
  citizen: [],
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
});

const contact = ['contact_name', 'contact_email', 'contact_phone'];

export const viewerSights: Record<string, Sight> = {
  project_kind_of_work: project(),
  // A project's number series and its control ranges are its setup (ADR-323).
  project_number_series: project(),
  control_range: project(),
  project_contractor: project(),
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
  site_area_version: partOf('site_area_version', 'disposal_site', 'site_id'),
  map_version: project(['uploaded_file_key']),
  zone: partOf('zone', 'map_version', 'map_version_id'),
  rule: project(),
  rule_criterion: project(),
  rule_criterion_pick: project(),
  rule_action: project(),
  rule_action_item: partOf('rule_action_item', 'rule_action', 'action_id'),
  // A certification, without its driver's phone or licence number (ADR-169, 321).
  certification: project(['driver_phone', 'driver_licence_number']),
  certification_box: partOf('certification_box', 'certification', 'certification_id'),
  certification_helper: partOf('certification_helper', 'certification', 'certification_id'),
  field_event_item: partOf('field_event_item', 'field_event', 'field_event_id'),
  carried_ticket: partOf('carried_ticket', 'field_event', 'field_event_id'),
  // A project's scale receipts; and its photographs' records, without where the files are kept
  // (ADR-326).
  scale_receipt: project(),
  photo: project(['object_key', 'depth_object_key']),
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
  // What the worker concluded for their project: its completed loads and haul-outs, each with
  // its collection rows, and its flags (ADR-340).
  completed_load: project(),
  completed_load_collection: project(),
  completed_haul_out: project(),
  completed_haul_out_collection: project(),
  flag: project(),
  client: namedBy('client', 'viewer_project_setup', 'client_id', [...contact, 'notes']),
  declaration_event: namedBy('declaration_event', 'viewer_project_setup', 'declaration_event_id'),
  contractor: namedBy('contractor', 'project_contractor', 'contractor_id', contact),
  ...Object.fromEntries(
    listTables
      .filter((table) => table !== 'field_tag')
      .map((table): [string, Sight] => [
        table,
        { sight: 'FIRM', seen: 'viewer_sees_every_ticket()', hidden: [], citizen: [] },
      ]),
  ),
};

export const viewedTables = Object.keys(viewerSights);

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
  'number_block',
  'assignment',
  'assignment_pay_item',
  'invoice_lock',
  // A run of the worker and what it decided for each ticket are the back office's (ADR-340).
  'reconciliation_run',
  'reconciliation_decision',
  'audit_record',
];
