// The one error filter and the log (ARCHITECTURE §6, Output and Logs; acceptance file 10,
// AC-10-33 and AC-10-32's first half; T-26; ADR-385). The real process, in this test's own
// memory, with one more controller whose only work is to fail; nothing listens and no stack is
// needed. The same answers through the door, over HTTPS, are door.test.ts's.
import { endpoint, errorAnswerSchema, healthAnswerSchema } from '@open-adms/contracts';
import { Controller, HttpException, Module } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiProcess } from '../src/process/api-process.ts';
import { HealthController } from '../src/process/health.controller.ts';
import { Serves } from '../src/process/serves.ts';
import { madeUpSettings, shippedPolicy } from './support/process.ts';

// What must never leave the server or reach its log: said by a failing service, or sent by a caller.
const inside = 'SELECT * FROM "user" WHERE monitor_id = M004127 -- /srv/open-adms/apps/api';
const sent = 'sent-9f3c-never-logged';

// This test's own endpoints: each is served as any endpoint is, through the boundary. None takes
// a query or a body, so what the last test sends to `taken` is refused there, and logged the same.
const fails = (name: string, method: 'GET' | 'POST' = 'GET') =>
  endpoint({
    name,
    summary: 'A test’s own.',
    method,
    path: `/fails/${name}`,
    answer: healthAnswerSchema,
  });

@Controller()
class FailingController {
  @Serves(fails('inside'))
  inside(): never {
    throw new Error(inside);
  }

  @Serves(fails('refused'))
  refused(): never {
    throw new HttpException({ message: inside, detail: [inside] }, 400);
  }

  @Serves(fails('teapot'))
  teapot(): never {
    throw new HttpException(inside, 418);
  }

  @Serves(fails('not-an-error'))
  notAnError(): never {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- what careless code may do
    throw inside;
  }

  @Serves(fails('taken', 'POST'))
  taken(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

@Module({ controllers: [HealthController, FailingController] })
class FailingModule {}

interface Line {
  readonly level: number;
  readonly msg: string;
  readonly requestId?: string;
  readonly req?: unknown;
  readonly err?: { kind: string; at: string[] };
}

describe('what an error and a log say', () => {
  const written: string[] = [];
  let api: ApiProcess;

  beforeAll(async () => {
    api = await ApiProcess.create(FailingModule, madeUpSettings, shippedPolicy, {
      stream: { write: (line) => written.push(line) },
    });
    await api.app.init();
    await api.app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await api.close();
  });

  const lines = (): Line[] => written.map((line) => JSON.parse(line) as Line);
  const ask = (method: 'GET' | 'POST', url: string, more: object = {}) =>
    api.app.inject({ method, url, ...more });

  it('the health answer is ok, and nothing else', async () => {
    const answer = await ask('GET', '/health');
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toEqual({ status: 'ok' });
  });

  it('AC-10-33: a failure inside the server is a plain code and the request id', async () => {
    const answer = await ask('GET', '/fails/inside');
    expect(answer.statusCode).toBe(500);
    const said = errorAnswerSchema.parse(answer.json());
    expect(said.code).toBe('INTERNAL_ERROR');
    expect(answer.body).not.toContain('SELECT');
    expect(answer.body).not.toContain('M004127');
    expect(answer.body).not.toContain('/srv/');
    expect(answer.body).not.toContain(' at ');
    // The log says that it failed, of what kind and where, under the same id; never the message.
    const line = lines().find((entry) => entry.requestId === said.requestId && entry.level === 50);
    expect(line?.err?.kind).toBe('Error');
    expect(line?.err?.at[0]).toContain('FailingController.inside');
  });

  it('AC-10-33: something thrown that is not an error is answered the same', async () => {
    const answer = await ask('GET', '/fails/not-an-error');
    expect(answer.statusCode).toBe(500);
    expect(Object.keys(answer.json<object>())).toEqual(['code', 'requestId']);
    expect(answer.body).not.toContain('SELECT');
  });

  it('AC-10-33: a refusal keeps its status and says a plain code, never the message', async () => {
    const refused = await ask('GET', '/fails/refused');
    expect(refused.statusCode).toBe(400);
    expect(errorAnswerSchema.parse(refused.json()).code).toBe('BAD_REQUEST');
    expect(refused.body).not.toContain('SELECT');
    const teapot = await ask('GET', '/fails/teapot');
    expect(teapot.statusCode).toBe(418);
    expect(errorAnswerSchema.parse(teapot.json()).code).toBe('BAD_REQUEST');
    expect(teapot.body).not.toContain('SELECT');
  });

  it('AC-10-33: a path nobody serves, and a body that is not JSON, get a plain code', async () => {
    const nowhere = await ask('GET', `/nowhere?password=${sent}`);
    expect(nowhere.statusCode).toBe(404);
    expect(errorAnswerSchema.parse(nowhere.json()).code).toBe('NOT_FOUND');
    expect(nowhere.body).not.toContain(sent);
    expect(nowhere.body).not.toContain('nowhere');
    const broken = await ask('POST', '/fails/taken', {
      headers: { 'content-type': 'application/json' },
      payload: `{"password": "${sent}"`,
    });
    expect(broken.statusCode).toBe(400);
    expect(errorAnswerSchema.parse(broken.json()).code).toBe('BAD_REQUEST');
    expect(broken.body).not.toContain(sent);
    const text = await ask('POST', '/fails/taken', {
      headers: { 'content-type': 'application/x-adms-9f3c' },
      payload: sent,
    });
    expect(text.statusCode).toBe(415);
    expect(errorAnswerSchema.parse(text.json()).code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('every request has an id of the server’s own, never one a caller sent', async () => {
    const answer = await ask('GET', '/nowhere', {
      headers: { 'request-id': sent, 'x-request-id': sent },
    });
    const { requestId } = errorAnswerSchema.parse(answer.json());
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const again = errorAnswerSchema.parse((await ask('GET', '/nowhere')).json());
    expect(again.requestId).not.toBe(requestId);
  });

  it('AC-10-32: every line is structured, a request’s lines carry its id, and nothing sent or said inside is in any', async () => {
    await ask('POST', `/fails/taken?token=${sent}`, {
      headers: { authorization: `Bearer ${sent}`, cookie: `session=${sent}`, 'x-adms': sent },
      payload: { password: sent, phone: sent },
    });
    const all = lines();
    expect(all.length).toBeGreaterThan(10);
    const ofRequests = all.filter((line) => line.req !== undefined || line.err !== undefined);
    expect(ofRequests.length).toBeGreaterThan(5);
    for (const line of ofRequests) expect(line.requestId).toMatch(/^[0-9a-f-]{36}$/);
    const text = written.join('');
    for (const never of [sent, 'SELECT', 'M004127', 'Bearer', 'session=', 'password', 'token=']) {
      expect(text).not.toContain(never);
    }
    // A request is logged as its method and its path alone.
    expect(
      all.some((line) => JSON.stringify(line.req) === '{"method":"POST","path":"/fails/taken"}'),
    ).toBe(true);
  });
});
