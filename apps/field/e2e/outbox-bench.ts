// The phone's outbox, the browser build's own store and the sync contract's suite, as one script a
// browser test hands the page through DevTools (bench.ts), as store.e2e.ts hands the store: the
// page's policy isn't loosened for it, and nothing of it is in the app's bundle (BACKLOG 3.4.1;
// ADR-578).
import { syncClientSuite, type SyncedPhoto, type SyncedRecord } from '@open-adms/contracts';

import { PhoneOutbox } from '../src/phone/outbox.ts';
import { browserKeyringName } from '../src/store/browser-keyring.ts';
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

// A record kept on that phone by an earlier or later release, which this one's contract doesn't
// read (C183): on the records shelf as the outbox keeps one, never through it.
export async function keptUnreadable(id: string, record: unknown): Promise<void> {
  const store = await BrowserStore.opened(browserStoreName);
  await store.change([{ shelf: 'records', id, value: { kept: 1, record, told: null } as never }]);
  store.close();
}

// The world's lost tower phone planted as the phone the page opens (task 3.4.3, ADR-580): its key
// held by the keyring as the browser build keeps its own (the private half imported not
// extractable), and its enrolment kept in the store as the phone keeps the server's answer.
export async function plantedPhone(phone: {
  readonly deviceId: string;
  readonly name: string;
  readonly masterPasscodeVersion: number;
  readonly publicKey: string;
  readonly privateKey: string;
}): Promise<void> {
  const der = (base64: string) => Uint8Array.from(atob(base64), (one) => one.charCodeAt(0));
  const kind = { name: 'ECDSA', namedCurve: 'P-256' };
  const pair = {
    privateKey: await crypto.subtle.importKey('pkcs8', der(phone.privateKey), kind, false, [
      'sign',
    ]),
    publicKey: await crypto.subtle.importKey('spki', der(phone.publicKey), kind, true, ['verify']),
  };
  const keyring = await new Promise<IDBDatabase>((resolve, reject) => {
    const asked = indexedDB.open(browserKeyringName, 1);
    asked.onupgradeneeded = () => {
      asked.result.createObjectStore('keys');
    };
    asked.onsuccess = () => {
      resolve(asked.result);
    };
    asked.onerror = () => {
      reject(asked.error ?? new Error('The keyring wasn’t opened.'));
    };
  });
  await new Promise<void>((resolve, reject) => {
    const work = keyring.transaction('keys', 'readwrite');
    work.objectStore('keys').put(pair, 'device');
    work.oncomplete = () => {
      resolve();
    };
    work.onerror = () => {
      reject(work.error ?? new Error('The key wasn’t kept.'));
    };
  });
  keyring.close();
  const store = await BrowserStore.opened(browserStoreName);
  await store.change([
    {
      shelf: 'keptAnswers',
      id: 'enrolment',
      value: {
        deviceId: phone.deviceId,
        masterPasscodeVersion: phone.masterPasscodeVersion,
        name: phone.name,
      },
    },
  ]);
  store.close();
}
