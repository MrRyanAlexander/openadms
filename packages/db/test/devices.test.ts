// REQ-020, the device: a phone enrolled once, with its public key, its status (active, lost,
// retired), the version of the master passcode's check it holds and its number blocks; and the
// master passcode itself, kept in the database only as its slow hash (ARCHITECTURE §7.4, §7.5;
// ADR-065, 106, 134, 240, 281; BACKLOG carry-forward C12).
import { describe, expect, it } from 'vitest';

import { deviceKeyActorId } from '../src/device-key-actor.ts';
import { masterPasscodeActorId } from '../src/master-passcode-actor.ts';
import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { deviceKeyLike } from './support/device-keys.ts';

const tested = eachTestRolledBack();

// Shaped like an Argon2id hash (a PHC string); nothing hashes to it.
const aHash = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';
const keptOut = '[kept out of the audit]';

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

const enrol = `INSERT INTO "device" ("name", "public_key", "master_passcode_version")
  VALUES ($1, $2, $3) RETURNING "id"::text, "status"::text, "out_of_service_at"`;

describe('a phone', () => {
  it('AC-02-15 is enrolled once: in service, with no project and no monitor', async () => {
    const { db } = tested;
    await asTheApi();
    expect(await db.one(enrol, ['P1-TWR-TDSR', deviceKeyLike('kim-nguyen'), 1])).toMatchObject({
      status: 'ACTIVE',
      out_of_service_at: null,
    });
    const columns = await db.rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'device' ORDER BY column_name`,
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      'enrolled_at',
      'id',
      'key_revoked_at',
      'key_revoked_by',
      'last_answered_challenge_made_at',
      'master_passcode_version',
      'name',
      'out_of_service_at',
      'out_of_service_marked_at',
      'out_of_service_reason_id',
      'public_key',
      'status',
    ]);
  });

  it("AC-02-16 can't be copied: one key, one phone", async () => {
    const { db } = tested;
    await asTheApi();
    expect(
      (await db.refused(enrol, ['P1-COL-1 (a copy)', deviceKeyLike('ana-brooks'), 1])).code,
    ).toBe(refusedBy.unique);
  });

  it('AC-02-17 holds a version of the master passcode that exists', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect((await db.refused(enrol, ['P1-UR-1', deviceKeyLike('jo-kim'), 7])).code).toBe(
      refusedBy.foreignKey,
    );
    expect(
      (
        await db.refused(`INSERT INTO "device" ("name", "public_key") VALUES ('P1-UR-1', $1)`, [
          deviceKeyLike('jo-kim'),
        ])
      ).code,
    ).toBe(refusedBy.notNull);
    // The firm changes the passcode; the phone gets the new check at its next sync.
    await db.run(`INSERT INTO "master_passcode" ("version", "hash") VALUES (2, $1)`, [aHash]);
    await db.run(`INSERT INTO "master_passcode" ("version", "hash") VALUES (3, $1)`, [aHash]);
    const holds = `UPDATE "device" SET "master_passcode_version" = $2 WHERE "id" = $1`;
    // Which version a phone holds is said only by that phone's own proven call (ADR-454): not
    // by a person, not by the master passcode's actor, not by another phone's key.
    const { id: another } = await db.one<{ id: string }>(enrol, [
      'P1-UR-1',
      deviceKeyLike('jo-kim'),
      1,
    ]);
    const others = [
      () => db.actor(world.admin, 'BACK_OFFICE'),
      () => db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: world.device }),
      () => db.actor(deviceKeyActorId, 'DEVICE', { deviceId: another }),
    ];
    for (const [at, state] of others.entries()) {
      await state();
      const refusal = await db.refused(holds, [world.device, 2]);
      expect(refusal.code, String(at)).toBe(refusedBy.grant);
      expect(refusal.message).toContain("Only a phone's own proven call");
    }
    await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device });
    expect(await db.run(holds, [world.device, 3])).toBe(1);
    // Never back to an earlier version; the same one again changes nothing and is let be.
    const back = await db.refused(holds, [world.device, 2]);
    expect(back.code).toBe(refusedBy.trigger);
    expect(back.message).toContain('never goes back to an earlier version');
    expect(await db.run(holds, [world.device, 3])).toBe(1);
    // Anybody may change the rest of the phone's record, the version left as it is.
    await db.actor(world.admin, 'BACK_OFFICE');
    expect(
      await db.run(`UPDATE "device" SET "name" = 'P1-TWR-FDS' WHERE "id" = $1`, [world.device]),
    ).toBe(1);
  });

  it('AC-02-59 is lost or retired exactly from its removal time; never deleted', async () => {
    const { db, world } = tested;
    await asTheApi();
    const mark = `UPDATE "device" SET "status" = $2, "out_of_service_at" = $3, "out_of_service_marked_at" = $3 WHERE "id" = $1`;
    for (const [status, removedAt] of [
      ['LOST', null],
      ['RETIRED', null],
      ['ACTIVE', '2026-10-13T11:00:00Z'],
    ]) {
      expect(
        (await db.refused(mark, [world.device, status, removedAt])).code,
        `${String(status)} ${String(removedAt)}`,
      ).toBe(refusedBy.check);
    }
    expect((await db.refused(mark, [world.device, 'STOLEN', null])).code).toBe(refusedBy.badValue);
    expect(await db.run(mark, [world.device, 'LOST', '2026-10-13T11:00:00Z'])).toBe(1);
    // It turned up: back in service, audited like any change.
    expect(await db.run(mark, [world.device, 'ACTIVE', null])).toBe(1);
    expect(await db.run(mark, [world.device, 'RETIRED', '2026-10-14T18:00:00Z'])).toBe(1);
    expect((await db.refused(`DELETE FROM "device" WHERE "id" = $1`, [world.device])).code).toBe(
      refusedBy.grant,
    );
    const audited = await db.rows<{ status: string }>(
      `SELECT "new_value" ->> 'status' AS status FROM "audit_record"
       WHERE "table_name" = 'device' AND "record_id" = $1 ORDER BY "id"`,
      [world.device],
    );
    expect(audited.map((record) => record.status)).toEqual(['ACTIVE', 'LOST', 'ACTIVE', 'RETIRED']);
  });
});

describe("a phone's key", () => {
  const revoke = `UPDATE "device" SET "key_revoked_at" = $2, "key_revoked_by" = 'TURN_IN' WHERE "id" = $1`;
  const markLost = `UPDATE "device" SET "status" = 'LOST', "out_of_service_at" = '2026-10-12T22:10:00Z', "out_of_service_marked_at" = '2026-10-12T22:10:00Z' WHERE "id" = $1`;
  const issue = `INSERT INTO "number_block" ("device_id", "project_id", "series", "first_number", "last_number")
    VALUES ($1, $2, 'LOAD', $3, $4) RETURNING "id"::text`;
  // Its turn-in: the master passcode's actor, on that phone (ADR-488).
  const asItsTurnIn = (deviceId: string) =>
    tested.db.actor(masterPasscodeActorId, 'DEVICE', { deviceId });

  it('AC-02-61 is revoked only once the phone is out of service, never before its removal time; the time is kept on its record', async () => {
    const { db, world } = tested;
    await asTheApi();
    await asItsTurnIn(world.device);
    // In service: its key can't be revoked.
    const inService = await db.refused(revoke, [world.device, '2026-10-12T22:10:00Z']);
    expect(inService.code).toBe(refusedBy.check);
    expect(inService.message).toContain('"device_key_revoked_check"');
    // Luis marks it lost at 6:10 pm on Monday; it syncs and is turned in on Wednesday.
    await db.actor(world.admin, 'BACK_OFFICE');
    await db.run(markLost, [world.device]);
    await asItsTurnIn(world.device);
    expect((await db.refused(revoke, [world.device, '2026-10-12T22:09:59Z'])).code).toBe(
      refusedBy.check,
    );
    expect(await db.run(revoke, [world.device, '2026-10-14T13:30:00Z'])).toBe(1);
    const audited = await db.rows<{ changed_fields: string[]; actor_id: string }>(
      `SELECT "changed_fields", "actor_id"::text FROM "audit_record"
       WHERE "table_name" = 'device' AND "record_id" = $1 AND "operation" = 'UPDATE' ORDER BY "id"`,
      [world.device],
    );
    expect(audited.map((record) => [record.changed_fields, record.actor_id])).toEqual([
      [['out_of_service_at', 'out_of_service_marked_at', 'status'], world.admin],
      [['key_revoked_at', 'key_revoked_by'], masterPasscodeActorId],
    ]);
  });

  it('ADR-488 is revoked by the phone’s turn-in alone: under the master passcode on that same phone; never by a person, by the phone’s own key, for another phone, nor at enrolment', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(markLost, [world.device]);
    const { id: another } = await db.one<{ id: string }>(enrol, [
      'P1-UR-1',
      deviceKeyLike('jo-kim'),
      1,
    ]);
    const others = [
      () => db.actor(world.admin, 'BACK_OFFICE'),
      () => db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device }),
      () => asItsTurnIn(another),
      () => db.actor(masterPasscodeActorId, 'DEVICE'),
    ];
    for (const [at, state] of others.entries()) {
      await state();
      const refusal = await db.refused(revoke, [world.device, '2026-10-14T13:30:00Z']);
      expect([refusal.code, refusal.message], String(at)).toEqual([
        refusedBy.grant,
        "Only a phone's turn-in, under the master passcode on that phone, revokes its key",
      ]);
    }
    // Enrolled lost and revoked at once: refused, whoever writes it.
    await asItsTurnIn(world.device);
    const enrolledRevoked = await db.refused(
      `INSERT INTO "device" ("name", "public_key", "master_passcode_version", "status", "out_of_service_at", "out_of_service_marked_at", "key_revoked_at", "key_revoked_by")
       VALUES ('P1-UR-2', $1, 1, 'LOST', '2026-10-12T22:10:00Z', '2026-10-12T22:10:00Z', '2026-10-12T22:10:00Z', 'TURN_IN')`,
      [deviceKeyLike('lee-morgan')],
    );
    expect([enrolledRevoked.code, enrolledRevoked.message]).toEqual([
      refusedBy.trigger,
      "A phone is enrolled with its key standing: only its turn-in or the firm's time revokes it",
    ]);
    expect(await db.run(revoke, [world.device, '2026-10-14T13:30:00Z'])).toBe(1);
  });

  it('ADR-065, 488 is revoked only once the phone holds no block still issued; a phone turned in is issued no block, nor has one opened again, whoever asks', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id: block } = await db.one<{ id: string }>(issue, [
      world.device,
      world.p1,
      101001,
      102000,
    ]);
    await db.run(markLost, [world.device]);
    await asItsTurnIn(world.device);
    const stillIssued = await db.refused(revoke, [world.device, '2026-10-14T13:30:00Z']);
    expect([stillIssued.code, stillIssued.message]).toEqual([
      refusedBy.trigger,
      "A phone's numbers are handed back or retired before its key is revoked",
    ]);
    expect(
      await db.run(
        `UPDATE "number_block" SET "status" = 'RETIRED', "ended_at" = '2026-10-14T13:30:00Z' WHERE "id" = $1`,
        [block],
      ),
    ).toBe(1);
    expect(await db.run(revoke, [world.device, '2026-10-14T13:30:00Z'])).toBe(1);
    // Afterwards, for the back office or the phone's own key: no block, and none opened again.
    for (const state of [
      () => db.actor(world.admin, 'BACK_OFFICE'),
      () => db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device }),
    ]) {
      await state();
      for (const [sql, values] of [
        [issue, [world.device, world.p1, 102001, 103000]],
        [
          `UPDATE "number_block" SET "status" = 'ISSUED', "ended_at" = NULL WHERE "id" = $1`,
          [block],
        ],
      ] as const) {
        const refusal = await db.refused(sql, [...values]);
        expect([refusal.code, refusal.message], sql).toEqual([
          refusedBy.trigger,
          'A phone turned in is issued no numbers: its key is revoked',
        ]);
      }
    }
    // Another phone is issued numbers as before.
    const { id: another } = await db.one<{ id: string }>(enrol, [
      'P1-COL-2',
      deviceKeyLike('jo-kim'),
      1,
    ]);
    await db.actor(world.admin, 'BACK_OFFICE');
    expect(await db.one(issue, [another, world.p1, 102001, 103000])).toHaveProperty('id');
  });

  it('ADR-488 once revoked, the phone stays as it was turned in: when its key was revoked, its status and its removal time never change; its name still may', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(markLost, [world.device]);
    await asItsTurnIn(world.device);
    await db.run(revoke, [world.device, '2026-10-14T13:30:00Z']);
    for (const state of [
      () => db.actor(world.admin, 'BACK_OFFICE'),
      () => asItsTurnIn(world.device),
    ]) {
      await state();
      for (const change of [
        `"key_revoked_at" = NULL, "key_revoked_by" = NULL`,
        `"key_revoked_at" = '2026-10-14T14:00:00Z'`,
        `"key_revoked_by" = 'FIRM_TIME'`,
        `"status" = 'RETIRED', "out_of_service_marked_at" = '2026-10-14T14:00:00Z'`,
        `"status" = 'ACTIVE', "out_of_service_at" = NULL, "out_of_service_marked_at" = NULL, "key_revoked_at" = NULL, "key_revoked_by" = NULL`,
        `"out_of_service_at" = '2026-10-12T22:00:00Z'`,
        `"out_of_service_marked_at" = '2026-10-14T14:00:00Z'`,
      ]) {
        const refusal = await db.refused(`UPDATE "device" SET ${change} WHERE "id" = $1`, [
          world.device,
        ]);
        expect([refusal.code, refusal.message], change).toEqual([
          refusedBy.trigger,
          "A phone turned in stays as it was turned in: its key, its status and its removal time don't change",
        ]);
      }
    }
    await db.actor(world.admin, 'BACK_OFFICE');
    expect(
      await db.run(`UPDATE "device" SET "name" = 'P1-COL-1 (turned in)' WHERE "id" = $1`, [
        world.device,
      ]),
    ).toBe(1);
  });
});

describe('the master passcode', () => {
  it('AC-02-20 is kept by the seed as version 1, an Argon2id hash', async () => {
    const { db } = tested;
    await db.administer();
    expect(
      await db.rows(
        `SELECT "version", "hash" LIKE '$argon2id$v=19$%' AS argon2id FROM "master_passcode"`,
      ),
    ).toEqual([{ version: 1, argon2id: true }]);
  });

  it('AC-02-21 the API reads it and adds a version, and never edits or removes one', async () => {
    const { db } = tested;
    await asTheApi();
    expect(await db.rows(`SELECT "version" FROM "master_passcode"`)).toEqual([{ version: 1 }]);
    expect(
      await db.run(`INSERT INTO "master_passcode" ("version", "hash") VALUES (2, $1)`, [aHash]),
    ).toBe(1);
    for (const sql of [
      `UPDATE "master_passcode" SET "hash" = '${aHash}' WHERE "version" = 1`,
      `UPDATE "master_passcode" SET "version" = 3 WHERE "version" = 2`,
      `DELETE FROM "master_passcode" WHERE "version" = 2`,
      `TRUNCATE "master_passcode" CASCADE`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
  });

  it.each([
    ['the passcode itself', 2, 'heron-marsh-delphine', refusedBy.check],
    ['another kind of hash', 2, '$2b$12$abcdefghijklmnopqrstuv', refusedBy.check],
    ['a version before the first', 0, aHash, refusedBy.check],
    ['a version already kept', 1, aHash, refusedBy.unique],
  ])('is only ever a slow hash, each version once: %s is refused', async (_, version, hash, by) => {
    const { db } = tested;
    await asTheApi();
    const refusal = await db.refused(
      `INSERT INTO "master_passcode" ("version", "hash") VALUES ($1, $2)`,
      [version, hash],
    );
    expect(refusal.code).toBe(by);
  });

  it('AC-02-21 AC-02-68 is read by nobody else: not the worker, not the read-only login', async () => {
    const { db } = tested;
    for (const login of ['adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect((await db.refused(`SELECT "version" FROM "master_passcode"`)).code, login).toBe(
        refusedBy.grant,
      );
    }
  });

  it('AC-02-22 never reaches the audit log: its hash is left out, before and after', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(
      `INSERT INTO "master_passcode" ("version", "hash") VALUES (2, $1) RETURNING "id"::text`,
      [aHash],
    );
    // Only the owner could change one; even then the audit says that it changed, never to what.
    await db.as('adms_owner');
    await db.actor(world.admin, 'BACK_OFFICE', { reason: 'A test of the audit capture' });
    await db.run(`UPDATE "master_passcode" SET "hash" = $2 WHERE "id" = $1`, [id, `${aHash}Zm9v`]);
    // The worker reads the audit log; this is all it sees of the passcode.
    await db.as('adms_worker');
    const audited = await db.rows(
      `SELECT "operation"::text, "domain"::text, "changed_fields", "prior_value" ->> 'hash' AS prior,
         "new_value" ->> 'hash' AS new, "new_value" ->> 'version' AS version
       FROM "audit_record" WHERE "table_name" = 'master_passcode' AND "record_id" = $1 ORDER BY "id"`,
      [id],
    );
    expect(audited).toEqual([
      {
        operation: 'INSERT',
        domain: 'SECURITY',
        changed_fields: ['created_at', 'hash', 'id', 'version'],
        prior: null,
        new: keptOut,
        version: '2',
      },
      {
        operation: 'UPDATE',
        domain: 'SECURITY',
        changed_fields: ['hash'],
        prior: keptOut,
        new: keptOut,
        version: '2',
      },
    ]);
    const leaked = await db.one<{ count: number }>(
      `SELECT count(*)::int AS count FROM "audit_record"
       WHERE "prior_value"::text LIKE '%$argon2id$%' OR "new_value"::text LIKE '%$argon2id$%'`,
    );
    expect(leaked.count).toBe(0);
  });
});

describe('a number block', () => {
  const issue = `INSERT INTO "number_block" ("device_id", "project_id", "series", "first_number", "last_number")
    VALUES ($1, $2, $3, $4, $5) RETURNING "id"::text`;

  it('AC-02-57 is a run of one series of a project, issued to a phone, used in order, then ended', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(issue, [
      world.device,
      world.p1,
      'LOAD',
      101001,
      102000,
    ]);
    // A phone that certifies holds a block of cert numbers too (ADR-151).
    await db.one(issue, [world.device, world.p1, 'CERTIFICATION', 730415, 730514]);
    expect(
      await db.one(
        `SELECT "status"::text, "last_used_number", "ended_at" FROM "number_block" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({ status: 'ISSUED', last_used_number: null, ended_at: null });
    // At a sync the phone reports the last number it used; turned in, its unused rest is reclaimed.
    expect(
      await db.run(`UPDATE "number_block" SET "last_used_number" = 101037 WHERE "id" = $1`, [id]),
    ).toBe(1);
    expect(
      await db.run(
        `UPDATE "number_block" SET "status" = 'RECLAIMED', "ended_at" = '2026-10-14T18:00:00Z' WHERE "id" = $1`,
        [id],
      ),
    ).toBe(1);
  });

  it.each([
    ['runs backwards', `"first_number" = 102000, "last_number" = 101001`],
    ['starts before 1', `"first_number" = 0`],
    ['was used outside itself', `"last_used_number" = 102001`],
    ['ended without saying how', `"ended_at" = '2026-10-14T18:00:00Z'`],
    ['was retired at no time', `"status" = 'RETIRED'`],
  ])('is refused when it %s', async (_, change) => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(issue, [
      world.device,
      world.p1,
      'LOAD',
      101001,
      102000,
    ]);
    expect(
      (await db.refused(`UPDATE "number_block" SET ${change} WHERE "id" = $1`, [id])).code,
    ).toBe(refusedBy.check);
  });

  it('AC-02-57 is issued once: the same start in one series of one project is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.one(issue, [world.device, world.p1, 'LOAD', 101001, 102000]);
    // Refused because the two would hold the same numbers (numbering.test.ts, AC-04-05).
    expect((await db.refused(issue, [world.device, world.p1, 'LOAD', 101001, 101500])).code).toBe(
      refusedBy.exclusion,
    );
    // Another series, and another project's own series, start where they like.
    await db.one(issue, [world.device, world.p1, 'UNIT_RATE', 101001, 102000]);
    await db.one(issue, [world.device, world.p2, 'LOAD', 101001, 102000]);
    expect((await db.refused(issue, [world.device, world.p1, 'TICKET', 1, 100])).code).toBe(
      refusedBy.badValue,
    );
  });

  it("AC-02-57 is the server's to issue: the worker reads it and writes nothing", async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(issue, [
      world.device,
      world.p1,
      'HAUL_OUT',
      201001,
      202000,
    ]);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(await db.rows(`SELECT 1 FROM "number_block" WHERE "id" = $1`, [id])).toHaveLength(1);
    expect((await db.refused(issue, [world.device, world.p1, 'LOAD', 103001, 104000])).code).toBe(
      refusedBy.grant,
    );
    expect(
      (
        await db.refused(`UPDATE "number_block" SET "last_used_number" = 201005 WHERE "id" = $1`, [
          id,
        ])
      ).code,
    ).toBe(refusedBy.grant);
  });
});
