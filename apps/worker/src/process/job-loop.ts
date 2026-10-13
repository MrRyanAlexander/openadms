// What the worker's process does, over and over (ARCHITECTURE §13, "Jobs, not requests"; ADR-418,
// 419): it looks for the projects that have a job waiting and hands each to the run, one project
// after another. The run takes the project's lock, so a second worker's process would find a
// project under way and leave it. A run takes up only as many tickets as the policy lets, so a
// pass that finished jobs and left others waiting is followed by the next at once. A project
// whose try fails never stops the others'. What it
// did is in the log, by ids only; how many jobs wait and how many are set aside is kept for the
// health answer. A pass also answers what it did with each project, for whoever asked for the
// pass (a story: BACKLOG 2.7.1 part 3, ADR-494).
import type { Database } from '@open-adms/db';

import type { JobsOutcome, Reconciliation } from '../reconciliation/reconciliation.ts';
import type { WorkerLog } from './logs.ts';

export interface QueueStanding {
  // Jobs neither finished nor set aside, when the worker last looked.
  readonly jobsWaiting: number;
  // Jobs set aside: kept, no longer taken up, for whoever runs the installation.
  readonly jobsSetAside: number;
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
}

export class JobLoop {
  private readonly db: Database;
  private readonly reconciliation: Reconciliation;
  private readonly settings: LoopSettings;
  private readonly log: WorkerLog;
  private stopped = false;
  private wake: (() => void) | undefined;
  private last: QueueStanding = { jobsWaiting: 0, jobsSetAside: 0 };
  // Whether the last pass finished a job: with more still waiting, the next pass follows at
  // once, so a setup change cut into many jobs isn't worked one job every poll.
  private finishedSome = false;

  constructor(
    db: Database,
    reconciliation: Reconciliation,
    settings: LoopSettings,
    log: WorkerLog,
  ) {
    this.db = db;
    this.reconciliation = reconciliation;
    this.settings = settings;
    this.log = log;
  }

  // What the health answer says of the queue.
  get standing(): QueueStanding {
    return this.last;
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
      if (this.finishedSome && this.last.jobsWaiting > 0) continue;
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
      try {
        passed.push({ projectId, outcome: await this.project(projectId) });
      } catch (caught) {
        this.log.error('A project’s jobs could not be taken up.', caught, { projectId });
        passed.push({ projectId, error: caught });
      }
    }
    this.last = {
      jobsWaiting: await this.db.reconciliationJob.count({
        where: { finishedAt: null, setAsideAt: null },
      }),
      jobsSetAside: await this.db.reconciliationJob.count({ where: { setAsideAt: { not: null } } }),
    };
    return passed;
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
    if (outcome.setAside.length > 0) {
      this.log.warn(
        'Jobs were set aside after too many tries: they are kept, and wait for a person.',
        {
          projectId,
          jobs: outcome.setAside,
        },
      );
    }
    return outcome;
  }
}
