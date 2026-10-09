// REQ-014: read-only viewers see only their own projects; a contractor only its own transactions
// (ARCHITECTURE §5.5; ADR-050, 169, 270 (7), (8), 315, 358). The API states the viewer of each
// request, by their id; what they may see is read from their own record and the projects they are
// given. Unstated, a viewer sees nothing. A priced line carries its project, its prime and its
// operating sub, so a contractor user sees its own contractor's lines (AC-02-65, 66; AC-07-90),
// and the field events and completed loads of its own tickets, told by the certification
// (ADR-361; `contractor-users.test.ts` has that in full, AC-02-78…82).
import { describe, expect, it } from 'vitest';

import type { GuardedDatabase } from './support/database.ts';
import { given, insertOf, viewerLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { PricedTickets } from './support/priced-tickets.ts';

const tested = eachTestRolledBack();
const tickets = new PricedTickets(tested);

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
        `SELECT "id"::text FROM "viewer_transaction" WHERE "project_id" = ANY($1) ORDER BY "quantity"`,
        [projects],
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
      transactions: [world.transaction],
    });
  });

  it('AC-02-64 an auditor sees every project they are given', async () => {
    const { db, world } = tested;
    await db.viewer(world.auditor);
    expect(await seen(db, world)).toEqual({
      projects: [world.p2, world.p1],
      events: 6,
      loads: 3,
      transactions: [world.transaction],
    });
  });

  // Three primes' and subs' lines on P1: Coastline's own on 101001 (52 CY, $390.00, the world's),
  // Rivera's work under Coastline on 101002 (36 CY, $297.00) and Summit's on 101044 (14 CY,
  // $109.20). A viewer's lines are read in order of quantity: not every viewer reads the money.
  async function threeLines(): Promise<{ coastlines: string; riveras: string; summits: string }> {
    const { world } = tested;
    const { haul } = await tickets.cdToTheLandfill();
    const summit = await tickets.summits101044();
    const riveras = await tickets.line({
      completed_load_id: world.loads.l101002.completedLoad,
      completed_load_collection_id: world.loads.l101002.completedLoadCollection,
      slot: 1,
      rule_id: haul.rule,
      pay_item_id: haul.payItem,
      operating_sub_id: world.rivera,
      quantity: '36.0000',
      rate: '8.2500',
      amount: '297.00',
    });
    const summits = await tickets.line({
      completed_load_id: summit.completedLoad,
      completed_load_collection_id: summit.property,
      slot: 1,
      rule_id: summit.rule,
      contract_id: world.contracts.summitP1,
      prime_id: world.summit,
      quantity: '14.0000',
      rate: '7.8000',
      amount: '109.20',
    });
    await tested.db.administer();
    await tested.db.actor(world.admin, 'BACK_OFFICE');
    return { coastlines: world.transaction, riveras, summits };
  }

  async function contractorUser(name: string, contractor: string): Promise<string> {
    const { db, world } = tested;
    const { id } = await db.one<{ id: string }>(
      ...insertOf('user', viewerLike(name, 'CONTRACTOR', contractor)),
    );
    await db.run(...insertOf('user_viewer_project', given(id, world.p1)));
    return id;
  }

  it("AC-02-65, AC-07-90 a prime's contractor user sees its own lines in its projects, its sub's work among them, and never another prime's; a client user and an auditor see every line", async () => {
    const { db, world } = tested;
    const lines = await threeLines();
    // Coastline's: its lines, and P1's two loads on its certifications with their four field
    // events; nothing of Summit's 101044.
    await db.viewer(world.coastlineViewer);
    expect(await seen(db, world)).toEqual({
      projects: [world.p1],
      events: 4,
      loads: 2,
      transactions: [lines.riveras, lines.coastlines],
    });
    await db.viewer(await contractorUser('Summit Debris Services viewer', world.summit));
    expect((await seen(db, world)).transactions).toEqual([lines.summits]);
    const every = [lines.summits, lines.riveras, lines.coastlines];
    for (const viewer of [world.clientViewer, world.auditor]) {
      await db.viewer(viewer);
      expect((await seen(db, world)).transactions, viewer).toEqual(every);
    }
  });

  it("AC-02-66 a sub's contractor user sees only the lines of the work it did, and none before it is given the project", async () => {
    const { db, world } = tested;
    const lines = await threeLines();
    const { id: riveraViewer } = await db.one<{ id: string }>(
      ...insertOf('user', viewerLike('Rivera Trucking viewer', 'CONTRACTOR', world.rivera)),
    );
    await db.viewer(riveraViewer);
    expect(await seen(db, world)).toEqual(nothing);
    await db.run(...insertOf('user_viewer_project', given(riveraViewer, world.p1)));
    // Rivera's: the one load its own truck hauled, 101002, and its line.
    expect(await seen(db, world)).toEqual({
      projects: [world.p1],
      events: 2,
      loads: 1,
      transactions: [lines.riveras],
    });
    // A contractor user of a firm on no ticket sees no line.
    await db.viewer(await contractorUser('Harbor Staffing viewer', world.harbor));
    expect((await seen(db, world)).transactions).toEqual([]);
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
         (SELECT count(*)::int FROM "transaction" WHERE "project_id" = ANY($1)) AS transactions`,
        [[world.p1, world.p2]],
      );
      expect(counts).toEqual({ projects: 2, events: 6, loads: 3, transactions: 1 });
    },
  );
});
