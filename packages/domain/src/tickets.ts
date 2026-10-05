// Which field events are one ticket, the ticket's shape, and the status the worker gives it
// (spec/parts/06-reconciliation.md steps 1, 2 and 7; spec/acceptance/06-reconciliation.md
// sections B and C; adms-validation §5.1, §5.4, §5.4a; adms-ticket-workflows §4.7; ADR-019, 030,
// 033, 053, 060, 062, 161, 166, 173, 236, 244, 295, 329 (6), 341).
//
// A ticket is its number and the field events recorded under it. They are grouped on project,
// workflow and bare number, a split's suffix stripped, and on nothing else: never the kind, the
// certification, the times or the debris type, which are tested once the group is found and never
// used to find it. Nothing reads meaning out of a number (ADR-046, 114).
//
// Nothing here measures how long a field event has waited, and nothing here looks at when a field
// event reached the server: a ticket missing a field event is PENDING for as long as it is
// missing (ADR-053).
import type { FieldEventKindName } from './field-event-details.ts';

// The three workflows whose field events make a ticket, as the database keeps them (ADR-062).
export const workflows = ['LOAD', 'HAUL_OUT', 'UNIT_RATE'] as const;
export type WorkflowName = (typeof workflows)[number];

// The statuses the worker sets. VOID is a person's, with a reason, or a rule's Void ticket
// action; there is no other status (ADR-060, 118).
export const workerStatuses = ['PENDING', 'COMPLETED', 'MANUAL_REVIEW'] as const;
export type WorkerStatus = (typeof workerStatuses)[number];

// What grouping reads of a field event. Whatever else a caller's record holds stays on it.
export interface GroupedFieldEvent {
  readonly id: string;
  readonly projectId: string;
  readonly workflow: WorkflowName;
  readonly kind: FieldEventKindName;
  // As scanned, shown or typed: the bare number.
  readonly ticketNumber: string;
  // Empty when not split.
  readonly splitSuffix: string;
  // The device's clock (ADR-100).
  readonly startedAt: Date;
  readonly endedAt: Date;
}

// A flag raised on a ticket's current facts, and whether a reviewer accepted it (ADR-166). A
// cleared flag isn't one of these: it is the ticket's history.
export interface RaisedFlag {
  readonly accepted: boolean;
}

// How a split's collections are lettered: the suffixes present, the ones skipped before the last
// of them, and whether a bare collection stands beside suffixed ones (the first is -A, never
// bare; ADR-033, 173, 295). The flag and its words are the checks' (spec/FLAGS.md,
// SPLIT_SUFFIX_GAP).
export interface SplitShape {
  readonly suffixes: readonly string[];
  readonly missing: readonly string[];
  readonly bareBesideSuffixed: boolean;
}

// The kinds a workflow's ticket is made of: the field event that makes the number, and the one
// that closes it. A unit rate ticket is its one field event.
const kindsOf: Record<
  WorkflowName,
  { readonly collection: FieldEventKindName | null; readonly closing: FieldEventKindName }
> = {
  LOAD: { collection: 'COLLECTION', closing: 'DISPOSAL' },
  HAUL_OUT: { collection: 'HAUL_OUT_COLLECTION', closing: 'HAUL_OUT_DISPOSAL' },
  UNIT_RATE: { collection: null, closing: 'UNIT_RATE' },
};

const kindWords: Record<FieldEventKindName, string> = {
  COLLECTION: 'collection',
  DISPOSAL: 'disposal',
  HAUL_OUT_COLLECTION: 'haul-out collection',
  HAUL_OUT_DISPOSAL: 'haul-out disposal',
  UNIT_RATE: 'unit rate event',
};

// A field event's place in field time: a disposal's start (when the truck reached the tower),
// any other's end (when the loading or the work was done).
const fieldTime = (event: GroupedFieldEvent): number =>
  event.kind === 'DISPOSAL' || event.kind === 'HAUL_OUT_DISPOSAL'
    ? event.startedAt.getTime()
    : event.endedAt.getTime();

const byText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

// Field time first; two at one instant in the order of their suffixes, then their ids, so the
// same field events always come out in the same order.
const inFieldOrder = (left: GroupedFieldEvent, right: GroupedFieldEvent): number =>
  fieldTime(left) - fieldTime(right) ||
  byText(left.splitSuffix, right.splitSuffix) ||
  byText(left.id, right.id);

// Where a suffix stands in A, B … Z, AA, AB …
const placeOf = (suffix: string): number => {
  let place = 0;
  for (let at = 0; at < suffix.length; at += 1) place = place * 26 + (suffix.charCodeAt(at) - 64);
  return place;
};

const suffixAt = (place: number): string => {
  let suffix = '';
  for (let left = place; left > 0; left = Math.floor((left - 1) / 26)) {
    suffix = String.fromCharCode(65 + ((left - 1) % 26)) + suffix;
  }
  return suffix;
};

// One ticket: its number and the field events recorded under it, in field order.
export class Ticket<E extends GroupedFieldEvent = GroupedFieldEvent> {
  readonly projectId: string;
  readonly workflow: WorkflowName;
  // The bare number, with no suffix.
  readonly ticketNumber: string;
  readonly events: readonly E[];
  // A load's or a haul-out's collections: one, or one for each property or pile of a split.
  readonly collections: readonly E[];
  // A load's disposal or a haul-out's; none while it is missing, and on a unit rate ticket.
  readonly disposal: E | null;
  // A unit rate ticket's one field event.
  readonly unitRate: E | null;

  // The field events of one project, workflow and bare number. A second field event of one kind
  // (of one suffix, for a collection) never gets here: it was quarantined at sync, and the
  // database holds one of each (ADR-022). Given one anyway, this is an error, not a guess at
  // which of the two is the ticket's.
  constructor(events: readonly E[]) {
    const [first] = events;
    if (first === undefined) throw new Error('A ticket has at least one field event.');
    this.projectId = first.projectId;
    this.workflow = first.workflow;
    this.ticketNumber = first.ticketNumber;
    this.events = [...events].sort(inFieldOrder);

    const places = new Set<string>();
    for (const event of this.events) {
      if (
        event.projectId !== this.projectId ||
        event.workflow !== this.workflow ||
        event.ticketNumber !== this.ticketNumber
      ) {
        throw new Error(
          `Ticket ${this.ticketNumber}: a field event of another project, workflow or number was put with it.`,
        );
      }
      const place = `${event.kind} ${event.splitSuffix}`;
      if (places.has(place)) {
        const number =
          event.splitSuffix === ''
            ? this.ticketNumber
            : `${this.ticketNumber}-${event.splitSuffix}`;
        throw new Error(
          `Ticket ${number}: two ${kindWords[event.kind]}s. The second belongs in quarantine.`,
        );
      }
      places.add(place);
    }

    const { collection, closing } = kindsOf[this.workflow];
    this.collections = this.events.filter((event) => event.kind === collection);
    const closed = this.events.find((event) => event.kind === closing) ?? null;
    this.disposal = this.workflow === 'UNIT_RATE' ? null : closed;
    this.unitRate = this.workflow === 'UNIT_RATE' ? closed : null;
  }

  // The kinds of field event the ticket still waits for: none when it is whole.
  get missing(): readonly FieldEventKindName[] {
    const { collection, closing } = kindsOf[this.workflow];
    const missing: FieldEventKindName[] = [];
    if (collection !== null && this.collections.length === 0) missing.push(collection);
    if (!this.events.some((event) => event.kind === closing)) missing.push(closing);
    return missing;
  }

  // Every field event it is made of is in: a collection (or several, on a split) and the
  // disposal; a unit rate ticket's one field event, whole by itself.
  get isWhole(): boolean {
    return this.missing.length === 0;
  }

  // Loaded at several properties, or from several piles: any collection with a suffix.
  get isSplit(): boolean {
    return this.collections.some((event) => event.splitSuffix !== '');
  }

  // How a split's collections are lettered; nothing to read on a ticket that isn't split.
  get splitShape(): SplitShape | null {
    if (!this.isSplit) return null;
    const suffixes = this.collections
      .map((event) => event.splitSuffix)
      .filter((suffix) => suffix !== '')
      .sort((left, right) => placeOf(left) - placeOf(right));
    const present = new Set(suffixes);
    const last = placeOf(suffixes.at(-1) ?? '');
    const missing: string[] = [];
    for (let place = 1; place < last; place += 1) {
      const suffix = suffixAt(place);
      if (!present.has(suffix)) missing.push(suffix);
    }
    return {
      suffixes,
      missing,
      bareBesideSuffixed: this.collections.some((event) => event.splitSuffix === ''),
    };
  }

  // A load's or a haul-out's time is its collection's end, each property's or pile's own on a
  // split (ADR-161): a preload dumped on Tuesday is Monday's. None while that collection is
  // missing, and none here for a unit rate ticket.
  timeOf(splitSuffix = ''): Date | null {
    return this.collections.find((event) => event.splitSuffix === splitSuffix)?.endedAt ?? null;
  }

  // The status the worker gives the ticket, from the flags raised on it now. A field event
  // missing: PENDING, whatever flags the one it has shows (ADR-244). Whole: MANUAL_REVIEW while
  // any flag is open, COMPLETED once every flag is fixed or accepted (ADR-060, 166). What a flag
  // does to the money is never read here: review doesn't hold it, and accepting doesn't change it.
  status(raised: readonly RaisedFlag[]): WorkerStatus {
    if (!this.isWhole) return 'PENDING';
    return raised.some((flag) => !flag.accepted) ? 'MANUAL_REVIEW' : 'COMPLETED';
  }
}

const digits = /^\d+$/;

// Field events gathered into their tickets.
export class Tickets<E extends GroupedFieldEvent = GroupedFieldEvent> {
  // Every ticket, in the order of project, workflow and number: the same whatever order the
  // field events were given in.
  readonly tickets: readonly Ticket<E>[];
  // Field events whose ticket number isn't digits: kept, in no ticket, and paired with nothing
  // until a person renumbers them (ADR-329 (6)). Their flag is the checks'.
  readonly notTicketNumbers: readonly E[];

  constructor(events: readonly E[]) {
    const groups = new Map<string, E[]>();
    const apart: E[] = [];
    for (const event of events) {
      if (!digits.test(event.ticketNumber)) {
        apart.push(event);
        continue;
      }
      const key = JSON.stringify([event.projectId, event.workflow, event.ticketNumber]);
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [event]);
      else group.push(event);
    }
    this.tickets = [...groups.values()]
      .map((group) => new Ticket(group))
      .sort(
        (left, right) =>
          byText(left.projectId, right.projectId) ||
          workflows.indexOf(left.workflow) - workflows.indexOf(right.workflow) ||
          left.ticketNumber.length - right.ticketNumber.length ||
          byText(left.ticketNumber, right.ticketNumber),
      );
    this.notTicketNumbers = apart.sort(inFieldOrder);
  }

  // The tickets still missing a field event: looked at on every run, listed, never flagged for
  // waiting and never expired (ADR-053).
  get pending(): readonly Ticket<E>[] {
    return this.tickets.filter((ticket) => !ticket.isWhole);
  }

  // One ticket, by what groups it.
  find(projectId: string, workflow: WorkflowName, ticketNumber: string): Ticket<E> | null {
    return (
      this.tickets.find(
        (ticket) =>
          ticket.projectId === projectId &&
          ticket.workflow === workflow &&
          ticket.ticketNumber === ticketNumber,
      ) ?? null
    );
  }
}
