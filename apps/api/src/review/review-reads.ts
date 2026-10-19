// What the back office reads to review, fix and QC (spec/parts/08-review-and-corrections.md, "One
// review queue" and step 1; spec/parts/09; REQ-217; AC-10-27; BACKLOG 2.8.8, C98, C104, C107,
// C148, C171, C172; ADR-224, 228, 363, 365, 433, 526 (1), 534, 535, 536). OWASP API1, API3, API4;
// ASVS V8.
//
// - **Open to an admin, and to a manager/analyst granted the read's view** (the user, ADR-539):
//   "view review" for what is reviewed, "view dispatch" for the board's search and a phone's
//   sessions. Whoever is let see review sees everything about a ticket (ADR-224). Asked again
//   here, inside the read, whatever the door asked. A record nobody has is 404.
// - **A ticket is its project, its workflow and its bare number** and the field events under it
//   (ADR-236): one with no field event is no ticket. Its lines carry their rate and amount (the
//   ledger is the back office's current truth, ADR-535 (1)).
// - **A page at a time**, one row more read than the page holds; a list in an order other than
//   the time it was made pages by the last row's id (Prisma's cursor).
// - **Never where a file is kept**, a token, or a flag's facts (the worker's own inputs).
import type {
  CertificationRead,
  FieldEventAnswer,
  FieldEventRead,
  FlagRecord,
  FlagsAnswer,
  ReviewQueueAnswer,
  ScaleReceiptAnswer,
  SetAsideJobsAnswer,
  TicketAnswer,
  TicketDecisionsAnswer,
} from '@open-adms/contracts';
import type { Database, FieldEvent, Flag, FlagAcceptance, Prisma } from '@open-adms/db';
import { Access, type ViewPermission, type WorkflowName } from '@open-adms/domain';

import { Refusal } from '../process/refusal.ts';
import {
  carriedTicketRecord,
  certificationRecord,
  dropOffLogRecord,
  fieldEventRecord,
  flagAcceptanceRecord,
  incidentRecord,
  invoiceBatchRecord,
  invoiceLockRecord,
  itemLineRecord,
  photographRecord,
  qcMarkRecord,
  roeRecord,
  roeScopeItemRecord,
  scaleReceiptRecord,
  surveyRecord,
  ticketUnvoidRecord,
  ticketVoidRecord,
  waypointRecord,
} from './review-answered.ts';
import { SetAside } from './set-aside.ts';

type Tx = Prisma.TransactionClient;

// A page asked for: after the last row of the page before, `limit` at most.
export interface PageAsked {
  readonly after?: string | undefined;
  readonly limit: number;
}

// Where a page starts, as Prisma reads it: the row after the cursor's, in the order asked.
export const fromCursor = (asked: PageAsked) => ({
  take: asked.limit + 1,
  ...(asked.after === undefined ? {} : { cursor: { id: asked.after }, skip: 1 }),
});

// A page cut from one row more than it holds, `next` the last row's id where another follows.
export function pageOf<T extends { readonly id: string }>(
  rows: readonly T[],
  limit: number,
): { rows: T[]; next: string | null } {
  const page = rows.slice(0, limit);
  return { rows: page, next: rows.length > limit ? (page.at(-1)?.id ?? null) : null };
}

// Whether this reader is an admin, or a manager/analyst in service granted that view (`null`:
// what every one of them reads) (ADR-526 (1) (a), 539).
export async function backOfficeSees(
  tx: Tx,
  readerId: string,
  view: ViewPermission | null,
): Promise<boolean> {
  const reader = await tx.user.findUnique({
    where: { id: readerId },
    select: {
      role: true,
      archivedAt: true,
      permissions: { where: { archivedAt: null }, select: { permission: true } },
    },
  });
  return (
    reader !== null &&
    new Access({
      role: reader.role,
      archived: reader.archivedAt !== null,
      granted: reader.permissions.map((grant) => grant.permission),
    }).sees(view)
  );
}

// The same, anybody else refused.
export async function backOfficeReader(
  tx: Tx,
  readerId: string,
  view: ViewPermission | null,
): Promise<void> {
  if (!(await backOfficeSees(tx, readerId, view))) throw new Refusal('NOT_ALLOWED', 403);
}

const notFound = (): Refusal => new Refusal('NOT_FOUND', 404);

// A decision's summary as the worker wrote it (ARCHITECTURE §13): read by its keys, each as the
// answer's schema then holds it, what a run didn't write read as none.
type Decided = TicketDecisionsAnswer['decisions'][number];
type Said = (key: string) => Prisma.JsonValue | undefined;
const fieldsOf =
  (value: Prisma.JsonValue | undefined): Said =>
  (key) =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value[key] : undefined;
const listOf = (value: Prisma.JsonValue | undefined): Prisma.JsonValue[] =>
  Array.isArray(value) ? value : [];
const textOf = (value: Prisma.JsonValue | undefined): string =>
  typeof value === 'string' ? value : '';
function decided(summary: Prisma.JsonValue): Omit<Decided, 'id' | 'run' | 'status' | 'processed'> {
  const said = fieldsOf(summary);
  const person = said('voidedByPerson');
  const by = fieldsOf(person);
  return {
    why: textOf(said('why')),
    fieldEvents: listOf(said('fieldEvents')).map((each) => {
      const event = fieldsOf(each);
      const suffix = event('splitSuffix');
      return {
        id: textOf(event('id')),
        kind: textOf(event('kind')) as Decided['fieldEvents'][number]['kind'],
        splitSuffix: typeof suffix === 'string' ? suffix : null,
        startedAt: textOf(event('startedAt')),
        endedAt: textOf(event('endedAt')),
      };
    }),
    waitingFor: listOf(said('waitingFor')).map(textOf) as Decided['waitingFor'],
    lines: listOf(said('lines')).map((each) => {
      const line = fieldsOf(each);
      const slot = line('slot');
      return {
        splitSuffix: textOf(line('splitSuffix')),
        slot: typeof slot === 'number' ? slot : 0,
        ruleId: textOf(line('ruleId')),
        payItemId: textOf(line('payItemId')),
        quantity: textOf(line('quantity')),
        rate: textOf(line('rate')),
        amount: textOf(line('amount')),
      };
    }),
    flags: listOf(said('flags')).map(textOf) as Decided['flags'],
    voidedByRules: listOf(said('voidedBy')).map((each) => {
      const rule = fieldsOf(each);
      return { id: textOf(rule('id')), name: textOf(rule('name')) };
    }),
    voidedByPerson:
      person === undefined || person === null
        ? null
        : { name: textOf(by('name')), reason: textOf(by('reason')) },
  };
}
const time = (at: Date | null): string | null => at?.toISOString() ?? null;
// A number the database keeps exactly, as text to the places its column holds.
interface Exact {
  toFixed(places: number): string;
}
const exact = (value: Exact | null, places: number): string | null =>
  value === null ? null : value.toFixed(places);
const statusOrder = ['PENDING', 'COMPLETED', 'MANUAL_REVIEW', 'VOID'] as const;
type Status = (typeof statusOrder)[number];
const inOrder = (statuses: Iterable<Status>): Status[] =>
  statusOrder.filter((status) => [...statuses].includes(status));

// Open: not cleared, and no acceptance in force (ADR-534 (8)).
const open = { clearedAt: null, acceptances: { none: { withdrawnAt: null } } } as const;

// The owner columns of a photograph that is a record's own (never one held or quarantined).
type PhotoOwner =
  | 'fieldEventId'
  | 'certificationId'
  | 'scaleReceiptId'
  | 'roeId'
  | 'surveyId'
  | 'incidentId'
  | 'dropOffLogId';

// Those of a record that also takes a QC mark of its own.
type MarkOwner = Exclude<PhotoOwner, 'fieldEventId' | 'scaleReceiptId'>;

export const flagRead = (flag: Flag & { readonly acceptances: FlagAcceptance[] }): FlagRecord => ({
  id: flag.id,
  projectId: flag.projectId,
  workflow: flag.workflow,
  ticketNumber: flag.ticketNumber,
  fieldEventId: flag.fieldEventId,
  certificationId: flag.certificationId,
  disposalSiteId: flag.disposalSiteId,
  surveyId: flag.surveyId,
  code: flag.code,
  message: flag.message,
  billing: flag.billing,
  slot: flag.slot,
  payItemId: flag.payItemId,
  raisedAt: flag.raisedAt.toISOString(),
  clearedAt: time(flag.clearedAt),
  acceptances: flag.acceptances.map(flagAcceptanceRecord),
});

const withAcceptances = { acceptances: { orderBy: { acceptedAt: 'asc' } } } as const;

export const fieldEventRead = (event: FieldEvent): FieldEventRead => ({
  ...fieldEventRecord(event),
  status: event.status,
  receivedAt: event.receivedAt.toISOString(),
  reconciledAt: time(event.reconciledAt),
  zoneId: event.zoneId,
  mapVersionId: event.mapVersionId,
  workedOutPayItemId: event.workedOutPayItemId,
  deviceId: event.deviceId,
  assignmentId: event.assignmentId,
  setupVersion: event.setupVersion,
});

export interface ReviewQueueAsked extends PageAsked {
  readonly workflow: WorkflowName;
  readonly cause?: Flag['code'] | undefined;
}

export interface FlagsAsked extends PageAsked {
  readonly cause?: Flag['code'] | undefined;
  readonly open?: boolean | undefined;
}

export class ReviewReads {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // The review queue (ADR-228): the open flags counted by cause, and one workflow's tickets
  // waiting for a person by number, each with its open flags. Narrowed to a cause, the tickets
  // with an open flag of it; else every ticket whose field events stand pending or in review.
  reviewQueue(
    readerId: string,
    projectId: string,
    asked: ReviewQueueAsked,
  ): Promise<ReviewQueueAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      await ReviewReads.project(tx, projectId);
      const openHere = { projectId, ...open };
      const byCause = await tx.flag.groupBy({
        by: ['code'],
        where: openHere,
        orderBy: { code: 'asc' },
        _count: { _all: true },
      });
      const ticketsByCause = await tx.flag.groupBy({
        by: ['code', 'workflow', 'ticketNumber'],
        where: { ...openHere, ticketNumber: { not: null } },
        orderBy: [{ code: 'asc' }],
      });
      const after = asked.after === undefined ? {} : { gt: asked.after };
      const numbers =
        asked.cause === undefined
          ? (
              await tx.fieldEvent.groupBy({
                by: ['ticketNumber'],
                where: {
                  projectId,
                  workflow: asked.workflow,
                  status: { in: ['PENDING', 'MANUAL_REVIEW'] },
                  ...(asked.after === undefined ? {} : { ticketNumber: after }),
                },
                orderBy: { ticketNumber: 'asc' },
                take: asked.limit + 1,
              })
            ).map((row) => row.ticketNumber)
          : (
              await tx.flag.groupBy({
                by: ['ticketNumber'],
                where: {
                  ...openHere,
                  workflow: asked.workflow,
                  code: asked.cause,
                  ticketNumber: { not: null, ...after },
                },
                orderBy: { ticketNumber: 'asc' },
                take: asked.limit + 1,
              })
            ).flatMap((row) => (row.ticketNumber === null ? [] : [row.ticketNumber]));
      const page = numbers.slice(0, asked.limit);
      const statuses = await tx.fieldEvent.groupBy({
        by: ['ticketNumber', 'status'],
        where: { projectId, workflow: asked.workflow, ticketNumber: { in: page } },
      });
      const flags = await tx.flag.findMany({
        where: { ...openHere, workflow: asked.workflow, ticketNumber: { in: page } },
        orderBy: { raisedAt: 'asc' },
      });
      // A ticket a job set aside still names, unworked since (ADR-545).
      const waiting = (await SetAside.of(tx, projectId)).waiting(asked.workflow);
      return {
        causes: byCause.map((row) => ({
          code: row.code,
          flags: row._count._all,
          tickets: ticketsByCause.filter((each) => each.code === row.code).length,
        })),
        tickets: page.map((ticketNumber) => ({
          workflow: asked.workflow,
          ticketNumber,
          statuses: inOrder(
            statuses.filter((row) => row.ticketNumber === ticketNumber).map((row) => row.status),
          ),
          flags: flags
            .filter((flag) => flag.ticketNumber === ticketNumber)
            .map((flag) => ({
              id: flag.id,
              code: flag.code,
              message: flag.message,
              billing: flag.billing,
              raisedAt: flag.raisedAt.toISOString(),
            })),
          waitingOnSetAsideJob: waiting.has(ticketNumber),
        })),
        waitingOnSetAsideJobs: waiting.size,
        next: numbers.length > asked.limit ? (page.at(-1) ?? null) : null,
      };
    });
  }

  // A project's jobs set aside, newest first, a page at a time (ADR-545): what each is, and its
  // tickets, each said to wait on it where no job has worked it since. Never `lastError`.
  setAsideJobs(readerId: string, projectId: string, asked: PageAsked): Promise<SetAsideJobsAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      await ReviewReads.project(tx, projectId);
      const ids = await tx.reconciliationJob.findMany({
        where: { projectId, setAsideAt: { not: null } },
        orderBy: { id: 'desc' },
        select: { id: true },
        ...fromCursor(asked),
      });
      const { rows: page, next } = pageOf(ids, asked.limit);
      const setAside = await SetAside.of(
        tx,
        projectId,
        page.map((row) => row.id),
      );
      return {
        jobs: setAside.jobs.map((job) => ({
          id: job.id,
          trigger: job.trigger,
          requestedById: job.requestedById,
          queuedAt: job.queuedAt.toISOString(),
          setAsideAt: job.setAsideAt.toISOString(),
          tries: job.attempts,
          tickets: job.tickets.map((ticket) => ({
            workflow: ticket.workflow,
            ticketNumber: ticket.ticketNumber,
            waiting: setAside.waitsOn(job, ticket.workflow, ticket.ticketNumber),
          })),
        })),
        next,
      };
    });
  }

  // A project's flags, oldest first, each with every acceptance it had.
  flags(readerId: string, projectId: string, asked: FlagsAsked): Promise<FlagsAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      await ReviewReads.project(tx, projectId);
      const rows = await tx.flag.findMany({
        where: {
          projectId,
          ...(asked.cause === undefined ? {} : { code: asked.cause }),
          ...(asked.open === undefined ? {} : { clearedAt: asked.open ? null : { not: null } }),
        },
        orderBy: { id: 'asc' },
        include: withAcceptances,
        ...fromCursor(asked),
      });
      const { rows: page, next } = pageOf(rows, asked.limit);
      return { flags: page.map(flagRead), next };
    });
  }

  // One ticket whole (ADR-224); one with no field event is not found.
  ticket(
    readerId: string,
    projectId: string,
    workflow: WorkflowName,
    ticketNumber: string,
  ): Promise<TicketAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const named = { projectId, workflow, ticketNumber };
      const events = await tx.fieldEvent.findMany({
        where: named,
        // Field time, never the order they arrived in.
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      });
      if (events.length === 0) throw notFound();
      const completed = await ReviewReads.completed(tx, projectId, workflow, ticketNumber);
      const unitRate = events.find((event) => event.kind === 'UNIT_RATE');
      const key =
        workflow === 'UNIT_RATE'
          ? unitRate === undefined
            ? null
            : { fieldEventId: unitRate.id }
          : completed === null
            ? null
            : workflow === 'LOAD'
              ? { completedLoadId: completed.id }
              : { completedHaulOutId: completed.id };
      const lines =
        key === null
          ? []
          : await tx.transaction.findMany({
              where: { projectId, ...key },
              orderBy: [{ slot: 'asc' }, { id: 'asc' }],
            });
      const suffixOf = (line: (typeof lines)[number]): string =>
        completed?.collections.find(
          (row) => row.id === (line.completedLoadCollectionId ?? line.completedHaulOutCollectionId),
        )?.splitSuffix ?? '';
      const flags = await tx.flag.findMany({
        where: named,
        orderBy: { raisedAt: 'asc' },
        include: withAcceptances,
      });
      const qcMark = key === null ? null : await tx.qcMark.findFirst({ where: key });
      const locks =
        key === null
          ? []
          : await tx.invoiceLock.findMany({ where: key, orderBy: { lockedAt: 'asc' } });
      const voids = await tx.ticketVoid.findMany({ where: named, orderBy: { voidedAt: 'asc' } });
      const unvoids = await tx.ticketUnvoid.findMany({
        where: named,
        orderBy: { unvoidedAt: 'asc' },
      });
      return {
        projectId,
        workflow,
        ticketNumber,
        statuses: inOrder(events.map((event) => event.status)),
        fieldEvents: events.map(fieldEventRead),
        completed: completed === null ? null : completed.shown,
        lines: lines
          .map((line) => ({
            id: line.id,
            splitSuffix: suffixOf(line),
            slot: line.slot,
            ruleId: line.ruleId,
            payItemId: line.payItemId,
            contractId: line.contractId,
            primeId: line.primeId,
            operatingSubId: line.operatingSubId,
            unit: line.unit,
            quantity: line.quantity.toFixed(4),
            rate: line.rate.toFixed(4),
            amount: line.amount.toFixed(2),
          }))
          .sort(
            (left, right) =>
              left.splitSuffix.localeCompare(right.splitSuffix) || left.slot - right.slot,
          ),
        flags: flags.map(flagRead),
        qcMark: qcMark === null ? null : qcMarkRecord(qcMark),
        locks: locks.map(invoiceLockRecord),
        voids: voids.map(ticketVoidRecord),
        unvoids: unvoids.map(ticketUnvoidRecord),
      };
    });
  }

  // What each run decided for one ticket and why, newest first (ADR-536; C172): the worker's
  // own words for a person. Whether it could be processed, never the error's text (the log's).
  ticketDecisions(
    readerId: string,
    projectId: string,
    workflow: WorkflowName,
    ticketNumber: string,
    asked: PageAsked,
  ): Promise<TicketDecisionsAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const named = { projectId, workflow, ticketNumber };
      const event = await tx.fieldEvent.findFirst({ where: named, select: { id: true } });
      if (event === null) throw notFound();
      const rows = await tx.reconciliationDecision.findMany({
        where: { workflow, ticketNumber, reconciliationRun: { projectId } },
        // The order the worker wrote them: a decision's id is a UUIDv7.
        orderBy: { id: 'desc' },
        include: {
          reconciliationRun: { select: { id: true, trigger: true, startedAt: true } },
        },
        ...fromCursor(asked),
      });
      const { rows: page, next } = pageOf(rows, asked.limit);
      return {
        decisions: page.map((row) => ({
          id: row.id,
          run: {
            id: row.reconciliationRun.id,
            trigger: row.reconciliationRun.trigger,
            startedAt: row.reconciliationRun.startedAt.toISOString(),
          },
          status: row.status,
          processed: row.error === null,
          ...decided(row.summary),
        })),
        next,
      };
    });
  }

  // One field event with what is recorded beside it.
  fieldEvent(readerId: string, fieldEventId: string): Promise<FieldEventAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const event = await tx.fieldEvent.findUnique({
        where: { id: fieldEventId },
        include: {
          items: { orderBy: { id: 'asc' } },
          carriedTickets: { orderBy: { id: 'asc' } },
          waypoints: { orderBy: { position: 'asc' } },
          scaleReceipt: true,
        },
      });
      if (event === null) throw notFound();
      const { items, carriedTickets, waypoints, scaleReceipt, ...recorded } = event;
      return {
        fieldEvent: fieldEventRead(recorded),
        itemLines: items.map(itemLineRecord),
        carriedTickets: carriedTickets.map(carriedTicketRecord),
        waypoints: waypoints.map(waypointRecord),
        photographs: await ReviewReads.photographs(tx, 'fieldEventId', fieldEventId),
        scaleReceipt: scaleReceipt === null ? null : scaleReceiptRecord(scaleReceipt),
      };
    });
  }

  // One scale receipt, its photographs and the field events that name it.
  scaleReceipt(readerId: string, scaleReceiptId: string): Promise<ScaleReceiptAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const receipt = await tx.scaleReceipt.findUnique({
        where: { id: scaleReceiptId },
        include: { fieldEvents: { select: { id: true }, orderBy: { id: 'asc' } } },
      });
      if (receipt === null) throw notFound();
      const { fieldEvents, ...kept } = receipt;
      return {
        scaleReceipt: scaleReceiptRecord(kept),
        photographs: await ReviewReads.photographs(tx, 'scaleReceiptId', scaleReceiptId),
        fieldEventIds: fieldEvents.map((event) => event.id),
      };
    });
  }

  // A project's certifications by cert number as written, each whole.
  certifications(
    readerId: string,
    projectId: string,
    asked: PageAsked & { readonly certNumber?: string | undefined },
  ): Promise<{ certifications: CertificationRead[]; next: string | null }> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      await ReviewReads.project(tx, projectId);
      const rows = await tx.certification.findMany({
        where: {
          projectId,
          ...(asked.certNumber === undefined ? {} : { certNumber: asked.certNumber }),
        },
        orderBy: [{ certNumber: 'asc' }, { id: 'asc' }],
        select: { id: true },
        ...fromCursor(asked),
      });
      const { rows: page, next } = pageOf(rows, asked.limit);
      const certifications: CertificationRead[] = [];
      for (const { id } of page) certifications.push(await ReviewReads.certificationIn(tx, id));
      return { certifications, next };
    });
  }

  certification(readerId: string, certificationId: string): Promise<CertificationRead> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      return ReviewReads.certificationIn(tx, certificationId);
    });
  }

  // A project's ROEs, in the order they were made, each with its scope.
  roes(readerId: string, projectId: string, asked: PageAsked) {
    return this.formsOf(readerId, projectId, asked, async (tx, page) => {
      const rows = await tx.roe.findMany({
        where: { projectId },
        orderBy: { id: 'asc' },
        include: { scopeItems: { orderBy: { id: 'asc' } } },
        ...page,
      });
      const marked = await ReviewReads.markedEach(tx, 'roeId', rows);
      return rows.map(({ scopeItems, ...roe }) => ({
        id: roe.id,
        shown: {
          roe: roeRecord(roe),
          scope: scopeItems.map(roeScopeItemRecord),
          ...marked(roe.id),
        },
      }));
    }).then(({ rows, next }) => ({ roes: rows, next }));
  }

  surveys(readerId: string, projectId: string, asked: PageAsked) {
    return this.formsOf(readerId, projectId, asked, async (tx, page) => {
      const rows = await tx.survey.findMany({
        where: { projectId },
        orderBy: { id: 'asc' },
        include: { flags: { orderBy: { raisedAt: 'asc' }, include: withAcceptances } },
        ...page,
      });
      const marked = await ReviewReads.markedEach(tx, 'surveyId', rows);
      return rows.map(({ flags, ...survey }) => ({
        id: survey.id,
        shown: {
          survey: surveyRecord(survey),
          flags: flags.map(flagRead),
          ...marked(survey.id),
        },
      }));
    }).then(({ rows, next }) => ({ surveys: rows, next }));
  }

  incidents(readerId: string, projectId: string, asked: PageAsked) {
    return this.formsOf(readerId, projectId, asked, async (tx, page) => {
      const rows = await tx.incident.findMany({
        where: { projectId },
        orderBy: { id: 'asc' },
        ...page,
      });
      const marked = await ReviewReads.markedEach(tx, 'incidentId', rows);
      return rows.map((incident) => ({
        id: incident.id,
        shown: { incident: incidentRecord(incident), ...marked(incident.id) },
      }));
    }).then(({ rows, next }) => ({ incidents: rows, next }));
  }

  dropOffLogs(readerId: string, projectId: string, asked: PageAsked) {
    return this.formsOf(readerId, projectId, asked, async (tx, page) => {
      const rows = await tx.dropOffLog.findMany({
        where: { projectId },
        orderBy: { id: 'asc' },
        ...page,
      });
      const marked = await ReviewReads.markedEach(tx, 'dropOffLogId', rows);
      return rows.map((log) => ({
        id: log.id,
        shown: { dropOffLog: dropOffLogRecord(log), ...marked(log.id) },
      }));
    }).then(({ rows, next }) => ({ dropOffLogs: rows, next }));
  }

  // A project's invoice batches in name order, each with how many locks in force it holds.
  invoiceBatches(readerId: string, projectId: string, asked: PageAsked) {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      await ReviewReads.project(tx, projectId);
      const rows = await tx.invoiceBatch.findMany({
        where: { projectId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        include: { _count: { select: { locks: { where: { unlockedAt: null } } } } },
        ...fromCursor(asked),
      });
      const { rows: page, next } = pageOf(rows, asked.limit);
      return {
        batches: page.map(({ _count, ...batch }) => ({
          batch: invoiceBatchRecord(batch),
          locksInForce: _count.locks,
        })),
        next,
      };
    });
  }

  // One batch, each lock in force that names it and the ticket it locks.
  invoiceBatch(readerId: string, invoiceBatchId: string) {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const batch = await tx.invoiceBatch.findUnique({ where: { id: invoiceBatchId } });
      if (batch === null) throw notFound();
      const locks = await tx.invoiceLock.findMany({
        where: { invoiceBatchId, unlockedAt: null },
        orderBy: { lockedAt: 'asc' },
        include: {
          completedLoad: { select: { ticketNumber: true } },
          completedHaulOut: { select: { ticketNumber: true } },
          fieldEvent: { select: { ticketNumber: true } },
        },
      });
      return {
        batch: invoiceBatchRecord(batch),
        locks: locks.map(({ completedLoad, completedHaulOut, fieldEvent, ...lock }) => ({
          lock: invoiceLockRecord(lock),
          ticket:
            completedLoad !== null
              ? { workflow: 'LOAD' as const, ticketNumber: completedLoad.ticketNumber }
              : completedHaulOut !== null
                ? { workflow: 'HAUL_OUT' as const, ticketNumber: completedHaulOut.ticketNumber }
                : { workflow: 'UNIT_RATE' as const, ticketNumber: fieldEvent?.ticketNumber ?? '' },
        })),
      };
    });
  }

  // A page of one of a project's forms, each with what is shown beside it.
  private formsOf<S>(
    readerId: string,
    projectId: string,
    asked: PageAsked,
    read: (
      tx: Tx,
      page: ReturnType<typeof fromCursor>,
    ) => Promise<{ readonly id: string; readonly shown: S }[]>,
  ): Promise<{ rows: S[]; next: string | null }> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      await ReviewReads.project(tx, projectId);
      const { rows, next } = pageOf(await read(tx, fromCursor(asked)), asked.limit);
      return { rows: rows.map((row) => row.shown), next };
    });
  }

  private static async certificationIn(tx: Tx, certificationId: string) {
    const kept = await tx.certification.findUnique({
      where: { id: certificationId },
      include: {
        boxes: { orderBy: { position: 'asc' } },
        helpers: { where: { archivedAt: null }, orderBy: { id: 'asc' } },
        flags: { orderBy: { raisedAt: 'asc' }, include: withAcceptances },
      },
    });
    if (kept === null) throw notFound();
    const { boxes, helpers, flags, ...certification } = kept;
    return {
      certification: certificationRecord(certification),
      boxes: boxes.map((box) => ({
        id: box.id,
        position: box.position,
        shape: box.shape,
        sign: box.sign,
        featureId: box.featureId,
        featureOther: box.featureOther,
        length: box.length,
        secondLength: box.secondLength,
        width: box.width,
        height: box.height,
        diameter: box.diameter,
        radius: box.radius,
        run: box.run,
        corners: box.corners,
        takenOffAt: time(box.archivedAt),
      })),
      helperIds: helpers.map((helper) => helper.userId),
      ...(await ReviewReads.marked(tx, 'certificationId', certificationId)),
      flags: flags.map(flagRead),
    };
  }

  // A record's photographs' records, in the order they were taken, and its QC mark.
  private static async marked(tx: Tx, owner: MarkOwner, id: string) {
    return (await ReviewReads.markedEach(tx, owner, [{ id }]))(id);
  }

  // The same for each record of a page: one query for all their photographs, then one for all
  // their QC marks, never two a row nor two at once on the read's one connection (ADR-552 (4),
  // 554). What each record is shown is then found by its id.
  private static async markedEach(
    tx: Tx,
    owner: MarkOwner,
    records: readonly { readonly id: string }[],
  ) {
    const ids = records.map((record) => record.id);
    const photos = await tx.photo.findMany({
      where: { [owner]: { in: ids } },
      orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
    });
    const qcMarks = await tx.qcMark.findMany({ where: { [owner]: { in: ids } } });
    return (id: string) => {
      const qcMark = qcMarks.find((mark) => mark[owner] === id);
      return {
        photographs: photos.filter((photo) => photo[owner] === id).map(photographRecord),
        qcMark: qcMark === undefined ? null : qcMarkRecord(qcMark),
      };
    };
  }

  private static async photographs(tx: Tx, owner: PhotoOwner, id: string) {
    const photos = await tx.photo.findMany({
      where: { [owner]: id },
      orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
    });
    return photos.map(photographRecord);
  }

  // A project of that id, or nothing to read.
  private static async project(tx: Tx, projectId: string): Promise<void> {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (project === null) throw notFound();
  }

  // The completed record that stands, with its collection rows that stand; none on a unit rate
  // ticket, or where the worker has written none.
  private static async completed(
    tx: Tx,
    projectId: string,
    workflow: WorkflowName,
    ticketNumber: string,
  ) {
    if (workflow === 'UNIT_RATE') return null;
    const standing = { projectId, ticketNumber, dissolvedAt: null };
    const row = (each: {
      id: string;
      collectionEventId: string;
      splitSuffix: string;
      shareFraction: Exact;
      volumeCy: Exact | null;
      weightTons: Exact | null;
      mileage: Exact | null;
      mileageSource: NonNullable<TicketAnswer['completed']>['collections'][number]['mileageSource'];
      snappedAddress: string | null;
    }) => ({
      id: each.id,
      collectionEventId: each.collectionEventId,
      splitSuffix: each.splitSuffix,
      shareFraction: each.shareFraction.toFixed(8),
      volumeCy: exact(each.volumeCy, 2),
      weightTons: exact(each.weightTons, 4),
      mileage: exact(each.mileage, 4),
      mileageSource: each.mileageSource,
      snappedAddress: each.snappedAddress,
    });
    const figures = (record: {
      id: string;
      disposalEventId: string;
      quantitySource: NonNullable<TicketAnswer['completed']>['quantitySource'];
      capacityCy: number | null;
      loadCall: number | null;
      volumeCy: Exact | null;
      weightTons: Exact | null;
      weightIsShare: boolean;
    }) => ({
      id: record.id,
      disposalEventId: record.disposalEventId,
      quantitySource: record.quantitySource,
      capacityCy: record.capacityCy,
      loadCall: record.loadCall,
      volumeCy: exact(record.volumeCy, 2),
      weightTons: exact(record.weightTons, 4),
      weightIsShare: record.weightIsShare,
    });
    if (workflow === 'LOAD') {
      const load = await tx.completedLoad.findFirst({ where: standing });
      if (load === null) return null;
      const rows = await tx.completedLoadCollection.findMany({
        where: { completedLoadId: load.id, dissolvedAt: null },
        orderBy: { splitSuffix: 'asc' },
      });
      return {
        id: load.id,
        collections: rows,
        shown: {
          ...figures(load),
          carriedCount: load.carriedCount,
          collections: rows.map((each) => ({ ...row(each), pileLoadCall: null })),
        },
      };
    }
    const haulOut = await tx.completedHaulOut.findFirst({ where: standing });
    if (haulOut === null) return null;
    const piles = await tx.completedHaulOutCollection.findMany({
      where: { completedHaulOutId: haulOut.id, dissolvedAt: null },
      orderBy: { splitSuffix: 'asc' },
    });
    return {
      id: haulOut.id,
      collections: piles,
      shown: {
        ...figures(haulOut),
        carriedCount: null,
        collections: piles.map((each) => ({ ...row(each), pileLoadCall: each.pileLoadCall })),
      },
    };
  }
}
