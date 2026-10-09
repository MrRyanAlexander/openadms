// The local stack's map servers, asked over HTTPS through Caddy (REQ-022; ADR-282): the routing
// server (Valhalla) gives a shortest road distance, the address server (Nominatim) gives the
// address of a GPS point. They need `pnpm local:up`; without it they fail and say so.
//
// The expected values belong to the pinned extract (Delaware, 1 January 2026) and the pinned
// images. They change only when a pin changes, which is the point: a map update never silently
// changes a mileage (ARCHITECTURE §3).
import { existsSync, readFileSync } from 'node:fs';
import { request } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { defaultMapExtract } from '../src/map-extract.ts';

const stack = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootCert = join(stack, '.generated', 'caddy-root.crt');
const port = Number(process.env['ADMS_HTTPS_PORT'] ?? '443');

interface Answer {
  readonly status: number;
  readonly body: string;
}

// *.adms.localhost is this machine; the certificate is checked against Caddy's own root.
function ask(hostname: string, path: string, json?: unknown): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const payload = json === undefined ? undefined : JSON.stringify(json);
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: payload === undefined ? 'GET' : 'POST',
        servername: hostname,
        headers: {
          host: hostname,
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ca: readFileSync(rootCert),
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

// The Green, Dover; and a point on a road near Sandtown, both inside the extract.
const dover = { lat: 39.1565, lon: -75.5233 };
const sandtown = { lat: 39.0387, lon: -75.7281 };

beforeAll(() => {
  if (!existsSync(rootCert)) {
    throw new Error('The local stack is not up: run `pnpm local:up` first (adms-verify).');
  }
});

describe('the routing server (Valhalla)', () => {
  const routing = 'routing.adms.localhost';

  it('is the pinned version and answers only what the worker asks', async () => {
    const { status, body } = await ask(routing, '/status');
    expect(status).toBe(200);
    const answer = JSON.parse(body) as { version: string; available_actions: string[] };
    expect(answer.version).toBe('3.9.0');
    expect([...answer.available_actions].sort()).toEqual(['locate', 'route', 'status']);
  });

  // As the worker asks it (apps/worker, ADR-350): by distance, on the roads a car may drive.
  it('gives the shortest road distance between two points, in miles', async () => {
    const { status, body } = await ask(routing, '/route', {
      locations: [dover, sandtown],
      costing: 'auto',
      costing_options: {
        auto: { use_distance: 1, destination_only_penalty: 43_200, private_access_penalty: 43_200 },
      },
      units: 'miles',
    });
    expect(status).toBe(200);
    const { trip } = JSON.parse(body) as { trip: { units: string; summary: { length: number } } };
    expect(trip.units).toBe('miles');
    // Compared in tenths, half up, as a rule compares mileage (ADR-125).
    expect(Math.round(trip.summary.length * 10) / 10).toBe(15.6);
  });

  it('finds the nearest point on a road', async () => {
    const { status, body } = await ask(routing, '/locate', { locations: [dover], costing: 'auto' });
    expect(status).toBe(200);
    const [found] = JSON.parse(body) as [
      { edges: { correlated_lat: number; correlated_lon: number }[] },
    ];
    const edge = found.edges[0];
    expect(edge?.correlated_lat).toBeCloseTo(39.1566, 3);
    expect(edge?.correlated_lon).toBeCloseTo(-75.5233, 3);
  });

  it('answers nothing else', async () => {
    const { status } = await ask(routing, '/isochrone', {
      locations: [dover],
      costing: 'auto',
      contours: [{ time: 10 }],
    });
    expect(status).toBe(404);
  });
});

describe('the address server (Nominatim)', () => {
  const addresses = 'addresses.adms.localhost';

  it('is the pinned version and says the date of its map data', async () => {
    const { status, body } = await ask(addresses, '/status?format=json');
    expect(status).toBe(200);
    const answer = JSON.parse(body) as {
      message: string;
      software_version: string;
      data_updated: string;
    };
    expect(answer.message).toBe('OK');
    expect(answer.software_version).toBe('5.3.2');
    // The extract's own date: delaware-260101 is 1 January 2026.
    expect(defaultMapExtract.url).toContain('-260101.');
    expect(answer.data_updated.slice(0, 10)).toBe('2026-01-01');
  });

  it('gives the address of a GPS point: street number and name', async () => {
    const { status, body } = await ask(
      addresses,
      `/reverse?lat=${String(dover.lat)}&lon=${String(dover.lon)}&format=jsonv2&zoom=18`,
    );
    expect(status).toBe(200);
    const { address } = JSON.parse(body) as { address: Record<string, string> };
    expect(address).toMatchObject({
      house_number: '25',
      road: 'The Green',
      city: 'Dover',
      county: 'Kent County',
      state: 'Delaware',
      postcode: '19901',
    });
  });

  it('looks addresses up from a point only: no search', async () => {
    const { status } = await ask(addresses, '/search?q=Dover&format=jsonv2');
    expect(status).toBe(404);
  });
});
