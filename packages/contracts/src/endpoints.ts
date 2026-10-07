// Every endpoint of the API, said once (ARCHITECTURE §6, Input; REQ-004; AC-10-34, 36; T-12, T-28;
// ADR-387): its method, its path, the schema of each thing it takes (the path's parameters, the
// query, the body) and of what it answers. The API serves a route only through one of these and
// checks what was sent against it before any service runs; the OpenAPI description is made from
// this list (openapi.ts). An object a caller sends is strict: a field its schema doesn't name
// refuses the whole request, and an endpoint whose schema would let one through can't be defined.
import { z } from 'zod';

import {
  csrfAnswerSchema,
  healthAnswerSchema,
  passwordSetAnswerSchema,
  resetAskedAnswerSchema,
  sessionAnswerSchema,
  signedOutAnswerSchema,
  twoStepClearedAnswerSchema,
  twoStepSetupAnswerSchema,
} from './api-answers.ts';

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

export interface Endpoint {
  // Its name in the OpenAPI description, unique in the list.
  readonly name: string;
  readonly summary: string;
  readonly access: EndpointAccess;
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
  return defined;
}

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
  method: 'POST',
  path: '/people/:userId/two-step-clearings',
  params: z.strictObject({ userId: z.uuid() }),
  answer: twoStepClearedAnswerSchema,
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
];
