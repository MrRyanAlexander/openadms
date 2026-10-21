// A client's half of one sync, said once (ARCHITECTURE §9 (3), (4); spec/parts/05-sync.md steps
// 2…8; AC-05-15, 20, 45, 46; BACKLOG 2.6.1 part 4, C128, C129; ADR-022, 467, 468, 470; REQ-203,
// 308c): what any client reads of what it was answered, and what an answer lets it do. The
// harness's phones use it now and the field app in Phase 3; the suite that holds a client to it
// is `sync-client-suite.ts`. How much a sync carries by weight (ADR-504). And its half of a
// photograph's file sent to the media endpoint (ARCHITECTURE §9 (5); AC-05-09; ADR-482, 483).
import { photoFileAnswerSchema, type PhotoFileAnswer, type PhotoFileName } from './api-answers.ts';
import type { ReceivedRecord, SyncedRecord } from './sync-records.ts';
import {
  sentWeight,
  syncAnsweredSchema,
  syncBytesAtMost,
  type SyncAnswered,
  type SyncSent,
} from './sync.ts';
import { turnInAnswerSchema, type TurnInAnswer } from './turn-in.ts';

// The id its phone made for a record, whatever its kind: as a phone sends it, or as the server
// read it.
export function syncedRecordId(record: SyncedRecord | ReceivedRecord): string {
  switch (record.record) {
    case 'FIELD_EVENT':
      return record.fieldEvent.id;
    case 'SCALE_RECEIPT':
      return record.scaleReceipt.id;
    case 'INCIDENT':
      return record.incident.id;
    case 'DROP_OFF_LOG':
      return record.dropOffLog.id;
    case 'SURVEY':
      return record.survey.id;
    case 'ROE':
      return record.roe.id;
    case 'CERTIFICATION':
      return record.certification.id;
    case 'CLOCK_ENTRY':
      return record.clockEntry.id;
  }
}

// The assignment a record was made under; a scale receipt names none. An unplanned assignment
// goes no later than the records made under it (ADR-457).
export function syncedRecordAssignment(record: SyncedRecord | ReceivedRecord): string | null {
  switch (record.record) {
    case 'FIELD_EVENT':
      return record.fieldEvent.assignmentId;
    case 'SCALE_RECEIPT':
      return null;
    case 'INCIDENT':
      return record.incident.assignmentId;
    case 'DROP_OFF_LOG':
      return record.dropOffLog.assignmentId;
    case 'SURVEY':
      return record.survey.assignmentId;
    case 'ROE':
      return record.roe.assignmentId;
    case 'CERTIFICATION':
      return record.certification.assignmentId;
    case 'CLOCK_ENTRY':
      return record.clockEntry.assignmentId;
  }
}

// The project a record a phone made is for, as it says (ADR-529 (b)): a closed one takes nothing.
export function syncedRecordProject(record: SyncedRecord | ReceivedRecord): string {
  switch (record.record) {
    case 'FIELD_EVENT':
      return record.fieldEvent.projectId;
    case 'SCALE_RECEIPT':
      return record.scaleReceipt.projectId;
    case 'INCIDENT':
      return record.incident.projectId;
    case 'DROP_OFF_LOG':
      return record.dropOffLog.projectId;
    case 'SURVEY':
      return record.survey.projectId;
    case 'ROE':
      return record.roe.projectId;
    case 'CERTIFICATION':
      return record.certification.projectId;
    case 'CLOCK_ENTRY':
      return record.clockEntry.projectId;
  }
}

// How many of the things to add to one of a sync's lists, from the first, keep it no heavier
// than the contract lets a sync be (AC-05-51; ADR-504): `sync` as it stands, the list they go in
// still empty; each thing after the first adds its comma. A client fills its records so, then
// its photographs' records beside them, and sends the rest in the next sync. The first always
// fits a sync that holds no more than one record of the heaviest a record may be.
export function fitByWeight(sync: SyncSent, adding: readonly unknown[]): number {
  let weight = sentWeight(sync);
  let taken = 0;
  for (const each of adding) {
    weight += sentWeight(each) + (taken === 0 ? 0 : 1);
    if (weight > syncBytesAtMost) break;
    taken += 1;
  }
  return taken;
}

// The only answers that say the server stored what was sent (REQ-308c). Anything else, and the
// client keeps it: a quarantined record and one not saved are shown as not saved, never dropped
// (AC-05-20, 46).
export const storedAnswers = ['SAVED', 'ALREADY_SAVED'] as const;

export const stored = (answered: { readonly answer: string }): boolean =>
  (storedAnswers as readonly string[]).includes(answered.answer);

const inPlace = <S, A>(
  sent: readonly S[],
  answers: readonly A[],
  same: (one: S, answer: A) => boolean,
): boolean =>
  sent.length === answers.length &&
  sent.every((one, index) => {
    const answer = answers[index];
    return answer !== undefined && same(one, answer);
  });

// What came back for one sync, read: the answer, or null where it is no answer to what was
// sent. It is one only when it is the contract's own shape and has an answer for each thing
// sent, each in the place of what it answers and under its id (a record the server couldn't
// read may be answered under none). On null a client marks nothing and keeps everything, as it
// does when nothing came back at all: it never takes a record for saved on an answer it can't
// match to it.
export function syncAnswerRead(sent: SyncSent, answered: unknown): SyncAnswered | null {
  const read = syncAnsweredSchema.safeParse(answered);
  if (!read.success) return null;
  const { unplannedAssignments, passcodeUses, records, photos, numbers, setupVersion } = read.data;
  const fits =
    inPlace(
      sent.unplannedAssignments,
      unplannedAssignments,
      (one, a) => a.assignmentId === one.id,
    ) &&
    inPlace(sent.passcodeUses, passcodeUses, (one, a) => a.useId === one.id) &&
    inPlace(
      sent.records,
      records,
      (one, a) => a.id === syncedRecordId(one) || (a.id === null && a.answer === 'NOT_SAVED'),
    ) &&
    inPlace(
      sent.photos,
      photos,
      (one, a) => a.id === one.id || (a.id === null && a.answer === 'NOT_SAVED'),
    ) &&
    inPlace(
      sent.lastUsed,
      numbers,
      (one, a) => a.projectId === one.projectId && a.series === one.series,
    ) &&
    // A setup version is the one of the project the phone said, never another's.
    (setupVersion === null || setupVersion.projectId === sent.holds.listsProjectId);
  return fits ? read.data : null;
}

// A part of a photograph's file as a client sends it to the media endpoint
// (`sendPhotoFilePartEndpoint`): the photograph's id and which of its files, the offset its
// bytes go at, the whole file's length, and the bytes, at least one.
export interface FilePartSent {
  readonly photoId: string;
  readonly file: PhotoFileName;
  readonly offset: number;
  readonly length: number;
  readonly bytes: Uint8Array;
}

// What came back for a part of a file, read: the media endpoint's answer, or null where it is
// none (nothing came, or a shape the contract doesn't have). On null a client takes nothing for
// kept and nothing for received: it sends again from the last place the server answered.
// `KEPT`: the file is done and the client lets it go. `RECEIVING`: it goes on from `received`
// (from the first byte where the server holds none). `NOT_MATCHED`: it keeps the file and sends
// it again from the first byte (ADR-482 (1), (5)).
export function photoFileAnswerRead(answered: unknown): PhotoFileAnswer | null {
  const read = photoFileAnswerSchema.safeParse(answered);
  return read.success ? read.data : null;
}

// Where a client goes on from, after an answer read: the offset of its next part, or null where
// the file is kept and nothing more goes. No answer: where it stood before the part was sent.
export function photoFileGoesOnFrom(answer: PhotoFileAnswer | null, before: number): number | null {
  if (answer === null) return before;
  switch (answer.upload) {
    case 'KEPT':
      return null;
    case 'RECEIVING':
      return answer.received;
    case 'NOT_MATCHED':
      return 0;
  }
}

// A file a client asks the media endpoint where it stands (`photoFileEndpoint`): the
// photograph's id and which of its files.
export interface FileAsked {
  readonly photoId: string;
  readonly file: PhotoFileName;
}

// Where a client goes on from after asking where a file stands (AC-11-33; ADR-482 (2), 579): the
// offset of its next part, null where the file is kept and nothing more goes, or `undefined`
// where what came back is no answer, so it knows no more than before and asks again before it
// sends anything of that file. A client asks where it began a file before it last opened: what
// it knew of where the server stood was in its memory alone, and a part sent from its first byte
// would start the file again on the server, losing what was taken.
export function photoFileStandsAt(answer: PhotoFileAnswer | null): number | null | undefined {
  return answer === null ? undefined : photoFileGoesOnFrom(answer, 0);
}

// What a phone turned in reads of its answer (AC-02-58; ADR-096, 488): the answer, or null where
// what came back is none. **It wipes only where the answer says so** (`wipe: true`); with no
// answer, with what is none, or answered not turned in, it keeps everything it holds, as it was.
export function turnInAnswerRead(answer: unknown): TurnInAnswer | null {
  const read = turnInAnswerSchema.safeParse(answer);
  return read.success ? read.data : null;
}

export const toWipe = (answer: TurnInAnswer | null): boolean => answer?.wipe === true;
