// An Esri feature layer, fetched by the API for the back office (ARCHITECTURE §3 "Project
// boundary and zones", §4; spec/acceptance/10-api-and-sync.md AC-10-77…80; ADR-523, 527 (15)):
// every feature of the layer as GeoJSON in WGS84, through Esri's own REST query, a page at a time
// while the layer says more are left, put together as one FeatureCollection, which the caller
// keeps as a map's file.
//
// The address is one a person typed, so this is a request the server makes for a caller: OWASP
// API Security Top 10 (2023) API7 and ASVS 5.0 1.3.6 (server-side request forgery), and an answer
// from another program, API10. How each is met here:
// - **Only a layer's address is asked:** `https:`, with no user, password, query or fragment, its
//   path a layer's (`…/FeatureServer/<n>` or `…/MapServer/<n>`). The request is built here, never
//   from anything sent beside it: its path is the layer's `query`, its form the one below.
// - **Never the server's neighbours:** `localhost`, every `.localhost` name (the local stack's
//   own), and every loopback, private, link-local, shared, multicast, documentation, benchmark or
//   otherwise reserved address are refused, IPv4 and IPv6 alike (an IPv4-mapped one too), **unless
//   the firm states that host name** in its settings (`ADMS_ESRI_PRIVATE_HOSTS`: an ArcGIS
//   Enterprise on its own network). A name is checked **where the connection is made**, every
//   address it resolves to, so a name that answers one address when checked and another when
//   connected to (DNS rebinding) is still refused.
// - **No answer is followed anywhere:** a redirect is refused, saying to give the layer's own
//   address. Its certificate is checked (the machine's trust store, or the firm's CA file).
// - **Bounded and timed whole:** every page of the exchange shares `ESRI_LAYER_ANSWER_SECONDS`,
//   from the first connection to the last byte; the answers come to `MAP_FILE_BYTES_AT_MOST`
//   together, and so does the copy kept. A layer that says more are left and gives none ends it.
// - **A secured layer's token** is sent in the request's form body, never in an address, used for
//   this fetch alone; it is never kept, logged or said in an answer or an error.
// - **What the layer's server says is never repeated:** an error is said by its code (498 and 499,
//   a token missing or no longer good, in plain words), never its own words; a problem of Node's
//   is said by its name, never its message (which may quote the address).
import { readFileSync } from 'node:fs';
import { lookup as resolve } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

export interface EsriLayerSettings {
  // The whole exchange, every page, in milliseconds.
  readonly answerMs: number;
  // The most the answers may come to, together, and so the copy kept.
  readonly bytesAtMost: number;
  // The host names the firm states may be at a private address, in lower case.
  readonly privateHosts: readonly string[];
  // The certificate authority a layer's server is checked against, as a PEM file; none for the
  // machine's own trust store.
  readonly caFile: string | null;
  // A test's own: the name resolved, as `dns.lookup` with `all` answers.
  readonly resolver?: (hostname: string) => Promise<readonly { address: string; family: number }[]>;
  // A test's own: the port a layer is asked at, where its address names none.
  readonly port?: number;
}

export type EsriFetched =
  | { readonly fetched: Uint8Array; readonly problem: null }
  | { readonly fetched: null; readonly problem: string };

// Who fetches a layer: Esri, or a test's own.
export interface EsriLayerSource {
  fetch(address: string, token: string | undefined): Promise<EsriFetched>;
}

// Thrown inside a fetch with the plain words a person is told.
class NotFetched extends Error {}

const layerPath = /\/(?:FeatureServer|MapServer)\/\d+\/?$/i;

// The addresses no layer is fetched from unless the firm names the host (IANA's special-purpose
// registries, RFC 6890 and its updates).
const neighbours = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  neighbours.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  neighbours.addSubnet(network, prefix, 'ipv6');
}

// An IPv4-mapped IPv6 address (`::ffff:127.0.0.1`) is checked against the IPv4 rules: Node's
// BlockList reads it so, which is also why no IPv6 rule names the mapped range (one would hold
// every IPv4 address).
export function isNeighbour(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  return neighbours.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

const nodeResolver = (hostname: string): Promise<readonly { address: string; family: number }[]> =>
  new Promise((done, failed) => {
    resolve(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error === null) done(addresses);
      else failed(error);
    });
  });

export class EsriLayers implements EsriLayerSource {
  private readonly settings: EsriLayerSettings;
  private readonly ca: Buffer | undefined;

  constructor(settings: EsriLayerSettings) {
    this.settings = settings;
    this.ca = settings.caFile === null ? undefined : readFileSync(settings.caFile);
  }

  async fetch(address: string, token: string | undefined): Promise<EsriFetched> {
    try {
      const layer = this.held(address);
      const signal = AbortSignal.timeout(this.settings.answerMs);
      const features: unknown[] = [];
      let read = 0;
      for (;;) {
        const page = await this.page(layer, features.length, token, signal, read);
        read += page.bytes;
        features.push(...page.features);
        if (!page.more || page.features.length === 0) break;
      }
      const fetched = new TextEncoder().encode(
        JSON.stringify({ type: 'FeatureCollection', features }),
      );
      if (fetched.byteLength > this.settings.bytesAtMost) throw this.tooLarge();
      return { fetched, problem: null };
    } catch (error) {
      if (error instanceof NotFetched) return { fetched: null, problem: error.message };
      throw error;
    }
  }

  // The layer's address, held to what a layer's is, and its host to what may be asked.
  private held(address: string): URL {
    if (!URL.canParse(address)) throw new NotFetched('the layer’s address can’t be read.');
    const url = new URL(address);
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new NotFetched(
        'a layer is linked by its own HTTPS address, with no name, password, query or fragment in it.',
      );
    }
    if (!layerPath.test(url.pathname)) {
      throw new NotFetched(
        'the address isn’t a feature layer’s: it ends …/FeatureServer/<n> or …/MapServer/<n>.',
      );
    }
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (this.stated(host)) return url;
    if (host === 'localhost' || host.endsWith('.localhost')) throw this.neighbour();
    if (isIP(host) !== 0 && isNeighbour(host)) throw this.neighbour();
    return url;
  }

  private stated(host: string): boolean {
    return this.settings.privateHosts.includes(host);
  }

  private neighbour(): NotFetched {
    return new NotFetched(
      'the layer’s server is at a private address or one of the installation’s own, which the API never asks unless the firm lists it.',
    );
  }

  private tooLarge(): NotFetched {
    return new NotFetched(
      `the layer is larger than ${String(this.settings.bytesAtMost)} bytes: it isn’t kept.`,
    );
  }

  // Every address a name resolves to, checked as the connection is made: one a neighbour's is
  // refused, unless the firm states the host.
  private lookup(host: string): LookupFunction {
    const resolver = this.settings.resolver ?? nodeResolver;
    const stated = this.stated(host);
    return (hostname, options, callback) => {
      resolver(hostname).then(
        (addresses) => {
          if (
            addresses.length === 0 ||
            (!stated && addresses.some((one) => isNeighbour(one.address)))
          ) {
            callback(Object.assign(new Error('refused'), { code: 'ESRI_NEIGHBOUR' }), '', 4);
            return;
          }
          if (options.all === true) {
            callback(
              null,
              addresses.map(({ address, family }) => ({ address, family })),
            );
            return;
          }
          const [first] = addresses;
          callback(null, first?.address ?? '', first?.family ?? 4);
        },
        (error: unknown) => {
          callback(error instanceof Error ? error : new Error('unresolved'), '', 4);
        },
      );
    };
  }

  // One page of the layer's features, from `offset`.
  private page(
    layer: URL,
    offset: number,
    token: string | undefined,
    signal: AbortSignal,
    readBefore: number,
  ): Promise<{ features: unknown[]; more: boolean; bytes: number }> {
    const query = new URL(`${layer.pathname.replace(/\/$/, '')}/query`, layer);
    const form = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      outSR: '4326',
      returnGeometry: 'true',
      f: 'geojson',
      resultOffset: String(offset),
    });
    if (token !== undefined) form.set('token', token);
    const body = form.toString();
    const host = layer.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const most = this.settings.bytesAtMost - readBefore;
    return new Promise((done, failed) => {
      const asked = request(
        query,
        {
          method: 'POST',
          headers: {
            accept: 'application/geo+json, application/json',
            'content-type': 'application/x-www-form-urlencoded',
            'content-length': Buffer.byteLength(body),
          },
          ca: this.ca,
          signal,
          lookup: this.lookup(host),
          ...(layer.port === '' && this.settings.port !== undefined
            ? { port: this.settings.port }
            : {}),
        },
        (answer) => {
          const status = answer.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            answer.destroy();
            failed(
              new NotFetched(
                'the layer’s server answered with a redirect, which the API never follows: give the layer’s own address.',
              ),
            );
            return;
          }
          if (status !== 200) {
            answer.destroy();
            failed(new NotFetched(`the layer’s server answered ${String(status)}.`));
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          let over = false;
          answer.on('data', (chunk: Buffer) => {
            if (over) return;
            bytes += chunk.length;
            if (bytes > most) {
              over = true;
              answer.destroy();
              failed(this.tooLarge());
              return;
            }
            chunks.push(chunk);
          });
          answer.on('end', () => {
            if (over) return;
            try {
              done({ ...EsriLayers.read(Buffer.concat(chunks).toString('utf8')), bytes });
            } catch (error) {
              failed(error instanceof Error ? error : new Error('The answer could not be read.'));
            }
          });
          answer.on('error', (error) => {
            failed(EsriLayers.unasked(error));
          });
        },
      );
      asked.on('error', (error) => {
        failed(EsriLayers.unasked(error));
      });
      asked.end(body);
    });
  }

  // A page as the layer answered it: its features, and whether it says more are left (ArcGIS
  // says so in the collection's `properties`, or beside its features).
  private static read(text: string): { features: unknown[]; more: boolean } {
    let answer: unknown;
    try {
      answer = JSON.parse(text);
    } catch {
      throw new NotFetched('the layer’s server didn’t answer in GeoJSON.');
    }
    if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
      throw new NotFetched('the layer’s server didn’t answer in GeoJSON.');
    }
    const said = answer as Record<string, unknown>;
    const error = said['error'];
    if (typeof error === 'object' && error !== null) {
      const code = (error as Record<string, unknown>)['code'];
      if (code === 498 || code === 499) {
        throw new NotFetched(
          `the layer is secured, and its token is missing or no longer good (Esri’s ${String(code)}).`,
        );
      }
      throw new NotFetched(
        `the layer’s server answered with an error${typeof code === 'number' ? ` (${String(code)})` : ''}.`,
      );
    }
    const features = said['features'];
    if (said['type'] !== 'FeatureCollection' || !Array.isArray(features)) {
      throw new NotFetched('the layer’s server didn’t answer in GeoJSON.');
    }
    const properties = said['properties'];
    const more =
      said['exceededTransferLimit'] === true ||
      (typeof properties === 'object' &&
        properties !== null &&
        (properties as Record<string, unknown>)['exceededTransferLimit'] === true);
    return { features: features as unknown[], more };
  }

  // Node's own words may quote the address: only what kind of problem it was is said.
  private static unasked(error: unknown): Error {
    if (error instanceof NotFetched) return error;
    const named = error as { name?: unknown; code?: unknown };
    if (named.code === 'ESRI_NEIGHBOUR') {
      return new NotFetched(
        'the layer’s server is at a private address or one of the installation’s own, which the API never asks unless the firm lists it.',
      );
    }
    if (named.name === 'TimeoutError' || named.name === 'AbortError') {
      return new NotFetched('the layer’s server didn’t answer in time.');
    }
    return new NotFetched(
      `the layer’s server could not be asked (${typeof named.code === 'string' ? named.code : 'no connection'}).`,
    );
  }
}
