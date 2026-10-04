// What each kind of field event records, at the domain (spec/acceptance/04-field-capture.md
// AC-04-34, 46, 54, 58, 67, 75; spec/DATA-MODEL.md §4.1 (2); ADR-325, 326). The database holds the same
// with its own checks (packages/db/test/field-event-kinds.test.ts compares the two).
import { describe, expect, it } from 'vitest';

import {
  FieldEventDetails,
  fieldEventKinds,
  type DetailRefusal,
  type FieldEventKindName,
  type RecordedDetails,
} from '../src/index.ts';

type Recorded = RecordedDetails & { kind: FieldEventKindName };

const refusals = ({ kind, ...details }: Recorded): DetailRefusal[] =>
  new FieldEventDetails(kind).refusals(details);
const codes = (details: Recorded): string[] =>
  refusals(details).map((refusal) => `${refusal.code} ${refusal.detail}`);

describe('what each kind records', () => {
  it('is the table of spec/DATA-MODEL.md §4.1 (2), kind by kind', () => {
    expect(
      Object.fromEntries(
        fieldEventKinds.map((kind) => [kind, new FieldEventDetails(kind).recorded()]),
      ),
    ).toEqual({
      COLLECTION: ['formDebrisTypeId', 'fieldTagId', 'roeNumber', 'roeId', 'estimateCy'],
      DISPOSAL: ['formDebrisTypeId', 'loadCall', 'scaleReceiptId', 'carriedCount'],
      HAUL_OUT_COLLECTION: ['formDebrisTypeId', 'fieldTagId', 'loadCall'],
      HAUL_OUT_DISPOSAL: ['formDebrisTypeId', 'scaleReceiptId'],
      UNIT_RATE: [
        'fieldTagId',
        'roeNumber',
        'roeId',
        'kindOfWorkId',
        'payableTypeId',
        'payItemId',
        'unitCount',
        'measurementInches',
        'measuredAs',
        'rootBallInches',
        'rootBallHalfExposed',
        'surveyNumber',
        'markedIneligible',
      ],
    });
  });

  it('AC-04-34 a collection takes a field tag and a disposal none', () => {
    expect(codes({ kind: 'COLLECTION', splitSuffix: '', fieldTagId: 'mixed' })).toEqual([]);
    expect(refusals({ kind: 'DISPOSAL', splitSuffix: '', fieldTagId: 'mixed' })).toEqual([
      {
        code: 'NOT_THIS_KINDS',
        detail: 'fieldTagId',
        message: "A disposal doesn't record a field tag.",
      },
    ]);
    expect(codes({ kind: 'HAUL_OUT_DISPOSAL', splitSuffix: '', fieldTagId: 'mixed' })).toEqual([
      'NOT_THIS_KINDS fieldTagId',
    ]);
  });

  it('AC-04-67 unit rate work holds no debris type, load call or estimate, and a load no measurement, root ball, count, payable type or pay item', () => {
    expect(
      codes({
        kind: 'UNIT_RATE',
        splitSuffix: '',
        formDebrisTypeId: 'vegetative',
        loadCall: 80,
        estimateCy: 12,
        fieldTagId: 'mixed',
        roeNumber: 'R-0007',
      }),
    ).toEqual([
      'NOT_THIS_KINDS formDebrisTypeId',
      'NOT_THIS_KINDS estimateCy',
      'NOT_THIS_KINDS loadCall',
    ]);
    expect(
      codes({
        kind: 'DISPOSAL',
        splitSuffix: '',
        loadCall: 80,
        measurementInches: 18,
        measuredAs: 'DIAMETER',
        rootBallInches: 96,
        unitCount: 1,
        payableTypeId: 'leaners',
        payItemId: 'LNR-RMV-EA-24',
      }),
    ).toEqual([
      'NOT_THIS_KINDS payableTypeId',
      'NOT_THIS_KINDS payItemId',
      'NOT_THIS_KINDS unitCount',
      'NOT_THIS_KINDS measurementInches',
      'NOT_THIS_KINDS measuredAs',
      'NOT_THIS_KINDS rootBallInches',
    ]);
  });

  it('AC-04-75 only a disposal and a haul-out disposal point at a scale receipt', () => {
    for (const kind of ['DISPOSAL', 'HAUL_OUT_DISPOSAL'] as const) {
      expect(codes({ kind, splitSuffix: '', scaleReceiptId: 'CCL-51207' }), kind).toEqual([]);
    }
    for (const kind of ['COLLECTION', 'HAUL_OUT_COLLECTION', 'UNIT_RATE'] as const) {
      expect(codes({ kind, splitSuffix: '', scaleReceiptId: 'CCL-51207' }), kind).toEqual([
        'NOT_THIS_KINDS scaleReceiptId',
      ]);
    }
    expect(
      refusals({ kind: 'HAUL_OUT_COLLECTION', splitSuffix: '', scaleReceiptId: 'CCL-51207' }),
    ).toEqual([
      {
        code: 'NOT_THIS_KINDS',
        detail: 'scaleReceiptId',
        message: "A haul-out collection doesn't record a scale receipt.",
      },
    ]);
    // One quantity is the phone's question; a record that holds a load call and a receipt, or a
    // count and a receipt, is still a record (AC-04-39).
    expect(
      codes({
        kind: 'DISPOSAL',
        splitSuffix: '',
        loadCall: 60,
        carriedCount: 3,
        scaleReceiptId: 'BCL-88241',
      }),
    ).toEqual([]);
  });

  it('a detail that is null was not recorded', () => {
    expect(
      codes({ kind: 'DISPOSAL', splitSuffix: '', estimateCy: null, fieldTagId: null }),
    ).toEqual([]);
  });
});

describe('a split', () => {
  it('AC-04-46 a collection has its suffix and its estimate, both or neither', () => {
    expect(codes({ kind: 'COLLECTION', splitSuffix: 'A', estimateCy: 12 })).toEqual([]);
    expect(codes({ kind: 'COLLECTION', splitSuffix: '' })).toEqual([]);
    expect(refusals({ kind: 'COLLECTION', splitSuffix: 'B' })).toEqual([
      {
        code: 'SPLIT_INCOMPLETE',
        detail: 'estimateCy',
        message: "Split collection -B has no estimate: a split load's property has both.",
      },
    ]);
    expect(refusals({ kind: 'COLLECTION', splitSuffix: '', estimateCy: 18 })).toEqual([
      {
        code: 'SPLIT_INCOMPLETE',
        detail: 'splitSuffix',
        message:
          "An estimate belongs to a split load's property: this collection has no split suffix.",
      },
    ]);
    // Nought is an estimate.
    expect(codes({ kind: 'COLLECTION', splitSuffix: 'A', estimateCy: 0 })).toEqual([]);
  });

  it('AC-04-54 a pile’s haul-out collection carries a suffix with its load call, never an estimate', () => {
    expect(codes({ kind: 'HAUL_OUT_COLLECTION', splitSuffix: 'A', loadCall: 10 })).toEqual([]);
    expect(codes({ kind: 'HAUL_OUT_COLLECTION', splitSuffix: 'A', estimateCy: 11 })).toEqual([
      'NOT_THIS_KINDS estimateCy',
    ]);
  });

  it('only a collection and a haul-out collection have a suffix, and it is capital letters', () => {
    for (const kind of ['DISPOSAL', 'HAUL_OUT_DISPOSAL', 'UNIT_RATE'] as const) {
      expect(codes({ kind, splitSuffix: 'A' }), kind).toEqual(['NOT_THIS_KINDS splitSuffix']);
    }
    for (const suffix of ['a', '-A', 'A1', ' A', '1']) {
      expect(codes({ kind: 'HAUL_OUT_COLLECTION', splitSuffix: suffix }), suffix).toEqual([
        'SUFFIX_NOT_LETTERS splitSuffix',
      ]);
    }
    // A 27th property.
    expect(new FieldEventDetails('COLLECTION').isSuffix('AA')).toBe(true);
  });
});

describe('a measurement', () => {
  it('AC-04-58 says whether it was read as a circumference or a diameter, and only a measurement does', () => {
    const leaner = { kind: 'UNIT_RATE', splitSuffix: '' } as const;
    expect(codes({ ...leaner, measurementInches: 56.5, measuredAs: 'CIRCUMFERENCE' })).toEqual([]);
    expect(codes({ ...leaner })).toEqual([]);
    expect(codes({ ...leaner, measurementInches: 56.5 })).toEqual([
      'MEASUREMENT_INCOMPLETE measuredAs',
    ]);
    expect(codes({ ...leaner, measuredAs: 'DIAMETER' })).toEqual([
      'MEASUREMENT_INCOMPLETE measurementInches',
    ]);
  });

  it('AC-04-82 the ROE a number found belongs where the number does: on a collection and on unit rate work', () => {
    for (const kind of ['COLLECTION', 'UNIT_RATE'] as const) {
      expect(codes({ kind, splitSuffix: '', roeNumber: 'R-0007', roeId: 'r-0007' }), kind).toEqual(
        [],
      );
    }
    // A number that found no ROE is taken as it is (R-0099, which P2 doesn't have).
    expect(codes({ kind: 'COLLECTION', splitSuffix: '', roeNumber: 'R-0099' })).toEqual([]);
    for (const kind of ['DISPOSAL', 'HAUL_OUT_COLLECTION', 'HAUL_OUT_DISPOSAL'] as const) {
      expect(codes({ kind, splitSuffix: '', roeId: 'r-0007' }), kind).toEqual([
        'NOT_THIS_KINDS roeId',
      ]);
    }
  });
});
