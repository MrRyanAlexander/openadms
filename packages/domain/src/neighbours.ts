// A ticket's neighbours: the other tickets whose conclusions read its field events
// (ARCHITECTURE §13, "Jobs, not requests"; adms-validation §5.2…§5.3; BACKLOG C95; ADR-027, 159,
// 175, 192, 360, 420). The worker's run works only the tickets a job names, so a change to one
// ticket must name these too, or what stands on them goes stale: a flag that should clear, a
// share of a weight that is money.
//
// Four things make two tickets neighbours, and nothing else does:
// - two loads whose collections scanned one certification and whose loading times overlap (a
//   truck has one open load at a time);
// - two crew-time tickets of one crew (its certification) whose times overlap, or that fall on
//   the same day of the project, where each item's hours are added over the crew's day;
// - two tickets whose field events point at one scale receipt (its weight is shared by
//   certified capacity, and its debris types are compared);
// - a load and a unit rate ticket it lists as carried, read from the load's side only (the load
//   takes its count and its stump CY from the ticket; the ticket reads nothing of the load), and
//   two loads that list the same carried ticket.
//
// A split's other properties are the ticket's own field events, never neighbours. A renumber's
// two numbers are both the change's own tickets.
//
// The two overlaps are the checks' own tests, asked here (`timesOverlap`), so they can't drift.
import { ProjectClock } from './project-clock.ts';
import type { FieldEventKindName } from './field-event-details.ts';
import type { WorkflowName } from './tickets.ts';

// A ticket as the worker groups one: its project's workflow and bare number.
export interface TicketKey {
  readonly workflow: WorkflowName;
  readonly ticketNumber: string;
}

// What the neighbours are found from: a field event's ticket and the four things above.
export interface NeighbourEvent extends TicketKey {
  readonly kind: FieldEventKindName;
  readonly certNumber: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  // A unit rate event whose kind of work is counted as hours by item.
  readonly crewTime: boolean;
  readonly scaleReceiptId: string | null;
  // The tickets a load's collection lists as carried; one taken off is left out.
  readonly carriedTicketNumbers: readonly string[];
}

// Two stretches of time that can't both be true of one truck or one crew: each starts before
// the other ends. Touching ends don't overlap.
export function timesOverlap(
  one: { readonly startedAt: Date; readonly endedAt: Date },
  other: { readonly startedAt: Date; readonly endedAt: Date },
): boolean {
  return (
    one.startedAt.getTime() < other.endedAt.getTime() &&
    other.startedAt.getTime() < one.endedAt.getTime()
  );
}

const keyOf = (ticket: TicketKey): string => JSON.stringify([ticket.workflow, ticket.ticketNumber]);

export class TicketNeighbours {
  private readonly clock: ProjectClock;
  private readonly events: readonly NeighbourEvent[];

  // `events`: the field events the checks read (a void ticket's are in no other ticket's
  // checks, so they are left out), and the changed tickets' own, whatever their status.
  constructor(timeZone: string, events: readonly NeighbourEvent[]) {
    this.clock = new ProjectClock(timeZone);
    this.events = events;
  }

  // The other tickets that read one of these, each once, in the order found; never one of the
  // tickets asked about.
  of(tickets: readonly TicketKey[]): TicketKey[] {
    const asked = new Set(tickets.map(keyOf));
    const own = this.events.filter((event) => asked.has(keyOf(event)));
    const found = new Map<string, TicketKey>();
    for (const other of this.events) {
      const key = keyOf(other);
      if (asked.has(key) || found.has(key)) continue;
      if (own.some((event) => this.reads(other, event))) {
        found.set(key, { workflow: other.workflow, ticketNumber: other.ticketNumber });
      }
    }
    return [...found.values()];
  }

  // Whether the other ticket's conclusions read this field event, or this one's the other's.
  private reads(other: NeighbourEvent, event: NeighbourEvent): boolean {
    if (
      event.kind === 'COLLECTION' &&
      other.kind === 'COLLECTION' &&
      event.certNumber === other.certNumber &&
      timesOverlap(event, other)
    ) {
      return true;
    }
    if (
      event.crewTime &&
      other.crewTime &&
      event.certNumber === other.certNumber &&
      (timesOverlap(event, other) ||
        this.clock.day(event.endedAt) === this.clock.day(other.endedAt))
    ) {
      return true;
    }
    if (event.scaleReceiptId !== null && event.scaleReceiptId === other.scaleReceiptId) return true;
    // The load reads the ticket it carries; the carried ticket reads nothing of the load.
    if (
      event.kind === 'UNIT_RATE' &&
      other.kind === 'COLLECTION' &&
      other.carriedTicketNumbers.includes(event.ticketNumber)
    ) {
      return true;
    }
    return (
      event.kind === 'COLLECTION' &&
      other.kind === 'COLLECTION' &&
      event.carriedTicketNumbers.some((number) => other.carriedTicketNumbers.includes(number))
    );
  }
}
