// Reading a shape off a map (ARCHITECTURE §3; spec/DATA-MODEL.md §3 "MapVersion", "Zone",
// "SiteAreaVersion"; ADR-135, 141, 144, 311; BACKLOG C57). A project's boundary, its zones and a
// site's own area come in as GeoJSON: a geometry, a Feature or a FeatureCollection. What is kept is
// a Polygon or a MultiPolygon in longitude and latitude, WGS84, with its bounding box, which
// whoever writes a shape works out: here. Anything else is refused, in plain words, before it is
// saved: a point or a line, a ring that isn't closed, a position off the earth.
//
// The box is the least and greatest longitude and latitude of the shape's positions, written as
// exact decimals to eight places, as the database keeps them (invariant 15). A shape that crosses
// the 180° meridian gets a box the whole way round, which is still a box it lies in. Whether a
// point is in a shape is the engine's, in this same module: `ShapeArea` (ADR-346).
import type { GpsPoint } from './geodesic.ts';

// Type aliases, not interfaces, so a shape is plain JSON to whoever stores it.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type PolygonShape = {
  readonly type: 'Polygon';
  // Rings of positions, each [longitude, latitude]; the first ring is the outline.
  readonly coordinates: number[][][];
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type MultiPolygonShape = {
  readonly type: 'MultiPolygon';
  readonly coordinates: number[][][][];
};

export type MapGeometry = PolygonShape | MultiPolygonShape;

// Exact decimals to eight places: "-82.60000000".
export interface BoundingBox {
  readonly westLongitude: string;
  readonly southLatitude: string;
  readonly eastLongitude: string;
  readonly northLatitude: string;
}

export interface MapShape {
  readonly geometry: MapGeometry;
  readonly box: BoundingBox;
}

// A zone: every feature the file gives one name, as one shape (ADR-141).
export interface NamedShape extends MapShape {
  readonly name: string;
}

// What was read, or why it can't be kept.
export type ShapeReading<T> =
  { readonly read: T; readonly problem: null } | { readonly read: null; readonly problem: string };

type Polygon = number[][][];

class NotAShape extends Error {}

// One GeoJSON value as it came in: a file's contents, or what was drawn.
export class MapShapes {
  private readonly geojson: unknown;

  constructor(geojson: unknown) {
    this.geojson = geojson;
  }

  // One shape from a geometry, a Feature or a FeatureCollection: its polygons together, a Polygon
  // where there is one and a MultiPolygon where there are several.
  shape(): ShapeReading<MapShape> {
    return MapShapes.reading(() => MapShapes.together(MapShapes.polygonsOf(this.geojson)));
  }

  // The zones of a Feature or a FeatureCollection, each named by the field the admin picked
  // (ZONE_NAME), in the order the file first names them. Features that share a name are one zone.
  zones(nameField: string): ShapeReading<NamedShape[]> {
    return MapShapes.reading(() => {
      const named = new Map<string, Polygon[]>();
      for (const feature of MapShapes.featuresOf(this.geojson)) {
        const properties = feature['properties'];
        const value = MapShapes.isRecord(properties) ? properties[nameField] : undefined;
        const name =
          typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
        if (name === '') throw new NotAShape(`A zone has no name in the field ${nameField}.`);
        named.set(name, [...(named.get(name) ?? []), ...MapShapes.polygonsOf(feature)]);
      }
      if (named.size === 0) throw new NotAShape('The file holds no zone.');
      return [...named].map(([name, polygons]) => ({ name, ...MapShapes.together(polygons) }));
    });
  }

  private static reading<T>(read: () => T): ShapeReading<T> {
    try {
      return { read: read(), problem: null };
    } catch (error) {
      if (error instanceof NotAShape) return { read: null, problem: error.message };
      throw error;
    }
  }

  private static together(polygons: readonly Polygon[]): MapShape {
    const [only] = polygons;
    if (only === undefined) throw new NotAShape('The shape holds no polygon.');
    const geometry: MapGeometry =
      polygons.length === 1
        ? { type: 'Polygon', coordinates: only }
        : { type: 'MultiPolygon', coordinates: [...polygons] };
    return { geometry, box: MapShapes.boxOf(polygons) };
  }

  private static boxOf(polygons: readonly Polygon[]): BoundingBox {
    const positions = polygons.flat(2);
    const longitudes = positions.map((position) => position[0] ?? 0);
    const latitudes = positions.map((position) => position[1] ?? 0);
    return {
      westLongitude: Math.min(...longitudes).toFixed(8),
      southLatitude: Math.min(...latitudes).toFixed(8),
      eastLongitude: Math.max(...longitudes).toFixed(8),
      northLatitude: Math.max(...latitudes).toFixed(8),
    };
  }

  private static featuresOf(geojson: unknown): Record<string, unknown>[] {
    if (!MapShapes.isRecord(geojson)) throw new NotAShape('The file is not GeoJSON.');
    if (geojson['type'] === 'Feature') return [geojson];
    if (geojson['type'] === 'FeatureCollection' && Array.isArray(geojson['features'])) {
      return (geojson['features'] as unknown[]).map((feature) => {
        if (!MapShapes.isRecord(feature) || feature['type'] !== 'Feature') {
          throw new NotAShape('A FeatureCollection holds only Features.');
        }
        return feature;
      });
    }
    throw new NotAShape('Zones come as a GeoJSON Feature or FeatureCollection.');
  }

  private static polygonsOf(geojson: unknown): Polygon[] {
    if (!MapShapes.isRecord(geojson)) throw new NotAShape('The file is not GeoJSON.');
    const coordinates: unknown = geojson['coordinates'];
    switch (geojson['type']) {
      case 'FeatureCollection':
        return MapShapes.featuresOf(geojson).flatMap((feature) => MapShapes.polygonsOf(feature));
      case 'Feature':
        return MapShapes.polygonsOf(geojson['geometry']);
      case 'Polygon':
        return [MapShapes.polygon(coordinates)];
      case 'MultiPolygon':
        if (!Array.isArray(coordinates) || coordinates.length === 0) {
          throw new NotAShape('A MultiPolygon holds at least one polygon.');
        }
        return (coordinates as unknown[]).map((polygon) => MapShapes.polygon(polygon));
      default:
        throw new NotAShape(
          `A shape is a Polygon or a MultiPolygon: ${typeof geojson['type'] === 'string' ? geojson['type'] : 'no type'} can't be kept.`,
        );
    }
  }

  private static polygon(coordinates: unknown): Polygon {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      throw new NotAShape('A polygon holds at least one ring.');
    }
    return (coordinates as unknown[]).map((ring) => MapShapes.ring(ring));
  }

  // A closed ring: four positions or more, the last the same as the first.
  private static ring(ring: unknown): number[][] {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new NotAShape('A ring has at least four positions.');
    }
    const positions = (ring as unknown[]).map((position) => MapShapes.position(position));
    const first = positions[0];
    const last = positions[positions.length - 1];
    if (first?.[0] !== last?.[0] || first?.[1] !== last?.[1]) {
      throw new NotAShape("A ring isn't closed: its last position must be its first.");
    }
    return positions;
  }

  // Longitude then latitude, on the earth; a height, if the file gives one, isn't kept.
  private static position(position: unknown): number[] {
    const [longitude, latitude] = Array.isArray(position) ? (position as unknown[]) : [];
    if (
      typeof longitude !== 'number' ||
      typeof latitude !== 'number' ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude)
    ) {
      throw new NotAShape('A position is a longitude and a latitude.');
    }
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      throw new NotAShape(
        `A position is off the earth: longitude ${String(longitude)}, latitude ${String(latitude)}. Shapes are in longitude and latitude, WGS84.`,
      );
    }
    return [longitude, latitude];
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

type RingSide = 'IN' | 'EDGE' | 'OUT';

// Whether a GPS point is in a shape: the project's boundary, a zone, a site's own area
// (ARCHITECTURE §3 "The check"; ADR-141, 144, 346; BACKLOG C57). Point-in-polygon on longitude
// and latitude; **a point on an edge is inside**. A polygon's later rings are holes: a point in
// one is outside, a point on a hole's edge inside. The bounding box is the quick first test.
//
// The shapes of a project are a county across at most, so an edge is taken as the straight line
// between its two positions in longitude and latitude, as every GIS tool that drew it shows it.
// A shape that crosses the 180° meridian isn't handled apart: its box goes the whole way round,
// and no project lies there.
export class ShapeArea {
  private readonly shape: MapShape;

  constructor(shape: MapShape) {
    this.shape = shape;
  }

  holds(point: GpsPoint): boolean {
    const x = Number(point.longitude);
    const y = Number(point.latitude);
    const { box, geometry } = this.shape;
    if (
      x < Number(box.westLongitude) ||
      x > Number(box.eastLongitude) ||
      y < Number(box.southLatitude) ||
      y > Number(box.northLatitude)
    ) {
      return false;
    }
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.some((polygon) => ShapeArea.polygonHolds(polygon, x, y));
  }

  private static polygonHolds(polygon: Polygon, x: number, y: number): boolean {
    const [outline, ...holes] = polygon;
    if (outline === undefined) return false;
    const side = ShapeArea.sideOf(outline, x, y);
    if (side !== 'IN') return side === 'EDGE';
    return holes.every((hole) => ShapeArea.sideOf(hole, x, y) !== 'IN');
  }

  // Where the point lies against one closed ring: a ray cast east crosses the ring an odd number
  // of times from inside it.
  private static sideOf(ring: number[][], x: number, y: number): RingSide {
    let inside = false;
    for (let index = 1; index < ring.length; index += 1) {
      const [x1 = 0, y1 = 0] = ring[index - 1] ?? [];
      const [x2 = 0, y2 = 0] = ring[index] ?? [];
      const onTheLine = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) === 0;
      if (
        onTheLine &&
        x >= Math.min(x1, x2) &&
        x <= Math.max(x1, x2) &&
        y >= Math.min(y1, y2) &&
        y <= Math.max(y1, y2)
      ) {
        return 'EDGE';
      }
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
    }
    return inside ? 'IN' : 'OUT';
  }
}
