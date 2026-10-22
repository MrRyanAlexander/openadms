// The time clock's rules: a day's hours from its entries, the day ending before midnight in the
// project's time zone, no cap on hours, and who approves a day (REQ-310; AC-02-50, 53, 55;
// ADR-100, 241, 598).
import { describe, expect, it } from 'vitest';

import {
  Access,
  ClockDay,
  DayApprovals,
  HoursRights,
  ProjectClock,
  clockEntryKinds,
  type ClockEntryAt,
  type ClockEntryKind,
} from '../src/index.ts';

// Bayline County, P1's time zone: UTC−04:00 in October, UTC−05:00 from 1 November 2026.
const bayline = 'America/New_York';
const tuesday = '2026-10-13';
const day = new ClockDay(tuesday, bayline);
// An instant on Tuesday 13 October in Bayline County, by its hour and minute there.
const at = (time: string, date = tuesday): Date => new Date(`${date}T${time}:00-04:00`);
const entry = (kind: ClockEntryKind, time: string, date?: string): ClockEntryAt => ({
  kind,
  at: at(time, date),
});

describe('what an entry is', () => {
  it('AC-02-50 a clock-in, a break’s start and end, and a clock-out: one closed set', () => {
    expect(clockEntryKinds).toEqual(['IN', 'BREAK_START', 'BREAK_END', 'OUT']);
  });
});

describe('a day’s hours', () => {
  it('AC-02-50 06:00 in, a break 13:00–13:30, out at 18:50: 12 h 20 min worked, 30 min on a break', () => {
    expect(
      day.hours([
        entry('IN', '06:00'),
        entry('BREAK_START', '13:00'),
        entry('BREAK_END', '13:30'),
        entry('OUT', '18:50'),
      ]),
    ).toEqual({
      workedMinutes: 740,
      breakMinutes: 30,
      otherDays: [],
      stillClockedIn: false,
      unmatchedEntries: 0,
    });
  });

  it('arrival order means nothing: the entries are read in field time', () => {
    const sent = [
      entry('OUT', '18:50'),
      entry('BREAK_END', '13:30'),
      entry('IN', '06:00'),
      entry('BREAK_START', '13:00'),
    ];
    expect(day.hours(sent).workedMinutes).toBe(740);
  });

  it('AC-02-55 no limit is put on anyone’s hours: 05:00 to 23:30 is 18 h 30 min', () => {
    expect(day.hours([entry('IN', '05:00'), entry('OUT', '23:30')]).workedMinutes).toBe(1110);
  });

  it('AC-02-55 the day ends before midnight in the project’s time zone: 22:00 to 01:30 counts 2 h on its own day and 1 h 30 min on the next (BUILD.md, settled 1)', () => {
    expect(
      day.hours([
        entry('IN', '22:00'),
        entry('BREAK_START', '23:45'),
        entry('BREAK_END', '00:15', '2026-10-14'),
        entry('OUT', '01:30', '2026-10-14'),
      ]),
    ).toEqual({
      workedMinutes: 105,
      breakMinutes: 15,
      otherDays: [{ workDate: '2026-10-14', workedMinutes: 75, breakMinutes: 15 }],
      stillClockedIn: false,
      unmatchedEntries: 0,
    });
    // Before the day began, the same: the hour before midnight counts on the day before.
    const early = day.hours([entry('IN', '23:00', '2026-10-12'), entry('OUT', '07:00')]);
    expect([early.workedMinutes, early.otherDays]).toEqual([
      420,
      [{ workDate: '2026-10-12', workedMinutes: 60, breakMinutes: 0 }],
    ]);
  });

  it('AC-02-55 a day of 25 hours, where the clocks go back, ends where its own zone says', () => {
    const sunday = new ClockDay('2026-11-01', bayline);
    const longest = sunday.hours([
      { kind: 'IN', at: new Date('2026-11-01T00:00:00-04:00') },
      { kind: 'OUT', at: new Date('2026-11-01T23:59:00-05:00') },
    ]);
    expect([longest.workedMinutes, longest.otherDays]).toEqual([1499, []]);
    expect(new ProjectClock(bayline).dayBounds('2026-11-01')).toEqual({
      starts: new Date('2026-11-01T04:00:00Z'),
      ends: new Date('2026-11-02T05:00:00Z'),
    });
  });

  it('a stretch with no clock-out counts nothing and is said to be still clocked in, on a break too', () => {
    expect(day.hours([entry('IN', '06:00')])).toEqual({
      workedMinutes: 0,
      breakMinutes: 0,
      otherDays: [],
      stillClockedIn: true,
      unmatchedEntries: 0,
    });
    const onBreak = day.hours([entry('IN', '06:00'), entry('BREAK_START', '12:00')]);
    expect([onBreak.workedMinutes, onBreak.stillClockedIn]).toEqual([360, true]);
  });

  it('a clock-out on a break ends the break; two stretches in a day are both counted', () => {
    expect(
      day.hours([
        entry('IN', '06:00'),
        entry('BREAK_START', '11:00'),
        entry('OUT', '11:45'),
        entry('IN', '15:00'),
        entry('OUT', '17:00'),
      ]),
    ).toEqual({
      workedMinutes: 420,
      breakMinutes: 45,
      otherDays: [],
      stillClockedIn: false,
      unmatchedEntries: 0,
    });
  });

  it('an entry that fits no stretch is counted apart and never guessed at', () => {
    const odd = day.hours([
      entry('BREAK_END', '05:30'),
      entry('IN', '06:00'),
      entry('IN', '06:05'),
      entry('BREAK_START', '12:00'),
      entry('BREAK_START', '12:10'),
      entry('BREAK_END', '12:30'),
      entry('OUT', '15:00'),
      entry('OUT', '15:01'),
    ]);
    expect(odd).toEqual({
      workedMinutes: 510,
      breakMinutes: 30,
      otherDays: [],
      stillClockedIn: false,
      unmatchedEntries: 4,
    });
  });

  it('no entries, no hours', () => {
    expect(day.hours([])).toEqual({
      workedMinutes: 0,
      breakMinutes: 0,
      otherDays: [],
      stillClockedIn: false,
      unmatchedEntries: 0,
    });
  });
});

describe('who approves a day (AC-02-53)', () => {
  const luis = { role: 'MANAGER_ANALYST', archived: false, name: 'Luis Ortega' };
  const anasDay = {
    workerId: 'ana',
    workerName: 'Ana Brooks',
    workDate: tuesday,
    approved: false,
  };
  const approvals = new DayApprovals();

  it('an admin, or a manager/analyst granted “approve hours” and “view dispatch”', () => {
    expect(new HoursRights({ ...luis, role: 'ADMIN', granted: [] }).refusal()).toBeNull();
    expect(
      new HoursRights({ ...luis, granted: ['APPROVE_HOURS', 'VIEW_DISPATCH'] }).refusal(),
    ).toBeNull();
    expect(new HoursRights({ ...luis, granted: ['APPROVE_HOURS'] }).refusal()).toEqual({
      code: 'NOT_ALLOWED',
      message:
        'Luis Ortega may not approve hours: it takes an admin, or a manager/analyst granted "approve hours" and "view dispatch". Nothing was changed.',
    });
    expect(new HoursRights(null).refusal()?.code).toBe('NOT_ALLOWED');
    for (const role of ['MONITOR', 'READ_ONLY_VIEWER', 'SYSTEM']) {
      const access = new Access({ role, archived: false, granted: ['APPROVE_HOURS'] });
      expect(access.holds('APPROVE_HOURS'), role).toBe(false);
    }
  });

  it('never their own day, and a day approved once until it is unlocked', () => {
    expect(approvals.approveRefusal('luis', anasDay)).toBeNull();
    expect(approvals.approveRefusal('ana', anasDay)).toEqual({
      code: 'OWN_DAY',
      message:
        'Nobody approves their own day: Ana Brooks’s hours of 13-Oct-2026 are approved by another manager or an admin. Nothing was saved.',
    });
    expect(approvals.approveRefusal('luis', { ...anasDay, approved: true })).toEqual({
      code: 'ALREADY_APPROVED',
      message:
        'Ana Brooks’s day of 13-Oct-2026 is already approved. Unlock it to approve it again. Nothing was saved.',
    });
  });

  it('only an approved day is unlocked', () => {
    expect(approvals.unlockRefusal({ ...anasDay, approved: true })).toBeNull();
    expect(approvals.unlockRefusal(anasDay)).toEqual({
      code: 'NOT_APPROVED',
      message:
        'Ana Brooks’s day of 13-Oct-2026 isn’t approved, so there is nothing to unlock. Nothing was saved.',
    });
  });
});

describe('the clock on the phone (task 3.7.2, ADR-601)', () => {
  it('AC-02-50 where the worker stands: out, in, on a break, in again, out; read in field time, an entry that fits no stretch moving nothing', () => {
    expect(ClockDay.standing([])).toBe('OUT');
    expect(ClockDay.standing([entry('IN', '06:00')])).toBe('IN');
    expect(ClockDay.standing([entry('BREAK_START', '13:00'), entry('IN', '06:00')])).toBe('BREAK');
    expect(
      ClockDay.standing([
        entry('IN', '06:00'),
        entry('BREAK_START', '13:00'),
        entry('BREAK_END', '13:30'),
      ]),
    ).toBe('IN');
    expect(ClockDay.standing([entry('IN', '06:00'), entry('OUT', '18:50')])).toBe('OUT');
    // A second clock-in while in, a break ended that never started: nothing moves.
    expect(
      ClockDay.standing([entry('IN', '06:00'), entry('IN', '07:00'), entry('BREAK_END', '08:00')]),
    ).toBe('IN');
    expect(ClockDay.standing([entry('OUT', '06:00')])).toBe('OUT');
  });

  it('AC-02-50 what may be entered next: a clock-in when out, a break or a clock-out when in, the break’s end or a clock-out on one', () => {
    expect(ClockDay.next('OUT')).toEqual(['IN']);
    expect(ClockDay.next('IN')).toEqual(['BREAK_START', 'OUT']);
    expect(ClockDay.next('BREAK')).toEqual(['BREAK_END', 'OUT']);
  });

  it('AC-02-52 the day’s activity pre-filled a line an hour from the field events: from the hour’s first start to its latest end, naming the first; in field time, whatever order they came in', () => {
    const work = (id: string, from: string, to: string, number: string) => ({
      id,
      number,
      startedAt: at(from),
      endedAt: at(to),
    });
    const a = work('a', '08:20', '08:40', '101001');
    const b = work('b', '08:45', '09:10', '101002');
    const c = work('c', '09:05', '09:20', '101003');
    const d = work('d', '13:05', '13:40', '101004');
    expect(day.prefilled([d, c, b, a])).toEqual([
      { startedAt: at('08:20'), endedAt: at('09:10'), fieldEventId: 'a', work: [a, b] },
      { startedAt: at('09:05'), endedAt: at('09:20'), fieldEventId: 'c', work: [c] },
      { startedAt: at('13:05'), endedAt: at('13:40'), fieldEventId: 'd', work: [d] },
    ]);
    expect(day.prefilled([])).toEqual([]);
  });

  it('AC-02-52 a tower’s busy day is still a line an hour: 250 disposals from 06:00 come to 13 lines, far under what a clock-out carries', () => {
    const disposals = Array.from({ length: 250 }, (_, place) => {
      const startedAt = new Date(at('06:00').getTime() + place * 3 * 60_000);
      return { id: String(place), startedAt, endedAt: new Date(startedAt.getTime() + 60_000) };
    });
    const lines = day.prefilled(disposals);
    expect(lines).toHaveLength(13);
    expect(lines.reduce((sum, line) => sum + line.work.length, 0)).toBe(250);
  });

  it('the hour is the project’s: 08:59 and 09:00 in Bayline County are two lines', () => {
    const lines = day.prefilled([
      { id: 'x', startedAt: at('08:59'), endedAt: at('09:01') },
      { id: 'y', startedAt: at('09:00'), endedAt: at('09:02') },
    ]);
    expect(lines.map(({ fieldEventId }) => fieldEventId)).toEqual(['x', 'y']);
  });
});

describe('a time of day typed for a day (task 3.7.2, ADR-601)', () => {
  const clock = new ProjectClock(bayline);

  it('is the instant it falls at in the project’s time zone, on either side of the clocks going back', () => {
    expect(clock.instantAt(tuesday, '08:20')).toEqual(at('08:20'));
    expect(clock.instantAt(tuesday, '7:05')).toEqual(at('07:05'));
    expect(clock.instantAt('2026-11-02', '08:20')).toEqual(new Date('2026-11-02T08:20:00-05:00'));
    // 01:30 on Sunday 1 November happens twice: the first.
    expect(clock.instantAt('2026-11-01', '01:30')).toEqual(new Date('2026-11-01T01:30:00-04:00'));
  });

  it('none for what isn’t a time of day', () => {
    for (const typed of ['', '8', '24:00', '08:60', '8.20', 'noon', '08:20:00']) {
      expect(clock.instantAt(tuesday, typed)).toBeNull();
    }
    expect(clock.instantAt('13-Oct-2026', '08:20')).toBeNull();
  });
});

describe('a line’s times as its worker typed them (task 3.7.2, ADR-601)', () => {
  it('AC-02-52 are the instants they fall at on the assignment’s day in the project’s time zone, or on the day given', () => {
    expect(day.typedLine('08:20', '09:10')).toEqual({
      kind: 'line',
      startedAt: at('08:20'),
      endedAt: at('09:10'),
    });
    expect(day.typedLine('22:20', '22:50', '2026-10-14')).toEqual({
      kind: 'line',
      startedAt: at('22:20', '2026-10-14'),
      endedAt: at('22:50', '2026-10-14'),
    });
    // A line of no length is the worker's to keep.
    expect(day.typedLine('13:00', '13:00').kind).toBe('line');
  });

  it('say which time isn’t a time of day, and a line that ends before it starts', () => {
    expect(day.typedLine('', '09:10')).toEqual({ kind: 'notATime', which: 'from' });
    expect(day.typedLine('08:20', '9.10')).toEqual({ kind: 'notATime', which: 'to' });
    expect(day.typedLine('09:10', '08:20')).toEqual({ kind: 'endsFirst' });
  });
});
