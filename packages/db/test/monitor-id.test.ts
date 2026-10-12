// REQ-021: every worker has a system-issued Monitor ID (M004127) and an optional ID from their
// employer, who is a contractor record, never typed text (Q-97; ADR-102, 120, 281). The database
// issues the Monitor ID itself: a person written without one gets the next.
import { describe, expect, it } from 'vitest';

import { systemActorId } from '../src/system-actor.ts';
import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

const number = (monitorNumber: string): number => Number(monitorNumber.slice(1));

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

async function create(name: string, role: string): Promise<string> {
  const { monitor_number } = await tested.db.one<{ monitor_number: string }>(
    `INSERT INTO "user" ("name", "role") VALUES ($1, $2) RETURNING "monitor_number"`,
    [name, role],
  );
  return monitor_number;
}

describe('a Monitor ID', () => {
  it('AC-02-01 is issued by the database: "M" and six digits, more once the series passes 999,999, the next of one series', async () => {
    await asTheApi();
    const kim = await create('Kim Nguyen', 'MONITOR');
    const tariq = await create('Tariq Patel', 'MONITOR');
    expect(kim).toMatch(/^M\d{6,}$/);
    expect(tariq).toMatch(/^M\d{6,}$/);
    expect(number(tariq)).toBe(number(kim) + 1);
  });

  it("was issued to the example world's people too, each their own", async () => {
    const { db, world } = tested;
    const issued = await db.rows<{ name: string; monitor_number: string }>(
      `SELECT "name", "monitor_number" FROM "user" WHERE "id" = ANY($1) ORDER BY "monitor_number"`,
      [[world.admin, world.monitor, world.coastlineViewer]],
    );
    expect(issued.map((person) => person.name)).toEqual([
      'Dana Reyes',
      'Ana Brooks',
      'Coastline Haulers LLC viewer',
    ]);
    for (const person of issued) expect(person.monitor_number).toMatch(/^M\d{6,}$/);
  });

  it('AC-02-02 may be left off anyone but a monitor, when the writer says so', async () => {
    const { db } = tested;
    await asTheApi();
    const withNone = `INSERT INTO "user" ("name", "role", "monitor_number") VALUES ($1, $2, NULL)`;
    expect(await db.run(withNone, ['Luis Ortega', 'MANAGER_ANALYST'])).toBe(1);
    expect((await db.refused(withNone, ['Jo Kim', 'MONITOR'])).code).toBe(refusedBy.check);
    expect(
      (
        await db.refused(`UPDATE "user" SET "monitor_number" = NULL WHERE "id" = $1`, [
          tested.world.monitor,
        ])
      ).code,
    ).toBe(refusedBy.check);
  });

  it.each(['4127', 'M4127', 'm004127', 'M00412A', 'M 004127', 'MON004127'])(
    'AC-02-01 is never another shape: "%s" is refused',
    async (monitorNumber) => {
      const { db } = tested;
      await asTheApi();
      expect(
        (
          await db.refused(
            `INSERT INTO "user" ("name", "role", "monitor_number") VALUES ('Sam Grant', 'MONITOR', $1)`,
            [monitorNumber],
          )
        ).code,
      ).toBe(refusedBy.check);
    },
  );

  it('AC-02-02 belongs to one person', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { monitor_number: anas } = await db.one<{ monitor_number: string }>(
      `SELECT "monitor_number" FROM "user" WHERE "id" = $1`,
      [world.monitor],
    );
    expect(
      (
        await db.refused(
          `INSERT INTO "user" ("name", "role", "monitor_number") VALUES ('Sam Grant', 'MONITOR', $1)`,
          [anas],
        )
      ).code,
    ).toBe(refusedBy.unique);
  });

  it('AC-02-04 is issued by the API alone: the worker and the read-only login may not ask for one', async () => {
    const { db } = tested;
    for (const login of ['adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect((await db.refused(`SELECT next_monitor_number()`)).code, login).toBe(refusedBy.grant);
      expect((await db.refused(`SELECT nextval('monitor_number_seq')`)).code, login).toBe(
        refusedBy.grant,
      );
    }
  });

  it("AC-02-04 is never the system actor's, and nor is an employer", async () => {
    const { db, world } = tested;
    // Only the owner may touch the system actor's row at all (ADR-276); the checks stop even it.
    await db.as('adms_owner');
    await db.actor(world.admin, 'BACK_OFFICE');
    for (const change of [
      `"monitor_number" = next_monitor_number()`,
      `"employer_id" = '${world.coastline}'`,
    ]) {
      expect(
        (await db.refused(`UPDATE "user" SET ${change} WHERE "id" = $1`, [systemActorId])).code,
        change,
      ).toBe(refusedBy.check);
    }
  });
});

describe("a worker's employer", () => {
  it('AC-02-03 is a contractor record, with the ID it gives them', async () => {
    const { db, world } = tested;
    await asTheApi();
    const agency = world.harbor;
    expect(
      await db.run(
        `UPDATE "user" SET "employer_id" = $2, "employer_number" = 'HS-0417' WHERE "id" = $1`,
        [world.monitor, agency],
      ),
    ).toBe(1);
    // Two people at one employer may hold the same employer ID: it's the employer's, not ours.
    expect(
      await db.run(
        `INSERT INTO "user" ("name", "role", "employer_id", "employer_number")
         VALUES ('Sam Grant', 'MONITOR', $1, 'HS-0417')`,
        [agency],
      ),
    ).toBe(1);
  });

  it('AC-02-03 is never typed text: an employer that is no contractor record is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      (
        await db.refused(`UPDATE "user" SET "employer_id" = uuidv7() WHERE "id" = $1`, [
          world.monitor,
        ])
      ).code,
    ).toBe(refusedBy.foreignKey);
    expect(
      (
        await db.refused(`UPDATE "user" SET "employer_id" = 'Harbor Staffing' WHERE "id" = $1`, [
          world.monitor,
        ])
      ).code,
    ).toBe(refusedBy.badValue);
  });

  it("AC-02-03 an employer's ID needs the employer", async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      (
        await db.refused(`UPDATE "user" SET "employer_number" = 'HS-0417' WHERE "id" = $1`, [
          world.monitor,
        ])
      ).code,
    ).toBe(refusedBy.check);
  });
});
