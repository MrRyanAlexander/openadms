// What the worker's process does, over and over (ARCHITECTURE §13, "Jobs, not requests"; ADR-418,
// 419): it looks for the projects that have a job waiting and hands each to the run, one project
// after another. The run takes the project's lock, so a second worker's process would find a
// project under way and leave it. A run takes up only as many tickets as the policy lets, so a
// pass that finished jobs and left others waiting is followed by the next at once. A project
// whose try fails never stops the others'. What it
// did is in the log, by ids only. A pass also answers what it did with each project, for whoever
// asked for the pass (a story: BACKLOG 2.7.1 part 3, ADR-494).
//
// Its health (BACKLOG 2.7.2 part 4, C38; ADR-507): the loop looks at the queue as a pass begins
// and as it ends (how many jobs wait, how many are set aside, since when the oldest has waited),
// and keeps the time of its last sign of life (a look, a project's run begun). The health
// answer reads them as it is asked: unavailable until the first look has been read, while the
// last look could not be read (the database away), and once no sign has come for longer than a
// run may take; otherwise ok. How long the oldest job has waited is a figure, never a verdict:
// how long is too long is the firm's to say, in its own monitor.
import type { Database } from '@open-adms/db';
import type { Policy } from '@open-adms/domain';

import type { JobsOutcome, Reconciliation } from '../reconciliation/reconciliation.ts';
import type { WorkerLog } from './logs.ts';

// Why the worker isn't well, when it isn't.
export type WorkerProblem = 'NOT_YET_LOOKED' | 'QUEUE_NOT_READ' | 'STALLED';

// What the health answer says, as it is asked. The figures are the last look's that was read:
// none before the first.
export interface WorkerStanding {
  readonly status: 'ok' | 'unavailable';
  readonly problem?: WorkerProblem;
  // Jobs neither finished nor set aside.
  readonly jobsWaiting: number | null;
  // Jobs set aside: kept, no longer taken up, for whoever runs the installation.
  readonly jobsSetAside: number | null;
  // How long, in whole seconds to now, the oldest job still waiting at that look has waited; 0
  // with none waiting.
  readonly oldestJobWaitingSeconds: number | null;
}

// What one pass did with one project's jobs: the run's own answer, or what stopped the try
// before the run could answer (logged, by its kind only).
export type ProjectPassed =
  | { readonly projectId: string; readonly outcome: JobsOutcome }
  | { readonly projectId: string; readonly error: unknown };

export interface LoopSettings {
  readonly triesBeforeSetAside: number;
  // The most tickets one run takes up: JOB_TICKETS_AT_MOST.
  readonly ticketsARun: number;
  readonly pollMs: number;
  // How long the loop may go without a sign of life before its health answer says it has
  // stalled: the longest a run may wait for its connection and then hold its lock, a map
  // server's answer, and one wait between looks (main.ts; ADR-507).
  readonly stalledAfterMs: number;
}

interface Looked {
  readonly jobsWaiting: number;
  readonly jobsSetAside: number;
  readonly oldestQueuedAt: Date | null;
}

export class JobLoop {
  private readonly db: Database;
  private readonly reconciliation: Reconciliation;
  private readonly settings: LoopSettings;
  private readonly log: WorkerLog;
  private readonly clock: { now(): Date };
  private stopped = false;
  private wake: (() => void) | undefined;
  // The last look at the queue that was read, and whether the latest one could be.
  private last: Looked | undefined;
  private lastLookFailed = false;
  private lastSign: Date;
  // Whether the last pass finished a job: with more still waiting, the next pass follows at
  // once, so a setup change cut into many jobs isn't worked one job every poll.
  private finishedSome = false;

  constructor(
    db: Database,
    reconciliation: Reconciliation,
    settings: LoopSettings,
    log: WorkerLog,
    clock: { now(): Date },
  ) {
    this.db = db;
    this.reconciliation = reconciliation;
    this.settings = settings;
    this.log = log;
    this.clock = clock;
    this.lastSign = clock.now();
  }

  // How long the loop may go without a sign of life, from the policy: a run may wait as long for
  // its connection as it may then hold its lock (reconciliation.ts), a ticket's map question may
  // be out as that time runs out, and the loop waits between looks. Twenty minutes and 35 seconds
  // under the release's values. No value of its own: each part is one already.
  static stalledAfterMs(
    policy: Pick<
      Policy,
      'reconciliationRunLongestMinutes' | 'mapServerAnswerSeconds' | 'jobQueuePollSeconds'
    >,
  ): number {
    return (
      2 * policy.reconciliationRunLongestMinutes * 60_000 +
      policy.mapServerAnswerSeconds * 1_000 +
      policy.jobQueuePollSeconds * 1_000
    );
  }

  // What the health answer says, now.
  get standing(): WorkerStanding {
    const now = this.clock.now().getTime();
    const problem: WorkerProblem | undefined =
      now - this.lastSign.getTime() > this.settings.stalledAfterMs
        ? 'STALLED'
        : this.lastLookFailed
          ? 'QUEUE_NOT_READ'
          : this.last === undefined
            ? 'NOT_YET_LOOKED'
            : undefined;
    const last = this.last;
    return {
      status: problem === undefined ? 'ok' : 'unavailable',
      ...(problem === undefined ? {} : { problem }),
      jobsWaiting: last?.jobsWaiting ?? null,
      jobsSetAside: last?.jobsSetAside ?? null,
      oldestJobWaitingSeconds:
        last === undefined
          ? null
          : last.oldestQueuedAt === null
            ? 0
            : Math.max(0, Math.floor((now - last.oldestQueuedAt.getTime()) / 1_000)),
    };
  }

  // Until stopped: a pass, then a wait. A pass that fails (the database is away) is logged and
  // tried again after the wait.
  async run(): Promise<void> {
    while (!this.isStopped()) {
      try {
        await this.pass();
      } catch (caught) {
        this.log.error('The worker could not look at its queue.', caught);
      }
      if (this.isStopped()) break;
      if (this.finishedSome && (this.last?.jobsWaiting ?? 0) > 0) continue;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.settings.pollMs);
        this.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  }

  private isStopped(): boolean {
    return this.stopped;
  }

  // Lets the pass under way finish, then ends the loop.
  stop(): void {
    this.stopped = true;
    this.wake?.();
  }

  // One look at the queue: every project with a job waiting, each worked once; what became of
  // each.
  async pass(): Promise<readonly ProjectPassed[]> {
    await this.look();
    const projects = await this.db.reconciliationJob.findMany({
      where: { finishedAt: null, setAsideAt: null },
      select: { projectId: true },
      distinct: ['projectId'],
      orderBy: { projectId: 'asc' },
    });
    this.finishedSome = false;
    const passed: ProjectPassed[] = [];
    for (const { projectId } of projects) {
      if (this.stopped) break;
      this.signed();
      try {
        passed.push({ projectId, outcome: await this.project(projectId) });
      } catch (caught) {
        this.log.error('A project’s jobs could not be taken up.', caught, { projectId });
        passed.push({ projectId, error: caught });
      }
    }
    await this.look();
    return passed;
  }

  // How the queue stands, for the health answer: kept when it was read, marked when it couldn't
  // be. Either way it is a sign of life.
  private async look(): Promise<void> {
    const waiting = { finishedAt: null, setAsideAt: null };
    try {
      this.last = {
        jobsWaiting: await this.db.reconciliationJob.count({ where: waiting }),
        jobsSetAside: await this.db.reconciliationJob.count({
          where: { setAsideAt: { not: null } },
        }),
        oldestQueuedAt: (
          await this.db.reconciliationJob.aggregate({ where: waiting, _min: { queuedAt: true } })
        )._min.queuedAt,
      };
      this.lastLookFailed = false;
    } catch (caught) {
      this.lastLookFailed = true;
      throw caught;
    } finally {
      this.signed();
    }
  }

  private signed(): void {
    this.lastSign = this.clock.now();
  }

  private async project(projectId: string): Promise<JobsOutcome> {
    const outcome = await this.reconciliation.waitingJobs(
      projectId,
      this.settings.triesBeforeSetAside,
      this.settings.ticketsARun,
    );
    if (outcome.worked) {
      this.finishedSome = true;
      this.log.info('A run worked its project’s waiting jobs.', {
        projectId,
        runId: outcome.run.runId,
        jobs: outcome.jobs,
        ticketsDone: outcome.run.ticketsDone,
        ticketsFailed: outcome.run.ticketsFailed,
      });
    } else if (outcome.reason === 'FAILED') {
      // Why is on each job (`lastError`), where the back office's login can't read it into a
      // page by accident; the log says only that it happened and to which jobs.
      this.log.warn('A try at a project’s jobs failed whole; they wait for the next.', {
        projectId,
        jobs: outcome.jobs,
      });
    }
    if (outcome.setAside.length > 0) await this.setAside(projectId, outcome);
    return outcome;
  }

  // A job set aside is an error a person must look into (ADR-498): its tickets stand as they
  // last did, money possibly wrong, until someone puts the job back through the reprocess
  // endpoint by its id. One line a job, by the fixed code `JOB_SET_ASIDE` a filter finds: what
  // queued it, how many tickets it names, how many tries it had, and the kind of failure. Never
  // the error's words (`lastError`, on the job), a ticket's number or a person.
  private async setAside(projectId: string, outcome: JobsOutcome): Promise<void> {
    const jobs = await this.db.reconciliationJob.findMany({
      where: { id: { in: [...outcome.setAside] } },
      orderBy: { id: 'asc' },
      select: { id: true, trigger: true, attempts: true, _count: { select: { tickets: true } } },
    });
    // A job this try took up failed with the try; one found spent was taken up as often as the
    // policy lets, and its last try never said how it went: the worker stopped first.
    const failedNow = outcome.worked || outcome.reason !== 'FAILED' ? null : outcome;
    for (const job of jobs) {
      const failure =
        failedNow?.jobs.includes(job.id) === true
          ? {
              failure: 'RUN_FAILED',
              failureKind: failedNow.failure.kind,
              failureCode: failedNow.failure.code,
            }
          : { failure: 'STOPPED_WITHOUT_A_WORD' };
      this.log.errorCoded(
        'JOB_SET_ASIDE',
        'A job was set aside after too many tries: it is kept, and waits for a person to put it back.',
        {
          projectId,
          jobId: job.id,
          trigger: job.trigger,
          tickets: job._count.tickets,
          tries: job.attempts,
          ...failure,
        },
      );
    }
  }
}
