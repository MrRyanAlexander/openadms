// Every connection to Postgres is encrypted (ARCHITECTURE §5.7; OWASP ASVS 5.0 12.3.1, 12.3.3;
// KD-78; ADR-517): the local stack's Postgres takes TLS alone, from this machine and from inside
// the stack alike, and a client checks its certificate against the stack's own root and the
// address it reached. Asked of the running stack: it needs `pnpm local:up` after `pnpm
// installer`, and fails saying so. Nothing is written.
import { existsSync, readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';

import { openService } from './support/service.ts';

const root = new URL('../../../', import.meta.url);
const stackEnv = new URL('infra/local/.env', root);
const rootCert = new URL('infra/local/.generated/caddy-root.crt', root);
const needs = 'These tests need the local stack: run `pnpm local:up` after `pnpm installer`.';

let administrator: { password: string; port: number };

beforeAll(() => {
  if (!existsSync(stackEnv) || !existsSync(rootCert)) throw new Error(needs);
  const env = parseEnv(readFileSync(stackEnv, 'utf8'));
  const password = env['POSTGRES_PASSWORD'];
  if (password === undefined) throw new Error(needs);
  administrator = { password, port: Number(env['ADMS_PG_PORT'] ?? '55432') };
});

// The stack's administrator, from this machine, over the TLS given (or none).
async function asAdministrator<T>(
  ssl: pg.ClientConfig['ssl'],
  work: (client: pg.Client) => Promise<T>,
  host = '127.0.0.1',
): Promise<T> {
  const client = new pg.Client({
    host,
    port: administrator.port,
    user: 'postgres',
    password: administrator.password,
    database: 'postgres',
    connectionTimeoutMillis: 5000,
    ssl,
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function refusal(asked: Promise<unknown>): Promise<string> {
  try {
    await asked;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Postgres took the connection.');
}

describe('the stack’s Postgres', () => {
  it('KD-78 refuses a connection that won’t speak TLS, whoever logs in, before any password is asked', async () => {
    const said = await refusal(asAdministrator(false, () => Promise.resolve()));
    expect(said).toMatch(/no pg_hba\.conf entry for host .* no encryption/);
  });

  it('KD-78 answers over TLS 1.2 or 1.3 with its certificate of the stack’s root, for the address it was reached at', async () => {
    const ca = readFileSync(rootCert, 'utf8');
    const seen = await asAdministrator({ ca, rejectUnauthorized: true }, async (client) => {
      const { rows } = await client.query<{ ssl: boolean; version: string }>(
        'SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()',
      );
      return rows[0];
    });
    expect(seen?.ssl).toBe(true);
    expect(seen?.version).toMatch(/^TLSv1\.[23]$/);
    // And by its name on this machine.
    await asAdministrator({ ca, rejectUnauthorized: true }, () => Promise.resolve(), 'localhost');
  });

  it('ASVS 12.3.2, 12.3.4 is refused by a client that trusts other roots, the public ones Node ships among them: the stack’s root is named exactly, never taken from a store', async () => {
    const said = await refusal(
      asAdministrator({ ca: [...rootCertificates], rejectUnauthorized: true }, () =>
        Promise.resolve(),
      ),
    );
    expect(said).toMatch(/self[- ]signed|unable to (get|verify)/i);
  });

  it('KD-78 every service login’s connection, from inside the stack or this machine, is TLS', async () => {
    // A connection of the API's own login, as the API opens one, to be sure there is one.
    const api = openService('api', 1);
    try {
      await api.$queryRaw`SELECT 1`;
      const ca = readFileSync(rootCert, 'utf8');
      const connections = await asAdministrator(
        { ca, rejectUnauthorized: true },
        async (client) => {
          const { rows } = await client.query<{ usename: string; ssl: boolean }>(
            `SELECT a.usename, s.ssl
             FROM pg_stat_activity a JOIN pg_stat_ssl s USING (pid)
            WHERE a.backend_type = 'client backend' AND a.client_addr IS NOT NULL`,
          );
          return rows;
        },
      );
      const logins = new Set(connections.map(({ usename }) => usename));
      expect(logins.has('adms_api')).toBe(true);
      expect(connections.filter(({ ssl }) => !ssl)).toEqual([]);
    } finally {
      await api.$disconnect();
    }
  });
});
