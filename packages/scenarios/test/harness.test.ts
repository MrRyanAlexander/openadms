// The harness's own pieces, without a database (BACKLOG 0.4.1; ADR-275): the story's clock, the
// ids a phone makes, and a phone that keeps what it records until it syncs. And how that phone
// captures (BACKLOG 1.3.7; spec/acceptance/04-field-capture.md AC-04-10, 11, 17, 59, 70, 91, 92):
// badge first, the details picked by name, the number last and entered again.
import { createHash } from 'node:crypto';

import type { SyncAnswer } from '@open-adms/api';
import { describe, expect, it } from 'vitest';

import { projectTime, StoryClock, utcOffsetMinutes } from '../src/clock.ts';
import {
  chained,
  heldId,
  made,
  scanned,
  SimulatedDevice,
  typed,
  type PhoneLists,
  type PhoneRecord,
  type RecordedEvent,
  type SyncIntake,
} from '../src/device.ts';
import { uuidv7, uuidv7Time } from '../src/ids.ts';

// A phone that picks nothing and makes no number still holds lists: they say its setup version.
const nothingToPick: PhoneLists = {
  setupVersion: 4,
  blocks: [],
  debrisTypes: {},
  fieldTags: [],
  typedNumberReasons: [],
  payItems: [],
  itemNames: [],
  incidentTypes: [],
  incidentOffers: [],
  contractors: [],
  surveyWorkTypes: [],
};

const setup = {
  name: 'P1-COL-1',
  deviceId: '00000000-0000-7000-8000-00000000000a',
  monitorId: '00000000-0000-7000-8000-00000000000b',
  assignmentId: '00000000-0000-7000-8000-00000000000d',
  projectId: '00000000-0000-7000-8000-00000000000c',
  lists: nothingToPick,
  timeZone: 'America/New_York',
};

// The id its phone made for a record, whatever its kind.
function idOf(sent: PhoneRecord): string {
  switch (sent.record) {
    case 'FIELD_EVENT':
      return sent.fieldEvent.id;
    case 'SCALE_RECEIPT':
      return sent.scaleReceipt.id;
    case 'INCIDENT':
      return sent.incident.id;
    case 'DROP_OFF_LOG':
      return sent.dropOffLog.id;
    case 'SURVEY':
      return sent.survey.id;
    case 'ROE':
      return sent.roe.id;
    case 'PHOTO':
      return sent.photo.id;
  }
}

class Received implements SyncIntake {
  readonly records: PhoneRecord[] = [];
  refuseAfter = Infinity;
  // The ids the server keeps in quarantine instead of saving.
  readonly quarantines = new Set<string>();

  get events(): RecordedEvent[] {
    return this.records.flatMap((sent) => (sent.record === 'FIELD_EVENT' ? [sent.fieldEvent] : []));
  }

  receive(sent: PhoneRecord): Promise<SyncAnswer> {
    if (this.records.length >= this.refuseAfter) return Promise.reject(new Error('no signal'));
    const id = idOf(sent);
    // The same id sent again is the same record (KD-56).
    if (this.records.some((one) => idOf(one) === id) && !this.quarantines.has(id)) {
      return Promise.resolve({ answer: 'ALREADY_SAVED', id });
    }
    this.records.push(sent);
    return Promise.resolve(
      this.quarantines.has(id)
        ? {
            answer: 'QUARANTINED',
            id,
            reason: 'DUPLICATE_FIELD_EVENT',
            message: 'Not saved.',
            heldBy: setup.deviceId,
          }
        : { answer: 'SAVED', id, notes: [] },
    );
  }
}

describe('the story clock', () => {
  it('starts where the story says and moves only forward', () => {
    const clock = new StoryClock('2026-10-12T08:15:00-04:00');
    expect(clock.now().toISOString()).toBe('2026-10-12T12:15:00.000Z');
    clock.advance(25);
    expect(projectTime('America/New_York', clock.now())).toBe('Mon 12 Oct 08:40');
    clock.set('2026-10-13T07:15:00-04:00');
    expect(projectTime('America/New_York', clock.now())).toBe('Tue 13 Oct 07:15');
    expect(() => {
      clock.set('2026-10-12T09:00:00-04:00');
    }).toThrow("can't go back");
    expect(() => {
      clock.advance(-1);
    }).toThrow("can't go back");
  });

  it('refuses a time without its offset', () => {
    expect(() => new StoryClock('2026-10-12T08:15:00')).toThrow('with their offset');
  });

  it('knows a time zone’s offset at an instant, summer time included', () => {
    expect(utcOffsetMinutes('America/New_York', new Date('2026-10-12T12:00:00Z'))).toBe(-240);
    expect(utcOffsetMinutes('America/New_York', new Date('2026-12-01T12:00:00Z'))).toBe(-300);
    expect(utcOffsetMinutes('UTC', new Date('2026-10-12T12:00:00Z'))).toBe(0);
    expect(utcOffsetMinutes('Asia/Kolkata', new Date('2026-10-12T12:00:00Z'))).toBe(330);
  });
});

describe('a phone-made id', () => {
  it('is a UUIDv7 holding the time it was made', () => {
    const at = new Date('2026-10-12T12:15:00.123Z');
    const id = uuidv7(at);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidv7Time(id).toISOString()).toBe('2026-10-12T12:15:00.123Z');
    expect(uuidv7(at)).not.toBe(id);
  });

  it('sorts by the time it was made', () => {
    const earlier = uuidv7(new Date('2026-10-12T12:15:00Z'));
    const later = uuidv7(new Date('2026-10-12T12:15:00.001Z'));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });
});

describe('a simulated phone', () => {
  it('keeps what its monitor records until it syncs, then sends it in the order recorded', async () => {
    const clock = new StoryClock('2026-10-12T08:15:00-04:00');
    const phone = new SimulatedDevice(setup, clock);
    const first = phone.begin('LOAD', 'COLLECTION', '730415');
    clock.advance(25);
    phone.complete(first, { number: scanned('101001') });
    const second = phone.begin('LOAD', 'COLLECTION', '730415');
    clock.advance(20);
    phone.complete(second, { number: scanned('101002') });
    expect(phone.waiting.map((event) => event.ticketNumber)).toEqual(['101001', '101002']);

    const intake = new Received();
    expect(await phone.sync(intake)).toBe(2);
    expect(intake.events.map((event) => event.ticketNumber)).toEqual(['101001', '101002']);
    expect(phone.waiting).toEqual([]);
    expect(await phone.sync(intake)).toBe(0);
  });

  it('stamps its own clock, its offset, and an id made when the badge was scanned', () => {
    const clock = new StoryClock('2026-10-12T08:15:00-04:00');
    const phone = new SimulatedDevice({ ...setup, clockErrorMinutes: -7 }, clock);
    const id = phone.begin('LOAD', 'DISPOSAL', '730415');
    clock.advance(20);
    const completed = phone.complete(id, { number: scanned('101001'), loadCall: 80 });
    if (!completed.saved) throw new Error('not saved');
    const { event } = completed;
    expect(projectTime('America/New_York', event.startedAt)).toBe('Mon 12 Oct 08:08');
    expect(projectTime('America/New_York', event.endedAt)).toBe('Mon 12 Oct 08:28');
    expect(uuidv7Time(event.id)).toEqual(event.startedAt);
    expect(event).toMatchObject({
      projectId: setup.projectId,
      monitorId: setup.monitorId,
      deviceId: setup.deviceId,
      assignmentId: setup.assignmentId,
      setupVersion: 4,
      workflow: 'LOAD',
      kind: 'DISPOSAL',
      splitSuffix: '',
      deviceUtcOffsetMinutes: -240,
      loadCall: 80,
      endLatitude: null,
    });
  });

  it('keeps everything a sync carried when the signal drops before its answer, and sends it again under the same ids', async () => {
    const clock = new StoryClock('2026-10-12T08:15:00-04:00');
    const phone = new SimulatedDevice(setup, clock);
    for (const number of ['101001', '101002', '101003']) {
      phone.complete(phone.begin('LOAD', 'COLLECTION', '730415'), { number: scanned(number) });
    }
    const intake = new Received();
    intake.refuseAfter = 1;
    await expect(phone.sync(intake)).rejects.toThrow('no signal');
    // The server has the first; the phone heard nothing, so it lets go of none.
    expect(intake.events.map((event) => event.ticketNumber)).toEqual(['101001']);
    expect(phone.waiting.map((event) => event.ticketNumber)).toEqual([
      '101001',
      '101002',
      '101003',
    ]);
    intake.refuseAfter = Infinity;
    expect(await phone.sync(intake)).toBe(3);
    expect(phone.answers.map((told) => told.answer.answer)).toEqual([
      'ALREADY_SAVED',
      'SAVED',
      'SAVED',
    ]);
    expect(phone.waiting).toEqual([]);
    expect(intake.events.map((event) => event.ticketNumber)).toEqual([
      '101001',
      '101002',
      '101003',
    ]);
  });

  it('completes only a field event it started', () => {
    const phone = new SimulatedDevice(setup, new StoryClock('2026-10-12T08:15:00-04:00'));
    expect(() => phone.complete('not-started', { number: scanned('101001') })).toThrow(
      'has no field event',
    );
  });
});

// The lists a phone holds, by made-up ids: P1's debris types, field tags and unit rate pay items
// (spec/golden/MISSION.md §1), a block of each series, and no rate anywhere.
// A made-up id for a name, shaped as the ids a phone's lists hold: the contract a phone syncs by
// reads a pick only as a UUID.
const listId = (name: string): string => {
  const hex = createHash('sha256').update(name).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const named = (name: string) => ({ id: listId(name), name });
const block = (series: PhoneLists['blocks'][number]['series'], first: number, last: number) =>
  ({
    series,
    firstNumber: first,
    lastNumber: last,
    lastUsedNumber: null,
    status: 'ISSUED',
  }) as const;
const payItem = (code: string, work: string, bandFrom: number | null, bandTo: number | null) => ({
  id: listId(code),
  code,
  bandFrom,
  bandTo,
  archived: false,
  payableType: named(work),
  kindOfWork: named(work),
});
const lists: PhoneLists = {
  setupVersion: 4,
  blocks: [
    block('LOAD', 101001, 101003),
    block('LOAD', 105001, 106000),
    block('HAUL_OUT', 201001, 202000),
    block('UNIT_RATE', 301001, 302000),
    block('CERTIFICATION', 730415, 730514),
    block('ROE', 7, 106),
  ],
  debrisTypes: {
    LOAD: [named('Vegetative'), named('C&D')],
    HAUL_OUT: [named('Mulch')],
  },
  fieldTags: [named('Zone 1 pile'), named('Zone 2 pile')],
  typedNumberReasons: [named('Barcode damaged')],
  payItems: [
    payItem('HNG-RMV-EA', 'Hangers', null, null),
    payItem('LNR-RMV-EA-24', 'Leaners', 6, 24),
    payItem('LNR-RMV-EA-99', 'Leaners', 24.1, 99),
    payItem('STP-RMV-EA-36', 'Stumps', 24, 36),
    payItem('STP-RMV-EA-48', 'Stumps', 36.1, 48),
    payItem('WG-RMV-EA', 'White Goods', null, null),
  ],
  itemNames: [
    { ...named('Washer'), kindOfWorkId: listId('White Goods') },
    { ...named('Dryer'), kindOfWorkId: listId('White Goods') },
  ],
  incidentTypes: [{ ...named('Property damage'), subTypes: [named('Mailbox struck')] }],
  // P1's incident form: the contractor involved and a cert number, no ROE number.
  incidentOffers: ['CONTRACTOR', 'CERT_NUMBER'],
  contractors: [named('Coastline Haulers LLC'), named('Rivera Trucking')],
  surveyWorkTypes: [named('Pre-work'), named('Post-work')],
};
const tdsr = '00000000-0000-7000-8000-00000000000e';
const phoneAt = (time: string, more: Partial<typeof setup> & { siteId?: string } = {}) => {
  const clock = new StoryClock(`2026-10-12T${time}:00-04:00`);
  return { clock, phone: new SimulatedDevice({ ...setup, lists, ...more }, clock) };
};
const saved = (completed: ReturnType<SimulatedDevice['complete']>): RecordedEvent => {
  if (!completed.saved) throw new Error(`Not saved: ${completed.reason}`);
  return completed.event;
};

describe('a simulated phone captures badge first, number last', () => {
  it('AC-04-91, AC-04-17 New scans the badge: the field event waits with its id and no number', () => {
    const { phone, clock } = phoneAt('08:15');
    const id = phone.begin('LOAD', 'COLLECTION', '730415');
    expect(phone.open).toEqual([
      {
        id,
        workflow: 'LOAD',
        kind: 'COLLECTION',
        certNumber: '730415',
        startedAt: new Date('2026-10-12T12:15:00Z'),
      },
    ]);
    expect([phone.nextNumber('LOAD'), phone.lastUsedNumber('LOAD'), phone.waiting]).toEqual([
      101001,
      null,
      [],
    ]);
    clock.advance(25);
    const event = saved(phone.complete(id, { number: made, debrisType: 'Vegetative' }));
    expect([event.id, event.ticketNumber, event.certNumber]).toEqual([id, '101001', '730415']);
    expect([phone.open, phone.lastUsedNumber('LOAD')]).toEqual([[], 101001]);
    expect(() => phone.begin('LOAD', 'COLLECTION')).toThrow('starts with a badge scanned');
  });

  it('AC-04-10 the first field event makes the number, the next of its block, block after block', () => {
    const { phone } = phoneAt('08:15');
    const numbers = [1, 2, 3, 4].map(
      () =>
        saved(phone.complete(phone.begin('LOAD', 'COLLECTION', '730415'), { number: made }))
          .ticketNumber,
    );
    expect(numbers).toEqual(['101001', '101002', '101003', '105001']);
    const haulOut = phone.begin('HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419');
    const unitRate = phone.begin('UNIT_RATE', 'UNIT_RATE', '730417');
    expect([
      saved(phone.complete(haulOut, { number: made, loadCall: 90 })).ticketNumber,
      saved(phone.complete(unitRate, { number: made, payableType: 'Hangers' })).ticketNumber,
    ]).toEqual(['201001', '301001']);
  });

  it('AC-04-10 a tower holds no block: it scans the number and never makes one', () => {
    const { phone } = phoneAt('09:05', { name: 'P1-TWR-TDSR', siteId: tdsr });
    const tower = new SimulatedDevice(
      { ...phone.setup, lists: { ...lists, blocks: [] } },
      phoneAt('09:05').clock,
    );
    const id = tower.begin('LOAD', 'DISPOSAL', '730415');
    expect(tower.nextNumber('LOAD')).toBeNull();
    expect(() => tower.complete(id, { number: made, loadCall: 80 })).toThrow(
      'P1-TWR-TDSR holds no LOAD number to give out',
    );
    const event = saved(tower.complete(id, { number: scanned('101001'), loadCall: 80 }));
    expect([event.ticketNumber, event.numberTyped, event.siteId]).toEqual(['101001', false, tdsr]);
  });

  it('AC-04-11 a number entered again that doesn’t match saves nothing: the same number shows until it does', () => {
    const { phone } = phoneAt('08:15');
    const id = phone.begin('LOAD', 'COLLECTION', '730415');
    expect(phone.complete(id, { number: made, reentered: '101010' })).toEqual({
      saved: false,
      reason: 'NUMBER_MISMATCH',
      shown: '101001',
      reentered: '101010',
    });
    expect([phone.open.length, phone.waiting.length, phone.lastUsedNumber('LOAD')]).toEqual([
      1,
      0,
      null,
    ]);
    expect(saved(phone.complete(id, { number: made, reentered: '101001' })).ticketNumber).toBe(
      '101001',
    );
    const disposal = phone.begin('LOAD', 'DISPOSAL', '730415');
    expect(phone.complete(disposal, { number: scanned('101001'), reentered: '101007' })).toEqual({
      saved: false,
      reason: 'NUMBER_MISMATCH',
      shown: '101001',
      reentered: '101007',
    });
    expect(phone.open.map((event) => event.id)).toEqual([disposal]);
  });

  it('a field event cancelled stays on the phone, is never sent, and took no number', async () => {
    const { phone } = phoneAt('08:15');
    const mistake = phone.begin('LOAD', 'COLLECTION', '730416');
    phone.cancel(mistake);
    expect([
      phone.open,
      phone.cancelled.map((event) => event.id),
      phone.nextNumber('LOAD'),
    ]).toEqual([[], [mistake], 101001]);
    expect(() => phone.complete(mistake, { number: made })).toThrow('has no field event');
    expect(await phone.sync(new Received())).toBe(0);
  });

  it('a typed number carries its reason and is not entered twice', () => {
    const { phone } = phoneAt('12:10');
    const event = saved(
      phone.complete(phone.begin('LOAD', 'DISPOSAL', '730416'), {
        number: typed('101060', 'Barcode damaged'),
        loadCall: 60,
      }),
    );
    expect([event.ticketNumber, event.numberTyped, event.numberTypedReasonId]).toEqual([
      '101060',
      true,
      listId('Barcode damaged'),
    ]);
    expect(() =>
      phone.complete(phone.begin('LOAD', 'DISPOSAL', '730416'), {
        number: typed('101061', 'Felt like it'),
      }),
    ).toThrow('no reason "Felt like it" in its lists');
  });

  it('AC-04-92 picks are names from its lists, each sent as the id the list holds', () => {
    const { phone } = phoneAt('08:15');
    const event = saved(
      phone.complete(phone.begin('LOAD', 'COLLECTION', '730415'), {
        number: made,
        debrisType: 'C&D',
        address: '14 Heron St',
        addressSource: 'TYPED',
        carriedTickets: ['301004'],
      }),
    );
    expect([event.formDebrisTypeId, event.payItemId, event.address, event.carriedTickets]).toEqual([
      listId('C&D'),
      null,
      '14 Heron St',
      ['301004'],
    ]);
    expect(phone.payableTypes).toEqual(['Hangers', 'Leaners', 'Stumps', 'White Goods']);
    // A load's list is the load form's: Mulch is the haul-out form's.
    expect(() =>
      phone.complete(phone.begin('LOAD', 'COLLECTION', '730415'), {
        number: made,
        debrisType: 'Mulch',
      }),
    ).toThrow('no debris type "Mulch" in its lists');
  });

  it('refuses what its kind doesn’t record, as the domain’s rule says', () => {
    const { phone } = phoneAt('08:15');
    expect(() =>
      phone.complete(phone.begin('LOAD', 'COLLECTION', '730415'), { number: made, loadCall: 80 }),
    ).toThrow("A collection doesn't record a load call.");
  });

  it('AC-04-59 works a unit rate pay item out from the payable type’s bands', () => {
    const { phone } = phoneAt('09:40');
    const ticket = (completion: Parameters<SimulatedDevice['complete']>[1]) =>
      saved(phone.complete(phone.begin('UNIT_RATE', 'UNIT_RATE', '730417'), completion));
    const leaner = ticket({
      number: made,
      payableType: 'Leaners',
      count: 1,
      measurement: { inches: 56.5, measuredAs: 'CIRCUMFERENCE' },
    });
    expect([
      leaner.payableTypeId,
      leaner.kindOfWorkId,
      leaner.payItemId,
      leaner.measurementInches,
      leaner.measuredAs,
    ]).toEqual([
      listId('Leaners'),
      listId('Leaners'),
      listId('LNR-RMV-EA-24'),
      56.5,
      'CIRCUMFERENCE',
    ]);
    const stump = (inches: number) =>
      ticket({
        number: made,
        payableType: 'Stumps',
        count: 1,
        measurement: { inches, measuredAs: 'DIAMETER' },
      }).payItemId;
    expect([stump(30), stump(40), stump(20)]).toEqual([
      listId('STP-RMV-EA-36'),
      listId('STP-RMV-EA-48'),
      null,
    ]);
    const whiteGoods = ticket({
      number: made,
      payableType: 'White Goods',
      items: [
        { name: 'Washer', quantity: 2 },
        { name: 'Dryer', quantity: 1 },
      ],
    });
    expect([whiteGoods.payItemId, whiteGoods.unitCount, whiteGoods.items]).toEqual([
      listId('WG-RMV-EA'),
      null,
      [
        { itemNameId: listId('Washer'), quantity: 2 },
        { itemNameId: listId('Dryer'), quantity: 1 },
      ],
    ]);
  });

  it('AC-04-70 a crew badge scanned stays the working crew until another is scanned', () => {
    const { phone } = phoneAt('09:40');
    const tickets = ['730417', undefined, undefined, '730418', undefined].map((badge) =>
      saved(
        phone.complete(phone.begin('UNIT_RATE', 'UNIT_RATE', badge), {
          number: made,
          payableType: 'Hangers',
        }),
      ),
    );
    expect(tickets.map((event) => [event.ticketNumber, event.certNumber])).toEqual([
      ['301001', '730417'],
      ['301002', '730417'],
      ['301003', '730417'],
      ['301004', '730418'],
      ['301005', '730418'],
    ]);
    expect(phone.workingCrew).toBe('730418');
    // A truck's badge is scanned every time.
    expect(() => phone.begin('LOAD', 'COLLECTION')).toThrow('starts with a badge scanned');
  });

  it('a split chain carries one number: each pile after the first takes its chain’s', () => {
    const { phone } = phoneAt('15:10', { siteId: tdsr });
    const pile = (suffix: string, tag: string, loadCall: number, after?: string) => {
      const id = phone.begin('HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419');
      const event = saved(
        phone.complete(id, {
          number: after === undefined ? made : chained(after),
          splitSuffix: suffix,
          debrisType: 'Mulch',
          fieldTag: tag,
          loadCall,
        }),
      );
      return event;
    };
    const first = pile('A', 'Zone 1 pile', 10);
    const second = pile('B', 'Zone 2 pile', 35, first.id);
    expect(
      [first, second].map((event) => [event.ticketNumber, event.splitSuffix, event.fieldTagId]),
    ).toEqual([
      ['201001', 'A', listId('Zone 1 pile')],
      ['201001', 'B', listId('Zone 2 pile')],
    ]);
    expect(phone.nextNumber('HAUL_OUT')).toBe(201002);
  });

  it('keeps its count of numbers when the next day’s monitor signs in; the story may pass numbers over', () => {
    const { phone } = phoneAt('08:15');
    saved(phone.complete(phone.begin('LOAD', 'COLLECTION', '730415'), { number: made }));
    phone.signIn({ ...phone.setup, assignmentId: '00000000-0000-7000-8000-0000000000aa' });
    const next = saved(
      phone.complete(phone.begin('LOAD', 'COLLECTION', '730415'), { number: made }),
    );
    expect([next.ticketNumber, next.assignmentId]).toEqual([
      '101002',
      '00000000-0000-7000-8000-0000000000aa',
    ]);
    phone.passOver('HAUL_OUT', 201003);
    expect(phone.nextNumber('HAUL_OUT')).toBe(201004);
    expect(() => {
      phone.signIn({ ...phone.setup, deviceId: tdsr });
    }).toThrow('is one phone');
  });

  it('sends a scale receipt before the disposal that points at it, and forms in the order made', async () => {
    const { phone, clock } = phoneAt('17:00', { siteId: tdsr });
    const disposal = saved(
      phone.complete(phone.begin('HAUL_OUT', 'HAUL_OUT_DISPOSAL', '730419'), {
        number: scanned('201004'),
        debrisType: 'Mulch',
        scaleReceipt: {
          receiptNumber: 'CCL-51207',
          grossWeightLb: 79600,
          tareWeightLb: 31600,
          netWeightLb: 48000,
          netWeightTons: 24,
        },
      }),
    );
    clock.advance(5);
    const incident = phone.incident({
      type: 'Property damage',
      subType: 'Mailbox struck',
      address: '22 Elm St',
      contractor: 'Coastline Haulers LLC',
      certNumber: '730416',
    });
    const log = phone.dropOffLog({ residentName: 'Carl Jensen', originAddress: '14 Heron St' });
    const intake = new Received();
    expect(await phone.sync(intake)).toBe(4);
    expect(intake.records.map((sent) => sent.record)).toEqual([
      'SCALE_RECEIPT',
      'FIELD_EVENT',
      'INCIDENT',
      'DROP_OFF_LOG',
    ]);
    const [receipt] = intake.records;
    expect(receipt).toMatchObject({
      scaleReceipt: { id: disposal.scaleReceiptId, receiptNumber: 'CCL-51207', siteId: tdsr },
    });
    expect([incident.incidentTypeId, incident.incidentSubTypeId, log.siteId]).toEqual([
      listId('Property damage'),
      listId('Mailbox struck'),
      tdsr,
    ]);
    expect(uuidv7Time(incident.id)).toEqual(incident.madeAt);
    // AC-04-99: what the incident names, the contractor picked by name, the cert number as given.
    expect([incident.contractorId, incident.certNumber, incident.roeNumber]).toEqual([
      listId('Coastline Haulers LLC'),
      '730416',
      null,
    ]);
    // AC-04-101: P1's incident form offers no ROE number, so the phone has nowhere to take one;
    // with none of the three, an incident is an incident still.
    const type = { type: 'Property damage' };
    expect(() => phone.incident({ ...type, roeNumber: 'R-0007' })).toThrow(
      "isn't offered an ROE number",
    );
    expect(() => phone.incident({ ...type, contractor: 'Summit Debris Co' })).toThrow(
      'has no contractor "Summit Debris Co"',
    );
    const bare = new SimulatedDevice(
      { ...setup, lists: { ...lists, incidentOffers: [], contractors: [] } },
      new StoryClock('2026-10-12T08:20:00-04:00'),
    );
    expect(() => bare.incident({ ...type, certNumber: '730416' })).toThrow('a cert number');
    expect(bare.incident(type)).toMatchObject({
      contractorId: null,
      certNumber: null,
      roeNumber: null,
    });
    const curb = phoneAt('08:15').phone;
    expect(() => curb.dropOffLog({})).toThrow('this assignment has no site');
  });

  it('gives an ROE the next number of its ROE block, and a certifying phone its cert number', () => {
    const { phone } = phoneAt('08:15');
    const first = phone.roe({ address: '412 Cedar Ct', signed: true, signedDate: '2026-10-09' });
    const paper = phone.roe({ paperNumber: 'ROE 2026-0412', signed: false });
    const second = phone.roe({ address: '416 Cedar Ct', signed: true });
    expect([first.roeNumber, paper.roeNumber, second.roeNumber]).toEqual([
      'R-0007',
      'ROE 2026-0412',
      'R-0008',
    ]);
    expect([phone.takeCertNumber(), phone.takeCertNumber()]).toEqual(['730415', '730416']);
    expect(phone.waitingRecords.map((sent) => sent.record)).toEqual(['ROE', 'ROE', 'ROE']);
  });

  it('AC-05-05, AC-05-45 sends its records first and its photographs after, keeps each record’s own answer, and shows one that was not saved', async () => {
    const { phone, clock } = phoneAt('10:22', { name: 'P1-TWR-TDSR', siteId: tdsr });
    const first = saved(
      phone.complete(phone.begin('LOAD', 'DISPOSAL', '730416'), {
        number: scanned('101020'),
        loadCall: 70,
      }),
    );
    const photo = phone.photograph({ of: { kind: 'FIELD_EVENT', id: first.id } });
    clock.advance(78);
    const second = saved(
      phone.complete(phone.begin('LOAD', 'DISPOSAL', '730416'), {
        number: scanned('101020'),
        loadCall: 65,
      }),
    );
    expect(phone.waitingRecords.map((sent) => sent.record)).toEqual([
      'FIELD_EVENT',
      'PHOTO',
      'FIELD_EVENT',
    ]);
    // The fingerprint is taken at capture, 64 hexadecimal digits; the photograph is its record's.
    expect(photo.originalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect([photo.owner, uuidv7Time(photo.id)]).toEqual([
      { kind: 'FIELD_EVENT', id: first.id },
      photo.capturedAt,
    ]);
    const intake = new Received();
    intake.quarantines.add(second.id);
    expect(await phone.sync(intake)).toBe(3);
    expect(intake.records.map((sent) => sent.record)).toEqual([
      'FIELD_EVENT',
      'FIELD_EVENT',
      'PHOTO',
    ]);
    expect(phone.answers.map((told) => told.answer.answer)).toEqual([
      'SAVED',
      'QUARANTINED',
      'SAVED',
    ]);
    // The quarantined record left the queue (it was answered), and is shown as not saved.
    expect(phone.waitingRecords).toEqual([]);
    expect(phone.notSaved.map((told) => heldId(told.sent))).toEqual([second.id]);
  });

  it('AC-05-10 a tandem’s second disposal points at the receipt recorded with the first: one receipt, sent once', () => {
    const { phone, clock } = phoneAt('09:30', { name: 'P1-TWR-LF', siteId: tdsr });
    const front = phone.begin('LOAD', 'DISPOSAL', '730415');
    const rear = phone.begin('LOAD', 'DISPOSAL', '730416');
    clock.advance(10);
    const first = saved(
      phone.complete(front, {
        number: scanned('101040'),
        scaleReceipt: { receiptNumber: 'BCL-88241', netWeightTons: 17.1 },
      }),
    );
    const second = saved(
      phone.complete(rear, { number: scanned('101041'), sameScaleReceiptAs: first.id }),
    );
    expect(second.scaleReceiptId).toBe(first.scaleReceiptId);
    expect(phone.waitingRecords.map((sent) => sent.record)).toEqual([
      'SCALE_RECEIPT',
      'FIELD_EVENT',
      'FIELD_EVENT',
    ]);
    expect(() =>
      phone.complete(phone.begin('LOAD', 'DISPOSAL', '730415'), {
        number: scanned('101042'),
        // An id that is no record's: the second's with its last digit changed (to '0', or to
        // '1' when it already ends in '0').
        sameScaleReceiptAs: second.id.replace(/.$/, (last) => (last === '0' ? '1' : '0')),
      }),
    ).toThrow('recorded no scale receipt');
  });

  it('a survey picks its work type by name and carries the ROE number as picked or typed', () => {
    const { phone } = phoneAt('08:15');
    const survey = phone.survey({
      workType: 'Pre-work',
      surveyNumber: 'APN 14-0321-007',
      roeNumber: 'R-0007',
    });
    expect([survey.workTypeId, survey.surveyNumber, survey.roeNumber]).toEqual([
      listId('Pre-work'),
      'APN 14-0321-007',
      'R-0007',
    ]);
    expect(phone.waitingRecords.map((sent) => sent.record)).toEqual(['SURVEY']);
    expect(() => phone.survey({ workType: 'Mid-work' })).toThrow('has no survey work type');
  });
});
