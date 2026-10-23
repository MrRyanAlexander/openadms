// A firm's server as infra/server/compose.yaml defines it (the user, 2026-10-23; ARCHITECTURE §4;
// OWASP ASVS 5.0 4.2.1): every container hardened as the local stack's are, each departure named
// here with its reason; nothing reachable from outside but Caddy; each service's secrets in its
// own volume, read-only; lean logs. Read as compose itself reads the file (`docker compose
// config`), so it needs Docker, not the server running. A service this list doesn't name fails
// the test until it is added to it.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const server = join(dirname(fileURLToPath(import.meta.url)), '../../../infra/server');

interface Mount {
  readonly type: string;
  readonly source?: string;
  readonly target: string;
  readonly read_only?: boolean;
}
interface Service {
  readonly user?: string;
  readonly cap_drop?: readonly string[];
  readonly cap_add?: readonly string[];
  readonly read_only?: boolean;
  readonly security_opt?: readonly string[];
  readonly ports?: readonly { readonly target: number }[];
  readonly environment?: Readonly<Record<string, string>>;
  readonly volumes?: readonly Mount[];
  readonly network_mode?: string;
}

function services(): Readonly<Record<string, Service>> {
  const read = spawnSync(
    'docker',
    [
      'compose',
      '--project-directory',
      server,
      '--file',
      join(server, 'compose.yaml'),
      '--profile',
      'setup',
      'config',
      '--format',
      'json',
    ],
    { encoding: 'utf8' },
  );
  if (read.status !== 0) throw new Error(`docker compose config failed: ${read.stderr}`);
  return (JSON.parse(read.stdout) as { services: Record<string, Service> }).services;
}

// Each service's departures from the full hardening, and why.
const departures: Readonly<
  Record<
    string,
    { readonly root?: string; readonly writable?: string; readonly caps?: readonly string[] }
  >
> = {
  postgres: {},
  objectstore: {},
  'objectstore-tls': { caps: ['NET_BIND_SERVICE'] },
  // The image has no user but root, which owns its data volume; no capability.
  routing: { root: 'Valhalla’s image has no other user' },
  'routing-tls': { caps: ['NET_BIND_SERVICE'] },
  addresses: {
    root: 'its own start script changes user with sudo (the local stack’s compose file)',
    writable: 'the script writes its Postgres’s settings and its logs under / on every start',
    caps: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETUID', 'SETGID', 'KILL'],
  },
  api: {},
  worker: {},
  caddy: { caps: ['NET_BIND_SERVICE'] },
  // On demand only: it makes and places every service's secrets, each owned by that service's user.
  setup: {
    root: 'it owns each secret to the user of the service that reads it',
    writable: 'it writes the installation’s secrets and settings',
    caps: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER'],
  },
};

describe('a firm’s server (infra/server/compose.yaml)', () => {
  const all = services();

  it('names every service, and only those', () => {
    expect(Object.keys(all).sort()).toEqual(Object.keys(departures).sort());
  });

  for (const [name, departure] of Object.entries(departures)) {
    it(`${name}: hardened as far as its image allows`, () => {
      const service = all[name];
      if (service === undefined) throw new Error(`No service ${name}.`);
      expect(service.cap_drop).toEqual(['ALL']);
      expect([...(service.cap_add ?? [])].sort()).toEqual([...(departure.caps ?? [])].sort());
      if (departure.root === undefined) expect(service.user).not.toMatch(/^0(:|$)/);
      if (departure.writable === undefined) expect(service.read_only).toBe(true);
      if (name !== 'addresses') expect(service.security_opt).toContain('no-new-privileges:true');
    });
  }

  it('publishes Caddy’s two ports alone: nothing else is reachable from outside', () => {
    const published = Object.entries(all).filter(([, service]) => (service.ports ?? []).length > 0);
    expect(published.map(([name]) => name)).toEqual(['caddy']);
    expect(all['caddy']?.ports?.map((port) => port.target).sort()).toEqual([443, 80]);
  });

  it('mounts each service’s own secrets read-only, and every volume of secrets only in the setup beside', () => {
    const secretVolumes = new Map<string, string[]>();
    for (const [name, service] of Object.entries(all)) {
      for (const mount of service.volumes ?? []) {
        if (mount.type !== 'volume' || !(mount.source ?? '').endsWith('_secrets')) continue;
        if (name !== 'setup') expect(mount.read_only, `${name} ${mount.target}`).toBe(true);
        secretVolumes.set(mount.source ?? '', [
          ...(secretVolumes.get(mount.source ?? '') ?? []),
          name,
        ]);
      }
    }
    expect(
      Object.fromEntries([...secretVolumes].map(([volume, names]) => [volume, names.sort()])),
    ).toEqual({
      addresses_secrets: ['addresses', 'setup'],
      api_secrets: ['api', 'setup'],
      caddy_secrets: ['caddy', 'setup'],
      objectstore_secrets: ['objectstore', 'objectstore-tls', 'setup'],
      postgres_secrets: ['postgres', 'setup'],
      routing_secrets: ['routing-tls', 'setup'],
      worker_secrets: ['setup', 'worker'],
    });
  });

  it('runs the API and the worker lean: production, warnings and errors in the log', () => {
    for (const name of ['api', 'worker']) {
      expect(all[name]?.environment?.['NODE_ENV']).toBe('production');
      expect(all[name]?.environment?.['ADMS_LOG_LEVEL']).toBe('warn');
    }
  });
});
