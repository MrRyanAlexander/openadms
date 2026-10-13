// The endpoints and what each takes (ARCHITECTURE §6, Input; acceptance file 10, AC-10-34, 36;
// T-12, T-28; ADR-387, 388): a request is read by its endpoint's schemas, part by part, and a
// field nobody named refuses all of it; an endpoint that would let one through can't be defined;
// the OpenAPI description says exactly what the endpoints say.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  addSiteShapeFileEndpoint,
  endpoint,
  endpointMethods,
  endpoints,
  errorAnswerSchema,
  filePartMediaType,
  healthAnswerSchema,
  healthEndpoint,
  loadMapFileEndpoint,
  notTaken,
  openApiDocument,
  answerFileTypes,
  photoFileAnswerSchema,
  photographFileEndpoint,
  sendMapFileEndpoint,
  sendPhotoFilePartEndpoint,
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

  it('AC-10-37: a request that isn’t taken is told which field of which part was refused and how, in the contracts’ own words: a limit is the schema’s, a field is named only where the schema names it, and nothing sent is said back', () => {
    expect(notTaken(correction, sent)).toBeUndefined();
    const why = (changed: object) => notTaken(correction, { ...sent, ...changed });
    expect(why({ body: { ...sent.body, change: { loadCall: 140 } } })).toBe(
      'Not taken: change.loadCall in the body can’t be more than 100.',
    );
    expect(why({ body: { ...sent.body, reason: '' } })).toBe(
      'Not taken: reason in the body is blank.',
    );
    expect(why({ body: { change: { loadCall: 80 } } })).toBe(
      'Not taken: reason in the body is missing.',
    );
    expect(why({ body: undefined })).toBe('Not taken: the body is missing.');
    expect(why({ body: [] })).toBe(
      'Not taken: the body isn’t the kind of value this request takes.',
    );
    expect(why({ params: { ticketNumber: '10100A' } })).toBe(
      'Not taken: ticketNumber in the path isn’t written the way this request takes it.',
    );
    expect(why({ query: {} })).toBe('Not taken: project in the query is missing.');
    expect(why({ query: { project: ['P1', 'P2'] } })).toBe(
      'Not taken: project in the query isn’t the kind of value this request takes.',
    );
    // A field nobody named is never named back, wherever it is; neither is a value.
    const unnamed = why({
      body: { ...sent.body, amount: 412.5, change: { loadCall: 80, certifiedCapacity: 60 } },
      query: { project: 'P1', rate: '7.25' },
    });
    expect(unnamed).toBe(
      'Not taken: the query has a field this request doesn’t take; change in the body has a field this request doesn’t take; the body has a field this request doesn’t take.',
    );
    expect(unnamed).not.toMatch(/amount|certifiedCapacity|rate|412|7\.25/);
    // Three are said, and how many more there are.
    expect(why({ params: {}, query: {}, body: { reason: '', change: { loadCall: -1 } } })).toBe(
      'Not taken: ticketNumber in the path is missing; project in the query is missing; reason in the body is blank; and 1 more.',
    );
    // A key the caller chose (a form's answers by their own keys) is never said back either.
    const answers = endpoint({
      name: 'testAnswers',
      summary: 'A test’s own.',
      access: 'ANYBODY',
      method: 'PUT',
      path: '/answers',
      body: z.strictObject({ answers: z.record(z.string(), z.number()) }),
      answer: healthAnswerSchema,
    });
    const keyed = notTaken(answers, {
      params: {},
      query: {},
      body: { answers: { 'police-report-number': 'C-1' } },
    });
    expect(keyed).toBe('Not taken: answers in the body isn’t taken as it stands.');
    // An endpoint that names no query and no body.
    const nothing = { params: {}, query: {}, body: undefined };
    expect(notTaken(healthEndpoint, nothing)).toBeUndefined();
    expect(notTaken(healthEndpoint, { ...nothing, query: { verbose: '1' } })).toBe(
      'Not taken: this request takes nothing in the query.',
    );
    expect(notTaken(healthEndpoint, { ...nothing, body: {} })).toBe(
      'Not taken: this request takes nothing in the body.',
    );
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

describe('the endpoints that take a file', () => {
  it('AC-10-47, ADR-482 takes a part of a file as bytes, never JSON; is defined with no body of its own and never as a GET; and is described as bytes', () => {
    // The media endpoint, and the map's file at the back office (ADR-485; KD-76).
    expect(endpoints.filter(({ file }) => file === true)).toEqual([
      sendMapFileEndpoint,
      sendPhotoFilePartEndpoint,
    ]);
    const read = {
      params: { photoId: '01a1325e-741f-716f-b9d4-738fd7f66e2b', file: 'photo' },
      query: { offset: '0', length: '3' },
    };
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff]);
    expect(taken(sendPhotoFilePartEndpoint, { ...read, body: bytes })?.body).toBe(bytes);
    for (const body of [undefined, new Uint8Array(), { bytes: 'ffd8ff' }, 'ffd8ff', [0xff]]) {
      expect(taken(sendPhotoFilePartEndpoint, { ...read, body }), JSON.stringify(body)).toBe(
        undefined,
      );
      expect(notTaken(sendPhotoFilePartEndpoint, { ...read, body })).toBe(
        'Not taken: the body isn’t a part of a file: at least one byte, sent as a file’s part.',
      );
    }
    // Its query and path are read as any endpoint's.
    expect(
      taken(sendPhotoFilePartEndpoint, {
        ...read,
        query: { offset: '-1', length: '3' },
        body: bytes,
      }),
    ).toBe(undefined);
    expect(
      taken(sendPhotoFilePartEndpoint, {
        ...read,
        query: { offset: '0', length: '0' },
        body: bytes,
      }),
    ).toBe(undefined);
    const base = {
      name: 'test',
      summary: 'A test’s own.',
      access: 'ANYBODY',
      path: '/a',
      answer: healthAnswerSchema,
    } as const;
    expect(() => endpoint({ ...base, method: 'PUT', file: true })).not.toThrow();
    expect(() => endpoint({ ...base, method: 'GET', file: true })).toThrow('takes a file');
    expect(() =>
      endpoint({ ...base, method: 'PUT', file: true, body: z.strictObject({}) }),
    ).toThrow('takes a file');
    const described = openApiDocument([sendPhotoFilePartEndpoint]) as {
      paths: Record<string, Record<string, { requestBody?: unknown }>>;
    };
    expect(
      described.paths['/phones/current/photos/{photoId}/files/{file}']?.['patch']?.requestBody,
    ).toEqual({
      required: true,
      content: {
        [filePartMediaType]: {
          schema: { type: 'string', contentMediaType: 'application/octet-stream' },
        },
      },
    });
    expect(filePartMediaType).toBe('application/offset+octet-stream');
  });

  it('ADR-485 a map’s file is sent whole to its project, as bytes, named by nothing; a map and a site’s shape are loaded from it by its SHA-256 alone', () => {
    const projectId = '01a1325e-741f-716f-b9d4-738fd7f66e2b';
    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
    const sent = { params: { projectId }, query: {} };
    expect(taken(sendMapFileEndpoint, { ...sent, body: bytes })?.body).toBe(bytes);
    for (const body of [undefined, new Uint8Array(), { type: 'FeatureCollection' }]) {
      expect(taken(sendMapFileEndpoint, { ...sent, body }), JSON.stringify(body)).toBe(undefined);
    }
    // Nothing names it: no name, no place, no type.
    for (const query of [{ name: 'bayline-row-zones-v1.zip' }, { place: 'maps/x' }]) {
      expect(taken(sendMapFileEndpoint, { ...sent, query, body: bytes })).toBe(undefined);
    }
    const mapFileId = 'a'.repeat(64);
    const load = {
      params: { projectId, mapFileId },
      query: {},
      body: { sourceName: null, boundaryLayer: null, zones: null },
    };
    expect(taken(loadMapFileEndpoint, load)).toBeDefined();
    for (const id of ['A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(63)}g`, '../x']) {
      expect(taken(loadMapFileEndpoint, { ...load, params: { projectId, mapFileId: id } })).toBe(
        undefined,
      );
      expect(
        taken(addSiteShapeFileEndpoint, {
          params: { siteId: projectId, mapFileId: id },
          query: {},
          body: { layer: null },
        }),
      ).toBe(undefined);
    }
    expect(
      taken(loadMapFileEndpoint, {
        ...load,
        body: { ...load.body, zones: { layer: 'zones.shp', nameField: '' } },
      }),
    ).toBe(undefined);
    expect(
      taken(addSiteShapeFileEndpoint, {
        params: { siteId: projectId, mapFileId },
        query: {},
        body: { layer: 'marsh-road.shp' },
      }),
    ).toBeDefined();
    const described = openApiDocument([sendMapFileEndpoint]) as {
      paths: Record<string, Record<string, { requestBody?: unknown }>>;
    };
    expect(described.paths['/projects/{projectId}/map-files']?.['post']?.requestBody).toEqual({
      required: true,
      content: {
        [filePartMediaType]: {
          schema: { type: 'string', contentMediaType: 'application/octet-stream' },
        },
      },
    });
  });

  it('ADR-482 answers where a file stands: kept, so many bytes of so many taken, or not the one fingerprinted; never where it is kept', () => {
    for (const answer of [
      { upload: 'KEPT' },
      { upload: 'RECEIVING', received: 0, length: null },
      { upload: 'RECEIVING', received: 60000, length: 150000 },
      { upload: 'NOT_MATCHED' },
    ]) {
      expect(photoFileAnswerSchema.safeParse(answer).success, JSON.stringify(answer)).toBe(true);
    }
    for (const answer of [
      { upload: 'KEPT', objectKey: 'projects/x/photos/y' },
      { upload: 'RECEIVING', received: -1, length: 3 },
      { upload: 'RECEIVING', received: 0 },
      { upload: 'SAVED' },
    ]) {
      expect(photoFileAnswerSchema.safeParse(answer).success, JSON.stringify(answer)).toBe(false);
    }
  });
});

describe('the one endpoint that answers a file', () => {
  it('AC-10-48, ADR-483 is the back office’s read of a photograph’s file: a GET, open to the back office alone, that takes no file and is described as bytes of the kinds of image a file is kept as', () => {
    expect(endpoints.filter(({ answersFile }) => answersFile === true)).toEqual([
      photographFileEndpoint,
    ]);
    expect([
      photographFileEndpoint.method,
      photographFileEndpoint.access,
      photographFileEndpoint.roles,
      'permission' in photographFileEndpoint,
    ]).toEqual(['GET', 'SIGNED_IN', ['ADMIN', 'MANAGER_ANALYST'], false]);
    const base = {
      name: 'test',
      summary: 'A test’s own.',
      access: 'ANYBODY',
      path: '/a',
      answer: healthAnswerSchema,
      answersFile: true,
    } as const;
    expect(() => endpoint({ ...base, method: 'GET' })).not.toThrow();
    expect(() => endpoint({ ...base, method: 'POST' })).toThrow('answers a file');
    expect(() => endpoint({ ...base, method: 'PUT', file: true })).toThrow('answers a file');
    const described = openApiDocument([photographFileEndpoint]) as {
      paths: Record<string, Record<string, { responses: Record<string, { content: unknown }> }>>;
    };
    expect(
      described.paths['/photographs/{photoId}/files/{file}']?.['get']?.responses['200']?.content,
    ).toEqual(
      Object.fromEntries(
        ['image/jpeg', 'image/heic', 'image/heif', 'image/png', 'image/tiff'].map((type) => [
          type,
          { schema: { type: 'string', contentMediaType: type } },
        ]),
      ),
    );
    expect(answerFileTypes).toEqual([
      'image/jpeg',
      'image/heic',
      'image/heif',
      'image/png',
      'image/tiff',
    ]);
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
