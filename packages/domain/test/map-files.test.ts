// What a map's file may be (ARCHITECTURE §3, §6 "Uploads"; ADR-485, 527 (14)): a zipped
// shapefile (a KMZ among them), a GeoJSON file or a KML file, told by its own first bytes.
import { describe, expect, it } from 'vitest';

import { mapFileSignatureBytes, mapFileTypeOf, mapFileTypes } from '../src/map-files.ts';

const bytes = (...values: (number | string)[]): Uint8Array =>
  Uint8Array.from(
    values.flatMap((value) =>
      typeof value === 'string'
        ? Array.from({ length: value.length }, (_, at) => value.charCodeAt(at))
        : [value],
    ),
  );

describe('a map’s file', () => {
  it('is a zipped shapefile, a GeoJSON file or a KML file, told by its first bytes', () => {
    expect(mapFileTypes).toEqual([
      'application/zip',
      'application/geo+json',
      'application/vnd.google-earth.kml+xml',
    ]);
    expect(mapFileSignatureBytes).toBe(64);
    for (const [kind, start] of [
      ['application/zip', bytes('PK', 3, 4, 20, 0, 0, 0, 8, 0)],
      ['application/geo+json', bytes('{"type":"FeatureCollection"')],
      ['application/geo+json', bytes(' \r\n\t{"type":"Polygon"')],
      ['application/geo+json', bytes(0xef, 0xbb, 0xbf, '{"type":"Feature"')],
      ['application/geo+json', bytes(0xef, 0xbb, 0xbf, '\n  {')],
      ['application/vnd.google-earth.kml+xml', bytes('<?xml version="1.0" encoding="UTF-8"?>')],
      [
        'application/vnd.google-earth.kml+xml',
        bytes('<kml xmlns="http://www.opengis.net/kml/2.2">'),
      ],
      [
        'application/vnd.google-earth.kml+xml',
        bytes(0xef, 0xbb, 0xbf, '\r\n<?xml version="1.0"?>'),
      ],
    ] as const) {
      expect(mapFileTypeOf(start), kind).toBe(kind);
    }
  });

  it('is no other file, whatever it says it is', () => {
    for (const [what, start] of [
      ['nothing', bytes()],
      ['white space alone', bytes('   \n')],
      ['a byte-order mark alone', bytes(0xef, 0xbb, 0xbf)],
      ['a JSON list', bytes('[{"type":"Feature"}]')],
      ['a web page', bytes('<!doctype html>')],
      ['an SVG with no declaration', bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
      ['a script', bytes('#!/bin/sh\nrm -rf')],
      ['a PDF', bytes('%PDF-1.7\n')],
      ['an empty zip', bytes('PK', 5, 6, 0, 0, 0, 0)],
      ['a shapefile not zipped', bytes(0, 0, 0x27, 0x0a, 0, 0, 0, 0)],
      ['a JPEG', bytes(0xff, 0xd8, 0xff, 0xe0)],
      ['a brace after other text', bytes('x{')],
    ] as const) {
      expect(mapFileTypeOf(start), what).toBeNull();
    }
  });
});
