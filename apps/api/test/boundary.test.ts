// The boundary, the headers every answer carries, the CORS list and the size limit (ARCHITECTURE
// §6, Transport, CORS, Input, Output; acceptance file 10, AC-10-04…07, 34, 36, 39; T-12, T-15,
// T-17, T-28; ADR-387…392). The real process, in this test's own memory, with one more controller;
// no stack is needed. What a schema takes and refuses, case by case, is
// packages/contracts/test/endpoints.test.ts; here it is the server that asks it, every time. The
// same answers through the door, over HTTPS, are door.test.ts's.
import { readFileSync } from 'node:fs';
import { connect, type AddressInfo } from 'node:net';
import {
  endpoint,
  endpoints,
  errorAnswerSchema,
  healthAnswerSchema,
  openApiDocument,
} from '@open-adms/contracts';
import { Body, Controller, Get, Module, Param, Query } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { answerHeaders } from '../src/process/answer-headers.ts';
import { ApiModule } from '../src/process/api-module.ts';
import { ApiProcess } from '../src/process/api-process.ts';
import { requestNow } from '../src/process/boundary.ts';
import { Serves } from '../src/process/serves.ts';
import { listedOrigin, madeUpSettings, ready, shippedPolicy } from './support/process.ts';

// This test's own endpoint. Its schemas are borrowed from the contracts, which is where a shape
// lives: the path's `status` and the query's must be `ok`, the body a code and a request id.
const everyPart = endpoint({
  name: 'testEveryPart',
  summary: 'A test’s own.',
  access: 'ANYBODY',
  method: 'PUT',
  path: '/taken/:status',
  params: healthAnswerSchema,
  query: healthAnswerSchema,
  body: errorAnswerSchema,
  answer: healthAnswerSchema,
});
const good = { code: 'NOT_FOUND', requestId: 'r-1' };
const noPart = endpoint({
  name: 'testNoPart',
  summary: 'A test’s own.',
  access: 'ANYBODY',
  method: 'POST',
  path: '/nothing',
  answer: healthAnswerSchema,
});

const ran: unknown[] = [];

@Controller()
class TakingController {
  @Serves(everyPart)
  taken(@Param() params: unknown, @Query() query: unknown, @Body() body: unknown) {
    ran.push({ params, query, body, request: requestNow() });
    return { status: 'ok' };
  }

  @Serves(noPart)
  nothing() {
    ran.push('nothing');
    return { status: 'ok' };
  }

  // Mapped the framework's own way, naming no endpoint.
  @Get('unlisted')
  unlisted() {
    ran.push('unlisted');
    return { status: 'ok' };
  }
}

@Module({ imports: [ApiModule], controllers: [TakingController] })
class TakingModule {}

const json = { 'content-type': 'application/json' };

describe('the boundary', () => {
  let api: ApiProcess;
  beforeAll(async () => {
    api = await ApiProcess.create(TakingModule, madeUpSettings, shippedPolicy, {
      stream: { write: () => undefined },
    });
    await ready(api);
  });
  afterAll(async () => {
    await api.close();
  });

  const put = (url: string, payload: unknown, headers: Record<string, string> = json) =>
    api.app.inject({ method: 'PUT', url, headers, payload: payload as string });
  const refused = async (asked: ReturnType<typeof put>, code = 'BAD_REQUEST', status = 400) => {
    const answer = await asked;
    expect(answer.statusCode).toBe(status);
    expect(errorAnswerSchema.parse(answer.json()).code).toBe(code);
    return answer;
  };

  it('AC-10-36: a request whose path, query and body its schemas take reaches the controller, as they read it and as that request', async () => {
    ran.length = 0;
    const answer = await put('/taken/ok?status=ok', good);
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toEqual({ status: 'ok' });
    expect(ran).toEqual([
      {
        params: { status: 'ok' },
        query: { status: 'ok' },
        body: good,
        request: answer.headers['x-request-id'],
      },
    ]);
    expect(requestNow()).toBeUndefined();
  });

  it('AC-10-34: a field the schema doesn’t name refuses the whole request, and nothing runs', async () => {
    ran.length = 0;
    const answer = await refused(put('/taken/ok?status=ok', { ...good, amount: 412.5 }));
    expect(answer.body).not.toContain('amount');
    // AC-10-37: which part refused it, in plain words; never the field's own name or its value.
    expect(errorAnswerSchema.parse(answer.json()).message).toBe(
      'Not taken: the body has a field this request doesn’t take.',
    );
    const valued = await refused(put('/taken/ok?status=ok', { ...good, code: 'Something broke' }));
    expect(errorAnswerSchema.parse(valued.json()).message).toBe(
      'Not taken: code in the body isn’t one of the values this request takes.',
    );
    expect(valued.body).not.toContain('Something broke');
    await refused(put('/taken/ok?status=ok&rate=7.25', good));
    expect(ran).toEqual([]);
  });

  it('AC-10-36: the path, the query and the body are each checked, before anything runs', async () => {
    ran.length = 0;
    await refused(put('/taken/other?status=ok', good));
    await refused(put('/taken/ok?status=other', good));
    await refused(put('/taken/ok', good));
    await refused(put('/taken/ok?status=ok&status=ok', good));
    await refused(put('/taken/ok?status=ok', { ...good, code: 'Something broke' }));
    await refused(put('/taken/ok?status=ok', undefined, {}));
    await refused(put('/taken/ok?status=ok', '[]'));
    expect(ran).toEqual([]);
  });

  it('AC-10-36: an endpoint that names no query and no body takes none', async () => {
    expect((await api.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    const asked = await api.app.inject({ method: 'GET', url: '/health?verbose=1' });
    expect(asked.statusCode).toBe(400);
    expect(errorAnswerSchema.parse(asked.json()).code).toBe('BAD_REQUEST');
    ran.length = 0;
    const post = (more: object = {}) =>
      api.app.inject({ method: 'POST', url: '/nothing', ...more });
    expect((await post()).statusCode).toBe(200);
    expect(ran).toEqual(['nothing']);
    expect((await post({ headers: json, payload: {} })).statusCode).toBe(400);
    expect((await post({ headers: json, payload: 'null' })).statusCode).toBe(400);
    expect((await post({ query: { verbose: '1' } })).statusCode).toBe(400);
    expect(ran).toEqual(['nothing']);
  });

  it('AC-10-36: a route that names no endpoint serves nothing', async () => {
    ran.length = 0;
    const answer = await api.app.inject({ method: 'GET', url: '/unlisted' });
    expect(answer.statusCode).toBe(500);
    expect(errorAnswerSchema.parse(answer.json()).code).toBe('INTERNAL_ERROR');
    expect(ran).toEqual([]);
  });

  it('AC-10-36: the API’s own routes are the contracts’ endpoints, each one and no other', async () => {
    const own = await ApiProcess.create(ApiModule, madeUpSettings, shippedPolicy, {
      stream: { write: () => undefined },
    });
    await ready(own);
    // The server answers HEAD wherever it answers GET, by the same route.
    const served = own.routes
      .filter(({ method }) => method !== 'HEAD')
      .map(({ method, path }) => `${method} ${path}`);
    await own.close();
    expect(served.sort()).toEqual(endpoints.map(({ method, path }) => `${method} ${path}`).sort());
  });

  it('AC-10-36: the OpenAPI description in the repository is what the contracts make (`pnpm openapi`)', () => {
    const file = new URL('../openapi.json', import.meta.url);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(
      JSON.parse(JSON.stringify(openApiDocument())),
    );
  });

  describe('the size limit', () => {
    const limit = shippedPolicy.requestBodyLimitBytes;

    it('AC-10-39: a body larger than the limit is refused, and one at the limit is read', async () => {
      ran.length = 0;
      const padded = (bytes: number) =>
        JSON.stringify({ ...good, requestId: 'r'.repeat(bytes - JSON.stringify(good).length + 3) });
      expect(Buffer.byteLength(padded(limit))).toBe(limit);
      expect((await put('/taken/ok?status=ok', padded(limit))).statusCode).toBe(200);
      ran.length = 0;
      const answer = await refused(put('/taken/ok?status=ok', padded(limit + 1)), 'TOO_LARGE', 413);
      expect(answer.body.length).toBeLessThan(200);
      expect(ran).toEqual([]);
    });

    it('AC-10-39: it is refused before it is read whole: on what it says its size is', async () => {
      await api.app.listen(0, '127.0.0.1');
      const { port } = api.app.getHttpServer().address() as AddressInfo;
      const answered = await new Promise<string>((resolve, reject) => {
        const socket = connect(port, '127.0.0.1', () => {
          // The head and seven bytes of a body said to be one byte over the limit; no more is sent.
          socket.write(
            `PUT /taken/ok?status=ok HTTP/1.1\r\nhost: 127.0.0.1\r\ncontent-type: application/json\r\n` +
              `content-length: ${String(limit + 1)}\r\n\r\n{"code"`,
          );
        });
        socket.setEncoding('utf8');
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error('No answer came while the body was unsent.'));
        });
        socket.once('data', (chunk: string) => {
          socket.destroy();
          resolve(chunk);
        });
        socket.once('error', reject);
      });
      expect(answered).toMatch(/^HTTP\/1\.1 413 /);
      expect(answered).toContain('"code":"TOO_LARGE"');
    });
  });

  describe('what every answer carries', () => {
    it('AC-10-04: HSTS and the security headers, on an answer, a refusal, a path nobody serves and a failure', async () => {
      const answers = [
        await api.app.inject({ method: 'GET', url: '/health' }),
        await put('/taken/ok', good),
        await api.app.inject({ method: 'GET', url: '/nowhere' }),
        await api.app.inject({ method: 'GET', url: '/unlisted' }),
        await put('/taken/ok?status=ok', '{"code": '),
      ];
      expect(answers.map(({ statusCode }) => statusCode)).toEqual([200, 400, 404, 500, 400]);
      for (const answer of answers) {
        expect(answer.headers).toMatchObject({
          'strict-transport-security': 'max-age=31536000',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
          vary: 'Origin',
        });
        expect(answer.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
        expect(answer.headers.server).toBeUndefined();
        expect(answer.headers['x-powered-by']).toBeUndefined();
      }
      expect(Object.keys(answerHeaders)).toHaveLength(5);
      // A refusal's id is the one in its header.
      expect(errorAnswerSchema.parse(answers[1]?.json()).requestId).toBe(
        answers[1]?.headers['x-request-id'],
      );
    });
  });

  describe('the CORS list', () => {
    const cors = (headers: Record<string, unknown>) =>
      Object.keys(headers).filter((name) => name.startsWith('access-control-'));
    const from = (origin: string, more: object = {}) =>
      api.app.inject({ method: 'GET', url: '/health', headers: { origin }, ...more });

    it('AC-10-05: a page at an origin on the list is allowed, by that origin’s name', async () => {
      const answer = await from(listedOrigin);
      expect(answer.statusCode).toBe(200);
      expect(answer.headers['access-control-allow-origin']).toBe(listedOrigin);
      expect(answer.headers['access-control-expose-headers']).toBe('x-request-id, retry-after');
      expect(answer.headers.vary).toBe('Origin');
      // Before a write, the browser asks first; it is told the methods and the one header.
      const asked = await api.app.inject({
        method: 'OPTIONS',
        url: '/taken/ok?status=ok',
        headers: { origin: listedOrigin, 'access-control-request-method': 'PUT' },
      });
      expect(asked.statusCode).toBe(204);
      expect(asked.body).toBe('');
      expect(asked.headers).toMatchObject({
        'access-control-allow-origin': listedOrigin,
        'access-control-allow-methods': 'GET, POST, PUT, PATCH',
        // The session's cookies may come with a listed origin's call, and its CSRF header.
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'content-type, x-adms-csrf',
      });
    });

    it('AC-10-06: a page at an origin off the list is allowed nothing', async () => {
      const answer = await from('https://evil.example');
      expect(cors(answer.headers)).toEqual([]);
      const asked = await api.app.inject({
        method: 'OPTIONS',
        url: '/taken/ok?status=ok',
        headers: { origin: 'https://evil.example', 'access-control-request-method': 'PUT' },
      });
      expect(asked.statusCode).toBe(404);
      expect(cors(asked.headers)).toEqual([]);
      expect(asked.body).not.toContain('evil');
    });

    it.each([
      'https://adms.localhost.evil.example',
      'http://adms.localhost',
      'https://evil.adms.localhost',
      'https://adms.localhost:8443',
      'https://adms.localhost:443',
      'https://adms.localhost/',
      'https://ADMS.localhost',
      'https://adms.localhost,https://evil.example',
      'https://adms-localhost',
      'null',
      '*',
    ])(
      'AC-10-07: the look-alike %s is an origin off the list: origins are matched whole',
      async (origin) => {
        expect(cors((await from(origin)).headers)).toEqual([]);
      },
    );

    it('AC-10-06: nothing is ever allowed to every origin, and a caller with no origin is answered', async () => {
      const answer = await api.app.inject({ method: 'GET', url: '/health' });
      expect(answer.statusCode).toBe(200);
      expect(cors(answer.headers)).toEqual([]);
    });
  });
});
