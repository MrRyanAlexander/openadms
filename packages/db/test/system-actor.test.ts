// The system actor's guard (ARCHITECTURE §5.3; invariant 3; ADR-276; BACKLOG carry-forward C4):
// only the worker (and the installer's seed, as the owner) writes as the system actor or with
// source SYSTEM; no runtime login changes its row; nobody else is ever role SYSTEM. The same as the
// services' own logins is in actor.test.ts.
import { describe, expect, it } from 'vitest';

import { systemActorId } from '../src/system-actor.ts';
import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

const newProject = `INSERT INTO "project" ("name", "time_zone")
  VALUES ('Bayline County ROW, Hurricane Delphine (2)', 'America/New_York') RETURNING "id"::text`;

async function auditedFor(recordId: string): Promise<{ actor: string; source: string }[]> {
  const { db } = tested;
  await db.administer();
  return db.rows(
    `SELECT "actor_id"::text AS actor, "source"::text AS source FROM "audit_record"
     WHERE "record_id" = $1 ORDER BY "id"`,
    [recordId],
  );
}

describe('only the worker and the seed write as the system actor', () => {
  it('the API is refused it on every write, and nothing is audited', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    for (const source of ['BACK_OFFICE', 'DEVICE', 'SYSTEM'] as const) {
      await db.actor(systemActorId, source);
      const attempts: [string, unknown[], string][] = [
        [newProject, [], 'project'],
        [`UPDATE "user" SET "name" = 'Ana B.' WHERE "id" = $1`, [world.monitor], 'user'],
        [
          `UPDATE "field_event" SET "load_call" = 70 WHERE "id" = $1`,
          [world.loads.l101001.disposal],
          'field_event',
        ],
      ];
      for (const [sql, values, table] of attempts) {
        expect(await db.refused(sql, values), `${source}: ${sql}`).toEqual({
          code: refusedBy.grant,
          message: `Only the worker writes as the system actor: adms_api may not state it (a write to ${table})`,
        });
      }
    }
    expect(await auditedFor(world.monitor)).toHaveLength(1);
    expect(await auditedFor(world.loads.l101001.disposal)).toHaveLength(1);
  });

  it('the API is refused source SYSTEM, even for a person', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'SYSTEM');
    expect(await db.refused(newProject)).toEqual({
      code: refusedBy.grant,
      message:
        'Only the worker writes with source SYSTEM: adms_api may not state it (a write to project)',
    });
  });

  it('the worker may, and so may the owner, as the seed does', async () => {
    const { db, world } = tested;
    const disposal = world.loads.l101001.disposal;
    await db.as('adms_worker');
    await db.actor(systemActorId, 'SYSTEM');
    await db.run(`UPDATE "field_event" SET "status" = 'COMPLETED' WHERE "id" = $1`, [disposal]);
    await db.as('adms_owner');
    await db.actor(systemActorId, 'SYSTEM');
    const { id } = await db.one<{ id: string }>(newProject);
    expect(await auditedFor(disposal)).toEqual([
      { actor: world.admin, source: 'BACK_OFFICE' },
      { actor: systemActorId, source: 'SYSTEM' },
    ]);
    expect(await auditedFor(id)).toEqual([{ actor: systemActorId, source: 'SYSTEM' }]);
  });

  it('the worker may still state a person, a reprocess a person asked for (ADR-276 leaves it open)', async () => {
    const { db, world } = tested;
    const disposal = world.loads.l101001.disposal;
    await db.as('adms_worker');
    await db.actor(world.admin, 'BACK_OFFICE', {
      reason: 'Reprocess after a load call correction',
    });
    await db.run(`UPDATE "field_event" SET "status" = 'COMPLETED' WHERE "id" = $1`, [disposal]);
    expect((await auditedFor(disposal)).at(-1)).toEqual({
      actor: world.admin,
      source: 'BACK_OFFICE',
    });
  });

  it("nobody else: the server's superuser is refused too", async () => {
    const { db } = tested;
    await db.administer();
    await db.actor(systemActorId, 'SYSTEM');
    expect(await db.refused(newProject)).toEqual({
      code: refusedBy.grant,
      message:
        'Only the worker writes as the system actor: postgres may not state it (a write to project)',
    });
  });

  it("the writing login is the session's own when no role is set", async () => {
    // The worker's and the API's paths through SET ROLE are above; the services' own logins are in
    // actor.test.ts. Here the other branch: no role set, so the session's login.
    const { db } = tested;
    await db.administer();
    expect(await db.one(`SELECT writing_login() AS login`)).toEqual({ login: 'postgres' });
  });
});

describe("the system actor's row", () => {
  it('no runtime login may change it', async () => {
    const { db, world } = tested;
    const changes = [
      `UPDATE "user" SET "name" = 'Open ADMS' WHERE "id" = $1`,
      `UPDATE "user" SET "role" = 'ADMIN' WHERE "id" = $1`,
      `UPDATE "user" SET "archived_at" = now() WHERE "id" = $1`,
      `UPDATE "user" SET "id" = uuidv7() WHERE "id" = $1`,
      `UPDATE "user" SET "monitor_number" = 'M004199' WHERE "id" = $1`,
      `UPDATE "user" SET "contractor_id" = '${world.coastline}' WHERE "id" = $1`,
    ];
    for (const sql of changes) {
      await db.as('adms_api');
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(await db.refused(sql, [systemActorId]), `adms_api: ${sql}`).toEqual({
        code: refusedBy.grant,
        message: "The system actor can't be changed: adms_api may not update it",
      });
      await db.as('adms_worker');
      await db.actor(systemActorId, 'SYSTEM');
      expect((await db.refused(sql, [systemActorId])).code, `adms_worker: ${sql}`).toBe(
        refusedBy.grant,
      );
      await db.administer();
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(await db.refused(sql, [systemActorId]), `superuser: ${sql}`).toEqual({
        code: refusedBy.grant,
        message: "The system actor can't be changed: postgres may not update it",
      });
    }
    // Only the seed's own record, as the installer made it.
    expect(await auditedFor(systemActorId)).toEqual([{ actor: systemActorId, source: 'SYSTEM' }]);
  });

  it('nobody but the seed makes a SYSTEM user, or takes its id', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    const message =
      "Only the installer's seed makes the system actor: adms_api may not write role SYSTEM or its id";
    const attempts: [string, unknown[]][] = [
      [`INSERT INTO "user" ("name", "role") VALUES ('Open ADMS (system) 2', 'SYSTEM')`, []],
      [
        `INSERT INTO "user" ("id", "name", "role") VALUES ($1, 'Dana Reyes 2', 'ADMIN')`,
        [systemActorId],
      ],
      [`UPDATE "user" SET "role" = 'SYSTEM' WHERE "id" = $1`, [world.monitor]],
    ];
    for (const [sql, values] of attempts) {
      expect(await db.refused(sql, values), sql).toEqual({ code: refusedBy.grant, message });
    }
  });

  it("the owner's migrations pass the trigger, never the check: SYSTEM is one id, never a person", async () => {
    const { db, world } = tested;
    await db.as('adms_owner');
    await db.actor(world.admin, 'BACK_OFFICE');
    const check = { code: refusedBy.check };
    expect(
      await db.refused(`INSERT INTO "user" ("name", "role") VALUES ('Second system', 'SYSTEM')`),
    ).toMatchObject(check);
    expect(
      await db.refused(`UPDATE "user" SET "role" = 'SYSTEM' WHERE "id" = $1`, [world.monitor]),
    ).toMatchObject(check);
    expect(
      await db.refused(`UPDATE "user" SET "monitor_number" = 'M004199' WHERE "id" = $1`, [
        systemActorId,
      ]),
    ).toMatchObject(check);
    expect(
      await db.refused(`UPDATE "user" SET "contractor_id" = $2 WHERE "id" = $1`, [
        systemActorId,
        world.coastline,
      ]),
    ).toMatchObject(check);
    expect(await db.rows(`SELECT "id"::text AS id FROM "user" WHERE "role" = 'SYSTEM'`)).toEqual([
      { id: systemActorId },
    ]);
  });
});
