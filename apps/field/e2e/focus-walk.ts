// The keyboard's walk round a screen (item 3.10.2; AC-11-58; WCAG 2.1.1, 2.4.3, 2.4.7, 2.4.11,
// 1.4.11): Tab pressed from where the screen left the focus until it comes round, and at each stop
// whether a ring is drawn, how it stands against what lies behind it, and whether any of the control
// is in sight, not covered by what is held at the foot of the screen. Then which enabled controls
// Tab never reached. The focus is put back where the screen had it. `accessible.ts` holds every
// screen a test reaches to it; the hand review's instrument (`review.ts`) records it.
import type { Page } from '@playwright/test';

export interface FocusStop {
  readonly what: string;
  readonly ring: boolean;
  // The ring's contrast with what lies behind it, where both are plain colours.
  readonly ringContrast: number | null;
  readonly seen: boolean;
  readonly hiddenBy: string | null;
}

export interface Walk {
  // Where the focus was before the walk: "the page" when nothing on the screen held it.
  readonly atEntry: string;
  readonly stops: readonly FocusStop[];
  readonly unreached: readonly string[];
}

declare global {
  interface Window {
    walkNames?: WeakMap<Element, string>;
    walkCount?: number;
  }
}

// The control focused now: its name (role, words and a number to tell two alike apart), its ring,
// and whether it is seen. A visually hidden input (React Aria's radio) shows its focus on its
// wrapper, which is read instead.
const focusedNow = () => {
  const names = (window.walkNames ??= new WeakMap<Element, string>());
  const at = document.activeElement;
  if (!(at instanceof HTMLElement) || at === document.body) {
    return { what: 'the page', ring: false, ringContrast: null, seen: false, hiddenBy: null };
  }
  let what = names.get(at);
  if (what === undefined) {
    const role = at.getAttribute('role') ?? at.tagName.toLowerCase();
    const words =
      at.getAttribute('aria-label') ??
      (at instanceof HTMLInputElement ? (at.labels?.[0]?.textContent ?? at.type) : at.textContent);
    window.walkCount = (window.walkCount ?? 0) + 1;
    what = `${role} "${words.replace(/\s+/g, ' ').trim().slice(0, 48)}"#${String(window.walkCount)}`;
    names.set(at, what);
  }
  const box = at.getBoundingClientRect();
  const shown =
    box.width <= 2 || box.height <= 2
      ? (at.closest<HTMLElement>('[data-focus-visible]') ?? at.parentElement ?? at)
      : at;
  const style = getComputedStyle(shown);
  const ring =
    (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2) ||
    style.boxShadow !== 'none';
  const channels = (colour: string) => {
    const found = /rgba?\(([^)]+)\)/.exec(colour);
    if (found === null) return null;
    const parts = (found[1] ?? '')
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { rgb: parts.slice(0, 3), alpha: parts[3] ?? 1 };
  };
  const luminance = (rgb: readonly number[]) => {
    const [r = 0, g = 0, b = 0] = rgb.map((value) => {
      const unit = value / 255;
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  let behind: { rgb: number[]; alpha: number } | null = null;
  for (let up = shown.parentElement; up !== null && behind === null; up = up.parentElement) {
    const background = channels(getComputedStyle(up).backgroundColor);
    if (background !== null && background.alpha > 0.5) behind = background;
  }
  behind ??= channels(getComputedStyle(document.body).backgroundColor);
  const outline = channels(style.outlineColor);
  let ringContrast: number | null = null;
  if (ring && outline !== null && behind !== null) {
    const [lighter = 0, darker = 0] = [luminance(outline.rgb), luminance(behind.rgb)].sort(
      (one, other) => other - one,
    );
    ringContrast = Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
  }
  const area = shown.getBoundingClientRect();
  const points = [
    [area.left + area.width / 2, area.top + area.height / 2],
    [area.left + 3, area.top + 3],
    [area.right - 3, area.top + 3],
    [area.left + 3, area.bottom - 3],
    [area.right - 3, area.bottom - 3],
  ];
  const covers: string[] = [];
  const seen = points.some(([x = 0, y = 0]) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    const top = document.elementFromPoint(x, y);
    if (top !== null && (shown.contains(top) || top.contains(shown))) return true;
    if (top !== null) covers.push(`${top.tagName.toLowerCase()}.${top.className}`);
    return false;
  });
  // What hides it, where something does; otherwise it lies out of sight.
  const hiddenBy = seen
    ? null
    : (covers[0] ?? `out of sight at ${String(Math.round(area.top))} px`);
  return { what, ring, ringContrast, seen, hiddenBy };
};

// Every enabled control on the screen, in sight of a screen reader, Tab didn't reach.
const notReached = (reached: readonly string[]) => {
  const names = window.walkNames ?? new WeakMap<Element, string>();
  return [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')]
    .filter(
      (control) =>
        !control.hasAttribute('disabled') &&
        control.closest('[inert], [aria-hidden="true"]') === null &&
        control.getClientRects().length > 0 &&
        !reached.includes(names.get(control) ?? ''),
    )
    .map(
      (control) =>
        `${control.tagName.toLowerCase()} "${(control.getAttribute('aria-label') ?? control.textContent).trim().slice(0, 40)}"`,
    );
};

export async function walkFocus(page: Page): Promise<Walk> {
  const scrolled = await page.evaluate(() => scrollY);
  const entry = await page.evaluateHandle(() => document.activeElement);
  const atEntry = (await page.evaluate(focusedNow)).what;
  const controls = await page.evaluate(
    () =>
      document.querySelectorAll(
        'button, input, select, textarea, a[href], [tabindex], [role="option"]',
      ).length,
  );
  await page.evaluate(() => {
    const w = window as unknown as { log: string[]; rec?: boolean };
    w.log = [];
    if (w.rec === true) return;
    w.rec = true;
    const name = () => (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '').slice(0, 20);
    addEventListener('scroll', () => { w.log.push(`scroll y=${String(scrollY)} at=${name()} t=${String(Math.round(performance.now()))}`); }, true);
    document.addEventListener('focusin', (e) => { const c = e.target as Element; const a = document.querySelector('.screen-actions'); w.log.push(`focusin ${c.tagName} y=${String(scrollY)} fv=${String(c.matches(':focus-visible'))} pos=${a ? getComputedStyle(a).position : '-'} behind=${a ? String(Math.round(c.getBoundingClientRect().bottom - a.getBoundingClientRect().top)) : '-'} t=${String(Math.round(performance.now()))}`); }, true);
    document.addEventListener('focusin', () => { w.log.push(`after-app y=${String(scrollY)}`); }, false);
    document.addEventListener('focusin', () => { requestAnimationFrame(() => { w.log.push(`frame y=${String(scrollY)}`); }); }, false);
  });
  const stops: FocusStop[] = [];
  const passed: string[] = [];
  for (let pressed = 0; pressed < controls * 3 + 6; pressed += 1) {
    await page.evaluate(() => { (window as unknown as { log: string[] }).log = [`before y=${String(scrollY)} vh=${String(innerHeight)} fs=${getComputedStyle(document.documentElement).fontSize}`]; });
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(focusedNow);
    if (!stop.seen && stop.what !== 'the page') {
      const log = await page.evaluate(() => (window as unknown as { log: string[] }).log.join('\n  '));
      process.stderr.write(`NOTSEEN ${stop.what} ${stop.hiddenBy ?? ''}\n  ${log}\n`);
    }
    if (passed.length > 0 && stop.what === passed[0]) break;
    if (stop.what === 'the page' && passed.at(-1) === 'the page') break;
    passed.push(stop.what);
    if (stop.what !== 'the page') stops.push(stop);
  }
  const unreached = await page.evaluate(notReached, passed);
  await page.evaluate(
    ([was, y]) => {
      if (was instanceof HTMLElement && was !== document.body && was.isConnected) {
        was.focus({ preventScroll: true });
      } else {
        // Back to nothing focused, the page itself holding the keyboard (a Tab past the last
        // control leaves it): the page's body held for a moment, as no control is.
        document.body.tabIndex = -1;
        document.body.focus({ preventScroll: true });
        document.body.removeAttribute('tabindex');
      }
      scrollTo(0, y);
    },
    [entry, scrolled] as const,
  );
  await entry.dispose();
  return { atEntry, stops, unreached };
}
