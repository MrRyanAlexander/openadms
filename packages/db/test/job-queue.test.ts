// Queueing a job (task 2.3.1; ADR-418; spec/acceptance/10-api-and-sync.md AC-10-50;
// spec/THREAT-MODEL.md T-31; ARCHITECTURE §3 "jobs are transactional with the data", §13): a
// change that asks for reconciliation adds its job through `ReconciliationJobs`, in its own piece
// of work, so neither exists without the other. Each test connects as the API's own login; what
// that login writes can't be deleted, so its work is undone (support/service.ts). The tables'
// guards are `reconciliation-jobs.test.ts`.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Actor } from '../src/actor.ts';
import type { Database } from '../src/database.ts';
import { ReconciliationJobs } from '../src/reconciliation-jobs.ts';
import { GuardedDatabase } from './support/database.ts';
import { bayline, openService, p1In, undone } from './support/service.ts';

describe('AC-10-50 a job is queued in the piece of work of the change that asks for it', () => {
  let api: Database;
  // Dana Reyes, made in the same piece of work: what the API's own login writes can't be deleted,
  // so all of it is undone.
  const dana = randomUUID();
  const actor: Actor = { actorId: dana, source: 'BACK_OFFICE', requestId: 'req-2310' };

  beforeAll(async () => {
    // Refuses a database that isn't at head or hasn't been seeded.
    await (await GuardedDatabase.open()).close();
    api = openService('api');
  });

  afterAll(async () => {
    await api.$disconnect();
  });

  it('the change and its job are written together, each ticket once, as the person who made the change', async () => {
    const seen = await undone(api, actor, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      const project = await tx.project.create({ data: await p1In(tx) });
      const id = await new ReconciliationJobs(tx).queue({
        projectId: project.id,
        trigger: 'CORRECTION',
        requestedById: dana,
        tickets: [
          { workflow: 'LOAD', ticketNumber: '101001' },
          { workflow: 'LOAD', ticketNumber: '101003' },
          { workflow: 'LOAD', ticketNumber: '101001' },
        ],
      });
      const job = await tx.reconciliationJob.findUniqueOrThrow({
        where: { id },
        include: { tickets: { orderBy: { ticketNumber: 'asc' } } },
      });
      const records = await tx.auditRecord.findMany({
        where: { tableName: { in: ['reconciliation_job', 'reconciliation_job_ticket'] } },
        orderBy: { id: 'asc' },
      });
      return { project: project.id, job, records: records.filter((r) => r.actorId === dana) };
    });
    expect(seen.job).toMatchObject({
      projectId: seen.project,
      trigger: 'CORRECTION',
      requestedById: dana,
      attempts: 0,
      finishedAt: null,
      setAsideAt: null,
    });
    expect(seen.job.tickets.map((ticket) => `${ticket.workflow} ${ticket.ticketNumber}`)).toEqual([
      'LOAD 101001',
      'LOAD 101003',
    ]);
    expect(
      seen.records.map((record) => [record.tableName, record.domain, record.requestId]),
    ).toEqual([
      ['reconciliation_job', 'OPERATIONS', 'req-2310'],
      ['reconciliation_job_ticket', 'OPERATIONS', 'req-2310'],
      ['reconciliation_job_ticket', 'OPERATIONS', 'req-2310'],
    ]);
    // Undone, the change and the job went together: neither is there.
    expect(await api.project.count({ where: { id: seen.project } })).toBe(0);
    expect(await api.reconciliationJob.count({ where: { id: seen.job.id } })).toBe(0);
    expect(
      await api.reconciliationJobTicket.count({ where: { reconciliationJobId: seen.job.id } }),
    ).toBe(0);
  });

  it('a job that can’t be written takes the change with it; a change that fails takes the job', async () => {
    const name = `Bayline County ${randomUUID()}`;
    // The job fails (a project nobody has): the client written before it is gone too.
    await expect(
      api.$write(actor, async (tx) => {
        await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
        await tx.client.create({ data: { ...bayline, name } });
        await new ReconciliationJobs(tx).queue({
          projectId: randomUUID(),
          trigger: 'CORRECTION',
          requestedById: dana,
          tickets: [{ workflow: 'LOAD', ticketNumber: '101001' }],
        });
      }),
    ).rejects.toThrow('reconciliation_job_project_id_fkey');
    expect(await api.client.count({ where: { name } })).toBe(0);
    // The change fails after its job was queued: the job is gone too.
    let queuedId = '';
    await expect(
      api.$write(actor, async (tx) => {
        await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
        const project = await tx.project.create({ data: await p1In(tx) });
        queuedId = await new ReconciliationJobs(tx).queue({
          projectId: project.id,
          trigger: 'CORRECTION',
          requestedById: dana,
          tickets: [{ workflow: 'LOAD', ticketNumber: '101001' }],
        });
        await tx.project.update({ where: { id: project.id }, data: { timeZone: 'Mars/Olympus' } });
      }),
    ).rejects.toThrow();
    expect(queuedId).not.toBe('');
    expect(await api.reconciliationJob.count({ where: { id: queuedId } })).toBe(0);
  });

  it('a job names at least one ticket', async () => {
    await expect(
      undone(api, actor, async (tx) => {
        await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
        const project = await tx.project.create({ data: await p1In(tx) });
        return new ReconciliationJobs(tx).queue({
          projectId: project.id,
          trigger: 'SYNC',
          tickets: [],
        });
      }),
    ).rejects.toThrow('A job names at least one ticket.');
  });
});
