// The accessibility check (BACKLOG 3.1.3; ADR-566; AC-11-51): every screen a browser test reaches
// is checked against WCAG 2.2's automatable A and AA rules by axe-core 4.14.0, in the page as the
// stack serves it. Every browser test imports `test` from here: the screen a test ends on is
// checked as it closes, and a test that moves through several screens checks each one it leaves
// with `checkScreen`. Each check is attached to its test's result, where `screens.ts` reads which
// screens were reached; a screen no test reaches fails the run.
//
// **Each screen is checked as the phone may show it** (AC-11-51, 55, 56; ADR-559, 568, 583): in
// the light theme and the dark, and held 320 CSS pixels wide, then with its text at 200%, with
// nothing scrolling sideways (WCAG 1.4.4, 1.4.10). The prototype checked these on its own screens
// (task 3.1.4) until the app's screens took its place (task 3.5.3); now every screen a test
// reaches is held to them, and the page is put back as it was.
import axe from 'axe-core';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

import { attachmentName, reporterFile, screenAttribute, type ScreenCheck } from './screens.ts';
import { rules } from './wcag.ts';

type Checker = typeof axe;

// The screen showing, checked: violations and the rules axe-core can't settle alone (`incomplete`)
// both fail, since nobody has looked at either. One is settled here: with no stylesheet on the
// page, axe-core can't read an orientation lock (1.3.4) and says so, but none can exist. A page
// with a stylesheet has its rules read.
async function check(page: Page, info: TestInfo): Promise<void> {
  // A check no reporter reads proves no screen was reached: the run must have `screens.ts`.
  expect(
    info.config.reporter.map(([name]) => name),
    'the screens reporter in the run',
  ).toContain(reporterFile);
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
      ...(await reflowed(page)),
    ],
    incomplete: [...themed(light.incomplete, 'light'), ...themed(darkFound.incomplete, 'dark')],
  };

  const checked: ScreenCheck = { screen, rules: rules.length, ...found };
  await info.attach(attachmentName, {
    body: JSON.stringify(checked),
    contentType: 'application/json',
  });
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

// The screen at 320 CSS pixels wide, then with its text at 200% (WCAG 1.4.10, 1.4.4): a finding
// for each that scrolls sideways. The page is put back as it was.
async function reflowed(page: Page): Promise<Finding[]> {
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
  const larger = await sideways();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  if (size !== null) await page.setViewportSize(size);
  const help = 'holds 320 CSS px wide without scrolling sideways';
  return [
    ...(narrow ? [{ rule: 'reflow', help, where: ['320 px'] }] : []),
    ...(larger ? [{ rule: 'reflow', help, where: ['320 px, text at 200%'] }] : []),
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

// The screen showing now, checked before a test moves on from it.
export async function checkScreen(page: Page): Promise<void> {
  await check(page, test.info());
}

export const test = base.extend({
  page: async ({ page }, use, info) => {
    await use(page);
    // A test that failed has said why; its last screen is checked by the run that passes.
    if (info.status === info.expectedStatus) await check(page, info);
  },
});

export { expect };
