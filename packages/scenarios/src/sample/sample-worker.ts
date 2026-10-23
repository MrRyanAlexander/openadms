// The worker's side of the sample (sample-projects.ts): nobody asks the worker for a run. A sync, a
// person's act or a setup change queued its job, and the worker's own run (`Reconciliation`, as
// its job loop runs it, under the policy) takes the sample's projects' waiting jobs up, on the
// sample's clock, each project under its own lock (ADR-418). At an installation its own worker may
// take one up first: its run then holds the project's lock, and the sample waits for it. Every
// completed load, status, flag, zone, mileage and transaction is the worker's conclusion, drawn
// from the field events the phones sent; the loader writes none of them.
import type { Database } from '@open-adms/db';
import { MapServers, Mileages, Reconciliation } from '@open-adms/worker';

import { localMapServers } from '../map-servers.ts';
import type { StoryContext } from '../runner.ts';

// How long the sample waits for the installation's own worker to finish a run it took up.
const patienceMs = 10 * 60_000;

export class SampleWorker {
  private readonly api: Database;
  private readonly reconciliation: Reconciliation;
  private readonly tries: number;
  private readonly ticketsARun: number;
  private readonly pauseMs: number;

  constructor(story: StoryContext, pauseMs = 1_000) {
    const { policy } = story;
    this.api = story.api;
    this.tries = policy.jobTriesBeforeSetAside;
    this.ticketsARun = policy.jobTicketsAtMost;
    this.pauseMs = pauseMs;
    this.reconciliation = new Reconciliation(
      story.worker,
      story.clock,
      {
        crewItemHoursLimit: policy.crewDayHours,
        deviceClockOffLimitMinutes: policy.deviceClockOffLimitMinutes,
        longestRunMs: 600_000,
      },
      new Mileages(new MapServers(localMapServers())),
    );
  }

  // Every job waiting on these projects worked, run after run, by this run or the installation's
  // own worker. A job set aside (its tries spent) stops the load, saying why.
  async settled(projectIds: readonly string[]): Promise<void> {
    const until = Date.now() + patienceMs;
    for (;;) {
      const setAside = await this.api.reconciliationJob.findFirst({
        where: { projectId: { in: [...projectIds] }, setAsideAt: { not: null } },
        select: { lastError: true },
      });
      if (setAside !== null) {
        throw new Error(`The worker set a job of the sample aside: ${setAside.lastError ?? ''}`);
      }
      const waiting = await this.api.reconciliationJob.count({
        where: { projectId: { in: [...projectIds] }, finishedAt: null, setAsideAt: null },
      });
      if (waiting === 0) return;
      let worked = false;
      for (const projectId of projectIds) {
        const outcome = await this.reconciliation.waitingJobs(
          projectId,
          this.tries,
          this.ticketsARun,
        );
        if (outcome.worked) worked = true;
      }
      if (worked) continue;
      if (Date.now() > until) {
        throw new Error('The sample’s jobs waited ten minutes and no run finished them.');
      }
      await new Promise((done) => setTimeout(done, this.pauseMs));
    }
  }
}
