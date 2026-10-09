// REQ-013: a transaction is removed only by regeneration, copied in full to audit first, and never
// while its ticket is locked as invoiced (ARCHITECTURE §5.3; ADR-085, 090, 270 (6), 358;
// spec/acceptance/07-pricing-ledger-audit.md AC-07-88, 96, 97). The lock on a haul-out and on a
// unit rate ticket, and a line added to a locked ticket, are in transactions.test.ts.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf, transactionLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

describe("regenerating a load's transactions", () => {
  it('AC-07-96 copies the whole row to audit before it goes', async () => {
    const { db, world } = tested;
    const { transaction } = world;
    const before = await db.one<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(t) AS row FROM "transaction" t WHERE "id" = $1`,
      [transaction],
    );
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM', { reason: 'Reprocessed after a load call correction' });
    expect(await db.run(`DELETE FROM "transaction" WHERE "id" = $1`, [transaction])).toBe(1);
    expect(await db.rows(`SELECT 1 FROM "transaction" WHERE "id" = $1`, [transaction])).toEqual([]);
    const copied = await db.one<{
      operation: string;
      prior_value: Record<string, unknown>;
      new_value: null;
      changed_fields: string[];
      actor_id: string;
      source: string;
      reason: string;
      domain: string;
    }>(
      `SELECT "operation"::text, "prior_value", "new_value", "changed_fields", "actor_id"::text,
         "source"::text, "reason", "domain"::text
       FROM "audit_record" WHERE "record_id" = $1 AND "operation" = 'DELETE'`,
      [transaction],
    );
    expect({ ...copied, changed_fields: copied.changed_fields.sort() }).toEqual({
      operation: 'DELETE',
      prior_value: before.row,
      new_value: null,
      changed_fields: Object.keys(before.row).sort(),
      actor_id: world.worker,
      source: 'SYSTEM',
      reason: 'Reprocessed after a load call correction',
      domain: 'BILLING',
    });
  });

  it('AC-07-96 is refused without an actor, and the row stays', async () => {
    const { db, world } = tested;
    const { transaction } = world;
    await db.as('adms_worker');
    await db.noActor();
    const refusal = await db.refused(`DELETE FROM "transaction" WHERE "id" = $1`, [transaction]);
    expect(refusal).toEqual({
      code: refusedBy.grant,
      message: 'A write to transaction needs its actor: state adms.actor_id before writing',
    });
    expect(
      await db.rows(`SELECT 1 FROM "transaction" WHERE "id" = $1`, [transaction]),
    ).toHaveLength(1);
  });

  it('AC-07-97 is refused while the load is locked as invoiced, for everyone, and nothing is audited', async () => {
    const { db, world } = tested;
    const { transaction } = world;
    const { completedLoad } = world.loads.l101001;
    await db.as('adms_api');
    await db.run(
      `INSERT INTO "invoice_lock" ("completed_load_id", "locked_by_id", "project_id") VALUES ($1, $2, $3)`,
      [completedLoad, world.admin, world.p1],
    );
    for (const who of ['adms_worker', 'adms_owner', 'superuser'] as const) {
      if (who === 'superuser') await db.administer();
      else await db.as(who);
      await db.actor(world.worker, 'SYSTEM');
      expect(
        await db.refused(`DELETE FROM "transaction" WHERE "id" = $1`, [transaction]),
        who,
      ).toEqual({
        code: refusedBy.trigger,
        message: `Transaction ${transaction} can't be removed: its ticket is locked as invoiced. Unlock it first`,
      });
    }
    await db.administer();
    expect(
      await db.rows(`SELECT 1 FROM "transaction" WHERE "id" = $1`, [transaction]),
    ).toHaveLength(1);
    expect(
      await db.rows(
        `SELECT 1 FROM "audit_record" WHERE "record_id" = $1 AND "operation" = 'DELETE'`,
        [transaction],
      ),
    ).toEqual([]);
  });

  it("AC-07-97 a lock on one load leaves another load's regeneration alone", async () => {
    const { db, world } = tested;
    // A line on 101002, which nothing locks.
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    const { id: other } = await db.one<{ id: string }>(
      ...insertOf(
        'transaction',
        transactionLike(world, {
          completed_load_id: world.loads.l101002.completedLoad,
          completed_load_collection_id: world.loads.l101002.completedLoadCollection,
          slot: 1,
          operating_sub_id: world.rivera,
        }),
      ),
    );
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    await db.run(
      `INSERT INTO "invoice_lock" ("completed_load_id", "locked_by_id", "project_id") VALUES ($1, $2, $3)`,
      [world.loads.l101001.completedLoad, world.admin, world.p1],
    );
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(await db.run(`DELETE FROM "transaction" WHERE "id" = $1`, [other])).toBe(1);
  });

  it('AC-07-88 only the worker deletes, and nobody updates a transaction', async () => {
    const { db, world } = tested;
    const { transaction } = world;
    for (const login of ['adms_api', 'adms_readonly'] as const) {
      await db.as(login);
      expect(
        (await db.refused(`DELETE FROM "transaction" WHERE "id" = $1`, [transaction])).code,
        login,
      ).toBe(refusedBy.grant);
    }
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect(
        (await db.refused(`UPDATE "transaction" SET "amount" = 0 WHERE "id" = $1`, [transaction]))
          .code,
        login,
      ).toBe(refusedBy.grant);
    }
  });
});
