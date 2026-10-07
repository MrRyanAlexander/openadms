// The request id, from the answer to the audit record (ARCHITECTURE §5.3, §6, Logs; acceptance
// file 10, AC-10-43; ADR-390), and the first use of the API's own database login. The real
// process, in this test's own memory, opening the installation's database as `adms_api` with the
// settings the installer wrote (read here, never printed): it needs `pnpm local:up` after `pnpm
// installer`, and fails saying so. What the login writes can't be deleted, so the write is undone
// by failing out of its own piece of work, which is also how a request that fails leaves nothing.
import { randomUUID } from 'node:crypto';
import { endpoint, errorAnswerSchema, healthAnswerSchema } from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { Controller, Inject, Module } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { apiDatabase } from '../src/process/api-database.ts';
import { ApiProcess } from '../src/process/api-process.ts';
import { Serves } from '../src/process/serves.ts';
import { Settings, SettingsProblem } from '../src/process/settings.ts';
import { ready, shippedPolicy } from './support/process.ts';

interface Written {
  readonly login: string;
  readonly actorId: string | null;
  readonly requestId: string | null;
}

const written: Written[] = [];

@Controller()
class WritingController {
  private readonly database: Database;

  constructor(@Inject(apiDatabase) database: Database) {
    this.database = database;
  }

  // Dana Reyes, the first admin, written with herself as the actor (ADR-270 (4)); then undone.
  @Serves(
    endpoint({
      name: 'testWrite',
      summary: 'A test’s own.',
      method: 'POST',
      path: '/writes',
      answer: healthAnswerSchema,
    }),
  )
  async write(): Promise<never> {
    const dana = randomUUID();
    return this.database.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const record = await tx.auditRecord.findFirstOrThrow({ where: { recordId: dana } });
      const [{ login } = { login: '' }] = await tx.$queryRaw<
        { login: string }[]
      >`SELECT current_user AS login`;
      written.push({ login, actorId: record.actorId, requestId: record.requestId });
      throw new Error('undone');
    });
  }
}

@Module({ controllers: [WritingController] })
class WritingModule {}

describe('a write the API makes for a request', () => {
  const lines: string[] = [];
  let api: ApiProcess;

  beforeAll(async () => {
    let settings: Settings;
    try {
      settings = Settings.read({ ADMS_API_HOST: '127.0.0.1', ADMS_API_PORT: '3000' });
    } catch (problem) {
      if (!(problem instanceof SettingsProblem)) throw problem;
      throw new Error('The API has no settings: run `pnpm installer` (after `pnpm local:up`).', {
        cause: problem,
      });
    }
    api = await ApiProcess.create(WritingModule, settings, shippedPolicy, {
      stream: { write: (line) => lines.push(line) },
    });
    await ready(api);
  });
  afterAll(async () => {
    await api.close();
  });

  it('AC-10-43: the audit record carries the request’s id, the one the answer and the log carry', async () => {
    written.length = 0;
    const answers = [
      await api.app.inject({ method: 'POST', url: '/writes' }),
      await api.app.inject({ method: 'POST', url: '/writes' }),
    ];
    const ids = answers.map((answer) => errorAnswerSchema.parse(answer.json()).requestId);
    expect(written).toHaveLength(2);
    expect(written.map(({ login }) => login)).toEqual(['adms_api', 'adms_api']);
    expect(written.map(({ requestId }) => requestId)).toEqual(ids);
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ids[1]).not.toBe(ids[0]);
    expect(answers.map((answer) => answer.headers['x-request-id'])).toEqual(ids);
    const logged = lines.map((line) => JSON.parse(line) as { requestId?: string; level: number });
    for (const id of ids) {
      expect(logged.some((line) => line.requestId === id && line.level === 50)).toBe(true);
    }
  });

  it('a request that failed left nothing behind', async () => {
    const database = api.app.get<Database>(apiDatabase);
    expect(await database.user.count({ where: { name: 'Dana Reyes', role: 'ADMIN' } })).toBe(0);
  });
});
