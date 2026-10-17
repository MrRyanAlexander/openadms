// The worker's settings (ARCHITECTURE §4, Secrets; AC-10-55; ADR-385, 419): read once at the
// start, from the process's environment and then from its env file (the installer's
// apps/worker/.env, or the file ADMS_ENV_FILE names), and checked. A missing or malformed one
// stops the start and names its key, never its value. The policy values an installation states
// for itself are read from the same place (policy.ts; ADR-395). Its database login's URL asks
// `sslmode=verify-full`, checked against the root its `sslrootcert` names, or
// ADMS_DATABASE_CA_FILE where the installation has one (KD-78; ADR-517).
import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

type Environment = Readonly<Record<string, string | undefined>>;

export class SettingsProblem extends Error {
  readonly keys: readonly string[];

  constructor(problems: readonly { key: string; what: string }[]) {
    super(
      `The worker did not start: ${problems.map(({ key, what }) => `${key} is ${what}`).join('; ')}.`,
    );
    this.name = 'SettingsProblem';
    this.keys = problems.map(({ key }) => key);
  }
}

export class Settings {
  // From src and from dist alike: two folders up is apps/worker.
  static readonly defaultFile = fileURLToPath(new URL('../../.env', import.meta.url));

  // The worker's own login (ARCHITECTURE §5.1). Never logged.
  readonly databaseUrl: string;
  // The routing and the address server, each over HTTPS (ADR-098, 349).
  readonly routingUrl: string;
  readonly addressesUrl: string;
  // The certificate authority both are checked against, as a PEM file; none for the machine's
  // own trust store.
  readonly mapCaFile: string | null;
  // The SHA-256 of the map extract both servers were built from, kept with every mileage.
  readonly mapExtractSha256: string;
  // Where both map servers are when it isn't where their names say (the local stack's proxy,
  // from inside it).
  readonly mapServersAt: { readonly host: string; readonly port: number } | undefined;
  // Where the health answer listens.
  readonly host: string;
  readonly port: number;

  private constructor(values: {
    databaseUrl: string;
    routingUrl: string;
    addressesUrl: string;
    mapCaFile: string | null;
    mapExtractSha256: string;
    mapServersAt: { host: string; port: number } | undefined;
    host: string;
    port: number;
  }) {
    this.databaseUrl = values.databaseUrl;
    this.routingUrl = values.routingUrl;
    this.addressesUrl = values.addressesUrl;
    this.mapCaFile = values.mapCaFile;
    this.mapExtractSha256 = values.mapExtractSha256;
    this.mapServersAt = values.mapServersAt;
    this.host = values.host;
    this.port = values.port;
  }

  static read(environment: Environment): Settings {
    return Settings.from(Settings.environment(environment));
  }

  // What the worker is told: its env file, then its process's environment. A key set in the
  // process's environment wins over the same key in the file.
  static environment(environment: Environment): Environment {
    const file = environment['ADMS_ENV_FILE'] ?? Settings.defaultFile;
    const fromFile: Environment = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
    return {
      ...fromFile,
      ...Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== '')),
    };
  }

  static from(environment: Environment): Settings {
    const problems: { key: string; what: string }[] = [];
    const required = (key: string): string | undefined => {
      const value = environment[key];
      if (value === undefined) problems.push({ key, what: 'missing' });
      return value;
    };
    const checked = (key: string, value: string | undefined, ok: (value: string) => boolean) => {
      if (value !== undefined && !ok(value)) problems.push({ key, what: 'malformed' });
      return value ?? '';
    };

    const address = environment['ADMS_DATABASE_ADDRESS'];
    checked('ADMS_DATABASE_ADDRESS', address, (value) => Settings.isAddress(value));
    const databaseCaFile = environment['ADMS_DATABASE_CA_FILE'];
    checked('ADMS_DATABASE_CA_FILE', databaseCaFile, (value) => Settings.isCertificateFile(value));
    // Where ADMS_DATABASE_CA_FILE names the root (inside the stack), the root the URL names is
    // not the one checked, so it is not asked to be there.
    const databaseUrl = checked('DATABASE_URL', required('DATABASE_URL'), (value) =>
      Settings.isDatabaseUrl(value, databaseCaFile === undefined),
    );
    const mapServersAddress = environment['ADMS_MAP_SERVERS_ADDRESS'];
    checked(
      'ADMS_MAP_SERVERS_ADDRESS',
      mapServersAddress,
      (value) => Settings.isAddress(value) && isIP(value.split(':')[0] ?? '') !== 0,
    );
    const mapCaFile = environment['ADMS_MAP_CA_FILE'];
    checked('ADMS_MAP_CA_FILE', mapCaFile, (value) => Settings.isCertificateFile(value));

    const values = {
      databaseUrl:
        problems.length > 0 ? databaseUrl : Settings.at(databaseUrl, address, databaseCaFile),
      routingUrl: checked('ADMS_ROUTING_URL', required('ADMS_ROUTING_URL'), (value) =>
        Settings.isHttpsUrl(value),
      ),
      addressesUrl: checked('ADMS_ADDRESSES_URL', required('ADMS_ADDRESSES_URL'), (value) =>
        Settings.isHttpsUrl(value),
      ),
      mapCaFile: mapCaFile ?? null,
      mapExtractSha256: checked(
        'ADMS_MAP_EXTRACT_SHA256',
        required('ADMS_MAP_EXTRACT_SHA256'),
        (value) => /^[0-9a-f]{64}$/.test(value),
      ),
      mapServersAt:
        mapServersAddress === undefined
          ? undefined
          : {
              host: mapServersAddress.split(':')[0] ?? '',
              port: Number(mapServersAddress.split(':')[1]),
            },
      host: checked('ADMS_WORKER_HOST', required('ADMS_WORKER_HOST'), (value) => isIP(value) !== 0),
      port: Number(
        checked('ADMS_WORKER_PORT', required('ADMS_WORKER_PORT'), (value) =>
          Settings.isPort(value),
        ),
      ),
    };
    if (problems.length > 0) throw new SettingsProblem(problems);
    return new Settings(values);
  }

  // A login's URL, over TLS alone, the server's certificate and name checked (KD-78): no URL
  // that would let a connection fall back to plain, or take any certificate, is taken.
  private static isDatabaseUrl(value: string, rootChecked: boolean): boolean {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    const rootCert = url.searchParams.get('sslrootcert');
    return (
      ['postgresql:', 'postgres:'].includes(url.protocol) &&
      url.username !== '' &&
      url.password !== '' &&
      url.hostname !== '' &&
      url.pathname.length > 1 &&
      url.searchParams.getAll('sslmode').join() === 'verify-full' &&
      (rootCert === null || !rootChecked || Settings.isCertificateFile(rootCert))
    );
  }

  // A map server is asked over HTTPS only (ADR-098): its address, with nothing after it.
  private static isHttpsUrl(value: string): boolean {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    );
  }

  // A file that is there and holds a certificate.
  private static isCertificateFile(value: string): boolean {
    try {
      return readFileSync(value, 'utf8').includes('-----BEGIN CERTIFICATE-----');
    } catch {
      return false;
    }
  }

  private static isPort(value: string): boolean {
    return /^[1-9]\d{0,4}$/.test(value) && Number(value) <= 65535;
  }

  private static isAddress(value: string): boolean {
    const [host, port, ...more] = value.split(':');
    return (
      more.length === 0 &&
      host !== undefined &&
      /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(host) &&
      port !== undefined &&
      Settings.isPort(port)
    );
  }

  // Where the database is when it isn't where the installer reached it: inside the local stack
  // the worker's container reaches Postgres by its service name, with the same login, and checks
  // its certificate against the stack's root as mounted there.
  private static at(databaseUrl: string, address?: string, caFile?: string): string {
    if ((address === undefined && caFile === undefined) || !URL.canParse(databaseUrl)) {
      return databaseUrl;
    }
    const url = new URL(databaseUrl);
    if (address !== undefined) url.host = address;
    if (caFile !== undefined) url.searchParams.set('sslrootcert', caFile);
    return url.toString();
  }
}
