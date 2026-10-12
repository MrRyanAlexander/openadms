// What a phone sends at a sync, record by record, and what each is answered (spec/parts/05-sync.md
// steps 3–7; ARCHITECTURE §9 (3), (4); ADR-022, 236, 338). Every record carries the id its phone
// made when the record began, its project, and who made it on which phone. These are the shapes
// intake takes: the sync contract's own (task 2.6.1, ADR-466); the endpoint in front of them is
// `Sync`'s (sync.ts; REQ-203).
import type {
  IntakeNote as NoteAnswered,
  ReceivedCertification,
  ReceivedDropOffLog,
  ReceivedFieldEvent,
  ReceivedIncident,
  ReceivedItem,
  ReceivedRoe,
  ReceivedScaleReceipt,
  ReceivedSurvey,
  RecordAnswer,
} from '@open-adms/contracts';
import type { PhotoView } from '@open-adms/db';

// What the server says of a record, never the phone (ADR-466): that a phone made it, and which
// phone, the one that proved itself for the sync.
interface FromAPhone {
  readonly source: 'DEVICE';
  readonly deviceId: string;
}

// Each record is the contracts' own shape as the server reads it (`syncedRecordSchema`,
// packages/contracts/src/sync-records.ts), with the phone it came from: no shape is written
// twice (REQ-004).

// A line of an itemised unit rate event: the item picked, and its count or its hours.
export type SentItem = Readonly<ReceivedItem>;

// A field event as the phone sends it.
export type SentFieldEvent = Readonly<ReceivedFieldEvent> & FromAPhone;

// The paper a final disposal site hands the tower, copied by hand (ADR-034): its own record,
// sent before the disposal that points at it.
export type SentScaleReceipt = Readonly<ReceivedScaleReceipt> & Pick<FromAPhone, 'deviceId'>;

// The firm's own fields as answered, with the version of the definition the phone showed
// (ADR-278). A form with none of the firm's own fields sends neither.
export type SentAnswers = Pick<SentForm, 'formDefinitionId' | 'answers'>;

// What every form made on a phone records (ADR-327).
export type SentForm = Pick<
  SentSurvey,
  | 'id'
  | 'projectId'
  | 'source'
  | 'monitorId'
  | 'deviceId'
  | 'assignmentId'
  | 'setupVersion'
  | 'madeAt'
  | 'deviceUtcOffsetMinutes'
  | 'latitude'
  | 'longitude'
  | 'notes'
  | 'formDefinitionId'
  | 'answers'
>;

// What it names, where the project offers it (ADR-328): the contractor picked by name, the cert
// number and the ROE number as scanned, picked or typed. The certification and the ROE a number
// finds are intake's to look up.
export type SentIncident = Readonly<ReceivedIncident> & FromAPhone;

// A citizen's drop-off at the assignment's site (ADR-215).
export type SentDropOffLog = Readonly<ReceivedDropOffLog> & FromAPhone;

// A property's condition before work or after it (ADR-149, 150).
export type SentSurvey = Readonly<ReceivedSurvey> & FromAPhone;

// An ROE made on a phone: the next number of its ROE block, written R-0007, unless the paper ROE
// has one, typed (ADR-149, 323).
export type SentRoe = Readonly<ReceivedRoe> & FromAPhone;

// A certification of a container or a crew, as the certifying phone sends it (ADR-469): never
// intake's to write. It is handed to `Certifications.received`, the one way one is made.
export type SentCertification = Readonly<ReceivedCertification> & Pick<FromAPhone, 'deviceId'>;

// What a photograph belongs to: a record its phone made, by that record's id.
export type PhotoOwnerKind =
  | 'FIELD_EVENT'
  | 'SCALE_RECEIPT'
  | 'ROE'
  | 'SURVEY'
  | 'INCIDENT'
  | 'DROP_OFF_LOG'
  | 'CERTIFICATION';

// A photograph's record: sent after the records, the file after that (ADR-101; ARCHITECTURE §9
// (2), §11). The fingerprint is taken at capture. Where the file is kept and the fingerprint of
// what was uploaded are the upload's to say (Phase 2); until it exists the phone's record states
// them. A certification's five are photographs like any other's: each names its certification
// and says which view it is (ADR-179, 469).
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
// for it, and the flag is the worker's (ADR-052, 329). The contract's own shape.
export type IntakeNote = Readonly<NoteAnswered>;

// Each record's own answer (ARCHITECTURE §9 (4)), the contract's (`recordAnswerSchema`, ADR-467):
// saved, already saved, or not saved and kept in quarantine, with the reason and the record that
// holds the number. A quarantined record is never answered "saved", however often it is sent
// (ADR-022). What intake never says is "not saved" for a record it kept nowhere: one that isn't
// a record, or that the database refuses, is answered by `Sync` in front of it, and held for a
// person (ADR-468, 472).
export type SyncAnswer = Exclude<RecordAnswer, { answer: 'NOT_SAVED' }>;
