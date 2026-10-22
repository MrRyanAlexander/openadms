// The ledger and a project's tickets to QC and lock (REQ-406; spec/parts/07, "The ledger";
// spec/parts/09, invoicing; spec/acceptance/07 AC-07-112, 113; 09 AC-09-08, 11, 28;
// adms-ledger-audit §6.1, §6.1d; ADR-085, 168, 224, 228, 367, 539). OWASP API1, API3, API4.
//
// - **Open to an admin, and to a manager/analyst granted "view review"** (ADR-539): whoever
//   reviews a ticket sees its money (ADR-224). Asked again here, inside the read.
// - **The ledger is the current truth** (ADR-085): the lines that stand, never a reversal. What
//   the lines a filter matches come to is the database's own sum of their amounts, exact to the
//   cent, never added up from a page and never through a float.
// - **A line's day** is the day its work counts on in the project's time zone, as the rules'
//   *Ticket date* reads it: its property's or pile's collection, or the unit rate ticket's own
//   field event (the domain's `RuleReadings`).
// - **A ticket that can't be locked says why** (AC-09-08), in the domain's own words
//   (`InvoiceLocking`), so a screen picking tickets to lock lists the ones that won't and never
//   works the rule out itself.
// - **A page at a time**: the ledger by its lines' ids (the order the worker wrote them), the
//   tickets by number. Both read in one piece of work, inside `DATABASE_WORK_LONGEST_MS`.
import type { LedgerAnswer, ProjectTicketsAnswer } from '@open-adms/contracts';
import type { Database, Prisma } from '@open-adms/db';
import {
  InvoiceLocking,
  ProjectClock,
  type QcStatusName,
  type WorkflowName,
} from '@open-adms/domain';

import { Refusal } from '../process/refusal.ts';
import { backOfficeReader, fromCursor, pageOf, type PageAsked } from '../review/review-reads.ts';

type Tx = Prisma.TransactionClient;

const statusOrder = ['PENDING', 'COMPLETED', 'MANUAL_REVIEW', 'VOID'] as const;
type Status = (typeof statusOrder)[number];
const inOrder = (statuses: Iterable<Status>): Status[] => {
  const held = new Set(statuses);
  return statusOrder.filter((status) => held.has(status));
};

// The days asked for, as the instants they run between in the project's time zone: from the
// first instant of `from` to the first instant after `to`. Either end may be left open.
export interface DaysAsked {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

export function instantsOf(clock: ProjectClock, days: DaysAsked): Prisma.DateTimeFilter | null {
  if (days.from === undefined && days.to === undefined) return null;
  if (days.from !== undefined && days.to !== undefined && days.from > days.to) {
    throw new Refusal('BAD_REQUEST', 400, 'The first day comes after the last.');
  }
  try {
    return {
      ...(days.from === undefined ? {} : { gte: clock.dayBounds(days.from).starts }),
      ...(days.to === undefined ? {} : { lt: clock.dayBounds(days.to).ends }),
    };
  } catch {
    throw new Refusal('BAD_REQUEST', 400, 'Not a calendar day.');
  }
}

// The project, or nothing to read; with its clock.
export async function projectRead(tx: Tx, projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId } });
  if (project === null) throw new Refusal('NOT_FOUND', 404);
  return { project, clock: new ProjectClock(project.timeZone) };
}

export interface LedgerAsked extends PageAsked, DaysAsked {
  readonly workflow?: WorkflowName | undefined;
  readonly payItemId?: string | undefined;
  readonly primeId?: string | undefined;
  readonly invoiceBatchId?: string | undefined;
  readonly locked?: boolean | undefined;
}

const inForce = { unlockedAt: null } as const;
const lockRead = {
  where: inForce,
  select: { id: true, lockedAt: true, invoiceBatch: { select: { id: true, name: true } } },
} as const;
const qcRead = { select: { status: true } } as const;

// The lines a lock in force (narrowed as asked) stands on: its load's, its haul-out's, or its
// unit rate ticket's.
const lockedLines = (lock: Prisma.InvoiceLockWhereInput): Prisma.TransactionWhereInput => ({
  OR: [
    { completedLoad: { invoiceLocks: { some: lock } } },
    { completedHaulOut: { invoiceLocks: { some: lock } } },
    { fieldEvent: { invoiceLocks: { some: lock } } },
  ],
});

// Which lines the filters take, as the database is asked.
export function ledgerWhere(
  projectId: string,
  asked: Omit<LedgerAsked, 'after' | 'limit' | 'from' | 'to'>,
  days: Prisma.DateTimeFilter | null,
): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [{ projectId }];
  if (asked.workflow === 'LOAD') and.push({ completedLoadId: { not: null } });
  if (asked.workflow === 'HAUL_OUT') and.push({ completedHaulOutId: { not: null } });
  if (asked.workflow === 'UNIT_RATE') and.push({ fieldEventId: { not: null } });
  if (asked.payItemId !== undefined) and.push({ payItemId: asked.payItemId });
  if (asked.primeId !== undefined) and.push({ primeId: asked.primeId });
  if (asked.invoiceBatchId !== undefined) {
    and.push(lockedLines({ ...inForce, invoiceBatchId: asked.invoiceBatchId }));
  }
  if (asked.locked === true) and.push(lockedLines(inForce));
  if (asked.locked === false) and.push({ NOT: lockedLines(inForce) });
  if (days !== null) {
    and.push({
      OR: [
        { completedLoadCollection: { collectionEvent: { endedAt: days } } },
        { completedHaulOutCollection: { collectionEvent: { endedAt: days } } },
        { fieldEventId: { not: null }, fieldEvent: { endedAt: days } },
      ],
    });
  }
  return { AND: and };
}

// What a line is read with to be shown.
export const ledgerInclude = {
  payItem: {
    select: { id: true, code: true, description: true, payableType: { select: { name: true } } },
  },
  contract: { select: { id: true, name: true } },
  prime: { select: { id: true, name: true } },
  operatingSub: { select: { id: true, name: true } },
  rule: { select: { id: true, name: true } },
  completedLoad: {
    select: { ticketNumber: true, qcMarks: qcRead, invoiceLocks: lockRead },
  },
  completedHaulOut: {
    select: { ticketNumber: true, qcMarks: qcRead, invoiceLocks: lockRead },
  },
  completedLoadCollection: {
    select: {
      splitSuffix: true,
      mileage: true,
      mileageSource: true,
      collectionEvent: { select: { endedAt: true, status: true } },
    },
  },
  completedHaulOutCollection: {
    select: {
      splitSuffix: true,
      mileage: true,
      mileageSource: true,
      collectionEvent: { select: { endedAt: true, status: true } },
    },
  },
  fieldEvent: {
    select: {
      ticketNumber: true,
      endedAt: true,
      status: true,
      qcMarks: qcRead,
      invoiceLocks: lockRead,
    },
  },
} as const;

export type LedgerRow = Prisma.TransactionGetPayload<{ include: typeof ledgerInclude }>;
type Line = LedgerAnswer['lines'][number];

// One line as the ledger shows it.
export function ledgerLine(row: LedgerRow, clock: ProjectClock): Line {
  const ticket = row.completedLoad ?? row.completedHaulOut ?? row.fieldEvent;
  const piece = row.completedLoadCollection ?? row.completedHaulOutCollection;
  const event = piece?.collectionEvent ?? row.fieldEvent;
  if (ticket === null || event === null) {
    throw new Error('A line of the ledger prices no ticket.');
  }
  const lock = ticket.invoiceLocks[0];
  return {
    id: row.id,
    workflow:
      row.completedLoad !== null
        ? 'LOAD'
        : row.completedHaulOut !== null
          ? 'HAUL_OUT'
          : 'UNIT_RATE',
    ticketNumber: ticket.ticketNumber,
    splitSuffix: piece?.splitSuffix ?? '',
    slot: row.slot,
    payItem: {
      id: row.payItem.id,
      code: row.payItem.code,
      description: row.payItem.description,
    },
    payableType: row.payItem.payableType.name,
    unit: row.unit,
    quantity: row.quantity.toFixed(4),
    rate: row.rate.toFixed(4),
    amount: row.amount.toFixed(2),
    contract: row.contract,
    prime: row.prime,
    operatingSub: row.operatingSub,
    rule: row.rule,
    ticketDate: clock.day(event.endedAt),
    status: event.status,
    qcStatus: ticket.qcMarks[0]?.status ?? null,
    lock:
      lock === undefined
        ? null
        : { id: lock.id, lockedAt: lock.lockedAt.toISOString(), invoiceBatch: lock.invoiceBatch },
    mileage: piece?.mileage?.toFixed(4) ?? null,
    mileageSource: piece?.mileageSource ?? null,
  };
}

export interface TicketsAsked extends DaysAsked {
  readonly workflow: WorkflowName;
  readonly status?: Status | undefined;
  readonly qcStatus?: QcStatusName | 'NONE' | undefined;
  readonly locked?: boolean | undefined;
  readonly invoiceBatchId?: string | undefined;
  readonly after?: string | undefined;
  readonly limit: number;
}

// The field event that gives a ticket its day: a collection, a haul-out's, a unit rate ticket.
const dayKinds = {
  LOAD: 'COLLECTION',
  HAUL_OUT: 'HAUL_OUT_COLLECTION',
  UNIT_RATE: 'UNIT_RATE',
} as const;

// The ticket number a mark or a lock is on.
function numberOf(mark: {
  readonly completedLoad: { readonly ticketNumber: string } | null;
  readonly completedHaulOut: { readonly ticketNumber: string } | null;
  readonly fieldEvent: { readonly ticketNumber: string } | null;
}): string[] {
  const number = (mark.completedLoad ?? mark.completedHaulOut ?? mark.fieldEvent)?.ticketNumber;
  return number === undefined ? [] : [number];
}

type Target = NonNullable<ProjectTicketsAnswer['tickets'][number]['target']>;

export class Ledger {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // The ledger, a page of it, and what all its matching lines come to.
  read(readerId: string, projectId: string, asked: LedgerAsked): Promise<LedgerAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const { clock } = await projectRead(tx, projectId);
      const where = ledgerWhere(projectId, asked, instantsOf(clock, asked));
      const rows = await tx.transaction.findMany({
        where,
        include: ledgerInclude,
        orderBy: { id: 'asc' },
        ...fromCursor(asked),
      });
      const { rows: page, next } = pageOf(rows, asked.limit);
      const total = await tx.transaction.aggregate({
        where,
        _count: { _all: true },
        _sum: { amount: true },
      });
      return {
        lines: page.map((row) => ledgerLine(row, clock)),
        total: { lines: total._count._all, amount: (total._sum.amount ?? 0).toFixed(2) },
        next,
      };
    });
  }

  // A project's tickets of one workflow by number, each with what a QC mark and a lock read.
  tickets(readerId: string, projectId: string, asked: TicketsAsked): Promise<ProjectTicketsAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const { clock } = await projectRead(tx, projectId);
      const { workflow } = asked;
      const narrowed = await Ledger.numbersAsked(tx, projectId, asked, instantsOf(clock, asked));
      const numbers = (
        await tx.fieldEvent.groupBy({
          by: ['ticketNumber'],
          where: {
            projectId,
            workflow,
            ...(asked.status === undefined ? {} : { status: asked.status }),
            ticketNumber: {
              ...(asked.after === undefined ? {} : { gt: asked.after }),
              ...narrowed,
            },
          },
          orderBy: { ticketNumber: 'asc' },
          take: asked.limit + 1,
        })
      ).map((row) => row.ticketNumber);
      const page = numbers.slice(0, asked.limit);
      const tickets = await Ledger.ticketsOf(tx, projectId, workflow, page, clock);
      return {
        tickets,
        next: numbers.length > asked.limit ? (page.at(-1) ?? null) : null,
      };
    });
  }

  // The ticket numbers a QC status, a lock, a batch or a range of days narrows to: those taken
  // (`in`) and those left out (`notIn`).
  private static async numbersAsked(
    tx: Tx,
    projectId: string,
    asked: TicketsAsked,
    days: Prisma.DateTimeFilter | null,
  ): Promise<{ in?: string[]; notIn?: string[] }> {
    const taken: Set<string>[] = [];
    const leftOut = new Set<string>();
    const { workflow } = asked;
    const markedOn = Ledger.markedOn(workflow);
    if (asked.qcStatus !== undefined) {
      const marks = await tx.qcMark.findMany({
        where: {
          projectId,
          ...markedOn,
          ...(asked.qcStatus === 'NONE' ? {} : { status: asked.qcStatus }),
        },
        select: Ledger.numberOfMark,
      });
      const numbers = marks.flatMap(numberOf);
      if (asked.qcStatus === 'NONE') for (const number of numbers) leftOut.add(number);
      else taken.push(new Set(numbers));
    }
    if (asked.locked !== undefined || asked.invoiceBatchId !== undefined) {
      const locks = await tx.invoiceLock.findMany({
        where: {
          projectId,
          ...markedOn,
          ...inForce,
          ...(asked.invoiceBatchId === undefined ? {} : { invoiceBatchId: asked.invoiceBatchId }),
        },
        select: Ledger.numberOfMark,
      });
      const numbers = locks.flatMap(numberOf);
      if (asked.invoiceBatchId !== undefined || asked.locked === true) {
        taken.push(new Set(numbers));
      }
      if (asked.locked === false) for (const number of numbers) leftOut.add(number);
    }
    if (days !== null) {
      const events = await tx.fieldEvent.findMany({
        where: { projectId, workflow, kind: dayKinds[workflow], endedAt: days },
        select: { ticketNumber: true },
        distinct: ['ticketNumber'],
      });
      taken.push(new Set(events.map((event) => event.ticketNumber)));
    }
    const [first, ...rest] = taken;
    return {
      ...(first === undefined
        ? {}
        : { in: [...first].filter((number) => rest.every((set) => set.has(number))) }),
      ...(leftOut.size === 0 ? {} : { notIn: [...leftOut] }),
    };
  }

  // A mark or a lock on a workflow's tickets: on its standing completed record, or on a unit
  // rate ticket's field event.
  private static markedOn(workflow: WorkflowName) {
    return workflow === 'LOAD'
      ? { completedLoad: { dissolvedAt: null } }
      : workflow === 'HAUL_OUT'
        ? { completedHaulOut: { dissolvedAt: null } }
        : { fieldEvent: { workflow: 'UNIT_RATE' as const } };
  }

  private static readonly numberOfMark = {
    completedLoad: { select: { ticketNumber: true } },
    completedHaulOut: { select: { ticketNumber: true } },
    fieldEvent: { select: { ticketNumber: true } },
  } as const;

  // A page of tickets whole: their field events, their completed record, its marks and lines.
  private static async ticketsOf(
    tx: Tx,
    projectId: string,
    workflow: WorkflowName,
    numbers: readonly string[],
    clock: ProjectClock,
  ): Promise<ProjectTicketsAnswer['tickets']> {
    const events = await tx.fieldEvent.findMany({
      where: { projectId, workflow, ticketNumber: { in: [...numbers] } },
      select: {
        id: true,
        ticketNumber: true,
        kind: true,
        splitSuffix: true,
        status: true,
        endedAt: true,
      },
      orderBy: [{ splitSuffix: 'asc' }, { startedAt: 'asc' }, { id: 'asc' }],
    });
    const completed =
      workflow === 'LOAD'
        ? await tx.completedLoad.findMany({
            where: { projectId, ticketNumber: { in: [...numbers] } },
            select: { id: true, ticketNumber: true, dissolvedAt: true },
          })
        : workflow === 'HAUL_OUT'
          ? await tx.completedHaulOut.findMany({
              where: { projectId, ticketNumber: { in: [...numbers] } },
              select: { id: true, ticketNumber: true, dissolvedAt: true },
            })
          : [];
    const standing = completed.filter((record) => record.dissolvedAt === null);
    const keyed = (target: Target) =>
      'completedLoadId' in target
        ? { completedLoadId: target.completedLoadId }
        : 'completedHaulOutId' in target
          ? { completedHaulOutId: target.completedHaulOutId }
          : { fieldEventId: target.unitRateTicketId };
    const targets = new Map<string, Target>();
    for (const number of numbers) {
      const record = standing.find((each) => each.ticketNumber === number);
      const unitRate = events.find(
        (event) => event.ticketNumber === number && event.kind === 'UNIT_RATE',
      );
      if (workflow === 'LOAD' && record !== undefined) {
        targets.set(number, { completedLoadId: record.id });
      } else if (workflow === 'HAUL_OUT' && record !== undefined) {
        targets.set(number, { completedHaulOutId: record.id });
      } else if (workflow === 'UNIT_RATE' && unitRate !== undefined) {
        targets.set(number, { unitRateTicketId: unitRate.id });
      }
    }
    const keys = [...targets.values()].map(keyed);
    const marks = keys.length === 0 ? [] : await tx.qcMark.findMany({ where: { OR: keys } });
    const locks =
      keys.length === 0
        ? []
        : await tx.invoiceLock.findMany({
            where: { OR: keys, ...inForce },
            select: {
              id: true,
              lockedAt: true,
              completedLoadId: true,
              completedHaulOutId: true,
              fieldEventId: true,
              invoiceBatch: { select: { id: true, name: true } },
            },
          });
    const sums =
      keys.length === 0
        ? []
        : await tx.transaction.groupBy({
            by: ['completedLoadId', 'completedHaulOutId', 'fieldEventId'],
            where: { projectId, OR: keys },
            _count: { _all: true },
            _sum: { amount: true },
          });
    const on = (
      row: {
        readonly completedLoadId: string | null;
        readonly completedHaulOutId: string | null;
        readonly fieldEventId: string | null;
      },
      target: Target | undefined,
    ): boolean =>
      target !== undefined &&
      ('completedLoadId' in target
        ? row.completedLoadId === target.completedLoadId
        : 'completedHaulOutId' in target
          ? row.completedHaulOutId === target.completedHaulOutId
          : row.fieldEventId === target.unitRateTicketId);
    return numbers.map((ticketNumber) => {
      const own = events.filter((event) => event.ticketNumber === ticketNumber);
      const target = targets.get(ticketNumber);
      const mark = marks.find((each) => on(each, target));
      const lock = locks.find((each) => on(each, target));
      const sum = sums.find((each) => on(each, target));
      const statuses = inOrder(own.map((event) => event.status));
      const dayEvent = own.find((event) => event.kind === dayKinds[workflow]);
      const dissolved =
        target === undefined && completed.some((record) => record.ticketNumber === ticketNumber);
      const refusal = new InvoiceLocking({
        ticketNumber,
        dissolved,
        statuses,
        qcStatus: mark?.status ?? 'QC_REVIEW',
        locked: lock !== undefined,
      }).lockRefusal();
      return {
        workflow,
        ticketNumber,
        statuses,
        ticketDate: dayEvent === undefined ? null : clock.day(dayEvent.endedAt),
        fieldEvents: own.map((event) => ({
          id: event.id,
          kind: event.kind,
          splitSuffix: event.splitSuffix,
        })),
        target: target ?? null,
        qcStatus: mark?.status ?? null,
        lock:
          lock === undefined
            ? null
            : {
                id: lock.id,
                lockedAt: lock.lockedAt.toISOString(),
                invoiceBatch: lock.invoiceBatch,
              },
        lines: sum?._count._all ?? 0,
        amount: (sum?._sum.amount ?? 0).toFixed(2),
        // A ticket with nothing standing to lock and no other reason is "not completed yet".
        lockRefusal:
          refusal === null && target === undefined
            ? new InvoiceLocking({
                ticketNumber,
                dissolved,
                statuses: ['PENDING'],
                qcStatus: 'QC_REVIEW',
                locked: false,
              }).lockRefusal()
            : refusal,
      };
    });
  }
}
