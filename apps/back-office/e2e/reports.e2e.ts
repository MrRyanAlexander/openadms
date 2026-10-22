// Reports and exports in the back office (REQ-409…414; spec/FROM-BUILD-1.md §9, §10), each test its
// own person in the run's world, where P1 stands set up for its field days and nothing is
// completed: P1's debris totals by period, its email summary in the user's shape, the daily report
// saved as a PDF; the firm's address printed on its reports; an export, a photo PDF and a receipt
// batch each saved as a file. The mission's own totals are its run's. Every screen is checked as
// it is left.
import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { choose, dialog, type } from './fill.ts';
import { signedIn, worldIds } from './world.ts';

const heading = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1 });

test('REQ-409, 410 P1’s reports: debris totals, never a cost, for days of the reader’s choosing; the email summary ending on its closing line; the daily report saved as a PDF', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Jules Varga', 'MANAGER_ANALYST', ['VIEW_REVIEW']);
  const { p1 } = await worldIds();
  const said = english.reports;
  await page.goto(`/projects/${p1}/reports`);
  await expect(heading(page)).toHaveText(said.title);
  await choose(page, said.period, said.periods.range);
  await page.getByLabel(english.common.from, { exact: true }).fill('2026-10-08');
  await page.getByLabel(english.common.to, { exact: true }).fill('2026-10-09');
  await expect(
    page.getByRole('status').filter({ hasText: 'Oct 8, 2026 to Oct 9, 2026' }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: said.byDay })).toContainText('Oct 9, 2026');
  const summary = page.getByRole('region', { name: said.emailSummary });
  await expect(summary).toContainText(
    'All figures in this report are pending final reconciliation',
  );
  await expect(summary).not.toContainText('$');
  const saving = page.waitForEvent('download');
  await page.getByRole('button', { name: said.dailyReport }).click();
  const report = await saving;
  expect(report.suggestedFilename()).toBe('daily-report-2026-10-08-to-2026-10-09.pdf');
  await checkScreen(page);
});

test('REQ-410, 412…414 the firm’s address on its reports; a project’s transactions exported for a spreadsheet, a photo PDF of its certifications and a receipt batch naming a number it doesn’t have, each saved as a file', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Kai Brennan', 'ADMIN');
  const { p1 } = await worldIds();
  const settings = english.firmSettings;
  await page.goto('/settings');
  await page.getByRole('button', { name: `${settings.change}: ${settings.reportContact}` }).click();
  const contact = dialog(page, settings.reportContact);
  await type(contact, settings.reportContact, 'reports@gates.example');
  await contact.getByRole('button', { name: english.common.save }).click();
  await expect(
    page.getByRole('definition').filter({ hasText: 'reports@gates.example' }),
  ).toBeVisible();

  const said = english.exports;
  await page.goto(`/projects/${p1}/exports`);
  await expect(heading(page)).toHaveText(said.title);
  const exporting = page.waitForEvent('download');
  await page.getByRole('button', { name: said.export }).click();
  expect((await exporting).suggestedFilename()).toBe('transactions.csv');
  await choose(page, said.items, said.itemKinds.certifications);
  await choose(page, said.layout, said.layouts.one);
  const photographing = page.waitForEvent('download');
  await page.getByRole('button', { name: said.makePhotos }).click();
  expect((await photographing).suggestedFilename()).toBe('photographs-certifications.pdf');
  await page
    .getByRole('region', { name: said.receiptsTitle })
    .getByLabel(said.ticketNumbers, { exact: true })
    .fill('109999, 109998');
  const receipting = page.waitForEvent('download');
  await page.getByRole('button', { name: said.makeReceipts }).click();
  expect((await receipting).suggestedFilename()).toBe('receipts-receipts.pdf');
  await expect(page.getByText(said.saved).first()).toBeVisible();
  await checkScreen(page);
});
