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
// ahead of what it names; no sync carries more than the contract's limits, in counts or in
// weight (ADR-504); only "saved" and
// "already saved" take a record off the phone; a quarantined record and one not saved are kept
// and shown as not saved, in the server's own words; what is no answer to what was sent marks
// nothing; and an answer that says to wait (`toldToWait`: a limit, or the database busy,
// ADR-524) keeps everything, to go again as it was. What it leaves to the client: when it syncs, how it stores what it holds, and
// whether it sends a kept record again (the server answers the same id the same way).
//
// **And a photograph's files** (ARCHITECTURE §9 (2), (5); AC-05-09; BACKLOG 2.6.4 part 4, C137,
// C138; ADR-481…483): no photograph's record goes ahead of the record it is of; a file goes to
// the media endpoint only once its photograph's record is answered saved, in parts no larger than
// the server takes, each where the last one ended; it is kept until it is answered kept; an
// interrupted upload goes on from where the server says it stands; and a file answered not the
// one fingerprinted goes again from its first byte. The suite plays the media endpoint itself.
//
// **And turning the phone in** ("Sync and turn in", ARCHITECTURE §8; AC-02-58; BACKLOG 2.6.5,
// C139; ADR-096, 468, 488): a turn-in names everything the phone still holds, each once, by the
// id it was made under, and what it sent with no id the server could read by the fingerprint of
// what was sent; and it wipes only when it is answered to wipe, and then wipes everything.
import {
  toldToWait,
  waitAnswers,
  type PhoneListsRecord,
  type PhotoFileAnswer,
  type PhotoFileName,
} from './api-answers.ts';
import {
  stored,
  syncedRecordAssignment,
  syncedRecordId,
  type FilePartSent,
} from './sync-client.ts';
import { turnInSentSchema, type TurnInAnswer, type TurnInSent } from './turn-in.ts';
import {
  assignment,
  certification,
  certificationPhotos,
  collection,
  disposal,
  landfill,
  listsAfterwards,
  made,
  p1,
  pilePhoto,
  records as oneOfEach,
  switched,
  unplanned,
} from './sync-examples.ts';
import type { SyncedPhoto, SyncedRecord } from './sync-records.ts';
import {
  photoRead,
  recordRead,
  sentWeight,
  syncBytesAtMost,
  syncPasscodeUsesAtMost,
  syncRecordsAtMost,
  syncSentSchema,
  syncUnplannedAssignmentsAtMost,
  type PhotoAnswer,
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
  // Its photographs' records, each of a record above or of one the server already has.
  readonly photos: readonly SyncedPhoto[];
  readonly lastUsed: SyncSent['lastUsed'];
  // The files of its photographs above still to send, as its phone wrote them; a photograph
  // above with none had its files kept before.
  readonly files: readonly HeldPhotoFile[];
  // The most a part of a file may hold, as the server it sends to takes them.
  readonly filePartBytesAtMost: number;
  // The lists it holds now, where a check says: taken since its records were made, so they may
  // no longer hold what a record picked (ADR-552 (3)).
  readonly lists?: PhoneListsRecord;
}

// A photograph's file a client holds: the bytes its record's fingerprint is of
// (`uploadedSha256`, or `depthSha256` for the depth file).
export interface HeldPhotoFile {
  readonly photoId: string;
  readonly file: PhotoFileName;
  readonly bytes: Uint8Array;
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
  // The id of every record, photograph, unplanned assignment and use of the passcode it holds
  // that the server has not said it stored.
  holds(): readonly string[];
  // What it shows as not saved.
  notSaved(): readonly ShownNotSaved[];
  // The next part of a file it sends to the media endpoint now; null where it has none to send.
  sendsFilePart(): FilePartSent | null;
  // What came back for that part, as it came off the wire; `undefined` where nothing came back.
  filePartAnswered(answer: unknown): void | Promise<void>;
  // Each file it holds that the server has not said it kept: "<photograph's id> <file>".
  holdsFiles(): readonly string[];
  // The turn-in it sends now, as it goes on the wire, under the passcode typed on the phone
  // ("Sync and turn in"; ADR-488).
  turnsIn(passcode: string): unknown;
  // What came back for it, as it came off the wire; `undefined` where nothing came back.
  turnInAnswered(answer: unknown): void | Promise<void>;
  // Whether it has wiped what it held.
  wiped(): boolean;
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
  photos: [],
  lastUsed: [],
  files: [],
  filePartBytesAtMost: 1000,
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

// One sync as it went on the wire, read as the server reads it: refused whole where it weighs
// more than a sync may (the API's body limit would refuse it at every try) or isn't the
// contract's, each record then read on its own.
function onTheWire(sent: unknown): SyncSent {
  const weight = sentWeight(sent ?? null);
  held(
    weight <= syncBytesAtMost,
    `It sent a sync of ${String(weight)} bytes, heavier than the ${String(syncBytesAtMost)} a sync may weigh.`,
  );
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
  for (const photo of read.data.photos) {
    const each = photoRead(photo);
    held(
      each.read,
      each.read ? '' : `It sent a photograph the contract doesn’t read. ${each.notice.message}`,
    );
  }
  return wire as SyncSent;
}

// The server's answer to a sync: every report and every series taken, each record answered as
// `how` says, saved where it says nothing.
function answerTo(
  sync: SyncSent,
  how: (id: string, record: SyncedRecord) => RecordAnswer | undefined = () => undefined,
  photoHow: (id: string) => PhotoAnswer | undefined = () => undefined,
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
    photos: sync.photos.map(({ id }) => photoHow(id) ?? { answer: 'SAVED', id, notes: [] }),
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

// A turn-in as it went on the wire, read as the server reads one: refused whole where it isn't
// the contract's.
function turnInOnTheWire(sent: unknown): TurnInSent {
  const wire: unknown = JSON.parse(JSON.stringify(sent ?? null));
  const read = turnInSentSchema.safeParse(wire);
  if (!read.success) {
    const [issue] = read.error.issues;
    throw new Error(
      `What it sent is not a turn-in the contract reads: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`,
    );
  }
  return read.data;
}

const notTurnedIn = (holds: TurnInSent['holds']): TurnInAnswer => ({
  turnedIn: false,
  wipe: false,
  message:
    'Not turned in: the server doesn’t have 1 record this phone holds yet. Nothing was wiped and nothing was changed. Sync the phone again, then turn it in.',
  notOnTheServer: holds,
});

const turnedIn: TurnInAnswer = { turnedIn: true, wipe: true, numbers: [] };

const typed = 'osprey-landing-marsh';

const named = (file: { readonly photoId: string; readonly file: PhotoFileName }): string =>
  `${file.photoId} ${file.file}`;

// A part of a file as a client sent it, read as the media endpoint reads one: refused where it
// isn't a part of a file it holds, or goes past the file, or holds more than the server takes.
function partOnTheWire(sent: unknown, holds: SyncClientHolds): FilePartSent {
  const part = sent as Partial<FilePartSent> | null;
  const file = holds.files.find(
    (one) => part !== null && one.photoId === part.photoId && one.file === part.file,
  );
  held(
    part !== null && file !== undefined,
    'It sent a part of a file it was never handed, or something that is no part of a file.',
  );
  const { offset, length, bytes } = part;
  held(
    Number.isInteger(offset) &&
      Number.isInteger(length) &&
      bytes instanceof Uint8Array &&
      bytes.byteLength > 0,
    'It sent a part with no offset, no length or no bytes.',
  );
  held(
    length === file.bytes.byteLength,
    `A part of ${named(file)} said the file is ${String(length)} bytes long; it is ${String(file.bytes.byteLength)}.`,
  );
  held(
    (offset ?? 0) >= 0 && (offset ?? 0) + bytes.byteLength <= length,
    `A part of ${named(file)} went past the file’s length.`,
  );
  held(
    bytes.byteLength <= holds.filePartBytesAtMost,
    `A part of ${named(file)} held ${String(bytes.byteLength)} bytes; the server takes ${String(holds.filePartBytesAtMost)} at most.`,
  );
  return part as FilePartSent;
}

// The media endpoint as the suite plays it (ADR-482 (1), (2), (5)): a part is taken where it
// starts the file or goes on where the last one ended; whole, the file is kept where its bytes
// are the ones the client was handed, and answered not matched where `unmatched` says so (once
// for each file it names). A file kept is answered kept.
class FilesTaken {
  private readonly holds: SyncClientHolds;
  private readonly unmatched: Set<string>;
  private readonly taken = new Map<string, number[]>();
  readonly kept = new Set<string>();
  readonly parts: FilePartSent[] = [];

  constructor(holds: SyncClientHolds, unmatched: readonly string[] = []) {
    this.holds = holds;
    this.unmatched = new Set(unmatched);
  }

  take(sent: unknown): PhotoFileAnswer {
    const part = partOnTheWire(sent, this.holds);
    this.parts.push(part);
    const file = named(part);
    if (this.kept.has(file)) return { upload: 'KEPT' };
    const so = this.taken.get(file) ?? [];
    if (part.offset !== 0 && part.offset !== so.length) {
      return {
        upload: 'RECEIVING',
        received: so.length,
        length: so.length === 0 ? null : part.length,
      };
    }
    const now = part.offset === 0 ? [...part.bytes] : [...so, ...part.bytes];
    if (now.length < part.length) {
      this.taken.set(file, now);
      return { upload: 'RECEIVING', received: now.length, length: part.length };
    }
    this.taken.delete(file);
    if (this.unmatched.delete(file)) return { upload: 'NOT_MATCHED' };
    const handed = this.holds.files.find((one) => named(one) === file);
    held(
      handed !== undefined && same(now, [...handed.bytes]),
      `Its parts of ${file}, put together, are not the file it was handed.`,
    );
    this.kept.add(file);
    return { upload: 'KEPT' };
  }
}

// Every part it sends now, each answered by the endpoint as the suite plays it, until it sends
// none: no more than so many.
async function sentAll(client: SyncClient, taken: FilesTaken, most = 40): Promise<void> {
  for (let parts = 0; ; parts += 1) {
    const part = client.sendsFilePart();
    if (part === null) return;
    held(parts < most, `After ${String(most)} parts it is still sending.`);
    await client.filePartAnswered(JSON.parse(JSON.stringify(taken.take(part))));
  }
}

// A photograph's file as a phone's camera writes one: a JPEG's first bytes, then the rest; the
// depth file a PNG's. Made, never random, so the same call makes the same file.
const fileOf = (length: number, seed: number, kind: 'jpeg' | 'png' = 'jpeg'): Uint8Array => {
  const start =
    kind === 'jpeg' ? [0xff, 0xd8, 0xff, 0xe1] : [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return Uint8Array.from({ length }, (_, at) => start[at] ?? (at * 31 + seed) % 256);
};

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
        [
          sync.unplannedAssignments,
          sync.passcodeUses,
          sync.records,
          sync.photos,
          sync.lastUsed,
        ].every((part) => part.length === 0),
        'It holds nothing, and sent something.',
      );
    },
  },
  {
    name: 'each record is sent once, as recorded, under the id its phone made, as its own schema reads it: one of each kind, the photographs of two of them, the reports and the last numbers used beside them, and never which phone it is from nor where a file is kept (AC-10-35; ADR-466, 469, 481)',
    async run(make) {
      const holds = {
        ...nothing,
        unplannedAssignments: [unplanned],
        passcodeUses: [switched],
        records: oneOfEach,
        photos: [pilePhoto, ...certificationPhotos],
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
        sorted(sync.photos.map(({ id }) => id)) === sorted(holds.photos.map(({ id }) => id)),
        'The photographs it sent are not the ones it holds, each once.',
      );
      for (const photo of holds.photos) {
        held(
          same(
            sync.photos.find((each) => each.id === photo.id),
            photo,
          ),
          `Photograph ${photo.id} was not sent as it was taken.`,
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
  {
    name: 'no photograph’s record goes ahead of the record it is of: one whose record waits for the next sync waits with it, and goes in that sync or a later one (ARCHITECTURE §9 (2); ADR-481; C137)',
    async run(make) {
      const records = Array.from({ length: syncRecordsAtMost + 1 }, (_, index) =>
        collected(String(4000 + index)),
      );
      const [first] = records;
      const last = records.at(-1);
      held(first !== undefined && last !== undefined, 'The records are not all there.');
      const of = (record: SyncedRecord, id: string): SyncedPhoto => ({
        ...pilePhoto,
        id: made(id),
        owner: { kind: 'FIELD_EVENT', id: syncedRecordId(record) },
      });
      const client = await make({
        ...nothing,
        records,
        photos: [of(last, '4900'), of(first, '4901')],
      });
      const saved = new Set<string>();
      for (let syncs = 1; client.holds().length > 0; syncs += 1) {
        held(syncs <= 4, 'After four syncs, each answered "saved", it still holds something.');
        const sync = onTheWire(client.sends());
        const here = new Set(sync.records.map(syncedRecordId));
        for (const photo of sync.photos) {
          held(
            here.has(photo.owner.id) || saved.has(photo.owner.id),
            `Photograph ${photo.id} went in a sync ahead of the record it is of.`,
          );
        }
        here.forEach((id) => saved.add(id));
        await client.answered(answerTo(sync));
      }
    },
  },
  {
    name: 'a photograph’s file goes to the media endpoint only once its record is answered saved: none ahead of its sync, and none of one not saved, which it keeps with its file and shows as not saved in the server’s words (ADR-481, 482; C137)',
    async run(make) {
      const record = collected('71');
      const ofIt: SyncedPhoto = {
        ...pilePhoto,
        id: made('72'),
        owner: { kind: 'FIELD_EVENT', id: syncedRecordId(record) },
      };
      const notIts: SyncedPhoto = {
        ...pilePhoto,
        id: made('73'),
        owner: { kind: 'FIELD_EVENT', id: made('74') },
      };
      const holds = {
        ...nothing,
        records: [record],
        photos: [ofIt, notIts],
        files: [
          { photoId: ofIt.id, file: 'photo', bytes: fileOf(1500, 1) },
          { photoId: notIts.id, file: 'photo', bytes: fileOf(800, 2) },
        ],
      } satisfies SyncClientHolds;
      const client = await make(holds);
      held(
        client.sendsFilePart() === null,
        'It sent a part of a file before its photograph’s record was answered saved.',
      );
      const sync = onTheWire(client.sends());
      held(sync.photos.length === 2, 'It did not send both photographs’ records.');
      const message = 'Not saved: the record this photograph belongs to isn’t saved on the server.';
      await client.answered(
        answerTo(sync, undefined, (id) =>
          id === notIts.id
            ? { answer: 'NOT_SAVED', id, reason: 'OWNER_NOT_SAVED', message }
            : undefined,
        ),
      );
      const taken = new FilesTaken(holds);
      await sentAll(client, taken);
      held(
        taken.kept.has(named({ photoId: ofIt.id, file: 'photo' })) &&
          taken.parts.every((part) => part.photoId === ofIt.id),
        'It sent a part of the file of a photograph not saved, or did not send the saved one’s whole.',
      );
      held(
        sorted(client.holdsFiles()) === named({ photoId: notIts.id, file: 'photo' }),
        'It should hold the file of the photograph not saved, and no other.',
      );
      held(
        client.holds().includes(notIts.id) &&
          client
            .notSaved()
            .some(
              (one) =>
                one.id === notIts.id && one.reason === 'OWNER_NOT_SAVED' && one.message === message,
            ),
        'The photograph not saved is not kept and shown with the server’s reason and words.',
      );
    },
  },
  {
    name: 'a file goes in parts, each no larger than the server takes and each where the last one ended, saying the whole file’s length, until it is answered kept; put together they are the file as its phone wrote it, the depth file beside its photograph’s included, and a file kept is sent no more (AC-05-09; ADR-482 (1), (2), (6))',
    async run(make) {
      const withDepth = certificationPhotos.find(({ depthSha256 }) => depthSha256 !== null);
      held(withDepth !== undefined, 'The examples have no photograph with a depth file.');
      const holds = {
        ...nothing,
        photos: [pilePhoto, withDepth],
        files: [
          { photoId: pilePhoto.id, file: 'photo', bytes: fileOf(2500, 3) },
          { photoId: withDepth.id, file: 'photo', bytes: fileOf(1200, 4) },
          { photoId: withDepth.id, file: 'depth', bytes: fileOf(900, 5, 'png') },
        ],
      } satisfies SyncClientHolds;
      const client = await make(holds);
      await client.answered(answerTo(onTheWire(client.sends())));
      const taken = new FilesTaken(holds);
      await sentAll(client, taken);
      held(
        sorted([...taken.kept]) === sorted(holds.files.map(named)),
        'Not every file it held was sent whole and kept.',
      );
      for (const file of holds.files) {
        let next = 0;
        for (const part of taken.parts.filter((one) => named(one) === named(file))) {
          held(
            part.offset === next,
            `A part of ${named(file)} did not go where the last one ended.`,
          );
          next += part.bytes.byteLength;
        }
      }
      held(
        client.holdsFiles().length === 0 && client.sendsFilePart() === null,
        'A file answered kept is still held, or is sent again.',
      );
    },
  },
  {
    name: 'an interrupted upload goes on from where the server says it stands: with nothing back, or something that is no answer, the part goes again from where the server last stood; told the server holds none of it, once it let the file go, it starts the file again (AC-05-09; ADR-482 (2))',
    async run(make) {
      const bytes = fileOf(2600, 6);
      const holds = {
        ...nothing,
        photos: [pilePhoto],
        files: [{ photoId: pilePhoto.id, file: 'photo', bytes }],
      } satisfies SyncClientHolds;
      const client = await make(holds);
      await client.answered(answerTo(onTheWire(client.sends())));
      const next = (): FilePartSent => {
        const part = client.sendsFilePart();
        held(part !== null, 'It holds a file not yet kept, and sent no part of it.');
        return partOnTheWire(part, holds);
      };
      const first = next();
      held(first.offset === 0, 'Its first part did not start at the file’s first byte.');
      const after = first.bytes.byteLength;
      await client.filePartAnswered({ upload: 'RECEIVING', received: after, length: bytes.length });
      held(next().offset === after, 'Its second part did not go on where the first one ended.');
      for (const back of [undefined, 'OK', { upload: 'KEPT', received: after }]) {
        await client.filePartAnswered(back);
        held(
          next().offset === after,
          `With ${back === undefined ? 'nothing' : JSON.stringify(back)} back, its part did not go again from where the server last stood.`,
        );
      }
      await client.filePartAnswered({ upload: 'RECEIVING', received: 0, length: null });
      held(
        next().offset === 0,
        'Told the server holds none of the file, it did not start it again.',
      );
      const taken = new FilesTaken(holds);
      await sentAll(client, taken);
      held(
        taken.kept.has(named({ photoId: pilePhoto.id, file: 'photo' })) &&
          client.holdsFiles().length === 0,
        'After the interruption the file was not sent whole and kept.',
      );
    },
  },
  {
    name: 'a file answered not the one fingerprinted is kept and sent again from its first byte, until it is kept (ADR-482 (5))',
    async run(make) {
      const file = { photoId: pilePhoto.id, file: 'photo', bytes: fileOf(1800, 7) } as const;
      const holds = { ...nothing, photos: [pilePhoto], files: [file] } satisfies SyncClientHolds;
      const client = await make(holds);
      await client.answered(answerTo(onTheWire(client.sends())));
      const taken = new FilesTaken(holds, [named(file)]);
      await sentAll(client, taken);
      const whole = taken.parts.findIndex(
        (part) => part.offset + part.bytes.byteLength === part.length,
      );
      held(
        whole >= 0 && taken.parts[whole + 1]?.offset === 0,
        'Answered not matched, it did not send its file again from the first byte.',
      );
      held(
        taken.kept.has(named(file)) && client.holdsFiles().length === 0,
        'Answered not matched, it let its file go before it was kept.',
      );
    },
  },
  {
    name: 'a turn-in names everything the phone still holds, each once: what waits to be sent and each report, record and photograph the server did not store, by the id it was made under; a record answered not saved under no id by the fingerprint of what was sent, never by an id; each photograph whose files aren’t all kept; the last number it used of each series; the passcode as typed; never which phone it is (AC-02-58; ADR-468, 488)',
    async run(make) {
      const [saved, kept, unread] = [collected('61'), collected('62'), collected('63')];
      const file = { photoId: pilePhoto.id, file: 'photo', bytes: fileOf(600, 3) } as const;
      const lastUsed = [{ projectId: p1, series: 'LOAD', lastUsedNumber: 101006 }] as const;
      const client = await make({
        ...nothing,
        unplannedAssignments: [unplanned],
        passcodeUses: [switched],
        records: [saved, kept, unread],
        photos: [pilePhoto],
        files: [file],
        lastUsed: [...lastUsed],
      });
      const sync = onTheWire(client.sends());
      held(sync.records.length === 3, 'It did not send the three records it holds.');
      await client.answered({
        ...answerTo(sync, (id) =>
          id === syncedRecordId(kept)
            ? {
                answer: 'QUARANTINED',
                id,
                reason: 'DUPLICATE_FIELD_EVENT',
                message: 'Ticket 101001: this ticket already has a collection.',
                heldBy: made('99'),
              }
            : id === syncedRecordId(unread)
              ? {
                  answer: 'NOT_SAVED',
                  id: null,
                  reason: 'NOT_A_RECORD',
                  message: 'Not saved: this record can’t be read.',
                }
              : undefined,
        ),
        unplannedAssignments: [
          { assignmentId: unplanned.id, answer: 'NOT_SAVED', reason: 'UNKNOWN_PROJECT' },
        ],
        passcodeUses: [{ useId: switched.id, answer: 'NOT_SAVED', reason: 'NOT_A_MONITOR' }],
      } satisfies SyncAnswered);
      // Its photograph's record is saved; its file is not sent yet.
      const sent = turnInOnTheWire(await client.turnsIn(typed));
      held(sent.passcode === typed, 'It did not send the passcode as it was typed.');
      held(
        same(sent.lastUsed, lastUsed),
        'It did not send the last number it used of each series.',
      );
      held(
        sorted(sent.holds.unplannedAssignments) === sorted([unplanned.id]) &&
          sorted(sent.holds.passcodeUses) === sorted([switched.id]),
        'It did not name each report the server did not store, and only those.',
      );
      held(
        sorted(sent.holds.records) === sorted([syncedRecordId(kept)]),
        'It did not name, by its id, the record the server kept in quarantine, and only that: the saved one is no longer held, and one answered under no id goes by its fingerprint.',
      );
      held(
        sent.holds.held.length === 1,
        'It did not name the record answered not saved under no id by a fingerprint, once.',
      );
      held(
        sorted(sent.holds.photos) === sorted([pilePhoto.id]),
        'It did not name the photograph whose file is still on the phone.',
      );
      // A phone that never synced names what waits.
      const fresh = await make({ ...nothing, passcodeUses: [switched], records: [saved] });
      const waiting = turnInOnTheWire(await fresh.turnsIn(typed));
      held(
        sorted(waiting.holds.records) === sorted([syncedRecordId(saved)]) &&
          sorted(waiting.holds.passcodeUses) === sorted([switched.id]),
        'A phone that never synced did not name what waits to be sent.',
      );
    },
  },
  {
    name: 'it wipes only when it is answered to wipe: with no answer, with what is no answer, or answered not turned in, it keeps everything as it was and goes on as before (AC-02-58; ADR-096, 488)',
    async run(make) {
      const kept = collected('71');
      const waits = collected('72');
      const client = await make({ ...nothing, records: [kept] });
      const sync = onTheWire(client.sends());
      await client.answered(
        answerTo(sync, (id) => ({
          answer: 'QUARANTINED',
          id,
          reason: 'DUPLICATE_FIELD_EVENT',
          message: 'Ticket 101001: this ticket already has a collection.',
          heldBy: made('99'),
        })),
      );
      const before = sorted(client.holds());
      for (const answer of [
        undefined,
        { turnedIn: true },
        { ...turnedIn, wipe: false },
        notTurnedIn({
          unplannedAssignments: [],
          passcodeUses: [],
          records: [syncedRecordId(kept)],
          held: [],
          photos: [],
        }),
      ]) {
        turnInOnTheWire(await client.turnsIn(typed));
        await client.turnInAnswered(
          answer === undefined ? undefined : JSON.parse(JSON.stringify(answer)),
        );
        held(
          !client.wiped() && sorted(client.holds()) === before,
          `Answered ${answer === undefined ? 'nothing' : JSON.stringify(answer)}, it let go of what it held.`,
        );
        held(client.notSaved().length === 1, 'It no longer shows the record not saved.');
      }
      // It goes on as before: a record made since goes in the next sync.
      const later = await make({ ...nothing, records: [waits] });
      turnInOnTheWire(await later.turnsIn(typed));
      await later.turnInAnswered(undefined);
      held(
        onTheWire(later.sends()).records.length === 1,
        'After a turn-in with no answer, what waited is not sent.',
      );
    },
  },
  {
    name: 'answered to wipe, it wipes everything it held: no record, report, photograph or file is left, nothing is shown as not saved, and it sends nothing more (AC-02-58, 61; ADR-096, 488)',
    async run(make) {
      const kept = collected('81');
      const file = { photoId: pilePhoto.id, file: 'photo', bytes: fileOf(600, 5) } as const;
      const client = await make({
        ...nothing,
        passcodeUses: [switched],
        records: [kept],
        photos: [pilePhoto],
        files: [file],
      });
      const sync = onTheWire(client.sends());
      await client.answered({
        ...answerTo(sync, (id) => ({
          answer: 'NOT_SAVED',
          id,
          reason: 'NAMES_NO_RECORD',
          message: 'Not saved: this record names something the server doesn’t have.',
        })),
        passcodeUses: [{ useId: switched.id, answer: 'NOT_SAVED', reason: 'NOT_A_MONITOR' }],
      } satisfies SyncAnswered);
      held(!client.wiped(), 'It wiped itself before it was turned in.');
      turnInOnTheWire(await client.turnsIn(typed));
      await client.turnInAnswered(JSON.parse(JSON.stringify(turnedIn)));
      held(client.wiped(), 'Answered to wipe, it did not say it wiped.');
      held(
        client.holds().length === 0 &&
          client.holdsFiles().length === 0 &&
          client.notSaved().length === 0,
        'Answered to wipe, it still holds something, or shows something as not saved.',
      );
      const after = onTheWire(client.sends());
      held(
        after.records.length === 0 &&
          after.photos.length === 0 &&
          after.passcodeUses.length === 0 &&
          client.sendsFilePart() === null,
        'Answered to wipe, it still sends something.',
      );
      // A phone whose answer to its last sync never came, told to wipe all the same, wipes
      // what waited too.
      const waited = await make({ ...nothing, unplannedAssignments: [unplanned], records: [kept] });
      turnInOnTheWire(await waited.turnsIn(typed));
      await waited.turnInAnswered(JSON.parse(JSON.stringify(turnedIn)));
      held(
        waited.wiped() &&
          waited.holds().length === 0 &&
          onTheWire(waited.sends()).records.length === 0,
        'Answered to wipe, it kept what waited to be sent.',
      );
    },
  },
  {
    name: 'no sync weighs more than the contract lets one: records heavier together than a sync may be, each with its photograph, go over several syncs, each within its weight, nothing lost and nothing twice (AC-05-51, AC-10-41; ADR-504)',
    async run(make) {
      // The most words a monitor may type at the curb, each character three bytes: a sync's
      // count of these weighs more than two syncs may, and a photograph of each beside them.
      const heavy = '€'.repeat(2000);
      const records = Array.from({ length: syncRecordsAtMost }, (_, index) =>
        collected(String(4000 + index), { notes: heavy, address: heavy }),
      );
      const holds = {
        ...nothing,
        records,
        photos: records.map((record, index) => ({
          ...pilePhoto,
          id: made(String(6000 + index)),
          owner: { kind: 'FIELD_EVENT' as const, id: syncedRecordId(record) },
        })),
      } satisfies SyncClientHolds;
      const everything = [...records.map(syncedRecordId), ...holds.photos.map(({ id }) => id)];
      const client = await make(holds);
      const went: string[] = [];
      let syncs = 0;
      while (client.holds().length > 0) {
        syncs += 1;
        held(syncs <= 6, 'After six syncs, each answered "saved", it still holds something.');
        // A sync heavier than a sync may be is no sync the contract reads.
        const sync = onTheWire(client.sends());
        const ids = [...sync.records.map(syncedRecordId), ...sync.photos.map(({ id }) => id)];
        held(ids.length > 0, 'It holds something and sent nothing.');
        went.push(...ids);
        await client.answered(answerTo(sync));
      }
      held(sorted(went) === sorted(everything), 'Not everything it held was sent, each once.');
    },
  },
  {
    name: 'told to wait (429 LIMITED, 503 BUSY): nothing is taken for saved or shown as not saved, everything stays, and it goes again as it was, under the same ids (AC-10-41, AC-10-71; ADR-416, 524)',
    async run(make) {
      for (const code of waitAnswers) {
        const records = [collected('71'), collected('72', { siteId: landfill })];
        const client = await make({ ...nothing, passcodeUses: [switched], records });
        const first = onTheWire(client.sends());
        const told = { code, requestId: 'a-request', retryAfterSeconds: 5 };
        held(toldToWait(told) === 5, `The contract reads no wait in ${code}.`);
        await client.answered(told);
        const all = [switched.id, ...records.map(syncedRecordId)];
        held(
          sorted(client.holds()) === sorted(all),
          `Told to wait (${code}), it let go of something.`,
        );
        held(
          client.notSaved().length === 0,
          `Told to wait (${code}), it shows something as not saved.`,
        );
        const second = onTheWire(client.sends());
        held(
          same(second.records, first.records) && same(second.passcodeUses, first.passcodeUses),
          `Told to wait (${code}), what it sent again is not what it sent before.`,
        );
      }
    },
  },
  {
    name: 'a record goes as it was made, whatever its lists hold now: a certification naming a helper the lists taken since no longer name is still sent, once and unchanged, never dropped or picked again; a phone warns, and never refuses (ADR-052, 421, 552 (3)(f); AC-10-120)',
    async run(make) {
      const made: SyncedRecord = { record: 'CERTIFICATION', certification };
      const lists = listsAfterwards;
      held(
        certification.helperIds.some((id) => !lists.helpers.some((one) => one.id === id)),
        'The suite’s own lists still name the helper its certification picked.',
      );
      const client = await make({ ...nothing, records: [made], lists });
      const sync = onTheWire(client.sends());
      held(
        sync.records.length === 1 && same(sync.records[0], made),
        'The certification was not sent as it was made, once, with the lists it holds now.',
      );
    },
  },
];
