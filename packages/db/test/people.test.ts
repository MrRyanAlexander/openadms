// Part 2, sections A and B at the database (spec/acceptance/02-people-and-devices.md): a person
// is one firm-wide record with their contact; a manager/analyst's permissions, each its own grant
// (spec/DATA-MODEL.md §2.2; ADR-050, 105, 315). Sign-in, and what a permission lets a person do,
// are the API's (Phase 2). The Monitor ID and the employer: monitor-id.test.ts.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

// Adds a row as whoever the test is acting as; its id.
async function add(table: string, row: Record<string, unknown>): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf(table, row))).id;
}

const enumValues = async (name: string): Promise<string[]> =>
  (
    await tested.db.rows<{ value: string }>(
      `SELECT enumlabel AS value FROM pg_enum WHERE enumtypid = $1::regtype ORDER BY enumsortorder`,
      [name],
    )
  ).map((row) => row.value);

const granted = ['CORRECT', 'RENUMBER', 'VOID', 'ACCEPT_FLAG', 'QC', 'LOCK_INVOICED'];

describe('a person', () => {
  it('AC-02-05 belongs to the firm, never to a project: Ana Brooks on P1 and P2 is one record', async () => {
    const { db, world } = tested;
    const columns = await db.rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'user' ORDER BY column_name`,
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      'archived_at',
      'contractor_id',
      'created_at',
      'email',
      'employer_id',
      'employer_number',
      'id',
      'monitor_number',
      'name',
      'phone',
      'role',
      'viewer_kind',
    ]);
    const days = await db.rows<{ project_id: string; person_id: string }>(
      `SELECT "project_id"::text, "person_id"::text FROM "assignment" WHERE "id" = ANY($1)`,
      [[world.assignments.p1, world.assignments.p2]],
    );
    expect(new Set(days.map((day) => day.project_id))).toEqual(new Set([world.p1, world.p2]));
    expect(new Set(days.map((day) => day.person_id))).toEqual(new Set([world.monitor]));
  });

  it('AC-02-06 holds a name, a role of the fixed set, and a contact email and phone, each optional', async () => {
    const { db } = tested;
    expect(await enumValues('user_role')).toEqual([
      'ADMIN',
      'MANAGER_ANALYST',
      'MONITOR',
      'READ_ONLY_VIEWER',
      'SYSTEM',
    ]);
    await asTheApi();
    const luis = await add('user', {
      name: 'Luis Ortega',
      role: 'MANAGER_ANALYST',
      email: 'luis.ortega@gates.example',
      phone: '555-0121',
    });
    const lee = await add('user', { name: 'Lee Morgan', role: 'MONITOR' });
    expect(
      await db.rows(`SELECT "name", "email", "phone" FROM "user" WHERE "id" = ANY($1) ORDER BY 1`, [
        [luis, lee],
      ]),
    ).toEqual([
      { name: 'Lee Morgan', email: null, phone: null },
      { name: 'Luis Ortega', email: 'luis.ortega@gates.example', phone: '555-0121' },
    ]);
    expect((await db.refused(...insertOf('user', { role: 'MONITOR' }))).code).toBe(
      refusedBy.notNull,
    );
    expect((await db.refused(...insertOf('user', { name: 'Sam Grant' }))).code).toBe(
      refusedBy.notNull,
    );
    expect(
      (await db.refused(...insertOf('user', { name: 'Sam Grant', role: 'SUPERVISOR' }))).code,
    ).toBe(refusedBy.badValue);
  });

  it('AC-02-09 who left is archived: their records still name them, and no login deletes them', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      await db.run(`UPDATE "user" SET "archived_at" = '2026-10-16T21:00:00Z' WHERE "id" = $1`, [
        world.monitor,
      ]),
    ).toBe(1);
    const still = await db.one<{ events: number; days: number }>(
      `SELECT (SELECT count(*)::int FROM "field_event" WHERE "monitor_id" = $1) AS events,
         (SELECT count(*)::int FROM "assignment" WHERE "person_id" = $1) AS days`,
      [world.monitor],
    );
    expect(still).toEqual({ events: 6, days: 2 });
    const audited = await db.one<{ actor_id: string; changed_fields: string[] }>(
      `SELECT "actor_id"::text, "changed_fields" FROM "audit_record"
       WHERE "table_name" = 'user' AND "record_id" = $1 AND "operation" = 'UPDATE'`,
      [world.monitor],
    );
    expect(audited).toEqual({ actor_id: world.admin, changed_fields: ['archived_at'] });
    const remove = `DELETE FROM "user" WHERE "id" = $1`;
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect((await db.refused(remove, [world.monitor])).code, login).toBe(refusedBy.grant);
    }
    for (const who of ['adms_owner', 'administrator'] as const) {
      if (who === 'administrator') await db.administer();
      else await db.as(who);
      expect(await db.refused(remove, [world.monitor]), who).toEqual({
        code: refusedBy.trigger,
        message: 'Open ADMS never deletes a user row: archive, close or void it instead',
      });
    }
  });
});

describe("a manager/analyst's permissions", () => {
  async function luisWith(permissions: readonly string[]): Promise<string> {
    const luis = await add('user', { name: 'Luis Ortega', role: 'MANAGER_ANALYST' });
    for (const permission of permissions) {
      await add('user_permission', { user_id: luis, permission });
    }
    return luis;
  }

  it('AC-02-10 are each their own grant, audited with Dana as the actor; the same one twice is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    const luis = await luisWith(granted);
    const kept = await db.rows<{ permission: string; id: string }>(
      `SELECT "permission"::text, "id"::text FROM "user_permission" WHERE "user_id" = $1 ORDER BY "id"`,
      [luis],
    );
    expect(kept.map((grant) => grant.permission)).toEqual(granted);
    const audited = await db.rows<{ permission: string; actor_id: string; domain: string }>(
      `SELECT "new_value" ->> 'permission' AS permission, "actor_id"::text, "domain"::text
       FROM "audit_record" WHERE "table_name" = 'user_permission' AND "record_id" = ANY($1)
       ORDER BY "id"`,
      [kept.map((grant) => grant.id)],
    );
    expect(audited).toEqual(
      granted.map((permission) => ({ permission, actor_id: world.admin, domain: 'SECURITY' })),
    );
    const again = await db.refused(
      ...insertOf('user_permission', { user_id: luis, permission: 'VOID' }),
    );
    expect(again.code).toBe(refusedBy.unique);
    expect(again.message).toContain('"user_permission_user_id_permission_key"');
  });

  it('AC-02-10 one is taken away by archiving and given back by clearing it, never deleted and never a second row', async () => {
    const { db, world } = tested;
    await asTheApi();
    const luis = await luisWith(['VOID']);
    const take = `UPDATE "user_permission" SET "archived_at" = $2 WHERE "user_id" = $1 AND "permission" = 'VOID'`;
    expect(await db.run(take, [luis, '2026-10-14T15:00:00Z'])).toBe(1);
    // Still the one row: giving it back is clearing the archive.
    expect(
      (await db.refused(...insertOf('user_permission', { user_id: luis, permission: 'VOID' })))
        .code,
    ).toBe(refusedBy.unique);
    expect(await db.run(take, [luis, null])).toBe(1);
    const history = await db.rows<{ operation: string; archived: boolean; actor_id: string }>(
      `SELECT a."operation"::text, a."new_value" ->> 'archived_at' IS NOT NULL AS archived,
         a."actor_id"::text
       FROM "audit_record" a JOIN "user_permission" p ON p."id"::text = a."record_id"
       WHERE a."table_name" = 'user_permission' AND p."user_id" = $1 ORDER BY a."id"`,
      [luis],
    );
    expect(history).toEqual([
      { operation: 'INSERT', archived: false, actor_id: world.admin },
      { operation: 'UPDATE', archived: true, actor_id: world.admin },
      { operation: 'UPDATE', archived: false, actor_id: world.admin },
    ]);
    const remove = `DELETE FROM "user_permission" WHERE "user_id" = $1`;
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect((await db.refused(remove, [luis])).code, login).toBe(refusedBy.grant);
    }
    await db.as('adms_owner');
    expect(await db.refused(remove, [luis])).toEqual({
      code: refusedBy.trigger,
      message: 'Open ADMS never deletes a user_permission row: archive, close or void it instead',
    });
  });

  it('AC-02-11 are one closed set, fixed in code; an admin holds none', async () => {
    const { db, world } = tested;
    expect(await enumValues('permission')).toEqual([
      'CORRECT',
      'RENUMBER',
      'VOID',
      'ACCEPT_FLAG',
      'QC',
      'LOCK_INVOICED',
      'UNLOCK_INVOICED',
      'APPROVE_HOURS',
      'SETUP',
      'DISPATCH',
    ]);
    await asTheApi();
    const luis = await luisWith([]);
    expect(
      (await db.refused(...insertOf('user_permission', { user_id: luis, permission: 'DELETE' })))
        .code,
    ).toBe(refusedBy.badValue);
    expect((await db.refused(...insertOf('user_permission', { user_id: luis }))).code).toBe(
      refusedBy.notNull,
    );
    expect(
      await db.rows(`SELECT 1 FROM "user_permission" WHERE "user_id" = $1`, [world.admin]),
    ).toEqual([]);
  });

  it('are for a person, never the system actor; a grant names a person on record', async () => {
    const { db, world } = tested;
    await asTheApi();
    const system = await db.refused(
      ...insertOf('user_permission', { user_id: world.worker, permission: 'VOID' }),
    );
    expect(system.code).toBe(refusedBy.check);
    expect(system.message).toContain('"user_permission_system_actor_check"');
    const nobody = await db.refused(
      ...insertOf('user_permission', { user_id: world.p1, permission: 'VOID' }),
    );
    expect(nobody.code).toBe(refusedBy.foreignKey);
  });

  it('are written by the API alone: the worker reads them, the read-only login reads none', async () => {
    const { db, world } = tested;
    await asTheApi();
    const luis = await luisWith(['QC']);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      await db.rows(`SELECT "permission"::text FROM "user_permission" WHERE "user_id" = $1`, [
        luis,
      ]),
    ).toEqual([{ permission: 'QC' }]);
    expect(
      (await db.refused(...insertOf('user_permission', { user_id: luis, permission: 'VOID' })))
        .code,
    ).toBe(refusedBy.grant);
    expect(
      (
        await db.refused(
          `UPDATE "user_permission" SET "archived_at" = now() WHERE "user_id" = $1`,
          [luis],
        )
      ).code,
    ).toBe(refusedBy.grant);
    await db.as('adms_readonly');
    expect((await db.refused(`SELECT 1 FROM "user_permission"`)).code).toBe(refusedBy.grant);
  });
});
