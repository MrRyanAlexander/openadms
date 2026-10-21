// The time clock's hours, at the back office (REQ-310; spec/acceptance/02-people-and-devices.md
// AC-02-50, 53…55; BACKLOG 3.7.1; ADR-063, 100, 241, 598). The entries and lines themselves are
// a phone's, taken at sync (`Intake`); here a manager approves a worker's day and unlocks it, and
// the export of hours reads them.
//
// - **A day is approved** by an admin, or a manager/analyst who holds "approve hours" and "view
//   dispatch" now (the domain's `HoursRights`), asked inside the piece of work: never their own
//   day, and once while an approval is in force (`DayApprovals`). An approved day is locked: the
//   database refuses any change to its entries and lines until it is unlocked. A phone's entry
//   that arrives after is still taken (offline is normal), and the read says so.
// - **It is unlocked** with a note, kept on the approval with who and when, and in the audit
//   record's reason; approving it again is a new approval.
// - **The read** is a project's assignments with an entry, from one day to another, by day and
//   then by assignment, a page at a time: each with its entries and lines as sent, what its hours
//   come to by the domain's one rule (`ClockDay`: the day ends before midnight in the project's
//   time zone; no cap on hours), and the approval in force. It takes "view dispatch".
//
// Nothing here is a rate or a pay, nothing reads crew time and nothing is queued: no ticket reads
// a worker's hours (ADR-241 (5), (7)). No read-only viewer reads any of it.
import type { Prisma } from '@open-adms/db';
import { ClockDay, DayApprovals, HoursRights } from '@open-adms/domain';

import { backOfficeSees } from '../review/review-reads.ts';
import { Refused, SetupService, day, type Outcome } from '../setup/setup-service.ts';

type Tx = Prisma.TransactionClient;

interface Named {
  readonly id: string;
  readonly name: string;
}

// An approval of a day, as an answer says it.
export interface DayApprovalRead {
  readonly id: string;
  readonly assignmentId: string;
  readonly approvedBy: Named;
  readonly approvedAt: string;
  readonly unlockedBy: Named | null;
  readonly unlockedAt: string | null;
  readonly unlockNote: string | null;
}

// A worker's day on the time clock, as the read says it (the contracts' `dayHoursSchema`).
export interface DayHoursRead {
  readonly assignmentId: string;
  readonly person: Named & { readonly monitorId: string | null };
  readonly workDate: string;
  readonly withdrawn: boolean;
  readonly entries: readonly {
    readonly id: string;
    readonly kind: 'IN' | 'BREAK_START' | 'BREAK_END' | 'OUT';
    readonly at: string;
    readonly deviceUtcOffsetMinutes: number;
    readonly receivedAt: string;
    readonly phone: Named;
  }[];
  readonly activityLines: readonly {
    readonly id: string;
    readonly clockEntryId: string;
    readonly position: number;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly activity: Named | null;
    readonly fieldEventId: string | null;
    readonly fieldEvent: {
      readonly kind:
        'COLLECTION' | 'DISPOSAL' | 'HAUL_OUT_COLLECTION' | 'HAUL_OUT_DISPOSAL' | 'UNIT_RATE';
      readonly ticketNumber: string;
      readonly splitSuffix: string;
    } | null;
    readonly note: string | null;
  }[];
  readonly hours: {
    readonly workedMinutes: number;
    readonly breakMinutes: number;
    readonly outsideTheDayMinutes: number;
    readonly stillClockedIn: boolean;
    readonly unmatchedEntries: number;
  };
  readonly approval: DayApprovalRead | null;
  readonly receivedAfterApproval: boolean;
}

// Which days a page holds: one project's, from one day to another, after the last assignment of
// the page before, `limit` at most.
export interface HoursAsked {
  readonly from: string;
  readonly to: string;
  readonly after?: string | undefined;
  readonly limit: number;
}

export type HoursPage =
  | { readonly done: true; readonly days: readonly DayHoursRead[]; readonly next: string | null }
  | { readonly done: false; readonly code: 'NOT_ALLOWED' | 'NOT_FOUND' };

const named = { select: { id: true, name: true } } as const;

const approvalRead = {
  id: true,
  assignmentId: true,
  approvedAt: true,
  unlockedAt: true,
  unlockNote: true,
  approvedBy: named,
  unlockedBy: named,
} as const;

type ApprovalRow = Prisma.DayApprovalGetPayload<{ select: typeof approvalRead }>;

const approvalShown = (row: ApprovalRow): DayApprovalRead => ({
  id: row.id,
  assignmentId: row.assignmentId,
  approvedBy: row.approvedBy,
  approvedAt: row.approvedAt.toISOString(),
  unlockedBy: row.unlockedBy,
  unlockedAt: row.unlockedAt?.toISOString() ?? null,
  unlockNote: row.unlockNote,
});

const calendar = (date: Date): string => date.toISOString().slice(0, 10);

export class Hours extends SetupService {
  private readonly approvals = new DayApprovals();

  // The worker's day approved by this person, and so locked.
  approve(person: string, assignmentId: string): Promise<Outcome<DayApprovalRead>> {
    return this.writeAs({ actorId: person, source: 'BACK_OFFICE' }, async (tx) => {
      await Hours.mayApprove(tx, person);
      const { assignment, inForce } = await Hours.dayOf(tx, assignmentId);
      const refusal = this.approvals.approveRefusal(person, Hours.asked(assignment, inForce));
      if (refusal !== null) throw new Refused(refusal);
      const made = await tx.dayApproval.create({
        data: {
          projectId: assignment.projectId,
          assignmentId,
          approvedById: person,
          approvedAt: this.clock.now(),
        },
        select: approvalRead,
      });
      return approvalShown(made);
    });
  }

  // The worker's approved day unlocked, with the note saying why: kept on the approval and as
  // the audit record's reason.
  unlock(person: string, assignmentId: string, note: string): Promise<Outcome<DayApprovalRead>> {
    return this.writeAs({ actorId: person, source: 'BACK_OFFICE', reason: note }, async (tx) => {
      await Hours.mayApprove(tx, person);
      const { assignment, inForce } = await Hours.dayOf(tx, assignmentId);
      const refusal = this.approvals.unlockRefusal(Hours.asked(assignment, inForce));
      if (refusal !== null || inForce === null) {
        throw new Refused(refusal ?? { code: 'NOT_APPROVED', message: 'Not approved.' });
      }
      const unlocked = await tx.dayApproval.update({
        where: { id: inForce.id },
        data: { unlockedById: person, unlockedAt: this.clock.now(), unlockNote: note },
        select: approvalRead,
      });
      return approvalShown(unlocked);
    });
  }

  // A page of a project's workers' days with an entry, by day and then by assignment.
  list(readerId: string, projectId: string, asked: HoursAsked): Promise<HoursPage> {
    return this.db.$read(async (tx): Promise<HoursPage> => {
      if (!(await backOfficeSees(tx, readerId, 'VIEW_DISPATCH'))) {
        return { done: false, code: 'NOT_ALLOWED' };
      }
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { timeZone: true },
      });
      if (project === null) return { done: false, code: 'NOT_FOUND' };
      const rows = await tx.assignment.findMany({
        where: {
          projectId,
          workDate: { gte: day(asked.from), lte: day(asked.to) },
          clockEntries: { some: {} },
        },
        orderBy: [{ workDate: 'asc' }, { id: 'asc' }],
        take: asked.limit + 1,
        ...(asked.after === undefined ? {} : { cursor: { id: asked.after }, skip: 1 }),
        select: {
          id: true,
          workDate: true,
          archivedAt: true,
          person: { select: { id: true, name: true, monitorNumber: true } },
          clockEntries: {
            orderBy: [{ at: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              kind: true,
              at: true,
              deviceUtcOffsetMinutes: true,
              receivedAt: true,
              device: named,
              activityLines: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  clockEntryId: true,
                  position: true,
                  startedAt: true,
                  endedAt: true,
                  fieldEventId: true,
                  note: true,
                  activity: named,
                },
              },
            },
          },
          dayApprovals: { where: { unlockedAt: null }, select: approvalRead },
        },
      });
      const page = rows.slice(0, asked.limit);
      // The field events a line names, where the project has one saved under that id.
      const namedEvents = page.flatMap((row) =>
        row.clockEntries.flatMap((entry) =>
          entry.activityLines.flatMap((line) =>
            line.fieldEventId === null ? [] : [line.fieldEventId],
          ),
        ),
      );
      const fieldEvents = new Map(
        (
          await tx.fieldEvent.findMany({
            where: { projectId, id: { in: [...new Set(namedEvents)] } },
            select: { id: true, kind: true, ticketNumber: true, splitSuffix: true },
          })
        ).map((event) => [event.id, event]),
      );
      return {
        done: true,
        days: page.map((row): DayHoursRead => {
          const workDate = calendar(row.workDate);
          const [inForce] = row.dayApprovals;
          const approval = inForce === undefined ? null : approvalShown(inForce);
          return {
            assignmentId: row.id,
            person: {
              id: row.person.id,
              name: row.person.name,
              monitorId: row.person.monitorNumber,
            },
            workDate,
            withdrawn: row.archivedAt !== null,
            entries: row.clockEntries.map((entry) => ({
              id: entry.id,
              kind: entry.kind,
              at: entry.at.toISOString(),
              deviceUtcOffsetMinutes: entry.deviceUtcOffsetMinutes,
              receivedAt: entry.receivedAt.toISOString(),
              phone: entry.device,
            })),
            activityLines: row.clockEntries.flatMap((entry) =>
              entry.activityLines.map((line) => {
                const event =
                  line.fieldEventId === null ? undefined : fieldEvents.get(line.fieldEventId);
                return {
                  id: line.id,
                  clockEntryId: line.clockEntryId,
                  position: line.position,
                  startedAt: line.startedAt.toISOString(),
                  endedAt: line.endedAt.toISOString(),
                  activity: line.activity,
                  fieldEventId: line.fieldEventId,
                  fieldEvent:
                    event === undefined
                      ? null
                      : {
                          kind: event.kind,
                          ticketNumber: event.ticketNumber,
                          splitSuffix: event.splitSuffix,
                        },
                  note: line.note,
                };
              }),
            ),
            hours: new ClockDay(workDate, project.timeZone).hours(row.clockEntries),
            approval,
            receivedAfterApproval:
              inForce !== undefined &&
              row.clockEntries.some((entry) => entry.receivedAt > inForce.approvedAt),
          };
        }),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // Refuses, with nothing changed, anybody who may not approve hours now.
  private static async mayApprove(tx: Tx, person: string): Promise<void> {
    const user = await tx.user.findUnique({ where: { id: person } });
    const granted =
      user === null
        ? []
        : await tx.userPermission.findMany({ where: { userId: person, archivedAt: null } });
    const refusal = new HoursRights(
      user === null
        ? null
        : {
            name: user.name,
            role: user.role,
            archived: user.archivedAt !== null,
            granted: granted.map((grant) => grant.permission),
          },
    ).refusal();
    if (refusal !== null) throw new Refused(refusal);
  }

  // The assignment and the approval in force of its day, if there is one.
  private static async dayOf(tx: Tx, assignmentId: string) {
    const assignment = await tx.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: {
        projectId: true,
        personId: true,
        workDate: true,
        person: { select: { name: true } },
      },
    });
    const inForce = await tx.dayApproval.findFirst({
      where: { assignmentId, unlockedAt: null },
      select: { id: true },
    });
    return { assignment, inForce };
  }

  private static asked(
    assignment: { personId: string; workDate: Date; person: { name: string } },
    inForce: { id: string } | null,
  ) {
    return {
      workerId: assignment.personId,
      workerName: assignment.person.name,
      workDate: calendar(assignment.workDate),
      approved: inForce !== null,
    };
  }
}
