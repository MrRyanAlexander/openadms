// The local stack's map data (REQ-022; ADR-282): one OpenStreetMap extract, read by the routing
// server (Valhalla) and the address server (Nominatim). `pnpm local:up` downloads it once into
// infra/local/.cache/maps/ (git-ignored) and checks it against its pinned SHA-256; a file that
// doesn't match is never used. The extract is dated, so the map's date is known (ARCHITECTURE §3).
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// The built-in extract: Delaware, Geofabrik's dated copy of 1 January 2026 (20 MB). Small enough
// to import on a laptop in minutes; an installation names its own region with the two settings.
export const defaultMapExtract = {
  url: 'https://download.geofabrik.de/north-america/us/delaware-260101.osm.pbf',
  sha256: '08c07f96ad5863a267cb09c0921d9b6dd6904d8b2fe0704f67ec866af11d1888',
} as const;

export type Setting = (key: string) => string | undefined;
export type Download = (url: string, to: string) => Promise<void>;

export class MapExtract {
  readonly url: string;
  readonly sha256: string;
  readonly name: string;
  readonly file: string;

  constructor(url: string, sha256: string, folder: string) {
    this.url = url;
    this.sha256 = sha256;
    this.name = basename(new URL(url).pathname);
    this.file = join(folder, this.name);
  }

  // ADMS_MAP_EXTRACT_URL and ADMS_MAP_EXTRACT_SHA256, both or neither: a download with no hash
  // to check it against is refused.
  static fromSettings(setting: Setting, folder: string): MapExtract {
    const url = setting('ADMS_MAP_EXTRACT_URL');
    const sha256 = setting('ADMS_MAP_EXTRACT_SHA256');
    if (url === undefined && sha256 === undefined) {
      return new MapExtract(defaultMapExtract.url, defaultMapExtract.sha256, folder);
    }
    if (url === undefined || sha256 === undefined) {
      throw new Error(
        'Set ADMS_MAP_EXTRACT_URL and ADMS_MAP_EXTRACT_SHA256 together (shasum -a 256 <file>), or neither.',
      );
    }
    if (!/^https:\/\/.+\.osm\.pbf$/.test(url)) {
      throw new Error('ADMS_MAP_EXTRACT_URL must be an https:// address of an .osm.pbf file.');
    }
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error('ADMS_MAP_EXTRACT_SHA256 must be 64 lowercase hex characters.');
    }
    return new MapExtract(url, sha256, folder);
  }

  // What compose needs to mount the extract and to tell each server which extract it has.
  environment(): Record<string, string> {
    return { ADMS_MAP_FILE: this.file, ADMS_MAP_NAME: this.name, ADMS_MAP_SHA256: this.sha256 };
  }

  // Makes sure the pinned extract is on disk. Returns what it did, for the helper to say.
  async ensure(download: Download = fetchToFile): Promise<'kept' | 'downloaded'> {
    if (existsSync(this.file)) {
      if ((await sha256Of(this.file)) === this.sha256) return 'kept';
      throw new Error(
        `${this.file} doesn't match the pinned SHA-256. Delete it to download it again, or fix ADMS_MAP_EXTRACT_SHA256.`,
      );
    }
    mkdirSync(join(this.file, '..'), { recursive: true });
    const part = `${this.file}.part`;
    rmSync(part, { force: true });
    await download(this.url, part);
    const found = await sha256Of(part);
    if (found !== this.sha256) {
      rmSync(part, { force: true });
      throw new Error(
        `The download of ${this.url} doesn't match the pinned SHA-256 (got ${found}). Nothing was kept.`,
      );
    }
    renameSync(part, this.file);
    return 'downloaded';
  }
}

export async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function fetchToFile(url: string, to: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(900_000) });
      if (!response.ok || response.body === null) {
        throw new Error(`${url} answered ${String(response.status)}`);
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(to));
      return;
    } catch (error) {
      lastError = error;
      rmSync(to, { force: true });
    }
  }
  throw new Error(
    `Couldn't download ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
