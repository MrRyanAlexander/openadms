// The suite any client of the sync contract must pass (ARCHITECTURE §9, its last paragraph;
// spec/parts/05-sync.md steps 2…8; AC-05-15, 20, 45, 46; AC-10-35, 36; BACKLOG 2.6.1 part 4,
// C122, C126, C128, C129; ADR-022, 052, 457, 464, 466…470; REQ-004, 203, 308c): the harness's
// phones now, the field app in Phase 3.
//
// It needs no test runner and no server. A client is handed what it holds, the suite reads what
// it sends as it goes on the wire, plays the server's answer, and looks at what the client holds
// afterwards. Each check is a plain sentence; one that isn't held throws, saying what it saw.
// Run them with whatever runs tests: `for (const check of syncClientSuite) it(check.name, () =>
// check.run(make))`.
//
// What it holds a client to: every part of a sync is sent, empty where there is nothing; each
// record is one the contract reads, as recorded and under the id its phone made; nothing goes
// ahead of what it names; no sync carries more than the contract's limits; only "saved" and
// "already saved" take a record off the phone; a quarantined record and one not saved are kept
// and shown as not saved, in the server's own words; and what is no answer to what was sent
// marks nothing. What it leaves to the client: when it syncs, how it stores what it holds, and
// whether it sends a kept record again (the server answers the same id the same way).
import { stored, syncedRecordAssignment, syncedRecordId } from './sync-client.ts';
import {
  assignment,
  collection,
  disposal,
  landfill,
  made,
  p1,
  records as oneOfEach,
  switched,
  unplanned,
} from './sync-examples.ts';
import type { SyncedRecord } from './sync-records.ts';
import {
  recordRead,
  syncPasscodeUsesAtMost,
  syncRecordsAtMost,
  syncSentSchema,
  syncUnplannedAssignmentsAtMost,
  type RecordAnswer,
  type SyncAnswered,
  type SyncSent,
} from './sync.ts';

// What a client holds when a check begins: as if its monitors had just recorded and reported
// it, in this order, and nothing of it had been sent.
export interface SyncClientHolds {
  readonly unplannedAssignments: SyncSent['unplannedAssignments'];
  readonly passcodeUses: SyncSent['passcodeUses'];
  readonly records: readonly SyncedRecord[];
  readonly lastUsed: SyncSent['lastUsed'];
}

// One thing a client shows as not saved: the id it was made under, the server's reason and,
// for a record, the server's words.
export interface ShownNotSaved {
  readonly id: string;
  readonly reason: string;
  readonly message: string | null;
}

// A client, as the suite drives it.
export interface SyncClient {
  // The next sync, as it goes on the wire now.
  sends(): unknown;
  // What came back for the sync it sent last, as it came off the wire; `undefined` where
  // nothing came back (no signal, an error).
  answered(answer: unknown): void | Promise<void>;
  // The id of every record, unplanned assignment and use of the passcode it holds that the
  // server has not said it stored.
  holds(): readonly string[];
  // What it shows as not saved.
  notSaved(): readonly ShownNotSaved[];
}

export type SyncClientMaker = (holds: SyncClientHolds) => SyncClient | Promise<SyncClient>;

export interface SyncClientCheck {
  readonly name: string;
  run(make: SyncClientMaker): Promise<void>;
}

const nothing: SyncClientHolds = {
  unplannedAssignments: [],
  passcodeUses: [],
  records: [],
  lastUsed: [],
};

function held(condition: boolean, what: string): asserts condition {
  if (!condition) throw new Error(what);
}

const sorted = (ids: readonly string[]): string => [...ids].sort().join(' ');

// The same thing, read as JSON: field for field, whatever the order of an object's fields.
function same(one: unknown, other: unknown): boolean {
  if (Array.isArray(one) || Array.isArray(other)) {
    return (
      Array.isArray(one) &&
      Array.isArray(other) &&
      one.length === other.length &&
      one.every((each, index) => same(each, other[index]))
    );
  }
  if (typeof one === 'object' && one !== null && typeof other === 'object' && other !== null) {
    const [a, b] = [one as Record<string, unknown>, other as Record<string, unknown>];
    const names = Object.keys(a).filter((name) => a[name] !== undefined);
    return (
      names.length === Object.keys(b).filter((name) => b[name] !== undefined).length &&
      names.every((name) => same(a[name], b[name]))
    );
  }
  return one === other;
}

// One sync as it went on the wire, read as the server reads it: refused whole where it isn't
// the contract's, each record then read on its own.
function onTheWire(sent: unknown): SyncSent {
  const wire: unknown = JSON.parse(JSON.stringify(sent ?? null));
  const read = syncSentSchema.safeParse(wire);
  if (!read.success) {
    const [issue] = read.error.issues;
    throw new Error(
      `What it sent is not a sync the contract reads: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`,
    );
  }
  for (const record of read.data.records) {
    const each = recordRead(record);
    held(
      each.read,
      each.read ? '' : `It sent a record the contract doesn’t read. ${each.notice.message}`,
    );
  }
  return wire as SyncSent;
}

// The server's answer to a sync: every report and every series taken, each record answered as
// `how` says, saved where it says nothing.
function answerTo(
  sync: SyncSent,
  how: (id: string, record: SyncedRecord) => RecordAnswer | undefined = () => undefined,
): SyncAnswered {
  return {
    unplannedAssignments: sync.unplannedAssignments.map((each) => ({
      assignmentId: each.id,
      answer: 'SAVED',
      reason: null,
    })),
    passcodeUses: sync.passcodeUses.map((each) => ({
      useId: each.id,
      answer: 'SAVED',
      reason: null,
    })),
    records: sync.records.map((record) => {
      const id = syncedRecordId(record);
      return how(id, record) ?? { answer: 'SAVED', id, notes: [] };
    }),
    numbers: sync.lastUsed.map(({ projectId, series }) => ({
      projectId,
      series,
      toppedUp: true,
      blocks: [],
    })),
    // Nothing brought besides: the check it holds is the one in force, and no setup version.
    masterPasscode: { version: sync.holds.masterPasscodeVersion ?? 1, check: null },
    setupVersion: null,
  };
}

const another = (record: SyncedRecord & { record: 'FIELD_EVENT' }, last: string, more = {}) =>
  ({
    record: 'FIELD_EVENT',
    fieldEvent: { ...record.fieldEvent, id: made(last), ...more },
  }) satisfies SyncedRecord;
const collected = (last: string, more = {}): SyncedRecord =>
  another({ record: 'FIELD_EVENT', fieldEvent: collection }, last, more);

const [, scaleReceipt, incident, , survey, roe] = oneOfEach;

export const syncClientSuite: readonly SyncClientCheck[] = [
  {
    name: 'a phone with nothing to report still sends every part of a sync, each empty, with its clock as a UTC instant and its offset (AC-10-36; ADR-467 (1))',
    async run(make) {
      const client = await make(nothing);
      const sync = onTheWire(client.sends());
      held(
        [sync.unplannedAssignments, sync.passcodeUses, sync.records, sync.lastUsed].every(
          (part) => part.length === 0,
        ),
        'It holds nothing, and sent something.',
      );
    },
  },
  {
    name: 'each record is sent once, as recorded, under the id its phone made, as its own schema reads it: one of each kind, the reports and the last numbers used beside them, and never which phone it is from (AC-10-35; ADR-466, 469)',
    async run(make) {
      const holds = {
        unplannedAssignments: [unplanned],
        passcodeUses: [switched],
        records: oneOfEach,
        lastUsed: [
          { projectId: p1, series: 'LOAD', lastUsedNumber: 101006 },
          { projectId: p1, series: 'ROE', lastUsedNumber: null },
        ],
      } satisfies SyncClientHolds;
      const client = await make(holds);
      const sync = onTheWire(client.sends());
      held(
        sorted(sync.records.map(syncedRecordId)) === sorted(holds.records.map(syncedRecordId)),
        'The records it sent are not the ones it holds, each once.',
      );
      for (const record of holds.records) {
        const id = syncedRecordId(record);
        held(
          same(
            sync.records.find((each) => syncedRecordId(each) === id),
            record,
          ),
          `Record ${id} (${record.record}) was not sent as it was recorded.`,
        );
      }
      held(
        same(sync.unplannedAssignments, holds.unplannedAssignments),
        'The unplanned assignment was not sent as it was made.',
      );
      held(same(sync.passcodeUses, holds.passcodeUses), 'The use was not sent as it was logged.');
      held(
        sync.lastUsed.length === holds.lastUsed.length &&
          holds.lastUsed.every((report) => sync.lastUsed.some((each) => same(each, report))),
        'The last number used of each series was not reported, each series once.',
      );
    },
  },
  {
    name: 'nothing goes ahead of what it names: a scale receipt before the disposal that points at it, an unplanned assignment no later than a record made under it (ADR-034, 457; C122)',
    async run(make) {
      held(scaleReceipt?.record === 'SCALE_RECEIPT', 'The examples have no scale receipt.');
      const weighed = another({ record: 'FIELD_EVENT', fieldEvent: disposal }, '21', {
        scaleReceiptId: scaleReceipt.scaleReceipt.id,
        loadCall: null,
      });
      const underIt = collected('22', { assignmentId: unplanned.id });
      const client = await make({
        ...nothing,
        unplannedAssignments: [unplanned],
        records: [weighed, scaleReceipt, underIt],
      });
      const sync = onTheWire(client.sends());
      const place = (id: string): number =>
        sync.records.findIndex((each) => syncedRecordId(each) === id);
      held(place(syncedRecordId(weighed)) >= 0, 'It held a disposal and did not send it.');
      held(
        place(scaleReceipt.scaleReceipt.id) >= 0 &&
          place(scaleReceipt.scaleReceipt.id) < place(syncedRecordId(weighed)),
        'The scale receipt was not sent ahead of the disposal that points at it.',
      );
      held(
        place(syncedRecordId(underIt)) < 0 ||
          sync.unplannedAssignments.some((each) => each.id === unplanned.id),
        'A record went ahead of the unplanned assignment it was made under.',
      );
    },
  },
  {
    name: 'no sync carries more than the contract’s limits: what is over goes in the next, nothing lost, nothing twice, and no record ahead of an unplanned assignment that had to wait (API4; ADR-467 (4))',
    async run(make) {
      const many = <T>(count: number, one: (index: number) => T): T[] =>
        Array.from({ length: count }, (_, index) => one(index));
      const assignments = many(syncUnplannedAssignmentsAtMost + 1, (index) => ({
        ...unplanned,
        id: made(String(2000 + index)),
      }));
      const last = assignments.at(-1)?.id ?? '';
      const holds = {
        ...nothing,
        unplannedAssignments: assignments,
        passcodeUses: many(syncPasscodeUsesAtMost + 1, (index) => ({
          ...switched,
          id: made(String(3000 + index)),
        })),
        // The first record was made under the last unplanned assignment, so it waits with it:
        // one more than a sync's worth besides it.
        records: many(syncRecordsAtMost + 2, (index) =>
          collected(String(1000 + index), index === 0 ? { assignmentId: last } : {}),
        ),
      } satisfies SyncClientHolds;
      const everything = [
        ...holds.unplannedAssignments.map((each) => each.id),
        ...holds.passcodeUses.map((each) => each.id),
        ...holds.records.map(syncedRecordId),
      ];
      const client = await make(holds);
      const went: string[] = [];
      const saved = new Set<string>();
      let syncs = 0;
      while (client.holds().length > 0) {
        syncs += 1;
        held(syncs <= 6, 'After six syncs, each answered "saved", it still holds something.');
        // A sync over a limit is no sync the contract reads.
        const sync = onTheWire(client.sends());
        const here = new Set(sync.unplannedAssignments.map((each) => each.id));
        for (const record of sync.records) {
          const under = syncedRecordAssignment(record);
          held(
            under === null || under === assignment || here.has(under) || saved.has(under),
            'A record went ahead of the unplanned assignment it was made under.',
          );
        }
        const ids = [
          ...sync.unplannedAssignments.map((each) => each.id),
          ...sync.passcodeUses.map((each) => each.id),
          ...sync.records.map(syncedRecordId),
        ];
        held(ids.length > 0, 'It holds something and sent nothing.');
        went.push(...ids);
        ids.forEach((id) => saved.add(id));
        await client.answered(answerTo(sync));
      }
      held(syncs >= 2, 'More than one sync’s worth went in one sync.');
      held(sorted(went) === sorted(everything), 'Not everything it held was sent, each once.');
    },
  },
  {
    name: 'only "saved" and "already saved" take a record off the phone: one quarantined and one not saved are kept, shown as not saved with the server’s reason and words, and never sent as anything else (AC-05-15, 20, 45, 46; ADR-022, 468; REQ-308c)',
    async run(make) {
      held(incident !== undefined && survey !== undefined, 'The examples are not all there.');
      const again: SyncedRecord = { record: 'FIELD_EVENT', fieldEvent: disposal };
      const records = [collected('31'), collected('32'), again, incident, survey];
      const [first, second] = records.map(syncedRecordId);
      const answers: Record<string, RecordAnswer> = {
        [second ?? '']: { answer: 'ALREADY_SAVED', id: second ?? '' },
        [disposal.id]: {
          answer: 'QUARANTINED',
          id: disposal.id,
          reason: 'DUPLICATE_FIELD_EVENT',
          message:
            'Ticket 101001: this ticket already has a disposal. Not saved: kept in quarantine for review.',
          heldBy: made('99'),
        },
        [syncedRecordId(incident)]: {
          answer: 'NOT_SAVED',
          id: syncedRecordId(incident),
          reason: 'NAMES_NO_RECORD',
          message: 'Not saved: this record names something the server doesn’t have.',
        },
        // One the server couldn't read is answered under no id, in its place.
        [syncedRecordId(survey)]: {
          answer: 'NOT_SAVED',
          id: null,
          reason: 'NOT_A_RECORD',
          message: 'Not saved: this record can’t be read: this record is missing.',
        },
      };
      const client = await make({ ...nothing, records });
      const sync = onTheWire(client.sends());
      held(sync.records.length === records.length, 'It did not send the five records it holds.');
      await client.answered(answerTo(sync, (id) => answers[id]));
      const kept = Object.values(answers).filter((answer) => !stored(answer));
      const keptIds = [disposal.id, syncedRecordId(incident), syncedRecordId(survey)];
      held(
        sorted(client.holds()) === sorted(keptIds),
        'After its answers it should hold the quarantined record and the two not saved, and nothing that was stored.',
      );
      const shown = client.notSaved();
      held(shown.length === kept.length, 'It does not show each record not saved, once.');
      for (const id of keptIds) {
        const answer = answers[id];
        const one = shown.find((each) => each.id === id);
        held(
          answer !== undefined &&
            'reason' in answer &&
            one?.reason === answer.reason &&
            one.message === answer.message,
          `Record ${id} is not shown as not saved with the server’s reason and words.`,
        );
      }
      // Whatever goes next, nothing stored goes again, and a kept record goes as it was.
      const next = onTheWire(client.sends());
      for (const record of next.records) {
        const id = syncedRecordId(record);
        held(id !== first && id !== second, 'A record the server stored was sent again.');
        held(
          same(
            record,
            records.find((each) => syncedRecordId(each) === id),
          ),
          `Record ${id} was kept, and sent again as something else.`,
        );
      }
    },
  },
  {
    name: 'an unplanned assignment or a use of the passcode answered "not saved" is kept and shown with its reason, and so is the record made under it (ADR-457, 464, 467 (5); C122, C126)',
    async run(make) {
      const underIt = collected('41', { assignmentId: unplanned.id });
      const client = await make({
        ...nothing,
        unplannedAssignments: [unplanned],
        passcodeUses: [switched],
        records: [underIt],
      });
      const sync = onTheWire(client.sends());
      held(
        sync.unplannedAssignments.length === 1 &&
          sync.passcodeUses.length === 1 &&
          sync.records.length === 1,
        'It did not send the assignment, the use and the record it holds.',
      );
      const notSaved = 'Not saved: the assignment this record was made under was not saved.';
      await client.answered({
        ...answerTo(sync, (id) => ({
          answer: 'NOT_SAVED',
          id,
          reason: 'ASSIGNMENT_NOT_SAVED',
          message: notSaved,
        })),
        unplannedAssignments: [
          { assignmentId: unplanned.id, answer: 'NOT_SAVED', reason: 'UNKNOWN_PROJECT' },
        ],
        passcodeUses: [{ useId: switched.id, answer: 'NOT_SAVED', reason: 'NOT_A_MONITOR' }],
      } satisfies SyncAnswered);
      const all = [unplanned.id, switched.id, syncedRecordId(underIt)];
      held(sorted(client.holds()) === sorted(all), 'It does not hold all three still.');
      const shown = client.notSaved();
      const reasonOf = (id: string): string | undefined =>
        shown.find((each) => each.id === id)?.reason;
      held(
        shown.length === 3 &&
          reasonOf(unplanned.id) === 'UNKNOWN_PROJECT' &&
          reasonOf(switched.id) === 'NOT_A_MONITOR' &&
          reasonOf(syncedRecordId(underIt)) === 'ASSIGNMENT_NOT_SAVED',
        'It does not show each of the three as not saved, with its reason.',
      );
    },
  },
  {
    name: 'no answer: nothing is taken for saved, everything stays, and it goes again as it was, under the same ids (ARCHITECTURE §9 (3); KD-56)',
    async run(make) {
      held(roe !== undefined, 'The examples are not all there.');
      const records = [collected('51'), roe];
      const client = await make({ ...nothing, passcodeUses: [switched], records });
      const first = onTheWire(client.sends());
      await client.answered(undefined);
      const all = [switched.id, ...records.map(syncedRecordId)];
      held(sorted(client.holds()) === sorted(all), 'With no answer, it let go of something.');
      held(client.notSaved().length === 0, 'With no answer, it shows something as not saved.');
      const second = onTheWire(client.sends());
      held(
        same(second.records, first.records) && same(second.passcodeUses, first.passcodeUses),
        'What it sent again is not what it sent before.',
      );
    },
  },
  {
    name: 'what is no answer to what was sent marks nothing: an answer short, answers in another order, an answer under an id never sent, an answer the contract doesn’t have (ADR-470; REQ-308c)',
    async run(make) {
      const records = [collected('61'), collected('62', { siteId: landfill }), collected('63')];
      const ids = records.map(syncedRecordId);
      const wrong: Record<string, (sync: SyncSent) => unknown> = {
        'one answer short': (sync) => ({
          ...answerTo(sync),
          records: answerTo(sync).records.slice(1),
        }),
        'one answer too many': (sync) => ({
          ...answerTo(sync),
          records: [...answerTo(sync).records, { answer: 'SAVED', id: made('64'), notes: [] }],
        }),
        'answers in another order': (sync) => ({
          ...answerTo(sync),
          records: answerTo(sync).records.reverse(),
        }),
        'an answer under an id never sent': (sync) =>
          answerTo(sync, (id) =>
            id === ids[1] ? { answer: 'SAVED', id: made('65'), notes: [] } : undefined,
          ),
        'an answer the contract doesn’t have': (sync) => ({
          ...answerTo(sync),
          records: ids.map((id) => ({ answer: 'OK', id })),
        }),
        'a use answered that was never sent': (sync) => ({
          ...answerTo(sync),
          passcodeUses: [{ useId: switched.id, answer: 'SAVED', reason: null }],
        }),
        'words where an answer should be': () => 'OK',
      };
      for (const [what, answer] of Object.entries(wrong)) {
        const client = await make({ ...nothing, records });
        const sync = onTheWire(client.sends());
        await client.answered(answer(sync));
        held(
          sorted(client.holds()) === sorted(ids),
          `Answered ${what}, it took something for saved.`,
        );
        held(client.notSaved().length === 0, `Answered ${what}, it shows something as not saved.`);
      }
    },
  },
];
