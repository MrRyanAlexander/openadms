// The one home of distance, and whether a point is in a shape (invariant 14; ARCHITECTURE §3;
// ADR-005, 141, 144, 346; BACKLOG C57; spec/acceptance/06-reconciliation.md AC-06-46, 47). The
// places are the example world's (spec/CONVENTIONS.md §6): Marsh Road TDSR at 27.98150000,
// −82.39720000, Bayline County Landfill at 27.89340000, −82.32160000, P1's boundary from
// 82.60° W to 82.20° W and 27.80° N to 28.20° N.
import { describe, expect, it } from 'vitest';

import { Distance, MapShapes, ShapeArea, type GpsPoint, type MapShape } from '../src/index.ts';

const point = (latitude: string, longitude: string): GpsPoint => ({ latitude, longitude });
const marshRoad = point('27.98150000', '-82.39720000');
const landfill = point('27.89340000', '-82.32160000');

const metersBetween = (from: GpsPoint, to: GpsPoint): number => new Distance(from, to).meters();

function shapeOf(geojson: unknown): MapShape {
  const { read, problem } = new MapShapes(geojson).shape();
  if (read === null) throw new Error(problem);
  return read;
}
const ring = (west: number, south: number, east: number, north: number): number[][] => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
];
const boundary = shapeOf({ type: 'Polygon', coordinates: [ring(-82.6, 27.8, -82.2, 28.2)] });

describe('a distance', () => {
  it('is measured on the WGS84 ellipsoid: a degree of latitude and a degree of longitude at the equator', () => {
    // 111,319.491 m is the equator's radius, 6,378,137 m, times one degree in radians; a degree
    // of latitude there is shorter, since the earth is flattened: 110,574.389 m.
    expect(metersBetween(point('0', '0'), point('0', '1'))).toBeCloseTo(111_319.491, 3);
    expect(metersBetween(point('0', '0'), point('1', '0'))).toBeCloseTo(110_574.389, 3);
  });

  it('is the same both ways, and nought between a point and itself', () => {
    expect(metersBetween(marshRoad, landfill)).toBe(metersBetween(landfill, marshRoad));
    expect(metersBetween(marshRoad, marshRoad)).toBe(0);
  });

  it('is never a sphere’s shortcut: Marsh Road TDSR to Bayline County Landfill is 12,275.1 m, where a sphere says 18 m more', () => {
    expect(metersBetween(marshRoad, landfill)).toBeCloseTo(12_275.115, 3);
  });

  it('AC-06-46 250 m and 150 m north of Marsh Road TDSR’s GPS are told apart by a 200 m circle, and a point on the circle is inside', () => {
    const at250 = new Distance(point('27.98375593', '-82.39720000'), marshRoad);
    const at150 = new Distance(point('27.98285356', '-82.39720000'), marshRoad);

    expect(at250.meters()).toBeCloseTo(250, 2);
    expect(at150.meters()).toBeCloseTo(150, 2);
    expect(at250.isWithin(200)).toBe(false);
    expect(at150.isWithin(200)).toBe(true);
    expect(at250.isWithin(at250.meters())).toBe(true);
  });
});

describe('a point in a shape', () => {
  it('inside P1’s boundary, outside it, and outside its bounding box', () => {
    const area = new ShapeArea(boundary);

    expect(area.holds(point('27.94620000', '-82.45870000'))).toBe(true);
    expect(area.holds(point('27.75000000', '-82.40000000'))).toBe(false);
    expect(area.holds(point('28.00000000', '-82.60000001'))).toBe(false);
  });

  it('a point on an edge, or on a corner, is inside', () => {
    const area = new ShapeArea(boundary);

    expect(area.holds(point('27.80000000', '-82.40000000'))).toBe(true);
    expect(area.holds(point('28.00000000', '-82.60000000'))).toBe(true);
    expect(area.holds(point('28.20000000', '-82.20000000'))).toBe(true);
  });

  it('a shape that isn’t a rectangle: inside its notch is outside the shape, though inside its box', () => {
    // An L: the north-east quarter is cut away.
    const l = shapeOf({
      type: 'Polygon',
      coordinates: [
        [
          [-82.6, 27.8],
          [-82.2, 27.8],
          [-82.2, 28.0],
          [-82.4, 28.0],
          [-82.4, 28.2],
          [-82.6, 28.2],
          [-82.6, 27.8],
        ],
      ],
    });
    const area = new ShapeArea(l);

    expect(area.holds(point('28.10000000', '-82.50000000'))).toBe(true);
    expect(area.holds(point('27.90000000', '-82.30000000'))).toBe(true);
    expect(area.holds(point('28.10000000', '-82.30000000'))).toBe(false);
  });

  it('a hole is outside the shape; the hole’s own edge is inside', () => {
    const holed = shapeOf({
      type: 'Polygon',
      coordinates: [ring(-82.6, 27.8, -82.2, 28.2), ring(-82.45, 27.95, -82.35, 28.05)],
    });
    const area = new ShapeArea(holed);

    expect(area.holds(point('28.00000000', '-82.40000000'))).toBe(false);
    expect(area.holds(point('28.00000000', '-82.45000000'))).toBe(true);
    expect(area.holds(point('28.00000000', '-82.50000000'))).toBe(true);
  });

  it('a shape in several pieces holds a point in any of them, and none between them', () => {
    const pieces = shapeOf({
      type: 'MultiPolygon',
      coordinates: [[ring(-82.6, 27.8, -82.5, 27.9)], [ring(-82.3, 28.1, -82.2, 28.2)]],
    });
    const area = new ShapeArea(pieces);

    expect(area.holds(point('27.85000000', '-82.55000000'))).toBe(true);
    expect(area.holds(point('28.15000000', '-82.25000000'))).toBe(true);
    expect(area.holds(point('28.00000000', '-82.40000000'))).toBe(false);
  });
});
