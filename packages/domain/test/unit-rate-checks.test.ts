// The checks on unit rate work (spec/acceptance/06-reconciliation.md AC-06-83, 96…104, 106…111,
// 135; spec/acceptance/01-setup.md AC-01-33, 48; spec/acceptance/04-field-capture.md AC-04-59;
// spec/FLAGS.md §3.6; ADR-347). Each message is the catalogue's, word for word. The values are
// the golden mission's (301002, 301004, 301005, 301007; P1's pay items and bands, §1) and the
// catalogue's own example tickets: P1 on America/New_York, crews 730417 and 730418.
import { describe, expect, it } from 'vitest';

import {
  Tickets,
  UnitRateChecks,
  type CheckedKindOfWork,
  type FlagRaised,
  type Named,
  type UnitRateFieldEvent,
  type UnitRateFound,
  type UnitRatePayItem,
  type UnitRateSetup,
} from '../src/index.ts';

const p1 = '0199a000-0000-7000-8000-0000000000a1';

const at = (day: string, time: string): Date => new Date(`${day}T${time}:00-04:00`);
const mon = '2026-10-12';
const tue = '2026-10-13';
const wed = '2026-10-14';

const hangers: Named = { id: 'payable-hangers', name: 'Hangers' };
const leaners: Named = { id: 'payable-leaners', name: 'Leaners' };
const stumps: Named = { id: 'payable-stumps', name: 'Stumps' };
const crewTime: Named = { id: 'payable-crew-time', name: 'Crew time' };

const kind = (
  name: string,
  countShape: CheckedKindOfWork['countShape'] = 'NUMBER',
  key: CheckedKindOfWork['key'] = null,
): CheckedKindOfWork => ({
  id: `kind-${name.toLowerCase().replaceAll(' ', '-')}`,
  name,
  key,
  countShape,
});
const hangerWork = kind('Hangers');
const leanerWork = kind('Leaners');
const stumpWork = kind('Stumps', 'NUMBER', 'STUMPS');
const crewWork = kind('Crew time', 'ITEM_HOURS');

const payItem = (
  code: string,
  payableType: Named,
  bandFrom: number | null = null,
  bandTo: number | null = null,
  more: Partial<UnitRatePayItem> = {},
): UnitRatePayItem => ({
  id: `pay-item-${code.toLowerCase()}`,
  code,
  payableTypeId: payableType.id,
  bandFrom,
  bandTo,
  archived: false,
  gpsRequired: false,
  measurementRequired: false,
  decimalsAllowed: false,
  photosRequired: false,
  ...more,
});
const hng = payItem('HNG-RMV-EA', hangers);
const lnr24 = payItem('LNR-RMV-EA-24', leaners, 6, 24);
const lnr99 = payItem('LNR-RMV-EA-99', leaners, 24.1, 99);
const stp36 = payItem('STP-RMV-EA-36', stumps, 24, 36);
const stp48 = payItem('STP-RMV-EA-48', stumps, 36.1, 48);
const crewHr = payItem('CREW-TIME-HR', crewTime, null, null, { decimalsAllowed: true });
const p1PayItems = [hng, lnr24, lnr99, stp36, stp48, crewHr];

const skidSteer: Named = { id: 'item-skid-steer', name: 'Skid Steer' };
const truck: Named = { id: 'item-truck', name: 'Truck' };

let made = 0;
// A unit rate event, half an hour long unless told, with a fix and a photograph and nothing
// about it to flag.
function recorded(
  ticketNumber: string,
  end: Date,
  more: Partial<UnitRateFieldEvent> = {},
): UnitRateFieldEvent {
  made += 1;
  return {
    id: `0199e000-0000-7000-8000-${String(made).padStart(12, '0')}`,
    projectId: p1,
    workflow: 'UNIT_RATE',
    kind: 'UNIT_RATE',
    ticketNumber,
    splitSuffix: '',
    startedAt: new Date(end.getTime() - 30 * 60_000),
    endedAt: end,
    certNumber: '730417',
    kindOfWork: hangerWork,
    payableType: hangers,
    unitCount: '1.00',
    measurement: null,
    rootBallInches: null,
    surveyNumber: null,
    markedIneligible: false,
    endGps: { latitude: '27.94620000', longitude: '-82.45870000' },
    photographs: [{ archivedAt: null }],
    items: [],
    ...more,
  };
}

const hanger = (ticketNumber: string, more: Partial<UnitRateFieldEvent> = {}) =>
  recorded(ticketNumber, at(mon, '11:00'), {
    measurement: { inches: 3, measuredAs: 'DIAMETER' },
    ...more,
  });
const leaner = (ticketNumber: string, more: Partial<UnitRateFieldEvent> = {}) =>
  recorded(ticketNumber, at(mon, '11:30'), {
    kindOfWork: leanerWork,
    payableType: leaners,
    ...more,
  });
// 301004 as the golden mission has it: 30 in two feet up, root ball 96 in, survey number typed.
const stump = (ticketNumber: string, more: Partial<UnitRateFieldEvent> = {}) =>
  recorded(ticketNumber, at(tue, '09:00'), {
    certNumber: '730418',
    kindOfWork: stumpWork,
    payableType: stumps,
    measurement: { inches: 30, measuredAs: 'DIAMETER' },
    rootBallInches: 96,
    surveyNumber: 'APN 14-0321-007',
    ...more,
  });
const crew = (
  ticketNumber: string,
  from: Date,
  to: Date,
  hours: readonly (readonly [Named, string])[],
  more: Partial<UnitRateFieldEvent> = {},
) =>
  recorded(ticketNumber, to, {
    startedAt: from,
    certNumber: '730418',
    kindOfWork: crewWork,
    payableType: crewTime,
    unitCount: null,
    items: hours.map(([itemName, quantity]) => ({ itemName, quantity })),
    ...more,
  });

const p1Setup = (more: Partial<UnitRateSetup> = {}): UnitRateSetup => ({
  timeZone: 'America/New_York',
  payItems: p1PayItems,
  stumpCheckRootBallWider: true,
  crewItemHoursLimit: 12,
  ...more,
});

function foundOf(
  event: UnitRateFieldEvent,
  setup: Partial<UnitRateSetup> = {},
  otherCrewTime: readonly UnitRateFieldEvent[] = [],
): UnitRateFound {
  const [ticket] = new Tickets([event]).tickets;
  if (ticket === undefined) throw new Error('No ticket.');
  return new UnitRateChecks(p1Setup(setup)).of(ticket, { otherCrewTime });
}
const flagsOf = (
  event: UnitRateFieldEvent,
  setup: Partial<UnitRateSetup> = {},
  otherCrewTime: readonly UnitRateFieldEvent[] = [],
): readonly FlagRaised[] => foundOf(event, setup, otherCrewTime).flags;
const messagesOf = (flags: readonly FlagRaised[]): string[] => flags.map((flag) => flag.message);
const codesOf = (flags: readonly FlagRaised[]): string[] => flags.map((flag) => flag.code);

// The payable type's pay items with one changed: a setting ticked, a band given.
const withChanged = (changed: UnitRatePayItem): UnitRatePayItem[] =>
  p1PayItems.map((held) => (held.id === changed.id ? changed : held));

describe('the pay item, worked out again from the bands', () => {
  it('AC-06-83 AC-04-59 leaner 301002, 56.5 in round: 18.0 in across, band 6–24 in, LNR-RMV-EA-24, the worker’s own answer', () => {
    const event = leaner('301002', {
      measurement: { inches: 56.5, measuredAs: 'CIRCUMFERENCE' },
    });

    expect(foundOf(event)).toEqual({
      flags: [],
      workedOut: {
        fieldEventId: event.id,
        payItemId: 'pay-item-lnr-rmv-ea-24',
        diameterInches: 18,
      },
    });
  });

  it('AC-04-59 a corrected measurement moves the ticket to another pay item; a payable type’s only pay item needs none', () => {
    expect(
      foundOf(leaner('301002', { measurement: { inches: 40, measuredAs: 'DIAMETER' } })).workedOut
        ?.payItemId,
    ).toBe('pay-item-lnr-rmv-ea-99');
    expect(foundOf(hanger('301001', { measurement: null })).workedOut).toMatchObject({
      payItemId: 'pay-item-hng-rmv-ea',
      diameterInches: null,
    });
  });

  it('AC-06-100 a leaner at 4.5 in, which no Leaners band holds, has no pay item and is flagged, not billed', () => {
    const event = leaner('301009', { measurement: { inches: 4.5, measuredAs: 'DIAMETER' } });
    const found = foundOf(event);

    expect(messagesOf(found.flags)).toEqual([
      'Ticket 301009: 4.5 in fits no Leaners pay item. Flagged for review; not billed.',
    ]);
    expect(found.flags[0]).toMatchObject({
      code: 'NO_SIZE_BAND',
      billing: 'NOT_BILLED',
      fieldEventId: event.id,
      facts: {
        payableTypeId: 'payable-leaners',
        diameterInches: 4.5,
        bands: [
          ['pay-item-lnr-rmv-ea-24', 6, 24],
          ['pay-item-lnr-rmv-ea-99', 24.1, 99],
        ],
      },
    });
    expect(found.workedOut?.payItemId).toBeNull();
  });

  it('AC-06-101 Hangers’ only pay item, banded 2–24 in, and a limb at 30.0 in: it keeps the pay item, is flagged and still bills', () => {
    const banded = withChanged({ ...hng, bandFrom: 2, bandTo: 24 });
    const found = foundOf(
      hanger('301014', { measurement: { inches: 30, measuredAs: 'DIAMETER' } }),
      { payItems: banded },
    );

    expect(messagesOf(found.flags)).toEqual([
      "Ticket 301014: 30.0 in is over HNG-RMV-EA's band (2–24 in). Flagged for review.",
    ]);
    expect(found.flags[0]).toMatchObject({ code: 'OUTSIDE_SIZE_BAND', billing: 'BILLS' });
    expect(found.workedOut?.payItemId).toBe('pay-item-hng-rmv-ea');
    expect(
      messagesOf(
        flagsOf(hanger('301014', { measurement: { inches: 1.5, measuredAs: 'DIAMETER' } }), {
          payItems: banded,
        }),
      ),
    ).toEqual(["Ticket 301014: 1.5 in is under HNG-RMV-EA's band (2–24 in). Flagged for review."]);
    // Both ends are in the band, and a lone pay item with no band flags no size.
    for (const inches of [2, 24]) {
      expect(
        flagsOf(hanger('301014', { measurement: { inches, measuredAs: 'DIAMETER' } }), {
          payItems: banded,
        }),
      ).toEqual([]);
    }
    expect(
      flagsOf(hanger('301001', { measurement: { inches: 80, measuredAs: 'DIAMETER' } })),
    ).toEqual([]);
  });

  it('several pay items and nothing measured: no band can say which, so no pay item and "no measurement"', () => {
    const found = foundOf(leaner('301010'));

    expect(messagesOf(found.flags)).toEqual(['Ticket 301010: no measurement. Flagged for review.']);
    expect(found.workedOut?.payItemId).toBeNull();
  });

  it('a pay item taken off no longer counts: with LNR-RMV-EA-99 archived, Leaners has one pay item', () => {
    const found = foundOf(
      leaner('301002', { measurement: { inches: 40, measuredAs: 'DIAMETER' } }),
      {
        payItems: withChanged({ ...lnr99, archived: true }),
      },
    );

    expect(found.workedOut?.payItemId).toBe('pay-item-lnr-rmv-ea-24');
    expect(codesOf(found.flags)).toEqual(['OUTSIDE_SIZE_BAND']);
  });
});

describe('the pay item’s settings', () => {
  it('AC-06-96 Measurement required and a ticket with none: flagged, and it still bills', () => {
    const event = hanger('301010', { measurement: null });
    const flags = flagsOf(event, {
      payItems: withChanged({ ...hng, measurementRequired: true }),
    });

    expect(messagesOf(flags)).toEqual(['Ticket 301010: no measurement. Flagged for review.']);
    expect(flags[0]).toMatchObject({
      code: 'MEASUREMENT_MISSING',
      billing: 'BILLS',
      fieldEventId: event.id,
      facts: { payItemId: 'pay-item-hng-rmv-ea' },
    });
  });

  it('AC-06-97 GPS required and a ticket with no GPS: flagged, and it still bills', () => {
    const flags = flagsOf(hanger('301011', { endGps: null }), {
      payItems: withChanged({ ...hng, gpsRequired: true }),
    });

    expect(messagesOf(flags)).toEqual(['Ticket 301011: no GPS. Flagged for review.']);
    expect(flags[0]).toMatchObject({ code: 'GPS_MISSING', billing: 'BILLS' });
  });

  it('AC-06-98 photos required and a ticket with none: flagged, and it still bills; required means at least one', () => {
    const required = { payItems: withChanged({ ...hng, photosRequired: true }) };
    const flags = flagsOf(hanger('301012', { photographs: [] }), required);

    expect(messagesOf(flags)).toEqual(['Ticket 301012: no photos. Flagged for review.']);
    expect(flags[0]).toMatchObject({
      code: 'PHOTOS_MISSING',
      billing: 'BILLS',
      facts: { payItemId: 'pay-item-hng-rmv-ea', photoCount: 0 },
    });
    expect(flagsOf(hanger('301012'), required)).toEqual([]);
  });

  it('AC-06-98 a photograph the back office removed counts for nothing: its last one removed, the ticket is flagged', () => {
    const required = { payItems: withChanged({ ...hng, photosRequired: true }) };
    const removed = { archivedAt: at(wed, '10:00') };

    expect(codesOf(flagsOf(hanger('301012', { photographs: [removed] }), required))).toEqual([
      'PHOTOS_MISSING',
    ]);
    expect(
      flagsOf(hanger('301012', { photographs: [removed, { archivedAt: null }] }), required),
    ).toEqual([]);
  });

  it('AC-06-99 HNG-RMV-EA doesn’t have Decimals allowed and the count is 2.5: flagged, and it bills at the count entered', () => {
    const flags = flagsOf(hanger('301013', { unitCount: '2.50' }));

    expect(messagesOf(flags)).toEqual([
      'Ticket 301013: count 2.5; HNG-RMV-EA takes whole counts. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'DECIMAL_COUNT',
      billing: 'BILLS',
      facts: { payItemId: 'pay-item-hng-rmv-ea', count: '2.5' },
    });
    expect(flagsOf(hanger('301013', { unitCount: '2.00' }))).toEqual([]);
    expect(
      flagsOf(hanger('301013', { unitCount: '2.50' }), {
        payItems: withChanged({ ...hng, decimalsAllowed: true }),
      }),
    ).toEqual([]);
  });

  it('AC-06-102 work the monitor marked ineligible: flagged, and it still bills', () => {
    const flags = flagsOf(hanger('301015', { markedIneligible: true }));

    expect(messagesOf(flags)).toEqual([
      'Ticket 301015: marked ineligible by the monitor. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({ code: 'MARKED_INELIGIBLE', billing: 'BILLS' });
  });

  it('AC-06-111 AC-01-48 every capture setting ticked on a pay item is checked on its ticket: none is stored and ignored', () => {
    const everySetting = withChanged({
      ...hng,
      gpsRequired: true,
      measurementRequired: true,
      photosRequired: true,
      decimalsAllowed: false,
    });
    const bare = hanger('301010', {
      measurement: null,
      endGps: null,
      photographs: [],
      unitCount: '1.50',
      markedIneligible: true,
    });

    expect(codesOf(flagsOf(bare, { payItems: everySetting }))).toEqual([
      'MEASUREMENT_MISSING',
      'GPS_MISSING',
      'PHOTOS_MISSING',
      'DECIMAL_COUNT',
      'MARKED_INELIGIBLE',
    ]);
    // Unticked, the same ticket is flagged only for what the monitor marked and the count.
    expect(codesOf(flagsOf(bare))).toEqual(['DECIMAL_COUNT', 'MARKED_INELIGIBLE']);
  });
});

describe('the stump checks', () => {
  it('AC-06-104 stump 301004, 30 in with a root ball of 96 in and its survey number, passes: STP-RMV-EA-36, nothing flagged', () => {
    const event = stump('301004');

    expect(foundOf(event)).toEqual({
      flags: [],
      workedOut: {
        fieldEventId: event.id,
        payItemId: 'pay-item-stp-rmv-ea-36',
        diameterInches: 30,
      },
    });
  });

  it('AC-06-103 stump 301005, 20 in two feet up: not an eligible stump; no Stumps band holds it, so no pay item and nothing to bill, said once', () => {
    const event = stump('301005', { measurement: { inches: 20, measuredAs: 'DIAMETER' } });
    const found = foundOf(event);

    expect(messagesOf(found.flags)).toEqual([
      'Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review.',
    ]);
    expect(found.flags[0]).toMatchObject({
      code: 'STUMP_UNDER_24',
      billing: 'NOT_BILLED',
      fieldEventId: event.id,
      facts: { diameterInches: 20, payItemId: null },
    });
    expect(found.workedOut?.payItemId).toBeNull();
  });

  it('AC-06-103 where the firm’s band does hold a stump under 24 in, it bills as its band says; 24 in itself is an eligible stump', () => {
    const from20 = withChanged({ ...stp36, bandFrom: 20 });
    const [flag] = flagsOf(
      stump('301005', { measurement: { inches: 20, measuredAs: 'DIAMETER' } }),
      {
        payItems: from20,
      },
    );

    expect(flag).toMatchObject({ code: 'STUMP_UNDER_24', billing: 'BILLS' });
    expect(
      flagsOf(stump('301005', { measurement: { inches: 24, measuredAs: 'DIAMETER' } })),
    ).toEqual([]);
  });

  it('AC-06-104 a stump 30 in across with a root ball of 20 in: flagged, and it still bills', () => {
    const flags = flagsOf(stump('301008', { rootBallInches: 20 }));

    expect(messagesOf(flags)).toEqual([
      'Ticket 301008: root ball (20 in) is not wider than the stump (30 in). Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'ROOT_BALL_NOT_WIDER',
      billing: 'BILLS',
      facts: { rootBallInches: 20, diameterInches: 30 },
    });
    expect(codesOf(flagsOf(stump('301008', { rootBallInches: 30 })))).toEqual([
      'ROOT_BALL_NOT_WIDER',
    ]);
  });

  it('AC-06-106 with the root-ball check switched off on the project, it flags nothing', () => {
    expect(
      flagsOf(stump('301008', { rootBallInches: 20 }), { stumpCheckRootBallWider: false }),
    ).toEqual([]);
  });

  it('AC-06-107 the stump’s pay item requires the measurement and the root ball is blank: flagged; the stump is still measured', () => {
    const required = { payItems: withChanged({ ...stp36, measurementRequired: true }) };
    const flags = flagsOf(stump('301017', { rootBallInches: null }), required);

    expect(messagesOf(flags)).toEqual([
      'Ticket 301017: no root ball measurement. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'ROOT_BALL_MISSING',
      billing: 'BILLS',
      facts: { payItemId: 'pay-item-stp-rmv-ea-36' },
    });
    // Not required, a blank root ball is only no fill.
    expect(flagsOf(stump('301017', { rootBallInches: null }))).toEqual([]);
  });

  it('AC-06-108 a stump ticket with no survey number: flagged, and it still bills', () => {
    const flags = flagsOf(stump('301018', { surveyNumber: null }));

    expect(messagesOf(flags)).toEqual(['Ticket 301018: no survey. Flagged for review.']);
    expect(flags[0]).toMatchObject({ code: 'NO_SURVEY', billing: 'BILLS' });
    expect(codesOf(flagsOf(stump('301018', { surveyNumber: '  ' })))).toEqual(['NO_SURVEY']);
  });

  it('AC-06-111 AC-01-33 "Stumps" renamed "Stump removal": the stump checks run as before, on the built-in key; a kind named Stumps with no key gets none', () => {
    const small = {
      measurement: { inches: 20, measuredAs: 'DIAMETER' } as const,
      surveyNumber: null,
    };
    const renamed = { ...stumpWork, name: 'Stump removal' };
    const lookalike = { ...stumpWork, key: null };

    expect(codesOf(flagsOf(stump('301005', { ...small, kindOfWork: renamed })))).toEqual([
      'STUMP_UNDER_24',
      'NO_SURVEY',
    ]);
    expect(codesOf(flagsOf(stump('301005', { ...small, kindOfWork: lookalike })))).toEqual([
      'NO_SIZE_BAND',
    ]);
  });
});

describe('a crew’s hours', () => {
  // Crew 730418 on Tuesday 13 October: 301007 from 07:00, Skid Steer 9.75 h and Truck 8.50 h.
  const t301007 = crew('301007', at(tue, '07:00'), at(tue, '16:45'), [
    [skidSteer, '9.75'],
    [truck, '8.50'],
  ]);

  it('one crew-time ticket with its highest item at 9.75 h is flagged for nothing', () => {
    expect(foundOf(t301007)).toMatchObject({
      flags: [],
      workedOut: { payItemId: 'pay-item-crew-time-hr' },
    });
  });

  it('AC-06-109 301019 adds Skid Steer 3.50 h to the crew’s Tuesday: 13.25 h, flagged on the ticket that takes it over 12 h; both still bill', () => {
    const t301019 = crew('301019', at(tue, '17:00'), at(tue, '20:30'), [[skidSteer, '3.50']]);
    const flags = flagsOf(t301019, {}, [t301007]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 301019: Skid Steer 13.25 h on 13-Oct-2026 for crew 730418 (over 12 h). Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'CREW_ITEM_OVER_12_HOURS',
      billing: 'BILLS',
      fieldEventId: t301019.id,
      facts: {
        itemNameId: 'item-skid-steer',
        day: '2026-10-13',
        certNumber: '730418',
        hours: '13.25',
        limitHours: 12,
        tickets: ['301007', '301019'],
      },
    });
    // The earlier ticket's own hours were inside the day; the Truck's 8.50 h never pass it.
    expect(flagsOf(t301007, {}, [t301019])).toEqual([]);
  });

  it('AC-06-109 exactly 12 h is not over; another crew’s hours, another day’s and another item’s are never added', () => {
    const upTo12 = crew('301019', at(tue, '17:00'), at(tue, '19:15'), [[skidSteer, '2.25']]);
    const more = crew('301019', at(tue, '17:00'), at(tue, '20:30'), [[skidSteer, '3.50']]);

    expect(flagsOf(upTo12, {}, [t301007])).toEqual([]);
    expect(flagsOf(more, {}, [{ ...t301007, certNumber: '730417' }])).toEqual([]);
    expect(
      flagsOf(crew('301019', at(wed, '07:00'), at(wed, '10:30'), [[skidSteer, '3.50']]), {}, [
        t301007,
      ]),
    ).toEqual([]);
    expect(
      flagsOf(crew('301019', at(tue, '17:00'), at(tue, '20:30'), [[truck, '3.50']]), {}, [t301007]),
    ).toEqual([]);
  });

  it('AC-06-109 the limit is handed over, never a number of the check’s: at 14 h nothing is flagged, and with none the check is off', () => {
    const t301019 = crew('301019', at(tue, '17:00'), at(tue, '20:30'), [[skidSteer, '3.50']]);

    expect(flagsOf(t301019, { crewItemHoursLimit: 14 }, [t301007])).toEqual([]);
    expect(flagsOf(t301019, { crewItemHoursLimit: null }, [t301007])).toEqual([]);
  });

  it('AC-06-109 the day is the project’s: a ticket that ended at 00:30 on Wednesday in Bayline County is Wednesday’s', () => {
    const late = crew('301019', at(tue, '21:00'), at(wed, '00:30'), [[skidSteer, '3.50']]);
    expect(flagsOf(late, {}, [t301007])).toEqual([]);
  });

  it('AC-06-110 two crew-time tickets for crew 730418 whose times overlap: flagged on each, and both still bill', () => {
    const t301020 = crew('301020', at(tue, '07:00'), at(tue, '11:00'), [[truck, '2.00']]);
    const flags = flagsOf(t301020, {}, [t301007]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 301020: crew time 07:00–11:00 overlaps ticket 301007 for crew 730418. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'CREW_TIME_OVERLAP',
      billing: 'BILLS',
      fieldEventId: t301020.id,
    });
    expect(messagesOf(flagsOf(t301007, {}, [t301020]))).toEqual([
      'Ticket 301007: crew time 07:00–16:45 overlaps ticket 301020 for crew 730418. Flagged for review.',
    ]);
  });

  it('AC-06-110 one ticket that starts as the other ends doesn’t overlap it; nor does another crew’s', () => {
    const after = crew('301020', at(tue, '16:45'), at(tue, '18:00'), [[truck, '1.25']]);
    const otherCrew = crew('301020', at(tue, '07:00'), at(tue, '11:00'), [[truck, '4.00']], {
      certNumber: '730417',
    });

    expect(flagsOf(after, {}, [t301007])).toEqual([]);
    expect(flagsOf(otherCrew, {}, [t301007])).toEqual([]);
  });

  it('AC-06-135 only crew-time tickets are read: a monitor’s own hours are nothing here, and a 13-hour hanger ticket for the same crew is no crew time', () => {
    const allDay = hanger('301021', {
      certNumber: '730418',
      startedAt: at(tue, '06:00'),
      endedAt: at(tue, '19:00'),
    });

    expect(flagsOf(allDay, {}, [t301007])).toEqual([]);
    expect(flagsOf(t301007, {}, [allDay])).toEqual([]);
  });
});
