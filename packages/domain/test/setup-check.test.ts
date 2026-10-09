// The setup check, and what each site's phones ask for, at the domain
// (spec/acceptance/01-setup.md section H: AC-01-69…77; spec/parts/01-setup.md; spec/RULES.md §7;
// ADR-223, 227, 229, 243, 357). The setup is P1's as the golden mission §1 has it
// (spec/golden/MISSION.md), with what each scenario adds from the example world
// (spec/CONVENTIONS.md §6).
import { describe, expect, it } from 'vitest';

import {
  type CheckedPayItem,
  type LookupSite,
  type Named,
  type QuantityAskName,
  type RuleActionLine,
  type RuleCriterionKey,
  type RuleCriterionLine,
  type RuleEntry,
  type RuleOperator,
  type SetupChecked,
  QuantityLookup,
  SetupCheck,
  quantityAsks,
  setupGapCodes,
} from '../src/index.ts';

const named = (id: string, name: string): Named => ({ id, name });

const coastlinePrime = named('contractor-coastline', 'Coastline');
const summitPrime = named('contractor-summit', 'Summit');
const coastline = { id: 'contract-coastline', name: 'Coastline, Bayline ROW 2026' };
const summit = { id: 'contract-summit', name: 'Summit, Bayline ROW 2026' };
const coastlineContract = { id: coastline.id, primeId: coastlinePrime.id };
const summitContract = { id: summit.id, primeId: summitPrime.id };

const vegetative = named('debris-veg', 'Vegetative');
const cd = named('debris-cd', 'C&D');
const mulch = named('debris-mulch', 'Mulch');
const ash = named('debris-ash', 'Ash');
const stumpsLoad = named('debris-stumps', 'Stumps');

const tdsr = 'site-type-tdsr';
const finalDisposal = 'site-type-final-disposal';
const idOf = (code: string): string => `pay-item-${code}`;
const site = (
  id: string,
  name: string,
  siteTypeId: string,
  fees: readonly string[] = [],
): LookupSite & { chargesTippingFee: boolean } => ({
  id,
  name,
  siteTypeId,
  chargesTippingFee: fees.length > 0,
  tippingFeePayItemIds: fees.map(idOf),
});
const marshRoad = site('site-marsh-road', 'Marsh Road TDSR', tdsr);
const landfill = site('site-bcl', 'Bayline County Landfill', finalDisposal, ['TIP-FEE-CY-BCL']);
const cypressCreek = site('site-ccl', 'Cypress Creek Landfill', finalDisposal);

// --- Pay items ---------------------------------------------------------------------------------

const payItem = (
  code: string,
  payableType: string,
  unit: CheckedPayItem['unit'],
  coastlineRate: string | null,
  more: Partial<CheckedPayItem> = {},
): CheckedPayItem => ({
  id: idOf(code),
  code,
  unit,
  countIsAlwaysOne: false,
  quantityFromCarriedTickets: false,
  crewTimeConversion: null,
  crewDayHours: null,
  crewDaySteps: [],
  rates: coastlineRate === null ? [] : [{ primeId: coastlinePrime.id, rate: coastlineRate }],
  payableType: named(`payable-${payableType}`, payableType),
  bandFrom: null,
  bandTo: null,
  archived: false,
  ...more,
});
const band = (bandFrom: number, bandTo: number) => ({ bandFrom, bandTo });

// The golden mission §1's pay items, at Coastline's rates.
const p1PayItems: CheckedPayItem[] = [
  payItem('VEG-HAUL-CY-15', 'Vegetative', 'CY', '7.50'),
  payItem('VEG-HAUL-CY-30', 'Vegetative', 'CY', '8.90'),
  payItem('CD-HAUL-CY-15', 'C&D', 'CY', '8.25'),
  payItem('MULCH-HO-CY', 'Vegetative', 'CY', '5.10'),
  payItem('MULCH-HO-TN', 'Vegetative', 'TN', '20.00'),
  payItem('TIP-FEE-CY-BCL', 'Tipping fee', 'CY', '4.00'),
  payItem('HNG-RMV-EA', 'Hangers', 'EA', '68.00'),
  payItem('LNR-RMV-EA-24', 'Leaners', 'EA', '95.00', band(6, 24)),
  payItem('LNR-RMV-EA-99', 'Leaners', 'EA', '185.00', band(24.1, 99)),
  payItem('STP-RMV-EA-36', 'Stumps', 'EA', '110.00', band(24, 36)),
  payItem('STP-RMV-EA-48', 'Stumps', 'EA', '175.00', band(36.1, 48)),
  payItem('STP-FILL-CY', 'Stump fill', 'CY', '22.00'),
  payItem('WG-RMV-EA', 'White Goods', 'EA', '40.00'),
  payItem('WG-FRN-EA', 'Freon recovery', 'EA', '25.00'),
  payItem('CREW-TIME-HR', 'Crew time', 'HR', '150.00', { crewTimeConversion: 'PER_HOUR' }),
];

// --- Rules -------------------------------------------------------------------------------------

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
const picked = (
  criterion: RuleCriterionKey,
  operator: RuleOperator,
  ...from: Named[]
): RuleCriterionLine =>
  line(criterion, operator, {
    picks: from.map((each) => ({ value: each.id, name: each.name, gone: false })),
  });
const is = (criterion: RuleCriterionKey, from: Named): RuleCriterionLine =>
  picked(criterion, 'EQUALS', from);
const mileage = (operator: RuleOperator, from: number, to: number | null = null) =>
  line('MILEAGE', operator, { numberFrom: from, numberTo: to });
const add = (slot: number, code: string): RuleActionLine => ({
  kind: 'ADD_TRANSACTION',
  slot,
  payItem: { id: idOf(code), code },
  quantityFrom: 'ALL_ITEMS',
  items: [],
});
const rule = (
  id: string,
  form: RuleEntry['form'],
  criteria: readonly RuleCriterionLine[],
  actions: readonly RuleActionLine[],
  more: Partial<RuleEntry> = {},
): RuleEntry => ({
  id,
  name: id,
  formId: `form-${form.toLowerCase()}`,
  form,
  contract: coastline,
  active: true,
  archived: false,
  fromPayItem: null,
  criteria,
  actions,
  ...more,
});
const paysItself = (code: string): RuleEntry =>
  rule(code, 'UNIT_RATE', [is('PAY_ITEM', named(idOf(code), code))], [add(1, code)]);

// The golden mission §1's rules, each naming "Coastline, Bayline ROW 2026".
const p1Rules: RuleEntry[] = [
  rule(
    'VEG-HAUL-CY-15',
    'LOAD',
    [is('DEBRIS_TYPE', vegetative), mileage('AT_MOST', 15)],
    [add(1, 'VEG-HAUL-CY-15')],
  ),
  rule(
    'VEG-HAUL-CY-30',
    'LOAD',
    [is('DEBRIS_TYPE', vegetative), mileage('BETWEEN', 15.1, 30)],
    [add(1, 'VEG-HAUL-CY-30')],
  ),
  rule(
    'CD-HAUL-CY-15',
    'LOAD',
    [is('DEBRIS_TYPE', cd), mileage('AT_MOST', 15)],
    [add(1, 'CD-HAUL-CY-15')],
  ),
  rule('TIP-FEE-CY-BCL', 'LOAD', [is('DISPOSAL_SITE', landfill)], [add(2, 'TIP-FEE-CY-BCL')]),
  rule(
    'TIP-FEE-CY-BCL (haul-outs)',
    'HAUL_OUT',
    [is('DISPOSAL_SITE', landfill)],
    [add(2, 'TIP-FEE-CY-BCL')],
  ),
  rule(
    'MULCH-HO-CY',
    'HAUL_OUT',
    [is('DEBRIS_TYPE', mulch), is('DISPOSAL_SITE', landfill)],
    [add(1, 'MULCH-HO-CY')],
  ),
  rule(
    'MULCH-HO-TN',
    'HAUL_OUT',
    [is('DEBRIS_TYPE', mulch), is('DISPOSAL_SITE', cypressCreek)],
    [add(1, 'MULCH-HO-TN')],
  ),
  paysItself('HNG-RMV-EA'),
  paysItself('LNR-RMV-EA-24'),
  paysItself('LNR-RMV-EA-99'),
  paysItself('STP-RMV-EA-36'),
  paysItself('STP-RMV-EA-48'),
  paysItself('CREW-TIME-HR'),
  rule(
    'STP-FILL-CY',
    'UNIT_RATE',
    [
      picked(
        'PAY_ITEM',
        'IS_ONE_OF',
        named(idOf('STP-RMV-EA-36'), 'STP-RMV-EA-36'),
        named(idOf('STP-RMV-EA-48'), 'STP-RMV-EA-48'),
      ),
    ],
    [add(2, 'STP-FILL-CY')],
  ),
  rule(
    'WG-RMV-EA',
    'UNIT_RATE',
    [is('PAY_ITEM', named(idOf('WG-RMV-EA'), 'WG-RMV-EA'))],
    [add(1, 'WG-RMV-EA'), add(2, 'WG-FRN-EA')],
  ),
];

const loadForm = { id: 'form-load', form: 'LOAD', debrisTypes: [vegetative, cd] } as const;
const haulOutForm = { id: 'form-haul_out', form: 'HAUL_OUT', debrisTypes: [mulch] } as const;

const p1: SetupChecked & { sites: (typeof marshRoad)[] } = {
  primes: [coastlinePrime],
  contracts: [coastlineContract],
  forms: [loadForm, haulOutForm],
  sites: [marshRoad, landfill, cypressCreek],
  payItems: p1PayItems,
  rules: p1Rules,
};
const withSummit = {
  primes: [coastlinePrime, summitPrime],
  contracts: [coastlineContract, summitContract],
};

const gapsOf = (setup: SetupChecked) =>
  new SetupCheck(setup).gaps().map(({ code, message }) => ({ code, message }));

describe('the setup check', () => {
  it('AC-01-69 P1 exactly as the golden mission sets it up: nothing is listed', () => {
    expect(new SetupCheck(p1).gaps()).toEqual([]);
  });

  it('AC-01-70 Bayline County Landfill charges a tipping fee and has no fee pay item linked: the site is listed', () => {
    const unlinked = { ...landfill, tippingFeePayItemIds: [] };
    const gaps = new SetupCheck({ ...p1, sites: [marshRoad, unlinked, cypressCreek] }).gaps();
    expect(gaps).toEqual([
      {
        code: 'TIPPING_FEE_SITE_NO_PAY_ITEM',
        message:
          'Bayline County Landfill charges a tipping fee, but no tipping fee pay item is linked to it.',
        siteId: landfill.id,
        debrisTypeId: null,
        payItemId: null,
        primeId: null,
        ruleId: null,
      },
    ]);
  });

  it('AC-01-70 a linked fee pay item that has been archived is no link; a site that charges nothing is never listed', () => {
    const payItems = p1PayItems.map((each) =>
      each.code === 'TIP-FEE-CY-BCL' ? { ...each, archived: true } : each,
    );
    const codes = new SetupCheck({ ...p1, payItems }).gaps().map((gap) => gap.code);
    expect(codes).toContain('TIPPING_FEE_SITE_NO_PAY_ITEM');
    expect(gapsOf({ ...p1, sites: [marshRoad, cypressCreek] })).toEqual([]);
  });

  it('AC-01-71 Ash is added to the haul-out form and no rule on that form can pay it: Ash is listed', () => {
    const forms = [loadForm, { ...haulOutForm, debrisTypes: [mulch, ash] }];
    const gaps = new SetupCheck({ ...p1, forms }).gaps();
    expect(
      gaps.map(({ code, message, debrisTypeId }) => ({ code, message, debrisTypeId })),
    ).toEqual([
      {
        code: 'DEBRIS_TYPE_NO_RULE',
        message: 'Ash is on the haul-out form, but no rule on that form pays it.',
        debrisTypeId: ash.id,
      },
    ]);
  });

  it('AC-01-71 the tipping fee rule, which reads no debris type, pays no debris type; a rule on another form doesn’t either', () => {
    // Ash on the haul-out form is still listed though "Disposal site = Bayline County Landfill"
    // would add its fee, and though a load rule pays Ash.
    const forms = [loadForm, { ...haulOutForm, debrisTypes: [mulch, ash] }];
    const ashLoads = rule('ASH-LOADS', 'LOAD', [is('DEBRIS_TYPE', ash)], [add(1, 'CD-HAUL-CY-15')]);
    expect(gapsOf({ ...p1, forms, rules: [...p1Rules, ashLoads] })).toEqual([
      {
        code: 'DEBRIS_TYPE_NO_RULE',
        message: 'Ash is on the haul-out form, but no rule on that form pays it.',
      },
    ]);
  });

  it('AC-01-71 a rule pays a debris type it names, one it doesn’t rule out, and every one when it reads none', () => {
    const forms = [loadForm, { ...haulOutForm, debrisTypes: [mulch, ash] }];
    const pays = (...criteria: RuleCriterionLine[]): unknown[] =>
      gapsOf({
        ...p1,
        forms,
        rules: [...p1Rules, rule('ASH', 'HAUL_OUT', criteria, [add(1, 'MULCH-HO-CY')])],
      });
    expect(pays(is('DEBRIS_TYPE', ash))).toEqual([]);
    expect(pays(picked('DEBRIS_TYPE', 'IS_ONE_OF', mulch, ash))).toEqual([]);
    expect(pays(picked('DEBRIS_TYPE', 'NOT_EQUALS', mulch))).toEqual([]);
    expect(pays(is('DISPOSAL_SITE', cypressCreek))).toEqual([]);
    expect(pays(picked('DEBRIS_TYPE', 'IS_NOT_ONE_OF', ash))).toHaveLength(1);
    expect(pays(line('DEBRIS_TYPE', 'IS_EMPTY'))).toHaveLength(1);
  });

  it('AC-01-71 a rule that is switched off, archived or not valid pays nothing', () => {
    const forms = [loadForm, { ...haulOutForm, debrisTypes: [mulch, ash] }];
    const ashRule = (more: Partial<RuleEntry>): RuleEntry =>
      rule('ASH', 'HAUL_OUT', [is('DEBRIS_TYPE', ash)], [add(1, 'MULCH-HO-CY')], more);
    for (const more of [{ active: false }, { archived: true }]) {
      expect(gapsOf({ ...p1, forms, rules: [...p1Rules, ashRule(more)] })).toHaveLength(1);
    }
    const codes = gapsOf({ ...p1, forms, rules: [...p1Rules, ashRule({ contract: null })] });
    expect(codes.map((gap) => gap.code)).toEqual(['DEBRIS_TYPE_NO_RULE', 'RULE_NOT_VALID']);
  });

  it('AC-01-72 Summit’s rule adds VEG-HAUL-CY-15, which holds no rate for Summit: the pay item and the prime are listed', () => {
    const summitVeg = rule(
      'Summit VEG haul 0–15 mi',
      'LOAD',
      [is('DEBRIS_TYPE', vegetative), mileage('AT_MOST', 15)],
      [add(1, 'VEG-HAUL-CY-15')],
      { contract: summit },
    );
    const gaps = new SetupCheck({ ...p1, ...withSummit, rules: [...p1Rules, summitVeg] }).gaps();
    expect(gaps).toEqual([
      {
        code: 'NO_RATE_FOR_PRIME',
        message:
          'Pay item VEG-HAUL-CY-15 has no rate for Summit, and "Summit VEG haul 0–15 mi" adds it on a Summit contract.',
        siteId: null,
        debrisTypeId: null,
        payItemId: idOf('VEG-HAUL-CY-15'),
        primeId: summitPrime.id,
        ruleId: null,
      },
    ]);
  });

  it('AC-01-72 once the pay item holds Summit’s $7.80 it is no longer listed; two rules adding it are one line', () => {
    const summitRule = (name: string, to: RuleCriterionLine): RuleEntry =>
      rule(name, 'LOAD', [is('DEBRIS_TYPE', vegetative), to], [add(1, 'VEG-HAUL-CY-15')], {
        contract: summit,
      });
    const rules = [
      ...p1Rules,
      summitRule('Summit to Marsh Road', is('DISPOSAL_SITE', marshRoad)),
      summitRule('Summit to the landfill', is('DISPOSAL_SITE', landfill)),
    ];
    expect(gapsOf({ ...p1, ...withSummit, rules }).map((gap) => gap.message)).toEqual([
      'Pay item VEG-HAUL-CY-15 has no rate for Summit, and "Summit to Marsh Road" and "Summit to the landfill" add it on a Summit contract.',
    ]);
    const payItems = p1PayItems.map((each) =>
      each.code === 'VEG-HAUL-CY-15'
        ? { ...each, rates: [...each.rates, { primeId: summitPrime.id, rate: '7.80' }] }
        : each,
    );
    expect(gapsOf({ ...p1, ...withSummit, rules, payItems })).toEqual([]);
  });

  it('AC-01-72 a pay item with no rate for any prime is a $0 pay item, and one to be negotiated has none yet: neither is listed', () => {
    // WG-FRN-EA-STG, freon staged, is $0 on purpose (ADR-128): not a gap every day.
    const payItems = [
      ...p1PayItems,
      payItem('WG-FRN-EA-STG', 'Freon recovery', 'EA', null),
      payItem('HNG-SPECIAL-TBN', 'Hangers', 'TBN', null, {
        rates: [{ primeId: summitPrime.id, rate: '0' }],
      }),
    ];
    const rules = [
      ...p1Rules,
      rule(
        'WG-FRN-EA-STG',
        'UNIT_RATE',
        [is('PAY_ITEM', named(idOf('WG-RMV-EA'), 'WG-RMV-EA'))],
        [add(3, 'WG-FRN-EA-STG')],
      ),
      paysItself('HNG-SPECIAL-TBN'),
    ];
    expect(gapsOf({ ...p1, payItems, rules })).toEqual([]);
  });

  it('AC-01-69 bands that overlap, were the database ever to let them, and a stretch in no band are both listed', () => {
    const payItems = [
      ...p1PayItems,
      payItem('LNR-RMV-EA-30', 'Leaners', 'EA', '120.00', band(20, 30)),
      payItem('STP-RMV-EA-72', 'Stumps', 'EA', '260.00', band(60, 72)),
    ];
    expect(gapsOf({ ...p1, payItems })).toEqual([
      {
        code: 'SIZE_BANDS_OVERLAP',
        message: 'Leaners: LNR-RMV-EA-24 (6–24 in) overlaps LNR-RMV-EA-30 (20–30 in).',
      },
      {
        code: 'SIZE_BANDS_OVERLAP',
        message: 'Leaners: LNR-RMV-EA-30 (20–30 in) overlaps LNR-RMV-EA-99 (24.1–99 in).',
      },
      {
        code: 'SIZE_BAND_GAP',
        message:
          'Stumps: 48.1–59.9 in falls in no band; a measurement there gets no pay item and is flagged.',
      },
    ]);
  });

  it('a crew day paid in steps: steps a quarter hour apart meet; hours between two steps in neither are listed', () => {
    const steps = (...each: [string, string, string][]) => ({
      crewTimeConversion: 'PER_DAY_STEPS' as const,
      crewDaySteps: each.map(([fromHours, toHours, quantity]) => ({
        fromHours,
        toHours,
        quantity,
      })),
    });
    // The example world's CREW-TIME-DAY-STP: 1.5–4.5 h = 0.25, 4.75–8.5 h = 0.5, 8.75–12 h = 1.
    const whole = steps(['1.5', '4.5', '0.25'], ['4.75', '8.5', '0.5'], ['8.75', '12', '1']);
    const crewDay = (more: Partial<CheckedPayItem>): SetupChecked => ({
      ...p1,
      payItems: [
        ...p1PayItems,
        payItem('CREW-TIME-DAY-STP', 'Crew time', 'CREW_DAY', '1800.00', more),
      ],
    });
    expect(gapsOf(crewDay(whole))).toEqual([]);
    expect(
      gapsOf(crewDay(steps(['8.75', '12', '1'], ['1.5', '4.5', '0.25'], ['5', '8', '0.5']))),
    ).toEqual([
      {
        code: 'CREW_DAY_STEP_GAP',
        message:
          'Pay item CREW-TIME-DAY-STP: 4.75 h falls in no step; crew time there bills nothing on that line and is flagged.',
      },
      {
        code: 'CREW_DAY_STEP_GAP',
        message:
          'Pay item CREW-TIME-DAY-STP: 8.25–8.5 h falls in no step; crew time there bills nothing on that line and is flagged.',
      },
    ]);
    expect(gapsOf(crewDay(steps()))).toEqual([
      {
        code: 'CREW_DAY_STEP_GAP',
        message:
          'Pay item CREW-TIME-DAY-STP pays a crew day in steps, but has no step; crew time on it bills nothing and is flagged.',
      },
    ]);
    expect(gapsOf(crewDay({ ...steps(), archived: true }))).toEqual([]);
  });

  it('AC-01-73 an active rule that is not valid is listed with every reason; switched off or archived, it isn’t', () => {
    const broken = (more: Partial<RuleEntry>): RuleEntry =>
      rule(
        'Old C&D rule',
        'LOAD',
        [mileage('AT_MOST', 15), is('PAY_ITEM', cd)],
        [add(1, 'CD-HAUL-CY-15')],
        {
          contract: null,
          ...more,
        },
      );
    const gaps = new SetupCheck({ ...p1, rules: [...p1Rules, broken({})] }).gaps();
    expect(gaps).toEqual([
      {
        code: 'RULE_NOT_VALID',
        message:
          'Rule "Old C&D rule" is active but not valid, so it never runs. Pay item doesn\'t apply to a load rule. It adds a transaction, so it must name a contract.',
        siteId: null,
        debrisTypeId: null,
        payItemId: null,
        primeId: null,
        ruleId: 'Old C&D rule',
      },
    ]);
    for (const more of [{ active: false }, { archived: true }]) {
      expect(gapsOf({ ...p1, rules: [...p1Rules, broken(more)] })).toEqual([]);
    }
  });

  it('AC-01-73 a rule left naming an archived pay item or contract is listed, and what it paid is listed with it', () => {
    const rules = p1Rules.map((each) =>
      each.id === 'MULCH-HO-TN'
        ? {
            ...each,
            actions: [
              {
                ...add(1, 'MULCH-HO-TN'),
                payItem: { id: idOf('MULCH-HO-TN'), code: 'MULCH-HO-TN', archived: true },
              },
            ],
          }
        : each.id === 'MULCH-HO-CY'
          ? { ...each, contract: { ...coastline, archived: true } }
          : each,
    );
    expect(gapsOf({ ...p1, rules })).toEqual([
      {
        code: 'DEBRIS_TYPE_NO_RULE',
        message: 'Mulch is on the haul-out form, but no rule on that form pays it.',
      },
      {
        code: 'RULE_NOT_VALID',
        message:
          'Rule "MULCH-HO-CY" is active but not valid, so it never runs. Its contract "Coastline, Bayline ROW 2026" is archived.',
      },
      {
        code: 'RULE_NOT_VALID',
        message:
          'Rule "MULCH-HO-TN" is active but not valid, so it never runs. Pay item MULCH-HO-TN is archived.',
      },
    ]);
  });

  it('it lists and never refuses: the same setup gives the same list, in the order of its kinds', () => {
    expect(setupGapCodes).toEqual([
      'TIPPING_FEE_SITE_NO_PAY_ITEM',
      'DEBRIS_TYPE_NO_RULE',
      'NO_RATE_FOR_PRIME',
      'SIZE_BANDS_OVERLAP',
      'SIZE_BAND_GAP',
      'CREW_DAY_STEP_GAP',
      'RULE_NOT_VALID',
    ]);
    const setup = {
      ...p1,
      forms: [loadForm, { ...haulOutForm, debrisTypes: [mulch, ash] }],
      sites: [
        ...p1.sites,
        { ...site('site-oqp', 'Old Quarry Pit', finalDisposal), chargesTippingFee: true },
      ],
    };
    const first = new SetupCheck(setup).gaps();
    expect(first.map((gap) => gap.code)).toEqual([
      'TIPPING_FEE_SITE_NO_PAY_ITEM',
      'DEBRIS_TYPE_NO_RULE',
    ]);
    expect(new SetupCheck(setup).gaps()).toEqual(first);
  });
});

// --- What each site's phones ask for -----------------------------------------------------------

const lookupOf = (setup: Partial<typeof p1> = {}): QuantityLookup =>
  new QuantityLookup({ ...p1, ...setup });
const asksAt = (
  lookup: QuantityLookup,
  form: 'LOAD' | 'HAUL_OUT',
  at: Named,
  debrisType: Named,
  prime: Named = coastlinePrime,
): QuantityAskName =>
  lookup.asks({ siteId: at.id, form, debrisTypeId: debrisType.id, primeId: prime.id });

describe("what each site's phones ask for", () => {
  it('the lookup has four answers', () => {
    expect(quantityAsks).toEqual(['LOAD_CALL', 'SCALE_WEIGHT', 'CARRIED_COUNT', 'NOTHING_MORE']);
  });

  it('AC-01-74 a load at Marsh Road TDSR, Vegetative or C&D, Coastline: the load call', () => {
    expect(asksAt(lookupOf(), 'LOAD', marshRoad, vegetative)).toBe('LOAD_CALL');
    expect(asksAt(lookupOf(), 'LOAD', marshRoad, cd)).toBe('LOAD_CALL');
  });

  it('AC-01-74 a load at Bayline County Landfill: the load call, its tipping fee pay item left out of the working', () => {
    expect(asksAt(lookupOf(), 'LOAD', landfill, vegetative)).toBe('LOAD_CALL');
    // A fee by the ton changes nothing: a fee never makes a phone ask for anything (ADR-224).
    const payItems = p1PayItems.map((each) =>
      each.code === 'TIP-FEE-CY-BCL' ? { ...each, unit: 'TN' as const } : each,
    );
    expect(asksAt(lookupOf({ payItems }), 'LOAD', landfill, vegetative)).toBe('LOAD_CALL');
    // With no hauling rule at all there, a fee by the ton alone still asks for the load call.
    const feeOnly = p1Rules.filter((each) => each.id === 'TIP-FEE-CY-BCL');
    expect(asksAt(lookupOf({ payItems, rules: feeOnly }), 'LOAD', landfill, cd)).toBe('LOAD_CALL');
  });

  it('AC-01-74 a haul-out disposal of Mulch at Bayline County Landfill: nothing more', () => {
    expect(asksAt(lookupOf(), 'HAUL_OUT', landfill, mulch)).toBe('NOTHING_MORE');
  });

  it('AC-01-74 a haul-out disposal of Mulch at Cypress Creek Landfill: the scale weight', () => {
    expect(asksAt(lookupOf(), 'HAUL_OUT', cypressCreek, mulch)).toBe('SCALE_WEIGHT');
  });

  it('AC-01-74 the whole lookup of P1: a row for each site, debris type and prime', () => {
    const rows = lookupOf()
      .entries()
      .map(({ siteId, form, debrisTypeId, primeId, asks }) => {
        expect(primeId).toBe(coastlinePrime.id);
        return `${siteId} ${form} ${debrisTypeId}: ${asks}`;
      });
    expect(rows).toEqual([
      'site-marsh-road LOAD debris-veg: LOAD_CALL',
      'site-marsh-road LOAD debris-cd: LOAD_CALL',
      'site-marsh-road HAUL_OUT debris-mulch: NOTHING_MORE',
      'site-bcl LOAD debris-veg: LOAD_CALL',
      'site-bcl LOAD debris-cd: LOAD_CALL',
      'site-bcl HAUL_OUT debris-mulch: NOTHING_MORE',
      'site-ccl LOAD debris-veg: LOAD_CALL',
      'site-ccl LOAD debris-cd: LOAD_CALL',
      'site-ccl HAUL_OUT debris-mulch: SCALE_WEIGHT',
    ]);
    expect(
      lookupOf()
        .at(cypressCreek.id)
        .map((row) => row.asks),
    ).toEqual(['LOAD_CALL', 'LOAD_CALL', 'SCALE_WEIGHT']);
  });

  it('AC-01-74 per ton and per CY rules that could both pay a load there are a mix: the load call', () => {
    const payItems = [...p1PayItems, payItem('VEG-HAUL-TN', 'Vegetative', 'TN', '21.00')];
    const byTon = (more: RuleCriterionLine[]): RuleEntry =>
      rule(
        'VEG-HAUL-TN',
        'LOAD',
        [is('DEBRIS_TYPE', vegetative), ...more],
        [add(1, 'VEG-HAUL-TN')],
      );
    // One mileage band per ton: the phone can't know the miles, so it is a mix everywhere.
    const mixed = lookupOf({ payItems, rules: [...p1Rules, byTon([mileage('MORE_THAN', 30)])] });
    expect(asksAt(mixed, 'LOAD', landfill, vegetative)).toBe('LOAD_CALL');
    // Every rule that could pay Vegetative at the landfill per ton: the scale weight, there only.
    const perCyElsewhere = p1Rules.map((each) =>
      each.id?.startsWith('VEG-HAUL-CY') === true
        ? { ...each, criteria: [...each.criteria, picked('DISPOSAL_SITE', 'NOT_EQUALS', landfill)] }
        : each,
    );
    const weighed = lookupOf({
      payItems,
      rules: [
        ...perCyElsewhere,
        byTon([
          picked('DISPOSAL_SITE_TYPE', 'EQUALS', named(finalDisposal, 'Final Disposal')),
          picked('DISPOSAL_SITE', 'IS_NOT_ONE_OF', cypressCreek),
        ]),
      ],
    });
    expect(asksAt(weighed, 'LOAD', landfill, vegetative)).toBe('SCALE_WEIGHT');
    expect(asksAt(weighed, 'LOAD', marshRoad, vegetative)).toBe('LOAD_CALL');
    expect(asksAt(weighed, 'LOAD', cypressCreek, vegetative)).toBe('LOAD_CALL');
    expect(asksAt(weighed, 'LOAD', landfill, cd)).toBe('LOAD_CALL');
  });

  it('AC-01-74 a rule that is switched off, archived or not valid is not read; a pay item by the pound is by weight', () => {
    const payItems = [...p1PayItems, payItem('HHW-HAUL-LB', 'HHW', 'LB', '1.85')];
    const pounds = (more: Partial<RuleEntry>): QuantityLookup =>
      lookupOf({
        payItems,
        forms: [{ ...loadForm, debrisTypes: [vegetative, cd, ash] }, haulOutForm],
        rules: [
          ...p1Rules,
          rule('HHW-HAUL-LB', 'LOAD', [is('DEBRIS_TYPE', ash)], [add(1, 'HHW-HAUL-LB')], more),
        ],
      });
    expect(asksAt(pounds({}), 'LOAD', marshRoad, ash)).toBe('SCALE_WEIGHT');
    for (const more of [{ active: false }, { archived: true }, { name: ' ' }]) {
      expect(asksAt(pounds(more), 'LOAD', marshRoad, ash)).toBe('LOAD_CALL');
    }
  });

  it('AC-01-75 every rule that could pay a load of Stumps there pays from the tickets it carries: a count', () => {
    const forms = [{ ...loadForm, debrisTypes: [vegetative, cd, stumpsLoad] }, haulOutForm];
    const payItems = [
      ...p1PayItems,
      payItem('STP-HAUL-CY', 'Stumps', 'CY', '9.00', { quantityFromCarriedTickets: true }),
    ];
    const stumpHaul = rule(
      'STP-HAUL-CY',
      'LOAD',
      [is('DEBRIS_TYPE', stumpsLoad)],
      [add(1, 'STP-HAUL-CY')],
    );
    const counted = lookupOf({ forms, payItems, rules: [...p1Rules, stumpHaul] });
    expect(asksAt(counted, 'LOAD', marshRoad, stumpsLoad)).toBe('CARRIED_COUNT');
    expect(asksAt(counted, 'LOAD', landfill, stumpsLoad)).toBe('CARRIED_COUNT');
    expect(asksAt(counted, 'LOAD', marshRoad, vegetative)).toBe('LOAD_CALL');
    // Beside a rule that pays the same load by the CY it is a mix: the load call.
    const alsoByCy = rule(
      'STP-CY',
      'LOAD',
      [is('DEBRIS_TYPE', stumpsLoad)],
      [add(2, 'VEG-HAUL-CY-15')],
    );
    const mixed = lookupOf({ forms, payItems, rules: [...p1Rules, stumpHaul, alsoByCy] });
    expect(asksAt(mixed, 'LOAD', marshRoad, stumpsLoad)).toBe('LOAD_CALL');
  });

  it('AC-01-76 Coastline’s rules pay Vegetative loads per ton and Summit’s per CY: the weight for a Coastline truck, the load call for a Summit truck', () => {
    const payItems = [...p1PayItems, payItem('VEG-HAUL-TN', 'Vegetative', 'TN', '21.00')];
    const rules = [
      ...p1Rules.filter((each) => each.id?.startsWith('VEG-HAUL-CY') !== true),
      rule('VEG-HAUL-TN', 'LOAD', [is('DEBRIS_TYPE', vegetative)], [add(1, 'VEG-HAUL-TN')]),
      rule('Summit VEG', 'LOAD', [is('DEBRIS_TYPE', vegetative)], [add(1, 'VEG-HAUL-CY-15')], {
        contract: summit,
      }),
    ];
    const lookup = lookupOf({ ...withSummit, payItems, rules });
    expect(asksAt(lookup, 'LOAD', marshRoad, vegetative, coastlinePrime)).toBe('SCALE_WEIGHT');
    expect(asksAt(lookup, 'LOAD', marshRoad, vegetative, summitPrime)).toBe('LOAD_CALL');
    expect(lookup.at(marshRoad.id).filter((row) => row.debrisTypeId === vegetative.id)).toEqual([
      {
        siteId: marshRoad.id,
        form: 'LOAD',
        debrisTypeId: vegetative.id,
        primeId: coastlinePrime.id,
        asks: 'SCALE_WEIGHT',
      },
      {
        siteId: marshRoad.id,
        form: 'LOAD',
        debrisTypeId: vegetative.id,
        primeId: summitPrime.id,
        asks: 'LOAD_CALL',
      },
    ]);
  });

  it('AC-01-76 a prime with no rule of its own is asked for the load call, and nothing more at a haul-out disposal; a Contractor line is read', () => {
    const lookup = lookupOf(withSummit);
    expect(asksAt(lookup, 'LOAD', marshRoad, vegetative, summitPrime)).toBe('LOAD_CALL');
    expect(asksAt(lookup, 'HAUL_OUT', cypressCreek, mulch, summitPrime)).toBe('NOTHING_MORE');
    const notCoastline = p1Rules.map((each) =>
      each.id === 'MULCH-HO-TN'
        ? {
            ...each,
            criteria: [...each.criteria, picked('CONTRACTOR', 'NOT_EQUALS', coastlinePrime)],
          }
        : each,
    );
    expect(asksAt(lookupOf({ rules: notCoastline }), 'HAUL_OUT', cypressCreek, mulch)).toBe(
      'NOTHING_MORE',
    );
  });

  it('AC-01-77 when Dana changes a rule or a pay item it is worked out again; it reads the setup and no ticket', () => {
    expect(asksAt(lookupOf(), 'HAUL_OUT', landfill, mulch)).toBe('NOTHING_MORE');
    // The pay item's Unit of Measure changed.
    const payItems = p1PayItems.map((each) =>
      each.code === 'MULCH-HO-CY' ? { ...each, unit: 'TN' as const } : each,
    );
    expect(asksAt(lookupOf({ payItems }), 'HAUL_OUT', landfill, mulch)).toBe('SCALE_WEIGHT');
    // The rule changed: Cypress Creek's haul-outs now paid by the CY.
    const rules = p1Rules.map((each) =>
      each.id === 'MULCH-HO-TN' ? { ...each, actions: [add(1, 'MULCH-HO-CY')] } : each,
    );
    expect(asksAt(lookupOf({ rules }), 'HAUL_OUT', cypressCreek, mulch)).toBe('NOTHING_MORE');
    // The same setup always gives the same lookup: nothing else goes in.
    expect(lookupOf().entries()).toEqual(lookupOf().entries());
    expect(QuantityLookup.length).toBe(1);
  });

  it('a rule that adds a pay item the lookup was not handed is an error, never a guess', () => {
    const rules = [...p1Rules, rule('X', 'LOAD', [is('DEBRIS_TYPE', cd)], [add(1, 'NOT-HANDED')])];
    expect(() => asksAt(lookupOf({ rules }), 'LOAD', marshRoad, cd)).toThrow(
      "The lookup wasn't handed pay item NOT-HANDED, which a rule adds.",
    );
  });
});
