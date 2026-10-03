// REQ-105b, 105c, 105d, 105f, 105j, and REQ-105k's source: the client, the declaration event and
// the project in full (spec/DATA-MODEL.md §2.1, §3 "The project"; ADR-023, 026, 041, 127, 137, 148,
// 164, 203, 241, 303). Section A of spec/acceptance/01-setup.md, proven at the database:
// AC-01-02…05, 08, 12…14, and AC-01-78 for these tables. What a new project's settings start as
// (AC-01-06, AC-01-11) is packages/domain's rule and test; here, that the database holds what it is
// given and gives no setting a default of its own. The time zone (AC-01-07) is time.test.ts.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf, projectLike, without } from './support/example-world.ts';
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

// A value of one of the firm's lists, by the name it ships with: its id.
async function picked(list: string, name: string): Promise<string> {
  return (
    await tested.db.one<{ id: string }>(`SELECT "id"::text FROM "${list}" WHERE "name" = $1`, [
      name,
    ])
  ).id;
}

interface Audited {
  operation: string;
  changed: string[];
  prior: Record<string, unknown> | null;
  actor: string;
  source: string;
  domain: string;
}

async function auditOf(recordId: string): Promise<Audited[]> {
  return tested.db.rows<Audited>(
    `SELECT "operation"::text, "changed_fields" AS changed, "prior_value" AS prior,
       "actor_id"::text AS actor, "source"::text, "domain"::text
     FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
    [recordId],
  );
}

// A project's settings as the database holds them, the dates as written.
async function settingsOf(projectId: string): Promise<Record<string, unknown>> {
  return tested.db.one(
    `SELECT "allow_split_loads", "time_zone", "active_from"::text, "active_to"::text,
       "ticket_number_source"::text, "workflows"::text[], "load_call_low_limit",
       "load_call_high_limit", "stump_fill_depth_inches", "stump_check_root_ball_wider",
       "stump_check_fill_needs_exposure", "site_circle_meters", "time_clock_enabled"
     FROM "project" WHERE "id" = $1`,
    [projectId],
  );
}

async function kindsOf(projectId: string, where = 'TRUE'): Promise<string[]> {
  const rows = await tested.db.rows<{ name: string }>(
    `SELECT k."name" FROM "project_kind_of_work" p
       JOIN "kind_of_work" k ON k."id" = p."kind_of_work_id"
     WHERE p."project_id" = $1 AND ${where} ORDER BY k."position"`,
    [projectId],
  );
  return rows.map((row) => row.name);
}

describe('a client', () => {
  it('AC-01-02 keeps its record when its contact phone changes: the new value saved, one audit record with the prior value and Dana as actor', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      await db.run(`UPDATE "client" SET "contact_phone" = '555-0142' WHERE "id" = $1`, [
        world.client,
      ]),
    ).toBe(1);
    expect(
      await db.rows(`SELECT "id"::text, "name", "contact_phone" FROM "client" WHERE "name" = $1`, [
        'Bayline County',
      ]),
    ).toEqual([{ id: world.client, name: 'Bayline County', contact_phone: '555-0142' }]);
    const records = await auditOf(world.client);
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      operation: 'UPDATE',
      changed: ['contact_phone'],
      prior: { name: 'Bayline County', contact_phone: '555-0100' },
      actor: world.admin,
      source: 'BACK_OFFICE',
      domain: 'OPERATIONS',
    });
  });

  it('REQ-105b is reused across disasters: a second declaration event’s project points at the same client record', async () => {
    const { db, world } = tested;
    await asTheApi();
    const next = await add('declaration_event', {
      name: 'Tropical Storm Calder',
      reference: 'BC-EM-2027-01',
      reference_type_id: await picked('declaration_reference_type', 'Local'),
    });
    await add(
      'project',
      projectLike(world, {
        name: 'Bayline County ROW, Tropical Storm Calder',
        declaration_event_id: next,
        active_from: '2027-06-01',
        active_to: null,
      }),
    );
    expect(
      await db.rows(`SELECT "id"::text FROM "client" WHERE "name" = 'Bayline County'`),
    ).toEqual([{ id: world.client }]);
    const under = await db.rows<{ event: string }>(
      `SELECT DISTINCT d."name" AS event FROM "project" p
         JOIN "declaration_event" d ON d."id" = p."declaration_event_id"
       WHERE p."client_id" = $1 ORDER BY 1`,
      [world.client],
    );
    expect(under.map((row) => row.event)).toEqual(['Hurricane Delphine', 'Tropical Storm Calder']);
  });

  it('needs its name; its contact and notes are optional', async () => {
    const { db } = tested;
    await asTheApi();
    expect((await db.refused(...insertOf('client', { name: null }))).code).toBe(refusedBy.notNull);
    const id = await add('client', { name: 'Town of Egret Point' });
    expect(
      await db.one(
        `SELECT "contact_name", "contact_email", "contact_phone", "notes", "archived_at"
         FROM "client" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      notes: null,
      archived_at: null,
    });
  });
});

describe('a declaration event', () => {
  it('AC-01-03 Hurricane Delphine, DR-9001-FL, is one record: P1, P2 and the Town of Egret Point’s project all point at it, and "every project under this declaration" finds all three across both clients', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      await db.rows(
        `SELECT d."name", d."reference", t."name" AS reference_type FROM "declaration_event" d
           JOIN "declaration_reference_type" t ON t."id" = d."reference_type_id"
         WHERE d."id" = $1`,
        [world.declarationEvent],
      ),
    ).toEqual([
      { name: 'Hurricane Delphine', reference: 'DR-9001-FL', reference_type: 'FEMA disaster (DR)' },
    ]);
    const egretPoint = await add('client', { name: 'Town of Egret Point' });
    await add(
      'project',
      projectLike(world, { name: 'Egret Point ROW, Hurricane Delphine', client_id: egretPoint }),
    );
    const under = await db.rows<{ project: string; client: string }>(
      `SELECT p."name" AS project, c."name" AS client FROM "project" p
         JOIN "client" c ON c."id" = p."client_id"
       WHERE p."declaration_event_id" = $1 ORDER BY p."created_at", p."name"`,
      [world.declarationEvent],
    );
    expect(under).toEqual([
      { project: 'Bayline County PPDR, Hurricane Delphine', client: 'Bayline County' },
      { project: 'Bayline County ROW, Hurricane Delphine', client: 'Bayline County' },
      { project: 'Egret Point ROW, Hurricane Delphine', client: 'Town of Egret Point' },
    ]);
    expect(
      await db.rows(`SELECT 1 FROM "declaration_event" WHERE "reference" = 'DR-9001-FL'`),
    ).toHaveLength(1);
  });

  it('AC-01-04 a local emergency is saved with its reference as the county wrote it and the reference type "Local", picked from the firm’s list', async () => {
    const { db } = tested;
    await asTheApi();
    const id = await add('declaration_event', {
      name: 'Bayline County flooding, March 2026',
      reference: 'Res. 2026-17 (Bayline Co.)',
      reference_type_id: await picked('declaration_reference_type', 'Local'),
    });
    expect(
      await db.one(
        `SELECT d."reference", t."name" AS reference_type FROM "declaration_event" d
           JOIN "declaration_reference_type" t ON t."id" = d."reference_type_id"
         WHERE d."id" = $1`,
        [id],
      ),
    ).toEqual({ reference: 'Res. 2026-17 (Bayline Co.)', reference_type: 'Local' });
  });

  it('AC-01-04 its reference type is never typed: none, a typed word or a value that isn’t on the list is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    const local = { name: 'Bayline County flooding, March 2026', reference: 'Res. 2026-17' };
    const none = await db.refused(...insertOf('declaration_event', local));
    expect(none.code).toBe(refusedBy.notNull);
    const typed = await db.refused(
      ...insertOf('declaration_event', { ...local, reference_type_id: 'Local' }),
    );
    expect(typed.code).toBe(refusedBy.badValue);
    const unknown = await db.refused(
      ...insertOf('declaration_event', { ...local, reference_type_id: world.p1 }),
    );
    expect(unknown.code).toBe(refusedBy.foreignKey);
    expect(
      (
        await db.one<{ type: string }>(
          `SELECT data_type AS type FROM information_schema.columns
           WHERE table_name = 'declaration_event' AND column_name = 'reference'`,
        )
      ).type,
    ).toBe('text');
  });

  it('needs its name and its reference', async () => {
    const { db } = tested;
    await asTheApi();
    const whole = {
      name: 'Bayline County flooding, March 2026',
      reference: 'Res. 2026-17',
      reference_type_id: await picked('declaration_reference_type', 'Local'),
    };
    for (const column of ['name', 'reference'] as const) {
      expect(
        (await db.refused(...insertOf('declaration_event', { ...whole, [column]: null }))).code,
        column,
      ).toBe(refusedBy.notNull);
    }
  });
});

describe('a project', () => {
  it('AC-01-05 ROW work and PPDR work for one client under one declaration event are two projects, each with its own program type', async () => {
    const rows = await tested.db.rows(
      `SELECT p."name", t."name" AS program_type, t."requires_roe", c."name" AS client,
         d."reference" AS declaration
       FROM "project" p JOIN "program_type" t ON t."id" = p."program_type_id"
         JOIN "client" c ON c."id" = p."client_id"
         JOIN "declaration_event" d ON d."id" = p."declaration_event_id"
       WHERE p."id" = ANY($1) ORDER BY p."name"`,
      [[tested.world.p1, tested.world.p2]],
    );
    const shared = { client: 'Bayline County', declaration: 'DR-9001-FL' };
    expect(rows).toEqual([
      {
        name: 'Bayline County PPDR, Hurricane Delphine',
        program_type: 'PPDR',
        requires_roe: true,
        ...shared,
      },
      {
        name: 'Bayline County ROW, Hurricane Delphine',
        program_type: 'ROW',
        requires_roe: false,
        ...shared,
      },
    ]);
  });

  it('AC-01-05 has no funder field to put both on one: its columns, exactly', async () => {
    const columns = await tested.db.rows<{ column: string }>(
      `SELECT column_name AS column FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'project' ORDER BY ordinal_position`,
    );
    expect(columns.map((row) => row.column).sort()).toEqual(
      [
        'id',
        'name',
        'client_id',
        'declaration_event_id',
        'program_type_id',
        'allow_split_loads',
        'time_zone',
        'active_from',
        'active_to',
        'ticket_number_source',
        'workflows',
        'load_call_low_limit',
        'load_call_high_limit',
        'stump_fill_depth_inches',
        'stump_check_root_ball_wider',
        'stump_check_fill_needs_exposure',
        'site_circle_meters',
        'time_clock_enabled',
        'created_at',
        'closed_at',
      ].sort(),
    );
  });

  it.each([
    ['client_id', 'client'],
    ['declaration_event_id', 'declaration event'],
    ['program_type_id', 'program type'],
  ])(
    'REQ-105b its %s names a record that exists: none, or one that doesn’t, is refused (%s)',
    async (column) => {
      const { db, world } = tested;
      await asTheApi();
      const none = await db.refused(...insertOf('project', projectLike(world, { [column]: null })));
      expect(none.code).toBe(refusedBy.notNull);
      const unknown = await db.refused(
        ...insertOf('project', projectLike(world, { [column]: world.monitor })),
      );
      expect(unknown.code).toBe(refusedBy.foreignKey);
    },
  );

  it('REQ-105d its program type is picked from the firm’s list, the firm’s own values included', async () => {
    const { db, world } = tested;
    await asTheApi();
    const marine = await add('program_type', {
      name: 'MARINE',
      position: 5,
      requires_roe: false,
    });
    const id = await add('project', projectLike(world, { program_type_id: marine }));
    expect(
      await db.one(
        `SELECT t."name" FROM "project" p JOIN "program_type" t ON t."id" = p."program_type_id"
         WHERE p."id" = $1`,
        [id],
      ),
    ).toEqual({ name: 'MARINE' });
  });

  it('AC-01-06 Allow split loads is the firm’s to change either way, audited: P1, a ROW project, has it ticked', async () => {
    const { db, world } = tested;
    expect([
      (await settingsOf(world.p1))['allow_split_loads'],
      (await settingsOf(world.p2))['allow_split_loads'],
    ]).toEqual([true, true]);
    await asTheApi();
    await db.run(`UPDATE "project" SET "allow_split_loads" = false WHERE "id" = $1`, [world.p1]);
    expect((await settingsOf(world.p1))['allow_split_loads']).toBe(false);
    expect((await auditOf(world.p1)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['allow_split_loads'],
      prior: { allow_split_loads: true },
      actor: world.admin,
    });
  });

  it('AC-01-08 its active window is saved: 12 October 2026 → 31 January 2027; the end may be left empty; either date changed later, audited', async () => {
    const { db, world } = tested;
    expect(await settingsOf(world.p1)).toMatchObject({
      active_from: '2026-10-12',
      active_to: '2027-01-31',
    });
    await asTheApi();
    const open = await add('project', projectLike(world, { active_to: null }));
    expect(await settingsOf(open)).toMatchObject({ active_from: '2026-10-12', active_to: null });

    await db.run(`UPDATE "project" SET "active_to" = '2027-02-28' WHERE "id" = $1`, [world.p1]);
    await db.run(`UPDATE "project" SET "active_from" = '2026-10-10' WHERE "id" = $1`, [world.p1]);
    await db.run(`UPDATE "project" SET "active_to" = NULL WHERE "id" = $1`, [world.p1]);
    expect(await settingsOf(world.p1)).toMatchObject({
      active_from: '2026-10-10',
      active_to: null,
    });
    const dana = { operation: 'UPDATE', actor: world.admin, source: 'BACK_OFFICE' };
    expect((await auditOf(world.p1)).slice(1)).toMatchObject([
      { ...dana, changed: ['active_to'], prior: { active_to: '2027-01-31' } },
      { ...dana, changed: ['active_from'], prior: { active_from: '2026-10-12' } },
      { ...dana, changed: ['active_to'], prior: { active_to: '2027-02-28' } },
    ]);
  });

  it('AC-01-08 its window needs its start, and never ends before it starts', async () => {
    const { db, world } = tested;
    await asTheApi();
    const noStart = await db.refused(
      ...insertOf('project', projectLike(world, { active_from: null })),
    );
    expect(noStart.code).toBe(refusedBy.notNull);
    const backwards = await db.refused(
      `UPDATE "project" SET "active_to" = '2026-10-11' WHERE "id" = $1`,
      [world.p1],
    );
    expect(backwards.code).toBe(refusedBy.check);
    expect(backwards.message).toContain('"project_active_window_check"');
    // One day is a window.
    await db.run(`UPDATE "project" SET "active_to" = '2026-10-12' WHERE "id" = $1`, [world.p1]);
  });

  it('AC-01-08 nothing here refuses a ticket outside the window: a collection in March 2027 is received on P1', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    expect(
      await db.run(
        `INSERT INTO "field_event" ("id", "project_id", "workflow", "kind", "ticket_number",
           "monitor_id", "device_id", "assignment_id", "setup_version", "started_at", "ended_at",
           "device_utc_offset_minutes")
         VALUES (uuidv7(), $1, 'LOAD', 'COLLECTION', '101090', $2, $3, $4, 1,
           '2027-03-02T09:00:00-05:00', '2027-03-02T09:25:00-05:00', -300)`,
        [world.p1, world.monitor, world.device, world.assignments.p1],
      ),
    ).toBe(1);
  });

  it('REQ-105k its ticket-number source is one of two, control tickets or generated; P1 is generated', async () => {
    const { db, world } = tested;
    expect((await settingsOf(world.p1))['ticket_number_source']).toBe('GENERATED');
    await asTheApi();
    const control = await add('project', projectLike(world, { ticket_number_source: 'CONTROL' }));
    expect((await settingsOf(control))['ticket_number_source']).toBe('CONTROL');
    const other = await db.refused(
      ...insertOf('project', projectLike(world, { ticket_number_source: 'TYPED' })),
    );
    expect(other.code).toBe(refusedBy.badValue);
    const none = await db.refused(
      ...insertOf('project', projectLike(world, { ticket_number_source: null })),
    );
    expect(none.code).toBe(refusedBy.notNull);
  });

  it('AC-01-11 holds the settings it was created with: P1’s are the built-in ones', async () => {
    expect(await settingsOf(tested.world.p1)).toEqual({
      allow_split_loads: true,
      time_zone: 'America/New_York',
      active_from: '2026-10-12',
      active_to: '2027-01-31',
      ticket_number_source: 'GENERATED',
      workflows: ['LOAD', 'HAUL_OUT', 'UNIT_RATE'],
      load_call_low_limit: 5,
      load_call_high_limit: 95,
      stump_fill_depth_inches: 31,
      stump_check_root_ball_wider: true,
      stump_check_fill_needs_exposure: true,
      site_circle_meters: 200,
      time_clock_enabled: false,
    });
  });

  it('AC-01-11 no setting has a default in the database, so no number is written there: only the id and the created time have one', async () => {
    const defaults = await tested.db.rows<{ column: string }>(
      `SELECT column_name AS column FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'project' AND column_default IS NOT NULL
       ORDER BY column_name`,
    );
    expect(defaults.map((row) => row.column)).toEqual(['created_at', 'id']);
  });

  it.each([
    'allow_split_loads',
    'stump_fill_depth_inches',
    'stump_check_root_ball_wider',
    'stump_check_fill_needs_exposure',
    'site_circle_meters',
    'time_clock_enabled',
  ])(
    'AC-01-11 a project written without its %s is refused: whoever creates it says what it starts as',
    async (column) => {
      const { db, world } = tested;
      await asTheApi();
      const refusal = await db.refused(...insertOf('project', without(projectLike(world), column)));
      expect(refusal.code).toBe(refusedBy.notNull);
      expect(refusal.message).toContain(`"${column}"`);
    },
  );

  it('AC-01-12 its load-call limits change to 10 and 90, or are cleared to switch them off, saved and audited', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(
      `UPDATE "project" SET "load_call_low_limit" = 10, "load_call_high_limit" = 90 WHERE "id" = $1`,
      [world.p1],
    );
    expect(await settingsOf(world.p1)).toMatchObject({
      load_call_low_limit: 10,
      load_call_high_limit: 90,
    });
    await db.run(
      `UPDATE "project" SET "load_call_low_limit" = NULL, "load_call_high_limit" = NULL WHERE "id" = $1`,
      [world.p1],
    );
    expect(await settingsOf(world.p1)).toMatchObject({
      load_call_low_limit: null,
      load_call_high_limit: null,
    });
    const dana = { operation: 'UPDATE', actor: world.admin, source: 'BACK_OFFICE' };
    const limits = ['load_call_high_limit', 'load_call_low_limit'];
    expect((await auditOf(world.p1)).slice(1)).toMatchObject([
      { ...dana, changed: limits, prior: { load_call_low_limit: 5, load_call_high_limit: 95 } },
      { ...dana, changed: limits, prior: { load_call_low_limit: 10, load_call_high_limit: 90 } },
    ]);
    // Other projects keep their own.
    expect(await settingsOf(world.p2)).toMatchObject({
      load_call_low_limit: 5,
      load_call_high_limit: 95,
    });
  });

  it.each(['load_call_low_limit', 'load_call_high_limit'])(
    'AC-01-12 its %s is a load call’s own range, 0 to 100, or empty',
    async (column) => {
      const { db, world } = tested;
      await asTheApi();
      const change = `UPDATE "project" SET "${column}" = $2 WHERE "id" = $1`;
      for (const limit of [-1, 101]) {
        const refusal = await db.refused(change, [world.p1, limit]);
        expect(refusal.code, String(limit)).toBe(refusedBy.check);
        expect(refusal.message).toContain('"project_load_call_limits_check"');
      }
      for (const limit of [0, 100, null]) {
        expect(await db.run(change, [world.p1, limit]), String(limit)).toBe(1);
      }
    },
  );

  it('its stump fill depth, its stump checks, its site circle and its time clock are its own to change, audited', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(
      `UPDATE "project" SET "stump_fill_depth_inches" = 36, "stump_check_root_ball_wider" = false,
         "stump_check_fill_needs_exposure" = false, "site_circle_meters" = 300,
         "time_clock_enabled" = true
       WHERE "id" = $1`,
      [world.p1],
    );
    expect((await auditOf(world.p1)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: [
        'site_circle_meters',
        'stump_check_fill_needs_exposure',
        'stump_check_root_ball_wider',
        'stump_fill_depth_inches',
        'time_clock_enabled',
      ],
      prior: {
        stump_fill_depth_inches: 31,
        stump_check_root_ball_wider: true,
        stump_check_fill_needs_exposure: true,
        site_circle_meters: 200,
        time_clock_enabled: false,
      },
      actor: world.admin,
    });
    expect(await settingsOf(world.p2)).toMatchObject({
      stump_fill_depth_inches: 31,
      site_circle_meters: 200,
      time_clock_enabled: false,
    });
  });

  it.each([
    ['stump_fill_depth_inches', 'project_stump_fill_depth_check'],
    ['site_circle_meters', 'project_site_circle_check'],
  ])('its %s is a size: at least one', async (column, check) => {
    const { db, world } = tested;
    await asTheApi();
    const change = `UPDATE "project" SET "${column}" = $2 WHERE "id" = $1`;
    for (const size of [0, -31]) {
      const refusal = await db.refused(change, [world.p1, size]);
      expect(refusal.code, String(size)).toBe(refusedBy.check);
      expect(refusal.message).toContain(`"${check}"`);
    }
    expect(await db.run(change, [world.p1, 1])).toBe(1);
  });

  it('AC-01-13 says which ticket types it allows: P1 load, haul-out and unit rate; P2 loads only', async () => {
    const { db, world } = tested;
    expect([
      (await settingsOf(world.p1))['workflows'],
      (await settingsOf(world.p2))['workflows'],
    ]).toEqual([['LOAD', 'HAUL_OUT', 'UNIT_RATE'], ['LOAD']]);
    await asTheApi();
    await db.run(`UPDATE "project" SET "workflows" = '{LOAD,UNIT_RATE}' WHERE "id" = $1`, [
      world.p2,
    ]);
    expect((await auditOf(world.p2)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['workflows'],
      prior: { workflows: ['LOAD'] },
    });
  });

  it('AC-01-13 a ticket type is one of the three; the list may be empty, never missing', async () => {
    const { db, world } = tested;
    await asTheApi();
    const other = await db.refused(
      ...insertOf('project', projectLike(world, { workflows: '{LOAD,CITIZEN_DROP_OFF}' })),
    );
    expect(other.code).toBe(refusedBy.badValue);
    for (const row of [
      without(projectLike(world), 'workflows'),
      projectLike(world, { workflows: null }),
    ]) {
      const missing = await db.refused(...insertOf('project', row));
      expect(missing.code).toBe(refusedBy.check);
      expect(missing.message).toContain('"project_workflows_check"');
    }
    expect(await db.run(...insertOf('project', projectLike(world, { workflows: '{}' })))).toBe(1);
  });

  it('AC-01-13 says which kinds of unit rate work it allows: P1 Hangers, Leaners, Stumps, White Goods and Crew time; P2 none', async () => {
    const { world } = tested;
    expect(await kindsOf(world.p1)).toEqual([
      'Hangers',
      'Leaners',
      'Stumps',
      'White Goods',
      'Crew time',
    ]);
    expect(await kindsOf(world.p2)).toEqual([]);
  });

  it('AC-01-13 a kind of unit rate work is on a project once, picked from the firm’s list; taken off by archiving and put back, audited', async () => {
    const { db, world } = tested;
    await asTheApi();
    const hangers = await picked('kind_of_work', 'Hangers');
    const twice = await db.refused(
      ...insertOf('project_kind_of_work', { project_id: world.p1, kind_of_work_id: hangers }),
    );
    expect(twice.code).toBe(refusedBy.unique);
    const unknown = await db.refused(
      ...insertOf('project_kind_of_work', { project_id: world.p1, kind_of_work_id: world.p1 }),
    );
    expect(unknown.code).toBe(refusedBy.foreignKey);
    // Another project may allow the same kind.
    await add('project_kind_of_work', { project_id: world.p2, kind_of_work_id: hangers });
    expect(await kindsOf(world.p2)).toEqual(['Hangers']);

    const { id } = await db.one<{ id: string }>(
      `UPDATE "project_kind_of_work" SET "archived_at" = now()
       WHERE "project_id" = $1 AND "kind_of_work_id" = $2 RETURNING "id"::text`,
      [world.p1, hangers],
    );
    expect(await kindsOf(world.p1, 'p."archived_at" IS NULL')).toEqual([
      'Leaners',
      'Stumps',
      'White Goods',
      'Crew time',
    ]);
    await db.run(`UPDATE "project_kind_of_work" SET "archived_at" = NULL WHERE "id" = $1`, [id]);
    expect(await kindsOf(world.p1, 'p."archived_at" IS NULL')).toHaveLength(5);
    const dana = { actor: world.admin, source: 'BACK_OFFICE', domain: 'OPERATIONS' };
    expect(await auditOf(id)).toMatchObject([
      { operation: 'INSERT', ...dana },
      { operation: 'UPDATE', changed: ['archived_at'], prior: { archived_at: null }, ...dana },
      { operation: 'UPDATE', changed: ['archived_at'], ...dana },
    ]);
  });

  it('AC-01-14 closed, it carries its close time and every record under it is still there', async () => {
    const { db, world } = tested;
    const under = async (): Promise<Record<string, number>> =>
      db.one(
        `SELECT (SELECT count(*)::int FROM "field_event" WHERE "project_id" = $1) AS field_events,
           (SELECT count(*)::int FROM "completed_load" WHERE "project_id" = $1) AS completed_loads,
           (SELECT count(*)::int FROM "assignment" WHERE "project_id" = $1) AS assignments,
           (SELECT count(*)::int FROM "disposal_site" WHERE "project_id" = $1) AS sites,
           (SELECT count(*)::int FROM "project_kind_of_work" WHERE "project_id" = $1) AS kinds`,
        [world.p1],
      );
    const before = await under();
    expect(before).toEqual({
      field_events: 4,
      completed_loads: 2,
      // Ana's for the Monday, and Sam's and Lee's for the Saturday the trucks were certified.
      assignments: 3,
      sites: 2,
      kinds: 5,
    });
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE', { reason: 'Mission complete' });
    await db.run(`UPDATE "project" SET "closed_at" = '2027-03-31T17:00:00-04:00' WHERE "id" = $1`, [
      world.p1,
    ]);
    expect(
      await db.one(
        `SELECT to_char("closed_at" AT TIME ZONE "time_zone", 'DD-Mon-YYYY HH24:MI') AS closed
         FROM "project" WHERE "id" = $1`,
        [world.p1],
      ),
    ).toEqual({ closed: '31-Mar-2027 17:00' });
    expect(await under()).toEqual(before);
    expect((await auditOf(world.p1)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['closed_at'],
      prior: { closed_at: null },
      actor: world.admin,
    });
  });

  it('AC-01-14 a delete of the project is refused by the database for every login, closed or not', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(`UPDATE "project" SET "closed_at" = now() WHERE "id" = $1`, [world.p1]);
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(
        (await db.refused(`DELETE FROM "project" WHERE "id" = $1`, [world.p1])).code,
        login,
      ).toBe(refusedBy.grant);
    }
    for (const who of ['adms_owner', 'administrator'] as const) {
      if (who === 'administrator') await db.administer();
      else await db.as(who);
      expect(await db.refused(`DELETE FROM "project" WHERE "id" = $1`, [world.p1]), who).toEqual({
        code: refusedBy.trigger,
        message: 'Open ADMS never deletes a project row: archive, close or void it instead',
      });
    }
  });
});

// What an edit changes on each of the three new tables, and the row of the example world to try it
// on.
const edited: [string, string, string, (world: typeof tested.world) => string | undefined][] = [
  ['client', 'name', 'Bayline County Board of Commissioners', (world) => world.client],
  ['declaration_event', 'name', 'Hurricane Delphine (2026)', (world) => world.declarationEvent],
  [
    'project_kind_of_work',
    'archived_at',
    '2026-11-01T12:00:00Z',
    (world) => world.written['project_kind_of_work']?.[0],
  ],
];

describe('changing them', () => {
  it.each(edited)(
    'AC-01-78 a %s row: an edit is audited with the prior value and its actor; a delete or a truncate is refused',
    async (table, column, value, rowOf) => {
      const { db, world } = tested;
      const id = rowOf(world);
      if (id === undefined) throw new Error(`The example world wrote no ${table} row.`);
      await asTheApi();
      const before = await db.one<{ prior: unknown }>(
        `SELECT to_jsonb("${column}") AS prior FROM "${table}" WHERE "id" = $1`,
        [id],
      );
      await db.run(`UPDATE "${table}" SET "${column}" = $2 WHERE "id" = $1`, [id, value]);
      expect((await auditOf(id)).at(-1)).toMatchObject({
        operation: 'UPDATE',
        changed: [column],
        prior: { [column]: before.prior },
        actor: world.admin,
        source: 'BACK_OFFICE',
        domain: 'OPERATIONS',
      });
      for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
        await db.as(login);
        await db.actor(world.admin, 'BACK_OFFICE');
        expect((await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id])).code, login).toBe(
          refusedBy.grant,
        );
      }
      const never = `Open ADMS never deletes a ${table} row: archive, close or void it instead`;
      for (const who of ['adms_owner', 'administrator'] as const) {
        if (who === 'administrator') await db.administer();
        else await db.as(who);
        for (const sql of [
          `DELETE FROM "${table}" WHERE "id" = '${id}'`,
          `TRUNCATE "${table}" CASCADE`,
        ]) {
          expect(await db.refused(sql), `${who}: ${sql}`).toEqual({
            code: refusedBy.trigger,
            message: never,
          });
        }
      }
    },
  );

  it('AC-01-78 a client and a declaration event are archived, never deleted, and stay on the projects that point at them', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(`UPDATE "client" SET "archived_at" = now() WHERE "id" = $1`, [world.client]);
    await db.run(`UPDATE "declaration_event" SET "archived_at" = now() WHERE "id" = $1`, [
      world.declarationEvent,
    ]);
    expect(
      await db.rows(
        `SELECT p."name" FROM "project" p
           JOIN "client" c ON c."id" = p."client_id"
           JOIN "declaration_event" d ON d."id" = p."declaration_event_id"
         WHERE c."archived_at" IS NOT NULL AND d."archived_at" IS NOT NULL AND p."id" = ANY($1)
         ORDER BY p."name"`,
        [[world.p1, world.p2]],
      ),
    ).toEqual([
      { name: 'Bayline County PPDR, Hurricane Delphine' },
      { name: 'Bayline County ROW, Hurricane Delphine' },
    ]);
    for (const id of [world.client, world.declarationEvent]) {
      expect((await auditOf(id)).at(-1)).toMatchObject({
        operation: 'UPDATE',
        changed: ['archived_at'],
        actor: world.admin,
      });
    }
  });

  it.each(['client', 'declaration_event', 'project_kind_of_work'])(
    'the worker reads %s and may not write it',
    async (table) => {
      const { db, world } = tested;
      await db.as('adms_worker');
      await db.actor(world.worker, 'SYSTEM');
      await db.rows(`SELECT 1 FROM "${table}"`);
      expect((await db.refused(`UPDATE "${table}" SET "created_at" = now()`)).code).toBe(
        refusedBy.grant,
      );
      expect((await db.refused(`INSERT INTO "${table}" DEFAULT VALUES`)).code).toBe(
        refusedBy.grant,
      );
    },
  );
});
