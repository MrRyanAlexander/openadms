// The lists the phone holds for its assignment (ARCHITECTURE §7.1; adms-field-app §4A.2a; BACKLOG
// 3.2.3, C117, C133; ADR-450, 453, 574): asked for whenever it has a connection and a monitor
// signed in, kept in the store with when they were read. The answer says the assignment the phone
// takes now, which the monitor's session keeps. **Told there is none, the phone keeps what it
// holds** (an assignment never stops work, ADR-240) and says how stale it is (AC-11-16). The lists
// say which setup version they are; told of another (a sync's answer, task 3.4.1), the phone reads
// them again (AC-11-17). A sync's answer also brings the blocks of numbers the phone holds of each
// series it reported, topped up (ADR-065, 505): they take the place of that series' blocks held
// (`toppedUp`), and the last number used of each series is reported from them (`lastUsed`). What
// the store keeps is read back by the contracts' own schema, with the monitor they were read for:
// the phone's monitor, the one whose work it holds, who alone signs in on it with no connection
// (ADR-120, 575).
//
// **Its first block of each series its work makes numbers of** (C184; task 3.5.1, ADR-581): the
// lists say how the project numbers its tickets and which series it has; a sync reports each
// series the assignment makes numbers of (the domain's `PhoneSeries`) with no last number used
// where the phone holds no block of it yet, and the server cuts it one. **A number the capture
// gives out is marked used in its block at once** (`gaveOut`), in the same piece of work that
// opens its ticket, so it is never made again and is reported at the next sync; a top-up never
// marks a block's numbers less used than the phone knows them to be.
//
// **Handed over under the master passcode** to a monitor with their own assignment (task 3.3.2,
// ADR-577), the phone's monitor is the one it was handed to, kept beside the lists until lists
// are read or the phone is set up anew: the lists held stay the earlier monitor's, so the one
// handed to signs in with no connection on no assignment, and takes theirs with signal.
import {
  phoneListsAnswerSchema,
  phoneListsEndpoint,
  type LastUsedReport,
  type PhoneAssignmentAnswer,
  type PhoneListsRecord,
  type SeriesHeld,
} from '@open-adms/contracts';
import { PhoneSeries, type NoAssignmentReason, type NumberSeriesName } from '@open-adms/domain';

import type { NotAnswered } from '../server.ts';
import type { Change, Json, PhoneStore } from '../store/phone-store.ts';
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
const handedToId = 'handedTo';

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
      { shelf: listsShelf, id: handedToId, dropped: true },
    ]);
    return { kind: 'taken', held: { assignment, lists, monitorId, readAt: asked } };
  }

  // Set up under the master passcode on the project these lists are (ADR-240, 576; AC-02-38,
  // AC-11-24): the assignment made on the phone takes the place of the one held, for the monitor
  // it was made for, who becomes the phone's monitor. The lists stay as read, but for the unit
  // rate pay items, only those it names, and the site's quantity lookup, kept only at the same
  // site; when they were read stays too, so the phone still says how stale they are. Nothing is
  // changed where the phone holds no lists, or holds another project's: whether it was.
  async setUp(
    assignment: PhoneAssignmentAnswer,
    monitorId: string,
    payItemIds: readonly string[],
  ): Promise<boolean> {
    const held = await this.held();
    if (held?.assignment.project.id !== assignment.project.id) return false;
    const sameSite = held.assignment.site?.id === assignment.site?.id;
    const lists: PhoneListsRecord = {
      ...held.lists,
      payItems: held.lists.payItems.filter(({ id }) => payItemIds.includes(id)),
      quantityLookup: sameSite ? held.lists.quantityLookup : [],
    };
    await this.store.change([
      {
        shelf: listsShelf,
        id: listsId,
        value: {
          assignment,
          noAssignment: null,
          lists,
          monitorId,
          readAt: held.readAt.toISOString(),
        } as unknown as Json,
      },
      { shelf: listsShelf, id: handedToId, dropped: true },
    ]);
    return true;
  }

  // The phone's monitor: the one it was handed to under the master passcode, or else the one its
  // lists were read or set up for; none before either.
  async phonesMonitor(): Promise<string | null> {
    const handed = await this.store.read(listsShelf, handedToId);
    if (typeof handed === 'object' && handed !== null && !Array.isArray(handed)) {
      const { monitorId } = handed as Readonly<Record<string, unknown>>;
      if (typeof monitorId === 'string') return monitorId;
    }
    return (await this.held())?.monitorId ?? null;
  }

  // Handed over to a monitor with their own assignment (ADR-577): they are the phone's monitor
  // now; the lists held are kept as they are.
  async handedTo(monitorId: string): Promise<void> {
    await this.store.change([{ shelf: listsShelf, id: handedToId, value: { monitorId } }]);
  }

  // The blocks a sync answered, each series topped up taking the place of that series' blocks
  // held; a series not topped up, or another project's, leaves what is held as it is. Nothing where
  // the phone holds no lists.
  async toppedUp(numbers: readonly SeriesHeld[]): Promise<void> {
    const kept = await this.store.read(listsShelf, listsId);
    const held = await this.held();
    if (held === undefined || typeof kept !== 'object' || kept === null) return;
    if (Array.isArray(kept) || kept instanceof Uint8Array) return;
    const record = kept as Readonly<Record<string, Json>>;
    const project = held.assignment.project.id;
    const taken = numbers.filter(({ toppedUp, projectId }) => toppedUp && projectId === project);
    if (taken.length === 0) return;
    const series = new Set(taken.map((each) => each.series));
    // A number given out while the sync was under way stays used: of a block the phone held, the
    // higher of what it knew and what the server answered.
    const knew = (one: SeriesHeld['series'], first: number): number | null =>
      held.lists.blocks.find((block) => block.series === one && block.firstNumber === first)
        ?.lastUsedNumber ?? null;
    const blocks = [
      ...held.lists.blocks.filter((block) => !series.has(block.series)),
      ...taken.flatMap((each) =>
        each.blocks.map((block) => {
          const known = knew(each.series, block.firstNumber);
          const lastUsedNumber =
            known === null ? block.lastUsedNumber : Math.max(known, block.lastUsedNumber ?? known);
          return { ...block, lastUsedNumber, series: each.series, status: 'ISSUED' as const };
        }),
      ),
    ];
    await this.store.change([
      {
        shelf: listsShelf,
        id: listsId,
        value: { ...record, lists: { ...held.lists, blocks } } as unknown as Json,
      },
    ]);
  }

  // The last number used of each series the phone holds blocks of, as its blocks say, and of each
  // series its work makes numbers of that it holds none of yet, none: what a sync reports
  // (ADR-065; C184), so the server tops each up or cuts the first. None where it holds no lists.
  async lastUsed(): Promise<LastUsedReport[]> {
    const held = await this.held();
    if (held === undefined) return [];
    const makes = new PhoneSeries(held.assignment).of(held.lists.numbering.series);
    const series = [...new Set([...held.lists.blocks.map((block) => block.series), ...makes])];
    return series.map((one) => {
      const used = held.lists.blocks
        .filter((block) => block.series === one)
        .map((block) => block.lastUsedNumber)
        .filter((number) => number !== null);
      return {
        projectId: held.assignment.project.id,
        series: one,
        lastUsedNumber: used.length === 0 ? null : Math.max(...used),
      };
    });
  }

  // Whether its work makes numbers of a series it holds no block of yet (C184): a sync then asks
  // for the first.
  async wantsFirstBlocks(): Promise<boolean> {
    const held = await this.held();
    if (held === undefined) return false;
    return new PhoneSeries(held.assignment)
      .of(held.lists.numbering.series)
      .some((series) => !held.lists.blocks.some((block) => block.series === series));
  }

  // The store's change that marks a number the capture gave out as used in its block (ADR-065,
  // 571): kept with the ticket it opens, so the number is never made again. None where the phone
  // holds no lists, or no block holds the number.
  async gaveOut(series: NumberSeriesName, number: number): Promise<Change | null> {
    const kept = await this.store.read(listsShelf, listsId);
    const held = await this.held();
    if (held === undefined || typeof kept !== 'object' || kept === null) return null;
    if (Array.isArray(kept) || kept instanceof Uint8Array) return null;
    const holds = (block: HeldLists['lists']['blocks'][number]) =>
      block.series === series && number >= block.firstNumber && number <= block.lastNumber;
    if (!held.lists.blocks.some(holds)) return null;
    const blocks = held.lists.blocks.map((block) =>
      holds(block)
        ? { ...block, lastUsedNumber: Math.max(number, block.lastUsedNumber ?? number) }
        : block,
    );
    const record = kept as Readonly<Record<string, Json>>;
    return {
      shelf: listsShelf,
      id: listsId,
      value: { ...record, lists: { ...held.lists, blocks } } as unknown as Json,
    };
  }

  // Read again where the setup version the server named isn't the one the lists held are, or
  // the phone holds none (AC-11-17). Nothing is asked where they are the same.
  async readUnless(setupVersion: number): Promise<ListsRead | 'same'> {
    const held = await this.held();
    return held?.lists.setupVersion === setupVersion ? 'same' : this.read();
  }
}
