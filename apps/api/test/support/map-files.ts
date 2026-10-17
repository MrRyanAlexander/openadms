// Map files as ArcGIS Pro and QGIS export them, made byte by byte for a test (ADR-485): a
// polygon shapefile (`.shp`, `.shx`, `.dbf`, and a `.prj` where one is given), and a zip of
// files. The shapes are the example world's (spec/CONVENTIONS.md §6): P1's boundary from
// 75.80° W to 75.40° W and 38.90° N to 39.30° N, and its three zones west to east, named in the
// field ZONE_NAME as bayline-row-zones-v1 names them.
import { deflateRawSync } from 'node:zlib';

// A rectangle's one ring, clockwise as a shapefile's outer ring is: west to east, south to north.
export const ring = (west: number, south: number, east: number, north: number): number[][] => [
  [west, south],
  [west, north],
  [east, north],
  [east, south],
  [west, south],
];

export interface PolygonRecord {
  // Each polygon's rings, positions as the file holds them: longitude and latitude, or a
  // projection's eastings and northings.
  readonly rings: readonly (readonly number[][])[];
  readonly fields: Readonly<Record<string, string>>;
}

export const p1Boundary = ring(-75.8, 38.9, -75.4, 39.3);
export const p1Zones: readonly PolygonRecord[] = [
  { rings: [ring(-75.8, 38.9, -75.67, 39.3)], fields: { ZONE_NAME: 'Zone 1' } },
  { rings: [ring(-75.67, 38.9, -75.53, 39.3)], fields: { ZONE_NAME: 'Zone 2' } },
  { rings: [ring(-75.53, 38.9, -75.4, 39.3)], fields: { ZONE_NAME: 'Zone 3' } },
];

// WGS84 as ArcGIS writes it in a .prj.
export const wgs84Prj =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

// NAD83 / Delaware State Plane in US survey feet (EPSG:2235), as ArcGIS writes it: what a
// county's GIS office round Bayline County exports.
export const delawareFeetPrj =
  'PROJCS["NAD_1983_StatePlane_Delaware_FIPS_0700_Feet",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",656166.6666666665],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-75.41666666666667],PARAMETER["Scale_Factor",0.999995],PARAMETER["Latitude_Of_Origin",38.0],UNIT["Foot_US",0.3048006096012192]]';

const encoder = new TextEncoder();

class Bytes {
  private readonly view: DataView;
  readonly bytes: Uint8Array;

  constructor(length: number) {
    this.bytes = new Uint8Array(length);
    this.view = new DataView(this.bytes.buffer);
  }

  int(at: number, value: number, littleEndian: boolean): this {
    this.view.setInt32(at, value, littleEndian);
    return this;
  }

  uint16(at: number, value: number): this {
    this.view.setUint16(at, value, true);
    return this;
  }

  uint32(at: number, value: number): this {
    this.view.setUint32(at, value, true);
    return this;
  }

  double(at: number, value: number): this {
    this.view.setFloat64(at, value, true);
    return this;
  }

  text(at: number, value: string): this {
    this.bytes.set(encoder.encode(value), at);
    return this;
  }
}

const boxOf = (positions: readonly number[][]): [number, number, number, number] => {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x = 0, y = 0] of positions) {
    [west, south, east, north] = [
      Math.min(west, x),
      Math.min(south, y),
      Math.max(east, x),
      Math.max(north, y),
    ];
  }
  return [west, south, east, north];
};

// A polygon shapefile's `.shp` and `.shx`.
function shapes(records: readonly PolygonRecord[]): { shp: Uint8Array; shx: Uint8Array } {
  const contents = records.map(({ rings }) => {
    const positions = rings.flat();
    const content = new Bytes(44 + 4 * rings.length + 16 * positions.length)
      .int(0, 5, true)
      .int(36, rings.length, true)
      .int(40, positions.length, true);
    boxOf(positions).forEach((value, at) => content.double(4 + 8 * at, value));
    let part = 0;
    rings.forEach((each, at) => {
      content.int(44 + 4 * at, part, true);
      part += each.length;
    });
    positions.forEach(([x = 0, y = 0], at) => {
      const offset = 44 + 4 * rings.length + 16 * at;
      content.double(offset, x).double(offset + 8, y);
    });
    return content.bytes;
  });
  const header = (fileBytes: number): Bytes => {
    const made = new Bytes(100)
      .int(0, 9994, false)
      .int(24, fileBytes / 2, false)
      .int(28, 1000, true)
      .int(32, 5, true);
    boxOf(records.flatMap(({ rings }) => rings.flat())).forEach((value, at) =>
      made.double(36 + 8 * at, value),
    );
    return made;
  };
  const shpBytes = 100 + contents.reduce((sum, content) => sum + 8 + content.byteLength, 0);
  const shp = new Bytes(shpBytes);
  shp.bytes.set(header(shpBytes).bytes, 0);
  const shx = new Bytes(100 + 8 * records.length);
  shx.bytes.set(header(100 + 8 * records.length).bytes, 0);
  let offset = 100;
  contents.forEach((content, at) => {
    shp.int(offset, at + 1, false).int(offset + 4, content.byteLength / 2, false);
    shp.bytes.set(content, offset + 8);
    shx.int(100 + 8 * at, offset / 2, false).int(104 + 8 * at, content.byteLength / 2, false);
    offset += 8 + content.byteLength;
  });
  return { shp: shp.bytes, shx: shx.bytes };
}

// A dBase III `.dbf` of character fields, one row a shape. `rowsSaid` states another count of
// rows in its header than it holds, as a file made to harm would.
export function dbf(
  rows: readonly Readonly<Record<string, string>>[],
  rowsSaid = rows.length,
): Uint8Array {
  const names = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = names.map((name) =>
    Math.max(1, ...rows.map((row) => encoder.encode(row[name] ?? '').byteLength)),
  );
  const headerBytes = 32 + 32 * names.length + 1;
  const rowBytes = 1 + widths.reduce((sum, width) => sum + width, 0);
  const made = new Bytes(headerBytes + rowBytes * rows.length + 1)
    .uint32(4, rowsSaid)
    .uint16(8, headerBytes)
    .uint16(10, rowBytes);
  made.bytes[0] = 0x03;
  names.forEach((name, at) => {
    made.text(32 + 32 * at, name.slice(0, 10));
    made.text(32 + 32 * at + 11, 'C');
    made.bytes[32 + 32 * at + 16] = widths[at] ?? 1;
  });
  made.bytes[headerBytes - 1] = 0x0d;
  rows.forEach((row, at) => {
    let offset = headerBytes + rowBytes * at;
    made.bytes[offset] = 0x20;
    offset += 1;
    names.forEach((name, field) => {
      const width = widths[field] ?? 1;
      const value = encoder.encode(row[name] ?? '');
      made.bytes.fill(0x20, offset, offset + width);
      made.bytes.set(value, offset);
      offset += width;
    });
  });
  made.bytes[made.bytes.byteLength - 1] = 0x1a;
  return made.bytes;
}

// A shapefile's files, under its name: `.shp`, `.shx`, `.dbf`, and `.prj` where one is given.
export function shapefile(
  name: string,
  records: readonly PolygonRecord[],
  prj: string | null = wgs84Prj,
): Record<string, Uint8Array> {
  const { shp, shx } = shapes(records);
  return {
    [`${name}.shp`]: shp,
    [`${name}.shx`]: shx,
    [`${name}.dbf`]: dbf(records.map(({ fields }) => fields)),
    ...(prj === null ? {} : { [`${name}.prj`]: encoder.encode(prj) }),
  };
}

// The standard CRC-32 a zip states for each file.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

// A zip of files, each deflated as ArcGIS and QGIS do, or stored as they are.
export function zipped(
  files: Readonly<Record<string, Uint8Array>>,
  how: 'DEFLATED' | 'STORED' = 'DEFLATED',
): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, bytes] of Object.entries(files)) {
    const named = encoder.encode(name);
    const packed = how === 'DEFLATED' ? new Uint8Array(deflateRawSync(bytes)) : bytes;
    const method = how === 'DEFLATED' ? 8 : 0;
    const crc = crc32(bytes);
    const local = new Bytes(30 + named.byteLength + packed.byteLength)
      .uint32(0, 0x04034b50)
      .uint16(4, 20)
      .uint16(8, method)
      .uint32(14, crc)
      .uint32(18, packed.byteLength)
      .uint32(22, bytes.byteLength)
      .uint16(26, named.byteLength);
    local.bytes.set(named, 30);
    local.bytes.set(packed, 30 + named.byteLength);
    const central = new Bytes(46 + named.byteLength)
      .uint32(0, 0x02014b50)
      .uint16(4, 20)
      .uint16(6, 20)
      .uint16(10, method)
      .uint32(16, crc)
      .uint32(20, packed.byteLength)
      .uint32(24, bytes.byteLength)
      .uint16(28, named.byteLength)
      .uint32(42, offset);
    central.bytes.set(named, 46);
    locals.push(local.bytes);
    centrals.push(central.bytes);
    offset += local.bytes.byteLength;
  }
  const directory = centrals.reduce((sum, central) => sum + central.byteLength, 0);
  const end = new Bytes(22)
    .uint32(0, 0x06054b50)
    .uint16(8, centrals.length)
    .uint16(10, centrals.length)
    .uint32(12, directory)
    .uint32(16, offset);
  return Buffer.concat([...locals, ...centrals, end.bytes]);
}

export const geojsonFile = (geojson: unknown): Uint8Array =>
  encoder.encode(JSON.stringify(geojson));

// A KML file as Google Earth exports it (OGC 07-147r2): each placemark a polygon, its outer
// ring's coordinates `longitude,latitude[,altitude]`, its fields in `ExtendedData`.
export const placemark = (name: string, rings: readonly (readonly number[][])[], zone?: string) => `
    <Placemark>
      <name>${name}</name>
      ${zone === undefined ? '' : `<ExtendedData><Data name="ZONE_NAME"><value>${zone}</value></Data></ExtendedData>`}
      <Polygon>
        ${rings
          .map(
            (ring, at) =>
              `<${at === 0 ? 'outerBoundaryIs' : 'innerBoundaryIs'}><LinearRing><coordinates>${ring
                .map(([longitude, latitude]) => `${String(longitude)},${String(latitude)},0`)
                .join(
                  ' ',
                )}</coordinates></LinearRing></${at === 0 ? 'outerBoundaryIs' : 'innerBoundaryIs'}>`,
          )
          .join('')}
      </Polygon>
    </Placemark>`;
export const kmlFile = (body: string, prologue = '<?xml version="1.0" encoding="UTF-8"?>\n') =>
  new TextEncoder().encode(
    `${prologue}<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Bayline ROW</name>${body}</Document></kml>`,
  );
export const p1ZonesKml = p1Zones
  .map(({ rings, fields }) =>
    placemark(String(fields['ZONE_NAME']), rings, String(fields['ZONE_NAME'])),
  )
  .join('');
