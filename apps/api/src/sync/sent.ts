// What a phone sends at a sync, record by record, and what each is answered (spec/parts/05-sync.md
// steps 3–7; ARCHITECTURE §9 (3), (4); ADR-022, 236, 338). Every record carries the id its phone
// made when the record began, its project, and who made it on which phone. These are the shapes
// intake takes in Phase 1; the sync contract's shared schemas, with the endpoint in front of
// them, are Phase 2's (REQ-203).
import type { AddressSource, FieldEventKind, PhotoView, Workflow } from '@open-adms/db';
import type { MeasuredAs, QuarantineReason } from '@open-adms/domain';

// A line of an itemised unit rate event: the item picked, and its count or its hours.
export interface SentItem {
  readonly itemNameId: string;
  readonly quantity: number;
}

// A field event as the phone sends it.
export interface SentFieldEvent {
  readonly id: string;
  readonly projectId: string;
  readonly workflow: Workflow;
  readonly kind: FieldEventKind;
  readonly ticketNumber: string;
  readonly splitSuffix: string;
  readonly monitorId: string;
  // Made on a phone: with the phone, the assignment it held and the version of its lists it
  // captured with (ADR-240, 324).
  readonly source: 'DEVICE';
  readonly deviceId: string;
  readonly assignmentId: string;
  readonly setupVersion: number;
  readonly temporarySession: boolean;
  // Typed because the barcode wouldn't read, with the reason picked (ADR-111, 173).
  readonly numberTyped: boolean;
  readonly numberTypedReasonId: string | null;
  // The cert number as scanned off the badge (ADR-017). Which certification it finds on the
  // project is intake's to look up.
  readonly certNumber: string;
  readonly certKeyedByHand: boolean;
  // The assignment's site, where the work is at one (ADR-195).
  readonly siteId: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly deviceUtcOffsetMinutes: number;
  // Whatever fix the phone had at each end (ADR-083).
  readonly startLatitude?: string | null;
  readonly startLongitude?: string | null;
  readonly endLatitude: string | null;
  readonly endLongitude: string | null;
  readonly address: string | null;
  readonly addressSource: AddressSource | null;
  readonly notes: string | null;
  // What its kind records (packages/domain's fieldEventDetails). The debris type is the entry on
  // the project's form; the form is that entry's, which intake reads.
  readonly formDebrisTypeId: string | null;
  readonly fieldTagId: string | null;
  // As picked or typed; the ROE it finds is intake's to look up.
  readonly roeNumber: string | null;
  readonly estimateCy: number | null;
  readonly loadCall: number | null;
  // The scale receipt recorded with it, by the id the phone made.
  readonly scaleReceiptId: string | null;
  readonly carriedCount: number | null;
  readonly kindOfWorkId: string | null;
  readonly payableTypeId: string | null;
  // The phone's answer, what printed; none where no band fits (ADR-213).
  readonly payItemId: string | null;
  readonly unitCount: number | null;
  readonly measurementInches: number | null;
  readonly measuredAs: MeasuredAs | null;
  readonly rootBallInches: number | null;
  readonly rootBallHalfExposed: boolean | null;
  readonly surveyNumber: string | null;
  readonly markedIneligible: boolean | null;
  readonly items: readonly SentItem[];
  // The numbers of the tickets a load carries, as the loading monitor added them (ADR-192).
  readonly carriedTickets: readonly string[];
}

// The paper a final disposal site hands the tower, copied by hand (ADR-034): its own record,
// sent before the disposal that points at it.
export interface SentScaleReceipt {
  readonly id: string;
  readonly projectId: string;
  readonly receiptNumber: string;
  readonly siteId: string;
  readonly grossWeightLb: number | null;
  readonly tareWeightLb: number | null;
  readonly netWeightLb: number | null;
  readonly netWeightTons: number | null;
  readonly enteredById: string;
  readonly deviceId: string;
  readonly enteredAt: Date;
  readonly deviceUtcOffsetMinutes: number;
}

// The firm's own fields as answered, with the version of the definition the phone showed
// (ADR-278). A form with none of the firm's own fields sends neither.
export interface SentAnswers {
  readonly formDefinitionId?: string;
  readonly answers?: Readonly<Record<string, unknown>>;
}

// What every form made on a phone records (ADR-327).
export interface SentForm extends SentAnswers {
  readonly id: string;
  readonly projectId: string;
  readonly source: 'DEVICE';
  readonly monitorId: string;
  readonly deviceId: string;
  readonly assignmentId: string;
  readonly setupVersion: number;
  readonly madeAt: Date;
  readonly deviceUtcOffsetMinutes: number;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly notes: string | null;
}

export interface SentIncident extends SentForm {
  readonly incidentTypeId: string;
  readonly incidentSubTypeId: string | null;
  readonly description: string | null;
  readonly parties: string | null;
  readonly address: string | null;
  // What it names, where the project offers it (ADR-328): the contractor picked by name, the cert
  // number and the ROE number as scanned, picked or typed. The certification and the ROE a
  // number finds are intake's to look up.
  readonly contractorId: string | null;
  readonly certNumber: string | null;
  readonly roeNumber: string | null;
}

export interface SentDropOffLog extends SentForm {
  // The assignment's site (ADR-215).
  readonly siteId: string;
  readonly residentName: string | null;
  readonly originAddress: string | null;
}

// A property's condition before work or after it (ADR-149, 150).
export interface SentSurvey extends SentForm {
  readonly workTypeId: string;
  readonly surveyNumber: string | null;
  // As picked or typed; the ROE it finds is intake's to look up.
  readonly roeNumber: string | null;
}

// An ROE made on a phone: the next number of its ROE block, written R-0007, unless the paper ROE
// has one, typed (ADR-149, 323).
export interface SentRoe extends SentAnswers {
  readonly id: string;
  readonly projectId: string;
  readonly roeNumber: string;
  readonly parcelId: string | null;
  readonly address: string | null;
  readonly ownerName: string | null;
  readonly signed: boolean;
  // A calendar day, 2026-10-09.
  readonly signedDate: string | null;
  readonly latitude?: string | null;
  readonly longitude?: string | null;
  readonly source: 'DEVICE';
  readonly madeById: string;
  readonly deviceId: string;
  readonly assignmentId: string;
  readonly madeAt: Date;
  readonly deviceUtcOffsetMinutes: number;
}

// What a photograph belongs to: a record its phone made, by that record's id.
export type PhotoOwnerKind =
  'FIELD_EVENT' | 'SCALE_RECEIPT' | 'ROE' | 'SURVEY' | 'INCIDENT' | 'DROP_OFF_LOG';

// A photograph's record: sent after the records, the file after that (ADR-101; ARCHITECTURE §9
// (2), §11). The fingerprint is taken at capture. Where the file is kept and the fingerprint of
// what was uploaded are the upload's to say (Phase 2); until it exists the phone's record states
// them. A certification's photographs arrive with its certification (ADR-321).
export interface SentPhoto {
  readonly id: string;
  readonly projectId: string;
  readonly owner: { readonly kind: PhotoOwnerKind; readonly id: string };
  readonly view?: PhotoView | null;
  readonly takenById: string;
  readonly deviceId: string;
  readonly capturedAt: Date;
  readonly deviceUtcOffsetMinutes: number;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly originalSha256: string;
  readonly uploadedSha256: string;
  readonly objectKey: string;
  readonly depthObjectKey?: string | null;
}

// One record a phone sends at sync.
export type SentRecord =
  | { readonly record: 'FIELD_EVENT'; readonly fieldEvent: SentFieldEvent }
  | { readonly record: 'SCALE_RECEIPT'; readonly scaleReceipt: SentScaleReceipt }
  | { readonly record: 'INCIDENT'; readonly incident: SentIncident }
  | { readonly record: 'DROP_OFF_LOG'; readonly dropOffLog: SentDropOffLog }
  | { readonly record: 'SURVEY'; readonly survey: SentSurvey }
  | { readonly record: 'ROE'; readonly roe: SentRoe }
  | { readonly record: 'PHOTO'; readonly photo: SentPhoto };

// Something intake did with a record it saved that the sender should know: nothing was refused
// for it, and the flag is the worker's (ADR-052, 329).
export interface IntakeNote {
  readonly code: 'GPS_UNREADABLE' | 'ANSWERS_DO_NOT_FIT';
  readonly message: string;
}

// Each record's own answer (ARCHITECTURE §9 (4)): saved, already saved, or not saved and kept in
// quarantine, with the reason and the record that holds the number. A quarantined record is
// never answered "saved", however often it is sent (ADR-022).
export type SyncAnswer =
  | { readonly answer: 'SAVED'; readonly id: string; readonly notes: readonly IntakeNote[] }
  | { readonly answer: 'ALREADY_SAVED'; readonly id: string }
  | {
      readonly answer: 'QUARANTINED';
      readonly id: string;
      readonly reason: QuarantineReason;
      readonly message: string;
      readonly heldBy: string;
    };
