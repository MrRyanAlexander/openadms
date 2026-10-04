// What each kind of field event records beside what every kind does, as a payload carries it
// (spec/DATA-MODEL.md §4.1 (2), §8; ADR-006, 055, 325, 326, 327; REQ-103). The shape of each detail is
// here; which kind records which, a split's suffix and estimate both or neither, and a measurement
// with how it was read are packages/domain's FieldEventDetails, asked once. The whole sync payload
// (what every kind records, the scale receipt's own record, photographs) is Phase 2's.
import { FieldEventDetails, fieldEventKinds, measuredAs } from '@open-adms/domain';
import { z } from 'zod';

const id = z.uuid();
// A number as the database keeps it: nought or more, to that many decimal places.
const places = (count: number): z.ZodNumber =>
  z
    .number()
    .nonnegative()
    .multipleOf(10 ** -count);

export const fieldEventDetailsSchema = z
  .strictObject({
    kind: z.enum(fieldEventKinds),
    // Empty when not split.
    splitSuffix: z.string(),
    formDebrisTypeId: id.nullish(),
    fieldTagId: id.nullish(),
    // The number as picked or typed: a snapshot, never parsed.
    roeNumber: z.string().nullish(),
    // The ROE that number found, where the phone picked it from its list.
    roeId: id.nullish(),
    estimateCy: places(1).nullish(),
    // A whole number 0–100; 0 is taken (ADR-116).
    loadCall: z.int().min(0).max(100).nullish(),
    // The scale receipt it points at, by the id its phone made.
    scaleReceiptId: id.nullish(),
    carriedCount: z.int().nonnegative().nullish(),
    kindOfWorkId: id.nullish(),
    payableTypeId: id.nullish(),
    payItemId: id.nullish(),
    unitCount: places(2).nullish(),
    measurementInches: places(1).nullish(),
    measuredAs: z.enum(measuredAs).nullish(),
    rootBallInches: places(1).nullish(),
    rootBallHalfExposed: z.boolean().nullish(),
    surveyNumber: z.string().nullish(),
    markedIneligible: z.boolean().nullish(),
  })
  .superRefine((details, context) => {
    for (const refusal of new FieldEventDetails(details.kind).refusals(details)) {
      context.addIssue({ code: 'custom', message: refusal.message, path: [refusal.detail] });
    }
  });

export type FieldEventDetailsPayload = z.infer<typeof fieldEventDetailsSchema>;
