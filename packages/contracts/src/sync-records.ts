// The records a phone sends at a sync, one schema a kind (ARCHITECTURE §9 (2), (3), §10;
// spec/parts/05-sync.md steps 3…6; spec/acceptance/05-sync.md; AC-10-35, 36; T-12; BACKLOG 2.6.1,
// C69, C84 (9); ADR-022, 052, 100, 236, 329, 338, 466; REQ-004, 203): a field event with its item
// lines and the tickets it carries, a scale receipt, an incident, a drop-off log, a survey and an
// ROE made on a phone. Each carries the id its phone made when the record began, its project and
// the monitor who made it.
//
// **A schema says what a record can be at all, and nothing about whether the work was right**
// (ADR-052): a type, a length, a range the database itself holds. A debris type, a load call or
// a kind of work left out, a typed number with no reason, a time that ends before it starts, a
// GPS fix that couldn't be one and a ticket number that isn't digits are all taken as sent and
// flagged later (ADR-329). What is refused is a record that isn't one: a field nobody named, a
// detail on a kind that doesn't record it, a value past what the database keeps.
//
// **Never here** (AC-10-35): a status, a zone, a mileage, a flag, a pay item worked out, a rate,
// an amount, a certified capacity or a completed load. A capacity typed for a truck keyed in by
// hand is the monitor's claim and never bills (ADR-154). **Nor which phone a record is from, or
// that a phone made it:** the phone has proved itself, and the server says both (ADR-466).
//
// A time is sent as a UTC instant, with how far the phone's clock stood from UTC beside it
// (ADR-100), and is read as a `Date`. A photograph's record comes with its upload (2.6.4), a
// certification with part 3 of this task.
import { FieldEventDetails, fieldEventKinds, measuredAs, workflows } from '@open-adms/domain';
import { z } from 'zod';

import { places } from './field-event-details.ts';
import { addressSources } from './review-answers.ts';

const id = z.uuid();
// The phone's clock, as a UTC instant.
const instant = z.iso.datetime().transform((at) => new Date(at));
// How far that clock stood from UTC, in minutes: UTC−12:00 to UTC+14:00.
const offset = z.number().int().min(-720).max(840);
// A number as scanned, picked or typed off a badge, a ticket or a paper: kept as sent, never
// parsed and never trimmed.
const numberAsSent = z.string().min(1).max(40);
// Words a monitor typed, as typed.
const words = z.string().max(2000);
// Half a GPS fix, as the phone had it: exact decimal text when it is one. What couldn't be a fix
// is still taken, and kept as sent without the fix (ADR-329 (5)).
const fixHalf = z.string().max(40).nullable();
// The version of its lists the phone captured with.
const setupVersion = z.number().int().min(1).max(2_000_000_000);
const pounds = places(2).max(9_999_999_999.99);

// The firm's own fields as answered, with the version of the definition the phone showed
// (ADR-278): both left out where the form has none. An answer is text, a number, yes or no, a
// pick or a photograph's id; whether it fits that version is told to the sender, and the answers
// are kept as sent either way (ADR-338 (9)).
const answered = {
  formDefinitionId: id.optional(),
  answers: z
    .record(z.string().min(1).max(100), z.union([z.string().max(4000), z.number(), z.boolean()]))
    .refine((answers) => Object.keys(answers).length <= 200)
    .optional(),
};

// A line of an itemised unit rate event: the item picked, and its count or its hours.
export const syncedItemSchema = z.strictObject({
  itemNameId: id,
  quantity: places(2).max(99_999_999.99),
});

// A field event: what one monitor recorded under a ticket number (ADR-236).
export const syncedFieldEventSchema = z
  .strictObject({
    id,
    projectId: id,
    workflow: z.enum(workflows),
    kind: z.enum(fieldEventKinds),
    ticketNumber: numberAsSent,
    // Empty when not split.
    splitSuffix: z.string().max(4),
    monitorId: id,
    // The assignment the phone held, and the version of its lists (ADR-240, 324).
    assignmentId: id,
    setupVersion,
    // Made under the master passcode's temporary session for this monitor (ADR-120).
    temporarySession: z.boolean(),
    // Typed because the barcode wouldn't read, with the reason picked (ADR-111, 173).
    numberTyped: z.boolean(),
    numberTypedReasonId: id.nullable(),
    // As scanned off the badge (ADR-017): which certification it finds is the server's to look
    // up.
    certNumber: numberAsSent,
    // A truck with no badge to scan, and the capacity the monitor read off it: their claim only
    // (ADR-154; AC-04-26).
    certKeyedByHand: z.boolean(),
    typedCapacityCy: z.number().int().min(0).max(9999).nullable(),
    // The assignment's site, where the work is at one (ADR-195).
    siteId: id.nullable(),
    startedAt: instant,
    endedAt: instant,
    deviceUtcOffsetMinutes: offset,
    // Whatever fix the phone had at each end (ADR-083).
    startLatitude: fixHalf.optional(),
    startLongitude: fixHalf.optional(),
    endLatitude: fixHalf,
    endLongitude: fixHalf,
    address: words.nullable(),
    addressSource: z.enum(addressSources).nullable(),
    notes: words.nullable(),
    // What its kind records (packages/domain's fieldEventDetails). The debris type is the entry
    // on the project's form.
    formDebrisTypeId: id.nullable(),
    fieldTagId: id.nullable(),
    // As picked or typed: the ROE it finds is the server's to look up.
    roeNumber: numberAsSent.nullable(),
    estimateCy: places(1).max(9_999_999.9).nullable(),
    // A whole number 0–100; 0 is taken (ADR-116).
    loadCall: z.number().int().min(0).max(100).nullable(),
    // The scale receipt recorded with it, by the id the phone made.
    scaleReceiptId: id.nullable(),
    carriedCount: z.number().int().min(0).max(9999).nullable(),
    kindOfWorkId: id.nullable(),
    payableTypeId: id.nullable(),
    // The phone's answer from the payable type and the measurement, what printed; none where
    // no band fits (ADR-213).
    payItemId: id.nullable(),
    unitCount: places(2).max(99_999_999.99).nullable(),
    measurementInches: places(1).max(9_999_999.9).nullable(),
    measuredAs: z.enum(measuredAs).nullable(),
    rootBallInches: places(1).max(9_999_999.9).nullable(),
    rootBallHalfExposed: z.boolean().nullable(),
    surveyNumber: numberAsSent.nullable(),
    markedIneligible: z.boolean().nullable(),
    items: z.array(syncedItemSchema).max(100).readonly(),
    // The numbers of the tickets a load carries, as the loading monitor added them (ADR-192).
    carriedTickets: z.array(numberAsSent).max(100).readonly(),
  })
  // Which kind records which detail, a split's suffix and estimate both or neither, a
  // measurement with how it was read: the domain's one rule, in its own words.
  .superRefine((event, context) => {
    for (const refusal of new FieldEventDetails(event.kind).refusals(event)) {
      context.addIssue({ code: 'custom', message: refusal.message, path: [refusal.detail] });
    }
  });

// The paper a final disposal site hands the tower, copied by hand (ADR-034): its own record,
// sent before the disposals that point at it. A weight is what the paper says, never worked out.
export const syncedScaleReceiptSchema = z.strictObject({
  id,
  projectId: id,
  receiptNumber: numberAsSent,
  siteId: id,
  grossWeightLb: pounds.nullable(),
  tareWeightLb: pounds.nullable(),
  netWeightLb: pounds.nullable(),
  netWeightTons: places(4).max(99_999_999.9999).nullable(),
  enteredById: id,
  enteredAt: instant,
  deviceUtcOffsetMinutes: offset,
});

// What every form made on a phone records (ADR-327).
const form = {
  id,
  projectId: id,
  monitorId: id,
  assignmentId: id,
  setupVersion,
  madeAt: instant,
  deviceUtcOffsetMinutes: offset,
  latitude: fixHalf,
  longitude: fixHalf,
  notes: words.nullable(),
  ...answered,
};

// An incident: what it names, where the project offers it (ADR-328), is the contractor picked
// by name and the cert number and the ROE number as scanned, picked or typed.
export const syncedIncidentSchema = z.strictObject({
  ...form,
  incidentTypeId: id,
  incidentSubTypeId: id.nullable(),
  description: words.nullable(),
  parties: words.nullable(),
  address: words.nullable(),
  contractorId: id.nullable(),
  certNumber: numberAsSent.nullable(),
  roeNumber: numberAsSent.nullable(),
});

// A citizen's drop-off at the assignment's site (ADR-215): no quantity, no number, no cost.
export const syncedDropOffLogSchema = z.strictObject({
  ...form,
  siteId: id,
  residentName: words.nullable(),
  originAddress: words.nullable(),
});

// A property's condition before work or after it (ADR-149, 150).
export const syncedSurveySchema = z.strictObject({
  ...form,
  workTypeId: id,
  surveyNumber: numberAsSent.nullable(),
  roeNumber: numberAsSent.nullable(),
});

// An ROE made on a phone: the next number of its ROE block, written R-0007, unless the paper
// ROE has one, typed (ADR-149, 323).
export const syncedRoeSchema = z.strictObject({
  id,
  projectId: id,
  roeNumber: numberAsSent,
  parcelId: words.nullable(),
  address: words.nullable(),
  ownerName: words.nullable(),
  signed: z.boolean(),
  // A calendar day: 2026-10-09.
  signedDate: z.iso.date().nullable(),
  latitude: fixHalf.optional(),
  longitude: fixHalf.optional(),
  madeById: id,
  assignmentId: id,
  madeAt: instant,
  deviceUtcOffsetMinutes: offset,
  ...answered,
});

// The kinds of record a phone sends at a sync, in no order: arrival order means nothing
// (ADR-030), except that a scale receipt is sent before the disposals that point at it.
export const syncedRecordKinds = [
  'FIELD_EVENT',
  'SCALE_RECEIPT',
  'INCIDENT',
  'DROP_OFF_LOG',
  'SURVEY',
  'ROE',
] as const;

// One record, named by its kind.
export const syncedRecordSchema = z.discriminatedUnion('record', [
  z.strictObject({ record: z.literal('FIELD_EVENT'), fieldEvent: syncedFieldEventSchema }),
  z.strictObject({ record: z.literal('SCALE_RECEIPT'), scaleReceipt: syncedScaleReceiptSchema }),
  z.strictObject({ record: z.literal('INCIDENT'), incident: syncedIncidentSchema }),
  z.strictObject({ record: z.literal('DROP_OFF_LOG'), dropOffLog: syncedDropOffLogSchema }),
  z.strictObject({ record: z.literal('SURVEY'), survey: syncedSurveySchema }),
  z.strictObject({ record: z.literal('ROE'), roe: syncedRoeSchema }),
]);

// `Synced…` is a record as a phone sends it (a time as text); `Received…` as the server reads
// it (a time as a `Date`).
export type SyncedItem = z.input<typeof syncedItemSchema>;
export type SyncedFieldEvent = z.input<typeof syncedFieldEventSchema>;
export type SyncedScaleReceipt = z.input<typeof syncedScaleReceiptSchema>;
export type SyncedIncident = z.input<typeof syncedIncidentSchema>;
export type SyncedDropOffLog = z.input<typeof syncedDropOffLogSchema>;
export type SyncedSurvey = z.input<typeof syncedSurveySchema>;
export type SyncedRoe = z.input<typeof syncedRoeSchema>;
export type SyncedRecord = z.input<typeof syncedRecordSchema>;
export type SyncedRecordKind = (typeof syncedRecordKinds)[number];
export type ReceivedItem = z.output<typeof syncedItemSchema>;
export type ReceivedFieldEvent = z.output<typeof syncedFieldEventSchema>;
export type ReceivedScaleReceipt = z.output<typeof syncedScaleReceiptSchema>;
export type ReceivedIncident = z.output<typeof syncedIncidentSchema>;
export type ReceivedDropOffLog = z.output<typeof syncedDropOffLogSchema>;
export type ReceivedSurvey = z.output<typeof syncedSurveySchema>;
export type ReceivedRoe = z.output<typeof syncedRoeSchema>;
export type ReceivedRecord = z.output<typeof syncedRecordSchema>;
