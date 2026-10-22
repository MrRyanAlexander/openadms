// Signing in with no connection in the browser build (BACKLOG 3.2.4; ADR-575), through the screens,
// against the real API in the run's own world (e2e/world-setup.ts) and its cast: the login list
// read with the lists and kept sealed in the store; a monitor signed in from it with the network
// off, taking the assignment whose lists the phone holds; that sign-in reported first when the
// network comes back, and the monitor sent back to sign in online where the server refuses it;
// the screen's own wrong tries, their waits and the lock until the master passcode; and the lock
// after inactivity, with its warning.
import type { BrowserContext, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import {
  enrolled,
  filled,
  rawlyHeld,
  reportTriedOffline,
  recorded,
  toApi,
  type Asked,
} from './phone-page.ts';
import { worldApiOrigin, worldCast, worldPasscode, type CastMonitor } from './world.ts';

const p1 = 'Bayline County ROW, Hurricane Delphine';

async function signedIn(page: Page, monitor: CastMonitor, password = monitor.password) {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
}

async function signedOut(page: Page) {
  await page.getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await expect(page.getByText(english.phone.nobody)).toBeVisible();
}

const at = (asked: readonly Asked[], path: string) =>
  toApi(asked).filter((record) => record.path === path);

// Ana on P1-COL-1: signed in online, her lists and the login list read, then signed out.
async function anasPhone(page: Page): Promise<CastMonitor> {
  const { ana } = worldCast();
  await enrolled(page, 'P1-COL-1');
  await signedIn(page, ana);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
  // Kept: the enrolment, when it last synced and the passcode's check the sync brought, then the
  // lists, how long a sign-in lasts and the login list's four entries.
  await expect.poll(async () => (await rawlyHeld(page, [])).storeRows).toBe(9);
  await signedOut(page);
  return ana;
}

async function offline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

test('AC-02-39, AC-11-19, AC-02-41, AC-11-21, AC-11-54: with no signal Ana signs in on P1-COL-1 from its login list, pasting her password, and works on the assignment it holds; at signal the sign-in is reported first, the server’s session taken, and the lists read with it', async ({
  page,
  context,
}) => {
  const asked = recorded(page);
  const { ana, kim, lee, jo } = worldCast();
  await enrolled(page, 'P1-COL-1');
  await signedIn(page, ana);
  await expect(page.getByText(p1)).toBeVisible();

  // The login list read beside the lists, as hers: Ana, Kim, Lee and Jo have assignments on P1; each
  // entry is kept sealed in the store, nobody's name or Monitor ID in the clear. The master
  // passcode's check came with the sync before it (task 3.4.1), so the phone says it holds it.
  await expect.poll(() => at(asked, '/phones/current/login-list')[0]?.answer).toBeDefined();
  const read = at(asked, '/phones/current/login-list')[0];
  expect(read?.status).toBe(200);
  expect(read?.body).toEqual({ masterPasscodeVersion: 1, entries: [] });
  const list = read?.answer as {
    masterPasscode: { check: unknown };
    loginList: { monitors: { monitorId: string; name: string; check: unknown }[] };
  };
  expect(list.loginList.monitors.map(({ name }) => name).sort()).toEqual(
    [ana.name, kim.name, lee.name, jo.name].sort(),
  );
  const [first] = at(asked, '/phones/current/syncs');
  expect(
    (first?.answer as { masterPasscode: { check: unknown } }).masterPasscode.check,
  ).not.toBeNull();
  expect(list.masterPasscode.check).toBeNull();
  const sealed = await rawlyHeld(page, [ana.name, kim.monitorNumber, ana.password]);
  expect(sealed.foundInStore).toEqual([]);
  expect(sealed.webStorage).toEqual([0, 0, '']);
  await signedOut(page);

  // No signal: her Monitor ID typed, her password pasted in (AC-11-54).
  await offline(context, page);
  await page.getByLabel(english.phone.monitorNumber).fill(ana.monitorNumber);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((text) => navigator.clipboard.writeText(text), ana.password);
  await page.getByLabel(english.phone.passwordLabel).focus();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.getByLabel(english.phone.passwordLabel)).toHaveValue(ana.password);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  const reportTried = reportTriedOffline(page);
  await page.getByRole('button', { name: english.phone.signIn }).click();

  // Home from the assignment the phone holds: P1, collections and incidents.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
  await expect(page.getByText(p1)).toBeVisible();
  await expect(page.locator('.screen-actions').getByRole('button')).toHaveText([
    english.home.start.collection,
    english.home.start.incident,
  ]);
  await checkScreen(page);
  await page.getByRole('button', { name: english.menu.settings }).click();
  await expect(page.getByText(english.settings.offline)).toBeVisible();
  await checkScreen(page);
  await reportTried;
  const before = toApi(asked).length;
  expect((await rawlyHeld(page, [ana.password])).foundInStore).toEqual([]);

  // Signal: the sign-in is reported before anything else of hers.
  await context.setOffline(false);
  await expect.poll(() => at(asked, '/phones/current/login-list').length).toBe(2);
  await expect(page.getByText(english.settings.offline)).toBeHidden();
  const after = toApi(asked).slice(before);
  // A proof of the phone's own, where its token ran out, goes first: the phone's, not hers.
  const done = after.filter(({ path }) => !/\/(challenges|proofs)$/.test(path));
  expect(done.map(({ method, path, status }) => `${method} ${path} ${String(status)}`)).toEqual([
    'POST /phones/current/offline-sign-ins 200',
    'POST /phones/current/syncs 200',
    'GET /phones/current/lists 200',
    'POST /phones/current/login-list 200',
  ]);
  const [report, sync, lists] = done;
  expect(report?.session).toBeUndefined();
  expect(report?.body).toMatchObject({
    kind: 'OWN_PASSWORD',
    personId: list.loginList.monitors.find(({ name }) => name === ana.name)?.monitorId,
    masterPasscodeVersion: null,
    proof: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
  });
  expect(JSON.stringify(report?.body)).not.toContain(ana.password);
  const { token } = report?.answer as { token: string };
  expect([sync?.session, lists?.session]).toEqual([token, token]);
});

test('AC-11-21, AC-11-64: the server refuses Ana’s sign-in made with no signal: the phone drops it and asks her to sign in online, nothing it holds lost', async ({
  page,
  context,
}) => {
  const asked = recorded(page);
  const ana = await anasPhone(page);
  await offline(context, page);
  await signedIn(page, ana);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
  const rows = (await rawlyHeld(page, [])).storeRows;

  // A proof that isn't one, as a password set anew since would make it.
  await page.route(`${worldApiOrigin}/phones/current/offline-sign-ins`, async (route) => {
    const sent = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    await route.continue({ postData: JSON.stringify({ ...sent, proof: 'A'.repeat(43) }) });
  });
  await context.setOffline(false);
  await expect(page.getByText(english.phone.offlineRefused)).toBeVisible();
  // Its answer is read after the request is seen (`recorded`): waited for, never read early.
  await expect
    .poll(() => at(asked, '/phones/current/offline-sign-ins').at(-1)?.answer)
    .toBeDefined();
  expect(at(asked, '/phones/current/offline-sign-ins').at(-1)?.answer).toMatchObject({
    code: 'SIGN_IN_REFUSED',
  });
  expect(at(asked, '/phones/current/lists').length).toBe(1);
  await checkScreen(page);
  expect((await rawlyHeld(page, [])).storeRows).toBe(rows);
  await page.unroute(`${worldApiOrigin}/phones/current/offline-sign-ins`);

  // Online, she signs in again.
  await signedIn(page, ana);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
});

test('AC-02-40, ADR-120, AC-11-23: with no signal, wrong tries against the login list back off from the fifth and lock the screen at the tenth until the master passcode; the count outlasts the page; Kim’s own password signs nobody in on Ana’s phone; the unlock and the wrong try at the passcode are reported at signal', async ({
  page,
  context,
}) => {
  const asked = recorded(page);
  const { kim } = worldCast();
  let now = Date.now();
  await page.clock.setFixedTime(now);
  const ana = await anasPhone(page);
  await offline(context, page);

  await signedIn(page, kim);
  await expect(
    page.getByText(filled(english.phone.anotherMonitor, { name: ana.name })),
  ).toBeVisible();

  const signIn = page.getByRole('button', { name: english.phone.signIn });
  const waits = [30, 60, 120, 240, 480];
  for (let nth = 1; nth <= 10; nth += 1) {
    await signedIn(page, ana, `not-her-password-${String(nth)}`);
    if (nth < 5) {
      await expect(page.getByText(english.phone.refused)).toBeVisible();
    } else if (nth < 10) {
      const seconds = waits[nth - 5] ?? 0;
      await expect(
        page.getByText(filled(english.refusals.wait.other, { count: String(seconds) })),
      ).toBeVisible();
      await expect(signIn).toBeDisabled();
      if (nth === 5) {
        await checkScreen(page);
        // Opened again, the phone still counts: the wait stands. (The browser build loads its
        // page over the network, so it is opened again with signal; the phones load their own.)
        await context.setOffline(false);
        await page.reload();
        await offline(context, page);
        await expect(signIn).toBeDisabled();
      }
      now += (seconds + 1) * 1000;
      await page.clock.setFixedTime(now);
      await expect(signIn).toBeEnabled();
    }
  }

  // Locked: no sign-in, only the master passcode.
  await expect(page.getByText(english.phone.locked)).toBeVisible();
  await expect(page.getByLabel(english.phone.passwordLabel)).toHaveCount(0);
  const passcode = page.getByLabel(english.phone.passcode);
  await expect(passcode).toHaveAttribute('type', 'password');
  await checkScreen(page);
  await passcode.fill('not-the-passcode');
  await page.getByRole('button', { name: english.phone.unlock }).click();
  await expect(page.getByText(english.refusals.passcode)).toBeVisible();
  await passcode.fill(worldPasscode());
  await page.getByRole('button', { name: english.phone.unlock }).click();
  await expect(page.getByText(english.phone.unlocked)).toBeVisible();

  await signedIn(page, ana);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);

  // AC-11-23, ADR-576: each try at the passcode the phone checked itself was kept, and goes at
  // signal in the sync with Ana's session (task 3.4.1, ADR-578), after her sign-in and before her
  // lists; never the passcode.
  await context.setOffline(false);
  const carrying = () =>
    at(asked, '/phones/current/syncs').filter(
      ({ status, body }) =>
        status === 200 && (body as { passcodeUses: unknown[] }).passcodeUses.length > 0,
    );
  await expect.poll(() => carrying()).toHaveLength(1);
  const [carried] = carrying();
  const uses = (carried?.body as { passcodeUses: { use: string; personId: unknown }[] })
    .passcodeUses;
  expect(uses.map(({ use }) => use).sort()).toEqual(['SIGN_IN_UNLOCK', 'WRONG_TRY']);
  expect(uses.map(({ personId }) => personId)).toEqual([null, null]);
  expect(carried?.answer).toMatchObject({
    passcodeUses: [{ answer: 'SAVED' }, { answer: 'SAVED' }],
  });
  expect(JSON.stringify(carried?.body)).not.toContain(worldPasscode());
  expect(at(asked, '/phones/current/passcode-uses')).toEqual([]);
  const order = toApi(asked)
    .map(({ path }) => path)
    .filter((path) => /offline-sign-ins|syncs|\/lists$/.test(path));
  expect(order.slice(-3)).toEqual([
    '/phones/current/offline-sign-ins',
    '/phones/current/syncs',
    '/phones/current/lists',
  ]);
});

test('AC-11-20, AC-11-64, AC-02-40: left alone, the phone warns a minute before the lock and one tap keeps Kim signed in; left alone again it signs her out, tells the server, and loses nothing it holds', async ({
  page,
}) => {
  const asked = recorded(page);
  const { kim } = worldCast();
  const start = Date.now();
  await page.clock.setFixedTime(start);
  await enrolled(page, 'P1-TWR-TDSR');
  await signedIn(page, kim);
  await expect(page.getByText('Marsh Road TDSR')).toBeVisible();
  await expect.poll(() => at(asked, '/phones/current/login-list').at(-1)?.status).toBe(200);
  const rows = (await rawlyHeld(page, [])).storeRows;

  const warning = page.getByText(filled(english.work.inactivity.warning.other, { count: '60' }));
  const stay = page.getByRole('button', { name: english.work.inactivity.stay });
  await page.clock.setFixedTime(start + 29 * 60_000 + 5_000);
  await expect(warning).toBeVisible();
  // Without the keyboard's walk: a key pressed is something done, and would end the warning.
  await checkScreen(page, { keyboard: false });
  await stay.click();
  await expect(warning).toBeHidden();

  // Another half an hour with nothing done.
  await page.clock.setFixedTime(start + 59 * 60_000 + 10_000);
  await expect(page.getByText(filled(english.phone.inactive.other, { count: '30' }))).toBeVisible();
  await expect(page.getByText(kim.name)).toHaveCount(0);
  await checkScreen(page);
  const signOut = at(asked, '/phones/current/sign-outs').at(-1);
  expect(`${String(signOut?.method)} ${String(signOut?.status)}`).toBe('POST 200');
  expect((await rawlyHeld(page, [])).storeRows).toBe(rows);
});

test('AC-11-20: a press on a button is something done: Kim pressing only the app’s buttons for an hour, never longer than the lock apart, is never warned or signed out', async ({
  page,
}) => {
  const { kim } = worldCast();
  const start = Date.now();
  await page.clock.setFixedTime(start);
  await enrolled(page, 'P1-TWR-TDSR');
  await signedIn(page, kim);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);

  // Every 20 minutes she presses Sync, then Work: the menu's buttons alone, nothing typed.
  const warning = page.getByText(filled(english.work.inactivity.warning.other, { count: '60' }));
  for (const minutes of [20, 40, 60]) {
    await page.clock.setFixedTime(start + minutes * 60_000);
    await page.getByRole('button', { name: english.menu.sync }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.sync.title);
    await page.getByRole('button', { name: english.menu.work }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
  }
  // Twenty-nine and a half minutes after her last press, the warning: the press counted (one
  // that didn't would leave her 88 minutes idle, signed out). One tap keeps her signed in.
  await page.clock.setFixedTime(start + 60 * 60_000 + 29 * 60_000 + 30_000);
  await expect(warning).toBeVisible();
  await expect(page.getByText(kim.name)).toBeVisible();
  await page.getByRole('button', { name: english.work.inactivity.stay }).click();
  await expect(warning).toHaveCount(0);
});
