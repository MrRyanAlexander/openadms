// What a phone logged of the firm's master passcode with no connection, and reports when it has
// one (ARCHITECTURE §7's notes, §7.2, §7.3, §7.5; spec/acceptance/02-people-and-devices.md
// AC-02-23, 42, 46; adms-field-app §4A.0 (7), (8); ADR-095, 106, 120, 456 (3), (5)(e), 462, 464;
// REQ-202b). OWASP ASVS 5.0 16.2.1, 16.3.1, 16.3.3.
//
// - **Only what no other report carries.** A setup, a site move and a switch to a monitor who
//   has no assignment arrive as an unplanned assignment, with their own security events
//   (`AssignmentRules.securityEventsOf`). Here: a switch to a monitor who has their own
//   assignment, a session opened on the phone under the passcode, the sign-in screen unlocked
//   after too many wrong tries at it (ADR-576), and a wrong try at the passcode.
// - **A wrong try and an unlock name nobody**: a wrong try did nothing for anybody, and an
//   unlock opens the screen to whoever signs in next. Every other use is about one monitor.
// - **The first security event of a use takes the id the phone gave it**, so the same report
//   sent again is known and nothing is written twice.
// - **One monitor at a time**: a phone passed on, or a session opened on it for a monitor,
//   ends what anybody else had open on it before (`UnplannedAssignments` does the same for a
//   switch that made an assignment, ADR-462).
import type { MasterPasscodeSessionKind } from './passcode-sessions.ts';

// What the passcode was typed for, as the phone logged it.
export const loggedPasscodeUses = [
  // The phone passed to a monitor who has their own assignment.
  'MONITOR_SWITCH',
  // A session opened as the phone's monitor, the passcode in place of their password.
  'SESSION_AS_MONITOR',
  // The temporary session for a monitor picked from the roster.
  'TEMPORARY_SESSION',
  // The phone's sign-in screen unlocked, locked after too many wrong tries at it (ADR-576).
  'SIGN_IN_UNLOCK',
  // The passcode typed wrong, whatever it was typed for.
  'WRONG_TRY',
] as const;

export type LoggedPasscodeUse = (typeof loggedPasscodeUses)[number];

// A security event a logged use is kept as.
export interface LoggedSecurityEvent {
  readonly kind: 'DEVICE_SWITCH' | 'MASTER_PASSCODE_USE' | 'MASTER_PASSCODE_FAILED';
  // Which way a session was opened, on the use that opened one.
  readonly masterPasscodeSession: MasterPasscodeSessionKind | null;
}

// Why a use a phone reported can't be kept: it names somebody who is no monitor, or its id is
// another record's. Never a judgement of what was done.
export const loggedPasscodeUseRefusals = ['NOT_A_MONITOR', 'ID_ALREADY_HELD'] as const;

export type LoggedPasscodeUseRefusal = (typeof loggedPasscodeUseRefusals)[number];

export class PasscodeLogRules {
  // Whether a use of that kind is about a monitor. A report says who exactly where it is.
  namesAMonitor(use: LoggedPasscodeUse): boolean {
    return use !== 'WRONG_TRY' && use !== 'SIGN_IN_UNLOCK';
  }

  // The security events a use saved is, the one that takes the phone's id first.
  securityEventsOf(use: LoggedPasscodeUse): readonly LoggedSecurityEvent[] {
    const taken = (masterPasscodeSession: MasterPasscodeSessionKind | null) =>
      ({ kind: 'MASTER_PASSCODE_USE', masterPasscodeSession }) as const;
    switch (use) {
      case 'MONITOR_SWITCH':
        return [{ kind: 'DEVICE_SWITCH', masterPasscodeSession: null }, taken(null)];
      case 'SESSION_AS_MONITOR':
        return [taken('AS_MONITOR')];
      case 'TEMPORARY_SESSION':
        return [taken('TEMPORARY')];
      case 'SIGN_IN_UNLOCK':
        return [taken(null)];
      case 'WRONG_TRY':
        return [{ kind: 'MASTER_PASSCODE_FAILED', masterPasscodeSession: null }];
    }
  }

  // Whether a use saved ends the sessions others had open on that phone before it: one that
  // names a monitor.
  endsEarlierSessions(use: LoggedPasscodeUse): boolean {
    return this.namesAMonitor(use);
  }

  // Whether a use may be about them: a monitor. One archived since is still who it was for.
  mayBeFor(person: { readonly role: string } | null): boolean {
    return person?.role === 'MONITOR';
  }

  // An id the server already holds as a security event, reported as a logged use by that phone:
  // the same report sent again, or another record's id. Only a phone's own report carries an
  // offset.
  reportedAgain(
    held: { readonly deviceId: string | null; readonly deviceUtcOffsetMinutes: number | null },
    deviceId: string,
  ): 'ALREADY_SAVED' | 'ID_ALREADY_HELD' {
    return held.deviceId === deviceId && held.deviceUtcOffsetMinutes !== null
      ? 'ALREADY_SAVED'
      : 'ID_ALREADY_HELD';
  }
}
