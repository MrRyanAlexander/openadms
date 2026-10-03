// REQ-014: read-only viewers see only their own projects; a contractor only its own transactions
// (ARCHITECTURE §5.5; ADR-050, 169, 270 (7), (8), 315). The API states the viewer of each request,
// by their id; what they may see is read from their own record and the projects they are given.
// Unstated, a viewer sees nothing. Field events and completed loads carry no contractor yet, so a
// contractor user sees none of them (fail closed) until they do (C18).
import { describe, expect, it } from 'vitest';

import type { GuardedDatabase } from './support/database.ts';
import { given, insertOf, viewerLike } from './support/example-world.ts';
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

const nothing: Seen = { projects: [], events: 0, loads: 0, transactions: [] };

describe('a viewer', () => {
  it('AC-02-62 unstated, sees nothing', async () => {
    const { db, world } = tested;
    await db.noViewer();
    expect(await seen(db, world)).toEqual(nothing);
  });

  it('AC-02-62 stated as someone who is no read-only viewer, or one who was removed, sees nothing', async () => {
    const { db, world } = tested;
    // Dana, an admin, and Ana, a monitor, are no viewers, whatever a request says, and even
    // with a project written against them: only a read-only viewer's projects count.
    for (const person of [world.admin, world.monitor]) {
      await db.run(...insertOf('user_viewer_project', given(person, world.p1)));
    }
    for (const person of [world.admin, world.monitor, world.worker]) {
      await db.viewer(person);
      expect(await seen(db, world), person).toEqual(nothing);
    }
    // The auditor is removed: archived, never deleted.
    await db.run(`UPDATE "user" SET "archived_at" = now() WHERE "id" = $1`, [world.auditor]);
    await db.viewer(world.auditor);
    expect(await seen(db, world)).toEqual(nothing);
    // A statement that is no id at all is refused, not guessed at.
    await db.viewer('none');
    await db.as('adms_readonly');
    expect((await db.refused(`SELECT 1 FROM "viewer_project"`)).code).toBe('22P02');
  });

  it('AC-02-63 a client user sees the whole of their project, and nothing of another', async () => {
    const { db, world } = tested;
    await db.viewer(world.clientViewer);
    expect(await seen(db, world)).toEqual({
      projects: [world.p1],
      events: 4,
      loads: 2,
      transactions: [world.loads.l101002.transaction, world.loads.l101001.transaction],
    });
  });

  it('AC-02-64 an auditor sees every project they are given', async () => {
    const { db, world } = tested;
    await db.viewer(world.auditor);
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

  it("AC-02-65 a contractor sees only its own transactions in its projects, never another prime's", async () => {
    const { db, world } = tested;
    await db.viewer(world.coastlineViewer);
    expect(await seen(db, world)).toEqual({
      projects: [world.p1],
      events: 0,
      loads: 0,
      transactions: [world.loads.l101001.transaction],
    });
    const { id: summitViewer } = await db.one<{ id: string }>(
      ...insertOf('user', viewerLike('Summit Debris Services viewer', 'CONTRACTOR', world.summit)),
    );
    await db.run(...insertOf('user_viewer_project', given(summitViewer, world.p1)));
    await db.run(...insertOf('user_viewer_project', given(summitViewer, world.p2)));
    await db.viewer(summitViewer);
    expect((await seen(db, world)).transactions).toEqual([world.loads.l101002.transaction]);
  });

  it('AC-02-69 sees a project from when it is given until it is taken away', async () => {
    const { db, world } = tested;
    await db.viewer(world.clientViewer);
    expect((await seen(db, world)).projects).toEqual([world.p1]);
    await db.run(...insertOf('user_viewer_project', given(world.clientViewer, world.p2)));
    expect((await seen(db, world)).projects).toEqual([world.p2, world.p1]);
    await db.run(
      `UPDATE "user_viewer_project" SET "archived_at" = now() WHERE "user_id" = $1 AND "project_id" = $2`,
      [world.clientViewer, world.p1],
    );
    expect(await seen(db, world)).toMatchObject({ projects: [world.p2], events: 2, loads: 1 });
  });

  it('reads the same through the base tables as through the views', async () => {
    const { db, world } = tested;
    await db.viewer(world.clientViewer);
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
