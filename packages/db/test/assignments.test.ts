// REQ-020, the assignment: one person's work for a day (person, date, project, their work: the
// kinds of field event, the unit rate pay items, certifying; one site where the work is at one,
// optionally a phone), planned on the dispatch board or unplanned, and who made it; and every
// field event carries its assignment and the setup version of the phone's lists (ADR-127, 195,
// 240, 281, 286; BACKLOG carry-forward C15, C42).
import { describe, expect, it } from 'vitest';

import { systemActorId } from '../src/system-actor.ts';
import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

interface Written {
  person?: string;
  project?: string;
  kinds?: string;
  certifying?: boolean;
  site?: string | null;
  device?: string | null;
  origin?: string;
  madeBy?: string | null;
}

// An assignment for Tuesday 13 October 2026; Ana's, on P1, written by Dana, unless the test says.
function assignment(written: Written = {}): [string, unknown[]] {
  const { world } = tested;
  return [
    `INSERT INTO "assignment" ("person_id", "work_date", "project_id", "field_event_kinds",
       "certifying", "site_id", "device_id", "origin", "made_by_id")
     VALUES ($1, '2026-10-13', $2, $3, $4, $5, $6, $7, $8) RETURNING "id"::text`,
    [
      written.person ?? world.monitor,
      written.project ?? world.p1,
      written.kinds ?? '{COLLECTION}',
      written.certifying ?? false,
      written.site ?? null,
      written.device === undefined ? world.device : written.device,
      written.origin ?? 'PLANNED',
      written.madeBy === undefined ? world.admin : written.madeBy,
    ],
  ];
}

async function assign(written: Written = {}): Promise<string> {
  return (await tested.db.one<{ id: string }>(...assignment(written))).id;
}

async function refusedAssignment(written: Written): Promise<string> {
  return (await tested.db.refused(...assignment(written))).code;
}

describe('an assignment', () => {
  it('says who works where, on what: the tower at Marsh Road, a curb collection with no site', async () => {
    const { db, world } = tested;
    await asTheApi();
    const tower = await assign({ kinds: '{DISPOSAL}', site: world.site });
    const curb = await assign({ kinds: '{COLLECTION}', device: null });
    const certifier = await assign({ kinds: '{}', certifying: true, device: null });
    const rows = await db.rows(
      `SELECT "work_date"::text, "field_event_kinds"::text AS kinds, "certifying", "site_id"::text AS site,
         "device_id"::text AS device, "origin"::text, "made_by_id"::text AS made_by, "archived_at"
       FROM "assignment" WHERE "id" = ANY($1) ORDER BY "id"`,
      [[tower, curb, certifier]],
    );
    const planned = {
      work_date: '2026-10-13',
      origin: 'PLANNED',
      made_by: world.admin,
      archived_at: null,
    };
    expect(rows).toEqual([
      {
        ...planned,
        kinds: '{DISPOSAL}',
        certifying: false,
        site: world.site,
        device: world.device,
      },
      { ...planned, kinds: '{COLLECTION}', certifying: false, site: null, device: null },
      { ...planned, kinds: '{}', certifying: true, site: null, device: null },
    ]);
  });

  it('is at one of its own project’s sites, never another project’s', async () => {
    const { db, world } = tested;
    await asTheApi();
    // P2 enters the same landfill as its own site (ADR-145); P1's assignments can't use it.
    const { id: p2Site } = await db.one<{ id: string }>(
      `INSERT INTO "disposal_site" ("project_id", "name") VALUES ($1, 'Marsh Road TDSR') RETURNING "id"::text`,
      [world.p2],
    );
    expect(await refusedAssignment({ site: p2Site })).toBe(refusedBy.foreignKey);
    const onP2 = await assign({ project: world.p2, site: p2Site });
    // Moving it to P1 takes its site too: P1's own, or none.
    const move = `UPDATE "assignment" SET "project_id" = $2, "site_id" = $3 WHERE "id" = $1`;
    expect((await db.refused(move, [onP2, world.p1, p2Site])).code).toBe(refusedBy.foreignKey);
    expect(await db.run(move, [onP2, world.p1, world.site])).toBe(1);
  });

  it('written on the board says who wrote it; an unplanned one has no author and always its phone', async () => {
    await asTheApi();
    expect(await refusedAssignment({ origin: 'PLANNED', madeBy: null })).toBe(refusedBy.check);
    expect(await refusedAssignment({ origin: 'UNPLANNED' })).toBe(refusedBy.check);
    expect(await refusedAssignment({ origin: 'UNPLANNED', madeBy: null, device: null })).toBe(
      refusedBy.check,
    );
    expect(await refusedAssignment({ origin: 'WALK_UP', madeBy: null })).toBe(refusedBy.badValue);
    // Made on the phone with the master passcode, its id from the phone, as a field event's is.
    await assign({ origin: 'UNPLANNED', madeBy: null });
    await assign({ origin: 'PLANNED' });
  });

  it("names only work a phone can record: the kinds are the field event's own", async () => {
    await asTheApi();
    expect(await refusedAssignment({ kinds: '{TOWER}' })).toBe(refusedBy.badValue);
    await assign({ kinds: '{HAUL_OUT_COLLECTION,HAUL_OUT_DISPOSAL,UNIT_RATE}' });
  });

  it('is for a person and written by a person, never the system actor', async () => {
    await asTheApi();
    expect(await refusedAssignment({ person: systemActorId })).toBe(refusedBy.check);
    expect(await refusedAssignment({ madeBy: systemActorId })).toBe(refusedBy.check);
    expect(await refusedAssignment({ person: '019a0000-0000-7000-8000-00000000dead' })).toBe(
      refusedBy.foreignKey,
    );
  });

  it('never stops a second one: two projects in a day are two assignments, on two phones', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id: second } = await db.one<{ id: string }>(
      `INSERT INTO "device" ("name", "public_key", "master_passcode_version")
       VALUES ('P2-COL-1', 'test-public-key-P2-COL-1', 1) RETURNING "id"::text`,
    );
    await assign({ project: world.p1 });
    await assign({ project: world.p2, device: second });
    // And nothing stops the same again on the same phone: the board shows it, the database doesn't judge.
    await assign({ project: world.p1 });
  });

  it('is withdrawn, never deleted; the worker reads it and writes nothing', async () => {
    const { db, world } = tested;
    await asTheApi();
    const id = await assign();
    expect(
      await db.run(
        `UPDATE "assignment" SET "archived_at" = '2026-10-13T10:00:00Z' WHERE "id" = $1`,
        [id],
      ),
    ).toBe(1);
    expect((await db.refused(`DELETE FROM "assignment" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.grant,
    );
    await db.as('adms_owner');
    expect((await db.refused(`DELETE FROM "assignment" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.trigger,
    );
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(await db.rows(`SELECT 1 FROM "assignment" WHERE "id" = $1`, [id])).toHaveLength(1);
    expect(await refusedAssignment({})).toBe(refusedBy.grant);
    expect(
      (await db.refused(`UPDATE "assignment" SET "certifying" = true WHERE "id" = $1`, [id])).code,
    ).toBe(refusedBy.grant);
  });
});

describe("an assignment's unit rate pay items", () => {
  // A pay item, as far as this build holds one: its project, the firm's code and its description.
  async function payItem(project: string, code: string, description: string): Promise<string> {
    const { id } = await tested.db.one<{ id: string }>(
      `INSERT INTO "pay_item" ("project_id", "code", "description") VALUES ($1, $2, $3) RETURNING "id"::text`,
      [project, code, description],
    );
    return id;
  }
  const name = (
    assignmentId: string,
    projectId: string,
    payItemId: string,
  ): [string, unknown[]] => [
    `INSERT INTO "assignment_pay_item" ("assignment_id", "project_id", "pay_item_id")
     VALUES ($1, $2, $3) RETURNING "id"::text`,
    [assignmentId, projectId, payItemId],
  ];
  const named = (assignmentId: string): Promise<{ code: string; archived: boolean }[]> =>
    tested.db.rows(
      `SELECT p."code", a."archived_at" IS NOT NULL AS archived
       FROM "assignment_pay_item" a JOIN "pay_item" p ON p."id" = a."pay_item_id"
       WHERE a."assignment_id" = $1 ORDER BY p."code"`,
      [assignmentId],
    );

  it('are the ones the person does that day: hangers and leaners for the unit rate monitor', async () => {
    const { db, world } = tested;
    await asTheApi();
    const hangers = await payItem(world.p1, 'HNG-RMV-EA', 'Hanger removal');
    const leaners = await payItem(world.p1, 'LNR-RMV-EA-24', 'Leaner removal 6–24 in');
    await payItem(world.p1, 'STP-RMV-EA-36', 'Stump removal 24–36 in');
    const unitRate = await assign({ kinds: '{UNIT_RATE}', device: null });
    await db.one(...name(unitRate, world.p1, hangers));
    await db.one(...name(unitRate, world.p1, leaners));
    expect(await named(unitRate)).toEqual([
      { code: 'HNG-RMV-EA', archived: false },
      { code: 'LNR-RMV-EA-24', archived: false },
    ]);
  });

  it('are its own project’s, never another project’s', async () => {
    const { db, world } = tested;
    await asTheApi();
    const onP1 = await assign({ kinds: '{UNIT_RATE}' });
    const p2Hangers = await payItem(world.p2, 'HNG-RMV-EA', 'Hanger removal');
    // Named as P2's (its true project) or passed off as P1's: neither reaches a P1 assignment.
    expect((await db.refused(...name(onP1, world.p2, p2Hangers))).code).toBe(refusedBy.foreignKey);
    expect((await db.refused(...name(onP1, world.p1, p2Hangers))).code).toBe(refusedBy.foreignKey);
    const onP2 = await assign({ kinds: '{UNIT_RATE}', project: world.p2 });
    await db.one(...name(onP2, world.p2, p2Hangers));
    // And an assignment that names pay items stays on its project: they are that project's.
    expect(
      (
        await db.refused(`UPDATE "assignment" SET "project_id" = $2 WHERE "id" = $1`, [
          onP2,
          world.p1,
        ])
      ).code,
    ).toBe(refusedBy.restrict);
  });

  it('name each pay item once; one is taken off by archiving and put back, never deleted', async () => {
    const { db, world } = tested;
    await asTheApi();
    const hangers = await payItem(world.p1, 'HNG-RMV-EA', 'Hanger removal');
    const unitRate = await assign({ kinds: '{UNIT_RATE}' });
    const { id } = await db.one<{ id: string }>(...name(unitRate, world.p1, hangers));
    expect((await db.refused(...name(unitRate, world.p1, hangers))).code).toBe(refusedBy.unique);
    const archive = `UPDATE "assignment_pay_item" SET "archived_at" = $2 WHERE "id" = $1`;
    expect(await db.run(archive, [id, '2026-10-13T10:00:00Z'])).toBe(1);
    expect(await named(unitRate)).toEqual([{ code: 'HNG-RMV-EA', archived: true }]);
    expect(await db.run(archive, [id, null])).toBe(1);
    expect(await named(unitRate)).toEqual([{ code: 'HNG-RMV-EA', archived: false }]);
    expect((await db.refused(`DELETE FROM "assignment_pay_item" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.grant,
    );
    await db.as('adms_owner');
    expect((await db.refused(`DELETE FROM "assignment_pay_item" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.trigger,
    );
    expect((await db.refused(`DELETE FROM "pay_item" WHERE "id" = $1`, [hangers])).code).toBe(
      refusedBy.trigger,
    );
  });

  it('are audited: who put which pay item on whose day', async () => {
    const { db, world } = tested;
    await asTheApi();
    const hangers = await payItem(world.p1, 'HNG-RMV-EA', 'Hanger removal');
    const unitRate = await assign({ kinds: '{UNIT_RATE}' });
    const { id } = await db.one<{ id: string }>(...name(unitRate, world.p1, hangers));
    const audited = await db.rows(
      `SELECT "table_name", "operation"::text, "actor_id"::text AS actor, "domain"::text
       FROM "audit_record" WHERE "record_id" = ANY($1) ORDER BY "id"`,
      [[hangers, id]],
    );
    expect(audited).toEqual([
      { table_name: 'pay_item', operation: 'INSERT', actor: world.admin, domain: 'BILLING' },
      {
        table_name: 'assignment_pay_item',
        operation: 'INSERT',
        actor: world.admin,
        domain: 'OPERATIONS',
      },
    ]);
  });

  it('are read by the worker, never written by it', async () => {
    const { db, world } = tested;
    await asTheApi();
    const hangers = await payItem(world.p1, 'HNG-RMV-EA', 'Hanger removal');
    const unitRate = await assign({ kinds: '{UNIT_RATE}' });
    await db.one(...name(unitRate, world.p1, hangers));
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(await named(unitRate)).toHaveLength(1);
    expect(
      (
        await db.refused(
          `INSERT INTO "pay_item" ("project_id", "code", "description") VALUES ($1, 'X', 'X')`,
          [world.p1],
        )
      ).code,
    ).toBe(refusedBy.grant);
    expect((await db.refused(`UPDATE "assignment_pay_item" SET "archived_at" = now()`)).code).toBe(
      refusedBy.grant,
    );
  });
});

describe('a pay item', () => {
  it('AC-01-41 keeps its code to itself on its project: a second pay item with that code is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    const add = `INSERT INTO "pay_item" ("project_id", "code", "description") VALUES ($1, $2, $3)`;
    expect(await db.run(add, [world.p1, 'VEG-HAUL-CY-15', 'ROW VEG haul 0–15 mi'])).toBe(1);
    // The same code again is refused, whatever it is described as (ADR-301)…
    const again = [world.p1, 'VEG-HAUL-CY-15', 'ROW VEG haul 0–15 mi, from 15 Oct'];
    expect((await db.refused(add, again)).code).toBe(refusedBy.unique);
    // …and stays taken once the first is archived: old tickets and the audit log still name it.
    expect(
      await db.run(`UPDATE "pay_item" SET "archived_at" = now() WHERE "code" = $1`, [again[1]]),
    ).toBe(1);
    expect((await db.refused(add, again)).code).toBe(refusedBy.unique);
    // A rate that changes from a date is a second pay item with a code of its own, the firm's choice;
    // its description is whatever the firm wants, the first one's words included.
    expect(await db.run(add, [world.p1, 'VEG-HAUL-CY-15-B', 'ROW VEG haul 0–15 mi'])).toBe(1);
    // A code is its project's: another project may use the same one.
    expect(await db.run(add, [world.p2, 'VEG-HAUL-CY-15', 'ROW VEG haul 0–15 mi'])).toBe(1);
  });

  it('belongs to a project, and is archived, never deleted', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      (
        await db.refused(
          `INSERT INTO "pay_item" ("code", "description") VALUES ('HNG-RMV-EA', 'x')`,
        )
      ).code,
    ).toBe(refusedBy.notNull);
    // It says what the work is: a code with no description is refused.
    expect(
      (
        await db.refused(
          `INSERT INTO "pay_item" ("project_id", "code") VALUES ($1, 'HNG-RMV-EA')`,
          [world.p1],
        )
      ).code,
    ).toBe(refusedBy.notNull);
    const { id } = await db.one<{ id: string }>(
      `INSERT INTO "pay_item" ("project_id", "code", "description") VALUES ($1, 'HNG-RMV-EA', 'Hanger removal') RETURNING "id"::text`,
      [world.p1],
    );
    expect(await db.run(`UPDATE "pay_item" SET "archived_at" = now() WHERE "id" = $1`, [id])).toBe(
      1,
    );
    expect((await db.refused(`DELETE FROM "pay_item" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.grant,
    );
  });
});

describe('a field event', () => {
  const sync = (columns: string, values: string): string =>
    `INSERT INTO "field_event" ("id", "project_id", "workflow", "kind", "ticket_number", "monitor_id",
       "device_id", "started_at", "ended_at", "device_utc_offset_minutes"${columns})
     VALUES (uuidv7(), $1, 'LOAD', 'COLLECTION', '101050', $2, $3, '2026-10-13T13:00:00Z',
       '2026-10-13T13:25:00Z', -240${values})`;

  it('carries its assignment and the setup version of the phone’s lists', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    const place = [world.p1, world.monitor, world.device];
    expect((await db.refused(sync('', ''), place)).code).toBe(refusedBy.notNull);
    expect(
      (await db.refused(sync(', "assignment_id"', ', $4'), [...place, world.assignments.p1])).code,
    ).toBe(refusedBy.notNull);
    expect((await db.refused(sync(', "setup_version"', ', 3'), place)).code).toBe(
      refusedBy.notNull,
    );
    expect(
      (
        await db.refused(sync(', "assignment_id", "setup_version"', ', $4, 3'), [
          ...place,
          '019a0000-0000-7000-8000-00000000dead',
        ])
      ).code,
    ).toBe(refusedBy.foreignKey);
    expect(
      await db.run(sync(', "assignment_id", "setup_version"', ', $4, 3'), [
        ...place,
        world.assignments.p1,
      ]),
    ).toBe(1);
    expect(
      await db.one(
        `SELECT "assignment_id"::text AS assignment, "setup_version" FROM "field_event"
         WHERE "project_id" = $1 AND "ticket_number" = '101050'`,
        [world.p1],
      ),
    ).toEqual({ assignment: world.assignments.p1, setup_version: 3 });
  });

  it('has both corrected by permission, like any captured field; never by the worker', async () => {
    const { db, world } = tested;
    const event = world.loads.l101001.collection;
    await asTheApi();
    const other = await assign();
    const correct = `UPDATE "field_event" SET "assignment_id" = $2, "setup_version" = 2 WHERE "id" = $1`;
    expect(await db.run(correct, [event, other])).toBe(1);
    const audited = await db.one(
      `SELECT "changed_fields", "prior_value" ->> 'assignment_id' AS prior, "new_value" ->> 'assignment_id' AS new
       FROM "audit_record" WHERE "record_id" = $1 AND "operation" = 'UPDATE'`,
      [event],
    );
    expect(audited).toEqual({
      changed_fields: ['assignment_id', 'setup_version'],
      prior: world.assignments.p1,
      new: other,
    });
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await db.refused(correct, [event, world.assignments.p1])).code).toBe(refusedBy.grant);
  });

  it('is never recorded by the system actor', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      (
        await db.refused(`UPDATE "field_event" SET "monitor_id" = $2 WHERE "id" = $1`, [
          world.loads.l101001.collection,
          systemActorId,
        ])
      ).code,
    ).toBe(refusedBy.check);
  });
});
