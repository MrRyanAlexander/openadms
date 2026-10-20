// What the back office reads, and what a read-only viewer reads of the same records (REQ-217;
// spec/parts/08-review-and-corrections.md, "One review queue"; spec/parts/09; ARCHITECTURE §5.5,
// §6, Output; BACKLOG 2.8.8; ADR-224, 228, 315, 361, 435, 535). **Whoever is let see review sees
// everything about a ticket** (ADR-224, 539): its field events as recorded and corrected, what the worker
// concluded, its lines with their money, its flags and every mark people set on it. Every list is
// a page: `next` is what to send as `after` for the page that follows, null when this is the last.
// Never where a file is kept, a credential, a fact a flag was raised on (the worker's own inputs)
// or a rate to somebody who isn't given one (a pay item's rates are a read of their own that takes
// Setup; a viewer reads none).
import {
  boardWarningCodes,
  fieldEventKinds,
  flagBillings,
  flagCodes,
  masterPasscodeSessions,
  mileageSources,
  quantitySources,
  workflows,
} from '@open-adms/domain';
import { z } from 'zod';

import { assignmentRecordSchema, ticketStatuses } from './api-answers.ts';
import {
  carriedTicketRecordSchema,
  certificationRecordSchema,
  dropOffLogRecordSchema,
  fieldEventRecordSchema,
  flagAcceptanceRecordSchema,
  incidentRecordSchema,
  invoiceBatchRecordSchema,
  invoiceLockRecordSchema,
  itemLineRecordSchema,
  photographRecordSchema,
  qcMarkRecordSchema,
  roeRecordSchema,
  roeScopeItemRecordSchema,
  scaleReceiptRecordSchema,
  surveyRecordSchema,
  ticketUnvoidRecordSchema,
  ticketVoidRecordSchema,
  waypointRecordSchema,
} from './review-answers.ts';
import {
  billingUnits,
  contractRecordSchema,
  contractorPlaceRecordSchema,
  formDebrisTypeRecordSchema,
  formDefinitionRecordSchema,
  formDocumentTypes,
  formRecordSchema,
  listValueRecordSchema,
  mapVersionRecordSchema,
  payItemRateRecordSchema,
  payItemRecordSchema,
  projectRecordSchema,
  quantityFroms,
  setupWarningSchema,
  siteAreaVersionRecordSchema,
  siteLabelRecordSchema,
  siteRecordSchema,
  siteTippingFeeRecordSchema,
} from './setup-answers.ts';

const id = z.uuid();
const at = z.iso.datetime();
const day = z.iso.date();
// A number the database keeps exactly, as exact decimal text, never a float.
const exact = z.string().regex(/^-?[0-9]+(\.[0-9]+)?$/);
// A shape as it was kept: GeoJSON, in longitude and latitude, WGS84 (ARCHITECTURE §3).
const shape = z.json();
const named = z.strictObject({ id, name: z.string() });
// What a certification certifies: a container or a crew, never a vehicle (invariant 8).
const certificationKinds = ['CONTAINER', 'CREW'] as const;

// ---------------------------------------------------------------------------------------------
// The back office's reads.

// A page of the firm's projects, in name order.
export const projectsAnswerSchema = z.strictObject({
  projects: z.array(projectRecordSchema),
  next: id.nullable(),
});

export type ProjectsAnswer = z.infer<typeof projectsAnswerSchema>;

// One project's page: its record (its settings and whether it is closed), its kinds of work, and
// who is on it: each contractor's place with its name, and its contracts.
export const projectAnswerSchema = z.strictObject({
  project: projectRecordSchema,
  kindOfWorkIds: z.array(id),
  contractors: z.array(contractorPlaceRecordSchema.extend({ name: z.string() })),
  contracts: z.array(contractRecordSchema),
});

export type ProjectAnswer = z.infer<typeof projectAnswerSchema>;

// A flag as the worker raised it, with every acceptance it had (one withdrawn is kept, ADR-534
// (8)). Its facts and their hash are the worker's own inputs and are not said.
export const flagRecordSchema = z.strictObject({
  id,
  projectId: id,
  // The ticket it is on, or none on a flag about another record.
  workflow: z.enum(workflows).nullable(),
  ticketNumber: z.string().nullable(),
  fieldEventId: id.nullable(),
  certificationId: id.nullable(),
  disposalSiteId: id.nullable(),
  surveyId: id.nullable(),
  code: z.enum(flagCodes),
  message: z.string(),
  billing: z.enum(flagBillings),
  slot: z.int().nullable(),
  payItemId: id.nullable(),
  raisedAt: at,
  clearedAt: at.nullable(),
  acceptances: z.array(flagAcceptanceRecordSchema),
});

export type FlagRecord = z.infer<typeof flagRecordSchema>;

export const flagsAnswerSchema = z.strictObject({
  flags: z.array(flagRecordSchema),
  next: id.nullable(),
});

export type FlagsAnswer = z.infer<typeof flagsAnswerSchema>;

// One open flag in the queue: not cleared, and no acceptance in force.
const openFlag = z.strictObject({
  id,
  code: z.enum(flagCodes),
  message: z.string(),
  billing: z.enum(flagBillings),
  raisedAt: at,
});

// The review queue (ADR-228): one workflow's tickets waiting for a person, a page at a time by
// number, each with its open flags; a pending ticket is listed as pending, never flagged for
// waiting. And the project's open flags counted by cause, a ticket's or another record's.
export const reviewQueueAnswerSchema = z.strictObject({
  causes: z.array(
    z.strictObject({
      code: z.enum(flagCodes),
      flags: z.int().min(1),
      tickets: z.int().min(0),
    }),
  ),
  tickets: z.array(
    z.strictObject({
      workflow: z.enum(workflows),
      ticketNumber: z.string(),
      statuses: z.array(z.enum(ticketStatuses)),
      flags: z.array(openFlag),
      // Named by a job set aside that no job has worked it since: its lines and status may be
      // stale until a person puts the job back (ADR-545).
      waitingOnSetAsideJob: z.boolean(),
    }),
  ),
  // The workflow's tickets waiting on a job set aside, whether or not they are on the queue for
  // a flag: what `listSetAsideJobs` lists (ADR-545).
  waitingOnSetAsideJobs: z.int().min(0),
  next: z.string().nullable(),
});

export type ReviewQueueAnswer = z.infer<typeof reviewQueueAnswerSchema>;

// A field event as the back office reads it: as recorded and corrected, with what the server and
// the worker keep beside it: its status, when it was received and reconciled, the zone and map
// version the worker judged it with, the pay item it worked out, its phone, its assignment and
// the setup version its phone had.
export const fieldEventReadSchema = fieldEventRecordSchema.extend({
  status: z.enum(ticketStatuses),
  receivedAt: at,
  reconciledAt: at.nullable(),
  zoneId: id.nullable(),
  mapVersionId: id.nullable(),
  workedOutPayItemId: id.nullable(),
  deviceId: id.nullable(),
  assignmentId: id.nullable(),
  setupVersion: z.int().nullable(),
});

export type FieldEventRead = z.infer<typeof fieldEventReadSchema>;

// One field event with what is recorded beside it: its item lines, the tickets it carries and
// its waypoints in order (those taken off kept, marked), its photographs' records and the scale
// receipt it names.
export const fieldEventAnswerSchema = z.strictObject({
  fieldEvent: fieldEventReadSchema,
  itemLines: z.array(itemLineRecordSchema),
  carriedTickets: z.array(carriedTicketRecordSchema),
  waypoints: z.array(waypointRecordSchema),
  photographs: z.array(photographRecordSchema),
  scaleReceipt: scaleReceiptRecordSchema.nullable(),
});

export type FieldEventAnswer = z.infer<typeof fieldEventAnswerSchema>;

// A completed load or haul-out as the worker concluded it, with a row for each collection (one
// on an ordinary ticket, one for each property or pile on a split): its share, its mileage and
// where that came from. `pileLoadCall` is a haul-out's.
const completedRead = z.strictObject({
  id,
  disposalEventId: id,
  quantitySource: z.enum(quantitySources),
  capacityCy: z.int().nullable(),
  loadCall: z.int().nullable(),
  volumeCy: exact.nullable(),
  weightTons: exact.nullable(),
  weightIsShare: z.boolean(),
  carriedCount: z.int().nullable(),
  collections: z.array(
    z.strictObject({
      id,
      collectionEventId: id,
      splitSuffix: z.string(),
      shareFraction: exact,
      pileLoadCall: z.int().nullable(),
      volumeCy: exact.nullable(),
      weightTons: exact.nullable(),
      mileage: exact.nullable(),
      mileageSource: z.enum(mileageSources).nullable(),
      snappedAddress: z.string().nullable(),
    }),
  ),
});

// A priced line, the current truth: the rule that made it, its pay item, its contract, whose rate
// and who did the work, the quantity, the rate and the amount.
const lineRead = z.strictObject({
  id,
  // The property or pile it prices on a split; empty otherwise.
  splitSuffix: z.string(),
  slot: z.int(),
  ruleId: id,
  payItemId: id,
  contractId: id,
  primeId: id,
  operatingSubId: id.nullable(),
  unit: z.enum(billingUnits),
  quantity: exact,
  rate: exact,
  amount: exact,
});

// One ticket, whole, as the back office reads it (ADR-224): its field events in field time, the
// completed record that stands, its lines, its flags, its QC mark, every lock it had, its voids and
// unvoids.
export const ticketAnswerSchema = z.strictObject({
  projectId: id,
  workflow: z.enum(workflows),
  ticketNumber: z.string(),
  statuses: z.array(z.enum(ticketStatuses)),
  fieldEvents: z.array(fieldEventReadSchema).min(1),
  completed: completedRead.nullable(),
  lines: z.array(lineRead),
  flags: z.array(flagRecordSchema),
  qcMark: qcMarkRecordSchema.nullable(),
  locks: z.array(invoiceLockRecordSchema),
  voids: z.array(ticketVoidRecordSchema),
  unvoids: z.array(ticketUnvoidRecordSchema),
});

export type TicketAnswer = z.infer<typeof ticketAnswerSchema>;

// What started a reconciliation run: the database's own list (`ReconciliationTrigger`).
export const reconciliationTriggers = ['SYNC', 'CORRECTION', 'SETUP_CHANGE', 'REPROCESS'] as const;

// What one run decided for a ticket and why, as the worker wrote it for a person (spec/
// DATA-MODEL.md, `ReconciliationDecision`; ADR-536): the run, the status it left, its own words,
// the field events it grouped and the kinds still to arrive, the lines it priced (each with the
// rule that made it), the flags it raised, and what voided it. Whether the ticket could be
// processed, never the error's own text: that is the server's log.
const decisionRead = z.strictObject({
  id,
  run: z.strictObject({ id, trigger: z.enum(reconciliationTriggers), startedAt: at }),
  status: z.enum(ticketStatuses),
  why: z.string(),
  processed: z.boolean(),
  fieldEvents: z.array(
    z.strictObject({
      id,
      kind: z.enum(fieldEventKinds),
      splitSuffix: z.string().nullable(),
      startedAt: at,
      endedAt: at,
    }),
  ),
  waitingFor: z.array(z.enum(fieldEventKinds)),
  lines: z.array(
    z.strictObject({
      // The property or pile it prices on a split; empty otherwise.
      splitSuffix: z.string(),
      slot: z.int(),
      ruleId: id,
      payItemId: id,
      quantity: exact,
      rate: exact,
      amount: exact,
    }),
  ),
  flags: z.array(z.enum(flagCodes)),
  // The rules whose Void ticket ran (ADR-118), and the person's void with its reason.
  voidedByRules: z.array(named),
  voidedByPerson: z.strictObject({ name: z.string(), reason: z.string() }).nullable(),
});

// A ticket's decisions, newest first: one for every run that worked it.
export const ticketDecisionsAnswerSchema = z.strictObject({
  decisions: z.array(decisionRead),
  next: id.nullable(),
});

export type TicketDecisionsAnswer = z.infer<typeof ticketDecisionsAnswerSchema>;

// A project's jobs set aside (ADR-498, 545; the Phase 2 audit's F6): each failed whole too often to
// be taken up again, and waits for a person to put it back (`reprocessTickets` with its id). When
// it was queued and set aside, what queued it and who asked, how many tries it had, and its
// tickets, each said to be waiting where no job has worked it since. Never why it failed: the
// error's words are the server's log's.
export const setAsideJobsAnswerSchema = z.strictObject({
  jobs: z.array(
    z.strictObject({
      id,
      trigger: z.enum(reconciliationTriggers),
      requestedById: id.nullable(),
      queuedAt: at,
      setAsideAt: at,
      tries: z.int().min(0),
      tickets: z.array(
        z.strictObject({
          workflow: z.enum(workflows),
          ticketNumber: z.string(),
          waiting: z.boolean(),
        }),
      ),
    }),
  ),
  next: id.nullable(),
});

export type SetAsideJobsAnswer = z.infer<typeof setAsideJobsAnswerSchema>;

// What the audit log holds of a record (ARCHITECTURE §5.3; invariant 3; ADR-097, 544; the Phase 2
// audit's F5): one change a row, newest first, as the database wrote it. A value the capture
// leaves out (a hash, a secret) reads "[kept out of the audit]"; for anybody but an admin a
// person's phone number reads so too. The actor by id and name (the system actor, the master
// passcode's, the device key's included); the source; the phone; the reason given; never the
// request's id. Its number is the log's own, as text.
export const auditOperations = ['INSERT', 'UPDATE', 'DELETE'] as const;
export const auditSources = ['DEVICE', 'BACK_OFFICE', 'SYSTEM'] as const;
const auditEntry = z.strictObject({
  id: z.string().regex(/^[0-9]+$/),
  occurredAt: at,
  tableName: z.string(),
  recordId: z.string(),
  operation: z.enum(auditOperations),
  changedFields: z.array(z.string()),
  priorValue: z.json().nullable(),
  newValue: z.json().nullable(),
  actor: named.nullable(),
  source: z.enum(auditSources),
  deviceId: id.nullable(),
  // The back office's alone: a viewer is never shown why (a note may name anything).
  reason: z.string().nullable(),
});

export const auditTrailAnswerSchema = z.strictObject({
  entries: z.array(auditEntry),
  // The last entry of the page before: the answer's `next`.
  next: z
    .string()
    .regex(/^[0-9]+$/)
    .nullable(),
});

export type AuditTrailAnswer = z.infer<typeof auditTrailAnswerSchema>;

// A scale receipt with its photographs and the field events that name it.
export const scaleReceiptAnswerSchema = z.strictObject({
  scaleReceipt: scaleReceiptRecordSchema,
  photographs: z.array(photographRecordSchema),
  fieldEventIds: z.array(id),
});

export type ScaleReceiptAnswer = z.infer<typeof scaleReceiptAnswerSchema>;

// A box of a container's measurement, in whole inches, as measured and corrected; one taken off
// stays, marked with the time (ADR-534 (6)).
export const certificationBoxRecordSchema = z.strictObject({
  id,
  position: z.int(),
  shape: z.string(),
  sign: z.string(),
  featureId: id.nullable(),
  featureOther: z.string().nullable(),
  length: z.int().nullable(),
  secondLength: z.int().nullable(),
  width: z.int().nullable(),
  height: z.int().nullable(),
  diameter: z.int().nullable(),
  radius: z.int().nullable(),
  run: z.int().nullable(),
  corners: z.int().nullable(),
  takenOffAt: at.nullable(),
});

// A certification whole: its boxes, its helpers (the people who certified beside its monitor),
// its photographs' records, its QC mark and its own flags (`SUB_NAME_ALIKE` among them, which is
// what it was saved with when a typed sub matched another contractor: ADR-472 (12), 529 (f)).
export const certificationReadSchema = z.strictObject({
  certification: certificationRecordSchema,
  boxes: z.array(certificationBoxRecordSchema),
  helperIds: z.array(id),
  photographs: z.array(photographRecordSchema),
  qcMark: qcMarkRecordSchema.nullable(),
  flags: z.array(flagRecordSchema),
});

export type CertificationRead = z.infer<typeof certificationReadSchema>;

// A page of a project's certifications, by cert number as written.
export const certificationsAnswerSchema = z.strictObject({
  certifications: z.array(certificationReadSchema),
  next: id.nullable(),
});

export type CertificationsAnswer = z.infer<typeof certificationsAnswerSchema>;

// What every form read carries beside its record: its photographs' records and its QC mark.
const marked = {
  photographs: z.array(photographRecordSchema),
  qcMark: qcMarkRecordSchema.nullable(),
};

export const roesAnswerSchema = z.strictObject({
  roes: z.array(
    z.strictObject({ roe: roeRecordSchema, scope: z.array(roeScopeItemRecordSchema), ...marked }),
  ),
  next: id.nullable(),
});

export type RoesAnswer = z.infer<typeof roesAnswerSchema>;

export const surveysAnswerSchema = z.strictObject({
  // A survey's own flags too: the run raises some on a survey and on no ticket.
  surveys: z.array(
    z.strictObject({ survey: surveyRecordSchema, flags: z.array(flagRecordSchema), ...marked }),
  ),
  next: id.nullable(),
});

export type SurveysAnswer = z.infer<typeof surveysAnswerSchema>;

export const incidentsAnswerSchema = z.strictObject({
  incidents: z.array(z.strictObject({ incident: incidentRecordSchema, ...marked })),
  next: id.nullable(),
});

export type IncidentsAnswer = z.infer<typeof incidentsAnswerSchema>;

export const dropOffLogsAnswerSchema = z.strictObject({
  dropOffLogs: z.array(z.strictObject({ dropOffLog: dropOffLogRecordSchema, ...marked })),
  next: id.nullable(),
});

export type DropOffLogsAnswer = z.infer<typeof dropOffLogsAnswerSchema>;

// A page of a project's invoice batches, in name order, each with how many locks in force it
// holds.
export const invoiceBatchesAnswerSchema = z.strictObject({
  batches: z.array(
    z.strictObject({ batch: invoiceBatchRecordSchema, locksInForce: z.int().min(0) }),
  ),
  next: id.nullable(),
});

export type InvoiceBatchesAnswer = z.infer<typeof invoiceBatchesAnswerSchema>;

// One batch with what it holds: each lock in force that names it, and the ticket it locks.
export const invoiceBatchAnswerSchema = z.strictObject({
  batch: invoiceBatchRecordSchema,
  locks: z.array(
    z.strictObject({
      lock: invoiceLockRecordSchema,
      ticket: z.strictObject({ workflow: z.enum(workflows), ticketNumber: z.string() }),
    }),
  ),
});

export type InvoiceBatchAnswer = z.infer<typeof invoiceBatchAnswerSchema>;

// The board searched (ADR-535 (1)): each assignment with what the board warns of beside it, in
// plain words; a warning never stops anything (AC-02-29).
export const boardSearchAnswerSchema = z.strictObject({
  assignments: z.array(
    z.strictObject({
      assignment: assignmentRecordSchema,
      warnings: z.array(z.strictObject({ code: z.enum(boardWarningCodes), message: z.string() })),
    }),
  ),
  next: id.nullable(),
});

export type BoardSearchAnswer = z.infer<typeof boardSearchAnswerSchema>;

// A phone's sessions, newest first (C170): whose, when made and until when, whether ended, which
// way one opened under the master passcode was, and whether it came from a sign-in made on the
// phone offline (when, by the phone's clock, with its offset). Never a token or its hash.
export const phoneSessionsAnswerSchema = z.strictObject({
  sessions: z.array(
    z.strictObject({
      id,
      userId: id,
      createdAt: at,
      expiresAt: at,
      revokedAt: at.nullable(),
      masterPasscodeSession: z.enum(masterPasscodeSessions).nullable(),
      offlineSignIn: z.boolean(),
      signedInAt: at.nullable(),
      signedInUtcOffsetMinutes: z.int().nullable(),
    }),
  ),
  next: id.nullable(),
});

export type PhoneSessionsAnswer = z.infer<typeof phoneSessionsAnswerSchema>;

// ---------------------------------------------------------------------------------------------
// Setup's reads.

// A project's forms (one for each document type at most), each with its debris types' entries and
// the newest version of its own fields.
export const formsAnswerSchema = z.strictObject({
  forms: z.array(
    z.strictObject({
      form: formRecordSchema,
      debrisTypes: z.array(formDebrisTypeRecordSchema),
      definition: formDefinitionRecordSchema.nullable(),
    }),
  ),
});

export type FormsAnswer = z.infer<typeof formsAnswerSchema>;

// A crew day's step in force: hours from and to, both included, and the quantity, exact.
const crewDayStep = z.strictObject({ id, fromHours: exact, toHours: exact, quantity: exact });

// A page of a project's pay items, by code: never a rate.
export const payItemsAnswerSchema = z.strictObject({
  payItems: z.array(
    z.strictObject({ payItem: payItemRecordSchema, crewDaySteps: z.array(crewDayStep) }),
  ),
  next: id.nullable(),
});

export type PayItemsAnswer = z.infer<typeof payItemsAnswerSchema>;

// A page of a project's rates, by pay item and prime: the read that takes Setup.
export const payItemRatesAnswerSchema = z.strictObject({
  rates: z.array(payItemRateRecordSchema),
  next: id.nullable(),
});

export type PayItemRatesAnswer = z.infer<typeof payItemRatesAnswerSchema>;

// A rule whole, as the rule builder states it, and "Is valid" as the domain works it out now: a
// picked value by its record's id (a zone by its name), what people call it, and whether it is
// gone (spec/RULES.md §3, §7).
export const ruleReadSchema = z.strictObject({
  id,
  name: z.string(),
  formId: id,
  form: z.enum(['LOAD', 'HAUL_OUT', 'UNIT_RATE']),
  contractId: id.nullable(),
  active: z.boolean(),
  archived: z.boolean(),
  // The pay item whose "Pays when" wrote it.
  fromPayItemId: id.nullable(),
  criteria: z.array(
    z.strictObject({
      criterion: z.string(),
      operator: z.string(),
      picks: z.array(z.strictObject({ value: z.string(), name: z.string(), gone: z.boolean() })),
      numberFrom: z.number().nullable(),
      numberTo: z.number().nullable(),
      dateFrom: day.nullable(),
      dateTo: day.nullable(),
      text: z.string().nullable(),
    }),
  ),
  actions: z.array(
    z.strictObject({
      kind: z.string(),
      slot: z.int().nullable(),
      payItemId: id.nullable(),
      quantityFrom: z.enum(quantityFroms).nullable(),
      itemNameIds: z.array(id),
    }),
  ),
  valid: z.boolean(),
  reasons: z.array(z.string()),
});

export type RuleRead = z.infer<typeof ruleReadSchema>;

export const rulesAnswerSchema = z.strictObject({
  rules: z.array(ruleReadSchema),
  next: id.nullable(),
});

export type RulesAnswer = z.infer<typeof rulesAnswerSchema>;

// A page of a project's sites, by name: each with its labels, its tipping fee links and its own
// shape's newest version, where it has one.
export const sitesAnswerSchema = z.strictObject({
  sites: z.array(
    z.strictObject({
      site: siteRecordSchema,
      labels: z.array(siteLabelRecordSchema),
      tippingFees: z.array(siteTippingFeeRecordSchema),
      shape: siteAreaVersionRecordSchema.nullable(),
    }),
  ),
  next: id.nullable(),
});

export type SitesAnswer = z.infer<typeof sitesAnswerSchema>;

// A page of a site's shape versions, newest first, each with its shape.
export const siteShapeVersionsAnswerSchema = z.strictObject({
  versions: z.array(siteAreaVersionRecordSchema.extend({ shape })),
  next: id.nullable(),
});

export type SiteShapeVersionsAnswer = z.infer<typeof siteShapeVersionsAnswerSchema>;

// A map version as listed: whether its zones' copy was kept beside its own file, and its zones'
// names.
const mapVersionListed = mapVersionRecordSchema.extend({
  zonesFileKept: z.boolean(),
  zones: z.array(named),
});

// A page of a project's map versions, newest first.
export const mapVersionsAnswerSchema = z.strictObject({
  mapVersions: z.array(mapVersionListed),
  next: id.nullable(),
});

export type MapVersionsAnswer = z.infer<typeof mapVersionsAnswerSchema>;

// One map version with its boundary and its zones' shapes.
export const mapVersionAnswerSchema = z.strictObject({
  mapVersion: mapVersionListed,
  boundary: shape,
  zones: z.array(z.strictObject({ id, name: z.string(), shape })),
});

export type MapVersionAnswer = z.infer<typeof mapVersionAnswerSchema>;

// A list's value with what its list asks beside its name (spec/LISTS.md; the domain's
// `listValueSettings`): each is null on a list that doesn't ask it. A field tag says its project.
export const listValueReadSchema = listValueRecordSchema.extend({
  requiresRoe: z.boolean().nullable(),
  countShape: z.string().nullable(),
  // A kind of unit rate work's: whether its photographs are taken by stage (ADR-590).
  photosByStage: z.boolean().nullable(),
  kindOfWorkId: id.nullable(),
  certifies: z.enum(certificationKinds).nullable(),
  incidentTypeId: id.nullable(),
  uses: z.array(z.string()).nullable(),
  projectId: id.nullable(),
});

export type ListValueRead = z.infer<typeof listValueReadSchema>;

export const listValuesAnswerSchema = z.strictObject({
  values: z.array(listValueReadSchema),
  next: id.nullable(),
});

export type ListValuesAnswer = z.infer<typeof listValuesAnswerSchema>;

// What a setup save would do, before it is saved (ADR-229, 535 (3)): what its own answer would
// say (the record, the warnings, what it would queue), or why it wouldn't be saved. Nothing of it
// was kept.
export function previewAnswer<R extends z.ZodType>(record: R) {
  return z.discriminatedUnion('wouldSave', [
    z.strictObject({
      wouldSave: z.literal(true),
      record,
      warnings: z.array(setupWarningSchema),
      queued: z
        .strictObject({ tickets: z.int().min(0), lockedAsInvoiced: z.int().min(0) })
        .optional(),
    }),
    z.strictObject({ wouldSave: z.literal(false), reason: z.string(), message: z.string() }),
  ]);
}

// What a bulk act answers (ADR-535 (4)): each item in the order sent, saved with its mark, or not
// with its reason's code and words. Each is its own piece of work.
export function severalAnswer<R extends z.ZodType>(record: R) {
  return z.strictObject({
    outcomes: z.array(
      z.discriminatedUnion('saved', [
        z.strictObject({ saved: z.literal(true), record }),
        z.strictObject({ saved: z.literal(false), reason: z.string(), message: z.string() }),
      ]),
    ),
  });
}

// ---------------------------------------------------------------------------------------------
// A read-only viewer's reads of the same records (ADR-520 (3), 535 (6)). Every part is what the
// database shows that viewer and no more; a name it doesn't show is null.

// A certification as a viewer reads it: never the driver's phone or licence number; who it
// names by name where the viewer is shown them.
export const viewerCertificationSchema = z.strictObject({
  id,
  certNumber: z.string(),
  kind: z.enum(certificationKinds),
  prime: z.string().nullable(),
  firstTierSub: z.string().nullable(),
  secondTierSub: z.string().nullable(),
  capacityCy: z.int().nullable(),
  vehicleType: z.string().nullable(),
  crewType: z.string().nullable(),
  driverName: z.string().nullable(),
  tagNumber: z.string().nullable(),
  tagState: z.string().nullable(),
  tagExpiry: day.nullable(),
  certifiedAt: at,
  revokedFrom: day.nullable(),
  replacesId: id.nullable(),
  boxes: z.array(
    certificationBoxRecordSchema.omit({ featureId: true, featureOther: true, takenOffAt: true }),
  ),
  helpers: z.int().min(0),
});

export type ViewerCertification = z.infer<typeof viewerCertificationSchema>;

export const viewerCertificationsAnswerSchema = z.strictObject({
  certifications: z.array(viewerCertificationSchema),
  next: id.nullable(),
});

export type ViewerCertificationsAnswer = z.infer<typeof viewerCertificationsAnswerSchema>;

// What every form a viewer reads says: when and where it was made, its notes and its answers.
const viewerForm = {
  id,
  madeAt: at,
  deviceUtcOffsetMinutes: z.int(),
  latitude: exact.nullable(),
  longitude: exact.nullable(),
  notes: z.string().nullable(),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
};

export const viewerSurveysAnswerSchema = z.strictObject({
  surveys: z.array(
    z.strictObject({
      ...viewerForm,
      workType: z.string().nullable(),
      surveyNumber: z.string().nullable(),
      roeNumber: z.string().nullable(),
    }),
  ),
  next: id.nullable(),
});

export type ViewerSurveysAnswer = z.infer<typeof viewerSurveysAnswerSchema>;

export const viewerIncidentsAnswerSchema = z.strictObject({
  incidents: z.array(
    z.strictObject({
      ...viewerForm,
      incidentType: z.string().nullable(),
      incidentSubType: z.string().nullable(),
      description: z.string().nullable(),
      parties: z.string().nullable(),
      address: z.string().nullable(),
      contractor: z.string().nullable(),
      certNumber: z.string().nullable(),
      roeNumber: z.string().nullable(),
    }),
  ),
  next: id.nullable(),
});

export type ViewerIncidentsAnswer = z.infer<typeof viewerIncidentsAnswerSchema>;

// A drop-off log: the resident and where their debris came from only for a viewer the firm lets
// see private citizens by name (ADR-336).
export const viewerDropOffLogsAnswerSchema = z.strictObject({
  dropOffLogs: z.array(
    z.strictObject({
      ...viewerForm,
      site: z.string().nullable(),
      residentName: z.string().nullable(),
      originAddress: z.string().nullable(),
    }),
  ),
  next: id.nullable(),
});

export type ViewerDropOffLogsAnswer = z.infer<typeof viewerDropOffLogsAnswerSchema>;

// A project's setup as a client user or an auditor reads it: its forms and their debris types, its
// pay items by code and description (never a rate), its sites and their facts, its contracts and
// their primes, and its rules by name. A contractor user is shown none of it.
export const viewerSetupAnswerSchema = z.strictObject({
  forms: z.array(
    z.strictObject({
      id,
      documentType: z.enum(formDocumentTypes),
      name: z.string(),
      debrisTypes: z.array(
        z.strictObject({ id, name: z.string().nullable(), reduced: z.boolean() }),
      ),
    }),
  ),
  payItems: z.array(
    z.strictObject({ id, code: z.string(), description: z.string(), unit: z.enum(billingUnits) }),
  ),
  sites: z.array(
    z.strictObject({
      id,
      name: z.string(),
      takesLoads: z.boolean(),
      haulOutsLeaveHere: z.boolean(),
      chargesTippingFee: z.boolean(),
      ineligibleSite: z.boolean(),
      activationDate: day,
      closeDate: day.nullable(),
    }),
  ),
  contracts: z.array(z.strictObject({ id, name: z.string(), prime: z.string().nullable() })),
  rules: z.array(
    z.strictObject({
      id,
      name: z.string(),
      formId: id,
      contractId: id.nullable(),
      active: z.boolean(),
    }),
  ),
});

export type ViewerSetupAnswer = z.infer<typeof viewerSetupAnswerSchema>;
