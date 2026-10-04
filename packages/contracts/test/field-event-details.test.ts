// What each kind of field event records, at the contracts package (spec/acceptance/04-field-capture.md
// AC-04-37, 46, 54, 67; ADR-325; REQ-103): refused here before the database refuses it.
import { describe, expect, it } from 'vitest';

import { fieldEventDetailsSchema } from '../src/index.ts';

const vegetative = '019a0000-0000-7000-8000-000000000a01';

// Where a payload is refused, and why.
const refusals = (payload: unknown): string[] => {
  const result = fieldEventDetailsSchema.safeParse(payload);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('a field event’s details', () => {
  it('AC-04-46 a split collection has its suffix and its estimate, both or neither', () => {
    expect(
      refusals({
        kind: 'COLLECTION',
        splitSuffix: 'A',
        estimateCy: 12,
        formDebrisTypeId: vegetative,
        roeNumber: 'R-0007',
      }),
    ).toEqual([]);
    expect(refusals({ kind: 'COLLECTION', splitSuffix: '' })).toEqual([]);
    expect(refusals({ kind: 'COLLECTION', splitSuffix: 'A' })).toEqual([
      "estimateCy: Split collection -A has no estimate: a split load's property has both.",
    ]);
    expect(refusals({ kind: 'COLLECTION', splitSuffix: '', estimateCy: 18 })).toEqual([
      "splitSuffix: An estimate belongs to a split load's property: this collection has no split suffix.",
    ]);
    expect(refusals({ kind: 'DISPOSAL', splitSuffix: '', estimateCy: 18 })).toEqual([
      "estimateCy: A disposal doesn't record an estimate.",
    ]);
  });

  it('AC-04-54 a pile’s haul-out collection gives its load call so far, never an estimate', () => {
    expect(refusals({ kind: 'HAUL_OUT_COLLECTION', splitSuffix: 'B', loadCall: 35 })).toEqual([]);
    expect(refusals({ kind: 'HAUL_OUT_COLLECTION', splitSuffix: 'B', estimateCy: 27.5 })).toEqual([
      "estimateCy: A haul-out collection doesn't record an estimate.",
    ]);
  });

  it('AC-04-37 a load call is a whole number from 0 to 100, and may be missing', () => {
    for (const loadCall of [0, 80, 100, null, undefined]) {
      expect(refusals({ kind: 'DISPOSAL', splitSuffix: '', loadCall }), String(loadCall)).toEqual(
        [],
      );
    }
    for (const loadCall of [101, -1, 80.5]) {
      expect(
        refusals({ kind: 'DISPOSAL', splitSuffix: '', loadCall }).length,
        String(loadCall),
      ).toBe(1);
    }
    expect(refusals({ kind: 'COLLECTION', splitSuffix: '', loadCall: 50 })).toEqual([
      "loadCall: A collection doesn't record a load call.",
    ]);
  });

  it('AC-04-67 a detail of another kind, a field nobody defined and a negative or over-fine number are refused', () => {
    expect(refusals({ kind: 'UNIT_RATE', splitSuffix: '', formDebrisTypeId: vegetative })).toEqual([
      "formDebrisTypeId: A unit rate event doesn't record a debris type.",
    ]);
    expect(
      refusals({
        kind: 'UNIT_RATE',
        splitSuffix: '',
        measurementInches: 56.5,
        measuredAs: 'CIRCUMFERENCE',
        unitCount: 1,
        markedIneligible: false,
      }),
    ).toEqual([]);
    expect(refusals({ kind: 'UNIT_RATE', splitSuffix: '', measurementInches: 56.5 })).toEqual([
      'measuredAs: A measurement says whether it was read as a circumference or a diameter, and only a measurement does.',
    ]);
    expect(refusals({ kind: 'UNIT_RATE', splitSuffix: '', rate: 68 }).length).toBe(1);
    expect(refusals({ kind: 'UNIT_RATE', splitSuffix: '', unitCount: -1 }).length).toBe(1);
    expect(
      refusals({
        kind: 'UNIT_RATE',
        splitSuffix: '',
        measurementInches: 56.55,
        measuredAs: 'DIAMETER',
      }).length,
    ).toBe(1);
  });
});
