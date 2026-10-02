// REQ-106c, and REQ-101's library: the firm's lists (spec/LISTS.md Group 1; spec/DATA-MODEL.md
// §2.3; ADR-070, 194, 302). Section D of spec/acceptance/01-setup.md, proven at the database: what
// each list starts with (AC-01-31), the built-in values and their fixed keys (AC-01-32), which can't
// be archived (AC-01-34), a firm's own value added, renamed and archived, never deleted (AC-01-35),
// a reason's uses (AC-01-36), an incident type's sub-types (AC-01-37), a kind of work's count shape
// and item names (AC-01-38); and AC-01-78 for these eighteen tables.
//
// The lists read here are the installation's own, as the installer's seed wrote them; each test's
// work is rolled back, so they stay as a fresh installation has them.
import { builtInKeys } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { listTables, type ListTable } from './support/lists.ts';

const tested = eachTestRolledBack();

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

async function namesIn(table: ListTable, where = 'TRUE'): Promise<string[]> {
  const rows = await tested.db.rows<{ name: string }>(
    `SELECT "name" FROM "${table}" WHERE ${where} ORDER BY "position"`,
  );
  return rows.map((row) => row.name);
}

async function idOf(table: ListTable, name: string): Promise<string> {
  return (
    await tested.db.one<{ id: string }>(`SELECT "id"::text FROM "${table}" WHERE "name" = $1`, [
      name,
    ])
  ).id;
}

// What a value of each list needs besides its name and position: the list's own columns.
async function ownColumns(table: ListTable): Promise<Record<string, unknown>> {
  switch (table) {
    case 'kind_of_work':
      return { count_shape: 'NUMBER' };
    case 'item_name':
      return { kind_of_work_id: await idOf('kind_of_work', 'Crew time') };
    case 'vehicle_type':
      return { certifies: 'CONTAINER' };
    case 'incident_sub_type':
      return { incident_type_id: await idOf('incident_type', 'Property damage') };
    case 'field_tag':
      return { project_id: tested.world.p1 };
    default:
      return {};
  }
}

// The insert of one value, after the list's last; `more` overrides or adds columns (a key).
async function valueOf(
  table: ListTable,
  name: string,
  more: Record<string, unknown> = {},
): Promise<[string, unknown[]]> {
  const row = { name, ...(await ownColumns(table)), ...more };
  const columns = Object.keys(row);
  return [
    `INSERT INTO "${table}" ("position", ${columns.map((column) => `"${column}"`).join(', ')})
     SELECT coalesce(max("position"), 0) + 1, ${columns.map((_, index) => `$${String(index + 1)}`).join(', ')}
     FROM "${table}" RETURNING "id"::text`,
    Object.values(row),
  ];
}

// Adds a firm's own value, as whoever the test is acting as; its id.
async function add(table: ListTable, name: string): Promise<string> {
  return (await tested.db.one<{ id: string }>(...(await valueOf(table, name)))).id;
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

// USACE's twelve umbrella debris types (spec/CONVENTIONS.md §4).
const umbrellaTypes = [
  'C&D',
  'Vegetative',
  'Metals',
  'Concrete',
  'White Goods',
  'Titled Property (vehicles and vessels)',
  'HHW',
  'RACM',
  'Soil',
  'Leaners',
  'Hangers',
  'Stumps',
];

// What each list starts with, in the order shown (spec/LISTS.md Group 1; where it gives none or
// ends in "…", ADR-302). Written out here, not read from the seed, so the seed is held to it.
const startsWith: Record<ListTable, string[]> = {
  program_type: ['ROW', 'PARKS', 'PPDR', 'WATERWAY'],
  declaration_reference_type: [
    'FEMA disaster (DR)',
    'FEMA emergency (EM)',
    'State',
    'Local',
    'Internal',
  ],
  debris_type: umbrellaTypes,
  reduction_method: ['Grinding', 'Incineration', 'Compaction'],
  payable_type: [...umbrellaTypes, 'Crew time', 'Tipping fee'],
  kind_of_work: ['Hangers', 'Leaners', 'Stumps', 'HHW', 'White Goods', 'Crew time'],
  // By kind: each kind's items are numbered from 1, so their order is read per kind (AC-01-38).
  item_name: [],
  vehicle_type: [
    'Dump Truck',
    'Semi-Trailer',
    'Hydraulic Dump Trailer',
    'Non-Hydraulic Dump Trailer',
    'Self-Loading Truck',
  ],
  vehicle_feature: [
    'Sideboards',
    'Tail Gate Extension',
    'Dog Box',
    'Wheel Wells',
    'Curved/Angled Sides/Floor',
  ],
  crew_type: ['Bucket Truck', 'Skid Steer'],
  site_type: ['TDSR/DMS', 'Final Disposal', 'Transfer Station', 'Other'],
  site_label: [],
  incident_type: [
    'Property damage',
    'Personal injury',
    'Near miss',
    'Equipment failure',
    'Environmental',
    'Other',
  ],
  incident_sub_type: [],
  reason: [
    'Duplicate ticket',
    'Work never happened',
    'Not eligible work',
    'Barcode damaged',
    'Scanner not working',
    'Photos confirm',
    'Confirmed with the monitor',
    'Device failed',
    'Device lost',
  ],
  survey_work_type: ['Pre-work survey', 'Post-work survey', 'ROE'],
  clock_activity: ['Travel', 'Standby', 'Training'],
  field_tag: [],
};

const itemsOf: Record<string, string[]> = {
  HHW: ['Paint cans', 'Propane tanks', 'Pesticide'],
  'White Goods': [
    'Washer',
    'Dryer',
    'Fridge, freon recovered',
    'Fridge, no freon',
    'Fridge, freon staged',
    'Oven',
    'Microwave',
  ],
  'Crew time': ['Skid Steer', 'Truck', 'Sign'],
};

// The six built-in values: where each lives, its key and the name it ships with.
const builtIn: [ListTable, string, string][] = [
  ['kind_of_work', 'STUMPS', 'Stumps'],
  ['site_type', 'TDSR', 'TDSR/DMS'],
  ['site_type', 'FINAL_DISPOSAL', 'Final Disposal'],
  ['survey_work_type', 'PRE_WORK', 'Pre-work survey'],
  ['survey_work_type', 'POST_WORK', 'Post-work survey'],
  ['survey_work_type', 'ROE', 'ROE'],
];

describe('a fresh installation', () => {
  it.each(listTables.filter((table) => table !== 'item_name'))(
    'AC-01-31 %s starts with the values spec/LISTS.md gives it, in order, none archived',
    async (table) => {
      expect(await namesIn(table)).toEqual(startsWith[table]);
      expect(await namesIn(table, '"archived_at" IS NOT NULL')).toEqual([]);
    },
  );

  it('AC-01-31 site labels, incident sub-types and every project’s field tags start empty', async () => {
    const { db } = tested;
    for (const table of ['site_label', 'incident_sub_type', 'field_tag'] as const) {
      expect(await db.rows(`SELECT 1 FROM "${table}"`), table).toEqual([]);
    }
  });

  it('AC-01-31 PPDR requires an ROE; ROW, PARKS and WATERWAY don’t', async () => {
    const rows = await tested.db.rows<{ name: string; requires_roe: boolean }>(
      `SELECT "name", "requires_roe" FROM "program_type" ORDER BY "position"`,
    );
    expect(rows).toEqual([
      { name: 'ROW', requires_roe: false },
      { name: 'PARKS', requires_roe: false },
      { name: 'PPDR', requires_roe: true },
      { name: 'WATERWAY', requires_roe: false },
    ]);
  });

  it('AC-01-31 every vehicle type it starts with certifies a measured container', async () => {
    const rows = await tested.db.rows<{ certifies: string }>(
      `SELECT DISTINCT "certifies"::text FROM "vehicle_type"`,
    );
    expect(rows).toEqual([{ certifies: 'CONTAINER' }]);
  });

  it('the seed wrote every value as the system actor, in the operations domain', async () => {
    const { db } = tested;
    for (const table of listTables) {
      const written = await db.rows<{ id: string }>(`SELECT "id"::text FROM "${table}"`);
      const audited = await db.rows<{ record_id: string }>(
        `SELECT "record_id" FROM "audit_record"
         WHERE "table_name" = $1 AND "operation" = 'INSERT' AND "source" = 'SYSTEM'
           AND "actor_id" = $2 AND "domain" = 'OPERATIONS'`,
        [table, tested.world.worker],
      );
      expect(audited.map((row) => row.record_id).sort(), table).toEqual(
        written.map((row) => row.id).sort(),
      );
    }
  });
});

describe('the built-in values', () => {
  it('AC-01-32 are exactly the domain’s closed set, each a key on its own list; every other value has none', async () => {
    const { db } = tested;
    const keyed: Record<string, string[]> = {};
    for (const table of listTables) {
      const rows = await db.rows<{ key: string }>(
        `SELECT "key" FROM "${table}" WHERE "key" IS NOT NULL ORDER BY "position"`,
      );
      if (rows.length > 0) keyed[table] = rows.map((row) => row.key);
    }
    expect(keyed).toEqual({
      kind_of_work: [...builtInKeys.kindOfWork],
      site_type: [...builtInKeys.siteType],
      survey_work_type: [...builtInKeys.surveyWorkType],
    });
  });

  it.each(builtIn)('AC-01-32 %s: the key %s is the value "%s"', async (table, key, name) => {
    expect(await namesIn(table, `"key" = '${key}'`)).toEqual([name]);
  });

  it.each(listTables)(
    'AC-01-32 a firm’s own %s value has no key: no login but a release may write one',
    async (table) => {
      const { db, world } = tested;
      await asTheApi();
      const withKey = await db.refused(
        ...(await valueOf(table, 'Marine-Vegetative', { key: 'MARINE' })),
      );
      expect(withKey).toEqual({
        code: refusedBy.grant,
        message: `Only a release adds a built-in value: adms_api may not write a ${table} row with a key`,
      });
      const id = await add(table, 'Marine-Vegetative');
      expect(await db.one(`SELECT "key" FROM "${table}" WHERE "id" = $1`, [id])).toEqual({
        key: null,
      });
      const given = await db.refused(`UPDATE "${table}" SET "key" = 'MARINE' WHERE "id" = $1`, [
        id,
      ]);
      expect(given).toEqual({
        code: refusedBy.grant,
        message: `A key is a release's to write: adms_api may not change the key of a ${table} row`,
      });
      // The server's administrator isn't a release either.
      await db.administer();
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(
        (await db.refused(`UPDATE "${table}" SET "key" = 'MARINE' WHERE "id" = $1`, [id])).code,
      ).toBe(refusedBy.grant);
    },
  );

  it.each(builtIn)(
    'AC-01-32 %s: the key %s is fixed: the API may not change it or take it away',
    async (table, key) => {
      const { db } = tested;
      await asTheApi();
      for (const to of [`'RENAMED'`, 'NULL']) {
        const refusal = await db.refused(`UPDATE "${table}" SET "key" = ${to} WHERE "key" = $1`, [
          key,
        ]);
        expect(refusal.code, to).toBe(refusedBy.grant);
      }
      expect(await db.rows(`SELECT 1 FROM "${table}" WHERE "key" = $1`, [key])).toHaveLength(1);
    },
  );

  it('a release, as the owner, adds a built-in value; a key is on one value of its list only', async () => {
    const { db, world } = tested;
    await db.as('adms_owner');
    await db.actor(world.worker, 'SYSTEM');
    const [insert, values] = await valueOf('site_type', 'A later release’s', {
      key: 'A_LATER_RELEASE',
    });
    await db.run(insert, values);
    const second = await db.refused(
      ...(await valueOf('kind_of_work', 'Stumps again', { key: 'STUMPS' })),
    );
    expect(second.code).toBe(refusedBy.unique);
  });

  it.each(builtIn)(
    'AC-01-34 %s: %s can’t be archived, by the API, the owner or the administrator',
    async (table, key) => {
      const { db, world } = tested;
      for (const who of ['adms_api', 'adms_owner', 'administrator'] as const) {
        if (who === 'administrator') await db.administer();
        else await db.as(who);
        await db.actor(world.admin, 'BACK_OFFICE');
        const refusal = await db.refused(
          `UPDATE "${table}" SET "archived_at" = now() WHERE "key" = $1`,
          [key],
        );
        expect(refusal.code, who).toBe(refusedBy.check);
        expect(refusal.message, who).toContain(`"${table}_built_in_never_archived_check"`);
      }
      expect(
        await db.rows(`SELECT 1 FROM "${table}" WHERE "key" = $1 AND "archived_at" IS NULL`, [key]),
      ).toHaveLength(1);
    },
  );

  // The database's part of AC-01-33; that nothing the system does for stump tickets changes is
  // proven with the first behaviour hung on the key (BACKLOG 1.5.7).
  it('a built-in value is renamed freely, audited, and keeps its key', async () => {
    const { db, world } = tested;
    await asTheApi();
    const id = await idOf('kind_of_work', 'Stumps');
    await db.run(`UPDATE "kind_of_work" SET "name" = 'Stump removal' WHERE "id" = $1`, [id]);
    expect(await db.one(`SELECT "key", "name" FROM "kind_of_work" WHERE "id" = $1`, [id])).toEqual({
      key: 'STUMPS',
      name: 'Stump removal',
    });
    expect((await auditOf(id)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['name'],
      prior: { name: 'Stumps', key: 'STUMPS' },
      actor: world.admin,
      source: 'BACK_OFFICE',
    });
  });
});

describe('the firm’s own values', () => {
  it.each(listTables)('AC-01-34 a firm’s own %s value is archived freely', async (table) => {
    const { db } = tested;
    await asTheApi();
    const id = await add(table, 'Marine-Vegetative');
    expect(await db.run(`UPDATE "${table}" SET "archived_at" = now() WHERE "id" = $1`, [id])).toBe(
      1,
    );
    expect((await auditOf(id)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['archived_at'],
    });
  });

  it('AC-01-35 a debris type is added, renamed and archived, each step audited; archived, it is off every new pick and still there', async () => {
    const { db, world } = tested;
    await asTheApi();
    const id = await add('debris_type', 'Marine-Vegetative');
    await db.run(`UPDATE "debris_type" SET "name" = 'Marine Vegetative' WHERE "id" = $1`, [id]);
    await db.run(`UPDATE "debris_type" SET "archived_at" = now() WHERE "id" = $1`, [id]);

    const dana = { actor: world.admin, source: 'BACK_OFFICE', domain: 'OPERATIONS' };
    expect(await auditOf(id)).toMatchObject([
      { operation: 'INSERT', prior: null, ...dana },
      { operation: 'UPDATE', changed: ['name'], prior: { name: 'Marine-Vegetative' }, ...dana },
      {
        operation: 'UPDATE',
        changed: ['archived_at'],
        prior: { name: 'Marine Vegetative', archived_at: null },
        ...dana,
      },
    ]);
    // A pick list shows what isn't archived; the row itself is kept, for every record that has it.
    expect(await namesIn('debris_type', '"archived_at" IS NULL')).toEqual(umbrellaTypes);
    expect(await namesIn('debris_type')).toEqual([...umbrellaTypes, 'Marine Vegetative']);
  });

  it('AC-01-35 a delete of a debris type is refused by the database, for every login and the owner', async () => {
    const { db, world } = tested;
    await asTheApi();
    const id = await add('debris_type', 'Marine-Vegetative');
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(
        (await db.refused(`DELETE FROM "debris_type" WHERE "id" = $1`, [id])).code,
        login,
      ).toBe(refusedBy.grant);
    }
    for (const who of ['adms_owner', 'administrator'] as const) {
      if (who === 'administrator') await db.administer();
      else await db.as(who);
      expect(await db.refused(`DELETE FROM "debris_type" WHERE "id" = $1`, [id]), who).toEqual({
        code: refusedBy.trigger,
        message: 'Open ADMS never deletes a debris_type row: archive, close or void it instead',
      });
    }
  });

  it('an archived value stays on what already points at it: an archived kind of work keeps its item names', async () => {
    const { db } = tested;
    await asTheApi();
    const kind = await idOf('kind_of_work', 'Crew time');
    await db.run(`UPDATE "kind_of_work" SET "archived_at" = now() WHERE "id" = $1`, [kind]);
    expect(await namesIn('item_name', `"kind_of_work_id" = '${kind}'`)).toEqual([
      'Skid Steer',
      'Truck',
      'Sign',
    ]);
  });

  it.each(listTables)(
    'AC-01-78 a %s value: an edit is audited with the prior value and its actor; a delete or a truncate is refused',
    async (table) => {
      const { db, world } = tested;
      await asTheApi();
      const id = await add(table, 'Marine-Vegetative');
      await db.run(
        `UPDATE "${table}" SET "name" = 'Marine Vegetative', "position" = 99 WHERE "id" = $1`,
        [id],
      );
      expect((await auditOf(id)).at(-1)).toMatchObject({
        operation: 'UPDATE',
        changed: ['name', 'position'],
        prior: { name: 'Marine-Vegetative' },
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

  it.each(listTables)('the worker reads %s and may not write it', async (table) => {
    const { db, world } = tested;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    await db.rows(`SELECT 1 FROM "${table}"`);
    expect((await db.refused(...(await valueOf(table, 'Marine-Vegetative')))).code).toBe(
      refusedBy.grant,
    );
    expect((await db.refused(`UPDATE "${table}" SET "name" = 'Changed'`)).code).toBe(
      refusedBy.grant,
    );
  });
});

describe('reasons', () => {
  async function offeredFor(use: string): Promise<string[]> {
    return namesIn('reason', `'${use}' = ANY("uses") AND "archived_at" IS NULL`);
  }

  it('AC-01-36 "Barcode damaged" is offered for a typed ticket number only', async () => {
    expect(await offeredFor('TYPED_NUMBER')).toContain('Barcode damaged');
    for (const use of ['VOID', 'ACCEPT_FLAG', 'BACK_OFFICE_RECORD']) {
      expect(await offeredFor(use), use).not.toContain('Barcode damaged');
    }
  });

  it('AC-01-36 each reason says which of the four uses it is offered for', async () => {
    expect({
      VOID: await offeredFor('VOID'),
      TYPED_NUMBER: await offeredFor('TYPED_NUMBER'),
      ACCEPT_FLAG: await offeredFor('ACCEPT_FLAG'),
      BACK_OFFICE_RECORD: await offeredFor('BACK_OFFICE_RECORD'),
    }).toEqual({
      VOID: ['Duplicate ticket', 'Work never happened', 'Not eligible work'],
      TYPED_NUMBER: ['Barcode damaged', 'Scanner not working'],
      ACCEPT_FLAG: ['Photos confirm', 'Confirmed with the monitor'],
      BACK_OFFICE_RECORD: ['Device failed', 'Device lost'],
    });
  });

  it('AC-01-36 the firm’s own reason may be offered for several uses, and for none but the four', async () => {
    const { db } = tested;
    await asTheApi();
    await db.run(...(await valueOf('reason', 'Monitor’s mistake', { uses: '{VOID,ACCEPT_FLAG}' })));
    expect(await offeredFor('VOID')).toContain('Monitor’s mistake');
    expect(await offeredFor('ACCEPT_FLAG')).toContain('Monitor’s mistake');
    expect(await offeredFor('TYPED_NUMBER')).not.toContain('Monitor’s mistake');
    const other = await db.refused(
      ...(await valueOf('reason', 'Renumbered', { uses: '{RENUMBER}' })),
    );
    expect(other.code).toBe(refusedBy.badValue);
  });
});

describe('incident types and their sub-types', () => {
  it('AC-01-37 "Mailbox struck" is offered under Property damage and under no other type', async () => {
    const { db } = tested;
    await asTheApi();
    await add('incident_sub_type', 'Mailbox struck');
    const rows = await db.rows<{ type: string; sub_types: string[] }>(
      `SELECT t."name" AS type, array_agg(s."name") AS sub_types
       FROM "incident_sub_type" s JOIN "incident_type" t ON t."id" = s."incident_type_id"
       GROUP BY t."name"`,
    );
    expect(rows).toEqual([{ type: 'Property damage', sub_types: ['Mailbox struck'] }]);
  });

  it('AC-01-37 a sub-type belongs to one incident type: none, or one that doesn’t exist, is refused', async () => {
    const { db } = tested;
    await asTheApi();
    const none = await db.refused(
      ...(await valueOf('incident_sub_type', 'Mailbox struck', { incident_type_id: null })),
    );
    expect(none.code).toBe(refusedBy.notNull);
    const unknown = await db.refused(
      ...(await valueOf('incident_sub_type', 'Mailbox struck', {
        incident_type_id: tested.world.p1,
      })),
    );
    expect(unknown.code).toBe(refusedBy.foreignKey);
  });
});

describe('kinds of unit rate work', () => {
  it('AC-01-38 each kind carries its count shape: a number, counts by item, or hours by item', async () => {
    const rows = await tested.db.rows<{ name: string; count_shape: string }>(
      `SELECT "name", "count_shape"::text FROM "kind_of_work" ORDER BY "position"`,
    );
    expect(rows).toEqual([
      { name: 'Hangers', count_shape: 'NUMBER' },
      { name: 'Leaners', count_shape: 'NUMBER' },
      { name: 'Stumps', count_shape: 'NUMBER' },
      { name: 'HHW', count_shape: 'ITEM_COUNTS' },
      { name: 'White Goods', count_shape: 'ITEM_COUNTS' },
      { name: 'Crew time', count_shape: 'ITEM_HOURS' },
    ]);
  });

  it('AC-01-38 a kind with no count shape, or one that isn’t of the three, is refused', async () => {
    const { db } = tested;
    await asTheApi();
    const none = await db.refused(
      ...(await valueOf('kind_of_work', 'Fencing', { count_shape: null })),
    );
    expect(none.code).toBe(refusedBy.notNull);
    const other = await db.refused(
      ...(await valueOf('kind_of_work', 'Fencing', { count_shape: 'LINEAR_FEET' })),
    );
    expect(other.code).toBe(refusedBy.badValue);
  });

  it('AC-01-31, AC-01-38 the item names belong to their kind: Skid Steer and Truck under Crew time', async () => {
    const rows = await tested.db.rows<{ kind: string; items: string[] }>(
      `SELECT k."name" AS kind, array_agg(i."name" ORDER BY i."position") AS items
       FROM "item_name" i JOIN "kind_of_work" k ON k."id" = i."kind_of_work_id"
       GROUP BY k."name"`,
    );
    expect(Object.fromEntries(rows.map((row) => [row.kind, row.items]))).toEqual(itemsOf);
  });

  it('AC-01-38 an item name belongs to one kind: none, or one that doesn’t exist, is refused', async () => {
    const { db } = tested;
    await asTheApi();
    const none = await db.refused(
      ...(await valueOf('item_name', 'Chainsaw', { kind_of_work_id: null })),
    );
    expect(none.code).toBe(refusedBy.notNull);
    const unknown = await db.refused(
      ...(await valueOf('item_name', 'Chainsaw', { kind_of_work_id: tested.world.p1 })),
    );
    expect(unknown.code).toBe(refusedBy.foreignKey);
  });
});

describe('the lists’ own columns', () => {
  it('a vehicle type says whether it certifies a container or a crew, and nothing else', async () => {
    const { db } = tested;
    await asTheApi();
    await db.run(...(await valueOf('vehicle_type', 'Bucket truck', { certifies: 'CREW' })));
    const none = await db.refused(
      ...(await valueOf('vehicle_type', 'Flatbed', { certifies: null })),
    );
    expect(none.code).toBe(refusedBy.notNull);
    const other = await db.refused(
      ...(await valueOf('vehicle_type', 'Flatbed', { certifies: 'VEHICLE' })),
    );
    expect(other.code).toBe(refusedBy.badValue);
  });

  it('a field tag is one project’s: none, or a project that doesn’t exist, is refused', async () => {
    const { db } = tested;
    await asTheApi();
    await add('field_tag', 'Mixed');
    const none = await db.refused(...(await valueOf('field_tag', 'Mixed', { project_id: null })));
    expect(none.code).toBe(refusedBy.notNull);
    const unknown = await db.refused(
      ...(await valueOf('field_tag', 'Mixed', { project_id: tested.world.monitor })),
    );
    expect(unknown.code).toBe(refusedBy.foreignKey);
  });

  it.each(listTables)(
    'a %s value needs its name and its place in the order shown',
    async (table) => {
      const { db } = tested;
      await asTheApi();
      const id = await add(table, 'Marine-Vegetative');
      for (const column of ['name', 'position']) {
        expect(
          (await db.refused(`UPDATE "${table}" SET "${column}" = NULL WHERE "id" = $1`, [id])).code,
          column,
        ).toBe(refusedBy.notNull);
      }
    },
  );
});
