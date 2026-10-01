// A service's way into Postgres (ARCHITECTURE §5.7; ADR-273): the Prisma client over its own
// login's URL, through the pg driver adapter, extended so every write states its actor.
import { PrismaPg } from '@prisma/adapter-pg';

import { statesTheActor } from './actor.ts';
import { PrismaClient } from './generated/prisma/client.ts';

export interface Connection {
  // The service's own login, from its env file (the installer writes it; ADR-266). Never logged.
  readonly url: string;
  // The most connections the pool opens.
  readonly maxConnections?: number;
}

export function openDatabase(connection: Connection) {
  const adapter = new PrismaPg({
    connectionString: connection.url,
    ...(connection.maxConnections === undefined ? {} : { max: connection.maxConnections }),
  });
  return statesTheActor(new PrismaClient({ adapter }));
}

export type Database = ReturnType<typeof openDatabase>;
