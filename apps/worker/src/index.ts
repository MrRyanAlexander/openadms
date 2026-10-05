// The worker: reconciliation, pricing, repricing and media jobs (ARCHITECTURE §13). Phase 1
// builds it task by task, with no process of its own until the run (BACKLOG 1.5.9): what it asks
// the map servers, and the mileage it keeps, came first (ADR-349).
export { MapServers, type MapServerSettings } from './mileage/map-servers.ts';
export { Mileages } from './mileage/mileages.ts';

export const workspace = 'worker';
