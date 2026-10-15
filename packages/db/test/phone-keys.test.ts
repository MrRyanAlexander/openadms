// A lost phone's key revoked after the firm's time, and the firm's settings (REQ-214, 215;
// ARCHITECTURE §7.4; spec/acceptance/10-api-and-sync.md AC-10-83, 85; ADR-488, 520, 530). The
// database holds each rule itself: the firm's one settings record, a phone's mark, who revokes a
// key for the firm's time and when, a key revoked so then turned in once, the challenge such a
// phone still answers, and the worker's narrow part.
import { describe, expect, it } from 'vitest';

import { deviceKeyActorId } from '../src/device-key-actor.ts';
import { masterPasscodeActorId } from '../src/master-passcode-actor.ts';
import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

// Monday 12 October 2026, 6:10 pm in Bayline County: Luis marks P1-COL-1 lost. The database's
// own clock is days past it, so the firm's 24 hours have passed; a year has not.
const marked = '2026-10-12T22:10:00Z';
const markLost = `UPDATE "device" SET "status" = 'LOST', "out_of_service_at" = $2,
  "out_of_service_marked_at" = $2 WHERE "id" = $1`;
const byFirmTime = `UPDATE "device" SET "key_revoked_at" = $2, "key_revoked_by" = 'FIRM_TIME'
  WHERE "id" = $1`;
const hoursAre = `UPDATE "firm_settings" SET "phone_key_revoked_after_hours" = $1 WHERE "id" = 1`;

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

async function asTheWorker(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_worker');
  await db.actor(world.worker, 'SYSTEM');
}

// P1-COL-1 marked lost on Monday evening, by Luis at the back office.
async function lost(): Promise<void> {
  const { db, world } = tested;
  await asTheApi();
  expect(await db.run(markLost, [world.device, marked])).toBe(1);
}

describe('the firm’s settings', () => {
  it('AC-10-83 are one record, written by the seed from the release: a lost phone’s key kept 24 hours, two-step optional for viewers', async () => {
    const { db } = tested;
    expect(
      await db.rows(
        `SELECT "id", "phone_key_revoked_after_hours", "viewer_two_step_required" FROM "firm_settings"`,
      ),
    ).toEqual([{ id: 1, phone_key_revoked_after_hours: 24, viewer_two_step_required: false }]);
    // A second one, by anybody: never.
    const second = await db.refused(`INSERT INTO "firm_settings" ("id") VALUES (2)`);
    expect(second.code).toBe(refusedBy.check);
    await asTheApi();
    expect((await db.refused(`INSERT INTO "firm_settings" ("id") VALUES (1)`)).code).toBe(
      refusedBy.grant,
    );
  });

  it('AC-10-83 AC-10-85 are changed by the API alone, audited in the security domain: whole hours from 1 to a year, or off', async () => {
    const { db, world } = tested;
    await asTheApi();
    for (const hours of [0, -1, 8761]) {
      expect((await db.refused(hoursAre, [hours])).code, String(hours)).toBe(refusedBy.check);
    }
    expect(await db.run(hoursAre, [1])).toBe(1);
    expect(await db.run(hoursAre, [8760])).toBe(1);
    expect(await db.run(hoursAre, [null])).toBe(1);
    expect(
      await db.run(`UPDATE "firm_settings" SET "viewer_two_step_required" = true WHERE "id" = 1`),
    ).toBe(1);
    const audited = await db.rows<{ domain: string; actor_id: string; changed_fields: string[] }>(
      `SELECT "domain"::text, "actor_id"::text, "changed_fields" FROM "audit_record"
       WHERE "table_name" = 'firm_settings' AND "operation" = 'UPDATE' ORDER BY "id"`,
    );
    expect(audited).toHaveLength(4);
    expect(audited.at(-1)).toEqual({
      domain: 'SECURITY',
      actor_id: world.admin,
      changed_fields: ['viewer_two_step_required'],
    });
    // The worker reads them and changes nothing; nobody removes them.
    await asTheWorker();
    expect(await db.rows(`SELECT "id" FROM "firm_settings"`)).toEqual([{ id: 1 }]);
    expect((await db.refused(hoursAre, [48])).code).toBe(refusedBy.grant);
    await asTheApi();
    expect((await db.refused(`DELETE FROM "firm_settings" WHERE "id" = 1`)).code).toBe(
      refusedBy.grant,
    );
  });
});

describe('a phone’s mark', () => {
  it('AC-10-84 is set exactly while it is out of service, as its reason may be; a revocation says which revoked it', async () => {
    const { db, world } = tested;
    await asTheApi();
    for (const [change, check] of [
      [
        `"status" = 'LOST', "out_of_service_at" = '${marked}'`,
        'device_out_of_service_marked_check',
      ],
      [`"out_of_service_marked_at" = '${marked}'`, 'device_out_of_service_marked_check'],
      [
        `"out_of_service_reason_id" = (SELECT "id" FROM "reason" ORDER BY "id" LIMIT 1)`,
        'device_out_of_service_reason_check',
      ],
    ] as const) {
      const refusal = await db.refused(`UPDATE "device" SET ${change} WHERE "id" = $1`, [
        world.device,
      ]);
      expect([refusal.code, refusal.message.includes(check)], change).toEqual([
        refusedBy.check,
        true,
      ]);
    }
    await db.run(markLost, [world.device, marked]);
    // A lost phone made retired: the mark moves, its removal time kept (ADR-530).
    expect(
      await db.run(
        `UPDATE "device" SET "status" = 'RETIRED', "out_of_service_marked_at" = '2026-10-13T15:00:00Z' WHERE "id" = $1`,
        [world.device],
      ),
    ).toBe(1);
    await asTheWorker();
    const halfSaid = await db.refused(
      `UPDATE "device" SET "key_revoked_at" = now() WHERE "id" = $1`,
      [world.device],
    );
    expect([halfSaid.code, halfSaid.message.includes('device_key_revoked_by_check')]).toEqual([
      refusedBy.check,
      true,
    ]);
  });
});

describe('a phone’s key after the firm’s time', () => {
  it('AC-10-83 is revoked by the worker as the system actor once the firm’s hours have passed since the mark, and the change is audited as the system’s', async () => {
    const { db, world } = tested;
    await lost();
    await asTheWorker();
    expect(await db.run(byFirmTime, [world.device, '2026-10-13T22:10:00Z'])).toBe(1);
    expect(
      await db.one(`SELECT "key_revoked_by"::text, "status"::text FROM "device" WHERE "id" = $1`, [
        world.device,
      ]),
    ).toEqual({ key_revoked_by: 'FIRM_TIME', status: 'LOST' });
    const audited = await db.one<{ actor_id: string; source: string; changed_fields: string[] }>(
      `SELECT "actor_id"::text, "source"::text, "changed_fields" FROM "audit_record"
       WHERE "table_name" = 'device' AND "record_id" = $1 ORDER BY "id" DESC LIMIT 1`,
      [world.device],
    );
    expect(audited).toEqual({
      actor_id: world.worker,
      source: 'SYSTEM',
      changed_fields: ['key_revoked_at', 'key_revoked_by'],
    });
  });

  it('AC-10-83 is never revoked so by anybody else: a person, the phone’s key, the master passcode', async () => {
    const { db, world } = tested;
    await lost();
    for (const state of [
      () => db.actor(world.admin, 'BACK_OFFICE'),
      () => db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device }),
      () => db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: world.device }),
    ]) {
      await state();
      const refusal = await db.refused(byFirmTime, [world.device, '2026-10-13T22:10:00Z']);
      expect([refusal.code, refusal.message]).toEqual([
        refusedBy.grant,
        "Only the worker revokes a key for the firm's time",
      ]);
    }
  });

  it('AC-10-83 is never revoked before the firm’s hours have passed, nor while the firm has it off, nor for a phone in service, nor with anything else of it changed', async () => {
    const { db, world } = tested;
    await lost();
    // A year: not yet, by the database's own clock.
    await db.run(hoursAre, [8760]);
    await asTheWorker();
    const early = await db.refused(byFirmTime, [world.device, '2026-10-13T22:10:00Z']);
    expect([early.code, early.message]).toEqual([
      refusedBy.trigger,
      "A phone keeps its key until the firm's time has passed since it was marked",
    ]);
    // A revocation time stated a year on: the database's own clock still says not yet.
    expect((await db.refused(byFirmTime, [world.device, '2027-10-13T00:00:00Z'])).message).toBe(
      "A phone keeps its key until the firm's time has passed since it was marked",
    );
    // A day, and a revocation time stated before the day is out.
    await asTheApi();
    await db.run(hoursAre, [24]);
    await asTheWorker();
    expect((await db.refused(byFirmTime, [world.device, '2026-10-13T22:09:59Z'])).message).toBe(
      "A phone keeps its key until the firm's time has passed since it was marked",
    );
    // Off.
    await asTheApi();
    await db.run(hoursAre, [null]);
    await asTheWorker();
    expect((await db.refused(byFirmTime, [world.device, '2026-10-13T22:10:00Z'])).message).toBe(
      "The firm has no time after which a phone's key is revoked",
    );
    await asTheApi();
    await db.run(hoursAre, [24]);
    // Anything else of the phone changed with it.
    await asTheWorker();
    const more = await db.refused(
      `UPDATE "device" SET "key_revoked_at" = '2026-10-13T22:10:00Z', "key_revoked_by" = 'FIRM_TIME', "status" = 'RETIRED' WHERE "id" = $1`,
      [world.device],
    );
    expect(more.code).toBe(refusedBy.grant);
    // In service: never.
    await asTheApi();
    await db.run(
      `UPDATE "device" SET "status" = 'ACTIVE', "out_of_service_at" = NULL, "out_of_service_marked_at" = NULL WHERE "id" = $1`,
      [world.device],
    );
    await asTheWorker();
    expect((await db.refused(byFirmTime, [world.device, '2026-10-13T22:10:00Z'])).message).toBe(
      "The firm's time revokes the key of a phone out of service, and changes nothing else of it",
    );
  });

  it('AC-10-83 is revoked only once the phone holds no block still issued: the worker retires them whole first', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id: block } = await db.one<{ id: string }>(
      `INSERT INTO "number_block" ("device_id", "project_id", "series", "first_number", "last_number")
       VALUES ($1, $2, 'LOAD', 101001, 102000) RETURNING "id"::text`,
      [world.device, world.p1],
    );
    await db.run(markLost, [world.device, marked]);
    await asTheWorker();
    expect((await db.refused(byFirmTime, [world.device, '2026-10-13T22:10:00Z'])).message).toBe(
      "A phone's numbers are handed back or retired before its key is revoked",
    );
    expect(
      await db.run(
        `UPDATE "number_block" SET "status" = 'RETIRED', "ended_at" = '2026-10-13T22:10:00Z' WHERE "id" = $1`,
        [block],
      ),
    ).toBe(1);
    expect(await db.run(byFirmTime, [world.device, '2026-10-13T22:10:00Z'])).toBe(1);
  });

  it('AC-10-86 may then be turned in once, under the master passcode on that phone: its revocation time kept, nothing else of it changed', async () => {
    const { db, world } = tested;
    await lost();
    await asTheWorker();
    await db.run(byFirmTime, [world.device, '2026-10-13T22:10:00Z']);
    const turnIn = `UPDATE "device" SET "key_revoked_by" = 'TURN_IN' WHERE "id" = $1`;
    for (const state of [
      () => db.actor(world.admin, 'BACK_OFFICE'),
      () => db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device }),
      () => db.actor(masterPasscodeActorId, 'DEVICE'),
    ]) {
      await asTheApi();
      await state();
      const refusal = await db.refused(turnIn, [world.device]);
      expect([refusal.code, refusal.message]).toEqual([
        refusedBy.grant,
        "Only a phone's turn-in, under the master passcode on that phone, turns it in",
      ]);
    }
    await db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: world.device });
    for (const change of [
      `"key_revoked_at" = '2026-10-14T13:30:00Z', "key_revoked_by" = 'TURN_IN'`,
      `"status" = 'RETIRED', "out_of_service_marked_at" = '2026-10-14T13:30:00Z'`,
      `"status" = 'ACTIVE', "out_of_service_at" = NULL, "out_of_service_marked_at" = NULL, "key_revoked_at" = NULL, "key_revoked_by" = NULL`,
    ]) {
      const refusal = await db.refused(`UPDATE "device" SET ${change} WHERE "id" = $1`, [
        world.device,
      ]);
      expect(refusal.message, change).toBe(
        "A phone whose key the firm's time revoked stays as it was, until it is turned in",
      );
    }
    expect(await db.run(turnIn, [world.device])).toBe(1);
    expect(
      await db.one(
        `SELECT "key_revoked_at", "key_revoked_by"::text FROM "device" WHERE "id" = $1`,
        [world.device],
      ),
    ).toEqual({ key_revoked_at: new Date('2026-10-13T22:10:00Z'), key_revoked_by: 'TURN_IN' });
    // Turned in: it stays so.
    const again = await db.refused(
      `UPDATE "device" SET "key_revoked_by" = 'FIRM_TIME' WHERE "id" = $1`,
      [world.device],
    );
    expect(again.message).toBe(
      "A phone turned in stays as it was turned in: its key, its status and its removal time don't change",
    );
  });

  it('AC-10-86 still answers a challenge while only the firm’s time has revoked it; once turned in, never', async () => {
    const { db, world } = tested;
    await lost();
    await asTheWorker();
    await db.run(byFirmTime, [world.device, '2026-10-13T22:10:00Z']);
    await asTheApi();
    await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device });
    const answered = `UPDATE "device" SET "last_answered_challenge_made_at" = $2 WHERE "id" = $1`;
    expect(await db.run(answered, [world.device, '2026-10-14T13:00:00Z'])).toBe(1);
    await db.actor(masterPasscodeActorId, 'DEVICE', { deviceId: world.device });
    await db.run(`UPDATE "device" SET "key_revoked_by" = 'TURN_IN' WHERE "id" = $1`, [
      world.device,
    ]);
    await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device });
    expect((await db.refused(answered, [world.device, '2026-10-14T14:00:00Z'])).message).toBe(
      'A phone whose key is revoked proves nothing',
    );
  });
});

describe('the worker’s part', () => {
  it('AC-10-83 AC-10-11 revokes a key, retires a phone’s blocks and writes the security event, and nothing more: sign-in’s records stay the API’s', async () => {
    const { db, world } = tested;
    await asTheWorker();
    for (const [sql, values] of [
      [`UPDATE "device" SET "name" = 'P1-COL-1 (lost)' WHERE "id" = $1`, [world.device]],
      [`UPDATE "device" SET "status" = 'RETIRED' WHERE "id" = $1`, [world.device]],
      [
        `UPDATE "number_block" SET "last_used_number" = 101001 WHERE "device_id" = $1`,
        [world.device],
      ],
      [`SELECT "id" FROM "session" LIMIT 1`, []],
      [`UPDATE "session" SET "revoked_at" = now() WHERE "device_id" = $1`, [world.device]],
      [`SELECT "id" FROM "security_event" LIMIT 1`, []],
      [`UPDATE "firm_settings" SET "viewer_two_step_required" = true WHERE "id" = 1`, []],
    ] as const) {
      expect((await db.refused(sql, [...values])).code, sql).toBe(refusedBy.grant);
    }
    expect(
      await db.run(
        `UPDATE "number_block" SET "status" = 'RETIRED', "ended_at" = now() WHERE "device_id" = $1 AND "status" = 'ISSUED'`,
        [world.device],
      ),
    ).toBeGreaterThanOrEqual(0);
    expect(
      await db.run(
        `INSERT INTO "security_event" ("kind", "occurred_at", "device_id") VALUES ('DEVICE_KEY_REVOKED', now(), $1)`,
        [world.device],
      ),
    ).toBe(1);
  });
});
