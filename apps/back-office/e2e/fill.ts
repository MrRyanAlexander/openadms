// How a back office test fills a form, as a person does: a select opened by its button and an option
// picked by its name, a box ticked by its label, a field typed into by its label.
import { expect, type Locator, type Page } from '@playwright/test';

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The select labelled so, opened, and the option of that name picked. React Aria names a select's
// button by what it shows, then its label.
// A select whose options are still being read opens with none: it is opened again once they are
// there, as a person would.
export async function pick(scope: Page | Locator, label: string, option: string): Promise<void> {
  const page = 'page' in scope ? scope.page() : scope;
  const button = scope.getByRole('button', { name: new RegExp(`(^| )${escaped(label)}$`) });
  const choice = page.getByRole('option', { name: option, exact: true });
  await expect(async () => {
    if (!(await choice.isVisible())) {
      if ((await page.getByRole('listbox').count()) > 0) await page.keyboard.press('Escape');
      await button.click();
    }
    await expect(choice).toBeVisible({ timeout: 1000 });
  }).toPass();
  await choice.click();
}

// One of a few, picked by its words in the group labelled so.
export async function choose(scope: Page | Locator, group: string, option: string): Promise<void> {
  const radio = scope
    .getByRole('radiogroup', { name: group })
    .getByRole('radio', { name: option, exact: true });
  await scope.getByRole('radiogroup', { name: group }).getByText(option, { exact: true }).click();
  await expect(radio).toBeChecked();
}

// A box ticked (or not) as a person does it: by pressing its words, React Aria's input being
// visually hidden beside them.
export async function tick(scope: Page | Locator, label: string, on = true): Promise<void> {
  const box = scope.getByRole('checkbox', { name: label, exact: true });
  if ((await box.isChecked()) === on) return;
  await scope.getByText(label, { exact: true }).click();
  await expect(box).toBeChecked({ checked: on });
}

export async function type(scope: Page | Locator, label: string, value: string): Promise<void> {
  await scope.getByLabel(label, { exact: true }).fill(value);
}

// The dialog open now, by its title.
export const dialog = (page: Page, title: string): Locator =>
  page.getByRole('dialog', { name: title });
