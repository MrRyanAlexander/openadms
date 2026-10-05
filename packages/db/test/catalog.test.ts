// The guards as the catalog holds them (ADR-270, 271): every trigger, check, policy and viewer
// view, exactly. A guard dropped, disabled, made conditional or loosened fails here even where no
// behaviour test happens to reach it; the other files show each one working.
import { describe, expect, it } from 'vitest';

import { eachTestRolledBack } from './support/lifecycle.ts';
import { listTables } from './support/lists.ts';
import { citizenViews, viewedTables, viewerSights } from './support/viewers.ts';

const tested = eachTestRolledBack();

// Each guarded table and its audit domain (ADR-270 (4)).
const domains: Record<string, string> = {
  project: 'OPERATIONS',
  // Who is paying, what happened, a project's kinds of unit rate work (ADR-303).
  client: 'OPERATIONS',
  declaration_event: 'OPERATIONS',
  project_kind_of_work: 'OPERATIONS',
  contractor: 'OPERATIONS',
  // A contractor's place on a project; and a contract, which a pricing rule names (ADR-305).
  project_contractor: 'OPERATIONS',
  contract: 'BILLING',
  // A project's forms, the debris types on them, and the firm's own fields (ADR-308).
  form: 'OPERATIONS',
  form_debris_type: 'OPERATIONS',
  form_definition: 'OPERATIONS',
  user: 'SECURITY',
  // Who may do what, and who may see which project: the security reviewer's to read (ADR-315).
  user_permission: 'SECURITY',
  user_viewer_project: 'SECURITY',
  device: 'SECURITY',
  disposal_site: 'OPERATIONS',
  // A site's labels and own shape, and the project map; a site's tipping fee pay item tells a fee
  // line, so its link is the billing reviewer's to read (ADR-311).
  disposal_site_label: 'OPERATIONS',
  disposal_site_tipping_fee: 'BILLING',
  site_area_version: 'OPERATIONS',
  map_version: 'OPERATIONS',
  zone: 'OPERATIONS',
  number_block: 'OPERATIONS',
  // A project's number series and its control ranges (ADR-323).
  project_number_series: 'OPERATIONS',
  control_range: 'OPERATIONS',
  assignment: 'OPERATIONS',
  // Where a rate will live: its changes are the billing reviewer's to read (ADR-286).
  pay_item: 'BILLING',
  // A pay item's rate for each prime, and a crew day's steps: where a rate and its quantity live
  // (ADR-309).
  pay_item_rate: 'BILLING',
  pay_item_crew_day_step: 'BILLING',
  assignment_pay_item: 'OPERATIONS',
  // A rule decides what a ticket bills: its changes, line by line, are the billing reviewer's to
  // read (ADR-313).
  rule: 'BILLING',
  rule_criterion: 'BILLING',
  rule_criterion_pick: 'BILLING',
  rule_action: 'BILLING',
  rule_action_item: 'BILLING',
  // A container's capacity is what every load on it bills by: a certification and its measured
  // boxes are the billing reviewer's to read; who helped measure is operations (ADR-321).
  certification: 'BILLING',
  certification_box: 'BILLING',
  certification_helper: 'OPERATIONS',
  // An ROE and what it allows, a survey, an incident and a drop-off log: records beside the
  // field event (ADR-327).
  roe: 'RECORDS',
  roe_scope_item: 'RECORDS',
  survey: 'RECORDS',
  incident: 'RECORDS',
  drop_off_log: 'RECORDS',
  master_passcode: 'SECURITY',
  field_event: 'RECORDS',
  // An itemised unit rate event's lines and the tickets a load carries: the field event's own
  // domain (ADR-325).
  field_event_item: 'RECORDS',
  carried_ticket: 'RECORDS',
  // A scale receipt and a photograph's record: evidence beside the field event (ADR-326).
  scale_receipt: 'RECORDS',
  photo: 'RECORDS',
  completed_load: 'BILLING',
  transaction: 'BILLING',
  invoice_lock: 'BILLING',
  // The firm's lists: none holds a rate, a login or a ticket (ADR-302).
  ...Object.fromEntries(listTables.map((table) => [table, 'OPERATIONS'])),
};

// The columns an audit trigger names so the capture leaves them out of the audit log (ADR-281).
const keptOut: Record<string, string[]> = { master_passcode: ['hash'] };

const on = (table: string): string => (table === 'user' ? 'public."user"' : `public.${table}`);
const capture = (table: string, domain: string): string =>
  [domain, ...(keptOut[table] ?? [])].map((argument) => `'${argument}'`).join(', ');

const triggers = [
  ...Object.entries(domains).flatMap(([table, domain]) => [
    `CREATE TRIGGER ${table}_audit AFTER INSERT OR UPDATE ON ${on(table)} FOR EACH ROW EXECUTE FUNCTION audit_capture(${capture(table, domain)})`,
    table === 'transaction'
      ? `CREATE TRIGGER transaction_delete_to_audit BEFORE DELETE ON public.transaction FOR EACH ROW EXECUTE FUNCTION transaction_delete_to_audit()`
      : `CREATE TRIGGER ${table}_refuse_delete BEFORE DELETE ON ${on(table)} FOR EACH ROW EXECUTE FUNCTION refuse_delete()`,
    `CREATE TRIGGER ${table}_refuse_truncate BEFORE TRUNCATE ON ${on(table)} FOR EACH STATEMENT EXECUTE FUNCTION refuse_delete()`,
  ]),
  `CREATE TRIGGER audit_record_refuse_change BEFORE DELETE OR UPDATE ON public.audit_record FOR EACH ROW EXECUTE FUNCTION refuse_audit_change()`,
  `CREATE TRIGGER audit_record_refuse_truncate BEFORE TRUNCATE ON public.audit_record FOR EACH STATEMENT EXECUTE FUNCTION refuse_audit_change()`,
  // A definition's version is never edited (ADR-308).
  `CREATE TRIGGER form_definition_refuse_edit BEFORE UPDATE ON public.form_definition FOR EACH ROW EXECUTE FUNCTION refuse_edit()`,
  // Nor is a site's own shape, a map version or a zone; and a zone is written with its version
  // (ADR-311).
  ...['site_area_version', 'map_version', 'zone'].map(
    (table) =>
      `CREATE TRIGGER ${table}_refuse_edit BEFORE UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION refuse_edit()`,
  ),
  // A photograph's fingerprints and places in storage are written once (ADR-326).
  `CREATE TRIGGER photo_refuse_file_edit BEFORE UPDATE OF original_sha256, uploaded_sha256, object_key, depth_object_key ON public.photo FOR EACH ROW EXECUTE FUNCTION refuse_edit()`,
  `CREATE TRIGGER zone_with_its_map_version BEFORE INSERT ON public.zone FOR EACH ROW EXECUTE FUNCTION zone_with_its_map_version()`,
  // A container has its primary box, asked when the piece of work that wrote it ends (ADR-321).
  `CREATE CONSTRAINT TRIGGER certification_has_primary_box AFTER INSERT OR UPDATE OF kind ON public.certification DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION certification_has_primary_box()`,
  `CREATE CONSTRAINT TRIGGER certification_box_keeps_primary AFTER UPDATE OF certification_id, "position" ON public.certification_box DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION certification_has_primary_box()`,
  // The system actor's row (ADR-276).
  `CREATE TRIGGER user_system_actor BEFORE INSERT OR UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION user_system_actor_guard()`,
  // Only a release writes a list value's key (ADR-302).
  ...listTables.map(
    (table) =>
      `CREATE TRIGGER ${table}_built_in_key BEFORE INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION list_built_in_key_guard()`,
  ),
].sort();

// A built-in value, one with a key, is never archived: the same check on every list (ADR-302).
const listChecks = listTables.map((table) => ({
  name: `${table}_built_in_never_archived_check`,
  definition: 'CHECK (((key IS NULL) OR (archived_at IS NULL)))',
}));

const viewerQual = '(viewer_sees_project(project_id) AND viewer_sees_every_ticket())';
// The four tables of the row-level security guard (ADR-270), and every setup table a client user
// or an auditor sees (ADR-315).
const secured = ['completed_load', 'field_event', 'project', 'transaction', ...viewedTables].sort();
const policies = [
  ...secured.map(
    (table) => `${table}_services PERMISSIVE {adms_api,adms_worker} ALL USING true CHECK true`,
  ),
  ...Object.entries(viewerSights).map(
    ([table, { seen }]) => `${table}_viewer PERMISSIVE {adms_readonly} SELECT USING ${seen}`,
  ),
  `completed_load_viewer PERMISSIVE {adms_readonly} SELECT USING ${viewerQual}`,
  `field_event_viewer PERMISSIVE {adms_readonly} SELECT USING ${viewerQual}`,
  'project_viewer PERMISSIVE {adms_readonly} SELECT USING viewer_sees_project(id)',
  'transaction_viewer PERMISSIVE {adms_readonly} SELECT USING (viewer_sees_load_project(completed_load_id) AND (viewer_sees_every_ticket() OR viewer_is_contractor(prime_id)))',
].sort();

// A shape on a map, and its bounding box, are checked alike wherever one is kept (ADR-311).
const shapeCheck = (column: string): string =>
  `CHECK ((((jsonb_typeof(${column}) = 'object'::text) AND ((${column} ->> 'type'::text) = ANY (ARRAY['Polygon'::text, 'MultiPolygon'::text])) AND (jsonb_typeof((${column} -> 'coordinates'::text)) = 'array'::text)) IS TRUE))`;
const boundingBoxCheck =
  "CHECK ((((west_longitude >= ('-180'::integer)::numeric) AND (west_longitude <= (180)::numeric)) AND ((east_longitude >= ('-180'::integer)::numeric) AND (east_longitude <= (180)::numeric)) AND ((south_latitude >= ('-90'::integer)::numeric) AND (south_latitude <= (90)::numeric)) AND ((north_latitude >= ('-90'::integer)::numeric) AND (north_latitude <= (90)::numeric)) AND (south_latitude <= north_latitude)))";

describe('the guards in the catalog', () => {
  it('every guard trigger, enabled and unconditional, and no other', async () => {
    const rows = await tested.db.rows<{ definition: string; enabled: string }>(
      `SELECT pg_get_triggerdef(t.oid) AS definition, t.tgenabled AS enabled
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace`,
    );
    expect(rows.map((row) => row.definition).sort()).toEqual(triggers);
    expect(rows.filter((row) => row.enabled !== 'O')).toEqual([]);
  });

  it('every check, as written', async () => {
    const rows = await tested.db.rows<{ name: string; definition: string }>(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE contype = 'c' AND connamespace = 'public'::regnamespace ORDER BY conname`,
    );
    const checks = [
      {
        name: 'assignment_form_document_types_check',
        definition:
          "CHECK (((form_document_types IS NOT NULL) AND (form_document_types <@ ARRAY['ROE'::form_document_type, 'SURVEY'::form_document_type, 'INCIDENT'::form_document_type, 'DROP_OFF_LOG'::form_document_type])))",
      },
      {
        name: 'assignment_origin_check',
        definition:
          "CHECK ((((origin = 'PLANNED'::assignment_origin) AND (made_by_id IS NOT NULL)) OR ((origin = 'UNPLANNED'::assignment_origin) AND (made_by_id IS NULL) AND (device_id IS NOT NULL))))",
      },
      {
        name: 'assignment_system_actor_check',
        definition:
          "CHECK (((person_id <> '00000000-0000-7000-8000-000000000001'::uuid) AND (made_by_id IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid)))",
      },
      // A carried ticket is a collection's (ADR-325).
      {
        name: 'carried_ticket_kind_check',
        definition: "CHECK ((field_event_kind = 'COLLECTION'::field_event_kind))",
      },
      // A certification, its measured boxes and its helpers (ADR-321).
      {
        name: 'certification_box_feature_check',
        definition: [
          'CHECK ((((num_nonnulls(feature_id, feature_other) =',
          'CASE',
          '    WHEN ("position" = 0) THEN 0',
          '    ELSE 1',
          "END) AND ((feature_other IS NULL) OR (btrim(feature_other) <> ''::text))) IS TRUE))",
        ].join('\n'),
      },
      {
        name: 'certification_box_kind_check',
        definition: "CHECK ((kind = 'CONTAINER'::certification_kind))",
      },
      {
        name: 'certification_box_measurements_check',
        definition: [
          'CHECK ((',
          'CASE',
          "    WHEN (shape = ANY (ARRAY['RECTANGLE'::box_shape, 'TRIANGLE'::box_shape])) THEN ((length >= 1) AND (width >= 1) AND (height >= 1) AND (num_nonnulls(second_length, diameter, radius, run, corners) = 0))",
          "    WHEN (shape = 'TWO_LENGTH_HOIST'::box_shape) THEN ((length >= 1) AND (second_length >= 1) AND (width >= 1) AND (height >= 1) AND (num_nonnulls(diameter, radius, run, corners) = 0))",
          "    WHEN (shape = 'ROUND_BOTTOM'::box_shape) THEN ((diameter >= 1) AND (length >= 1) AND (num_nonnulls(second_length, width, height, radius, run, corners) = 0))",
          "    WHEN (shape = 'RADIUS_CORNER'::box_shape) THEN ((radius >= 1) AND (run >= 1) AND (corners >= 1) AND (num_nonnulls(length, second_length, width, height, diameter) = 0))",
          '    ELSE false',
          'END IS TRUE))',
        ].join('\n'),
      },
      {
        name: 'certification_box_position_check',
        definition: 'CHECK (("position" >= 0))',
      },
      {
        name: 'certification_box_primary_check',
        definition:
          "CHECK ((((\"position\" <> 0) OR ((shape = 'RECTANGLE'::box_shape) AND (sign = 'ADD'::box_sign) AND (archived_at IS NULL))) IS TRUE))",
      },
      {
        name: 'certification_box_radius_corner_check',
        definition:
          "CHECK (((shape <> 'RADIUS_CORNER'::box_shape) OR (sign = 'SUBTRACT'::box_sign)))",
      },
      {
        name: 'certification_cert_number_check',
        definition: "CHECK ((btrim(cert_number) <> ''::text))",
      },
      {
        name: 'certification_helper_system_actor_check',
        definition: "CHECK ((user_id <> '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'certification_kind_check',
        definition: [
          'CHECK ((',
          'CASE kind',
          "    WHEN 'CONTAINER'::certification_kind THEN ((capacity_cy IS NOT NULL) AND (capacity_cy >= 0) AND (crew_type_id IS NULL))",
          "    WHEN 'CREW'::certification_kind THEN (capacity_cy IS NULL)",
          '    ELSE false',
          'END IS TRUE))',
        ].join('\n'),
      },
      {
        name: 'certification_replaces_check',
        definition:
          "CHECK (((((replaces_id IS NULL) = (replaced_reason IS NULL)) AND ((replaced_reason IS NULL) OR (btrim(replaced_reason) <> ''::text)) AND ((replaces_id IS NULL) OR (replaces_id <> id))) IS TRUE))",
      },
      {
        name: 'certification_revoked_check',
        definition:
          "CHECK ((((num_nonnulls(revoked_from, revoked_reason, revoked_by_id) = ANY (ARRAY[0, 3])) AND ((revoked_reason IS NULL) OR (btrim(revoked_reason) <> ''::text))) IS TRUE))",
      },
      {
        name: 'certification_subs_check',
        definition:
          'CHECK (((((second_tier_sub_id IS NULL) OR (first_tier_sub_id IS NOT NULL)) AND ((second_tier_sub_id IS NULL) OR (second_tier_sub_id <> first_tier_sub_id))) IS TRUE))',
      },
      {
        name: 'certification_system_actor_check',
        definition:
          "CHECK (((certified_by_id <> '00000000-0000-7000-8000-000000000001'::uuid) AND (revoked_by_id IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid)))",
      },
      {
        name: 'certification_vehicle_type_check',
        definition:
          "CHECK ((((num_nonnulls(vehicle_type_id, vehicle_type_other) <= 1) AND ((vehicle_type_other IS NULL) OR (btrim(vehicle_type_other) <> ''::text))) IS TRUE))",
      },
      {
        name: 'contractor_merged_into_another_check',
        definition: 'CHECK (((merged_into_id IS NULL) OR (merged_into_id <> id)))',
      },
      {
        name: 'contractor_merged_is_archived_check',
        definition: 'CHECK (((merged_into_id IS NULL) OR (archived_at IS NOT NULL)))',
      },
      {
        name: 'device_key_revoked_check',
        definition:
          'CHECK (((key_revoked_at IS NULL) OR ((out_of_service_at IS NOT NULL) AND (key_revoked_at >= out_of_service_at))))',
      },
      {
        name: 'device_out_of_service_check',
        definition: "CHECK (((status = 'ACTIVE'::device_status) = (out_of_service_at IS NULL)))",
      },
      {
        name: 'field_event_address_check',
        definition: 'CHECK (((address IS NULL) = (address_source IS NULL)))',
      },
      // What each kind of field event records (ADR-325).
      {
        name: 'field_event_carried_count_check',
        definition:
          "CHECK (((carried_count IS NULL) OR ((kind = 'DISPOSAL'::field_event_kind) AND (carried_count >= 0))))",
      },
      {
        name: 'field_event_created_by_check',
        definition:
          "CHECK ((created_by_id IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'field_event_debris_type_check',
        definition:
          "CHECK ((((num_nonnulls(form_debris_type_id, form_id, form_document_type) = ANY (ARRAY[0, 3])) AND ((form_debris_type_id IS NULL) OR ((workflow = 'LOAD'::workflow) AND (form_document_type = 'LOAD'::form_document_type)) OR ((workflow = 'HAUL_OUT'::workflow) AND (form_document_type = 'HAUL_OUT'::form_document_type)))) IS TRUE))",
      },
      {
        name: 'field_event_end_gps_check',
        definition:
          "CHECK ((((num_nonnulls(end_latitude, end_longitude) = ANY (ARRAY[0, 2])) AND ((end_latitude IS NULL) OR ((end_latitude >= ('-90'::integer)::numeric) AND (end_latitude <= (90)::numeric))) AND ((end_longitude IS NULL) OR ((end_longitude >= ('-180'::integer)::numeric) AND (end_longitude <= (180)::numeric)))) IS TRUE))",
      },
      {
        name: 'field_event_estimate_check',
        definition:
          "CHECK ((\nCASE\n    WHEN (kind = 'COLLECTION'::field_event_kind) THEN (((split_suffix <> ''::text) = (estimate_cy IS NOT NULL)) AND ((estimate_cy IS NULL) OR (estimate_cy >= (0)::numeric)))\n    ELSE (estimate_cy IS NULL)\nEND IS TRUE))",
      },
      {
        name: 'field_event_field_tag_check',
        definition:
          "CHECK (((field_tag_id IS NULL) OR (kind = ANY (ARRAY['COLLECTION'::field_event_kind, 'HAUL_OUT_COLLECTION'::field_event_kind, 'UNIT_RATE'::field_event_kind]))))",
      },
      {
        name: 'field_event_item_kind_check',
        definition: "CHECK ((field_event_kind = 'UNIT_RATE'::field_event_kind))",
      },
      {
        name: 'field_event_item_quantity_check',
        definition: 'CHECK ((quantity >= (0)::numeric))',
      },
      {
        name: 'field_event_kind_in_workflow_check',
        definition:
          "CHECK ((((workflow = 'LOAD'::workflow) AND (kind = ANY (ARRAY['COLLECTION'::field_event_kind, 'DISPOSAL'::field_event_kind]))) OR ((workflow = 'HAUL_OUT'::workflow) AND (kind = ANY (ARRAY['HAUL_OUT_COLLECTION'::field_event_kind, 'HAUL_OUT_DISPOSAL'::field_event_kind]))) OR ((workflow = 'UNIT_RATE'::workflow) AND (kind = 'UNIT_RATE'::field_event_kind))))",
      },
      {
        name: 'field_event_load_call_check',
        definition:
          "CHECK (((load_call IS NULL) OR ((kind = ANY (ARRAY['DISPOSAL'::field_event_kind, 'HAUL_OUT_COLLECTION'::field_event_kind])) AND ((load_call >= 0) AND (load_call <= 100)))))",
      },
      {
        name: 'field_event_measurement_check',
        definition:
          'CHECK (((((measurement_inches IS NULL) = (measured_as IS NULL)) AND ((measurement_inches IS NULL) OR (measurement_inches >= (0)::numeric)) AND ((root_ball_inches IS NULL) OR (root_ball_inches >= (0)::numeric)) AND ((unit_count IS NULL) OR (unit_count >= (0)::numeric))) IS TRUE))',
      },
      {
        name: 'field_event_monitor_check',
        definition: "CHECK ((monitor_id <> '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'field_event_number_typed_check',
        definition: 'CHECK ((number_typed OR (number_typed_reason_id IS NULL)))',
      },
      {
        name: 'field_event_roe_number_check',
        definition:
          "CHECK (((roe_number IS NULL) OR (kind = ANY (ARRAY['COLLECTION'::field_event_kind, 'UNIT_RATE'::field_event_kind]))))",
      },
      {
        name: 'field_event_source_check',
        definition:
          "CHECK ((\nCASE source\n    WHEN 'DEVICE'::record_source THEN ((num_nonnulls(device_id, assignment_id, setup_version) = 3) AND (num_nonnulls(created_by_id, created_reason_id) = 0))\n    WHEN 'BACK_OFFICE'::record_source THEN ((num_nonnulls(device_id, assignment_id, setup_version) = 0) AND (num_nonnulls(created_by_id, created_reason_id) = 2) AND (NOT temporary_session))\n    ELSE false\nEND IS TRUE))",
      },
      {
        name: 'field_event_split_suffix_check',
        definition:
          "CHECK (((split_suffix = ''::text) OR ((kind = ANY (ARRAY['COLLECTION'::field_event_kind, 'HAUL_OUT_COLLECTION'::field_event_kind])) AND (split_suffix ~ '^[A-Z]+$'::text))))",
      },
      {
        name: 'field_event_start_gps_check',
        definition:
          "CHECK ((((num_nonnulls(start_latitude, start_longitude) = ANY (ARRAY[0, 2])) AND ((start_latitude IS NULL) OR ((start_latitude >= ('-90'::integer)::numeric) AND (start_latitude <= (90)::numeric))) AND ((start_longitude IS NULL) OR ((start_longitude >= ('-180'::integer)::numeric) AND (start_longitude <= (180)::numeric)))) IS TRUE))",
      },
      {
        name: 'field_event_typed_capacity_check',
        definition:
          'CHECK (((typed_capacity_cy IS NULL) OR (cert_keyed_by_hand AND (typed_capacity_cy >= 0))))',
      },
      {
        name: 'field_event_unit_rate_check',
        definition:
          "CHECK (((kind = 'UNIT_RATE'::field_event_kind) OR (num_nonnulls(kind_of_work_id, payable_type_id, pay_item_id, unit_count, measurement_inches, measured_as, root_ball_inches, root_ball_half_exposed, survey_number, marked_ineligible) = 0)))",
      },
      {
        name: 'form_debris_type_document_type_check',
        definition:
          "CHECK ((document_type = ANY (ARRAY['LOAD'::form_document_type, 'HAUL_OUT'::form_document_type])))",
      },
      {
        name: 'form_definition_document_type_check',
        definition:
          "CHECK ((document_type = ANY (ARRAY['ROE'::form_document_type, 'SURVEY'::form_document_type, 'INCIDENT'::form_document_type, 'DROP_OFF_LOG'::form_document_type])))",
      },
      {
        name: 'form_definition_fields_check',
        definition: "CHECK ((jsonb_typeof(fields) = 'array'::text))",
      },
      { name: 'form_definition_version_check', definition: 'CHECK ((version >= 1))' },
      {
        name: 'form_gps_required_check',
        definition:
          "CHECK (((document_type = 'ROE'::form_document_type) = (gps_required IS NOT NULL)))",
      },
      {
        name: 'form_incident_offers_check',
        definition:
          "CHECK (((((document_type = 'INCIDENT'::form_document_type) = (incident_offers IS NOT NULL)) AND ((incident_offers IS NULL) OR (array_position(incident_offers, NULL::incident_offer) IS NULL))) IS TRUE))",
      },
      {
        name: 'disposal_site_coordinates_check',
        definition:
          "CHECK ((((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)) AND ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))))",
      },
      {
        name: 'disposal_site_dates_check',
        definition: 'CHECK (((close_date IS NULL) OR (close_date >= activation_date)))',
      },
      {
        name: 'disposal_site_haul_outs_check',
        definition:
          "CHECK (((NOT haul_outs_leave_here) OR (NOT (site_type_key IS DISTINCT FROM 'TDSR'::text))))",
      },
      { name: 'map_version_boundary_check', definition: shapeCheck('boundary') },
      { name: 'map_version_bounding_box_check', definition: boundingBoxCheck },
      { name: 'map_version_version_check', definition: 'CHECK ((version >= 1))' },
      { name: 'site_area_version_bounding_box_check', definition: boundingBoxCheck },
      { name: 'site_area_version_geometry_check', definition: shapeCheck('geometry') },
      { name: 'site_area_version_version_check', definition: 'CHECK ((version >= 1))' },
      { name: 'zone_bounding_box_check', definition: boundingBoxCheck },
      { name: 'zone_geometry_check', definition: shapeCheck('geometry') },
      {
        name: 'field_event_scale_receipt_check',
        definition:
          "CHECK (((scale_receipt_id IS NULL) OR (kind = ANY (ARRAY['DISPOSAL'::field_event_kind, 'HAUL_OUT_DISPOSAL'::field_event_kind]))))",
      },
      {
        name: 'scale_receipt_entered_by_check',
        definition: "CHECK ((entered_by_id <> '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'scale_receipt_number_check',
        definition: "CHECK ((btrim(receipt_number) <> ''::text))",
      },
      {
        name: 'scale_receipt_weights_check',
        definition:
          'CHECK ((((gross_weight_lb IS NULL) OR (gross_weight_lb >= (0)::numeric)) AND ((tare_weight_lb IS NULL) OR (tare_weight_lb >= (0)::numeric))))',
      },
      {
        name: 'photo_file_check',
        definition:
          "CHECK ((((original_sha256 ~ '^[0-9a-f]{64}$'::text) AND (uploaded_sha256 ~ '^[0-9a-f]{64}$'::text) AND (btrim(object_key) <> ''::text) AND ((depth_object_key IS NULL) OR (btrim(depth_object_key) <> ''::text))) IS TRUE))",
      },
      {
        name: 'photo_gps_check',
        definition:
          "CHECK ((((num_nonnulls(latitude, longitude) = ANY (ARRAY[0, 2])) AND ((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))) AND ((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))) IS TRUE))",
      },
      // A photograph's label, when it has one, isn't blank (ADR-337).
      {
        name: 'photo_label_check',
        definition: "CHECK (((label IS NULL) OR (btrim(label) <> ''::text)))",
      },
      {
        name: 'photo_owner_check',
        definition:
          'CHECK ((num_nonnulls(field_event_id, certification_id, scale_receipt_id, roe_id, survey_id, incident_id, drop_off_log_id) = 1))',
      },
      {
        name: 'photo_view_check',
        definition: 'CHECK (((view IS NULL) OR (certification_id IS NOT NULL)))',
      },
      // ROEs and forms (ADR-327).
      {
        name: 'drop_off_log_answers_check',
        definition:
          "CHECK ((((jsonb_typeof(answers) = 'object'::text) AND (num_nonnulls(form_definition_id, form_id, form_document_type) = ANY (ARRAY[0, 3])) AND ((form_document_type IS NULL) OR (form_document_type = 'DROP_OFF_LOG'::form_document_type)) AND ((form_definition_id IS NOT NULL) OR (answers = '{}'::jsonb))) IS TRUE))",
      },
      {
        name: 'drop_off_log_created_by_check',
        definition:
          "CHECK ((created_by_id IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'drop_off_log_gps_check',
        definition:
          "CHECK ((((num_nonnulls(latitude, longitude) = ANY (ARRAY[0, 2])) AND ((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))) AND ((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))) IS TRUE))",
      },
      {
        name: 'drop_off_log_monitor_check',
        definition: "CHECK ((monitor_id <> '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'drop_off_log_source_check',
        definition:
          "CHECK ((\nCASE source\n    WHEN 'DEVICE'::record_source THEN ((num_nonnulls(device_id, assignment_id, setup_version) = 3) AND (num_nonnulls(created_by_id, created_reason_id) = 0))\n    WHEN 'BACK_OFFICE'::record_source THEN ((num_nonnulls(device_id, assignment_id, setup_version) = 0) AND (num_nonnulls(created_by_id, created_reason_id) = 2))\n    ELSE false\nEND IS TRUE))",
      },
      {
        name: 'field_event_roe_check',
        definition:
          "CHECK (((roe_id IS NULL) OR (kind = ANY (ARRAY['COLLECTION'::field_event_kind, 'UNIT_RATE'::field_event_kind]))))",
      },
      {
        name: 'incident_answers_check',
        definition:
          "CHECK ((((jsonb_typeof(answers) = 'object'::text) AND (num_nonnulls(form_definition_id, form_id, form_document_type) = ANY (ARRAY[0, 3])) AND ((form_document_type IS NULL) OR (form_document_type = 'INCIDENT'::form_document_type)) AND ((form_definition_id IS NOT NULL) OR (answers = '{}'::jsonb))) IS TRUE))",
      },
      {
        name: 'incident_cert_number_check',
        definition:
          "CHECK (((((cert_number IS NULL) OR (btrim(cert_number) <> ''::text)) AND ((certification_id IS NULL) OR (cert_number IS NOT NULL))) IS TRUE))",
      },
      {
        name: 'incident_created_by_check',
        definition:
          "CHECK ((created_by_id IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'incident_gps_check',
        definition:
          "CHECK ((((num_nonnulls(latitude, longitude) = ANY (ARRAY[0, 2])) AND ((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))) AND ((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))) IS TRUE))",
      },
      {
        name: 'incident_monitor_check',
        definition: "CHECK ((monitor_id <> '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'incident_roe_number_check',
        definition:
          "CHECK (((((roe_number IS NULL) OR (btrim(roe_number) <> ''::text)) AND ((roe_id IS NULL) OR (roe_number IS NOT NULL))) IS TRUE))",
      },
      {
        name: 'incident_source_check',
        definition:
          "CHECK ((\nCASE source\n    WHEN 'DEVICE'::record_source THEN ((num_nonnulls(device_id, assignment_id, setup_version) = 3) AND (num_nonnulls(created_by_id, created_reason_id) = 0))\n    WHEN 'BACK_OFFICE'::record_source THEN ((num_nonnulls(device_id, assignment_id, setup_version) = 0) AND (num_nonnulls(created_by_id, created_reason_id) = 2))\n    ELSE false\nEND IS TRUE))",
      },
      {
        name: 'roe_answers_check',
        definition:
          "CHECK ((((jsonb_typeof(answers) = 'object'::text) AND (num_nonnulls(form_definition_id, form_id, form_document_type) = ANY (ARRAY[0, 3])) AND ((form_document_type IS NULL) OR (form_document_type = 'ROE'::form_document_type)) AND ((form_definition_id IS NOT NULL) OR (answers = '{}'::jsonb))) IS TRUE))",
      },
      {
        name: 'roe_gps_check',
        definition:
          "CHECK ((((num_nonnulls(latitude, longitude) = ANY (ARRAY[0, 2])) AND ((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))) AND ((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))) IS TRUE))",
      },
      {
        name: 'roe_made_by_check',
        definition:
          "CHECK ((made_by_id IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'roe_number_check',
        definition: "CHECK ((btrim(roe_number) <> ''::text))",
      },
      {
        name: 'roe_scope_item_count_check',
        definition: 'CHECK (((count IS NULL) OR (count >= 1)))',
      },
      {
        name: 'roe_scope_item_pick_check',
        definition:
          "CHECK ((((num_nonnulls(form_debris_type_id, payable_type_id) = 1) AND (num_nonnulls(form_debris_type_id, form_id, form_document_type) = ANY (ARRAY[0, 3])) AND ((form_document_type IS NULL) OR (form_document_type = 'LOAD'::form_document_type))) IS TRUE))",
      },
      {
        name: 'roe_source_check',
        definition:
          "CHECK ((\nCASE source\n    WHEN 'DEVICE'::record_source THEN (num_nonnulls(made_by_id, device_id, assignment_id, made_at, device_utc_offset_minutes) = 5)\n    WHEN 'BACK_OFFICE'::record_source THEN (num_nonnulls(device_id, assignment_id, device_utc_offset_minutes) = 0)\n    ELSE false\nEND IS TRUE))",
      },
      {
        name: 'survey_answers_check',
        definition:
          "CHECK ((((jsonb_typeof(answers) = 'object'::text) AND (num_nonnulls(form_definition_id, form_id, form_document_type) = ANY (ARRAY[0, 3])) AND ((form_document_type IS NULL) OR (form_document_type = 'SURVEY'::form_document_type)) AND ((form_definition_id IS NOT NULL) OR (answers = '{}'::jsonb))) IS TRUE))",
      },
      {
        name: 'survey_created_by_check',
        definition:
          "CHECK ((created_by_id IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'survey_gps_check',
        definition:
          "CHECK ((((num_nonnulls(latitude, longitude) = ANY (ARRAY[0, 2])) AND ((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))) AND ((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))) IS TRUE))",
      },
      {
        name: 'survey_monitor_check',
        definition: "CHECK ((monitor_id <> '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'survey_source_check',
        definition:
          "CHECK ((\nCASE source\n    WHEN 'DEVICE'::record_source THEN ((num_nonnulls(device_id, assignment_id, setup_version) = 3) AND (num_nonnulls(created_by_id, created_reason_id) = 0))\n    WHEN 'BACK_OFFICE'::record_source THEN ((num_nonnulls(device_id, assignment_id, setup_version) = 0) AND (num_nonnulls(created_by_id, created_reason_id) = 2))\n    ELSE false\nEND IS TRUE))",
      },
      { name: 'master_passcode_hash_check', definition: "CHECK ((hash ~~ '$argon2id$%'::text))" },
      { name: 'master_passcode_version_check', definition: 'CHECK ((version >= 1))' },
      {
        name: 'number_block_ended_check',
        definition: "CHECK (((status = 'ISSUED'::number_block_status) = (ended_at IS NULL)))",
      },
      {
        name: 'number_block_last_used_check',
        definition:
          'CHECK (((last_used_number IS NULL) OR ((last_used_number >= first_number) AND (last_used_number <= last_number))))',
      },
      {
        name: 'number_block_range_check',
        definition: 'CHECK (((first_number >= 1) AND (first_number <= last_number)))',
      },
      {
        name: 'number_block_ticket_range_check',
        definition:
          "CHECK ((((series <> ALL (ARRAY['LOAD'::number_series, 'HAUL_OUT'::number_series, 'UNIT_RATE'::number_series])) OR ((first_number >= 100001) AND (last_number <= 9999999))) IS TRUE))",
      },
      {
        name: 'project_number_series_range_check',
        definition: 'CHECK (((first_number >= 1) AND (next_number >= first_number)))',
      },
      {
        name: 'project_number_series_ticket_range_check',
        definition:
          "CHECK ((((series <> ALL (ARRAY['LOAD'::number_series, 'HAUL_OUT'::number_series, 'UNIT_RATE'::number_series])) OR ((first_number >= 100001) AND (next_number <= 10000000))) IS TRUE))",
      },
      {
        name: 'control_range_range_check',
        definition: 'CHECK (((first_number >= 1) AND (first_number <= last_number)))',
      },
      {
        name: 'control_range_series_check',
        definition:
          "CHECK ((series = ANY (ARRAY['LOAD'::number_series, 'HAUL_OUT'::number_series])))",
      },
      {
        name: 'pay_item_band_check',
        definition:
          'CHECK ((((band_from IS NULL) OR (band_from >= (0)::numeric)) AND ((band_to IS NULL) OR (band_to >= (0)::numeric)) AND ((band_from IS NULL) OR (band_to IS NULL) OR (band_from <= band_to))))',
      },
      {
        name: 'pay_item_crew_day_hours_check',
        definition:
          "CHECK ((((NOT (crew_time_conversion IS DISTINCT FROM 'PER_DAY_EXACT'::crew_time_conversion)) = (crew_day_hours IS NOT NULL)) AND ((crew_day_hours IS NULL) OR ((crew_day_hours > (0)::numeric) AND (crew_day_hours <= (24)::numeric)))))",
      },
      {
        name: 'pay_item_crew_day_step_hours_check',
        definition:
          'CHECK (((from_hours >= (0)::numeric) AND (from_hours <= to_hours) AND (to_hours <= (24)::numeric)))',
      },
      {
        name: 'pay_item_crew_day_step_quantity_check',
        definition: 'CHECK ((quantity >= (0)::numeric))',
      },
      {
        name: 'pay_item_crew_time_conversion_check',
        definition:
          "CHECK ((((unit = 'HR'::billing_unit) AND (NOT (crew_time_conversion IS DISTINCT FROM 'PER_HOUR'::crew_time_conversion))) OR ((unit = 'CREW_DAY'::billing_unit) AND (crew_time_conversion IS NOT NULL) AND (crew_time_conversion <> 'PER_HOUR'::crew_time_conversion)) OR ((unit <> ALL (ARRAY['HR'::billing_unit, 'CREW_DAY'::billing_unit])) AND (crew_time_conversion IS NULL))))",
      },
      { name: 'pay_item_rate_rate_check', definition: 'CHECK ((rate >= (0)::numeric))' },
      {
        name: 'project_active_window_check',
        definition: 'CHECK (((active_to IS NULL) OR (active_to >= active_from)))',
      },
      {
        name: 'project_contractor_as_prime_check',
        definition:
          'CHECK ((NOT (as_prime_id IS DISTINCT FROM\nCASE\n    WHEN ("position" = \'PRIME\'::contractor_position) THEN contractor_id\n    ELSE NULL::uuid\nEND)))',
      },
      {
        name: 'project_contractor_prime_check',
        definition: 'CHECK ((("position" = \'PRIME\'::contractor_position) = (prime_id IS NULL)))',
      },
      {
        name: 'project_load_call_limits_check',
        definition:
          'CHECK ((((load_call_low_limit IS NULL) OR ((load_call_low_limit >= 0) AND (load_call_low_limit <= 100))) AND ((load_call_high_limit IS NULL) OR ((load_call_high_limit >= 0) AND (load_call_high_limit <= 100)))))',
      },
      { name: 'project_site_circle_check', definition: 'CHECK ((site_circle_meters >= 1))' },
      {
        name: 'project_stump_fill_depth_check',
        definition: 'CHECK ((stump_fill_depth_inches >= 1))',
      },
      {
        name: 'project_time_zone_known_check',
        definition:
          "CHECK ((('2000-01-01 00:00:00+00'::timestamp with time zone AT TIME ZONE time_zone) IS NOT NULL))",
      },
      {
        name: 'project_time_zone_named_check',
        definition:
          "CHECK (((time_zone = 'UTC'::text) OR (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$'::text)))",
      },
      { name: 'project_workflows_check', definition: 'CHECK ((workflows IS NOT NULL))' },
      // Rules: which operator a criterion takes, where a typed value sits, what a pick fills,
      // what an action holds (ADR-313).
      {
        name: 'rule_action_pay_item_check',
        definition:
          "CHECK ((((kind = 'ADD_TRANSACTION'::rule_action_kind) OR (pay_item_id IS NULL)) IS TRUE))",
      },
      {
        name: 'rule_action_quantity_from_check',
        definition:
          "CHECK ((((kind = 'ADD_TRANSACTION'::rule_action_kind) = (quantity_from IS NOT NULL)) IS TRUE))",
      },
      {
        name: 'rule_action_slot_check',
        definition:
          "CHECK (((((slot IS NULL) OR (slot >= 1)) AND ((kind <> 'VOID_TICKET'::rule_action_kind) OR (slot IS NULL))) IS TRUE))",
      },
      {
        name: 'rule_criterion_operator_check',
        definition:
          "CHECK ((((operator = ANY (ARRAY['IS_EMPTY'::rule_operator, 'IS_NOT_EMPTY'::rule_operator])) OR\nCASE\n    WHEN (criterion = ANY (ARRAY['CONTRACTOR'::rule_criterion_key, 'DEBRIS_TYPE'::rule_criterion_key, 'FIELD_TAG'::rule_criterion_key, 'ZONE'::rule_criterion_key, 'DISPOSAL_SITE'::rule_criterion_key, 'FROM_SITE'::rule_criterion_key, 'DISPOSAL_SITE_TYPE'::rule_criterion_key, 'PAY_ITEM'::rule_criterion_key])) THEN (operator = ANY (ARRAY['EQUALS'::rule_operator, 'NOT_EQUALS'::rule_operator, 'IS_ONE_OF'::rule_operator, 'IS_NOT_ONE_OF'::rule_operator]))\n    WHEN (criterion = ANY (ARRAY['WEIGHT'::rule_criterion_key, 'VOLUME'::rule_criterion_key, 'MILEAGE'::rule_criterion_key, 'UNIT_COUNT'::rule_criterion_key, 'MEASUREMENT'::rule_criterion_key, 'ITEM'::rule_criterion_key])) THEN (operator = ANY (ARRAY['EQUALS'::rule_operator, 'NOT_EQUALS'::rule_operator, 'BETWEEN'::rule_operator, 'AT_LEAST'::rule_operator, 'AT_MOST'::rule_operator, 'MORE_THAN'::rule_operator, 'LESS_THAN'::rule_operator]))\n    WHEN (criterion = 'TICKET_DATE'::rule_criterion_key) THEN (operator = ANY (ARRAY['ON'::rule_operator, 'NOT_ON'::rule_operator, 'BETWEEN'::rule_operator, 'ON_OR_BEFORE'::rule_operator, 'ON_OR_AFTER'::rule_operator]))\n    WHEN (criterion = 'COLLECTION_ADDRESS'::rule_criterion_key) THEN (operator = ANY (ARRAY['EQUALS'::rule_operator, 'NOT_EQUALS'::rule_operator, 'CONTAINS'::rule_operator, 'STARTS_WITH'::rule_operator]))\n    ELSE false\nEND) IS TRUE))",
      },
      {
        name: 'rule_criterion_pick_value_check',
        definition:
          "CHECK (((((contractor_id IS NOT NULL) = (criterion = 'CONTRACTOR'::rule_criterion_key)) AND ((form_debris_type_id IS NOT NULL) = (criterion = 'DEBRIS_TYPE'::rule_criterion_key)) AND ((field_tag_id IS NOT NULL) = (criterion = 'FIELD_TAG'::rule_criterion_key)) AND ((disposal_site_id IS NOT NULL) = (criterion = ANY (ARRAY['DISPOSAL_SITE'::rule_criterion_key, 'FROM_SITE'::rule_criterion_key]))) AND ((site_type_id IS NOT NULL) = (criterion = 'DISPOSAL_SITE_TYPE'::rule_criterion_key)) AND ((pay_item_id IS NOT NULL) = (criterion = 'PAY_ITEM'::rule_criterion_key)) AND ((item_name_id IS NOT NULL) = (criterion = 'ITEM'::rule_criterion_key)) AND ((zone_name IS NOT NULL) = (criterion = 'ZONE'::rule_criterion_key)) AND ((zone_name IS NULL) OR (zone_name <> ''::text)) AND (num_nonnulls(contractor_id, form_debris_type_id, field_tag_id, disposal_site_id, site_type_id, pay_item_id, item_name_id, zone_name) = 1)) IS TRUE))",
      },
      {
        name: 'rule_criterion_position_check',
        definition: 'CHECK (("position" >= 1))',
      },
      {
        name: 'rule_criterion_value_check',
        definition:
          "CHECK ((\nCASE\n    WHEN (operator = ANY (ARRAY['IS_EMPTY'::rule_operator, 'IS_NOT_EMPTY'::rule_operator])) THEN (num_nonnulls(number_from, number_to, date_from, date_to, text) = 0)\n    WHEN (criterion = ANY (ARRAY['WEIGHT'::rule_criterion_key, 'VOLUME'::rule_criterion_key, 'MILEAGE'::rule_criterion_key, 'UNIT_COUNT'::rule_criterion_key, 'MEASUREMENT'::rule_criterion_key, 'ITEM'::rule_criterion_key])) THEN ((number_from IS NOT NULL) AND ((operator = 'BETWEEN'::rule_operator) = (number_to IS NOT NULL)) AND ((number_to IS NULL) OR (number_from <= number_to)) AND (num_nonnulls(date_from, date_to, text) = 0))\n    WHEN (criterion = 'TICKET_DATE'::rule_criterion_key) THEN ((date_from IS NOT NULL) AND ((operator = 'BETWEEN'::rule_operator) = (date_to IS NOT NULL)) AND ((date_to IS NULL) OR (date_from <= date_to)) AND (num_nonnulls(number_from, number_to, text) = 0))\n    WHEN (criterion = 'COLLECTION_ADDRESS'::rule_criterion_key) THEN ((text IS NOT NULL) AND (text <> ''::text) AND (num_nonnulls(number_from, number_to, date_from, date_to) = 0))\n    ELSE (num_nonnulls(number_from, number_to, date_from, date_to, text) = 0)\nEND IS TRUE))",
      },
      {
        name: 'rule_document_type_check',
        definition:
          "CHECK ((document_type = ANY (ARRAY['LOAD'::form_document_type, 'HAUL_OUT'::form_document_type, 'UNIT_RATE'::form_document_type])))",
      },
      {
        name: 'user_employer_number_check',
        definition: 'CHECK (((employer_number IS NULL) OR (employer_id IS NOT NULL)))',
      },
      {
        name: 'user_monitor_has_number_check',
        definition: "CHECK (((role <> 'MONITOR'::user_role) OR (monitor_number IS NOT NULL)))",
      },
      {
        name: 'user_monitor_number_check',
        definition: "CHECK (((monitor_number IS NULL) OR (monitor_number ~ '^M[0-9]{6,}$'::text)))",
      },
      {
        name: 'user_permission_system_actor_check',
        definition: "CHECK ((user_id <> '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      {
        name: 'user_system_actor_check',
        definition:
          "CHECK (((role <> 'SYSTEM'::user_role) OR ((id = '00000000-0000-7000-8000-000000000001'::uuid) AND (monitor_number IS NULL) AND (contractor_id IS NULL))))",
      },
      {
        name: 'user_system_actor_employer_check',
        definition:
          "CHECK (((role <> 'SYSTEM'::user_role) OR ((employer_id IS NULL) AND (employer_number IS NULL))))",
      },
      // A read-only viewer says what kind it is; a contractor user names its contractor (ADR-315).
      {
        name: 'user_viewer_contractor_check',
        definition:
          "CHECK (((NOT (viewer_kind IS DISTINCT FROM 'CONTRACTOR'::viewer_kind)) = (contractor_id IS NOT NULL)))",
      },
      {
        name: 'user_viewer_kind_check',
        definition: "CHECK (((role = 'READ_ONLY_VIEWER'::user_role) = (viewer_kind IS NOT NULL)))",
      },
      // Every read-only viewer says whether they see private citizens by name (ADR-336).
      {
        name: 'user_viewer_private_citizens_check',
        definition:
          "CHECK (((role = 'READ_ONLY_VIEWER'::user_role) = (sees_private_citizens IS NOT NULL)))",
      },
      {
        name: 'user_viewer_project_system_actor_check',
        definition: "CHECK ((user_id <> '00000000-0000-7000-8000-000000000001'::uuid))",
      },
      ...listChecks,
    ];
    expect(rows).toEqual(checks.sort((a, b) => (a.name < b.name ? -1 : 1)));
  });

  it('every exclusion constraint, as written: size bands, number blocks and control ranges never overlap', async () => {
    const rows = await tested.db.rows<{ name: string; definition: string }>(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE contype = 'x' AND connamespace = 'public'::regnamespace ORDER BY conname`,
    );
    expect(rows).toEqual([
      {
        name: 'control_ranges_never_overlap',
        definition:
          "EXCLUDE USING gist (project_id WITH =, series WITH =, int4range(first_number, last_number, '[]'::text) WITH &&) WHERE ((archived_at IS NULL))",
      },
      // What a block holds: its whole run, or, once reclaimed, only what its phone used (ADR-323).
      {
        name: 'number_blocks_never_overlap',
        definition:
          "EXCLUDE USING gist (project_id WITH =, series WITH =, int4range(first_number, (\nCASE\n    WHEN (status = 'RECLAIMED'::number_block_status) THEN COALESCE(last_used_number, (first_number - 1))\n    ELSE last_number\nEND + 1), '[)'::text) WITH &&)",
      },
      {
        name: 'pay_item_bands_never_overlap',
        definition:
          "EXCLUDE USING gist (project_id WITH =, payable_type_id WITH =, numrange(band_from, band_to, '[]'::text) WITH &&) WHERE (((archived_at IS NULL) AND ((band_from IS NOT NULL) OR (band_to IS NOT NULL))))",
      },
    ]);
  });

  it('AC-02-70 row-level security on the ticket tables and on every setup table a viewer sees, with exactly their policies', async () => {
    const found = await tested.db.rows<{ name: string; forced: boolean }>(
      `SELECT relname AS name, relforcerowsecurity AS forced FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') AND relrowsecurity
       ORDER BY relname`,
    );
    expect(found).toEqual(secured.map((name) => ({ name, forced: false })));
    const rows = await tested.db.rows<{ policy: string }>(
      `SELECT policyname || ' ' || permissive || ' ' || roles::text || ' ' || cmd
         || coalesce(' USING ' || qual, '') || coalesce(' CHECK ' || with_check, '') AS policy
       FROM pg_policies WHERE schemaname = 'public'`,
    );
    expect(rows.map((row) => row.policy).sort()).toEqual(policies);
  });

  it("the viewer views run as the viewer, behind a security barrier; a project's setup, who recorded a field event and a private citizen's columns ask the viewer's questions themselves", async () => {
    const rows = await tested.db.rows<{ name: string; options: string[] }>(
      `SELECT relname AS name, reloptions AS options FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind IN ('v', 'm') ORDER BY relname`,
    );
    const asTheViewer = [
      'viewer_completed_load',
      'viewer_field_event',
      'viewer_project',
      'viewer_transaction',
      ...viewedTables.map((table) => `viewer_${table}`),
    ].map((name) => ({ name, options: ['security_invoker=true', 'security_barrier=true'] }));
    expect(rows).toEqual(
      [
        ...asTheViewer,
        // Who recorded a field event asks the viewer's question itself too (ADR-324).
        { name: 'viewer_field_event_monitor', options: ['security_barrier=true'] },
        { name: 'viewer_project_setup', options: ['security_barrier=true'] },
        // A private citizen's columns too (ADR-336).
        ...citizenViews.map((name) => ({ name, options: ['security_barrier=true'] })),
      ].sort((a, b) => (a.name < b.name ? -1 : 1)),
    );
    // Row-level security can't tell columns apart, so the one view that shows a project's settings
    // runs with the owner's rights and holds the question in its own WHERE (ADR-315).
    const setup = await tested.db.one<{ definition: string; owner: string }>(
      `SELECT pg_get_viewdef('viewer_project_setup'::regclass) AS definition,
         pg_get_userbyid(relowner) AS owner
       FROM pg_class WHERE oid = 'viewer_project_setup'::regclass`,
    );
    expect(setup.owner).toBe('adms_owner');
    expect(setup.definition.split('\n').map((line) => line.trim())).toEqual([
      'SELECT id,',
      'name,',
      'client_id,',
      'declaration_event_id,',
      'program_type_id,',
      'allow_split_loads,',
      'time_zone,',
      'active_from,',
      'active_to,',
      'ticket_number_source,',
      'workflows,',
      'load_call_low_limit,',
      'load_call_high_limit,',
      'stump_fill_depth_inches,',
      'stump_check_root_ball_wider,',
      'stump_check_fill_needs_exposure,',
      'site_circle_meters,',
      'time_clock_enabled,',
      'created_at,',
      'closed_at',
      'FROM project',
      'WHERE (viewer_sees_project(id) AND viewer_sees_every_ticket());',
    ]);
  });

  it("AC-02-76 a private citizen's columns are shown by a view of their own, the owner's, that asks whether this viewer may see them", async () => {
    const views = await tested.db.rows<{ name: string; owner: string; definition: string }>(
      `SELECT relname AS name, pg_get_userbyid(relowner) AS owner,
         pg_get_viewdef(oid) AS definition
       FROM pg_class WHERE relname = ANY($1) ORDER BY relname`,
      [citizenViews],
    );
    const question =
      'WHERE (viewer_sees_project(project_id) AND viewer_sees_every_ticket() AND viewer_sees_private_citizens());';
    expect(
      views.map((view) => ({
        ...view,
        definition: view.definition.split('\n').map((line) => line.trim()),
      })),
    ).toEqual([
      {
        name: 'viewer_drop_off_log_citizen',
        owner: 'adms_owner',
        definition: [
          'SELECT id,',
          'project_id,',
          'resident_name,',
          'origin_address',
          'FROM drop_off_log',
          question,
        ],
      },
      {
        name: 'viewer_roe_citizen',
        owner: 'adms_owner',
        definition: ['SELECT id,', 'project_id,', 'owner_name', 'FROM roe', question],
      },
    ]);
    // And the views every viewer of the project reads don't show them.
    for (const [table, sight] of Object.entries(viewerSights)) {
      if (sight.citizen.length === 0) continue;
      const shown = await tested.db.rows<{ name: string }>(
        `SELECT attname AS name FROM pg_attribute
         WHERE attrelid = $1::regclass AND attnum > 0 AND attname = ANY($2)`,
        [`viewer_${table}`, sight.citizen],
      );
      expect(shown, table).toEqual([]);
    }
  });

  it("only seven functions run with the owner's rights, and every function pins its search path", async () => {
    const rows = await tested.db.rows<{ name: string; definer: boolean; config: string[] | null }>(
      `SELECT proname AS name, prosecdef AS definer, proconfig AS config FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace ORDER BY proname`,
    );
    expect(rows.filter((row) => row.definer).map((row) => row.name)).toEqual([
      'audit_capture',
      'transaction_delete_to_audit',
      // Who the viewer of a request is, read from their own record (ADR-315).
      'viewer_is_contractor',
      'viewer_sees_every_ticket',
      'viewer_sees_load_project',
      // Whether they see private citizens by name, read there too (ADR-336).
      'viewer_sees_private_citizens',
      'viewer_sees_project',
    ]);
    expect(
      rows.filter((row) => !(row.config ?? []).includes('search_path=pg_catalog, public')),
    ).toEqual([]);
  });
});
