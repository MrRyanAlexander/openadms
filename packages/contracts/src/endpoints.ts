// Every endpoint of the API, said once (ARCHITECTURE §6, Input; REQ-004; AC-10-34, 36; T-12, T-28;
// ADR-387): its method, its path, the schema of each thing it takes (the path's parameters, the
// query, the body) and of what it answers. The API serves a route only through one of these and
// checks what was sent against it before any service runs; the OpenAPI description is made from
// this list (openapi.ts). An object a caller sends is strict: a field its schema doesn't name
// refuses the whole request, and an endpoint whose schema would let one through can't be defined.
import {
  backOfficeCreated,
  backOfficeRolesChanged,
  boxShapes,
  boxSigns,
  certificationViews,
  countShapes,
  crewTimeConversions,
  fieldEventKinds,
  flagCodes,
  incidentOffers,
  mapFileTypes,
  masterPasscodeSessions,
  measuredAs,
  numberSeries,
  permissions,
  phoneRemovals,
  photoFileTypes,
  qcStatuses,
  ruleActionKinds,
  ruleCriterionKeys,
  ruleOperators,
  workflows,
  type PermissionName,
} from '@open-adms/domain';
import { z } from 'zod';

import {
  assignmentRecordSchema,
  assignmentsAnswerSchema,
  csrfAnswerSchema,
  firmSettingsAnswerSchema,
  healthAnswerSchema,
  masterPasscodeAnswerSchema,
  phoneChallengeAnswerSchema,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  passcodeSessionOpenedAnswerSchema,
  offlineSignInTakenAnswerSchema,
  passcodeUseAnswerSchema,
  phoneAddressLookupAnswerSchema,
  phoneListsAnswerSchema,
  phoneSetupChoicesAnswerSchema,
  phoneLoginListAnswerSchema,
  phoneMonitorAnswerSchema,
  unplannedAssignmentAnswerSchema,
  keptFileAnswerSchema,
  photoFileAnswerSchema,
  photoFiles,
  phoneEnrolledAnswerSchema,
  phoneProvenAnswerSchema,
  provenPhoneAnswerSchema,
  passwordSetAnswerSchema,
  peopleAnswerSchema,
  personAnswerSchema,
  phoneRecordSchema,
  phonesAnswerSchema,
  viewerProjectsAnswerSchema,
  viewerRoesAnswerSchema,
  viewerTicketAnswerSchema,
  viewerTicketsAnswerSchema,
  resetAskedAnswerSchema,
  sessionAnswerSchema,
  sessionsEndedAnswerSchema,
  signedOutAnswerSchema,
  twoStepClearedAnswerSchema,
  twoStepSetupAnswerSchema,
} from './api-answers.ts';
import {
  correctedRecordSchema,
  heldRecordSchema,
  heldRecordsAnswerSchema,
  quarantinedRecordsAnswerSchema,
  setAsideFileSchema,
  setAsideFilesAnswerSchema,
} from './held-answers.ts';
import { places } from './field-event-details.ts';
import {
  boardSearchAnswerSchema,
  certificationReadSchema,
  certificationsAnswerSchema,
  dropOffLogsAnswerSchema,
  fieldEventAnswerSchema,
  flagsAnswerSchema,
  formsAnswerSchema,
  incidentsAnswerSchema,
  invoiceBatchAnswerSchema,
  invoiceBatchesAnswerSchema,
  listValuesAnswerSchema,
  mapVersionAnswerSchema,
  mapVersionsAnswerSchema,
  payItemRatesAnswerSchema,
  payItemsAnswerSchema,
  phoneSessionsAnswerSchema,
  previewAnswer,
  projectAnswerSchema,
  projectsAnswerSchema,
  reviewQueueAnswerSchema,
  roesAnswerSchema,
  rulesAnswerSchema,
  scaleReceiptAnswerSchema,
  severalAnswer,
  siteShapeVersionsAnswerSchema,
  sitesAnswerSchema,
  surveysAnswerSchema,
  ticketAnswerSchema,
  ticketDecisionsAnswerSchema,
  auditTrailAnswerSchema,
  setAsideJobsAnswerSchema,
  viewerCertificationsAnswerSchema,
  viewerDropOffLogsAnswerSchema,
  viewerIncidentsAnswerSchema,
  viewerSetupAnswerSchema,
  viewerSurveysAnswerSchema,
} from './read-answers.ts';
import { formDefinitionFields } from './form-definition.ts';
import {
  assignedWork,
  offlineSignInReportSchema,
  once,
  passcodeUseReportSchema,
  unplannedAssignmentReportSchema,
} from './phone-reports.ts';
import {
  addressSources,
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
  quarantinedRecordSchema,
  reprocessRecordSchema,
  roeRecordSchema,
  roeScopeItemRecordSchema,
  scaleReceiptRecordSchema,
  surveyRecordSchema,
  ticketUnvoidRecordSchema,
  ticketVoidRecordSchema,
  waypointRecordSchema,
} from './review-answers.ts';
import {
  certificationBoxesAtMost,
  certificationHelpersAtMost,
  cornerCount,
  inches,
  syncedCertificationBoxSchema,
} from './sync-records.ts';
import { syncAnsweredSchema, syncSentSchema } from './sync.ts';
import { turnInAnswerSchema, turnInSentSchema } from './turn-in.ts';
import {
  billingUnits,
  clientRecordSchema,
  closingCheckAnswerSchema,
  contractorKinds,
  contractorPlaceRecordSchema,
  contractorRecordSchema,
  contractRecordSchema,
  controlRangeRecordSchema,
  crewDayStepsRecordSchema,
  declarationEventRecordSchema,
  fieldTagRecordSchema,
  firmLists,
  formDebrisTypeRecordSchema,
  reasonUses,
  formDefinitionRecordSchema,
  formDocumentTypes,
  formRecordSchema,
  foundAnswer,
  listValueRecordSchema,
  mapSources,
  mapFileId,
  mapFileRecordSchema,
  mapVersionRecordSchema,
  numberSeriesRecordSchema,
  payItemRateRecordSchema,
  payItemRecordSchema,
  projectRecordSchema,
  quantityFroms,
  quantityLookupAnswerSchema,
  rulesKeptRecordSchema,
  savedAnswer,
  savedRuleRecordSchema,
  setupCheckAnswerSchema,
  siteAreaSources,
  siteAreaVersionRecordSchema,
  siteLabelRecordSchema,
  siteRecordSchema,
  siteTippingFeeRecordSchema,
  ticketNumberSources,
} from './setup-answers.ts';

// No endpoint deletes (invariant 1).
export const endpointMethods = ['GET', 'POST', 'PUT', 'PATCH'] as const;

export type EndpointMethod = (typeof endpointMethods)[number];

// Who may call an endpoint (ARCHITECTURE §6; AC-10-27; ADR-408), checked before anything it was
// sent is read. `ANYBODY`: nobody need be signed in. `SIGNED_IN`: a back-office or outside user's
// session, by its access token. `REFRESH_TOKEN`: the session's refresh token, for the calls that
// keep a session going or end it. With either of those two, a call that isn't a GET carries
// the session's CSRF value. `PROVEN_PHONE`: an enrolled phone that has proved itself with its
// device key, by the token its proof gave it, sent as `Authorization: Bearer` and never as a
// cookie (ARCHITECTURE §6, Device sessions; ADR-440). `MONITOR_ON_PHONE`: a proven phone, by
// that token, and the monitor signed in on it, by their session's token in the header named
// below: both are read from the database on every request (ADR-443). `PHONE_IN_USE`: a proven
// phone with somebody signed in on it (ADR-531, the user: a phone with nobody signed in sends
// nothing): a monitor's session, as `MONITOR_ON_PHONE` takes it, or the master passcode sent
// beside its proof, the master user at the phone. What a phone sends is open to it alone.
export const endpointAccess = [
  'ANYBODY',
  'SIGNED_IN',
  'REFRESH_TOKEN',
  'PROVEN_PHONE',
  'MONITOR_ON_PHONE',
  'PHONE_IN_USE',
] as const;

export type EndpointAccess = (typeof endpointAccess)[number];

// Who signs in at the back office and the portal: the roles a `SIGNED_IN` endpoint is open to
// are named from these (ARCHITECTURE §6, Authorization; AC-10-27; ADR-415).
export const signedInRoles = backOfficeCreated;

export type SignedInRole = (typeof signedInRoles)[number];

export const adminOnly = ['ADMIN'] as const satisfies readonly SignedInRole[];
export const backOfficeRoles = [
  'ADMIN',
  'MANAGER_ANALYST',
] as const satisfies readonly SignedInRole[];
// A read-only viewer's own reads (ADR-434): a client user's, a contractor user's, an auditor's.
export const viewerOnly = ['READ_ONLY_VIEWER'] as const satisfies readonly SignedInRole[];

export interface Endpoint {
  // Its name in the OpenAPI description, unique in the list.
  readonly name: string;
  readonly summary: string;
  readonly access: EndpointAccess;
  // On a `SIGNED_IN` endpoint, and only there: the roles it is open to. Every such endpoint
  // names them; the API reads the caller's role from the database on each request.
  readonly roles?: readonly SignedInRole[];
  // The one permission it takes: an admin needs none granted, a manager/analyst must hold it
  // at that moment (a grant taken away refuses their very next request, AC-02-12).
  readonly permission?: PermissionName;
  // Served even to a person who must first set a password of their own (ADR-410): only what
  // they need to do that. Left out, such a person is refused.
  readonly beforePasswordChange?: true;
  // Served even to a person who must first set an authenticator up (ADR-412): only what they
  // need to do that. Left out, such a person is refused.
  readonly beforeTwoStepSetup?: true;
  // On a `PROVEN_PHONE` or `PHONE_IN_USE` endpoint, and only there: served even to a phone taken
  // out of service, and to one whose key the firm's time revoked, proven with the master passcode
  // beside it (ADR-530, 531): only what gets its records onto the server and the phone turned in,
  // and its read of itself. Left out, a phone out of service is refused (`PHONE_OUT_OF_SERVICE`),
  // and a revoked one is proven no more.
  readonly outOfServiceToo?: true;
  readonly method: EndpointMethod;
  // From the root, a parameter written `:name`: `/projects/:projectId`.
  readonly path: string;
  // What it takes. One left out means none is taken: a query or a body sent anyway is refused.
  readonly params?: z.ZodObject;
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
  // The one kind of endpoint that takes a file (AC-10-47; ADR-482, 485): its body is a part of
  // one, as bytes of `filePartMediaType`, never JSON, and no `body` schema is given. Only the
  // media endpoint is one, and the map's file, sent whole at the back office (KD-76).
  readonly file?: true;
  // The one kind of endpoint that answers a file (AC-10-48; ADR-483): its answer is the bytes
  // that were kept, under one of `answerFileTypes`, never JSON, and always a download. Only the
  // back office's read of a photograph's file is one, and only a `GET`.
  readonly answersFile?: true;
  // The types the file it answers is kept under, where they are not a photograph's: a map's
  // file (ADR-535 (2)).
  readonly answersFileOf?: readonly string[];
  readonly answer: z.ZodType;
}

// What a part of a file is sent as (the tus protocol's word for bytes that go at an offset).
export const filePartMediaType = 'application/offset+octet-stream';

// The types a file is answered under: the kinds of image a photograph's file is kept as, told by
// its own first bytes (the domain's `photoFileTypes`, ADR-482 (3)).
export const answerFileTypes = photoFileTypes;

type JsonSchema = Readonly<Record<string, unknown>>;

// Where a schema would take a field it doesn't name: an object left open, anywhere inside it.
function openObjects(schema: unknown, at: string): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((item, index) => openObjects(item, `${at}[${String(index)}]`));
  }
  if (typeof schema !== 'object' || schema === null) return [];
  const node = schema as JsonSchema;
  const more = node['additionalProperties'];
  const open =
    node['type'] === 'object' &&
    (typeof more !== 'object' || more === null || Object.keys(more).length === 0) &&
    more !== false;
  return [
    ...(open ? [at] : []),
    ...Object.entries(node).flatMap(([key, value]) => openObjects(value, `${at}.${key}`)),
  ];
}

const parameter = /:([A-Za-z][A-Za-z0-9]*)/g;

// Defines an endpoint, refusing one that isn't whole: a path parameter with no schema (or a schema
// for one the path doesn't have), or an object that takes fields nobody named.
export function endpoint<const E extends Endpoint>(defined: E): E {
  const inPath = [...defined.path.matchAll(parameter)].map(([, name]) => name).sort();
  const inSchema = Object.keys(defined.params?.shape ?? {}).sort();
  if (!defined.path.startsWith('/') || inPath.join() !== inSchema.join()) {
    throw new Error(`The endpoint ${defined.name}: its path and its parameters' schema disagree.`);
  }
  const open = (['params', 'query', 'body'] as const).flatMap((part) => {
    const schema = defined[part];
    return schema === undefined ? [] : openObjects(z.toJSONSchema(schema, { io: 'input' }), part);
  });
  if (open.length > 0) {
    throw new Error(
      `The endpoint ${defined.name} would take a field nobody named: ${open.join(', ')}.`,
    );
  }
  if (defined.file === true && (defined.body !== undefined || defined.method === 'GET')) {
    throw new Error(
      `The endpoint ${defined.name} takes a file: its body is that, and nothing else.`,
    );
  }
  if (defined.answersFileOf !== undefined && defined.answersFile !== true) {
    throw new Error(`The endpoint ${defined.name} names the types of a file it doesn’t answer.`);
  }
  if (defined.answersFile === true && (defined.method !== 'GET' || defined.file === true)) {
    throw new Error(`The endpoint ${defined.name} answers a file: it is a GET, and takes none.`);
  }
  const roles = defined.roles ?? [];
  const signedIn = defined.access === 'SIGNED_IN';
  if (
    signedIn !== roles.length > 0 ||
    (defined.permission !== undefined && !roles.includes('MANAGER_ANALYST'))
  ) {
    throw new Error(
      `The endpoint ${defined.name} doesn’t say whole who may call it: a signed-in endpoint names its roles, no other does, and a permission is asked only where a manager/analyst may call.`,
    );
  }
  if (
    defined.outOfServiceToo === true &&
    defined.access !== 'PROVEN_PHONE' &&
    defined.access !== 'PHONE_IN_USE'
  ) {
    throw new Error(
      `The endpoint ${defined.name}: only a proven phone’s endpoint is served to a phone out of service.`,
    );
  }
  if (defined.access === 'PHONE_IN_USE' && defined.outOfServiceToo !== true) {
    throw new Error(
      `The endpoint ${defined.name}: what a phone sends is taken from a phone out of service too (ADR-134).`,
    );
  }
  return defined;
}

// What an endpoint's schemas read, for the controller that serves it.
export type ParamsOf<E extends Endpoint> = z.infer<NonNullable<E['params']>>;
export type QueryOf<E extends Endpoint> = z.infer<NonNullable<E['query']>>;
export type BodyOf<E extends Endpoint> = z.infer<NonNullable<E['body']>>;
// What it answers, for whoever reads the answer.
export type AnswerOf<E extends Endpoint> = z.infer<E['answer']>;

const nothing = z.strictObject({});

export interface Sent {
  readonly params: unknown;
  readonly query: unknown;
  readonly body: unknown;
}

// A part of a file, as a request's body: bytes, at least one.
export const isFilePart = (body: unknown): body is Uint8Array =>
  body instanceof Uint8Array && body.byteLength > 0;

// What a request sent, as the endpoint's schemas read it; undefined when any part is refused.
export function taken(served: Endpoint, sent: Sent): Sent | undefined {
  const params = (served.params ?? nothing).safeParse(sent.params ?? {});
  const query = (served.query ?? nothing).safeParse(sent.query ?? {});
  const body =
    served.file === true
      ? { success: isFilePart(sent.body), data: sent.body }
      : served.body === undefined
        ? { success: sent.body === undefined, data: undefined }
        : served.body.safeParse(sent.body);
  if (!params.success || !query.success || !body.success) return undefined;
  return { params: params.data, query: query.data, body: body.data };
}

export const healthEndpoint = endpoint({
  name: 'health',
  summary: 'That the API answers. Anybody may ask.',
  access: 'ANYBODY',
  method: 'GET',
  path: '/health',
  answer: healthAnswerSchema,
});

// Whether the API can serve now (ADR-507): it answers and its database answers it. Status 503
// `UNAVAILABLE` otherwise, never which part or why. Anybody may ask, as the health answer.
export const readinessEndpoint = endpoint({
  name: 'readiness',
  summary:
    'That the API answers and its database answers it: status 503 UNAVAILABLE otherwise. Anybody may ask.',
  access: 'ANYBODY',
  method: 'GET',
  path: '/readiness',
  answer: healthAnswerSchema,
});

// A password reset by email, for a back-office or outside user of a firm that has mail
// (ARCHITECTURE §6; AC-10-25; ADR-170, 404). Nobody is signed in for either call. The first asks
// for a message to the address a person has on record; the second sets the new password with the
// code that message carried. What a password must be is the domain's (its rules), never a schema's:
// the limits here only bound what is read.
export const requestPasswordResetEndpoint = endpoint({
  name: 'requestPasswordReset',
  summary:
    'Asks for a password reset to be sent to an email address. Anybody may ask; the answer is the same whether or not a person has that address.',
  access: 'ANYBODY',
  method: 'POST',
  path: '/password-resets',
  body: z.strictObject({ email: z.string().min(3).max(320) }),
  answer: resetAskedAnswerSchema,
});

export const completePasswordResetEndpoint = endpoint({
  name: 'completePasswordReset',
  summary: 'Sets a new password with the code a reset message carried. The code is good once.',
  access: 'ANYBODY',
  method: 'POST',
  path: '/password-resets/completions',
  body: z.strictObject({
    code: z.string().min(1).max(512),
    password: z.string().min(1).max(4096),
  }),
  answer: passwordSetAnswerSchema,
});

// A back-office or outside user's session (ARCHITECTURE §6, Back-office sessions; AC-10-09,
// 12…18; ADR-408…410). The access token and the refresh token travel only as cookies the server
// sets (`HttpOnly; Secure; SameSite=Strict`); no answer's body holds either. What a body does
// hold is the session's CSRF value, which the page sends back in the header named below with
// every call that isn't a GET: it proves the call came from a page that could read an answer,
// and opens nothing by itself.
export const csrfHeader = 'x-adms-csrf';

// What a person signs in with is the email address the firm holds for them. The limits here only
// bound what is read: a wrong name and a wrong password are refused alike, by one code.
// A person with an authenticator sends its code too (ADR-412): without one, a right password is
// answered `TWO_STEP_CODE_NEEDED` and opens nothing, and the page sends the sign-in again with it.
export const signInEndpoint = endpoint({
  name: 'signIn',
  summary:
    'Signs a back-office or outside user in with their email address and password, and their authenticator code where they have one. The tokens are set as cookies; the answer holds none.',
  access: 'ANYBODY',
  method: 'POST',
  path: '/sessions',
  body: z.strictObject({
    email: z.string().min(1).max(320),
    password: z.string().min(1).max(4096),
    code: z.string().min(1).max(32).optional(),
  }),
  answer: sessionAnswerSchema,
});

export const refreshSessionEndpoint = endpoint({
  name: 'refreshSession',
  summary:
    'Gives a session a new access token and a new refresh token. A refresh token is good once: one presented a second time ends its session.',
  access: 'REFRESH_TOKEN',
  method: 'POST',
  path: '/sessions/refreshes',
  answer: sessionAnswerSchema,
});

export const signOutEndpoint = endpoint({
  name: 'signOut',
  summary: 'Ends the session on the server and clears its cookies.',
  access: 'REFRESH_TOKEN',
  method: 'POST',
  path: '/sessions/sign-outs',
  answer: signedOutAnswerSchema,
});

export const currentSessionEndpoint = endpoint({
  name: 'currentSession',
  summary: 'Who is signed in.',
  access: 'SIGNED_IN',
  roles: signedInRoles,
  beforePasswordChange: true,
  beforeTwoStepSetup: true,
  method: 'GET',
  path: '/sessions/current',
  answer: sessionAnswerSchema,
});

export const sessionCsrfEndpoint = endpoint({
  name: 'sessionCsrf',
  summary:
    'The CSRF value of the session the refresh token belongs to, for a page that was loaded anew.',
  access: 'REFRESH_TOKEN',
  method: 'GET',
  path: '/sessions/csrf',
  answer: csrfAnswerSchema,
});

// A person changes their own password, giving the one they have (ASVS 6.2.2, 6.2.3; ADR-410).
export const changePasswordEndpoint = endpoint({
  name: 'changePassword',
  summary:
    'The signed-in person sets a new password, giving their current one. Their other sessions end.',
  access: 'SIGNED_IN',
  roles: signedInRoles,
  beforePasswordChange: true,
  beforeTwoStepSetup: true,
  method: 'POST',
  path: '/password-changes',
  body: z.strictObject({
    current: z.string().min(1).max(4096),
    password: z.string().min(1).max(4096),
  }),
  answer: passwordSetAnswerSchema,
});

// Two-step sign-in (ARCHITECTURE §6; AC-02-14, 74; AC-10-26; ADR-170, 412): an authenticator
// app's six-digit code. A person sets it up in two calls: the first gives the secret for the app,
// the second proves the app has it with a code, and only then does the server keep anything. An
// admin and a manager/analyst are served nothing else until it is done; a read-only viewer may
// choose it. A person who must first set their own password does that first.
export const beginTwoStepSetupEndpoint = endpoint({
  name: 'beginTwoStepSetup',
  summary:
    'Begins setting up the signed-in person’s authenticator: answers the secret for the app. Nothing is kept until a code proves it.',
  access: 'SIGNED_IN',
  roles: signedInRoles,
  beforeTwoStepSetup: true,
  method: 'POST',
  path: '/two-step/setups',
  answer: twoStepSetupAnswerSchema,
});

export const confirmTwoStepSetupEndpoint = endpoint({
  name: 'confirmTwoStepSetup',
  summary:
    'Finishes setting up the signed-in person’s authenticator with a code from it. Their other sessions end.',
  access: 'SIGNED_IN',
  roles: signedInRoles,
  beforeTwoStepSetup: true,
  method: 'POST',
  path: '/two-step/setups/confirmations',
  body: z.strictObject({
    setup: z.string().min(1).max(1024),
    code: z.string().min(1).max(32),
  }),
  answer: sessionAnswerSchema,
});

// A person removes their own authenticator with a code from it (ADR-530; ASVS 6.4.x; C91): a
// code good once, a wrong one a wrong try, as at sign-in. Their other sessions end, it is a
// security event, and they are told by mail. Whoever's role needs one sets the next one up
// before anything else: replacing an authenticator is removing it and setting the next one up.
export const removeOwnTwoStepEndpoint = endpoint({
  name: 'removeOwnTwoStep',
  summary:
    'The signed-in person removes their own authenticator, giving a code from it. Their other sessions end; it is a security event, and they are told by mail. Whoever must have one then sets a new one up before anything else. A code that isn’t taken is a wrong try, as at sign-in.',
  access: 'SIGNED_IN',
  roles: signedInRoles,
  method: 'POST',
  path: '/two-step/removals',
  body: z.strictObject({ code: z.string().min(1).max(32) }),
  answer: twoStepClearedAnswerSchema,
});

// An admin clears the authenticator of somebody who lost the phone that held it (AC-10-26). The
// person's sessions end, and they set one up again at their next sign-in.
export const clearTwoStepEndpoint = endpoint({
  name: 'clearTwoStep',
  summary:
    'An admin clears another person’s authenticator. Their sessions end; it is a security event.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/people/:userId/two-step-clearings',
  params: z.strictObject({ userId: z.uuid() }),
  answer: twoStepClearedAnswerSchema,
});

// The firm's people (ARCHITECTURE §6, Authorization, §7.0; AC-02-08, 12, 13, 72; AC-10-25;
// ADR-105, 169, 315, 406, 415). An admin creates a back-office or an outside user, never a
// monitor (who is created on a phone under the master passcode) and never the system actor: the
// body takes no other role. What a person signs in with is their email address, so each has one,
// and no two who sign in here share one.
const personId = z.strictObject({ userId: z.uuid() });
const newPerson = {
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  phone: z.string().trim().min(1).max(40).optional(),
};
const newViewer = { ...newPerson, role: z.literal('READ_ONLY_VIEWER') };
// Whether this viewer sees private citizens by name; left out, the domain's start (ADR-336).
const seesPrivateCitizens = z.boolean().optional();

export const createPersonEndpoint = endpoint({
  name: 'createPerson',
  summary:
    'An admin creates an admin, a manager/analyst or a read-only viewer (a client user, a contractor user with its contractor, or an auditor). Never a monitor. The person has no password until an admin sets one.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/people',
  body: z.union([
    z.strictObject({ ...newPerson, role: z.enum(['ADMIN', 'MANAGER_ANALYST']) }),
    z.strictObject({
      ...newViewer,
      viewerKind: z.enum(['CLIENT', 'AUDITOR']),
      seesPrivateCitizens,
    }),
    z.strictObject({
      ...newViewer,
      viewerKind: z.literal('CONTRACTOR'),
      contractorId: z.uuid(),
      seesPrivateCitizens,
    }),
  ]),
  answer: personAnswerSchema,
});

export const readPersonEndpoint = endpoint({
  name: 'readPerson',
  summary:
    'One person, as an admin or a manager/analyst reads them. A monitor’s phone number is in an admin’s answer only.',
  access: 'SIGNED_IN',
  roles: backOfficeRoles,
  permission: 'VIEW_DISPATCH',
  method: 'GET',
  path: '/people/:userId',
  params: personId,
  answer: personAnswerSchema,
});

// The whole of what the person holds from now on: one not named is taken away, one named and
// not held is given. Nothing is deleted: a grant taken away is archived (ADR-315).
export const setPermissionsEndpoint = endpoint({
  name: 'setPermissions',
  summary:
    'An admin states the permissions a manager/analyst holds from now on. One taken away refuses that person’s very next request.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'PUT',
  path: '/people/:userId/permissions',
  params: personId,
  body: z.strictObject({ permissions: z.array(z.enum(permissions)).max(permissions.length) }),
  answer: personAnswerSchema,
});

export const setViewerProjectsEndpoint = endpoint({
  name: 'setViewerProjects',
  summary:
    'An admin states the projects a read-only viewer sees from now on. One not named is taken away.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'PUT',
  path: '/people/:userId/viewer-projects',
  params: personId,
  body: z.strictObject({ projectIds: z.array(z.uuid()).max(1000) }),
  answer: personAnswerSchema,
});

// An admin sets a person's password: a new person's first, or one forgotten, where the firm has
// no mail or the person can't reset by it (AC-10-25; ADR-170, 406). Its owner changes it at
// their next sign-in before anything else (ADR-410). What a password must be is the domain's.
export const setPersonPasswordEndpoint = endpoint({
  name: 'setPersonPassword',
  summary:
    'An admin sets a person’s password. Their sessions end, and they set one of their own at their next sign-in.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/people/:userId/passwords',
  params: personId,
  body: z.strictObject({ password: z.string().min(1).max(4096) }),
  answer: passwordSetAnswerSchema,
});

export const endPersonSessionsEndpoint = endpoint({
  name: 'endPersonSessions',
  summary: 'An admin ends every session a person has open.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/people/:userId/session-endings',
  params: personId,
  answer: sessionsEndedAnswerSchema,
});

// A person who left is archived, never deleted: every record they made still names them
// (AC-02-09). The firm's only admin can't be (AC-02-13).
export const archivePersonEndpoint = endpoint({
  name: 'archivePerson',
  summary:
    'An admin archives a person. Their sessions end and they are refused at once. The only admin can’t be archived.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/people/:userId/archivings',
  params: personId,
  answer: personAnswerSchema,
});

// The firm's people, a page at a time (BACKLOG C92; ADR-427): in the order they were added,
// those in service unless the archived ones are asked for (to take one out of the archive), of
// one role where one is named. Never the system actor. Open to the back office, as reading one
// person is: a monitor's phone number is in an admin's answer only.
// A page holds 200 at most, as `limit`'s pattern says.
export const peoplePageAtMost = 200;

export const listPeopleEndpoint = endpoint({
  name: 'listPeople',
  summary:
    'The firm’s people, a page at a time, in the order they were added or by name: those in service, or the archived ones, of one role, or those whose name holds what is searched. A monitor’s phone number is in an admin’s answer only.',
  access: 'SIGNED_IN',
  roles: backOfficeRoles,
  permission: 'VIEW_DISPATCH',
  method: 'GET',
  path: '/people',
  query: z.strictObject({
    role: z.enum(['ADMIN', 'MANAGER_ANALYST', 'MONITOR', 'READ_ONLY_VIEWER']).optional(),
    archived: z.enum(['true', 'false']).optional(),
    // What the name holds, anywhere in it, in any case (C101; ADR-535 (1)).
    name: z.string().trim().min(1).max(200).optional(),
    // In the order they were added (left out), or by name.
    order: z.enum(['ADDED', 'NAME']).optional(),
    // The last person of the page before: the answer's `next`.
    after: z.uuid().optional(),
    // How many at most: 50 where none is said.
    limit: z
      .string()
      .regex(/^([1-9][0-9]?|1[0-9]{2}|200)$/)
      .optional(),
  }),
  answer: peopleAnswerSchema,
});

// What an admin changes of a person, each thing only where it is stated (AC-02-06, 75; BACKLOG
// C92; ADR-427): their name, the address and phone the firm holds for them (a phone number is
// cleared with null; an address is changed, never cleared), and on a read-only viewer whose user
// they are and whether they see private citizens by name. A contractor user always names its
// contractor, and nobody else does: a kind changed to contractor comes with one.
export const changePersonEndpoint = endpoint({
  name: 'changePerson',
  summary:
    'An admin changes a person’s name, email address or phone number, their employer and its ID for them, and a read-only viewer’s kind, contractor and whether they see private citizens by name. Only what is stated changes; an address is cleared only on a monitor. A changed sign-in address is told to the old one where the firm has mail.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'PATCH',
  path: '/people/:userId',
  params: personId,
  body: z
    .strictObject({
      name: newPerson.name.optional(),
      // Cleared with null only on a person who doesn't sign in with it: a monitor.
      email: newPerson.email.nullable().optional(),
      phone: z.string().trim().min(1).max(40).nullable().optional(),
      viewerKind: z.enum(['CLIENT', 'CONTRACTOR', 'AUDITOR']).optional(),
      contractorId: z.uuid().optional(),
      seesPrivateCitizens: z.boolean().optional(),
      // Who employs them when it isn't the firm (a contractor of the firm's), and the ID that
      // employer gives them; each cleared with null (AC-02-03; ADR-527 (12)).
      employerId: z.uuid().nullable().optional(),
      employerNumber: z.string().trim().min(1).max(60).nullable().optional(),
    })
    .refine((changes) => Object.keys(changes).length > 0),
  answer: personAnswerSchema,
});

// A role is changed between the back office's two only (ADR-427): the firm's only admin stays
// one, by this and by the database. What a manager/analyst was granted stays beside them while
// they are an admin (who needs none) and is theirs again if they are made one again: the answer
// says what they hold, and an admin clears it with their permissions.
export const setPersonRoleEndpoint = endpoint({
  name: 'setPersonRole',
  summary:
    'An admin makes a manager/analyst an admin, or an admin a manager/analyst. Their very next request is asked as the new role. The only admin stays one; a monitor’s and a read-only viewer’s role never changes.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'PUT',
  path: '/people/:userId/role',
  params: personId,
  body: z.strictObject({ role: z.enum(backOfficeRolesChanged) }),
  answer: personAnswerSchema,
});

// Out of the archive (BACKLOG C92; ADR-427): a person who comes back is the person they were,
// with what they held. They have no session; whoever signs in with an email address comes back
// only while nobody in service has taken theirs.
export const unarchivePersonEndpoint = endpoint({
  name: 'unarchivePerson',
  summary:
    'An admin takes a person out of the archive. They are in service again with what they held, and sign in again; refused while somebody in service signs in with their email address.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/people/:userId/unarchivings',
  params: personId,
  answer: personAnswerSchema,
});

// Setup, steps 1 to 4 and the firm's own lists (spec/parts/01-setup.md; ARCHITECTURE §6;
// AC-01-80; AC-10-27, 38; BACKLOG 2.4.2, C60; ADR-316, 424): each call is one thing a person does
// on a setup screen. **Every one is open to an admin and to a manager/analyst who holds Setup
// now**, the searches too. What a setting must be is the domain's and the database's to say: the
// limits here only bound what is read. A setting the domain's rules refuse is answered
// `NOT_SAVED` with the rule's code and its plain words; what the database's own constraints
// refuse, plainly too (`ALREADY_HELD`, `UNKNOWN_RECORD`, `REFUSED_BY_THE_DATABASE`).
const setup = { access: 'SIGNED_IN', roles: backOfficeRoles, permission: 'SETUP' } as const;

const named = z.string().trim().min(1).max(200);
const contact = {
  contactName: z.string().trim().min(1).max(200).optional(),
  contactEmail: z.email().max(320).optional(),
  contactPhone: z.string().trim().min(1).max(40).optional(),
};
// A calendar day: 2026-10-12.
const day = z.iso.date();
// What a search matches, anywhere in the name, a page at a time in name order (ADR-527 (3)):
// left out, every record. A page holds 50 where none is said, 200 at most.
const searched = z.strictObject({
  search: z.string().trim().max(200).optional(),
  // The last record of the page before: the answer's `next`.
  after: z.uuid().optional(),
  limit: z
    .string()
    .regex(/^([1-9][0-9]?|1[0-9]{2}|200)$/)
    .optional(),
});
// A firm-wide record changed (ADR-527 (1)): only what is stated, a contact or a note cleared
// with null.
const changedContact = {
  contactName: contact.contactName.unwrap().nullable().optional(),
  contactEmail: contact.contactEmail.unwrap().nullable().optional(),
  contactPhone: contact.contactPhone.unwrap().nullable().optional(),
};
const clientId = z.strictObject({ clientId: z.uuid() });
const declarationEventId = z.strictObject({ declarationEventId: z.uuid() });
const contractorId = z.strictObject({ contractorId: z.uuid() });
const contractId = z.strictObject({ contractId: z.uuid() });
const projectId = z.strictObject({ projectId: z.uuid() });
// A number of a series: the database says where a series may start and end.
const seriesNumber = z.number().int().min(1).max(2_000_000_000);
// A whole number a column holds (Postgres's `integer`): one past it is refused here, never sent
// to the database to fail there (OWASP ASVS 5.0 1.4.2; AC-10-63; ADR-513). Inside that range a
// column's own check says what it refuses, in plain words (ADR-424).
const columnInteger = z.number().int().min(-2_147_483_648).max(2_147_483_647);
const stated = (changes: object): boolean => Object.keys(changes).length > 0;

// Step 1: search first; a client the firm has is picked, never created again (ADR-023).
export const findClientsEndpoint = endpoint({
  ...setup,
  name: 'findClients',
  summary: 'The firm’s clients whose name holds what was typed; none archived.',
  method: 'GET',
  path: '/clients',
  query: searched,
  answer: foundAnswer(clientRecordSchema),
});

export const createClientEndpoint = endpoint({
  ...setup,
  name: 'createClient',
  summary: 'Creates a client: the jurisdiction or agency paying for the work.',
  method: 'POST',
  path: '/clients',
  body: z.strictObject({
    name: named,
    ...contact,
    notes: z.string().trim().min(1).max(4000).optional(),
  }),
  answer: savedAnswer(clientRecordSchema),
});

export const changeClientEndpoint = endpoint({
  ...setup,
  name: 'changeClient',
  summary:
    'Changes a client’s name, contact or notes; one left out stays as it is, and a contact or the notes are cleared with null. Audited with the value before.',
  method: 'PATCH',
  path: '/clients/:clientId',
  params: clientId,
  body: z
    .strictObject({
      name: named.optional(),
      ...changedContact,
      notes: z.string().trim().min(1).max(4000).nullable().optional(),
    })
    .refine(stated),
  answer: savedAnswer(clientRecordSchema),
});

// Step 2: by its name or its reference; one declaration event is shared by every client's
// projects under it (ADR-026).
export const findDeclarationEventsEndpoint = endpoint({
  ...setup,
  name: 'findDeclarationEvents',
  summary: 'The declaration events whose name or reference holds what was typed; none archived.',
  method: 'GET',
  path: '/declaration-events',
  query: searched,
  answer: foundAnswer(declarationEventRecordSchema),
});

export const createDeclarationEventEndpoint = endpoint({
  ...setup,
  name: 'createDeclarationEvent',
  summary:
    'Creates a declaration event: the disaster and its reference as written, its reference type picked from the firm’s list.',
  method: 'POST',
  path: '/declaration-events',
  body: z.strictObject({ name: named, reference: named, referenceTypeId: z.uuid() }),
  answer: savedAnswer(declarationEventRecordSchema),
});

export const changeDeclarationEventEndpoint = endpoint({
  ...setup,
  name: 'changeDeclarationEvent',
  summary:
    'Changes a declaration event’s name, its reference as written or its reference type; one left out stays as it is. Audited with the value before.',
  method: 'PATCH',
  path: '/declaration-events/:declarationEventId',
  params: declarationEventId,
  body: z
    .strictObject({
      name: named.optional(),
      reference: named.optional(),
      referenceTypeId: z.uuid().optional(),
    })
    .refine(stated),
  answer: savedAnswer(declarationEventRecordSchema),
});

// Step 3: the project. Its settings start as a new project's do (the domain's, from the policy
// values); its number series start with it.
export const createProjectEndpoint = endpoint({
  ...setup,
  name: 'createProject',
  summary:
    'Creates a project under a client and a declaration event, with its time zone, active window, ticket-number source, ticket types and kinds of unit rate work.',
  method: 'POST',
  path: '/projects',
  body: z.strictObject({
    name: named,
    clientId: z.uuid(),
    declarationEventId: z.uuid(),
    programTypeId: z.uuid(),
    // An IANA name: America/New_York. The database says which it takes.
    timeZone: z.string().min(1).max(64),
    activeFrom: day,
    // Empty: the window has no end yet.
    activeTo: day.nullable(),
    ticketNumberSource: z.enum(ticketNumberSources),
    workflows: z.array(z.enum(workflows)).min(1).max(workflows.length).refine(once),
    kindOfWorkIds: z.array(z.uuid()).max(200),
    // Where a series starts, where the firm says.
    numbersFrom: z
      .strictObject({
        LOAD: seriesNumber.optional(),
        HAUL_OUT: seriesNumber.optional(),
        UNIT_RATE: seriesNumber.optional(),
        CERTIFICATION: seriesNumber.optional(),
        ROE: seriesNumber.optional(),
      })
      .optional(),
  }),
  answer: savedAnswer(projectRecordSchema),
});

export const changeProjectSettingsEndpoint = endpoint({
  ...setup,
  name: 'changeProjectSettings',
  summary:
    'Changes a project’s own settings; one left out stays as it is. Its tickets not locked as invoiced are queued.',
  method: 'PATCH',
  path: '/projects/:projectId/settings',
  params: projectId,
  body: z
    .strictObject({
      allowSplitLoads: z.boolean().optional(),
      // Empty switches the limit off.
      loadCallLowLimit: columnInteger.nullable().optional(),
      loadCallHighLimit: columnInteger.nullable().optional(),
      stumpFillDepthInches: columnInteger.optional(),
      stumpCheckRootBallWider: z.boolean().optional(),
      stumpCheckFillNeedsExposure: z.boolean().optional(),
      siteCircleMeters: columnInteger.optional(),
      timeClockEnabled: z.boolean().optional(),
    })
    .refine(stated),
  answer: savedAnswer(projectRecordSchema),
});

export const changeProjectWindowEndpoint = endpoint({
  ...setup,
  name: 'changeProjectWindow',
  summary:
    'Changes a project’s active window: either end; the end may be emptied. Its tickets not locked as invoiced are queued.',
  method: 'PATCH',
  path: '/projects/:projectId/active-window',
  params: projectId,
  body: z
    .strictObject({ activeFrom: day.optional(), activeTo: day.nullable().optional() })
    .refine(stated),
  answer: savedAnswer(projectRecordSchema),
});

// A project closed is closed (ADR-529 (b)): an admin closes it by hand, having read what is still
// open; nothing in it changes after (the database refuses it), and field work for it that arrives
// later is held for a person. An admin reopens it, with a reason.
export const closingCheckEndpoint = endpoint({
  name: 'closingCheck',
  summary:
    'What is still open on a project before an admin closes it: phones that took its work and weren’t turned in, tickets not QC Approved or not locked as invoiced, records waiting for a person. It never stops the close.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'GET',
  path: '/projects/:projectId/closing-check',
  params: projectId,
  answer: closingCheckAnswerSchema,
});

export const closeProjectEndpoint = endpoint({
  name: 'closeProject',
  summary:
    'An admin closes a project: its assignments are withdrawn and its phones’ unused numbers retired, and nothing in it changes after; what was still open is said with it. Field work for it that arrives later is held for a person. A project closed already is answered as it stands. Refused only while the worker is still working its tickets.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/projects/:projectId/closings',
  params: projectId,
  answer: savedAnswer(projectRecordSchema),
});

export const reopenProjectEndpoint = endpoint({
  name: 'reopenProject',
  summary:
    'An admin reopens a closed project, with a reason, audited. Its withdrawn assignments and retired numbers stay as they are.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/projects/:projectId/reopenings',
  params: projectId,
  body: z.strictObject({ reason: z.string().trim().min(1).max(500) }),
  answer: savedAnswer(projectRecordSchema),
});

export const startNumberSeriesEndpoint = endpoint({
  ...setup,
  name: 'startNumberSeries',
  summary:
    'Starts a number series the project doesn’t have yet (its cert numbers), from the number the firm says.',
  method: 'POST',
  path: '/projects/:projectId/number-series',
  params: projectId,
  body: z.strictObject({ series: z.enum(numberSeries), firstNumber: seriesNumber }),
  answer: savedAnswer(numberSeriesRecordSchema),
});

export const enterControlRangeEndpoint = endpoint({
  ...setup,
  name: 'enterControlRange',
  summary:
    'Enters a run of pre-printed control tickets on a project that numbers its tickets from them.',
  method: 'POST',
  path: '/projects/:projectId/control-ranges',
  params: projectId,
  body: z.strictObject({
    series: z.enum(numberSeries),
    firstNumber: seriesNumber,
    lastNumber: seriesNumber,
  }),
  answer: savedAnswer(controlRangeRecordSchema),
});

export const archiveControlRangeEndpoint = endpoint({
  ...setup,
  name: 'archiveControlRange',
  summary: 'Takes off a control range entered by mistake. It is archived, never deleted.',
  method: 'POST',
  path: '/control-ranges/:controlRangeId/archivings',
  params: z.strictObject({ controlRangeId: z.uuid() }),
  answer: savedAnswer(controlRangeRecordSchema),
});

export const addFieldTagEndpoint = endpoint({
  ...setup,
  name: 'addFieldTag',
  summary: 'Adds a field tag at the end of the project’s own list.',
  method: 'POST',
  path: '/projects/:projectId/field-tags',
  params: projectId,
  body: z.strictObject({ name: named }),
  answer: savedAnswer(fieldTagRecordSchema),
});

// Step 4: a contractor the firm has is picked, never entered again; a prime is added to a
// project; a contract is a name, its prime and an optional link (ADR-108, 146, 305). Subs are
// typed in at certification, never here.
export const findContractorsEndpoint = endpoint({
  ...setup,
  name: 'findContractors',
  summary: 'The firm’s contractors whose name holds what was typed; none archived.',
  method: 'GET',
  path: '/contractors',
  query: searched,
  answer: foundAnswer(contractorRecordSchema),
});

export const createContractorEndpoint = endpoint({
  ...setup,
  name: 'createContractor',
  summary: 'Creates a contractor record, firm-wide. Whoever adds it says its kind.',
  method: 'POST',
  path: '/contractors',
  body: z.strictObject({ name: named, kind: z.enum(contractorKinds), ...contact }),
  answer: savedAnswer(contractorRecordSchema),
});

export const changeContractorEndpoint = endpoint({
  ...setup,
  name: 'changeContractor',
  summary:
    'Changes a contractor’s name, kind or contact; one left out stays as it is, and a contact is cleared with null. Audited with the value before.',
  method: 'PATCH',
  path: '/contractors/:contractorId',
  params: contractorId,
  body: z
    .strictObject({
      name: named.optional(),
      kind: z.enum(contractorKinds).optional(),
      ...changedContact,
    })
    .refine(stated),
  answer: savedAnswer(contractorRecordSchema),
});

export const addPrimeEndpoint = endpoint({
  ...setup,
  name: 'addPrime',
  summary: 'Adds a contractor to a project as a prime.',
  method: 'POST',
  path: '/projects/:projectId/primes',
  params: projectId,
  body: z.strictObject({ contractorId: z.uuid() }),
  answer: savedAnswer(contractorPlaceRecordSchema),
});

// The link to the signed copy is opened from a page: only an `https` address is taken.
export const createContractEndpoint = endpoint({
  ...setup,
  name: 'createContract',
  summary:
    'Creates a contract on a project: its name, one of the project’s primes, and an optional link to the signed copy.',
  method: 'POST',
  path: '/projects/:projectId/contracts',
  params: projectId,
  body: z.strictObject({
    name: named,
    primeId: z.uuid(),
    signedCopyUrl: z
      .url({ protocol: /^https$/ })
      .max(2000)
      .optional(),
  }),
  answer: savedAnswer(contractRecordSchema),
});

// Its prime stays as entered: the prime is what its rules run on (ADR-527 (2)).
export const changeContractEndpoint = endpoint({
  ...setup,
  name: 'changeContract',
  summary:
    'Changes a contract’s name or the link to its signed copy (cleared with null); its prime stays as entered (a contract has one prime; another prime has a contract of its own). Audited with the value before.',
  method: 'PATCH',
  path: '/contracts/:contractId',
  params: contractId,
  body: z
    .strictObject({
      name: named.optional(),
      signedCopyUrl: z
        .url({ protocol: /^https$/ })
        .max(2000)
        .nullable()
        .optional(),
    })
    .refine(stated),
  answer: savedAnswer(contractRecordSchema),
});

// The firm's own values on its lists (spec/LISTS.md): added at the end, with a name and no key.
export const addDebrisTypeEndpoint = endpoint({
  ...setup,
  name: 'addDebrisType',
  summary: 'Adds a debris type to the firm’s library, named as its contracts name the work.',
  method: 'POST',
  path: '/debris-types',
  body: z.strictObject({ name: named }),
  answer: savedAnswer(listValueRecordSchema),
});

export const addPayableTypeEndpoint = endpoint({
  ...setup,
  name: 'addPayableType',
  summary: 'Adds a payable type to the firm’s list: the work a pay item prices.',
  method: 'POST',
  path: '/payable-types',
  body: z.strictObject({ name: named }),
  answer: savedAnswer(listValueRecordSchema),
});

// A value of any of the firm's lists, or a project's field tag, by its list and its id
// (spec/LISTS.md; ADR-527 (6)): renamed, archived and put back. A built-in value is renamed if
// the firm uses another word, never archived.
const listValue = z.strictObject({ list: z.enum(firmLists), valueId: z.uuid() });

export const addListValueEndpoint = endpoint({
  ...setup,
  name: 'addListValue',
  summary:
    'Adds a value of the firm’s own to one of its lists, at the end, with a name and what its list asks beside it: a program type whether it requires ROEs, a kind of unit rate work the shape of its count, an item name its kind of work, a vehicle type what it certifies, an incident sub-type its incident type, a reason where it is offered. A field tag is added on its project.',
  method: 'POST',
  path: '/lists/:list/values',
  params: z.strictObject({ list: z.enum(firmLists) }),
  body: z.strictObject({
    name: named,
    requiresRoe: z.boolean().optional(),
    countShape: z.enum(countShapes).optional(),
    kindOfWorkId: z.uuid().optional(),
    certifies: z.enum(['CONTAINER', 'CREW']).optional(),
    incidentTypeId: z.uuid().optional(),
    uses: z.array(z.enum(reasonUses)).min(1).max(reasonUses.length).refine(once).optional(),
  }),
  answer: savedAnswer(listValueRecordSchema),
});

export const renameListValueEndpoint = endpoint({
  ...setup,
  name: 'renameListValue',
  summary:
    'Renames a value of one of the firm’s lists, or a project’s field tag; a built-in value too. Nothing the system does follows a name.',
  method: 'PATCH',
  path: '/lists/:list/values/:valueId',
  params: listValue,
  body: z.strictObject({ name: named }),
  answer: savedAnswer(listValueRecordSchema),
});

export const archiveListValueEndpoint = endpoint({
  ...setup,
  name: 'archiveListValue',
  summary:
    'Archives a value of one of the firm’s lists, or a project’s field tag: off new picks, kept on old records. A built-in value is never archived. Each project whose rules pick it has its tickets not locked as invoiced queued.',
  method: 'POST',
  path: '/lists/:list/values/:valueId/archivings',
  params: listValue,
  answer: savedAnswer(listValueRecordSchema),
});

export const unarchiveListValueEndpoint = endpoint({
  ...setup,
  name: 'unarchiveListValue',
  summary:
    'Puts an archived list value back, as it was. Each project whose rules pick it has its tickets not locked as invoiced queued.',
  method: 'POST',
  path: '/lists/:list/values/:valueId/unarchivings',
  params: listValue,
  answer: savedAnswer(listValueRecordSchema),
});

// Setup, steps 5, 6 and 8 (spec/parts/01-setup.md; spec/RULES.md; AC-01-22…30, 39…51, 60…68, 81;
// AC-10-38; BACKLOG 2.4.2, C97, C98; ADR-425): a project's forms, the debris types on them and the
// firm's own fields; its pay items, each prime's rate and "Pays when"; its rules. As every setup
// endpoint, each takes Setup, and the limits here only bound what is read: which operator a
// criterion takes, what a band or a conversion must be and which picks exist are the domain's
// and the database's to say.
const formId = z.strictObject({ formId: z.uuid() });
const payItemId = z.strictObject({ payItemId: z.uuid() });

// Step 5. A project has one form for each document type it uses (ADR-211).
export const createFormEndpoint = endpoint({
  ...setup,
  name: 'createForm',
  summary:
    'Creates a project’s form for one document type. "GPS required" is stated on an ROE form, and what an incident offers its monitors on an incident form; on no other.',
  method: 'POST',
  path: '/projects/:projectId/forms',
  params: projectId,
  body: z.strictObject({
    documentType: z.enum(formDocumentTypes),
    name: named,
    gpsRequired: z.boolean().optional(),
    // An empty list: the incident form offers none of the three.
    incidentOffers: z
      .array(z.enum(incidentOffers))
      .max(incidentOffers.length)
      .refine(once)
      .optional(),
  }),
  answer: savedAnswer(formRecordSchema),
});

// What a form says is changed (ADR-527 (4)): "GPS required" on the ROE form, and what an incident
// offers on the incident form, and on no other, as the database holds them. A form is never
// archived and has no Enabled box (ADR-529 (d)): a load, haul-out or unit rate form is used by
// the project's workflows, and the forms that are no ticket's by the day's assignments.
export const changeFormEndpoint = endpoint({
  ...setup,
  name: 'changeForm',
  summary:
    'Changes a form’s name, "GPS required" (the ROE form’s) or what an incident offers the monitors (the incident form’s); one left out stays as it is.',
  method: 'PATCH',
  path: '/forms/:formId',
  params: formId,
  body: z
    .strictObject({
      name: named.optional(),
      gpsRequired: z.boolean().optional(),
      incidentOffers: z
        .array(z.enum(incidentOffers))
        .max(incidentOffers.length)
        .refine(once)
        .optional(),
    })
    .refine(stated),
  answer: savedAnswer(formRecordSchema),
});

export const addFormDebrisTypeEndpoint = endpoint({
  ...setup,
  name: 'addFormDebrisType',
  summary:
    'Adds a debris type from the firm’s library to a load or haul-out form. One not marked Reduced on a haul-out form is saved with a warning.',
  method: 'POST',
  path: '/forms/:formId/debris-types',
  params: formId,
  body: z.strictObject({
    debrisTypeId: z.uuid(),
    reduced: z.boolean(),
    reductionMethodId: z.uuid().optional(),
    hiddenOnPhones: z.boolean(),
  }),
  answer: savedAnswer(formDebrisTypeRecordSchema),
});

const formDebrisTypeId = z.strictObject({ formDebrisTypeId: z.uuid() });

export const changeFormDebrisTypeEndpoint = endpoint({
  ...setup,
  name: 'changeFormDebrisType',
  summary:
    'Changes a debris type’s entry on a form: Reduced, its reduction method (cleared with null) or whether phones hide it; one left out stays as it is. One not Reduced on a haul-out form is saved with a warning.',
  method: 'PATCH',
  path: '/form-debris-types/:formDebrisTypeId',
  params: formDebrisTypeId,
  body: z
    .strictObject({
      reduced: z.boolean().optional(),
      reductionMethodId: z.uuid().nullable().optional(),
      hiddenOnPhones: z.boolean().optional(),
    })
    .refine(stated),
  answer: savedAnswer(formDebrisTypeRecordSchema),
});

export const addFormDefinitionEndpoint = endpoint({
  ...setup,
  name: 'addFormDefinition',
  summary:
    'Saves the firm’s own fields on an ROE, survey, incident or drop-off log form as its next version. A version is never edited.',
  method: 'POST',
  path: '/forms/:formId/definitions',
  params: formId,
  body: z.strictObject({ fields: formDefinitionFields }),
  answer: savedAnswer(formDefinitionRecordSchema),
});

// Step 6. A band's end is inches to a tenth; a rate is an exact decimal, never a float: `7.50`.
const bandEnd = z.number().min(0).max(9_999_999);
const rate = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/);
const payItemCode = z.string().trim().min(1).max(60);
const crewDayHours = z.number().min(0).max(99);
// No capture setting has a default: whoever enters a pay item states each (ADR-309).
const captureSettings = {
  countIsAlwaysOne: z.boolean(),
  gpsRequired: z.boolean(),
  measurementRequired: z.boolean(),
  decimalsAllowed: z.boolean(),
  photosRequired: z.boolean(),
  monitorMayMarkIneligible: z.boolean(),
  quantityFromCarriedTickets: z.boolean(),
};

export const createPayItemEndpoint = endpoint({
  ...setup,
  name: 'createPayItem',
  summary:
    'Enters a pay item read off the contract: its code, unique on the project, its description, payable type, Unit of Measure, size band, capture settings, and a rate for each prime. A band that overlaps another of its payable type isn’t saved. The project’s tickets not locked as invoiced are queued.',
  method: 'POST',
  path: '/projects/:projectId/pay-items',
  params: projectId,
  body: z.strictObject({
    code: payItemCode,
    description: named,
    payableTypeId: z.uuid(),
    unit: z.enum(billingUnits),
    // Set on a unit rate pay item, one a monitor picks; empty on every other.
    kindOfWorkId: z.uuid().nullable(),
    bandFrom: bandEnd.nullable(),
    bandTo: bandEnd.nullable(),
    ...captureSettings,
    // On a pay item by the hour or the crew day, and only there.
    crewTimeConversion: z.enum(crewTimeConversions).nullable(),
    crewDayHours: crewDayHours.nullable(),
    // None at all is a $0 pay item (ADR-128).
    rates: z.array(z.strictObject({ primeId: z.uuid(), rate })).max(200),
  }),
  answer: savedAnswer(payItemRecordSchema),
});

// Its payable type and its kind of work say what work it is, and stay as entered (ADR-425).
export const changePayItemEndpoint = endpoint({
  ...setup,
  name: 'changePayItem',
  summary:
    'Changes a pay item: its code, description, Unit of Measure, size band, crew-time conversion or capture settings; one left out stays as it is. The rules its "Pays when" wrote are renamed with it. The project’s tickets not locked as invoiced are queued.',
  method: 'PATCH',
  path: '/pay-items/:payItemId',
  params: payItemId,
  body: z
    .strictObject({
      code: payItemCode.optional(),
      description: named.optional(),
      unit: z.enum(billingUnits).optional(),
      bandFrom: bandEnd.nullable().optional(),
      bandTo: bandEnd.nullable().optional(),
      countIsAlwaysOne: z.boolean().optional(),
      gpsRequired: z.boolean().optional(),
      measurementRequired: z.boolean().optional(),
      decimalsAllowed: z.boolean().optional(),
      photosRequired: z.boolean().optional(),
      monitorMayMarkIneligible: z.boolean().optional(),
      quantityFromCarriedTickets: z.boolean().optional(),
      crewTimeConversion: z.enum(crewTimeConversions).nullable().optional(),
      crewDayHours: crewDayHours.nullable().optional(),
    })
    .refine(stated),
  answer: savedAnswer(payItemRecordSchema),
});

// One rate a prime on a pay item, so the rate is put, never added: a second row is never made.
export const setPayItemRateEndpoint = endpoint({
  ...setup,
  name: 'setPayItemRate',
  summary:
    'Sets a prime’s rate on a pay item: for the first time, changed (audited with the rate before), or put back. The project’s tickets not locked as invoiced are queued.',
  method: 'PUT',
  path: '/pay-items/:payItemId/rates/:primeId',
  params: z.strictObject({ payItemId: z.uuid(), primeId: z.uuid() }),
  body: z.strictObject({ rate }),
  answer: savedAnswer(payItemRateRecordSchema),
});

// A crew day's steps, stated whole (ADR-087, 527 (7)): hours to a hundredth, a quantity to four
// decimals, as exact decimals. A step not named is archived.
const stepHours = z.string().regex(/^\d{1,2}(\.\d{1,2})?$/);
const stepQuantity = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/);

export const setCrewDayStepsEndpoint = endpoint({
  ...setup,
  name: 'setCrewDaySteps',
  summary:
    'States a pay item’s crew day steps whole: hours from and to, both included, and the quantity they bill. One not named is taken off. Two that share an hour aren’t saved. The project’s tickets not locked as invoiced are queued.',
  method: 'PUT',
  path: '/pay-items/:payItemId/crew-day-steps',
  params: payItemId,
  body: z.strictObject({
    steps: z
      .array(z.strictObject({ fromHours: stepHours, toHours: stepHours, quantity: stepQuantity }))
      .max(50),
  }),
  answer: savedAnswer(crewDayStepsRecordSchema),
});

// Step 8. One line of a rule's "ifs" (spec/RULES.md §3, §4): a picked value by its record's id
// (a zone by its name), a typed one in the field of its kind.
const ruleNumber = z.number().min(-9_999_999_999).max(9_999_999_999);
const criterionLine = z.strictObject({
  criterion: z.enum(ruleCriterionKeys),
  operator: z.enum(ruleOperators),
  picks: z.array(z.string().min(1).max(200)).max(200).optional(),
  numberFrom: ruleNumber.optional(),
  numberTo: ruleNumber.optional(),
  dateFrom: day.optional(),
  dateTo: day.optional(),
  text: z.string().trim().min(1).max(500).optional(),
});
const criteria = z.array(criterionLine).max(50);
// A transaction's #: its slot on the ticket (spec/RULES.md §5).
const slot = z.number().int().min(1).max(999);
// On an Add transaction for an itemised ticket: every item, or the chosen ones (ADR-128).
const quantityFrom = {
  quantityFrom: z.enum(quantityFroms).optional(),
  itemNameIds: z.array(z.uuid()).max(200).optional(),
};

// The whole of what the pay item pays on from now on: a form not named is one it no longer pays
// on, and the rule it kept there is archived.
export const savePaysWhenEndpoint = endpoint({
  ...setup,
  name: 'savePaysWhen',
  summary:
    'Saves a pay item’s "Pays when": for each form it pays on, the criteria and the transaction # it adds. A rule is written and kept for each of the project’s contracts whose prime has a rate on it; the answer says which rules were added, changed, archived and left alone.',
  method: 'PUT',
  path: '/pay-items/:payItemId/pays-when',
  params: payItemId,
  body: z.strictObject({
    pays: z.array(z.strictObject({ formId: z.uuid(), slot, criteria, ...quantityFrom })).max(20),
  }),
  answer: savedAnswer(rulesKeptRecordSchema),
});

// A rule as the rule builder states it, whole. One that isn't valid is saved all the same and
// never runs (spec/RULES.md §7): the answer says whether it is, and why not.
const ruleBody = z.strictObject({
  formId: z.uuid(),
  name: named,
  // Empty only on a rule with no Add transaction.
  contractId: z.uuid().nullable(),
  active: z.boolean(),
  criteria,
  actions: z
    .array(
      z.strictObject({
        kind: z.enum(ruleActionKinds),
        slot: slot.optional(),
        payItemId: z.uuid().optional(),
        ...quantityFrom,
      }),
    )
    .max(50),
});

export const createRuleEndpoint = endpoint({
  ...setup,
  name: 'createRule',
  summary:
    'Writes a rule on one of the project’s load, haul-out or unit rate forms. An exact copy of another rule isn’t saved. Its form’s tickets not locked as invoiced are queued.',
  method: 'POST',
  path: '/projects/:projectId/rules',
  params: projectId,
  body: ruleBody,
  answer: savedAnswer(savedRuleRecordSchema),
});

export const changeRuleEndpoint = endpoint({
  ...setup,
  name: 'changeRule',
  summary:
    'States a rule anew, whole: its form, name, contract, Active tick, criteria and actions. A rule a pay item’s "Pays when" wrote is changed only there. The tickets of its form, and of the form it had, not locked as invoiced are queued.',
  method: 'PUT',
  path: '/rules/:ruleId',
  params: z.strictObject({ ruleId: z.uuid() }),
  body: ruleBody,
  answer: savedAnswer(savedRuleRecordSchema),
});

// Setup, steps 3, 4 and 7, and the setup as it stands (spec/parts/01-setup.md; AC-01-21, 52…59,
// 69…77; BACKLOG 2.4.2, C97, C98; ADR-426): a contractor typed twice merged into one; a
// project's disposal sites, a site's own shape and its tipping fee pay item; the project's map.
// Each takes Setup, as every setup endpoint.
const siteId = z.strictObject({ siteId: z.uuid() });
// WGS84 as an exact decimal, never a float: `39.09000000`. The database says how far it may go.
const coordinate = z.string().regex(/^-?\d{1,3}(\.\d{1,8})?$/);
const shortCode = z.string().trim().min(1).max(20);
// The four site facts: every one stated, none has a default (ADR-215).
const siteFacts = {
  takesLoads: z.boolean(),
  haulOutsLeaveHere: z.boolean(),
  chargesTippingFee: z.boolean(),
  ineligibleSite: z.boolean(),
};
// GeoJSON as a map or a drawing gives it: a geometry, a Feature or a FeatureCollection, whose
// properties are the map's own. It is read by the domain's MapShapes, which takes the shapes
// and a zone's name and nothing else; what it can't read isn't saved, and the answer says why.
const geoJson = z.json();

// Step 7. A site belongs to one project and is entered again on each that uses it (ADR-145).
export const createSiteEndpoint = endpoint({
  ...setup,
  name: 'createSite',
  summary:
    'Enters a disposal site on a project: its site type, the four site facts, its GPS, a permit number (empty: permit outstanding) and its dates. "Haul-outs leave here" is saved only on a TDSR/DMS site.',
  method: 'POST',
  path: '/projects/:projectId/sites',
  params: projectId,
  body: z.strictObject({
    name: named,
    shortCode: shortCode.optional(),
    siteTypeId: z.uuid(),
    ...siteFacts,
    permitNumber: named.nullable(),
    latitude: coordinate,
    longitude: coordinate,
    activationDate: day,
    closeDate: day.optional(),
  }),
  answer: savedAnswer(siteRecordSchema),
});

export const changeSiteEndpoint = endpoint({
  ...setup,
  name: 'changeSite',
  summary:
    'Changes a site: its name, short code, site type, site facts, permit number, GPS or dates; one left out stays as it is. The tickets with a field event at the site not locked as invoiced are queued.',
  method: 'PATCH',
  path: '/sites/:siteId',
  params: siteId,
  body: z
    .strictObject({
      name: named.optional(),
      shortCode: shortCode.nullable().optional(),
      siteTypeId: z.uuid().optional(),
      takesLoads: z.boolean().optional(),
      haulOutsLeaveHere: z.boolean().optional(),
      chargesTippingFee: z.boolean().optional(),
      ineligibleSite: z.boolean().optional(),
      permitNumber: named.nullable().optional(),
      latitude: coordinate.optional(),
      longitude: coordinate.optional(),
      activationDate: day.optional(),
      // Empty: the site has no close date.
      closeDate: day.nullable().optional(),
    })
    .refine(stated),
  answer: savedAnswer(siteRecordSchema),
});

// One of the firm's own labels on a site: given, removed when given by mistake, and given back on
// the same row (ADR-194, 215, 529 (g); AC-01-58). It changes nothing the system does, so nothing
// is queued.
const siteLabel = z.strictObject({ siteId: z.uuid(), siteLabelId: z.uuid() });

export const giveSiteLabelEndpoint = endpoint({
  ...setup,
  name: 'giveSiteLabel',
  summary:
    'Gives a site one of the firm’s own site labels, or gives back one removed. It changes nothing the system does.',
  method: 'PUT',
  path: '/sites/:siteId/labels/:siteLabelId',
  params: siteLabel,
  answer: savedAnswer(siteLabelRecordSchema),
});

export const removeSiteLabelEndpoint = endpoint({
  ...setup,
  name: 'removeSiteLabel',
  summary:
    'Removes a label given to a site by mistake: audited, never deleted; give it again to put it back.',
  method: 'POST',
  path: '/sites/:siteId/labels/:siteLabelId/removals',
  params: siteLabel,
  answer: savedAnswer(siteLabelRecordSchema),
});

export const addSiteShapeEndpoint = endpoint({
  ...setup,
  name: 'addSiteShape',
  summary:
    'Saves a site’s own shape as its next version: from then on the site is checked against the shape in place of the project’s circle, and an earlier shape stays as it was. The tickets with a field event at the site not locked as invoiced are queued.',
  method: 'POST',
  path: '/sites/:siteId/shapes',
  params: siteId,
  body: z.strictObject({ source: z.enum(siteAreaSources), shape: geoJson }),
  answer: savedAnswer(siteAreaVersionRecordSchema),
});

export const linkTippingFeeEndpoint = endpoint({
  ...setup,
  name: 'linkTippingFee',
  summary:
    'Links a site to a tipping fee pay item written from it: how a fee line is told from a hauling line. A site may keep several. A link removed is linked again.',
  method: 'POST',
  path: '/sites/:siteId/tipping-fees',
  params: siteId,
  body: z.strictObject({ payItemId: z.uuid() }),
  answer: savedAnswer(siteTippingFeeRecordSchema),
});

export const removeTippingFeeEndpoint = endpoint({
  ...setup,
  name: 'removeTippingFee',
  summary:
    'Removes a site’s link to a tipping fee pay item made by mistake: audited, never deleted; link it again to put it back. The tickets with a field event at the site not locked as invoiced are queued.',
  method: 'POST',
  path: '/sites/:siteId/tipping-fees/:payItemId/removals',
  params: z.strictObject({ siteId: z.uuid(), payItemId: z.uuid() }),
  answer: savedAnswer(siteTippingFeeRecordSchema),
});

// Step 3's map (ADR-135, 141, 311): GeoJSON only. A map is as large as a request's body may be.
export const loadMapEndpoint = endpoint({
  ...setup,
  name: 'loadMap',
  summary:
    'Loads a project’s map as its next version: its boundary and, if it has any, its zones, each named in the field picked. An earlier version and its zones stay as they were. The project’s tickets not locked as invoiced are queued.',
  method: 'POST',
  path: '/projects/:projectId/map-versions',
  params: projectId,
  body: z.strictObject({
    source: z.enum(mapSources),
    // The file's name, or the layer's address.
    sourceName: z.string().trim().min(1).max(2000).nullable(),
    boundary: geoJson,
    // Empty: the map has no zones.
    zones: geoJson.nullable(),
    zoneNameField: named.nullable(),
  }),
  answer: savedAnswer(mapVersionRecordSchema),
});

// A map's file, larger than a request's body may be (ARCHITECTURE §3 "Project boundary and
// zones", §6 "Uploads"; BACKLOG 2.6.4, C86, C100; ADR-311, 401, 485; KD-76): a zipped shapefile
// (with its `.prj`, converted to longitude and latitude where it is projected) or a GeoJSON
// file, sent whole, as bytes, by a route with its own size limit (`MAP_FILE_BYTES_AT_MOST`).
// The server tells its kind by its first bytes, reads it, and keeps it once, where it places
// it, only when it holds a layer; the answer says what it found. A map or a site's shape is
// then loaded from it by its id, the layers picked by name. Its name is never sent with it: a
// map version is told the name the person knows it by, as a label (`sourceName`).
const mapFileNamed = z.strictObject({ projectId: z.uuid(), mapFileId });
const mapLayer = z.string().min(1).max(500);

export const sendMapFileEndpoint = endpoint({
  ...setup,
  name: 'sendMapFile',
  summary:
    'Sends a map’s file for a project, whole, as bytes: a zipped shapefile (its .shp, .dbf and .prj; a projected one is converted to longitude and latitude) or a GeoJSON file, at most the policy’s size. The server tells its kind by its own first bytes, reads every layer it holds and keeps it once, where it places it; a file it can’t read is not kept, and the answer says why. The answer is the file’s id and, for each layer, its features, its fields and whether it is one shape. The same file sent again is the same file. Nothing is loaded yet.',
  method: 'POST',
  path: '/projects/:projectId/map-files',
  params: projectId,
  file: true,
  answer: savedAnswer(mapFileRecordSchema),
});

export const loadMapFileEndpoint = endpoint({
  ...setup,
  name: 'loadMapFile',
  summary:
    'Loads a project’s map from a map’s file sent before, as its next version: the layer that is its boundary and, if it has any, the layer of its zones, each named in the field picked. A layer left unnamed is the file’s only one. The file is kept with the version. An earlier version and its zones stay as they were. The project’s tickets not locked as invoiced are queued.',
  method: 'POST',
  path: '/projects/:projectId/map-files/:mapFileId/map-versions',
  params: mapFileNamed,
  body: z.strictObject({
    // The file's name, as the person knows it.
    sourceName: z.string().trim().min(1).max(2000).nullable(),
    boundaryLayer: mapLayer.nullable(),
    // Empty: the map has no zones.
    zones: z.strictObject({ layer: mapLayer.nullable(), nameField: named }).nullable(),
  }),
  answer: savedAnswer(mapVersionRecordSchema),
});

export const addSiteShapeFileEndpoint = endpoint({
  ...setup,
  name: 'addSiteShapeFile',
  summary:
    'Saves a site’s own shape from a map’s file sent before for the site’s project, as its next version: the layer named, or the file’s only one, as one shape. From then on the site is checked against the shape in place of the project’s circle, and an earlier shape stays as it was. The tickets with a field event at the site not locked as invoiced are queued.',
  method: 'POST',
  path: '/sites/:siteId/map-files/:mapFileId/shapes',
  params: z.strictObject({ siteId: z.uuid(), mapFileId }),
  body: z.strictObject({ layer: mapLayer.nullable() }),
  answer: savedAnswer(siteAreaVersionRecordSchema),
});

// An Esri feature layer, linked by its address (ARCHITECTURE §3 "Project boundary and zones";
// ADR-523, 527 (15)). The API asks the layer for every feature as GeoJSON in WGS84 and keeps the
// copy, as a map's file is kept. The address is a layer's (`…/FeatureServer/<n>` or
// `…/MapServer/<n>`), over HTTPS, with no user, password, query or fragment; it is held against
// server-side request forgery where the request is made, never only here. **A secured layer's
// token is sent in the body**, used for that fetch alone, and never kept, logged or answered.
const esriLayer = z
  .url({ protocol: /^https$/ })
  .max(2000)
  // No user or password before the host, and no query or fragment after the path.
  .regex(/^https:\/\/[^/@?#]+\/[^?#]*$/);
const esriToken = z.string().min(1).max(4096).optional();

export const loadEsriMapEndpoint = endpoint({
  ...setup,
  name: 'loadEsriMap',
  summary:
    'Loads a project’s map from Esri feature layers as its next version: the boundary’s layer and, if it has any, the zones’ layer (the same or another), named in the field picked. The API fetches each as GeoJSON in WGS84 and keeps the copy with the version. An earlier version and its zones stay as they were. The project’s tickets not locked as invoiced are queued.',
  method: 'POST',
  path: '/projects/:projectId/esri-map-versions',
  params: projectId,
  body: z.strictObject({
    boundaryLayer: esriLayer,
    // Empty: the map has no zones.
    zones: z.strictObject({ layer: esriLayer, nameField: named }).nullable(),
    token: esriToken,
  }),
  answer: savedAnswer(mapVersionRecordSchema),
});

export const refreshEsriMapEndpoint = endpoint({
  ...setup,
  name: 'refreshEsriMap',
  summary:
    'Refresh from Esri: loads a project’s map again from the layers a version fetched from Esri named, as its next version. The version itself never changes. The project’s tickets not locked as invoiced are queued.',
  method: 'POST',
  path: '/map-versions/:mapVersionId/esri-refreshes',
  params: z.strictObject({ mapVersionId: z.uuid() }),
  // No body: a layer that isn't secured.
  body: z.strictObject({ token: esriToken }).optional(),
  answer: savedAnswer(mapVersionRecordSchema),
});

export const addSiteShapeFromEsriEndpoint = endpoint({
  ...setup,
  name: 'addSiteShapeFromEsri',
  summary:
    'Saves a site’s own shape from an Esri feature layer as its next version, the layer’s features as one shape. The API fetches it as GeoJSON in WGS84 and keeps the copy. An earlier shape stays as it was. The tickets with a field event at the site not locked as invoiced are queued.',
  method: 'POST',
  path: '/sites/:siteId/esri-shapes',
  params: siteId,
  body: z.strictObject({ layer: esriLayer, token: esriToken }),
  answer: savedAnswer(siteAreaVersionRecordSchema),
});

// The setup as it stands (AC-01-69…77; ADR-229, 423, 426): the setup check and what each site's
// phones ask for. They read and change nothing, and hold no rate: open to an admin and to a
// manager/analyst granted "view setup", whether or not they hold Setup (the user, ADR-539).
const standing = { access: 'SIGNED_IN', roles: backOfficeRoles } as const;

export const setupCheckEndpoint = endpoint({
  ...standing,
  permission: 'VIEW_SETUP',
  name: 'setupCheck',
  summary:
    'The setup check: everything a project’s setup leaves open, in plain words; none when it is whole. It lists and never refuses.',
  method: 'GET',
  path: '/projects/:projectId/setup-check',
  params: projectId,
  answer: setupCheckAnswerSchema,
});

export const quantityLookupEndpoint = endpoint({
  ...standing,
  permission: 'VIEW_SETUP',
  name: 'quantityLookup',
  summary:
    'What each site’s phones ask for: the load call, the scale weight, a count of the items carried or nothing more, for each site, debris type and prime. Worked out from the setup as it stands.',
  method: 'GET',
  path: '/projects/:projectId/quantity-lookup',
  params: projectId,
  answer: quantityLookupAnswerSchema,
});

export const siteQuantityLookupEndpoint = endpoint({
  ...standing,
  permission: 'VIEW_SETUP',
  name: 'siteQuantityLookup',
  summary:
    'What one site’s phones ask for: its rows of the project’s quantity lookup, worked out from the setup as it stands; or, asked with a setup version, as its phones held them under that version, for the debris types phones are shown. No such version of its project: not found.',
  method: 'GET',
  path: '/sites/:siteId/quantity-lookup',
  params: siteId,
  query: z.strictObject({
    // A setup version of the site's project, as a field event records one: 1, 2, 3…
    setupVersion: z
      .string()
      .regex(/^[1-9][0-9]{0,8}$/)
      .optional(),
  }),
  answer: quantityLookupAnswerSchema,
});

// A read-only viewer's reads (ARCHITECTURE §5.5, §14; AC-02-74; AC-10-29, 30, 31; BACKLOG 2.4.5,
// C22; ADR-050, 169, 315, 434). **Open to a read-only viewer and to nobody else**: the back
// office reads the same records its own way. Every one is a GET: a viewer changes nothing. The
// API reads each as the database's read-only login with the caller stated as the viewer, so
// what comes back is what the database shows that viewer and no more.
export const viewerProjectsEndpoint = endpoint({
  name: 'viewerProjects',
  summary:
    'The projects the signed-in viewer is given, a page at a time, in the order they were entered: each by name, with its time zone and when it was closed.',
  access: 'SIGNED_IN',
  roles: viewerOnly,
  method: 'GET',
  path: '/viewer/projects',
  query: z.strictObject({
    // The last project of the page before: the answer's `next`.
    after: z.uuid().optional(),
    // How many at most: 50 where none is said.
    limit: z
      .string()
      .regex(/^([1-9][0-9]?|1[0-9]{2}|200)$/)
      .optional(),
  }),
  answer: viewerProjectsAnswerSchema,
});

// How many at most on a page of a viewer's read: 50 where none is said.
const viewerPage = z
  .string()
  .regex(/^([1-9][0-9]?|1[0-9]{2}|200)$/)
  .optional();
// A ticket's bare number as written: text, never parsed (ADR-062).
const viewedNumber = z.string().trim().min(1).max(40);

// A project's ROEs (ADR-435). A contractor user is shown none; the owner's name is there only
// for a viewer the firm lets see private citizens by name.
export const viewerRoesEndpoint = endpoint({
  name: 'viewerRoes',
  summary:
    'A project’s ROEs as the signed-in viewer is shown them, a page at a time, in the order they were made: each by number, with whether and when it was signed, and its owner’s name only where the firm lets this viewer see private citizens by name.',
  access: 'SIGNED_IN',
  roles: viewerOnly,
  method: 'GET',
  path: '/viewer/projects/:projectId/roes',
  params: projectId,
  query: z.strictObject({
    // The last ROE of the page before: the answer's `next`.
    after: z.uuid().optional(),
    limit: viewerPage,
  }),
  answer: viewerRoesAnswerSchema,
});

// A project's tickets of one workflow (ADR-435): each number series is its workflow's own, so a
// page is one workflow's, by number as text.
export const viewerTicketsEndpoint = endpoint({
  name: 'viewerTickets',
  summary:
    'One workflow’s tickets on a project as the signed-in viewer is shown them, a page at a time, by number: each with the statuses its field events hold and how many field events it has. A contractor user is shown its own contractor’s tickets.',
  access: 'SIGNED_IN',
  roles: viewerOnly,
  method: 'GET',
  path: '/viewer/projects/:projectId/tickets',
  params: projectId,
  query: z.strictObject({
    workflow: z.enum(workflows),
    // The last ticket number of the page before: the answer's `next`.
    after: viewedNumber.optional(),
    limit: viewerPage,
  }),
  answer: viewerTicketsAnswerSchema,
});

// One ticket, named as the worker groups one: its project, its workflow and its bare number
// (there is no ticket record and so no ticket id, ADR-236, 435). **A ticket the viewer isn't
// shown is answered exactly as one that doesn't exist**: 404 `NOT_FOUND` (AC-10-29).
export const viewerTicketEndpoint = endpoint({
  name: 'viewerTicket',
  summary:
    'One ticket as the signed-in viewer is shown it: its field events, the completed record the system concluded from them, and its priced lines, with a line’s rate and amount only where this viewer is shown the money. A ticket the viewer isn’t shown is not found.',
  access: 'SIGNED_IN',
  roles: viewerOnly,
  method: 'GET',
  path: '/viewer/projects/:projectId/tickets/:workflow/:ticketNumber',
  params: z.strictObject({
    projectId: z.uuid(),
    workflow: z.enum(workflows),
    ticketNumber: viewedNumber,
  }),
  answer: viewerTicketAnswerSchema,
});

// Each task that adds an endpoint names it here; the API's tests hold its routes to this list.
// Dispatch and phones, from the back office (ARCHITECTURE §7.4, §7.5; spec/parts/02; AC-02-21, 23,
// 59; AC-10-24, 27; BACKLOG 2.4.3, C47, C89; ADR-106, 134, 240, 428). **A dispatch change is open
// to an admin and to a manager/analyst who holds Dispatch now**; the firm's phones are read by
// the whole back office; the master passcode is an admin's alone to change.
const dispatch = { access: 'SIGNED_IN', roles: backOfficeRoles, permission: 'DISPATCH' } as const;

export const listPhonesEndpoint = endpoint({
  name: 'listPhones',
  summary:
    'The firm’s phones, a page at a time, in the order they were enrolled: those in service, or those taken out of it. Each says which version of the master passcode’s check it holds, when it was marked lost or retired and why, and which revoked its key.',
  access: 'SIGNED_IN',
  roles: backOfficeRoles,
  permission: 'VIEW_DISPATCH',
  method: 'GET',
  path: '/phones',
  query: z.strictObject({
    outOfService: z.enum(['true', 'false']).optional(),
    // The last phone of the page before: the answer's `next`.
    after: z.uuid().optional(),
    // How many at most: 50 where none is said.
    limit: z
      .string()
      .regex(/^([1-9][0-9]?|1[0-9]{2}|200)$/)
      .optional(),
  }),
  answer: phonesAnswerSchema,
});

// A phone is enrolled, once, online, under the firm's master passcode (ARCHITECTURE §7.1, §7.4,
// §7.5; AC-02-15, 18; AC-10-22, 44; ADR-240, 436…439). Nobody is signed in: the passcode is what
// opens it, and whoever holds it is not known, so the record names the master passcode itself.
// The phone sends what the dispatch board will call it and the public half of the key it made
// (base64 SubjectPublicKeyInfo, ECDSA P-256); its private half never leaves it. A passcode that
// isn't taken is refused by one code whatever the reason; every try, right or wrong, is a
// security event. The limits here only bound what is read.
export const enrolPhoneEndpoint = endpoint({
  name: 'enrolPhone',
  summary:
    'A phone is enrolled, once, under the firm’s master passcode: it sends its name on the dispatch board and the public half of the key it made. The answer is the phone’s id and the version of the master passcode it was enrolled under. Nobody is signed in. A passcode that isn’t taken is refused by one code; wrong tries in a row make the next wait longer, and at the policy’s count lock enrolment until an admin changes the passcode.',
  access: 'ANYBODY',
  method: 'POST',
  path: '/phones/enrolments',
  body: z.strictObject({
    name: z.string().trim().min(1).max(80),
    passcode: z.string().min(1).max(4096),
    publicKey: z.string().min(1).max(400),
  }),
  answer: phoneEnrolledAnswerSchema,
});

// A phone proves which phone it is before it syncs (ARCHITECTURE §7.4, §9 (1); AC-02-18,
// AC-05-03, AC-10-45, 46; ADR-436, 437, 440). It asks for a challenge by its id, signs it with
// the device key it made at enrolment (ECDSA P-256 with SHA-256, over the domain's label, a line
// break and the challenge as sent; the signature as base64 DER), and sends both back. Nobody is
// signed in for either call, and no monitor need be there. A challenge is the server's own, good
// for the policy's two minutes and once: a recorded answer sent again proves nothing. The
// server keeps nothing of a challenge it has made, and makes one for any id, so asking tells a
// stranger nothing of which phones the firm has. A proof that isn't one is refused by one code.
// A phone taken out of service still proves itself (its work is received and flagged, ADR-134);
// one whose key its turn-in revoked does not. **One whose key the firm's time revoked** (ADR-530)
// proves itself with the master passcode beside its signature, checked by the one check every
// act under it shares, and is given a token that opens its sync and its turn-in alone; with no
// passcode it is told `MASTER_PASSCODE_NEEDED`, and only once its signature is its own. The
// limits here only bound what is read.
const phoneNamed = z.strictObject({ deviceId: z.uuid() });

export const challengePhoneEndpoint = endpoint({
  name: 'challengePhone',
  summary:
    'Makes a challenge for a phone to sign with its device key. Nobody is signed in; one is made for any id, and the server keeps nothing of it. It may be sent back signed for the policy’s time, once.',
  access: 'ANYBODY',
  method: 'POST',
  path: '/phones/:deviceId/challenges',
  params: phoneNamed,
  answer: phoneChallengeAnswerSchema,
});

export const provePhoneEndpoint = endpoint({
  name: 'provePhone',
  summary:
    'A phone proves itself: it sends back the challenge it was made and its signature over it. The answer is a token for that phone, good for the policy’s minutes, which the calls of its sync carry as Authorization: Bearer. A challenge is good once. A proof that isn’t one is refused by one code, whatever the reason; a phone taken out of service still proves itself, one whose key its turn-in revoked does not. Whoever holds the master passcode may send it beside the signature: the master user is then at the phone, and its token opens what a proof by the key opens and counts as somebody signed in on the phone for what it sends. A phone whose key the firm’s time revoked proves itself only so, and its token opens only its sync, its photographs’ files, its reports, its turn-in and its read of itself; without the passcode it is told the passcode is needed. Each passcode taken is a security event; one that isn’t is refused by the proof’s one code, and counts as a wrong try as it does when a phone is enrolled.',
  access: 'ANYBODY',
  method: 'POST',
  path: '/phones/:deviceId/proofs',
  params: phoneNamed,
  body: z.strictObject({
    challenge: z.string().min(1).max(400),
    signature: z.string().min(1).max(400),
    passcode: z.string().min(1).max(4096).optional(),
  }),
  answer: phoneProvenAnswerSchema,
});

// The phone a token is of (ADR-440): the first call open to a proven phone, and how a phone
// learns that it was taken out of service or that the master passcode has changed.
export const provenPhoneEndpoint = endpoint({
  name: 'provenPhone',
  summary:
    'The phone a proof’s token is of, as the server has it now: its name, whether it is in service, the version of the master passcode whose check it holds and the version in force. Open to a phone that has proved itself, by its token.',
  access: 'PROVEN_PHONE',
  outOfServiceToo: true,
  method: 'GET',
  path: '/phones/current',
  answer: provenPhoneAnswerSchema,
});

// A field monitor is created on a phone, online, under the firm's master passcode (ARCHITECTURE
// §7.0, §7.5; AC-02-07; ADR-105, 120, 441, 442). The call is a proven phone's, and carries the
// passcode: whoever holds it is not known, so the record names the master passcode itself, on
// that phone. The database issues the Monitor ID, which is the monitor's username. Their
// password is the firm's practice (ADR-105): no rule but that it isn't empty. A passcode that
// isn't taken is refused by one code whatever the reason, and counts as a wrong try at
// enrolment does. The limits here only bound what is read.
export const createMonitorOnPhoneEndpoint = endpoint({
  name: 'createMonitorOnPhone',
  summary:
    'A field monitor is created on an enrolled phone, under the firm’s master passcode: their name, their password and, if the firm keeps one, their phone number. The answer is the Monitor ID the system issued, which is their username. Open to a phone in service that has proved itself, by its token. A passcode that isn’t taken is refused by one code; wrong tries count as they do when a phone is enrolled.',
  access: 'PROVEN_PHONE',
  method: 'POST',
  path: '/phones/current/monitors',
  body: z.strictObject({
    name: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(4096),
    phone: z.string().trim().min(1).max(40).optional(),
    passcode: z.string().min(1).max(4096),
  }),
  answer: monitorCreatedAnswerSchema,
});

// A monitor signs in on a phone, online (ARCHITECTURE §6, Device sessions; §7.2; AC-02-39;
// ADR-105, 120, 441, 443). The call is a proven phone's, in service, and carries the monitor's
// ID and password: their ID and password open nothing else, and a back-office sign-in refuses
// them. What it gives is the monitor's session token, which the phone's calls carry in the header
// below beside the phone's own token, never as a cookie. A sign-in lasts the policy's hours and
// doesn't end for quiet; it ends when the monitor signs out, another signs in on the phone, their
// password is set anew, they are archived, or the phone's key is revoked. Wrong tries follow
// sign-in's rule and numbers, and whatever is wrong is refused by one code. The limits here only
// bound what is read.
export const monitorSessionHeader = 'x-adms-monitor-session';

export const signInOnPhoneEndpoint = endpoint({
  name: 'signInOnPhone',
  summary:
    'A field monitor signs in on an enrolled phone, online, with their Monitor ID and password. The answer is their session’s token, which the phone’s calls carry in the x-adms-monitor-session header beside the phone’s own token, how long it lasts, and the assignment the phone takes: theirs for the day, by its project’s own time zone, or none with the reason (none that day; several that day and nothing to say which is this phone’s). Nobody enters the master passcode and nobody picks a project. Open to a phone in service that has proved itself, by its token. Whatever is wrong is refused by one code; wrong tries in a row make the next wait longer, and at the policy’s count lock the login until an admin sets the password anew.',
  access: 'PROVEN_PHONE',
  method: 'POST',
  path: '/phones/current/sign-ins',
  body: z.strictObject({
    monitorNumber: z.string().trim().min(1).max(20),
    password: z.string().min(1).max(4096),
  }),
  answer: monitorSignedInAnswerSchema,
});

// A session opened on a phone under the firm's master passcode, with a connection (ARCHITECTURE
// §7.2, §7.3, §7.5; AC-02-42; ADR-095, 106, 120, 456 (5)(d), 462). The call is a proven phone's,
// in service, and carries the passcode, checked by the one check every act under it shares: a
// wrong one counts as at enrolment and is refused by the same one code. It is opened for a
// monitor in service, named by their id as the phone's lists give it, one of two ways: as the
// phone's monitor, in place of their own password; or the temporary session for a monitor
// picked from the roster when a phone changes hands, which also ends with the project's day.
// It is no sign-in of that monitor's: whoever holds the passcode is not known, so the session
// is marked and the record names the master passcode itself, on that phone. Its token is sent
// as a monitor's own is. The limits here only bound what is read.
export const openPasscodeSessionOnPhoneEndpoint = endpoint({
  name: 'openPasscodeSessionOnPhone',
  summary:
    'A session is opened on an enrolled phone under the firm’s master passcode, for a monitor in service: as the phone’s monitor, or the temporary session for a monitor picked from the roster. The answer is what a monitor’s own sign-in is answered (the session’s token for the x-adms-monitor-session header, how long it lasts, the assignment the phone takes or why none) and which way it was opened. The session is marked as the master passcode’s and is no sign-in of the monitor’s. Neither lasts longer than a monitor’s own sign-in; the temporary one also ends at the end of the day of the project whose assignment the phone takes, by that project’s time zone. Any other session on the phone ends. Open to a phone in service that has proved itself, by its token. A passcode that isn’t taken is refused by one code; wrong tries count as they do when a phone is enrolled.',
  access: 'PROVEN_PHONE',
  method: 'POST',
  path: '/phones/current/passcode-sessions',
  body: z.strictObject({
    personId: z.uuid(),
    kind: z.enum(masterPasscodeSessions),
    passcode: z.string().min(1).max(4096),
  }),
  answer: passcodeSessionOpenedAnswerSchema,
});

// A sign-in made on the phone with no connection, reported once it has one (ARCHITECTURE §7.2,
// §7.3; ADR-105, 454, 462, 531): a monitor's own password checked against the phone's login list,
// or a session opened under the master passcode. The phone proves it with what only what was
// typed could make (the domain's `OfflineSignInRules`), and the server checks that proof itself
// against what it keeps: it never takes the phone's word for who signed in. Taken, it is a
// session as an online sign-in is, from when it was made. Reported first, before anything the
// phone sends while that monitor is signed in.
export const takeOfflineSignInOnPhoneEndpoint = endpoint({
  name: 'takeOfflineSignInOnPhone',
  summary:
    'A phone reports a sign-in made on it with no connection, once it has one: the monitor’s own password checked against its login list, or a session opened under the master passcode as the phone’s monitor or the temporary one. It says who, how, when by its own clock with the offset, the version of the master passcode whose check it held (under the passcode only), and its proof: an HMAC-SHA256 over what the sign-in says, keyed by the first slow hash of what was typed, which the server checks against the monitor’s offline seed or its own hash of the passcode in force. Taken, the answer is a session’s token for the x-adms-monitor-session header and how long it has left, counted from the sign-in by the firm’s hours (a temporary session also ends with the project’s day); any other session on the phone ends, and it is a security event. Refused by one code, and written as a security event the back office is shown, where the proof isn’t one, the password was set anew or the passcode changed since, the monitor is not in service, the session has already run out, or the server knows of a sign-in or sign-out on the phone after it: the phone keeps everything and its monitor signs in online. The same sign-in reported again by the phone gives a new token and ends the one before. Open to a phone in service that has proved itself, by its token.',
  access: 'PROVEN_PHONE',
  method: 'POST',
  path: '/phones/current/offline-sign-ins',
  body: offlineSignInReportSchema,
  answer: offlineSignInTakenAnswerSchema,
});

// A use of the firm's master passcode a phone logged with no connection, reported when it has
// one (ARCHITECTURE §7's notes, §7.3, §7.5, §10; AC-02-23, 42, 46; BACKLOG 2.5.4, C122…C125;
// ADR-106, 456 (3), (5)(e), 462, 464; REQ-202b). Only what no other report carries: a setup, a
// site move and a switch to a monitor with no assignment arrive as an unplanned assignment.
// Here: the phone passed to a monitor who has their own assignment; a session opened on the
// phone as its monitor, or the temporary one; its sign-in screen unlocked after too many wrong
// tries at it (ADR-576); and the passcode typed wrong. The phone checked
// the passcode against its own check; the server is not sent it, takes the phone's word, the
// phone having proved itself with its device key, and counts no try: a wrong try on a phone
// never moves the server's own count or its lock. The id is the phone's own, so the same
// report sent again is answered "already saved" and kept once. Somebody is signed in on the
// phone, as for all it sends (ADR-531).
export const reportPasscodeUseEndpoint = endpoint({
  name: 'reportPasscodeUse',
  summary:
    'A phone reports a use of the firm’s master passcode it logged with no connection: the phone passed to a monitor who has their own assignment, a session opened on it as the phone’s monitor or the temporary session for a monitor picked from the roster, its sign-in screen unlocked after too many wrong tries at it, or the passcode typed wrong. It says when by the phone’s own clock, with the clock’s offset, and for which monitor; an unlock and a wrong try name nobody. The id is the phone’s own: the same report sent again is answered as already saved and kept once. It is kept as the phone reports it, for a monitor archived since and from a phone out of service too, and is not saved only where it names somebody who is no monitor or its id is another record’s. The passcode itself is never sent: the phone checked it, and a wrong try reported here does not count toward the lock on the server’s own check. Each one saved is a security event at the phone’s own time: a phone switched and a use of the master passcode; a use that says which way a session was opened; a use for the unlock; or a failed try. A switch or a session saved ends what anybody else had open on that phone before it, by the phone’s clock. A setup, a site move and a switch to a monitor who has no assignment are reported as an unplanned assignment instead. Open to a phone that has proved itself, by its token, with somebody signed in on it: the monitor, by their session’s token in the x-adms-monitor-session header, or the master user, by the master passcode sent beside the phone’s proof. A phone taken out of service sends it too.',
  access: 'PHONE_IN_USE',
  outOfServiceToo: true,
  method: 'POST',
  path: '/phones/current/passcode-uses',
  body: passcodeUseReportSchema,
  answer: passcodeUseAnswerSchema,
});

export const signOutOnPhoneEndpoint = endpoint({
  name: 'signOutOnPhone',
  summary:
    'The monitor signed in on the phone signs out: their session ends on the server. Open to a proven phone with its monitor’s session token.',
  access: 'MONITOR_ON_PHONE',
  method: 'POST',
  path: '/phones/current/sign-outs',
  answer: signedOutAnswerSchema,
});

export const phoneMonitorEndpoint = endpoint({
  name: 'phoneMonitor',
  summary:
    'The monitor signed in on the phone, as the server has them now, and how long their sign-in has left. Open to a proven phone with its monitor’s session token.',
  access: 'MONITOR_ON_PHONE',
  method: 'GET',
  path: '/phones/current/monitor',
  answer: phoneMonitorAnswerSchema,
});

export const phoneListsEndpoint = endpoint({
  name: 'phoneLists',
  summary:
    'The lists a phone holds for its work, asked for at any time it has a connection: the assignment the phone takes now for the monitor signed in (the sign-in’s own rule, asked again) and that assignment’s lists, or neither with the reason. The lists are the blocks of numbers the phone holds, the forms’ debris types without those hidden on phones, the field tags, the reasons for a typed number, the unit rate pay items the assignment names, what its incidents and surveys pick from, and the setup version they are, which every field event the phone makes records. Never a rate, a rule, a transaction or a load’s pay item. Nothing is written but a new setup version, made when what the project’s phones are shown differs from the newest one. Open to a proven phone with its monitor’s session token.',
  access: 'MONITOR_ON_PHONE',
  method: 'GET',
  path: '/phones/current/lists',
  answer: phoneListsAnswerSchema,
});

export const phoneLoginListEndpoint = endpoint({
  name: 'phoneLoginList',
  summary:
    'The login list and the master passcode’s check a phone holds for signing in with no connection, asked for at any time it has one. The phone says what it holds: the version of the master passcode whose check it has, and a mark for each monitor’s entry. The answer is the version in force, with its check where the phone holds another or none; and the login list of the project of the assignment the phone takes now for the monitor signed in: that monitor and every monitor in service with an assignment that stands on the project for its today or later, each with the mark of their entry, and the entry itself where the phone didn’t send that mark. An entry is a slow hash made for this phone alone, kept nowhere on the server; a password set anew makes its mark good no more. One call makes a bounded number of entries and says there are more. With no assignment there is no list and the phone keeps what it holds. Never a password or a hash the server checks a sign-in against. Nothing is written but which version of the master passcode’s check the phone was sent. Open to a proven phone with its monitor’s session token.',
  access: 'MONITOR_ON_PHONE',
  method: 'POST',
  path: '/phones/current/login-list',
  body: z.strictObject({
    masterPasscodeVersion: z.number().int().min(1).max(2_147_483_647).nullable(),
    entries: z
      .array(z.strictObject({ monitorId: z.uuid(), mark: z.string().min(1).max(100) }))
      .max(5000),
  }),
  answer: phoneLoginListAnswerSchema,
});

// A point on the earth, each part an exact decimal: no database stands behind a lookup to say
// how far a coordinate may go, so the request does.
const onTheEarth = (most: number) =>
  coordinate.refine((value) => Math.abs(Number(value)) <= most, 'not on the earth');

export const phoneAddressLookupEndpoint = endpoint({
  name: 'phoneAddressLookup',
  summary:
    'The address of a GPS point, for a collection’s "Look up address": the street number and name our own address server finds there, or none with the reason (the map has no street there; the address server gave no answer in time). The monitor then types it, as with no connection. The phone asks the API and the API asks the address server, which no phone and no browser reaches. The point is sent in the body, never in the address of the request; neither the point nor the address is logged or kept. Nothing is written. Open to a proven phone with its monitor’s session token.',
  access: 'MONITOR_ON_PHONE',
  method: 'POST',
  path: '/phones/current/address-lookups',
  body: z.strictObject({ latitude: onTheEarth(90), longitude: onTheEarth(180) }),
  answer: phoneAddressLookupAnswerSchema,
});

// A phone renamed, and a found one put back in service (ADR-530; C102). A phone whose key is
// revoked stays as it is: it is wiped and enrolled anew.
export const renamePhoneEndpoint = endpoint({
  name: 'renamePhone',
  summary:
    'A phone is given another name, as the dispatch board calls it. Nothing else of it changes.',
  ...dispatch,
  method: 'PATCH',
  path: '/phones/:deviceId',
  params: z.strictObject({ deviceId: z.uuid() }),
  body: z.strictObject({ name: z.string().trim().min(1).max(80) }),
  answer: savedAnswer(phoneRecordSchema),
});

export const removePhoneEndpoint = endpoint({
  name: 'removePhone',
  summary:
    'A phone is taken out of service, as lost or retired, from this moment or from a removal time stated by hand (never after now, never before it was enrolled), with a reason from the firm’s list where one is picked. A phone marked lost may then be marked retired, its removal time kept unless one is stated. Its record is kept; what it made later is received and flagged, never refused. Each mark starts the firm’s time again, after which the worker revokes its key. Refused for a phone already out of service otherwise, and for one whose key is revoked.',
  ...dispatch,
  method: 'POST',
  path: '/phones/:deviceId/removals',
  params: z.strictObject({ deviceId: z.uuid() }),
  body: z.strictObject({
    status: z.enum(phoneRemovals),
    // The removal time stated by hand, where it isn't now.
    outOfServiceAt: z.iso.datetime().optional(),
    // From the firm's reasons list, a value offered for a phone's removal.
    reasonId: z.uuid().optional(),
    // Why, in the person's own words: kept beside the change in the audit log.
    note: z.string().trim().min(1).max(500).optional(),
  }),
  answer: savedAnswer(phoneRecordSchema),
});

export const returnPhoneEndpoint = endpoint({
  name: 'returnPhone',
  summary:
    'A phone found again is put back in service, with a note saying why. Refused for a phone in service, and for one whose key is revoked: that one is wiped and enrolled anew.',
  ...dispatch,
  method: 'POST',
  path: '/phones/:deviceId/returns',
  params: z.strictObject({ deviceId: z.uuid() }),
  body: z.strictObject({ note: z.string().trim().min(1).max(500) }),
  answer: savedAnswer(phoneRecordSchema),
});

// The firm's own settings (REQ-214, 215; ARCHITECTURE §6, §7.4; ADR-520, 530): read by an admin
// or a manager/analyst holding Setup. The hours a lost phone keeps its key are changed by either;
// whether read-only viewers must use two-step sign-in, by an admin alone. Each change audited.
export const firmSettingsEndpoint = endpoint({
  name: 'firmSettings',
  summary:
    'The firm’s own settings: how many hours a phone marked lost or retired keeps its key (or off), whether read-only viewers must use two-step sign-in, and how many hours a monitor’s sign-in on a phone lasts.',
  access: 'SIGNED_IN',
  roles: backOfficeRoles,
  permission: 'SETUP',
  method: 'GET',
  path: '/firm-settings',
  answer: firmSettingsAnswerSchema,
});

export const changePhoneKeyHoursEndpoint = endpoint({
  name: 'changePhoneKeyHours',
  summary:
    'Sets how many whole hours (1 to 8,760) a phone marked lost or retired keeps its key, counted from its last mark, before the worker revokes it; null switches it off. A phone revoked so may still sync and be turned in under the master passcode. Audited.',
  access: 'SIGNED_IN',
  roles: backOfficeRoles,
  permission: 'SETUP',
  method: 'PATCH',
  path: '/firm-settings/phone-key',
  body: z.strictObject({
    hours: z.number().int().min(1).max(8760).nullable(),
    note: z.string().trim().min(1).max(500).optional(),
  }),
  answer: firmSettingsAnswerSchema,
});

export const changeViewerTwoStepEndpoint = endpoint({
  name: 'changeViewerTwoStep',
  summary:
    'An admin sets whether read-only viewers must use two-step sign-in. Once it is required, a viewer with no authenticator sets one up before anything else, at their very next request. Turning it off clears nobody’s. Audited.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'PATCH',
  path: '/firm-settings/viewer-two-step',
  body: z.strictObject({
    required: z.boolean(),
    note: z.string().trim().min(1).max(500).optional(),
  }),
  answer: firmSettingsAnswerSchema,
});

export const changeMonitorSessionHoursEndpoint = endpoint({
  name: 'changeMonitorSessionHours',
  summary:
    'An admin sets how many whole hours (1 to 24) a monitor’s sign-in on a phone lasts, online or made with no connection, and a session under the master passcode at most. It applies to sign-ins made from then on; a session already open keeps its end. Audited.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'PATCH',
  path: '/firm-settings/monitor-sessions',
  body: z.strictObject({
    hours: z.number().int().min(1).max(24),
    note: z.string().trim().min(1).max(500).optional(),
  }),
  answer: firmSettingsAnswerSchema,
});

// The firm's one master passcode (ADR-106). A change is a new version: no earlier one is edited
// or removed, and each phone's check moves to it at its next sync. Whoever changes it gives
// their own password again (ASVS 5.0 7.5.1), and every admin is told by mail where the firm
// has any (ASVS 6.3.7).
export const changeMasterPasscodeEndpoint = endpoint({
  name: 'changeMasterPasscode',
  summary:
    'An admin changes the firm’s master passcode, giving their own password again. A new version is kept, as a slow hash only; each phone’s check moves to it at its next sync. Refused for a passcode shorter or longer than the policy allows (8 and 128 characters as shipped), or known from breaches.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/master-passcode/versions',
  body: z.strictObject({
    currentPassword: z.string().min(1).max(4096),
    passcode: z.string().min(1).max(4096),
  }),
  answer: masterPasscodeAnswerSchema,
});

// A day's assignments, on the dispatch board (ARCHITECTURE §7; spec/parts/02 step 4; AC-02-24…32;
// BACKLOG 2.4.3, C102; ADR-240, 286, 308, 429). One is written for a person, a day and a project,
// and those three never change: it is withdrawn and written anew. What is stated of its work
// (the kinds of field event, certifying, the forms, the unit rate pay items, each list stated
// whole), its site and its phone may change while it stands. Nothing stops a second one for a
// person or a phone on a day (AC-02-29). The board is read by the whole back office.
const assignmentId = z.strictObject({ assignmentId: z.uuid() });

export const listAssignmentsEndpoint = endpoint({
  name: 'listAssignments',
  summary:
    'One project’s dispatch board for one day, a page at a time, in the order the assignments were written: those that stand, or the withdrawn ones. One made on a phone under the master passcode is among them, marked unplanned.',
  access: 'SIGNED_IN',
  roles: backOfficeRoles,
  permission: 'VIEW_DISPATCH',
  method: 'GET',
  path: '/projects/:projectId/assignments',
  params: projectId,
  query: z.strictObject({
    workDate: day,
    withdrawn: z.enum(['true', 'false']).optional(),
    // The last assignment of the page before: the answer's `next`.
    after: z.uuid().optional(),
    // How many at most: 50 where none is said.
    limit: z
      .string()
      .regex(/^([1-9][0-9]?|1[0-9]{2}|200)$/)
      .optional(),
  }),
  answer: assignmentsAnswerSchema,
});

export const writeAssignmentEndpoint = endpoint({
  name: 'writeAssignment',
  summary:
    'An assignment is written on a project’s board: a person, a day, their work, one site where the work is at one, optionally a phone. Planned, and it says who wrote it. Refused for a read-only viewer or an archived person, a phone out of service, and a pay item that is no unit rate pay item.',
  ...dispatch,
  method: 'POST',
  path: '/projects/:projectId/assignments',
  params: projectId,
  body: z.strictObject({ personId: z.uuid(), workDate: day, ...assignedWork }),
  answer: savedAnswer(assignmentRecordSchema),
});

export const changeAssignmentEndpoint = endpoint({
  name: 'changeAssignment',
  summary:
    'An assignment’s work, site or phone is changed; only what is stated changes, and a list is stated whole. Its person, day and project never change. Refused for a withdrawn one and for one made on a phone.',
  ...dispatch,
  method: 'PATCH',
  path: '/assignments/:assignmentId',
  params: assignmentId,
  body: z.strictObject(assignedWork).partial().refine(stated),
  answer: savedAnswer(assignmentRecordSchema),
});

export const withdrawAssignmentEndpoint = endpoint({
  name: 'withdrawAssignment',
  summary:
    'An assignment is withdrawn from the board, from this moment, with a note if the dispatcher writes one. It is kept, and so is everything recorded under it. Refused for one already withdrawn and for one made on a phone.',
  ...dispatch,
  method: 'POST',
  path: '/assignments/:assignmentId/withdrawals',
  params: assignmentId,
  // No body: withdrawn with no note.
  body: z.strictObject({ note: z.string().trim().min(1).max(500).optional() }).optional(),
  answer: savedAnswer(assignmentRecordSchema),
});

export const reinstateAssignmentEndpoint = endpoint({
  name: 'reinstateAssignment',
  summary:
    'A withdrawn assignment is put back on the board, as it was; its note is cleared (the audit keeps it). Refused for one that stands, one made on a phone, an archived person and a phone out of service.',
  ...dispatch,
  method: 'POST',
  path: '/assignments/:assignmentId/reinstatements',
  params: assignmentId,
  answer: savedAnswer(assignmentRecordSchema),
});

// What a phone being set up under the firm's master passcode picks from, with a connection
// (ARCHITECTURE §7.1 steps 1, 2; §7.5; adms-field-app §4A.0 (5); AC-02-38; ADR-106, 240, 462
// (4)(f), 463). OWASP ASVS 5.0 8.2.1, 8.2.2, 14.2.1, 14.2.6, 16.3.1; API Security Top 10 (2023)
// API1…API5. Nobody is signed in yet, so the call is a proven phone's, in service, **and
// carries the passcode**, checked by the one check every act under it shares: a phone's proof
// alone (a lost phone keeps its key until it is revoked) would list the firm's projects and
// monitors. A read, but a POST: the passcode is in the body, never in a path or a query. Each
// read is a use of the passcode in the security log. The limits here only bound what is read.
export const phoneSetupChoicesEndpoint = endpoint({
  name: 'phoneSetupChoices',
  summary:
    'What a phone being set up under the firm’s master passcode picks from, with a connection and nobody signed in: the firm’s open projects; the monitors in service by name and Monitor ID, a thousand a call at most (the answer says where to ask on from); and, where an open project is named, that project’s live sites and its unit rate pay items in service, as a phone’s lists show them. A project that is closed or is none is answered no lists. Never a rate, a rule or a load’s pay item; never a password or a phone number. Nothing is written but the use of the passcode, a security event naming the phone. Open to a phone in service that has proved itself, by its token. A passcode that isn’t taken is refused by one code; wrong tries count as they do when a phone is enrolled.',
  access: 'PROVEN_PHONE',
  method: 'POST',
  path: '/phones/current/setup-choices',
  body: z.strictObject({
    passcode: z.string().min(1).max(4096),
    // The project picked, for its sites and unit rate pay items; null before one is.
    projectId: z.uuid().nullable(),
    // The last monitor of the answer before: its `moreMonitorsAfter`. Null for the first.
    monitorsAfter: z.uuid().nullable(),
  }),
  answer: phoneSetupChoicesAnswerSchema,
});

// An unplanned assignment, reported by the phone it was made on (ARCHITECTURE §7's note, §7.5,
// §9 (3), (4), §10; AC-02-38, AC-05-40; BACKLOG 2.5.4, C46; ADR-240, 438, 456, 457). A monitor
// had no assignment, and whoever holds the master passcode set the phone up on the spot: a
// project, their work, one site, and the monitor from the phone's login list, with or without
// a connection. The phone checked the passcode against its own check; the server is not sent
// it and takes the phone's word, the phone having proved itself with its device key. The id is
// the phone's own, so the same report sent again is answered "already saved" and kept once. The
// day is the day the phone's clock said, in the project's time zone. Somebody is signed in on the
// phone, as for all it sends (ADR-531): the master user who set it up, at the least.
// **A site move and a monitor switch are reported the same way** (AC-02-46, 47; ADR-456 (5),
// 458): the phone moved to another of its project's sites is set up anew there, a new
// unplanned assignment, and the earlier one stands; the phone passed to a monitor who has no
// assignment it could take is a new one for them, made at a switch. The monitor's sign-in on
// that phone then takes the one made on it last.
// The limits here only bound what is read.
export const reportUnplannedAssignmentEndpoint = endpoint({
  name: 'reportUnplannedAssignment',
  summary:
    'A phone reports an unplanned assignment made on it under the firm’s master passcode, when its monitor had none: the project, the monitor, their work (the kinds of field event, certifying, the forms, the unit rate pay items), one site where the work is at one, and when it was made by the phone’s own clock, with the clock’s offset. The id is the phone’s own: the same report sent again is answered as already saved and kept once. It is kept as the phone reports it, marked unplanned on the dispatch board and never flagged, for a phone out of service too; its day is the day the phone’s clock said, in the project’s time zone. It is not saved only where something it names is no record of the kind it must be, or its id is another record’s. The passcode itself is never sent: the phone checked it. It says what it was made at: the phone set up (a phone moved to another of its project’s sites is set up anew there, and the earlier assignment stands with everything recorded under it), or the phone passed to another monitor, who had no assignment it could take. Each one saved is two security events at the phone’s own time: a phone set up or a phone switched, and a use of the master passcode. Where several of a monitor’s assignments for a day name one phone, their sign-in on it takes the one made on it last. Open to a phone that has proved itself, by its token, with somebody signed in on it: the monitor, by their session’s token in the x-adms-monitor-session header, or the master user, by the master passcode sent beside the phone’s proof. A phone taken out of service sends it too.',
  access: 'PHONE_IN_USE',
  outOfServiceToo: true,
  method: 'POST',
  path: '/phones/current/unplanned-assignments',
  body: unplannedAssignmentReportSchema,
  answer: unplannedAssignmentAnswerSchema,
});

// One sync, whole (ARCHITECTURE §9, §10; spec/parts/05-sync.md steps 2…8; AC-05-03, 04, 15, 16,
// 20, 45…47; AC-10-35, 46, 51; BACKLOG 2.6.2, C64, C69, C126…C131; ADR-022, 052, 065, 100, 466…472;
// REQ-016, 203). The phone has proved itself, with somebody signed in on it (ADR-531); it never
// says which phone it is, and what it is given is decided by its standing, read once (ADR-531:
// a phone out of service only sends). The body and the answer are `sync.ts`'s. Nothing is refused over eligibility, and nothing is reconciled while
// the phone waits.
export const syncPhoneEndpoint = endpoint({
  name: 'syncPhone',
  summary:
    'A phone syncs: it sends its clock, the unplanned assignments made on it, the uses of the master passcode it logged, its records (field events, scale receipts, incidents, drop-off logs, surveys, ROEs and certifications, each under the id the phone made for it, 200 at most) and the last number it used of each series. The server keeps the sync with both clocks and their difference, then reads each thing in that order and gives each its own answer, in the order sent. A record is saved; already saved, where it was sent before (never stored twice, and never taken for a duplicate ticket number); kept in quarantine, not saved, where another record holds its number, with the reason and the record that holds it; or not saved, where it can’t be read, names something the server doesn’t have, was made under an assignment that was not saved, or is a certification its own rules refuse: what was sent is then held on the server exactly as sent, for a person, and the answer says so. One record never stops the others. Nothing is refused over eligibility, and no answer carries a status, a flag or money: reconciliation is queued for what arrived and never waited for. For each series reported the answer lists the blocks of numbers the phone holds now, topped up to a full block where the project has such a series and the phone is in service. A phone in service is brought the master passcode’s version in force, with its check where the phone holds another, and the setup version of the project whose lists it holds; a phone out of service, or proven with the passcode because the firm’s time revoked its key, is given no numbers and brought nothing. A phone with more than one sync’s worth sends another. Open to a phone that has proved itself, by its token, with somebody signed in on it: the monitor, by their session’s token in the x-adms-monitor-session header, or the master user, by the master passcode sent beside the phone’s proof. A phone taken out of service sends it too.',
  access: 'PHONE_IN_USE',
  outOfServiceToo: true,
  method: 'POST',
  path: '/phones/current/syncs',
  body: syncSentSchema,
  answer: syncAnsweredSchema,
});

// A phone turned in: "Sync and turn in" under the firm's master passcode, with or without its
// monitor (ARCHITECTURE §7.4, §7.5, §8; AC-02-58, 60, 61; AC-05-56; AC-10-46; BACKLOG 2.6.5, C47,
// C64, C126, C139; ADR-065, 096, 134, 468, 488; REQ-202a, 202b, 209). The body and the answer are
// `turn-in.ts`'s. The phone has synced and sent its files first; it is told to wipe only when the
// server has everything it still holds, and its key is revoked in the same piece of work. The
// passcode is checked by the one check every act under it shares. The limits here only bound
// what is read.
export const turnInPhoneEndpoint = endpoint({
  name: 'turnInPhone',
  summary:
    'A phone is turned in ("Sync and turn in") under the firm’s master passcode, after it has synced every queue and sent every photograph’s file. It sends the passcode, everything it still holds by the ids it made (its unplanned assignments, the uses of the master passcode it logged, its records, its photographs) and by fingerprint what it sent with no id the server could read, and the last number it used of each series it holds numbers of. Only when the server has all of it from that phone (a record saved, kept in quarantine, or held for a person; a photograph saved with every file kept) is the phone turned in: the unused rest of each series it reported is handed back for the next phone, and a series it doesn’t report, or every block of a phone marked lost, is retired whole; a phone in service is taken out of service as retired; its sessions end; its key is revoked, so it proves nothing again; and the answer tells it to wipe. Otherwise nothing is changed and nothing is wiped, and the answer names what the server doesn’t have. A phone out of service is turned in the same way. Each use of the passcode is a security event, and a turn-in another. Open to a phone that has proved itself, by its token; nobody need be signed in. A passcode that isn’t taken is refused by one code; wrong tries count as they do when a phone is enrolled.',
  access: 'PROVEN_PHONE',
  outOfServiceToo: true,
  method: 'POST',
  path: '/phones/current/turn-ins',
  body: turnInSentSchema,
  answer: turnInAnswerSchema,
});

// A photograph's files, sent by the phone that took it after its record is saved: **the media
// endpoint, the one endpoint that takes a file** (ARCHITECTURE §6 "Uploads", §9 (2), (5), §11;
// spec/parts/05-sync.md; AC-04-77, AC-05-09, AC-10-47…49; spec/THREAT-MODEL.md T-25; BACKLOG
// 2.6.4, C84 (12), C86, C137; ADR-101, 401, 480…482; REQ-203). Named by the photograph's own id
// and which file, never by a place: the server made the place with the record. Resumable as the
// tus protocol is (tus.io 1.0, core): a part goes at the offset where the last one ended, and an
// interrupted upload goes on from the last part the server took. The limits here only bound
// what is read; the policy's are smaller.
const photoFileNamed = z.strictObject({
  photoId: z.uuid(),
  // The photograph itself, or the depth file beside it.
  file: z.enum(photoFiles),
});

export const photoFileEndpoint = endpoint({
  name: 'photoFile',
  summary:
    'Where a photograph’s file stands: kept (nothing more to send), or how many of its bytes the server has taken, of a file how long, so the phone sends the rest from there (none, where it holds none). The photograph is named by its own id, and the file is the photograph itself or the depth file beside it; only the phone that took it may ask, once its record is saved. Open to a phone that has proved itself, by its token, with somebody signed in on it: the monitor, by their session’s token in the x-adms-monitor-session header, or the master user, by the master passcode sent beside the phone’s proof. A phone taken out of service sends it too.',
  access: 'PHONE_IN_USE',
  outOfServiceToo: true,
  method: 'GET',
  path: '/phones/current/photos/:photoId/files/:file',
  params: photoFileNamed,
  answer: photoFileAnswerSchema,
});

export const sendPhotoFilePartEndpoint = endpoint({
  name: 'sendPhotoFilePart',
  summary:
    'A part of a photograph’s file, sent by the phone that took it, once its record is saved: the bytes in the body, the offset they go at and the whole file’s length in the query. Taken only where it goes on from the last part the server took, or starts the file; otherwise the answer says where to go on from. The file is at most the policy’s size and a part at most the policy’s; its first part is told to be an image by its own first bytes (JPEG, HEIC or HEIF, PNG, TIFF), or refused. When the last part arrives the server reads the whole file’s SHA-256: the one the phone gave in the photograph’s record (or the depth file’s) and the file is kept, once, where the server placed it, never overwritten, and its upload time written; any other, and the file is set aside on the server for a person, never kept as the photograph’s, and the phone sends its file again from the first byte. A file kept already is answered kept, and nothing changes. Open to a phone that has proved itself, by its token, with somebody signed in on it: the monitor, by their session’s token in the x-adms-monitor-session header, or the master user, by the master passcode sent beside the phone’s proof. A phone taken out of service sends it too.',
  access: 'PHONE_IN_USE',
  outOfServiceToo: true,
  method: 'PATCH',
  path: '/phones/current/photos/:photoId/files/:file',
  params: photoFileNamed,
  query: z.strictObject({
    offset: z.string().regex(/^(0|[1-9][0-9]{0,9})$/),
    length: z.string().regex(/^[1-9][0-9]{0,9}$/),
  }),
  file: true,
  answer: photoFileAnswerSchema,
});

// Review's marks (spec/parts/08-review-and-corrections.md steps 5…7; spec/parts/09, invoicing;
// AC-02-12; AC-08-05; AC-09-18; AC-10-27, 28; BACKLOG 2.4.4, C78…C81, C92; ADR-050, 107, 166, 228,
// 364…367, 430): a ticket voided and unvoided, a flag accepted, a QC status set, an invoice batch
// named, a ticket locked as invoiced, put in a batch and unlocked. **Each takes its own
// permission**: open to an admin, and to a manager/analyst who holds that one now; the service
// asks again inside its own piece of work. None of them writes a status, a flag or a line: a
// void, an unvoid, an acceptance and an unlock queue the run that does, and the answer says how
// many tickets it queued. What may be voided, accepted or locked is the domain's to say, answered
// `NOT_SAVED` with the rule's code and its plain words; the limits here only bound what is read.
const reviewer = { access: 'SIGNED_IN', roles: backOfficeRoles } as const;
// Why, in the reviewer's own words: kept on the mark, and beside the change in the audit log.
const reviewNote = z.string().trim().min(1).max(500).optional();
// A ticket as the worker groups one, in the path's project: its workflow and its bare number,
// never a split's suffix (ADR-062).
const ticketNamed = {
  workflow: z.enum(workflows),
  ticketNumber: z.string().trim().min(1).max(40),
};
// A ticket as QC and a lock name one: a load's or a haul-out's completed record (a split as
// one), or a unit rate ticket by its field event; never a load's single field event (ADR-168).
const ticketMarked = z.union([
  z.strictObject({ completedLoadId: z.uuid() }),
  z.strictObject({ completedHaulOutId: z.uuid() }),
  z.strictObject({ unitRateTicketId: z.uuid() }),
]);
// What a QC status is set on: a ticket, or a record QC'd on its own.
const qcMarked = z.union([
  ...ticketMarked.options,
  z.strictObject({ certificationId: z.uuid() }),
  z.strictObject({ roeId: z.uuid() }),
  z.strictObject({ surveyId: z.uuid() }),
  z.strictObject({ incidentId: z.uuid() }),
  z.strictObject({ dropOffLogId: z.uuid() }),
]);

// The work never happened (ADR-028): a reason picked from the ones the firm offers for voiding.
export const voidTicketEndpoint = endpoint({
  name: 'voidTicket',
  summary:
    'A ticket is voided, with a reason picked from the firm’s list and the reviewer’s own note. Nothing asks whether the choice is right. Refused for a number no field event of the project is under, a ticket already void, a reason the firm doesn’t offer for voiding and a ticket locked as invoiced.',
  ...reviewer,
  permission: 'VOID',
  method: 'POST',
  path: '/projects/:projectId/ticket-voids',
  params: projectId,
  body: z.strictObject({ ...ticketNamed, reasonId: z.uuid(), note: reviewNote }),
  answer: savedAnswer(ticketVoidRecordSchema),
});

// The override, with a record of its own whoever or whatever voided the ticket (ADR-366); a rule
// whose Void ticket still passes voids it again on the run (ADR-167).
export const unvoidTicketEndpoint = endpoint({
  name: 'unvoidTicket',
  summary:
    'A void ticket is unvoided: the unvoid is a record of its own, and a person’s void is kept, marked lifted. Refused for a ticket that isn’t void.',
  ...reviewer,
  permission: 'VOID',
  method: 'POST',
  path: '/projects/:projectId/ticket-unvoids',
  params: projectId,
  body: z.strictObject({ ...ticketNamed, note: reviewNote }),
  answer: savedAnswer(ticketUnvoidRecordSchema),
});

// A flag that is right as it is (ADR-166): any that stands, a ticket's or one on a
// certification, a site or a survey, once.
export const acceptFlagEndpoint = endpoint({
  name: 'acceptFlag',
  summary:
    'A flag that stands is accepted, with a reason picked from the firm’s list and the reviewer’s own note. Refused for a flag the worker has cleared, one already accepted, a reason the firm doesn’t offer for accepting a flag and a ticket locked as invoiced.',
  ...reviewer,
  permission: 'ACCEPT_FLAG',
  method: 'POST',
  path: '/flags/:flagId/acceptances',
  params: z.strictObject({ flagId: z.uuid() }),
  body: z.strictObject({ reasonId: z.uuid(), note: reviewNote }),
  answer: savedAnswer(flagAcceptanceRecordSchema),
});

// An acceptance taken back (ADR-534 (8)): the flag stands again on the next run, and accepting it
// again is an acceptance of its own. The note is required: it is why.
export const withdrawAcceptanceEndpoint = endpoint({
  name: 'withdrawAcceptance',
  summary:
    'A flag’s acceptance is taken back, with the reviewer’s note: who and when are kept on it, and the flag stands again on the run it queues. Accepting the flag again is a new acceptance. Refused for an acceptance already taken back and a ticket locked as invoiced.',
  ...reviewer,
  permission: 'ACCEPT_FLAG',
  method: 'POST',
  path: '/flag-acceptances/:flagAcceptanceId/withdrawals',
  params: z.strictObject({ flagAcceptanceId: z.uuid() }),
  body: z.strictObject({ note: z.string().trim().min(1).max(500) }),
  answer: savedAnswer(flagAcceptanceRecordSchema),
});

// A record has one QC mark, so the status is put: set again, it is the same mark changed, the
// status before kept in the audit log (ADR-107). It changes nothing on the record and queues
// nothing.
export const setQcStatusEndpoint = endpoint({
  name: 'setQcStatus',
  summary:
    'The QC status of a completed load or haul-out, a unit rate ticket, a certification, an ROE, a survey, an incident or a drop-off log is set. Refused for a load’s or a haul-out’s single field event and for a ticket locked as invoiced.',
  ...reviewer,
  permission: 'QC',
  method: 'PUT',
  path: '/qc-marks',
  body: z.strictObject({ record: qcMarked, status: z.enum(qcStatuses), note: reviewNote }),
  answer: savedAnswer(qcMarkRecordSchema),
});

// "Invoicing" is a person locking tickets, optionally in a named batch (ADR-057, 228): there is
// no invoice record and no amount.
export const createInvoiceBatchEndpoint = endpoint({
  name: 'createInvoiceBatch',
  summary:
    'An invoice batch is named on a project. Refused for a name another batch of the project has.',
  ...reviewer,
  permission: 'LOCK_INVOICED',
  method: 'POST',
  path: '/projects/:projectId/invoice-batches',
  params: projectId,
  body: z.strictObject({ name: named }),
  answer: savedAnswer(invoiceBatchRecordSchema),
});

export const lockAsInvoicedEndpoint = endpoint({
  name: 'lockAsInvoiced',
  summary:
    'A ticket is locked as invoiced, in a batch of its project where one is named. Refused for a ticket that isn’t whole, COMPLETED and QC Approved, one already locked and a batch of another project.',
  ...reviewer,
  permission: 'LOCK_INVOICED',
  method: 'POST',
  path: '/invoice-locks',
  body: z.strictObject({ ticket: ticketMarked, invoiceBatchId: z.uuid().optional() }),
  answer: savedAnswer(invoiceLockRecordSchema),
});

// The batch of a ticket's lock in force, put: another batch of its project, or none.
export const setLockBatchEndpoint = endpoint({
  name: 'setLockBatch',
  summary:
    'A locked ticket is put in an invoice batch of its project, moved to another or taken out of one. Refused for a ticket that isn’t locked and a batch of another project.',
  ...reviewer,
  permission: 'LOCK_INVOICED',
  method: 'PUT',
  path: '/invoice-locks/batch',
  body: z.strictObject({ ticket: ticketMarked, invoiceBatchId: z.uuid().nullable() }),
  answer: savedAnswer(invoiceLockRecordSchema),
});

// A grant of its own (AC-09-18): the lock's row is kept and says who unlocked it, when and why.
export const unlockInvoicedEndpoint = endpoint({
  name: 'unlockInvoiced',
  summary:
    'A ticket locked as invoiced is unlocked, and queued to be worked again as the setup now stands. Refused for a ticket that isn’t locked.',
  ...reviewer,
  permission: 'UNLOCK_INVOICED',
  method: 'POST',
  path: '/invoice-unlocks',
  body: z.strictObject({ ticket: ticketMarked, note: reviewNote }),
  answer: savedAnswer(invoiceLockRecordSchema),
});

// A reprocess a person asks for with nothing changed (spec/parts/08-review-and-corrections.md
// step 4; ADR-498): a ticket the worker couldn't process, worked again; or a job the worker set
// aside after too many tries, put back by its id as the worker's log names it. Part of
// correcting, so it takes `CORRECT`: no grant of its own. It changes no record: it queues one
// job of the tickets alone (`REPROCESS`, naming the person), since nothing changed that another
// ticket reads; a ticket locked as invoiced is left off it and counted. The job set aside stays
// as it is, the record of what failed. How many tickets one request names at the most is the
// installation's policy (JOB_TICKETS_AT_MOST), refused by the domain's rule; the schema bounds
// only what is read, at the most that policy may be.
const ticketsAskedAtMost = 100_000;
export const reprocessTicketsEndpoint = endpoint({
  name: 'reprocessTickets',
  summary:
    'Tickets of the project are queued to be worked again as their records and the setup stand, nothing changed: those named, or the tickets of a job the worker set aside, by its id. One job, naming the person; a ticket locked as invoiced is left off it and counted. Refused for more tickets than the installation’s policy lets one job name, a number no field event of the project is under, and a job that isn’t one of the project’s set aside.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'POST',
  path: '/projects/:projectId/reprocesses',
  params: projectId,
  body: z.union([
    z.strictObject({
      tickets: z.array(z.strictObject(ticketNamed)).min(1).max(ticketsAskedAtMost),
      note: reviewNote,
    }),
    z.strictObject({ setAsideJobId: z.uuid(), note: reviewNote }),
  ]),
  answer: savedAnswer(reprocessRecordSchema),
});

// Corrections to a ticket's own records (spec/parts/08-review-and-corrections.md steps 2…4;
// spec/acceptance/08 sections C and D; AC-04-102, 103; AC-10-27, 28, 37; BACKLOG 2.4.4, C79,
// C104; ADR-028, 051, 337, 364, 431): a field event's captured details, its number, a line of
// its items, a ticket it carries, a photograph's two marks and a scale receipt, each corrected in
// place, the value before kept in the audit log under the reviewer. **A correction takes
// `CORRECT` and a renumber `RENUMBER`**; the service asks again inside its own piece of work and
// queues the tickets the change moves. Nothing here judges the correction (ADR-051): the
// schemas only say what a value can be at all (a load call is a whole number 0 to 100, a blank
// isn't a label), refused here in plain words before any service runs; which kind of field event
// records which detail is the database's own check, answered plainly too.
const fieldEventId = z.strictObject({ fieldEventId: z.uuid() });
// Words a person typed: trimmed, never blank (empty is `null`, where a detail may be empty).
const typed = z.string().trim().min(1).max(2000);
// A number as written on a badge, a ticket or a site's paper: never parsed.
const numberAsWritten = z.string().trim().min(1).max(40);
const instant = z.iso.datetime();
// A fix a reviewer corrects: both halves as exact decimal text, or `null` for none.
const correctedFix = z.strictObject({ latitude: coordinate, longitude: coordinate }).nullable();
const pounds = places(2).max(9_999_999_999.99);

// What a field event captures beside its number, its kind and its lines: corrected one detail at
// a time, and entered whole for a record created in the back office.
const captured = {
  monitorId: z.uuid(),
  startedAt: instant,
  endedAt: instant,
  deviceUtcOffsetMinutes: z.number().int().min(-720).max(840),
  start: correctedFix,
  end: correctedFix,
  address: typed.nullable(),
  addressSource: z.enum(addressSources).nullable(),
  notes: typed.nullable(),
  certNumber: numberAsWritten,
  certKeyedByHand: z.boolean(),
  typedCapacityCy: z.number().int().min(0).max(9999).nullable(),
  numberTyped: z.boolean(),
  numberTypedReasonId: z.uuid().nullable(),
  siteId: z.uuid().nullable(),
  formDebrisTypeId: z.uuid().nullable(),
  fieldTagId: z.uuid().nullable(),
  roeNumber: numberAsWritten.nullable(),
  estimateCy: places(1).max(9_999_999.9).nullable(),
  // A whole number 0–100; 0 is taken (ADR-116).
  loadCall: z.number().int().min(0).max(100).nullable(),
  scaleReceiptId: z.uuid().nullable(),
  carriedCount: z.number().int().min(0).max(9999).nullable(),
  kindOfWorkId: z.uuid().nullable(),
  payableTypeId: z.uuid().nullable(),
  payItemId: z.uuid().nullable(),
  unitCount: places(2).max(99_999_999.99).nullable(),
  measurementInches: places(1).max(9_999_999.9).nullable(),
  measuredAs: z.enum(measuredAs).nullable(),
  rootBallInches: places(1).max(9_999_999.9).nullable(),
  rootBallHalfExposed: z.boolean().nullable(),
  surveyNumber: numberAsWritten.nullable(),
  markedIneligible: z.boolean().nullable(),
};

export const correctFieldEventEndpoint = endpoint({
  name: 'correctFieldEvent',
  summary:
    'A field event’s captured details are corrected in place: only what is stated changes, and `null` empties a detail that may be empty. A corrected cert number finds its certification again, an ROE number its ROE, a debris type its form. Its ticket and the tickets that read it are queued. Never its number (a renumber), its kind, its workflow or its project. Refused for a ticket locked as invoiced, and for a detail its kind of field event doesn’t record.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/field-events/:fieldEventId',
  params: fieldEventId,
  body: z.strictObject({
    changes: z.strictObject(captured).partial().refine(stated),
    note: reviewNote,
  }),
  answer: savedAnswer(fieldEventRecordSchema),
});

// Real work under the wrong number (ADR-028): the number, or a split collection's suffix, and
// nothing else. No partner is named: the worker pairs by the number in its own run.
export const renumberFieldEventEndpoint = endpoint({
  name: 'renumberFieldEvent',
  summary:
    'A field event is given another ticket number, or a split’s collection another suffix (left out, its suffix stays). The ticket it leaves and the one it joins are both queued. Nothing asks whether the work is real. Refused for the number it already has, a number another field event of its kind holds, a suffix on a kind that takes none and a ticket locked as invoiced.',
  ...reviewer,
  permission: 'RENUMBER',
  method: 'PUT',
  path: '/field-events/:fieldEventId/number',
  params: fieldEventId,
  body: z.strictObject({
    ticketNumber: numberAsWritten,
    splitSuffix: z.string().max(4).optional(),
    note: reviewNote,
  }),
  answer: savedAnswer(fieldEventRecordSchema),
});

// A line is put: its count or hours as they should be, or taken off. Nothing is deleted.
export const correctItemLineEndpoint = endpoint({
  name: 'correctItemLine',
  summary:
    'A line of an itemised unit rate ticket is corrected: its count or hours stated, a line it didn’t have added, or the line taken off (`TAKEN_OFF`: it stays, marked, and counts for nothing); stating its quantity again puts it back. Refused for a field event that isn’t unit rate work and for a ticket locked as invoiced.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PUT',
  path: '/field-events/:fieldEventId/item-lines/:itemNameId',
  params: z.strictObject({ fieldEventId: z.uuid(), itemNameId: z.uuid() }),
  body: z.strictObject({
    quantity: z.union([places(2).max(99_999_999.99), z.literal('TAKEN_OFF')]),
    note: reviewNote,
  }),
  answer: savedAnswer(itemLineRecordSchema),
});

export const correctCarriedTicketEndpoint = endpoint({
  name: 'correctCarriedTicket',
  summary:
    'A ticket a load’s collection lists as carried is added, taken off (it stays, marked, and counts for nothing) or put back. Refused for a field event that isn’t a load’s collection and for a ticket locked as invoiced.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PUT',
  path: '/field-events/:fieldEventId/carried-tickets',
  params: fieldEventId,
  body: z.strictObject({
    carriedTicketNumber: numberAsWritten,
    carried: z.boolean(),
    note: reviewNote,
  }),
  answer: savedAnswer(carriedTicketRecordSchema),
});

// A waypoint a collection's monitor marked (ADR-571, 581; C180): evidence like any captured field,
// corrected in place, the value before kept in the audit log, or taken off and put back. Nothing
// in the engine reads a waypoint, so nothing is queued.
export const correctWaypointEndpoint = endpoint({
  name: 'correctWaypoint',
  summary:
    'A waypoint a collection’s monitor marked is corrected in place: when it was marked and its fix (`null` for none), only what is stated changing; or it is taken off (it stays, marked) or put back. Nothing is queued: no ticket’s conclusions read a waypoint. Refused for a waypoint the field event doesn’t have, a fix that can’t be one and a ticket locked as invoiced.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/field-events/:fieldEventId/waypoints/:position',
  params: z.strictObject({
    fieldEventId: z.uuid(),
    // Its place in the order marked, from 1.
    position: z.string().regex(/^[1-9][0-9]{0,2}$/),
  }),
  body: z.strictObject({
    changes: z
      .strictObject({ markedAt: instant, fix: correctedFix, takenOff: z.boolean() })
      .partial()
      .refine(stated),
    note: reviewNote,
  }),
  answer: savedAnswer(waypointRecordSchema),
});

// The back office's two marks on a photograph (ADR-337): no phone sends either, and the worker
// sets neither. A removed photograph counts for nothing a record must have (ADR-345).
export const markPhotographEndpoint = endpoint({
  name: 'markPhotograph',
  summary:
    'A photograph is removed from the record or put back, and labelled in the firm’s own words: only what is stated changes, and a `null` label takes the label off. Nothing is deleted: its record, its file and its fingerprints stay. The ticket it is on is queued. Refused for a ticket locked as invoiced.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/photographs/:photoId',
  params: z.strictObject({ photoId: z.uuid() }),
  body: z.strictObject({
    marks: z
      .strictObject({
        removed: z.boolean(),
        // A blank isn't a label.
        label: z.string().trim().min(1).max(200).nullable(),
      })
      .partial()
      .refine(stated),
    note: reviewNote,
  }),
  answer: savedAnswer(photographRecordSchema),
});

// A photograph's file, read by the back office (ARCHITECTURE §6 "Uploads"; AC-10-48; T-25;
// ADR-482 (10), 483). **Open to an admin and to a manager/analyst granted "view review"**
// (ADR-539): a reviewer reads a photograph to review its ticket. What OWASP ASVS 5.0 asks of a file handed back, and how the
// API meets it: the bytes that were stored and nothing made of them; the type they were kept
// under, which their own first bytes said; `X-Content-Type-Options: nosniff`, so no browser
// guesses another; `Content-Disposition: attachment`, with a name the server makes and never the
// phone's, and a policy that sandboxes it, so it is never run as a page (V3.2.1, V5.4); never
// where it is kept (API3). A removed photograph's file is read all the same: nothing is deleted.
export const photographFileEndpoint = endpoint({
  name: 'photographFile',
  summary:
    'A photograph’s file as it was kept: the photograph itself or the depth file beside it, the bytes that were stored, under the type their own first bytes said, sent as a download and never as a page. A photograph removed from the record is read all the same. One whose file hasn’t arrived, or that has no depth file, is not found.',
  ...reviewer,
  permission: 'VIEW_REVIEW',
  method: 'GET',
  path: '/photographs/:photoId/files/:file',
  params: photoFileNamed,
  answersFile: true,
  answer: keptFileAnswerSchema,
});

// A photograph added in the back office (ARCHITECTURE §6 "Uploads", §11; T-25; BACKLOG 2.8.7;
// ADR-101, 482, 521, 534 (2)): **the third endpoint that takes a file**, sent whole, as bytes, by a
// route with its own size limit (`MEDIA_FILE_BYTES_AT_MOST`), as a map's file is. Only onto a
// record made in the back office: a phone's record keeps its phone's photographs. What it is on,
// its view (a certification's, one of the five, or none) and when it was taken go in the query;
// its kind is told by its own first bytes; both its fingerprints are the server's reading of the
// bytes; the server makes its place.
export const backOfficePhotographOwners = [
  'FIELD_EVENT',
  'CERTIFICATION',
  'ROE',
  'SURVEY',
  'INCIDENT',
  'DROP_OFF_LOG',
] as const;

export const addPhotographEndpoint = endpoint({
  name: 'addPhotograph',
  summary:
    'A photograph is added in the back office to a record made there (a field event, a certification, an ROE, a survey, an incident or a drop-off log), its file sent whole as bytes, at most the policy’s size: what it is on, a certification’s view where it has one, and when it was taken with its clock’s offset, in the query. Its kind is told by its own first bytes (JPEG, HEIC or HEIF, PNG, TIFF); it is kept once where the server places it, its fingerprints the server’s reading of the bytes. The ticket it is on is queued, or a certification’s own flags. Refused for a record a phone made, a view on anything but a certification and a ticket locked as invoiced.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'POST',
  path: '/photographs',
  query: z.strictObject({
    on: z.enum(backOfficePhotographOwners),
    recordId: z.uuid(),
    view: z.enum(certificationViews).optional(),
    capturedAt: z.iso.datetime(),
    utcOffsetMinutes: z.string().regex(/^(0|-?[1-9][0-9]{0,2})$/),
  }),
  file: true,
  answer: savedAnswer(photographRecordSchema),
});

// A receipt several tickets may share (a tandem's two): each ticket on it is queued, and one
// locked as invoiced waits for its unlock.
export const correctScaleReceiptEndpoint = endpoint({
  name: 'correctScaleReceipt',
  summary:
    'A scale receipt is corrected in place: the site’s number as written, the site that issued it, its weights and its notes; only what is stated changes. Every ticket that points at it is queued; one locked as invoiced is left as it is.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/scale-receipts/:scaleReceiptId',
  params: z.strictObject({ scaleReceiptId: z.uuid() }),
  body: z.strictObject({
    changes: z
      .strictObject({
        receiptNumber: numberAsWritten,
        siteId: z.uuid(),
        grossWeightLb: pounds.nullable(),
        tareWeightLb: pounds.nullable(),
        netWeightLb: pounds.nullable(),
        netWeightTons: places(4).max(99_999_999.9999).nullable(),
        notes: typed.nullable(),
      })
      .partial()
      .refine(stated),
    note: reviewNote,
  }),
  answer: savedAnswer(scaleReceiptRecordSchema),
});

// Corrections to an ROE and to the forms, a quarantined record resolved, and a record created in
// the back office (spec/parts/08-review-and-corrections.md steps 2, 9, "One review queue";
// AC-08-19, 21, 25, 26; AC-10-27, 28, 37; BACKLOG 2.4.4, 2.8.7, C66, C79, C105; ADR-022, 149,
// 156, 327, 338, 364, 432, 534). **A correction and a record created in the back office take
// `CORRECT`; resolving a quarantined record takes `RENUMBER`**, as their services ask again. An
// ROE's number is corrected too (what names it finds it, and what named the old one no longer
// does), and the answers to a form's own fields, given whole against the version they answer
// and refused where they don't fit it.
const roeId = z.strictObject({ roeId: z.uuid() });

// The answers to the firm's own fields, keyed by field id, whole, and the version of the form's
// fields they answer (left out: the one the record answers already).
const answersGiven = z.strictObject({
  answers: z
    .record(
      z.string().min(1).max(100),
      z.union([
        z.string().max(2000),
        z.number().min(-9_999_999_999.99).max(9_999_999_999.99),
        z.boolean(),
      ]),
    )
    .refine((answers) => Object.keys(answers).length <= 200, {
      message: 'At most 200 answers.',
    }),
  formDefinitionId: z.uuid().optional(),
});

export const correctRoeEndpoint = endpoint({
  name: 'correctRoe',
  summary:
    'An ROE is corrected in place: its number, parcel, address, owner, whether and when it was signed, its notes and the answers to its form’s own fields; only what is stated changes, and `null` empties a detail that may be empty. A corrected number is found by what names it, and what named the old one finds no ROE; what each says it named never changes. Every ticket on it, before and after, is queued; one locked as invoiced is left as it is. Refused for a number another ROE of the project holds and answers that don’t fit their version.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/roes/:roeId',
  params: roeId,
  body: z.strictObject({
    changes: z
      .strictObject({
        roeNumber: numberAsWritten,
        parcelId: numberAsWritten.nullable(),
        address: typed.nullable(),
        ownerName: named.nullable(),
        signed: z.boolean(),
        signedDate: day.nullable(),
        notes: typed.nullable(),
        answers: answersGiven,
      })
      .partial()
      .refine(stated),
    note: reviewNote,
  }),
  answer: savedAnswer(roeRecordSchema),
});

// How many, where the ROE says (three trees): recorded, never checked.
const scopeCount = z.number().int().min(1).max(9999).nullable().optional();

// A pick is put: in the ROE's scope or out of it. Nothing is deleted.
export const correctRoeScopeEndpoint = endpoint({
  name: 'correctRoeScope',
  summary:
    'A pick of an ROE’s scope, a debris type of the project’s load form or a payable type, is added, taken off (it stays, marked, and counts for nothing) or put back, with how many where the ROE says. Every ticket on the ROE is queued; one locked as invoiced is left as it is. Refused for a debris type that isn’t on the project’s load form.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PUT',
  path: '/roes/:roeId/scope',
  params: roeId,
  body: z.strictObject({
    pick: z.union([
      z.strictObject({ formDebrisTypeId: z.uuid(), count: scopeCount }),
      z.strictObject({ payableTypeId: z.uuid(), count: scopeCount }),
    ]),
    inScope: z.boolean(),
    note: reviewNote,
  }),
  answer: savedAnswer(roeScopeItemRecordSchema),
});

export const correctSurveyEndpoint = endpoint({
  name: 'correctSurvey',
  summary:
    'A survey is corrected in place: its work type, its survey number, the ROE number it names and its notes; only what is stated changes. A corrected ROE number finds its ROE again. The answers to its form’s own fields are given whole, against the version they answer. The project’s surveys are checked again on the next run. Refused for answers that don’t fit their version.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/surveys/:surveyId',
  params: z.strictObject({ surveyId: z.uuid() }),
  body: z.strictObject({
    changes: z
      .strictObject({
        workTypeId: z.uuid(),
        surveyNumber: numberAsWritten.nullable(),
        roeNumber: numberAsWritten.nullable(),
        notes: typed.nullable(),
        answers: answersGiven,
      })
      .partial()
      .refine(stated),
    note: reviewNote,
  }),
  answer: savedAnswer(surveyRecordSchema),
});

export const correctIncidentEndpoint = endpoint({
  name: 'correctIncident',
  summary:
    'An incident is corrected in place: its type and sub-type, what happened, who was involved, where, the contractor, cert number and ROE number it names, and its notes; only what is stated changes. A corrected cert number finds its certification again, an ROE number its ROE. The answers to its form’s own fields are given whole, against the version they answer. It is on no ticket, so nothing is queued. Refused for answers that don’t fit their version.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/incidents/:incidentId',
  params: z.strictObject({ incidentId: z.uuid() }),
  body: z.strictObject({
    changes: z
      .strictObject({
        incidentTypeId: z.uuid(),
        incidentSubTypeId: z.uuid().nullable(),
        description: typed.nullable(),
        parties: typed.nullable(),
        address: typed.nullable(),
        contractorId: z.uuid().nullable(),
        certNumber: numberAsWritten.nullable(),
        roeNumber: numberAsWritten.nullable(),
        notes: typed.nullable(),
        answers: answersGiven,
      })
      .partial()
      .refine(stated),
    note: reviewNote,
  }),
  answer: savedAnswer(incidentRecordSchema),
});

export const correctDropOffLogEndpoint = endpoint({
  name: 'correctDropOffLog',
  summary:
    'A citizen drop-off log is corrected in place: its site, the resident’s name, where the debris came from, its notes and the answers to its form’s own fields; only what is stated changes. It is on no ticket, so nothing is queued. Refused for a site of another project and answers that don’t fit their version.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/drop-off-logs/:dropOffLogId',
  params: z.strictObject({ dropOffLogId: z.uuid() }),
  body: z.strictObject({
    changes: z
      .strictObject({
        siteId: z.uuid(),
        residentName: named.nullable(),
        originAddress: typed.nullable(),
        notes: typed.nullable(),
        answers: answersGiven,
      })
      .partial()
      .refine(stated),
    note: reviewNote,
  }),
  answer: savedAnswer(dropOffLogRecordSchema),
});

const quarantinedRecordId = z.strictObject({ quarantinedRecordId: z.uuid() });

// Real work whose number another record holds (ADR-022, 338): it becomes the record its phone
// sent, under the number it should have had. The quarantined record stays, marked resolved.
export const renumberQuarantinedRecordEndpoint = endpoint({
  name: 'renumberQuarantinedRecord',
  summary:
    'A quarantined record is resolved by giving it the number it should have had: a field event a ticket number (and a split’s collection its suffix; left out, the suffix it was sent with stays), an ROE an ROE number. It is saved as a record of its own with the id its phone made and its photographs, written as the reviewer; a field event’s ticket is queued, and the tickets that were waiting for an ROE of that number. Resolved once. Refused for a number another record of its kind holds, the number it was sent with, the other kind of number and a ticket locked as invoiced.',
  ...reviewer,
  permission: 'RENUMBER',
  method: 'POST',
  path: '/quarantined-records/:quarantinedRecordId/renumberings',
  params: quarantinedRecordId,
  body: z.strictObject({
    to: z.union([
      z.strictObject({ ticketNumber: numberAsWritten, splitSuffix: z.string().max(4).optional() }),
      z.strictObject({ roeNumber: numberAsWritten }),
    ]),
    note: reviewNote,
  }),
  answer: savedAnswer(quarantinedRecordSchema),
});

// The same work sent twice under two ids: the record that holds the number is the record.
export const markSecondCopyEndpoint = endpoint({
  name: 'markSecondCopy',
  summary:
    'A quarantined record is resolved as a second copy of the record that holds its number: nothing is made from it, and it stays, marked with who said so and when. Resolved once.',
  ...reviewer,
  permission: 'RENUMBER',
  method: 'POST',
  path: '/quarantined-records/:quarantinedRecordId/second-copies',
  params: quarantinedRecordId,
  body: z.strictObject({ note: reviewNote }),
  answer: savedAnswer(quarantinedRecordSchema),
});

// What a sync held for a person and what waits in quarantine (spec/parts/05-sync.md step 6;
// spec/parts/08-review-and-corrections.md, "One review queue"; AC-05-46; AC-10-73…76; ADR-468,
// 471, 482, 526). **The three reads are open to every admin and manager/analyst, whether or not
// they hold a permission**, as a photograph's file is (ADR-482 (10); ADR-526 (1) (a)): the back
// office sees everything. Each a page at a time, oldest first, by project or by phone (both, or
// neither), waiting or resolved (both where neither is said). A resolution is once, by a person,
// with a reason, at its own permission (ADR-526 (2), (3)).
const waitingQuery = z.strictObject({
  projectId: z.uuid().optional(),
  deviceId: z.uuid().optional(),
  // Only those still waiting for a person, or only those resolved.
  waiting: z.enum(['true', 'false']).optional(),
  // The last of the page before: the answer's `next`.
  after: z.uuid().optional(),
  // How many at most: 50 where none is said.
  limit: z
    .string()
    .regex(/^([1-9][0-9]?|1[0-9]{2}|200)$/)
    .optional(),
});
// Why, in the reviewer's own words: required, since nothing else says why (ADR-526 (2) (b)).
const resolutionNote = z.string().trim().min(1).max(500);
const heldRecordId = z.strictObject({ heldRecordId: z.uuid() });
const setAsideFileId = z.strictObject({ setAsideFileId: z.uuid() });

export const listHeldRecordsEndpoint = endpoint({
  name: 'listHeldRecords',
  summary:
    'What a phone sent that the server couldn’t save, held for a person, a page at a time, oldest first: by project (as sent) or by phone, waiting or resolved. Each exactly as sent, with what it was sent as, why it is held, the words its phone was told, the photographs kept with it and how it was resolved.',
  ...reviewer,
  permission: 'VIEW_REVIEW',
  method: 'GET',
  path: '/held-records',
  query: waitingQuery,
  answer: heldRecordsAnswerSchema,
});

export const saveHeldRecordEndpoint = endpoint({
  name: 'saveHeldRecord',
  summary:
    'A held record is resolved by saving it as corrected: the record as it should be, in the sync’s own shape, under the id its phone made and of the kind it was sent as. It is written as the reviewer, as the phone’s record it was, with the photographs kept with it; its tickets are queued. Resolved once. Refused for a held record with no id, another id, another kind, a report (closed only), a number another record holds, what the database refuses and a ticket locked as invoiced.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'POST',
  path: '/held-records/:heldRecordId/savings',
  params: heldRecordId,
  body: z.strictObject({ record: correctedRecordSchema, note: resolutionNote }),
  answer: savedAnswer(heldRecordSchema),
});

export const closeHeldRecordEndpoint = endpoint({
  name: 'closeHeldRecord',
  summary:
    'A held record is closed, never to be saved: nothing is made from it, and what was sent stays, with its photographs, marked with who closed it, when and why. Resolved once.',
  ...reviewer,
  permission: 'VOID',
  method: 'POST',
  path: '/held-records/:heldRecordId/closings',
  params: heldRecordId,
  body: z.strictObject({ note: resolutionNote }),
  answer: savedAnswer(heldRecordSchema),
});

export const listSetAsideFilesEndpoint = endpoint({
  name: 'listSetAsideFiles',
  summary:
    'The files a phone uploaded for a photograph that weren’t the file it fingerprinted, a page at a time, oldest first: by project or by phone, waiting or resolved. Each beside its photograph (what it belongs to, the fingerprint its phone gave and whether that file has been kept since), with what arrived and how it was resolved. Never where either is kept.',
  ...reviewer,
  permission: 'VIEW_REVIEW',
  method: 'GET',
  path: '/set-aside-files',
  query: waitingQuery,
  answer: setAsideFilesAnswerSchema,
});

// The bytes as `photographFileEndpoint` hands a photograph's: as stored, under the type their own
// first bytes said, as a download (ADR-482 (10), 483).
export const setAsideFileEndpoint = endpoint({
  name: 'setAsideFile',
  summary:
    'A file set aside, as it was kept: the bytes that were stored, under the type their own first bytes said, sent as a download and never as a page.',
  ...reviewer,
  permission: 'VIEW_REVIEW',
  method: 'GET',
  path: '/set-aside-files/:setAsideFileId/file',
  params: setAsideFileId,
  answersFile: true,
  answer: keptFileAnswerSchema,
});

export const closeSetAsideFileEndpoint = endpoint({
  name: 'closeSetAsideFile',
  summary:
    'A file set aside is closed: the photograph’s own file won’t come, and this one stays beside it, kept, never the photograph’s. Marked with who closed it, when and why. Resolved once.',
  ...reviewer,
  permission: 'VOID',
  method: 'POST',
  path: '/set-aside-files/:setAsideFileId/closings',
  params: setAsideFileId,
  body: z.strictObject({ note: resolutionNote }),
  answer: savedAnswer(setAsideFileSchema),
});

export const listQuarantinedRecordsEndpoint = endpoint({
  name: 'listQuarantinedRecords',
  summary:
    'The records a phone sent whose number another record holds, a page at a time, oldest first: by project or by phone, waiting or resolved. Each with what the phone sent, its phone and monitor, why, the record that holds its number and how it was resolved.',
  ...reviewer,
  permission: 'VIEW_REVIEW',
  method: 'GET',
  path: '/quarantined-records',
  query: waitingQuery,
  answer: quarantinedRecordsAnswerSchema,
});

// A phone failed, and paper is never the record (ADR-156): the field event the monitor would have
// made, entered whole. What its phone alone would have said (the phone, its assignment, a typed
// number, a truck keyed in by hand with its capacity) isn't entered.
export const createFieldEventEndpoint = endpoint({
  name: 'createFieldEvent',
  summary:
    'A field event is created in the back office because a phone failed: its kind and number, the monitor whose work it was, when and where, the cert number and what its kind records, with a reason picked from the firm’s list. A detail left out is empty. It is a field event like any other: its ticket is queued, pairs by its number and is flagged as created in the back office. Refused for a number another field event of its kind holds, a fix that can’t be one, a reason the firm doesn’t offer for this, a detail its kind doesn’t record and a ticket locked as invoiced.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'POST',
  path: '/projects/:projectId/field-events',
  params: projectId,
  body: z
    .strictObject(captured)
    .omit({
      certKeyedByHand: true,
      typedCapacityCy: true,
      numberTyped: true,
      numberTypedReasonId: true,
    })
    .partial()
    .required({
      monitorId: true,
      startedAt: true,
      endedAt: true,
      deviceUtcOffsetMinutes: true,
      certNumber: true,
    })
    .extend({
      workflow: z.enum(workflows),
      kind: z.enum(fieldEventKinds),
      ticketNumber: numberAsWritten,
      // A split's collection; left out, not split.
      splitSuffix: z.string().max(4).optional(),
      items: z
        .array(z.strictObject({ itemNameId: z.uuid(), quantity: places(2).max(99_999_999.99) }))
        .max(100)
        .optional(),
      carriedTickets: z.array(numberAsWritten).max(100).optional(),
      reasonId: z.uuid(),
    }),
  answer: savedAnswer(fieldEventRecordSchema),
});

// A form made on paper, entered in the back office (ADR-156, 534 (9)): as its monitor would have
// made it, naming that monitor, with a reason from the firm's list; when by the paper, where if
// known, the answers to the form's own fields against the version they answer. What a phone
// alone would have said (its phone, its assignment, its lists' version) isn't entered.
const formEntered = {
  monitorId: z.uuid(),
  madeAt: instant,
  deviceUtcOffsetMinutes: z.number().int().min(-720).max(840),
  fix: correctedFix,
  notes: typed.nullable(),
  answers: answersGiven,
  reasonId: z.uuid(),
};

export const createRoeEndpoint = endpoint({
  name: 'createRoe',
  summary:
    'An ROE made on paper is entered in the back office: its number off the paper, parcel, address, owner, whether and when it was signed, where, its notes and the answers to its form’s own fields; it names the person who entered it. What was already waiting for its number points at it, and those tickets are queued. Refused for a number another ROE of the project holds, a fix that can’t be one and answers that don’t fit their version.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'POST',
  path: '/projects/:projectId/roes',
  params: projectId,
  body: z.strictObject({
    roeNumber: numberAsWritten,
    parcelId: numberAsWritten.nullable(),
    address: typed.nullable(),
    ownerName: named.nullable(),
    signed: z.boolean(),
    signedDate: day.nullable(),
    fix: correctedFix,
    madeAt: instant.nullable(),
    notes: typed.nullable(),
    answers: answersGiven,
  }),
  answer: savedAnswer(roeRecordSchema),
});

export const createSurveyEndpoint = endpoint({
  name: 'createSurvey',
  summary:
    'A survey made on paper is entered in the back office: the monitor whose work it was, when and where, its work type, survey number, the ROE number it names (which finds its ROE), notes and the answers to its form’s own fields, with a reason picked from the firm’s list. The project’s surveys are checked on the next run. Refused for a reason the firm doesn’t offer for this, a fix that can’t be one and answers that don’t fit their version.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'POST',
  path: '/projects/:projectId/surveys',
  params: projectId,
  body: z.strictObject({
    ...formEntered,
    workTypeId: z.uuid(),
    surveyNumber: numberAsWritten.nullable(),
    roeNumber: numberAsWritten.nullable(),
  }),
  answer: savedAnswer(surveyRecordSchema),
});

export const createIncidentEndpoint = endpoint({
  name: 'createIncident',
  summary:
    'An incident written on paper is entered in the back office: the monitor whose record it was, when and where, its type and sub-type, what happened, who was involved, the address, the contractor, cert number and ROE number it names (each finds its record), notes and the answers to its form’s own fields, with a reason picked from the firm’s list. It is on no ticket, so nothing is queued. Refused for a reason the firm doesn’t offer for this, a fix that can’t be one and answers that don’t fit their version.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'POST',
  path: '/projects/:projectId/incidents',
  params: projectId,
  body: z.strictObject({
    ...formEntered,
    incidentTypeId: z.uuid(),
    incidentSubTypeId: z.uuid().nullable(),
    description: typed.nullable(),
    parties: typed.nullable(),
    address: typed.nullable(),
    contractorId: z.uuid().nullable(),
    certNumber: numberAsWritten.nullable(),
    roeNumber: numberAsWritten.nullable(),
  }),
  answer: savedAnswer(incidentRecordSchema),
});

export const createDropOffLogEndpoint = endpoint({
  name: 'createDropOffLog',
  summary:
    'A citizen drop-off log kept on paper is entered in the back office: the monitor whose log it was, when and where, the site, the resident’s name and where the debris came from, notes and the answers to its form’s own fields, with a reason picked from the firm’s list. It is on no ticket, so nothing is queued. Refused for a site of another project, a reason the firm doesn’t offer for this, a fix that can’t be one and answers that don’t fit their version.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'POST',
  path: '/projects/:projectId/drop-off-logs',
  params: projectId,
  body: z.strictObject({
    ...formEntered,
    siteId: z.uuid(),
    residentName: named.nullable(),
    originAddress: typed.nullable(),
  }),
  answer: savedAnswer(dropOffLogRecordSchema),
});

// The back office's changes to a certification (spec/parts/03-certification.md steps 10…13;
// AC-03-38, 55; AC-10-27, 28, 35, 37; BACKLOG 2.4.4, C106; ADR-079, 080, 082, 364, 433). **A
// measuring mistake takes `CORRECT`, signatures on file take `QC`, and a revocation is an
// admin's alone**: no permission opens it to a manager/analyst. Each service asks again inside
// its own piece of work. **Nobody sends a capacity**: it is worked out again from the boxes, and
// measurements that give none are answered `NOT_SAVED` in the domain's own words. A certification
// is made, and a modified truck certified again, on a phone, so both arrive with its sync
// (BACKLOG 2.6.2); **or, where the phone failed, entered from the paper sheet** (ADR-521, 534
// (1)), which takes `CORRECT` as a field event made in the back office does. Every captured field
// is corrected (ADR-534 (5), (6)), and a revocation is taken back by an admin alone (7). Its QC
// status is `setQcStatus`'s.
const certificationId = z.strictObject({ certificationId: z.uuid() });

export const correctCertificationBoxEndpoint = endpoint({
  name: 'correctCertificationBox',
  summary:
    'A mistake on one of a container certification’s boxes is corrected in place (box 0 is the primary): its measurements in whole inches, its shape (with the measurements that shape holds, and no others), whether it adds or subtracts, its feature (picked or typed), or the box taken off or put back; only what is stated changes, and the capacity is worked out again from the boxes, never sent. Every ticket that scanned the certification is queued where the capacity changed; one locked as invoiced is left as it is. Refused for a box the certification doesn’t have, for the primary taken off, for measurements that give no capacity and for a measurement the box’s shape doesn’t hold.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/certifications/:certificationId/boxes/:position',
  params: z.strictObject({
    certificationId: z.uuid(),
    // The box by its place on the sheet: 0 is the primary.
    position: z.string().regex(/^(0|[1-9][0-9]?)$/),
  }),
  body: z.strictObject({
    changes: z
      .strictObject({
        length: inches,
        // A hoist's or a dog house's second length.
        secondLength: inches,
        width: inches,
        height: inches,
        diameter: inches,
        radius: inches,
        run: inches,
        corners: cornerCount,
        shape: z.enum(boxShapes),
        sign: z.enum(boxSigns),
        // A feature picked from the firm's list, or typed: stating one clears the other.
        featureId: z.uuid().nullable(),
        featureOther: z.string().trim().min(1).max(200).nullable(),
        takenOff: z.boolean(),
      })
      .partial()
      .refine(stated),
    note: reviewNote,
  }),
  answer: savedAnswer(certificationRecordSchema),
});

// A box the sheet had and the certification lacks: added after its last.
export const addCertificationBoxEndpoint = endpoint({
  name: 'addCertificationBox',
  summary:
    'A box is added to a container certification after its last, as the sheet has it: a feature (picked or typed), a shape with its own measurements in whole inches, and whether it adds or subtracts. The capacity is worked out again from the boxes, never sent, and every ticket that scanned the certification is queued where it changed; one locked as invoiced is left as it is. Refused for a crew, which is never measured, and for measurements that give no capacity.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'POST',
  path: '/certifications/:certificationId/boxes',
  params: certificationId,
  body: z.strictObject({ box: syncedCertificationBoxSchema, note: reviewNote }),
  answer: savedAnswer(certificationRecordSchema),
});

// The rest of what was keyed on a certification (ADR-534 (5)): the subs are typed names, placed
// as a phone's are; a prime changed takes the subs it had under it by name.
const keyed = z.string().trim().min(1).max(200);

export const correctCertificationEndpoint = endpoint({
  name: 'correctCertification',
  summary:
    'A certification is corrected in place: its prime and subs (typed by name, placed under the prime as at certifying, a name already placed elsewhere on the project saved as a separate contractor with a warning), what was certified (picked or typed) or the crew type, the driver, the tag, the representatives and notes; only what is stated changes, and `null` empties a detail that may be empty. With the prime changed, the subs it had are placed again under the new prime by name. Every ticket that scanned it is queued, with the tickets that read them; one locked as invoiced is left as it is. Refused for a prime that isn’t one of the project’s and a second tier with no first.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/certifications/:certificationId',
  params: certificationId,
  body: z.strictObject({
    changes: z
      .strictObject({
        primeId: z.uuid(),
        firstTierSub: keyed.nullable(),
        secondTierSub: keyed.nullable(),
        vehicleTypeId: z.uuid().nullable(),
        vehicleTypeOther: keyed.nullable(),
        crewTypeId: z.uuid().nullable(),
        driverName: keyed.nullable(),
        driverPhone: keyed.nullable(),
        driverLicenceNumber: keyed.nullable(),
        driverLicenceState: keyed.nullable(),
        driverLicenceExpiry: day.nullable(),
        tagNumber: keyed.nullable(),
        tagState: keyed.nullable(),
        tagExpiry: day.nullable(),
        clientRepresentativeName: keyed.nullable(),
        contractorRepresentativeName: keyed.nullable(),
        notes: typed.nullable(),
      })
      .partial()
      .refine(stated),
    note: reviewNote,
  }),
  answer: savedAnswer(certificationRecordSchema),
});

// Marked at QC, beside the QC status (ADR-080): the signatures themselves are kept elsewhere.
export const markSignaturesOnFileEndpoint = endpoint({
  name: 'markSignaturesOnFile',
  summary:
    'Whether a certification’s signatures are on file is marked, yes or no. It changes nothing a ticket reads and queues nothing.',
  ...reviewer,
  permission: 'QC',
  method: 'PUT',
  path: '/certifications/:certificationId/signatures-on-file',
  params: certificationId,
  body: z.strictObject({ onFile: z.boolean() }),
  answer: savedAnswer(certificationRecordSchema),
});

// Only an admin revokes (ADR-079; AC-03-55). Nothing is blocked: the tickets worked on it from
// that day are flagged for a certification review, and still bill.
export const revokeCertificationEndpoint = endpoint({
  name: 'revokeCertification',
  summary:
    'A certification is revoked from a day, in its project’s time zone, with a reason; it keeps the day, the reason and the admin. Nothing else on it changes. Every ticket that scanned it is queued; one locked as invoiced is left as it is.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/certifications/:certificationId/revocations',
  params: certificationId,
  body: z.strictObject({ from: day, reason: typed }),
  answer: savedAnswer(certificationRecordSchema),
});

// A revocation taken back (ADR-534 (7)): an admin's alone, as revoking is, with a reason the
// audit log keeps beside the revocation it clears.
export const unrevokeCertificationEndpoint = endpoint({
  name: 'unrevokeCertification',
  summary:
    'A certification’s revocation is taken back, with a reason: its day, reason and admin are cleared, the audit log keeping them, and every ticket that scanned it is queued, flagged no more for it; one locked as invoiced is left as it is. Refused for a certification that isn’t revoked.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'POST',
  path: '/certifications/:certificationId/unrevocations',
  params: certificationId,
  body: z.strictObject({ reason: typed }),
  answer: savedAnswer(certificationRecordSchema),
});

// A certification sheet whose phone failed, entered in the back office (ADR-521, 534 (1)): the
// monitor who certified it, the sheet's own number (pre-printed, or the one the phone gave the
// placard), when by the sheet, what was certified, the boxes measured (never a capacity), the
// helpers picked, the driver and tag, the representatives, and the reason picked; a modified
// truck names the certification it replaces. What a phone alone would have said (its phone, its
// assignment) isn't entered.
export const createCertificationEndpoint = endpoint({
  name: 'createCertification',
  summary:
    'A certification sheet whose phone failed is entered in the back office: its number as the sheet has it, a container or a crew, the prime picked and the subs typed, what was certified, the boxes measured (the primary first; the capacity is worked out, never sent), the driver and the tag, when it was certified by the sheet, the monitor who certified it and the helpers, the representatives, the certification it replaces where a modified truck was certified again, notes and a reason picked from the firm’s list. It names the person who entered it. The field events already on its number are linked to it, and their tickets queued (the replaced one’s too). Refused for a number another certification of the project has, a reason the firm doesn’t offer for this and measurements that give no capacity.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'POST',
  path: '/projects/:projectId/certifications',
  params: projectId,
  body: z
    .strictObject({
      certNumber: numberAsWritten,
      kind: z.enum(['CONTAINER', 'CREW']),
      primeId: z.uuid(),
      firstTierSub: keyed.nullable(),
      secondTierSub: keyed.nullable(),
      vehicleTypeId: z.uuid().nullable(),
      vehicleTypeOther: keyed.nullable(),
      crewTypeId: z.uuid().nullable(),
      boxes: z.array(syncedCertificationBoxSchema).max(certificationBoxesAtMost),
      driverName: keyed.nullable(),
      driverPhone: keyed.nullable(),
      driverLicenceNumber: keyed.nullable(),
      driverLicenceState: keyed.nullable(),
      driverLicenceExpiry: day.nullable(),
      tagNumber: keyed.nullable(),
      tagState: keyed.nullable(),
      tagExpiry: day.nullable(),
      certifiedAt: instant,
      deviceUtcOffsetMinutes: z.number().int().min(-720).max(840),
      certifiedById: z.uuid(),
      helperIds: z
        .array(z.uuid())
        .max(certificationHelpersAtMost)
        .refine((helpers) => new Set(helpers).size === helpers.length, {
          message: 'A helper is picked once.',
        }),
      clientRepresentativeName: keyed.nullable(),
      contractorRepresentativeName: keyed.nullable(),
      replaces: z.strictObject({ certificationId: z.uuid(), reason: typed }).nullable(),
      notes: typed.nullable(),
      reasonId: z.uuid(),
    })
    .superRefine((sheet, context) => {
      if (sheet.vehicleTypeId !== null && sheet.vehicleTypeOther !== null) {
        context.addIssue({
          code: 'custom',
          message: 'A vehicle type is picked or typed, never both.',
          path: ['vehicleTypeOther'],
        });
      }
      if (sheet.kind === 'CONTAINER' && sheet.crewTypeId !== null) {
        context.addIssue({
          code: 'custom',
          message: 'A container has no crew type.',
          path: ['crewTypeId'],
        });
      }
    }),
  answer: savedAnswer(certificationRecordSchema),
});

// ---------------------------------------------------------------------------------------------
// The back office's reads, setup's reads, a save's preview, the bulk acts and the viewers' reads of
// the same records (REQ-217; BACKLOG 2.8.8; ADR-535). **A read takes its area's view** (the user,
// ADR-539): `VIEW_REVIEW`, `VIEW_SETUP` or `VIEW_DISPATCH`, which an admin holds and a
// manager/analyst is granted; the projects and the lists' values are every one of theirs to read.
// Asked again inside the read; a pay item's rates take Setup. Every list is a page, oldest first
// or in the order it names, 50 where none is said and 200 at most.
const readPage = z
  .string()
  .regex(/^([1-9][0-9]?|1[0-9]{2}|200)$/)
  .optional();
const pagedAfter = z.strictObject({
  // The last of the page before: the answer's `next`.
  after: z.uuid().optional(),
  limit: readPage,
});
const read = { access: 'SIGNED_IN', roles: backOfficeRoles } as const;
const projectTicket = z.strictObject({
  projectId: z.uuid(),
  workflow: z.enum(workflows),
  ticketNumber: z.string().trim().min(1).max(40),
});

export const listProjectsEndpoint = endpoint({
  ...read,
  name: 'listProjects',
  summary:
    'The firm’s projects, a page at a time, in name order: each with its settings, its active window and whether it is closed.',
  method: 'GET',
  path: '/projects',
  query: z.strictObject({
    // Left out, every project; `true`, only those closed; `false`, only those open.
    closed: z.enum(['true', 'false']).optional(),
    after: z.uuid().optional(),
    limit: readPage,
  }),
  answer: projectsAnswerSchema,
});

export const readProjectEndpoint = endpoint({
  ...read,
  name: 'readProject',
  summary:
    'One project’s page: its settings, active window and whether it is closed, its kinds of work, each contractor’s place on it by name, and its contracts.',
  method: 'GET',
  path: '/projects/:projectId',
  params: projectId,
  answer: projectAnswerSchema,
});

// The one review queue (spec/parts/08, "One review queue"; ADR-228): flags grouped by cause, and
// the tickets waiting for a person, one workflow a page, by number as text.
export const reviewQueueEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'reviewQueue',
  summary:
    'The review queue of one workflow on a project: the tickets whose field events stand pending or in review, a page at a time by number, each with its open flags (not cleared, no acceptance in force); and the project’s open flags counted by cause. Narrowed to one cause, only the tickets with an open flag of it.',
  method: 'GET',
  path: '/projects/:projectId/review-queue',
  params: projectId,
  query: z.strictObject({
    workflow: z.enum(workflows),
    // One cause: a flag's code.
    cause: z.enum(flagCodes).optional(),
    // The last ticket number of the page before: the answer's `next`.
    after: z.string().trim().min(1).max(40).optional(),
    limit: readPage,
  }),
  answer: reviewQueueAnswerSchema,
});

export const listFlagsEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'listFlags',
  summary:
    'A project’s flags, a page at a time, oldest first: on a ticket or on another record (a certification, a site, a survey), of one cause or every one, open or cleared, each with every acceptance it had and whether it was taken back.',
  method: 'GET',
  path: '/projects/:projectId/flags',
  params: projectId,
  query: z.strictObject({
    // One cause: a flag's code.
    cause: z.enum(flagCodes).optional(),
    // Left out, both; `true`, only those not cleared; `false`, only those cleared.
    open: z.enum(['true', 'false']).optional(),
    after: z.uuid().optional(),
    limit: readPage,
  }),
  answer: flagsAnswerSchema,
});

export const readTicketEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'readTicket',
  summary:
    'One ticket whole, as the back office reads it: its field events in field time (as recorded and corrected, with their status, zone and worked-out pay item), the completed record that stands with its collection rows, its lines with their rates and amounts, its flags with their acceptances, its QC mark, every lock it had, its voids and unvoids. A ticket with no field event is not found.',
  method: 'GET',
  path: '/projects/:projectId/tickets/:workflow/:ticketNumber',
  params: projectTicket,
  answer: ticketAnswerSchema,
});

export const readTicketDecisionsEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'readTicketDecisions',
  summary:
    'What each reconciliation run decided for one ticket and why, newest first, a page at a time: the run (what started it, when), the status it left, its words, the field events it grouped and the kinds still to arrive, the lines it priced with the rule that made each, the flags it raised, and the rule or person that voided it; whether the ticket could be processed. A ticket with no field event is not found.',
  method: 'GET',
  path: '/projects/:projectId/tickets/:workflow/:ticketNumber/decisions',
  params: projectTicket,
  query: pagedAfter,
  answer: ticketDecisionsAnswerSchema,
});

// The audit log, read (ARCHITECTURE §5.3; invariant 3; REQ-407; ADR-544; the Phase 2 audit's F5):
// "corrected in place, prior value kept" is a promise to an auditor, kept here. A page of it, newest
// first, by its own number.
const auditPage = z.strictObject({
  // The last entry of the page before: the answer's `next`.
  after: z
    .string()
    .regex(/^[1-9][0-9]{0,18}$/)
    .optional(),
  limit: readPage,
});

export const readTicketHistoryEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'readTicketHistory',
  summary:
    'What the audit log holds of one ticket, newest first, a page at a time: every change to its field events and what is recorded beside them (item lines, carried tickets, photographs’ records), the completed record and its rows, its lines (those the worker removed included, each copied whole first), its flags and their acceptances, and its QC marks, locks, voids and unvoids; each with the values before and after, who made it, from where and why. A ticket with no field event is not found.',
  method: 'GET',
  path: '/projects/:projectId/tickets/:workflow/:ticketNumber/history',
  params: projectTicket,
  query: auditPage,
  answer: auditTrailAnswerSchema,
});

export const readRecordHistoryEndpoint = endpoint({
  ...read,
  name: 'readRecordHistory',
  summary:
    'What the audit log holds of one record, by its table and id, newest first, a page at a time. Read by the area it belongs to: a ticket’s records with view review, setup with view setup, people, phones and the board with view dispatch; sign-in’s and the firm’s security records by an admin alone. A person’s phone number is shown to an admin alone.',
  method: 'GET',
  path: '/audit-records',
  query: auditPage.extend({
    tableName: z.string().regex(/^[a-z][a-z_]{0,62}$/),
    recordId: z.string().regex(/^[0-9A-Za-z-]{1,40}$/),
  }),
  answer: auditTrailAnswerSchema,
});

export const listSetAsideJobsEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'listSetAsideJobs',
  summary:
    'A project’s jobs set aside after failing too often, newest first, a page at a time: when each was queued and set aside, what queued it and who asked, its tries, and its tickets, each said to be waiting where no job has worked it since. Put one back with a reprocess naming it. Never why it failed.',
  method: 'GET',
  path: '/projects/:projectId/set-aside-jobs',
  params: projectId,
  query: pagedAfter,
  answer: setAsideJobsAnswerSchema,
});

export const readFieldEventEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'readFieldEvent',
  summary:
    'One field event as recorded and corrected, with its status, its item lines and the tickets it carries (those taken off kept, marked), its photographs’ records (each with its view, when it was taken and when its file reached storage) and the scale receipt it names. Never where a file is kept.',
  method: 'GET',
  path: '/field-events/:fieldEventId',
  params: z.strictObject({ fieldEventId: z.uuid() }),
  answer: fieldEventAnswerSchema,
});

export const readScaleReceiptEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'readScaleReceipt',
  summary:
    'One scale receipt as the tower copied it, with its photographs’ records and the field events that name it.',
  method: 'GET',
  path: '/scale-receipts/:scaleReceiptId',
  params: z.strictObject({ scaleReceiptId: z.uuid() }),
  answer: scaleReceiptAnswerSchema,
});

export const listCertificationsEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'listCertifications',
  summary:
    'A project’s certifications, a page at a time, by cert number as written: each whole, with its boxes, helpers, photographs’ records, QC mark and its own flags, where it came from (its phone, or the paper sheet with who entered it and why) and any revocation.',
  method: 'GET',
  path: '/projects/:projectId/certifications',
  params: projectId,
  query: z.strictObject({
    // One cert number, as written.
    certNumber: z.string().trim().min(1).max(40).optional(),
    after: z.uuid().optional(),
    limit: readPage,
  }),
  answer: certificationsAnswerSchema,
});

export const readCertificationEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'readCertification',
  summary:
    'One certification whole: its boxes (those taken off kept, marked), helpers, photographs’ records, QC mark and its own flags, where it came from and any revocation. Never the driver’s phone or licence number.',
  method: 'GET',
  path: '/certifications/:certificationId',
  params: z.strictObject({ certificationId: z.uuid() }),
  answer: certificationReadSchema,
});

export const listRoesEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'listRoes',
  summary:
    'A project’s ROEs, a page at a time, in the order they were made: each with its scope, its photographs’ records and its QC mark.',
  method: 'GET',
  path: '/projects/:projectId/roes',
  params: projectId,
  query: pagedAfter,
  answer: roesAnswerSchema,
});

export const listSurveysEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'listSurveys',
  summary:
    'A project’s surveys, a page at a time, in the order they were made: each with its own flags, its photographs’ records and its QC mark.',
  method: 'GET',
  path: '/projects/:projectId/surveys',
  params: projectId,
  query: pagedAfter,
  answer: surveysAnswerSchema,
});

export const listIncidentsEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'listIncidents',
  summary:
    'A project’s incidents, a page at a time, in the order they were made: each with its photographs’ records and its QC mark.',
  method: 'GET',
  path: '/projects/:projectId/incidents',
  params: projectId,
  query: pagedAfter,
  answer: incidentsAnswerSchema,
});

export const listDropOffLogsEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'listDropOffLogs',
  summary:
    'A project’s citizen drop-off logs, a page at a time, in the order they were made: each with its photographs’ records and its QC mark.',
  method: 'GET',
  path: '/projects/:projectId/drop-off-logs',
  params: projectId,
  query: pagedAfter,
  answer: dropOffLogsAnswerSchema,
});

export const listInvoiceBatchesEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'listInvoiceBatches',
  summary:
    'A project’s invoice batches, a page at a time, in name order: each with how many locks in force it holds.',
  method: 'GET',
  path: '/projects/:projectId/invoice-batches',
  params: projectId,
  query: pagedAfter,
  answer: invoiceBatchesAnswerSchema,
});

const invoiceBatchId = z.strictObject({ invoiceBatchId: z.uuid() });

export const readInvoiceBatchEndpoint = endpoint({
  ...read,
  permission: 'VIEW_REVIEW',
  name: 'readInvoiceBatch',
  summary:
    'One invoice batch and what it holds: each lock in force that names it, with the ticket it locks. No amount: a batch is a name and its tickets.',
  method: 'GET',
  path: '/invoice-batches/:invoiceBatchId',
  params: invoiceBatchId,
  answer: invoiceBatchAnswerSchema,
});

// A batch is renamed, never archived: it is kept for ever (ADR-363, 529, 535 (4)).
export const renameInvoiceBatchEndpoint = endpoint({
  ...reviewer,
  permission: 'LOCK_INVOICED',
  name: 'renameInvoiceBatch',
  summary:
    'An invoice batch is renamed: a name used once on its project, never blank. Its locks and tickets are as they were.',
  method: 'PATCH',
  path: '/invoice-batches/:invoiceBatchId',
  params: invoiceBatchId,
  body: z.strictObject({ name: named }),
  answer: savedAnswer(invoiceBatchRecordSchema),
});

// The board searched by person or phone, across projects and days (C103, C115; ADR-535 (1)).
export const searchBoardEndpoint = endpoint({
  ...read,
  permission: 'VIEW_DISPATCH',
  name: 'searchBoard',
  summary:
    'The dispatch board searched: a person’s or a phone’s assignments (or a project’s), from one day to another (62 days at most), standing or withdrawn, a page at a time by day and then in the order written; each with what the board warns of beside it (a second assignment for the person or the phone that day, a day outside the project’s active window, a closed project, unit rate pay items named with no unit rate work, a site not yet active or closed). A warning never stops anything.',
  method: 'GET',
  path: '/assignments',
  query: z
    .strictObject({
      userId: z.uuid().optional(),
      deviceId: z.uuid().optional(),
      projectId: z.uuid().optional(),
      from: day,
      to: day,
      withdrawn: z.enum(['true', 'false']).optional(),
      after: z.uuid().optional(),
      limit: readPage,
    })
    .refine(
      (query) =>
        query.userId !== undefined || query.deviceId !== undefined || query.projectId !== undefined,
      { message: 'Name a person, a phone or a project.', path: ['userId'] },
    )
    .refine(
      (query) => {
        const days = (Date.parse(query.to) - Date.parse(query.from)) / 86_400_000;
        return days >= 0 && days <= 61;
      },
      { message: 'From one day to another, 62 days at most.', path: ['to'] },
    ),
  answer: boardSearchAnswerSchema,
});

export const listPhoneSessionsEndpoint = endpoint({
  ...read,
  permission: 'VIEW_DISPATCH',
  name: 'listPhoneSessions',
  summary:
    'A phone’s sessions, a page at a time, newest first: whose, when made, until when and whether ended, which way one opened under the master passcode was, and whether it came from a sign-in made on the phone offline. Never a token.',
  method: 'GET',
  path: '/phones/:deviceId/sessions',
  params: z.strictObject({ deviceId: z.uuid() }),
  query: pagedAfter,
  answer: phoneSessionsAnswerSchema,
});

// Setup's reads (C99, C100, C169).
export const listFormsEndpoint = endpoint({
  ...read,
  permission: 'VIEW_SETUP',
  name: 'listForms',
  summary:
    'A project’s forms, one for each document type at most: each with its debris types’ entries (those archived kept, marked) and the newest version of its own fields.',
  method: 'GET',
  path: '/projects/:projectId/forms',
  params: projectId,
  answer: formsAnswerSchema,
});

export const listPayItemsEndpoint = endpoint({
  ...read,
  permission: 'VIEW_SETUP',
  name: 'listPayItems',
  summary:
    'A project’s pay items, a page at a time, by code: each as the firm entered it, with its crew day’s steps in force. Never a rate: a pay item’s rates are a read that takes Setup.',
  method: 'GET',
  path: '/projects/:projectId/pay-items',
  params: projectId,
  query: pagedAfter,
  answer: payItemsAnswerSchema,
});

export const listPayItemRatesEndpoint = endpoint({
  ...setup,
  name: 'listPayItemRates',
  summary:
    'A project’s rates, a page at a time, by pay item and then prime: each an exact decimal, those archived kept, marked. Read only by whoever may set one.',
  method: 'GET',
  path: '/projects/:projectId/pay-item-rates',
  params: projectId,
  query: pagedAfter,
  answer: payItemRatesAnswerSchema,
});

export const listRulesEndpoint = endpoint({
  ...read,
  permission: 'VIEW_SETUP',
  name: 'listRules',
  summary:
    'A project’s rules, a page at a time, in the order written: each whole as the rule builder states it (each picked value with its name and whether it is gone), the pay item whose "Pays when" wrote it, and whether it is valid now and why not.',
  method: 'GET',
  path: '/projects/:projectId/rules',
  params: projectId,
  query: z.strictObject({
    // Left out, every rule; `true`, only those archived; `false`, only those in force.
    archived: z.enum(['true', 'false']).optional(),
    after: z.uuid().optional(),
    limit: readPage,
  }),
  answer: rulesAnswerSchema,
});

export const listSitesEndpoint = endpoint({
  ...read,
  permission: 'VIEW_SETUP',
  name: 'listSites',
  summary:
    'A project’s sites, a page at a time, in name order: each with its labels, its tipping fee links and its own shape’s newest version.',
  method: 'GET',
  path: '/projects/:projectId/sites',
  params: projectId,
  query: pagedAfter,
  answer: sitesAnswerSchema,
});

export const listSiteShapesEndpoint = endpoint({
  ...read,
  permission: 'VIEW_SETUP',
  name: 'listSiteShapes',
  summary:
    'A site’s own shape, every version, newest first: each with its shape, how it came (drawn, a file, an Esri layer), its file’s name or the layer’s address, and whether its file was kept. Never where.',
  method: 'GET',
  path: '/sites/:siteId/shapes',
  params: z.strictObject({ siteId: z.uuid() }),
  query: pagedAfter,
  answer: siteShapeVersionsAnswerSchema,
});

// A kept map's file, answered as a photograph's is (ADR-483, 535 (2)): the bytes stored, under the
// type kept with them, as a download and never as a page.
export const siteShapeFileEndpoint = endpoint({
  ...read,
  permission: 'VIEW_SETUP',
  name: 'siteShapeFile',
  summary:
    'The file a site’s shape version was loaded from, as it was kept: the bytes that were stored, under the type they were kept as, sent as a download and never as a page. None for a shape that was drawn.',
  method: 'GET',
  path: '/site-shapes/:siteAreaVersionId/file',
  params: z.strictObject({ siteAreaVersionId: z.uuid() }),
  answersFile: true,
  answersFileOf: mapFileTypes,
  answer: keptFileAnswerSchema,
});

export const listMapVersionsEndpoint = endpoint({
  ...read,
  permission: 'VIEW_SETUP',
  name: 'listMapVersions',
  summary:
    'A project’s map versions, a page at a time, newest first: each with how it came, its file’s name or the layer’s address, the zones’ own layer and whether its copy was kept, and its zones’ names.',
  method: 'GET',
  path: '/projects/:projectId/map-versions',
  params: projectId,
  query: pagedAfter,
  answer: mapVersionsAnswerSchema,
});

const mapVersionId = z.strictObject({ mapVersionId: z.uuid() });

export const readMapVersionEndpoint = endpoint({
  ...read,
  permission: 'VIEW_SETUP',
  name: 'readMapVersion',
  summary: 'One map version with its boundary and each zone’s shape, as they were loaded.',
  method: 'GET',
  path: '/map-versions/:mapVersionId',
  params: mapVersionId,
  answer: mapVersionAnswerSchema,
});

export const mapVersionFileEndpoint = endpoint({
  ...read,
  permission: 'VIEW_SETUP',
  name: 'mapVersionFile',
  summary:
    'A map version’s file as it was kept, or the copy of its zones’ own Esri layer: the bytes that were stored, under the type they were kept as, sent as a download and never as a page.',
  method: 'GET',
  path: '/map-versions/:mapVersionId/files/:file',
  params: z.strictObject({ mapVersionId: z.uuid(), file: z.enum(['map', 'zones']) }),
  answersFile: true,
  answersFileOf: mapFileTypes,
  answer: keptFileAnswerSchema,
});

export const listListValuesEndpoint = endpoint({
  ...read,
  name: 'listListValues',
  summary:
    'One of the firm’s lists, a page at a time, in its order: its values in service, or the archived ones apart, each with what its list asks beside its name (a field tag its project).',
  method: 'GET',
  path: '/lists/:list/values',
  params: z.strictObject({ list: z.enum(firmLists) }),
  query: z.strictObject({
    archived: z.enum(['true', 'false']).optional(),
    after: z.uuid().optional(),
    limit: readPage,
  }),
  answer: listValuesAnswerSchema,
});

// What a setup save would change, before it is saved (ADR-229, 535 (3)): each takes exactly its
// save's body, and nothing of it is kept.
const preview = (of: string) =>
  `What ${of} would do, before it is saved: the record as it would be, its warnings and how many tickets it would queue (and pass by, locked as invoiced), or why it wouldn’t be saved. Nothing is kept.`;

export const previewPayItemChangeEndpoint = endpoint({
  ...setup,
  name: 'previewPayItemChange',
  summary: preview('a change to a pay item'),
  method: 'POST',
  path: '/pay-items/:payItemId/previews',
  params: payItemId,
  body: changePayItemEndpoint.body,
  answer: previewAnswer(payItemRecordSchema),
});

export const previewPaysWhenEndpoint = endpoint({
  ...setup,
  name: 'previewPaysWhen',
  summary: preview('saving a pay item’s "Pays when"'),
  method: 'POST',
  path: '/pay-items/:payItemId/pays-when/previews',
  params: payItemId,
  body: savePaysWhenEndpoint.body,
  answer: previewAnswer(rulesKeptRecordSchema),
});

export const previewPayItemRateEndpoint = endpoint({
  ...setup,
  name: 'previewPayItemRate',
  summary: preview('a prime’s rate'),
  method: 'POST',
  path: '/pay-items/:payItemId/rates/:primeId/previews',
  params: setPayItemRateEndpoint.params,
  body: setPayItemRateEndpoint.body,
  answer: previewAnswer(payItemRateRecordSchema),
});

export const previewNewRuleEndpoint = endpoint({
  ...setup,
  name: 'previewNewRule',
  summary: preview('a new rule'),
  method: 'POST',
  path: '/projects/:projectId/rules/previews',
  params: projectId,
  body: ruleBody,
  answer: previewAnswer(savedRuleRecordSchema),
});

export const previewRuleChangeEndpoint = endpoint({
  ...setup,
  name: 'previewRuleChange',
  summary: preview('a change to a rule'),
  method: 'POST',
  path: '/rules/:ruleId/previews',
  params: z.strictObject({ ruleId: z.uuid() }),
  body: ruleBody,
  answer: previewAnswer(savedRuleRecordSchema),
});

// QC and a lock for many tickets in one request (C148; ADR-535 (4)): each its own piece of work,
// in order, each answered.
const severalAtMost = 200;

export const setQcStatusesEndpoint = endpoint({
  ...reviewer,
  permission: 'QC',
  name: 'setQcStatuses',
  summary:
    'QC statuses set on many records at once, up to 200, each as one would be: in the order sent, each its own piece of work and each answered, saved with its mark or not with its reason and words (a ticket locked as invoiced among them). One refused never stops the rest.',
  method: 'PUT',
  path: '/qc-marks/several',
  body: z.strictObject({
    marks: z
      .array(z.strictObject({ record: qcMarked, status: z.enum(qcStatuses), note: reviewNote }))
      .min(1)
      .max(severalAtMost),
  }),
  answer: severalAnswer(qcMarkRecordSchema),
});

export const lockSeveralAsInvoicedEndpoint = endpoint({
  ...reviewer,
  permission: 'LOCK_INVOICED',
  name: 'lockSeveralAsInvoiced',
  summary:
    'Many tickets locked as invoiced at once, up to 200, each in the batch named where one is: in the order sent, each its own piece of work and each answered, locked or not with its reason and words (not QC Approved, not whole, flagged, already locked). One refused never stops the rest.',
  method: 'POST',
  path: '/invoice-locks/several',
  body: z.strictObject({
    tickets: z.array(ticketMarked).min(1).max(severalAtMost),
    invoiceBatchId: z.uuid().optional(),
  }),
  answer: severalAnswer(invoiceLockRecordSchema),
});

// The viewers' reads of the same records (ADR-520 (3), 535 (6)): what the database shows the
// signed-in viewer and no more.
const viewerRead = { access: 'SIGNED_IN', roles: viewerOnly } as const;
const viewerPaged = z.strictObject({ after: z.uuid().optional(), limit: viewerPage });

// What the audit log holds of one ticket, as the database shows it to a client user or an auditor
// (ADR-544): the same changes the back office reads, with what this viewer reads of each row and
// nothing more, never why. A contractor user is shown none. A ticket the viewer isn't shown is not
// found.
export const viewerTicketHistoryEndpoint = endpoint({
  ...viewerRead,
  name: 'viewerTicketHistory',
  summary:
    'What the audit log holds of one ticket as the signed-in client user or auditor is shown it, newest first, a page at a time: each change to its records, the values before and after as this viewer reads them, who made it and from where; never why. A contractor user is shown none; a ticket the viewer isn’t shown is not found.',
  method: 'GET',
  path: '/viewer/projects/:projectId/tickets/:workflow/:ticketNumber/history',
  params: z.strictObject({
    projectId: z.uuid(),
    workflow: z.enum(workflows),
    ticketNumber: viewedNumber,
  }),
  query: z.strictObject({
    after: z
      .string()
      .regex(/^[1-9][0-9]{0,18}$/)
      .optional(),
    limit: viewerPage,
  }),
  answer: auditTrailAnswerSchema,
});

export const viewerCertificationsEndpoint = endpoint({
  ...viewerRead,
  name: 'viewerCertifications',
  summary:
    'A project’s certifications as the signed-in viewer is shown them, a page at a time, by cert number: each with its boxes, who it names by name and any revocation; never the driver’s phone or licence number. A contractor user is shown those naming its contractor.',
  method: 'GET',
  path: '/viewer/projects/:projectId/certifications',
  params: projectId,
  query: viewerPaged,
  answer: viewerCertificationsAnswerSchema,
});

export const viewerSurveysEndpoint = endpoint({
  ...viewerRead,
  name: 'viewerSurveys',
  summary:
    'A project’s surveys as the signed-in viewer is shown them, a page at a time, in the order they were made. A contractor user is shown none.',
  method: 'GET',
  path: '/viewer/projects/:projectId/surveys',
  params: projectId,
  query: viewerPaged,
  answer: viewerSurveysAnswerSchema,
});

export const viewerIncidentsEndpoint = endpoint({
  ...viewerRead,
  name: 'viewerIncidents',
  summary:
    'A project’s incidents as the signed-in viewer is shown them, a page at a time, in the order they were made. A contractor user is shown none.',
  method: 'GET',
  path: '/viewer/projects/:projectId/incidents',
  params: projectId,
  query: viewerPaged,
  answer: viewerIncidentsAnswerSchema,
});

export const viewerDropOffLogsEndpoint = endpoint({
  ...viewerRead,
  name: 'viewerDropOffLogs',
  summary:
    'A project’s citizen drop-off logs as the signed-in viewer is shown them, a page at a time, in the order they were made: the resident and where their debris came from only where the firm lets this viewer see private citizens by name. A contractor user is shown none.',
  method: 'GET',
  path: '/viewer/projects/:projectId/drop-off-logs',
  params: projectId,
  query: viewerPaged,
  answer: viewerDropOffLogsAnswerSchema,
});

export const viewerSetupEndpoint = endpoint({
  ...viewerRead,
  name: 'viewerSetup',
  summary:
    'A project’s setup as a client user or an auditor reads it: its forms and debris types, its pay items by code and description (never a rate), its sites and their facts, its contracts and their primes, its rules by name. Not found for a contractor user.',
  method: 'GET',
  path: '/viewer/projects/:projectId/setup',
  params: projectId,
  answer: viewerSetupAnswerSchema,
});

export const viewerSetupCheckEndpoint = endpoint({
  ...viewerRead,
  name: 'viewerSetupCheck',
  summary:
    'The setup check as a client user or an auditor reads it: everything the project’s setup leaves open, each in plain words. Not found for a contractor user.',
  method: 'GET',
  path: '/viewer/projects/:projectId/setup-check',
  params: projectId,
  answer: setupCheckAnswerSchema,
});

export const viewerQuantityLookupEndpoint = endpoint({
  ...viewerRead,
  name: 'viewerQuantityLookup',
  summary:
    'What each of the project’s sites’ phones ask for, as a client user or an auditor reads it. Not found for a contractor user.',
  method: 'GET',
  path: '/viewer/projects/:projectId/quantity-lookup',
  params: projectId,
  answer: quantityLookupAnswerSchema,
});

export const viewerPhotographFileEndpoint = endpoint({
  ...viewerRead,
  name: 'viewerPhotographFile',
  summary:
    'A photograph’s file, or its depth file, as kept, for a viewer the database shows the photograph’s record: the bytes that were stored, under the type their own first bytes said, sent as a download and never as a page. A photograph the viewer isn’t shown is not found.',
  method: 'GET',
  path: '/viewer/photographs/:photoId/files/:file',
  params: photoFileNamed,
  answersFile: true,
  answer: keptFileAnswerSchema,
});

export const endpoints: readonly Endpoint[] = [
  healthEndpoint,
  readinessEndpoint,
  requestPasswordResetEndpoint,
  completePasswordResetEndpoint,
  signInEndpoint,
  refreshSessionEndpoint,
  signOutEndpoint,
  currentSessionEndpoint,
  sessionCsrfEndpoint,
  changePasswordEndpoint,
  beginTwoStepSetupEndpoint,
  confirmTwoStepSetupEndpoint,
  removeOwnTwoStepEndpoint,
  clearTwoStepEndpoint,
  createPersonEndpoint,
  listPeopleEndpoint,
  readPersonEndpoint,
  changePersonEndpoint,
  setPermissionsEndpoint,
  setViewerProjectsEndpoint,
  setPersonPasswordEndpoint,
  endPersonSessionsEndpoint,
  archivePersonEndpoint,
  setPersonRoleEndpoint,
  unarchivePersonEndpoint,
  findClientsEndpoint,
  createClientEndpoint,
  changeClientEndpoint,
  findDeclarationEventsEndpoint,
  createDeclarationEventEndpoint,
  changeDeclarationEventEndpoint,
  createProjectEndpoint,
  listProjectsEndpoint,
  readProjectEndpoint,
  reviewQueueEndpoint,
  listFlagsEndpoint,
  readTicketEndpoint,
  readTicketDecisionsEndpoint,
  readTicketHistoryEndpoint,
  readRecordHistoryEndpoint,
  listSetAsideJobsEndpoint,
  changeProjectSettingsEndpoint,
  changeProjectWindowEndpoint,
  closingCheckEndpoint,
  closeProjectEndpoint,
  reopenProjectEndpoint,
  startNumberSeriesEndpoint,
  enterControlRangeEndpoint,
  archiveControlRangeEndpoint,
  addFieldTagEndpoint,
  findContractorsEndpoint,
  createContractorEndpoint,
  changeContractorEndpoint,
  addPrimeEndpoint,
  createContractEndpoint,
  changeContractEndpoint,
  addDebrisTypeEndpoint,
  addPayableTypeEndpoint,
  addListValueEndpoint,
  listListValuesEndpoint,
  renameListValueEndpoint,
  archiveListValueEndpoint,
  unarchiveListValueEndpoint,
  listFormsEndpoint,
  createFormEndpoint,
  changeFormEndpoint,
  addFormDebrisTypeEndpoint,
  changeFormDebrisTypeEndpoint,
  addFormDefinitionEndpoint,
  listPayItemsEndpoint,
  createPayItemEndpoint,
  listPayItemRatesEndpoint,
  changePayItemEndpoint,
  previewPayItemChangeEndpoint,
  setPayItemRateEndpoint,
  previewPayItemRateEndpoint,
  setCrewDayStepsEndpoint,
  savePaysWhenEndpoint,
  previewPaysWhenEndpoint,
  listRulesEndpoint,
  createRuleEndpoint,
  previewNewRuleEndpoint,
  changeRuleEndpoint,
  previewRuleChangeEndpoint,
  listSitesEndpoint,
  createSiteEndpoint,
  changeSiteEndpoint,
  giveSiteLabelEndpoint,
  removeSiteLabelEndpoint,
  listSiteShapesEndpoint,
  addSiteShapeEndpoint,
  siteShapeFileEndpoint,
  linkTippingFeeEndpoint,
  removeTippingFeeEndpoint,
  listMapVersionsEndpoint,
  loadMapEndpoint,
  readMapVersionEndpoint,
  mapVersionFileEndpoint,
  sendMapFileEndpoint,
  loadMapFileEndpoint,
  addSiteShapeFileEndpoint,
  loadEsriMapEndpoint,
  refreshEsriMapEndpoint,
  addSiteShapeFromEsriEndpoint,
  setupCheckEndpoint,
  quantityLookupEndpoint,
  siteQuantityLookupEndpoint,
  firmSettingsEndpoint,
  changePhoneKeyHoursEndpoint,
  changeViewerTwoStepEndpoint,
  changeMonitorSessionHoursEndpoint,
  listPhonesEndpoint,
  listPhoneSessionsEndpoint,
  enrolPhoneEndpoint,
  challengePhoneEndpoint,
  provePhoneEndpoint,
  provenPhoneEndpoint,
  createMonitorOnPhoneEndpoint,
  signInOnPhoneEndpoint,
  openPasscodeSessionOnPhoneEndpoint,
  takeOfflineSignInOnPhoneEndpoint,
  reportPasscodeUseEndpoint,
  signOutOnPhoneEndpoint,
  phoneMonitorEndpoint,
  phoneListsEndpoint,
  phoneLoginListEndpoint,
  phoneAddressLookupEndpoint,
  phoneSetupChoicesEndpoint,
  reportUnplannedAssignmentEndpoint,
  syncPhoneEndpoint,
  turnInPhoneEndpoint,
  photoFileEndpoint,
  sendPhotoFilePartEndpoint,
  renamePhoneEndpoint,
  removePhoneEndpoint,
  returnPhoneEndpoint,
  changeMasterPasscodeEndpoint,
  listAssignmentsEndpoint,
  writeAssignmentEndpoint,
  changeAssignmentEndpoint,
  withdrawAssignmentEndpoint,
  reinstateAssignmentEndpoint,
  searchBoardEndpoint,
  voidTicketEndpoint,
  unvoidTicketEndpoint,
  acceptFlagEndpoint,
  withdrawAcceptanceEndpoint,
  setQcStatusEndpoint,
  setQcStatusesEndpoint,
  listInvoiceBatchesEndpoint,
  createInvoiceBatchEndpoint,
  readInvoiceBatchEndpoint,
  renameInvoiceBatchEndpoint,
  lockAsInvoicedEndpoint,
  lockSeveralAsInvoicedEndpoint,
  setLockBatchEndpoint,
  unlockInvoicedEndpoint,
  reprocessTicketsEndpoint,
  readFieldEventEndpoint,
  correctFieldEventEndpoint,
  renumberFieldEventEndpoint,
  correctItemLineEndpoint,
  correctCarriedTicketEndpoint,
  correctWaypointEndpoint,
  markPhotographEndpoint,
  photographFileEndpoint,
  addPhotographEndpoint,
  readScaleReceiptEndpoint,
  correctScaleReceiptEndpoint,
  correctRoeEndpoint,
  correctRoeScopeEndpoint,
  correctSurveyEndpoint,
  correctIncidentEndpoint,
  correctDropOffLogEndpoint,
  renumberQuarantinedRecordEndpoint,
  markSecondCopyEndpoint,
  listHeldRecordsEndpoint,
  saveHeldRecordEndpoint,
  closeHeldRecordEndpoint,
  listSetAsideFilesEndpoint,
  setAsideFileEndpoint,
  closeSetAsideFileEndpoint,
  listQuarantinedRecordsEndpoint,
  createFieldEventEndpoint,
  listRoesEndpoint,
  createRoeEndpoint,
  listSurveysEndpoint,
  createSurveyEndpoint,
  listIncidentsEndpoint,
  createIncidentEndpoint,
  listDropOffLogsEndpoint,
  createDropOffLogEndpoint,
  listCertificationsEndpoint,
  createCertificationEndpoint,
  readCertificationEndpoint,
  correctCertificationEndpoint,
  correctCertificationBoxEndpoint,
  addCertificationBoxEndpoint,
  markSignaturesOnFileEndpoint,
  revokeCertificationEndpoint,
  unrevokeCertificationEndpoint,
  viewerProjectsEndpoint,
  viewerRoesEndpoint,
  viewerTicketHistoryEndpoint,
  viewerCertificationsEndpoint,
  viewerSurveysEndpoint,
  viewerIncidentsEndpoint,
  viewerDropOffLogsEndpoint,
  viewerSetupEndpoint,
  viewerSetupCheckEndpoint,
  viewerQuantityLookupEndpoint,
  viewerTicketsEndpoint,
  viewerTicketEndpoint,
  viewerPhotographFileEndpoint,
];
