// What a change hands the job queue (ARCHITECTURE §13, "Jobs, not requests"; BACKLOG 2.3.3, C94,
// C95; ADR-090, 360, 418, 419, 420; spec/acceptance/10-api-and-sync.md AC-10-50, 51, 54). A
// service that changes what a ticket's conclusions are drawn from asks for the reconciliation
// here, inside its own piece of work: the change and its job commit together or not at all, and
// no caller asks the worker.
//
// The worker's run works only the tickets a job names. So the job names:
// - the tickets the change touched, whatever their status (a void names the ticket it voids,
//   an unvoid the ticket it puts back);
// - their neighbours, the other tickets whose conclusions read them (`neighbours`; the rule is
//   the domain's `TicketNeighbours`): asked before a change that moves what makes two tickets
//   neighbours, and after it, since only the change knows what stood before;
// - for a setup change, the project's tickets it touches.
//
// And it leaves off what must stay as it is: a ticket locked as invoiced (ADR-090: its unlock
// queues it, at the setup as it stands then), and, among the neighbours and a setup change's
// tickets, a void ticket (the user, ADR-360: settled until a person unvoids it).
//
// A change that touches more tickets than the policy's number is cut into jobs of that size.
import { ReconciliationJobs, type Prisma, type ReconciliationTrigger } from '@open-adms/db';
import {
  TicketNeighbours,
  type FieldEventKindName,
  type NeighbourEvent,
  type TicketKey,
} from '@open-adms/domain';

type Tx = Prisma.TransactionClient;

export interface WorkAsked {
  readonly projectId: string;
  readonly trigger: ReconciliationTrigger;
  // The person who asked, where a person did; none on what a sync brought.
  readonly requestedById?: string;
  // The tickets the change itself touched.
  readonly tickets: readonly TicketKey[];
  // The tickets it may move besides: their neighbours, or a setup change's tickets. A void one
  // is left off.
  readonly others?: readonly TicketKey[];
  // The change touched a record the run flags by itself (a certification, a site, a survey):
  // where no ticket is left to name, a job that names none is queued for it.
  readonly projectRecords?: boolean;
}

export interface WorkQueued {
  // The jobs written, the oldest first; none where the change left nothing to work.
  readonly jobs: readonly string[];
  // The tickets they name, each once.
  readonly tickets: readonly TicketKey[];
  // The tickets the change reached that are locked as invoiced: left off, each as it is, until
  // a person unlocks it (ADR-090, 422).
  readonly lockedAsInvoiced: readonly TicketKey[];
}

const keyOf = (ticket: TicketKey): string => JSON.stringify([ticket.workflow, ticket.ticketNumber]);

const neighbourFacts = {
  id: true,
  workflow: true,
  ticketNumber: true,
  kind: true,
  certNumber: true,
  startedAt: true,
  endedAt: true,
  scaleReceiptId: true,
  kindOfWorkId: true,
} as const;

export class WorkQueue {
  private readonly tx: Tx;
  private readonly ticketsAJob: number;

  // `ticketsAJob` is the policy's JOB_TICKETS_AT_MOST.
  constructor(tx: Tx, ticketsAJob: number) {
    this.tx = tx;
    this.ticketsAJob = ticketsAJob;
  }

  // Queues the work, in the open piece of work; answers the jobs and the tickets they name.
  async queue(asked: WorkAsked): Promise<WorkQueued> {
    const { projectId } = asked;
    const locked = await this.lockedAsInvoiced(projectId);
    const named = new Map<string, TicketKey>();
    for (const ticket of asked.tickets) {
      if (!locked.has(keyOf(ticket))) named.set(keyOf(ticket), ticket);
    }
    const others = (asked.others ?? []).filter((ticket) => !locked.has(keyOf(ticket)));
    const lockedAsInvoiced = [
      ...new Map(
        [...asked.tickets, ...(asked.others ?? [])]
          .filter((ticket) => locked.has(keyOf(ticket)))
          .map(({ workflow, ticketNumber }) => [
            keyOf({ workflow, ticketNumber }),
            { workflow, ticketNumber },
          ]),
      ).values(),
    ];
    if (others.length > 0) {
      const voided = await this.voided(projectId);
      for (const ticket of others) {
        const key = keyOf(ticket);
        if (!voided.has(key) && !named.has(key)) named.set(key, ticket);
      }
    }
    const tickets = [...named.values()].map(({ workflow, ticketNumber }) => ({
      workflow,
      ticketNumber,
    }));
    const about = {
      projectId,
      trigger: asked.trigger,
      ...(asked.requestedById === undefined ? {} : { requestedById: asked.requestedById }),
    };
    const jobs = new ReconciliationJobs(this.tx);
    if (tickets.length === 0) {
      return {
        jobs: asked.projectRecords === true ? [await jobs.forProjectRecords(about)] : [],
        tickets,
        lockedAsInvoiced,
      };
    }
    return {
      jobs: await jobs.inJobsOf(this.ticketsAJob, { ...about, tickets }),
      tickets,
      lockedAsInvoiced,
    };
  }

  // The tickets of the project's field events a query finds, each once, in number order.
  async ticketsWith(projectId: string, where: Prisma.FieldEventWhereInput): Promise<TicketKey[]> {
    return this.tx.fieldEvent.findMany({
      where: { ...where, projectId },
      select: { workflow: true, ticketNumber: true },
      distinct: ['workflow', 'ticketNumber'],
      orderBy: [{ workflow: 'asc' }, { ticketNumber: 'asc' }],
    });
  }

  // The other tickets whose conclusions read these tickets' field events as the records stand
  // now. A void ticket reads nothing and is read by nothing, so it is nobody's neighbour; the
  // tickets asked about are read whatever their status, since the ones that read them until
  // now are the ones to work.
  async neighbours(projectId: string, tickets: readonly TicketKey[]): Promise<TicketKey[]> {
    if (tickets.length === 0) return [];
    const { tx } = this;
    const own = await tx.fieldEvent.findMany({
      where: {
        projectId,
        OR: tickets.map(({ workflow, ticketNumber }) => ({ workflow, ticketNumber })),
      },
      select: neighbourFacts,
    });
    if (own.length === 0) return [];
    const ownIds = own.map((event) => event.id);
    const listed = async (fieldEventIds: readonly string[]): Promise<Map<string, string[]>> => {
      const rows =
        fieldEventIds.length === 0
          ? []
          : await tx.carriedTicket.findMany({
              where: { fieldEventId: { in: [...fieldEventIds] }, archivedAt: null },
              select: { fieldEventId: true, carriedTicketNumber: true },
            });
      const lists = new Map<string, string[]>();
      for (const row of rows) {
        const list = lists.get(row.fieldEventId);
        if (list === undefined) lists.set(row.fieldEventId, [row.carriedTicketNumber]);
        else list.push(row.carriedTicketNumber);
      }
      return lists;
    };
    const ownCarried = await listed(ownIds);

    // What could make another field event a neighbour's: the same certification on a
    // collection or a unit rate event, the same scale receipt, or a list of carried tickets
    // that names one of these tickets or one they carry.
    const certNumbers = [
      ...new Set(
        own
          .filter((event) => event.kind === 'COLLECTION' || event.kind === 'UNIT_RATE')
          .map((event) => event.certNumber),
      ),
    ];
    const receipts = [...new Set(own.flatMap((event) => event.scaleReceiptId ?? []))];
    const carriedNumbers = [
      ...new Set([
        ...[...ownCarried.values()].flat(),
        ...own.filter((event) => event.kind === 'UNIT_RATE').map((event) => event.ticketNumber),
      ]),
    ];
    const listing =
      carriedNumbers.length === 0
        ? []
        : await tx.carriedTicket.findMany({
            where: {
              carriedTicketNumber: { in: carriedNumbers },
              archivedAt: null,
              fieldEvent: { projectId },
            },
            select: { fieldEventId: true },
          });
    const may: Prisma.FieldEventWhereInput[] = [
      ...(certNumbers.length === 0
        ? []
        : [
            {
              certNumber: { in: certNumbers },
              kind: { in: ['COLLECTION', 'UNIT_RATE'] satisfies FieldEventKindName[] },
            },
          ]),
      ...(receipts.length === 0 ? [] : [{ scaleReceiptId: { in: receipts } }]),
      ...(listing.length === 0 ? [] : [{ id: { in: listing.map((row) => row.fieldEventId) } }]),
    ];
    if (may.length === 0) return [];
    const voided = await this.voided(projectId);
    const others = (
      await tx.fieldEvent.findMany({
        where: { projectId, id: { notIn: ownIds }, OR: may },
        select: neighbourFacts,
        orderBy: [{ workflow: 'asc' }, { ticketNumber: 'asc' }, { id: 'asc' }],
      })
    ).filter((event) => !voided.has(keyOf(event)));
    if (others.length === 0) return [];
    const othersCarried = await listed(others.map((event) => event.id));

    const crewKinds = new Set(
      (
        await tx.kindOfWork.findMany({
          where: { countShape: 'ITEM_HOURS' },
          select: { id: true },
        })
      ).map((kind) => kind.id),
    );
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { timeZone: true },
    });
    const read = (
      event: (typeof own)[number],
      carried: ReadonlyMap<string, string[]>,
    ): NeighbourEvent => ({
      workflow: event.workflow,
      ticketNumber: event.ticketNumber,
      kind: event.kind,
      certNumber: event.certNumber,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      crewTime: event.kindOfWorkId !== null && crewKinds.has(event.kindOfWorkId),
      scaleReceiptId: event.scaleReceiptId,
      carriedTicketNumbers: carried.get(event.id) ?? [],
    });
    return new TicketNeighbours(project.timeZone, [
      ...own.map((event) => read(event, ownCarried)),
      ...others.map((event) => read(event, othersCarried)),
    ]).of(tickets);
  }

  // The tickets a lock as invoiced is in force on: a completed load's or haul-out's number, or
  // a unit rate ticket's.
  private async lockedAsInvoiced(projectId: string): Promise<Set<string>> {
    const locks = await this.tx.invoiceLock.findMany({
      where: { projectId, unlockedAt: null },
      select: {
        completedLoad: { select: { ticketNumber: true } },
        completedHaulOut: { select: { ticketNumber: true } },
        unitRateTicket: { select: { ticketNumber: true } },
      },
    });
    const locked = new Set<string>();
    for (const lock of locks) {
      if (lock.completedLoad !== null) {
        locked.add(keyOf({ workflow: 'LOAD', ticketNumber: lock.completedLoad.ticketNumber }));
      }
      if (lock.completedHaulOut !== null) {
        locked.add(
          keyOf({ workflow: 'HAUL_OUT', ticketNumber: lock.completedHaulOut.ticketNumber }),
        );
      }
      if (lock.unitRateTicket !== null) {
        locked.add(
          keyOf({ workflow: 'UNIT_RATE', ticketNumber: lock.unitRateTicket.ticketNumber }),
        );
      }
    }
    return locked;
  }

  // The void tickets: one a person's void is in force on, and one whose field events stand at
  // VOID (the worker wrote it so, for a person's void or a rule's).
  private async voided(projectId: string): Promise<Set<string>> {
    const inForce = await this.tx.ticketVoid.findMany({
      where: { projectId, liftedAt: null },
      select: { workflow: true, ticketNumber: true },
    });
    const standing = await this.tx.fieldEvent.findMany({
      where: { projectId, status: 'VOID' },
      select: { workflow: true, ticketNumber: true },
      distinct: ['workflow', 'ticketNumber'],
    });
    return new Set([...inForce, ...standing].map(keyOf));
  }
}
