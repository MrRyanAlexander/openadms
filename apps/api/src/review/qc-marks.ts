// The back office's QC status of a record (spec/parts/08-review-and-corrections.md step 7;
// spec/acceptance/08-review-and-corrections.md section G; adms-ledger-audit §6.1d;
// spec/DATA-MODEL.md §6 `QcMark`; ADR-080, 107, 117, 121, 168, 245, 363, 367).
//
// QC Review → QC Approved / QC Issues / QC Void, set by hand and only by people: on a load's or
// a haul-out's completed record (a split as one), never a single field event; on each unit rate
// ticket, certification, ROE, survey, incident and drop-off log on its own. A record has one
// mark: a change of status is the same mark changed, the status before kept in the audit log.
// A record nobody has marked is at QC Review.
//
// It changes nothing on the record and reruns nothing, so it answers no run: QC Void doesn't
// void a ticket, and QC Issues holds no money. What it does decide is the lock: only a QC
// Approved ticket can be locked as invoiced. So a ticket's mark isn't changed under its lock: it
// is unlocked first, like any change to a locked ticket (ADR-367).
import type { QcMark } from '@open-adms/db';
import { LockedTicket, type QcStatusName } from '@open-adms/domain';

import { type Outcome, Refused } from '../setup/setup-service.ts';
import { ReviewService, type TicketMarked, type Tx } from './review-service.ts';

// What a QC mark is on: a ticket, or a record QC'd on its own.
export type QcMarked =
  | TicketMarked
  | { readonly certificationId: string }
  | { readonly roeId: string }
  | { readonly surveyId: string }
  | { readonly incidentId: string }
  | { readonly dropOffLogId: string };

export class QcMarks extends ReviewService {
  set(
    person: string,
    marked: QcMarked,
    status: QcStatusName,
    note?: string,
  ): Promise<Outcome<QcMark>> {
    return this.mark(person, 'QC', note, async (tx) => {
      const { projectId, key } = await QcMarks.on(tx, marked);
      const written = note?.trim() ?? '';
      const set = {
        status,
        setById: person,
        setAt: this.clock.now(),
        note: written === '' ? null : written,
      };
      const standing = await tx.qcMark.findFirst({ where: key, select: { id: true } });
      return standing === null
        ? tx.qcMark.create({ data: { projectId, ...key, ...set } })
        : tx.qcMark.update({ where: { id: standing.id }, data: set });
    });
  }

  // The record's project and the mark's own columns for it; a ticket locked as invoiced is
  // refused.
  private static async on(
    tx: Tx,
    marked: QcMarked,
  ): Promise<{ projectId: string; key: Record<string, string> }> {
    if ('certificationId' in marked) {
      const { projectId } = await tx.certification.findUniqueOrThrow({
        where: { id: marked.certificationId },
      });
      return { projectId, key: marked };
    }
    if ('roeId' in marked) {
      const { projectId } = await tx.roe.findUniqueOrThrow({ where: { id: marked.roeId } });
      return { projectId, key: marked };
    }
    if ('surveyId' in marked) {
      const { projectId } = await tx.survey.findUniqueOrThrow({ where: { id: marked.surveyId } });
      return { projectId, key: marked };
    }
    if ('incidentId' in marked) {
      const { projectId } = await tx.incident.findUniqueOrThrow({
        where: { id: marked.incidentId },
      });
      return { projectId, key: marked };
    }
    if ('dropOffLogId' in marked) {
      const { projectId } = await tx.dropOffLog.findUniqueOrThrow({
        where: { id: marked.dropOffLogId },
      });
      return { projectId, key: marked };
    }
    const { projectId, ticket, key } = await ReviewService.ticketMarked(tx, marked);
    if (await ReviewService.locked(tx, projectId, ticket)) {
      const refusal = new LockedTicket([ticket.ticketNumber]).refusal();
      if (refusal !== null) throw new Refused(refusal);
    }
    return { projectId, key };
  }
}
