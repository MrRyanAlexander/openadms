// A transaction in full: what a priced line holds, and what the database holds and refuses by
// itself whoever writes (spec/acceptance/07-pricing-ledger-audit.md, by scenario ID: AC-07-69, 73,
// 85, 86, 87, 88, 89, 97 and point 15 of its last table; spec/acceptance/03-certification.md
// AC-03-15; spec/DATA-MODEL.md §5, §6, §8; ADR-057, 081, 085, 090, 118, 212, 239, 295, 350, 358;
// invariants 4, 17, 21; BACKLOG C16, C17; REQ-106g). The worker prices in task 1.7.2: here a
// test writes, as the worker's login, the lines the worker will. The values are the golden
// mission's: 101002 (C&D, 36.0 CY to the Landfill on Rivera's self-loader), the split haul-out
// 201004 and the hanger 301001; and the pricing scenarios' load 101044 of Summit's.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  actionLike,
  insertOf,
  payItemLike,
  ruleLike,
  subOn,
  transactionLike,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { PricedTickets } from './support/priced-tickets.ts';

const tested = eachTestRolledBack();
const tickets = new PricedTickets(tested);

type Row = Record<string, unknown>;

// A line the worker tries to write: the refusal's code.
async function refusedLine(more: Row): Promise<string> {
  await tickets.asTheWorker();
  return tickets.refused('transaction', transactionLike(tested.world, more));
}

// The world's 101001 taken off a line, so a test can put another ticket in its place.
const noLoad = { completed_load_id: null, completed_load_collection_id: null };

describe('what a transaction holds', () => {
  it('AC-07-85, AC-07-73, AC-03-15 101002’s two lines hold their load and property, #, rule, pay item, contract, prime Coastline and operating sub Rivera, the unit as it was, the quantity, the rate, the amount and the run', async () => {
    const { db, world } = tested;
    const { haul, fee } = await tickets.cdToTheLandfill();
    const load = world.loads.l101002;
    // Whose work it is comes from the certification the tower scanned, never a monitor's pick.
    const whose = await db.one<{ prime: string; sub: string }>(
      `SELECT c."prime_id"::text AS prime, c."first_tier_sub_id"::text AS sub
       FROM "field_event" e JOIN "certification" c ON c."id" = e."certification_id"
       WHERE e."id" = $1`,
      [load.disposal],
    );
    expect(whose).toEqual({ prime: world.coastline, sub: world.rivera });
    await tickets.asTheWorker();
    const run = await tickets.add('reconciliation_run', {
      project_id: world.p1,
      trigger: 'SYNC',
      started_at: '2026-10-12T22:00:00Z',
    });
    const on101002 = {
      completed_load_id: load.completedLoad,
      completed_load_collection_id: load.completedLoadCollection,
      prime_id: whose.prime,
      operating_sub_id: whose.sub,
      quantity: '36.0000',
      reconciliation_run_id: run,
    };
    const first = await tickets.line({
      ...on101002,
      slot: 1,
      rule_id: haul.rule,
      pay_item_id: haul.payItem,
      rate: '8.2500',
      amount: '297.00',
    });
    await tickets.line({
      ...on101002,
      slot: 2,
      rule_id: fee.rule,
      pay_item_id: fee.payItem,
      rate: '4.0000',
      amount: '144.00',
    });
    const held = await db.rows(
      `SELECT t."slot", p."code", r."name" AS rule, c."name" AS contract, prime."name" AS prime,
         sub."name" AS operating_sub, t."unit"::text, t."quantity"::text, t."rate"::text,
         t."amount"::text, l."ticket_number", row."split_suffix",
         t."reconciliation_run_id"::text AS run, t."project_id"::text AS project
       FROM "transaction" t
       JOIN "pay_item" p ON p."id" = t."pay_item_id"
       JOIN "rule" r ON r."id" = t."rule_id"
       JOIN "contract" c ON c."id" = t."contract_id"
       JOIN "contractor" prime ON prime."id" = t."prime_id"
       JOIN "contractor" sub ON sub."id" = t."operating_sub_id"
       JOIN "completed_load" l ON l."id" = t."completed_load_id"
       JOIN "completed_load_collection" row ON row."id" = t."completed_load_collection_id"
       WHERE t."completed_load_id" = $1 ORDER BY t."slot"`,
      [load.completedLoad],
    );
    const both = {
      contract: 'Coastline, Bayline ROW 2026',
      prime: 'Coastline Haulers LLC',
      operating_sub: 'Rivera Trucking',
      unit: 'CY',
      quantity: '36.0000',
      ticket_number: '101002',
      split_suffix: '',
      run,
      project: world.p1,
    };
    expect(held).toEqual([
      {
        ...both,
        slot: 1,
        code: 'CD-HAUL-CY-15',
        rule: 'CD-HAUL-CY-15 - ROW C&D haul 0–15 mi',
        rate: '8.2500',
        amount: '297.00',
      },
      {
        ...both,
        slot: 2,
        code: 'TIP-FEE-CY-BCL',
        rule: 'TIP-FEE-CY-BCL - Tipping fee, Bayline County Landfill (per CY)',
        rate: '4.0000',
        amount: '144.00',
      },
    ]);
    // The line is audited as the worker's, in billing, whole.
    expect(
      await db.one(
        `SELECT "operation"::text, "actor_id"::text, "source"::text, "domain"::text,
           "new_value"->>'amount' AS amount, "new_value"->>'operating_sub_id' AS sub
         FROM "audit_record" WHERE "table_name" = 'transaction' AND "record_id" = $1`,
        [first],
      ),
    ).toEqual({
      operation: 'INSERT',
      actor_id: world.worker,
      source: 'SYSTEM',
      domain: 'BILLING',
      amount: '297.00',
      sub: world.rivera,
    });
  });

  it('AC-07-73 the prime’s own load names no operating sub', async () => {
    const { db, world } = tested;
    expect(
      await db.one(
        `SELECT "prime_id"::text AS prime, "operating_sub_id" AS sub, "amount"::text
         FROM "transaction" WHERE "id" = $1`,
        [world.transaction],
      ),
    ).toEqual({ prime: world.coastline, sub: null, amount: '390.00' });
  });

  it('AC-07-89 a line keeps no mileage of its own: it is read from its property’s or pile’s collection row', async () => {
    const { db } = tested;
    const columns = await db.rows<{ name: string }>(
      `SELECT attname AS name FROM pg_attribute
       WHERE attrelid = 'transaction'::regclass AND attnum > 0 AND NOT attisdropped
       ORDER BY attname`,
    );
    expect(columns.map((column) => column.name)).toEqual([
      'amount',
      'completed_haul_out_collection_id',
      'completed_haul_out_id',
      'completed_load_collection_id',
      'completed_load_id',
      'contract_id',
      'created_at',
      'field_event_id',
      'id',
      'operating_sub_id',
      'pay_item_id',
      'prime_id',
      'project_id',
      'quantity',
      'rate',
      'reconciliation_run_id',
      'rule_id',
      'slot',
      'unit',
    ]);
    const haulOut = await tickets.haulOut201004();
    const line = await tickets.line({
      ...noLoad,
      completed_haul_out_id: haulOut.completedHaulOut,
      completed_haul_out_collection_id: haulOut.piles.b,
      slot: 1,
      rule_id: haulOut.rule,
      pay_item_id: haulOut.payItem,
      unit: 'TN',
      quantity: '7.0600',
      rate: '20.0000',
      amount: '141.20',
    });
    expect(
      await db.one(
        `SELECT pile."split_suffix", pile."mileage"::text, pile."mileage_source"::text
         FROM "transaction" t
         JOIN "completed_haul_out_collection" pile ON pile."id" = t."completed_haul_out_collection_id"
         WHERE t."id" = $1`,
        [line],
      ),
    ).toEqual({ split_suffix: 'B', mileage: '13.9516', mileage_source: 'ROAD_ROUTE' });
  });
});

describe('a transaction is on exactly one kind of ticket', () => {
  it('AC-07-86 a load with the property it prices, a haul-out with the pile it prices, or a unit rate ticket’s field event; none, a ticket without its property or pile, and two at once are refused', async () => {
    const { world } = tested;
    const haulOut = await tickets.haulOut201004();
    const unitRate = await tickets.unitRate301001();
    const onThePile = {
      ...noLoad,
      completed_haul_out_id: haulOut.completedHaulOut,
      completed_haul_out_collection_id: haulOut.piles.a,
      slot: 1,
      rule_id: haulOut.rule,
      pay_item_id: haulOut.payItem,
      unit: 'TN',
      quantity: '2.8200',
      rate: '20.0000',
      amount: '56.40',
    };
    const onTheHanger = {
      ...noLoad,
      field_event_id: unitRate.fieldEvent,
      slot: 1,
      rule_id: unitRate.rule,
      pay_item_id: world.payItems.hangers,
      unit: 'EA',
      quantity: '1.0000',
      rate: '68.0000',
      amount: '68.00',
    };
    const pile = {
      completed_haul_out_id: haulOut.completedHaulOut,
      completed_haul_out_collection_id: haulOut.piles.a,
    };
    for (const [what, more] of [
      ['no ticket at all', noLoad],
      ['a load without its property', { completed_load_collection_id: null }],
      ['a property without its load', { completed_load_id: null }],
      ['a haul-out without its pile', { ...onThePile, completed_haul_out_collection_id: null }],
      ['a pile without its haul-out', { ...onThePile, completed_haul_out_id: null }],
      ['a load and a haul-out', pile],
      ['a load and a unit rate ticket', { field_event_id: unitRate.fieldEvent }],
      ['a haul-out and a unit rate ticket', { ...onThePile, field_event_id: unitRate.fieldEvent }],
      ['all three', { ...pile, field_event_id: unitRate.fieldEvent }],
    ] as const) {
      expect(await refusedLine(more), what).toBe(refusedBy.check);
    }
    // Each kind, alone, is taken.
    await tickets.line(onThePile);
    await tickets.line(onTheHanger);
    await tickets.line({ slot: 2 });
  });
});

describe('a # once per ticket and property or pile', () => {
  it('AC-07-87, AC-07-69 a second #1 on 101001 is refused; #1 on 201004-A beside #1 on 201004-B is not; a second #1 on a pile or on a unit rate ticket is', async () => {
    const haulOut = await tickets.haulOut201004();
    const unitRate = await tickets.unitRate301001();
    expect(await refusedLine({ slot: 1 }), '101001').toBe(refusedBy.unique);
    const onPile = (pile: string): Row => ({
      ...noLoad,
      completed_haul_out_id: haulOut.completedHaulOut,
      completed_haul_out_collection_id: pile,
      slot: 1,
      rule_id: haulOut.rule,
      pay_item_id: haulOut.payItem,
      unit: 'TN',
    });
    await tickets.line(onPile(haulOut.piles.a));
    await tickets.line(onPile(haulOut.piles.b));
    await tickets.line(onPile(haulOut.piles.c));
    expect(await refusedLine(onPile(haulOut.piles.a)), '201004-A').toBe(refusedBy.unique);
    await tickets.line({ ...onPile(haulOut.piles.a), slot: 2 });
    const onTheHanger = {
      ...noLoad,
      field_event_id: unitRate.fieldEvent,
      slot: 1,
      rule_id: unitRate.rule,
      pay_item_id: tested.world.payItems.hangers,
      unit: 'EA',
    };
    await tickets.line(onTheHanger);
    expect(await refusedLine(onTheHanger), '301001').toBe(refusedBy.unique);
  });

  it('a # is 1 or more, and no quantity, rate or amount is below nought; a $0 line is kept', async () => {
    for (const [what, more] of [
      ['#0', { slot: 0 }],
      ['a quantity below nought', { quantity: '-1' }],
      ['a rate below nought', { rate: '-0.0001' }],
      ['an amount below nought', { amount: '-0.01' }],
    ] as const) {
      expect(await refusedLine(more), what).toBe(refusedBy.check);
    }
    // No rate for the prime: the line is written at $0 and flagged (ADR-212).
    await tickets.line({ slot: 2, rate: '0', amount: '0' });
  });
});

describe('whatever a transaction names is its own project’s', () => {
  it('a load, a property, a field event, a rule, a pay item, a contract or a run of another project is refused; so is a property of another load and a pile of another haul-out', async () => {
    const { world } = tested;
    await tickets.asTheBackOffice();
    // P2's own: a load form with a rule on its contract, a pay item, and a run.
    const p2Form = await tickets.add('form', {
      project_id: world.p2,
      name: 'Load',
      document_type: 'LOAD',
    });
    const p2PayItem = await tickets.add(
      'pay_item',
      payItemLike(world, { project_id: world.p2, code: 'PPDR-VEG-CY' }),
    );
    const p2Rule = await tickets.add(
      'rule',
      ruleLike(world, {
        project_id: world.p2,
        form_id: p2Form,
        contract_id: world.contracts.coastlineP2,
      }),
    );
    await tickets.add(
      'rule_action',
      actionLike(world, p2Rule, 1, p2PayItem, { project_id: world.p2 }),
    );
    await tickets.asTheWorker();
    const p2Run = await tickets.add('reconciliation_run', {
      project_id: world.p2,
      trigger: 'SYNC',
      started_at: '2026-10-12T22:00:00Z',
    });
    const p2 = world.loads.l102001;
    // A second haul-out, 201005, whose pile 201004's can't be passed off as.
    const haulOut = await tickets.haulOut201004();
    const dumped = await tickets.synced({
      workflow: 'HAUL_OUT',
      kind: 'HAUL_OUT_DISPOSAL',
      ticket_number: '201005',
      cert_number: '730419',
      certification_id: world.certifications.c730419,
      site_id: world.landfill,
    });
    await tickets.asTheWorker();
    const another = await tickets.add('completed_haul_out', {
      project_id: world.p1,
      ticket_number: '201005',
      disposal_event_id: dumped,
      quantity_source: 'LOAD_CALL',
      weight_is_share: false,
      updated_at: '2026-10-13T22:00:00Z',
    });
    for (const [what, more] of [
      [
        "another haul-out's pile",
        {
          ...noLoad,
          completed_haul_out_id: another,
          completed_haul_out_collection_id: haulOut.piles.a,
          rule_id: haulOut.rule,
          pay_item_id: haulOut.payItem,
          unit: 'TN',
        },
      ],
      [
        'a load of P2',
        {
          completed_load_id: p2.completedLoad,
          completed_load_collection_id: p2.completedLoadCollection,
        },
      ],
      [
        "another load's property",
        { completed_load_collection_id: world.loads.l101002.completedLoadCollection },
      ],
      ['a field event of P2', { ...noLoad, field_event_id: p2.collection }],
      ['a rule of P2', { rule_id: p2Rule }],
      ['a pay item of P2', { pay_item_id: p2PayItem }],
      ['a contract of P2', { contract_id: world.contracts.coastlineP2 }],
      ['a run of P2', { reconciliation_run_id: p2Run }],
    ] as const) {
      expect(await refusedLine(more), what).toBe(refusedBy.foreignKey);
    }
    // The same line on P2, with everything P2's, is taken.
    await tickets.line({
      project_id: world.p2,
      completed_load_id: p2.completedLoad,
      completed_load_collection_id: p2.completedLoadCollection,
      slot: 1,
      rule_id: p2Rule,
      pay_item_id: p2PayItem,
      contract_id: world.contracts.coastlineP2,
      operating_sub_id: world.rivera,
      reconciliation_run_id: p2Run,
    });
  });

  it('the prime is one of the project’s primes, and the operating sub a sub placed on it under that prime, at either tier', async () => {
    const { world } = tested;
    for (const [what, more] of [
      ['a contractor on no project as the prime', { prime_id: world.harbor }],
      ['a sub as the prime', { prime_id: world.rivera }],
      ['a prime as the operating sub', { operating_sub_id: world.summit }],
      ['the prime itself as its operating sub', { operating_sub_id: world.coastline }],
      ['a contractor on no project as the operating sub', { operating_sub_id: world.harbor }],
      [
        "another prime's sub as the operating sub",
        { prime_id: world.summit, operating_sub_id: world.rivera },
      ],
    ] as const) {
      expect(await refusedLine(more), what).toBe(refusedBy.foreignKey);
    }
    // Tidewater Hauling, a tier 2 sub under Rivera, under Coastline: the sub that did the work.
    await tickets.asTheBackOffice();
    const tidewater = await tickets.add('contractor', {
      name: 'Tidewater Hauling',
      kind: 'HAULER',
    });
    await tickets.add('project_contractor', subOn(world.p1, tidewater, world.coastline, 2));
    await tickets.line({ slot: 2, operating_sub_id: tidewater });
    await tickets.line({ slot: 3, operating_sub_id: world.rivera });
  });
});

describe('who writes a transaction', () => {
  it('AC-07-88 only the worker’s login writes a line in its full shape; the API’s and the read-only login can’t, and nobody updates one', async () => {
    const { db, world } = tested;
    const line = transactionLike(world);
    for (const login of ['adms_api', 'adms_readonly'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(await tickets.refused('transaction', line), login).toBe(refusedBy.grant);
    }
    await tickets.asTheWorker();
    const written = await tickets.add('transaction', line);
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect(
        (
          await db.refused(`UPDATE "transaction" SET "operating_sub_id" = $2 WHERE "id" = $1`, [
            written,
            world.rivera,
          ])
        ).code,
        login,
      ).toBe(refusedBy.grant);
    }
  });
});

describe('a ticket locked as invoiced', () => {
  // The three kinds of ticket, each with one line, and what its lock names.
  async function threeTickets(): Promise<{ what: string; line: string; lock: Row; again: Row }[]> {
    const { world } = tested;
    const haulOut = await tickets.haulOut201004();
    const unitRate = await tickets.unitRate301001();
    const onThePile = {
      ...noLoad,
      completed_haul_out_id: haulOut.completedHaulOut,
      completed_haul_out_collection_id: haulOut.piles.a,
      rule_id: haulOut.rule,
      pay_item_id: haulOut.payItem,
      unit: 'TN',
    };
    const onTheHanger = {
      ...noLoad,
      field_event_id: unitRate.fieldEvent,
      rule_id: unitRate.rule,
      pay_item_id: world.payItems.hangers,
      unit: 'EA',
    };
    return [
      {
        what: 'a load',
        line: world.transaction,
        lock: { project_id: world.p1, completed_load_id: world.loads.l101001.completedLoad },
        again: { slot: 2 },
      },
      {
        what: 'a haul-out',
        line: await tickets.line({ ...onThePile, slot: 1 }),
        lock: { project_id: world.p1, completed_haul_out_id: haulOut.completedHaulOut },
        // Another pile of the same haul-out: the lock is the ticket's, not the pile's.
        again: { ...onThePile, completed_haul_out_collection_id: haulOut.piles.b, slot: 1 },
      },
      {
        what: 'a unit rate ticket',
        line: await tickets.line({ ...onTheHanger, slot: 1 }),
        lock: {
          project_id: world.p1,
          field_event_id: unitRate.fieldEvent,
          field_event_kind: 'UNIT_RATE',
        },
        again: { ...onTheHanger, slot: 2 },
      },
    ];
  }

  it('AC-07-97 the removal of any of its lines is refused, for every login, and nothing is audited: on a load, a haul-out and a unit rate ticket alike; a lock on one ticket leaves the others’ regeneration alone', async () => {
    const { db, world } = tested;
    const three = await threeTickets();
    for (const [index, { what, line, lock }] of three.entries()) {
      await db.run('SAVEPOINT one_lock');
      await tickets.asTheBackOffice();
      await tickets.add('invoice_lock', { ...lock, locked_by_id: world.admin });
      for (const who of ['adms_worker', 'adms_owner', 'superuser'] as const) {
        if (who === 'superuser') await db.administer();
        else await db.as(who);
        await db.actor(world.worker, 'SYSTEM');
        expect(
          await db.refused(`DELETE FROM "transaction" WHERE "id" = $1`, [line]),
          `${what}, ${who}`,
        ).toEqual({
          code: refusedBy.trigger,
          message: `Transaction ${line} can't be removed: its ticket is locked as invoiced. Unlock it first`,
        });
      }
      await db.administer();
      expect(
        await db.rows(
          `SELECT 1 FROM "audit_record" WHERE "record_id" = $1 AND "operation" = 'DELETE'`,
          [line],
        ),
        what,
      ).toEqual([]);
      // The other two tickets' lines are removed as ever.
      await tickets.asTheWorker();
      for (const other of three.filter((_, at) => at !== index)) {
        expect(
          await db.run(`DELETE FROM "transaction" WHERE "id" = $1`, [other.line]),
          `${what} locked, ${other.what} regenerated`,
        ).toBe(1);
      }
      await db.run('ROLLBACK TO SAVEPOINT one_lock');
    }
  });

  it('takes no new line either, on a load, a haul-out and a unit rate ticket alike (C17); a ticket that isn’t locked does', async () => {
    const { db, world } = tested;
    const three = await threeTickets();
    for (const { what, lock, again } of three) {
      await db.run('SAVEPOINT one_lock');
      await tickets.asTheBackOffice();
      await tickets.add('invoice_lock', { ...lock, locked_by_id: world.admin });
      await tickets.asTheWorker();
      expect(
        await db.refused(...insertOf('transaction', transactionLike(world, again))),
        what,
      ).toEqual({
        code: refusedBy.trigger,
        message:
          "A transaction can't be written: its ticket is locked as invoiced. Unlock it first",
      });
      await db.run('ROLLBACK TO SAVEPOINT one_lock');
      // Not locked, the same line is taken.
      await tickets.line(again);
    }
  });

  it('a lock is on exactly one ticket, and a ticket is locked once', async () => {
    const { world } = tested;
    const haulOut = await tickets.haulOut201004();
    const unitRate = await tickets.unitRate301001();
    await tickets.asTheBackOffice();
    const by = { project_id: world.p1, locked_by_id: world.admin };
    const load = { completed_load_id: world.loads.l101001.completedLoad };
    const hauled = { completed_haul_out_id: haulOut.completedHaulOut };
    const hanger = { field_event_id: unitRate.fieldEvent, field_event_kind: 'UNIT_RATE' };
    for (const [what, lock] of [
      ['no ticket', {}],
      ['a load and a haul-out', { ...load, ...hauled }],
      ['a haul-out and a unit rate ticket', { ...hauled, ...hanger }],
    ] as const) {
      expect(await tickets.refused('invoice_lock', { ...lock, ...by }), what).toBe(refusedBy.check);
    }
    for (const [what, lock] of [
      ['a load', load],
      ['a haul-out', hauled],
      ['a unit rate ticket', hanger],
    ] as const) {
      await tickets.add('invoice_lock', { ...lock, ...by });
      // In force once: an exclusion among the locks not unlocked (ADR-363; `marks.test.ts`).
      expect(await tickets.refused('invoice_lock', { ...lock, ...by }), what).toBe(
        refusedBy.exclusion,
      );
    }
  });
});
