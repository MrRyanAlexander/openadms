// The installation's own stage, for loading the sample projects into it (sample-projects.ts,
// `pnpm sample`): the stage a story is told on (runner.ts), set on the installation's database and
// its API's own settings instead of a story's.
//
// - **The API's own process, on the installation's settings**: `ApiProcess` with `ApiModule`, as
//   `apps/api/src/main.ts` starts it, on the installation's database logins, its keys and its
//   object store, every endpoint and the boundary every request passes. It listens on a loopback
//   port of its own for this load alone, over HTTPS with the stack's certificate for a process on
//   this machine, and the loader reaches it there (`loopbackDoor`). It runs on the sample's clock:
//   the sample is told on the golden mission's days in October 2026, so the worker's conclusions
//   are known. Its sessions and tokens are signed with the installation's own secret, and every
//   one it gave the sample's people and phones is ended before the load is done. What the
//   database stamps itself (when each audit record was written) is the real time.
// - **The worker's own run**, on the installation's worker login (sample-worker.ts).
// - **The firm's master passcode**, as whoever holds it types it: it is kept nowhere but this
//   process's memory, and never printed. The sample's monitors' passwords are made up and kept
//   nowhere at all.
//
// Whoever runs this holds the firm's server: it reads the API's and the worker's settings as they
// do, and prints none of them. Its proof is the same as `pnpm installer:admin`'s.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { ApiModule, ApiProcess, NoMail, PasswordHasher, Settings } from '@open-adms/api';
import {
  openDatabase,
  openViewerDatabase,
  type Database,
  type ViewerDatabase,
} from '@open-adms/db';

import { madeUpPassword } from '../office-browser.ts';
import { builtInPolicy } from '../policy.ts';
import { StoryStage } from '../runner.ts';
import { freeLoopbackPort } from '../story-api.ts';
import type { Service, StageDatabase, StoryPool } from '../story-database.ts';
import { StoryMedia } from '../story-media.ts';
import { sample } from './sample-names.ts';
import { sampleStart } from './sample-projects.ts';

const root = new URL('../../../../', import.meta.url);
const workerEnvFile = fileURLToPath(new URL('apps/worker/.env', root));
const tls = new URL('infra/local/.generated/tls/', root);
const needs =
  'The sample projects need the installation: `pnpm installer`, then `pnpm local:up` (its settings and its certificates).';

// The installation's database, as its API's and its worker's own logins open it, each from its
// own settings; or, for a load tried out (`pnpm sample --try`), another database on the same
// server, which the same logins may open.
export class InstallationDatabase implements StageDatabase {
  readonly name: string;
  private readonly urls: Readonly<Record<Service | 'viewer', string>>;

  constructor(settings: Settings, databaseName?: string) {
    if (!existsSync(workerEnvFile)) throw new Error(`${needs} (the worker has no settings)`);
    const worker = parseEnv(readFileSync(workerEnvFile, 'utf8'))['DATABASE_URL'];
    if (worker === undefined) throw new Error(`${needs} (the worker’s settings name no database)`);
    const at = (written: string): string => {
      if (databaseName === undefined) return written;
      const url = new URL(written);
      url.pathname = `/${databaseName}`;
      return url.toString();
    };
    this.urls = {
      api: at(settings.databaseUrl),
      worker: at(worker),
      viewer: at(settings.readOnlyDatabaseUrl),
    };
    this.name = databaseName ?? new URL(settings.databaseUrl).pathname.slice(1);
  }

  open(service: Service, pool?: StoryPool): Database {
    return openDatabase({
      url: this.urls[service],
      maxConnections: service === 'worker' ? 4 : 2,
      ...pool,
    });
  }

  openViewer(pool?: StoryPool): ViewerDatabase {
    return openViewerDatabase({ url: this.urls.viewer, maxConnections: 2, ...pool });
  }
}

export interface InstallationParts {
  // The firm's master passcode, as whoever holds it typed it.
  readonly passcode: string;
  // Another database on the installation's server than its own (`pnpm sample --try`), its
  // photographs' files kept in memory, never in the installation's object store.
  readonly tryingOn?: string;
  // Where what the API logs at error goes.
  readonly logged?: (line: string) => void;
}

// The stage, its clock at the sample's start. The caller closes it.
export async function installationStage(parts: InstallationParts): Promise<StoryStage> {
  const certFile = fileURLToPath(new URL('host.crt', tls));
  const keyFile = fileURLToPath(new URL('host.key', tls));
  if (!existsSync(certFile) || !existsSync(keyFile)) {
    throw new Error(`${needs} (the stack has no certificate for a process on this machine)`);
  }
  const port = await freeLoopbackPort();
  // The API's own settings, as it reads them, listening here for this load alone.
  const settings = Settings.read({
    ADMS_API_HOST: '127.0.0.1',
    ADMS_API_PORT: String(port),
    ADMS_API_TLS_CERT_FILE: certFile,
    ADMS_API_TLS_KEY_FILE: keyFile,
  });
  const policy = builtInPolicy();
  const database = new InstallationDatabase(settings, parts.tryingOn);
  const pool = {
    maxConnections: policy.databasePoolConnections,
    pieceOfWork: {
      waitMs: policy.databaseConnectionWaitMs,
      longestMs: policy.databaseWorkLongestMs,
    },
  };
  const media = parts.tryingOn === undefined ? undefined : new StoryMedia();
  return StoryStage.open({
    database,
    timeZone: sample.timeZone,
    start: sampleStart,
    out: () => undefined,
    checked: (passed) => {
      if (!passed) throw new Error('A check of the sample failed.');
    },
    port,
    installation: {
      passcode: parts.passcode,
      // One key per purpose (ADR-542), as the API's process holds them.
      passwordHasher: new PasswordHasher(settings.passwordKey, settings.tokenSigningSecret),
      monitorPassword: madeUpPassword,
      async start({ clock, log }) {
        const api = await ApiProcess.create(
          ApiModule,
          {
            host: settings.host,
            port: settings.port,
            tls: settings.tls,
            databaseUrl: settings.databaseUrl,
            readOnlyDatabaseUrl: settings.readOnlyDatabaseUrl,
            // No page calls it, and no proxy stands in front of it.
            corsOrigins: [],
            trustedProxies: [],
            tokenSigningSecret: settings.tokenSigningSecret,
            passwordKey: settings.passwordKey,
            sealingKey: settings.sealingKey,
            smtpUrl: settings.smtpUrl,
            smtpAddress: settings.smtpAddress,
            smtpCaFile: settings.smtpCaFile,
            mailFrom: settings.mailFrom,
            addressesUrl: settings.addressesUrl,
            mapCaFile: settings.mapCaFile,
            mapServersAt: settings.mapServersAt,
            media: settings.media,
            esriPrivateHosts: settings.esriPrivateHosts,
            esriCaFile: settings.esriCaFile,
          },
          policy,
          {
            stream: {
              write: (line) => {
                log(line);
                if (/"level":(50|60)\b/.test(line)) parts.logged?.(line.trim());
              },
            },
            clock,
            // The sample's people are told nothing by mail.
            mail: new NoMail(),
            database: database.open('api', pool),
            viewerDatabase: database.openViewer(pool),
            ...(media === undefined ? {} : { media }),
          },
        );
        try {
          await api.listen();
        } catch (problem) {
          await api.close();
          throw problem;
        }
        return api;
      },
    },
  });
}
