// Scale receipts and photographs (spec/acceptance/04-field-capture.md section G, by scenario ID,
// and the scale receipt's half of AC-04-38, 39 and 52; spec/DATA-MODEL.md §4.1 (2), §4.2, §4.4,
// §8; ARCHITECTURE §11; ADR-034, 036, 038, 101, 175, 179, 227, 326; REQ-106f, 126a). A scale
// receipt is its own record, never a ticket's: what the paper says, copied by hand, pointed at by
// the disposals it covers. A photograph's record belongs to exactly one thing. Nothing here
// refuses work over eligibility (ADR-052): each refusal is of a record that isn't one. The values
// are the golden mission's (spec/golden/MISSION.md §2) and adms-scale-receipts' tandem.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  crewLike,
  eventInsertOf,
  fieldEventLike,
  fingerprintOf,
  insertOf,
  phoneInsertOf,
  photoLike,
  scaleReceiptLike,
  siteLike,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

type Row = Record<string, unknown>;

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

// A record a phone made the id of, as it is received; its id.
async function received(table: string, row: Row): Promise<string> {
  return (await tested.db.one<{ id: string }>(...phoneInsertOf(table, row))).id;
}

// How the database refuses that record.
async function refusedRecord(table: string, row: Row): Promise<string> {
  return (await tested.db.refused(...phoneInsertOf(table, row))).code;
}

async function receipt(more: Row = {}): Promise<string> {
  return received('scale_receipt', scaleReceiptLike(tested.world, more));
}

async function event(more: Row): Promise<string> {
  return (await tested.db.one<{ id: string }>(...eventInsertOf(fieldEventLike(tested.world, more))))
    .id;
}

async function refusedEvent(more: Row): Promise<string> {
  return (await tested.db.refused(...eventInsertOf(fieldEventLike(tested.world, more)))).code;
}

async function photograph(owner: Row, more: Row = {}): Promise<string> {
  return received('photo', photoLike(tested.world, owner, more));
}

async function columnsOf(table: string): Promise<string[]> {
  return (
    await tested.db.rows<{ name: string }>(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`,
      [table],
    )
  ).map((column) => column.name);
}

// A disposal at Bayline County Landfill's tower.
const atTheLandfill = (ticketNumber: string, more: Row = {}): Row => ({
  kind: 'DISPOSAL',
  ticket_number: ticketNumber,
  site_id: tested.world.landfill,
  ...more,
});

// Cypress Creek Landfill, as Dana enters it on P1 (spec/CONVENTIONS.md §6): a Final Disposal site
// with a scale house.
async function cypressCreek(projectId = tested.world.p1): Promise<string> {
  const { db, world } = tested;
  await asTheBackOffice();
  return (
    await db.one<{ id: string }>(
      ...insertOf(
        'disposal_site',
        siteLike(world, world.siteTypes.finalDisposal, {
          project_id: projectId,
          name: 'Cypress Creek Landfill',
          short_code: 'CCL',
          permit_number: 'FDEP-SW-0131',
          latitude: '39.24000000',
          longitude: '-75.60000000',
        }),
      ),
    )
  ).id;
}

// `CCL-51207`, as Lee Morgan copies it by hand at Cypress Creek Landfill on Tuesday at 17:15
// (the golden mission §2).
const ccl51207 = (site: string): Row => ({
  receipt_number: 'CCL-51207',
  site_id: site,
  gross_weight_lb: '79600.00',
  tare_weight_lb: '31600.00',
  net_weight_lb: '48000.00',
  net_weight_tons: '24.0000',
  entered_by_id: tested.world.helper,
  entered_at: '2026-10-13T21:15:00Z',
});

describe('a scale receipt', () => {
  it('AC-04-71 is a record of its own, apart from any ticket: the site’s number as written, the site, the weights, who entered it and when', async () => {
    const { db, world } = tested;
    const site = await cypressCreek();
    await db.actor(world.helper, 'DEVICE', { deviceId: world.device });
    const id = await receipt(ccl51207(site));
    expect(
      await db.one(
        `SELECT "receipt_number", "site_id"::text AS site, "gross_weight_lb", "tare_weight_lb",
           "net_weight_lb", "net_weight_tons", "entered_by_id"::text AS entered_by,
           "entered_at", "device_utc_offset_minutes", "received_at" IS NOT NULL AS received
         FROM "scale_receipt" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({
      receipt_number: 'CCL-51207',
      site,
      gross_weight_lb: '79600.00',
      tare_weight_lb: '31600.00',
      net_weight_lb: '48000.00',
      net_weight_tons: '24.0000',
      entered_by: world.helper,
      entered_at: new Date('2026-10-13T21:15:00Z'),
      device_utc_offset_minutes: -240,
      received: true,
    });
    // Exactly these columns: no ticket number, no workflow, no share, no status of its own.
    expect(await columnsOf('scale_receipt')).toEqual([
      'device_id',
      'device_utc_offset_minutes',
      'entered_at',
      'entered_by_id',
      'gross_weight_lb',
      'id',
      'net_weight_lb',
      'net_weight_tons',
      'notes',
      'project_id',
      'receipt_number',
      'received_at',
      'site_id',
      'tare_weight_lb',
    ]);
    // The number is the site's, kept exactly as written: never trimmed, cased or put into ours.
    const asWritten = await receipt({ receipt_number: ' ccl 51208/a ', site_id: site });
    expect(
      await db.one(`SELECT "receipt_number" FROM "scale_receipt" WHERE "id" = $1`, [asWritten]),
    ).toEqual({ receipt_number: ' ccl 51208/a ' });
    // Audited as evidence, with the monitor who entered it as its actor.
    await db.administer();
    expect(
      await db.one(
        `SELECT "actor_id"::text AS actor, "source"::text, "domain"::text, "operation"::text
         FROM "audit_record" WHERE "table_name" = 'scale_receipt' AND "record_id" = $1`,
        [id],
      ),
    ).toEqual({ actor: world.helper, source: 'DEVICE', domain: 'RECORDS', operation: 'INSERT' });
  });

  it('AC-04-71 has a number, a site of its own project and a person who entered it', async () => {
    const { world } = tested;
    const onP2 = await cypressCreek(world.p2);
    await asThePhone();
    for (const [what, more, how] of [
      ['a blank number', { receipt_number: '   ' }, refusedBy.check],
      ['no number', { receipt_number: null }, refusedBy.notNull],
      ['no site', { site_id: null }, refusedBy.notNull],
      ['a site of another project', { site_id: onP2 }, refusedBy.foreignKey],
      ['nobody', { entered_by_id: null }, refusedBy.notNull],
      ['the system actor', { entered_by_id: world.worker }, refusedBy.check],
      ['no time', { entered_at: null }, refusedBy.notNull],
      ['no offset', { device_utc_offset_minutes: null }, refusedBy.notNull],
    ] as const) {
      expect(await refusedRecord('scale_receipt', scaleReceiptLike(world, more)), what).toBe(how);
    }
    // One entered with no phone (in the back office) is taken.
    await asTheBackOffice();
    await receipt({ receipt_number: 'BCL-88250', entered_by_id: world.admin, device_id: null });
  });

  it('AC-04-72 a receipt number is never unique: a site’s receipt book starts again', async () => {
    const { db, world } = tested;
    const site = await cypressCreek();
    await asThePhone();
    // The same number twice on P1, at the same site: both are kept, each its own record.
    const first = await receipt(ccl51207(site));
    const second = await receipt({ ...ccl51207(site), entered_at: '2026-10-14T15:40:00Z' });
    expect(second).not.toBe(first);
    // A store-bought book of 500 slips, back at 017, at another site too.
    await receipt({ receipt_number: '017', site_id: site });
    await receipt({ receipt_number: '017', site_id: site });
    await receipt({ receipt_number: '017' });
    expect(
      await db.rows(
        `SELECT "receipt_number", count(*)::int AS receipts FROM "scale_receipt"
         WHERE "project_id" = $1 GROUP BY "receipt_number" ORDER BY "receipt_number"`,
        [world.p1],
      ),
    ).toEqual([
      { receipt_number: '017', receipts: 3 },
      { receipt_number: 'CCL-51207', receipts: 2 },
    ]);
    // No unique key holds the number: the table's only ones are its id and what others point at.
    expect(
      (
        await db.rows<{ name: string }>(
          `SELECT indexname AS name FROM pg_indexes
           WHERE schemaname = 'public' AND tablename = 'scale_receipt' ORDER BY indexname`,
        )
      ).map((index) => index.name),
    ).toEqual(['scale_receipt_pkey', 'scale_receipt_project_id_id_key']);
    // A ticket's number is no receipt's: load 101020 and a receipt the site numbered 101020.
    await event({ ticket_number: '101020' });
    await receipt({ receipt_number: '101020', site_id: site });
  });

  it('AC-04-73 a tandem weighed once is one receipt, and both disposals point at it', async () => {
    const { db } = tested;
    await asThePhone();
    const bcl88241 = await receipt();
    const body = await event(
      atTheLandfill('101050', {
        cert_number: '730421',
        certification_id: null,
        scale_receipt_id: bcl88241,
      }),
    );
    const trailer = await event(
      atTheLandfill('101051', {
        cert_number: '730422',
        certification_id: null,
        scale_receipt_id: bcl88241,
      }),
    );
    expect(
      await db.rows(
        `SELECT e."ticket_number", r."receipt_number", r."net_weight_lb", r."net_weight_tons"
         FROM "field_event" e JOIN "scale_receipt" r ON r."id" = e."scale_receipt_id"
         WHERE e."id" = ANY($1) ORDER BY e."ticket_number"`,
        [[body, trailer]],
      ),
    ).toEqual([
      {
        ticket_number: '101050',
        receipt_number: 'BCL-88241',
        net_weight_lb: '34200.00',
        net_weight_tons: '17.1000',
      },
      {
        ticket_number: '101051',
        receipt_number: 'BCL-88241',
        net_weight_lb: '34200.00',
        net_weight_tons: '17.1000',
      },
    ]);
    expect(
      (await db.one<{ count: number }>(`SELECT count(*)::int AS count FROM "scale_receipt"`)).count,
    ).toBe(1);
    // No field event holds a weight of its own, and no share is stored on the receipt.
    expect((await columnsOf('field_event')).filter((name) => /weight|tons|_lb/.test(name))).toEqual(
      [],
    );
    expect((await columnsOf('scale_receipt')).filter((name) => /share|ticket/.test(name))).toEqual(
      [],
    );
  });

  it('AC-04-74 a receipt-book slip with a number and nothing else is taken, and a missing weight is never worked out', async () => {
    const { db, world } = tested;
    await asThePhone();
    const none = { gross_weight_lb: null, tare_weight_lb: null };
    const slip = await receipt({
      receipt_number: 'BCL-B-0412',
      ...none,
      net_weight_lb: null,
      net_weight_tons: null,
    });
    const weights = `"gross_weight_lb", "tare_weight_lb", "net_weight_lb", "net_weight_tons"`;
    const kept = (id: string): Promise<Row> =>
      db.one(`SELECT ${weights} FROM "scale_receipt" WHERE "id" = $1`, [id]);
    expect(await kept(slip)).toEqual({
      gross_weight_lb: null,
      tare_weight_lb: null,
      net_weight_lb: null,
      net_weight_tons: null,
    });
    // A gross and a tare with no net stay that way: nothing subtracts for the paper.
    const noNet = await receipt({
      receipt_number: 'BCL-88242',
      net_weight_lb: null,
      net_weight_tons: null,
    });
    expect(await kept(noNet)).toEqual({
      gross_weight_lb: '62400.00',
      tare_weight_lb: '28200.00',
      net_weight_lb: null,
      net_weight_tons: null,
    });
    // A net with no tare, a net that isn't the gross less the tare, a net of nought and a net
    // below nought are each what the paper says: taken, for a flag (adms-scale-receipts).
    await receipt({ receipt_number: 'BCL-88243', tare_weight_lb: null });
    await receipt({ receipt_number: 'BCL-88244', net_weight_lb: '35200.00' });
    await receipt({ receipt_number: 'BCL-88245', ...none, net_weight_lb: 0, net_weight_tons: 0 });
    await receipt({
      receipt_number: 'BCL-88246',
      gross_weight_lb: '28200.00',
      tare_weight_lb: '31600.00',
      net_weight_lb: '-3400.00',
      net_weight_tons: '-1.7000',
    });
    // What a scale reads is never below nought.
    for (const column of ['gross_weight_lb', 'tare_weight_lb']) {
      expect(
        await refusedRecord(
          'scale_receipt',
          scaleReceiptLike(world, { receipt_number: 'BCL-88247', [column]: -1 }),
        ),
        column,
      ).toBe(refusedBy.check);
    }
  });

  it('AC-04-75 only a disposal or a haul-out disposal can point at one, and only at one of its own project', async () => {
    const { db, world } = tested;
    const onP2 = await cypressCreek(world.p2);
    await asThePhone();
    const bcl88241 = await receipt();
    await event(atTheLandfill('101021', { scale_receipt_id: bcl88241 }));
    const haulOut = {
      workflow: 'HAUL_OUT',
      cert_number: '730419',
      certification_id: world.certifications.c730419,
    };
    await event({
      ...haulOut,
      kind: 'HAUL_OUT_DISPOSAL',
      ticket_number: '201021',
      site_id: world.landfill,
      scale_receipt_id: bcl88241,
    });
    for (const [what, more] of [
      ['a collection', { ticket_number: '101022' }],
      [
        'a haul-out collection',
        { ...haulOut, kind: 'HAUL_OUT_COLLECTION', ticket_number: '201022', site_id: world.site },
      ],
      [
        'a unit rate event',
        {
          workflow: 'UNIT_RATE',
          kind: 'UNIT_RATE',
          ticket_number: '301022',
          cert_number: '730417',
          certification_id: world.certifications.c730417,
        },
      ],
    ] as const) {
      const refusal = await db.refused(
        ...eventInsertOf(fieldEventLike(world, { ...more, scale_receipt_id: bcl88241 })),
      );
      expect(refusal.code, what).toBe(refusedBy.check);
      expect(refusal.message, what).toContain('"field_event_scale_receipt_check"');
    }
    // Another project's receipt, and one that doesn't exist.
    const p2Receipt = await receipt({
      project_id: world.p2,
      site_id: onP2,
      receipt_number: 'CCL-60001',
    });
    expect(await refusedEvent(atTheLandfill('101023', { scale_receipt_id: p2Receipt }))).toBe(
      refusedBy.foreignKey,
    );
    expect(
      await refusedEvent(
        atTheLandfill('101023', { scale_receipt_id: '019a0000-0000-7000-8000-00000000dead' }),
      ),
    ).toBe(refusedBy.foreignKey);
  });

  it('AC-04-38 a load paid by weight: the disposal points at its scale receipt and holds no load call', async () => {
    const { db } = tested;
    await asThePhone();
    const bcl88241 = await receipt();
    const disposal = await event(atTheLandfill('101021', { scale_receipt_id: bcl88241 }));
    expect(
      await db.one(
        `SELECT "load_call", "carried_count", "scale_receipt_id"::text AS receipt, "status"::text
         FROM "field_event" WHERE "id" = $1`,
        [disposal],
      ),
    ).toEqual({ load_call: null, carried_count: null, receipt: bcl88241, status: 'PENDING' });
  });

  it('AC-04-39 a load paid by the CY may hold its load call and point at a receipt-book slip; a count beside a receipt is taken too', async () => {
    const { db } = tested;
    await asThePhone();
    const slip = await receipt({
      receipt_number: 'BCL-B-0412',
      gross_weight_lb: null,
      tare_weight_lb: null,
      net_weight_lb: null,
      net_weight_tons: null,
    });
    const disposal = await event(
      atTheLandfill('101021', { load_call: 80, scale_receipt_id: slip }),
    );
    expect(
      await db.one(
        `SELECT "load_call", "scale_receipt_id"::text AS receipt FROM "field_event" WHERE "id" = $1`,
        [disposal],
      ),
    ).toEqual({ load_call: 80, receipt: slip });
    // Which quantity bills is the worker's to read from the paying pay item (1.5.4).
    await event(atTheLandfill('101022', { carried_count: 3, scale_receipt_id: slip }));
  });

  it('AC-04-52 haul-out 201004’s disposal at Cypress Creek Landfill points at CCL-51207 and holds no load call', async () => {
    const { db, world } = tested;
    const site = await cypressCreek();
    await db.actor(world.helper, 'DEVICE', { deviceId: world.device });
    const ccl = await receipt(ccl51207(site));
    const haulOutDisposal = {
      workflow: 'HAUL_OUT',
      kind: 'HAUL_OUT_DISPOSAL',
      ticket_number: '201004',
      monitor_id: world.helper,
      cert_number: '730419',
      certification_id: world.certifications.c730419,
      site_id: site,
      started_at: '2026-10-13T21:05:00Z',
      ended_at: '2026-10-13T21:15:00Z',
      scale_receipt_id: ccl,
    };
    const disposal = await event(haulOutDisposal);
    expect(
      await db.one(
        `SELECT r."receipt_number", r."net_weight_tons", e."load_call"
         FROM "field_event" e JOIN "scale_receipt" r ON r."id" = e."scale_receipt_id"
         WHERE e."id" = $1`,
        [disposal],
      ),
    ).toEqual({ receipt_number: 'CCL-51207', net_weight_tons: '24.0000', load_call: null });
    // The load calls stay on the haul-out collections: its disposal takes none.
    expect(await refusedEvent({ ...haulOutDisposal, ticket_number: '201005', load_call: 80 })).toBe(
      refusedBy.check,
    );
  });

  it('is corrected in place by the API, audited with what it said before, and never deleted; the worker only reads it', async () => {
    const { db, world } = tested;
    await asThePhone();
    const bcl88241 = await receipt();
    await asTheBackOffice();
    await db.run(
      `UPDATE "scale_receipt" SET "net_weight_lb" = 34100, "net_weight_tons" = 17.05,
         "receipt_number" = 'BCL-88247' WHERE "id" = $1`,
      [bcl88241],
    );
    for (const [what, sql] of [
      ['its id', `UPDATE "scale_receipt" SET "id" = uuidv7() WHERE "id" = $1`],
      ['its received time', `UPDATE "scale_receipt" SET "received_at" = now() WHERE "id" = $1`],
      ['a delete', `DELETE FROM "scale_receipt" WHERE "id" = $1`],
    ] as const) {
      expect((await db.refused(sql, [bcl88241])).code, what).toBe(refusedBy.grant);
    }
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      await db.one(`SELECT "receipt_number" FROM "scale_receipt" WHERE "id" = $1`, [bcl88241]),
    ).toEqual({ receipt_number: 'BCL-88247' });
    expect(
      (
        await db.refused(`UPDATE "scale_receipt" SET "net_weight_lb" = 1 WHERE "id" = $1`, [
          bcl88241,
        ])
      ).code,
    ).toBe(refusedBy.grant);
    expect(
      (
        await db.refused(
          ...phoneInsertOf('scale_receipt', scaleReceiptLike(world, { receipt_number: 'X-1' })),
        )
      ).code,
    ).toBe(refusedBy.grant);
    await db.administer();
    await db.actor(world.admin, 'BACK_OFFICE');
    expect((await db.refused(`DELETE FROM "scale_receipt" WHERE "id" = $1`, [bcl88241])).code).toBe(
      refusedBy.trigger,
    );
    const audited = await db.one<{ actor: string; changed_fields: string[]; prior: Row }>(
      `SELECT "actor_id"::text AS actor, "changed_fields",
         jsonb_build_object('receipt_number', "prior_value" -> 'receipt_number',
           'net_weight_lb', "prior_value" -> 'net_weight_lb') AS prior
       FROM "audit_record"
       WHERE "table_name" = 'scale_receipt' AND "record_id" = $1 AND "operation" = 'UPDATE'`,
      [bcl88241],
    );
    expect({ ...audited, changed_fields: [...audited.changed_fields].sort() }).toEqual({
      actor: world.admin,
      changed_fields: ['net_weight_lb', 'net_weight_tons', 'receipt_number'],
      prior: { receipt_number: 'BCL-88241', net_weight_lb: 34200.0 },
    });
  });
});

describe('a photograph', () => {
  it('AC-04-76 its record belongs to exactly one thing: a field event, a certification or a scale receipt of its own project', async () => {
    const { db, world } = tested;
    await asThePhone();
    const collection = await event({ ticket_number: '101020' });
    const bcl88241 = await receipt();
    const certification = world.certifications.c730415;
    const ofTheEvent = await photograph({ field_event_id: collection });
    const ofTheCertification = await photograph({ certification_id: certification });
    const ofTheReceipt = await photograph({ scale_receipt_id: bcl88241 });
    expect(
      await db.rows(
        `SELECT num_nonnulls("field_event_id", "certification_id", "scale_receipt_id", "roe_id",
           "survey_id", "incident_id", "drop_off_log_id") AS owners
         FROM "photo" WHERE "id" = ANY($1)`,
        [[ofTheEvent, ofTheCertification, ofTheReceipt]],
      ),
    ).toEqual([{ owners: 1 }, { owners: 1 }, { owners: 1 }]);
    for (const [what, owner] of [
      ['no owner', {}],
      [
        'a field event and a certification',
        { field_event_id: collection, certification_id: certification },
      ],
      [
        'a field event and a scale receipt',
        { field_event_id: collection, scale_receipt_id: bcl88241 },
      ],
      [
        'all three',
        { field_event_id: collection, certification_id: certification, scale_receipt_id: bcl88241 },
      ],
    ] as const) {
      const refusal = await db.refused(...phoneInsertOf('photo', photoLike(world, owner)));
      expect(refusal.code, what).toBe(refusedBy.check);
      expect(refusal.message, what).toContain('"photo_owner_check"');
    }
    // An owner of another project: P2's own 730416, a field event and a receipt said to be P2's.
    for (const [what, owner] of [
      ['a certification of another project', { certification_id: world.certifications.p2c730416 }],
      ['a field event of another project', { project_id: world.p2, field_event_id: collection }],
      ['a scale receipt of another project', { project_id: world.p2, scale_receipt_id: bcl88241 }],
      ['a field event that doesn’t exist', { field_event_id: certification }],
    ] as const) {
      expect(await refusedRecord('photo', photoLike(world, owner)), what).toBe(
        refusedBy.foreignKey,
      );
    }
    // An ROE, a survey, an incident and a drop-off log own photographs too (ADR-327;
    // roes-and-forms.test.ts). A record waiting in quarantine (task 1.4.2) has no column yet.
    expect(await columnsOf('photo')).toEqual([
      'archived_at',
      'captured_at',
      'certification_id',
      'depth_object_key',
      'depth_sha256',
      'depth_uploaded_at',
      'device_id',
      'device_utc_offset_minutes',
      'drop_off_log_id',
      'field_event_id',
      'id',
      'incident_id',
      'label',
      'latitude',
      'longitude',
      'object_key',
      'original_sha256',
      'project_id',
      // While its record waits in quarantine (ADR-338; AC-05-22).
      'quarantined_record_id',
      'received_at',
      'roe_id',
      'scale_receipt_id',
      'survey_id',
      'uploaded_at',
      'uploaded_sha256',
      'view',
    ]);
    // A ticket's photographs are each field event's own; how many is the phone's rule, never the
    // database's: a ninth on one field event is taken.
    for (let taken = 0; taken < 8; taken += 1) {
      await photograph({ field_event_id: collection });
    }
    expect(
      (
        await db.one<{ count: number }>(
          `SELECT count(*)::int AS count FROM "photo" WHERE "field_event_id" = $1`,
          [collection],
        )
      ).count,
    ).toBe(9);
  });

  it('AC-04-77 keeps when and where it was taken, the phone, both fingerprints and where the file is, and may name its depth data', async () => {
    const { db, world } = tested;
    await asThePhone();
    const collection = await event({ ticket_number: '101020' });
    const original = fingerprintOf('IMG_0412.HEIC as taken');
    const uploaded = fingerprintOf('IMG_0412.HEIC as uploaded');
    const depth = fingerprintOf('IMG_0412.HEIC depth');
    const id = await photograph(
      { field_event_id: collection },
      {
        original_sha256: original,
        uploaded_sha256: uploaded,
        object_key: 'photographs/101020/1',
        depth_object_key: 'photographs/101020/1.depth',
        depth_sha256: depth,
      },
    );
    expect(
      await db.one(
        `SELECT "captured_at", "device_utc_offset_minutes", "latitude", "longitude",
           "device_id"::text AS device, "original_sha256", "uploaded_sha256", "object_key",
           "depth_object_key", "depth_sha256", "uploaded_at", "depth_uploaded_at",
           "received_at" IS NOT NULL AS received
         FROM "photo" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({
      captured_at: new Date('2026-10-13T13:20:00Z'),
      device_utc_offset_minutes: -240,
      latitude: '39.16000000',
      longitude: '-75.57000000',
      device: world.device,
      original_sha256: original,
      uploaded_sha256: uploaded,
      object_key: 'photographs/101020/1',
      depth_object_key: 'photographs/101020/1.depth',
      depth_sha256: depth,
      uploaded_at: null,
      depth_uploaded_at: null,
      received: true,
    });
    const owner = { field_event_id: collection };
    for (const [what, more, how] of [
      ['no capture time', { captured_at: null }, refusedBy.notNull],
      ['no offset', { device_utc_offset_minutes: null }, refusedBy.notNull],
      ['no fingerprint at capture', { original_sha256: null }, refusedBy.notNull],
      ['no fingerprint of the upload', { uploaded_sha256: null }, refusedBy.notNull],
      ['no place in storage', { object_key: null }, refusedBy.notNull],
      ['a blank place in storage', { object_key: ' ' }, refusedBy.check],
      ['a blank place for its depth data', { depth_object_key: '' }, refusedBy.check],
      ['a fingerprint that isn’t a SHA-256', { original_sha256: 'abc123' }, refusedBy.check],
      ['a fingerprint in capitals', { uploaded_sha256: uploaded.toUpperCase() }, refusedBy.check],
      // The depth file's own fingerprint, exactly where a depth file goes (ADR-482).
      [
        'a depth file with no fingerprint',
        { depth_object_key: 'photographs/101020/2.depth' },
        refusedBy.check,
      ],
      ['a depth file’s fingerprint with no depth file', { depth_sha256: depth }, refusedBy.check],
      [
        'a depth file’s fingerprint that isn’t a SHA-256',
        { depth_object_key: 'photographs/101020/2.depth', depth_sha256: 'abc123' },
        refusedBy.check,
      ],
      // A record is kept before its files reach storage (ADR-482).
      [
        'a record kept with its file already uploaded',
        { uploaded_at: '2026-10-13T22:00:00Z' },
        refusedBy.check,
      ],
      [
        'a record kept with its depth file already uploaded',
        {
          depth_object_key: 'photographs/101020/2.depth',
          depth_sha256: depth,
          depth_uploaded_at: '2026-10-13T22:00:00Z',
        },
        refusedBy.check,
      ],
      ['a latitude alone', { longitude: null }, refusedBy.check],
      ['a latitude off the earth', { latitude: 91 }, refusedBy.check],
      ['a longitude off the earth', { longitude: -181 }, refusedBy.check],
      ['another photograph’s file', { object_key: 'photographs/101020/1' }, refusedBy.unique],
      [
        'another photograph’s depth data',
        { depth_object_key: 'photographs/101020/1.depth', depth_sha256: depth },
        refusedBy.unique,
      ],
    ] as const) {
      expect(await refusedRecord('photo', photoLike(world, owner, more)), what).toBe(how);
    }
    // No fix at all, and no phone, are taken.
    await photograph(owner, { latitude: null, longitude: null, device_id: null });
  });

  it('AC-04-77 is never deleted, and what says which file it is is never overwritten', async () => {
    const { db, world } = tested;
    await asThePhone();
    const collection = await event({ ticket_number: '101020' });
    const disposal = await event(atTheLandfill('101020'));
    const id = await photograph({ field_event_id: collection });
    // The file reaches storage, uploaded by the phone that took it (ADR-482); a reviewer moves
    // the record to the field event it belongs to; its time and place are corrected by
    // permission.
    await db.run(`UPDATE "photo" SET "uploaded_at" = '2026-10-13T22:00:00Z' WHERE "id" = $1`, [id]);
    await asTheBackOffice();
    await db.run(`UPDATE "photo" SET "field_event_id" = $2 WHERE "id" = $1`, [id, disposal]);
    await db.run(`UPDATE "photo" SET "captured_at" = '2026-10-13T13:21:00Z' WHERE "id" = $1`, [id]);
    const file: Row = {
      original_sha256: fingerprintOf('another file'),
      uploaded_sha256: fingerprintOf('another upload'),
      object_key: 'photographs/overwritten',
      depth_object_key: 'photographs/overwritten.depth',
      depth_sha256: fingerprintOf('another depth file'),
    };
    for (const login of ['adms_api', 'adms_owner'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      for (const [column, value] of Object.entries(file)) {
        const refusal = await db.refused(`UPDATE "photo" SET "${column}" = $2 WHERE "id" = $1`, [
          id,
          value,
        ]);
        expect(refusal.code, `${login} ${column}`).toBe(refusedBy.trigger);
        expect(refusal.message).toContain('never edits a photo row');
      }
    }
    await asTheBackOffice();
    expect((await db.refused(`DELETE FROM "photo" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.grant,
    );
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      (await db.refused(`UPDATE "photo" SET "uploaded_at" = now() WHERE "id" = $1`, [id])).code,
    ).toBe(refusedBy.grant);
    await db.administer();
    await db.actor(world.admin, 'BACK_OFFICE');
    expect((await db.refused(`DELETE FROM "photo" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.trigger,
    );
    // A file set aside names its photograph (ADR-482), so a truncate is refused by that foreign
    // key before any trigger (feature_not_supported); the catalog's exact trigger list holds the
    // truncate guard.
    expect((await db.refused(`TRUNCATE "photo"`)).code).toBe('0A000');
    expect(
      await db.one(
        `SELECT count(*)::int AS changes FROM "audit_record"
         WHERE "table_name" = 'photo' AND "record_id" = $1 AND "domain" = 'RECORDS'`,
        [id],
      ),
    ).toEqual({ changes: 4 });
  });

  it('AC-04-77 when its files reached storage is written once, by the phone that took it, and a file that isn’t the one fingerprinted is set aside for good', async () => {
    const { db, world } = tested;
    await asThePhone();
    const collection = await event({ ticket_number: '101020' });
    const id = await photograph(
      { field_event_id: collection },
      { depth_object_key: 'photographs/101020/1.depth', depth_sha256: fingerprintOf('depth') },
    );
    const plain = await photograph({ field_event_id: collection });
    const upload = (column: string, at: string, of = id): [string, unknown[]] => [
      `UPDATE "photo" SET "${column}" = $2 WHERE "id" = $1`,
      [of, at],
    ];
    // Nobody but the phone that took it writes when a file reached storage (ADR-482): not the
    // back office, not another phone, not a phone that doesn't say which it is.
    const others: [string, () => Promise<void>][] = [
      ['the back office', asTheBackOffice],
      [
        'the back office naming the phone',
        async () => {
          await db.as('adms_api');
          await db.actor(world.admin, 'BACK_OFFICE', { deviceId: world.device });
        },
      ],
      [
        'another phone',
        async () => {
          await db.as('adms_api');
          await db.actor(world.certifier, 'DEVICE', { deviceId: world.certifyingDevice });
        },
      ],
      [
        'a phone that names none',
        async () => {
          await db.as('adms_api');
          await db.actor(world.monitor, 'DEVICE');
        },
      ],
    ];
    for (const [who, as] of others) {
      await as();
      for (const column of ['uploaded_at', 'depth_uploaded_at']) {
        const refusal = await db.refused(...upload(column, '2026-10-13T22:00:00Z'));
        expect(refusal.code, `${who} ${column}`).toBe(refusedBy.grant);
        expect(refusal.message).toContain('uploaded by the phone that took it');
      }
    }
    await asThePhone();
    await db.run(...upload('uploaded_at', '2026-10-13T22:00:00Z'));
    await db.run(...upload('depth_uploaded_at', '2026-10-13T22:00:05Z'));
    // Written again as it is, nothing changes; written as anything else, refused, by anyone.
    await db.run(...upload('uploaded_at', '2026-10-13T22:00:00Z'));
    for (const [column, at] of [
      ['uploaded_at', '2026-10-13T23:00:00Z'],
      ['depth_uploaded_at', '2026-10-13T23:00:00Z'],
    ] as const) {
      for (const login of ['adms_api', 'adms_owner'] as const) {
        await db.as(login);
        await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
        const refusal = await db.refused(...upload(column, at));
        expect(refusal.code, `${login} ${column}`).toBe(refusedBy.trigger);
        expect(refusal.message).toContain('written once');
      }
    }
    await asThePhone();
    expect(
      (await db.refused(`UPDATE "photo" SET "uploaded_at" = NULL WHERE "id" = $1`, [id])).code,
    ).toBe(refusedBy.trigger);
    // A photograph with no depth file has no depth file's upload.
    const refusal = await db.refused(...upload('depth_uploaded_at', '2026-10-13T22:00:00Z', plain));
    expect(refusal.code).toBe(refusedBy.check);
    expect(refusal.message).toContain('"photo_depth_check"');

    // A file set aside: what arrived for the photograph, as the server read it.
    const setAside = (more: Row = {}): Row => ({
      photo_id: plain,
      file: 'PHOTO',
      device_id: world.device,
      received_sha256: fingerprintOf('not the file fingerprinted'),
      byte_count: 2_048_576,
      content_type: 'image/heic',
      object_key: `projects/${world.p1}/photos/${plain}.set-aside/1`,
      ...more,
    });
    const kept = (await db.one<{ id: string }>(...insertOf('set_aside_file', setAside()))).id;
    expect(
      (await db.refused(...insertOf('set_aside_file', setAside({ object_key: 'elsewhere' })))).code,
      'the same file again',
    ).toBe(refusedBy.unique);
    expect(
      (
        await db.refused(
          ...insertOf('set_aside_file', setAside({ received_sha256: fingerprintOf('another') })),
        )
      ).code,
      'another file at the same place',
    ).toBe(refusedBy.unique);
    for (const [what, more, how] of [
      ['no file at all', { byte_count: 0 }, refusedBy.check],
      ['a type that isn’t one', { content_type: 'image/heic; x=1' }, refusedBy.check],
      ['a fingerprint that isn’t one', { received_sha256: 'abc123' }, refusedBy.check],
      ['a blank place', { object_key: ' ' }, refusedBy.check],
      ['not one of a photograph’s files', { file: 'THUMBNAIL' }, refusedBy.badValue],
    ] as const) {
      // Each its own file at its own place, so only what is tried can refuse it.
      const own = { received_sha256: fingerprintOf(what), object_key: what.replaceAll(' ', '-') };
      expect(
        (await db.refused(...insertOf('set_aside_file', setAside({ ...own, ...more })))).code,
        what,
      ).toBe(how);
    }
    // Only the phone that took its photograph sets a file aside.
    const elsewhere = { received_sha256: fingerprintOf('another'), object_key: 'another' };
    for (const [who, as, more] of [
      ['the back office', asTheBackOffice, {}],
      [
        'the back office naming the phone',
        async () => {
          await db.as('adms_api');
          await db.actor(world.admin, 'BACK_OFFICE', { deviceId: world.device });
        },
        {},
      ],
      [
        'another phone, of a photograph it didn’t take',
        async () => {
          await db.as('adms_api');
          await db.actor(world.certifier, 'DEVICE', { deviceId: world.certifyingDevice });
        },
        { device_id: world.certifyingDevice },
      ],
    ] as const) {
      await as();
      const refused = await db.refused(
        ...insertOf('set_aside_file', setAside({ ...elsewhere, ...more })),
      );
      expect(refused.code, who).toBe(refusedBy.grant);
      expect(refused.message, who).toContain('the phone that took its photograph');
    }
    // Never changed, never deleted: the API has no grant to, and its owner is refused by the
    // trigger; the worker doesn't read it.
    const change = `UPDATE "set_aside_file" SET "byte_count" = 1 WHERE "id" = $1`;
    await asThePhone();
    expect((await db.refused(change, [kept])).code).toBe(refusedBy.grant);
    await db.as('adms_owner');
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    expect((await db.refused(change, [kept])).code).toBe(refusedBy.trigger);
    await asThePhone();
    expect((await db.refused(`DELETE FROM "set_aside_file" WHERE "id" = $1`, [kept])).code).toBe(
      refusedBy.grant,
    );
    await db.as('adms_worker');
    expect((await db.refused(`SELECT * FROM "set_aside_file"`)).code).toBe(refusedBy.grant);
    await db.administer();
    await db.actor(world.admin, 'BACK_OFFICE');
    for (const sql of [
      `DELETE FROM "set_aside_file" WHERE "id" = $1`,
      `TRUNCATE "set_aside_file"`,
    ]) {
      expect((await db.refused(sql, sql.includes('$1') ? [kept] : [])).code, sql).toBe(
        refusedBy.trigger,
      );
    }
    expect(
      await db.one(
        `SELECT count(*)::int AS kept FROM "audit_record"
         WHERE "table_name" = 'set_aside_file' AND "record_id" = $1 AND "domain" = 'RECORDS'`,
        [kept],
      ),
    ).toEqual({ kept: 1 });
  });

  it('AC-04-78 each of a certification’s five photographs says which view it is, and no other photograph has a view', async () => {
    const { db, world } = tested;
    const views = ['OPERATOR_WITH_PLACARD', 'INTERIOR_OR_BACK', 'RIGHT', 'LEFT', 'FRONT'];
    expect(
      (
        await db.rows<{ value: string }>(
          `SELECT enumlabel AS value FROM pg_enum WHERE enumtypid = 'photo_view'::regtype
           ORDER BY enumsortorder`,
        )
      ).map((row) => row.value),
    ).toEqual(views);
    await db.as('adms_api');
    await db.actor(world.certifier, 'DEVICE', { deviceId: world.certifyingDevice });
    const certification = { certification_id: world.certifications.c730415 };
    const fromSamsPhone = {
      device_id: world.certifyingDevice,
      captured_at: '2026-10-10T15:30:00Z',
    };
    for (const view of views) {
      await photograph(certification, { ...fromSamsPhone, view });
    }
    expect(
      (
        await db.rows<{ view: string }>(
          `SELECT p."view"::text AS view FROM "photo" p
           JOIN "certification" c ON c."id" = p."certification_id"
           WHERE c."cert_number" = '730415' AND c."project_id" = $1 ORDER BY p."view"`,
          [world.p1],
        )
      ).map((row) => row.view),
    ).toEqual(views);
    expect(await refusedRecord('photo', photoLike(world, certification, { view: 'TOP' }))).toBe(
      refusedBy.badValue,
    );
    // A crew's photograph has no view to name; one synced with a view missing is a flag's
    // (AC-03-35), never a refusal.
    const crew = (await db.one<{ id: string }>(...phoneInsertOf('certification', crewLike(world))))
      .id;
    await photograph({ certification_id: crew }, fromSamsPhone);
    await asThePhone();
    const collection = await event({ ticket_number: '101020' });
    const bcl88241 = await receipt();
    for (const [what, owner] of [
      ['a field event’s', { field_event_id: collection }],
      ['a scale receipt’s', { scale_receipt_id: bcl88241 }],
    ] as const) {
      const refusal = await db.refused(
        ...phoneInsertOf('photo', photoLike(world, owner, { view: 'FRONT' })),
      );
      expect(refusal.code, what).toBe(refusedBy.check);
      expect(refusal.message, what).toContain('"photo_view_check"');
    }
  });

  // What the audit log kept of each change to one column of a photograph, oldest first.
  async function auditedChangesOf(id: string, column: string): Promise<Row[]> {
    return tested.db.rows(
      `SELECT "actor_id"::text AS actor, "source"::text AS source, "changed_fields",
         "prior_value" -> '${column}' IS NOT NULL
           AND "prior_value" -> '${column}' <> 'null'::jsonb AS had,
         "new_value" -> '${column}' <> 'null'::jsonb AS has
       FROM "audit_record"
       WHERE "table_name" = 'photo' AND "record_id" = $1 AND "operation" = 'UPDATE'
         AND "domain" = 'RECORDS'
       ORDER BY "id"`,
      [id],
    );
  }

  it('AC-04-102 the back office removes a photograph from the record: a mark on its record, with the file, its fingerprints and the record kept, and who and when in the audit log', async () => {
    const { db, world } = tested;
    await asThePhone();
    const collection = await event({ ticket_number: '101020' });
    const id = await photograph({ field_event_id: collection });
    const kept = await photograph({ field_event_id: collection });
    const asTaken = await db.one<Row>(
      `SELECT "original_sha256", "uploaded_sha256", "object_key", "archived_at", "label"
       FROM "photo" WHERE "id" = $1`,
      [id],
    );
    // A phone sends neither mark.
    expect(asTaken).toMatchObject({ archived_at: null, label: null });
    // Dana removes it on Wednesday at 10:05 (UTC−4).
    await asTheBackOffice();
    await db.run(`UPDATE "photo" SET "archived_at" = '2026-10-14T14:05:00Z' WHERE "id" = $1`, [id]);
    expect(
      await db.rows(
        `SELECT "id"::text AS id, "archived_at", "original_sha256", "uploaded_sha256", "object_key"
         FROM "photo" WHERE "field_event_id" = $1 ORDER BY "archived_at" NULLS LAST`,
        [collection],
      ),
    ).toEqual([
      {
        id,
        archived_at: new Date('2026-10-14T14:05:00Z'),
        original_sha256: asTaken['original_sha256'],
        uploaded_sha256: asTaken['uploaded_sha256'],
        object_key: asTaken['object_key'],
      },
      expect.objectContaining({ id: kept, archived_at: null }),
    ]);
    // Removed is not deleted, and what says which file it is still can't be changed.
    expect((await db.refused(`DELETE FROM "photo" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.grant,
    );
    expect(
      (
        await db.refused(`UPDATE "photo" SET "object_key" = 'photographs/gone' WHERE "id" = $1`, [
          id,
        ])
      ).code,
    ).toBe(refusedBy.trigger);
    // It is put back by clearing the mark.
    await db.run(`UPDATE "photo" SET "archived_at" = NULL WHERE "id" = $1`, [id]);
    // The worker reads the mark and never sets it.
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(await db.one(`SELECT "archived_at" FROM "photo" WHERE "id" = $1`, [id])).toEqual({
      archived_at: null,
    });
    expect(
      (await db.refused(`UPDATE "photo" SET "archived_at" = now() WHERE "id" = $1`, [id])).code,
    ).toBe(refusedBy.grant);
    await db.administer();
    await db.actor(world.admin, 'BACK_OFFICE');
    expect((await db.refused(`DELETE FROM "photo" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.trigger,
    );
    const dana = { actor: world.admin, source: 'BACK_OFFICE', changed_fields: ['archived_at'] };
    expect(await auditedChangesOf(id, 'archived_at')).toEqual([
      { ...dana, had: false, has: true },
      { ...dana, had: true, has: false },
    ]);
    expect(await auditedChangesOf(kept, 'archived_at')).toEqual([]);
  });

  it('AC-04-103 the back office labels a photograph in its own words, changes the label and takes it off, each change audited with what it said before', async () => {
    const { db, world } = tested;
    await asThePhone();
    const collection = await event({ ticket_number: '101020' });
    const id = await photograph({ field_event_id: collection });
    await asTheBackOffice();
    await db.run(`UPDATE "photo" SET "label" = 'Pile at the curb before loading' WHERE "id" = $1`, [
      id,
    ]);
    await db.run(`UPDATE "photo" SET "label" = 'Pile at the curb, 22 Elm St' WHERE "id" = $1`, [
      id,
    ]);
    expect(
      await db.one(`SELECT "label", "archived_at" FROM "photo" WHERE "id" = $1`, [id]),
    ).toEqual({ label: 'Pile at the curb, 22 Elm St', archived_at: null });
    // A blank isn't a label; no label is no value.
    for (const blank of ['', '   ']) {
      const refusal = await db.refused(`UPDATE "photo" SET "label" = $2 WHERE "id" = $1`, [
        id,
        blank,
      ]);
      expect(refusal.code, `"${blank}"`).toBe(refusedBy.check);
      expect(refusal.message).toContain('"photo_label_check"');
    }
    // A removed photograph keeps its label, and may be given one.
    await db.run(`UPDATE "photo" SET "archived_at" = '2026-10-14T14:05:00Z' WHERE "id" = $1`, [id]);
    await db.run(`UPDATE "photo" SET "label" = NULL WHERE "id" = $1`, [id]);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      (await db.refused(`UPDATE "photo" SET "label" = 'Front' WHERE "id" = $1`, [id])).code,
    ).toBe(refusedBy.grant);
    await db.administer();
    expect(
      await db.rows(
        `SELECT "actor_id"::text AS actor, "prior_value" ->> 'label' AS said,
           "new_value" ->> 'label' AS says
         FROM "audit_record"
         WHERE "table_name" = 'photo' AND "record_id" = $1 AND "operation" = 'UPDATE'
           AND "changed_fields" = ARRAY['label']
         ORDER BY "id"`,
        [id],
      ),
    ).toEqual([
      { actor: world.admin, said: null, says: 'Pile at the curb before loading' },
      {
        actor: world.admin,
        said: 'Pile at the curb before loading',
        says: 'Pile at the curb, 22 Elm St',
      },
      { actor: world.admin, said: 'Pile at the curb, 22 Elm St', says: null },
    ]);
  });
});

describe('what a read-only viewer sees of them', () => {
  // P1's `BCL-88241` with a photograph of the paper, and a photograph of a collection.
  async function written(): Promise<{ receipt: string; photos: string[] }> {
    await asThePhone();
    const collection = await event({ ticket_number: '101020' });
    const bcl88241 = await receipt();
    const photos = [
      await photograph({ scale_receipt_id: bcl88241 }),
      await photograph({ field_event_id: collection }),
    ];
    await tested.db.administer();
    return { receipt: bcl88241, photos };
  }

  async function sees(viewerId: string, view: string): Promise<string[]> {
    const { db } = tested;
    await db.viewer(viewerId);
    await db.as('adms_readonly');
    const rows = await db.rows<{ id: string }>(`SELECT "id"::text AS id FROM "${view}" ORDER BY 1`);
    await db.administer();
    return rows.map((row) => row.id);
  }

  it('a client user and an auditor see their projects’ scale receipts and photographs; a contractor user those of its own tickets; a viewer of another project none', async () => {
    const { db, world } = tested;
    const { receipt: bcl88241, photos } = await written();
    for (const viewer of [world.clientViewer, world.auditor]) {
      expect(await sees(viewer, 'viewer_scale_receipt')).toEqual([bcl88241]);
      expect(await sees(viewer, 'viewer_photo')).toEqual([...photos].sort());
    }
    // Coastline's contractor user: the photograph of the collection on its `730415`; no field
    // event of its own points at the receipt yet, so neither the receipt nor the photograph of
    // its paper (ADR-361; AC-02-78).
    expect(await sees(world.coastlineViewer, 'viewer_scale_receipt')).toEqual([]);
    expect(await sees(world.coastlineViewer, 'viewer_photo')).toEqual([photos[1]]);
    // The client user is given P1 only: P2's receipt isn't theirs.
    const onP2 = await cypressCreek(world.p2);
    await asThePhone();
    const p2Receipt = await receipt({
      project_id: world.p2,
      site_id: onP2,
      receipt_number: 'CCL-60001',
    });
    await db.administer();
    expect(await sees(world.clientViewer, 'viewer_scale_receipt')).toEqual([bcl88241]);
    expect(await sees(world.auditor, 'viewer_scale_receipt')).toEqual([bcl88241, p2Receipt].sort());
  });

  it('no viewer reads where a photograph’s file is kept, or either table itself past its view’s columns', async () => {
    const { db, world } = tested;
    await written();
    await db.viewer(world.auditor);
    await db.as('adms_readonly');
    const shown = Object.keys(await db.one<Row>(`SELECT * FROM "viewer_photo" LIMIT 1`));
    expect(shown).toContain('original_sha256');
    expect(shown).toContain('uploaded_sha256');
    expect(shown).not.toContain('object_key');
    expect(shown).not.toContain('depth_object_key');
    // The back office's two marks are shown: a removed photograph's record is seen with its mark
    // (AC-04-102, 103; ADR-337).
    expect(shown).toContain('archived_at');
    expect(shown).toContain('label');
    for (const sql of [
      `SELECT "object_key" FROM "photo"`,
      `SELECT "depth_object_key" FROM "photo"`,
      `SELECT * FROM "photo"`,
      `UPDATE "scale_receipt" SET "net_weight_lb" = 1`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
  });
});
