// The worker: reconciliation, pricing, repricing and media jobs (ARCHITECTURE §13). Phase 1
// builds it task by task: what it asks the map servers, and the mileage it keeps, came first
// (ADR-349); then the run itself, unpriced (BACKLOG 1.5.9, ADR-352). It has no process of its
// own yet: the scenario harness drives a run, and Phase 2's job queue will start one.
export { MapServers, type MapServerSettings } from './mileage/map-servers.ts';
export { Mileages } from './mileage/mileages.ts';
export {
  Reconciliation,
  type Clock,
  type RunAsked,
  type RunOutcome,
  type RunSettings,
  type TicketOutcome,
} from './reconciliation/reconciliation.ts';
export type { MileageStep } from './reconciliation/ticket-work.ts';

export const workspace = 'worker';
