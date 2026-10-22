// The time clock's rules (REQ-310; spec/acceptance/02-people-and-devices.md AC-02-50…55; ADR-063,
// 100, 241, 598): workers' own hours, on their assignment, never related to crew time.
//
// - **What is recorded** is the worker's own, by hand on the phone: a clock-in, a break's start
//   and end, a clock-out, each at the phone's clock; and at clock-out the day's activity lines,
//   pre-filled from their field events and edited and approved by them, with what the app can't
//   know picked from the firm's list (travel, standby, training).
// - **A day's hours** are read from its entries in field-time order (arrival order means
//   nothing): from each clock-in to its clock-out, less the breaks in between. **The day ends
//   before midnight in the project's time zone** (ADR-100): what fell outside the assignment's own
//   day is said apart and never counted on it. **No cap is put on anyone's hours.** A stretch with
//   no clock-out counts nothing and is said to be still clocked in; an entry that fits no stretch
//   (a second clock-in, a break ended that never started) is counted apart, never guessed at.
//   Nothing here refuses or flags: the hours are the worker's statement, for a manager to approve.
// - **A manager approves the day** (an admin, or a manager/analyst granted "approve hours" and
//   "view dispatch"), never their own; an approved day is locked until it is unlocked, with a
//   note, and approving it again is a new approval. No rate and no pay is held (ADR-241 (5)).
// - **Never crew time** (ADR-241 (7)): nothing here reads a unit rate ticket, and nothing of a
//   unit rate ticket reads this.
// - **On the phone** (task 3.7.2, ADR-601, agent defaults): where the worker stands now (clocked
//   out, clocked in or on a break) is read from the same entries in the same order, an entry that
//   fits no stretch left out, and what they may enter next follows from it; **the day's activity
//   is pre-filled a line an hour of the project's day** (the user's "what they did each hour",
//   Q-59), from the field events they made on the assignment, each line from the hour's first
//   field event's start to the latest end among them, naming the first as the field event it was
//   pre-filled from (a line names one, ADR-598); **a line's times are typed on the 24-hour clock
//   of its day in the project's time zone**, and one that ends before it starts is said, to be put
//   right: data entry, never a judgment of the hours.
import { ProjectClock } from './project-clock.ts';

// What one entry records, the database's ClockEntryKind.
export const clockEntryKinds = ['IN', 'BREAK_START', 'BREAK_END', 'OUT'] as const;

export type ClockEntryKind = (typeof clockEntryKinds)[number];

// One entry as the hours read it: its kind and the phone's instant.
export interface ClockEntryAt {
  readonly kind: ClockEntryKind;
  readonly at: Date;
}

// A day's hours, in whole minutes, from all of a day's entries.
export interface DayHours {
  // Clocked in and not on a break, inside the assignment's day.
  readonly workedMinutes: number;
  // On a break, inside the day.
  readonly breakMinutes: number;
  // Clocked in and not on a break, but before the day began or after it ended in the project's
  // time zone: never counted on this day (ADR-100).
  readonly outsideTheDayMinutes: number;
  // The last clock-in, or a break, with no clock-out after it: counted to nothing.
  readonly stillClockedIn: boolean;
  // Entries that fit no stretch: a clock-in while clocked in, a break started on a break or
  // while clocked out, a break ended that never started, a clock-out while clocked out.
  readonly unmatchedEntries: number;
}

// Where a worker stands on their assignment's clock: clocked out (or never in), clocked in, or on a
// break.
export type ClockStanding = 'OUT' | 'IN' | 'BREAK';

// A field event as the day's activity is pre-filled from it: the id its phone made it under, and
// when it started and ended by the phone's clock (the phone's own record of it carries the rest).
export interface ClockedWork {
  readonly id: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

// One line of the day's activity, pre-filled from the field events whose start fell in one hour
// of the project's day: from the first one's start to the latest end among them, naming the first
// as the field event the line was pre-filled from, and every one of them, in field time.
export interface PrefilledLine<Work extends ClockedWork> {
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly fieldEventId: string;
  readonly work: readonly Work[];
}

// A line of the day's activity as its worker typed its times: the instants it runs between, or
// why it isn't one yet, a time that isn't a time of day ("from" or "to"), or an end before its
// start.
export type TypedLine =
  | { readonly kind: 'line'; readonly startedAt: Date; readonly endedAt: Date }
  | { readonly kind: 'notATime'; readonly which: 'from' | 'to' }
  | { readonly kind: 'endsFirst' };

const minute = 60_000;

const kindOrder: Record<ClockEntryKind, number> = { IN: 0, BREAK_START: 1, BREAK_END: 2, OUT: 3 };

// What each entry moves a worker to from where they stand; none where it fits no stretch.
const moves: Readonly<Record<ClockStanding, Partial<Record<ClockEntryKind, ClockStanding>>>> = {
  OUT: { IN: 'IN' },
  IN: { BREAK_START: 'BREAK', OUT: 'OUT' },
  BREAK: { BREAK_END: 'IN', OUT: 'OUT' },
};

// The entries in field time (arrival order means nothing); two at one instant in the order a day
// runs.
function inFieldTime(entries: readonly ClockEntryAt[]): ClockEntryAt[] {
  return [...entries].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || kindOrder[a.kind] - kindOrder[b.kind],
  );
}

export class ClockDay {
  private readonly clock: ProjectClock;
  private readonly workDate: string;

  // `workDate`: the assignment's day, 2026-10-14; `timeZone`: its project's.
  constructor(workDate: string, timeZone: string) {
    this.clock = new ProjectClock(timeZone);
    this.workDate = workDate;
  }

  hours(entries: readonly ClockEntryAt[]): DayHours {
    const { starts, ends } = this.clock.dayBounds(this.workDate);
    const ordered = inFieldTime(entries);
    let worked = 0;
    let onBreak = 0;
    let outside = 0;
    let unmatched = 0;
    let state: 'OUT' | 'IN' | 'BREAK' = 'OUT';
    let since = 0;
    const inside = (from: number, to: number): number =>
      Math.max(0, Math.min(to, ends.getTime()) - Math.max(from, starts.getTime()));
    const work = (to: number): void => {
      const within = inside(since, to);
      worked += within;
      outside += Math.max(0, to - since) - within;
    };
    for (const entry of ordered) {
      const at = entry.at.getTime();
      if (state === 'OUT' && entry.kind === 'IN') {
        state = 'IN';
      } else if (state === 'IN' && (entry.kind === 'BREAK_START' || entry.kind === 'OUT')) {
        work(at);
        state = entry.kind === 'OUT' ? 'OUT' : 'BREAK';
      } else if (state === 'BREAK' && (entry.kind === 'BREAK_END' || entry.kind === 'OUT')) {
        onBreak += inside(since, at);
        state = entry.kind === 'OUT' ? 'OUT' : 'IN';
      } else {
        unmatched += 1;
        continue;
      }
      since = at;
    }
    return {
      workedMinutes: Math.round(worked / minute),
      breakMinutes: Math.round(onBreak / minute),
      outsideTheDayMinutes: Math.round(outside / minute),
      stillClockedIn: state !== 'OUT',
      unmatchedEntries: unmatched,
    };
  }

  // Where the worker stands after all of these entries, read as the hours read them: an entry
  // that fits no stretch moves nothing.
  static standing(entries: readonly ClockEntryAt[]): ClockStanding {
    let standing: ClockStanding = 'OUT';
    for (const { kind } of inFieldTime(entries)) standing = moves[standing][kind] ?? standing;
    return standing;
  }

  // What the worker may enter from where they stand, in the order a day runs: a clock-in when
  // clocked out; a break or a clock-out when clocked in; the break's end or a clock-out on one.
  static next(standing: ClockStanding): readonly ClockEntryKind[] {
    return clockEntryKinds.filter((kind) => moves[standing][kind] !== undefined);
  }

  // The day's activity pre-filled from the field events given (ADR-241 (3), 601): a line for each
  // hour of the project's day one of them started in, in field time. Nothing is dropped or judged:
  // the worker edits the lines and approves them.
  prefilled<Work extends ClockedWork>(work: readonly Work[]): PrefilledLine<Work>[] {
    const ordered = [...work].sort(
      (a, b) => a.startedAt.getTime() - b.startedAt.getTime() || a.id.localeCompare(b.id),
    );
    const hours = new Map<string, Work[]>();
    for (const one of ordered) {
      const hour = `${this.clock.day(one.startedAt)} ${this.clock.time(one.startedAt).slice(0, 2)}`;
      const held = hours.get(hour);
      if (held === undefined) hours.set(hour, [one]);
      else held.push(one);
    }
    return [...hours.values()].flatMap((held) => {
      const [first] = held;
      if (first === undefined) return [];
      return [
        {
          startedAt: first.startedAt,
          endedAt: new Date(Math.max(...held.map(({ endedAt }) => endedAt.getTime()))),
          fieldEventId: first.id,
          work: held,
        },
      ];
    });
  }

  // A line's times as its worker typed them (ADR-601), each a time of day on the 24-hour clock,
  // "08:20", on the line's day in the project's time zone (the assignment's own where none is
  // given): what isn't a time of day is said, and so is a line that ends before it starts.
  typedLine(from: string, to: string, day = this.workDate): TypedLine {
    const startedAt = this.clock.instantAt(day, from);
    if (startedAt === null) return { kind: 'notATime', which: 'from' };
    const endedAt = this.clock.instantAt(day, to);
    if (endedAt === null) return { kind: 'notATime', which: 'to' };
    return endedAt.getTime() < startedAt.getTime()
      ? { kind: 'endsFirst' }
      : { kind: 'line', startedAt, endedAt };
  }
}

// Why a day isn't approved or unlocked, in plain words.
export interface DayApprovalRefusal {
  readonly code: 'NOT_ALLOWED' | 'ALREADY_APPROVED' | 'OWN_DAY' | 'NOT_APPROVED';
  readonly message: string;
}

// The day an approval is asked of: whose it is and which, and whether one is in force.
export interface DayAsked {
  readonly workerId: string;
  readonly workerName: string;
  // 2026-10-14.
  readonly workDate: string;
  readonly approved: boolean;
}

export class DayApprovals {
  // Why this person may not approve this day, or nothing. Who holds "approve hours" is
  // `Access`'s; this is the rest of it.
  approveRefusal(approverId: string, day: DayAsked): DayApprovalRefusal | null {
    const date = ProjectClock.dateOf(day.workDate);
    if (approverId === day.workerId) {
      return {
        code: 'OWN_DAY',
        message: `Nobody approves their own day: ${day.workerName}’s hours of ${date} are approved by another manager or an admin. Nothing was saved.`,
      };
    }
    if (day.approved) {
      return {
        code: 'ALREADY_APPROVED',
        message: `${day.workerName}’s day of ${date} is already approved. Unlock it to approve it again. Nothing was saved.`,
      };
    }
    return null;
  }

  // Why this day can't be unlocked, or nothing.
  unlockRefusal(day: DayAsked): DayApprovalRefusal | null {
    if (day.approved) return null;
    return {
      code: 'NOT_APPROVED',
      message: `${day.workerName}’s day of ${ProjectClock.dateOf(day.workDate)} isn’t approved, so there is nothing to unlock. Nothing was saved.`,
    };
  }
}
