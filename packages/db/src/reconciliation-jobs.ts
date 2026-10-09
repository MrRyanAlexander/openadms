// The job queue's one way in (ARCHITECTURE §13, "Jobs, not requests"; ADR-418; AC-10-50): a
// change that asks for reconciliation adds its job through here, inside its own piece of work, so
// the change and the job commit together or not at all. There is no other way to make one: this
// class is handed the open piece of work and nothing else.
//
// A job names its project and the tickets the change touched, as the worker groups one (its
// project's workflow and bare number), and the worker's run works those and no other (the user,
// ADR-360). It is written as whoever makes the change; the database audits it.
//
// A change that touches many tickets is cut into jobs of a size a run can finish (`inJobsOf`;
// the size is the policy's, handed in: ADR-420). A change that touches no ticket but a record
// the run flags on its own (a certification's views, a site's permit, a survey) asks with a
// job that names none (`forProjectRecords`): every run checks those records.
import type { Prisma, ReconciliationTrigger, Workflow } from './generated/prisma/client.ts';

// A ticket as the worker groups one.
export interface JobTicket {
  readonly workflow: Workflow;
  readonly ticketNumber: string;
}

export interface JobAsked {
  readonly projectId: string;
  readonly trigger: ReconciliationTrigger;
  // The person who asked, where a person did; none on a job a sync queues.
  readonly requestedById?: string;
  readonly tickets: readonly JobTicket[];
}

export class ReconciliationJobs {
  private readonly tx: Prisma.TransactionClient;

  constructor(tx: Prisma.TransactionClient) {
    this.tx = tx;
  }

  // Adds the job and its tickets, each ticket once; answers the job's id.
  async queue(asked: JobAsked): Promise<string> {
    const tickets = [
      ...new Map(
        asked.tickets.map((ticket) => [`${ticket.workflow} ${ticket.ticketNumber}`, ticket]),
      ).values(),
    ];
    if (tickets.length === 0) throw new Error('A job names at least one ticket.');
    const id = await this.job(asked);
    await this.tx.reconciliationJobTicket.createMany({
      data: tickets.map((ticket) => ({
        projectId: asked.projectId,
        reconciliationJobId: id,
        workflow: ticket.workflow,
        ticketNumber: ticket.ticketNumber,
      })),
    });
    return id;
  }

  // The same, cut into jobs that name `ticketsAJob` tickets at the most, in the order given;
  // answers each job's id, none where no ticket was named.
  async inJobsOf(ticketsAJob: number, asked: JobAsked): Promise<string[]> {
    if (!Number.isSafeInteger(ticketsAJob) || ticketsAJob < 1) {
      throw new Error('A job names at least one ticket.');
    }
    const tickets = [
      ...new Map(
        asked.tickets.map((ticket) => [`${ticket.workflow} ${ticket.ticketNumber}`, ticket]),
      ).values(),
    ];
    const ids: string[] = [];
    for (let from = 0; from < tickets.length; from += ticketsAJob) {
      ids.push(await this.queue({ ...asked, tickets: tickets.slice(from, from + ticketsAJob) }));
    }
    return ids;
  }

  // A job that names no ticket: its run checks the records that are no ticket's (a
  // certification's views, a site's permit, a survey), as every run does, and works no ticket.
  forProjectRecords(asked: Omit<JobAsked, 'tickets'>): Promise<string> {
    return this.job(asked);
  }

  private async job(asked: Omit<JobAsked, 'tickets'>): Promise<string> {
    const job = await this.tx.reconciliationJob.create({
      data: {
        projectId: asked.projectId,
        trigger: asked.trigger,
        requestedById: asked.requestedById ?? null,
      },
      select: { id: true },
    });
    return job.id;
  }
}
