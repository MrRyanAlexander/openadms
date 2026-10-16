// A session on a phone opened under the firm's master passcode, with a connection (ARCHITECTURE
// §7.2, §7.3, §7.5; spec/acceptance/02-people-and-devices.md AC-02-42; adms-field-app §4A.0 (7),
// (8); ADR-095, 106, 120, 456 (3)(d), (5)(d), 462). NIST SP 800-63B-4's session chapter: a
// session is never taken to be at a higher assurance than the authentication that opened it,
// and this one authenticated nobody: whoever holds the passcode opened it for a monitor.
//
// - **Two ways, and the session says which.** As the phone's monitor (the passcode in place of
//   their password), or the temporary session for a monitor picked from the roster when a phone
//   changes hands.
// - **Neither outlasts a monitor's own sign-in** (the firm's hours, `MONITOR_SESSION_HOURS` as
//   shipped; ADR-531), and quiet ends neither, as it ends no monitor's.
// - **The temporary one also ends with the project's day**, so the monitor signs in properly
//   next time (ADR-120): the day is the project's own (its time zone, ADR-100), the project that
//   of the assignment the phone takes for them. With no assignment taken there is no project's
//   day to end it, and the hours alone do.
import { ProjectClock } from './project-clock.ts';

export const masterPasscodeSessions = ['AS_MONITOR', 'TEMPORARY'] as const;

export type MasterPasscodeSessionKind = (typeof masterPasscodeSessions)[number];

export class PasscodeSessionRules {
  // How long a monitor's own sign-in on a phone lasts, in hours.
  private readonly hours: number;

  constructor(hours: number) {
    this.hours = hours;
  }

  // When a session opened now ends. `timeZone`: that of the project of the assignment the phone
  // takes for the monitor, where it takes one.
  endsAt(kind: MasterPasscodeSessionKind, now: Date, timeZone: string | undefined): Date {
    const byHours = new Date(now.getTime() + this.hours * 3_600_000);
    if (kind !== 'TEMPORARY' || timeZone === undefined) return byHours;
    const dayEnds = new ProjectClock(timeZone).dayEnds(now);
    return dayEnds < byHours ? dayEnds : byHours;
  }
}
