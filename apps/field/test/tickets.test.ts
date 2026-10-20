// The tickets begun on the phone (src/phone/tickets.ts, lists.ts; BACKLOG 3.5.1, C68, C135, C139,
// C184; ADR-056, 065, 477, 571, 573, 581): opened at New under the number taken there, one open per
// truck, kept in the store across a restart, cancelled kept unsent with its number, submitted
// sealed in the outbox with its waypoints and photographs, a submit cut short finished on opening
// again; the phone's own duplicate check, a control ticket outside the ranges, today's own count,
// two days' worth of numbers, and the first block of each series the work makes numbers of; unit
// rate work as it goes, and the working crew (BACKLOG 3.5.3; ADR-583); its photographs, each
// fingerprinted at capture, shrunk, taken again in its place or taken off (BACKLOG 3.6.1;
// ADR-586); and their receipts, printed at submit and again at any time, never recorded (BACKLOG
// 3.6.2; ADR-595); and what a number scanned back finds on the phone (BACKLOG 3.6.3; ADR-596). Here
// over a store in memory; through the screens against the real API, e2e/collection.e2e.ts.
import type { PhoneAssignmentAnswer, PhoneListsRecord } from '@open-adms/contracts';
import { Receipts } from '@open-adms/receipts';
import { describe, expect, it, vi } from 'vitest';

import { PhoneLists } from '../src/phone/lists.ts';
import type { MonitorOnPhone } from '../src/phone/monitor.ts';
import { PhoneOutbox } from '../src/phone/outbox.ts';
import type { PhotoShrink } from '../src/phone/photographs.ts';
import { PdfPrinter, ticketReceipt } from '../src/phone/printing.ts';
import { scannedBack } from '../src/phone/scanning.ts';
import { PhoneTickets, type Begun } from '../src/phone/tickets.ts';
import type { Json } from '../src/store/phone-store.ts';
import { noLists } from './checks.ts';
import { HeldStore } from './held.ts';
import { ana, hangers, kim, landfill, p1, p2 } from './phone-world.ts';

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
async function phone(
  lists: PhoneListsRecord = generated,
  store = new HeldStore(),
  shrink?: PhotoShrink,
) {
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
    ...(shrink === undefined ? {} : { shrink }),
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

describe('a ticket’s photographs', () => {
  const sha256 = async (bytes: Uint8Array) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');

  it('AC-11-44 the browser build keeps the original: its SHA-256 taken at capture, the file sent the one taken, no depth file', async () => {
    const { tickets, outbox } = await phone();
    const opened = await tickets.open(begun());
    await tickets.photographed(opened.id, pile, null);
    const [photo] = tickets.ticket(opened.id)?.photos ?? [];
    expect(photo).toMatchObject({
      originalSha256: await sha256(pile),
      uploadedSha256: await sha256(pile),
      depthSha256: null,
      bytes: pile.byteLength,
    });
    await tickets.changed(opened.id, { formDebrisTypeId: vegetative });
    await tickets.submit(opened.id, null);
    expect(outbox.sends().photos).toMatchObject([
      { originalSha256: await sha256(pile), uploadedSha256: await sha256(pile), depthSha256: null },
    ]);
    expect(outbox.holdsFiles()).toEqual([`${photo?.id ?? ''} photo`]);
  });

  it('AC-11-44 a native shrink’s file and its depth file are each fingerprinted beside the original’s, and both go', async () => {
    const shrunk = pile.subarray(0, 10);
    const depth = Uint8Array.from([0x49, 0x49, 0x2a, 0x00, 9, 9]);
    const native: PhotoShrink = {
      shrunk: (original) => {
        expect(original).toEqual(pile);
        return Promise.resolve({ photo: shrunk, depth });
      },
    };
    const { tickets, outbox } = await phone(generated, new HeldStore(), native);
    const opened = await tickets.open(begun());
    await tickets.photographed(opened.id, pile, null);
    const [photo] = tickets.ticket(opened.id)?.photos ?? [];
    expect(photo).toMatchObject({
      originalSha256: await sha256(pile),
      uploadedSha256: await sha256(shrunk),
      depthSha256: await sha256(depth),
      bytes: shrunk.byteLength,
    });
    expect(await tickets.photoBytes(photo?.id ?? '')).toEqual(shrunk);
    await tickets.changed(opened.id, { formDebrisTypeId: vegetative });
    await tickets.submit(opened.id, null);
    expect(outbox.sends().photos).toMatchObject([
      {
        originalSha256: await sha256(pile),
        uploadedSha256: await sha256(shrunk),
        depthSha256: await sha256(depth),
      },
    ]);
    expect([...outbox.holdsFiles()].sort()).toEqual(
      [`${photo?.id ?? ''} depth`, `${photo?.id ?? ''} photo`].sort(),
    );
  });

  it('AC-04-79, AC-11-78 are at most 8; one taken again takes its place, never counted twice, and one taken again or taken off is never sent', async () => {
    const { tickets, outbox, clock } = await phone();
    const opened = await tickets.open(begun());
    for (let taken = 0; taken < 8; taken += 1) {
      clock.now = new Date(clock.now.getTime() + 60_000);
      expect(await tickets.photographed(opened.id, pile, null)).toBe(true);
    }
    expect(await tickets.photographed(opened.id, pile, null)).toBe(false);
    const before = tickets.ticket(opened.id)?.photos ?? [];
    const again = Uint8Array.from([...pile, 5]);
    expect(await tickets.photographed(opened.id, again, null, before[2]?.id)).toBe(true);
    const after = tickets.ticket(opened.id)?.photos ?? [];
    expect(after).toHaveLength(8);
    expect(after[2]?.id).not.toBe(before[2]?.id);
    expect(after[2]?.originalSha256).toBe(await sha256(again));
    expect(await tickets.photoBytes(before[2]?.id ?? '')).toBeUndefined();
    await tickets.photoRemoved(opened.id, after[5]?.id ?? '');
    await tickets.changed(opened.id, { formDebrisTypeId: vegetative });
    await tickets.submit(opened.id, null);
    const sent = outbox.sends().photos.map(({ id }) => id);
    expect(sent).toEqual(after.filter((_, place) => place !== 5).map(({ id }) => id));
    expect(sent).not.toContain(before[2]?.id);
  });

  it('one empty, or larger than the server ever takes, is not kept; an empty one is never shrunk', async () => {
    const shrunk: Uint8Array[] = [];
    const { tickets } = await phone(generated, new HeldStore(), {
      shrunk: (original) => {
        shrunk.push(original);
        return Promise.resolve({ photo: original, depth: null });
      },
    });
    const opened = await tickets.open(begun());
    expect(await tickets.photographed(opened.id, new Uint8Array(), null)).toBe(false);
    expect(await tickets.photographed(opened.id, new Uint8Array(33_554_433), null)).toBe(false);
    expect(tickets.ticket(opened.id)?.photos).toEqual([]);
    expect(shrunk.map(({ byteLength }) => byteLength)).toEqual([33_554_433]);
  });
});

describe('the tower and the haul-out', () => {
  const tower = {
    workflow: 'LOAD',
    kind: 'DISPOSAL',
    siteId: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d43',
    numberFrom: 'SCANNED',
  } as const;
  const receipt = {
    receiptNumber: 'CCL-51310',
    grossWeightLb: 62_800,
    tareWeightLb: 28_600,
    netWeightLb: 34_200,
    netWeightTons: 17.1,
    enteredAt: '2026-10-19T12:25:00.000Z',
    offset: -240,
    shared: false,
  };

  it('AC-04-38, AC-05-10 a weighed disposal keeps its scale receipt with it, before it, in one change; a tandem’s second points at it, sent once; a receipt the contract doesn’t read keeps neither', async () => {
    const { tickets, outbox } = await phone();
    const front = await tickets.open(begun({ ...tower, ticketNumber: '101050' }));
    await tickets.changed(front.id, {
      formDebrisTypeId: vegetative,
      scaleReceipt: { ...receipt, id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d44', receiptNumber: '' },
    });
    expect(await tickets.submit(front.id, null)).toMatchObject({ kind: 'notKept' });
    expect(outbox.waiting()).toBe(0);
    await tickets.changed(front.id, {
      scaleReceipt: { ...receipt, id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d44' },
    });
    expect((await tickets.submit(front.id, null)).kind).toBe('sealed');
    const [kept] = tickets.receiptsAt(ana.id, tower.siteId, '2026-10-19');
    expect(kept?.id).toBe(front.id);
    const rear = await tickets.open(
      begun({ ...tower, certNumber: '730422', ticketNumber: '101051' }),
    );
    await tickets.changed(rear.id, {
      formDebrisTypeId: vegetative,
      scaleReceipt: { ...receipt, id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d44', shared: true },
    });
    expect((await tickets.submit(rear.id, null)).kind).toBe('sealed');
    const sent = outbox.sends().records;
    expect(sent.map((record) => record.record)).toEqual([
      'SCALE_RECEIPT',
      'FIELD_EVENT',
      'FIELD_EVENT',
    ]);
    expect(sent[0]).toMatchObject({
      scaleReceipt: {
        id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d44',
        receiptNumber: 'CCL-51310',
        siteId: tower.siteId,
        netWeightTons: 17.1,
        enteredById: ana.id,
        deviceUtcOffsetMinutes: -240,
      },
    });
    const events = sent.flatMap((record) =>
      record.record === 'FIELD_EVENT' ? [record.fieldEvent] : [],
    );
    expect(
      events.map((event) => [event.ticketNumber, event.loadCall, event.scaleReceiptId]),
    ).toEqual([
      ['101050', null, '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d44'],
      ['101051', null, '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d44'],
    ]);
    // A tandem's second receipt is the first's: never offered as one to point at.
    expect(tickets.receiptsAt(ana.id, tower.siteId, '2026-10-19').map(({ id }) => id)).toEqual([
      front.id,
    ]);
  });

  it('AC-11-40, AC-11-41 the load call or the count of the tickets the load carries goes as the one quantity', async () => {
    const { tickets, outbox } = await phone();
    for (const [ticketNumber, certNumber, quantity] of [
      ['101001', '730415', { loadCall: 0 }],
      ['101014', '730416', { carriedCount: 1 }],
    ] as const) {
      const opened = await tickets.open(begun({ ...tower, ticketNumber, certNumber }));
      await tickets.changed(opened.id, { formDebrisTypeId: vegetative, ...quantity });
      expect((await tickets.submit(opened.id, null)).kind).toBe('sealed');
    }
    expect(
      outbox
        .sends()
        .records.flatMap((record) => (record.record === 'FIELD_EVENT' ? [record.fieldEvent] : []))
        .map(({ loadCall, carriedCount, scaleReceiptId }) => [
          loadCall,
          carriedCount,
          scaleReceiptId,
        ]),
    ).toEqual([
      [0, null, null],
      [null, 1, null],
    ]);
  });

  it('ADR-295 a split haul-out’s pile after the first is shown the load call so far of the pile before it, once that one is submitted', async () => {
    const { tickets } = await phone();
    const haulOut = {
      workflow: 'HAUL_OUT',
      kind: 'HAUL_OUT_COLLECTION',
      siteId: tower.siteId,
      certNumber: '730419',
      ticketNumber: '201004',
    } as const;
    const a = await tickets.open(begun({ ...haulOut, splitSuffix: 'A' }));
    expect(tickets.pileBefore(a)).toBeUndefined();
    await tickets.changed(a.id, { loadCall: 10 });
    await tickets.submit(a.id, null);
    const b = await tickets.open(begun({ ...haulOut, splitSuffix: 'B', numberFrom: 'CHAINED' }));
    expect(tickets.pileBefore(b)).toMatchObject({ splitSuffix: 'A', loadCall: 10 });
  });
});

describe('unit rate work', () => {
  const crew = {
    workflow: 'UNIT_RATE',
    kind: 'UNIT_RATE',
    certNumber: '730417',
    numberFrom: 'MADE',
  } as const;
  const leaners = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d51';
  const leanerKind = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d52';
  const leaner24 = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d53';
  const washer = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d54';

  it('AC-04-70 the working crew is the crew of the monitor’s newest unit rate ticket on the project, whatever became of it, until another crew’s badge is scanned; another monitor’s is theirs', async () => {
    const { tickets } = await phone();
    expect(tickets.workingCrew(ana.id, p1.id)).toBeUndefined();
    const first = await tickets.open(begun({ ...crew, ticketNumber: '301001' }));
    await tickets.cancel(first.id);
    expect(tickets.workingCrew(ana.id, p1.id)).toBe('730417');
    await tickets.open(begun({ ...crew, ticketNumber: '301002' }));
    await tickets.open(begun({ ...crew, certNumber: '730418', ticketNumber: '301003' }));
    expect(tickets.workingCrew(ana.id, p1.id)).toBe('730418');
    expect(tickets.workingCrew('0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d5f', p1.id)).toBeUndefined();
    expect(tickets.workingCrew(ana.id, '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d5e')).toBeUndefined();
  });

  it('AC-11-43, REQ-306 a leaner goes as the contract carries it: the payable type, its kind of work and the pay item the phone worked out, the count and the measurement with how it was read; a way picked with no inches is no measurement', async () => {
    const { tickets, outbox } = await phone();
    const tree = await tickets.open(begun({ ...crew, ticketNumber: '301002' }));
    await tickets.changed(tree.id, {
      payableTypeId: leaners,
      kindOfWorkId: leanerKind,
      payItemId: leaner24,
      unitCount: 1,
      measurementInches: 56.5,
      measuredAs: 'CIRCUMFERENCE',
      markedIneligible: null,
    });
    expect((await tickets.submit(tree.id, null)).kind).toBe('sealed');
    const unmeasured = await tickets.open(begun({ ...crew, ticketNumber: '301003' }));
    await tickets.changed(unmeasured.id, {
      payableTypeId: leaners,
      kindOfWorkId: leanerKind,
      unitCount: 1,
      measuredAs: 'DIAMETER',
    });
    expect((await tickets.submit(unmeasured.id, null)).kind).toBe('sealed');
    const sent = outbox
      .sends()
      .records.flatMap((record) => (record.record === 'FIELD_EVENT' ? [record.fieldEvent] : []));
    expect(sent[0]).toMatchObject({
      workflow: 'UNIT_RATE',
      kind: 'UNIT_RATE',
      ticketNumber: '301002',
      certNumber: '730417',
      payableTypeId: leaners,
      kindOfWorkId: leanerKind,
      payItemId: leaner24,
      unitCount: 1,
      measurementInches: 56.5,
      measuredAs: 'CIRCUMFERENCE',
      formDebrisTypeId: null,
      loadCall: null,
      items: [],
      waypoints: [],
    });
    expect([sent[1]?.measurementInches, sent[1]?.measuredAs, sent[1]?.payItemId]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('AC-11-90, AC-04-104 a leaner’s photographs by stage: one each, a stage taken again takes its own place, one taken again from full size keeps its stage, and each goes saying its stage beside one that says none', async () => {
    const { tickets, outbox, clock } = await phone();
    const tree = await tickets.open(begun({ ...crew, ticketNumber: '301004' }));
    const shot = (byte: number) => Uint8Array.from([...pile, byte]);
    const later = () => {
      clock.now = new Date(clock.now.getTime() + 60_000);
    };
    // The crew's photograph, no stage; then the pre-work one, left, and the measurement.
    expect(await tickets.photographed(tree.id, shot(1), null)).toBe(true);
    later();
    expect(await tickets.photographed(tree.id, shot(2), null, undefined, 'PRE_WORK')).toBe(true);
    later();
    await tickets.photographed(tree.id, shot(3), null, undefined, 'MEASUREMENT');
    // The measurement taken again for its stage: in its own place, never a second.
    const first = tickets.ticket(tree.id)?.photos.find(({ stage }) => stage === 'MEASUREMENT');
    later();
    await tickets.photographed(tree.id, shot(4), null, undefined, 'MEASUREMENT');
    later();
    await tickets.photographed(tree.id, shot(5), null, undefined, 'POST_WORK');
    const taken = tickets.ticket(tree.id)?.photos ?? [];
    expect(taken.map(({ stage }) => stage ?? null)).toEqual([
      null,
      'PRE_WORK',
      'MEASUREMENT',
      'POST_WORK',
    ]);
    expect(taken[2]?.id).not.toBe(first?.id);
    expect(await tickets.photoBytes(first?.id ?? '')).toBeUndefined();
    // The post-work photograph taken again from full size: it stays the post-work one.
    later();
    await tickets.photographed(tree.id, shot(6), null, taken[3]?.id);
    const after = tickets.ticket(tree.id)?.photos ?? [];
    expect([after.length, after[3]?.stage, after[3]?.id === taken[3]?.id]).toEqual([
      4,
      'POST_WORK',
      false,
    ]);
    await tickets.changed(tree.id, {
      payableTypeId: leaners,
      kindOfWorkId: leanerKind,
      unitCount: 1,
    });
    expect((await tickets.submit(tree.id, null)).kind).toBe('sealed');
    expect(outbox.sends().photos.map(({ id, stage }) => [id, stage])).toEqual(
      after.map(({ id, stage }) => [id, stage ?? null]),
    );
  });

  it('REQ-306, REQ-320 a stump goes with its root ball, "half or more exposed" and survey number; white goods with their items, no count; work marked ineligible says so', async () => {
    const { tickets, outbox } = await phone();
    const stump = await tickets.open(
      begun({ ...crew, certNumber: '730418', ticketNumber: '301004' }),
    );
    await tickets.changed(stump.id, {
      payableTypeId: leaners,
      kindOfWorkId: leanerKind,
      unitCount: 1,
      measurementInches: 30,
      measuredAs: 'DIAMETER',
      rootBallInches: 96,
      rootBallHalfExposed: true,
      surveyNumber: 'APN 14-0321-007',
      markedIneligible: true,
    });
    expect((await tickets.submit(stump.id, null)).kind).toBe('sealed');
    const goods = await tickets.open(begun({ ...crew, ticketNumber: '301006' }));
    await tickets.changed(goods.id, {
      payableTypeId: leaners,
      kindOfWorkId: leanerKind,
      items: [{ itemNameId: washer, quantity: 2 }],
    });
    expect((await tickets.submit(goods.id, null)).kind).toBe('sealed');
    const [one, two] = outbox
      .sends()
      .records.flatMap((record) => (record.record === 'FIELD_EVENT' ? [record.fieldEvent] : []));
    expect(one).toMatchObject({
      rootBallInches: 96,
      rootBallHalfExposed: true,
      surveyNumber: 'APN 14-0321-007',
      markedIneligible: true,
    });
    expect([two?.unitCount, two?.items]).toEqual([null, [{ itemNameId: washer, quantity: 2 }]]);
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

// The lists a receipt names what was recorded from: Coastline's 730415, Vegetative, the landfill,
// the hanger pay item.
const coastline = { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d51', name: 'Coastline Haulers LLC' };
const printable: PhoneListsRecord = {
  ...generated,
  debrisTypes: { LOAD: [{ id: vegetative, name: 'Vegetative' }], HAUL_OUT: [] },
  certifications: [
    {
      id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d52',
      certNumber: '730415',
      kind: 'CONTAINER',
      capacityCy: 65,
      prime: coastline,
      firstTierSub: null,
      secondTierSub: null,
    },
  ],
  sites: [landfill],
  payItems: [hangers],
};
const anaPrints = { name: ana.name, monitorNumber: ana.number };

// A printer whose PDFs are kept here, as the browser would save them.
function printerKeeping() {
  const saved: { name: string; bytes: Uint8Array }[] = [];
  return { saved, printer: new PdfPrinter((name, bytes) => saved.push({ name, bytes })) };
}
const pagesIn = (bytes: Uint8Array) =>
  Buffer.from(bytes)
    .toString('latin1')
    .match(/\/Type \/Page /g)?.length ?? 0;

describe('a ticket’s receipt (BACKLOG 3.6.2; ADR-595)', () => {
  async function submitted(lists: PhoneListsRecord, more: Partial<Begun> = {}) {
    const held = await phone(lists);
    const opened = await held.tickets.open(begun(more));
    await held.tickets.changed(opened.id, {
      formDebrisTypeId: more.kind === 'UNIT_RATE' ? null : vegetative,
      address: '14 Heron St',
      addressSource: 'TYPED',
    });
    held.clock.now = new Date('2026-10-19T12:40:00Z');
    expect(await held.tickets.submit(opened.id, null)).toMatchObject({ kind: 'sealed' });
    const ticket = held.tickets.ticket(opened.id);
    if (ticket === undefined) throw new Error('No ticket submitted.');
    return { ...held, ticket };
  }

  it('AC-04-97, AC-11-46, AC-11-47: collection 101001 prints its two copies as one PDF named by its bare number, from what the phone holds and the names its lists give', async () => {
    const { ticket } = await submitted(printable);
    const receipt = ticketReceipt(ticket, printable, p1.name, anaPrints);
    expect(receipt.barcode).toBe('101001');
    expect(Receipts.wordsOf(receipt, 'DRIVER')).toEqual([
      'Collection',
      'Driver’s copy',
      p1.name,
      'Ticket 101001',
      '101001',
      'Truck',
      'Cert number: 730415',
      'Capacity: 65 CY',
      'Contractor: Coastline Haulers LLC',
      'Load',
      'Debris type: Vegetative',
      'Address: 14 Heron St',
      'Monitor and times',
      'Monitor: Ana Brooks (M004127)',
      'Started: Oct 19, 2026, 8:15 AM EDT',
      'Ended: Oct 19, 2026, 8:40 AM EDT',
    ]);
    const { saved, printer } = printerKeeping();
    expect(await printer.print(receipt, receipt.copies)).toEqual({
      kind: 'printed',
      copies: ['DRIVER', 'MONITOR'],
    });
    expect(saved.map(({ name }) => name)).toEqual(['receipt-101001.pdf']);
    expect(Buffer.from(saved[0]?.bytes ?? []).toString('latin1')).toMatch(/^%PDF-1\.4\n/);
    expect(pagesIn(saved[0]?.bytes ?? new Uint8Array())).toBe(2);
  });

  it('AC-11-48: printed again the next day it prints as it first did, and writes nothing: no change to the store, nothing more to send', async () => {
    const { ticket, store, clock, outbox } = await submitted(printable);
    const waiting = outbox.waiting();
    const changed = vi.spyOn(store, 'change');
    const { saved, printer } = printerKeeping();
    const receipt = ticketReceipt(ticket, printable, p1.name, anaPrints);
    await printer.print(receipt, receipt.copies);
    clock.now = new Date('2026-10-20T14:00:00Z');
    const again = ticketReceipt(ticket, printable, p1.name, anaPrints);
    await printer.print(again, Receipts.again(again));
    expect(saved).toHaveLength(2);
    expect(saved[1]?.bytes).toEqual(saved[0]?.bytes);
    expect(changed).not.toHaveBeenCalled();
    expect(outbox.waiting()).toBe(waiting);
  });

  it('AC-04-97: a collection from a control ticket prints none (the ticket handed over, its stub kept), and prints the driver’s copy again; a disposal from one prints the driver’s (ADR-115)', async () => {
    const control: PhoneListsRecord = {
      ...printable,
      blocks: [],
      numbering: { ...printable.numbering, ticketNumberSource: 'CONTROL' },
      controlRanges: [{ series: 'LOAD', firstNumber: 400001, lastNumber: 405000 }],
    };
    const { ticket } = await submitted(control, { ticketNumber: '400001', numberFrom: 'SCANNED' });
    const receipt = ticketReceipt(ticket, control, p1.name, anaPrints);
    expect(receipt.copies).toEqual([]);
    expect(Receipts.again(receipt)).toEqual(['DRIVER']);
    // Typed off a control ticket whose barcode won't read, or a split's next property under it:
    // still the control ticket's.
    for (const numberFrom of ['TYPED', 'CHAINED'] as const) {
      const copied = ticketReceipt({ ...ticket, numberFrom }, control, p1.name, anaPrints);
      expect(copied.copies, numberFrom).toEqual([]);
    }
    const { saved, printer } = printerKeeping();
    expect(await printer.print(receipt, receipt.copies)).toEqual({ kind: 'printed', copies: [] });
    expect(saved).toEqual([]);
    const tower = await submitted(control, {
      kind: 'DISPOSAL',
      siteId: landfill.id,
      ticketNumber: '400001',
      numberFrom: 'SCANNED',
    });
    const disposal = ticketReceipt(tower.ticket, control, p1.name, anaPrints);
    expect(disposal.copies).toEqual(['DRIVER']);
    expect(Receipts.wordsOf(disposal, 'DRIVER')).toContain('Site: Bayline County Landfill');
  });

  it('AC-04-97: a unit rate ticket prints the pay item the phone worked out, by its code, and the payable type by name', async () => {
    const { tickets } = await phone(printable);
    const opened = await tickets.open(
      begun({
        workflow: 'UNIT_RATE',
        kind: 'UNIT_RATE',
        certNumber: '730417',
        ticketNumber: '301001',
      }),
    );
    const worked = await tickets.changed(opened.id, {
      payableTypeId: hangers.payableType.id,
      kindOfWorkId: hangers.kindOfWork.id,
      payItemId: hangers.id,
      unitCount: 1,
    });
    const receipt = ticketReceipt(worked, printable, p1.name, anaPrints);
    expect(receipt.copies).toEqual(['CREW']);
    expect(Receipts.wordsOf(receipt, 'CREW')).toEqual(
      expect.arrayContaining([
        'Crew',
        'Cert number: 730417',
        'Work: Hangers',
        'Pay item: HANGERS-RMV-EA',
        'Count: 1',
      ]),
    );
  });
});

describe('a number scanned back (BACKLOG 3.6.3; AC-11-49; ADR-596)', () => {
  it('AC-11-49: finds each of the monitor’s field events on the project under the bare number, whatever became of it, and a certification in the lists; nothing of another monitor’s, another project’s, or a number nothing holds; and writes nothing', async () => {
    const { tickets, store } = await phone(printable);
    const first = await tickets.open(begun({ splitSuffix: 'A' }));
    await tickets.changed(first.id, { formDebrisTypeId: vegetative, estimateCy: 30 });
    expect(await tickets.submit(first.id, null)).toMatchObject({ kind: 'sealed' });
    const second = await tickets.open(
      begun({ splitSuffix: 'B', numberFrom: 'CHAINED', certNumber: '730415' }),
    );
    const cancelled = await tickets.open(begun({ ticketNumber: '101002', certNumber: '730499' }));
    await tickets.cancel(cancelled.id);
    await tickets.open(begun({ ticketNumber: '101003', certNumber: '730416', monitorId: kim.id }));
    await tickets.open(begun({ ticketNumber: '101004', certNumber: '730418', projectId: p2.id }));
    const changed = vi.spyOn(store, 'change');
    const found = (number: string) =>
      scannedBack(number, {
        tickets: tickets.numbered(ana.id, p1.id, number.trim()),
        certifications: [],
        lists: printable,
      });

    expect(
      found('101001').map((one) =>
        one.kind === 'ticket' ? [one.ticket.splitSuffix, one.ticket.state] : [one.kind],
      ),
    ).toEqual([
      ['A', 'SUBMITTED'],
      ['B', 'OPEN'],
    ]);
    expect(found('101001').map((one) => one.kind === 'ticket' && one.ticket.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(found(' 101002 ')).toMatchObject([{ kind: 'ticket', ticket: { state: 'CANCELLED' } }]);
    expect(found('730415')).toEqual([{ kind: 'inLists' }]);
    expect(found('101003')).toEqual([]);
    expect(found('101004')).toEqual([]);
    expect(found('999999')).toEqual([]);
    expect(found('')).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
  });
});
