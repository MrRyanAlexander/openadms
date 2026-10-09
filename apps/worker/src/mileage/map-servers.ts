// What the worker asks the map servers (ARCHITECTURE §3 "Road distance and addresses"; ADR-110,
// 119, 163, 208, 282, 349, 350; BACKLOG C50): the routing server (Valhalla) for the point on a road
// nearest a GPS point and for the shortest road route between two points, the address server
// (Nominatim) for a point's address and for the date of its map data. Both are our own servers,
// asked over HTTPS only (ADR-098). Nothing here decides what a mileage is: `Mileages` does, with
// the domain's rule.
//
// An answer that isn't one of the answers known here (a server that is down, a timeout, a
// status never seen) throws: a mileage is never a straight line because a server didn't answer.
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import type { LookupFunction } from 'node:net';

import type { GpsPoint, MapData } from '@open-adms/domain';

export interface MapServerSettings {
  // Each server's address: "https://routing.adms.localhost".
  readonly routing: string;
  readonly addresses: string;
  // The certificate authority both are checked against, as a PEM file; none for the machine's
  // own trust store.
  readonly caFile: string | null;
  // The SHA-256 of the map extract both servers were built from: no server reports it, so the
  // installation states it (the local stack's ADMS_MAP_EXTRACT_SHA256).
  readonly mapDataSha256: string;
  // How long one question may take.
  readonly timeoutMs: number;
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

// The route a car would take, measured by distance alone (ADR-350, the user: "A car wouldn't
// cross over a private road like this and neither should a load"). The routing server's plain
// `shortest` switches off every penalty, the one for private roads included, and was seen to cut
// along dirt farm tracks; `use_distance: 1` costs a route by its length and keeps the car's own
// rules, and the two penalties are set to the most the server takes (twelve hours), so a road
// that is private, or behind a private gate, is entered only to reach an end that lies on it.
const byDistanceAsACarDrives = {
  use_distance: 1,
  destination_only_penalty: 43_200,
  private_access_penalty: 43_200,
};

// Valhalla's two ways of saying there is no road route: no road near an end, no path between
// the ends. Anything else it refuses is a fault.
const noRouteCodes = [171, 442];

// A name under .localhost is this machine (RFC 6761); not every resolver knows.
const loopback: LookupFunction = (_hostname, options, callback) => {
  if (options.all === true) callback(null, [{ address: '127.0.0.1', family: 4 }]);
  else callback(null, '127.0.0.1', 4);
};

export class MapServers {
  private readonly settings: MapServerSettings;
  private readonly ca: Buffer | undefined;

  constructor(settings: MapServerSettings) {
    for (const address of [settings.routing, settings.addresses]) {
      if (new URL(address).protocol !== 'https:') {
        throw new Error('A map server is asked over HTTPS only.');
      }
    }
    if (!/^[0-9a-f]{64}$/.test(settings.mapDataSha256)) {
      throw new Error("The map data's SHA-256 is 64 lowercase hex characters.");
    }
    this.settings = settings;
    this.ca = settings.caFile === null ? undefined : readFileSync(settings.caFile);
  }

  // The point on a road nearest a GPS point: a road of the public network (residential or
  // larger), never a driveway, a parking aisle or another service way. None where the map has
  // no road near it.
  async nearestRoad(point: GpsPoint): Promise<GpsPoint | null> {
    const { status, body } = await this.ask(this.settings.routing, '/locate', {
      locations: [{ ...asNumbers(point), search_filter: { min_road_class: 'residential' } }],
      costing: 'auto',
    });
    if (status !== 200) throw unknown('routing', '/locate', status);
    const [found] = body as [{ edges?: { correlated_lat: number; correlated_lon: number }[] }];
    const edge = found.edges?.[0];
    if (edge === undefined) return null;
    return {
      latitude: edge.correlated_lat.toFixed(8),
      longitude: edge.correlated_lon.toFixed(8),
    };
  }

  // The length in miles of the shortest route a car would drive from a road point to a GPS
  // point, never across a private road; none where the routing server finds no route.
  async shortestRouteMiles(from: GpsPoint, to: GpsPoint): Promise<number | null> {
    const { status, body } = await this.ask(this.settings.routing, '/route', {
      locations: [asNumbers(from), asNumbers(to)],
      costing: 'auto',
      costing_options: { auto: byDistanceAsACarDrives },
      units: 'miles',
      directions_type: 'none',
    });
    if (status === 400) {
      const { error_code: code } = body as { error_code?: number };
      if (code !== undefined && noRouteCodes.includes(code)) return null;
    }
    if (status !== 200) throw unknown('routing', '/route', status);
    const { trip } = body as { trip: { units: string; summary: { length: number } } };
    if (trip.units !== 'miles') throw new Error('The routing server answered in other units.');
    return trip.summary.length;
  }

  // A point's address, street number and name ("25 The Green"); none where the address server
  // knows no street there.
  async addressOf(point: GpsPoint): Promise<string | null> {
    const { status, body } = await this.ask(
      this.settings.addresses,
      `/reverse?lat=${point.latitude}&lon=${point.longitude}&format=jsonv2&zoom=18`,
    );
    if (status !== 200) throw unknown('addresses', '/reverse', status);
    const { address } = body as { address?: { house_number?: string; road?: string } };
    if (address?.road === undefined) return null;
    return [address.house_number, address.road].filter((part) => part !== undefined).join(' ');
  }

  // The map extract the servers answer from: its date as the address server reports it, and
  // the hash the installation states.
  async mapData(): Promise<MapData> {
    const { status, body } = await this.ask(this.settings.addresses, '/status?format=json');
    if (status !== 200) throw unknown('addresses', '/status', status);
    const { data_updated: updated } = body as { data_updated?: string };
    const date = updated?.slice(0, 10);
    if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("The address server didn't say the date of its map data.");
    }
    return { date, sha256: this.settings.mapDataSha256 };
  }

  private ask(server: string, path: string, json?: unknown): Promise<Answer> {
    const url = new URL(path, server);
    const payload = json === undefined ? undefined : JSON.stringify(json);
    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: payload === undefined ? 'GET' : 'POST',
          headers: payload === undefined ? {} : { 'content-type': 'application/json' },
          ca: this.ca,
          timeout: this.settings.timeoutMs,
          ...(url.hostname.endsWith('.localhost') ? { lookup: loopback } : {}),
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (text += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as unknown });
            } catch {
              reject(new Error(`${url.hostname}${url.pathname} didn't answer in JSON.`));
            }
          });
        },
      );
      req.on('timeout', () => {
        req.destroy(new Error(`${url.hostname}${url.pathname} didn't answer in time.`));
      });
      req.on('error', reject);
      req.end(payload);
    });
  }
}

const asNumbers = (point: GpsPoint): { lat: number; lon: number } => ({
  lat: Number(point.latitude),
  lon: Number(point.longitude),
});

const unknown = (server: string, path: string, status: number): Error =>
  new Error(`The ${server} server answered ${String(status)} to ${path}.`);
