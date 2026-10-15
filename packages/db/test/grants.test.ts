// REQ-009: the logins' least-privilege grants, every grant and every refusal (ARCHITECTURE §5.1;
// ADR-270 (2)). The first tests read the grants exactly as the catalog holds them, so a grant
// added anywhere fails here; the rest try each write as each login.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  eventInsertOf,
  fieldEventLike,
  insertOf,
  primeOn,
  projectLike,
  transactionLike,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { listTables } from './support/lists.ts';
import {
  citizenViews,
  moneyView,
  nameViews,
  unseenTables,
  viewedTables,
  viewerSights,
} from './support/viewers.ts';

const tested = eachTestRolledBack();

const logins = ['adms_owner', 'adms_api', 'adms_worker', 'adms_readonly'] as const;

// Who may do what on each table and view (ADR-270 (2), (7)). Anything not listed is not granted,
// to anyone, PUBLIC included; the owner, adms_owner, holds its own rights and is left out.
const tableGrants: Record<string, Record<string, string>> = {
  project: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // Who is paying, what happened, and a project's kinds of unit rate work (ADR-303).
  client: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  declaration_event: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  project_kind_of_work: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  contractor: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // A contractor's place on a project, and a contract (ADR-305).
  project_contractor: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  contract: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // A project's forms and the debris types on them; a definition's version is added, never
  // edited (ADR-308).
  form: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  form_debris_type: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  form_definition: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  user: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // A person's permissions, and a read-only viewer's projects (ADR-315).
  user_permission: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  user_viewer_project: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  device: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  disposal_site: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // A site's labels and tipping fee pay items; a site's own shape, and the project map, added in
  // versions, never edited (ADR-311).
  disposal_site_label: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  disposal_site_tipping_fee: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  site_area_version: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  map_version: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  zone: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  number_block: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  project_number_series: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  control_range: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  assignment: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  pay_item: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // A pay item's rate for each prime, and a crew day's steps (ADR-309).
  pay_item_rate: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  pay_item_crew_day_step: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  assignment_pay_item: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // A rule, its criteria and picked values, its actions and chosen items (ADR-313).
  rule: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  rule_criterion: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  rule_criterion_pick: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  rule_action: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  rule_action_item: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // A certification, its measured boxes and its helpers (ADR-321).
  certification: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  certification_box: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  certification_helper: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // An ROE and what it allows: edited as setup is (ADR-294, 327).
  roe: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  roe_scope_item: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // The firm's lists: configuration, each one (ADR-302).
  ...Object.fromEntries(
    listTables.map((table) => [table, { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' }]),
  ),
  // A version is added, never edited, and the worker has no business reading it (ADR-281).
  master_passcode: { adms_api: 'INSERT SELECT' },
  // Sign-in's records (ADR-397…399): the API's alone. What sign-in keeps of a person and a
  // session are changed in place; a security event is added, never edited.
  user_credential: { adms_api: 'INSERT SELECT UPDATE' },
  session: { adms_api: 'INSERT SELECT UPDATE' },
  security_event: { adms_api: 'INSERT SELECT' },
  // Wrong tries at the master passcode: the API's alone, its count changed in place (ADR-438).
  master_passcode_tries: { adms_api: 'INSERT SELECT UPDATE' },
  // The API writes people, so the Monitor ID's default runs as it (ADR-281).
  monitor_number_seq: { adms_api: 'USAGE' },
  field_event: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  // An itemised unit rate event's lines and the tickets a load carries: evidence (ADR-325).
  field_event_item: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  carried_ticket: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  // A scale receipt and a photograph's record: evidence (ADR-326).
  scale_receipt: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  photo: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  // A survey, an incident and a drop-off log: evidence (ADR-327).
  survey: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  incident: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  drop_off_log: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  // A record waiting in quarantine: evidence, kept as the phone sent it (ADR-338).
  quarantined_record: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  completed_load: { adms_api: 'SELECT', adms_worker: 'INSERT SELECT UPDATE' },
  // The worker's other conclusions: derived, each one (ADR-340).
  completed_load_collection: { adms_api: 'SELECT', adms_worker: 'INSERT SELECT UPDATE' },
  completed_haul_out: { adms_api: 'SELECT', adms_worker: 'INSERT SELECT UPDATE' },
  completed_haul_out_collection: { adms_api: 'SELECT', adms_worker: 'INSERT SELECT UPDATE' },
  flag: { adms_api: 'SELECT', adms_worker: 'INSERT SELECT UPDATE' },
  reconciliation_run: { adms_api: 'SELECT', adms_worker: 'INSERT SELECT UPDATE' },
  reconciliation_decision: { adms_api: 'SELECT', adms_worker: 'INSERT SELECT UPDATE' },
  transaction: { adms_api: 'SELECT', adms_worker: 'DELETE INSERT SELECT' },
  // People's marks: each its own record, written by the API, read by the worker (ADR-245, 363).
  qc_mark: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  invoice_batch: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  invoice_lock: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  flag_acceptance: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  ticket_void: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // An unvoid's own record (ADR-366): no update of it ever passes its trigger.
  ticket_unvoid: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // The job queue (ADR-418): the API adds a job and its tickets and changes neither; the worker
  // writes how a job went.
  reconciliation_job: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT UPDATE' },
  reconciliation_job_ticket: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  // A setup version (ADR-453): the API adds one and reads it, and nobody changes one; the
  // worker reads none.
  setup_manifest: { adms_api: 'INSERT SELECT' },
  // A sync and the idempotency ledger (ADR-471): the API adds each, and writes a sync's setup
  // version once; the worker reads both, for the clock's difference. A held record is the
  // API's alone: added, read and resolved; the worker holds nothing on it.
  sync: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  synced_record: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  held_record: { adms_api: 'INSERT SELECT UPDATE' },
  // A file set aside (ADR-482): the API's alone, added and read; what arrived is never changed,
  // and only its resolution is written later, by a person (a trigger refuses the rest, ADR-526).
  set_aside_file: { adms_api: 'INSERT SELECT UPDATE' },
  audit_record: { adms_api: 'SELECT', adms_worker: 'SELECT' },
  viewer_project: { adms_readonly: 'SELECT' },
  viewer_field_event: { adms_readonly: 'SELECT' },
  viewer_transaction: { adms_readonly: 'SELECT' },
  // A project's setup, for a client user and an auditor (ADR-315).
  viewer_project_setup: { adms_readonly: 'SELECT' },
  // Who recorded a field event: a monitor's name and Monitor ID (ADR-324).
  viewer_field_event_monitor: { adms_readonly: 'SELECT' },
  ...Object.fromEntries(
    viewedTables.map((table) => [`viewer_${table}`, { adms_readonly: 'SELECT' }]),
  ),
  // A private citizen's columns, for a viewer the firm lets see them (ADR-336).
  ...Object.fromEntries(citizenViews.map((view) => [view, { adms_readonly: 'SELECT' }])),
  // A line's rate and amount, and the names of setup a ticket is read with (ADR-361).
  ...Object.fromEntries(
    [moneyView, ...nameViews].map((view) => [view, { adms_readonly: 'SELECT' }]),
  ),
};

// A field event's captured columns: what the API corrects. Never its id, the server's received
// time, or the worker's reconciliation columns.
const captured = [
  'project_id',
  'workflow',
  'kind',
  'ticket_number',
  'split_suffix',
  'monitor_id',
  'device_id',
  'started_at',
  'ended_at',
  'device_utc_offset_minutes',
  'end_latitude',
  'end_longitude',
  'load_call',
  'assignment_id',
  'setup_version',
  'address',
  'address_source',
  'cert_keyed_by_hand',
  'cert_number',
  'certification_id',
  'created_by_id',
  'created_reason_id',
  'notes',
  'number_typed',
  'number_typed_reason_id',
  'site_id',
  'source',
  'start_latitude',
  'start_longitude',
  'temporary_session',
  'typed_capacity_cy',
  // What each kind records (ADR-325).
  'carried_count',
  'estimate_cy',
  'field_tag_id',
  'form_debris_type_id',
  'form_document_type',
  'form_id',
  'kind_of_work_id',
  'marked_ineligible',
  'measured_as',
  'measurement_inches',
  'pay_item_id',
  'payable_type_id',
  'roe_number',
  'root_ball_half_exposed',
  'root_ball_inches',
  'survey_number',
  'unit_count',
  // The scale receipt a disposal points at (ADR-326).
  'scale_receipt_id',
  // The ROE its number found (ADR-327).
  'roe_id',
  // A fix the phone sent that couldn't be one, kept as sent (ADR-338).
  'unreadable_gps',
];
// What every form records, beside its own (ADR-327).
const formShared = [
  'project_id',
  'source',
  'monitor_id',
  'device_id',
  'assignment_id',
  'setup_version',
  'created_by_id',
  'created_reason_id',
  'made_at',
  'device_utc_offset_minutes',
  'latitude',
  'longitude',
  'answers',
  'form_definition_id',
  'form_id',
  'form_document_type',
  'notes',
];
// What the API corrects on an item line and on a carried ticket: all but the id and created time;
// on a scale receipt, a photograph's record, a survey, an incident and a drop-off log: all but the
// id and the server's received time (a photograph's fingerprints and places in storage hold the
// grant and are refused by a trigger).
const correctable: Record<string, string[]> = {
  survey: [...formShared, 'work_type_id', 'survey_number', 'roe_number', 'roe_id'],
  incident: [
    ...formShared,
    'incident_type_id',
    'incident_sub_type_id',
    'description',
    'parties',
    'address',
    'contractor_id',
    'cert_number',
    'certification_id',
    'roe_number',
    'roe_id',
  ],
  drop_off_log: [...formShared, 'site_id', 'resident_name', 'origin_address'],
  // Each with the mark that takes it off (ADR-364).
  field_event_item: [
    'field_event_id',
    'field_event_kind',
    'item_name_id',
    'quantity',
    'archived_at',
  ],
  carried_ticket: ['field_event_id', 'field_event_kind', 'carried_ticket_number', 'archived_at'],
  scale_receipt: [
    'project_id',
    'receipt_number',
    'site_id',
    'gross_weight_lb',
    'tare_weight_lb',
    'net_weight_lb',
    'net_weight_tons',
    'entered_by_id',
    'device_id',
    'entered_at',
    'device_utc_offset_minutes',
    'notes',
  ],
  photo: [
    'project_id',
    'field_event_id',
    'certification_id',
    'scale_receipt_id',
    'roe_id',
    'survey_id',
    'incident_id',
    'drop_off_log_id',
    // While its record waits in quarantine (ADR-338).
    'quarantined_record_id',
    // While its record is held for a person (ADR-526).
    'held_record_id',
    'view',
    'captured_at',
    'device_utc_offset_minutes',
    'latitude',
    'longitude',
    'original_sha256',
    'uploaded_sha256',
    'object_key',
    'depth_object_key',
    'depth_sha256',
    'device_id',
    'uploaded_at',
    'depth_uploaded_at',
    // The back office's two marks (ADR-337).
    'archived_at',
    'label',
  ],
  // The grant is the evidence guard's, every column but the id and the received time; what the
  // phone sent is refused any change by the table's own trigger, so only the resolution is ever
  // written (ADR-338).
  quarantined_record: [
    'project_id',
    'device_id',
    'monitor_id',
    'payload',
    'reason',
    'holding_event_id',
    'holding_roe_id',
    'resolved_by_id',
    'resolved_at',
    'resolution',
  ],
};
// What the viewer views show, read through their base tables (row-level security applies there).
const viewerColumns: Record<string, string[]> = {
  project: ['id', 'name', 'time_zone', 'created_at', 'closed_at'],
  // Every column of a field event, since guard_viewer wrote its view (ADR-324).
  field_event: [
    'id',
    'received_at',
    'status',
    'reconciled_at',
    'zone_id',
    'map_version_id',
    'worked_out_pay_item_id',
    ...captured,
  ],
  // Every column of a priced line (ADR-358) but its rate and amount, which a sub's contractor
  // user never reads: `viewer_transaction_money` shows them (ADR-361).
  transaction: [
    'id',
    'project_id',
    'completed_load_id',
    'completed_load_collection_id',
    'completed_haul_out_id',
    'completed_haul_out_collection_id',
    'field_event_id',
    'slot',
    'rule_id',
    'pay_item_id',
    'contract_id',
    'prime_id',
    'operating_sub_id',
    'unit',
    'quantity',
    'reconciliation_run_id',
    'created_at',
  ],
};
const columnGrants = [
  ...captured.map((column) => `field_event.${column} adms_api UPDATE`),
  'field_event.status adms_worker UPDATE',
  'field_event.reconciled_at adms_worker UPDATE',
  // The zone, the map version used and a unit rate event's worked-out pay item (ADR-340).
  'field_event.zone_id adms_worker UPDATE',
  'field_event.map_version_id adms_worker UPDATE',
  'field_event.worked_out_pay_item_id adms_worker UPDATE',
  ...Object.entries(correctable).flatMap(([table, columns]) =>
    columns.map((column) => `${table}.${column} adms_api UPDATE`),
  ),
  ...Object.entries(viewerColumns).flatMap(([table, columns]) =>
    columns.map((column) => `${table}.${column} adms_readonly SELECT`),
  ),
].sort();

// Only the viewer's questions are callable, and only by the read-only login (ADR-270 (7), (8));
// and the Monitor ID's issuer, by the API, which writes people (ADR-281).
const functionGrants = [
  'next_monitor_number adms_api EXECUTE',
  'viewer_is_contractor adms_readonly EXECUTE',
  'viewer_sees_every_ticket adms_readonly EXECUTE',
  'viewer_sees_private_citizens adms_readonly EXECUTE',
  'viewer_sees_project adms_readonly EXECUTE',
];

const grantee = `CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END`;

describe('the grants, exactly as the catalog holds them', () => {
  it('on every table, view and sequence', async () => {
    const rows = await tested.db.rows<{ grant: string }>(
      `SELECT c.relname || ' ' || ${grantee} || ' ' || a.privilege_type AS grant
       FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
         AND a.grantee <> c.relowner`,
    );
    const expected = Object.entries(tableGrants).flatMap(([table, byLogin]) =>
      Object.entries(byLogin).flatMap(([login, privileges]) =>
        privileges.split(' ').map((privilege) => `${table} ${login} ${privilege}`),
      ),
    );
    expect(rows.map((row) => row.grant).sort()).toEqual(expected.sort());
  });

  it('on single columns', async () => {
    // A setup table a viewer sees: every column but the ones no viewer reads (ADR-315).
    const setupColumns = await tested.db.rows<{ grant: string }>(
      `SELECT c.relname || '.' || att.attname || ' adms_readonly SELECT' AS grant
       FROM pg_class c
       JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum > 0 AND NOT att.attisdropped
       WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1)`,
      [viewedTables],
    );
    const hidden = new Set(
      Object.entries(viewerSights).flatMap(([table, sight]) =>
        [...sight.hidden, ...sight.citizen].map(
          (column) => `${table}.${column} adms_readonly SELECT`,
        ),
      ),
    );
    const shown = setupColumns.map((row) => row.grant).filter((grant) => !hidden.has(grant));
    expect(setupColumns.length - shown.length).toBe(hidden.size);
    const rows = await tested.db.rows<{ grant: string }>(
      `SELECT c.relname || '.' || att.attname || ' ' || ${grantee} || ' ' || a.privilege_type AS grant
       FROM pg_class c
       JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum > 0 AND NOT att.attisdropped
       CROSS JOIN LATERAL aclexplode(att.attacl) a
       WHERE c.relnamespace = 'public'::regnamespace AND a.grantee <> c.relowner`,
    );
    expect(rows.map((row) => row.grant).sort()).toEqual([...columnGrants, ...shown].sort());
  });

  it('on functions: nothing callable by anyone but the viewer questions and the Monitor ID issuer', async () => {
    const rows = await tested.db.rows<{ grant: string }>(
      `SELECT p.proname || ' ' || ${grantee} || ' ' || a.privilege_type AS grant
       FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.pronamespace = 'public'::regnamespace AND a.grantee <> p.proowner`,
    );
    expect(rows.map((row) => row.grant).sort()).toEqual(functionGrants);
  });

  it('on the schema: usable by the three runtime logins, creatable only by its owner', async () => {
    const rows = await tested.db.rows<{ grant: string }>(
      `SELECT ${grantee} || ' ' || a.privilege_type AS grant
       FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
       WHERE n.nspname = 'public' AND a.grantee <> n.nspowner`,
    );
    expect(rows.map((row) => row.grant).sort()).toEqual([
      'adms_api USAGE',
      'adms_readonly USAGE',
      'adms_worker USAGE',
    ]);
  });

  it('the extensions schema holds btree_gist alone, is the owner’s, and no runtime login may use it', async () => {
    // Its functions are callable by anyone and pin no search path, so they stay out of public; an
    // exclusion constraint's index calls them without the right (ADR-310).
    const extensions = await tested.db.rows<{ name: string; version: string; schema: string }>(
      `SELECT extname AS name, extversion AS version, extnamespace::regnamespace::text AS schema
       FROM pg_extension ORDER BY extname`,
    );
    expect(extensions).toEqual([
      { name: 'btree_gist', version: '1.8', schema: 'extensions' },
      { name: 'plpgsql', version: '1.0', schema: 'pg_catalog' },
    ]);
    const rows = await tested.db.rows<{ owner: string; grant: string | null }>(
      `SELECT pg_get_userbyid(n.nspowner) AS owner,
         ${grantee} || ' ' || a.privilege_type AS grant
       FROM pg_namespace n LEFT JOIN LATERAL aclexplode(n.nspacl) a ON a.grantee <> n.nspowner
       WHERE n.nspname = 'extensions'`,
    );
    expect(rows).toEqual([{ owner: 'adms_owner', grant: null }]);
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly']) {
      expect(
        await tested.db.one(`SELECT has_schema_privilege($1, 'extensions', 'USAGE') AS usage`, [
          login,
        ]),
        login,
      ).toEqual({ usage: false });
    }
  });

  it('no login is a superuser, makes databases or roles, replicates, skips row-level security, or belongs to another role', async () => {
    const rows = await tested.db.rows<{ rolname: string; powers: string[] }>(
      `SELECT rolname, array_remove(ARRAY[
         CASE WHEN rolsuper THEN 'superuser' END, CASE WHEN rolcreatedb THEN 'createdb' END,
         CASE WHEN rolcreaterole THEN 'createrole' END, CASE WHEN rolreplication THEN 'replication' END,
         CASE WHEN rolbypassrls THEN 'bypassrls' END], NULL) AS powers
       FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname`,
      [logins],
    );
    expect(rows).toEqual([...logins].sort().map((rolname) => ({ rolname, powers: [] })));
    const memberships = await tested.db.one<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_auth_members m
       WHERE m.member IN (SELECT oid FROM pg_roles WHERE rolname = ANY($1))
          OR m.roleid IN (SELECT oid FROM pg_roles WHERE rolname = ANY($1))`,
      [logins],
    );
    expect(memberships.count).toBe(0);
  });
});

describe('the API (adms_api)', () => {
  it('writes configuration, inserts field events and corrects their captured columns', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    expect(
      await db.run(
        `INSERT INTO "contractor" ("name", "kind") VALUES ('Rivera Trucking', 'HAULER')`,
      ),
    ).toBe(1);
    expect(
      await db.run(`UPDATE "project" SET "closed_at" = '2027-03-31T23:59:00Z' WHERE "id" = $1`, [
        world.p2,
      ]),
    ).toBe(1);
    expect(await db.run(...eventInsertOf(fieldEventLike(world, { ticket_number: '101003' })))).toBe(
      1,
    );
    expect(
      await db.run(`UPDATE "field_event" SET "load_call" = 70 WHERE "id" = $1`, [
        world.loads.l101001.disposal,
      ]),
    ).toBe(1);
    expect(
      await db.run(
        `INSERT INTO "invoice_lock" ("completed_load_id", "locked_by_id", "project_id") VALUES ($1, $2, $3)`,
        [world.loads.l101001.completedLoad, world.admin, world.p1],
      ),
    ).toBe(1);
  });

  it.each([
    ["sets a status (the worker's)", `UPDATE "field_event" SET "status" = 'VOID' WHERE "id" = $1`],
    [
      "sets reconciled_at (the worker's)",
      `UPDATE "field_event" SET "reconciled_at" = now() WHERE "id" = $1`,
    ],
    ['changes the received time', `UPDATE "field_event" SET "received_at" = now() WHERE "id" = $1`],
    ['changes an id', `UPDATE "field_event" SET "id" = uuidv7() WHERE "id" = $1`],
  ])('is refused when it %s', async (_, sql) => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    expect((await db.refused(sql, [world.loads.l101001.disposal])).code).toBe(refusedBy.grant);
  });

  it("may not write a completed load, a transaction, an invoice lock's change or the audit", async () => {
    const { db, world } = tested;
    const load = world.loads.l101001;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    const attempts: [string, unknown[]][] = [
      [
        `INSERT INTO "completed_load" ("project_id", "ticket_number", "disposal_event_id", "quantity_source", "weight_is_share", "updated_at")
         VALUES ($1, '101009', $2, 'LOAD_CALL', false, now())`,
        [world.p1, load.disposal],
      ],
      [
        `UPDATE "completed_load" SET "ticket_number" = '101009' WHERE "id" = $1`,
        [load.completedLoad],
      ],
      insertOf('transaction', transactionLike(world)),
      [`UPDATE "transaction" SET "amount" = 0 WHERE "id" = $1`, [world.transaction]],
      [`DELETE FROM "transaction" WHERE "id" = $1`, [world.transaction]],
      [
        `INSERT INTO "audit_record" ("table_name", "record_id", "operation", "source", "domain")
         VALUES ('project', 'x', 'INSERT', 'SYSTEM', 'OPERATIONS')`,
        [],
      ],
    ];
    for (const [sql, values] of attempts) {
      expect((await db.refused(sql, values)).code, sql).toBe(refusedBy.grant);
    }
    await db.run(
      `INSERT INTO "invoice_lock" ("completed_load_id", "locked_by_id", "project_id") VALUES ($1, $2, $3)`,
      [load.completedLoad, world.admin, world.p1],
    );
    // It writes the unlock on a lock's row (ADR-363); what was locked, by whom and when it may
    // not change.
    const change = await db.refused(
      `UPDATE "invoice_lock" SET "locked_at" = now() WHERE "completed_load_id" = $1`,
      [load.completedLoad],
    );
    expect(change.code).toBe(refusedBy.trigger);
  });
});

describe('the worker (adms_worker)', () => {
  it('sets the reconciliation columns, writes completed loads and transactions', async () => {
    const { db, world } = tested;
    const load = world.loads.l101001;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      await db.run(
        `UPDATE "field_event" SET "status" = 'COMPLETED', "reconciled_at" = now() WHERE "id" = $1`,
        [load.disposal],
      ),
    ).toBe(1);
    expect(
      await db.run(`UPDATE "completed_load" SET "updated_at" = now() WHERE "id" = $1`, [
        load.completedLoad,
      ]),
    ).toBe(1);
    expect(await db.run(...insertOf('transaction', transactionLike(world)))).toBe(1);
    expect(await db.rows(`SELECT 1 FROM "audit_record" LIMIT 1`)).toHaveLength(1);
  });

  it('may not correct evidence, change configuration, change a transaction, lock or write the audit', async () => {
    const { db, world } = tested;
    const load = world.loads.l101001;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    const attempts: [string, unknown[]][] = [
      [`UPDATE "field_event" SET "load_call" = 100 WHERE "id" = $1`, [load.disposal]],
      [`UPDATE "field_event" SET "ticket_number" = '101099' WHERE "id" = $1`, [load.collection]],
      eventInsertOf(fieldEventLike(world, { ticket_number: '101003' })),
      insertOf('project', projectLike(world)),
      insertOf('client', { name: 'Town of Egret Point' }),
      [`UPDATE "project" SET "closed_at" = now() WHERE "id" = $1`, [world.p1]],
      [`UPDATE "client" SET "contact_phone" = '555-0142' WHERE "id" = $1`, [world.client]],
      [
        `UPDATE "declaration_event" SET "name" = 'Delphine' WHERE "id" = $1`,
        [world.declarationEvent],
      ],
      [
        `UPDATE "project_kind_of_work" SET "archived_at" = now() WHERE "project_id" = $1`,
        [world.p1],
      ],
      insertOf('contractor', { name: 'Rivera Trucking', kind: 'HAULER' }),
      insertOf('project_contractor', primeOn(world.p2, world.summit)),
      insertOf('contract', { project_id: world.p1, name: 'A second', prime_id: world.coastline }),
      [`UPDATE "project_contractor" SET "archived_at" = now() WHERE "project_id" = $1`, [world.p1]],
      [
        `UPDATE "contract" SET "name" = 'Another name' WHERE "id" = $1`,
        [world.contracts.coastlineP1],
      ],
      [`UPDATE "user" SET "name" = 'Someone else' WHERE "id" = $1`, [world.monitor]],
      [`UPDATE "transaction" SET "amount" = 0 WHERE "id" = $1`, [world.transaction]],
      [
        `INSERT INTO "invoice_lock" ("completed_load_id", "locked_by_id", "project_id") VALUES ($1, $2, $3)`,
        [load.completedLoad, world.admin, world.p1],
      ],
      [
        `INSERT INTO "audit_record" ("table_name", "record_id", "operation", "source", "domain")
         VALUES ('project', 'x', 'INSERT', 'SYSTEM', 'OPERATIONS')`,
        [],
      ],
    ];
    for (const [sql, values] of attempts) {
      expect((await db.refused(sql, values)).code, sql).toBe(refusedBy.grant);
    }
  });
});

describe('the read-only login (adms_readonly)', () => {
  // No viewer view shows them, so none is granted (ADR-281, 286, 315).
  it.each(unseenTables)('AC-02-68 may not read %s', async (table) => {
    const { db } = tested;
    await db.as('adms_readonly');
    expect((await db.refused(`SELECT 1 FROM "${table}"`)).code).toBe(refusedBy.grant);
  });

  // A setup table a viewer sees is granted, and shows nothing until a viewer is stated (ADR-315).
  it.each(viewedTables)('reads no row of %s with no viewer stated', async (table) => {
    const { db } = tested;
    await db.noViewer();
    await db.as('adms_readonly');
    expect(await db.rows(`SELECT 1 FROM "${table}"`)).toEqual([]);
    expect(await db.rows(`SELECT 1 FROM "viewer_${table}"`)).toEqual([]);
  });

  it('AC-02-67 may not write anything', async () => {
    const { db, world } = tested;
    await db.as('adms_readonly');
    await db.actor(world.admin, 'BACK_OFFICE');
    const attempts: [string, unknown[]][] = [
      insertOf('project', projectLike(world)),
      insertOf('client', { name: 'Town of Egret Point' }),
      [`UPDATE "field_event" SET "load_call" = 1`, []],
      [`UPDATE "viewer_project" SET "name" = 'P3'`, []],
      [`DELETE FROM "transaction"`, []],
    ];
    for (const [sql, values] of attempts) {
      expect((await db.refused(sql, values)).code, sql).toBe(refusedBy.grant);
    }
  });
});

describe('only the owner changes the schema', () => {
  it.each(['adms_api', 'adms_worker', 'adms_readonly'] as const)(
    '%s may not create, alter, drop or truncate',
    async (login) => {
      const { db } = tested;
      await db.as(login);
      for (const sql of [
        `CREATE TABLE "guard_test_table" ("id" int)`,
        `CREATE FUNCTION "guard_test_function"() RETURNS int LANGUAGE sql AS 'SELECT 1'`,
        `ALTER TABLE "field_event" DROP CONSTRAINT "field_event_load_call_check"`,
        `DROP TRIGGER "project_refuse_delete" ON "project"`,
        `TRUNCATE "project"`,
      ]) {
        expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
      }
    },
  );

  it('the owner may create a table (the migrations run as it)', async () => {
    const { db } = tested;
    await db.as('adms_owner');
    await db.run(`CREATE TABLE "guard_test_table" ("id" int)`);
  });
});
