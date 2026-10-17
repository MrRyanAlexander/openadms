// Every endpoint, as each kind of caller (spec/acceptance/10-api-and-sync.md AC-10-27, read
// whole; AC-10-31; ARCHITECTURE §6, Authorization; BACKLOG 2.7.3 part 3; ADR-415, 434, 512).
// OWASP ASVS 5.0 8.2.1, 8.3.1; API5:2023, API9:2023. And every refusal at the door logged, with
// whose call it was where the door knows (AC-10-66; ASVS 16.3.2; ADR-513). The list of endpoints is held here whole,
// each with who it is open to, so an endpoint added or opened wider is read by a person before
// it passes; then each one is asked by nobody, an admin, a manager/analyst without and with
// every grant, each kind of read-only viewer, a proven phone with nobody signed in, and a
// monitor signed in on it. The real process, in this test's own memory, on the installation's
// database: it needs `pnpm local:up` after `pnpm installer`, and fails saying so. The work is
// undone.
//
// **What "let through" means here:** the door didn't refuse it. Every request is sent with an
// empty body that no schema of a write takes and with made-up ids, so what follows the door
// answers it (a refused body, nothing found) and nothing is written. Which rows each caller is
// then shown is the endpoint's own test (`viewer-reads.test.ts`, `review-marks.test.ts`, …).
import { endpoints, type Endpoint, type SignedInRole } from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { permissions } from '@open-adms/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { enrolledPhone, passcode, proven } from './support/phones.ts';
import {
  danasEmail,
  long,
  longer,
  luissEmail,
  worldOn,
  type Answer,
  type Served,
} from './support/served.ts';
import { at, told, viewerSignsIn, type Browser } from './support/setup.ts';
import { Outbox, signInOn } from './support/sign-in.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// Every endpoint the API serves: its name, method and path, who may call it, the roles a
// signed-in endpoint is open to and the one permission it takes. A change here is a change to
// who may do what: read it with ARCHITECTURE §6 and the endpoint's own ADR.
const inventory = [
  'health GET /health ANYBODY',
  'readiness GET /readiness ANYBODY',
  'requestPasswordReset POST /password-resets ANYBODY',
  'completePasswordReset POST /password-resets/completions ANYBODY',
  'signIn POST /sessions ANYBODY',
  'refreshSession POST /sessions/refreshes REFRESH_TOKEN',
  'signOut POST /sessions/sign-outs REFRESH_TOKEN',
  'currentSession GET /sessions/current SIGNED_IN ADMIN,MANAGER_ANALYST,READ_ONLY_VIEWER',
  'sessionCsrf GET /sessions/csrf REFRESH_TOKEN',
  'changePassword POST /password-changes SIGNED_IN ADMIN,MANAGER_ANALYST,READ_ONLY_VIEWER',
  'beginTwoStepSetup POST /two-step/setups SIGNED_IN ADMIN,MANAGER_ANALYST,READ_ONLY_VIEWER',
  'confirmTwoStepSetup POST /two-step/setups/confirmations SIGNED_IN ADMIN,MANAGER_ANALYST,READ_ONLY_VIEWER',
  'removeOwnTwoStep POST /two-step/removals SIGNED_IN ADMIN,MANAGER_ANALYST,READ_ONLY_VIEWER',
  'clearTwoStep POST /people/:userId/two-step-clearings SIGNED_IN ADMIN',
  'createPerson POST /people SIGNED_IN ADMIN',
  'listPeople GET /people SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_DISPATCH',
  'readPerson GET /people/:userId SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_DISPATCH',
  'changePerson PATCH /people/:userId SIGNED_IN ADMIN',
  'setPermissions PUT /people/:userId/permissions SIGNED_IN ADMIN',
  'setViewerProjects PUT /people/:userId/viewer-projects SIGNED_IN ADMIN',
  'setPersonPassword POST /people/:userId/passwords SIGNED_IN ADMIN',
  'endPersonSessions POST /people/:userId/session-endings SIGNED_IN ADMIN',
  'archivePerson POST /people/:userId/archivings SIGNED_IN ADMIN',
  'setPersonRole PUT /people/:userId/role SIGNED_IN ADMIN',
  'unarchivePerson POST /people/:userId/unarchivings SIGNED_IN ADMIN',
  'findClients GET /clients SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'createClient POST /clients SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changeClient PATCH /clients/:clientId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'findDeclarationEvents GET /declaration-events SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'createDeclarationEvent POST /declaration-events SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changeDeclarationEvent PATCH /declaration-events/:declarationEventId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'createProject POST /projects SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'listProjects GET /projects SIGNED_IN ADMIN,MANAGER_ANALYST',
  'readProject GET /projects/:projectId SIGNED_IN ADMIN,MANAGER_ANALYST',
  'reviewQueue GET /projects/:projectId/review-queue SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'listFlags GET /projects/:projectId/flags SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'readTicket GET /projects/:projectId/tickets/:workflow/:ticketNumber SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'readTicketDecisions GET /projects/:projectId/tickets/:workflow/:ticketNumber/decisions SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'changeProjectSettings PATCH /projects/:projectId/settings SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changeProjectWindow PATCH /projects/:projectId/active-window SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'closingCheck GET /projects/:projectId/closing-check SIGNED_IN ADMIN',
  'closeProject POST /projects/:projectId/closings SIGNED_IN ADMIN',
  'reopenProject POST /projects/:projectId/reopenings SIGNED_IN ADMIN',
  'startNumberSeries POST /projects/:projectId/number-series SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'enterControlRange POST /projects/:projectId/control-ranges SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'archiveControlRange POST /control-ranges/:controlRangeId/archivings SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'addFieldTag POST /projects/:projectId/field-tags SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'findContractors GET /contractors SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'createContractor POST /contractors SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changeContractor PATCH /contractors/:contractorId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'addPrime POST /projects/:projectId/primes SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'createContract POST /projects/:projectId/contracts SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changeContract PATCH /contracts/:contractId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'addDebrisType POST /debris-types SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'addPayableType POST /payable-types SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'addListValue POST /lists/:list/values SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'listListValues GET /lists/:list/values SIGNED_IN ADMIN,MANAGER_ANALYST',
  'renameListValue PATCH /lists/:list/values/:valueId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'archiveListValue POST /lists/:list/values/:valueId/archivings SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'unarchiveListValue POST /lists/:list/values/:valueId/unarchivings SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'listForms GET /projects/:projectId/forms SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'createForm POST /projects/:projectId/forms SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changeForm PATCH /forms/:formId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'addFormDebrisType POST /forms/:formId/debris-types SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changeFormDebrisType PATCH /form-debris-types/:formDebrisTypeId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'addFormDefinition POST /forms/:formId/definitions SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'listPayItems GET /projects/:projectId/pay-items SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'createPayItem POST /projects/:projectId/pay-items SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'listPayItemRates GET /projects/:projectId/pay-item-rates SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changePayItem PATCH /pay-items/:payItemId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'previewPayItemChange POST /pay-items/:payItemId/previews SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'setPayItemRate PUT /pay-items/:payItemId/rates/:primeId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'previewPayItemRate POST /pay-items/:payItemId/rates/:primeId/previews SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'setCrewDaySteps PUT /pay-items/:payItemId/crew-day-steps SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'savePaysWhen PUT /pay-items/:payItemId/pays-when SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'previewPaysWhen POST /pay-items/:payItemId/pays-when/previews SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'listRules GET /projects/:projectId/rules SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'createRule POST /projects/:projectId/rules SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'previewNewRule POST /projects/:projectId/rules/previews SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changeRule PUT /rules/:ruleId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'previewRuleChange POST /rules/:ruleId/previews SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'listSites GET /projects/:projectId/sites SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'createSite POST /projects/:projectId/sites SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changeSite PATCH /sites/:siteId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'giveSiteLabel PUT /sites/:siteId/labels/:siteLabelId SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'removeSiteLabel POST /sites/:siteId/labels/:siteLabelId/removals SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'listSiteShapes GET /sites/:siteId/shapes SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'addSiteShape POST /sites/:siteId/shapes SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'siteShapeFile GET /site-shapes/:siteAreaVersionId/file SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'linkTippingFee POST /sites/:siteId/tipping-fees SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'removeTippingFee POST /sites/:siteId/tipping-fees/:payItemId/removals SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'listMapVersions GET /projects/:projectId/map-versions SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'loadMap POST /projects/:projectId/map-versions SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'readMapVersion GET /map-versions/:mapVersionId SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'mapVersionFile GET /map-versions/:mapVersionId/files/:file SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'sendMapFile POST /projects/:projectId/map-files SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'loadMapFile POST /projects/:projectId/map-files/:mapFileId/map-versions SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'addSiteShapeFile POST /sites/:siteId/map-files/:mapFileId/shapes SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'loadEsriMap POST /projects/:projectId/esri-map-versions SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'refreshEsriMap POST /map-versions/:mapVersionId/esri-refreshes SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'addSiteShapeFromEsri POST /sites/:siteId/esri-shapes SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'setupCheck GET /projects/:projectId/setup-check SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'quantityLookup GET /projects/:projectId/quantity-lookup SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'siteQuantityLookup GET /sites/:siteId/quantity-lookup SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_SETUP',
  'firmSettings GET /firm-settings SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changePhoneKeyHours PATCH /firm-settings/phone-key SIGNED_IN ADMIN,MANAGER_ANALYST SETUP',
  'changeViewerTwoStep PATCH /firm-settings/viewer-two-step SIGNED_IN ADMIN',
  'changeMonitorSessionHours PATCH /firm-settings/monitor-sessions SIGNED_IN ADMIN',
  'listPhones GET /phones SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_DISPATCH',
  'listPhoneSessions GET /phones/:deviceId/sessions SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_DISPATCH',
  'enrolPhone POST /phones/enrolments ANYBODY',
  'challengePhone POST /phones/:deviceId/challenges ANYBODY',
  'provePhone POST /phones/:deviceId/proofs ANYBODY',
  'provenPhone GET /phones/current PROVEN_PHONE',
  'createMonitorOnPhone POST /phones/current/monitors PROVEN_PHONE',
  'signInOnPhone POST /phones/current/sign-ins PROVEN_PHONE',
  'openPasscodeSessionOnPhone POST /phones/current/passcode-sessions PROVEN_PHONE',
  'takeOfflineSignInOnPhone POST /phones/current/offline-sign-ins PROVEN_PHONE',
  'reportPasscodeUse POST /phones/current/passcode-uses PHONE_IN_USE',
  'signOutOnPhone POST /phones/current/sign-outs MONITOR_ON_PHONE',
  'phoneMonitor GET /phones/current/monitor MONITOR_ON_PHONE',
  'phoneLists GET /phones/current/lists MONITOR_ON_PHONE',
  'phoneLoginList POST /phones/current/login-list MONITOR_ON_PHONE',
  'phoneAddressLookup POST /phones/current/address-lookups MONITOR_ON_PHONE',
  'phoneSetupChoices POST /phones/current/setup-choices PROVEN_PHONE',
  'reportUnplannedAssignment POST /phones/current/unplanned-assignments PHONE_IN_USE',
  'syncPhone POST /phones/current/syncs PHONE_IN_USE',
  'turnInPhone POST /phones/current/turn-ins PROVEN_PHONE',
  'photoFile GET /phones/current/photos/:photoId/files/:file PHONE_IN_USE',
  'sendPhotoFilePart PATCH /phones/current/photos/:photoId/files/:file PHONE_IN_USE',
  'renamePhone PATCH /phones/:deviceId SIGNED_IN ADMIN,MANAGER_ANALYST DISPATCH',
  'removePhone POST /phones/:deviceId/removals SIGNED_IN ADMIN,MANAGER_ANALYST DISPATCH',
  'returnPhone POST /phones/:deviceId/returns SIGNED_IN ADMIN,MANAGER_ANALYST DISPATCH',
  'changeMasterPasscode POST /master-passcode/versions SIGNED_IN ADMIN',
  'listAssignments GET /projects/:projectId/assignments SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_DISPATCH',
  'writeAssignment POST /projects/:projectId/assignments SIGNED_IN ADMIN,MANAGER_ANALYST DISPATCH',
  'changeAssignment PATCH /assignments/:assignmentId SIGNED_IN ADMIN,MANAGER_ANALYST DISPATCH',
  'withdrawAssignment POST /assignments/:assignmentId/withdrawals SIGNED_IN ADMIN,MANAGER_ANALYST DISPATCH',
  'reinstateAssignment POST /assignments/:assignmentId/reinstatements SIGNED_IN ADMIN,MANAGER_ANALYST DISPATCH',
  'searchBoard GET /assignments SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_DISPATCH',
  'voidTicket POST /projects/:projectId/ticket-voids SIGNED_IN ADMIN,MANAGER_ANALYST VOID',
  'unvoidTicket POST /projects/:projectId/ticket-unvoids SIGNED_IN ADMIN,MANAGER_ANALYST VOID',
  'acceptFlag POST /flags/:flagId/acceptances SIGNED_IN ADMIN,MANAGER_ANALYST ACCEPT_FLAG',
  'withdrawAcceptance POST /flag-acceptances/:flagAcceptanceId/withdrawals SIGNED_IN ADMIN,MANAGER_ANALYST ACCEPT_FLAG',
  'setQcStatus PUT /qc-marks SIGNED_IN ADMIN,MANAGER_ANALYST QC',
  'setQcStatuses PUT /qc-marks/several SIGNED_IN ADMIN,MANAGER_ANALYST QC',
  'listInvoiceBatches GET /projects/:projectId/invoice-batches SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'createInvoiceBatch POST /projects/:projectId/invoice-batches SIGNED_IN ADMIN,MANAGER_ANALYST LOCK_INVOICED',
  'readInvoiceBatch GET /invoice-batches/:invoiceBatchId SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'renameInvoiceBatch PATCH /invoice-batches/:invoiceBatchId SIGNED_IN ADMIN,MANAGER_ANALYST LOCK_INVOICED',
  'lockAsInvoiced POST /invoice-locks SIGNED_IN ADMIN,MANAGER_ANALYST LOCK_INVOICED',
  'lockSeveralAsInvoiced POST /invoice-locks/several SIGNED_IN ADMIN,MANAGER_ANALYST LOCK_INVOICED',
  'setLockBatch PUT /invoice-locks/batch SIGNED_IN ADMIN,MANAGER_ANALYST LOCK_INVOICED',
  'unlockInvoiced POST /invoice-unlocks SIGNED_IN ADMIN,MANAGER_ANALYST UNLOCK_INVOICED',
  'reprocessTickets POST /projects/:projectId/reprocesses SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'readFieldEvent GET /field-events/:fieldEventId SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'correctFieldEvent PATCH /field-events/:fieldEventId SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'renumberFieldEvent PUT /field-events/:fieldEventId/number SIGNED_IN ADMIN,MANAGER_ANALYST RENUMBER',
  'correctItemLine PUT /field-events/:fieldEventId/item-lines/:itemNameId SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'correctCarriedTicket PUT /field-events/:fieldEventId/carried-tickets SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'markPhotograph PATCH /photographs/:photoId SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'photographFile GET /photographs/:photoId/files/:file SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'addPhotograph POST /photographs SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'readScaleReceipt GET /scale-receipts/:scaleReceiptId SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'correctScaleReceipt PATCH /scale-receipts/:scaleReceiptId SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'correctRoe PATCH /roes/:roeId SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'correctRoeScope PUT /roes/:roeId/scope SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'correctSurvey PATCH /surveys/:surveyId SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'correctIncident PATCH /incidents/:incidentId SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'correctDropOffLog PATCH /drop-off-logs/:dropOffLogId SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'renumberQuarantinedRecord POST /quarantined-records/:quarantinedRecordId/renumberings SIGNED_IN ADMIN,MANAGER_ANALYST RENUMBER',
  'markSecondCopy POST /quarantined-records/:quarantinedRecordId/second-copies SIGNED_IN ADMIN,MANAGER_ANALYST RENUMBER',
  // What a sync held for a person, read and resolved; what waits in quarantine, read (ADR-526).
  'listHeldRecords GET /held-records SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'saveHeldRecord POST /held-records/:heldRecordId/savings SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'closeHeldRecord POST /held-records/:heldRecordId/closings SIGNED_IN ADMIN,MANAGER_ANALYST VOID',
  'listSetAsideFiles GET /set-aside-files SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'setAsideFile GET /set-aside-files/:setAsideFileId/file SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'closeSetAsideFile POST /set-aside-files/:setAsideFileId/closings SIGNED_IN ADMIN,MANAGER_ANALYST VOID',
  'listQuarantinedRecords GET /quarantined-records SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  // Records made in the back office, and every captured field correctable (ADR-534).
  'createFieldEvent POST /projects/:projectId/field-events SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'listRoes GET /projects/:projectId/roes SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'createRoe POST /projects/:projectId/roes SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'listSurveys GET /projects/:projectId/surveys SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'createSurvey POST /projects/:projectId/surveys SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'listIncidents GET /projects/:projectId/incidents SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'createIncident POST /projects/:projectId/incidents SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'listDropOffLogs GET /projects/:projectId/drop-off-logs SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'createDropOffLog POST /projects/:projectId/drop-off-logs SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'listCertifications GET /projects/:projectId/certifications SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'createCertification POST /projects/:projectId/certifications SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'readCertification GET /certifications/:certificationId SIGNED_IN ADMIN,MANAGER_ANALYST VIEW_REVIEW',
  'correctCertification PATCH /certifications/:certificationId SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'correctCertificationBox PATCH /certifications/:certificationId/boxes/:position SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'addCertificationBox POST /certifications/:certificationId/boxes SIGNED_IN ADMIN,MANAGER_ANALYST CORRECT',
  'markSignaturesOnFile PUT /certifications/:certificationId/signatures-on-file SIGNED_IN ADMIN,MANAGER_ANALYST QC',
  'revokeCertification POST /certifications/:certificationId/revocations SIGNED_IN ADMIN',
  'unrevokeCertification POST /certifications/:certificationId/unrevocations SIGNED_IN ADMIN',
  'viewerProjects GET /viewer/projects SIGNED_IN READ_ONLY_VIEWER',
  'viewerRoes GET /viewer/projects/:projectId/roes SIGNED_IN READ_ONLY_VIEWER',
  'viewerCertifications GET /viewer/projects/:projectId/certifications SIGNED_IN READ_ONLY_VIEWER',
  'viewerSurveys GET /viewer/projects/:projectId/surveys SIGNED_IN READ_ONLY_VIEWER',
  'viewerIncidents GET /viewer/projects/:projectId/incidents SIGNED_IN READ_ONLY_VIEWER',
  'viewerDropOffLogs GET /viewer/projects/:projectId/drop-off-logs SIGNED_IN READ_ONLY_VIEWER',
  'viewerSetup GET /viewer/projects/:projectId/setup SIGNED_IN READ_ONLY_VIEWER',
  'viewerSetupCheck GET /viewer/projects/:projectId/setup-check SIGNED_IN READ_ONLY_VIEWER',
  'viewerQuantityLookup GET /viewer/projects/:projectId/quantity-lookup SIGNED_IN READ_ONLY_VIEWER',
  'viewerTickets GET /viewer/projects/:projectId/tickets SIGNED_IN READ_ONLY_VIEWER',
  'viewerTicket GET /viewer/projects/:projectId/tickets/:workflow/:ticketNumber SIGNED_IN READ_ONLY_VIEWER',
  'viewerPhotographFile GET /viewer/photographs/:photoId/files/:file SIGNED_IN READ_ONLY_VIEWER',
];

const declared = ({ name, method, path, access, roles, permission }: Endpoint): string =>
  [name, method, path, access, roles?.join(), permission]
    .filter((part) => part !== undefined)
    .join(' ');

// Who asks, and how each is known: a browser by its session's cookies (and its CSRF value on a
// write), a phone by its token, a monitor by that and their session on it.
type Caller =
  | 'nobody'
  | 'an admin'
  | 'a manager/analyst with no grant'
  | 'a manager/analyst with every grant'
  | 'a client user'
  | 'a contractor user'
  | 'an auditor'
  | 'a proven phone, nobody signed in'
  | 'a monitor on a phone';

const roleOf: Partial<Record<Caller, SignedInRole>> = {
  'an admin': 'ADMIN',
  'a manager/analyst with no grant': 'MANAGER_ANALYST',
  'a manager/analyst with every grant': 'MANAGER_ANALYST',
  'a client user': 'READ_ONLY_VIEWER',
  'a contractor user': 'READ_ONLY_VIEWER',
  'an auditor': 'READ_ONLY_VIEWER',
};

const through = 'let through';
type Door = typeof through | readonly [number, string];

// What the door answers each caller (ARCHITECTURE §6; `apps/api/src/sign-in/admission.ts`).
function door({ access, roles = [], permission }: Endpoint, caller: Caller): Door {
  const onPhone =
    caller === 'a proven phone, nobody signed in' || caller === 'a monitor on a phone';
  const role = roleOf[caller];
  switch (access) {
    case 'ANYBODY':
      return through;
    case 'PROVEN_PHONE':
      return onPhone ? through : [401, 'PHONE_NOT_PROVEN'];
    // What a phone sends, with somebody signed in on it (ADR-531), as what a monitor does: the
    // monitor here; the master user's way, the passcode beside the proof, is `phone-proof.test.ts`'s.
    case 'MONITOR_ON_PHONE':
    case 'PHONE_IN_USE':
      if (!onPhone) return [401, 'PHONE_NOT_PROVEN'];
      return caller === 'a monitor on a phone' ? through : [401, 'NOT_SIGNED_IN'];
    case 'REFRESH_TOKEN':
      return role === undefined ? [401, 'NOT_SIGNED_IN'] : through;
    case 'SIGNED_IN':
      if (role === undefined) return [401, 'NOT_SIGNED_IN'];
      if (!roles.includes(role)) return [403, 'NOT_ALLOWED'];
      if (caller === 'a manager/analyst with no grant' && permission !== undefined) {
        return [403, 'NOT_ALLOWED'];
      }
      return through;
  }
}

const doorsCodes = [
  'NOT_SIGNED_IN',
  'NOT_ALLOWED',
  'PHONE_NOT_PROVEN',
  'CSRF_REFUSED',
  'PASSWORD_CHANGE_REQUIRED',
  'TWO_STEP_SETUP_REQUIRED',
];

// What the door did: let it through, or refused it.
const answered = (answer: Answer): Door =>
  answer.code !== undefined && doorsCodes.includes(answer.code)
    ? (told(answer) as [number, string])
    : through;

interface Means {
  readonly browser?: Browser;
  readonly bearer?: string;
  readonly monitorSession?: string;
}

// A read-only viewer of another kind, given a password and signed in.
async function viewerOf(
  served: Served,
  tx: Tx,
  within: Database,
  data: {
    name: string;
    email: string;
    viewerKind: 'CONTRACTOR' | 'AUDITOR';
    contractorId?: string;
  },
): Promise<Browser> {
  const password = 'heron ferry marsh delphine';
  const viewer = await tx.user.create({
    data: { ...data, role: 'READ_ONLY_VIEWER', seesPrivateCitizens: false },
  });
  await tx.userCredential.create({
    data: {
      userId: viewer.id,
      passwordHash: await signInOn(within, new Outbox()).hasher.hash(password),
    },
  });
  return served.signedIn(data.email, password);
}

const ask = (served: Served, endpoint: Endpoint, means: Means): Promise<Answer> =>
  // A query no read's schema takes, as a write's body is: the door answers before either is read.
  served.ask(endpoint.method, `${at(endpoint)}${endpoint.method === 'GET' ? '?nonsense=1' : ''}`, {
    ...(means.browser === undefined
      ? {}
      : endpoint.method === 'GET'
        ? { cookies: means.browser.cookies }
        : means.browser),
    ...(means.bearer === undefined ? {} : { bearer: means.bearer }),
    ...(means.monitorSession === undefined ? {} : { monitorSession: means.monitorSession }),
    // A body no write's schema takes: whatever the door lets through is refused after it.
    ...(endpoint.method === 'GET' ? {} : { payload: {} }),
  });

describe('every endpoint', () => {
  it('AC-10-27 the list is held whole: each endpoint, who may call it, its roles and its permission', () => {
    expect(endpoints.map(declared)).toEqual(inventory);
  });

  it('AC-10-27 every signed-in endpoint names its roles, and only a signed-in one does', () => {
    for (const endpoint of endpoints) {
      expect(endpoint.roles !== undefined && endpoint.roles.length > 0, endpoint.name).toBe(
        endpoint.access === 'SIGNED_IN',
      );
      if (endpoint.permission !== undefined) {
        expect(endpoint.roles, endpoint.name).toContain('MANAGER_ANALYST');
      }
    }
  });

  it('AC-10-27, 31 each is asked by nobody, an admin, a manager/analyst without and with every grant, each kind of read-only viewer, a phone and a monitor on it; the door answers each as its list says, and nothing is written', async () => {
    await world(async (served, tx, who, within) => {
      // The phone and Lee Morgan on it, as a real one is set up (ADR-442).
      const phone = await enrolledPhone(served, tx, 'P1-COL-1');
      const bearer = await proven(served, phone);
      const created = await served.ask('POST', '/phones/current/monitors', {
        bearer,
        payload: { name: 'Lee Morgan', password: '5550142', passcode },
      });
      expect(told(created)).toEqual([200, undefined]);
      const { monitorNumber } = created.body as { monitorNumber: string };
      const signedIn = await served.ask('POST', '/phones/current/sign-ins', {
        bearer,
        payload: { monitorNumber, password: '5550142' },
      });
      expect(told(signedIn)).toEqual([200, undefined]);
      const monitorSession = (signedIn.body as { token: string }).token;

      const coastline = await tx.contractor.create({
        data: { name: 'Coastline Haulers LLC', kind: 'HAULER' },
      });
      // Luis starts with no grant at all, his views too (ADR-539): each taken away by archiving.
      await tx.userPermission.updateMany({
        where: { userId: who.luis },
        data: { archivedAt: new Date() },
      });
      const callers: (readonly [Caller, Means])[] = [
        ['nobody', {}],
        ['an admin', { browser: await served.signedIn(danasEmail, long) }],
        ['a manager/analyst with no grant', { browser: await served.signedIn(luissEmail, longer) }],
        ['a client user', { browser: await viewerSignsIn(served, tx, who.viewer, within) }],
        [
          'a contractor user',
          {
            browser: await viewerOf(served, tx, within, {
              name: 'Coastline Haulers office',
              email: 'office@coastline.example',
              viewerKind: 'CONTRACTOR',
              contractorId: coastline.id,
            }),
          },
        ],
        [
          'an auditor',
          {
            browser: await viewerOf(served, tx, within, {
              name: 'State auditor',
              email: 'auditor@state.example',
              viewerKind: 'AUDITOR',
            }),
          },
        ],
        ['a proven phone, nobody signed in', { bearer }],
        ['a monitor on a phone', { bearer, monitorSession }],
      ];
      const seen: string[] = [];
      const expected: string[] = [];
      const failed: string[] = [];
      // Each request's id, with what the door should have logged of it.
      const refusals: { requestId: string; endpoint: string; door: Door; who: string[] }[] = [];
      // Each caller asks every endpoint; not one request of them all leaves a record of a change.
      const ran = async (caller: Caller, means: Means) => {
        const before = await tx.auditRecord.count();
        for (const endpoint of endpoints) {
          const answer = await ask(served, endpoint, means);
          if (answer.status >= 500)
            failed.push(`${endpoint.name}, ${caller}: ${String(answer.status)}`);
          seen.push(`${endpoint.name}, ${caller}: ${String(answered(answer))}`);
          expected.push(`${endpoint.name}, ${caller}: ${String(door(endpoint, caller))}`);
          const verdict = door(endpoint, caller);
          refusals.push({
            requestId: answer.requestId,
            endpoint: endpoint.name,
            door: verdict,
            // A signed-in person by their id; a phone by its id where nobody is signed in on it.
            who:
              verdict === through
                ? []
                : verdict[1] === 'NOT_ALLOWED'
                  ? ['userId']
                  : verdict[1] === 'NOT_SIGNED_IN' &&
                      (endpoint.access === 'MONITOR_ON_PHONE' || endpoint.access === 'PHONE_IN_USE')
                    ? ['deviceId']
                    : [],
          });
        }
        expect(await tx.auditRecord.count(), caller).toBe(before);
      };
      const logFrom = served.lines.length;
      for (const [caller, means] of callers) await ran(caller, means);
      // Luis, with the same session, granted every permission there is: read on each request.
      for (const permission of permissions) {
        await tx.userPermission.upsert({
          where: { userId_permission: { userId: who.luis, permission } },
          create: { userId: who.luis, permission },
          update: { archivedAt: null },
        });
      }
      await ran('a manager/analyst with every grant', callers[2]?.[1] ?? {});

      expect(seen).toEqual(expected);
      expect(seen).toHaveLength(endpoints.length * 9);
      expect(failed).toEqual([]);

      // AC-10-32 across every endpoint: each line structured, with its request's id, and none of
      // what the callers held or are in it (ARCHITECTURE §6, Logs; ASVS 16.2.5).
      const asked = served.lines
        .slice(logFrom)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.filter(({ requestId }) => typeof requestId !== 'string')).toEqual([]);
      // AC-10-66: each refusal at the door is one line, saying the endpoint, the refusal and whose
      // call it was by id alone; nothing let through is logged as refused (ASVS 16.3.2).
      const byRequest = new Map(
        asked
          .filter(({ msg }) => msg === 'The door refused a request.')
          .map((line) => [line['requestId'], line]),
      );
      expect(byRequest.size).toBe(refusals.filter(({ door: said }) => said !== through).length);
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      for (const { requestId, endpoint, door: said, who: whose } of refusals) {
        const line = byRequest.get(requestId);
        if (said === through) {
          expect(line, endpoint).toBeUndefined();
          continue;
        }
        expect(line, endpoint).toMatchObject({ endpoint, refused: said[1], level: 40 });
        const ids = ['userId', 'deviceId'].filter((key) => line?.[key] !== undefined);
        expect([endpoint, said[1], ids]).toEqual([endpoint, said[1], whose]);
        for (const key of ids) expect(line?.[key]).toMatch(uuid);
        if (whose.includes('deviceId')) expect(line?.['deviceId']).toBe(phone.id);
      }
      const log = served.lines.join('\n');
      const held = callers.flatMap(([, { browser }]) =>
        browser === undefined ? [] : [browser.csrf, ...Object.values(browser.cookies)],
      );
      for (const secret of [
        ...held.filter((value) => value !== ''),
        bearer,
        monitorSession,
        monitorNumber,
        'Lee Morgan',
        '5550142',
        passcode,
        long,
        longer,
      ]) {
        expect(log.includes(secret), secret).toBe(false);
      }
    });
  });
});
