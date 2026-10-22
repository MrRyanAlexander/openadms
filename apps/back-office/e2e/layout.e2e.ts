// The back office's frame (FROM-BUILD-1 §13): the menu closed by default and taking no room, opened
// by the button at the header's left, closed by Escape, a press outside it or a link chosen; the
// project picker taking a person to a project; the one paged table; their own account and sessions;
// an address that names no screen.
import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { signedIn } from './world.ts';

test('the menu is closed by default, opens from the header’s button, closes on Escape and on a link chosen; the project picker opens P1; the paged table lists the projects', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Casey Ward', 'ADMIN');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.home.title);
  const menu = page.getByRole('navigation', { name: english.shell.navigation });
  const toggle = page.getByRole('button', { name: english.shell.menu });
  await expect(menu).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();
  await expect(menu).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await menu.getByRole('link', { name: english.shell.links.projects }).click();
  await expect(menu).toBeHidden();

  // The one paged table: the projects, by name.
  const table = page.getByRole('table', { name: english.home.title });
  await expect(
    table.getByRole('rowheader', { name: 'Bayline County ROW, Hurricane Delphine' }),
  ).toBeVisible();

  // The picker: P1 by name.
  await page.getByRole('button', { name: new RegExp(english.shell.noProject) }).click();
  await page.getByRole('option', { name: 'Bayline County ROW, Hurricane Delphine' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Bayline County ROW, Hurricane Delphine',
  );
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await checkScreen(page);

  await page.goto('/no/such/screen');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.notFound.title);
});

test('their own account: who they are, two-step sign-in on, their sessions open now with this one marked', async ({
  page,
  context,
}) => {
  const person = await signedIn(context, 'Drew Patel', 'MANAGER_ANALYST', ['VIEW_REVIEW']);
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.account.title);
  await expect(page.getByText(english.account.twoStepOn)).toBeVisible();
  await expect(page.getByText(person.name, { exact: false }).first()).toBeVisible();
  const sessions = page.getByRole('table', { name: english.account.sessions });
  await expect(sessions.getByText(english.account.thisOne)).toBeVisible();
});
