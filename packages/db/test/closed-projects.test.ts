// A closed project stays closed (ADR-529 (b); spec/DATA-MODEL.md §3; ARCHITECTURE §5). The user:
// "A closed project … Nothing else will be done to it ever. Its records are an archive for history
// at that point." Held by the database itself: nothing in a closed project is written, changed or
// taken away, by the API or the worker, on a record of its own or one under it; its own row
// changes no more but for an admin's reopening, with a reason. What is no record of the project
// (a viewer's grant to it) still changes. P1 is the example world's, closed here.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

const closed = 'The project is closed: nothing in it is written, changed or taken away';

async function closeP1(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
  await db.run(`UPDATE "project" SET "closed_at" = now() WHERE "id" = $1`, [world.p1]);
}

describe('a closed project', () => {
  it('ADR-529 (b) nothing in it is written or changed by the API, on its own records or the ones under them; another project is as it was', async () => {
    const { db, world } = tested;
    await closeP1();
    for (const [sql, values] of [
      [
        `UPDATE "pay_item" SET "description" = 'Changed' WHERE "id" = $1`,
        [world.payItems.vegHaul15],
      ],
      [`UPDATE "contract" SET "name" = 'Changed' WHERE "id" = $1`, [world.contracts.coastlineP1]],
      [`UPDATE "rule_criterion" SET "number_from" = 20 WHERE "id" = $1`, [world.rule.mileage]],
      [
        `UPDATE "form_debris_type" SET "hidden_on_phones" = true WHERE "id" = $1`,
        [world.formDebrisTypes.cd],
      ],
      [`UPDATE "assignment" SET "certifying" = true WHERE "id" = $1`, [world.assignments.p1]],
    ] as const) {
      const refusal = await db.refused(sql, [...values]);
      expect([refusal.code, refusal.message], sql).toEqual([refusedBy.check, closed]);
    }
    const added = await db.refused(
      ...insertOf('field_tag', { project_id: world.p1, name: 'Mixed', position: 9 }),
    );
    expect(added.code).toBe(refusedBy.check);
    // P2 is open: its contract is changed as before.
    await db.run(`UPDATE "contract" SET "name" = 'Coastline, PPDR' WHERE "id" = $1`, [
      world.contracts.coastlineP2,
    ]);
  });

  it('ADR-529 (b) the worker changes nothing in it either: no status, no line taken away', async () => {
    const { db, world } = tested;
    await closeP1();
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    const status = await db.refused(
      `UPDATE "field_event" SET "status" = 'COMPLETED' WHERE "id" = $1`,
      [world.loads.l101001.collection],
    );
    expect([status.code, status.message]).toEqual([refusedBy.check, closed]);
    const removed = await db.refused(`DELETE FROM "transaction" WHERE "id" = $1`, [
      world.transaction,
    ]);
    expect([removed.code, removed.message]).toEqual([refusedBy.check, closed]);
  });

  it('ADR-529 (b) its own row changes no more; an admin reopens it, with a reason, and only that; then it is written as before', async () => {
    const { db, world } = tested;
    await closeP1();
    const renamed = await db.refused(`UPDATE "project" SET "name" = 'Renamed' WHERE "id" = $1`, [
      world.p1,
    ]);
    expect(renamed.code).toBe(refusedBy.check);
    const silently = await db.refused(`UPDATE "project" SET "closed_at" = NULL WHERE "id" = $1`, [
      world.p1,
    ]);
    expect(silently.message).toBe(
      'A closed project changes no more; it is reopened, with a reason, and nothing else',
    );
    const withMore = await db.refused(
      `UPDATE "project" SET "closed_at" = NULL, "name" = 'Renamed' WHERE "id" = $1`,
      [world.p1],
    );
    expect(withMore.code).toBe(refusedBy.check);
    await db.actor(world.admin, 'BACK_OFFICE', { reason: 'Closed the wrong project' });
    await db.run(`UPDATE "project" SET "closed_at" = NULL WHERE "id" = $1`, [world.p1]);
    await db.run(`UPDATE "pay_item" SET "description" = 'Changed' WHERE "id" = $1`, [
      world.payItems.vegHaul15,
    ]);
  });

  it('ADR-529 (b) what is no record of it still changes: a viewer’s grant to it is taken away', async () => {
    const { db, world } = tested;
    await closeP1();
    expect(
      await db.run(
        `UPDATE "user_viewer_project" SET "archived_at" = now()
         WHERE "user_id" = $1 AND "project_id" = $2`,
        [world.clientViewer, world.p1],
      ),
    ).toBe(1);
  });
});
