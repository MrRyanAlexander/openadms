// REQ-102, 112d: pay items in full, a rate for each prime, a crew day's steps (spec/DATA-MODEL.md
// §3 "Pay items and rates"; ADR-087, 128, 206, 207, 210, 221, 223, 235, 292, 301, 305, 309).
// Section E of spec/acceptance/01-setup.md, proven at the database: AC-01-39…44 and 47…51, and
// AC-01-78 for these tables. Overlapping size bands (AC-01-45) and a gap between them (AC-01-46)
// are packages/domain's (SizeBands); that every ticked capture setting is checked is the worker's
// (BACKLOG 1.5.7). The pay items are P1's as the example world enters them from the golden
// mission §1, with Coastline's rate on each.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf, payItemLike, primeOn, subOn, without } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

// Adds a row as whoever the test is acting as; its id.
async function add(table: string, row: Record<string, unknown>): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf(table, row))).id;
}

async function refusedRow(table: string, row: Record<string, unknown>): Promise<string> {
  return (await tested.db.refused(...insertOf(table, row))).code;
}

// A rate on one of P1's pay items, for the prime the test names.
function rateOn(payItemId: string, primeId: string, rate = '8.0000'): Record<string, unknown> {
  return { project_id: tested.world.p1, pay_item_id: payItemId, prime_id: primeId, rate };
}

// A value of one of the firm's lists, by the name it ships with: its id.
async function picked(list: string, name: string): Promise<string> {
  return (
    await tested.db.one<{ id: string }>(`SELECT "id"::text FROM "${list}" WHERE "name" = $1`, [
      name,
    ])
  ).id;
}

// A payable type the firm adds to its list, as the golden mission's fill and freon ones are.
async function payableTypeAdded(name: string, position: number): Promise<string> {
  return add('payable_type', { name, position });
}

describe('a pay item', () => {
  it('AC-01-39 holds its code, description, payable type, Unit of Measure, capture settings and a rate for each prime', async () => {
    const { db, world } = tested;
    await asTheApi();
    const held = await db.one(
      `SELECT p."code", p."description", t."name" AS payable_type, p."unit"::text,
         p."kind_of_work_id", p."band_from", p."band_to",
         p."count_is_always_one", p."gps_required", p."measurement_required",
         p."decimals_allowed", p."photos_required", p."monitor_may_mark_ineligible",
         p."quantity_from_carried_tickets", p."crew_time_conversion", p."crew_day_hours",
         (SELECT json_agg(json_build_object('prime', c."name", 'rate', r."rate"::text))
          FROM "pay_item_rate" r JOIN "contractor" c ON c."id" = r."prime_id"
          WHERE r."pay_item_id" = p."id") AS rates
       FROM "pay_item" p JOIN "payable_type" t ON t."id" = p."payable_type_id"
       WHERE p."id" = $1`,
      [world.payItems.vegHaul15],
    );
    expect(held).toEqual({
      code: 'VEG-HAUL-CY-15',
      description: 'ROW VEG haul 0–15 mi',
      payable_type: 'Vegetative',
      unit: 'CY',
      kind_of_work_id: null,
      band_from: null,
      band_to: null,
      count_is_always_one: false,
      gps_required: false,
      measurement_required: false,
      decimals_allowed: false,
      photos_required: false,
      monitor_may_mark_ineligible: false,
      quantity_from_carried_tickets: false,
      crew_time_conversion: null,
      crew_day_hours: null,
      rates: [{ prime: 'Coastline Haulers LLC', rate: '7.5000' }],
    });
  });

  it('AC-01-39 a code with no description is refused; it has no other name', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(await refusedRow('pay_item', without(payItemLike(world), 'description'))).toBe(
      refusedBy.notNull,
    );
    expect(await refusedRow('pay_item', without(payItemLike(world), 'project_id'))).toBe(
      refusedBy.notNull,
    );
    const columns = await db.rows<{ column_name: string }>(
      `SELECT "column_name" FROM information_schema.columns
       WHERE "table_schema" = 'public' AND "table_name" = 'pay_item' ORDER BY "column_name"`,
    );
    expect(columns.map((column) => column.column_name)).not.toContain('name');
  });

  it('AC-01-40 a code that doesn’t follow the convention is saved as typed, compared exactly as typed', async () => {
    const { db, world } = tested;
    await asTheApi();
    for (const code of ['Veg haul, near', 'veg-haul-cy-15', 'VEG-HAUL-CY-15 ']) {
      const id = await add('pay_item', payItemLike(world, { code }));
      expect(
        (await db.one<{ code: string }>(`SELECT "code" FROM "pay_item" WHERE "id" = $1`, [id]))
          .code,
      ).toBe(code);
    }
  });

  it('AC-01-41 keeps its code to itself on its project: a second pay item with that code is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    // VEG-HAUL-CY-15 is P1's already. The same code again is refused, whatever it is described as
    // (ADR-301)…
    const again = payItemLike(world, {
      code: 'VEG-HAUL-CY-15',
      description: 'ROW VEG haul 0–15 mi, from 15 Oct',
    });
    expect(await refusedRow('pay_item', again)).toBe(refusedBy.unique);
    // …and stays taken once the first is archived: old tickets and the audit log still name it.
    expect(
      await db.run(`UPDATE "pay_item" SET "archived_at" = now() WHERE "id" = $1`, [
        world.payItems.vegHaul15,
      ]),
    ).toBe(1);
    expect(await refusedRow('pay_item', again)).toBe(refusedBy.unique);
    // A rate that changes from a date is a second pay item with a code of its own, the firm's
    // choice; its description is whatever the firm wants, the first one's words included.
    await add(
      'pay_item',
      payItemLike(world, { code: 'VEG-HAUL-CY-15-B', description: 'ROW VEG haul 0–15 mi' }),
    );
    // A code is its project's: another project may use the same one.
    await add('pay_item', payItemLike(world, { project_id: world.p2, code: 'VEG-HAUL-CY-15' }));
  });

  it('AC-01-43 with no payable type is refused, on a load, a haul-out or a fee alike', async () => {
    const { world } = tested;
    await asTheApi();
    for (const code of ['VEG-HAUL-CY-30', 'MULCH-HO-CY', 'TIP-FEE-CY-BCL']) {
      expect(
        await refusedRow('pay_item', without(payItemLike(world, { code }), 'payable_type_id')),
        code,
      ).toBe(refusedBy.notNull);
    }
    // A payable type is one of the firm's list, never typed.
    expect(
      await refusedRow(
        'pay_item',
        payItemLike(world, { payable_type_id: world.kindsOfWork.hangers }),
      ),
    ).toBe(refusedBy.foreignKey);
    // The fee's own payable type is on the firm's list, as the seed writes it.
    await add(
      'pay_item',
      payItemLike(world, {
        code: 'TIP-FEE-CY-BCL',
        description: 'Tipping fee, Bayline County Landfill',
        payable_type_id: await picked('payable_type', 'Tipping fee'),
      }),
    );
  });

  it('AC-01-44 its Unit of Measure is one of CY TN EA LB HR CREW_DAY TBN; it has no weight box, fee label or debris type', async () => {
    const { db, world } = tested;
    await asTheApi();
    const units = await db.rows<{ unit: string }>(
      `SELECT unnest(enum_range(NULL::"billing_unit"))::text AS unit`,
    );
    expect(units.map((row) => row.unit)).toEqual(['CY', 'TN', 'EA', 'LB', 'HR', 'CREW_DAY', 'TBN']);
    for (const unit of ['TON', 'YD', 'cy', '']) {
      expect(await refusedRow('pay_item', payItemLike(world, { unit })), unit).toBe(
        refusedBy.badValue,
      );
    }
    expect(await refusedRow('pay_item', without(payItemLike(world), 'unit'))).toBe(
      refusedBy.notNull,
    );
    // TN is what says the load is weighed: the golden mission's mulch haul-out by the ton.
    await add(
      'pay_item',
      payItemLike(world, {
        code: 'MULCH-HO-TN',
        description: 'Mulch haul-out to FDS, by weight',
        unit: 'TN',
      }),
    );
    const columns = await db.rows<{ column_name: string }>(
      `SELECT "column_name" FROM information_schema.columns
       WHERE "table_schema" = 'public' AND "table_name" = 'pay_item' ORDER BY "column_name"`,
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      'archived_at',
      'band_from',
      'band_to',
      'code',
      'count_is_always_one',
      'created_at',
      'crew_day_hours',
      'crew_time_conversion',
      'decimals_allowed',
      'description',
      'gps_required',
      'id',
      'kind_of_work_id',
      'measurement_required',
      'monitor_may_mark_ineligible',
      'payable_type_id',
      'photos_required',
      'project_id',
      'quantity_from_carried_tickets',
      'unit',
    ]);
  });

  it('AC-01-47 a unit rate pay item names its kind of work: Hangers for HNG-RMV-EA; a hauling one names none', async () => {
    const { db, world } = tested;
    await asTheApi();
    const kinds = await db.rows<{ code: string; kind_of_work: string | null }>(
      `SELECT p."code", k."name" AS kind_of_work
       FROM "pay_item" p LEFT JOIN "kind_of_work" k ON k."id" = p."kind_of_work_id"
       WHERE p."project_id" = $1 ORDER BY p."code"`,
      [world.p1],
    );
    expect(kinds).toEqual([
      { code: 'CREW-TIME-HR', kind_of_work: 'Crew time' },
      { code: 'HNG-RMV-EA', kind_of_work: 'Hangers' },
      { code: 'LNR-RMV-EA-24', kind_of_work: 'Leaners' },
      { code: 'LNR-RMV-EA-99', kind_of_work: 'Leaners' },
      { code: 'STP-RMV-EA-36', kind_of_work: 'Stumps' },
      { code: 'VEG-HAUL-CY-15', kind_of_work: null },
    ]);
    // A kind of work is one of the firm's list, never typed.
    expect(
      await refusedRow(
        'pay_item',
        payItemLike(world, { code: 'X', kind_of_work_id: world.payableTypes.hangers }),
      ),
    ).toBe(refusedBy.foreignKey);
  });

  it('AC-01-48 its capture settings are kept as ticked, and each one is stated: none has a default', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(
      `UPDATE "pay_item" SET "measurement_required" = true, "monitor_may_mark_ineligible" = true
       WHERE "id" = $1`,
      [world.payItems.leaners24],
    );
    expect(
      await db.one(
        `SELECT "count_is_always_one", "gps_required", "measurement_required", "decimals_allowed",
           "photos_required", "monitor_may_mark_ineligible", "quantity_from_carried_tickets"
         FROM "pay_item" WHERE "id" = $1`,
        [world.payItems.leaners24],
      ),
    ).toEqual({
      count_is_always_one: true,
      gps_required: false,
      measurement_required: true,
      decimals_allowed: false,
      photos_required: true,
      monitor_may_mark_ineligible: true,
      quantity_from_carried_tickets: false,
    });
    for (const setting of [
      'count_is_always_one',
      'gps_required',
      'measurement_required',
      'decimals_allowed',
      'photos_required',
      'monitor_may_mark_ineligible',
      'quantity_from_carried_tickets',
    ]) {
      expect(await refusedRow('pay_item', without(payItemLike(world), setting)), setting).toBe(
        refusedBy.notNull,
      );
    }
  });

  it('AC-01-49 with no rate for any prime is saved: a $0 pay item, not an error', async () => {
    const { db, world } = tested;
    await asTheApi();
    const staged = await add(
      'pay_item',
      payItemLike(world, {
        code: 'WG-FRN-EA-STG',
        description: 'Freon staged',
        payable_type_id: await payableTypeAdded('Freon recovery', 100),
        unit: 'EA',
      }),
    );
    expect(
      await db.one(`SELECT count(*)::int AS rates FROM "pay_item_rate" WHERE "pay_item_id" = $1`, [
        staged,
      ]),
    ).toEqual({ rates: 0 });
  });

  it('keeps its size band in inches to a tenth, either end open; never below nought or backwards', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      await db.one(`SELECT "band_from"::text, "band_to"::text FROM "pay_item" WHERE "id" = $1`, [
        world.payItems.leaners99,
      ]),
    ).toEqual({ band_from: '24.1', band_to: '99.0' });
    const stumps = { payable_type_id: world.payableTypes.stumps, unit: 'EA' };
    await add('pay_item', payItemLike(world, { ...stumps, code: 'STP-UP', band_from: '48.1' }));
    await add('pay_item', payItemLike(world, { ...stumps, code: 'STP-TO', band_to: '24.0' }));
    for (const [from, to] of [
      ['36.0', '24.0'],
      ['-1.0', '24.0'],
      [null, '-0.1'],
    ]) {
      const refusal = await tested.db.refused(
        ...insertOf('pay_item', payItemLike(world, { ...stumps, band_from: from, band_to: to })),
      );
      expect(refusal.code, `${String(from)}–${String(to)}`).toBe(refusedBy.check);
      expect(refusal.message).toContain('"pay_item_band_check"');
    }
  });
});

describe('a pay item’s rates', () => {
  it('AC-01-42 one pay item holds a rate for each prime; a second rate for the same prime is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    // Summit is one of P1's primes already (the example world): Dana gives it its rate.
    await add('pay_item_rate', rateOn(world.payItems.vegHaul15, world.summit, '7.8500'));
    expect(
      await db.rows(
        `SELECT c."name" AS prime, r."rate"::text FROM "pay_item_rate" r
         JOIN "contractor" c ON c."id" = r."prime_id"
         WHERE r."pay_item_id" = $1 ORDER BY c."name"`,
        [world.payItems.vegHaul15],
      ),
    ).toEqual([
      { prime: 'Coastline Haulers LLC', rate: '7.5000' },
      { prime: 'Summit Debris Services', rate: '7.8500' },
    ]);
    expect(
      await db.one(
        `SELECT count(*)::int AS copies FROM "pay_item" WHERE "code" = 'VEG-HAUL-CY-15' AND "project_id" = $1`,
        [world.p1],
      ),
    ).toEqual({ copies: 1 });
    expect(
      await refusedRow('pay_item_rate', rateOn(world.payItems.vegHaul15, world.coastline)),
    ).toBe(refusedBy.unique);
  });

  it('AC-01-42 are only for the pay item’s own project’s primes: never a sub, another project’s prime or a contractor not on it', async () => {
    const { world } = tested;
    await asTheApi();
    const rivera = await add('contractor', { name: 'Rivera Trucking', kind: 'HAULER' });
    await add('project_contractor', subOn(world.p1, rivera, world.coastline));
    // A sub works under its prime's rate (ADR-081): it has none of its own.
    expect(await refusedRow('pay_item_rate', rateOn(world.payItems.vegHaul15, rivera))).toBe(
      refusedBy.foreignKey,
    );
    // Harbor Staffing is on no project.
    expect(await refusedRow('pay_item_rate', rateOn(world.payItems.vegHaul15, world.harbor))).toBe(
      refusedBy.foreignKey,
    );
    // A prime of P2 alone, named on a P1 pay item, or a P1 pay item passed off as P2's.
    const egret = await add('contractor', { name: 'Egret Point Hauling', kind: 'HAULER' });
    await add('project_contractor', primeOn(world.p2, egret));
    expect(await refusedRow('pay_item_rate', rateOn(world.payItems.vegHaul15, egret))).toBe(
      refusedBy.foreignKey,
    );
    expect(
      await refusedRow('pay_item_rate', {
        ...rateOn(world.payItems.vegHaul15, egret),
        project_id: world.p2,
      }),
    ).toBe(refusedBy.foreignKey);
  });

  it('a rate is nought or more; a rate is taken off by archiving and put back, never deleted', async () => {
    const { db, world } = tested;
    await asTheApi();
    const refusal = await db.refused(
      ...insertOf('pay_item_rate', rateOn(world.payItems.vegHaul15, world.summit, '-0.0100')),
    );
    expect(refusal.code).toBe(refusedBy.check);
    expect(refusal.message).toContain('"pay_item_rate_rate_check"');
    await add('pay_item_rate', rateOn(world.payItems.vegHaul15, world.summit, '0.0000'));
    const archive = `UPDATE "pay_item_rate" SET "archived_at" = $2 WHERE "id" = $1`;
    expect(await db.run(archive, [world.rates.vegHaul15, '2026-10-20T12:00:00Z'])).toBe(1);
    expect(await db.run(archive, [world.rates.vegHaul15, null])).toBe(1);
  });

  it('AC-01-51 a changed rate is kept on the pay item, and the audit log holds the change with the prior $7.50; there is no rate history table', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      await db.run(`UPDATE "pay_item_rate" SET "rate" = '7.7500' WHERE "id" = $1`, [
        world.rates.vegHaul15,
      ]),
    ).toBe(1);
    expect(
      await db.rows(
        `SELECT "rate"::text FROM "pay_item_rate" WHERE "pay_item_id" = $1 AND "prime_id" = $2`,
        [world.payItems.vegHaul15, world.coastline],
      ),
    ).toEqual([{ rate: '7.7500' }]);
    expect(
      await db.rows(
        `SELECT "operation"::text,
           CASE WHEN "operation" = 'UPDATE' THEN "changed_fields" END AS changed,
           "prior_value"->>'rate' AS prior,
           "actor_id"::text AS actor, "source"::text, "domain"::text
         FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
        [world.rates.vegHaul15],
      ),
    ).toEqual([
      {
        operation: 'INSERT',
        changed: null,
        prior: null,
        actor: world.admin,
        source: 'BACK_OFFICE',
        domain: 'BILLING',
      },
      {
        operation: 'UPDATE',
        changed: ['rate'],
        prior: '7.5000',
        actor: world.admin,
        source: 'BACK_OFFICE',
        domain: 'BILLING',
      },
    ]);
    const tables = await db.rows<{ table_name: string }>(
      `SELECT "table_name" FROM information_schema.tables
       WHERE "table_schema" = 'public' AND "table_name" LIKE '%rate%' ORDER BY "table_name"`,
    );
    expect(tables.map((table) => table.table_name)).toEqual(['pay_item_rate']);
  });
});

describe('how crew time’s hours become a quantity', () => {
  // A crew-time pay item on P1, by the CREW_DAY unless the test says.
  const crewDay = (more: Record<string, unknown>): Record<string, unknown> =>
    payItemLike(tested.world, {
      code: 'CREW-TIME-DAY',
      description: 'Crew time, by the crew day',
      payable_type_id: tested.world.payableTypes.crewTime,
      kind_of_work_id: tested.world.kindsOfWork.crewTime,
      unit: 'CREW_DAY',
      decimals_allowed: true,
      ...more,
    });

  it('AC-01-50 per hour (CREW-TIME-HR), a crew day by exact division (12 h unless changed), or a crew day in steps', async () => {
    const { db, world } = tested;
    await asTheApi();
    const exact = await add(
      'pay_item',
      crewDay({ crew_time_conversion: 'PER_DAY_EXACT', crew_day_hours: '12.00' }),
    );
    const steps = await add(
      'pay_item',
      crewDay({ code: 'CREW-TIME-STEP', crew_time_conversion: 'PER_DAY_STEPS' }),
    );
    for (const [from, to, quantity] of [
      ['1.50', '4.50', '0.2500'],
      ['4.75', '7.50', '0.5000'],
      ['7.75', '10.50', '0.7500'],
      ['10.75', '24.00', '1.0000'],
    ]) {
      await add('pay_item_crew_day_step', {
        pay_item_id: steps,
        from_hours: from,
        to_hours: to,
        quantity,
      });
    }
    expect(
      await db.rows(
        `SELECT "code", "unit"::text, "crew_time_conversion"::text AS conversion,
           "crew_day_hours"::text AS day,
           (SELECT count(*)::int FROM "pay_item_crew_day_step" s WHERE s."pay_item_id" = p."id") AS steps
         FROM "pay_item" p WHERE "id" = ANY($1) ORDER BY "code"`,
        [[world.payItems.crewTime, exact, steps]],
      ),
    ).toEqual([
      {
        code: 'CREW-TIME-DAY',
        unit: 'CREW_DAY',
        conversion: 'PER_DAY_EXACT',
        day: '12.00',
        steps: 0,
      },
      { code: 'CREW-TIME-HR', unit: 'HR', conversion: 'PER_HOUR', day: null, steps: 0 },
      {
        code: 'CREW-TIME-STEP',
        unit: 'CREW_DAY',
        conversion: 'PER_DAY_STEPS',
        day: null,
        steps: 4,
      },
    ]);
    // The firm changes the day length on the pay item.
    expect(
      await db.run(`UPDATE "pay_item" SET "crew_day_hours" = '10.00' WHERE "id" = $1`, [exact]),
    ).toBe(1);
  });

  it('AC-01-50 is said on a pay item by the hour or by the crew day, and only there; the day length only on an exact one', async () => {
    const { world } = tested;
    await asTheApi();
    const refused: [Record<string, unknown>, string][] = [
      [crewDay({ unit: 'HR' }), 'pay_item_crew_time_conversion_check'],
      [
        crewDay({ unit: 'HR', crew_time_conversion: 'PER_DAY_STEPS' }),
        'pay_item_crew_time_conversion_check',
      ],
      [crewDay({}), 'pay_item_crew_time_conversion_check'],
      [crewDay({ crew_time_conversion: 'PER_HOUR' }), 'pay_item_crew_time_conversion_check'],
      [
        payItemLike(world, { crew_time_conversion: 'PER_HOUR' }),
        'pay_item_crew_time_conversion_check',
      ],
      [crewDay({ crew_time_conversion: 'PER_DAY_EXACT' }), 'pay_item_crew_day_hours_check'],
      [
        crewDay({ crew_time_conversion: 'PER_DAY_STEPS', crew_day_hours: '12.00' }),
        'pay_item_crew_day_hours_check',
      ],
      [
        crewDay({ unit: 'HR', crew_time_conversion: 'PER_HOUR', crew_day_hours: '12.00' }),
        'pay_item_crew_day_hours_check',
      ],
      [
        crewDay({ crew_time_conversion: 'PER_DAY_EXACT', crew_day_hours: '0.00' }),
        'pay_item_crew_day_hours_check',
      ],
      [
        crewDay({ crew_time_conversion: 'PER_DAY_EXACT', crew_day_hours: '24.25' }),
        'pay_item_crew_day_hours_check',
      ],
    ];
    for (const [row, check] of refused) {
      const refusal = await tested.db.refused(...insertOf('pay_item', row));
      expect(refusal.code, JSON.stringify(row)).toBe(refusedBy.check);
      expect(refusal.message, JSON.stringify(row)).toContain(`"${check}"`);
    }
  });

  it('a step runs within a day, from no more than to, bills nought or more, and starts once on its pay item', async () => {
    await asTheApi();
    const steps = await add(
      'pay_item',
      crewDay({ code: 'CREW-TIME-STEP', crew_time_conversion: 'PER_DAY_STEPS' }),
    );
    const step = (from: string, to: string, quantity = '0.2500'): Record<string, unknown> => ({
      pay_item_id: steps,
      from_hours: from,
      to_hours: to,
      quantity,
    });
    await add('pay_item_crew_day_step', step('1.50', '4.50'));
    expect(await refusedRow('pay_item_crew_day_step', step('1.50', '6.00'))).toBe(refusedBy.unique);
    for (const [row, check] of [
      [step('4.50', '1.50'), 'pay_item_crew_day_step_hours_check'],
      [step('20.00', '24.25'), 'pay_item_crew_day_step_hours_check'],
      [step('-0.25', '1.00'), 'pay_item_crew_day_step_hours_check'],
      [step('4.75', '7.50', '-0.2500'), 'pay_item_crew_day_step_quantity_check'],
    ] as const) {
      const refusal = await tested.db.refused(...insertOf('pay_item_crew_day_step', row));
      expect(refusal.code, check).toBe(refusedBy.check);
      expect(refusal.message).toContain(`"${check}"`);
    }
  });
});

describe('who writes them', () => {
  it('the API writes pay items, rates and steps; the worker only reads them', async () => {
    const { db, world } = tested;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      await db.one(`SELECT count(*)::int AS rates FROM "pay_item_rate" WHERE "project_id" = $1`, [
        world.p1,
      ]),
    ).toEqual({ rates: 6 });
    for (const [sql, values] of [
      insertOf('pay_item', payItemLike(world)),
      insertOf('pay_item_rate', rateOn(world.payItems.vegHaul15, world.summit)),
      [`UPDATE "pay_item_rate" SET "rate" = 0`, []],
      [`UPDATE "pay_item" SET "unit" = 'TN'`, []],
      [`UPDATE "pay_item_crew_day_step" SET "quantity" = 0`, []],
    ] as [string, unknown[]][]) {
      expect((await db.refused(sql, values)).code, sql).toBe(refusedBy.grant);
    }
  });
});

// What an edit changes on each table, and the row of the example world to try it on.
const edited: [string, string, string, (world: typeof tested.world) => string][] = [
  ['pay_item', 'description', 'Hanger removal, per tree', (world) => world.payItems.hangers],
  ['pay_item_rate', 'rate', '70.0000', (world) => world.rates.hangers],
];

describe('changing them', () => {
  it.each(edited)(
    'AC-01-78 a %s row: an edit is audited with the prior value and its actor; a delete or a truncate is refused',
    async (table, column, value, rowOf) => {
      const { db, world } = tested;
      const id = rowOf(world);
      await asTheApi();
      const before = await db.one<{ prior: unknown }>(
        `SELECT to_jsonb("${column}") AS prior FROM "${table}" WHERE "id" = $1`,
        [id],
      );
      await db.run(`UPDATE "${table}" SET "${column}" = $2 WHERE "id" = $1`, [id, value]);
      expect(
        (
          await db.rows(
            `SELECT "operation"::text, "changed_fields" AS changed, "prior_value" AS prior,
               "actor_id"::text AS actor, "source"::text, "domain"::text
             FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
            [id],
          )
        ).at(-1),
      ).toMatchObject({
        operation: 'UPDATE',
        changed: [column],
        prior: { [column]: before.prior },
        actor: world.admin,
        source: 'BACK_OFFICE',
        domain: 'BILLING',
      });
      for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
        await db.as(login);
        await db.actor(world.admin, 'BACK_OFFICE');
        expect((await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id])).code, login).toBe(
          refusedBy.grant,
        );
      }
      const never = `Open ADMS never deletes a ${table} row: archive, close or void it instead`;
      for (const who of ['adms_owner', 'administrator'] as const) {
        if (who === 'administrator') await db.administer();
        else await db.as(who);
        for (const sql of [
          `DELETE FROM "${table}" WHERE "id" = '${id}'`,
          `TRUNCATE "${table}" CASCADE`,
        ]) {
          expect(await db.refused(sql), `${who}: ${sql}`).toEqual({
            code: refusedBy.trigger,
            message: never,
          });
        }
      }
    },
  );

  it('AC-01-78 a crew day’s step: an edit is audited; a delete is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    const steps = await add(
      'pay_item',
      payItemLike(world, {
        code: 'CREW-TIME-STEP',
        payable_type_id: world.payableTypes.crewTime,
        kind_of_work_id: world.kindsOfWork.crewTime,
        unit: 'CREW_DAY',
        crew_time_conversion: 'PER_DAY_STEPS',
      }),
    );
    const step = await add('pay_item_crew_day_step', {
      pay_item_id: steps,
      from_hours: '1.50',
      to_hours: '4.50',
      quantity: '0.2500',
    });
    await db.run(`UPDATE "pay_item_crew_day_step" SET "to_hours" = '5.00' WHERE "id" = $1`, [step]);
    expect(
      await db.rows(
        `SELECT "operation"::text,
           CASE WHEN "operation" = 'UPDATE' THEN "changed_fields" END AS changed, "domain"::text
         FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
        [step],
      ),
    ).toEqual([
      { operation: 'INSERT', changed: null, domain: 'BILLING' },
      { operation: 'UPDATE', changed: ['to_hours'], domain: 'BILLING' },
    ]);
    expect(
      (await db.refused(`DELETE FROM "pay_item_crew_day_step" WHERE "id" = $1`, [step])).code,
    ).toBe(refusedBy.grant);
    await db.as('adms_owner');
    expect(
      (await db.refused(`DELETE FROM "pay_item_crew_day_step" WHERE "id" = $1`, [step])).code,
    ).toBe(refusedBy.trigger);
  });
});
