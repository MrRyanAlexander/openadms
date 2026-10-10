// A setup version (task 2.5.3, part 3 of 5; ADR-453): a numbered version of a project's setup
// as its phones were shown it. spec/DATA-MODEL.md §4.5; spec/acceptance/02-people-and-devices.md
// AC-02-37, AC-02-43; spec/acceptance/05-sync.md AC-05-48; ARCHITECTURE §5.1…§5.3, §7's note,
// §9 (6); ADR-240, 440; REQ-203.
//
// These try the guards as each login, rolled back. The API making a version when a phone reads
// its lists is `apps/api/test/phone-lists.test.ts`.
import { describe, expect, it } from 'vitest';

import { deviceKeyActorId } from '../src/device-key-actor.ts';
import { refusedBy } from './support/database.ts';
import { insertOf } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

type Row = Record<string, unknown>;

// As the API's login, for a phone that is being sent its lists: the device key's actor (ADR-440).
async function forAPhone(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device });
}

// What P1's phones are shown, as far as a test needs: an object.
const shown = (fieldTags: string[] = []): string => JSON.stringify({ fieldTags, sites: [] });

function versionLike(version: number, more: Row = {}): Row {
  return { project_id: tested.world.p1, version, content: shown(), ...more };
}

async function add(row: Row): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf('setup_manifest', row))).id;
}

async function refusedRow(row: Row): Promise<{ code: string; message: string }> {
  return tested.db.refused(...insertOf('setup_manifest', row));
}

const versionsOf = async (projectId: string): Promise<number[]> =>
  (
    await tested.db.rows<{ version: number }>(
      `SELECT "version" FROM "setup_manifest" WHERE "project_id" = $1 ORDER BY "version"`,
      [projectId],
    )
  ).map((row) => row.version);

describe('a setup version', () => {
  it('names its project, its number and what the project’s phones were shown, and when it was made', async () => {
    const { db, world } = tested;
    expect(
      (
        await db.rows<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'setup_manifest' ORDER BY column_name`,
        )
      ).map((column) => column.column_name),
    ).toEqual(['built_at', 'content', 'id', 'project_id', 'version']);
    await forAPhone();
    const id = await add(versionLike(1, { content: shown(['Mixed']) }));
    expect(
      await db.one(
        `SELECT "project_id", "version", "content", "built_at" IS NOT NULL AS built
         FROM "setup_manifest" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({
      project_id: world.p1,
      version: 1,
      content: { fieldTags: ['Mixed'], sites: [] },
      built: true,
    });
  });

  it('AC-05-48 a project’s versions are numbered 1, 2, 3… with no gap: the first is 1, the next is one more, and no number is skipped, repeated or gone back to; each project has its own', async () => {
    const { world } = tested;
    await forAPhone();
    const first = "A project's setup versions are numbered 1, 2, 3…: its next is 1, not ";
    for (const version of [0, 2, -1]) {
      expect(await refusedRow(versionLike(version))).toEqual({
        code: refusedBy.trigger,
        message: `${first}${String(version)}`,
      });
    }
    await add(versionLike(1));
    for (const version of [1, 3]) {
      expect(await refusedRow(versionLike(version, { content: shown(['Mixed']) }))).toEqual({
        code: refusedBy.trigger,
        message: `A project's setup versions are numbered 1, 2, 3…: its next is 2, not ${String(version)}`,
      });
    }
    await add(versionLike(2, { content: shown(['Mixed']) }));
    // P2's are its own: its first is 1, whatever P1 has.
    await add(versionLike(1, { project_id: world.p2 }));
    expect([await versionsOf(world.p1), await versionsOf(world.p2)]).toEqual([[1, 2], [1]]);
  });

  it('a new version is made only when what the phones are shown has changed: the same again is refused, however its keys are ordered; what it was two versions ago may come back', async () => {
    await forAPhone();
    await add(versionLike(1));
    const unchanged = {
      code: refusedBy.trigger,
      message:
        "A new setup version is made only when what the project's phones are shown has changed",
    };
    expect(await refusedRow(versionLike(2))).toEqual(unchanged);
    expect(
      await refusedRow(versionLike(2, { content: JSON.stringify({ sites: [], fieldTags: [] }) })),
    ).toEqual(unchanged);
    await add(versionLike(2, { content: shown(['Mixed']) }));
    await add(versionLike(3));
    expect(await versionsOf(tested.world.p1)).toEqual([1, 2, 3]);
  });

  it('what a version holds is an object, and its project is a real one', async () => {
    await forAPhone();
    for (const content of ['[]', '"lists"', '7', 'null']) {
      expect((await refusedRow(versionLike(1, { content }))).code, content).toBe(refusedBy.check);
    }
    expect(
      (await refusedRow(versionLike(1, { project_id: '0199b6a0-0000-7000-8000-00000000dead' })))
        .code,
    ).toBe(refusedBy.foreignKey);
  });

  it('AC-02-37 it is made only for a phone that is sent its lists, stated by name: not by a person in the back office, not by the worker, and not for a phone left unsaid', async () => {
    const { db, world } = tested;
    const stateThePhone = {
      code: refusedBy.grant,
      message: 'A setup version is made when a phone is sent its lists: state the phone',
    };
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    expect(await refusedRow(versionLike(1))).toEqual(stateThePhone);
    // Naming a phone doesn't make a back-office write a phone's.
    await db.actor(world.admin, 'BACK_OFFICE', { deviceId: world.device });
    expect(await refusedRow(versionLike(1))).toEqual(stateThePhone);
    await db.actor(world.monitor, 'DEVICE');
    expect(await refusedRow(versionLike(1))).toEqual(stateThePhone);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await refusedRow(versionLike(1))).code).toBe(refusedBy.grant);
    await db.as('adms_readonly');
    expect((await refusedRow(versionLike(1))).code).toBe(refusedBy.grant);
    // A monitor signed in on the phone may be whose read made it: the phone is what is stated.
    await db.as('adms_api');
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    await add(versionLike(1));
    expect(await versionsOf(world.p1)).toEqual([1]);
  });

  it('it is audited as a record, by the device key’s actor on that phone, with what it holds', async () => {
    const { db, world } = tested;
    await forAPhone();
    const id = await add(versionLike(1, { content: shown(['Mixed']) }));
    expect(
      await db.rows(
        `SELECT "operation"::text, "domain"::text, "actor_id"::text AS actor, "source"::text,
                "device_id"::text AS device, "new_value" -> 'content' AS content
         FROM "audit_record" WHERE "table_name" = 'setup_manifest' AND "record_id" = $1`,
        [id],
      ),
    ).toEqual([
      {
        operation: 'INSERT',
        domain: 'RECORDS',
        actor: deviceKeyActorId,
        source: 'DEVICE',
        device: world.device,
        content: { fieldTags: ['Mixed'], sites: [] },
      },
    ]);
  });

  it('nobody changes one and nobody deletes one: not its content, its number, its project or when it was made; the worker and a read-only viewer read none', async () => {
    const { db } = tested;
    await forAPhone();
    const id = await add(versionLike(1));
    for (const set of [
      `"content" = '{"fieldTags":["Mixed"]}'`,
      `"version" = 5`,
      `"project_id" = '${tested.world.p2}'`,
      `"built_at" = now()`,
    ]) {
      for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
        await db.as(login);
        expect(
          (await db.refused(`UPDATE "setup_manifest" SET ${set} WHERE "id" = $1`, [id])).code,
          `${login}: ${set}`,
        ).toBe(refusedBy.grant);
      }
      await db.as('adms_owner');
      expect(
        (await db.refused(`UPDATE "setup_manifest" SET ${set} WHERE "id" = $1`, [id])).code,
        `adms_owner: ${set}`,
      ).toBe(refusedBy.trigger);
    }
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect(
        (await db.refused(`DELETE FROM "setup_manifest" WHERE "id" = $1`, [id])).code,
        login,
      ).toBe(refusedBy.grant);
    }
    await db.as('adms_owner');
    expect((await db.refused(`DELETE FROM "setup_manifest" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.trigger,
    );
    expect((await db.refused(`TRUNCATE "setup_manifest"`)).code).toBe(refusedBy.trigger);
    for (const login of ['adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect((await db.refused(`SELECT "id" FROM "setup_manifest"`)).code, login).toBe(
        refusedBy.grant,
      );
    }
    await db.as('adms_api');
    expect(await versionsOf(tested.world.p1)).toEqual([1]);
  });
});
