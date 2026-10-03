// Rules at the domain (spec/acceptance/01-setup.md section G: AC-01-61…67 and AC-01-81;
// spec/RULES.md §4, §4a, §7; ADR-125, 229, 239, 301, 313). The rules are P1's as the golden
// mission §1 sets them up, each naming "Coastline, Bayline ROW 2026". That a rule sits on one form
// and names one of its project's contracts, and that a picked value is the project's own, is the
// database's (packages/db's rules.test.ts, AC-01-60, 64).
import { describe, expect, it } from 'vitest';

import {
  type PaysWhenContract,
  type RuleActionLine,
  type RuleCriterionKey,
  type RuleCriterionLine,
  type RuleEntry,
  type RuleOperator,
  type RulePick,
  PaysWhen,
  ProjectRules,
  RuleCriteria,
  RuleValidity,
  ruleCriterionKeys,
} from '../src/index.ts';

const pick = (value: string, name: string, gone = false): RulePick => ({ value, name, gone });
const vegetative = pick('debris-veg', 'Vegetative');
const cd = pick('debris-cd', 'C&D');
const mulch = pick('debris-mulch', 'Mulch');
const landfill = pick('site-bcl', 'Bayline County Landfill');
const cypressCreek = pick('site-ccl', 'Cypress Creek Landfill');

const line = (
  criterion: RuleCriterionKey,
  operator: RuleOperator,
  value: Partial<RuleCriterionLine> = {},
): RuleCriterionLine => ({
  criterion,
  operator,
  picks: [],
  numberFrom: null,
  numberTo: null,
  dateFrom: null,
  dateTo: null,
  text: null,
  ...value,
});
const picked = (criterion: RuleCriterionKey, ...picks: RulePick[]): RuleCriterionLine =>
  line(criterion, picks.length === 1 ? 'EQUALS' : 'IS_ONE_OF', { picks });
const mileage = (operator: RuleOperator, from: number, to: number | null = null) =>
  line('MILEAGE', operator, { numberFrom: from, numberTo: to });

const payItem = (code: string) => ({ id: `pay-item-${code}`, code });
const add = (slot: number | null, code: string | null): RuleActionLine => ({
  kind: 'ADD_TRANSACTION',
  slot,
  payItem: code === null ? null : payItem(code),
  quantityFrom: 'ALL_ITEMS',
  items: [],
});
const remove = (slot: number | null): RuleActionLine => ({
  kind: 'REMOVE_TRANSACTION',
  slot,
  payItem: null,
  quantityFrom: null,
  items: [],
});
const voidTicket: RuleActionLine = { ...remove(null), kind: 'VOID_TICKET' };

const coastline = { id: 'contract-coastline', name: 'Coastline, Bayline ROW 2026' };
const summit = { id: 'contract-summit', name: 'Summit, Bayline ROW 2026' };

const rule = (id: string | null, more: Partial<RuleEntry>): RuleEntry => ({
  id,
  name: 'VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi',
  formId: 'form-load',
  form: 'LOAD',
  contract: coastline,
  active: true,
  archived: false,
  fromPayItem: null,
  criteria: [picked('DEBRIS_TYPE', vegetative), mileage('AT_MOST', 15)],
  actions: [add(1, 'VEG-HAUL-CY-15')],
  ...more,
});
const haulOut = { formId: 'form-haul-out', form: 'HAUL_OUT' } as const;
const unitRate = { formId: 'form-unit-rate', form: 'UNIT_RATE' } as const;

// The golden mission's P1 rules (§1), the white goods and stump fill rules left out.
const vegHaul15 = rule('rule-veg-15', {});
const p1Rules: RuleEntry[] = [
  vegHaul15,
  rule('rule-veg-30', {
    name: 'VEG-HAUL-CY-30 - ROW VEG haul 15.1–30 mi',
    criteria: [picked('DEBRIS_TYPE', vegetative), mileage('BETWEEN', 15.1, 30)],
    actions: [add(1, 'VEG-HAUL-CY-30')],
  }),
  rule('rule-cd-15', {
    name: 'CD-HAUL-CY-15 - ROW C&D haul 0–15 mi',
    criteria: [picked('DEBRIS_TYPE', cd), mileage('AT_MOST', 15)],
    actions: [add(1, 'CD-HAUL-CY-15')],
  }),
  rule('rule-tip-load', {
    name: 'TIP-FEE-CY-BCL - Tipping fee, Bayline County Landfill',
    criteria: [picked('DISPOSAL_SITE', landfill)],
    actions: [add(2, 'TIP-FEE-CY-BCL')],
  }),
  rule('rule-tip-haul-out', {
    ...haulOut,
    name: 'TIP-FEE-CY-BCL - Tipping fee, Bayline County Landfill',
    criteria: [picked('DISPOSAL_SITE', landfill)],
    actions: [add(2, 'TIP-FEE-CY-BCL')],
  }),
  rule('rule-mulch-cy', {
    ...haulOut,
    name: 'MULCH-HO-CY - Mulch haul-out to FDS',
    criteria: [picked('DEBRIS_TYPE', mulch), picked('DISPOSAL_SITE', landfill)],
    actions: [add(1, 'MULCH-HO-CY')],
  }),
  rule('rule-mulch-tn', {
    ...haulOut,
    name: 'MULCH-HO-TN - Mulch haul-out to FDS, by weight',
    criteria: [picked('DEBRIS_TYPE', mulch), picked('DISPOSAL_SITE', cypressCreek)],
    actions: [add(1, 'MULCH-HO-TN')],
  }),
  ...['HNG-RMV-EA', 'LNR-RMV-EA-24', 'LNR-RMV-EA-99'].map((code) =>
    rule(`rule-${code}`, {
      ...unitRate,
      name: code,
      criteria: [picked('PAY_ITEM', pick(payItem(code).id, code))],
      actions: [add(1, code)],
    }),
  ),
];

describe('the criteria a form takes', () => {
  it('AC-01-63 on the load form: its column of the table, with no Pay item, Unit count, Measurement, Item or From site', () => {
    expect(new RuleCriteria('LOAD').offered()).toEqual([
      'TICKET_DATE',
      'CONTRACTOR',
      'DEBRIS_TYPE',
      'FIELD_TAG',
      'WEIGHT',
      'VOLUME',
      'COLLECTION_ADDRESS',
      'ZONE',
      'DISPOSAL_SITE',
      'DISPOSAL_SITE_TYPE',
      'MILEAGE',
    ]);
  });

  it('AC-01-63 on the unit rate form: no Mileage, Debris type or Disposal site', () => {
    expect(new RuleCriteria('UNIT_RATE').offered()).toEqual([
      'TICKET_DATE',
      'CONTRACTOR',
      'FIELD_TAG',
      'COLLECTION_ADDRESS',
      'ZONE',
      'PAY_ITEM',
      'UNIT_COUNT',
      'MEASUREMENT',
      'ITEM',
    ]);
  });

  it('AC-01-63 on the haul-out form: From site, and no Zone', () => {
    expect(new RuleCriteria('HAUL_OUT').offered()).toEqual([
      'TICKET_DATE',
      'CONTRACTOR',
      'DEBRIS_TYPE',
      'FIELD_TAG',
      'WEIGHT',
      'VOLUME',
      'COLLECTION_ADDRESS',
      'DISPOSAL_SITE',
      'FROM_SITE',
      'DISPOSAL_SITE_TYPE',
      'MILEAGE',
    ]);
  });

  it('AC-01-63 every criterion is on at least one form, and reads as the page names it', () => {
    for (const key of ruleCriterionKeys) {
      expect(
        (['LOAD', 'HAUL_OUT', 'UNIT_RATE'] as const).some((form) =>
          new RuleCriteria(form).takes(key),
        ),
        key,
      ).toBe(true);
    }
    expect(ruleCriterionKeys.map((key) => RuleCriteria.labelOf(key))).toEqual([
      'Ticket date',
      'Contractor',
      'Debris type',
      'Field tag',
      'Weight',
      'Volume',
      'Collection address',
      'Zone',
      'Disposal site',
      'From site',
      'Disposal site type',
      'Mileage',
      'Pay item',
      'Unit count',
      'Measurement',
      'Item',
    ]);
  });
});

describe("a criterion's value and operators", () => {
  const any = ['IS_EMPTY', 'IS_NOT_EMPTY'];

  it('AC-01-64 a picked criterion takes EQUALS, NOT EQUALS, IS ONE OF, IS NOT ONE OF', () => {
    for (const key of ['DEBRIS_TYPE', 'DISPOSAL_SITE', 'PAY_ITEM', 'ZONE', 'CONTRACTOR'] as const) {
      expect(RuleCriteria.kindOf(key), key).toBe('PICK');
      expect(RuleCriteria.operatorsOf(key), key).toEqual([
        'EQUALS',
        'NOT_EQUALS',
        'IS_ONE_OF',
        'IS_NOT_ONE_OF',
        ...any,
      ]);
    }
  });

  it('AC-01-64 Mileage takes a number, Ticket date a date, Collection address text, each with its own operators', () => {
    const numbers = [
      'EQUALS',
      'NOT_EQUALS',
      'BETWEEN',
      'AT_LEAST',
      'AT_MOST',
      'MORE_THAN',
      'LESS_THAN',
    ];
    expect(RuleCriteria.kindOf('MILEAGE')).toBe('NUMBER');
    expect(RuleCriteria.operatorsOf('MILEAGE')).toEqual([...numbers, ...any]);
    expect(RuleCriteria.kindOf('TICKET_DATE')).toBe('DATE');
    expect(RuleCriteria.operatorsOf('TICKET_DATE')).toEqual([
      'ON',
      'NOT_ON',
      'BETWEEN',
      'ON_OR_BEFORE',
      'ON_OR_AFTER',
      ...any,
    ]);
    expect(RuleCriteria.kindOf('COLLECTION_ADDRESS')).toBe('TEXT');
    expect(RuleCriteria.operatorsOf('COLLECTION_ADDRESS')).toEqual([
      'EQUALS',
      'NOT_EQUALS',
      'CONTAINS',
      'STARTS_WITH',
      ...any,
    ]);
    // An item's count is a number, compared for the one item picked (ADR-128).
    expect(RuleCriteria.kindOf('ITEM')).toBe('ITEM_COUNT');
    expect(RuleCriteria.operatorsOf('ITEM')).toEqual([...numbers, ...any]);
  });

  it('AC-01-64 a line whose operator or value is not its kind’s is told so', () => {
    expect(RuleCriteria.problemWith(mileage('AT_MOST', 15))).toBeNull();
    expect(RuleCriteria.problemWith(picked('DEBRIS_TYPE', vegetative))).toBeNull();
    expect(RuleCriteria.problemWith(line('MILEAGE', 'CONTAINS', { text: '15' }))).toBe(
      "Mileage doesn't take CONTAINS.",
    );
    expect(RuleCriteria.problemWith(line('DEBRIS_TYPE', 'AT_MOST', { numberFrom: 1 }))).toBe(
      "Debris type doesn't take AT MOST.",
    );
    expect(RuleCriteria.problemWith(line('MILEAGE', 'AT_MOST'))).toBe(
      'Mileage AT MOST needs its value.',
    );
    expect(RuleCriteria.problemWith(mileage('BETWEEN', 0))).toBe(
      'Mileage BETWEEN needs both its ends.',
    );
    expect(RuleCriteria.problemWith(mileage('BETWEEN', 30, 15))).toBe(
      'Mileage BETWEEN runs from its lower end to its higher.',
    );
    expect(RuleCriteria.problemWith(line('DEBRIS_TYPE', 'EQUALS'))).toBe(
      'Debris type EQUALS needs one picked value.',
    );
    expect(RuleCriteria.problemWith(line('DISPOSAL_SITE', 'IS_ONE_OF'))).toBe(
      'Disposal site IS ONE OF needs at least one picked value.',
    );
    expect(
      RuleCriteria.problemWith(line('TICKET_DATE', 'ON_OR_AFTER', { dateFrom: '2026-10-15' })),
    ).toBeNull();
    expect(
      RuleCriteria.problemWith(line('TICKET_DATE', 'ON_OR_AFTER', { dateFrom: '2026-02-30' })),
    ).toBe('Ticket date ON OR AFTER needs its value.');
    expect(RuleCriteria.problemWith(line('COLLECTION_ADDRESS', 'STARTS_WITH', { text: '' }))).toBe(
      'Collection address STARTS WITH needs its text.',
    );
    // IS EMPTY takes no value; an Item line always names its item.
    expect(RuleCriteria.problemWith(line('ZONE', 'IS_EMPTY'))).toBeNull();
    expect(RuleCriteria.problemWith(line('ITEM', 'AT_LEAST', { numberFrom: 1 }))).toBe(
      'Item needs the one item whose count it compares.',
    );
    expect(
      RuleCriteria.problemWith(
        line('ITEM', 'AT_LEAST', {
          numberFrom: 1,
          picks: [pick('item-fridge', 'Fridge, freon recovered')],
        }),
      ),
    ).toBeNull();
  });
});

describe('Is valid', () => {
  it('AC-01-61 an Add transaction and no contract: not valid, and it never runs', () => {
    const validity = new RuleValidity(rule(null, { contract: null }));
    expect(validity.valid).toBe(false);
    expect(validity.reasons()).toEqual(['It adds a transaction, so it must name a contract.']);
    expect(validity.runs).toBe(false);
    // It is saved all the same: nothing refuses it.
    expect(new ProjectRules([]).check(rule(null, { contract: null }))).toEqual({
      refusal: null,
      warnings: [],
      valid: false,
      reasons: ['It adds a transaction, so it must name a contract.'],
    });
  });

  it('AC-01-61 only Remove transaction or Void ticket: the contract may be blank, and it is valid', () => {
    for (const actions of [[remove(2)], [voidTicket], [remove(2), voidTicket]]) {
      const validity = new RuleValidity(rule(null, { contract: null, actions }));
      expect(validity.reasons()).toEqual([]);
      expect(validity.valid).toBe(true);
      expect(validity.runs).toBe(true);
    }
  });

  it('AC-01-62 P1’s rules as the golden mission sets them up are all valid, and run', () => {
    for (const each of p1Rules) {
      expect(new RuleValidity(each).reasons(), each.name).toEqual([]);
      expect(new RuleValidity(each).runs, each.name).toBe(true);
    }
  });

  it.each<[string, Partial<RuleEntry>, string]>([
    ['no criterion', { criteria: [] }, 'It has no criterion: a rule needs at least one.'],
    ['no action', { actions: [] }, 'It has no action: a rule needs at least one.'],
    ['no name', { name: ' ' }, 'It has no name.'],
    [
      'a criterion that doesn’t apply to its form',
      { criteria: [picked('PAY_ITEM', pick('pay-item-HNG-RMV-EA', 'HNG-RMV-EA'))] },
      "Pay item doesn't apply to a load rule.",
    ],
    [
      'a picked value since archived',
      { criteria: [picked('DISPOSAL_SITE', pick('site-oqp', 'Old Quarry Pit', true))] },
      'Disposal site: "Old Quarry Pit" is no longer on the project.',
    ],
    [
      'an Add transaction with no #',
      { actions: [add(null, 'VEG-HAUL-CY-15')] },
      'An Add transaction has no #.',
    ],
    [
      'an Add transaction with no pay item',
      { actions: [add(1, null)] },
      'Add transaction 1 has no pay item.',
    ],
    [
      'a Remove transaction with no #',
      { actions: [remove(null)] },
      'A Remove transaction has no #.',
    ],
    [
      'a line that can’t be read',
      { criteria: [mileage('BETWEEN', 30, 15)] },
      'Mileage BETWEEN runs from its lower end to its higher.',
    ],
  ])('AC-01-62 %s: not valid, the reason given, and it never runs', (_, more, reason) => {
    const validity = new RuleValidity(rule(null, more));
    expect(validity.reasons()).toEqual([reason]);
    expect(validity.valid).toBe(false);
    expect(validity.runs).toBe(false);
  });

  it('AC-01-62 every reason is given, not only the first; it is worked out afresh each time', () => {
    const broken = rule(null, { contract: null, criteria: [], actions: [add(null, null)] });
    expect(new RuleValidity(broken).reasons()).toEqual([
      'It has no criterion: a rule needs at least one.',
      'It adds a transaction, so it must name a contract.',
      'An Add transaction has no #.',
      'An Add transaction has no pay item.',
    ]);
    // A rule holds no "valid" of its own to go stale: the same rule, mended, is valid.
    expect(new RuleValidity(vegHaul15).valid).toBe(true);
    expect('valid' in vegHaul15).toBe(false);
  });

  it('AC-01-62 a valid rule that is switched off, or archived, does not run', () => {
    expect(new RuleValidity(rule(null, { active: false })).valid).toBe(true);
    expect(new RuleValidity(rule(null, { active: false })).runs).toBe(false);
    expect(new RuleValidity(rule(null, { archived: true })).runs).toBe(false);
  });

  it('AC-01-62 a zone the current map no longer has makes its rule not valid (ADR-141)', () => {
    const zoned = rule(null, { criteria: [picked('ZONE', pick('Zone 4', 'Zone 4', true))] });
    expect(new RuleValidity(zoned).reasons()).toEqual([
      'Zone: "Zone 4" is no longer on the project.',
    ]);
  });
});

describe('two rules that add the same transaction #', () => {
  const upTo15 = rule('rule-0-15', {
    name: 'Mileage 0–15',
    criteria: [mileage('BETWEEN', 0, 15)],
  });
  const from15 = rule(null, {
    name: 'Mileage 15–30',
    criteria: [mileage('BETWEEN', 15, 30)],
    actions: [add(1, 'VEG-HAUL-CY-30')],
  });

  it('AC-01-65 Mileage BETWEEN 0 and 15, and BETWEEN 15 and 30: both saved, with a warning that they overlap at 15.0', () => {
    expect(new ProjectRules([upTo15]).check(from15)).toEqual({
      refusal: null,
      warnings: [
        {
          code: 'RULES_OVERLAP',
          message:
            '"Mileage 15–30" and "Mileage 0–15" both add transaction 1, and their Mileage ranges overlap at 15.0. A ticket that meets both is flagged, and neither bills. Saved as it is.',
        },
      ],
      valid: true,
      reasons: [],
    });
  });

  it('AC-01-65 ranges that only meet, 0–15 and 15.1–30, draw no warning; nor do P1’s rules', () => {
    const from151 = { ...from15, criteria: [mileage('BETWEEN', 15.1, 30)] };
    expect(new ProjectRules([upTo15]).check(from151).warnings).toEqual([]);
    expect(
      new ProjectRules([upTo15]).check({ ...from15, criteria: [mileage('MORE_THAN', 15)] })
        .warnings,
    ).toEqual([]);
    for (const each of p1Rules) {
      expect(new ProjectRules(p1Rules).check(each), each.name).toEqual({
        refusal: null,
        warnings: [],
        valid: true,
        reasons: [],
      });
    }
  });

  it('AC-01-65 no warning where another criterion keeps the two apart, they add different #s, or name different contracts', () => {
    const rules = new ProjectRules([upTo15]);
    const overlapping = rule(null, { name: 'Copy', criteria: [mileage('AT_MOST', 20)] });
    expect(rules.check(overlapping).warnings).toHaveLength(1);
    expect(rules.check({ ...overlapping, actions: [add(2, 'TIP-FEE-CY-BCL')] }).warnings).toEqual(
      [],
    );
    expect(rules.check({ ...overlapping, contract: summit }).warnings).toEqual([]);
    expect(rules.check({ ...overlapping, ...haulOut }).warnings).toEqual([]);
    // Vegetative under 15 miles and C&D under 15 miles never meet on one ticket.
    expect(
      new ProjectRules([vegHaul15]).check(
        rule(null, { criteria: [picked('DEBRIS_TYPE', cd), mileage('AT_MOST', 15)] }),
      ).warnings,
    ).toEqual([]);
    // An archived rule takes no part.
    expect(new ProjectRules([{ ...upTo15, archived: true }]).check(overlapping).warnings).toEqual(
      [],
    );
  });

  it('AC-01-65 the warning says where the ranges overlap, and when it is not a range that overlaps', () => {
    const said = (existing: RuleEntry, saved: RuleEntry): string[] =>
      new ProjectRules([existing])
        .check(saved)
        .warnings.map((warning) => warning.message.split('. ')[0] ?? '');
    const dated = (operator: RuleOperator, from: string, to: string | null = null) =>
      line('TICKET_DATE', operator, { dateFrom: from, dateTo: to });
    expect(said(upTo15, rule(null, { name: 'Far', criteria: [mileage('AT_LEAST', 10)] }))).toEqual([
      '"Far" and "Mileage 0–15" both add transaction 1, and their Mileage ranges overlap from 10.0 to 15.0',
    ]);
    // A rate that changes from a date: the old rule ON OR BEFORE 14 Oct, the new ON OR AFTER 15 Oct
    // (spec/RULES.md §5), and what a slip of a day would draw.
    const old = rule('rule-old', {
      name: 'Old rate',
      criteria: [dated('ON_OR_BEFORE', '2026-10-14')],
    });
    const newRate = (from: string): RuleEntry =>
      rule(null, { name: 'New rate', criteria: [dated('ON_OR_AFTER', from)] });
    expect(said(old, newRate('2026-10-15'))).toEqual([]);
    expect(said(old, newRate('2026-10-14'))).toEqual([
      '"New rate" and "Old rate" both add transaction 1, and their Ticket date ranges overlap at 14 Oct 2026',
    ]);
    // No range to name: one rule for a site, one for a debris type, both adding #1.
    expect(
      said(
        vegHaul15,
        rule(null, { name: 'At the landfill', criteria: [picked('DISPOSAL_SITE', landfill)] }),
      ),
    ).toEqual([
      '"At the landfill" and "VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi" both add transaction 1, and a ticket could meet both',
    ]);
  });
});

describe('an exact copy of a rule', () => {
  const rules = new ProjectRules(p1Rules);
  const refusal = {
    code: 'RULE_DUPLICATE',
    message: 'Not saved: this rule is the same as "VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi".',
    sameAs: 'rule-veg-15',
  };

  it('AC-01-81 the same form, contract, criteria and action under another name: not saved, and told why', () => {
    expect(rules.check(rule(null, { name: 'Veg under 15 miles' }))).toEqual({
      refusal,
      warnings: [],
      valid: true,
      reasons: [],
    });
  });

  it('AC-01-81 the same with its criteria in another order, or its Active unticked', () => {
    expect(
      rules.check(
        rule(null, {
          name: 'Veg under 15 miles',
          criteria: [mileage('AT_MOST', 15), picked('DEBRIS_TYPE', vegetative)],
        }),
      ).refusal,
    ).toEqual(refusal);
    expect(rules.check(rule(null, { name: 'Veg under 15 miles', active: false })).refusal).toEqual(
      refusal,
    );
    // And a copy of a rule that is itself switched off.
    expect(
      new ProjectRules([{ ...vegHaul15, active: false }]).check(rule(null, { name: 'Copy' }))
        .refusal,
    ).toEqual(refusal);
  });

  it('AC-01-81 a different rule edited into that copy is refused the same way; the rule itself may be saved again', () => {
    expect(
      rules.check(
        rule('rule-cd-15', {
          name: 'CD-HAUL-CY-15 - ROW C&D haul 0–15 mi',
          criteria: [picked('DEBRIS_TYPE', vegetative), mileage('AT_MOST', 15)],
          actions: [add(1, 'VEG-HAUL-CY-15')],
        }),
      ).refusal,
    ).toEqual(refusal);
    expect(rules.check({ ...vegHaul15, name: 'Renamed' }).refusal).toBeNull();
  });

  it('AC-01-81 one criterion differs (Mileage AT MOST 10.0): saved, with the warning of AC-01-65', () => {
    expect(
      rules.check(
        rule(null, {
          name: 'Veg under 10 miles',
          criteria: [picked('DEBRIS_TYPE', vegetative), mileage('AT_MOST', 10)],
        }),
      ),
    ).toEqual({
      refusal: null,
      warnings: [
        {
          code: 'RULES_OVERLAP',
          message:
            '"Veg under 10 miles" and "VEG-HAUL-CY-15 - ROW VEG haul 0–15 mi" both add transaction 1, and their Mileage ranges overlap up to 10.0. A ticket that meets both is flagged, and neither bills. Saved as it is.',
        },
      ],
      valid: true,
      reasons: [],
    });
  });

  it('AC-01-81 not a copy: another form, another contract, another pay item, another #, an archived rule', () => {
    expect(rules.check(rule(null, { contract: summit })).refusal).toBeNull();
    expect(rules.check(rule(null, { actions: [add(1, 'VEG-HAUL-CY-30')] })).refusal).toBeNull();
    expect(rules.check(rule(null, { actions: [add(3, 'VEG-HAUL-CY-15')] })).refusal).toBeNull();
    expect(
      rules.check(rule(null, { ...haulOut, criteria: [mileage('AT_MOST', 15)] })).refusal,
    ).toBeNull();
    expect(
      new ProjectRules([{ ...vegHaul15, archived: true }]).check(rule(null, { name: 'Again' }))
        .refusal,
    ).toBeNull();
    // Archiving a rule is never refused, whatever it copies.
    expect(rules.check(rule(null, { name: 'Copy', archived: true })).refusal).toBeNull();
  });

  it('AC-01-81 the chosen items of an Add transaction are part of what makes two rules the same', () => {
    const whiteGoods = (items: string[], id: string | null): RuleEntry =>
      rule(id, {
        ...unitRate,
        name: 'WG-RMV-EA',
        criteria: [picked('PAY_ITEM', pick('pay-item-WG-RMV-EA', 'WG-RMV-EA'))],
        actions: [
          {
            ...add(1, 'WG-RMV-EA'),
            quantityFrom: 'CHOSEN_ITEMS',
            items: items.map((name) => ({ id: `item-${name}`, name })),
          },
        ],
      });
    const kept = new ProjectRules([whiteGoods(['Washer', 'Dryer'], 'rule-wg')]);
    expect(kept.check(whiteGoods(['Dryer', 'Washer'], null)).refusal?.code).toBe('RULE_DUPLICATE');
    expect(kept.check(whiteGoods(['Washer'], null)).refusal).toBeNull();
  });
});

describe('the rules a pay item’s "Pays when" writes', () => {
  const contracts: PaysWhenContract[] = [
    { ...coastline, primeId: 'coastline', archived: false },
    { ...summit, primeId: 'summit', archived: false },
  ];
  const hangers = {
    id: 'pay-item-HNG-RMV-EA',
    code: 'HNG-RMV-EA',
    description: 'Hanger removal',
    ratedPrimeIds: ['coastline'],
  };
  const hangersPay = [
    {
      ...unitRate,
      slot: 1,
      criteria: [picked('PAY_ITEM', pick('pay-item-HNG-RMV-EA', 'HNG-RMV-EA'))],
    },
  ];

  it('AC-01-66 HNG-RMV-EA, with a Coastline rate, on the unit rate form: one rule, naming Coastline’s contract, named and marked from the pay item', () => {
    const written = new PaysWhen(hangers, contracts).rules(hangersPay);
    expect(written).toEqual([
      {
        id: null,
        name: 'HNG-RMV-EA - Hanger removal',
        formId: 'form-unit-rate',
        form: 'UNIT_RATE',
        contract: coastline,
        active: true,
        archived: false,
        fromPayItem: { id: 'pay-item-HNG-RMV-EA', code: 'HNG-RMV-EA' },
        criteria: hangersPay[0]?.criteria,
        actions: [add(1, 'HNG-RMV-EA')],
      },
    ]);
    for (const each of written) expect(new RuleValidity(each).reasons()).toEqual([]);
  });

  it('AC-01-66 once Summit has a rate too, Summit’s contract gets its own rule; an archived contract gets none', () => {
    const both = { ...hangers, ratedPrimeIds: ['coastline', 'summit'] };
    expect(
      new PaysWhen(both, contracts).rules(hangersPay).map((each) => each.contract?.name),
    ).toEqual(['Coastline, Bayline ROW 2026', 'Summit, Bayline ROW 2026']);
    expect(
      new PaysWhen(both, [
        { ...coastline, primeId: 'coastline', archived: true },
        { ...summit, primeId: 'summit', archived: false },
      ])
        .rules(hangersPay)
        .map((each) => each.contract?.name),
    ).toEqual(['Summit, Bayline ROW 2026']);
  });

  it('AC-01-66 it can be changed only from the pay item', () => {
    const [written] = new PaysWhen(hangers, contracts).rules(hangersPay);
    if (written === undefined) throw new Error('no rule was written');
    const saved = { ...written, id: 'rule-hangers' };
    const rules = new ProjectRules([
      ...p1Rules.filter((each) => each.name !== 'HNG-RMV-EA'),
      saved,
    ]);
    const refusal = {
      code: 'RULE_FROM_PAY_ITEM',
      message: 'Not saved: this rule is from pay item HNG-RMV-EA. Change it on the pay item.',
      sameAs: null,
    };
    expect(rules.check({ ...saved, active: false }).refusal).toEqual(refusal);
    // Nor by passing it off as a free-standing rule.
    expect(rules.check({ ...saved, name: 'Mine now', fromPayItem: null }).refusal).toEqual(refusal);
    expect(rules.check({ ...saved, active: false }, 'PAY_ITEM').refusal).toBeNull();
    // A rule written for the first time is checked like any other: it may not copy one.
    expect(new ProjectRules(p1Rules).check(written, 'PAY_ITEM').refusal?.code).toBe(
      'RULE_DUPLICATE',
    );
  });

  it('AC-01-67 TIP-FEE-CY-BCL pays on loads and on haul-outs: two rules, one on each form, each adding transaction 2', () => {
    const tippingFee = {
      id: 'pay-item-TIP-FEE-CY-BCL',
      code: 'TIP-FEE-CY-BCL',
      description: 'Tipping fee, Bayline County Landfill',
      ratedPrimeIds: ['coastline'],
    };
    const atTheLandfill = [picked('DISPOSAL_SITE', landfill)];
    const written = new PaysWhen(tippingFee, contracts).rules([
      { formId: 'form-load', form: 'LOAD', slot: 2, criteria: atTheLandfill },
      { ...haulOut, slot: 2, criteria: atTheLandfill },
    ]);
    expect(
      written.map((each) => [each.form, each.name, each.contract?.name, each.actions]),
    ).toEqual([
      [
        'LOAD',
        'TIP-FEE-CY-BCL - Tipping fee, Bayline County Landfill',
        'Coastline, Bayline ROW 2026',
        [add(2, 'TIP-FEE-CY-BCL')],
      ],
      [
        'HAUL_OUT',
        'TIP-FEE-CY-BCL - Tipping fee, Bayline County Landfill',
        'Coastline, Bayline ROW 2026',
        [add(2, 'TIP-FEE-CY-BCL')],
      ],
    ]);
    // They are the golden mission's two tipping fee rules, in everything but their ids.
    const signature = (each: RuleEntry) => ({ ...each, id: null, fromPayItem: null });
    expect(written.map(signature)).toEqual(
      p1Rules.filter((each) => each.name.startsWith('TIP-FEE')).map(signature),
    );
    // Written onto a project that has neither yet, each is saved with no warning.
    const others = new ProjectRules(p1Rules.filter((each) => !each.name.startsWith('TIP-FEE')));
    for (const each of written) {
      expect(others.check(each, 'PAY_ITEM')).toEqual({
        refusal: null,
        warnings: [],
        valid: true,
        reasons: [],
      });
    }
  });
});
