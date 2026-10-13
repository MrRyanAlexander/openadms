// A reprocess a person asks for with nothing changed (spec/parts/08-review-and-corrections.md
// step 4; ADR-418, 420, 498).
//
// Every change a reviewer makes queues its own job, so this is for what no change will reach: a
// ticket the worker couldn't process (`NOT_PROCESSED`: a map server down, a line the database
// refused), which is never tried again by itself, and a job the worker set aside after too many
// tries that failed whole, which left its tickets as they last stood. A person names the tickets,
// or the set-aside job by its id as the worker's log names it, and they are worked again as their
// records and the setup stand now.
//
// It is part of correcting, so it takes the grant to correct (an admin, or a manager/analyst
// holding it). It changes no record: the only row written is its job (`REPROCESS`, naming the
// person, the note in the audit record beside it), in the person's own piece of work. The job
// names the tickets alone, since nothing changed that another ticket reads. A ticket locked as
// invoiced is left off it, exactly as it is, and the answer counts it (ADR-090). A job set aside
// is never changed: it stays the record of what failed, and the new job is the one worked.
import { ReprocessAsking } from '@open-adms/domain';

import { type Outcome, Refused } from '../setup/setup-service.ts';
import { ReviewService, type Reviewed, type TicketNamed, type Tx } from './review-service.ts';

// What was asked: the job set aside whose tickets were put back, where one was.
export interface ReprocessAsked {
  readonly setAsideJobId: string | null;
}

export class Reprocesses extends ReviewService {
  // The tickets a person names, of the project: each once.
  tickets(
    person: string,
    projectId: string,
    named: readonly TicketNamed[],
    note?: string,
  ): Promise<Outcome<Reviewed<ReprocessAsked>>> {
    return this.mark(person, 'CORRECT', note, async (tx) => {
      const tickets = [
        ...new Map(
          named.map(({ workflow, ticketNumber }) => [
            JSON.stringify([workflow, ticketNumber]),
            { workflow, ticketNumber },
          ]),
        ).values(),
      ];
      const asking = new ReprocessAsking(this.policy.jobTicketsAtMost);
      const tooMany = asking.countRefusal(tickets.length);
      if (tooMany !== null) throw new Refused(tooMany);
      const found = await ReviewService.ticketsOf(tx, {
        projectId,
        ticketNumber: { in: tickets.map((ticket) => ticket.ticketNumber) },
      });
      const isFound = new Set(found.map((ticket) => JSON.stringify(ticket)));
      const refusal = asking.ticketsRefusal(
        tickets.map((ticket) => ({
          ticketNumber: ticket.ticketNumber,
          fieldEvents: isFound.has(JSON.stringify(ticket)) ? 1 : 0,
        })),
      );
      if (refusal !== null) throw new Refused(refusal);
      return this.reprocessed(tx, person, projectId, tickets, null);
    });
  }

  // The tickets of a job of the project the worker set aside, put back as they were named. A job
  // that named no ticket (one for the records that are no ticket's) is put back as one too.
  setAside(
    person: string,
    projectId: string,
    jobId: string,
    note?: string,
  ): Promise<Outcome<Reviewed<ReprocessAsked>>> {
    return this.mark(person, 'CORRECT', note, async (tx) => {
      const job = await tx.reconciliationJob.findUniqueOrThrow({
        where: { id: jobId },
        select: {
          projectId: true,
          setAsideAt: true,
          tickets: { select: { workflow: true, ticketNumber: true }, orderBy: { id: 'asc' } },
        },
      });
      const refusal = ReprocessAsking.jobRefusal({
        onThisProject: job.projectId === projectId,
        setAside: job.setAsideAt !== null,
      });
      if (refusal !== null) throw new Refused(refusal);
      return this.reprocessed(tx, person, projectId, job.tickets, jobId);
    });
  }

  // Queues the job, in the open piece of work; a ticket locked as invoiced is left off it.
  private async reprocessed(
    tx: Tx,
    person: string,
    projectId: string,
    tickets: readonly TicketNamed[],
    setAsideJobId: string | null,
  ): Promise<Reviewed<ReprocessAsked>> {
    const asked = await ReviewService.asked(tx, person, projectId, tickets);
    return {
      record: { setAsideJobId },
      reprocess: await this.queued(
        tx,
        { ...asked, trigger: 'REPROCESS' },
        { projectRecords: tickets.length === 0 },
      ),
    };
  }
}
