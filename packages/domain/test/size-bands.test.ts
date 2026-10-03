// The size bands of one payable type's pay items, at the domain (spec/acceptance/01-setup.md
// AC-01-45, AC-01-46; ADR-210, 213, 217, 309). The bands are P1's as the golden mission §1 sets
// them up: Leaners 6–24 and 24.1–99 in, Stumps 24–36 and 36.1–48 in. Which pay item a measurement
// falls in is the phone's (Phase 3) and the worker's (1.5.7) to work out from them.
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
