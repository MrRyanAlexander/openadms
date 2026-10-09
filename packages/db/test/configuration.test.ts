// The database's configuration against the CIS PostgreSQL Benchmark, the items for this layer
// (ARCHITECTURE §16; ADR-276; BACKLOG carry-forward C9). The logins' own attributes and the schema's
// rights are in grants.test.ts. What waits for the cloud (TLS, connection logging, pgAudit, the
// server's own hardening) is listed in ADR-276.
import { describe, expect, it } from 'vitest';

import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

const logins = ['adms_api', 'adms_owner', 'adms_readonly', 'adms_worker'];

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

  it('every client from outside the container signs in with SCRAM; trust is only its own socket and loopback', async () => {
    // The local stack publishes Postgres on the host's 127.0.0.1 only; a connection through it
    // arrives from Docker's network, so it meets the last rule. The trust rules are the image's,
    // for `docker exec` inside the container (as the host's Docker user, already its root).
    const { db } = tested;
    await db.administer();
    const rules = await db.rows<{ rule: string }>(
      `SELECT concat_ws(' ', type, array_to_string(database, ','), array_to_string(user_name, ','),
         coalesce(address, '-'), auth_method) AS rule
       FROM pg_hba_file_rules ORDER BY rule_number`,
    );
    expect(rules.map((row) => row.rule)).toEqual([
      'local all all - trust',
      'host all all 127.0.0.1 trust',
      'host all all ::1 trust',
      'local replication all - trust',
      'host replication all 127.0.0.1 trust',
      'host replication all ::1 trust',
      'host all all all scram-sha-256',
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
