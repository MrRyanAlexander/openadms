// One sync, whole: what a phone sends and what it is answered (ARCHITECTURE §9, §10;
// spec/parts/05-sync.md steps 2…8; spec/acceptance/05-sync.md AC-05-03, 04, 15, 20, 45…47;
// AC-10-35, 36; T-12; BACKLOG 2.6.1, C69, C84 (9), C86, C122, C126, C127; ADR-022, 052, 065, 100,
// 338, 457, 464, 466, 467; REQ-004, 203). The endpoint that takes it is `syncPhoneEndpoint`
// (endpoints.ts; ADR-472).
//
// **A sync is read in this order, and each thing after what it may name:** the phone's clock;
// the unplanned assignments made on the phone; the uses of the master passcode it logged; its
// records; the last number it used of each series. A record names its assignment, so an
// unplanned assignment goes ahead of the records made under it.
//
// **Each record is read on its own** (AC-05-45): the payload takes whatever stands in a record's
// place, and `recordRead` reads it with `syncedRecordSchema`. One that isn't a record gets its
// own answer, "not saved", and never refuses the others. What bounds an unread record is the
// request's own size (the boundary's limit) and how many a sync carries.
//
// **Each thing sent gets its own answer, in the order sent.** A record is saved, already saved,
// kept in quarantine (not saved, with the reason and the record that holds the number), or not
// saved: it isn't a record, it names something the server doesn't have, its assignment was not
// saved, or it is a certification its own rules refuse (ADR-469). One not saved is held on the
// server exactly as sent, for a person, and its words say so (ADR-468, 472). Never an error
// for the whole sync, and never "saved" for what wasn't stored (REQ-308c). Nothing here refuses work over eligibility
// (ADR-052), and no answer carries a status, a flag or money: those are the worker's.
import {
  NotSaved,
  notSavedReasons,
  type NotSavedNotice,
  numberSeries,
  quarantineReasons,
} from '@open-adms/domain';
import { z } from 'zod';

import { passcodeUseAnswerSchema, unplannedAssignmentAnswerSchema } from './api-answers.ts';
import { notRead } from './not-taken.ts';
import { passcodeUseReportSchema, unplannedAssignmentReportSchema } from './phone-reports.ts';
import {
  id,
  instant,
  offset,
  syncedRecordSchema,
  type ReceivedRecord,
  type SyncedRecord,
} from './sync-records.ts';

// How much one sync carries. A phone with more sends another sync: nothing waits on a limit but
// the next call (AC-10-41). The records' count keeps a full sync of ordinary records well inside
// the request's one mebibyte.
export const syncRecordsAtMost = 200;
export const syncUnplannedAssignmentsAtMost = 20;
export const syncPasscodeUsesAtMost = 100;
export const syncSeriesAtMost = 20;

const seriesNumber = z.number().int().min(1).max(2_000_000_000);

// The last number the phone used of one series of a project; null when it has used none
// (ADR-065, 323).
export const lastUsedSchema = z.strictObject({
  projectId: id,
  series: z.enum(numberSeries),
  lastUsedNumber: seriesNumber.nullable(),
});

const eachSeriesOnce = (reports: readonly z.infer<typeof lastUsedSchema>[]): boolean =>
  new Set(reports.map(({ projectId, series }) => `${projectId} ${series}`)).size === reports.length;

// What a phone sends. It never says which phone it is: it proved that (ADR-466).
export const syncSentSchema = z.strictObject({
  // The phone's clock as it sends this, a UTC instant, and how far that clock stood from UTC
  // (ADR-100): the server compares it with its own.
  clockAt: instant,
  deviceUtcOffsetMinutes: offset,
  unplannedAssignments: z
    .array(unplannedAssignmentReportSchema)
    .max(syncUnplannedAssignmentsAtMost),
  passcodeUses: z.array(passcodeUseReportSchema).max(syncPasscodeUsesAtMost),
  // Each read on its own, by `recordRead`.
  records: z.array(z.unknown()).max(syncRecordsAtMost),
  lastUsed: z.array(lastUsedSchema).max(syncSeriesAtMost).refine(eachSeriesOnce),
});

// One record as the server read it, or what its phone is told of one that isn't a record, with
// the id it was sent under where that much could be read.
export type RecordRead =
  | { readonly read: true; readonly record: ReceivedRecord }
  | { readonly read: false; readonly id: string | null; readonly notice: NotSavedNotice };

// What a thing sent in a record's place names, where that much can be read: the id its phone
// made for it, its project, and the monitor who made it (a scale receipt's `enteredById`, an
// ROE's `madeById`, a certification's `certifiedById`). Read loosely, each on its own, from a
// record that may be no record: what is found is only what was sent, and may name nothing the
// server has (ADR-468, 471).
export interface RecordNames {
  readonly id: string | null;
  readonly projectId: string | null;
  readonly monitorId: string | null;
}

const monitorFields = ['monitorId', 'enteredById', 'madeById', 'certifiedById'] as const;

const idIn = (part: object, field: string): string | null => {
  const read = id.safeParse((part as Record<string, unknown>)[field]);
  return read.success ? read.data : null;
};

export function recordNames(sent: unknown): RecordNames {
  const none = { id: null, projectId: null, monitorId: null };
  if (typeof sent !== 'object' || sent === null) return none;
  for (const part of Object.values(sent) as unknown[]) {
    if (typeof part !== 'object' || part === null) continue;
    const named = idIn(part, 'id');
    if (named === null) continue;
    return {
      id: named,
      projectId: idIn(part, 'projectId'),
      monitorId:
        monitorFields.map((field) => idIn(part, field)).find((found) => found !== null) ?? null,
    };
  }
  return none;
}

// Reads whatever stood in one record's place.
export function recordRead(sent: unknown): RecordRead {
  const read = syncedRecordSchema.safeParse(sent);
  if (read.success) return { read: true, record: read.data };
  const why = notRead(syncedRecordSchema, sent) ?? 'this record isn’t taken as it stands';
  return { read: false, id: recordNames(sent).id, notice: NotSaved.notARecord(why) };
}

// Something the server did with a record it saved that the sender should know: nothing was
// refused for it, and the flag is the worker's (ADR-052, 329).
export const intakeNoteCodes = ['GPS_UNREADABLE', 'ANSWERS_DO_NOT_FIT'] as const;

const intakeNoteSchema = z.strictObject({
  code: z.enum(intakeNoteCodes),
  message: z.string(),
});

// One record's own answer (ARCHITECTURE §9 (4)). A quarantined record is never answered "saved",
// however often it is sent (ADR-022); one not saved at all has an id only where one could be
// read.
export const recordAnswerSchema = z.discriminatedUnion('answer', [
  z.strictObject({ answer: z.literal('SAVED'), id, notes: z.array(intakeNoteSchema) }),
  z.strictObject({ answer: z.literal('ALREADY_SAVED'), id }),
  z.strictObject({
    answer: z.literal('QUARANTINED'),
    id,
    reason: z.enum(quarantineReasons),
    message: z.string(),
    // The record that holds the number.
    heldBy: id,
  }),
  z.strictObject({
    answer: z.literal('NOT_SAVED'),
    id: id.nullable(),
    reason: z.enum(notSavedReasons),
    message: z.string(),
  }),
]);

// The blocks a phone holds of one series after a sync, in the order it gives them out
// (ADR-065): `toppedUp` is false where the report wasn't taken (its project has no such series,
// or none of it is left to cut), and the blocks are then what the phone held before.
export const seriesHeldSchema = z.strictObject({
  projectId: id,
  series: z.enum(numberSeries),
  toppedUp: z.boolean(),
  blocks: z.array(
    z.strictObject({
      firstNumber: seriesNumber,
      lastNumber: seriesNumber,
      lastUsedNumber: seriesNumber.nullable(),
    }),
  ),
});

// What a phone is answered: one answer for each thing it sent, in the order it sent them.
export const syncAnsweredSchema = z.strictObject({
  unplannedAssignments: z.array(unplannedAssignmentAnswerSchema),
  passcodeUses: z.array(passcodeUseAnswerSchema),
  records: z.array(recordAnswerSchema),
  numbers: z.array(seriesHeldSchema),
});

export type LastUsedReport = z.infer<typeof lastUsedSchema>;
// A sync as a phone sends it (each record as its own schema reads it), and as the server reads
// it (each record still to be read).
export type SyncSent = Omit<z.input<typeof syncSentSchema>, 'records'> & {
  records: SyncedRecord[];
};
export type SyncReceived = z.output<typeof syncSentSchema>;
export type IntakeNoteCode = (typeof intakeNoteCodes)[number];
export type IntakeNote = z.infer<typeof intakeNoteSchema>;
export type RecordAnswer = z.infer<typeof recordAnswerSchema>;
export type SeriesHeld = z.infer<typeof seriesHeldSchema>;
export type SyncAnswered = z.infer<typeof syncAnsweredSchema>;
