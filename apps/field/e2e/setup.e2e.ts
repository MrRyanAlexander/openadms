// Setting a phone up under the master passcode in the browser build (BACKLOG 3.3.1; ADR-576),
// through the screens, against the real API in the run's own world (e2e/world-setup.ts) and its
// cast: straight on from "Monitor created" for the monitor just created; from "No assignment
// today" for the monitor signed in; and with no signal, from the sign-in screen, on the project
// whose lists the phone holds, for a monitor on its login list. Each unplanned assignment is
// reported and saved, before anything else of the monitor's where it was made with no signal;
// the passcode is typed masked, held for the act alone and never kept or reported.
//
// Other tests count on the cast as it is: Tariq with no assignment, and P1's login list of Ana, Kim
// and Lee. So the setups made online are for monitors these tests create, on P2, which nobody
// else's work names; the one made with no signal (on P1, whose lists the phone holds) is for Lee,
// already on P1's login list, whose two assignments leave him none on any other phone (an
// unplanned one names the phone it was made on).
import type { BrowserContext, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, rawlyHeld, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast, worldPasscode } from './world.ts';

const p1 = 'Bayline County ROW, Hurricane Delphine';
const p2 = 'Bayline County PPDR, Hurricane Delphine';
const said = english.setup;

const at = (asked: readonly Asked[], path: string) =>
  toApi(asked).filter((record) => record.path === path);

async function signedIn(page: Page, monitorNumber: string, password: string) {
  await page.getByLabel(english.phone.monitorNumber).fill(monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
}

async function offline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

// A monitor created on the phone under the master passcode: their Monitor ID, as the server issued it.
async function created(page: Page, asked: readonly Asked[], name: string, password: string) {
  await page.getByRole('button', { name: english.phone.createMonitor }).click();
  await page.getByLabel(english.createMonitor.name).fill(name);
  await page.getByLabel(english.createMonitor.passwordLabel).fill(password);
  await page.getByLabel(english.createMonitor.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.createMonitor.create }).click();
  await expect(page.getByRole('heading', { name: english.monitorCreated.title })).toBeVisible();
  // The answer is recorded as it is read, which may come after the screen shows it.
  await expect.poll(() => at(asked, '/phones/current/monitors').at(-1)?.answer).toBeDefined();
  const answer = at(asked, '/phones/current/monitors').at(-1)?.answer as { monitorNumber: string };
  return answer.monitorNumber;
}

// The passcode typed, masked (AC-11-63), and taken.
async function passcodeTyped(page: Page) {
  const field = page.getByLabel(said.passcode);
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveAttribute('autocomplete', 'off');
  await expect(field).toHaveAttribute('spellcheck', 'false');
  await field.fill(worldPasscode());
  await page.getByRole('button', { name: said.next }).click();
}

// A row of a list by the words it starts with: its name, before any detail beneath it.
const picked = (page: Page, name: string) =>
  page.getByRole('option', {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });

test('REQ-311a, AC-02-38, AC-11-24, AC-11-25, AC-11-23, AC-11-63: Jo Kim created on P2-COL-1 and the phone set up for him straight on: online, the project first, then his work, the site and the unit rate work; the report sent at once by the master user and saved; Jo signs in and the phone takes it', async ({
  page,
}) => {
  const asked = recorded(page);
  await enrolled(page, 'P2-COL-1');
  const jo = await created(page, asked, 'Jo Kim', '5550130');
  await page
    .getByRole('button', { name: filled(english.monitorCreated.setUp, { name: 'Jo Kim' }) })
    .click();

  await expect(page.getByRole('heading', { name: said.title })).toBeVisible();
  await checkScreen(page);
  await passcodeTyped(page);

  // The project first: the firm's open ones, from the server.
  await expect(page.getByRole('heading', { name: said.project.title })).toBeVisible();
  await expect(picked(page, p1)).toBeVisible();
  await picked(page, p2).click();
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();

  await expect(page.getByRole('heading', { name: said.work.title })).toBeVisible();
  await picked(page, said.work.kinds.COLLECTION).click();
  await picked(page, said.work.kinds.UNIT_RATE).click();
  await picked(page, said.work.forms.SURVEY).click();
  await expect(picked(page, said.work.kinds.UNIT_RATE)).toHaveAttribute('aria-selected', 'true');
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();

  // At the curb: no site.
  await expect(page.getByRole('heading', { name: said.site.title })).toBeVisible();
  await expect(picked(page, said.site.none)).toHaveAttribute('aria-selected', 'true');
  await expect(picked(page, 'Marsh Road TDSR')).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();

  // P2 has no unit rate work a monitor picks; the setup goes on without (flag, never block).
  await expect(page.getByRole('heading', { name: said.payItems.title })).toBeVisible();
  await expect(page.getByText(said.payItems.nothing)).toBeVisible();
  await checkScreen(page);
  // Jo is who it is for: no monitor to pick, and this is the last question.
  await page.getByRole('button', { name: said.make }).click();

  await expect(page.getByRole('heading', { name: said.made.title })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(said.made.saved);
  await checkScreen(page);
  await page.getByRole('button', { name: said.made.done }).click();

  // Back at sign-in, set up for Jo, his Monitor ID filled in.
  await expect(
    page.getByText(filled(english.phone.setUpFor, { name: 'Jo Kim', project: p2 })),
  ).toBeVisible();
  await expect(page.getByLabel(english.phone.monitorNumber)).toHaveValue(jo);
  await page.getByLabel(english.phone.passwordLabel).fill('5550130');
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByText(p2)).toBeVisible();
  await expect(page.locator('.screen-actions').getByRole('button')).toHaveText([
    english.home.start.collection,
    english.home.start.unitRate,
    english.home.start.survey,
  ]);

  // What went: the passcode only where it opens something, the report under the master user's
  // proof with no session and no passcode, and saved.
  const choices = at(asked, '/phones/current/setup-choices');
  expect(choices.map(({ status }) => status)).toEqual([200, 200]);
  const [first, second] = choices.map(({ body }) => body as Record<string, unknown>);
  expect(first).toEqual({ passcode: worldPasscode(), projectId: null, monitorsAfter: null });
  expect(second?.['projectId']).toEqual(expect.any(String));
  const [report] = at(asked, '/phones/current/unplanned-assignments');
  expect(report?.status).toBe(200);
  expect(report?.answer).toMatchObject({ answer: 'SAVED', reason: null });
  expect(report?.session).toBeUndefined();
  expect(report?.body).toMatchObject({
    fieldEventKinds: ['COLLECTION', 'UNIT_RATE'],
    certifying: false,
    formDocumentTypes: ['SURVEY'],
    siteId: null,
    payItemIds: [],
    occasion: 'SETUP',
  });
  const sent = toApi(asked);
  const passcodeWent = sent.filter(({ body }) =>
    JSON.stringify(body ?? '').includes(worldPasscode()),
  );
  expect([
    ...new Set(passcodeWent.map(({ path }) => path.replace(/[0-9a-f-]{36}/, ':id'))),
  ]).toEqual([
    '/phones/enrolments',
    '/phones/current/monitors',
    '/phones/current/setup-choices',
    '/phones/:id/proofs',
  ]);
  const signIn = at(asked, '/phones/current/sign-ins').at(-1);
  expect((signIn?.answer as { assignment: { id: string } }).assignment.id).toBe(
    (report?.body as { id: string }).id,
  );
  const held = await rawlyHeld(page, [worldPasscode()]);
  expect(held.foundInStore).toEqual([]);
  expect(held.webStorage).toEqual([0, 0, '']);
});

test('AC-11-15, AC-11-24, AC-02-38, AC-11-54, AC-11-63: Sam Grant signs in with no assignment today; his supervisor sets the phone up for him from there, a wrong passcode first, then the passcode pasted: on P2 at Marsh Road TDSR on disposals, and home is that work', async ({
  page,
  context,
}) => {
  const asked = recorded(page);
  await enrolled(page, 'P2-TWR-TDSR');
  const sam = await created(page, asked, 'Sam Grant', '5550131');
  await page.getByRole('button', { name: english.monitorCreated.done }).click();
  await signedIn(page, sam, '5550131');
  await expect(page.getByText(english.work.noAssignment.NONE_THAT_DAY)).toBeVisible();

  await page.getByRole('button', { name: english.work.setUp }).click();
  await page.getByLabel(said.passcode).fill('not-the-firms-passcode');
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByText(english.refusals.passcode)).toBeVisible();
  await expect(page.getByLabel(said.passcode)).toHaveValue('');
  await checkScreen(page);
  // Pasted, as from a password manager (AC-11-54); the app writes nothing to the clipboard itself.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((text) => navigator.clipboard.writeText(text), worldPasscode());
  await page.getByLabel(said.passcode).focus();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.getByLabel(said.passcode)).toHaveValue(worldPasscode());
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.getByRole('button', { name: said.next }).click();

  await picked(page, p2).click();
  await page.getByRole('button', { name: said.next }).click();
  await picked(page, said.work.kinds.DISPOSAL).click();
  await page.getByRole('button', { name: said.next }).click();
  await picked(page, 'Marsh Road TDSR').click();
  await page.getByRole('button', { name: said.make }).click();
  await expect(page.getByRole('status')).toHaveText(said.made.saved);
  await page.getByRole('button', { name: said.made.done }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
  await expect(page.getByText(p2)).toBeVisible();
  await expect(page.getByText('Marsh Road TDSR')).toBeVisible();
  await expect(page.locator('.screen-actions').getByRole('button')).toHaveText([
    english.home.start.disposal,
  ]);
  const [refused, ...taken] = at(asked, '/phones/current/setup-choices');
  expect(refused?.answer).toMatchObject({ code: 'MASTER_PASSCODE_REFUSED' });
  expect(taken.map(({ status }) => status)).toEqual([200, 200]);
  const report = at(asked, '/phones/current/unplanned-assignments')[0];
  expect(report?.answer).toMatchObject({ answer: 'SAVED' });
  expect(report?.body).toMatchObject({ fieldEventKinds: ['DISPOSAL'], siteId: expect.any(String) });
  const lists = at(asked, '/phones/current/lists').at(-1);
  expect((lists?.answer as { assignment: { id: string } }).assignment.id).toBe(
    (report?.body as { id: string }).id,
  );
});

test('AC-11-24, AC-11-25, AC-11-23, AC-02-38, AC-11-27: with no signal, P1-COL-2 holding P1’s lists is set up for Lee from the sign-in screen, a wrong passcode first: only on P1, Lee picked from its login list, then his work; Ana’s phone passing to him, a switch; he signs in from the list and works; at signal his sign-in goes first, then the unplanned assignment, then the wrong try, then the lists, which take it', async ({
  page,
  context,
}) => {
  const asked = recorded(page);
  const { ana, lee } = worldCast();
  await enrolled(page, 'P1-COL-2');
  await signedIn(page, ana.monitorNumber, ana.password);
  await expect(page.getByText(p1)).toBeVisible();
  await expect.poll(() => at(asked, '/phones/current/login-list').at(-1)?.status).toBe(200);
  await page.getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await expect(page.getByText(english.phone.nobody)).toBeVisible();

  await offline(context, page);
  await page.getByRole('button', { name: english.phone.setUp }).click();
  await page.getByLabel(said.passcode).fill('not-the-firms-passcode');
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByText(english.refusals.passcode)).toBeVisible();
  await passcodeTyped(page);

  // No project to pick: the one whose lists the phone holds. The monitors of its login list.
  await expect(page.getByRole('heading', { name: said.monitor.title })).toBeVisible();
  await expect(page.getByText(filled(said.offline, { project: p1 }))).toBeVisible();
  const names = await page.getByRole('option').locator('.list-row-label').allTextContents();
  const { kim, jo } = worldCast();
  expect(names.sort()).toEqual([ana.name, kim.name, lee.name, jo.name].sort());
  await picked(page, lee.name).click();
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();

  // The phone holds Ana's work: a switch, and Lee's work is set up here (AC-11-27).
  const handOver = filled(said.handOver.title, { name: lee.name });
  await expect(page.getByRole('heading', { name: handOver })).toBeVisible();
  await picked(page, filled(said.handOver.setUp, { name: lee.name })).click();
  await page.getByRole('button', { name: said.next }).click();

  await expect(page.getByRole('heading', { name: said.work.title })).toBeVisible();
  await checkScreen(page);
  await picked(page, said.work.kinds.COLLECTION).click();
  await page.getByRole('button', { name: said.next }).click();
  await page.getByRole('button', { name: said.make }).click();
  await expect(page.getByRole('status')).toHaveText(said.made.held);
  await checkScreen(page);
  await page.getByRole('button', { name: said.made.done }).click();

  await expect(page.getByLabel(english.phone.monitorNumber)).toHaveValue(lee.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(lee.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByText(p1)).toBeVisible();
  await expect(page.locator('.screen-actions').getByRole('button')).toHaveText([
    english.home.start.collection,
  ]);
  const before = toApi(asked).length;
  expect((await rawlyHeld(page, [worldPasscode(), 'not-the-firms-passcode'])).foundInStore).toEqual(
    [],
  );

  await context.setOffline(false);
  await expect.poll(() => at(asked, '/phones/current/login-list').length).toBe(2);
  const after = toApi(asked)
    .slice(before)
    .filter(({ path }) => !/\/(challenges|proofs)$/.test(path));
  expect(after.map(({ method, path, status }) => `${method} ${path} ${String(status)}`)).toEqual([
    'POST /phones/current/offline-sign-ins 200',
    'POST /phones/current/syncs 200',
    'GET /phones/current/lists 200',
    'POST /phones/current/login-list 200',
  ]);
  // The reports go in the sync (task 3.4.1, ADR-578), ahead of the lists that take the setup.
  const [signIn, sync, lists] = after;
  const { token } = signIn?.answer as { token: string };
  expect([sync?.session, lists?.session]).toEqual([token, token]);
  const sent = sync?.body as { unplannedAssignments: { id: string }[]; passcodeUses: unknown[] };
  const [report] = sent.unplannedAssignments;
  expect(report).toMatchObject({ fieldEventKinds: ['COLLECTION'], occasion: 'MONITOR_SWITCH' });
  expect(sent.passcodeUses).toMatchObject([{ use: 'WRONG_TRY', personId: null }]);
  expect(sync?.answer).toMatchObject({
    unplannedAssignments: [{ answer: 'SAVED' }],
    passcodeUses: [{ answer: 'SAVED' }],
  });
  expect(JSON.stringify(sent)).not.toContain(worldPasscode());
  expect(JSON.stringify(sent)).not.toContain('not-the-firms-passcode');
  expect((lists?.answer as { assignment: { id: string } }).assignment.id).toBe(report?.id);
});
