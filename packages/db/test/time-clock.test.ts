// The time clock's records (spec/acceptance/02-people-and-devices.md AC-02-50, 53, 54, 55;
// spec/DATA-MODEL.md §3, "The time clock"; ADR-063, 100, 241, 598; REQ-310). A worker's entries and
// the activity lines their clock-out carries are evidence, their own word from their phone; a
// manager's approval of the day locks it until it is unlocked. Nothing relates any of it to crew
// time. The example world's Ana Brooks clocks in on her phone P1-COL-1, under her assignment on
// P1 for Tuesday 13 October 2026; Dana Reyes approves her day.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

type Row = Record<string, unknown>;

const locked = 'The day is approved: its time clock is locked until it is unlocked';

// As the API's login, for Ana's phone at sync.
async function asAnasPhone(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
}

// As the API's login, for Dana in the back office.
async function asDana(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

// An entry as Ana's phone sends it: 06:00 in Bayline County (UTC−4), a clock-in.
function entryLike(more: Row = {}): Row {
  const { world } = tested;
  return {
    id: crypto.randomUUID(),
    project_id: world.p1,
    assignment_id: world.assignments.p1,
    worker_id: world.monitor,
    device_id: world.device,
    kind: 'IN',
    at: '2026-10-13T10:00:00Z',
    device_utc_offset_minutes: -240,
    ...more,
  };
}

async function entered(table: string, row: Row): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf(table, row))).id;
}

async function refusal(table: string, row: Row): Promise<string> {
  const { code, message } = await tested.db.refused(...insertOf(table, row));
  const named = /constraint "([^"]+)"/.exec(message);
  return named ? `${code} ${String(named[1])}` : code;
}

async function travel(): Promise<string> {
  return (
    await tested.db.one<{ id: string }>(
      `SELECT "id"::text AS id FROM "clock_activity" WHERE "name" = 'Travel'`,
    )
  ).id;
}

// Ana's clock-out at 18:50, and the line it carries: travel from 18:20 to 18:50.
async function clockedOut(): Promise<{ out: string; line: string }> {
  const out = await entered('clock_entry', entryLike({ kind: 'OUT', at: '2026-10-13T22:50:00Z' }));
  const line = await entered('clock_activity_line', {
    clock_entry_id: out,
    clock_entry_kind: 'OUT',
    position: 1,
    started_at: '2026-10-13T22:20:00Z',
    ended_at: '2026-10-13T22:50:00Z',
    activity_id: await travel(),
  });
  return { out, line };
}

async function approved(): Promise<string> {
  const { world } = tested;
  await asDana();
  return entered('day_approval', {
    project_id: world.p1,
    assignment_id: world.assignments.p1,
    approved_by_id: world.admin,
  });
}

describe('a worker’s entries and activity lines (AC-02-50)', () => {
  it('Ana clocks in, takes a break and clocks out on her phone, under her assignment: each audited with her as its actor', async () => {
    const { db, world } = tested;
    await asAnasPhone();
    const ids: string[] = [];
    for (const [kind, at] of [
      ['IN', '2026-10-13T10:00:00Z'],
      ['BREAK_START', '2026-10-13T17:00:00Z'],
      ['BREAK_END', '2026-10-13T17:30:00Z'],
    ] as const) {
      ids.push(await entered('clock_entry', entryLike({ kind, at })));
    }
    const { out, line } = await clockedOut();
    await db.administer();
    const audited = await db.rows<{ table_name: string; actor_id: string }>(
      `SELECT "table_name", "actor_id"::text FROM "audit_record"
       WHERE "record_id" = ANY($1::text[]) ORDER BY "id"`,
      [[...ids, out, line]],
    );
    expect(audited.map((one) => one.table_name)).toEqual([
      'clock_entry',
      'clock_entry',
      'clock_entry',
      'clock_entry',
      'clock_activity_line',
    ]);
    expect(new Set(audited.map((one) => one.actor_id))).toEqual(new Set([world.monitor]));
  });

  it('a line pre-filled from a field event names it by the id its phone made, kept whole whether or not that field event is saved', async () => {
    await asAnasPhone();
    const out = await entered('clock_entry', entryLike({ kind: 'OUT' }));
    const line = {
      clock_entry_id: out,
      clock_entry_kind: 'OUT',
      position: 1,
      started_at: '2026-10-13T11:10:00Z',
      ended_at: '2026-10-13T11:40:00Z',
      field_event_id: crypto.randomUUID(),
      note: 'Collection on Pelican Way',
    };
    expect(await entered('clock_activity_line', line)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('written only as the worker, from the phone the entry names', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.certifier, 'DEVICE', { deviceId: world.device });
    expect(await refusal('clock_entry', entryLike())).toBe(refusedBy.grant);
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.certifyingDevice });
    expect(await refusal('clock_entry', entryLike())).toBe(refusedBy.grant);
    // From the back office, naming the phone: still not the phone's own.
    await db.actor(world.monitor, 'BACK_OFFICE', { deviceId: world.device });
    expect(await refusal('clock_entry', entryLike())).toBe(refusedBy.grant);
    // A line as somebody other than its entry's worker.
    await asAnasPhone();
    const out = await entered('clock_entry', entryLike({ kind: 'OUT' }));
    await db.actor(world.certifier, 'DEVICE', { deviceId: world.device });
    expect(
      await refusal('clock_activity_line', {
        clock_entry_id: out,
        clock_entry_kind: 'OUT',
        position: 1,
        started_at: '2026-10-13T22:20:00Z',
        ended_at: '2026-10-13T22:50:00Z',
        activity_id: await travel(),
      }),
    ).toBe(refusedBy.grant);
  });

  it('whose hours they are is the assignment’s own person, of its own project', async () => {
    const { world } = tested;
    await asAnasPhone();
    // Sam's assignment, with Ana as the worker.
    expect(
      await refusal('clock_entry', entryLike({ assignment_id: world.certifyingAssignments.p1 })),
    ).toBe(`${refusedBy.foreignKey} clock_entry_project_id_assignment_id_worker_id_fkey`);
    // Her P2 assignment, said to be P1's.
    expect(await refusal('clock_entry', entryLike({ assignment_id: world.assignments.p2 }))).toBe(
      `${refusedBy.foreignKey} clock_entry_project_id_assignment_id_worker_id_fkey`,
    );
  });

  it('an offset a clock can have', async () => {
    await asAnasPhone();
    for (const offset of [-721, 841]) {
      expect(await refusal('clock_entry', entryLike({ device_utc_offset_minutes: offset }))).toBe(
        `${refusedBy.check} clock_entry_device_utc_offset_check`,
      );
    }
    expect(
      await entered('clock_entry', entryLike({ device_utc_offset_minutes: 840 })),
    ).toBeTruthy();
  });

  it('a line is carried by a clock-out, and is one thing: an activity of the firm’s list or a field event', async () => {
    await asAnasPhone();
    const clockIn = await entered('clock_entry', entryLike());
    const out = await entered('clock_entry', entryLike({ kind: 'OUT' }));
    const activity = await travel();
    const line = {
      clock_entry_id: out,
      clock_entry_kind: 'OUT',
      position: 1,
      started_at: '2026-10-13T22:20:00Z',
      ended_at: '2026-10-13T22:50:00Z',
      activity_id: activity,
    };
    const check = `${refusedBy.check} clock_activity_line_check`;
    // A clock-in's kind said to be OUT: the key holds the kind to the entry's own.
    expect(await refusal('clock_activity_line', { ...line, clock_entry_id: clockIn })).toBe(
      `${refusedBy.foreignKey} clock_activity_line_clock_entry_id_clock_entry_kind_fkey`,
    );
    expect(
      await refusal('clock_activity_line', {
        ...line,
        clock_entry_id: clockIn,
        clock_entry_kind: 'IN',
      }),
    ).toBe(check);
    expect(
      await refusal('clock_activity_line', { ...line, field_event_id: crypto.randomUUID() }),
    ).toBe(check);
    expect(await refusal('clock_activity_line', { ...line, activity_id: null })).toBe(check);
    expect(await refusal('clock_activity_line', { ...line, position: 0 })).toBe(check);
    expect(await refusal('clock_activity_line', { ...line, note: '  ' })).toBe(check);
    expect(await entered('clock_activity_line', line)).toBeTruthy();
    expect(await refusal('clock_activity_line', line)).toBe(
      `${refusedBy.unique} clock_activity_line_clock_entry_id_position_key`,
    );
  });

  it('what an entry is of, and when the server received it, never change; nor which clock-out carried a line', async () => {
    const { db } = tested;
    await asAnasPhone();
    const { out, line } = await clockedOut();
    const clockIn = await entered('clock_entry', entryLike());
    await asDana();
    for (const [column, value] of [
      ['kind', 'IN'],
      ['device_id', tested.world.certifyingDevice],
    ] as const) {
      const { code, message } = await db.refused(
        `UPDATE "clock_entry" SET "${column}" = $1 WHERE "id" = $2`,
        [value, out],
      );
      expect([code, message], column).toEqual([
        refusedBy.trigger,
        'What a time-clock entry is of never changes',
      ]);
    }
    const received = await db.refused(
      `UPDATE "clock_entry" SET "received_at" = now() - interval '1 hour' WHERE "id" = $1`,
      [out],
    );
    expect(received.code).toBe(refusedBy.grant);
    const moved = await db.refused(
      `UPDATE "clock_activity_line" SET "clock_entry_id" = $1, "clock_entry_kind" = 'IN' WHERE "id" = $2`,
      [clockIn, line],
    );
    expect([moved.code, moved.message]).toEqual([
      refusedBy.trigger,
      'Which clock-out carried an activity line never changes',
    ]);
    // Its time and its note are evidence, corrected in place as any is.
    expect(
      await db.run(`UPDATE "clock_entry" SET "at" = $1 WHERE "id" = $2`, [
        '2026-10-13T22:55:00Z',
        out,
      ]),
    ).toBe(1);
  });
});

describe('a manager approves the day (AC-02-53)', () => {
  it('Dana approves Ana’s day; one approval in force; unlocked with who, when and why, and approved again as a new one', async () => {
    const { db, world } = tested;
    const first = await approved();
    expect(
      await refusal('day_approval', {
        project_id: world.p1,
        assignment_id: world.assignments.p1,
        approved_by_id: world.admin,
      }),
    ).toBe(`${refusedBy.exclusion} day_approval_approved_once`);
    const half = await db.refused(
      `UPDATE "day_approval" SET "unlocked_by_id" = $1, "unlocked_at" = now() WHERE "id" = $2`,
      [world.admin, first],
    );
    expect(half.message).toMatch(/day_approval_unlock_check/);
    expect(
      await db.run(
        `UPDATE "day_approval" SET "unlocked_by_id" = $1, "unlocked_at" = now(), "unlock_note" = $2 WHERE "id" = $3`,
        [world.admin, 'Clock-out was 19:50, not 18:50', first],
      ),
    ).toBe(1);
    const again = await db.refused(
      `UPDATE "day_approval" SET "unlock_note" = 'Another reason' WHERE "id" = $1`,
      [first],
    );
    expect(again.code).toBe(refusedBy.trigger);
    expect(await approved()).not.toBe(first);
  });

  it('what was approved, by whom and when, never changes', async () => {
    const { db, world } = tested;
    const approval = await approved();
    const { code } = await db.refused(
      `UPDATE "day_approval" SET "approved_by_id" = $1 WHERE "id" = $2`,
      [world.monitor, approval],
    );
    expect(code).toBe(refusedBy.trigger);
  });

  it('nobody approves their own day: a person, never the system actor', async () => {
    const { db, world } = tested;
    await asDana();
    const day = { project_id: world.p1, assignment_id: world.assignments.p1 };
    const { code, message } = await db.refused(
      ...insertOf('day_approval', { ...day, approved_by_id: world.monitor }),
    );
    expect([code, message]).toEqual([refusedBy.check, 'Nobody approves their own day']);
    expect(await refusal('day_approval', { ...day, approved_by_id: world.worker })).toBe(
      `${refusedBy.check} day_approval_approved_by_check`,
    );
  });

  it('an approved day is locked: nothing of its entries or lines changes until it is unlocked; a phone’s entry arriving after is still taken', async () => {
    const { db, world } = tested;
    await asAnasPhone();
    const { out, line } = await clockedOut();
    const approval = await approved();
    for (const [table, id] of [
      ['clock_entry', out],
      ['clock_activity_line', line],
    ] as const) {
      const column = table === 'clock_entry' ? 'at' : 'ended_at';
      const { code, message } = await db.refused(
        `UPDATE "${table}" SET "${column}" = $1 WHERE "id" = $2`,
        ['2026-10-13T23:50:00Z', id],
      );
      expect([code, message], table).toEqual([refusedBy.check, locked]);
    }
    await asAnasPhone();
    expect(
      await entered('clock_entry', entryLike({ kind: 'IN', at: '2026-10-13T23:00:00Z' })),
    ).toBeTruthy();
    await asDana();
    await db.run(
      `UPDATE "day_approval" SET "unlocked_by_id" = $1, "unlocked_at" = now(), "unlock_note" = 'Fixing the clock-out' WHERE "id" = $2`,
      [world.admin, approval],
    );
    expect(
      await db.run(`UPDATE "clock_entry" SET "at" = $1 WHERE "id" = $2`, [
        '2026-10-13T23:50:00Z',
        out,
      ]),
    ).toBe(1);
  });
});

describe('a closed project (ADR-529 (b))', () => {
  it('takes no entry, no line and no approval: nothing in it is written, changed or taken away', async () => {
    const { db, world } = tested;
    await asAnasPhone();
    const out = await entered('clock_entry', entryLike({ kind: 'OUT' }));
    await db.administer();
    await db.run(`UPDATE "project" SET "closed_at" = now() WHERE "id" = $1`, [world.p1]);
    const closed = 'The project is closed: nothing in it is written, changed or taken away';
    await asAnasPhone();
    for (const [table, row] of [
      ['clock_entry', entryLike()],
      [
        'clock_activity_line',
        {
          clock_entry_id: out,
          clock_entry_kind: 'OUT',
          position: 1,
          started_at: '2026-10-13T22:20:00Z',
          ended_at: '2026-10-13T22:50:00Z',
          activity_id: await travel(),
        },
      ],
    ] as const) {
      const { message } = await db.refused(...insertOf(table, row));
      expect(message, table).toBe(closed);
    }
    await asDana();
    const { message } = await db.refused(
      ...insertOf('day_approval', {
        project_id: world.p1,
        assignment_id: world.assignments.p1,
        approved_by_id: world.admin,
      }),
    );
    expect(message).toBe(closed);
  });
});

describe('never related to crew time, and never seen by a viewer', () => {
  it('AC-02-54 no key joins the time clock and any field event, its items or their hours, either way', async () => {
    const { db } = tested;
    const keys = await db.rows<{ from_table: string; to_table: string }>(
      `SELECT conrelid::regclass::text AS from_table, confrelid::regclass::text AS to_table
       FROM pg_constraint WHERE contype = 'f'
         AND (conrelid::regclass::text IN ('clock_entry', 'clock_activity_line', 'day_approval')
           OR confrelid::regclass::text IN ('clock_entry', 'clock_activity_line', 'day_approval'))
`,
    );
    const named = (key: { from_table: string; to_table: string }): string =>
      `${key.from_table} → ${key.to_table}`;
    expect(keys.map(named).sort()).toEqual(
      [
        { from_table: 'clock_activity_line', to_table: 'clock_activity' },
        { from_table: 'clock_activity_line', to_table: 'clock_entry' },
        { from_table: 'clock_entry', to_table: 'assignment' },
        { from_table: 'clock_entry', to_table: 'device' },
        { from_table: 'clock_entry', to_table: 'project' },
        { from_table: 'clock_entry', to_table: '"user"' },
        { from_table: 'day_approval', to_table: 'assignment' },
        { from_table: 'day_approval', to_table: 'project' },
        { from_table: 'day_approval', to_table: '"user"' },
        { from_table: 'day_approval', to_table: '"user"' },
      ]
        .map(named)
        .sort(),
    );
    const crewTime = await db.rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('clock_entry', 'clock_activity_line', 'day_approval')
         AND (column_name LIKE '%item%' OR column_name LIKE '%hours%' OR column_name LIKE '%quantity%'
           OR column_name LIKE '%rate%' OR column_name LIKE '%amount%' OR column_name LIKE '%pay%')`,
    );
    expect(crewTime).toEqual([]);
  });

  it('AC-02-55 an entry is the phone’s clock as a UTC instant with its offset; no limit on hours is held', async () => {
    const { db } = tested;
    const checks = await db.rows<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE contype = 'c' AND conrelid::regclass::text IN ('clock_entry', 'clock_activity_line')`,
    );
    expect(checks.some((check) => /\bat\b|started_at|ended_at/.test(check.definition))).toBe(false);
  });

  it('no read-only viewer reads anyone’s hours (ADR-241 (8))', async () => {
    const { db, world } = tested;
    await asAnasPhone();
    await clockedOut();
    await approved();
    await db.as('adms_readonly');
    for (const viewer of [world.clientViewer, world.auditor, world.coastlineViewer]) {
      await db.viewer(viewer);
      for (const table of ['clock_entry', 'clock_activity_line', 'day_approval']) {
        const { code } = await db.refused(`SELECT count(*) FROM "${table}"`);
        expect(code, `${table} for ${viewer}`).toBe(refusedBy.grant);
      }
    }
  });
});
