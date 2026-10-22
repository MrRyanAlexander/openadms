// The keyboard and a screen reader's place on the phone (item 3.10.2, the hand review; AC-11-93;
// WCAG 2.4.3, 4.1.2): a screen's title takes the focus as the screen comes and again as a record's
// next question comes, so a screen reader says where the monitor now is and Tab goes on from the top
// of it; a button pressed keeps the focus while the phone is busy with what it began. Driven by the
// keyboard alone once Kim is signed in, against the real API in the run's own world.
import type { Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, recorded, toApi } from './phone-page.ts';
import { worldCast } from './world.ts';

const title = (page: Page) => page.getByRole('heading', { level: 1 });

// The first control of the screen showing, in the order Tab takes them.
const firstControl = (page: Page) =>
  page.evaluate(() => {
    const first = document
      .querySelector('[data-screen]')
      ?.querySelector('button:not([disabled]), input:not([disabled]), [role="option"]');
    return first !== null && first !== undefined && first === document.activeElement;
  });

test('AC-11-93, AC-11-58: Kim, by the keyboard alone, finds the focus on each screen’s title as it comes and on each new question’s, Tab going on from the top; "Sync now" keeps the focus while the phone syncs', async ({
  page,
}) => {
  const { kim } = worldCast();
  const asked = recorded(page);
  await enrolled(page, 'P1-TWR-KEYS');
  await expect(title(page)).toBeFocused();

  await page.getByLabel(english.phone.monitorNumber).fill(kim.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(kim.password);
  await page.getByLabel(english.phone.passwordLabel).press('Enter');
  await page.getByRole('button', { name: english.phone.signIn }).focus();
  await page.keyboard.press('Enter');

  // Home: its title holds the focus, and Tab goes on from the top of the screen.
  await expect(title(page)).toHaveText(english.home.title);
  await expect(title(page)).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await firstControl(page), 'Tab from the title reaches the screen’s first control').toBe(
    true,
  );

  // A new disposal: the badge's question, then the ticket's, each title taking the focus.
  const disposal = page.getByRole('button', { name: english.home.start.disposal });
  await expect(disposal).toBeEnabled();
  await disposal.focus();
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText(english.capture.badge.title);
  await expect(title(page)).toBeFocused();
  await page.getByLabel(english.capture.badge.label).fill('730415');
  await page.getByRole('button', { name: english.capture.badge.start }).focus();
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText(english.capture.number.ticketTitle);
  await expect(title(page)).toBeFocused();
  await checkScreen(page);
  await page.getByRole('button', { name: english.look.back }).first().focus();
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText(english.capture.badge.title);
  await expect(title(page)).toBeFocused();

  // Sync, from the menu: its title takes the focus; "Sync now" keeps it while the phone syncs.
  const menu = page.getByRole('navigation', { name: english.menu.label });
  await page.getByRole('button', { name: english.look.back }).first().focus();
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText(english.home.title);
  await menu.getByRole('button', { name: english.menu.sync }).focus();
  await page.keyboard.press('Enter');
  await expect(title(page)).toHaveText(english.sync.title);
  await expect(title(page)).toBeFocused();
  const syncNow = page.getByRole('button', { name: english.sync.syncNow });
  const before = toApi(asked).length;
  await syncNow.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => toApi(asked).length).toBeGreaterThan(before);
  await expect(syncNow).toBeEnabled();
  await expect(syncNow).toBeFocused();
});
