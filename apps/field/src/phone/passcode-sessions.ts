// A session opened on the phone under the firm's master passcode (ARCHITECTURE §7.2, §7.3, §7.5;
// adms-field-app §4A.0 (7), (8); BACKLOG 3.3.2, C124, C126, C171; AC-02-42, AC-11-26; ADR-095, 120,
// 462, 464, 531, 577). Whoever holds the passcode opens it for a monitor picked from the roster
// (the server's monitors with signal, the login list's with none): **as the phone's monitor**
// where it is the monitor the phone holds the work of, the passcode in place of their password;
// otherwise **the temporary session**, the shortcut when a phone changes hands, so the phone is
// passed on to them as a switch passes it (setup.ts: the earlier monitor's work archived, their
// session and proof dropped). *Agent default* (ADR-577): which of the two it is follows from whom
// it is for, so nobody is asked.
//
// - **With signal** the server opens it (`POST /phones/current/passcode-sessions`, the passcode
//   checked and its use logged there), marked as the passcode's, ending as the domain says.
// - **With none** the passcode is checked against the phone's own check (counted, passcode.ts),
//   and the session kept as a sign-in made offline of that kind, proven by the passcode's first
//   slow hash for the server to check once it has signal (ADR-531); its use is kept to report,
//   naming the monitor and which way (`SESSION_AS_MONITOR`, `TEMPORARY_SESSION`). It ends as the
//   domain's `PasscodeSessionRules` says, by the phone's clock: the temporary one at midnight in
//   the project's time zone (AC-11-26), the phone's project where it takes no assignment for them.
import {
  PasscodeSessionRules,
  type MasterPasscodeSessionKind,
  type Policy,
} from '@open-adms/domain';

import type { NotAnswered } from '../server.ts';
import type { PhoneLists } from './lists.ts';
import type { LoginList } from './login-list.ts';
import type { MonitorOnPhone, SessionFor, SignedIn } from './monitor.ts';
import type { PasscodeChecked, PasscodeOnPhone } from './passcode.ts';
import type { PhoneReports } from './reports.ts';
import type { PhoneSetup } from './setup.ts';

// What opening the session came to: signed in under the passcode; the server's refusal; or, with
// no connection, what the passcode's check came to where it didn't open.
export type SessionOpened =
  | { readonly kind: 'signedIn'; readonly signedIn: SignedIn }
  | { readonly kind: 'refused'; readonly reply: NotAnswered }
  | Exclude<PasscodeChecked, { readonly kind: 'opened' }>;

export class PasscodeSessions {
  private readonly monitor: MonitorOnPhone;
  private readonly lists: PhoneLists;
  private readonly loginList: LoginList;
  private readonly passcode: PasscodeOnPhone;
  private readonly setup: PhoneSetup;
  private readonly reports: PhoneReports;
  private readonly policy: Pick<Policy, 'monitorSessionHours'>;

  constructor(
    monitor: MonitorOnPhone,
    lists: PhoneLists,
    loginList: LoginList,
    passcode: PasscodeOnPhone,
    setup: PhoneSetup,
    reports: PhoneReports,
    policy: Pick<Policy, 'monitorSessionHours'>,
  ) {
    this.monitor = monitor;
    this.lists = lists;
    this.loginList = loginList;
    this.passcode = passcode;
    this.setup = setup;
    this.reports = reports;
    this.policy = policy;
  }

  // Which way a session for that monitor is opened: as the phone's monitor, or temporary.
  async kindFor(monitorId: string): Promise<MasterPasscodeSessionKind> {
    return (await this.lists.phonesMonitor()) === monitorId ? 'AS_MONITOR' : 'TEMPORARY';
  }

  // Opened for the monitor picked, with the passcode typed: by the server where `online` (the
  // roster was the server's) and it answers; with no connection, on the phone.
  async opened(person: SessionFor, passcode: string, online: boolean): Promise<SessionOpened> {
    const kind = await this.kindFor(person.monitorId);
    if (online) {
      const reply = await this.monitor.openedUnderPasscode(person.monitorId, kind, passcode);
      if (reply.kind === 'answered') return this.signedIn(person);
      if (reply.kind !== 'unreachable') return { kind: 'refused', reply };
    }
    const checked = await this.passcode.checked(passcode);
    if (checked.kind !== 'opened') return checked;
    const held = await this.lists.held();
    // The lists' assignment where they are this monitor's; none where the phone holds another's.
    const assignment = held?.monitorId === person.monitorId ? held.assignment : null;
    const timeZone = (assignment ?? held?.assignment)?.project.timeZone;
    const seconds =
      (await this.loginList.sessionLength()) ?? this.policy.monitorSessionHours * 3600;
    const rules = new PasscodeSessionRules(seconds / 3600);
    await this.monitor.openedOffline(person, kind, checked, assignment, (signedInAt) =>
      rules.endsAt(kind, signedInAt, timeZone),
    );
    await this.reports.keepUse(
      kind === 'AS_MONITOR' ? 'SESSION_AS_MONITOR' : 'TEMPORARY_SESSION',
      person.monitorId,
    );
    return this.signedIn(person);
  }

  // Signed in: the phone passed on to them where they weren't its monitor, the one signed in now
  // being them already, so nobody else is signed out here.
  private async signedIn(person: SessionFor): Promise<SessionOpened> {
    if ((await this.kindFor(person.monitorId)) === 'TEMPORARY') {
      await this.setup.passedOn(person.monitorId);
      await this.lists.handedTo(person.monitorId);
    }
    const signedIn = await this.monitor.signedIn();
    return signedIn === undefined
      ? { kind: 'refused', reply: { kind: 'refused', code: 'NOT_SIGNED_IN' } }
      : { kind: 'signedIn', signedIn };
  }
}
