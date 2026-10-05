// A record waiting in quarantine, and a fix kept as sent (spec/acceptance/05-sync.md sections B,
// C and E, by scenario ID; spec/DATA-MODEL.md §4.1, §4.4, §4.5; adms-exceptions §4.3a; ADR-022,
// 101, 236, 292, 329 (5), 336, 338; REQ-120b). What intake does with a phone's records is the
// story `sync`'s; here is what the database holds and refuses by itself, whoever writes. The
// values are adms-exceptions Scenario A's: Rivera's self-loader, cert 730416, collected at 22 Elm
// St as 101020; the tower scans 101020 at 10:22 and again, from a stale copy, at 11:40. The
// example world's Ana Brooks and her phone stand in for Kim Nguyen at the tower, and Dana Reyes
// for the reviewer.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  eventInsertOf,
  fieldEventLike,
  phoneInsertOf,
  photoLike,
  roeLike,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

type Row = Record<string, unknown>;

const systemActor = '00000000-0000-7000-8000-000000000001';

// As the API's login, for the tower's phone at sync.
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

// A disposal on 101020 at Marsh Road TDSR, as the tower's phone sends it.
function disposal(more: Row = {}): Row {
  const { world } = tested;
  return fieldEventLike(world, {
    kind: 'DISPOSAL',
    ticket_number: '101020',
    cert_number: '730416',
    certification_id: world.certifications.c730416,
    site_id: world.site,
    load_call: 70,
    started_at: '2026-10-13T14:10:00Z',
    ended_at: '2026-10-13T14:22:00Z',
    ...more,
  });
}

// The 10:22 disposal, saved: it holds the number.
async function holder(): Promise<string> {
  return (await tested.db.one<{ id: string }>(...eventInsertOf(disposal()))).id;
}

// The 11:40 disposal as the phone sent it: what a person reads in quarantine.
const sent = {
  workflow: 'LOAD',
  kind: 'DISPOSAL',
  ticketNumber: '101020',
  splitSuffix: '',
  certNumber: '730416',
  loadCall: 65,
  startedAt: '2026-10-13T15:28:00.000Z',
  endedAt: '2026-10-13T15:40:00.000Z',
  endLatitude: '27.98150000',
  endLongitude: '-82.39720000',
};

function quarantined(holdingEventId: string, more: Row = {}): Row {
  const { world } = tested;
  return {
    project_id: world.p1,
    device_id: world.device,
    monitor_id: world.monitor,
    payload: JSON.stringify(sent),
    reason: 'DUPLICATE_FIELD_EVENT',
    holding_event_id: holdingEventId,
    received_at: '2026-10-13T22:30:00Z',
    ...more,
  };
}

async function received(row: Row): Promise<string> {
  return (await tested.db.one<{ id: string }>(...phoneInsertOf('quarantined_record', row))).id;
}

// How the database refuses that record: the code, and the check it names.
async function refusal(table: string, row: Row): Promise<string> {
  const { code, message } = await tested.db.refused(...phoneInsertOf(table, row));
  const named = /constraint "([^"]+)"/.exec(message);
  return code === refusedBy.check && named ? `${code} ${String(named[1])}` : code;
}

const check = (name: string): string => `${refusedBy.check} ${name}`;

describe('a record waiting in quarantine', () => {
  it('AC-05-18 is kept in full: the record as the phone sent it, under its own id, with its project, phone, monitor, reason, the record that holds the number and when the server received it', async () => {
    const { db, world } = tested;
    await asThePhone();
    const held = await holder();
    const id = await received(quarantined(held));
    await db.administer();
    const columns = await db.rows<{ name: string }>(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'quarantined_record' ORDER BY column_name`,
    );
    expect(columns.map((column) => column.name)).toEqual([
      'device_id',
      'holding_event_id',
      'holding_roe_id',
      'id',
      'monitor_id',
      'payload',
      'project_id',
      'reason',
      'received_at',
      'resolution',
      'resolved_at',
      'resolved_by_id',
    ]);
    expect(
      await db.one(
        `SELECT "project_id"::text AS project, "device_id"::text AS device,
           "monitor_id"::text AS monitor, "payload", "reason"::text,
           "holding_event_id"::text AS holding, "holding_roe_id",
           to_char("received_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS received,
           "resolved_by_id", "resolved_at", "resolution"
         FROM "quarantined_record" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({
      project: world.p1,
      device: world.device,
      monitor: world.monitor,
      payload: sent,
      reason: 'DUPLICATE_FIELD_EVENT',
      holding: held,
      holding_roe_id: null,
      received: '2026-10-13 22:30',
      resolved_by_id: null,
      resolved_at: null,
      resolution: null,
    });
    // Audited by the database, with the monitor as the actor, from their phone (REQ-011).
    expect(
      await db.rows(
        `SELECT "operation"::text, "source"::text, "domain"::text, "actor_id"::text AS actor,
           "device_id"::text AS device
         FROM "audit_record" WHERE "table_name" = 'quarantined_record' AND "record_id" = $1`,
        [id],
      ),
    ).toEqual([
      {
        operation: 'INSERT',
        source: 'DEVICE',
        domain: 'RECORDS',
        actor: world.monitor,
        device: world.device,
      },
    ]);
  });

  it('AC-05-18 names what holds its number, one of its own project’s: none, the wrong kind of holder, another project’s or one that isn’t there is refused', async () => {
    const { db, world } = tested;
    await asThePhone();
    const held = await holder();
    const roe = (
      await db.one<{ id: string }>(
        ...phoneInsertOf(
          'roe',
          roeLike(world, { project_id: world.p1, assignment_id: world.assignments.p1 }),
        ),
      )
    ).id;
    const holderCheck = check('quarantined_record_holder_check');
    expect(await refusal('quarantined_record', quarantined(held, { holding_event_id: null }))).toBe(
      holderCheck,
    );
    expect(await refusal('quarantined_record', quarantined(held, { holding_roe_id: roe }))).toBe(
      holderCheck,
    );
    expect(
      await refusal(
        'quarantined_record',
        quarantined(held, { reason: 'DUPLICATE_ROE_NUMBER', holding_roe_id: null }),
      ),
    ).toBe(holderCheck);
    // An ROE made on a phone whose number another ROE of the project has: the ROE holds it.
    await received(
      quarantined(held, {
        reason: 'DUPLICATE_ROE_NUMBER',
        holding_event_id: null,
        holding_roe_id: roe,
      }),
    );
    expect(await refusal('quarantined_record', quarantined(held, { project_id: world.p2 }))).toBe(
      refusedBy.foreignKey,
    );
    expect(
      await refusal('quarantined_record', quarantined(held, { holding_event_id: world.p1 })),
    ).toBe(refusedBy.foreignKey);
    expect(await refusal('quarantined_record', quarantined(held, { reason: 'LOST' }))).toBe(
      refusedBy.badValue,
    );
  });

  it('AC-05-18 is a record a monitor made on a phone: a payload that is no record, no phone, no monitor and the system actor are each refused', async () => {
    await asThePhone();
    const held = await holder();
    for (const payload of ['"101020"', '[]', '65', 'null']) {
      expect(await refusal('quarantined_record', quarantined(held, { payload })), payload).toBe(
        check('quarantined_record_payload_check'),
      );
    }
    for (const column of ['device_id', 'monitor_id', 'payload', 'project_id', 'reason']) {
      expect(
        await refusal('quarantined_record', quarantined(held, { [column]: null })),
        column,
      ).toBe(refusedBy.notNull);
    }
    expect(
      await refusal('quarantined_record', quarantined(held, { monitor_id: systemActor })),
    ).toBe(check('quarantined_record_monitor_check'));
  });

  it('AC-05-15 keeps the id its phone made: the same record sent again can’t be written a second time', async () => {
    const { db } = tested;
    await asThePhone();
    const held = await holder();
    const id = await received(quarantined(held));
    const again = await db.refused(
      `INSERT INTO "quarantined_record"
         ("id", "project_id", "device_id", "monitor_id", "payload", "reason", "holding_event_id")
       SELECT "id", "project_id", "device_id", "monitor_id", "payload", "reason", "holding_event_id"
       FROM "quarantined_record" WHERE "id" = $1`,
      [id],
    );
    expect(again.code).toBe(refusedBy.unique);
  });

  it('AC-05-19, AC-05-26 is never a way round the key: a second disposal on 101020 still can’t be written as a field event, and the one that holds the number is unchanged', async () => {
    const { db } = tested;
    await asThePhone();
    const held = await holder();
    const before = await db.one(`SELECT * FROM "field_event" WHERE "id" = $1`, [held]);
    await received(quarantined(held));
    expect((await db.refused(...eventInsertOf(disposal({ load_call: 65 })))).code).toBe(
      refusedBy.unique,
    );
    expect(await db.one(`SELECT * FROM "field_event" WHERE "id" = $1`, [held])).toEqual(before);
    // It is no field event: it has no status, and the field event's table holds one disposal.
    expect(
      await db.rows(
        `SELECT "status"::text FROM "field_event" WHERE "ticket_number" = '101020' AND "kind" = 'DISPOSAL'`,
      ),
    ).toEqual([{ status: 'PENDING' }]);
  });

  it('AC-05-22 its photographs belong to it while it waits, and to nothing else; one of another project is refused', async () => {
    const { db, world } = tested;
    await asThePhone();
    const held = await holder();
    const id = await received(quarantined(held));
    const photo = (
      await db.one<{ id: string }>(
        ...phoneInsertOf('photo', photoLike(world, { quarantined_record_id: id })),
      )
    ).id;
    expect(
      await db.one(
        `SELECT "quarantined_record_id"::text AS quarantined,
           num_nonnulls("field_event_id", "certification_id", "scale_receipt_id", "roe_id",
             "survey_id", "incident_id", "drop_off_log_id") AS others
         FROM "photo" WHERE "id" = $1`,
        [photo],
      ),
    ).toEqual({ quarantined: id, others: 0 });
    const both = await db.refused(
      ...phoneInsertOf(
        'photo',
        photoLike(world, { quarantined_record_id: id, field_event_id: held }),
      ),
    );
    expect([both.code, both.message.includes('"photo_owner_check"')]).toEqual([
      refusedBy.check,
      true,
    ]);
    expect(
      await refusal('photo', photoLike(world, { project_id: world.p2, quarantined_record_id: id })),
    ).toBe(refusedBy.foreignKey);
    // A reviewer's resolution moves it to the field event the record becomes (BACKLOG 1.8.x):
    // the owner is a photograph's ordinary correctable column.
    await asTheBackOffice();
    expect(
      await db.run(
        `UPDATE "photo" SET "quarantined_record_id" = NULL, "field_event_id" = $2 WHERE "id" = $1`,
        [photo, held],
      ),
    ).toBe(1);
  });

  it('AC-05-23 nobody can delete it, and what the phone sent can’t be changed by anyone', async () => {
    const { db, world } = tested;
    await asThePhone();
    const held = await holder();
    const other = (
      await db.one<{ id: string }>(...eventInsertOf(disposal({ ticket_number: '101021' })))
    ).id;
    const id = await received(quarantined(held));
    await db.administer();
    for (const login of ['adms_api', 'adms_worker', 'adms_owner'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      const deleted = await db.refused(`DELETE FROM "quarantined_record" WHERE "id" = $1`, [id]);
      expect([refusedBy.grant, refusedBy.trigger], `${login} delete`).toContain(deleted.code);
      await db.administer();
    }
    // The API's login holds the evidence guard's column grants; the owner's holds every right.
    // Neither changes what was sent.
    for (const login of ['adms_api', 'adms_owner'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      for (const [column, value] of [
        ['project_id', world.p2],
        ['device_id', world.certifyingDevice],
        ['monitor_id', world.certifier],
        ['payload', '{"ticketNumber":"101021"}'],
        ['reason', 'DUPLICATE_ROE_NUMBER'],
        ['holding_event_id', other],
        ['holding_roe_id', other],
      ] as const) {
        const changed = await db.refused(
          `UPDATE "quarantined_record" SET "${column}" = $2 WHERE "id" = $1`,
          [id, value],
        );
        expect(changed.code, `${login} ${column}`).toBe(refusedBy.trigger);
      }
      await db.administer();
    }
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    for (const column of ['id', 'received_at']) {
      const changed = await db.refused(
        `UPDATE "quarantined_record" SET "${column}" = "${column}" WHERE "id" = $1`,
        [id],
      );
      expect(changed.code, column).toBe(refusedBy.grant);
    }
    await db.administer();
    expect(
      await db.one(
        `SELECT "payload", "holding_event_id"::text AS holding FROM "quarantined_record"`,
      ),
    ).toEqual({ payload: sent, holding: held });
  });

  it('AC-05-23 only its resolution is written later: who, when and what, all three, by a person through the API, audited; the worker writes none of it', async () => {
    const { db, world } = tested;
    await asThePhone();
    const held = await holder();
    const id = await received(quarantined(held));
    const resolve = `UPDATE "quarantined_record"
      SET "resolved_by_id" = $2, "resolved_at" = $3, "resolution" = $4 WHERE "id" = $1`;
    const at = '2026-10-14T13:05:00Z';
    await asTheBackOffice();
    const resolution = check('quarantined_record_resolution_check');
    for (const [what, values] of [
      ['no words', [world.admin, at, null]],
      ['blank words', [world.admin, at, '  ']],
      ['nobody', [null, at, 'Renumbered to 101021']],
      ['no time', [world.admin, null, 'Renumbered to 101021']],
    ] as const) {
      const refused = await db.refused(resolve, [id, ...values]);
      const named = /constraint "([^"]+)"/.exec(refused.message);
      expect(`${refused.code} ${String(named?.[1])}`, what).toBe(resolution);
    }
    const bySystem = await db.refused(resolve, [id, systemActor, at, 'Renumbered to 101021']);
    expect(bySystem.message).toContain('"quarantined_record_resolved_by_check"');
    expect(await db.run(resolve, [id, world.admin, at, 'Renumbered to 101021'])).toBe(1);
    await db.administer();
    // Resolved, it is kept, with what the phone sent as it was.
    expect(
      await db.one(
        `SELECT "resolved_by_id"::text AS by, "resolution", "payload" FROM "quarantined_record"`,
      ),
    ).toEqual({ by: world.admin, resolution: 'Renumbered to 101021', payload: sent });
    expect(
      await db.rows(
        `SELECT "operation"::text, "actor_id"::text AS actor, "source"::text
         FROM "audit_record" WHERE "table_name" = 'quarantined_record' AND "record_id" = $1
         ORDER BY "id"`,
        [id],
      ),
    ).toEqual([
      { operation: 'INSERT', actor: world.monitor, source: 'DEVICE' },
      { operation: 'UPDATE', actor: world.admin, source: 'BACK_OFFICE' },
    ]);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await db.refused(resolve, [id, world.admin, at, 'Voided'])).code).toBe(refusedBy.grant);
    expect((await db.refused(...phoneInsertOf('quarantined_record', quarantined(held)))).code).toBe(
      refusedBy.grant,
    );
  });

  it('a client user and an auditor see that a record of their project waits in quarantine; the record as sent only where the firm lets them see private citizens; a contractor user nothing', async () => {
    const { db, world } = tested;
    await asThePhone();
    const held = await holder();
    const id = await received(quarantined(held));
    await asTheBackOffice();
    await db.run(`UPDATE "user" SET "sees_private_citizens" = false WHERE "id" = $1`, [
      world.auditor,
    ]);
    await db.administer();
    const reads = async (viewer: string, sql: string): Promise<Row[]> => {
      await db.viewer(viewer);
      await db.as('adms_readonly');
      const rows = await db.rows<Row>(sql);
      await db.administer();
      return rows;
    };
    const waiting = `SELECT "id"::text, "reason"::text, "holding_event_id"::text AS holding
      FROM "viewer_quarantined_record"`;
    const asSent = `SELECT "payload" FROM "viewer_quarantined_record_citizen"`;
    for (const viewer of [world.clientViewer, world.auditor]) {
      expect(await reads(viewer, waiting), viewer).toEqual([
        { id, reason: 'DUPLICATE_FIELD_EVENT', holding: held },
      ]);
    }
    expect(await reads(world.clientViewer, asSent)).toEqual([{ payload: sent }]);
    expect(await reads(world.auditor, asSent)).toEqual([]);
    expect(await reads(world.coastlineViewer, waiting)).toEqual([]);
    expect(await reads(world.coastlineViewer, asSent)).toEqual([]);
    // No viewer reads the record as sent from the table, or from the view every viewer reads.
    await db.viewer(world.clientViewer);
    await db.as('adms_readonly');
    for (const sql of [
      `SELECT "payload" FROM "quarantined_record"`,
      `SELECT * FROM "quarantined_record"`,
    ]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
    // 42703: the view has no such column.
    expect((await db.refused(`SELECT "payload" FROM "viewer_quarantined_record"`)).code).toBe(
      '42703',
    );
  });
});

describe('a GPS fix that couldn’t be one', () => {
  it('AC-05-39 is kept as the phone sent it, beside a field event saved without that fix; the field event’s own fix still takes no impossible value', async () => {
    const { db } = tested;
    await asThePhone();
    const unreadable = { end: { latitude: '91.20000000', longitude: '-82.39720000' } };
    const id = (
      await db.one<{ id: string }>(
        ...eventInsertOf(disposal({ unreadable_gps: JSON.stringify(unreadable) })),
      )
    ).id;
    expect(
      await db.one(
        `SELECT "end_latitude", "end_longitude", "unreadable_gps" FROM "field_event" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({ end_latitude: null, end_longitude: null, unreadable_gps: unreadable });
    // Nothing kept is nothing at all: an empty object, or a bare value, says nothing.
    for (const value of ['{}', '[]', '"91.2"', '91.2']) {
      expect(
        await refusal('field_event', disposal({ ticket_number: '101022', unreadable_gps: value })),
        value,
      ).toBe(check('field_event_unreadable_gps_check'));
    }
    // The database's own check on a fix stays (ADR-329 (5)): intake never writes the bad one.
    for (const fix of [
      { end_latitude: '91.20000000', end_longitude: '-82.39720000' },
      { end_latitude: '27.98150000', end_longitude: null },
    ]) {
      expect(await refusal('field_event', disposal({ ticket_number: '101022', ...fix }))).toBe(
        check('field_event_end_gps_check'),
      );
    }
  });
});
