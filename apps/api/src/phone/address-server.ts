// What the API asks our own address server (Nominatim) for a phone (ARCHITECTURE §3 "Road
// distance and addresses", §6; spec/acceptance/04-field-capture.md AC-04-24; ADR-098, 111, 119,
// 282, 455): the address of one GPS point, and nothing else. The worker asks the same server for
// the address a mileage starts from (apps/worker/src/mileage/map-servers.ts); what an answer
// says is read by the domain's one rule for both.
//
// The phone never reaches the address server: it asks the API, and the API asks here. So this
// is a request the server makes because a caller asked (OWASP API Security Top 10, API7), and
// an answer taken from another program (API10):
// - **Only the installation's own address server is asked**, at the address the settings name,
//   over HTTPS, its certificate checked. Nothing a caller sends chooses the server, the path or
//   the question: the two coordinates are held to their form again here, where the request is
//   made, and they are all that is put into it.
// - **No answer is followed anywhere:** a redirect is an answer that isn't one, and throws.
// - **The whole exchange has so long and no longer** (`ADDRESS_LOOKUP_ANSWER_SECONDS`), from the
//   connection to the last byte, and the answer may be so large and no larger.
// - **An error here names the server and the path, never the point** (a point is where a
//   private citizen lives): the question's own text is in no message.
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

import { lookedUpAddress, type GpsPoint } from '@open-adms/domain';

export interface AddressServerSettings {
  // The address server's own address: "https://addresses.adms.localhost".
  readonly url: string;
  // The certificate authority it is checked against, as a PEM file; none for the machine's own
  // trust store.
  readonly caFile: string | null;
  // How long one question may take, whole.
  readonly timeoutMs: number;
  // Where the server is when it isn't where its name says: the proxy's own address and port,
  // as the API's container reaches it inside the local stack. The name asked for, and the
  // certificate checked, stay the server's own.
  readonly at?: { readonly host: string; readonly port: number } | undefined;
  // The most bytes an answer may be. One address with its details is about a kibibyte.
  readonly answerBytesAtMost?: number;
}

// Who a lookup asks: the address server, or a test's own.
export interface Addresses {
  // The street number and name at a point; none where the map has no street there. Throws
  // where the server gave no answer that could be read.
  addressOf(point: GpsPoint): Promise<string | null>;
}

const answerBytesAtMost = 64 * 1024;
const coordinate = /^-?\d{1,3}(\.\d{1,8})?$/;

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

export class AddressServer implements Addresses {
  private readonly settings: AddressServerSettings;
  private readonly ca: Buffer | undefined;

  constructor(settings: AddressServerSettings) {
    if (new URL(settings.url).protocol !== 'https:') {
      throw new Error('The address server is asked over HTTPS only.');
    }
    if (settings.at !== undefined && isIP(settings.at.host) === 0) {
      throw new Error('Where the address server is is an IP address and a port.');
    }
    this.settings = settings;
    this.ca = settings.caFile === null ? undefined : readFileSync(settings.caFile);
  }

  async addressOf(point: GpsPoint): Promise<string | null> {
    if (!coordinate.test(point.latitude) || !coordinate.test(point.longitude)) {
      throw new Error('A point is two exact decimals.');
    }
    const { status, text } = await this.ask(
      `/reverse?lat=${point.latitude}&lon=${point.longitude}&format=jsonv2&zoom=18`,
    );
    if (status !== 200) {
      throw new Error(`The address server answered ${String(status)} to /reverse.`);
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("The address server didn't answer /reverse in JSON.");
    }
    return lookedUpAddress(body);
  }

  private ask(path: string): Promise<{ status: number; text: string }> {
    const url = new URL(path, this.settings.url);
    const { at } = this.settings;
    const most = this.settings.answerBytesAtMost ?? answerBytesAtMost;
    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'GET',
          headers: { accept: 'application/json' },
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
              reject(new Error('The address server answered more than an address is.'));
              res.destroy();
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            if (over) return;
            resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') });
          });
          res.on('error', (error) => {
            reject(unasked(error));
          });
        },
      );
      req.on('error', (error) => {
        reject(unasked(error));
      });
      req.end();
    });
  }
}

// An error of this file's own wording: Node's may quote the request's address, point and all.
const unasked = (error: Error): Error =>
  error.name === 'TimeoutError' || error.name === 'AbortError'
    ? new Error("The address server didn't answer /reverse in time.")
    : new Error(`The address server could not be asked (${error.name}).`);
