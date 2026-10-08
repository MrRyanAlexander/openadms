// The API (ARCHITECTURE §6, §18). Phase 1 builds what a person or a phone writes as plain service
// classes, with no HTTP and no sign-in: each takes the service's own database client (the login
// adms_api) and writes through db.$write as the person it is told. Phase 2 wraps them in endpoints
// (ADR-316). The setup services are spec/parts/01-setup.md's steps, one class per group of records;
// certifying is spec/parts/03-certification.md's (ADR-321); the allocator of numbers is the
// server's alone (ADR-065, 323); intake is spec/parts/05-sync.md's, what the server does with
// each record a phone sends (ADR-338); the review services are
// spec/parts/08-review-and-corrections.md's: a reviewer's corrections and renumbers, a
// quarantined record resolved, a record created in the back office (ADR-364), a ticket voided
// and unvoided, a flag accepted (ADR-365), each answering the run to ask the worker for; and setting a password is
// ARCHITECTURE §6's (ADR-402…405), as two-step sign-in is (ADR-412), and the firm's people and
// the server's own command for its admins are (ADR-415).
export {
  Certifications,
  type BoxInput,
  type BoxMeasurements,
  type NewCertification,
} from './certification/certifications.ts';
export { NumberAllocator, type LastUsed, type PhoneAtSync } from './numbering/number-allocator.ts';
export { builtInPolicy, installationPolicy } from './policy.ts';
export { Settings, SettingsProblem } from './process/settings.ts';
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
  type PayItemChanges,
  type PaysWhenInput,
  type RulesKept,
} from './setup/pay-item-setup.ts';
export {
  ProjectSetup,
  type ActiveWindow,
  type NewClient,
  type NewControlRange,
  type NewDeclarationEvent,
  type NewMap,
  type NewProject,
} from './setup/project-setup.ts';
export type { ActionInput, CriterionInput } from './setup/rule-book.ts';
export { RuleSetup, type RuleInput, type SavedRule } from './setup/rule-setup.ts';
export {
  QueueingService,
  SetupService,
  type Clock,
  type Outcome,
  type QueuedBySetup,
  type Refusal,
} from './setup/setup-service.ts';
export { SetupStanding } from './setup/setup-standing.ts';
export { WorkQueue, type WorkAsked, type WorkQueued } from './jobs/work-queue.ts';
export {
  SiteSetup,
  type NewSite,
  type NewSiteShape,
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

export { AdminCommand, type Questions } from './people/admin-command.ts';
export {
  People,
  type NewPerson,
  type PeopleParts,
  type PeopleRefused,
  type PersonOutcome,
  type PersonRead,
  type SessionsEnded,
} from './people/people.ts';
export {
  ServerAdmin,
  serverReason,
  type AdminStanding,
  type ServerAdminOutcome,
  type ServerAdminParts,
} from './people/server-admin.ts';

export { shippedBreachedPasswords } from './sign-in/breached-list.ts';
export {
  mailFor,
  NoMail,
  SmtpMail,
  type Mail,
  type MailSettings,
  type Message,
} from './sign-in/mail.ts';
export { OneTimeCodes } from './sign-in/one-time-codes.ts';
export { PasswordHasher } from './sign-in/password-hasher.ts';
export {
  Passwords,
  type PasswordOutcome,
  type PasswordParts,
  type PasswordRefusalCode,
  type ResetAsked,
} from './sign-in/passwords.ts';
export { ResetCodes, type ResetNamed } from './sign-in/reset-codes.ts';
export { SessionTokens, type RefreshRead } from './sign-in/session-tokens.ts';
export {
  Sessions,
  signsInHere,
  type Caller,
  type Opened,
  type RefreshOutcome,
  type SessionParts,
  type SessionPolicy,
  type SignInOutcome,
  type SignInRefused,
  type SignsInHere,
} from './sign-in/sessions.ts';
export { TwoStepSecrets } from './sign-in/two-step-secrets.ts';
export {
  TwoStep,
  TwoStepCheck,
  type SetupBegun,
  type SetupConfirmed,
  type TwoStepCleared,
  type TwoStepParts,
} from './sign-in/two-step.ts';
export {
  WrongTries,
  type Tried,
  type TriedPerson,
  type WrongTriesParts,
} from './sign-in/wrong-tries.ts';

export {
  MasterPasscode,
  type MasterPasscodeParts,
  type PasscodeOutcome,
  type PasscodeRefusalCode,
} from './dispatch/master-passcode.ts';
export {
  Assignments,
  type AssignedWork,
  type AssignmentRead,
  type AssignmentsAsked,
  type AssignmentsPage,
  type NewAssignment,
} from './dispatch/assignments.ts';
export {
  Phones,
  type PhoneRead,
  type PhoneRemoved,
  type PhonesAsked,
  type PhonesPage,
} from './dispatch/phones.ts';
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
