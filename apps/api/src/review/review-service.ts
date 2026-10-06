// What every reviewer's action shares (spec/parts/08-review-and-corrections.md;
// spec/acceptance/08-review-and-corrections.md sections B…D; adms-exceptions "Corrections: in
// place, by permission"; ARCHITECTURE §5.3; ADR-039, 050, 051, 086, 097, 316, 364; KD-25).
//
// One call is one thing a reviewer does to a record, and one piece of work in the database,
// written as that person from the back office: the database audits each row with them as its
// actor and keeps the value before. The service changes field events and the records beside
// them, and nothing the worker concludes: no completed load, flag, status or line (invariants
// 4, 21; the back office's login can't write one).
//
// The person's grant is read here, inside the same piece of work, before anything is changed:
// an admin may do every action, a manager/analyst the ones granted, nobody else any (ADR-364).
//
// Afterwards the ticket reprocesses. The service doesn't run the worker: it answers the run to
// ask for, naming who asked and the tickets it touched, and which of those are locked as
// invoiced, so are left as they are until unlocked (ADR-057). Phase 2's job queue takes that
// answer; until then whoever called the service asks the worker for the run.
import type { Prisma } from '@open-adms/db';
import { Reviewer, type ReviewPermission, type WorkflowName } from '@open-adms/domain';

import { type Outcome, Refused, SetupService } from '../setup/setup-service.ts';

export type Tx = Prisma.TransactionClient;

// A ticket as the worker groups one: its project's workflow and bare number.
export interface TicketNamed {
  readonly workflow: WorkflowName;
  readonly ticketNumber: string;
}

// The run to ask the worker for after a reviewer's action.
export interface Reprocess {
  readonly projectId: string;
  readonly trigger: 'CORRECTION';
  readonly requestedById: string;
  // The tickets the action touched: under a renumber, the number it left and the one it took.
  readonly tickets: readonly TicketNamed[];
  // Those of them locked as invoiced: the run leaves each exactly as it is until a person
  // unlocks it.
  readonly lockedAsInvoiced: readonly TicketNamed[];
}

export interface Reviewed<T> {
  readonly record: T;
  readonly reprocess: Reprocess;
}

// What a piece of review work hands back: the record, its project and the tickets it touched.
export interface Touched<T> {
  readonly record: T;
  readonly projectId: string;
  readonly tickets: readonly TicketNamed[];
}

export const ticketOf = (event: {
  readonly workflow: WorkflowName;
  readonly ticketNumber: string;
}): TicketNamed => ({ workflow: event.workflow, ticketNumber: event.ticketNumber });

export abstract class ReviewService extends SetupService {
  // Runs the work as the person, if they may do it; the note, where one was given, is kept in
  // the audit record of every row the work changes.
  protected review<T>(
    person: string,
    permission: ReviewPermission,
    note: string | undefined,
    work: (tx: Tx) => Promise<Touched<T>>,
  ): Promise<Outcome<Reviewed<T>>> {
    const reason = note?.trim() ?? '';
    return this.writeAs(
      { actorId: person, source: 'BACK_OFFICE', ...(reason === '' ? {} : { reason }) },
      async (tx) => {
        await ReviewService.permitted(tx, person, permission);
        const { record, projectId, tickets } = await work(tx);
        return { record, reprocess: await ReviewService.reprocess(tx, person, projectId, tickets) };
      },
    );
  }

  // Refuses a person who may not do it, before anything is changed.
  protected static async permitted(
    tx: Tx,
    person: string,
    permission: ReviewPermission,
  ): Promise<void> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: person } });
    const granted = await tx.userPermission.findMany({
      where: { userId: person, archivedAt: null },
    });
    const refusal = new Reviewer({
      name: user.name,
      role: user.role,
      archived: user.archivedAt !== null,
      granted: granted.map((grant) => grant.permission),
    }).refusal(permission);
    if (refusal !== null) throw new Refused(refusal);
  }

  // The run to ask for: each ticket once, and which of them a lock in force holds still.
  protected static async reprocess(
    tx: Tx,
    person: string,
    projectId: string,
    touched: readonly TicketNamed[],
  ): Promise<Reprocess> {
    const tickets = [
      ...new Map(touched.map((ticket) => [JSON.stringify(ticket), ticket])).values(),
    ];
    const lockedAsInvoiced: TicketNamed[] = [];
    for (const ticket of tickets) {
      if (await ReviewService.locked(tx, projectId, ticket)) lockedAsInvoiced.push(ticket);
    }
    return { projectId, trigger: 'CORRECTION', requestedById: person, tickets, lockedAsInvoiced };
  }

  // Whether a lock as invoiced is in force on the ticket: on its completed load or haul-out,
  // found by any of its field events, or on its unit rate field event, as the worker asks it.
  private static async locked(tx: Tx, projectId: string, ticket: TicketNamed): Promise<boolean> {
    const events = await tx.fieldEvent.findMany({
      where: { projectId, ...ticket },
      select: { id: true },
    });
    const ids = events.map((event) => event.id);
    const ofIts = {
      OR: [
        { disposalEventId: { in: ids } },
        { collections: { some: { collectionEventId: { in: ids }, dissolvedAt: null } } },
      ],
    };
    const locks = await tx.invoiceLock.count({
      where: {
        unlockedAt: null,
        ...(ticket.workflow === 'UNIT_RATE'
          ? { fieldEventId: { in: ids } }
          : ticket.workflow === 'LOAD'
            ? { completedLoad: ofIts }
            : { completedHaulOut: ofIts }),
      },
    });
    return locks > 0;
  }

  // The tickets of the field events a query finds.
  protected static async ticketsOf(
    tx: Tx,
    where: Prisma.FieldEventWhereInput,
  ): Promise<TicketNamed[]> {
    const events = await tx.fieldEvent.findMany({
      where,
      select: { workflow: true, ticketNumber: true },
      distinct: ['workflow', 'ticketNumber'],
      orderBy: [{ workflow: 'asc' }, { ticketNumber: 'asc' }],
    });
    return events.map(ticketOf);
  }
}
