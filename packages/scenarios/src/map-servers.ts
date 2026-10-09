// The local stack's map servers, as a story's worker asks them (ADR-282, 349): the routing and
// address servers behind Caddy, over HTTPS, checked against the stack's own certificate
// authority. The map extract's SHA-256 is the one the stack was started with: the pinned
// extract's (infra/local/src/map-extract.ts), unless the stack's settings name another.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import type { MapServerSettings } from '@open-adms/worker';

const root = new URL('../../../', import.meta.url);
const pinnedExtractSha256 = '08c07f96ad5863a267cb09c0921d9b6dd6904d8b2fe0704f67ec866af11d1888';

export function localMapServers(): MapServerSettings {
  const caFile = fileURLToPath(new URL('infra/local/.generated/caddy-root.crt', root));
  if (!existsSync(caFile)) {
    throw new Error('A story that asks the map servers needs the local stack: `pnpm local:up`.');
  }
  const stackEnv = new URL('infra/local/.env', root);
  const settings = existsSync(stackEnv) ? parseEnv(readFileSync(stackEnv, 'utf8')) : {};
  const port = settings['ADMS_HTTPS_PORT'] ?? '443';
  return {
    routing: `https://routing.adms.localhost:${port}`,
    addresses: `https://addresses.adms.localhost:${port}`,
    caFile,
    mapDataSha256: settings['ADMS_MAP_EXTRACT_SHA256'] ?? pinnedExtractSha256,
    timeoutMs: 30_000,
  };
}
