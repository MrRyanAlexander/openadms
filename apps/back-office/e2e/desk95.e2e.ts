// The desktop's classic look (office.css, win95.css; the user, 2026-10-23): windows opened from the
// Start menu, the one closed giving the focus to the window used just before it (the bare desktop
// only when none remains), Escape closing the Start menu, a wallpaper picked and remembered, and a
// phone-sized screen with no sideways scroll of the page.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { signedIn } from './world.ts';

const said = english.desk;
const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const startMenu = (page: Page) => page.getByRole('menu', { name: said.startMenu });
const shots = process.env['ADMS_DESK_SHOTS'];

async function openFromStart(page: Page, area: string, place: string): Promise<void> {
  await page.getByRole('button', { name: said.start }).click();
  await startMenu(page).getByRole('menuitem', { name: area, exact: true }).click();
  await startMenu(page).getByRole('menuitem', { name: place, exact: true }).click();
}

test('the classic desktop: three windows opened from Start, the top one closed gives the focus to the one used before it, Escape closes Start, a wallpaper is remembered, and a phone-sized screen has no sideways page scroll', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Casey Ward', 'ADMIN');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(heading(page)).toHaveText(english.home.title);

  // Start opens, and Escape closes it with the focus back on the button.
  const start = page.getByRole('button', { name: said.start });
  await start.click();
  await expect(startMenu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(startMenu(page)).toHaveCount(0);
  await expect(start).toBeFocused();

  // Three windows: Projects (already), Clients, then About.
  await openFromStart(page, english.shell.sections.firm, english.shell.links.clients);
  await expect(heading(page)).toHaveText(english.clients.title);
  await start.click();
  await startMenu(page)
    .getByRole('menuitem', { name: said.about.replace('{name}', english.app.name) })
    .click();
  const about = english.about.title.replace('{name}', english.app.name);
  await expect(heading(page)).toHaveText(about);
  const bar = page.getByRole('navigation', { name: said.windows });
  await expect(bar.getByRole('link')).toHaveCount(4);

  // Closing the top one brings forward the one used just before it, with the focus in it.
  await page.getByRole('button', { name: said.closeWindow }).click();
  await expect(heading(page)).toHaveText(english.clients.title);
  await expect(heading(page)).toBeFocused();
  await page.getByRole('button', { name: said.closeWindow }).click();
  await expect(heading(page)).toHaveText(english.home.title);
  await page.getByRole('button', { name: said.closeWindow }).click();
  await expect(page).toHaveURL('/desktop');

  // The wallpaper picked is remembered for this person.
  await start.click();
  await startMenu(page).getByRole('menuitem', { name: said.background, exact: true }).click();
  await startMenu(page).getByRole('menuitemradio', { name: said.wallpaper.navy }).click();
  await expect(page.locator('.desk-app')).toHaveAttribute('data-wallpaper', 'navy');
  await page.reload();
  await expect(page.locator('.desk-app')).toHaveAttribute('data-wallpaper', 'navy');
  await start.click();
  await startMenu(page).getByRole('menuitem', { name: said.background, exact: true }).click();
  await startMenu(page).getByRole('menuitemradio', { name: said.wallpaper.teal }).click();
  await expect(page.locator('.desk-app')).toHaveAttribute('data-wallpaper', 'teal');
  await checkScreen(page);

  if (shots !== undefined) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: join(shots, 'desktop-1280.png') });
  }

  // A phone: every window maximized, the Start menu by touch, and the page never wider.
  await page.setViewportSize({ width: 390, height: 780 });
  await openFromStart(page, english.shell.sections.firm, english.shell.links.clients);
  await expect(heading(page)).toHaveText(english.clients.title);
  const widths = await page.evaluate(() => ({
    scroll: document.scrollingElement?.scrollWidth ?? 0,
    inner: window.innerWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
  if (shots !== undefined) await page.screenshot({ path: join(shots, 'window-390.png') });
  await page.goto('/desktop');
  await expect(page.getByRole('navigation', { name: said.icons })).toBeVisible();
  if (shots !== undefined) await page.screenshot({ path: join(shots, 'desktop-390.png') });
});
