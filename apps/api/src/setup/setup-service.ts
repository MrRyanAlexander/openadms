// What every setup service shares (spec/parts/01-setup.md; ARCHITECTURE §5.3; ADR-273, 316). One
// call is one thing a person does on a setup screen, and one piece of work in the database: it is
// written through db.$write as that person, from the back office, so the database audits each row
// with them as its actor, and all of it is saved or none of it is.
//
// Setup refuses only a bad setting (AC-01-80): the domain's rules say which, in plain words, and
// the call answers with the refusal and saves nothing. A warning is saved as it is and handed
// back. What the database's own constraints refuse (a second form of one document type, a pay
// item code the project already has…) isn't caught here: the call throws, nothing is saved, and
// the API answers it plainly (process/database-refusal.ts).
//
// Who may change the setup (an admin, or a manager/analyst granted Setup) is read here, inside the
// same piece of work and before anything is changed, whatever the door already asked (ADR-364,
// 424): `setup` is what every setup service writes through.
import type { Actor, Database, Prisma } from '@open-adms/db';
import { SetupRights, type Policy, type SetupWarning } from '@open-adms/domain';

import { WorkQueue, type WorkAsked, type WorkQueued } from '../jobs/work-queue.ts';

// A setting setup won't save, and why.
export interface Refusal {
  readonly code: string;
  readonly message: string;
}

// What a saved change asked the worker for, said to whoever made it (the user, ADR-422): how
// many tickets were queued to be worked again, and how many it reached that are locked as
// invoiced and so were left exactly as they are.
export interface QueuedBySetup {
  readonly jobs: readonly string[];
  readonly tickets: number;
  readonly lockedAsInvoiced: number;
}

export type Outcome<T> =
  | {
      readonly saved: true;
      readonly record: T;
      readonly warnings: readonly SetupWarning[];
      // Stated where the change queued work or passed a locked ticket by.
      readonly queued?: QueuedBySetup;
    }
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

  // Runs the work as the person, from the back office, in one database transaction.
  protected write<T>(
    person: string,
    work: (tx: Prisma.TransactionClient, warn: Warn) => Promise<T>,
  ): Promise<Outcome<T>> {
    return this.writeAs({ actorId: person, source: 'BACK_OFFICE' }, work);
  }

  // A change to the firm's setup, by a person at the back office: refused, with nothing changed,
  // to anybody who may not make one now.
  protected setup<T>(
    person: string,
    work: (tx: Prisma.TransactionClient, warn: Warn) => Promise<T>,
  ): Promise<Outcome<T>> {
    return this.write(person, async (tx, warn) => {
      const user = await tx.user.findUnique({ where: { id: person } });
      const granted =
        user === null
          ? []
          : await tx.userPermission.findMany({ where: { userId: person, archivedAt: null } });
      const refusal = new SetupRights(
        user === null
          ? null
          : {
              name: user.name,
              role: user.role,
              archived: user.archivedAt !== null,
              granted: granted.map((grant) => grant.permission),
            },
      ).refusal();
      if (refusal !== null) throw new Refused(refusal);
      return work(tx, warn);
    });
  }

  // The same, as whoever is stated: a monitor on a phone states the phone too (ADR-321).
  protected async writeAs<T>(
    actor: Actor,
    work: (tx: Prisma.TransactionClient, warn: Warn) => Promise<T>,
  ): Promise<Outcome<T>> {
    const warnings: SetupWarning[] = [];
    try {
      const record = await this.db.$write(actor, (tx) =>
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

// A service whose changes ask the worker for reconciliation (ARCHITECTURE §13; ADR-420): it
// queues the job in the piece of work of the change itself, cut to the policy's size, and
// nobody asks the worker afterwards.
export abstract class QueueingService extends SetupService {
  protected readonly policy: Policy;

  constructor(db: Database, clock: Clock, policy: Policy) {
    super(db, clock);
    this.policy = policy;
  }

  // What each open piece of work has queued so far, for its answer.
  private readonly asks = new WeakMap<Prisma.TransactionClient, WorkQueued[]>();

  protected workQueue(tx: Prisma.TransactionClient): WorkQueue {
    return new WorkQueue(tx, this.policy.jobTicketsAtMost);
  }

  // Queues the work in the open piece of work, and keeps what was queued for the answer.
  protected async ask(tx: Prisma.TransactionClient, asked: WorkAsked): Promise<WorkQueued> {
    return this.keep(tx, await this.workQueue(tx).queue(asked));
  }

  // Keeps for the answer what was queued in the open piece of work: this service's own ask, or
  // what another service it worked through queued there.
  protected keep(tx: Prisma.TransactionClient, queued: WorkQueued): WorkQueued {
    const kept = this.asks.get(tx);
    if (kept === undefined) this.asks.set(tx, [queued]);
    else kept.push(queued);
    return queued;
  }

  // As every service's piece of work, and the answer says what it queued: the tickets to be
  // worked again, and the ones locked as invoiced that it left as they are (ADR-422).
  protected override async writeAs<T>(
    actor: Actor,
    work: (tx: Prisma.TransactionClient, warn: Warn) => Promise<T>,
  ): Promise<Outcome<T>> {
    let asks: readonly WorkQueued[] = [];
    const outcome = await super.writeAs(actor, async (tx, warn) => {
      // A caller may hand several calls one piece of work: only this call's asks are its own.
      const before = this.asks.get(tx)?.length ?? 0;
      const record = await work(tx, warn);
      asks = (this.asks.get(tx) ?? []).slice(before);
      return record;
    });
    if (!outcome.saved || asks.length === 0) return outcome;
    const count = (pick: (queued: WorkQueued) => readonly { ticketNumber: string }[]): number =>
      new Set(asks.flatMap((queued) => pick(queued).map((ticket) => JSON.stringify(ticket)))).size;
    return {
      ...outcome,
      queued: {
        jobs: asks.flatMap((queued) => queued.jobs),
        tickets: count((queued) => queued.tickets),
        lockedAsInvoiced: count((queued) => queued.lockedAsInvoiced),
      },
    };
  }

  // A setup change by a person: every ticket of the project its query finds is queued, a void
  // one and one locked as invoiced left off (ADR-090, 360). Where it finds none, a job for the
  // records that are no ticket's is queued instead, if the change touched one. Setup moves a
  // ticket's own conclusions, never what makes two tickets neighbours, so no neighbour is
  // looked for here (a certification's capacity is the exception, and its service's own).
  protected async setupChanged(
    tx: Prisma.TransactionClient,
    person: string,
    projectId: string,
    touched: Prisma.FieldEventWhereInput = {},
    projectRecords = false,
  ): Promise<void> {
    await this.ask(tx, {
      projectId,
      trigger: 'SETUP_CHANGE',
      requestedById: person,
      tickets: [],
      others: await this.workQueue(tx).ticketsWith(projectId, touched),
      projectRecords,
    });
  }
}

// A calendar day (2026-10-12) as the database's date.
export function day(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
