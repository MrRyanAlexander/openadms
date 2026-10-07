// The API (ARCHITECTURE §6, §18). Phase 1 builds what a person or a phone writes as plain service
// classes, with no HTTP and no sign-in: each takes the service's own database client (the login
// adms_api) and writes through db.$write as the person it is told. Phase 2 wraps them in endpoints
// (ADR-316). The setup services are spec/parts/01-setup.md's steps, one class per group of records;
// certifying is spec/parts/03-certification.md's (ADR-321); the allocator of numbers is the
// server's alone (ADR-065, 323); intake is spec/parts/05-sync.md's, what the server does with
// each record a phone sends (ADR-338); the review services are
// spec/parts/08-review-and-corrections.md's: a reviewer's corrections and renumbers, a
// quarantined record resolved, a record created in the back office (ADR-364), a ticket voided
// and unvoided, a flag accepted (ADR-365), each answering the run to ask the worker for.
export {
  Certifications,
  type BoxInput,
  type BoxMeasurements,
  type NewCertification,
} from './certification/certifications.ts';
export { NumberAllocator, type LastUsed, type PhoneAtSync } from './numbering/number-allocator.ts';
export { builtInPolicy, installationPolicy } from './policy.ts';
export {
  ContractorSetup,
  SubPlaces,
  type NewContract,
  type NewContractor,
} from './setup/contractor-setup.ts';
export { FormSetup, type NewForm, type NewFormDebrisType } from './setup/form-setup.ts';
export { ListSetup } from './setup/list-setup.ts';
export {
  PayItemSetup,
  type NewPayItem,
  type PaysWhenInput,
  type RulesKept,
} from './setup/pay-item-setup.ts';
export {
  ProjectSetup,
  type NewClient,
  type NewControlRange,
  type NewDeclarationEvent,
  type NewMap,
  type NewProject,
} from './setup/project-setup.ts';
export type { ActionInput, CriterionInput } from './setup/rule-book.ts';
export { RuleSetup, type RuleInput, type SavedRule } from './setup/rule-setup.ts';
export { SetupService, type Clock, type Outcome, type Refusal } from './setup/setup-service.ts';
export {
  SiteSetup,
  type NewSite,
  type SiteChanges,
  type SiteFactSettings,
} from './setup/site-setup.ts';

export { Acceptances } from './review/acceptances.ts';
export { BackOfficeRecords, type NewBackOfficeFieldEvent } from './review/back-office-records.ts';
export {
  Corrections,
  type CorrectedFix,
  type DropOffLogCorrection,
  type FieldEventCorrection,
  type IncidentCorrection,
  type RoeCorrection,
  type ScaleReceiptCorrection,
  type ScopePick,
  type SurveyCorrection,
} from './review/corrections.ts';
export { InvoiceLocks } from './review/invoice-locks.ts';
export { QcMarks, type QcMarked } from './review/qc-marks.ts';
export { QuarantineReview, type NewNumber } from './review/quarantine-review.ts';
export {
  ReviewService,
  type Reprocess,
  type Reviewed,
  type TicketMarked,
  type TicketNamed,
} from './review/review-service.ts';
export { Voids } from './review/voids.ts';

export { Intake } from './sync/intake.ts';
export type {
  IntakeNote,
  PhotoOwnerKind,
  SentAnswers,
  SentDropOffLog,
  SentFieldEvent,
  SentForm,
  SentIncident,
  SentItem,
  SentPhoto,
  SentRecord,
  SentRoe,
  SentScaleReceipt,
  SentSurvey,
  SyncAnswer,
} from './sync/sent.ts';

export const workspace = 'api';
