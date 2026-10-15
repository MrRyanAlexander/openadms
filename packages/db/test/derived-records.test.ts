// The derived records: what the worker concludes, and what the database holds and refuses by
// itself whoever writes (spec/acceptance/06-reconciliation.md, by scenario ID: AC-06-06, 19, 21,
// 137, 138, 144, 145, 146, 148, 152; spec/DATA-MODEL.md §4.1 (3), §5, §8, §9; spec/FLAGS.md;
// ADR-055, 086, 155, 162, 166, 175, 236, 270, 294, 295, 340; invariants 1, 4, 17, 21; REQ-113,
// 116). The worker itself is tasks 1.5.3 to 1.5.9: here a test writes, as the worker's login,
// what the worker will. The values are the golden mission's: P1's 101003 (cert 730415, 65 CY,
// called 96%), its split haul-out 201004 (the walking floor 730419, 110 CY, three piles, 24.00
// tons weighed at Cypress Creek Landfill) and P2's split load of two properties (730416, 48 CY,
// estimates 12 and 18 CY, called 75%).
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { eventInsertOf, fieldEventLike, insertOf, siteLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

type Row = Record<string, unknown>;

// As the worker's login, writing as the system actor.
async function asTheWorker(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_worker');
  await db.actor(world.worker, 'SYSTEM');
}

// As the API's login, for Ana's phone at sync.
async function asThePhone(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
}

// As the API's login, for Dana in the back office.
async function asTheBackOffice(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

// Adds a row as whoever the test is acting as; its id.
async function add(table: string, row: Row): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf(table, row))).id;
}

async function refusedRow(table: string, row: Row): Promise<string> {
  return (await tested.db.refused(...insertOf(table, row))).code;
}

// A field event a phone synced; its id.
async function synced(more: Row): Promise<string> {
  const { db, world } = tested;
  return (await db.one<{ id: string }>(...eventInsertOf(fieldEventLike(world, more)))).id;
}

// A completed load as the worker concludes one from a load call.
function completedLoadLike(disposalEventId: string, more: Row = {}): Row {
  return {
    project_id: tested.world.p1,
    ticket_number: '101003',
    disposal_event_id: disposalEventId,
    quantity_source: 'LOAD_CALL',
    capacity_cy: 65,
    load_call: 96,
    volume_cy: '62.40',
    weight_is_share: false,
    updated_at: '2026-10-12T22:00:00Z',
    ...more,
  };
}

// An ordinary load's one collection row: no suffix, the whole share.
function collectionRowLike(
  completedLoadId: string,
  collectionEventId: string,
  more: Row = {},
): Row {
  return {
    project_id: tested.world.p1,
    completed_load_id: completedLoadId,
    collection_event_id: collectionEventId,
    split_suffix: '',
    share_fraction: '1',
    volume_cy: '62.40',
    ...more,
  };
}

// 101003's two field events, Monday: collected 11:30, dumped at Marsh Road TDSR, called 96%.
async function ticket101003(): Promise<{ collection: string; disposal: string }> {
  const { world } = tested;
  await asThePhone();
  const collection = await synced({
    ticket_number: '101003',
    started_at: '2026-10-12T15:05:00Z',
    ended_at: '2026-10-12T15:30:00Z',
  });
  const disposal = await synced({
    kind: 'DISPOSAL',
    ticket_number: '101003',
    site_id: world.site,
    load_call: 96,
    started_at: '2026-10-12T16:00:00Z',
    ended_at: '2026-10-12T16:05:00Z',
  });
  return { collection, disposal };
}

// A field event of P2's that no completed record names, synced by Ana's phone there; its id.
async function syncedOnP2(more: Row): Promise<string> {
  const { world } = tested;
  await asThePhone();
  return synced({
    project_id: world.p2,
    assignment_id: world.assignments.p2,
    cert_number: '730416',
    certification_id: world.certifications.p2c730416,
    ticket_number: '102005',
    ...more,
  });
}

const sha256 = (hex: string): string => hex.repeat(64);

// 101003's flag, as spec/FLAGS.md words it, with the facts it was raised on.
function flagLike(fieldEventId: string, more: Row = {}): Row {
  return {
    project_id: tested.world.p1,
    workflow: 'LOAD',
    ticket_number: '101003',
    field_event_id: fieldEventId,
    code: 'LOAD_CALL_HIGH',
    message: 'Ticket 101003: load call 96%. Flagged for review.',
    facts: JSON.stringify({ loadCall: 96, highLimit: 95 }),
    facts_sha256: sha256('a'),
    billing: 'BILLS',
    raised_at: '2026-10-12T22:00:00Z',
    ...more,
  };
}

// A run of the worker on P1, started by a sync.
function runLike(more: Row = {}): Row {
  return {
    project_id: tested.world.p1,
    trigger: 'SYNC',
    started_at: '2026-10-12T22:00:00Z',
    ...more,
  };
}

// A second project's map, a rectangle with one zone, loaded by Dana: its version and zone.
async function mapOf(projectId: string): Promise<{ version: string; zone: string }> {
  const { world } = tested;
  const shape = {
    geometry: JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [-75.8, 38.9],
          [-75.4, 38.9],
          [-75.4, 39.3],
          [-75.8, 39.3],
          [-75.8, 38.9],
        ],
      ],
    }),
    west_longitude: '-75.80000000',
    south_latitude: '38.90000000',
    east_longitude: '-75.40000000',
    north_latitude: '39.30000000',
  };
  const { geometry, ...box } = shape;
  const version = await add('map_version', {
    project_id: projectId,
    version: 1,
    source: 'UPLOAD',
    boundary: geometry,
    ...box,
    loaded_by_id: world.admin,
  });
  const zone = await add('zone', { map_version_id: version, name: 'Zone 1', geometry, ...box });
  return { version, zone };
}

describe("the worker's columns on a field event", () => {
  it('AC-06-06 only the worker writes its status, its zone and map version and a unit rate event’s worked-out pay item; the API’s login can set none of them, and the worker changes nothing the monitor captured', async () => {
    const { db, world } = tested;
    await asTheBackOffice();
    const map = await mapOf(world.p1);
    await asThePhone();
    const collection = await synced({ ticket_number: '101003' });
    const unitRate = await synced({
      workflow: 'UNIT_RATE',
      kind: 'UNIT_RATE',
      ticket_number: '301001',
      pay_item_id: world.payItems.hangers,
    });
    const settings: [string, string, unknown[]][] = [
      [
        'its status',
        `UPDATE "field_event" SET "status" = 'COMPLETED' WHERE "id" = $1`,
        [collection],
      ],
      [
        'when it was reconciled',
        `UPDATE "field_event" SET "reconciled_at" = now() WHERE "id" = $1`,
        [collection],
      ],
      [
        'its zone and map version',
        `UPDATE "field_event" SET "map_version_id" = $2, "zone_id" = $3 WHERE "id" = $1`,
        [collection, map.version, map.zone],
      ],
      [
        'its worked-out pay item',
        `UPDATE "field_event" SET "worked_out_pay_item_id" = $2 WHERE "id" = $1`,
        [unitRate, world.payItems.hangers],
      ],
    ];
    // Still as the API's login: none of them is its to set.
    for (const [what, sql, values] of settings) {
      expect((await db.refused(sql, values)).code, what).toBe(refusedBy.grant);
    }
    await asTheWorker();
    for (const [what, sql, values] of settings) {
      expect(await db.run(sql, values), what).toBe(1);
    }
    expect(
      await db.one(
        `SELECT "status"::text, "zone_id"::text AS zone, "map_version_id"::text AS map
         FROM "field_event" WHERE "id" = $1`,
        [collection],
      ),
    ).toEqual({ status: 'COMPLETED', zone: map.zone, map: map.version });
    // Nothing a monitor captured is the worker's to change, nor is a new field event.
    for (const sql of [
      `UPDATE "field_event" SET "ticket_number" = '101099' WHERE "id" = $1`,
      `UPDATE "field_event" SET "ended_at" = now() WHERE "id" = $1`,
      `UPDATE "field_event" SET "end_latitude" = 39.0, "end_longitude" = -75.6 WHERE "id" = $1`,
      `UPDATE "field_event" SET "pay_item_id" = NULL WHERE "id" = $1`,
      `UPDATE "field_event" SET "certification_id" = NULL WHERE "id" = $1`,
    ]) {
      expect((await db.refused(sql, [unitRate])).code, sql).toBe(refusedBy.grant);
    }
    expect(
      (await db.refused(...eventInsertOf(fieldEventLike(world, { ticket_number: '101004' })))).code,
    ).toBe(refusedBy.grant);
  });

  it('AC-06-06 the zone is one of the map version used, the map version and the worked-out pay item its own project’s, and only a unit rate event has a worked-out pay item', async () => {
    const { db, world } = tested;
    await asTheBackOffice();
    const p1 = await mapOf(world.p1);
    const p2 = await mapOf(world.p2);
    await asThePhone();
    const collection = await synced({ ticket_number: '101003' });
    // A unit rate event on P2, where P1's Hangers pay item is another project's.
    const onP2 = await synced({
      project_id: world.p2,
      assignment_id: world.assignments.p2,
      cert_number: '730416',
      certification_id: world.certifications.p2c730416,
      workflow: 'UNIT_RATE',
      kind: 'UNIT_RATE',
      ticket_number: '302001',
    });
    await asTheWorker();
    const refusals: [string, string, unknown[], string][] = [
      [
        'a zone with no map version',
        `UPDATE "field_event" SET "zone_id" = $2 WHERE "id" = $1`,
        [collection, p1.zone],
        refusedBy.check,
      ],
      [
        'a zone of another map version',
        `UPDATE "field_event" SET "map_version_id" = $2, "zone_id" = $3 WHERE "id" = $1`,
        [collection, p1.version, p2.zone],
        refusedBy.foreignKey,
      ],
      [
        'the map version of another project',
        `UPDATE "field_event" SET "map_version_id" = $2 WHERE "id" = $1`,
        [collection, p2.version],
        refusedBy.foreignKey,
      ],
      [
        'a worked-out pay item on a load',
        `UPDATE "field_event" SET "worked_out_pay_item_id" = $2 WHERE "id" = $1`,
        [collection, world.payItems.hangers],
        refusedBy.check,
      ],
      [
        'the pay item of another project',
        `UPDATE "field_event" SET "worked_out_pay_item_id" = $2 WHERE "id" = $1`,
        [onP2, world.payItems.hangers],
        refusedBy.foreignKey,
      ],
    ];
    for (const [what, sql, values, code] of refusals) {
      expect((await db.refused(sql, values)).code, what).toBe(code);
    }
    // Inside the boundary and in no zone: the map version used, and the zone left empty.
    expect(
      await db.run(`UPDATE "field_event" SET "map_version_id" = $2 WHERE "id" = $1`, [
        collection,
        p1.version,
      ]),
    ).toBe(1);
  });
});

describe('a completed load', () => {
  it('AC-06-19 a split load of two properties is one completed load with a row for each collection, their shares by estimate', async () => {
    const { db, world } = tested;
    // P2's split, as the golden mission tells 102001: here under 102002, since the example
    // world's 102001 is an ordinary load.
    const onP2 = {
      project_id: world.p2,
      assignment_id: world.assignments.p2,
      cert_number: '730416',
      certification_id: world.certifications.p2c730416,
      ticket_number: '102002',
    };
    await asThePhone();
    const a = await synced({ ...onP2, split_suffix: 'A', estimate_cy: 12 });
    const b = await synced({ ...onP2, split_suffix: 'B', estimate_cy: 18 });
    const disposal = await synced({ ...onP2, kind: 'DISPOSAL', load_call: 75 });
    await asTheWorker();
    const load = await add(
      'completed_load',
      completedLoadLike(disposal, {
        project_id: world.p2,
        ticket_number: '102002',
        capacity_cy: 48,
        load_call: 75,
        volume_cy: '36.00',
      }),
    );
    const row = (event: string, suffix: string, share: string, volume: string): Row =>
      collectionRowLike(load, event, {
        project_id: world.p2,
        split_suffix: suffix,
        share_fraction: share,
        volume_cy: volume,
      });
    await add('completed_load_collection', row(a, 'A', '0.4', '14.40'));
    await add('completed_load_collection', row(b, 'B', '0.6', '21.60'));
    expect(
      await db.rows(
        `SELECT c."split_suffix" AS suffix, c."share_fraction"::text AS share, c."volume_cy"::text AS cy,
           l."ticket_number" AS ticket, l."volume_cy"::text AS load_cy
         FROM "completed_load_collection" c JOIN "completed_load" l ON l."id" = c."completed_load_id"
         WHERE l."id" = $1 ORDER BY 1`,
        [load],
      ),
    ).toEqual([
      { suffix: 'A', share: '0.40000000', cy: '14.40', ticket: '102002', load_cy: '36.00' },
      { suffix: 'B', share: '0.60000000', cy: '21.60', ticket: '102002', load_cy: '36.00' },
    ]);
    expect(
      await db.one(
        `SELECT count(*)::int AS loads FROM "completed_load" WHERE "ticket_number" = '102002'`,
      ),
    ).toEqual({ loads: 1 });
    // One row for each property: a second live row under one suffix is refused; so is a suffix
    // that isn't capital letters, a share past the whole, and a share below nought.
    await asThePhone();
    const more = await synced({ ...onP2, split_suffix: 'C', estimate_cy: 5 });
    await asTheWorker();
    expect(await refusedRow('completed_load_collection', row(more, 'B', '0.1', '1.00'))).toBe(
      refusedBy.exclusion,
    );
    for (const [what, wrong] of [
      ['a suffix in small letters', { split_suffix: 'c' }],
      ['a share past the whole', { share_fraction: '1.2' }],
      ['a share below nought', { share_fraction: '-0.1' }],
      ['a volume below nought', { volume_cy: '-1' }],
    ] as const) {
      expect(
        await refusedRow('completed_load_collection', {
          ...row(more, 'C', '0.1', '1.00'),
          ...wrong,
        }),
        what,
      ).toBe(refusedBy.check);
    }
  });

  it('AC-06-19 a collection row holds its load and its collection to one project, and a mileage with where it came from', async () => {
    const { world } = tested;
    const { collection, disposal } = await ticket101003();
    const p2Collection = await syncedOnP2({});
    await asTheWorker();
    const load = await add('completed_load', completedLoadLike(disposal));
    // A collection of P2's under P1's load, as a row of P1 and then as a row of P2: each breaks
    // one key only, the collection's and then the load's.
    for (const [what, wrong] of [
      ['a collection of another project', { collection_event_id: p2Collection }],
      ['a load of another project', { project_id: world.p2, collection_event_id: p2Collection }],
    ] as const) {
      expect(
        await refusedRow('completed_load_collection', {
          ...collectionRowLike(load, collection),
          ...wrong,
        }),
        what,
      ).toBe(refusedBy.foreignKey);
    }
    const routed = {
      mileage: '6.2050',
      mileage_source: 'ROAD_ROUTE',
      snapped_latitude: '39.13844300',
      snapped_longitude: '-75.55388800',
      snapped_address: 'Wyoming Mill Road',
      map_data_date: '2026-01-01',
      map_data_sha256: sha256('b'),
    };
    for (const [what, wrong] of [
      ['a mileage with no source', { mileage_source: null }],
      ['a source with no mileage', { mileage: null }],
      ['a mileage below nought', { mileage: '-1' }],
      ['half a road point', { snapped_longitude: null }],
      ['a road point off the earth', { snapped_latitude: '91' }],
      ['a map date with no hash', { map_data_sha256: null }],
      ['a hash that isn’t one', { map_data_sha256: 'abc' }],
      ['a blank address', { snapped_address: ' ' }],
    ] as const) {
      expect(
        await refusedRow('completed_load_collection', {
          ...collectionRowLike(load, collection),
          ...routed,
          ...wrong,
        }),
        what,
      ).toBe(refusedBy.check);
    }
    await add('completed_load_collection', { ...collectionRowLike(load, collection), ...routed });
  });

  it('AC-06-145 is one record for its disposal event, and no second completed load can name that disposal: a load dumps once', async () => {
    const { db, world } = tested;
    const linked = world.loads.l101001;
    const p2Disposal = await syncedOnP2({ kind: 'DISPOSAL', load_call: 50 });
    await asTheWorker();
    // Under another number, so only the disposal's own key is in the way.
    const again = completedLoadLike(linked.disposal, { ticket_number: '101040' });
    expect(await refusedRow('completed_load', again)).toBe(refusedBy.unique);
    // Not even once the first is dissolved: the record is for the life of that disposal event.
    await db.run(`UPDATE "completed_load" SET "dissolved_at" = now() WHERE "id" = $1`, [
      linked.completedLoad,
    ]);
    expect(await refusedRow('completed_load', again)).toBe(refusedBy.unique);
    // Its disposal is one of its own project's field events.
    expect(
      await refusedRow(
        'completed_load',
        completedLoadLike(p2Disposal, { ticket_number: '101040' }),
      ),
    ).toBe(refusedBy.foreignKey);
  });

  it('AC-06-145 keeps a quantity that can be one: a call 0 to 100, nothing below nought, a share only of a weight', async () => {
    const { disposal } = await ticket101003();
    await asTheWorker();
    for (const [what, wrong] of [
      ['a blank number', { ticket_number: ' ' }],
      ['a call over 100', { load_call: 101 }],
      ['a call below nought', { load_call: -1 }],
      ['a capacity below nought', { capacity_cy: -1 }],
      ['a volume below nought', { volume_cy: '-0.01' }],
      ['a weight below nought', { weight_tons: '-0.0001' }],
      ['a count below nought', { carried_count: -1 }],
      ['a share of no weight', { weight_is_share: true }],
    ] as const) {
      expect(await refusedRow('completed_load', completedLoadLike(disposal, wrong)), what).toBe(
        refusedBy.check,
      );
    }
    expect(
      await refusedRow('completed_load', completedLoadLike(disposal, { quantity_source: 'GUESS' })),
    ).toBe(refusedBy.badValue);
    // A tandem's share of one weight, and a load of stumps counted from the tickets it carries.
    await add(
      'completed_load',
      completedLoadLike(disposal, {
        quantity_source: 'SCALE_WEIGHT',
        weight_tons: '7.3300',
        weight_is_share: true,
        carried_count: 3,
      }),
    );
  });

  it('AC-06-146 a collection that is a live row of one completed load can’t be a live row of another, and a ticket number is one live load’s', async () => {
    const { world } = tested;
    const linked = world.loads.l101001;
    const { collection, disposal } = await ticket101003();
    await asTheWorker();
    // 101003 while 101001 is live: its number is taken, and so is its collection.
    expect(
      await refusedRow('completed_load', completedLoadLike(disposal, { ticket_number: '101001' })),
    ).toBe(refusedBy.exclusion);
    const load = await add('completed_load', completedLoadLike(disposal));
    expect(
      await refusedRow('completed_load_collection', collectionRowLike(load, linked.collection)),
    ).toBe(refusedBy.exclusion);
    expect(await add('completed_load_collection', collectionRowLike(load, collection))).toEqual(
      expect.any(String),
    );
    // Another project's load may carry the same number.
    await asThePhone();
    const p2Disposal = await synced({
      project_id: world.p2,
      assignment_id: world.assignments.p2,
      cert_number: '730416',
      certification_id: world.certifications.p2c730416,
      kind: 'DISPOSAL',
      ticket_number: '101003',
      load_call: 50,
    });
    await asTheWorker();
    await add(
      'completed_load',
      completedLoadLike(p2Disposal, {
        project_id: world.p2,
        capacity_cy: 48,
        load_call: 50,
        volume_cy: '24.00',
      }),
    );
  });

  it('AC-06-148 a completed load whose ticket is no longer whole is marked dissolved, never deleted; its collection and its number are free again, and the mark is cleared when the ticket is whole', async () => {
    const { db, world } = tested;
    const linked = world.loads.l101001;
    const { disposal } = await ticket101003();
    await asTheWorker();
    for (const table of ['completed_load', 'completed_load_collection']) {
      const id = table === 'completed_load' ? linked.completedLoad : linked.completedLoadCollection;
      expect((await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id])).code, table).toBe(
        refusedBy.grant,
      );
    }
    const dissolve = async (at: string | null): Promise<void> => {
      await db.run(`UPDATE "completed_load" SET "dissolved_at" = $2 WHERE "id" = $1`, [
        linked.completedLoad,
        at,
      ]);
      await db.run(`UPDATE "completed_load_collection" SET "dissolved_at" = $2 WHERE "id" = $1`, [
        linked.completedLoadCollection,
        at,
      ]);
    };
    await dissolve('2026-10-13T15:00:00Z');
    expect(
      await db.one(
        `SELECT (SELECT count(*)::int FROM "completed_load" WHERE "id" = $1 AND "dissolved_at" IS NOT NULL) AS loads,
           (SELECT count(*)::int FROM "completed_load_collection" WHERE "id" = $2 AND "dissolved_at" IS NOT NULL) AS rows`,
        [linked.completedLoad, linked.completedLoadCollection],
      ),
    ).toEqual({ loads: 1, rows: 1 });
    // The worker sets its events back to PENDING (its own columns).
    expect(
      await db.run(`UPDATE "field_event" SET "status" = 'PENDING' WHERE "id" = ANY($1)`, [
        [linked.collection, linked.disposal],
      ]),
    ).toBe(2);
    // The collection, now free, joins the load it was renumbered to.
    const other = await add('completed_load', completedLoadLike(disposal));
    const taken = await add(
      'completed_load_collection',
      collectionRowLike(other, linked.collection),
    );
    // While that row is live the old one can't come back to life.
    expect(
      (
        await db.refused(
          `UPDATE "completed_load_collection" SET "dissolved_at" = NULL WHERE "id" = $1`,
          [linked.completedLoadCollection],
        )
      ).code,
    ).toBe(refusedBy.exclusion);
    // Whole again: the new row dissolved in its turn, the mark on the old one cleared.
    await db.run(`UPDATE "completed_load_collection" SET "dissolved_at" = now() WHERE "id" = $1`, [
      taken,
    ]);
    await dissolve(null);
    expect(
      await db.one(`SELECT "dissolved_at" FROM "completed_load" WHERE "id" = $1`, [
        linked.completedLoad,
      ]),
    ).toEqual({ dissolved_at: null });
    // Every step is in the audit log, by the system actor.
    expect(
      await db.rows(
        `SELECT "operation"::text, "changed_fields" AS changed, "actor_id"::text AS actor, "domain"::text
         FROM "audit_record" WHERE "table_name" = 'completed_load' AND "record_id" = $1
           AND "operation" = 'UPDATE' ORDER BY "id"`,
        [linked.completedLoad],
      ),
    ).toEqual([
      { operation: 'UPDATE', changed: ['dissolved_at'], actor: world.worker, domain: 'BILLING' },
      { operation: 'UPDATE', changed: ['dissolved_at'], actor: world.worker, domain: 'BILLING' },
    ]);
  });
});

describe('a completed haul-out', () => {
  // 201004: three piles into the walking floor at Marsh Road TDSR, one dump at Cypress Creek
  // Landfill, weighed.
  async function ticket201004(): Promise<{ piles: string[]; disposal: string }> {
    const { world } = tested;
    await asTheBackOffice();
    const cypressCreek = await add(
      'disposal_site',
      siteLike(world, world.siteTypes.finalDisposal, {
        name: 'Cypress Creek Landfill',
        permit_number: 'FDEP-LF-2026-0077',
      }),
    );
    const haulOut = {
      workflow: 'HAUL_OUT',
      ticket_number: '201004',
      cert_number: '730419',
      certification_id: world.certifications.c730419,
    };
    await asThePhone();
    const piles: string[] = [];
    for (const [suffix, call, ended] of [
      ['A', 10, '2026-10-13T19:30:00Z'],
      ['B', 35, '2026-10-13T19:45:00Z'],
      ['C', 85, '2026-10-13T20:05:00Z'],
    ] as const) {
      piles.push(
        await synced({
          ...haulOut,
          kind: 'HAUL_OUT_COLLECTION',
          split_suffix: suffix,
          load_call: call,
          site_id: world.site,
          started_at: '2026-10-13T19:20:00Z',
          ended_at: ended,
        }),
      );
    }
    const disposal = await synced({
      ...haulOut,
      kind: 'HAUL_OUT_DISPOSAL',
      site_id: cypressCreek,
      started_at: '2026-10-13T21:10:00Z',
      ended_at: '2026-10-13T21:15:00Z',
    });
    return { piles, disposal };
  }

  const completedHaulOutLike = (disposalEventId: string, more: Row = {}): Row => ({
    project_id: tested.world.p1,
    ticket_number: '201004',
    disposal_event_id: disposalEventId,
    quantity_source: 'SCALE_WEIGHT',
    capacity_cy: 110,
    load_call: 85,
    volume_cy: '93.50',
    weight_tons: '24.0000',
    weight_is_share: false,
    updated_at: '2026-10-13T22:00:00Z',
    ...more,
  });

  const pileRowLike = (
    haulOut: string,
    event: string,
    [suffix, added, share, cy, tons]: readonly [string, number, string, string, string],
  ): Row => ({
    project_id: tested.world.p1,
    completed_haul_out_id: haulOut,
    collection_event_id: event,
    split_suffix: suffix,
    pile_load_call: added,
    share_fraction: share,
    volume_cy: cy,
    weight_tons: tons,
  });

  // What each pile added, its share of the 85%, its CY of 110 and its tons of 24.00.
  const shares = [
    ['A', 10, '0.11764706', '11.00', '2.8200'],
    ['B', 25, '0.29411765', '27.50', '7.0600'],
    ['C', 50, '0.58823529', '55.00', '14.1200'],
  ] as const;

  it('AC-06-21 a split haul-out of three piles is one completed haul-out with a row for each haul-out collection, the shares summing to the haul-out’s', async () => {
    const { db } = tested;
    const { piles, disposal } = await ticket201004();
    await asTheWorker();
    const haulOut = await add('completed_haul_out', completedHaulOutLike(disposal));
    for (const [index, share] of shares.entries()) {
      await add('completed_haul_out_collection', pileRowLike(haulOut, piles[index] ?? '', share));
    }
    expect(
      await db.one(
        `SELECT count(*)::int AS piles, sum("pile_load_call")::int AS added,
           sum("volume_cy")::text AS cy, sum("weight_tons")::text AS tons,
           (SELECT count(*)::int FROM "completed_haul_out" WHERE "ticket_number" = '201004') AS haul_outs
         FROM "completed_haul_out_collection" WHERE "completed_haul_out_id" = $1`,
        [haulOut],
      ),
    ).toEqual({ piles: 3, added: 85, cy: '93.50', tons: '24.0000', haul_outs: 1 });
  });

  it('AC-06-145, AC-06-146 a haul-out dumps once, its number is one live haul-out’s, and a haul-out collection is a live row of one completed haul-out', async () => {
    const { db, world } = tested;
    const { piles, disposal } = await ticket201004();
    await asTheWorker();
    const haulOut = await add('completed_haul_out', completedHaulOutLike(disposal));
    const a = await add(
      'completed_haul_out_collection',
      pileRowLike(haulOut, piles[0] ?? '', shares[0]),
    );
    expect(
      await refusedRow(
        'completed_haul_out',
        completedHaulOutLike(disposal, { ticket_number: '201009' }),
      ),
    ).toBe(refusedBy.unique);
    // A haul-out disposal that isn't 201004's, for a second completed haul-out to stand on.
    await asThePhone();
    const another = await synced({
      workflow: 'HAUL_OUT',
      kind: 'HAUL_OUT_DISPOSAL',
      ticket_number: '201005',
      cert_number: '730419',
      certification_id: world.certifications.c730419,
    });
    await asTheWorker();
    expect(await refusedRow('completed_haul_out', completedHaulOutLike(another))).toBe(
      refusedBy.exclusion,
    );
    const second = await add(
      'completed_haul_out',
      completedHaulOutLike(another, { ticket_number: '201005' }),
    );
    expect(
      await refusedRow(
        'completed_haul_out_collection',
        pileRowLike(second, piles[0] ?? '', ['', 85, '1', '93.50', '24.0000']),
      ),
    ).toBe(refusedBy.exclusion);
    // A second live row under one suffix of the same haul-out is refused too.
    expect(
      await refusedRow(
        'completed_haul_out_collection',
        pileRowLike(haulOut, piles[1] ?? '', shares[0]),
      ),
    ).toBe(refusedBy.exclusion);
    // Dissolved, the row frees its collection; nothing is deleted.
    await db.run(
      `UPDATE "completed_haul_out_collection" SET "dissolved_at" = now() WHERE "id" = $1`,
      [a],
    );
    await add(
      'completed_haul_out_collection',
      pileRowLike(second, piles[0] ?? '', ['', 85, '1', '93.50', '24.0000']),
    );
    expect(
      (await db.refused(`DELETE FROM "completed_haul_out_collection" WHERE "id" = $1`, [a])).code,
    ).toBe(refusedBy.grant);
  });

  it('AC-06-21 a haul-out never takes its quantity from carried tickets, and its figures are held as a load’s are', async () => {
    const { world } = tested;
    const { piles, disposal } = await ticket201004();
    await asTheWorker();
    for (const [what, wrong] of [
      ['a count of carried tickets', { quantity_source: 'CARRIED_TICKETS' }],
      ['a call over 100', { load_call: 101 }],
      ['a weight below nought', { weight_tons: '-1' }],
      ['a share of no weight', { weight_tons: null, weight_is_share: true }],
      ['a blank number', { ticket_number: '' }],
    ] as const) {
      expect(
        await refusedRow('completed_haul_out', completedHaulOutLike(disposal, wrong)),
        what,
      ).toBe(refusedBy.check);
    }
    expect(
      await refusedRow(
        'completed_haul_out',
        completedHaulOutLike(world.loads.l102001.disposal, { ticket_number: '201009' }),
      ),
    ).toBe(refusedBy.foreignKey);
    const haulOut = await add('completed_haul_out', completedHaulOutLike(disposal));
    for (const [what, wrong] of [
      ['a suffix in small letters', { split_suffix: 'a' }],
      ['a share past the whole', { share_fraction: '1.5' }],
      ['a mileage with no source', { mileage: '12.5' }],
    ] as const) {
      expect(
        await refusedRow('completed_haul_out_collection', {
          ...pileRowLike(haulOut, piles[0] ?? '', shares[0]),
          ...wrong,
        }),
        what,
      ).toBe(refusedBy.check);
    }
    expect(
      await refusedRow('completed_haul_out_collection', {
        ...pileRowLike(haulOut, piles[0] ?? '', shares[0]),
        collection_event_id: world.loads.l102001.collection,
      }),
    ).toBe(refusedBy.foreignKey);
  });
});

describe('a flag', () => {
  it('AC-06-137 its code is one of the catalogue’s, exactly the codes of spec/FLAGS.md in its order: a flag that isn’t on that page can’t be raised', async () => {
    const { db } = tested;
    const page = readFileSync(new URL('../../../spec/FLAGS.md', import.meta.url), 'utf8');
    // A row of the catalogue starts with its code; a withdrawn one is struck through.
    const catalogue = [...page.matchAll(/^\| `([A-Z0-9_]+)` \|/gm)].map((match) => match[1]);
    expect(catalogue).toHaveLength(79);
    expect(new Set(catalogue).size).toBe(79);
    const codes = await db.rows<{ code: string }>(
      `SELECT unnest(enum_range(NULL::flag_code))::text AS code`,
    );
    expect(codes.map((row) => row.code)).toEqual(catalogue);
    const { disposal } = await ticket101003();
    await asTheWorker();
    for (const code of ['REVIEW_ORIGINAL_CERTIFICATION', 'HELPER_NOT_FOUND', 'LOAD_CALL_ODD']) {
      expect(await refusedRow('flag', flagLike(disposal, { code })), code).toBe(refusedBy.badValue);
    }
  });

  it('AC-06-138 keeps its code, its message, the facts it was raised on with their hash, and what it does to the money', async () => {
    const { db, world } = tested;
    const { disposal } = await ticket101003();
    await asTheWorker();
    const run = await add('reconciliation_run', runLike());
    const flag = await add('flag', flagLike(disposal, { reconciliation_run_id: run }));
    expect(
      await db.one(
        `SELECT "workflow"::text, "ticket_number" AS ticket, "code"::text, "message", "facts",
           "facts_sha256" AS hash, "billing"::text, "cleared_at" AS cleared
         FROM "flag" WHERE "id" = $1`,
        [flag],
      ),
    ).toEqual({
      workflow: 'LOAD',
      ticket: '101003',
      code: 'LOAD_CALL_HIGH',
      message: 'Ticket 101003: load call 96%. Flagged for review.',
      facts: { loadCall: 96, highLimit: 95 },
      hash: sha256('a'),
      billing: 'BILLS',
      cleared: null,
    });
    // The three outcomes of spec/FLAGS.md §1, and no other; a line's flag names its # and pay item.
    await add(
      'flag',
      flagLike(disposal, {
        code: 'QUANTITY_MISSING_FOR_PAY_ITEM',
        billing: 'LINE_NOT_BILLED',
        slot: 2,
        pay_item_id: world.payItems.vegHaul15,
      }),
    );
    await add('flag', flagLike(disposal, { code: 'LOAD_CALL_ZERO', billing: 'NOT_BILLED' }));
    expect(await refusedRow('flag', flagLike(disposal, { billing: 'HALF' }))).toBe(
      refusedBy.badValue,
    );
    for (const [what, wrong] of [
      ['a blank message', { message: ' ' }],
      ['facts that are no object', { facts: '[96, 95]' }],
      ['a hash that isn’t one', { facts_sha256: 'ABC' }],
      ['a workflow with no number', { ticket_number: null }],
      ['a number with no workflow', { workflow: null }],
      ['a blank number', { ticket_number: ' ' }],
      ['nothing it is about', { workflow: null, ticket_number: null, field_event_id: null }],
      ['cleared before it was raised', { cleared_at: '2026-10-12T21:00:00Z' }],
    ] as const) {
      expect(await refusedRow('flag', flagLike(disposal, wrong)), what).toBe(refusedBy.check);
    }
    for (const what of ['code', 'message', 'facts', 'facts_sha256', 'billing', 'raised_at']) {
      expect(await refusedRow('flag', flagLike(disposal, { [what]: null })), what).toBe(
        refusedBy.notNull,
      );
    }
    // What it is about is its own project's: a field event, a pay item, a run.
    const p2Run = await add('reconciliation_run', runLike({ project_id: world.p2 }));
    for (const [what, wrong] of [
      ['a field event of another project', { field_event_id: world.loads.l102001.disposal }],
      ['a certification of another project', { certification_id: world.certifications.p2c730416 }],
      ['a run of another project', { reconciliation_run_id: p2Run }],
    ] as const) {
      expect(await refusedRow('flag', flagLike(disposal, wrong)), what).toBe(refusedBy.foreignKey);
    }
    // Cleared when its facts no longer raise it; never deleted.
    expect(
      await db.run(`UPDATE "flag" SET "cleared_at" = '2026-10-13T15:00:00Z' WHERE "id" = $1`, [
        flag,
      ]),
    ).toBe(1);
    expect((await db.refused(`DELETE FROM "flag" WHERE "id" = $1`, [flag])).code).toBe(
      refusedBy.grant,
    );
  });

  it('AC-06-138 one on a record that isn’t a ticket names the record: a certification, a site', async () => {
    const { db, world } = tested;
    await asTheWorker();
    const onRecord = (more: Row): Row => ({
      project_id: world.p1,
      facts: '{}',
      facts_sha256: sha256('c'),
      billing: 'BILLS',
      raised_at: '2026-10-12T22:00:00Z',
      ...more,
    });
    await add(
      'flag',
      onRecord({
        certification_id: world.certifications.c730416,
        code: 'CERTIFICATION_PHOTO_MISSING',
        message: 'Certification 730416: no left side photo. Flagged for review.',
      }),
    );
    await add(
      'flag',
      onRecord({
        disposal_site_id: world.site,
        code: 'PERMIT_OUTSTANDING',
        message: 'Marsh Road TDSR: permit outstanding. Flagged for review.',
      }),
    );
    expect(
      await db.one(
        `SELECT count(*)::int AS flags FROM "flag" WHERE "project_id" = $1 AND "ticket_number" IS NULL`,
        [world.p1],
      ),
    ).toEqual({ flags: 2 });
  });
});

describe('a run of the worker', () => {
  it('AC-06-152 is recorded: its project, what started it, when, how many tickets it worked and how many failed, with one decision for each ticket', async () => {
    const { db, world } = tested;
    await asTheWorker();
    const run = await add('reconciliation_run', runLike());
    const decided = (more: Row = {}): Row => ({
      reconciliation_run_id: run,
      workflow: 'LOAD',
      ticket_number: '101001',
      status: 'COMPLETED',
      summary: JSON.stringify({ fieldEvents: ['COLLECTION', 'DISPOSAL'] }),
      ...more,
    });
    await add('reconciliation_decision', decided());
    await add(
      'reconciliation_decision',
      decided({ ticket_number: '101003', status: 'MANUAL_REVIEW' }),
    );
    // A haul-out and a unit rate ticket may carry a load's number: each is its own ticket.
    await add('reconciliation_decision', decided({ workflow: 'UNIT_RATE', status: 'PENDING' }));
    await add(
      'reconciliation_decision',
      decided({ ticket_number: '101035', status: 'MANUAL_REVIEW', error: 'No certification row' }),
    );
    expect(await refusedRow('reconciliation_decision', decided())).toBe(refusedBy.unique);
    expect(
      await db.run(
        `UPDATE "reconciliation_run" SET "finished_at" = '2026-10-12T22:00:04Z', "tickets_done" = 3,
           "tickets_failed" = 1 WHERE "id" = $1`,
        [run],
      ),
    ).toBe(1);
    expect(
      await db.one(
        `SELECT r."project_id"::text AS project, r."trigger"::text, r."tickets_done" AS done,
           r."tickets_failed" AS failed, r."requested_by_id" AS requested_by,
           (SELECT count(*)::int FROM "reconciliation_decision" d WHERE d."reconciliation_run_id" = r."id") AS decisions
         FROM "reconciliation_run" r WHERE r."id" = $1`,
        [run],
      ),
    ).toEqual({
      project: world.p1,
      trigger: 'SYNC',
      done: 3,
      failed: 1,
      requested_by: null,
      decisions: 4,
    });
    // What starts a run is one of four things; a person may be named as having asked.
    for (const trigger of ['CORRECTION', 'SETUP_CHANGE', 'REPROCESS']) {
      await add('reconciliation_run', runLike({ trigger, requested_by_id: world.admin }));
    }
    expect(await refusedRow('reconciliation_run', runLike({ trigger: 'NIGHTLY' }))).toBe(
      refusedBy.badValue,
    );
    for (const [what, wrong] of [
      ['finished before it started', { finished_at: '2026-10-12T21:59:59Z' }],
      ['fewer than no tickets done', { tickets_done: -1 }],
      ['fewer than no tickets failed', { tickets_failed: -1 }],
    ] as const) {
      expect(await refusedRow('reconciliation_run', runLike(wrong)), what).toBe(refusedBy.check);
    }
    for (const [what, wrong] of [
      ['a blank number', { ticket_number: '' }],
      ['a summary that is no object', { ticket_number: '101002', summary: '"done"' }],
      ['a blank error', { ticket_number: '101002', error: ' ' }],
    ] as const) {
      expect(await refusedRow('reconciliation_decision', decided(wrong)), what).toBe(
        refusedBy.check,
      );
    }
    expect(
      await refusedRow(
        'reconciliation_decision',
        decided({ ticket_number: '101002', status: 'FAILED' }),
      ),
    ).toBe(refusedBy.badValue);
  });
});

describe('who writes the derived records', () => {
  it('AC-06-144 only the worker’s login writes a completed load or haul-out, their collection rows, a flag, a run and a run’s decision: the API’s can’t, by an insert or an update, and nobody deletes one', async () => {
    const { db, world } = tested;
    const linked = world.loads.l101001;
    const { collection, disposal } = await ticket101003();
    await asThePhone();
    const haulOutDisposal = await synced({
      workflow: 'HAUL_OUT',
      kind: 'HAUL_OUT_DISPOSAL',
      ticket_number: '201001',
      cert_number: '730419',
      certification_id: world.certifications.c730419,
    });
    const pile = await synced({
      workflow: 'HAUL_OUT',
      kind: 'HAUL_OUT_COLLECTION',
      ticket_number: '201001',
      cert_number: '730419',
      certification_id: world.certifications.c730419,
      site_id: world.site,
      load_call: 90,
    });
    const haulOutLike = (): Row => ({
      project_id: world.p1,
      ticket_number: '201001',
      disposal_event_id: haulOutDisposal,
      quantity_source: 'LOAD_CALL',
      capacity_cy: 110,
      load_call: 90,
      volume_cy: '99.00',
      weight_is_share: false,
      updated_at: '2026-10-12T22:00:00Z',
    });
    // The worker writes one of each.
    await asTheWorker();
    const run = await add('reconciliation_run', runLike());
    const load = await add('completed_load', completedLoadLike(disposal));
    const haulOut = await add('completed_haul_out', haulOutLike());
    const written: Record<string, string> = {
      reconciliation_run: run,
      completed_load: load,
      completed_load_collection: await add(
        'completed_load_collection',
        collectionRowLike(load, collection),
      ),
      completed_haul_out: haulOut,
      completed_haul_out_collection: await add('completed_haul_out_collection', {
        project_id: world.p1,
        completed_haul_out_id: haulOut,
        collection_event_id: pile,
        split_suffix: '',
        pile_load_call: 90,
        share_fraction: '1',
        volume_cy: '99.00',
      }),
      flag: await add('flag', flagLike(disposal)),
      reconciliation_decision: await add('reconciliation_decision', {
        reconciliation_run_id: run,
        workflow: 'LOAD',
        ticket_number: '101003',
        status: 'MANUAL_REVIEW',
        summary: '{}',
      }),
    };
    // A person's path is the API's login, as Dana and as a phone: it reads them and writes none.
    for (const act of [asTheBackOffice, asThePhone]) {
      await act();
      const attempts: [string, Row][] = [
        ['completed_load', completedLoadLike(linked.disposal, { ticket_number: '101041' })],
        ['completed_load_collection', collectionRowLike(load, linked.collection)],
        ['completed_haul_out', { ...haulOutLike(), ticket_number: '201041' }],
        [
          'completed_haul_out_collection',
          {
            project_id: world.p1,
            completed_haul_out_id: haulOut,
            collection_event_id: pile,
            split_suffix: 'B',
            pile_load_call: 1,
            share_fraction: '1',
          },
        ],
        ['flag', flagLike(disposal)],
        ['reconciliation_run', runLike()],
        [
          'reconciliation_decision',
          {
            reconciliation_run_id: run,
            workflow: 'LOAD',
            ticket_number: '101002',
            status: 'COMPLETED',
            summary: '{}',
          },
        ],
      ];
      for (const [table, row] of attempts) {
        expect(await refusedRow(table, row), `insert ${table}`).toBe(refusedBy.grant);
      }
      for (const [table, id] of Object.entries(written)) {
        expect(await db.rows(`SELECT 1 FROM "${table}" WHERE "id" = $1`, [id]), table).toHaveLength(
          1,
        );
        expect(
          (await db.refused(`UPDATE "${table}" SET "id" = "id" WHERE "id" = $1`, [id])).code,
          `update ${table}`,
        ).toBe(refusedBy.grant);
      }
    }
    // Nobody deletes one: no login holds the right, and the owner is refused by the table itself.
    for (const [table, id] of Object.entries(written)) {
      for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
        await db.as(login);
        expect(
          (await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id])).code,
          `${login} deletes ${table}`,
        ).toBe(refusedBy.grant);
      }
      await db.administer();
      await db.actor(world.worker, 'SYSTEM');
      expect(
        (await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id])).code,
        `the owner deletes ${table}`,
      ).toBe(refusedBy.trigger);
      expect((await db.refused(`TRUNCATE "${table}" CASCADE`)).code, `truncate ${table}`).toBe(
        refusedBy.trigger,
      );
    }
    // Each of the worker's writes is in the audit log, by the system actor, in its domain.
    expect(
      await db.rows(
        `SELECT "table_name" AS "table", "domain"::text, "actor_id"::text AS actor, "source"::text
         FROM "audit_record" WHERE "record_id" = ANY($1) ORDER BY 1`,
        [Object.values(written)],
      ),
    ).toEqual(
      [
        ['completed_haul_out', 'BILLING'],
        ['completed_haul_out_collection', 'BILLING'],
        ['completed_load', 'BILLING'],
        ['completed_load_collection', 'BILLING'],
        ['flag', 'OPERATIONS'],
        ['reconciliation_decision', 'OPERATIONS'],
        ['reconciliation_run', 'OPERATIONS'],
      ].map(([table, domain]) => ({ table, domain, actor: world.worker, source: 'SYSTEM' })),
    );
  });

  it('a client user and an auditor see their project’s completed loads, haul-outs, collection rows and flags; a contractor user its own tickets’ and no flag; no viewer reads a run or its decisions', async () => {
    const { db, world } = tested;
    const { disposal } = await ticket101003();
    await asTheWorker();
    const run = await add('reconciliation_run', runLike());
    await add('flag', flagLike(disposal, { reconciliation_run_id: run }));
    await db.administer();
    const counts = async (viewer: string): Promise<Row> => {
      await db.viewer(viewer);
      await db.as('adms_readonly');
      const row = await db.one(
        `SELECT (SELECT count(*)::int FROM "viewer_completed_load") AS loads,
           (SELECT count(*)::int FROM "viewer_completed_load_collection") AS rows,
           (SELECT count(*)::int FROM "viewer_completed_haul_out") AS haul_outs,
           (SELECT count(*)::int FROM "viewer_completed_haul_out_collection") AS piles,
           (SELECT count(*)::int FROM "viewer_flag") AS flags`,
      );
      await db.administer();
      return row;
    };
    // The client user is given P1; the auditor P1 and P2, so P2's one load too.
    expect(await counts(world.clientViewer)).toEqual({
      loads: 2,
      rows: 2,
      haul_outs: 0,
      piles: 0,
      flags: 1,
    });
    expect(await counts(world.auditor)).toEqual({
      loads: 3,
      rows: 3,
      haul_outs: 0,
      piles: 0,
      flags: 1,
    });
    // Coastline's contractor user: P1's two loads are on Coastline's certifications; a flag is
    // never a contractor user's (ADR-361; AC-02-78).
    expect(await counts(world.coastlineViewer)).toEqual({
      loads: 2,
      rows: 2,
      haul_outs: 0,
      piles: 0,
      flags: 0,
    });
    await db.viewer(world.auditor);
    await db.as('adms_readonly');
    for (const table of ['reconciliation_run', 'reconciliation_decision']) {
      expect((await db.refused(`SELECT 1 FROM "${table}"`)).code, table).toBe(refusedBy.grant);
    }
  });
});
