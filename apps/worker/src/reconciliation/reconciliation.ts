// The worker's run (spec/parts/06-reconciliation.md; spec/acceptance/06-reconciliation.md
// sections A, C, K and N; spec/parts/07-pricing-ledger-audit.md; ARCHITECTURE §13;
// adms-ticket-workflows §4.7; BACKLOG 1.5.9, 1.7.2, C20, C70; ADR-086, 273, 276, 339, 352, 359):
// for one project, every ticket that isn't void is drawn again from its current field events and
// the firm's current setup, and priced by the firm's rules.
//
// Its guarantees:
// - One run per project at a time, by a database lock held for the length of the run: a second
//   run on the project while one is under way answers that, and works nothing. Another project's
//   run isn't held up.
// - One ticket, one piece of work in the database: its field events' worker columns, its
//   completed record, its lines, its flags and the run's decision commit together or not at all
//   (KD-01, 55): a reconciled ticket that bills is never left without its lines.
// - A ticket that errors is flagged "could not be processed" and skipped: nothing else about it
//   is written, the lines it had are still there (and the flag says so), and the run goes on.
// - A ticket a rule's Void ticket voids is VOID from then on and out of every later run, like a
//   person's void, until a person unvoids it (the user, ADR-360).
// - A ticket a person voided is marked VOID, its lines removed and its flags cleared, and no
//   other ticket's checks read its field events. A void ticket a person has unvoided since its
//   last decision is read back in and worked; a rule that still passes voids it again (ADR-167,
//   365, 366).
// - A ticket locked as invoiced is left exactly as it is, whatever changed (ADR-090): the run
//   records that it left it.
// - A run the queue starts works the tickets its project's waiting jobs name, each once, and no
//   other (the user, ADR-360; ADR-418, 419): a settled ticket is on no waiting job. It still
//   reads the whole project, since a ticket's checks read its neighbours. Each job is finished
//   under the run that worked it, in the run's own closing piece of work; a try that fails whole
//   is counted, its reason kept, and the job set aside after the policy's number of tries.
// - A change to one ticket can change what stands on another (an overlap on one truck, a weight
//   two containers share): the change's own job names those neighbours (the API's `WorkQueue`,
//   the domain's `TicketNeighbours`; ADR-420), so the run needn't look for them.
// - A run takes up waiting jobs, the oldest first, until their tickets come to the policy's
//   number; the rest wait for the next run, so a run has a size it can finish (ADR-420).
// - A run asked for directly (`run`: a story's, until the stories move onto the queue, 2.7.1)
//   works every ticket of the project and writes only what differs.
// - Running again over unchanged input changes nothing but the record of the run itself.
// - Each run is recorded, with one decision for each ticket: its status and why.
// - Everything is written as the system actor, and the database audits it (ADR-273, 276). A
//   reprocess a person asked for is still the worker's own writing: who asked is on the run.
//
// Nothing here is a rule: the checks, the quantities, the rules' running, the flags' words and
// the statuses are `packages/domain`'s.
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
import {
  ProjectRead,
  type PersonsVoid,
  type ProjectSnapshot,
  type TicketNamed,
  type WorkerFieldEvent,
} from './project-read.ts';
import { TicketWork, type MileageStep, type WorkSettings } from './ticket-work.ts';
import { TicketWrite } from './ticket-write.ts';
import { WaitingJobs } from './waiting-jobs.ts';

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

// What became of a project's waiting jobs when the worker went to take them up.
export type JobsOutcome =
  | {
      readonly worked: false;
      readonly reason: 'RUN_UNDER_WAY' | 'NOTHING_WAITING';
      // The jobs found spent (taken up as often as the policy lets, with no word since) and
      // set aside.
      readonly setAside: readonly string[];
    }
  | {
      readonly worked: false;
      // The try failed whole: every job it took up is still waiting, or set aside.
      readonly reason: 'FAILED';
      readonly error: string;
      readonly jobs: readonly string[];
      readonly setAside: readonly string[];
    }
  | {
      readonly worked: true;
      readonly run: Extract<RunOutcome, { ran: true }>;
      // The jobs the run finished.
      readonly jobs: readonly string[];
      readonly setAside: readonly string[];
    };

const ticketKey = (ticket: TicketNamed): string =>
  JSON.stringify([ticket.workflow, ticket.ticketNumber]);

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
    const outcome = await this.underLock(asked.projectId, (stillHeld) =>
      this.locked(asked, stillHeld),
    );
    return (
      outcome ?? {
        ran: false,
        reason: 'RUN_UNDER_WAY',
        message: 'A run on this project is under way.',
      }
    );
  }

  // The project's waiting jobs, taken up under its lock, which is the claim (ADR-418): one run
  // works the tickets they name, each once, and finishes them. Both numbers are the policy's:
  // the tries before a job is set aside, and the most tickets a run takes up (jobs past that
  // wait for the project's next run).
  async waitingJobs(
    projectId: string,
    triesBeforeSetAside: number,
    ticketsARun: number,
  ): Promise<JobsOutcome> {
    const jobs = new WaitingJobs(this.db, this.clock, triesBeforeSetAside, ticketsARun);
    const outcome = await this.underLock<JobsOutcome>(projectId, async (stillHeld) => {
      const taken = await jobs.takeUp(projectId);
      const [first] = taken.jobs;
      if (first === undefined) {
        return { worked: false, reason: 'NOTHING_WAITING', setAside: taken.setAside };
      }
      const ids = taken.jobs.map((job) => job.id);
      // The run is the oldest job's; a person is named on it only where every job names the
      // same one. Each job keeps who asked for it, and names its run.
      const sameAsker = taken.jobs.every((job) => job.requestedById === first.requestedById);
      try {
        const run = await this.locked(
          {
            projectId,
            trigger: first.trigger,
            ...(sameAsker && first.requestedById !== null
              ? { requestedById: first.requestedById }
              : {}),
          },
          stillHeld,
          { tickets: taken.tickets, closing: (tx, runId) => jobs.finish(tx, ids, runId) },
        );
        return { worked: true, run, jobs: ids, setAside: taken.setAside };
      } catch (caught) {
        const error = errorWords(caught);
        const spent = await jobs.failed(taken.jobs, error);
        return {
          worked: false,
          reason: 'FAILED',
          error,
          jobs: ids,
          setAside: [...taken.setAside, ...spent],
        };
      }
    });
    return outcome ?? { worked: false, reason: 'RUN_UNDER_WAY', setAside: [] };
  }

  // Runs the work while holding the project's lock; answers nothing where another run holds it.
  // The lock is a piece of work held open for the length of the run, so it is let go however
  // the run ends. What the work answered stands even where its time ran out just before.
  private async underLock<T>(
    projectId: string,
    work: (stillHeld: () => Promise<void>) => Promise<T>,
  ): Promise<T | null> {
    let answered: { readonly outcome: T | null } | undefined;
    try {
      await this.db.$transaction(
        async (lock) => {
          // Held until this piece of work ends, however it ends; it writes nothing itself.
          const [answer] = await lock.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(
              hashtextextended(${`adms.reconciliation ${projectId}`}, 0)
            ) AS locked`;
          if (answer?.locked !== true) {
            answered = { outcome: null };
            return;
          }
          const outcome = await work(async () => {
            await lock.$queryRaw`SELECT 1`;
          });
          answered = { outcome };
        },
        { timeout: this.settings.longestRunMs, maxWait: this.settings.longestRunMs },
      );
    } catch (caught) {
      if (answered === undefined) throw caught;
    }
    if (answered === undefined) throw new Error('The run ended without an answer.');
    return answered.outcome;
  }

  private async locked(
    asked: RunAsked,
    stillHeld: () => Promise<void>,
    // A run the queue starts: the tickets to work, and no other; and what is written with the
    // run's own closing, where the run went through whole.
    queued?: {
      readonly tickets: readonly TicketNamed[];
      readonly closing: (tx: Prisma.TransactionClient, runId: string) => Promise<void>;
    },
  ): Promise<Extract<RunOutcome, { ran: true }>> {
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
    let whole = false;
    const named =
      queued === undefined ? null : new Set(queued.tickets.map((each) => ticketKey(each)));
    const isAsked = (ticket: TicketNamed): boolean =>
      named === null || named.has(ticketKey(ticket));
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

      for (const voided of snapshot.voided) {
        if (!isAsked(voided)) continue;
        await stillHeld();
        const outcome = await this.voided(projectId, voided, run.id);
        tickets.push(outcome);
        if (outcome.error === null) done += 1;
        else failed += 1;
      }
      const gathered = new Tickets(snapshot.fieldEvents);
      for (const ticket of gathered.tickets) {
        if (!isAsked(ticket)) continue;
        await stillHeld();
        const outcome = await this.ticket(work, ticket, run.id);
        tickets.push(outcome);
        if (outcome.error === null) done += 1;
        else failed += 1;
      }
      // A field event whose number isn't digits is in no ticket (ADR-329 (6), 345).
      for (const group of Reconciliation.byNumber(gathered.notTicketNumbers)) {
        const [first] = group;
        if (first === undefined || !isAsked(first)) continue;
        await stillHeld();
        tickets.push(await this.notATicket(snapshot, group, run.id));
        done += 1;
      }
      await stillHeld();
      await this.numbersGone(snapshot, run.id);
      whole = true;
    } finally {
      await db.$write(systemActor, async (tx) => {
        await tx.reconciliationRun.update({
          where: { id: run.id },
          data: { finishedAt: clock.now(), ticketsDone: done, ticketsFailed: failed },
          select: { id: true },
        });
        if (whole) await queued?.closing(tx, run.id);
      });
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
    const outcome = (
      status: WorkerFieldEvent['status'],
      error: string | null,
    ): Promise<TicketOutcome> => this.outcome(ticket, status, error);
    try {
      if (await this.lockedAsInvoiced(ticket)) {
        const stoodAt = ticket.events[0]?.status ?? 'PENDING';
        await db.$write(systemActor, (tx) =>
          new TicketWrite(tx, ticket.projectId, runId, clock.now()).decision(ticket, stoodAt, {
            why: 'Locked as invoiced: left as it is.',
          }),
        );
        return await outcome(stoodAt, null);
      }
      const worked = await work.of(ticket);
      // Read back in after a person's unvoid: its field events stood at VOID.
      const unvoided = ticket.events.some((event) => event.status === 'VOID');
      await db.$write(systemActor, async (tx) => {
        const write = new TicketWrite(tx, ticket.projectId, runId, clock.now());
        const { flags, lines } = await write.conclusions(worked);
        await write.decision(ticket, worked.status, {
          waitingFor: [...ticket.missing],
          why: `${unvoided ? 'Unvoided: worked again. ' : ''}${Reconciliation.why(ticket)}${
            worked.voidedBy.length === 0
              ? ''
              : ` Voided by ${worked.voidedBy.map((rule) => `the rule "${rule.name}"`).join(' and ')}.`
          }`,
          // A rule's void has no record of its own: its reason is the rule, here (ADR-118).
          voidedBy: worked.voidedBy.map((rule) => ({ id: rule.id, name: rule.name })),
          unvoided,
          completed: worked.completed === null ? null : Reconciliation.figures(worked.completed),
          lines: worked.lines.map((line) => ({ ...line })),
          linesKept: lines.kept,
          linesRemoved: lines.removed,
          linesWritten: lines.written,
          flags: worked.flags.map((flag) => flag.code),
          flagsKept: flags.kept,
          flagsCleared: flags.cleared,
          flagsRaised: flags.raised,
        });
      });
      return await outcome(worked.status, null);
    } catch (caught) {
      return this.notProcessed(ticket, runId, caught);
    }
  }

  // A ticket a person voided, written as void: one piece of work, like any ticket's.
  private async voided(
    projectId: string,
    voided: PersonsVoid,
    runId: string,
  ): Promise<TicketOutcome> {
    const { db, clock } = this;
    const ticket = { ...voided, projectId, missing: [] };
    try {
      if (await this.lockedAsInvoiced(ticket)) {
        const stoodAt = ticket.events[0]?.status ?? 'PENDING';
        await db.$write(systemActor, (tx) =>
          new TicketWrite(tx, projectId, runId, clock.now()).decision(ticket, stoodAt, {
            why: 'Locked as invoiced: left as it is.',
          }),
        );
        return await this.outcome(ticket, stoodAt, null);
      }
      await db.$write(systemActor, async (tx) => {
        const write = new TicketWrite(tx, projectId, runId, clock.now());
        const { linesRemoved, flagsCleared } = await write.voided(ticket);
        await write.decision(ticket, 'VOID', {
          why: `Voided by ${voided.voidedBy} (${voided.reason}).`,
          voidedByPerson: { name: voided.voidedBy, reason: voided.reason },
          linesRemoved,
          flagsCleared,
        });
      });
      return await this.outcome(ticket, 'VOID', null);
    } catch (caught) {
      return this.notProcessed(ticket, runId, caught);
    }
  }

  // A ticket that could not be processed: nothing of the failed work is kept; the ticket is
  // flagged in a piece of work of its own, and the run goes on.
  private async notProcessed(
    ticket: TicketNamed & {
      readonly projectId: string;
      readonly events: readonly WorkerFieldEvent[];
      readonly missing: readonly FieldEventKindName[];
    },
    runId: string,
    caught: unknown,
  ): Promise<TicketOutcome> {
    const { db, clock } = this;
    const on = { workflow: ticket.workflow, ticketNumber: ticket.ticketNumber };
    const error = errorWords(caught);
    // The status it stood at: nothing but the flag and the decision is written.
    const stoodAt = ticket.events[0]?.status ?? 'PENDING';
    await db.$write(systemActor, async (tx) => {
      const write = new TicketWrite(tx, ticket.projectId, runId, clock.now());
      const standing = await tx.flag.findFirst({
        where: {
          projectId: ticket.projectId,
          ...on,
          clearedAt: null,
          code: { in: ['NOT_PROCESSED', 'NOT_PROCESSED_LINES_STAND'] },
        },
        select: { id: true },
      });
      if (standing === null) {
        // Nothing of the failed work is kept, so a ticket priced before still has its lines:
        // the flag says which (the user, ADR-360).
        const lines = await tx.transaction.count({
          where: {
            projectId: ticket.projectId,
            ...(ticket.workflow === 'UNIT_RATE'
              ? { fieldEventId: { in: ticket.events.map((event) => event.id) } }
              : ticket.workflow === 'LOAD'
                ? { completedLoad: { ticketNumber: ticket.ticketNumber } }
                : { completedHaulOut: { ticketNumber: ticket.ticketNumber } }),
          },
        });
        const flag = new Flags('UTC').raise(
          lines > 0 ? 'NOT_PROCESSED_LINES_STAND' : 'NOT_PROCESSED',
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
    return this.outcome(ticket, stoodAt, error);
  }

  // Whether the ticket is locked as invoiced: its completed load or haul-out, found by any of
  // its field events, or its unit rate field event (ADR-057, 090). Only a lock in force counts:
  // one a person unlocked is history, and the ticket is worked again (ADR-363). Asked as the
  // ticket's turn comes, never from what the run read at its start.
  private async lockedAsInvoiced(ticket: {
    readonly workflow: WorkflowName;
    readonly events: readonly WorkerFieldEvent[];
  }): Promise<boolean> {
    const ids = ticket.events.map((event) => event.id);
    const ofIts = {
      OR: [
        { disposalEventId: { in: ids } },
        { collections: { some: { collectionEventId: { in: ids }, dissolvedAt: null } } },
      ],
    };
    const locks = await this.db.invoiceLock.count({
      where: {
        unlockedAt: null,
        ...(ticket.workflow === 'UNIT_RATE'
          ? { fieldEventId: { in: ids } }
          : ticket.workflow === 'LOAD'
            ? { completedLoad: ofIts }
            : { completedHaulOut: ofIts }),
      },
    });
    return locks > 0;
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
      deviceClockOffLimitMinutes: this.settings.deviceClockOffLimitMinutes,
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
    ticket: TicketNamed & {
      readonly projectId: string;
      readonly missing: readonly FieldEventKindName[];
    },
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
