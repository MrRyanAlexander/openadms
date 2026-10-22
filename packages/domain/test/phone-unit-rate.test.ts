// What a phone asks of a unit rate ticket, at the domain (spec/acceptance/11-field-app.md
// AC-11-43; spec/acceptance/04-field-capture.md AC-04-59; REQ-112b, 306, 320; ADR-207, 210, 213,
// 583, 590, 605). P1's unit rate pay items as the golden mission §1 has them, with the browser world's
// settings: a hanger measured, a leaner 24.1–99 in the monitor may mark ineligible; Hangers,
// Leaners and Stumps photographed by stage, as shipped.
import { describe, expect, it } from 'vitest';

import { PhoneUnitRate, type PhoneKindOfWork, type PhoneUnitRatePayItem } from '../src/index.ts';

const kind = (
  name: string,
  countShape: PhoneKindOfWork['countShape'],
  key: PhoneKindOfWork['key'] = null,
  photosByStage = false,
): PhoneKindOfWork => ({ id: `kind-${name}`, name, key, countShape, photosByStage });

const payItem = (
  code: string,
  work: string,
  kindOfWork: PhoneKindOfWork,
  settings: Partial<PhoneUnitRatePayItem> = {},
): PhoneUnitRatePayItem => ({
  id: code,
  code,
  bandFrom: null,
  bandTo: null,
  archived: false,
  payableType: { id: `type-${work}`, name: work },
  kindOfWork,
  countIsAlwaysOne: true,
  measurementRequired: false,
  decimalsAllowed: false,
  monitorMayMarkIneligible: false,
  ...settings,
});

const hangers = kind('Hangers', 'NUMBER', null, true);
const leaners = kind('Leaners', 'NUMBER', null, true);
const stumps = kind('Stumps', 'NUMBER', 'STUMPS', true);
const whiteGoods = kind('White Goods', 'ITEM_COUNTS');
const crewTime = kind('Crew time', 'ITEM_HOURS');
const p1 = [
  payItem('HNG-RMV-EA', 'Hangers', hangers, { measurementRequired: true }),
  payItem('LNR-RMV-EA-24', 'Leaners', leaners, { bandFrom: 6, bandTo: 24 }),
  payItem('LNR-RMV-EA-99', 'Leaners', leaners, {
    bandFrom: 24.1,
    bandTo: 99,
    monitorMayMarkIneligible: true,
  }),
  payItem('STP-RMV-EA-36', 'Stumps', stumps, { bandFrom: 24, bandTo: 36 }),
  payItem('STP-RMV-EA-48', 'Stumps', stumps, { bandFrom: 36.1, bandTo: 48 }),
  payItem('WG-RMV-EA', 'White Goods', whiteGoods, { countIsAlwaysOne: false }),
  payItem('CREW-TIME-HR', 'Crew time', crewTime, { countIsAlwaysOne: false }),
  payItem('SIGN-RMV-EA', 'Signs', kind('Signs', 'NUMBER'), {
    countIsAlwaysOne: false,
    archived: true,
  }),
];
const phone = new PhoneUnitRate(p1);

describe('the payable types a unit rate monitor picks from', () => {
  it('AC-11-43 each once, by name, in the order the pay items came; one with no live pay item is not offered', () => {
    expect(phone.payableTypes().map(({ name }) => name)).toEqual([
      'Hangers',
      'Leaners',
      'Stumps',
      'White Goods',
      'Crew time',
    ]);
    expect(phone.asks('type-Signs')).toBeNull();
  });
});

describe('the screen each kind of work takes', () => {
  it('REQ-112b a hanger: one each, never asked, measured around or across', () => {
    expect(phone.asks('type-Hangers')).toMatchObject({
      screen: 'COUNT',
      count: 'ONE',
      measured: 'TREE',
      decimals: false,
    });
  });

  it('REQ-112b a leaner is measured because its bands tell its pay items apart', () => {
    const banded = new PhoneUnitRate(p1.map((one) => ({ ...one, measurementRequired: false })));
    expect(banded.asks('type-Leaners')).toMatchObject({ screen: 'COUNT', measured: 'TREE' });
  });

  it('REQ-112b a count is asked unless every one of the payable type’s pay items is always one', () => {
    const mixed = new PhoneUnitRate([
      payItem('SIGN-RMV-EA', 'Signs', kind('Signs', 'NUMBER')),
      payItem('SIGN-RMV-BUNDLE', 'Signs', kind('Signs', 'NUMBER'), { countIsAlwaysOne: false }),
    ]);
    expect(mixed.asks('type-Signs')?.count).toBe('ASKED');
  });

  it('REQ-112b a count kind with no band and no measurement asked is counted, not measured', () => {
    const signs = new PhoneUnitRate([
      payItem('SIGN-RMV-EA', 'Signs', kind('Signs', 'NUMBER'), {
        countIsAlwaysOne: false,
        decimalsAllowed: true,
      }),
    ]);
    expect(signs.asks('type-Signs')).toMatchObject({
      screen: 'COUNT',
      count: 'ASKED',
      measured: 'NONE',
      decimals: true,
    });
  });

  it('REQ-112b Stumps is told by its key, not its name: across only, one each', () => {
    expect(phone.asks('type-Stumps')).toMatchObject({
      screen: 'STUMP',
      count: 'ONE',
      measured: 'STUMP',
    });
    const renamed = new PhoneUnitRate([
      payItem('STP-RMV-EA-36', 'Stumps', { ...stumps, name: 'Stump grinding' }),
    ]);
    expect(renamed.asks('type-Stumps')?.screen).toBe('STUMP');
    const named = new PhoneUnitRate([payItem('STP-RMV-EA-36', 'Stumps', { ...stumps, key: null })]);
    expect(named.asks('type-Stumps')?.screen).toBe('COUNT');
  });

  it('REQ-112b white goods are items with a count each, crew time items with hours each', () => {
    expect(phone.asks('type-White Goods')).toMatchObject({
      screen: 'ITEM_COUNTS',
      count: 'NONE',
      measured: 'NONE',
      decimals: false,
    });
    expect(phone.asks('type-Crew time')).toMatchObject({
      screen: 'ITEM_HOURS',
      count: 'NONE',
      measured: 'NONE',
      decimals: true,
    });
  });
});

describe('the pay item the phone works out, and "ineligible"', () => {
  it('AC-11-43, AC-04-59 the hanger is its one pay item; a leaner 56.5 in around falls in 6–24 in, one 80 in around in 24.1–99 in; a stump of 20 in in none', () => {
    expect(phone.payItemFor('type-Hangers', { inches: 3, measuredAs: 'DIAMETER' })?.code).toBe(
      'HNG-RMV-EA',
    );
    expect(
      phone.payItemFor('type-Leaners', { inches: 56.5, measuredAs: 'CIRCUMFERENCE' })?.code,
    ).toBe('LNR-RMV-EA-24');
    expect(
      phone.payItemFor('type-Leaners', { inches: 80, measuredAs: 'CIRCUMFERENCE' })?.code,
    ).toBe('LNR-RMV-EA-99');
    expect(phone.payItemFor('type-Stumps', { inches: 20, measuredAs: 'DIAMETER' })).toBeNull();
    expect(phone.payItemFor('type-Leaners', null)).toBeNull();
  });

  it('REQ-320 "ineligible" is offered where the pay item worked out allows it, or with none worked out, where one of the payable type does', () => {
    const around = (inches: number) => ({ inches, measuredAs: 'CIRCUMFERENCE' as const });
    expect(phone.mayMarkIneligible('type-Leaners', around(56.5))).toBe(false);
    expect(phone.mayMarkIneligible('type-Leaners', around(80))).toBe(true);
    expect(phone.mayMarkIneligible('type-Leaners', null)).toBe(true);
    expect(phone.mayMarkIneligible('type-Hangers', around(10))).toBe(false);
  });
});

describe('crew time’s hours', () => {
  it('REQ-306 go to the quarter hour', () => {
    expect([9.75, 8.5, 0.25, 12, 0].map((hours) => PhoneUnitRate.quarterHour(hours))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect([9.7, 8.333, 0.1].map((hours) => PhoneUnitRate.quarterHour(hours))).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe('a stump’s measurement', () => {
  const stump = (
    diameterInches: number | null,
    rootBallInches: number | null,
    rootBallHalfExposed: boolean | null,
  ) => ({ diameterInches, rootBallInches, rootBallHalfExposed });

  it('AC-11-92 "half or more exposed?" is the root ball’s: asked where one is measured (301004, 96 in), never where it is left empty (301005)', () => {
    expect([PhoneUnitRate.asksExposure(96), PhoneUnitRate.asksExposure(null)]).toEqual([
      true,
      false,
    ]);
  });

  it('AC-11-92 complete with its diameter, and the exposure answered where a root ball is measured: 301005 without one, 301004 once answered', () => {
    expect(
      [
        stump(20, null, null),
        stump(30, 96, true),
        stump(30, 96, false),
        stump(30, 96, null),
        stump(null, null, null),
      ].map((entered) => PhoneUnitRate.stumpMeasured(entered)),
    ).toEqual([true, true, true, false, false]);
  });

  it('AC-11-92 a root ball left empty takes its exposure answer with it; one entered keeps it', () => {
    expect(PhoneUnitRate.rootBallEntered(null, true)).toEqual({
      rootBallInches: null,
      rootBallHalfExposed: null,
    });
    expect(PhoneUnitRate.rootBallEntered(96, true)).toEqual({
      rootBallInches: 96,
      rootBallHalfExposed: true,
    });
    expect(PhoneUnitRate.rootBallEntered(96, null)).toEqual({
      rootBallInches: 96,
      rootBallHalfExposed: null,
    });
  });
});

describe('the work photographed by stage', () => {
  it('AC-11-90 hangers, leaners and stumps by their kind of work’s setting, as shipped; white goods and crew time not', () => {
    expect(
      ['Hangers', 'Leaners', 'Stumps', 'White Goods', 'Crew time'].map(
        (work) => phone.asks(`type-${work}`)?.photosByStage,
      ),
    ).toEqual([true, true, true, false, false]);
  });

  it('AC-11-90 the firm’s setting, never the name: a kind of its own photographed by stage is, and Leaners turned off is not', () => {
    const own = kind('Palms', 'NUMBER', null, true);
    const off = kind('Leaners', 'NUMBER', null, false);
    const firm = new PhoneUnitRate([
      payItem('PLM-RMV-EA', 'Palms', own),
      payItem('LNR-RMV-EA', 'Leaners', off),
    ]);
    expect([
      firm.asks('type-Palms')?.photosByStage,
      firm.asks('type-Leaners')?.photosByStage,
    ]).toEqual([true, false]);
  });
});
