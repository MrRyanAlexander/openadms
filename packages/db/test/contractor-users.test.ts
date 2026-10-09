// What a contractor user sees of its own tickets (spec/acceptance/02-people-and-devices.md
// AC-02-78…82; ARCHITECTURE §5.5; ADR-169, 315, 358, 361; REQ-014). Whose work a ticket is, is
// told by the certification its field events found: its prime (so a prime sees its subs' too)
// and either tier of sub. A contractor user reads those tickets, its own contractor's priced
// lines, and three names of setup; a sub's contractor user reads no rate and no amount (the
// user, 2026-10-06). Which lines it sees is `row-level-security.test.ts`'s (AC-02-65, 66).
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  certificationLike,
  given,
  insertOf,
  phoneInsertOf,
  photoLike,
  scaleReceiptLike,
  subOn,
  viewerLike,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { PricedTickets } from './support/priced-tickets.ts';

const tested = eachTestRolledBack();
const tickets = new PricedTickets(tested);

// A contractor user Dana issues, given P1 unless told not to be.
async function contractorUser(name: string, contractor: string, givenP1 = true): Promise<string> {
  const { db, world } = tested;
  await db.administer();
  await db.actor(world.admin, 'BACK_OFFICE');
  const { id } = await db.one<{ id: string }>(
    ...insertOf('user', viewerLike(name, 'CONTRACTOR', contractor)),
  );
  if (givenP1) await db.run(...insertOf('user_viewer_project', given(id, world.p1)));
  return id;
}

// One column of what a viewer reads through the read-only login, in order.
async function reads(viewer: string, column: string, from: string): Promise<string[]> {
  const { db } = tested;
  await db.administer();
  await db.viewer(viewer);
  await db.as('adms_readonly');
  const rows = await db.rows<{ value: string }>(
    `SELECT ${column}::text AS value FROM ${from} ORDER BY 1`,
  );
  await db.administer();
  return rows.map((row) => row.value);
}

async function counts(viewer: string, views: readonly string[]): Promise<Record<string, number>> {
  const found: Record<string, number> = {};
  for (const view of views) found[view] = (await reads(viewer, '"id"', `"${view}"`)).length;
  return found;
}

// P1 with three contractors' work on it: Coastline's own load 101001 (the world's, with its
// $390.00 line), Rivera's 101002 under Coastline (36 CY at $8.25 = $297.00) and Summit's 101044
// (14 CY at $7.80 = $109.20); and a contractor user for Rivera and for Summit beside the
// world's for Coastline.
async function threeContractors(): Promise<{
  coastline: string;
  rivera: string;
  summit: string;
  lines: { coastlines: string; riveras: string; summits: string };
}> {
  const { world } = tested;
  const { haul } = await tickets.cdToTheLandfill();
  const summits101044 = await tickets.summits101044();
  const riveras = await tickets.line({
    completed_load_id: world.loads.l101002.completedLoad,
    completed_load_collection_id: world.loads.l101002.completedLoadCollection,
    slot: 1,
    rule_id: haul.rule,
    pay_item_id: haul.payItem,
    operating_sub_id: world.rivera,
    quantity: '36.0000',
    rate: '8.2500',
    amount: '297.00',
  });
  const summits = await tickets.line({
    completed_load_id: summits101044.completedLoad,
    completed_load_collection_id: summits101044.property,
    slot: 1,
    rule_id: summits101044.rule,
    contract_id: world.contracts.summitP1,
    prime_id: world.summit,
    quantity: '14.0000',
    rate: '7.8000',
    amount: '109.20',
  });
  return {
    coastline: world.coastlineViewer,
    rivera: await contractorUser('Rivera Trucking viewer', world.rivera),
    summit: await contractorUser('Summit Debris Services viewer', world.summit),
    lines: { coastlines: world.transaction, riveras, summits },
  };
}

const ticketNumbers = (viewer: string, view: string): Promise<string[]> =>
  reads(viewer, '"ticket_number"', `"${view}"`);

describe('a contractor user', () => {
  it("AC-02-78 a prime's sees its own tickets, its sub's among them: their field events, completed loads, certifications and contractors by name; never another prime's, and no flag, monitor, form or setup", async () => {
    const { world } = tested;
    const { coastline, rivera, summit } = await threeContractors();
    // And the split haul-out 201004, three piles into Coastline's walking floor `730419`.
    const { completedHaulOut } = await tickets.haulOut201004();
    expect(await ticketNumbers(coastline, 'viewer_field_event')).toEqual([
      '101001',
      '101001',
      '101002',
      '101002',
      '201004',
      '201004',
      '201004',
      '201004',
    ]);
    expect(await ticketNumbers(coastline, 'viewer_completed_load')).toEqual(['101001', '101002']);
    expect(await ticketNumbers(coastline, 'viewer_completed_haul_out')).toEqual(['201004']);
    expect(
      await reads(
        coastline,
        `"split_suffix" || ' ' || "completed_haul_out_id"`,
        '"viewer_completed_haul_out_collection"',
      ),
    ).toEqual(['A', 'B', 'C'].map((pile) => `${pile} ${completedHaulOut}`));
    // The haul-out is neither Rivera's nor Summit's.
    for (const other of [rivera, summit]) {
      expect(
        await counts(other, ['viewer_completed_haul_out', 'viewer_completed_haul_out_collection']),
      ).toEqual({ viewer_completed_haul_out: 0, viewer_completed_haul_out_collection: 0 });
    }
    expect(
      await reads(coastline, '"completed_load_id"', '"viewer_completed_load_collection"'),
    ).toEqual([world.loads.l101001.completedLoad, world.loads.l101002.completedLoad].sort());
    expect(await reads(coastline, '"cert_number"', '"viewer_certification"')).toEqual([
      '730415',
      '730416',
      '730417',
      '730418',
      '730419',
    ]);
    // Its own place on the project and Rivera's under it; Summit's is not its to see.
    expect(await reads(coastline, '"name"', '"viewer_contractor"')).toEqual([
      'Coastline Haulers LLC',
      'Rivera Trucking',
    ]);
    expect(await reads(coastline, '"position"', '"viewer_project_contractor"')).toEqual([
      'PRIME',
      'SUB_TIER_1',
    ]);
    // What stays the back office's, a client user's and an auditor's.
    const unseen = [
      'viewer_flag',
      'viewer_field_event_monitor',
      'viewer_roe',
      'viewer_survey',
      'viewer_incident',
      'viewer_drop_off_log',
      'viewer_quarantined_record',
      'viewer_project_setup',
      'viewer_contract',
      'viewer_pay_item',
      'viewer_pay_item_rate',
      'viewer_rule',
      'viewer_disposal_site',
      'viewer_site_type',
    ];
    expect(await counts(coastline, unseen)).toEqual(
      Object.fromEntries(unseen.map((view) => [view, 0])),
    );
    // Summit's sees its own truck's load, and nothing of Coastline's.
    expect(await ticketNumbers(summit, 'viewer_field_event')).toEqual(['101044', '101044']);
    expect(await ticketNumbers(summit, 'viewer_completed_load')).toEqual(['101044']);
    expect(await reads(summit, '"cert_number"', '"viewer_certification"')).toEqual(['88120']);
    expect(await reads(summit, '"name"', '"viewer_contractor"')).toEqual([
      'Summit Debris Services',
    ]);
  });

  it("AC-02-79 a sub's sees only the tickets its own truck worked, with their scale receipt and photographs, and nothing of its prime's other work", async () => {
    const { db, world } = tested;
    const { rivera } = await threeContractors();
    // A photograph on each load's collection, and the Landfill's receipt for 101002 with a
    // photograph of its paper.
    await tickets.asThePhone();
    const photograph = async (owner: Record<string, unknown>): Promise<string> =>
      (await db.one<{ id: string }>(...phoneInsertOf('photo', photoLike(world, owner)))).id;
    const coastlines = await photograph({ field_event_id: world.loads.l101001.collection });
    const riveras = await photograph({ field_event_id: world.loads.l101002.collection });
    const ofTheTruck = await photograph({ certification_id: world.certifications.c730416 });
    const { id: receipt } = await db.one<{ id: string }>(
      ...phoneInsertOf('scale_receipt', scaleReceiptLike(world)),
    );
    const ofThePaper = await photograph({ scale_receipt_id: receipt });
    // Nobody's field event points at the receipt yet: not Rivera's to see.
    expect(await reads(rivera, '"id"', '"viewer_scale_receipt"')).toEqual([]);
    expect(await reads(rivera, '"id"', '"viewer_photo"')).toEqual([riveras, ofTheTruck].sort());
    await tickets.asTheBackOffice();
    await db.run(`UPDATE "field_event" SET "scale_receipt_id" = $1 WHERE "id" = $2`, [
      receipt,
      world.loads.l101002.disposal,
    ]);
    expect(await ticketNumbers(rivera, 'viewer_field_event')).toEqual(['101002', '101002']);
    expect(await ticketNumbers(rivera, 'viewer_completed_load')).toEqual(['101002']);
    expect(await reads(rivera, '"id"', '"viewer_completed_load_collection"')).toEqual([
      world.loads.l101002.completedLoadCollection,
    ]);
    expect(await reads(rivera, '"cert_number"', '"viewer_certification"')).toEqual(['730416']);
    expect(await reads(rivera, '"certification_id"', '"viewer_certification_box"')).toEqual(
      await reads(
        world.clientViewer,
        '"certification_id"',
        `"viewer_certification_box" WHERE "certification_id" = '${world.certifications.c730416}'`,
      ),
    );
    expect(await reads(rivera, '"receipt_number"', '"viewer_scale_receipt"')).toEqual([
      'BCL-88241',
    ]);
    expect(await reads(rivera, '"id"', '"viewer_photo"')).toEqual(
      [riveras, ofTheTruck, ofThePaper].sort(),
    );
    expect(await reads(rivera, '"id"', '"viewer_photo"')).not.toContain(coastlines);
    // Its own place on the project, and no other contractor's.
    expect(await reads(rivera, '"name"', '"viewer_contractor"')).toEqual(['Rivera Trucking']);
    // Where a file is kept, and a driver's phone, are no viewer's.
    await db.viewer(rivera);
    await db.as('adms_readonly');
    for (const sql of [
      `SELECT "object_key" FROM "photo"`,
      `SELECT "driver_phone" FROM "certification"`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
  });

  it("AC-02-80 a sub's reads its lines' pay item and quantity and no rate or amount; its prime's reads the money on its own lines, the sub's work included; a client user and an auditor on every line", async () => {
    const { db, world } = tested;
    const { coastline, rivera, summit, lines } = await threeContractors();
    const money = (viewer: string): Promise<string[]> =>
      reads(viewer, `"rate" || ' ' || "amount"`, '"viewer_transaction_money"');
    // Rivera's: its one line, 36 CY of CD-HAUL-CY-15, and no money.
    expect(await reads(rivera, '"id"', '"viewer_transaction"')).toEqual([lines.riveras]);
    expect(
      await reads(
        rivera,
        `line."quantity" || ' ' || line."unit" || ' ' || item."code"`,
        `"viewer_transaction" line JOIN "viewer_pay_item_name" item ON item."id" = line."pay_item_id"`,
      ),
    ).toEqual(['36.0000 CY CD-HAUL-CY-15']);
    expect(await money(rivera)).toEqual([]);
    // Coastline's: its own line and Rivera's work, at Coastline's rates with the County.
    expect(await money(coastline)).toEqual(['7.5000 390.00', '8.2500 297.00']);
    expect(await money(summit)).toEqual(['7.8000 109.20']);
    for (const viewer of [world.clientViewer, world.auditor]) {
      expect(await money(viewer), viewer).toEqual([
        '7.5000 390.00',
        '7.8000 109.20',
        '8.2500 297.00',
      ]);
    }
    // No viewer reads either column from the line itself: the view of a line doesn't hold them
    // and the read-only login isn't granted them.
    for (const viewer of [rivera, coastline, world.clientViewer]) {
      await db.administer();
      await db.viewer(viewer);
      await db.as('adms_readonly');
      for (const column of ['rate', 'amount']) {
        expect((await db.refused(`SELECT "${column}" FROM "transaction"`)).code, column).toBe(
          refusedBy.grant,
        );
        expect(
          (await db.refused(`SELECT "${column}" FROM "viewer_transaction"`)).code,
          column,
        ).toBe('42703');
      }
    }
    // Nobody stated: no money.
    await db.noViewer();
    await db.as('adms_readonly');
    expect(await db.rows(`SELECT 1 FROM "viewer_transaction_money"`)).toEqual([]);
  });

  it('AC-02-81 reads the names its tickets are read with, a pay item’s code and description, a site’s name and a debris type’s, once it is given the project, and nothing more of setup', async () => {
    const { db, world } = tested;
    const rivera = await contractorUser('Rivera Trucking viewer', world.rivera, false);
    const names = async (viewer: string): Promise<Record<string, string[]>> => ({
      payItems: await reads(viewer, `"code" || ': ' || "description"`, '"viewer_pay_item_name"'),
      sites: await reads(viewer, '"name"', '"viewer_disposal_site_name"'),
      debrisTypes: await reads(viewer, '"name"', '"viewer_debris_type_name"'),
    });
    // Not given P1 yet: no name.
    expect(await names(rivera)).toEqual({ payItems: [], sites: [], debrisTypes: [] });
    await db.run(...insertOf('user_viewer_project', given(rivera, world.p1)));
    const p1PayItems = (
      await db.rows<{ name: string }>(
        `SELECT "code" || ': ' || "description" AS name FROM "pay_item"
         WHERE "project_id" = $1 ORDER BY 1`,
        [world.p1],
      )
    ).map((row) => row.name);
    expect(p1PayItems).toHaveLength(6);
    expect(p1PayItems).toContain('VEG-HAUL-CY-15: ROW VEG haul 0–15 mi');
    const p1 = {
      payItems: p1PayItems,
      sites: ['Bayline County Landfill', 'Marsh Road TDSR'],
      debrisTypes: ['C&D', 'Vegetative'],
    };
    expect(await names(rivera)).toEqual(p1);
    // A client user reads the same names of the project.
    expect(await names(world.clientViewer)).toEqual(p1);
    // And nothing more of setup: no pay item's settings or rates, no site's facts, no form.
    const setup = [
      'viewer_pay_item',
      'viewer_pay_item_rate',
      'viewer_disposal_site',
      'viewer_form',
      'viewer_form_debris_type',
      'viewer_debris_type',
    ];
    expect(await counts(rivera, setup)).toEqual(Object.fromEntries(setup.map((view) => [view, 0])));
    // The three views show exactly these columns.
    const columns = await db.rows<{ view: string; columns: string }>(
      `SELECT c.relname AS view, string_agg(a.attname, ' ' ORDER BY a.attnum) AS columns
       FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
       WHERE c.relname IN ('viewer_pay_item_name', 'viewer_disposal_site_name', 'viewer_debris_type_name')
       GROUP BY c.relname ORDER BY 1`,
    );
    expect(columns).toEqual([
      { view: 'viewer_debris_type_name', columns: 'id project_id name' },
      { view: 'viewer_disposal_site_name', columns: 'id project_id name' },
      { view: 'viewer_pay_item_name', columns: 'id project_id code description' },
    ]);
  });

  it('AC-02-82 a field event whose badge found no certification is no contractor’s until it is pointed at one; a ticket on a second-tier sub’s truck is its own, its first-tier sub’s and their prime’s', async () => {
    const { db, world } = tested;
    const { coastline, rivera, summit } = await threeContractors();
    // Load 101020's collection, its badge `730499` found nowhere.
    const lost = await tickets.synced({ cert_number: '730499', certification_id: null });
    const seenBy = async (viewer: string, event: string): Promise<boolean> =>
      (await reads(viewer, '"id"', `"viewer_field_event" WHERE "id" = '${event}'`)).length === 1;
    expect(await seenBy(world.clientViewer, lost)).toBe(true);
    for (const viewer of [coastline, rivera, summit]) {
      expect(await seenBy(viewer, lost), viewer).toBe(false);
    }
    // Tidewater Hauling, tier 2 under Rivera under Coastline (AC-03-12), certified as `730421`;
    // the field event is pointed at it.
    await tickets.asThePhone();
    const tidewater = await tickets.add('contractor', {
      name: 'Tidewater Hauling',
      kind: 'HAULER',
    });
    await tickets.add('project_contractor', subOn(world.p1, tidewater, world.coastline, 2));
    const c730421 = await tickets.add(
      'certification',
      certificationLike(world, {
        first_tier_sub_id: world.rivera,
        second_tier_sub_id: tidewater,
      }),
    );
    await tickets.asTheBackOffice();
    await db.run(
      `UPDATE "field_event" SET "cert_number" = '730421', "certification_id" = $1 WHERE "id" = $2`,
      [c730421, lost],
    );
    const tidewaters = await contractorUser('Tidewater Hauling viewer', tidewater);
    for (const viewer of [tidewaters, rivera, coastline]) {
      expect(await seenBy(viewer, lost), viewer).toBe(true);
    }
    expect(await seenBy(summit, lost)).toBe(false);
    // Tidewater's sees that one certification, and of the others' work nothing.
    expect(await reads(tidewaters, '"cert_number"', '"viewer_certification"')).toEqual(['730421']);
    expect(await ticketNumbers(tidewaters, 'viewer_field_event')).toEqual(['101020']);
    expect(await ticketNumbers(tidewaters, 'viewer_completed_load')).toEqual([]);
  });
});
