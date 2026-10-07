// The installer's side of the database (ARCHITECTURE §5.1; ADR-265, 266, 268): the four login roles,
// the database they share, and the owner's shadow database for `prisma migrate dev`. Grants on
// tables, the guards and row-level security are migrations (BACKLOG 0.3), not the installer's.
import pg from 'pg';

import { PasscodeHasher, ScramVerifier } from './secrets.ts';

export interface Server {
  host: string;
  port: number;
}

export const loginRoles = ['adms_owner', 'adms_api', 'adms_worker', 'adms_readonly'] as const;

// The system actor's fixed id, the same in every installation (packages/db/src/system-actor.ts,
// which the seed writes from; the installer doesn't load the Prisma client to read it).
const systemActorId = '00000000-0000-7000-8000-000000000001';
export type LoginRole = (typeof loginRoles)[number];

// Every runtime login is limited to logging in: no superuser, no creating databases or roles, no
// replication, no way round row-level security.
const limits = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';

export class Database {
  private readonly client: pg.Client;

  private constructor(client: pg.Client) {
    this.client = client;
  }

  // As the server's own administrator (the local stack's `postgres`), to create and drop.
  static async administer(server: Server, password: string): Promise<Database> {
    const client = new pg.Client({
      ...server,
      user: 'postgres',
      password,
      database: 'postgres',
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    return new Database(client);
  }

  // Whether a login opens the installation's database with its password: undefined when it does,
  // otherwise the server's reason (which never contains the password).
  static async logInProblem(
    server: Server,
    role: LoginRole,
    password: string,
    name: string,
  ): Promise<string | undefined> {
    const client = new pg.Client({
      ...server,
      user: role,
      password,
      database: name,
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      const result = await client.query<{ user: string }>('SELECT current_user AS "user"');
      return result.rows[0]?.user === role ? undefined : 'logged in as someone else';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    } finally {
      await client.end();
    }
  }

  // How long a statement of this login may run, in milliseconds, as the login itself finds it on
  // signing in (ADR-394): nought means no limit.
  static async statementTimeout(
    server: Server,
    role: LoginRole,
    password: string,
    name: string,
  ): Promise<number> {
    return Database.asLogin(server, role, password, name, async (client) => {
      const result = await client.query<{ ms: number }>(
        `SELECT setting::int AS ms FROM pg_settings WHERE name = 'statement_timeout'`,
      );
      return result.rows[0]?.ms ?? 0;
    });
  }

  // Every table the guard migrations don't cover yet, as "table: what it misses" (ADR-271). Asked
  // as the owner, who runs the migrations; an empty list means every table is guarded.
  static async guardGaps(
    server: Server,
    role: LoginRole,
    password: string,
    name: string,
  ): Promise<string[]> {
    return Database.asLogin(server, role, password, name, async (client) => {
      const result = await client.query<{ table_name: string; gap: string }>(
        'SELECT table_name, gap FROM guard_gaps()',
      );
      return result.rows.map((row) => `${row.table_name}: ${row.gap}`);
    });
  }

  // What's wrong with the system actor (ADR-273, 276), or undefined when it's the seed's own row,
  // the only SYSTEM user, never changed since it was made, and its guard is in place. Asked as the
  // owner, like guardGaps.
  static async systemActorProblem(
    server: Server,
    role: LoginRole,
    password: string,
    name: string,
  ): Promise<string | undefined> {
    return Database.asLogin(server, role, password, name, async (client) => {
      const found = await client.query<{ id: string; role: string; archived: boolean }>(
        `SELECT "id"::text AS id, "role"::text AS role, "archived_at" IS NOT NULL AS archived
         FROM "user" WHERE "role" = 'SYSTEM' OR "id" = $1`,
        [systemActorId],
      );
      const [actor, ...others] = found.rows;
      if (actor === undefined) return 'missing: run `pnpm installer`';
      if (others.length > 0 || actor.id !== systemActorId || actor.role !== 'SYSTEM') {
        return 'role SYSTEM is not on the system actor alone';
      }
      if (actor.archived) return 'archived';
      const changed = await client.query(
        `SELECT 1 FROM "audit_record"
         WHERE "table_name" = 'user' AND "record_id" = $1 AND "operation" <> 'INSERT'`,
        [systemActorId],
      );
      if (changed.rowCount !== 0)
        return 'changed since the seed made it; its audit records say who';
      const guarded = await client.query(
        `SELECT 1 FROM pg_trigger
         WHERE tgname = 'user_system_actor' AND tgrelid = '"user"'::regclass AND tgenabled = 'O'`,
      );
      return guarded.rowCount === 1
        ? undefined
        : 'its guard (the user_system_actor trigger) is missing or disabled';
    });
  }

  // The master passcode the database keeps (ADR-281): its current version and whether what's kept
  // is an Argon2id hash, or undefined when it keeps none. The hash itself goes no further than
  // this. Asked as the owner; the table is missing until its migration has run.
  static async masterPasscode(
    server: Server,
    role: LoginRole,
    password: string,
    name: string,
  ): Promise<{ version: number; argon2id: boolean } | undefined> {
    return Database.asLogin(server, role, password, name, async (client) => {
      const found = await client.query<{ version: number; hash: string }>(
        'SELECT "version", "hash" FROM "master_passcode" ORDER BY "version" DESC LIMIT 1',
      );
      const [current] = found.rows;
      if (current === undefined) return undefined;
      return { version: current.version, argon2id: new PasscodeHasher().wellFormed(current.hash) };
    });
  }

  // Runs one piece of work as a login on the installation's database, then closes the connection.
  private static async asLogin<T>(
    server: Server,
    role: LoginRole,
    password: string,
    name: string,
    work: (client: pg.Client) => Promise<T>,
  ): Promise<T> {
    const client = new pg.Client({
      ...server,
      user: role,
      password,
      database: name,
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    try {
      return await work(client);
    } finally {
      await client.end();
    }
  }

  async close(): Promise<void> {
    await this.client.end();
  }

  async roleExists(role: LoginRole): Promise<boolean> {
    const result = await this.client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    return result.rowCount === 1;
  }

  async createRole(role: LoginRole, password: string): Promise<void> {
    const verifier = this.client.escapeLiteral(new ScramVerifier().make(password));
    await this.client.query(`CREATE ROLE ${this.identifier(role)} ${limits} PASSWORD ${verifier}`);
  }

  // The statement timeout kept on a login, as written (milliseconds when the installer wrote it),
  // or undefined when it has none.
  async statementTimeout(role: LoginRole): Promise<string | undefined> {
    const result = await this.client.query<{ setting: string }>(
      `SELECT unnest(s.setconfig) AS setting FROM pg_db_role_setting s
       JOIN pg_roles r ON r.oid = s.setrole
       WHERE s.setdatabase = 0 AND r.rolname = $1`,
      [role],
    );
    const name = 'statement_timeout=';
    return result.rows.find(({ setting }) => setting.startsWith(name))?.setting.slice(name.length);
  }

  // The databases in which a login has a statement timeout of its own, which would stand in
  // front of the one kept on the login.
  async statementTimeoutDatabases(role: LoginRole): Promise<string[]> {
    const result = await this.client.query<{ name: string }>(
      `SELECT d.datname AS name FROM pg_db_role_setting s
       JOIN pg_roles r ON r.oid = s.setrole
       JOIN pg_database d ON d.oid = s.setdatabase
       WHERE r.rolname = $1
         AND EXISTS (SELECT 1 FROM unnest(s.setconfig) AS c WHERE c LIKE 'statement_timeout=%')
       ORDER BY d.datname`,
      [role],
    );
    return result.rows.map(({ name }) => name);
  }

  // Takes a login's statement timeout off: the one kept on the login, or its own in one database.
  async clearStatementTimeout(role: LoginRole, inDatabase?: string): Promise<void> {
    const where = inDatabase === undefined ? '' : ` IN DATABASE ${this.identifier(inDatabase)}`;
    await this.client.query(`ALTER ROLE ${this.identifier(role)}${where} RESET statement_timeout`);
  }

  // Kept on the login, so every connection it opens from now on is under it, whatever the
  // service asks for (ARCHITECTURE §5.7; ADR-394). A whole number of milliseconds, checked here
  // too since a setting's value can't be handed over as a parameter.
  async setStatementTimeout(role: LoginRole, milliseconds: number): Promise<void> {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) {
      throw new Error(`A statement timeout is a whole number of milliseconds, 1 or more.`);
    }
    await this.client.query(
      `ALTER ROLE ${this.identifier(role)} SET statement_timeout = ${String(milliseconds)}`,
    );
  }

  // A database's owner, or undefined when it doesn't exist.
  async owner(name: string): Promise<string | undefined> {
    const result = await this.client.query<{ owner: string }>(
      'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1',
      [name],
    );
    return result.rows[0]?.owner;
  }

  // Owned by adms_owner; nobody else may connect but the logins named.
  async create(name: string, connect: readonly LoginRole[]): Promise<void> {
    const database = this.identifier(name);
    await this.client.query(
      `CREATE DATABASE ${database} OWNER adms_owner TEMPLATE template0 ENCODING 'UTF8'`,
    );
    await this.client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    if (connect.length > 0) {
      const roles = connect.map((role) => this.identifier(role)).join(', ');
      await this.client.query(`GRANT CONNECT ON DATABASE ${database} TO ${roles}`);
    }
  }

  async publicCanConnect(name: string): Promise<boolean> {
    const result = await this.client.query<{ allowed: boolean }>(
      `SELECT has_database_privilege('public', $1, 'CONNECT') AS allowed`,
      [name],
    );
    return result.rows[0]?.allowed === true;
  }

  // Teardown: the databases first (they hold the roles' objects), then the roles.
  async drop(databases: readonly string[]): Promise<string[]> {
    const dropped: string[] = [];
    for (const name of databases) {
      if ((await this.owner(name)) !== undefined) {
        await this.client.query(`DROP DATABASE ${this.identifier(name)} WITH (FORCE)`);
        dropped.push(`database ${name}`);
      }
    }
    for (const role of loginRoles) {
      if (await this.roleExists(role)) {
        await this.client.query(`DROP ROLE ${this.identifier(role)}`);
        dropped.push(`login ${role}`);
      }
    }
    return dropped;
  }

  private identifier(name: string): string {
    return this.client.escapeIdentifier(name);
  }
}
