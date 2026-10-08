// What a setup endpoint answers (spec/parts/01-setup.md; ARCHITECTURE §6, Output; AC-01-80;
// ADR-316, 422, 424): the record as it was saved, the warnings setup saved it with, and, where the
// change moves tickets, what it queued for the worker. A record is said as the firm entered it:
// its id, its fields, whether it is archived; a calendar day as `2026-10-12`. Nothing here is a
// secret or a field of another record. **A rate is said in one answer only: the one to whoever
// just set it** (a setup endpoint, so an admin or a manager/analyst who holds Setup; ADR-425).
import { crewTimeConversions, incidentOffers, numberSeries, workflows } from '@open-adms/domain';
import { z } from 'zod';

import { formDefinitionFields } from './form-definition.ts';

const id = z.uuid();
const day = z.iso.date();

// Closed sets of the database's (spec/DATA-MODEL.md §2.2), said here once for the payloads.
export const ticketNumberSources = ['CONTROL', 'GENERATED'] as const;
export const contractorKinds = ['HAULER', 'MONITORING', 'CREW', 'OTHER'] as const;
export const contractorPositions = ['PRIME', 'SUB_TIER_1', 'SUB_TIER_2'] as const;
export const formDocumentTypes = [
  'LOAD',
  'HAUL_OUT',
  'UNIT_RATE',
  'CERTIFICATION',
  'ROE',
  'SURVEY',
  'INCIDENT',
  'DROP_OFF_LOG',
] as const;
export const billingUnits = ['CY', 'TN', 'EA', 'LB', 'HR', 'CREW_DAY', 'TBN'] as const;
export const quantityFroms = ['ALL_ITEMS', 'CHOSEN_ITEMS'] as const;

// Saved all the same, and said to whoever saved it: the domain's code and its plain words.
export const setupWarningSchema = z.strictObject({
  code: z.string().min(1),
  message: z.string().min(1),
});

// What a saved change asked the worker for (ADR-422): the jobs, how many tickets they name, and
// how many tickets locked as invoiced it reached and left exactly as they are.
export const queuedBySetupSchema = z.strictObject({
  jobs: z.array(id),
  tickets: z.number().int().min(0),
  lockedAsInvoiced: z.number().int().min(0),
});

// A saved change's answer. `queued` is stated only where the change queued work or passed a
// locked ticket by.
export function savedAnswer<R extends z.ZodType>(record: R) {
  return z.strictObject({
    record,
    warnings: z.array(setupWarningSchema),
    queued: queuedBySetupSchema.optional(),
  });
}

// A search's answer: what the firm already has, to pick from before anything is entered again.
export function foundAnswer<R extends z.ZodType>(record: R) {
  return z.strictObject({ records: z.array(record) });
}

export const clientRecordSchema = z.strictObject({
  id,
  name: z.string(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  notes: z.string().nullable(),
  archived: z.boolean(),
});

export type ClientRecord = z.infer<typeof clientRecordSchema>;

export const declarationEventRecordSchema = z.strictObject({
  id,
  name: z.string(),
  // As written: DR-9001-FL.
  reference: z.string(),
  referenceTypeId: id,
  archived: z.boolean(),
});

export type DeclarationEventRecord = z.infer<typeof declarationEventRecordSchema>;

// A project's own settings, named as its record names them (packages/domain's ProjectSettings).
const projectSettings = {
  allowSplitLoads: z.boolean(),
  // Empty is switched off.
  loadCallLowLimit: z.number().int().nullable(),
  loadCallHighLimit: z.number().int().nullable(),
  stumpFillDepthInches: z.number().int(),
  stumpCheckRootBallWider: z.boolean(),
  stumpCheckFillNeedsExposure: z.boolean(),
  siteCircleMeters: z.number().int(),
  timeClockEnabled: z.boolean(),
};

export const projectRecordSchema = z.strictObject({
  id,
  name: z.string(),
  clientId: id,
  declarationEventId: id,
  programTypeId: id,
  timeZone: z.string(),
  activeFrom: day,
  activeTo: day.nullable(),
  ticketNumberSource: z.enum(ticketNumberSources),
  workflows: z.array(z.enum(workflows)),
  ...projectSettings,
  // When it was closed; empty while it is open.
  closedAt: z.iso.datetime().nullable(),
});

export type ProjectRecord = z.infer<typeof projectRecordSchema>;

export const numberSeriesRecordSchema = z.strictObject({
  id,
  projectId: id,
  series: z.enum(numberSeries),
  firstNumber: z.number().int(),
  nextNumber: z.number().int(),
});

export type NumberSeriesRecord = z.infer<typeof numberSeriesRecordSchema>;

export const controlRangeRecordSchema = z.strictObject({
  id,
  projectId: id,
  series: z.enum(numberSeries),
  firstNumber: z.number().int(),
  lastNumber: z.number().int(),
  archived: z.boolean(),
});

export type ControlRangeRecord = z.infer<typeof controlRangeRecordSchema>;

export const fieldTagRecordSchema = z.strictObject({
  id,
  projectId: id,
  name: z.string(),
  position: z.number().int(),
  archived: z.boolean(),
});

export type FieldTagRecord = z.infer<typeof fieldTagRecordSchema>;

export const contractorRecordSchema = z.strictObject({
  id,
  name: z.string(),
  kind: z.enum(contractorKinds),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  // The record it was merged into, on one archived as a second spelling.
  mergedIntoId: id.nullable(),
  archived: z.boolean(),
});

export type ContractorRecord = z.infer<typeof contractorRecordSchema>;

// A contractor's place on a project: a prime, or a sub in its tier under one prime.
export const contractorPlaceRecordSchema = z.strictObject({
  id,
  projectId: id,
  contractorId: id,
  position: z.enum(contractorPositions),
  primeId: id.nullable(),
  archived: z.boolean(),
});

export type ContractorPlaceRecord = z.infer<typeof contractorPlaceRecordSchema>;

export const contractRecordSchema = z.strictObject({
  id,
  projectId: id,
  name: z.string(),
  primeId: id,
  signedCopyUrl: z.string().nullable(),
  archived: z.boolean(),
});

export type ContractRecord = z.infer<typeof contractRecordSchema>;

// A value of one of the firm's lists (spec/LISTS.md): one the firm added has a name and no key.
export const listValueRecordSchema = z.strictObject({
  id,
  key: z.string().nullable(),
  name: z.string(),
  position: z.number().int(),
  archived: z.boolean(),
});

export type ListValueRecord = z.infer<typeof listValueRecordSchema>;

// A project's form for one document type (ADR-211). "GPS required" is the ROE form's alone, and
// what an incident offers the incident form's: empty on every other.
export const formRecordSchema = z.strictObject({
  id,
  projectId: id,
  documentType: z.enum(formDocumentTypes),
  name: z.string(),
  enabled: z.boolean(),
  gpsRequired: z.boolean().nullable(),
  incidentOffers: z.array(z.enum(incidentOffers)),
  archived: z.boolean(),
});

export type FormRecord = z.infer<typeof formRecordSchema>;

// A debris type's entry on a load or haul-out form (ADR-211, 214).
export const formDebrisTypeRecordSchema = z.strictObject({
  id,
  formId: id,
  debrisTypeId: id,
  reduced: z.boolean(),
  reductionMethodId: id.nullable(),
  hiddenOnPhones: z.boolean(),
  archived: z.boolean(),
});

export type FormDebrisTypeRecord = z.infer<typeof formDebrisTypeRecordSchema>;

// One version of the firm's own fields on a form; a version is never edited (ADR-308).
export const formDefinitionRecordSchema = z.strictObject({
  id,
  formId: id,
  version: z.number().int(),
  fields: formDefinitionFields,
});

export type FormDefinitionRecord = z.infer<typeof formDefinitionRecordSchema>;

// A pay item as the firm entered it (ADR-206, 221, 301, 309). Its rates are their own records.
export const payItemRecordSchema = z.strictObject({
  id,
  projectId: id,
  code: z.string(),
  description: z.string(),
  payableTypeId: id,
  unit: z.enum(billingUnits),
  kindOfWorkId: id.nullable(),
  // Inches to a tenth; an open end is empty.
  bandFrom: z.number().nullable(),
  bandTo: z.number().nullable(),
  countIsAlwaysOne: z.boolean(),
  gpsRequired: z.boolean(),
  measurementRequired: z.boolean(),
  decimalsAllowed: z.boolean(),
  photosRequired: z.boolean(),
  monitorMayMarkIneligible: z.boolean(),
  quantityFromCarriedTickets: z.boolean(),
  crewTimeConversion: z.enum(crewTimeConversions).nullable(),
  crewDayHours: z.number().nullable(),
  archived: z.boolean(),
});

export type PayItemRecord = z.infer<typeof payItemRecordSchema>;

// A prime's rate on a pay item: an exact decimal, as `7.50`.
export const payItemRateRecordSchema = z.strictObject({
  id,
  payItemId: id,
  primeId: id,
  rate: z.string(),
  archived: z.boolean(),
});

export type PayItemRateRecord = z.infer<typeof payItemRateRecordSchema>;

// What saving a pay item's "Pays when" did to the rules it keeps, each by its id (ADR-229).
export const rulesKeptRecordSchema = z.strictObject({
  added: z.array(id),
  changed: z.array(id),
  archived: z.array(id),
  unchanged: z.array(id),
});

export type RulesKeptRecord = z.infer<typeof rulesKeptRecordSchema>;

// A rule as the rule builder saved it: "Is valid" is worked out, never stored, and a rule that
// isn't valid is saved all the same and never runs; the reasons say why (spec/RULES.md §7).
export const savedRuleRecordSchema = z.strictObject({
  id,
  valid: z.boolean(),
  reasons: z.array(z.string()),
});

export type SavedRuleRecord = z.infer<typeof savedRuleRecordSchema>;
