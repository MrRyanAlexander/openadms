// The master passcode on the phone in the browser build (BACKLOG 3.3.2; ADR-577), through the
// screens, against the real API in the run's own world (e2e/world-setup.ts) and its cast: a phone
// handed from one monitor to another with their own assignment; a move to another site and a
// session as the phone's monitor, with no signal, reported at signal and taken by the server; the
// temporary session ending at midnight in the project's time zone; and ten wrong tries of the
// passcode with no signal locking the phone until it is entered with signal (the user, ADR-577).
//
// Other tests count on the cast as it is (setup.e2e.ts): nothing here makes an assignment but on
// the phone it was made on, which names it, and no monitor is created.
import type { BrowserContext, Page } from '@playwright/test';
import { ProjectClock } from '@open-adms/domain';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, rawlyHeld, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast, worldPasscode, type CastMonitor } from './world.ts';

const p1 = 'Bayline County ROW, Hurricane Delphine';
const marshRoad = 'Marsh Road TDSR';
const landfill = 'Bayline County Landfill';
const said = english.setup;

const at = (asked: readonly Asked[], path: string) =>
  toApi(asked).filter((record) => record.path === path);

async function signedIn(page: Page, monitor: CastMonitor, password = monitor.password) {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
}

async function offline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

// A monitor signed in online on a phone just enrolled, their lists and the login list read.
async function phoneOf(page: Page, asked: readonly Asked[], name: string, monitor: CastMonitor) {
  await enrolled(page, name);
  await signedIn(page, monitor);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
  await expect.poll(() => at(asked, '/phones/current/login-list').at(-1)?.status).toBe(200);
}

async function settings(page: Page) {
  await page.getByRole('button', { name: english.menu.settings }).click();
}

// A row of a list by the words it starts with: its name, before any detail beneath it.
const picked = (page: Page, name: string) =>
  page.getByRole('option', {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });

// What went to the API since a moment, but the phone's own proofs.
const since = (asked: readonly Asked[], from: number) =>
  toApi(asked)
    .slice(from)
    .filter(({ path }) => !/\/(challenges|proofs)$/.test(path));

test('AC-02-46, AC-11-27, AC-11-64: with no signal, Ana hands P1-COL-3 to Kim, who has her own assignment: the passcode first, Kim picked from the login list; no assignment made; Ana signed out; Kim, signing in with her own password, is the phone’s now, Ana not; at signal Kim’s sign-in, then the switch, then her own assignment at Marsh Road TDSR', async ({
  page,
  context,
}) => {
  const asked = recorded(page);
  const { ana, kim } = worldCast();
  await phoneOf(page, asked, 'P1-COL-3', ana);
  await offline(context, page);
  await settings(page);
  await page.getByRole('button', { name: english.settings.handOver }).click();

  await expect(page.getByRole('heading', { name: said.handOverTitle })).toBeVisible();
  await expect(page.getByText(said.handOverNeeds)).toBeVisible();
  await checkScreen(page);
  await page.getByLabel(said.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: said.next }).click();

  await expect(page.getByRole('heading', { name: said.monitor.title })).toBeVisible();
  await picked(page, kim.name).click();
  await page.getByRole('button', { name: said.next }).click();

  const question = filled(said.handOver.title, { name: kim.name });
  await expect(page.getByRole('heading', { name: question })).toBeVisible();
  await checkScreen(page);
  await picked(page, filled(said.handOver.own, { name: kim.name })).click();
  await page.getByRole('button', { name: said.next }).click();

  await expect(page.getByRole('heading', { name: said.handed.title })).toBeVisible();
  await expect(page.getByText(filled(said.handed.to, { name: kim.name }))).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(said.made.held);
  await checkScreen(page);
  await page.getByRole('button', { name: said.handed.done }).click();

  // Ana signed out; the sign-in says whose the phone is now, Kim's Monitor ID filled in.
  await expect(page.getByText(filled(english.phone.handedTo, { name: kim.name }))).toBeVisible();
  await expect(page.getByLabel(english.phone.monitorNumber)).toHaveValue(kim.monitorNumber);
  await signedIn(page, ana);
  await expect(
    page.getByText(filled(english.phone.anotherMonitor, { name: kim.name })),
  ).toBeVisible();
  await signedIn(page, kim);
  // Her own assignment comes with signal: none on the phone yet.
  await expect(page.getByText(english.work.noAssignment.NONE_THAT_DAY)).toBeVisible();
  expect((await rawlyHeld(page, [worldPasscode()])).foundInStore).toEqual([]);

  const before = toApi(asked).length;
  await context.setOffline(false);
  await expect
    .poll(() => at(asked, '/phones/current/login-list').filter(({ status }) => status === 200))
    .toHaveLength(2);
  const after = since(asked, before);
  expect(after.map(({ method, path, status }) => `${method} ${path} ${String(status)}`)).toEqual([
    'POST /phones/current/offline-sign-ins 200',
    'POST /phones/current/syncs 200',
    'GET /phones/current/lists 200',
    'POST /phones/current/login-list 200',
  ]);
  // The use goes in the sync (task 3.4.1, ADR-578).
  const [signIn, sync] = after;
  expect((signIn?.body as { kind: string }).kind).toBe('OWN_PASSWORD');
  expect(sync?.body).toMatchObject({
    unplannedAssignments: [],
    passcodeUses: [{ use: 'MONITOR_SWITCH' }],
  });
  expect(sync?.answer).toMatchObject({ passcodeUses: [{ answer: 'SAVED' }] });
  expect(at(asked, '/phones/current/unplanned-assignments')).toEqual([]);
  await expect(page.getByText(marshRoad)).toBeVisible();
  await expect(page.locator('.screen-actions').getByRole('button')).toHaveText([
    english.home.start.disposal,
    english.home.start.dropOff,
  ]);
});

test('AC-02-47, AC-11-27, AC-11-26, AC-02-42: Lee, with two assignments today, has P1-TWR-3 set up for the Landfill’s tower; with no signal it moves to Marsh Road TDSR, a wrong passcode first; signed out, the passcode signs him in as the phone’s monitor, every screen saying so; at signal his sign-in made under the passcode is taken, then the move, the wrong try and the session’s use, and the lists take the move, the last made on the phone', async ({
  page,
  context,
}) => {
  const asked = recorded(page);
  // Lee, whose two assignments leave him none on a phone the board doesn't name: the unplanned ones
  // made here name this phone alone, so nobody else's sign-in changes (Kim's stays the board's).
  const { lee } = worldCast();
  await phoneOf(page, asked, 'P1-TWR-3', lee);
  await expect(page.getByText(english.work.noAssignment.SEVERAL_THAT_DAY)).toBeVisible();
  await page.getByRole('button', { name: english.work.setUp }).click();
  await page.getByLabel(said.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: said.next }).click();
  await picked(page, p1).click();
  await page.getByRole('button', { name: said.next }).click();
  await picked(page, said.work.kinds.DISPOSAL).click();
  await page.getByRole('button', { name: said.next }).click();
  await picked(page, landfill).click();
  await page.getByRole('button', { name: said.make }).click();
  await expect(page.getByRole('status')).toHaveText(said.made.saved);
  await page.getByRole('button', { name: said.made.done }).click();
  await expect(page.getByText(landfill)).toBeVisible();
  await expect.poll(() => at(asked, '/phones/current/login-list').length).toBe(2);
  await offline(context, page);

  await settings(page);
  await page.getByRole('button', { name: english.settings.move }).click();
  await expect(page.getByRole('heading', { name: english.move.title })).toBeVisible();
  await checkScreen(page);
  await page.getByLabel(english.move.passcode).fill('not-the-firms-passcode');
  await page.getByRole('button', { name: english.move.next }).click();
  await expect(page.getByText(english.refusals.passcode)).toBeVisible();
  await page.getByLabel(english.move.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.move.next }).click();

  // The sites the phone holds, but where it is now: Marsh Road TDSR and Cypress Creek Landfill.
  await expect(page.getByRole('heading', { name: english.move.site.title })).toBeVisible();
  await expect(page.getByText(filled(english.move.offline, { project: p1 }))).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(2);
  await checkScreen(page);
  await picked(page, marshRoad).click();
  await page.getByRole('button', { name: english.move.make }).click();
  await expect(page.getByRole('heading', { name: english.move.made.title })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(said.made.held);
  await checkScreen(page);
  await page.getByRole('button', { name: english.move.made.done }).click();
  await expect(page.getByText(marshRoad)).toBeVisible();

  await settings(page);
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await page.getByRole('button', { name: english.phone.passcodeSession }).click();
  await expect(page.getByRole('heading', { name: english.session.title })).toBeVisible();
  await checkScreen(page);
  const field = page.getByLabel(english.session.passcode);
  await expect(field).toHaveAttribute('type', 'password');
  await field.fill(worldPasscode());
  await page.getByRole('button', { name: english.session.next }).click();
  await expect(page.getByRole('heading', { name: english.session.monitor.title })).toBeVisible();
  // The phone's own monitor first, said so; the login list's others, temporary.
  await expect(page.getByRole('option').first()).toContainText(lee.name);
  await expect(page.getByRole('option').first()).toContainText(english.session.monitor.phones);
  await checkScreen(page);
  await picked(page, lee.name).click();
  await page.getByRole('button', { name: english.session.open }).click();

  const marked = filled(english.look.strip.underPasscode.AS_MONITOR, { name: lee.name });
  await expect(page.getByText(marked)).toBeVisible();
  await expect(page.getByText(marshRoad)).toBeVisible();
  await settings(page);
  await expect(page.getByText(english.settings.underPasscode.AS_MONITOR)).toBeVisible();
  await expect(page.getByText(marked)).toBeVisible();
  expect((await rawlyHeld(page, [worldPasscode(), 'not-the-firms-passcode'])).foundInStore).toEqual(
    [],
  );

  const before = toApi(asked).length;
  await context.setOffline(false);
  await expect
    .poll(() => at(asked, '/phones/current/login-list').filter(({ status }) => status === 200))
    .toHaveLength(3);
  const after = since(asked, before);
  expect(after.map(({ method, path, status }) => `${method} ${path} ${String(status)}`)).toEqual([
    'POST /phones/current/offline-sign-ins 200',
    'POST /phones/current/syncs 200',
    'GET /phones/current/lists 200',
    'POST /phones/current/login-list 200',
  ]);
  // The move and the two uses go in the sync (task 3.4.1, ADR-578), ahead of the lists.
  const [signIn, sync, lists] = after;
  expect(signIn?.body).toMatchObject({ kind: 'AS_MONITOR', masterPasscodeVersion: 1 });
  expect(signIn?.answer).toMatchObject({ masterPasscodeSession: 'AS_MONITOR' });
  const sent = sync?.body as { unplannedAssignments: { id: string }[]; passcodeUses: unknown[] };
  const [move] = sent.unplannedAssignments;
  expect(sent.unplannedAssignments).toMatchObject([
    { fieldEventKinds: ['DISPOSAL'], occasion: 'SETUP' },
  ]);
  expect(sent.passcodeUses).toMatchObject([
    { use: 'WRONG_TRY', personId: null },
    { use: 'SESSION_AS_MONITOR' },
  ]);
  expect(sync?.answer).toMatchObject({
    unplannedAssignments: [{ answer: 'SAVED' }],
    passcodeUses: [{ answer: 'SAVED' }, { answer: 'SAVED' }],
  });
  expect(JSON.stringify(sent)).not.toContain(worldPasscode());
  const { token } = signIn?.answer as { token: string };
  expect([sync?.session, lists?.session]).toEqual([token, token]);
  expect((lists?.answer as { assignment: { id: string } }).assignment.id).toBe(move?.id);
  await expect(page.getByText(marked)).toBeVisible();
});

test('AC-11-26, AC-02-42, AC-11-64: with no signal, the temporary session for Lee on Ana’s phone, marked on every screen, ends at midnight in the project’s time zone by the phone’s clock; the sign-in screen says so', async ({
  page,
  context,
}) => {
  const asked = recorded(page);
  const { ana, lee } = worldCast();
  // The phone's clock five minutes before midnight in Bayline County, held there, so nothing waits
  // long enough for the lock after inactivity.
  const midnight = new ProjectClock('America/New_York').dayEnds(new Date()).getTime();
  await page.clock.setFixedTime(midnight - 5 * 60_000);
  await phoneOf(page, asked, 'P1-COL-4', ana);
  await settings(page);
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await offline(context, page);

  await page.getByRole('button', { name: english.phone.passcodeSession }).click();
  await page.getByLabel(english.session.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.session.next }).click();
  await expect(page.getByText(english.session.offline)).toBeVisible();
  await expect(picked(page, lee.name)).toContainText(english.session.monitor.temporary);
  await picked(page, lee.name).click();
  await page.getByRole('button', { name: english.session.open }).click();

  const marked = filled(english.look.strip.underPasscode.TEMPORARY, { name: lee.name });
  await expect(page.getByText(marked)).toBeVisible();
  await checkScreen(page);
  await settings(page);
  await expect(page.getByText(english.settings.underPasscode.TEMPORARY)).toBeVisible();
  await checkScreen(page);

  // A second before midnight, still his; at midnight, ended.
  await page.clock.setFixedTime(midnight - 1000);
  await page.getByRole('button', { name: english.menu.work }).click();
  await expect(page.getByText(marked)).toBeVisible();
  await page.clock.setFixedTime(midnight);
  await expect(page.getByText(english.phone.temporaryEnded)).toBeVisible();
  await expect(page.getByText(english.phone.nobody)).toHaveCount(0);
  await checkScreen(page);
});

test('AC-11-83: with no signal, ten wrong tries of the master passcode lock the phone: from the fifth each waits, at the tenth Ana is signed out and the phone shows only the passcode, which opens nothing without signal; with signal the server takes it, the phone opens, and the ten wrong tries are reported', async ({
  page,
  context,
}) => {
  // Ten checks of the passcode, each two slow hashes in the page's JavaScript.
  test.setTimeout(120_000);
  const asked = recorded(page);
  const { ana } = worldCast();
  let now = Date.now();
  await page.clock.setFixedTime(now);
  await phoneOf(page, asked, 'P1-COL-5', ana);
  await offline(context, page);
  await settings(page);
  await page.getByRole('button', { name: english.settings.handOver }).click();

  const field = page.getByLabel(said.passcode);
  const next = page.getByRole('button', { name: said.next });
  const waits = [30, 60, 120, 240, 480];
  for (let nth = 1; nth <= 9; nth += 1) {
    await field.fill(`not-the-firms-passcode-${String(nth)}`);
    await next.click();
    if (nth < 5) {
      await expect(page.getByText(english.refusals.passcode)).toBeVisible();
    } else {
      const seconds = waits[nth - 5] ?? 0;
      await expect(
        page.getByText(filled(english.refusals.passcodeWait.other, { count: String(seconds) })),
      ).toBeVisible();
      if (nth === 5) await checkScreen(page);
      now += (seconds + 1) * 1000;
      await page.clock.setFixedTime(now);
    }
  }
  await field.fill('not-the-firms-passcode-10');
  await next.click();

  await expect(page.getByText(english.phone.phoneLocked)).toBeVisible();
  await expect(page.getByLabel(english.phone.passwordLabel)).toHaveCount(0);
  await expect(page.getByRole('button', { name: english.phone.setUp })).toHaveCount(0);
  await checkScreen(page);
  const passcode = page.getByLabel(english.phone.passcode);
  await expect(passcode).toHaveAttribute('type', 'password');
  await passcode.fill(worldPasscode());
  await page.getByRole('button', { name: english.phone.unlock }).click();
  await expect(page.getByText(english.phone.phoneLockedNoSignal)).toBeVisible();
  // Opened again, it is still locked: the count is the store's.
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText(english.phone.phoneLocked)).toBeVisible();

  const before = toApi(asked).length;
  await passcode.fill('not-the-firms-passcode');
  await page.getByRole('button', { name: english.phone.unlock }).click();
  await expect(page.getByText(english.refusals.passcode)).toBeVisible();
  await passcode.fill(worldPasscode());
  await page.getByRole('button', { name: english.phone.unlock }).click();
  await expect(page.getByText(english.phone.unlocked)).toBeVisible();
  await expect(page.getByLabel(english.phone.passwordLabel)).toBeVisible();

  await expect
    .poll(() => at(asked, '/phones/current/passcode-uses').filter(({ status }) => status === 200))
    .toHaveLength(10);
  // The phone's proofs with the passcode beside its key: refused, then taken.
  const proofs = toApi(asked)
    .slice(before)
    .filter(
      ({ path, body }) => path.endsWith('/proofs') && JSON.stringify(body).includes('passcode'),
    );
  expect(proofs.map(({ status }) => status)).toEqual([401, 200]);
  const uses = at(asked, '/phones/current/passcode-uses');
  expect(uses.every(({ body }) => (body as { use: string }).use === 'WRONG_TRY')).toBe(true);
  expect(uses.every(({ session }) => session === undefined)).toBe(true);
  expect(uses.map(({ answer }) => (answer as { answer: string }).answer)).toEqual(
    Array.from({ length: 10 }, () => 'SAVED'),
  );
  expect(JSON.stringify(uses.map(({ body }) => body))).not.toContain('not-the-firms-passcode');

  await signedIn(page, ana);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
});
