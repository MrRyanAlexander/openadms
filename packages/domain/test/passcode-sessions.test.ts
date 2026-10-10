// When a session opened under the master passcode ends (ARCHITECTURE §7.2, §7.3;
// spec/acceptance/02-people-and-devices.md AC-02-42; ADR-100, 120, 456 (5)(d), 462).
import { describe, expect, it } from 'vitest';

import { PasscodeSessionRules, ProjectClock, masterPasscodeSessions } from '../src/index.ts';

const bayline = 'America/New_York';
const rules = new PasscodeSessionRules(12);
const at = (instant: string) => new Date(instant);

describe('the end of a project’s day', () => {
  it('ADR-100 is the first instant of the next day in the project’s time zone, whatever the hour', () => {
    const clock = new ProjectClock(bayline);
    // Monday 12 October 2026 in Bayline County is UTC−04:00: it ends at 04:00 UTC on Tuesday.
    for (const instant of [
      '2026-10-12T04:00:00Z',
      '2026-10-12T13:30:00Z',
      '2026-10-13T03:59:59.999Z',
    ]) {
      expect(clock.dayEnds(at(instant)).toISOString(), instant).toBe('2026-10-13T04:00:00.000Z');
    }
    expect(clock.dayEnds(at('2026-10-13T04:00:00Z')).toISOString()).toBe(
      '2026-10-14T04:00:00.000Z',
    );
    expect(new ProjectClock('Asia/Kolkata').dayEnds(at('2026-10-12T13:30:00Z')).toISOString()).toBe(
      '2026-10-12T18:30:00.000Z',
    );
  });

  it('a day the clocks change on is 25 hours or 23, and ends where its own zone says', () => {
    const clock = new ProjectClock(bayline);
    // Sunday 1 November 2026: clocks go back, the day is 25 hours long.
    expect(clock.dayEnds(at('2026-11-01T04:00:00Z')).toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
    // Sunday 14 March 2027: clocks go forward, 23 hours.
    expect(clock.dayEnds(at('2027-03-14T05:00:00Z')).toISOString()).toBe(
      '2027-03-15T04:00:00.000Z',
    );
  });
});

describe('a session opened under the master passcode', () => {
  it('is one of two kinds, a closed set', () => {
    expect(masterPasscodeSessions).toEqual(['AS_MONITOR', 'TEMPORARY']);
  });

  it('AC-02-42 as the phone’s monitor it lasts as long as a monitor’s own sign-in, whatever the project’s day', () => {
    // 21:30 in Bayline County: the day ends in two and a half hours.
    expect(rules.endsAt('AS_MONITOR', at('2026-10-13T01:30:00Z'), bayline).toISOString()).toBe(
      '2026-10-13T13:30:00.000Z',
    );
    expect(rules.endsAt('AS_MONITOR', at('2026-10-13T01:30:00Z'), undefined).toISOString()).toBe(
      '2026-10-13T13:30:00.000Z',
    );
  });

  it('AC-02-42 a temporary one ends at the end of the project’s day, and never outlasts a monitor’s own sign-in', () => {
    // 21:30 in Bayline County: it ends at midnight there.
    expect(rules.endsAt('TEMPORARY', at('2026-10-13T01:30:00Z'), bayline).toISOString()).toBe(
      '2026-10-13T04:00:00.000Z',
    );
    // 06:00 there: midnight is eighteen hours off, so the twelve hours end it first.
    expect(rules.endsAt('TEMPORARY', at('2026-10-12T10:00:00Z'), bayline).toISOString()).toBe(
      '2026-10-12T22:00:00.000Z',
    );
    // Exactly twelve hours before midnight: both say the same.
    expect(rules.endsAt('TEMPORARY', at('2026-10-12T16:00:00Z'), bayline).toISOString()).toBe(
      '2026-10-13T04:00:00.000Z',
    );
    // The day is the project's own, not the server's: the same instant in Kolkata is 07:00
    // on Tuesday.
    expect(
      rules.endsAt('TEMPORARY', at('2026-10-13T01:30:00Z'), 'Asia/Kolkata').toISOString(),
    ).toBe('2026-10-13T13:30:00.000Z');
    expect(
      rules.endsAt('TEMPORARY', at('2026-10-13T10:30:00Z'), 'Asia/Kolkata').toISOString(),
    ).toBe('2026-10-13T18:30:00.000Z');
  });

  it('a temporary one for a monitor the phone took no assignment for has no project’s day: the hours alone end it', () => {
    expect(rules.endsAt('TEMPORARY', at('2026-10-13T01:30:00Z'), undefined).toISOString()).toBe(
      '2026-10-13T13:30:00.000Z',
    );
    expect(
      new PasscodeSessionRules(1).endsAt('TEMPORARY', at('2026-10-13T01:30:00Z'), bayline),
    ).toEqual(at('2026-10-13T02:30:00Z'));
  });
});
