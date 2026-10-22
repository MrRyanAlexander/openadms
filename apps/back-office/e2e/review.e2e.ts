// Review and correct in the back office (spec/parts/08-review-and-corrections.md; adms-exceptions;
// spec/CONVENTIONS.md §6's example world), each test its own reviewer in the run's world, where P1
// stands set up for its field days and no phone has sent a ticket yet. A collection made in the
// back office because a phone failed, corrected in place and voided, its history read; what waits
// beside the queue; forms entered from paper and corrected. The golden mission's own review, of the
// tickets its phones sent, is its run's (golden-review.mission.ts). Every screen is checked as it
// is left.
import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { dialog, pick, type } from './fill.ts';
import { signedIn, worldIds } from './world.ts';

const heading = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1 });
const reviewer = ['VIEW_REVIEW', 'CORRECT', 'RENUMBER', 'VOID', 'ACCEPT_FLAG'] as const;
const said = english.review;

test('ADR-156, 051 a collection made in the back office because a phone failed, under 101501: its page; its address corrected in place, the value before in its history; voided with a reason; the queue lists what waits', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Rowan Pike', 'MANAGER_ANALYST', [...reviewer]);
  const { p1 } = await worldIds();
  await page.goto(`/projects/${p1}/review`);
  await expect(heading(page)).toHaveText(said.queue.title);
  await expect(page.getByRole('table', { name: /Loads: tickets waiting/ })).toBeVisible();
  await checkScreen(page);

  await page.getByRole('button', { name: said.queue.newFieldEvent }).click();
  const making = dialog(page, said.made.title);
  await type(making, said.made.ticketNumber, '101501');
  await pick(making, said.made.reason, 'Device failed');
  await pick(making, said.event.monitor, /^Ana Brooks \(M\d{6,}\)$/);
  await type(making, said.event.certNumber, '730415');
  await making.getByLabel(said.event.startDay, { exact: true }).fill('2026-10-16');
  await making.getByLabel(said.event.startTime, { exact: true }).fill('08:05');
  await making.getByLabel(said.event.endDay, { exact: true }).fill('2026-10-16');
  await making.getByLabel(said.event.endTime, { exact: true }).fill('08:40');
  await type(making, said.event.endLatitude, '39.0891');
  await type(making, said.event.endLongitude, '-75.6012');
  await making.getByRole('button', { name: said.made.make }).click();
  await expect(heading(page)).toHaveText('Loads ticket 101501');
  const card = page.getByRole('region', { name: 'Collection (COL) 101501' });
  await expect(card).toContainText('In the back office by Rowan Pike (Device failed)');
  await expect(card).toContainText('39.08910000, -75.60120000');
  await checkScreen(page);

  await card.getByRole('button', { name: said.event.correct, exact: true }).click();
  const correcting = dialog(page, `${said.event.correct}: ${said.event.titleShort}`);
  await type(correcting, said.event.address, '14 Heron St');
  await type(correcting, said.note, 'Address from the paper ticket');
  await correcting.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByText(english.common.saved)).toBeVisible();
  await expect(card).toContainText('14 Heron St');
  await page.getByRole('button', { name: said.ticket.showHistory }).click();
  const history = page.getByRole('table', { name: said.ticket.history });
  await expect(history).toContainText('address: None → 14 Heron St');
  await expect(history).toContainText('Address from the paper ticket');

  await page.getByRole('button', { name: said.ticket.void }).click();
  const voiding = dialog(page, said.ticket.void);
  await pick(voiding, english.review.reason, 'Work never happened');
  await type(voiding, said.note, 'Entered by mistake');
  await voiding.getByRole('button', { name: said.ticket.void }).click();
  await expect(page.getByText(/Voided by Rowan Pike \(Work never happened\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: said.ticket.unvoid })).toBeVisible();
  await checkScreen(page);

  // The queue lists it while it waits for its disposal; nothing waits among the haul-outs.
  await page.goto(`/projects/${p1}/review?workflow=LOAD`);
  await expect(page.getByRole('row', { name: /^101501\b/ })).toBeVisible();
  await page.goto(`/projects/${p1}/review?workflow=HAUL_OUT`);
  await expect(page.getByRole('table', { name: /^Haul-outs: tickets/ })).toContainText(
    english.table.empty,
  );
});

test('ADR-022, 468, 498 what waits beside the queue: quarantined records, held records and files set aside, jobs set aside; nothing waits on P1', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Quinn Avery', 'MANAGER_ANALYST', [...reviewer]);
  const { p1 } = await worldIds();
  const waiting = english.waiting;
  await page.goto(`/projects/${p1}/quarantine`);
  await expect(heading(page)).toHaveText(waiting.quarantine.title);
  await expect(page.getByRole('table', { name: waiting.quarantine.title })).toContainText(
    english.table.empty,
  );
  await checkScreen(page);
  await page.goto(`/projects/${p1}/held`);
  await expect(heading(page)).toHaveText(waiting.held.title);
  await expect(page.getByRole('heading', { name: waiting.files.title })).toBeVisible();
  await checkScreen(page);
  await page.goto(`/projects/${p1}/set-aside-jobs`);
  await expect(heading(page)).toHaveText(waiting.jobs.title);
  await checkScreen(page);
});

test('ADR-156, 534 forms entered from paper: an incident, its description corrected; a citizen drop-off log at Marsh Road TDSR; the surveys', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Sasha Ellery', 'MANAGER_ANALYST', [...reviewer]);
  const { p1 } = await worldIds();
  const forms = english.forms2;
  await page.goto(`/projects/${p1}/incidents`);
  await expect(heading(page)).toHaveText(forms.incidents.title);
  await page.getByRole('button', { name: forms.incidents.add }).click();
  const entering = dialog(page, forms.incidents.add);
  await pick(entering, said.made.reason, 'Device failed');
  await pick(entering, said.event.monitor, /^Ana Brooks \(M\d{6,}\)$/);
  await entering.getByLabel(forms.madeDay, { exact: true }).fill('2026-10-09');
  await entering.getByLabel(forms.madeTime, { exact: true }).fill('10:15');
  await pick(entering, forms.incidents.type, 'Property damage');
  await type(entering, forms.incidents.description, 'Truck clipped a mailbox');
  await type(entering, forms.incidents.address, '14 Heron St');
  // The firm's own field, where the setup test has added it to the incident form already.
  const police = entering.getByLabel('Police report number', { exact: true });
  if (await police.isVisible()) await police.fill('BCSO-26-1182');
  await entering.getByRole('button', { name: english.common.save }).click();
  const row = page.getByRole('row', { name: /Truck clipped a mailbox/ });
  await expect(row).toContainText('Property damage');
  await expect(row).toContainText('In the back office by Sasha Ellery (Device failed)');
  await row.getByRole('button', { name: /^Correct: Incident/ }).click();
  const correcting = page.getByRole('dialog', { name: /^Correct: Incident/ });
  await type(correcting, forms.incidents.description, 'Truck clipped a mailbox; owner told');
  await correcting.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByRole('row', { name: /owner told/ })).toBeVisible();
  await checkScreen(page);

  await page.goto(`/projects/${p1}/drop-off-logs`);
  await expect(heading(page)).toHaveText(forms.dropOffLogs.title);
  await page.getByRole('button', { name: forms.dropOffLogs.add }).click();
  const logging = dialog(page, forms.dropOffLogs.add);
  await pick(logging, said.made.reason, 'Device failed');
  await pick(logging, said.event.monitor, /^Ana Brooks \(M\d{6,}\)$/);
  await logging.getByLabel(forms.madeDay, { exact: true }).fill('2026-10-09');
  await pick(logging, forms.dropOffLogs.site, 'Marsh Road TDSR');
  await type(logging, forms.dropOffLogs.resident, 'Rosa Delgado');
  await logging.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByRole('row', { name: /Rosa Delgado/ })).toContainText('Marsh Road TDSR');
  await checkScreen(page);

  await page.goto(`/projects/${p1}/surveys`);
  await expect(heading(page)).toHaveText(forms.surveys.title);
  await checkScreen(page);
});
