// The OpenAPI description of the API, made from the endpoints and nothing else (ARCHITECTURE §3;
// REQ-004; BACKLOG C23; AC-10-36; T-28; ADR-388). `pnpm openapi` writes it to apps/api/openapi.json;
// the API's tests fail when that file isn't what this makes.
import { z } from 'zod';

import { errorAnswerSchema } from './api-answers.ts';
import { answerFileTypes, endpoints, filePartMediaType, type Endpoint } from './endpoints.ts';

type Json = Readonly<Record<string, unknown>>;

// A schema as JSON Schema, without the line that names its dialect: OpenAPI 3.1 says it once.
function described(schema: z.ZodType, io: 'input' | 'output'): Json {
  return Object.fromEntries(
    Object.entries(z.toJSONSchema(schema, { io })).filter(([key]) => key !== '$schema'),
  );
}

function parameters(schema: z.ZodObject | undefined, where: 'path' | 'query'): Json[] {
  if (schema === undefined) return [];
  const { properties = {}, required = [] } = described(schema, 'input') as {
    properties?: Json;
    required?: string[];
  };
  return Object.entries(properties).map(([name, of]) => ({
    name,
    in: where,
    required: where === 'path' || required.includes(name),
    schema: of,
  }));
}

const refused = { $ref: '#/components/schemas/ErrorAnswer' };

function operation(served: Endpoint): Json {
  const taken = [...parameters(served.params, 'path'), ...parameters(served.query, 'query')];
  return {
    operationId: served.name,
    summary: served.summary,
    // Who may call it (ADR-408, 440): anybody, a signed-in person, the holder of a refresh
    // token, or a phone that has proved itself.
    'x-open-adms-access': served.access,
    // Among the signed-in, the roles it is open to and the permission it takes (ADR-415).
    ...(served.roles === undefined ? {} : { 'x-open-adms-roles': served.roles }),
    ...(served.permission === undefined ? {} : { 'x-open-adms-permission': served.permission }),
    ...(taken.length === 0 ? {} : { parameters: taken }),
    // A part of a file, as bytes (ADR-482).
    ...(served.file === true
      ? {
          requestBody: {
            required: true,
            content: {
              [filePartMediaType]: {
                schema: { type: 'string', contentMediaType: 'application/octet-stream' },
              },
            },
          },
        }
      : {}),
    ...(served.body === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: described(served.body, 'input') } },
          },
        }),
    responses: {
      200: {
        description: 'The answer.',
        // A file, as bytes under the type it was kept under (ADR-483).
        content:
          served.answersFile === true
            ? Object.fromEntries(
                (served.answersFileOf ?? answerFileTypes).map((type) => [
                  type,
                  { schema: { type: 'string', contentMediaType: type } },
                ]),
              )
            : { 'application/json': { schema: described(served.answer, 'output') } },
      },
      default: {
        description: 'A refusal or a failure: a plain code and the request’s id.',
        content: { 'application/json': { schema: refused } },
      },
    },
  };
}

export function openApiDocument(list: readonly Endpoint[] = endpoints): Json {
  const paths: Record<string, Record<string, Json>> = {};
  for (const served of list) {
    const path = served.path.replaceAll(/:([A-Za-z][A-Za-z0-9]*)/g, '{$1}');
    (paths[path] ??= {})[served.method.toLowerCase()] = operation(served);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Open ADMS API',
      version: '0.0.0',
      license: { name: 'Apache-2.0', identifier: 'Apache-2.0' },
    },
    paths,
    components: { schemas: { ErrorAnswer: described(errorAnswerSchema, 'output') } },
  };
}
