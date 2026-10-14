// The worker's own container in the local stack (ARCHITECTURE §4, §13; acceptance file 10,
// AC-10-32's worker half; ADR-419): it answers its health check from inside and publishes no
// port; its log is one JSON object a line and holds none of its settings; and from in there it
// reaches both map servers by their own names, over HTTPS, checked against the stack's
// certificate authority. **Needs `pnpm local:up` after `pnpm installer`**, and says so.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const repository = new URL('../../../', import.meta.url);

function docker(args: string[]): { status: number | null; stdout: string } {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout };
}
const compose = (args: string[]) =>
  docker(['compose', '--project-name', 'open-adms-local', '--profile', 'worker', ...args]);
// A script run by the container's own Node, beside the worker's process.
const inside = (script: string) => compose(['exec', '--no-TTY', 'worker', 'node', '-e', script]);

beforeAll(() => {
  const id = compose(['ps', '--quiet', 'worker']).stdout.trim();
  if (id === '') {
    throw new Error(
      'The worker’s container is not running: `pnpm local:up` after `pnpm installer` starts it.',
    );
  }
});

describe('the worker’s container', () => {
  it('answers its health check from inside, and publishes no port', () => {
    const asked = inside(
      "fetch('http://127.0.0.1:3001/health').then(async (r) => { console.log(String(r.status) + ' ' + (await r.text())); })",
    );
    expect(asked.stdout.trim()).toMatch(
      /^200 \{"status":"ok","jobsWaiting":\d+,"jobsSetAside":\d+,"oldestJobWaitingSeconds":\d+\}$/,
    );
    const id = compose(['ps', '--quiet', 'worker']).stdout.trim();
    expect(docker(['port', id]).stdout.trim()).toBe('');
  });

  it('AC-10-32: its log is one JSON object a line, says it started, and holds none of its settings', () => {
    const log = compose(['logs', '--no-log-prefix', '--no-color', 'worker']).stdout;
    const lines = log.trim().split('\n');
    const parsed = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(parsed.every((line) => line['service'] === 'worker')).toBe(true);
    expect(parsed.some((line) => line['msg'] === 'The worker started.')).toBe(true);
    // Each value is read here and never printed.
    const settings = parseEnv(
      readFileSync(fileURLToPath(new URL('apps/worker/.env', repository)), 'utf8'),
    );
    const held = Object.entries(settings)
      .filter(([, value]) => value !== undefined && value.length >= 8)
      .filter(([, value]) => log.includes(value ?? ''))
      .map(([key]) => key);
    expect(held).toEqual([]);
    for (const never of ['postgresql://', 'postgres://', 'password']) {
      expect(log, never).not.toContain(never);
    }
  });

  it('reaches both map servers by their own names over HTTPS, at the proxy’s address inside the stack', () => {
    const asked = inside(
      [
        "import('/srv/open-adms/apps/worker/dist/index.js').then(async (worker) => {",
        '  const maps = new worker.MapServers({',
        "    routing: 'https://routing.adms.localhost',",
        "    addresses: 'https://addresses.adms.localhost',",
        '    caFile: process.env.ADMS_MAP_CA_FILE,',
        '    mapDataSha256: process.env.ADMS_MAP_EXTRACT_SHA256,',
        '    timeoutMs: 10000,',
        "    at: { host: '172.30.213.2', port: 443 },",
        '  });',
        '  const data = await maps.mapData();',
        "  const road = await maps.nearestRoad({ latitude: '39.15700000', longitude: '-75.52400000' });",
        '  console.log(JSON.stringify({ date: data.date, sha256: data.sha256.length, road: road !== null }));',
        '});',
      ].join('\n'),
    );
    expect(asked.status).toBe(0);
    expect(JSON.parse(asked.stdout)).toEqual({ date: '2026-01-01', sha256: 64, road: true });
  });
});
