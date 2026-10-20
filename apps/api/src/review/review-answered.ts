// How a reviewer's endpoint answers what its service said (ARCHITECTURE §6, Authorization,
// Output; AC-10-28, 33; ADR-364, 422, 424, 430): a saved action with its record and what it
// queued, as a setup change is answered; an action the domain's rules refuse as `NOT_SAVED`, with
// the rule's own code and its plain words; a person who may not do it as `NOT_ALLOWED`, the
// service having asked inside its own piece of work whatever the door already asked. What the
// database's own constraints refuse is thrown past here and answered plainly by the error filter
// (process/database-refusal.ts). The log says what was done or why not, by code: never a name, a
// number or a note.
import type {
  CarriedTicket,
  Certification,
  DropOffLog,
  FieldEvent,
  FieldEventItem,
  FieldEventWaypoint,
  FlagAcceptance,
  Incident,
  InvoiceBatch,
  InvoiceLock,
  Photo,
  Prisma,
  QcMark,
  QuarantinedRecord,
  Roe,
  RoeScopeItem,
  ScaleReceipt,
  Survey,
  TicketUnvoid,
  TicketVoid,
} from '@open-adms/db';
import type {
  CarriedTicketRecord,
  CertificationRecord,
  DropOffLogRecord,
  FieldEventRecord,
  FlagAcceptanceRecord,
  IncidentRecord,
  InvoiceBatchRecord,
  InvoiceLockRecord,
  ItemLineRecord,
  PhotographRecord,
  QcMarkRecord,
  QuarantinedRecordAnswer,
  ReprocessRecord,
  RoeRecord,
  RoeScopeItemRecord,
  ScaleReceiptRecord,
  SurveyRecord,
  TicketUnvoidRecord,
  TicketVoidRecord,
  WaypointRecord,
} from '@open-adms/contracts';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { answered, type SavedAnswer } from '../setup/setup-answered.ts';
import type { Outcome } from '../setup/setup-service.ts';
import type { ReprocessAsked } from './reprocesses.ts';
import type { Reviewed } from './review-service.ts';

export function reviewed<T, A>(
  request: FastifyRequest,
  outcome: Outcome<T>,
  shown: (record: T) => A,
  done: string,
): SavedAnswer<A> {
  if (!outcome.saved) {
    const { code, message } = outcome.refusal;
    request.log.info({ why: code }, 'A reviewer’s action was refused.');
    if (code === 'NOT_PERMITTED') throw new Refusal('NOT_ALLOWED', 403);
    throw new Refusal('NOT_SAVED', 422, message, code);
  }
  return answered(request, outcome, shown, done);
}

const time = (at: Date | null): string | null => at?.toISOString() ?? null;

export const ticketVoidRecord = (made: TicketVoid): TicketVoidRecord => ({
  id: made.id,
  projectId: made.projectId,
  workflow: made.workflow,
  ticketNumber: made.ticketNumber,
  reasonId: made.reasonId,
  note: made.note,
  voidedById: made.voidedById,
  voidedAt: made.voidedAt.toISOString(),
  liftedById: made.liftedById,
  liftedAt: time(made.liftedAt),
  liftNote: made.liftNote,
});

export const ticketUnvoidRecord = (made: TicketUnvoid): TicketUnvoidRecord => ({
  id: made.id,
  projectId: made.projectId,
  workflow: made.workflow,
  ticketNumber: made.ticketNumber,
  note: made.note,
  unvoidedById: made.unvoidedById,
  unvoidedAt: made.unvoidedAt.toISOString(),
});

export const flagAcceptanceRecord = (made: FlagAcceptance): FlagAcceptanceRecord => ({
  id: made.id,
  projectId: made.projectId,
  flagId: made.flagId,
  reasonId: made.reasonId,
  note: made.note,
  acceptedById: made.acceptedById,
  acceptedAt: made.acceptedAt.toISOString(),
  withdrawnById: made.withdrawnById,
  withdrawnAt: time(made.withdrawnAt),
  withdrawNote: made.withdrawNote,
});

// A unit rate ticket is named by its one field event.
export const qcMarkRecord = (mark: QcMark): QcMarkRecord => ({
  id: mark.id,
  projectId: mark.projectId,
  completedLoadId: mark.completedLoadId,
  completedHaulOutId: mark.completedHaulOutId,
  unitRateTicketId: mark.fieldEventId,
  certificationId: mark.certificationId,
  roeId: mark.roeId,
  surveyId: mark.surveyId,
  incidentId: mark.incidentId,
  dropOffLogId: mark.dropOffLogId,
  status: mark.status,
  setById: mark.setById,
  setAt: mark.setAt.toISOString(),
  note: mark.note,
});

export const invoiceBatchRecord = (batch: InvoiceBatch): InvoiceBatchRecord => ({
  id: batch.id,
  projectId: batch.projectId,
  name: batch.name,
  createdById: batch.createdById,
  createdAt: batch.createdAt.toISOString(),
});

// A reprocess writes no record but its job: what was asked, as its queue read it.
export const reprocessRecord = ({
  record,
  reprocess,
}: Reviewed<ReprocessAsked>): ReprocessRecord => ({
  projectId: reprocess.projectId,
  setAsideJobId: record.setAsideJobId,
  tickets: reprocess.tickets.map(({ workflow, ticketNumber }) => ({ workflow, ticketNumber })),
  lockedAsInvoiced: reprocess.lockedAsInvoiced.map(({ workflow, ticketNumber }) => ({
    workflow,
    ticketNumber,
  })),
  requestedById: reprocess.requestedById,
});

export const invoiceLockRecord = (lock: InvoiceLock): InvoiceLockRecord => ({
  id: lock.id,
  projectId: lock.projectId,
  completedLoadId: lock.completedLoadId,
  completedHaulOutId: lock.completedHaulOutId,
  unitRateTicketId: lock.fieldEventId,
  invoiceBatchId: lock.invoiceBatchId,
  lockedById: lock.lockedById,
  lockedAt: lock.lockedAt.toISOString(),
  unlockedById: lock.unlockedById,
  unlockedAt: time(lock.unlockedAt),
  unlockNote: lock.unlockNote,
});

const number = (kept: Prisma.Decimal | null): number | null => kept?.toNumber() ?? null;
// A fix as exact decimal text, both halves or none (invariant 15).
const fix = (latitude: Prisma.Decimal | null, longitude: Prisma.Decimal | null) =>
  latitude === null || longitude === null
    ? null
    : { latitude: latitude.toFixed(8), longitude: longitude.toFixed(8) };

// A field event as a monitor recorded it and a reviewer corrected it: nothing the worker
// concludes from it (its status, zone and worked-out pay item are the run's to write again).
export const fieldEventRecord = (event: FieldEvent): FieldEventRecord => ({
  id: event.id,
  projectId: event.projectId,
  workflow: event.workflow,
  ticketNumber: event.ticketNumber,
  kind: event.kind,
  splitSuffix: event.splitSuffix,
  source: event.source,
  masterPasscodeSession: event.masterPasscodeSession,
  createdById: event.createdById,
  createdReasonId: event.createdReasonId,
  monitorId: event.monitorId,
  startedAt: event.startedAt.toISOString(),
  endedAt: event.endedAt.toISOString(),
  deviceUtcOffsetMinutes: event.deviceUtcOffsetMinutes,
  start: fix(event.startLatitude, event.startLongitude),
  end: fix(event.endLatitude, event.endLongitude),
  address: event.address,
  addressSource: event.addressSource,
  notes: event.notes,
  certNumber: event.certNumber,
  certificationId: event.certificationId,
  certKeyedByHand: event.certKeyedByHand,
  typedCapacityCy: event.typedCapacityCy,
  numberTyped: event.numberTyped,
  numberTypedReasonId: event.numberTypedReasonId,
  siteId: event.siteId,
  formDebrisTypeId: event.formDebrisTypeId,
  fieldTagId: event.fieldTagId,
  roeNumber: event.roeNumber,
  roeId: event.roeId,
  estimateCy: number(event.estimateCy),
  loadCall: event.loadCall,
  scaleReceiptId: event.scaleReceiptId,
  carriedCount: event.carriedCount,
  kindOfWorkId: event.kindOfWorkId,
  payableTypeId: event.payableTypeId,
  payItemId: event.payItemId,
  unitCount: number(event.unitCount),
  measurementInches: number(event.measurementInches),
  measuredAs: event.measuredAs,
  rootBallInches: number(event.rootBallInches),
  rootBallHalfExposed: event.rootBallHalfExposed,
  surveyNumber: event.surveyNumber,
  markedIneligible: event.markedIneligible,
});

export const itemLineRecord = (line: FieldEventItem): ItemLineRecord => ({
  id: line.id,
  fieldEventId: line.fieldEventId,
  itemNameId: line.itemNameId,
  quantity: line.quantity.toNumber(),
  takenOffAt: time(line.archivedAt),
});

export const carriedTicketRecord = (carried: CarriedTicket): CarriedTicketRecord => ({
  id: carried.id,
  fieldEventId: carried.fieldEventId,
  carriedTicketNumber: carried.carriedTicketNumber,
  takenOffAt: time(carried.archivedAt),
});

// A waypoint as its collection's monitor marked it and a reviewer corrected it (ADR-581).
export const waypointRecord = (waypoint: FieldEventWaypoint): WaypointRecord => ({
  id: waypoint.id,
  fieldEventId: waypoint.fieldEventId,
  position: waypoint.position,
  markedAt: waypoint.markedAt.toISOString(),
  fix: fix(waypoint.latitude, waypoint.longitude),
  unreadableGps:
    waypoint.unreadableGps === null
      ? null
      : (waypoint.unreadableGps as { latitude: unknown; longitude: unknown }),
  takenOffAt: time(waypoint.archivedAt),
});

// Never where its file is kept.
export const photographRecord = (photo: Photo): PhotographRecord => ({
  id: photo.id,
  projectId: photo.projectId,
  fieldEventId: photo.fieldEventId,
  certificationId: photo.certificationId,
  scaleReceiptId: photo.scaleReceiptId,
  roeId: photo.roeId,
  surveyId: photo.surveyId,
  incidentId: photo.incidentId,
  dropOffLogId: photo.dropOffLogId,
  view: photo.view,
  stage: photo.stage,
  capturedAt: photo.capturedAt.toISOString(),
  uploadedAt: time(photo.uploadedAt),
  removedAt: time(photo.archivedAt),
  label: photo.label,
});

export const scaleReceiptRecord = (receipt: ScaleReceipt): ScaleReceiptRecord => ({
  id: receipt.id,
  projectId: receipt.projectId,
  receiptNumber: receipt.receiptNumber,
  siteId: receipt.siteId,
  grossWeightLb: number(receipt.grossWeightLb),
  tareWeightLb: number(receipt.tareWeightLb),
  netWeightLb: number(receipt.netWeightLb),
  netWeightTons: number(receipt.netWeightTons),
  enteredById: receipt.enteredById,
  enteredAt: receipt.enteredAt.toISOString(),
  notes: receipt.notes,
});

// The answers to the firm's own fields as kept, and the version they answer.
const answersOf = (record: {
  readonly answers: Prisma.JsonValue;
  readonly formDefinitionId: string | null;
}) => ({
  answers: record.answers as Record<string, string | number | boolean>,
  formDefinitionId: record.formDefinitionId,
});

// An ROE as it was made and corrected.
export const roeRecord = (roe: Roe): RoeRecord => ({
  id: roe.id,
  projectId: roe.projectId,
  roeNumber: roe.roeNumber,
  parcelId: roe.parcelId,
  address: roe.address,
  ownerName: roe.ownerName,
  signed: roe.signed,
  signedDate: roe.signedDate?.toISOString().slice(0, 10) ?? null,
  fix: fix(roe.latitude, roe.longitude),
  source: roe.source,
  madeById: roe.madeById,
  madeAt: time(roe.madeAt),
  notes: roe.notes,
  ...answersOf(roe),
});

export const roeScopeItemRecord = (pick: RoeScopeItem): RoeScopeItemRecord => ({
  id: pick.id,
  projectId: pick.projectId,
  roeId: pick.roeId,
  formDebrisTypeId: pick.formDebrisTypeId,
  payableTypeId: pick.payableTypeId,
  count: pick.count,
  takenOffAt: time(pick.archivedAt),
});

// What every form records, whoever made it.
const formRecord = (form: Survey | Incident | DropOffLog) => ({
  id: form.id,
  projectId: form.projectId,
  source: form.source,
  createdById: form.createdById,
  createdReasonId: form.createdReasonId,
  monitorId: form.monitorId,
  madeAt: form.madeAt.toISOString(),
  deviceUtcOffsetMinutes: form.deviceUtcOffsetMinutes,
  fix: fix(form.latitude, form.longitude),
  notes: form.notes,
  ...answersOf(form),
});

export const surveyRecord = (survey: Survey): SurveyRecord => ({
  ...formRecord(survey),
  workTypeId: survey.workTypeId,
  surveyNumber: survey.surveyNumber,
  roeNumber: survey.roeNumber,
  roeId: survey.roeId,
});

export const incidentRecord = (incident: Incident): IncidentRecord => ({
  ...formRecord(incident),
  incidentTypeId: incident.incidentTypeId,
  incidentSubTypeId: incident.incidentSubTypeId,
  description: incident.description,
  parties: incident.parties,
  address: incident.address,
  contractorId: incident.contractorId,
  certNumber: incident.certNumber,
  certificationId: incident.certificationId,
  roeNumber: incident.roeNumber,
  roeId: incident.roeId,
});

export const dropOffLogRecord = (log: DropOffLog): DropOffLogRecord => ({
  ...formRecord(log),
  siteId: log.siteId,
  residentName: log.residentName,
  originAddress: log.originAddress,
});

// Never what the phone sent: it stays exactly as sent, and is read where it is shown.
export const quarantinedRecord = (kept: QuarantinedRecord): QuarantinedRecordAnswer => ({
  id: kept.id,
  projectId: kept.projectId,
  reason: kept.reason,
  holdingEventId: kept.holdingEventId,
  holdingRoeId: kept.holdingRoeId,
  receivedAt: kept.receivedAt.toISOString(),
  resolvedById: kept.resolvedById,
  resolvedAt: time(kept.resolvedAt),
  resolution: kept.resolution,
});

const dayOf = (date: Date | null): string | null => date?.toISOString().slice(0, 10) ?? null;

// A certification as it stands after a change: never the driver's phone or licence number.
export const certificationRecord = (kept: Certification): CertificationRecord => ({
  id: kept.id,
  projectId: kept.projectId,
  certNumber: kept.certNumber,
  kind: kept.kind,
  primeId: kept.primeId,
  firstTierSubId: kept.firstTierSubId,
  secondTierSubId: kept.secondTierSubId,
  capacityCy: kept.capacityCy,
  vehicleTypeId: kept.vehicleTypeId,
  vehicleTypeOther: kept.vehicleTypeOther,
  crewTypeId: kept.crewTypeId,
  driverName: kept.driverName,
  driverLicenceState: kept.driverLicenceState,
  driverLicenceExpiry: dayOf(kept.driverLicenceExpiry),
  tagNumber: kept.tagNumber,
  tagState: kept.tagState,
  tagExpiry: dayOf(kept.tagExpiry),
  certifiedAt: kept.certifiedAt.toISOString(),
  deviceUtcOffsetMinutes: kept.deviceUtcOffsetMinutes,
  certifiedById: kept.certifiedById,
  deviceId: kept.deviceId,
  createdById: kept.createdById,
  createdReasonId: kept.createdReasonId,
  clientRepresentativeName: kept.clientRepresentativeName,
  contractorRepresentativeName: kept.contractorRepresentativeName,
  notes: kept.notes,
  signaturesOnFile: kept.signaturesOnFile,
  replacesId: kept.replacesId,
  replacedReason: kept.replacedReason,
  revokedFrom: dayOf(kept.revokedFrom),
  revokedReason: kept.revokedReason,
  revokedById: kept.revokedById,
});
