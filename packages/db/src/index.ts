// Open ADMS database: the Prisma client, extended so every write states its actor, and the seed
// (ARCHITECTURE §5, §18). Only this package and the two server apps touch Postgres (invariant 12).
export { statesTheActor, type Actor, type PieceOfWork } from './actor.ts';
export { openDatabase, type Connection, type Database } from './database.ts';
export { byDeviceKey, deviceKeyActorId, deviceKeyActorName } from './device-key-actor.ts';
export { ReconciliationJobs, type JobAsked, type JobTicket } from './reconciliation-jobs.ts';
export { RuleRows, type RuleNamed } from './rule-rows.ts';
export { Seed, type SeedOptions } from './seed.ts';
export { systemActor, systemActorId, systemActorName } from './system-actor.ts';
export {
  masterPasscodeActorId,
  masterPasscodeActorName,
  underMasterPasscode,
} from './master-passcode-actor.ts';
export { openViewerDatabase, ViewerDatabase } from './viewer.ts';
export * from './generated/prisma/client.ts';
