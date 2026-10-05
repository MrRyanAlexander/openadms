// What the worker writes for one ticket, inside that ticket's one piece of work (spec/parts/
// 06-reconciliation.md step 7; spec/acceptance/06-reconciliation.md section N; ARCHITECTURE §13;
// invariants 4, 17, 21; ADR-086, 166, 340, 352): the status, the zone and a unit rate ticket's
// worked-out pay item on its field events; its completed load or haul-out and a row for each
// collection, updated in place and never duplicated, marked dissolved when the ticket is no
// longer whole; its flags, compared with the ones that stand; and the run's decision.
//
// Only what differs is written: a ticket worked again on unchanged facts gets its decision and
// nothing else, so no audit record says a conclusion changed when none did (AC-06-151). What
// stands is read here, inside the piece of work, never from what the run read before it.
import type { Prisma } from '@open-adms/db';
import {
  Flags,
  type FlagRaised,
  type FlagStanding,
  type Ticket,
  type WorkflowName,
} from '@open-adms/domain';

import type { WorkerFieldEvent } from './project-read.ts';
import type { CollectionWorked, CompletedWorked, TicketWorked } from './ticket-work.ts';

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
  async conclusions(worked: TicketWorked): Promise<WrittenFlags> {
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
    if (ticket.workflow === 'LOAD') await this.completedLoad(ticket, worked.completed);
    if (ticket.workflow === 'HAUL_OUT') await this.completedHaulOut(ticket, worked.completed);
    return this.flags(
      { workflow: ticket.workflow, ticketNumber: ticket.ticketNumber },
      worked.flags,
    );
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
  async flags(on: FlagOn, now: readonly FlagRaised[]): Promise<WrittenFlags> {
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
    for (const flag of compared.raised) {
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
  ): Promise<void> {
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
    if (completed === null) return;

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
    for (const collection of completed.collections) {
      const row = rows.find((each) => each.collectionEventId === collection.collectionEventId);
      const data = TicketWrite.rowOf(collection);
      if (row === undefined) {
        await tx.completedLoadCollection.create({
          data: {
            projectId,
            completedLoadId: recordId,
            collectionEventId: collection.collectionEventId,
            ...data,
          },
          select: { id: true },
        });
      } else if (row.dissolvedAt !== null || TicketWrite.rowDiffers(row, collection)) {
        await tx.completedLoadCollection.update({
          where: { id: row.id },
          data: { ...data, dissolvedAt: null },
          select: { id: true },
        });
      }
    }
  }

  // A haul-out's completed record: the same, with what each pile added to the call.
  private async completedHaulOut(
    ticket: Ticket<WorkerFieldEvent>,
    completed: CompletedWorked | null,
  ): Promise<void> {
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
    if (completed === null) return;

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
    for (const collection of completed.collections) {
      const row = rows.find((each) => each.collectionEventId === collection.collectionEventId);
      const data = { ...TicketWrite.rowOf(collection), pileLoadCall: collection.pileLoadCall ?? 0 };
      if (row === undefined) {
        await tx.completedHaulOutCollection.create({
          data: {
            projectId,
            completedHaulOutId: recordId,
            collectionEventId: collection.collectionEventId,
            ...data,
          },
          select: { id: true },
        });
      } else if (
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
