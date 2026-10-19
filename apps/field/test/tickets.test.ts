// The tickets begun on the phone (src/phone/tickets.ts, lists.ts; BACKLOG 3.5.1, C68, C135, C139,
// C184; ADR-056, 065, 477, 571, 573, 581): opened at New under the number taken there, one open per
// truck, kept in the store across a restart, cancelled kept unsent with its number, submitted
// sealed in the outbox with its waypoints and photographs, a submit cut short finished on opening
// again; the phone's own duplicate check, a control ticket outside the ranges, today's own count,
// two days' worth of numbers, and the first block of each series the work makes numbers of. Here
// over a store in memory; through the screens against the real API, e2e/collection.e2e.ts.
import type { PhoneAssignmentAnswer, PhoneListsRecord } from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { PhoneLists } from '../src/phone/lists.ts';
import type { MonitorOnPhone } from '../src/phone/monitor.ts';
import { PhoneOutbox } from '../src/phone/outbox.ts';
import { PhoneTickets, type Begun } from '../src/phone/tickets.ts';
import type { Json } from '../src/store/phone-store.ts';
import { noLists } from './checks.ts';
import { HeldStore } from './held.ts';
import { ana, p1 } from './phone-world.ts';

const collections: PhoneAssignmentAnswer = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d41',
  workDate: '2026-10-19',
  project: p1,
  fieldEventKinds: ['COLLECTION'],
  certifying: false,
  formDocumentTypes: ['INCIDENT'],
  site: null,
};
const block = { series: 'LOAD', firstNumber: 101001, lastNumber: 102000 } as const;
const generated: PhoneListsRecord = {
  ...noLists,
  blocks: [{ ...block, lastUsedNumber: null, status: 'ISSUED' }],
  numbering: { ticketNumberSource: 'GENERATED', series: ['LOAD', 'HAUL_OUT', 'UNIT_RATE', 'ROE'] },
};

// A phone holding Ana's lists, its outbox and its tickets over one store, on a clock the test
// moves.
async function phone(lists: PhoneListsRecord = generated, store = new HeldStore()) {
  const clock = { now: new Date('2026-10-19T12:15:00Z') };
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
          readAt: '2026-10-19T11:00:00.000Z',
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
  return { store, clock, lists: held, outbox, tickets };
}

const begun = (more: Partial<Begun> = {}): Begun => ({
  monitorId: ana.id,
  projectId: p1.id,
  timeZone: p1.timeZone,
  assignmentId: collections.id,
  setupVersion: 3,
  masterPasscodeSession: null,
  workflow: 'LOAD',
  kind: 'COLLECTION',
  siteId: null,
  certNumber: '730415',
  certKeyedByHand: false,
  typedCapacityCy: null,
  ticketNumber: '101001',
  numberFrom: 'MADE',
  numberTypedReasonId: null,
  splitSuffix: '',
  start: { latitude: '39.13850000', longitude: '-75.55370000' },
  step: 'open',
  ...more,
});

const vegetative = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d42';
const pile = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe('a ticket opened at New', () => {
  it('AC-11-74, AC-04-10 takes the phone’s next number, marked used in its block at once: never made again, and reported at the next sync', async () => {
    const { tickets, lists } = await phone();
    expect(await tickets.nextNumber('LOAD')).toBe('101001');
    const opened = await tickets.open(begun());
    expect([opened.ticketNumber, opened.state, opened.step, opened.day]).toEqual([
      '101001',
      'OPEN',
      'open',
      '2026-10-19',
    ]);
    expect(await tickets.nextNumber('LOAD')).toBe('101002');
    expect(await lists.lastUsed()).toEqual([
      { projectId: p1.id, series: 'LOAD', lastUsedNumber: 101001 },
    ]);
  });

  it('AC-11-76 is the truck’s one open ticket: its badge again opens it, taking no number; another truck opens another; a crew is not held to one', async () => {
    const { tickets } = await phone();
    const first = await tickets.open(begun());
    expect((await tickets.open(begun({ ticketNumber: '101002' }))).id).toBe(first.id);
    expect(await tickets.nextNumber('LOAD')).toBe('101002');
    const other = await tickets.open(begun({ certNumber: '730416', ticketNumber: '101002' }));
    expect(tickets.openOf(ana.id).map(({ id }) => id)).toEqual([first.id, other.id]);
    const crew = { workflow: 'UNIT_RATE', kind: 'UNIT_RATE', certNumber: '730417' } as const;
    const one = await tickets.open(
      begun({ ...crew, ticketNumber: '301001', numberFrom: 'SCANNED' }),
    );
    const two = await tickets.open(
      begun({ ...crew, ticketNumber: '301002', numberFrom: 'SCANNED' }),
    );
    expect(one.id).not.toBe(two.id);
  });

  it('AC-11-75 is kept where its monitor left it, read again by a phone opened afresh; another monitor never sees it', async () => {
    const { tickets, store } = await phone();
    const opened = await tickets.open(begun());
    await tickets.changed(opened.id, { formDebrisTypeId: 'vegetative', step: 'tag' });
    const again = await phone(generated, store);
    expect(again.tickets.openOf(ana.id)).toMatchObject([
      { id: opened.id, step: 'tag', formDebrisTypeId: 'vegetative', ticketNumber: '101001' },
    ]);
    expect(again.tickets.openOf('0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d99')).toEqual([]);
  });
});

describe('a ticket cancelled', () => {
  it('AC-04-95 stays on the phone with its number, never goes to the outbox, and the number is never made again', async () => {
    const { tickets, outbox } = await phone();
    const opened = await tickets.open(begun());
    await tickets.cancel(opened.id);
    expect(tickets.cancelledOf(ana.id).map(({ ticketNumber }) => ticketNumber)).toEqual(['101001']);
    expect([outbox.waiting(), tickets.openOf(ana.id)]).toEqual([0, []]);
    expect(await tickets.nextNumber('LOAD')).toBe('101002');
    await expect(tickets.changed(opened.id, { notes: 'later' })).rejects.toThrow(
      'Only an open ticket changes',
    );
  });
});

describe('a ticket submitted', () => {
  it('AC-02-45, AC-08-06, AC-11-77, AC-11-78 is sealed in the outbox as the field event the contract carries, with its waypoints in order and its photograph after it; the phone changes it no more', async () => {
    const { tickets, outbox, clock } = await phone();
    const opened = await tickets.open(begun());
    clock.now = new Date('2026-10-19T12:20:00Z');
    await tickets.markWaypoint(opened.id, clock.now, null, 50);
    await tickets.markWaypoint(
      opened.id,
      new Date('2026-10-19T12:27:00Z'),
      { latitude: '39.13820000', longitude: '-75.55410000' },
      50,
    );
    expect(await tickets.photographed(opened.id, pile, null)).toBe(true);
    // An id that isn't one is the contract's to refuse: nothing is sealed.
    await tickets.changed(opened.id, { formDebrisTypeId: 'vegetative' });
    expect(await tickets.submit(opened.id, null)).toMatchObject({ kind: 'notKept' });
    expect(tickets.ticket(opened.id)?.state).toBe('OPEN');
    await tickets.changed(opened.id, {
      formDebrisTypeId: vegetative,
      address: '14 Heron St',
      addressSource: 'TYPED',
    });
    clock.now = new Date('2026-10-19T12:40:00Z');
    const submitted = await tickets.submit(opened.id, null);
    expect(submitted.kind).toBe('sealed');
    const sent = outbox.sends();
    expect(sent.records).toHaveLength(1);
    expect(sent.records[0]).toMatchObject({
      record: 'FIELD_EVENT',
      fieldEvent: {
        id: opened.id,
        ticketNumber: '101001',
        startedAt: '2026-10-19T12:15:00.000Z',
        endedAt: '2026-10-19T12:40:00.000Z',
        startLatitude: '39.13850000',
        formDebrisTypeId: vegetative,
        address: '14 Heron St',
        addressSource: 'TYPED',
        waypoints: [
          { markedAt: '2026-10-19T12:20:00.000Z', latitude: null, longitude: null },
          {
            markedAt: '2026-10-19T12:27:00.000Z',
            latitude: '39.13820000',
            longitude: '-75.55410000',
          },
        ],
      },
    });
    expect(sent.photos.map(({ owner }) => owner)).toEqual([{ kind: 'FIELD_EVENT', id: opened.id }]);
    expect(tickets.ticket(opened.id)?.state).toBe('SUBMITTED');
    await expect(tickets.changed(opened.id, { notes: 'later' })).rejects.toThrow(
      'Only an open ticket changes',
    );
  });

  it('a submit cut short is finished when the phone opens again: the field event kept once, its photograph with it', async () => {
    const { tickets, store, outbox } = await phone();
    const opened = await tickets.open(begun());
    await tickets.photographed(opened.id, pile, null);
    // The field event sealed, then the phone stopped before its photograph went.
    await outbox.keep(PhoneTickets.record({ ...opened, endedAt: '2026-10-19T12:40:00.000Z' }));
    const again = await phone(generated, store);
    const sent = again.outbox.sends();
    expect([sent.records.length, sent.photos.length]).toEqual([1, 1]);
    expect(again.tickets.ticket(opened.id)?.state).toBe('SUBMITTED');
  });

  it('AC-11-80 counts toward today’s own count on the project’s day, and only the monitor’s submitted tickets', async () => {
    const { tickets } = await phone();
    for (const certNumber of ['730415', '730416']) {
      const opened = await tickets.open(begun({ certNumber, ticketNumber: '0' }));
      await tickets.submit(opened.id, null);
    }
    await tickets.open(begun({ certNumber: '730420' }));
    expect(tickets.todayOf(ana.id, p1.id, p1.timeZone)).toBe(2);
    expect(tickets.todayOf('0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d99', p1.id, p1.timeZone)).toBe(0);
  });
});

describe('the number taken', () => {
  it('AC-04-96 is said where this phone already holds it for the same kind of field event, a cancelled one left out; AC-04-08 a control ticket outside the ranges is questioned', async () => {
    const control: PhoneListsRecord = {
      ...noLists,
      numbering: { ticketNumberSource: 'CONTROL', series: ['UNIT_RATE', 'ROE'] },
      controlRanges: [{ series: 'LOAD', firstNumber: 400001, lastNumber: 405000 }],
    };
    const { tickets } = await phone(control);
    const scanned = { ...begun(), numberFrom: 'SCANNED' } as const;
    expect(tickets.said(scanned, '400007', control)).toEqual({ kind: 'fine' });
    expect(tickets.said(scanned, '399999', control)).toEqual({ kind: 'outsideStock' });
    const opened = await tickets.open(begun({ ticketNumber: '400007', numberFrom: 'SCANNED' }));
    expect(tickets.said(scanned, '400007', control)).toMatchObject({
      kind: 'onThisPhone',
      ticket: { id: opened.id },
    });
    expect(tickets.said({ ...scanned, kind: 'DISPOSAL' }, '400007', control)).toEqual({
      kind: 'fine',
    });
    await tickets.cancel(opened.id);
    expect(tickets.said(scanned, '400007', control)).toEqual({ kind: 'fine' });
  });
});

describe('the phone’s numbers', () => {
  it('C184 a series its work makes numbers of and holds no block of is reported with no number used, and asked for', async () => {
    const { lists } = await phone({ ...generated, blocks: [] });
    expect(await lists.lastUsed()).toEqual([
      { projectId: p1.id, series: 'LOAD', lastUsedNumber: null },
    ]);
    expect(await lists.wantsFirstBlocks()).toBe(true);
    const control = await phone({
      ...noLists,
      numbering: { ticketNumberSource: 'CONTROL', series: ['UNIT_RATE', 'ROE'] },
    });
    expect([await control.lists.lastUsed(), await control.lists.wantsFirstBlocks()]).toEqual([
      [],
      false,
    ]);
  });

  it('a top-up never marks a block less used than the phone knows it: a number given out while the sync was under way stays used', async () => {
    const { tickets, lists } = await phone();
    await tickets.open(begun());
    await lists.toppedUp([
      {
        projectId: p1.id,
        series: 'LOAD',
        toppedUp: true,
        blocks: [{ firstNumber: 101001, lastNumber: 102000, lastUsedNumber: null }],
      },
    ]);
    expect(await tickets.nextNumber('LOAD')).toBe('101002');
  });

  it('ADR-065 two days’ worth: low once fewer are left than twice the most the phone made in one day', async () => {
    const { tickets } = await phone({
      ...generated,
      blocks: [
        {
          ...block,
          firstNumber: 101001,
          lastNumber: 101004,
          lastUsedNumber: null,
          status: 'ISSUED',
        },
      ],
    });
    expect(await tickets.low('LOAD')).toBe(false);
    await tickets.open(begun());
    expect(await tickets.low('LOAD')).toBe(false);
    await tickets.open(begun({ certNumber: '730416', ticketNumber: '101002' }));
    expect(await tickets.low('LOAD')).toBe(true);
  });
});
