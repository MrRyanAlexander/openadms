// What the worker asks the map servers (ARCHITECTURE §3 "Road distance and addresses"; ADR-110,
// 119, 163, 208, 282, 349, 350; BACKLOG C50): the routing server (Valhalla) for the point on a road
// nearest a GPS point and for the shortest road route between two points, the address server
// (Nominatim) for a point's address and for the date of its map data. Both are our own servers,
// asked over HTTPS only (ADR-098). Nothing here decides what a mileage is: `Mileages` does, with
// the domain's rule.
//
// An answer that isn't one of the answers known here (a server that is down, a timeout, a
// status never seen) throws: a mileage is never a straight line because a server didn't answer.
//
// An answer is taken from another program (OWASP API Security Top 10, API10; spec/CHECKLIST-API.md
// §5.9; ADR-517), so it is held as the API holds the address server's:
// - **No answer is followed anywhere** (ASVS 5.0 15.3.2): a redirect is a status not known here,
//   and throws.
// - **The whole exchange has so long and no longer**, from the connection to the last byte, and
//   the answer may be so large and no larger.
// - **Each value is checked before it is taken:** a road point's two coordinates finite numbers
//   in range, written as exact decimals; a route's length a finite number of miles, zero or
//   more. Anything else throws, so the job waits for its next try: an answer that can't be read
//   never becomes "no route" or a straight line.
// - **An error names the server and the path, never the point** (a point is where a private
//   citizen lives).
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

import { lookedUpAddress, type GpsPoint, type MapData } from '@open-adms/domain';

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
  // Where both servers are when it isn't where their names say: the proxy's own address and
  // port, as the worker's container reaches it inside the local stack. The name asked for, and
  // the certificate checked, stay the server's own.
  readonly at?: { readonly host: string; readonly port: number };
  // The most bytes an answer may be. A route with no directions, a road point or an address is a
  // few kibibytes.
  readonly answerBytesAtMost?: number;
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

const answerBytesAtMost = 256 * 1024;

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

// Answers every name with one address.
const always =
  (address: string): LookupFunction =>
  (_hostname, options, callback) => {
    const family = isIP(address) === 6 ? 6 : 4;
    if (options.all === true) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };

// A name under .localhost is this machine (RFC 6761); not every resolver knows.
const loopback = always('127.0.0.1');

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
    if (settings.at !== undefined && isIP(settings.at.host) === 0) {
      throw new Error('Where the map servers are is an IP address and a port.');
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
    const found: unknown = Array.isArray(body) ? body[0] : undefined;
    if (!isObject(found)) throw unread('routing', '/locate');
    // Valhalla says `edges: null` where no road is near.
    const { edges } = found;
    if (edges === null || edges === undefined) return null;
    if (!Array.isArray(edges)) throw unread('routing', '/locate');
    const edge: unknown = edges[0];
    if (edge === undefined) return null;
    if (!isObject(edge)) throw unread('routing', '/locate');
    const { correlated_lat: latitude, correlated_lon: longitude } = edge;
    if (!isDegrees(latitude, 90) || !isDegrees(longitude, 180)) {
      throw unread('routing', '/locate');
    }
    return { latitude: latitude.toFixed(8), longitude: longitude.toFixed(8) };
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
    if (status === 400 && isObject(body)) {
      const { error_code: code } = body;
      if (typeof code === 'number' && noRouteCodes.includes(code)) return null;
    }
    if (status !== 200) throw unknown('routing', '/route', status);
    const trip = isObject(body) ? body['trip'] : undefined;
    if (!isObject(trip)) throw unread('routing', '/route');
    if (trip['units'] !== 'miles') throw new Error('The routing server answered in other units.');
    const summary = trip['summary'];
    const length = isObject(summary) ? summary['length'] : undefined;
    if (typeof length !== 'number' || !Number.isFinite(length) || length < 0) {
      throw unread('routing', '/route');
    }
    return length;
  }

  // A point's address, street number and name ("25 The Green"), read by the domain's rule as the
  // API reads a phone's lookup (ADR-455); none where the address server knows no street there.
  async addressOf(point: GpsPoint): Promise<string | null> {
    const { status, body } = await this.ask(
      this.settings.addresses,
      `/reverse?lat=${point.latitude}&lon=${point.longitude}&format=jsonv2&zoom=18`,
    );
    if (status !== 200) throw unknown('addresses', '/reverse', status);
    return lookedUpAddress(body);
  }

  // The map extract the servers answer from: its date as the address server reports it, and
  // the hash the installation states.
  async mapData(): Promise<MapData> {
    const { status, body } = await this.ask(this.settings.addresses, '/status?format=json');
    if (status !== 200) throw unknown('addresses', '/status', status);
    const updated = isObject(body) ? body['data_updated'] : undefined;
    const date = typeof updated === 'string' ? updated.slice(0, 10) : undefined;
    if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("The address server didn't say the date of its map data.");
    }
    return { date, sha256: this.settings.mapDataSha256 };
  }

  private ask(server: string, path: string, json?: unknown): Promise<Answer> {
    const url = new URL(path, server);
    // What an error may say: the server's name and the path, never the question's own text.
    const asked = `${url.hostname}${url.pathname}`;
    const { at } = this.settings;
    const most = this.settings.answerBytesAtMost ?? answerBytesAtMost;
    const payload = json === undefined ? undefined : JSON.stringify(json);
    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: payload === undefined ? 'GET' : 'POST',
          headers: {
            accept: 'application/json',
            ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ca: this.ca,
          // The whole exchange, not only a quiet stretch of it.
          signal: AbortSignal.timeout(this.settings.timeoutMs),
          ...(at !== undefined
            ? { lookup: always(at.host), port: at.port }
            : url.hostname.endsWith('.localhost')
              ? { lookup: loopback }
              : {}),
        },
        (res) => {
          const chunks: Buffer[] = [];
          let bytes = 0;
          let over = false;
          res.on('data', (chunk: Buffer) => {
            if (over) return;
            bytes += chunk.length;
            if (bytes > most) {
              over = true;
              reject(new Error(`${asked} answered more than an answer of its is.`));
              res.destroy();
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            if (over) return;
            const status = res.statusCode ?? 0;
            try {
              const text = Buffer.concat(chunks).toString('utf8');
              resolve({ status, body: JSON.parse(text) as unknown });
            } catch {
              // An answer of any other status is judged by its status alone.
              if (status === 200) reject(new Error(`${asked} didn't answer in JSON.`));
              else resolve({ status, body: undefined });
            }
          });
          res.on('error', (error) => {
            reject(unasked(asked, error));
          });
        },
      );
      req.on('error', (error) => {
        reject(unasked(asked, error));
      });
      req.end(payload);
    });
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A coordinate as a number within its range of degrees: an infinite one, or none, is in no range.
const isDegrees = (value: unknown, most: number): value is number =>
  typeof value === 'number' && Math.abs(value) <= most;

// An answer of a known status whose values aren't what the question asks for.
const unread = (server: string, path: string): Error =>
  new Error(`The ${server} server's answer to ${path} isn't one that can be read.`);

// An error of this file's own wording: Node's may quote the request's address, point and all.
const unasked = (asked: string, error: Error): Error =>
  error.name === 'TimeoutError' || error.name === 'AbortError'
    ? new Error(`${asked} didn't answer in time.`)
    : new Error(`${asked} could not be asked (${error.name}).`);

const asNumbers = (point: GpsPoint): { lat: number; lon: number } => ({
  lat: Number(point.latitude),
  lon: Number(point.longitude),
});

const unknown = (server: string, path: string, status: number): Error =>
  new Error(`The ${server} server answered ${String(status)} to ${path}.`);
