// What a test starts the API's process with, in its own memory (ADR-385, 387…392): made-up
// settings, the release's own policy values, and a way to ask it.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { builtInPolicy } from '../../src/policy.ts';
import type { ApiProcess, ProcessSettings } from '../../src/process/api-process.ts';

// A login's URL is put together here so that no file holds one; nothing opens it.
const word = ['made', 'up', 'for', 'this', 'test'].join('-');

export const listedOrigin = 'https://adms.localhost';

export const madeUpSettings: ProcessSettings = {
  host: '127.0.0.1',
  port: 0,
  // Asked without a connection: a test's process never listens (ApiProcess.listen).
  tls: null,
  // Each asks TLS alone, as every login's URL does (KD-78; ADR-517).
  databaseUrl: `postgresql://adms_api:${word}@127.0.0.1:1/adms?sslmode=verify-full`,
  readOnlyDatabaseUrl: `postgresql://adms_readonly:${word}@127.0.0.1:1/adms?sslmode=verify-full`,
  corsOrigins: [listedOrigin],
  // No proxy stands in front of a test's process: a caller's address is the one that connected.
  trustedProxies: [],
  // Made up as the login's password is; the installer's is 32 random bytes.
  tokenSigningSecret: [word, word].join('-'),
  // No mail server, unless a test hands the process a mail of its own.
  smtpUrl: '',
  smtpAddress: undefined,
  smtpCaFile: null,
  mailFrom: 'open-adms@adms.localhost',
  // Named and never asked, unless a test hands the process an address server of its own.
  addressesUrl: 'https://addresses.adms.localhost',
  mapCaFile: null,
  mapServersAt: undefined,
  esriPrivateHosts: [],
  esriCaFile: null,
  // Named and never asked, unless a test hands the process a store of its own.
  media: {
    url: 'https://s3.adms.localhost',
    bucket: 'adms-media',
    region: 'us-east-1',
    accessKey: word,
    secretKey: [word, word].join('-'),
    caFile: null,
    at: undefined,
  },
};

export const shippedPolicy = builtInPolicy();

// The two files the API's settings name to serve HTTPS with, made up for a test of the settings
// alone: each holds what its setting asks for and nothing that would serve.
const served = mkdtempSync(join(tmpdir(), 'adms-api-served-'));
export const madeUpServedOver = {
  ADMS_API_TLS_CERT_FILE: join(served, 'api.crt'),
  ADMS_API_TLS_KEY_FILE: join(served, 'api.key'),
};
writeFileSync(
  madeUpServedOver.ADMS_API_TLS_CERT_FILE,
  '-----BEGIN CERTIFICATE-----\nmade up\n-----END CERTIFICATE-----\n',
);
writeFileSync(
  madeUpServedOver.ADMS_API_TLS_KEY_FILE,
  '-----BEGIN PRIVATE KEY-----\nmade up\n-----END PRIVATE KEY-----\n',
  { mode: 0o600 },
);

export async function ready(api: ApiProcess): Promise<void> {
  await api.app.init();
  await api.app.getHttpAdapter().getInstance().ready();
}
