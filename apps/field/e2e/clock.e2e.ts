// The time clock on the phone, through the field app's screens (BACKLOG 3.7.2, REQ-310, C177;
// ADR-241, 598, 601), in the run's own world (e2e/world-setup.ts) against the real API: Omar
// Haddad on P2's collections, where the time clock is on (on P2 rather than P1 as AC-02-50 words
// it: every test on a project reads what another writes there, and the tests that capture on P1
// would each meet the clock's nudge). Time is in the menu only where the project has the clock
// on; clock-in, a break and clock-out are entered by hand; the two nudges never stop the work; the
// clock-out shows the day's activity pre-filled from his field events, which he changes, adds to
// from the firm's list and approves; each entry goes at the next sync, the clock-out with its
// lines, and is saved.
import type { BrowserContext, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, openedUnder, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast, worldOrigin, type CastMonitor } from './world.ts';

const said = english.clock;
const capture = english.capture;

async function signedIn(page: Page, monitor: CastMonitor): Promise<void> {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
}

// The phone's place, as the browser gives it: at 412 Cedar Ct, on P2.
async function placed(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['geolocation'], { origin: worldOrigin() });
  await context.setGeolocation({ latitude: 39.12, longitude: -75.56 });
}

const syncs = (asked: readonly Asked[]) =>
  toApi(asked).filter(({ path }) => path === '/phones/current/syncs');

interface SentEntry {
  readonly id: string;
  readonly kind: string;
  readonly workerId: string;
  readonly activityLines: readonly Record<string, unknown>[];
}

// Every clock entry the syncs carried, each with what the server answered of it.
function entriesSent(asked: readonly Asked[]): { entry: SentEntry; answer: string | undefined }[] {
  return syncs(asked).flatMap(({ body, answer }) => {
    const records = (body as { records: { record: string; clockEntry?: SentEntry }[] }).records;
    const answers = (answer as { records?: { answer: string }[] } | undefined)?.records ?? [];
    return records.flatMap((record, place) =>
      record.clockEntry === undefined
        ? []
        : [{ entry: record.clockEntry, answer: answers[place]?.answer }],
    );
  });
}

const strip = (page: Page) => page.locator('.status-strip');
const menuItems = (page: Page) => page.getByRole('navigation', { name: english.menu.label });

// The time of day now in P2's time zone, on the 24-hour clock: what a time field takes.
function nowInBayline(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

// A collection opened on P2 for Rivera's self-loader 730416, which his lists don't hold: "normal",
// the badge, then carried on with (flag, never block). The ticket's number.
async function collectionOpened(page: Page): Promise<string> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(capture.split.title);
  await page.getByRole('button', { name: capture.split.normal }).click();
  await page.getByLabel(capture.badge.label).fill('730416');
  await page.getByRole('button', { name: capture.badge.start }).click();
  await page
    .getByRole('button', { name: filled(capture.unknownBadge.continue, { number: '730416' }) })
    .click();
  return openedUnder(page);
}

test('AC-02-50, C177: on P2, where the time clock is on, Time is in Omar’s menu and the strip says where he stands; he clocks in, starts and ends a break and clocks out by hand on his assignment, offered only what comes next; each entry goes at the next sync and is saved', async ({
  page,
}) => {
  const { omar } = worldCast();
  const asked = recorded(page);
  await enrolled(page, 'P2-COL-E2E');
  await signedIn(page, omar);
  await expect(menuItems(page).getByRole('button')).toHaveText([
    english.menu.work,
    english.menu.time,
    english.menu.sync,
    english.menu.settings,
  ]);
  await expect(strip(page)).toContainText(english.look.strip.clock.out);

  await menuItems(page).getByRole('button', { name: english.menu.time }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.title);
  await expect(page.getByText(said.standing.OUT, { exact: true })).toBeVisible();
  await expect(page.getByText(said.entries.none)).toBeVisible();
  const actions = page.locator('.screen-actions').getByRole('button');
  await expect(actions).toHaveText([said.enter.IN]);
  await checkScreen(page);

  await page.getByRole('button', { name: said.enter.IN }).click();
  await expect(page.getByText(said.standing.IN)).toBeVisible();
  await expect(strip(page)).toContainText(english.look.strip.clock.in);
  await expect(actions).toHaveText([said.enter.BREAK_START, said.enter.OUT]);
  await page.getByRole('button', { name: said.enter.BREAK_START }).click();
  await expect(page.getByText(said.standing.BREAK)).toBeVisible();
  await expect(strip(page)).toContainText(english.look.strip.clock.break);
  await expect(actions).toHaveText([said.enter.BREAK_END, said.enter.OUT]);
  await page.getByRole('button', { name: said.enter.BREAK_END }).click();
  await expect(page.getByText(said.standing.IN)).toBeVisible();
  await expect(page.getByText(said.kept)).toBeVisible();
  for (const kind of ['IN', 'BREAK_START', 'BREAK_END'] as const) {
    await expect(
      page.locator('.facts dt').getByText(said.entries[kind], { exact: true }),
    ).toBeVisible();
  }
  await checkScreen(page);

  // Clocked out from Time, with no field event to pre-fill a line from: the day approved as it is.
  await page.getByRole('button', { name: said.enter.OUT }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.out.title);
  await expect(page.getByText(said.out.none)).toBeVisible();
  await page.getByRole('button', { name: said.out.approve }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.title);
  await expect(page.getByText(said.standing.OUT)).toBeVisible();
  await expect(actions).toHaveText([said.enter.IN]);

  // With the next sync, every entry goes and is saved, his own, on his assignment.
  const before = syncs(asked).length;
  await menuItems(page).getByRole('button', { name: english.menu.sync }).click();
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect
    .poll(() =>
      syncs(asked)
        .slice(before)
        .some(({ answer }) => answer !== undefined),
    )
    .toBe(true);
  await expect
    .poll(() => entriesSent(asked).map(({ entry, answer }) => [entry.kind, answer]))
    .toEqual([
      ['IN', 'SAVED'],
      ['BREAK_START', 'SAVED'],
      ['BREAK_END', 'SAVED'],
      ['OUT', 'SAVED'],
    ]);
  const workers = new Set(entriesSent(asked).map(({ entry }) => entry.workerId));
  expect(workers.size).toBe(1);
  await expect(page.getByText(english.sync.nothingWaits)).toBeVisible();
});

test('AC-02-50, C177: on P1, where the time clock is off, Ana’s menu has no Time and the strip says nothing of a clock', async ({
  page,
}) => {
  const { ana } = worldCast();
  await enrolled(page, 'P1-COL-E2E-T');
  await signedIn(page, ana);
  // Once the phone holds P1's lists, which say the clock is off: her work starts from them.
  await expect(page.getByRole('button', { name: english.home.start.collection })).toBeEnabled();
  await expect(menuItems(page).getByRole('button')).toHaveText([
    english.menu.work,
    english.menu.sync,
    english.menu.settings,
  ]);
  for (const word of Object.values(english.look.strip.clock)) {
    await expect(strip(page)).not.toContainText(word);
  }
});

test('AC-02-51: Omar, not clocked in, starts a collection and is asked "You’re not clocked in. Clock in now?": "Not now" and the work goes on; asked again, he clocks in and it goes on; signing out clocked in asks "Clock out?", and he goes back, then signs out still clocked in: nothing stops the work', async ({
  page,
  context,
}) => {
  const { omar } = worldCast();
  await placed(context);
  await enrolled(page, 'P2-COL-E2E-2');
  await signedIn(page, omar);
  await expect(strip(page)).toContainText(english.look.strip.clock.out);

  await page.getByRole('button', { name: english.home.start.collection }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.nudgeIn.title);
  await checkScreen(page);
  await page.getByRole('button', { name: said.nudgeIn.no }).click();
  const number = await collectionOpened(page);
  await page.getByRole('button', { name: capture.leave }).click();
  await expect(
    page.getByText(filled(english.home.open.ticket, { truck: '730416', number })),
  ).toBeVisible();
  await expect(strip(page)).toContainText(english.look.strip.clock.out);

  // Asked again on the next start: clocked in now, and the work goes on as before.
  await page.getByRole('button', { name: english.home.start.collection }).click();
  await page.getByRole('button', { name: said.nudgeIn.yes }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(capture.split.title);
  await expect(strip(page)).toContainText(english.look.strip.clock.in);
  await page.getByRole('button', { name: capture.split.normal }).click();
  await page.getByLabel(capture.badge.label).fill('730416');
  // The truck's one open ticket opens again (ADR-571), its badge asked after no more.
  await page.getByRole('button', { name: capture.badge.start }).click();
  expect(await openedUnder(page)).toBe(number);
  await page.getByRole('button', { name: capture.leave }).click();

  // Signing out while clocked in: "Clock out?"; back, still signed in.
  await menuItems(page).getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.nudgeOut.title);
  await checkScreen(page);
  await page.getByRole('button', { name: said.nudgeOut.back }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.settings.title);
  // Then signed out still clocked in: the open ticket kept, and he is clocked in when he's back.
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await page.getByRole('button', { name: said.nudgeOut.no }).click();
  await expect(page.getByRole('button', { name: english.phone.signIn })).toBeVisible();
  await signedIn(page, omar);
  await expect(strip(page)).toContainText(english.look.strip.clock.in);
  await expect(
    page.getByText(filled(english.home.open.ticket, { truck: '730416', number })),
  ).toBeVisible();
});

test('AC-02-52: Omar clocks in, submits a collection and signs out: "Clock out?", and clocking out shows his day pre-filled from the collection; he adds a note to its line, adds the drive back picked from the firm’s list (a time that ends before it starts said, not taken), approves and is signed out; with the next sync the clock-out carries both lines and is saved', async ({
  page,
  context,
}) => {
  const { omar } = worldCast();
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P2-COL-E2E-3');
  await signedIn(page, omar);
  await menuItems(page).getByRole('button', { name: english.menu.time }).click();
  await page.getByRole('button', { name: said.enter.IN }).click();
  await expect(page.getByText(said.standing.IN)).toBeVisible();

  // A collection, clocked in: no nudge.
  await menuItems(page).getByRole('button', { name: english.menu.work }).click();
  await page.getByRole('button', { name: english.home.start.collection }).click();
  const number = await collectionOpened(page);
  await page.getByRole('button', { name: capture.open.complete }).click();
  await page.getByRole('option', { name: 'Vegetative', exact: true }).click();
  // P2's ROEs, where the forms' tests made some first, are offered: none is this load's.
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText(new RegExp(`^(${capture.roe.title}|${capture.place.title})$`));
  if ((await heading.textContent()) === capture.roe.title) {
    await page.getByRole('button', { name: capture.roe.none }).click();
  }
  await expect(heading).toHaveText(capture.place.title);
  await page.getByLabel(capture.place.typed).fill('412 Cedar Ct');
  await page.getByRole('button', { name: capture.next }).click();
  await page.getByRole('button', { name: capture.next }).click();
  await page.getByRole('button', { name: capture.review.submit }).click();
  await page.getByRole('button', { name: capture.submitted.home }).click();

  // Signing out clocked in: "Clock out?", and he clocks out.
  await menuItems(page).getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await page.getByRole('button', { name: said.nudgeOut.yes }).click();
  await expect(heading).toHaveText(said.out.title);
  await expect(page.getByText(said.out.signOutAfter)).toBeVisible();
  const prefilled = filled(said.line.work.none, { kind: capture.kinds.COLLECTION, number });
  await expect(page.getByText(prefilled)).toBeVisible();
  await checkScreen(page);

  // The pre-filled line opened: its times as pre-filled, a note added.
  await page.getByText(prefilled).click();
  await expect(heading).toHaveText(said.line.editTitle);
  await expect(page.getByLabel(said.line.from, { exact: true })).toHaveValue(/^\d{2}:\d{2}$/);
  await page.getByLabel(said.line.note).fill('Cedar Ct loads');
  await checkScreen(page);
  await page.getByRole('button', { name: said.line.save }).click();
  await expect(page.getByText(`${prefilled} · Cedar Ct loads`)).toBeVisible();

  // A line the app can't know, from the firm's list: what it was is asked, and a line that ends
  // before it starts is said, then put right.
  await page.getByRole('button', { name: said.out.add }).click();
  await expect(heading).toHaveText(said.line.addTitle);
  await page.getByRole('button', { name: said.line.save }).click();
  await expect(page.getByText(said.line.pickOne)).toBeVisible();
  await page.getByRole('option', { name: 'Travel', exact: true }).click();
  await page.getByLabel(said.line.from, { exact: true }).fill('23:59');
  await page.getByLabel(said.line.to, { exact: true }).fill('00:00');
  await page.getByRole('button', { name: said.line.save }).click();
  await expect(page.getByText(said.line.endsFirst)).toBeVisible();
  await checkScreen(page);
  await page.getByLabel(said.line.from, { exact: true }).fill('00:00');
  await page.getByLabel(said.line.to, { exact: true }).fill(nowInBayline());
  await page.getByLabel(said.line.note).fill('Back to the yard');
  await page.getByRole('button', { name: said.line.save }).click();
  await expect(page.getByText('Travel · Back to the yard')).toBeVisible();

  // Approved: clocked out, then signed out, as the nudge said.
  await page.getByRole('button', { name: said.out.approve }).click();
  await expect(page.getByRole('button', { name: english.phone.signIn })).toBeVisible();

  // Signed in again, the phone syncs: the clock-out carries both lines, and is saved.
  await signedIn(page, omar);
  await expect
    .poll(() => entriesSent(asked).find(({ entry }) => entry.kind === 'OUT')?.answer)
    .toBe('SAVED');
  const lists = toApi(asked).find(({ path }) => path === '/phones/current/lists')?.answer as {
    lists: { timeClock: { enabled: boolean; activities: { id: string; name: string }[] } };
  };
  expect(lists.lists.timeClock.enabled).toBe(true);
  const travel = lists.lists.timeClock.activities.find(({ name }) => name === 'Travel')?.id;
  const collection = syncs(asked)
    .flatMap(
      ({ body }) =>
        (body as { records: { fieldEvent?: { id: string; ticketNumber: string } }[] }).records,
    )
    .find((record) => record.fieldEvent?.ticketNumber === number)?.fieldEvent?.id;
  const out = entriesSent(asked).find(({ entry }) => entry.kind === 'OUT')?.entry;
  expect(out?.activityLines).toEqual([
    expect.objectContaining({ fieldEventId: collection, activityId: null, note: 'Cedar Ct loads' }),
    expect.objectContaining({ fieldEventId: null, activityId: travel, note: 'Back to the yard' }),
  ]);
  expect(entriesSent(asked).map(({ entry, answer }) => [entry.kind, answer])).toEqual([
    ['IN', 'SAVED'],
    ['OUT', 'SAVED'],
  ]);
  await expect(strip(page)).toContainText(english.look.strip.clock.out);
});
