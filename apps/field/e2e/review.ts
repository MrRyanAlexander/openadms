// The hand review's instrument (item 3.10.2; REQ-324; AC-11-55, 58, 59): what an agent driving the
// browser build reads off each screen a browser test reaches, beside axe-core's rules, for the
// WCAG 2.2 AA criteria no rule settles alone. Run only when asked (`ADMS_E2E_REVIEW=<file>`): each
// screen's reading is a line of JSON appended to that file, and nothing fails; what the review
// found and decided is `spec/ACCESSIBILITY-FIELD.md`. Every change it makes to the page (the focus,
// the size, the text's spacing) is put back before the test goes on.
import { appendFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

import { screenAttribute, walkFocus, type FocusStop } from '@open-adms/look/testing';

export interface ScreenReview {
  readonly screen: string;
  readonly test: string;
  readonly title: string;
  readonly headings: readonly string[];
  // Where the focus was as the screen was checked: "the page" when it was lost (WCAG 2.4.3).
  readonly focusAtEntry: string;
  readonly stops: readonly FocusStop[];
  readonly focusables: number;
  // A control Tab never reached (WCAG 2.1.1), and whether a focus alone changed the screen (3.2.1).
  readonly unreached: readonly string[];
  readonly changedOnFocus: boolean;
  // WCAG 1.4.12: the spacing raised, at 320 CSS px: sideways, and what it clipped.
  readonly spacing: { readonly sideways: boolean; readonly clipped: readonly string[] };
  // On its side (1.3.4, 1.4.10), and at 320 px with text at 200%: sideways, and how much of the
  // height what is held at the bottom takes while the screen scrolls (2.4.11).
  readonly turned: { readonly sideways: boolean; readonly held: number };
  readonly narrowLarge: { readonly held: number };
  // What announces itself as it changes (4.1.3), the banners and whether each is announced.
  readonly live: readonly string[];
  readonly banners: readonly { readonly tone: string; readonly announced: boolean }[];
  // The bottom menu's items, in order (3.2.3); every button's words (3.2.4).
  readonly menu: readonly string[];
  readonly buttons: readonly string[];
  // Content shown on hover (1.4.13) and a field marked wrong (3.3.1).
  readonly titled: readonly string[];
  readonly invalid: readonly { readonly what: string; readonly described: boolean }[];
}

// How much of the height what is held at the bottom takes, where the screen scrolls under it.
const heldShare = (page: Page) =>
  page.evaluate(async () => {
    // The actions measure themselves as the page draws: two frames on.
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise((drawn) => requestAnimationFrame(drawn));
    }
    const scrolls = document.documentElement.scrollHeight > innerHeight + 1;
    if (!scrolls) return 0;
    const held = [...document.querySelectorAll('.screen-actions, .screen-warning')]
      .filter((element) => getComputedStyle(element).position === 'sticky')
      .reduce((sum, element) => sum + element.getBoundingClientRect().height, 0);
    return Math.round((held / innerHeight) * 100) / 100;
  });

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

export async function reviewScreen(page: Page, test: string): Promise<void> {
  const file = process.env['ADMS_E2E_REVIEW'];
  if (file === undefined || file === '' || page.isClosed()) return;
  const shown = page.locator(`[${screenAttribute}]`);
  if ((await shown.count()) !== 1) return;
  const screen = (await shown.getAttribute(screenAttribute)) ?? '';
  const scrolled = await page.evaluate(() => scrollY);
  const size = page.viewportSize() ?? { width: 412, height: 839 };

  const facts = await page.evaluate(() => {
    const text = (element: Element) => element.textContent.replace(/\s+/g, ' ').trim();
    const focusable = [
      ...document.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex], [role="option"], [role="button"]',
      ),
    ].filter(
      (element) =>
        !element.hasAttribute('disabled') &&
        element.getAttribute('aria-disabled') !== 'true' &&
        element.getAttribute('aria-hidden') !== 'true' &&
        element.closest('[inert]') === null &&
        element.getClientRects().length > 0,
    );
    return {
      title: document.title,
      headings: [...document.querySelectorAll('h1, h2, h3')].map(
        (heading) => `${heading.tagName.toLowerCase()} ${text(heading)}`,
      ),
      focusables: focusable.length,
      live: [...document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')].map(
        (element) => `${element.getAttribute('role') ?? 'live'}: ${text(element).slice(0, 60)}`,
      ),
      banners: [...document.querySelectorAll('.banner')].map((banner) => ({
        tone: [...banner.classList].find((name) => name.startsWith('banner-')) ?? '',
        announced:
          banner.closest('[role="status"], [role="alert"], [aria-live]') !== null ||
          banner.getAttribute('role') === 'status',
      })),
      menu: [...document.querySelectorAll('nav button')].map(text),
      buttons: [...document.querySelectorAll('button')].map(
        (button) => button.getAttribute('aria-label') ?? text(button),
      ),
      titled: [...document.querySelectorAll('[title]')].map(
        (element) => `${element.tagName.toLowerCase()}: ${element.getAttribute('title') ?? ''}`,
      ),
      invalid: [...document.querySelectorAll('[aria-invalid="true"]')].map((element) => ({
        what: element.tagName.toLowerCase(),
        described:
          (element.getAttribute('aria-describedby') ?? '')
            .split(' ')
            .some(
              (id) => text(document.getElementById(id) ?? document.createElement('i')) !== '',
            ) || element.getAttribute('aria-errormessage') !== null,
      })),
    };
  });

  // The keyboard's walk round it (focus-walk.ts), and whether a focus alone changed the screen.
  const walk = await walkFocus(page);
  const changedOnFocus = (await page.locator(`[${screenAttribute}="${screen}"]`).count()) === 0;

  // Text spacing raised (1.4.12) at 320 CSS px; then put back.
  await page.setViewportSize({ width: 320, height: size.height });
  const spacing = await page.evaluate(() => {
    const kept = new Map<HTMLElement, string>();
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      kept.set(element, element.style.cssText);
      element.style.setProperty('line-height', '1.5', 'important');
      element.style.setProperty('letter-spacing', '0.12em', 'important');
      element.style.setProperty('word-spacing', '0.16em', 'important');
      if (element.tagName === 'P') element.style.setProperty('margin-bottom', '2em', 'important');
    }
    const across = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    const clipped = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        if (element.closest('.unseen, svg, canvas') !== null) return false;
        const style = getComputedStyle(element);
        const hides = /hidden|clip/.test(`${style.overflowX} ${style.overflowY}`);
        return (
          hides &&
          element.clientWidth > 2 &&
          (element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1)
        );
      })
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
    for (const [element, css] of kept) element.style.cssText = css;
    return { sideways: across, clipped };
  });

  // At 320 px with text at 200%, then on its side; then put back.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const narrowLarge = { held: await heldShare(page) };
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: size.height, height: size.width });
  const turned = { sideways: await sideways(page), held: await heldShare(page) };
  await page.setViewportSize(size);
  await page.evaluate((y) => {
    scrollTo(0, y);
  }, scrolled);

  const review: ScreenReview = {
    screen,
    test,
    ...facts,
    focusAtEntry: walk.atEntry,
    stops: walk.stops,
    unreached: walk.unreached,
    changedOnFocus,
    spacing,
    turned,
    narrowLarge,
  };
  appendFileSync(file, `${JSON.stringify(review)}\n`);
}
