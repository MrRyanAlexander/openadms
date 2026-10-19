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
// **A photograph's file** goes only once its record is answered saved, a part at a time, each
// where the server said it stands; the media endpoint and the parts' size are task 3.4.2's.
// **Turned in** ("Sync and turn in", task 3.4.3), it names everything it still holds, and wipes
// only on `wipe: true`.
import { sha256 } from '@noble/hashes/sha2.js';
import {
  fitByWeight,
  photoFileAnswerRead,
  photoFileGoesOnFrom,
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
import type { NotSavedNotice } from '@open-adms/domain';

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

interface HeldFile {
  readonly photoId: string;
  readonly file: PhotoFileName;
  readonly bytes: Uint8Array;
  from: number;
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
  // The wipe, on the server's `wipe: true` alone: the keyring's erase, then the store's.
  readonly wipe: () => Promise<void>;
  readonly now?: () => Date;
}

const photoPrefix = 'photo:';
const filePrefix = 'file:';
const photoFileNames: readonly PhotoFileName[] = ['photo', 'depth'];

const fileName = (photoId: string, file: PhotoFileName): string => `${photoId} ${file}`;

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

// The fingerprint a thing sent with no id the server could read is named by at turn-in: the
// SHA-256, in hex, of what was sent as canonical JSON in UTF-8, as the server makes it (ADR-488).
export const sentPrint = (sent: unknown): string =>
  hex(sha256(new TextEncoder().encode(sentCanonical(JSON.parse(JSON.stringify(sent))))));

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
  // The photographs answered saved since the store was read, whose files may go.
  private readonly savedPhotos = new Set<string>();
  // Kept records sent again since the store was read: each goes again once.
  private readonly sentAgain = new Set<string>();
  private holding: Holding = {
    holds: { masterPasscodeVersion: null, listsProjectId: null },
    lastUsed: [],
  };
  private next = 1;
  private last: Sent | undefined;
  private lastPart: FilePartSent | undefined;
  private isWiped = false;

  private constructor(store: PhoneStore, options: OutboxOptions) {
    this.store = store;
    this.options = options;
    this.now = options.now ?? (() => new Date());
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
    const all = [
      ...records.map((one) => entryOf('records', one.id, one.value, 'record', recordOf)),
      ...archived.map((one) => entryOf('archivedQueues', one.id, one.value, 'record', recordOf)),
    ].filter((one) => one !== undefined);
    const pictures = photographs
      .filter(({ id }) => id.startsWith(photoPrefix))
      .map((one) => entryOf('photographs', one.id, one.value, 'photo', photoOf))
      .filter((one) => one !== undefined);
    this.next =
      Math.max(0, ...all.map(({ kept }) => kept), ...pictures.map(({ kept }) => kept)) + 1;
    this.records = all.filter(({ told }) => told === null || !stored(told)).sort(byKept);
    this.photos = pictures.filter(({ told }) => told === null || !stored(told)).sort(byKept);
    this.savedPhotos.clear();
    for (const { id, told } of pictures)
      if (told !== null && stored(told)) this.savedPhotos.add(id);
    const files = new Map<string, HeldFile>();
    for (const { id, value } of photographs) {
      if (!id.startsWith(filePrefix) || !(value instanceof Uint8Array)) continue;
      const [photoId, file] = id.slice(filePrefix.length).split(' ');
      const named = photoFileNames.find((one) => one === file);
      if (photoId === undefined || named === undefined) continue;
      const before = this.files.get(fileName(photoId, named));
      files.set(fileName(photoId, named), {
        photoId,
        file: named,
        bytes: value,
        from: before?.from ?? 0,
      });
    }
    this.files = files;
    this.sentAgain.clear();
    this.holding = holding;
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
    return undefined;
  }

  // A photograph's file whose record the server has already (as the suite hands one).
  async keepFile(photoId: string, file: PhotoFileName, bytes: Uint8Array): Promise<void> {
    await this.store.change(this.fileChanges(photoId, [{ file, bytes }]));
    this.holdFile(photoId, file, bytes);
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
    const photosByCount = this.photos
      .filter(({ told, value }) => told === null && !staying.has(value.owner.id))
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
      this.photos.some(({ told }) => told === null)
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
      this.photos = this.photos.flatMap((one) =>
        one.id !== entry.id ? [one] : isStored ? [] : [entry],
      );
    }
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
  // photograph's record the server has, from where the server last said it stands, no larger
  // than it takes. None where it has none to send.
  sendsFilePart(): FilePartSent | null {
    const held = new Set(this.photos.map(({ id }) => id));
    for (const file of this.files.values()) {
      if (held.has(file.photoId) && !this.savedPhotos.has(file.photoId)) continue;
      this.lastPart = {
        photoId: file.photoId,
        file: file.file,
        offset: file.from,
        length: file.bytes.byteLength,
        bytes: file.bytes.subarray(file.from, file.from + this.options.filePartBytesAtMost),
      };
      return this.lastPart;
    }
    return null;
  }

  // What came back for the part sent last, as it came off the wire; `undefined` where nothing did.
  // Kept: the file goes from the phone. Receiving: it goes on from what the server took. Not
  // matched: from its first byte. Anything else: from where it stood. How it was answered, where it was.
  async filePartAnswered(answer: unknown): Promise<'KEPT' | 'RECEIVING' | 'NOT_MATCHED' | null> {
    const part = this.lastPart;
    this.lastPart = undefined;
    if (part === undefined || this.isWiped) return null;
    const name = fileName(part.photoId, part.file);
    const file = this.files.get(name);
    if (file === undefined) return null;
    const read = photoFileAnswerRead(answer);
    const from = photoFileGoesOnFrom(read, part.offset);
    if (from === null) {
      await this.store.change([
        { shelf: 'photographs', id: `${filePrefix}${name}`, dropped: true },
      ]);
      this.files.delete(name);
    } else {
      file.from = from;
    }
    return read?.upload ?? null;
  }

  // Each file it holds that the server has not said it kept: "<photograph's id> <file>".
  holdsFiles(): readonly string[] {
    return [...this.files.keys()];
  }

  // "Sync and turn in" (ARCHITECTURE §8; AC-02-58; ADR-096, 488): everything it still holds,
  // each once, by the id it was made under: its reports, records and photographs waiting or not
  // stored, the archived queues' too, each photograph with a file not yet kept; by its fingerprint
  // what was answered under no id; the last number it used of each series; the passcode as typed.
  // Never which phone it is.
  turnsIn(passcode: string): TurnInSent {
    const underNoId = (told: Told | null) => told !== null && told.id === null;
    return {
      passcode,
      holds: {
        unplannedAssignments: this.unplanned.map(({ report }) => report.id),
        passcodeUses: this.uses.map(({ report }) => report.id),
        records: this.records.filter(({ told }) => !underNoId(told)).map(({ id }) => id),
        held: [
          ...new Set(
            [...this.records, ...this.photos]
              .filter(({ told }) => underNoId(told))
              .map(({ value }) => sentPrint(value)),
          ),
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
    await this.options.wipe();
    this.isWiped = true;
    this.unplanned = [];
    this.uses = [];
    this.records = [];
    this.photos = [];
    this.files.clear();
    this.savedPhotos.clear();
    this.sentAgain.clear();
    this.holding = { holds: { masterPasscodeVersion: null, listsProjectId: null }, lastUsed: [] };
    this.last = undefined;
    this.lastPart = undefined;
    return read;
  }

  // Whether it has wiped what it held.
  wiped(): boolean {
    return this.isWiped;
  }

  private stored<T>(entry: Entry<T>, field: 'record' | 'photo'): Json {
    return { kept: entry.kept, [field]: entry.value, told: entry.told } as unknown as Json;
  }

  private fileChanges(
    photoId: string,
    files: readonly { readonly file: PhotoFileName; readonly bytes: Uint8Array }[],
  ): Change[] {
    return files.map(({ file, bytes }) => ({
      shelf: 'photographs',
      id: `${filePrefix}${fileName(photoId, file)}`,
      value: bytes,
    }));
  }

  private holdFile(photoId: string, file: PhotoFileName, bytes: Uint8Array): void {
    this.files.set(fileName(photoId, file), { photoId, file, bytes, from: 0 });
  }
}
