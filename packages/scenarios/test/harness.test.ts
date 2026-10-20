// The harness's own pieces, without a database (BACKLOG 0.4.1; ADR-275): the story's clock, the
// ids a phone makes, and a phone that keeps what it records until it syncs. And how that phone
// captures (BACKLOG 1.3.7; spec/acceptance/04-field-capture.md AC-04-10, 11, 17, 59, 70, 91, 92):
// badge first, the details picked by name, the number last and entered again.
import { createHash } from 'node:crypto';

import type { SyncAnswer } from '@open-adms/api';
import {
  photoRead,
  recordRead,
  type FilePartSent,
  type PhotoFileAnswer,
  type RecordAnswer,
  type SyncAnswered,
  type SyncReceived,
} from '@open-adms/contracts';
import { uuidv7Time } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { projectTime, StoryClock, utcOffsetMinutes } from '../src/clock.ts';
import {
  chained,
  fromPhone,
  heldId,
  made,
  scanned,
  SimulatedDevice,
  typed,
  type PhoneLists,
  type PhoneRecord,
  type PhoneServer,
  type RecordedEvent,
} from '../src/device.ts';

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
  certifications: [],
  vehicleTypes: [],
  vehicleFeatures: [],
  crewTypes: [],
  primes: [],
  helpers: [],
  quantityLookup: [],
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
  }
}

// A server in memory, in the place of the API's `Sync`: it reads one sync as `Sync` does (each
// record by the contract's own rule, given the phone that synced) and keeps what it is sent.
class Received implements PhoneServer {
  readonly records: PhoneRecord[] = [];
  readonly photos: string[] = [];
  // Each photograph's file, whole, as its parts arrived.
  readonly files = new Map<string, Buffer>();
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

  // A part of a file, taken where it goes on from the last: kept once whole (ADR-482).
  filePart(_deviceId: string, part: FilePartSent): Promise<PhotoFileAnswer> {
    const name = `${part.photoId} ${part.file}`;
    const so = this.files.get(name) ?? Buffer.alloc(0);
    if (so.length === part.length) return Promise.resolve({ upload: 'KEPT' });
    if (part.offset !== so.length) {
      return Promise.resolve({ upload: 'RECEIVING', received: so.length, length: part.length });
    }
    const now = Buffer.concat([so, part.bytes]);
    this.files.set(name, now);
    return Promise.resolve(
      now.length === part.length
        ? { upload: 'KEPT' }
        : { upload: 'RECEIVING', received: now.length, length: part.length },
    );
  }

  async received(deviceId: string, sent: SyncReceived): Promise<{ answered: SyncAnswered }> {
    const records: RecordAnswer[] = [];
    for (const one of sent.records) {
      const read = recordRead(one);
      if (!read.read) throw new Error(read.notice.message);
      const record = fromPhone(deviceId, read.record);
      if (record.record === 'CERTIFICATION') throw new Error('No certification is sent here.');
      records.push(await this.receive(record));
    }
    const photos: SyncAnswered['photos'] = [];
    for (const one of sent.photos) {
      const read = photoRead(one);
      if (!read.read) throw new Error(read.notice.message);
      this.photos.push(read.photo.id);
      photos.push({ answer: 'SAVED', id: read.photo.id, notes: [] });
    }
    return {
      answered: {
        unplannedAssignments: [],
        passcodeUses: [],
        records,
        photos,
        // No report is taken: the phone holds what it held.
        numbers: sent.lastUsed.map(({ projectId, series }) => ({
          projectId,
          series,
          toppedUp: false,
          blocks: [],
        })),
        masterPasscode: { version: 1, check: null },
        setupVersion: null,
      },
    };
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

describe('a simulated phone', () => {
  it('keeps what its monitor records until it syncs, then sends it in the order recorded', async () => {
    const clock = new StoryClock('2026-10-12T08:15:00-04:00');
    const phone = new SimulatedDevice(setup, clock);
    const first = phone.begin('LOAD', 'COLLECTION', '730415', scanned('101001'));
    clock.advance(25);
    phone.complete(first, {});
    const second = phone.begin('LOAD', 'COLLECTION', '730415', scanned('101002'));
    clock.advance(20);
    phone.complete(second, {});
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
    const id = phone.begin('LOAD', 'DISPOSAL', '730415', scanned('101001'));
    clock.advance(20);
    const { event } = phone.complete(id, { loadCall: 80 });
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
      phone.complete(phone.begin('LOAD', 'COLLECTION', '730415', scanned(number)), {});
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
    expect(() => phone.complete('not-started', {})).toThrow('has no field event');
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
  certifications: [],
  vehicleTypes: [],
  vehicleFeatures: [],
  crewTypes: [],
  primes: [],
  helpers: [],
  quantityLookup: [],
};
const tdsr = '00000000-0000-7000-8000-00000000000e';
const phoneAt = (time: string, more: Partial<typeof setup> & { siteId?: string } = {}) => {
  const clock = new StoryClock(`2026-10-12T${time}:00-04:00`);
  return { clock, phone: new SimulatedDevice({ ...setup, lists, ...more }, clock) };
};
const saved = (completed: ReturnType<SimulatedDevice['complete']>): RecordedEvent =>
  completed.event;

describe('a simulated phone captures the badge, then the number, at New (ADR-571; C179)', () => {
  it('AC-04-91, AC-04-17 New scans the badge, then takes the number: the field event waits with its id and its number', () => {
    const { phone, clock } = phoneAt('08:15');
    const id = phone.begin('LOAD', 'COLLECTION', '730415', made);
    expect(phone.opened).toEqual([
      {
        id,
        workflow: 'LOAD',
        kind: 'COLLECTION',
        certNumber: '730415',
        startedAt: new Date('2026-10-12T12:15:00Z'),
        ticketNumber: '101001',
        numberTyped: false,
        numberTypedReason: null,
      },
    ]);
    expect([phone.nextNumber('LOAD'), phone.lastUsedNumber('LOAD'), phone.waiting]).toEqual([
      101002,
      101001,
      [],
    ]);
    clock.advance(25);
    const event = saved(phone.complete(id, { debrisType: 'Vegetative' }));
    expect([event.id, event.ticketNumber, event.certNumber]).toEqual([id, '101001', '730415']);
    expect([phone.opened, phone.lastUsedNumber('LOAD')]).toEqual([[], 101001]);
    expect(() => phone.begin('LOAD', 'COLLECTION', undefined, made)).toThrow(
      'starts with a badge scanned',
    );
  });

  it('AC-11-76 one open field event per truck: a badge whose truck has one open opens that one and takes no number; another opens once it is submitted; a crew is not held to one', () => {
    const { phone } = phoneAt('08:15');
    const first = phone.begin('LOAD', 'COLLECTION', '730415', made);
    expect(phone.begin('LOAD', 'COLLECTION', '730415', made)).toBe(first);
    expect([phone.opened.length, phone.nextNumber('LOAD')]).toEqual([1, 101002]);
    const other = phone.begin('LOAD', 'COLLECTION', '730416', made);
    expect(phone.opened.map((event) => event.ticketNumber)).toEqual(['101001', '101002']);
    phone.complete(first, {});
    const next = phone.begin('LOAD', 'COLLECTION', '730415', made);
    expect([next === first, next === other, phone.opened.length]).toEqual([false, false, 2]);
    const crew = phone.begin('UNIT_RATE', 'UNIT_RATE', '730417', made);
    expect(phone.begin('UNIT_RATE', 'UNIT_RATE', '730417', made)).not.toBe(crew);
  });

  it('AC-04-10 the first field event makes the number, the next of its block, block after block', () => {
    const { phone } = phoneAt('08:15');
    const numbers = [1, 2, 3, 4].map(
      () =>
        saved(phone.complete(phone.begin('LOAD', 'COLLECTION', '730415', made), {})).ticketNumber,
    );
    expect(numbers).toEqual(['101001', '101002', '101003', '105001']);
    const haulOut = phone.begin('HAUL_OUT', 'HAUL_OUT_COLLECTION', '730419', made);
    const unitRate = phone.begin('UNIT_RATE', 'UNIT_RATE', '730417', made);
    expect([
      saved(phone.complete(haulOut, { loadCall: 90 })).ticketNumber,
      saved(phone.complete(unitRate, { payableType: 'Hangers' })).ticketNumber,
    ]).toEqual(['201001', '301001']);
  });

  it('AC-04-10 a tower holds no block: it scans the number and never makes one', () => {
    const { phone } = phoneAt('09:05', { name: 'P1-TWR-TDSR', siteId: tdsr });
    const tower = new SimulatedDevice(
      { ...phone.setup, lists: { ...lists, blocks: [] } },
      phoneAt('09:05').clock,
    );
    expect(tower.nextNumber('LOAD')).toBeNull();
    expect(() => tower.begin('LOAD', 'DISPOSAL', '730415', made)).toThrow(
      'P1-TWR-TDSR holds no LOAD number to give out',
    );
    const id = tower.begin('LOAD', 'DISPOSAL', '730415', scanned('101001'));
    const event = saved(tower.complete(id, { loadCall: 80 }));
    expect([event.ticketNumber, event.numberTyped, event.siteId]).toEqual(['101001', false, tdsr]);
  });

  it('AC-04-11, AC-11-82 a number the phone made opens at once, never typed again; one typed off a barcode that won’t read and typed again wrong opens nothing; a scanned one isn’t typed again', () => {
    const { phone } = phoneAt('08:15');
    // Made by the phone: whatever the story says was typed, it opens (ADR-589).
    const opened = phone.open('LOAD', 'COLLECTION', '730415', made, '101010');
    if (!opened.opened) throw new Error('not opened');
    expect([phone.opened.length, phone.lastUsedNumber('LOAD')]).toEqual([1, 101001]);
    expect(saved(phone.complete(opened.id, {})).ticketNumber).toBe('101001');
    expect(
      phone.open('LOAD', 'DISPOSAL', '730415', typed('101060', 'Barcode damaged'), '101006'),
    ).toEqual({ opened: false, reason: 'NUMBER_MISMATCH', shown: '101060', reentered: '101006' });
    // A scan is shown and never typed again: whatever the story says it typed, it opens.
    const disposal = phone.open('LOAD', 'DISPOSAL', '730415', scanned('101001'), '101007');
    expect(disposal.opened).toBe(true);
    expect(phone.opened.map((event) => event.ticketNumber)).toEqual(['101001']);
  });

  it('AC-04-95 a field event cancelled stays on the phone and is never sent; it keeps the number it took at New, never made again', async () => {
    const { phone } = phoneAt('08:15');
    const mistake = phone.begin('LOAD', 'COLLECTION', '730416', made);
    phone.cancel(mistake);
    expect([
      phone.opened,
      phone.cancelled.map((event) => [event.id, event.ticketNumber]),
      phone.nextNumber('LOAD'),
      phone.lastUsedNumber('LOAD'),
    ]).toEqual([[], [[mistake, '101001']], 101002, 101001]);
    expect(() => phone.complete(mistake, {})).toThrow('has no field event');
    expect(await phone.sync(new Received())).toBe(0);
  });

  it('a typed number carries its reason and is not entered twice', () => {
    const { phone } = phoneAt('12:10');
    const event = saved(
      phone.complete(
        phone.begin('LOAD', 'DISPOSAL', '730416', typed('101060', 'Barcode damaged')),
        { loadCall: 60 },
      ),
    );
    expect([event.ticketNumber, event.numberTyped, event.numberTypedReasonId]).toEqual([
      '101060',
      true,
      listId('Barcode damaged'),
    ]);
    expect(() =>
      phone.complete(
        phone.begin('LOAD', 'DISPOSAL', '730416', typed('101061', 'Felt like it')),
        {},
      ),
    ).toThrow('no reason "Felt like it" in its lists');
  });

  it('AC-04-92 picks are names from its lists, each sent as the id the list holds', () => {
    const { phone } = phoneAt('08:15');
    const event = saved(
      phone.complete(phone.begin('LOAD', 'COLLECTION', '730415', made), {
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
      phone.complete(phone.begin('LOAD', 'COLLECTION', '730415', made), { debrisType: 'Mulch' }),
    ).toThrow('no debris type "Mulch" in its lists');
  });

  it('refuses what its kind doesn’t record, as the domain’s rule says', () => {
    const { phone } = phoneAt('08:15');
    expect(() =>
      phone.complete(phone.begin('LOAD', 'COLLECTION', '730415', made), { loadCall: 80 }),
    ).toThrow("A collection doesn't record a load call.");
  });

  it('AC-04-59 works a unit rate pay item out from the payable type’s bands', () => {
    const { phone } = phoneAt('09:40');
    const ticket = (completion: Parameters<SimulatedDevice['complete']>[1]) =>
      saved(phone.complete(phone.begin('UNIT_RATE', 'UNIT_RATE', '730417', made), completion));
    const leaner = ticket({
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
        phone.complete(phone.begin('UNIT_RATE', 'UNIT_RATE', badge, made), {
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
    expect(() => phone.begin('LOAD', 'COLLECTION', undefined, made)).toThrow(
      'starts with a badge scanned',
    );
  });

  it('a split chain carries one number: each pile after the first takes its chain’s', () => {
    const { phone } = phoneAt('15:10', { siteId: tdsr });
    const pile = (suffix: string, tag: string, loadCall: number, after?: string) => {
      const id = phone.begin(
        'HAUL_OUT',
        'HAUL_OUT_COLLECTION',
        '730419',
        after === undefined ? made : chained(after),
      );
      const event = saved(
        phone.complete(id, {
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
    saved(phone.complete(phone.begin('LOAD', 'COLLECTION', '730415', made), {}));
    phone.signIn({ ...phone.setup, assignmentId: '00000000-0000-7000-8000-0000000000aa' });
    const next = saved(phone.complete(phone.begin('LOAD', 'COLLECTION', '730415', made), {}));
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
      phone.complete(phone.begin('HAUL_OUT', 'HAUL_OUT_DISPOSAL', '730419', scanned('201004')), {
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

  it('AC-04-87, C69 answers the firm’s own fields of the newest version its lists hold, with that version; a required one unanswered isn’t taken, a photograph’s aside; a form with none takes no answer', () => {
    const definition: NonNullable<NonNullable<PhoneLists['forms']>[number]['definition']> = {
      id: listId('incident fields v2'),
      version: 2,
      fields: [
        { id: 'police-report', label: 'Police report number', type: 'TEXT', required: true },
        { id: 'damage-photo', label: 'Photo of the damage', type: 'PHOTO', required: true },
        { id: 'blocked', label: 'Road blocked?', type: 'YES_NO', required: false },
      ],
    };
    const held: PhoneLists = {
      ...lists,
      forms: [
        { documentType: 'INCIDENT', gpsRequired: false, definition },
        { documentType: 'DROP_OFF_LOG', gpsRequired: false, definition: null },
      ],
    };
    const phone = new SimulatedDevice(
      { ...setup, siteId: tdsr, lists: held },
      new StoryClock('2026-10-12T11:50:00-04:00'),
    );
    const type = { type: 'Property damage' };
    expect(phone.incident({ ...type, answers: { 'police-report': 'BC-2026-1187' } })).toMatchObject(
      { formDefinitionId: definition.id, answers: { 'police-report': 'BC-2026-1187' } },
    );
    expect(() => phone.incident(type)).toThrow('asks for "Police report number"');
    expect(() =>
      phone.incident({ ...type, answers: { 'police-report': 'BC-1', blocked: 'yes' } }),
    ).toThrow("answers its screen couldn't take");
    expect(() => phone.dropOffLog({ answers: { bags: 3 } })).toThrow(
      "has none of the firm's own fields",
    );
    expect(phone.dropOffLog({})).not.toHaveProperty('formDefinitionId');
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
      phone.complete(phone.begin('LOAD', 'DISPOSAL', '730416', scanned('101020')), {
        loadCall: 70,
      }),
    );
    const photo = phone.photograph({ of: { kind: 'FIELD_EVENT', id: first.id } });
    clock.advance(78);
    const second = saved(
      phone.complete(phone.begin('LOAD', 'DISPOSAL', '730416', scanned('101020')), {
        loadCall: 65,
      }),
    );
    expect([
      phone.waitingRecords.map((sent) => sent.record),
      phone.waitingPhotos.map(({ id }) => id),
    ]).toEqual([['FIELD_EVENT', 'FIELD_EVENT'], [photo.id]]);
    // Both fingerprints are taken by the phone, 64 hexadecimal digits; the photograph is its
    // record's, and never says where its file is kept (ADR-481).
    expect([photo.originalSha256, photo.uploadedSha256]).toEqual([
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.stringMatching(/^[0-9a-f]{64}$/),
    ]);
    expect([photo.owner, uuidv7Time(photo.id), 'objectKey' in photo]).toEqual([
      { kind: 'FIELD_EVENT', id: first.id },
      new Date(photo.capturedAt),
      false,
    ]);
    const intake = new Received();
    intake.quarantines.add(second.id);
    expect(await phone.sync(intake)).toBe(3);
    // One sync: the records first, the photograph after them.
    expect([intake.records.map((sent) => sent.record), intake.photos]).toEqual([
      ['FIELD_EVENT', 'FIELD_EVENT'],
      [photo.id],
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
    const front = phone.begin('LOAD', 'DISPOSAL', '730415', scanned('101040'));
    const rear = phone.begin('LOAD', 'DISPOSAL', '730416', scanned('101041'));
    clock.advance(10);
    const first = saved(
      phone.complete(front, {
        scaleReceipt: { receiptNumber: 'BCL-88241', netWeightTons: 17.1 },
      }),
    );
    const second = saved(phone.complete(rear, { sameScaleReceiptAs: first.id }));
    expect(second.scaleReceiptId).toBe(first.scaleReceiptId);
    expect(phone.waitingRecords.map((sent) => sent.record)).toEqual([
      'SCALE_RECEIPT',
      'FIELD_EVENT',
      'FIELD_EVENT',
    ]);
    expect(() =>
      phone.complete(phone.begin('LOAD', 'DISPOSAL', '730415', scanned('101042')), {
        // An id that is no record's: the second's with its last digit changed (to '0', or to
        // '1' when it already ends in '0').
        sameScaleReceiptAs: second.id.replace(/.$/, (last) => (last === '0' ? '1' : '0')),
      }),
    ).toThrow('recorded no scale receipt');
  });

  it('REQ-124f, AC-04-38, AC-11-41, C83 a tower asks its site’s lookup as the field app does: the weight, never a load call, where the load is weighed; the count where it is counted; a haul-out’s collection always its load call', () => {
    const coastline = named('Coastline Haulers LLC');
    const atCypress = new SimulatedDevice(
      {
        ...setup,
        name: 'P1-TWR-CCL',
        siteId: tdsr,
        lists: {
          ...lists,
          debrisTypes: { LOAD: [named('Vegetative to FDS'), named('White Goods')] },
          certifications: [{ id: listId('730421'), certNumber: '730421', prime: coastline }],
          quantityLookup: [
            {
              form: 'LOAD',
              debrisTypeId: listId('Vegetative to FDS'),
              primeId: coastline.id,
              asks: 'SCALE_WEIGHT',
            },
            {
              form: 'LOAD',
              debrisTypeId: listId('White Goods'),
              primeId: coastline.id,
              asks: 'CARRIED_COUNT',
            },
          ],
        },
      },
      new StoryClock('2026-10-15T10:30:00-04:00'),
    );
    const weighed = atCypress.begin('LOAD', 'DISPOSAL', '730421', scanned('101050'));
    expect(() =>
      atCypress.complete(weighed, { debrisType: 'Vegetative to FDS', loadCall: 80 }),
    ).toThrow('asks for SCALE_WEIGHT (LOOKUP), and a phone of ours takes no other quantity');
    expect(
      saved(
        atCypress.complete(weighed, {
          debrisType: 'Vegetative to FDS',
          scaleReceipt: { receiptNumber: 'CCL-51310', netWeightTons: 17.1 },
        }),
      ).loadCall,
    ).toBeNull();
    const counted = atCypress.begin('LOAD', 'DISPOSAL', '730421', scanned('101014'));
    expect(() => atCypress.complete(counted, { debrisType: 'White Goods', loadCall: 50 })).toThrow(
      'asks for CARRIED_COUNT',
    );
    expect(
      saved(atCypress.complete(counted, { debrisType: 'White Goods', carriedCount: 1 }))
        .carriedCount,
    ).toBe(1);
    // A truck the lists don't hold: every prime's row, where they agree.
    const unknown = atCypress.begin('LOAD', 'DISPOSAL', '730499', scanned('101018'));
    expect(() =>
      atCypress.complete(unknown, { debrisType: 'Vegetative to FDS', loadCall: 50 }),
    ).toThrow('asks for SCALE_WEIGHT (EVERY_PRIME)');
    // A debris type its lookup holds no row of: the load call, the receipt offered beside it.
    const elsewhere = new SimulatedDevice(
      { ...atCypress.setup, lists: { ...atCypress.setup.lists, quantityLookup: [] } },
      new StoryClock('2026-10-15T11:00:00-04:00'),
    );
    const notHeld = elsewhere.begin('LOAD', 'DISPOSAL', '730421', scanned('101019'));
    expect(
      saved(
        elsewhere.complete(notHeld, {
          debrisType: 'Vegetative to FDS',
          loadCall: 50,
          scaleReceipt: { receiptNumber: 'CCL-51311' },
        }),
      ).loadCall,
    ).toBe(50);
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
