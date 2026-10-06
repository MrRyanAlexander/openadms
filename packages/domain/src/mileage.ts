// A load's and a haul-out's mileage, as the worker keeps it (spec/parts/06-reconciliation.md
// step 4; spec/acceptance/06-reconciliation.md AC-06-53…56; spec/DATA-MODEL.md §5,
// `CompletedLoadCollection`; spec/FLAGS.md `NO_ROAD_ROUTE`; ARCHITECTURE §3 "Road distance and
// addresses"; ADR-110, 119, 162, 163, 208, 282, 349, 350).
//
// The mileage runs from a collection's end GPS (a load's or a haul-out's collection; each
// property's or pile's own on a split) to the disposal site's own GPS, never to where the
// disposal monitor stood. It is the road distance of the shortest route a car would drive on
// public roads, never across a private one (the user, ADR-350), from
// the point on a road nearest the collection's end GPS; where the routing server finds no road
// route it is the straight line between the two GPS points, flagged, and still bills. A unit
// rate ticket has none.
//
// Nothing here asks a map server: the worker does (`apps/worker`), and hands what it was
// answered to this, which says what is kept. A mileage already kept is asked for again only when
// the collection's end GPS or the site's GPS is corrected: the two ends are on the records
// themselves and are kept nowhere else (the user, ADR-350), so the run says when one moved. The figure is kept as the routing server gave it,
// to the column's four decimal places, never rounded to the tenths a rule compares in (ADR-125:
// `Mileage.inTenths` is that rounding, and only a criterion uses it).
import type { FlagRaised, Flags, FlagSubject } from './flags.ts';
import { Distance, type GpsPoint } from './geodesic.ts';
import { Exact } from './quantities.ts';

export const mileageSources = ['ROAD_ROUTE', 'STRAIGHT_LINE'] as const;
export type MileageSource = (typeof mileageSources)[number];

// The map extract a mileage came from: its date (2026-01-01) and its SHA-256, kept with every
// mileage so a map update never silently changes a billed one (ARCHITECTURE §3; ADR-282).
export interface MapData {
  readonly date: string;
  readonly sha256: string;
}

// The point on a road nearest a collection's end GPS, and its looked-up address: street number
// and name, as a field event's address is (ADR-111); none where the address server knows none.
export interface RoadPoint {
  readonly point: GpsPoint;
  readonly address: string | null;
}

// The two GPS points a mileage is measured between.
export interface MileageEnds {
  // The collection's end GPS.
  readonly from: GpsPoint;
  // The disposal site's own GPS.
  readonly to: GpsPoint;
}

export interface MileageMeasured {
  // Miles at the column's scale: "6.2140".
  readonly miles: string;
  readonly source: MileageSource;
  readonly ends: MileageEnds;
  // The road point routed from; none where no road is near the collection's end GPS.
  readonly snapped: GpsPoint | null;
  readonly snappedAddress: string | null;
  readonly mapData: MapData;
}

const metersInAMile = 1609.344;
const scale = 4;

export class Mileage {
  private readonly ends: MileageEnds;
  private readonly mapData: MapData;

  constructor(ends: MileageEnds, mapData: MapData) {
    this.ends = ends;
    this.mapData = mapData;
  }

  // The miles a rule compares: what is kept, rounded half up to tenths of a mile (15.04 is 15.0,
  // 15.05 is 15.1). The one place that rounding lives, so Show matches and the worker always
  // agree; what is kept stays as it was measured (ADR-125).
  static inTenths(miles: string): string {
    return Exact.of(miles).text(1);
  }

  // The routing server found a route from the road point to the site: its length, in miles.
  byRoad(roadPoint: RoadPoint, routeMiles: number): MileageMeasured {
    if (!Number.isFinite(routeMiles) || routeMiles < 0) {
      throw new Error('A road route has a length of nought or more, in miles.');
    }
    return this.measured(routeMiles, 'ROAD_ROUTE', roadPoint);
  }

  // No road route: the straight line (the geodesic) from the collection's end GPS itself to the
  // site's GPS, with the road point where one was found (ADR-163; invariant 14).
  straightLine(roadPoint: RoadPoint | null): MileageMeasured {
    const meters = new Distance(this.ends.from, this.ends.to).meters();
    return this.measured(meters / metersInAMile, 'STRAIGHT_LINE', roadPoint);
  }

  // "Ticket 101026: no road route found; straight-line distance used." Raised on the
  // collection whose mileage it is; none for a mileage by road. Its facts are both points and
  // the map data's date (spec/FLAGS.md §3.3).
  static noRoadRoute(
    flags: Flags,
    subject: FlagSubject,
    collectionEventId: string,
    measured: MileageMeasured,
  ): FlagRaised<'NO_ROAD_ROUTE'> | null {
    if (measured.source !== 'STRAIGHT_LINE') return null;
    const { from, to } = measured.ends;
    return flags.raise(
      'NO_ROAD_ROUTE',
      subject,
      {},
      {
        from: { latitude: from.latitude, longitude: from.longitude },
        to: { latitude: to.latitude, longitude: to.longitude },
        mapDataDate: measured.mapData.date,
      },
      collectionEventId,
    );
  }

  private measured(
    miles: number,
    source: MileageSource,
    roadPoint: RoadPoint | null,
  ): MileageMeasured {
    return {
      miles: miles.toFixed(scale),
      source,
      ends: this.ends,
      snapped: roadPoint?.point ?? null,
      snappedAddress: roadPoint?.address ?? null,
      mapData: this.mapData,
    };
  }
}
