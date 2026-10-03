// Part 2, section I at the database (spec/acceptance/02-people-and-devices.md): what a read-only
// viewer's record says, and what a client user and an auditor see of a project's setup
// (spec/DATA-MODEL.md §2.2; ARCHITECTURE §5.5; ADR-050, 169, 315; BACKLOG C18, C54). The tickets
// a viewer sees: row-level-security.test.ts. Stating the viewer on every read is the API's (C22).
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { given, insertOf, viewerLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { viewedTables } from './support/viewers.ts';

const tested = eachTestRolledBack();

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

async function add(table: string, row: Record<string, unknown>): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf(table, row))).id;
}

// What the read-only login reads from a viewer view, for the viewer stated: one column, in order.
async function reads(viewerId: string, view: string, column: string): Promise<string[]> {
  const { db } = tested;
  await db.viewer(viewerId);
  await db.as('adms_readonly');
  const rows = await db.rows<{ value: string }>(
    `SELECT "${column}"::text AS value FROM "${view}" ORDER BY 1`,
  );
  await db.administer();
  return rows.map((row) => row.value);
}

async function counts(viewerId: string, views: readonly string[]): Promise<Record<string, number>> {
  const { db } = tested;
  await db.viewer(viewerId);
  await db.as('adms_readonly');
  const found: Record<string, number> = {};
  for (const view of views) {
    found[view] = (
      await db.one<{ count: number }>(`SELECT count(*)::int AS count FROM "${view}"`)
    ).count;
  }
  await db.administer();
  return found;
}

describe("a read-only viewer's record", () => {
  it('AC-02-69 says what kind of viewer they are, and only a read-only viewer says so', async () => {
    const { db } = tested;
    const kinds = await db.rows<{ value: string }>(
      `SELECT enumlabel AS value FROM pg_enum WHERE enumtypid = 'viewer_kind'::regtype ORDER BY enumsortorder`,
    );
    expect(kinds.map((kind) => kind.value)).toEqual(['CLIENT', 'CONTRACTOR', 'AUDITOR']);
    await asTheApi();
    await add('user', viewerLike('Bayline County finance', 'CLIENT'));
    const noKind = await db.refused(
      ...insertOf('user', { name: 'Bayline County finance', role: 'READ_ONLY_VIEWER' }),
    );
    expect(noKind.code).toBe(refusedBy.check);
    expect(noKind.message).toContain('"user_viewer_kind_check"');
    for (const role of ['ADMIN', 'MANAGER_ANALYST', 'MONITOR']) {
      const kept = await db.refused(
        ...insertOf('user', { name: 'Luis Ortega', role, viewer_kind: 'AUDITOR' }),
      );
      expect(kept.code, role).toBe(refusedBy.check);
      expect(kept.message, role).toContain('"user_viewer_kind_check"');
    }
  });

  it('AC-02-69 a contractor user names its contractor, and nobody else names one', async () => {
    const { db, world } = tested;
    await asTheApi();
    await add('user', viewerLike('Summit Debris Services viewer', 'CONTRACTOR', world.summit));
    const attempts: Record<string, unknown>[] = [
      viewerLike('Summit Debris Services viewer', 'CONTRACTOR'),
      viewerLike('Bayline County finance', 'CLIENT', world.summit),
      viewerLike('Auditor', 'AUDITOR', world.summit),
      { name: 'Luis Ortega', role: 'MANAGER_ANALYST', contractor_id: world.summit },
    ];
    for (const row of attempts) {
      const refusal = await db.refused(...insertOf('user', row));
      expect(refusal.code, JSON.stringify(row)).toBe(refusedBy.check);
    }
    // Nor does a contractor user lose its contractor later.
    const lost = await db.refused(`UPDATE "user" SET "contractor_id" = NULL WHERE "id" = $1`, [
      world.coastlineViewer,
    ]);
    expect(lost.message).toContain('"user_viewer_contractor_check"');
  });

  it('AC-02-69 says which projects they may see, each project once, audited with Dana as the actor', async () => {
    const { db, world } = tested;
    await asTheApi();
    const viewer = await add('user', viewerLike('Bayline County finance', 'CLIENT'));
    const p1 = await add('user_viewer_project', given(viewer, world.p1));
    await add('user_viewer_project', given(viewer, world.p2));
    const twice = await db.refused(...insertOf('user_viewer_project', given(viewer, world.p1)));
    expect(twice.code).toBe(refusedBy.unique);
    expect(twice.message).toContain('"user_viewer_project_user_id_project_id_key"');
    expect(
      (await db.refused(...insertOf('user_viewer_project', given(viewer, world.client)))).code,
    ).toBe(refusedBy.foreignKey);
    expect(
      (await db.refused(...insertOf('user_viewer_project', given(world.worker, world.p1)))).message,
    ).toContain('"user_viewer_project_system_actor_check"');
    expect(
      await db.one(
        `SELECT "actor_id"::text, "domain"::text, "operation"::text FROM "audit_record"
         WHERE "table_name" = 'user_viewer_project' AND "record_id" = $1`,
        [p1],
      ),
    ).toEqual({ actor_id: world.admin, domain: 'SECURITY', operation: 'INSERT' });
  });

  it('AC-02-69 a project is taken away by archiving, never deleted; only the API writes one', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      await db.run(
        `UPDATE "user_viewer_project" SET "archived_at" = now() WHERE "user_id" = $1 AND "project_id" = $2`,
        [world.auditor, world.p2],
      ),
    ).toBe(1);
    const remove = `DELETE FROM "user_viewer_project" WHERE "user_id" = $1`;
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect((await db.refused(remove, [world.auditor])).code, login).toBe(refusedBy.grant);
    }
    await db.as('adms_owner');
    expect((await db.refused(remove, [world.auditor])).code).toBe(refusedBy.trigger);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      (await db.rows(`SELECT 1 FROM "user_viewer_project" WHERE "user_id" = $1`, [world.auditor]))
        .length,
    ).toBe(2);
    expect(
      (await db.refused(...insertOf('user_viewer_project', given(world.clientViewer, world.p2))))
        .code,
    ).toBe(refusedBy.grant);
    await db.as('adms_readonly');
    expect((await db.refused(`SELECT 1 FROM "user_viewer_project"`)).code).toBe(refusedBy.grant);
  });
});

describe("a project's setup, for a read-only viewer", () => {
  // What the example world's P1 holds, table by table; P2 holds its project, its prime and its
  // contract, and nothing else.
  const p1Setup = {
    viewer_project_setup: 1,
    viewer_client: 1,
    viewer_declaration_event: 1,
    viewer_project_kind_of_work: 5,
    viewer_contractor: 2,
    viewer_project_contractor: 2,
    viewer_contract: 2,
    viewer_form: 3,
    viewer_form_debris_type: 2,
    viewer_pay_item: 6,
    viewer_pay_item_rate: 6,
    viewer_disposal_site: 2,
    viewer_rule: 1,
    viewer_rule_criterion: 2,
    viewer_rule_criterion_pick: 1,
    viewer_rule_action: 1,
  };
  const views = Object.keys(p1Setup);

  it('AC-02-70 a client user sees the whole of their project’s setup, and none of another project’s', async () => {
    const { db, world } = tested;
    expect(await counts(world.clientViewer, views)).toEqual(p1Setup);
    expect(await reads(world.clientViewer, 'viewer_project_setup', 'name')).toEqual([
      'Bayline County ROW, Hurricane Delphine',
    ]);
    expect(await reads(world.clientViewer, 'viewer_client', 'name')).toEqual(['Bayline County']);
    expect(await reads(world.clientViewer, 'viewer_declaration_event', 'reference')).toEqual([
      'DR-9001-FL',
    ]);
    expect(await reads(world.clientViewer, 'viewer_contract', 'name')).toEqual([
      'Coastline, Bayline ROW 2026',
      'Summit, Bayline ROW 2026',
    ]);
    // Harbor Staffing is on no project of theirs.
    expect(await reads(world.clientViewer, 'viewer_contractor', 'name')).toEqual([
      'Coastline Haulers LLC',
      'Summit Debris Services',
    ]);
    expect(await reads(world.clientViewer, 'viewer_pay_item_rate', 'rate')).toEqual(
      ['110.0000', '150.0000', '185.0000', '68.0000', '7.5000', '95.0000'].sort(),
    );
    expect(await reads(world.clientViewer, 'viewer_disposal_site', 'name')).toEqual([
      'Bayline County Landfill',
      'Marsh Road TDSR',
    ]);
    // The project's settings, the load call limits among them.
    await db.viewer(world.clientViewer);
    await db.as('adms_readonly');
    expect(
      await db.one(
        `SELECT "load_call_low_limit", "load_call_high_limit", "time_zone", "time_clock_enabled"
         FROM "viewer_project_setup"`,
      ),
    ).toEqual({
      load_call_low_limit: 5,
      load_call_high_limit: 95,
      time_zone: 'America/New_York',
      time_clock_enabled: false,
    });
  });

  it('AC-02-70 a client user given only P2 sees P2’s setup, and nothing of P1’s', async () => {
    const { db, world } = tested;
    const { id: viewer } = await db.one<{ id: string }>(
      ...insertOf('user', viewerLike('Bayline County PPDR office', 'CLIENT')),
    );
    await db.run(...insertOf('user_viewer_project', given(viewer, world.p2)));
    expect(await counts(viewer, views)).toEqual({
      ...Object.fromEntries(views.map((view) => [view, 0])),
      viewer_project_setup: 1,
      viewer_client: 1,
      viewer_declaration_event: 1,
      viewer_contractor: 1,
      viewer_project_contractor: 1,
      viewer_contract: 1,
    });
    expect(await reads(viewer, 'viewer_contract', 'name')).toEqual([
      'Coastline, Bayline PPDR 2026',
    ]);
  });

  it('AC-02-70 an auditor sees the setup of every project they are given', async () => {
    const { world } = tested;
    expect(await counts(world.auditor, views)).toEqual({
      ...p1Setup,
      viewer_project_setup: 2,
      viewer_project_contractor: 3,
      viewer_contract: 3,
    });
  });

  it('AC-02-70 a client user and an auditor read the firm’s lists, the names setup picks from', async () => {
    const { db, world } = tested;
    expect(await reads(world.clientViewer, 'viewer_site_type', 'name')).toEqual(
      (await db.rows<{ name: string }>(`SELECT "name" FROM "site_type" ORDER BY 1`)).map(
        (row) => row.name,
      ),
    );
    expect(await reads(world.auditor, 'viewer_program_type', 'name')).toContain('PPDR');
  });

  it('a contractor user sees the project by name and nothing of its setup: no settings, pay items, rates, rules, sites or lists', async () => {
    const { db, world } = tested;
    const every = ['viewer_project_setup', ...viewedTables.map((table) => `viewer_${table}`)];
    expect(await counts(world.coastlineViewer, every)).toEqual(
      Object.fromEntries(every.map((view) => [view, 0])),
    );
    expect(await reads(world.coastlineViewer, 'viewer_project', 'name')).toEqual([
      'Bayline County ROW, Hurricane Delphine',
    ]);
    // Nor through the project's own table: the read-only login holds none of its settings.
    await db.viewer(world.coastlineViewer);
    await db.as('adms_readonly');
    expect((await db.refused(`SELECT "load_call_high_limit" FROM "project"`)).code).toBe(
      refusedBy.grant,
    );
  });

  it('with no viewer stated, or a person who is no viewer, shows nothing', async () => {
    const { db, world } = tested;
    const every = ['viewer_project_setup', ...viewedTables.map((table) => `viewer_${table}`)];
    const nothing = Object.fromEntries(every.map((view) => [view, 0]));
    await db.noViewer();
    await db.as('adms_readonly');
    for (const view of every) {
      expect(await db.rows(`SELECT 1 FROM "${view}"`), view).toEqual([]);
    }
    await db.administer();
    expect(await counts(world.admin, every)).toEqual(nothing);
    await db.run(`UPDATE "user" SET "archived_at" = now() WHERE "id" = $1`, [world.clientViewer]);
    expect(await counts(world.clientViewer, every)).toEqual(nothing);
  });

  it('AC-02-71 nothing a viewer can read shows a person’s phone number, an email or a contact', async () => {
    const { db, world } = tested;
    const readable = await db.rows<{ name: string }>(
      `SELECT c.relname || '.' || a.attname AS name
       FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
         AND has_column_privilege('adms_readonly', c.oid, a.attnum, 'SELECT')
         AND a.attname ~ '(^|_)(phone|email)$|^contact'`,
    );
    expect(readable).toEqual([]);
    await db.viewer(world.clientViewer);
    await db.as('adms_readonly');
    expect(Object.keys(await db.one(`SELECT * FROM "viewer_client"`))).toEqual([
      'id',
      'name',
      'created_at',
      'archived_at',
    ]);
    expect(
      Object.keys((await db.rows(`SELECT * FROM "viewer_contractor"`))[0] ?? {}).sort(),
    ).toEqual(['archived_at', 'created_at', 'id', 'kind', 'merged_into_id', 'name']);
    for (const sql of [
      `SELECT "contact_phone" FROM "client"`,
      `SELECT "contact_phone" FROM "contractor"`,
      `SELECT "notes" FROM "client"`,
      `SELECT "phone" FROM "user"`,
      `SELECT "name" FROM "user"`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
  });
});

describe('guard_viewer', () => {
  it('refuses a table that isn’t there, a sight it doesn’t know, and a column the table lacks', async () => {
    const { db } = tested;
    await db.as('adms_owner');
    for (const [call, message] of [
      [`guard_viewer('guard_test_missing', 'PROJECT')`, 'there is no table guard_test_missing'],
      [`guard_viewer('pay_item', 'EVERYONE')`, 'EVERYONE is not a sight'],
      [`guard_viewer('zone', 'PART_OF')`, 'name a relation and a column'],
      [
        `guard_viewer('pay_item', 'PROJECT', 'project', 'project_id')`,
        'name a relation and a column',
      ],
      [`guard_viewer('client', 'FIRM', hidden => ARRAY['fax'])`, 'client has no column fax'],
    ] as const) {
      expect((await db.refused(`SELECT ${call}`)).message, call).toContain(message);
    }
  });

  it('is safe to repeat, and is the owner’s alone', async () => {
    const { db, world } = tested;
    const policies = `SELECT count(*)::int AS count FROM pg_policies WHERE tablename = 'pay_item'`;
    await db.as('adms_owner');
    await db.run(`SELECT guard_viewer('pay_item', 'PROJECT')`);
    await db.administer();
    expect(await db.one(policies)).toEqual({ count: 2 });
    expect((await counts(world.clientViewer, ['viewer_pay_item']))['viewer_pay_item']).toBe(6);
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect((await db.refused(`SELECT guard_viewer('pay_item', 'PROJECT')`)).code, login).toBe(
        refusedBy.grant,
      );
    }
  });
});
