// The quantities the worker concludes (spec/acceptance/06-reconciliation.md section H, AC-06-23,
// 128, 162; ADR-343). The figures are the golden mission's (spec/golden/MISSION.md §2, §3), the
// tandem's of adms-scale-receipts, and the USACE Stump Conversion Guide's table (Attachment 5).
import { describe, expect, it } from 'vitest';

import {
  CarriedTickets,
  HaulOutQuantities,
  LoadQuantities,
  ScaleWeight,
  SizeBands,
  StumpQuantities,
  quantityFor,
  quantitySources,
  type HaulOutTaken,
  type LoadTaken,
} from '../src/index.ts';

// An ordinary load: one collection, a capacity and the tower's call.
const load = (capacityCy: number | null, loadCall: number | null, more: Partial<LoadTaken> = {}) =>
  new LoadQuantities({
    capacityCy,
    loadCall,
    weightTons: null,
    weightIsShare: false,
    collections: [{ splitSuffix: '', estimateCy: null }],
    carried: null,
    ...more,
  }).work();

const haulOut = (taken: Partial<HaulOutTaken>) =>
  new HaulOutQuantities({
    capacityCy: 110,
    piles: [],
    weightTons: null,
    weightIsShare: false,
    ...taken,
  }).work();

// The split haul-out's three piles, each with the load call so far.
const piles201004 = [
  { splitSuffix: 'A', loadCall: 10 },
  { splitSuffix: 'B', loadCall: 35 },
  { splitSuffix: 'C', loadCall: 85 },
];

const noWeights = {
  grossWeightLb: null,
  tareWeightLb: null,
  netWeightLb: null,
  netWeightTons: null,
};

const added = (texts: readonly string[]): number =>
  texts.reduce((sum, text) => sum + Math.round(Number(text) * 10_000), 0) / 10_000;

describe('a load: capacity × load call', () => {
  it("AC-06-73 the mission's loads: 52.0, 36.0, 62.4, 24.0, 45.5 and 28.8 CY", () => {
    const loads: [string, number, number][] = [
      ['101001', 65, 80],
      ['101002', 48, 75],
      ['101003', 65, 96],
      ['101004', 48, 50],
      ['101005', 65, 70],
      ['101006', 48, 60],
    ];
    expect(loads.map(([, capacity, call]) => load(capacity, call).volumeCy)).toEqual([
      '52.00',
      '36.00',
      '62.40',
      '24.00',
      '45.50',
      '28.80',
    ]);
    const worked = load(65, 80);
    expect(worked.quantitySource).toBe('LOAD_CALL');
    expect(worked.collections).toEqual([
      { splitSuffix: '', shareFraction: '1.00000000', volumeCy: '52.00', weightTons: null },
    ]);
  });

  it('AC-06-23 ticket 101003: its 96% call gives its quantity all the same; nothing here waits on a flag', () => {
    expect(load(65, 96).volumeCy).toBe('62.40');
  });

  it('a 0% call is 0 CY; no certification, or no call, is no volume: never a guess', () => {
    expect(load(65, 0).volumeCy).toBe('0.00');
    expect(load(null, 80).volumeCy).toBeNull();
    const none = load(65, null);
    expect(none.volumeCy).toBeNull();
    expect(none.quantitySource).toBeNull();
  });

  it('the sources are the three the database keeps', () => {
    expect(quantitySources).toEqual(['LOAD_CALL', 'SCALE_WEIGHT', 'CARRIED_TICKETS']);
  });
});

describe('a split load: shares by estimate', () => {
  const split102001 = (more: Partial<LoadTaken> = {}) =>
    load(48, 75, {
      collections: [
        { splitSuffix: 'B', estimateCy: '18.0' },
        { splitSuffix: 'A', estimateCy: '12.0' },
      ],
      ...more,
    });

  it('AC-06-75 ticket 102001: 36.0 CY, estimates 12 and 18, is 14.4 and 21.6 CY, adding up exactly', () => {
    const worked = split102001();
    expect(worked.volumeCy).toBe('36.00');
    expect(worked.collections).toEqual([
      { splitSuffix: 'A', shareFraction: '0.40000000', volumeCy: '14.40', weightTons: null },
      { splitSuffix: 'B', shareFraction: '0.60000000', volumeCy: '21.60', weightTons: null },
    ]);
    expect(added(worked.collections.map((row) => row.volumeCy ?? ''))).toBe(36);
    expect(worked.sharesNotWorkedOut).toBeNull();
  });

  it('AC-06-128 the estimates, 30 CY in all against a load of 36.0, are only relative sizes: nothing is reported', () => {
    const worked = split102001();
    expect(worked.sharesNotWorkedOut).toBeNull();
    // Twice the estimates, the same shares.
    const doubled = load(48, 75, {
      collections: [
        { splitSuffix: 'A', estimateCy: 24 },
        { splitSuffix: 'B', estimateCy: 36 },
      ],
    });
    expect(doubled.collections.map((row) => row.volumeCy)).toEqual(['14.40', '21.60']);
  });

  it('a split weighed instead: the estimates share the tons, to two decimals (ADR-297)', () => {
    const worked = split102001({ loadCall: null, weightTons: '10.0000' });
    expect(worked.quantitySource).toBe('SCALE_WEIGHT');
    expect(worked.collections.map((row) => row.weightTons)).toEqual(['4.0000', '6.0000']);
    expect(worked.collections.map((row) => row.volumeCy)).toEqual([null, null]);
  });

  it('shares that round apart from the whole: the largest property takes what is left, the last of equals', () => {
    // 10.00 CY over three equal properties: 3.33 each, and a hundredth left.
    const thirds = load(50, 20, {
      collections: ['A', 'B', 'C'].map((splitSuffix) => ({ splitSuffix, estimateCy: 5 })),
    });
    expect(thirds.collections.map((row) => row.volumeCy)).toEqual(['3.33', '3.33', '3.34']);
    // 0.50 CY over 1, 1 and 4: 0.08, 0.08 and 0.33 round to a hundredth short.
    const uneven = load(50, 1, {
      collections: [
        { splitSuffix: 'A', estimateCy: 4 },
        { splitSuffix: 'B', estimateCy: 1 },
        { splitSuffix: 'C', estimateCy: 1 },
      ],
    });
    expect(uneven.collections.map((row) => row.volumeCy)).toEqual(['0.34', '0.08', '0.08']);
    expect(added(uneven.collections.map((row) => row.volumeCy ?? ''))).toBe(0.5);
  });

  it('an estimate missing, or every estimate nought: no property is given a share, and why is said', () => {
    const missing = load(48, 75, {
      collections: [
        { splitSuffix: '', estimateCy: null },
        { splitSuffix: 'A', estimateCy: 12 },
      ],
    });
    expect(missing.sharesNotWorkedOut).toBe('ESTIMATE_MISSING');
    expect(missing.volumeCy).toBe('36.00');
    expect(missing.collections).toEqual([
      { splitSuffix: '', shareFraction: '0.00000000', volumeCy: null, weightTons: null },
      { splitSuffix: 'A', shareFraction: '0.00000000', volumeCy: null, weightTons: null },
    ]);
    const nought = load(48, 75, {
      collections: [
        { splitSuffix: 'A', estimateCy: 0 },
        { splitSuffix: 'B', estimateCy: 0 },
      ],
    });
    expect(nought.sharesNotWorkedOut).toBe('ESTIMATES_ARE_NOUGHT');
  });
});

describe("a haul-out: the call is the loading end's", () => {
  it('AC-06-74 ticket 201001: 110 CY × 90% at Marsh Road TDSR is 99.0 CY; its disposal gives no call', () => {
    const worked = haulOut({ piles: [{ splitSuffix: '', loadCall: 90 }] });
    expect(worked.loadCall).toBe(90);
    expect(worked.volumeCy).toBe('99.00');
    expect(worked.quantitySource).toBe('LOAD_CALL');
    expect(worked.piles).toEqual([
      {
        splitSuffix: '',
        pileLoadCall: 90,
        shareFraction: '1.00000000',
        volumeCy: '99.00',
        weightTons: null,
      },
    ]);
  });

  it('AC-06-76 ticket 201004: calls 10%, 35%, 85% add 10, 25 and 50: 11.0, 27.5 and 55.0 CY, 93.5 in all', () => {
    const worked = haulOut({ piles: [...piles201004].reverse() });
    expect(worked.loadCall).toBe(85);
    expect(worked.volumeCy).toBe('93.50');
    expect(
      worked.piles.map((pile) => [pile.splitSuffix, pile.pileLoadCall, pile.volumeCy]),
    ).toEqual([
      ['A', 10, '11.00'],
      ['B', 25, '27.50'],
      ['C', 50, '55.00'],
    ]);
    expect(worked.pileCallNotHigher).toBeNull();
  });

  it('AC-06-77 ticket 201004 weighed, 48,000 lb = 24.00 tons: 2.82, 7.06 and 14.12 tons, adding up exactly; the CY kept', () => {
    const net = new ScaleWeight({
      grossWeightLb: '79600.00',
      tareWeightLb: '31600.00',
      netWeightLb: '48000.00',
      netWeightTons: null,
    }).net();
    expect(net).toEqual({ netTons: '24.0000', readFrom: 'NET_LB', usableTons: '24.0000' });
    const worked = haulOut({ piles: piles201004, weightTons: net.usableTons });
    expect(worked.quantitySource).toBe('SCALE_WEIGHT');
    expect(worked.weightTons).toBe('24.0000');
    expect(worked.weightIsShare).toBe(false);
    expect(worked.piles.map((pile) => pile.weightTons)).toEqual(['2.8200', '7.0600', '14.1200']);
    expect(added(worked.piles.map((pile) => pile.weightTons ?? ''))).toBe(24);
    expect(worked.piles.map((pile) => pile.shareFraction)).toEqual([
      '0.11764706',
      '0.29411765',
      '0.58823529',
    ]);
    // The loading end's figures are kept, unbilled.
    expect(worked.volumeCy).toBe('93.50');
    expect(worked.piles.map((pile) => pile.volumeCy)).toEqual(['11.00', '27.50', '55.00']);
    // A per-ton pay item bills the pile's tons; a per-CY one would bill its CY.
    const [pileA] = worked.piles;
    expect(pileA).toBeDefined();
    if (pileA === undefined) return;
    expect(quantityFor({ unit: 'TN', quantityFromCarriedTickets: false }, pileA)).toBe('2.8200');
  });

  it('AC-06-78 the same piles dumped at Bayline County Landfill, no scale: the quantities are the CY figures', () => {
    const worked = haulOut({ piles: piles201004 });
    expect(worked.quantitySource).toBe('LOAD_CALL');
    expect(
      worked.piles.map((pile) =>
        quantityFor({ unit: 'CY', quantityFromCarriedTickets: false }, pile),
      ),
    ).toEqual(['11.00', '27.50', '55.00']);
    expect(worked.piles.map((pile) => pile.weightTons)).toEqual([null, null, null]);
  });

  it("AC-06-90 pile -B at 30% after pile -A's 35%: what it added can't be worked out, and no pile is shared out", () => {
    const worked = haulOut({
      piles: [
        { splitSuffix: 'A', loadCall: 35 },
        { splitSuffix: 'B', loadCall: 30 },
      ],
      weightTons: '24.0000',
    });
    expect(worked.pileCallNotHigher).toEqual({
      splitSuffix: 'B',
      loadCall: 30,
      beforeSuffix: 'A',
      beforeLoadCall: 35,
    });
    expect(worked.piles).toEqual([
      {
        splitSuffix: 'A',
        pileLoadCall: 0,
        shareFraction: '0.00000000',
        volumeCy: null,
        weightTons: null,
      },
      {
        splitSuffix: 'B',
        pileLoadCall: 0,
        shareFraction: '0.00000000',
        volumeCy: null,
        weightTons: null,
      },
    ]);
    // A call the same as the one before it added nothing either.
    const same = haulOut({
      piles: [
        { splitSuffix: 'A', loadCall: 35 },
        { splitSuffix: 'B', loadCall: 35 },
      ],
    });
    expect(same.pileCallNotHigher?.splitSuffix).toBe('B');
  });

  it('a pile that gave no call: no pile is shared out; an ordinary haul-out with none has no volume', () => {
    const worked = haulOut({
      piles: [
        { splitSuffix: 'A', loadCall: 10 },
        { splitSuffix: 'B', loadCall: null },
        { splitSuffix: 'C', loadCall: 85 },
      ],
    });
    expect(worked.pileCallMissing).toBe(true);
    expect(worked.pileCallNotHigher).toBeNull();
    expect(worked.piles.map((pile) => pile.volumeCy)).toEqual([null, null, null]);
    const ordinary = haulOut({
      piles: [{ splitSuffix: '', loadCall: null }],
      weightTons: '9.5000',
    });
    expect(ordinary.volumeCy).toBeNull();
    expect(ordinary.pileCallMissing).toBe(false);
    expect(ordinary.piles.map((pile) => pile.weightTons)).toEqual(['9.5000']);
  });
});

describe('a scale weight', () => {
  it('AC-06-79 the tandem on receipt BCL-88241, 17.10 tons over 30 and 40 CY: 7.33 and 9.77 tons, each a share', () => {
    const net = new ScaleWeight({
      grossWeightLb: '62400.00',
      tareWeightLb: '28200.00',
      netWeightLb: null,
      netWeightTons: null,
    }).net();
    expect(net).toEqual({ netTons: '17.1000', readFrom: 'GROSS_LESS_TARE', usableTons: '17.1000' });
    const shares = new ScaleWeight({ ...noWeights, netWeightTons: '17.1000' }).sharedBy([
      { key: '101050', capacityCy: 30 },
      { key: '101051', capacityCy: 40 },
    ]);
    expect(shares).toEqual([
      { key: '101050', weightTons: '7.3300', weightIsShare: true },
      { key: '101051', weightTons: '9.7700', weightIsShare: true },
    ]);
    expect(added((shares ?? []).map((share) => share.weightTons))).toBe(17.1);
    // Each load then carries its share, marked, and bills at it.
    const body = load(30, null, { weightTons: '7.3300', weightIsShare: true });
    expect(body.quantitySource).toBe('SCALE_WEIGHT');
    expect(body.weightIsShare).toBe(true);
    expect(quantityFor({ unit: 'TN', quantityFromCarriedTickets: false }, body)).toBe('7.3300');
  });

  it('a weight on one container is weighed, never a share; shares that round apart: one container takes what is left, the last of two as large', () => {
    expect(
      new ScaleWeight({ ...noWeights, netWeightTons: '17.1000' }).sharedBy([
        { key: 'only', capacityCy: 30 },
      ]),
    ).toEqual([{ key: 'only', weightTons: '17.1000', weightIsShare: false }]);
    // 10.01 tons over two of 30 CY: 5.005 each rounds to 5.01, a hundredth too much.
    expect(
      new ScaleWeight({ ...noWeights, netWeightTons: '10.0100' })
        .sharedBy([
          { key: 'body', capacityCy: 30 },
          { key: 'trailer', capacityCy: 30 },
        ])
        ?.map((share) => share.weightTons),
    ).toEqual(['5.0100', '5.0000']);
  });

  it('a container with no certified capacity: no share is worked out, never a guess', () => {
    expect(
      new ScaleWeight({ ...noWeights, netWeightTons: '17.1000' }).sharedBy([
        { key: '101050', capacityCy: 30 },
        { key: '101051', capacityCy: null },
      ]),
    ).toBeNull();
  });

  it('a receipt is read, never worked out from one figure: the net as written first; none with no net and no gross and tare', () => {
    const blank = {
      grossWeightLb: null,
      tareWeightLb: null,
      netWeightLb: null,
      netWeightTons: null,
    };
    expect(
      new ScaleWeight({ ...blank, netWeightTons: '17.1000', netWeightLb: '1.00' }).net(),
    ).toEqual({
      netTons: '17.1000',
      readFrom: 'NET_TONS',
      usableTons: '17.1000',
    });
    expect(new ScaleWeight(blank).net()).toEqual({
      netTons: null,
      readFrom: null,
      usableTons: null,
    });
    expect(new ScaleWeight({ ...blank, grossWeightLb: '62400.00' }).net().netTons).toBeNull();
    // A lineage token's net of nought, and a tare taken loaded: read, and never used.
    expect(new ScaleWeight({ ...blank, netWeightLb: '0.00' }).net()).toEqual({
      netTons: '0.0000',
      readFrom: 'NET_LB',
      usableTons: null,
    });
    expect(
      new ScaleWeight({ ...blank, grossWeightLb: '28000.00', tareWeightLb: '30000.00' }).net(),
    ).toEqual({ netTons: '-1.0000', readFrom: 'GROSS_LESS_TARE', usableTons: null });
  });

  it('AC-06-162 a load call beside a scale weight: both figures are kept, the pay item says which bills, and they are never compared', () => {
    const both = load(65, 80, { weightTons: '17.1000' });
    expect(both.volumeCy).toBe('52.00');
    expect(both.weightTons).toBe('17.1000');
    expect(quantityFor({ unit: 'CY', quantityFromCarriedTickets: false }, both)).toBe('52.00');
    expect(quantityFor({ unit: 'TN', quantityFromCarriedTickets: false }, both)).toBe('17.1000');
    expect(quantityFor({ unit: 'LB', quantityFromCarriedTickets: false }, both)).toBe('34200.00');
    // A per-ton pay item on a load with no weight has no quantity: that line bills nothing.
    expect(quantityFor({ unit: 'TN', quantityFromCarriedTickets: false }, load(65, 80))).toBeNull();
  });
});

describe('stumps', () => {
  // USACE Stump Conversion Guide, Attachment 5: the diameter two feet up, 6–84 in, and its CY.
  const guide = [
    0.3, 0.4, 0.5, 0.6, 0.7, 0.9, 1, 1.2, 1.4, 1.6, 1.8, 2.1, 2.3, 2.6, 2.9, 3.2, 3.5, 3.8, 4.1,
    4.5, 4.8, 5.2, 5.6, 6, 6.5, 6.9, 7.3, 7.8, 8.3, 8.8, 9.3, 9.8, 10.3, 10.9, 11.5, 12, 12.6, 13.3,
    13.9, 14.5, 15.2, 15.8, 16.5, 17.2, 17.9, 18.6, 19.4, 20.1, 20.9, 21.7, 22.5, 23.3, 24.1, 24.9,
    25.8, 26.7, 27.6, 28.4, 29.4, 30.3, 31.2, 32.2, 33.1, 34.1, 35.1, 36.1, 37.2, 38.2, 39.2, 40.3,
    41.4, 42.5, 43.6, 44.7, 45.9, 47, 48.2, 49.4, 50.6,
  ];

  it("AC-06-81 a stump 30 in across is 6.450, 6.5 CY; the guide's 79 rows, 6–84 in, are matched with no exception", () => {
    expect(new StumpQuantities(30).stumpCy()).toBe('6.5');
    expect(guide).toHaveLength(79);
    const worked = guide.map((_, row) => Number(new StumpQuantities(row + 6).stumpCy()));
    expect(worked).toEqual(guide);
    // One formula at every size, with no maximum.
    expect(new StumpQuantities(96).stumpCy()).toBe('66.1');
  });

  it('AC-06-82 a load of stumps of 4.8, 7.8 and 12.0 CY is 24.6 CY with no load call; a load of white goods carrying 301006 is 6 items', () => {
    const stumps = [26, 33, 41].map((diameter, at) => ({
      ticketNumber: `30101${String(at)}`,
      stumpDiameterInches: diameter,
      itemCount: 1,
    }));
    expect(stumps.map((stump) => new StumpQuantities(stump.stumpDiameterInches).stumpCy())).toEqual(
      ['4.8', '7.8', '12.0'],
    );
    expect(new CarriedTickets(stumps).quantities()).toEqual({ carriedCount: 3, stumpCy: '24.60' });
    const ofStumps = load(65, null, { carried: stumps });
    expect(ofStumps.quantitySource).toBe('CARRIED_TICKETS');
    expect(ofStumps.loadCall).toBeNull();
    expect(ofStumps.volumeCy).toBe('24.60');
    expect(quantityFor({ unit: 'CY', quantityFromCarriedTickets: true }, ofStumps)).toBe('24.60');

    const whiteGoods = load(65, null, {
      carried: [{ ticketNumber: '301006', stumpDiameterInches: null, itemCount: 6 }],
    });
    expect(whiteGoods.carriedCount).toBe(6);
    expect(whiteGoods.volumeCy).toBeNull();
    expect(quantityFor({ unit: 'EA', quantityFromCarriedTickets: true }, whiteGoods)).toBe('6');
  });

  it('a load call beside carried tickets: a pay item that takes its quantity from the tickets carried bills them, any other its own figure (ADR-343)', () => {
    const both = load(65, 40, {
      carried: [{ ticketNumber: '301010', stumpDiameterInches: 26, itemCount: 1 }],
    });
    expect(both.volumeCy).toBe('26.00');
    expect(both.carriedStumpCy).toBe('4.80');
    expect(quantityFor({ unit: 'CY', quantityFromCarriedTickets: true }, both)).toBe('4.80');
    expect(quantityFor({ unit: 'CY', quantityFromCarriedTickets: false }, both)).toBe('26.00');
    expect(quantityFor({ unit: 'EA', quantityFromCarriedTickets: true }, both)).toBe('1');
    expect(quantityFor({ unit: 'EA', quantityFromCarriedTickets: false }, both)).toBeNull();
  });

  it('AC-06-83 leaner 301002, 56.5 in around, is 17.99, 18.0 in across, and falls to LNR-RMV-EA-24', () => {
    expect(SizeBands.diameter({ inches: 56.5, measuredAs: 'CIRCUMFERENCE' })).toBe(18);
    const band = (id: string, code: string, bandFrom: number | null, bandTo: number | null) => ({
      id,
      code,
      bandFrom,
      bandTo,
      archived: false,
    });
    const leaners = new SizeBands('Leaners', [
      band('1', 'LNR-RMV-EA-24', 6, 24),
      band('2', 'LNR-RMV-EA-99', 24.1, null),
    ]);
    const worked = leaners.payItemFor({ inches: 56.5, measuredAs: 'CIRCUMFERENCE' });
    expect(worked.payItem?.code).toBe('LNR-RMV-EA-24');
    expect(worked.diameterInches).toBe(18);
  });

  it("AC-06-84 stump 301004, root ball 96 in at P1's fill depth of 31 in: 4.809, 4.8 CY; no root ball, no fill", () => {
    expect(new StumpQuantities(30, '96.0').fillCy(31)).toBe('4.8');
    expect(new StumpQuantities(30, null).fillCy(31)).toBeNull();
    // The depth is the project's: another depth, another fill.
    expect(new StumpQuantities(30, 96).fillCy(24)).toBe('3.7');
    // The root ball's reading never goes into the stump CY, which reads the stump across.
    expect(new StumpQuantities(30).stumpCy()).toBe('6.5');
  });
});
