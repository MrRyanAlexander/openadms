// A signed-in phone's run, as its screens act on it (ADR-574, 588, 603): the phone syncs, reads
// the lists and the login list, then reads back what it keeps: who is signed in, the lists it
// holds and when it last synced. What the screens make of it:
//
// - **read**: the monitor still signed in, with what the run kept;
// - **signed out by the server**: the session gone because the server ended it (answered
//   `NOT_SIGNED_IN`), refused a sign-in made with no signal (`SIGN_IN_REFUSED`), or because it ran
//   out by the phone's clock;
// - **overtaken**: a session ended on this phone while the run went on (a sign-out by the monitor,
//   the lock after inactivity, a handover, the passcode's lock: `MonitorOnPhone.signOut`). The act
//   that ended it shows what follows; the run says nothing of it, least of all that the sign-in
//   "has ended".
import type { MonitorOnPhone, SignedIn } from './monitor.ts';
import type { HeldLists, PhoneLists } from './lists.ts';
import type { ListsAfter, PhoneSync, SyncRun } from './sync.ts';

export type SignedInRead =
  | {
      readonly kind: 'read';
      readonly session: SignedIn;
      readonly held: HeldLists | undefined;
      readonly lastSynced: Date | undefined;
      readonly ran: SyncRun;
    }
  | { readonly kind: 'signedOut'; readonly why: 'offlineRefused' | 'ended' }
  | { readonly kind: 'overtaken' };

export class SignedInRuns {
  private readonly sync: Pick<PhoneSync, 'run' | 'lastSynced'>;
  private readonly monitor: Pick<MonitorOnPhone, 'signedIn' | 'signOuts'>;
  private readonly lists: Pick<PhoneLists, 'held'>;

  constructor(parts: {
    readonly sync: Pick<PhoneSync, 'run' | 'lastSynced'>;
    readonly monitor: Pick<MonitorOnPhone, 'signedIn' | 'signOuts'>;
    readonly lists: Pick<PhoneLists, 'held'>;
  }) {
    this.sync = parts.sync;
    this.monitor = parts.monitor;
    this.lists = parts.lists;
  }

  async run(after: ListsAfter = 'read'): Promise<SignedInRead> {
    const signOuts = this.monitor.signOuts;
    const ran = await this.sync.run(after);
    const [session, held, lastSynced] = await Promise.all([
      this.monitor.signedIn(),
      this.lists.held(),
      this.sync.lastSynced(),
    ]);
    if (this.monitor.signOuts !== signOuts) return { kind: 'overtaken' };
    if (session === undefined) {
      const refused = ran.kind === 'refused' && ran.code === 'SIGN_IN_REFUSED';
      return { kind: 'signedOut', why: refused ? 'offlineRefused' : 'ended' };
    }
    return { kind: 'read', session, held, lastSynced, ran };
  }
}
