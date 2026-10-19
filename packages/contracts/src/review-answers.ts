// What a reviewer's action answers with (spec/parts/08-review-and-corrections.md steps 5…7;
// spec/parts/09-invoice-deliver-closeout.md, invoicing; spec/DATA-MODEL.md §6; BACKLOG 2.4.4;
// ADR-107, 228, 363, 365…367, 430): the mark it wrote, as the database keeps it. A mark is a
// record of its own beside the ticket: none of these holds a status, a flag, a line or an amount,
// which are the worker's to conclude in the run the action queued.
import {
  certificationViews,
  fieldEventKinds,
  masterPasscodeSessions,
  measuredAs,
  qcStatuses,
  quarantineReasons,
  workflows,
} from '@open-adms/domain';
import { z } from 'zod';

const id = z.uuid();
const at = z.iso.datetime();
// A ticket as the worker groups one: its project's workflow and bare number.
const ticket = { projectId: id, workflow: z.enum(workflows), ticketNumber: z.string() };

// A person's void of a ticket: kept when it is lifted, with who lifted it and when.
export const ticketVoidRecordSchema = z.strictObject({
  id,
  ...ticket,
  reasonId: id,
  note: z.string().nullable(),
  voidedById: id,
  voidedAt: at,
  liftedById: id.nullable(),
  liftedAt: at.nullable(),
  liftNote: z.string().nullable(),
});

export type TicketVoidRecord = z.infer<typeof ticketVoidRecordSchema>;

// An unvoid's own record, whoever or whatever voided the ticket (ADR-366).
export const ticketUnvoidRecordSchema = z.strictObject({
  id,
  ...ticket,
  note: z.string().nullable(),
  unvoidedById: id,
  unvoidedAt: at,
});

export type TicketUnvoidRecord = z.infer<typeof ticketUnvoidRecordSchema>;

export const flagAcceptanceRecordSchema = z.strictObject({
  id,
  projectId: id,
  flagId: id,
  reasonId: id,
  note: z.string().nullable(),
  acceptedById: id,
  acceptedAt: at,
  // Taken back: who, when and the note, or none while it stands (ADR-534 (8)).
  withdrawnById: id.nullable(),
  withdrawnAt: at.nullable(),
  withdrawNote: z.string().nullable(),
});

export type FlagAcceptanceRecord = z.infer<typeof flagAcceptanceRecordSchema>;

// A record's one QC mark, on exactly one of the eight things QC'd: a completed load or haul-out,
// a unit rate ticket, a certification, an ROE, a survey, an incident or a drop-off log.
export const qcMarkRecordSchema = z.strictObject({
  id,
  projectId: id,
  completedLoadId: id.nullable(),
  completedHaulOutId: id.nullable(),
  unitRateTicketId: id.nullable(),
  certificationId: id.nullable(),
  roeId: id.nullable(),
  surveyId: id.nullable(),
  incidentId: id.nullable(),
  dropOffLogId: id.nullable(),
  status: z.enum(qcStatuses),
  setById: id,
  setAt: at,
  note: z.string().nullable(),
});

export type QcMarkRecord = z.infer<typeof qcMarkRecordSchema>;

export const invoiceBatchRecordSchema = z.strictObject({
  id,
  projectId: id,
  name: z.string(),
  createdById: id.nullable(),
  createdAt: at,
});

export type InvoiceBatchRecord = z.infer<typeof invoiceBatchRecordSchema>;

// A lock as invoiced: kept when it is unlocked, with who unlocked it and when. It holds no
// amount.
export const invoiceLockRecordSchema = z.strictObject({
  id,
  projectId: id,
  completedLoadId: id.nullable(),
  completedHaulOutId: id.nullable(),
  unitRateTicketId: id.nullable(),
  invoiceBatchId: id.nullable(),
  lockedById: id,
  lockedAt: at,
  unlockedById: id.nullable(),
  unlockedAt: at.nullable(),
  unlockNote: z.string().nullable(),
});

export type InvoiceLockRecord = z.infer<typeof invoiceLockRecordSchema>;

// A reprocess a person asked for with nothing changed (spec/parts/08-review-and-corrections.md
// step 4; ADR-498): no record is written but its job, so the answer is what was asked. The
// tickets named, each once (a set-aside job's, where one was put back), and those of them locked
// as invoiced, which the job leaves off and the worker leaves as they are.
const ticketKey = { workflow: z.enum(workflows), ticketNumber: z.string() };
export const reprocessRecordSchema = z.strictObject({
  projectId: id,
  // The job set aside whose tickets were put back; none where a person named them.
  setAsideJobId: id.nullable(),
  tickets: z.array(z.strictObject(ticketKey)),
  lockedAsInvoiced: z.array(z.strictObject(ticketKey)),
  requestedById: id,
});

export type ReprocessRecord = z.infer<typeof reprocessRecordSchema>;

// What a correction answers with (spec/parts/08-review-and-corrections.md steps 2…4;
// spec/DATA-MODEL.md §4; BACKLOG 2.4.4; ADR-051, 337, 364, 431): the record as it now stands, the
// same one, its id unchanged. Only what a monitor recorded and a reviewer may correct: never a
// status, a zone, a flag or a line, which the worker concludes again in the run the correction
// queued, and never where a photograph's file is kept.
export const addressSources = ['LOOKED_UP', 'TYPED'] as const;
export const recordSources = ['DEVICE', 'BACK_OFFICE'] as const;

// A fix as exact decimal text, both halves or none (invariant 15).
const fix = z.strictObject({ latitude: z.string(), longitude: z.string() }).nullable();

export const fieldEventRecordSchema = z.strictObject({
  id,
  ...ticket,
  kind: z.enum(fieldEventKinds),
  // Empty when not split.
  splitSuffix: z.string(),
  source: z.enum(recordSources),
  // Made in a session opened under the master passcode, and which way; none in a monitor's own.
  masterPasscodeSession: z.enum(masterPasscodeSessions).nullable(),
  // Made in the back office: who and why.
  createdById: id.nullable(),
  createdReasonId: id.nullable(),
  monitorId: id,
  startedAt: at,
  endedAt: at,
  deviceUtcOffsetMinutes: z.number().int(),
  start: fix,
  end: fix,
  address: z.string().nullable(),
  addressSource: z.enum(addressSources).nullable(),
  notes: z.string().nullable(),
  // The number as scanned or corrected, and the certification it finds on the project.
  certNumber: z.string(),
  certificationId: id.nullable(),
  certKeyedByHand: z.boolean(),
  typedCapacityCy: z.number().nullable(),
  numberTyped: z.boolean(),
  numberTypedReasonId: id.nullable(),
  siteId: id.nullable(),
  formDebrisTypeId: id.nullable(),
  fieldTagId: id.nullable(),
  roeNumber: z.string().nullable(),
  roeId: id.nullable(),
  estimateCy: z.number().nullable(),
  loadCall: z.number().nullable(),
  scaleReceiptId: id.nullable(),
  carriedCount: z.number().nullable(),
  kindOfWorkId: id.nullable(),
  payableTypeId: id.nullable(),
  payItemId: id.nullable(),
  unitCount: z.number().nullable(),
  measurementInches: z.number().nullable(),
  measuredAs: z.enum(measuredAs).nullable(),
  rootBallInches: z.number().nullable(),
  rootBallHalfExposed: z.boolean().nullable(),
  surveyNumber: z.string().nullable(),
  markedIneligible: z.boolean().nullable(),
});

export type FieldEventRecord = z.infer<typeof fieldEventRecordSchema>;

// A line of an itemised unit rate event. One taken off stays, marked with the time.
export const itemLineRecordSchema = z.strictObject({
  id,
  fieldEventId: id,
  itemNameId: id,
  quantity: z.number(),
  takenOffAt: at.nullable(),
});

export type ItemLineRecord = z.infer<typeof itemLineRecordSchema>;

// A ticket a load's collection lists as carried. One taken off stays, marked with the time.
export const carriedTicketRecordSchema = z.strictObject({
  id,
  fieldEventId: id,
  carriedTicketNumber: z.string(),
  takenOffAt: at.nullable(),
});

export type CarriedTicketRecord = z.infer<typeof carriedTicketRecordSchema>;

// A waypoint a collection's monitor marked (ADR-571, 581): its place in the order, the phone's
// time and the fix it had, or none; a fix the phone sent that couldn't be one, as sent. One taken
// off stays, marked with the time.
export const waypointRecordSchema = z.strictObject({
  id,
  fieldEventId: id,
  position: z.int().min(1),
  markedAt: at,
  fix,
  unreadableGps: z.strictObject({ latitude: z.unknown(), longitude: z.unknown() }).nullable(),
  takenOffAt: at.nullable(),
});

export type WaypointRecord = z.infer<typeof waypointRecordSchema>;

// A photograph's record with the back office's two marks: removed from the record (its row, its
// file and its fingerprints stay) and its label. It belongs to exactly one of the seven.
export const photographRecordSchema = z.strictObject({
  id,
  projectId: id,
  fieldEventId: id.nullable(),
  certificationId: id.nullable(),
  scaleReceiptId: id.nullable(),
  roeId: id.nullable(),
  surveyId: id.nullable(),
  incidentId: id.nullable(),
  dropOffLogId: id.nullable(),
  view: z.enum(certificationViews).nullable(),
  capturedAt: at,
  // When its file reached storage; none until it has.
  uploadedAt: at.nullable(),
  removedAt: at.nullable(),
  label: z.string().nullable(),
});

export type PhotographRecord = z.infer<typeof photographRecordSchema>;

// The site's paper as the tower copied it: its own number, never one of ours (ADR-034).
export const scaleReceiptRecordSchema = z.strictObject({
  id,
  projectId: id,
  receiptNumber: z.string(),
  siteId: id,
  grossWeightLb: z.number().nullable(),
  tareWeightLb: z.number().nullable(),
  netWeightLb: z.number().nullable(),
  netWeightTons: z.number().nullable(),
  enteredById: id,
  enteredAt: at,
  notes: z.string().nullable(),
});

export type ScaleReceiptRecord = z.infer<typeof scaleReceiptRecordSchema>;

// What a correction to an ROE or a form answers with, and a quarantined record once resolved
// (spec/parts/08-review-and-corrections.md steps 2, 9, "One review queue"; spec/DATA-MODEL.md
// §4.3…4.5; BACKLOG 2.4.4, 2.8.7; ADR-149, 327, 338, 364, 432, 534): the record as it now stands,
// the same one, with the answers to the firm's own fields and the version they answer.
// A calendar day, 2026-10-09.
const day = z.iso.date();

// The answers to the firm's own fields, keyed by field id, and the version of its form's fields
// they answer; none answers nothing.
const answered = {
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  formDefinitionId: id.nullable(),
};

export const roeRecordSchema = z.strictObject({
  id,
  projectId: id,
  // As its series wrote it or as the paper has it: never parsed.
  roeNumber: z.string(),
  parcelId: z.string().nullable(),
  address: z.string().nullable(),
  ownerName: z.string().nullable(),
  signed: z.boolean(),
  signedDate: day.nullable(),
  fix,
  source: z.enum(recordSources),
  madeById: id.nullable(),
  madeAt: at.nullable(),
  notes: z.string().nullable(),
  ...answered,
});

export type RoeRecord = z.infer<typeof roeRecordSchema>;

// One pick of an ROE's scope: a debris type of the project's load form, or a payable type. One
// taken off stays, marked with the time.
export const roeScopeItemRecordSchema = z.strictObject({
  id,
  projectId: id,
  roeId: id,
  formDebrisTypeId: id.nullable(),
  payableTypeId: id.nullable(),
  count: z.number().nullable(),
  takenOffAt: at.nullable(),
});

export type RoeScopeItemRecord = z.infer<typeof roeScopeItemRecordSchema>;

// What every form records, whoever made it: one made in the back office says who and why.
const form = {
  id,
  projectId: id,
  source: z.enum(recordSources),
  createdById: id.nullable(),
  createdReasonId: id.nullable(),
  monitorId: id,
  madeAt: at,
  deviceUtcOffsetMinutes: z.number().int(),
  fix,
  notes: z.string().nullable(),
  ...answered,
};

export const surveyRecordSchema = z.strictObject({
  ...form,
  workTypeId: id,
  surveyNumber: z.string().nullable(),
  // The number as picked, typed or corrected, and the ROE it finds on the project.
  roeNumber: z.string().nullable(),
  roeId: id.nullable(),
});

export type SurveyRecord = z.infer<typeof surveyRecordSchema>;

export const incidentRecordSchema = z.strictObject({
  ...form,
  incidentTypeId: id,
  incidentSubTypeId: id.nullable(),
  description: z.string().nullable(),
  parties: z.string().nullable(),
  address: z.string().nullable(),
  contractorId: id.nullable(),
  certNumber: z.string().nullable(),
  certificationId: id.nullable(),
  roeNumber: z.string().nullable(),
  roeId: id.nullable(),
});

export type IncidentRecord = z.infer<typeof incidentRecordSchema>;

export const dropOffLogRecordSchema = z.strictObject({
  ...form,
  siteId: id,
  residentName: z.string().nullable(),
  originAddress: z.string().nullable(),
});

export type DropOffLogRecord = z.infer<typeof dropOffLogRecordSchema>;

// A quarantined record's own row: why it waits, what holds its number, and who resolved it, when
// and how. Never what the phone sent, which stays exactly as sent and is read where it is shown.
export const quarantinedRecordSchema = z.strictObject({
  id,
  projectId: id,
  reason: z.enum(quarantineReasons),
  holdingEventId: id.nullable(),
  holdingRoeId: id.nullable(),
  receivedAt: at,
  resolvedById: id.nullable(),
  resolvedAt: at.nullable(),
  resolution: z.string().nullable(),
});

export type QuarantinedRecordAnswer = z.infer<typeof quarantinedRecordSchema>;

// What a change to a certification answers with (spec/parts/03-certification.md steps 10…13;
// spec/DATA-MODEL.md §3; BACKLOG 2.4.4; ADR-079, 080, 433): the certification as it now stands,
// the same one. Its capacity is what its boxes work out to, never a value anybody sent. Never
// the driver's phone or licence number, which a viewer never reads (a correction may move them).
export const certificationRecordSchema = z.strictObject({
  id,
  projectId: id,
  // Cert = placard = badge, as written: never parsed (ADR-045).
  certNumber: z.string(),
  kind: z.enum(['CONTAINER', 'CREW']),
  primeId: id,
  firstTierSubId: id.nullable(),
  secondTierSubId: id.nullable(),
  // Whole cubic yards; a crew has none.
  capacityCy: z.number().int().nullable(),
  vehicleTypeId: id.nullable(),
  vehicleTypeOther: z.string().nullable(),
  crewTypeId: id.nullable(),
  driverName: z.string().nullable(),
  driverLicenceState: z.string().nullable(),
  driverLicenceExpiry: day.nullable(),
  tagNumber: z.string().nullable(),
  tagState: z.string().nullable(),
  tagExpiry: day.nullable(),
  certifiedAt: at,
  deviceUtcOffsetMinutes: z.number().int(),
  certifiedById: id,
  // Where it came from: its phone, or the back office from the paper sheet, with who entered it
  // and why (ADR-521, 534).
  deviceId: id.nullable(),
  createdById: id.nullable(),
  createdReasonId: id.nullable(),
  clientRepresentativeName: z.string().nullable(),
  contractorRepresentativeName: z.string().nullable(),
  notes: z.string().nullable(),
  signaturesOnFile: z.boolean(),
  replacesId: id.nullable(),
  replacedReason: z.string().nullable(),
  // A day in the project's time zone, the reason and the admin: all three or none.
  revokedFrom: day.nullable(),
  revokedReason: z.string().nullable(),
  revokedById: id.nullable(),
});

export type CertificationRecord = z.infer<typeof certificationRecordSchema>;
