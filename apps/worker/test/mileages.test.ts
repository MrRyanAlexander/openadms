// What the worker asks the map servers, and the mileage it keeps (spec/acceptance/
// 06-reconciliation.md AC-06-53…56; ADR-349), asked over HTTPS through Caddy. They need
// `pnpm local:up`; without it they fail and say so.
//
// The places are the example world's as they stand on the pinned extract (Delaware, 1 January
// 2026; spec/CONVENTIONS.md §6): Bayline County is made up, so its roads stand in from the
// extract's. The figures belong to that extract and the pinned images, and change only when a
// pin changes (ARCHITECTURE §3).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { GpsPoint } from '@open-adms/domain';

import { MapServers, Mileages, type MapServerSettings } from '../src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const rootCert = join(root, 'infra', 'local', '.generated', 'caddy-root.crt');
const port = process.env['ADMS_HTTPS_PORT'] ?? '443';

const settings: MapServerSettings = {
  routing: `https://routing.adms.localhost:${port}`,
  addresses: `https://addresses.adms.localhost:${port}`,
  caFile: rootCert,
  // The pinned extract's own (infra/local/src/map-extract.ts).
  mapDataSha256: '08c07f96ad5863a267cb09c0921d9b6dd6904d8b2fe0704f67ec866af11d1888',
  timeoutMs: 30_000,
};
const mapData = { date: '2026-01-01', sha256: settings.mapDataSha256 };

const point = (latitude: string, longitude: string): GpsPoint => ({ latitude, longitude });

const heronSt = point('39.13850000', '-75.55370000');
const marshRoad = point('39.09000000', '-75.62000000');
const landfill = point('39.00000000', '-75.58000000');
const cypressCreek = point('39.24000000', '-75.60000000');
// Out in the Atlantic, 147 miles from Marsh Road TDSR: no road is near it.
const atSea = point('38.50000000', '-73.00000000');

beforeAll(() => {
  if (!existsSync(rootCert)) {
    throw new Error('The local stack is not up: run `pnpm local:up` first (adms-verify).');
  }
});

describe('what the worker asks the map servers', () => {
  const servers = new MapServers(settings);

  it('the point on a public road nearest a GPS point, and none where no road is near', async () => {
    expect(await servers.nearestRoad(heronSt)).toEqual(point('39.13844300', '-75.55388800'));
    expect(await servers.nearestRoad(atSea)).toBeNull();
  });

  it('the shortest route by road in miles, and none where there is no route', async () => {
    expect(await servers.shortestRouteMiles(marshRoad, landfill)).toBe(8.1167);
    expect(await servers.shortestRouteMiles(marshRoad, atSea)).toBeNull();
  });

  it('the route is the one a car would drive, never a short cut along a farm track or across a private road (ADR-350)', async () => {
    // East of Dover: a dirt farm track joins these two roads. The routing server's plain
    // "shortest" follows it (2.6593 miles); a car goes round by road.
    const from = point('39.22531000', '-75.46156000');
    const to = point('39.22698000', '-75.44908000');
    const roadPoint = await servers.nearestRoad(from);

    expect(roadPoint).not.toBeNull();
    expect(await servers.shortestRouteMiles(roadPoint ?? from, to)).toBeGreaterThan(3.2);
  });

  it('a point’s address as street number and name, and none where it knows no street', async () => {
    expect(await servers.addressOf(point('39.15650000', '-75.52330000'))).toBe('25 The Green');
    expect(await servers.addressOf(point('39.13844300', '-75.55388800'))).toBe('Wyoming Mill Road');
    expect(await servers.addressOf(atSea)).toBeNull();
  });

  it('the map data’s date from the address server, with the hash the installation states', async () => {
    expect(await servers.mapData()).toEqual(mapData);
  });

  it('only over HTTPS, and only with a whole SHA-256', () => {
    expect(() => new MapServers({ ...settings, routing: 'http://routing.adms.localhost' })).toThrow(
      'HTTPS only',
    );
    expect(() => new MapServers({ ...settings, mapDataSha256: 'unknown' })).toThrow('SHA-256');
  });

  it('a server that doesn’t answer is a fault, never "no route"', async () => {
    const down = new MapServers({ ...settings, routing: 'https://routing.adms.localhost:1' });
    await expect(down.shortestRouteMiles(marshRoad, landfill)).rejects.toThrow();
    await expect(new Mileages(down).between({ from: heronSt, to: marshRoad })).rejects.toThrow();
  });
});

describe('a mileage', () => {
  it('AC-06-53 ticket 101001: from 14 Heron St’s nearest road point to Marsh Road TDSR’s own GPS, 6.2 miles in tenths, kept unrounded with the road point, its address and the map data’s date and hash', async () => {
    const measured = await new Mileages(new MapServers(settings)).between({
      from: heronSt,
      to: marshRoad,
    });

    expect(measured).toEqual({
      miles: '6.2050',
      source: 'ROAD_ROUTE',
      ends: { from: heronSt, to: marshRoad },
      snapped: point('39.13844300', '-75.55388800'),
      snappedAddress: 'Wyoming Mill Road',
      mapData,
    });
  });

  it('AC-06-54 haul-out 201001 runs from its collection’s end at Marsh Road TDSR to Bayline County Landfill’s own GPS; one to Cypress Creek Landfill is another mileage', async () => {
    const mileages = new Mileages(new MapServers(settings));

    expect(await mileages.between({ from: marshRoad, to: landfill })).toMatchObject({
      miles: '8.1167',
      source: 'ROAD_ROUTE',
      snappedAddress: 'Morgans Choice Road',
    });
    expect((await mileages.between({ from: marshRoad, to: cypressCreek })).miles).toBe('13.9746');
  });

  it('AC-06-54 each property of a split has its own, from its own end GPS', async () => {
    const mileages = new Mileages(new MapServers(settings));
    const a = await mileages.between({ from: heronSt, to: marshRoad });
    const b = await mileages.between({ from: point('39.12000000', '-75.56000000'), to: marshRoad });

    expect([a.miles, b.miles]).toEqual(['6.2050', '4.8283']);
    expect(b.snappedAddress).toBe('Broad Street');
  });

  it('AC-06-55 with no road near the collection’s end GPS it is the straight line, marked as such, with no road point', async () => {
    const measured = await new Mileages(new MapServers(settings)).between({
      from: atSea,
      to: marshRoad,
    });

    expect(measured).toEqual({
      miles: '147.1658',
      source: 'STRAIGHT_LINE',
      ends: { from: atSea, to: marshRoad },
      snapped: null,
      snappedAddress: null,
      mapData,
    });
  });

  it('AC-06-55 with a road point but no route to the site it is the straight line from the GPS itself, and the road point is kept', async () => {
    const measured = await new Mileages(new MapServers(settings)).between({
      from: heronSt,
      to: atSea,
    });

    expect(measured).toMatchObject({
      source: 'STRAIGHT_LINE',
      snapped: point('39.13844300', '-75.55388800'),
      snappedAddress: 'Wyoming Mill Road',
    });
    expect(Number(measured.miles)).toBeGreaterThan(140);
  });

  it('AC-06-56 a mileage that still stands is handed back and no server is asked; with none standing it is asked for', async () => {
    const servers = new MapServers(settings);
    const mileages = new Mileages(servers);
    const standing = await mileages.between({ from: heronSt, to: marshRoad });
    const asked = [
      vi.spyOn(servers, 'mapData'),
      vi.spyOn(servers, 'nearestRoad'),
      vi.spyOn(servers, 'addressOf'),
      vi.spyOn(servers, 'shortestRouteMiles'),
    ];

    expect(await mileages.between({ from: heronSt, to: marshRoad }, standing)).toBe(standing);
    for (const question of asked) expect(question).not.toHaveBeenCalled();

    // The site's GPS corrected: the run hands no standing mileage, and it is asked for again.
    const again = await mileages.between({ from: heronSt, to: landfill });
    expect(again.miles).not.toBe(standing.miles);
    for (const question of asked) expect(question).toHaveBeenCalledTimes(1);
  });
});
