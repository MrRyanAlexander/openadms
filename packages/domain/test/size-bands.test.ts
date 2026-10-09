// The size bands of one payable type's pay items, at the domain (spec/acceptance/01-setup.md
// AC-01-45, AC-01-46; ADR-210, 213, 217, 309). The bands are P1's as the golden mission §1 sets
// them up: Leaners 6–24 and 24.1–99 in, Stumps 24–36 and 36.1–48 in. Which pay item a measurement
// falls in is one rule, here, for the phone and the worker (spec/acceptance/04-field-capture.md
// AC-04-59; BACKLOG 1.3.7).
import { describe, expect, it } from 'vitest';

import { type BandedPayItem, SizeBands } from '../src/index.ts';

const payItem = (
  id: string,
  code: string,
  bandFrom: number | null,
  bandTo: number | null,
  archived = false,
): BandedPayItem => ({ id, code, bandFrom, bandTo, archived });

const leaners24 = payItem('l24', 'LNR-RMV-EA-24', 6, 24);
const leaners99 = payItem('l99', 'LNR-RMV-EA-99', 24.1, 99);
const stumps36 = payItem('s36', 'STP-RMV-EA-36', 24, 36);

describe('a band that overlaps another of its payable type', () => {
  it('AC-01-45 Leaners 20–30 in is refused, naming the two bands it overlaps', () => {
    const leaners = new SizeBands('Leaners', [leaners24, leaners99]);
    expect(leaners.check(payItem('new', 'LNR-RMV-EA-30', 20, 30))).toEqual({
      refusal: {
        code: 'SIZE_BAND_OVERLAP',
        message:
          "Leaners: 20–30 in overlaps LNR-RMV-EA-24 (6–24 in) and LNR-RMV-EA-99 (24.1–99 in). Bands of one payable type can't overlap.",
        overlaps: ['LNR-RMV-EA-24', 'LNR-RMV-EA-99'],
      },
      warnings: [],
    });
  });

  it('AC-01-45 a band holds both its ends: sharing one inch is an overlap, the next tenth is not', () => {
    const leaners = new SizeBands('Leaners', [leaners24]);
    expect(leaners.check(payItem('new', 'LNR-RMV-EA-99', 24, 99)).refusal?.overlaps).toEqual([
      'LNR-RMV-EA-24',
    ]);
    expect(leaners.check(leaners99)).toEqual({ refusal: null, warnings: [] });
  });

  it('AC-01-45 an open end runs on: "24 in and up" overlaps every band above 24 in', () => {
    const hangers = new SizeBands('Hangers', [payItem('h99', 'HNG-RMV-EA-99', 24.1, 99)]);
    expect(hangers.check(payItem('new', 'HNG-RMV-EA-UP', 24, null)).refusal?.message).toBe(
      "Hangers: 24 in and up overlaps HNG-RMV-EA-99 (24.1–99 in). Bands of one payable type can't overlap.",
    );
    expect(hangers.check(payItem('new', 'HNG-RMV-EA-2', null, 2)).refusal).toBeNull();
  });

  it('a pay item changed in place is checked against the others, never against itself', () => {
    const leaners = new SizeBands('Leaners', [leaners24, leaners99]);
    expect(leaners.check({ ...leaners24, bandFrom: 8 })).toEqual({ refusal: null, warnings: [] });
  });

  it('an archived pay item’s band no longer counts, and an archived one isn’t checked', () => {
    const leaners = new SizeBands('Leaners', [{ ...leaners24, archived: true }, leaners99]);
    expect(leaners.check(payItem('new', 'LNR-RMV-EA-24-B', 6, 24)).refusal).toBeNull();
    expect(leaners.check(payItem('new', 'X', 20, 30, true))).toEqual({
      refusal: null,
      warnings: [],
    });
  });

  it('a pay item with no band, and the payable type’s pay items with none, are no band at all', () => {
    const vegetative = new SizeBands('Vegetative', [payItem('v15', 'VEG-HAUL-CY-15', null, null)]);
    expect(vegetative.check(payItem('v30', 'VEG-HAUL-CY-30', null, null))).toEqual({
      refusal: null,
      warnings: [],
    });
    expect(vegetative.check(payItem('t', 'TREE-EA', 6, 12))).toEqual({
      refusal: null,
      warnings: [],
    });
  });
});

describe('a gap between the bands', () => {
  it('AC-01-46 Stumps 40–48 in beside 24–36 in is saved, warning that 36.1–39.9 in falls in no band', () => {
    const stumps = new SizeBands('Stumps', [stumps36]);
    expect(stumps.check(payItem('new', 'STP-RMV-EA-48', 40, 48))).toEqual({
      refusal: null,
      warnings: [
        {
          code: 'SIZE_BAND_GAP',
          message:
            'Stumps: 36.1–39.9 in falls in no band; a measurement there gets no pay item and is flagged. Saved as it is.',
        },
      ],
    });
  });

  it('AC-01-46 bands that meet at the next tenth leave no gap: the golden mission’s 24–36 and 36.1–48 in', () => {
    const stumps = new SizeBands('Stumps', [stumps36]);
    expect(stumps.check(payItem('new', 'STP-RMV-EA-48', 36.1, 48)).warnings).toEqual([]);
  });

  it('a gap of one tenth is named as one measurement; every gap among the bands is warned', () => {
    const stumps = new SizeBands('Stumps', [stumps36, payItem('s60', 'STP-RMV-EA-60', 48.1, 60)]);
    expect(stumps.check(payItem('new', 'STP-RMV-EA-48', 36.2, 47.9)).warnings).toEqual([
      {
        code: 'SIZE_BAND_GAP',
        message:
          'Stumps: 36.1 in falls in no band; a measurement there gets no pay item and is flagged. Saved as it is.',
      },
      {
        code: 'SIZE_BAND_GAP',
        message:
          'Stumps: 48 in falls in no band; a measurement there gets no pay item and is flagged. Saved as it is.',
      },
    ]);
  });
});

describe('the bands as they stand, for the setup check', () => {
  it('AC-01-69 the golden mission’s Leaners and Stumps bands neither overlap nor leave a gap', () => {
    expect(new SizeBands('Leaners', [leaners24, leaners99]).standing()).toEqual({
      overlaps: [],
      gaps: [],
    });
    const stumps = [stumps36, payItem('s48', 'STP-RMV-EA-48', 36.1, 48)];
    expect(new SizeBands('Stumps', stumps).standing()).toEqual({ overlaps: [], gaps: [] });
  });

  it('every pair that overlaps and every stretch in no band is said once, archived pay items left out', () => {
    const stumps = new SizeBands('Stumps', [
      payItem('s48', 'STP-RMV-EA-48', 40, 48),
      stumps36,
      payItem('s30', 'STP-RMV-EA-30', 30, 34),
      payItem('old', 'STP-RMV-EA-OLD', 36.1, 39.9, true),
      payItem('none', 'STP-FILL-CY', null, null),
    ]);
    expect(stumps.standing()).toEqual({
      overlaps: ['Stumps: STP-RMV-EA-36 (24–36 in) overlaps STP-RMV-EA-30 (30–34 in).'],
      gaps: [
        'Stumps: 36.1–39.9 in falls in no band; a measurement there gets no pay item and is flagged.',
      ],
    });
  });
});

describe('a band that is no band', () => {
  it('is refused when its ends aren’t inches to a tenth, nought or more, or run backwards', () => {
    const stumps = new SizeBands('Stumps', []);
    expect(stumps.check(payItem('new', 'STP-RMV-EA-36', 24.05, 36)).refusal).toEqual({
      code: 'SIZE_BAND_INVALID',
      message: "STP-RMV-EA-36: a band's ends are inches to a tenth, nought or more: 24.05.",
      overlaps: [],
    });
    expect(stumps.check(payItem('new', 'STP-RMV-EA-36', -1, 36)).refusal?.code).toBe(
      'SIZE_BAND_INVALID',
    );
    expect(stumps.check(payItem('new', 'STP-RMV-EA-36', 36, 24)).refusal?.message).toBe(
      'STP-RMV-EA-36: a band runs from its lower end to its higher: 36–24 in.',
    );
  });
});

describe('the pay item a piece of unit rate work falls to', () => {
  const leaners = new SizeBands('Leaners', [leaners24, leaners99]);
  const stumps48 = payItem('s48', 'STP-RMV-EA-48', 36.1, 48);
  const stumps = new SizeBands('Stumps', [stumps36, stumps48]);
  const hangers = payItem('hng', 'HNG-RMV-EA', null, null);

  it('AC-04-59 ticket 301002: a circumference of 56.5 in is 18.0 in across, in band 6–24: LNR-RMV-EA-24', () => {
    expect(leaners.payItemFor({ inches: 56.5, measuredAs: 'CIRCUMFERENCE' })).toEqual({
      payItem: leaners24,
      diameterInches: 18,
    });
  });

  it('AC-04-59 ticket 301004: a stump 30 in across is in band 24–36: STP-RMV-EA-36', () => {
    expect(stumps.payItemFor({ inches: 30, measuredAs: 'DIAMETER' })).toEqual({
      payItem: stumps36,
      diameterInches: 30,
    });
  });

  it('AC-04-59 ticket 301005: a stump 20 in across is in no band: no pay item', () => {
    expect(stumps.payItemFor({ inches: 20, measuredAs: 'DIAMETER' })).toEqual({
      payItem: null,
      diameterInches: 20,
    });
  });

  it('AC-04-59 a band holds both its ends: 24 in is the lower band, 24.1 in the upper', () => {
    const at = (inches: number) =>
      leaners.payItemFor({ inches, measuredAs: 'DIAMETER' }).payItem?.code;
    expect([6, 24, 24.1, 99].map(at)).toEqual([
      'LNR-RMV-EA-24',
      'LNR-RMV-EA-24',
      'LNR-RMV-EA-99',
      'LNR-RMV-EA-99',
    ]);
    expect([5.9, 99.1].map(at)).toEqual([undefined, undefined]);
  });

  it('AC-04-59 a circumference is ÷ 3.14, rounded half up to a tenth, before the bands read it', () => {
    const across = (inches: number) => SizeBands.diameter({ inches, measuredAs: 'CIRCUMFERENCE' });
    // 75.3 ÷ 3.14 = 23.98; 75.6 ÷ 3.14 = 24.08; 7.7 ÷ 3.14 = 2.452.
    expect([56.5, 75.3, 75.6, 7.7].map(across)).toEqual([18, 24, 24.1, 2.5]);
    expect(leaners.payItemFor({ inches: 75.6, measuredAs: 'CIRCUMFERENCE' }).payItem).toBe(
      leaners99,
    );
  });

  it('AC-04-59 the same measurement and bands always give the same pay item, in any order', () => {
    const turned = new SizeBands('Leaners', [leaners99, leaners24]);
    for (const inches of [6, 18, 24, 24.1, 60, 120]) {
      const measurement = { inches, measuredAs: 'DIAMETER' } as const;
      expect(turned.payItemFor(measurement)).toEqual(leaners.payItemFor(measurement));
    }
  });

  it('AC-04-59 ticket 301001: a payable type with one pay item is that pay item, measured or not', () => {
    const one = new SizeBands('Hangers', [hangers]);
    expect(one.payItemFor(null)).toEqual({ payItem: hangers, diameterInches: null });
    expect(one.payItemFor({ inches: 3, measuredAs: 'DIAMETER' }).payItem).toBe(hangers);
    // A lone pay item's band only flags work outside it (ADR-210).
    expect(
      new SizeBands('Leaners', [leaners24]).payItemFor({ inches: 40, measuredAs: 'DIAMETER' })
        .payItem,
    ).toBe(leaners24);
  });

  it('AC-04-59 several pay items and nothing measured: no pay item; one taken off no longer counts', () => {
    expect(leaners.payItemFor(null)).toEqual({ payItem: null, diameterInches: null });
    const archived = payItem('l99', 'LNR-RMV-EA-99', 24.1, 99, true);
    const left = new SizeBands('Leaners', [leaners24, archived]);
    expect(left.payItemFor({ inches: 40, measuredAs: 'DIAMETER' }).payItem).toBe(leaners24);
    expect(new SizeBands('Leaners', []).payItemFor(null).payItem).toBeNull();
  });
});
