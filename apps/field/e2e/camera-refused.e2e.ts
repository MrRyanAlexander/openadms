// The camera refused (BACKLOG 3.6.1; AC-11-68; ADR-052, 586), in a browser of its own that answers
// "no" for the monitor (e2e/browser.ts), in the run's own world against the real API: Ana Brooks
// on P1 says no to the camera, and her collection goes on without the photograph, warned.
import type { Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { launched } from './browser.ts';
import { enrolled } from './phone-page.ts';
import { worldCast, worldOrigin } from './world.ts';

const said = english.capture;
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test.use({ launchOptions: await launched('refused') });

test('AC-11-68: Ana says no to the camera; the collection goes on without the photograph, warned, never stopped', async ({
  page,
  context,
}) => {
  const { ana } = worldCast();
  await context.grantPermissions(['geolocation'], { origin: worldOrigin() });
  await context.setGeolocation({ latitude: 39.1385, longitude: -75.5537 });
  await enrolled(page, 'P1-COL-E2E-NO-CAMERA');
  await page.getByLabel(english.phone.monitorNumber).fill(ana.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(ana.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(heading(page)).toHaveText(english.home.title);

  await page.getByRole('button', { name: english.home.start.collection }).click();
  await page.getByRole('button', { name: said.split.normal }).click();
  await page.getByLabel(said.badge.label).fill('730415');
  await page.getByRole('button', { name: said.badge.start }).click();
  const number = (await page.locator('.big-number').first().textContent()) ?? '';
  for (const digit of number) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(heading(page)).toContainText(number);

  await page.getByRole('button', { name: english.look.photos.take }).click();
  await expect(page.getByText(said.camera.refused)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await checkScreen(page);
  await page.getByRole('button', { name: said.open.complete }).click();
  await expect(page.getByRole('option', { name: 'Vegetative', exact: true })).toBeVisible();
});
