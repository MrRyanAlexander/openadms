// Every endpoint of the API, said once (ARCHITECTURE §6, Input; REQ-004; AC-10-34, 36; T-12, T-28;
// ADR-387): its method, its path, the schema of each thing it takes (the path's parameters, the
// query, the body) and of what it answers. The API serves a route only through one of these and
// checks what was sent against it before any service runs; the OpenAPI description is made from
// this list (openapi.ts). An object a caller sends is strict: a field its schema doesn't name
// refuses the whole request, and an endpoint whose schema would let one through can't be defined.
import {
  assignmentFormDocumentTypes,
  backOfficeCreated,
  backOfficeRolesChanged,
  crewTimeConversions,
  fieldEventKinds,
  incidentOffers,
  measuredAs,
  numberSeries,
  permissions,
  phoneRemovals,
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
  healthAnswerSchema,
  masterPasscodeAnswerSchema,
  phoneChallengeAnswerSchema,
  monitorCreatedAnswerSchema,
  monitorSignedInAnswerSchema,
  phoneAddressLookupAnswerSchema,
  phoneListsAnswerSchema,
  phoneLoginListAnswerSchema,
  phoneMonitorAnswerSchema,
  unplannedAssignmentAnswerSchema,
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
import { places } from './field-event-details.ts';
import { formDefinitionFields } from './form-definition.ts';
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
  roeRecordSchema,
  roeScopeItemRecordSchema,
  scaleReceiptRecordSchema,
  surveyRecordSchema,
  ticketUnvoidRecordSchema,
  ticketVoidRecordSchema,
} from './review-answers.ts';
import {
  billingUnits,
  clientRecordSchema,
  contractorKinds,
  contractorPlaceRecordSchema,
  contractorRecordSchema,
  contractRecordSchema,
  controlRangeRecordSchema,
  declarationEventRecordSchema,
  fieldTagRecordSchema,
  formDebrisTypeRecordSchema,
  formDefinitionRecordSchema,
  formDocumentTypes,
  formRecordSchema,
  foundAnswer,
  listValueRecordSchema,
  mapSources,
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
// below: both are read from the database on every request (ADR-443).
export const endpointAccess = [
  'ANYBODY',
  'SIGNED_IN',
  'REFRESH_TOKEN',
  'PROVEN_PHONE',
  'MONITOR_ON_PHONE',
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
  readonly method: EndpointMethod;
  // From the root, a parameter written `:name`: `/projects/:projectId`.
  readonly path: string;
  // What it takes. One left out means none is taken: a query or a body sent anyway is refused.
  readonly params?: z.ZodObject;
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
  readonly answer: z.ZodType;
}

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

// What a request sent, as the endpoint's schemas read it; undefined when any part is refused.
export function taken(served: Endpoint, sent: Sent): Sent | undefined {
  const params = (served.params ?? nothing).safeParse(sent.params ?? {});
  const query = (served.query ?? nothing).safeParse(sent.query ?? {});
  const body =
    served.body === undefined
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
    'The firm’s people, a page at a time, in the order they were added: those in service, or the archived ones. A monitor’s phone number is in an admin’s answer only.',
  access: 'SIGNED_IN',
  roles: backOfficeRoles,
  method: 'GET',
  path: '/people',
  query: z.strictObject({
    role: z.enum(['ADMIN', 'MANAGER_ANALYST', 'MONITOR', 'READ_ONLY_VIEWER']).optional(),
    archived: z.enum(['true', 'false']).optional(),
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
    'An admin changes a person’s name, email address or phone number, and a read-only viewer’s kind, contractor and whether they see private citizens by name. Only what is stated changes. A changed sign-in address is told to the old one where the firm has mail.',
  access: 'SIGNED_IN',
  roles: adminOnly,
  method: 'PATCH',
  path: '/people/:userId',
  params: personId,
  body: z
    .strictObject({
      name: newPerson.name.optional(),
      email: newPerson.email.optional(),
      phone: z.string().trim().min(1).max(40).nullable().optional(),
      viewerKind: z.enum(['CLIENT', 'CONTRACTOR', 'AUDITOR']).optional(),
      contractorId: z.uuid().optional(),
      seesPrivateCitizens: z.boolean().optional(),
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
// The start of what a search matches, anywhere in the name; left out, everything not archived.
const searched = z.strictObject({ search: z.string().trim().max(200).optional() });
const projectId = z.strictObject({ projectId: z.uuid() });
// A number of a series: the database says where a series may start and end.
const seriesNumber = z.number().int().min(1).max(2_000_000_000);
const once = (values: readonly string[]): boolean => new Set(values).size === values.length;
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
      loadCallLowLimit: z.number().int().nullable().optional(),
      loadCallHighLimit: z.number().int().nullable().optional(),
      stumpFillDepthInches: z.number().int().optional(),
      stumpCheckRootBallWider: z.boolean().optional(),
      stumpCheckFillNeedsExposure: z.boolean().optional(),
      siteCircleMeters: z.number().int().optional(),
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

export const closeProjectEndpoint = endpoint({
  ...setup,
  name: 'closeProject',
  summary: 'Closes a project: the mark and its time. Nothing under it is deleted or refused after.',
  method: 'POST',
  path: '/projects/:projectId/closings',
  params: projectId,
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
    enabled: z.boolean(),
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

// The second spelling is archived, pointing at the one kept; nothing is deleted (ADR-108, 321).
export const mergeContractorEndpoint = endpoint({
  ...setup,
  name: 'mergeContractor',
  summary:
    'Merges a sub typed twice at certification into the contractor that is kept: the kept one takes its place on each project, the certifications that named it name the kept one, and it is archived. The tickets of those certifications not locked as invoiced are queued.',
  method: 'POST',
  path: '/contractors/:contractorId/merges',
  params: z.strictObject({ contractorId: z.uuid() }),
  body: z.strictObject({ intoContractorId: z.uuid() }),
  answer: savedAnswer(contractorRecordSchema),
});

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
    'Links a site to a tipping fee pay item written from it: how a fee line is told from a hauling line. A site may keep several.',
  method: 'POST',
  path: '/sites/:siteId/tipping-fees',
  params: siteId,
  body: z.strictObject({ payItemId: z.uuid() }),
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

// The setup as it stands (AC-01-69…77; ADR-229, 423, 426): the setup check and what each site's
// phones ask for. They read and change nothing, and hold no rate: **open to every admin and
// manager/analyst, whether or not they hold Setup**, since whoever reviews a ticket that paid
// nothing needs the list that says why.
const standing = { access: 'SIGNED_IN', roles: backOfficeRoles } as const;

export const setupCheckEndpoint = endpoint({
  ...standing,
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
    'The firm’s phones, a page at a time, in the order they were enrolled: those in service, or those taken out of it. Each says which version of the master passcode’s check it holds.',
  access: 'SIGNED_IN',
  roles: backOfficeRoles,
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
// one whose key is revoked does not. The limits here only bound what is read.
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
    'A phone proves itself: it sends back the challenge it was made and its signature over it. The answer is a token for that phone, good for the policy’s minutes, which the calls of its sync carry as Authorization: Bearer. A challenge is good once. A proof that isn’t one is refused by one code, whatever the reason; a phone taken out of service still proves itself, one whose key is revoked does not.',
  access: 'ANYBODY',
  method: 'POST',
  path: '/phones/:deviceId/proofs',
  params: phoneNamed,
  body: z.strictObject({
    challenge: z.string().min(1).max(400),
    signature: z.string().min(1).max(400),
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
    masterPasscodeVersion: z.number().int().min(1).nullable(),
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

export const removePhoneEndpoint = endpoint({
  name: 'removePhone',
  summary:
    'A phone is taken out of service, as lost or retired, from this moment. Its record is kept; what it made later is received and flagged, never refused. Refused for a phone already out of service.',
  ...dispatch,
  method: 'POST',
  path: '/phones/:deviceId/removals',
  params: z.strictObject({ deviceId: z.uuid() }),
  body: z.strictObject({
    status: z.enum(phoneRemovals),
    // Why, in the person's own words: kept beside the change in the audit log.
    note: z.string().trim().min(1).max(500).optional(),
  }),
  answer: savedAnswer(phoneRecordSchema),
});

// The firm's one master passcode (ADR-106). A change is a new version: no earlier one is edited
// or removed, and each phone's check moves to it at its next sync. Whoever changes it gives
// their own password again (ASVS 5.0 7.5.1), and every admin is told by mail where the firm
// has any (ASVS 6.3.7).
export const changeMasterPasscodeEndpoint = endpoint({
  name: 'changeMasterPasscode',
  summary:
    'An admin changes the firm’s master passcode, giving their own password again. A new version is kept, as a slow hash only; each phone’s check moves to it at its next sync. Refused for a passcode under 8 or over 128 characters, or known from breaches.',
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
const assignedWork = {
  // The kinds of field event they may record; none on a certifier's or a helper's day.
  fieldEventKinds: z.array(z.enum(fieldEventKinds)).max(fieldEventKinds.length).refine(once),
  certifying: z.boolean(),
  // The forms that are no ticket's (ADR-308).
  formDocumentTypes: z
    .array(z.enum(assignmentFormDocumentTypes))
    .max(assignmentFormDocumentTypes.length)
    .refine(once),
  // One of the project's own sites, where the work is at one; null on a curb collection.
  siteId: z.uuid().nullable(),
  // The phone, where one is named; null where they sign in on whichever they pick up.
  deviceId: z.uuid().nullable(),
  // The project's unit rate pay items they do that day, each once.
  payItemIds: z.array(z.uuid()).max(200).refine(once),
};

export const listAssignmentsEndpoint = endpoint({
  name: 'listAssignments',
  summary:
    'One project’s dispatch board for one day, a page at a time, in the order the assignments were written: those that stand, or the withdrawn ones. One made on a phone under the master passcode is among them, marked unplanned.',
  access: 'SIGNED_IN',
  roles: backOfficeRoles,
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
    'An assignment is withdrawn from the board, from this moment. It is kept, and so is everything recorded under it. Refused for one already withdrawn and for one made on a phone.',
  ...dispatch,
  method: 'POST',
  path: '/assignments/:assignmentId/withdrawals',
  params: assignmentId,
  answer: savedAnswer(assignmentRecordSchema),
});

// An unplanned assignment, reported by the phone it was made on (ARCHITECTURE §7's note, §7.5,
// §9 (3), (4), §10; AC-02-38, AC-05-40; BACKLOG 2.5.4, C46; ADR-240, 438, 456, 457). A monitor
// had no assignment, and whoever holds the master passcode set the phone up on the spot: a
// project, their work, one site, and the monitor from the phone's login list, with or without
// a connection. The phone checked the passcode against its own check; the server is not sent
// it and takes the phone's word, the phone having proved itself with its device key. The id is
// the phone's own, so the same report sent again is answered "already saved" and kept once. The
// day is the day the phone's clock said, in the project's time zone. Nobody need be signed in.
// The limits here only bound what is read.
export const reportUnplannedAssignmentEndpoint = endpoint({
  name: 'reportUnplannedAssignment',
  summary:
    'A phone reports an unplanned assignment made on it under the firm’s master passcode, when its monitor had none: the project, the monitor, their work (the kinds of field event, certifying, the forms, the unit rate pay items), one site where the work is at one, and when it was made by the phone’s own clock, with the clock’s offset. The id is the phone’s own: the same report sent again is answered as already saved and kept once. It is kept as the phone reports it, marked unplanned on the dispatch board and never flagged, for a phone out of service too; its day is the day the phone’s clock said, in the project’s time zone. It is not saved only where something it names is no record of the kind it must be, or its id is another record’s. The passcode itself is never sent: the phone checked it. Each one saved is two security events at the phone’s own time: a phone set up, and a use of the master passcode. Open to a phone that has proved itself, by its token; nobody need be signed in.',
  access: 'PROVEN_PHONE',
  method: 'POST',
  path: '/phones/current/unplanned-assignments',
  body: z.strictObject({
    // Made on the phone, so that what it records under the assignment can name it at once.
    id: z.uuid(),
    projectId: z.uuid(),
    // The monitor, picked from the phone's login list.
    personId: z.uuid(),
    fieldEventKinds: assignedWork.fieldEventKinds,
    certifying: assignedWork.certifying,
    formDocumentTypes: assignedWork.formDocumentTypes,
    siteId: assignedWork.siteId,
    payItemIds: assignedWork.payItemIds,
    // The phone's clock when it was made, as a UTC instant, and how far that clock stood from
    // UTC, in minutes (ADR-100): UTC−12:00 to UTC+14:00.
    madeAt: z.iso.datetime(),
    deviceUtcOffsetMinutes: z.number().int().min(-720).max(840),
  }),
  answer: unplannedAssignmentAnswerSchema,
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
// AC-08-19, 21, 25, 26; AC-10-27, 28, 37; BACKLOG 2.4.4, C66, C79, C105; ADR-022, 149, 156, 327,
// 338, 364, 432). **A correction and a record created in the back office take `CORRECT`;
// resolving a quarantined record takes `RENUMBER`**, as their services ask again. Not here,
// because no service does it yet (BACKLOG C79): an ROE's number corrected, the answers to a
// form's own fields corrected, and an ROE, a survey, an incident or a drop-off log created in
// the back office.
const roeId = z.strictObject({ roeId: z.uuid() });

export const correctRoeEndpoint = endpoint({
  name: 'correctRoe',
  summary:
    'An ROE is corrected in place: its parcel, address, owner, whether and when it was signed, and its notes; only what is stated changes, and `null` empties a detail that may be empty. Every ticket on it is queued; one locked as invoiced is left as it is. Never its number.',
  ...reviewer,
  permission: 'CORRECT',
  method: 'PATCH',
  path: '/roes/:roeId',
  params: roeId,
  body: z.strictObject({
    changes: z
      .strictObject({
        parcelId: numberAsWritten.nullable(),
        address: typed.nullable(),
        ownerName: named.nullable(),
        signed: z.boolean(),
        signedDate: day.nullable(),
        notes: typed.nullable(),
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
    'A survey is corrected in place: its work type, its survey number, the ROE number it names and its notes; only what is stated changes. A corrected ROE number finds its ROE again. The project’s surveys are checked again on the next run. Never the answers to the firm’s own fields.',
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
    'An incident is corrected in place: its type and sub-type, what happened, who was involved, where, the contractor, cert number and ROE number it names, and its notes; only what is stated changes. A corrected cert number finds its certification again, an ROE number its ROE. It is on no ticket, so nothing is queued. Never the answers to the firm’s own fields.',
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
    'A citizen drop-off log is corrected in place: its site, the resident’s name, where the debris came from and its notes; only what is stated changes. It is on no ticket, so nothing is queued. Refused for a site of another project.',
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

// The back office's changes to a certification (spec/parts/03-certification.md steps 10…13;
// AC-03-38, 55; AC-10-27, 28, 35, 37; BACKLOG 2.4.4, C106; ADR-079, 080, 082, 364, 433). **A
// measuring mistake takes `CORRECT`, signatures on file take `QC`, and a revocation is an
// admin's alone**: no permission opens it to a manager/analyst. Each service asks again inside
// its own piece of work. **Nobody sends a capacity**: it is worked out again from the boxes, and
// measurements that give none are answered `NOT_SAVED` in the domain's own words. Not here: a
// certification is made, and a modified truck certified again, on a phone, so both arrive with
// its sync (BACKLOG 2.6.2); its QC status is `setQcStatus`'s.
const certificationId = z.strictObject({ certificationId: z.uuid() });
// A whole number of inches, 1 or more (adms-certifications §3A.3).
const inches = z.number().int().min(1).max(9999);

export const correctCertificationBoxEndpoint = endpoint({
  name: 'correctCertificationBox',
  summary:
    'A measuring mistake on one of a container certification’s boxes is corrected in place (box 0 is the primary): only the measurements stated change, in whole inches, and the capacity is worked out again from the boxes, never sent. Every ticket that scanned the certification is queued where the capacity changed; one locked as invoiced is left as it is. Refused for a box the certification doesn’t have, for measurements that give no capacity and for a measurement the box’s shape doesn’t hold. Never a box’s shape, its sign or its feature.',
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
        // How many radius corners.
        corners: z.number().int().min(1).max(99),
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

export const endpoints: readonly Endpoint[] = [
  healthEndpoint,
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
  findDeclarationEventsEndpoint,
  createDeclarationEventEndpoint,
  createProjectEndpoint,
  changeProjectSettingsEndpoint,
  changeProjectWindowEndpoint,
  closeProjectEndpoint,
  startNumberSeriesEndpoint,
  enterControlRangeEndpoint,
  archiveControlRangeEndpoint,
  addFieldTagEndpoint,
  findContractorsEndpoint,
  createContractorEndpoint,
  addPrimeEndpoint,
  createContractEndpoint,
  addDebrisTypeEndpoint,
  addPayableTypeEndpoint,
  createFormEndpoint,
  addFormDebrisTypeEndpoint,
  addFormDefinitionEndpoint,
  createPayItemEndpoint,
  changePayItemEndpoint,
  setPayItemRateEndpoint,
  savePaysWhenEndpoint,
  createRuleEndpoint,
  changeRuleEndpoint,
  mergeContractorEndpoint,
  createSiteEndpoint,
  changeSiteEndpoint,
  addSiteShapeEndpoint,
  linkTippingFeeEndpoint,
  loadMapEndpoint,
  setupCheckEndpoint,
  quantityLookupEndpoint,
  siteQuantityLookupEndpoint,
  listPhonesEndpoint,
  enrolPhoneEndpoint,
  challengePhoneEndpoint,
  provePhoneEndpoint,
  provenPhoneEndpoint,
  createMonitorOnPhoneEndpoint,
  signInOnPhoneEndpoint,
  signOutOnPhoneEndpoint,
  phoneMonitorEndpoint,
  phoneListsEndpoint,
  phoneLoginListEndpoint,
  phoneAddressLookupEndpoint,
  reportUnplannedAssignmentEndpoint,
  removePhoneEndpoint,
  changeMasterPasscodeEndpoint,
  listAssignmentsEndpoint,
  writeAssignmentEndpoint,
  changeAssignmentEndpoint,
  withdrawAssignmentEndpoint,
  voidTicketEndpoint,
  unvoidTicketEndpoint,
  acceptFlagEndpoint,
  setQcStatusEndpoint,
  createInvoiceBatchEndpoint,
  lockAsInvoicedEndpoint,
  setLockBatchEndpoint,
  unlockInvoicedEndpoint,
  correctFieldEventEndpoint,
  renumberFieldEventEndpoint,
  correctItemLineEndpoint,
  correctCarriedTicketEndpoint,
  markPhotographEndpoint,
  correctScaleReceiptEndpoint,
  correctRoeEndpoint,
  correctRoeScopeEndpoint,
  correctSurveyEndpoint,
  correctIncidentEndpoint,
  correctDropOffLogEndpoint,
  renumberQuarantinedRecordEndpoint,
  markSecondCopyEndpoint,
  createFieldEventEndpoint,
  correctCertificationBoxEndpoint,
  markSignaturesOnFileEndpoint,
  revokeCertificationEndpoint,
  viewerProjectsEndpoint,
  viewerRoesEndpoint,
  viewerTicketsEndpoint,
  viewerTicketEndpoint,
];
