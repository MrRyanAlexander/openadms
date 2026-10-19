// The phone's outbox, the browser build's own store and the sync contract's suite, as one script a
// browser test hands the page through DevTools (bench.ts), as store.e2e.ts hands the store: the
// page's policy isn't loosened for it, and nothing of it is in the app's bundle (BACKLOG 3.4.1;
// ADR-578).
import { syncClientSuite, type SyncedRecord } from '@open-adms/contracts';

import { PhoneOutbox } from '../src/phone/outbox.ts';
import { BrowserStore, browserStoreName } from '../src/store/browser-store.ts';
import { suiteMaker } from '../test/suite-client.ts';

// Every check of the suite, each over a browser store of its own, then again opened afresh from it
// after every answer: each check's name and what it threw, or null. Every store it made is erased
// after (one wiped is gone already).
export async function suiteRan(): Promise<{ name: string; threw: string | null }[]> {
  const ran: { name: string; threw: string | null }[] = [];
  const made: BrowserStore[] = [];
  const store = async () => {
    const one = await BrowserStore.opened(`open-adms-suite-${String(made.length + 1)}`);
    made.push(one);
    return one;
  };
  for (const afresh of [false, true]) {
    for (const check of syncClientSuite) {
      try {
        await check.run(suiteMaker(store, afresh));
        ran.push({ name: check.name, threw: null });
      } catch (error) {
        ran.push({ name: check.name, threw: error instanceof Error ? error.message : 'threw' });
      }
    }
  }
  for (const one of made) await one.erase().catch(() => undefined);
  return ran;
}

// Records kept on the phone the app has open, in its own store, as the capture will keep each one
// it submits (task 3.5.1): by the outbox. What the outbox didn't keep, and why, for each.
export async function kept(records: readonly SyncedRecord[]): Promise<(string | null)[]> {
  const store = await BrowserStore.opened(browserStoreName);
  const outbox = await PhoneOutbox.opened(store, {
    holding: () =>
      Promise.resolve({
        holds: { masterPasscodeVersion: null, listsProjectId: null },
        lastUsed: [],
      }),
    filePartBytesAtMost: 65_536,
    wipe: () => Promise.reject(new Error('Nothing here wipes the phone.')),
  });
  const refused: (string | null)[] = [];
  for (const record of records) refused.push((await outbox.keep(record))?.message ?? null);
  store.close();
  return refused;
}
