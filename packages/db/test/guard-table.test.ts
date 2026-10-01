// One line guards a new table, and guard_gaps() lists any table that isn't (ADR-271). The tables
// here are made by the owner, as a migration would, inside the test's rolled-back work.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

async function gaps(): Promise<string[]> {
  const rows = await tested.db.rows<{ table_name: string; gap: string }>(
    'SELECT table_name, gap FROM guard_gaps()',
  );
  return rows.map((row) => `${row.table_name}: ${row.gap}`);
}

// A new table, as its generated migration would make it.
async function newTable(name: string, columns: string): Promise<void> {
  await tested.db.as('adms_owner');
  await tested.db.run(
    `CREATE TABLE "${name}" ("id" uuid PRIMARY KEY DEFAULT uuidv7(), ${columns},
       "created_at" timestamptz NOT NULL DEFAULT now())`,
  );
}

async function grantsOn(table: string): Promise<string[]> {
  const rows = await tested.db.rows<{ grant: string }>(
    `SELECT pg_get_userbyid(a.grantee) || ' ' || a.privilege_type AS grant
     FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
     WHERE c.oid = $1::regclass AND a.grantee <> c.relowner
     UNION ALL
     SELECT pg_get_userbyid(a.grantee) || ' ' || a.privilege_type || ' (' || att.attname || ')'
     FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
     WHERE att.attrelid = $1::regclass AND att.attnum > 0`,
    [table],
  );
  return rows.map((row) => row.grant).sort();
}

describe('guard_gaps()', () => {
  it('is empty on the installed database', async () => {
    expect(await gaps()).toEqual([]);
  });

  it('lists a new table until guard_table guards it', async () => {
    await newTable('guard_test_setup', `"name" text NOT NULL`);
    expect(await gaps()).toEqual([
      'guard_test_setup: deletes not refused',
      'guard_test_setup: no audit trigger',
      "guard_test_setup: no grants: the API can't read it",
      'guard_test_setup: truncate not refused',
    ]);
    await tested.db.run(`SELECT guard_table('guard_test_setup', 'CONFIGURATION', 'OPERATIONS')`);
    expect(await gaps()).toEqual([]);
  });

  it.each([
    ['DROP TRIGGER "project_refuse_delete" ON "project"', 'project: deletes not refused'],
    [
      'DROP TRIGGER "field_event_refuse_truncate" ON "field_event"',
      'field_event: truncate not refused',
    ],
    ['DROP TRIGGER "user_audit" ON "user"', 'user: no audit trigger'],
    ['ALTER TABLE "device" DISABLE TRIGGER "device_audit"', 'device: no audit trigger'],
    [
      'DROP TRIGGER "transaction_delete_to_audit" ON "transaction"',
      'transaction: deletes not refused',
    ],
    [
      'DROP TRIGGER "audit_record_refuse_change" ON "audit_record"',
      'audit_record: deletes not refused',
    ],
    [
      'REVOKE SELECT ON "invoice_lock" FROM adms_api',
      "invoice_lock: no grants: the API can't read it",
    ],
  ])('lists a guard taken away: %s', async (sql, gap) => {
    await tested.db.as('adms_owner');
    await tested.db.run(sql);
    expect(await gaps()).toEqual([gap]);
  });
});

describe('guard_table', () => {
  it('a configuration or mark table: the API writes, the worker reads, nothing deleted, audited', async () => {
    const { db, world } = tested;
    for (const kind of ['CONFIGURATION', 'MARK']) {
      const table = `guard_test_${kind.toLowerCase()}`;
      await newTable(table, `"name" text NOT NULL`);
      await db.run(`SELECT guard_table($1, $2, 'OPERATIONS')`, [table, kind]);
      expect(await grantsOn(table), kind).toEqual([
        'adms_api INSERT',
        'adms_api SELECT',
        'adms_api UPDATE',
        'adms_worker SELECT',
      ]);
      await db.as('adms_api');
      await db.actor(world.admin, 'BACK_OFFICE');
      const { id } = await db.one<{ id: string }>(
        `INSERT INTO "${table}" ("name") VALUES ('Marsh Road TDSR') RETURNING id::text`,
      );
      await db.run(`UPDATE "${table}" SET "name" = 'Bayline County Landfill' WHERE "id" = $1`, [
        id,
      ]);
      const audited = await db.rows<{ operation: string; domain: string }>(
        `SELECT "operation"::text, "domain"::text FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
        [id],
      );
      expect(audited, kind).toEqual([
        { operation: 'INSERT', domain: 'OPERATIONS' },
        { operation: 'UPDATE', domain: 'OPERATIONS' },
      ]);
      await db.as('adms_owner');
      expect((await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id])).code, kind).toBe(
        refusedBy.trigger,
      );
      expect((await db.refused(`TRUNCATE "${table}"`)).code, kind).toBe(refusedBy.trigger);
    }
  });

  it('a derived table: the worker writes, the API reads', async () => {
    const { db, world } = tested;
    await newTable('guard_test_derived', `"amount" numeric(14, 2) NOT NULL`);
    await db.run(`SELECT guard_table('guard_test_derived', 'DERIVED', 'BILLING')`);
    expect(await grantsOn('guard_test_derived')).toEqual([
      'adms_api SELECT',
      'adms_worker INSERT',
      'adms_worker SELECT',
      'adms_worker UPDATE',
    ]);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    await db.run(`INSERT INTO "guard_test_derived" ("amount") VALUES (254.80)`);
    await db.as('adms_api');
    expect((await db.refused(`INSERT INTO "guard_test_derived" ("amount") VALUES (1)`)).code).toBe(
      refusedBy.grant,
    );
  });

  it('an evidence table: the API corrects the captured columns, the worker only its own', async () => {
    const { db, world } = tested;
    await newTable(
      'guard_test_evidence',
      `"reading" int, "received_at" timestamptz NOT NULL DEFAULT now(), "status" text`,
    );
    await db.run(
      `SELECT guard_table('guard_test_evidence', 'EVIDENCE', 'RECORDS', ARRAY['status'])`,
    );
    expect(await grantsOn('guard_test_evidence')).toEqual([
      'adms_api INSERT',
      'adms_api SELECT',
      'adms_api UPDATE (reading)',
      'adms_worker SELECT',
      'adms_worker UPDATE (status)',
    ]);
    await db.as('adms_api');
    await db.actor(world.admin, 'DEVICE', { deviceId: world.device });
    const { id } = await db.one<{ id: string }>(
      `INSERT INTO "guard_test_evidence" ("reading") VALUES (80) RETURNING id::text`,
    );
    await db.run(`UPDATE "guard_test_evidence" SET "reading" = 70 WHERE "id" = $1`, [id]);
    for (const column of ['status', 'received_at', 'created_at', 'id']) {
      expect(
        (
          await db.refused(
            `UPDATE "guard_test_evidence" SET "${column}" = "${column}" WHERE "id" = $1`,
            [id],
          )
        ).code,
        column,
      ).toBe(refusedBy.grant);
    }
    await db.as('adms_worker');
    await db.run(`UPDATE "guard_test_evidence" SET "status" = 'COMPLETED' WHERE "id" = $1`, [id]);
    expect(
      (await db.refused(`UPDATE "guard_test_evidence" SET "reading" = 1 WHERE "id" = $1`, [id]))
        .code,
    ).toBe(refusedBy.grant);
  });

  it('an evidence column added later is a gap until guard_table is rerun', async () => {
    const { db } = tested;
    await newTable('guard_test_evidence', `"reading" int`);
    await db.run(`SELECT guard_table('guard_test_evidence', 'EVIDENCE', 'RECORDS')`);
    await db.run(`ALTER TABLE "guard_test_evidence" ADD COLUMN "note" text`);
    expect(await gaps()).toEqual([
      "guard_test_evidence: column note can't be corrected: rerun guard_table",
    ]);
    await db.run(`SELECT guard_table('guard_test_evidence', 'EVIDENCE', 'RECORDS')`);
    expect(await gaps()).toEqual([]);
    expect(await grantsOn('guard_test_evidence')).toContain('adms_api UPDATE (note)');
  });

  it('refuses its mistakes', async () => {
    const { db } = tested;
    await newTable('guard_test_setup', `"name" text`);
    for (const [call, message] of [
      [
        `guard_table('guard_test_missing', 'CONFIGURATION', 'OPERATIONS')`,
        'there is no table guard_test_missing',
      ],
      [`guard_table('transaction', 'DERIVED', 'BILLING')`, 'transaction has its own guards'],
      [`guard_table('audit_record', 'DERIVED', 'SECURITY')`, 'audit_record has its own guards'],
      [`guard_table('guard_test_setup', 'SETUP', 'OPERATIONS')`, 'SETUP is not a kind of record'],
      [
        `guard_table('guard_test_setup', 'CONFIGURATION', 'OPERATIONS', ARRAY['name'])`,
        "only an evidence table names the worker's columns",
      ],
      [
        `guard_table('guard_test_setup', 'EVIDENCE', 'RECORDS', ARRAY['status'])`,
        'guard_test_setup has no column status',
      ],
    ] as const) {
      expect((await db.refused(`SELECT ${call}`)).message, call).toContain(message);
    }
  });

  it("is the owner's alone, like guard_gaps()", async () => {
    const { db } = tested;
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      for (const call of [
        `guard_table('project', 'CONFIGURATION', 'OPERATIONS')`,
        'guard_gaps()',
      ]) {
        expect((await db.refused(`SELECT * FROM ${call}`)).code, `${login}: ${call}`).toBe(
          refusedBy.grant,
        );
      }
    }
  });
});
