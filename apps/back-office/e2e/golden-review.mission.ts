// The golden mission's review through the back office's screens (spec/golden/MISSION.md §2, §4;
// stories/golden-review.ts names the same acts, done there at their endpoints): Wednesday
// morning, the tower's late sync in and the worker run, nothing reviewed. A reviewer reads the
// queue of each workflow as the outcomes approve it, then, ticket by ticket on its page:
// - 101003: its flag for the 96% call accepted, Photos confirm, "Heaped; photos confirm";
// - 101060: Kim's disposal renumbered to 101006 (real work: renumber, never void), then its
//   typed-number flag accepted, "Cert, times and photos match 101006";
// - 301003: voided, Duplicate ticket, "Duplicate of 301001" (renumbering it would double-bill);
// - 301005: voided, Not eligible work, "Under 24 in; goes out as vegetative debris".
// Each act's run is the world's worker's; the page reads the ticket again as it is worked. Then
// nothing waits in any workflow's queue, and each ticket stands as the outcomes say.
import type { Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { dialog, pick, tick, type } from './fill.ts';
import { missionOutcomes, signedIn, worldIds, type MissionOutcomes } from './world.ts';

const said = english.review;
const workflowsAll = ['LOAD', 'HAUL_OUT', 'UNIT_RATE'] as const;
type Status = keyof typeof said.statuses;
// The worker takes up what an act queued within a few of its passes.
const worked = { timeout: 20_000 };

test.describe.configure({ mode: 'serial' });

let outcomes: MissionOutcomes;
let p1: string;

test.beforeAll(async () => {
  outcomes = await missionOutcomes();
  p1 = (await worldIds()).p1;
});

const ticketPage = (workflow: string, number: string) =>
  `/projects/${p1}/tickets/${workflow}/${number}`;

const statusOf = (page: Page) => page.locator('dl.facts').first().getByRole('definition').first();

async function accepted(page: Page, number: string, flagShown: RegExp, note: string) {
  await page.goto(ticketPage('LOAD', number));
  await page.getByRole('button', { name: flagShown }).click();
  const accepting = dialog(page, said.ticket.accept);
  await pick(accepting, said.reason, 'Photos confirm');
  await type(accepting, said.note, note);
  await accepting.getByRole('button', { name: said.ticket.accept }).click();
  await expect(page.getByText(said.ticket.flagAccepted)).toBeVisible(worked);
  await expect(statusOf(page)).toHaveText(said.statuses.COMPLETED, worked);
}

async function voided(page: Page, number: string, reason: string, note: string) {
  await page.goto(ticketPage('UNIT_RATE', number));
  await page.getByRole('button', { name: said.ticket.void }).click();
  const voiding = dialog(page, said.ticket.void);
  await pick(voiding, said.reason, reason);
  await type(voiding, said.note, note);
  await voiding.getByRole('button', { name: said.ticket.void }).click();
  await expect(statusOf(page)).toHaveText(said.statuses.VOID, worked);
}

test('AC-04-12, AC-08-01, AC-08-02 Wednesday before any review: each workflow’s queue as the outcomes approve it, each ticket with its status and its open flags in the worker’s words', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Avery Lund', 'MANAGER_ANALYST', [
    'VIEW_REVIEW',
    'CORRECT',
    'RENUMBER',
    'VOID',
    'ACCEPT_FLAG',
  ]);
  for (const workflow of workflowsAll) {
    await page.goto(`/projects/${p1}/review?workflow=${workflow}`);
    const queue = page.getByRole('table', {
      name: new RegExp(`^${said.workflows[workflow]}: tickets`),
    });
    const expected = outcomes.wednesday.p1.queue[workflow];
    if (expected.length === 0) await expect(queue).toContainText(english.table.empty);
    for (const line of expected) {
      const [head = '', ...messages] = line.split(' · ');
      const [number = '', status = ''] = head.split(' ');
      const row = queue.getByRole('row', { name: new RegExp(`^${number}\\b`) });
      await expect(row).toContainText(said.statuses[status as Status]);
      for (const message of messages) await expect(row).toContainText(message);
    }
    await expect(queue.getByRole('row')).toHaveCount(Math.max(expected.length, 1) + 1);
  }
  await checkScreen(page);
});

test('AC-08-64 the review done on the screens: 101003 accepted, 101060 renumbered to 101006 and its typed number accepted, 301003 and 301005 voided; each ticket worked again; nothing waits in any queue', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Blair Okafor', 'MANAGER_ANALYST', [
    'VIEW_REVIEW',
    'CORRECT',
    'RENUMBER',
    'VOID',
    'ACCEPT_FLAG',
  ]);
  await accepted(page, '101003', /^Accept the flag: Ticket 101003/, 'Heaped; photos confirm');
  await checkScreen(page);

  await page.goto(ticketPage('LOAD', '101060'));
  const disposal = page.getByRole('region', { name: 'Disposal (DIS) 101060' });
  await disposal.getByRole('button', { name: said.event.renumber, exact: true }).click();
  const renumbering = dialog(page, said.event.renumber);
  await type(renumbering, said.event.newNumber, '101006');
  await renumbering.getByRole('button', { name: said.event.renumber }).click();
  // The page follows the disposal to 101006, and reads it again as the worker takes it up.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Loads ticket 101006');
  await expect(page.getByRole('region', { name: 'Disposal (DIS) 101006' })).toBeVisible();
  const typedFlag = /^Accept the flag: Ticket 101006: typed ticket number/;
  await expect(page.getByRole('button', { name: typedFlag })).toBeVisible(worked);

  await accepted(page, '101006', typedFlag, 'Cert, times and photos match 101006');
  await page.getByRole('button', { name: said.ticket.showHistory }).click();
  await expect(page.getByRole('table', { name: said.ticket.history })).toContainText(
    'ticket_number: 101060 → 101006',
  );
  await checkScreen(page);

  await voided(page, '301003', 'Duplicate ticket', 'Duplicate of 301001');
  await voided(page, '301005', 'Not eligible work', 'Under 24 in; goes out as vegetative debris');
  await checkScreen(page);

  for (const line of outcomes.reviewed.p1.statuses) {
    const [number = '', status = ''] = line.split(' ');
    const workflow = number.startsWith('1')
      ? 'LOAD'
      : number.startsWith('2')
        ? 'HAUL_OUT'
        : 'UNIT_RATE';
    await page.goto(ticketPage(workflow, number));
    await expect(statusOf(page)).toHaveText(said.statuses[status as Status], worked);
  }
  for (const workflow of workflowsAll) {
    await page.goto(`/projects/${p1}/review?workflow=${workflow}`);
    await expect(
      page.getByRole('table', { name: new RegExp(`^${said.workflows[workflow]}: tickets`) }),
    ).toContainText(english.table.empty);
  }
});

test('AC-09-11, AC-09-31, AC-07-113 P1’s thirteen live tickets QC Approved on the screens and locked as invoiced in “Bayline ROW, week of 12 Oct”; the ledger reads $5,548.25 on 19 lines, the batch the same; P2’s ledger $324.00 on 2', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await signedIn(context, 'Casey Whitlow', 'MANAGER_ANALYST', [
    'VIEW_REVIEW',
    'QC',
    'LOCK_INVOICED',
  ]);
  const billings = english.billings;
  const { p2 } = await worldIds();
  await page.goto(`/projects/${p1}/invoice-batches`);
  await page.getByRole('button', { name: billings.batches.add }).click();
  const naming = dialog(page, billings.batches.add);
  await type(naming, billings.batches.name, 'Bayline ROW, week of 12 Oct');
  await naming.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByRole('row', { name: /Bayline ROW, week of 12 Oct/ })).toBeVisible();

  await page.goto(`/projects/${p1}/qc`);
  let locked = 0;
  for (const workflow of workflowsAll) {
    await page
      .getByRole('radiogroup', { name: billings.tickets.workflow })
      .getByText(said.workflows[workflow], { exact: true })
      .click();
    await pick(page, billings.tickets.status, said.statuses.COMPLETED);
    const table = page.getByRole('table', {
      name: `${said.workflows[workflow]}: every ticket`,
    });
    await expect(table.getByRole('row').nth(1)).toBeVisible();
    const tickAll = async () => {
      const names = await table
        .getByRole('checkbox')
        .evaluateAll((boxes) => boxes.map((box) => box.closest('label')?.textContent ?? ''));
      for (const name of names) await tick(table, name);
      return names.length;
    };
    const count = await tickAll();
    await page.getByRole('button', { name: billings.tickets.setQc }).click();
    const qc = page.getByRole('dialog', { name: /^Set the QC status of/ });
    await pick(qc, billings.tickets.qcTo, said.qc.QC_APPROVED);
    await qc.getByRole('button', { name: billings.tickets.setQc }).click();
    await expect(
      page.getByText(new RegExp(`^${String(count)} tickets? done; no ticket not\\.$`)),
    ).toBeVisible();
    // The table is read again once QC is set: every ticket in it QC Approved.
    await expect(table.getByText(said.qc.QC_APPROVED, { exact: true })).toHaveCount(count);
    await tickAll();
    await page.getByRole('button', { name: billings.tickets.lock, exact: true }).click();
    const locking = page.getByRole('dialog', { name: /^Lock .* as invoiced$/ });
    await pick(locking, billings.tickets.batch, 'Bayline ROW, week of 12 Oct');
    await locking.getByRole('button', { name: billings.tickets.lock }).click();
    await expect(
      table.getByText('Locked as invoiced, in Bayline ROW, week of 12 Oct', { exact: true }),
    ).toHaveCount(count);
    locked += count;
  }
  expect(locked).toBe(13);
  await checkScreen(page);

  const p1Total = outcomes.reviewed.p1.total;
  await page.goto(`/projects/${p1}/ledger`);
  await expect(
    page.getByText(`${String(p1Total.lines)} lines, ${p1Total.total} in all`),
  ).toBeVisible();
  await pick(page, english.billings.ledger.batch, 'Bayline ROW, week of 12 Oct');
  await expect(
    page.getByText(`${String(p1Total.lines)} lines, ${p1Total.total} in all`),
  ).toBeVisible();
  await checkScreen(page);

  const p2Total = outcomes.reviewed.p2.total;
  await page.goto(`/projects/${p2 ?? ''}/ledger`);
  await expect(
    page.getByText(`${String(p2Total.lines)} lines, ${p2Total.total} in all`),
  ).toBeVisible();
});
