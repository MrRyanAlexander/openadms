// The API (ARCHITECTURE §6, §18). Its process is `main.ts`: every endpoint a phone, the back office
// or a viewer reaches is served there, over HTTPS behind the proxy. This index is read by two
// workspaces alone, the scenario harness and the dev stack's accounts (`pnpm local:accounts`), so
// it exports what they read and nothing more (ADR-503; held to that by
// `packages/scenarios/test/app-exports.test.ts`): the API as a process, which a story runs on its
// own database and clock (task 2.7.1), and its settings; the setup services and certifying, which
// every story's opening world is made through (spec/parts/01-setup.md, 03-certification.md;
// ADR-316, 321), and the release's policy values they read (C53); the allocator of numbers
// (ADR-065, 323); the server's own command for its admins and the sign-in parts it is built from
// (ADR-415, 502 (d)), which the dev stack's accounts are written with too (ADR-412); the shapes of
// what a phone sends; `Corrections`, for the one check whose job queue is made to fail
// (AC-10-50, ADR-501 (b)); and three reads the burst story times (ADR-524).
export {
  Certifications,
  type BoxInput,
  type NewCertification,
} from './certification/certifications.ts';
export { NumberAllocator } from './numbering/number-allocator.ts';
export { builtInPolicy, installationPolicy } from './policy.ts';
export { ApiModule } from './process/api-module.ts';
export { ApiProcess } from './process/api-process.ts';
export { Settings } from './process/settings.ts';

export { ContractorSetup } from './setup/contractor-setup.ts';
export { FormSetup, type NewForm } from './setup/form-setup.ts';
export { ListSetup } from './setup/list-setup.ts';
export { PayItemSetup, type NewPayItem } from './setup/pay-item-setup.ts';
export { ProjectSetup } from './setup/project-setup.ts';
export type { CriterionInput } from './setup/rule-book.ts';
export { RuleSetup } from './setup/rule-setup.ts';
export { type Clock, type Outcome } from './setup/setup-service.ts';
export { SetupStanding } from './setup/setup-standing.ts';
export { SiteSetup } from './setup/site-setup.ts';
// What the burst story measures at a real project's size (BACKLOG 2.8.2; ADR-524): the setup a
// sync numbers, the passcode's check a phone's first sync is made, and a map's file read.
export { SetupVersions } from './setup/setup-versions.ts';
export { OfflineChecks } from './phone/offline-checks.ts';
export { MapFileReader } from './setup/map-file-reader.ts';
export { WorkQueue } from './jobs/work-queue.ts';

export { Corrections } from './review/corrections.ts';

export { AdminCommand, type Questions } from './people/admin-command.ts';
export { People } from './people/people.ts';
export { ServerAdmin, serverReason } from './people/server-admin.ts';
export { shippedBreachedPasswords } from './sign-in/breached-list.ts';
export { NoMail, type Mail, type Message } from './sign-in/mail.ts';
export { OneTimeCodes } from './sign-in/one-time-codes.ts';
export { PasswordHasher } from './sign-in/password-hasher.ts';
export { SessionTokens } from './sign-in/session-tokens.ts';
export { Sessions } from './sign-in/sessions.ts';
export { TwoStepSecrets } from './sign-in/two-step-secrets.ts';
export { TwoStepCheck } from './sign-in/two-step.ts';
export { WrongTries } from './sign-in/wrong-tries.ts';

export { Assignments, type NewAssignment } from './dispatch/assignments.ts';
export { Phones } from './dispatch/phones.ts';
export { sentFingerprint } from './sync/sync.ts';
export type {
  SentCertification,
  SentDropOffLog,
  SentFieldEvent,
  SentForm,
  SentIncident,
  SentItem,
  SentRecord,
  SentRoe,
  SentScaleReceipt,
  SentSurvey,
  SyncAnswer,
} from './sync/sent.ts';
export type { Addresses } from './phone/address-server.ts';
export { isMediaKey, type KeptFile, type Media } from './media/media-store.ts';
export { PhotographFiles } from './media/photograph-files.ts';
export type { ReportedPasscodeUse } from './phone/passcode-uses.ts';
export type { ReportedUnplannedAssignment } from './phone/unplanned-assignments.ts';
