// What the worker writes for one ticket, inside that ticket's one piece of work (spec/parts/
// 06-reconciliation.md step 7; spec/acceptance/06-reconciliation.md section N; ARCHITECTURE §13;
// invariants 4, 17, 21; ADR-086, 166, 340, 352): the status, the zone and a unit rate ticket's
// worked-out pay item on its field events; its completed load or haul-out and a row for each
// collection, updated in place and never duplicated, marked dissolved when the ticket is no
// longer whole; its lines; its flags, compared with the ones that stand; and the run's decision.
//
// Only what differs is written: a ticket worked again on unchanged facts gets its decision and
// nothing else, so no audit record says a conclusion changed when none did (AC-06-151). What
// stands is read here, inside the piece of work, never from what the run read before it.
//
// The lines (spec/parts/07-pricing-ledger-audit.md step 8; adms-ledger-audit §6.1; ADR-085, 359)
// are the ledger's current truth: a line that stands exactly as the rules give it now is left; one
// that differs in anything is removed and written again, never updated, and one the rules no
// longer give is removed. The database copies each removed row in full to the audit log before
// it goes, and refuses the removal and the new line alike on a ticket locked as invoiced. There
// is no reversal row.
import type { Prisma } from '@open-adms/db';
import {
  Flags,
  type FlagStanding,
  type PricedLine,
  type Ticket,
  type WorkflowName,
} from '@open-adms/domain';

import type { WorkerFieldEvent } from './project-read.ts';
import type { CollectionWorked, CompletedWorked, TicketWorked, WorkedFlag } from './ticket-work.ts';

type Tx = Prisma.TransactionClient;

// What a flag is on: a ticket, or the record it sits on.
export type FlagOn =
  | { readonly workflow: WorkflowName; readonly ticketNumber: string }
  | { readonly certificationId: string }
  | { readonly disposalSiteId: string }
  | { readonly surveyId: string };

export interface WrittenFlags {
  readonly kept: number;
  readonly cleared: number;
  readonly raised: number;
}

export interface WrittenLines {
  readonly kept: number;
  readonly removed: number;
  readonly written: number;
}

export interface Written {
  readonly flags: WrittenFlags;
  readonly lines: WrittenLines;
}

// A load's or a haul-out's completed records the ticket touches: the one its lines hang on now,
// with the row of each collection, and every one whose lines are the ticket's to remove.
interface CompletedWritten {
  readonly recordId: string | null;
  readonly rowOf: ReadonlyMap<string, string>;
  readonly recordIds: readonly string[];
}

// What a line hangs on: a load's property, a haul-out's pile, or a unit rate ticket.
type LineOn =
  | { readonly completedLoadId: string; readonly completedLoadCollectionId: string }
  | { readonly completedHaulOutId: string; readonly completedHaulOutCollectionId: string }
  | { readonly fieldEventId: string };

const decimal = (amount: { toFixed(places: number): string } | null, places: number) =>
  amount === null ? null : amount.toFixed(places);
const sameDay = (date: Date | null, day: string | null): boolean =>
  (date === null ? null : date.toISOString().slice(0, 10)) === day;

export class TicketWrite {
  private readonly tx: Tx;
  private readonly projectId: string;
  private readonly runId: string;
  private readonly now: Date;

  constructor(tx: Tx, projectId: string, runId: string, now: Date) {
    this.tx = tx;
    this.projectId = projectId;
    this.runId = runId;
    this.now = now;
  }

  // Everything the worker concluded for the ticket.
  async conclusions(worked: TicketWorked): Promise<Written> {
    const { ticket } = worked;
    for (const event of ticket.events) {
      const zone = worked.zones.find((attached) => attached.fieldEventId === event.id);
      await this.fieldEvent(event, {
        status: worked.status,
        zoneId: zone === undefined ? event.zoneId : zone.zoneId,
        mapVersionId: zone === undefined ? event.mapVersionId : zone.mapVersionId,
        workedOutPayItemId:
          worked.workedOut?.fieldEventId === event.id
            ? worked.workedOut.payItemId
            : event.workedOutPayItemId,
      });
    }
    const lines =
      ticket.workflow === 'LOAD'
        ? await this.loadLines(await this.completedLoad(ticket, worked.completed), worked.lines)
        : ticket.workflow === 'HAUL_OUT'
          ? await this.haulOutLines(
              await this.completedHaulOut(ticket, worked.completed),
              worked.lines,
            )
          : await this.unitRateLines(ticket, worked.lines);
    // A void ticket has no open flag: what stood is cleared, kept in its history (ADR-365).
    const flags = await this.flags(
      { workflow: ticket.workflow, ticketNumber: ticket.ticketNumber },
      worked.status === 'VOID' ? [] : worked.flags,
    );
    return { flags, lines };
  }

  // A ticket a person voided: its field events stand at VOID, its lines are removed (the
  // database copies each to the audit log first) and its flags are cleared. Its completed
  // record, where it has one, is left as it is (ADR-028, 060, 085, 365).
  async voided(ticket: {
    readonly workflow: WorkflowName;
    readonly ticketNumber: string;
    readonly events: readonly WorkerFieldEvent[];
  }): Promise<{ readonly linesRemoved: number; readonly flagsCleared: number }> {
    for (const event of ticket.events) {
      await this.fieldEvent(event, {
        status: 'VOID',
        zoneId: event.zoneId,
        mapVersionId: event.mapVersionId,
        workedOutPayItemId: event.workedOutPayItemId,
      });
    }
    const ids = ticket.events.map((event) => event.id);
    const ofIts = {
      OR: [
        { disposalEventId: { in: ids } },
        { collections: { some: { collectionEventId: { in: ids }, dissolvedAt: null } } },
      ],
    };
    const lines = await this.lines(
      ticket.workflow === 'UNIT_RATE'
        ? { fieldEventId: { in: ids } }
        : ticket.workflow === 'LOAD'
          ? { completedLoad: ofIts }
          : { completedHaulOut: ofIts },
      [],
    );
    const flags = await this.flags(
      { workflow: ticket.workflow, ticketNumber: ticket.ticketNumber },
      [],
    );
    return { linesRemoved: lines.removed, flagsCleared: flags.cleared };
  }

  private loadLines(completed: CompletedWritten, lines: readonly PricedLine[]) {
    const { recordId } = completed;
    return this.lines(
      { completedLoadId: { in: [...completed.recordIds] } },
      lines.map((line) => {
        const rowId = completed.rowOf.get(line.fieldEventId);
        if (recordId === null || rowId === undefined) {
          throw new Error('A line on a property with no row of a completed load.');
        }
        return { line, on: { completedLoadId: recordId, completedLoadCollectionId: rowId } };
      }),
    );
  }

  private haulOutLines(completed: CompletedWritten, lines: readonly PricedLine[]) {
    const { recordId } = completed;
    return this.lines(
      { completedHaulOutId: { in: [...completed.recordIds] } },
      lines.map((line) => {
        const rowId = completed.rowOf.get(line.fieldEventId);
        if (recordId === null || rowId === undefined) {
          throw new Error('A line on a pile with no row of a completed haul-out.');
        }
        return { line, on: { completedHaulOutId: recordId, completedHaulOutCollectionId: rowId } };
      }),
    );
  }

  private unitRateLines(ticket: Ticket<WorkerFieldEvent>, lines: readonly PricedLine[]) {
    return this.lines(
      { fieldEventId: { in: ticket.events.map((event) => event.id) } },
      lines.map((line) => ({ line, on: { fieldEventId: line.fieldEventId } })),
    );
  }

  // The ticket's lines that stand against the ones the rules give now.
  private async lines(
    standing: Prisma.TransactionWhereInput,
    now: readonly { readonly line: PricedLine; readonly on: LineOn }[],
  ): Promise<WrittenLines> {
    const { tx, projectId } = this;
    const stand = await tx.transaction.findMany({
      where: { projectId, ...standing },
      orderBy: { id: 'asc' },
    });
    const mark = (
      on: {
        readonly completedLoadCollectionId?: string | null;
        readonly completedHaulOutCollectionId?: string | null;
        readonly fieldEventId?: string | null;
      },
      line: Omit<PricedLine, 'splitSuffix' | 'fieldEventId'>,
    ): string =>
      JSON.stringify([
        on.completedLoadCollectionId ?? on.completedHaulOutCollectionId ?? on.fieldEventId,
        line.slot,
        line.ruleId,
        line.payItemId,
        line.contractId,
        line.primeId,
        line.operatingSubId,
        line.unit,
        line.quantity,
        line.rate,
        line.amount,
      ]);
    const given = new Set(now.map(({ line, on }) => mark(on, line)));
    const kept = new Set<string>();
    let removed = 0;
    for (const row of stand) {
      const same = mark(row, {
        ...row,
        quantity: row.quantity.toFixed(4),
        rate: row.rate.toFixed(4),
        amount: row.amount.toFixed(2),
      });
      if (given.has(same)) {
        kept.add(same);
        continue;
      }
      // The database copies the whole row to the audit log before it goes (ADR-085).
      await tx.transaction.delete({ where: { id: row.id }, select: { id: true } });
      removed += 1;
    }
    let written = 0;
    for (const { line, on } of now) {
      if (kept.has(mark(on, line))) continue;
      await tx.transaction.create({
        data: {
          projectId,
          ...on,
          slot: line.slot,
          ruleId: line.ruleId,
          payItemId: line.payItemId,
          contractId: line.contractId,
          primeId: line.primeId,
          operatingSubId: line.operatingSubId,
          unit: line.unit,
          quantity: line.quantity,
          rate: line.rate,
          amount: line.amount,
          reconciliationRunId: this.runId,
        },
        select: { id: true },
      });
      written += 1;
    }
    return { kept: kept.size, removed, written };
  }

  // The worker's columns on a field event: written when one differs, and the first time the
  // worker works it.
  async fieldEvent(
    event: WorkerFieldEvent,
    concluded: {
      readonly status: WorkerFieldEvent['status'];
      readonly zoneId: string | null;
      readonly mapVersionId: string | null;
      readonly workedOutPayItemId: string | null;
    },
  ): Promise<void> {
    if (
      event.reconciledAt !== null &&
      event.status === concluded.status &&
      event.zoneId === concluded.zoneId &&
      event.mapVersionId === concluded.mapVersionId &&
      event.workedOutPayItemId === concluded.workedOutPayItemId
    ) {
      return;
    }
    await this.tx.fieldEvent.update({
      where: { id: event.id },
      data: { ...concluded, reconciledAt: this.now },
      select: { id: true },
    });
  }

  // The flags that stand on something against the ones its facts raise now (ADR-166): the same
  // flag is kept as it is, one its facts no longer raise is cleared, never deleted, and a new
  // one is raised.
  async flags(on: FlagOn, now: readonly WorkedFlag[]): Promise<WrittenFlags> {
    const standing: FlagStanding[] = await this.tx.flag.findMany({
      where: {
        projectId: this.projectId,
        clearedAt: null,
        ...('ticketNumber' in on ? on : { ...on, ticketNumber: null }),
      },
      select: { id: true, code: true, fieldEventId: true, factsSha256: true },
      orderBy: { id: 'asc' },
    });
    const compared = Flags.compared(standing, now);
    for (const flag of compared.cleared) {
      await this.tx.flag.update({
        where: { id: flag.id },
        data: { clearedAt: this.now },
        select: { id: true },
      });
    }
    for (const raised of compared.raised) {
      // The same record that was handed in: a pricing flag's # and pay item are on it.
      const flag: WorkedFlag = raised;
      await this.tx.flag.create({
        data: {
          projectId: this.projectId,
          ...on,
          fieldEventId: flag.fieldEventId,
          code: flag.code,
          message: flag.message,
          facts: flag.facts,
          factsSha256: flag.factsSha256,
          billing: flag.billing,
          slot: flag.slot ?? null,
          payItemId: flag.payItemId ?? null,
          raisedAt: this.now,
          reconciliationRunId: this.runId,
        },
        select: { id: true },
      });
    }
    return {
      kept: compared.kept.length,
      cleared: compared.cleared.length,
      raised: compared.raised.length,
    };
  }

  // What the run decided for a ticket, and why, for a person to read (ARCHITECTURE §13).
  async decision(
    ticket: {
      readonly workflow: WorkflowName;
      readonly ticketNumber: string;
      readonly events: readonly WorkerFieldEvent[];
    },
    status: WorkerFieldEvent['status'],
    summary: Prisma.InputJsonObject,
    error: string | null = null,
  ): Promise<void> {
    await this.tx.reconciliationDecision.create({
      data: {
        reconciliationRunId: this.runId,
        workflow: ticket.workflow,
        ticketNumber: ticket.ticketNumber,
        status,
        summary: {
          fieldEvents: ticket.events.map((event) => ({
            id: event.id,
            kind: event.kind,
            splitSuffix: event.splitSuffix,
            startedAt: event.startedAt.toISOString(),
            endedAt: event.endedAt.toISOString(),
          })),
          ...summary,
        },
        error,
      },
      select: { id: true },
    });
  }

  // A load's completed record: one for its disposal event, for the life of that event.
  private async completedLoad(
    ticket: Ticket<WorkerFieldEvent>,
    completed: CompletedWorked | null,
  ): Promise<CompletedWritten> {
    const { tx, projectId, now } = this;
    const live = await tx.completedLoad.findMany({
      where: { projectId, ticketNumber: ticket.ticketNumber, dissolvedAt: null },
    });
    // The record of the ticket's own disposal, whatever number it was concluded under.
    const disposalEventId = ticket.disposal?.id ?? null;
    const own =
      disposalEventId === null
        ? null
        : await tx.completedLoad.findUnique({ where: { disposalEventId } });
    // A completed load the ticket no longer makes whole: one still under this number whose
    // disposal is no longer the ticket's, or the disposal's own while its collection is
    // missing. Marked, with its rows, never deleted (ADR-086).
    const dissolved = [
      ...live.filter((record) => record.id !== own?.id),
      ...(completed === null && own !== null && own.dissolvedAt === null ? [own] : []),
    ];
    for (const record of dissolved) {
      await tx.completedLoadCollection.updateMany({
        where: { completedLoadId: record.id, dissolvedAt: null },
        data: { dissolvedAt: now },
      });
      await tx.completedLoad.update({
        where: { id: record.id },
        data: { dissolvedAt: now },
        select: { id: true },
      });
    }
    // The records whose lines are the ticket's: its own, and each it no longer makes whole.
    const recordIds = [
      ...new Set([...dissolved, ...(own === null ? [] : [own])].map((record) => record.id)),
    ];
    if (completed === null) return { recordId: null, rowOf: new Map(), recordIds };

    const figures = {
      ticketNumber: ticket.ticketNumber,
      quantitySource: completed.quantitySource,
      capacityCy: completed.capacityCy,
      loadCall: completed.loadCall,
      volumeCy: completed.volumeCy,
      weightTons: completed.weightTons,
      weightIsShare: completed.weightIsShare,
      carriedCount: completed.carriedCount,
    };
    let recordId: string;
    if (own === null) {
      const created = await tx.completedLoad.create({
        data: { projectId, disposalEventId: completed.disposalEventId, ...figures },
        select: { id: true },
      });
      recordId = created.id;
    } else {
      recordId = own.id;
      const differs =
        own.dissolvedAt !== null ||
        own.ticketNumber !== figures.ticketNumber ||
        own.quantitySource !== figures.quantitySource ||
        own.capacityCy !== figures.capacityCy ||
        own.loadCall !== figures.loadCall ||
        decimal(own.volumeCy, 2) !== figures.volumeCy ||
        decimal(own.weightTons, 4) !== figures.weightTons ||
        own.weightIsShare !== figures.weightIsShare ||
        own.carriedCount !== figures.carriedCount;
      if (differs) {
        await tx.completedLoad.update({
          where: { id: own.id },
          data: { ...figures, dissolvedAt: null },
          select: { id: true },
        });
      }
    }

    const rows = await tx.completedLoadCollection.findMany({
      where: { completedLoadId: recordId },
      orderBy: { id: 'asc' },
    });
    for (const row of rows) {
      const still = completed.collections.some(
        (collection) => collection.collectionEventId === row.collectionEventId,
      );
      if (!still && row.dissolvedAt === null) {
        await tx.completedLoadCollection.update({
          where: { id: row.id },
          data: { dissolvedAt: now },
          select: { id: true },
        });
      }
    }
    const rowOf = new Map<string, string>();
    for (const collection of completed.collections) {
      const row = rows.find((each) => each.collectionEventId === collection.collectionEventId);
      const data = TicketWrite.rowOf(collection);
      if (row === undefined) {
        const created = await tx.completedLoadCollection.create({
          data: {
            projectId,
            completedLoadId: recordId,
            collectionEventId: collection.collectionEventId,
            ...data,
          },
          select: { id: true },
        });
        rowOf.set(collection.collectionEventId, created.id);
        continue;
      }
      rowOf.set(collection.collectionEventId, row.id);
      if (row.dissolvedAt !== null || TicketWrite.rowDiffers(row, collection)) {
        await tx.completedLoadCollection.update({
          where: { id: row.id },
          data: { ...data, dissolvedAt: null },
          select: { id: true },
        });
      }
    }
    return { recordId, rowOf, recordIds: [...new Set([...recordIds, recordId])] };
  }

  // A haul-out's completed record: the same, with what each pile added to the call.
  private async completedHaulOut(
    ticket: Ticket<WorkerFieldEvent>,
    completed: CompletedWorked | null,
  ): Promise<CompletedWritten> {
    const { tx, projectId, now } = this;
    const live = await tx.completedHaulOut.findMany({
      where: { projectId, ticketNumber: ticket.ticketNumber, dissolvedAt: null },
    });
    const disposalEventId = ticket.disposal?.id ?? null;
    const own =
      disposalEventId === null
        ? null
        : await tx.completedHaulOut.findUnique({ where: { disposalEventId } });
    const dissolved = [
      ...live.filter((record) => record.id !== own?.id),
      ...(completed === null && own !== null && own.dissolvedAt === null ? [own] : []),
    ];
    for (const record of dissolved) {
      await tx.completedHaulOutCollection.updateMany({
        where: { completedHaulOutId: record.id, dissolvedAt: null },
        data: { dissolvedAt: now },
      });
      await tx.completedHaulOut.update({
        where: { id: record.id },
        data: { dissolvedAt: now },
        select: { id: true },
      });
    }
    // The records whose lines are the ticket's: its own, and each it no longer makes whole.
    const recordIds = [
      ...new Set([...dissolved, ...(own === null ? [] : [own])].map((record) => record.id)),
    ];
    if (completed === null) return { recordId: null, rowOf: new Map(), recordIds };

    const figures = {
      ticketNumber: ticket.ticketNumber,
      quantitySource: completed.quantitySource,
      capacityCy: completed.capacityCy,
      loadCall: completed.loadCall,
      volumeCy: completed.volumeCy,
      weightTons: completed.weightTons,
      weightIsShare: completed.weightIsShare,
    };
    let recordId: string;
    if (own === null) {
      const created = await tx.completedHaulOut.create({
        data: { projectId, disposalEventId: completed.disposalEventId, ...figures },
        select: { id: true },
      });
      recordId = created.id;
    } else {
      recordId = own.id;
      const differs =
        own.dissolvedAt !== null ||
        own.ticketNumber !== figures.ticketNumber ||
        own.quantitySource !== figures.quantitySource ||
        own.capacityCy !== figures.capacityCy ||
        own.loadCall !== figures.loadCall ||
        decimal(own.volumeCy, 2) !== figures.volumeCy ||
        decimal(own.weightTons, 4) !== figures.weightTons ||
        own.weightIsShare !== figures.weightIsShare;
      if (differs) {
        await tx.completedHaulOut.update({
          where: { id: own.id },
          data: { ...figures, dissolvedAt: null },
          select: { id: true },
        });
      }
    }

    const rows = await tx.completedHaulOutCollection.findMany({
      where: { completedHaulOutId: recordId },
      orderBy: { id: 'asc' },
    });
    for (const row of rows) {
      const still = completed.collections.some(
        (collection) => collection.collectionEventId === row.collectionEventId,
      );
      if (!still && row.dissolvedAt === null) {
        await tx.completedHaulOutCollection.update({
          where: { id: row.id },
          data: { dissolvedAt: now },
          select: { id: true },
        });
      }
    }
    const rowOf = new Map<string, string>();
    for (const collection of completed.collections) {
      const row = rows.find((each) => each.collectionEventId === collection.collectionEventId);
      const data = { ...TicketWrite.rowOf(collection), pileLoadCall: collection.pileLoadCall ?? 0 };
      if (row === undefined) {
        const created = await tx.completedHaulOutCollection.create({
          data: {
            projectId,
            completedHaulOutId: recordId,
            collectionEventId: collection.collectionEventId,
            ...data,
          },
          select: { id: true },
        });
        rowOf.set(collection.collectionEventId, created.id);
        continue;
      }
      rowOf.set(collection.collectionEventId, row.id);
      if (
        row.dissolvedAt !== null ||
        row.pileLoadCall !== data.pileLoadCall ||
        TicketWrite.rowDiffers(row, collection)
      ) {
        await tx.completedHaulOutCollection.update({
          where: { id: row.id },
          data: { ...data, dissolvedAt: null },
          select: { id: true },
        });
      }
    }
    return { recordId, rowOf, recordIds: [...new Set([...recordIds, recordId])] };
  }

  // A collection row's share and its mileage, every mileage column empty where none could be
  // worked out.
  private static rowOf(collection: CollectionWorked) {
    const { mileage } = collection;
    return {
      splitSuffix: collection.splitSuffix,
      shareFraction: collection.shareFraction,
      volumeCy: collection.volumeCy,
      weightTons: collection.weightTons,
      mileage: mileage?.miles ?? null,
      mileageSource: mileage?.source ?? null,
      snappedLatitude: mileage?.snapped?.latitude ?? null,
      snappedLongitude: mileage?.snapped?.longitude ?? null,
      snappedAddress: mileage?.snappedAddress ?? null,
      mapDataDate: mileage === null ? null : new Date(mileage.mapData.date),
      mapDataSha256: mileage?.mapData.sha256 ?? null,
    };
  }

  private static rowDiffers(
    row: {
      readonly splitSuffix: string;
      readonly shareFraction: { toFixed(places: number): string };
      readonly volumeCy: { toFixed(places: number): string } | null;
      readonly weightTons: { toFixed(places: number): string } | null;
      readonly mileage: { toFixed(places: number): string } | null;
      readonly mileageSource: string | null;
      readonly snappedLatitude: { toFixed(places: number): string } | null;
      readonly snappedLongitude: { toFixed(places: number): string } | null;
      readonly snappedAddress: string | null;
      readonly mapDataDate: Date | null;
      readonly mapDataSha256: string | null;
    },
    collection: CollectionWorked,
  ): boolean {
    const { mileage } = collection;
    return (
      row.splitSuffix !== collection.splitSuffix ||
      row.shareFraction.toFixed(8) !== collection.shareFraction ||
      decimal(row.volumeCy, 2) !== collection.volumeCy ||
      decimal(row.weightTons, 4) !== collection.weightTons ||
      decimal(row.mileage, 4) !== (mileage?.miles ?? null) ||
      row.mileageSource !== (mileage?.source ?? null) ||
      decimal(row.snappedLatitude, 8) !== (mileage?.snapped?.latitude ?? null) ||
      decimal(row.snappedLongitude, 8) !== (mileage?.snapped?.longitude ?? null) ||
      row.snappedAddress !== (mileage?.snappedAddress ?? null) ||
      !sameDay(row.mapDataDate, mileage?.mapData.date ?? null) ||
      row.mapDataSha256 !== (mileage?.mapData.sha256 ?? null)
    );
  }
}
