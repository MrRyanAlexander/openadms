// The API's way into Postgres (ARCHITECTURE §5.3, §5.7; AC-10-43; ADR-390): its own login, from
// its settings, through `packages/db`. Every write a service makes while a request is being
// answered states that request's id, the one its log lines and its answer carry, so the audit
// record leads back to the call; no service has to pass it along.
import { openDatabase, type Database } from '@open-adms/db';

import { requestNow } from './boundary.ts';
import type { Settings } from './settings.ts';

// What a class names to be handed the database: `@Inject(apiDatabase)`.
export const apiDatabase = Symbol('the API’s database');

// `maxConnections` is the policy's (ADR-419); a tool that opens it for one question leaves it out.
export function openApiDatabase(
  settings: Pick<Settings, 'databaseUrl'>,
  maxConnections?: number,
): Database {
  return openDatabase({
    url: settings.databaseUrl,
    requestNow,
    ...(maxConnections === undefined ? {} : { maxConnections }),
  });
}
