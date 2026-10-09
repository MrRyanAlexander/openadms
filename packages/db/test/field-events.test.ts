// What every kind of field event records (spec/acceptance/04-field-capture.md, sections A–C and I,
// by scenario ID; spec/DATA-MODEL.md §4.1 (1), §8; ADR-236, 324; REQ-105i, 115): where it came
// from, its number as typed or scanned, the certification as scanned and as found, the site, both
// GPS ends, the address; who may write and correct it; what a viewer sees of it. Nothing here
// refuses work over eligibility (ADR-052): each refusal is of a record that isn't one.
import { describe, expect, it } from 'vitest';

import { systemActorId } from '../src/system-actor.ts';
import { refusedBy } from './support/database.ts';
import {
  backOfficeEventLike,
  eventInsertOf,
  fieldEventLike,
  insertOf,
  siteLike,
  without,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

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

// A field event as Ana's phone sends it, changed as the test says; its id.
async function received(more: Record<string, unknown> = {}): Promise<string> {
  const { db, world } = tested;
  return (await db.one<{ id: string }>(...eventInsertOf(fieldEventLike(world, more)))).id;
}

// How the database refuses that field event.
async function refusedEvent(more: Record<string, unknown>): Promise<string> {
  const { db, world } = tested;
  return (await db.refused(...eventInsertOf(fieldEventLike(world, more)))).code;
}

async function kept(id: string, columns: string): Promise<Record<string, unknown>> {
  return tested.db.one(`SELECT ${columns} FROM "field_event" WHERE "id" = $1`, [id]);
}

async function valuesOf(type: string): Promise<string[]> {
  return (
    await tested.db.rows<{ value: string }>(
      `SELECT enumlabel AS value FROM pg_enum WHERE enumtypid = $1::regtype ORDER BY enumsortorder`,
      [type],
    )
  ).map((row) => row.value);
}

// A disposal at Marsh Road TDSR, as the tower's phone sends one.
const atTheTower = (ticketNumber: string, more: Record<string, unknown> = {}) => ({
  kind: 'DISPOSAL',
  ticket_number: ticketNumber,
  site_id: tested.world.site,
  load_call: 80,
  ...more,
});

describe('a ticket number', () => {
  it('AC-04-02 is unique on its project within its workflow: a haul-out 101001 on P1 and a load 101001 on P2 are other tickets', async () => {
    const { db, world } = tested;
    await asThePhone();
    await received({ workflow: 'HAUL_OUT', kind: 'HAUL_OUT_COLLECTION', ticket_number: '101001' });
    await received({
      project_id: world.p2,
      assignment_id: world.assignments.p2,
      ticket_number: '101001',
      cert_number: '730416',
      certification_id: world.certifications.p2c730416,
    });
    expect(
      await db.rows(
        `SELECT "project_id"::text AS project, "workflow"::text, count(*)::int AS events
         FROM "field_event" WHERE "ticket_number" = '101001' GROUP BY 1, 2 ORDER BY 2, 3`,
      ),
    ).toEqual([
      { project: world.p1, workflow: 'HAUL_OUT', events: 1 },
      { project: world.p2, workflow: 'LOAD', events: 1 },
      { project: world.p1, workflow: 'LOAD', events: 2 },
    ]);
  });

  it('AC-04-03 is kept as the bare number and nothing else: the label is the kind’s, never in the number', async () => {
    const { db, world } = tested;
    expect(
      await db.rows(
        `SELECT "kind"::text, "ticket_number", "split_suffix" FROM "field_event"
         WHERE "id" = ANY($1) ORDER BY "kind"`,
        [[world.loads.l101001.collection, world.loads.l101001.disposal]],
      ),
    ).toEqual([
      { kind: 'COLLECTION', ticket_number: '101001', split_suffix: '' },
      { kind: 'DISPOSAL', ticket_number: '101001', split_suffix: '' },
    ]);
    // Text, as scanned: never a number the database could do arithmetic on, and no column beside
    // it that holds a label or a type.
    expect(
      await db.rows(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'field_event'
           AND (column_name LIKE '%number%' OR column_name LIKE '%label%' OR column_name LIKE '%type%')
         ORDER BY column_name`,
      ),
    ).toEqual([
      { column_name: 'cert_number', data_type: 'text' },
      // A debris type's entry, its form's document type and a payable type are picks; an ROE's
      // and a survey's number are records of their own, kept as picked or typed (ADR-325).
      { column_name: 'form_debris_type_id', data_type: 'uuid' },
      { column_name: 'form_document_type', data_type: 'USER-DEFINED' },
      { column_name: 'number_typed', data_type: 'boolean' },
      { column_name: 'number_typed_reason_id', data_type: 'uuid' },
      { column_name: 'payable_type_id', data_type: 'uuid' },
      { column_name: 'roe_number', data_type: 'text' },
      { column_name: 'survey_number', data_type: 'text' },
      { column_name: 'ticket_number', data_type: 'text' },
      { column_name: 'typed_capacity_cy', data_type: 'integer' },
    ]);
  });

  it('AC-04-12 typed at the tower with the reason "Barcode damaged" is received, saying it was typed and why', async () => {
    const { db, world } = tested;
    await asThePhone();
    const typed = await received(
      atTheTower('101060', {
        number_typed: true,
        number_typed_reason_id: world.reasons.barcodeDamaged,
      }),
    );
    expect(
      await db.one(
        `SELECT e."ticket_number", e."number_typed", r."name" AS reason, e."status"::text
         FROM "field_event" e JOIN "reason" r ON r."id" = e."number_typed_reason_id"
         WHERE e."id" = $1`,
        [typed],
      ),
    ).toEqual({
      ticket_number: '101060',
      number_typed: true,
      reason: 'Barcode damaged',
      status: 'PENDING',
    });
    // A reason belongs only on a typed number, and is one of the firm's reasons.
    expect(
      await refusedEvent(
        atTheTower('101061', { number_typed_reason_id: world.reasons.barcodeDamaged }),
      ),
    ).toBe(refusedBy.check);
    expect(
      await refusedEvent(
        atTheTower('101061', {
          number_typed: true,
          number_typed_reason_id: '019a0000-0000-7000-8000-00000000dead',
        }),
      ),
    ).toBe(refusedBy.foreignKey);
    // A typed number that reached the server with no reason is still taken (ADR-324).
    await received(atTheTower('101061', { number_typed: true }));
    // Whether it was typed is always said: there is no default.
    expect(
      (await db.refused(...eventInsertOf(without(fieldEventLike(world), 'number_typed')))).code,
    ).toBe(refusedBy.notNull);
  });
});

describe('a field event', () => {
  it('AC-04-15 is the only record of a ticket, one of five kinds, each in its workflow: a disposal in the haul-out workflow is refused', async () => {
    const { db } = tested;
    expect(
      await db.rows(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name LIKE '%ticket%' ORDER BY table_name`,
      ),
      // The tables with the word are the list of numbers a load's collection carries, a number
      // as written (ADR-325), and a person's void of a number (ADR-363) and an unvoid of one (ADR-366), each with its viewer
      // view: never a ticket's record.
    ).toEqual([
      { table_name: 'carried_ticket' },
      { table_name: 'ticket_unvoid' },
      { table_name: 'ticket_void' },
      { table_name: 'viewer_carried_ticket' },
      { table_name: 'viewer_ticket_unvoid' },
      { table_name: 'viewer_ticket_void' },
    ]);
    expect(await valuesOf('field_event_kind')).toEqual([
      'COLLECTION',
      'DISPOSAL',
      'HAUL_OUT_COLLECTION',
      'HAUL_OUT_DISPOSAL',
      'UNIT_RATE',
    ]);
    await asThePhone();
    expect(await refusedEvent({ workflow: 'HAUL_OUT', kind: 'DISPOSAL' })).toBe(refusedBy.check);
    await received({ workflow: 'HAUL_OUT', kind: 'HAUL_OUT_DISPOSAL', ticket_number: '201001' });
  });

  it('AC-04-16 is one of each kind on a ticket: a second disposal on load 101001 on P1 is refused', async () => {
    await asThePhone();
    expect(await refusedEvent(atTheTower('101001', { load_call: 60 }))).toBe(refusedBy.unique);
    // Another kind on that number, and that kind on another number, are taken.
    await received(atTheTower('101003'));
  });

  it('AC-04-18 made on a phone says so and carries its monitor, the phone, the assignment and the setup version; one that lacks any is refused', async () => {
    const { world } = tested;
    await asThePhone();
    const event = await received({ setup_version: 4 });
    expect(
      await kept(
        event,
        `"source"::text, "monitor_id"::text AS monitor, "device_id"::text AS device,
         "assignment_id"::text AS assignment, "setup_version", "created_by_id", "created_reason_id"`,
      ),
    ).toEqual({
      source: 'DEVICE',
      monitor: world.monitor,
      device: world.device,
      assignment: world.assignments.p1,
      setup_version: 4,
      created_by_id: null,
      created_reason_id: null,
    });
    for (const missing of ['device_id', 'assignment_id', 'setup_version']) {
      expect(await refusedEvent({ ticket_number: '101021', [missing]: null }), missing).toBe(
        refusedBy.check,
      );
    }
    // A phone's record names no back-office person or reason.
    expect(
      await refusedEvent({
        ticket_number: '101021',
        created_by_id: world.admin,
        created_reason_id: world.reasons.deviceFailed,
      }),
    ).toBe(refusedBy.check);
    // Where it came from is always said: there is no default.
    expect(
      (
        await tested.db.refused(
          ...eventInsertOf(without(fieldEventLike(world, { ticket_number: '101021' }), 'source')),
        )
      ).code,
    ).toBe(refusedBy.notNull);
  });

  it('AC-04-19 created in the back office says who created it and why, names the monitor who witnessed it, and has no phone, assignment or setup version', async () => {
    const { db, world } = tested;
    await asTheBackOffice();
    const created = (
      await db.one<{ id: string }>(
        ...eventInsertOf(backOfficeEventLike(world, atTheTower('101029'))),
      )
    ).id;
    expect(
      await db.one(
        `SELECT e."source"::text, e."monitor_id"::text AS monitor, e."created_by_id"::text AS created_by,
           r."name" AS reason, e."device_id", e."assignment_id", e."setup_version"
         FROM "field_event" e JOIN "reason" r ON r."id" = e."created_reason_id" WHERE e."id" = $1`,
        [created],
      ),
    ).toEqual({
      source: 'BACK_OFFICE',
      monitor: world.monitor,
      created_by: world.admin,
      reason: 'Device failed',
      device_id: null,
      assignment_id: null,
      setup_version: null,
    });
    // The audit record's actor is the person who created it.
    expect(
      await db.one(
        `SELECT "actor_id"::text AS actor, "source"::text FROM "audit_record"
         WHERE "table_name" = 'field_event' AND "record_id" = $1`,
        [created],
      ),
    ).toEqual({ actor: world.admin, source: 'BACK_OFFICE' });
    const refusedCreation = async (more: Record<string, unknown>): Promise<string> =>
      (
        await db.refused(
          ...eventInsertOf(backOfficeEventLike(world, { ...atTheTower('101030'), ...more })),
        )
      ).code;
    for (const [what, more] of [
      ['no person', { created_by_id: null }],
      ['no reason', { created_reason_id: null }],
      ['a phone', { device_id: world.device }],
      ['an assignment', { assignment_id: world.assignments.p1 }],
      ['a setup version', { setup_version: 1 }],
      ['a temporary session', { temporary_session: true }],
      ['the system actor as its creator', { created_by_id: systemActorId }],
    ] as const) {
      expect(await refusedCreation(more), what).toBe(refusedBy.check);
    }
    expect(
      await refusedCreation({ created_reason_id: '019a0000-0000-7000-8000-00000000dead' }),
    ).toBe(refusedBy.foreignKey);
  });

  it('AC-04-20 is witnessed by a person: the system actor never records one', async () => {
    await asThePhone();
    expect(await refusedEvent({ monitor_id: systemActorId })).toBe(refusedBy.check);
  });

  it('AC-04-21 keeps when it started and ended by the phone’s clock, the phone’s offset and when the server received it; odd times are taken', async () => {
    await asThePhone();
    const collection = await received({
      started_at: '2026-10-12T08:20:00-04:00',
      ended_at: '2026-10-12T08:40:00-04:00',
      device_utc_offset_minutes: -240,
      received_at: '2026-10-12T22:15:00Z',
    });
    expect(
      await kept(
        collection,
        `to_char("started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS started,
         to_char("ended_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS ended,
         "device_utc_offset_minutes" AS "offset",
         to_char("received_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS received`,
      ),
    ).toEqual({
      started: '2026-10-12 12:20',
      ended: '2026-10-12 12:40',
      offset: -240,
      received: '2026-10-12 22:15',
    });
    // Ending before it started, and a clock set to 2031: taken, for a flag later (ADR-100).
    await received({
      ticket_number: '101021',
      started_at: '2026-10-12T09:00:00-04:00',
      ended_at: '2026-10-12T08:00:00-04:00',
    });
    await received({
      ticket_number: '101022',
      started_at: '2031-01-01T09:00:00-04:00',
      ended_at: '2031-01-01T09:20:00-04:00',
    });
  });

  it('AC-04-22 keeps the GPS where it started and where it ended as exact decimals; none at all is taken, and no accuracy is recorded', async () => {
    const { db } = tested;
    await asThePhone();
    const collection = await received({
      start_latitude: '39.13848234',
      start_longitude: '-75.55371209',
      end_latitude: '39.1385',
      end_longitude: '-75.5537',
    });
    expect(
      await kept(
        collection,
        `"start_latitude"::text, "start_longitude"::text, "end_latitude"::text, "end_longitude"::text`,
      ),
    ).toEqual({
      start_latitude: '39.13848234',
      start_longitude: '-75.55371209',
      end_latitude: '39.13850000',
      end_longitude: '-75.55370000',
    });
    const noFix = await received({ ticket_number: '101021' });
    expect(
      await kept(noFix, `"start_latitude", "start_longitude", "end_latitude", "end_longitude"`),
    ).toEqual({
      start_latitude: null,
      start_longitude: null,
      end_latitude: null,
      end_longitude: null,
    });
    expect(
      await db.rows(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'field_event' AND column_name LIKE '%accura%'`,
      ),
    ).toEqual([]);
    // Half a fix, or one off the earth, is no fix: refused as a record that isn't one.
    for (const [what, more] of [
      ['a start latitude alone', { start_latitude: '39.1385' }],
      ['an end longitude alone', { end_longitude: '-75.5537' }],
      ['a start latitude of 91', { start_latitude: '91', start_longitude: '-75.5537' }],
      ['an end longitude of -181', { end_latitude: '39.1385', end_longitude: '-181' }],
    ] as const) {
      expect(await refusedEvent({ ticket_number: '101022', ...more }), what).toBe(refusedBy.check);
    }
  });

  it('AC-04-23 at a tower names its assignment’s site; a curb collection names none; a site of another project is refused', async () => {
    const { world } = tested;
    await asThePhone();
    const disposal = await received(atTheTower('101003'));
    expect(await kept(disposal, `"site_id"::text AS site`)).toEqual({ site: world.site });
    const collection = await received({ ticket_number: '101003' });
    expect(await kept(collection, `"site_id"`)).toEqual({ site_id: null });
    // Marsh Road TDSR is P1's: a field event on P2 can't name it.
    expect(
      await refusedEvent({
        ...atTheTower('102003'),
        project_id: world.p2,
        assignment_id: world.assignments.p2,
        cert_number: '730416',
        certification_id: world.certifications.p2c730416,
      }),
    ).toBe(refusedBy.foreignKey);
  });

  it('AC-04-24 keeps the address and whether it was looked up or typed', async () => {
    await asThePhone();
    const typed = await received({ address: '14 Heron St', address_source: 'TYPED' });
    expect(await kept(typed, `"address", "address_source"::text`)).toEqual({
      address: '14 Heron St',
      address_source: 'TYPED',
    });
    await received({
      ticket_number: '101021',
      address: '14 Heron St, Bayline County',
      address_source: 'LOOKED_UP',
    });
    await received({ ticket_number: '101022' });
    expect(await valuesOf('address_source')).toEqual(['LOOKED_UP', 'TYPED']);
    expect(await refusedEvent({ ticket_number: '101023', address: '14 Heron St' })).toBe(
      refusedBy.check,
    );
    expect(await refusedEvent({ ticket_number: '101023', address_source: 'TYPED' })).toBe(
      refusedBy.check,
    );
  });

  it('AC-04-25 holds no contractor, driver, zone, destination, rate or capacity of its own: exactly these columns', async () => {
    const columns = await tested.db.rows<{ name: string }>(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'field_event' ORDER BY column_name`,
    );
    // Whose work it is comes from the certification; where the debris went is the disposal's own
    // site. `typed_capacity_cy` is a monitor's claim on a truck keyed in by hand (AC-04-26), never
    // a capacity of the field event's. A unit rate event's pay item is what its phone worked out
    // and printed, never a rate (ADR-213, 325); a split property's estimate is the monitor's, and
    // no share is kept (AC-04-48). A weight is the scale receipt's, which a disposal only points
    // at (AC-04-73, ADR-326), and an ROE's owner and scope are the ROE's, which a collection only
    // points at (AC-04-82, ADR-327). The zone, the map version used and a unit rate event's
    // worked-out pay item are the worker's, attached after sync: no monitor records one (ADR-340).
    expect(columns.map((column) => column.name)).toEqual([
      'address',
      'address_source',
      'assignment_id',
      'carried_count',
      'cert_keyed_by_hand',
      'cert_number',
      'certification_id',
      'created_by_id',
      'created_reason_id',
      'device_id',
      'device_utc_offset_minutes',
      'end_latitude',
      'end_longitude',
      'ended_at',
      'estimate_cy',
      'field_tag_id',
      'form_debris_type_id',
      'form_document_type',
      'form_id',
      'id',
      'kind',
      'kind_of_work_id',
      'load_call',
      'map_version_id',
      'marked_ineligible',
      'measured_as',
      'measurement_inches',
      'monitor_id',
      'notes',
      'number_typed',
      'number_typed_reason_id',
      'pay_item_id',
      'payable_type_id',
      'project_id',
      'received_at',
      'reconciled_at',
      'roe_id',
      'roe_number',
      'root_ball_half_exposed',
      'root_ball_inches',
      'scale_receipt_id',
      'setup_version',
      'site_id',
      'source',
      'split_suffix',
      'start_latitude',
      'start_longitude',
      'started_at',
      'status',
      'survey_number',
      'temporary_session',
      'ticket_number',
      'typed_capacity_cy',
      'unit_count',
      // A fix the phone sent that couldn't be one, as sent (ADR-338): never a second fix.
      'unreadable_gps',
      'worked_out_pay_item_id',
      'workflow',
      'zone_id',
    ]);
  });

  it('AC-04-26 on a truck keyed in by hand says so and keeps the capacity typed as the monitor’s claim; no other field event holds one', async () => {
    await asThePhone();
    const keyed = await received({ cert_keyed_by_hand: true, typed_capacity_cy: 60 });
    expect(await kept(keyed, `"cert_number", "cert_keyed_by_hand", "typed_capacity_cy"`)).toEqual({
      cert_number: '730415',
      cert_keyed_by_hand: true,
      typed_capacity_cy: 60,
    });
    expect(await refusedEvent({ ticket_number: '101021', typed_capacity_cy: 60 })).toBe(
      refusedBy.check,
    );
    expect(
      await refusedEvent({
        ticket_number: '101021',
        cert_keyed_by_hand: true,
        typed_capacity_cy: -1,
      }),
    ).toBe(refusedBy.check);
    // A crew keyed in by hand has no capacity to type (ADR-324).
    const { world } = tested;
    await received({
      workflow: 'UNIT_RATE',
      kind: 'UNIT_RATE',
      ticket_number: '301001',
      cert_number: '730417',
      certification_id: world.certifications.c730417,
      cert_keyed_by_hand: true,
    });
  });

  it('AC-04-27 AC-03-40 keeps the cert number as scanned and the certification it found; 730499, which P1 doesn’t have, is received with none', async () => {
    const { world } = tested;
    await asThePhone();
    const found = await received();
    expect(await kept(found, `"cert_number", "certification_id"::text AS certification`)).toEqual({
      cert_number: '730415',
      certification: world.certifications.c730415,
    });
    // A certification corrected later leaves the field event's own copy as it was scanned.
    await asTheBackOffice();
    await tested.db.run(`UPDATE "certification" SET "cert_number" = '730451' WHERE "id" = $1`, [
      world.certifications.c730415,
    ]);
    expect(await kept(found, `"cert_number"`)).toEqual({ cert_number: '730415' });
    await asThePhone();
    const notFound = await received({
      ticket_number: '101021',
      cert_number: '730499',
      certification_id: null,
    });
    expect(await kept(notFound, `"cert_number", "certification_id", "status"::text`)).toEqual({
      cert_number: '730499',
      certification_id: null,
      status: 'PENDING',
    });
    // The certification found is one of the field event's own project: P2's 730416 isn't P1's.
    expect(
      await refusedEvent({
        ticket_number: '101022',
        cert_number: '730416',
        certification_id: world.certifications.p2c730416,
      }),
    ).toBe(refusedBy.foreignKey);
    // The badge is scanned first, always: a field event has a cert number.
    expect(await refusedEvent({ ticket_number: '101022', cert_number: null })).toBe(
      refusedBy.notNull,
    );
  });

  it('AC-04-28 made in a temporary session under the master passcode is marked so', async () => {
    await asThePhone();
    const event = await received({ temporary_session: true });
    expect(await kept(event, `"temporary_session"`)).toEqual({ temporary_session: true });
    expect(await kept(tested.world.loads.l101001.collection, `"temporary_session"`)).toEqual({
      temporary_session: false,
    });
  });

  it('AC-04-29 starts PENDING; its status and reconciled time are the worker’s alone, and the worker changes nothing a monitor captured', async () => {
    const { db, world } = tested;
    await asThePhone();
    const event = await received(atTheTower('101003'));
    expect(await kept(event, `"status"::text, "reconciled_at"`)).toEqual({
      status: 'PENDING',
      reconciled_at: null,
    });
    await asTheBackOffice();
    for (const column of [`"status" = 'COMPLETED'`, `"reconciled_at" = now()`]) {
      expect(
        (await db.refused(`UPDATE "field_event" SET ${column} WHERE "id" = $1`, [event])).code,
        column,
      ).toBe(refusedBy.grant);
    }
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      await db.run(
        `UPDATE "field_event" SET "status" = 'MANUAL_REVIEW', "reconciled_at" = now() WHERE "id" = $1`,
        [event],
      ),
    ).toBe(1);
    for (const column of [
      `"cert_number" = '730416'`,
      `"certification_id" = NULL`,
      `"site_id" = NULL`,
      `"number_typed" = true`,
      `"cert_keyed_by_hand" = true`,
      `"typed_capacity_cy" = 60`,
      `"source" = 'BACK_OFFICE'`,
      `"temporary_session" = true`,
      `"start_latitude" = 39.0`,
      `"address" = '14 Heron St'`,
      `"notes" = 'changed'`,
      `"load_call" = 100`,
    ]) {
      expect(
        (await db.refused(`UPDATE "field_event" SET ${column} WHERE "id" = $1`, [event])).code,
        column,
      ).toBe(refusedBy.grant);
    }
  });

  it('AC-04-30 has any captured field corrected in place by the API’s login, the prior value kept in the audit log under the person; no login deletes one', async () => {
    const { db, world } = tested;
    const event = world.loads.l101001.disposal;
    await asTheBackOffice();
    expect(
      await db.run(
        `UPDATE "field_event" SET "ticket_number" = '101007', "ended_at" = '2026-10-12T14:45:00Z',
           "end_latitude" = 39.16, "end_longitude" = -75.57, "load_call" = 70,
           "cert_number" = '730416', "certification_id" = $2, "address" = '2 Marsh Rd',
           "address_source" = 'TYPED'
         WHERE "id" = $1`,
        [event, world.certifications.c730416],
      ),
    ).toBe(1);
    const audited = await db.one<{
      actor: string;
      changed_fields: string[];
      prior: Record<string, unknown>;
    }>(
      `SELECT "actor_id"::text AS actor, "changed_fields",
         jsonb_build_object('ticket_number', "prior_value" -> 'ticket_number',
           'load_call', "prior_value" -> 'load_call', 'cert_number', "prior_value" -> 'cert_number',
           'certification_id', "prior_value" -> 'certification_id') AS prior
       FROM "audit_record" WHERE "record_id" = $1 AND "operation" = 'UPDATE'`,
      [event],
    );
    expect({ ...audited, changed_fields: [...audited.changed_fields].sort() }).toEqual({
      actor: world.admin,
      changed_fields: [
        'address',
        'address_source',
        'cert_number',
        'certification_id',
        'end_latitude',
        'end_longitude',
        'ended_at',
        'load_call',
        'ticket_number',
      ],
      prior: {
        ticket_number: '101001',
        load_call: 80,
        cert_number: '730415',
        certification_id: world.certifications.c730415,
      },
    });
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly', 'adms_owner'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      await db.refused(`DELETE FROM "field_event" WHERE "id" = $1`, [event]);
    }
  });

  it('AC-04-31 is seen by Bayline County’s client user and an auditor given its project, with who recorded it by name and Monitor ID and nothing else of a person; a contractor user sees its own tickets’ and not who recorded them', async () => {
    const { db, world } = tested;
    // Kim Nguyen records only on P2, which the client user isn't given.
    await db.actor(world.admin, 'BACK_OFFICE');
    const kim = (
      await db.one<{ id: string }>(
        ...insertOf('user', { name: 'Kim Nguyen', role: 'MONITOR', phone: '555-0162' }),
      )
    ).id;
    await received({
      project_id: world.p2,
      assignment_id: world.assignments.p2,
      monitor_id: kim,
      ticket_number: '102002',
      cert_number: '730416',
      certification_id: world.certifications.p2c730416,
    });
    const seenBy = async (
      viewer: string | null,
    ): Promise<{ events: number; projects: string[]; monitors: Record<string, unknown>[] }> => {
      if (viewer === null) await db.noViewer();
      else await db.viewer(viewer);
      await db.as('adms_readonly');
      const events = await db.rows<{ project: string }>(
        `SELECT "project_id"::text AS project FROM "viewer_field_event"`,
      );
      const monitors = await db.rows(`SELECT * FROM "viewer_field_event_monitor" ORDER BY "name"`);
      await db.administer();
      return {
        events: events.length,
        projects: [...new Set(events.map((event) => event.project))].sort(),
        monitors,
      };
    };
    const names = await db.rows<{ id: string; name: string; monitor_number: string }>(
      `SELECT "id"::text, "name", "monitor_number" FROM "user" WHERE "id" = ANY($1) ORDER BY "name"`,
      [[world.monitor, kim]],
    );
    const [ana] = names;
    expect(names.map((monitor) => monitor.name)).toEqual(['Ana Brooks', 'Kim Nguyen']);
    expect(ana?.monitor_number).toMatch(/^M[0-9]{6,}$/);
    // The client user, given P1: P1's four field events, and Ana, who recorded them. Exactly an
    // id, a name and a Monitor ID: no phone, email or employer.
    expect(await seenBy(world.clientViewer)).toEqual({
      events: 4,
      projects: [world.p1],
      monitors: [ana],
    });
    // The auditor, given P1 and P2: every field event, and both monitors.
    expect(await seenBy(world.auditor)).toEqual({
      events: 7,
      projects: [world.p1, world.p2].sort(),
      monitors: names,
    });
    // Coastline's contractor user, given P1: the four field events on Coastline's
    // certifications, and no monitor (ADR-361; AC-02-78). Nobody stated: nothing.
    expect(await seenBy(world.coastlineViewer)).toEqual({
      events: 4,
      projects: [world.p1],
      monitors: [],
    });
    expect(await seenBy(null)).toEqual({ events: 0, projects: [], monitors: [] });
    // No viewer reads a person's record itself.
    await db.viewer(world.clientViewer);
    await db.as('adms_readonly');
    expect((await db.refused(`SELECT "phone" FROM "user"`)).code).toBe(refusedBy.grant);
    // The view shows every column of the field event, as it is kept.
    await db.administer();
    expect(
      await db.rows(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'field_event'
         EXCEPT SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'viewer_field_event'`,
      ),
    ).toEqual([]);
  });

  it('AC-04-44 has no "refused" kind or record: a load turned away at a tower records nothing there', async () => {
    const { db } = tested;
    expect(await valuesOf('field_event_kind')).not.toContain('REFUSED');
    expect(await valuesOf('record_source')).toEqual(['DEVICE', 'BACK_OFFICE']);
    expect(
      await db.rows(
        `SELECT table_name || '.' || column_name AS found FROM information_schema.columns
         WHERE table_schema = 'public' AND (table_name LIKE '%refus%' OR column_name LIKE '%refus%'
           OR column_name LIKE '%turned_away%')`,
      ),
    ).toEqual([]);
  });

  it('AC-04-94 dumped at Old Quarry Pit, on a certification revoked last week, collected far outside P1, is received like any other', async () => {
    const { db, world } = tested;
    await asTheBackOffice();
    const quarry = (
      await db.one<{ id: string }>(
        ...insertOf(
          'disposal_site',
          siteLike(world, world.siteTypes.finalDisposal, {
            name: 'Old Quarry Pit',
            takes_loads: false,
            ineligible_site: true,
            permit_number: null,
          }),
        ),
      )
    ).id;
    expect(
      await db.run(
        `UPDATE "certification" SET "revoked_from" = '2026-10-05', "revoked_reason" = 'Sideboards removed',
           "revoked_by_id" = $2 WHERE "id" = $1`,
        [world.certifications.c730415, world.admin],
      ),
    ).toBe(1);
    await asThePhone();
    // A collection ending in the Gulf of Mexico, and its disposal at the quarry.
    await received({
      ticket_number: '101013',
      end_latitude: '26.50000000',
      end_longitude: '-84.00000000',
    });
    const disposal = await received(atTheTower('101013', { site_id: quarry, load_call: 100 }));
    expect(await kept(disposal, `"status"::text, "site_id"::text AS site`)).toEqual({
      status: 'PENDING',
      site: quarry,
    });
    // The database holds no rule of eligibility on a field event: its only triggers are the
    // guards every table has.
    expect(
      (
        await db.rows<{ name: string }>(
          `SELECT tgname AS name FROM pg_trigger
           WHERE tgrelid = 'field_event'::regclass AND NOT tgisinternal ORDER BY tgname`,
        )
      ).map((trigger) => trigger.name),
    ).toEqual(['field_event_audit', 'field_event_refuse_delete', 'field_event_refuse_truncate']);
  });
});
