// A map's file sent whole by the back office, and a map or a site's shape loaded from it
// (spec/parts/01-setup.md steps 3 and 7; ARCHITECTURE §3 "Project boundary and zones", §6
// "Uploads", §11; acceptance file 01, AC-01-56, AC-01-59; spec/THREAT-MODEL.md T-25; BACKLOG
// 2.6.4, C86, C100; ADR-484, 485; KD-76). OWASP ASVS 5.0 V5. The real process, in this test's
// own memory, on the installation's database as `adms_api`, keeping files in the local stack's
// own object store under the API's identity: it needs `pnpm ready`. Each test's database work
// is undone; its files, which the API's identity can't delete, are taken away by the stack's
// administrator. Who may call each endpoint is setup-endpoints.test.ts's.
import { createHash } from 'node:crypto';

import {
  addSiteShapeFileEndpoint,
  createSiteEndpoint,
  filePartMediaType,
  loadMapFileEndpoint,
  sendMapFileEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MediaStore } from '../src/media/media-store.ts';
import { installationPolicy } from '../src/policy.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { geojsonFile, p1Boundary, p1Zones, ring, shapefile, zipped } from './support/map-files.ts';
import {
  asTheStacksAdministrator,
  installationMedia,
  tidied,
  versionsUnder,
} from './support/media.ts';
import { danasEmail, long, worldOn, type Served } from './support/served.ts';
import { ask, at, notSaved, p1, plainly, saved, told, type Browser } from './support/setup.ts';

let db: Database;
let store: MediaStore;
let administrator: S3Client;
// Every project a test made: its files are taken away after the run.
const projects = new Set<string>();

beforeAll(() => {
  db = openInstallation(installationSettings());
  store = new MediaStore(installationMedia());
  administrator = asTheStacksAdministrator(installationMedia());
});
afterAll(async () => {
  for (const projectId of projects) {
    await tidied(administrator, installationMedia(), `projects/${projectId}/`);
  }
  store.close();
  administrator.destroy();
  await db.$disconnect();
});

const world = worldOn(() => db);
// The process keeps files in the stack's own store.
const theStore = () => ({ media: store });

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const mebibyte = 1_048_576;

// P1's map as Bayline County's GIS office exports it: its boundary, a county line of 100,000
// positions, and its three zones, two shapefiles in one zip, stored as they are: larger than a
// request's body may be (1 MiB).
const countyLine = (() => {
  const count = 100_000;
  const line = Array.from({ length: count }, (_, at) => {
    const turn = (-2 * Math.PI * at) / count;
    return [-75.6 + 0.2 * Math.cos(turn), 39.1 + 0.2 * Math.sin(turn)];
  });
  return [...line, line[0] ?? []];
})();
const p1MapFile = zipped(
  {
    ...shapefile('bayline-row/boundary', [{ rings: [countyLine], fields: { NAME: 'P1' } }]),
    ...shapefile('bayline-row/zones', p1Zones),
  },
  'STORED',
);

// Dana signed in, P1 entered, and its files tidied after the run.
async function p1Entered(api: Served, tx: Tx) {
  const dana = await api.signedIn(danasEmail, long);
  const { project } = await p1(api, dana, tx);
  projects.add(project.id);
  return { dana, project };
}

const sent = (api: Served, dana: Browser, projectId: string, bytes: Uint8Array) =>
  api.ask('POST', at(sendMapFileEndpoint, { projectId }), {
    ...dana,
    bytes,
    contentType: filePartMediaType,
  });

describe('a map’s file, sent whole', () => {
  it('ADR-485 a zipped shapefile larger than a request’s body is read and kept once, where the server places it; the answer says each layer it holds, never where it is kept; the same file again is the same file', async () => {
    await world(
      async (api, tx) => {
        const { dana, project } = await p1Entered(api, tx);
        expect(p1MapFile.byteLength).toBeGreaterThan(mebibyte);
        const id = sha256Of(p1MapFile);
        const answer = await sent(api, dana, project.id, p1MapFile);
        expect(saved(sendMapFileEndpoint, answer)).toEqual({
          record: {
            id,
            type: 'application/zip',
            bytes: p1MapFile.byteLength,
            layers: [
              { name: 'bayline-row/boundary.shp', features: 1, fields: ['NAME'], problem: null },
              { name: 'bayline-row/zones.shp', features: 3, fields: ['ZONE_NAME'], problem: null },
            ],
          },
          warnings: [],
        });
        expect(answer.text).not.toMatch(/projects\/|maps\//);
        const place = `projects/${project.id}/maps/${id}`;
        const kept = await store.read(place, 64 * mebibyte);
        expect(kept?.contentType).toBe('application/zip');
        expect(kept === null ? null : sha256Of(kept.bytes)).toBe(id);
        expect(
          saved(sendMapFileEndpoint, await sent(api, dana, project.id, p1MapFile)).record.id,
        ).toBe(id);
        expect((await versionsUnder(administrator, installationMedia(), place)).length).toBe(1);
        // The log says who sent how much, never a place or a fingerprint.
        const logged = api.lines.filter((line) => line.includes('A map’s file was sent.'));
        expect(logged).toHaveLength(2);
        expect(api.lines.join('\n')).not.toMatch(/maps\/[0-9a-f]{64}/);
      },
      undefined,
      undefined,
      theStore(),
    );
  });

  it('ADR-485 a file past the route’s own limit is refused before it is read; one that is no map’s file, by its first bytes, too; one that can’t be read is told why and kept nowhere', async () => {
    await world(
      async (api, tx) => {
        const { dana, project } = await p1Entered(api, tx);
        const past = new Uint8Array(mebibyte + 1);
        past.set(p1MapFile.subarray(0, 4));
        expect(told(await sent(api, dana, project.id, past))).toEqual([413, 'TOO_LARGE']);
        const pdf = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ');
        const notAMap = await sent(api, dana, project.id, pdf);
        expect(told(notAMap)).toEqual([415, 'UNSUPPORTED_MEDIA_TYPE']);
        expect(plainly(notAMap)).toBe(
          'Not taken: a map’s file is a zipped shapefile or a GeoJSON file.',
        );
        const cut = p1MapFile.subarray(0, 5000);
        expect(notSaved(await sent(api, dana, project.id, cut))).toEqual([
          'MAP_FILE_NOT_READ',
          'Not kept: The zip can’t be read.',
        ]);
        const points = geojsonFile({ type: 'Point', coordinates: [-75.6, 39.1] });
        expect(notSaved(await sent(api, dana, project.id, points))).toEqual([
          'MAP_FILE_NOT_READ',
          "Not kept: no layer of the file is a shape. The file: A shape is a Polygon or a MultiPolygon: Point can't be kept.",
        ]);
        expect(
          await versionsUnder(administrator, installationMedia(), `projects/${project.id}/`),
        ).toEqual([]);
      },
      undefined,
      installationPolicy({ MAP_FILE_BYTES_AT_MOST: String(mebibyte) }),
      theStore(),
    );
  });
});

describe('a map, and a site’s shape, loaded from a map’s file', () => {
  it('AC-01-59 Dana loads P1’s map from its file: the boundary’s layer and the zones’ by their field are version 1, its file kept with it; a layer it doesn’t hold, or left unnamed among several, is told plainly', async () => {
    await world(
      async (api, tx, who) => {
        const { dana, project } = await p1Entered(api, tx);
        const id = sha256Of(p1MapFile);
        saved(sendMapFileEndpoint, await sent(api, dana, project.id, p1MapFile));
        const load = (payload: object) =>
          ask(api, dana, loadMapFileEndpoint, {
            ids: { projectId: project.id, mapFileId: id },
            payload,
          });
        const map = {
          sourceName: 'bayline-row-zones-v1.zip',
          boundaryLayer: 'bayline-row/boundary.shp',
          zones: { layer: 'bayline-row/zones.shp', nameField: 'ZONE_NAME' },
        };
        expect(notSaved(await load({ ...map, boundaryLayer: null }))).toEqual([
          'MAP_NOT_READ',
          'Not loaded: the file holds 2 layers: name the one to load.',
        ]);
        expect(notSaved(await load({ ...map, boundaryLayer: 'boundary.shp' }))).toEqual([
          'MAP_NOT_READ',
          'Not loaded: the file holds no layer boundary.shp.',
        ]);
        expect(
          notSaved(await load({ ...map, zones: { ...map.zones, nameField: 'NAME' } })),
        ).toEqual(['MAP_NOT_READ', 'Not loaded: A zone has no name in the field NAME.']);
        const loaded = saved(loadMapFileEndpoint, await load(map));
        expect(loaded.record).toMatchObject({
          projectId: project.id,
          version: 1,
          source: 'UPLOAD',
          sourceName: 'bayline-row-zones-v1.zip',
          zoneNameField: 'ZONE_NAME',
          fileKept: true,
        });
        const version = await tx.mapVersion.findUniqueOrThrow({
          where: { id: loaded.record.id },
          include: { zones: { orderBy: { name: 'asc' } } },
        });
        expect([
          version.uploadedFileKey,
          version.loadedById === who.dana,
          version.westLongitude.toFixed(8),
          version.eastLongitude.toFixed(8),
          version.zones.map((zone) => zone.name),
        ]).toEqual([
          `projects/${project.id}/maps/${id}`,
          true,
          '-75.80000000',
          '-75.40000000',
          ['Zone 1', 'Zone 2', 'Zone 3'],
        ]);
        // A map's file of no other project is this project's.
        const other = await p1(api, dana, tx, { name: 'Bayline County PPDR' });
        projects.add(other.project.id);
        const elsewhere = await ask(api, dana, loadMapFileEndpoint, {
          ids: { projectId: other.project.id, mapFileId: id },
          payload: map,
        });
        expect(told(elsewhere)).toEqual([404, 'NOT_FOUND']);
      },
      undefined,
      undefined,
      theStore(),
    );
  });

  it('AC-01-56 Dana saves Marsh Road its own shape from a GeoJSON file of it: the file’s only layer, the site’s next version, from an upload', async () => {
    await world(
      async (api, tx) => {
        const { dana, project } = await p1Entered(api, tx);
        const tdsr = await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } });
        const site = saved(
          createSiteEndpoint,
          await ask(api, dana, createSiteEndpoint, {
            ids: { projectId: project.id },
            payload: {
              name: 'Marsh Road TDSR',
              siteTypeId: tdsr.id,
              takesLoads: true,
              haulOutsLeaveHere: true,
              chargesTippingFee: false,
              ineligibleSite: false,
              permitNumber: null,
              latitude: '39.09000000',
              longitude: '-75.62000000',
              activationDate: '2026-10-12',
            },
          }),
        ).record;
        const shape = geojsonFile({
          type: 'Feature',
          properties: { SITE: 'Marsh Road TDSR' },
          geometry: { type: 'Polygon', coordinates: [ring(-75.625, 39.085, -75.615, 39.095)] },
        });
        const file = saved(sendMapFileEndpoint, await sent(api, dana, project.id, shape)).record;
        expect(file.layers).toEqual([{ name: null, features: 1, fields: ['SITE'], problem: null }]);
        const answer = await ask(api, dana, addSiteShapeFileEndpoint, {
          ids: { siteId: site.id, mapFileId: file.id },
          payload: { layer: null },
        });
        expect(saved(addSiteShapeFileEndpoint, answer).record).toMatchObject({
          siteId: site.id,
          version: 1,
          source: 'UPLOAD',
        });
        const version = await tx.siteAreaVersion.findFirstOrThrow({ where: { siteId: site.id } });
        expect([version.westLongitude.toFixed(3), version.northLatitude.toFixed(3)]).toEqual([
          '-75.625',
          '39.095',
        ]);
        // P1's map file holds two layers: one is named.
        const map = saved(sendMapFileEndpoint, await sent(api, dana, project.id, p1MapFile)).record;
        const unnamed = await ask(api, dana, addSiteShapeFileEndpoint, {
          ids: { siteId: site.id, mapFileId: map.id },
          payload: { layer: null },
        });
        expect(notSaved(unnamed)).toEqual([
          'SITE_SHAPE_NOT_READ',
          'Not saved: the file holds 2 layers: name the one to load.',
        ]);
      },
      undefined,
      undefined,
      theStore(),
    );
  });
});

describe('a map’s file that isn’t the one it was (T-25)', () => {
  it('ADR-485 another file found at its place, before it was kept or after, is the server’s failure: never taken as this one, never loaded', async () => {
    await world(
      async (api, tx) => {
        const { dana, project } = await p1Entered(api, tx);
        const media = installationMedia();
        const swap = async (mapFileId: string, bytes: Uint8Array) =>
          administrator.send(
            new PutObjectCommand({
              Bucket: media.bucket,
              Key: `projects/${project.id}/maps/${mapFileId}`,
              Body: bytes,
              ContentType: 'application/zip',
            }),
          );
        const zones = zipped(shapefile('zones', p1Zones));
        const boundary = zipped(shapefile('boundary', [{ rings: [p1Boundary], fields: {} }]));
        // Somebody with the store's keys puts another file where this one is to go.
        await swap(sha256Of(zones), boundary);
        expect(told(await sent(api, dana, project.id, zones))).toEqual([500, 'INTERNAL_ERROR']);
        // And over one kept.
        const kept = saved(sendMapFileEndpoint, await sent(api, dana, project.id, boundary)).record;
        await swap(kept.id, zones);
        const load = await ask(api, dana, loadMapFileEndpoint, {
          ids: { projectId: project.id, mapFileId: kept.id },
          payload: { sourceName: null, boundaryLayer: null, zones: null },
        });
        expect(told(load)).toEqual([500, 'INTERNAL_ERROR']);
        expect(await tx.mapVersion.count({ where: { projectId: project.id } })).toBe(0);
      },
      undefined,
      undefined,
      theStore(),
    );
  });
});
