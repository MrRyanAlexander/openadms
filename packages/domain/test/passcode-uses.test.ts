// What a phone logged of the master passcode with no connection, as security events
// (ARCHITECTURE §7.3, §7.5; spec/acceptance/02-people-and-devices.md AC-02-23, 42, 46;
// ADR-106, 456 (5)(e), 462, 464; REQ-202b).
import { describe, expect, it } from 'vitest';

import {
  PasscodeLogRules,
  loggedPasscodeUseRefusals,
  loggedPasscodeUses,
  masterPasscodeSessions,
} from '../src/index.ts';

const rules = new PasscodeLogRules();

describe('a use of the master passcode a phone logged', () => {
  it('is one of five, a closed set, and can’t be kept for two reasons only', () => {
    expect(loggedPasscodeUses).toEqual([
      'MONITOR_SWITCH',
      'SESSION_AS_MONITOR',
      'TEMPORARY_SESSION',
      'SIGN_IN_UNLOCK',
      'WRONG_TRY',
    ]);
    expect(loggedPasscodeUseRefusals).toEqual(['NOT_A_MONITOR', 'ID_ALREADY_HELD']);
  });

  it('REQ-202b, AC-02-46 a phone passed to a monitor who has their own assignment is a phone switched, then a use of the passcode', () => {
    expect(rules.securityEventsOf('MONITOR_SWITCH')).toEqual([
      { kind: 'DEVICE_SWITCH', masterPasscodeSession: null },
      { kind: 'MASTER_PASSCODE_USE', masterPasscodeSession: null },
    ]);
  });

  it('REQ-202b, AC-02-42 a session opened on the phone is one use of the passcode that says which way, never a sign-in', () => {
    expect(rules.securityEventsOf('SESSION_AS_MONITOR')).toEqual([
      { kind: 'MASTER_PASSCODE_USE', masterPasscodeSession: 'AS_MONITOR' },
    ]);
    expect(rules.securityEventsOf('TEMPORARY_SESSION')).toEqual([
      { kind: 'MASTER_PASSCODE_USE', masterPasscodeSession: 'TEMPORARY' },
    ]);
    // Every way a session is opened under the passcode has its logged use.
    expect(
      loggedPasscodeUses
        .flatMap((use) => rules.securityEventsOf(use))
        .flatMap(({ masterPasscodeSession }) => masterPasscodeSession ?? [])
        .sort(),
    ).toEqual([...masterPasscodeSessions].sort());
  });

  it('REQ-202b a wrong try is a failed try at the passcode, about nobody, and ends nothing', () => {
    expect(rules.securityEventsOf('WRONG_TRY')).toEqual([
      { kind: 'MASTER_PASSCODE_FAILED', masterPasscodeSession: null },
    ]);
    expect(loggedPasscodeUses.map((use) => [use, rules.namesAMonitor(use)])).toEqual([
      ['MONITOR_SWITCH', true],
      ['SESSION_AS_MONITOR', true],
      ['TEMPORARY_SESSION', true],
      ['SIGN_IN_UNLOCK', false],
      ['WRONG_TRY', false],
    ]);
    expect(loggedPasscodeUses.map((use) => [use, rules.endsEarlierSessions(use)])).toEqual([
      ['MONITOR_SWITCH', true],
      ['SESSION_AS_MONITOR', true],
      ['TEMPORARY_SESSION', true],
      ['SIGN_IN_UNLOCK', false],
      ['WRONG_TRY', false],
    ]);
  });

  it('AC-11-23, ADR-576 the sign-in screen unlocked on the phone is one use of the master passcode, about nobody, ending nothing', () => {
    expect(rules.securityEventsOf('SIGN_IN_UNLOCK')).toEqual([
      { kind: 'MASTER_PASSCODE_USE', masterPasscodeSession: null },
    ]);
  });

  it('is about a monitor, in service or archived since; never somebody of the back office or nobody the firm has', () => {
    expect(rules.mayBeFor({ role: 'MONITOR' })).toBe(true);
    for (const role of [
      'ADMIN',
      'MANAGER_ANALYST',
      'READ_ONLY_VIEWER',
      'SYSTEM',
      'MASTER_PASSCODE',
    ]) {
      expect(rules.mayBeFor({ role }), role).toBe(false);
    }
    expect(rules.mayBeFor(null)).toBe(false);
  });

  it('reported again by the phone that logged it, it is already saved; an id another phone’s report holds, or an event the server saw itself, is another record’s', () => {
    const phone = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d01';
    const other = '0199c1f4-7a10-7c3e-9b1d-5e2f8a4c6d02';
    expect(rules.reportedAgain({ deviceId: phone, deviceUtcOffsetMinutes: -240 }, phone)).toBe(
      'ALREADY_SAVED',
    );
    expect(rules.reportedAgain({ deviceId: phone, deviceUtcOffsetMinutes: 0 }, phone)).toBe(
      'ALREADY_SAVED',
    );
    expect(rules.reportedAgain({ deviceId: other, deviceUtcOffsetMinutes: -240 }, phone)).toBe(
      'ID_ALREADY_HELD',
    );
    expect(rules.reportedAgain({ deviceId: phone, deviceUtcOffsetMinutes: null }, phone)).toBe(
      'ID_ALREADY_HELD',
    );
    expect(rules.reportedAgain({ deviceId: null, deviceUtcOffsetMinutes: null }, phone)).toBe(
      'ID_ALREADY_HELD',
    );
  });
});
