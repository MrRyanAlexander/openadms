// People, phones, the board and the clock in the back office (ARCHITECTURE §7; ADR-240, 241, 530;
// BUILD.md, settled 1), in the run's own world: P1's six monitors on the yard phone, and Ana
// Brooks's Thursday on P1's time clock, in at 18:00 and out at 01:30 on Friday.
import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { dialog, pick, tick, type } from './fill.ts';
import { signedIn, worldIds } from './world.ts';

const heading = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1 });

// A monitor's Monitor ID, as the people's table shows it (the series moves on every run).
async function monitorIdOf(page: import('@playwright/test').Page, name: string): Promise<string> {
  await page.goto('/people');
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toContainText(/M\d{6,}/);
  return (await row.textContent())?.match(/M\d{6,}/)?.[0] ?? '';
}

test('people: Ana Brooks’s card with her assignments; a manager added, granted dispatch, given a password, her sessions ended, archived and put back', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Logan Pierce', 'ADMIN');
  const said = english.people;
  await page.goto('/people');
  await expect(heading(page)).toHaveText(said.title);
  const ana = page.getByRole('row', { name: /Ana Brooks/ });
  await expect(ana).toContainText(said.roles.MONITOR);
  await checkScreen(page);
  await ana.getByRole('link', { name: 'Ana Brooks' }).click();
  await expect(heading(page)).toHaveText('Ana Brooks');
  const history = page.getByRole('table', { name: said.history });
  await expect(history.getByRole('row')).toHaveCount(3);
  await checkScreen(page);

  await page.goto('/people');
  await page.getByRole('button', { name: said.add }).click();
  const adding = dialog(page, said.add);
  await type(adding, said.name, 'Lena Fox');
  await type(adding, said.email, 'lena.fox@gates.example');
  await pick(adding, said.role, said.roles.MANAGER_ANALYST);
  await adding.getByRole('button', { name: english.common.save }).click();
  await page
    .getByRole('row', { name: /Lena Fox/ })
    .getByRole('link', { name: 'Lena Fox' })
    .click();
  await expect(heading(page)).toHaveText('Lena Fox');
  await tick(page, said.permissionNames.VIEW_DISPATCH);
  await tick(page, said.permissionNames.DISPATCH);
  await page.getByRole('button', { name: said.savePermissions }).click();
  await expect(page.getByText(english.common.saved)).toBeVisible();
  await page.getByRole('button', { name: said.passwordToGive }).click();
  const setting = dialog(page, said.passwordToGive);
  await setting.getByLabel(said.passwordLabel).fill('egret point ferry crossing');
  await setting.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByText(said.passwordSet)).toBeVisible();
  await page.getByRole('button', { name: said.endSessions }).click();
  await expect(page.getByText(said.ended.none)).toBeVisible();
  await page.getByRole('button', { name: said.archive }).click();
  await expect(page.getByRole('button', { name: said.unarchive })).toBeVisible();
  await page.getByRole('button', { name: said.unarchive }).click();
  await expect(page.getByRole('button', { name: said.archive })).toBeVisible();
  await checkScreen(page);
});

test('the firm’s settings and its phones: a monitor’s session to 10 hours; the master passcode changed, the yard phone shown behind; P1-YARD taken out of service and returned; its sign-ins', async ({
  page,
  context,
}) => {
  const admin = await signedIn(context, 'Morgan Blake', 'ADMIN');
  const said = english.firmSettings;
  await page.goto('/settings');
  await expect(heading(page)).toHaveText(said.title);
  const sessions = `${said.change}: ${said.monitorSessions}`;
  await page.getByRole('button', { name: sessions }).click();
  const changing = dialog(page, said.monitorSessions);
  await changing.getByLabel(said.monitorSessions, { exact: true }).fill('10');
  await type(changing, said.note, 'Longer shifts this week');
  await changing.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByText(english.common.saved)).toBeVisible();
  await page.getByRole('button', { name: said.changePasscode }).click();
  const passcode = dialog(page, said.changePasscode);
  await passcode.getByLabel(said.yourPasswordLabel).fill(admin.password);
  await passcode.getByLabel(said.newPasscode).fill('marsh-heron-delphine-second');
  await passcode.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByText(/The master passcode is changed: version \d+\./)).toBeVisible();
  await checkScreen(page);

  const phones = english.phones;
  await page.goto('/phones');
  const yard = page.getByRole('row', { name: /P1-YARD/ });
  await expect(yard).toContainText(phones.statuses.ACTIVE);
  await expect(yard).toContainText(/behind/);
  await yard.getByRole('button', { name: 'See sign-ins: P1-YARD' }).click();
  const signIns = dialog(page, 'Sign-ins on P1-YARD');
  await expect(signIns.getByRole('table')).toContainText(phones.kinds.own);
  await signIns.getByRole('button', { name: english.common.cancel }).click();
  await yard.getByRole('button', { name: 'Take P1-YARD out of service' }).click();
  const out = dialog(page, 'Take P1-YARD out of service');
  await pick(out, phones.outStatus, phones.statuses.RETIRED);
  await out.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByRole('row', { name: /P1-YARD/ })).toBeHidden();
  await page
    .getByRole('radiogroup', { name: phones.which })
    .getByText(phones.outOfServiceOnly, { exact: true })
    .click();
  await page
    .getByRole('row', { name: /P1-YARD/ })
    .getByRole('button', { name: 'Return P1-YARD to service' })
    .click();
  const back = dialog(page, 'Return P1-YARD to service');
  await type(back, phones.note, 'Found in the truck');
  await back.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByRole('row', { name: /P1-YARD/ })).toBeHidden();
  await checkScreen(page);
});

test('the dispatch board for Friday 9 October: Ana’s assignment; Kim Nguyen assigned to disposals at Marsh Road TDSR, withdrawn and reinstated; the day copied to Saturday', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Nico Rhodes', 'MANAGER_ANALYST', [
    'VIEW_DISPATCH',
    'DISPATCH',
    'VIEW_SETUP',
  ]);
  const { p1 } = await worldIds();
  const said = english.dispatch;
  const kimsId = await monitorIdOf(page, 'Kim Nguyen');
  await page.goto(`/projects/${p1}/dispatch`);
  await expect(heading(page)).toHaveText(said.title);
  await page.getByLabel(said.day).fill('2026-10-09');
  const board = page.getByRole('table', { name: /Dispatch board, Oct 9, 2026/ });
  await expect(board.getByRole('row', { name: /Ana Brooks/ })).toContainText(said.kinds.COLLECTION);
  await page.getByRole('button', { name: said.add }).click();
  const adding = dialog(page, said.add);
  await pick(adding, said.person, `Kim Nguyen (${kimsId})`);
  await tick(adding, said.kinds.COLLECTION, false);
  await tick(adding, said.kinds.DISPOSAL);
  await pick(adding, said.site, 'Marsh Road TDSR');
  await adding.getByRole('button', { name: english.common.save }).click();
  const kim = board.getByRole('row', { name: /Kim Nguyen/ });
  await expect(kim).toContainText('Marsh Road TDSR');
  await kim.getByRole('button', { name: 'Withdraw Kim Nguyen’s assignment' }).click();
  const withdrawing = dialog(page, 'Withdraw Kim Nguyen’s assignment');
  await type(withdrawing, said.note, 'Tower closed today');
  await withdrawing.getByRole('button', { name: english.common.save }).click();
  await expect(board.getByRole('row', { name: /Kim Nguyen/ })).toBeHidden();
  await tick(page, said.showWithdrawn);
  await board.getByRole('button', { name: 'Reinstate Kim Nguyen’s assignment' }).click();
  await tick(page, said.showWithdrawn, false);
  await expect(board.getByRole('row', { name: /Kim Nguyen/ })).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.copy }).click();
  const copying = dialog(page, said.copy);
  await type(copying, said.copyTo, '2026-10-10');
  await copying.getByRole('button', { name: english.common.save }).click();
  await expect(page.getByText('2 assignments copied.')).toBeVisible();
  await page.getByLabel(said.day).fill('2026-10-10');
  await expect(
    page.getByRole('table', { name: /Oct 10, 2026/ }).getByRole('row', { name: /Kim Nguyen/ }),
  ).toBeVisible();
});

test('the time clock: Ana’s Thursday, 5 h 30 min worked on it and 1 h 30 min past midnight counted on Friday; her day approved, then unlocked with a note', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Omari Lane', 'MANAGER_ANALYST', ['VIEW_DISPATCH', 'APPROVE_HOURS']);
  const { p1 } = await worldIds();
  const said = english.hours;
  await page.goto(`/projects/${p1}/hours`);
  await expect(heading(page)).toHaveText(said.title);
  await page.getByLabel(said.from).fill('2026-10-07');
  await page.getByLabel(said.to).fill('2026-10-10');
  const totals = page.getByRole('table', { name: said.totals });
  await expect(totals.getByRole('row', { name: /Oct 8, 2026/ })).toContainText('5 h 30 min');
  await expect(totals.getByRole('row', { name: /Oct 9, 2026/ })).toContainText('1 h 30 min');
  const thursday = page.getByRole('region', { name: 'Ana Brooks: Oct 8, 2026' });
  await expect(thursday).toContainText(`${said.otherDays}Oct 9, 2026: 1 h 30 min`);
  await thursday.getByRole('button', { name: 'Approve Ana Brooks’s day' }).click();
  await expect(thursday).toContainText('Approved by Omari Lane');
  await checkScreen(page);
  await thursday.getByRole('button', { name: 'Unlock Ana Brooks’s day' }).click();
  const unlocking = dialog(page, 'Unlock Ana Brooks’s day');
  await type(unlocking, said.unlockNote, 'Break was 45 minutes, not 30');
  await unlocking.getByRole('button', { name: english.common.save }).click();
  await expect(thursday).toContainText(said.notApproved);
});
