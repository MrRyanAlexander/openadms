// The rules that may run on a ticket, and each criterion (spec/acceptance/07-pricing-ledger-audit.md
// sections A and B: AC-07-01…09 and 12…37, with AC-06-57; spec/RULES.md §4, §4a, §6; ADR-354).
// The tickets are the golden mission's (spec/golden/MISSION.md §2, §3) and the example world's
// (spec/CONVENTIONS.md §6); P1's time zone is America/New_York, and 12 October 2026 is a Monday.
import { describe, expect, it } from 'vitest';

import {
  type CheckedSite,
  type Named,
  type ReadingAttached,
  type RuleActionLine,
  type RuleCriterionKey,
  type RuleCriterionLine,
  type RuleEntry,
  type RuleFieldEvent,
  type RuleOperator,
  type RulePick,
  type RuleReading,
  type TicketRead,
  CriterionCheck,
  Mileage,
  SizeBands,
  Ticket,
  TicketReadings,
  TicketRules,
  ruleCriterionKeys,
} from '../src/index.ts';

const p1 = 'project-p1';
const days = { Mon: '12', Tue: '13', Wed: '14', Thu: '15' } as const;
const at = (day: keyof typeof days, time: string): Date =>
  new Date(`2026-10-${days[day]}T${time}:00-04:00`);

const named = (id: string, name: string): Named => ({ id, name });
const coastlinePrime = 'contractor-coastline';
const summitPrime = 'contractor-summit';
const rivera = 'contractor-rivera';

const vegetative = named('debris-veg', 'Vegetative');
const cd = named('debris-cd', 'C&D');
const marineVegetative = named('debris-marine-veg', 'Marine Vegetative');
const mulch = named('debris-mulch', 'Mulch');
const zone1Pile = named('tag-zone-1-pile', 'Zone 1 pile');
const zone2Pile = named('tag-zone-2-pile', 'Zone 2 pile');
const zone3Pile = named('tag-zone-3-pile', 'Zone 3 pile');

const tdsrType = named('site-type-tdsr', 'TDSR/DMS');
const finalDisposal = named('site-type-final', 'Final Disposal');
const transferStationType = named('site-type-transfer', 'Transfer Station');

const site = (id: string, name: string, type: Named): CheckedSite => ({
  id,
  name,
  siteTypeId: type.id,
  siteTypeKey: null,
  takesLoads: true,
  haulOutsLeaveHere: false,
  ineligibleSite: false,
  permitNumber: null,
  gps: { latitude: '39.09000000', longitude: '-75.62000000' },
  activationDate: '2026-10-01',
  closeDate: null,
  area: null,
});
const marshRoad = site('site-marsh-road', 'Marsh Road TDSR', tdsrType);
const landfill = site('site-bcl', 'Bayline County Landfill', finalDisposal);
const transferStation = site('site-bts', 'Bayline Transfer Station', transferStationType);
const cypressCreek = site('site-ccl', 'Cypress Creek Landfill', finalDisposal);
const oldQuarryPit = site('site-oqp', 'Old Quarry Pit', finalDisposal);

const washer = named('item-washer', 'Washer');
const dryer = named('item-dryer', 'Dryer');
const freonRecovered = named('item-freon-recovered', 'Fridge, freon recovered');
const freonStaged = named('item-freon-staged', 'Fridge, freon staged');
const noFreon = named('item-no-freon', 'Fridge, no freon');
const skidSteer = named('item-skid-steer', 'Skid Steer');
const truck = named('item-truck', 'Truck');

const readings = new TicketReadings({
  timeZone: 'America/New_York',
  certifications: [
    { certNumber: '730415', primeId: coastlinePrime },
    // Rivera Trucking's self-loader: a sub under Coastline.
    { certNumber: '730416', primeId: coastlinePrime, firstTierSubId: 'contractor-rivera' },
    { certNumber: '730417', primeId: coastlinePrime },
    { certNumber: '730418', primeId: coastlinePrime },
    { certNumber: '730419', primeId: coastlinePrime },
    { certNumber: '88120', primeId: summitPrime },
    // Tidewater Hauling's truck: a tier 2 sub under Rivera, under Coastline (AC-03-12).
    {
      certNumber: '730423',
      primeId: coastlinePrime,
      firstTierSubId: 'contractor-rivera',
      secondTierSubId: 'contractor-tidewater',
    },
  ],
  zones: [named('zone-1', 'Zone 1'), named('zone-2', 'Zone 2'), named('zone-3', 'Zone 3')],
});

let made = 0;
const recorded = (
  kind: RuleFieldEvent['kind'],
  written: string,
  endedAt: Date,
  more: Partial<RuleFieldEvent> = {},
): RuleFieldEvent => {
  const [ticketNumber = '', splitSuffix = ''] = written.split('-');
  made += 1;
  return {
    id: `event-${String(made)}`,
    projectId: p1,
    workflow:
      kind === 'UNIT_RATE' ? 'UNIT_RATE' : kind.startsWith('HAUL_OUT') ? 'HAUL_OUT' : 'LOAD',
    kind,
    ticketNumber,
    splitSuffix,
    startedAt: new Date(endedAt.getTime() - 10 * 60_000),
    endedAt,
    certNumber: '730415',
    debrisType: null,
    fieldTag: null,
    address: null,
    site: null,
    kindOfWork: null,
    unitCount: null,
    items: [],
    ...more,
  };
};

interface Property {
  readonly suffix?: string;
  readonly debrisType?: Named | null;
  readonly fieldTag?: Named | null;
  readonly address?: string | null;
  readonly zoneId?: string | null;
  readonly miles?: string | null;
  readonly volumeCy?: string | null;
  readonly weightTons?: string | null;
  readonly collectedAt?: Date;
  readonly certNumber?: string;
}
interface Hauled extends Property {
  readonly dumpedAt?: Date;
  readonly dumpedAtSite?: CheckedSite;
  readonly disposalDebrisType?: Named | null;
  readonly disposalCertNumber?: string;
  readonly properties?: readonly Property[];
}

// A load or a haul-out as the worker has it once its checks are done: the field events, each
// collection's zone, share and mileage.
const hauled = (
  workflow: 'LOAD' | 'HAUL_OUT',
  number: string,
  told: Hauled,
  fromSite: CheckedSite | null = null,
): TicketRead => {
  const properties = told.properties ?? [told];
  const collections = properties.map((property) => ({
    property: { ...told, ...property },
    event: recorded(
      workflow === 'LOAD' ? 'COLLECTION' : 'HAUL_OUT_COLLECTION',
      property.suffix === undefined ? number : `${number}-${property.suffix}`,
      property.collectedAt ?? told.collectedAt ?? at('Mon', '08:40'),
      {
        certNumber: property.certNumber ?? told.certNumber ?? '730415',
        debrisType: { ...told, ...property }.debrisType ?? vegetative,
        fieldTag: { ...told, ...property }.fieldTag ?? null,
        address: { ...told, ...property }.address ?? null,
        site: fromSite,
      },
    ),
  }));
  const disposal = recorded(
    workflow === 'LOAD' ? 'DISPOSAL' : 'HAUL_OUT_DISPOSAL',
    number,
    told.dumpedAt ?? at('Mon', '09:25'),
    {
      certNumber: told.disposalCertNumber ?? told.certNumber ?? '730415',
      debrisType:
        told.disposalDebrisType === undefined
          ? (told.debrisType ?? vegetative)
          : told.disposalDebrisType,
      site: told.dumpedAtSite ?? marshRoad,
    },
  );
  const attached: ReadingAttached = {
    zones: collections.map(({ event, property }) => ({
      fieldEventId: event.id,
      zoneId: property.zoneId ?? null,
    })),
    workedOut: null,
    shares: collections.map(({ event, property }) => ({
      collectionEventId: event.id,
      volumeCy: property.volumeCy ?? null,
      weightTons: property.weightTons ?? null,
      mileage: property.miles == null ? null : { miles: property.miles },
    })),
  };
  return readings.of(new Ticket([...collections.map(({ event }) => event), disposal]), attached);
};
const load = (number: string, told: Hauled = {}): TicketRead => hauled('LOAD', number, told);
const haulOut = (number: string, told: Hauled = {}): TicketRead =>
  hauled('HAUL_OUT', number, { debrisType: mulch, certNumber: '730419', ...told }, marshRoad);

const unitRate = (
  number: string,
  more: Partial<RuleFieldEvent>,
  workedOut: ReadingAttached['workedOut'] = null,
  zoneId: string | null = null,
): TicketRead => {
  const event = recorded('UNIT_RATE', number, at('Mon', '10:15'), {
    certNumber: '730417',
    ...more,
  });
  return readings.of(new Ticket([event]), {
    zones: [{ fieldEventId: event.id, zoneId }],
    workedOut,
    shares: [],
  });
};

// The golden mission's tickets, as the worker concluded them (ADR-352).
const l101001 = load('101001', {
  address: '14 Heron St',
  zoneId: 'zone-2',
  miles: '6.2050',
  volumeCy: '52.00',
});
const l101002 = load('101002', {
  certNumber: '730416',
  debrisType: cd,
  zoneId: 'zone-3',
  miles: '11.4419',
  volumeCy: '36.00',
  dumpedAtSite: landfill,
});
const l101003 = load('101003', { miles: '6.2050', volumeCy: '62.40' });
const h201001 = haulOut('201001', {
  collectedAt: at('Tue', '13:00'),
  dumpedAt: at('Tue', '14:10'),
  volumeCy: '99.00',
  miles: '8.3100',
  dumpedAtSite: landfill,
});
const h201004 = haulOut('201004', {
  dumpedAt: at('Tue', '17:15'),
  dumpedAtSite: cypressCreek,
  properties: [
    { suffix: 'A', collectedAt: at('Tue', '15:30'), fieldTag: zone1Pile, weightTons: '2.8200' },
    { suffix: 'B', collectedAt: at('Tue', '15:45'), fieldTag: zone2Pile, weightTons: '7.0600' },
    { suffix: 'C', collectedAt: at('Tue', '16:05'), fieldTag: zone3Pile, weightTons: '14.1200' },
  ],
});
const u301001 = unitRate(
  '301001',
  { unitCount: 1 },
  { payItemId: 'pay-item-HNG-RMV-EA', diameterInches: 3 },
);
const u301006 = unitRate('301006', {
  address: '40 Birch Ln',
  kindOfWork: { id: 'work-white-goods', name: 'White Goods', key: null, countShape: 'ITEM_COUNTS' },
  items: [
    { itemName: washer, quantity: '2.00' },
    { itemName: dryer, quantity: '1.00' },
    { itemName: freonRecovered, quantity: '2.00' },
    { itemName: noFreon, quantity: '1.00' },
  ],
});
const u301007 = unitRate('301007', {
  certNumber: '730418',
  kindOfWork: { id: 'work-crew-time', name: 'Crew time', key: null, countShape: 'ITEM_HOURS' },
  items: [
    { itemName: skidSteer, quantity: '9.75' },
    { itemName: truck, quantity: '8.50' },
  ],
});

const only = (read: TicketRead): RuleReading => {
  const [reading] = read.readings;
  if (reading === undefined || read.readings.length !== 1) throw new Error('Not one reading.');
  return reading;
};
const piece = (read: TicketRead, suffix: string): RuleReading => {
  const reading = read.readings.find((each) => each.splitSuffix === suffix);
  if (reading === undefined) throw new Error(`No piece ${suffix}.`);
  return reading;
};

// A rule's lines.
const pick = (from: Named): RulePick => ({ value: from.id, name: from.name, gone: false });
const zone = (name: string): RulePick => ({ value: name, name, gone: false });
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
const date = (operator: RuleOperator, from: string, to: string | null = null): RuleCriterionLine =>
  line('TICKET_DATE', operator, { dateFrom: from, dateTo: to });
const address = (operator: RuleOperator, text: string): RuleCriterionLine =>
  line('COLLECTION_ADDRESS', operator, { text });
const item = (of: Named, operator: RuleOperator, count: number | null = null): RuleCriterionLine =>
  line('ITEM', operator, { picks: [pick(of)], numberFrom: count });

const holds = (criterion: RuleCriterionLine, reading: RuleReading): boolean =>
  new CriterionCheck(criterion).holds(reading);

const add = (slot: number, code: string): RuleActionLine => ({
  kind: 'ADD_TRANSACTION',
  slot,
  payItem: { id: `pay-item-${code}`, code },
  quantityFrom: 'ALL_ITEMS',
  items: [],
});
const voidTicket: RuleActionLine = {
  kind: 'VOID_TICKET',
  slot: null,
  payItem: null,
  quantityFrom: null,
  items: [],
};

const coastline = { id: 'contract-coastline', name: 'Coastline, Bayline ROW 2026' };
const summit = { id: 'contract-summit', name: 'Summit, Bayline ROW 2026' };
const contracts = [
  { id: coastline.id, primeId: coastlinePrime },
  { id: summit.id, primeId: summitPrime },
];

const rule = (id: string, more: Partial<RuleEntry> = {}): RuleEntry => ({
  id,
  name: id,
  formId: `form-${(more.form ?? 'LOAD').toLowerCase()}`,
  form: 'LOAD',
  contract: coastline,
  active: true,
  archived: false,
  fromPayItem: null,
  criteria: [picked('DEBRIS_TYPE', 'EQUALS', pick(vegetative)), number('MILEAGE', 'AT_MOST', 15)],
  actions: [add(1, 'VEG-HAUL-CY-15')],
  ...more,
});

// The golden mission §1's rules of P1, with Summit's and one that names no contract.
const vegHaul = rule('VEG-HAUL-CY-15');
const cdHaul = rule('CD-HAUL-CY-15', {
  criteria: [picked('DEBRIS_TYPE', 'EQUALS', pick(cd)), number('MILEAGE', 'AT_MOST', 15)],
  actions: [add(1, 'CD-HAUL-CY-15')],
});
const tippingFee = rule('TIP-FEE-CY-BCL', {
  criteria: [picked('DISPOSAL_SITE', 'EQUALS', pick(landfill))],
  actions: [add(2, 'TIP-FEE-CY-BCL')],
});
const summitVegHaul = rule('VEG-HAUL-CY-15 (Summit)', { contract: summit });
const voidAtOldQuarry = rule('Void at Old Quarry Pit', {
  contract: null,
  criteria: [picked('DISPOSAL_SITE', 'EQUALS', pick(oldQuarryPit))],
  actions: [voidTicket],
});
const mulchHaulOut = rule('MULCH-HO-CY', {
  form: 'HAUL_OUT',
  formId: 'form-haul-out',
  criteria: [picked('DEBRIS_TYPE', 'EQUALS', pick(mulch))],
  actions: [add(1, 'MULCH-HO-CY')],
});
const haulOutTippingFee = rule('TIP-FEE-CY-BCL (haul-outs)', {
  form: 'HAUL_OUT',
  formId: 'form-haul-out',
  criteria: [picked('DISPOSAL_SITE', 'EQUALS', pick(landfill))],
  actions: [add(2, 'TIP-FEE-CY-BCL')],
});
const hangers = rule('HNG-RMV-EA', {
  form: 'UNIT_RATE',
  formId: 'form-unit-rate',
  criteria: [
    picked('PAY_ITEM', 'EQUALS', { value: 'pay-item-HNG-RMV-EA', name: 'HNG-RMV-EA', gone: false }),
  ],
  actions: [add(1, 'HNG-RMV-EA')],
});
const p1Rules = [
  vegHaul,
  cdHaul,
  tippingFee,
  summitVegHaul,
  voidAtOldQuarry,
  mulchHaulOut,
  haulOutTippingFee,
  hangers,
];
const rules = new TicketRules(p1Rules, contracts);
const idsOf = (found: readonly RuleEntry[]): (string | null)[] => found.map((each) => each.id);

describe('the rules that may run on a ticket', () => {
  it('AC-07-01 a load is run on by its form’s rules only; a haul-out and a unit rate ticket by theirs', () => {
    expect(idsOf(rules.mayRunOn('LOAD', l101001.primeId))).toEqual([
      'VEG-HAUL-CY-15',
      'CD-HAUL-CY-15',
      'TIP-FEE-CY-BCL',
      'Void at Old Quarry Pit',
    ]);
    expect(idsOf(rules.mayRunOn('HAUL_OUT', h201001.primeId))).toEqual([
      'MULCH-HO-CY',
      'TIP-FEE-CY-BCL (haul-outs)',
    ]);
    expect(idsOf(rules.mayRunOn('UNIT_RATE', u301001.primeId))).toEqual(['HNG-RMV-EA']);
  });

  it('AC-07-02 every active, valid rule of a form is tried on every ticket of that form: a haul-out form’s rule runs on haul-outs', () => {
    for (const form of ['LOAD', 'HAUL_OUT', 'UNIT_RATE'] as const) {
      const tried = [...rules.mayRunOn(form, coastlinePrime), ...rules.mayRunOn(form, summitPrime)];
      expect(new Set(idsOf(tried))).toEqual(
        new Set(idsOf(p1Rules.filter((each) => each.form === form))),
      );
    }
    expect(idsOf(rules.passing('HAUL_OUT', h201001.primeId, only(h201001)))).toEqual([
      'MULCH-HO-CY',
      'TIP-FEE-CY-BCL (haul-outs)',
    ]);
  });

  it('AC-07-03 the prime is read from the certification scanned, never from anything a monitor picked', () => {
    expect(l101001.primeId).toBe(coastlinePrime);
    expect(idsOf(rules.passing('LOAD', l101001.primeId, only(l101001)))).toEqual([
      'VEG-HAUL-CY-15',
    ]);
    const unknown = load('101050', { certNumber: '999999' });
    expect(unknown.primeId).toBeNull();
    expect(idsOf(rules.mayRunOn('LOAD', unknown.primeId))).toEqual(['Void at Old Quarry Pit']);
  });

  it('AC-07-04 a sub’s truck is its prime’s: Coastline’s rules run on Rivera’s 101002', () => {
    expect(l101002.primeId).toBe(coastlinePrime);
    expect(idsOf(rules.passing('LOAD', l101002.primeId, only(l101002)))).toEqual([
      'CD-HAUL-CY-15',
      'TIP-FEE-CY-BCL',
    ]);
  });

  it('AC-07-05 no rule naming Coastline’s contract runs on Summit’s 101044, and no Summit rule on 101001', () => {
    const l101044 = load('101044', { certNumber: '88120', miles: '6.2050', volumeCy: '21.00' });

    expect(l101044.primeId).toBe(summitPrime);
    expect(idsOf(rules.mayRunOn('LOAD', l101044.primeId))).toEqual([
      'VEG-HAUL-CY-15 (Summit)',
      'Void at Old Quarry Pit',
    ]);
    expect(idsOf(rules.passing('LOAD', l101044.primeId, only(l101044)))).toEqual([
      'VEG-HAUL-CY-15 (Summit)',
    ]);
    expect(idsOf(rules.mayRunOn('LOAD', l101001.primeId))).not.toContain('VEG-HAUL-CY-15 (Summit)');
  });

  it('AC-07-06 a rule with no contract may run on every load, Coastline’s and Summit’s alike', () => {
    for (const certNumber of ['730415', '88120']) {
      const dumped = load('101045', { certNumber, dumpedAtSite: oldQuarryPit, miles: '40.0000' });
      expect(idsOf(rules.passing('LOAD', dumped.primeId, only(dumped)))).toEqual([
        'Void at Old Quarry Pit',
      ]);
    }
  });

  it('AC-07-07 a rule switched off, one that is not valid and an archived one never run, though saved', () => {
    const off = rule('off', { active: false });
    const noContract = rule('adds with no contract', { contract: null });
    const archived = rule('archived', { archived: true });
    const some = new TicketRules([off, noContract, archived, vegHaul], contracts);

    expect(idsOf(some.mayRunOn('LOAD', coastlinePrime))).toEqual(['VEG-HAUL-CY-15']);
  });

  it('AC-07-08 two cert numbers on one load: its prime is the disposal’s; a haul-out’s is its loading end’s', () => {
    const mismatched = load('101046', { certNumber: '730415', disposalCertNumber: '88120' });
    expect(mismatched.primeId).toBe(summitPrime);
    expect(only(mismatched).contractorId).toBe(summitPrime);

    const hauledOut = haulOut('201005', { certNumber: '730419', disposalCertNumber: '88120' });
    expect(hauledOut.primeId).toBe(coastlinePrime);
  });

  it('AC-07-73 who did the work is the lowest tier of sub the certification names: none on the prime’s own truck, Rivera on its own, Tidewater on a second-tier truck; with two cert numbers, the one that gave the prime', () => {
    expect([l101001.primeId, l101001.operatingSubId]).toEqual([coastlinePrime, null]);
    expect([l101002.primeId, l101002.operatingSubId]).toEqual([
      coastlinePrime,
      'contractor-rivera',
    ]);
    const secondTier = load('101047', { certNumber: '730423' });
    expect([secondTier.primeId, secondTier.operatingSubId]).toEqual([
      coastlinePrime,
      'contractor-tidewater',
    ]);
    // Collected on Rivera's truck, dumped under Summit's badge: the disposal's, as the prime is.
    const mismatched = load('101046', { certNumber: '730416', disposalCertNumber: '88120' });
    expect([mismatched.primeId, mismatched.operatingSubId]).toEqual([summitPrime, null]);
    // A haul-out's is its loading end's.
    const hauledOut = haulOut('201005', { certNumber: '730416', disposalCertNumber: '88120' });
    expect([hauledOut.primeId, hauledOut.operatingSubId]).toEqual([
      coastlinePrime,
      'contractor-rivera',
    ]);
    expect(u301001.operatingSubId).toBeNull();
    expect(load('101050', { certNumber: '999999' }).operatingSubId).toBeNull();
  });

  it('AC-07-09 a unit rate ticket’s prime is its crew’s certification’s', () => {
    expect(u301001.primeId).toBe(coastlinePrime);
    expect(idsOf(rules.passing('UNIT_RATE', u301001.primeId, only(u301001)))).toEqual([
      'HNG-RMV-EA',
    ]);
  });

  it('a ticket still waiting for a field event is given no reading', () => {
    const waiting = readings.of(
      new Ticket([recorded('COLLECTION', '101005', at('Tue', '16:40'))]),
      { zones: [], workedOut: null, shares: [] },
    );

    expect(waiting).toEqual({ primeId: null, operatingSubId: null, readings: [] });
  });
});

describe('the rules that pass: criteria', () => {
  it('AC-07-12 a rule passes only on a ticket that meets every line', () => {
    expect(idsOf(rules.passing('LOAD', coastlinePrime, only(l101001)))).toContain('VEG-HAUL-CY-15');
    expect(idsOf(rules.passing('LOAD', coastlinePrime, only(l101002)))).not.toContain(
      'VEG-HAUL-CY-15',
    );
    // Vegetative, but too far: one line of the two.
    const far = load('101047', { miles: '15.0500' });
    expect(idsOf(rules.passing('LOAD', coastlinePrime, only(far)))).toEqual([]);
  });

  it('AC-07-13 criteria read only the ticket: the tipping fee rule passes whether or not a hauling rule did', () => {
    expect(Object.keys(only(l101002)).sort()).toEqual([
      'collectionAddress',
      'contractorId',
      'debrisTypeId',
      'disposalSiteId',
      'disposalSiteTypeId',
      'fieldTagId',
      'fromSiteId',
      'items',
      'measurementInches',
      'mileage',
      'payItemId',
      'splitSuffix',
      'ticketDate',
      'unitCount',
      'volumeCy',
      'weightTons',
      'zoneName',
    ]);
    const noHauling = new TicketRules([tippingFee], contracts);
    expect(idsOf(noHauling.passing('LOAD', coastlinePrime, only(l101002)))).toEqual([
      'TIP-FEE-CY-BCL',
    ]);
    expect(idsOf(rules.passing('LOAD', coastlinePrime, only(l101002)))).toContain('TIP-FEE-CY-BCL');
  });

  it('AC-07-14 Ticket date reads the collection’s end as a day in the project’s time zone: a preload is Monday’s', () => {
    const preload = only(
      load('101004', {
        certNumber: '730416',
        collectedAt: at('Mon', '17:50'),
        dumpedAt: at('Tue', '07:15'),
      }),
    );
    expect(holds(date('ON', '2026-10-12'), preload)).toBe(true);
    expect(holds(date('ON', '2026-10-13'), preload)).toBe(false);

    // 23:30 on Monday in Bayline County is already Tuesday by UTC.
    const late = only(load('101048', { collectedAt: at('Mon', '23:30') }));
    expect(holds(date('ON', '2026-10-12'), late)).toBe(true);

    expect(holds(date('ON', '2026-10-13'), only(h201001))).toBe(true);
    expect(holds(date('ON', '2026-10-12'), only(u301001))).toBe(true);
  });

  it('AC-07-15 a rate that changes from 15 October: a date takes ON, NOT ON, BETWEEN, ON OR BEFORE and ON OR AFTER', () => {
    const until = date('ON_OR_BEFORE', '2026-10-14');
    const from = date('ON_OR_AFTER', '2026-10-15');
    const on14th = only(load('101051', { collectedAt: at('Wed', '15:00') }));
    const on15th = only(load('101052', { collectedAt: at('Thu', '08:00') }));

    expect([holds(until, on14th), holds(from, on14th)]).toEqual([true, false]);
    expect([holds(until, on15th), holds(from, on15th)]).toEqual([false, true]);
    expect(holds(date('NOT_ON', '2026-10-14'), on15th)).toBe(true);
    expect(holds(date('NOT_ON', '2026-10-14'), on14th)).toBe(false);
    expect(holds(date('BETWEEN', '2026-10-12', '2026-10-14'), on14th)).toBe(true);
    expect(holds(date('BETWEEN', '2026-10-14', '2026-10-15'), on15th)).toBe(true);
    expect(holds(date('BETWEEN', '2026-10-12', '2026-10-14'), on15th)).toBe(false);
  });

  it('AC-07-16 Contractor reads the prime the truck works for, from its certification', () => {
    const coastlineHaulers = pick(named(coastlinePrime, 'Coastline Haulers LLC'));
    const riveraTrucking = pick(named(rivera, 'Rivera Trucking'));

    expect(holds(picked('CONTRACTOR', 'EQUALS', coastlineHaulers), only(l101002))).toBe(true);
    // A sub picked finds nothing: the criterion reads the prime (agent default, ADR-354).
    expect(holds(picked('CONTRACTOR', 'EQUALS', riveraTrucking), only(l101002))).toBe(false);
    expect(holds(picked('CONTRACTOR', 'NOT_EQUALS', riveraTrucking), only(l101002))).toBe(true);
  });

  it('AC-07-17 Debris type reads the collection event’s pick, whatever the disposal picked', () => {
    const mismatch = only(load('101008', { debrisType: vegetative, disposalDebrisType: cd }));

    expect(holds(picked('DEBRIS_TYPE', 'EQUALS', pick(vegetative)), mismatch)).toBe(true);
    expect(holds(picked('DEBRIS_TYPE', 'EQUALS', pick(cd)), mismatch)).toBe(false);
  });

  it('AC-07-18 only the exact entry matches, never a like name', () => {
    const marine = only(load('101053', { debrisType: marineVegetative }));

    expect(holds(picked('DEBRIS_TYPE', 'EQUALS', pick(vegetative)), marine)).toBe(false);
    expect(holds(picked('DEBRIS_TYPE', 'EQUALS', pick(marineVegetative)), marine)).toBe(true);
  });

  it('AC-07-19 Debris type reads each property’s own collection, and each pile’s own on a split haul-out', () => {
    const split = load('102001', {
      properties: [
        { suffix: 'A', debrisType: vegetative },
        { suffix: 'B', debrisType: cd },
      ],
    });
    const isVegetative = picked('DEBRIS_TYPE', 'EQUALS', pick(vegetative));
    expect([
      holds(isVegetative, piece(split, 'A')),
      holds(isVegetative, piece(split, 'B')),
    ]).toEqual([true, false]);

    expect(h201004.readings.map((each) => each.splitSuffix)).toEqual(['A', 'B', 'C']);
    for (const each of h201004.readings) {
      expect(holds(picked('DEBRIS_TYPE', 'EQUALS', pick(mulch)), each)).toBe(true);
    }
    expect(holds(picked('DEBRIS_TYPE', 'EQUALS', pick(mulch)), only(h201001))).toBe(true);
  });

  it('AC-07-20 Field tag reads the tag the collecting monitor picked; none picked IS EMPTY', () => {
    const pileB = piece(h201004, 'B');

    expect(holds(picked('FIELD_TAG', 'EQUALS', pick(zone2Pile)), pileB)).toBe(true);
    expect(holds(picked('FIELD_TAG', 'EQUALS', pick(zone1Pile)), pileB)).toBe(false);
    expect(holds(line('FIELD_TAG', 'IS_EMPTY'), only(l101001))).toBe(true);
    expect(holds(line('FIELD_TAG', 'IS_NOT_EMPTY'), only(l101001))).toBe(false);
    expect(holds(line('FIELD_TAG', 'IS_NOT_EMPTY'), pileB)).toBe(true);
  });

  it('AC-07-21 Weight reads the scale weight; on a split haul-out, the pile’s share', () => {
    const atLeast5 = number('WEIGHT', 'AT_LEAST', 5);

    expect(['A', 'B', 'C'].map((suffix) => holds(atLeast5, piece(h201004, suffix)))).toEqual([
      false,
      true,
      true,
    ]);
    const weighed = only(load('101054', { weightTons: '7.3300', dumpedAtSite: landfill }));
    expect(holds(number('WEIGHT', 'EQUALS', 7.33), weighed)).toBe(true);
  });

  it('AC-07-22 Volume reads the billed CY; on a split, the property’s share, never the load’s', () => {
    const moreThan60 = number('VOLUME', 'MORE_THAN', 60);
    expect(holds(moreThan60, only(l101003))).toBe(true);
    expect(holds(moreThan60, only(l101001))).toBe(false);

    const split = load('102001', {
      properties: [
        { suffix: 'A', volumeCy: '14.40' },
        { suffix: 'B', volumeCy: '21.60' },
      ],
    });
    expect(split.readings.map((each) => each.volumeCy)).toEqual(['14.40', '21.60']);
    // A typed number is compared with the figure by its value, whatever decimals it is kept to.
    expect(holds(number('VOLUME', 'EQUALS', 14.4), piece(split, 'A'))).toBe(true);
    expect(holds(number('VOLUME', 'EQUALS', 36), piece(split, 'A'))).toBe(false);
    expect(holds(number('VOLUME', 'EQUALS', 36), piece(split, 'B'))).toBe(false);
  });

  it('AC-07-23 Collection address reads the address as text: EQUALS, NOT EQUALS, CONTAINS, STARTS WITH', () => {
    const heron = only(l101001);

    expect(holds(address('CONTAINS', 'Heron'), heron)).toBe(true);
    expect(holds(address('STARTS_WITH', '14'), heron)).toBe(true);
    expect(holds(address('EQUALS', '14 Heron St'), heron)).toBe(true);
    expect(holds(address('NOT_EQUALS', '14 Heron St'), heron)).toBe(false);
    expect(holds(address('NOT_EQUALS', '22 Elm St'), heron)).toBe(true);
    expect(holds(address('CONTAINS', 'Elm'), heron)).toBe(false);
    expect(holds(address('STARTS_WITH', 'Heron'), heron)).toBe(false);
    expect(holds(address('CONTAINS', 'Birch'), only(u301006))).toBe(true);
    // Capitals and the spaces at either end don't count (agent default, ADR-354).
    expect(holds(address('CONTAINS', 'heron'), heron)).toBe(true);
    expect(holds(address('EQUALS', ' 14 HERON ST '), heron)).toBe(true);
  });

  it('AC-07-24 Zone reads the zone the worker attached, matched by its name', () => {
    expect(holds(picked('ZONE', 'EQUALS', zone('Zone 2')), only(l101001))).toBe(true);
    expect(holds(picked('ZONE', 'EQUALS', zone('Zone 1')), only(l101001))).toBe(false);

    const split = load('102001', {
      properties: [
        { suffix: 'A', zoneId: 'zone-1' },
        { suffix: 'B', zoneId: 'zone-3' },
      ],
    });
    expect(split.readings.map((each) => each.zoneName)).toEqual(['Zone 1', 'Zone 3']);
    const hanger = unitRate('301001', { unitCount: 1 }, null, 'zone-2');
    expect(holds(picked('ZONE', 'EQUALS', zone('Zone 2')), only(hanger))).toBe(true);
  });

  it('AC-07-25 Disposal site reads where it was dumped; a haul-out’s, the final site', () => {
    const atLandfill = picked('DISPOSAL_SITE', 'EQUALS', pick(landfill));

    expect(holds(atLandfill, only(l101002))).toBe(true);
    expect(holds(atLandfill, only(h201001))).toBe(true);
    expect(holds(atLandfill, only(l101001))).toBe(false);
    expect(h201004.readings.map((each) => holds(atLandfill, each))).toEqual([false, false, false]);
  });

  it('AC-07-26 From site reads the TDSR a haul-out left, its collection’s site', () => {
    expect(holds(picked('FROM_SITE', 'EQUALS', pick(marshRoad)), only(h201001))).toBe(true);
    expect(holds(picked('FROM_SITE', 'EQUALS', pick(landfill)), only(h201001))).toBe(false);
  });

  it('AC-07-27 Disposal site type reads the dump site’s type', () => {
    const isFinal = picked('DISPOSAL_SITE_TYPE', 'EQUALS', pick(finalDisposal));

    expect(holds(isFinal, only(l101002))).toBe(true);
    expect(holds(isFinal, only(l101001))).toBe(false);
    expect(holds(picked('DISPOSAL_SITE_TYPE', 'EQUALS', pick(tdsrType)), only(l101001))).toBe(true);
  });

  it('AC-07-28 a pick from a list takes EQUALS, NOT EQUALS, IS ONE OF and IS NOT ONE OF', () => {
    const two = [pick(marshRoad), pick(transferStation)];
    const oneOf = picked('DISPOSAL_SITE', 'IS_ONE_OF', ...two);
    const notOneOf = picked('DISPOSAL_SITE', 'IS_NOT_ONE_OF', ...two);

    expect([holds(oneOf, only(l101001)), holds(oneOf, only(l101002))]).toEqual([true, false]);
    expect([holds(notOneOf, only(l101001)), holds(notOneOf, only(l101002))]).toEqual([false, true]);
    expect(holds(picked('DISPOSAL_SITE', 'NOT_EQUALS', pick(landfill)), only(l101001))).toBe(true);
    expect(holds(picked('DISPOSAL_SITE', 'NOT_EQUALS', pick(landfill)), only(l101002))).toBe(false);
  });

  it('AC-07-29, AC-06-57 Mileage is rounded half up to tenths before any rule compares it; what is kept stays unrounded', () => {
    const atMost15 = number('MILEAGE', 'AT_MOST', 15);
    const next = number('MILEAGE', 'BETWEEN', 15.1, 30);
    const kept1504 = only(load('101055', { miles: '15.0400' }));
    const kept1505 = only(load('101056', { miles: '15.0500' }));

    expect(Mileage.inTenths('6.2050')).toBe('6.2');
    expect(Mileage.inTenths('15.0400')).toBe('15.0');
    expect(Mileage.inTenths('15.0500')).toBe('15.1');
    expect(Mileage.inTenths('15.0499')).toBe('15.0');
    expect(holds(number('MILEAGE', 'EQUALS', 6.2), only(l101001))).toBe(true);
    expect([holds(atMost15, kept1504), holds(next, kept1504)]).toEqual([true, false]);
    expect([holds(atMost15, kept1505), holds(next, kept1505)]).toEqual([false, true]);
    expect(only(l101001).mileage).toBe('6.2050');
    expect(kept1505.mileage).toBe('15.0500');
  });

  it('AC-07-30 BETWEEN includes both ends; a number takes its seven operators', () => {
    const between = number('MILEAGE', 'BETWEEN', 15.1, 30);
    const miles = (kept: string): RuleReading => only(load('101057', { miles: kept }));

    expect(
      ['15.1000', '30.0000', '15.0000', '30.1000'].map((kept) => holds(between, miles(kept))),
    ).toEqual([true, true, false, false]);
    const at15 = miles('15.0000');
    expect(holds(number('MILEAGE', 'AT_MOST', 15), at15)).toBe(true);
    expect(holds(number('MILEAGE', 'AT_LEAST', 15), at15)).toBe(true);
    expect(holds(number('MILEAGE', 'MORE_THAN', 15), at15)).toBe(false);
    expect(holds(number('MILEAGE', 'LESS_THAN', 15), at15)).toBe(false);
    expect(holds(number('MILEAGE', 'EQUALS', 15), at15)).toBe(true);
    expect(holds(number('MILEAGE', 'NOT_EQUALS', 15), at15)).toBe(false);
    expect(holds(number('MILEAGE', 'MORE_THAN', 14.9), at15)).toBe(true);
    expect(holds(number('MILEAGE', 'LESS_THAN', 15.1), at15)).toBe(true);
  });

  it('AC-07-31 a load with no road route is read at its straight-line miles', () => {
    const straightLine = new Mileage(
      {
        from: { latitude: '39.13850000', longitude: '-75.55370000' },
        to: { latitude: '39.09000000', longitude: '-75.62000000' },
      },
      { date: '2026-01-01', sha256: 'a'.repeat(64) },
    ).straightLine(null);
    const noRoute = only(load('101026', { miles: straightLine.miles }));

    expect(straightLine.source).toBe('STRAIGHT_LINE');
    expect(noRoute.mileage).toBe(straightLine.miles);
    expect(
      holds(number('MILEAGE', 'EQUALS', Number(Mileage.inTenths(straightLine.miles))), noRoute),
    ).toBe(true);
    expect(idsOf(rules.passing('LOAD', coastlinePrime, noRoute))).toEqual(['VEG-HAUL-CY-15']);
  });

  it('AC-07-32 each property of a split is read by its own mileage, zone and address, and by the load’s certification and disposal', () => {
    const split = load('102001', {
      certNumber: '730416',
      dumpedAtSite: landfill,
      properties: [
        { suffix: 'A', address: '412 Cedar Ct', zoneId: 'zone-1', miles: '9.1000' },
        { suffix: 'B', address: '416 Cedar Ct', zoneId: 'zone-2', miles: '16.4000' },
      ],
    });

    expect(split.readings).toMatchObject([
      {
        splitSuffix: 'A',
        collectionAddress: '412 Cedar Ct',
        zoneName: 'Zone 1',
        mileage: '9.1000',
      },
      {
        splitSuffix: 'B',
        collectionAddress: '416 Cedar Ct',
        zoneName: 'Zone 2',
        mileage: '16.4000',
      },
    ]);
    for (const each of split.readings) {
      expect(each).toMatchObject({
        contractorId: coastlinePrime,
        disposalSiteId: landfill.id,
        disposalSiteTypeId: finalDisposal.id,
      });
    }
    expect(split.readings.map((each) => idsOf(rules.passing('LOAD', split.primeId, each)))).toEqual(
      [['VEG-HAUL-CY-15', 'TIP-FEE-CY-BCL'], ['TIP-FEE-CY-BCL']],
    );
  });

  it('AC-07-33 Pay item reads the pay item the worker worked out again, never the phone’s', () => {
    const diameterInches = SizeBands.diameter({ inches: 56.5, measuredAs: 'CIRCUMFERENCE' });
    const leaner = only(
      unitRate('301002', { unitCount: 1 }, { payItemId: 'pay-item-LNR-RMV-EA-24', diameterInches }),
    );
    const is = (code: string): RuleCriterionLine =>
      picked('PAY_ITEM', 'EQUALS', { value: `pay-item-${code}`, name: code, gone: false });

    expect(holds(is('LNR-RMV-EA-24'), leaner)).toBe(true);
    expect(holds(is('LNR-RMV-EA-99'), leaner)).toBe(false);
    // No band fits (301005): the ticket has no pay item, and no Pay item line holds on it.
    const noBand = only(
      unitRate('301005', { unitCount: 1 }, { payItemId: null, diameterInches: 1 }),
    );
    expect(holds(is('LNR-RMV-EA-24'), noBand)).toBe(false);
    expect(holds(line('PAY_ITEM', 'IS_EMPTY'), noBand)).toBe(true);
  });

  it('AC-07-34 Unit count reads the count; crew time’s highest item’s hours; white goods’ total of the items', () => {
    expect(holds(number('UNIT_COUNT', 'EQUALS', 1), only(u301001))).toBe(true);
    expect(only(u301007).unitCount).toBe('9.75');
    expect(holds(number('UNIT_COUNT', 'EQUALS', 9.75), only(u301007))).toBe(true);
    expect(only(u301006).unitCount).toBe('6.00');
    expect(holds(number('UNIT_COUNT', 'EQUALS', 6), only(u301006))).toBe(true);
  });

  it('AC-07-35 Measurement reads a diameter in inches: a circumference converted, a stump’s two feet up, never the root ball', () => {
    const diameterInches = SizeBands.diameter({ inches: 56.5, measuredAs: 'CIRCUMFERENCE' });
    const leaner = only(
      unitRate('301002', { unitCount: 1 }, { payItemId: 'pay-item-LNR-RMV-EA-24', diameterInches }),
    );
    expect(leaner.measurementInches).toBe(18);
    expect(holds(number('MEASUREMENT', 'EQUALS', 18), leaner)).toBe(true);
    expect(holds(number('MEASUREMENT', 'EQUALS', 56.5), leaner)).toBe(false);

    const stump = only(
      unitRate(
        '301004',
        { certNumber: '730418', unitCount: 1 },
        {
          payItemId: 'pay-item-STP-RMV-EA-36',
          diameterInches: SizeBands.diameter({ inches: 30, measuredAs: 'DIAMETER' }),
        },
      ),
    );
    expect(holds(number('MEASUREMENT', 'BETWEEN', 24, 36), stump)).toBe(true);
    expect(holds(number('MEASUREMENT', 'EQUALS', 96), stump)).toBe(false);
  });

  it('AC-07-36 Item reads one picked item’s count on an itemised ticket', () => {
    const whiteGoods = only(u301006);

    expect(holds(item(freonRecovered, 'AT_LEAST', 1), whiteGoods)).toBe(true);
    expect(holds(item(freonRecovered, 'EQUALS', 2), whiteGoods)).toBe(true);
    expect(holds(item(freonStaged, 'AT_LEAST', 1), whiteGoods)).toBe(false);
    expect(holds(item(freonStaged, 'IS_EMPTY'), whiteGoods)).toBe(true);
    expect(holds(item(washer, 'IS_NOT_EMPTY'), whiteGoods)).toBe(true);
    // A ticket that isn't itemised lists none of any item (agent default, ADR-354).
    expect(holds(item(washer, 'AT_LEAST', 1), only(u301001))).toBe(false);
    expect(holds(item(washer, 'IS_EMPTY'), only(u301001))).toBe(true);
  });

  it('AC-07-37 there is no Load call criterion and no root-ball criterion', () => {
    expect(ruleCriterionKeys).toEqual([
      'TICKET_DATE',
      'CONTRACTOR',
      'DEBRIS_TYPE',
      'FIELD_TAG',
      'WEIGHT',
      'VOLUME',
      'COLLECTION_ADDRESS',
      'ZONE',
      'DISPOSAL_SITE',
      'FROM_SITE',
      'DISPOSAL_SITE_TYPE',
      'MILEAGE',
      'PAY_ITEM',
      'UNIT_COUNT',
      'MEASUREMENT',
      'ITEM',
    ]);
    expect(Object.keys(only(l101001)).join(' ')).not.toMatch(/loadCall|rootBall/i);
  });
});

// The user, 2026-10-05 (ADR-354): ticket 101050, collected with no GPS fix, has no mileage and
// no zone.
describe('a line that compares with something the ticket doesn’t have never holds', () => {
  const noFix = only(load('101050', { volumeCy: '52.00' }));

  it('neither mileage rule passes on a load with no mileage, so it is priced on no guess', () => {
    expect(noFix.mileage).toBeNull();
    expect(holds(number('MILEAGE', 'AT_MOST', 15), noFix)).toBe(false);
    expect(holds(number('MILEAGE', 'BETWEEN', 15.1, 30), noFix)).toBe(false);
    expect(holds(number('MILEAGE', 'LESS_THAN', 15), noFix)).toBe(false);
    expect(idsOf(rules.passing('LOAD', coastlinePrime, noFix))).toEqual([]);
  });

  it('a line worded as a "not" doesn’t hold either: no zone is not "not Zone 1"', () => {
    expect(noFix.zoneName).toBeNull();
    expect(holds(picked('ZONE', 'NOT_EQUALS', zone('Zone 1')), noFix)).toBe(false);
    expect(holds(picked('ZONE', 'IS_NOT_ONE_OF', zone('Zone 1'), zone('Zone 2')), noFix)).toBe(
      false,
    );
    expect(holds(number('MILEAGE', 'NOT_EQUALS', 15), noFix)).toBe(false);
    expect(holds(number('WEIGHT', 'NOT_EQUALS', 5), noFix)).toBe(false);
    expect(holds(address('NOT_EQUALS', '14 Heron St'), noFix)).toBe(false);
    expect(holds(picked('FIELD_TAG', 'NOT_EQUALS', pick(zone1Pile)), noFix)).toBe(false);
  });

  it('only IS EMPTY holds on it, and IS NOT EMPTY doesn’t', () => {
    const empties: RuleCriterionKey[] = [
      'MILEAGE',
      'ZONE',
      'WEIGHT',
      'FIELD_TAG',
      'COLLECTION_ADDRESS',
    ];
    for (const criterion of empties) {
      expect(holds(line(criterion, 'IS_EMPTY'), noFix)).toBe(true);
      expect(holds(line(criterion, 'IS_NOT_EMPTY'), noFix)).toBe(false);
    }
    expect(holds(line('VOLUME', 'IS_EMPTY'), noFix)).toBe(false);
    expect(holds(line('VOLUME', 'IS_NOT_EMPTY'), noFix)).toBe(true);
  });

  it('a zone no version of the map names, and a blank address, are empty', () => {
    const offMap = only(load('101058', { zoneId: 'zone-of-nowhere', address: '   ' }));

    expect(holds(line('ZONE', 'IS_EMPTY'), offMap)).toBe(true);
    expect(holds(line('COLLECTION_ADDRESS', 'IS_EMPTY'), offMap)).toBe(true);
    expect(holds(address('NOT_EQUALS', '14 Heron St'), offMap)).toBe(false);
  });

  it('a line that can’t be read as a criterion holds on nothing', () => {
    expect(holds(line('MILEAGE', 'AT_MOST'), only(l101001))).toBe(false);
    expect(holds(line('MILEAGE', 'CONTAINS', { text: '6' }), only(l101001))).toBe(false);
  });
});
