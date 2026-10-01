// REQ-010: nothing is hard-deleted (ARCHITECTURE §5.2; invariant 1; ADR-270 (3)). No runtime login
// holds DELETE, and a trigger refuses the delete anyway, for the owner and the server's superuser
// too. A transaction is the one row that goes, through regeneration (transaction-delete.test.ts).
import { describe, expect, it } from 'vitest';

import { refusedBy, type Login } from './support/database.ts';
import type { World } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

// Each operational table but "transaction", and a row of it from the example world.
const rowOf: Record<string, (world: World) => string> = {
  project: (world) => world.p1,
  contractor: (world) => world.summit,
  user: (world) => world.monitor,
  device: (world) => world.device,
  field_event: (world) => world.loads.l101001.collection,
  completed_load: (world) => world.loads.l101001.completedLoad,
};
const tables = [...Object.keys(rowOf), 'invoice_lock'];

// An invoice lock on 101002, so there's one to try to delete.
async function lock(): Promise<string> {
  const { db, world } = tested;
  await db.administer();
  await db.actor(world.admin, 'BACK_OFFICE');
  const { id } = await db.one<{ id: string }>(
    `INSERT INTO "invoice_lock" ("completed_load_id", "locked_by_id") VALUES ($1, $2) RETURNING id::text`,
    [world.loads.l101002.completedLoad, world.admin],
  );
  return id;
}

async function rowId(table: string): Promise<string> {
  const pick = rowOf[table];
  return pick === undefined ? lock() : pick(tested.world);
}

describe('a delete', () => {
  it.each(tables)(
    'of a %s row is refused for every runtime login, by its grants',
    async (table) => {
      const { db, world } = tested;
      const id = await rowId(table);
      for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
        await db.as(login);
        await db.actor(world.admin, 'BACK_OFFICE');
        const refusal = await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id]);
        expect(refusal.code, login).toBe(refusedBy.grant);
      }
    },
  );

  it.each(tables)(
    'of a %s row is refused for the owner and the superuser, by its trigger',
    async (table) => {
      const { db, world } = tested;
      const id = await rowId(table);
      for (const who of ['adms_owner', 'superuser'] as const) {
        if (who === 'superuser') await db.administer();
        else await db.as(who satisfies Login);
        await db.actor(world.admin, 'BACK_OFFICE');
        const refusal = await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id]);
        expect(refusal, who).toEqual({
          code: refusedBy.trigger,
          message: `Open ADMS never deletes a ${table} row: archive, close or void it instead`,
        });
      }
      await db.administer();
      expect(await db.rows(`SELECT 1 FROM "${table}" WHERE "id" = $1`, [id])).toHaveLength(1);
    },
  );
});

// A plain truncate of a table others point at stops at their foreign keys; CASCADE gets past them,
// so it's the one to refuse. Its triggers fire for the named table first.
describe('a truncate', () => {
  it.each([...tables, 'transaction'])(
    'of %s, cascading, is refused for the owner and the superuser by its trigger',
    async (table) => {
      const { db } = tested;
      if (table === 'invoice_lock') await lock();
      for (const who of ['adms_owner', 'superuser'] as const) {
        if (who === 'superuser') await db.administer();
        else await db.as(who);
        const refusal = await db.refused(`TRUNCATE "${table}" CASCADE`);
        expect(refusal, who).toEqual({
          code: refusedBy.trigger,
          message: `Open ADMS never deletes a ${table} row: archive, close or void it instead`,
        });
      }
      await db.administer();
      expect(await db.rows(`SELECT 1 FROM "${table}" LIMIT 1`)).toHaveLength(1);
    },
  );
});

describe('archive, close and void are updates, audited', () => {
  it('the API closes a project and archives a contractor', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE', { reason: 'Mission complete' });
    await db.run(`UPDATE "project" SET "closed_at" = now() WHERE "id" = $1`, [world.p2]);
    await db.run(`UPDATE "contractor" SET "archived_at" = now() WHERE "id" = $1`, [world.summit]);
    const audited = await db.rows<{ table_name: string; changed_fields: string[] }>(
      `SELECT "table_name", "changed_fields" FROM "audit_record"
       WHERE "operation" = 'UPDATE' AND "record_id" = ANY($1) ORDER BY "id"`,
      [[world.p2, world.summit]],
    );
    expect(audited).toEqual([
      { table_name: 'project', changed_fields: ['closed_at'] },
      { table_name: 'contractor', changed_fields: ['archived_at'] },
    ]);
  });
});
