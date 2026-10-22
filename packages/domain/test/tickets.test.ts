// Which field events are one ticket, its shape and its status (spec/acceptance/06-reconciliation.md
// sections B and C, AC-06-125, 142, 143, 160; ADR-341). The tickets are the golden mission's
// (spec/golden/MISSION.md §2, §3): P1's Monday 12 and Tuesday 13 October 2026, P2's split load.
import { describe, expect, it } from 'vitest';

import {
  Ticket,
  Tickets,
  kindsOfWorkflow,
  workerStatuses,
  type FieldEventKindName,
  type GroupedFieldEvent,
  type WorkflowName,
} from '../src/index.ts';

const p1 = '0199a000-0000-7000-8000-0000000000a1';
const p2 = '0199a000-0000-7000-8000-0000000000a2';

const days = { Mon: '2026-10-12', Tue: '2026-10-13', Wed: '2026-10-14' } as const;
// A time on the device's clock in Bayline County, four hours behind UTC in October.
const at = (day: keyof typeof days, time: string): Date =>
  new Date(`${days[day]}T${time}:00-04:00`);

const workflowOf: Record<FieldEventKindName, WorkflowName> = {
  COLLECTION: 'LOAD',
  DISPOSAL: 'LOAD',
  HAUL_OUT_COLLECTION: 'HAUL_OUT',
  HAUL_OUT_DISPOSAL: 'HAUL_OUT',
  UNIT_RATE: 'UNIT_RATE',
};

interface Recorded extends GroupedFieldEvent {
  // What a caller's record holds beside what grouping reads: kept on it, never used to group.
  readonly certNumber: string;
  readonly debrisType: string;
}

let made = 0;
// A field event as written "101001" or "102001-A", from its start to its end.
function recorded(
  kind: FieldEventKindName,
  written: string,
  startedAt: Date,
  endedAt: Date,
  more: Partial<Recorded> = {},
): Recorded {
  const [ticketNumber = '', splitSuffix = ''] = written.split('-');
  made += 1;
  return {
    id: `0199b000-0000-7000-8000-${String(made).padStart(12, '0')}`,
    projectId: p1,
    workflow: workflowOf[kind],
    kind,
    ticketNumber,
    splitSuffix,
    startedAt,
    endedAt,
    certNumber: '730415',
    debrisType: 'Vegetative',
    ...more,
  };
}

const collection = (written: string, end: Date, more: Partial<Recorded> = {}): Recorded =>
  recorded('COLLECTION', written, new Date(end.getTime() - 30 * 60_000), end, more);
const disposal = (written: string, start: Date, more: Partial<Recorded> = {}): Recorded =>
  recorded('DISPOSAL', written, start, new Date(start.getTime() + 10 * 60_000), more);
const pile = (written: string, end: Date): Recorded =>
  recorded('HAUL_OUT_COLLECTION', written, new Date(end.getTime() - 10 * 60_000), end, {
    certNumber: '730419',
    debrisType: 'Mulch',
  });

const open = { accepted: false };
const accepted = { accepted: true };

const writtenOf = (events: readonly GroupedFieldEvent[]): string[] =>
  events.map((event) =>
    event.splitSuffix === '' ? event.ticketNumber : `${event.ticketNumber}-${event.splitSuffix}`,
  );

describe('which field events are one ticket', () => {
  it('AC-06-07 a collection and a disposal on one number of one project are one ticket', () => {
    const col = collection('101001', at('Mon', '08:40'));
    const dis = disposal('101001', at('Mon', '09:25'));
    const { tickets, notTicketNumbers } = new Tickets([col, dis]);

    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ projectId: p1, workflow: 'LOAD', ticketNumber: '101001' });
    expect(tickets[0]?.collections).toEqual([col]);
    expect(tickets[0]?.disposal).toBe(dis);
    expect(tickets[0]?.isWhole).toBe(true);
    expect(notTicketNumbers).toEqual([]);
  });

  it('AC-06-08 a haul-out collection on the same number is never grouped with the load: the workflow is part of the group', () => {
    const all = new Tickets([
      collection('101001', at('Mon', '08:40')),
      disposal('101001', at('Mon', '09:25')),
      pile('101001', at('Mon', '09:00')),
    ]);

    expect(all.tickets.map((ticket) => [ticket.workflow, ticket.events.length])).toEqual([
      ['LOAD', 2],
      ['HAUL_OUT', 1],
    ]);
    expect(all.find(p1, 'HAUL_OUT', '101001')?.missing).toEqual(['HAUL_OUT_DISPOSAL']);
  });

  it('AC-06-09 a collection of the same number on P2 is never grouped with P1’s: a number is its project’s', () => {
    const all = new Tickets([
      disposal('101001', at('Mon', '09:25')),
      collection('101001', at('Mon', '08:40'), { projectId: p2 }),
    ]);

    expect(all.tickets).toHaveLength(2);
    expect(all.find(p1, 'LOAD', '101001')?.missing).toEqual(['COLLECTION']);
    expect(all.find(p2, 'LOAD', '101001')?.missing).toEqual(['DISPOSAL']);
  });

  it('AC-06-10 nothing but the number finds a partner: the same truck, debris type and forty minutes apart pair nothing', () => {
    const same = { certNumber: '730416', debrisType: 'Vegetative' };
    const all = new Tickets([
      collection('101006', at('Tue', '11:30'), same),
      disposal('101060', at('Tue', '12:10'), same),
    ]);

    expect(all.tickets.map((ticket) => ticket.ticketNumber)).toEqual(['101006', '101060']);
    expect(all.tickets.map((ticket) => ticket.status([]))).toEqual(['PENDING', 'PENDING']);
    expect(all.pending).toHaveLength(2);
  });

  it('AC-06-11 a split’s suffix is stripped to find the group; the number as written would leave three groups of one', () => {
    const events = [
      collection('102001-A', at('Mon', '09:10'), { projectId: p2, certNumber: '730416' }),
      collection('102001-B', at('Mon', '09:50'), { projectId: p2, certNumber: '730416' }),
      disposal('102001', at('Mon', '10:30'), { projectId: p2, certNumber: '730416' }),
    ];
    const { tickets } = new Tickets(events);

    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.ticketNumber).toBe('102001');
    expect(writtenOf(tickets[0]?.events ?? [])).toEqual(['102001-A', '102001-B', '102001']);
    expect(new Set(writtenOf(events)).size).toBe(3);
  });

  it('AC-06-12 a ticket’s field events are in field order, a collection’s end and a disposal’s start, however they were handed over', () => {
    // The disposal started at 09:25, before the 09:40 a late-finished collection would end at.
    const col = collection('101001', at('Mon', '08:40'));
    const dis = disposal('101001', at('Mon', '09:25'));
    for (const order of [
      [col, dis],
      [dis, col],
    ]) {
      expect(new Ticket(order).events).toEqual([col, dis]);
    }

    // A disposal is placed by its start, not its end: one that started 09:12 and ended 09:50
    // comes before a collection that ended 09:40.
    const early = recorded('DISPOSAL', '101008', at('Mon', '09:12'), at('Mon', '09:50'));
    const late = collection('101008', at('Mon', '09:40'));
    expect(new Ticket([late, early]).events).toEqual([early, late]);
  });

  it('the same field events give the same tickets in the same order, whatever order they come in', () => {
    const events = [
      collection('101001', at('Mon', '08:40')),
      disposal('101001', at('Mon', '09:25')),
      collection('101002', at('Mon', '10:10')),
      pile('201004-B', at('Tue', '15:45')),
      pile('201004-A', at('Tue', '15:30')),
      recorded('UNIT_RATE', '301001', at('Mon', '13:00'), at('Mon', '13:20')),
      collection('102001-A', at('Mon', '09:10'), { projectId: p2 }),
    ];
    const read = (given: readonly Recorded[]): unknown =>
      new Tickets(given).tickets.map((ticket) => [
        ticket.projectId,
        ticket.workflow,
        ticket.ticketNumber,
        ticket.events.map((event) => event.id),
      ]);

    expect(read([...events].reverse())).toEqual(read(events));
    expect(new Tickets(events).tickets.map((ticket) => ticket.ticketNumber)).toEqual([
      '101001',
      '101002',
      '201004',
      '301001',
      '102001',
    ]);
  });

  it('AC-06-160 a ticket number that isn’t digits is in no ticket and pairs with nothing, even with one written the same', () => {
    const col = collection('10l006', at('Tue', '11:30'));
    const dis = disposal('10l006', at('Tue', '12:10'));
    const all = new Tickets([dis, col, collection('', at('Tue', '12:30'))]);

    expect(all.tickets).toEqual([]);
    expect(all.notTicketNumbers.map((event) => event.ticketNumber)).toEqual([
      '10l006',
      '10l006',
      '',
    ]);
    expect(all.pending).toEqual([]);
  });

  it('a second field event of one kind on a ticket is an error, never a guess: it belongs in quarantine', () => {
    expect(
      () =>
        new Tickets([
          collection('101020', at('Mon', '10:00')),
          disposal('101020', at('Mon', '10:22')),
          disposal('101020', at('Mon', '10:58')),
        ]),
    ).toThrow('Ticket 101020: two disposals. The second belongs in quarantine.');
    expect(
      () =>
        new Tickets([
          collection('102001-A', at('Mon', '09:10')),
          collection('102001-A', at('Mon', '09:50')),
        ]),
    ).toThrow('Ticket 102001-A: two collections. The second belongs in quarantine.');
  });
});

describe('a ticket’s shape', () => {
  it('AC-06-19 a split load is one load with a collection for each property', () => {
    const a = collection('102001-A', at('Mon', '09:10'), { projectId: p2 });
    const b = collection('102001-B', at('Mon', '09:50'), { projectId: p2 });
    const dis = disposal('102001', at('Mon', '10:30'), { projectId: p2 });
    const ticket = new Ticket([dis, b, a]);

    expect(ticket.collections).toEqual([a, b]);
    expect(ticket.disposal).toBe(dis);
    expect(ticket.isSplit).toBe(true);
    expect(ticket.isWhole).toBe(true);
    expect(ticket.splitShape).toEqual({
      suffixes: ['A', 'B'],
      missing: [],
      bareBesideSuffixed: false,
    });
  });

  it('AC-06-21 a split haul-out is one haul-out with a haul-out collection for each pile', () => {
    const piles = [
      pile('201004-A', at('Tue', '15:30')),
      pile('201004-B', at('Tue', '15:45')),
      pile('201004-C', at('Tue', '16:05')),
    ];
    const dump = recorded('HAUL_OUT_DISPOSAL', '201004', at('Tue', '17:15'), at('Tue', '17:30'));
    const ticket = new Ticket([dump, ...piles]);

    expect(ticket.workflow).toBe('HAUL_OUT');
    expect(ticket.collections).toEqual(piles);
    expect(ticket.disposal).toBe(dump);
    expect(ticket.isWhole).toBe(true);
    expect(ticket.splitShape?.suffixes).toEqual(['A', 'B', 'C']);
    expect(ticket.timeOf('C')).toEqual(at('Tue', '16:05'));
  });

  it('AC-06-22 a unit rate event is a whole ticket by itself, with no collection and no disposal', () => {
    const work = recorded('UNIT_RATE', '301001', at('Mon', '13:00'), at('Mon', '13:20'), {
      certNumber: '730417',
    });
    const ticket = new Ticket([work]);

    expect(ticket.unitRate).toBe(work);
    expect(ticket.collections).toEqual([]);
    expect(ticket.disposal).toBeNull();
    expect(ticket.missing).toEqual([]);
    expect(ticket.splitShape).toBeNull();
    expect(ticket.status([])).toBe('COMPLETED');
  });

  it('an ordinary load has no split to read', () => {
    const ticket = new Ticket([
      collection('101001', at('Mon', '08:40')),
      disposal('101001', at('Mon', '09:25')),
    ]);

    expect(ticket.isSplit).toBe(false);
    expect(ticket.splitShape).toBeNull();
    expect(ticket.unitRate).toBeNull();
  });

  it('a split’s lettering is read: a suffix skipped, and a bare collection beside suffixed ones (the flag is the checks’)', () => {
    const gap = new Ticket([
      collection('102001-A', at('Mon', '09:10')),
      collection('102001-C', at('Mon', '09:50')),
      disposal('102001', at('Mon', '10:30')),
    ]);
    expect(gap.splitShape).toEqual({
      suffixes: ['A', 'C'],
      missing: ['B'],
      bareBesideSuffixed: false,
    });

    const bare = new Ticket([
      collection('102001', at('Mon', '09:10')),
      collection('102001-A', at('Mon', '09:50')),
    ]);
    expect(bare.splitShape).toEqual({ suffixes: ['A'], missing: [], bareBesideSuffixed: true });

    // The first is -A: a split that starts at -C skipped two. After -Z comes -AA.
    expect(new Ticket([collection('102001-C', at('Mon', '09:10'))]).splitShape?.missing).toEqual([
      'A',
      'B',
    ]);
    const long = new Ticket([
      collection('102001-Y', at('Mon', '09:10')),
      collection('102001-AB', at('Mon', '09:50')),
    ]);
    expect(long.splitShape?.suffixes).toEqual(['Y', 'AB']);
    expect(long.splitShape?.missing.slice(-3)).toEqual(['X', 'Z', 'AA']);
    expect(long.splitShape?.missing).toHaveLength(26);
  });

  it('AC-06-125 a preload’s time is its collection’s end: Monday’s, though it was dumped on Tuesday, and nothing here measures the night', () => {
    const ticket = new Ticket([
      disposal('101004', at('Tue', '07:15'), { certNumber: '730416' }),
      collection('101004', at('Mon', '17:50'), { certNumber: '730416' }),
    ]);

    expect(ticket.timeOf()).toEqual(at('Mon', '17:50'));
    expect(ticket.status([])).toBe('COMPLETED');
    // A split's is each property's own; a ticket with no collection yet has none.
    expect(ticket.timeOf('A')).toBeNull();
    expect(new Ticket([disposal('101005', at('Tue', '10:40'))]).timeOf()).toBeNull();
  });
});

describe('the status the worker gives a ticket', () => {
  it('AC-06-13 a collection whose disposal isn’t in is PENDING, and waits for a disposal', () => {
    const ticket = new Ticket([collection('101005', at('Tue', '10:05'))]);

    expect(ticket.isWhole).toBe(false);
    expect(ticket.missing).toEqual(['DISPOSAL']);
    expect(ticket.status([])).toBe('PENDING');
  });

  it('AC-06-14 disposals whose collections haven’t synced are each PENDING and listed as pending', () => {
    const all = new Tickets([
      disposal('101001', at('Mon', '09:25')),
      disposal('101002', at('Mon', '10:50'), { certNumber: '730416' }),
      disposal('101003', at('Mon', '12:05')),
    ]);

    expect(all.pending.map((ticket) => [ticket.ticketNumber, ticket.missing])).toEqual([
      ['101001', ['COLLECTION']],
      ['101002', ['COLLECTION']],
      ['101003', ['COLLECTION']],
    ]);
    expect(all.pending.map((ticket) => ticket.status([]))).toEqual([
      'PENDING',
      'PENDING',
      'PENDING',
    ]);
  });

  it('AC-06-15 a lone collection read the same day, the next day and a month later is PENDING each time: nothing takes a clock', () => {
    const lone = collection('101005', at('Tue', '10:05'));
    // Grouping and status are given the field events and the flags, and no "now" to age them by.
    expect(Ticket.length).toBe(1);
    expect(Ticket.prototype.status.length).toBe(1);
    for (let run = 0; run < 3; run += 1) {
      const all = new Tickets([lone]);
      expect(all.pending).toHaveLength(1);
      expect(all.tickets[0]?.status([])).toBe('PENDING');
    }
  });

  it('AC-06-17 a lone disposal that shows its own flag stays PENDING, not MANUAL_REVIEW, until it is whole', () => {
    const ticket = new Ticket([disposal('101060', at('Tue', '12:10'), { certNumber: '730416' })]);

    expect(ticket.status([open])).toBe('PENDING');
    expect(ticket.status([accepted])).toBe('PENDING');
  });

  it('AC-06-20 a split whose collections are in and whose disposal isn’t is PENDING', () => {
    const ticket = new Ticket([
      collection('102001-A', at('Mon', '09:10'), { projectId: p2 }),
      collection('102001-B', at('Mon', '09:50'), { projectId: p2 }),
    ]);

    expect(ticket.missing).toEqual(['DISPOSAL']);
    expect(ticket.status([])).toBe('PENDING');
  });

  it('AC-06-23 a whole ticket with an open flag is MANUAL_REVIEW; with none, COMPLETED', () => {
    const ticket = new Ticket([
      collection('101003', at('Mon', '11:30')),
      disposal('101003', at('Mon', '12:05')),
    ]);

    expect(ticket.status([open])).toBe('MANUAL_REVIEW');
    expect(ticket.status([])).toBe('COMPLETED');
  });

  it('AC-06-24 the worker sets only PENDING, COMPLETED or MANUAL_REVIEW: never VOID, and nothing else', () => {
    expect(workerStatuses).toEqual(['PENDING', 'COMPLETED', 'MANUAL_REVIEW']);

    const whole = new Ticket([
      collection('101003', at('Mon', '11:30')),
      disposal('101003', at('Mon', '12:05')),
    ]);
    const lone = new Ticket([collection('101005', at('Tue', '10:05'))]);
    const given = [[], [open], [accepted], [open, accepted], [open, open]];
    const set = new Set(given.flatMap((flags) => [whole.status(flags), lone.status(flags)]));
    expect([...set].sort()).toEqual(['COMPLETED', 'MANUAL_REVIEW', 'PENDING']);
  });

  it('AC-06-142 two open flags, one accepted: still MANUAL_REVIEW; every flag fixed or accepted: COMPLETED', () => {
    const ticket = new Ticket([
      collection('101008', at('Mon', '09:40')),
      disposal('101008', at('Mon', '10:20')),
    ]);

    expect(ticket.status([open, open])).toBe('MANUAL_REVIEW');
    expect(ticket.status([accepted, open])).toBe('MANUAL_REVIEW');
    expect(ticket.status([accepted, accepted])).toBe('COMPLETED');
    // One fixed (cleared, so no longer raised) and the other accepted.
    expect(ticket.status([accepted])).toBe('COMPLETED');
  });

  it('AC-06-143 an accepted flag that bills nothing still leaves the ticket COMPLETED: what a flag does to the money is never read', () => {
    const ticket = new Ticket([
      collection('101009', at('Mon', '09:40')),
      disposal('101009', at('Mon', '10:20')),
    ]);
    const zeroCall = { accepted: true, billing: 'NOT_BILLED' };

    expect(ticket.status([zeroCall])).toBe('COMPLETED');
    expect(ticket.status([{ ...zeroCall, accepted: false }])).toBe('MANUAL_REVIEW');
  });
});

describe('the kinds a workflow’s ticket holds', () => {
  it('ADR-156, 236 a load is a collection then a disposal, a haul-out its two ends, a unit rate ticket its one field event: what the back office may make under a number', () => {
    expect(kindsOfWorkflow).toEqual({
      LOAD: ['COLLECTION', 'DISPOSAL'],
      HAUL_OUT: ['HAUL_OUT_COLLECTION', 'HAUL_OUT_DISPOSAL'],
      UNIT_RATE: ['UNIT_RATE'],
    });
  });
});
