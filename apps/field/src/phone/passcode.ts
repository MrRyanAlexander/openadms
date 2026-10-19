// The firm's master passcode checked on the phone itself, with no connection, and what wrong tries
// at it do (ARCHITECTURE §7.2, §7.5; adms-field-app §4A.0 (7), (8); BACKLOG 3.3.2, C126; NIST SP
// 800-63B-4 §3.2.2; ADR-106, 454, 575, 576, 577). The server checks the passcode wherever the phone
// reaches it, and counts those tries itself (ADR-438, 541). Where it can't, the phone checks what
// was typed against its own check of the passcode (offline-check.ts), for whatever it was typed:
// the sign-in screen unlocked, a setup, a switch, a move, a session.
//
// **Every wrong try is counted on the phone** (the screen's numbers, the domain's
// `SignInTries.onPhone`: a wait from the 5th, the lock at the 10th) and kept as a use to report
// (`WRONG_TRY`, naming nobody). The passcode right against the check starts the count again.
//
// **The user, 2026-10-18 (ADR-577): "ten wrong passcode tries done without signal results in the
// phone locked until the master passcode is entered."** So at the 10th the phone locks: whoever is
// signed in is signed out (nothing on the phone touched), and nothing opens on it, no sign-in, no
// setup and no check of the passcode it holds, **until the master passcode is entered with signal
// and the server takes it** (the phone proving itself with the passcode beside its key, the
// master user, ADR-531). The phone's own check can't lift the lock: it is what the ten tries were
// against. *Agent default:* the reading of "entered" as checked by the server.
import type { WrongTry } from '@open-adms/domain';

import type { NotAnswered } from '../server.ts';
import type { PhoneIdentity } from './identity.ts';
import type { LoginList, ScreenTries } from './login-list.ts';
import type { MonitorOnPhone } from './monitor.ts';
import { checkOpened } from './offline-check.ts';
import type { PhoneReports } from './reports.ts';

// What typing the passcode came to against the phone's own check: opened (with the first slow
// hash, which proves a session opened under it, and which version of the passcode it is); wrong,
// and any wait that puts on it; not checked while a wait holds; the phone locked, by this try or
// before; or no check held.
export type PasscodeChecked =
  | { readonly kind: 'opened'; readonly firstHash: Uint8Array; readonly version: number }
  | { readonly kind: 'wrong'; readonly waitUntil: Date | null }
  | { readonly kind: 'waiting'; readonly until: Date }
  | { readonly kind: 'locked' }
  | { readonly kind: 'noCheck' };

// What typing the passcode with signal came to while the phone is locked: unlocked, the server
// didn't take it (its own count), or no answer.
export type PasscodeUnlocked =
  { readonly kind: 'unlocked' } | { readonly kind: 'wrong' } | NotAnswered;

// What a wrong try did, for the screen: a wait, or the lock.
function wrongOf(cost: WrongTry): PasscodeChecked {
  if (cost.kind === 'LOCKED') return { kind: 'locked' };
  return { kind: 'wrong', waitUntil: cost.kind === 'WAIT' ? cost.until : null };
}

export class PasscodeOnPhone {
  private readonly identity: PhoneIdentity;
  private readonly monitor: MonitorOnPhone;
  private readonly loginList: LoginList;
  private readonly reports: PhoneReports;

  constructor(
    identity: PhoneIdentity,
    monitor: MonitorOnPhone,
    loginList: LoginList,
    reports: PhoneReports,
  ) {
    this.identity = identity;
    this.monitor = monitor;
    this.loginList = loginList;
    this.reports = reports;
  }

  // The passcode's count as it stands.
  tries(): Promise<ScreenTries> {
    return this.loginList.screen('passcode');
  }

  async locked(): Promise<boolean> {
    return (await this.tries()).locked;
  }

  // The passcode typed with no connection, checked against the phone's own check of it.
  async checked(passcode: string): Promise<PasscodeChecked> {
    const tries = await this.tries();
    if (tries.locked) return { kind: 'locked' };
    if (this.loginList.closed(tries) && tries.waitUntil !== null) {
      return { kind: 'waiting', until: tries.waitUntil };
    }
    const held = await this.loginList.passcode();
    if (held === undefined) return { kind: 'noCheck' };
    const firstHash = await checkOpened(passcode, held.check);
    if (firstHash === undefined) {
      await this.reports.keepUse('WRONG_TRY', null);
      const cost = await this.loginList.wrong('passcode');
      // The phone locked (ADR-577): whoever is signed in is signed out, as the lock after
      // inactivity signs them out; nothing on the phone is touched.
      if (cost.kind === 'LOCKED') await this.monitor.signOut();
      return wrongOf(cost);
    }
    await this.loginList.right('passcode');
    return { kind: 'opened', firstHash, version: held.version };
  }

  // The lock lifted with signal (ADR-577): the phone proves itself with the passcode beside its
  // key, the server checking the passcode and logging its use; taken, both counts start again and
  // what the phone holds to report goes at once, its wrong tries among it, by the master user. A
  // passcode the server doesn't take is its own to count.
  async unlocked(passcode: string): Promise<PasscodeUnlocked> {
    const master = await this.identity.masterUser(passcode);
    if (master.kind !== 'atThePhone') {
      return master.kind === 'refused' && master.code === 'PHONE_NOT_PROVEN'
        ? { kind: 'wrong' }
        : master;
    }
    await this.loginList.right('passcode');
    await this.loginList.right('screen');
    await this.reports.sent(master.send);
    return { kind: 'unlocked' };
  }
}
