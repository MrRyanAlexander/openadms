// Signing in online and the assignment in the browser build (BACKLOG 3.2.3; ADR-574), through the
// screens, against the real API in the run's own world (e2e/world-setup.ts) and its cast: a
// monitor signs in on an enrolled phone with their Monitor ID and password; their session goes
// beside the phone's token and is written down nowhere; the phone takes their assignment and
// shows the work it allows under the bottom menu; told there is none (or several), it says so,
// keeps the lists it holds and says how stale they are, and asks again when it finds a
// connection; a sign-in the server no longer takes sends the monitor back to sign in.
import type { Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, rawlyHeld, recorded, toApi, type Asked } from './phone-page.ts';
import { worldApiOrigin, worldCast, type CastMonitor } from './world.ts';

const p1 = 'Bayline County ROW, Hurricane Delphine';

async function signedIn(page: Page, monitor: CastMonitor): Promise<void> {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
}

const listsRead = (asked: readonly Asked[]) =>
  toApi(asked).filter(({ path }) => path === '/phones/current/lists');

const menuItems = (page: Page) =>
  page.getByRole('navigation', { name: english.menu.label }).getByRole('button');

test('AC-11-14, AC-02-35, AC-11-18, AC-11-81, AC-11-54, AC-11-63: Kim signs in online; her session goes beside the phone’s token and is written down nowhere; home shows her assignment’s project, site and work, under the menu Work, Sync, Settings; she signs out', async ({
  page,
}) => {
  const { kim } = worldCast();
  const asked = recorded(page);
  await enrolled(page, 'P1-TWR-TDSR');

  // The fields: her username and password as a password manager fills them, masked, pasted in.
  const password = page.getByLabel(english.phone.passwordLabel);
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByLabel(english.phone.monitorNumber)).toHaveAttribute(
    'autocomplete',
    'username',
  );
  await expect(password).toHaveAttribute('spellcheck', 'false');
  const from = toApi(asked).length;
  await signedIn(page, kim);

  // Home: P1, Marsh Road TDSR, a disposal and the drop-off log, nothing else.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
  await expect(page.getByText(p1)).toBeVisible();
  await expect(page.getByText('Marsh Road TDSR')).toBeVisible();
  await expect(page.getByText(english.work.synced.now)).toBeVisible();
  const work = page.locator('.screen-actions').getByRole('button');
  await expect(work).toHaveText([english.home.start.disposal, english.home.start.dropOff]);
  await expect(menuItems(page)).toHaveText([
    english.menu.work,
    english.menu.sync,
    english.menu.settings,
  ]);
  await checkScreen(page);

  // The sign-in went as the phone's; the lists and the login list (task 3.2.4) as the phone's
  // with her session beside it.
  await expect.poll(() => toApi(asked).slice(from).length).toBe(3);
  const after = toApi(asked).slice(from);
  expect(after.map(({ method, path, status }) => `${method} ${path} ${String(status)}`)).toEqual([
    'POST /phones/current/sign-ins 200',
    'GET /phones/current/lists 200',
    'POST /phones/current/login-list 200',
  ]);
  const [signIn, lists, loginList] = after;
  expect(signIn?.body).toEqual({ monitorNumber: kim.monitorNumber, password: kim.password });
  expect(signIn?.authorization).toMatch(/^Bearer /);
  expect(signIn?.session).toBeUndefined();
  const { token, assignment } = signIn?.answer as {
    token: string;
    assignment: { site: { name: string } };
  };
  expect(assignment.site.name).toBe('Marsh Road TDSR');
  expect(lists?.authorization).toBe(signIn?.authorization);
  expect(lists?.session).toBe(token);
  expect(loginList?.session).toBe(token);

  // Written down nowhere: not the store, the keyring or the web layer. Kept: the enrolment, the
  // lists, the login list's three entries (Kim, Ana and Lee have assignments on P1), the master
  // passcode's check and how long a sign-in lasts.
  const held = await rawlyHeld(page, [token, kim.password]);
  expect(held.foundInStore).toEqual([]);
  expect(held.storeRows).toBe(7);
  expect(held.webStorage).toEqual([0, 0, '']);

  // Sync: the lists held and how stale they are; refreshed on asking.
  await page.getByRole('button', { name: english.menu.sync }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.sync.title);
  const version = (lists?.answer as { lists: { setupVersion: number } }).lists.setupVersion;
  await expect(
    page.getByText(filled(english.sync.lists, { project: p1, version: String(version) })),
  ).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: english.sync.refresh }).click();
  await expect.poll(() => listsRead(asked).length).toBe(2);
  await expect(page.getByRole('status')).toHaveText(english.work.synced.now);

  // Settings: who is signed in on which phone; she signs out, and the server is told.
  await page.getByRole('button', { name: english.menu.settings }).click();
  await expect(
    page.getByText(
      filled(english.settings.signedInAs, { name: kim.name, monitorNumber: kim.monitorNumber }),
    ),
  ).toBeVisible();
  await expect(
    page.getByText(filled(english.settings.phone, { name: 'P1-TWR-TDSR' })),
  ).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await expect(page.getByText(english.phone.nobody)).toBeVisible();
  const signOut = toApi(asked).find(({ path }) => path === '/phones/current/sign-outs');
  expect(`${String(signOut?.method)} ${String(signOut?.status)}`).toBe('POST 200');
  expect(signOut?.session).toBe(token);
});

test('AC-11-14: a sign-in the server no longer takes sends Ana back to sign in, nothing the phone holds lost; the browser build holds her session in memory alone, so opened again nobody is signed in', async ({
  page,
}) => {
  const { ana } = worldCast();
  const asked = recorded(page);
  await enrolled(page, 'P1-COL-1');
  await signedIn(page, ana);
  await expect(page.locator('.screen-actions').getByRole('button')).toHaveText([
    english.home.start.collection,
    english.home.start.incident,
  ]);
  // The enrolment, the lists and the login list, kept.
  await expect.poll(async () => (await rawlyHeld(page, [])).storeRows).toBe(7);

  // The server stops taking her session (as one ended elsewhere): the next request of hers is
  // refused, and the phone asks her to sign in again.
  await page.route(`${worldApiOrigin}/phones/current/lists`, async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), 'x-adms-monitor-session': 'no-longer-taken' },
    });
  });
  await page.getByRole('button', { name: english.menu.sync }).click();
  await page.getByRole('button', { name: english.sync.refresh }).click();
  await expect(page.getByText(english.phone.ended)).toBeVisible();
  await expect.poll(() => listsRead(asked).at(-1)?.answer).toMatchObject({ code: 'NOT_SIGNED_IN' });
  await checkScreen(page);
  expect((await rawlyHeld(page, [])).storeRows).toBe(7);
  await page.unroute(`${worldApiOrigin}/phones/current/lists`);

  // Signed in again, then the page opened again: her session was in memory alone.
  await signedIn(page, ana);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
  await page.reload();
  await expect(page.getByText(english.phone.nobody)).toBeVisible();

  // A password that isn't hers: said plainly, the field emptied, nobody signed in.
  await page.getByLabel(english.phone.monitorNumber).fill(ana.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill('not-her-password');
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByText(english.phone.refused)).toBeVisible();
  await expect(page.getByLabel(english.phone.passwordLabel)).toHaveValue('');
});

test('AC-11-15, AC-11-16, AC-02-36: Tariq has no assignment and Lee has two: each is signed in, told so and to ask their supervisor; the phone keeps the lists it holds, says how stale they are, and asks again on finding a connection', async ({
  page,
  context,
}) => {
  const { kim, tariq, lee } = worldCast();
  const asked = recorded(page);
  const saturday = Date.now();
  await page.clock.setFixedTime(saturday);
  await enrolled(page, 'P1-TWR-LF');
  await signedIn(page, kim);
  await expect(page.getByText(english.work.synced.now)).toBeVisible();
  await page.getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.signOut }).click();

  // Two days on by the phone's clock, Tariq signs in: none today.
  await page.clock.setFixedTime(saturday + 2 * 86_400_000 + 60_000);
  await signedIn(page, tariq);
  await expect(page.getByText(english.work.noAssignment.NONE_THAT_DAY)).toBeVisible();
  await expect(page.getByText(filled(english.work.held, { project: p1 }))).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    filled(english.work.synced.days.other, { count: '2' }),
  );
  await checkScreen(page);
  const signIn = toApi(asked).findLast(({ path }) => path === '/phones/current/sign-ins');
  expect(signIn?.answer).toMatchObject({ assignment: null, noAssignment: 'NONE_THAT_DAY' });

  // Asked again whenever there's a connection: on "Check again", and on finding signal.
  const reads = listsRead(asked).length;
  await page.getByRole('button', { name: english.work.checkAgain }).click();
  await expect.poll(() => listsRead(asked).length).toBe(reads + 1);
  await context.setOffline(true);
  await context.setOffline(false);
  await expect.poll(() => listsRead(asked).length).toBe(reads + 2);
  await expect
    .poll(() => listsRead(asked).at(-1)?.answer)
    .toMatchObject({
      assignment: null,
      noAssignment: 'NONE_THAT_DAY',
      lists: null,
    });
  await expect(page.getByText(filled(english.work.held, { project: p1 }))).toBeVisible();

  // Lee has two today, and nothing says which is this phone's.
  await page.getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await signedIn(page, lee);
  await expect(page.getByText(english.work.noAssignment.SEVERAL_THAT_DAY)).toBeVisible();
});
