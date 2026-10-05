// The worker's run (spec/parts/06-reconciliation.md; spec/acceptance/06-reconciliation.md
// sections A, C, K and N; ARCHITECTURE §13; adms-ticket-workflows §4.7; BACKLOG 1.5.9, C20,
// C70; ADR-086, 273, 276, 339, 352): for one project, every ticket that isn't void is drawn again
// from its current field events and the firm's current setup.
//
// Its guarantees:
// - One run per project at a time, by a database lock held for the length of the run: a second
//   run on the project while one is under way answers that, and works nothing. Another project's
//   run isn't held up.
// - One ticket, one piece of work in the database: its field events' worker columns, its
//   completed record, its flags and the run's decision commit together or not at all (KD-55).
// - A ticket that errors is flagged "could not be processed" and skipped: nothing else about it
//   is written, and the run goes on.
// - Running again over unchanged input changes nothing but the record of the run itself.
// - Each run is recorded, with one decision for each ticket: its status and why.
// - Everything is written as the system actor, and the database audits it (ADR-273, 276). A
//   reprocess a person asked for is still the worker's own writing: who asked is on the run.
//
// Nothing here is a rule: the checks, the quantities, the flags' words and the statuses are
// `packages/domain`'s. Unpriced: the rules and their lines are Milestone 1.6's.
import { systemActor, type Database, type Prisma, type ReconciliationTrigger } from '@open-adms/db';
import {
  CertificationChecks,
  Flags,
  RoeChecks,
  SiteChecks,
  TicketChecks,
  Tickets,
  type FieldEventKindName,
  type Ticket,
  type WorkflowName,
} from '@open-adms/domain';

import { MileageStanding } from './mileage-standing.ts';
import { ProjectRead, type ProjectSnapshot, type WorkerFieldEvent } from './project-read.ts';
import { TicketWork, type MileageStep, type WorkSettings } from './ticket-work.ts';
import { TicketWrite } from './ticket-write.ts';

// The time the worker states on what it writes: the server's, or a story's.
export interface Clock {
  now(): Date;
}

export interface RunSettings extends WorkSettings {
  // The longest a run may hold its project's lock. A run still going then stops before its next
  // ticket, and the tickets it didn't reach are the next run's.
  readonly longestRunMs: number;
}

export interface RunAsked {
  readonly projectId: string;
  readonly trigger: ReconciliationTrigger;
  // The person who asked for a reprocess; none on a run a sync or a setup change started.
  readonly requestedById?: string;
}

// What a run did with one ticket.
export interface TicketOutcome {
  readonly workflow: WorkflowName;
  readonly ticketNumber: string;
  readonly status: WorkerFieldEvent['status'];
  // The kinds of field event it still waits for; none when it is whole.
  readonly waitingFor: readonly FieldEventKindName[];
  // The messages of the flags that stand on it after the run.
  readonly flags: readonly string[];
  // Why it could not be processed; none when it was.
  readonly error: string | null;
}

export type RunOutcome =
  | {
      readonly ran: false;
      readonly reason: 'RUN_UNDER_WAY';
      readonly message: string;
    }
  | {
      readonly ran: true;
      readonly runId: string;
      readonly ticketsDone: number;
      readonly ticketsFailed: number;
      readonly tickets: readonly TicketOutcome[];
      // The tickets still missing a field event: listed, never flagged for waiting (ADR-053).
      readonly pending: readonly TicketOutcome[];
    };

const errorWords = (caught: unknown): string =>
  (caught instanceof Error ? caught.message : String(caught)).replace(
    /postgres(ql)?:\/\/\S+/g,
    '<connection URL>',
  );

export class Reconciliation {
  private readonly db: Database;
  private readonly clock: Clock;
  private readonly settings: RunSettings;
  private readonly mileages: MileageStep;

  constructor(db: Database, clock: Clock, settings: RunSettings, mileages: MileageStep) {
    this.db = db;
    this.clock = clock;
    this.settings = settings;
    this.mileages = mileages;
  }

  async run(asked: RunAsked): Promise<RunOutcome> {
    const outcome = await this.db.$transaction(
      async (lock) => {
        // Held until this piece of work ends, however it ends; it writes nothing itself.
        const [answer] = await lock.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(
            hashtextextended(${`adms.reconciliation ${asked.projectId}`}, 0)
          ) AS locked`;
        if (answer?.locked !== true) return null;
        return this.locked(asked, async () => {
          await lock.$queryRaw`SELECT 1`;
        });
      },
      { timeout: this.settings.longestRunMs, maxWait: this.settings.longestRunMs },
    );
    return (
      outcome ?? {
        ran: false,
        reason: 'RUN_UNDER_WAY',
        message: 'A run on this project is under way.',
      }
    );
  }

  private async locked(asked: RunAsked, stillHeld: () => Promise<void>): Promise<RunOutcome> {
    const { db, clock } = this;
    const { projectId } = asked;
    const run = await db.$write(systemActor, (tx) =>
      tx.reconciliationRun.create({
        data: {
          projectId,
          trigger: asked.trigger,
          requestedById: asked.requestedById ?? null,
          startedAt: clock.now(),
        },
        select: { id: true },
      }),
    );
    const tickets: TicketOutcome[] = [];
    let done = 0;
    let failed = 0;
    try {
      const snapshot = await new ProjectRead(db).of(projectId);
      const flags = new Flags(snapshot.project.timeZone);
      const work = new TicketWork(
        snapshot,
        this.settings,
        flags,
        this.mileages,
        new MileageStanding(db),
      );
      await this.projectRecords(snapshot, run.id);

      const gathered = new Tickets(snapshot.fieldEvents);
      for (const ticket of gathered.tickets) {
        await stillHeld();
        const outcome = await this.ticket(work, ticket, run.id);
        tickets.push(outcome);
        if (outcome.error === null) done += 1;
        else failed += 1;
      }
      // A field event whose number isn't digits is in no ticket (ADR-329 (6), 345).
      for (const group of Reconciliation.byNumber(gathered.notTicketNumbers)) {
        await stillHeld();
        tickets.push(await this.notATicket(snapshot, group, run.id));
        done += 1;
      }
      await stillHeld();
      await this.numbersGone(snapshot, run.id);
    } finally {
      await db.$write(systemActor, (tx) =>
        tx.reconciliationRun.update({
          where: { id: run.id },
          data: { finishedAt: clock.now(), ticketsDone: done, ticketsFailed: failed },
          select: { id: true },
        }),
      );
    }
    return {
      ran: true,
      runId: run.id,
      ticketsDone: done,
      ticketsFailed: failed,
      tickets,
      pending: tickets.filter((ticket) => ticket.waitingFor.length > 0),
    };
  }

  // One ticket: worked, then written in one piece of work. If either fails, nothing of it is
  // written, the ticket is flagged in a piece of work of its own, and the run goes on.
  private async ticket(
    work: TicketWork,
    ticket: Ticket<WorkerFieldEvent>,
    runId: string,
  ): Promise<TicketOutcome> {
    const { db, clock } = this;
    const on = { workflow: ticket.workflow, ticketNumber: ticket.ticketNumber };
    const outcome = (
      status: WorkerFieldEvent['status'],
      error: string | null,
    ): Promise<TicketOutcome> => this.outcome(ticket, status, error);
    try {
      const worked = await work.of(ticket);
      await db.$write(systemActor, async (tx) => {
        const write = new TicketWrite(tx, ticket.projectId, runId, clock.now());
        const flags = await write.conclusions(worked);
        await write.decision(ticket, worked.status, {
          waitingFor: [...ticket.missing],
          why: Reconciliation.why(ticket),
          completed: worked.completed === null ? null : Reconciliation.figures(worked.completed),
          flags: worked.flags.map((flag) => flag.code),
          flagsKept: flags.kept,
          flagsCleared: flags.cleared,
          flagsRaised: flags.raised,
        });
      });
      return await outcome(worked.status, null);
    } catch (caught) {
      const error = errorWords(caught);
      // The status it stood at: nothing but the flag and the decision is written.
      const stoodAt = ticket.events[0]?.status ?? 'PENDING';
      await db.$write(systemActor, async (tx) => {
        const write = new TicketWrite(tx, ticket.projectId, runId, clock.now());
        const standing = await tx.flag.findFirst({
          where: { projectId: ticket.projectId, ...on, clearedAt: null, code: 'NOT_PROCESSED' },
          select: { id: true },
        });
        if (standing === null) {
          const flag = new Flags('UTC').raise(
            'NOT_PROCESSED',
            { ticketNumber: ticket.ticketNumber },
            {},
            {},
          );
          await tx.flag.create({
            data: {
              projectId: ticket.projectId,
              ...on,
              code: flag.code,
              message: flag.message,
              facts: {},
              factsSha256: flag.factsSha256,
              billing: flag.billing,
              raisedAt: clock.now(),
              reconciliationRunId: runId,
            },
            select: { id: true },
          });
        }
        await write.decision(
          ticket,
          stoodAt,
          { waitingFor: [...ticket.missing], why: 'It could not be processed.' },
          error,
        );
      });
      return outcome(stoodAt, error);
    }
  }

  // The field events of one workflow that share a number that isn't one: flagged, in no
  // ticket, paired with nothing until a person renumbers them.
  private async notATicket(
    snapshot: ProjectSnapshot,
    events: readonly WorkerFieldEvent[],
    runId: string,
  ): Promise<TicketOutcome> {
    const { db, clock } = this;
    const [first] = events;
    if (first === undefined) throw new Error('No field event to flag.');
    const ticket = { workflow: first.workflow, ticketNumber: first.ticketNumber, events };
    const checks = new TicketChecks<WorkerFieldEvent>({
      timeZone: snapshot.project.timeZone,
      activeFrom: snapshot.project.activeFrom,
      activeTo: snapshot.project.activeTo,
      certifications: snapshot.certifications,
      deviceClockOffLimitMinutes: null,
      allowSplitLoads: snapshot.project.allowSplitLoads,
      controlRanges: snapshot.controlRanges,
    });
    await db.$write(systemActor, async (tx) => {
      const write = new TicketWrite(tx, snapshot.project.id, runId, clock.now());
      for (const event of events) {
        await write.fieldEvent(event, {
          status: 'PENDING',
          zoneId: event.zoneId,
          mapVersionId: event.mapVersionId,
          workedOutPayItemId: event.workedOutPayItemId,
        });
      }
      await write.flags(
        { workflow: ticket.workflow, ticketNumber: ticket.ticketNumber },
        events.map((event) => checks.notATicketNumber(event)),
      );
      await write.decision(ticket, 'PENDING', {
        why: 'Its number is not a ticket number: it is in no ticket until a person renumbers it.',
      });
    });
    return {
      workflow: ticket.workflow,
      ticketNumber: ticket.ticketNumber,
      status: 'PENDING',
      waitingFor: [],
      flags: await this.standing(snapshot.project.id, ticket.workflow, ticket.ticketNumber),
      error: null,
    };
  }

  // The flags that sit on a record that is no ticket: a certification's missing views, a site's
  // outstanding permit, a survey's ROE and pre-work survey (spec/FLAGS.md §3.7). They touch no
  // ticket's status. Checked in every run, in one piece of work.
  private async projectRecords(snapshot: ProjectSnapshot, runId: string): Promise<void> {
    const { timeZone, id: projectId, requiresRoe } = snapshot.project;
    const certifications = new CertificationChecks(timeZone);
    const sites = new SiteChecks(timeZone);
    const roes = new RoeChecks({ timeZone, requiresRoe });
    await this.db.$write(systemActor, async (tx) => {
      const write = new TicketWrite(tx, projectId, runId, this.clock.now());
      for (const certification of snapshot.certifications) {
        await write.flags(
          { certificationId: certification.id },
          certifications.views(certification.certNumber, certification.photographs),
        );
      }
      for (const site of snapshot.sites) {
        await write.flags({ disposalSiteId: site.id }, sites.permit(site));
      }
      for (const survey of snapshot.surveys) {
        await write.flags({ surveyId: survey.id }, roes.survey(survey, snapshot.surveys));
      }
    });
  }

  // A flag that stands on a number no field event of the project is under any longer (its
  // field events were renumbered): nothing raises it now, so it is cleared, never deleted.
  private async numbersGone(snapshot: ProjectSnapshot, runId: string): Promise<void> {
    const projectId = snapshot.project.id;
    const key = (workflow: WorkflowName, ticketNumber: string): string =>
      JSON.stringify([workflow, ticketNumber]);
    const held = new Set(
      (
        await this.db.fieldEvent.findMany({
          where: { projectId },
          select: { workflow: true, ticketNumber: true },
          distinct: ['workflow', 'ticketNumber'],
        })
      ).map((event) => key(event.workflow, event.ticketNumber)),
    );
    const gone = new Map<string, { workflow: WorkflowName; ticketNumber: string }>();
    for (const flag of snapshot.standingFlags) {
      if (flag.workflow === null || flag.ticketNumber === null) continue;
      const at = key(flag.workflow, flag.ticketNumber);
      if (!held.has(at)) gone.set(at, { workflow: flag.workflow, ticketNumber: flag.ticketNumber });
    }
    if (gone.size === 0) return;
    await this.db.$write(systemActor, async (tx) => {
      const write = new TicketWrite(tx, projectId, runId, this.clock.now());
      for (const on of gone.values()) await write.flags(on, []);
    });
  }

  private async outcome(
    ticket: Ticket<WorkerFieldEvent>,
    status: WorkerFieldEvent['status'],
    error: string | null,
  ): Promise<TicketOutcome> {
    return {
      workflow: ticket.workflow,
      ticketNumber: ticket.ticketNumber,
      status,
      waitingFor: ticket.missing,
      flags: await this.standing(ticket.projectId, ticket.workflow, ticket.ticketNumber),
      error,
    };
  }

  private async standing(
    projectId: string,
    workflow: WorkflowName,
    ticketNumber: string,
  ): Promise<string[]> {
    const flags = await this.db.flag.findMany({
      where: { projectId, workflow, ticketNumber, clearedAt: null },
      select: { message: true },
      orderBy: { id: 'asc' },
    });
    return flags.map((flag) => flag.message);
  }

  private static byNumber(events: readonly WorkerFieldEvent[]): WorkerFieldEvent[][] {
    const groups = new Map<string, WorkerFieldEvent[]>();
    for (const event of events) {
      const key = JSON.stringify([event.workflow, event.ticketNumber]);
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [event]);
      else group.push(event);
    }
    return [...groups.values()];
  }

  // Why the field events are one ticket and what it waits for, in plain words.
  private static why(ticket: Ticket<WorkerFieldEvent>): string {
    const grouped = `Grouped on its project, its workflow and the number ${ticket.ticketNumber}`;
    if (!ticket.isWhole) return `${grouped}. A field event is still to arrive.`;
    if (ticket.workflow === 'UNIT_RATE') return `${grouped}: one unit rate event, whole by itself.`;
    const collections = ticket.collections.length;
    return collections === 1
      ? `${grouped}: one collection and its disposal.`
      : `${grouped}: ${String(collections)} collections and one disposal.`;
  }

  private static figures(completed: {
    readonly quantitySource: string;
    readonly capacityCy: number | null;
    readonly loadCall: number | null;
    readonly volumeCy: string | null;
    readonly weightTons: string | null;
    readonly weightIsShare: boolean;
    readonly carriedCount: number | null;
  }): Prisma.InputJsonObject {
    return {
      quantitySource: completed.quantitySource,
      capacityCy: completed.capacityCy,
      loadCall: completed.loadCall,
      volumeCy: completed.volumeCy,
      weightTons: completed.weightTons,
      weightIsShare: completed.weightIsShare,
      carriedCount: completed.carriedCount,
    };
  }
}
