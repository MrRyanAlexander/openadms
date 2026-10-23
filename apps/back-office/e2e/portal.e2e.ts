// The read-only viewer portal (REQ-408; ADR-169, 315, 324, 361, 435), read through `/viewer/…`
// alone, in the run's world where P1 stands set up for its field days: an admin at her own browser
// makes collection 101601 because a phone failed (on Friday 16 October, a day no other test's board reads); Bayline County's debris manager, a client user,
// reads P1, its tickets, 101601 whole with its history, its certifications, its forms and its
// setup; Coastline's contractor user is shown neither forms nor setup. Every screen is checked as it
// is left.
import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { dialog, pick, type } from './fill.ts';
import { signedIn, worldIds } from './world.ts';

const heading = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1 });
const said = english.portal;
const p1Name = 'Bayline County ROW, Hurricane Delphine';

test('REQ-408 a client user reads P1 read only: its tickets, 101601 whole with who recorded it and its history, its certifications, its ROEs and forms, its setup; nothing to change anywhere', async ({
  page,
  context,
  browser,
}) => {
  const { p1 } = await worldIds();
  // The back office makes the ticket, at its own browser.
  const office = await browser.newContext();
  await signedIn(office, 'Lane Ortiz', 'ADMIN');
  const desk = await office.newPage();
  await desk.goto(`/projects/${p1}/review`);
  await desk.getByRole('button', { name: english.review.queue.newFieldEvent }).click();
  const making = dialog(desk, english.review.made.title);
  await type(making, english.review.made.ticketNumber, '101601');
  await pick(making, english.review.made.reason, 'Device failed');
  await pick(making, english.review.event.monitor, /^Ana Brooks \(M\d{6,}\)$/);
  await type(making, english.review.event.certNumber, '730415');
  await making.getByLabel(english.review.event.startDay, { exact: true }).fill('2026-10-16');
  await making.getByLabel(english.review.event.endDay, { exact: true }).fill('2026-10-16');
  await making.getByRole('button', { name: english.review.made.make }).click();
  await expect(desk.getByRole('heading', { level: 1 })).toHaveText('Loads ticket 101601');
  await office.close();

  await signedIn(context, 'Robin Hale', 'READ_ONLY_VIEWER', [], { viewerKind: 'CLIENT' });
  await page.goto('/');
  await expect(heading(page)).toHaveText(said.projects.title);
  await page.getByRole('link', { name: p1Name }).click();
  await expect(heading(page)).toHaveText(p1Name);
  await page.getByRole('link', { name: '101601' }).click();
  await expect(heading(page)).toHaveText('Loads ticket 101601');
  const card = page.getByRole('region', { name: 'Collection (COL) 101601' });
  await expect(card).toContainText(/Ana Brooks \(M\d{6,}\)/);
  await expect(page.getByRole('table', { name: said.ticket.history })).toContainText('field_event');
  await expect(page.getByRole('button', { name: english.review.ticket.void })).toHaveCount(0);
  await checkScreen(page);
  await page.goto('/');
  await expect(heading(page)).toHaveText(said.projects.title);
  await checkScreen(page);
  await page.goto(`/projects/${p1}`);
  await expect(heading(page)).toHaveText(p1Name);
  await checkScreen(page);
  await page.goto(`/projects/${p1}/certifications`);
  await expect(heading(page)).toHaveText(said.certifications.title);
  await checkScreen(page);
  await page.goto(`/projects/${p1}/forms`);
  await expect(page.getByRole('table', { name: said.forms.roes })).toBeVisible();
  await checkScreen(page);
  await page.goto(`/projects/${p1}/setup`);
  await expect(page.getByRole('table', { name: said.setup.payItems })).toBeVisible();
  await checkScreen(page);
});

test('ADR-315 a contractor user is shown its own contractor’s work: no ROEs, forms or setup in its menus or on its desktop', async ({
  page,
  context,
}) => {
  const { p1 } = await worldIds();
  await signedIn(context, 'Sam Rivera', 'READ_ONLY_VIEWER', [], {
    viewerKind: 'CONTRACTOR',
    contractor: 'Coastline Haulers LLC',
  });
  await page.goto(`/projects/${p1}`);
  await expect(heading(page)).toHaveText(p1Name);
  // The menu bar's menu of the project, and the desktop's folder of it: its tickets and
  // certifications, never its forms or setup.
  await page.getByRole('menuitem', { name: said.sections.project, exact: true }).click();
  const menu = page.getByRole('menu', { name: said.sections.project });
  await expect(menu.getByRole('menuitem', { name: said.links.tickets, exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: said.links.forms })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: said.links.setup })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: english.desk.closeWindow }).click();
  await expect(page).toHaveURL(`/projects/${p1}/desktop`);
  await page
    .getByRole('navigation', { name: english.desk.icons })
    .getByRole('link', { name: said.sections.project, exact: true })
    .click();
  await expect(heading(page)).toHaveText(said.sections.project);
  const folder = page.getByRole('navigation', {
    name: english.desk.areaIcons.replace('{area}', said.sections.project),
  });
  await expect(folder.getByRole('link')).toHaveText([
    said.links.tickets,
    said.links.certifications,
  ]);
  await checkScreen(page);
});
