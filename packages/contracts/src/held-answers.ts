// What a sync held for a person, and what waits in quarantine, as the back office reads it
// (spec/parts/05-sync.md step 6; spec/parts/08-review-and-corrections.md, "One review queue";
// spec/DATA-MODEL.md §4.4, §4.5; AC-05-46, AC-10-73…76; BACKLOG 2.8.4; ADR-022, 338, 468, 471,
// 481, 482, 526): each exactly as the phone sent it, with why it is held and how it was
// resolved. **Never where a file is kept** (API3): a file set aside is read by its own request.
import { heldReasons, heldSentAs, quarantineReasons } from '@open-adms/domain';
import { z } from 'zod';

import { photoFiles } from './api-answers.ts';
import { fieldEventRecordSchema, roeRecordSchema } from './review-answers.ts';
import { photoOwnerKinds, syncedPhotoSchema, syncedRecordSchema } from './sync-records.ts';

const id = z.uuid();
const at = z.iso.datetime();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

// How it was resolved: who, when and what, all three or none.
const resolution = {
  resolvedById: id.nullable(),
  resolvedAt: at.nullable(),
  resolution: z.string().nullable(),
};

// A page's `next`: what to send as `after` for the page that follows; null on the last.
const next = z.uuid().nullable();

// A held record (ADR-468, 471, 526 (1)): the phone it came from (known for certain, from its
// proof), the sync that brought it (none for a report made to its own endpoint), what could be
// read of it (its own id, project and monitor, only as sent), what it was sent as where that can
// be said, what was sent exactly as sent, why, and the words its phone was told; the photographs
// kept with it (ADR-526 (4)), by id.
export const heldRecordSchema = z.strictObject({
  id,
  deviceId: id,
  syncId: id.nullable(),
  sentId: id.nullable(),
  projectId: id.nullable(),
  sentMonitorId: id.nullable(),
  sentAs: z.enum(heldSentAs).nullable(),
  sent: z.json(),
  reason: z.enum(heldReasons),
  message: z.string(),
  receivedAt: at,
  photos: z.array(id),
  ...resolution,
});

export type HeldRecordAnswer = z.infer<typeof heldRecordSchema>;

export const heldRecordsAnswerSchema = z.strictObject({
  heldRecords: z.array(heldRecordSchema),
  next,
});

export type HeldRecordsAnswer = z.infer<typeof heldRecordsAnswerSchema>;

// What a held record is saved as (ADR-526 (2)): the record as it should be, in the sync
// contract's own shape, under the id its phone made; or a photograph's record.
export const correctedRecordSchema = z.union([
  syncedRecordSchema,
  z.strictObject({ record: z.literal('PHOTO'), photo: syncedPhotoSchema }),
]);

export type CorrectedRecord = z.infer<typeof correctedRecordSchema>;

// What a photograph belongs to, as the back office reads it: one of its phone's records, a
// record waiting in quarantine, or a record held for a person.
export const photoBelongsTo = [...photoOwnerKinds, 'QUARANTINED_RECORD', 'HELD_RECORD'] as const;

// A file set aside (ADR-482 (5), 526 (1), (3)), beside its photograph: the photograph's project,
// what it belongs to, the fingerprint its phone gave for that file and whether that file has
// been kept since; what arrived, as the server read it; how it was resolved.
export const setAsideFileSchema = z.strictObject({
  id,
  photoId: id,
  file: z.enum(photoFiles),
  deviceId: id,
  receivedSha256: sha256,
  byteCount: z.int().positive(),
  contentType: z.string(),
  receivedAt: at,
  photograph: z.strictObject({
    projectId: id,
    belongsTo: z.strictObject({ kind: z.enum(photoBelongsTo), id }),
    fingerprinted: sha256,
    kept: z.boolean(),
  }),
  ...resolution,
});

export type SetAsideFileAnswer = z.infer<typeof setAsideFileSchema>;

export const setAsideFilesAnswerSchema = z.strictObject({
  setAsideFiles: z.array(setAsideFileSchema),
  next,
});

export type SetAsideFilesAnswer = z.infer<typeof setAsideFilesAnswerSchema>;

// A quarantined record as it waits (ADR-022, 338, 526 (1)): what the phone sent, whose phone and
// monitor, why, and the record that holds its number, read as a field event or an ROE is read.
export const waitingQuarantinedRecordSchema = z.strictObject({
  id,
  projectId: id,
  deviceId: id,
  monitorId: id,
  sent: z.json(),
  reason: z.enum(quarantineReasons),
  holder: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('FIELD_EVENT'), fieldEvent: fieldEventRecordSchema }),
    z.strictObject({ kind: z.literal('ROE'), roe: roeRecordSchema }),
  ]),
  receivedAt: at,
  ...resolution,
});

export type WaitingQuarantinedRecord = z.infer<typeof waitingQuarantinedRecordSchema>;

export const quarantinedRecordsAnswerSchema = z.strictObject({
  quarantinedRecords: z.array(waitingQuarantinedRecordSchema),
  next,
});

export type QuarantinedRecordsAnswer = z.infer<typeof quarantinedRecordsAnswerSchema>;
