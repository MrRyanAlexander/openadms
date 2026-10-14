// The API's settings (ARCHITECTURE §4, Secrets; acceptance file 10, AC-10-55; ADR-385): read once
// and checked; a missing or malformed one stops the start and names its key, never its value.
// These need no stack; the last two start the built process itself (apps/api/dist/main.js).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { builtInPolicy, installationPolicy } from '../src/policy.ts';
import { Settings, SettingsProblem } from '../src/process/settings.ts';

// Made-up values, this test's own; a login's URL is put together here so that no file holds one.
const word = ['made', 'up', 'for', 'this', 'test'].join('-');
// Every login asks TLS alone, its server's certificate and name checked (KD-78; ADR-517).
const tls = '?sslmode=verify-full';
const urlOf = (login: string) => `postgresql://${login}:${word}@127.0.0.1:55432/adms${tls}`;
// The files a setting names: made up, each holding what its setting asks for and no more.
const files = mkdtempSync(join(tmpdir(), 'adms-api-files-'));
const certFile = join(files, 'api.crt');
const keyFile = join(files, 'api.key');
writeFileSync(certFile, '-----BEGIN CERTIFICATE-----\nmade up\n-----END CERTIFICATE-----\n');
writeFileSync(keyFile, '-----BEGIN PRIVATE KEY-----\nmade up\n-----END PRIVATE KEY-----\n', {
  mode: 0o600,
});
afterAll(() => {
  rmSync(files, { recursive: true, force: true });
});
const good: Record<string, string> = {
  DATABASE_URL: urlOf('adms_api'),
  READONLY_DATABASE_URL: urlOf('adms_readonly'),
  ADMS_TOKEN_SIGNING_SECRET: `${word}-${word}`,
  SMTP_URL: '',
  ADMS_API_HOST: '127.0.0.1',
  ADMS_API_PORT: '3000',
  ADMS_API_TLS_CERT_FILE: certFile,
  ADMS_API_TLS_KEY_FILE: keyFile,
  ADMS_ADDRESSES_URL: 'https://addresses.adms.localhost:8443',
  ADMS_MEDIA_URL: 'https://s3.adms.localhost:8443',
  ADMS_MEDIA_BUCKET: 'adms-media',
  ADMS_MEDIA_REGION: 'us-east-1',
  ADMS_MEDIA_ACCESS_KEY: ['MADE', 'UP', 'FOR', 'THIS', 'TEST'].join(''),
  ADMS_MEDIA_SECRET_KEY: `${word}-at-the-store`,
};
const without = (key: string): Record<string, string> =>
  Object.fromEntries(Object.entries(good).filter(([name]) => name !== key));

function problemOf(environment: Record<string, string>): SettingsProblem {
  try {
    Settings.from(environment);
  } catch (problem) {
    if (problem instanceof SettingsProblem) return problem;
    throw problem;
  }
  throw new Error('The settings were taken.');
}

describe('the settings the API starts with', () => {
  it('are taken when every one is there and well formed', () => {
    const settings = Settings.from(good);
    expect(settings.databaseUrl).toBe(good['DATABASE_URL']);
    expect(settings.readOnlyDatabaseUrl).toBe(good['READONLY_DATABASE_URL']);
    expect(settings.smtpUrl).toBe('');
    expect(settings.host).toBe('127.0.0.1');
    expect(settings.port).toBe(3000);
    expect(settings.tls).toEqual({ certFile, keyFile });
    expect(settings.smtpCaFile).toBeNull();
  });

  it('take a mail server, or none', () => {
    expect(Settings.from({ ...good, SMTP_URL: 'smtp://127.0.0.1:1025' }).smtpUrl).toBe(
      'smtp://127.0.0.1:1025',
    );
    expect(problemOf({ ...good, SMTP_URL: 'http://127.0.0.1:1025' }).keys).toEqual(['SMTP_URL']);
  });

  it('take the proxies whose word is believed about a caller’s address, each an address or a network; none unless listed (ADR-416)', () => {
    expect(Settings.from(good).trustedProxies).toEqual([]);
    expect(Settings.from({ ...good, ADMS_TRUSTED_PROXIES: ' ' }).trustedProxies).toEqual([]);
    expect(
      Settings.from({ ...good, ADMS_TRUSTED_PROXIES: '172.30.213.2, 10.0.0.0/8,fd00::/8, ::1' })
        .trustedProxies,
    ).toEqual(['172.30.213.2', '10.0.0.0/8', 'fd00::/8', '::1']);
    // Never a name, a pattern or everybody: a network of no bits would believe whoever connects.
    for (const off of [
      'caddy',
      '*',
      'loopback',
      '0.0.0.0/0',
      '::/0',
      '10.0.0.0/33',
      'fd00::/129',
      '10.0.0.0/8/8',
      '10.0.0.0/',
      '10.0.0.0/08',
      '172.30.213.2 10.0.0.1',
      '172.30.213.2,caddy',
    ]) {
      const problem = problemOf({ ...good, ADMS_TRUSTED_PROXIES: off });
      expect(problem.keys, off).toEqual(['ADMS_TRUSTED_PROXIES']);
      expect(problem.message).toBe('The API did not start: ADMS_TRUSTED_PROXIES is malformed.');
    }
  });

  it.each(Object.keys(good))('AC-10-55: without %s the API does not start, and says so', (key) => {
    const problem = problemOf(without(key));
    expect(problem.keys).toEqual([key]);
    expect(problem.message).toBe(`The API did not start: ${key} is missing.`);
  });

  it.each([
    ['DATABASE_URL', 'not-a-url-9f3c'],
    ['DATABASE_URL', 'https://adms.localhost/9f3c'],
    ['DATABASE_URL', `postgresql://adms_api@127.0.0.1:55432/adms-9f3c${tls}`],
    // TLS alone, the certificate and name checked: a URL that asks less, or names a root that
    // isn't one, would let a connection fall back to plain or take any certificate (KD-78).
    ['DATABASE_URL', urlOf('adms_api-9f3c').replace(tls, '')],
    ['DATABASE_URL', urlOf('adms_api-9f3c').replace('verify-full', 'require')],
    ['DATABASE_URL', urlOf('adms_api-9f3c').replace('verify-full', 'verify-ca')],
    ['DATABASE_URL', urlOf('adms_api-9f3c').replace('verify-full', 'prefer')],
    ['DATABASE_URL', `${urlOf('adms_api-9f3c')}&sslmode=disable`],
    ['DATABASE_URL', `${urlOf('adms_api-9f3c')}&sslrootcert=/no/such/root-9f3c.crt`],
    ['READONLY_DATABASE_URL', urlOf('adms_readonly-9f3c').replace(tls, '')],
    ['ADMS_DATABASE_CA_FILE', '/no/such/root-9f3c.crt'],
    ['ADMS_DATABASE_CA_FILE', keyFile],
    ['ADMS_SMTP_CA_FILE', '/no/such/root-9f3c.crt'],
    ['ADMS_API_TLS_CERT_FILE', '/no/such/api-9f3c.crt'],
    ['ADMS_API_TLS_CERT_FILE', keyFile],
    ['ADMS_API_TLS_KEY_FILE', '/no/such/api-9f3c.key'],
    ['ADMS_API_TLS_KEY_FILE', certFile],
    ['READONLY_DATABASE_URL', urlOf('adms_readonly-9f3c').replace('/adms', '')],
    ['ADMS_TOKEN_SIGNING_SECRET', 'short-9f3c'],
    ['SMTP_URL', 'mail-9f3c'],
    ['ADMS_API_HOST', 'api-9f3c.adms.localhost'],
    ['ADMS_API_PORT', '9f3c'],
    ['ADMS_API_PORT', '0'],
    ['ADMS_API_PORT', '65536'],
    ['ADMS_DATABASE_ADDRESS', 'postgres-9f3c'],
    ['ADMS_DATABASE_ADDRESS', 'postgres:9f3c'],
    ['ADMS_CORS_ORIGINS', '*'],
    ['ADMS_CORS_ORIGINS', 'https://*.adms-9f3c.example'],
    ['ADMS_CORS_ORIGINS', 'https://adms.localhost,*'],
    ['ADMS_CORS_ORIGINS', 'http://adms-9f3c.localhost'],
    ['ADMS_CORS_ORIGINS', 'https://adms.localhost/9f3c'],
    ['ADMS_CORS_ORIGINS', 'https://adms.localhost/'],
    ['ADMS_CORS_ORIGINS', 'https://ADMS-9f3c.localhost'],
    ['ADMS_CORS_ORIGINS', 'adms-9f3c.localhost'],
    ['ADMS_CORS_ORIGINS', 'https://adms.localhost:443'],
    ['ADMS_CORS_ORIGINS', 'https://adms.localhost:9f3c'],
    ['ADMS_CORS_ORIGINS', 'https://adms.localhost https://adms-9f3c.example'],
    ['ADMS_CORS_ORIGINS', 'null'],
    ['ADMS_CORS_ORIGINS', 'off-9f3c'],
    // The address server: HTTPS only, its address and nothing after it (ADR-098, 455).
    ['ADMS_ADDRESSES_URL', 'http://addresses-9f3c.adms.localhost'],
    ['ADMS_ADDRESSES_URL', 'addresses-9f3c.adms.localhost'],
    ['ADMS_ADDRESSES_URL', 'https://u:9f3c@addresses.adms.localhost'],
    ['ADMS_ADDRESSES_URL', 'https://addresses.adms.localhost/reverse-9f3c'],
    ['ADMS_ADDRESSES_URL', 'https://addresses.adms.localhost/?format=9f3c'],
    ['ADMS_MAP_SERVERS_ADDRESS', 'caddy-9f3c:443'],
    ['ADMS_MAP_SERVERS_ADDRESS', '172.30.213.2'],
    ['ADMS_MAP_SERVERS_ADDRESS', '172.30.213.2:port-9f3c'],
    ['ADMS_MAP_CA_FILE', '/no/such/file-9f3c.crt'],
    // The object store: HTTPS only, its address and nothing after it; one bucket, named as a
    // store names one; an identity of two halves a store could have issued (ADR-480).
    ['ADMS_MEDIA_URL', 'http://s3-9f3c.adms.localhost'],
    ['ADMS_MEDIA_URL', 's3-9f3c.adms.localhost'],
    ['ADMS_MEDIA_URL', 'https://u:9f3c@s3.adms.localhost'],
    ['ADMS_MEDIA_URL', 'https://s3.adms.localhost/adms-media-9f3c'],
    ['ADMS_MEDIA_BUCKET', 'Adms-Media-9f3c'],
    ['ADMS_MEDIA_BUCKET', 'm9'],
    ['ADMS_MEDIA_BUCKET', 'adms..media-9f3c'],
    ['ADMS_MEDIA_BUCKET', 'adms-media-9f3c/photographs'],
    ['ADMS_MEDIA_BUCKET', '-adms-media-9f3c'],
    ['ADMS_MEDIA_REGION', 'US-EAST-9f3c'],
    ['ADMS_MEDIA_REGION', 'us east 9f3c'],
    ['ADMS_MEDIA_ACCESS_KEY', '9f'],
    ['ADMS_MEDIA_ACCESS_KEY', 'made up 9f3c'],
    ['ADMS_MEDIA_SECRET_KEY', 'short-9f3c'],
    ['ADMS_MEDIA_SECRET_KEY', 'made up for this test 9f3c'],
    ['ADMS_MEDIA_SECRET_KEY', "made-up-for-this-test'9f3c"],
    ['ADMS_MEDIA_SECRET_KEY', 'made-up-9f3c'.repeat(22)],
    ['ADMS_MEDIA_ADDRESS', 'caddy-9f3c:443'],
    ['ADMS_MEDIA_ADDRESS', '172.30.213.2'],
    ['ADMS_MEDIA_CA_FILE', '/no/such/file-9f3c.crt'],
  ])('AC-10-55: a malformed %s is named, and its value never said', (key, value) => {
    const problem = problemOf({ ...good, [key]: value });
    expect(problem.keys).toEqual([key]);
    expect(problem.message).toBe(`The API did not start: ${key} is malformed.`);
    expect(problem.message).not.toContain('9f3c');
  });

  it('AC-10-55: every key that is off is named at once', () => {
    const problem = problemOf({ ...without('SMTP_URL'), ADMS_API_PORT: 'x', DATABASE_URL: 'y' });
    expect(problem.keys).toEqual(['DATABASE_URL', 'SMTP_URL', 'ADMS_API_PORT']);
  });

  it('AC-10-08: the CORS origins are a list of exact values, the web apps’ and the field app’s native ones', () => {
    const listed =
      'https://adms.localhost, capacitor://localhost,https://localhost,https://office.example:8443';
    expect(Settings.from({ ...good, ADMS_CORS_ORIGINS: listed }).corsOrigins).toEqual([
      'https://adms.localhost',
      'capacitor://localhost',
      'https://localhost',
      'https://office.example:8443',
    ]);
    // Left out, no page of another origin is let in: there is no value that lets every one in.
    expect(Settings.from(good).corsOrigins).toEqual([]);
  });

  it('name the address server a phone’s lookup asks, with its certificate authority and where the stack’s proxy is, each only where stated (ADR-455)', () => {
    const plain = Settings.from(good);
    expect([plain.addressesUrl, plain.mapCaFile, plain.mapServersAt]).toEqual([
      'https://addresses.adms.localhost:8443',
      null,
      undefined,
    ]);
    const folder = mkdtempSync(join(tmpdir(), 'adms-api-ca-'));
    const ca = join(folder, 'root.crt');
    writeFileSync(ca, '-----BEGIN CERTIFICATE-----\nmade up\n-----END CERTIFICATE-----\n');
    const inStack = Settings.from({
      ...good,
      ADMS_MAP_CA_FILE: ca,
      ADMS_MAP_SERVERS_ADDRESS: '172.30.213.2:443',
    });
    expect([inStack.mapCaFile, inStack.mapServersAt]).toEqual([
      ca,
      { host: '172.30.213.2', port: 443 },
    ]);
    // A file that holds no certificate is no certificate authority.
    writeFileSync(ca, 'made up');
    expect(problemOf({ ...good, ADMS_MAP_CA_FILE: ca }).keys).toEqual(['ADMS_MAP_CA_FILE']);
    rmSync(folder, { recursive: true, force: true });
  });

  it('name the object store the API keeps files in, its one bucket and the API’s identity there, with its certificate authority and where the stack’s proxy is only where stated (ADR-480)', () => {
    expect(Settings.from(good).media).toEqual({
      url: 'https://s3.adms.localhost:8443',
      bucket: 'adms-media',
      region: 'us-east-1',
      accessKey: good['ADMS_MEDIA_ACCESS_KEY'],
      secretKey: good['ADMS_MEDIA_SECRET_KEY'],
      caFile: null,
      at: undefined,
    });
    const folder = mkdtempSync(join(tmpdir(), 'adms-api-ca-'));
    const ca = join(folder, 'root.crt');
    writeFileSync(ca, '-----BEGIN CERTIFICATE-----\nmade up\n-----END CERTIFICATE-----\n');
    const inStack = Settings.from({
      ...good,
      ADMS_MEDIA_CA_FILE: ca,
      ADMS_MEDIA_ADDRESS: '172.30.213.2:443',
    }).media;
    expect([inStack.caFile, inStack.at]).toEqual([ca, { host: '172.30.213.2', port: 443 }]);
    rmSync(folder, { recursive: true, force: true });
    // Each of the five is needed, and a missing one is named.
    for (const key of [
      'ADMS_MEDIA_URL',
      'ADMS_MEDIA_BUCKET',
      'ADMS_MEDIA_REGION',
      'ADMS_MEDIA_ACCESS_KEY',
      'ADMS_MEDIA_SECRET_KEY',
    ]) {
      expect(problemOf(without(key)).message).toBe(`The API did not start: ${key} is missing.`);
    }
  });

  it('reach the database where the stack says it is, with the same login, over TLS checked against the root the stack names', () => {
    const settings = Settings.from({ ...good, ADMS_DATABASE_ADDRESS: 'postgres:5432' });
    expect(settings.databaseUrl).toBe(`postgresql://adms_api:${word}@postgres:5432/adms${tls}`);
    expect(settings.readOnlyDatabaseUrl).toBe(
      `postgresql://adms_readonly:${word}@postgres:5432/adms${tls}`,
    );
    // The installer names this machine's root; inside the stack its own path to the same file.
    const root = join(files, 'root.crt');
    writeFileSync(root, '-----BEGIN CERTIFICATE-----\nmade up\n-----END CERTIFICATE-----\n');
    const written = `${urlOf('adms_api')}&sslrootcert=${encodeURIComponent('/no/such/host/root.crt')}`;
    const inStack = Settings.from({
      ...good,
      DATABASE_URL: written,
      ADMS_DATABASE_ADDRESS: 'postgres:5432',
      ADMS_DATABASE_CA_FILE: root,
    });
    const url = new URL(inStack.databaseUrl);
    expect([
      url.host,
      url.searchParams.get('sslmode'),
      url.searchParams.get('sslrootcert'),
    ]).toEqual(['postgres:5432', 'verify-full', root]);
    // Where it isn't told one, the root the URL names is the one checked, and must be there.
    expect(problemOf({ ...good, DATABASE_URL: written }).keys).toEqual(['DATABASE_URL']);
    expect(
      Settings.from({ ...good, DATABASE_URL: `${urlOf('adms_api')}&sslrootcert=${root}` })
        .databaseUrl,
    ).toBe(`${urlOf('adms_api')}&sslrootcert=${root}`);
  });

  it('name the root the mail server is checked against, only where stated (KD-78)', () => {
    const root = join(files, 'mail-root.crt');
    writeFileSync(root, '-----BEGIN CERTIFICATE-----\nmade up\n-----END CERTIFICATE-----\n');
    expect(Settings.from({ ...good, ADMS_SMTP_CA_FILE: root }).smtpCaFile).toBe(root);
  });
});

describe('a policy value the installation states for itself (C53, ADR-395)', () => {
  it('is the release’s when the installation states none, or leaves it blank', () => {
    expect(installationPolicy({})).toEqual(builtInPolicy());
    expect(installationPolicy({ ...good, REQUEST_BODY_LIMIT_BYTES: ' ' })).toEqual(builtInPolicy());
  });

  it('wins over the release’s under the same name, the others left as shipped', () => {
    const own = installationPolicy({ ...good, REQUEST_BODY_LIMIT_BYTES: '2097152' });
    expect(own.requestBodyLimitBytes).toBe(2097152);
    const shipped = builtInPolicy();
    expect(own.requestBodyLimitBytes).not.toBe(shipped.requestBodyLimitBytes);
    expect(Object.entries(own).filter(([name]) => name !== 'requestBodyLimitBytes')).toEqual(
      Object.entries(shipped).filter(([name]) => name !== 'requestBodyLimitBytes'),
    );
  });

  it('is held to the range the release’s is: one the domain refuses stops the start, each named, never its value', () => {
    let problem: unknown;
    try {
      installationPolicy({ REQUEST_BODY_LIMIT_BYTES: 'big-9f3c', LOAD_CALL_HIGH_LIMIT: '101' });
    } catch (thrown) {
      problem = thrown;
    }
    expect(problem).toBeInstanceOf(SettingsProblem);
    expect((problem as SettingsProblem).message).toBe(
      'The API did not start: LOAD_CALL_HIGH_LIMIT is malformed; REQUEST_BODY_LIMIT_BYTES is malformed.',
    );
  });
});

describe('the API as a process, started with settings that are off', () => {
  const main = fileURLToPath(new URL('../dist/main.js', import.meta.url));
  const folders: string[] = [];
  afterEach(() => {
    for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true });
  });

  function startWith(lines: string[], environment: Record<string, string> = {}) {
    const folder = mkdtempSync(join(tmpdir(), 'adms-api-'));
    folders.push(folder);
    const file = join(folder, 'api.env');
    writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
    return spawnSync(process.execPath, [main], {
      encoding: 'utf8',
      timeout: 20_000,
      // Nothing of this machine's own environment reaches it.
      env: { ADMS_ENV_FILE: file, ...environment },
    });
  }

  it('AC-10-55: it stops, names each key and says no value', () => {
    const started = startWith([
      'DATABASE_URL=not-a-url-9f3c',
      `READONLY_DATABASE_URL=${urlOf('adms_readonly')}`,
      'ADMS_TOKEN_SIGNING_SECRET=short-9f3c',
      'ADMS_API_HOST=127.0.0.1',
      'ADMS_API_PORT=3000',
      `ADMS_API_TLS_CERT_FILE=${certFile}`,
      `ADMS_API_TLS_KEY_FILE=${keyFile}`,
      'ADMS_ADDRESSES_URL=https://addresses.adms.localhost',
      ...Object.entries(good)
        .filter(([key]) => key.startsWith('ADMS_MEDIA_'))
        .map(([key, value]) => `${key}=${value}`),
    ]);
    expect(started.status).toBe(1);
    expect(started.stdout).toBe('');
    const said = JSON.parse(started.stderr) as { msg: string };
    expect(said.msg).toBe(
      'The API did not start: DATABASE_URL is malformed; ADMS_TOKEN_SIGNING_SECRET is malformed; SMTP_URL is missing.',
    );
    expect(started.stderr).not.toContain('9f3c');
    expect(started.stderr).not.toContain(word);
  });

  it('AC-10-55: a key set in its environment wins over its file, and is checked the same', () => {
    const started = startWith(
      Object.entries(good).map(([key, value]) => `${key}=${value}`),
      { ADMS_API_PORT: 'port-9f3c' },
    );
    expect(started.status).toBe(1);
    expect((JSON.parse(started.stderr) as { msg: string }).msg).toBe(
      'The API did not start: ADMS_API_PORT is malformed.',
    );
    expect(started.stderr).not.toContain('9f3c');
  });

  it('AC-10-55: a policy value of its own that is off stops it the same way (ADR-395)', () => {
    const started = startWith(
      [
        ...Object.entries(good).map(([key, value]) => `${key}=${value}`),
        'REQUEST_BODY_LIMIT_BYTES=0',
      ],
      { STATEMENT_TIMEOUT_MS: 'never-9f3c' },
    );
    expect(started.status).toBe(1);
    expect(started.stdout).toBe('');
    expect((JSON.parse(started.stderr) as { msg: string }).msg).toBe(
      'The API did not start: REQUEST_BODY_LIMIT_BYTES is malformed; STATEMENT_TIMEOUT_MS is malformed.',
    );
    expect(started.stderr).not.toContain('9f3c');
  });
});
