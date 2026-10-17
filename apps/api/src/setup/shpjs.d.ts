// shpjs 6.2.0 ships no types of its own (ADR-484): only the three calls map-file-reader.ts makes,
// as its source (`lib/index.js`) defines them. Each throws on what it can't read.
declare module 'shpjs' {
  type Bytes = DataView | ArrayBuffer | Uint8Array;

  // A `.shp`'s shapes as GeoJSON geometries, in its file's order (a null shape as null). With a
  // `.prj`'s text, each position is converted from that coordinate system to longitude and
  // latitude, WGS84; where proj4 can't read it, nothing is converted and nothing is said.
  export function parseShp(shp: Bytes, prj?: string): unknown[];
  // A `.dbf`'s rows, one a shape, in the code page its `.cpg` names.
  export function parseDbf(dbf: Bytes, cpg?: string): Record<string, unknown>[];
  // The shapes and their rows as one FeatureCollection.
  export function combine(parts: [unknown[], (Record<string, unknown>[] | undefined)?]): {
    type: 'FeatureCollection';
    features: { type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }[];
  };
}
