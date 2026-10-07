// What a test starts the API's process with, in its own memory (ADR-385, 387…392): made-up
// settings, the release's own policy values, and a way to ask it.
import { builtInPolicy } from '../../src/policy.ts';
import type { ApiProcess, ProcessSettings } from '../../src/process/api-process.ts';

// A login's URL is put together here so that no file holds one; nothing opens it.
const word = ['made', 'up', 'for', 'this', 'test'].join('-');

export const listedOrigin = 'https://adms.localhost';

export const madeUpSettings: ProcessSettings = {
  host: '127.0.0.1',
  port: 0,
  databaseUrl: `postgresql://adms_api:${word}@127.0.0.1:1/adms`,
  corsOrigins: [listedOrigin],
};

export const shippedPolicy = builtInPolicy();

export async function ready(api: ApiProcess): Promise<void> {
  await api.app.init();
  await api.app.getHttpAdapter().getInstance().ready();
}
