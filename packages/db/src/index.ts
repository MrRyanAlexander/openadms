// Open ADMS database: the Prisma client, extended so every write states its actor, and the seed
// (ARCHITECTURE §5, §18). Only this package and the two server apps touch Postgres (invariant 12).
export { statesTheActor, type Actor } from './actor.ts';
export { openDatabase, type Connection, type Database } from './database.ts';
export { Seed, type SeedOptions } from './seed.ts';
export { systemActor, systemActorId, systemActorName } from './system-actor.ts';
export * from './generated/prisma/client.ts';
