// A map's file read to GeoJSON (ARCHITECTURE §3 "Project boundary and zones"; BACKLOG 2.6.4,
// C100; ADR-311, 484, 485): what ArcGIS Pro and QGIS export, a zipped shapefile or a GeoJSON
// file, read into its layers, each as GeoJSON in longitude and latitude, WGS84, for the domain's
// `MapShapes` to read the boundary, the zones or a site's own shape from. Nothing here decides
// what a shape may be: that is the domain's, and its words are the ones a person is told.
//
// - **A zipped shapefile** (`shpjs`): every `.shp` in the zip is a layer, with the `.dbf`, `.prj`
//   and `.cpg` of the same name beside it; every `.geojson` or `.json` in it is a layer too.
//   **A `.prj` is read before its shapes** (`proj4`): a projected file (a State Plane, a UTM zone)
//   is converted to longitude and latitude, and one whose `.prj` can't be read is a layer that
//   can't be read, said so, never one taken as it stands. A shapefile with no `.prj` is taken as
//   longitude and latitude already: a projected one then has positions off the earth, which the
//   domain refuses.
// - **A zip is unzipped no further than the policy's bounds** (OWASP ASVS 5.0 5.2.3): it holds
//   at most `MAP_FILE_ENTRIES_AT_MOST` files, counted from its directory before any is unzipped,
//   and its parts come to at most `MAP_FILE_UNZIPPED_BYTES_AT_MOST`, never trusted from its own
//   header: only the parts a layer needs, each inflated with the bytes still allowed as its
//   limit, so a zip bomb stops at the bound, and a part stored as it is counted as it is read.
//   Nothing is written to a disk; a name in the zip names a layer, never a place.
// - **A shape is read only where its rings are few enough to pair** (ADR-524; C140): `shpjs`
//   sets each hole in the outer ring it lies in by trying every outer ring of the shape for every
//   hole, all at once in this process, which nothing can stop part way; measured, 32,000 outer
//   rings with as many holes (840 KB zipped) took 7.4 s, and a file at the size limit some twenty
//   minutes. So each shape's outer rings times its holes, read from the `.shp` in one pass, is at
//   most `MAP_FILE_RING_PAIRS_AT_MOST`, or its layer can't be read, said so. Many islands with no
//   holes, or many shapes of a ring each, pair nothing.
// - **A GeoJSON file** is one layer, named by nothing.
import { inflateRawSync } from 'node:zlib';

import { iter } from 'but-unzip';
import proj4 from 'proj4';
import { combine, parseDbf, parseShp } from 'shpjs';

import {
  MapShapes,
  mapFileSignatureBytes,
  mapFileTypeOf,
  type MapFileType,
} from '@open-adms/domain';

export interface MapLayer {
  // A layer's path in its zip, with its extension; none for a GeoJSON file's one layer.
  readonly name: string | null;
  // What it holds, as GeoJSON; none where it can't be read.
  readonly geojson: unknown;
  readonly features: number;
  // The fields its features carry, in the order they first come.
  readonly fields: readonly string[];
  // Why it can't be read, or can't be kept as one shape, in plain words; none where it can.
  readonly problem: string | null;
}

export interface MapFileRead {
  readonly type: MapFileType;
  readonly layers: readonly MapLayer[];
}

export type MapFileReading =
  | { readonly read: MapFileRead; readonly problem: null }
  | { readonly read: null; readonly problem: string };

// What a reading found wrong with the file as a whole.
class NotRead extends Error {}

const layerParts = new Set(['shp', 'dbf', 'prj', 'cpg', 'geojson', 'json']);

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

export interface MapFileLimits {
  readonly unzippedBytesAtMost: number;
  readonly entriesAtMost: number;
  readonly ringPairsAtMost: number;
}

export class MapFileReader {
  private readonly unzippedBytesAtMost: number;
  private readonly entriesAtMost: number;
  private readonly ringPairsAtMost: number;

  constructor(limits: MapFileLimits) {
    this.unzippedBytesAtMost = limits.unzippedBytesAtMost;
    this.entriesAtMost = limits.entriesAtMost;
    this.ringPairsAtMost = limits.ringPairsAtMost;
  }

  // The kind of map file a file is, by its first bytes; none where it is neither.
  static typeOf(bytes: Uint8Array): MapFileType | null {
    return mapFileTypeOf(bytes.subarray(0, mapFileSignatureBytes));
  }

  async read(bytes: Uint8Array): Promise<MapFileReading> {
    const type = MapFileReader.typeOf(bytes);
    if (type === null) {
      return { read: null, problem: 'The file is neither a zipped shapefile nor GeoJSON.' };
    }
    try {
      const layers =
        type === 'application/zip'
          ? await this.zipped(bytes)
          : [MapFileReader.geojsonLayer(null, bytes)];
      if (layers.length === 0) {
        throw new NotRead('The zip holds no shapefile and no GeoJSON file.');
      }
      return { read: { type, layers }, problem: null };
    } catch (error) {
      if (error instanceof NotRead) return { read: null, problem: error.message };
      throw error;
    }
  }

  // Each layer of a zip: the parts it needs unzipped, within the bound, then read.
  private async zipped(bytes: Uint8Array): Promise<MapLayer[]> {
    let left = this.unzippedBytesAtMost;
    const tooLarge = (): NotRead =>
      new NotRead(
        `Unzipped, the file is larger than ${String(this.unzippedBytesAtMost)} bytes: it isn’t read.`,
      );
    // Inflated only as far as the bytes still allowed, and never trusting the size the zip
    // states for a part.
    const inflate = (raw: Uint8Array): Uint8Array => {
      try {
        return inflateRawSync(raw, { maxOutputLength: Math.max(left, 1) });
      } catch (error) {
        if (error instanceof RangeError) throw tooLarge();
        throw new NotRead('A part of the zip can’t be unzipped.');
      }
    };
    if (!MapFileReader.endsAsAZip(bytes)) throw new NotRead('The zip can’t be read.');
    const parts = new Map<string, Uint8Array>();
    try {
      // Every file the zip's directory names, counted before any is unzipped.
      const entries = [...iter(bytes, inflate)];
      if (entries.length > this.entriesAtMost) {
        throw new NotRead(
          `The zip holds more than ${String(this.entriesAtMost)} files: it isn’t read.`,
        );
      }
      for (const entry of entries) {
        const name = entry.filename;
        const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
        const hidden = name.split('/').some((step) => step === '__MACOSX' || step.startsWith('._'));
        if (hidden || !layerParts.has(extension) || name.endsWith('/')) continue;
        const key = `${name.slice(0, name.length - extension.length)}${extension}`;
        if (parts.has(key)) continue;
        const read = await entry.read();
        left -= read.byteLength;
        if (left < 0) throw tooLarge();
        parts.set(key, read);
      }
    } catch (error) {
      if (error instanceof NotRead) throw error;
      throw new NotRead('The zip can’t be read.');
    }
    const layers: MapLayer[] = [];
    for (const [key, part] of parts) {
      if (key.endsWith('.shp')) {
        const base = key.slice(0, -'shp'.length);
        layers.push(
          this.shapefileLayer(key, part, {
            dbf: parts.get(`${base}dbf`),
            prj: parts.get(`${base}prj`),
            cpg: parts.get(`${base}cpg`),
          }),
        );
      } else if (key.endsWith('.geojson') || key.endsWith('.json')) {
        layers.push(MapFileReader.geojsonLayer(key, part));
      }
    }
    return layers;
  }

  private shapefileLayer(
    name: string,
    shp: Uint8Array,
    beside: {
      readonly dbf: Uint8Array | undefined;
      readonly prj: Uint8Array | undefined;
      readonly cpg: Uint8Array | undefined;
    },
  ): MapLayer {
    const prj = beside.prj === undefined ? undefined : text(beside.prj).trim();
    if (prj !== undefined) {
      try {
        proj4(prj);
      } catch {
        return MapFileReader.unread(
          name,
          'Its .prj names a coordinate system that can’t be read, so its positions can’t be put in longitude and latitude.',
        );
      }
    }
    const pairs = MapFileReader.mostRingPairs(shp);
    if (pairs > this.ringPairsAtMost) {
      return MapFileReader.unread(
        name,
        `A shape of its .shp has too many holes and outer rings to pair (${String(pairs)} pairs; at most ${String(this.ringPairsAtMost)}): simplify the shape, or split it.`,
      );
    }
    let shapes: unknown[];
    try {
      shapes = parseShp(shp, prj);
    } catch {
      return MapFileReader.unread(name, 'Its .shp can’t be read.');
    }
    let rows: Record<string, unknown>[] | undefined;
    try {
      if (beside.dbf !== undefined && !MapFileReader.holdsItsRows(beside.dbf)) throw new NotRead();
      rows =
        beside.dbf === undefined
          ? undefined
          : parseDbf(beside.dbf, beside.cpg === undefined ? undefined : text(beside.cpg).trim());
    } catch {
      return MapFileReader.unread(name, 'Its .dbf can’t be read.');
    }
    return MapFileReader.layer(name, combine([shapes, rows]));
  }

  // The most outer rings times holes of any one polygon of a `.shp` (ESRI's shapefile technical
  // description, 1998): read from each record's parts and points as they stand, an outer ring
  // turning clockwise and a hole counter-clockwise, as `shpjs` tells them. A record that goes
  // past the file's end, or isn't a polygon, ends the count or is passed over: what can't be read
  // is `parseShp`'s to refuse.
  private static mostRingPairs(shp: Uint8Array): number {
    const view = new DataView(shp.buffer, shp.byteOffset, shp.byteLength);
    let most = 0;
    for (let at = 100; at + 8 <= shp.byteLength;) {
      const content = at + 8;
      const end = content + view.getInt32(at + 4, false) * 2;
      if (end > shp.byteLength || end < content) break;
      const type = end >= content + 4 ? view.getInt32(content, true) : 0;
      if ((type === 5 || type === 15 || type === 25) && end >= content + 44) {
        const parts = view.getInt32(content + 36, true);
        const points = view.getInt32(content + 40, true);
        const firstPoint = content + 44 + parts * 4;
        if (parts >= 0 && points >= 0 && firstPoint + points * 16 <= end) {
          let outer = 0;
          let holes = 0;
          for (let part = 0; part < parts; part += 1) {
            const from = view.getInt32(content + 44 + part * 4, true);
            const to = part + 1 < parts ? view.getInt32(content + 48 + part * 4, true) : points;
            let twice = 0;
            for (let point = Math.max(from, 0); point + 1 < Math.min(to, points); point += 1) {
              const here = firstPoint + point * 16;
              twice +=
                view.getFloat64(here, true) * view.getFloat64(here + 24, true) -
                view.getFloat64(here + 16, true) * view.getFloat64(here + 8, true);
            }
            if (twice < 0) outer += 1;
            else if (twice > 0) holes += 1;
          }
          most = Math.max(most, outer * holes);
        }
      }
      at = end;
    }
    return most;
  }

  // Whether a zip ends with its directory's last record where a zip's must be: in its last 22
  // bytes and the longest comment after them. `iter` looks for it from the end backwards and,
  // in a file shorter than that stretch that has none, goes round again from the end for ever
  // (but-unzip 0.1.10, ADR-484), so a file without one is never handed to it.
  private static endsAsAZip(bytes: Uint8Array): boolean {
    const record = [0x50, 0x4b, 0x05, 0x06];
    const last = bytes.byteLength - 22;
    for (let at = last; at > 0 && at >= last - 0xffff; at -= 1) {
      if (record.every((byte, step) => bytes[at + step] === byte)) return true;
    }
    return false;
  }

  // Whether a `.dbf` is as long as its header says its rows are. `parseDbf` reads as many rows as
  // the header says, whatever the file's length, so a header that claims more is never handed
  // to it: it would make rows of nothing until the process ran out of memory.
  private static holdsItsRows(dbf: Uint8Array): boolean {
    if (dbf.byteLength < 32) return false;
    const header = new DataView(dbf.buffer, dbf.byteOffset, dbf.byteLength);
    const rows = header.getUint32(4, true);
    const headerBytes = header.getUint16(8, true);
    const rowBytes = header.getUint16(10, true);
    return rowBytes > 0 && headerBytes >= 33 && headerBytes + rows * rowBytes <= dbf.byteLength;
  }

  private static geojsonLayer(name: string | null, bytes: Uint8Array): MapLayer {
    let geojson: unknown;
    try {
      geojson = JSON.parse(text(bytes));
    } catch {
      if (name === null) throw new NotRead('The file isn’t GeoJSON: it can’t be read as JSON.');
      return MapFileReader.unread(name, 'It isn’t GeoJSON: it can’t be read as JSON.');
    }
    return MapFileReader.layer(name, geojson);
  }

  private static layer(name: string | null, geojson: unknown): MapLayer {
    const features = MapFileReader.featuresOf(geojson);
    const fields = new Set<string>();
    for (const feature of features) {
      const properties = feature['properties'];
      if (typeof properties === 'object' && properties !== null && !Array.isArray(properties)) {
        for (const field of Object.keys(properties)) fields.add(field);
      }
    }
    // A bare geometry is one feature, as a Feature is.
    const bare = MapFileReader.isRecord(geojson) && geojson['type'] !== 'FeatureCollection';
    return {
      name,
      geojson,
      features: bare ? 1 : features.length,
      fields: [...fields],
      problem: new MapShapes(geojson).shape().problem,
    };
  }

  private static unread(name: string, problem: string): MapLayer {
    return { name, geojson: null, features: 0, fields: [], problem };
  }

  private static featuresOf(geojson: unknown): Record<string, unknown>[] {
    if (!MapFileReader.isRecord(geojson)) return [];
    if (geojson['type'] === 'Feature') return [geojson];
    const features = geojson['features'];
    if (geojson['type'] !== 'FeatureCollection' || !Array.isArray(features)) return [];
    return (features as unknown[]).filter((feature) => MapFileReader.isRecord(feature));
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
