// Locking tickets as invoiced, the named batch, and the unlock
// (spec/parts/09-invoice-deliver-closeout.md, invoicing; spec/acceptance/
// 09-invoice-deliver-closeout.md sections A…D; adms-ledger-audit §6.1d; spec/DATA-MODEL.md §6
// `InvoiceLock`, `InvoiceBatch`; ADR-057, 061, 067, 090, 121, 168, 228, 363, 367).
//
// There is no invoice record and no money moves: "invoicing" is a person locking a ticket that
// is whole, COMPLETED and QC Approved, optionally in a named batch. What is locked is a load's
// or a haul-out's completed record (a split as one) or a unit rate ticket, never a single field
// event. The lock holds no amount.
//
// While it stands the ticket doesn't change: the database gives up none of its lines and takes
// none, the worker passes it by, and the review services refuse a change to its own records. A
// lock changes nothing the worker reads, so locking answers no run.
//
// The unlock is a grant of its own. It is kept on the lock's own row (who, when, a note if one
// was written), audited, and never refused for the project's state: people are trusted not to
// unlock without good reason. It queues the job that works the ticket again, as the setup now
// stands, in its own piece of work. Locking again is a new row.
import type { InvoiceBatch, InvoiceLock } from '@open-adms/db';
import { BatchName, InvoiceLocking } from '@open-adms/domain';

import { type Outcome, Refused } from '../setup/setup-service.ts';
import {
  ReviewService,
  type MarkedTicket,
  type Reviewed,
  type TicketMarked,
  type Tx,
} from './review-service.ts';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export class InvoiceLocks extends ReviewService {
  // A named batch on the project: a name and, by the locks that name it, its tickets.
  async batch(person: string, projectId: string, name: string): Promise<Outcome<InvoiceBatch>> {
    const named = new BatchName(name);
    try {
      return await this.mark(person, 'LOCK_INVOICED', undefined, async (tx) => {
        const refusal = named.refusal();
        if (refusal !== null) throw new Refused(refusal);
        return tx.invoiceBatch.create({
          data: { projectId, name: named.name, createdById: person, createdAt: this.clock.now() },
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return { saved: false, refusal: named.used() };
    }
  }

  // Locks the ticket as invoiced, in a batch of its project where one is named.
  lock(
    person: string,
    ticket: TicketMarked,
    invoiceBatchId?: string,
  ): Promise<Outcome<InvoiceLock>> {
    return this.mark(person, 'LOCK_INVOICED', undefined, async (tx) => {
      const { marked, locking } = await InvoiceLocks.standing(tx, ticket);
      const refusal = locking.lockRefusal();
      if (refusal !== null) throw new Refused(refusal);
      if (invoiceBatchId !== undefined) await InvoiceLocks.batchOf(tx, marked, invoiceBatchId);
      return tx.invoiceLock.create({
        data: {
          projectId: marked.projectId,
          ...marked.key,
          invoiceBatchId: invoiceBatchId ?? null,
          lockedById: person,
          lockedAt: this.clock.now(),
        },
      });
    });
  }

  // Puts a ticket's lock in force in a batch, moves it to another, or takes it out of one.
  intoBatch(
    person: string,
    ticket: TicketMarked,
    invoiceBatchId: string | null,
  ): Promise<Outcome<InvoiceLock>> {
    return this.mark(person, 'LOCK_INVOICED', undefined, async (tx) => {
      const { marked, locking, inForce } = await InvoiceLocks.standing(tx, ticket);
      if (inForce === null) throw new Refused(locking.notLocked());
      if (invoiceBatchId !== null) await InvoiceLocks.batchOf(tx, marked, invoiceBatchId);
      return tx.invoiceLock.update({ where: { id: inForce.id }, data: { invoiceBatchId } });
    });
  }

  // Unlocks the ticket: the lock's row is kept and says who, when and why.
  unlock(
    person: string,
    ticket: TicketMarked,
    note?: string,
  ): Promise<Outcome<Reviewed<InvoiceLock>>> {
    return this.mark(person, 'UNLOCK_INVOICED', note, async (tx) => {
      const { marked, locking, inForce } = await InvoiceLocks.standing(tx, ticket);
      if (inForce === null) throw new Refused(locking.notLocked());
      const written = note?.trim() ?? '';
      const record = await tx.invoiceLock.update({
        where: { id: inForce.id },
        data: {
          unlockedById: person,
          unlockedAt: this.clock.now(),
          unlockNote: written === '' ? null : written,
        },
      });
      // An unlock corrects nothing: only the ticket itself is worked again, as the setup now
      // stands.
      const asked = await ReviewService.asked(tx, person, marked.projectId, [marked.ticket]);
      return { record, reprocess: await this.queued(tx, { ...asked, trigger: 'REPROCESS' }) };
    });
  }

  // A lock names a batch of its own project.
  private static async batchOf(
    tx: Tx,
    marked: MarkedTicket,
    invoiceBatchId: string,
  ): Promise<void> {
    const batch = await tx.invoiceBatch.findUniqueOrThrow({ where: { id: invoiceBatchId } });
    if (batch.projectId !== marked.projectId) throw new Refused(BatchName.onAnotherProject());
  }

  // The ticket as it stands: whole or not, its field events' status, its QC mark, its lock.
  private static async standing(
    tx: Tx,
    ticket: TicketMarked,
  ): Promise<{ marked: MarkedTicket; locking: InvoiceLocking; inForce: InvoiceLock | null }> {
    const marked = await ReviewService.ticketMarked(tx, ticket);
    const events = await tx.fieldEvent.findMany({
      where: { projectId: marked.projectId, ...marked.ticket },
      select: { status: true },
    });
    const qc = await tx.qcMark.findFirst({ where: marked.key, select: { status: true } });
    const inForce = await tx.invoiceLock.findFirst({ where: { ...marked.key, unlockedAt: null } });
    return {
      marked,
      inForce,
      locking: new InvoiceLocking({
        ticketNumber: marked.ticket.ticketNumber,
        dissolved: marked.dissolved,
        statuses: [...new Set(events.map((event) => event.status))],
        qcStatus: qc?.status ?? 'QC_REVIEW',
        locked: inForce !== null,
      }),
    };
  }
}
