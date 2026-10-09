// Every read for a read-only viewer states who is reading (ARCHITECTURE §5.5; AC-10-30; BACKLOG
// C22; ADR-270 (7), 315, 434). The database shows the read-only login only what the stated
// viewer's own record allows (their projects, their kind, their contractor, whether they see
// private citizens), and nothing at all where none is stated. This is the one way the API reads
// as that login: $viewed opens a database transaction that can write nothing, whose first
// statement states the viewer as a transaction-local setting, then runs the reads in it. The
// setting ends with the transaction, so a pooled connection never carries one viewer into
// another's read. The client itself is kept inside: a read outside $viewed can't be written.
import { PrismaPg } from '@prisma/adapter-pg';

import type { Connection } from './database.ts';
import { PrismaClient, type Prisma } from './generated/prisma/client.ts';

const anId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ViewerDatabase {
  private readonly client: PrismaClient;

  constructor(client: PrismaClient) {
    this.client = client;
  }

  // Runs the reads as one database transaction, as the viewer. `viewerId` is the signed-in
  // person's own id: what they may see is the database's to read from their record.
  $viewed<T>(viewerId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if (!anId.test(viewerId)) {
      return Promise.reject(new Error('A viewer’s read states the viewer: a person’s own id.'));
    }
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$queryRaw`SELECT set_config('adms.viewer_id', ${viewerId}, true)`;
      return work(tx);
    });
  }

  $disconnect(): Promise<void> {
    return this.client.$disconnect();
  }
}

// The read-only login's way into Postgres: its own URL, from the API's env file (the installer
// writes it; ADR-266). Never logged.
export function openViewerDatabase(connection: Pick<Connection, 'url' | 'maxConnections'>) {
  const adapter = new PrismaPg({
    connectionString: connection.url,
    ...(connection.maxConnections === undefined ? {} : { max: connection.maxConnections }),
  });
  return new ViewerDatabase(new PrismaClient({ adapter }));
}
