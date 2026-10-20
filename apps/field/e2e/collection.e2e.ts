// The collection, through the field app's screens (BACKLOG 3.5.1; ADR-571, 573, 581), in the run's
// own world (e2e/world-setup.ts) against the real API: Ana Brooks on P1, which generates its
// numbers and allows split loads; Sam Grant on the PARKS project, which numbers its loads from
// pre-printed control tickets 400001–405000. Each ticket opens at New, under the badge and then
// its number; it waits in home's open list, kept across a sign-out and the app opened again; it
// is completed with the network off; it goes at the next sync, sealed.
import type { BrowserContext, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, photographed, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast, worldOrigin, type CastMonitor } from './world.ts';

const said = english.capture;

async function signedIn(page: Page, monitor: CastMonitor): Promise<void> {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
}

// The phone's place, as the browser gives it: allowed for the app's own page, here at Heron St.
async function placed(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['geolocation'], { origin: worldOrigin() });
  await context.setGeolocation({ latitude: 39.1385, longitude: -75.5537 });
}

const syncs = (asked: readonly Asked[]) =>
  toApi(asked).filter(({ path }) => path === '/phones/current/syncs');

// The number typed on the keypad, digit by digit.
async function typed(page: Page, number: string): Promise<void> {
  for (const digit of number) await page.getByRole('button', { name: digit, exact: true }).click();
}

test('AC-11-74, AC-11-82, AC-04-91, AC-04-11, AC-11-36, AC-11-37, AC-11-68, AC-04-98, C184: Ana answers "normal", scans 730415 and is shown the phone’s next number, which she types again; typed wrong it opens nothing, typed right the collection opens under it before any detail; its first block came with her first sync', async ({
  page,
  context,
}) => {
  const { ana } = worldCast();
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P1-COL-E2E');
  await signedIn(page, ana);

  // Her lists say P1 generates its load numbers: the same run asked for the first block.
  await expect.poll(() => syncs(asked)[1]?.answer).toBeDefined();
  expect(syncs(asked)).toHaveLength(2);
  const [, second] = syncs(asked);
  const projectId = (second?.body as { lastUsed: { projectId: string }[] }).lastUsed[0]?.projectId;
  expect((second?.body as { lastUsed: unknown[] }).lastUsed).toEqual([
    { projectId, series: 'LOAD', lastUsedNumber: null },
  ]);
  const block = (second?.answer as { numbers: { blocks: { firstNumber: number }[] }[] }).numbers[0]
    ?.blocks[0]?.firstNumber;
  expect(typeof block).toBe('number');
  const first = String(block);

  await expect(page.getByText(english.home.today.none)).toBeVisible();
  await page.getByRole('button', { name: english.home.start.collection }).click();
  // P1 allows split loads: "normal or split?" first.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.split.title);
  await checkScreen(page);
  await page.getByRole('button', { name: said.split.normal }).click();
  await page.getByLabel(said.badge.label).fill('730415');
  await expect(
    page.getByText(filled(said.badge.truck, { number: '730415', capacity: '65' })),
  ).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.badge.start }).click();

  // Its next number, right there, typed again: wrong opens nothing.
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await typed(page, '101030');
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(page.getByText(said.number.wrong)).toBeVisible();
  await checkScreen(page);
  await typed(page, first);
  await page.getByRole('button', { name: said.number.open }).click();

  // Open under it, before any detail is asked.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.title, { kind: said.kinds.COLLECTION, number: first }),
  );
  await checkScreen(page);
  await page.getByRole('button', { name: said.leave }).click();
  await expect(
    page.getByText(filled(english.home.open.ticket, { truck: '730415', number: first })),
  ).toBeVisible();
});

test('AC-11-75, AC-11-76, AC-11-77, AC-11-78, AC-11-79, AC-11-80, AC-11-05, AC-04-92, AC-04-95, AC-04-24, AC-02-45, AC-08-06: two tickets open, kept across a sign-out and the app opened again; 730415’s badge opens its own; with the network off one is completed (waypoints, a photograph, the review showing it, no "is that right?") and the other cancelled; with signal the submitted one goes sealed and the cancelled one never does', async ({
  page,
  context,
}) => {
  const { ana } = worldCast();
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P1-COL-E2E-2');
  await signedIn(page, ana);
  await expect.poll(() => syncs(asked).length).toBe(2);

  const open = async (badge: string): Promise<string> => {
    await page.getByRole('button', { name: english.home.start.collection }).click();
    await page.getByRole('button', { name: said.split.normal }).click();
    await page.getByLabel(said.badge.label).fill(badge);
    await page.getByRole('button', { name: said.badge.start }).click();
    const shown = (await page.locator('.big-number').first().textContent()) ?? '';
    await typed(page, shown);
    await page.getByRole('button', { name: said.number.open }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(shown);
    return shown;
  };
  const one = await open('730415');
  await page.getByRole('button', { name: said.leave }).click();
  const two = await open('730416');
  await page.getByRole('button', { name: said.leave }).click();
  expect(Number(two)).toBe(Number(one) + 1);

  // Both on home; signed out, the app opened again and signed in, both still there.
  const rows = [
    filled(english.home.open.ticket, { truck: '730415', number: one }),
    filled(english.home.open.ticket, { truck: '730416', number: two }),
  ];
  for (const row of rows) await expect(page.getByText(row)).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await page.reload();
  await signedIn(page, ana);
  for (const row of rows) await expect(page.getByText(row)).toBeVisible();

  // 730415's badge at New opens the ticket it has open, never a second.
  await page.getByRole('button', { name: english.home.start.collection }).click();
  await page.getByRole('button', { name: said.split.normal }).click();
  await page.getByLabel(said.badge.label).fill('730415');
  await page.getByRole('button', { name: said.badge.start }).click();
  await expect(
    page.getByText(filled(said.badge.open, { truck: '730415', number: one })),
  ).toBeVisible();

  // The network off from here: nothing waits on the server.
  await context.setOffline(true);
  await page.getByRole('button', { name: said.open.waypoint }).click();
  await expect(page.getByText(filled(said.open.waypoints.one, {}))).toBeVisible();
  await page.getByRole('button', { name: said.open.waypoint }).click();
  await expect(page.getByText(filled(said.open.waypoints.other, { count: '2' }))).toBeVisible();
  await photographed(page);
  await expect(page.getByRole('img')).toHaveCount(1);
  await checkScreen(page);

  // Complete: each pick moves straight on, nothing asks "is that right?".
  await page.getByRole('button', { name: said.open.complete }).click();
  await page.getByRole('option', { name: 'Vegetative', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.tag.title);
  await checkScreen(page);
  await page.getByRole('button', { name: said.tag.none }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.place.title);
  await page.getByRole('button', { name: said.place.capture }).click();
  await expect(
    page.getByText(filled(said.place.fix, { latitude: '39.13850000', longitude: '-75.55370000' })),
  ).toBeVisible();
  // No signal: nothing to look the address up with, so she types it.
  await expect(page.getByRole('button', { name: said.place.lookUp })).toHaveCount(0);
  await page.getByLabel(said.place.typed).fill('14 Heron St');
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.photos.title);
  await page.getByRole('button', { name: said.next }).click();

  // The review: every value once, the photograph itself, opened full size with a press.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.review.title);
  for (const value of ['730415', one, 'Vegetative', '14 Heron St']) {
    await expect(page.locator('.facts').getByText(value, { exact: true })).toBeVisible();
  }
  const picture = page.getByRole('img', { name: /^Photo 1 of 1, / });
  await expect(picture).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: filled(said.photos.open, { number: '1' }) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Photo 1 of 1');
  await checkScreen(page);
  await page.getByRole('button', { name: said.photos.back }).click();
  await page.getByRole('button', { name: said.review.submit }).click();
  await expect(page.getByText(filled(said.submitted.saved, { number: one }))).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.submitted.home }).click();
  await expect(page.getByText(filled(english.home.today.one, {}))).toBeVisible();
  await expect(page.getByText(rows[0] ?? '')).toHaveCount(0);

  // The other cancelled: kept on the phone, never sent.
  await page.getByText(rows[1] ?? '').click();
  await page.getByRole('button', { name: said.open.cancel }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.cancelTitle, { number: two }),
  );
  await checkScreen(page);
  await page.getByRole('button', { name: said.open.cancelYes }).click();
  await expect(page.getByText(rows[1] ?? '')).toHaveCount(0);

  // With signal again: the collection goes as it was submitted, with its waypoints and its
  // photograph; the cancelled ticket doesn't; its number is reported used.
  await context.setOffline(false);
  const before = syncs(asked).length;
  await page.getByRole('button', { name: english.menu.sync }).click();
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect.poll(() => syncs(asked).length).toBeGreaterThan(before);
  const sent = syncs(asked)
    .slice(before)
    .find(({ body }) => (body as { records: unknown[] }).records.length > 0);
  const body = sent?.body as {
    records: { fieldEvent: Record<string, unknown> }[];
    photos: { owner: { id: string } }[];
    lastUsed: { lastUsedNumber: number | null }[];
  };
  expect(body.records).toHaveLength(1);
  const event = body.records[0]?.fieldEvent ?? {};
  expect(event).toMatchObject({
    kind: 'COLLECTION',
    ticketNumber: one,
    splitSuffix: '',
    certNumber: '730415',
    numberTyped: false,
    masterPasscodeSession: null,
    address: '14 Heron St',
    addressSource: 'TYPED',
    endLatitude: '39.13850000',
    endLongitude: '-75.55370000',
    startLatitude: '39.13850000',
  });
  expect(event['waypoints']).toEqual([
    expect.objectContaining({ latitude: '39.13850000', longitude: '-75.55370000' }),
    expect.objectContaining({ latitude: '39.13850000', longitude: '-75.55370000' }),
  ]);
  expect(body.photos.map(({ owner }) => owner.id)).toEqual([event['id']]);
  expect(body.lastUsed.map(({ lastUsedNumber }) => lastUsedNumber)).toEqual([Number(two)]);
  expect((sent?.answer as { records: { answer: string }[] }).records).toEqual([
    expect.objectContaining({ answer: 'SAVED' }),
  ]);
  await expect(page.getByText(english.sync.nothingWaits)).toBeVisible();
});

test('AC-11-39, AC-11-82, AC-04-08, AC-04-96, AC-11-38, AC-02-44: on PARKS, Sam scans a badge his lists don’t hold and carries on; a control ticket outside the range is questioned; a barcode that won’t read is typed, with its reason, and typed again; a number already on his phone is questioned before it is taken; nothing is refused', async ({
  page,
  context,
}) => {
  const { sam } = worldCast();
  await placed(context);
  await enrolled(page, 'PARKS-COL-E2E');
  await signedIn(page, sam);
  await expect(page.getByText('Bayline County PARKS, Hurricane Delphine')).toBeVisible();

  const start = async (badge: string) => {
    await page.getByRole('button', { name: english.home.start.collection }).click();
    await page.getByRole('heading', { level: 1 }).waitFor();
    if (await page.getByRole('button', { name: said.split.normal }).isVisible()) {
      await page.getByRole('button', { name: said.split.normal }).click();
    }
    await page.getByLabel(said.badge.label).fill(badge);
    await page.getByRole('button', { name: said.badge.start }).click();
    // No truck is certified on PARKS: warned, with how stale the lists are; he carries on.
    await expect(
      page.getByText(filled(said.unknownBadge.warning, { number: badge })),
    ).toBeVisible();
    await page
      .getByRole('button', { name: filled(said.unknownBadge.continue, { number: badge }) })
      .click();
  };
  await start('730415');
  await checkScreen(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.number.controlTitle);

  // A control ticket outside 400001–405000: questioned, then taken back.
  await page.getByLabel(said.number.controlLabel).fill('399999');
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(
    page.getByText(filled(said.question.outsideStock, { number: '399999' })),
  ).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.question.back }).click();

  // The barcode won't read: typed, a reason picked, typed again; wrong, then right.
  await page.getByRole('button', { name: said.number.wontRead }).click();
  await typed(page, '400007');
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.number.reasonTitle);
  await page.getByRole('option', { name: 'Barcode damaged' }).click();
  await typed(page, '400070');
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(page.getByText(said.number.wrong)).toBeVisible();
  await typed(page, '400007');
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.title, { kind: said.kinds.COLLECTION, number: '400007' }),
  );

  // Another truck, the same number: his phone already holds 400007, and says so first.
  await page.getByRole('button', { name: said.leave }).click();
  await start('730499');
  await page.getByLabel(said.number.controlLabel).fill('400007');
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.question.title);
  await page.getByRole('button', { name: filled(said.question.use, { number: '400007' }) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.title, { kind: said.kinds.COLLECTION, number: '400007' }),
  );
});

test('AC-04-98, AC-11-76, AC-04-91: Ana answers "split": 730416’s first property opens as -A, asks its ROE and its estimate, and once submitted the next property opens under the same number as -B, the truck’s one open ticket, its debris type carried', async ({
  page,
  context,
}) => {
  const { ana } = worldCast();
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P1-COL-E2E-3');
  await signedIn(page, ana);
  await expect.poll(() => syncs(asked)[1]?.answer).toBeDefined();

  await page.getByRole('button', { name: english.home.start.collection }).click();
  await page.getByRole('button', { name: said.split.split }).click();
  await page.getByLabel(said.badge.label).fill('730416');
  await page.getByRole('button', { name: said.badge.start }).click();
  const number = (await page.locator('.big-number').first().textContent()) ?? '';
  await typed(page, number);
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.split, { kind: said.kinds.COLLECTION, number, suffix: 'A' }),
  );

  const property = async (roe: string, estimate: string) => {
    await page.getByRole('button', { name: said.open.complete }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.debris.title);
    const vegetative = page.getByRole('option', { name: 'Vegetative', exact: true });
    if ((await vegetative.getAttribute('aria-selected')) === 'true') {
      await page.getByRole('button', { name: said.next }).click();
    } else await vegetative.click();
    await page.getByRole('button', { name: said.tag.none }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.roe.title);
    await page.getByLabel(said.roe.typeIt).fill(roe);
    await checkScreen(page);
    await page.getByRole('button', { name: said.next }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.estimate.title);
    await typed(page, estimate);
    await checkScreen(page);
    await page.getByRole('button', { name: said.next }).click();
    await page.getByRole('button', { name: said.next }).click();
    await page.getByRole('button', { name: said.next }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.review.title);
    await expect(page.locator('.facts').getByText(roe, { exact: true })).toBeVisible();
    await expect(
      page
        .locator('.facts')
        .getByText(filled(said.review.estimateCy, { estimate }), { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: said.review.submit }).click();
  };
  await property('R-0007', '12');
  await page
    .getByRole('button', { name: filled(said.submitted.nextProperty, { number, suffix: 'B' }) })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.split, { kind: said.kinds.COLLECTION, number, suffix: 'B' }),
  );
  await property('R-0008', '18');
  await page.getByRole('button', { name: said.submitted.home }).click();
  await expect(page.getByText(filled(english.home.today.other, { count: '2' }))).toBeVisible();

  // Both go at the next sync: one number, two properties, the debris type carried to -B.
  const before = syncs(asked).length;
  await page.getByRole('button', { name: english.menu.sync }).click();
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  // Answered: both saved.
  await expect
    .poll(() =>
      syncs(asked)
        .slice(before)
        .flatMap(
          ({ answer }) => (answer as { records?: { answer: string }[] } | undefined)?.records ?? [],
        )
        .map(({ answer }) => answer),
    )
    .toEqual(['SAVED', 'SAVED']);
  const events = syncs(asked)
    .slice(before)
    .flatMap(({ body }) => (body as { records: { fieldEvent: Record<string, unknown> }[] }).records)
    .map(({ fieldEvent }) => fieldEvent);
  expect(
    events.map((event) => [
      event['ticketNumber'],
      event['splitSuffix'],
      event['roeNumber'],
      event['estimateCy'],
    ]),
  ).toEqual([
    [number, 'A', 'R-0007', 12],
    [number, 'B', 'R-0008', 18],
  ]);
  expect(events[0]?.['formDebrisTypeId']).toBe(events[1]?.['formDebrisTypeId']);
});
