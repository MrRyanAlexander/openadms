// The one home of distance (invariant 14; ARCHITECTURE §3 "Geodesic math"; ADR-005, 094, 346).
// A distance between two GPS points is the geodesic on the WGS84 ellipsoid, by Karney's
// algorithm, never a flat-earth or a sphere's shortcut: an error of a few metres at the edge of a
// site's circle would flag, or pass, the wrong load. Nothing else in the codebase measures a
// distance; the road mileage is the routing server's (ADR-110), and its flagged straight-line
// fallback is this (ADR-163).
//
// A coordinate is kept as an exact decimal to eight places and travels as text (invariant 15);
// it becomes a floating-point number only here and in `ShapeArea`, for the measuring. Eight
// decimal places are far inside what a double holds exactly enough: about a millimetre on the
// ground.
import geographiclib from 'geographiclib-geodesic';

// A GPS point, WGS84, each half an exact decimal as text: "27.98150000".
export interface GpsPoint {
  readonly latitude: string;
  readonly longitude: string;
}

export class Distance {
  private readonly from: GpsPoint;
  private readonly to: GpsPoint;

  constructor(from: GpsPoint, to: GpsPoint) {
    this.from = from;
    this.to = to;
  }

  // The length of the shortest path over the ellipsoid, in metres.
  meters(): number {
    const { s12 } = geographiclib.Geodesic.WGS84.Inverse(
      Number(this.from.latitude),
      Number(this.from.longitude),
      Number(this.to.latitude),
      Number(this.to.longitude),
      geographiclib.Geodesic.DISTANCE,
    );
    if (s12 === undefined || !Number.isFinite(s12)) {
      throw new Error('No distance could be measured between the two points.');
    }
    return s12;
  }

  // Inside a circle of that many metres round either point; a point on the circle is inside,
  // as a point on a shape's edge is (ARCHITECTURE §3).
  isWithin(limitMeters: number): boolean {
    return this.meters() <= limitMeters;
  }
}
