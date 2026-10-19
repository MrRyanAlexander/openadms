// The tower and the haul-out, through the field app's screens (BACKLOG 3.5.2; ADR-571, 573, 582),
// in the run's own world (e2e/world-setup.ts) against the real API: Kim Nguyen at Marsh Road
// TDSR's tower, where every load is called; Lee Morgan, whose two assignments leave him none on a
// phone the board doesn't name, set up under the master passcode for the haul-outs leaving Marsh
// Road, and for the towers of Bayline County Landfill and then, with no signal, Cypress Creek
// Landfill, whose lookup weighs a load of Vegetative to FDS and a haul-out of Mulch and counts a
// load of white goods (the world's P1 pricing, as the golden mission and `p1-left-out` set it).
//
// Other tests count on the cast as it is (setup.e2e.ts): the assignments made here name the phone
// they were made on alone, and no monitor is created.
import type { BrowserContext, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast, worldOrigin, worldPasscode, type CastMonitor } from './world.ts';

const said = english.capture;
const p1 = 'Bayline County ROW, Hurricane Delphine';
const marshRoad = 'Marsh Road TDSR';
const landfill = 'Bayline County Landfill';
const cypress = 'Cypress Creek Landfill';

// A photograph from the camera, as the browser hands the page one: a small PNG.
const photo = {
  name: 'bed.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGPI7lOGIwbiOADSQxHBtdEJMAAAAABJRU5ErkJggg==',
    'base64',
  ),
};

const at = (asked: readonly Asked[], path: string) =>
  toApi(asked).filter((record) => record.path === path);
const syncs = (asked: readonly Asked[]) => at(asked, '/phones/current/syncs');

interface SentEvent {
  readonly id: string;
  readonly kind: string;
  readonly ticketNumber: string;
  readonly splitSuffix: string;
  readonly loadCall: number | null;
  readonly carriedCount: number | null;
  readonly scaleReceiptId: string | null;
  readonly numberTyped: boolean;
  readonly siteId: string | null;
  readonly fieldTagId: string | null;
}
type Sent =
  | { readonly record: 'FIELD_EVENT'; readonly fieldEvent: SentEvent }
  | {
      readonly record: 'SCALE_RECEIPT';
      readonly scaleReceipt: Record<string, unknown> & { readonly id: string };
    };

// The records the syncs since a moment sent, and what each was answered.
function sentSince(asked: readonly Asked[], from: number) {
  const runs = syncs(asked).slice(from);
  return {
    records: runs.flatMap(({ body }) => (body as { records: Sent[] }).records),
    answers: runs.flatMap(
      ({ answer }) =>
        (answer as { records?: { answer: string }[] } | undefined)?.records?.map(
          ({ answer: one }) => one,
        ) ?? [],
    ),
  };
}

async function signedIn(page: Page, monitor: CastMonitor) {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
}

// The phone's place, as the browser gives it: allowed for the app's own page, at the tower.
async function placed(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['geolocation'], { origin: worldOrigin() });
  await context.setGeolocation({ latitude: 39.0903, longitude: -75.6202 });
}

async function offline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

// The number typed on the keypad, digit by digit.
async function typed(page: Page, number: string): Promise<void> {
  for (const digit of number) await page.getByRole('button', { name: digit, exact: true }).click();
}

// A row of a list by the words it starts with: its name, before any detail beneath it.
const picked = (page: Page, name: string) =>
  page.getByRole('option', {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });

// Sync now, from the Sync screen, and back to Work once its run has gone.
async function syncedNow(page: Page, asked: readonly Asked[]): Promise<number> {
  const before = syncs(asked).length;
  await page.getByRole('button', { name: english.menu.sync }).click();
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect.poll(() => syncs(asked).slice(before).at(-1)?.answer).toBeDefined();
  await expect(page.getByText(english.sync.nothingWaits)).toBeVisible();
  await page.getByRole('button', { name: english.menu.work }).click();
  return before;
}

// Lee signed in on a phone just enrolled, told he has more than one assignment, and the phone set
// up under the master passcode for his work at a site, online: the lists read for it.
async function leeSetUp(
  page: Page,
  asked: readonly Asked[],
  name: string,
  work: readonly (keyof typeof english.setup.work.kinds)[],
  site: string,
) {
  const { lee } = worldCast();
  await enrolled(page, name);
  await signedIn(page, lee);
  await expect(page.getByText(english.work.noAssignment.SEVERAL_THAT_DAY)).toBeVisible();
  await page.getByRole('button', { name: english.work.setUp }).click();
  await page.getByLabel(english.setup.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.setup.next }).click();
  await picked(page, p1).click();
  await page.getByRole('button', { name: english.setup.next }).click();
  for (const kind of work) await picked(page, english.setup.work.kinds[kind]).click();
  await page.getByRole('button', { name: english.setup.next }).click();
  await picked(page, site).click();
  await page.getByRole('button', { name: english.setup.make }).click();
  await expect(page.getByRole('status')).toHaveText(english.setup.made.saved);
  await page.getByRole('button', { name: english.setup.made.done }).click();
  await expect(page.getByText(site)).toBeVisible();
  await expect.poll(() => at(asked, '/phones/current/login-list').length).toBe(2);
}

// New: the badge, then the driver's ticket scanned (the field app's own words for each).
async function begun(page: Page, start: string, badge: string, ticket: string) {
  await page.getByRole('button', { name: start }).click();
  await page.getByLabel(said.badge.label).fill(badge);
  await page.getByRole('button', { name: said.badge.start }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.number.ticketTitle);
  await page.getByLabel(said.number.ticketLabel).fill(ticket);
  await page.getByRole('button', { name: said.number.open }).click();
}

// The scale receipt copied by hand: its number, then each weight the paper shows.
async function receiptCopied(page: Page, number: string, weights: readonly string[]) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.receipt.title);
  await page.getByLabel(said.receipt.number).fill(number);
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.receipt.weightsTitle);
  const fields = [said.receipt.gross, said.receipt.tare, said.receipt.net, said.receipt.tons];
  for (const [place, weight] of weights.entries()) {
    const field = page.getByLabel(fields[place] ?? '');
    await expect(field).toHaveAttribute('inputmode', 'decimal');
    await field.fill(weight);
  }
}

// Photos (none more), the review, submitted.
async function submitted(page: Page, number: string, shown: readonly string[]) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.photos.title);
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.review.title);
  for (const value of shown) {
    await expect(page.locator('.facts').getByText(value, { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: said.review.submit }).click();
  await expect(page.getByText(filled(said.submitted.saved, { number }))).toBeVisible();
  await page.getByRole('button', { name: said.submitted.home }).click();
}

test('AC-11-74, AC-11-82, AC-11-40, AC-11-79, AC-11-78, AC-11-05, AC-04-96, AC-04-44, REQ-304, REQ-308a: at Marsh Road TDSR Kim scans 730415’s badge, then the driver’s ticket, never typed again; with the network off she picks C&D and types the load call on the keypad, 101 refused as no call and 80 taken with no "is that right?", photographs the empty bed and sees it on the review; the same barcode again is questioned, a typed one has its reason; a load turned away is cancelled and never sent', async ({
  page,
  context,
}) => {
  const { kim } = worldCast();
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P1-TWR-E2E');
  await signedIn(page, kim);
  await expect(page.getByText(marshRoad)).toBeVisible();
  await expect.poll(() => at(asked, '/phones/current/login-list').length).toBe(1);

  // New: the site is the assignment's, never asked; no "normal or split?" at a tower.
  await page.getByRole('button', { name: english.home.start.disposal }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.badge.title);
  await page.getByLabel(said.badge.label).fill('730415');
  await expect(
    page.getByText(filled(said.badge.truck, { number: '730415', capacity: '65' })),
  ).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.badge.start }).click();
  // The driver's ticket scanned: never a number made here, never typed again.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.number.ticketTitle);
  await expect(page.locator('.big-number')).toHaveCount(0);
  await page.getByLabel(said.number.ticketLabel).fill('101001');
  await checkScreen(page);
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.title, { kind: said.kinds.DISPOSAL, number: '101001' }),
  );

  // The network off from here: nothing waits on the server.
  await offline(context, page);
  await page.locator('input[type=file]').setInputFiles(photo);
  await expect(page.getByRole('img')).toHaveCount(1);
  await page.getByRole('button', { name: said.open.complete }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.debris.title);
  await checkScreen(page);
  await page.getByRole('option', { name: 'C&D', exact: true }).click();
  // Straight on to the load call: typed on the keypad, 0–100, nothing more said.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.call.title);
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  await typed(page, '101');
  await expect(page.getByText(said.call.over)).toBeVisible();
  await expect(page.getByRole('button', { name: said.next })).toBeDisabled();
  await checkScreen(page);
  for (let erased = 0; erased < 3; erased += 1) {
    await page.getByRole('button', { name: english.look.keypad.delete }).click();
  }
  await typed(page, '80');
  await expect(page.getByText(said.call.over)).toHaveCount(0);
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.photos.title);
  await page.getByRole('button', { name: said.next }).click();

  // The review: every value once, the photograph itself.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.review.title);
  for (const value of ['730415', '101001', marshRoad, 'C&D', '80%']) {
    await expect(page.locator('.facts').getByText(value, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('img', { name: /^Photo 1 of 1, / })).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.review.submit }).click();
  await expect(page.getByText(filled(said.submitted.saved, { number: '101001' }))).toBeVisible();
  await page.getByRole('button', { name: english.home.start.disposal }).click();

  // The same barcode again: this phone holds 101001 already, and says so before taking it.
  await page.getByLabel(said.badge.label).fill('730416');
  await page.getByRole('button', { name: said.badge.start }).click();
  await page.getByLabel(said.number.ticketLabel).fill('101001');
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(
    page.getByText(
      new RegExp(
        `^${filled(said.question.onThisPhone, { number: '101001', kind: 'disposal', time: 'XX' })
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace('XX', '.+')}$`,
      ),
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: said.question.back }).click();
  // The barcode won't read: typed, a reason picked, typed again.
  await page.getByRole('button', { name: said.number.wontRead }).click();
  await typed(page, '101060');
  await page.getByRole('button', { name: said.next }).click();
  await page.getByRole('option', { name: 'Barcode damaged' }).click();
  await typed(page, '101060');
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.title, { kind: said.kinds.DISPOSAL, number: '101060' }),
  );
  // Turned away: cancelled, kept on the phone, never sent.
  await page.getByRole('button', { name: said.open.cancel }).click();
  await expect(page.getByText(said.open.turnedAway)).toBeVisible();
  await page.getByRole('button', { name: said.open.cancelYes }).click();
  await expect(page.getByText(filled(english.home.today.one, {}))).toBeVisible();

  // With signal: the disposal goes with its load call, at the assignment's site; nothing else.
  await context.setOffline(false);
  const from = await syncedNow(page, asked);
  const sent = sentSince(asked, from);
  expect(sent.records.map((record) => record.record)).toEqual(['FIELD_EVENT']);
  expect(sent.records[0]).toMatchObject({
    fieldEvent: {
      kind: 'DISPOSAL',
      ticketNumber: '101001',
      certNumber: '730415',
      numberTyped: false,
      loadCall: 80,
      carriedCount: null,
      scaleReceiptId: null,
      fieldTagId: null,
      endLatitude: '39.09030000',
    },
  });
  expect(sent.answers).toEqual(['SAVED']);
});

test('AC-11-74, AC-11-79, REQ-305, ADR-295: Lee, set up for the haul-outs leaving Marsh Road TDSR, answers "split": 730415’s first pile opens as -A under the number the phone made, typed again; each pile gives its debris type, its field tag and the load call so far, the pile before’s shown; both go at the next sync', async ({
  page,
  context,
}) => {
  await placed(context);
  const asked = recorded(page);
  await leeSetUp(page, asked, 'P1-HO-E2E', ['HAUL_OUT_COLLECTION'], marshRoad);

  // P1 allows split loads: "normal or split?", its words for piles.
  await page.getByRole('button', { name: english.home.start.haulOutCollection }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.split.title);
  await expect(page.getByText(said.split.piles)).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.split.split }).click();
  await page.getByLabel(said.badge.label).fill('730415');
  await page.getByRole('button', { name: said.badge.start }).click();
  // The haul-out's own number, shown and typed again (its first block came with its lists).
  const number = (await page.locator('.big-number').first().textContent()) ?? '';
  expect(number).toMatch(/^\d+$/);
  await typed(page, number);
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.split, { kind: said.kinds.HAUL_OUT_COLLECTION, number, suffix: 'A' }),
  );

  const pile = async (suffix: string, tag: string, call: string, before: string | null) => {
    await page.getByRole('button', { name: said.open.complete }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.debris.title);
    const mulch = page.getByRole('option', { name: 'Mulch', exact: true });
    if ((await mulch.getAttribute('aria-selected')) === 'true') {
      await page.getByRole('button', { name: said.next }).click();
    } else await mulch.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.tag.title);
    await checkScreen(page);
    await page.getByRole('option', { name: tag, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.call.pileTitle);
    if (before !== null) {
      await expect(
        page.getByText(filled(said.call.pileBefore, { suffix: 'A', call: before })),
      ).toBeVisible();
    }
    await typed(page, call);
    await checkScreen(page);
    await page.getByRole('button', { name: said.next }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.photos.title);
    await page.getByRole('button', { name: said.next }).click();
    for (const value of [`${number}-${suffix}`, 'Mulch', tag, `${call}%`]) {
      await expect(page.locator('.facts').getByText(value, { exact: true })).toBeVisible();
    }
    await expect(page.locator('.facts').getByText(said.review.callSoFar)).toBeVisible();
    await page.getByRole('button', { name: said.review.submit }).click();
  };
  await pile('A', 'Zone 1 pile', '10', null);
  await page
    .getByRole('button', { name: filled(said.submitted.nextPile, { number, suffix: 'B' }) })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.split, { kind: said.kinds.HAUL_OUT_COLLECTION, number, suffix: 'B' }),
  );
  await pile('B', 'Mixed', '35', '10');
  await page.getByRole('button', { name: said.submitted.home }).click();

  const from = await syncedNow(page, asked);
  const sent = sentSince(asked, from);
  const events = sent.records.flatMap((record) =>
    record.record === 'FIELD_EVENT' ? [record.fieldEvent] : [],
  );
  expect(
    events.map(({ kind, ticketNumber, splitSuffix, loadCall }) => [
      kind,
      ticketNumber,
      splitSuffix,
      loadCall,
    ]),
  ).toEqual([
    ['HAUL_OUT_COLLECTION', number, 'A', 10],
    ['HAUL_OUT_COLLECTION', number, 'B', 35],
  ]);
  expect(events[0]?.fieldTagId).not.toBe(events[1]?.fieldTagId);
  expect(sent.answers).toEqual(['SAVED', 'SAVED']);
});

test('AC-04-38, AC-11-41, C182, REQ-305, REQ-124f, AC-05-10: Lee, set up for the Landfill’s tower, takes nothing more of a haul-out of Mulch; moved with no signal to Cypress Creek Landfill, whose lookup the phone doesn’t hold, it says so and takes the load call, the scale receipt added; at signal its lookup read, a load of Vegetative to FDS asks the scale weight and never a load call, the tandem’s second points at the first’s receipt, a load of white goods asks the count of its tickets, a haul-out of Mulch the weight', async ({
  page,
  context,
}) => {
  await placed(context);
  const asked = recorded(page);
  await leeSetUp(page, asked, 'P1-TWR-LF-E2E', ['DISPOSAL', 'HAUL_OUT_DISPOSAL'], landfill);

  // A haul-out of Mulch at the Landfill is paid by the CY from its loading end's call: nothing
  // more to take, the receipt only offered.
  await begun(page, english.home.start.haulOutDisposal, '730415', '201001');
  await page.getByRole('button', { name: said.open.complete }).click();
  await page.getByRole('option', { name: 'Mulch', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.nothing.title);
  await expect(page.getByRole('button', { name: said.receipt.add })).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();
  await submitted(page, '201001', ['201001', landfill, 'Mulch']);

  // Moved with no signal to Cypress Creek Landfill: the phone holds no lookup for it.
  await offline(context, page);
  await page.getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.move }).click();
  await page.getByLabel(english.move.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.move.next }).click();
  await picked(page, cypress).click();
  await page.getByRole('button', { name: english.move.make }).click();
  await page.getByRole('button', { name: english.move.made.done }).click();
  await expect(page.getByText(cypress)).toBeVisible();

  await begun(page, english.home.start.disposal, '730415', '101050');
  await page.getByRole('button', { name: said.open.complete }).click();
  await page.getByRole('option', { name: 'Vegetative to FDS', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.call.title);
  await expect(page.getByText(filled(said.quantity.notHeldLoad, { site: cypress }))).toBeVisible();
  await expect(page.getByRole('button', { name: said.receipt.add })).toBeDisabled();
  await checkScreen(page);
  await typed(page, '80');
  await page.getByRole('button', { name: said.receipt.add }).click();
  await receiptCopied(page, 'CCL-51310', ['62,800', '28600', '34200', '17.1']);
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();
  await submitted(page, '101050', [
    '80%',
    'CCL-51310 · gross 62,800 lb · tare 28,600 lb · net 34,200 lb · 17.1 tons',
  ]);

  // With signal: the move and the disposal with its receipt go; the lists read are Cypress
  // Creek's, its lookup with them.
  await context.setOffline(false);
  const lists = at(asked, '/phones/current/lists').length;
  const first = await syncedNow(page, asked);
  await expect.poll(() => at(asked, '/phones/current/lists').length).toBeGreaterThan(lists);
  const moved = sentSince(asked, first);
  // The Landfill's haul-out first, as it was submitted: nothing more than its debris type.
  expect(moved.records.map((record) => record.record)).toEqual([
    'FIELD_EVENT',
    'SCALE_RECEIPT',
    'FIELD_EVENT',
  ]);
  const [haulOut, receipt, called] = moved.records;
  expect(haulOut).toMatchObject({
    fieldEvent: {
      kind: 'HAUL_OUT_DISPOSAL',
      ticketNumber: '201001',
      loadCall: null,
      carriedCount: null,
      scaleReceiptId: null,
    },
  });
  const receiptId = receipt?.record === 'SCALE_RECEIPT' ? receipt.scaleReceipt.id : 'none';
  expect(receipt).toMatchObject({
    scaleReceipt: {
      receiptNumber: 'CCL-51310',
      grossWeightLb: 62800,
      tareWeightLb: 28600,
      netWeightLb: 34200,
      netWeightTons: 17.1,
    },
  });
  expect(called).toMatchObject({
    fieldEvent: { ticketNumber: '101050', loadCall: 80, scaleReceiptId: receiptId },
  });
  expect(moved.answers).toEqual(['SAVED', 'SAVED', 'SAVED']);
  const read = at(asked, '/phones/current/lists').at(-1)?.answer as {
    lists: { quantityLookup: { asks: string }[] };
  };
  expect(read.lists.quantityLookup.map(({ asks }) => asks)).toContain('SCALE_WEIGHT');

  // A load of Vegetative to FDS on Coastline's 730416: the scale weight, never a load call; the
  // tandem's second disposal points at the receipt copied with the first.
  await begun(page, english.home.start.disposal, '730416', '101051');
  await page.getByRole('button', { name: said.open.complete }).click();
  await page.getByRole('option', { name: 'Vegetative to FDS', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.weight.title);
  await expect(page.getByText(filled(said.weight.about, { site: cypress }))).toBeVisible();
  await expect(page.getByRole('heading', { name: said.call.title })).toHaveCount(0);
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.receipt.title);
  await picked(page, filled(said.receipt.same, { number: '101050', receipt: 'CCL-51310' })).click();
  await submitted(page, '101051', ['Vegetative to FDS']);

  // A load of white goods: the count of the tickets it carries.
  await begun(page, english.home.start.disposal, '730415', '101014');
  await page.getByRole('button', { name: said.open.complete }).click();
  await page.getByRole('option', { name: 'White Goods', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.count.title);
  await checkScreen(page);
  await typed(page, '1');
  await page.getByRole('button', { name: said.next }).click();
  await submitted(page, '101014', ['White Goods', '1']);

  // A haul-out of Mulch at Cypress Creek: the weight, off its own receipt.
  await begun(page, english.home.start.haulOutDisposal, '730415', '201004');
  await page.getByRole('button', { name: said.open.complete }).click();
  await page.getByRole('option', { name: 'Mulch', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.weight.title);
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.receipt.title);
  await page.getByLabel(said.receipt.number).fill('CCL-51207');
  await page.getByRole('button', { name: said.next }).click();
  await page.getByLabel(said.receipt.tons).fill('24');
  await page.getByRole('button', { name: said.next }).click();
  await submitted(page, '201004', ['Mulch', 'CCL-51207 · 24 tons']);

  const second = await syncedNow(page, asked);
  const weighed = sentSince(asked, second);
  const events = weighed.records.flatMap((record) =>
    record.record === 'FIELD_EVENT' ? [record.fieldEvent] : [],
  );
  expect(weighed.records.map((record) => record.record)).toEqual([
    'FIELD_EVENT',
    'FIELD_EVENT',
    'SCALE_RECEIPT',
    'FIELD_EVENT',
  ]);
  expect(
    events.map(({ kind, ticketNumber, loadCall, carriedCount }) => [
      kind,
      ticketNumber,
      loadCall,
      carriedCount,
    ]),
  ).toEqual([
    ['DISPOSAL', '101051', null, null],
    ['DISPOSAL', '101014', null, 1],
    ['HAUL_OUT_DISPOSAL', '201004', null, null],
  ]);
  expect(events[0]?.scaleReceiptId).toBe(receiptId);
  expect(events[1]?.scaleReceiptId).toBeNull();
  const ccl = weighed.records.find(
    (record): record is Extract<Sent, { record: 'SCALE_RECEIPT' }> =>
      record.record === 'SCALE_RECEIPT',
  );
  expect(ccl).toMatchObject({ scaleReceipt: { receiptNumber: 'CCL-51207', netWeightTons: 24 } });
  expect(events[2]?.scaleReceiptId).toBe(ccl?.scaleReceipt.id);
  expect(weighed.answers).toEqual(['SAVED', 'SAVED', 'SAVED', 'SAVED']);
});
