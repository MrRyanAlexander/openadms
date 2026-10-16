// The records a phone sends at a sync, at the contracts package (spec/acceptance/05-sync.md
// AC-05-11, 14, 36…39; spec/acceptance/10-api-and-sync.md AC-10-35, 36; AC-04-26, 37, 46;
// T-12; BACKLOG 2.6.1 parts 1 and 3; ADR-052, 329, 466, 469; REQ-004): what each kind of record
// can be at all, and that nothing else is refused.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  certificationBoxesAtMost,
  certificationHelpersAtMost,
  syncedCertificationSchema,
  syncedDropOffLogSchema,
  syncedFieldEventSchema,
  syncedIncidentSchema,
  syncedRecordKinds,
  syncedRecordSchema,
  syncedRoeSchema,
  syncedScaleReceiptSchema,
  syncedSurveySchema,
  type SyncedCertification,
  type SyncedFieldEvent,
} from '../src/index.ts';
import {
  certification,
  collection,
  crew,
  disposal,
  lee,
  made,
  records,
} from '../src/sync-examples.ts';

const refusals = (schema: z.ZodType, payload: unknown): string[] => {
  const result = schema.safeParse(payload);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};
const taken = (payload: unknown): boolean => syncedFieldEventSchema.safeParse(payload).success;

// Every field name a schema takes, however deep.
function fieldNames(schema: z.ZodType): string[] {
  const names = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const each of node) walk(each);
    } else if (typeof node === 'object' && node !== null) {
      const { properties, ...rest } = node as { properties?: Record<string, unknown> };
      for (const [name, of] of Object.entries(properties ?? {})) {
        names.add(name);
        walk(of);
      }
      for (const of of Object.values(rest)) walk(of);
    }
  };
  walk(z.toJSONSchema(schema, { io: 'input' }));
  return [...names].sort();
}

describe('the records a phone sends', () => {
  it('AC-10-36, AC-05-14 each kind of record has its schema, named by its kind; a time travels as a UTC instant and is read as one', () => {
    expect(records.map((sent) => sent.record)).toEqual([...syncedRecordKinds]);
    for (const sent of records) {
      expect(refusals(syncedRecordSchema, sent), sent.record).toEqual([]);
    }
    const read = syncedRecordSchema.parse({ record: 'FIELD_EVENT', fieldEvent: collection });
    if (read.record !== 'FIELD_EVENT') throw new Error('Not a field event.');
    expect(read.fieldEvent.startedAt).toEqual(new Date('2026-10-12T13:05:00Z'));
    expect(read.fieldEvent.id).toBe(collection.id);
    // A time with no zone, or in the phone's own, isn't an instant: the offset travels beside it.
    for (const startedAt of ['2026-10-12T09:05:00', '2026-10-12T09:05:00-04:00', '12 Oct 2026']) {
      expect(taken({ ...collection, startedAt }), startedAt).toBe(false);
    }
    // A record of no kind the contract has, and a kind with another kind's record.
    expect(syncedRecordSchema.safeParse({ record: 'COMPLETED_LOAD', load: {} }).success).toBe(
      false,
    );
    expect(
      syncedRecordSchema.safeParse({ record: 'SCALE_RECEIPT', fieldEvent: collection }).success,
    ).toBe(false);
  });

  it('AC-10-35 no record names a conclusion, money, a certified capacity, or the phone it is from: such a field is refused, never dropped', () => {
    const names = fieldNames(syncedRecordSchema);
    const never =
      /status|zone|mileage|flag|rate|amount|price|total|capacityCy$|completed|transaction|reconciled|workedOut|receivedAt|certificationId|roeId|deviceId|^source$|createdBy|formId$|quarantin|qc|invoice|void/i;
    expect(names.filter((name) => never.test(name) && name !== 'typedCapacityCy')).toEqual([]);
    // The one capacity a phone may say: what the monitor read off a truck keyed in by hand.
    expect(names).toContain('typedCapacityCy');
    for (const forged of [
      { status: 'COMPLETED' },
      { capacityCy: 60 },
      { amount: 1260 },
      { rate: 21 },
      { zoneId: made('99') },
      { receivedAt: '2026-10-12T14:00:00.000Z' },
      { certificationId: made('98') },
      { deviceId: made('97') },
      { source: 'BACK_OFFICE' },
    ]) {
      const [name] = Object.keys(forged);
      expect(refusals(syncedFieldEventSchema, { ...disposal, ...forged }), name).toEqual([
        `: Unrecognized key: "${String(name)}"`,
      ]);
    }
    for (const [schema, sent] of [
      [syncedScaleReceiptSchema, records[1]?.record === 'SCALE_RECEIPT' && records[1].scaleReceipt],
      [syncedIncidentSchema, records[2]?.record === 'INCIDENT' && records[2].incident],
      [syncedDropOffLogSchema, records[3]?.record === 'DROP_OFF_LOG' && records[3].dropOffLog],
      [syncedSurveySchema, records[4]?.record === 'SURVEY' && records[4].survey],
      [syncedRoeSchema, records[5]?.record === 'ROE' && records[5].roe],
      [syncedCertificationSchema, certification],
    ] as const) {
      expect(refusals(schema, sent)).toEqual([]);
      expect(refusals(schema, { ...sent, deviceId: made('97') })).toEqual([
        ': Unrecognized key: "deviceId"',
      ]);
    }
  });

  it('AC-10-35, AC-03-01, 02 a certification made on a phone is a record of its own kind: its measured boxes and never a capacity, its number as written, nothing the back office marks', () => {
    const refused = (more: Record<string, unknown>, from = certification): string[] =>
      refusals(syncedCertificationSchema, { ...from, ...more });
    expect(refused({})).toEqual([]);
    expect(refused({}, crew)).toEqual([]);
    const read = syncedRecordSchema.parse({ record: 'CERTIFICATION', certification });
    if (read.record !== 'CERTIFICATION') throw new Error('Not a certification.');
    expect(read.certification.certifiedAt).toEqual(new Date('2026-10-10T13:40:00Z'));
    expect(read.certification.boxes).toHaveLength(2);
    // Nobody sends a capacity, a QC status, signatures on file, a revocation, who the subs
    // are, or the phone: each is refused, never dropped.
    for (const forged of [
      { capacityCy: 65 },
      { qcStatus: 'QC_APPROVED' },
      { signaturesOnFile: true },
      { revokedFrom: '2026-10-14' },
      { firstTierSubId: made('a3') },
      { receivedAt: '2026-10-10T14:00:00.000Z' },
      { deviceId: made('97') },
      { source: 'BACK_OFFICE' },
    ]) {
      const [name] = Object.keys(forged);
      expect(refused(forged), name).toEqual([`: Unrecognized key: "${String(name)}"`]);
    }
    const [primary, feature] = certification.boxes;
    if (primary === undefined || feature === undefined) throw new Error('No boxes.');
    expect(refused({ boxes: [{ ...primary, cubicInches: '2331648.00' }] })).toEqual([
      'boxes.0: Unrecognized key: "cubicInches"',
    ]);
    // The number is one number, as written: typed off a pre-printed sheet it need not be the
    // series' (ADR-045), and it is never trimmed; blank is no number.
    expect(
      syncedCertificationSchema.parse({ ...certification, certNumber: ' 88120' }).certNumber,
    ).toBe(' 88120');
    for (const certNumber of ['', '   ', '7'.repeat(41), 730416]) {
      expect(refused({ certNumber }), JSON.stringify(certNumber)).not.toEqual([]);
    }
    // A sub is typed by name; a modified truck names the certification it replaces, and why.
    expect(
      refused({ firstTierSub: 'Rivera Trucking', secondTierSub: 'Tidewater Hauling' }),
    ).toEqual([]);
    expect(refused({ replaces: { replacedId: made('8a'), reason: 'Sideboards added' } })).toEqual(
      [],
    );
    expect(refused({ replaces: { replacedId: '730416', reason: 'Sideboards added' } })).toEqual([
      'replaces.replacedId: Invalid UUID',
    ]);
    expect(refused({ replaces: { replacedId: made('8a') } })).toHaveLength(1);
  });

  it('AC-03-26, 36 what a certification can be at all: whole inches, a feature on every box but the primary, a vehicle type picked or typed, a crew type on a crew, a helper once, every list with an end', () => {
    const refused = (
      more: Partial<Record<keyof SyncedCertification, unknown>>,
      from = certification,
    ) => refusals(syncedCertificationSchema, { ...from, ...more });
    const [primary, feature] = certification.boxes;
    if (primary === undefined || feature === undefined) throw new Error('No boxes.');
    // Whether the boxes give a capacity is the domain's rule, asked by the server: a crew with
    // a box, a container with none and a radius corner that adds are all read here.
    expect(refused({ boxes: [primary] }, crew)).toEqual([]);
    expect(refused({ boxes: [] })).toEqual([]);
    expect(
      refused({
        boxes: [
          primary,
          { ...feature, shape: 'RADIUS_CORNER', sign: 'ADD', radius: 12, run: 60, corners: 2 },
        ],
      }),
    ).toEqual([]);
    expect(refused({ boxes: [{ ...primary, length: 264.5 }] })).toEqual([
      'boxes.0.length: Invalid input: expected int, received number',
    ]);
    expect(refused({ boxes: [{ ...primary, width: 0 }] })).toEqual([
      'boxes.0.width: Too small: expected number to be >=1',
    ]);
    expect(refused({ boxes: [{ ...primary, height: 10_000 }] })).toHaveLength(1);
    expect(refused({ boxes: [{ ...primary, shape: 'CYLINDER' }] })).toHaveLength(1);
    expect(refused({ boxes: [{ ...primary, sign: 'MULTIPLY' }] })).toHaveLength(1);
    expect(refused({ boxes: [primary, { ...feature, corners: 100 }] })).toHaveLength(1);
    expect(refused({ boxes: [{ ...primary, featureOther: 'Interior' }] })).toEqual([
      'boxes.0: The primary box is the main interior: it has no feature.',
    ]);
    expect(refused({ boxes: [primary, { ...feature, featureId: null }] })).toEqual([
      'boxes.1: A box after the primary is a feature, picked or typed.',
    ]);
    expect(refused({ boxes: [primary, { ...feature, featureOther: 'Dog box' }] })).toEqual([
      'boxes.1: A box after the primary is a feature, picked or typed.',
    ]);
    expect(
      refused({ boxes: [primary, { ...feature, featureId: null, featureOther: 'Dog box' }] }),
    ).toEqual([]);
    expect(refused({ vehicleTypeOther: 'Self-loader' })).toEqual([
      'vehicleTypeOther: A vehicle type is picked or typed, never both.',
    ]);
    expect(refused({ crewTypeId: made('f6') })).toEqual([
      'crewTypeId: A container has no crew type.',
    ]);
    expect(refused({ helperIds: [lee, lee] })).toEqual(['helperIds: A helper is picked once.']);
    expect(refused({ helperIds: ['Lee Morgan'] })).toHaveLength(1);
    const many = <T>(count: number, each: (at: number) => T): T[] =>
      Array.from({ length: count }, (_, at) => each(at));
    expect(
      refused({ boxes: [primary, ...many(certificationBoxesAtMost - 1, () => feature)] }),
    ).toEqual([]);
    expect(
      refused({ boxes: [primary, ...many(certificationBoxesAtMost, () => feature)] }),
    ).toHaveLength(1);
    expect(
      refused({ helperIds: many(certificationHelpersAtMost + 1, (at) => made(`c${String(at)}`)) }),
    ).toHaveLength(1);
    for (const value of [
      { kind: 'VEHICLE' },
      { primeId: 'Coastline Haulers LLC' },
      { certifiedById: 'M004131' },
      { assignmentId: null },
      { firstTierSub: 'x'.repeat(201) },
      { driverName: 'x'.repeat(201) },
      { tagExpiry: '31 March 2027' },
      { driverLicenceExpiry: '2028-03-31T00:00:00Z' },
      { certifiedAt: '2026-10-10T09:40:00-04:00' },
      { deviceUtcOffsetMinutes: 841 },
      { notes: 'x'.repeat(2001) },
    ] satisfies Partial<Record<keyof SyncedCertification, unknown>>[]) {
      expect(refused(value), JSON.stringify(value)).not.toEqual([]);
    }
  });

  it('AC-05-38 a record with a gap is one: no debris type, no load call, a typed number with no reason, an end before its start, no site', () => {
    expect(taken({ ...collection, formDebrisTypeId: null })).toBe(true);
    expect(taken({ ...disposal, loadCall: null, siteId: null })).toBe(true);
    expect(taken({ ...collection, numberTyped: true, numberTypedReasonId: null })).toBe(true);
    expect(
      taken({
        ...collection,
        startedAt: '2026-10-12T13:40:00.000Z',
        endedAt: '2026-10-12T13:05:00.000Z',
      }),
    ).toBe(true);
    expect(
      taken({
        ...collection,
        workflow: 'UNIT_RATE',
        kind: 'UNIT_RATE',
        formDebrisTypeId: null,
        kindOfWorkId: null,
        payableTypeId: null,
      }),
    ).toBe(true);
  });

  it('AC-05-39 a GPS fix that couldn’t be one is taken as sent, and a ticket number that isn’t digits: the server keeps both and flags them', () => {
    for (const fix of [
      { endLatitude: '39.15650000', endLongitude: null },
      { endLatitude: '95.00000000', endLongitude: '-75.52330000' },
      { endLatitude: 'north', endLongitude: '-75.5' },
      { startLatitude: null, startLongitude: null, endLatitude: null, endLongitude: null },
    ]) {
      expect(taken({ ...collection, ...fix }), JSON.stringify(fix)).toBe(true);
    }
    const { startLatitude, startLongitude, ...noStart } = collection;
    expect([startLatitude, startLongitude, taken(noStart)]).toEqual([
      '39.15650000',
      '-75.52330000',
      true,
    ]);
    expect(taken({ ...collection, ticketNumber: '10I0O1' })).toBe(true);
    // Kept as sent: nothing is trimmed off a number.
    expect(syncedFieldEventSchema.parse({ ...collection, certNumber: ' 730415' }).certNumber).toBe(
      ' 730415',
    );
    // A float is never a coordinate (invariant 15).
    expect(taken({ ...collection, endLatitude: 39.1565 })).toBe(false);
  });

  it('AC-04-26, 37, 46 what a value can be at all: a load call 0 to 100, a typed capacity a whole number, a detail only on its kind, a split’s suffix with its estimate', () => {
    expect(taken({ ...disposal, loadCall: 0 })).toBe(true);
    expect(taken({ ...disposal, certKeyedByHand: true, typedCapacityCy: 60 })).toBe(true);
    expect(refusals(syncedFieldEventSchema, { ...disposal, loadCall: 140 })).toEqual([
      'loadCall: Too big: expected number to be <=100',
    ]);
    expect(taken({ ...disposal, loadCall: 80.5 })).toBe(false);
    expect(taken({ ...disposal, typedCapacityCy: 60.5 })).toBe(false);
    expect(refusals(syncedFieldEventSchema, { ...collection, loadCall: 50 })).toEqual([
      "loadCall: A collection doesn't record a load call.",
    ]);
    expect(taken({ ...collection, splitSuffix: 'A', estimateCy: 12.5 })).toBe(true);
    expect(refusals(syncedFieldEventSchema, { ...collection, splitSuffix: 'A' })).toEqual([
      "estimateCy: Split collection -A has no estimate: a split load's property has both.",
    ]);
    expect(taken({ ...collection, splitSuffix: 'A', estimateCy: 12.55 })).toBe(false);
  });

  it('every value is bounded: an id is an id, words, lines and numbers have an end, and an offset is one a clock can have', () => {
    const tooFar: Partial<Record<keyof SyncedFieldEvent, unknown>>[] = [
      { id: '101001' },
      { projectId: 'P1' },
      { monitorId: 'M004127' },
      { ticketNumber: '' },
      { ticketNumber: '1'.repeat(41) },
      { notes: 'x'.repeat(2001) },
      { address: 'x'.repeat(2001) },
      { endLatitude: '3'.repeat(41) },
      { setupVersion: 0 },
      { setupVersion: 1.5 },
      { deviceUtcOffsetMinutes: 841 },
      { deviceUtcOffsetMinutes: -721 },
      { carriedCount: -1 },
      { workflow: 'ROE' },
      { kind: 'COMPLETED_LOAD' },
      { addressSource: 'GUESSED' },
      { masterPasscodeSession: 'SUPERVISOR' },
      { masterPasscodeSession: false },
      { carriedTickets: Array.from({ length: 101 }, (_, at) => String(101_100 + at)) },
      { items: Array.from({ length: 101 }, () => ({ itemNameId: made('aa'), quantity: 1 })) },
      { items: [{ itemNameId: made('aa'), quantity: 1.005 }] },
      { items: [{ itemNameId: made('aa'), quantity: -1 }] },
      { items: [{ itemNameId: made('aa'), quantity: 1, rate: 85 }] },
    ];
    const crewTime = { ...collection, workflow: 'UNIT_RATE', kind: 'UNIT_RATE' } as const;
    expect(taken({ ...crewTime, formDebrisTypeId: null })).toBe(true);
    for (const value of tooFar) {
      expect(taken({ ...crewTime, formDebrisTypeId: null, ...value }), JSON.stringify(value)).toBe(
        false,
      );
    }
    // A split's suffix is four letters at most.
    expect(taken({ ...collection, splitSuffix: 'ABCD', estimateCy: 12 })).toBe(true);
    expect(taken({ ...collection, splitSuffix: 'ABCDE', estimateCy: 12 })).toBe(false);
    const [, receipt, , , survey, roe] = records;
    if (receipt?.record !== 'SCALE_RECEIPT' || survey?.record !== 'SURVEY' || roe?.record !== 'ROE')
      throw new Error('The records are out of order.');
    for (const value of [
      { netWeightLb: -1 },
      { netWeightLb: 28_140.005 },
      { netWeightTons: 14.07001 },
      { grossWeightLb: 10_000_000_000 },
      { receiptNumber: '' },
    ]) {
      expect(
        syncedScaleReceiptSchema.safeParse({ ...receipt.scaleReceipt, ...value }).success,
        JSON.stringify(value),
      ).toBe(false);
    }
    // The firm's own fields: an answer is text, a number, yes or no; never a record of its own.
    for (const answers of [
      { fence: { standing: true } },
      { fence: ['Standing'] },
      { fence: null },
      { fence: 'x'.repeat(4001) },
      Object.fromEntries(Array.from({ length: 201 }, (_, at) => [`field${String(at)}`, true])),
    ]) {
      expect(syncedSurveySchema.safeParse({ ...survey.survey, answers }).success).toBe(false);
    }
    for (const signedDate of ['2026-10-09T00:00:00Z', '9 October 2026', '2026-13-01']) {
      expect(syncedRoeSchema.safeParse({ ...roe.roe, signedDate }).success, signedDate).toBe(false);
    }
  });
});
