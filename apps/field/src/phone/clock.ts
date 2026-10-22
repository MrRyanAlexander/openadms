// The time clock on the phone (adms-field-app §4A.0 (13); BACKLOG 3.7.2, REQ-310, C177;
// AC-02-50…52; ADR-063, 100, 241, 598, 601): a worker's own clock-in, breaks and clock-out, by
// hand, on the assignment the phone holds for them, where its project has the time clock on.
//
// - **Each entry is the worker's own record**, made now by the phone's clock with its offset and
//   kept sealed in the outbox, as the sync's `CLOCK_ENTRY` carries it (ADR-598); beside it, in the
//   same piece of work, the clock's own note of it on the `clock` shelf, from which where the
//   worker stands is read: the domain's `ClockDay.standing`, as the hours read the same entries.
//   **What may be entered next** is the domain's `ClockDay.next`; nothing else is offered.
// - **The clock-out carries the day's activity lines** the worker approved (ADR-241 (3), 598):
//   pre-filled a line an hour from the field events they submitted on the assignment on this
//   phone (the domain's `ClockDay.prefilled`; forms and certifications are no field events,
//   ADR-236), edited and approved by them, with what the app can't know picked from the firm's
//   list. A field event an earlier clock-out of the same assignment carried isn't pre-filled again:
//   the clock-out's note names each field event its lines were pre-filled from.
// - **Never crew time** (ADR-241 (7)): a unit rate ticket is pre-filled only as a field event the
//   worker made, by its times; nothing of its items or hours is read.
//
// Nothing here refuses work or judges the hours (ADR-052): the nudges are the screens' and never
// stop anything; the worker's statement is for a manager to approve (W3).
import type { PhoneAssignmentAnswer, SyncedClockEntry } from '@open-adms/contracts';
import {
  ClockDay,
  uuidv7,
  type ClockEntryKind,
  type ClockStanding,
  type NotSavedNotice,
  type PrefilledLine,
} from '@open-adms/domain';

import type { Json, PhoneStore } from '../store/phone-store.ts';
import type { PhoneOutbox } from './outbox.ts';
import { offsetOf } from './reports.ts';
import type { PhoneTicket, PhoneTickets } from './tickets.ts';

const clockShelf = 'clock';

// The clock's own note of an entry: whose and on what, its kind, when by the phone's clock with
// its offset, and for a clock-out the field events its lines were pre-filled from.
export interface ClockNote {
  readonly id: string;
  readonly projectId: string;
  readonly assignmentId: string;
  readonly workerId: string;
  readonly kind: ClockEntryKind;
  readonly at: string;
  readonly offset: number;
  readonly carried: readonly string[];
}

// A field event as the day's activity is pre-filled from it: its ticket on this phone.
export interface WorkDone {
  readonly id: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly ticket: PhoneTicket;
}

// One line as the worker approved it: from when to when; the field event it was pre-filled from,
// or an activity of the firm's list; their note, if any; and the field events it was pre-filled
// from, which the clock-out then carries.
export interface ApprovedLine {
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly fieldEventId: string | null;
  readonly activityId: string | null;
  readonly note: string | null;
  readonly carries: readonly string[];
}

// Whose clock: the worker signed in, on the assignment the phone holds for them.
export interface ClockOf {
  readonly workerId: string;
  readonly assignment: PhoneAssignmentAnswer;
}

const isNote = (value: unknown): value is ClockNote =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Uint8Array) &&
  typeof (value as { id?: unknown }).id === 'string' &&
  typeof (value as { assignmentId?: unknown }).assignmentId === 'string' &&
  typeof (value as { workerId?: unknown }).workerId === 'string' &&
  typeof (value as { at?: unknown }).at === 'string' &&
  Array.isArray((value as { carried?: unknown }).carried);

export class PhoneClock {
  private readonly store: PhoneStore;
  private readonly outbox: PhoneOutbox;
  private readonly tickets: PhoneTickets;
  private readonly now: () => Date;
  private notes: ClockNote[] = [];

  private constructor(
    store: PhoneStore,
    outbox: PhoneOutbox,
    tickets: PhoneTickets,
    now: () => Date,
  ) {
    this.store = store;
    this.outbox = outbox;
    this.tickets = tickets;
    this.now = now;
  }

  // The clock as the store holds it.
  static async opened(
    store: PhoneStore,
    outbox: PhoneOutbox,
    tickets: PhoneTickets,
    now: () => Date = () => new Date(),
  ): Promise<PhoneClock> {
    const clock = new PhoneClock(store, outbox, tickets, now);
    const kept = await store.readAll(clockShelf);
    clock.notes = kept.flatMap(({ value }) => (isNote(value) ? [value] : []));
    return clock;
  }

  // The worker's entries on the assignment, in field time (arrival order means nothing).
  entriesOf({ workerId, assignment }: ClockOf): readonly ClockNote[] {
    return this.notes
      .filter((note) => note.workerId === workerId && note.assignmentId === assignment.id)
      .sort((one, other) => one.at.localeCompare(other.at));
  }

  // Where the worker stands on the assignment's clock: out, in, or on a break.
  standing(of: ClockOf): ClockStanding {
    return ClockDay.standing(
      this.entriesOf(of).map(({ kind, at }) => ({ kind, at: new Date(at) })),
    );
  }

  // What the worker may enter now, in the order a day runs.
  next(of: ClockOf): readonly ClockEntryKind[] {
    return ClockDay.next(this.standing(of));
  }

  // A clock-in or a break's start or end, now: kept sealed to send, or not kept, with the
  // contract's words. A clock-out is `clockedOut`, with its lines.
  async enter(
    of: ClockOf,
    kind: Exclude<ClockEntryKind, 'OUT'>,
  ): Promise<NotSavedNotice | undefined> {
    return this.entered(of, kind, []);
  }

  // The day's activity pre-filled from the field events the worker submitted on the assignment on
  // this phone that no earlier clock-out of it carried, a line an hour of the project's day.
  prefilled(of: ClockOf): PrefilledLine<WorkDone>[] {
    const { workerId, assignment } = of;
    const carried = new Set(this.entriesOf(of).flatMap(({ carried: ids }) => ids));
    const work = this.tickets
      .submittedOf(workerId, assignment.project.id)
      .filter((ticket) => ticket.assignmentId === assignment.id && !carried.has(ticket.id))
      .map((ticket) => ({
        id: ticket.id,
        startedAt: new Date(ticket.startedAt),
        endedAt: new Date(ticket.endedAt ?? ticket.startedAt),
        ticket,
      }));
    return new ClockDay(assignment.workDate, assignment.project.timeZone).prefilled(work);
  }

  // The clock-out, now, carrying the lines the worker approved, in their order: kept sealed to
  // send, or not kept, with the contract's words (a note left blank is none).
  async clockedOut(
    of: ClockOf,
    lines: readonly ApprovedLine[],
  ): Promise<NotSavedNotice | undefined> {
    return this.entered(of, 'OUT', lines);
  }

  private async entered(
    { workerId, assignment }: ClockOf,
    kind: ClockEntryKind,
    lines: readonly ApprovedLine[],
  ): Promise<NotSavedNotice | undefined> {
    if (!this.next({ workerId, assignment }).includes(kind)) {
      throw new Error(`${kind} isn’t what comes next on this worker’s clock.`);
    }
    const at = this.now();
    const entry: SyncedClockEntry = {
      id: uuidv7(at),
      projectId: assignment.project.id,
      assignmentId: assignment.id,
      workerId,
      kind,
      at: at.toISOString(),
      deviceUtcOffsetMinutes: offsetOf(at),
      activityLines: lines.map((line) => ({
        startedAt: line.startedAt.toISOString(),
        endedAt: line.endedAt.toISOString(),
        fieldEventId: line.fieldEventId,
        activityId: line.activityId,
        note: line.note === null || line.note.trim() === '' ? null : line.note.trim(),
      })),
    };
    const note: ClockNote = {
      id: entry.id,
      projectId: entry.projectId,
      assignmentId: entry.assignmentId,
      workerId,
      kind,
      at: entry.at,
      offset: entry.deviceUtcOffsetMinutes,
      carried: [...new Set(lines.flatMap(({ carries }) => carries))],
    };
    const notice = await this.outbox.keepTogether(
      [{ record: 'CLOCK_ENTRY', clockEntry: entry }],
      [{ shelf: clockShelf, id: note.id, value: note as unknown as Json }],
    );
    if (notice !== undefined) return notice;
    this.notes.push(note);
    return undefined;
  }
}
