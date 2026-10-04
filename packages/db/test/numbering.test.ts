// REQ-105k, 106a, 114: a project's number series, its control ranges, and number blocks that never
// hold the same number (spec/DATA-MODEL.md §3 "Numbering", §8; ADR-046, 056, 062, 065, 151, 181,
// 323). The numbering scenarios of spec/acceptance/04-field-capture.md, proven at the database:
// AC-04-01, 04, 05, 07, 08, 09 and 14, with AC-03-06 and AC-01-09. Which numbers the next block
// takes, and what a phone gives out, are packages/domain's (numbers.test.ts); the allocator is
// apps/api's NumberAllocator, driven by the story dispatch-monday. The series are the example
// world's: P1's loads from 101001, haul-outs from 201001, unit rate tickets from 301001, cert
// numbers from 730415.
import { ticketNumbers } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf, projectLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

async function add(table: string, row: Record<string, unknown>): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf(table, row))).id;
}

async function refusedRow(table: string, row: Record<string, unknown>): Promise<string> {
  return (await tested.db.refused(...insertOf(table, row))).code;
}

const series = (
  projectId: string,
  name: string,
  firstNumber: number,
  nextNumber = firstNumber,
): Record<string, unknown> => ({
  project_id: projectId,
  series: name,
  first_number: firstNumber,
  next_number: nextNumber,
});

// A block of P1's, on the example world's phone unless the test names another.
const block = (
  name: string,
  firstNumber: number,
  lastNumber: number,
  more: Record<string, unknown> = {},
): Record<string, unknown> => ({
  device_id: tested.world.device,
  project_id: tested.world.p1,
  series: name,
  first_number: firstNumber,
  last_number: lastNumber,
  ...more,
});

const range = (
  projectId: string,
  name: string,
  firstNumber: number,
  lastNumber: number,
): Record<string, unknown> => ({
  project_id: projectId,
  series: name,
  first_number: firstNumber,
  last_number: lastNumber,
});

// "Bayline County PARKS, Hurricane Delphine": a project numbered from control tickets.
async function parks(): Promise<string> {
  const { world } = tested;
  const project = await add(
    'project',
    projectLike(world, {
      name: 'Bayline County PARKS, Hurricane Delphine',
      ticket_number_source: 'CONTROL',
    }),
  );
  await add('project_number_series', series(project, 'UNIT_RATE', 100001));
  return project;
}

describe("a project's number series", () => {
  it('AC-04-01, AC-01-09 P1 has a series for each workflow, loads from 101001, haul-outs from 201001, unit rate tickets from 301001; AC-03-06 its cert numbers from 730415', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      await db.rows(
        `SELECT "series"::text, "first_number", "next_number" FROM "project_number_series"
         WHERE "project_id" = $1 ORDER BY "series"`,
        [world.p1],
      ),
    ).toEqual([
      { series: 'CERTIFICATION', first_number: 730415, next_number: 730415 },
      { series: 'HAUL_OUT', first_number: 201001, next_number: 201001 },
      { series: 'LOAD', first_number: 101001, next_number: 101001 },
      { series: 'ROE', first_number: 1, next_number: 1 },
      { series: 'UNIT_RATE', first_number: 301001, next_number: 301001 },
    ]);
  });

  it('AC-04-01 is one per project and series', async () => {
    const { world } = tested;
    await asTheApi();
    expect(await refusedRow('project_number_series', series(world.p1, 'LOAD', 150001))).toBe(
      refusedBy.unique,
    );
  });

  it.each(['LOAD', 'HAUL_OUT', 'UNIT_RATE'])(
    'AC-04-01 a %s series runs from 100,001 to 9,999,999: a start outside that is refused',
    async (name) => {
      const { world } = tested;
      await asTheApi();
      const project = await add('project', projectLike(world, { name: 'Another project' }));
      expect(
        await refusedRow('project_number_series', series(project, name, ticketNumbers.first - 1)),
      ).toBe(refusedBy.check);
      expect(
        await refusedRow(
          'project_number_series',
          series(project, name, ticketNumbers.first, ticketNumbers.last + 2),
        ),
      ).toBe(refusedBy.check);
      // Used up: its next number is one past the end.
      await add(
        'project_number_series',
        series(project, name, ticketNumbers.first, ticketNumbers.last + 1),
      );
    },
  );

  it('AC-03-06, AC-04-14 a cert-number or an ROE series starts where the firm says, at 1 or more; no series goes back before its start', async () => {
    const { db, world } = tested;
    await asTheApi();
    const project = await add('project', projectLike(world, { name: 'Another project' }));
    await add('project_number_series', series(project, 'CERTIFICATION', 610810));
    const roe = await add('project_number_series', series(project, 'ROE', 1));
    expect(
      (
        await db.refused(`UPDATE "project_number_series" SET "first_number" = 0 WHERE "id" = $1`, [
          roe,
        ])
      ).code,
    ).toBe(refusedBy.check);
    expect(
      await db.run(`UPDATE "project_number_series" SET "next_number" = 101 WHERE "id" = $1`, [roe]),
    ).toBe(1);
    expect(
      (
        await db.refused(
          `UPDATE "project_number_series" SET "first_number" = 200 WHERE "id" = $1`,
          [roe],
        )
      ).code,
    ).toBe(refusedBy.check);
  });

  it("is the server's to move on: the worker reads it and writes nothing; nothing deletes it", async () => {
    const { db, world } = tested;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      await db.rows(`SELECT 1 FROM "project_number_series" WHERE "project_id" = $1`, [world.p1]),
    ).toHaveLength(5);
    expect(
      (
        await db.refused(
          `UPDATE "project_number_series" SET "next_number" = "next_number" + 1000 WHERE "project_id" = $1`,
          [world.p1],
        )
      ).code,
    ).toBe(refusedBy.grant);
    await asTheApi();
    expect(
      (await db.refused(`DELETE FROM "project_number_series" WHERE "project_id" = $1`, [world.p1]))
        .code,
    ).toBe(refusedBy.grant);
  });
});

describe('a number block', () => {
  it('AC-04-04 is 1,000 numbers of a series: 201001–202000 of the haul-out series, 301001–302000 of the unit rate series; AC-03-06 100 cert numbers', async () => {
    const { db, world } = tested;
    await asTheApi();
    await add('number_block', block('HAUL_OUT', 201001, 202000));
    await add('number_block', block('UNIT_RATE', 301001, 302000));
    await add('number_block', block('CERTIFICATION', 730415, 730514));
    expect(
      await db.rows(
        `SELECT "series"::text, "last_number" - "first_number" + 1 AS numbers, "status"::text
         FROM "number_block" WHERE "project_id" = $1 ORDER BY "first_number"`,
        [world.p1],
      ),
    ).toEqual([
      { series: 'HAUL_OUT', numbers: 1000, status: 'ISSUED' },
      { series: 'UNIT_RATE', numbers: 1000, status: 'ISSUED' },
      { series: 'CERTIFICATION', numbers: 100, status: 'ISSUED' },
    ]);
  });

  it('AC-04-05 two phones can never hold the same number: a second block of the series that shares any number with it is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    await add('number_block', block('LOAD', 101001, 102000));
    const other = { device_id: world.certifyingDevice };
    for (const [first, last] of [
      [101500, 102499],
      [102000, 102999],
      [101001, 101001],
      [100500, 101001],
      [100001, 9999999],
    ] as const) {
      const refusal = await db.refused(
        ...insertOf('number_block', block('LOAD', first, last, other)),
      );
      expect(refusal.code, `${String(first)}–${String(last)}`).toBe(refusedBy.exclusion);
      expect(refusal.message).toContain('"number_blocks_never_overlap"');
    }
    // The same phone can't hold a number twice either.
    expect(await refusedRow('number_block', block('LOAD', 101500, 102499))).toBe(
      refusedBy.exclusion,
    );
    // The next run of the series is another phone's.
    await add('number_block', block('LOAD', 102001, 103000, other));
  });

  it('AC-04-05, AC-04-02 a block of the haul-out series over the same range is not refused, nor one of another project', async () => {
    const { world } = tested;
    await asTheApi();
    await add('number_block', block('LOAD', 201001, 202000));
    await add('number_block', block('HAUL_OUT', 201001, 202000));
    await add('number_block', block('LOAD', 201001, 202000, { project_id: world.p2 }));
  });

  it('AC-04-05 a block moved or stretched onto another block’s numbers is refused too', async () => {
    const { db } = tested;
    await asTheApi();
    await add('number_block', block('LOAD', 101001, 102000));
    const second = await add('number_block', block('LOAD', 102001, 103000));
    for (const change of [
      `"first_number" = 102000`,
      `"first_number" = 101001, "last_number" = 101001`,
    ]) {
      expect(
        (await db.refused(`UPDATE "number_block" SET ${change} WHERE "id" = $1`, [second])).code,
        change,
      ).toBe(refusedBy.exclusion);
    }
  });

  it('AC-04-07 reclaimed, it holds only what its phone used: the unused rest is cut again for the next phone, once', async () => {
    const { db, world } = tested;
    await asTheApi();
    const first = await add('number_block', block('LOAD', 101001, 102000));
    const next = block('LOAD', 101007, 102000, { device_id: world.certifyingDevice });
    // While P1-COL-1 holds it, and while it has only reported, the rest is still its own.
    expect(await refusedRow('number_block', next)).toBe(refusedBy.exclusion);
    await db.run(`UPDATE "number_block" SET "last_used_number" = 101006 WHERE "id" = $1`, [first]);
    expect(await refusedRow('number_block', next)).toBe(refusedBy.exclusion);
    await db.run(
      `UPDATE "number_block" SET "status" = 'RECLAIMED', "ended_at" = '2026-10-14T18:00:00Z' WHERE "id" = $1`,
      [first],
    );
    expect(
      await db.one(
        `SELECT "status"::text, "last_used_number" FROM "number_block" WHERE "id" = $1`,
        [first],
      ),
    ).toEqual({ status: 'RECLAIMED', last_used_number: 101006 });
    // A number it used is never cut again.
    expect(
      await refusedRow(
        'number_block',
        block('LOAD', 101006, 102000, { device_id: world.certifyingDevice }),
      ),
    ).toBe(refusedBy.exclusion);
    await add('number_block', next);
    // Cut once: not for a third phone, and the first can't take its block back.
    expect(await refusedRow('number_block', block('LOAD', 101500, 101600))).toBe(
      refusedBy.exclusion,
    );
    for (const change of [
      `"status" = 'ISSUED', "ended_at" = NULL`,
      `"last_used_number" = 101007`,
    ]) {
      expect(
        (await db.refused(`UPDATE "number_block" SET ${change} WHERE "id" = $1`, [first])).code,
        change,
      ).toBe(refusedBy.exclusion);
    }
  });

  it('AC-04-07 reclaimed unused, it holds nothing: the whole run is cut again, from the same start', async () => {
    const { db, world } = tested;
    await asTheApi();
    const first = await add('number_block', block('LOAD', 101001, 102000));
    await db.run(
      `UPDATE "number_block" SET "status" = 'RECLAIMED', "ended_at" = '2026-10-14T18:00:00Z' WHERE "id" = $1`,
      [first],
    );
    await add('number_block', block('LOAD', 101001, 102000, { device_id: world.certifyingDevice }));
  });

  it('AC-04-07 a lost phone’s retired block holds its whole run for good: nobody can be sure what it used', async () => {
    const { db, world } = tested;
    await asTheApi();
    const lost = await add('number_block', block('LOAD', 101001, 102000));
    await db.run(
      `UPDATE "number_block" SET "last_used_number" = 101006, "status" = 'RETIRED', "ended_at" = '2026-10-14T18:00:00Z' WHERE "id" = $1`,
      [lost],
    );
    expect(
      await refusedRow(
        'number_block',
        block('LOAD', 101007, 102000, { device_id: world.certifyingDevice }),
      ),
    ).toBe(refusedBy.exclusion);
  });

  it('AC-04-01 a number outside 100,001 to 9,999,999 is never issued as a ticket number; a cert number or an ROE number may be', async () => {
    const { world } = tested;
    await asTheApi();
    for (const name of ['LOAD', 'HAUL_OUT', 'UNIT_RATE']) {
      expect(await refusedRow('number_block', block(name, 100000, 100999)), name).toBe(
        refusedBy.check,
      );
      expect(await refusedRow('number_block', block(name, 9999001, 10000000)), name).toBe(
        refusedBy.check,
      );
    }
    await add('number_block', block('CERTIFICATION', 88001, 88100));
    await add('number_block', block('ROE', 1, 100, { project_id: world.p2 }));
  });

  it('AC-04-09 is cut only from a series its project has: a control-ticket project has no block of load numbers', async () => {
    await asTheApi();
    const project = await parks();
    expect(
      await refusedRow('number_block', block('LOAD', 400001, 401000, { project_id: project })),
    ).toBe(refusedBy.foreignKey);
    await add('number_block', block('UNIT_RATE', 100001, 101000, { project_id: project }));
  });

  it('AC-04-14 P2’s ROE numbers come from a series of their own, apart from its ticket series', async () => {
    const { db, world } = tested;
    await asTheApi();
    await add('number_block', block('LOAD', 102001, 103000, { project_id: world.p2 }));
    // The same numbers as ROE numbers are another series' block.
    await add('number_block', block('ROE', 1, 100, { project_id: world.p2 }));
    await add('number_block', block('ROE', 102001, 102100, { project_id: world.p2 }));
    expect(await refusedRow('number_block', block('ROE', 100, 199, { project_id: world.p2 }))).toBe(
      refusedBy.exclusion,
    );
    expect(
      await db.rows(
        `SELECT "series"::text FROM "number_block" WHERE "project_id" = $1 ORDER BY "series", "first_number"`,
        [world.p2],
      ),
    ).toEqual([{ series: 'LOAD' }, { series: 'ROE' }, { series: 'ROE' }]);
  });
});

describe('a control range', () => {
  it('AC-04-08 400001–405000 is kept for the loads of a project numbered from control tickets; AC-04-09 its unit rate tickets are still generated, from a series of their own', async () => {
    const { db } = tested;
    await asTheApi();
    const project = await parks();
    await add('control_range', range(project, 'LOAD', 400001, 405000));
    expect(
      await db.rows(
        `SELECT "series"::text, "first_number", "last_number", "archived_at" FROM "control_range" WHERE "project_id" = $1`,
        [project],
      ),
    ).toEqual([{ series: 'LOAD', first_number: 400001, last_number: 405000, archived_at: null }]);
    expect(
      await db.rows(
        `SELECT "series"::text, "first_number" FROM "project_number_series" WHERE "project_id" = $1`,
        [project],
      ),
    ).toEqual([{ series: 'UNIT_RATE', first_number: 100001 }]);
  });

  it.each(['UNIT_RATE', 'CERTIFICATION', 'ROE'])(
    'AC-04-09 never numbers %s: only loads and haul-outs are numbered from control tickets',
    async (name) => {
      await asTheApi();
      const project = await parks();
      expect(await refusedRow('control_range', range(project, name, 400001, 405000))).toBe(
        refusedBy.check,
      );
    },
  );

  it('is a run, first to last, of the printer’s own numbers', async () => {
    await asTheApi();
    const project = await parks();
    expect(await refusedRow('control_range', range(project, 'LOAD', 405000, 400001))).toBe(
      refusedBy.check,
    );
    expect(await refusedRow('control_range', range(project, 'LOAD', 0, 100))).toBe(refusedBy.check);
    // Pre-printed stock isn't held to 100,001 to 9,999,999.
    await add('control_range', range(project, 'LOAD', 1, 5000));
    await add('control_range', range(project, 'HAUL_OUT', 12000001, 12005000));
  });

  it('AC-04-08 the same stock entered twice is refused; a haul-out range over the same numbers is not; one taken off no longer counts', async () => {
    const { db } = tested;
    await asTheApi();
    const project = await parks();
    const first = await add('control_range', range(project, 'LOAD', 400001, 405000));
    const refusal = await db.refused(
      ...insertOf('control_range', range(project, 'LOAD', 405000, 410000)),
    );
    expect(refusal.code).toBe(refusedBy.exclusion);
    expect(refusal.message).toContain('"control_ranges_never_overlap"');
    await add('control_range', range(project, 'HAUL_OUT', 400001, 405000));
    await add('control_range', range(project, 'LOAD', 405001, 410000));
    await db.run(`UPDATE "control_range" SET "archived_at" = now() WHERE "id" = $1`, [first]);
    const again = await add('control_range', range(project, 'LOAD', 400001, 405000));
    // The one taken off can't be put back while the other stands.
    expect(
      (await db.refused(`UPDATE "control_range" SET "archived_at" = NULL WHERE "id" = $1`, [first]))
        .code,
    ).toBe(refusedBy.exclusion);
    expect(again).not.toBe(first);
  });

  it("is the back office's to enter: the worker reads it and writes nothing; nothing deletes it; each change is audited", async () => {
    const { db, world } = tested;
    await asTheApi();
    const project = await parks();
    const id = await add('control_range', range(project, 'LOAD', 400001, 405000));
    expect((await db.refused(`DELETE FROM "control_range" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.grant,
    );
    expect(
      await db.rows(
        `SELECT "operation"::text, "domain"::text FROM "audit_record" WHERE "record_id" = $1`,
        [id],
      ),
    ).toEqual([{ operation: 'INSERT', domain: 'OPERATIONS' }]);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(await db.rows(`SELECT 1 FROM "control_range" WHERE "id" = $1`, [id])).toHaveLength(1);
    expect(await refusedRow('control_range', range(project, 'LOAD', 500001, 505000))).toBe(
      refusedBy.grant,
    );
  });
});

describe('numbering, for a read-only viewer', () => {
  it('AC-02-70 a client user sees their project’s series and control ranges, and never a phone’s blocks', async () => {
    const { db, world } = tested;
    await asTheApi();
    await add('number_block', block('LOAD', 101001, 102000));
    await db.as('adms_readonly');
    await db.viewer(world.clientViewer);
    expect(
      await db.rows(`SELECT "series"::text FROM "viewer_project_number_series" ORDER BY "series"`),
    ).toEqual(
      ['CERTIFICATION', 'HAUL_OUT', 'LOAD', 'ROE', 'UNIT_RATE'].map((name) => ({ series: name })),
    );
    expect(await db.rows(`SELECT 1 FROM "viewer_control_range"`)).toEqual([]);
    expect((await db.refused(`SELECT 1 FROM "number_block"`)).code).toBe(refusedBy.grant);
    // A contractor user sees none of the setup.
    await db.viewer(world.coastlineViewer);
    expect(await db.rows(`SELECT 1 FROM "viewer_project_number_series"`)).toEqual([]);
  });
});
