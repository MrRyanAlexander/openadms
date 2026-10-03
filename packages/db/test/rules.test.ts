// REQ-125a, 131c: rules, their criteria and picked values, their actions and chosen items
// (spec/DATA-MODEL.md §3 "Rules"; spec/RULES.md §2, §4, §4a, §5, §7; ADR-109, 118, 125, 128, 135,
// 141, 229, 239, 301, 313). Section G of spec/acceptance/01-setup.md, proven at the database:
// AC-01-60, the database's half of AC-01-61, 62 and 64 (what is valid, the overlap warning and the
// refusal of an exact copy are packages/domain's RuleValidity and ProjectRules), and AC-01-78 for
// these tables. The rule is P1's first, as the example world writes it from the golden mission §1:
// "VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi" on the load form, naming "Coastline, Bayline ROW 2026".
import { ruleCriterionKeys, ruleOperators } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  actionLike,
  criterionLike,
  insertOf,
  payItemLike,
  pickLike,
  ruleLike,
  siteLike,
  without,
} from './support/example-world.ts';
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

async function valuesOf(type: string): Promise<string[]> {
  return (
    await tested.db.rows<{ value: string }>(
      `SELECT e.enumlabel AS value FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = $1 ORDER BY e.enumsortorder`,
      [type],
    )
  ).map((row) => row.value);
}

// A line on the world's rule, at the next free place; the insert's row.
let place = 2;
function lineOf(
  criterion: string,
  operator: string,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  place += 1;
  return criterionLike(tested.world, tested.world.rule.id, place, criterion, operator, more);
}

// P1's haul-out form's Mulch, as Dana adds it: a debris type of the firm's own, then its entry.
async function mulchOnTheHaulOutForm(): Promise<string> {
  const mulch = await add('debris_type', { name: 'Mulch', position: 99 });
  return add('form_debris_type', {
    form_id: tested.world.forms.haulOut,
    document_type: 'HAUL_OUT',
    debris_type_id: mulch,
    reduced: true,
    hidden_on_phones: false,
  });
}

describe('a rule', () => {
  it('AC-01-60 "Debris type EQUALS Vegetative, Mileage AT MOST 15.0 → Add transaction 1, VEG-HAUL-CY-15" belongs to P1’s load form and names one contract', async () => {
    const { db, world } = tested;
    await db.as('adms_worker');
    expect(
      await db.one(
        `SELECT r."name", f."name" AS form, r."document_type"::text AS document_type,
           p."name" AS project, c."name" AS contract, r."active", r."archived_at" AS archived,
           r."from_pay_item_id" AS from_pay_item
         FROM "rule" r JOIN "form" f ON f."id" = r."form_id"
         JOIN "project" p ON p."id" = r."project_id"
         JOIN "contract" c ON c."id" = r."contract_id" WHERE r."id" = $1`,
        [world.rule.id],
      ),
    ).toEqual({
      name: 'VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi',
      form: 'Load',
      document_type: 'LOAD',
      project: 'Bayline County ROW, Hurricane Delphine',
      contract: 'Coastline, Bayline ROW 2026',
      active: true,
      archived: null,
      from_pay_item: null,
    });
    expect(
      await db.rows(
        `SELECT l."position", l."criterion"::text, l."operator"::text,
           l."number_from"::text AS number, d."name" AS picked
         FROM "rule_criterion" l
         LEFT JOIN "rule_criterion_pick" k ON k."criterion_id" = l."id"
         LEFT JOIN "form_debris_type" e ON e."id" = k."form_debris_type_id"
         LEFT JOIN "debris_type" d ON d."id" = e."debris_type_id"
         WHERE l."rule_id" = $1 ORDER BY l."position"`,
        [world.rule.id],
      ),
    ).toEqual([
      {
        position: 1,
        criterion: 'DEBRIS_TYPE',
        operator: 'EQUALS',
        number: null,
        picked: 'Vegetative',
      },
      { position: 2, criterion: 'MILEAGE', operator: 'AT_MOST', number: '15.0000', picked: null },
    ]);
    expect(
      await db.rows(
        `SELECT a."kind"::text, a."slot", i."code" AS pay_item, a."quantity_from"::text
         FROM "rule_action" a JOIN "pay_item" i ON i."id" = a."pay_item_id"
         WHERE a."rule_id" = $1`,
        [world.rule.id],
      ),
    ).toEqual([
      { kind: 'ADD_TRANSACTION', slot: 1, pay_item: 'VEG-HAUL-CY-15', quantity_from: 'ALL_ITEMS' },
    ]);
  });

  it('AC-01-60 sits on one form of its own project: none, another project’s, or a form that isn’t a ticket’s is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(await refusedRow('rule', without(ruleLike(world), 'form_id'))).toBe(refusedBy.notNull);
    expect(await refusedRow('rule', without(ruleLike(world), 'project_id'))).toBe(
      refusedBy.notNull,
    );
    // P1's load form, claimed for P2.
    expect(await refusedRow('rule', ruleLike(world, { project_id: world.p2 }))).toBe(
      refusedBy.foreignKey,
    );
    // Its document type is its form's own: the load form isn't a unit rate form.
    expect(await refusedRow('rule', ruleLike(world, { document_type: 'UNIT_RATE' }))).toBe(
      refusedBy.foreignKey,
    );
    // An incident never bills (ADR-236): no rule on its form.
    expect(
      await refusedRow(
        'rule',
        ruleLike(world, { form_id: world.forms.incident, document_type: 'INCIDENT' }),
      ),
    ).toBe(refusedBy.check);
    // A haul-out rule is a rule of the haul-out form.
    await add('rule', ruleLike(world, { form_id: world.forms.haulOut, document_type: 'HAUL_OUT' }));
    // A form's document type can't change under its rules.
    await db.administer();
    await db.actor(world.admin, 'BACK_OFFICE');
    expect(
      (
        await db.refused(`UPDATE "form" SET "document_type" = 'UNIT_RATE' WHERE "id" = $1`, [
          world.forms.load,
        ])
      ).code,
    ).toBe(refusedBy.restrict);
  });

  it('AC-01-60 names one of its own project’s contracts: Summit’s is another rule; P2’s is refused', async () => {
    const { world } = tested;
    await asTheApi();
    await add('rule', ruleLike(world, { contract_id: world.contracts.summitP1 }));
    expect(
      await refusedRow('rule', ruleLike(world, { contract_id: world.contracts.coastlineP2 })),
    ).toBe(refusedBy.foreignKey);
    expect(await refusedRow('rule', ruleLike(world, { contract_id: world.assignments.p1 }))).toBe(
      refusedBy.foreignKey,
    );
  });

  it('AC-01-61, AC-01-62 a rule that isn’t valid is saved: no contract, no line, an Add with no # or pay item; and "Is valid" is no column', async () => {
    const { db, world } = tested;
    await asTheApi();
    const bare = await add('rule', ruleLike(world, { contract_id: null, name: '' }));
    await add('rule_action', actionLike(world, bare, null, null));
    await add(
      'rule_action',
      actionLike(world, bare, null, null, { kind: 'REMOVE_TRANSACTION', quantity_from: null }),
    );
    expect(
      await db.rows(
        `SELECT column_name AS name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'rule' ORDER BY ordinal_position`,
      ),
    ).toEqual(
      [
        'id',
        'project_id',
        'form_id',
        'document_type',
        'name',
        'contract_id',
        'active',
        'from_pay_item_id',
        'created_at',
        'archived_at',
      ].map((name) => ({ name })),
    );
    // Active is said by whoever writes the rule: it has no default.
    expect(await refusedRow('rule', without(ruleLike(world), 'active'))).toBe(refusedBy.notNull);
  });

  it('AC-01-66 is marked with the pay item whose "Pays when" wrote it, one of its own project’s', async () => {
    const { world } = tested;
    await asTheApi();
    await add(
      'rule',
      ruleLike(world, {
        name: 'HNG-RMV-EA - Hanger removal',
        from_pay_item_id: world.payItems.hangers,
      }),
    );
    const onP2 = await add('pay_item', payItemLike({ ...world, p1: world.p2 }));
    expect(await refusedRow('rule', ruleLike(world, { from_pay_item_id: onP2 }))).toBe(
      refusedBy.foreignKey,
    );
  });
});

describe("a rule's criteria", () => {
  it('AC-01-64 the closed sets are the domain’s: the criteria and the operators of spec/RULES.md §4 and §4a', async () => {
    expect(await valuesOf('rule_criterion_key')).toEqual([...ruleCriterionKeys]);
    expect(await valuesOf('rule_operator')).toEqual([...ruleOperators]);
    expect(await valuesOf('rule_action_kind')).toEqual([
      'ADD_TRANSACTION',
      'REMOVE_TRANSACTION',
      'VOID_TICKET',
    ]);
    expect(await valuesOf('quantity_from')).toEqual(['ALL_ITEMS', 'CHOSEN_ITEMS']);
  });

  it('AC-01-64 a line is its rule’s: it repeats the rule’s project and form, and holds its place once', async () => {
    const { world } = tested;
    await asTheApi();
    const row = lineOf('MILEAGE', 'AT_MOST', { number_from: '30.0000' });
    expect(await refusedRow('rule_criterion', { ...row, project_id: world.p2 })).toBe(
      refusedBy.foreignKey,
    );
    expect(await refusedRow('rule_criterion', { ...row, form_id: world.forms.haulOut })).toBe(
      refusedBy.foreignKey,
    );
    expect(await refusedRow('rule_criterion', { ...row, position: 2 })).toBe(refusedBy.unique);
    expect(await refusedRow('rule_criterion', { ...row, position: 0 })).toBe(refusedBy.check);
    await add('rule_criterion', row);
  });

  it.each<[string, string, Record<string, unknown>]>([
    ['MILEAGE', 'AT_MOST', { number_from: '15.0000' }],
    ['MILEAGE', 'BETWEEN', { number_from: '15.1000', number_to: '30.0000' }],
    ['MILEAGE', 'BETWEEN', { number_from: '15.0000', number_to: '15.0000' }],
    ['WEIGHT', 'MORE_THAN', { number_from: '0.0000' }],
    ['VOLUME', 'NOT_EQUALS', { number_from: '40.0000' }],
    ['UNIT_COUNT', 'AT_LEAST', { number_from: '1.0000' }],
    ['MEASUREMENT', 'LESS_THAN', { number_from: '24.0000' }],
    ['ITEM', 'AT_LEAST', { number_from: '1.0000' }],
    ['ITEM', 'IS_NOT_EMPTY', {}],
    ['TICKET_DATE', 'ON_OR_AFTER', { date_from: '2026-10-15' }],
    ['TICKET_DATE', 'BETWEEN', { date_from: '2026-10-12', date_to: '2026-10-14' }],
    ['TICKET_DATE', 'NOT_ON', { date_from: '2026-10-12' }],
    ['COLLECTION_ADDRESS', 'STARTS_WITH', { text: '14 Heron' }],
    ['COLLECTION_ADDRESS', 'IS_EMPTY', {}],
    ['DEBRIS_TYPE', 'IS_ONE_OF', {}],
    ['DISPOSAL_SITE', 'NOT_EQUALS', {}],
    ['ZONE', 'IS_EMPTY', {}],
    ['MILEAGE', 'IS_NOT_EMPTY', {}],
  ])('AC-01-64 %s %s is saved with its kind of value', async (criterion, operator, value) => {
    await asTheApi();
    await add('rule_criterion', lineOf(criterion, operator, value));
  });

  it.each<[string, string, string, Record<string, unknown>]>([
    ['a number takes no text operator', 'MILEAGE', 'CONTAINS', { number_from: '15.0000' }],
    ['a number takes no list operator', 'VOLUME', 'IS_ONE_OF', { number_from: '15.0000' }],
    ['a number takes no date operator', 'WEIGHT', 'ON_OR_AFTER', { number_from: '15.0000' }],
    ['a pick takes no number operator', 'DEBRIS_TYPE', 'AT_MOST', {}],
    ['a pick takes no BETWEEN', 'DISPOSAL_SITE', 'BETWEEN', {}],
    ['a pick takes no text operator', 'ZONE', 'STARTS_WITH', {}],
    ['a date takes no EQUALS', 'TICKET_DATE', 'EQUALS', { date_from: '2026-10-15' }],
    ['a date takes no AT LEAST', 'TICKET_DATE', 'AT_LEAST', { date_from: '2026-10-15' }],
    ['text takes no BETWEEN', 'COLLECTION_ADDRESS', 'BETWEEN', { text: '14 Heron' }],
    ['text takes no ON', 'COLLECTION_ADDRESS', 'ON', { text: '14 Heron' }],
    ['an item’s count takes no list operator', 'ITEM', 'IS_ONE_OF', {}],
  ])(
    'AC-01-64 an operator of another kind is refused: %s',
    async (_, criterion, operator, value) => {
      await asTheApi();
      expect(await refusedRow('rule_criterion', lineOf(criterion, operator, value))).toBe(
        refusedBy.check,
      );
    },
  );

  it.each<[string, string, string, Record<string, unknown>]>([
    ['a number with no value', 'MILEAGE', 'AT_MOST', {}],
    ['BETWEEN with one end', 'MILEAGE', 'BETWEEN', { number_from: '0.0000' }],
    ['BETWEEN from high to low', 'MILEAGE', 'BETWEEN', { number_from: '30', number_to: '15' }],
    ['a second number off BETWEEN', 'MILEAGE', 'AT_MOST', { number_from: '15', number_to: '30' }],
    ['text on a number', 'MILEAGE', 'AT_MOST', { number_from: '15', text: 'fifteen' }],
    ['a date on a number', 'VOLUME', 'EQUALS', { number_from: '15', date_from: '2026-10-15' }],
    ['a date with no day', 'TICKET_DATE', 'ON', {}],
    ['a date as a number', 'TICKET_DATE', 'ON', { number_from: '20261015' }],
    [
      'dates from late to early',
      'TICKET_DATE',
      'BETWEEN',
      { date_from: '2026-10-14', date_to: '2026-10-12' },
    ],
    [
      'a second date off BETWEEN',
      'TICKET_DATE',
      'ON',
      { date_from: '2026-10-12', date_to: '2026-10-14' },
    ],
    ['text with nothing in it', 'COLLECTION_ADDRESS', 'CONTAINS', { text: '' }],
    ['text left out', 'COLLECTION_ADDRESS', 'EQUALS', {}],
    ['a typed value on a pick', 'DEBRIS_TYPE', 'EQUALS', { text: 'Vegetative' }],
    ['a number on a pick', 'DISPOSAL_SITE', 'EQUALS', { number_from: '1' }],
    ['a value on IS EMPTY', 'MILEAGE', 'IS_EMPTY', { number_from: '0' }],
    ['text on IS NOT EMPTY', 'COLLECTION_ADDRESS', 'IS_NOT_EMPTY', { text: 'x' }],
  ])(
    'AC-01-64 a value that isn’t its operator’s is refused: %s',
    async (_, criterion, operator, value) => {
      await asTheApi();
      expect(await refusedRow('rule_criterion', lineOf(criterion, operator, value))).toBe(
        refusedBy.check,
      );
    },
  );

  it('AC-01-64 a criterion and an operator are from the closed sets, and both are said', async () => {
    await asTheApi();
    expect(await refusedRow('rule_criterion', lineOf('LOAD_CALL', 'EQUALS'))).toBe(
      refusedBy.badValue,
    );
    expect(await refusedRow('rule_criterion', lineOf('MILEAGE', 'ROUGHLY'))).toBe(
      refusedBy.badValue,
    );
    expect(
      await refusedRow('rule_criterion', without(lineOf('ZONE', 'IS_EMPTY'), 'operator')),
    ).toBe(refusedBy.notNull);
  });
});

describe('a picked value', () => {
  it('AC-01-64 Debris type picks an entry of the rule’s own form: Mulch, on the haul-out form, is refused on a load rule', async () => {
    const { world } = tested;
    await asTheApi();
    const types = await add('rule_criterion', lineOf('DEBRIS_TYPE', 'IS_ONE_OF'));
    for (const entry of [world.formDebrisTypes.vegetative, world.formDebrisTypes.cd]) {
      await add(
        'rule_criterion_pick',
        pickLike(world, types, 'DEBRIS_TYPE', { form_debris_type_id: entry }),
      );
    }
    const mulch = await mulchOnTheHaulOutForm();
    expect(
      await refusedRow(
        'rule_criterion_pick',
        pickLike(world, types, 'DEBRIS_TYPE', { form_debris_type_id: mulch }),
      ),
    ).toBe(refusedBy.foreignKey);
    // On a haul-out rule it is picked.
    const haulOut = { ...world, forms: { ...world.forms, load: world.forms.haulOut } };
    const rule = await add('rule', ruleLike(haulOut, { document_type: 'HAUL_OUT' }));
    const onHaulOut = await add(
      'rule_criterion',
      criterionLike(haulOut, rule, 1, 'DEBRIS_TYPE', 'EQUALS'),
    );
    await add(
      'rule_criterion_pick',
      pickLike(haulOut, onHaulOut, 'DEBRIS_TYPE', { form_debris_type_id: mulch }),
    );
  });

  it('AC-01-64 Disposal site and From site pick one of the project’s sites; P2’s Marsh Road is refused', async () => {
    const { world } = tested;
    await asTheApi();
    const site = await add('rule_criterion', lineOf('DISPOSAL_SITE', 'IS_ONE_OF'));
    for (const id of [world.landfill, world.site]) {
      await add(
        'rule_criterion_pick',
        pickLike(world, site, 'DISPOSAL_SITE', { disposal_site_id: id }),
      );
    }
    const onP2 = await add(
      'disposal_site',
      siteLike({ p1: world.p2 }, world.siteTypes.tdsr, {
        name: 'Marsh Road TDSR',
        site_type_key: 'TDSR',
      }),
    );
    expect(
      await refusedRow(
        'rule_criterion_pick',
        pickLike(world, site, 'DISPOSAL_SITE', { disposal_site_id: onP2 }),
      ),
    ).toBe(refusedBy.foreignKey);
    // From site is a haul-out rule's (packages/domain says which form takes which); it picks a site.
    const from = await add('rule_criterion', lineOf('FROM_SITE', 'EQUALS'));
    await add(
      'rule_criterion_pick',
      pickLike(world, from, 'FROM_SITE', { disposal_site_id: world.site }),
    );
  });

  it('AC-01-64 Pay item, Field tag and Contractor pick the project’s own; another project’s, or a contractor on no project, is refused', async () => {
    const { world } = tested;
    await asTheApi();
    const payItem = await add('rule_criterion', lineOf('PAY_ITEM', 'IS_ONE_OF'));
    await add(
      'rule_criterion_pick',
      pickLike(world, payItem, 'PAY_ITEM', { pay_item_id: world.payItems.hangers }),
    );
    const onP2 = await add('pay_item', payItemLike({ ...world, p1: world.p2 }));
    expect(
      await refusedRow(
        'rule_criterion_pick',
        pickLike(world, payItem, 'PAY_ITEM', { pay_item_id: onP2 }),
      ),
    ).toBe(refusedBy.foreignKey);

    const tag = await add('rule_criterion', lineOf('FIELD_TAG', 'EQUALS'));
    const mixed = await add('field_tag', { name: 'Mixed', position: 1, project_id: world.p1 });
    const mixedOnP2 = await add('field_tag', { name: 'Mixed', position: 1, project_id: world.p2 });
    await add('rule_criterion_pick', pickLike(world, tag, 'FIELD_TAG', { field_tag_id: mixed }));
    expect(
      await refusedRow(
        'rule_criterion_pick',
        pickLike(world, tag, 'FIELD_TAG', { field_tag_id: mixedOnP2 }),
      ),
    ).toBe(refusedBy.foreignKey);

    const contractor = await add('rule_criterion', lineOf('CONTRACTOR', 'NOT_EQUALS'));
    await add(
      'rule_criterion_pick',
      pickLike(world, contractor, 'CONTRACTOR', { contractor_id: world.summit }),
    );
    expect(
      await refusedRow(
        'rule_criterion_pick',
        pickLike(world, contractor, 'CONTRACTOR', { contractor_id: world.harbor }),
      ),
    ).toBe(refusedBy.foreignKey);
  });

  it('AC-01-64 Disposal site type and Item pick from the firm’s lists; Zone holds a zone’s name, never a blank', async () => {
    const { world } = tested;
    await asTheApi();
    const type = await add('rule_criterion', lineOf('DISPOSAL_SITE_TYPE', 'EQUALS'));
    await add(
      'rule_criterion_pick',
      pickLike(world, type, 'DISPOSAL_SITE_TYPE', { site_type_id: world.siteTypes.finalDisposal }),
    );
    expect(
      await refusedRow(
        'rule_criterion_pick',
        pickLike(world, type, 'DISPOSAL_SITE_TYPE', { site_type_id: world.site }),
      ),
    ).toBe(refusedBy.foreignKey);

    const item = await add('rule_criterion', lineOf('ITEM', 'AT_LEAST', { number_from: '1.0000' }));
    const itemName = (
      await tested.db.one<{ id: string }>(
        `SELECT i."id"::text FROM "item_name" i JOIN "kind_of_work" k ON k."id" = i."kind_of_work_id"
         WHERE k."name" = 'White Goods' ORDER BY i."position" LIMIT 1`,
      )
    ).id;
    await add('rule_criterion_pick', pickLike(world, item, 'ITEM', { item_name_id: itemName }));
    expect(
      await refusedRow(
        'rule_criterion_pick',
        pickLike(world, item, 'ITEM', { item_name_id: world.site }),
      ),
    ).toBe(refusedBy.foreignKey);

    const zone = await add('rule_criterion', lineOf('ZONE', 'IS_ONE_OF'));
    await add('rule_criterion_pick', pickLike(world, zone, 'ZONE', { zone_name: 'Zone 2' }));
    expect(
      await refusedRow('rule_criterion_pick', pickLike(world, zone, 'ZONE', { zone_name: '' })),
    ).toBe(refusedBy.check);
  });

  it('AC-01-64 fills exactly the one column its criterion picks from', async () => {
    const { world } = tested;
    await asTheApi();
    const site = await add('rule_criterion', lineOf('DISPOSAL_SITE', 'EQUALS'));
    const pick = (value: Record<string, unknown>, criterion = 'DISPOSAL_SITE') =>
      refusedRow('rule_criterion_pick', pickLike(world, site, criterion, value));
    // Nothing picked; a debris type on a Disposal site line; a site and a zone together.
    expect(await pick({})).toBe(refusedBy.check);
    expect(await pick({ form_debris_type_id: world.formDebrisTypes.vegetative })).toBe(
      refusedBy.check,
    );
    expect(await pick({ disposal_site_id: world.landfill, zone_name: 'Zone 2' })).toBe(
      refusedBy.check,
    );
    expect(await pick({ pay_item_id: world.payItems.hangers })).toBe(refusedBy.check);
    // The pick's criterion is its line's own: a site passed off as a From site's on this line.
    expect(await pick({ disposal_site_id: world.landfill }, 'FROM_SITE')).toBe(
      refusedBy.foreignKey,
    );
    // A typed criterion has no picks.
    expect(
      await refusedRow(
        'rule_criterion_pick',
        pickLike(world, world.rule.mileage, 'MILEAGE', { disposal_site_id: world.landfill }),
      ),
    ).toBe(refusedBy.check);
    // A line's criterion can't change under its picks.
    await add(
      'rule_criterion_pick',
      pickLike(world, site, 'DISPOSAL_SITE', { disposal_site_id: world.landfill }),
    );
    expect(
      (
        await tested.db.refused(
          `UPDATE "rule_criterion" SET "criterion" = 'FROM_SITE' WHERE "id" = $1`,
          [site],
        )
      ).code,
    ).toBe(refusedBy.restrict);
  });

  it('AC-01-64 is its line’s: another project or form than the line’s own is refused', async () => {
    const { world } = tested;
    await asTheApi();
    const row = pickLike(world, world.rule.debrisType, 'DEBRIS_TYPE', {
      form_debris_type_id: world.formDebrisTypes.cd,
    });
    expect(await refusedRow('rule_criterion_pick', { ...row, project_id: world.p2 })).toBe(
      refusedBy.foreignKey,
    );
    expect(await refusedRow('rule_criterion_pick', { ...row, form_id: world.forms.haulOut })).toBe(
      refusedBy.foreignKey,
    );
    expect(await refusedRow('rule_criterion_pick', without(row, 'criterion_id'))).toBe(
      refusedBy.notNull,
    );
  });
});

describe("a rule's actions", () => {
  it('AC-01-60 Add transaction holds a # and a pay item of the rule’s own project, and says which items its quantity is from', async () => {
    const { world } = tested;
    await asTheApi();
    const rule = world.rule.id;
    await add('rule_action', actionLike(world, rule, 2, world.payItems.hangers));
    const onP2 = await add('pay_item', payItemLike({ ...world, p1: world.p2 }));
    expect(await refusedRow('rule_action', actionLike(world, rule, 2, onP2))).toBe(
      refusedBy.foreignKey,
    );
    // An action is its rule's: P2's pay item, said to be on P2, still isn't this rule's project's.
    expect(
      await refusedRow('rule_action', actionLike(world, rule, 2, onP2, { project_id: world.p2 })),
    ).toBe(refusedBy.foreignKey);
    expect(
      await refusedRow(
        'rule_action',
        actionLike(world, rule, 2, world.payItems.hangers, { quantity_from: null }),
      ),
    ).toBe(refusedBy.check);
    for (const slot of [0, -1]) {
      expect(
        await refusedRow('rule_action', actionLike(world, rule, slot, world.payItems.hangers)),
      ).toBe(refusedBy.check);
    }
    expect(
      await refusedRow('rule_action', actionLike(world, rule, 2, null, { kind: 'FLAG_TICKET' })),
    ).toBe(refusedBy.badValue);
  });

  it('AC-01-60 Remove transaction holds only a #; Void ticket holds nothing', async () => {
    const { world } = tested;
    await asTheApi();
    const rule = world.rule.id;
    const remove = { kind: 'REMOVE_TRANSACTION', quantity_from: null };
    const voiding = { kind: 'VOID_TICKET', quantity_from: null };
    await add('rule_action', actionLike(world, rule, 2, null, remove));
    await add('rule_action', actionLike(world, rule, null, null, voiding));
    expect(
      await refusedRow('rule_action', actionLike(world, rule, 2, world.payItems.hangers, remove)),
    ).toBe(refusedBy.check);
    expect(
      await refusedRow(
        'rule_action',
        actionLike(world, rule, 2, null, { kind: 'REMOVE_TRANSACTION' }),
      ),
    ).toBe(refusedBy.check);
    expect(await refusedRow('rule_action', actionLike(world, rule, 1, null, voiding))).toBe(
      refusedBy.check,
    );
    expect(
      await refusedRow(
        'rule_action',
        actionLike(world, rule, null, world.payItems.hangers, voiding),
      ),
    ).toBe(refusedBy.check);
    expect(
      await refusedRow('rule_action', actionLike(world, rule, null, null, { kind: 'VOID_TICKET' })),
    ).toBe(refusedBy.check);
  });

  it('AC-01-60 the chosen items of an Add transaction are the firm’s item names, each once', async () => {
    const { db, world } = tested;
    await asTheApi();
    const action = await add(
      'rule_action',
      actionLike(world, world.rule.id, 2, world.payItems.hangers, {
        quantity_from: 'CHOSEN_ITEMS',
      }),
    );
    const items = await db.rows<{ id: string }>(
      `SELECT i."id"::text FROM "item_name" i JOIN "kind_of_work" k ON k."id" = i."kind_of_work_id"
       WHERE k."name" = 'White Goods' ORDER BY i."position" LIMIT 2`,
    );
    expect(items).toHaveLength(2);
    for (const item of items) {
      await add('rule_action_item', { action_id: action, item_name_id: item.id });
    }
    expect(
      await refusedRow('rule_action_item', { action_id: action, item_name_id: items[0]?.id }),
    ).toBe(refusedBy.unique);
    expect(
      await refusedRow('rule_action_item', {
        action_id: action,
        item_name_id: world.payItems.hangers,
      }),
    ).toBe(refusedBy.foreignKey);
    // And they are an action's: nothing else holds chosen items.
    expect(
      await refusedRow('rule_action_item', {
        action_id: world.rule.id,
        item_name_id: items[1]?.id,
      }),
    ).toBe(refusedBy.foreignKey);
  });
});

describe('changing a rule', () => {
  it('AC-01-78 an edit is audited with the prior value and its actor, for the billing reviewer; a line is taken off by archiving', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(`UPDATE "rule" SET "active" = false WHERE "id" = $1`, [world.rule.id]);
    await db.run(`UPDATE "rule_criterion" SET "number_from" = 10 WHERE "id" = $1`, [
      world.rule.mileage,
    ]);
    await db.run(`UPDATE "rule_action" SET "archived_at" = now() WHERE "id" = $1`, [
      world.rule.add,
    ]);
    const last = async (id: string): Promise<unknown> =>
      (
        await db.rows(
          `SELECT "operation"::text, "changed_fields" AS changed, "prior_value" AS prior,
             "actor_id"::text AS actor, "source"::text, "domain"::text
           FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
          [id],
        )
      ).at(-1);
    const by = { actor: world.admin, source: 'BACK_OFFICE', domain: 'BILLING' };
    expect(await last(world.rule.id)).toMatchObject({
      operation: 'UPDATE',
      changed: ['active'],
      prior: { active: true },
      ...by,
    });
    expect(await last(world.rule.mileage)).toMatchObject({
      operation: 'UPDATE',
      changed: ['number_from'],
      prior: { number_from: 15 },
      ...by,
    });
    expect(await last(world.rule.add)).toMatchObject({
      operation: 'UPDATE',
      changed: ['archived_at'],
      prior: { archived_at: null },
      ...by,
    });
    // Each line written is an audit record of its own.
    expect(await last(world.rule.debrisType)).toMatchObject({ operation: 'INSERT', ...by });
  });

  it.each(['rule', 'rule_criterion', 'rule_criterion_pick', 'rule_action', 'rule_action_item'])(
    'AC-01-78 a %s row is never deleted, by any login',
    async (table) => {
      const { db, world } = tested;
      for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
        await db.as(login);
        await db.actor(world.admin, 'BACK_OFFICE');
        expect((await db.refused(`DELETE FROM "${table}"`)).code, login).toBe(refusedBy.grant);
      }
      const never = `Open ADMS never deletes a ${table} row: archive, close or void it instead`;
      for (const who of ['adms_owner', 'administrator'] as const) {
        if (who === 'administrator') await db.administer();
        else await db.as(who);
        expect(await db.refused(`TRUNCATE "${table}" CASCADE`), who).toEqual({
          code: refusedBy.trigger,
          message: never,
        });
      }
      await db.administer();
      if (table === 'rule') {
        expect(await db.refused(`DELETE FROM "rule" WHERE "id" = $1`, [world.rule.id])).toEqual({
          code: refusedBy.trigger,
          message: never,
        });
      }
    },
  );

  it('AC-01-78 only the API writes a rule: the worker reads them, a read-only request that states no viewer sees none', async () => {
    const { db, world } = tested;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await db.rows(`SELECT 1 FROM "rule"`)).length).toBe(1);
    expect((await db.refused(...insertOf('rule', ruleLike(world)))).code).toBe(refusedBy.grant);
    expect(
      (await db.refused(`UPDATE "rule" SET "active" = false WHERE "id" = $1`, [world.rule.id]))
        .code,
    ).toBe(refusedBy.grant);
    // A client user and an auditor see their own projects' rules (ADR-315, viewers.test.ts).
    await db.noViewer();
    await db.as('adms_readonly');
    expect(await db.rows(`SELECT 1 FROM "rule"`)).toEqual([]);
  });
});
