// A phone out of service given no new numbers, a sign-in made offline kept on its session, and
// how long a monitor's sign-in lasts (ARCHITECTURE §7.2, §7.4; ADR-065, 134, 443, 488, 531;
// BACKLOG C170). The database holds each rule itself, whatever the API does.
import { createHash, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

const issue = `INSERT INTO "number_block" ("device_id", "project_id", "series", "first_number", "last_number")
  VALUES ($1, $2, 'LOAD', $3, $4) RETURNING "id"::text`;
const markedAs = (status: 'LOST' | 'RETIRED') => `UPDATE "device" SET "status" = '${status}',
  "out_of_service_at" = '2026-10-12T22:10:00Z', "out_of_service_marked_at" = '2026-10-12T22:10:00Z'
  WHERE "id" = $1`;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const aWeekOn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

describe('a phone taken out of service (ADR-065, 134, 531)', () => {
  it('is issued no new block of numbers, lost or retired; the block it holds is still written on, its last used number and its end', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id: held } = await db.one<{ id: string }>(issue, [
      world.device,
      world.p1,
      101001,
      102000,
    ]);
    for (const status of ['LOST', 'RETIRED'] as const) {
      expect(await db.run(markedAs(status), [world.device]), status).toBe(1);
      const refusal = await db.refused(issue, [world.device, world.p1, 102001, 103000]);
      expect([refusal.code, refusal.message], status).toEqual([
        refusedBy.restrict,
        'A phone out of service is issued no new numbers',
      ]);
    }
    expect(
      await db.run(`UPDATE "number_block" SET "last_used_number" = 101037 WHERE "id" = $1`, [held]),
    ).toBe(1);
    expect(
      await db.run(
        `UPDATE "number_block" SET "status" = 'RETIRED', "ended_at" = '2026-10-14T18:00:00Z' WHERE "id" = $1`,
        [held],
      ),
    ).toBe(1);
  });
});

describe('a sign-in made offline, kept on its session (ADR-531)', () => {
  const opened = `INSERT INTO "session" ("user_id", "refresh_token_hash", "expires_at", "device_id",
      "offline_sign_in_id", "signed_in_at", "signed_in_utc_offset_minutes")
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "id"::text`;

  async function asTheMonitorOnThePhone(): Promise<void> {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
  }

  it('says its id, the phone’s time and its offset all together, on a phone only; once only; and never changes them', async () => {
    const { db, world } = tested;
    await asTheMonitorOnThePhone();
    const id = randomUUID();
    const at = '2026-10-12T11:00:00Z';
    for (const [why, values] of [
      ['no id', [null, at, -240]],
      ['no time', [id, null, -240]],
      ['no offset', [id, at, null]],
      ['an offset past UTC+14:00', [id, at, 900]],
    ] as const) {
      const refusal = await db.refused(opened, [
        world.monitor,
        sha256(why),
        aWeekOn,
        world.device,
        ...values,
      ]);
      expect(
        [refusal.code, refusal.message.includes('session_offline_sign_in_check')],
        why,
      ).toEqual([refusedBy.check, true]);
    }
    const { id: session } = await db.one<{ id: string }>(opened, [
      world.monitor,
      sha256('taken'),
      aWeekOn,
      world.device,
      id,
      at,
      -240,
    ]);
    // The same sign-in, a second session: never.
    const twice = await db.refused(opened, [
      world.monitor,
      sha256('again'),
      aWeekOn,
      world.device,
      id,
      at,
      -240,
    ]);
    expect(twice.code).toBe(refusedBy.unique);
    for (const change of [
      `"offline_sign_in_id" = '${randomUUID()}'`,
      `"signed_in_at" = '2026-10-12T10:00:00Z'`,
      `"signed_in_utc_offset_minutes" = 0`,
    ]) {
      const refusal = await db.refused(`UPDATE "session" SET ${change} WHERE "id" = $1`, [session]);
      expect(refusal.code, change).toBe(refusedBy.trigger);
    }
    // Ended like any session.
    expect(
      await db.run(`UPDATE "session" SET "revoked_at" = now() WHERE "id" = $1`, [session]),
    ).toBe(1);
  });
});

describe('how long a monitor’s sign-in on a phone lasts (ADR-531)', () => {
  it('is a day as the seed writes it, and 1 to 24 hours as the firm sets it, audited in the security domain', async () => {
    const { db } = tested;
    expect(
      await db.rows(`SELECT "monitor_session_hours" FROM "firm_settings" WHERE "id" = 1`),
    ).toEqual([{ monitor_session_hours: 24 }]);
    await asTheApi();
    const set = `UPDATE "firm_settings" SET "monitor_session_hours" = $1 WHERE "id" = 1`;
    for (const hours of [0, 25, -1]) {
      expect((await db.refused(set, [hours])).code, String(hours)).toBe(refusedBy.check);
    }
    expect(await db.run(set, [1])).toBe(1);
    expect(await db.run(set, [24])).toBe(1);
    expect(
      await db.rows(
        `SELECT "domain"::text, "changed_fields" FROM "audit_record"
         WHERE "table_name" = 'firm_settings' AND "operation" = 'UPDATE' ORDER BY "id" DESC LIMIT 1`,
      ),
    ).toEqual([{ domain: 'SECURITY', changed_fields: ['monitor_session_hours'] }]);
  });
});
