// Signing in on the phone's screen, with a connection or without one (ARCHITECTURE §7.2, §7.3;
// adms-field-app §4A.0 (4), (6); BACKLOG 3.2.4, C120; ADR-105, 120, 139, 443, 531, 575). The
// phone asks the server first (AC-02-35); only where it can't reach it does it check the password
// against the monitor's login-list entry (AC-02-39, AC-11-19). The screen's own count closes it
// first: a wait not over, or the lock until the master passcode, checks nothing (AC-02-40).
//
// **Who signs in with no connection** (*agent default*, ADR-575): the phone's monitor, the one
// whose assignment and lists it holds, since with no signal the phone can learn nobody else's
// work. Anybody else on its list is told whose work it holds: a supervisor hands it over with the
// master passcode (ADR-120; the switch, task 3.3.2), or they sign in where there is signal. Handed
// over to a monitor with their own assignment (ADR-577), that monitor is the phone's: they sign in
// with no connection on no assignment until they find signal, the lists held being another's.
//
// **The phone locked after ten wrong tries of the master passcode with no signal** (ADR-577;
// passcode.ts) takes no sign-in at all until the passcode is entered with signal.
import type { Policy, WrongTry } from '@open-adms/domain';

import type { NotAnswered } from '../server.ts';
import type { PhoneLists } from './lists.ts';
import type { LoginList, ScreenTries } from './login-list.ts';
import type { MonitorOnPhone, SignedIn } from './monitor.ts';
import { checkOpened } from './offline-check.ts';
import type { PasscodeChecked, PasscodeOnPhone } from './passcode.ts';
import type { PhoneReports } from './reports.ts';

export type SignInOutcome =
  // Signed in: online, or offline from the login list.
  | { readonly kind: 'signedIn'; readonly signedIn: SignedIn }
  // The server didn't take it, or answered nothing a phone can read: its own words.
  | { readonly kind: 'refused'; readonly reply: NotAnswered }
  // No connection, and the list didn't take it: counted, and what that did.
  | { readonly kind: 'wrong'; readonly cost: WrongTry }
  // The screen takes no try now: a wait not over, or locked.
  | { readonly kind: 'closed'; readonly tries: ScreenTries }
  // No connection; the password was theirs, but the phone holds another monitor's work.
  | { readonly kind: 'anotherMonitor'; readonly name: string | null }
  // No connection, and the phone holds no login list to check against.
  | { readonly kind: 'noList' }
  // The phone is locked until the master passcode is entered with signal (ADR-577).
  | { readonly kind: 'phoneLocked' };

export class SigningIn {
  private readonly monitor: MonitorOnPhone;
  private readonly lists: PhoneLists;
  private readonly loginList: LoginList;
  private readonly passcode: PasscodeOnPhone;
  private readonly reports: PhoneReports;
  private readonly policy: Pick<Policy, 'monitorSessionHours'>;

  constructor(
    monitor: MonitorOnPhone,
    lists: PhoneLists,
    loginList: LoginList,
    passcode: PasscodeOnPhone,
    reports: PhoneReports,
    policy: Pick<Policy, 'monitorSessionHours'>,
  ) {
    this.monitor = monitor;
    this.lists = lists;
    this.loginList = loginList;
    this.passcode = passcode;
    this.reports = reports;
    this.policy = policy;
  }

  async signIn(monitorNumber: string, password: string): Promise<SignInOutcome> {
    if ((await this.loginList.screen('passcode')).locked) return { kind: 'phoneLocked' };
    const tries = await this.loginList.screen();
    if (this.loginList.closed(tries)) return { kind: 'closed', tries };
    const reply = await this.monitor.signIn(monitorNumber, password);
    if (reply.kind === 'unreachable') return this.offline(monitorNumber, password);
    if (reply.kind !== 'answered') return { kind: 'refused', reply };
    await this.loginList.right();
    await this.loginList.keepSessionLength(reply.answer.expiresInSeconds);
    const signedIn = await this.monitor.signedIn();
    return signedIn === undefined
      ? { kind: 'refused', reply: { kind: 'refused', code: 'NOT_SIGNED_IN' } }
      : { kind: 'signedIn', signedIn };
  }

  // The screen's lock lifted (AC-02-40): the master passcode checked against the phone's own check
  // of it, counted as every try of it with no connection is (passcode.ts). Opened, the screen's
  // count starts again and the unlock is kept as a use to report, naming nobody (AC-11-23;
  // ADR-576); otherwise what the try came to, the phone locked at the passcode's tenth (ADR-577).
  async unlock(
    passcode: string,
  ): Promise<{ readonly kind: 'unlocked' } | Exclude<PasscodeChecked, { kind: 'opened' }>> {
    const checked = await this.passcode.checked(passcode);
    if (checked.kind !== 'opened') return checked;
    await this.loginList.right();
    await this.reports.keepUse('SIGN_IN_UNLOCK', null);
    return { kind: 'unlocked' };
  }

  private async offline(monitorNumber: string, password: string): Promise<SignInOutcome> {
    const entries = await this.loginList.entries();
    if (entries.length === 0) return { kind: 'noList' };
    const entry = await this.loginList.entry(monitorNumber);
    const firstHash = entry === undefined ? undefined : await checkOpened(password, entry.check);
    if (entry === undefined || firstHash === undefined) {
      return { kind: 'wrong', cost: await this.loginList.wrong() };
    }
    await this.loginList.right();
    const [held, phones] = await Promise.all([this.lists.held(), this.lists.phonesMonitor()]);
    if (phones !== entry.monitorId) {
      const holder = entries.find(({ monitorId }) => monitorId === phones);
      return { kind: 'anotherMonitor', name: holder?.name ?? null };
    }
    const seconds =
      (await this.loginList.sessionLength()) ?? this.policy.monitorSessionHours * 3600;
    // The lists' assignment where they are this monitor's; none where they were handed the phone.
    const assignment = held?.monitorId === entry.monitorId ? held.assignment : null;
    const signedIn = await this.monitor.signInOffline(entry, firstHash, assignment, seconds);
    return signedIn === undefined ? { kind: 'noList' } : { kind: 'signedIn', signedIn };
  }
}
