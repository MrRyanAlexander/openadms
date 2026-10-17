// REQ-106, 106a, 106b, 106e, 106f: certifications, their measured boxes and their helpers
// (spec/DATA-MODEL.md §3 "Certifications", §8; adms-certifications §3A.2…§3A.6; ADR-009, 015, 045,
// 076, 079, 080, 082, 087, 108, 152, 294, 318, 321). spec/acceptance/03-certification.md, proven at
// the database: AC-03-01…05, 07, 08, 10, 12, 13, 16, 18…20, 36, 37, 53, 55, 56, 58…60; the place a
// typed sub gets (AC-03-11); signatures on file (AC-03-38); and the database's half of AC-03-22,
// 26 and 29. The capacity itself is packages/domain's Capacity; that nobody types it, a sub typed
// at certification and a corrected measurement are the story `certification`'s.
// The certifications are the example world's: P1's `730415`…`730419`, as Sam Grant made them on
// Saturday 10 October 2026, and P2's own `730416`.
import { boxShapes, boxSigns } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  boxLike,
  certificationLike,
  crewLike,
  insertOf,
  subOn,
  without,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

const coastline = 'Coastline Haulers LLC';
const tables = ['certification', 'certification_box', 'certification_helper'] as const;

// Sam Grant, on his phone.
async function asThePhone(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.certifier, 'DEVICE', { deviceId: world.certifyingDevice });
}

// Dana Reyes, in the back office.
async function asTheBackOffice(): Promise<void> {
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

// A container as Sam makes one, with its primary box: its id.
async function container(more: Record<string, unknown> = {}): Promise<string> {
  const id = await add('certification', certificationLike(tested.world, more));
  await add('certification_box', boxLike(id, 0));
  return id;
}

// What a commit would ask: every container has its primary box.
const theWorkEnds = 'SET CONSTRAINTS ALL IMMEDIATE';

async function valuesOf(type: string): Promise<string[]> {
  return (
    await tested.db.rows<{ value: string }>(
      `SELECT e.enumlabel AS value FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = $1 ORDER BY e.enumsortorder`,
      [type],
    )
  ).map((row) => row.value);
}

async function columnsOf(table: string): Promise<string[]> {
  return (
    await tested.db.rows<{ column: string }>(
      `SELECT column_name AS column FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table],
    )
  ).map((row) => row.column);
}

interface Audited {
  operation: string;
  changed: string[];
  prior: Record<string, unknown> | null;
  actor: string;
  source: string;
  device: string | null;
  domain: string;
}

async function auditOf(recordId: string): Promise<Audited[]> {
  return tested.db.rows<Audited>(
    `SELECT "operation"::text, "changed_fields" AS changed, "prior_value" AS prior,
       "actor_id"::text AS actor, "source"::text, "device_id"::text AS device, "domain"::text
     FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
    [recordId],
  );
}

// What the read-only login reads from a viewer view, for the viewer stated: one column, in order.
async function reads(viewerId: string, view: string, column: string): Promise<string[]> {
  const { db } = tested;
  await db.viewer(viewerId);
  await db.as('adms_readonly');
  const rows = await db.rows<{ value: string }>(
    `SELECT "${column}"::text AS value FROM "${view}" ORDER BY 1`,
  );
  await db.administer();
  return rows.map((row) => row.value);
}

describe('what is certified, and its one number', () => {
  it('AC-03-01 each of P1’s five certifications is a container or a crew, said on the record, never a vehicle', async () => {
    const { db, world } = tested;
    expect(await valuesOf('certification_kind')).toEqual(['CONTAINER', 'CREW']);
    await db.as('adms_worker');
    expect(
      await db.rows(
        `SELECT c."cert_number" AS number, c."kind"::text, c."capacity_cy" AS capacity,
           coalesce(v."name", c."vehicle_type_other", w."name") AS what
         FROM "certification" c LEFT JOIN "vehicle_type" v ON v."id" = c."vehicle_type_id"
           LEFT JOIN "crew_type" w ON w."id" = c."crew_type_id"
         WHERE c."project_id" = $1 ORDER BY c."cert_number"`,
        [world.p1],
      ),
    ).toEqual([
      { number: '730415', kind: 'CONTAINER', capacity: 65, what: 'Hydraulic Dump Trailer' },
      { number: '730416', kind: 'CONTAINER', capacity: 48, what: 'Self-Loading Truck' },
      { number: '730417', kind: 'CREW', capacity: null, what: 'Bucket Truck' },
      { number: '730418', kind: 'CREW', capacity: null, what: 'Skid Steer' },
      { number: '730419', kind: 'CONTAINER', capacity: 110, what: 'Walking floor trailer' },
    ]);
    await asThePhone();
    expect(await refusedRow('certification', without(certificationLike(world), 'kind'))).toBe(
      refusedBy.notNull,
    );
    expect(await refusedRow('certification', certificationLike(world, { kind: 'VEHICLE' }))).toBe(
      refusedBy.badValue,
    );
  });

  it('AC-03-02 crew 730417 has no capacity and no measured box, and the database refuses either on a crew', async () => {
    const { db, world } = tested;
    const crew = world.certifications.c730417;
    expect(
      await db.one(
        `SELECT c."capacity_cy" AS capacity,
           (SELECT count(*)::int FROM "certification_box" b WHERE b."certification_id" = c."id") AS boxes
         FROM "certification" c WHERE c."id" = $1`,
        [crew],
      ),
    ).toEqual({ capacity: null, boxes: 0 });
    await asThePhone();
    // Not nought: none.
    for (const capacity of [0, 30]) {
      const refusal = await db.refused(
        ...insertOf('certification', { ...crewLike(world), capacity_cy: capacity }),
      );
      expect(refusal.code, String(capacity)).toBe(refusedBy.check);
      expect(refusal.message).toContain('"certification_kind_check"');
    }
    expect(
      (await db.refused(`UPDATE "certification" SET "capacity_cy" = 12 WHERE "id" = $1`, [crew]))
        .code,
    ).toBe(refusedBy.check);
    // A box says it is a container's, and its certification must be one.
    const onACrew = await db.refused(...insertOf('certification_box', boxLike(crew, 0)));
    expect(onACrew.code).toBe(refusedBy.foreignKey);
    expect(onACrew.message).toContain('"certification_box_certification_id_kind_fkey"');
    const asACrews = await db.refused(
      ...insertOf('certification_box', boxLike(crew, 0, { kind: 'CREW' })),
    );
    expect(asACrews.code).toBe(refusedBy.check);
    expect(asACrews.message).toContain('"certification_box_kind_check"');
  });

  it('AC-03-02 container 730415 has a capacity and its boxes, and the database refuses a container without a capacity', async () => {
    const { db, world } = tested;
    expect(
      await db.rows(
        `SELECT b."position", f."name" AS feature, b."shape"::text, b."sign"::text, b."length",
           b."width", b."height"
         FROM "certification_box" b LEFT JOIN "vehicle_feature" f ON f."id" = b."feature_id"
         WHERE b."certification_id" = $1 ORDER BY b."position"`,
        [world.certifications.c730415],
      ),
    ).toEqual([
      {
        position: 0,
        feature: null,
        shape: 'RECTANGLE',
        sign: 'ADD',
        length: 360,
        width: 96,
        height: 72,
      },
      {
        position: 1,
        feature: 'Sideboards',
        shape: 'RECTANGLE',
        sign: 'ADD',
        length: 360,
        width: 96,
        height: 16,
      },
    ]);
    await asThePhone();
    for (const row of [
      without(certificationLike(world), 'capacity_cy'),
      certificationLike(world, { capacity_cy: -1 }),
    ]) {
      const refusal = await db.refused(...insertOf('certification', row));
      expect(refusal.code).toBe(refusedBy.check);
      expect(refusal.message).toContain('"certification_kind_check"');
    }
    // A capacity that works out to nought is still a capacity (ADR-321).
    await container({ capacity_cy: 0 });
    await db.run(theWorkEnds);
  });

  it('AC-03-02 a container without its primary box is refused when the piece of work that wrote it ends', async () => {
    const { db, world } = tested;
    await asThePhone();
    const bare = await add('certification', certificationLike(world));
    const refusal = await db.refused(theWorkEnds);
    expect(refusal).toEqual({
      code: refusedBy.check,
      message:
        "Open ADMS keeps a container's primary box with its certification: a container is measured",
    });
    // A box after the primary doesn't stand in for it.
    await add(
      'certification_box',
      boxLike(bare, 1, { feature_id: world.vehicleFeatures.sideboards }),
    );
    expect((await db.refused(theWorkEnds)).code).toBe(refusedBy.check);
    await add('certification_box', boxLike(bare, 0));
    await db.run(theWorkEnds);
  });

  it('AC-03-02 a measured container can’t be made a crew, a crew can’t be made a container without a box, and a primary box is never moved or taken off', async () => {
    const { db, world } = tested;
    await asTheBackOffice();
    const measured = await db.refused(
      `UPDATE "certification" SET "kind" = 'CREW', "capacity_cy" = NULL WHERE "id" = $1`,
      [world.certifications.c730415],
    );
    expect(measured.code).toBe(refusedBy.restrict);
    expect(measured.message).toContain('"certification_box_certification_id_kind_fkey"');
    const primary = `"certification_id" = '${world.certifications.c730415}' AND "position" = 0`;
    const archived = await db.refused(
      `UPDATE "certification_box" SET "archived_at" = now() WHERE ${primary}`,
    );
    expect(archived.code).toBe(refusedBy.check);
    expect(archived.message).toContain('"certification_box_primary_check"');
    for (const change of [
      `UPDATE "certification_box" SET "position" = 7, "feature_other" = 'Main bed' WHERE ${primary}`,
      `UPDATE "certification" SET "kind" = 'CONTAINER', "capacity_cy" = 20, "crew_type_id" = NULL
       WHERE "id" = '${world.certifications.c730417}'`,
    ]) {
      await db.run('SAVEPOINT changed');
      expect(await db.run(change)).toBe(1);
      expect((await db.refused(theWorkEnds)).code, change).toBe(refusedBy.check);
      await db.run('ROLLBACK TO SAVEPOINT changed');
    }
    // A box after the primary, entered by mistake, is taken off by archiving.
    expect(
      await db.run(
        `UPDATE "certification_box" SET "archived_at" = now()
         WHERE "certification_id" = $1 AND "position" = 1`,
        [world.certifications.c730415],
      ),
    ).toBe(1);
    await db.run(theWorkEnds);
  });

  it('AC-03-03 a second 730415 on P1 is refused; the same number on P2 is not: P2 has its own 730416', async () => {
    const { db, world } = tested;
    await asThePhone();
    const again = await db.refused(
      ...insertOf('certification', certificationLike(world, { cert_number: '730415' })),
    );
    expect(again.code).toBe(refusedBy.unique);
    expect(again.message).toContain('"certification_project_id_cert_number_key"');
    await add(
      'certification',
      certificationLike(world, {
        cert_number: '730415',
        project_id: world.p2,
        assignment_id: world.certifyingAssignments.p2,
      }),
    );
    expect(
      await db.rows(
        `SELECT p."name" AS project, c."capacity_cy" AS capacity FROM "certification" c
         JOIN "project" p ON p."id" = c."project_id" WHERE c."cert_number" = '730416' ORDER BY 1`,
      ),
    ).toEqual([
      { project: 'Bayline County PPDR, Hurricane Delphine', capacity: 48 },
      { project: 'Bayline County ROW, Hurricane Delphine', capacity: 48 },
    ]);
  });

  it('AC-03-04, AC-03-20, AC-03-37 a certification holds one number and what the paper form records: no placard or badge number, truck number, VIN, make, year, colour or tare weight, no client or declaration event of its own, and its representatives as names only', async () => {
    expect(await columnsOf('certification')).toEqual([
      'id',
      'project_id',
      'cert_number',
      'kind',
      'prime_id',
      'first_tier_sub_id',
      'second_tier_sub_id',
      'vehicle_type_id',
      'vehicle_type_other',
      'crew_type_id',
      'capacity_cy',
      'driver_name',
      'driver_phone',
      'driver_licence_number',
      'driver_licence_state',
      'driver_licence_expiry',
      'tag_number',
      'tag_state',
      'tag_expiry',
      'certified_at',
      'device_utc_offset_minutes',
      'received_at',
      'certified_by_id',
      'device_id',
      'assignment_id',
      'client_representative_name',
      'contractor_representative_name',
      'signatures_on_file',
      'replaces_id',
      'replaced_reason',
      'revoked_from',
      'revoked_reason',
      'revoked_by_id',
      'notes',
      // Entered from the paper sheet: who entered it, and why (ADR-521, 534 (1)).
      'created_by_id',
      'created_reason_id',
    ]);
    expect(
      await tested.db.one(
        `SELECT "client_representative_name" AS client, "contractor_representative_name" AS contractor
         FROM "certification" WHERE "id" = $1`,
        [tested.world.certifications.c730415],
      ),
    ).toEqual({
      client: 'Bayline County debris manager',
      contractor: 'Coastline Haulers dispatch',
    });
  });

  it('AC-03-05 a pre-printed sheet’s number, 88120, is the certification’s number, kept as written; no length is enforced, and a blank is refused', async () => {
    const { db, world } = tested;
    await asThePhone();
    for (const number of ['88120', '0088120', '7']) {
      const id = await add('certification', certificationLike(world, { cert_number: number }));
      expect(
        await db.one(`SELECT "cert_number" FROM "certification" WHERE "id" = $1`, [id]),
      ).toEqual({ cert_number: number });
    }
    for (const blank of ['', '   ']) {
      const refusal = await db.refused(
        ...insertOf('certification', certificationLike(world, { cert_number: blank })),
      );
      expect(refusal.code).toBe(refusedBy.check);
      expect(refusal.message).toContain('"certification_cert_number_check"');
    }
    expect(
      await refusedRow('certification', without(certificationLike(world), 'cert_number')),
    ).toBe(refusedBy.notNull);
  });

  it('AC-03-07 Coastline’s tandem is two certifications, its truck body 730421 (30 CY) and its trailer 730422 (40 CY), each with its own number, which needn’t be consecutive', async () => {
    const { db, world } = tested;
    await asThePhone();
    await container();
    await container({ cert_number: '730422', capacity_cy: 40 });
    await container({ cert_number: '730488', capacity_cy: 40 });
    expect(
      await db.rows(
        `SELECT "cert_number" AS number, "capacity_cy" AS capacity FROM "certification"
         WHERE "project_id" = $1 AND "cert_number" > '730420' ORDER BY 1`,
        [world.p1],
      ),
    ).toEqual([
      { number: '730421', capacity: 30 },
      { number: '730422', capacity: 40 },
      { number: '730488', capacity: 40 },
    ]);
  });

  it('AC-03-08 730415 says who made and measured it (Sam Grant), the phone, his assignment, the phone’s time with its offset, and when the server received it; its id is the one the phone made', async () => {
    const { db, world } = tested;
    expect(
      await db.one(
        `SELECT u."name" AS certified_by, d."name" AS phone, a."certifying",
           to_char(a."work_date", 'Dy DD Mon YYYY') AS assigned, p."name" AS project,
           to_char(c."certified_at" AT TIME ZONE p."time_zone", 'Dy DD Mon YYYY HH24:MI') AS certified,
           c."device_utc_offset_minutes" AS utc_offset,
           to_char(c."received_at" AT TIME ZONE p."time_zone", 'HH24:MI') AS received
         FROM "certification" c JOIN "user" u ON u."id" = c."certified_by_id"
           JOIN "device" d ON d."id" = c."device_id" JOIN "assignment" a ON a."id" = c."assignment_id"
           JOIN "project" p ON p."id" = a."project_id" WHERE c."id" = $1`,
        [world.certifications.c730415],
      ),
    ).toEqual({
      certified_by: 'Sam Grant',
      phone: 'P1-HO-TDSR',
      certifying: true,
      assigned: 'Sat 10 Oct 2026',
      project: 'Bayline County ROW, Hurricane Delphine',
      certified: 'Sat 10 Oct 2026 09:10',
      utc_offset: -240,
      received: '09:11',
    });
    await asThePhone();
    const fromThePhone = '019a1b2c-3d4e-7f50-8a6b-7c8d9e0f1a2b';
    expect(await add('certification', certificationLike(world, { id: fromThePhone }))).toBe(
      fromThePhone,
    );
    // A retried sync is the same record, never a second one.
    expect(await refusedRow('certification', certificationLike(world, { id: fromThePhone }))).toBe(
      refusedBy.unique,
    );
    for (const column of [
      'certified_at',
      'device_utc_offset_minutes',
      'received_at',
      'certified_by_id',
      'signatures_on_file',
    ]) {
      expect(
        await refusedRow(
          'certification',
          without(certificationLike(world, { cert_number: '730430' }), column),
        ),
        column,
      ).toBe(refusedBy.notNull);
    }
  });

  it('AC-03-61 one entered in the back office from its paper sheet names who entered it and the reason, both or neither, and then no phone and no assignment; who entered it is a person, and never changes', async () => {
    const { db, world } = tested;
    await db.administer();
    const deviceFailed = (
      await db.one<{ id: string }>(`SELECT "id"::text FROM "reason" WHERE "name" = 'Device failed'`)
    ).id;
    await asTheBackOffice();
    const fromTheSheet = {
      cert_number: '88120',
      device_id: null,
      assignment_id: null,
      created_by_id: world.admin,
      created_reason_id: deviceFailed,
    };
    const id = await add('certification', certificationLike(world, fromTheSheet));
    await add('certification_box', boxLike(id, 0));
    await db.run(theWorkEnds);
    for (const [what, more] of [
      ['no reason', { ...fromTheSheet, cert_number: '88121', created_reason_id: null }],
      ['no person', { ...fromTheSheet, cert_number: '88122', created_by_id: null }],
      ['a phone', { ...fromTheSheet, cert_number: '88123', device_id: world.certifyingDevice }],
      [
        'an assignment',
        { ...fromTheSheet, cert_number: '88124', assignment_id: world.certifyingAssignments.p1 },
      ],
      ['the system actor', { ...fromTheSheet, cert_number: '88125', created_by_id: world.worker }],
    ] as const) {
      const refused = await db.refused(
        ...insertOf('certification', certificationLike(world, more)),
      );
      expect(refused.code, what).toBe(refusedBy.check);
      expect(refused.message, what).toContain(
        what === 'the system actor' ? '_check' : '"certification_created_check"',
      );
    }
    for (const set of [
      `"created_by_id" = NULL, "created_reason_id" = NULL`,
      `"created_reason_id" = $2`,
    ]) {
      expect(
        (
          await db.refused(`UPDATE "certification" SET ${set} WHERE "id" = $1`, [
            id,
            ...(set.includes('$2') ? [deviceFailed] : []),
          ])
        ).code,
        set,
      ).toBe(refusedBy.trigger);
    }
  });

  it('the system actor certifies nothing, revokes nothing and helps nobody', async () => {
    const { db, world } = tested;
    await asThePhone();
    const certified = await db.refused(
      ...insertOf('certification', certificationLike(world, { certified_by_id: world.worker })),
    );
    expect(certified.code).toBe(refusedBy.check);
    expect(certified.message).toContain('"certification_system_actor_check"');
    expect(
      (
        await db.refused(
          `UPDATE "certification" SET "revoked_from" = '2026-10-14', "revoked_reason" = 'Sold',
             "revoked_by_id" = $2 WHERE "id" = $1`,
          [world.certifications.c730416, world.worker],
        )
      ).code,
    ).toBe(refusedBy.check);
    const helped = await db.refused(
      ...insertOf('certification_helper', {
        certification_id: world.certifications.c730416,
        user_id: world.worker,
      }),
    );
    expect(helped.message).toContain('"certification_helper_system_actor_check"');
  });
});

describe('whose truck: the prime and its subs', () => {
  it('AC-03-10 a certification’s prime is one of its own project’s primes: a sub, or a contractor that isn’t on the project, is refused', async () => {
    const { db, world } = tested;
    await asThePhone();
    await add('certification', certificationLike(world, { prime_id: world.summit }));
    for (const [who, contractor] of [
      ['Rivera Trucking, a sub on P1', world.rivera],
      ['Harbor Staffing, on no project', world.harbor],
    ] as const) {
      const refusal = await db.refused(
        ...insertOf(
          'certification',
          certificationLike(world, { cert_number: '730430', prime_id: contractor }),
        ),
      );
      expect(refusal.code, who).toBe(refusedBy.foreignKey);
      expect(refusal.message, who).toContain('"certification_project_id_prime_id_fkey"');
    }
    // Summit is a prime on P1, not on P2.
    expect(
      await refusedRow(
        'certification',
        certificationLike(world, {
          cert_number: '730430',
          project_id: world.p2,
          prime_id: world.summit,
        }),
      ),
    ).toBe(refusedBy.foreignKey);
    expect(await refusedRow('certification', without(certificationLike(world), 'prime_id'))).toBe(
      refusedBy.notNull,
    );
  });

  it('AC-03-11 730416 names prime Coastline and first-tier sub Rivera, which is placed on P1 under Coastline; a sub that isn’t placed under that prime on that project is refused', async () => {
    const { db, world } = tested;
    expect(
      await db.one(
        `SELECT prime."name" AS prime, sub."name" AS first_tier, place."position"::text AS place
         FROM "certification" c JOIN "contractor" prime ON prime."id" = c."prime_id"
           JOIN "contractor" sub ON sub."id" = c."first_tier_sub_id"
           JOIN "project_contractor" place ON place."project_id" = c."project_id"
             AND place."contractor_id" = c."first_tier_sub_id" AND place."prime_id" = c."prime_id"
         WHERE c."id" = $1`,
        [world.certifications.c730416],
      ),
    ).toEqual({ prime: coastline, first_tier: 'Rivera Trucking', place: 'SUB_TIER_1' });
    await asThePhone();
    const pinewood = await add('contractor', { name: 'Pinewood Hauling', kind: 'HAULER' });
    for (const [why, row] of [
      ['Pinewood has no place on P1', { first_tier_sub_id: pinewood }],
      [
        'Rivera is Coastline’s sub, not Summit’s',
        { prime_id: world.summit, first_tier_sub_id: world.rivera },
      ],
      ['Summit is a prime, never a sub', { first_tier_sub_id: world.summit }],
      ['Coastline isn’t its own sub', { first_tier_sub_id: world.coastline }],
    ] as const) {
      const refusal = await db.refused(...insertOf('certification', certificationLike(world, row)));
      expect(refusal.code, why).toBe(refusedBy.foreignKey);
      expect(refusal.message, why).toContain(
        '"certification_project_id_first_tier_sub_id_prime_id_fkey"',
      );
    }
    // Placed as certification places it, the sub can be named.
    await add('project_contractor', subOn(world.p1, pinewood, world.coastline));
    await add('certification', certificationLike(world, { first_tier_sub_id: pinewood }));
    // And its place can no longer be moved under another prime.
    const moved = await db.refused(
      `UPDATE "project_contractor" SET "prime_id" = $3 WHERE "project_id" = $1 AND "contractor_id" = $2`,
      [world.p1, pinewood, world.summit],
    );
    expect(moved.code).toBe(refusedBy.restrict);
  });

  it('AC-03-12 Tidewater Hauling, typed into tier 2 under Rivera, is placed on P1 as a tier 2 sub under prime Coastline; the certification names all three and its operating sub is the lowest tier filled; there is no third tier', async () => {
    const { db, world } = tested;
    await asThePhone();
    const tidewater = await add('contractor', { name: 'Tidewater Hauling', kind: 'HAULER' });
    await add('project_contractor', subOn(world.p1, tidewater, world.coastline, 2));
    const id = await add(
      'certification',
      certificationLike(world, {
        first_tier_sub_id: world.rivera,
        second_tier_sub_id: tidewater,
      }),
    );
    const whose = `SELECT prime."name" AS prime, first."name" AS first_tier, second."name" AS second_tier,
        coalesce(second."name", first."name") AS operating_sub
      FROM "certification" c JOIN "contractor" prime ON prime."id" = c."prime_id"
        LEFT JOIN "contractor" first ON first."id" = c."first_tier_sub_id"
        LEFT JOIN "contractor" second ON second."id" = c."second_tier_sub_id" WHERE c."id" = $1`;
    expect(await db.one(whose, [id])).toEqual({
      prime: coastline,
      first_tier: 'Rivera Trucking',
      second_tier: 'Tidewater Hauling',
      operating_sub: 'Tidewater Hauling',
    });
    expect(await db.one(whose, [world.certifications.c730416])).toMatchObject({
      operating_sub: 'Rivera Trucking',
    });
    for (const [why, row] of [
      ['a tier 2 sub with no tier 1', { second_tier_sub_id: tidewater }],
      [
        'the same sub in both tiers',
        { first_tier_sub_id: world.rivera, second_tier_sub_id: world.rivera },
      ],
    ] as const) {
      const refusal = await db.refused(
        ...insertOf('certification', certificationLike(world, { cert_number: '730430', ...row })),
      );
      expect(refusal.code, why).toBe(refusedBy.check);
      expect(refusal.message, why).toContain('"certification_subs_check"');
    }
    // A second-tier sub is held to its own place under that prime, as a first-tier one is.
    const pinewood = await add('contractor', { name: 'Pinewood Hauling', kind: 'HAULER' });
    for (const [why, row] of [
      ['Pinewood has no place on P1', { second_tier_sub_id: pinewood }],
      ['Summit is a prime, never a sub', { second_tier_sub_id: world.summit }],
    ] as const) {
      const refusal = await db.refused(
        ...insertOf(
          'certification',
          certificationLike(world, {
            cert_number: '730430',
            first_tier_sub_id: world.rivera,
            ...row,
          }),
        ),
      );
      expect(refusal.code, why).toBe(refusedBy.foreignKey);
      expect(refusal.message, why).toContain(
        '"certification_project_id_second_tier_sub_id_prime_id_fkey"',
      );
    }
    expect((await columnsOf('certification')).filter((column) => column.includes('tier'))).toEqual([
      'first_tier_sub_id',
      'second_tier_sub_id',
    ]);
  });

  it('AC-03-13 730415, Coastline’s own dump trailer, names its prime and no sub, and has no operating sub', async () => {
    const { db, world } = tested;
    expect(
      await db.one(
        `SELECT prime."name" AS prime, c."first_tier_sub_id" AS first_tier,
           c."second_tier_sub_id" AS second_tier,
           coalesce(c."second_tier_sub_id", c."first_tier_sub_id") AS operating_sub
         FROM "certification" c JOIN "contractor" prime ON prime."id" = c."prime_id"
         WHERE c."id" = $1`,
        [world.certifications.c730415],
      ),
    ).toEqual({ prime: coastline, first_tier: null, second_tier: null, operating_sub: null });
  });
});

describe('driver, tag, vehicle type and features', () => {
  it('AC-03-16, AC-03-18 the driver’s name, phone, licence number, state and expiry, and the tag’s number, state and expiry, are kept on the certification only: there is no driver list, and no field event stores a copy', async () => {
    const { db, world } = tested;
    expect(
      await db.one(
        `SELECT "driver_name", "driver_phone", "driver_licence_number", "driver_licence_state",
           "driver_licence_expiry"::text, "tag_number", "tag_state", "tag_expiry"::text
         FROM "certification" WHERE "id" = $1`,
        [world.certifications.c730416],
      ),
    ).toEqual({
      driver_name: 'Marco Rivera',
      driver_phone: '555-0142',
      driver_licence_number: 'R160-542-80-112-0',
      driver_licence_state: 'FL',
      driver_licence_expiry: '2028-03-31',
      tag_number: 'RVT 4821',
      tag_state: 'FL',
      tag_expiry: '2027-03-31',
    });
    expect(
      await db.rows(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name LIKE '%driver%'`,
      ),
    ).toEqual([]);
    // The truck's tag, that is: a field event's field tag is the firm's own label (ADR-218, 325).
    expect(
      (await columnsOf('field_event')).filter((column) => /driver|licence|^tag_/.test(column)),
    ).toEqual([]);
    // Recorded, never checked: a licence that has already expired is saved (ADR-153).
    await asThePhone();
    await add(
      'certification',
      certificationLike(world, { driver_name: 'Pat Lane', driver_licence_expiry: '2026-09-30' }),
    );
  });

  it('AC-03-19 a vehicle type is picked from the firm’s list, or typed where none fits, never both; a crew type is picked on a crew only', async () => {
    const { db, world } = tested;
    await asThePhone();
    const both = await db.refused(
      ...insertOf(
        'certification',
        certificationLike(world, {
          vehicle_type_id: world.vehicleTypes.selfLoader,
          vehicle_type_other: 'Grapple truck',
        }),
      ),
    );
    expect(both.code).toBe(refusedBy.check);
    expect(both.message).toContain('"certification_vehicle_type_check"');
    expect(
      await refusedRow('certification', certificationLike(world, { vehicle_type_other: ' ' })),
    ).toBe(refusedBy.check);
    // Picked, never typed: an id the list doesn't hold is refused.
    expect(
      await refusedRow('certification', certificationLike(world, { vehicle_type_id: world.p1 })),
    ).toBe(refusedBy.foreignKey);
    const onAContainer = await db.refused(
      ...insertOf(
        'certification',
        certificationLike(world, { crew_type_id: world.crewTypes.bucketTruck }),
      ),
    );
    expect(onAContainer.code).toBe(refusedBy.check);
    expect(onAContainer.message).toContain('"certification_kind_check"');
    // A crew truck uses the same form: its vehicle type typed, its crew type picked.
    await add(
      'certification',
      crewLike(world, { vehicle_type_other: 'Bucket', crew_type_id: world.crewTypes.bucketTruck }),
    );
    // Neither is required.
    await add('certification', crewLike(world, { cert_number: '730424' }));
  });

  it('AC-03-19 each measured box after the primary is labelled with a feature picked from the firm’s list, or a typed one, never both and never neither; the primary has none', async () => {
    const { db, world } = tested;
    await asThePhone();
    const id = await container();
    const feature = world.vehicleFeatures.sideboards;
    await add('certification_box', boxLike(id, 1, { feature_id: feature }));
    await add('certification_box', boxLike(id, 2, { feature_other: 'Tool box' }));
    for (const [why, row] of [
      ['no feature', boxLike(id, 3)],
      ['both', boxLike(id, 3, { feature_id: feature, feature_other: 'Tool box' })],
      ['a blank typed feature', boxLike(id, 3, { feature_other: '  ' })],
    ] as const) {
      const refusal = await db.refused(...insertOf('certification_box', row));
      expect(refusal.code, why).toBe(refusedBy.check);
      expect(refusal.message, why).toContain('"certification_box_feature_check"');
    }
    const other = await add('certification', certificationLike(world, { cert_number: '730422' }));
    expect(await refusedRow('certification_box', boxLike(other, 0, { feature_id: feature }))).toBe(
      refusedBy.check,
    );
    expect(await refusedRow('certification_box', boxLike(id, 3, { feature_id: world.p1 }))).toBe(
      refusedBy.foreignKey,
    );
  });
});

describe('a container’s measured boxes', () => {
  it('AC-03-22 every measurement is a whole number of inches, 1 or more: 59.5 isn’t taken, nor nought', async () => {
    const { db, world } = tested;
    await asThePhone();
    const id = await add('certification', certificationLike(world));
    expect(await refusedRow('certification_box', boxLike(id, 0, { height: '59.5' }))).toBe(
      refusedBy.badValue,
    );
    for (const height of [0, -12, null]) {
      const refusal = await db.refused(
        ...insertOf('certification_box', boxLike(id, 0, { height })),
      );
      expect(refusal.code, String(height)).toBe(refusedBy.check);
      expect(refusal.message).toContain('"certification_box_measurements_check"');
    }
    expect(
      await db.rows(
        `SELECT column_name AS column FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'certification_box' AND data_type = 'integer'
         ORDER BY ordinal_position`,
      ),
    ).toEqual(
      [
        'position',
        'length',
        'second_length',
        'width',
        'height',
        'diameter',
        'radius',
        'run',
        'corners',
      ].map((column) => ({ column })),
    );
  });

  it('AC-03-26 a radius corner is always subtracted: one marked "add" is refused', async () => {
    const { db, world } = tested;
    await asThePhone();
    const id = await container();
    const corner = {
      feature_id: world.vehicleFeatures.curvedSides,
      shape: 'RADIUS_CORNER',
      length: null,
      width: null,
      height: null,
      radius: 12,
      run: 60,
      corners: 2,
    };
    const added = await db.refused(...insertOf('certification_box', boxLike(id, 1, corner)));
    expect(added.code).toBe(refusedBy.check);
    expect(added.message).toContain('"certification_box_radius_corner_check"');
    await add('certification_box', boxLike(id, 1, { ...corner, sign: 'SUBTRACT' }));
  });

  it('AC-03-29 a primary box and seven more are all kept, in order, each with its feature, its shape, add or subtract, and its measurements', async () => {
    const { db, world } = tested;
    expect(await valuesOf('box_shape')).toEqual([...boxShapes]);
    expect(await valuesOf('box_sign')).toEqual([...boxSigns]);
    await asThePhone();
    const id = await container();
    const none = { length: null, width: null, height: null };
    const { sideboards, dogBox, curvedSides } = world.vehicleFeatures;
    const more: Record<string, unknown>[] = [
      { feature_id: sideboards, height: 12 },
      { feature_id: dogBox, shape: 'TRIANGLE', sign: 'SUBTRACT', length: 30, height: 40 },
      {
        feature_other: 'Hoist',
        shape: 'TWO_LENGTH_HOIST',
        sign: 'SUBTRACT',
        length: 30,
        second_length: 21,
        width: 20,
        height: 36,
      },
      { feature_id: curvedSides, shape: 'ROUND_BOTTOM', ...none, diameter: 90, length: 240 },
      {
        feature_id: curvedSides,
        shape: 'RADIUS_CORNER',
        sign: 'SUBTRACT',
        ...none,
        radius: 12,
        run: 60,
        corners: 2,
      },
      { feature_other: 'Tail gate extension', length: 21, width: 20, height: 10 },
      { feature_other: 'Wheel well, left', sign: 'SUBTRACT', length: 40, width: 12, height: 14 },
    ];
    for (const [index, box] of more.entries()) {
      await add('certification_box', boxLike(id, index + 1, box));
    }
    expect(
      await db.rows(
        `SELECT b."position", coalesce(f."name", b."feature_other") AS feature, b."shape"::text,
           b."sign"::text,
           concat_ws(' ', b."length", b."second_length", b."width", b."height", b."diameter",
             b."radius", b."run", b."corners") AS inches
         FROM "certification_box" b LEFT JOIN "vehicle_feature" f ON f."id" = b."feature_id"
         WHERE b."certification_id" = $1 ORDER BY b."position"`,
        [id],
      ),
    ).toEqual([
      { position: 0, feature: null, shape: 'RECTANGLE', sign: 'ADD', inches: '240 90 60' },
      { position: 1, feature: 'Sideboards', shape: 'RECTANGLE', sign: 'ADD', inches: '240 90 12' },
      { position: 2, feature: 'Dog Box', shape: 'TRIANGLE', sign: 'SUBTRACT', inches: '30 90 40' },
      {
        position: 3,
        feature: 'Hoist',
        shape: 'TWO_LENGTH_HOIST',
        sign: 'SUBTRACT',
        inches: '30 21 20 36',
      },
      {
        position: 4,
        feature: 'Curved/Angled Sides/Floor',
        shape: 'ROUND_BOTTOM',
        sign: 'ADD',
        inches: '240 90',
      },
      {
        position: 5,
        feature: 'Curved/Angled Sides/Floor',
        shape: 'RADIUS_CORNER',
        sign: 'SUBTRACT',
        inches: '12 60 2',
      },
      {
        position: 6,
        feature: 'Tail gate extension',
        shape: 'RECTANGLE',
        sign: 'ADD',
        inches: '21 20 10',
      },
      {
        position: 7,
        feature: 'Wheel well, left',
        shape: 'RECTANGLE',
        sign: 'SUBTRACT',
        inches: '40 12 14',
      },
    ]);
    // A place is one box's; the primary is the first, and it is a rectangle that adds.
    const twice = await db.refused(
      ...insertOf('certification_box', boxLike(id, 7, { feature_id: sideboards })),
    );
    expect(twice.code).toBe(refusedBy.unique);
    expect(await refusedRow('certification_box', boxLike(id, -1, { feature_id: sideboards }))).toBe(
      refusedBy.check,
    );
    const other = await add('certification', certificationLike(world, { cert_number: '730422' }));
    for (const primary of [{ shape: 'TRIANGLE' }, { sign: 'SUBTRACT' }]) {
      const refusal = await db.refused(
        ...insertOf('certification_box', boxLike(other, 0, primary)),
      );
      expect(refusal.code, JSON.stringify(primary)).toBe(refusedBy.check);
      expect(refusal.message).toContain('"certification_box_primary_check"');
    }
  });

  it.each([
    ['a rectangle with a diameter', { diameter: 90 }],
    ['a triangle with a second length', { shape: 'TRIANGLE', second_length: 21 }],
    ['a two-length hoist with one length', { shape: 'TWO_LENGTH_HOIST' }],
    ['a round bottom with a width', { shape: 'ROUND_BOTTOM', diameter: 90, height: null }],
    ['a round bottom with no diameter', { shape: 'ROUND_BOTTOM', width: null, height: null }],
    [
      'a radius corner with a length',
      {
        shape: 'RADIUS_CORNER',
        sign: 'SUBTRACT',
        width: null,
        height: null,
        radius: 12,
        run: 60,
        corners: 2,
      },
    ],
    [
      'a radius corner with no corners',
      {
        shape: 'RADIUS_CORNER',
        sign: 'SUBTRACT',
        length: null,
        width: null,
        height: null,
        radius: 12,
        run: 60,
      },
    ],
    [
      'a radius corner with nought corners',
      {
        shape: 'RADIUS_CORNER',
        sign: 'SUBTRACT',
        length: null,
        width: null,
        height: null,
        radius: 12,
        run: 60,
        corners: 0,
      },
    ],
  ])(
    'AC-03-29 each shape holds its own measurements and no other: %s is refused',
    async (_what, box) => {
      const { db, world } = tested;
      await asThePhone();
      const id = await container();
      const refusal = await db.refused(
        ...insertOf(
          'certification_box',
          boxLike(id, 1, { feature_id: world.vehicleFeatures.sideboards, ...box }),
        ),
      );
      expect(refusal.code).toBe(refusedBy.check);
      expect(refusal.message).toContain('"certification_box_measurements_check"');
    },
  );
});

describe('attestation', () => {
  it('AC-03-36 Sam Grant is the monitor who made and measured 730415, and Lee Morgan the helper he picked; none at all is allowed; the same helper twice is refused', async () => {
    const { db, world } = tested;
    const helpersOf = (id: string): Promise<{ helper: string }[]> =>
      db.rows(
        `SELECT u."name" AS helper FROM "certification_helper" h JOIN "user" u ON u."id" = h."user_id"
         WHERE h."certification_id" = $1 AND h."archived_at" IS NULL ORDER BY 1`,
        [id],
      );
    expect(await helpersOf(world.certifications.c730415)).toEqual([{ helper: 'Lee Morgan' }]);
    expect(await helpersOf(world.certifications.c730416)).toEqual([]);
    await asThePhone();
    const again = await db.refused(
      ...insertOf('certification_helper', {
        certification_id: world.certifications.c730415,
        user_id: world.helper,
      }),
    );
    expect(again.code).toBe(refusedBy.unique);
    // Picked, never typed: a helper is a person the system knows.
    expect(
      await refusedRow('certification_helper', {
        certification_id: world.certifications.c730415,
        user_id: world.p1,
      }),
    ).toBe(refusedBy.foreignKey);
    expect(await columnsOf('certification_helper')).toEqual([
      'id',
      'certification_id',
      'user_id',
      'created_at',
      'archived_at',
    ]);
    // Several are allowed; one picked by mistake is taken off by archiving.
    await add('certification_helper', {
      certification_id: world.certifications.c730415,
      user_id: world.monitor,
    });
    await db.run(
      `UPDATE "certification_helper" SET "archived_at" = now()
       WHERE "certification_id" = $1 AND "user_id" = $2`,
      [world.certifications.c730415, world.monitor],
    );
    expect(await helpersOf(world.certifications.c730415)).toEqual([{ helper: 'Lee Morgan' }]);
  });

  it('AC-03-38 signatures on file is stated when a certification is made, and marked at QC, audited', async () => {
    const { db, world } = tested;
    const id = world.certifications.c730415;
    expect(
      await db.one(`SELECT "signatures_on_file" FROM "certification" WHERE "id" = $1`, [id]),
    ).toEqual({ signatures_on_file: false });
    await asTheBackOffice();
    await db.run(`UPDATE "certification" SET "signatures_on_file" = true WHERE "id" = $1`, [id]);
    expect((await auditOf(id)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['signatures_on_file'],
      prior: { signatures_on_file: false },
      actor: world.admin,
      source: 'BACK_OFFICE',
    });
  });
});

describe('later changes', () => {
  it('AC-03-53 a truck certified again after sideboards were added is a new certification, 730420, with a "replaces" link to 730416 and the reason; 730416 is kept unchanged, and each shows the other', async () => {
    const { db, world } = tested;
    const old = world.certifications.c730416;
    const before = await db.one(`SELECT * FROM "certification" WHERE "id" = $1`, [old]);
    await asThePhone();
    const replacement = await container({
      cert_number: '730420',
      capacity_cy: 55,
      first_tier_sub_id: world.rivera,
      replaces_id: old,
      replaced_reason: 'sideboards added',
      certified_at: '2026-10-14T12:20:00Z',
      received_at: '2026-10-14T12:21:00Z',
    });
    expect(await db.one(`SELECT * FROM "certification" WHERE "id" = $1`, [old])).toEqual(before);
    expect(await auditOf(old)).toHaveLength(1);
    expect(
      await db.one(
        `SELECT new."cert_number" || ' replaces ' || old."cert_number" || ' (' ||
             new."replaced_reason" || ', ' || to_char(new."certified_at" AT TIME ZONE p."time_zone", 'FMDD Mon') || ')' AS new_says,
           old."cert_number" || ' replaced by ' || new."cert_number" || ' on ' ||
             to_char(new."certified_at" AT TIME ZONE p."time_zone", 'FMDD Mon') AS old_says
         FROM "certification" new JOIN "certification" old ON old."id" = new."replaces_id"
           JOIN "project" p ON p."id" = new."project_id" WHERE new."id" = $1`,
        [replacement],
      ),
    ).toEqual({
      new_says: '730420 replaces 730416 (sideboards added, 14 Oct)',
      old_says: '730416 replaced by 730420 on 14 Oct',
    });
    // A certification is replaced once, by a certification of its own project, with a reason.
    const twice = await db.refused(
      ...insertOf(
        'certification',
        certificationLike(world, { replaces_id: old, replaced_reason: 'tailgate extended' }),
      ),
    );
    expect(twice.code).toBe(refusedBy.unique);
    expect(twice.message).toContain('"certification_project_id_replaces_id_key"');
    const elsewhere = await db.refused(
      ...insertOf(
        'certification',
        certificationLike(world, {
          replaces_id: world.certifications.p2c730416,
          replaced_reason: 'sideboards added',
        }),
      ),
    );
    expect(elsewhere.code).toBe(refusedBy.foreignKey);
    expect(elsewhere.message).toContain('"certification_project_id_replaces_id_fkey"');
    for (const [why, row] of [
      ['a link with no reason', { replaces_id: world.certifications.c730415 }],
      ['a blank reason', { replaces_id: world.certifications.c730415, replaced_reason: ' ' }],
      ['a reason with no link', { replaced_reason: 'sideboards added' }],
    ] as const) {
      const refusal = await db.refused(...insertOf('certification', certificationLike(world, row)));
      expect(refusal.code, why).toBe(refusedBy.check);
      expect(refusal.message, why).toContain('"certification_replaces_check"');
    }
    expect(
      (
        await db.refused(
          `UPDATE "certification" SET "replaces_id" = "id", "replaced_reason" = 'itself' WHERE "id" = $1`,
          [world.certifications.c730415],
        )
      ).code,
    ).toBe(refusedBy.check);
  });

  it('AC-03-55 Dana revokes 730416 from 14 October 2026 with a reason: the certification keeps the date, the reason and who revoked it, and nothing else on it changes; a date without a reason is refused', async () => {
    const { db, world } = tested;
    const id = world.certifications.c730416;
    await asTheBackOffice();
    for (const [why, set] of [
      ['a date alone', `"revoked_from" = '2026-10-14'`],
      ['no reason', `"revoked_from" = '2026-10-14', "revoked_by_id" = '${world.admin}'`],
      [
        'a blank reason',
        `"revoked_from" = '2026-10-14', "revoked_reason" = '', "revoked_by_id" = '${world.admin}'`,
      ],
      ['nobody', `"revoked_from" = '2026-10-14', "revoked_reason" = 'Sold'`],
      ['no date', `"revoked_reason" = 'Sold', "revoked_by_id" = '${world.admin}'`],
    ] as const) {
      const refusal = await db.refused(`UPDATE "certification" SET ${set} WHERE "id" = $1`, [id]);
      expect(refusal.code, why).toBe(refusedBy.check);
      expect(refusal.message, why).toContain('"certification_revoked_check"');
    }
    await db.run(
      `UPDATE "certification" SET "revoked_from" = '2026-10-14',
         "revoked_reason" = 'Truck sold; no longer on the project', "revoked_by_id" = $2
       WHERE "id" = $1`,
      [id, world.admin],
    );
    expect(
      await db.one(
        `SELECT c."revoked_from"::text AS revoked_from, c."revoked_reason" AS reason, u."name" AS by,
           c."capacity_cy" AS capacity
         FROM "certification" c JOIN "user" u ON u."id" = c."revoked_by_id" WHERE c."id" = $1`,
        [id],
      ),
    ).toEqual({
      revoked_from: '2026-10-14',
      reason: 'Truck sold; no longer on the project',
      by: 'Dana Reyes',
      capacity: 48,
    });
    expect((await auditOf(id)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['revoked_by_id', 'revoked_from', 'revoked_reason'],
      prior: { revoked_from: null, revoked_reason: null, revoked_by_id: null },
      actor: world.admin,
      source: 'BACK_OFFICE',
      domain: 'BILLING',
    });
  });

  it('AC-03-56 a certification is never copied: Rivera’s self-loader is certified on P2 from scratch, and nothing on a certification names another project’s', async () => {
    const { db } = tested;
    expect(
      await db.rows(
        `SELECT c."cert_number" AS number, p."name" AS project, c."replaces_id" AS replaces
         FROM "certification" c JOIN "project" p ON p."id" = c."project_id"
         WHERE c."cert_number" = '730416' ORDER BY 2`,
      ),
    ).toEqual([
      { number: '730416', project: 'Bayline County PPDR, Hurricane Delphine', replaces: null },
      { number: '730416', project: 'Bayline County ROW, Hurricane Delphine', replaces: null },
    ]);
    // The one link from a certification to another is "replaces", held to its own project.
    expect(
      await db.rows(
        `SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
         WHERE conrelid = 'certification'::regclass AND confrelid = 'certification'::regclass`,
      ),
    ).toEqual([
      {
        name: 'certification_project_id_replaces_id_fkey',
        definition:
          'FOREIGN KEY (project_id, replaces_id) REFERENCES certification(project_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT',
      },
    ]);
  });

  it.each(tables)('AC-03-58 a %s row is never deleted, by any login', async (table) => {
    const { db, world } = tested;
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      expect((await db.refused(`DELETE FROM "${table}"`)).code, login).toBe(refusedBy.grant);
    }
    const never = `Open ADMS never deletes a ${table} row: archive, close or void it instead`;
    for (const who of ['adms_owner', 'administrator'] as const) {
      if (who === 'administrator') await db.administer();
      else await db.as(who);
      expect(await db.refused(`DELETE FROM "${table}"`), who).toEqual({
        code: refusedBy.trigger,
        message: never,
      });
      expect(await db.refused(`TRUNCATE "${table}" CASCADE`), who).toEqual({
        code: refusedBy.trigger,
        message: never,
      });
    }
  });

  it('AC-03-58 a certification has no archive: replaced or revoked, it stays as it was made', async () => {
    expect(await columnsOf('certification')).not.toContain('archived_at');
  });
});

describe('who writes it, and who sees it', () => {
  it('AC-03-59 a certification, its boxes and its helpers are each audited by the database with a real actor: Sam Grant, from his phone', async () => {
    const { db, world } = tested;
    await asThePhone();
    const id = await add('certification', certificationLike(world));
    const box = await add('certification_box', boxLike(id, 0));
    const helper = await add('certification_helper', {
      certification_id: id,
      user_id: world.helper,
    });
    const sam = {
      operation: 'INSERT',
      actor: world.certifier,
      source: 'DEVICE',
      device: world.certifyingDevice,
    };
    expect(await auditOf(id)).toMatchObject([{ ...sam, domain: 'BILLING' }]);
    expect(await auditOf(box)).toMatchObject([{ ...sam, domain: 'BILLING' }]);
    expect(await auditOf(helper)).toMatchObject([{ ...sam, domain: 'OPERATIONS' }]);
    // A measuring mistake is corrected in place, the prior value kept.
    await asTheBackOffice();
    await db.run(`UPDATE "certification_box" SET "height" = 58 WHERE "id" = $1`, [box]);
    expect((await auditOf(box)).at(-1)).toMatchObject({
      operation: 'UPDATE',
      changed: ['height'],
      prior: { height: 60 },
      actor: world.admin,
      source: 'BACK_OFFICE',
    });
    // No write without an actor.
    await db.noActor();
    expect(
      (
        await db.refused(
          ...insertOf('certification', certificationLike(world, { cert_number: '730430' })),
        )
      ).code,
    ).toBe(refusedBy.grant);
  });

  it.each(tables)('AC-03-59 the worker reads %s and writes none', async (table) => {
    const { db, world } = tested;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await db.rows(`SELECT 1 FROM "${table}"`)).length).toBeGreaterThan(0);
    expect((await db.refused(`UPDATE "${table}" SET "id" = "id"`)).code).toBe(refusedBy.grant);
    expect((await db.refused(`INSERT INTO "${table}" DEFAULT VALUES`)).code).toBe(refusedBy.grant);
  });

  it('AC-03-60 Bayline County’s client user sees P1’s certifications, boxes and helpers, without the driver’s licence number or phone, and none of P2’s; an auditor given both sees both', async () => {
    const { db, world } = tested;
    expect(await reads(world.clientViewer, 'viewer_certification', 'cert_number')).toEqual([
      '730415',
      '730416',
      '730417',
      '730418',
      '730419',
    ]);
    expect(await reads(world.clientViewer, 'viewer_certification', 'driver_name')).toContain(
      'Marco Rivera',
    );
    expect(await reads(world.clientViewer, 'viewer_certification_box', 'position')).toHaveLength(6);
    expect(await reads(world.clientViewer, 'viewer_certification_helper', 'user_id')).toEqual([
      world.helper,
    ]);
    expect(await reads(world.auditor, 'viewer_certification', 'cert_number')).toHaveLength(6);
    expect(await reads(world.auditor, 'viewer_certification_box', 'position')).toHaveLength(8);
    const shown = await columnsOf('viewer_certification');
    expect(shown).toEqual(
      (await columnsOf('certification')).filter(
        (column) => !['driver_phone', 'driver_licence_number'].includes(column),
      ),
    );
    await db.viewer(world.clientViewer);
    await db.as('adms_readonly');
    for (const hidden of ['driver_phone', 'driver_licence_number']) {
      expect((await db.refused(`SELECT "${hidden}" FROM "certification"`)).code, hidden).toBe(
        refusedBy.grant,
      );
    }
    expect((await db.refused(`SELECT * FROM "certification"`)).code).toBe(refusedBy.grant);
  });

  it('AC-03-60 a contractor user sees the certifications that name its contractor, with their boxes and helpers and without the driver’s licence number or phone; a request that states no viewer sees none', async () => {
    const { db, world } = tested;
    // Coastline is the prime on all five of P1's, Rivera's `730416` under it included; P2's it
    // isn't given (ADR-361; AC-02-78).
    expect(await reads(world.coastlineViewer, 'viewer_certification', 'cert_number')).toEqual([
      '730415',
      '730416',
      '730417',
      '730418',
      '730419',
    ]);
    expect(await reads(world.coastlineViewer, 'viewer_certification_box', 'id')).toHaveLength(6);
    expect(await reads(world.coastlineViewer, 'viewer_certification_helper', 'user_id')).toEqual([
      world.helper,
    ]);
    await db.viewer(world.coastlineViewer);
    await db.as('adms_readonly');
    for (const hidden of ['driver_phone', 'driver_licence_number']) {
      expect((await db.refused(`SELECT "${hidden}" FROM "certification"`)).code, hidden).toBe(
        refusedBy.grant,
      );
    }
    await db.administer();
    await db.noViewer();
    await db.as('adms_readonly');
    expect(await db.rows(`SELECT 1 FROM "viewer_certification"`)).toEqual([]);
  });
});
