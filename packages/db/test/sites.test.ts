// REQ-104, 105q, 124b: disposal sites in full, their labels, tipping fees and own shapes, and the
// project map (spec/DATA-MODEL.md §3 "Sites and the map"; ADR-005, 111, 135, 141, 142, 144, 145,
// 173, 208, 215, 222, 298, 311). Section F of spec/acceptance/01-setup.md, proven at the database:
// AC-01-52, 53, 55…59, the database's half of AC-01-54 (setup's words are packages/domain's
// SiteFacts), and AC-01-78 for these tables. The sites are P1's as the example world enters them
// from the golden mission §1: Marsh Road TDSR and Bayline County Landfill.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf, payItemLike, siteLike, without } from './support/example-world.ts';
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

async function refusedRow(table: string, row: Record<string, unknown>): Promise<string> {
  return (await tested.db.refused(...insertOf(table, row))).code;
}

// A value of one of the firm's lists, by the name it ships with: its id.
async function picked(list: string, name: string): Promise<string> {
  return (
    await tested.db.one<{ id: string }>(`SELECT "id"::text FROM "${list}" WHERE "name" = $1`, [
      name,
    ])
  ).id;
}

// A rectangle as a GeoJSON Polygon, longitude first, its ring closed; and its bounding box's
// columns. P1's boundary runs from 82.60° W to 82.20° W and 27.80° N to 28.20° N (made up, round
// Bayline County; spec/CONVENTIONS.md §6).
function rectangle(west: number, south: number, east: number, north: number) {
  const ring = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  return {
    ring,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [ring] }),
    box: {
      west_longitude: west.toFixed(8),
      south_latitude: south.toFixed(8),
      east_longitude: east.toFixed(8),
      north_latitude: north.toFixed(8),
    },
  };
}

const p1Boundary = rectangle(-82.6, 27.8, -82.2, 28.2);
// Its three zones, west to east.
const p1Zones = {
  'Zone 1': rectangle(-82.6, 27.8, -82.47, 28.2),
  'Zone 2': rectangle(-82.47, 27.8, -82.33, 28.2),
  'Zone 3': rectangle(-82.33, 27.8, -82.2, 28.2),
};

// A map version of P1 as Dana loads it, with the zones it was loaded with.
async function mapLoaded(
  version: number,
  zones: Record<string, ReturnType<typeof rectangle>>,
  more: Record<string, unknown> = {},
): Promise<string> {
  const { world } = tested;
  const id = await add('map_version', {
    project_id: world.p1,
    version,
    source: 'UPLOAD',
    source_name: `bayline-row-zones-v${String(version)}.geojson`,
    zone_name_field: 'ZONE_NAME',
    boundary: p1Boundary.geometry,
    ...p1Boundary.box,
    uploaded_file_key: `maps/p1/v${String(version)}.geojson`,
    loaded_by_id: world.admin,
    ...more,
  });
  for (const [name, shape] of Object.entries(zones)) {
    await add('zone', { map_version_id: id, name, geometry: shape.geometry, ...shape.box });
  }
  return id;
}

// A shape of Marsh Road TDSR's own, as Dana draws it.
function areaOf(siteId: string, version: number): Record<string, unknown> {
  const shape = rectangle(-82.3992, 27.9798, -82.3951, 27.9831);
  return {
    site_id: siteId,
    version,
    geometry: shape.geometry,
    ...shape.box,
    source: 'DRAWN',
    created_by_id: tested.world.admin,
  };
}

describe('a disposal site', () => {
  it('AC-01-52 is entered on each project that uses it: Marsh Road TDSR on P2 is a record of its own', async () => {
    const { db, world } = tested;
    await asTheApi();
    const onP2 = await add(
      'disposal_site',
      siteLike({ p1: world.p2 }, world.siteTypes.tdsr, {
        name: 'Marsh Road TDSR',
        site_type_key: 'TDSR',
        haul_outs_leave_here: true,
      }),
    );
    expect(
      await db.rows(
        `SELECT s."name", p."name" AS project FROM "disposal_site" s
         JOIN "project" p ON p."id" = s."project_id"
         WHERE s."name" = 'Marsh Road TDSR' AND s."project_id" IN ($1, $2) ORDER BY p."name"`,
        [world.p1, world.p2],
      ),
    ).toEqual([
      { name: 'Marsh Road TDSR', project: 'Bayline County PPDR, Hurricane Delphine' },
      { name: 'Marsh Road TDSR', project: 'Bayline County ROW, Hurricane Delphine' },
    ]);
    expect(onP2).not.toBe(world.site);
    // A site belongs to one project: it has no project of none, and nothing lets another project
    // name it (an assignment's site: assignments.test.ts; a tipping fee: below).
    expect(
      await refusedRow(
        'disposal_site',
        without(siteLike(world, world.siteTypes.tdsr), 'project_id'),
      ),
    ).toBe(refusedBy.notNull);
  });

  it('AC-01-53 Bayline County Landfill holds its type, its four facts, GPS as exact decimals, its dates, permit and short code', async () => {
    const { db, world } = tested;
    await asTheApi();
    expect(
      await db.one(
        `SELECT s."name", t."name" AS site_type, s."takes_loads", s."haul_outs_leave_here",
           s."charges_tipping_fee", s."ineligible_site", s."latitude"::text, s."longitude"::text,
           s."activation_date"::text, s."close_date", s."permit_number", s."short_code"
         FROM "disposal_site" s JOIN "site_type" t ON t."id" = s."site_type_id"
         WHERE s."id" = $1`,
        [world.landfill],
      ),
    ).toEqual({
      name: 'Bayline County Landfill',
      site_type: 'Final Disposal',
      takes_loads: true,
      haul_outs_leave_here: false,
      charges_tipping_fee: true,
      ineligible_site: false,
      latitude: '27.89340000',
      longitude: '-82.32160000',
      activation_date: '2026-10-12',
      close_date: null,
      permit_number: 'FDEP-SW-0098',
      short_code: 'BCL',
    });
    // A close date is set when it closes; it is never before the day it opened.
    expect(
      await db.run(`UPDATE "disposal_site" SET "close_date" = '2027-01-31' WHERE "id" = $1`, [
        world.landfill,
      ]),
    ).toBe(1);
    const backwards = await db.refused(
      `UPDATE "disposal_site" SET "close_date" = '2026-10-11' WHERE "id" = $1`,
      [world.landfill],
    );
    expect(backwards.code).toBe(refusedBy.check);
    expect(backwards.message).toContain('"disposal_site_dates_check"');
  });

  it('AC-01-53 every fact, its type, GPS and activation date are stated: none has a default', async () => {
    const { world } = tested;
    await asTheApi();
    for (const column of [
      'name',
      'site_type_id',
      'takes_loads',
      'haul_outs_leave_here',
      'charges_tipping_fee',
      'ineligible_site',
      'latitude',
      'longitude',
      'activation_date',
    ]) {
      expect(
        await refusedRow('disposal_site', without(siteLike(world, world.siteTypes.tdsr), column)),
        column,
      ).toBe(refusedBy.notNull);
    }
    // Its type is one of the firm's list, never typed.
    expect(await refusedRow('disposal_site', siteLike(world, world.payableTypes.vegetative))).toBe(
      refusedBy.foreignKey,
    );
  });

  it('AC-01-53 its GPS is a point on the earth, kept to eight decimal places', async () => {
    const { db, world } = tested;
    await asTheApi();
    const transfer = await picked('site_type', 'Transfer Station');
    for (const [latitude, longitude] of [
      ['90.00000001', '-82.44730000'],
      ['-90.00000001', '-82.44730000'],
      ['27.95010000', '180.00000001'],
      ['27.95010000', '-180.00000001'],
    ] as const) {
      const refusal = await db.refused(
        ...insertOf('disposal_site', siteLike(world, transfer, { latitude, longitude })),
      );
      expect(refusal.code, `${latitude}, ${longitude}`).toBe(refusedBy.check);
      expect(refusal.message).toContain('"disposal_site_coordinates_check"');
    }
    const exact = await add(
      'disposal_site',
      siteLike(world, transfer, { latitude: '27.95010012', longitude: '-82.44730098' }),
    );
    expect(
      await db.one(
        `SELECT "latitude"::text, "longitude"::text FROM "disposal_site" WHERE "id" = $1`,
        [exact],
      ),
    ).toEqual({ latitude: '27.95010012', longitude: '-82.44730098' });
  });

  it('AC-01-55 saved with no permit number; work there is never refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(`UPDATE "disposal_site" SET "permit_number" = NULL WHERE "id" = $1`, [world.site]);
    expect(
      await db.one(`SELECT "name", "permit_number" FROM "disposal_site" WHERE "id" = $1`, [
        world.site,
      ]),
    ).toEqual({ name: 'Marsh Road TDSR', permit_number: null });
    // Kim's tower assignment at it is written as any other.
    await add('assignment', {
      person_id: world.monitor,
      work_date: '2026-10-12',
      project_id: world.p1,
      field_event_kinds: '{DISPOSAL}',
      site_id: world.site,
      origin: 'PLANNED',
      made_by_id: world.admin,
    });
  });
});

describe('coordinates (REQ-104)', () => {
  it('every latitude and longitude column, anywhere, is an exact decimal(38,8), never a float', async () => {
    const columns = await tested.db.rows<{ name: string; type: string }>(
      `SELECT table_name || '.' || column_name AS name,
         data_type || '(' || numeric_precision || ',' || numeric_scale || ')' AS type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND (column_name LIKE '%latitude' OR column_name LIKE '%longitude')
       ORDER BY 1`,
    );
    expect(columns.map((column) => column.name)).toEqual([
      'disposal_site.latitude',
      'disposal_site.longitude',
      'field_event.end_latitude',
      'field_event.end_longitude',
      'map_version.east_longitude',
      'map_version.north_latitude',
      'map_version.south_latitude',
      'map_version.west_longitude',
      'site_area_version.east_longitude',
      'site_area_version.north_latitude',
      'site_area_version.south_latitude',
      'site_area_version.west_longitude',
      'viewer_field_event.end_latitude',
      'viewer_field_event.end_longitude',
      'zone.east_longitude',
      'zone.north_latitude',
      'zone.south_latitude',
      'zone.west_longitude',
    ]);
    expect(columns.filter((column) => column.type !== 'numeric(38,8)')).toEqual([]);
  });
});

describe('Haul-outs leave here (the database’s half of AC-01-54)', () => {
  it('AC-01-54 ticked on Bayline County Landfill (Final Disposal), the database refuses it; Marsh Road TDSR holds it', async () => {
    const { db, world } = tested;
    await asTheApi();
    const tick = await db.refused(
      `UPDATE "disposal_site" SET "haul_outs_leave_here" = true WHERE "id" = $1`,
      [world.landfill],
    );
    expect(tick.code).toBe(refusedBy.check);
    expect(tick.message).toContain('"disposal_site_haul_outs_check"');
    // Nor can the landfill be passed off as a TDSR: the key it repeats is its type's own.
    expect(
      (
        await db.refused(
          `UPDATE "disposal_site" SET "haul_outs_leave_here" = true, "site_type_key" = 'TDSR'
           WHERE "id" = $1`,
          [world.landfill],
        )
      ).code,
    ).toBe(refusedBy.foreignKey);
    // A new site of a type with no key can't be marked either, whatever the firm calls its type.
    expect(
      await refusedRow(
        'disposal_site',
        siteLike(world, await picked('site_type', 'Transfer Station'), {
          haul_outs_leave_here: true,
        }),
      ),
    ).toBe(refusedBy.check);
    expect(
      await db.one(`SELECT "haul_outs_leave_here" FROM "disposal_site" WHERE "id" = $1`, [
        world.site,
      ]),
    ).toEqual({ haul_outs_leave_here: true });
  });

  it('AC-01-54 Marsh Road’s type changed away from TDSR/DMS while it is ticked: refused; unticked first, it changes', async () => {
    const { db, world } = tested;
    await asTheApi();
    const transfer = await picked('site_type', 'Transfer Station');
    const toTransfer = `UPDATE "disposal_site" SET "site_type_id" = $2, "site_type_key" = NULL
      WHERE "id" = $1`;
    expect((await db.refused(toTransfer, [world.site, transfer])).code).toBe(refusedBy.check);
    // Its type changed, its key left as it was: refused by the key's foreign key.
    expect(
      (
        await db.refused(`UPDATE "disposal_site" SET "site_type_id" = $2 WHERE "id" = $1`, [
          world.site,
          world.siteTypes.finalDisposal,
        ])
      ).code,
    ).toBe(refusedBy.foreignKey);
    await db.run(`UPDATE "disposal_site" SET "haul_outs_leave_here" = false WHERE "id" = $1`, [
      world.site,
    ]);
    expect(await db.run(toTransfer, [world.site, transfer])).toBe(1);
  });

  it('a built-in site type keeps its key while a site names it, even against a release', async () => {
    // Only a release writes a key (ADR-302); the key a marked site repeats holds it in place too.
    const { db, world } = tested;
    await db.as('adms_owner');
    await db.actor(world.admin, 'BACK_OFFICE');
    expect(
      (
        await db.refused(`UPDATE "site_type" SET "key" = NULL WHERE "id" = $1`, [
          world.siteTypes.tdsr,
        ])
      ).code,
    ).toBe(refusedBy.restrict);
  });
});

describe('a site’s area', () => {
  it('AC-01-56 the circle is one size per project: changed to 300 m, every P1 site without a shape uses it', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(`UPDATE "project" SET "site_circle_meters" = 300 WHERE "id" = $1`, [world.p1]);
    expect(
      await db.rows(
        `SELECT s."name", p."site_circle_meters" AS circle FROM "disposal_site" s
         JOIN "project" p ON p."id" = s."project_id"
         WHERE s."project_id" = $1
           AND NOT EXISTS (SELECT 1 FROM "site_area_version" a WHERE a."site_id" = s."id")
         ORDER BY s."name"`,
        [world.p1],
      ),
    ).toEqual([
      { name: 'Bayline County Landfill', circle: 300 },
      { name: 'Marsh Road TDSR', circle: 300 },
    ]);
    // A site has no circle of its own to set.
    const columns = await db.rows<{ column_name: string }>(
      `SELECT "column_name" FROM information_schema.columns
       WHERE "table_schema" = 'public' AND "table_name" = 'disposal_site' AND "column_name" LIKE '%circle%'`,
    );
    expect(columns).toEqual([]);
  });

  it('AC-01-56 Marsh Road drawn its own shape: a dated version; a later shape is a new version, the earlier kept', async () => {
    const { db, world } = tested;
    await asTheApi();
    const first = await add('site_area_version', areaOf(world.site, 1));
    const second = await add('site_area_version', { ...areaOf(world.site, 2), source: 'UPLOAD' });
    expect(
      await db.rows(
        `SELECT "version", "source"::text, "geometry"->>'type' AS shape,
           "effective_from" IS NOT NULL AS dated
         FROM "site_area_version" WHERE "site_id" = $1 ORDER BY "version"`,
        [world.site],
      ),
    ).toEqual([
      { version: 1, source: 'DRAWN', shape: 'Polygon', dated: true },
      { version: 2, source: 'UPLOAD', shape: 'Polygon', dated: true },
    ]);
    expect(await refusedRow('site_area_version', areaOf(world.site, 2))).toBe(refusedBy.unique);
    expect(await refusedRow('site_area_version', areaOf(world.site, 0))).toBe(refusedBy.check);
    // Neither version is ever edited or deleted, by the API or by the database's owner.
    for (const id of [first, second]) {
      await asTheApi();
      expect(
        (
          await db.refused(`UPDATE "site_area_version" SET "source" = 'DRAWN' WHERE "id" = $1`, [
            id,
          ])
        ).code,
      ).toBe(refusedBy.grant);
      await db.as('adms_owner');
      expect(
        await db.refused(`UPDATE "site_area_version" SET "source" = 'DRAWN' WHERE "id" = '${id}'`),
      ).toEqual({
        code: refusedBy.trigger,
        message: 'Open ADMS never edits a site_area_version row: a change is a new version',
      });
      expect((await db.refused(`DELETE FROM "site_area_version" WHERE "id" = '${id}'`)).code).toBe(
        refusedBy.trigger,
      );
    }
  });

  it('a shape is a GeoJSON Polygon or MultiPolygon, with its bounding box on the earth', async () => {
    const { db, world } = tested;
    await asTheApi();
    const multi = JSON.stringify({
      type: 'MultiPolygon',
      coordinates: [[rectangle(-82.4, 27.98, -82.39, 27.99).ring]],
    });
    await add('site_area_version', { ...areaOf(world.site, 1), geometry: multi });
    for (const geometry of [
      JSON.stringify({ type: 'Point', coordinates: [-82.3972, 27.9815] }),
      JSON.stringify({ type: 'Polygon' }),
      JSON.stringify([[-82.4, 27.98]]),
      JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } }),
    ]) {
      const refusal = await db.refused(
        ...insertOf('site_area_version', { ...areaOf(world.site, 2), geometry }),
      );
      expect(refusal.code, geometry).toBe(refusedBy.check);
      expect(refusal.message).toContain('"site_area_version_geometry_check"');
    }
    for (const box of [
      { south_latitude: '27.99000000', north_latitude: '27.98000000' },
      { west_longitude: '-180.00000001' },
      { north_latitude: '90.00000001' },
    ]) {
      const refusal = await db.refused(
        ...insertOf('site_area_version', { ...areaOf(world.site, 2), ...box }),
      );
      expect(refusal.code, JSON.stringify(box)).toBe(refusedBy.check);
      expect(refusal.message).toContain('"site_area_version_bounding_box_check"');
    }
  });
});

describe('a site’s tipping fee', () => {
  it('AC-01-57 Bayline County Landfill keeps the link to TIP-FEE-CY-BCL, the pay item written from it', async () => {
    const { db, world } = tested;
    await asTheApi();
    const fee = await add(
      'pay_item',
      payItemLike(world, {
        code: 'TIP-FEE-CY-BCL',
        description: 'Tipping fee, Bayline County Landfill',
        payable_type_id: await picked('payable_type', 'Tipping fee'),
      }),
    );
    await add('pay_item_rate', {
      project_id: world.p1,
      pay_item_id: fee,
      prime_id: world.coastline,
      rate: '4.0000',
    });
    const link = { project_id: world.p1, site_id: world.landfill, pay_item_id: fee };
    await add('disposal_site_tipping_fee', link);
    expect(
      await db.rows(
        `SELECT s."name" AS site, p."code" FROM "disposal_site_tipping_fee" f
         JOIN "disposal_site" s ON s."id" = f."site_id" JOIN "pay_item" p ON p."id" = f."pay_item_id"
         WHERE f."archived_at" IS NULL ORDER BY p."code"`,
      ),
    ).toEqual([{ site: 'Bayline County Landfill', code: 'TIP-FEE-CY-BCL' }]);
    expect(await refusedRow('disposal_site_tipping_fee', link)).toBe(refusedBy.unique);
  });

  it('a site keeps a link for each fee pay item written from it: per CY and per ton', async () => {
    const { db, world } = tested;
    await asTheApi();
    const tippingFee = await picked('payable_type', 'Tipping fee');
    for (const [code, unit] of [
      ['TIP-FEE-CY-BCL', 'CY'],
      ['TIP-FEE-TN-BCL', 'TN'],
    ]) {
      const fee = await add(
        'pay_item',
        payItemLike(world, { code, description: code, payable_type_id: tippingFee, unit }),
      );
      await add('disposal_site_tipping_fee', {
        project_id: world.p1,
        site_id: world.landfill,
        pay_item_id: fee,
      });
    }
    expect(
      await db.one(
        `SELECT count(*)::int AS links FROM "disposal_site_tipping_fee" WHERE "site_id" = $1`,
        [world.landfill],
      ),
    ).toEqual({ links: 2 });
  });

  it('a site’s tipping fee is its own project’s pay item, never another project’s', async () => {
    const { world } = tested;
    await asTheApi();
    const onP2 = await add(
      'pay_item',
      payItemLike(world, { project_id: world.p2, code: 'TIP-FEE-CY-BCL', description: 'P2 fee' }),
    );
    expect(
      await refusedRow('disposal_site_tipping_fee', {
        project_id: world.p1,
        site_id: world.landfill,
        pay_item_id: onP2,
      }),
    ).toBe(refusedBy.foreignKey);
    expect(
      await refusedRow('disposal_site_tipping_fee', {
        project_id: world.p2,
        site_id: world.landfill,
        pay_item_id: onP2,
      }),
    ).toBe(refusedBy.foreignKey);
  });
});

describe('a site’s labels', () => {
  it('AC-01-58 the firm’s own label "burn site" is kept on Marsh Road; taken off by archiving, put back', async () => {
    const { db, world } = tested;
    await asTheApi();
    const burnSite = await add('site_label', { name: 'burn site', position: 1 });
    const label = await add('disposal_site_label', {
      site_id: world.site,
      site_label_id: burnSite,
    });
    expect(
      await db.rows(
        `SELECT s."name" AS site, l."name" AS label FROM "disposal_site_label" d
         JOIN "disposal_site" s ON s."id" = d."site_id" JOIN "site_label" l ON l."id" = d."site_label_id"
         WHERE d."archived_at" IS NULL`,
      ),
    ).toEqual([{ site: 'Marsh Road TDSR', label: 'burn site' }]);
    expect(
      await refusedRow('disposal_site_label', { site_id: world.site, site_label_id: burnSite }),
    ).toBe(refusedBy.unique);
    const archive = `UPDATE "disposal_site_label" SET "archived_at" = $2 WHERE "id" = $1`;
    expect(await db.run(archive, [label, '2026-10-20T12:00:00Z'])).toBe(1);
    expect(await db.run(archive, [label, null])).toBe(1);
    // A label is one of the firm's list, never typed.
    expect(
      await refusedRow('disposal_site_label', {
        site_id: world.site,
        site_label_id: world.siteTypes.tdsr,
      }),
    ).toBe(refusedBy.foreignKey);
  });
});

describe('the project map', () => {
  it('AC-01-59 P1’s map is version 1; a corrected map is version 2, and version 1 is still there, never edited or deleted', async () => {
    const { db, world } = tested;
    await asTheApi();
    const first = await mapLoaded(1, p1Zones);
    const second = await mapLoaded(2, {
      ...p1Zones,
      'Zone 3': rectangle(-82.33, 27.8, -82.21, 28.2),
    });
    expect(
      await db.rows(
        `SELECT m."version", m."source"::text, m."source_name", m."zone_name_field",
           m."boundary"->>'type' AS boundary, m."loaded_at" IS NOT NULL AS dated,
           u."name" AS loaded_by,
           (SELECT array_agg(z."name" ORDER BY z."name") FROM "zone" z
            WHERE z."map_version_id" = m."id") AS zones
         FROM "map_version" m JOIN "user" u ON u."id" = m."loaded_by_id"
         WHERE m."project_id" = $1 ORDER BY m."version"`,
        [world.p1],
      ),
    ).toEqual(
      [1, 2].map((version) => ({
        version,
        source: 'UPLOAD',
        source_name: `bayline-row-zones-v${String(version)}.geojson`,
        zone_name_field: 'ZONE_NAME',
        boundary: 'Polygon',
        dated: true,
        loaded_by: 'Dana Reyes',
        zones: ['Zone 1', 'Zone 2', 'Zone 3'],
      })),
    );
    expect(
      await refusedRow('map_version', {
        project_id: world.p1,
        version: 2,
        source: 'DRAWN',
        boundary: p1Boundary.geometry,
        ...p1Boundary.box,
        loaded_by_id: world.admin,
      }),
    ).toBe(refusedBy.unique);
    // Neither version nor any of its zones is ever edited or deleted, by anyone.
    for (const [table, id] of [
      ['map_version', first],
      ['map_version', second],
      [
        'zone',
        (
          await db.one<{ id: string }>(
            `SELECT "id"::text FROM "zone" WHERE "map_version_id" = $1 AND "name" = 'Zone 3'`,
            [first],
          )
        ).id,
      ],
    ] as const) {
      await asTheApi();
      expect(
        (await db.refused(`UPDATE "${table}" SET "id" = "id" WHERE "id" = $1`, [id])).code,
        table,
      ).toBe(refusedBy.grant);
      await db.as('adms_owner');
      expect(await db.refused(`UPDATE "${table}" SET "id" = "id" WHERE "id" = '${id}'`)).toEqual({
        code: refusedBy.trigger,
        message: `Open ADMS never edits a ${table} row: a change is a new version`,
      });
      expect((await db.refused(`DELETE FROM "${table}" WHERE "id" = '${id}'`)).code).toBe(
        refusedBy.trigger,
      );
    }
  });

  it('AC-01-59 a zone is written with its map version, never added to one loaded earlier', async () => {
    const { db } = tested;
    await asTheApi();
    // Version 1 was loaded on Saturday; adding a zone to it now would change what tickets were
    // checked against.
    const earlier = await mapLoaded(1, {}, { loaded_at: '2026-10-10T14:00:00Z' });
    const zone = { map_version_id: earlier, name: 'Zone 4', ...p1Zones['Zone 1'].box };
    expect(
      await db.refused(...insertOf('zone', { ...zone, geometry: p1Zones['Zone 1'].geometry })),
    ).toEqual({
      code: refusedBy.trigger,
      message:
        'Open ADMS writes a zone with its map version, never into one loaded earlier: a change is a new version',
    });
    // The same zone, with a version of its own, is written.
    await mapLoaded(2, { 'Zone 4': p1Zones['Zone 1'] });
  });

  it('a zone’s name is once in its version; every shape is a Polygon or MultiPolygon on the earth', async () => {
    const { db, world } = tested;
    await asTheApi();
    const version = await mapLoaded(1, p1Zones);
    expect(
      await refusedRow('zone', {
        map_version_id: version,
        name: 'Zone 1',
        geometry: p1Zones['Zone 1'].geometry,
        ...p1Zones['Zone 1'].box,
      }),
    ).toBe(refusedBy.unique);
    const point = JSON.stringify({ type: 'Point', coordinates: [-82.4, 28] });
    const boundaryRefusal = await db.refused(
      ...insertOf('map_version', {
        project_id: world.p1,
        version: 2,
        source: 'DRAWN',
        boundary: point,
        ...p1Boundary.box,
        loaded_by_id: world.admin,
      }),
    );
    expect(boundaryRefusal.message).toContain('"map_version_boundary_check"');
    const zoneRefusal = await db.refused(
      ...insertOf('zone', {
        map_version_id: version,
        name: 'Zone 5',
        geometry: point,
        ...p1Zones['Zone 1'].box,
      }),
    );
    expect(zoneRefusal.message).toContain('"zone_geometry_check"');
    const boxRefusal = await db.refused(
      ...insertOf('zone', {
        map_version_id: version,
        name: 'Zone 5',
        geometry: p1Zones['Zone 1'].geometry,
        ...p1Zones['Zone 1'].box,
        south_latitude: '28.30000000',
      }),
    );
    expect(boxRefusal.message).toContain('"zone_bounding_box_check"');
    expect(
      await refusedRow('map_version', {
        project_id: world.p1,
        version: 0,
        source: 'DRAWN',
        boundary: p1Boundary.geometry,
        ...p1Boundary.box,
        loaded_by_id: world.admin,
      }),
    ).toBe(refusedBy.check);
  });
});

describe('who writes them', () => {
  it('the API writes sites, their labels, fees and shapes, and the map; the worker only reads them', async () => {
    const { db, world } = tested;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      await db.one(`SELECT count(*)::int AS sites FROM "disposal_site" WHERE "project_id" = $1`, [
        world.p1,
      ]),
    ).toEqual({ sites: 2 });
    for (const [sql, values] of [
      insertOf('disposal_site', siteLike(world, world.siteTypes.finalDisposal)),
      insertOf('site_area_version', areaOf(world.site, 1)),
      [`UPDATE "disposal_site" SET "permit_number" = NULL`, []],
      [`UPDATE "disposal_site_label" SET "archived_at" = now()`, []],
      [`UPDATE "disposal_site_tipping_fee" SET "archived_at" = now()`, []],
      [`SELECT 1 FROM "map_version" FOR UPDATE`, []],
    ] as [string, unknown[]][]) {
      expect((await db.refused(sql, values)).code, sql).toBe(refusedBy.grant);
    }
  });
});

describe('changing them', () => {
  it('AC-01-78 a site: an edit is audited with the prior value and its actor; a delete or a truncate is refused', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(`UPDATE "disposal_site" SET "permit_number" = 'FDEP-SW-0099' WHERE "id" = $1`, [
      world.landfill,
    ]);
    expect(
      (
        await db.rows(
          `SELECT "operation"::text, "changed_fields" AS changed, "prior_value" AS prior,
             "actor_id"::text AS actor, "source"::text, "domain"::text
           FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
          [world.landfill],
        )
      ).at(-1),
    ).toMatchObject({
      operation: 'UPDATE',
      changed: ['permit_number'],
      prior: { permit_number: 'FDEP-SW-0098' },
      actor: world.admin,
      source: 'BACK_OFFICE',
      domain: 'OPERATIONS',
    });
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      expect(
        (await db.refused(`DELETE FROM "disposal_site" WHERE "id" = $1`, [world.landfill])).code,
        login,
      ).toBe(refusedBy.grant);
    }
    const never = 'Open ADMS never deletes a disposal_site row: archive, close or void it instead';
    for (const who of ['adms_owner', 'administrator'] as const) {
      if (who === 'administrator') await db.administer();
      else await db.as(who);
      for (const sql of [
        `DELETE FROM "disposal_site" WHERE "id" = '${world.landfill}'`,
        `TRUNCATE "disposal_site" CASCADE`,
      ]) {
        expect(await db.refused(sql), `${who}: ${sql}`).toEqual({
          code: refusedBy.trigger,
          message: never,
        });
      }
    }
  });

  it('AC-01-78 a tipping fee link is audited for the billing reviewer; archived, never deleted', async () => {
    const { db, world } = tested;
    await asTheApi();
    const fee = await add(
      'pay_item',
      payItemLike(world, {
        code: 'TIP-FEE-CY-BCL',
        description: 'Tipping fee, Bayline County Landfill',
      }),
    );
    const link = await add('disposal_site_tipping_fee', {
      project_id: world.p1,
      site_id: world.landfill,
      pay_item_id: fee,
    });
    await db.run(
      `UPDATE "disposal_site_tipping_fee" SET "archived_at" = '2026-11-02T12:00:00Z' WHERE "id" = $1`,
      [link],
    );
    expect(
      await db.rows(
        `SELECT "operation"::text,
           CASE WHEN "operation" = 'UPDATE' THEN "changed_fields" END AS changed, "domain"::text
         FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
        [link],
      ),
    ).toEqual([
      { operation: 'INSERT', changed: null, domain: 'BILLING' },
      { operation: 'UPDATE', changed: ['archived_at'], domain: 'BILLING' },
    ]);
    expect(
      (await db.refused(`DELETE FROM "disposal_site_tipping_fee" WHERE "id" = $1`, [link])).code,
    ).toBe(refusedBy.grant);
  });

  it('AC-01-78 a map version and a site’s shape are audited as they are added', async () => {
    const { db, world } = tested;
    await asTheApi();
    const map = await mapLoaded(1, { 'Zone 1': p1Zones['Zone 1'] });
    const area = await add('site_area_version', areaOf(world.site, 1));
    expect(
      await db.rows(
        `SELECT "table_name", "operation"::text, "actor_id"::text AS actor, "domain"::text
         FROM "audit_record" WHERE "record_id" = ANY($1) ORDER BY "table_name"`,
        [[map, area]],
      ),
    ).toEqual([
      { table_name: 'map_version', operation: 'INSERT', actor: world.admin, domain: 'OPERATIONS' },
      {
        table_name: 'site_area_version',
        operation: 'INSERT',
        actor: world.admin,
        domain: 'OPERATIONS',
      },
    ]);
  });
});
