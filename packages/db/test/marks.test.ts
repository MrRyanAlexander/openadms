// People's marks: the QC status, the invoice lock with its unlock and its batch, a flag's
// acceptance and a person's void, and what the database holds and refuses by itself whoever
// writes (spec/acceptance/08-review-and-corrections.md AC-08-09, 33, 48, 49, 53, 55…59;
// 09-invoice-deliver-closeout.md AC-09-01, 07, 09, 10, 17; 03-certification.md AC-03-38;
// 04-field-capture.md AC-04-90; spec/DATA-MODEL.md §6, §8; ADR-057, 107, 121, 166, 168, 228, 245,
// 363; invariants 1, 3, 4, 5; BACKLOG C16, C17, C19, C76, C77; REQ-105h, 105m, 107). The services
// that set them are tasks 1.8.3…1.8.5's: here a test writes, as the API's login for the person,
// the rows a service will. In the examples Luis Ortega reviews, QCs and locks, and Dana Reyes
// unlocks (the golden mission §4).
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import {
  eventInsertOf,
  fieldEventLike,
  formLike,
  given,
  insertOf,
  phoneInsertOf,
  roeLike,
  transactionLike,
  viewerLike,
} from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';
import { PricedTickets } from './support/priced-tickets.ts';

const tested = eachTestRolledBack();
const tickets = new PricedTickets(tested);

type Row = Record<string, unknown>;

const systemActor = '00000000-0000-7000-8000-000000000001';
const nobody = '00000000-0000-7000-8000-00000000dead';
const wednesday = '2026-10-14T13:00:00Z';
const marks = ['qc_mark', 'invoice_batch', 'invoice_lock', 'flag_acceptance', 'ticket_void'];

// Luis Ortega, manager/analyst, as Dana adds him.
async function luis(): Promise<string> {
  await tickets.asTheBackOffice();
  return tickets.add('user', { name: 'Luis Ortega', role: 'MANAGER_ANALYST' });
}

// As the API's login, for a person in the back office.
async function actingAs(person: string): Promise<void> {
  const { db } = tested;
  await db.as('adms_api');
  await db.actor(person, 'BACK_OFFICE');
}

async function reason(name: string): Promise<string> {
  await tested.db.administer();
  return (
    await tested.db.one<{ id: string }>(`SELECT "id"::text FROM "reason" WHERE "name" = $1`, [name])
  ).id;
}

// The refusal of a change to one row.
async function refusedChange(table: string, id: string, set: string): Promise<string> {
  return (await tested.db.refused(`UPDATE "${table}" SET ${set} WHERE "id" = $1`, [id])).code;
}

const neverEdited = (table: string): { code: string; message: string } => ({
  code: refusedBy.trigger,
  message: `Open ADMS never edits a ${table} row: a change is a new version`,
});

// A QC mark Luis sets on Wednesday, on P1 unless told.
function qcLike(by: string, target: Row, more: Row = {}): Row {
  return {
    project_id: tested.world.p1,
    status: 'QC_APPROVED',
    set_by_id: by,
    set_at: wednesday,
    ...target,
    ...more,
  };
}

// A lock as invoiced Luis writes on Wednesday, on P1 unless told.
function lockLike(by: string, target: Row, more: Row = {}): Row {
  return {
    project_id: tested.world.p1,
    locked_by_id: by,
    locked_at: wednesday,
    ...target,
    ...more,
  };
}

// The flag on 101001 the worker raised: a load call the tower's photographs bear out.
async function flagOn101001(more: Row = {}): Promise<string> {
  const { world } = tested;
  await tickets.asTheWorker();
  return tickets.add('flag', {
    project_id: world.p1,
    workflow: 'LOAD',
    ticket_number: '101001',
    field_event_id: world.loads.l101001.disposal,
    code: 'LOAD_CALL_HIGH',
    message: 'Ticket 101001: load call 96%. Flagged for review.',
    facts: JSON.stringify({ loadCall: 96, highLimit: 95 }),
    facts_sha256: 'a'.repeat(64),
    billing: 'BILLS',
    raised_at: '2026-10-12T22:00:00Z',
    ...more,
  });
}

function acceptanceLike(by: string, flag: string, reasonId: string, more: Row = {}): Row {
  return {
    project_id: tested.world.p1,
    flag_id: flag,
    reason_id: reasonId,
    accepted_by_id: by,
    accepted_at: wednesday,
    ...more,
  };
}

// Luis's void of unit rate ticket 301002, a duplicate of 301001 (the golden mission §2).
function voidLike(by: string, reasonId: string, more: Row = {}): Row {
  return {
    project_id: tested.world.p1,
    workflow: 'UNIT_RATE',
    ticket_number: '301002',
    reason_id: reasonId,
    voided_by_id: by,
    voided_at: wednesday,
    ...more,
  };
}

async function columnsOf(table: string): Promise<string[]> {
  await tested.db.administer();
  return (
    await tested.db.rows<{ name: string }>(
      `SELECT column_name::text AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table],
    )
  ).map((column) => column.name);
}

// The audit records of one row, oldest first.
async function audited(
  id: string,
): Promise<{ operation: string; actor: string; domain: string; changed: string[] }[]> {
  await tested.db.administer();
  return tested.db.rows(
    `SELECT "operation"::text, "actor_id"::text AS actor, "domain"::text,
       "changed_fields" AS changed
     FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
    [id],
  );
}

describe('a mark is its own record', () => {
  it('AC-08-09, AC-08-59 a QC mark, an acceptance, a void, a lock and a batch are written by the back office’s login, each audited under the person in its domain; the worker reads them and writes none; nobody deletes one', async () => {
    const { db, world } = tested;
    const load = world.loads.l101001;
    const reviewer = await luis();
    const flag = await flagOn101001();
    const photosConfirm = await reason('Photos confirm');
    const duplicate = await reason('Duplicate ticket');
    await actingAs(reviewer);
    const written = {
      qc_mark: await tickets.add(
        'qc_mark',
        qcLike(reviewer, { completed_load_id: load.completedLoad }),
      ),
      invoice_batch: await tickets.add('invoice_batch', {
        project_id: world.p1,
        name: 'Bayline ROW, week of 12 Oct',
        created_by_id: reviewer,
      }),
      invoice_lock: await tickets.add(
        'invoice_lock',
        lockLike(reviewer, { completed_load_id: load.completedLoad }),
      ),
      flag_acceptance: await tickets.add(
        'flag_acceptance',
        acceptanceLike(reviewer, flag, photosConfirm, { note: 'Heaped; photos confirm' }),
      ),
      ticket_void: await tickets.add(
        'ticket_void',
        voidLike(reviewer, duplicate, { note: 'Duplicate of 301001' }),
      ),
    };
    expect(Object.keys(written)).toEqual(marks);
    const domains = {
      qc_mark: 'RECORDS',
      invoice_batch: 'BILLING',
      invoice_lock: 'BILLING',
      flag_acceptance: 'OPERATIONS',
      ticket_void: 'BILLING',
    };
    for (const [table, id] of Object.entries(written)) {
      const [record, ...more] = await audited(id);
      expect({ ...record, changed: undefined, more }, table).toEqual({
        operation: 'INSERT',
        actor: reviewer,
        domain: domains[table as keyof typeof domains],
        changed: undefined,
        more: [],
      });
    }
    // No derived row was touched: the completed load and the flag are as they were written.
    for (const derived of [load.completedLoad, flag]) {
      expect((await audited(derived)).map(({ operation }) => operation)).toEqual(['INSERT']);
    }
    // The worker reads every mark, and can write none of them.
    await tickets.asTheWorker();
    for (const [table, id] of Object.entries(written)) {
      expect(await db.rows(`SELECT 1 FROM "${table}" WHERE "id" = $1`, [id]), table).toHaveLength(
        1,
      );
      expect(await refusedChange(table, id, '"project_id" = "project_id"'), table).toBe(
        refusedBy.grant,
      );
    }
    expect(
      await tickets.refused(
        'qc_mark',
        qcLike(reviewer, { completed_load_id: world.loads.l101002.completedLoad }),
      ),
    ).toBe(refusedBy.grant);
    expect(
      await tickets.refused(
        'invoice_lock',
        lockLike(reviewer, { completed_load_id: world.loads.l101002.completedLoad }),
      ),
    ).toBe(refusedBy.grant);
    expect(await tickets.refused('ticket_void', voidLike(reviewer, duplicate))).toBe(
      refusedBy.grant,
    );
    expect(
      await tickets.refused('flag_acceptance', acceptanceLike(reviewer, flag, photosConfirm)),
    ).toBe(refusedBy.grant);
    expect(await tickets.refused('invoice_batch', { project_id: world.p1, name: 'Another' })).toBe(
      refusedBy.grant,
    );
    // Nobody deletes one: not the API, the owner or the administrator.
    for (const [table, id] of Object.entries(written)) {
      await actingAs(reviewer);
      expect(
        (await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id])).code,
        `${table}, the API`,
      ).toBe(refusedBy.grant);
      for (const who of ['adms_owner', 'administrator'] as const) {
        if (who === 'administrator') await db.administer();
        else await db.as(who);
        expect(await db.refused(`DELETE FROM "${table}" WHERE "id" = $1`, [id]), table).toEqual({
          code: refusedBy.trigger,
          message: `Open ADMS never deletes a ${table} row: archive, close or void it instead`,
        });
      }
    }
  });

  it('AC-08-09 a reprocess that dissolves the completed load and makes it whole again, with another quantity, loses none of its marks', async () => {
    const { db, world } = tested;
    const load = world.loads.l101001;
    const reviewer = await luis();
    await actingAs(reviewer);
    const mark = await tickets.add(
      'qc_mark',
      qcLike(reviewer, { completed_load_id: load.completedLoad }),
    );
    await tickets.asTheWorker();
    for (const set of [
      `"dissolved_at" = '2026-10-14T14:00:00Z'`,
      `"dissolved_at" = NULL, "load_call" = 70, "volume_cy" = 45.50`,
    ]) {
      expect(
        await db.run(`UPDATE "completed_load" SET ${set} WHERE "id" = $1`, [load.completedLoad]),
      ).toBe(1);
    }
    expect(
      await db.rows(
        `SELECT m."id"::text, m."status"::text FROM "completed_load" l
         JOIN "qc_mark" m ON m."completed_load_id" = l."id" WHERE l."ticket_number" = '101001'`,
      ),
    ).toEqual([{ id: mark, status: 'QC_APPROVED' }]);
  });
});

describe('a QC mark', () => {
  it('AC-08-53 a completed load nobody has marked is QC Review; the statuses are four', async () => {
    const { db, world } = tested;
    await db.administer();
    expect(
      await db.rows(
        `SELECT COALESCE(m."status", 'QC_REVIEW')::text AS qc FROM "completed_load" l
         LEFT JOIN "qc_mark" m ON m."completed_load_id" = l."id" WHERE l."id" = $1`,
        [world.loads.l101001.completedLoad],
      ),
    ).toEqual([{ qc: 'QC_REVIEW' }]);
    expect(await db.one(`SELECT enum_range(NULL::qc_status)::text[] AS statuses`)).toEqual({
      statuses: ['QC_REVIEW', 'QC_APPROVED', 'QC_ISSUES', 'QC_VOID'],
    });
  });

  it('AC-08-55 a load’s collection event or disposal event takes no mark, whatever kind the mark says it is; a unit rate ticket’s field event does', async () => {
    const { world } = tested;
    const load = world.loads.l101001;
    const reviewer = await luis();
    const unitRate = await tickets.unitRate301001();
    await actingAs(reviewer);
    for (const [what, event, kind] of [
      ['its collection', load.collection, 'COLLECTION'],
      ['its disposal', load.disposal, 'DISPOSAL'],
    ] as const) {
      expect(
        await tickets.refused('qc_mark', qcLike(reviewer, { field_event_id: event })),
        `${what}, no kind`,
      ).toBe(refusedBy.check);
      expect(
        await tickets.refused(
          'qc_mark',
          qcLike(reviewer, { field_event_id: event, field_event_kind: kind }),
        ),
        `${what}, its own kind`,
      ).toBe(refusedBy.check);
      expect(
        await tickets.refused(
          'qc_mark',
          qcLike(reviewer, { field_event_id: event, field_event_kind: 'UNIT_RATE' }),
        ),
        `${what}, called a unit rate ticket`,
      ).toBe(refusedBy.foreignKey);
    }
    expect(
      await tickets.refused(
        'qc_mark',
        qcLike(reviewer, { completed_load_id: load.completedLoad, field_event_kind: 'UNIT_RATE' }),
      ),
      'a kind with no field event',
    ).toBe(refusedBy.check);
    await tickets.add(
      'qc_mark',
      qcLike(reviewer, { field_event_id: unitRate.fieldEvent, field_event_kind: 'UNIT_RATE' }),
    );
  });

  it('AC-08-56 marks exactly one thing; QC Approved changed to QC Issues is the same mark changed, the status before kept in the audit log; what it marks never changes', async () => {
    const { db, world } = tested;
    const reviewer = await luis();
    const on101001 = { completed_load_id: world.loads.l101001.completedLoad };
    const on730415 = { certification_id: world.certifications.c730415 };
    await actingAs(reviewer);
    expect(await tickets.refused('qc_mark', qcLike(reviewer, {})), 'nothing').toBe(refusedBy.check);
    expect(
      await tickets.refused('qc_mark', qcLike(reviewer, { ...on101001, ...on730415 })),
      'two things',
    ).toBe(refusedBy.check);
    const mark = await tickets.add('qc_mark', qcLike(reviewer, on101001));
    expect(await tickets.refused('qc_mark', qcLike(reviewer, on101001)), 'a second mark').toBe(
      refusedBy.unique,
    );
    await actingAs(world.admin);
    expect(
      await db.run(
        `UPDATE "qc_mark" SET "status" = 'QC_ISSUES', "set_by_id" = $2,
           "set_at" = '2026-10-14T15:00:00Z', "note" = 'Tower photo missing' WHERE "id" = $1`,
        [mark, world.admin],
      ),
    ).toBe(1);
    await db.administer();
    expect(
      await db.rows(
        `SELECT "operation"::text, "actor_id"::text AS actor, "prior_value"->>'status' AS before,
           "new_value"->>'status' AS after
         FROM "audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
        [mark],
      ),
    ).toEqual([
      { operation: 'INSERT', actor: reviewer, before: null, after: 'QC_APPROVED' },
      { operation: 'UPDATE', actor: world.admin, before: 'QC_APPROVED', after: 'QC_ISSUES' },
    ]);
    expect(await db.rows(`SELECT 1 FROM "qc_mark"`)).toHaveLength(1);
    // It stays on what it marks, for every login.
    for (const who of ['adms_api', 'adms_owner'] as const) {
      await db.as(who);
      await db.actor(world.admin, 'BACK_OFFICE');
      for (const set of [
        `"completed_load_id" = '${world.loads.l101002.completedLoad}'`,
        `"completed_load_id" = NULL, "certification_id" = '${world.certifications.c730415}'`,
        `"project_id" = '${world.p2}'`,
        `"field_event_kind" = 'UNIT_RATE'`,
      ]) {
        expect(
          await db.refused(`UPDATE "qc_mark" SET ${set} WHERE "id" = $1`, [mark]),
          `${who}: ${set}`,
        ).toEqual(neverEdited('qc_mark'));
      }
    }
  });

  it('AC-08-56 is set by a person, with its status and its time; a note says something', async () => {
    const { world } = tested;
    const reviewer = await luis();
    const on101001 = { completed_load_id: world.loads.l101001.completedLoad };
    await actingAs(reviewer);
    for (const column of ['project_id', 'status', 'set_by_id', 'set_at']) {
      expect(
        await tickets.refused('qc_mark', qcLike(reviewer, on101001, { [column]: null })),
        column,
      ).toBe(refusedBy.notNull);
    }
    expect(
      await tickets.refused('qc_mark', qcLike(systemActor, on101001)),
      'the system actor',
    ).toBe(refusedBy.check);
    expect(await tickets.refused('qc_mark', qcLike(nobody, on101001)), 'nobody').toBe(
      refusedBy.foreignKey,
    );
    expect(
      await tickets.refused('qc_mark', qcLike(reviewer, on101001, { note: '  ' })),
      'a blank note',
    ).toBe(refusedBy.check);
    expect(
      await tickets.refused('qc_mark', qcLike(reviewer, on101001, { status: 'QC_DONE' })),
      'a status of its own',
    ).toBe(refusedBy.badValue);
    expect(
      await tickets.refused('qc_mark', qcLike(reviewer, on101001, { project_id: nobody })),
      'no such project',
    ).toBe(refusedBy.foreignKey);
  });

  it('AC-08-57 the split haul-out 201004 is QC’d once, as one completed haul-out: a mark has nowhere to name a property or a pile', async () => {
    const reviewer = await luis();
    const haulOut = await tickets.haulOut201004();
    await actingAs(reviewer);
    const on201004 = { completed_haul_out_id: haulOut.completedHaulOut };
    expect(
      await tickets.refused('qc_mark', qcLike(reviewer, on201004, { project_id: tested.world.p2 })),
      'as P2’s',
    ).toBe(refusedBy.foreignKey);
    await tickets.add('qc_mark', qcLike(reviewer, on201004));
    expect(await tickets.refused('qc_mark', qcLike(reviewer, on201004))).toBe(refusedBy.unique);
    expect(await columnsOf('qc_mark')).toEqual([
      'id',
      'project_id',
      'completed_load_id',
      'completed_haul_out_id',
      'field_event_id',
      'field_event_kind',
      'certification_id',
      'roe_id',
      'survey_id',
      'incident_id',
      'drop_off_log_id',
      'status',
      'set_by_id',
      'set_at',
      'note',
    ]);
  });

  it('AC-08-58, AC-03-38, AC-04-90 a unit rate ticket, an incident, a drop-off log, an ROE, its pre-work survey and a certification are each QC’d on their own, once, and only as a record of the mark’s own project; whoever marked 730415 is its “checked by”', async () => {
    const { db, world } = tested;
    const reviewer = await luis();
    const unitRate = await tickets.unitRate301001();
    await tickets.asThePhone();
    const phone = async (table: string, row: Row): Promise<string> =>
      (await db.one<{ id: string }>(...phoneInsertOf(table, row))).id;
    const listed = async (table: string, column: string, value: string): Promise<string> =>
      (
        await db.one<{ id: string }>(`SELECT "id"::text FROM "${table}" WHERE "${column}" = $1`, [
          value,
        ])
      ).id;
    const incident = await phone(
      'incident',
      formLike(world, {
        incident_type_id: await listed('incident_type', 'name', 'Property damage'),
        address: '22 Elm St',
        parties: 'Coastline Haulers LLC, truck 730416; the owner of 22 Elm St',
        description: 'The truck struck the mailbox while backing out.',
      }),
    );
    const dropOffLog = await phone(
      'drop_off_log',
      formLike(world, { site_id: world.site, made_at: '2026-10-13T19:20:00Z' }),
    );
    const roe = await phone('roe', roeLike(world));
    const survey = await phone(
      'survey',
      formLike(world, {
        project_id: world.p2,
        assignment_id: world.assignments.p2,
        work_type_id: await listed('survey_work_type', 'key', 'PRE_WORK'),
        survey_number: 'APN 14-0321-007',
        roe_number: 'R-0007',
        roe_id: roe,
        made_at: '2026-10-09T14:40:00Z',
      }),
    );
    await actingAs(reviewer);
    const things: [string, string, Row][] = [
      [
        'unit rate ticket 301001',
        world.p1,
        { field_event_id: unitRate.fieldEvent, field_event_kind: 'UNIT_RATE' },
      ],
      ['the incident', world.p1, { incident_id: incident }],
      ['the drop-off log', world.p1, { drop_off_log_id: dropOffLog }],
      ['ROE R-0007', world.p2, { roe_id: roe }],
      ['its pre-work survey', world.p2, { survey_id: survey }],
      ['certification 730415', world.p1, { certification_id: world.certifications.c730415 }],
      ['load 101001', world.p1, { completed_load_id: world.loads.l101001.completedLoad }],
    ];
    for (const [what, project, target] of things) {
      const other = project === world.p1 ? world.p2 : world.p1;
      expect(
        await tickets.refused('qc_mark', qcLike(reviewer, target, { project_id: other })),
        `${what}, as the other project’s`,
      ).toBe(refusedBy.foreignKey);
      await tickets.add('qc_mark', qcLike(reviewer, target, { project_id: project }));
      expect(
        await tickets.refused('qc_mark', qcLike(reviewer, target, { project_id: project })),
        `${what}, a second mark`,
      ).toBe(refusedBy.unique);
    }
    await db.administer();
    expect(await db.rows(`SELECT 1 FROM "qc_mark"`)).toHaveLength(things.length);
    expect(
      await db.rows(
        `SELECT c."cert_number", u."name" AS checked_by, m."status"::text
         FROM "certification" c JOIN "qc_mark" m ON m."certification_id" = c."id"
         JOIN "user" u ON u."id" = m."set_by_id"`,
      ),
    ).toEqual([{ cert_number: '730415', checked_by: 'Luis Ortega', status: 'QC_APPROVED' }]);
  });
});

describe('the invoice lock', () => {
  it('AC-09-01 Luis locks 101001: the lock holds the completed load, who and when, and no amount, audited under him', async () => {
    const { db, world } = tested;
    const reviewer = await luis();
    await actingAs(reviewer);
    const lock = await tickets.add(
      'invoice_lock',
      lockLike(reviewer, { completed_load_id: world.loads.l101001.completedLoad }),
    );
    await db.administer();
    expect(
      await db.rows(
        `SELECT l."ticket_number", u."name" AS locked_by, k."locked_at", k."unlocked_at",
           k."invoice_batch_id"
         FROM "invoice_lock" k JOIN "completed_load" l ON l."id" = k."completed_load_id"
         JOIN "user" u ON u."id" = k."locked_by_id" WHERE k."id" = $1`,
        [lock],
      ),
    ).toEqual([
      {
        ticket_number: '101001',
        locked_by: 'Luis Ortega',
        locked_at: new Date(wednesday),
        unlocked_at: null,
        invoice_batch_id: null,
      },
    ]);
    expect(
      (await audited(lock)).map(({ operation, actor, domain }) => [operation, actor, domain]),
    ).toEqual([['INSERT', reviewer, 'BILLING']]);
    expect(await columnsOf('invoice_lock')).toEqual([
      'id',
      'completed_load_id',
      'locked_by_id',
      'locked_at',
      'completed_haul_out_id',
      'field_event_id',
      'field_event_kind',
      'invoice_batch_id',
      'project_id',
      'unlock_note',
      'unlocked_at',
      'unlocked_by_id',
    ]);
  });

  it('AC-08-73 while 101001 is locked as invoiced its field events, and the tickets its collection carries, change no more, for anybody, but the links a number finds; unlocked, they are corrected again', async () => {
    const { db, world } = tested;
    const reviewer = await luis();
    await actingAs(reviewer);
    const lock = await tickets.add(
      'invoice_lock',
      lockLike(reviewer, { completed_load_id: world.loads.l101001.completedLoad }),
    );
    const { collection, disposal } = world.loads.l101001;
    const locked = {
      code: refusedBy.trigger,
      message:
        'Ticket 101001 is locked as invoiced: its field events don’t change. Unlock it first',
    };
    for (const [event, set] of [
      [collection, `"notes" = 'Corrected after the lock'`],
      [disposal, `"load_call" = 70`],
      [disposal, `"ticket_number" = '101099'`],
    ] as const) {
      const refused = await db.refused(`UPDATE "field_event" SET ${set} WHERE "id" = $1`, [event]);
      expect({ code: refused.code, message: refused.message.replace("'", '’') }, set).toEqual(
        locked,
      );
    }
    expect(
      (
        await db.refused(
          `INSERT INTO "carried_ticket" ("field_event_id", "field_event_kind", "carried_ticket_number") VALUES ($1, 'COLLECTION', '301001')`,
          [collection],
        )
      ).code,
    ).toBe(refusedBy.trigger);
    // A field event the lock didn't hold, arriving now under the locked number (a split's late
    // collection), writes the tickets it carries: what was invoiced stands as it was.
    await db.as('adms_api');
    await db.actor(world.monitor, 'DEVICE', { deviceId: world.device });
    const late = (
      await db.one<{ id: string }>(
        ...eventInsertOf(
          fieldEventLike(world, {
            ticket_number: '101001',
            split_suffix: 'B',
            estimate_cy: '12.0',
          }),
        ),
      )
    ).id;
    expect(
      await db.run(
        `INSERT INTO "carried_ticket" ("field_event_id", "field_event_kind", "carried_ticket_number") VALUES ($1, 'COLLECTION', '301001')`,
        [late],
      ),
    ).toBe(1);
    await actingAs(reviewer);
    // A number finds its record: a certification or an ROE corrected moves the link, and the
    // ticket reads it only once unlocked.
    expect(
      await db.run(`UPDATE "field_event" SET "certification_id" = NULL WHERE "id" = $1`, [
        disposal,
      ]),
    ).toBe(1);
    await db.run(
      `UPDATE "invoice_lock" SET "unlocked_by_id" = $2, "unlocked_at" = now() WHERE "id" = $1`,
      [lock, reviewer],
    );
    expect(
      await db.run(
        `UPDATE "field_event" SET "notes" = 'Corrected after the unlock' WHERE "id" = $1`,
        [collection],
      ),
    ).toBe(1);
  });

  it('AC-09-01 is on one ticket of its own project, a field event only as a unit rate ticket, by a person', async () => {
    const { world } = tested;
    const load = world.loads.l101001;
    const reviewer = await luis();
    const unitRate = await tickets.unitRate301001();
    const on101001 = { completed_load_id: load.completedLoad };
    await actingAs(reviewer);
    expect(
      await tickets.refused('invoice_lock', lockLike(reviewer, on101001, { project_id: world.p2 })),
      'another project’s load',
    ).toBe(refusedBy.foreignKey);
    expect(
      await tickets.refused(
        'invoice_lock',
        lockLike(reviewer, { completed_load_id: world.loads.l102001.completedLoad }),
      ),
      'P2’s load as P1’s',
    ).toBe(refusedBy.foreignKey);
    for (const [what, target, how] of [
      ['a disposal event, no kind', { field_event_id: load.disposal }, refusedBy.check],
      [
        'a disposal event',
        { field_event_id: load.disposal, field_event_kind: 'DISPOSAL' },
        refusedBy.check,
      ],
      [
        'a disposal event called a unit rate ticket',
        { field_event_id: load.disposal, field_event_kind: 'UNIT_RATE' },
        refusedBy.foreignKey,
      ],
      ['a unit rate ticket, no kind', { field_event_id: unitRate.fieldEvent }, refusedBy.check],
      [
        'a unit rate ticket as another project’s',
        {
          field_event_id: unitRate.fieldEvent,
          field_event_kind: 'UNIT_RATE',
          project_id: world.p2,
        },
        refusedBy.foreignKey,
      ],
    ] as const) {
      expect(await tickets.refused('invoice_lock', lockLike(reviewer, target)), what).toBe(how);
    }
    for (const [what, lock, how] of [
      ['the system actor', lockLike(systemActor, on101001), refusedBy.check],
      ['nobody', lockLike(nobody, on101001), refusedBy.foreignKey],
      ['no one', lockLike(reviewer, on101001, { locked_by_id: null }), refusedBy.notNull],
      ['no project', lockLike(reviewer, on101001, { project_id: null }), refusedBy.notNull],
      [
        'no such project',
        lockLike(reviewer, on101001, { project_id: nobody }),
        refusedBy.foreignKey,
      ],
    ] as const) {
      expect(await tickets.refused('invoice_lock', lock), what).toBe(how);
    }
    await tickets.add(
      'invoice_lock',
      lockLike(reviewer, { field_event_id: unitRate.fieldEvent, field_event_kind: 'UNIT_RATE' }),
    );
  });

  it('AC-09-07 a ticket locked a second time is refused, on a load, a haul-out and a unit rate ticket alike, each locked only as its own project’s', async () => {
    const { world } = tested;
    const reviewer = await luis();
    const haulOut = await tickets.haulOut201004();
    const unitRate = await tickets.unitRate301001();
    await actingAs(reviewer);
    for (const [what, target] of [
      ['a load', { completed_load_id: world.loads.l101001.completedLoad }],
      ['a haul-out', { completed_haul_out_id: haulOut.completedHaulOut }],
      [
        'a unit rate ticket',
        { field_event_id: unitRate.fieldEvent, field_event_kind: 'UNIT_RATE' },
      ],
    ] as const) {
      expect(
        await tickets.refused('invoice_lock', lockLike(reviewer, target, { project_id: world.p2 })),
        `${what}, as P2’s`,
      ).toBe(refusedBy.foreignKey);
      await tickets.add('invoice_lock', lockLike(reviewer, target));
      expect(await tickets.refused('invoice_lock', lockLike(world.admin, target)), what).toBe(
        refusedBy.exclusion,
      );
    }
  });

  it('AC-09-17 Dana unlocks 101001: the lock’s own row is kept and says who, when and her note, audited under her; its lines can be regenerated again; locking again is a new row; an unlock is never taken back', async () => {
    const { db, world } = tested;
    const load = world.loads.l101001;
    const reviewer = await luis();
    const on101001 = { completed_load_id: load.completedLoad };
    await actingAs(reviewer);
    const lock = await tickets.add('invoice_lock', lockLike(reviewer, on101001));
    // Locked, the ticket gives up no line and takes none.
    await tickets.asTheWorker();
    expect(
      (await db.refused(`DELETE FROM "transaction" WHERE "id" = $1`, [world.transaction])).code,
    ).toBe(refusedBy.trigger);
    expect(await tickets.refused('transaction', transactionLike(world))).toBe(refusedBy.trigger);
    // Half an unlock, or a note without one, is refused; the system actor never unlocks.
    await actingAs(world.admin);
    for (const [what, set] of [
      ['when, by nobody', `"unlocked_at" = '2026-10-15T13:00:00Z'`],
      ['who, never', `"unlocked_by_id" = '${world.admin}'`],
      ['a note alone', `"unlock_note" = 'Load call corrected'`],
      [
        'the system actor',
        `"unlocked_at" = '2026-10-15T13:00:00Z', "unlocked_by_id" = '${systemActor}'`,
      ],
      [
        'a blank note',
        `"unlocked_at" = '2026-10-15T13:00:00Z', "unlocked_by_id" = '${world.admin}', "unlock_note" = ' '`,
      ],
    ] as const) {
      expect(await refusedChange('invoice_lock', lock, set), what).toBe(refusedBy.check);
    }
    expect(
      await refusedChange(
        'invoice_lock',
        lock,
        `"unlocked_at" = '2026-10-15T13:00:00Z', "unlocked_by_id" = '${nobody}'`,
      ),
      'nobody',
    ).toBe(refusedBy.foreignKey);
    // What was locked, by whom and when never changes.
    for (const set of [
      `"completed_load_id" = '${world.loads.l101002.completedLoad}'`,
      `"locked_by_id" = '${world.admin}'`,
      `"locked_at" = '2026-10-01T00:00:00Z'`,
      `"project_id" = '${world.p2}'`,
    ]) {
      expect(
        await db.refused(`UPDATE "invoice_lock" SET ${set} WHERE "id" = $1`, [lock]),
        set,
      ).toEqual(neverEdited('invoice_lock'));
    }
    expect(
      await db.run(
        `UPDATE "invoice_lock" SET "unlocked_by_id" = $2, "unlocked_at" = '2026-10-15T13:00:00Z',
           "unlock_note" = 'Load call corrected' WHERE "id" = $1`,
        [lock, world.admin],
      ),
    ).toBe(1);
    await db.administer();
    expect(
      await db.rows(
        `SELECT locker."name" AS locked_by, unlocker."name" AS unlocked_by, k."unlocked_at",
           k."unlock_note"
         FROM "invoice_lock" k JOIN "user" locker ON locker."id" = k."locked_by_id"
         JOIN "user" unlocker ON unlocker."id" = k."unlocked_by_id"`,
      ),
    ).toEqual([
      {
        locked_by: 'Luis Ortega',
        unlocked_by: 'Dana Reyes',
        unlocked_at: new Date('2026-10-15T13:00:00Z'),
        unlock_note: 'Load call corrected',
      },
    ]);
    expect((await audited(lock)).map(({ operation, actor }) => [operation, actor])).toEqual([
      ['INSERT', reviewer],
      ['UPDATE', world.admin],
    ]);
    // Unlocked, the worker regenerates the ticket's lines as ever.
    await tickets.asTheWorker();
    await db.run('SAVEPOINT regenerated');
    expect(await db.run(`DELETE FROM "transaction" WHERE "id" = $1`, [world.transaction])).toBe(1);
    await tickets.line({});
    await db.run('ROLLBACK TO SAVEPOINT regenerated');
    // Once unlocked the row is history, for every login.
    for (const who of ['adms_api', 'adms_owner'] as const) {
      await db.as(who);
      await db.actor(world.admin, 'BACK_OFFICE');
      for (const set of [
        `"unlocked_by_id" = NULL, "unlocked_at" = NULL, "unlock_note" = NULL`,
        `"unlock_note" = 'Something else'`,
        `"unlocked_at" = '2026-10-16T13:00:00Z'`,
      ]) {
        expect(
          await db.refused(`UPDATE "invoice_lock" SET ${set} WHERE "id" = $1`, [lock]),
          `${who}: ${set}`,
        ).toEqual(neverEdited('invoice_lock'));
      }
    }
    // Locking again is a new row, and the ticket is locked once more.
    await actingAs(reviewer);
    const again = await tickets.add(
      'invoice_lock',
      lockLike(reviewer, on101001, { locked_at: '2026-10-16T13:00:00Z' }),
    );
    expect(again).not.toBe(lock);
    expect(await tickets.refused('invoice_lock', lockLike(reviewer, on101001))).toBe(
      refusedBy.exclusion,
    );
    await tickets.asTheWorker();
    expect(
      (await db.refused(`DELETE FROM "transaction" WHERE "id" = $1`, [world.transaction])).code,
    ).toBe(refusedBy.trigger);
    await db.administer();
    expect(await db.rows(`SELECT 1 FROM "invoice_lock"`)).toHaveLength(2);
  });

  it('AC-09-09, AC-09-10 a batch is a record of its own, a name and its tickets with no amounts; a lock names one of its own project’s, or none; a name is used once on a project', async () => {
    const { db, world } = tested;
    const reviewer = await luis();
    const week = 'Bayline ROW, week of 12 Oct';
    await actingAs(reviewer);
    const batch = await tickets.add('invoice_batch', {
      project_id: world.p1,
      name: week,
      created_by_id: reviewer,
    });
    const onP2 = await tickets.add('invoice_batch', {
      project_id: world.p2,
      name: week,
      created_by_id: reviewer,
    });
    for (const [what, row, how] of [
      ['the same name again', { project_id: world.p1, name: week }, refusedBy.unique],
      ['a blank name', { project_id: world.p1, name: ' ' }, refusedBy.check],
      ['no name', { project_id: world.p1 }, refusedBy.notNull],
      ['no project', { name: 'Week of 19 Oct' }, refusedBy.notNull],
      [
        'the system actor',
        { project_id: world.p1, name: 'Week of 19 Oct', created_by_id: systemActor },
        refusedBy.check,
      ],
      [
        'nobody',
        { project_id: world.p1, name: 'Week of 19 Oct', created_by_id: nobody },
        refusedBy.foreignKey,
      ],
      ['no such project', { project_id: nobody, name: 'Week of 19 Oct' }, refusedBy.foreignKey],
    ] as const) {
      expect(await tickets.refused('invoice_batch', row), what).toBe(how);
    }
    await tickets.add(
      'invoice_lock',
      lockLike(reviewer, {
        completed_load_id: world.loads.l101001.completedLoad,
        invoice_batch_id: batch,
      }),
    );
    // Without a batch it is locked all the same.
    const on101002 = { completed_load_id: world.loads.l101002.completedLoad };
    expect(
      await tickets.refused(
        'invoice_lock',
        lockLike(reviewer, on101002, { invoice_batch_id: onP2 }),
      ),
      'P2’s batch',
    ).toBe(refusedBy.foreignKey);
    const alone = await tickets.add('invoice_lock', lockLike(reviewer, on101002));
    // And may be put in one later, while it stands.
    expect(
      await db.run(`UPDATE "invoice_lock" SET "invoice_batch_id" = $2 WHERE "id" = $1`, [
        alone,
        batch,
      ]),
    ).toBe(1);
    await db.administer();
    expect(
      await db.rows(
        `SELECT b."name", u."name" AS created_by, l."ticket_number"
         FROM "invoice_batch" b JOIN "user" u ON u."id" = b."created_by_id"
         JOIN "invoice_lock" k ON k."invoice_batch_id" = b."id"
         JOIN "completed_load" l ON l."id" = k."completed_load_id" ORDER BY l."ticket_number"`,
      ),
    ).toEqual([
      { name: week, created_by: 'Luis Ortega', ticket_number: '101001' },
      { name: week, created_by: 'Luis Ortega', ticket_number: '101002' },
    ]);
    expect(await columnsOf('invoice_batch')).toEqual([
      'id',
      'project_id',
      'name',
      'created_by_id',
      'created_at',
    ]);
  });
});

describe('a flag’s acceptance', () => {
  it('AC-08-48 carries a reason from the firm’s list, who accepted it and when: without one nothing is accepted', async () => {
    const { db } = tested;
    const reviewer = await luis();
    const flag = await flagOn101001();
    const photosConfirm = await reason('Photos confirm');
    await actingAs(reviewer);
    for (const column of ['reason_id', 'accepted_by_id', 'accepted_at', 'project_id', 'flag_id']) {
      expect(
        await tickets.refused(
          'flag_acceptance',
          acceptanceLike(reviewer, flag, photosConfirm, { [column]: null }),
        ),
        column,
      ).toBe(refusedBy.notNull);
    }
    for (const [what, row, how] of [
      ['a reason not on the list', acceptanceLike(reviewer, flag, nobody), refusedBy.foreignKey],
      ['the system actor', acceptanceLike(systemActor, flag, photosConfirm), refusedBy.check],
      ['nobody', acceptanceLike(nobody, flag, photosConfirm), refusedBy.foreignKey],
      [
        'a blank note',
        acceptanceLike(reviewer, flag, photosConfirm, { note: '' }),
        refusedBy.check,
      ],
      [
        'no such project',
        acceptanceLike(reviewer, flag, photosConfirm, { project_id: nobody }),
        refusedBy.foreignKey,
      ],
    ] as const) {
      expect(await tickets.refused('flag_acceptance', row), what).toBe(how);
    }
    await db.administer();
    expect(await db.rows(`SELECT 1 FROM "flag_acceptance"`)).toEqual([]);
    await actingAs(reviewer);
    await tickets.add(
      'flag_acceptance',
      acceptanceLike(reviewer, flag, photosConfirm, { note: 'Heaped; photos confirm' }),
    );
    await db.administer();
    expect(
      await db.rows(
        `SELECT f."message", r."name" AS reason, a."note", u."name" AS accepted_by, a."accepted_at"
         FROM "flag_acceptance" a JOIN "flag" f ON f."id" = a."flag_id"
         JOIN "reason" r ON r."id" = a."reason_id" JOIN "user" u ON u."id" = a."accepted_by_id"`,
      ),
    ).toEqual([
      {
        message: 'Ticket 101001: load call 96%. Flagged for review.',
        reason: 'Photos confirm',
        note: 'Heaped; photos confirm',
        accepted_by: 'Luis Ortega',
        accepted_at: new Date(wednesday),
      },
    ]);
  });

  it('AC-08-49 a flag is accepted at most once, as one of the acceptance’s own project’s; accepting it changes nothing on the flag, which the back office can’t write; the acceptance stays on its flag', async () => {
    const { db, world } = tested;
    const reviewer = await luis();
    const flag = await flagOn101001();
    const other = await flagOn101001({ code: 'LOAD_CALL_LOW', facts_sha256: 'b'.repeat(64) });
    const photosConfirm = await reason('Photos confirm');
    await db.administer();
    const before = await db.one(`SELECT * FROM "flag" WHERE "id" = $1`, [flag]);
    await actingAs(reviewer);
    expect(
      await tickets.refused(
        'flag_acceptance',
        acceptanceLike(reviewer, flag, photosConfirm, { project_id: world.p2 }),
      ),
      'as P2’s',
    ).toBe(refusedBy.foreignKey);
    const acceptance = await tickets.add(
      'flag_acceptance',
      acceptanceLike(reviewer, flag, photosConfirm),
    );
    expect(
      await tickets.refused('flag_acceptance', acceptanceLike(world.admin, flag, photosConfirm)),
      'a second acceptance',
    ).toBe(refusedBy.exclusion);
    expect(await refusedChange('flag', flag, `"cleared_at" = now()`)).toBe(refusedBy.grant);
    for (const set of [
      `"flag_id" = '${other}'`,
      `"accepted_by_id" = '${world.admin}'`,
      `"accepted_at" = '2026-10-01T00:00:00Z'`,
      `"project_id" = '${world.p2}'`,
    ]) {
      expect(
        await db.refused(`UPDATE "flag_acceptance" SET ${set} WHERE "id" = $1`, [acceptance]),
        set,
      ).toEqual(neverEdited('flag_acceptance'));
    }
    await db.administer();
    expect(await db.one(`SELECT * FROM "flag" WHERE "id" = $1`, [flag])).toEqual(before);
  });

  it('AC-08-70 an acceptance taken back says who and when together, a note only with them, a person’s; it is history then; a flag has one acceptance in force, so accepting it again is a new row', async () => {
    const { db, world } = tested;
    const reviewer = await luis();
    const flag = await flagOn101001();
    const photosConfirm = await reason('Photos confirm');
    await actingAs(reviewer);
    const first = await tickets.add(
      'flag_acceptance',
      acceptanceLike(reviewer, flag, photosConfirm),
    );
    const withdrawn = (set: string) =>
      db.refused(`UPDATE "flag_acceptance" SET ${set} WHERE "id" = $1`, [first]);
    for (const [what, set] of [
      ['who alone', `"withdrawn_by_id" = '${reviewer}'`],
      ['when alone', `"withdrawn_at" = now()`],
      ['a note alone', `"withdraw_note" = 'Wrong photos'`],
      [
        'a blank note',
        `"withdrawn_by_id" = '${reviewer}', "withdrawn_at" = now(), "withdraw_note" = ' '`,
      ],
      ['the system actor', `"withdrawn_by_id" = '${systemActor}', "withdrawn_at" = now()`],
    ] as const) {
      expect((await withdrawn(set)).code, what).toBe(refusedBy.check);
    }
    expect(
      await db.run(
        `UPDATE "flag_acceptance" SET "withdrawn_by_id" = $2, "withdrawn_at" = now(), "withdraw_note" = 'Photos were 101005’s' WHERE "id" = $1`,
        [first, reviewer],
      ),
    ).toBe(1);
    // Once taken back it is history: its note no more than anything else.
    expect(await withdrawn(`"withdraw_note" = 'Another'`)).toEqual(neverEdited('flag_acceptance'));
    const again = await tickets.add(
      'flag_acceptance',
      acceptanceLike(world.admin, flag, photosConfirm),
    );
    expect(again).not.toBe(first);
    expect(
      await tickets.refused('flag_acceptance', acceptanceLike(reviewer, flag, photosConfirm)),
      'a third while the second stands',
    ).toBe(refusedBy.exclusion);
  });
});

describe('a person’s void', () => {
  it('AC-08-33 carries a reason from the firm’s list, who voided it and when: without one nothing is voided; it is keyed as a ticket is, by project, workflow and number', async () => {
    const { db } = tested;
    const reviewer = await luis();
    const duplicate = await reason('Duplicate ticket');
    await actingAs(reviewer);
    for (const column of [
      'reason_id',
      'voided_by_id',
      'voided_at',
      'project_id',
      'workflow',
      'ticket_number',
    ]) {
      expect(
        await tickets.refused('ticket_void', voidLike(reviewer, duplicate, { [column]: null })),
        column,
      ).toBe(refusedBy.notNull);
    }
    for (const [what, row, how] of [
      ['a reason not on the list', voidLike(reviewer, nobody), refusedBy.foreignKey],
      ['the system actor', voidLike(systemActor, duplicate), refusedBy.check],
      ['nobody', voidLike(nobody, duplicate), refusedBy.foreignKey],
      ['a blank number', voidLike(reviewer, duplicate, { ticket_number: ' ' }), refusedBy.check],
      ['a blank note', voidLike(reviewer, duplicate, { note: ' ' }), refusedBy.check],
      [
        'no such project',
        voidLike(reviewer, duplicate, { project_id: nobody }),
        refusedBy.foreignKey,
      ],
      ['no such workflow', voidLike(reviewer, duplicate, { workflow: 'FORM' }), refusedBy.badValue],
    ] as const) {
      expect(await tickets.refused('ticket_void', row), what).toBe(how);
    }
    await db.administer();
    expect(await db.rows(`SELECT 1 FROM "ticket_void"`)).toEqual([]);
    await actingAs(reviewer);
    await tickets.add(
      'ticket_void',
      voidLike(reviewer, duplicate, { note: 'Duplicate of 301001' }),
    );
    await db.administer();
    expect(
      await db.rows(
        `SELECT v."workflow"::text, v."ticket_number", r."name" AS reason, v."note",
           u."name" AS voided_by, v."voided_at", v."lifted_at"
         FROM "ticket_void" v JOIN "reason" r ON r."id" = v."reason_id"
         JOIN "user" u ON u."id" = v."voided_by_id"`,
      ),
    ).toEqual([
      {
        workflow: 'UNIT_RATE',
        ticket_number: '301002',
        reason: 'Duplicate ticket',
        note: 'Duplicate of 301001',
        voided_by: 'Luis Ortega',
        voided_at: new Date(wednesday),
        lifted_at: null,
      },
    ]);
    expect(await columnsOf('ticket_void')).toEqual([
      'id',
      'project_id',
      'workflow',
      'ticket_number',
      'reason_id',
      'note',
      'voided_by_id',
      'voided_at',
      'lifted_by_id',
      'lifted_at',
      'lift_note',
    ]);
  });

  it('AC-08-33 a ticket has one void in force; an unvoid lifts it on its own row, who and when together, and is never taken back; voiding it again is a new row', async () => {
    const { db, world } = tested;
    const reviewer = await luis();
    const duplicate = await reason('Duplicate ticket');
    await actingAs(reviewer);
    const voided = await tickets.add('ticket_void', voidLike(reviewer, duplicate));
    expect(await tickets.refused('ticket_void', voidLike(world.admin, duplicate)), 'again').toBe(
      refusedBy.exclusion,
    );
    // The same number in another workflow, or on another project, is another ticket.
    await tickets.add('ticket_void', voidLike(reviewer, duplicate, { workflow: 'LOAD' }));
    await tickets.add('ticket_void', voidLike(reviewer, duplicate, { project_id: world.p2 }));
    for (const [what, set] of [
      ['when, by nobody', `"lifted_at" = '2026-10-15T13:00:00Z'`],
      ['who, never', `"lifted_by_id" = '${world.admin}'`],
      ['a note alone', `"lift_note" = 'Voided by mistake'`],
      [
        'the system actor',
        `"lifted_at" = '2026-10-15T13:00:00Z', "lifted_by_id" = '${systemActor}'`,
      ],
    ] as const) {
      expect(await refusedChange('ticket_void', voided, set), what).toBe(refusedBy.check);
    }
    expect(
      await refusedChange(
        'ticket_void',
        voided,
        `"lifted_at" = '2026-10-15T13:00:00Z', "lifted_by_id" = '${nobody}'`,
      ),
      'nobody',
    ).toBe(refusedBy.foreignKey);
    for (const set of [
      `"ticket_number" = '301003'`,
      `"workflow" = 'HAUL_OUT'`,
      `"project_id" = '${world.p2}'`,
      `"voided_by_id" = '${world.admin}'`,
      `"voided_at" = '2026-10-01T00:00:00Z'`,
    ]) {
      expect(
        await db.refused(`UPDATE "ticket_void" SET ${set} WHERE "id" = $1`, [voided]),
        set,
      ).toEqual(neverEdited('ticket_void'));
    }
    await actingAs(world.admin);
    expect(
      await db.run(
        `UPDATE "ticket_void" SET "lifted_by_id" = $2, "lifted_at" = '2026-10-15T13:00:00Z',
           "lift_note" = 'Voided by mistake' WHERE "id" = $1`,
        [voided, world.admin],
      ),
    ).toBe(1);
    expect((await audited(voided)).map(({ operation, actor }) => [operation, actor])).toEqual([
      ['INSERT', reviewer],
      ['UPDATE', world.admin],
    ]);
    for (const who of ['adms_api', 'adms_owner'] as const) {
      await db.as(who);
      await db.actor(world.admin, 'BACK_OFFICE');
      for (const set of [
        `"lifted_by_id" = NULL, "lifted_at" = NULL, "lift_note" = NULL`,
        `"note" = 'Something else'`,
      ]) {
        expect(
          await db.refused(`UPDATE "ticket_void" SET ${set} WHERE "id" = $1`, [voided]),
          `${who}: ${set}`,
        ).toEqual(neverEdited('ticket_void'));
      }
    }
    await actingAs(reviewer);
    const again = await tickets.add('ticket_void', voidLike(reviewer, duplicate));
    expect(again).not.toBe(voided);
    await db.administer();
    expect(
      await db.rows(`SELECT 1 FROM "ticket_void" WHERE "ticket_number" = '301002'`),
    ).toHaveLength(4);
  });

  it('AC-08-67 an unvoid is its own record, written by the back office’s login and audited under the person, whether a person voided the ticket or a rule did; it names its ticket, is a person’s, and never changes; the worker reads it and writes none; nobody deletes one', async () => {
    const { db, world } = tested;
    const reviewer = await luis();
    await actingAs(reviewer);
    const unvoidLike = (more: Row = {}): Row => ({
      project_id: world.p1,
      workflow: 'LOAD',
      ticket_number: '101009',
      unvoided_by_id: reviewer,
      unvoided_at: wednesday,
      ...more,
    });
    for (const [what, row, how] of [
      ['no ticket', unvoidLike({ ticket_number: ' ' }), refusedBy.check],
      ['a blank note', unvoidLike({ note: ' ' }), refusedBy.check],
      ['the system actor', unvoidLike({ unvoided_by_id: systemActor }), refusedBy.check],
      ['nobody', unvoidLike({ unvoided_by_id: nobody }), refusedBy.foreignKey],
      ['no project', unvoidLike({ project_id: nobody }), refusedBy.foreignKey],
      ['no time', unvoidLike({ unvoided_at: null }), refusedBy.notNull],
      ['nobody named', unvoidLike({ unvoided_by_id: null }), refusedBy.notNull],
    ] as const) {
      expect(await tickets.refused('ticket_unvoid', row), what).toBe(how);
    }
    await db.administer();
    expect(await db.rows(`SELECT 1 FROM "ticket_unvoid"`)).toEqual([]);

    // No void row stands behind 101009 (a rule voided it): the unvoid is still a record.
    await actingAs(reviewer);
    const unvoided = await tickets.add('ticket_unvoid', unvoidLike({ note: 'Asked by the prime' }));
    const [record, ...more] = await audited(unvoided);
    expect({ ...record, changed: undefined, more }).toEqual({
      operation: 'INSERT',
      actor: reviewer,
      domain: 'BILLING',
      changed: undefined,
      more: [],
    });
    // A ticket may be unvoided more than once over its life: each is a record.
    const again = await tickets.add('ticket_unvoid', unvoidLike());
    expect(again).not.toBe(unvoided);
    expect(await columnsOf('ticket_unvoid')).toEqual([
      'id',
      'project_id',
      'workflow',
      'ticket_number',
      'note',
      'unvoided_by_id',
      'unvoided_at',
    ]);
    for (const who of ['adms_api', 'adms_owner'] as const) {
      await db.as(who);
      await db.actor(world.admin, 'BACK_OFFICE');
      for (const set of [
        `"note" = 'Something else'`,
        `"ticket_number" = '101010'`,
        `"unvoided_by_id" = '${world.admin}'`,
        `"unvoided_at" = '2026-10-01T00:00:00Z'`,
      ]) {
        expect(
          await db.refused(`UPDATE "ticket_unvoid" SET ${set} WHERE "id" = $1`, [unvoided]),
          `${who}: ${set}`,
        ).toEqual(neverEdited('ticket_unvoid'));
      }
      expect(
        (await db.refused(`DELETE FROM "ticket_unvoid" WHERE "id" = $1`, [unvoided])).code,
        `${who}: delete`,
      ).toBe(who === 'adms_api' ? refusedBy.grant : refusedBy.trigger);
    }
    await tickets.asTheWorker();
    expect(await db.rows(`SELECT 1 FROM "ticket_unvoid" WHERE "id" = $1`, [unvoided])).toHaveLength(
      1,
    );
    expect(await refusedChange('ticket_unvoid', unvoided, '"project_id" = "project_id"')).toBe(
      refusedBy.grant,
    );
    expect(await tickets.refused('ticket_unvoid', unvoidLike())).toBe(refusedBy.grant);
    // A client user and an auditor see it on their project; a contractor user doesn't.
    await db.administer();
    for (const [viewer, seen] of [
      [world.clientViewer, 2],
      [world.auditor, 2],
      [world.coastlineViewer, 0],
    ] as const) {
      await db.viewer(viewer);
      await db.as('adms_readonly');
      expect(await db.rows(`SELECT 1 FROM "viewer_ticket_unvoid"`), viewer).toHaveLength(seen);
      await db.administer();
    }
  });
});

describe('what a viewer sees of the marks', () => {
  // One column of what a viewer reads through the read-only login, in order.
  async function reads(viewer: string, column: string, from: string): Promise<string[]> {
    const { db } = tested;
    await db.administer();
    await db.viewer(viewer);
    await db.as('adms_readonly');
    const rows = await db.rows<{ value: string }>(
      `SELECT ${column}::text AS value FROM "${from}" ORDER BY 1`,
    );
    await db.administer();
    return rows.map((row) => row.value);
  }

  // P1 marked: 101001 (Coastline's own) QC Approved and locked in the week's batch; 101002
  // (Rivera's, under Coastline) locked in no batch; Summit's 101044 locked in a batch of its
  // own; a flag accepted and 301002 voided. And one mark on P2.
  async function p1Marked(): Promise<{ summitUser: string; week: string; summits: string }> {
    const { db, world } = tested;
    const reviewer = await luis();
    const summit = await tickets.summits101044();
    const flag = await flagOn101001();
    const photosConfirm = await reason('Photos confirm');
    const duplicate = await reason('Duplicate ticket');
    await actingAs(reviewer);
    const week = await tickets.add('invoice_batch', {
      project_id: world.p1,
      name: 'Bayline ROW, week of 12 Oct',
    });
    const summits = await tickets.add('invoice_batch', {
      project_id: world.p1,
      name: 'Summit, week of 12 Oct',
    });
    await tickets.add('invoice_batch', { project_id: world.p1, name: 'Nothing in it yet' });
    await tickets.add(
      'qc_mark',
      qcLike(reviewer, { completed_load_id: world.loads.l101001.completedLoad }),
    );
    await tickets.add(
      'qc_mark',
      qcLike(reviewer, {
        completed_load_id: world.loads.l102001.completedLoad,
        project_id: world.p2,
      }),
    );
    await tickets.add(
      'invoice_lock',
      lockLike(reviewer, {
        completed_load_id: world.loads.l101001.completedLoad,
        invoice_batch_id: week,
      }),
    );
    await tickets.add(
      'invoice_lock',
      lockLike(reviewer, { completed_load_id: world.loads.l101002.completedLoad }),
    );
    await tickets.add(
      'invoice_lock',
      lockLike(reviewer, { completed_load_id: summit.completedLoad, invoice_batch_id: summits }),
    );
    await tickets.add('flag_acceptance', acceptanceLike(reviewer, flag, photosConfirm));
    await tickets.add('ticket_void', voidLike(reviewer, duplicate));
    await db.administer();
    await db.actor(world.admin, 'BACK_OFFICE');
    const { id: summitUser } = await db.one<{ id: string }>(
      ...insertOf('user', viewerLike('Summit dispatcher', 'CONTRACTOR', world.summit)),
    );
    await db.run(...insertOf('user_viewer_project', given(summitUser, world.p1)));
    return { summitUser, week, summits };
  }

  it('a client user and an auditor see every mark on their projects’ records, a lock without its unlock’s note, and none of another project’s', async () => {
    const { world } = tested;
    await p1Marked();
    const seen = async (viewer: string): Promise<Record<string, number>> => {
      const found: Record<string, number> = {};
      for (const table of marks)
        found[table] = (await reads(viewer, '"id"', `viewer_${table}`)).length;
      return found;
    };
    const p1s = {
      qc_mark: 1,
      invoice_batch: 3,
      invoice_lock: 3,
      flag_acceptance: 1,
      ticket_void: 1,
    };
    expect(await seen(world.clientViewer)).toEqual(p1s);
    expect(await seen(world.auditor)).toEqual({ ...p1s, qc_mark: 2 });
    expect(await reads(world.clientViewer, '"status"', 'viewer_qc_mark')).toEqual(['QC_APPROVED']);
    const { db } = tested;
    await db.viewer(world.auditor);
    await db.as('adms_readonly');
    expect((await db.refused(`SELECT "unlock_note" FROM "invoice_lock"`)).code).toBe(
      refusedBy.grant,
    );
    expect((await db.refused(`SELECT "unlock_note" FROM "viewer_invoice_lock"`)).code).toBe(
      '42703',
    );
    await db.administer();
  });

  it('a contractor user sees that its own tickets are locked and in which batch, a prime its subs’ too, and no other mark', async () => {
    const { world } = tested;
    const { summitUser, week, summits } = await p1Marked();
    const ticketsLocked = async (viewer: string): Promise<string[]> => {
      const loads = await reads(viewer, '"completed_load_id"', 'viewer_invoice_lock');
      const numbers: string[] = [];
      for (const load of loads) {
        const { db } = tested;
        numbers.push(
          (
            await db.one<{ number: string }>(
              `SELECT "ticket_number" AS number FROM "completed_load" WHERE "id" = $1`,
              [load],
            )
          ).number,
        );
      }
      return numbers.sort();
    };
    expect(await ticketsLocked(world.coastlineViewer)).toEqual(['101001', '101002']);
    expect(await ticketsLocked(summitUser)).toEqual(['101044']);
    expect(await reads(world.coastlineViewer, '"id"', 'viewer_invoice_batch')).toEqual([week]);
    expect(await reads(summitUser, '"id"', 'viewer_invoice_batch')).toEqual([summits]);
    for (const viewer of [world.coastlineViewer, summitUser]) {
      for (const table of ['qc_mark', 'flag_acceptance', 'ticket_void']) {
        expect(await reads(viewer, '"id"', `viewer_${table}`), table).toEqual([]);
      }
    }
  });
});
