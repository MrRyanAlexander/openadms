// The accessibility check (BACKLOG 3.1.3; ADR-566; AC-11-51): every screen a browser test reaches
// is checked against WCAG 2.2's automatable A and AA rules by axe-core 4.14.0, in the page as the
// stack serves it. Every browser test imports `test` from here: the screen a test ends on is
// checked as it closes, and a test that moves through several screens checks each one it leaves
// with `checkScreen`. Each check is attached to its test's result, where `screens.ts` reads which
// screens were reached; a screen no test reaches fails the run.
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

  // Through DevTools, as `page.evaluate` runs: the page's own policy is not loosened for it.
  if (!(await page.evaluate(() => 'axe' in globalThis))) await page.evaluate(axe.source);
  const found = await page.evaluate(async (values) => {
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
