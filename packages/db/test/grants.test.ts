// REQ-009: the logins' least-privilege grants, every grant and every refusal (ARCHITECTURE §5.1;
// ADR-270 (2)). The first tests read the grants exactly as the catalog holds them, so a grant
// added anywhere fails here; the rest try each write as each login.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf, primeOn, projectLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { listTables } from './support/lists.ts';

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
  assignment: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  pay_item: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // A pay item's rate for each prime, and a crew day's steps (ADR-309).
  pay_item_rate: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  pay_item_crew_day_step: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  assignment_pay_item: { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' },
  // The firm's lists: configuration, each one (ADR-302).
  ...Object.fromEntries(
    listTables.map((table) => [table, { adms_api: 'INSERT SELECT UPDATE', adms_worker: 'SELECT' }]),
  ),
  // A version is added, never edited, and the worker has no business reading it (ADR-281).
  master_passcode: { adms_api: 'INSERT SELECT' },
  // The API writes people, so the Monitor ID's default runs as it (ADR-281).
  monitor_number_seq: { adms_api: 'USAGE' },
  field_event: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  completed_load: { adms_api: 'SELECT', adms_worker: 'INSERT SELECT UPDATE' },
  transaction: { adms_api: 'SELECT', adms_worker: 'DELETE INSERT SELECT' },
  invoice_lock: { adms_api: 'INSERT SELECT', adms_worker: 'SELECT' },
  audit_record: { adms_api: 'SELECT', adms_worker: 'SELECT' },
  viewer_project: { adms_readonly: 'SELECT' },
  viewer_field_event: { adms_readonly: 'SELECT' },
  viewer_completed_load: { adms_readonly: 'SELECT' },
  viewer_transaction: { adms_readonly: 'SELECT' },
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
];
// What the viewer views show, read through their base tables (row-level security applies there).
const viewerColumns: Record<string, string[]> = {
  project: ['id', 'name', 'time_zone', 'created_at', 'closed_at'],
  field_event: [
    'id',
    ...captured.slice(0, 10),
    'received_at',
    'end_latitude',
    'end_longitude',
    'load_call',
    'status',
    'reconciled_at',
  ],
  completed_load: [
    'id',
    'project_id',
    'ticket_number',
    'collection_event_id',
    'disposal_event_id',
    'created_at',
    'updated_at',
  ],
  transaction: [
    'id',
    'completed_load_id',
    'slot',
    'quantity',
    'rate',
    'amount',
    'prime_id',
    'created_at',
  ],
};
const columnGrants = [
  ...captured.map((column) => `field_event.${column} adms_api UPDATE`),
  'field_event.status adms_worker UPDATE',
  'field_event.reconciled_at adms_worker UPDATE',
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
  'viewer_sees_load_project adms_readonly EXECUTE',
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
    const rows = await tested.db.rows<{ grant: string }>(
      `SELECT c.relname || '.' || att.attname || ' ' || ${grantee} || ' ' || a.privilege_type AS grant
       FROM pg_class c
       JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum > 0 AND NOT att.attisdropped
       CROSS JOIN LATERAL aclexplode(att.attacl) a
       WHERE c.relnamespace = 'public'::regnamespace AND a.grantee <> c.relowner`,
    );
    expect(rows.map((row) => row.grant).sort()).toEqual(columnGrants);
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
    expect(
      await db.run(
        `INSERT INTO "field_event" ("id", "project_id", "workflow", "kind", "ticket_number",
           "monitor_id", "device_id", "assignment_id", "setup_version", "started_at", "ended_at",
           "device_utc_offset_minutes")
         VALUES (uuidv7(), $1, 'LOAD', 'COLLECTION', '101003', $2, $3, $4, 1,
           '2026-10-12T15:00:00Z', '2026-10-12T15:20:00Z', -240)`,
        [world.p1, world.monitor, world.device, world.assignments.p1],
      ),
    ).toBe(1);
    expect(
      await db.run(`UPDATE "field_event" SET "load_call" = 70 WHERE "id" = $1`, [
        world.loads.l101001.disposal,
      ]),
    ).toBe(1);
    expect(
      await db.run(
        `INSERT INTO "invoice_lock" ("completed_load_id", "locked_by_id") VALUES ($1, $2)`,
        [world.loads.l101001.completedLoad, world.admin],
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
        `INSERT INTO "completed_load" ("project_id", "ticket_number", "collection_event_id", "disposal_event_id", "updated_at")
         VALUES ($1, '101009', $2, $3, now())`,
        [world.p1, load.collection, load.disposal],
      ],
      [
        `UPDATE "completed_load" SET "ticket_number" = '101009' WHERE "id" = $1`,
        [load.completedLoad],
      ],
      [
        `INSERT INTO "transaction" ("completed_load_id", "slot", "quantity", "rate", "amount", "prime_id")
         VALUES ($1, 2, 1, 1, 1, $2)`,
        [load.completedLoad, world.coastline],
      ],
      [`UPDATE "transaction" SET "amount" = 0 WHERE "id" = $1`, [load.transaction]],
      [`DELETE FROM "transaction" WHERE "id" = $1`, [load.transaction]],
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
      `INSERT INTO "invoice_lock" ("completed_load_id", "locked_by_id") VALUES ($1, $2)`,
      [load.completedLoad, world.admin],
    );
    const change = await db.refused(
      `UPDATE "invoice_lock" SET "locked_at" = now() WHERE "completed_load_id" = $1`,
      [load.completedLoad],
    );
    expect(change.code).toBe(refusedBy.grant);
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
    expect(
      await db.run(
        `INSERT INTO "transaction" ("completed_load_id", "slot", "quantity", "rate", "amount", "prime_id")
         VALUES ($1, 2, 52, 1.5, 78, $2)`,
        [load.completedLoad, world.coastline],
      ),
    ).toBe(1);
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
      [
        `INSERT INTO "field_event" ("id", "project_id", "workflow", "kind", "ticket_number",
           "monitor_id", "device_id", "assignment_id", "setup_version", "started_at", "ended_at",
           "device_utc_offset_minutes")
         VALUES (uuidv7(), $1, 'LOAD', 'COLLECTION', '101003', $2, $3, $4, 1, now(), now(), -240)`,
        [world.p1, world.monitor, world.device, world.assignments.p1],
      ],
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
      [`UPDATE "transaction" SET "amount" = 0 WHERE "id" = $1`, [load.transaction]],
      [
        `INSERT INTO "invoice_lock" ("completed_load_id", "locked_by_id") VALUES ($1, $2)`,
        [load.completedLoad, world.admin],
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
  // The new tables too: no viewer view shows them, so none is granted (ADR-281, 286, 302, 303, 305,
  // 308, 309, 311).
  it.each([
    'user',
    'client',
    'declaration_event',
    'project_kind_of_work',
    'contractor',
    'project_contractor',
    'contract',
    'form',
    'form_debris_type',
    'form_definition',
    'device',
    'invoice_lock',
    'audit_record',
    'master_passcode',
    'number_block',
    'disposal_site',
    'disposal_site_label',
    'disposal_site_tipping_fee',
    'site_area_version',
    'map_version',
    'zone',
    'assignment',
    'pay_item',
    'pay_item_rate',
    'pay_item_crew_day_step',
    'assignment_pay_item',
    ...listTables,
  ])('may not read %s', async (table) => {
    const { db } = tested;
    await db.as('adms_readonly');
    expect((await db.refused(`SELECT 1 FROM "${table}"`)).code).toBe(refusedBy.grant);
  });

  it('may not write anything', async () => {
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
