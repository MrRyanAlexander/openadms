// The back office's frame, a desktop (shell.tsx; the user, 2026-10-22): the menu bar worked by the
// keyboard (WAI-ARIA's menubar: arrows, a letter, Enter, Escape giving the focus back); the
// desktop's folder icons opening as windows, moved between by the arrows; a window minimized to
// the taskbar and opened from it, maximized and restored, closed back to the desktop; a deep link
// opening its window, and Back; the project picker taking a person to a project; what a person may
// not open kept out of their menus and folders; and the menu bar folded, windows maximized, on a
// narrow screen and with large text. Then their own account and sessions.
import type { Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { signedIn, worldIds } from './world.ts';

const said = english.desk;
const p1Name = 'Bayline County ROW, Hurricane Delphine';
const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const menuBar = (page: Page) => page.getByRole('menubar', { name: said.menus });
const menuName = (page: Page, name: string) =>
  menuBar(page).getByRole('menuitem', { name, exact: true });
const desktopIcons = (page: Page) => page.getByRole('navigation', { name: said.icons });
const taskbar = (page: Page) => page.getByRole('navigation', { name: said.windows });

test('the desktop: the menu bar by the keyboard opens About; a window closed is gone to the desktop, whose folder icons open by the arrows and Enter; a window minimized to the taskbar opens from it; maximized and restored; the picker opens P1; a deep link opens its window, and Back the one before', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Casey Ward', 'ADMIN');
  await page.goto('/');
  await expect(heading(page)).toHaveText(english.home.title);
  await expect(
    page.getByRole('region', { name: said.windowNamed.replace('{title}', english.home.title) }),
  ).toBeVisible();
  await expect(taskbar(page).getByRole('link', { name: english.home.title })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // The menu bar is one stop of Tab; the arrows move along it and into a menu.
  const file = menuName(page, said.file);
  await file.focus();
  await page.keyboard.press('ArrowRight');
  await expect(menuName(page, said.view)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const firm = menuName(page, english.shell.sections.firm);
  await expect(firm).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(firm).toHaveAttribute('aria-expanded', 'true');
  const firmMenu = page.getByRole('menu', { name: english.shell.sections.firm });
  await expect(
    firmMenu.getByRole('menuitem', { name: english.shell.links.projects, exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    firmMenu.getByRole('menuitem', { name: english.shell.links.clients, exact: true }),
  ).toBeFocused();
  // Right carries the open menu along; Escape closes it and gives the focus back to its name.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menu', { name: said.window })).toBeVisible();
  await expect(firmMenu).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(menuName(page, said.window)).toBeFocused();
  // A letter moves to the menu it begins; Enter opens it and chooses.
  await page.keyboard.press('h');
  await expect(menuName(page, said.help)).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const about = english.about.title.replace('{name}', english.app.name);
  await expect(heading(page)).toHaveText(about);
  await expect(page).toHaveURL('/about');
  await checkScreen(page);

  // Closed: back to the desktop, and off the taskbar.
  await page.getByRole('button', { name: said.closeWindow }).click();
  await expect(page).toHaveURL('/desktop');
  await expect(heading(page)).toHaveText(said.desktop);
  await expect(taskbar(page).getByRole('link', { name: about })).toHaveCount(0);
  await expect(taskbar(page).getByRole('link', { name: english.home.title })).toBeVisible();
  await checkScreen(page);

  // A folder by a press; inside it, the arrows and Enter.
  await desktopIcons(page).getByRole('link', { name: english.shell.sections.firm }).click();
  await expect(page).toHaveURL('/areas/firm');
  await expect(heading(page)).toHaveText(english.shell.sections.firm);
  const folder = page.getByRole('navigation', {
    name: said.areaIcons.replace('{area}', english.shell.sections.firm),
  });
  await folder.getByRole('link', { name: english.shell.links.projects }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(folder.getByRole('link', { name: english.shell.links.clients })).toBeFocused();
  await checkScreen(page);
  await folder.getByRole('link', { name: english.shell.links.clients }).focus();
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText(english.clients.title);

  // Minimized: the desktop, the window kept on the taskbar, and opened again from it.
  await page.getByRole('button', { name: said.minimizeWindow }).click();
  await expect(page).toHaveURL('/desktop');
  await taskbar(page).getByRole('link', { name: english.shell.links.clients }).click();
  await expect(page).toHaveURL('/clients');
  await expect(heading(page)).toHaveText(english.clients.title);

  // Maximized over the desktop's icons, and restored.
  await expect(desktopIcons(page)).toBeVisible();
  await page.getByRole('button', { name: said.maximizeWindow }).click();
  await expect(desktopIcons(page)).toBeHidden();
  await page.getByRole('button', { name: said.restoreWindow }).click();
  await expect(desktopIcons(page)).toBeVisible();

  // The picker: P1 by name; the project's folders join the desktop.
  await page.getByRole('button', { name: new RegExp(english.shell.noProject) }).click();
  await page.getByRole('option', { name: p1Name }).click();
  await expect(heading(page)).toHaveText(p1Name);
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(
    desktopIcons(page).getByRole('link', { name: english.shell.sections.billings }),
  ).toBeVisible();
  await checkScreen(page);

  // A deep link opens its window; Back the one before.
  const { p1 } = await worldIds();
  await page.goto(`/projects/${p1}/ledger`);
  await expect(heading(page)).toHaveText(english.billings.ledger.title);
  await expect(
    page.getByRole('region', {
      name: said.windowNamed.replace('{title}', english.shell.links.ledger),
    }),
  ).toBeVisible();
  await page.goBack();
  await expect(heading(page)).toHaveText(p1Name);

  await page.goto('/no/such/screen');
  await expect(heading(page)).toHaveText(english.notFound.title);
});

test('ADR-539 a manager granted review alone is shown no setup, dispatch or closing, in the menus or on the desktop', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Rowan Hart', 'MANAGER_ANALYST', ['VIEW_REVIEW']);
  const { p1 } = await worldIds();
  await page.goto(`/projects/${p1}/desktop`);
  await expect(heading(page)).toHaveText(said.desktop);
  await expect(desktopIcons(page).getByRole('link')).toHaveText([
    english.shell.sections.firm,
    english.shell.sections.tickets,
    english.shell.sections.forms,
    english.shell.sections.billings,
  ]);
  await expect(menuName(page, english.shell.sections.setup)).toHaveCount(0);
  await expect(menuName(page, english.shell.sections.dispatch)).toHaveCount(0);
  await menuName(page, english.shell.sections.billings).click();
  const billings = page.getByRole('menu', { name: english.shell.sections.billings });
  await expect(billings.getByRole('menuitem')).toHaveText([
    english.shell.links.ledger,
    english.shell.links.qc,
    english.shell.links.batches,
    english.shell.links.audit,
  ]);
  await page.keyboard.press('Escape');
  await menuName(page, english.shell.sections.firm).click();
  await expect(
    page.getByRole('menu', { name: english.shell.sections.firm }).getByRole('menuitem'),
  ).toHaveText([english.shell.links.projects]);
  await page.keyboard.press('Escape');
  await checkScreen(page);
});

test('WCAG 1.4.10 at 320 px and with text at 200%: the menus fold into one, worked by the keyboard; every window maximized; nothing scrolls sideways', async ({
  page,
  context,
}) => {
  await signedIn(context, 'Reese Calder', 'ADMIN');
  const { p1 } = await worldIds();
  await page.goto(`/projects/${p1}/ledger`);
  await expect(heading(page)).toHaveText(english.billings.ledger.title);
  await expect(menuName(page, english.shell.menu)).toHaveCount(0);
  await expect(page.getByRole('button', { name: said.maximizeWindow })).toBeVisible();

  const folded = async () => {
    await expect(menuName(page, english.shell.menu)).toBeVisible();
    await expect(menuName(page, said.file)).toHaveCount(0);
    await expect(page.getByRole('button', { name: said.maximizeWindow })).toBeHidden();
    await expect(desktopIcons(page)).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  };

  // A desk's width with text at 200%: a project's ten menus no longer fit across.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await folded();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await expect(menuName(page, said.file)).toBeVisible();

  // 320 CSS px wide: the one menu, its groups under their names, by the keyboard.
  await page.setViewportSize({ width: 320, height: 640 });
  await folded();
  const menu = menuName(page, english.shell.menu);
  await menu.focus();
  await page.keyboard.press('ArrowDown');
  const all = page.getByRole('menu', { name: english.shell.menu });
  await expect(all.getByRole('group', { name: said.file })).toBeVisible();
  await expect(all.getByRole('menuitem', { name: said.showDesktop })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await checkScreen(page);
});

test('their own account: who they are, two-step sign-in on, their sessions open now with this one marked', async ({
  page,
  context,
}) => {
  const person = await signedIn(context, 'Drew Patel', 'MANAGER_ANALYST', ['VIEW_REVIEW']);
  await page.goto('/account');
  await expect(heading(page)).toHaveText(english.account.title);
  await expect(page.getByText(english.account.twoStepOn)).toBeVisible();
  await expect(page.getByText(person.name, { exact: false }).first()).toBeVisible();
  const sessions = page.getByRole('table', { name: english.account.sessions });
  await expect(sessions.getByText(english.account.thisOne)).toBeVisible();
});
