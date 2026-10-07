// Every endpoint of the API, said once (ARCHITECTURE §6, Input; REQ-004; AC-10-34, 36; T-12, T-28;
// ADR-387): its method, its path, the schema of each thing it takes (the path's parameters, the
// query, the body) and of what it answers. The API serves a route only through one of these and
// checks what was sent against it before any service runs; the OpenAPI description is made from
// this list (openapi.ts). An object a caller sends is strict: a field its schema doesn't name
// refuses the whole request, and an endpoint whose schema would let one through can't be defined.
import { z } from 'zod';

import { healthAnswerSchema } from './api-answers.ts';

// No endpoint deletes (invariant 1).
export const endpointMethods = ['GET', 'POST', 'PUT', 'PATCH'] as const;

export type EndpointMethod = (typeof endpointMethods)[number];

export interface Endpoint {
  // Its name in the OpenAPI description, unique in the list.
  readonly name: string;
  readonly summary: string;
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
  method: 'GET',
  path: '/health',
  answer: healthAnswerSchema,
});

// Each task that adds an endpoint names it here; the API's tests hold its routes to this list.
export const endpoints: readonly Endpoint[] = [healthEndpoint];
