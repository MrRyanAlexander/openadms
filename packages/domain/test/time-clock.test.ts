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
      outsideTheDayMinutes: 0,
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

  it('AC-02-55 the day ends before midnight in the project’s time zone: 22:00 to 01:30 counts 2 h, and 1 h 30 min is said apart', () => {
    expect(day.hours([entry('IN', '22:00'), entry('OUT', '01:30', '2026-10-14')])).toEqual({
      workedMinutes: 120,
      breakMinutes: 0,
      outsideTheDayMinutes: 90,
      stillClockedIn: false,
      unmatchedEntries: 0,
    });
    // Before the day began, the same.
    const early = day.hours([entry('IN', '23:00', '2026-10-12'), entry('OUT', '07:00')]);
    expect([early.workedMinutes, early.outsideTheDayMinutes]).toEqual([420, 60]);
  });

  it('AC-02-55 a day of 25 hours, where the clocks go back, ends where its own zone says', () => {
    const sunday = new ClockDay('2026-11-01', bayline);
    const longest = sunday.hours([
      { kind: 'IN', at: new Date('2026-11-01T00:00:00-04:00') },
      { kind: 'OUT', at: new Date('2026-11-01T23:59:00-05:00') },
    ]);
    expect([longest.workedMinutes, longest.outsideTheDayMinutes]).toEqual([1499, 0]);
    expect(new ProjectClock(bayline).dayBounds('2026-11-01')).toEqual({
      starts: new Date('2026-11-01T04:00:00Z'),
      ends: new Date('2026-11-02T05:00:00Z'),
    });
  });

  it('a stretch with no clock-out counts nothing and is said to be still clocked in, on a break too', () => {
    expect(day.hours([entry('IN', '06:00')])).toEqual({
      workedMinutes: 0,
      breakMinutes: 0,
      outsideTheDayMinutes: 0,
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
      outsideTheDayMinutes: 0,
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
      outsideTheDayMinutes: 0,
      stillClockedIn: false,
      unmatchedEntries: 4,
    });
  });

  it('no entries, no hours', () => {
    expect(day.hours([])).toEqual({
      workedMinutes: 0,
      breakMinutes: 0,
      outsideTheDayMinutes: 0,
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
