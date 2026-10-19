// The login list the phone holds for signing in with no connection, and its own count of wrong
// tries at the sign-in screen (ARCHITECTURE §7.2, §7.5; adms-field-app §4A.0 (6); BACKLOG 3.2.4,
// C120; ADR-105, 139, 449, 454, 575). Asked for whenever a monitor is signed in and the phone has a
// connection, saying what it holds (a mark for each entry and the version of the master
// passcode's check), and made only what it lacks; asked again while the answer says there are
// more. Anybody the answer doesn't name is dropped; told there is no assignment, the phone keeps
// what it holds (AC-02-41). Everything is kept on the store's `loginList` shelf, inside the
// phone's encrypted store and nowhere else, read back by the contracts' own schema.
//
// **The screen's own count** (AC-02-40): every wrong try checked against the list, whoever's
// Monitor ID it names, is counted on the phone; from the policy's first count each puts a wait on
// the screen, and at its second the screen locks until the master passcode is typed (the domain's
// `SignInTries.onPhone`). A sign-in that works, or the passcode, starts it again. A try the server
// checks online is the server's to count (ADR-443).
//
// **The master passcode's own count** (task 3.3.2; the user, ADR-577): every wrong try of the
// passcode against the phone's own check of it, whatever it was typed for, is counted the same way
// and kept beside the screen's (`count: 'passcode'`); the passcode right against that check starts
// it again. What the lock it reaches does is passcode.ts's.
import {
  phoneLoginListAnswerSchema,
  phoneLoginListEndpoint,
  type OfflineCheckRecord,
} from '@open-adms/contracts';
import type { NoAssignmentReason, SignInTries, WrongTry } from '@open-adms/domain';

import type { NotAnswered } from '../server.ts';
import type { Change, Json, PhoneStore } from '../store/phone-store.ts';
import type { MonitorOnPhone } from './monitor.ts';

// A monitor's entry: who they are, the mark of the check the phone holds, and the check.
export interface LoginListEntry {
  readonly monitorId: string;
  readonly monitorNumber: string;
  readonly name: string;
  readonly mark: string;
  readonly check: OfflineCheckRecord;
}

// The master passcode's check the phone holds, and which version of the passcode it is.
export interface PasscodeCheck {
  readonly version: number;
  readonly check: OfflineCheckRecord;
}

// Which count: the sign-in screen's, or the master passcode's against the phone's own check.
export type TriesCount = 'screen' | 'passcode';

// A count's wrong tries in a row, the wait they put on it, and whether it is locked.
export interface ScreenTries {
  readonly wrongInARow: number;
  readonly waitUntil: Date | null;
  readonly locked: boolean;
}

// What a read came to: the list as the answer says, none (what is held kept), or no answer.
export type LoginListRead =
  | { readonly kind: 'read' }
  | { readonly kind: 'none'; readonly why: NoAssignmentReason }
  | NotAnswered;

const shelf = 'loginList';
const entryId = (monitorId: string) => `monitor:${monitorId}`;
const passcodeId = 'passcode';
const countIds: Readonly<Record<TriesCount, string>> = {
  screen: 'screen',
  passcode: 'passcodeTries',
};
const sessionLengthId = 'sessionLength';
// A read asks again while the answer says there are more: a project of five thousand monitors is a
// hundred asks at the API's fifty entries each, and a read stops there whatever it is told.
const asksAtMost = 100;

const answered = phoneLoginListAnswerSchema.shape;
const entryRead = answered.loginList.unwrap().shape.monitors.element;

function record(kept: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof kept === 'object' && kept !== null && !Array.isArray(kept)
    ? (kept as Readonly<Record<string, unknown>>)
    : undefined;
}

export class LoginList {
  private readonly store: PhoneStore;
  private readonly tries: SignInTries;
  private readonly now: () => Date;

  constructor(store: PhoneStore, tries: SignInTries, now = () => new Date()) {
    this.store = store;
    this.tries = tries;
    this.now = now;
  }

  // Asked for by the monitor signed in, saying what the phone holds, until the answer says there
  // are no more. Each answer is kept as it comes.
  async read(monitor: MonitorOnPhone): Promise<LoginListRead> {
    for (let asked = 0; asked < asksAtMost; asked += 1) {
      const [entries, passcode] = await Promise.all([this.entries(), this.passcode()]);
      const reply = await monitor.ask(phoneLoginListEndpoint, {
        json: {
          masterPasscodeVersion: passcode?.version ?? null,
          entries: entries.map(({ monitorId, mark }) => ({ monitorId, mark })),
        },
      });
      if (reply.kind !== 'answered') return reply;
      const { masterPasscode, noAssignment, loginList } = reply.answer;
      const changes: Change[] = [];
      if (masterPasscode.check !== null) {
        changes.push({ shelf, id: passcodeId, value: masterPasscode as unknown as Json });
      }
      if (loginList === null) {
        await this.store.change(changes);
        return { kind: 'none', why: noAssignment ?? 'NONE_THAT_DAY' };
      }
      const held = new Map(entries.map((entry) => [entry.monitorId, entry.mark]));
      const named = new Set<string>();
      for (const one of loginList.monitors) {
        named.add(one.monitorId);
        if (one.check !== null) {
          changes.push({ shelf, id: entryId(one.monitorId), value: one as unknown as Json });
        } else if (held.has(one.monitorId) && held.get(one.monitorId) !== one.mark) {
          // A password set anew since: the check held opens one no longer good. Made at the next ask.
          changes.push({ shelf, id: entryId(one.monitorId), dropped: true });
        }
      }
      for (const { monitorId } of entries) {
        if (!named.has(monitorId)) changes.push({ shelf, id: entryId(monitorId), dropped: true });
      }
      await this.store.change(changes);
      if (!loginList.more) return { kind: 'read' };
    }
    return { kind: 'read' };
  }

  // Every entry held, in no order.
  async entries(): Promise<LoginListEntry[]> {
    const kept = await this.store.readAll(shelf);
    return kept.flatMap(({ id, value }) => {
      if (!id.startsWith('monitor:')) return [];
      const read = entryRead.safeParse(value);
      return read.success && read.data.check !== null
        ? [{ ...read.data, check: read.data.check }]
        : [];
    });
  }

  // The entry of the monitor whose ID was typed, as the server reads one: spaces around it and
  // its letter's case aside.
  async entry(monitorNumber: string): Promise<LoginListEntry | undefined> {
    const typed = monitorNumber.trim().toUpperCase();
    return (await this.entries()).find((entry) => entry.monitorNumber === typed);
  }

  async passcode(): Promise<PasscodeCheck | undefined> {
    const read = answered.masterPasscode.safeParse(await this.store.read(shelf, passcodeId));
    return read.success && read.data.check !== null
      ? { version: read.data.version, check: read.data.check }
      : undefined;
  }

  // A count as it stands now: the screen's, unless the passcode's is asked.
  async screen(count: TriesCount = 'screen'): Promise<ScreenTries> {
    const kept = record(await this.store.read(shelf, countIds[count]));
    const wrongInARow = typeof kept?.['wrongInARow'] === 'number' ? kept['wrongInARow'] : 0;
    const until = kept?.['waitUntil'];
    const waitUntil =
      typeof until === 'string' && !Number.isNaN(Date.parse(until)) ? new Date(until) : null;
    return { wrongInARow, waitUntil, locked: this.tries.locked(wrongInARow) };
  }

  // Whether the screen takes no try now: locked, or a wait not yet over.
  closed(screen: ScreenTries): boolean {
    return this.tries.closed(screen.wrongInARow, screen.waitUntil, this.now());
  }

  // One more wrong try counted, and what it does.
  async wrong(count: TriesCount = 'screen'): Promise<WrongTry> {
    const wrongInARow = (await this.screen(count)).wrongInARow + 1;
    const cost = this.tries.after(wrongInARow, this.now());
    const waitUntil = cost.kind === 'WAIT' ? cost.until.toISOString() : null;
    await this.store.change([{ shelf, id: countIds[count], value: { wrongInARow, waitUntil } }]);
    return cost;
  }

  // A count started again: the screen's by a sign-in that worked or the master passcode typed;
  // the passcode's by the passcode right.
  async right(count: TriesCount = 'screen'): Promise<void> {
    await this.store.change([{ shelf, id: countIds[count], dropped: true }]);
  }

  // How long the last sign-in the server answered on this phone lasted, in seconds: the firm's
  // hours, which a sign-in made offline lasts by the phone's clock until the server says.
  async sessionLength(): Promise<number | undefined> {
    const seconds = record(await this.store.read(shelf, sessionLengthId))?.['seconds'];
    return typeof seconds === 'number' && Number.isSafeInteger(seconds) && seconds > 0
      ? seconds
      : undefined;
  }

  async keepSessionLength(seconds: number): Promise<void> {
    await this.store.change([{ shelf, id: sessionLengthId, value: { seconds } }]);
  }
}
