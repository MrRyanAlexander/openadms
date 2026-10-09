// Actions to lines, the quantity, the rate and the pricing flags
// (spec/acceptance/07-pricing-ledger-audit.md sections C…F: AC-07-10, 11 and 38…83, with
// AC-06-70, 71, 91, 105, 120…123; spec/RULES.md §5, §6, §9; ADR-355). The tickets, pay items,
// rates and rules are the golden mission's (spec/golden/MISSION.md §1…§3) and the example
// world's (spec/CONVENTIONS.md §6).
import { describe, expect, it } from 'vitest';

import {
  type FlagRaised,
  type Named,
  type PricedDumpSite,
  type PricedLine,
  type PricedPayItem,
  type PricedPiece,
  type PricingSetup,
  type RuleActionLine,
  type RuleCriterionKey,
  type RuleCriterionLine,
  type RuleEntry,
  type RuleFieldEvent,
  type RuleOperator,
  type RulePick,
  type RuleReading,
  type TicketPriced,
  type TicketToPrice,
  Flags,
  Ticket,
  TicketPricing,
  TicketReadings,
  ruleActionKinds,
} from '../src/index.ts';

const timeZone = 'America/New_York';
const named = (id: string, name: string): Named => ({ id, name });

const coastlinePrime = named('contractor-coastline', 'Coastline');
const summitPrime = named('contractor-summit', 'Summit');
const rivera = 'contractor-rivera';
const coastline = { id: 'contract-coastline', name: 'Coastline, Bayline ROW 2026' };
const summit = { id: 'contract-summit', name: 'Summit, Bayline ROW 2026' };
const contracts = [
  { id: coastline.id, primeId: coastlinePrime.id },
  { id: summit.id, primeId: summitPrime.id },
];

const vegetative = named('debris-veg', 'Vegetative');
const cd = named('debris-cd', 'C&D');
const mulch = named('debris-mulch', 'Mulch');

const marshRoad = named('site-marsh-road', 'Marsh Road TDSR');
const landfill = named('site-bcl', 'Bayline County Landfill');
const cypressCreek = named('site-ccl', 'Cypress Creek Landfill');
const oldQuarryPit = named('site-oqp', 'Old Quarry Pit');

const washer = named('item-washer', 'Washer');
const dryer = named('item-dryer', 'Dryer');
const freonRecovered = named('item-freon-recovered', 'Fridge, freon recovered');
const freonStaged = named('item-freon-staged', 'Fridge, freon staged');
const noFreon = named('item-no-freon', 'Fridge, no freon');
const skidSteer = named('item-skid-steer', 'Skid Steer');
const truck = named('item-truck', 'Truck');

// --- Pay items ---------------------------------------------------------------------------------

const idOf = (code: string): string => `pay-item-${code}`;
const payItem = (
  code: string,
  unit: PricedPayItem['unit'],
  coastlineRate: string | null,
  more: Partial<PricedPayItem> = {},
): PricedPayItem => ({
  id: idOf(code),
  code,
  unit,
  countIsAlwaysOne: false,
  quantityFromCarriedTickets: false,
  crewTimeConversion: null,
  crewDayHours: null,
  crewDaySteps: [],
  rates: coastlineRate === null ? [] : [{ primeId: coastlinePrime.id, rate: coastlineRate }],
  ...more,
});

// The golden mission §1's pay items at Coastline's rates, with the ones the scenarios add.
const p1PayItems: PricedPayItem[] = [
  payItem('VEG-HAUL-CY-15', 'CY', '7.50', {
    rates: [
      { primeId: coastlinePrime.id, rate: '7.50' },
      { primeId: summitPrime.id, rate: '7.80' },
    ],
  }),
  payItem('VEG-HAUL-CY-30', 'CY', '8.90'),
  payItem('CD-HAUL-CY-15', 'CY', '8.25'),
  payItem('MULCH-HO-CY', 'CY', '5.10'),
  payItem('MULCH-HO-TN', 'TN', '20.00'),
  payItem('TIP-FEE-CY-BCL', 'CY', '4.00'),
  payItem('TIP-FEE-TN-BCL', 'TN', '6.00'),
  payItem('HNG-RMV-EA', 'EA', '68.00'),
  payItem('LNR-RMV-EA-24', 'EA', '95.00'),
  payItem('LNR-RMV-EA-99', 'EA', '185.00'),
  payItem('STP-RMV-EA-36', 'EA', '110.00'),
  payItem('STP-RMV-EA-48', 'EA', '175.00'),
  payItem('STP-FILL-CY', 'CY', '22.00'),
  payItem('WG-RMV-EA', 'EA', '40.00'),
  payItem('WG-FRN-EA', 'EA', '25.00'),
  // Freon staged: no rate for any prime, a $0 pay item (ADR-128).
  payItem('WG-FRN-EA-STG', 'EA', null),
  payItem('CREW-TIME-HR', 'HR', '150.00', { crewTimeConversion: 'PER_HOUR' }),
];

// --- Rules -------------------------------------------------------------------------------------

const pick = (from: Named): RulePick => ({ value: from.id, name: from.name, gone: false });
const payItemPick = (code: string): RulePick => ({ value: idOf(code), name: code, gone: false });
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
  ...picks: RulePick[]
): RuleCriterionLine => line(criterion, operator, { picks });
const number = (
  criterion: RuleCriterionKey,
  operator: RuleOperator,
  from: number,
  to: number | null = null,
): RuleCriterionLine => line(criterion, operator, { numberFrom: from, numberTo: to });
const item = (of: Named, operator: RuleOperator, count: number): RuleCriterionLine =>
  line('ITEM', operator, { picks: [pick(of)], numberFrom: count });

const add = (
  slot: number,
  code: string,
  chosen: readonly Named[] | null = null,
): RuleActionLine => ({
  kind: 'ADD_TRANSACTION',
  slot,
  payItem: { id: idOf(code), code },
  quantityFrom: chosen === null ? 'ALL_ITEMS' : 'CHOSEN_ITEMS',
  items: chosen ?? [],
});
const remove = (slot: number): RuleActionLine => ({
  kind: 'REMOVE_TRANSACTION',
  slot,
  payItem: null,
  quantityFrom: null,
  items: [],
});
const voidTicket: RuleActionLine = {
  kind: 'VOID_TICKET',
  slot: null,
  payItem: null,
  quantityFrom: null,
  items: [],
};

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
  rule(code, 'UNIT_RATE', [picked('PAY_ITEM', 'EQUALS', payItemPick(code))], [add(1, code)]);

const isVegetative = picked('DEBRIS_TYPE', 'EQUALS', pick(vegetative));
const atLandfill = picked('DISPOSAL_SITE', 'EQUALS', pick(landfill));

// The golden mission §1's rules of P1; white goods as spec/RULES.md §9's rules 5 and 6.
const missionRules: RuleEntry[] = [
  rule(
    'VEG-HAUL-CY-15',
    'LOAD',
    [isVegetative, number('MILEAGE', 'AT_MOST', 15)],
    [add(1, 'VEG-HAUL-CY-15')],
  ),
  rule(
    'VEG-HAUL-CY-30',
    'LOAD',
    [isVegetative, number('MILEAGE', 'BETWEEN', 15.1, 30)],
    [add(1, 'VEG-HAUL-CY-30')],
  ),
  rule(
    'CD-HAUL-CY-15',
    'LOAD',
    [picked('DEBRIS_TYPE', 'EQUALS', pick(cd)), number('MILEAGE', 'AT_MOST', 15)],
    [add(1, 'CD-HAUL-CY-15')],
  ),
  rule('TIP-FEE-CY-BCL', 'LOAD', [atLandfill], [add(2, 'TIP-FEE-CY-BCL')]),
  rule('TIP-FEE-CY-BCL (haul-outs)', 'HAUL_OUT', [atLandfill], [add(2, 'TIP-FEE-CY-BCL')]),
  rule(
    'MULCH-HO-CY',
    'HAUL_OUT',
    [picked('DEBRIS_TYPE', 'EQUALS', pick(mulch)), atLandfill],
    [add(1, 'MULCH-HO-CY')],
  ),
  rule(
    'MULCH-HO-TN',
    'HAUL_OUT',
    [
      picked('DEBRIS_TYPE', 'EQUALS', pick(mulch)),
      picked('DISPOSAL_SITE', 'EQUALS', pick(cypressCreek)),
    ],
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
    [picked('PAY_ITEM', 'IS_ONE_OF', payItemPick('STP-RMV-EA-36'), payItemPick('STP-RMV-EA-48'))],
    [add(2, 'STP-FILL-CY')],
  ),
  rule(
    'WG-RMV-EA',
    'UNIT_RATE',
    [picked('PAY_ITEM', 'EQUALS', payItemPick('WG-RMV-EA'))],
    [add(1, 'WG-RMV-EA', [washer, dryer, freonRecovered, noFreon])],
  ),
  rule(
    'WG-FRN-EA',
    'UNIT_RATE',
    [picked('PAY_ITEM', 'EQUALS', payItemPick('WG-RMV-EA')), item(freonRecovered, 'AT_LEAST', 1)],
    [add(2, 'WG-FRN-EA', [freonRecovered])],
  ),
];
const stagedFreon = rule(
  'WG-FRN-EA-STG',
  'UNIT_RATE',
  [picked('PAY_ITEM', 'EQUALS', payItemPick('WG-RMV-EA')), item(freonStaged, 'AT_LEAST', 1)],
  [add(3, 'WG-FRN-EA-STG', [freonStaged])],
);
const summitVegHaul = rule(
  'VEG-HAUL-CY-15 (Summit)',
  'LOAD',
  [isVegetative, number('MILEAGE', 'AT_MOST', 15)],
  [add(1, 'VEG-HAUL-CY-15')],
  { contract: summit },
);
const voidAtOldQuarry = rule(
  'Void at Old Quarry Pit',
  'LOAD',
  [picked('DISPOSAL_SITE', 'EQUALS', pick(oldQuarryPit))],
  [voidTicket],
  { contract: null },
);

const rulesWithoutFee = missionRules.filter((each) => !each.name.startsWith('TIP-FEE'));

const setupOf = (more: Partial<PricingSetup> = {}): PricingSetup => ({
  timeZone,
  rules: missionRules,
  contracts,
  primes: [coastlinePrime, summitPrime],
  payItems: p1PayItems,
  stumpCheckFillNeedsExposure: true,
  ...more,
});
const withRules = (...more: RuleEntry[]): TicketPricing =>
  new TicketPricing(setupOf({ rules: [...missionRules, ...more] }));
const withPayItems = (payItems: PricedPayItem[], ...rules: RuleEntry[]): TicketPricing =>
  new TicketPricing(setupOf({ payItems: [...p1PayItems, ...payItems], rules }));
const mission = new TicketPricing(setupOf());

// --- Tickets -----------------------------------------------------------------------------------

const blank: RuleReading = {
  splitSuffix: '',
  ticketDate: '2026-10-12',
  contractorId: coastlinePrime.id,
  debrisTypeId: null,
  fieldTagId: null,
  weightTons: null,
  volumeCy: null,
  collectionAddress: null,
  zoneName: null,
  disposalSiteId: null,
  fromSiteId: null,
  disposalSiteTypeId: null,
  mileage: null,
  payItemId: null,
  unitCount: null,
  measurementInches: null,
  items: [],
};

let made = 0;
const piece = (reading: Partial<RuleReading>, more: Partial<PricedPiece> = {}): PricedPiece => {
  made += 1;
  return {
    reading: { ...blank, ...reading },
    fieldEventId: `event-${String(made)}`,
    countShape: null,
    stump: null,
    ...more,
  };
};

const bcl: PricedDumpSite = {
  ...landfill,
  chargesTippingFee: true,
  tippingFeePayItemIds: [idOf('TIP-FEE-CY-BCL'), idOf('TIP-FEE-TN-BCL')],
};
const noFee = (site: Named): PricedDumpSite => ({
  ...site,
  chargesTippingFee: false,
  tippingFeePayItemIds: [],
});

const ticket = (
  ticketNumber: string,
  form: TicketToPrice['form'],
  pieces: readonly PricedPiece[],
  more: Partial<TicketToPrice> = {},
): TicketToPrice => ({
  ticketNumber,
  form,
  primeId: coastlinePrime.id,
  operatingSubId: null,
  pieces,
  dumpedAt: null,
  raised: [],
  ...more,
});

// A load: Vegetative, 6.2050 road miles, dumped at Marsh Road TDSR unless told.
const load = (
  ticketNumber: string,
  volumeCy: string | null,
  reading: Partial<RuleReading> = {},
  more: Partial<TicketToPrice> = {},
): TicketToPrice => {
  const dumpedAt = more.dumpedAt ?? noFee(marshRoad);
  return ticket(
    ticketNumber,
    'LOAD',
    [
      piece({
        debrisTypeId: vegetative.id,
        mileage: '6.2050',
        volumeCy,
        disposalSiteId: dumpedAt.id,
        ...reading,
      }),
    ],
    { dumpedAt, ...more },
  );
};
const l101001 = load('101001', '52.00');
// C&D, 75% of 48 CY, 11.4419 road miles to Bayline County Landfill, on Rivera's truck.
const l101002 = load(
  '101002',
  '36.00',
  { debrisTypeId: cd.id, mileage: '11.4419' },
  { dumpedAt: bcl, operatingSubId: rivera },
);

// A haul-out of Mulch from Marsh Road TDSR; each pile with its share.
const haulOut = (
  ticketNumber: string,
  dumpedAt: PricedDumpSite,
  piles: readonly Partial<RuleReading>[],
  more: Partial<TicketToPrice> = {},
): TicketToPrice =>
  ticket(
    ticketNumber,
    'HAUL_OUT',
    piles.map((pile) =>
      piece({
        debrisTypeId: mulch.id,
        fromSiteId: marshRoad.id,
        disposalSiteId: dumpedAt.id,
        ...pile,
      }),
    ),
    { dumpedAt, ...more },
  );
const h201001 = haulOut('201001', bcl, [{ volumeCy: '99.00' }]);
const piles201004 = [
  { splitSuffix: 'A', volumeCy: '11.00', weightTons: '2.8200' },
  { splitSuffix: 'B', volumeCy: '27.50', weightTons: '7.0600' },
  { splitSuffix: 'C', volumeCy: '55.00', weightTons: '14.1200' },
];
const h201004 = haulOut('201004', noFee(cypressCreek), piles201004);

const unitRate = (
  ticketNumber: string,
  code: string | null,
  reading: Partial<RuleReading> = {},
  more: Partial<PricedPiece> = {},
): TicketToPrice =>
  ticket(ticketNumber, 'UNIT_RATE', [
    piece(
      { payItemId: code === null ? null : idOf(code), unitCount: 1, ...reading },
      { countShape: 'NUMBER', ...more },
    ),
  ]);
const counts = (...of: [Named, number][]): RuleReading['items'] =>
  of.map(([itemName, count]) => ({ itemNameId: itemName.id, count }));
const whiteGoods = (ticketNumber: string, items: RuleReading['items']): TicketToPrice =>
  unitRate(
    ticketNumber,
    'WG-RMV-EA',
    { unitCount: items.reduce((sum, each) => sum + Number(each.count), 0), items },
    { countShape: 'ITEM_COUNTS' },
  );
const u301006 = whiteGoods(
  '301006',
  counts([washer, 2], [dryer, 1], [freonRecovered, 2], [noFreon, 1]),
);
const crewTime = (ticketNumber: string, code: string, hours: [Named, number][]): TicketToPrice =>
  unitRate(
    ticketNumber,
    code,
    { unitCount: Math.max(...hours.map(([, each]) => each)), items: counts(...hours) },
    { countShape: 'ITEM_HOURS' },
  );
const u301007 = crewTime('301007', 'CREW-TIME-HR', [
  [skidSteer, 9.75],
  [truck, 8.5],
]);
const stump = (
  ticketNumber: string,
  fillCy: string | null,
  rootBallHalfExposed: boolean | null = true,
): TicketToPrice =>
  unitRate(
    ticketNumber,
    'STP-RMV-EA-36',
    { measurementInches: 30 },
    { stump: { fillCy, rootBallHalfExposed } },
  );

const flags = new Flags(timeZone);
const raisedOn = (ticketNumber: string): { ticketNumber: string } => ({ ticketNumber });

// The codes of the pay items, with the ones a test adds.
const p1PayItemsAndMore = new Map(p1PayItems.map((each) => [each.id, each.code]));
// "#1 VEG-HAUL-CY-15 52.0000 × 7.5000 = 390.00", with the pile or property where split.
const told = (priced: TicketPriced): string[] =>
  priced.lines.map((each: PricedLine) => {
    const code = p1PayItemsAndMore.get(each.payItemId) ?? each.payItemId;
    const of = each.splitSuffix === '' ? '' : `-${each.splitSuffix} `;
    return `${of}#${String(each.slot)} ${code} ${each.quantity} × ${each.rate} = ${each.amount}`;
  });
const codeOf = (code: string): string => {
  p1PayItemsAndMore.set(idOf(code), code);
  return code;
};
const messages = (priced: TicketPriced): string[] => priced.flags.map((flag) => flag.message);
const total = (priced: TicketPriced): string =>
  (
    priced.lines.reduce((sum, each) => sum + Math.round(Number(each.amount) * 100), 0) / 100
  ).toFixed(2);

describe('the rules that run, or don’t', () => {
  it('AC-07-10 no rule runs on a ticket still waiting for a field event, and it has no lines', () => {
    const collection: RuleFieldEvent = {
      id: 'event-101005',
      projectId: 'project-p1',
      workflow: 'LOAD',
      kind: 'COLLECTION',
      ticketNumber: '101005',
      splitSuffix: '',
      startedAt: new Date('2026-10-13T16:30:00-04:00'),
      endedAt: new Date('2026-10-13T16:40:00-04:00'),
      certNumber: '730415',
      debrisType: vegetative,
      fieldTag: null,
      address: null,
      site: null,
      kindOfWork: null,
      unitCount: null,
      items: [],
    };
    const pending = new Ticket([collection]);
    const read = new TicketReadings({
      timeZone,
      certifications: [{ certNumber: '730415', primeId: coastlinePrime.id }],
      zones: [],
    }).of(pending, { zones: [], workedOut: null, shares: [] });

    expect(pending.status([])).toBe('PENDING');
    expect(read.readings).toEqual([]);
    expect(mission.of(ticket('101005', 'LOAD', []))).toEqual({
      voidedBy: [],
      lines: [],
      flags: [],
    });
  });

  it('AC-07-11 a haul-out dumped at a TDSR skips the rules: no lines, and the one flag that says "not priced"', () => {
    const dumpedAtTdsr = flags.raise(
      'HAUL_OUT_DUMPED_AT_TDSR',
      raisedOn('201002'),
      { site: 'Marsh Road TDSR' },
      { siteId: marshRoad.id },
    );
    // Even a rule that would void it is skipped until its site is corrected.
    const voidAtMarshRoad = rule(
      'Void at Marsh Road',
      'HAUL_OUT',
      [picked('DISPOSAL_SITE', 'EQUALS', pick(marshRoad))],
      [voidTicket],
      { contract: null },
    );
    const h201002 = haulOut('201002', noFee(marshRoad), [{ volumeCy: '88.00' }], {
      raised: [dumpedAtTdsr],
    });

    expect(dumpedAtTdsr.message).toBe(
      'Ticket 201002: a haul-out dumped at Marsh Road TDSR, a TDSR. Flagged for review; not priced.',
    );
    expect(withRules(voidAtMarshRoad).of(h201002)).toEqual({ voidedBy: [], lines: [], flags: [] });
  });
});

describe('actions, their order, and the same answer every time', () => {
  it('AC-07-38 each Add transaction that runs writes exactly one line, in its slot', () => {
    const priced = mission.of(l101001);

    expect(priced.lines).toHaveLength(1);
    expect(priced.lines[0]).toMatchObject({
      slot: 1,
      ruleId: 'VEG-HAUL-CY-15',
      payItemId: idOf('VEG-HAUL-CY-15'),
      contractId: coastline.id,
      unit: 'CY',
    });
    expect(priced.flags).toEqual([]);
  });

  it('AC-07-39 two rules pass on 101002: two lines, kept apart by their slots', () => {
    expect(told(mission.of(l101002))).toEqual([
      '#1 CD-HAUL-CY-15 36.0000 × 8.2500 = 297.00',
      '#2 TIP-FEE-CY-BCL 36.0000 × 4.0000 = 144.00',
    ]);
  });

  it('AC-07-40 every Add runs first, in # order, then every Remove, then any Void; the lines come out in # order', () => {
    const third = rule('third', 'LOAD', [atLandfill], [add(3, 'VEG-HAUL-CY-30')]);
    const removesThird = rule('removes third', 'LOAD', [atLandfill], [remove(3)], {
      contract: null,
    });
    // The Remove is written before the Add it takes off, and the #3 before the #1 and #2.
    const priced = new TicketPricing(setupOf({ rules: [removesThird, third, ...missionRules] })).of(
      l101002,
    );
    const kept = new TicketPricing(setupOf({ rules: [third, ...missionRules] })).of(l101002);

    expect(kept.lines.map((each) => each.slot)).toEqual([1, 2, 3]);
    expect(priced.lines.map((each) => each.slot)).toEqual([1, 2]);
    // A Void, after both: nothing an Add wrote is kept.
    const voided = new TicketPricing(
      setupOf({
        rules: [rule('void', 'LOAD', [atLandfill], [voidTicket], { contract: null }), third],
      }),
    ).of(l101002);
    expect(voided.lines).toEqual([]);
    expect(voided.voidedBy).toEqual([{ id: 'void', name: 'void' }]);
  });

  it('AC-07-41 the order the rules were written in never matters', () => {
    const written = mission.of(l101002);
    const reversed = new TicketPricing(setupOf({ rules: [...missionRules].reverse() }));
    // Seven is no factor of the number of rules, so every rule is taken once.
    const order = missionRules.map((_, at) => (at * 7 + 3) % missionRules.length);
    const shuffled = new TicketPricing(
      setupOf({ rules: order.flatMap((at) => missionRules.slice(at, at + 1)) }),
    );

    expect(new Set(order).size).toBe(missionRules.length);
    expect(order).not.toEqual(missionRules.map((_, at) => at));
    expect(reversed.of(l101002)).toEqual(written);
    expect(shuffled.of(l101002)).toEqual(written);
  });

  it('AC-07-42 priced twice, a ticket gets the same answer, line for line', () => {
    for (const each of [l101001, l101002, h201001, h201004, u301006, u301007]) {
      expect(mission.of(each)).toEqual(mission.of(each));
      expect(new TicketPricing(setupOf()).of(each)).toEqual(mission.of(each));
    }
  });

  it('AC-07-43 a Remove takes off the # an Add wrote: a C&D load from 1 December keeps #1 alone', () => {
    const noFeeFromDecember = rule(
      'No fee on C&D from 1 Dec',
      'LOAD',
      [
        atLandfill,
        picked('DEBRIS_TYPE', 'EQUALS', pick(cd)),
        line('TICKET_DATE', 'ON_OR_AFTER', { dateFrom: '2026-12-01' }),
      ],
      [remove(2)],
    );
    const pricing = withRules(noFeeFromDecember);
    const december = load(
      '101090',
      '36.00',
      { debrisTypeId: cd.id, mileage: '11.4419', ticketDate: '2026-12-02' },
      { dumpedAt: bcl },
    );

    expect(told(pricing.of(december))).toEqual(['#1 CD-HAUL-CY-15 36.0000 × 8.2500 = 297.00']);
    // The fee was removed on purpose: no rule is missing.
    expect(pricing.of(december).flags).toEqual([]);
    expect(told(pricing.of(l101002))).toHaveLength(2);
  });

  it('a Remove of a # nothing added does nothing, and a ticket whose only line was removed has none', () => {
    const removesFifth = rule('removes 5', 'LOAD', [isVegetative], [remove(5)], { contract: null });
    const removesFirst = rule('removes 1', 'LOAD', [isVegetative], [remove(1)], { contract: null });

    expect(withRules(removesFifth).of(l101001)).toEqual(mission.of(l101001));
    expect(withRules(removesFirst).of(l101001)).toEqual({ voidedBy: [], lines: [], flags: [] });
  });

  it('AC-07-44 a rule’s Void ticket voids the ticket: no lines, and the rule named as the reason', () => {
    const l101009 = load('101009', '26.00', {}, { dumpedAt: noFee(oldQuarryPit) });
    const priced = withRules(voidAtOldQuarry).of(l101009);

    // Without the rule its hauling rule adds a line; with it none is kept.
    expect(told(mission.of(l101009))).toHaveLength(1);
    expect(priced).toEqual({
      voidedBy: [{ id: 'Void at Old Quarry Pit', name: 'Void at Old Quarry Pit' }],
      lines: [],
      flags: [],
    });
  });

  it('AC-07-45 a rule’s void always wins on every run, until the data or the rule is changed', () => {
    const pricing = withRules(voidAtOldQuarry);
    const l101009 = load('101009', '26.00', {}, { dumpedAt: noFee(oldQuarryPit) });
    const corrected = load('101009', '26.00', {}, { dumpedAt: noFee(marshRoad) });

    expect(pricing.of(l101009).voidedBy).toHaveLength(1);
    expect(pricing.of(l101009).voidedBy).toHaveLength(1);
    // Under a flag that says "not billed" too.
    const zero = flags.raise('LOAD_CALL_ZERO', raisedOn('101009'), {}, { loadCall: 0 });
    expect(pricing.of({ ...l101009, raised: [zero] }).voidedBy).toHaveLength(1);
    // The disposal's site corrected, or the rule switched off: it is priced.
    expect(told(pricing.of(corrected))).toEqual(['#1 VEG-HAUL-CY-15 26.0000 × 7.5000 = 195.00']);
    expect(pricing.of(corrected).voidedBy).toEqual([]);
    expect(told(withRules({ ...voidAtOldQuarry, active: false }).of(l101009))).toHaveLength(1);
  });

  it('AC-07-46 one rule with two Add actions writes both lines when it passes', () => {
    const both = rule(
      'haul and fee',
      'LOAD',
      [atLandfill],
      [add(1, 'CD-HAUL-CY-15'), add(2, 'TIP-FEE-CY-BCL')],
    );

    expect(told(new TicketPricing(setupOf({ rules: [both] })).of(l101002))).toEqual([
      '#1 CD-HAUL-CY-15 36.0000 × 8.2500 = 297.00',
      '#2 TIP-FEE-CY-BCL 36.0000 × 4.0000 = 144.00',
    ]);
  });

  it('AC-07-47 no action is a Flag action', () => {
    expect(ruleActionKinds).toEqual(['ADD_TRANSACTION', 'REMOVE_TRANSACTION', 'VOID_TICKET']);
  });
});

describe('the quantity each line bills', () => {
  it('AC-07-48 CY, a load: capacity × load call', () => {
    expect(told(mission.of(l101001))).toEqual(['#1 VEG-HAUL-CY-15 52.0000 × 7.5000 = 390.00']);
  });

  it('AC-07-49 CY, a haul-out: its collection’s call, with the tipping fee', () => {
    expect(told(mission.of(h201001))).toEqual([
      '#1 MULCH-HO-CY 99.0000 × 5.1000 = 504.90',
      '#2 TIP-FEE-CY-BCL 99.0000 × 4.0000 = 396.00',
    ]);
  });

  it('AC-07-50 TN: the scale weight; each pile’s line bills its share, and the CY is not billed', () => {
    const priced = mission.of(h201004);

    expect(priced.lines.map((each) => [each.unit, each.quantity])).toEqual([
      ['TN', '2.8200'],
      ['TN', '7.0600'],
      ['TN', '14.1200'],
    ]);
  });

  it('AC-07-51 TN, a tandem: each ticket’s line bills its share of the one weight', () => {
    const perTon = rule('VEG-HAUL-TN', 'LOAD', [isVegetative], [add(1, codeOf('VEG-HAUL-TN'))]);
    const pricing = withPayItems([payItem('VEG-HAUL-TN', 'TN', '21.00')], perTon);
    const shared = (number: string, shareTons: string): FlagRaised =>
      flags.raise(
        'SHARED_SCALE_WEIGHT',
        raisedOn(number),
        { shareTons, netTons: '17.10' },
        { shareTons },
      );
    const l101050 = load(
      '101050',
      null,
      { weightTons: '7.3300' },
      { raised: [shared('101050', '7.33')] },
    );
    const l101051 = load(
      '101051',
      null,
      { weightTons: '9.7700' },
      { raised: [shared('101051', '9.77')] },
    );

    // Both are flagged, and both bill.
    expect(told(pricing.of(l101050))).toEqual(['#1 VEG-HAUL-TN 7.3300 × 21.0000 = 153.93']);
    expect(told(pricing.of(l101051))).toEqual(['#1 VEG-HAUL-TN 9.7700 × 21.0000 = 205.17']);
  });

  it('AC-07-52 one quantity bills, and the pay item says which', () => {
    const both = load('101055', '26.00', { weightTons: '8.4000' }, { dumpedAt: bcl });
    const byCy = rule('fee by the CY', 'LOAD', [atLandfill], [add(2, 'TIP-FEE-CY-BCL')]);
    const byTon = rule('fee by the ton', 'LOAD', [atLandfill], [add(2, 'TIP-FEE-TN-BCL')]);

    expect(told(new TicketPricing(setupOf({ rules: [byCy] })).of(both))).toEqual([
      '#2 TIP-FEE-CY-BCL 26.0000 × 4.0000 = 104.00',
    ]);
    expect(told(new TicketPricing(setupOf({ rules: [byTon] })).of(both))).toEqual([
      '#2 TIP-FEE-TN-BCL 8.4000 × 6.0000 = 50.40',
    ]);
  });

  it('AC-07-53 CY from the tickets a load carries: three stumps of 4.8, 7.8 and 12.0 CY are 24.6 CY, with no load call', () => {
    const stumps = rule('STP-HAUL-CY', 'LOAD', [isVegetative], [add(1, codeOf('STP-HAUL-CY'))]);
    const pricing = withPayItems(
      [payItem('STP-HAUL-CY', 'CY', '9.00', { quantityFromCarriedTickets: true })],
      stumps,
    );
    const carrying = ticket(
      '101014',
      'LOAD',
      [piece({ debrisTypeId: vegetative.id }, { carriedCount: 3, carriedStumpCy: '24.60' })],
      { dumpedAt: noFee(marshRoad) },
    );

    expect(told(pricing.of(carrying))).toEqual(['#1 STP-HAUL-CY 24.6000 × 9.0000 = 221.40']);
  });

  it('AC-07-54 EA from the tickets a load carries: the count of items on them', () => {
    const goods = rule('WG-HAUL-EA-60', 'LOAD', [isVegetative], [add(1, codeOf('WG-HAUL-EA-60'))]);
    const pricing = withPayItems(
      [payItem('WG-HAUL-EA-60', 'EA', '12.00', { quantityFromCarriedTickets: true })],
      goods,
    );
    const carrying = ticket(
      '101015',
      'LOAD',
      [piece({ debrisTypeId: vegetative.id }, { carriedCount: 6 })],
      { dumpedAt: noFee(marshRoad) },
    );

    expect(told(pricing.of(carrying))).toEqual(['#1 WG-HAUL-EA-60 6.0000 × 12.0000 = 72.00']);
  });

  it('AC-07-55 EA, a count; "Count is always 1" bills 1 whatever count the record holds', () => {
    expect(told(mission.of(unitRate('301001', 'HNG-RMV-EA')))).toEqual([
      '#1 HNG-RMV-EA 1.0000 × 68.0000 = 68.00',
    ]);
    expect(
      told(mission.of(unitRate('301002', 'LNR-RMV-EA-24', { measurementInches: 18 }))),
    ).toEqual(['#1 LNR-RMV-EA-24 1.0000 × 95.0000 = 95.00']);

    const three = unitRate('301030', 'HNG-RMV-EA', { unitCount: 3 });
    const alwaysOne = new TicketPricing(
      setupOf({
        payItems: p1PayItems.map((each) =>
          each.code === 'HNG-RMV-EA' ? { ...each, countIsAlwaysOne: true } : each,
        ),
      }),
    );
    expect(told(mission.of(three))).toEqual(['#1 HNG-RMV-EA 3.0000 × 68.0000 = 204.00']);
    expect(told(alwaysOne.of(three))).toEqual(['#1 HNG-RMV-EA 1.0000 × 68.0000 = 68.00']);
  });

  it('AC-07-56 EA, an itemised ticket, all items: the total of its items', () => {
    const allItems = rule(
      'all items',
      'UNIT_RATE',
      [picked('PAY_ITEM', 'EQUALS', payItemPick('WG-RMV-EA'))],
      [add(1, 'WG-RMV-EA')],
    );

    expect(told(new TicketPricing(setupOf({ rules: [allItems] })).of(u301006))).toEqual([
      '#1 WG-RMV-EA 6.0000 × 40.0000 = 240.00',
    ]);
  });

  it('AC-07-57 EA, chosen items: the rules say which items count toward which pay item', () => {
    const pricing = withRules(stagedFreon);
    const removed = pricing.of(u301006);
    const staged = pricing.of(
      whiteGoods('301022', counts([washer, 2], [dryer, 1], [noFreon, 1], [freonStaged, 2])),
    );

    expect(told(removed)).toEqual([
      '#1 WG-RMV-EA 6.0000 × 40.0000 = 240.00',
      '#2 WG-FRN-EA 2.0000 × 25.0000 = 50.00',
    ]);
    expect(total(removed)).toBe('290.00');
    expect(told(staged)).toEqual([
      '#1 WG-RMV-EA 4.0000 × 40.0000 = 160.00',
      '#3 WG-FRN-EA-STG 2.0000 × 0.0000 = 0.00',
    ]);
    expect(total(staged)).toBe('160.00');
    expect([...removed.flags, ...staged.flags]).toEqual([]);
  });

  it('AC-07-58 LB: the pounds the monitor entered as the count', () => {
    const hhw = paysItself(codeOf('HHW-RMV-LB'));
    const pricing = withPayItems([payItem('HHW-RMV-LB', 'LB', '1.85')], hhw);

    expect(told(pricing.of(unitRate('301023', 'HHW-RMV-LB', { unitCount: 55 })))).toEqual([
      '#1 HHW-RMV-LB 55.0000 × 1.8500 = 101.75',
    ]);
  });

  it('AC-07-59 HR: the highest item’s hours, once', () => {
    expect(told(mission.of(u301007))).toEqual(['#1 CREW-TIME-HR 9.7500 × 150.0000 = 1462.50']);
  });

  it('AC-07-60 CREW_DAY: by exact division, or in the steps the firm entered', () => {
    const exact = payItem('CREW-TIME-DAY', 'CREW_DAY', '1800.00', {
      crewTimeConversion: 'PER_DAY_EXACT',
      crewDayHours: '12.00',
    });
    const steps = payItem('CREW-TIME-DAY-STP', 'CREW_DAY', '1800.00', {
      crewTimeConversion: 'PER_DAY_STEPS',
      crewDaySteps: [
        { fromHours: '1.50', toHours: '4.50', quantity: '0.2500' },
        { fromHours: '4.75', toHours: '8.50', quantity: '0.5000' },
        { fromHours: '8.75', toHours: '12.00', quantity: '1.0000' },
      ],
    });
    const pricing = withPayItems(
      [exact, steps],
      paysItself(codeOf('CREW-TIME-DAY')),
      paysItself(codeOf('CREW-TIME-DAY-STP')),
    );
    const hours: [Named, number][] = [
      [skidSteer, 9.75],
      [truck, 8.5],
    ];

    expect(told(pricing.of(crewTime('301024', 'CREW-TIME-DAY', hours)))).toEqual([
      '#1 CREW-TIME-DAY 0.8125 × 1800.0000 = 1462.50',
    ]);
    expect(told(pricing.of(crewTime('301025', 'CREW-TIME-DAY-STP', hours)))).toEqual([
      '#1 CREW-TIME-DAY-STP 1.0000 × 1800.0000 = 1800.00',
    ]);
    expect(told(pricing.of(crewTime('301026', 'CREW-TIME-DAY-STP', [[skidSteer, 4.5]])))).toEqual([
      '#1 CREW-TIME-DAY-STP 0.2500 × 1800.0000 = 450.00',
    ]);
  });

  it('AC-07-61 a stump ticket: 1 each by its band, and the fill CY; never the stump’s own CY', () => {
    expect(told(mission.of(stump('301004', '4.8')))).toEqual([
      '#1 STP-RMV-EA-36 1.0000 × 110.0000 = 110.00',
      '#2 STP-FILL-CY 4.8000 × 22.0000 = 105.60',
    ]);
  });

  it('AC-07-62 a stump with no root-ball diameter has no fill CY: no fill line, and its stump line bills', () => {
    const priced = mission.of(stump('301017', null, null));

    expect(told(priced)).toEqual(['#1 STP-RMV-EA-36 1.0000 × 110.0000 = 110.00']);
    // `ROOT_BALL_MISSING` is the checks' to raise; pricing adds no flag of its own.
    expect(priced.flags).toEqual([]);
  });

  it('AC-07-63, AC-06-123 TBN: that line bills nothing and the ticket is flagged; its other lines bill', () => {
    const tbn = payItem('HNG-SPECIAL-TBN', 'TBN', null);
    const pricing = withPayItems(
      [tbn],
      paysItself('HNG-RMV-EA'),
      rule(
        'special',
        'UNIT_RATE',
        [picked('PAY_ITEM', 'EQUALS', payItemPick('HNG-RMV-EA'))],
        [add(2, 'HNG-SPECIAL-TBN')],
      ),
    );
    const priced = pricing.of(unitRate('301021', 'HNG-RMV-EA'));

    expect(told(priced)).toEqual(['#1 HNG-RMV-EA 1.0000 × 68.0000 = 68.00']);
    expect(messages(priced)).toEqual(['Ticket 301021: rate to be negotiated. Not billed yet.']);
    expect(priced.flags[0]).toMatchObject({
      code: 'RATE_TO_BE_NEGOTIATED',
      billing: 'LINE_NOT_BILLED',
      slot: 2,
      payItemId: tbn.id,
    });
  });
});

describe('the rate, the amount, and who bills', () => {
  const l101044 = load('101044', '14.00', {}, { primeId: summitPrime.id });

  it('AC-07-64 the rate is the pay item’s rate for the rule’s contract’s prime; the pay item isn’t copied', () => {
    const pricing = withRules(summitVegHaul);

    expect(told(pricing.of(l101001))).toEqual(['#1 VEG-HAUL-CY-15 52.0000 × 7.5000 = 390.00']);
    expect(told(pricing.of(l101044))).toEqual(['#1 VEG-HAUL-CY-15 14.0000 × 7.8000 = 109.20']);
    expect(pricing.of(l101044).lines[0]).toMatchObject({
      contractId: summit.id,
      primeId: summitPrime.id,
      payItemId: idOf('VEG-HAUL-CY-15'),
    });
  });

  it('AC-07-65 the amount is the quantity × the rate', () => {
    expect(mission.of(l101002).lines.map((each) => each.amount)).toEqual(['297.00', '144.00']);
  });

  it('the user, ADR-355: an amount is rounded to the cent a half up', () => {
    const odd = new TicketPricing(
      setupOf({
        payItems: [
          payItem('CREW-TIME-HR', 'HR', '151.25', { crewTimeConversion: 'PER_HOUR' }),
          payItem('HNG-RMV-EA', 'EA', '18.25'),
        ],
      }),
    );

    // 9.75 × $151.25 = $1,474.6875; 0.5 × $18.25 = $9.125.
    expect(told(odd.of(u301007))).toEqual(['#1 CREW-TIME-HR 9.7500 × 151.2500 = 1474.69']);
    expect(told(odd.of(unitRate('301031', 'HNG-RMV-EA', { unitCount: 0.5 })))).toEqual([
      '#1 HNG-RMV-EA 0.5000 × 18.2500 = 9.13',
    ]);
  });

  it('the user, ADR-355: a crew day by exact division keeps four decimals, and the amount is that quantity × the rate', () => {
    const exact = payItem('CREW-TIME-DAY', 'CREW_DAY', '1800.00', {
      crewTimeConversion: 'PER_DAY_EXACT',
      crewDayHours: '12.00',
    });
    const pricing = withPayItems([exact], paysItself(codeOf('CREW-TIME-DAY')));

    // 10.25 ÷ 12 = 0.8541666…
    expect(told(pricing.of(crewTime('301027', 'CREW-TIME-DAY', [[skidSteer, 10.25]])))).toEqual([
      '#1 CREW-TIME-DAY 0.8542 × 1800.0000 = 1537.56',
    ]);
  });

  it('the user, ADR-355: hours that fall in no step bill nothing on that line, and the ticket is flagged', () => {
    const steps = payItem('CREW-TIME-DAY-STP', 'CREW_DAY', '1800.00', {
      crewTimeConversion: 'PER_DAY_STEPS',
      crewDaySteps: [
        { fromHours: '1.50', toHours: '4.50', quantity: '0.2500' },
        { fromHours: '4.75', toHours: '8.50', quantity: '0.5000' },
        { fromHours: '8.75', toHours: '12.00', quantity: '1.0000' },
      ],
    });
    const pricing = withPayItems([steps], paysItself(codeOf('CREW-TIME-DAY-STP')));
    const under = pricing.of(crewTime('301028', 'CREW-TIME-DAY-STP', [[skidSteer, 1]]));
    const over = pricing.of(crewTime('301029', 'CREW-TIME-DAY-STP', [[skidSteer, 13.25]]));
    const between = pricing.of(crewTime('301032', 'CREW-TIME-DAY-STP', [[skidSteer, 4.6]]));

    expect([under.lines, over.lines, between.lines]).toEqual([[], [], []]);
    expect(messages(under)).toEqual([
      'Ticket 301028: CREW-TIME-DAY-STP is priced per crew day in steps, but 1.00 h falls in no step. Flagged for review.',
    ]);
    expect(messages(over)).toEqual([
      'Ticket 301029: CREW-TIME-DAY-STP is priced per crew day in steps, but 13.25 h falls in no step. Flagged for review.',
    ]);
    expect(over.flags[0]).toMatchObject({
      code: 'QUANTITY_MISSING_FOR_PAY_ITEM',
      billing: 'LINE_NOT_BILLED',
      slot: 1,
      payItemId: steps.id,
    });
    expect(messages(between)).toHaveLength(1);
  });

  it('AC-07-66 a split haul-out is priced once per pile, on its share', () => {
    const priced = mission.of(h201004);

    expect(told(priced)).toEqual([
      '-A #1 MULCH-HO-TN 2.8200 × 20.0000 = 56.40',
      '-B #1 MULCH-HO-TN 7.0600 × 20.0000 = 141.20',
      '-C #1 MULCH-HO-TN 14.1200 × 20.0000 = 282.40',
    ]);
    expect(total(priced)).toBe('480.00');
    expect(priced.lines.map((each) => each.fieldEventId)).toEqual(
      h201004.pieces.map((each) => each.fieldEventId),
    );
  });

  it('AC-07-67 the same piles dumped at Bayline County Landfill are paid by the CY, with the tipping fee', () => {
    const priced = mission.of(haulOut('201004', bcl, piles201004));

    expect(told(priced)).toEqual([
      '-A #1 MULCH-HO-CY 11.0000 × 5.1000 = 56.10',
      '-A #2 TIP-FEE-CY-BCL 11.0000 × 4.0000 = 44.00',
      '-B #1 MULCH-HO-CY 27.5000 × 5.1000 = 140.25',
      '-B #2 TIP-FEE-CY-BCL 27.5000 × 4.0000 = 110.00',
      '-C #1 MULCH-HO-CY 55.0000 × 5.1000 = 280.50',
      '-C #2 TIP-FEE-CY-BCL 55.0000 × 4.0000 = 220.00',
    ]);
    expect(total(priced)).toBe('850.85');
  });

  // P2's split load: Coastline's own contract and pay item there.
  const p2Contract = { id: 'contract-coastline-ppdr', name: 'Coastline, Bayline PPDR 2026' };
  const p2 = new TicketPricing({
    timeZone,
    rules: [
      rule('VEG-HAUL-CY', 'LOAD', [isVegetative], [add(1, codeOf('VEG-HAUL-CY'))], {
        contract: p2Contract,
      }),
    ],
    contracts: [{ id: p2Contract.id, primeId: coastlinePrime.id }],
    primes: [coastlinePrime],
    payItems: [payItem('VEG-HAUL-CY', 'CY', '9.00')],
    stumpCheckFillNeedsExposure: true,
  });
  const l102001 = ticket(
    '102001',
    'LOAD',
    [
      piece({ splitSuffix: 'A', debrisTypeId: vegetative.id, volumeCy: '14.40' }),
      piece({ splitSuffix: 'B', debrisTypeId: vegetative.id, volumeCy: '21.60' }),
    ],
    { operatingSubId: rivera, dumpedAt: noFee(marshRoad) },
  );

  it('AC-07-68 a split load is priced once per property, on its share', () => {
    const priced = p2.of(l102001);

    expect(told(priced)).toEqual([
      '-A #1 VEG-HAUL-CY 14.4000 × 9.0000 = 129.60',
      '-B #1 VEG-HAUL-CY 21.6000 × 9.0000 = 194.40',
    ]);
    expect(total(priced)).toBe('324.00');
  });

  it('AC-07-69 each property or pile has its own slots: #1 on -A and #1 on -B are two lines, never a duplicate', () => {
    for (const priced of [p2.of(l102001), mission.of(h201004)]) {
      expect(priced.lines.every((each) => each.slot === 1)).toBe(true);
      expect(new Set(priced.lines.map((each) => each.splitSuffix)).size).toBe(priced.lines.length);
      expect(priced.flags).toEqual([]);
    }
  });

  it('AC-07-70, AC-06-122 no rate for the prime: the line is written at $0 and the ticket is flagged', () => {
    const noSummitRate = new TicketPricing(
      setupOf({
        rules: [summitVegHaul],
        payItems: [payItem('VEG-HAUL-CY-15', 'CY', '7.50')],
      }),
    );
    const priced = noSummitRate.of(load('101034', '14.00', {}, { primeId: summitPrime.id }));

    expect(told(priced)).toEqual(['#1 VEG-HAUL-CY-15 14.0000 × 0.0000 = 0.00']);
    expect(messages(priced)).toEqual([
      'Ticket 101034: pay item VEG-HAUL-CY-15 has no rate for Summit. Flagged for review.',
    ]);
    expect(priced.flags[0]).toMatchObject({
      code: 'NO_RATE_FOR_PRIME',
      slot: 1,
      payItemId: idOf('VEG-HAUL-CY-15'),
      facts: { slot: 1, payItemId: idOf('VEG-HAUL-CY-15'), primeId: summitPrime.id },
    });
  });

  it('AC-07-71 a pay item with no rate for any prime is a $0 pay item: its line is written, and nothing is flagged', () => {
    const staged = withRules(stagedFreon).of(
      whiteGoods('301022', counts([washer, 2], [freonStaged, 2])),
    );

    expect(told(staged)).toContain('#3 WG-FRN-EA-STG 2.0000 × 0.0000 = 0.00');
    expect(staged.flags).toEqual([]);
  });

  it('AC-07-72 a ticket in review has its line all the while: review never holds the money', () => {
    const high = flags.raise(
      'LOAD_CALL_HIGH',
      raisedOn('101003'),
      { loadCall: 96 },
      { loadCall: 96 },
    );
    const l101003 = load('101003', '62.40', {}, { raised: [high] });

    expect(high.billing).toBe('BILLS');
    expect(told(mission.of(l101003))).toEqual(['#1 VEG-HAUL-CY-15 62.4000 × 7.5000 = 468.00']);
    expect(mission.of(l101003)).toEqual(mission.of({ ...l101003, raised: [] }));
  });

  it('AC-07-73 a sub’s load bills at its prime’s rate and records the prime and the operating sub', () => {
    const priced = mission.of(l101002);

    expect(priced.lines.map((each) => [each.primeId, each.operatingSubId, each.rate])).toEqual([
      [coastlinePrime.id, rivera, '8.2500'],
      [coastlinePrime.id, rivera, '4.0000'],
    ]);
    expect(mission.of(l101001).lines[0]?.operatingSubId).toBeNull();
  });

  it('AC-07-74 under a flag that says "not billed" nothing is billed until it is corrected', () => {
    const zero = flags.raise('LOAD_CALL_ZERO', raisedOn('101032'), {}, { loadCall: 0 });
    const noCertification = flags.raise(
      'NO_CERTIFICATION',
      raisedOn('101031'),
      { certNumber: '999999' },
      { certNumber: '999999' },
    );
    const pileCall = flags.raise(
      'PILE_CALL_NOT_HIGHER',
      raisedOn('201004'),
      { pile: 'B', loadCall: 30, pileBefore: 'A', loadCallBefore: 35 },
      { calls: [35, 30, 85] },
    );
    const none = { voidedBy: [], lines: [], flags: [] };

    expect([zero.billing, noCertification.billing, pileCall.billing]).toEqual([
      'NOT_BILLED',
      'NOT_BILLED',
      'NOT_BILLED',
    ]);
    expect(mission.of(load('101032', '0.00', {}, { raised: [zero] }))).toEqual(none);
    // No certification on the project: no prime is known, and its flag says so already.
    expect(
      mission.of(load('101031', null, {}, { primeId: null, raised: [noCertification] })),
    ).toEqual(none);
    expect(mission.of(load('101031', null, {}, { primeId: null }))).toEqual(none);
    expect(mission.of({ ...h201004, raised: [pileCall] })).toEqual(none);
    // Accepted or not, the flag is still raised: accepting never changes what bills.
    expect(told(mission.of(load('101032', '13.00')))).toHaveLength(1);
  });
});

describe('the flags pricing raises', () => {
  const l101010 = load('101010', '14.00', {}, { primeId: summitPrime.id });

  it('AC-07-75, AC-06-120 no rule on the prime’s contract adds a line: no lines, flagged, naming the prime', () => {
    const priced = mission.of(l101010);

    expect(priced.lines).toEqual([]);
    expect(messages(priced)).toEqual([
      'Ticket 101010: no pricing rule on a Summit contract matches. Flagged for review; not billed.',
    ]);
    expect(priced.flags[0]).toMatchObject({
      code: 'NO_PRICING_RULE',
      billing: 'NOT_BILLED',
      fieldEventId: null,
      slot: null,
      payItemId: null,
      facts: { primeId: summitPrime.id },
    });
    expect(withRules(summitVegHaul).of(l101010).flags).toEqual([]);
  });

  it('AC-07-76 a gap in the contract’s bands shows on the first ticket that falls in it', () => {
    const far = load('101045', '52.00', { mileage: '31.0000' });
    const within = load('101046', '52.00', { mileage: '30.0400' });

    expect(mission.of(far).lines).toEqual([]);
    expect(messages(mission.of(far))).toEqual([
      'Ticket 101045: no pricing rule on a Coastline contract matches. Flagged for review; not billed.',
    ]);
    expect(told(mission.of(within))).toEqual(['#1 VEG-HAUL-CY-30 52.0000 × 8.9000 = 462.80']);
  });

  const upTo24 = rule(
    'LNR-RMV-EA-24',
    'UNIT_RATE',
    [number('MEASUREMENT', 'AT_MOST', 24)],
    [add(1, 'LNR-RMV-EA-24')],
  );
  const from24 = rule(
    'LNR-RMV-EA-99',
    'UNIT_RATE',
    [number('MEASUREMENT', 'AT_LEAST', 24)],
    [add(1, 'LNR-RMV-EA-99')],
  );
  const leaner = (inches: number): TicketToPrice =>
    unitRate('301009', 'LNR-RMV-EA-24', { measurementInches: inches });

  it('AC-07-77, AC-06-121 two rules create the same #: neither line is billed, and the ticket is flagged', () => {
    // Written either way round, the message names the pay items in the same order.
    for (const rules of [
      [upTo24, from24],
      [from24, upTo24],
    ]) {
      const pricing = new TicketPricing(setupOf({ rules }));
      const priced = pricing.of(leaner(24));

      expect(priced.lines).toEqual([]);
      expect(messages(priced)).toEqual([
        'Ticket 301009: two rules create transaction 1 (LNR-RMV-EA-24, LNR-RMV-EA-99). Flagged for review; not billed.',
      ]);
      expect(priced.flags[0]).toMatchObject({
        code: 'DUPLICATE_TRANSACTION_NUMBER',
        slot: 1,
        facts: { slot: 1, rules: ['LNR-RMV-EA-24', 'LNR-RMV-EA-99'] },
      });
      expect(told(pricing.of(leaner(18)))).toEqual(['#1 LNR-RMV-EA-24 1.0000 × 95.0000 = 95.00']);
    }
  });

  it('the ticket’s lines in other slots still bill beside two creates of one #; three creates are one flag', () => {
    const second = rule(
      'second',
      'UNIT_RATE',
      [number('MEASUREMENT', 'AT_LEAST', 1)],
      [add(2, 'HNG-RMV-EA')],
    );
    const third = rule(
      'third',
      'UNIT_RATE',
      [number('MEASUREMENT', 'AT_LEAST', 1)],
      [add(1, 'HNG-RMV-EA')],
    );
    const priced = new TicketPricing(setupOf({ rules: [upTo24, from24, second, third] })).of(
      leaner(24),
    );

    expect(told(priced)).toEqual(['#2 HNG-RMV-EA 1.0000 × 68.0000 = 68.00']);
    expect(messages(priced)).toEqual([
      'Ticket 301009: two rules create transaction 1 (HNG-RMV-EA, LNR-RMV-EA-24, LNR-RMV-EA-99). Flagged for review; not billed.',
    ]);
  });

  it('AC-07-78 one rule that carries Add transaction 1 twice is flagged as if two rules had added it', () => {
    const twice = rule(
      'twice',
      'UNIT_RATE',
      [number('MEASUREMENT', 'AT_LEAST', 1)],
      [add(1, 'LNR-RMV-EA-24'), add(1, 'LNR-RMV-EA-99')],
    );
    const priced = new TicketPricing(setupOf({ rules: [twice] })).of(leaner(24));

    expect(priced.lines).toEqual([]);
    expect(priced.flags.map((flag) => flag.code)).toEqual(['DUPLICATE_TRANSACTION_NUMBER']);
  });

  it('AC-07-79, AC-06-70 dumped at a site that charges a tipping fee, with no line for any of its fee pay items', () => {
    const noFeeRule = new TicketPricing(setupOf({ rules: rulesWithoutFee }));
    const l101011 = load(
      '101011',
      '36.00',
      { debrisTypeId: cd.id, mileage: '11.4419' },
      { dumpedAt: bcl },
    );
    const priced = noFeeRule.of(l101011);
    const byTheTon = rule('fee by the ton', 'LOAD', [atLandfill], [add(2, 'TIP-FEE-TN-BCL')]);

    // Its hauling line bills.
    expect(told(priced)).toEqual(['#1 CD-HAUL-CY-15 36.0000 × 8.2500 = 297.00']);
    expect(messages(priced)).toEqual([
      'Ticket 101011: dumped at Bayline County Landfill, which charges a tipping fee, but no rule on this project gives it one. Flagged for review.',
    ]);
    expect(priced.flags[0]?.facts).toEqual({
      siteId: landfill.id,
      tippingFeePayItemIds: [idOf('TIP-FEE-CY-BCL'), idOf('TIP-FEE-TN-BCL')],
    });
    // A line for either of the site's fee pay items is a fee line.
    expect(mission.of(l101002).flags).toEqual([]);
    expect(
      new TicketPricing(setupOf({ rules: [...rulesWithoutFee, byTheTon] }))
        .of({
          ...l101011,
          pieces: [piece({ ...l101011.pieces[0]?.reading, weightTons: '8.4000' })],
        })
        .flags.map((flag) => flag.code),
    ).toEqual([]);
  });

  it('AC-07-80, AC-06-71 the fee is checked on a load and on a haul-out dumped there, never on one leaving it or on unit rate work', () => {
    const noFeeRule = new TicketPricing(setupOf({ rules: rulesWithoutFee }));

    expect(mission.of(h201001).flags).toEqual([]);
    expect(noFeeRule.of(h201001).flags.map((flag) => flag.code)).toEqual([
      'TIPPING_FEE_RULE_MISSING',
    ]);
    // Cypress Creek Landfill charges none; 201004 left Marsh Road TDSR.
    expect(noFeeRule.of(h201004).flags).toEqual([]);
    expect(noFeeRule.of({ ...unitRate('301001', 'HNG-RMV-EA'), dumpedAt: bcl }).flags).toEqual([]);
  });

  it('AC-07-81, AC-06-91 a per-ton pay item on a load with no scale weight, or a net of nought: that line bills nothing', () => {
    const feeByTon = rule('fee by the ton', 'LOAD', [atLandfill], [add(2, 'TIP-FEE-TN-BCL')]);
    const pricing = new TicketPricing(
      setupOf({
        rules: [...missionRules.filter((each) => each.name !== 'TIP-FEE-CY-BCL'), feeByTon],
      }),
    );
    const l101012 = (weightTons: string | null): TicketToPrice =>
      load('101012', '36.00', { debrisTypeId: cd.id, weightTons }, { dumpedAt: bcl });

    for (const weight of [null, '0.0000']) {
      const priced = pricing.of(l101012(weight));

      // The ticket's other lines bill.
      expect(told(priced)).toEqual(['#1 CD-HAUL-CY-15 36.0000 × 8.2500 = 297.00']);
      expect(messages(priced)).toEqual([
        'Ticket 101012: TIP-FEE-TN-BCL is priced per ton, but the load has no scale weight. Flagged for review.',
      ]);
      // The flag keeps the # and the pay item of the line that couldn't be worked out.
      expect(priced.flags[0]).toMatchObject({
        code: 'QUANTITY_MISSING_FOR_PAY_ITEM',
        billing: 'LINE_NOT_BILLED',
        slot: 2,
        payItemId: idOf('TIP-FEE-TN-BCL'),
        facts: { slot: 2, payItemId: idOf('TIP-FEE-TN-BCL'), unit: 'TN' },
      });
    }
    expect(told(pricing.of(l101012('8.4000')))).toHaveLength(2);
  });

  it('a pay item paid from the tickets a load carries, on a load that carries none, is flagged the same way', () => {
    const stumps = rule('STP-HAUL-CY', 'LOAD', [isVegetative], [add(1, codeOf('STP-HAUL-CY'))]);
    const pricing = withPayItems(
      [payItem('STP-HAUL-CY', 'CY', '9.00', { quantityFromCarriedTickets: true })],
      stumps,
    );

    expect(messages(pricing.of(load('101016', '26.00')))).toEqual([
      'Ticket 101016: STP-HAUL-CY is priced per cubic yard, but the load carries no stump tickets. Flagged for review.',
    ]);
  });

  it('AC-07-82, AC-06-105 fill paid where the root ball is not half exposed: flagged, and both lines bill', () => {
    const priced = mission.of(stump('301016', '4.8', false));
    const checkOff = new TicketPricing(setupOf({ stumpCheckFillNeedsExposure: false }));

    expect(told(priced)).toHaveLength(2);
    expect(messages(priced)).toEqual([
      'Ticket 301016: fill paid, but the root ball is not half exposed. Flagged for review.',
    ]);
    expect(priced.flags[0]).toMatchObject({
      code: 'FILL_WITHOUT_EXPOSED_ROOT_BALL',
      billing: 'BILLS',
      slot: 2,
      payItemId: idOf('STP-FILL-CY'),
    });
    // Half or more exposed: nothing. The check switched off on the project: nothing.
    expect(mission.of(stump('301004', '4.8', true)).flags).toEqual([]);
    expect(checkOff.of(stump('301016', '4.8', false)).flags).toEqual([]);
    // No fill line, nothing to flag.
    expect(mission.of(stump('301016', null, false)).flags).toEqual([]);
  });

  it('AC-07-83 a pricing flag makes the ticket MANUAL_REVIEW like any other, and its message says what it does to the money', () => {
    const event: RuleFieldEvent = {
      id: 'event-301001',
      projectId: 'project-p1',
      workflow: 'UNIT_RATE',
      kind: 'UNIT_RATE',
      ticketNumber: '301001',
      splitSuffix: '',
      startedAt: new Date('2026-10-12T10:05:00-04:00'),
      endedAt: new Date('2026-10-12T10:15:00-04:00'),
      certNumber: '730417',
      debrisType: null,
      fieldTag: null,
      address: null,
      site: null,
      kindOfWork: null,
      unitCount: 1,
      items: [],
    };
    const whole = new Ticket([event]);
    const open = (priced: TicketPriced): { accepted: boolean }[] =>
      priced.flags.map(() => ({ accepted: false }));
    const noRule = mission.of(l101010);
    const noRate = new TicketPricing(
      setupOf({ rules: [summitVegHaul], payItems: [payItem('VEG-HAUL-CY-15', 'CY', '7.50')] }),
    ).of(l101010);

    expect(whole.status(open(mission.of(l101001)))).toBe('COMPLETED');
    expect(whole.status(open(noRule))).toBe('MANUAL_REVIEW');
    expect(whole.status(open(noRate))).toBe('MANUAL_REVIEW');
    // Nothing bills: "not billed". The ticket still bills: nothing more.
    expect(noRule.flags[0]?.message.endsWith('Flagged for review; not billed.')).toBe(true);
    expect(noRate.flags[0]?.message.endsWith('for Summit. Flagged for review.')).toBe(true);
  });

  it('a split is flagged for the property the rules missed, and its other property bills', () => {
    const split = ticket(
      '101047',
      'LOAD',
      [
        piece({
          splitSuffix: 'A',
          debrisTypeId: vegetative.id,
          mileage: '6.2050',
          volumeCy: '14.40',
        }),
        piece({
          splitSuffix: 'B',
          debrisTypeId: vegetative.id,
          mileage: '31.0000',
          volumeCy: '21.60',
        }),
      ],
      { dumpedAt: noFee(marshRoad) },
    );
    const priced = mission.of(split);

    expect(told(priced)).toEqual(['-A #1 VEG-HAUL-CY-15 14.4000 × 7.5000 = 108.00']);
    expect(priced.flags.map((flag) => [flag.code, flag.fieldEventId])).toEqual([
      ['NO_PRICING_RULE', split.pieces[1]?.fieldEventId],
    ]);
  });

  it('a rule that names a pay item the project doesn’t have stops the ticket, never prices it on a guess', () => {
    const gone = rule('gone', 'LOAD', [isVegetative], [add(1, 'NOT-A-PAY-ITEM')]);

    expect(() => new TicketPricing(setupOf({ rules: [gone] })).of(l101001)).toThrow(
      "Pay item NOT-A-PAY-ITEM isn't on the project.",
    );
  });
});
