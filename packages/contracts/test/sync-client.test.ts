// The suite any client of the sync contract must pass, at the contracts package (ARCHITECTURE
// §9; AC-05-15, 20, 45, 46; AC-10-35, 36; BACKLOG 2.6.1 part 4, C128, C129; ADR-467…470;
// REQ-004, 203, 308c): a client that keeps the contract passes every check, and a client with
// one fault is caught by the check that names it. The harness's phone runs the same suite
// (`packages/scenarios/test/sync-client.test.ts`).
import { describe, expect, it } from 'vitest';

import {
  stored,
  syncAnswerRead,
  syncClientSuite,
  syncedRecordAssignment,
  syncedRecordId,
  syncPasscodeUsesAtMost,
  syncRecordsAtMost,
  syncUnplannedAssignmentsAtMost,
  type ShownNotSaved,
  type SyncAnswered,
  type SyncClient,
  type SyncClientHolds,
  type SyncClientMaker,
  type SyncedRecord,
  type SyncSent,
} from '../src/index.ts';
import {
  assignment,
  collection,
  disposal,
  made,
  pilePhoto,
  records,
  switched,
} from '../src/sync-examples.ts';

// One way a client may fail the contract.
const faults = [
  'LEAVES_OUT_AN_EMPTY_PART',
  'SAYS_WHICH_PHONE',
  'TRIMS_A_NUMBER',
  'SENDS_AS_RECORDED',
  'SENDS_ALL_AT_ONCE',
  'DROPS_WHAT_WAS_ANSWERED',
  'DROPS_A_REPORT_NOT_SAVED',
  'SHOWS_NO_WORDS',
  'TAKES_SENT_FOR_SAVED',
  'READS_ANSWERS_BY_PLACE',
  'TAKES_ANY_ANSWER',
] as const;
type Fault = (typeof faults)[number];

// A client that keeps the contract, in memory; with a fault, one that breaks it in that way
// alone.
const phone =
  (fault?: Fault): SyncClientMaker =>
  (holds: SyncClientHolds): SyncClient => {
    let unplanned = [...holds.unplannedAssignments];
    let uses = [...holds.passcodeUses];
    let waiting = [...holds.records];
    let photos = [...holds.photos];
    const kept: string[] = [];
    const shown: ShownNotSaved[] = [];
    let last: SyncSent | undefined;
    const all = fault === 'SENDS_ALL_AT_ONCE';
    const notStored = (id: string, reason: string, message: string | null): void => {
      kept.push(id);
      shown.push({ id, reason, message: fault === 'SHOWS_NO_WORDS' ? null : message });
    };
    return {
      sends() {
        const first = unplanned.slice(0, all ? undefined : syncUnplannedAssignmentsAtMost);
        const later = new Set(unplanned.slice(first.length).map((each) => each.id));
        const ordered: SyncedRecord[] = [];
        for (const record of waiting) {
          const named =
            record.record === 'SCALE_RECEIPT' && fault !== 'SENDS_AS_RECORDED'
              ? ordered.findIndex(
                  (each) =>
                    each.record === 'FIELD_EVENT' &&
                    each.fieldEvent.scaleReceiptId === record.scaleReceipt.id,
                )
              : -1;
          if (named >= 0) ordered.splice(named, 0, record);
          else ordered.push(record);
        }
        const sync: SyncSent = {
          clockAt: '2026-10-12T21:30:00.000Z',
          deviceUtcOffsetMinutes: -240,
          unplannedAssignments: first,
          passcodeUses: uses.slice(0, all ? undefined : syncPasscodeUsesAtMost),
          records: ordered
            .filter((record) => !later.has(syncedRecordAssignment(record) ?? ''))
            .slice(0, all ? undefined : syncRecordsAtMost),
          photos: [...photos],
          lastUsed: [...holds.lastUsed],
          holds: { masterPasscodeVersion: null, listsProjectId: null },
        };
        last = sync;
        if (fault === 'LEAVES_OUT_AN_EMPTY_PART' && sync.passcodeUses.length === 0) {
          const { passcodeUses, ...rest } = sync;
          return passcodeUses.length === 0 ? rest : sync;
        }
        const told = (record: SyncedRecord): unknown => {
          if (record.record !== 'FIELD_EVENT') return record;
          if (fault === 'SAYS_WHICH_PHONE') {
            return { ...record, fieldEvent: { ...record.fieldEvent, deviceId: made('97') } };
          }
          if (fault === 'TRIMS_A_NUMBER') {
            return {
              ...record,
              fieldEvent: {
                ...record.fieldEvent,
                certNumber: record.fieldEvent.certNumber.slice(1),
              },
            };
          }
          return record;
        };
        return { ...sync, records: sync.records.map(told) };
      },
      answered(answer) {
        const sent = last;
        if (sent === undefined) throw new Error('Answered before it sent.');
        if (fault === 'TAKES_SENT_FOR_SAVED' && answer === undefined) waiting = [];
        if (fault === 'TAKES_ANY_ANSWER' && answer !== undefined) waiting = [];
        const read =
          fault === 'READS_ANSWERS_BY_PLACE'
            ? (answer as SyncAnswered | undefined)
            : syncAnswerRead(sent, answer);
        if (read === null || read === undefined || typeof read !== 'object') return;
        read.unplannedAssignments.forEach((each) => {
          unplanned = unplanned.filter((one) => one.id !== each.assignmentId);
          if (!stored(each) && fault !== 'DROPS_A_REPORT_NOT_SAVED') {
            notStored(each.assignmentId, each.reason ?? '', null);
          }
        });
        read.passcodeUses.forEach((each) => {
          uses = uses.filter((one) => one.id !== each.useId);
          if (!stored(each) && fault !== 'DROPS_A_REPORT_NOT_SAVED') {
            notStored(each.useId, each.reason ?? '', null);
          }
        });
        sent.records.forEach((record, place) => {
          const each = read.records[place];
          if (each === undefined) return;
          const id = syncedRecordId(record);
          waiting = waiting.filter((one) => syncedRecordId(one) !== id);
          if ('reason' in each && fault !== 'DROPS_WHAT_WAS_ANSWERED') {
            notStored(id, each.reason, each.message);
          }
        });
        sent.photos.forEach((photo, place) => {
          const each = read.photos[place];
          if (each === undefined) return;
          photos = photos.filter((one) => one.id !== photo.id);
          if ('reason' in each) notStored(photo.id, each.reason, each.message);
        });
      },
      holds: () => [
        ...unplanned.map((each) => each.id),
        ...uses.map((each) => each.id),
        ...waiting.map(syncedRecordId),
        ...photos.map(({ id }) => id),
        ...kept,
      ],
      notSaved: () => shown,
    };
  };

// The checks a client fails, by their place in the suite, from 1.
async function failed(make: SyncClientMaker): Promise<number[]> {
  const places: number[] = [];
  for (const [index, check] of syncClientSuite.entries()) {
    try {
      await check.run(make);
    } catch {
      places.push(index + 1);
    }
  }
  return places;
}

describe('the suite any client of the sync contract must pass', () => {
  for (const check of syncClientSuite) {
    it(check.name, async () => {
      await check.run(phone());
    });
  }

  it('C128 each fault a client may have is caught, by the check that names it', async () => {
    const caught: Record<string, number[]> = {};
    for (const fault of faults) caught[fault] = await failed(phone(fault));
    expect(caught).toEqual({
      LEAVES_OUT_AN_EMPTY_PART: [1, 3, 5, 8],
      SAYS_WHICH_PHONE: [2, 3, 4, 5, 6, 7, 8],
      TRIMS_A_NUMBER: [2],
      SENDS_AS_RECORDED: [3],
      SENDS_ALL_AT_ONCE: [4],
      DROPS_WHAT_WAS_ANSWERED: [5, 6],
      DROPS_A_REPORT_NOT_SAVED: [6],
      SHOWS_NO_WORDS: [5],
      TAKES_SENT_FOR_SAVED: [7],
      READS_ANSWERS_BY_PLACE: [8],
      TAKES_ANY_ANSWER: [4, 8],
    });
  });

  it('a check that isn’t held says what it saw, in plain words', async () => {
    const [first] = syncClientSuite;
    await expect(first?.run(phone('LEAVES_OUT_AN_EMPTY_PART'))).rejects.toThrow(
      'What it sent is not a sync the contract reads: passcodeUses',
    );
    await expect(syncClientSuite[4]?.run(phone('DROPS_WHAT_WAS_ANSWERED'))).rejects.toThrow(
      'it should hold the quarantined record and the two not saved',
    );
  });
});

describe('what a client reads of what it was answered', () => {
  const second: SyncedRecord = { record: 'FIELD_EVENT', fieldEvent: disposal };
  const sent: SyncSent = {
    clockAt: '2026-10-12T21:30:00.000Z',
    deviceUtcOffsetMinutes: -240,
    unplannedAssignments: [],
    passcodeUses: [switched],
    records: [{ record: 'FIELD_EVENT', fieldEvent: collection }, second],
    photos: [pilePhoto],
    lastUsed: [{ projectId: collection.projectId, series: 'LOAD', lastUsedNumber: 101006 }],
    holds: { masterPasscodeVersion: 3, listsProjectId: collection.projectId },
  };
  const answered: SyncAnswered = {
    unplannedAssignments: [],
    passcodeUses: [{ useId: switched.id, answer: 'SAVED', reason: null }],
    records: [
      { answer: 'SAVED', id: collection.id, notes: [] },
      {
        answer: 'QUARANTINED',
        id: disposal.id,
        reason: 'DUPLICATE_FIELD_EVENT',
        message: 'Ticket 101001: this ticket already has a disposal.',
        heldBy: made('99'),
      },
    ],
    photos: [{ answer: 'SAVED', id: pilePhoto.id, notes: [] }],
    numbers: [{ projectId: collection.projectId, series: 'LOAD', toppedUp: true, blocks: [] }],
    masterPasscode: { version: 3, check: null },
    setupVersion: { projectId: collection.projectId, version: 4 },
  };

  it('AC-05-45 an answer for each thing sent, each in its place and under its id, is the answer; a record the server couldn’t read may be answered under no id', () => {
    expect(syncAnswerRead(sent, answered)).toEqual(answered);
    const unread = {
      ...answered,
      records: [
        answered.records[0],
        { answer: 'NOT_SAVED', id: null, reason: 'NOT_A_RECORD', message: 'Not saved.' },
      ],
    };
    expect(syncAnswerRead(sent, unread)).toEqual(unread);
    // A phone that holds no lists, or whose project the server doesn't have, is brought none.
    expect(syncAnswerRead(sent, { ...answered, setupVersion: null })).not.toBeNull();
  });

  it('REQ-308c anything else is no answer: one short, one too many, another order, another id, "saved" under no id, a series not reported, another project’s setup version, a shape the contract doesn’t have, nothing', () => {
    const [first, last] = answered.records;
    const not = (answer: unknown): boolean => syncAnswerRead(sent, answer) === null;
    expect(not({ ...answered, records: [first] })).toBe(true);
    expect(not({ ...answered, records: [first, last, last] })).toBe(true);
    expect(not({ ...answered, records: [last, first] })).toBe(true);
    expect(not({ ...answered, records: [first, { ...last, id: made('98') }] })).toBe(true);
    expect(not({ ...answered, records: [{ ...first, id: null }, last] })).toBe(true);
    // A photograph's record is answered in its own part, in its place, under its id.
    expect(not({ ...answered, photos: [] })).toBe(true);
    expect(not({ ...answered, photos: [{ answer: 'SAVED', id: made('98'), notes: [] }] })).toBe(
      true,
    );
    expect(
      not({
        ...answered,
        photos: [{ ...answered.photos[0], answer: 'QUARANTINED', reason: 'X', heldBy: made('1') }],
      }),
    ).toBe(true);
    expect(not({ ...answered, passcodeUses: [] })).toBe(true);
    expect(
      not({ ...answered, passcodeUses: [{ useId: made('98'), answer: 'SAVED', reason: null }] }),
    ).toBe(true);
    expect(not({ ...answered, numbers: [] })).toBe(true);
    expect(not({ ...answered, numbers: [{ ...answered.numbers[0], series: 'ROE' }] })).toBe(true);
    expect(not({ ...answered, setupVersion: { projectId: made('98'), version: 4 } })).toBe(true);
    const { masterPasscode, ...withoutPasscode } = answered;
    expect([masterPasscode.version, not(withoutPasscode)]).toEqual([3, true]);
    expect(not({ ...answered, status: 'COMPLETED' })).toBe(true);
    expect(not({ ...answered, records: [first, { answer: 'OK', id: disposal.id }] })).toBe(true);
    for (const nothing of [undefined, null, 'OK', 200, []]) expect(not(nothing)).toBe(true);
  });

  it('REQ-308c only "saved" and "already saved" say the server stored it', () => {
    const answers = ['SAVED', 'ALREADY_SAVED', 'QUARANTINED', 'NOT_SAVED', 'OK', ''];
    expect(answers.map((answer) => stored({ answer }))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('a record’s id and its assignment are read off any kind; a scale receipt names no assignment', () => {
    expect(records.map(syncedRecordId)).toEqual(['1', '3', '4', '5', '6', '7', '8'].map(made));
    expect(records.map(syncedRecordAssignment)).toEqual([
      assignment,
      null,
      assignment,
      assignment,
      assignment,
      assignment,
      assignment,
    ]);
  });
});
