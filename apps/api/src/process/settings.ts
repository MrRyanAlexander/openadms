// The API's settings (ARCHITECTURE §4, Secrets; AC-10-55; ADR-385): read once at the start, from
// the process's environment and then from its env file (the installer's apps/api/.env, or the
// file ADMS_ENV_FILE names), and checked. A missing or malformed one stops the start and names
// its key, never its value. ADMS_CORS_ORIGINS may be left out: no page of another origin is then
// let in.
import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
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

  readonly databaseUrl: string;
  readonly readOnlyDatabaseUrl: string;
  readonly tokenSigningSecret: string;
  // Empty when the firm has no mail server (ARCHITECTURE §6).
  readonly smtpUrl: string;
  readonly host: string;
  readonly port: number;
  // The exact origins whose pages may read an answer (ADR-098, 391); none unless listed.
  readonly corsOrigins: readonly string[];

  private constructor(values: {
    databaseUrl: string;
    readOnlyDatabaseUrl: string;
    tokenSigningSecret: string;
    smtpUrl: string;
    host: string;
    port: number;
    corsOrigins: readonly string[];
  }) {
    this.databaseUrl = values.databaseUrl;
    this.readOnlyDatabaseUrl = values.readOnlyDatabaseUrl;
    this.tokenSigningSecret = values.tokenSigningSecret;
    this.smtpUrl = values.smtpUrl;
    this.host = values.host;
    this.port = values.port;
    this.corsOrigins = values.corsOrigins;
  }

  // A key set in the process's environment wins over the same key in the file.
  static read(environment: Environment): Settings {
    const file = environment['ADMS_ENV_FILE'] ?? Settings.defaultFile;
    const fromFile: Environment = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
    return Settings.from({ ...fromFile, ...Settings.set(environment) });
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

    const origins = (environment['ADMS_CORS_ORIGINS'] ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '');
    checked('ADMS_CORS_ORIGINS', environment['ADMS_CORS_ORIGINS'], () =>
      origins.every((origin) => Settings.isOrigin(origin)),
    );

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
      host: checked('ADMS_API_HOST', required('ADMS_API_HOST'), (value) => isIP(value) !== 0),
      port: Number(
        checked('ADMS_API_PORT', required('ADMS_API_PORT'), (value) => Settings.isPort(value)),
      ),
      corsOrigins: origins,
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
