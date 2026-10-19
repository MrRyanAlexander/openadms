// The field app's own client of the sync contract, in Chromium over the browser build's own store
// (BACKLOG 3.4.1, C130; ADR-470, 570, 578): every check of the suite any client must pass, each
// over an IndexedDB store of its own under the store's own WebCrypto keys, in the app's page as the
// stack serves it, then again opened afresh from that store after every answer. Under Vitest over
// a store in memory: test/sync-client.test.ts.
import { syncClientSuite } from '@open-adms/contracts';

import english from '../src/words/en.json' with { type: 'json' };
import { benched, type Bench } from './bench.ts';
import { expect, test } from './accessible.ts';

test('AC-11-28: the field app’s own SyncClient, over the browser build’s own store, passes every check of syncClientSuite, reading answers only through syncAnswerRead', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.app.name);
  await benched(page);
  const ran = await page.evaluate(() => (globalThis as unknown as Bench).admsBench.suiteRan());
  expect(ran).toEqual(
    [false, true].flatMap(() => syncClientSuite.map(({ name }) => ({ name, threw: null }))),
  );
  // Every store the suite made is gone; the app's own is untouched.
  const databases = await page.evaluate(async () =>
    (await indexedDB.databases()).map(({ name }) => name).sort(),
  );
  expect(databases.filter((name) => name?.startsWith('open-adms-suite-'))).toEqual([]);
});
