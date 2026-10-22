// Billings and the close in the back office (spec/parts/07, 09; adms-ledger-audit; REQ-406, 407),
// each test its own person in the run's world, where P1 stands set up for its field days and no
// ticket has been priced: its ledger, its tickets to QC and lock, an invoice batch named and
// renamed, its audit trail; and a project of a test's own closed with what is still open said,
// then reopened with a reason. The golden mission's QC, lock and ledger are its run's
// (golden-review.mission.ts). Every screen is checked as it is left.
import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { dialog, pick, type } from './fill.ts';
import { signedIn, worldIds } from './world.ts';

const heading = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1 });
const said = english.billings;

test('REQ-406, 407 P1’s ledger with nothing priced, its tickets to QC and lock, an invoice batch named and renamed, its audit trail of setup by domain', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Harper Quill', 'MANAGER_ANALYST', [
    'VIEW_REVIEW',
    'VIEW_SETUP',
    'QC',
    'LOCK_INVOICED',
    'UNLOCK_INVOICED',
  ]);
  const { p1 } = await worldIds();
  await page.goto(`/projects/${p1}/ledger`);
  await expect(heading(page)).toHaveText(said.ledger.title);
  await expect(page.getByText('No lines, $0.00 in all')).toBeVisible();
  await checkScreen(page);

  await page.goto(`/projects/${p1}/qc`);
  await expect(heading(page)).toHaveText(said.tickets.title);
  await expect(page.getByText(said.tickets.picked.none)).toBeVisible();
  await checkScreen(page);

  await page.goto(`/projects/${p1}/invoice-batches`);
  await page.getByRole('button', { name: said.batches.add }).click();
  const naming = dialog(page, said.batches.add);
  await type(naming, said.batches.name, 'Bayline ROW, Oct 5–11');
  await naming.getByRole('button', { name: english.common.save }).click();
  const row = page.getByRole('row', { name: /Bayline ROW, Oct 5–11/ });
  await expect(row).toContainText('Harper Quill');
  await row.getByRole('button', { name: 'Rename: Bayline ROW, Oct 5–11' }).click();
  const renaming = dialog(page, 'Rename: Bayline ROW, Oct 5–11');
  await type(renaming, said.batches.name, 'Bayline ROW, week of 5 Oct');
  await renaming.getByRole('button', { name: english.common.save }).click();
  await page
    .getByRole('row', { name: /Bayline ROW, week of 5 Oct/ })
    .getByRole('button', { name: 'Open: Bayline ROW, week of 5 Oct' })
    .click();
  await expect(page.getByText('Its lines: No lines, $0.00 in all.')).toBeVisible();
  await checkScreen(page);

  await page.goto(`/projects/${p1}/audit`);
  await expect(heading(page)).toHaveText(said.audit.title);
  await pick(page, said.audit.domain, said.audit.domains.BILLING);
  await expect(page.getByRole('table', { name: said.audit.title })).toContainText('invoice_batch');
  await checkScreen(page);
});

test('AC-09-29 a project of the test’s own closed by an admin, what is still open read first; nothing in it changes after; reopened with a reason', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Indigo Marsh', 'ADMIN');
  await page.goto('/');
  const made = english.newProject;
  await page.getByRole('button', { name: made.add }).click();
  const adding = dialog(page, made.title);
  await type(adding, made.name, 'Bayline County WATERWAY, Hurricane Delphine');
  await pick(adding, made.client, 'Bayline County');
  await pick(adding, made.event, 'Hurricane Delphine (DR-9001-FL)');
  await pick(adding, made.programType, 'WATERWAY');
  await pick(adding, made.timeZone, 'America/New_York');
  await type(adding, made.activeFrom, '2026-10-12');
  await adding.getByRole('button', { name: english.common.save }).click();
  await expect(heading(page)).toHaveText(
    `${english.projectSetup.title}: Bayline County WATERWAY, Hurricane Delphine`,
  );
  const projectId = /\/projects\/([0-9a-f-]{36})\//.exec(page.url())?.[1] ?? '';
  await page.goto(`/projects/${projectId}/closing`);
  await expect(heading(page)).toHaveText(said.closing.title);
  await expect(page.getByText(said.closing.open)).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.closing.close }).click();
  await dialog(page, said.closing.close).getByRole('button', { name: said.closing.close }).click();
  await expect(page.getByText(/^Closed /)).toBeVisible();
  await page.getByRole('button', { name: said.closing.reopen }).click();
  const reopening = dialog(page, said.closing.reopen);
  await type(reopening, said.closing.reason, 'A late haul-out to enter');
  await reopening.getByRole('button', { name: said.closing.reopen }).click();
  await expect(page.getByText(said.closing.open)).toBeVisible();
  await checkScreen(page);
});
