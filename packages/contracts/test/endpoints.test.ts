// The endpoints and what each takes (ARCHITECTURE §6, Input; acceptance file 10, AC-10-34, 36;
// T-12, T-28; ADR-387, 388): a request is read by its endpoint's schemas, part by part, and a
// field nobody named refuses all of it; an endpoint that would let one through can't be defined;
// the OpenAPI description says exactly what the endpoints say.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  endpoint,
  endpointMethods,
  endpoints,
  errorAnswerSchema,
  healthAnswerSchema,
  healthEndpoint,
  openApiDocument,
  taken,
} from '../src/index.ts';

// A test's own endpoint, shaped like a correction a reviewer sends: a ticket in the path, the
// project in the query, the change and its reason in the body.
const correction = endpoint({
  name: 'testCorrection',
  summary: 'A test’s own.',
  access: 'ANYBODY',
  method: 'PATCH',
  path: '/tickets/:ticketNumber',
  params: z.strictObject({ ticketNumber: z.string().regex(/^\d{6}$/) }),
  query: z.strictObject({ project: z.string().min(1), page: z.coerce.number().int().optional() }),
  body: z.strictObject({
    reason: z.string().min(1),
    change: z.strictObject({ loadCall: z.number().int().min(0).max(100) }),
  }),
  answer: healthAnswerSchema,
});

const sent = {
  params: { ticketNumber: '101001' },
  query: { project: 'P1' },
  body: { reason: 'Misread at the tower', change: { loadCall: 80 } },
};

describe('what a request sent, as its endpoint reads it', () => {
  it('AC-10-36: the path, the query and the body are each read by their schema', () => {
    expect(taken(correction, sent)).toEqual(sent);
    expect(taken(correction, { ...sent, query: { project: 'P1', page: '2' } })?.query).toEqual({
      project: 'P1',
      page: 2,
    });
    expect(taken(correction, { ...sent, params: { ticketNumber: '10100A' } })).toBeUndefined();
    expect(taken(correction, { ...sent, query: {} })).toBeUndefined();
    expect(taken(correction, { ...sent, query: { project: ['P1', 'P2'] } })).toBeUndefined();
    expect(taken(correction, { ...sent, body: undefined })).toBeUndefined();
    expect(
      taken(correction, { ...sent, body: { ...sent.body, change: { loadCall: 140 } } }),
    ).toBeUndefined();
  });

  it('AC-10-34: a field its schema doesn’t name refuses the whole request, wherever it is', () => {
    for (const refused of [
      { ...sent, body: { ...sent.body, amount: 412.5 } },
      { ...sent, body: { ...sent.body, change: { loadCall: 80, certifiedCapacity: 60 } } },
      { ...sent, query: { project: 'P1', rate: '7.25' } },
      { ...sent, params: { ticketNumber: '101001', status: 'COMPLETED' } },
    ]) {
      expect(taken(correction, refused)).toBeUndefined();
    }
  });

  it('AC-10-36: an endpoint that names no query and no body takes none', () => {
    const nothing = { params: {}, query: {}, body: undefined };
    expect(taken(healthEndpoint, nothing)).toEqual(nothing);
    // As the server hands them over when nothing was sent.
    expect(taken(healthEndpoint, { params: undefined, query: undefined, body: undefined })).toEqual(
      nothing,
    );
    expect(taken(healthEndpoint, { ...nothing, query: { verbose: '1' } })).toBeUndefined();
    expect(taken(healthEndpoint, { ...nothing, body: {} })).toBeUndefined();
    expect(taken(healthEndpoint, { ...nothing, params: { id: '1' } })).toBeUndefined();
  });
});

describe('an endpoint is defined whole, or not at all', () => {
  const base = {
    name: 'test',
    summary: 'A test’s own.',
    access: 'ANYBODY',
    method: 'POST',
    answer: healthAnswerSchema,
  } as const;

  it('AC-10-34: one whose body, query or parameters would take an unnamed field is refused', () => {
    const open = [
      { path: '/a', body: z.object({ reason: z.string() }) },
      { path: '/a', body: z.looseObject({ reason: z.string() }) },
      { path: '/a', body: z.strictObject({ change: z.object({ loadCall: z.number() }) }) },
      { path: '/a', body: z.array(z.object({ reason: z.string() })) },
      { path: '/a', body: z.record(z.string(), z.unknown()) },
      { path: '/a', query: z.object({ project: z.string() }) },
      { path: '/a/:id', params: z.object({ id: z.string() }) },
    ] as const;
    for (const part of open) {
      expect(() => endpoint({ ...base, ...part })).toThrow('would take a field nobody named');
    }
    // A record of named kinds of value is not open: its keys are the data.
    expect(() =>
      endpoint({ ...base, path: '/a', body: z.record(z.string(), z.number()) }),
    ).not.toThrow();
  });

  it('AC-10-36: a path’s parameters and their schema say the same names', () => {
    const parts: { path: string; params?: z.ZodObject }[] = [
      { path: '/a/:id' },
      { path: '/a', params: z.strictObject({ id: z.string() }) },
      { path: '/a/:id', params: z.strictObject({ other: z.string() }) },
      { path: 'a' },
    ];
    for (const part of parts) {
      expect(() => endpoint({ ...base, ...part })).toThrow('its path and its parameters');
    }
  });

  it('no endpoint deletes, and each has its own name and its own route', () => {
    expect(endpointMethods).toEqual(['GET', 'POST', 'PUT', 'PATCH']);
    expect(new Set(endpoints.map(({ name }) => name)).size).toBe(endpoints.length);
    expect(new Set(endpoints.map(({ method, path }) => `${method} ${path}`)).size).toBe(
      endpoints.length,
    );
  });
});

describe('the OpenAPI description', () => {
  it('AC-10-36: says each endpoint’s path, query, body and answer from its schemas', () => {
    const document = openApiDocument([correction]) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
    };
    expect(Object.keys(document.paths)).toEqual(['/tickets/{ticketNumber}']);
    const operation = document.paths['/tickets/{ticketNumber}']?.['patch'];
    expect(operation?.['operationId']).toBe('testCorrection');
    expect(operation?.['parameters']).toMatchObject([
      {
        name: 'ticketNumber',
        in: 'path',
        required: true,
        schema: { type: 'string', pattern: '^\\d{6}$' },
      },
      { name: 'project', in: 'query', required: true, schema: { type: 'string', minLength: 1 } },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
    ]);
    expect(operation?.['requestBody']).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['reason', 'change'],
            additionalProperties: false,
            properties: {
              change: {
                additionalProperties: false,
                properties: { loadCall: { type: 'integer', minimum: 0, maximum: 100 } },
              },
            },
          },
        },
      },
    });
  });

  it('AC-10-36: lists every endpoint, and a refusal as the plain code and the request’s id', () => {
    const document = openApiDocument() as {
      openapi: string;
      paths: Record<string, Record<string, { operationId: string; responses: object }>>;
      components: { schemas: { ErrorAnswer: { properties: { code: { enum: string[] } } } } };
    };
    expect(document.openapi).toBe('3.1.0');
    const listed = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, { operationId }]) => [operationId, method, path]),
    );
    expect(listed).toEqual(
      endpoints.map(({ name, method, path }) => [
        name,
        method.toLowerCase(),
        path.replaceAll(/:(\w+)/g, '{$1}'),
      ]),
    );
    expect(document.paths['/health']?.['get']?.responses).toMatchObject({
      200: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { status: { type: 'string', const: 'ok' } },
              additionalProperties: false,
            },
          },
        },
      },
      default: {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorAnswer' } } },
      },
    });
    expect(document.components.schemas.ErrorAnswer.properties.code.enum).toEqual(
      errorAnswerSchema.shape.code.options,
    );
  });
});
