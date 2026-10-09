// The master passcode's own actor, and wrong tries at the passcode (ARCHITECTURE §5.3, §6, §7.5;
// spec/acceptance/10-api-and-sync.md AC-10-22; ADR-438, 439; BACKLOG C45, C88; REQ-209): whoever
// holds the master passcode is not known, so an act under it is written as a user that is no
// person. Only the API states it, and only for a phone; nobody changes its row; no record names
// it. The record of wrong tries is the API's alone.
import { describe, expect, it } from 'vitest';

import { masterPasscodeActorId, masterPasscodeActorName } from '../src/master-passcode-actor.ts';
import { systemActorId } from '../src/system-actor.ts';
import { refusedBy } from './support/database.ts';
import { insertOf, projectLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { columnsNamingAUser } from './support/master-passcode-actor.ts';
import { deviceKeyLike } from './support/device-keys.ts';

const tested = eachTestRolledBack();

// Shaped like an Argon2id hash (a PHC string); nothing hashes to it.
const aHash = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

const enrol = `INSERT INTO "device" ("name", "public_key", "master_passcode_version")
  VALUES ($1, $2, 1) RETURNING "id"::text`;
const note = `INSERT INTO "security_event" ("kind", "device_id", "request_id", "occurred_at")
  VALUES ($1, $2, 'req-enrol-1', '2026-10-12T10:50:00Z') RETURNING "id"::text`;
const count = `INSERT INTO "master_passcode_tries" ("version", "failed_tries") VALUES (1, 1)
  RETURNING "id"::text`;

const newProject = (): [string, unknown[]] => insertOf('project', projectLike(tested.world));

async function auditedFor(
  recordId: string,
): Promise<{ actor: string; source: string; device: string | null; domain: string }[]> {
  const { db } = tested;
  await db.administer();
  return db.rows(
    `SELECT "actor_id"::text AS actor, "source"::text AS source, "device_id"::text AS device,
            "domain"::text AS domain
     FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
    [recordId],
  );
}

describe('an act under the master passcode is written as its own actor', () => {
  it("AC-10-22 the seed made it: one user, role MASTER_PASSCODE, nobody's person", async () => {
    const { db } = tested;
    expect(
      await db.rows(
        `SELECT "id"::text AS id, "name", "monitor_number", "email", "phone", "contractor_id",
                "employer_id", "viewer_kind", "archived_at"
         FROM "user" WHERE "role" = 'MASTER_PASSCODE'`,
      ),
    ).toEqual([
      {
        id: masterPasscodeActorId,
        name: masterPasscodeActorName,
        monitor_number: null,
        email: null,
        phone: null,
        contractor_id: null,
        employer_id: null,
        viewer_kind: null,
        archived_at: null,
      },
    ]);
    // Made by the system actor, as the seed's other rows are.
    expect(await auditedFor(masterPasscodeActorId)).toEqual([
      { actor: systemActorId, source: 'SYSTEM', device: null, domain: 'SECURITY' },
    ]);
  });

  it('AC-10-22 the API enrols a phone as it, for that phone, and the audit log says so', async () => {
    const { db } = tested;
    await db.as('adms_api');
    await db.actor(masterPasscodeActorId, 'DEVICE');
    const { id: phone } = await db.one<{ id: string }>(enrol, ['P1-UR-1', deviceKeyLike('new')]);
    await db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: phone, requestId: 'req-enrol-1' });
    const { id: event } = await db.one<{ id: string }>(note, ['MASTER_PASSCODE_USE', phone]);
    expect(await auditedFor(phone)).toEqual([
      { actor: masterPasscodeActorId, source: 'DEVICE', device: null, domain: 'SECURITY' },
    ]);
    expect(await auditedFor(event)).toEqual([
      { actor: masterPasscodeActorId, source: 'DEVICE', device: phone, domain: 'SECURITY' },
    ]);
  });

  it('only for a phone: with any other source the API is refused, and nothing is audited', async () => {
    const { db } = tested;
    await db.as('adms_api');
    for (const source of ['BACK_OFFICE', 'SYSTEM'] as const) {
      await db.actor(masterPasscodeActorId, source);
      const refusal = await db.refused(...newProject());
      expect(refusal.code, source).toBe(refusedBy.grant);
      if (source === 'BACK_OFFICE') {
        expect(refusal.message).toBe(
          "The master passcode's actor writes only for a phone: source BACK_OFFICE may not be stated with it (a write to project)",
        );
      }
    }
  });

  it('only the API: the worker, the owner and the server’s superuser are refused it', async () => {
    const { db, world } = tested;
    const refusal = (login: string, table: string) => ({
      code: refusedBy.grant,
      message: `Only the API writes as the master passcode's actor: ${login} may not state it (a write to ${table})`,
    });
    await db.as('adms_worker');
    await db.actor(masterPasscodeActorId, 'DEVICE');
    expect(
      await db.refused(`UPDATE "field_event" SET "status" = 'COMPLETED' WHERE "id" = $1`, [
        world.loads.l101001.disposal,
      ]),
    ).toEqual(refusal('adms_worker', 'field_event'));
    await db.as('adms_owner');
    await db.actor(masterPasscodeActorId, 'DEVICE');
    expect(await db.refused(...newProject())).toEqual(refusal('adms_owner', 'project'));
    await db.administer();
    await db.actor(masterPasscodeActorId, 'DEVICE');
    expect(await db.refused(...newProject())).toEqual({
      code: refusedBy.grant,
      message:
        "Only the API writes as the master passcode's actor: postgres may not state it (a write to project)",
    });
  });
});

describe("the master passcode's actor's row", () => {
  it('no runtime login may change it', async () => {
    const { db, world } = tested;
    const changes = [
      `UPDATE "user" SET "name" = 'Supervisor' WHERE "id" = $1`,
      `UPDATE "user" SET "role" = 'ADMIN' WHERE "id" = $1`,
      `UPDATE "user" SET "archived_at" = now() WHERE "id" = $1`,
      `UPDATE "user" SET "id" = uuidv7() WHERE "id" = $1`,
      `UPDATE "user" SET "email" = 'adms@gates.example' WHERE "id" = $1`,
    ];
    for (const sql of changes) {
      await db.as('adms_api');
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(await db.refused(sql, [masterPasscodeActorId]), `adms_api: ${sql}`).toEqual({
        code: refusedBy.grant,
        message: "The master passcode's actor can't be changed: adms_api may not update it",
      });
      await db.administer();
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(await db.refused(sql, [masterPasscodeActorId]), `superuser: ${sql}`).toEqual({
        code: refusedBy.grant,
        message: "The master passcode's actor can't be changed: postgres may not update it",
      });
    }
    expect(await auditedFor(masterPasscodeActorId)).toHaveLength(1);
  });

  it('nobody but the seed makes a MASTER_PASSCODE user, or takes its id', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    const message =
      "Only the installer's seed makes the master passcode's actor: adms_api may not write role MASTER_PASSCODE or its id";
    const attempts: [string, unknown[]][] = [
      [`INSERT INTO "user" ("name", "role") VALUES ('Master passcode 2', 'MASTER_PASSCODE')`, []],
      [`UPDATE "user" SET "role" = 'MASTER_PASSCODE' WHERE "id" = $1`, [world.monitor]],
    ];
    for (const [sql, values] of attempts) {
      expect(await db.refused(sql, values), sql).toEqual({ code: refusedBy.grant, message });
    }
  });

  it("the owner's migrations pass the trigger, never the check: the role is one id, never a person", async () => {
    const { db, world } = tested;
    await db.as('adms_owner');
    await db.actor(world.admin, 'BACK_OFFICE');
    const attempts: [string, unknown[]][] = [
      [
        `INSERT INTO "user" ("name", "role", "monitor_number") VALUES ('Second passcode', 'MASTER_PASSCODE', NULL)`,
        [],
      ],
      [`UPDATE "user" SET "role" = 'MASTER_PASSCODE' WHERE "id" = $1`, [world.monitor]],
      ...[
        `"role" = 'ADMIN'`,
        `"monitor_number" = 'M004199'`,
        `"contractor_id" = '${world.coastline}'`,
        `"employer_id" = '${world.coastline}'`,
        `"email" = 'adms@gates.example'`,
        `"phone" = '555-0142'`,
        `"archived_at" = now()`,
      ].map((change): [string, unknown[]] => [
        `UPDATE "user" SET ${change} WHERE "id" = $1`,
        [masterPasscodeActorId],
      ]),
    ];
    const refusals = [];
    for (const [sql, values] of attempts) refusals.push(await db.refused(sql, values));
    for (const refusal of refusals) {
      expect(refusal.code, refusal.message).toBe(refusedBy.check);
      expect(refusal.message).toContain('"user_master_passcode_actor_check"');
    }
  });
});

describe('no record names it', () => {
  it('every column that names a user is on the list, but the audit record’s actor', async () => {
    const { db } = tested;
    const columns = await db.rows<{ table_name: string; column_name: string }>(
      `SELECT t.relname AS table_name, a.attname AS column_name
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f' AND c.confrelid = '"user"'::regclass
         AND c.connamespace = 'public'::regnamespace
       ORDER BY t.relname, a.attname`,
    );
    expect(columns.map((column) => `${column.table_name}.${column.column_name}`)).toEqual(
      [
        ...columnsNamingAUser.map(([table, column]) => `${table}.${column}`),
        'audit_record.actor_id',
      ].sort(),
    );
  });

  it('it holds no permission, signs in nowhere, and is nobody’s monitor or author', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    const attempts: [string, string, unknown[]][] = [
      [
        'user_permission_user_id',
        `INSERT INTO "user_permission" ("user_id", "permission") VALUES ($1, 'VOID')`,
        [masterPasscodeActorId],
      ],
      [
        'user_credential_user_id',
        `INSERT INTO "user_credential" ("user_id", "password_hash") VALUES ($1, $2)`,
        [masterPasscodeActorId, aHash],
      ],
      [
        'session_user_id',
        `INSERT INTO "session" ("user_id", "refresh_token_hash", "expires_at")
         VALUES ($1, repeat('a', 64), now() + interval '1 hour')`,
        [masterPasscodeActorId],
      ],
      [
        'security_event_user_id',
        `INSERT INTO "security_event" ("kind", "user_id", "occurred_at")
         VALUES ('MASTER_PASSCODE_USE', $1, now())`,
        [masterPasscodeActorId],
      ],
      [
        'field_event_monitor_id',
        `UPDATE "field_event" SET "monitor_id" = $1 WHERE "id" = $2`,
        [masterPasscodeActorId, world.loads.l101001.disposal],
      ],
      ['assignment_person_id', `UPDATE "assignment" SET "person_id" = $1`, [masterPasscodeActorId]],
    ];
    for (const [named, sql, values] of attempts) {
      const refusal = await db.refused(sql, values);
      expect(refusal.code, named).toBe(refusedBy.check);
      expect(refusal.message).toContain(`"${named}_not_master_passcode_check"`);
    }
  });
});

describe('wrong tries at the master passcode', () => {
  async function underThePasscode(): Promise<void> {
    const { db } = tested;
    await db.as('adms_api');
    await db.actor(masterPasscodeActorId, 'DEVICE', { requestId: 'req-enrol-1' });
  }

  it('AC-10-22 are counted against its version, with the wait they put on it; each is a security event', async () => {
    const { db } = tested;
    await underThePasscode();
    const { id } = await db.one<{ id: string }>(count);
    await db.run(
      `UPDATE "master_passcode_tries" SET "failed_tries" = 5, "locked_until" = '2026-10-12T10:51:00Z'
       WHERE "id" = $1`,
      [id],
    );
    const { id: failed } = await db.one<{ id: string }>(note, ['MASTER_PASSCODE_FAILED', null]);
    const { id: locked } = await db.one<{ id: string }>(note, ['MASTER_PASSCODE_LOCKOUT', null]);
    const written = { actor: masterPasscodeActorId, source: 'DEVICE', device: null };
    expect(await auditedFor(id)).toEqual([
      { ...written, domain: 'SECURITY' },
      { ...written, domain: 'SECURITY' },
    ]);
    expect(await auditedFor(failed)).toEqual([{ ...written, domain: 'SECURITY' }]);
    expect(await auditedFor(locked)).toEqual([{ ...written, domain: 'SECURITY' }]);
    expect(
      await db.rows(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'master_passcode_tries' ORDER BY column_name`,
      ),
    ).toEqual(
      ['created_at', 'failed_tries', 'id', 'locked_until', 'version'].map((column_name) => ({
        column_name,
      })),
    );
  });

  it('one record a version, of a version that exists; its count never below nought', async () => {
    const { db } = tested;
    await underThePasscode();
    await db.one(count);
    expect((await db.refused(count)).code).toBe(refusedBy.unique);
    expect(
      (await db.refused(`INSERT INTO "master_passcode_tries" ("version") VALUES (7)`)).code,
    ).toBe(refusedBy.foreignKey);
    const below = await db.refused(`UPDATE "master_passcode_tries" SET "failed_tries" = -1`);
    expect(below.code).toBe(refusedBy.check);
    expect(below.message).toContain('"master_passcode_tries_failed_tries_check"');
  });

  it('which version it is of never changes, and nothing is deleted', async () => {
    const { db } = tested;
    await underThePasscode();
    const { id } = await db.one<{ id: string }>(count);
    await db.run(`INSERT INTO "master_passcode" ("version", "hash") VALUES (2, $1)`, [aHash]);
    for (const change of [`"version" = 2`, `"id" = uuidv7()`, `"created_at" = now()`]) {
      expect(
        (await db.refused(`UPDATE "master_passcode_tries" SET ${change} WHERE "id" = $1`, [id]))
          .code,
        change,
      ).toBe(refusedBy.trigger);
    }
    await db.administer();
    for (const sql of [`DELETE FROM "master_passcode_tries"`, `TRUNCATE "master_passcode_tries"`]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.trigger);
    }
  });

  it('the API alone reads it: the worker and the read-only login are refused', async () => {
    const { db, world } = tested;
    for (const login of ['adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect(
        (await db.refused(`SELECT "failed_tries" FROM "master_passcode_tries"`)).code,
        login,
      ).toBe(refusedBy.grant);
    }
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await db.refused(count)).code).toBe(refusedBy.grant);
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    expect((await db.refused(`DELETE FROM "master_passcode_tries"`)).code).toBe(refusedBy.grant);
  });
});
