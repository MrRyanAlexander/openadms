// The back office at its desk, for the golden mission through every screen (BUILD.md, done-when 2;
// spec/golden/MISSION.md §1, §4): Dana Reyes sets P1 and P2 up on the back office's screens, as
// the stories' shared steps set them up at their endpoints (`p1.ts`, `p1-field-setup.ts`,
// `p1-office.ts`, `p2.ts`); Luis Ortega reviews, QCs and locks the mission there; a client user
// reads it in the viewer portal. The back office is its own app: this test drives it as a person
// does, by the words it shows (they are its translation file's, read here off the screen), in a
// desktop browser of its own at the back office's world page (office-world.adms.localhost, its
// build for the stories' API, which the mission's world lists for CORS). Nothing of the back
// office's code is imported.
import { createHmac } from 'node:crypto';

import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';

export const officeOrigin = 'https://office-world.adms.localhost';

// How a person of the back office signs in, as the world hands it on.
export interface SignIn {
  readonly email: string;
  readonly password: string;
  readonly secret: string;
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The code an authenticator shows for a key at an instant (RFC 6238: HMAC-SHA1, six digits, 30 s).
function codeAt(secret: string, at: Date): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const letter of secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(letter).toString(2).padStart(5, '0');
  }
  const key: number[] = [];
  for (let place = 0; place + 8 <= bits.length; place += 8) {
    key.push(parseInt(bits.slice(place, place + 8), 2));
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / 30_000)));
  const mac = createHmac('sha1', Buffer.from(key)).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// A select labelled so, opened, and the option of that name picked (React Aria names a select's
// button by what it shows, then its label).
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

// A box ticked (or not) by its words.
export async function tick(scope: Page | Locator, label: string, on = true): Promise<void> {
  const box = scope.getByRole('checkbox', { name: label, exact: true });
  if ((await box.isChecked()) === on) return;
  await scope.getByText(label, { exact: true }).click();
  await expect(box).toBeChecked({ checked: on });
}

export async function type(scope: Page | Locator, label: string, value: string): Promise<void> {
  await scope.getByRole('textbox', { name: label, exact: true }).fill(value);
}

const dialog = (page: Page, title: string): Locator => page.getByRole('dialog', { name: title });
const heading = (page: Page): Locator => page.getByRole('heading', { level: 1 });

// One rule's "if": a criterion, its test and its value or values.
interface If {
  readonly criterion: string;
  readonly test: string;
  readonly value?: string;
  readonly values?: readonly string[];
  readonly number?: string;
  readonly to?: string;
  readonly item?: string;
}

// One rule's action: Add transaction #slot of a pay item, its quantity from the items chosen.
interface Then {
  readonly slot: number;
  readonly payItem: string;
  readonly items?: readonly string[];
}

export class OfficeDesk {
  readonly page: Page;
  private readonly context: BrowserContext;

  private constructor(context: BrowserContext, page: Page) {
    this.context = context;
    this.page = page;
  }

  // A person signed in at the back office's sign-in screen, the code their authenticator shows at
  // the world's time now.
  static async signedIn(browser: Browser, person: SignIn, now: string): Promise<OfficeDesk> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${officeOrigin}/`);
    await expect(heading(page)).toHaveText('Sign in');
    await page.getByLabel('Email address', { exact: true }).fill(person.email);
    await page.getByLabel('Password', { exact: true }).fill(person.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page
      .getByLabel('Code from your authenticator app', { exact: true })
      .fill(codeAt(person.secret, new Date(now)));
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(heading(page)).toHaveText('Projects');
    return new OfficeDesk(context, page);
  }

  // A read-only viewer signed in with the password an admin gave them, choosing their own first.
  static async viewerSignedIn(
    browser: Browser,
    viewer: { readonly email: string; readonly password: string },
  ): Promise<OfficeDesk> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${officeOrigin}/`);
    await page.getByLabel('Email address', { exact: true }).fill(viewer.email);
    await page.getByLabel('Password', { exact: true }).fill(viewer.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(heading(page)).toHaveText('Change your password');
    const own = `${viewer.password} and their own`;
    await page.getByLabel('Current password', { exact: true }).fill(viewer.password);
    await page.getByLabel('New password', { exact: true }).fill(own);
    await page.getByLabel('New password again', { exact: true }).fill(own);
    await page.getByRole('button', { name: 'Change the password' }).click();
    await expect(heading(page)).toHaveText('Your projects');
    return new OfficeDesk(context, page);
  }

  async close(): Promise<void> {
    await this.context.close();
  }

  // A screen of the firm's, or of a project by its name (its id read off the project picker's
  // address after it is picked).
  async at(path: string): Promise<void> {
    await this.page.goto(`${officeOrigin}${path}`);
  }

  async projectId(name: string): Promise<string> {
    await this.at('/');
    await this.page.getByRole('link', { name, exact: true }).click();
    await expect(this.page).toHaveURL(/\/projects\/[0-9a-f-]{36}/);
    return /\/projects\/([0-9a-f-]{36})/.exec(this.page.url())?.[1] ?? '';
  }

  // A dialog opened by a button of the page, filled, and saved; it closes once the API saved.
  private async saved(
    opener: string,
    title: string,
    fill: (form: Locator) => Promise<void>,
    save = 'Save',
  ): Promise<void> {
    await this.page.getByRole('button', { name: opener, exact: true }).click();
    const form = dialog(this.page, title);
    await fill(form);
    await form.getByRole('button', { name: save, exact: true }).click();
    // Closed once the API has saved it; what it refused stays said in it.
    await expect(form.getByRole('status').filter({ hasText: /./ })).toHaveCount(0);
    await expect(form).toBeHidden({ timeout: 20_000 });
  }

  // --- the firm's records ---------------------------------------------------------------------

  async client(name: string): Promise<void> {
    await this.at('/clients');
    await this.saved('Add a client', 'Add a client', (form) => type(form, 'Client', name));
  }

  async declarationEvent(name: string, reference: string, kind: string): Promise<void> {
    await this.at('/declaration-events');
    await this.saved('Add a declaration event', 'Add a declaration event', async (form) => {
      await type(form, 'Declaration event', name);
      await type(form, 'Reference', reference);
      await pick(form, 'Kind of reference', kind);
    });
  }

  async contractor(name: string): Promise<void> {
    await this.at('/contractors');
    await this.saved('Add a contractor', 'Add a contractor', async (form) => {
      await type(form, 'Contractor', name);
      await pick(form, 'Kind', 'Hauler');
    });
  }

  // A value added to one of the firm's lists, and what that list asks beside it.
  async listValue(list: string, value: string, under?: string): Promise<void> {
    await this.at('/lists');
    await pick(this.page, 'List', list);
    await this.saved('Add a value', 'Add a value', async (form) => {
      await type(form, 'Value', value);
      if (under !== undefined) await pick(form, 'Under the incident type', under);
    });
  }

  // A person's permissions ticked and saved on their page.
  async grant(person: string, permissionNames: readonly string[]): Promise<void> {
    await this.at('/people');
    await this.page.getByRole('link', { name: person, exact: true }).click();
    const box = this.page.getByRole('group', { name: 'Permissions' });
    for (const name of permissionNames) await tick(box, name);
    await this.page.getByRole('button', { name: 'Save the permissions' }).click();
    await expect(this.page.getByText('Saved.')).toBeVisible();
  }

  // A read-only client user of a project, given a password; what they sign in with.
  async clientUser(name: string, email: string, project: string, password: string): Promise<void> {
    await this.at('/people');
    await this.saved('Add a person', 'Add a person', async (form) => {
      await type(form, 'Name', name);
      await type(form, 'Email address', email);
      await pick(form, 'Role', 'Read-only viewer');
      await pick(form, 'Kind of viewer', 'A client user');
    });
    await this.page.getByRole('link', { name, exact: true }).click();
    const projects = this.page.getByRole('group', { name: 'Projects they see' });
    await tick(projects, project);
    await this.page.getByRole('button', { name: 'Save their projects' }).click();
    await this.saved('Set a password', 'Set a password', (form) =>
      form.getByLabel('Password', { exact: true }).fill(password),
    );
  }

  // --- a project and its setup ----------------------------------------------------------------

  async project(asked: {
    readonly name: string;
    readonly client: string;
    readonly event: string;
    readonly programType: string;
    readonly activeTo: string;
    readonly workflows: readonly string[];
    readonly kindsOfWork: readonly string[];
    readonly numbersFrom: Readonly<Record<string, string>>;
  }): Promise<string> {
    await this.at('/');
    await this.page.getByRole('button', { name: 'New project' }).click();
    const form = dialog(this.page, 'A new project');
    await type(form, 'Project name', asked.name);
    await pick(form, 'Client', asked.client);
    await pick(form, 'Declaration event', asked.event);
    await pick(form, 'Program type', asked.programType);
    await pick(form, 'Time zone', 'America/New_York');
    await form.getByLabel('Active from', { exact: true }).fill('2026-10-12');
    await form.getByLabel('Active to', { exact: true }).fill(asked.activeTo);
    const ticketTypes = form.getByRole('group', { name: 'Ticket types' });
    for (const each of ['Loads', 'Haul-outs', 'Unit rate work']) {
      await tick(ticketTypes, each, asked.workflows.includes(each));
    }
    const kinds = form.getByRole('group', { name: 'Kinds of unit rate work' });
    for (const each of asked.kindsOfWork) await tick(kinds, each);
    for (const [series, first] of Object.entries(asked.numbersFrom)) {
      await form.getByRole('textbox', { name: series, exact: true }).fill(first);
    }
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(heading(this.page)).toHaveText(`Project setup: ${asked.name}`);
    await expect(this.page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/setup$/);
    const id = /\/projects\/([0-9a-f-]{36})/.exec(this.page.url())?.[1];
    if (id === undefined) throw new Error(`No project id in ${this.page.url()}.`);
    return id;
  }

  async allowSplitLoads(projectId: string): Promise<void> {
    await this.at(`/projects/${projectId}/setup`);
    await this.saved('Change the settings', 'Change the settings', (form) =>
      tick(form, 'Allow split loads'),
    );
  }

  async primeAndContract(projectId: string, prime: string, contract: string): Promise<void> {
    await this.at(`/projects/${projectId}/setup`);
    await this.saved('Add a prime', 'Add a prime', (form) => pick(form, 'Prime', prime));
    await this.saved('Add a contract', 'Add a contract', async (form) => {
      await type(form, 'Contract', contract);
      await pick(form, 'Prime', prime);
    });
  }

  async fieldTags(projectId: string, tags: readonly string[]): Promise<void> {
    await this.at(`/projects/${projectId}/setup`);
    for (const tag of tags) {
      await this.saved('Add a field tag', 'Add a field tag', (form) =>
        type(form, 'Field tag', tag),
      );
    }
  }

  async site(
    projectId: string,
    asked: {
      readonly name: string;
      readonly shortCode?: string;
      readonly type: string;
      readonly facts: readonly string[];
      readonly permit: string;
      readonly latitude: string;
      readonly longitude: string;
    },
  ): Promise<void> {
    await this.at(`/projects/${projectId}/setup/sites`);
    await this.saved('Add a site', 'Add a site', async (form) => {
      await type(form, 'Site', asked.name);
      if (asked.shortCode !== undefined) await type(form, 'Short code', asked.shortCode);
      await pick(form, 'Site type', asked.type);
      for (const fact of asked.facts) await tick(form, fact);
      await type(form, 'Permit number', asked.permit);
      await type(form, 'Latitude', asked.latitude);
      await type(form, 'Longitude', asked.longitude);
      await form.getByLabel('Activation date', { exact: true }).fill('2026-10-12');
    });
  }

  async tippingFee(projectId: string, site: string, payItem: string): Promise<void> {
    await this.at(`/projects/${projectId}/setup/sites`);
    const title = `Link a tipping fee pay item: ${site}`;
    await this.saved(title, title, (form) => pick(form, 'Code', payItem));
  }

  async form(
    projectId: string,
    documentType: string,
    name: string,
    offers: readonly string[] = [],
  ): Promise<void> {
    await this.at(`/projects/${projectId}/setup/forms`);
    await this.saved('Add a form', 'Add a form', async (form) => {
      await pick(form, 'Kind of document', documentType);
      await type(form, 'Form', name);
      const asks = form.getByRole('group', { name: 'The incident asks for' });
      for (const offer of offers) await tick(asks, offer);
    });
  }

  // A debris type put on a form: one of the firm's library, or a new one (reduced, by a method).
  async debrisType(
    projectId: string,
    formName: string,
    debrisType: { readonly library?: string; readonly added?: string; readonly reducedBy?: string },
  ): Promise<void> {
    await this.at(`/projects/${projectId}/setup/forms`);
    const title = `Add a debris type: ${formName}`;
    await this.saved(title, 'Add a debris type', async (form) => {
      if (debrisType.library !== undefined) await pick(form, 'Debris type', debrisType.library);
      if (debrisType.added !== undefined) {
        await type(form, 'A new debris type for the firm’s library', debrisType.added);
      }
      if (debrisType.reducedBy !== undefined) {
        await tick(form, 'Reduced');
        await pick(form, 'Reduction method', debrisType.reducedBy);
      }
    });
  }

  async payItem(
    projectId: string,
    asked: {
      readonly code: string;
      readonly description: string;
      readonly payableType: string;
      readonly unit: string;
      readonly kindOfWork?: string;
      readonly band?: readonly [string, string];
      readonly flags?: readonly string[];
      readonly crewTimePaid?: string;
      readonly rates: Readonly<Record<string, string>>;
    },
  ): Promise<void> {
    await this.at(`/projects/${projectId}/setup/pay-items`);
    await this.saved('Add a pay item', 'Add a pay item', async (form) => {
      await type(form, 'Code', asked.code);
      await type(form, 'Description', asked.description);
      await pick(form, 'Payable type', asked.payableType);
      if (asked.kindOfWork !== undefined) {
        await pick(form, 'Kind of unit rate work', asked.kindOfWork);
      }
      await pick(form, 'Unit', asked.unit);
      if (asked.band !== undefined) {
        await type(form, 'Size from (inches)', asked.band[0]);
        await type(form, 'Size to (inches)', asked.band[1]);
      }
      for (const flag of asked.flags ?? []) await tick(form, flag);
      if (asked.crewTimePaid !== undefined) {
        await pick(form, 'Crew time paid', asked.crewTimePaid);
      }
      for (const [prime, rate] of Object.entries(asked.rates)) {
        await type(form, `Rate for ${prime} ($)`, rate);
      }
    });
  }

  // A rule made in the rule builder: its form and contract, its "ifs" and what it adds.
  async rule(
    projectId: string,
    asked: {
      readonly name: string;
      readonly form: string;
      readonly contract: string;
      readonly ifs: readonly If[];
      readonly then: Then;
    },
  ): Promise<void> {
    const page = this.page;
    await this.at(`/projects/${projectId}/setup/rules/new`);
    await expect(heading(page)).toHaveText('A new rule');
    await type(page, 'Rule', asked.name);
    await pick(page, 'Form', asked.form);
    await pick(page, 'Contract', asked.contract);
    for (const [place, condition] of asked.ifs.entries()) {
      await page.getByRole('button', { name: 'Add an “if”' }).click();
      const group = page.getByRole('group', { name: `If ${String(place + 1)}` });
      await pick(group, 'Criterion', condition.criterion);
      await pick(group, 'Test', condition.test);
      if (condition.value !== undefined) await pick(group, 'Value', condition.value);
      if (condition.item !== undefined) await pick(group, 'Items', condition.item);
      const values = group.getByRole('group', { name: 'Values' });
      for (const value of condition.values ?? []) await tick(values, value);
      if (condition.number !== undefined) await type(group, 'Number', condition.number);
      if (condition.to !== undefined) await type(group, 'And', condition.to);
    }
    await page.getByRole('button', { name: 'Add an action' }).click();
    const action = page.getByRole('group', { name: 'Then 1' });
    await action.getByLabel('Transaction #', { exact: true }).fill(String(asked.then.slot));
    await pick(action, 'Pay item', asked.then.payItem);
    if (asked.then.items !== undefined) {
      await pick(action, 'Quantity from', 'The items chosen');
      const items = action.getByRole('group', { name: 'Items' });
      for (const item of asked.then.items) await tick(items, item);
    }
    await page.getByRole('button', { name: 'Save the rule' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(heading(page)).toHaveText(asked.name);
  }

  // The project's map, loaded from a GeoJSON file of its zones, which bound it too.
  async map(projectId: string, file: { readonly name: string; readonly geojson: string }) {
    await this.at(`/projects/${projectId}/setup/map`);
    await this.page.getByRole('button', { name: 'Load a map file' }).click();
    const loading = dialog(this.page, 'Load a map file');
    await loading.getByLabel('A shapefile (.zip), GeoJSON or KML').setInputFiles({
      name: file.name,
      mimeType: 'application/geo+json',
      buffer: Buffer.from(file.geojson),
    });
    await expect(loading.getByRole('table', { name: 'What the file holds' })).toBeVisible();
    await pick(loading, 'Boundary layer', 'Layer (3 Features)');
    await pick(loading, 'Zones layer', 'Layer (3 Features)');
    await pick(loading, 'Field that names each zone', 'ZONE_NAME');
    await loading.getByRole('button', { name: 'Load this map' }).click();
    await expect(this.page.getByRole('table', { name: 'Versions' })).toContainText(
      'Zone 1, Zone 2, Zone 3',
    );
  }
}
