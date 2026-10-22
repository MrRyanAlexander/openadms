// The accessibility check (BACKLOG 3.1.3; ADR-566; AC-11-51), for every web app's browser tests:
// every screen a browser test reaches is checked against WCAG 2.2's automatable A and AA rules by
// axe-core 4.14.0, in the page as the stack serves it. Each app makes its checks once
// (`accessibilityChecks`, naming its own screens reporter) and every browser test imports `test`
// from there: the screen a test ends on is checked as it closes, and a test that moves through
// several screens checks each one it leaves with `checkScreen`. Each check is attached to its
// test's result, where the app's screens reporter (`screens.ts`) reads which screens were reached;
// a screen no test reaches fails the run.
//
// **Each screen is checked as a phone may show it, and a desktop narrowed** (AC-11-51, 55, 56; ADR-559, 568, 583): in
// the light theme and the dark, and held 320 CSS pixels wide, then with its text at 200%, with
// nothing scrolling sideways (WCAG 1.4.4, 1.4.10), and on its side. **The keyboard walks round it**
// (item 3.10.2; `focus-walk.ts`; AC-11-58), as it shows and again at 320 px with text at 200%: every
// enabled control reached by Tab (2.1.1), each showing a ring of 3:1 (2.4.7, 1.4.11) and never
// wholly hidden behind what is held at the foot of the screen (2.4.11). The prototype checked these on its own screens
// (task 3.1.4) until the app's screens took its place (task 3.5.3); now every screen a test
// reaches is held to them, and the page is put back as it was.
import axe from 'axe-core';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

import { walkFocus, type Walk } from './focus-walk.ts';
import { attachmentName, screenAttribute, type ScreenCheck } from './screens.ts';
import { rules } from './wcag.ts';

// What an app's checks are made from: the file of its screens reporter, which must be in the run,
// and, where it has one, the hand review's instrument, run on each screen checked by the keyboard.
export interface ChecksOf {
  readonly reporterFile: string;
  readonly review?: (page: Page, test: string) => Promise<void>;
}

type Checker = typeof axe;

// The screen showing, checked: violations and the rules axe-core can't settle alone (`incomplete`)
// both fail, since nobody has looked at either. One is settled here: with no stylesheet on the
// page, axe-core can't read an orientation lock (1.3.4) and says so, but none can exist. A page
// with a stylesheet has its rules read.
async function check(
  of: ChecksOf,
  page: Page,
  info: TestInfo,
  options: Checking = {},
): Promise<void> {
  // A check no reporter reads proves no screen was reached: the run must have `screens.ts`.
  expect(
    info.config.reporter.map(([name]) => name),
    'the screens reporter in the run',
  ).toContain(of.reporterFile);
  if (page.isClosed()) return;
  const shown = page.locator(`[${screenAttribute}]`);
  const count = await shown.count();
  if (count === 0) return; // not a screen of the app's (a page of another origin)
  expect(count, 'one screen at a time').toBe(1);
  const screen = (await shown.getAttribute(screenAttribute)) ?? '';

  // In the theme it shows, then the other: put back as the page had it.
  const dark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const asShown = await audited(page);
  await page.emulateMedia({ colorScheme: dark ? 'light' : 'dark' });
  const other = await audited(page);
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
  const themed = (findings: readonly Finding[], theme: 'light' | 'dark') =>
    findings.map((finding) => ({ ...finding, rule: `${finding.rule} (${theme})` }));
  const [light, darkFound] = dark ? [other, asShown] : [asShown, other];
  const found = {
    violations: [
      ...themed(light.violations, 'light'),
      ...themed(darkFound.violations, 'dark'),
      ...(options.keyboard === false ? [] : walked(await walkFocus(page), 'as shown')),
      ...(await reflowed(page, options)),
    ],
    incomplete: [...themed(light.incomplete, 'light'), ...themed(darkFound.incomplete, 'dark')],
  };

  const checked: ScreenCheck = { screen, rules: rules.length, ...found };
  await info.attach(attachmentName, {
    body: JSON.stringify(checked),
    contentType: 'application/json',
  });
  // The hand review's readings, only when asked (item 3.10.2; review.ts).
  if (options.keyboard !== false && of.review !== undefined) {
    await of.review(page, info.titlePath.slice(1).join(' › '));
  }
  expect(
    [...found.violations, ...found.incomplete].map(
      ({ rule, help, where }) => `${screen}: ${rule} (${help}) at ${where.join(', ')}`,
    ),
    `WCAG 2.2 A/AA on the ${screen} screen`,
  ).toEqual([]);
}

interface Finding {
  readonly rule: string;
  readonly help: string;
  readonly where: readonly string[];
}

// How a screen is checked: with the keyboard's walk unless a test says otherwise. A key pressed is
// something done, so a screen whose moment ends at one (the warning before the lock after
// inactivity, AC-11-20) is checked without it.
export interface Checking {
  readonly keyboard?: boolean;
}

// The keyboard's walk round a screen, as findings.
function walked(walk: Walk, where: string): Finding[] {
  const finding = (rule: string, help: string, at: readonly string[]): Finding[] =>
    at.length === 0 ? [] : [{ rule, help, where: at.map((what) => `${where}: ${what}`) }];
  return [
    ...finding(
      'focus-visible',
      'a control with the focus shows a ring of 3:1 (WCAG 2.4.7, 1.4.11)',
      walk.stops
        .filter((stop) => !stop.ring || (stop.ringContrast !== null && stop.ringContrast < 3))
        .map((stop) => stop.what),
    ),
    ...finding(
      'focus-not-obscured',
      'a control with the focus is never wholly hidden (WCAG 2.4.11)',
      walk.stops.filter((stop) => !stop.seen).map((stop) => `${stop.what}, ${stop.hiddenBy ?? ''}`),
    ),
    ...finding('keyboard', 'every control is reached by Tab (WCAG 2.1.1)', walk.unreached),
  ];
}

// Two frames on, once what measures itself as the page draws has (the screen's actions).
const drawn = (page: Page) =>
  page.evaluate(async () => {
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise((done) => requestAnimationFrame(done));
    }
  });

// The screen at 320 CSS pixels wide, then with its text at 200% (WCAG 1.4.10, 1.4.4), then on its
// side (1.3.4): a finding for each that scrolls sideways, and the keyboard's walk at 320 px with
// text at 200%. The page is put back as it was.
async function reflowed(page: Page, options: Checking): Promise<Finding[]> {
  const size = page.viewportSize();
  const sideways = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  await page.setViewportSize({ width: 320, height: size?.height ?? 640 });
  const narrow = await sideways();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await drawn(page);
  const larger = await sideways();
  const large =
    options.keyboard === false ? [] : walked(await walkFocus(page), '320 px, text at 200%');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  const upright = size ?? { width: 412, height: 839 };
  await page.setViewportSize({ width: upright.height, height: upright.width });
  await drawn(page);
  const turned = await sideways();
  if (size !== null) await page.setViewportSize(size);
  await drawn(page);
  const help = 'holds 320 CSS px wide, and on its side, without scrolling sideways';
  return [
    ...(narrow ? [{ rule: 'reflow', help, where: ['320 px'] }] : []),
    ...(larger ? [{ rule: 'reflow', help, where: ['320 px, text at 200%'] }] : []),
    ...(turned ? [{ rule: 'reflow', help, where: ['on its side'] }] : []),
    ...large,
  ];
}

// axe-core's rules on the page as it shows now.
async function audited(
  page: Page,
): Promise<{ readonly violations: Finding[]; readonly incomplete: Finding[] }> {
  // Through DevTools, as `page.evaluate` runs: the page's own policy is not loosened for it.
  if (!(await page.evaluate(() => 'axe' in globalThis))) await page.evaluate(axe.source);
  return page.evaluate(async (values) => {
    const checker = (globalThis as unknown as { axe: Checker }).axe;
    const results = await checker.run(document, {
      runOnly: { type: 'rule', values },
      resultTypes: ['violations', 'incomplete'],
    });
    const settled = (rule: string) =>
      rule === 'css-orientation-lock' && document.styleSheets.length === 0;
    const read = (results_: typeof results.violations) =>
      results_
        .filter((result) => !settled(result.id))
        .map((result) => ({
          rule: result.id,
          help: result.help,
          where: result.nodes.map(
            (node) =>
              `${node.target.join(' ')}: ${node.failureSummary?.replace(/\s+/g, ' ') ?? ''}`,
          ),
        }));
    return { violations: read(results.violations), incomplete: read(results.incomplete) };
  }, rules);
}

// An app's checks: its `test`, which checks the screen a test ends on, and `checkScreen`, the
// screen showing now, checked before a test moves on from it.
export function accessibilityChecks(of: ChecksOf) {
  const test = base.extend({
    page: async ({ page }, use, info) => {
      await use(page);
      // A test that failed has said why; its last screen is checked by the run that passes.
      if (info.status === info.expectedStatus) await check(of, page, info);
    },
  });
  const checkScreen = (page: Page, options: Checking = {}): Promise<void> =>
    check(of, page, test.info(), options);
  return { test, checkScreen, expect };
}
