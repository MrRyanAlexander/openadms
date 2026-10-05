// The checks on place (spec/acceptance/06-reconciliation.md AC-06-42…47, 51, 52, 65…68, 72,
// 118, 126, 127, 134; spec/FLAGS.md §3.3, §3.4, §3.7; ADR-346). Each message is the catalogue's,
// word for word. The values are the example world's (spec/CONVENTIONS.md §6) and the catalogue's
// own example tickets: P1 in Bayline County, on America/New_York, its boundary from 82.60° W to
// 82.20° W and 27.80° N to 28.20° N in three zones west to east, its site circle 200 m.
import { describe, expect, it } from 'vitest';

import {
  MapShapes,
  PlaceChecks,
  SiteChecks,
  Tickets,
  type CheckedSite,
  type FieldEventKindName,
  type FlagRaised,
  type GpsPoint,
  type MapShape,
  type PlaceFound,
  type PlaceSetup,
  type PlacedFieldEvent,
  type ProjectMap,
  type WorkflowName,
} from '../src/index.ts';

const p1 = '0199a000-0000-7000-8000-0000000000a1';

const at = (day: string, time: string, offset = '-04:00'): Date =>
  new Date(`${day}T${time}:00${offset}`);
const mon = '2026-10-12';

const point = (latitude: string, longitude: string): GpsPoint => ({ latitude, longitude });

function shapeOf(west: number, south: number, east: number, north: number): MapShape {
  const { read, problem } = new MapShapes({
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  }).shape();
  if (read === null) throw new Error(problem);
  return read;
}

const zone = (name: string, west: number, east: number) => ({
  id: `zone-${name.slice(-1)}`,
  name,
  shape: shapeOf(west, 27.8, east, 28.2),
});
const p1Map: ProjectMap = {
  versionId: 'map-version-1',
  boundary: shapeOf(-82.6, 27.8, -82.2, 28.2),
  zones: [
    zone('Zone 1', -82.6, -82.47),
    zone('Zone 2', -82.47, -82.33),
    zone('Zone 3', -82.33, -82.2),
  ],
};

const site = (name: string, gps: GpsPoint, more: Partial<CheckedSite> = {}): CheckedSite => ({
  id: `site-${name.toLowerCase().replaceAll(' ', '-')}`,
  name,
  siteTypeKey: null,
  takesLoads: true,
  haulOutsLeaveHere: false,
  ineligibleSite: false,
  permitNumber: 'FDEP-0000',
  gps,
  activationDate: '2026-10-12',
  closeDate: null,
  area: null,
  ...more,
});
const marshRoad = site('Marsh Road TDSR', point('27.98150000', '-82.39720000'), {
  siteTypeKey: 'TDSR',
  haulOutsLeaveHere: true,
  permitNumber: 'FDEP-DMS-2026-0117',
});
const landfill = site('Bayline County Landfill', point('27.89340000', '-82.32160000'), {
  siteTypeKey: 'FINAL_DISPOSAL',
  permitNumber: 'FDEP-SW-0098',
});
const transferStation = site('Bayline Transfer Station', point('27.95010000', '-82.44730000'), {
  permitNumber: 'FDEP-TS-2026-0412',
});
const oldQuarryPit = site('Old Quarry Pit', point('28.10000000', '-82.50000000'));

// 14 Heron St, in Zone 2; and 250 m and 150 m north of Marsh Road TDSR's GPS.
const heronSt = point('27.94620000', '-82.45870000');
const north250 = point('27.98375593', '-82.39720000');
const north150 = point('27.98285356', '-82.39720000');

const workflowOf: Record<FieldEventKindName, WorkflowName> = {
  COLLECTION: 'LOAD',
  DISPOSAL: 'LOAD',
  HAUL_OUT_COLLECTION: 'HAUL_OUT',
  HAUL_OUT_DISPOSAL: 'HAUL_OUT',
  UNIT_RATE: 'UNIT_RATE',
};

let made = 0;
// A field event as written, "101020" or "102001-A", half an hour long, ending at `end`: at its
// site's own GPS where it has a site and no other fix is told.
function recorded(
  kind: FieldEventKindName,
  written: string,
  end: Date,
  more: Partial<PlacedFieldEvent> = {},
): PlacedFieldEvent {
  const [ticketNumber = '', splitSuffix = ''] = written.split('-');
  made += 1;
  return {
    id: `0199c000-0000-7000-8000-${String(made).padStart(12, '0')}`,
    projectId: p1,
    workflow: workflowOf[kind],
    kind,
    ticketNumber,
    splitSuffix,
    startedAt: new Date(end.getTime() - 30 * 60_000),
    endedAt: end,
    endGps: more.site?.gps ?? null,
    site: null,
    ...more,
  };
}

const collection = (written: string, endGps: GpsPoint | null, end = at(mon, '09:40')) =>
  recorded('COLLECTION', written, end, { endGps });
const disposal = (written: string, at_: CheckedSite, more: Partial<PlacedFieldEvent> = {}) =>
  recorded('DISPOSAL', written, at(mon, '10:30'), { site: at_, ...more });

const p1Setup = (more: Partial<PlaceSetup> = {}): PlaceSetup => ({
  timeZone: 'America/New_York',
  siteCircleMeters: 200,
  map: p1Map,
  ...more,
});

function placeOf(events: readonly PlacedFieldEvent[], setup: Partial<PlaceSetup> = {}): PlaceFound {
  const [ticket] = new Tickets(events).tickets;
  if (ticket === undefined) throw new Error('No ticket.');
  return new PlaceChecks(p1Setup(setup)).of(ticket);
}
const flagsOf = (events: readonly PlacedFieldEvent[], setup: Partial<PlaceSetup> = {}) =>
  placeOf(events, setup).flags;
const messagesOf = (flags: readonly FlagRaised[]): string[] => flags.map((flag) => flag.message);

describe('the project’s boundary and zones', () => {
  it('AC-06-42 a collection that ended at 14 Heron St is given the zone its end GPS lies in, with the map version used; a unit rate event’s zone comes from its own GPS', () => {
    const col = collection('101001', heronSt);
    const hanger = recorded('UNIT_RATE', '301001', at(mon, '11:00'), {
      endGps: point('28.01000000', '-82.25000000'),
    });

    expect(placeOf([col])).toEqual({
      flags: [],
      zones: [{ fieldEventId: col.id, zoneId: 'zone-2', mapVersionId: 'map-version-1' }],
    });
    expect(placeOf([hanger])).toEqual({
      flags: [],
      zones: [{ fieldEventId: hanger.id, zoneId: 'zone-3', mapVersionId: 'map-version-1' }],
    });
  });

  it('AC-06-43 a load’s zone is its collection’s: its disposal is given none, and each property of a split keeps its own', () => {
    const a = collection('102001-A', point('27.90000000', '-82.55000000'));
    const b = collection('102001-B', heronSt, at(mon, '10:00'));
    const dis = disposal('102001', marshRoad);

    expect(placeOf([a, b, dis])).toEqual({
      flags: [],
      zones: [
        { fieldEventId: a.id, zoneId: 'zone-1', mapVersionId: 'map-version-1' },
        { fieldEventId: b.id, zoneId: 'zone-2', mapVersionId: 'map-version-1' },
      ],
    });
  });

  it('AC-06-44 a collection that ended south of the boundary is flagged and still bills; a unit rate event outside it the same', () => {
    const south = point('27.75000000', '-82.40000000');
    const col = collection('101020', south);
    const found = placeOf([col]);

    expect(messagesOf(found.flags)).toEqual([
      'Ticket 101020: collected outside the project boundary. Flagged for review.',
    ]);
    expect(found.flags[0]).toMatchObject({
      code: 'OUTSIDE_PROJECT_BOUNDARY',
      billing: 'BILLS',
      fieldEventId: col.id,
      facts: {
        gps: { latitude: '27.75000000', longitude: '-82.40000000' },
        mapVersionId: 'map-version-1',
      },
    });
    // No zone is looked for outside the boundary, and "not inside any zone" isn't said too.
    expect(found.zones).toEqual([
      { fieldEventId: col.id, zoneId: null, mapVersionId: 'map-version-1' },
    ]);
    expect(
      messagesOf(flagsOf([recorded('UNIT_RATE', '301020', at(mon, '11:00'), { endGps: south })])),
    ).toEqual(['Ticket 301020: collected outside the project boundary. Flagged for review.']);
  });

  it('AC-06-45 inside the boundary, in a gap the zones leave: the zone is left empty and it is flagged', () => {
    const gapped: ProjectMap = { ...p1Map, zones: p1Map.zones.filter((z) => z.name !== 'Zone 2') };
    const col = collection('101021', heronSt);
    const found = placeOf([col], { map: gapped });

    expect(messagesOf(found.flags)).toEqual([
      'Ticket 101021: not inside any zone. Flagged for review.',
    ]);
    expect(found.flags[0]).toMatchObject({
      code: 'NO_ZONE',
      billing: 'BILLS',
      fieldEventId: col.id,
    });
    expect(found.zones).toEqual([
      { fieldEventId: col.id, zoneId: null, mapVersionId: 'map-version-1' },
    ]);
  });

  it('a map with a boundary and no zones at all gives no zone and says nothing about zones', () => {
    const col = collection('101001', heronSt);

    expect(placeOf([col], { map: { ...p1Map, zones: [] } })).toEqual({
      flags: [],
      zones: [{ fieldEventId: col.id, zoneId: null, mapVersionId: 'map-version-1' }],
    });
  });

  it('a project with no map (P2) has no boundary to be outside of and no zone to give', () => {
    const col = collection('102002', point('27.75000000', '-82.40000000'));

    expect(placeOf([col], { map: null })).toEqual({
      flags: [],
      zones: [{ fieldEventId: col.id, zoneId: null, mapVersionId: null }],
    });
  });

  it('a collection with no GPS fix can’t be placed: no zone, no map version, nothing raised here', () => {
    const col = collection('101001', null);

    expect(placeOf([col])).toEqual({
      flags: [],
      zones: [{ fieldEventId: col.id, zoneId: null, mapVersionId: null }],
    });
  });

  it('a point on the line between two zones is in the first the map names', () => {
    const col = collection('101001', point('28.00000000', '-82.47000000'));

    expect(placeOf([col]).zones[0]?.zoneId).toBe('zone-1');
  });

  it('a haul-out’s collection, at a TDSR, is given no zone and isn’t judged against the boundary', () => {
    const outside = site('Marsh Road TDSR', point('27.75000000', '-82.40000000'), {
      siteTypeKey: 'TDSR',
      haulOutsLeaveHere: true,
    });

    expect(
      placeOf([recorded('HAUL_OUT_COLLECTION', '201001', at(mon, '13:00'), { site: outside })]),
    ).toEqual({
      flags: [],
      zones: [],
    });
  });

  it('AC-06-126 a collection whose start and end GPS are 9 km apart: nothing is flagged for the distance it covers', () => {
    const far = {
      ...collection('101001', heronSt),
      startGps: point('28.02700000', '-82.45870000'),
    };

    expect(flagsOf([far])).toEqual([]);
  });

  it('AC-06-127 a fix that reports poor accuracy: nothing is flagged for the accuracy', () => {
    const poor = { ...collection('101001', heronSt), gpsAccuracyMeters: 85 };

    expect(flagsOf([poor])).toEqual([]);
  });
});

describe('a site’s area', () => {
  it('AC-06-46 with P1’s circle of 200 m, a disposal 250 m from Marsh Road TDSR’s own GPS is flagged and still bills; one 150 m away is not', () => {
    const far = disposal('101022', marshRoad, { endGps: north250 });
    const flags = flagsOf([far]);

    expect(messagesOf(flags)).toEqual([
      "Ticket 101022: dumped outside Marsh Road TDSR's area. Flagged for review.",
    ]);
    expect(flags[0]).toMatchObject({
      code: 'OUTSIDE_SITE_AREA',
      billing: 'BILLS',
      fieldEventId: far.id,
      facts: {
        gps: { latitude: '27.98375593', longitude: '-82.39720000' },
        siteId: marshRoad.id,
        siteGps: { latitude: '27.98150000', longitude: '-82.39720000' },
        circleMeters: 200,
      },
    });
    expect(flagsOf([disposal('101022', marshRoad, { endGps: north150 })])).toEqual([]);
  });

  it('AC-06-46 the circle is the project’s setting: changed to 300 m, the disposal 250 m away is inside it', () => {
    expect(
      flagsOf([disposal('101022', marshRoad, { endGps: north250 })], { siteCircleMeters: 300 }),
    ).toEqual([]);
  });

  it('AC-06-46 either end of a haul-out is checked against its own site the same way', () => {
    const hoc = recorded('HAUL_OUT_COLLECTION', '201001', at(mon, '13:00'), {
      site: marshRoad,
      endGps: north250,
    });
    const hod = recorded('HAUL_OUT_DISPOSAL', '201001', at(mon, '14:10'), {
      site: landfill,
      endGps: point('27.89700000', '-82.32160000'),
    });
    const flags = flagsOf([hoc, hod]);

    expect(flags.map((flag) => [flag.code, flag.fieldEventId])).toEqual([
      ['OUTSIDE_SITE_AREA', hoc.id],
      ['OUTSIDE_SITE_AREA', hod.id],
    ]);
    expect(flags[1]?.message).toBe(
      "Ticket 201001: dumped outside Bayline County Landfill's area. Flagged for review.",
    );
  });

  it('AC-06-47 a site with a shape of its own is checked against the shape in place of the circle: inside it, not flagged, however far from the site’s GPS', () => {
    const shaped: CheckedSite = {
      ...marshRoad,
      area: { versionId: 'area-version-1', shape: shapeOf(-82.41, 27.975, -82.39, 27.995) },
    };
    // About 1.4 km north of the site's GPS, inside the shape; and 150 m west of it, inside the
    // circle but outside the shape.
    const inside = disposal('101022', shaped, { endGps: point('27.99400000', '-82.39720000') });
    const outside = disposal('101022', shaped, { endGps: point('27.98150000', '-82.38900000') });

    expect(flagsOf([inside])).toEqual([]);
    const flags = flagsOf([outside]);
    expect(messagesOf(flags)).toEqual([
      "Ticket 101022: dumped outside Marsh Road TDSR's area. Flagged for review.",
    ]);
    expect(flags[0]?.facts).toEqual({
      gps: { latitude: '27.98150000', longitude: '-82.38900000' },
      siteId: marshRoad.id,
      areaVersionId: 'area-version-1',
    });
  });

  it('a disposal with no GPS fix, or with no site, can’t be placed: nothing is raised here', () => {
    expect(flagsOf([disposal('101022', marshRoad, { endGps: null })])).toEqual([]);
    expect(
      flagsOf([recorded('DISPOSAL', '101022', at(mon, '10:30'), { endGps: north250 })]),
    ).toEqual([]);
  });
});

describe('a site’s dates', () => {
  it('AC-06-51 a disposal two days before the site’s activation date is flagged and still bills; one on the day itself is not', () => {
    const early = recorded('DISPOSAL', '101024', at('2026-10-10', '10:30'), { site: marshRoad });
    const flags = flagsOf([early]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101024: Marsh Road TDSR not yet active on 10-Oct-2026. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'SITE_NOT_YET_ACTIVE',
      billing: 'BILLS',
      fieldEventId: early.id,
      facts: { siteId: marshRoad.id, day: '2026-10-10', activationDate: '2026-10-12' },
    });
    expect(
      flagsOf([recorded('DISPOSAL', '101024', at(mon, '00:05'), { site: marshRoad })]),
    ).toEqual([]);
  });

  it('AC-06-52 a disposal the day after the site’s close date is flagged and still bills; one on the close date is not, and a site with no close date is never closed', () => {
    const closing: CheckedSite = { ...marshRoad, closeDate: '2026-11-30' };
    // In December the county is five hours behind UTC.
    const late = recorded('DISPOSAL', '101025', at('2026-12-01', '09:15', '-05:00'), {
      site: closing,
    });
    const flags = flagsOf([late]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101025: Marsh Road TDSR closed on 01-Dec-2026. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'SITE_CLOSED',
      billing: 'BILLS',
      fieldEventId: late.id,
      facts: { siteId: marshRoad.id, day: '2026-12-01', closeDate: '2026-11-30' },
    });
    expect(
      flagsOf([
        recorded('DISPOSAL', '101025', at('2026-11-30', '23:50', '-05:00'), { site: closing }),
      ]),
    ).toEqual([]);
    expect(
      flagsOf([recorded('DISPOSAL', '101025', at('2027-06-01', '09:15'), { site: marshRoad })]),
    ).toEqual([]);
  });

  it('the day is the project’s, not UTC’s: a disposal at 21:30 on the close date, already the next day in UTC, is not flagged', () => {
    const closing: CheckedSite = { ...marshRoad, closeDate: '2026-11-30' };

    expect(
      flagsOf([
        recorded('DISPOSAL', '101025', at('2026-11-30', '21:30', '-05:00'), { site: closing }),
      ]),
    ).toEqual([]);
  });

  it('a haul-out’s disposal is judged by its site’s dates; its collection, leaving a closed TDSR, is not', () => {
    const closedTdsr: CheckedSite = { ...marshRoad, closeDate: '2026-11-30' };
    const closedLandfill: CheckedSite = { ...landfill, closeDate: '2026-11-30' };
    const hoc = recorded('HAUL_OUT_COLLECTION', '201001', at('2026-12-01', '13:00', '-05:00'), {
      site: closedTdsr,
    });
    const hod = recorded('HAUL_OUT_DISPOSAL', '201001', at('2026-12-01', '14:10', '-05:00'), {
      site: closedLandfill,
    });

    expect(messagesOf(flagsOf([hoc, hod]))).toEqual([
      'Ticket 201001: Bayline County Landfill closed on 01-Dec-2026. Flagged for review.',
    ]);
  });
});

describe('where the debris went', () => {
  it('AC-06-65 a load dumped at a site not marked Takes loads is flagged and still bills', () => {
    const pit: CheckedSite = { ...oldQuarryPit, takesLoads: false };
    const dis = disposal('101013', pit);
    const flags = flagsOf([dis]);

    expect(messagesOf(flags)).toEqual([
      "Ticket 101013: dumped at Old Quarry Pit, which isn't marked Takes loads. Flagged for review.",
    ]);
    expect(flags[0]).toMatchObject({
      code: 'SITE_DOES_NOT_TAKE_LOADS',
      billing: 'BILLS',
      fieldEventId: dis.id,
      facts: { siteId: pit.id, takesLoads: false },
    });
  });

  it('AC-06-66 a load dumped at an Ineligible site is flagged and still bills', () => {
    const pit: CheckedSite = { ...oldQuarryPit, ineligibleSite: true };
    const dis = disposal('101009', pit);
    const flags = flagsOf([dis]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 101009: dumped at Old Quarry Pit, an ineligible site. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'INELIGIBLE_SITE',
      billing: 'BILLS',
      fieldEventId: dis.id,
      facts: { siteId: pit.id, ineligibleSite: true },
    });
  });

  it('AC-06-67 a haul-out that left Bayline Transfer Station is flagged and still bills; one that left a landfill the same way', () => {
    const hoc = recorded('HAUL_OUT_COLLECTION', '201003', at(mon, '13:00'), {
      site: transferStation,
    });
    const flags = flagsOf([hoc]);

    expect(messagesOf(flags)).toEqual([
      "Ticket 201003: left Bayline Transfer Station, which isn't marked Haul-outs leave here. Flagged for review.",
    ]);
    expect(flags[0]).toMatchObject({
      code: 'SITE_NOT_FOR_HAUL_OUTS',
      billing: 'BILLS',
      fieldEventId: hoc.id,
      facts: { siteId: transferStation.id, haulOutsLeaveHere: false },
    });
    expect(
      messagesOf(
        flagsOf([recorded('HAUL_OUT_COLLECTION', '201003', at(mon, '13:00'), { site: landfill })]),
      ),
    ).toEqual([
      "Ticket 201003: left Bayline County Landfill, which isn't marked Haul-outs leave here. Flagged for review.",
    ]);
  });

  it('AC-06-67 a split haul-out’s piles are one trip from one site: flagged once, about the first pile', () => {
    const a = recorded('HAUL_OUT_COLLECTION', '201004-A', at(mon, '13:00'), {
      site: transferStation,
    });
    const b = recorded('HAUL_OUT_COLLECTION', '201004-B', at(mon, '13:20'), {
      site: transferStation,
    });
    const flags = flagsOf([a, b]);

    expect(flags.map((flag) => [flag.code, flag.fieldEventId])).toEqual([
      ['SITE_NOT_FOR_HAUL_OUTS', a.id],
    ]);
  });

  it('AC-06-68 a haul-out dumped at a TDSR is flagged and not priced: told by the site type’s built-in key, whatever the firm calls the type, and when it is the TDSR the haul-out left', () => {
    const hoc = recorded('HAUL_OUT_COLLECTION', '201002', at(mon, '13:00'), { site: marshRoad });
    const hod = recorded('HAUL_OUT_DISPOSAL', '201002', at(mon, '14:10'), { site: marshRoad });
    const flags = flagsOf([hoc, hod]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 201002: a haul-out dumped at Marsh Road TDSR, a TDSR. Flagged for review; not priced.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'HAUL_OUT_DUMPED_AT_TDSR',
      billing: 'NOT_BILLED',
      fieldEventId: hod.id,
      facts: { siteId: marshRoad.id, siteTypeKey: 'TDSR' },
    });

    // A site whose name says TDSR but whose type has no built-in key isn't one.
    const namedOnly = site('North Staging TDSR', point('28.05000000', '-82.30000000'));
    expect(
      flagsOf([recorded('HAUL_OUT_DISPOSAL', '201002', at(mon, '14:10'), { site: namedOnly })]),
    ).toEqual([]);
  });

  it('AC-06-72 101002, dumped at Bayline County Landfill, and 201001, which left Marsh Road TDSR for it: nothing is flagged', () => {
    expect(flagsOf([collection('101002', heronSt), disposal('101002', landfill)])).toEqual([]);
    expect(
      flagsOf([
        recorded('HAUL_OUT_COLLECTION', '201001', at(mon, '13:00'), { site: marshRoad }),
        recorded('HAUL_OUT_DISPOSAL', '201001', at(mon, '14:10'), { site: landfill }),
      ]),
    ).toEqual([]);
  });

  it('a load at a TDSR, and unit rate work at a site, are judged by none of the haul-out’s flags', () => {
    const grinding = recorded('UNIT_RATE', '301030', at(mon, '11:00'), {
      site: { ...transferStation, takesLoads: false, ineligibleSite: true },
      endGps: heronSt,
    });

    expect(flagsOf([disposal('101001', marshRoad)])).toEqual([]);
    expect(flagsOf([grinding])).toEqual([]);
  });
});

describe('a site’s own flag', () => {
  const checks = new SiteChecks('America/New_York');

  it('AC-06-118 a site with no permit number is flagged on the site, and no ticket there is flagged for it', () => {
    const noPermit: CheckedSite = { ...marshRoad, permitNumber: null };
    const flags = checks.permit(noPermit);

    expect(messagesOf(flags)).toEqual(['Marsh Road TDSR: permit outstanding.']);
    expect(flags[0]).toMatchObject({
      code: 'PERMIT_OUTSTANDING',
      subject: { site: 'Marsh Road TDSR' },
      fieldEventId: null,
      facts: { siteId: marshRoad.id },
    });
    expect(checks.permit({ ...marshRoad, permitNumber: '  ' })).toHaveLength(1);
    expect(checks.permit(marshRoad)).toEqual([]);
    expect(flagsOf([disposal('101001', noPermit)])).toEqual([]);
  });

  it('AC-06-134 a site is checked by itself only for its permit: a citizen drop-off log at one not marked Takes loads raises nothing', () => {
    // A drop-off log is a form, in no ticket: no check takes one, and the site's own check
    // reads only its permit.
    const pit: CheckedSite = { ...oldQuarryPit, takesLoads: false };
    expect(checks.permit(pit)).toEqual([]);
  });
});
