// An Esri feature layer fetched by the API, and a map or a site's shape loaded from it
// (ARCHITECTURE §3 "Project boundary and zones", §4; spec/acceptance/10-api-and-sync.md
// AC-10-77…80; BACKLOG 2.8.5; ADR-523, 527 (15)). OWASP API7:2023 and ASVS 5.0 1.3.6 (server-side
// request forgery), API10. First the fetcher alone, against a test's own HTTPS server with the
// local stack's certificate for this machine (support/stack-https.ts); then the endpoints, through
// the real process with a layer source of the test's own, keeping copies in the stack's own
// object store. It needs `pnpm ready`. Each test's database work is undone; its files are taken
// away by the stack's administrator.
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  addSiteShapeFromEsriEndpoint,
  createSiteEndpoint,
  loadEsriMapEndpoint,
  loadMapEndpoint,
  refreshEsriMapEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import type { S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MediaStore } from '../src/media/media-store.ts';
import { EsriLayers, isNeighbour, type EsriLayerSource } from '../src/setup/esri-layers.ts';
import { MapFileReader } from '../src/setup/map-file-reader.ts';
import { MapFiles } from '../src/setup/map-files.ts';
import { ProjectSetup } from '../src/setup/project-setup.ts';
import { SiteSetup } from '../src/setup/site-setup.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { shippedPolicy } from './support/process.ts';
import { p1Boundary, p1Zones } from './support/map-files.ts';
import {
  asTheStacksAdministrator,
  installationMedia,
  tidied,
  versionsUnder,
} from './support/media.ts';
import { danasEmail, long, luissEmail, longer, worldOn, type Served } from './support/served.ts';
import { ask, notSaved, p1, saved, told } from './support/setup.ts';
import { StackHttpsServer, stackRootCert } from './support/stack-https.ts';

const layerPath = '/server/rest/services/BaylineROW/FeatureServer';

// A layer's features as ArcGIS answers `f=geojson`: a FeatureCollection, `exceededTransferLimit`
// in its properties where more are left.
const feature = (rings: readonly (readonly number[][])[], properties: object) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Polygon', coordinates: rings },
});
const zonesFeatures = p1Zones.map(({ rings, fields }) => feature(rings, fields));
const page = (features: readonly unknown[], more: boolean) =>
  JSON.stringify({
    type: 'FeatureCollection',
    features,
    ...(more ? { properties: { exceededTransferLimit: true } } : {}),
  });

// What the test's server heard: each request's path and its form, read whole.
interface Asked {
  readonly path: string;
  readonly form: URLSearchParams;
}

async function layerServer(
  answer: (asked: Asked, response: ServerResponse) => void,
): Promise<{ server: StackHttpsServer; asked: Asked[] }> {
  const asked: Asked[] = [];
  const server = await StackHttpsServer.on((request: IncomingMessage, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const one = {
        path: request.url ?? '',
        form: new URLSearchParams(Buffer.concat(chunks).toString('utf8')),
      };
      asked.push(one);
      answer(one, response);
    });
  });
  return { server, asked };
}

const geojson = (response: ServerResponse, text: string) => {
  response.writeHead(200, { 'content-type': 'application/geo+json' });
  response.end(text);
};

const fetcher = (port: number, more: Partial<ConstructorParameters<typeof EsriLayers>[0]> = {}) =>
  new EsriLayers({
    answerMs: 5000,
    bytesAtMost: 1_048_576,
    // The test's server is this machine: the firm states its host, as it would its own ArcGIS
    // Enterprise.
    privateHosts: ['localhost'],
    caFile: stackRootCert,
    port,
    ...more,
  });

describe('an Esri layer, fetched', () => {
  it('AC-10-77 every page of the layer is asked for as GeoJSON in WGS84 by the layer’s own query, its token in the form and never in an address, and put together as one FeatureCollection', async () => {
    const { server, asked } = await layerServer((one, response) => {
      const offset = Number(one.form.get('resultOffset'));
      geojson(
        response,
        offset === 0 ? page(zonesFeatures.slice(0, 2), true) : page(zonesFeatures.slice(2), false),
      );
    });
    try {
      const fetched = await fetcher(server.port).fetch(
        `https://localhost${layerPath}/1`,
        'a-token-of-the-firms',
      );
      expect(fetched.problem).toBeNull();
      expect(JSON.parse(new TextDecoder().decode(fetched.fetched ?? new Uint8Array()))).toEqual({
        type: 'FeatureCollection',
        features: zonesFeatures,
      });
      expect(asked.map(({ path }) => path)).toEqual([
        `${layerPath}/1/query`,
        `${layerPath}/1/query`,
      ]);
      expect(asked.map(({ form }) => Object.fromEntries(form))).toEqual(
        [0, 2].map((offset) => ({
          where: '1=1',
          outFields: '*',
          outSR: '4326',
          returnGeometry: 'true',
          f: 'geojson',
          resultOffset: String(offset),
          token: 'a-token-of-the-firms',
        })),
      );
    } finally {
      await server.close();
    }
  });

  it('AC-10-78 a redirect is never followed; an error status, Esri’s own error and an answer that isn’t GeoJSON are said by their code, never the server’s words; a layer past the bound, or slower than the time, is not taken', async () => {
    let answer: (response: ServerResponse) => void = () => undefined;
    const { server } = await layerServer((_one, response) => {
      answer(response);
    });
    try {
      const fetch = (more: Partial<ConstructorParameters<typeof EsriLayers>[0]> = {}) =>
        fetcher(server.port, more).fetch(`https://localhost${layerPath}/0`, undefined);
      const cases: [(response: ServerResponse) => void, string][] = [
        [
          (response) => {
            response.writeHead(302, { location: 'https://localhost/elsewhere' });
            response.end();
          },
          'the layer’s server answered with a redirect, which the API never follows: give the layer’s own address.',
        ],
        [
          (response) => {
            response.writeHead(500);
            response.end('stack trace of the layer’s own');
          },
          'the layer’s server answered 500.',
        ],
        [
          (response) => {
            geojson(response, JSON.stringify({ error: { code: 499, message: 'Token Required' } }));
          },
          'the layer is secured, and its token is missing or no longer good (Esri’s 499).',
        ],
        [
          (response) => {
            geojson(response, JSON.stringify({ error: { code: 400, message: '<script>' } }));
          },
          'the layer’s server answered with an error (400).',
        ],
        [
          (response) => {
            geojson(response, '<html>Sign in</html>');
          },
          'the layer’s server didn’t answer in GeoJSON.',
        ],
        [
          (response) => {
            geojson(response, page(zonesFeatures, false) + ' '.repeat(2048));
          },
          'the layer is larger than 1024 bytes: it isn’t kept.',
        ],
      ];
      for (const [answered, problem] of cases) {
        answer = answered;
        const bytesAtMost = problem.includes('1024') ? 1024 : 1_048_576;
        expect((await fetch({ bytesAtMost })).problem, problem).toBe(problem);
      }
      answer = () => undefined;
      expect((await fetch({ answerMs: 200 })).problem).toBe(
        'the layer’s server didn’t answer in time.',
      );
    } finally {
      await server.close();
    }
  });

  it('AC-10-79 only a layer’s own HTTPS address is asked: no user, query, fragment or other path; never localhost, a .localhost name or a private, loopback, link-local or reserved address, nor a name that resolves to one where the connection is made, unless the firm states its host', async () => {
    const asked: string[] = [];
    const esri = new EsriLayers({
      answerMs: 2000,
      bytesAtMost: 1_048_576,
      privateHosts: [],
      caFile: null,
      // Every name resolves where the test says: one public and one private address.
      resolver: (hostname) => {
        asked.push(hostname);
        return Promise.resolve([
          { address: '203.0.114.10', family: 4 },
          { address: '10.20.30.40', family: 4 },
        ]);
      },
    });
    const neighbour =
      'the layer’s server is at a private address or one of the installation’s own, which the API never asks unless the firm lists it.';
    const notALayer =
      'the address isn’t a feature layer’s: it ends …/FeatureServer/<n> or …/MapServer/<n>.';
    const byItsOwn =
      'a layer is linked by its own HTTPS address, with no name, password, query or fragment in it.';
    for (const [address, problem] of [
      [`http://gis.baylinecounty.example${layerPath}/0`, byItsOwn],
      [`https://gis.baylinecounty.example${layerPath}/0?token=x`, byItsOwn],
      [`https://gis.baylinecounty.example${layerPath}/0#map`, byItsOwn],
      [`https://dana:secret@gis.baylinecounty.example${layerPath}/0`, byItsOwn],
      [`https://dana@gis.baylinecounty.example${layerPath}/0`, byItsOwn],
      ['https://gis.baylinecounty.example/server/rest/admin/services', notALayer],
      [
        'https://gis.baylinecounty.example/server/rest/services/BaylineROW/FeatureServer',
        notALayer,
      ],
      [`https://localhost${layerPath}/0`, neighbour],
      [`https://api.adms.localhost${layerPath}/0`, neighbour],
      [`https://127.0.0.1${layerPath}/0`, neighbour],
      [`https://10.0.0.8${layerPath}/0`, neighbour],
      [`https://169.254.169.254${layerPath}/0`, neighbour],
      [`https://[::1]${layerPath}/0`, neighbour],
      [`https://[fd00::8]${layerPath}/0`, neighbour],
      [`https://[::ffff:127.0.0.1]${layerPath}/0`, neighbour],
      // Resolved where the connection is made: one of its addresses is private.
      [`https://gis.baylinecounty.example${layerPath}/0`, neighbour],
    ] as const) {
      expect((await esri.fetch(address, undefined)).problem, address).toBe(problem);
    }
    expect(asked).toEqual(['gis.baylinecounty.example']);
    for (const address of ['192.168.1.20', '100.64.0.1', '198.18.0.1', '224.0.0.1', 'fe80::1']) {
      expect(isNeighbour(address), address).toBe(true);
    }
    for (const address of ['203.0.114.10', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(isNeighbour(address), address).toBe(false);
    }
  });
});

let db: Database;
let store: MediaStore;
let administrator: S3Client;
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

// The firm's ArcGIS: each layer by its address, as GeoJSON; and every fetch it was asked for.
class FirmsArcGis implements EsriLayerSource {
  readonly asked: { address: string; token: string | undefined }[] = [];
  readonly layers = new Map<string, unknown>();

  fetch(address: string, token: string | undefined) {
    this.asked.push({ address, token });
    const layer = this.layers.get(address);
    if (layer === undefined) {
      return Promise.resolve({ fetched: null, problem: 'the layer’s server answered 404.' });
    }
    return Promise.resolve({
      fetched: new TextEncoder().encode(JSON.stringify(layer)),
      problem: null,
    });
  }
}

const gis = 'https://gis.baylinecounty.example/server/rest/services/BaylineROW/FeatureServer';
const collection = (features: readonly unknown[]) => ({ type: 'FeatureCollection', features });

async function p1Entered(api: Served, tx: Tx) {
  const dana = await api.signedIn(danasEmail, long);
  const { project } = await p1(api, dana, tx);
  projects.add(project.id);
  return { dana, project };
}

describe('a map, and a site’s shape, from an Esri layer', () => {
  it('AC-10-80 Dana links P1’s boundary layer and its zones layer: version 1 names both layers, keeps both copies, and queues P1; "Refresh from Esri" fetches them again as version 2; the token is used for each fetch and is nowhere in an answer or the log', async () => {
    const arcgis = new FirmsArcGis();
    arcgis.layers.set(`${gis}/0`, collection([feature([p1Boundary], { NAME: 'P1' })]));
    arcgis.layers.set(`${gis}/1`, collection(zonesFeatures));
    await world(
      async (api, tx, who) => {
        const { dana, project } = await p1Entered(api, tx);
        const answer = await ask(api, dana, loadEsriMapEndpoint, {
          ids: { projectId: project.id },
          payload: {
            boundaryLayer: `${gis}/0`,
            zones: { layer: `${gis}/1`, nameField: 'ZONE_NAME' },
            token: 'a-token-of-the-firms',
          },
        });
        const loaded = saved(loadEsriMapEndpoint, answer);
        expect(loaded.record).toMatchObject({
          projectId: project.id,
          version: 1,
          source: 'ESRI_LAYER',
          sourceName: `${gis}/0`,
          zoneNameField: 'ZONE_NAME',
          fileKept: true,
          zonesSourceName: `${gis}/1`,
        });
        expect(loaded.queued?.tickets).toBe(0);
        const version = await tx.mapVersion.findUniqueOrThrow({
          where: { id: loaded.record.id },
          include: { zones: { orderBy: { name: 'asc' } } },
        });
        expect([version.loadedById, version.zones.map(({ name }) => name)]).toEqual([
          who.dana,
          ['Zone 1', 'Zone 2', 'Zone 3'],
        ]);
        const kept = await versionsUnder(
          administrator,
          installationMedia(),
          `projects/${project.id}/maps/`,
        );
        expect(kept).toHaveLength(2);
        expect([version.uploadedFileKey, version.zonesFileKey].sort()).toEqual(
          kept.map(({ key }) => key).sort(),
        );
        const refreshed = saved(
          refreshEsriMapEndpoint,
          await ask(api, dana, refreshEsriMapEndpoint, {
            ids: { mapVersionId: loaded.record.id },
            payload: { token: 'a-token-of-the-firms' },
          }),
        ).record;
        expect(refreshed).toMatchObject({
          version: 2,
          sourceName: `${gis}/0`,
          zonesSourceName: `${gis}/1`,
        });
        expect(arcgis.asked).toEqual(
          [0, 1, 0, 1].map((layer) => ({
            address: `${gis}/${String(layer)}`,
            token: 'a-token-of-the-firms',
          })),
        );
        expect(answer.text).not.toContain('a-token-of-the-firms');
        expect(api.lines.join('\n')).not.toMatch(/a-token-of-the-firms|gis\.baylinecounty/);
        // A version that came from a file, named or not, or a drawing, isn't refreshed from Esri.
        const uploaded = saved(
          loadMapEndpoint,
          await ask(api, dana, loadMapEndpoint, {
            ids: { projectId: project.id },
            payload: {
              source: 'UPLOAD',
              sourceName: 'bayline-row.geojson',
              boundary: { type: 'Polygon', coordinates: [p1Boundary] },
              zones: null,
              zoneNameField: null,
            },
          }),
        ).record;
        expect(
          notSaved(
            await ask(api, dana, refreshEsriMapEndpoint, { ids: { mapVersionId: uploaded.id } }),
          )[0],
        ).toBe('NOT_FROM_ESRI');
        const drawn = saved(
          loadMapEndpoint,
          await ask(api, dana, loadMapEndpoint, {
            ids: { projectId: project.id },
            payload: {
              source: 'DRAWN',
              sourceName: null,
              boundary: { type: 'Polygon', coordinates: [p1Boundary] },
              zones: null,
              zoneNameField: null,
            },
          }),
        ).record;
        expect(
          notSaved(
            await ask(api, dana, refreshEsriMapEndpoint, { ids: { mapVersionId: drawn.id } }),
          ),
        ).toEqual([
          'NOT_FROM_ESRI',
          'Not refreshed: this version wasn’t fetched from an Esri layer. Load the map again from its file.',
        ]);
      },
      undefined,
      undefined,
      { media: store, esri: arcgis },
    );
  });

  it('AC-10-80 one layer is both the boundary and the zones; a layer the server can’t fetch or read is told plainly, and nothing is loaded; a manager/analyst without Setup is refused before anything is fetched', async () => {
    const arcgis = new FirmsArcGis();
    arcgis.layers.set(`${gis}/1`, collection(zonesFeatures));
    arcgis.layers.set(
      `${gis}/2`,
      collection([
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [-75.6, 39.1] },
        },
      ]),
    );
    await world(
      async (api, tx, who, within) => {
        const { dana, project } = await p1Entered(api, tx);
        const ids = { projectId: project.id };
        const both = saved(
          loadEsriMapEndpoint,
          await ask(api, dana, loadEsriMapEndpoint, {
            ids,
            payload: {
              boundaryLayer: `${gis}/1`,
              zones: { layer: `${gis}/1`, nameField: 'ZONE_NAME' },
            },
          }),
        ).record;
        expect([both.sourceName, both.zonesSourceName]).toEqual([`${gis}/1`, `${gis}/1`]);
        expect(arcgis.asked).toHaveLength(1);
        expect(
          notSaved(
            await ask(api, dana, loadEsriMapEndpoint, {
              ids,
              payload: { boundaryLayer: `${gis}/9`, zones: null },
            }),
          ),
        ).toEqual(['ESRI_LAYER_REFUSED', 'Not fetched: the layer’s server answered 404.']);
        expect(
          notSaved(
            await ask(api, dana, loadEsriMapEndpoint, {
              ids,
              payload: { boundaryLayer: `${gis}/2`, zones: null },
            }),
          ),
        ).toEqual([
          'MAP_NOT_READ',
          `Not loaded: the layer ${gis}/2: A shape is a Polygon or a MultiPolygon: Point can't be kept.`,
        ]);
        expect(await tx.mapVersion.count({ where: { projectId: project.id } })).toBe(1);
        const luis = await api.signedIn(luissEmail, longer);
        const asked = arcgis.asked.length;
        expect(
          told(
            await ask(api, luis, loadEsriMapEndpoint, {
              ids,
              payload: { boundaryLayer: `${gis}/1`, zones: null },
            }),
          ),
        ).toEqual([403, 'NOT_ALLOWED']);
        expect(arcgis.asked).toHaveLength(asked);
        // The service asks again itself, before anything is fetched (ADR-364).
        const files = new MapFiles(within, api.clock, {
          media: store,
          reader: new MapFileReader({
            unzippedBytesAtMost: shippedPolicy.mapFileUnzippedBytesAtMost,
            entriesAtMost: shippedPolicy.mapFileEntriesAtMost,
            ringPairsAtMost: shippedPolicy.mapFileRingPairsAtMost,
          }),
          fileBytesAtMost: shippedPolicy.mapFileBytesAtMost,
          projects: new ProjectSetup(within, api.clock, shippedPolicy),
          sites: new SiteSetup(within, api.clock, shippedPolicy),
          esri: arcgis,
        });
        const refused = await files.loadEsriMap(who.luis, project.id, {
          boundaryLayer: `${gis}/1`,
          zones: null,
          token: undefined,
        });
        expect(refused.saved ? 'saved' : refused.refusal.code).toBe('NOT_ALLOWED');
        expect(arcgis.asked).toHaveLength(asked);
        expect(
          told(
            await ask(api, dana, loadEsriMapEndpoint, {
              ids,
              payload: { boundaryLayer: `${gis}/1?f=json`, zones: null },
            }),
          ),
        ).toEqual([400, 'BAD_REQUEST']);
      },
      undefined,
      undefined,
      { media: store, esri: arcgis },
    );
  });

  it('ADR-527 (10), (15) Marsh Road TDSR’s own shape from the firm’s sites layer is its next version, naming the layer and keeping its copy', async () => {
    const arcgis = new FirmsArcGis();
    const sitesLayer =
      'https://gis.baylinecounty.example/server/rest/services/Sites/FeatureServer/0';
    arcgis.layers.set(
      sitesLayer,
      collection([
        feature(
          [
            [
              [-75.622, 39.0883],
              [-75.6179, 39.0883],
              [-75.6179, 39.0916],
              [-75.622, 39.0916],
              [-75.622, 39.0883],
            ],
          ],
          { SITE: 'Marsh Road TDSR' },
        ),
      ]),
    );
    await world(
      async (api, tx) => {
        const { dana, project } = await p1Entered(api, tx);
        const site = saved(
          createSiteEndpoint,
          await ask(api, dana, createSiteEndpoint, {
            ids: { projectId: project.id },
            payload: {
              name: 'Marsh Road TDSR',
              siteTypeId: (await tx.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } })).id,
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
        const shape = saved(
          addSiteShapeFromEsriEndpoint,
          await ask(api, dana, addSiteShapeFromEsriEndpoint, {
            ids: { siteId: site.id },
            payload: { layer: sitesLayer },
          }),
        ).record;
        expect(shape).toMatchObject({
          siteId: site.id,
          version: 1,
          source: 'ESRI_LAYER',
          sourceName: sitesLayer,
          fileKept: true,
        });
        expect(arcgis.asked).toEqual([{ address: sitesLayer, token: undefined }]);
      },
      undefined,
      undefined,
      { media: store, esri: arcgis },
    );
  });
});
