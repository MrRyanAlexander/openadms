// "Sync and turn in" (ARCHITECTURE §7.4, §8; adms-field-app §4A.0 (12); BACKLOG 3.4.3, REQ-313,
// 124c; C69, C141, C170, C183; AC-02-58, AC-05-56, AC-11-08, 34, 35; ADR-065, 096, 134, 488, 495,
// 530, 531, 580). Whoever holds the master passcode turns the phone in, with or without its
// monitor: **the phone proves itself with the passcode beside its key** (the master user at the
// phone), **syncs every queue and sends every photograph's file** as that master user (the
// monitor's and the archived ones; `PhoneSync.asMasterUser`, which holds the sync for the whole
// turn-in, so no monitor's run goes between), then names everything it still
// holds (`PhoneOutbox.turnsIn`). **It wipes only when the server says so** (`wipe: true`: the
// keyring's erase, then the store's, NIST SP 800-88's cryptographic erase); told it lacks
// something, it keeps everything, and the screen shows the server's words and what it lacks.
//
// - **A phone whose key the firm's time revoked** (ADR-530) is told `MASTER_PASSCODE_NEEDED` at
//   its proof by its key alone; with the passcode beside the key it proves itself, and its token
//   opens its sync, its files, its reports and its turn-in alone: so it is turned in the same way
//   (AC-11-35).
// - **A turn-in whose answer never came** (no signal at the moment, an answer it couldn't read):
//   the phone keeps a mark of it, and everything it holds. Asked again, it first proves itself by
//   its key alone: refused, its key is revoked, which only a turn-in that found everything does
//   (ADR-488; the firm's time asks for the passcode instead), so it was turned in, and it wipes as
//   it would have been told; proven, or asked for the passcode, the turn-in didn't happen, and it
//   goes as any other. *Agent default* (ADR-580): the reading of "a refused proof right after a
//   turn-in ask" (C141, C170).
// - **The passcode** is held by the screen for the act alone and sent with the proof and the
//   turn-in, never kept or logged; one the server doesn't take is its own to count.
import { provenPhoneEndpoint, turnInPhoneEndpoint, type TurnInHolds } from '@open-adms/contracts';

import type { NotAnswered, Sender } from '../server.ts';
import type { PhoneStore } from '../store/phone-store.ts';
import type { PhoneIdentity } from './identity.ts';
import type { PhoneOutbox } from './outbox.ts';
import type { PhoneSync } from './sync.ts';

// What turning the phone in came to: turned in and wiped; not turned in, with the server's words,
// what it lacks and how many things the phone holds that this release can't read (C183); the
// passcode not taken; or where it stopped, everything kept.
export type TurnedIn =
  | { readonly kind: 'turnedIn' }
  | {
      readonly kind: 'notTurnedIn';
      readonly message: string;
      readonly notOnTheServer: TurnInHolds;
      readonly unreadable: number;
    }
  | { readonly kind: 'wrong' }
  | NotAnswered;

const keptAnswers = 'keptAnswers';
const askedId = 'turnInAsked';

export class PhoneTurnIn {
  private readonly store: PhoneStore;
  private readonly identity: PhoneIdentity;
  private readonly outbox: PhoneOutbox;
  private readonly sync: PhoneSync;
  private readonly now: () => Date;
  // A turn-in under way: one at a time.
  private going: Promise<TurnedIn> | undefined;

  constructor(
    parts: {
      readonly store: PhoneStore;
      readonly identity: PhoneIdentity;
      readonly outbox: PhoneOutbox;
      readonly sync: PhoneSync;
    },
    now = () => new Date(),
  ) {
    this.store = parts.store;
    this.identity = parts.identity;
    this.outbox = parts.outbox;
    this.sync = parts.sync;
    this.now = now;
  }

  // The phone turned in under the passcode typed, as above.
  turnedIn(passcode: string): Promise<TurnedIn> {
    this.going ??= this.turning(passcode).finally(() => {
      this.going = undefined;
    });
    return this.going;
  }

  // The whole of it holds the sync: no monitor's run goes between its syncs and its turn-in.
  private turning(passcode: string): Promise<TurnedIn> {
    return this.sync.asMasterUser((synced) => this.turnedInBy(passcode, synced));
  }

  private async turnedInBy(
    passcode: string,
    synced: (send: Sender) => Promise<'sent' | NotAnswered>,
  ): Promise<TurnedIn> {
    if (await this.asked()) {
      const byKey = await this.identity.asPhone(provenPhoneEndpoint);
      if (byKey.kind === 'refused' && byKey.code === 'PHONE_NOT_PROVEN') {
        await this.outbox.turnedInUnanswered();
        return { kind: 'turnedIn' };
      }
      if (byKey.kind === 'unreachable' || byKey.kind === 'unreadable') return byKey;
      await this.mark(false);
    }
    const master = await this.identity.masterUser(passcode);
    if (master.kind !== 'atThePhone') {
      // The proof's one code: here, the passcode beside the key wasn't taken.
      return master.kind === 'refused' && master.code === 'PHONE_NOT_PROVEN'
        ? { kind: 'wrong' }
        : master;
    }
    const sent = await synced(master.send);
    if (sent !== 'sent') return sent;
    await this.mark(true);
    const reply = await master.send(turnInPhoneEndpoint, { json: this.outbox.turnsIn(passcode) });
    if (reply.kind === 'unreachable' || reply.kind === 'unreadable') return reply;
    if (reply.kind === 'refused') {
      await this.mark(false);
      return reply.code === 'MASTER_PASSCODE_REFUSED' ? { kind: 'wrong' } : reply;
    }
    const read = await this.outbox.turnInAnswered(reply.answer);
    if (read === null) return { kind: 'unreadable' };
    if (read.wipe) return { kind: 'turnedIn' };
    await this.mark(false);
    return {
      kind: 'notTurnedIn',
      message: read.message,
      notOnTheServer: read.notOnTheServer,
      unreadable: this.outbox.unreadable(),
    };
  }

  // Whether a turn-in was sent and its answer never read.
  private async asked(): Promise<boolean> {
    return (await this.store.read(keptAnswers, askedId)) !== undefined;
  }

  private mark(asked: boolean): Promise<void> {
    return this.store.change([
      asked
        ? { shelf: keptAnswers, id: askedId, value: { askedAt: this.now().toISOString() } }
        : { shelf: keptAnswers, id: askedId, dropped: true },
    ]);
  }
}
