// The database tests' way in (BACKLOG 0.3.3; ADR-272). They run against the installation's test
// database on the local stack (adms_test, made beside adms as adms is: src/test-database.ts), never
// the installation's own, as the stack's server administrator, and reach each login with
// SET LOCAL ROLE: the login's own privileges and row-level security apply, and no login's password
// is read. Each test's work is one database transaction, always rolled back, so nothing is left
// behind, even when a test fails or the run is killed (the server rolls back a dropped connection).
// The administrator's password comes from infra/local/.env, read in this process, never printed.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import pg from 'pg';

import { deviceKeyActorId } from '../../src/device-key-actor.ts';
import { masterPasscodeActorId } from '../../src/master-passcode-actor.ts';
import { systemActorId } from '../../src/system-actor.ts';
import { testDatabase } from '../../src/test-database.ts';

export type Login = 'adms_owner' | 'adms_api' | 'adms_worker' | 'adms_readonly';
export type Source = 'DEVICE' | 'BACK_OFFICE' | 'SYSTEM';

// The SQLSTATEs the guards answer with.
export const refusedBy = {
  grant: '42501', // insufficient_privilege: no grant, or no actor or source stated
  trigger: '23001', // restrict_violation: a delete, a truncate or an audit change refused
  // The same code from a foreign key itself: a referenced row's key can't change (ON UPDATE RESTRICT).
  restrict: '23001',
  check: '23514',
  unique: '23505',
  foreignKey: '23503',
  notNull: '23502',
  // exclusion_violation: two rows an exclusion constraint keeps apart (overlapping size bands)
  exclusion: '23P01',
  badValue: '22P02',
  // invalid_parameter_value: a time zone the server's time zone data doesn't know
  unknownTimeZone: '22023',
} as const;

export interface Refusal {
  code: string;
  message: string;
}

const root = new URL('../../../../', import.meta.url);
const stackEnv = new URL('infra/local/.env', root);
const migrations = new URL('packages/db/prisma/migrations/', root);
const needs =
  'The database tests need the local stack and an installation at head: `pnpm local:up`, then `pnpm installer`.';

export class GuardedDatabase {
  private readonly client: pg.Client;
  private attempts = 0;

  private constructor(client: pg.Client) {
    this.client = client;
  }

  // Opens the installation's test database (or ADMS_TEST_DATABASE, another test's database on the
  // local stack), and refuses to test one that isn't at the migrations' head.
  static async open(): Promise<GuardedDatabase> {
    if (!existsSync(stackEnv)) throw new Error(`${needs} (infra/local/.env is missing)`);
    const env = parseEnv(readFileSync(stackEnv, 'utf8'));
    const password = env['POSTGRES_PASSWORD'];
    if (password === undefined) throw new Error(`${needs} (no administrator password)`);
    const database = testDatabase();
    const client = new pg.Client({
      host: '127.0.0.1',
      port: Number(env['ADMS_PG_PORT'] ?? '55432'),
      user: 'postgres',
      password,
      database,
      connectionTimeoutMillis: 5000,
      // Over TLS alone, the server checked against the stack's own root (KD-78; ADR-517).
      ssl: { ca: readFileSync(new URL('infra/local/.generated/caddy-root.crt', root), 'utf8') },
    });
    try {
      await client.connect();
    } catch (error) {
      throw new Error(`${needs} ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
    const opened = new GuardedDatabase(client);
    await opened.requireHead();
    return opened;
  }

  async close(): Promise<void> {
    await this.client.end();
  }

  async begin(): Promise<void> {
    await this.client.query('BEGIN');
  }

  async rollback(): Promise<void> {
    await this.client.query('ROLLBACK');
  }

  // Acts as a login until the next as() or administer(); undone with the rest of the test's work.
  async as(login: Login): Promise<void> {
    await this.client.query(`SET LOCAL ROLE ${this.client.escapeIdentifier(login)}`);
  }

  // Back to the server's administrator, a superuser.
  async administer(): Promise<void> {
    await this.client.query('RESET ROLE');
  }

  // States who is writing, as the API and the worker will (ARCHITECTURE §5.3; ADR-270 (4)).
  async actor(
    actorId: string,
    source: Source,
    more: { deviceId?: string; reason?: string; requestId?: string } = {},
  ): Promise<void> {
    await this.settings({
      'adms.actor_id': actorId,
      'adms.source': source,
      'adms.device_id': more.deviceId ?? '',
      'adms.reason': more.reason ?? '',
      'adms.request_id': more.requestId ?? '',
    });
  }

  async noActor(): Promise<void> {
    await this.settings({ 'adms.actor_id': '', 'adms.source': '' });
  }

  // States the read-only viewer, as the API will for each request (ADR-315; C22): the viewer's own
  // id. What they may see is the database's to read from their record.
  async viewer(viewerId: string): Promise<void> {
    await this.settings({ 'adms.viewer_id': viewerId });
  }

  async noViewer(): Promise<void> {
    await this.settings({ 'adms.viewer_id': '' });
  }

  async rows<Row extends pg.QueryResultRow>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<Row[]> {
    return (await this.client.query<Row>(sql, [...values])).rows;
  }

  async one<Row extends pg.QueryResultRow>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<Row> {
    const [row, ...more] = await this.rows<Row>(sql, values);
    if (row === undefined || more.length > 0) throw new Error(`Expected one row from: ${sql}`);
    return row;
  }

  // Runs a statement that must succeed; the number of rows it touched.
  async run(sql: string, values: readonly unknown[] = []): Promise<number> {
    return (await this.client.query(sql, [...values])).rowCount ?? 0;
  }

  // Runs a statement that must be refused, at a savepoint, so the test's work carries on after it.
  // Returns how it was refused; throws if it ran.
  async refused(sql: string, values: readonly unknown[] = []): Promise<Refusal> {
    this.attempts += 1;
    const savepoint = `attempt_${String(this.attempts)}`;
    await this.client.query(`SAVEPOINT ${savepoint}`);
    try {
      await this.client.query(sql, [...values]);
    } catch (error) {
      await this.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      if (error instanceof pg.DatabaseError && error.code !== undefined) {
        return { code: error.code, message: error.message };
      }
      throw error;
    }
    await this.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    throw new Error(`Expected a refusal, but it ran: ${sql}`);
  }

  private async settings(values: Record<string, string>): Promise<void> {
    for (const [name, value] of Object.entries(values)) {
      await this.client.query('SELECT set_config($1, $2, true)', [name, value]);
    }
  }

  // Every migration in the folder is applied and the seed has run, so the tests never pass against
  // a stale database.
  private async requireHead(): Promise<void> {
    const inFolder = readdirSync(migrations, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const applied = new Set(
      (
        await this.rows<{ migration_name: string }>(
          `SELECT migration_name FROM _prisma_migrations
           WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
        )
      ).map((row) => row.migration_name),
    );
    const missing = inFolder.filter((name) => !applied.has(name));
    if (missing.length > 0) {
      await this.close();
      throw new Error(`${needs} Not applied yet: ${missing.join(', ')}`);
    }
    // The seed's system actor, which the worker's writes are attributed to (ADR-273), and the
    // master passcode it keeps, which every enrolled phone holds a version of (ADR-281).
    const seeded = await this.rows(`SELECT 1 FROM "user" WHERE "id" = $1 AND "role" = 'SYSTEM'`, [
      systemActorId,
    ]);
    if (seeded.length === 0) {
      await this.close();
      throw new Error(`${needs} The seed's system actor is missing.`);
    }
    const underPasscode = await this.rows(
      `SELECT 1 FROM "user" WHERE "id" = $1 AND "role" = 'MASTER_PASSCODE'`,
      [masterPasscodeActorId],
    );
    if (underPasscode.length === 0) {
      await this.close();
      throw new Error(`${needs} The seed's master passcode actor is missing.`);
    }
    const byDeviceKey = await this.rows(
      `SELECT 1 FROM "user" WHERE "id" = $1 AND "role" = 'DEVICE_KEY'`,
      [deviceKeyActorId],
    );
    if (byDeviceKey.length === 0) {
      await this.close();
      throw new Error(`${needs} The seed's device key actor is missing.`);
    }
    const passcode = await this.rows(`SELECT 1 FROM "master_passcode" WHERE "version" = 1`);
    if (passcode.length === 0) {
      await this.close();
      throw new Error(`${needs} The seed's master passcode is missing.`);
    }
  }
}
