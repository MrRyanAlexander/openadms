// Voiding a ticket, and unvoiding one (spec/parts/08-review-and-corrections.md step 6;
// spec/acceptance/08-review-and-corrections.md section E; adms-exceptions "Correct, void or
// accept"; spec/DATA-MODEL.md §6 `TicketVoid`, `TicketUnvoid`; ADR-028, 060, 117, 118, 167, 173, 360,
// 365, 366).
//
// A void says the work never happened. It is a mark of its own, keyed as a ticket is (project,
// workflow, bare number), with a reason picked from the ones the firm offers for voiding, the
// reviewer's own note, who and when. It changes no field event: the worker reads it in the run
// this answers, marks the ticket's field events VOID, removes its lines (each copied to the
// audit log first) and clears its flags. From the moment it is made, no other ticket's checks
// read the voided ticket's field events. Nothing here asks whether the choice is right: the
// audit trail is the backstop (ADR-051).
//
// An unvoid is the override, and it always leaves a record of its own (the user, ADR-366): a
// `TicketUnvoid`, with the reviewer's note, who and when, audited under them, whoever voided the
// ticket. A person's void is also marked lifted on its own row, which is kept; a rule's void has
// no row (the worker set the status, naming the rule), so the unvoid's record is all there is.
// The worker reads the unvoid: a void ticket with an unvoid newer than its last decision is
// worked again, and a rule whose Void ticket still passes voids it again: the rule always wins
// (the user, ADR-167).
import type { TicketUnvoid, TicketVoid } from '@open-adms/db';
import { PickedReason, TicketVoiding } from '@open-adms/domain';

import { type Outcome, Refused } from '../setup/setup-service.ts';
import { ReviewService, type Reviewed, type TicketNamed, type Tx } from './review-service.ts';

export class Voids extends ReviewService {
  // Voids the ticket, with a reason from the firm's list and the reviewer's note beside it.
  ticket(
    person: string,
    projectId: string,
    ticket: TicketNamed,
    reasonId: string,
    note?: string,
  ): Promise<Outcome<Reviewed<TicketVoid>>> {
    return this.review(person, 'VOID', note, async (tx) => {
      const reason = await tx.reason.findUniqueOrThrow({ where: { id: reasonId } });
      const notOffered = new PickedReason({
        name: reason.name,
        uses: reason.uses,
        archived: reason.archivedAt !== null,
      }).refusal('VOID');
      if (notOffered !== null) throw new Refused(notOffered);
      const { voiding } = await Voids.standing(tx, projectId, ticket);
      const refusal = voiding.voidRefusal();
      if (refusal !== null) throw new Refused(refusal);
      const record = await tx.ticketVoid.create({
        data: {
          projectId,
          workflow: ticket.workflow,
          ticketNumber: ticket.ticketNumber,
          reasonId,
          note: Voids.noteOf(note),
          voidedById: person,
          voidedAt: this.clock.now(),
        },
      });
      return { record, projectId, tickets: [ticket] };
    });
  }

  // Unvoids the ticket: writes the unvoid's own record, and lifts a person's void in force on
  // its own row; a rule's void has none to lift.
  lift(
    person: string,
    projectId: string,
    ticket: TicketNamed,
    note?: string,
  ): Promise<Outcome<Reviewed<TicketUnvoid>>> {
    return this.review(person, 'VOID', note, async (tx) => {
      const { voiding, inForce } = await Voids.standing(tx, projectId, ticket);
      const refusal = voiding.unvoidRefusal();
      if (refusal !== null) throw new Refused(refusal);
      const now = this.clock.now();
      if (inForce !== null) {
        await tx.ticketVoid.update({
          where: { id: inForce.id },
          data: { liftedById: person, liftedAt: now, liftNote: Voids.noteOf(note) },
          select: { id: true },
        });
      }
      const record = await tx.ticketUnvoid.create({
        data: {
          projectId,
          workflow: ticket.workflow,
          ticketNumber: ticket.ticketNumber,
          note: Voids.noteOf(note),
          unvoidedById: person,
          unvoidedAt: now,
        },
      });
      return { record, projectId, tickets: [ticket] };
    });
  }

  private static noteOf(note: string | undefined): string | null {
    const written = note?.trim() ?? '';
    return written === '' ? null : written;
  }

  // The ticket as it stands: its field events, and a person's void in force on it.
  private static async standing(
    tx: Tx,
    projectId: string,
    ticket: TicketNamed,
  ): Promise<{ voiding: TicketVoiding; inForce: TicketVoid | null }> {
    const events = await tx.fieldEvent.findMany({
      where: { projectId, workflow: ticket.workflow, ticketNumber: ticket.ticketNumber },
      select: { status: true },
    });
    const inForce = await tx.ticketVoid.findFirst({
      where: {
        projectId,
        workflow: ticket.workflow,
        ticketNumber: ticket.ticketNumber,
        liftedAt: null,
      },
    });
    return {
      inForce,
      voiding: new TicketVoiding({
        ticketNumber: ticket.ticketNumber,
        fieldEvents: events.length,
        voidInForce: inForce !== null,
        standsVoid: events.some((event) => event.status === 'VOID'),
      }),
    };
  }
}
