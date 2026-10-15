// The local stack as compose.yaml defines it (ARCHITECTURE §4; OWASP ASVS 5.0 4.2.1, 12.3.3;
// KD-78, KD-79; ADR-517): every container hardened as far as its image allows, each departure
// named here with its reason, and every hop over TLS. Read as compose itself reads the file
// (`docker compose config`), so an anchor or a default can't hide anything; it needs Docker, not
// the stack running. A service this list doesn't name fails the test until it is added to it.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stack = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Port {
  readonly host_ip?: string;
}
interface Service {
  readonly image: string;
  readonly user?: string;
  readonly cap_drop?: readonly string[];
  readonly cap_add?: readonly string[];
  readonly read_only?: boolean;
  readonly security_opt?: readonly string[];
  readonly ports?: readonly Port[];
  readonly command?: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
  readonly network_mode?: string;
}

function services(): Readonly<Record<string, Service>> {
  const read = spawnSync(
    'docker',
    [
      'compose',
      '--project-directory',
      stack,
      '--file',
      join(stack, 'compose.yaml'),
      '--profile',
      'api',
      '--profile',
      'worker',
      'config',
      '--format',
      'json',
    ],
    {
      encoding: 'utf8',
      // What `pnpm local:up` tells compose of the map extract: here, made up.
      env: {
        ...process.env,
        ADMS_MAP_NAME: 'made-up.osm.pbf',
        ADMS_MAP_SHA256: '0'.repeat(64),
        ADMS_MAP_FILE: '/dev/null',
      },
    },
  );
  if (read.status !== 0) throw new Error(`docker compose config failed: ${read.stderr}`);
  return (JSON.parse(read.stdout) as { services: Record<string, Service> }).services;
}

// What every container is held to: no capability, a read-only root filesystem, an unprivileged
// user, no new privileges, an image pinned by digest. Each departure, and why.
interface Hardening {
  readonly user: string | undefined;
  readonly capAdd: readonly string[];
  readonly readOnly: boolean;
  readonly noNewPrivileges: boolean;
}
const whyNetBind =
  'the image’s caddy binary carries the file capability to bind a low port, and the kernel refuses to start a binary whose file capability isn’t in the bounding set; an unprivileged user under no-new-privileges never holds it';
const expected: Readonly<Record<string, Hardening & { readonly why?: string }>> = {
  postgres: { user: '999:999', capAdd: [], readOnly: true, noNewPrivileges: true },
  objectstore: { user: '1000:1000', capAdd: [], readOnly: true, noNewPrivileges: true },
  'objectstore-tls': {
    user: '1000:1000',
    capAdd: ['NET_BIND_SERVICE'],
    readOnly: true,
    noNewPrivileges: true,
    why: whyNetBind,
  },
  mail: { user: '65534:65534', capAdd: [], readOnly: true, noNewPrivileges: true },
  routing: {
    user: '0:0',
    capAdd: [],
    readOnly: true,
    noNewPrivileges: true,
    why: 'the image has no user but root, which owns its data volume; it holds no capability',
  },
  'routing-tls': {
    user: '1000:1000',
    capAdd: ['NET_BIND_SERVICE'],
    readOnly: true,
    noNewPrivileges: true,
    why: whyNetBind,
  },
  addresses: {
    user: undefined,
    capAdd: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'KILL', 'SETGID', 'SETUID'],
    readOnly: false,
    noNewPrivileges: false,
    why: 'the image’s start script runs as root, changes user with sudo (setuid) for its own Postgres and for Nominatim, and writes its settings, logs and website under / on every start',
  },
  api: { user: '1000:1000', capAdd: [], readOnly: true, noNewPrivileges: true },
  worker: { user: '1000:1000', capAdd: [], readOnly: true, noNewPrivileges: true },
  caddy: {
    user: '1000:1000',
    capAdd: ['NET_BIND_SERVICE'],
    readOnly: true,
    noNewPrivileges: true,
    why: whyNetBind,
  },
};

describe('every container, hardened as far as its image allows (ASVS 5.0 4.2.1; KD-79)', () => {
  const defined = services();

  it('is one this list names: a new service is hardened, or its departure named, before it runs', () => {
    expect(Object.keys(defined).sort()).toEqual(Object.keys(expected).sort());
  });

  it.each(Object.entries(expected))('%s', (name, hardening) => {
    const service = defined[name];
    if (service === undefined) throw new Error(`compose.yaml has no ${name}.`);
    expect(service.image, 'pinned by digest').toMatch(/^[^@\s]+:[^@\s]+@sha256:[0-9a-f]{64}$/);
    expect(service.cap_drop, 'every capability dropped').toEqual(['ALL']);
    expect([...(service.cap_add ?? [])].sort(), 'capabilities kept').toEqual(hardening.capAdd);
    expect(service.read_only ?? false, 'a read-only root filesystem').toBe(hardening.readOnly);
    expect(
      (service.security_opt ?? []).includes('no-new-privileges:true'),
      'no new privileges',
    ).toBe(hardening.noNewPrivileges);
    expect(service.user, 'its user').toBe(hardening.user);
    // Root only where the image allows nothing else, and then said why.
    const root = hardening.user === undefined || hardening.user.startsWith('0:');
    expect(root && hardening.why === undefined, 'root with no reason named').toBe(false);
    // A published port is this machine's loopback alone.
    for (const port of service.ports ?? []) expect(port.host_ip).toBe('127.0.0.1');
  });
});

describe('every hop over TLS (ASVS 5.0 12.3.3; KD-78)', () => {
  const defined = services();
  const environment = (name: string): Readonly<Record<string, string>> =>
    defined[name]?.environment ?? {};
  const text = (relative: string): string => readFileSync(join(stack, relative), 'utf8');

  it('Postgres takes TLS alone: its own certificate, and every login over TCP `hostssl`', () => {
    const command = defined['postgres']?.command ?? [];
    for (const setting of [
      'ssl=on',
      'ssl_cert_file=/run/adms/tls/postgres.crt',
      'ssl_key_file=/run/adms/tls/postgres.key',
      'ssl_min_protocol_version=TLSv1.2',
      'hba_file=/etc/adms/pg_hba.conf',
    ]) {
      expect(command).toContain(setting);
    }
    const rules = text('postgres/pg_hba.conf')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
      .map((line) => line.split(/\s+/));
    expect(rules.map(([kind]) => kind)).toEqual(['local', 'hostssl']);
    expect(rules[1]).toEqual(['hostssl', 'all', 'all', 'all', 'scram-sha-256']);
  });

  it('the API serves HTTPS with its own certificate, and the API and the worker check the database’s and the mail catcher’s against the stack’s root', () => {
    expect(environment('api')).toMatchObject({
      ADMS_API_TLS_CERT_FILE: '/run/adms/tls/api.crt',
      ADMS_API_TLS_KEY_FILE: '/run/adms/tls/api.key',
      ADMS_DATABASE_CA_FILE: '/run/adms/tls/root.crt',
      ADMS_SMTP_CA_FILE: '/run/adms/tls/root.crt',
      ADMS_MAP_CA_FILE: '/run/adms/tls/root.crt',
      ADMS_MEDIA_CA_FILE: '/run/adms/tls/root.crt',
    });
    expect(environment('worker')).toMatchObject({
      ADMS_DATABASE_CA_FILE: '/run/adms/tls/root.crt',
      ADMS_MAP_CA_FILE: '/run/adms/tls/root.crt',
    });
  });

  it('the mail catcher takes mail only after STARTTLS, and serves its inbox over HTTPS', () => {
    expect(environment('mail')).toMatchObject({
      MP_SMTP_TLS_CERT: '/run/adms/tls/mail.crt',
      MP_SMTP_TLS_KEY: '/run/adms/tls/mail.key',
      MP_SMTP_REQUIRE_STARTTLS: 'true',
      MP_UI_TLS_CERT: '/run/adms/tls/mail.crt',
      MP_UI_TLS_KEY: '/run/adms/tls/mail.key',
    });
  });

  it('the address server serves TLS with its own certificate', () => {
    expect(environment('addresses')['GUNICORN_CMD_ARGS']).toBe(
      '--certfile=/run/adms/tls/addresses.crt --keyfile=/run/adms/tls/addresses.key',
    );
  });

  it('the routing server listens on its own loopback alone, and its own Caddy takes TLS for it', () => {
    const start = text('routing/start.sh');
    expect(start).toContain("--httpd-service-listen 'tcp://127.0.0.1:8002'");
    expect(start).not.toMatch(/tcp:\/\/\*:/);
    const sidecar = text('routing/Caddyfile');
    expect(sidecar).toContain('tls /run/adms/tls/routing.crt /run/adms/tls/routing.key');
    expect(sidecar).toContain('reverse_proxy 127.0.0.1:8002');
  });

  it('the object store’s servers, S3 among them, listen on its own loopback alone, and its own Caddy takes TLS for S3 (ADR-525)', () => {
    const command = defined['objectstore']?.command ?? [];
    // `server`, the one command that binds S3 apart from the rest; never `mini`, whose admin
    // server's gRPC listens on every interface whatever it is told.
    expect(command[0]).toBe('server');
    expect(command).toEqual(
      expect.arrayContaining(['-ip=127.0.0.1', '-ip.bind=127.0.0.1', '-s3', '-s3.port=8334']),
    );
    // Nothing of it bound anywhere else, nor a gateway no hop of ours uses.
    for (const setting of command) {
      expect(setting).not.toMatch(/^-(s3\.)?ip\.bind=(?!127\.0\.0\.1$)/);
      expect(setting).not.toMatch(/^-(webdav|sftp|iam|mq\.broker|mq\.agent|debug)(=true)?$/);
      expect(setting).not.toMatch(/metricsPort=/);
    }
    expect(defined['objectstore']?.ports ?? []).toEqual([]);
    expect(defined['objectstore-tls']?.network_mode).toBe('service:objectstore');
    const sidecar = text('objectstore/Caddyfile');
    expect(sidecar).toContain('tls /run/adms/tls/objectstore.crt /run/adms/tls/objectstore.key');
    expect(sidecar).toContain('https://:8333 {');
    expect(sidecar.match(/reverse_proxy /g)).toEqual(['reverse_proxy ']);
    expect(sidecar).toContain('reverse_proxy 127.0.0.1:8334');
    // The forwarded name a signature is checked against is taken from the stack's proxy alone.
    expect(sidecar).toContain('trusted_proxies static 172.30.213.2/32');
    expect(environment('api')['ADMS_TRUSTED_PROXIES']).toBe('172.30.213.2');
  });

  it('Caddy reaches every service over TLS, each certificate checked against the stack’s root and its one name', () => {
    const caddyfile = text('Caddyfile');
    const proxies = [
      ...caddyfile.matchAll(/reverse_proxy (\S+) \{\n\t\timport upstream_tls (\S+)\n/g),
    ];
    expect(proxies.map(([, to, name]) => [to, name])).toEqual([
      ['api:3000', 'api'],
      ['host.docker.internal:3180', 'host.docker.internal'],
      ['objectstore:8333', 'objectstore'],
      ['mail:8025', 'mail'],
      ['routing:8443', 'routing'],
      ['addresses:8080', 'addresses'],
    ]);
    // Every reverse_proxy is one of those: none plain.
    expect(caddyfile.match(/reverse_proxy /g)).toHaveLength(proxies.length);
    expect(caddyfile).toContain(
      '(upstream_tls) {\n\ttransport http {\n\t\ttls\n\t\ttls_trust_pool file /run/adms/tls/root.crt\n\t\ttls_server_name {args[0]}\n',
    );
    expect(caddyfile).not.toMatch(/insecure|skip_verify/);
  });
});
