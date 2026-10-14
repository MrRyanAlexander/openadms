// The database's configuration against the CIS PostgreSQL Benchmark, the items for this layer
// (ARCHITECTURE §16; ADR-276; BACKLOG carry-forward C9). The logins' own attributes and the schema's
// rights are in grants.test.ts. What waits for the cloud (TLS, connection logging, pgAudit, the
// server's own hardening) is listed in ADR-276.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

const logins = ['adms_api', 'adms_owner', 'adms_readonly', 'adms_worker'];

// The release's policy values (packages/domain/policy.env; ADR-303): no secret is in that file.
const policy = parseEnv(readFileSync(new URL('../../domain/policy.env', import.meta.url), 'utf8'));

describe("the database's configuration (CIS PostgreSQL Benchmark)", () => {
  it('passwords are stored as SCRAM-SHA-256 verifiers, never MD5 or plain text', async () => {
    const { db } = tested;
    await db.administer();
    expect(await db.one(`SELECT current_setting('password_encryption') AS setting`)).toEqual({
      setting: 'scram-sha-256',
    });
    const stored = await db.rows<{ login: string; scram: boolean }>(
      `SELECT rolname AS login, rolpassword LIKE 'SCRAM-SHA-256$%' AS scram FROM pg_authid
       WHERE rolname LIKE 'adms%' ORDER BY rolname`,
    );
    expect(stored).toEqual(logins.map((login) => ({ login, scram: true })));
  });

  it('every client over TCP signs in with SCRAM over TLS alone; trust is only the container’s own socket (KD-78; ADR-517)', async () => {
    // The local stack publishes Postgres on the host's 127.0.0.1 only; a connection through it
    // arrives from Docker's network, as the API's and the worker's do. Every one meets the one
    // `hostssl` rule: a connection that won't speak TLS matches none and is refused
    // (infra/local/postgres/pg_hba.conf; packages/db/test/tls.test.ts). The trust rule is the
    // image's, for its own entrypoint and `docker exec` inside the container.
    const { db } = tested;
    await db.administer();
    const rules = await db.rows<{ rule: string }>(
      `SELECT concat_ws(' ', type, array_to_string(database, ','), array_to_string(user_name, ','),
         coalesce(address, '-'), auth_method) AS rule
       FROM pg_hba_file_rules ORDER BY rule_number`,
    );
    expect(rules.map((row) => row.rule)).toEqual([
      'local all all - trust',
      'hostssl all all all scram-sha-256',
    ]);
  });

  it('nobody but the logins may connect or make temporary tables in the database', async () => {
    const { db } = tested;
    await db.administer();
    const rights = await db.rows<{ who: string; connect: boolean; temp: boolean; create: boolean }>(
      `SELECT who, has_database_privilege(who, current_database(), 'CONNECT') AS connect,
         has_database_privilege(who, current_database(), 'TEMP') AS temp,
         has_database_privilege(who, current_database(), 'CREATE') AS create
       FROM unnest(ARRAY['public', 'adms_api', 'adms_owner', 'adms_readonly', 'adms_worker']) AS who
       ORDER BY who`,
    );
    expect(rights).toEqual([
      { who: 'adms_api', connect: true, temp: false, create: false },
      { who: 'adms_owner', connect: true, temp: true, create: true },
      { who: 'adms_readonly', connect: true, temp: false, create: false },
      { who: 'adms_worker', connect: true, temp: false, create: false },
      { who: 'public', connect: false, temp: false, create: false },
    ]);
  });

  it('AC-10-42 each service login is under a statement timeout, the policy value the installer set; the owner, who runs the migrations, has none', async () => {
    // Read from what the server keeps on each login, which every connection it opens starts
    // with: these tests reach a login with SET ROLE, which does not take a login's settings on.
    // An installation whose service states its own value (ADR-395) is held by `pnpm
    // installer:check`; this one is as the release ships it.
    const { db } = tested;
    await db.administer();
    const kept = await db.rows<{ login: string; settings: string[] | null }>(
      `SELECT r.rolname AS login, s.setconfig AS settings FROM pg_roles r
       LEFT JOIN pg_db_role_setting s ON s.setrole = r.oid AND s.setdatabase = 0
       WHERE r.rolname LIKE 'adms%' ORDER BY r.rolname`,
    );
    const timeout = [`statement_timeout=${String(policy['STATEMENT_TIMEOUT_MS'])}`];
    expect(policy['STATEMENT_TIMEOUT_MS']).toMatch(/^[1-9]\d*$/);
    expect(kept).toEqual([
      { login: 'adms_api', settings: timeout },
      { login: 'adms_owner', settings: null },
      { login: 'adms_readonly', settings: timeout },
      { login: 'adms_worker', settings: timeout },
    ]);
    // Nothing kept for a login in one database only stands in front of it.
    expect(
      await db.rows(
        `SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
         WHERE r.rolname LIKE 'adms%' AND s.setdatabase <> 0`,
      ),
    ).toEqual([]);
  });

  it('row-level security is on for the server', async () => {
    const { db } = tested;
    expect(await db.one(`SELECT current_setting('row_security') AS setting`)).toEqual({
      setting: 'on',
    });
  });

  it('adms_owner owns every table, view, sequence, function and type in the schema', async () => {
    const { db } = tested;
    await db.administer();
    const owners = await db.rows<{ owner: string }>(
      `SELECT DISTINCT pg_get_userbyid(relowner) AS owner FROM pg_class
         WHERE relnamespace = 'public'::regnamespace
       UNION SELECT DISTINCT pg_get_userbyid(proowner) FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace
       UNION SELECT DISTINCT pg_get_userbyid(typowner) FROM pg_type
         WHERE typnamespace = 'public'::regnamespace`,
    );
    expect(owners).toEqual([{ owner: 'adms_owner' }]);
  });
});
