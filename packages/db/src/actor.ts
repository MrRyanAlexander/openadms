// Every write states who is writing (ARCHITECTURE §5.3; invariant 3; ADR-270 (4), 273).
// The database audits every insert and update by trigger and refuses one whose transaction hasn't
// stated its actor and source. This extension is the one way the API and the worker write: $write
// opens a database transaction whose first statement states the actor, as transaction-local
// settings, then runs the work in it. The settings end with the transaction, so a pooled
// connection never carries one writer's actor into another's work. A write outside $write has no
// actor, and the database refuses it.
import type { AuditSource, Prisma, PrismaClient } from './generated/prisma/client.ts';

export interface Actor {
  // The User making the change; the worker states the system actor (system-actor.ts).
  readonly actorId: string;
  readonly source: AuditSource;
  // The phone, when the change came from one.
  readonly deviceId?: string;
  // Why: a correction's, a void's or a reprocess's reason.
  readonly reason?: string;
  // The API request, to trace a change back to its call.
  readonly requestId?: string;
}

// Extends a client with $write. Applied once, by openDatabase, to the service's client. `requestNow`
// is the service's answer to "which request is this work for?": the API's says the request it is
// answering, so that no write of a service can leave its request out (ADR-390); an actor that
// states a request keeps its own.
export function statesTheActor(client: PrismaClient, requestNow?: () => string | undefined) {
  return client.$extends({
    name: 'states-the-actor',
    client: {
      // Runs the work as one database transaction, attributed to the actor; all of it commits, or
      // none of it does.
      $write<T>(actor: Actor, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return client.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT
            set_config('adms.actor_id', ${actor.actorId}, true),
            set_config('adms.source', ${actor.source}, true),
            set_config('adms.device_id', ${actor.deviceId ?? ''}, true),
            set_config('adms.reason', ${actor.reason ?? ''}, true),
            set_config('adms.request_id', ${actor.requestId ?? requestNow?.() ?? ''}, true)`;
          return work(tx);
        });
      },
      // Runs reads as one database transaction that can write nothing: what a service reads
      // through code written for a piece of work (the rules, read one way by setup and by the
      // worker, ADR-359), when it has none open.
      $read<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return client.$transaction(async (tx) => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          return work(tx);
        });
      },
    },
  });
}
