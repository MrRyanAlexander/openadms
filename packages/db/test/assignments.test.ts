// REQ-020, the assignment: one person's work for a day (person, date, project, their work: the
// kinds of field event, the unit rate pay items, certifying; one site where the work is at one,
// optionally a phone), planned on the dispatch board or unplanned, and who made it; and every
// field event carries its assignment and the setup version of the phone's lists (ADR-127, 195,
// 240, 281, 286, 309; BACKLOG carry-forward C15, C42). A pay item itself: pay-items.test.ts.
import { describe, expect, it } from 'vitest';

import { systemActorId } from '../src/system-actor.ts';
import { refusedBy } from './support/database.ts';
import {
  eventInsertOf,
  fieldEventLike,
  insertOf,
  payItemLike,
  siteLike,
} from './support/example-world.ts';
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
  it('AC-02-24 says who works where, on what: the tower at Marsh Road, a curb collection with no site', async () => {
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

  it('AC-02-25 is at one of its own project’s sites, never another project’s', async () => {
    const { db, world } = tested;
    await asTheApi();
    // P2 enters the same landfill as its own site (ADR-145); P1's assignments can't use it.
    const { id: p2Site } = await db.one<{ id: string }>(
      ...insertOf(
        'disposal_site',
        siteLike({ p1: world.p2 }, world.siteTypes.tdsr, {
          name: 'Marsh Road TDSR',
          site_type_key: 'TDSR',
          haul_outs_leave_here: true,
        }),
      ),
    );
    expect(await refusedAssignment({ site: p2Site })).toBe(refusedBy.foreignKey);
    const onP2 = await assign({ project: world.p2, site: p2Site });
    // Moving it to P1 takes its site too: P1's own, or none.
    const move = `UPDATE "assignment" SET "project_id" = $2, "site_id" = $3 WHERE "id" = $1`;
    expect((await db.refused(move, [onP2, world.p1, p2Site])).code).toBe(refusedBy.foreignKey);
    expect(await db.run(move, [onP2, world.p1, world.site])).toBe(1);
  });

  it('AC-02-26 written on the board says who wrote it; an unplanned one has no author and always its phone', async () => {
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

  it("AC-02-27 names only work a phone can record: the kinds are the field event's own", async () => {
    await asTheApi();
    expect(await refusedAssignment({ kinds: '{TOWER}' })).toBe(refusedBy.badValue);
    await assign({ kinds: '{HAUL_OUT_COLLECTION,HAUL_OUT_DISPOSAL,UNIT_RATE}' });
  });

  it('AC-02-28 is for a person and written by a person, never the system actor', async () => {
    await asTheApi();
    expect(await refusedAssignment({ person: systemActorId })).toBe(refusedBy.check);
    expect(await refusedAssignment({ madeBy: systemActorId })).toBe(refusedBy.check);
    expect(await refusedAssignment({ person: '019a0000-0000-7000-8000-00000000dead' })).toBe(
      refusedBy.foreignKey,
    );
  });

  it('AC-02-29 never stops a second one: two projects in a day are two assignments, on two phones', async () => {
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

  it('AC-02-30 is withdrawn, never deleted; the worker reads it and writes nothing', async () => {
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
  // A pay item named on an assignment, with its kind of work as the pay item has it: only a unit
  // rate pay item has one to give (C42).
  const name = (
    assignmentId: string,
    projectId: string,
    payItemId: string,
    kindOfWorkId: string | null,
  ): [string, unknown[]] => [
    `INSERT INTO "assignment_pay_item" ("assignment_id", "project_id", "pay_item_id", "kind_of_work_id")
     VALUES ($1, $2, $3, $4) RETURNING "id"::text`,
    [assignmentId, projectId, payItemId, kindOfWorkId],
  ];
  const named = (assignmentId: string): Promise<{ code: string; archived: boolean }[]> =>
    tested.db.rows(
      `SELECT p."code", a."archived_at" IS NOT NULL AS archived
       FROM "assignment_pay_item" a JOIN "pay_item" p ON p."id" = a."pay_item_id"
       WHERE a."assignment_id" = $1 ORDER BY p."code"`,
      [assignmentId],
    );
  // P2's own Hanger removal pay item.
  async function p2Hangers(): Promise<string> {
    const { world } = tested;
    return (
      await tested.db.one<{ id: string }>(
        ...insertOf(
          'pay_item',
          payItemLike(world, {
            project_id: world.p2,
            code: 'HNG-RMV-EA',
            description: 'Hanger removal',
            payable_type_id: world.payableTypes.hangers,
            kind_of_work_id: world.kindsOfWork.hangers,
            unit: 'EA',
          }),
        ),
      )
    ).id;
  }

  it('AC-02-31 are the ones the person does that day: hangers and leaners for the unit rate monitor', async () => {
    const { db, world } = tested;
    await asTheApi();
    const unitRate = await assign({ kinds: '{UNIT_RATE}', device: null });
    await db.one(...name(unitRate, world.p1, world.payItems.hangers, world.kindsOfWork.hangers));
    await db.one(...name(unitRate, world.p1, world.payItems.leaners24, world.kindsOfWork.leaners));
    expect(await named(unitRate)).toEqual([
      { code: 'HNG-RMV-EA', archived: false },
      { code: 'LNR-RMV-EA-24', archived: false },
    ]);
  });

  it('AC-02-31 C42 are unit rate pay items only: a hauling pay item has no kind of work to name', async () => {
    const { db, world } = tested;
    await asTheApi();
    const unitRate = await assign({ kinds: '{UNIT_RATE}' });
    // VEG-HAUL-CY-15 is no unit rate pay item, whatever kind of work it is passed off as…
    for (const kind of Object.values(world.kindsOfWork)) {
      expect(
        (await db.refused(...name(unitRate, world.p1, world.payItems.vegHaul15, kind))).code,
      ).toBe(refusedBy.foreignKey);
    }
    // …and a unit rate pay item is named with its own kind of work, never another's.
    expect(
      (
        await db.refused(
          ...name(unitRate, world.p1, world.payItems.hangers, world.kindsOfWork.leaners),
        )
      ).code,
    ).toBe(refusedBy.foreignKey);
    // Its kind of work is always named: none is no unit rate pay item.
    expect(
      (await db.refused(...name(unitRate, world.p1, world.payItems.vegHaul15, null))).code,
    ).toBe(refusedBy.notNull);
    // A pay item named on an assignment keeps its kind of work.
    await db.one(...name(unitRate, world.p1, world.payItems.hangers, world.kindsOfWork.hangers));
    expect(
      (
        await db.refused(`UPDATE "pay_item" SET "kind_of_work_id" = $2 WHERE "id" = $1`, [
          world.payItems.hangers,
          world.kindsOfWork.leaners,
        ])
      ).code,
    ).toBe(refusedBy.restrict);
  });

  it('AC-02-31 are its own project’s, never another project’s', async () => {
    const { db, world } = tested;
    await asTheApi();
    const onP1 = await assign({ kinds: '{UNIT_RATE}' });
    const hangers = await p2Hangers();
    const kind = world.kindsOfWork.hangers;
    // Named as P2's (its true project) or passed off as P1's: neither reaches a P1 assignment.
    expect((await db.refused(...name(onP1, world.p2, hangers, kind))).code).toBe(
      refusedBy.foreignKey,
    );
    expect((await db.refused(...name(onP1, world.p1, hangers, kind))).code).toBe(
      refusedBy.foreignKey,
    );
    const onP2 = await assign({ kinds: '{UNIT_RATE}', project: world.p2 });
    await db.one(...name(onP2, world.p2, hangers, kind));
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

  it('AC-02-32 name each pay item once; one is taken off by archiving and put back, never deleted', async () => {
    const { db, world } = tested;
    await asTheApi();
    const hangers = world.payItems.hangers;
    const unitRate = await assign({ kinds: '{UNIT_RATE}' });
    const naming = name(unitRate, world.p1, hangers, world.kindsOfWork.hangers);
    const { id } = await db.one<{ id: string }>(...naming);
    expect((await db.refused(...naming)).code).toBe(refusedBy.unique);
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

  it('AC-02-32 are audited: who put which pay item on whose day', async () => {
    const { db, world } = tested;
    await asTheApi();
    const hangers = await p2Hangers();
    const unitRate = await assign({ kinds: '{UNIT_RATE}', project: world.p2 });
    const { id } = await db.one<{ id: string }>(
      ...name(unitRate, world.p2, hangers, world.kindsOfWork.hangers),
    );
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
    const unitRate = await assign({ kinds: '{UNIT_RATE}' });
    await db.one(...name(unitRate, world.p1, world.payItems.hangers, world.kindsOfWork.hangers));
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(await named(unitRate)).toHaveLength(1);
    expect((await db.refused(...insertOf('pay_item', payItemLike(world)))).code).toBe(
      refusedBy.grant,
    );
    expect((await db.refused(`UPDATE "assignment_pay_item" SET "archived_at" = now()`)).code).toBe(
      refusedBy.grant,
    );
  });
});

describe('a field event', () => {
  // Ana's collection on load 101050, as her phone sends it; the test changes what it needs.
  const sync = (more: Record<string, unknown>): [string, unknown[]] =>
    eventInsertOf(fieldEventLike(tested.world, { ticket_number: '101050', ...more }));

  it('AC-02-43 carries its assignment and the setup version of the phone’s lists', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    // A phone's record without either is refused by the check that tells it from one created in
    // the back office (C44, ADR-324).
    for (const missing of [
      { assignment_id: null, setup_version: null },
      { setup_version: null },
      { assignment_id: null },
    ]) {
      expect((await db.refused(...sync(missing))).code, Object.keys(missing).join(' ')).toBe(
        refusedBy.check,
      );
    }
    expect(
      (
        await db.refused(
          ...sync({ assignment_id: '019a0000-0000-7000-8000-00000000dead', setup_version: 3 }),
        )
      ).code,
    ).toBe(refusedBy.foreignKey);
    expect(await db.run(...sync({ setup_version: 3 }))).toBe(1);
    expect(
      await db.one(
        `SELECT "assignment_id"::text AS assignment, "setup_version" FROM "field_event"
         WHERE "project_id" = $1 AND "ticket_number" = '101050'`,
        [world.p1],
      ),
    ).toEqual({ assignment: world.assignments.p1, setup_version: 3 });
  });

  it('AC-02-43 has both corrected by permission, like any captured field; never by the worker', async () => {
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

  it('AC-02-43 is never recorded by the system actor', async () => {
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
