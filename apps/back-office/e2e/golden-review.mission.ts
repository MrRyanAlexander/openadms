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
import { dialog, pick, type } from './fill.ts';
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
