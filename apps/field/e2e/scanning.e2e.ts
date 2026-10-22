// Scanning, through the field app's screens (BACKLOG 3.6.3; AC-11-49; Q-95, Q-105; ADR-596), in
// the run's own world against the real API: a number scanned by a keyboard-style scanner (keys
// typed and Enter, the field never tapped) and by the camera, which is shown the barcode
// (e2e/barcode-camera.ts). Ana Brooks on P1 scans 730415's badge with the scanner, submits the
// collection, and scans the receipt it printed (its own bars, read from the PDF) back from home:
// the phone says it holds the ticket, and never asks the server. Sam Grant on PARKS scans with
// the camera: a control ticket outside the ranges is questioned, one inside opens, and the same
// one again (by the scanner) is one his phone already holds.
import type { BrowserContext, Page } from '@playwright/test';
import lookWords from '@open-adms/look/words/en.json' with { type: 'json' };
import { Code128 } from '@open-adms/receipts';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { barcodeCamera, showing } from './barcode-camera.ts';
import { enrolled, filled, openedUnder, recorded, toApi } from './phone-page.ts';
import { printedPages } from './receipt-read.ts';
import { worldCast, worldOrigin, type CastMonitor } from './world.ts';

const said = english.capture;
const scanning = english.scanning;
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

async function signedIn(page: Page, monitor: CastMonitor): Promise<void> {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(heading(page)).toHaveText(english.home.title);
}

async function placed(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['geolocation'], { origin: worldOrigin() });
  await context.setGeolocation({ latitude: 39.1385, longitude: -75.5537 });
}

// A keyboard-style scanner: the number typed fast and Enter, wherever the focus is.
async function scannerTypes(page: Page, number: string): Promise<void> {
  await page.keyboard.type(number);
  await page.keyboard.press('Enter');
}

// The camera opened from the screen's Scan button, shown the barcode, and put away by itself once
// it reads.
async function cameraScans(page: Page, bars: readonly number[]): Promise<void> {
  await showing(page, bars);
  await page.getByRole('button', { name: english.look.scan, exact: true }).click();
  await expect(page.getByRole('dialog', { name: scanning.camera.title })).toBeHidden();
}

test('AC-11-49, AC-11-47: Ana scans 730415’s badge with a scanner, never tapping the field; the collection’s printed receipt, shown to the camera from home, scans back as the ticket her phone holds; her badge’s number is in the lists, a number nothing holds says so, and no scan leaves the phone', async ({
  page,
  context,
}) => {
  const { ana } = worldCast();
  await placed(context);
  await barcodeCamera(page);
  const asked = recorded(page);
  await enrolled(page, 'P1-SCAN-E2E');
  await signedIn(page, ana);
  await expect
    .poll(() => toApi(asked).filter(({ path }) => path === '/phones/current/syncs').length)
    .toBe(2);

  // New: the badge by the scanner, the field never tapped; the number made opens it at once.
  await page.getByRole('button', { name: english.home.start.collection }).click();
  await page.getByRole('button', { name: said.split.normal }).click();
  await expect(heading(page)).toHaveText(said.badge.title);
  await expect(page.getByLabel(said.badge.label)).not.toBeFocused();
  await scannerTypes(page, '730415');
  const number = await openedUnder(page);

  // Complete and submit: its receipt prints, the PDF the browser saves.
  await page.getByRole('button', { name: said.open.complete }).click();
  // A pick that moves straight on says so first (WCAG 3.2.2; BUILD.md, settled 7).
  await expect(page.getByRole('listbox')).toHaveAccessibleDescription(lookWords.pickToGoOn);
  await page.getByRole('option', { name: 'Vegetative', exact: true }).click();
  await page.getByRole('button', { name: said.place.capture }).click();
  await page.getByLabel(said.place.typed).fill('14 Heron St');
  await page.getByRole('button', { name: said.next }).click();
  await page.getByRole('button', { name: said.next }).click();
  await expect(heading(page)).toHaveText(said.review.title);
  const printedAtSubmit = page.waitForEvent('download');
  await page.getByRole('button', { name: said.review.submit }).click();
  const receipt = await printedPages(await printedAtSubmit);
  const printed = receipt.pages[0];
  expect(printed?.barcode).toBe(number);

  // Home: "Scan a barcode"; the camera opened over the screen, plain paper first.
  await page.getByRole('button', { name: said.submitted.home }).click();
  await page.getByRole('button', { name: scanning.home }).click();
  await expect(heading(page)).toHaveText(scanning.title);
  await checkScreen(page);
  const before = asked.length;
  await showing(page, []);
  await page.getByRole('button', { name: english.look.scan, exact: true }).click();
  const camera = page.getByRole('dialog', { name: scanning.camera.title });
  await expect(camera.getByRole('img', { name: said.camera.view })).toBeVisible();
  await expect(camera.getByText(scanning.camera.hold)).toBeVisible();
  // The receipt's own bars, as printed: read, and the camera put away by itself.
  await showing(page, printed?.bars ?? []);
  await expect(camera).toBeHidden();
  await expect(
    page.getByText(
      filled(scanning.found.ticket, { number, kind: 'collection', state: 'submitted' }),
    ),
  ).toBeVisible();
  await checkScreen(page);

  // The scanner, with the focus where the camera left it: the badge's number, in the lists.
  await scannerTypes(page, '730415');
  await expect(page.getByText(filled(scanning.found.inLists, { number: '730415' }))).toBeVisible();
  await expect(camera).toBeHidden();

  // Typed and looked up: nothing here has it.
  await page.getByLabel(scanning.label).fill('999999');
  await page.getByRole('button', { name: scanning.look }).click();
  await expect(page.getByText(filled(scanning.nothing, { number: '999999' }))).toBeVisible();

  // Nothing scanned went anywhere: no request since carries a number scanned.
  const since = asked.slice(before).map(({ url, body }) => `${url} ${JSON.stringify(body)}`);
  for (const scanned of [number, '730415', '999999']) {
    expect(since.filter((sent) => sent.includes(scanned))).toEqual([]);
  }
  await page.getByRole('button', { name: scanning.back }).click();
  await expect(heading(page)).toHaveText(english.home.title);
});

test('AC-11-49, AC-04-08, AC-04-96, Q-105: on PARKS Sam scans with the camera: his badge, a control ticket outside the ranges questioned, one inside opening; the ticket’s number opens no keyboard; the same control ticket again, by the scanner, is one his phone already holds', async ({
  page,
  context,
}) => {
  const { sam } = worldCast();
  await placed(context);
  await barcodeCamera(page);
  await enrolled(page, 'PARKS-SCAN-E2E');
  await signedIn(page, sam);
  await expect(page.getByText('Bayline County PARKS, Hurricane Delphine')).toBeVisible();

  const newCollection = async () => {
    await page.getByRole('button', { name: english.home.start.collection }).click();
    await heading(page).waitFor();
    if (await page.getByRole('button', { name: said.split.normal }).isVisible()) {
      await page.getByRole('button', { name: said.split.normal }).click();
    }
    await expect(heading(page)).toHaveText(said.badge.title);
  };
  // No truck is certified on PARKS: warned, and he carries on.
  const carriesOn = async (badge: string) => {
    await expect(
      page.getByText(filled(said.unknownBadge.warning, { number: badge })),
    ).toBeVisible();
    await page
      .getByRole('button', { name: filled(said.unknownBadge.continue, { number: badge }) })
      .click();
    await expect(heading(page)).toHaveText(said.number.controlTitle);
  };

  await newCollection();
  await cameraScans(page, new Code128('730415').widths());
  await carriesOn('730415');
  await expect(page.getByLabel(said.number.controlLabel)).toHaveAttribute('inputmode', 'none');

  await cameraScans(page, new Code128('399999').widths());
  await expect(
    page.getByText(filled(said.question.outsideStock, { number: '399999' })),
  ).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.question.back }).click();

  await cameraScans(page, new Code128('400033').widths());
  await expect(heading(page)).toHaveText(
    filled(said.open.title, { kind: said.kinds.COLLECTION, number: '400033' }),
  );

  // Another truck, the same control ticket, by the scanner into the field that opens no keyboard.
  await page.getByRole('button', { name: said.leave }).click();
  await newCollection();
  await scannerTypes(page, '730499');
  await carriesOn('730499');
  await scannerTypes(page, '400033');
  await expect(heading(page)).toHaveText(said.question.title);
  await expect(
    page.getByText(/^Ticket 400033 is already on this phone: a collection/),
  ).toBeVisible();
  await page.getByRole('button', { name: said.question.back }).click();
  await expect(heading(page)).toHaveText(said.number.controlTitle);
});

test('WCAG 2.1.4 (BUILD.md, settled 7): Ana turns off "Take a scanner’s keys anywhere on the screen" in Settings; a scanner’s keys then go only into the field she taps, and the phone keeps the setting through a sign-out', async ({
  page,
  context,
}) => {
  const { ana } = worldCast();
  await placed(context);
  await enrolled(page, 'P1-SCAN-SET-E2E');
  await signedIn(page, ana);

  await page.getByRole('button', { name: english.menu.settings }).click();
  const anywhere = page.getByRole('switch', { name: english.settings.scannerKeysAnywhere });
  await expect(anywhere).toBeChecked();
  await checkScreen(page);
  await page.getByText(english.settings.scannerKeysAnywhere).click();
  await expect(anywhere).not.toBeChecked();
  // The phone's own: signed out and in again, it stands.
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await signedIn(page, ana);
  await page.getByRole('button', { name: english.menu.settings }).click();
  await expect(anywhere).not.toBeChecked();

  // A scanner's keys typed with the focus elsewhere go nowhere; into the field tapped, they do.
  await page.getByRole('button', { name: english.menu.work }).click();
  await page.getByRole('button', { name: scanning.home }).click();
  await expect(heading(page)).toHaveText(scanning.title);
  await scannerTypes(page, '730415');
  await expect(page.getByLabel(scanning.label)).toHaveValue('');
  await page.getByLabel(scanning.label).click();
  await scannerTypes(page, '730415');
  await expect(page.getByText(filled(scanning.found.inLists, { number: '730415' }))).toBeVisible();
});
