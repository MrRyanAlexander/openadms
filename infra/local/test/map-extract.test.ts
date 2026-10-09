// The map extract's rules (REQ-022; ADR-282): it is named by a URL and a SHA-256 together, and a
// file that doesn't match its pinned hash is never used.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { defaultMapExtract, MapExtract, sha256Of } from '../src/map-extract.ts';

const scratch = mkdtempSync(join(tmpdir(), 'adms-map-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const folder = (): string => mkdtempSync(join(scratch, 'maps-'));
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const settings =
  (values: Record<string, string>) =>
  (key: string): string | undefined =>
    values[key];
const url = 'https://maps.example/bayline-261012.osm.pbf';

describe('which extract the local stack uses', () => {
  it('is the built-in one when nothing is set: a dated file and its hash', () => {
    const extract = MapExtract.fromSettings(settings({}), '/maps');
    expect(extract.url).toBe(defaultMapExtract.url);
    expect(extract.sha256).toBe(defaultMapExtract.sha256);
    expect(extract.name).toBe('delaware-260101.osm.pbf');
    expect(extract.environment()).toEqual({
      ADMS_MAP_FILE: '/maps/delaware-260101.osm.pbf',
      ADMS_MAP_NAME: 'delaware-260101.osm.pbf',
      ADMS_MAP_SHA256: defaultMapExtract.sha256,
    });
  });

  it("is the installation's own when both settings are given", () => {
    const extract = MapExtract.fromSettings(
      settings({ ADMS_MAP_EXTRACT_URL: url, ADMS_MAP_EXTRACT_SHA256: sha256('x') }),
      '/maps',
    );
    expect(extract.name).toBe('bayline-261012.osm.pbf');
    expect(extract.sha256).toBe(sha256('x'));
  });

  it.each([
    ['a URL with no hash', { ADMS_MAP_EXTRACT_URL: url }, 'together'],
    ['a hash with no URL', { ADMS_MAP_EXTRACT_SHA256: sha256('x') }, 'together'],
    [
      'plain http',
      {
        ADMS_MAP_EXTRACT_URL: 'http://maps.example/a.osm.pbf',
        ADMS_MAP_EXTRACT_SHA256: sha256('x'),
      },
      'https://',
    ],
    [
      'a file that is not an extract',
      { ADMS_MAP_EXTRACT_URL: 'https://maps.example/a.zip', ADMS_MAP_EXTRACT_SHA256: sha256('x') },
      '.osm.pbf',
    ],
    [
      'a hash of the wrong shape',
      { ADMS_MAP_EXTRACT_URL: url, ADMS_MAP_EXTRACT_SHA256: 'ABC123' },
      '64 lowercase hex',
    ],
  ])('refuses %s', (_what, values, message) => {
    expect(() => MapExtract.fromSettings(settings(values), '/maps')).toThrow(message);
  });
});

describe('fetching the extract', () => {
  const download =
    (content: string) =>
    (_from: string, to: string): Promise<void> => {
      writeFileSync(to, content);
      return Promise.resolve();
    };
  const never = (): Promise<void> => Promise.reject(new Error('must not download'));

  it('downloads it once, checks its hash and keeps it', async () => {
    const extract = new MapExtract(url, sha256('roads'), folder());
    expect(await extract.ensure(download('roads'))).toBe('downloaded');
    expect(await sha256Of(extract.file)).toBe(sha256('roads'));
    expect(existsSync(`${extract.file}.part`)).toBe(false);
    // The second time nothing is downloaded: the file on disk is checked and kept.
    expect(await extract.ensure(never)).toBe('kept');
  });

  it("keeps nothing from a download that doesn't match its pinned hash", async () => {
    const maps = folder();
    const extract = new MapExtract(url, sha256('roads'), maps);
    await expect(extract.ensure(download('something else'))).rejects.toThrow('pinned SHA-256');
    expect(readdirSync(maps)).toEqual([]);
  });

  it("refuses a file on disk that doesn't match, without replacing it", async () => {
    const extract = new MapExtract(url, sha256('roads'), folder());
    writeFileSync(extract.file, 'tampered');
    await expect(extract.ensure(never)).rejects.toThrow("doesn't match the pinned SHA-256");
    expect(await sha256Of(extract.file)).toBe(sha256('tampered'));
  });
});
