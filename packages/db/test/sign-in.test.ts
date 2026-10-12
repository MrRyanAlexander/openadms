// Sign-in's records (task 2.2.1; ADR-397…399): what sign-in keeps of a person, a session and a
// security event, by scenario ID of spec/acceptance/10-api-and-sync.md (AC-10-10, 11, and the
// database's half of AC-10-19). ARCHITECTURE §5.1…§5.3, §6; spec/THREAT-MODEL.md T-14, T-26,
// T-43; BACKLOG C21; REQ-202, 202b.
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { deviceKeyActorId } from '../src/device-key-actor.ts';
import { masterPasscodeActorId } from '../src/master-passcode-actor.ts';
import { systemActorId } from '../src/system-actor.ts';
import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

// Shaped like an Argon2id hash (a PHC string); nothing hashes to it.
const aHash = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';
const anotherHash = `${aHash}Zm9v`;
// Made up, like the hash: no authenticator holds it.
// A monitor's offline seed as the API seals one (ADR-454). Made up; it opens to nothing.
const aSeed = 'v1.dGVzdC1ub25jZS0y.dGVzdC1zZWFsZWQtc2VlZC1sZWU.dGVzdC10YWctbGVlLTEyMzQ1Ng';
const anotherSeed = `${aSeed}Zm9v`;
// As the API seals one (ADR-412): a version and three parts. Made up; it opens to nothing.
const aSecret = 'v1.dGVzdC1ub25jZS0x.dGVzdC1zZWFsZWQtc2VjcmV0LWRhbmE.dGVzdC10YWctZGFuYS0xMjM0';
const keptOut = '[kept out of the audit]';

// A refresh token as a browser would hold it, and what the server keeps of it.
const aToken = 'test-refresh-token-dana-monday';
// When a session ends: a week after the test runs. The database holds an end after the session
// began, and a session begins on its own clock, so a fixed date passes and fails a test with it
// (seen 2026-10-12 at 22:00 UTC).
const aWeekOn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
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
      'failed_sign_ins',
      'id',
      'locked_until',
      'offline_seed',
      'password_change_required',
      'password_hash',
      'two_step_last_step',
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

  it('AC-10-18 counts wrong tries from nought, never below it, and starts with no password to change (ADR-409, 410)', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(keep, [world.admin, aHash]);
    expect(
      await db.one(
        `SELECT "failed_sign_ins", "password_change_required", "locked_until"
         FROM "user_credential" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({ failed_sign_ins: 0, password_change_required: false, locked_until: null });
    await db.run(`UPDATE "user_credential" SET "failed_sign_ins" = 10 WHERE "id" = $1`, [id]);
    expect(
      (
        await db.refused(`UPDATE "user_credential" SET "failed_sign_ins" = -1 WHERE "id" = $1`, [
          id,
        ])
      ).code,
    ).toBe(refusedBy.check);
    // The worker and the read-only login read none of it.
    for (const login of ['adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect((await db.refused(`SELECT "failed_sign_ins" FROM "user_credential"`)).code).toBe(
        refusedBy.grant,
      );
    }
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
          'failed_sign_ins',
          'id',
          'locked_until',
          'offline_seed',
          'password_change_required',
          'password_hash',
          'two_step_last_step',
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

  it('AC-02-41, AC-10-11 a monitor’s offline seed is only ever what the API sealed, kept only beside a password, and never outlives the password it was made from: a password set anew takes a new seed or none; the audit log says that it changed, never what from or to (ADR-454)', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(
      `INSERT INTO "user_credential" ("user_id", "password_hash", "offline_seed")
       VALUES ($1, $2, $3) RETURNING "id"::text`,
      [world.monitor, aHash, aSeed],
    );
    const set = `UPDATE "user_credential" SET "password_hash" = $2, "offline_seed" = $3 WHERE "id" = $1`;
    // The password set anew, the seed left as it was: refused, whichever way it is written.
    for (const statement of [
      `UPDATE "user_credential" SET "password_hash" = $2 WHERE "id" = $1`,
      `UPDATE "user_credential" SET "password_hash" = $2, "offline_seed" = "offline_seed" WHERE "id" = $1`,
    ]) {
      const refusal = await db.refused(statement, [id, anotherHash]);
      expect(refusal.code).toBe(refusedBy.trigger);
      expect(refusal.message).toContain('An offline seed never outlives its password');
    }
    // Anything else of the record changes beside the seed, and a seed is made again for the
    // same password (a sign-in under settings since raised).
    await db.run(`UPDATE "user_credential" SET "failed_sign_ins" = 3 WHERE "id" = $1`, [id]);
    await db.run(`UPDATE "user_credential" SET "offline_seed" = $2 WHERE "id" = $1`, [
      id,
      anotherSeed,
    ]);
    // Only as the API sealed it; and none without a password.
    for (const [value, check] of [
      ['5550142', 'user_credential_offline_seed_sealed_check'],
      [aHash, 'user_credential_offline_seed_sealed_check'],
      ['', 'user_credential_offline_seed_sealed_check'],
      ['v2.a.b.c', 'user_credential_offline_seed_sealed_check'],
    ] as const) {
      const refusal = await db.refused(set, [id, anotherHash, value]);
      expect(refusal.code, value).toBe(refusedBy.check);
      expect(refusal.message).toContain(`"${check}"`);
    }
    const alone = await db.refused(set, [id, null, aSeed]);
    expect(alone.code).toBe(refusedBy.check);
    expect(alone.message).toContain('"user_credential_offline_seed_together_check"');
    // A new password with a new seed, and one with none.
    await db.run(set, [id, anotherHash, aSeed]);
    await db.run(set, [id, aHash, null]);
    await db.run(`UPDATE "user_credential" SET "password_hash" = $2 WHERE "id" = $1`, [
      id,
      anotherHash,
    ]);
    await db.as('adms_worker');
    expect(
      (await audited('user_credential', id, 'offline_seed')).map((record) => {
        const {
          changed_fields: changed,
          prior,
          new: now,
        } = record as {
          changed_fields: string[];
          prior: unknown;
          new: unknown;
        };
        return [changed.filter((field) => field === 'offline_seed'), prior, now];
      }),
    ).toEqual([
      [['offline_seed'], null, keptOut],
      [[], keptOut, keptOut],
      [['offline_seed'], keptOut, keptOut],
      [['offline_seed'], keptOut, keptOut],
      [['offline_seed'], keptOut, keptOut],
      [[], keptOut, keptOut],
    ]);
    await db.administer();
    expect(
      await db.rows(
        `SELECT "id" FROM "audit_record"
         WHERE "prior_value"::text LIKE ANY ($1) OR "new_value"::text LIKE ANY ($1)`,
        [[`%${aSeed}%`, `%${anotherSeed}%`]],
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

  it('a code is good once: the step of the last code taken is kept with the secret, never below nought, and goes when the secret goes (ADR-412)', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(keep, [world.admin, aHash]);
    const step = `UPDATE "user_credential" SET "two_step_last_step" = $2 WHERE "id" = $1`;
    // With no authenticator set up there is no last code.
    const alone = await db.refused(step, [id, 58677600]);
    expect(alone.code).toBe(refusedBy.check);
    expect(alone.message).toContain('"user_credential_two_step_together_check"');
    await db.run(`UPDATE "user_credential" SET "two_step_secret" = $2 WHERE "id" = $1`, [
      id,
      aSecret,
    ]);
    expect(await db.run(step, [id, 58677600])).toBe(1);
    const below = await db.refused(step, [id, -1]);
    expect(below.code).toBe(refusedBy.check);
    expect(below.message).toContain('"user_credential_two_step_last_step_check"');
    // Clearing the secret alone would leave a last code with nothing it belongs to.
    expect(
      (
        await db.refused(`UPDATE "user_credential" SET "two_step_secret" = NULL WHERE "id" = $1`, [
          id,
        ])
      ).code,
    ).toBe(refusedBy.check);
    expect(
      await db.run(
        `UPDATE "user_credential" SET "two_step_secret" = NULL, "two_step_last_step" = NULL
         WHERE "id" = $1`,
        [id],
      ),
    ).toBe(1);
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
    // Two checks refuse a blank; the database asks them by name, and "sealed" comes first.
    expect(refusal.message).toContain('"user_credential_two_step_sealed_check"');
    // Nor the secret an authenticator app is given: only what the API sealed (ADR-412).
    for (const plain of ['JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', 'v1.only-two.parts', 'v2.a.b.c']) {
      const unsealed = await db.refused(
        `UPDATE "user_credential" SET "two_step_secret" = $2 WHERE "id" = $1`,
        [id, plain],
      );
      expect(unsealed.code, plain).toBe(refusedBy.check);
      expect(unsealed.message).toContain('"user_credential_two_step_sealed_check"');
    }
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
    const session = await db.refused(open, [systemActorId, sha256(aToken), aWeekOn]);
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
      'device_id',
      'expires_at',
      'id',
      'master_passcode_session',
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
      const refusal = await db.refused(open, [world.admin, value, aWeekOn]);
      expect(refusal.code, value).toBe(refusedBy.check);
      expect(refusal.message).toContain('"session_refresh_token_hash_check"');
    }
    const { id } = await db.one<{ id: string }>(open, [world.admin, sha256(aToken), aWeekOn]);
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
    expect((await db.refused(open, [world.admin, sha256(aToken), aWeekOn])).code).toBe(
      refusedBy.unique,
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('AC-10-10 a rotated token is a new hash on the same session, and the audit log says only that it changed', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(open, [world.admin, sha256(aToken), aWeekOn]);
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
          'device_id',
          'expires_at',
          'id',
          'master_passcode_session',
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
    const { id } = await db.one<{ id: string }>(open, [world.admin, sha256(aToken), aWeekOn]);
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
      [aWeekOn, '2020-01-01T00:00:00Z'],
    ]) {
      const refusal = await db.refused(
        `INSERT INTO "session" ("user_id", "refresh_token_hash", "expires_at", "revoked_at")
         VALUES ($1, $2, $3, $4)`,
        [world.admin, sha256(aToken), expires, revoked],
      );
      expect(refusal.code).toBe(refusedBy.check);
      expect(refusal.message).toContain('"session_times_check"');
    }
    const { id } = await db.one<{ id: string }>(open, [world.admin, sha256(aToken), aWeekOn]);
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

describe('a monitor’s session on a phone (ADR-443)', () => {
  const onPhone = `INSERT INTO "session" ("user_id", "refresh_token_hash", "expires_at", "device_id")
    VALUES ($1, $2, $3, $4) RETURNING "id"::text`;
  const ends = aWeekOn;

  // Ana signing in on her phone, as the API writes it: as Ana, from that phone.
  async function asAnaOnHerPhone(deviceId?: string): Promise<void> {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.monitor, 'DEVICE', { deviceId: deviceId ?? world.device });
  }

  it('AC-02-39 a monitor’s session names the phone they signed in on, and no other session names one: a monitor’s ID and password open nothing but a phone', async () => {
    const { db, world } = tested;
    await asAnaOnHerPhone();
    const { id } = await db.one<{ id: string }>(onPhone, [
      world.monitor,
      sha256(aToken),
      ends,
      world.device,
    ]);
    expect(
      await db.one(`SELECT "device_id"::text AS device FROM "session" WHERE "id" = $1`, [id]),
    ).toEqual({ device: world.device });
    // Ana's session with no phone, as the back office's sign-in would open one.
    await asTheApi();
    const noPhone = await db.refused(open, [world.monitor, sha256('ana-web'), ends]);
    expect([noPhone.code, noPhone.message]).toEqual([
      refusedBy.trigger,
      'A monitor signs in on a phone only: their session names the phone',
    ]);
    // Dana's session on a phone, even stated as hers from that phone.
    await db.actor(world.admin, 'DEVICE', { deviceId: world.device });
    const admin = await db.refused(onPhone, [
      world.admin,
      sha256('dana-phone'),
      ends,
      world.device,
    ]);
    expect([admin.code, admin.message]).toEqual([
      refusedBy.trigger,
      'Only a monitor in service signs in on a phone',
    ]);
  });

  it('is opened by the monitor’s own sign-in, from that phone: stated as anybody else, from the back office or from another phone, it is refused', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    for (const [actorId, source, deviceId] of [
      [world.admin, 'DEVICE', world.device],
      [world.monitor, 'BACK_OFFICE', ''],
      [world.monitor, 'BACK_OFFICE', world.device],
      [world.monitor, 'DEVICE', ''],
      [world.monitor, 'DEVICE', '00000000-0000-7000-8000-00000000abcd'],
    ] as const) {
      await db.actor(actorId, source, { deviceId });
      const refusal = await db.refused(onPhone, [
        world.monitor,
        sha256(`${actorId}${source}${deviceId}`),
        ends,
        world.device,
      ]);
      expect([refusal.code, refusal.message], `${actorId} ${source} ${deviceId}`).toEqual([
        refusedBy.grant,
        "A monitor's session is opened by their own sign-in, on that phone",
      ]);
    }
  });

  it('ADR-134, 441 (6) a phone out of service, or one whose key is revoked, signs nobody in; nor is an archived monitor signed in', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(`UPDATE "user" SET "archived_at" = '2026-10-12T09:00:00Z' WHERE "id" = $1`, [
      world.monitor,
    ]);
    await asAnaOnHerPhone();
    const archived = await db.refused(onPhone, [world.monitor, sha256('a'), ends, world.device]);
    expect([archived.code, archived.message]).toEqual([
      refusedBy.trigger,
      'Only a monitor in service signs in on a phone',
    ]);
    await asTheApi();
    await db.run(`UPDATE "user" SET "archived_at" = NULL WHERE "id" = $1`, [world.monitor]);
    await db.run(
      `UPDATE "device" SET "status" = 'LOST', "out_of_service_at" = '2026-10-12T09:30:00Z'
       WHERE "id" = $1`,
      [world.device],
    );
    await asAnaOnHerPhone();
    const lost = await db.refused(onPhone, [world.monitor, sha256('b'), ends, world.device]);
    expect([lost.code, lost.message]).toEqual([
      refusedBy.trigger,
      'A phone out of service signs nobody in',
    ]);
    await asTheApi();
    await db.run(`UPDATE "device" SET "key_revoked_at" = '2026-10-12T10:00:00Z' WHERE "id" = $1`, [
      world.device,
    ]);
    await asAnaOnHerPhone();
    const revoked = await db.refused(onPhone, [world.monitor, sha256('c'), ends, world.device]);
    expect([revoked.code, revoked.message]).toEqual([
      refusedBy.trigger,
      'A phone out of service signs nobody in',
    ]);
  });

  it('the phone it names never changes, nor is one given to a session that had none; it ends when revoked', async () => {
    const { db, world } = tested;
    await asAnaOnHerPhone();
    const { id } = await db.one<{ id: string }>(onPhone, [
      world.monitor,
      sha256(aToken),
      ends,
      world.device,
    ]);
    await asTheApi();
    const web = await db.one<{ id: string }>(open, [world.admin, sha256('dana'), ends]);
    for (const [session, to] of [
      [id, null],
      [id, '00000000-0000-7000-8000-00000000abcd'],
      [web.id, world.device],
    ] as const) {
      const refusal = await db.refused(`UPDATE "session" SET "device_id" = $2 WHERE "id" = $1`, [
        session,
        to,
      ]);
      expect(refusal.code, `${session} ${String(to)}`).toBe(refusedBy.trigger);
    }
    await asAnaOnHerPhone();
    expect(await db.run(`UPDATE "session" SET "revoked_at" = now() WHERE "id" = $1`, [id])).toBe(1);
  });
});

describe('a session opened under the master passcode (ADR-462)', () => {
  const marked = `INSERT INTO "session" ("user_id", "refresh_token_hash", "expires_at", "device_id",
      "master_passcode_session") VALUES ($1, $2, $3, $4, $5) RETURNING "id"::text`;
  const ends = aWeekOn;
  const byThePasscode =
    "A session under the master passcode is opened as the master passcode's actor, on that phone";
  const byTheMonitor = "A monitor's session is opened by their own sign-in, on that phone";

  // As the API writes an act under the master passcode: its own actor, for that phone.
  async function underThePasscode(deviceId?: string): Promise<void> {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: deviceId ?? world.device });
  }

  it('AC-02-42 says which way it was opened, one of the two the release knows, and the audit log shows the master passcode opened it: never the monitor', async () => {
    const { db, world } = tested;
    expect(
      await db.rows(`SELECT unnest(enum_range(NULL::master_passcode_session))::text AS kind`),
    ).toEqual([{ kind: 'AS_MONITOR' }, { kind: 'TEMPORARY' }]);
    await underThePasscode();
    const ids: string[] = [];
    for (const kind of ['AS_MONITOR', 'TEMPORARY']) {
      const { id } = await db.one<{ id: string }>(marked, [
        world.monitor,
        sha256(kind),
        ends,
        world.device,
        kind,
      ]);
      ids.push(id);
      expect(
        await db.one(
          `SELECT "master_passcode_session"::text AS kind, "user_id"::text AS monitor,
             "device_id"::text AS device FROM "session" WHERE "id" = $1`,
          [id],
        ),
      ).toEqual({ kind, monitor: world.monitor, device: world.device });
    }
    expect(
      (await db.refused(marked, [world.monitor, sha256('x'), ends, world.device, 'SUPERVISOR']))
        .code,
    ).toBe(refusedBy.badValue);
    await db.as('adms_worker');
    expect(
      await db.rows(
        `SELECT "operation"::text, "domain"::text, "actor_id"::text AS actor, "source"::text,
           "device_id"::text AS device, "new_value" ->> 'master_passcode_session' AS kind
         FROM "audit_record" WHERE "table_name" = 'session' AND "record_id" = ANY ($1)
         ORDER BY "id"`,
        [ids],
      ),
    ).toEqual(
      ['AS_MONITOR', 'TEMPORARY'].map((kind) => ({
        operation: 'INSERT',
        domain: 'SECURITY',
        actor: masterPasscodeActorId,
        source: 'DEVICE',
        device: world.device,
        kind,
      })),
    );
  });

  it('is written as the master passcode’s actor for that phone and by nobody else: not the monitor, not an admin, not the passcode from the back office, with no phone or for another', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    for (const [actorId, source, deviceId] of [
      [world.monitor, 'DEVICE', world.device],
      [world.admin, 'DEVICE', world.device],
      [world.admin, 'BACK_OFFICE', ''],
      [masterPasscodeActorId, 'BACK_OFFICE', world.device],
      [masterPasscodeActorId, 'DEVICE', ''],
      [masterPasscodeActorId, 'DEVICE', '00000000-0000-7000-8000-00000000abcd'],
    ] as const) {
      await db.actor(actorId, source, { deviceId });
      const refusal = await db.refused(marked, [
        world.monitor,
        sha256(`${actorId}${source}${deviceId}`),
        ends,
        world.device,
        'TEMPORARY',
      ]);
      expect([refusal.code, refusal.message], `${actorId} ${source} ${deviceId}`).toEqual([
        refusedBy.grant,
        byThePasscode,
      ]);
    }
  });

  it('ADR-456 (3)(d) nobody passes one off as the monitor’s own sign-in: the master passcode’s actor opens no unmarked session, and a monitor’s own sign-in opens no marked one', async () => {
    const { db, world } = tested;
    const onPhone = `INSERT INTO "session" ("user_id", "refresh_token_hash", "expires_at", "device_id")
      VALUES ($1, $2, $3, $4) RETURNING "id"::text`;
    await underThePasscode();
    const unmarked = await db.refused(onPhone, [world.monitor, sha256('a'), ends, world.device]);
    expect([unmarked.code, unmarked.message]).toEqual([refusedBy.grant, byTheMonitor]);
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    const own = await db.refused(marked, [
      world.monitor,
      sha256('b'),
      ends,
      world.device,
      'AS_MONITOR',
    ]);
    expect([own.code, own.message]).toEqual([refusedBy.grant, byThePasscode]);
  });

  it('is a session on a phone, for a monitor in service, on a phone in service: with no phone, for an admin, an archived monitor or a phone out of service it is refused', async () => {
    const { db, world } = tested;
    // With no phone: a back-office person's by the check, a monitor's by the phone's own rule.
    await asTheApi();
    const web = await db.refused(marked, [world.admin, sha256('a'), ends, null, 'TEMPORARY']);
    expect(web.code).toBe(refusedBy.check);
    expect(web.message).toContain('"session_master_passcode_session_check"');
    const monitor = await db.refused(marked, [world.monitor, sha256('b'), ends, null, 'TEMPORARY']);
    expect([monitor.code, monitor.message]).toEqual([
      refusedBy.trigger,
      'A monitor signs in on a phone only: their session names the phone',
    ]);
    await underThePasscode();
    const admin = await db.refused(marked, [
      world.admin,
      sha256('c'),
      ends,
      world.device,
      'TEMPORARY',
    ]);
    expect([admin.code, admin.message]).toEqual([
      refusedBy.trigger,
      'Only a monitor in service signs in on a phone',
    ]);
    await asTheApi();
    await db.run(`UPDATE "user" SET "archived_at" = '2026-10-12T09:00:00Z' WHERE "id" = $1`, [
      world.monitor,
    ]);
    await underThePasscode();
    const archived = await db.refused(marked, [
      world.monitor,
      sha256('d'),
      ends,
      world.device,
      'TEMPORARY',
    ]);
    expect([archived.code, archived.message]).toEqual([
      refusedBy.trigger,
      'Only a monitor in service signs in on a phone',
    ]);
    await asTheApi();
    await db.run(`UPDATE "user" SET "archived_at" = NULL WHERE "id" = $1`, [world.monitor]);
    await db.run(
      `UPDATE "device" SET "status" = 'LOST', "out_of_service_at" = '2026-10-12T09:30:00Z'
       WHERE "id" = $1`,
      [world.device],
    );
    await underThePasscode();
    const lost = await db.refused(marked, [
      world.monitor,
      sha256('e'),
      ends,
      world.device,
      'TEMPORARY',
    ]);
    expect([lost.code, lost.message]).toEqual([
      refusedBy.trigger,
      'A phone out of service signs nobody in',
    ]);
  });

  it('how a session was opened never changes: a marked one is never unmarked or made the other kind, and a monitor’s own is never marked; it ends when revoked, by the monitor too', async () => {
    const { db, world } = tested;
    await underThePasscode();
    const { id } = await db.one<{ id: string }>(marked, [
      world.monitor,
      sha256(aToken),
      ends,
      world.device,
      'TEMPORARY',
    ]);
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    const own = await db.one<{ id: string }>(
      `INSERT INTO "session" ("user_id", "refresh_token_hash", "expires_at", "device_id")
       VALUES ($1, $2, $3, $4) RETURNING "id"::text`,
      [world.monitor, sha256('own'), ends, world.device],
    );
    await underThePasscode();
    for (const [session, to] of [
      [id, null],
      [id, 'AS_MONITOR'],
      [own.id, 'TEMPORARY'],
    ] as const) {
      const refusal = await db.refused(
        `UPDATE "session" SET "master_passcode_session" = $2::master_passcode_session
         WHERE "id" = $1`,
        [session, to],
      );
      expect(refusal.code, `${session} ${String(to)}`).toBe(refusedBy.trigger);
    }
    // Signing out is the monitor's; one more session under the passcode ends the others.
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    expect(await db.run(`UPDATE "session" SET "revoked_at" = now() WHERE "id" = $1`, [id])).toBe(1);
    await underThePasscode();
    expect(
      await db.run(`UPDATE "session" SET "revoked_at" = now() WHERE "id" = $1`, [own.id]),
    ).toBe(1);
  });
});

describe('a security event', () => {
  it('AC-10-19 is kept as its own record and copied into the audit log, in the security domain, with who wrote it and in which request', async () => {
    const { db, world } = tested;
    expect(await columnsOf('security_event')).toEqual([
      'created_at',
      'device_id',
      'device_utc_offset_minutes',
      'id',
      'kind',
      'master_passcode_session',
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
      // Added after (ADR-412): a new value of an enum goes last.
      'TWO_STEP_SET_UP',
      'TWO_STEP_CLEARED',
      'MASTER_PASSCODE_FAILED',
      'MASTER_PASSCODE_LOCKOUT',
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

  it('REQ-019, REQ-202b one a phone reported keeps the phone’s own time with its clock’s offset, and when the server wrote it; an offset is only a phone’s, and one a clock can have', async () => {
    const { db, world } = tested;
    // What a phone reported was done on it under the master passcode (ADR-464).
    await db.as('adms_api');
    await db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: world.device });
    const reported = `INSERT INTO "security_event" ("kind", "user_id", "device_id", "occurred_at",
        "device_utc_offset_minutes") VALUES ('DEVICE_SETUP', $1, $2, '2026-10-12T10:40:00Z', $3)
      RETURNING "id"::text, "occurred_at"::text, "device_utc_offset_minutes" AS offset,
        (abs(extract(epoch FROM "created_at" - transaction_timestamp())) < 1) AS written_now`;
    expect(await db.one(reported, [world.monitor, world.device, -240])).toMatchObject({
      occurred_at: '2026-10-12 10:40:00+00',
      offset: -240,
      written_now: true,
    });
    for (const offset of [-721, 841]) {
      const refused = await db.refused(reported, [world.monitor, world.device, offset]);
      expect([offset, refused.code]).toEqual([offset, refusedBy.check]);
      expect(refused.message).toContain('"security_event_device_utc_offset_check"');
    }
    // One with an offset and no phone is no phone's report: the guard on who writes one
    // answers before the check does (ADR-464).
    expect((await db.refused(reported, [world.monitor, null, -240])).code).toBe(refusedBy.grant);
    // One the server saw itself has none, on a phone or off it.
    expect(
      (await db.one<{ offset: number | null }>(reported, [world.monitor, null, null])).offset,
    ).toBeNull();
    expect(
      (await db.one<{ offset: number | null }>(reported, [world.monitor, world.device, null]))
        .offset,
    ).toBeNull();
  });

  it('REQ-202b, REQ-209 one a phone reported is written only as the master passcode’s actor, from a phone, naming that very phone: never by somebody signed in or the device key, and one the server saw itself is anybody’s to write', async () => {
    const { db, world } = tested;
    const reported = `INSERT INTO "security_event" ("kind", "user_id", "device_id", "occurred_at",
        "device_utc_offset_minutes") VALUES ($1, $2, $3, '2026-10-12T17:00:00Z', $4)
      RETURNING "id"::text`;
    const sent = ['DEVICE_SWITCH', world.monitor, world.device, -240];
    await db.as('adms_api');
    for (const [who, source, more] of [
      [world.admin, 'BACK_OFFICE', {}],
      [world.monitor, 'DEVICE', { deviceId: world.device }],
      [deviceKeyActorId, 'DEVICE', { deviceId: world.device }],
      // The passcode's actor, but from another phone (it states no other source, ADR-438).
      [masterPasscodeActorId, 'DEVICE', { deviceId: world.certifyingDevice }],
    ] as const) {
      await db.actor(who, source, more);
      const refused = await db.refused(reported, sent);
      expect([who, source, refused.code]).toEqual([who, source, refusedBy.grant]);
      expect(refused.message).toContain('A security event a phone reported');
      // The same event with no offset is one the server saw itself: not this guard's.
      expect(await db.run(reported, ['DEVICE_SWITCH', world.monitor, world.device, null])).toBe(1);
    }
    await db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: world.device });
    expect(await db.run(reported, sent)).toBe(1);
    // A wrong try a phone logged names nobody, and is the passcode's actor's too.
    expect(await db.run(reported, ['MASTER_PASSCODE_FAILED', null, world.device, -240])).toBe(1);
  });

  it('AC-02-42, REQ-202b a use of the master passcode a phone reported may say which way a session was opened on it with no connection; no other event does: another kind, one about nobody, one the server saw itself', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: world.device });
    const opened = `INSERT INTO "security_event" ("kind", "user_id", "device_id", "occurred_at",
        "device_utc_offset_minutes", "master_passcode_session")
      VALUES ($1, $2, $3, '2026-10-12T17:00:00Z', $4, $5::master_passcode_session)
      RETURNING "master_passcode_session"::text AS opened`;
    for (const way of ['AS_MONITOR', 'TEMPORARY']) {
      expect(
        await db.one(opened, ['MASTER_PASSCODE_USE', world.monitor, world.device, -240, way]),
      ).toEqual({ opened: way });
    }
    expect(
      (
        await db.refused(opened, [
          'MASTER_PASSCODE_USE',
          world.monitor,
          world.device,
          -240,
          'SUPERVISOR',
        ])
      ).code,
    ).toBe(refusedBy.badValue);
    for (const [kind, about, offset] of [
      ['DEVICE_SWITCH', world.monitor, -240],
      ['DEVICE_SETUP', world.monitor, -240],
      ['MASTER_PASSCODE_FAILED', world.monitor, -240],
      ['SIGN_IN', world.monitor, -240],
      ['MASTER_PASSCODE_USE', null, -240],
      ['MASTER_PASSCODE_USE', world.monitor, null],
    ] as const) {
      const refused = await db.refused(opened, [kind, about, world.device, offset, 'TEMPORARY']);
      expect([kind, about, offset, refused.code]).toEqual([kind, about, offset, refusedBy.check]);
      expect(refused.message).toContain('"security_event_master_passcode_session_check"');
    }
    // A use that opened none says nothing.
    expect(
      await db.one(opened, ['MASTER_PASSCODE_USE', world.monitor, world.device, -240, null]),
    ).toEqual({ opened: null });
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
