// What the browser tests of a phone share (BACKLOG 3.2.2, 3.2.3; ADR-572, 574): every request the
// page sends with what was answered, the phone enrolled through its first screen in the run's own
// world, and what the browser holds raw, looked through for what must never be written down.
import type { Locator, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect } from './accessible.ts';
import { worldApiOrigin, worldOrigin, worldPasscode } from './world.ts';

export interface Asked {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly authorization: string | undefined;
  // The monitor's session, where one went beside the phone's token (ADR-443).
  readonly session: string | undefined;
  // How many bytes a part of a file held, where one went (ADR-579).
  readonly bytes: number | undefined;
  status?: number;
  answer?: unknown;
}

// Every request the page sends, in order, with what was answered as it comes.
export function recorded(page: Page): Asked[] {
  const asked: Asked[] = [];
  const waiting = new Map<object, Asked>();
  page.on('request', (sent) => {
    const body = sent.postData();
    const json = sent.headers()['content-type'] === 'application/json';
    const record: Asked = {
      method: sent.method(),
      url: sent.url(),
      body: body === null || !json ? undefined : (JSON.parse(body) as unknown),
      authorization: sent.headers()['authorization'],
      session: sent.headers()['x-adms-monitor-session'],
      bytes: json ? undefined : sent.postDataBuffer()?.byteLength,
    };
    asked.push(record);
    waiting.set(sent, record);
  });
  page.on('response', async (answer) => {
    const record = waiting.get(answer.request());
    if (record === undefined) return;
    record.status = answer.status();
    record.answer = await answer.json().catch(() => undefined);
  });
  return asked;
}

export const toApi = (asked: readonly Asked[]) =>
  asked
    .filter(({ url }) => url.startsWith(worldApiOrigin))
    .map((record) => ({ ...record, path: new URL(record.url).pathname }));

export const filled = (word: string, filling: Readonly<Record<string, string>>) =>
  word.replace(/\{(\w+)\}/g, (_, name: string) => filling[name] ?? `{${name}}`);

// The phone enrolled through its first screen, and standing in service once it has proved itself.
// A photograph taken through the app's camera (task 3.6.1, ADR-586): pressed to take one, what the
// camera sees shown, taken, and the camera put away. Chromium's fake camera stands in for the
// phone's, the page allowed it as a monitor would (e2e/browser.ts). `take` is the button that
// opens it: "Take a photo" unless named.
export async function photographed(page: Page, take?: Locator): Promise<void> {
  await (take ?? page.getByRole('button', { name: english.look.photos.take })).click();
  const camera = page.getByRole('dialog', { name: english.capture.camera.title });
  await expect(camera.getByRole('img', { name: english.capture.camera.view })).toBeVisible();
  await camera.getByRole('button', { name: english.capture.camera.take }).click();
  await expect(camera).toBeHidden();
}

// A ticket opened at once under the phone's next number, never typed again (the user, ADR-589):
// the number its heading names.
export async function openedUnder(page: Page): Promise<string> {
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText(/\d{6}/);
  return /\d{6}/.exec((await heading.textContent()) ?? '')?.[0] ?? '';
}

// In the run's own world, unless another is named: the golden mission's (e2e/mission-world.ts).
export async function enrolled(
  page: Page,
  name: string,
  world: { readonly origin: string; readonly passcode: string } = {
    origin: worldOrigin(),
    passcode: worldPasscode(),
  },
): Promise<void> {
  await page.goto(world.origin);
  await expect(page.getByRole('status')).toHaveText(english.shell.server.answers);
  await page.getByLabel(english.enrol.name).fill(name);
  await page.getByLabel(english.enrol.passcode).fill(world.passcode);
  await checkScreen(page);
  await page.getByRole('button', { name: english.enrol.enrol }).click();
  await expect(page.getByText(filled(english.phone.enrolled, { name }))).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(english.phone.standing.inService);
}

// The try a phone's run makes at once, with no signal, to report a sign-in made without it,
// waited out until it has failed: asked before the sign-in, awaited before a test counts what
// goes once the signal is back. A try still in flight when the signal comes back goes through as
// it is, ahead of where the test counts from (ADR-603).
export function reportTriedOffline(page: Page): Promise<unknown> {
  return page.waitForEvent('requestfailed', (failed) =>
    failed.url().endsWith('/phones/current/offline-sign-ins'),
  );
}

// What the browser holds raw: the keyring's device key as the browser keeps it, every row of the
// store as bytes, and the web layer's other storage, each looked through for the words given.
export async function rawlyHeld(page: Page, looked: readonly string[]) {
  return page.evaluate(async (words) => {
    const opened = (name: string) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const asked = indexedDB.open(name);
        asked.onsuccess = () => {
          resolve(asked.result);
        };
        asked.onerror = () => {
          reject(asked.error ?? new Error(name));
        };
      });
    const all = (database: IDBDatabase, shelf: string) =>
      new Promise<unknown[]>((resolve) => {
        const asked = database.transaction(shelf).objectStore(shelf).getAll();
        asked.onsuccess = () => {
          resolve(asked.result);
        };
      });
    const keyring = await opened('open-adms-keyring');
    const [pair] = (await all(keyring, 'keys')) as CryptoKeyPair[];
    keyring.close();
    const store = await opened('open-adms-phone');
    const rows = await all(store, 'rows');
    store.close();
    const privateKey = pair?.privateKey;
    const spki = pair === undefined ? null : await crypto.subtle.exportKey('spki', pair.publicKey);
    const text = (row: unknown) =>
      row instanceof Uint8Array ? new TextDecoder('latin1').decode(row) : JSON.stringify(row);
    return {
      deviceKey: {
        type: privateKey?.type,
        extractable: privateKey?.extractable,
        algorithm: { ...privateKey?.algorithm },
        usages: [...(privateKey?.usages ?? [])],
        readOut:
          privateKey === undefined
            ? 'none'
            : await crypto.subtle.exportKey('pkcs8', privateKey).then(
                () => 'read out',
                (error: unknown) => (error instanceof Error ? error.name : 'refused'),
              ),
        publicKey: spki === null ? null : btoa(String.fromCharCode(...new Uint8Array(spki))),
      },
      storeRows: rows.length,
      foundInStore: words.filter((word) => rows.some((row) => text(row).includes(word))),
      databases: (await indexedDB.databases()).map(({ name }) => name).sort(),
      webStorage: [localStorage.length, sessionStorage.length, document.cookie],
    };
  }, looked);
}
