// Sign-in's records (task 2.2.1; ADR-397…399): what sign-in keeps of a person, a session and a
// security event, by scenario ID of spec/acceptance/10-api-and-sync.md (AC-10-10, 11, and the
// database's half of AC-10-19). ARCHITECTURE §5.1…§5.3, §6; spec/THREAT-MODEL.md T-14, T-26,
// T-43; BACKLOG C21; REQ-202, 202b.
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { systemActorId } from '../src/system-actor.ts';
import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

// Shaped like an Argon2id hash (a PHC string); nothing hashes to it.
const aHash = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';
const anotherHash = `${aHash}Zm9v`;
// Made up, like the hash: no authenticator holds it.
const aSecret = 'test-authenticator-secret-dana';
const keptOut = '[kept out of the audit]';

// A refresh token as a browser would hold it, and what the server keeps of it.
const aToken = 'test-refresh-token-dana-monday';
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const request = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d01';

async function asTheApi(more: { requestId?: string } = {}): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE', more);
}

const columnsOf = async (table: string): Promise<string[]> =>
  (
    await tested.db.rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`,
      [table],
    )
  ).map((column) => column.column_name);

const keep = `INSERT INTO "user_credential" ("user_id", "password_hash") VALUES ($1, $2)
  RETURNING "id"::text`;
const open = `INSERT INTO "session" ("user_id", "refresh_token_hash", "expires_at")
  VALUES ($1, $2, $3) RETURNING "id"::text`;
const note = `INSERT INTO "security_event" ("kind", "user_id", "request_id", "occurred_at")
  VALUES ($1, $2, $3, $4) RETURNING "id"::text`;

const audited = (table: string, id: string, secret: string): Promise<unknown[]> =>
  tested.db.rows(
    `SELECT "operation"::text, "domain"::text, "changed_fields",
       "prior_value" ->> '${secret}' AS prior, "new_value" ->> '${secret}' AS new
     FROM "audit_record" WHERE "table_name" = $1 AND "record_id" = $2 ORDER BY "id"`,
    [table, id],
  );

describe('what sign-in keeps of a person', () => {
  it('is one record a person, apart from the person: a password hash, an authenticator secret, locked until', async () => {
    const { db, world } = tested;
    expect(await columnsOf('user_credential')).toEqual([
      'created_at',
      'id',
      'locked_until',
      'password_hash',
      'two_step_secret',
      'user_id',
    ]);
    // Nothing of sign-in is on the person's own record, which the worker reads.
    expect(
      (await columnsOf('user')).filter((column) => /password|secret|locked/.test(column)),
    ).toEqual([]);
    await asTheApi();
    await db.one(keep, [world.admin, aHash]);
    expect((await db.refused(keep, [world.admin, anotherHash])).code).toBe(refusedBy.unique);
  });

  it('AC-10-11 the audit log says a password hash or an authenticator secret changed, never what from or to', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(keep, [world.admin, aHash]);
    await db.run(`UPDATE "user_credential" SET "password_hash" = $2 WHERE "id" = $1`, [
      id,
      anotherHash,
    ]);
    await db.run(`UPDATE "user_credential" SET "two_step_secret" = $2 WHERE "id" = $1`, [
      id,
      aSecret,
    ]);
    await db.run(`UPDATE "user_credential" SET "two_step_secret" = NULL WHERE "id" = $1`, [id]);
    // The worker reads the audit log; this is all it sees of either.
    await db.as('adms_worker');
    expect(await audited('user_credential', id, 'password_hash')).toEqual([
      {
        operation: 'INSERT',
        domain: 'SECURITY',
        changed_fields: [
          'created_at',
          'id',
          'locked_until',
          'password_hash',
          'two_step_secret',
          'user_id',
        ],
        prior: null,
        new: keptOut,
      },
      {
        operation: 'UPDATE',
        domain: 'SECURITY',
        changed_fields: ['password_hash'],
        prior: keptOut,
        new: keptOut,
      },
      {
        operation: 'UPDATE',
        domain: 'SECURITY',
        changed_fields: ['two_step_secret'],
        prior: keptOut,
        new: keptOut,
      },
      {
        operation: 'UPDATE',
        domain: 'SECURITY',
        changed_fields: ['two_step_secret'],
        prior: keptOut,
        new: keptOut,
      },
    ]);
    expect(
      (await audited('user_credential', id, 'two_step_secret')).map((record) => [
        (record as { prior: unknown }).prior,
        (record as { new: unknown }).new,
      ]),
    ).toEqual([
      [null, keptOut],
      [keptOut, keptOut],
      [keptOut, keptOut],
      [keptOut, keptOut],
    ]);
    // Nothing in the whole audit log is either value.
    await db.administer();
    expect(
      await db.rows(
        `SELECT "id" FROM "audit_record"
         WHERE "prior_value"::text LIKE ANY ($1) OR "new_value"::text LIKE ANY ($1)`,
        [[`%${aHash}%`, `%${aSecret}%`]],
      ),
    ).toEqual([]);
  });

  it('AC-10-11 is read by nobody but the API: not the worker, not the read-only login, through no view', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.one(keep, [world.admin, aHash]);
    for (const login of ['adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      await db.viewer(world.clientViewer);
      for (const table of ['user_credential', 'session', 'security_event']) {
        expect((await db.refused(`SELECT "id" FROM "${table}"`)).code, `${login} ${table}`).toBe(
          refusedBy.grant,
        );
      }
    }
    await db.administer();
    expect(
      await db.rows(
        `SELECT table_name FROM information_schema.view_column_usage
         WHERE table_schema = 'public'
           AND table_name IN ('user_credential', 'session', 'security_event')`,
      ),
    ).toEqual([]);
  });

  it.each([
    ['the password itself', 'marsh heron delphine ferry'],
    ['another kind of hash', '$2b$12$abcdefghijklmnopqrstuv'],
    ['a blank', ''],
  ])('a password is only ever an Argon2id hash: %s is refused', async (_, value) => {
    const { db, world } = tested;
    await asTheApi();
    const refusal = await db.refused(keep, [world.admin, value]);
    expect(refusal.code).toBe(refusedBy.check);
    expect(refusal.message).toContain('"user_credential_password_hash_check"');
  });

  it('an authenticator secret is never blank; a person may have none, and no password yet', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(keep, [world.admin, null]);
    const refusal = await db.refused(
      `UPDATE "user_credential" SET "two_step_secret" = '  ' WHERE "id" = $1`,
      [id],
    );
    expect(refusal.code).toBe(refusedBy.check);
    expect(refusal.message).toContain('"user_credential_two_step_secret_check"');
    expect(
      await db.run(`UPDATE "user_credential" SET "locked_until" = $2 WHERE "id" = $1`, [
        id,
        '2026-10-12T14:30:00Z',
      ]),
    ).toBe(1);
  });

  it('the system actor never has one, a session or a password (C21)', async () => {
    const { db } = tested;
    await asTheApi();
    const credential = await db.refused(keep, [systemActorId, aHash]);
    expect(credential.code).toBe(refusedBy.check);
    expect(credential.message).toContain('"user_credential_system_actor_check"');
    const session = await db.refused(open, [systemActorId, sha256(aToken), '2026-10-19T12:00:00Z']);
    expect(session.code).toBe(refusedBy.check);
    expect(session.message).toContain('"session_system_actor_check"');
  });

  it('whose it is never changes, and it is never deleted', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(keep, [world.admin, aHash]);
    expect(
      (
        await db.refused(`UPDATE "user_credential" SET "user_id" = $2 WHERE "id" = $1`, [
          id,
          world.monitor,
        ])
      ).code,
    ).toBe(refusedBy.trigger);
    for (const sql of [
      `DELETE FROM "user_credential" WHERE "id" = '${id}'`,
      `TRUNCATE "user_credential" CASCADE`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
    await db.as('adms_owner');
    expect((await db.refused(`DELETE FROM "user_credential" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.trigger,
    );
  });
});

describe('a session', () => {
  it('AC-10-10 holds its refresh token only as a SHA-256: the token itself, or anything else, is refused', async () => {
    const { db, world } = tested;
    expect(await columnsOf('session')).toEqual([
      'created_at',
      'expires_at',
      'id',
      'refresh_token_hash',
      'revoked_at',
      'user_id',
    ]);
    await asTheApi();
    for (const value of [
      aToken,
      '',
      aHash,
      sha256(aToken).toUpperCase(),
      sha256(aToken).slice(1),
    ]) {
      const refusal = await db.refused(open, [world.admin, value, '2026-10-19T12:00:00Z']);
      expect(refusal.code, value).toBe(refusedBy.check);
      expect(refusal.message).toContain('"session_refresh_token_hash_check"');
    }
    const { id } = await db.one<{ id: string }>(open, [
      world.admin,
      sha256(aToken),
      '2026-10-19T12:00:00Z',
    ]);
    // Nothing the database holds is the token: not the session, not the audit log.
    await db.administer();
    expect(
      await db.rows(`SELECT "id" FROM "session" WHERE "session"::text LIKE $1`, [`%${aToken}%`]),
    ).toEqual([]);
    expect(
      await db.rows(
        `SELECT "id" FROM "audit_record"
         WHERE "prior_value"::text LIKE ANY ($1) OR "new_value"::text LIKE ANY ($1)`,
        [[`%${aToken}%`, `%${sha256(aToken)}%`]],
      ),
    ).toEqual([]);
    // One token, one session.
    await asTheApi();
    expect(
      (await db.refused(open, [world.admin, sha256(aToken), '2026-10-19T12:00:00Z'])).code,
    ).toBe(refusedBy.unique);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('AC-10-10 a rotated token is a new hash on the same session, and the audit log says only that it changed', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(open, [
      world.admin,
      sha256(aToken),
      '2026-10-19T12:00:00Z',
    ]);
    expect(
      await db.run(`UPDATE "session" SET "refresh_token_hash" = $2 WHERE "id" = $1`, [
        id,
        sha256(`${aToken}-rotated`),
      ]),
    ).toBe(1);
    await db.as('adms_worker');
    expect(await audited('session', id, 'refresh_token_hash')).toEqual([
      {
        operation: 'INSERT',
        domain: 'SECURITY',
        changed_fields: [
          'created_at',
          'expires_at',
          'id',
          'refresh_token_hash',
          'revoked_at',
          'user_id',
        ],
        prior: null,
        new: keptOut,
      },
      {
        operation: 'UPDATE',
        domain: 'SECURITY',
        changed_fields: ['refresh_token_hash'],
        prior: keptOut,
        new: keptOut,
      },
    ]);
  });

  it('is revocable, and once revoked is history: no rotation, no second life', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(open, [
      world.admin,
      sha256(aToken),
      '2026-10-19T12:00:00Z',
    ]);
    expect(await db.run(`UPDATE "session" SET "revoked_at" = now() WHERE "id" = $1`, [id])).toBe(1);
    for (const sql of [
      `UPDATE "session" SET "revoked_at" = NULL WHERE "id" = '${id}'`,
      `UPDATE "session" SET "refresh_token_hash" = '${sha256('another')}' WHERE "id" = '${id}'`,
      `UPDATE "session" SET "expires_at" = '2027-01-01T00:00:00Z' WHERE "id" = '${id}'`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.trigger);
    }
  });

  it('whose it is and when it began never change; it ends after it began; it is never deleted', async () => {
    const { db, world } = tested;
    await asTheApi();
    for (const [expires, revoked] of [
      ['2020-01-01T00:00:00Z', null],
      ['2026-10-19T12:00:00Z', '2020-01-01T00:00:00Z'],
    ]) {
      const refusal = await db.refused(
        `INSERT INTO "session" ("user_id", "refresh_token_hash", "expires_at", "revoked_at")
         VALUES ($1, $2, $3, $4)`,
        [world.admin, sha256(aToken), expires, revoked],
      );
      expect(refusal.code).toBe(refusedBy.check);
      expect(refusal.message).toContain('"session_times_check"');
    }
    const { id } = await db.one<{ id: string }>(open, [
      world.admin,
      sha256(aToken),
      '2026-10-19T12:00:00Z',
    ]);
    for (const sql of [
      `UPDATE "session" SET "user_id" = '${world.monitor}' WHERE "id" = '${id}'`,
      `UPDATE "session" SET "created_at" = '2026-01-01T00:00:00Z' WHERE "id" = '${id}'`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.trigger);
    }
    for (const sql of [
      `DELETE FROM "session" WHERE "id" = '${id}'`,
      `TRUNCATE "session" CASCADE`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
    expect((await db.refused(open, [world.admin, sha256('x'), null])).code).toBe(refusedBy.notNull);
  });
});

describe('a security event', () => {
  it('AC-10-19 is kept as its own record and copied into the audit log, in the security domain, with who wrote it and in which request', async () => {
    const { db, world } = tested;
    expect(await columnsOf('security_event')).toEqual([
      'created_at',
      'device_id',
      'id',
      'kind',
      'occurred_at',
      'request_id',
      'user_id',
    ]);
    await asTheApi({ requestId: request });
    const ids: string[] = [];
    for (const kind of ['SIGN_IN', 'SIGN_IN_FAILED', 'LOCKOUT']) {
      const { id } = await db.one<{ id: string }>(note, [
        kind,
        world.admin,
        request,
        '2026-10-12T12:05:00Z',
      ]);
      ids.push(id);
    }
    // A try that named nobody the firm has: an event about no person.
    await db.one(note, ['SIGN_IN_FAILED', null, request, '2026-10-12T12:06:00Z']);
    await db.as('adms_worker');
    const records = await db.rows(
      `SELECT "domain"::text, "operation"::text, "actor_id"::text AS actor, "request_id",
         "new_value" ->> 'kind' AS kind, "new_value" ->> 'user_id' AS about
       FROM "audit_record" WHERE "table_name" = 'security_event' AND "record_id" = ANY ($1)
       ORDER BY "id"`,
      [ids],
    );
    expect(records).toEqual(
      ['SIGN_IN', 'SIGN_IN_FAILED', 'LOCKOUT'].map((kind) => ({
        domain: 'SECURITY',
        operation: 'INSERT',
        actor: world.admin,
        request_id: request,
        kind,
        about: world.admin,
      })),
    );
    // A billing reviewer reading the audit log by domain reads none of them.
    expect(
      await db.rows(
        `SELECT "id" FROM "audit_record"
         WHERE "table_name" IN ('security_event', 'session', 'user_credential')
           AND "domain" <> 'SECURITY'`,
      ),
    ).toEqual([]);
  });

  it('says one of the kinds the release knows, about a person and a phone the firm has', async () => {
    const { db, world } = tested;
    await asTheApi();
    const kinds = await db.rows<{ kind: string }>(
      `SELECT unnest(enum_range(NULL::security_event_kind))::text AS kind`,
    );
    expect(kinds.map((row) => row.kind)).toEqual([
      'SIGN_IN',
      'SIGN_IN_FAILED',
      'LOCKOUT',
      'DEVICE_SETUP',
      'DEVICE_SWITCH',
      'MASTER_PASSCODE_USE',
    ]);
    const at = '2026-10-12T12:05:00Z';
    expect((await db.refused(note, ['PASSWORD_GUESSED', world.admin, null, at])).code).toBe(
      refusedBy.badValue,
    );
    expect(
      (await db.refused(note, ['SIGN_IN', '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d99', null, at])).code,
    ).toBe(refusedBy.foreignKey);
    expect((await db.refused(note, ['SIGN_IN', world.admin, null, null])).code).toBe(
      refusedBy.notNull,
    );
    const blank = await db.refused(note, ['SIGN_IN', world.admin, ' ', at]);
    expect(blank.code).toBe(refusedBy.check);
    expect(blank.message).toContain('"security_event_request_id_check"');
    // A use of the master passcode on a phone names the phone.
    expect(
      await db.run(
        `INSERT INTO "security_event" ("kind", "device_id", "occurred_at") VALUES ($1, $2, $3)`,
        ['MASTER_PASSCODE_USE', world.device, at],
      ),
    ).toBe(1);
  });

  it('is written once: never edited, never deleted, by the API or by the owner', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(note, [
      'SIGN_IN_FAILED',
      world.admin,
      request,
      '2026-10-12T12:05:00Z',
    ]);
    for (const sql of [
      `UPDATE "security_event" SET "kind" = 'SIGN_IN' WHERE "id" = '${id}'`,
      `DELETE FROM "security_event" WHERE "id" = '${id}'`,
      `TRUNCATE "security_event" CASCADE`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
    await db.as('adms_owner');
    for (const sql of [
      `UPDATE "security_event" SET "kind" = 'SIGN_IN' WHERE "id" = '${id}'`,
      `DELETE FROM "security_event" WHERE "id" = '${id}'`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.trigger);
    }
  });

  it('needs its actor like any write: one written with nobody stated is refused', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.noActor();
    expect(
      (await db.refused(note, ['SIGN_IN_FAILED', world.admin, request, '2026-10-12T12:05:00Z']))
        .code,
    ).toBe(refusedBy.grant);
  });
});
