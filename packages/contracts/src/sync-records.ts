// The records a phone sends at a sync, one schema a kind (ARCHITECTURE §9 (2), (3), §10;
// spec/parts/05-sync.md steps 3…6; spec/acceptance/05-sync.md; AC-10-35, 36; T-12; BACKLOG 2.6.1,
// C69, C84 (9); ADR-022, 052, 100, 236, 329, 338, 466; REQ-004, 203): a field event with its item
// lines and the tickets it carries, a scale receipt, an incident, a drop-off log, a survey, an
// ROE made on a phone, and a certification of a container or a crew (ADR-469). Each carries the
// id its phone made when the record began, its project and the monitor who made it.
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
// hand is the monitor's claim and never bills (ADR-154); a certification sends its measured
// boxes, and the server works the capacity out (ADR-076). **Nor which phone a record is from, or
// that a phone made it:** the phone has proved itself, and the server says both (ADR-466).
//
// A time is sent as a UTC instant, with how far the phone's clock stood from UTC beside it
// (ADR-100), and is read as a `Date`. A photograph's record is not one of these: it is sent
// after them, in a sync's own part (`syncedPhotoSchema`; ARCHITECTURE §9 (2); ADR-481).
import {
  boxShapes,
  boxSigns,
  certificationViews,
  type CertificationKind,
  FieldEventDetails,
  fieldEventKinds,
  fieldEventWaypointsAtMostEver,
  masterPasscodeSessions,
  measuredAs,
  workflows,
} from '@open-adms/domain';
import { z } from 'zod';

import { places } from './field-event-details.ts';
import { addressSources } from './review-answers.ts';

export const id = z.uuid();
// The phone's clock, as a UTC instant.
export const instant = z.iso.datetime().transform((at) => new Date(at));
// How far that clock stood from UTC, in minutes: UTC−12:00 to UTC+14:00.
export const offset = z.number().int().min(-720).max(840);
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
// A name, a number or a state as written on a certification sheet.
const written = z.string().max(200);
// A whole number of inches, 1 or more (adms-certifications §3A.3).
export const inches = z.number().int().min(1).max(9999);
// How many radius corners.
export const cornerCount = z.number().int().min(1).max(99);
// A calendar day: 2026-10-09.
const calendarDay = z.iso.date();

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

// A waypoint a collection's monitor marked while it was open: the phone's clock and whatever fix
// it had, in the order marked (ADR-083, 571, 581; AC-11-77). As many as the policy's most may be
// (`FIELD_EVENT_WAYPOINTS_AT_MOST`): the phone offers its build's value, never more.
export const syncedWaypointSchema = z.strictObject({
  markedAt: instant,
  latitude: fixHalf,
  longitude: fixHalf,
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
    // Made in a session opened under the master passcode, and which way: as the phone's monitor
    // or the temporary session for a monitor picked from the roster (ADR-120, 462, 534;
    // AC-02-42); none in a monitor's own sign-in.
    masterPasscodeSession: z.enum(masterPasscodeSessions).nullable(),
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
    // A collection's waypoints, in the order marked; none on any other kind (ADR-581).
    waypoints: z.array(syncedWaypointSchema).max(fieldEventWaypointsAtMostEver).readonly(),
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
  signedDate: calendarDay.nullable(),
  latitude: fixHalf.optional(),
  longitude: fixHalf.optional(),
  madeById: id,
  assignmentId: id,
  madeAt: instant,
  deviceUtcOffsetMinutes: offset,
  ...answered,
});

// One measured box of a container, as the sheet has it: the first sent is the primary, the main
// interior; each after it is a feature, picked from the firm's list or typed, that adds or
// subtracts. A shape sends its own measurements and `null` for the rest; which those are, and
// what they work out to, is the domain's `Capacity`, asked by the server.
export const syncedCertificationBoxSchema = z.strictObject({
  featureId: id.nullable(),
  featureOther: written.nullable(),
  shape: z.enum(boxShapes),
  sign: z.enum(boxSigns),
  length: inches.nullable(),
  // A hoist's or a dog house's second length.
  secondLength: inches.nullable(),
  width: inches.nullable(),
  height: inches.nullable(),
  diameter: inches.nullable(),
  radius: inches.nullable(),
  run: inches.nullable(),
  corners: cornerCount.nullable(),
});

const certificationKinds = ['CONTAINER', 'CREW'] as const satisfies readonly CertificationKind[];

// As many boxes as a sheet could hold, and as many helpers as a crew of monitors.
export const certificationBoxesAtMost = 100;
export const certificationHelpersAtMost = 20;

// A certification of a container or a crew, as the certifying phone sends it (adms-certifications
// §3A; spec/parts/03-certification.md; ADR-015, 045, 076, 108, 294, 469): what
// `Certifications.certify` takes, and the only way one is made. **Never its capacity**: the
// phone sends the boxes it measured and the server works the capacity out by the same rule
// (AC-10-35). Never its QC status, whether signatures are on file, or a revocation: those are
// the back office's. Its number is the next of the phone's block of the project's series, or
// the pre-printed paper's as typed (ADR-045, 323). The prime is picked; a sub is typed by name
// into tier 1 or tier 2, and who that is, is the server's to work out (ADR-108).
export const syncedCertificationSchema = z
  .strictObject({
    id,
    projectId: id,
    // Cert = placard = badge: one number, as written, never parsed (invariant 9).
    certNumber: numberAsSent.regex(/\S/),
    kind: z.enum(certificationKinds),
    primeId: id,
    firstTierSub: written.nullable(),
    secondTierSub: written.nullable(),
    // Picked from the firm's list, or typed where nothing on it fits (ADR-070).
    vehicleTypeId: id.nullable(),
    vehicleTypeOther: written.nullable(),
    crewTypeId: id.nullable(),
    // A container's, the primary first; none on a crew (invariant 10).
    boxes: z.array(syncedCertificationBoxSchema).max(certificationBoxesAtMost).readonly(),
    // The driver: recorded, never checked (ADR-153).
    driverName: written.nullable(),
    driverPhone: written.nullable(),
    driverLicenceNumber: written.nullable(),
    driverLicenceState: written.nullable(),
    driverLicenceExpiry: calendarDay.nullable(),
    // The tag (plate); an expired one flags later tickets, never this record (ADR-079).
    tagNumber: written.nullable(),
    tagState: written.nullable(),
    tagExpiry: calendarDay.nullable(),
    certifiedAt: instant,
    deviceUtcOffsetMinutes: offset,
    // The monitor who made and measured it, and the assignment the phone held (ADR-240).
    certifiedById: id,
    assignmentId: id,
    // Whoever helped measure, picked from the people assigned with the monitor (ADR-294).
    helperIds: z
      .array(id)
      .max(certificationHelpersAtMost)
      .refine((helpers) => new Set(helpers).size === helpers.length, {
        message: 'A helper is picked once.',
      })
      .readonly(),
    // Names only (ADR-080).
    clientRepresentativeName: written.nullable(),
    contractorRepresentativeName: written.nullable(),
    // A modified truck certified again: the certification this one replaces, from the phone's
    // lists, and why (ADR-082).
    replaces: z.strictObject({ replacedId: id, reason: words }).nullable(),
    notes: words.nullable(),
  })
  // What the database itself holds a certification to, said before it is tried: what was
  // certified is picked or typed, never both; a crew type is a crew's; the primary box is the
  // interior itself, and every box after it is a feature, picked or typed.
  .superRefine((certification, context) => {
    const refuse = (message: string, ...path: (string | number)[]): void => {
      context.addIssue({ code: 'custom', message, path });
    };
    if (certification.vehicleTypeId !== null && certification.vehicleTypeOther !== null) {
      refuse('A vehicle type is picked or typed, never both.', 'vehicleTypeOther');
    }
    if (certification.kind === 'CONTAINER' && certification.crewTypeId !== null) {
      refuse('A container has no crew type.', 'crewTypeId');
    }
    certification.boxes.forEach((box, position) => {
      const features = (box.featureId === null ? 0 : 1) + (box.featureOther === null ? 0 : 1);
      if (position === 0 && features !== 0) {
        refuse('The primary box is the main interior: it has no feature.', 'boxes', 0);
      } else if (position > 0 && features !== 1) {
        refuse('A box after the primary is a feature, picked or typed.', 'boxes', position);
      }
    });
  });

// The kinds of record a phone sends at a sync, in no order: arrival order means nothing
// (ADR-030), except that a scale receipt is sent before the disposals that point at it. A
// certification may arrive after field events that scanned its number: they are linked to it
// then (ADR-420).
export const syncedRecordKinds = [
  'FIELD_EVENT',
  'SCALE_RECEIPT',
  'INCIDENT',
  'DROP_OFF_LOG',
  'SURVEY',
  'ROE',
  'CERTIFICATION',
] as const;

// One record, named by its kind.
export const syncedRecordSchema = z.discriminatedUnion('record', [
  z.strictObject({ record: z.literal('FIELD_EVENT'), fieldEvent: syncedFieldEventSchema }),
  z.strictObject({ record: z.literal('SCALE_RECEIPT'), scaleReceipt: syncedScaleReceiptSchema }),
  z.strictObject({ record: z.literal('INCIDENT'), incident: syncedIncidentSchema }),
  z.strictObject({ record: z.literal('DROP_OFF_LOG'), dropOffLog: syncedDropOffLogSchema }),
  z.strictObject({ record: z.literal('SURVEY'), survey: syncedSurveySchema }),
  z.strictObject({ record: z.literal('ROE'), roe: syncedRoeSchema }),
  z.strictObject({ record: z.literal('CERTIFICATION'), certification: syncedCertificationSchema }),
]);

// What a photograph belongs to: a record its phone made, by that record's id (ADR-101, 292).
export const photoOwnerKinds = [
  'FIELD_EVENT',
  'SCALE_RECEIPT',
  'ROE',
  'SURVEY',
  'INCIDENT',
  'DROP_OFF_LOG',
  'CERTIFICATION',
] as const;

// A SHA-256, as 64 lower-case hexadecimal digits (ARCHITECTURE §11).
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, { message: 'is not a SHA-256 in hex' });

// A photograph's record, sent after the records (ARCHITECTURE §9 (2), §11; ADR-101, 179, 481):
// what it is of, who took it, when and where, and the two fingerprints, the one taken at
// capture and the one of the file the phone will upload, each the phone's word, written once.
// **Never where its file is kept:** the server makes that place, and no phone names one
// (ADR-481). Whether a depth file goes beside it, where the depth couldn't travel inside, is
// the phone's to say, by giving that file's own fingerprint too, the phone's word like the other
// two (ADR-482): the media endpoint checks each file against its own. A certification's five are photographs like any other's, each naming its
// certification and saying which view it is; no other photograph has a view.
export const syncedPhotoSchema = z
  .strictObject({
    id,
    projectId: id,
    owner: z.strictObject({ kind: z.enum(photoOwnerKinds), id }),
    view: z.enum(certificationViews).nullable(),
    takenById: id,
    capturedAt: instant,
    deviceUtcOffsetMinutes: offset,
    latitude: fixHalf,
    longitude: fixHalf,
    originalSha256: sha256,
    uploadedSha256: sha256,
    depthSha256: sha256.nullable(),
  })
  .superRefine((photo, context) => {
    if (photo.view !== null && photo.owner.kind !== 'CERTIFICATION') {
      context.addIssue({
        code: 'custom',
        message: 'Only a certification’s photograph is one of its views.',
        path: ['view'],
      });
    }
  });

// `Synced…` is a record as a phone sends it (a time as text); `Received…` as the server reads
// it (a time as a `Date`).
export type SyncedItem = z.input<typeof syncedItemSchema>;
export type SyncedFieldEvent = z.input<typeof syncedFieldEventSchema>;
export type SyncedScaleReceipt = z.input<typeof syncedScaleReceiptSchema>;
export type SyncedIncident = z.input<typeof syncedIncidentSchema>;
export type SyncedDropOffLog = z.input<typeof syncedDropOffLogSchema>;
export type SyncedSurvey = z.input<typeof syncedSurveySchema>;
export type SyncedRoe = z.input<typeof syncedRoeSchema>;
export type SyncedCertification = z.input<typeof syncedCertificationSchema>;
export type SyncedRecord = z.input<typeof syncedRecordSchema>;
export type SyncedRecordKind = (typeof syncedRecordKinds)[number];
export type ReceivedItem = z.output<typeof syncedItemSchema>;
export type ReceivedFieldEvent = z.output<typeof syncedFieldEventSchema>;
export type ReceivedScaleReceipt = z.output<typeof syncedScaleReceiptSchema>;
export type ReceivedIncident = z.output<typeof syncedIncidentSchema>;
export type ReceivedDropOffLog = z.output<typeof syncedDropOffLogSchema>;
export type ReceivedSurvey = z.output<typeof syncedSurveySchema>;
export type ReceivedRoe = z.output<typeof syncedRoeSchema>;
export type ReceivedCertification = z.output<typeof syncedCertificationSchema>;
export type ReceivedRecord = z.output<typeof syncedRecordSchema>;
export type PhotoOwnerKind = (typeof photoOwnerKinds)[number];
export type SyncedPhoto = z.input<typeof syncedPhotoSchema>;
export type ReceivedPhoto = z.output<typeof syncedPhotoSchema>;
