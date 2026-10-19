// What the phone holds to send, and its half of every sync (ARCHITECTURE §8, §9; adms-field-app
// §4A.5; BACKLOG 3.4.1, REQ-308, 308c, C128, C130, C132, C139, C181; AC-05-06, 07, 20, 46,
// AC-11-28, 29, 31; ADR-022, 052, 457, 467…470, 472, 481…483, 488, 504, 577, 578). The field app's
// own client of the sync contract: it passes `syncClientSuite` over the phone's own store, and
// reads every answer by the contract's rule (`syncAnswerRead`) and nothing else.
//
// **Kept in the store, sealed** (ADR-570): a record the monitor submitted on the `records` shelf
// under the id it was made under, in the order kept, with what the server answered of it; an
// earlier monitor's on `archivedQueues` under their id (`PhoneSetup.passedOn`, ADR-577), sent the
// same way, after the phone's own and never shown to the next monitor; a photograph's record and
// its files on `photographs`; the reports the phone made on `keptAnswers`, as `PhoneReports` keeps
// them. **A record is sealed once kept** (ADR-477): it goes as it was made, whatever the phone's
// lists hold since, and is never changed here. What the contract can't read, or what weighs more
// than a record may, is never kept: the capture says so before it is submitted (AC-11-29).
//
// **One sync at a time, as it goes on the wire** (`sends`): the phone's clock and offset; the
// reports not yet answered, oldest first; the records waiting, a scale receipt ahead of the
// disposal that points at it and none ahead of an unplanned assignment that waits for the next
// sync; then each record kept not stored, once a time the store is read (below); the photographs'
// records whose records are not left for a later sync; the last number used of each series; what
// it holds. **Never more than the contract's counts, nor heavier than its weight** (`fitByWeight`):
// the rest goes in the next.
//
// **Answered** (`answered`): only `SAVED` and `ALREADY_SAVED` take a thing off the phone's list of
// what it still has to send; a record stored stays in the store marked so until the phone is wiped
// (AC-11-07: the records shelf holds what was made, sent or not), never sent again. `QUARANTINED`
// and `NOT_SAVED` are kept with the server's reason and words and shown (AC-05-20, 46, AC-11-31).
// What is no answer to what was sent (nothing came, a wait, the wrong shape, answers out of place)
// marks nothing, and the same sync goes again. Every change an answer makes is kept together, or
// none of it (the store's own rule).
//
// **A record kept not stored goes again by itself** (ADR-470 (3), proposed here: ADR-578): with
// the first sync after the store is read, once, after what waits, so the phone learns when a
// person resolved it on the server (held and saved as corrected, or a quarantine resolved: then
// answered already saved, it leaves the list); sent again it is the same text, so the server knows
// it by the same id and the same fingerprint and adds nothing. A report answered not saved is not
// sent again (a person can only close it on the server, ADR-526 (5)).
//
// **A photograph answered not saved because its record isn't saved on the server**
// (`OWNER_NOT_SAVED`, ADR-481 (4)) is kept and shown, and goes again: in the next sync once its
// record is answered saved, and otherwise once a time the store is read, as a kept record does,
// so it is saved once a person saved its record on the server. A photograph not saved for any
// other reason is not sent again (a person can only close it, ADR-526 (4)).
//
// **A photograph's files** (BACKLOG 3.4.2; AC-11-32, 33; ADR-482, 579) go only once its record
// is answered saved (a photograph whose record the server holds for a person is answered saved,
// ADR-526 (4), and its files go while the record is still shown not saved), after every sync of
// the run, a part at a time, each where the server said it stands. **The store keeps each
// file's bytes on a shelf of their own** (`photoFiles`) and a note of it beside its photograph's
// record (its length, and whether a part of it has gone), so a read of the store reads no file:
// **one file's bytes are read at a time**, the one going now. **Where the server stands with a
// file is known in memory alone**: opened again after a part of a file went, the phone asks the
// media endpoint where the file stands before it sends more of it (`photoFileEndpoint`), never
// starting it again from its first byte, which would lose what the server took. **A part is
// never larger than the server takes** (`MEDIA_PART_BYTES_AT_MOST`) **and smaller on a poor
// signal**: each is sized to go in about ten seconds at the speed the last one went, never under
// 64 KiB, and one with no answer halves the next. A file answered not the one fingerprinted goes
// again from its first byte, and rests until the next run where it is answered so twice.
// **Turned in** ("Sync and turn in", task 3.4.3, ADR-580), it names everything it still holds, and
// wipes only on `wipe: true`, or where the server's refusal of its key says a turn-in whose answer
// never came was done (`turnedInUnanswered`). **A record or a photograph's record the contract
// no longer reads** (kept by an earlier release, C183) is never sent; it is named at turn-in by
// the fingerprint of what stands in its place, so the phone is wiped over it only where the
// server holds that same thing from this phone, and the screen says how many there are.
import { sha256 } from '@noble/hashes/sha2.js';
import {
  fitByWeight,
  photoFileAnswerRead,
  photoFileGoesOnFrom,
  photoFileStandsAt,
  photoRead,
  recordRead,
  sentCanonical,
  stored,
  syncAnswerRead,
  syncedRecordAssignment,
  syncedRecordId,
  syncPasscodeUsesAtMost,
  syncPhotosAtMost,
  syncRecordsAtMost,
  syncUnplannedAssignmentsAtMost,
  toWipe,
  turnInAnswerRead,
  type FileAsked,
  type FilePartSent,
  type LastUsedReport,
  type PasscodeUseReport,
  type PhotoFileName,
  type ShownNotSaved,
  type SyncAnswered,
  type SyncedPhoto,
  type SyncedRecord,
  type SyncSent,
  type TurnInAnswer,
  type TurnInSent,
  type UnplannedAssignmentReport,
} from '@open-adms/contracts';
import { NotSaved, type NotSavedNotice } from '@open-adms/domain';

import type { Change, Json, PhoneStore, Shelf } from '../store/phone-store.ts';
import { offsetOf, PhoneReports, type HeldReport } from './reports.ts';

// What the server answered of a thing sent: its answer, the id it was answered under (none where
// it couldn't read one), and, where it wasn't stored, its reason and words.
export interface Told {
  readonly answer: string;
  readonly id: string | null;
  readonly reason: string | null;
  readonly message: string | null;
}

// What a sync says the phone holds, and the last number it used of each series it holds: read
// afresh each time the store is (the lists and the passcode's check are their own modules').
export interface Holding {
  readonly holds: SyncSent['holds'];
  readonly lastUsed: readonly LastUsedReport[];
}

// One thing the phone shows as not saved, as the sync screen says it: what it is (a record as it
// was made), the server's reason, and its words for a record or a photograph (a report has none).
export type NotSavedShown = ShownNotSaved &
  (
    | { readonly kind: 'unplannedAssignment' | 'passcodeUse' | 'photo' }
    | { readonly kind: 'record'; readonly record: SyncedRecord }
  );

// A record or a photograph's record as the store keeps it, and where.
interface Entry<T> {
  readonly shelf: Shelf;
  readonly storeId: string;
  readonly id: string;
  readonly kept: number;
  readonly value: T;
  readonly told: Told | null;
  // An earlier monitor's, from the archived queues.
  readonly archived: boolean;
}

// A photograph's file the phone holds, as its note says, and where it goes on from: as the
// server last said, or `undefined` where the phone no longer knows (opened again after a part of
// it went) and asks the server first.
interface HeldFile {
  readonly photoId: string;
  readonly file: PhotoFileName;
  readonly length: number;
  begun: boolean;
  from: number | undefined;
}

// What went in the sync sent last, each in its place.
interface Sent {
  readonly sync: SyncSent;
  readonly unplanned: readonly HeldReport<UnplannedAssignmentReport>[];
  readonly uses: readonly HeldReport<PasscodeUseReport>[];
  readonly records: readonly Entry<SyncedRecord>[];
  readonly photos: readonly Entry<SyncedPhoto>[];
}

export interface OutboxOptions {
  // What a sync says the phone holds, and the numbers it reports.
  readonly holding: () => Promise<Holding>;
  // The most a part of a file may hold, as the server it sends to takes them.
  readonly filePartBytesAtMost: number;
  // The most a whole file may hold, as the server takes them (`MEDIA_FILE_BYTES_AT_MOST`): one
  // larger is never kept, for it would never go. None, where it isn't told.
  readonly fileBytesAtMost?: number;
  // The wipe, on the server's `wipe: true` alone: the keyring's erase, then the store's.
  readonly wipe: () => Promise<void>;
  readonly now?: () => Date;
}

const photoPrefix = 'photo:';
const filePrefix = 'file:';
const photoFileNames: readonly PhotoFileName[] = ['photo', 'depth'];
// The least a part holds, however poor the signal: each part is a request of its own, counted
// against the phone's parts a minute (`RATE_LIMIT_FILE_PARTS_PER_PHONE`). *Agent default.*
const partBytesAtLeast = 65_536;
// How long a part is meant to take, at the speed the last one went: one slower than that is a
// poor signal's, and the next is smaller. *Agent default.*
const partAimMs = 10_000;
// A file answered not the one fingerprinted this many times in a run rests until the next.
const notMatchedInARun = 2;

const fileName = (photoId: string, file: PhotoFileName): string => `${photoId} ${file}`;

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

// The fingerprint a thing sent with no id the server could read is named by at turn-in: the
// SHA-256, in hex, of what was sent as canonical JSON in UTF-8, as the server makes it (ADR-488).
export const sentPrint = (sent: unknown): string =>
  hex(sha256(new TextEncoder().encode(sentCanonical(JSON.parse(JSON.stringify(sent))))));

// What the store keeps that the contract no longer reads, named as the server would name it had
// it been sent (ADR-488): the fingerprint of what stands in the record's place, or of all of it
// where nothing does. None where the server answered it stored.
function unreadPrint(kept: unknown, field: 'record' | 'photo'): string[] {
  const fields =
    typeof kept === 'object' && kept !== null && !Array.isArray(kept)
      ? (kept as Readonly<Record<string, unknown>>)
      : {};
  const told = toldOf(fields['told']);
  if (told !== null && stored(told)) return [];
  return [sentPrint(field in fields ? fields[field] : kept)];
}

// A file's note as the store keeps it: its length, and whether a part of it has gone.
function noteOf(kept: unknown): { length: number; begun: boolean } | undefined {
  if (typeof kept !== 'object' || kept === null || Array.isArray(kept)) return undefined;
  const { length, begun } = kept as Readonly<Record<string, unknown>>;
  return typeof length === 'number' && Number.isInteger(length) && length > 0
    ? { length, begun: begun === true }
    : undefined;
}

function toldOf(kept: unknown): Told | null {
  if (typeof kept !== 'object' || kept === null || Array.isArray(kept)) return null;
  const { answer, id, reason, message } = kept as Readonly<Record<string, unknown>>;
  if (typeof answer !== 'string') return null;
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return { answer, id: text(id), reason: text(reason), message: text(message) };
}

const toldBy = (answer: { readonly answer: string; readonly id: string | null }): Told => ({
  answer: answer.answer,
  id: answer.id,
  reason: 'reason' in answer && typeof answer.reason === 'string' ? answer.reason : null,
  message: 'message' in answer && typeof answer.message === 'string' ? answer.message : null,
});

// A record or a photograph's record read back from the store, by the contract's own schema: what
// it doesn't read is no entry (the phone keeps only what the contract reads).
function entryOf<T>(
  shelf: Shelf,
  storeId: string,
  kept: unknown,
  field: 'record' | 'photo',
  read: (value: unknown) => { id: string; value: T } | undefined,
): Entry<T> | undefined {
  if (typeof kept !== 'object' || kept === null || Array.isArray(kept)) return undefined;
  const fields = kept as Readonly<Record<string, unknown>>;
  const order = fields['kept'];
  if (typeof order !== 'number' || !(field in fields)) return undefined;
  const made = read(fields[field]);
  if (made === undefined) return undefined;
  return {
    shelf,
    storeId,
    id: made.id,
    kept: order,
    value: made.value,
    told: toldOf(fields['told']),
    archived: shelf === 'archivedQueues',
  };
}

const recordOf = (value: unknown): { id: string; value: SyncedRecord } | undefined => {
  const read = recordRead(value);
  // As it was kept, never as the schema rewrote it: it goes as it was made.
  return read.read ? { id: syncedRecordId(read.record), value: value as SyncedRecord } : undefined;
};

const photoOf = (value: unknown): { id: string; value: SyncedPhoto } | undefined => {
  const read = photoRead(value);
  return read.read ? { id: read.photo.id, value: value as SyncedPhoto } : undefined;
};

// The reports held after a sync's answers: "saved" or "already saved" drops one, "not saved" keeps
// it with the reason, and one not answered stays as it was.
function answeredReports<R extends { readonly id: string }>(
  held: readonly HeldReport<R>[],
  told: ReadonlyMap<string, { readonly answer: string; readonly reason: string | null }>,
): HeldReport<R>[] {
  return held.flatMap((one) => {
    const answer = told.get(one.report.id);
    if (answer === undefined) return [one];
    if (answer.answer !== 'NOT_SAVED') return [];
    return [{ report: one.report, notSaved: answer.reason ?? 'NOT_SAVED' }];
  });
}

const byKept = <T>(one: Entry<T>, other: Entry<T>): number =>
  Number(one.archived) - Number(other.archived) || one.kept - other.kept;

export class PhoneOutbox {
  private readonly store: PhoneStore;
  private readonly options: OutboxOptions;
  private readonly now: () => Date;
  private unplanned: HeldReport<UnplannedAssignmentReport>[] = [];
  private uses: HeldReport<PasscodeUseReport>[] = [];
  // Records and photographs' records the server has not said it stored.
  private records: Entry<SyncedRecord>[] = [];
  private photos: Entry<SyncedPhoto>[] = [];
  private files = new Map<string, HeldFile>();
  // The one file whose bytes it holds in memory: the one going now.
  private loaded: { readonly name: string; readonly bytes: Uint8Array } | undefined;
  // The photographs answered saved since the store was read, whose files may go.
  private readonly savedPhotos = new Set<string>();
  // Kept records sent again since the store was read: each goes again once. And photographs
  // waiting for their record, sent again since: each goes again once more after its record is
  // answered saved.
  private readonly sentAgain = new Set<string>();
  private readonly photosSentAgain = new Set<string>();
  // The files answered not the one fingerprinted in this run, how often; those resting till the
  // next; how much the next part holds; and when the part sent last went.
  private readonly notMatched = new Map<string, number>();
  private readonly resting = new Set<string>();
  private partBytes: number;
  private partSentAt = 0;
  private lastAsked: FileAsked | undefined;
  private holding: Holding = {
    holds: { masterPasscodeVersion: null, listsProjectId: null },
    lastUsed: [],
  };
  // The fingerprints of what the store holds that the contract no longer reads, not answered
  // stored: never sent, named at turn-in.
  private unread: string[] = [];
  private next = 1;
  private last: Sent | undefined;
  private lastPart: FilePartSent | undefined;
  private isWiped = false;

  private constructor(store: PhoneStore, options: OutboxOptions) {
    this.store = store;
    this.options = options;
    this.now = options.now ?? (() => new Date());
    this.partBytes = options.filePartBytesAtMost;
  }

  // The outbox as the store holds it now.
  static async opened(store: PhoneStore, options: OutboxOptions): Promise<PhoneOutbox> {
    const outbox = new PhoneOutbox(store, options);
    await outbox.read();
    return outbox;
  }

  // Everything read afresh from the store: what another part of the app kept since (a report, an
  // earlier monitor's records moved to the archived queues) is in the next sync. A kept record
  // goes again once more after it.
  async read(): Promise<void> {
    if (this.isWiped) return;
    const reports = new PhoneReports(this.store);
    const [kept, records, archived, photographs, holding] = await Promise.all([
      reports.kept(),
      this.store.readAll('records'),
      this.store.readAll('archivedQueues'),
      this.store.readAll('photographs'),
      this.options.holding(),
    ]);
    this.unplanned = kept.unplannedAssignments;
    this.uses = kept.passcodeUses;
    const read = [
      ...records.map((one) => ({
        kept: one.value,
        entry: entryOf('records', one.id, one.value, 'record', recordOf),
      })),
      ...archived.map((one) => ({
        kept: one.value,
        entry: entryOf('archivedQueues', one.id, one.value, 'record', recordOf),
      })),
    ];
    const photosRead = photographs
      .filter(({ id }) => id.startsWith(photoPrefix))
      .map((one) => ({
        kept: one.value,
        entry: entryOf('photographs', one.id, one.value, 'photo', photoOf),
      }));
    const all = read.flatMap(({ entry }) => (entry === undefined ? [] : [entry]));
    const pictures = photosRead.flatMap(({ entry }) => (entry === undefined ? [] : [entry]));
    this.unread = [
      ...new Set(
        [
          ...read.map((one) => ({ ...one, field: 'record' as const })),
          ...photosRead.map((one) => ({ ...one, field: 'photo' as const })),
        ].flatMap(({ kept, entry, field }) =>
          entry === undefined ? unreadPrint(kept, field) : [],
        ),
      ),
    ];
    this.next =
      Math.max(0, ...all.map(({ kept }) => kept), ...pictures.map(({ kept }) => kept)) + 1;
    this.records = all.filter(({ told }) => told === null || !stored(told)).sort(byKept);
    this.photos = pictures.filter(({ told }) => told === null || !stored(told)).sort(byKept);
    this.savedPhotos.clear();
    for (const { id, told } of pictures)
      if (told !== null && stored(told)) this.savedPhotos.add(id);
    // Each file by its note, its bytes left in the store. Where the server stands with one is
    // known only from this outbox's own answers: one that has gone in part and isn't known here
    // is asked after first.
    const files = new Map<string, HeldFile>();
    for (const { id, value } of photographs) {
      if (!id.startsWith(filePrefix)) continue;
      const note = noteOf(value);
      const [photoId, file] = id.slice(filePrefix.length).split(' ');
      const named = photoFileNames.find((one) => one === file);
      if (note === undefined || photoId === undefined || named === undefined) continue;
      const name = fileName(photoId, named);
      const before = this.files.get(name);
      const begun = note.begun || before?.begun === true;
      files.set(name, {
        photoId,
        file: named,
        length: note.length,
        begun,
        from: before !== undefined ? before.from : begun ? undefined : 0,
      });
    }
    this.files = files;
    this.sentAgain.clear();
    this.photosSentAgain.clear();
    this.notMatched.clear();
    this.resting.clear();
    this.holding = holding;
    await this.loadNext();
  }

  // A record the monitor submitted, kept now, sealed (AC-11-29): what the contract doesn't read,
  // or what weighs more than a record may, is not kept, and why is the answer.
  async keep(record: SyncedRecord): Promise<NotSavedNotice | undefined> {
    const read = recordRead(record);
    if (!read.read) return read.notice;
    const id = syncedRecordId(read.record);
    // As the store will read it back: JSON's, nothing unset.
    const made = JSON.parse(JSON.stringify(record)) as SyncedRecord;
    const entry: Entry<SyncedRecord> = {
      shelf: 'records',
      storeId: id,
      id,
      kept: this.next,
      value: made,
      told: null,
      archived: false,
    };
    await this.store.change([{ shelf: 'records', id, value: this.stored(entry, 'record') }]);
    this.next += 1;
    this.records.push(entry);
    return undefined;
  }

  // A photograph's record and its files, kept together: what the contract doesn't read is not.
  async keepPhoto(
    photo: SyncedPhoto,
    files: readonly { readonly file: PhotoFileName; readonly bytes: Uint8Array }[],
  ): Promise<NotSavedNotice | undefined> {
    const read = photoRead(photo);
    if (!read.read) return read.notice;
    const refused = this.notKeepable(files, photo.depthSha256 !== null);
    if (refused !== undefined) return refused;
    const entry: Entry<SyncedPhoto> = {
      shelf: 'photographs',
      storeId: `${photoPrefix}${photo.id}`,
      id: photo.id,
      kept: this.next,
      value: JSON.parse(JSON.stringify(photo)) as SyncedPhoto,
      told: null,
      archived: false,
    };
    await this.store.change([
      { shelf: 'photographs', id: entry.storeId, value: this.stored(entry, 'photo') },
      ...this.fileChanges(photo.id, files),
    ]);
    this.next += 1;
    this.photos.push(entry);
    for (const { file, bytes } of files) this.holdFile(photo.id, file, bytes);
    await this.loadNext();
    return undefined;
  }

  // A photograph's file whose record the server has already (as the suite hands one): what it
  // couldn't send is not kept, and why is the answer.
  async keepFile(
    photoId: string,
    file: PhotoFileName,
    bytes: Uint8Array,
  ): Promise<NotSavedNotice | undefined> {
    const refused = this.notKeepable([{ file, bytes }], file === 'depth');
    if (refused !== undefined) return refused;
    await this.store.change(this.fileChanges(photoId, [{ file, bytes }]));
    this.holdFile(photoId, file, bytes);
    await this.loadNext();
    return undefined;
  }

  // The next sync, as it goes on the wire now.
  sends(): SyncSent {
    const clockAt = this.now();
    const waitingUnplanned = this.unplanned.filter(({ notSaved }) => notSaved === null);
    const unplanned = waitingUnplanned.slice(0, syncUnplannedAssignmentsAtMost);
    const waits = new Set(
      waitingUnplanned.slice(syncUnplannedAssignmentsAtMost).map(({ report }) => report.id),
    );
    const uses = this.uses
      .filter(({ notSaved }) => notSaved === null)
      .slice(0, syncPasscodeUsesAtMost);
    const sync: SyncSent = {
      clockAt: clockAt.toISOString(),
      deviceUtcOffsetMinutes: offsetOf(clockAt),
      unplannedAssignments: unplanned.map(({ report }) => report),
      passcodeUses: uses.map(({ report }) => report),
      records: [],
      photos: [],
      lastUsed: [...this.holding.lastUsed],
      holds: { ...this.holding.holds },
    };
    // What waits first, then what was kept not stored and not yet sent again; a scale receipt
    // ahead of the disposal that points at it.
    const ordered: Entry<SyncedRecord>[] = [];
    const candidates = [
      ...this.records.filter(({ told }) => told === null),
      ...this.records.filter(({ told, id }) => told !== null && !this.sentAgain.has(id)),
    ];
    for (const entry of candidates) {
      const record = entry.value;
      const pointsAtIt =
        record.record === 'SCALE_RECEIPT'
          ? ordered.findIndex(
              ({ value }) =>
                value.record === 'FIELD_EVENT' &&
                value.fieldEvent.scaleReceiptId === record.scaleReceipt.id,
            )
          : -1;
      if (pointsAtIt >= 0) ordered.splice(pointsAtIt, 0, entry);
      else ordered.push(entry);
    }
    const byCount = ordered
      .filter(({ value }) => !waits.has(syncedRecordAssignment(value) ?? ''))
      .slice(0, syncRecordsAtMost);
    const going = byCount.slice(
      0,
      fitByWeight(
        sync,
        byCount.map(({ value }) => value),
      ),
    );
    sync.records = going.map(({ value }) => value);
    const goingIds = new Set(going.map(({ id }) => id));
    const staying = new Set(
      this.records.filter(({ told, id }) => told === null && !goingIds.has(id)).map(({ id }) => id),
    );
    const photosByCount = [
      ...this.photos.filter(({ told }) => told === null),
      ...this.photos.filter((entry) => this.waitsForItsRecord(entry)),
    ]
      .filter(({ value }) => !staying.has(value.owner.id))
      .slice(0, syncPhotosAtMost);
    const photos = photosByCount.slice(
      0,
      fitByWeight(
        sync,
        photosByCount.map(({ value }) => value),
      ),
    );
    sync.photos = photos.map(({ value }) => value);
    this.last = { sync, unplanned, uses, records: going, photos };
    return sync;
  }

  // Whether the next sync would carry anything but the phone's clock, its numbers and what it
  // holds: a report or a record waiting, a kept record not yet sent again, or a photograph's record.
  goesNext(): boolean {
    return (
      this.unplanned.some(({ notSaved }) => notSaved === null) ||
      this.uses.some(({ notSaved }) => notSaved === null) ||
      this.records.some(({ told, id }) => told === null || !this.sentAgain.has(id)) ||
      this.photos.some((entry) => entry.told === null || this.waitsForItsRecord(entry))
    );
  }

  // What came back for the sync sent last, as it came off the wire; `undefined` where nothing did.
  // The answer, read; or null where it is none, and nothing was marked.
  async answered(answer: unknown): Promise<SyncAnswered | null> {
    const last = this.last;
    this.last = undefined;
    if (last === undefined || this.isWiped) return null;
    const read = answer === undefined ? null : syncAnswerRead(last.sync, answer);
    if (read === null) return null;
    const changes: Change[] = [];
    last.unplanned.forEach(({ report }, place) => {
      const each = read.unplannedAssignments[place];
      if (each !== undefined) {
        changes.push(PhoneReports.answeredChange(report, 'unplannedAssignment', each));
      }
    });
    last.uses.forEach(({ report }, place) => {
      const each = read.passcodeUses[place];
      if (each !== undefined)
        changes.push(PhoneReports.answeredChange(report, 'passcodeUse', each));
    });
    // Each answer is in the place of what it answers (`syncAnswerRead`).
    const recordsTold = last.records.map((entry, place) => ({
      ...entry,
      told: toldBy(read.records[place] ?? { answer: 'NOT_SAVED', id: null }),
    }));
    const photosTold = last.photos.map((entry, place) => ({
      ...entry,
      told: toldBy(read.photos[place] ?? { answer: 'NOT_SAVED', id: null }),
    }));
    for (const entry of recordsTold) {
      changes.push({ shelf: entry.shelf, id: entry.storeId, value: this.stored(entry, 'record') });
    }
    for (const entry of photosTold) {
      changes.push({ shelf: entry.shelf, id: entry.storeId, value: this.stored(entry, 'photo') });
    }
    // Kept together, or none of it; then the phone's own list is what the store says.
    await this.store.change(changes);
    this.unplanned = answeredReports(
      this.unplanned,
      new Map(read.unplannedAssignments.map((each) => [each.assignmentId, each])),
    );
    this.uses = answeredReports(
      this.uses,
      new Map(read.passcodeUses.map((each) => [each.useId, each])),
    );
    for (const entry of recordsTold) {
      this.sentAgain.add(entry.id);
      this.records = this.records.flatMap((one) =>
        one.id !== entry.id ? [one] : stored(entry.told) ? [] : [entry],
      );
    }
    for (const entry of photosTold) {
      const isStored = stored(entry.told);
      if (isStored) this.savedPhotos.add(entry.id);
      else this.photosSentAgain.add(entry.id);
      this.photos = this.photos.flatMap((one) =>
        one.id !== entry.id ? [one] : isStored ? [] : [entry],
      );
    }
    // A photograph waiting for its record goes again once its record is answered saved.
    const recordsStored = new Set(
      recordsTold.filter(({ told }) => stored(told)).map(({ id }) => id),
    );
    for (const { id, value } of this.photos) {
      if (recordsStored.has(value.owner.id)) this.photosSentAgain.delete(id);
    }
    await this.loadNext();
    return read;
  }

  // The id of every record, photograph, unplanned assignment and use of the passcode it holds that
  // the server has not said it stored.
  holds(): readonly string[] {
    return [
      ...this.unplanned.map(({ report }) => report.id),
      ...this.uses.map(({ report }) => report.id),
      ...this.records.map(({ id }) => id),
      ...this.photos.map(({ id }) => id),
    ];
  }

  // How many things of the monitor's are still to go: reports, records and photographs' records
  // not yet answered. An earlier monitor's are sent, never counted for the next.
  waiting(): number {
    return (
      this.unplanned.filter(({ notSaved }) => notSaved === null).length +
      this.uses.filter(({ notSaved }) => notSaved === null).length +
      this.records.filter(({ told, archived }) => told === null && !archived).length +
      this.photos.filter(({ told, archived }) => told === null && !archived).length
    );
  }

  // What it shows as not saved, with the server's reason and words: never an earlier monitor's.
  notSaved(): readonly NotSavedShown[] {
    const reports = [
      ...this.unplanned.map((held) => ({ held, kind: 'unplannedAssignment' as const })),
      ...this.uses.map((held) => ({ held, kind: 'passcodeUse' as const })),
    ].flatMap(({ held, kind }) =>
      held.notSaved === null
        ? []
        : [{ kind, id: held.report.id, reason: held.notSaved, message: null }],
    );
    const records = this.records.flatMap(({ id, told, archived, value }) =>
      told === null || archived
        ? []
        : [
            {
              kind: 'record' as const,
              id,
              reason: told.reason ?? told.answer,
              message: told.message,
              record: value,
            },
          ],
    );
    const photos = this.photos.flatMap(({ id, told, archived }) =>
      told === null || archived
        ? []
        : [
            {
              kind: 'photo' as const,
              id,
              reason: told.reason ?? told.answer,
              message: told.message,
            },
          ],
    );
    return [...reports, ...records, ...photos];
  }

  // The next part of a file it sends to the media endpoint now: of the first file whose
  // photograph's record the server has and that isn't resting, from where the server last said
  // it stands, no larger than the part the signal lets (never larger than the server takes). None
  // where it has none to send, or where it must first ask where the file stands.
  sendsFilePart(): FilePartSent | null {
    const file = this.goingNext();
    const loaded = this.loaded;
    if (file?.from === undefined || loaded?.name !== fileName(file.photoId, file.file)) {
      return null;
    }
    this.partSentAt = this.now().getTime();
    this.lastPart = {
      photoId: file.photoId,
      file: file.file,
      offset: file.from,
      length: file.length,
      bytes: loaded.bytes.subarray(file.from, file.from + this.partBytes),
    };
    return this.lastPart;
  }

  // What came back for the part sent last, as it came off the wire; `undefined` where nothing did.
  // Kept: the file goes from the phone. Receiving: it goes on from what the server took. Not
  // matched: from its first byte, resting till the next run where it is so twice. Anything else:
  // from where it stood, and the next part half the size. How it was answered, where it was.
  async filePartAnswered(answer: unknown): Promise<'KEPT' | 'RECEIVING' | 'NOT_MATCHED' | null> {
    const part = this.lastPart;
    this.lastPart = undefined;
    if (part === undefined || this.isWiped) return null;
    const name = fileName(part.photoId, part.file);
    const file = this.files.get(name);
    if (file === undefined) return null;
    const read = photoFileAnswerRead(answer);
    this.sized(read === null ? null : this.now().getTime() - this.partSentAt, part);
    const from = photoFileGoesOnFrom(read, part.offset);
    if (from === null) {
      await this.store.change([
        { shelf: 'photographs', id: `${filePrefix}${name}`, dropped: true },
        { shelf: 'photoFiles', id: name, dropped: true },
      ]);
      this.files.delete(name);
      if (this.loaded?.name === name) this.loaded = undefined;
    } else {
      // A part of it has gone: opened again, the phone asks where it stands before more goes.
      if (!file.begun) {
        await this.store.change([
          {
            shelf: 'photographs',
            id: `${filePrefix}${name}`,
            value: { length: file.length, begun: true },
          },
        ]);
        file.begun = true;
      }
      file.from = from;
      if (read?.upload === 'NOT_MATCHED') {
        const times = (this.notMatched.get(name) ?? 0) + 1;
        this.notMatched.set(name, times);
        if (times >= notMatchedInARun) this.resting.add(name);
      }
    }
    await this.loadNext();
    return read?.upload ?? null;
  }

  // The file it asks the media endpoint where it stands now (`photoFileEndpoint`): the first one
  // that would go next but that it began before it was opened, so it no longer knows where the
  // server stood. None where it asks of none.
  asksWhereFileStands(): FileAsked | null {
    const file = this.goingNext(true);
    if (file === undefined || file.from !== undefined) return null;
    this.lastAsked = { photoId: file.photoId, file: file.file };
    return this.lastAsked;
  }

  // What came back for that question, as it came off the wire; `undefined` where nothing did.
  // Kept: the file goes from the phone. Otherwise it goes on from what the server took; with
  // nothing it knows no more than before, and asks again. Whether it was an answer.
  async fileStandsAnswered(answer: unknown): Promise<boolean> {
    const asked = this.lastAsked;
    this.lastAsked = undefined;
    if (asked === undefined || this.isWiped) return false;
    const name = fileName(asked.photoId, asked.file);
    const file = this.files.get(name);
    if (file === undefined) return false;
    const at = photoFileStandsAt(photoFileAnswerRead(answer));
    if (at === null) {
      await this.store.change([
        { shelf: 'photographs', id: `${filePrefix}${name}`, dropped: true },
        { shelf: 'photoFiles', id: name, dropped: true },
      ]);
      this.files.delete(name);
      if (this.loaded?.name === name) this.loaded = undefined;
    } else if (at !== undefined) {
      file.from = at;
    }
    await this.loadNext();
    return at !== undefined;
  }

  // The part or the question sent last was told to wait (`429 LIMITED`, `503 BUSY`): nothing
  // went, and nothing changes; the same goes again after the wait.
  fileToldToWait(): void {
    this.lastPart = undefined;
    this.lastAsked = undefined;
  }

  // The part or the question sent last was refused for the file itself (too large, not an image,
  // a photograph the server doesn't hold as this phone's): kept, it rests until the next run,
  // and the other files go meanwhile.
  async fileTurnedAway(): Promise<void> {
    const sent = this.lastPart ?? this.lastAsked;
    this.lastPart = undefined;
    this.lastAsked = undefined;
    if (sent === undefined) return;
    this.resting.add(fileName(sent.photoId, sent.file));
    await this.loadNext();
  }

  // How many of the monitor's photographs' files are still to go, of photographs the server has.
  filesWaiting(): number {
    const held = new Set(this.photos.map(({ id }) => id));
    return [...this.files.values()].filter(
      ({ photoId }) => !held.has(photoId) || this.savedPhotos.has(photoId),
    ).length;
  }

  // Each file it holds that the server has not said it kept: "<photograph's id> <file>".
  holdsFiles(): readonly string[] {
    return [...this.files.keys()];
  }

  // How many things the store holds that the contract no longer reads (C183): never sent, and the
  // phone isn't wiped over them unless the server has them.
  unreadable(): number {
    return this.unread.length;
  }

  // "Sync and turn in" (ARCHITECTURE §8; AC-02-58; ADR-096, 488): everything it still holds,
  // each once, by the id it was made under: its reports, records and photographs waiting or not
  // stored, the archived queues' too, each photograph with a file not yet kept; by its fingerprint
  // what was answered under no id, and what the contract no longer reads (C183); the last number
  // it used of each series; the passcode as typed. Never which phone it is.
  turnsIn(passcode: string): TurnInSent {
    const underNoId = (told: Told | null) => told !== null && told.id === null;
    return {
      passcode,
      holds: {
        unplannedAssignments: this.unplanned.map(({ report }) => report.id),
        passcodeUses: this.uses.map(({ report }) => report.id),
        records: this.records.filter(({ told }) => !underNoId(told)).map(({ id }) => id),
        held: [
          ...new Set([
            ...[...this.records, ...this.photos]
              .filter(({ told }) => underNoId(told))
              .map(({ value }) => sentPrint(value)),
            ...this.unread,
          ]),
        ],
        photos: [
          ...new Set([
            ...this.photos.filter(({ told }) => !underNoId(told)).map(({ id }) => id),
            ...[...this.files.values()].map(({ photoId }) => photoId),
          ]),
        ],
      },
      lastUsed: [...this.holding.lastUsed],
    };
  }

  // What came back for its turn-in, as it came off the wire; `undefined` where nothing did. Only
  // an answer to wipe wipes it, and then everything it holds goes; anything else leaves it as it
  // was. The answer, where it was one.
  async turnInAnswered(answer: unknown): Promise<TurnInAnswer | null> {
    const read = answer === undefined ? null : turnInAnswerRead(answer);
    if (!toWipe(read) || this.isWiped) return read;
    await this.erased();
    return read;
  }

  // A turn-in sent whose answer never came, then the phone's own key refused by the server: only a
  // turn-in that found everything on the server revokes a key so (ADR-488; the firm's time asks
  // for the passcode instead, ADR-530), so it was turned in, and the phone wipes as told then.
  async turnedInUnanswered(): Promise<void> {
    if (!this.isWiped) await this.erased();
  }

  // Whether it has wiped what it held.
  wiped(): boolean {
    return this.isWiped;
  }

  // The wipe: the keyring's erase, then the store's (NIST SP 800-88), and nothing held after.
  private async erased(): Promise<void> {
    await this.options.wipe();
    this.isWiped = true;
    this.unplanned = [];
    this.uses = [];
    this.unread = [];
    this.records = [];
    this.photos = [];
    this.files.clear();
    this.loaded = undefined;
    this.savedPhotos.clear();
    this.sentAgain.clear();
    this.photosSentAgain.clear();
    this.notMatched.clear();
    this.resting.clear();
    this.lastAsked = undefined;
    this.holding = { holds: { masterPasscodeVersion: null, listsProjectId: null }, lastUsed: [] };
    this.last = undefined;
    this.lastPart = undefined;
  }

  private stored<T>(entry: Entry<T>, field: 'record' | 'photo'): Json {
    return { kept: entry.kept, [field]: entry.value, told: entry.told } as unknown as Json;
  }

  // A photograph kept not saved because its record isn't saved on the server, that goes again
  // now: not yet sent again since the store was read, or since its record was answered saved.
  private waitsForItsRecord(entry: Entry<SyncedPhoto>): boolean {
    return entry.told?.reason === 'OWNER_NOT_SAVED' && !this.photosSentAgain.has(entry.id);
  }

  // Why a photograph's files can't be kept, where they can't: an empty one, one larger than the
  // server takes, or a depth file where its photograph gives no depth file's fingerprint
  // (`depthSha256` is given exactly where a depth file goes, ADR-482 (6)).
  private notKeepable(
    files: readonly { readonly file: PhotoFileName; readonly bytes: Uint8Array }[],
    depthGoes: boolean,
  ): NotSavedNotice | undefined {
    const most = this.options.fileBytesAtMost ?? Infinity;
    for (const { file, bytes } of files) {
      if (bytes.byteLength === 0) return NotSaved.notARecord(`its ${file} file holds nothing`);
      if (bytes.byteLength > most) {
        return NotSaved.notARecord(
          `its ${file} file is larger than the server takes, ${String(most / 1_048_576)} MiB`,
        );
      }
      if (file === 'depth' && !depthGoes) {
        return NotSaved.notARecord('a depth file goes only where its fingerprint is given');
      }
    }
    return undefined;
  }

  // Each file's bytes on a shelf of their own, its note beside its photograph's record.
  private fileChanges(
    photoId: string,
    files: readonly { readonly file: PhotoFileName; readonly bytes: Uint8Array }[],
  ): Change[] {
    return files.flatMap(({ file, bytes }): Change[] => [
      { shelf: 'photoFiles', id: fileName(photoId, file), value: bytes },
      {
        shelf: 'photographs',
        id: `${filePrefix}${fileName(photoId, file)}`,
        value: { length: bytes.byteLength, begun: false },
      },
    ]);
  }

  private holdFile(photoId: string, file: PhotoFileName, bytes: Uint8Array): void {
    this.files.set(fileName(photoId, file), {
      photoId,
      file,
      length: bytes.byteLength,
      begun: false,
      from: 0,
    });
  }

  // The file that goes next: the first whose photograph's record the server has, that isn't
  // resting, and whose place is known (or, `asking`, the first whose place isn't).
  private goingNext(asking = false): HeldFile | undefined {
    const held = new Set(this.photos.map(({ id }) => id));
    for (const [name, file] of this.files) {
      if (held.has(file.photoId) && !this.savedPhotos.has(file.photoId)) continue;
      if (this.resting.has(name)) continue;
      if ((file.from === undefined) === asking) return file;
    }
    return undefined;
  }

  // The bytes of the file that goes next read from the store, and no other's held: one file at a
  // time in memory. One the store no longer holds, or holds at another length, rests for the run.
  private async loadNext(): Promise<void> {
    for (let file = this.goingNext(); file !== undefined; file = this.goingNext()) {
      const name = fileName(file.photoId, file.file);
      if (this.loaded?.name === name) return;
      this.loaded = undefined;
      const bytes = await this.store.read('photoFiles', name);
      if (bytes instanceof Uint8Array && bytes.byteLength === file.length) {
        this.loaded = { name, bytes };
        return;
      }
      this.resting.add(name);
    }
    this.loaded = undefined;
  }

  // The next part's size, from how the last went: with no answer, half; answered, what goes in
  // about ten seconds at the speed it went (at most twice the last), within the least a part
  // holds and the most the server takes.
  private sized(tookMs: number | null, part: FilePartSent): void {
    const most = this.options.filePartBytesAtMost;
    const least = Math.min(partBytesAtLeast, most);
    const next =
      tookMs === null
        ? this.partBytes / 2
        : tookMs <= 0
          ? this.partBytes * 2
          : Math.min(this.partBytes * 2, (part.bytes.byteLength / tookMs) * partAimMs);
    this.partBytes = Math.max(least, Math.min(most, Math.floor(next)));
  }
}
