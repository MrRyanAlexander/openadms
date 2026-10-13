// The worker: reconciliation, pricing, repricing and media jobs (ARCHITECTURE §13). Phase 1
// builds it task by task: what it asks the map servers, and the mileage it keeps, came first
// (ADR-349); then the run itself, unpriced (BACKLOG 1.5.9, ADR-352). Its process is `main.ts`
// (BACKLOG 2.3.2, ADR-419): it drains the job queue. The scenario harness runs the same job loop
// on each story's database and clock (2.7.1 part 3, ADR-494).
export { MapServers, type MapServerSettings } from './mileage/map-servers.ts';
export { Mileages } from './mileage/mileages.ts';
export { Health } from './process/health.ts';
export {
  JobLoop,
  type LoopSettings,
  type ProjectPassed,
  type QueueStanding,
} from './process/job-loop.ts';
export { WorkerLog, type LogStream } from './process/logs.ts';
export {
  Reconciliation,
  type Clock,
  type JobsOutcome,
  type RunAsked,
  type RunOutcome,
  type RunSettings,
  type TicketOutcome,
} from './reconciliation/reconciliation.ts';
export type { MileageStep } from './reconciliation/ticket-work.ts';
export { stoppedWithoutAWord, WaitingJobs } from './reconciliation/waiting-jobs.ts';

export const workspace = 'worker';
