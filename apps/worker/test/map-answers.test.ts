// What the worker takes from the map servers' answers (OWASP API Security Top 10 API10, ASVS 5.0
// 15.3.2; spec/CHECKLIST-API.md §5.9; ADR-517): an answer is taken from another program, so it is
// followed nowhere, bounded in time and size, and each value checked before it is taken; anything
// else throws, so the job waits for its next try, and the error never holds the point. Asked of a
// test's own HTTPS server that answers wrongly, with the local stack's certificate for this
// machine, checked against the stack's root as the stack's own servers are: it needs `pnpm
// local:up`, which makes the certificate, and fails saying so.
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { GpsPoint } from '@open-adms/domain';

import { MapServers, Mileages, type MapServerSettings } from '../src/index.ts';

const generated = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'infra',
  'local',
  '.generated',
);
const rootCert = join(generated, 'caddy-root.crt');
const hostCert = join(generated, 'tls', 'host.crt');
const hostKey = join(generated, 'tls', 'host.key');

beforeAll(() => {
  if (!existsSync(hostCert)) {
    throw new Error(
      'The local stack has no certificates: run `pnpm local:up` first (adms-verify).',
    );
  }
});

type Answer = (request: IncomingMessage, response: ServerResponse) => void;

// A test's own map server: it answers as the test says and keeps the paths it was asked.
const running: Server[] = [];
async function server(answer: Answer): Promise<{ port: number; heard: string[] }> {
  const heard: string[] = [];
  const made = createServer(
    { cert: readFileSync(hostCert), key: readFileSync(hostKey) },
    (request, response) => {
      heard.push(request.url ?? '');
      // The question is read whole before it is answered.
      request.resume();
      request.on('end', () => {
        answer(request, response);
      });
    },
  );
  running.push(made);
  await new Promise<void>((resolve) => made.listen(0, '127.0.0.1', resolve));
  return { port: (made.address() as AddressInfo).port, heard };
}

afterEach(async () => {
  for (const made of running.splice(0)) {
    made.closeAllConnections();
    await new Promise((resolve) => made.close(resolve));
  }
});

const json =
  (body: unknown, status = 200): Answer =>
  (_request, response) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

// Both servers at the test's own, by the name its certificate holds, checked against the stack's
// root: as the worker's container asks Caddy by name at an address of its own.
const askedAt = (port: number, more: Partial<MapServerSettings> = {}): MapServers =>
  new MapServers({
    routing: 'https://localhost',
    addresses: 'https://localhost',
    caFile: rootCert,
    mapDataSha256: '08c07f96ad5863a267cb09c0921d9b6dd6904d8b2fe0704f67ec866af11d1888',
    timeoutMs: 5000,
    at: { host: '127.0.0.1', port },
    ...more,
  });

const point = (latitude: string, longitude: string): GpsPoint => ({ latitude, longitude });
const heronSt = point('39.13850000', '-75.55370000');
const marshRoad = point('39.09000000', '-75.62000000');

async function words(asked: Promise<unknown>): Promise<string> {
  try {
    await asked;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('The map server’s answer was taken.');
}

// No error ever holds a point, which is where a private citizen lives.
const holdsNoPoint = (said: string): void => {
  expect(said).not.toMatch(/39\.1385|75\.5537|39\.09|75\.62|lat=|lon=/);
};

describe('AC-10-69 an answer that sends the worker elsewhere (ASVS 5.0 15.3.2)', () => {
  it('is followed nowhere: each of the four questions throws, and where it points is never asked', async () => {
    const elsewhere = await server(json({}));
    for (const status of [301, 302, 303, 307, 308]) {
      const redirecting = await server((_request, response) => {
        response.writeHead(status, {
          location: `https://localhost:${String(elsewhere.port)}/route`,
        });
        response.end();
      });
      const servers = askedAt(redirecting.port);
      expect(await words(servers.nearestRoad(heronSt))).toBe(
        `The routing server answered ${String(status)} to /locate.`,
      );
      expect(await words(servers.shortestRouteMiles(marshRoad, heronSt))).toBe(
        `The routing server answered ${String(status)} to /route.`,
      );
      expect(await words(servers.addressOf(heronSt))).toBe(
        `The addresses server answered ${String(status)} to /reverse.`,
      );
      expect(await words(servers.mapData())).toBe(
        `The addresses server answered ${String(status)} to /status.`,
      );
      expect(redirecting.heard).toHaveLength(4);
    }
    expect(elsewhere.heard).toEqual([]);
  });
});

describe('AC-10-70 an answer that is too large or too slow (API10)', () => {
  it('too large: past the bytes an answer may be, it is no answer', async () => {
    const big = await server(
      json({ trip: { units: 'miles', summary: { length: 8.1167 } }, pad: 'x'.repeat(4096) }),
    );
    const said = await words(
      askedAt(big.port, { answerBytesAtMost: 1024 }).shortestRouteMiles(marshRoad, heronSt),
    );
    expect(said).toBe('localhost/route answered more than an answer of its is.');
    // The same answer, under the release's bound, is read.
    expect(await askedAt(big.port).shortestRouteMiles(marshRoad, heronSt)).toBe(8.1167);
  });

  it('too slow: the whole exchange is timed, so an answer that trickles in is no answer either', async () => {
    const trickling = await server((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      // A byte every tenth of a second: never quiet for long, never done in time.
      const timer = setInterval(() => response.write(' '), 100);
      response.on('close', () => {
        clearInterval(timer);
      });
    });
    const servers = askedAt(trickling.port, { timeoutMs: 600 });
    const route = await words(servers.shortestRouteMiles(marshRoad, heronSt));
    expect(route).toBe("localhost/route didn't answer in time.");
    const address = await words(servers.addressOf(heronSt));
    expect(address).toBe("localhost/reverse didn't answer in time.");
    holdsNoPoint(route);
    holdsNoPoint(address);
  });
});

describe('AC-10-70 a value that is not what was asked for (API10)', () => {
  it('a route’s length is a finite number of miles, zero or more: a string, a negative, an infinite or none throws, and never becomes “no route” or a straight line', async () => {
    for (const length of ['"8.1167"', '-0.5', '1e400', 'null', '{}']) {
      const wrong = await server(json(`{"trip":{"units":"miles","summary":{"length":${length}}}}`));
      const said = await words(askedAt(wrong.port).shortestRouteMiles(marshRoad, heronSt));
      expect(said, length).toBe(
        "The routing server's answer to /route isn't one that can be read.",
      );
      holdsNoPoint(said);
    }
    // Nor through a mileage: every other answer right, the length negative, and the job waits,
    // its error the server's.
    const answers: Record<string, unknown> = {
      '/status': { data_updated: '2026-01-01T00:00:00+00:00' },
      '/locate': [{ edges: [{ correlated_lat: 39.138443, correlated_lon: -75.553888 }] }],
      '/reverse': { address: { house_number: '25', road: 'The Green' } },
      '/route': { trip: { units: 'miles', summary: { length: -2 } } },
    };
    const allButOne = await server((request, response) => {
      json(answers[new URL(request.url ?? '/', 'https://localhost').pathname] ?? {}, 200)(
        request,
        response,
      );
    });
    const mileage = new Mileages(askedAt(allButOne.port));
    await expect(mileage.between({ from: heronSt, to: marshRoad })).rejects.toThrow(
      "The routing server's answer to /route isn't one that can be read.",
    );
    expect(allButOne.heard.map((path) => path.split('?')[0])).toContain('/route');
    // A length of zero, and one that is a plain number, are read.
    const zero = await server(json({ trip: { units: 'miles', summary: { length: 0 } } }));
    expect(await askedAt(zero.port).shortestRouteMiles(marshRoad, heronSt)).toBe(0);
  });

  it('a road point’s two coordinates are finite numbers in range, written as exact decimals: anything else throws', async () => {
    for (const edge of [
      '{"correlated_lat":91,"correlated_lon":-75.55}',
      '{"correlated_lat":39.13,"correlated_lon":-181}',
      '{"correlated_lat":"39.13","correlated_lon":-75.55}',
      '{"correlated_lat":1e400,"correlated_lon":-75.55}',
      '{"correlated_lat":39.13}',
      '"a road"',
    ]) {
      const wrong = await server(json(`[{"edges":[${edge}]}]`));
      const said = await words(askedAt(wrong.port).nearestRoad(heronSt));
      expect(said, edge).toBe("The routing server's answer to /locate isn't one that can be read.");
      holdsNoPoint(said);
    }
    for (const body of ['{}', '[]', '"none"', '[{"edges":"none"}]']) {
      const wrong = await server(json(body));
      expect(await words(askedAt(wrong.port).nearestRoad(heronSt)), body).toBe(
        "The routing server's answer to /locate isn't one that can be read.",
      );
    }
    // A point in range is read, to eight places; no edge, or none listed, is no road.
    const right = await server(
      json([{ edges: [{ correlated_lat: 39.138443, correlated_lon: -75.553888 }] }]),
    );
    expect(await askedAt(right.port).nearestRoad(heronSt)).toEqual(
      point('39.13844300', '-75.55388800'),
    );
    for (const none of ['[{"edges":null}]', '[{"edges":[]}]', '[{}]']) {
      const empty = await server(json(none));
      expect(await askedAt(empty.port).nearestRoad(heronSt), none).toBeNull();
    }
  });

  it('the map data’s date is a date: anything else throws', async () => {
    for (const updated of ['null', '42', '"recently"']) {
      const wrong = await server(json(`{"data_updated":${updated}}`));
      expect(await words(askedAt(wrong.port).mapData()), updated).toBe(
        "The address server didn't say the date of its map data.",
      );
    }
  });
});
