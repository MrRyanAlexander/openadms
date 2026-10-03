// What every setup service shares (spec/parts/01-setup.md; ARCHITECTURE §5.3; ADR-273, 316). One
// call is one thing a person does on a setup screen, and one piece of work in the database: it is
// written through db.$write as that person, from the back office, so the database audits each row
// with them as its actor, and all of it is saved or none of it is.
//
// Setup refuses only a bad setting (AC-01-80): the domain's rules say which, in plain words, and
// the call answers with the refusal and saves nothing. A warning is saved as it is and handed
// back. What the database's own constraints refuse (a second form of one document type, a pay
// item code the project already has…) isn't caught here: the call throws, and nothing is saved.
// Who may do setup (an admin, or a manager/analyst granted it) is read at sign-in, Phase 2.
import type { Database, Prisma } from '@open-adms/db';
import type { SetupWarning } from '@open-adms/domain';

// A setting setup won't save, and why.
export interface Refusal {
  readonly code: string;
  readonly message: string;
}

export type Outcome<T> =
  | { readonly saved: true; readonly record: T; readonly warnings: readonly SetupWarning[] }
  | { readonly saved: false; readonly refusal: Refusal };

// The time a service states when it archives something: the server's, or a story's.
export interface Clock {
  now(): Date;
}

// Thrown inside a piece of work to undo it; the service answers with the refusal.
export class Refused extends Error {
  readonly refusal: Refusal;

  constructor(refusal: Refusal) {
    super(refusal.message);
    this.refusal = refusal;
  }
}

export type Warn = (warnings: readonly SetupWarning[]) => void;

export abstract class SetupService {
  protected readonly db: Database;
  protected readonly clock: Clock;

  constructor(db: Database, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  // Runs the work as the person, in one database transaction.
  protected async write<T>(
    person: string,
    work: (tx: Prisma.TransactionClient, warn: Warn) => Promise<T>,
  ): Promise<Outcome<T>> {
    const warnings: SetupWarning[] = [];
    try {
      const record = await this.db.$write({ actorId: person, source: 'BACK_OFFICE' }, (tx) =>
        work(tx, (more) => {
          warnings.push(...more);
        }),
      );
      return { saved: true, record, warnings };
    } catch (error) {
      if (error instanceof Refused) return { saved: false, refusal: error.refusal };
      throw error;
    }
  }
}

// A calendar day (2026-10-12) as the database's date.
export function day(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
