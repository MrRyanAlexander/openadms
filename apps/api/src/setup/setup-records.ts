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
  FormDebrisTypeRecord,
  FormDefinitionRecord,
  FormRecord,
  ListValueRecord,
  MapVersionRecord,
  NumberSeriesRecord,
  PayItemRateRecord,
  PayItemRecord,
  ProjectRecord,
  RulesKeptRecord,
  SavedRuleRecord,
  SiteAreaVersionRecord,
  SiteRecord,
  SiteTippingFeeRecord,
} from '@open-adms/contracts';
import { formDefinitionFields } from '@open-adms/contracts';
import type {
  Client,
  Contract,
  Contractor,
  ControlRange,
  DebrisType,
  DeclarationEvent,
  DisposalSite,
  DisposalSiteTippingFee,
  FieldTag,
  Form,
  FormDebrisType,
  FormDefinition,
  MapVersion,
  PayableType,
  PayItem,
  PayItemRate,
  Project,
  ProjectContractor,
  ProjectNumberSeries,
  SiteAreaVersion,
} from '@open-adms/db';

import type { RulesKept } from './pay-item-setup.ts';
import type { SavedRule } from './rule-setup.ts';

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

export const formRecord = (form: Form): FormRecord => ({
  id: form.id,
  projectId: form.projectId,
  documentType: form.documentType,
  name: form.name,
  enabled: form.enabled,
  gpsRequired: form.gpsRequired,
  incidentOffers: form.incidentOffers,
  archived: form.archivedAt !== null,
});

export const formDebrisTypeRecord = (entry: FormDebrisType): FormDebrisTypeRecord => ({
  id: entry.id,
  formId: entry.formId,
  debrisTypeId: entry.debrisTypeId,
  reduced: entry.reduced,
  reductionMethodId: entry.reductionMethodId,
  hiddenOnPhones: entry.hiddenOnPhones,
  archived: entry.archivedAt !== null,
});

export const formDefinitionRecord = (definition: FormDefinition): FormDefinitionRecord => ({
  id: definition.id,
  formId: definition.formId,
  version: definition.version,
  // As the contracts read them going in: the database holds them as JSON.
  fields: formDefinitionFields.parse(definition.fields),
});

export const payItemRecord = (payItem: PayItem): PayItemRecord => ({
  id: payItem.id,
  projectId: payItem.projectId,
  code: payItem.code,
  description: payItem.description,
  payableTypeId: payItem.payableTypeId,
  unit: payItem.unit,
  kindOfWorkId: payItem.kindOfWorkId,
  bandFrom: payItem.bandFrom?.toNumber() ?? null,
  bandTo: payItem.bandTo?.toNumber() ?? null,
  countIsAlwaysOne: payItem.countIsAlwaysOne,
  gpsRequired: payItem.gpsRequired,
  measurementRequired: payItem.measurementRequired,
  decimalsAllowed: payItem.decimalsAllowed,
  photosRequired: payItem.photosRequired,
  monitorMayMarkIneligible: payItem.monitorMayMarkIneligible,
  quantityFromCarriedTickets: payItem.quantityFromCarriedTickets,
  crewTimeConversion: payItem.crewTimeConversion,
  crewDayHours: payItem.crewDayHours?.toNumber() ?? null,
  archived: payItem.archivedAt !== null,
});

// An exact decimal with its cents, and its third and fourth places only where it has them:
// `7.50`, `0.0125`.
export const payItemRateRecord = (rate: PayItemRate): PayItemRateRecord => ({
  id: rate.id,
  payItemId: rate.payItemId,
  primeId: rate.primeId,
  rate: rate.rate.toFixed(4).replace(/0{1,2}$/, ''),
  archived: rate.archivedAt !== null,
});

export const rulesKeptRecord = (kept: RulesKept): RulesKeptRecord => ({
  added: [...kept.added],
  changed: [...kept.changed],
  archived: [...kept.archived],
  unchanged: [...kept.unchanged],
});

export const savedRuleRecord = (rule: SavedRule): SavedRuleRecord => ({
  id: rule.id,
  valid: rule.valid,
  reasons: [...rule.reasons],
});

// Its GPS as the exact decimals the database holds: `39.09000000`.
export const siteRecord = (site: DisposalSite): SiteRecord => ({
  id: site.id,
  projectId: site.projectId,
  name: site.name,
  shortCode: site.shortCode,
  siteTypeId: site.siteTypeId,
  takesLoads: site.takesLoads,
  haulOutsLeaveHere: site.haulOutsLeaveHere,
  chargesTippingFee: site.chargesTippingFee,
  ineligibleSite: site.ineligibleSite,
  permitNumber: site.permitNumber,
  latitude: site.latitude.toFixed(8),
  longitude: site.longitude.toFixed(8),
  activationDate: day(site.activationDate),
  closeDate: site.closeDate === null ? null : day(site.closeDate),
  archived: site.archivedAt !== null,
});

export const siteAreaVersionRecord = (version: SiteAreaVersion): SiteAreaVersionRecord => ({
  id: version.id,
  siteId: version.siteId,
  version: version.version,
  source: version.source,
  effectiveFrom: version.effectiveFrom.toISOString(),
});

export const siteTippingFeeRecord = (link: DisposalSiteTippingFee): SiteTippingFeeRecord => ({
  id: link.id,
  projectId: link.projectId,
  siteId: link.siteId,
  payItemId: link.payItemId,
  archived: link.archivedAt !== null,
});

export const mapVersionRecord = (version: MapVersion): MapVersionRecord => ({
  id: version.id,
  projectId: version.projectId,
  version: version.version,
  source: version.source,
  sourceName: version.sourceName,
  zoneNameField: version.zoneNameField,
  fileKept: version.uploadedFileKey !== null,
  loadedAt: version.loadedAt.toISOString(),
});
