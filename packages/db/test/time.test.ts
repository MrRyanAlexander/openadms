// REQ-019, and AC-01-07 of spec/acceptance/01-setup.md: every project has an IANA time zone, and
// every captured time is stored as a UTC instant plus the device's offset and the server's received
// time (ARCHITECTURE §10; ADR-100, 281). The instants let "which day" be answered in the project's
// zone, whatever the phone's clock said.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  eventInsertOf,
  fieldEventLike,
  insertOf,
  projectLike,
  without,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

// A new project, whole but for the time zone under test.
const newProject = (timeZone: string): [string, unknown[]] =>
  insertOf('project', projectLike(tested.world, { time_zone: timeZone }));

describe("a project's time zone", () => {
  it.each([
    'America/New_York',
    'America/Chicago',
    'America/Argentina/Buenos_Aires',
    'America/Port-au-Prince',
    'Pacific/Honolulu',
    'Etc/GMT+5',
    'UTC',
  ])('AC-01-07 is an IANA name: %s', async (timeZone) => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    expect(await db.run(...newProject(timeZone))).toBe(1);
  });

  it.each(['EST', 'CST6CDT', 'UTC-5', '-05:00', 'GMT'])(
    'AC-01-07 is never an abbreviation or an offset, though the server could compute with it: "%s"',
    async (timeZone) => {
      const { db, world } = tested;
      await db.as('adms_api');
      await db.actor(world.admin, 'BACK_OFFICE');
      expect((await db.refused(...newProject(timeZone))).code).toBe(refusedBy.check);
    },
  );

  it.each(['America/Nowhere', 'Bayline/Marsh_Road', 'Texas time', 'Central', ''])(
    'AC-01-07 is one the server\'s time zone data knows: "%s" is refused',
    async (timeZone) => {
      const { db, world } = tested;
      await db.as('adms_api');
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(await db.refused(...newProject(timeZone))).toEqual({
        code: refusedBy.unknownTimeZone,
        message: `time zone "${timeZone}" not recognized`,
      });
    },
  );

  it('AC-01-07 is required, and a change to one is checked the same way', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    const missing = await db.refused(
      ...insertOf('project', without(projectLike(world), 'time_zone')),
    );
    expect(missing.code).toBe(refusedBy.notNull);
    expect(missing.message).toContain('"time_zone"');
    const change = `UPDATE "project" SET "time_zone" = $2 WHERE "id" = $1`;
    expect((await db.refused(change, [world.p1, 'EST'])).code).toBe(refusedBy.check);
    expect(await db.run(change, [world.p1, 'America/Chicago'])).toBe(1);
  });
});

describe('every captured time', () => {
  it('is an instant: no column in the schema is a time without its zone', async () => {
    const { db } = tested;
    expect(
      await db.rows(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND data_type IN ('timestamp without time zone', 'time without time zone')`,
      ),
    ).toEqual([]);
  });

  it("a field event keeps its instants, the phone's offset and the server's received time", async () => {
    const { db } = tested;
    const columns = await db.rows<{ column_name: string; data_type: string; required: boolean }>(
      `SELECT column_name, data_type, is_nullable = 'NO' AS required FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'field_event'
         AND column_name IN ('started_at', 'ended_at', 'device_utc_offset_minutes', 'received_at')
       ORDER BY column_name`,
    );
    expect(columns).toEqual([
      { column_name: 'device_utc_offset_minutes', data_type: 'integer', required: true },
      { column_name: 'ended_at', data_type: 'timestamp with time zone', required: true },
      { column_name: 'received_at', data_type: 'timestamp with time zone', required: true },
      { column_name: 'started_at', data_type: 'timestamp with time zone', required: true },
    ]);
  });

  it("answers 'which day' in the project's time zone, not UTC's or the phone's", async () => {
    // A collection ending at 10:30 pm Monday in Bayline County (02:30 Tuesday, UTC), on a phone
    // whose clock is set to Chicago time: Monday's load, in the project's zone (ADR-100, 161).
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    await db.run(
      ...eventInsertOf(
        fieldEventLike(world, {
          ticket_number: '101030',
          started_at: '2026-10-12T21:05:00-05:00',
          ended_at: '2026-10-12T21:30:00-05:00',
          device_utc_offset_minutes: -300,
        }),
      ),
    );
    const days = await db.one(
      `SELECT to_char(e."ended_at" AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') AS utc,
         to_char(e."ended_at" AT TIME ZONE p."time_zone", 'Dy DD Mon HH24:MI') AS project,
         to_char((e."ended_at" + make_interval(mins => e."device_utc_offset_minutes")) AT TIME ZONE 'UTC',
           'Dy DD Mon HH24:MI') AS phone
       FROM "field_event" e JOIN "project" p ON p."id" = e."project_id"
       WHERE e."project_id" = $1 AND e."ticket_number" = '101030'`,
      [world.p1],
    );
    expect(days).toEqual({
      utc: 'Tue 13 Oct 02:30',
      project: 'Mon 12 Oct 22:30',
      phone: 'Mon 12 Oct 21:30',
    });
  });
});
