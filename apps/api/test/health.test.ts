// The health answer and the readiness answer (BACKLOG 2.7.2 part 4, C38; acceptance file 10,
// point 17; ADR-385, 507). The real process, in this test's own memory: the health answer is the
// process's alone, the readiness answer asks the database. The made-up settings name a database
// nobody listens at; a test that wants one that answers, or one that never does, hands the
// process a database of its own. The same answers through the door are door.test.ts's.
import type { Database } from '@open-adms/db';
import { Module } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { installationPolicy } from '../src/policy.ts';
import { ApiProcess } from '../src/process/api-process.ts';
import { HealthController } from '../src/process/health.controller.ts';
import { madeUpSettings, ready, shippedPolicy } from './support/process.ts';

@Module({ controllers: [HealthController] })
class HealthModule {}

// A database that answers each question after `ms` (never, with `undefined`), and counts them.
function database(ms: number | undefined, fails = false) {
  const asked = { times: 0 };
  const db = {
    $read: <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      asked.times += 1;
      return new Promise<T>((resolve, reject) => {
        if (ms === undefined) return;
        setTimeout(() => {
          if (fails) reject(new Error('postgresql://adms_api@127.0.0.1/adms is away'));
          else resolve(work({ $queryRaw: () => Promise.resolve([{ '?column?': 1 }]) }));
        }, ms);
      });
    },
    $disconnect: (): Promise<void> => Promise.resolve(),
  } as unknown as Database;
  return { db, asked };
}

async function started(db?: Database, statementMs?: number) {
  const written: string[] = [];
  const api = await ApiProcess.create(
    HealthModule,
    madeUpSettings,
    statementMs === undefined
      ? shippedPolicy
      : installationPolicy({ STATEMENT_TIMEOUT_MS: String(statementMs) }),
    {
      stream: { write: (line) => written.push(line) },
      ...(db === undefined ? {} : { database: db }),
    },
  );
  await ready(api);
  const ask = (url: string) => api.app.inject({ method: 'GET', url });
  return { api, ask, written };
}

describe('the health answer (ADR-385, 507)', () => {
  it('is the process’s alone: it answers ok while no database answers', async () => {
    const { api, ask } = await started();
    try {
      const answer = await ask('/health');
      expect([answer.statusCode, answer.json()]).toEqual([200, { status: 'ok' }]);
    } finally {
      await api.app.close();
    }
  });
});

describe('the readiness answer (ADR-507)', () => {
  it('answers ok when the database answers the API, and asks it each time', async () => {
    const { db, asked } = database(1);
    const { api, ask } = await started(db);
    try {
      const answers = [await ask('/readiness'), await ask('/readiness')];
      expect(answers.map((answer) => [answer.statusCode, answer.json<unknown>()])).toEqual([
        [200, { status: 'ok' }],
        [200, { status: 'ok' }],
      ]);
      expect(asked.times).toBe(2);
    } finally {
      await api.app.close();
    }
  });

  it('is 503 UNAVAILABLE when nothing listens where the database is, and says nothing more; the log says so by its kind, never the error’s words', async () => {
    const { api, ask, written } = await started();
    try {
      const answer = await ask('/readiness');
      expect(answer.statusCode).toBe(503);
      const body = answer.json<{ code: string; requestId: string }>();
      expect(Object.keys(body).sort()).toEqual(['code', 'requestId']);
      expect(body.code).toBe('UNAVAILABLE');
      expect(answer.headers['x-request-id']).toBe(body.requestId);
      const lines = written.map((line) => JSON.parse(line) as Record<string, unknown>);
      const said = lines.filter((line) => line['requestId'] === body.requestId);
      expect(said.map((line) => [line['level'], line['msg']])).toContainEqual([
        40,
        'The API was asked whether it can serve, and its database did not answer.',
      ]);
      expect(said.some((line) => line['msg'] === 'A request failed inside the server.')).toBe(
        false,
      );
      expect(written.join('')).not.toContain('postgresql://');
      expect(written.join('')).not.toContain('127.0.0.1:1');
    } finally {
      await api.app.close();
    }
  });

  it('is 503 when the database refuses the question, never its words', async () => {
    const { db } = database(1, true);
    const { api, ask, written } = await started(db);
    try {
      const answer = await ask('/readiness');
      expect([answer.statusCode, answer.json<{ code: string }>().code]).toEqual([
        503,
        'UNAVAILABLE',
      ]);
      expect(written.join('')).not.toContain('is away');
    } finally {
      await api.app.close();
    }
  });

  it('is 503 when the database gives no answer within a statement’s time limit; callers who ask meanwhile share one question', async () => {
    const { db, asked } = database(undefined);
    const { api, ask } = await started(db, 200);
    try {
      const began = Date.now();
      const answers = await Promise.all([1, 2, 3, 4, 5].map(() => ask('/readiness')));
      const took = Date.now() - began;
      expect(answers.map((answer) => answer.statusCode)).toEqual([503, 503, 503, 503, 503]);
      expect(asked.times).toBe(1);
      expect(took).toBeGreaterThanOrEqual(190);
      expect(took).toBeLessThan(5_000);
      // The question out has ended: the next caller asks again.
      await ask('/readiness');
      expect(asked.times).toBe(2);
    } finally {
      await api.app.close();
    }
  });

  it('a database that answers after the limit is still unavailable', async () => {
    const { db } = database(400);
    const { api, ask } = await started(db, 100);
    try {
      expect((await ask('/readiness')).statusCode).toBe(503);
    } finally {
      await api.app.close();
    }
  });
});
