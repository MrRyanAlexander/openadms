// What says the database couldn't do a request's work in time (ARCHITECTURE §5.7, §6, Abuse and
// Output; AC-05-51, AC-10-71; T-17; REQ-210; ADR-524): the caller is told the database is busy
// and how long to wait (`503 BUSY` with `Retry-After`), never that the server failed. Three things
// say it, each with nothing of that piece of work kept, since its transaction was undone:
//
// - **No connection came free in time**: Prisma's `P2028`, "Unable to start a transaction in the
//   given time", after the policy's `DATABASE_CONNECTION_WAIT_MS` waiting on the service's pool.
//   What a burst of phones syncing at once meets (C155, C162 (c)).
// - **The piece of work ran out of time**: Prisma's `P2028` on an expired transaction, which
//   names the time it was given and the time it took, past `DATABASE_WORK_LONGEST_MS`.
// - **A statement was stopped by its time limit**: SQLSTATE 57014, past the login's
//   `STATEMENT_TIMEOUT_MS` (ADR-394; C87).
//
// Every other `P2028` (a transaction not found, one already closed, an inconsistency inside
// Prisma) is the server's own failure, and stays one. Read as Prisma 7.10.0 throws them, seen on
// the installation's database (2026-10-14; `database-busy.test.ts` asks the real one).

export type BusyWhy = 'CONNECTION_WAIT' | 'WORK_EXPIRED' | 'STATEMENT_TIMEOUT';

interface Thrown {
  readonly name?: unknown;
  readonly code?: unknown;
  readonly message?: unknown;
  readonly meta?: {
    readonly timeout?: unknown;
    readonly timeTaken?: unknown;
    readonly driverAdapterError?: { readonly cause?: { readonly originalCode?: unknown } };
  };
}

const couldNotStart = 'Unable to start a transaction in the given time.';

// Why the database was busy, where what was thrown says it was; undefined for anything else.
export function databaseBusyOf(thrown: unknown): BusyWhy | undefined {
  if (typeof thrown !== 'object' || thrown === null) return undefined;
  const { name, code, message, meta } = thrown as Thrown;
  if (name !== 'PrismaClientKnownRequestError') return undefined;
  if (code === 'P2028') {
    if (typeof message === 'string' && message.endsWith(couldNotStart)) return 'CONNECTION_WAIT';
    if (typeof meta?.timeout === 'number' && typeof meta.timeTaken === 'number') {
      return 'WORK_EXPIRED';
    }
    return undefined;
  }
  return meta?.driverAdapterError?.cause?.originalCode === '57014'
    ? 'STATEMENT_TIMEOUT'
    : undefined;
}
