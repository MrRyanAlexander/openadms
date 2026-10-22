// Signing in to the back office (ARCHITECTURE §6, Back-office sessions; ADR-408…412): through every
// screen a person meets, in the run's own world. A manager whose password an admin set signs in,
// chooses their own, sets their authenticator up from the key the screen shows, and is in; signs
// out; and signs in again with their app's code. A wrong password is refused in the same words
// whatever was wrong. A reset by email: the address typed, the code read from the message, a new
// password set; and the person signs in with it.
import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { codeNow, givenPassword, later, mailTo } from './world.ts';

const heading = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1 });

test('a manager whose password an admin set signs in, chooses their own, sets up two-step sign-in from the key shown, signs out, and signs in again with the code; a wrong password is refused in plain words', async ({
  page,
}) => {
  const person = await givenPassword('Avery Cole', 'MANAGER_ANALYST', ['VIEW_SETUP']);
  await page.goto('/');
  await expect(heading(page)).toHaveText(english.signIn.title);
  await checkScreen(page);

  // A wrong password: the same words whatever was wrong.
  await page.getByLabel(english.signIn.email).fill(person.email);
  await page.getByLabel(english.signIn.password).fill('not the password at all');
  await page.getByRole('button', { name: english.signIn.signIn }).click();
  await expect(page.getByText(english.signIn.refused)).toBeVisible();

  // The password Dana set: their own chosen first.
  await page.getByLabel(english.signIn.password).fill(person.password);
  await page.getByRole('button', { name: english.signIn.signIn }).click();
  await expect(heading(page)).toHaveText(english.password.title);
  await expect(page.getByText(english.password.required)).toBeVisible();
  await checkScreen(page);
  const own = 'a heron stands in the marsh at dawn';
  await page.getByLabel(english.password.current).fill(person.password);
  await page.getByLabel(english.password.new, { exact: true }).fill(own);
  await page.getByLabel(english.password.again).fill('a heron stands in the marsh at dusk');
  await page.getByRole('button', { name: english.password.change }).click();
  await expect(page.getByText(english.password.mismatch)).toBeVisible();
  await page.getByLabel(english.password.again).fill(own);
  await page.getByRole('button', { name: english.password.change }).click();

  // Their authenticator, from the key the screen shows once.
  await expect(heading(page)).toHaveText(english.twoStep.title);
  await expect(page.getByText(english.twoStep.required)).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: english.twoStep.begin }).click();
  const key = (await page.locator('dd.secret-key').textContent()) ?? '';
  expect(key).toMatch(/^[A-Z2-7]{16,}$/);
  await page.getByLabel(english.twoStep.code).fill('000000');
  await page.getByRole('button', { name: english.twoStep.confirm }).click();
  await expect(page.getByText(english.twoStep.refused)).toBeVisible();
  await page.getByLabel(english.twoStep.code).fill(await codeNow(key));
  await page.getByRole('button', { name: english.twoStep.confirm }).click();
  await expect(heading(page)).toHaveText(english.home.title);

  // Signed out from their account.
  await page.getByRole('link', { name: person.name }).click();
  await expect(heading(page)).toHaveText(english.account.title);
  await page.getByRole('main').getByRole('button', { name: english.account.signOut }).click();
  await expect(page.getByText(english.signIn.signedOut)).toBeVisible();

  // In again: the password, then the code (a code is good once: the world's clock moves on).
  await later(30);
  await page.getByLabel(english.signIn.email).fill(person.email);
  await page.getByLabel(english.signIn.password).fill(own);
  await page.getByRole('button', { name: english.signIn.signIn }).click();
  await expect(page.getByText(english.signIn.codeNeeded)).toBeVisible();
  await page.getByLabel(english.signIn.code).fill(await codeNow(key));
  await page.getByRole('button', { name: english.signIn.signIn }).click();
  await expect(heading(page)).toHaveText(english.home.title);
});

test('a reset by email: the address typed, the code read from the message, a new password set twice, and the person signs in with it', async ({
  page,
}) => {
  const person = await givenPassword('Blair Ortiz', 'MANAGER_ANALYST');
  await page.goto('/');
  await page.getByRole('link', { name: english.signIn.forgot }).click();
  await expect(heading(page)).toHaveText(english.reset.title);
  await page.getByLabel(english.signIn.email).fill(person.email);
  await page.getByRole('button', { name: english.reset.ask }).click();
  await expect(page.getByText(english.reset.sent)).toBeVisible();
  const message = (await mailTo(person.email)).find(
    ({ subject }) => subject === 'Reset your Open ADMS password',
  );
  const code = /\n\n(\S+)\n\n/.exec(message?.text ?? '')?.[1] ?? '';
  expect(code).not.toBe('');

  await page.getByLabel(english.reset.code).fill('not-the-code');
  const fresh = 'cypress knees in the slough';
  await page.getByLabel(english.reset.password, { exact: true }).fill(fresh);
  await page.getByLabel(english.reset.again).fill(fresh);
  await page.getByRole('button', { name: english.reset.complete }).click();
  await expect(page.getByText(english.reset.refusedCode)).toBeVisible();
  await page.getByLabel(english.reset.code).fill(code);
  await page.getByRole('button', { name: english.reset.complete }).click();
  await expect(page.getByText(english.reset.done)).toBeVisible();
  await checkScreen(page);

  await page.getByRole('link', { name: english.reset.toSignIn }).click();
  await page.getByLabel(english.signIn.email).fill(person.email);
  await page.getByLabel(english.signIn.password).fill(fresh);
  await page.getByRole('button', { name: english.signIn.signIn }).click();
  // A manager with no authenticator sets one up before anything else.
  await expect(heading(page)).toHaveText(english.twoStep.title);
});
