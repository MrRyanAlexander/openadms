// Resolving a quarantined record (spec/parts/08-review-and-corrections.md, "One review queue";
// spec/acceptance/08-review-and-corrections.md AC-08-25, 26; adms-exceptions §4.3a "Resolving a
// quarantine: it is not a wastebasket"; spec/DATA-MODEL.md §4.5; ADR-022, 028, 051, 292 (5),
// 338, 364).
//
// A quarantined record is a monitor's record of real work whose number another record holds. A
// person reads both and decides, one of two ways:
// - Renumber: it becomes the record its phone sent, under the number it should have had. It
//   keeps the id its phone made, its photographs become that record's, and it is written as the
//   reviewer, so the audit log names them. The worker then pairs it by its number like any other.
// - A second copy: the same work sent twice under two ids. Nothing is made from it; the record
//   that holds the number is the record.
// Either way the quarantined record stays, marked with who resolved it, when and how, and what
// the phone sent is still there exactly as sent: the database refuses any change to it.
import type { QuarantinedRecord } from '@open-adms/db';
import { GpsFix, QuarantineResolution, Renumber } from '@open-adms/domain';

import { type Outcome, Refused } from '../setup/setup-service.ts';
import { RecordWrite } from '../sync/record-write.ts';
import type { IntakeNote, SentFieldEvent, SentRoe } from '../sync/sent.ts';
import {
  ReviewService,
  type Reviewed,
  type TicketNamed,
  ticketOf,
  type Tx,
} from './review-service.ts';

// The number a quarantined record is given: a field event's ticket number (and, on a split's
// collection, its suffix), or an ROE's number.
export type NewNumber =
  { readonly ticketNumber: string; readonly splitSuffix?: string } | { readonly roeNumber: string };

// What the phone sent, as the quarantined record keeps it: JSON, its times ISO 8601 text.
type Kept<T> = { readonly [K in keyof T]: T[K] extends Date ? string : T[K] };
type KeptPayload =
  | { readonly record: 'FIELD_EVENT'; readonly fieldEvent: Kept<SentFieldEvent> }
  | { readonly record: 'ROE'; readonly roe: Kept<SentRoe> };

export class QuarantineReview extends ReviewService {
  renumber(
    person: string,
    quarantinedRecordId: string,
    to: NewNumber,
    note?: string,
  ): Promise<Outcome<Reviewed<QuarantinedRecord>>> {
    return this.review(person, 'RENUMBER', note, async (tx) => {
      const { waiting, resolution } = await QuarantineReview.waiting(tx, quarantinedRecordId);
      const sent = waiting.payload as unknown as KeptPayload;
      const write = new RecordWrite(tx, waiting.receivedAt);
      const notes: IntakeNote[] = [];
      let tickets: TicketNamed[];
      let numbered: string;
      if (sent.record === 'FIELD_EVENT' && 'ticketNumber' in to) {
        const kept = sent.fieldEvent;
        const renumber = new Renumber(kept.kind, kept, {
          ticketNumber: to.ticketNumber,
          splitSuffix: to.splitSuffix ?? kept.splitSuffix,
        });
        const refusal = renumber.refusal();
        if (refusal !== null) throw new Refused(refusal);
        const holder = await tx.fieldEvent.findUnique({
          where: {
            projectId_workflow_ticketNumber_splitSuffix_kind: {
              projectId: kept.projectId,
              workflow: kept.workflow,
              kind: kept.kind,
              ...renumber.to,
            },
          },
        });
        if (holder !== null) throw new Refused(renumber.held());
        const event = {
          ...kept,
          ...renumber.to,
          startedAt: new Date(kept.startedAt),
          endedAt: new Date(kept.endedAt),
        };
        await write.fieldEvent(event);
        await tx.photo.updateMany({
          where: { quarantinedRecordId },
          data: { quarantinedRecordId: null, fieldEventId: event.id },
        });
        tickets = [ticketOf(kept), ticketOf(event)];
        numbered =
          event.splitSuffix === ''
            ? event.ticketNumber
            : `${event.ticketNumber}-${event.splitSuffix}`;
      } else if (sent.record === 'ROE' && 'roeNumber' in to) {
        const roeNumber = to.roeNumber.trim();
        const holder = await tx.roe.findUnique({
          where: { projectId_roeNumber: { projectId: sent.roe.projectId, roeNumber } },
        });
        if (roeNumber === '' || holder !== null) {
          throw new Refused(resolution.roeNumberHeld(roeNumber));
        }
        const roe = { ...sent.roe, roeNumber, madeAt: new Date(sent.roe.madeAt) };
        const fix = new GpsFix({ latitude: roe.latitude, longitude: roe.longitude }).read();
        await write.roe(roe, fix.fix, notes);
        await tx.photo.updateMany({
          where: { quarantinedRecordId },
          data: { quarantinedRecordId: null, roeId: roe.id },
        });
        // The records that were waiting for an ROE of that number point at it now.
        tickets = await ReviewService.ticketsOf(tx, { roeId: roe.id });
        numbered = `ROE ${roeNumber}`;
      } else {
        throw new Refused(resolution.wrongKindOfNumber(sent.record));
      }
      const record = await this.resolved(
        tx,
        person,
        quarantinedRecordId,
        resolution.renumbered(numbered),
      );
      return { record, projectId: record.projectId, tickets };
    });
  }

  secondCopy(
    person: string,
    quarantinedRecordId: string,
    note?: string,
  ): Promise<Outcome<Reviewed<QuarantinedRecord>>> {
    return this.review(person, 'RENUMBER', note, async (tx) => {
      const { resolution } = await QuarantineReview.waiting(tx, quarantinedRecordId);
      const record = await this.resolved(tx, person, quarantinedRecordId, resolution.secondCopy());
      return { record, projectId: record.projectId, tickets: [] };
    });
  }

  // The record, still waiting: one already resolved is refused, and stays as it was resolved.
  private static async waiting(
    tx: Tx,
    id: string,
  ): Promise<{ waiting: QuarantinedRecord; resolution: QuarantineResolution }> {
    const waiting = await tx.quarantinedRecord.findUniqueOrThrow({ where: { id } });
    const resolution = new QuarantineResolution(waiting.resolution);
    const refusal = resolution.refusal();
    if (refusal !== null) throw new Refused(refusal);
    return { waiting, resolution };
  }

  private resolved(
    tx: Tx,
    person: string,
    id: string,
    resolution: string,
  ): Promise<QuarantinedRecord> {
    return tx.quarantinedRecord.update({
      where: { id },
      data: { resolvedById: person, resolvedAt: this.clock.now(), resolution },
    });
  }
}
