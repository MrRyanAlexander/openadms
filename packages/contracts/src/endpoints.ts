// Every endpoint of the API, said once (ARCHITECTURE §6, Input; REQ-004; AC-10-34, 36; T-12, T-28;
// ADR-387): its method, its path, the schema of each thing it takes (the path's parameters, the
// query, the body) and of what it answers. The API serves a route only through one of these and
// checks what was sent against it before any service runs; the OpenAPI description is made from
// this list (openapi.ts). An object a caller sends is strict: a field its schema doesn't name
// refuses the whole request, and an endpoint whose schema would let one through can't be defined.
import {
  backOfficeCreated,
  crewTimeConversions,
  incidentOffers,
  numberSeries,
  permissions,
  ruleActionKinds,
  ruleCriterionKeys,
  ruleOperators,
  workflows,
  type PermissionName,
} from '@open-adms/domain';
import { z } from 'zod';

import {
  csrfAnswerSchema,
  healthAnswerSchema,
  passwordSetAnswerSchema,
  personAnswerSchema,
  resetAskedAnswerSchema,
  sessionAnswerSchema,
  sessionsEndedAnswerSchema,
  signedOutAnswerSchema,
  twoStepClearedAnswerSchema,
  twoStepSetupAnswerSchema,
} from './api-answers.ts';
import { formDefinitionFields } from './form-definition.ts';
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
  numberSeriesRecordSchema,
  payItemRateRecordSchema,
  payItemRecordSchema,
  projectRecordSchema,
  quantityFroms,
  rulesKeptRecordSchema,
  savedAnswer,
  savedRuleRecordSchema,
  ticketNumberSources,
} from './setup-answers.ts';

// No endpoint deletes (invariant 1).
export const endpointMethods = ['GET', 'POST', 'PUT', 'PATCH'] as const;

export type EndpointMethod = (typeof endpointMethods)[number];

// Who may call an endpoint (ARCHITECTURE §6; AC-10-27; ADR-408), checked before anything it was
// sent is read. `ANYBODY`: nobody need be signed in. `SIGNED_IN`: a back-office or outside user's
// session, by its access token. `REFRESH_TOKEN`: the session's refresh token, for the calls that
// keep a session going or end it. With either of the last two, a call that isn't a GET carries
// the session's CSRF value.
export const endpointAccess = ['ANYBODY', 'SIGNED_IN', 'REFRESH_TOKEN'] as const;

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

// Each task that adds an endpoint names it here; the API's tests hold its routes to this list.
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
  readPersonEndpoint,
  setPermissionsEndpoint,
  setViewerProjectsEndpoint,
  setPersonPasswordEndpoint,
  endPersonSessionsEndpoint,
  archivePersonEndpoint,
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
];
