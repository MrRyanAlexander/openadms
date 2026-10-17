// A phone turned in: "Sync and turn in" under the master passcode (ARCHITECTURE §7.4, §7.5, §8;
// spec/acceptance/02-people-and-devices.md AC-02-58, 60, 61; spec/acceptance/05-sync.md AC-05-56;
// spec/acceptance/10-api-and-sync.md AC-10-46; BACKLOG 2.6.5, C47, C64, C126, C139; ADR-065, 096,
// 134, 468, 488; REQ-202a, 202b, 209). The endpoint that takes it is `turnInPhoneEndpoint`
// (endpoints.ts).
//
// **The phone has synced first**, every queue, the current monitor's and any archived ones, and
// sent every photograph's file. Then it says, by the ids it made, **everything it still holds**:
// its unplanned assignments, the uses of the master passcode it logged, its records, its
// photographs; and, by fingerprint, anything it sent that had no id the server could read (the
// SHA-256 of what stood in the record's place as canonical JSON, as `sentFingerprint` makes it on
// the server). With them, the last number it used of each series it holds numbers of, and the
// passcode, typed on the phone.
//
// **It is told to wipe only when the server has all of it**, from that same phone: a record
// saved, kept in quarantine or held for a person, not saved (ADR-468 (2)); a photograph saved with
// every file it has kept. Then, in one piece of work, its numbers end (the unused rest handed
// back, or the whole block retired: the domain's `TurnInRules`), it is out of service, its
// sessions end, and its key is revoked: from then on it proves nothing. Otherwise nothing is
// changed, and the answer names what the server doesn't have, so a person sees it on the phone.
import { numberSeries, turnedInBlocks } from '@open-adms/domain';
import { z } from 'zod';

import { lastUsedListSchema, numberBlockSchema } from './sync.ts';
import { id } from './sync-records.ts';

// How much one turn-in names, kept inside the request's one mebibyte: ids are 36 characters and
// fingerprints 64. A phone that has synced holds no more than its own work.
export const turnInRecordsAtMost = 10_000;
export const turnInPhotosAtMost = 10_000;
export const turnInReportsAtMost = 1_000;
export const turnInHeldAtMost = 1_000;

const fingerprint = z.string().regex(/^[0-9a-f]{64}$/, { message: 'is not a SHA-256 in hex' });

const eachOnce = (named: readonly string[]): boolean => new Set(named).size === named.length;

const ids = (atMost: number) => z.array(id).max(atMost).refine(eachOnce);

// Everything the phone still holds, each once, by the id it made for it; what it sent with no id
// the server could read, by its fingerprint.
export const turnInHoldsSchema = z.strictObject({
  unplannedAssignments: ids(turnInReportsAtMost),
  passcodeUses: ids(turnInReportsAtMost),
  records: ids(turnInRecordsAtMost),
  held: z.array(fingerprint).max(turnInHeldAtMost).refine(eachOnce),
  photos: ids(turnInPhotosAtMost),
});

// What a phone sends to be turned in. It never says which phone it is: it proved that.
export const turnInSentSchema = z.strictObject({
  passcode: z.string().min(1).max(4096),
  holds: turnInHoldsSchema,
  lastUsed: lastUsedListSchema,
});

// How each series' blocks ended, and the blocks as they ended.
export const seriesEndedSchema = z.strictObject({
  projectId: id,
  series: z.enum(numberSeries),
  ended: z.enum(turnedInBlocks),
  blocks: z.array(numberBlockSchema),
});

// What the server doesn't have of what the phone holds, named as the phone named it. A photograph
// is named where its record isn't saved, or where any file of it isn't kept.
export const notOnTheServerSchema = turnInHoldsSchema;

export const turnInAnswerSchema = z.discriminatedUnion('turnedIn', [
  z.strictObject({
    turnedIn: z.literal(true),
    // The phone wipes everything it holds now, and its key with it: the server has it all.
    wipe: z.literal(true),
    numbers: z.array(seriesEndedSchema),
  }),
  z.strictObject({
    turnedIn: z.literal(false),
    // Nothing is wiped: the phone keeps everything and stays as it was.
    wipe: z.literal(false),
    message: z.string(),
    notOnTheServer: notOnTheServerSchema,
  }),
]);

export type TurnInSent = z.input<typeof turnInSentSchema>;
export type TurnInReceived = z.output<typeof turnInSentSchema>;
export type TurnInHolds = z.infer<typeof turnInHoldsSchema>;
export type SeriesEnded = z.infer<typeof seriesEndedSchema>;
export type TurnInAnswer = z.infer<typeof turnInAnswerSchema>;
