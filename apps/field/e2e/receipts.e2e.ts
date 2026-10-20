// Receipts, through the field app's screens (BACKLOG 3.6.2; ADR-115, 595), in the run's own world
// against the real API: the browser build prints a receipt to a PDF the browser saves, from the
// receipts package's one content model, its barcode Code 128 of the bare number. Ana Brooks's
// collection on P1 prints its two copies as it is submitted, and prints again from home after she
// signs out and in, the same bytes, with nothing sent; Sam Grant's collection on PARKS, from a
// control ticket, prints none (the ticket handed over, its stub kept) and prints the driver's copy
// when asked.
import type { BrowserContext, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, openedUnder, recorded, toApi } from './phone-page.ts';
import { printedPages } from './receipt-read.ts';
import { worldCast, worldOrigin, type CastMonitor } from './world.ts';

const said = english.capture;
const printing = english.printing;

async function signedIn(page: Page, monitor: CastMonitor): Promise<void> {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
}

async function placed(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['geolocation'], { origin: worldOrigin() });
  await context.setGeolocation({ latitude: 39.1385, longitude: -75.5537 });
}

// Complete, as a collection asks it: the debris type, where (GPS and an address typed), no
// photograph, the review; submitted.
async function completed(page: Page): Promise<void> {
  await page.getByRole('button', { name: said.open.complete }).click();
  await page.getByRole('option', { name: 'Vegetative', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.place.title);
  await page.getByRole('button', { name: said.place.capture }).click();
  await page.getByLabel(said.place.typed).fill('14 Heron St');
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.photos.title);
  await page.getByRole('button', { name: said.next }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(said.review.title);
}

const copies = (names: readonly string[]) =>
  new Intl.ListFormat(english.language, { type: 'conjunction' }).format(names);

test('AC-04-97, AC-11-46, AC-11-47, AC-11-48: Ana’s collection prints its two copies as it is submitted, a PDF named by its bare number whose barcode reads back as it; printed again from home after signing out and in, the same, and nothing is sent', async ({
  page,
  context,
}) => {
  const { ana } = worldCast();
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P1-RCPT-E2E');
  await signedIn(page, ana);
  await expect
    .poll(() => toApi(asked).filter(({ path }) => path === '/phones/current/syncs').length)
    .toBe(2);

  await page.getByRole('button', { name: english.home.start.collection }).click();
  await page.getByRole('button', { name: said.split.normal }).click();
  await page.getByLabel(said.badge.label).fill('730415');
  await page.getByRole('button', { name: said.badge.start }).click();
  const number = await openedUnder(page);
  await completed(page);

  // Printed as it is submitted: the browser build's printer saves the PDF.
  const printedAtSubmit = page.waitForEvent('download');
  await page.getByRole('button', { name: said.review.submit }).click();
  const first = await printedPages(await printedAtSubmit);
  await expect(page.getByText(filled(said.submitted.saved, { number }))).toBeVisible();
  await expect(
    page.getByText(
      filled(printing.printed, { copies: copies(['Driver’s copy', 'Monitor’s copy']) }),
    ),
  ).toBeVisible();
  await checkScreen(page);
  expect(first.name).toBe(`receipt-${number}.pdf`);
  expect(first.pages).toHaveLength(2);
  expect(first.pages.map(({ words }) => words.slice(0, 2))).toEqual([
    ['Collection', 'Driver’s copy'],
    ['Collection', 'Monitor’s copy'],
  ]);
  for (const { words, barcode } of first.pages) {
    expect(barcode).toBe(number);
    const said = words.join(' ');
    for (const line of [
      'Bayline County ROW, Hurricane Delphine',
      `Ticket ${number}`,
      'Cert number: 730415',
      'Capacity: 65 CY',
      'Debris type: Vegetative',
      'Address: 14 Heron St',
      'Monitor: Ana Brooks',
    ]) {
      expect(said).toContain(line);
    }
  }

  // Home, signed out and in again: "Print a receipt again", and nothing goes for it.
  await page.getByRole('button', { name: said.submitted.home }).click();
  await page.getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await signedIn(page, ana);
  await page.getByRole('button', { name: printing.home }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(printing.title);
  await checkScreen(page);
  await expect.poll(() => toApi(asked).length).toBeGreaterThan(0);
  const before = toApi(asked).length;
  const printedAgain = page.waitForEvent('download');
  await page
    .getByText(filled(printing.row, { title: 'Collection', number: `Ticket ${number}` }))
    .click();
  const again = await printedPages(await printedAgain);
  await expect(
    page.getByText(
      filled(printing.printedAgain, {
        heading: `Ticket ${number}`,
        copies: copies(['Driver’s copy', 'Monitor’s copy']),
      }),
    ),
  ).toBeVisible();
  expect(again.bytes.equals(first.bytes)).toBe(true);
  expect(toApi(asked)).toHaveLength(before);
  await page.getByRole('button', { name: printing.back }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
});

test('AC-04-97, REQ-321: on PARKS Sam’s collection from control ticket 400021 prints none, the ticket handed over and its stub kept; asked, it prints the driver’s copy, its barcode the control ticket’s number', async ({
  page,
  context,
}) => {
  const { sam } = worldCast();
  await placed(context);
  await enrolled(page, 'PARKS-RCPT-E2E');
  await signedIn(page, sam);
  await page.getByRole('button', { name: english.home.start.collection }).click();
  await page.getByRole('heading', { level: 1 }).waitFor();
  if (await page.getByRole('button', { name: said.split.normal }).isVisible()) {
    await page.getByRole('button', { name: said.split.normal }).click();
  }
  await page.getByLabel(said.badge.label).fill('730415');
  await page.getByRole('button', { name: said.badge.start }).click();
  await page
    .getByRole('button', { name: filled(said.unknownBadge.continue, { number: '730415' }) })
    .click();
  await page.getByLabel(said.number.controlLabel).fill('400021');
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    filled(said.open.title, { kind: said.kinds.COLLECTION, number: '400021' }),
  );
  await completed(page);

  let downloads = 0;
  page.on('download', () => {
    downloads += 1;
  });
  await page.getByRole('button', { name: said.review.submit }).click();
  await expect(page.getByText(printing.controlTicket)).toBeVisible();
  await checkScreen(page);
  expect(downloads).toBe(0);
  const asked = page.waitForEvent('download');
  await page.getByRole('button', { name: printing.print }).click();
  const printed = await printedPages(await asked);
  expect(printed.name).toBe('receipt-400021.pdf');
  expect(printed.pages.map(({ words, barcode }) => [words[1], barcode])).toEqual([
    ['Driver’s copy', '400021'],
  ]);
  await expect(
    page.getByText(filled(printing.printed, { copies: copies(['Driver’s copy']) })),
  ).toBeVisible();
});
