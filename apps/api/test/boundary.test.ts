// The boundary, the headers every answer carries, the CORS list and the size limit (ARCHITECTURE
// §6, Transport, CORS, Input, Output; acceptance file 10, AC-10-04…07, 34, 36, 39; T-12, T-15,
// T-17, T-28; ADR-387…392); and how a request is read and an answer and a log line written, as
// the checklist asks (AC-10-57…62, 66; spec/CHECKLIST-API.md §3.1; ADR-513). The real process, in this test's own memory, with one more controller;
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
// A write, as a browser's page would make one: a POST with a body.
const written = endpoint({
  name: 'testWritten',
  summary: 'A test’s own.',
  access: 'ANYBODY',
  method: 'POST',
  path: '/written',
  body: errorAnswerSchema,
  answer: healthAnswerSchema,
});
// An answer holding what a person may type: markup, quotes, a line break, a line separator.
const typed = '</script><script>alert("Bayline")</script>\n\'O\u2028Brien';
const says = endpoint({
  name: 'testSays',
  summary: 'A test’s own.',
  access: 'ANYBODY',
  method: 'GET',
  path: '/says',
  answer: errorAnswerSchema,
});
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

  @Serves(written)
  written(@Body() body: unknown) {
    ran.push({ written: body });
    return { status: 'ok' };
  }

  @Serves(says)
  says() {
    return { code: 'NOT_FOUND', requestId: 'r-1', message: typed };
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
const logged: string[] = [];

describe('the boundary', () => {
  let api: ApiProcess;
  beforeAll(async () => {
    api = await ApiProcess.create(TakingModule, madeUpSettings, shippedPolicy, {
      stream: { write: (line) => logged.push(line) },
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
          'strict-transport-security': 'max-age=31536000; includeSubDomains',
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
        'access-control-allow-headers':
          'content-type, x-adms-csrf, authorization, x-adms-monitor-session',
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

  describe('as the checklist asks (ADR-513)', () => {
    it('AC-10-57 (ASVS 1.1.1, 15.3.7): a path and a query are decoded once, never twice, and a query key sent twice is refused', async () => {
      ran.length = 0;
      // `%256f` is `%6f` decoded once, and `o` only if decoded again.
      await refused(put('/taken/%256fk?status=ok', good));
      await refused(put('/taken/ok?status=%256fk', good));
      await refused(put('/taken/ok?status=ok&status=ok', good));
      await refused(put('/taken/ok?status=ok&status=', good));
      expect(ran).toEqual([]);
      // Decoded once, each is what the schema takes.
      expect((await put('/taken/%6fk?status=%6fk', good)).statusCode).toBe(200);
    });

    it('AC-10-58 (ASVS 1.5.2, 15.3.6): a body is JSON read by its schema alone; one holding `__proto__` or `constructor.prototype` is refused, and pollutes nothing', async () => {
      ran.length = 0;
      for (const payload of [
        '{"code":"NOT_FOUND","requestId":"r-1","__proto__":{"polluted":true}}',
        '{"code":"NOT_FOUND","requestId":"r-1","constructor":{"prototype":{"polluted":true}}}',
        '{"__proto__":{"code":"NOT_FOUND","requestId":"r-1","polluted":true}}',
      ]) {
        await refused(put('/taken/ok?status=ok', payload));
      }
      expect(ran).toEqual([]);
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('AC-10-59 (ASVS 3.5.2): a write sent as a page may send it without asking first, a form or plain text, is refused before anything runs', async () => {
      ran.length = 0;
      const post = (contentType: string, payload: string) =>
        api.app.inject({
          method: 'POST',
          url: '/written',
          headers: { 'content-type': contentType, origin: 'https://evil.example' },
          payload,
        });
      const asked = [
        await post('text/plain', JSON.stringify(good)),
        await post('text/plain;charset=UTF-8', JSON.stringify(good)),
        await post('application/x-www-form-urlencoded', 'code=NOT_FOUND&requestId=r-1'),
        await post(
          'multipart/form-data; boundary=x',
          '--x\r\nContent-Disposition: form-data; name="code"\r\n\r\nNOT_FOUND\r\n--x--',
        ),
      ];
      expect(asked.map(({ statusCode }) => statusCode)).toEqual([415, 415, 415, 415]);
      for (const answer of asked) {
        expect(errorAnswerSchema.parse(answer.json()).code).toBe('UNSUPPORTED_MEDIA_TYPE');
      }
      expect(ran).toEqual([]);
      // As JSON, the same body is read.
      expect((await post('application/json', JSON.stringify(good))).statusCode).toBe(200);
    });

    it('AC-10-60 (ASVS 1.1.2, 1.2.1, 1.2.3): an answer is JSON written by the serializer: what a person typed comes back as a JSON string, its markup inert and its line breaks escaped', async () => {
      const answer = await api.app.inject({ method: 'GET', url: '/says' });
      expect(answer.statusCode).toBe(200);
      expect(answer.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(answer.headers['x-content-type-options']).toBe('nosniff');
      expect(answer.body).not.toMatch(/[\n\r]/);
      expect(answer.body).toContain(String.raw`alert(\"Bayline\")`);
      expect(errorAnswerSchema.parse(answer.json()).message).toBe(typed);
    });

    it('AC-10-61 (ASVS 13.4.4): TRACE and any method the endpoints don’t list is answered "not found", and nothing sent is said back', async () => {
      const sent = 'trace-9f3c-said-back';
      for (const method of ['TRACE', 'DELETE', 'PROPFIND', 'OPTIONS']) {
        const answer = await api.app.inject({
          // The test's client lists fewer methods than a caller may send.
          method: method as 'GET',
          url: '/health',
          headers: { 'x-adms-echo': sent, cookie: `session=${sent}` },
        });
        expect([method, answer.statusCode]).toEqual([method, 404]);
        expect(errorAnswerSchema.parse(answer.json()).code).toBe('NOT_FOUND');
        expect(answer.body).not.toContain(sent);
      }
    });

    it('AC-10-62 (ASVS 16.4.1): a line break or a quote in what a request sends never breaks the log: each line written is one JSON object', async () => {
      const from = logged.length;
      await api.app.inject({ method: 'GET', url: '/nowhere%0A%7B%22level%22%3A60%7D%22' });
      await api.app.inject({ method: 'GET', url: '/nowhere\u2028"' });
      await put('/taken/ok%0D%0A?status=ok%0A%22', good, { ...json, 'x-adms': 'a\u2028"b' });
      await put('/taken/ok?status=ok', '{"code": "NOT_FOUND\n", "requestId": "\\"}');
      const lines = logged.slice(from);
      expect(lines.length).toBeGreaterThan(4);
      for (const line of lines) {
        expect(line.endsWith('\n')).toBe(true);
        expect(line.indexOf('\n')).toBe(line.length - 1);
        const read = JSON.parse(line) as Record<string, unknown>;
        expect(read['level']).not.toBe(60);
      }
    });

    it('AC-10-66 (ASVS 16.3.3): what the boundary refuses is logged, by its endpoint and the refusal, with the request’s id; never what was sent', async () => {
      const from = logged.length;
      const answer = await refused(put('/taken/ok?status=ok', { ...good, amount: 'sent-9f3c' }));
      const lines = logged.slice(from).map((line) => JSON.parse(line) as Record<string, unknown>);
      const refusal = lines.filter(
        ({ msg }) => msg === 'The boundary refused what a request sent.',
      );
      expect(refusal).toEqual([
        expect.objectContaining({
          endpoint: 'testEveryPart',
          refused: 'BAD_REQUEST',
          requestId: answer.headers['x-request-id'],
        }),
      ]);
      expect(logged.slice(from).join('')).not.toMatch(/sent-9f3c|amount/);
      // Taken, nothing is logged as refused.
      const taken = logged.length;
      await put('/taken/ok?status=ok', good);
      expect(logged.slice(taken).join('')).not.toContain('refused');
    });
  });
});
