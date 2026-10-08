// What a reviewer's action answers with (spec/parts/08-review-and-corrections.md steps 5…7;
// spec/parts/09-invoice-deliver-closeout.md, invoicing; spec/DATA-MODEL.md §6; BACKLOG 2.4.4;
// ADR-107, 228, 363, 365…367, 430): the mark it wrote, as the database keeps it. A mark is a
// record of its own beside the ticket: none of these holds a status, a flag, a line or an amount,
// which are the worker's to conclude in the run the action queued.
import { qcStatuses, workflows } from '@open-adms/domain';
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
