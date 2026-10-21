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

const minute = 60_000;

const kindOrder: Record<ClockEntryKind, number> = { IN: 0, BREAK_START: 1, BREAK_END: 2, OUT: 3 };

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
    // In field time; two at one instant in the order a day runs.
    const ordered = [...entries].sort(
      (a, b) => a.at.getTime() - b.at.getTime() || kindOrder[a.kind] - kindOrder[b.kind],
    );
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
