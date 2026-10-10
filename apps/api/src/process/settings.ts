// The API's settings (ARCHITECTURE §4, Secrets; AC-10-55; ADR-385): read once at the start, from
// the process's environment and then from its env file (the installer's apps/api/.env, or the
// file ADMS_ENV_FILE names), and checked. A missing or malformed one stops the start and names
// its key, never its value. ADMS_CORS_ORIGINS may be left out: no page of another origin is then
// let in. ADMS_SMTP_ADDRESS and ADMS_MAIL_FROM may be left out too (ADR-405), and so may
// ADMS_TRUSTED_PROXIES: no proxy's word is then taken for a caller's address (ADR-416). The
// address server is named as the worker's settings name it (ADR-455): ADMS_ADDRESSES_URL, with
// ADMS_MAP_CA_FILE and ADMS_MAP_SERVERS_ADDRESS where the installation has them.
import { existsSync, readFileSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

type Environment = Readonly<Record<string, string | undefined>>;

export class SettingsProblem extends Error {
  readonly keys: readonly string[];

  constructor(problems: readonly { key: string; what: string }[]) {
    super(
      `The API did not start: ${problems.map(({ key, what }) => `${key} is ${what}`).join('; ')}.`,
    );
    this.name = 'SettingsProblem';
    this.keys = problems.map(({ key }) => key);
  }
}

export class Settings {
  // From src and from dist alike: two folders up is apps/api.
  static readonly defaultFile = fileURLToPath(new URL('../../.env', import.meta.url));

  // What a message says it is from unless ADMS_MAIL_FROM says otherwise.
  static readonly defaultMailFrom = 'open-adms@adms.localhost';

  readonly databaseUrl: string;
  readonly readOnlyDatabaseUrl: string;
  readonly tokenSigningSecret: string;
  // Empty when the firm has no mail server (ARCHITECTURE §6).
  readonly smtpUrl: string;
  // Where the mail server is when it isn't where SMTP_URL says (the local stack's, from inside it).
  readonly smtpAddress: string | undefined;
  // Who a message says it is from.
  readonly mailFrom: string;
  readonly host: string;
  readonly port: number;
  // The exact origins whose pages may read an answer (ADR-098, 391); none unless listed.
  readonly corsOrigins: readonly string[];
  // The proxies in front of the API, each an address or a network (`10.0.0.0/8`): only one of
  // them is believed about the address a request came from (its X-Forwarded-For). With none
  // listed, a caller's address is the one that connected (ADR-416).
  readonly trustedProxies: readonly string[];
  // Our own address server, asked over HTTPS for a phone's address lookup (ADR-098, 455).
  readonly addressesUrl: string;
  // The certificate authority it is checked against, as a PEM file; none for the machine's own
  // trust store.
  readonly mapCaFile: string | null;
  // Where it is when it isn't where its name says (the local stack's proxy, from inside it).
  readonly mapServersAt: { readonly host: string; readonly port: number } | undefined;

  private constructor(values: {
    databaseUrl: string;
    readOnlyDatabaseUrl: string;
    tokenSigningSecret: string;
    smtpUrl: string;
    smtpAddress: string | undefined;
    mailFrom: string;
    host: string;
    port: number;
    corsOrigins: readonly string[];
    trustedProxies: readonly string[];
    addressesUrl: string;
    mapCaFile: string | null;
    mapServersAt: { host: string; port: number } | undefined;
  }) {
    this.databaseUrl = values.databaseUrl;
    this.readOnlyDatabaseUrl = values.readOnlyDatabaseUrl;
    this.tokenSigningSecret = values.tokenSigningSecret;
    this.smtpUrl = values.smtpUrl;
    this.smtpAddress = values.smtpAddress;
    this.mailFrom = values.mailFrom;
    this.host = values.host;
    this.port = values.port;
    this.corsOrigins = values.corsOrigins;
    this.trustedProxies = values.trustedProxies;
    this.addressesUrl = values.addressesUrl;
    this.mapCaFile = values.mapCaFile;
    this.mapServersAt = values.mapServersAt;
  }

  static read(environment: Environment): Settings {
    return Settings.from(Settings.environment(environment));
  }

  // What the API is told: its env file, then its process's environment. A key set in the
  // process's environment wins over the same key in the file. The policy values an installation
  // states for itself are read from the same place (policy.ts; ADR-395).
  static environment(environment: Environment): Environment {
    const file = environment['ADMS_ENV_FILE'] ?? Settings.defaultFile;
    const fromFile: Environment = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
    return { ...fromFile, ...Settings.set(environment) };
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
    const database = (key: string): string => {
      const url = checked(key, required(key), (value) => Settings.isDatabaseUrl(value));
      return address === undefined || problems.length > 0 ? url : Settings.at(url, address);
    };

    const smtpAddress = environment['ADMS_SMTP_ADDRESS'];
    checked('ADMS_SMTP_ADDRESS', smtpAddress, (value) => Settings.isAddress(value));
    const mailFrom = environment['ADMS_MAIL_FROM'];
    checked('ADMS_MAIL_FROM', mailFrom, (value) => Settings.isMailAddress(value));

    const origins = (environment['ADMS_CORS_ORIGINS'] ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '');
    checked('ADMS_CORS_ORIGINS', environment['ADMS_CORS_ORIGINS'], () =>
      origins.every((origin) => Settings.isOrigin(origin)),
    );

    const proxies = (environment['ADMS_TRUSTED_PROXIES'] ?? '')
      .split(',')
      .map((proxy) => proxy.trim())
      .filter((proxy) => proxy !== '');
    checked('ADMS_TRUSTED_PROXIES', environment['ADMS_TRUSTED_PROXIES'], () =>
      proxies.every((proxy) => Settings.isProxy(proxy)),
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
      databaseUrl: database('DATABASE_URL'),
      readOnlyDatabaseUrl: database('READONLY_DATABASE_URL'),
      // The installer makes 32 random bytes; anything shorter was not made by it.
      tokenSigningSecret: checked(
        'ADMS_TOKEN_SIGNING_SECRET',
        required('ADMS_TOKEN_SIGNING_SECRET'),
        (value) => value.length >= 32,
      ),
      smtpUrl: checked(
        'SMTP_URL',
        required('SMTP_URL'),
        (value) => value === '' || Settings.isUrl(value, ['smtp:', 'smtps:']),
      ),
      smtpAddress,
      mailFrom: mailFrom ?? Settings.defaultMailFrom,
      host: checked('ADMS_API_HOST', required('ADMS_API_HOST'), (value) => isIP(value) !== 0),
      port: Number(
        checked('ADMS_API_PORT', required('ADMS_API_PORT'), (value) => Settings.isPort(value)),
      ),
      corsOrigins: origins,
      trustedProxies: proxies,
      addressesUrl: checked('ADMS_ADDRESSES_URL', required('ADMS_ADDRESSES_URL'), (value) =>
        Settings.isHttpsUrl(value),
      ),
      mapCaFile: mapCaFile ?? null,
      mapServersAt:
        mapServersAddress === undefined
          ? undefined
          : {
              host: mapServersAddress.split(':')[0] ?? '',
              port: Number(mapServersAddress.split(':')[1]),
            },
    };
    if (problems.length > 0) throw new SettingsProblem(problems);
    return new Settings(values);
  }

  private static set(environment: Environment): Environment {
    return Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== ''));
  }

  private static isUrl(value: string, protocols: readonly string[]): boolean {
    return URL.canParse(value) && protocols.includes(new URL(value).protocol);
  }

  private static isDatabaseUrl(value: string): boolean {
    if (!Settings.isUrl(value, ['postgresql:', 'postgres:'])) return false;
    const url = new URL(value);
    return (
      url.username !== '' && url.password !== '' && url.hostname !== '' && url.pathname.length > 1
    );
  }

  // The address server is asked over HTTPS only (ADR-098): its address, with nothing after it.
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

  // One address, plain: no name beside it, no second address, nothing a header could be made of.
  private static isMailAddress(value: string): boolean {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value);
  }

  private static isPort(value: string): boolean {
    return /^[1-9]\d{0,4}$/.test(value) && Number(value) <= 65535;
  }

  // An origin as a browser sends it, whole: a scheme, a host in lower case, a port only when it
  // isn't the scheme's own; no path, no `*`, no pattern. HTTPS, or a native app's own scheme
  // (Capacitor's on iOS): a page loaded over plain HTTP is never let in.
  private static isOrigin(value: string): boolean {
    const [, scheme, port] =
      /^(https|capacitor):\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::(\d+))?$/.exec(value) ?? [];
    if (scheme === undefined) return false;
    return port === undefined || (Settings.isPort(port) && !(scheme === 'https' && port === '443'));
  }

  // One address, or a network as an address and its prefix's length. Never everything: a
  // network of no bits would believe whoever connects.
  private static isProxy(value: string): boolean {
    const [address = '', prefix, ...more] = value.split('/');
    const family = isIP(address);
    if (family === 0 || more.length > 0) return false;
    if (prefix === undefined) return true;
    if (!/^[1-9]\d{0,2}$/.test(prefix)) return false;
    try {
      new BlockList().addSubnet(address, Number(prefix), family === 4 ? 'ipv4' : 'ipv6');
      return true;
    } catch {
      return false;
    }
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
  // the API's container reaches Postgres by its service name, with the same login.
  private static at(databaseUrl: string, address: string): string {
    const url = new URL(databaseUrl);
    url.host = address;
    return url.toString();
  }
}
