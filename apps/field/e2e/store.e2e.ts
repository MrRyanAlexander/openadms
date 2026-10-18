// The phone's store in the browser build (BACKLOG 3.2.1; ADR-570): IndexedDB under WebCrypto keys
// that can't be read out, in the app's own page as the stack serves it, in Chromium. No screen
// keeps anything yet (enrolment's is the first, 3.2.2), so the store is built here into one script
// by the workspace's Vite and handed to the page through DevTools, as the accessibility check's
// is: the page's policy isn't loosened for it, and nothing of it is in the app's bundle. What the
// store wrote is then read back from IndexedDB itself, raw, as anyone holding the browser's
// profile could.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { build } from 'vite';

import type * as BrowserStoreModule from '../src/store/browser-store.ts';
import english from '../src/words/en.json' with { type: 'json' };
import { expect, test } from './accessible.ts';
import { fieldOrigin } from './stack.ts';

const field = fileURLToPath(new URL('..', import.meta.url));

// The store as one script that sets `admsStore` to the module, built once for the run.
let built: Promise<string> | undefined;
function storeScript(): Promise<string> {
  built ??= build({
    configFile: false,
    root: field,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      emptyOutDir: false,
      lib: {
        entry: join(field, 'src/store/browser-store.ts'),
        formats: ['iife'],
        name: 'admsStore',
        fileName: () => 'store.js',
      },
    },
  }).then((outputs) => {
    for (const output of Array.isArray(outputs) ? outputs : [outputs]) {
      if (!('output' in output)) continue;
      for (const chunk of output.output) if (chunk.type === 'chunk') return chunk.code;
    }
    throw new Error('The store was built into no script.');
  });
  return built;
}

interface Bench {
  admsStore: typeof BrowserStoreModule;
}

// The app opened, the store handed to its page, and everything its console is told kept.
async function opened(page: Page): Promise<string[]> {
  const told: string[] = [];
  page.on('console', (message) => told.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => told.push(`error: ${error.message}`));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.app.name);
  await page.evaluate(await storeScript());
  return told;
}

// What P1-COL-1 holds (AC-11-07): three days of Ana's tickets, her photographs waiting to go, its
// lists, its login list, an archived queue of Sam's and an answer kept. Each says something to
// look for in what was written.
const ana = 'M004127';
const sam = 'M004131';
const said = [
  ana,
  sam,
  'Ana Brooks',
  'Sam Grant',
  '101001',
  '14 Heron St',
  'Vegetative',
  '730416',
  'PHOTO-OF-730416',
  'mark-of-ana',
];

async function keepWhatTheDaysMade(page: Page): Promise<Record<string, number | string>> {
  return page.evaluate(
    async ({ ana, sam }) => {
      const { BrowserStore } = (globalThis as unknown as Bench).admsStore;
      const store = await BrowserStore.opened();
      const records = ['2026-10-12', '2026-10-13', '2026-10-14'].flatMap((day, at) =>
        [0, 1, 2, 3].map((n) => ({
          shelf: 'records' as const,
          id: `0192a7c4-000${String(at)}-7000-8000-00000000000${String(n)}`,
          value: {
            kind: 'COL',
            ticketNumber: String(101001 + at * 4 + n),
            monitorId: ana,
            monitor: 'Ana Brooks',
            day,
            address: '14 Heron St',
            debrisType: 'Vegetative',
            certNumber: '730416',
          },
        })),
      );
      // A photograph the size of a shrunk one, its first bytes saying what it is.
      const photo = new Uint8Array(300 * 1024);
      for (let at = 0; at < photo.length; at += 65536) {
        crypto.getRandomValues(photo.subarray(at, at + 65536));
      }
      photo.set(new TextEncoder().encode('PHOTO-OF-730416'));
      const digest = async (bytes: Uint8Array<ArrayBuffer>) =>
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      await store.change([
        ...records,
        { shelf: 'photographs', id: 'photo-101001-1', value: photo },
        { shelf: 'lists', id: 'debrisTypes', value: [{ name: 'Vegetative' }, { name: 'C&D' }] },
        { shelf: 'lists', id: 'certifications', value: [{ certNumber: '730416', capacity: 48 }] },
        { shelf: 'loginList', id: ana, value: { first: 'salt-of-ana', check: 'mark-of-ana' } },
        { shelf: 'loginList', id: sam, value: { first: 'salt-of-sam', check: 'mark-of-sam' } },
        {
          shelf: 'archivedQueues',
          id: sam,
          value: { monitor: 'Sam Grant', records: ['0192a7c4-0009-7000-8000-000000000001'] },
        },
        {
          shelf: 'keptAnswers',
          id: 'report-1',
          value: { answer: 'NOT_SAVED', ticketNumber: '101001' },
        },
      ]);
      store.close();
      return { records: records.length, photo: await digest(photo) };
    },
    { ana, sam },
  );
}

// What the store reads back, shelf by shelf, after the app was closed and opened again.
async function readBack(page: Page): Promise<Record<string, number | string>> {
  return page.evaluate(async () => {
    const { BrowserStore } = (globalThis as unknown as Bench).admsStore;
    const store = await BrowserStore.opened();
    const counted: Record<string, number | string> = {};
    for (const shelf of [
      'records',
      'photographs',
      'lists',
      'loginList',
      'archivedQueues',
      'keptAnswers',
    ] as const) {
      counted[shelf] = (await store.readAll(shelf)).length;
    }
    const photo = await store.read('photographs', 'photo-101001-1');
    if (!(photo instanceof Uint8Array)) throw new Error('No photograph read back.');
    counted['photo'] = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(photo))),
    ]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    counted['ticket'] = JSON.stringify(
      await store.read('records', '0192a7c4-0000-7000-8000-000000000000'),
    );
    store.close();
    return counted;
  });
}

// Everything the store's database holds, raw: its object stores, its keys as the browser gives
// them back, each row's key and its bytes as text, and the web layer's other storage.
async function rawlyHeld(page: Page) {
  return page.evaluate(async (said) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const asked = indexedDB.open('open-adms-phone');
      asked.onsuccess = () => {
        resolve(asked.result);
      };
      asked.onerror = () => {
        reject(new Error('not opened'));
      };
    });
    const all = <T>(asked: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        asked.onsuccess = () => {
          resolve(asked.result);
        };
        asked.onerror = () => {
          reject(new Error('not read'));
        };
      });
    const work = database.transaction(['keys', 'rows'], 'readonly');
    const keyRows = await all(work.objectStore('keys').getAll());
    const rowKeys = await all(work.objectStore('rows').getAllKeys());
    const rows = await all<unknown[]>(work.objectStore('rows').getAll());
    const stores = [...database.objectStoreNames];
    database.close();
    const keys = (keyRows as Record<string, CryptoKey>[]).flatMap((held) =>
      Object.entries(held).map(([role, key]) => ({
        role,
        isKey: key instanceof CryptoKey,
        extractable: key.extractable,
        algorithm: { ...key.algorithm },
        usages: [...key.usages].sort().join(' '),
      })),
    );
    const exported: string[] = [];
    for (const held of keyRows as Record<string, CryptoKey>[]) {
      for (const key of Object.values(held)) {
        exported.push(
          await crypto.subtle.exportKey('jwk', key).then(
            () => 'exported',
            (error: unknown) => (error instanceof Error ? error.name : 'refused'),
          ),
        );
      }
    }
    return {
      stores,
      keys,
      exported,
      rowKeys: rowKeys.map((key) => JSON.stringify(key)),
      // Each word looked for in every byte of every row, read as text.
      foundInRows: said.filter((word) =>
        rows.some(
          (row) =>
            row instanceof Uint8Array && new TextDecoder('latin1').decode(row).includes(word),
        ),
      ),
      everyRowBytes: rows.every((row) => row instanceof Uint8Array),
      databases: (await indexedDB.databases()).map(({ name }) => name),
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
      cookie: document.cookie,
      caches: (await caches.keys()).length,
    };
  }, said);
}

test('AC-11-07, AC-02-19: three days of Ana’s tickets, her photographs, the lists, the login list, Sam’s archived queue and an answer kept are in one store, sealed, and read back after the app is opened again', async ({
  page,
  context,
}) => {
  const told = await opened(page);
  const kept = await keepWhatTheDaysMade(page);

  // The app closed and opened again, and the store read back with nothing asked of anyone.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.app.name);
  await page.evaluate(await storeScript());
  const back = await readBack(page);
  expect(back).toEqual({
    records: kept['records'],
    photographs: 1,
    lists: 2,
    loginList: 2,
    archivedQueues: 1,
    keptAnswers: 1,
    photo: kept['photo'],
    ticket: JSON.stringify({
      kind: 'COL',
      ticketNumber: '101001',
      monitorId: ana,
      monitor: 'Ana Brooks',
      day: '2026-10-12',
      address: '14 Heron St',
      debrisType: 'Vegetative',
      certNumber: '730416',
    }),
  });

  // One database, its keys that no script reads out, and nothing of what was kept in the clear.
  const raw = await rawlyHeld(page);
  expect(raw.databases).toEqual(['open-adms-phone']);
  expect(raw.stores).toEqual(['keys', 'rows']);
  expect(raw.keys).toEqual([
    {
      role: 'sealing',
      isKey: true,
      extractable: false,
      algorithm: { name: 'AES-GCM', length: 256 },
      usages: 'decrypt encrypt',
    },
    {
      role: 'naming',
      isKey: true,
      extractable: false,
      algorithm: { name: 'HMAC', length: 256, hash: { name: 'SHA-256' } },
      usages: 'sign',
    },
  ]);
  expect(raw.exported).toEqual(['InvalidAccessError', 'InvalidAccessError']);
  expect(raw.rowKeys).toHaveLength(Number(kept['records']) + 7);
  expect(raw.everyRowBytes).toBe(true);
  for (const key of raw.rowKeys) {
    expect(key).toMatch(
      /^\["(records|photographs|lists|loginList|archivedQueues|keptAnswers)","[A-Za-z0-9_-]{43}"\]$/,
    );
  }
  expect(raw.foundInRows).toEqual([]);
  for (const key of raw.rowKeys) {
    for (const word of said) expect(key).not.toContain(word);
  }

  // Nothing in the web layer's other storage, the browser's cookies included.
  expect([raw.localStorage, raw.sessionStorage, raw.cookie, raw.caches]).toEqual([0, 0, '', 0]);
  expect(await context.cookies()).toEqual([]);
  expect(told).toEqual([]);
});

test('AC-11-08, AC-02-19: the key is made from no password or passcode: opened with nothing typed, each phone’s keys its own and random', async ({
  page,
  browser,
}) => {
  const told = await opened(page);
  await keepWhatTheDaysMade(page);

  // A page opened afresh reads it all, nobody signed in and nothing typed.
  const again = await page.context().newPage();
  await again.goto('/');
  await again.evaluate(await storeScript());
  expect((await readBack(again))['loginList']).toBe(2);
  await again.close();

  // Another phone (another browser profile) keeping the same id names it otherwise: neither
  // phone's keys come from anything the two share.
  const elsewhere = await browser.newContext();
  const other = await elsewhere.newPage();
  await other.goto(fieldOrigin);
  await other.evaluate(await storeScript());
  await keepWhatTheDaysMade(other);
  const names = async (on: Page) =>
    (await rawlyHeld(on)).rowKeys.filter((key) => key.startsWith('["loginList"'));
  const here = await names(page);
  const there = await names(other);
  expect(here).toHaveLength(2);
  expect(there).toHaveLength(2);
  expect(here.filter((name) => there.includes(name))).toEqual([]);
  await elsewhere.close();
  expect(told).toEqual([]);
});

test('AC-11-07, AC-11-10: a value changed or moved in the database is refused, never read as another’s, and the refusal says nothing of what it held', async ({
  page,
}) => {
  const told = await opened(page);
  await keepWhatTheDaysMade(page);
  const refusals = await page.evaluate(
    async ({ ana, sam }) => {
      const { BrowserStore } = (globalThis as unknown as Bench).admsStore;
      const store = await BrowserStore.opened();
      const database = await new Promise<IDBDatabase>((resolve) => {
        const asked = indexedDB.open('open-adms-phone');
        asked.onsuccess = () => {
          resolve(asked.result);
        };
      });
      const rows = () => database.transaction('rows', 'readwrite').objectStore('rows');
      const read = <T>(asked: IDBRequest<T>) =>
        new Promise<T>((resolve) => {
          asked.onsuccess = () => {
            resolve(asked.result);
          };
        });
      const keys = (await read(rows().getAllKeys())).filter(
        (key) => Array.isArray(key) && key[0] === 'loginList',
      );
      const [first, second] = await Promise.all(keys.map((key) => read<unknown>(rows().get(key))));
      const refusal = (error: unknown) =>
        error instanceof Error ? `${error.name}: ${error.message}` : 'none';

      // One byte of the first entry changed: neither Ana's nor Sam's entry reads as it.
      const changed = new Uint8Array(first as Uint8Array);
      changed[20] = (changed[20] ?? 0) ^ 1;
      await read(rows().put(changed, keys[0] ?? []));
      const afterChange = await Promise.all(
        [ana, sam].map((id) => store.read('loginList', id).then(() => 'read', refusal)),
      );
      // The second entry's bytes put under the first's name.
      await read(rows().put(second, keys[0] ?? []));
      const afterMove = await Promise.all(
        [ana, sam].map((id) => store.read('loginList', id).then(() => 'read', refusal)),
      );
      const whole = await store.readAll('loginList').then(() => 'read', refusal);
      store.close();
      // Keys put in the database by another hand, readable by a script: the store won't open on them.
      const others = {
        sealing: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
          'encrypt',
          'decrypt',
        ]),
        naming: await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, ['sign']),
      };
      const planted = database.transaction('keys', 'readwrite');
      planted.objectStore('keys').put(others, 'keys');
      await new Promise((resolve) => {
        planted.oncomplete = resolve;
      });
      database.close();
      const othersKeys = await BrowserStore.opened().then(() => 'opened', refusal);
      return { afterChange, afterMove, whole, othersKeys };
    },
    { ana, sam },
  );
  const refused =
    "UnreadableValue: A value kept on the loginList shelf can't be read: it was changed, moved or sealed under another key.";
  // Which entry was first in the database isn't known: one of the two reads, the other is refused.
  expect([...refusals.afterChange].sort()).toEqual(['read', refused].sort());
  expect([...refusals.afterMove].sort()).toEqual(['read', refused].sort());
  expect(refusals.whole).toBe(refused);
  expect(refusals.othersKeys).toBe('Error: The phone’s store holds keys it didn’t make.');
  for (const word of said) expect(JSON.stringify(refusals)).not.toContain(word);
  expect(told).toEqual([]);
});

test('AC-11-07, AC-11-34 (the store’s erase): the keys go first, then everything; an erase cut short after its keys leaves nothing readable', async ({
  page,
}) => {
  const told = await opened(page);
  await keepWhatTheDaysMade(page);
  const erased = await page.evaluate(async () => {
    const { BrowserStore } = (globalThis as unknown as Bench).admsStore;
    const store = await BrowserStore.opened();
    await store.change([
      { shelf: 'keptAnswers', id: 'report-1', dropped: true },
      { shelf: 'keptAnswers', id: 'report-2', value: { answer: 'SAVED' } },
    ]);
    const dropped = (await store.readAll('keptAnswers')).map(({ id }) => id);
    await store.erase();
    const databases = (await indexedDB.databases()).map(({ name }) => name);
    const opened = await BrowserStore.opened();
    const left =
      (await opened.readAll('records')).length + (await opened.readAll('loginList')).length;
    opened.close();
    return { dropped, databases, left };
  });
  expect(erased).toEqual({ dropped: ['report-2'], databases: [], left: 0 });

  // An erase held up before the database goes (another connection to it still open): its keys
  // went first, and its rows after them.
  await keepWhatTheDaysMade(page);
  const heldUp = await page.evaluate(async () => {
    const raw = await new Promise<IDBDatabase>((resolve) => {
      const asked = indexedDB.open('open-adms-phone');
      asked.onsuccess = () => {
        resolve(asked.result);
      };
    });
    const { BrowserStore } = (globalThis as unknown as Bench).admsStore;
    const store = await BrowserStore.opened();
    let erasing: Promise<void> = Promise.resolve();
    const seen = await new Promise<{ keys: number; rows: number }>((resolve) => {
      // Told the database is to go, and not letting it yet: what is left in it now.
      raw.onversionchange = () => {
        const work = raw.transaction(['keys', 'rows'], 'readonly');
        const keys = work.objectStore('keys').count();
        const rows = work.objectStore('rows').count();
        work.oncomplete = () => {
          resolve({ keys: keys.result, rows: rows.result });
        };
      };
      erasing = store.erase();
    });
    raw.close();
    await erasing;
    return { seen, databases: (await indexedDB.databases()).map(({ name }) => name) };
  });
  expect(heldUp).toEqual({ seen: { keys: 0, rows: 0 }, databases: [] });

  // Stopped after the keys went: what is left was sealed under keys that are gone, and goes too.
  await keepWhatTheDaysMade(page);
  const cutShort = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const asked = indexedDB.open('open-adms-phone');
      asked.onsuccess = () => {
        resolve(asked.result);
      };
    });
    const work = database.transaction('keys', 'readwrite');
    work.objectStore('keys').clear();
    await new Promise((resolve) => {
      work.oncomplete = resolve;
    });
    database.close();
    const { BrowserStore } = (globalThis as unknown as Bench).admsStore;
    const store = await BrowserStore.opened();
    const left =
      (await store.readAll('records')).length + (await store.readAll('photographs')).length;
    store.close();
    return left;
  });
  expect(cutShort).toBe(0);
  expect((await rawlyHeld(page)).rowKeys).toEqual([]);
  expect(told).toEqual([]);
});
