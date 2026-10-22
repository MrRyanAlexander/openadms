// The time clock on the phone (src/phone/clock.ts; BACKLOG 3.7.2, REQ-310; AC-02-50, 52;
// ADR-241, 598, 601): a worker's clock-in, breaks and clock-out by hand on their assignment, each
// kept sealed to send as the sync's `CLOCK_ENTRY` with the clock's own note beside it in one
// piece of work; where they stand read again after a restart; only what comes next entered; the
// day's activity pre-filled a line an hour from the field events they submitted on the
// assignment, carried by the clock-out with what they picked from the firm's list. Here over a
// store in memory; through the screens against the real API, e2e/clock.e2e.ts.
import type { PhoneAssignmentAnswer, PhoneListsRecord, SyncedRecord } from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { PhoneClock, type ClockOf } from '../src/phone/clock.ts';
import { PhoneLists } from '../src/phone/lists.ts';
import type { MonitorOnPhone } from '../src/phone/monitor.ts';
import { PhoneOutbox } from '../src/phone/outbox.ts';
import { PhoneTickets, type Begun } from '../src/phone/tickets.ts';
import type { Json } from '../src/store/phone-store.ts';
import { noLists } from './checks.ts';
import { HeldStore } from './held.ts';
import { ana, kim, p1 } from './phone-world.ts';

const travel = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d51';
const vegetative = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d42';
const collections: PhoneAssignmentAnswer = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d41',
  workDate: '2026-10-19',
  project: p1,
  fieldEventKinds: ['COLLECTION'],
  certifying: false,
  formDocumentTypes: [],
  site: null,
};
const lists: PhoneListsRecord = {
  ...noLists,
  blocks: [
    {
      series: 'LOAD',
      firstNumber: 101001,
      lastNumber: 102000,
      lastUsedNumber: null,
      status: 'ISSUED',
    },
  ],
  timeClock: { enabled: true, activities: [{ id: travel, name: 'Travel' }] },
};
const anaOnP1: ClockOf = { workerId: ana.id, assignment: collections };

// Monday 19 October 2026 in Bayline County, by its hour and minute there.
const at = (time: string): Date => new Date(`2026-10-19T${time}:00-04:00`);

// A phone holding Ana's lists, its outbox, its tickets and its clock over one store, on a clock
// the test moves.
async function phone(store = new HeldStore()) {
  const clock = { now: at('06:00') };
  const now = () => clock.now;
  if ((await store.read('lists', 'assignment')) === undefined) {
    await store.change([
      {
        shelf: 'lists',
        id: 'assignment',
        value: {
          assignment: collections,
          noAssignment: null,
          lists,
          monitorId: ana.id,
          readAt: '2026-10-19T10:00:00.000Z',
        } as unknown as Json,
      },
    ]);
  }
  const held = new PhoneLists(store, {} as MonitorOnPhone, now);
  const outbox = await PhoneOutbox.opened(store, {
    holding: async () => ({
      holds: { masterPasscodeVersion: null, listsProjectId: p1.id },
      lastUsed: await held.lastUsed(),
    }),
    filePartBytesAtMost: 4_194_304,
    wipe: () => store.erase(),
    now,
  });
  const tickets = await PhoneTickets.opened(store, held, outbox, {
    photoBytesAtMost: 33_554_432,
    now,
  });
  const timeClock = await PhoneClock.opened(store, outbox, tickets, now);
  return { store, clock, outbox, tickets, timeClock };
}

const begun = (number: string, more: Partial<Begun> = {}): Begun => ({
  monitorId: ana.id,
  projectId: p1.id,
  timeZone: p1.timeZone,
  assignmentId: collections.id,
  setupVersion: 3,
  masterPasscodeSession: null,
  workflow: 'LOAD',
  kind: 'COLLECTION',
  siteId: null,
  certNumber: number === '101003' ? '730416' : '730415',
  certKeyedByHand: false,
  typedCapacityCy: null,
  ticketNumber: number,
  numberFrom: 'MADE',
  numberTypedReasonId: null,
  splitSuffix: '',
  start: null,
  step: 'open',
  ...more,
});

// The clock entries the next sync carries.
const entriesSent = (outbox: PhoneOutbox) =>
  outbox
    .sends()
    .records.flatMap((record: SyncedRecord) =>
      record.record === 'CLOCK_ENTRY' ? [record.clockEntry] : [],
    );

describe('clocking in, a break and out by hand on the assignment (AC-02-50)', () => {
  it('AC-02-50 out, in, on a break, in again: each entry the worker’s own record, at the phone’s clock with its offset, kept sealed to send, its note beside it; only what comes next is offered', async () => {
    const { clock, outbox, timeClock, store } = await phone();
    expect([timeClock.standing(anaOnP1), timeClock.next(anaOnP1)]).toEqual(['OUT', ['IN']]);
    expect(await timeClock.enter(anaOnP1, 'IN')).toBeUndefined();
    expect([timeClock.standing(anaOnP1), timeClock.next(anaOnP1)]).toEqual([
      'IN',
      ['BREAK_START', 'OUT'],
    ]);
    clock.now = at('13:00');
    await timeClock.enter(anaOnP1, 'BREAK_START');
    expect([timeClock.standing(anaOnP1), timeClock.next(anaOnP1)]).toEqual([
      'BREAK',
      ['BREAK_END', 'OUT'],
    ]);
    clock.now = at('13:30');
    await timeClock.enter(anaOnP1, 'BREAK_END');
    expect(timeClock.standing(anaOnP1)).toBe('IN');

    const sent = entriesSent(outbox);
    expect(sent.map(({ kind, at: when }) => [kind, when])).toEqual([
      ['IN', '2026-10-19T10:00:00.000Z'],
      ['BREAK_START', '2026-10-19T17:00:00.000Z'],
      ['BREAK_END', '2026-10-19T17:30:00.000Z'],
    ]);
    expect(sent[0]).toMatchObject({
      projectId: p1.id,
      assignmentId: collections.id,
      workerId: ana.id,
      deviceUtcOffsetMinutes: -new Date('2026-10-19T10:00:00Z').getTimezoneOffset(),
      activityLines: [],
    });
    expect((await store.readAll('clock')).map(({ id }) => id).sort()).toEqual(
      sent.map(({ id }) => id).sort(),
    );
    // A clock-in while in is never what comes next.
    await expect(timeClock.enter(anaOnP1, 'IN')).rejects.toThrow('isn’t what comes next');
  });

  it('AC-02-50 where the worker stands is read again from the store after a restart; another worker’s, or another assignment’s, entries are theirs', async () => {
    const { store, timeClock } = await phone();
    await timeClock.enter(anaOnP1, 'IN');
    await timeClock.enter(anaOnP1, 'BREAK_START');
    const again = await phone(store);
    expect(again.timeClock.standing(anaOnP1)).toBe('BREAK');
    expect(again.timeClock.standing({ workerId: kim.id, assignment: collections })).toBe('OUT');
    expect(
      again.timeClock.standing({
        workerId: ana.id,
        assignment: { ...collections, id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d43' },
      }),
    ).toBe('OUT');
  });
});

describe('the clock-out and the day’s activity (AC-02-52)', () => {
  // Ana's Monday: 101001 08:20–08:40, 101002 08:45–09:10, 101003 13:05–13:40, all submitted; one
  // left open, one cancelled and one on another assignment, none of them pre-filled.
  async function day() {
    const made = await phone();
    const { clock, tickets, timeClock } = made;
    await timeClock.enter(anaOnP1, 'IN');
    const collected = async (number: string, from: string, to: string, more?: Partial<Begun>) => {
      clock.now = at(from);
      const opened = await tickets.open(begun(number, more));
      await tickets.changed(opened.id, { formDebrisTypeId: vegetative });
      clock.now = at(to);
      return tickets.submit(opened.id, null);
    };
    const ids = [];
    for (const [number, from, to] of [
      ['101001', '08:20', '08:40'],
      ['101002', '08:45', '09:10'],
      ['101003', '13:05', '13:40'],
    ] as const) {
      const done = await collected(number, from, to);
      if (done.kind !== 'sealed') throw new Error('Not sealed.');
      ids.push(done.ticket.id);
    }
    await tickets.open(begun('101004', { certNumber: '730499' }));
    const cancelled = await tickets.open(begun('101005', { certNumber: '730498' }));
    await tickets.cancel(cancelled.id);
    await collected('101006', '14:00', '14:20', {
      assignmentId: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d43',
      certNumber: '730497',
    });
    clock.now = at('18:50');
    return { ...made, ids };
  }

  it('AC-02-52 the lines are pre-filled a line an hour from the field events she submitted on the assignment: 08:20–09:10 from 101001 and 101002, 13:05–13:40 from 101003', async () => {
    const { timeClock, ids } = await day();
    const lines = timeClock.prefilled(anaOnP1);
    expect(
      lines.map(({ startedAt, endedAt, fieldEventId, work }) => ({
        startedAt,
        endedAt,
        fieldEventId,
        numbers: work.map(({ ticket }) => ticket.ticketNumber),
      })),
    ).toEqual([
      {
        startedAt: at('08:20'),
        endedAt: at('09:10'),
        fieldEventId: ids[0],
        numbers: ['101001', '101002'],
      },
      { startedAt: at('13:05'), endedAt: at('13:40'), fieldEventId: ids[2], numbers: ['101003'] },
    ]);
  });

  it('AC-02-52 the clock-out carries the lines she approved, in her order, with the drive back picked from the firm’s list; a note left blank is none; what it carried isn’t pre-filled again after she clocks in once more', async () => {
    const { timeClock, outbox, ids } = await day();
    const [morning, afternoon] = timeClock.prefilled(anaOnP1);
    if (morning === undefined || afternoon === undefined) throw new Error('No lines.');
    expect(
      await timeClock.clockedOut(anaOnP1, [
        {
          startedAt: at('08:15'),
          endedAt: morning.endedAt,
          fieldEventId: morning.fieldEventId,
          activityId: null,
          note: '  ',
          carries: morning.work.map(({ id }) => id),
        },
        {
          startedAt: at('18:20'),
          endedAt: at('18:50'),
          fieldEventId: null,
          activityId: travel,
          note: 'Back to the yard',
          carries: [],
        },
      ]),
    ).toBeUndefined();
    expect(timeClock.standing(anaOnP1)).toBe('OUT');
    const out = entriesSent(outbox).find(({ kind }) => kind === 'OUT');
    expect(out?.at).toBe(at('18:50').toISOString());
    expect(out?.activityLines).toEqual([
      {
        startedAt: at('08:15').toISOString(),
        endedAt: at('09:10').toISOString(),
        fieldEventId: ids[0],
        activityId: null,
        note: null,
      },
      {
        startedAt: at('18:20').toISOString(),
        endedAt: at('18:50').toISOString(),
        fieldEventId: null,
        activityId: travel,
        note: 'Back to the yard',
      },
    ]);
    // The afternoon's line was taken off: 101003 is pre-filled at the next clock-out, the
    // morning's two never again.
    await timeClock.enter(anaOnP1, 'IN');
    expect(timeClock.prefilled(anaOnP1).map(({ fieldEventId }) => fieldEventId)).toEqual([ids[2]]);
  });

  it('a clock-out the contract doesn’t take is not kept: its words are the answer, and she is still clocked in', async () => {
    const { timeClock, outbox } = await day();
    const before = entriesSent(outbox).length;
    const line = {
      startedAt: at('08:00'),
      endedAt: at('08:01'),
      fieldEventId: null,
      activityId: travel,
      note: null,
      carries: [],
    };
    const notice = await timeClock.clockedOut(
      anaOnP1,
      Array.from({ length: 201 }, () => line),
    );
    expect(notice?.message).toMatch(/^Not saved: this record can’t be read: /);
    expect(timeClock.standing(anaOnP1)).toBe('IN');
    expect(entriesSent(outbox)).toHaveLength(before);
  });
});
