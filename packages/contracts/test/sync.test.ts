// One sync, whole, at the contracts package (spec/acceptance/05-sync.md AC-05-03, 15, 20, 45…47;
// spec/acceptance/10-api-and-sync.md AC-10-35, 36, 37; T-12; BACKLOG 2.6.1 part 2, C69, C84 (9),
// C122, C126, C127; ADR-022, 052, 065, 100, 457, 464, 467; REQ-004, 203): what a phone sends and
// what it is answered, each record read on its own.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  lastUsedSchema,
  recordAnswerSchema,
  recordRead,
  syncAnsweredSchema,
  syncPasscodeUsesAtMost,
  syncRecordsAtMost,
  syncSentSchema,
  syncSeriesAtMost,
  syncUnplannedAssignmentsAtMost,
  type RecordAnswer,
  type SyncAnswered,
  type SyncSent,
} from '../src/index.ts';
import {
  ana,
  assignment,
  collection,
  disposal,
  kim,
  landfill,
  made,
  p1,
  records,
} from './support/synced.ts';

// Tariq had no assignment on Monday: the tower's phone was set up for him under the passcode.
const unplanned = {
  id: made('c2'),
  projectId: p1,
  personId: made('b3'),
  fieldEventKinds: ['DISPOSAL' as const],
  certifying: false,
  formDocumentTypes: [],
  siteId: landfill,
  payItemIds: [],
  occasion: 'SETUP' as const,
  madeAt: '2026-10-12T11:50:00.000Z',
  deviceUtcOffsetMinutes: -240,
};

// The phone passed to Kim, who has her own assignment, with no connection.
const switched = {
  id: made('c3'),
  use: 'MONITOR_SWITCH' as const,
  personId: kim,
  loggedAt: '2026-10-12T16:02:00.000Z',
  deviceUtcOffsetMinutes: -240,
};

// The tower's phone at 17:30 on Monday.
const sync: SyncSent = {
  clockAt: '2026-10-12T21:30:00.000Z',
  deviceUtcOffsetMinutes: -240,
  unplannedAssignments: [unplanned],
  passcodeUses: [switched],
  records,
  lastUsed: [{ projectId: p1, series: 'LOAD', lastUsedNumber: 101006 }],
};

const refusals = (schema: z.ZodType, payload: unknown): string[] => {
  const result = schema.safeParse(payload);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};
const taken = (payload: unknown): boolean => syncSentSchema.safeParse(payload).success;

describe('what a phone sends at a sync', () => {
  it('AC-05-03, AC-10-36 the phone’s clock, its unplanned assignments, the passcode’s uses it logged, its records and the last number it used of each series: one schema, in that order', () => {
    expect(refusals(syncSentSchema, sync)).toEqual([]);
    expect(Object.keys(syncSentSchema.shape)).toEqual([
      'clockAt',
      'deviceUtcOffsetMinutes',
      'unplannedAssignments',
      'passcodeUses',
      'records',
      'lastUsed',
    ]);
    const read = syncSentSchema.parse(sync);
    expect(read.clockAt).toEqual(new Date('2026-10-12T21:30:00Z'));
    expect(read.records).toHaveLength(records.length);
    // A phone with nothing to report still says each part, empty.
    expect(
      taken({ ...sync, unplannedAssignments: [], passcodeUses: [], records: [], lastUsed: [] }),
    ).toBe(true);
    for (const part of Object.keys(sync)) {
      const rest = Object.fromEntries(Object.entries(sync).filter(([name]) => name !== part));
      expect(taken(rest), part).toBe(false);
    }
    // The clock is an instant with its offset beside it, as every time a phone sends is.
    expect(taken({ ...sync, clockAt: '2026-10-12T17:30:00-04:00' })).toBe(false);
    expect(taken({ ...sync, deviceUtcOffsetMinutes: 900 })).toBe(false);
  });

  it('AC-10-35 a sync never says which phone it is from, who is signed in, or anything the server concludes: such a field is refused', () => {
    for (const forged of [
      { deviceId: made('97') },
      { monitorId: ana },
      { receivedAt: '2026-10-12T21:30:00.000Z' },
      { clockDifferenceSeconds: 0 },
      { blocks: [] },
    ]) {
      const [name] = Object.keys(forged);
      expect(refusals(syncSentSchema, { ...sync, ...forged }), name).toEqual([
        `: Unrecognized key: "${String(name)}"`,
      ]);
    }
    // The reports are the ones their own endpoints read: the passcode is never sent.
    expect(taken({ ...sync, unplannedAssignments: [{ ...unplanned, passcode: 'x' }] })).toBe(false);
    expect(taken({ ...sync, passcodeUses: [{ ...switched, personId: null }] })).toBe(false);
    expect(taken({ ...sync, passcodeUses: [{ ...switched, typed: '4417' }] })).toBe(false);
  });

  it('API4 every part is bounded: 200 records, 20 unplanned assignments, 100 uses of the passcode, 20 series, each series once', () => {
    expect([
      syncRecordsAtMost,
      syncUnplannedAssignmentsAtMost,
      syncPasscodeUsesAtMost,
      syncSeriesAtMost,
    ]).toEqual([200, 20, 100, 20]);
    const many = <T>(count: number, one: (index: number) => T): T[] =>
      Array.from({ length: count }, (_, index) => one(index));
    const record = (index: number): unknown => ({
      record: 'FIELD_EVENT',
      fieldEvent: { ...collection, id: made(String(1000 + index)) },
    });
    expect(taken({ ...sync, records: many(200, record) })).toBe(true);
    expect(refusals(syncSentSchema, { ...sync, records: many(201, record) })).toEqual([
      'records: Too big: expected array to have <=200 items',
    ]);
    // A full sync of ordinary records is well inside the request's one mebibyte.
    expect(JSON.stringify({ ...sync, records: many(200, record) }).length).toBeLessThan(524_288);
    const report = (index: number): unknown => ({ ...unplanned, id: made(String(2000 + index)) });
    expect(taken({ ...sync, unplannedAssignments: many(21, report) })).toBe(false);
    const use = (index: number): unknown => ({ ...switched, id: made(String(3000 + index)) });
    expect(taken({ ...sync, passcodeUses: many(101, use) })).toBe(false);
    const series = (index: number): unknown => ({
      projectId: made(String(4000 + index)),
      series: 'LOAD',
      lastUsedNumber: null,
    });
    expect(taken({ ...sync, lastUsed: many(20, series) })).toBe(true);
    expect(taken({ ...sync, lastUsed: many(21, series) })).toBe(false);
    const load = { projectId: p1, series: 'LOAD', lastUsedNumber: 101006 };
    expect(taken({ ...sync, lastUsed: [load, { ...load, lastUsedNumber: 101007 }] })).toBe(false);
    expect(taken({ ...sync, lastUsed: [load, { ...load, series: 'ROE' }] })).toBe(true);
    // A number of a series is a whole number from 1; a series is one the domain names.
    expect(lastUsedSchema.safeParse({ ...load, lastUsedNumber: 0 }).success).toBe(false);
    expect(lastUsedSchema.safeParse({ ...load, lastUsedNumber: 101006.5 }).success).toBe(false);
    expect(lastUsedSchema.safeParse({ ...load, series: 'TICKET' }).success).toBe(false);
  });
});

describe('each record of a sync, read on its own', () => {
  it('AC-05-45 one that isn’t a record never refuses the sync or the records sent with it: it is read as not saved, the others as they are', () => {
    const sent = [
      { record: 'FIELD_EVENT', fieldEvent: collection },
      { record: 'FIELD_EVENT', fieldEvent: { ...disposal, loadCall: 140 } },
      { record: 'COMPLETED_LOAD', load: { id: made('9') } },
      'not a record',
      null,
      { record: 'FIELD_EVENT', fieldEvent: disposal },
    ];
    expect(refusals(syncSentSchema, { ...sync, records: sent })).toEqual([]);
    const read = syncSentSchema.parse({ ...sync, records: sent }).records.map(recordRead);
    expect(read.map((each) => each.read)).toEqual([true, false, false, false, false, true]);
    expect(read.map((each) => (each.read ? each.record.record : each.notice.reason))).toEqual([
      'FIELD_EVENT',
      'NOT_A_RECORD',
      'NOT_A_RECORD',
      'NOT_A_RECORD',
      'NOT_A_RECORD',
      'FIELD_EVENT',
    ]);
    // A record read is the one its own schema reads: a time as a `Date`.
    const [first] = read;
    if (first?.read !== true || first.record.record !== 'FIELD_EVENT') throw new Error('Unread.');
    expect(first.record.fieldEvent.startedAt).toEqual(new Date('2026-10-12T13:05:00Z'));
    // The id it was sent under, where that much could be read.
    expect(read.map((each) => (each.read ? 'read' : each.id))).toEqual([
      'read',
      disposal.id,
      made('9'),
      null,
      null,
      'read',
    ]);
  });

  it('AC-10-37, C127 a record that isn’t one is told which field and how, in the contract’s own words: never a value that was sent, nor the name of a field nobody named', () => {
    const told = (fieldEvent: unknown): string => {
      const read = recordRead({ record: 'FIELD_EVENT', fieldEvent });
      if (read.read) throw new Error('Read.');
      return read.notice.message;
    };
    expect(told({ ...disposal, loadCall: 140 })).toBe(
      'Not saved: this record can’t be read: fieldEvent.loadCall in this record can’t be more than 100.',
    );
    expect(told({ ...disposal, zoneId: made('99'), amount: 1260 })).toBe(
      'Not saved: this record can’t be read: fieldEvent in this record has a field this request doesn’t take.',
    );
    const { endedAt, ...unfinished } = collection;
    expect([endedAt, told(unfinished)]).toEqual([
      '2026-10-12T13:40:00.000Z',
      'Not saved: this record can’t be read: fieldEvent.endedAt in this record is missing.',
    ]);
    // The domain's own words quote the suffix sent: the phone is told the field alone.
    const split = told({ ...collection, splitSuffix: 'a;1', estimateCy: 12.5 });
    expect(split).toBe(
      'Not saved: this record can’t be read: fieldEvent.splitSuffix in this record isn’t taken as it stands.',
    );
    expect(split).not.toContain('a;1');
    // No more than three are said.
    expect(
      told({ ...disposal, loadCall: 140, carriedCount: -1, typedCapacityCy: 0.5, siteId: 'x' }),
    ).toMatch(/; and 1 more\.$/);
    for (const sent of ['not a record', null, 7, [], {}, { record: 'COMPLETED_LOAD' }]) {
      const read = recordRead(sent);
      if (read.read) throw new Error('Read.');
      expect(read.notice.message, JSON.stringify(sent)).toMatch(
        /^Not saved: this record can’t be read: /,
      );
      expect(read.notice.message).not.toContain('COMPLETED_LOAD');
    }
  });
});

describe('what a phone is answered', () => {
  const saved: RecordAnswer = { answer: 'SAVED', id: collection.id, notes: [] };
  const answered: SyncAnswered = {
    unplannedAssignments: [{ assignmentId: unplanned.id, answer: 'SAVED', reason: null }],
    passcodeUses: [{ useId: switched.id, answer: 'ALREADY_SAVED', reason: null }],
    records: [
      saved,
      {
        answer: 'SAVED',
        id: made('5'),
        notes: [{ code: 'GPS_UNREADABLE', message: 'GPS unreadable: kept as sent.' }],
      },
      { answer: 'ALREADY_SAVED', id: made('3') },
      {
        answer: 'QUARANTINED',
        id: made('2'),
        reason: 'DUPLICATE_FIELD_EVENT',
        message:
          'Ticket 101020: this ticket already has a disposal. Not saved: kept in quarantine for review.',
        heldBy: made('8'),
      },
      {
        answer: 'NOT_SAVED',
        id: null,
        reason: 'NOT_A_RECORD',
        message: 'Not saved: this record can’t be read: this record is missing.',
      },
      {
        answer: 'NOT_SAVED',
        id: made('6'),
        reason: 'NAMES_NO_RECORD',
        message: 'Not saved: this record names something the server doesn’t have.',
      },
      {
        answer: 'NOT_SAVED',
        id: made('7'),
        reason: 'ASSIGNMENT_NOT_SAVED',
        message: 'Not saved: the assignment this record was made under was not saved.',
      },
    ],
    numbers: [
      {
        projectId: p1,
        series: 'LOAD',
        toppedUp: true,
        blocks: [
          { firstNumber: 101001, lastNumber: 102000, lastUsedNumber: 101006 },
          { firstNumber: 102001, lastNumber: 102006, lastUsedNumber: null },
        ],
      },
      { projectId: p1, series: 'ROE', toppedUp: false, blocks: [] },
    ],
  };

  it('AC-05-20, 45, 47 each thing sent has its own answer: a record saved with its notes, already saved, quarantined with the reason and the record that holds the number, or not saved; the blocks held now', () => {
    expect(refusals(syncAnsweredSchema, answered)).toEqual([]);
    expect(answered.records.map((each) => each.answer)).toEqual([
      'SAVED',
      'SAVED',
      'ALREADY_SAVED',
      'QUARANTINED',
      'NOT_SAVED',
      'NOT_SAVED',
      'NOT_SAVED',
    ]);
    // An unplanned assignment or a use not saved says why, as its own endpoint does.
    expect(
      refusals(syncAnsweredSchema, {
        ...answered,
        unplannedAssignments: [
          { assignmentId: unplanned.id, answer: 'NOT_SAVED', reason: 'UNKNOWN_PROJECT' },
        ],
        passcodeUses: [{ useId: switched.id, answer: 'NOT_SAVED', reason: 'NOT_A_MONITOR' }],
      }),
    ).toEqual([]);
  });

  it('AC-05-15, 20 “saved” is one answer and says nothing else: a quarantined record has its reason and its holder, one not saved has no holder, and only one that couldn’t be read has no id', () => {
    const not = (answer: unknown): boolean => !recordAnswerSchema.safeParse(answer).success;
    expect(not({ ...saved, reason: 'DUPLICATE_FIELD_EVENT' })).toBe(true);
    expect(not({ answer: 'SAVED', id: collection.id })).toBe(true);
    expect(not({ ...saved, id: null })).toBe(true);
    expect(not({ answer: 'ALREADY_SAVED', id: null })).toBe(true);
    expect(not({ answer: 'QUARANTINED', id: made('2'), reason: 'DUPLICATE_FIELD_EVENT' })).toBe(
      true,
    );
    const [, , , quarantined, unread] = answered.records;
    expect(not({ ...quarantined, reason: 'NOT_A_RECORD' })).toBe(true);
    expect(not({ ...quarantined, heldBy: null })).toBe(true);
    expect(not({ ...unread, heldBy: made('8') })).toBe(true);
    expect(not({ ...unread, reason: 'INELIGIBLE' })).toBe(true);
    expect(not({ answer: 'REFUSED', id: made('2') })).toBe(true);
    expect(not({ answer: 'FAILED', id: made('2') })).toBe(true);
  });

  it('AC-10-35 no answer carries a conclusion or money: a status, a flag, a zone, an amount or a rate is no field of it', () => {
    const names = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
      } else if (typeof node === 'object' && node !== null) {
        const { properties, ...rest } = node as { properties?: Record<string, unknown> };
        for (const [name, of] of Object.entries(properties ?? {})) {
          names.add(name);
          walk(of);
        }
        Object.values(rest).forEach(walk);
      }
    };
    walk(z.toJSONSchema(syncAnsweredSchema));
    expect([...names].sort()).toEqual([
      'answer',
      'assignmentId',
      'blocks',
      'code',
      'firstNumber',
      'heldBy',
      'id',
      'lastNumber',
      'lastUsedNumber',
      'message',
      'notes',
      'numbers',
      'passcodeUses',
      'projectId',
      'reason',
      'records',
      'series',
      'toppedUp',
      'unplannedAssignments',
      'useId',
    ]);
    expect(assignment).not.toBe(unplanned.id);
  });
});
