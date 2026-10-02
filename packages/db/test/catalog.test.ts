// The guards as the catalog holds them (ADR-270, 271): every trigger, check, policy and viewer
// view, exactly. A guard dropped, disabled, made conditional or loosened fails here even where no
// behaviour test happens to reach it; the other files show each one working.
import { describe, expect, it } from 'vitest';

import { eachTestRolledBack } from './support/lifecycle.ts';
import { listTables } from './support/lists.ts';

const tested = eachTestRolledBack();

// Each guarded table and its audit domain (ADR-270 (4)).
const domains: Record<string, string> = {
  project: 'OPERATIONS',
  // Who is paying, what happened, a project's kinds of unit rate work (ADR-303).
  client: 'OPERATIONS',
  declaration_event: 'OPERATIONS',
  project_kind_of_work: 'OPERATIONS',
  contractor: 'OPERATIONS',
  user: 'SECURITY',
  device: 'SECURITY',
  disposal_site: 'OPERATIONS',
  number_block: 'OPERATIONS',
  assignment: 'OPERATIONS',
  // Where a rate will live: its changes are the billing reviewer's to read (ADR-286).
  pay_item: 'BILLING',
  assignment_pay_item: 'OPERATIONS',
  master_passcode: 'SECURITY',
  field_event: 'RECORDS',
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
const policies = [
  ...['completed_load', 'field_event', 'project', 'transaction'].map(
    (table) => `${table}_services PERMISSIVE {adms_api,adms_worker} ALL USING true CHECK true`,
  ),
  `completed_load_viewer PERMISSIVE {adms_readonly} SELECT USING ${viewerQual}`,
  `field_event_viewer PERMISSIVE {adms_readonly} SELECT USING ${viewerQual}`,
  'project_viewer PERMISSIVE {adms_readonly} SELECT USING viewer_sees_project(id)',
  'transaction_viewer PERMISSIVE {adms_readonly} SELECT USING (viewer_sees_load_project(completed_load_id) AND (viewer_sees_every_ticket() OR viewer_is_contractor(prime_id)))',
].sort();

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
        name: 'assignment_origin_check',
        definition:
          "CHECK ((((origin = 'PLANNED'::assignment_origin) AND (made_by_id IS NOT NULL)) OR ((origin = 'UNPLANNED'::assignment_origin) AND (made_by_id IS NULL) AND (device_id IS NOT NULL))))",
      },
      {
        name: 'assignment_system_actor_check',
        definition:
          "CHECK (((person_id <> '00000000-0000-7000-8000-000000000001'::uuid) AND (made_by_id IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'::uuid)))",
      },
      {
        name: 'device_out_of_service_check',
        definition: "CHECK (((status = 'ACTIVE'::device_status) = (out_of_service_at IS NULL)))",
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
        name: 'field_event_monitor_check',
        definition: "CHECK ((monitor_id <> '00000000-0000-7000-8000-000000000001'::uuid))",
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
        name: 'project_active_window_check',
        definition: 'CHECK (((active_to IS NULL) OR (active_to >= active_from)))',
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
        name: 'user_system_actor_check',
        definition:
          "CHECK (((role <> 'SYSTEM'::user_role) OR ((id = '00000000-0000-7000-8000-000000000001'::uuid) AND (monitor_number IS NULL) AND (contractor_id IS NULL))))",
      },
      {
        name: 'user_system_actor_employer_check',
        definition:
          "CHECK (((role <> 'SYSTEM'::user_role) OR ((employer_id IS NULL) AND (employer_number IS NULL))))",
      },
      ...listChecks,
    ];
    expect(rows).toEqual(checks.sort((a, b) => (a.name < b.name ? -1 : 1)));
  });

  it('row-level security on the four project-scoped tables only, with exactly their policies', async () => {
    const secured = await tested.db.rows<{ name: string; forced: boolean }>(
      `SELECT relname AS name, relforcerowsecurity AS forced FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') AND relrowsecurity
       ORDER BY relname`,
    );
    expect(secured).toEqual(
      ['completed_load', 'field_event', 'project', 'transaction'].map((name) => ({
        name,
        forced: false,
      })),
    );
    const rows = await tested.db.rows<{ policy: string }>(
      `SELECT policyname || ' ' || permissive || ' ' || roles::text || ' ' || cmd
         || coalesce(' USING ' || qual, '') || coalesce(' CHECK ' || with_check, '') AS policy
       FROM pg_policies WHERE schemaname = 'public'`,
    );
    expect(rows.map((row) => row.policy).sort()).toEqual(policies);
  });

  it('the viewer views run as the viewer, behind a security barrier', async () => {
    const rows = await tested.db.rows<{ name: string; options: string[] }>(
      `SELECT relname AS name, reloptions AS options FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind IN ('v', 'm') ORDER BY relname`,
    );
    expect(rows).toEqual(
      ['viewer_completed_load', 'viewer_field_event', 'viewer_project', 'viewer_transaction'].map(
        (name) => ({ name, options: ['security_invoker=true', 'security_barrier=true'] }),
      ),
    );
  });

  it("only three functions run with the owner's rights, and every function pins its search path", async () => {
    const rows = await tested.db.rows<{ name: string; definer: boolean; config: string[] | null }>(
      `SELECT proname AS name, prosecdef AS definer, proconfig AS config FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace ORDER BY proname`,
    );
    expect(rows.filter((row) => row.definer).map((row) => row.name)).toEqual([
      'audit_capture',
      'transaction_delete_to_audit',
      'viewer_sees_load_project',
    ]);
    expect(
      rows.filter((row) => !(row.config ?? []).includes('search_path=pg_catalog, public')),
    ).toEqual([]);
  });
});
