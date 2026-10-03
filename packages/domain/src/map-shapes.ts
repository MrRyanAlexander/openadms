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
// point is in a shape is the engine's, in this same module (BACKLOG 1.5).

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
