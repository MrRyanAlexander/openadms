// The checks between a ticket's field events, on the certification and on its times
// (spec/acceptance/06-reconciliation.md sections D, E, the time rows of F, section O, AC-06-17,
// 117, 125, 130, 131, 133; spec/FLAGS.md §3.1, §3.2, §3.3, §3.10; ADR-344, 345). Each message is the catalogue's, word
// for word. The values are the example world's (spec/CONVENTIONS.md §6) and the catalogue's own
// example tickets: P1 in Bayline County, on America/New_York, active 12 October 2026 to
// 31 January 2027.
import { describe, expect, it } from 'vitest';

import {
  CertificationChecks,
  TicketChecks,
  Tickets,
  workTimeOf,
  type CheckSetup,
  type CheckedAround,
  type CheckedCertification,
  type CheckedFieldEvent,
  type FieldEventKindName,
  type FlagRaised,
  type Named,
  type Ticket,
  type WorkflowName,
} from '../src/index.ts';

const p1 = '0199a000-0000-7000-8000-0000000000a1';
const p2 = '0199a000-0000-7000-8000-0000000000a2';
// Kim Nguyen and Ana Brooks, monitors (CONVENTIONS §6).
const kim = '0199a000-0000-7000-8000-0000000000c1';
const ana = '0199a000-0000-7000-8000-0000000000c2';

// A time on the device's clock in Bayline County: four hours behind UTC until 1 November 2026,
// five after.
const at = (day: string, time: string, offset = '-04:00'): Date =>
  new Date(`${day}T${time}:00${offset}`);
const mon = '2026-10-12';
const tue = '2026-10-13';

const vegetative: Named = { id: 'entry-vegetative', name: 'Vegetative' };
const cAndD: Named = { id: 'entry-c-and-d', name: 'C&D' };
const marineVegetative: Named = { id: 'entry-marine-vegetative', name: 'Marine Vegetative' };
const barcodeDamaged: Named = { id: 'reason-barcode-damaged', name: 'Barcode damaged' };
const phoneFailed: Named = { id: 'reason-phone-failed', name: 'Phone failed' };
const luis: Named = { id: 'user-luis', name: 'Luis Ortega' };

const workflowOf: Record<FieldEventKindName, WorkflowName> = {
  COLLECTION: 'LOAD',
  DISPOSAL: 'LOAD',
  HAUL_OUT_COLLECTION: 'HAUL_OUT',
  HAUL_OUT_DISPOSAL: 'HAUL_OUT',
  UNIT_RATE: 'UNIT_RATE',
};

const enrolled = at('2026-10-05', '09:00');

let made = 0;
// A field event from a phone, as written "101008" or "102001-A", received six hours after it
// ended, with nothing about it to flag.
function recorded(
  kind: FieldEventKindName,
  written: string,
  startedAt: Date,
  endedAt: Date,
  more: Partial<CheckedFieldEvent> = {},
): CheckedFieldEvent {
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
    certKeyedByHand: false,
    typedCapacityCy: null,
    debrisType: kind === 'UNIT_RATE' ? null : vegetative,
    numberTyped: false,
    numberTypedReason: null,
    source: 'DEVICE',
    createdBy: null,
    createdReason: null,
    receivedAt: new Date(endedAt.getTime() + 6 * 3_600_000),
    deviceUtcOffsetMinutes: -240,
    device: { enrolledAt: enrolled, outOfServiceAt: null },
    clockOffAtSyncMinutes: null,
    carriedCount: null,
    loadCall: kind === 'DISPOSAL' || kind === 'HAUL_OUT_COLLECTION' ? 80 : null,
    scaleReceiptId: null,
    kindOfWorkId: kind === 'UNIT_RATE' ? 'kind-hangers' : null,
    unreadableGps: null,
    assignmentProjectId: more.projectId ?? p1,
    monitorId: kim,
    assignmentPersonId: kim,
    monitorAtSync: null,
    ...more,
  };
}

const minutes = (count: number): number => count * 60_000;
const collection = (
  written: string,
  end: Date,
  more: Partial<CheckedFieldEvent> = {},
): CheckedFieldEvent =>
  recorded('COLLECTION', written, new Date(end.getTime() - minutes(30)), end, more);
const disposal = (
  written: string,
  start: Date,
  more: Partial<CheckedFieldEvent> = {},
): CheckedFieldEvent =>
  recorded('DISPOSAL', written, start, new Date(start.getTime() + minutes(10)), more);

const certified = (
  certNumber: string,
  capacityCy: number | null,
  more: Partial<CheckedCertification> = {},
): CheckedCertification => ({
  certNumber,
  kind: capacityCy === null ? 'CREW' : 'CONTAINER',
  capacityCy,
  tagExpiry: null,
  revokedFrom: null,
  replacedBy: null,
  ...more,
});

const p1Setup = (more: Partial<CheckSetup> = {}): CheckSetup => ({
  timeZone: 'America/New_York',
  activeFrom: '2026-10-12',
  activeTo: '2027-01-31',
  certifications: [certified('730415', 65), certified('730416', 48), certified('730417', null)],
  deviceClockOffLimitMinutes: null,
  // P1 as these tests set it up: a split's own checks need splits allowed.
  allowSplitLoads: true,
  controlRanges: null,
  ...more,
});

const nothingAround: CheckedAround<CheckedFieldEvent> = { otherLoads: [], carried: null };

function ticketOf(events: readonly CheckedFieldEvent[]): Ticket<CheckedFieldEvent> {
  const [ticket] = new Tickets(events).tickets;
  if (ticket === undefined) throw new Error('No ticket.');
  return ticket;
}

// The flags a ticket's field events raise on P1 as set up, or as told.
const flagsOf = (
  events: readonly CheckedFieldEvent[],
  setup: Partial<CheckSetup> = {},
  around: Partial<CheckedAround<CheckedFieldEvent>> = {},
): readonly FlagRaised[] =>
  new TicketChecks(p1Setup(setup)).of(ticketOf(events), { ...nothingAround, ...around });

const messagesOf = (flags: readonly FlagRaised[]): string[] => flags.map((flag) => flag.message);

describe('between a ticket’s field events', () => {
  it('AC-06-25 a collection that picked Vegetative and a disposal that picked C&D: flagged, still bills', () => {
    const col = collection('101008', at(mon, '09:40'));
    const flags = flagsOf([col, disposal('101008', at(mon, '10:20'), { debrisType: cAndD })]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'DEBRIS_TYPE_MISMATCH',
      billing: 'BILLS',
      fieldEventId: col.id,
      facts: { collection: 'entry-vegetative', disposal: 'entry-c-and-d' },
    });
  });

  it('AC-06-26 only the exact entry matches, never a like name: Vegetative against the firm’s own Marine Vegetative is the same flag', () => {
    const flags = flagsOf([
      collection('101008', at(mon, '09:40')),
      disposal('101008', at(mon, '10:20'), { debrisType: marineVegetative }),
    ]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101008: debris type mismatch (collection Vegetative, disposal Marine Vegetative). Flagged for review.',
    ]);
  });

  it('AC-06-27 each property’s debris type on a split, and each pile’s on a haul-out, is compared with the disposal’s', () => {
    const b = collection('102001-B', at(mon, '09:05'), { debrisType: cAndD });
    const split = flagsOf([
      collection('102001-A', at(mon, '08:40')),
      b,
      disposal('102001', at(mon, '10:10')),
    ]);
    expect(messagesOf(split)).toEqual([
      'Ticket 102001: debris type mismatch (collection C&D, disposal Vegetative). Flagged for review.',
    ]);
    expect(split[0]?.fieldEventId).toBe(b.id);

    const haulOut = flagsOf([
      recorded('HAUL_OUT_COLLECTION', '201004-A', at(tue, '08:00'), at(tue, '08:20')),
      recorded('HAUL_OUT_COLLECTION', '201004-B', at(tue, '08:30'), at(tue, '08:50'), {
        debrisType: cAndD,
      }),
      recorded('HAUL_OUT_DISPOSAL', '201004', at(tue, '10:00'), at(tue, '10:15')),
    ]);
    expect(messagesOf(haulOut)).toEqual([
      'Ticket 201004: debris type mismatch (collection C&D, disposal Vegetative). Flagged for review.',
    ]);
  });

  it('AC-06-28 cert numbers are compared exactly; a difference is flagged, and the pair still forms', () => {
    const events = [
      collection('101008', at(mon, '09:40')),
      disposal('101008', at(mon, '10:20'), { certNumber: '730416' }),
    ];
    const flags = flagsOf(events);

    expect(messagesOf(flags)).toEqual([
      "Ticket 101008: truck number doesn't match (collection 730415, disposal 730416). Flagged for review.",
    ]);
    expect(flags[0]).toMatchObject({
      billing: 'BILLS',
      facts: { collection: '730415', disposal: '730416' },
    });
    expect(ticketOf(events).isWhole).toBe(true);
    // Never nearly: a number that differs by a space is another number.
    expect(
      flagsOf([
        collection('101008', at(mon, '09:40')),
        disposal('101008', at(mon, '10:20'), { certNumber: '730415 ' }),
      ]).map((flag) => flag.code),
    ).toContain('CERT_NUMBER_MISMATCH');
  });

  it('AC-06-29 a disposal that started before its collection ended is flagged, and nothing is reordered', () => {
    const events = [collection('101008', at(mon, '09:40')), disposal('101008', at(mon, '09:12'))];
    const flags = flagsOf(events);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101008: disposal started 09:12, before its collection ended 09:40. Flagged for review.',
    ]);
    expect(flags[0]?.billing).toBe('BILLS');
    expect(events.map((event) => event.startedAt)).toEqual([at(mon, '09:10'), at(mon, '09:12')]);
  });

  it('AC-06-30 two collections on one certification with overlapping loading times flag both tickets', () => {
    const first = recorded('COLLECTION', '101030', at(mon, '09:10'), at(mon, '09:40'));
    const second = recorded('COLLECTION', '101031', at(mon, '09:10'), at(mon, '09:40'));
    const dump = disposal('101030', at(mon, '10:05'));

    const onThePhantom = flagsOf([second], {}, { otherLoads: [first] });
    expect(messagesOf(onThePhantom)).toEqual([
      'Ticket 101031: loading 09:10–09:40 overlaps ticket 101030 on truck 730415. Flagged for review.',
    ]);
    const onTheOneDumped = flagsOf([first, dump], {}, { otherLoads: [second] });
    expect(messagesOf(onTheOneDumped)).toEqual([
      'Ticket 101030: loading 09:10–09:40 overlaps ticket 101031 on truck 730415. Flagged for review.',
    ]);
    expect(onTheOneDumped[0]).toMatchObject({ code: 'OVERLAPPING_LOADS', billing: 'BILLS' });
    // The one the truck dumped under still bills, in review; the other waits (ADR-342).
    expect(ticketOf([first, dump]).status([{ accepted: false }])).toBe('MANUAL_REVIEW');
    expect(ticketOf([second]).status([{ accepted: false }])).toBe('PENDING');
    // Read before the disposal has synced, too: arrival carries no information.
    expect(flagsOf([first], {}, { otherLoads: [second] })).toHaveLength(1);
  });

  it('AC-06-30 once the phantom is voided it is no longer read, and the other ticket’s flag clears', () => {
    const first = recorded('COLLECTION', '101030', at(mon, '09:10'), at(mon, '09:40'));
    expect(flagsOf([first, disposal('101030', at(mon, '10:05'))], {}, { otherLoads: [] })).toEqual(
      [],
    );
  });

  it('AC-06-31 a truck’s loads one after another, each dumped before the next, don’t overlap; nor do another truck’s at the same time', () => {
    const first = collection('101001', at(mon, '08:40'));
    const third = collection('101003', at(mon, '11:30'));
    const otherTruck = collection('101002', at(mon, '08:40'), { certNumber: '730416' });
    // One that starts the minute the last ended.
    const next = recorded('COLLECTION', '101007', at(mon, '08:40'), at(mon, '09:00'));

    expect(
      flagsOf(
        [first, disposal('101001', at(mon, '09:25'))],
        {},
        {
          otherLoads: [third, otherTruck, next],
        },
      ),
    ).toEqual([]);
  });

  it('AC-06-32 a split whose collections are -A and -C is flagged for the gap, and still bills', () => {
    const flags = flagsOf([
      collection('102001-A', at(mon, '08:40')),
      collection('102001-C', at(mon, '09:20')),
      disposal('102001', at(mon, '10:10')),
    ]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 102001: collections -A and -C, no -B. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'SPLIT_SUFFIX_GAP',
      billing: 'BILLS',
      fieldEventId: null,
      facts: { suffixes: ['A', 'C'], bareBesideSuffixed: false },
    });
  });

  it('AC-06-33 a bare collection beside -A is the same flag; a split haul-out’s piles are read the same way', () => {
    const flags = flagsOf([
      collection('102001', at(mon, '08:40')),
      collection('102001-A', at(mon, '09:05')),
      disposal('102001', at(mon, '10:10')),
    ]);
    expect(flags.map((flag) => flag.code)).toEqual(['SPLIT_SUFFIX_GAP']);
    expect(messagesOf(flags)).toEqual([
      'Ticket 102001: a collection with no suffix beside -A. Flagged for review.',
    ]);

    const piles = flagsOf([
      recorded('HAUL_OUT_COLLECTION', '201004-A', at(tue, '08:00'), at(tue, '08:20')),
      recorded('HAUL_OUT_COLLECTION', '201004-C', at(tue, '08:30'), at(tue, '08:50')),
      recorded('HAUL_OUT_DISPOSAL', '201004', at(tue, '10:00'), at(tue, '10:15')),
    ]);
    expect(messagesOf(piles)).toEqual([
      'Ticket 201004: collections -A and -C, no -B. Flagged for review.',
    ]);
  });

  it('AC-06-32 a split’s lettering is read once the ticket is whole: before its disposal, a property may only be still to sync', () => {
    expect(
      flagsOf([collection('102001-A', at(mon, '08:40')), collection('102001-C', at(mon, '09:20'))]),
    ).toEqual([]);
  });

  it('AC-06-34 the tower’s count against the tickets the collection lists', () => {
    const events = [
      collection('101014', at(mon, '13:00')),
      disposal('101014', at(mon, '13:45'), { carriedCount: 3 }),
    ];
    const flags = flagsOf(events, {}, { carried: { listed: 4, counted: 'stumps' } });

    expect(messagesOf(flags)).toEqual([
      'Ticket 101014: tower counted 3 stumps, the collection lists 4. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({ billing: 'BILLS', facts: { towerCount: 3, listed: 4 } });
    expect(flagsOf(events, {}, { carried: { listed: 3, counted: 'stumps' } })).toEqual([]);
  });
});

describe('the certification', () => {
  it('AC-06-35 no certification with that number on the project: flagged, not billed; a number certified only on another project is the same', () => {
    const flags = flagsOf([collection('101015', at(mon, '09:40'), { certNumber: '730499' })]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101015: no certification 730499 on this project. Flagged for review; not billed.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'NO_CERTIFICATION',
      billing: 'NOT_BILLED',
      facts: { certNumber: '730499' },
    });

    // P2 has its own 730416 and no 730415.
    const onP2 = new TicketChecks(p1Setup({ certifications: [certified('730416', 48)] })).of(
      ticketOf([collection('102006', at(mon, '09:40'), { projectId: p2 })]),
      nothingAround,
    );
    expect(messagesOf(onP2)).toEqual([
      'Ticket 102006: no certification 730415 on this project. Flagged for review; not billed.',
    ]);
  });

  it('AC-06-35 where the two ends scanned different numbers and the end that took the quantity found its certification, the ticket bills from it and only the difference is flagged', () => {
    const flags = flagsOf([
      collection('101008', at(mon, '09:40'), { certNumber: '730499' }),
      disposal('101008', at(mon, '10:20')),
    ]);
    expect(flags.map((flag) => flag.code)).toEqual(['CERT_NUMBER_MISMATCH']);

    // The other way round, the end that took the quantity has no certification: not billed.
    const unbilled = flagsOf([
      collection('101008', at(mon, '09:40')),
      disposal('101008', at(mon, '10:20'), { certNumber: '730499' }),
    ]);
    expect(unbilled.map((flag) => flag.code)).toEqual(['CERT_NUMBER_MISMATCH', 'NO_CERTIFICATION']);
  });

  it('AC-06-37 a truck keyed in by hand with capacity 60 against a certified 65: flagged, and the certification’s capacity is the one told to bill', () => {
    const flags = flagsOf([
      collection('101016', at(mon, '09:40')),
      disposal('101016', at(mon, '10:20'), { certKeyedByHand: true, typedCapacityCy: 60 }),
    ]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101016: capacity typed 60, certified 65. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({ billing: 'BILLS', facts: { typedCy: 60, certifiedCy: 65 } });
    expect(
      flagsOf([
        disposal('101016', at(mon, '10:20'), { certKeyedByHand: true, typedCapacityCy: 65 }),
      ]),
    ).toEqual([]);
  });

  it('AC-06-38 a tag that had expired at the work time flags the ticket; one that expired after it never does, whenever the ticket is reprocessed', () => {
    const worked = [collection('101017', at(mon, '09:40'), { certNumber: '730416' })];
    const expiredInSeptember = p1Setup({
      certifications: [certified('730416', 48, { tagExpiry: '2026-09-30' })],
    });
    const flags = new TicketChecks(expiredInSeptember).of(ticketOf(worked), nothingAround);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101017: review certification 730416 (tag expired 30-Sep-2026). Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      billing: 'BILLS',
      facts: {
        certNumber: '730416',
        tagExpiry: '2026-09-30',
        workTime: '2026-10-12T13:40:00.000Z',
      },
    });

    // The checks take no clock: a run in November judges 12 October's work as October did.
    expect(
      flagsOf(worked, { certifications: [certified('730416', 48, { tagExpiry: '2026-10-31' })] }),
    ).toEqual([]);
    // A tag is good through its expiry date.
    expect(
      flagsOf(worked, { certifications: [certified('730416', 48, { tagExpiry: '2026-10-12' })] }),
    ).toEqual([]);
    expect(
      flagsOf(worked, { certifications: [certified('730416', 48, { tagExpiry: '2026-10-11' })] }),
    ).toHaveLength(1);
  });

  it('AC-06-39 work on or after the date a certification was revoked from is flagged; the day before is not', () => {
    const revoked = { certifications: [certified('730416', 48, { revokedFrom: '2026-10-14' })] };
    const onTheDay = flagsOf(
      [collection('101018', at('2026-10-14', '07:30'), { certNumber: '730416' })],
      revoked,
    );

    expect(messagesOf(onTheDay)).toEqual([
      'Ticket 101018: review certification 730416 (revoked from 14-Oct-2026). Flagged for review.',
    ]);
    expect(onTheDay[0]?.billing).toBe('BILLS');
    expect(
      flagsOf([collection('101018', at(tue, '17:30'), { certNumber: '730416' })], revoked),
    ).toEqual([]);
  });

  it('AC-06-40 work on a certification after it was replaced is flagged; Monday’s and Tuesday’s tickets are not', () => {
    const replaced = {
      certifications: [
        certified('730416', 48, {
          replacedBy: { certNumber: '730420', certifiedAt: at('2026-10-14', '10:00') },
        }),
        certified('730420', 52),
      ],
    };
    const after = flagsOf(
      [collection('101019', at('2026-10-14', '14:00'), { certNumber: '730416' })],
      replaced,
    );

    expect(messagesOf(after)).toEqual([
      'Ticket 101019: review certification 730416 (replaced by 730420 on 14-Oct-2026). Flagged for review.',
    ]);
    expect(after[0]).toMatchObject({
      billing: 'BILLS',
      facts: { certNumber: '730416', replacedBy: '730420', replacedOn: '2026-10-14' },
    });
    for (const before of [at(mon, '09:40'), at(tue, '16:00'), at('2026-10-14', '08:00')]) {
      expect(flagsOf([collection('101019', before, { certNumber: '730416' })], replaced)).toEqual(
        [],
      );
    }
  });

  it('AC-06-41 a field event’s certification is checked alone, before its partner arrives, and again when it is paired', () => {
    const expired = { certifications: [certified('730415', 65, { tagExpiry: '2026-09-30' })] };
    const col = collection('101017', at(mon, '09:40'));
    const dis = disposal('101017', at(mon, '10:20'));

    const alone = flagsOf([col], expired);
    expect(alone.map((flag) => [flag.code, flag.fieldEventId])).toEqual([['TAG_EXPIRED', col.id]]);
    expect(ticketOf([col]).status(alone.map(() => ({ accepted: false })))).toBe('PENDING');

    const paired = flagsOf([col, dis], expired);
    expect(paired.map((flag) => [flag.code, flag.fieldEventId])).toEqual([
      ['TAG_EXPIRED', col.id],
      ['TAG_EXPIRED', dis.id],
    ]);
    // The collection's flag is the one it had alone: the same facts, the same hash.
    expect(paired[0]?.factsSha256).toBe(alone[0]?.factsSha256);
  });

  it('AC-06-130 a driver’s licence and a trailer swap flag nothing; AC-06-131 a certification still at QC Review, never revoked or replaced, flags nothing however long it is used', () => {
    // The checks are given no licence, no driver and no QC status to read.
    const asRecorded = {
      ...certified('730421', 30),
      driverLicenceExpiry: '2026-01-31',
      qcStatus: 'QC_REVIEW',
    };
    const setup = { certifications: [asRecorded, certified('730422', 40)], activeTo: null };

    expect(
      flagsOf(
        [
          collection('101050', at('2028-03-01', '09:40', '-05:00'), {
            certNumber: '730421',
            deviceUtcOffsetMinutes: -300,
          }),
          disposal('101050', at('2028-03-01', '10:20', '-05:00'), {
            certNumber: '730421',
            deviceUtcOffsetMinutes: -300,
          }),
        ],
        setup,
      ),
    ).toEqual([]);
  });

  it('AC-06-117 a certification with no left side view is flagged on the certification; a photograph removed from the record is no view', () => {
    const checks = new CertificationChecks('America/New_York');
    const views = ['OPERATOR_WITH_PLACARD', 'INTERIOR_OR_BACK', 'RIGHT', 'FRONT'] as const;
    const photographs = views.map((view) => ({ view, archivedAt: null }));
    const flags = checks.views('730416', photographs);

    expect(messagesOf(flags)).toEqual(['Certification 730416: no left side photo.']);
    expect(flags[0]).toMatchObject({
      code: 'CERTIFICATION_PHOTO_MISSING',
      subject: { certNumber: '730416' },
      fieldEventId: null,
      facts: { missing: 'LEFT', present: [...views] },
    });

    const left = { view: 'LEFT' as const, archivedAt: null };
    expect(checks.views('730416', [...photographs, left])).toEqual([]);
    expect(
      messagesOf(
        checks.views('730416', [...photographs, { ...left, archivedAt: at(tue, '15:00') }]),
      ),
    ).toEqual(['Certification 730416: no left side photo.']);
  });
});

describe('a ticket’s times, and where its records came from', () => {
  it('AC-06-49 a load collected outside the project’s active window is flagged, and still bills', () => {
    const february = { deviceUtcOffsetMinutes: -300 };
    const flags = flagsOf([
      collection('101023', at('2027-02-03', '09:40', '-05:00'), february),
      disposal('101023', at('2027-02-03', '10:20', '-05:00'), february),
    ]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101023: project not active on 03-Feb-2027. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'PROJECT_NOT_ACTIVE',
      billing: 'BILLS',
      facts: { day: '2027-02-03', activeFrom: '2026-10-12', activeTo: '2027-01-31' },
    });
    // Before the window opens, the same; with no end set, nothing closes it.
    expect(messagesOf(flagsOf([collection('101023', at('2026-10-11', '16:00'))]))).toEqual([
      'Ticket 101023: project not active on 11-Oct-2026. Flagged for review.',
    ]);
    expect(
      flagsOf([collection('101023', at('2027-02-03', '09:40', '-05:00'), february)], {
        activeTo: null,
      }),
    ).toEqual([]);
  });

  it('AC-06-50 a preload collected on the window’s last day and dumped the day after is not flagged: the load’s time is its collection’s end, read in the project’s time zone', () => {
    const winter = { deviceUtcOffsetMinutes: -300 };
    // 23:30 in Bayline County on 31 January is already 1 February in UTC.
    const col = collection('101023', at('2027-01-31', '23:30', '-05:00'), winter);
    const dis = disposal('101023', at('2027-02-01', '07:15', '-05:00'), winter);

    expect(workTimeOf(col).toISOString()).toBe('2027-02-01T04:30:00.000Z');
    expect(flagsOf([col, dis])).toEqual([]);
  });

  it('AC-06-125 a preload collected Monday 17:50 and dumped Tuesday 07:15 is flagged for nothing', () => {
    expect(
      flagsOf([
        collection('101004', at(mon, '17:50'), { certNumber: '730416' }),
        disposal('101004', at(tue, '07:15'), { certNumber: '730416' }),
      ]),
    ).toEqual([]);
  });

  it('AC-06-58 a phone whose clock was further off the server’s at its sync than the threshold flags its tickets; the threshold is handed in, never a number in the code', () => {
    const offBy = { clockOffAtSyncMinutes: 134 };
    const flags = flagsOf([collection('101008', at(mon, '09:40'), offBy)], {
      deviceClockOffLimitMinutes: 5,
    });

    expect(messagesOf(flags)).toEqual([
      'Ticket 101008: device clock was 2 h 14 m off at sync. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({ billing: 'BILLS', facts: { differenceMinutes: 134 } });
    expect(
      flagsOf([collection('101008', at(mon, '09:40'), offBy)], { deviceClockOffLimitMinutes: 180 }),
    ).toEqual([]);
    expect(flagsOf([collection('101008', at(mon, '09:40'), offBy)])).toEqual([]);
  });

  it('AC-06-59 a work time after the server received the record is flagged', () => {
    const flags = flagsOf([
      recorded('COLLECTION', '101008', at(mon, '21:10'), at(mon, '21:40'), {
        receivedAt: at(mon, '20:15'),
      }),
    ]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101008: work time 21:40 is after it was received at 20:15. Flagged for review.',
    ]);
    expect(flags[0]?.facts).toEqual({
      workTime: '2026-10-13T01:40:00.000Z',
      receivedAt: '2026-10-13T00:15:00.000Z',
    });
  });

  it('AC-06-60 a work time before its phone was enrolled is flagged', () => {
    const flags = flagsOf([
      recorded('COLLECTION', '101027', at(mon, '07:35'), at(mon, '08:05'), {
        device: { enrolledAt: at(mon, '10:00'), outOfServiceAt: null },
      }),
    ]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101027: work time 08:05 is before its phone was enrolled. Flagged for review.',
    ]);
  });

  it('AC-06-61 a phone on UTC−05:00 while the project is on UTC−04:00 is flagged', () => {
    const flags = flagsOf([
      collection('101028', at(mon, '09:40'), { deviceUtcOffsetMinutes: -300 }),
    ]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101028: phone was on UTC−05:00; the project is on UTC−04:00. Flagged for review.',
    ]);
    expect(flags[0]?.facts).toEqual({ deviceOffsetMinutes: -300, projectOffsetMinutes: -240 });
  });

  it('AC-06-62 a record made after its phone was taken out of service is flagged; one made before is not, whenever either arrived', () => {
    const lost = { enrolledAt: enrolled, outOfServiceAt: at(mon, '18:10') };
    const later = { device: lost, receivedAt: at('2026-10-16', '08:00') };
    const after = flagsOf([
      collection('101008', at(mon, '16:00')),
      recorded('DISPOSAL', '101008', at(mon, '18:20'), at(mon, '18:30'), later),
    ]);

    expect(messagesOf(after)).toEqual([
      'Ticket 101008: made on a phone taken out of service. Flagged for review.',
    ]);
    expect(after[0]?.billing).toBe('BILLS');
    expect(
      flagsOf([
        collection('101008', at(mon, '16:00')),
        recorded('DISPOSAL', '101008', at(mon, '17:30'), at(mon, '17:40'), later),
      ]),
    ).toEqual([]);
  });

  it('AC-06-63 a typed ticket number is flagged with the reason picked; AC-06-17 on a lone disposal the flag shows and the ticket stays PENDING', () => {
    const events = [
      disposal('101060', at(tue, '12:10'), {
        certNumber: '730416',
        numberTyped: true,
        numberTypedReason: barcodeDamaged,
      }),
    ];
    const flags = flagsOf(events);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      billing: 'BILLS',
      facts: { reason: 'reason-barcode-damaged' },
    });
    expect(ticketOf(events).status(flags.map(() => ({ accepted: false })))).toBe('PENDING');
  });

  it('AC-03-50 a collection waiting alone, on a tag that had expired at its work time, shows that flag and stays PENDING', () => {
    const events = [collection('101017', at(mon, '09:40'), { certNumber: '730416' })];
    const flags = flagsOf(events, {
      certifications: [certified('730416', 48, { tagExpiry: '2026-09-30' })],
    });

    expect(messagesOf(flags)).toEqual([
      'Ticket 101017: review certification 730416 (tag expired 30-Sep-2026). Flagged for review.',
    ]);
    expect(ticketOf(events).status(flags.map(() => ({ accepted: false })))).toBe('PENDING');
  });

  it('AC-06-64 a record created in the back office is flagged with the person and the reason, and pairs like any other', () => {
    const events = [
      collection('101029', at(mon, '09:40')),
      disposal('101029', at(mon, '10:20'), {
        source: 'BACK_OFFICE',
        device: null,
        createdBy: luis,
        createdReason: phoneFailed,
        // Whatever offset the back office's record carries, no phone was on it.
        deviceUtcOffsetMinutes: 0,
      }),
    ];
    const flags = flagsOf(events);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101029: record created in the back office by Luis Ortega (Phone failed). Flagged for review.',
    ]);
    expect(flags[0]?.billing).toBe('BILLS');
    expect(ticketOf(events).isWhole).toBe(true);
  });

  it('AC-06-133 work under an unplanned assignment is flagged for nothing: the checks are given no assignment to read', () => {
    const underAnUnplannedAssignment = { assignmentKind: 'UNPLANNED', temporarySession: true };
    expect(
      flagsOf([
        { ...collection('101009', at(mon, '14:00')), ...underAnUnplannedAssignment },
        disposal('101009', at(mon, '14:45')),
      ]),
    ).toEqual([]);
  });

  it('AC-06-31 the mission’s Monday on P1 raises none of these flags', () => {
    const monday = [
      collection('101001', at(mon, '08:40')),
      disposal('101001', at(mon, '09:25')),
      collection('101002', at(mon, '09:15'), { certNumber: '730416', debrisType: cAndD }),
      disposal('101002', at(mon, '10:05'), { certNumber: '730416', debrisType: cAndD }),
      collection('101003', at(mon, '11:30')),
      disposal('101003', at(mon, '12:20')),
    ];
    const { tickets } = new Tickets(monday);
    const checks = new TicketChecks(p1Setup());

    for (const ticket of tickets) {
      const otherLoads = monday.filter(
        (event) => event.kind === 'COLLECTION' && event.ticketNumber !== ticket.ticketNumber,
      );
      expect(checks.of(ticket, { otherLoads, carried: null })).toEqual([]);
    }
  });
});

describe('a record that should not have been possible is kept and flagged', () => {
  it('AC-06-155 a field event that arrived without its debris type, its quantity or its kind of work is flagged', () => {
    const col = collection('101036', at(mon, '09:40'), { debrisType: null });
    const flags = flagsOf([col]);
    expect(messagesOf(flags)).toEqual([
      'Ticket 101036: collection has no debris type. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'DETAIL_MISSING',
      billing: 'BILLS',
      fieldEventId: col.id,
      facts: { missing: 'DEBRIS_TYPE' },
    });

    expect(
      messagesOf(
        flagsOf([
          collection('101036', at(mon, '09:40')),
          disposal('101036', at(mon, '10:20'), { loadCall: null }),
        ]),
      ),
    ).toEqual([
      'Ticket 101036: disposal has no load call, scale receipt or count. Flagged for review.',
    ]);
    expect(
      messagesOf(
        flagsOf([
          recorded('HAUL_OUT_COLLECTION', '201005', at(tue, '08:00'), at(tue, '08:20'), {
            loadCall: null,
          }),
        ]),
      ),
    ).toEqual(['Ticket 201005: haul-out collection has no load call. Flagged for review.']);
    expect(
      messagesOf(
        flagsOf([
          recorded('UNIT_RATE', '301022', at(tue, '08:00'), at(tue, '08:20'), {
            certNumber: '730417',
            kindOfWorkId: null,
          }),
        ]),
      ),
    ).toEqual(['Ticket 301022: unit rate event has no kind of work. Flagged for review.']);
  });

  it('AC-06-155 a tower that took a weight or a count in place of a load call is missing nothing: one quantity, never both', () => {
    const col = collection('101036', at(mon, '09:40'));
    for (const taken of [{ scaleReceiptId: 'receipt-bcl-88241' }, { carriedCount: 4 }]) {
      expect(
        flagsOf([col, disposal('101036', at(mon, '10:20'), { loadCall: null, ...taken })]),
      ).toEqual([]);
    }
  });

  it('AC-06-156 a ticket number typed with no reason picked is flagged', () => {
    const flags = flagsOf([disposal('101037', at(mon, '10:20'), { numberTyped: true })]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101037: typed ticket number (no reason picked). Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({ code: 'TYPED_NUMBER_NO_REASON', billing: 'BILLS' });
  });

  it('AC-06-157 a load on a crew’s badge, or unit rate work on a container’s, is flagged; the right kind of badge is not', () => {
    const onACrew = flagsOf([collection('101038', at(mon, '09:40'), { certNumber: '730417' })]);
    expect(messagesOf(onACrew)).toEqual([
      'Ticket 101038: a load recorded on crew certification 730417. Flagged for review.',
    ]);
    expect(onACrew[0]?.facts).toEqual({ certNumber: '730417', kind: 'CREW' });

    const unitRate = (certNumber: string) =>
      flagsOf([
        recorded('UNIT_RATE', '301023', at(tue, '08:00'), at(tue, '08:20'), { certNumber }),
      ]);
    expect(messagesOf(unitRate('730415'))).toEqual([
      'Ticket 301023: unit rate work recorded on container certification 730415. Flagged for review.',
    ]);
    expect(unitRate('730417')).toEqual([]);
    expect(
      messagesOf(
        flagsOf([
          recorded('HAUL_OUT_COLLECTION', '201005', at(tue, '08:00'), at(tue, '08:20'), {
            certNumber: '730417',
          }),
        ]),
      ),
    ).toEqual([
      'Ticket 201005: a haul-out recorded on crew certification 730417. Flagged for review.',
    ]);
  });

  it('AC-06-159 a field event whose impossible GPS fix intake kept apart as sent is flagged, with the fix as its fact', () => {
    const sent = { end: { latitude: '97.50000000', longitude: null } };
    const flags = flagsOf([collection('101039', at(mon, '09:40'), { unreadableGps: sent })]);

    expect(messagesOf(flags)).toEqual(['Ticket 101039: GPS unreadable. Flagged for review.']);
    expect(flags[0]).toMatchObject({ billing: 'BILLS', facts: { sent } });
  });

  it('AC-06-160 a field event whose ticket number isn’t digits is in no ticket, pairs with nothing, and is flagged, not billed', () => {
    const odd = collection('10A040', at(mon, '09:40'));
    const dis = disposal('101040', at(mon, '10:20'));
    const all = new Tickets([odd, dis]);

    expect(all.notTicketNumbers).toEqual([odd]);
    expect(all.tickets.map((ticket) => ticket.ticketNumber)).toEqual(['101040']);
    const flag = new TicketChecks(p1Setup()).notATicketNumber(odd);
    expect(flag).toMatchObject({
      code: 'NOT_A_TICKET_NUMBER',
      message: 'Ticket 10A040: not a valid ticket number. Flagged for review; not billed.',
      billing: 'NOT_BILLED',
      fieldEventId: odd.id,
      facts: { ticketNumber: '10A040' },
    });
  });

  it('AC-06-161 a field event that ends before it starts is flagged', () => {
    const flags = flagsOf([recorded('COLLECTION', '101041', at(mon, '09:40'), at(mon, '09:10'))]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101041: collection ended 09:10, before it started 09:40. Flagged for review.',
    ]);
    expect(flags[0]?.billing).toBe('BILLS');
  });

  it('AC-06-163 a split on a project that doesn’t allow split loads is flagged, a load’s or a haul-out’s', () => {
    const split = [
      collection('101042-A', at(mon, '08:40')),
      collection('101042-B', at(mon, '09:05')),
    ];
    const flags = flagsOf(split, { allowSplitLoads: false });

    expect(messagesOf(flags)).toEqual([
      "Ticket 101042: a split load on a project that doesn't allow split loads. Flagged for review.",
    ]);
    expect(flags[0]).toMatchObject({
      code: 'SPLIT_NOT_ALLOWED',
      billing: 'BILLS',
      fieldEventId: null,
      facts: { suffixes: ['A', 'B'] },
    });
    expect(flagsOf(split)).toEqual([]);
    expect(flagsOf([collection('101042', at(mon, '08:40'))], { allowSplitLoads: false })).toEqual(
      [],
    );
    expect(
      messagesOf(
        flagsOf([recorded('HAUL_OUT_COLLECTION', '201005-A', at(tue, '08:00'), at(tue, '08:20'))], {
          allowSplitLoads: false,
        }),
      ),
    ).toEqual([
      "Ticket 201005: a split haul-out on a project that doesn't allow split loads. Flagged for review.",
    ]);
  });

  it('AC-06-164 on a project numbered from control tickets, a number in none of its series’ ranges is flagged', () => {
    const controlRanges = [
      { series: 'LOAD' as const, firstNumber: 101001, lastNumber: 102000 },
      { series: 'LOAD' as const, firstNumber: 105001, lastNumber: 106000 },
    ];
    const flags = flagsOf([collection('109999', at(mon, '09:40'))], { controlRanges });

    expect(messagesOf(flags)).toEqual([
      "Ticket 109999: number is in none of the project's control ticket ranges. Flagged for review.",
    ]);
    expect(flags[0]).toMatchObject({
      code: 'OUTSIDE_CONTROL_RANGES',
      billing: 'BILLS',
      facts: {
        ticketNumber: '109999',
        ranges: [
          [101001, 102000],
          [105001, 106000],
        ],
      },
    });
    // Inside a range, at either end; a series with no range entered; a project that generates.
    for (const inside of ['101001', '102000', '105500']) {
      expect(flagsOf([collection(inside, at(mon, '09:40'))], { controlRanges })).toEqual([]);
    }
    expect(
      flagsOf([recorded('HAUL_OUT_COLLECTION', '209999', at(tue, '08:00'), at(tue, '08:20'))], {
        controlRanges,
      }),
    ).toEqual([]);
    expect(flagsOf([collection('109999', at(mon, '09:40'))], { controlRanges: null })).toEqual([]);
  });

  it('AC-06-165 a field event recorded under an assignment on another project is flagged; a back-office record has no assignment', () => {
    const flags = flagsOf([collection('101043', at(mon, '09:40'), { assignmentProjectId: p2 })]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101043: recorded under an assignment on another project. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'ASSIGNMENT_ON_ANOTHER_PROJECT',
      billing: 'BILLS',
      facts: { projectId: p1, assignmentProjectId: p2 },
    });
    expect(
      flagsOf([collection('101043', at(mon, '09:40'), { assignmentProjectId: null })]),
    ).toEqual([]);
  });

  it('AC-10-110 a phone’s record naming a monitor who wasn’t signed in on that phone over its field time is flagged, kept as sent; one whose monitor was, or that nobody asked about, is not (ADR-543)', () => {
    const named = { id: ana, name: 'Ana Brooks' };
    const flags = flagsOf([
      collection('101044', at(mon, '09:40'), {
        monitorId: ana,
        assignmentPersonId: ana,
        monitorAtSync: { monitor: named, signedIn: false },
      }),
    ]);
    expect(messagesOf(flags)).toEqual([
      "Ticket 101044: recorded under Ana Brooks, who wasn't signed in on that phone. Flagged for review.",
    ]);
    expect(flags[0]).toMatchObject({
      code: 'MONITOR_NOT_SIGNED_IN',
      billing: 'BILLS',
      facts: { monitorId: ana },
    });
    for (const monitorAtSync of [{ monitor: named, signedIn: true }, null]) {
      expect(
        flagsOf([
          collection('101044', at(mon, '09:40'), {
            monitorId: ana,
            assignmentPersonId: ana,
            monitorAtSync,
          }),
        ]),
      ).toEqual([]);
    }
  });

  it('AC-10-110 a phone’s record under another person’s assignment is flagged; a back-office record has none (ADR-543)', () => {
    const flags = flagsOf([
      collection('101045', at(mon, '09:40'), { monitorId: kim, assignmentPersonId: ana }),
    ]);
    expect(messagesOf(flags)).toEqual([
      "Ticket 101045: recorded under another person's assignment. Flagged for review.",
    ]);
    expect(flags[0]).toMatchObject({
      code: 'ASSIGNMENT_OF_ANOTHER_PERSON',
      facts: { monitorId: kim, assignmentPersonId: ana },
    });
    expect(
      flagsOf([
        collection('101045', at(mon, '09:40'), {
          monitorId: kim,
          assignmentPersonId: null,
          assignmentProjectId: null,
        }),
      ]),
    ).toEqual([]);
  });
});
