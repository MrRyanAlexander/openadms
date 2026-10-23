// A database that couldn't do a request's work in time (ARCHITECTURE §5.7, §6, Abuse and Output;
// AC-05-51, AC-10-71; T-17; REQ-210; BACKLOG 2.8.2, C87, C155, C162 (c); ADR-524): the caller is
// told the database is busy and how long to wait (`503 BUSY` with `Retry-After`), never that the
// server failed. Read from what Prisma throws as seen; the same from the real Prisma on the
// test database (it needs the local stack and an installation); and a request
// answered so through the API's process, its only connection held.
import { endpoint, errorAnswerSchema, healthAnswerSchema, toldToWait } from '@open-adms/contracts';
import { openDatabase, type Database } from '@open-adms/db';
import { Controller, Inject, Module } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { apiDatabase } from '../src/process/api-database.ts';
import { ApiProcess } from '../src/process/api-process.ts';
import { databaseBusyOf } from '../src/process/database-busy.ts';
import { Serves } from '../src/process/serves.ts';
import { testSettings } from './support/database.ts';
import { madeUpSettings, shippedPolicy } from './support/process.ts';

// What Prisma 7.10.0 throws, as seen on the test database (2026-10-14).
const prisma = (code: string, message: string, meta: object = {}) => ({
  name: 'PrismaClientKnownRequestError',
  code,
  message,
  meta,
  clientVersion: '7.10.0',
});
const transaction = (said: string, meta: object = {}) =>
  prisma('P2028', `Transaction API error: ${said}`, meta);
const postgres = (originalCode: string) =>
  prisma('P2010', `Raw query failed. Code: \`${originalCode}\`.`, {
    driverAdapterError: { cause: { originalCode, kind: 'postgres' } },
  });

describe('what says the database was busy', () => {
  it('AC-10-71 no connection came free in time, the piece of work ran out of time, or a statement was stopped by its time limit', () => {
    expect(databaseBusyOf(transaction('Unable to start a transaction in the given time.'))).toBe(
      'CONNECTION_WAIT',
    );
    for (const operation of ['query', 'commit']) {
      expect(
        databaseBusyOf(
          transaction(
            `A ${operation} cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5522 ms passed since the start of the transaction.`,
            { operation, timeout: 5000, timeTaken: 5522 },
          ),
        ),
        operation,
      ).toBe('WORK_EXPIRED');
    }
    expect(databaseBusyOf(postgres('57014'))).toBe('STATEMENT_TIMEOUT');
  });

  it('every other P2028, a refusal of the database’s own and anything else stay what they were', () => {
    for (const said of [
      'Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn’t have information about anymore, or was obtained before disconnecting.',
      'Transaction already closed: A query cannot be executed on a committed transaction.',
      'Transaction already closed: A query cannot be executed on a transaction that was rolled back.',
      'Internal Consistency Error: Transaction in invalid state running.',
    ]) {
      expect(databaseBusyOf(transaction(said)), said).toBeUndefined();
    }
    for (const sqlState of ['23505', '42501', '23001', '40001', '40P01']) {
      expect(databaseBusyOf(postgres(sqlState)), sqlState).toBeUndefined();
    }
    expect(databaseBusyOf(new Error('Unable to start a transaction in the given time.'))).toBe(
      undefined,
    );
    expect(databaseBusyOf({ code: 'P2028' })).toBeUndefined();
    expect(databaseBusyOf(undefined)).toBeUndefined();
  });
});

// The test database as the API's login, on a pool of one connection, each piece of
// work waiting a fifth of a second for it and running a second at the most.
const onOneConnection = (): Database =>
  openDatabase({
    url: testSettings().databaseUrl,
    maxConnections: 1,
    pieceOfWork: { waitMs: 200, longestMs: 1000 },
  });

// Holds the pool's one connection until it is let go.
async function holding(db: Database): Promise<{ letGo: () => Promise<void> }> {
  let letGo = (): void => undefined;
  let held = (): void => undefined;
  const holds = new Promise<void>((resolve) => (held = resolve));
  const done = db.$read(async (tx) => {
    await tx.$queryRaw`SELECT 1`;
    held();
    await new Promise<void>((resolve) => (letGo = resolve));
  });
  await holds;
  return {
    letGo: async () => {
      letGo();
      await done;
    },
  };
}

const thrownBy = async (work: Promise<unknown>): Promise<unknown> => {
  try {
    await work;
  } catch (thrown) {
    return thrown;
  }
  return 'nothing thrown';
};

describe('the real Prisma, on the test database', () => {
  let db: Database;

  beforeAll(() => {
    db = onOneConnection();
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('AC-10-71 a piece of work that waited its time for the one connection held, one that ran past its own, and a statement past its limit: each read as busy, nothing kept', async () => {
    const held = await holding(db);
    const waited = await thrownBy(db.$read((tx) => tx.$queryRaw`SELECT 1`));
    await held.letGo();
    expect(databaseBusyOf(waited)).toBe('CONNECTION_WAIT');

    const expired = await thrownBy(
      db.$read(async (tx) => {
        await tx.$queryRaw`SELECT pg_sleep(1.2)::text`;
        await tx.$queryRaw`SELECT 1`;
      }),
    );
    expect(databaseBusyOf(expired)).toBe('WORK_EXPIRED');

    const stopped = await thrownBy(
      db.$read(async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = 100`;
        await tx.$queryRaw`SELECT pg_sleep(0.5)::text`;
      }),
    );
    expect(databaseBusyOf(stopped)).toBe('STATEMENT_TIMEOUT');

    // The pool is whole again afterwards: the next piece of work runs.
    expect(await db.$read((tx) => tx.$queryRaw<{ one: number }[]>`SELECT 1 AS one`)).toEqual([
      { one: 1 },
    ]);
  });
});

// This test's own endpoint: anybody may ask it, and its work is one read of the database.
const reads = endpoint({
  name: 'testReads',
  summary: 'A test’s own.',
  access: 'ANYBODY',
  method: 'GET',
  path: '/test/reads',
  answer: healthAnswerSchema,
});

@Controller()
class ReadingController {
  private readonly db: Database;

  constructor(@Inject(apiDatabase) db: Database) {
    this.db = db;
  }

  @Serves(reads)
  async reads(): Promise<{ status: 'ok' }> {
    await this.db.$read((tx) => tx.$queryRaw`SELECT 1`);
    return { status: 'ok' };
  }
}

@Module({ controllers: [ReadingController] })
class ReadingModule {}

interface Line {
  readonly level: number;
  readonly msg: string;
  readonly requestId?: string;
  readonly why?: string;
}

describe('a request whose work couldn’t get a connection in time', () => {
  const written: string[] = [];
  let db: Database;
  let api: ApiProcess;

  beforeAll(async () => {
    db = onOneConnection();
    api = await ApiProcess.create(ReadingModule, madeUpSettings, shippedPolicy, {
      database: db,
      stream: { write: (line) => written.push(line) },
    });
    await api.app.init();
    await api.app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await api.close();
    await db.$disconnect();
  });

  it('AC-05-51, AC-10-71 is told the database is busy and to wait the policy’s 5 s, never a server error; asked again once the connection is free, it is answered', async () => {
    const held = await holding(db);
    const answer = await api.app.inject({ method: 'GET', url: '/test/reads' });
    await held.letGo();
    expect(answer.statusCode).toBe(503);
    expect(answer.headers['retry-after']).toBe('5');
    const said = errorAnswerSchema.parse(answer.json());
    expect(said).toEqual({ code: 'BUSY', requestId: said.requestId, retryAfterSeconds: 5 });
    expect(toldToWait(answer.json())).toBe(5);
    // Nothing from inside reaches the caller.
    expect(answer.body).not.toMatch(/transaction|prisma|SELECT/i);
    // The log says why, under the request's id, as a warning: no failure inside the server.
    const lines = written.map((line) => JSON.parse(line) as Line);
    const ofIt = lines.filter((line) => line.requestId === said.requestId && line.level >= 40);
    expect(ofIt.map(({ level, why, msg }) => ({ level, why, msg }))).toEqual([
      {
        level: 40,
        why: 'CONNECTION_WAIT',
        msg: 'The database was busy: the caller was told to wait.',
      },
    ]);
    expect(lines.some((line) => line.level >= 50)).toBe(false);

    const again = await api.app.inject({ method: 'GET', url: '/test/reads' });
    expect([again.statusCode, again.json()]).toEqual([200, { status: 'ok' }]);
  });
});
