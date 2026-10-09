// A story's own database (ADR-275): nothing can be deleted, so a story never runs in the
// installation's database (adms); it gets a new one on the local stack, adms_story_…, and the
// harness drops it afterwards. Made as the installer makes adms: owned by adms_owner, nobody but the
// logins may connect (Postgres gives a new database an open access list), then migrated by Prisma
// from the same migrations (prisma.story.config.js) and seeded by the same seed, so every story
// starts at the migrations' head with only the system actor and the master passcode in it.
//
// Like the installer, it speaks to the local stack's server administrator to create and drop, with
// the password from infra/local/.env; everything a story writes goes through @open-adms/db as the
// services' own logins, their URLs read from their env files. No password or URL is ever printed.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import {
  openDatabase,
  openViewerDatabase,
  Seed,
  type Database,
  type ViewerDatabase,
} from '@open-adms/db';
import pg from 'pg';

const root = new URL('../../../', import.meta.url);
const dbPackage = new URL('packages/db/', root);
const needs =
  'Stories need the local stack and an installation: `pnpm local:up`, then `pnpm installer`.';
const storyName = /^adms_story_[a-z0-9_]+$/;
// The logins that may connect, as for adms; adms_owner owns it.
const logins = ['adms_api', 'adms_worker', 'adms_readonly'] as const;
// Every story's firm has the same made-up master passcode, `heron-marsh-delphine`; this is its
// slow hash, made once by the installer's own hasher (Argon2id), as the installer hands the seed
// the real one. Not a secret: no installation uses it.
export const storyMasterPasscode = 'heron-marsh-delphine';
const storyMasterPasscodeHash =
  '$argon2id$v=19$m=19456,t=2,p=1$rLnL+hWkLjJHDKTBWGSsdw$tYeMf5WEtzZTIdv2JQR18zDWwcllaJjVO71qautLsGY';

export type Service = 'api' | 'worker';

export class StoryDatabase {
  readonly name: string;
  private readonly admin: pg.Client;
  private dropped = false;

  private constructor(name: string, admin: pg.Client) {
    this.name = name;
    this.admin = admin;
  }

  // A new, empty database, locked down. The caller drops it (drop()), whatever happens.
  static async create(): Promise<StoryDatabase> {
    const admin = await StoryDatabase.administer();
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const name = `adms_story_${stamp}_${randomBytes(3).toString('hex')}`;
    const made = new StoryDatabase(name, admin);
    const database = admin.escapeIdentifier(name);
    try {
      await admin.query(
        `CREATE DATABASE ${database} OWNER adms_owner TEMPLATE template0 ENCODING 'UTF8'`,
      );
      await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
      await admin.query(
        `GRANT CONNECT ON DATABASE ${database} TO ${logins.map((login) => admin.escapeIdentifier(login)).join(', ')}`,
      );
      if (await made.publicCanConnect()) throw new Error(`Anyone may connect to ${name}. Stopped.`);
    } catch (error) {
      await made.drop();
      throw error;
    }
    return made;
  }

  // Every story database on the local stack, left behind or running.
  static async list(): Promise<string[]> {
    const admin = await StoryDatabase.administer();
    try {
      return await StoryDatabase.named(admin);
    } finally {
      await admin.end();
    }
  }

  // Drops every story database left behind (a run that was killed). Only while no story runs.
  static async clean(): Promise<string[]> {
    const admin = await StoryDatabase.administer();
    try {
      const names = await StoryDatabase.named(admin);
      for (const name of names) {
        await admin.query(`DROP DATABASE ${admin.escapeIdentifier(name)} WITH (FORCE)`);
      }
      return names;
    } finally {
      await admin.end();
    }
  }

  private static async named(admin: pg.Client): Promise<string[]> {
    const found = await admin.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datname LIKE 'adms\\_story\\_%' ORDER BY datname`,
    );
    return found.rows.map((row) => row.datname).filter((name) => storyName.test(name));
  }

  async publicCanConnect(): Promise<boolean> {
    const result = await this.admin.query<{ allowed: boolean }>(
      `SELECT has_database_privilege('public', $1, 'CONNECT') AS allowed`,
      [this.name],
    );
    return result.rows[0]?.allowed === true;
  }

  // Every migration, as adms_owner, through Prisma (prisma migrate deploy); how many were applied.
  migrate(): number {
    const env: NodeJS.ProcessEnv = { ...process.env, ADMS_STORY_DATABASE: this.name };
    delete env['DATABASE_URL'];
    const folder = fileURLToPath(dbPackage);
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('node_modules/prisma/build/index.js', dbPackage)),
        'migrate',
        'deploy',
        '--config',
        'prisma.story.config.js',
      ],
      { cwd: folder, env, encoding: 'utf8' },
    );
    const output = `${result.stderr}${result.stdout}`.replace(
      /postgres(ql)?:\/\/\S+/g,
      '<connection URL>',
    );
    if (result.status !== 0)
      throw new Error(`The migrations did not apply to ${this.name}:\n${output}`);
    const applied = /(\d+) migrations? found/.exec(output)?.[1];
    return Number(applied ?? '0');
  }

  // The installer's seed (the system actor, the master passcode's hash), as adms_owner.
  async seed(): Promise<string[]> {
    const owner = openDatabase({ url: this.url(new URL('.env', dbPackage)), maxConnections: 1 });
    try {
      return await new Seed(owner, { masterPasscodeHash: storyMasterPasscodeHash }).run();
    } finally {
      await owner.$disconnect();
    }
  }

  // A service's own client on this database: its login, from its env file. The worker's takes
  // more connections: each run holds one for its project's lock while it works (ADR-352).
  open(service: Service): Database {
    return openDatabase({
      url: this.url(new URL(`apps/${service}/.env`, root)),
      maxConnections: service === 'worker' ? 4 : 2,
    });
  }

  // The API's second way in, on this database: the read-only login, for what a read-only
  // viewer reads, from the API's own env file (ADR-434, 435). It offers `$viewed` alone, and
  // sees what the story's services have committed.
  openViewer(): ViewerDatabase {
    return openViewerDatabase({
      url: this.url(new URL('apps/api/.env', root), 'READONLY_DATABASE_URL'),
      maxConnections: 2,
    });
  }

  async drop(): Promise<void> {
    if (this.dropped) return;
    this.dropped = true;
    try {
      await this.admin.query(
        `DROP DATABASE IF EXISTS ${this.admin.escapeIdentifier(this.name)} WITH (FORCE)`,
      );
    } finally {
      await this.admin.end();
    }
  }

  // Leaves the database for a person to look at (--keep); the harness no longer holds it.
  async keep(): Promise<void> {
    this.dropped = true;
    await this.admin.end();
  }

  // The URL in an env file, pointed at this database. Never printed.
  private url(envFile: URL, key = 'DATABASE_URL'): string {
    const path = fileURLToPath(envFile);
    if (!existsSync(path))
      throw new Error(`${needs} (${path.replace(fileURLToPath(root), '')} is missing)`);
    const written = parseEnv(readFileSync(path, 'utf8'))[key];
    if (written === undefined) throw new Error(`${needs} (no ${key} in its env file)`);
    const url = new URL(written);
    url.pathname = `/${this.name}`;
    return url.toString();
  }

  private static async administer(): Promise<pg.Client> {
    const stackEnv = new URL('infra/local/.env', root);
    if (!existsSync(stackEnv)) throw new Error(`${needs} (infra/local/.env is missing)`);
    const env = parseEnv(readFileSync(stackEnv, 'utf8'));
    const password = env['POSTGRES_PASSWORD'];
    if (password === undefined) throw new Error(`${needs} (no administrator password)`);
    const admin = new pg.Client({
      host: '127.0.0.1',
      port: Number(env['ADMS_PG_PORT'] ?? '55432'),
      user: 'postgres',
      password,
      database: 'postgres',
      connectionTimeoutMillis: 5000,
    });
    try {
      await admin.connect();
    } catch (error) {
      throw new Error(`${needs} ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
    return admin;
  }
}
