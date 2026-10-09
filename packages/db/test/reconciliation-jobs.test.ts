// The job queue (task 2.3.1; ADR-418): a job and the tickets it names, by scenario ID of
// spec/acceptance/10-api-and-sync.md (AC-10-50; the record AC-10-52…54 stand on) and its point
// 14. ARCHITECTURE §5.1…§5.3, §13; spec/THREAT-MODEL.md T-30, T-31, T-34; ADR-360; REQ-206.
//
// These try the guards as each login, rolled back. Queueing a job in the piece of work of the
// change that asks for it, as the API's own login, is `job-queue.test.ts`.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { insertOf } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

type Row = Record<string, unknown>;

// As the API's login, for Luis's correction in the back office (Dana in the example world).
async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE');
}

async function asTheWorker(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_worker');
  await db.actor(world.worker, 'SYSTEM');
}

async function add(table: string, row: Row): Promise<string> {
  return (await tested.db.one<{ id: string }>(...insertOf(table, row))).id;
}

async function refusedRow(table: string, row: Row): Promise<string> {
  return (await tested.db.refused(...insertOf(table, row))).code;
}

// The job a correction of 101001's load call asks for.
function jobLike(more: Row = {}): Row {
  const { world } = tested;
  return { project_id: world.p1, trigger: 'CORRECTION', requested_by_id: world.admin, ...more };
}

function ticketLike(job: string, more: Row = {}): Row {
  return {
    project_id: tested.world.p1,
    reconciliation_job_id: job,
    workflow: 'LOAD',
    ticket_number: '101001',
    ...more,
  };
}

// A job of P1's, waiting, naming 101001; its id.
async function queued(more: Row = {}): Promise<string> {
  await asTheApi();
  const job = await add('reconciliation_job', jobLike(more));
  await add('reconciliation_job_ticket', ticketLike(job));
  return job;
}

// A run of the worker on a project; its id.
async function runOn(projectId: string): Promise<string> {
  await asTheWorker();
  return add('reconciliation_run', {
    project_id: projectId,
    trigger: 'CORRECTION',
    started_at: '2026-10-13T14:00:00Z',
  });
}

const columnsOf = async (table: string): Promise<string[]> =>
  (
    await tested.db.rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY column_name`,
      [table],
    )
  ).map((column) => column.column_name);

const audited = (table: string, id: string): Promise<unknown[]> =>
  tested.db.rows(
    `SELECT "operation"::text, "domain"::text, "actor_id"::text AS actor, "source"::text
     FROM "audit_record" WHERE "table_name" = $1 AND "record_id" = $2 ORDER BY "id"`,
    [table, id],
  );

const update = (set: string): string => `UPDATE "reconciliation_job" SET ${set} WHERE "id" = $1`;

describe('a job', () => {
  it('names its project, what asked for it and who, and starts waiting: no try, not finished, not set aside', async () => {
    const { db, world } = tested;
    expect(await columnsOf('reconciliation_job')).toEqual([
      'attempts',
      'finished_at',
      'id',
      'last_error',
      'project_id',
      'queued_at',
      'reconciliation_run_id',
      'requested_by_id',
      'set_aside_at',
      'trigger',
    ]);
    expect(await columnsOf('reconciliation_job_ticket')).toEqual([
      'id',
      'project_id',
      'reconciliation_job_id',
      'ticket_number',
      'workflow',
    ]);
    const job = await queued();
    expect(
      await db.one(
        `SELECT "project_id"::text AS project, "trigger"::text, "requested_by_id"::text AS asked,
           "queued_at" IS NOT NULL AS queued, "attempts", "finished_at" AS finished,
           "reconciliation_run_id" AS run, "last_error" AS error, "set_aside_at" AS aside
         FROM "reconciliation_job" WHERE "id" = $1`,
        [job],
      ),
    ).toEqual({
      project: world.p1,
      trigger: 'CORRECTION',
      asked: world.admin,
      queued: true,
      attempts: 0,
      finished: null,
      run: null,
      error: null,
      aside: null,
    });
    // A sync's job names no person; what asked is one of the run's own closed set.
    await add('reconciliation_job', jobLike({ trigger: 'SYNC', requested_by_id: null }));
    expect(await refusedRow('reconciliation_job', jobLike({ trigger: 'NIGHTLY' }))).toBe(
      refusedBy.badValue,
    );
    expect(await refusedRow('reconciliation_job', jobLike({ project_id: randomUUID() }))).toBe(
      refusedBy.foreignKey,
    );
  });

  it('AC-10-54 names its tickets as the worker groups one, each once, each of its own project', async () => {
    const { db, world } = tested;
    const job = await queued();
    await add('reconciliation_job_ticket', ticketLike(job, { ticket_number: '101003' }));
    // The same number in another workflow is another ticket.
    await add('reconciliation_job_ticket', ticketLike(job, { workflow: 'UNIT_RATE' }));
    expect(
      await db.rows(
        `SELECT "workflow"::text, "ticket_number" AS ticket FROM "reconciliation_job_ticket"
         WHERE "reconciliation_job_id" = $1 ORDER BY "workflow", "ticket_number"`,
        [job],
      ),
    ).toEqual([
      { workflow: 'LOAD', ticket: '101001' },
      { workflow: 'LOAD', ticket: '101003' },
      { workflow: 'UNIT_RATE', ticket: '101001' },
    ]);
    expect(await refusedRow('reconciliation_job_ticket', ticketLike(job))).toBe(refusedBy.unique);
    expect(
      await refusedRow('reconciliation_job_ticket', ticketLike(job, { ticket_number: ' ' })),
    ).toBe(refusedBy.check);
    expect(
      await refusedRow('reconciliation_job_ticket', ticketLike(job, { workflow: 'CLT' })),
    ).toBe(refusedBy.badValue);
    // A ticket of P2's can't ride on P1's job.
    expect(
      await refusedRow(
        'reconciliation_job_ticket',
        ticketLike(job, { project_id: world.p2, ticket_number: '102001' }),
      ),
    ).toBe(refusedBy.foreignKey);
  });

  it('is audited as how the work went, with who wrote it', async () => {
    const { db, world } = tested;
    const job = await queued();
    const run = await runOn(world.p1);
    await db.run(update(`"attempts" = 1, "finished_at" = now(), "reconciliation_run_id" = $2`), [
      job,
      run,
    ]);
    await db.administer();
    expect(await audited('reconciliation_job', job)).toEqual([
      { operation: 'INSERT', domain: 'OPERATIONS', actor: world.admin, source: 'BACK_OFFICE' },
      { operation: 'UPDATE', domain: 'OPERATIONS', actor: world.worker, source: 'SYSTEM' },
    ]);
    const [ticket] = await db.rows<{ id: string }>(
      `SELECT "id"::text FROM "reconciliation_job_ticket" WHERE "reconciliation_job_id" = $1`,
      [job],
    );
    expect(await audited('reconciliation_job_ticket', ticket?.id ?? '')).toEqual([
      { operation: 'INSERT', domain: 'OPERATIONS', actor: world.admin, source: 'BACK_OFFICE' },
    ]);
  });
});

describe('who may do what to the queue (acceptance file 10, point 14)', () => {
  it('the API adds a job and its tickets and changes neither; without an actor it adds none', async () => {
    const { db } = tested;
    const job = await queued();
    for (const sql of [
      update(`"attempts" = 1`),
      update(`"set_aside_at" = now(), "last_error" = 'made up'`),
      `UPDATE "reconciliation_job_ticket" SET "ticket_number" = '101002'
       WHERE "reconciliation_job_id" = $1`,
      `DELETE FROM "reconciliation_job_ticket" WHERE "reconciliation_job_id" = $1`,
      `DELETE FROM "reconciliation_job" WHERE "id" = $1`,
    ]) {
      expect((await db.refused(sql, [job])).code, sql).toBe(refusedBy.grant);
    }
    await db.noActor();
    expect(await refusedRow('reconciliation_job', jobLike())).toBe(refusedBy.grant);
  });

  it('the worker reads a job and its tickets and adds neither; it never edits a ticket', async () => {
    const { db } = tested;
    const job = await queued();
    await asTheWorker();
    expect(
      await db.rows(
        `SELECT "ticket_number" AS ticket FROM "reconciliation_job_ticket"
         WHERE "reconciliation_job_id" = $1`,
        [job],
      ),
    ).toEqual([{ ticket: '101001' }]);
    expect(await refusedRow('reconciliation_job', jobLike())).toBe(refusedBy.grant);
    expect(
      await refusedRow('reconciliation_job_ticket', ticketLike(job, { ticket_number: '101003' })),
    ).toBe(refusedBy.grant);
    for (const sql of [
      `UPDATE "reconciliation_job_ticket" SET "ticket_number" = '101002'
       WHERE "reconciliation_job_id" = $1`,
      `DELETE FROM "reconciliation_job_ticket" WHERE "reconciliation_job_id" = $1`,
      `DELETE FROM "reconciliation_job" WHERE "id" = $1`,
    ]) {
      expect((await db.refused(sql, [job])).code, sql).toBe(refusedBy.grant);
    }
  });

  it('the read-only login reads neither; nobody deletes or truncates, and nobody edits a ticket, the owner included', async () => {
    const { db } = tested;
    const job = await queued();
    await db.as('adms_readonly');
    for (const table of ['reconciliation_job', 'reconciliation_job_ticket']) {
      expect((await db.refused(`SELECT 1 FROM "${table}"`)).code, table).toBe(refusedBy.grant);
    }
    await db.as('adms_owner');
    for (const sql of [
      `DELETE FROM "reconciliation_job_ticket" WHERE "reconciliation_job_id" = $1`,
      `DELETE FROM "reconciliation_job" WHERE "id" = $1`,
      `UPDATE "reconciliation_job_ticket" SET "ticket_number" = '101002'
       WHERE "reconciliation_job_id" = $1`,
    ]) {
      expect((await db.refused(sql, [job])).code, sql).toBe(refusedBy.trigger);
    }
    for (const table of ['reconciliation_job', 'reconciliation_job_ticket']) {
      expect((await db.refused(`TRUNCATE "${table}" CASCADE`)).code, table).toBe(refusedBy.trigger);
    }
  });
});

describe('how a job goes (ADR-418 (5), (6))', () => {
  it('the worker counts its tries, says why one failed, and finishes it under one of its own project’s runs', async () => {
    const { db, world } = tested;
    const job = await queued();
    await asTheWorker();
    // A try that failed whole: the job is still waiting.
    expect(
      await db.run(update(`"attempts" = 1, "last_error" = 'The database was away.'`), [job]),
    ).toBe(1);
    for (const [what, set, values] of [
      ['a count below nought', `"attempts" = -1`, []],
      ['blank words', `"last_error" = ' '`, []],
      ['finished with no run', `"finished_at" = now()`, []],
      ['set aside with no reason', `"set_aside_at" = now(), "last_error" = NULL`, []],
    ] as const) {
      expect((await db.refused(update(set), [job, ...values])).code, what).toBe(refusedBy.check);
    }
    const p2Run = await runOn(world.p2);
    expect(
      (
        await db.refused(update(`"finished_at" = now(), "reconciliation_run_id" = $2`), [
          job,
          p2Run,
        ])
      ).code,
    ).toBe(refusedBy.foreignKey);
    const run = await runOn(world.p1);
    expect(
      (
        await db.refused(
          update(`"finished_at" = now(), "set_aside_at" = now(), "reconciliation_run_id" = $2`),
          [job, run],
        )
      ).code,
    ).toBe(refusedBy.check);
    expect(
      await db.run(update(`"attempts" = 2, "finished_at" = now(), "reconciliation_run_id" = $2`), [
        job,
        run,
      ]),
    ).toBe(1);
  });

  it('once finished, or set aside, a job is history: nothing of it changes again', async () => {
    const { db, world } = tested;
    const finished = await queued();
    const aside = await queued();
    const run = await runOn(world.p1);
    await db.run(update(`"attempts" = 1, "finished_at" = now(), "reconciliation_run_id" = $2`), [
      finished,
      run,
    ]);
    await db.run(update(`"attempts" = 5, "last_error" = 'Timed out.', "set_aside_at" = now()`), [
      aside,
    ]);
    for (const job of [finished, aside]) {
      for (const set of [
        `"attempts" = 6`,
        `"finished_at" = NULL`,
        `"set_aside_at" = NULL`,
        `"last_error" = 'Another reason.'`,
      ]) {
        expect((await db.refused(update(set), [job])).code, set).toBe(refusedBy.trigger);
      }
    }
    await db.as('adms_owner');
    expect((await db.refused(update(`"set_aside_at" = NULL`), [aside])).code).toBe(
      refusedBy.trigger,
    );
  });

  it('what was asked never changes: its project, what asked for it, who, and when', async () => {
    const { db, world } = tested;
    const job = await queued();
    for (const login of ['adms_worker', 'adms_owner'] as const) {
      await db.as(login);
      await db.actor(world.worker, 'SYSTEM');
      for (const [set, value] of [
        [`"id" = $2`, randomUUID()],
        [`"project_id" = $2`, world.p2],
        [`"trigger" = $2::reconciliation_trigger`, 'SYNC'],
        [`"requested_by_id" = $2`, world.monitor],
        [`"queued_at" = $2`, '2026-10-01T00:00:00Z'],
      ] as const) {
        expect((await db.refused(update(set), [job, value])).code, `${login} ${set}`).toBe(
          refusedBy.trigger,
        );
      }
    }
  });
});
