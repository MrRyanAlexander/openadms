// What the firm calls its ADMS, on the phone (the user, 2026-10-22: the firm "put their own White
// Label on it at setup … This would then brand it for them"), through the screens, against the real
// API in the run's own world: the enrolment screen reads the public brand read and names the
// firm's ADMS beside "Built on Open ADMS <version>" and the way to the source (Apache-2.0); a
// firm that renamed its ADMS is read on the first screen and told again at sign-in, kept by the
// phone and shown when the phone starts with no signal.
import { builtOn } from '@open-adms/domain';
import type { Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, recorded, toApi } from './phone-page.ts';
import { release } from './stack.ts';
import { worldApiOrigin, worldOrigin } from './world.ts';

const builtOnWords = filled(english.brand.builtOn, { version: release, licence: builtOn.licence });

// The firm's API as it answers a firm that called its ADMS something else: its two answers that
// say the name, in the shapes the contracts give them (the page reads each by its schema).
async function renamed(page: Page, brand: { readonly read: string; readonly proof: string }) {
  const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
  await page.route(`${worldApiOrigin}/brand`, (route) =>
    route.fulfill({ headers, json: { name: brand.read, version: release } }),
  );
  await page.route(`${worldApiOrigin}/phones/current`, (route) =>
    route.fulfill({
      headers,
      json: {
        deviceId: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d01',
        name: 'P1-COL-BRAND',
        status: 'ACTIVE',
        outOfServiceAt: null,
        keyRevoked: false,
        masterPasscodeVersion: 1,
        masterPasscodeVersionInForce: 1,
        brandName: brand.proof,
      },
    }),
  );
}

test('the firm’s own name for its ADMS is the first screen’s heading and the page’s title, as the API says it, with the line that says which Open ADMS it is built on and the way to its source', async ({
  page,
}) => {
  const asked = recorded(page);
  await page.goto(worldOrigin());
  await expect(page.getByRole('status')).toHaveText(english.shell.server.answers);
  // The world's firm kept the product's own name; the page says it, as Open ADMS Field.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.app.name);
  await expect(page).toHaveTitle(english.app.name);
  await expect(page.getByText(builtOnWords)).toBeVisible();
  const source = page.getByRole('link', { name: english.brand.source });
  await expect(source).toHaveAttribute('href', builtOn.source);
  await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(source).toHaveAttribute('target', '_blank');
  // One call to the API, open to anybody; the release it answers is the build's.
  expect(
    toApi(asked).map(({ method, path, status }) => `${method} ${path} ${String(status)}`),
  ).toEqual(['GET /brand 200']);
  expect(toApi(asked)[0]?.answer).toEqual({ name: 'Open ADMS', version: release });
  await checkScreen(page);
});

test('a firm that named its ADMS: read at enrolment, told again when the phone proves itself, kept by the phone, and shown when the phone starts with no signal', async ({
  page,
}) => {
  await renamed(page, { read: 'Gates ADMS', proof: 'Gates Recovery ADMS' });
  await page.goto(worldOrigin());
  await expect(page.getByRole('status')).toHaveText(english.shell.server.answers);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gates ADMS Field');
  await expect(page).toHaveTitle('Gates ADMS Field');
  await checkScreen(page);

  // Enrolled: the sign-in screen is told what the firm calls it now, and the line is still there.
  await enrolled(page, 'P1-COL-BRAND');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gates Recovery ADMS Field');
  await expect(page).toHaveTitle('Gates Recovery ADMS Field');
  await expect(page.getByText(builtOnWords)).toBeVisible();
  await checkScreen(page);

  // Started again with no signal to the API: the name the phone kept.
  await page.unroute(`${worldApiOrigin}/brand`);
  await page.unroute(`${worldApiOrigin}/phones/current`);
  await page.route(`${worldApiOrigin}/**`, (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('status')).toHaveText(english.phone.standing.unreachable);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gates Recovery ADMS Field');
  await expect(page).toHaveTitle('Gates Recovery ADMS Field');
  await expect(page.getByText(builtOnWords)).toBeVisible();
  await checkScreen(page);
});
