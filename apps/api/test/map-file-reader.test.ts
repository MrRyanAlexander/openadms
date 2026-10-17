// A map's file read to GeoJSON (ARCHITECTURE §3 "Project boundary and zones"; BACKLOG 2.6.4,
// C100; ADR-484, 485): a zipped shapefile, converted from its `.prj` where it is projected, or
// a GeoJSON file, into its layers, and a file made to harm read no further than the bound. No
// stack: the reader alone, on files made byte by byte (support/map-files.ts).
import { MapShapes } from '@open-adms/domain';
import proj4 from 'proj4';
import { describe, expect, it } from 'vitest';

import { MapFileReader, type MapLayer } from '../src/setup/map-file-reader.ts';
import {
  dbf,
  delawareFeetPrj,
  geojsonFile,
  kmlFile,
  p1ZonesKml,
  placemark,
  p1Boundary,
  p1Zones,
  ring,
  shapefile,
  zipped,
} from './support/map-files.ts';

const mebibyte = 1_048_576;
// The policy's own bound on a shape's outer rings times its holes (ADR-524).
const ringPairsAtMost = 50_000_000;
const reader = new MapFileReader({
  unzippedBytesAtMost: 64 * mebibyte,
  entriesAtMost: 1000,
  ringPairsAtMost,
});
const encoder = new TextEncoder();

const read = async (bytes: Uint8Array, by = reader) => {
  const reading = await by.read(bytes);
  if (reading.read === null) throw new Error(`Not read: ${reading.problem}`);
  return reading.read;
};
// A layer as the answer shows it: everything but its shapes.
const shown = ({ name, features, fields, problem }: MapLayer) => ({
  name,
  features,
  fields,
  problem,
});
const problemOf = async (bytes: Uint8Array, by = reader) => (await by.read(bytes)).problem;
const zonesOf = (geojson: unknown) =>
  new MapShapes(geojson).zones('ZONE_NAME').read?.map(({ name, box }) => ({ name, ...box }));

const p1ZonesRead = [
  { name: 'Zone 1', westLongitude: '-75.80000000', eastLongitude: '-75.67000000' },
  { name: 'Zone 2', westLongitude: '-75.67000000', eastLongitude: '-75.53000000' },
  { name: 'Zone 3', westLongitude: '-75.53000000', eastLongitude: '-75.40000000' },
].map((zone) => ({ ...zone, southLatitude: '38.90000000', northLatitude: '39.30000000' }));

describe('a zipped shapefile', () => {
  it('is read into its layers: P1’s zones in longitude and latitude, each feature with its fields', async () => {
    const file = await read(zipped(shapefile('bayline-row-zones-v1', p1Zones)));
    expect(file.type).toBe('application/zip');
    expect(file.layers.map(shown)).toEqual([
      { name: 'bayline-row-zones-v1.shp', features: 3, fields: ['ZONE_NAME'], problem: null },
    ]);
    expect(zonesOf(file.layers[0]?.geojson)).toEqual(p1ZonesRead);
  });

  it('a zip of several is a layer for each shapefile and each GeoJSON file in it, by its path there; a Mac’s own copies are left out', async () => {
    const file = await read(
      zipped({
        ...shapefile('P1/Boundary', [{ rings: [p1Boundary], fields: { NAME: 'P1' } }]),
        ...shapefile('P1/Zones', p1Zones),
        ...shapefile('__MACOSX/P1/._Zones', p1Zones),
        'P1/Marsh Road.geojson': geojsonFile({
          type: 'Polygon',
          coordinates: [ring(-75.62, 39.08, -75.6, 39.1)],
        }),
        'P1/readme.txt': encoder.encode('Exported from ArcGIS Pro.'),
      }),
    );
    expect(
      file.layers.map(({ name, features, fields, problem }) => [name, features, fields, problem]),
    ).toEqual([
      ['P1/Boundary.shp', 1, ['NAME'], null],
      ['P1/Zones.shp', 3, ['ZONE_NAME'], null],
      ['P1/Marsh Road.geojson', 1, [], null],
    ]);
    expect(new MapShapes(file.layers[0]?.geojson).shape().read?.box).toEqual({
      westLongitude: '-75.80000000',
      southLatitude: '38.90000000',
      eastLongitude: '-75.40000000',
      northLatitude: '39.30000000',
    });
  });

  it('stored without deflating is read the same', async () => {
    const file = await read(zipped(shapefile('zones', p1Zones), 'STORED'));
    expect(zonesOf(file.layers[0]?.geojson)).toEqual(p1ZonesRead);
  });

  it('in a projected coordinate system (Delaware State Plane, feet) is converted from its .prj to longitude and latitude', async () => {
    const toFeet = proj4(delawareFeetPrj);
    const projected = p1Zones.map(({ rings, fields }) => ({
      rings: rings.map((each) => each.map((position) => toFeet.forward(position))),
      fields,
    }));
    // In feet, nothing like a longitude.
    expect(projected[0]?.rings[0]?.[0]?.[0]).toBeGreaterThan(500_000);
    const file = await read(zipped(shapefile('zones', projected, delawareFeetPrj)));
    const zones = new MapShapes(file.layers[0]?.geojson).zones('ZONE_NAME').read ?? [];
    expect(zones.map(({ name }) => name)).toEqual(['Zone 1', 'Zone 2', 'Zone 3']);
    const corners = zones.flatMap(({ geometry }) => geometry.coordinates.flat(1));
    p1Zones
      .flatMap(({ rings }) => rings.flat())
      .forEach(([longitude = 0, latitude = 0], at) => {
        expect(corners[at]?.[0]).toBeCloseTo(longitude, 7);
        expect(corners[at]?.[1]).toBeCloseTo(latitude, 7);
      });
  });

  it('with no .prj is taken as longitude and latitude: a projected one with none is off the earth, and said so', async () => {
    const plain = await read(zipped(shapefile('zones', p1Zones, null)));
    expect(zonesOf(plain.layers[0]?.geojson)).toEqual(p1ZonesRead);
    const toFeet = proj4(delawareFeetPrj);
    const lost = await read(
      zipped(
        shapefile(
          'zones',
          [{ rings: [p1Boundary.map((position) => toFeet.forward(position))], fields: {} }],
          null,
        ),
      ),
    );
    expect(lost.layers[0]?.problem).toMatch(
      /^A position is off the earth: longitude \d+\.\d+, latitude \d+\.\d+\. Shapes are in longitude and latitude, WGS84\.$/,
    );
  });

  it('whose .prj can’t be read is a layer that can’t be read, said so, never taken as it stands', async () => {
    const file = await read(
      zipped(shapefile('zones', p1Zones, 'PROJCS["Somewhere",NOT_A_PROJECTION')),
    );
    expect(file.layers).toEqual([
      {
        name: 'zones.shp',
        geojson: null,
        features: 0,
        fields: [],
        problem:
          'Its .prj names a coordinate system that can’t be read, so its positions can’t be put in longitude and latitude.',
      },
    ]);
  });

  it('reads its fields in the code page its .cpg names', async () => {
    const files = shapefile('zones', [
      { rings: [p1Boundary], fields: { ZONE_NAME: 'Bayline – North' } },
    ]);
    const file = await read(zipped({ ...files, 'zones.cpg': encoder.encode('UTF-8') }));
    expect(zonesOf(file.layers[0]?.geojson)?.map(({ name }) => name)).toEqual(['Bayline – North']);
  });

  it('a layer of what is no shape is read, and says why it isn’t one', async () => {
    const file = await read(
      zipped({
        'sites.geojson': geojsonFile({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { SITE: 'BCL' },
              geometry: { type: 'Point', coordinates: [-75.6, 39.1] },
            },
          ],
        }),
      }),
    );
    expect(file.layers.map(shown)).toEqual([
      {
        name: 'sites.geojson',
        features: 1,
        fields: ['SITE'],
        problem: "A shape is a Polygon or a MultiPolygon: Point can't be kept.",
      },
    ]);
  });
});

describe('a file made to harm, or broken', () => {
  it('a zip that unzips past the bound stops at it, unread: one part or several together (OWASP ASVS 5.0 V5)', async () => {
    const small = new MapFileReader({
      unzippedBytesAtMost: mebibyte,
      entriesAtMost: 1000,
      ringPairsAtMost,
    });
    const said = `Unzipped, the file is larger than ${String(mebibyte)} bytes: it isn’t read.`;
    // Sixty-four mebibytes of nothing, deflated to a few kibibytes.
    const bomb = zipped({ 'zones.shp': new Uint8Array(64 * mebibyte) });
    expect(bomb.byteLength).toBeLessThan(128 * 1024);
    expect(await problemOf(bomb, small)).toBe(said);
    const halves = zipped({
      'a.shp': new Uint8Array(0.6 * mebibyte),
      'b.shp': new Uint8Array(0.6 * mebibyte),
    });
    expect(await problemOf(halves, small)).toBe(said);
    // Parts stored as they are, never inflated, are counted as they are read.
    const stored = zipped(
      { 'a.shp': new Uint8Array(0.6 * mebibyte), 'b.shp': new Uint8Array(0.6 * mebibyte) },
      'STORED',
    );
    expect(await problemOf(stored, small)).toBe(said);
    expect(await problemOf(zipped({ 'a.shp': new Uint8Array(0.6 * mebibyte) }), small)).toBeNull();
  });

  it('a zip of more files than the bound isn’t read, counted before any is unzipped (OWASP ASVS 5.0 5.2.3)', async () => {
    const few = new MapFileReader({
      unzippedBytesAtMost: mebibyte,
      entriesAtMost: 5,
      ringPairsAtMost,
    });
    const zones = shapefile('zones', p1Zones);
    expect(Object.keys(zones)).toHaveLength(4);
    expect(
      await problemOf(zipped({ ...zones, 'zones.cpg': encoder.encode('UTF-8') }), few),
    ).toBeNull();
    expect(
      await problemOf(
        zipped({
          ...zones,
          'zones.cpg': encoder.encode('UTF-8'),
          'readme.txt': encoder.encode(''),
        }),
        few,
      ),
    ).toBe('The zip holds more than 5 files: it isn’t read.');
  });

  it('only the parts a layer needs are unzipped: anything else in the zip counts for nothing', async () => {
    const small = new MapFileReader({
      unzippedBytesAtMost: mebibyte,
      entriesAtMost: 1000,
      ringPairsAtMost,
    });
    const file = await read(
      zipped({ ...shapefile('zones', p1Zones), 'photo.tif': new Uint8Array(4 * mebibyte) }),
      small,
    );
    expect(file.layers.map(({ name }) => name)).toEqual(['zones.shp']);
  });

  it('a .dbf whose header says more rows than it holds isn’t read, and that is answered at once', async () => {
    const files = shapefile('zones', p1Zones);
    const lying = dbf(
      p1Zones.map(({ fields }) => fields),
      0xffffffff,
    );
    const started = Date.now();
    const file = await read(zipped({ ...files, 'zones.dbf': lying }));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(file.layers[0]?.problem).toBe('Its .dbf can’t be read.');
  });

  it('ADR-524, C140 a shape whose outer rings times its holes come to more than the bound isn’t read, counted from the .shp before anything pairs them; one at the bound is read; islands with no hole pair nothing', async () => {
    // A grid of squares, each an outer ring (clockwise) with a hole in it (counter-clockwise),
    // all one shape: a hundred outer rings times a hundred holes.
    const square = (n: number, inset: number): number[][] => {
      const west = -75.8 + (n % 50) * 0.004 + inset;
      const south = 38.9 + Math.floor(n / 50) * 0.004 + inset;
      return ring(west, south, west + 0.003 - 2 * inset, south + 0.003 - 2 * inset);
    };
    const holed = zipped(
      shapefile('zones', [
        {
          rings: Array.from({ length: 100 }, (_, n) => [
            square(n, 0),
            square(n, 0.001).reverse(),
          ]).flat(),
          fields: { ZONE_NAME: 'Zone 1' },
        },
      ]),
    );
    const bounded = (ringPairs: number) =>
      new MapFileReader({
        unzippedBytesAtMost: mebibyte,
        entriesAtMost: 1000,
        ringPairsAtMost: ringPairs,
      });
    expect((await read(holed, bounded(10_000))).layers.map(({ problem }) => problem)).toEqual([
      null,
    ]);
    expect((await read(holed, bounded(9_999))).layers.map(({ problem }) => problem)).toEqual([
      'A shape of its .shp has too many holes and outer rings to pair (10000 pairs; at most 9999): simplify the shape, or split it.',
    ]);
    // A coast of a thousand islands, no lake on any: nothing to pair, however many.
    const islands = zipped(
      shapefile('islands', [
        {
          rings: Array.from({ length: 1000 }, (_, n) => square(n, 0)),
          fields: { ZONE_NAME: 'Zone 1' },
        },
      ]),
    );
    expect((await read(islands, bounded(1))).layers.map(({ problem }) => problem)).toEqual([null]);
  });

  it('a broken zip, a zip of no map and a broken .shp are each said plainly', async () => {
    const good = zipped(shapefile('zones', p1Zones));
    // Cut short of its directory: the zip reader alone would look for it for ever (ADR-484).
    expect(await problemOf(good.subarray(0, 40))).toBe('The zip can’t be read.');
    expect(await problemOf(good.subarray(0, good.byteLength - 1))).toBe('The zip can’t be read.');
    expect(await problemOf(zipped({ 'readme.txt': encoder.encode('Nothing here.') }))).toBe(
      'The zip holds no shapefile, no GeoJSON file and no KML file.',
    );
    const cut = shapefile('zones', p1Zones);
    const file = await read(
      zipped({ ...cut, 'zones.shp': cut['zones.shp']?.subarray(0, 60) ?? new Uint8Array() }),
    );
    expect(file.layers[0]?.problem).toBe('Its .shp can’t be read.');
  });
});

describe('a GeoJSON file', () => {
  it('is one layer, named by nothing, with its features and fields', async () => {
    const file = await read(
      geojsonFile({
        type: 'FeatureCollection',
        features: p1Zones.map(({ rings, fields }) => ({
          type: 'Feature',
          properties: fields,
          geometry: { type: 'Polygon', coordinates: rings },
        })),
      }),
    );
    expect(file.type).toBe('application/geo+json');
    expect(file.layers.map(shown)).toEqual([
      { name: null, features: 3, fields: ['ZONE_NAME'], problem: null },
    ]);
    expect(zonesOf(file.layers[0]?.geojson)).toEqual(p1ZonesRead);
    const bare = await read(geojsonFile({ type: 'Polygon', coordinates: [p1Boundary] }));
    expect(bare.layers[0]?.features).toBe(1);
  });

  it('that isn’t JSON, and a file of neither kind, are said plainly', async () => {
    expect(await problemOf(encoder.encode('{"type": "FeatureCollection", '))).toBe(
      'The file isn’t GeoJSON: it can’t be read as JSON.',
    );
    expect(await problemOf(encoder.encode('%PDF-1.7\n'))).toBe(
      'The file is none of a zipped shapefile, GeoJSON and KML.',
    );
  });
});

describe('a KML file (ADR-527 (14))', () => {
  it('is one layer, named by nothing: each placemark a feature with its name and its ExtendedData, in longitude and latitude', async () => {
    const file = await read(kmlFile(p1ZonesKml));
    expect(file.type).toBe('application/vnd.google-earth.kml+xml');
    expect(file.layers.map(shown)).toEqual([
      { name: null, features: 3, fields: ['name', 'ZONE_NAME'], problem: null },
    ]);
    expect(zonesOf(file.layers[0]?.geojson)).toEqual(p1ZonesRead);
    const boundary = await read(kmlFile(placemark('P1', [p1Boundary]), ''));
    expect(boundary.layers.map(shown)).toEqual([
      { name: null, features: 1, fields: ['name'], problem: null },
    ]);
  });

  it('a KMZ is a zip whose .kml files are its layers, named by their paths', async () => {
    const file = await read(
      zipped({ 'doc.kml': kmlFile(p1ZonesKml), 'files/legend.png': new Uint8Array([1]) }),
    );
    expect(file.layers.map(shown)).toEqual([
      { name: 'doc.kml', features: 3, fields: ['name', 'ZONE_NAME'], problem: null },
    ]);
  });

  it('one holding a DOCTYPE is refused before it is parsed, so no entity is ever declared or expanded; one that isn’t XML, or whose root isn’t kml, is said plainly', async () => {
    const laughs = kmlFile(
      p1ZonesKml,
      '<?xml version="1.0"?>\n<!DOCTYPE kml [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]>\n',
    );
    expect(await problemOf(laughs)).toBe(
      'The file isn’t KML: it holds a DOCTYPE, which a KML file never needs, so it isn’t read.',
    );
    expect(await problemOf(encoder.encode('<?xml version="1.0"?><kml><Placemark>'))).toBe(
      'The file isn’t KML: it can’t be read as XML.',
    );
    expect(
      await problemOf(
        encoder.encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'),
      ),
    ).toBe('The file isn’t KML: its root is not a kml element.');
    const inZip = await read(
      zipped({ 'bad.kml': encoder.encode('<!DOCTYPE x><kml/>'), 'doc.kml': kmlFile(p1ZonesKml) }),
    );
    expect(inZip.layers.map(({ name, problem }) => [name, problem])).toEqual([
      [
        'bad.kml',
        'It isn’t KML: it holds a DOCTYPE, which a KML file never needs, so it isn’t read.',
      ],
      ['doc.kml', null],
    ]);
  });

  it('a placemark that is a point is no shape: the layer says so', async () => {
    const pin = kmlFile(
      '<Placemark><name>Marsh Road TDSR</name><Point><coordinates>-75.62,39.09,0</coordinates></Point></Placemark>',
    );
    const file = await read(pin);
    expect(file.layers[0]?.problem).toBe(
      "A shape is a Polygon or a MultiPolygon: Point can't be kept.",
    );
  });
});
