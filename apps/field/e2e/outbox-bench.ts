// The phone's outbox, the browser build's own store and the sync contract's suite, as one script a
// browser test hands the page through DevTools (bench.ts), as store.e2e.ts hands the store: the
// page's policy isn't loosened for it, and nothing of it is in the app's bundle (BACKLOG 3.4.1;
// ADR-578).
import { syncClientSuite, type SyncedPhoto, type SyncedRecord } from '@open-adms/contracts';

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

// An outbox over the store of the phone the app has open, for keeping what the capture will.
async function outboxOfThePhone() {
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
  return { store, outbox };
}

// Records kept on the phone the app has open, in its own store, as the capture will keep each one
// it submits (task 3.5.1): by the outbox. What the outbox didn't keep, and why, for each.
export async function kept(records: readonly SyncedRecord[]): Promise<(string | null)[]> {
  const { store, outbox } = await outboxOfThePhone();
  const refused: (string | null)[] = [];
  for (const record of records) refused.push((await outbox.keep(record))?.message ?? null);
  store.close();
  return refused;
}

// Photographs kept on that phone as its camera will keep them (task 3.8.2): each record with a
// JPEG of so many bytes made here from a seed, the record's fingerprint the file's own SHA-256,
// as the camera takes it at capture. What the outbox didn't keep, and why, for each.
export async function keptPhotos(
  photos: readonly {
    readonly photo: Omit<SyncedPhoto, 'uploadedSha256'>;
    readonly length: number;
    readonly seed: number;
  }[],
): Promise<(string | null)[]> {
  const { store, outbox } = await outboxOfThePhone();
  const refused: (string | null)[] = [];
  for (const { photo, length, seed } of photos) {
    const bytes = new Uint8Array(length);
    bytes.set([0xff, 0xd8, 0xff, 0xe1]);
    for (let at = 4; at < length; at += 1) bytes[at] = (at * 31 + seed) % 256;
    const print = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const uploadedSha256 = Array.from(print, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const notice = await outbox.keepPhoto({ ...photo, uploadedSha256 }, [{ file: 'photo', bytes }]);
    refused.push(notice?.message ?? null);
  }
  store.close();
  return refused;
}
