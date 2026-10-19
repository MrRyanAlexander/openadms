// The lists the phone holds for its assignment (ARCHITECTURE §7.1; adms-field-app §4A.2a; BACKLOG
// 3.2.3, C117, C133; ADR-450, 453, 574): asked for whenever it has a connection and a monitor
// signed in, kept in the store with when they were read. The answer says the assignment the phone
// takes now, which the monitor's session keeps. **Told there is none, the phone keeps what it
// holds** (an assignment never stops work, ADR-240) and says how stale it is (AC-11-16). The lists
// say which setup version they are; told of another (a sync's answer, task 3.4.1), the phone reads
// them again (AC-11-17). What the store keeps is read back by the contracts' own schema, with the
// monitor they were read for: the phone's monitor, the one whose work it holds, who alone signs in
// on it with no connection (ADR-120, 575).
import {
  phoneListsAnswerSchema,
  phoneListsEndpoint,
  type PhoneAssignmentAnswer,
  type PhoneListsRecord,
} from '@open-adms/contracts';
import type { NoAssignmentReason } from '@open-adms/domain';

import type { NotAnswered } from '../server.ts';
import type { Json, PhoneStore } from '../store/phone-store.ts';
import type { MonitorOnPhone } from './monitor.ts';

// The lists held, the assignment they are for, the monitor they were read for (none where lists
// kept before that was kept), and when they were read by the phone's clock.
export interface HeldLists {
  readonly assignment: PhoneAssignmentAnswer;
  readonly lists: PhoneListsRecord;
  readonly monitorId: string | null;
  readonly readAt: Date;
}

// What a read came to: the assignment taken and its lists kept, none taken (the lists held
// kept), or no answer, which leaves everything as it was.
export type ListsRead =
  | { readonly kind: 'taken'; readonly held: HeldLists }
  | { readonly kind: 'none'; readonly why: NoAssignmentReason }
  | NotAnswered;

const listsShelf = 'lists';
const listsId = 'assignment';

export class PhoneLists {
  private readonly store: PhoneStore;
  private readonly monitor: MonitorOnPhone;
  private readonly now: () => Date;

  constructor(store: PhoneStore, monitor: MonitorOnPhone, now = () => new Date()) {
    this.store = store;
    this.monitor = monitor;
    this.now = now;
  }

  // The lists the phone holds, or none before its first read.
  async held(): Promise<HeldLists | undefined> {
    const kept = await this.store.read(listsShelf, listsId);
    if (typeof kept !== 'object' || kept === null || kept instanceof Uint8Array) return undefined;
    if (Array.isArray(kept)) return undefined;
    const { readAt, monitorId, ...answer } = kept as Readonly<Record<string, unknown>>;
    const read = phoneListsAnswerSchema.safeParse(answer);
    if (!read.success || typeof readAt !== 'string' || Number.isNaN(Date.parse(readAt))) {
      return undefined;
    }
    const { assignment, lists } = read.data;
    if (assignment === null || lists === null) return undefined;
    const by = typeof monitorId === 'string' ? monitorId : null;
    return { assignment, lists, monitorId: by, readAt: new Date(readAt) };
  }

  // Read now, by the monitor signed in. Answered lists replace those held; answered none, the
  // lists held are kept as they are. Either way the session keeps the assignment taken now.
  async read(): Promise<ListsRead> {
    const asked = this.now();
    const reply = await this.monitor.ask(phoneListsEndpoint);
    if (reply.kind !== 'answered') return reply;
    const { assignment, noAssignment, lists } = reply.answer;
    await this.monitor.took(assignment, noAssignment);
    if (assignment === null || lists === null) {
      return { kind: 'none', why: noAssignment ?? 'NONE_THAT_DAY' };
    }
    const monitorId = (await this.monitor.signedIn())?.userId ?? null;
    await this.store.change([
      {
        shelf: listsShelf,
        id: listsId,
        value: { ...reply.answer, monitorId, readAt: asked.toISOString() } as unknown as Json,
      },
    ]);
    return { kind: 'taken', held: { assignment, lists, monitorId, readAt: asked } };
  }

  // Read again where the setup version the server named isn't the one the lists held are, or
  // the phone holds none (AC-11-17). Nothing is asked where they are the same.
  async readUnless(setupVersion: number): Promise<ListsRead | 'same'> {
    const held = await this.held();
    return held?.lists.setupVersion === setupVersion ? 'same' : this.read();
  }
}
