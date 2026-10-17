// The object store the API keeps files in (ARCHITECTURE §6 "Uploads", §11; spec/acceptance/
// 10-api-and-sync.md AC-10-49; spec/THREAT-MODEL.md T-25; ADR-101, 263, 479, 480): any
// S3-compatible store, asked through the vendor's own client. One immutable object per file.
//
// What this class holds itself to, whatever the store would allow:
// - **A file is kept once and never again.** A put is made only on the condition that nothing
//   is there (`If-None-Match: *`): where something is, the store refuses and the first file
//   stands. This class has no call that deletes, moves, copies or lists.
// - **The API's identity at the store is the least it can be** (`infra/local/compose.yaml`): it
//   may put and get an object in the one bucket. The bucket keeps every version besides, so a
//   put this class never makes would still lose nothing.
// - **Only the installation's own store is asked**, at the address the settings name, over
//   HTTPS, its certificate checked. Nothing a caller sends chooses the server or the bucket; a
//   key is held to its form here, where the request is made.
// - **One question has so long and no longer** (`MEDIA_STORE_ANSWER_SECONDS`), and a file read
//   back may be so large and no larger: the caller says how large.
// - **An error here says what was asked and how the store answered, by its status or its
//   error's name.** Never the key, the bucket, the identity or the store's own words.
import { readFileSync } from 'node:fs';
import type { ClientRequestArgs } from 'node:http';
import { Agent } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable, type Duplex } from 'node:stream';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';

export interface MediaStoreSettings {
  // The store's own address: "https://s3.adms.localhost".
  readonly url: string;
  readonly bucket: string;
  // The region its requests are signed for.
  readonly region: string;
  // The API's own identity there.
  readonly accessKey: string;
  readonly secretKey: string;
  // The certificate authority it is checked against, as a PEM file; none for the machine's own
  // trust store.
  readonly caFile: string | null;
  // Where the store is when it isn't where its name says: the proxy's own address and port, as
  // the API's container reaches it inside the local stack. The name asked for, and the
  // certificate checked, stay the store's own.
  readonly at?: { readonly host: string; readonly port: number } | undefined;
  // How long one question may take, whole.
  readonly timeoutMs: number;
}

export interface KeptFile {
  readonly bytes: Buffer;
  // What the file was said to be when it was kept.
  readonly contentType: string;
}

// Who keeps the files: the object store, or a test's own.
export interface Media {
  // Keeps a file under a key nothing is kept under yet. Where something already is, nothing
  // is changed and the answer says so: the file there is the one that stands.
  keep(key: string, bytes: Uint8Array, contentType: string): Promise<'KEPT' | 'ALREADY_THERE'>;
  // How many bytes are kept under a key; none where nothing is.
  sizeOf(key: string): Promise<number | null>;
  // The file kept under a key, as the bytes that were stored; none where nothing is. Throws
  // where it is larger than the caller will take.
  read(key: string, bytesAtMost: number): Promise<KeptFile | null>;
}

// The store gave no answer that could be used. Its message names what was asked and the
// store's status or its error's name, nothing else.
export class MediaStoreProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaStoreProblem';
  }
}

type Asked = 'a put' | 'a question of size' | 'a read';

// Path segments of lower-case letters, digits, dots, hyphens and underscores, each beginning
// with a letter or a digit: no empty segment, no "..", nothing a path could be climbed by.
const key = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/;
const keyCharactersAtMost = 512;

// Whether a name is a file's place this class takes: the form above, and no longer.
export const isMediaKey = (named: string): boolean =>
  named.length <= keyCharactersAtMost && key.test(named);
// A media type, bare: a type and a subtype, no parameters, nothing a header could be made of.
const mediaType = /^[a-z0-9][a-z0-9.+-]{0,62}\/[a-z0-9][a-z0-9.+-]{0,62}$/;

// Answers every name with one address.
const always =
  (address: string): LookupFunction =>
  (_hostname, options, callback) => {
    const family = isIP(address) === 6 ? 6 : 4;
    if (options.all === true) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };

// Connects to one address and port, whatever name is asked for: the name still goes to the
// server (SNI, Host) and is the name its certificate is checked for.
class AgentAt extends Agent {
  private readonly at: { readonly host: string; readonly port: number };

  constructor(ca: Buffer | undefined, at: { readonly host: string; readonly port: number }) {
    super({ ca, keepAlive: true });
    this.at = at;
  }

  override createConnection(
    options: ClientRequestArgs,
    callback?: (error: Error | null, stream: Duplex) => void,
  ): Duplex | null | undefined {
    return super.createConnection({ ...options, host: this.at.host, port: this.at.port }, callback);
  }
}

export class MediaStore implements Media {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly timeoutMs: number;

  constructor(settings: MediaStoreSettings) {
    const url = new URL(settings.url);
    if (url.protocol !== 'https:') {
      throw new Error('The object store is asked over HTTPS only.');
    }
    if (settings.at !== undefined && isIP(settings.at.host) === 0) {
      throw new Error('Where the object store is is an IP address and a port.');
    }
    const ca = settings.caFile === null ? undefined : readFileSync(settings.caFile);
    const agent =
      settings.at !== undefined
        ? new AgentAt(ca, settings.at)
        : new Agent({
            ca,
            keepAlive: true,
            // A name under .localhost is this machine (RFC 6761); not every resolver knows.
            ...(url.hostname.endsWith('.localhost') ? { lookup: always('127.0.0.1') } : {}),
          });
    this.bucket = settings.bucket;
    this.timeoutMs = settings.timeoutMs;
    this.client = new S3Client({
      endpoint: settings.url,
      region: settings.region,
      // The bucket in the path, never in the server's name: the one form every store takes.
      forcePathStyle: true,
      credentials: { accessKeyId: settings.accessKey, secretAccessKey: settings.secretKey },
      // No checksum of the client's own choosing rides on a request: not every store takes
      // one. What a file must be is checked by the API against its fingerprint (ADR-101).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: new NodeHttpHandler({
        httpsAgent: agent,
        connectionTimeout: settings.timeoutMs,
        requestTimeout: settings.timeoutMs,
        throwOnRequestTimeout: true,
      }),
    });
  }

  async keep(
    named: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<'KEPT' | 'ALREADY_THERE'> {
    MediaStore.held(named);
    if (!mediaType.test(contentType)) throw new Error('A file’s type is a bare media type.');
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: named,
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentType: contentType,
          // Only where nothing is kept under the key yet.
          IfNoneMatch: '*',
        }),
        this.within(),
      );
      return 'KEPT';
    } catch (error) {
      if (MediaStore.statusOf(error) === 412) return 'ALREADY_THERE';
      throw MediaStore.problem('a put', error);
    }
  }

  async sizeOf(named: string): Promise<number | null> {
    MediaStore.held(named);
    try {
      const answer = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: named }),
        this.within(),
      );
      if (answer.ContentLength === undefined) {
        throw new MediaStoreProblem('The object store didn’t say how large a file is.');
      }
      return answer.ContentLength;
    } catch (error) {
      if (MediaStore.statusOf(error) === 404) return null;
      throw MediaStore.problem('a question of size', error);
    }
  }

  async read(named: string, bytesAtMost: number): Promise<KeptFile | null> {
    MediaStore.held(named);
    try {
      const answer = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: named }),
        this.within(),
      );
      const body = answer.Body;
      if (body === undefined) throw new MediaStoreProblem('The object store answered no file.');
      if (answer.ContentLength === undefined || answer.ContentLength > bytesAtMost) {
        // Never read: its connection is given up with the file still on it.
        if (body instanceof Readable) body.destroy();
        throw new MediaStoreProblem('The object store holds a larger file than was asked for.');
      }
      const bytes = Buffer.from(await body.transformToByteArray());
      if (bytes.byteLength !== answer.ContentLength) {
        throw new MediaStoreProblem('The object store answered a file cut short.');
      }
      return { bytes, contentType: answer.ContentType ?? 'application/octet-stream' };
    } catch (error) {
      if (MediaStore.statusOf(error) === 404) return null;
      throw MediaStore.problem('a read', error);
    }
  }

  // Closes its connections; the process's to call when it stops.
  close(): void {
    this.client.destroy();
  }

  // The whole exchange, not only a quiet stretch of it.
  private within(): { abortSignal: AbortSignal } {
    return { abortSignal: AbortSignal.timeout(this.timeoutMs) };
  }

  private static held(named: string): void {
    if (!isMediaKey(named)) {
      throw new Error('A file’s place in the object store isn’t one.');
    }
  }

  private static statusOf(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('$metadata' in error)) return undefined;
    const metadata = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata;
    return typeof metadata?.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined;
  }

  private static problem(asked: Asked, error: unknown): MediaStoreProblem {
    if (error instanceof MediaStoreProblem) return error;
    const status = MediaStore.statusOf(error);
    if (status !== undefined) {
      return new MediaStoreProblem(`The object store answered ${String(status)} to ${asked}.`);
    }
    // Only an error's name: its message may hold an address, and never holds anything needed.
    const name = error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : '';
    return new MediaStoreProblem(
      `The object store gave no answer to ${asked}${name === '' ? '' : ` (${name})`}.`,
    );
  }
}
