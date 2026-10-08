// Setup's records as an answer says them (packages/contracts' setup-answers.ts): the fields the
// firm entered, a calendar day as `2026-10-12`, an archive as a yes or no.
import type {
  ClientRecord,
  ContractorPlaceRecord,
  ContractorRecord,
  ContractRecord,
  ControlRangeRecord,
  DeclarationEventRecord,
  FieldTagRecord,
  ListValueRecord,
  NumberSeriesRecord,
  ProjectRecord,
} from '@open-adms/contracts';
import type {
  Client,
  Contract,
  Contractor,
  ControlRange,
  DebrisType,
  DeclarationEvent,
  FieldTag,
  PayableType,
  Project,
  ProjectContractor,
  ProjectNumberSeries,
} from '@open-adms/db';

// A calendar day, as the database's date holds it.
const day = (date: Date): string => date.toISOString().slice(0, 10);

export const clientRecord = (client: Client): ClientRecord => ({
  id: client.id,
  name: client.name,
  contactName: client.contactName,
  contactEmail: client.contactEmail,
  contactPhone: client.contactPhone,
  notes: client.notes,
  archived: client.archivedAt !== null,
});

export const declarationEventRecord = (event: DeclarationEvent): DeclarationEventRecord => ({
  id: event.id,
  name: event.name,
  reference: event.reference,
  referenceTypeId: event.referenceTypeId,
  archived: event.archivedAt !== null,
});

export const projectRecord = (project: Project): ProjectRecord => ({
  id: project.id,
  name: project.name,
  clientId: project.clientId,
  declarationEventId: project.declarationEventId,
  programTypeId: project.programTypeId,
  timeZone: project.timeZone,
  activeFrom: day(project.activeFrom),
  activeTo: project.activeTo === null ? null : day(project.activeTo),
  ticketNumberSource: project.ticketNumberSource,
  workflows: project.workflows,
  allowSplitLoads: project.allowSplitLoads,
  loadCallLowLimit: project.loadCallLowLimit,
  loadCallHighLimit: project.loadCallHighLimit,
  stumpFillDepthInches: project.stumpFillDepthInches,
  stumpCheckRootBallWider: project.stumpCheckRootBallWider,
  stumpCheckFillNeedsExposure: project.stumpCheckFillNeedsExposure,
  siteCircleMeters: project.siteCircleMeters,
  timeClockEnabled: project.timeClockEnabled,
  closedAt: project.closedAt?.toISOString() ?? null,
});

export const numberSeriesRecord = (series: ProjectNumberSeries): NumberSeriesRecord => ({
  id: series.id,
  projectId: series.projectId,
  series: series.series,
  firstNumber: series.firstNumber,
  nextNumber: series.nextNumber,
});

export const controlRangeRecord = (range: ControlRange): ControlRangeRecord => ({
  id: range.id,
  projectId: range.projectId,
  series: range.series,
  firstNumber: range.firstNumber,
  lastNumber: range.lastNumber,
  archived: range.archivedAt !== null,
});

export const fieldTagRecord = (tag: FieldTag): FieldTagRecord => ({
  id: tag.id,
  projectId: tag.projectId,
  name: tag.name,
  position: tag.position,
  archived: tag.archivedAt !== null,
});

export const contractorRecord = (contractor: Contractor): ContractorRecord => ({
  id: contractor.id,
  name: contractor.name,
  kind: contractor.kind,
  contactName: contractor.contactName,
  contactEmail: contractor.contactEmail,
  contactPhone: contractor.contactPhone,
  mergedIntoId: contractor.mergedIntoId,
  archived: contractor.archivedAt !== null,
});

export const contractorPlaceRecord = (place: ProjectContractor): ContractorPlaceRecord => ({
  id: place.id,
  projectId: place.projectId,
  contractorId: place.contractorId,
  position: place.position,
  primeId: place.primeId,
  archived: place.archivedAt !== null,
});

export const contractRecord = (contract: Contract): ContractRecord => ({
  id: contract.id,
  projectId: contract.projectId,
  name: contract.name,
  primeId: contract.primeId,
  signedCopyUrl: contract.signedCopyUrl,
  archived: contract.archivedAt !== null,
});

export const listValueRecord = (value: DebrisType | PayableType): ListValueRecord => ({
  id: value.id,
  key: value.key,
  name: value.name,
  position: value.position,
  archived: value.archivedAt !== null,
});
