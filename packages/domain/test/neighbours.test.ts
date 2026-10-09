// A ticket's neighbours: the other tickets whose conclusions read its field events, which a
// change to it must queue too (BACKLOG C95; ADR-420; spec/acceptance/10-api-and-sync.md
// AC-10-54; AC-08-34's overlap). The tickets are the example world's: P1's Monday 12 and Tuesday
// 13 October 2026 in Bayline County.
import { describe, expect, it } from 'vitest';

import {
  TicketNeighbours,
  timesOverlap,
  type FieldEventKindName,
  type NeighbourEvent,
  type WorkflowName,
} from '../src/index.ts';

const timeZone = 'America/New_York';
const at = (day: string, time: string): Date => new Date(`2026-10-${day}T${time}:00-04:00`);

const workflowOf: Record<FieldEventKindName, WorkflowName> = {
  COLLECTION: 'LOAD',
  DISPOSAL: 'LOAD',
  HAUL_OUT_COLLECTION: 'HAUL_OUT',
  HAUL_OUT_DISPOSAL: 'HAUL_OUT',
  UNIT_RATE: 'UNIT_RATE',
};

function recorded(
  kind: FieldEventKindName,
  ticketNumber: string,
  from: Date,
  to: Date,
  more: Partial<NeighbourEvent> = {},
): NeighbourEvent {
  return {
    workflow: workflowOf[kind],
    kind,
    ticketNumber,
    certNumber: '730415',
    startedAt: from,
    endedAt: to,
    crewTime: false,
    scaleReceiptId: null,
    carriedTicketNumbers: [],
    ...more,
  };
}

const numbers = (events: readonly NeighbourEvent[], ...asked: [WorkflowName, string][]): string[] =>
  new TicketNeighbours(timeZone, events)
    .of(asked.map(([workflow, ticketNumber]) => ({ workflow, ticketNumber })))
    .map((ticket) => `${ticket.workflow} ${ticket.ticketNumber}`);

describe('the overlap both checks ask', () => {
  it('each starts before the other ends; ends that touch don’t overlap', () => {
    const loading = { startedAt: at('12', '09:10'), endedAt: at('12', '09:40') };
    expect(
      timesOverlap(loading, { startedAt: at('12', '09:30'), endedAt: at('12', '10:00') }),
    ).toBe(true);
    expect(
      timesOverlap(loading, { startedAt: at('12', '09:40'), endedAt: at('12', '10:00') }),
    ).toBe(false);
    expect(
      timesOverlap(loading, { startedAt: at('12', '08:00'), endedAt: at('12', '09:10') }),
    ).toBe(false);
  });
});

describe('a ticket’s neighbours', () => {
  it('AC-10-54 a load’s neighbour is the other load on its truck whose loading overlaps: voiding the phantom 101031 queues 101030, and no other', () => {
    const events = [
      recorded('COLLECTION', '101030', at('13', '10:05'), at('13', '10:35')),
      recorded('DISPOSAL', '101030', at('13', '11:00'), at('13', '11:04')),
      recorded('COLLECTION', '101031', at('13', '10:20'), at('13', '10:50')),
      // The same truck, later that day: no overlap.
      recorded('COLLECTION', '101032', at('13', '13:00'), at('13', '13:30')),
      // Another truck at the same time.
      recorded('COLLECTION', '101033', at('13', '10:20'), at('13', '10:50'), {
        certNumber: '730416',
      }),
    ];
    expect(numbers(events, ['LOAD', '101031'])).toEqual(['LOAD 101030']);
    expect(numbers(events, ['LOAD', '101030'])).toEqual(['LOAD 101031']);
    expect(numbers(events, ['LOAD', '101032'])).toEqual([]);
  });

  it('a haul-out and a unit rate ticket on the same certification at the same time are no load’s neighbours', () => {
    const events = [
      recorded('COLLECTION', '101001', at('12', '09:10'), at('12', '09:40')),
      recorded('HAUL_OUT_COLLECTION', '201001', at('12', '09:10'), at('12', '09:40')),
      recorded('UNIT_RATE', '301001', at('12', '09:10'), at('12', '09:40')),
    ];
    expect(numbers(events, ['LOAD', '101001'])).toEqual([]);
  });

  it('two crew-time tickets of one crew are neighbours where their times overlap or they fall on one day of the project: the crew’s day adds each item’s hours', () => {
    const crew = { certNumber: '730431', crewTime: true };
    const events = [
      recorded('UNIT_RATE', '301010', at('12', '07:00'), at('12', '11:00'), crew),
      recorded('UNIT_RATE', '301011', at('12', '12:00'), at('12', '16:00'), crew),
      recorded('UNIT_RATE', '301012', at('13', '07:00'), at('13', '11:00'), crew),
      // Another crew that Monday.
      recorded('UNIT_RATE', '301013', at('12', '07:00'), at('12', '11:00'), {
        certNumber: '730432',
        crewTime: true,
      }),
      // The same certification, not crew time.
      recorded('UNIT_RATE', '301014', at('12', '07:00'), at('12', '11:00'), {
        certNumber: '730431',
      }),
    ];
    expect(numbers(events, ['UNIT_RATE', '301010'])).toEqual(['UNIT_RATE 301011']);
    expect(numbers(events, ['UNIT_RATE', '301012'])).toEqual([]);
  });

  it('a crew’s day is the project’s: 11 pm on Monday in Bayline County is Monday’s, though it is Tuesday in UTC', () => {
    const crew = { certNumber: '730431', crewTime: true };
    const events = [
      recorded('UNIT_RATE', '301010', at('12', '07:00'), at('12', '11:00'), crew),
      recorded('UNIT_RATE', '301015', at('12', '21:00'), at('12', '23:00'), crew),
      recorded('UNIT_RATE', '301016', at('13', '00:30'), at('13', '02:00'), crew),
    ];
    expect(numbers(events, ['UNIT_RATE', '301015'])).toEqual(['UNIT_RATE 301010']);
  });

  it('two containers weighed on one scale receipt are neighbours: each one’s share of the weight moves with the other’s', () => {
    const events = [
      recorded('HAUL_OUT_COLLECTION', '201002', at('13', '08:00'), at('13', '08:20')),
      recorded('HAUL_OUT_DISPOSAL', '201002', at('13', '09:00'), at('13', '09:10'), {
        scaleReceiptId: 'receipt-48213',
      }),
      recorded('HAUL_OUT_DISPOSAL', '201003', at('13', '09:00'), at('13', '09:10'), {
        certNumber: '730416',
        scaleReceiptId: 'receipt-48213',
      }),
      recorded('HAUL_OUT_DISPOSAL', '201004', at('13', '09:30'), at('13', '09:40'), {
        certNumber: '730417',
        scaleReceiptId: 'receipt-48214',
      }),
    ];
    expect(numbers(events, ['HAUL_OUT', '201002'])).toEqual(['HAUL_OUT 201003']);
    expect(numbers(events, ['HAUL_OUT', '201004'])).toEqual([]);
  });

  it('a load reads the unit rate tickets it carries, never the other way: a change to stump ticket 301020 queues the load that lists it; a change to the load queues no stump ticket', () => {
    const events = [
      recorded('COLLECTION', '101040', at('13', '14:00'), at('13', '14:30'), {
        certNumber: '730417',
        carriedTicketNumbers: ['301020', '301021'],
      }),
      recorded('UNIT_RATE', '301020', at('13', '09:00'), at('13', '09:20'), {
        certNumber: '730432',
      }),
      recorded('UNIT_RATE', '301021', at('13', '10:00'), at('13', '10:20'), {
        certNumber: '730432',
      }),
    ];
    expect(numbers(events, ['UNIT_RATE', '301020'])).toEqual(['LOAD 101040']);
    expect(numbers(events, ['LOAD', '101040'])).toEqual([]);
  });

  it('two loads that list the same carried ticket are neighbours: each is flagged for the other', () => {
    const events = [
      recorded('COLLECTION', '101040', at('13', '14:00'), at('13', '14:30'), {
        certNumber: '730417',
        carriedTicketNumbers: ['301020'],
      }),
      recorded('COLLECTION', '101041', at('13', '15:00'), at('13', '15:30'), {
        certNumber: '730416',
        carriedTicketNumbers: ['301020'],
      }),
    ];
    expect(numbers(events, ['LOAD', '101040'])).toEqual(['LOAD 101041']);
  });

  it('a ticket asked about is never its own neighbour, nor another asked about; each neighbour is named once', () => {
    const events = [
      recorded('COLLECTION', '102001', at('13', '10:00'), at('13', '10:20')),
      recorded('COLLECTION', '102001', at('13', '10:25'), at('13', '10:45')),
      recorded('COLLECTION', '101030', at('13', '10:05'), at('13', '10:40')),
      recorded('COLLECTION', '101031', at('13', '10:30'), at('13', '10:50')),
    ];
    // A split's two properties overlap 101030 twice over, and 101031 once.
    expect(numbers(events, ['LOAD', '102001'])).toEqual(['LOAD 101030', 'LOAD 101031']);
    expect(numbers(events, ['LOAD', '102001'], ['LOAD', '101030'])).toEqual(['LOAD 101031']);
  });
});
