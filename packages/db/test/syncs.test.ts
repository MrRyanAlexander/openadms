// A sync, the idempotency ledger and a held record (task 2.6.2, part 1 of 4; ADR-471).
// spec/DATA-MODEL.md §4.5; spec/acceptance/05-sync.md AC-05-04, 16, 46;
// spec/acceptance/06-reconciliation.md AC-06-58; ARCHITECTURE §5.1…§5.5, §9 (1), (3), (4), §10;
// ADR-022, 100, 336, 467, 468, 469; REQ-016, 203.
//
// These try the guards as each login, rolled back: what the database holds and refuses by
// itself, whoever writes. The service that writes them at a sync is the task's next part. The
// values are AC-05-04's: Ana Brooks's phone at the tower, whose clock stood 2 hours 14 minutes
// ahead of the server's when it synced on Tuesday 13 October.
import { heldReasons, notSavedReasons } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { deviceKeyActorId } from '../src/device-key-actor.ts';
import { masterPasscodeActorId } from '../src/master-passcode-actor.ts';
import { refusedBy } from './support/database.ts';
import {
  fieldEventLike,
  fingerprintOf,
  insertOf,
  phoneInsertOf,
  photoLike,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

type Row = Record<string, unknown>;

const systemActor = '00000000-0000-7000-8000-000000000001';
const nothingThere = '0199b6a0-0000-7000-8000-00000000dead';
const keptOut = '[kept out of the audit]';

// As the API's login, for a phone that proved itself: the device key's actor (ADR-440).
async function forThePhone(deviceId: string = tested.world.device): Promise<void> {
  const { db } = tested;
  await db.as('adms_api');
  await db.actor(deviceKeyActorId, 'DEVICE', { deviceId });
}

// As the API's login, for Dana in the back office.
async function asTheBackOffice(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

// The server's clock said 17:00 in Delaware; the phone's said 19:14.
function syncLike(more: Row = {}): Row {
  return {
    device_id: tested.world.device,
    started_at: '2026-10-13T21:00:00Z',
    device_clock_at: '2026-10-13T23:14:00Z',
    device_utc_offset_minutes: -240,
    clock_difference_seconds: 8040,
    ...more,
  };
}

async function synced(more: Row = {}): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf('sync', syncLike(more)))).id;
}

// How the database refuses a write: the code, and the check it names.
async function refusal(sql: string, values: readonly unknown[]): Promise<string> {
  const { code, message } = await tested.db.refused(sql, values);
  const named = /constraint "([^"]+)"/.exec(message);
  return code === refusedBy.check && named ? `${code} ${String(named[1])}` : code;
}

const check = (name: string): string => `${refusedBy.check} ${name}`;

const columnsOf = async (table: string): Promise<string[]> =>
  (
    await tested.db.rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`,
      [table],
    )
  ).map((column) => column.column_name);

const stateThePhone = (table: string): { code: string; message: string } => ({
  code: refusedBy.grant,
  message: `A ${table} row is written when a phone syncs: state the phone it names`,
});

describe('a sync', () => {
  it('AC-05-04 keeps the phone, the server’s clock when it began, the phone’s clock with its offset, and the difference between the two', async () => {
    const { db, world } = tested;
    expect(await columnsOf('sync')).toEqual([
      'clock_difference_seconds',
      'device_clock_at',
      'device_id',
      'device_utc_offset_minutes',
      'id',
      'setup_version_sent',
      'started_at',
    ]);
    await forThePhone();
    const id = await synced();
    expect(
      await db.one(
        `SELECT "device_id"::text AS device, "started_at", "device_clock_at",
                "device_utc_offset_minutes" AS "offset",
                "clock_difference_seconds"::text AS difference, "setup_version_sent" AS version
         FROM "sync" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({
      device: world.device,
      started_at: new Date('2026-10-13T21:00:00Z'),
      device_clock_at: new Date('2026-10-13T23:14:00Z'),
      offset: -240,
      difference: '8040',
      version: null,
    });
  });

  it('AC-05-04, AC-06-58 the difference is the phone’s clock less the server’s, in whole seconds: ahead, behind, a fraction rounded either way, and a clock that says any year at all; never another figure', async () => {
    await forThePhone();
    const difference = check('sync_clock_difference_check');
    const add = insertOf('sync', syncLike());
    for (const [clock, seconds, taken] of [
      ['2026-10-13T23:14:00Z', 8040, true],
      ['2026-10-13T23:14:00Z', 8041, false],
      ['2026-10-13T23:14:00Z', 8039, false],
      ['2026-10-13T23:14:00Z', 0, false],
      ['2026-10-13T23:14:00Z', -8040, false],
      // Behind the server's by as much.
      ['2026-10-13T18:46:00Z', -8040, true],
      ['2026-10-13T18:46:00Z', 8040, false],
      // 8,040.6 seconds: rounded down or up, never further.
      ['2026-10-13T23:14:00.600Z', 8040, true],
      ['2026-10-13T23:14:00.600Z', 8041, true],
      ['2026-10-13T23:14:00.600Z', 8042, false],
      ['2026-10-13T23:14:00.600Z', 8039, false],
      // With the server's to the second.
      ['2026-10-13T21:00:00Z', 0, true],
      // A phone may say any instant: the difference is kept wide.
      ['9999-12-31T23:59:59Z', 251_610_375_599, true],
      ['1970-01-01T00:00:00Z', -1_791_925_200, true],
    ] as const) {
      const row = syncLike({ device_clock_at: clock, clock_difference_seconds: String(seconds) });
      const tried = [add[0], Object.values(row)] as const;
      if (taken) expect(await tested.db.run(...tried), `${clock} ${String(seconds)}`).toBe(1);
      else expect(await refusal(...tried), `${clock} ${String(seconds)}`).toBe(difference);
    }
  });

  it('the phone’s offset is one a clock can stand at, UTC−12:00 to UTC+14:00, and its phone is a real one', async () => {
    await forThePhone();
    for (const offset of [-721, 841, 100_000]) {
      expect(
        await refusal(...insertOf('sync', syncLike({ device_utc_offset_minutes: offset }))),
        String(offset),
      ).toBe(check('sync_device_utc_offset_check'));
    }
    for (const offset of [-720, 0, 840]) await synced({ device_utc_offset_minutes: offset });
    await forThePhone(nothingThere);
    expect(await refusal(...insertOf('sync', syncLike({ device_id: nothingThere })))).toBe(
      refusedBy.foreignKey,
    );
  });

  it('AC-05-03 is written only for a phone, stated by name, and names that phone: not from the back office, not for a phone left unsaid, not about another phone, not by the worker or a read-only viewer', async () => {
    const { db, world } = tested;
    const add = insertOf('sync', syncLike());
    await asTheBackOffice();
    expect(await db.refused(...add)).toEqual(stateThePhone('sync'));
    // Naming a phone doesn't make a back-office write a phone's.
    await db.actor(world.admin, 'BACK_OFFICE', { deviceId: world.device });
    expect(await db.refused(...add)).toEqual(stateThePhone('sync'));
    await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.certifyingDevice });
    expect(await db.refused(...add)).toEqual(stateThePhone('sync'));
    await db.actor(world.monitor, 'DEVICE');
    expect(await db.refused(...add)).toEqual(stateThePhone('sync'));
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await db.refused(...add)).code).toBe(refusedBy.grant);
    await db.as('adms_readonly');
    expect((await db.refused(...add)).code).toBe(refusedBy.grant);
    // The monitor signed in on the phone may be whose sync it is: the phone is what is stated.
    await db.as('adms_api');
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    await synced();
    await forThePhone(world.certifyingDevice);
    await synced({ device_id: world.certifyingDevice });
    await db.administer();
    expect(await db.one(`SELECT count(*)::int AS syncs FROM "sync"`)).toEqual({ syncs: 2 });
  });

  it('the setup version its answer carried is written once, from 1, for its phone; nothing else of it is ever changed, by anyone', async () => {
    const { db, world } = tested;
    await forThePhone();
    const id = await synced();
    const sent = `UPDATE "sync" SET "setup_version_sent" = $2 WHERE "id" = $1`;
    for (const version of [0, -1]) {
      expect(await refusal(sent, [id, version]), String(version)).toBe(
        check('sync_setup_version_sent_check'),
      );
    }
    await asTheBackOffice();
    expect(await db.refused(sent, [id, 3])).toEqual(stateThePhone('sync'));
    await forThePhone(world.certifyingDevice);
    expect(await db.refused(sent, [id, 3])).toEqual(stateThePhone('sync'));
    await forThePhone();
    expect(await db.run(sent, [id, 3])).toBe(1);
    // Once written it stands: not another version, not none, not the same again.
    for (const version of [4, null, 3]) {
      expect((await db.refused(sent, [id, version])).code, String(version)).toBe(refusedBy.trigger);
    }
    const other = await synced({
      started_at: '2026-10-13T21:05:00Z',
      clock_difference_seconds: 7740,
    });
    for (const login of ['adms_api', 'adms_owner'] as const) {
      await db.as(login);
      await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device });
      for (const set of [
        `"id" = uuidv7()`,
        `"device_id" = "device_id"`,
        `"started_at" = "started_at"`,
        `"device_clock_at" = "device_clock_at"`,
        `"device_utc_offset_minutes" = 0`,
        `"clock_difference_seconds" = "clock_difference_seconds"`,
      ]) {
        expect(
          (await db.refused(`UPDATE "sync" SET ${set} WHERE "id" = $1`, [other])).code,
          `${login}: ${set}`,
        ).toBe(refusedBy.trigger);
      }
      await db.administer();
    }
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await db.refused(sent, [other, 3])).code).toBe(refusedBy.grant);
    await db.administer();
    expect(
      await db.rows(`SELECT "setup_version_sent" AS version FROM "sync" ORDER BY "started_at"`),
    ).toEqual([{ version: 3 }, { version: null }]);
  });

  it('nobody deletes one; the worker reads it, for the clock’s difference, and a read-only viewer reads none', async () => {
    const { db, world } = tested;
    await forThePhone();
    const id = await synced();
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect((await db.refused(`DELETE FROM "sync" WHERE "id" = $1`, [id])).code, login).toBe(
        refusedBy.grant,
      );
    }
    await db.as('adms_owner');
    expect((await db.refused(`DELETE FROM "sync" WHERE "id" = $1`, [id])).code).toBe(
      refusedBy.trigger,
    );
    expect((await db.refused(`TRUNCATE "sync" CASCADE`)).code).toBe(refusedBy.trigger);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      await db.rows(`SELECT "clock_difference_seconds"::text AS difference FROM "sync"`),
    ).toEqual([{ difference: '8040' }]);
    await db.as('adms_readonly');
    expect((await db.refused(`SELECT "id" FROM "sync"`)).code).toBe(refusedBy.grant);
  });

  it('is audited as a record, by whoever the phone’s sync was written as, on that phone', async () => {
    const { db, world } = tested;
    await forThePhone();
    const id = await synced();
    await db.run(`UPDATE "sync" SET "setup_version_sent" = 2 WHERE "id" = $1`, [id]);
    await db.administer();
    expect(
      await db.rows(
        `SELECT "operation"::text, "domain"::text, "actor_id"::text AS actor, "source"::text,
                "device_id"::text AS device, "new_value" -> 'setup_version_sent' AS version
         FROM "audit_record" WHERE "table_name" = 'sync' AND "record_id" = $1 ORDER BY "id"`,
        [id],
      ),
    ).toEqual(
      [
        ['INSERT', null],
        ['UPDATE', 2],
      ].map(([operation, version]) => ({
        operation,
        domain: 'RECORDS',
        actor: deviceKeyActorId,
        source: 'DEVICE',
        device: world.device,
        version,
      })),
    );
  });
});

// A collection's id as Ana's phone made it.
const recordId = '0199c2d4-1a00-7000-8000-000000101020';

function ledgerRow(syncId: string, more: Row = {}): Row {
  return {
    id: recordId,
    record_kind: 'FIELD_EVENT',
    sync_id: syncId,
    device_id: tested.world.device,
    answer: 'SAVED',
    ...more,
  };
}

function ledgerInsertOf(row: Row): [string, unknown[]] {
  const columns = Object.keys(row);
  return [
    `INSERT INTO "synced_record" (${columns.map((column) => `"${column}"`).join(', ')})
     VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')})`,
    Object.values(row),
  ];
}

// As the API's login, for Ana signed in on her phone: a record is written as its monitor.
async function asTheMonitorOnThePhone(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
}

describe('the idempotency ledger', () => {
  it('AC-05-16 is keyed on the id the phone made, and keeps for each record its kind, the sync that brought it and the answer it was given: saved or quarantined', async () => {
    const { db, world } = tested;
    expect(await columnsOf('synced_record')).toEqual([
      'answer',
      'device_id',
      'id',
      'record_kind',
      'sync_id',
    ]);
    expect(
      await db.rows(
        `SELECT a.attname::text AS key FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
         WHERE i.indrelid = 'synced_record'::regclass AND i.indisprimary`,
      ),
    ).toEqual([{ key: 'id' }]);
    expect(
      await db.rows(
        `SELECT enumlabel::text AS answer FROM pg_enum
         WHERE enumtypid = 'sync_answer'::regtype ORDER BY enumsortorder`,
      ),
    ).toEqual([{ answer: 'SAVED' }, { answer: 'QUARANTINED' }]);
    await forThePhone();
    const sync = await synced();
    await asTheMonitorOnThePhone();
    const quarantined = '0199c2d4-1a00-7000-8000-000000101021';
    await db.run(...ledgerInsertOf(ledgerRow(sync)));
    await db.run(...ledgerInsertOf(ledgerRow(sync, { id: quarantined, answer: 'QUARANTINED' })));
    expect(
      await db.rows(
        `SELECT "id"::text AS record, "record_kind" AS kind, "sync_id"::text AS sync,
                "device_id"::text AS device, "answer"::text
         FROM "synced_record" ORDER BY "id"`,
      ),
    ).toEqual([
      { record: recordId, kind: 'FIELD_EVENT', sync, device: world.device, answer: 'SAVED' },
      {
        record: quarantined,
        kind: 'FIELD_EVENT',
        sync,
        device: world.device,
        answer: 'QUARANTINED',
      },
    ]);
  });

  it('REQ-016 a record is in it once: the same id again is refused, in the same sync, a later one, as another kind or with another answer', async () => {
    const { db } = tested;
    await forThePhone();
    const first = await synced();
    const later = await synced({
      started_at: '2026-10-13T21:30:00Z',
      clock_difference_seconds: 6240,
    });
    await asTheMonitorOnThePhone();
    await db.run(...ledgerInsertOf(ledgerRow(first)));
    for (const more of [
      {},
      { sync_id: later },
      { record_kind: 'ROE' },
      { answer: 'QUARANTINED' },
    ] satisfies Row[]) {
      expect(
        (await db.refused(...ledgerInsertOf(ledgerRow(first, more)))).code,
        JSON.stringify(more),
      ).toBe(refusedBy.unique);
    }
    expect(await db.one(`SELECT count(*)::int AS rows FROM "synced_record"`)).toEqual({ rows: 1 });
  });

  it('what it keeps is what the contract names: an answer of the two, a kind that is a word of the contract’s, a sync that is there and is that phone’s', async () => {
    const { db, world } = tested;
    await forThePhone();
    const sync = await synced();
    await asTheMonitorOnThePhone();
    // A record the server could not save is a held record, never a row here (ADR-468, 471).
    expect(
      (await db.refused(...ledgerInsertOf(ledgerRow(sync, { answer: 'NOT_SAVED' })))).code,
    ).toBe(refusedBy.badValue);
    for (const kind of ['', '  ', 'field_event', 'Field event', 'FIELD_', '_ROE', 'FIELD__EVENT']) {
      expect(
        await refusal(...ledgerInsertOf(ledgerRow(sync, { record_kind: kind }))),
        `“${kind}”`,
      ).toBe(check('synced_record_record_kind_check'));
    }
    expect(await refusal(...ledgerInsertOf(ledgerRow(nothingThere)))).toBe(refusedBy.foreignKey);
    // Another phone's sync: the row names its own phone and its sync, and they disagree.
    await forThePhone(world.certifyingDevice);
    const theirs = await synced({ device_id: world.certifyingDevice });
    await asTheMonitorOnThePhone();
    expect(await refusal(...ledgerInsertOf(ledgerRow(theirs)))).toBe(refusedBy.foreignKey);
    for (const [index, kind] of [
      'SCALE_RECEIPT',
      'ROE',
      'CERTIFICATION',
      'DROP_OFF_LOG',
    ].entries()) {
      await db.run(
        ...ledgerInsertOf(
          ledgerRow(sync, {
            id: `0199c2d4-1a00-7000-8000-00000000000${String(index)}`,
            record_kind: kind,
          }),
        ),
      );
    }
  });

  it('a row is written only for the phone it names, when that phone syncs: not from the back office, not for another phone, not by the worker', async () => {
    const { db, world } = tested;
    await forThePhone();
    const sync = await synced();
    const add = ledgerInsertOf(ledgerRow(sync));
    await asTheBackOffice();
    expect(await db.refused(...add)).toEqual(stateThePhone('synced_record'));
    await db.actor(world.admin, 'BACK_OFFICE', { deviceId: world.device });
    expect(await db.refused(...add)).toEqual(stateThePhone('synced_record'));
    await db.actor(world.monitor, 'DEVICE');
    expect(await db.refused(...add)).toEqual(stateThePhone('synced_record'));
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.certifyingDevice });
    expect(await db.refused(...add)).toEqual(stateThePhone('synced_record'));
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await db.refused(...add)).code).toBe(refusedBy.grant);
    await db.as('adms_readonly');
    expect((await db.refused(...add)).code).toBe(refusedBy.grant);
    await asTheMonitorOnThePhone();
    expect(await db.run(...add)).toBe(1);
  });

  it('nobody changes a row and nobody deletes one; the worker reads it, to find the sync that brought a record, and a read-only viewer reads none; each is audited as a record', async () => {
    const { db, world } = tested;
    await forThePhone();
    const sync = await synced();
    const later = await synced({
      started_at: '2026-10-13T21:30:00Z',
      clock_difference_seconds: 6240,
    });
    await asTheMonitorOnThePhone();
    await db.run(...ledgerInsertOf(ledgerRow(sync)));
    for (const set of [
      `"answer" = 'QUARANTINED'`,
      `"sync_id" = '${later}'`,
      `"record_kind" = 'ROE'`,
      `"id" = uuidv7()`,
      `"device_id" = "device_id"`,
    ]) {
      for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
        await db.as(login);
        expect(
          (await db.refused(`UPDATE "synced_record" SET ${set}`)).code,
          `${login}: ${set}`,
        ).toBe(refusedBy.grant);
      }
      await db.as('adms_owner');
      expect((await db.refused(`UPDATE "synced_record" SET ${set}`)).code, `owner: ${set}`).toBe(
        refusedBy.trigger,
      );
    }
    for (const login of ['adms_api', 'adms_worker', 'adms_readonly'] as const) {
      await db.as(login);
      expect((await db.refused(`DELETE FROM "synced_record"`)).code, login).toBe(refusedBy.grant);
    }
    await db.as('adms_owner');
    expect((await db.refused(`DELETE FROM "synced_record"`)).code).toBe(refusedBy.trigger);
    expect((await db.refused(`TRUNCATE "synced_record"`)).code).toBe(refusedBy.trigger);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect(
      await db.rows(
        `SELECT s."clock_difference_seconds"::text AS difference
         FROM "synced_record" r JOIN "sync" s ON s."id" = r."sync_id" WHERE r."id" = $1`,
        [recordId],
      ),
    ).toEqual([{ difference: '8040' }]);
    await db.as('adms_readonly');
    expect((await db.refused(`SELECT "id" FROM "synced_record"`)).code).toBe(refusedBy.grant);
    await db.administer();
    expect(
      await db.rows(
        `SELECT "operation"::text, "domain"::text, "actor_id"::text AS actor, "source"::text,
                "device_id"::text AS device, "new_value" ->> 'answer' AS answer
         FROM "audit_record" WHERE "table_name" = 'synced_record'`,
      ),
    ).toEqual([
      {
        operation: 'INSERT',
        domain: 'RECORDS',
        actor: world.monitor,
        source: 'DEVICE',
        device: world.device,
        answer: 'SAVED',
      },
    ]);
  });
});

// A collection that names a project the server doesn't have, as Ana's phone sent it.
const sent = {
  record: 'FIELD_EVENT',
  fieldEvent: {
    id: '0199c2d4-1a00-7000-8000-000000101022',
    projectId: nothingThere,
    monitorId: '0199c2d4-1a00-7000-8000-00000000a11a',
    kind: 'COLLECTION',
    ticketNumber: '101022',
    address: '22 Elm St',
  },
};

const namesNoRecord =
  'Not saved: this record names something the server doesn’t have: its project, its monitor, its assignment, or something picked from a list.';

function heldLike(syncId: string, more: Row = {}): Row {
  const payload = JSON.stringify(sent);
  return {
    device_id: tested.world.device,
    sync_id: syncId,
    sent_id: sent.fieldEvent.id,
    project_id: tested.world.p1,
    sent_monitor_id: tested.world.monitor,
    payload,
    sent_sha256: fingerprintOf(payload),
    reason: 'NAMES_NO_RECORD',
    message: namesNoRecord,
    received_at: '2026-10-13T21:00:01Z',
    ...more,
  };
}

async function held(syncId: string, more: Row = {}): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf('held_record', heldLike(syncId, more))))
    .id;
}

// Whatever stood in a record's place, with its own fingerprint.
const standing = (payload: string): Row => ({ payload, sent_sha256: fingerprintOf(payload) });

describe('a record the server could not save, held for a person', () => {
  it('AC-05-46 is kept exactly as sent, under an id of its own: the phone, the sync, the reason, what the phone was told, when it was received, and the record’s own id, project and monitor only as it said them', async () => {
    const { db, world } = tested;
    expect(await columnsOf('held_record')).toEqual([
      'device_id',
      'id',
      'message',
      'payload',
      'project_id',
      'reason',
      'received_at',
      'resolution',
      'resolved_at',
      'resolved_by_id',
      'sent_id',
      'sent_monitor_id',
      'sent_sha256',
      'sync_id',
    ]);
    await forThePhone();
    const sync = await synced();
    // The project and the monitor it names are nobody the server has: neither is refused.
    const id = await held(sync, {
      project_id: sent.fieldEvent.projectId,
      sent_monitor_id: sent.fieldEvent.monitorId,
    });
    expect(id).not.toBe(sent.fieldEvent.id);
    expect(
      await db.one(
        `SELECT "device_id"::text AS device, "sync_id"::text AS sync, "sent_id"::text AS sent,
                "project_id"::text AS project, "sent_monitor_id"::text AS monitor, "payload",
                "sent_sha256" AS fingerprint, "reason"::text, "message", "received_at",
                num_nonnulls("resolved_by_id", "resolved_at", "resolution") AS resolved
         FROM "held_record" WHERE "id" = $1`,
        [id],
      ),
    ).toEqual({
      device: world.device,
      sync,
      sent: sent.fieldEvent.id,
      project: nothingThere,
      monitor: sent.fieldEvent.monitorId,
      payload: sent,
      fingerprint: fingerprintOf(JSON.stringify(sent)),
      reason: 'NAMES_NO_RECORD',
      message: namesNoRecord,
      received_at: new Date('2026-10-13T21:00:01Z'),
      resolved: 0,
    });
  });

  it('whatever stood in a record’s place is held, a record or not: an object, a list, words, a number, nothing at all; with no id, project or monitor where none could be read', async () => {
    const { db } = tested;
    await forThePhone();
    const sync = await synced();
    const unread = {
      sent_id: null,
      project_id: null,
      sent_monitor_id: null,
      reason: 'NOT_A_RECORD',
    };
    for (const payload of ['{"record":"TICKET"}', '[1,2]', '"101022"', '7', 'true', 'null']) {
      await held(sync, { ...unread, ...standing(payload) });
    }
    expect(
      (
        await db.rows<{ kind: string }>(
          `SELECT jsonb_typeof("payload") AS kind FROM "held_record" ORDER BY "id"`,
        )
      ).map((row) => row.kind),
    ).toEqual(['object', 'array', 'string', 'number', 'boolean', 'null']);
    // What was sent is always there, as JSON: never left out.
    expect(
      (await db.refused(...insertOf('held_record', heldLike(sync, { ...unread, payload: null }))))
        .code,
    ).toBe(refusedBy.notNull);
  });

  it('the same thing sent again by the same phone is the same held record, in that sync or a later one; another phone’s is its own, and so is the same record sent with anything changed', async () => {
    const { db, world } = tested;
    await forThePhone();
    const first = await synced();
    const later = await synced({
      started_at: '2026-10-13T21:30:00Z',
      clock_difference_seconds: 6240,
    });
    await held(first);
    for (const sync of [first, later]) {
      expect((await db.refused(...insertOf('held_record', heldLike(sync)))).code).toBe(
        refusedBy.unique,
      );
    }
    // The same record with another address is another thing sent.
    const changed = JSON.stringify({
      ...sent,
      fieldEvent: { ...sent.fieldEvent, address: '24 Elm St' },
    });
    await held(later, standing(changed));
    await forThePhone(world.certifyingDevice);
    const theirs = await synced({ device_id: world.certifyingDevice });
    await held(theirs, { device_id: world.certifyingDevice });
    await db.administer();
    expect(await db.one(`SELECT count(*)::int AS held FROM "held_record"`)).toEqual({ held: 3 });
  });

  it('its reason is one of the domain’s; what the phone was told is words; its fingerprint is a SHA-256; its sync is there and is that phone’s', async () => {
    const { db, world } = tested;
    expect(
      (
        await db.rows<{ reason: string }>(
          `SELECT enumlabel::text AS reason FROM pg_enum
           WHERE enumtypid = 'not_saved_reason'::regtype ORDER BY enumsortorder`,
        )
      ).map((row) => row.reason),
    ).toEqual([...heldReasons]);
    await forThePhone();
    const sync = await synced();
    const tried = (more: Row): Promise<string> =>
      refusal(...insertOf('held_record', heldLike(sync, more)));
    expect(await tried({ reason: 'DUPLICATE_FIELD_EVENT' })).toBe(refusedBy.badValue);
    for (const message of ['', '   ']) {
      expect(await tried({ message })).toBe(check('held_record_message_check'));
    }
    const fingerprint = fingerprintOf(JSON.stringify(sent));
    for (const sha of [
      '',
      'sha256',
      fingerprint.slice(1),
      `${fingerprint}0`,
      fingerprint.toUpperCase(),
    ]) {
      expect(await tried({ sent_sha256: sha }), sha).toBe(check('held_record_sent_sha256_check'));
    }
    expect(await refusal(...insertOf('held_record', heldLike(nothingThere)))).toBe(
      refusedBy.foreignKey,
    );
    await forThePhone(world.certifyingDevice);
    const theirs = await synced({ device_id: world.certifyingDevice });
    await forThePhone();
    expect(await refusal(...insertOf('held_record', heldLike(theirs)))).toBe(refusedBy.foreignKey);
    for (const reason of notSavedReasons) {
      await held(sync, { reason, ...standing(JSON.stringify({ ...sent, reason })) });
    }
  });

  it('is written only for the phone it names, when that phone syncs: not from the back office, not for another phone, and never by the worker, which reads none', async () => {
    const { db, world } = tested;
    await forThePhone();
    const sync = await synced();
    const add = insertOf('held_record', heldLike(sync));
    await asTheBackOffice();
    expect(await db.refused(...add)).toEqual(stateThePhone('held_record'));
    await db.actor(world.admin, 'BACK_OFFICE', { deviceId: world.device });
    expect(await db.refused(...add)).toEqual(stateThePhone('held_record'));
    await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.certifyingDevice });
    expect(await db.refused(...add)).toEqual(stateThePhone('held_record'));
    await db.actor(world.monitor, 'DEVICE');
    expect(await db.refused(...add)).toEqual(stateThePhone('held_record'));
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await db.refused(...add)).code).toBe(refusedBy.grant);
    expect((await db.refused(`SELECT "id" FROM "held_record"`)).code).toBe(refusedBy.grant);
    await forThePhone();
    await db.one(...add);
  });

  it('nobody can delete it, and what the phone sent can’t be changed by anyone', async () => {
    const { db, world } = tested;
    await forThePhone();
    const sync = await synced();
    const later = await synced({
      started_at: '2026-10-13T21:30:00Z',
      clock_difference_seconds: 6240,
    });
    const id = await held(sync);
    await db.administer();
    for (const login of ['adms_api', 'adms_worker', 'adms_owner'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      const deleted = await db.refused(`DELETE FROM "held_record" WHERE "id" = $1`, [id]);
      expect([refusedBy.grant, refusedBy.trigger], `${login} delete`).toContain(deleted.code);
      await db.administer();
    }
    // A photograph's foreign key names it, so a truncate must cascade to get as far as the
    // trigger, which refuses it (ADR-526 (4)).
    await db.as('adms_owner');
    expect((await db.refused(`TRUNCATE "held_record" CASCADE`)).code).toBe(refusedBy.trigger);
    await db.administer();
    for (const login of ['adms_api', 'adms_owner'] as const) {
      await db.as(login);
      await db.actor(world.admin, 'BACK_OFFICE');
      for (const [column, value] of [
        ['id', nothingThere],
        ['device_id', world.certifyingDevice],
        ['sync_id', later],
        ['sent_id', null],
        ['project_id', world.p2],
        ['sent_monitor_id', world.certifier],
        ['payload', '{"record":"ROE"}'],
        ['sent_sha256', fingerprintOf('another')],
        ['reason', 'NOT_A_RECORD'],
        ['message', 'Saved.'],
        ['received_at', '2026-10-14T00:00:00Z'],
      ] as const) {
        const changed = await db.refused(
          `UPDATE "held_record" SET "${column}" = $2 WHERE "id" = $1`,
          [id, value],
        );
        expect(changed.code, `${login} ${column}`).toBe(refusedBy.trigger);
      }
      await db.administer();
    }
    expect(await db.one(`SELECT "payload", "message" FROM "held_record"`)).toEqual({
      payload: sent,
      message: namesNoRecord,
    });
  });

  it('only its resolution is written later: who, when and what, all three, by a person through the API; never the system actor, the master passcode’s or the device key’s; audited without a second copy of what was sent', async () => {
    const { db, world } = tested;
    await forThePhone();
    const id = await held(await synced());
    const resolve = `UPDATE "held_record"
      SET "resolved_by_id" = $2, "resolved_at" = $3, "resolution" = $4 WHERE "id" = $1`;
    const at = '2026-10-14T13:05:00Z';
    const words = 'Entered by the back office as ticket 101022.';
    await asTheBackOffice();
    for (const [what, values] of [
      ['no words', [world.admin, at, null]],
      ['blank words', [world.admin, at, '  ']],
      ['nobody', [null, at, words]],
      ['no time', [world.admin, null, words]],
    ] as const) {
      expect(await refusal(resolve, [id, ...values]), what).toBe(
        check('held_record_resolution_check'),
      );
    }
    for (const [actor, named] of [
      [systemActor, 'held_record_resolved_by_check'],
      [masterPasscodeActorId, 'held_record_resolved_by_id_not_master_passcode_check'],
      [deviceKeyActorId, 'held_record_resolved_by_id_not_device_key_check'],
    ] as const) {
      expect(await refusal(resolve, [id, actor, at, words]), named).toBe(check(named));
    }
    expect((await db.refused(resolve, [id, nothingThere, at, words])).code).toBe(
      refusedBy.foreignKey,
    );
    expect(await db.run(resolve, [id, world.admin, at, words])).toBe(1);
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    expect((await db.refused(resolve, [id, world.admin, at, words])).code).toBe(refusedBy.grant);
    await db.administer();
    expect(
      await db.one(
        `SELECT "resolved_by_id"::text AS by, "resolution", "payload" FROM "held_record"`,
      ),
    ).toEqual({ by: world.admin, resolution: words, payload: sent });
    expect(
      await db.rows(
        `SELECT "operation"::text, "domain"::text, "actor_id"::text AS actor, "source"::text,
                "new_value" ->> 'payload' AS payload, "new_value" ->> 'reason' AS reason
         FROM "audit_record" WHERE "table_name" = 'held_record' AND "record_id" = $1
         ORDER BY "id"`,
        [id],
      ),
    ).toEqual([
      {
        operation: 'INSERT',
        domain: 'RECORDS',
        actor: deviceKeyActorId,
        source: 'DEVICE',
        payload: keptOut,
        reason: 'NAMES_NO_RECORD',
      },
      {
        operation: 'UPDATE',
        domain: 'RECORDS',
        actor: world.admin,
        source: 'BACK_OFFICE',
        payload: keptOut,
        reason: 'NAMES_NO_RECORD',
      },
    ]);
  });

  it('a client user and an auditor see that a record of their project is held and why; what was sent only where the firm lets them see private citizens; one that names no project of theirs, and a contractor user, nothing', async () => {
    const { db, world } = tested;
    await forThePhone();
    const sync = await synced();
    const id = await held(sync);
    // Held with no project read, with a project that isn't there, and with P2's.
    for (const [project, address] of [
      [null, '1 Elm St'],
      [nothingThere, '2 Elm St'],
    ] as const) {
      await held(sync, {
        project_id: project,
        ...standing(JSON.stringify({ ...sent, fieldEvent: { ...sent.fieldEvent, address } })),
      });
    }
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
    const waiting = `SELECT "id"::text, "reason"::text, "message" FROM "viewer_held_record"`;
    const asSent = `SELECT "payload" FROM "viewer_held_record_citizen"`;
    for (const viewer of [world.clientViewer, world.auditor]) {
      expect(await reads(viewer, waiting), viewer).toEqual([
        { id, reason: 'NAMES_NO_RECORD', message: namesNoRecord },
      ]);
    }
    expect(await reads(world.clientViewer, asSent)).toEqual([{ payload: sent }]);
    expect(await reads(world.auditor, asSent)).toEqual([]);
    expect(await reads(world.coastlineViewer, waiting)).toEqual([]);
    expect(await reads(world.coastlineViewer, asSent)).toEqual([]);
    // No viewer reads what was sent from the table, or from the view every viewer reads.
    await db.viewer(world.clientViewer);
    await db.as('adms_readonly');
    for (const sql of [`SELECT "payload" FROM "held_record"`, `SELECT * FROM "held_record"`]) {
      expect((await db.refused(sql)).code, sql).toBe(refusedBy.grant);
    }
    // 42703: the view has no such column.
    expect((await db.refused(`SELECT "payload" FROM "viewer_held_record"`)).code).toBe('42703');
  });
});

describe('what a sync held, resolved (ADR-526)', () => {
  const resolve = `UPDATE "held_record"
    SET "resolved_by_id" = $2, "resolved_at" = $3, "resolution" = $4 WHERE "id" = $1`;
  const at = '2026-10-14T13:05:00Z';
  const words = 'Closed, never to be saved: what was sent stays here, with its photographs.';

  it('AC-10-75 a held record is resolved once, from the back office, by the person it names: never from a phone, never naming another, never a second time', async () => {
    const { db, world } = tested;
    await forThePhone();
    const id = await held(await synced());
    const refusedAs = async (what: string, values: readonly unknown[], code: string) => {
      const refusal = await db.refused(resolve, [id, ...values]);
      expect(refusal.code, what).toBe(code);
      return refusal.message;
    };
    // From the phone, naming the person: not the back office.
    await db.actor(deviceKeyActorId, 'DEVICE', { deviceId: world.device });
    expect(await refusedAs('from a phone', [world.admin, at, words], refusedBy.grant)).toContain(
      'resolved by a person at the back office, who is named on it',
    );
    // Ana herself, from her phone, naming herself: still no back office.
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    expect(
      await refusedAs(
        'from a phone, by the person named',
        [world.monitor, at, words],
        refusedBy.grant,
      ),
    ).toContain('resolved by a person at the back office');
    // Dana in the back office, naming Ana.
    await asTheBackOffice();
    expect(
      await refusedAs('naming another', [world.monitor, at, words], refusedBy.grant),
    ).toContain('who is named on it');
    expect(await db.run(resolve, [id, world.admin, at, words])).toBe(1);
    // Written again as it is, nothing changes; written as anything else, refused.
    expect(await db.run(resolve, [id, world.admin, at, words])).toBe(1);
    for (const [what, values] of [
      ['another time', [world.admin, '2026-10-14T14:00:00Z', words]],
      ['other words', [world.admin, at, 'Saved as corrected.']],
      ['another person', [world.monitor, at, words]],
    ] as const) {
      expect(await refusedAs(what, values, refusedBy.trigger)).toContain('resolved once');
    }
    expect(
      (await db.refused(`UPDATE "held_record" SET "resolution" = NULL WHERE "id" = $1`, [id])).code,
      'taken back',
    ).toBe(refusedBy.check);
    expect(
      await db.one(`SELECT "resolved_by_id"::text AS by, "resolution" FROM "held_record"`),
    ).toEqual({ by: world.admin, resolution: words });
  });

  it('AC-10-76 a held record comes with no sync only for a report made to its own endpoint: any other is held with the sync that brought it', async () => {
    const { db } = tested;
    await forThePhone();
    const report = (said: string): string =>
      JSON.stringify({ id: sent.fieldEvent.id, use: 'SWITCH_MONITOR', said });
    const noSync = (reason: string) =>
      insertOf('held_record', {
        ...heldLike(nothingThere, { ...standing(report(reason)), reason }),
        sync_id: null,
      });
    for (const reason of notSavedReasons) {
      expect(await refusal(...noSync(reason)), reason).toBe(check('held_record_sync_check'));
    }
    const kept = await db.one<{ id: string }>(...noSync('REPORT_NOT_SAVED'));
    expect(
      await db.one(`SELECT "sync_id", "reason"::text FROM "held_record" WHERE "id" = $1`, [
        kept.id,
      ]),
    ).toEqual({ sync_id: null, reason: 'REPORT_NOT_SAVED' });
    await held(await synced(), { reason: 'REPORT_NOT_SAVED', ...standing(report('at a sync')) });
  });

  it('AC-10-74 a photograph is kept with a record held from its own phone, of its own project, while it waits, and leaves it only for the record a person saved from it under the id its phone made', async () => {
    const { db, world } = tested;
    await forThePhone();
    const sync = await synced();
    const waiting = await held(sync);
    const photo = (more: Row) => phoneInsertOf('photo', photoLike(world, {}, more));
    const keptWith = (heldId: string, more: Row = {}) => photo({ held_record_id: heldId, ...more });
    const notKept =
      'A photograph is kept with a record held from its own phone, of its own project, while it waits';
    // Ana's phone, which sent it.
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    const { id: kept } = await db.one<{ id: string }>(...keptWith(waiting));
    // A certification's photograph kept with it while it is held keeps its view (AC-04-78:
    // otherwise only a certification's photograph has one).
    await db.one(...keptWith(waiting, { view: 'LEFT' }));
    for (const [what, more] of [
      ['another phone’s', { device_id: world.certifyingDevice }],
      ['another project’s', { project_id: world.p2 }],
    ] as const) {
      const refused = await db.refused(...keptWith(waiting, more));
      expect(refused.code, what).toBe(refusedBy.foreignKey);
      expect(refused.message, what).toContain(notKept);
    }
    // One that names no project of ours is no project's photograph's.
    await forThePhone();
    const nowhere = await held(sync, { project_id: null, ...standing('{"nowhere":1}') });
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    expect((await db.refused(...keptWith(nowhere))).message).toContain(notKept);

    // Moved before a person resolved it: refused.
    const moveTo = (owner: Row, photoId = kept): [string, unknown[]] => {
      const [column, value] = Object.entries(owner)[0] ?? [];
      return [
        `UPDATE "photo" SET "held_record_id" = NULL, "${String(column)}" = $2 WHERE "id" = $1`,
        [photoId, value],
      ];
    };
    await asTheBackOffice();
    const savedAs = sent.fieldEvent.id;
    await db.one(
      ...insertOf('field_event', {
        ...fieldEventLike(world, { ticket_number: '101022' }),
        id: savedAs,
      }),
    );
    const leaves = 'A photograph leaves a held record only for the record a person saved from it';
    expect((await db.refused(...moveTo({ field_event_id: savedAs }))).message).toContain(leaves);
    expect(await db.run(resolve, [waiting, world.admin, at, 'Saved as corrected.'])).toBe(1);
    // Resolved: still never to another record than the one of the id its phone made.
    const another = (
      await db.one<{ id: string }>(
        ...insertOf('field_event', {
          ...fieldEventLike(world, { ticket_number: '101023' }),
          id: '0199c2d4-1a00-7000-8000-000000101023',
        }),
      )
    ).id;
    expect((await db.refused(...moveTo({ field_event_id: another }))).message).toContain(leaves);
    expect(await db.run(...moveTo({ field_event_id: savedAs }))).toBe(1);
    // Once a photograph of a record, it is never put onto a held one.
    const refused = await db.refused(
      `UPDATE "photo" SET "field_event_id" = NULL, "held_record_id" = $2 WHERE "id" = $1`,
      [kept, nowhere],
    );
    expect(refused.code).toBe(refusedBy.trigger);
    expect(refused.message).toContain('only when it is kept');
    // Nor is one kept with a record already resolved.
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    expect((await db.refused(...keptWith(waiting))).message).toContain(notKept);
    expect(
      await db.one(
        `SELECT "field_event_id"::text AS event, "held_record_id" FROM "photo" WHERE "id" = $1`,
        [kept],
      ),
    ).toEqual({ event: savedAs, held_record_id: null });
  });
});
