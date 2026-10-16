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
// Tasks 1.8.4's services stand on the same ground: a void, an unvoid and a flag's acceptance
// are marks of their own beside the records, written here and read by the worker (ADR-365, 366).
//
// Task 1.8.5's services stand on it too: a QC mark, a lock as invoiced, its batch and its unlock
// (ADR-367). A QC mark and a lock change nothing the worker reads, so they answer no run; an
// unlock does. **While a ticket is locked as invoiced, a change to its own records is refused
// here** (its field events, their lines and photographs, a void, an acceptance): it is unlocked
// first. A record several tickets share (a certification, an ROE, a scale receipt) is still
// corrected, and each locked ticket on it is named and waits for its unlock.
//
// Afterwards the ticket reprocesses. The service doesn't run the worker and nobody asks it to:
// **the job is queued here, in the action's own piece of work** (ADR-418, 420; AC-10-50), so
// the action and its job are saved together or not at all. The job names the tickets the action
// touched and their neighbours, the other tickets whose conclusions read them (the domain's
// `TicketNeighbours`), as they stood before the action and as they stand after it; a ticket
// locked as invoiced is left off it, and waits for its unlock (ADR-057, 090). The answer says
// what was queued.
import type { Prisma } from '@open-adms/db';
import {
  LockedTicket,
  Reviewer,
  TicketOnItsOwn,
  type ReviewPermission,
  type WorkflowName,
} from '@open-adms/domain';

import { type Outcome, QueueingService, Refused, type Warn } from '../setup/setup-service.ts';

export type Tx = Prisma.TransactionClient;

// A ticket as the worker groups one: its project's workflow and bare number.
export interface TicketNamed {
  readonly workflow: WorkflowName;
  readonly ticketNumber: string;
}

// What a reviewer's action asked the worker for: its job is already queued.
export interface Reprocess {
  readonly projectId: string;
  // An unlock corrects nothing: its run only works the ticket again.
  readonly trigger: 'CORRECTION' | 'REPROCESS';
  readonly requestedById: string;
  // The tickets the action touched: under a renumber, the number it left and the one it took.
  readonly tickets: readonly TicketNamed[];
  // Those of them locked as invoiced: the run leaves each exactly as it is until a person
  // unlocks it.
  readonly lockedAsInvoiced: readonly TicketNamed[];
  // The other tickets queued with them: their neighbours, whose conclusions read them.
  readonly neighbours: readonly TicketNamed[];
  // The jobs queued, in the action's own piece of work; none where it left no ticket to work.
  readonly jobs: readonly string[];
}

// The same before its job is queued.
export type Asked = Omit<Reprocess, 'neighbours' | 'jobs'>;

export interface Reviewed<T> {
  readonly record: T;
  readonly reprocess: Reprocess;
}

// What a piece of review work hands back: the record, its project and the tickets it touched.
export interface Touched<T> {
  readonly record: T;
  readonly projectId: string;
  readonly tickets: readonly TicketNamed[];
  // It touched a record the run flags by itself and no ticket (a survey).
  readonly projectRecords?: boolean;
}

// Called by a piece of review work **before** it changes what makes two tickets neighbours (a
// field event's certification, times, scale receipt or number, the tickets it carries): the
// tickets that read this one as it stands are queued too, since afterwards nothing says so.
export type Moves = (projectId: string, ticket: TicketNamed) => Promise<void>;

// A ticket as a QC mark and a lock name one: its completed load or haul-out (a split as one),
// or a unit rate ticket's one field event; never a single field event of a load (ADR-168).
export type TicketMarked =
  | { readonly completedLoadId: string }
  | { readonly completedHaulOutId: string }
  | { readonly unitRateTicketId: string };

// What a mark on a ticket is written with, and the ticket it is on.
export interface MarkedTicket {
  readonly projectId: string;
  readonly ticket: TicketNamed;
  // Its completed record was dissolved: the ticket is no longer whole.
  readonly dissolved: boolean;
  // The mark's own columns for it.
  readonly key:
    | { readonly completedLoadId: string }
    | { readonly completedHaulOutId: string }
    | { readonly fieldEventId: string; readonly fieldEventKind: 'UNIT_RATE' };
}

export const ticketOf = (event: {
  readonly workflow: WorkflowName;
  readonly ticketNumber: string;
}): TicketNamed => ({ workflow: event.workflow, ticketNumber: event.ticketNumber });

export abstract class ReviewService extends QueueingService {
  // Runs the work as the person, if they may do it; the note, where one was given, is kept in
  // the audit record of every row the work changes. A ticket it touched that is locked as
  // invoiced undoes all of it, unless the record is one several tickets share (`PASSED_BY`).
  // The job is queued before the piece of work closes. An action that changes nothing another
  // ticket reads (a flag's acceptance) leaves the neighbours where they are (`LEFT`).
  protected review<T>(
    person: string,
    permission: ReviewPermission,
    note: string | undefined,
    work: (tx: Tx, moves: Moves) => Promise<Touched<T>>,
    lockedTickets: 'REFUSED' | 'PASSED_BY' = 'REFUSED',
    neighbours: 'WORKED' | 'LEFT' = 'WORKED',
  ): Promise<Outcome<Reviewed<T>>> {
    return this.mark(person, permission, note, async (tx) => {
      const queue = this.workQueue(tx);
      const before: TicketNamed[] = [];
      const { record, projectId, tickets, projectRecords } = await work(
        tx,
        async (inProject, ticket) => {
          before.push(...(await queue.neighbours(inProject, [ticket])));
        },
      );
      const asked = await ReviewService.asked(tx, person, projectId, tickets);
      if (lockedTickets === 'REFUSED') {
        const refusal = new LockedTicket(
          asked.lockedAsInvoiced.map((ticket) => ticket.ticketNumber),
        ).refusal();
        if (refusal !== null) throw new Refused(refusal);
      }
      return {
        record,
        reprocess: await this.queued(tx, asked, {
          others:
            neighbours === 'LEFT'
              ? []
              : [...before, ...(await queue.neighbours(projectId, asked.tickets))],
          projectRecords: projectRecords === true,
        }),
      };
    });
  }

  // Queues what an action asked for, in its piece of work, and says what was queued.
  protected async queued(
    tx: Tx,
    asked: Asked,
    more: { readonly others?: readonly TicketNamed[]; readonly projectRecords?: boolean } = {},
  ): Promise<Reprocess> {
    const { jobs, tickets } = await this.ask(tx, {
      projectId: asked.projectId,
      trigger: asked.trigger,
      requestedById: asked.requestedById,
      tickets: asked.tickets,
      others: more.others ?? [],
      projectRecords: more.projectRecords ?? false,
    });
    const touched = new Set(asked.tickets.map((ticket) => JSON.stringify(ticket)));
    return {
      ...asked,
      neighbours: tickets.filter((ticket) => !touched.has(JSON.stringify(ticket))),
      jobs,
    };
  }

  // The same for a mark that asks for no run: a QC status, a lock, a batch.
  protected mark<T>(
    person: string,
    permission: ReviewPermission,
    note: string | undefined,
    work: (tx: Tx, warn: Warn) => Promise<T>,
  ): Promise<Outcome<T>> {
    const reason = note?.trim() ?? '';
    return this.writeAs(
      { actorId: person, source: 'BACK_OFFICE', ...(reason === '' ? {} : { reason }) },
      async (tx, warn) => {
        await ReviewService.permitted(tx, person, permission);
        return work(tx, warn);
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

  // What to ask for: each ticket once, and which of them a lock in force holds still.
  protected static async asked(
    tx: Tx,
    person: string,
    projectId: string,
    touched: readonly TicketNamed[],
  ): Promise<Asked> {
    const tickets = [
      ...new Map(
        touched
          .map(({ workflow, ticketNumber }) => ({ workflow, ticketNumber }))
          .map((ticket) => [JSON.stringify(ticket), ticket]),
      ).values(),
    ];
    const lockedAsInvoiced: TicketNamed[] = [];
    for (const ticket of tickets) {
      if (await ReviewService.locked(tx, projectId, ticket)) lockedAsInvoiced.push(ticket);
    }
    return { projectId, trigger: 'CORRECTION', requestedById: person, tickets, lockedAsInvoiced };
  }

  // Whether a lock as invoiced is in force on the ticket: on its completed load or haul-out,
  // found by any of its field events, or on its unit rate field event, as the worker asks it.
  protected static async locked(tx: Tx, projectId: string, ticket: TicketNamed): Promise<boolean> {
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

  // Refuses, in the domain's words, a change to a ticket while a lock stands on it, asked before
  // anything is written: the database holds a locked ticket's field events and their lines itself
  // (ADR-534 (10)), so a write there would be refused as the server's failure, never in words.
  protected static async refusedIfLocked(
    tx: Tx,
    projectId: string,
    tickets: readonly TicketNamed[],
  ): Promise<void> {
    const locked: string[] = [];
    for (const ticket of tickets) {
      if (await ReviewService.locked(tx, projectId, ticket)) locked.push(ticket.ticketNumber);
    }
    const refusal = new LockedTicket(locked).refusal();
    if (refusal !== null) throw new Refused(refusal);
  }

  // The ticket a QC mark or a lock names. A load's or a haul-out's single field event is refused
  // in plain words before the database's own check would.
  protected static async ticketMarked(tx: Tx, target: TicketMarked): Promise<MarkedTicket> {
    if ('completedLoadId' in target) {
      const load = await tx.completedLoad.findUniqueOrThrow({
        where: { id: target.completedLoadId },
      });
      return {
        projectId: load.projectId,
        ticket: { workflow: 'LOAD', ticketNumber: load.ticketNumber },
        dissolved: load.dissolvedAt !== null,
        key: { completedLoadId: load.id },
      };
    }
    if ('completedHaulOutId' in target) {
      const haulOut = await tx.completedHaulOut.findUniqueOrThrow({
        where: { id: target.completedHaulOutId },
      });
      return {
        projectId: haulOut.projectId,
        ticket: { workflow: 'HAUL_OUT', ticketNumber: haulOut.ticketNumber },
        dissolved: haulOut.dissolvedAt !== null,
        key: { completedHaulOutId: haulOut.id },
      };
    }
    const event = await tx.fieldEvent.findUniqueOrThrow({ where: { id: target.unitRateTicketId } });
    const refusal = new TicketOnItsOwn(event.kind).refusal();
    if (refusal !== null) throw new Refused(refusal);
    return {
      projectId: event.projectId,
      ticket: ticketOf(event),
      dissolved: false,
      key: { fieldEventId: event.id, fieldEventKind: 'UNIT_RATE' },
    };
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
