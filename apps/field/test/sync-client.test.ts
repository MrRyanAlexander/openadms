// The field app's own client of the sync contract (src/phone/outbox.ts; BACKLOG 3.4.1, C130;
// ADR-470, 475, 578): it passes every check of the suite any client must
// (packages/contracts, `syncClientSuite`), over the phone's own store, everything it is handed
// kept there first and read back from it by a client opened afresh. Then again, opened afresh from
// the store after every answer, so what an answer changes is the store's and not the client's
// memory. In Chromium over the browser build's own store: e2e/sync-client.e2e.ts.
import { syncClientSuite } from '@open-adms/contracts';
import { describe, it } from 'vitest';

import { HeldStore } from './held.ts';
import { suiteMaker } from './suite-client.ts';

describe('AC-11-28 the field app’s own SyncClient, over its own store, passes every check of the suite any client of the sync contract must pass', () => {
  for (const check of syncClientSuite) {
    it(check.name, () => check.run(suiteMaker(() => new HeldStore(), false)));
  }
});

describe('AC-11-28 and again, opened afresh from its store after every answer to a sync', () => {
  for (const check of syncClientSuite) {
    it(check.name, () => check.run(suiteMaker(() => new HeldStore(), true)));
  }
});
