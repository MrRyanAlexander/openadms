// Which tickets wait on a job set aside (ARCHITECTURE §13; spec/parts/08-review-and-corrections.md
// "One review queue"; ADR-418, 498, 545; the Phase 2 audit's F6). A job that failed whole too often
// is set aside: kept, taken up no more, and put back only by a person (`Reprocesses`, by its id).
// Its tickets keep their last lines and status meanwhile, with nothing on them to say so; so the
// back office is told here. A ticket waits on a job set aside until a job finished after it was set
// aside has worked it (a reprocess of it, the job put back, or any later change's); the job itself
// stays set aside as the record.
import type { Prisma, Workflow } from '@open-adms/db';

type Tx = Prisma.TransactionClient;

export interface SetAsideJob {
  readonly id: string;
  readonly trigger: 'SYNC' | 'CORRECTION' | 'SETUP_CHANGE' | 'REPROCESS';
  readonly requestedById: string | null;
  readonly queuedAt: Date;
  readonly setAsideAt: Date;
  readonly attempts: number;
  readonly tickets: readonly { readonly workflow: Workflow; readonly ticketNumber: string }[];
}

const key = (workflow: string, ticketNumber: string): string => `${workflow} ${ticketNumber}`;

export class SetAside {
  readonly jobs: readonly SetAsideJob[];
  // When each of their tickets was last worked by a job finished since the earliest of them was
  // set aside.
  private readonly lastWorked: ReadonlyMap<string, Date>;

  private constructor(jobs: readonly SetAsideJob[], lastWorked: ReadonlyMap<string, Date>) {
    this.jobs = jobs;
    this.lastWorked = lastWorked;
  }

  // A project's jobs set aside, newest first; `ids` narrows to some of them.
  static async of(tx: Tx, projectId: string, ids?: readonly string[]): Promise<SetAside> {
    const rows = await tx.reconciliationJob.findMany({
      where: {
        projectId,
        setAsideAt: { not: null },
        ...(ids === undefined ? {} : { id: { in: [...ids] } }),
      },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        trigger: true,
        requestedById: true,
        queuedAt: true,
        setAsideAt: true,
        attempts: true,
        tickets: { select: { workflow: true, ticketNumber: true }, orderBy: { id: 'asc' } },
      },
    });
    const jobs = rows.flatMap((row) =>
      row.setAsideAt === null ? [] : [{ ...row, setAsideAt: row.setAsideAt }],
    );
    if (jobs.length === 0) return new SetAside([], new Map());
    const earliest = new Date(Math.min(...jobs.map((job) => job.setAsideAt.getTime())));
    const numbers = [...new Set(jobs.flatMap((job) => job.tickets.map((t) => t.ticketNumber)))];
    const worked = await tx.reconciliationJobTicket.findMany({
      where: {
        projectId,
        ticketNumber: { in: numbers },
        reconciliationJob: { finishedAt: { gt: earliest } },
      },
      select: {
        workflow: true,
        ticketNumber: true,
        reconciliationJob: { select: { finishedAt: true } },
      },
    });
    const lastWorked = new Map<string, Date>();
    for (const row of worked) {
      const at = row.reconciliationJob.finishedAt;
      if (at === null) continue;
      const known = lastWorked.get(key(row.workflow, row.ticketNumber));
      if (known === undefined || at > known)
        lastWorked.set(key(row.workflow, row.ticketNumber), at);
    }
    return new SetAside(jobs, lastWorked);
  }

  // Whether a ticket of that job still waits on it: no job finished since it was set aside has
  // worked the ticket.
  waitsOn(job: SetAsideJob, workflow: string, ticketNumber: string): boolean {
    const at = this.lastWorked.get(key(workflow, ticketNumber));
    return at === undefined || at.getTime() <= job.setAsideAt.getTime();
  }

  // The tickets of one workflow that wait on any job set aside.
  waiting(workflow: string): ReadonlySet<string> {
    const numbers = new Set<string>();
    for (const job of this.jobs) {
      for (const ticket of job.tickets) {
        if (
          ticket.workflow === workflow &&
          this.waitsOn(job, ticket.workflow, ticket.ticketNumber)
        ) {
          numbers.add(ticket.ticketNumber);
        }
      }
    }
    return numbers;
  }
}
