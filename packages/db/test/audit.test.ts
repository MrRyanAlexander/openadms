// REQ-011: every insert and update is audited by the database, with a required actor and source
// (ARCHITECTURE §5.3; invariant 3; ADR-270 (4)). REQ-012: audit_record is append-only, for
// everyone (ADR-270 (5)).
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf, projectLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

interface Audited {
  table_name: string;
  record_id: string;
  operation: string;
  prior_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_fields: string[];
  actor_id: string | null;
  device_id: string | null;
  source: string;
  reason: string | null;
  request_id: string | null;
  domain: string;
}

async function auditOf(recordId: string): Promise<Audited[]> {
  return tested.db.rows<Audited>(
    `SELECT "table_name", "record_id", "operation"::text, "prior_value", "new_value",
       "changed_fields", "actor_id"::text, "device_id"::text, "source"::text, "reason",
       "request_id", "domain"::text
     FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
    [recordId],
  );
}

describe('capture', () => {
  it('an insert: the whole row, every field, the actor and the source', async () => {
    const { db, world } = tested;
    const [inserted] = await auditOf(world.loads.l101001.disposal);
    const row = await db.one<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(e) AS row FROM "field_event" e WHERE "id" = $1`,
      [world.loads.l101001.disposal],
    );
    // The database sorts the fields by its collation; the set is what matters.
    expect({ ...inserted, changed_fields: inserted?.changed_fields.sort() }).toEqual({
      table_name: 'field_event',
      record_id: world.loads.l101001.disposal,
      operation: 'INSERT',
      prior_value: null,
      new_value: row.row,
      changed_fields: Object.keys(row.row).sort(),
      actor_id: world.admin,
      device_id: null,
      source: 'BACK_OFFICE',
      reason: null,
      request_id: null,
      domain: 'RECORDS',
    });
  });

  it('a correction: before and after, only the changed field, with device, reason and request', async () => {
    const { db, world } = tested;
    const disposal = world.loads.l101001.disposal;
    await db.as('adms_api');
    await db.actor(world.admin, 'DEVICE', {
      deviceId: world.device,
      reason: 'Tower called 70%, keyed 80%',
      requestId: 'req-7f3a',
    });
    await db.run(`UPDATE "field_event" SET "load_call" = 70 WHERE "id" = $1`, [disposal]);
    const [, corrected] = await auditOf(disposal);
    expect(corrected).toMatchObject({
      operation: 'UPDATE',
      changed_fields: ['load_call'],
      actor_id: world.admin,
      device_id: world.device,
      source: 'DEVICE',
      reason: 'Tower called 70%, keyed 80%',
      request_id: 'req-7f3a',
      domain: 'RECORDS',
    });
    expect(corrected?.prior_value?.['load_call']).toBe(80);
    expect(corrected?.new_value?.['load_call']).toBe(70);
    expect({ ...corrected?.prior_value, load_call: 70 }).toEqual(corrected?.new_value);
  });

  it('an update that changes nothing writes nothing, but still needs its actor', async () => {
    const { db, world } = tested;
    const project = world.p1;
    await db.as('adms_api');
    await db.run(`UPDATE "project" SET "name" = "name" WHERE "id" = $1`, [project]);
    expect(await auditOf(project)).toHaveLength(1);
    await db.noActor();
    const refusal = await db.refused(`UPDATE "project" SET "name" = "name" WHERE "id" = $1`, [
      project,
    ]);
    expect(refusal.code).toBe(refusedBy.grant);
  });

  it('each table in its domain', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    const { id: lock } = await db.one<{ id: string }>(
      `INSERT INTO "invoice_lock" ("completed_load_id", "locked_by_id") VALUES ($1, $2) RETURNING id::text`,
      [world.loads.l101002.completedLoad, world.admin],
    );
    const written = [...Object.values(world.written).flat(), lock];
    const domains = await db.rows<{ table_name: string; domains: string[] }>(
      `SELECT "table_name", array_agg(DISTINCT "domain"::text) AS domains FROM "audit_record"
       WHERE "record_id" = ANY($1) GROUP BY "table_name" ORDER BY "table_name"`,
      [written],
    );
    expect(Object.fromEntries(domains.map((row) => [row.table_name, row.domains]))).toEqual({
      assignment: ['OPERATIONS'],
      client: ['OPERATIONS'],
      completed_load: ['BILLING'],
      contract: ['BILLING'],
      contractor: ['OPERATIONS'],
      declaration_event: ['OPERATIONS'],
      device: ['SECURITY'],
      disposal_site: ['OPERATIONS'],
      field_event: ['RECORDS'],
      form: ['OPERATIONS'],
      form_debris_type: ['OPERATIONS'],
      invoice_lock: ['BILLING'],
      pay_item: ['BILLING'],
      pay_item_rate: ['BILLING'],
      project: ['OPERATIONS'],
      project_contractor: ['OPERATIONS'],
      project_kind_of_work: ['OPERATIONS'],
      rule: ['BILLING'],
      rule_action: ['BILLING'],
      rule_criterion: ['BILLING'],
      rule_criterion_pick: ['BILLING'],
      transaction: ['BILLING'],
      user: ['SECURITY'],
      user_viewer_project: ['SECURITY'],
    });
    const counts = await db.one<{ records: number; rows: number }>(
      `SELECT count(*)::int AS records, count(DISTINCT "record_id")::int AS rows
       FROM "audit_record" WHERE "record_id" = ANY($1)`,
      [written],
    );
    expect(counts).toEqual({ records: written.length, rows: written.length });
  });

  it("the worker's writes, as its system actor", async () => {
    const { db, world } = tested;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    await db.run(`UPDATE "field_event" SET "status" = 'COMPLETED' WHERE "id" = $1`, [
      world.loads.l101001.collection,
    ]);
    const [, reconciled] = await auditOf(world.loads.l101001.collection);
    expect(reconciled).toMatchObject({
      operation: 'UPDATE',
      changed_fields: ['status'],
      actor_id: world.worker,
      source: 'SYSTEM',
    });
  });
});

describe('a write with no actor or source is refused', () => {
  it('no actor stated', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.noActor();
    const refusal = await db.refused(...insertOf('project', projectLike(world)));
    expect(refusal).toEqual({
      code: refusedBy.grant,
      message: 'A write to project needs its actor: state adms.actor_id before writing',
    });
  });

  it('no source stated', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    await db.run(`SELECT set_config('adms.source', '', true)`);
    const refusal = await db.refused(`UPDATE "project" SET "name" = 'P3' WHERE "id" = $1`, [
      world.p1,
    ]);
    expect(refusal).toEqual({
      code: refusedBy.grant,
      message: 'A write to project needs its source: state adms.source before writing',
    });
  });

  it('an actor who is not a user, or a source that is not one of the three', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.coastline, 'BACK_OFFICE');
    expect(
      (await db.refused(`UPDATE "project" SET "name" = 'P3' WHERE "id" = $1`, [world.p1])).code,
    ).toBe(refusedBy.foreignKey);
    await db.run(`SELECT set_config('adms.actor_id', 'Dana Reyes', true)`);
    expect(
      (await db.refused(`UPDATE "project" SET "name" = 'P3' WHERE "id" = $1`, [world.p1])).code,
    ).toBe(refusedBy.badValue);
    await db.actor(world.admin, 'BACK_OFFICE');
    await db.run(`SELECT set_config('adms.source', 'PORTAL', true)`);
    expect(
      (await db.refused(`UPDATE "project" SET "name" = 'P3' WHERE "id" = $1`, [world.p1])).code,
    ).toBe(refusedBy.badValue);
  });

  it('for the worker and for the owner too', async () => {
    const { db, world } = tested;
    await db.noActor();
    await db.as('adms_worker');
    expect(
      (
        await db.refused(`UPDATE "field_event" SET "status" = 'COMPLETED' WHERE "id" = $1`, [
          world.loads.l101001.collection,
        ])
      ).code,
    ).toBe(refusedBy.grant);
    await db.as('adms_owner');
    expect(
      (await db.refused(`UPDATE "project" SET "name" = 'P3' WHERE "id" = $1`, [world.p1])).code,
    ).toBe(refusedBy.grant);
  });
});

describe('audit_record is append-only', () => {
  it('update, delete and truncate are refused for the owner and the superuser, by its trigger', async () => {
    const { db, world } = tested;
    for (const who of ['adms_owner', 'superuser'] as const) {
      if (who === 'superuser') await db.administer();
      else await db.as(who);
      for (const [sql, operation] of [
        [`UPDATE "audit_record" SET "reason" = 'tidied' WHERE "record_id" = $1`, 'UPDATE'],
        [`DELETE FROM "audit_record" WHERE "record_id" = $1`, 'DELETE'],
        [`TRUNCATE "audit_record"`, 'TRUNCATE'],
      ] as const) {
        const values = operation === 'TRUNCATE' ? [] : [world.p1];
        expect(await db.refused(sql, values), `${who} ${operation}`).toEqual({
          code: refusedBy.trigger,
          message: `audit_record is append-only: ${operation} is refused`,
        });
      }
    }
    expect(await auditOf(world.p1)).toHaveLength(1);
  });

  it('and for every runtime login, by its grants', async () => {
    const { db, world } = tested;
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      for (const sql of [
        `UPDATE "audit_record" SET "reason" = 'tidied' WHERE "record_id" = $1`,
        `DELETE FROM "audit_record" WHERE "record_id" = $1`,
        `TRUNCATE "audit_record"`,
      ]) {
        const values = sql.startsWith('TRUNCATE') ? [] : [world.p1];
        expect((await db.refused(sql, values)).code, `${login}: ${sql}`).toBe(refusedBy.grant);
      }
    }
  });
});
