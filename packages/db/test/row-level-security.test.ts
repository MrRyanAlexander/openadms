// REQ-014: read-only viewers see only their own projects; a contractor only its own transactions
// (ARCHITECTURE §5.5; ADR-050, 169, 270 (7), (8)). The API states the viewer per request; unstated,
// a viewer sees nothing. PROVISIONAL with the schema: field events and completed loads carry no
// contractor yet, so a contractor viewer sees none of them (fail closed) until DATA-MODEL adds it.
import { describe, expect, it } from 'vitest';

import type { GuardedDatabase } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

interface Seen {
  projects: string[];
  events: number;
  loads: number;
  transactions: string[];
}

// What the read-only login sees through the viewer views, of the example world's rows.
async function seen(db: GuardedDatabase, world: typeof tested.world): Promise<Seen> {
  const projects = [world.p1, world.p2];
  await db.as('adms_readonly');
  const count = async (view: string): Promise<number> =>
    (
      await db.one<{ count: number }>(
        `SELECT count(*)::int AS count FROM "${view}" WHERE "project_id" = ANY($1)`,
        [projects],
      )
    ).count;
  const result: Seen = {
    projects: (
      await db.rows<{ id: string }>(
        `SELECT "id"::text FROM "viewer_project" WHERE "id" = ANY($1) ORDER BY "name"`,
        [projects],
      )
    ).map((row) => row.id),
    events: await count('viewer_field_event'),
    loads: await count('viewer_completed_load'),
    transactions: (
      await db.rows<{ id: string }>(
        `SELECT "id"::text FROM "viewer_transaction" WHERE "id" = ANY($1) ORDER BY "amount"`,
        [Object.values(world.loads).map((load) => load.transaction)],
      )
    ).map((row) => row.id),
  };
  await db.administer();
  return result;
}

describe('a viewer', () => {
  it('unstated, sees nothing', async () => {
    const { db, world } = tested;
    await db.noViewer();
    expect(await seen(db, world)).toEqual({ projects: [], events: 0, loads: 0, transactions: [] });
  });

  it('with projects but no contractor stated, sees nothing', async () => {
    const { db, world } = tested;
    await db.viewer([world.p1, world.p2], '');
    expect(await seen(db, world)).toEqual({ projects: [], events: 0, loads: 0, transactions: [] });
  });

  it('a client user sees the whole of their project, and nothing of another', async () => {
    const { db, world } = tested;
    await db.viewer([world.p1], 'none');
    expect(await seen(db, world)).toEqual({
      projects: [world.p1],
      events: 4,
      loads: 2,
      transactions: [world.loads.l101002.transaction, world.loads.l101001.transaction],
    });
  });

  it('an auditor sees every project they are given', async () => {
    const { db, world } = tested;
    await db.viewer([world.p1, world.p2], 'none');
    expect(await seen(db, world)).toEqual({
      projects: [world.p2, world.p1],
      events: 6,
      loads: 3,
      transactions: [
        world.loads.l101002.transaction,
        world.loads.l102001.transaction,
        world.loads.l101001.transaction,
      ],
    });
  });

  it("a contractor sees only its own transactions in its projects, never another prime's", async () => {
    const { db, world } = tested;
    await db.viewer([world.p1], world.coastline);
    expect(await seen(db, world)).toEqual({
      projects: [world.p1],
      events: 0,
      loads: 0,
      transactions: [world.loads.l101001.transaction],
    });
    await db.viewer([world.p1, world.p2], world.summit);
    expect((await seen(db, world)).transactions).toEqual([world.loads.l101002.transaction]);
  });

  it('reads the same through the base tables as through the views', async () => {
    const { db, world } = tested;
    await db.viewer([world.p1], 'none');
    await db.as('adms_readonly');
    const events = await db.one<{ count: number }>(
      `SELECT count(*)::int AS count FROM "field_event" WHERE "project_id" = ANY($1)`,
      [[world.p1, world.p2]],
    );
    expect(events.count).toBe(4);
  });
});

describe('the services', () => {
  it.each(['adms_api', 'adms_worker'] as const)(
    '%s sees every row, with no viewer stated',
    async (login) => {
      const { db, world } = tested;
      await db.noViewer();
      await db.as(login);
      const counts = await db.one<{
        projects: number;
        events: number;
        loads: number;
        transactions: number;
      }>(
        `SELECT
         (SELECT count(*)::int FROM "project" WHERE "id" = ANY($1)) AS projects,
         (SELECT count(*)::int FROM "field_event" WHERE "project_id" = ANY($1)) AS events,
         (SELECT count(*)::int FROM "completed_load" WHERE "project_id" = ANY($1)) AS loads,
         (SELECT count(*)::int FROM "transaction" t JOIN "completed_load" l ON l."id" = t."completed_load_id"
          WHERE l."project_id" = ANY($1)) AS transactions`,
        [[world.p1, world.p2]],
      );
      expect(counts).toEqual({ projects: 2, events: 6, loads: 3, transactions: 3 });
    },
  );
});
