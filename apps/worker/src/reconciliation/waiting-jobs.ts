// A project's waiting jobs, as a run takes them up, finishes them or fails (ARCHITECTURE §13,
// "Jobs, not requests"; ADR-418, 419; BACKLOG C94). A job is waiting while it is neither finished
// nor set aside. The worker changes nothing a job asked for: only how it went (`attempts`,
// `finishedAt` with its run, `lastError`, `setAsideAt`), as the system actor, audited by the
// database. Everything here is done while the run holds its project's lock, which is the claim.
import { systemActor, type Database, type Prisma, type ReconciliationTrigger } from '@open-adms/db';

import type { Clock } from './reconciliation.ts';
import type { TicketNamed } from './project-read.ts';

export interface JobTaken {
  readonly id: string;
  // The runs that have taken it up, this one counted.
  readonly attempts: number;
  readonly trigger: ReconciliationTrigger;
  readonly requestedById: string | null;
}

export interface TakenUp {
  // The jobs this run works, the oldest first.
  readonly jobs: readonly JobTaken[];
  // The tickets they name, each once.
  readonly tickets: readonly TicketNamed[];
  // The jobs found spent and set aside instead.
  readonly setAside: readonly string[];
}

// What is written on a job that was taken up as often as the policy lets and never said how it
// went: the process died each time before it could.
export const stoppedWithoutAWord = 'The worker stopped before it could say why.';

export class WaitingJobs {
  private readonly db: Database;
  private readonly clock: Clock;
  private readonly triesBeforeSetAside: number;
  private readonly ticketsARun: number;

  // Both numbers are the policy's: JOB_TRIES_BEFORE_SET_ASIDE and JOB_TICKETS_AT_MOST.
  constructor(db: Database, clock: Clock, triesBeforeSetAside: number, ticketsARun: number) {
    this.db = db;
    this.clock = clock;
    this.triesBeforeSetAside = triesBeforeSetAside;
    this.ticketsARun = ticketsARun;
  }

  // Counts a try on each waiting job before any of its tickets is worked, in a piece of work of
  // its own, so a try that dies is still counted. A job already tried as often as the policy
  // lets is set aside, never taken up again.
  //
  // A run takes up the waiting jobs, the oldest first, until the tickets they name come to the
  // policy's number (ADR-420): always one job, and each next one only while it still fits. The
  // jobs behind them wait for the project's next run, untouched, so a run has a size it can
  // finish however much a setup change queued. A job behind them whose tickets the run already
  // works is taken up too (ADR-506): the run reads every record as it stands after that job's
  // change, so it adds nothing to the run and nothing waits longer for it. A burst's ticket
  // comes as several jobs (each field event's, each photograph's), and each was otherwise
  // worked once a run its jobs fell in.
  async takeUp(projectId: string): Promise<TakenUp> {
    const waiting = await this.db.reconciliationJob.findMany({
      where: { projectId, finishedAt: null, setAsideAt: null },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        attempts: true,
        trigger: true,
        requestedById: true,
        lastError: true,
        tickets: { select: { workflow: true, ticketNumber: true }, orderBy: { id: 'asc' } },
      },
    });
    if (waiting.length === 0) return { jobs: [], tickets: [], setAside: [] };
    const spent = waiting.filter((job) => job.attempts >= this.triesBeforeSetAside);
    const taken: typeof waiting = [];
    const tickets = new Map<string, TicketNamed>();
    let full = false;
    for (const job of waiting) {
      if (job.attempts >= this.triesBeforeSetAside) continue;
      const withIt = new Map(tickets);
      for (const ticket of job.tickets) {
        withIt.set(JSON.stringify([ticket.workflow, ticket.ticketNumber]), ticket);
      }
      // In the order queued: a job that doesn't fit ends the run's take, and none behind it
      // that would add a ticket goes ahead of it. A job that names none (the records that are
      // no ticket's, which every run checks) is always covered.
      if (taken.length > 0 && withIt.size > this.ticketsARun) full = true;
      if (full && withIt.size > tickets.size) continue;
      taken.push(job);
      for (const [key, ticket] of withIt) tickets.set(key, ticket);
    }
    await this.db.$write(systemActor, async (tx) => {
      for (const job of spent) {
        await tx.reconciliationJob.update({
          where: { id: job.id },
          data: { setAsideAt: this.clock.now(), lastError: job.lastError ?? stoppedWithoutAWord },
          select: { id: true },
        });
      }
      for (const job of taken) {
        await tx.reconciliationJob.update({
          where: { id: job.id },
          data: { attempts: { increment: 1 } },
          select: { id: true },
        });
      }
    });
    return {
      jobs: taken.map((job) => ({
        id: job.id,
        attempts: job.attempts + 1,
        trigger: job.trigger,
        requestedById: job.requestedById,
      })),
      tickets: [...tickets.values()],
      setAside: spent.map((job) => job.id),
    };
  }

  // The jobs a run worked, finished under it: written in the run's own closing piece of work.
  async finish(tx: Prisma.TransactionClient, jobIds: readonly string[], runId: string) {
    for (const id of jobIds) {
      await tx.reconciliationJob.update({
        where: { id },
        data: { finishedAt: this.clock.now(), reconciliationRunId: runId },
        select: { id: true },
      });
    }
  }

  // A try that failed whole: why is kept on each job it took up, and a job on its last try is
  // set aside. Answers the jobs set aside.
  async failed(jobs: readonly JobTaken[], error: string): Promise<string[]> {
    const words = error.trim() === '' ? stoppedWithoutAWord : error;
    const spent = jobs.filter((job) => job.attempts >= this.triesBeforeSetAside);
    await this.db.$write(systemActor, async (tx) => {
      for (const job of jobs) {
        await tx.reconciliationJob.update({
          where: { id: job.id },
          data: {
            lastError: words,
            ...(spent.includes(job) ? { setAsideAt: this.clock.now() } : {}),
          },
          select: { id: true },
        });
      }
    });
    return spent.map((job) => job.id);
  }
}
