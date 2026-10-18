// The look and the components, on the prototype's screens (BACKLOG 3.1.4; ADR-567, 568): every
// component is on a screen these tests reach, so the accessibility check runs on each (AC-11-51),
// in the light theme and the dark, under the app's own page policy, with nothing refused or warned
// of in the console. The prototype is built into dist/prototype (`pnpm e2e` builds it) and served
// from this machine's loopback: the stack serves the app alone.
import type { Page } from '@playwright/test';

import { prototypePolicy } from '../page.ts';
import { checkScreen, expect, test } from './accessible.ts';
import { servedFolder } from './stack.ts';

let prototype: { origin: string; close: () => Promise<void> };

test.beforeAll(async () => {
  prototype = await servedFolder(new URL('../dist/prototype', import.meta.url).pathname, {
    'content-security-policy': prototypePolicy,
    'x-content-type-options': 'nosniff',
  });
});

test.afterAll(async () => {
  await prototype.close();
});

// The prototype opened, and everything the console was told of it.
async function opened(page: Page): Promise<string[]> {
  const complaints: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') complaints.push(message.text());
  });
  page.on('pageerror', (error) => complaints.push(error.message));
  await page.goto(`${prototype.origin}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today’s work');
  return complaints;
}

const press = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' }).click();
const pick = (page: Page, name: string | RegExp) =>
  page.getByRole('option', { name, exact: typeof name === 'string' }).click();
const choose = (page: Page, words: string) => page.getByText(words, { exact: true }).click();
async function typed(page: Page, digits: string): Promise<void> {
  for (const digit of digits) await press(page, digit);
}

// The question the screen asks now.
const asks = (page: Page, question: string) =>
  expect(page.getByRole('heading', { level: 1 })).toHaveText(question);

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`in the ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test(`AC-11-51, AC-11-52, AC-11-55: home and a collection, each step checked (${colorScheme})`, async ({
      page,
    }) => {
      const complaints = await opened(page);
      await expect(page.getByText('Today: 0 tickets made on this phone')).toBeVisible();
      await checkScreen(page);
      await press(page, 'New collection');
      await asks(page, 'Scan the truck’s badge');
      await page.getByRole('textbox', { name: 'Badge number', exact: true }).fill('730499');
      await expect(page.getByRole('status')).toContainText('isn’t in this phone’s lists');
      await checkScreen(page);
      await press(page, 'Scan');
      await expect(page.getByText('730415 · Hydraulic Dump Trailer · 65 CY')).toBeVisible();
      await press(page, 'Start the load');
      await asks(page, 'The truck is loading');
      await checkScreen(page);
      await press(page, 'Complete the load');
      await asks(page, 'What debris is it?');
      await checkScreen(page);
      await pick(page, 'Vegetative');
      await asks(page, 'A field tag? (optional)');
      await pick(page, 'Mixed');
      await asks(page, 'Where was it collected?');
      await press(page, 'Capture GPS');
      await press(page, 'Look up the address');
      await expect(page.getByText('Address: 14 Heron St')).toBeVisible();
      await checkScreen(page);
      await press(page, 'Next');
      await asks(page, 'Photos');
      await press(page, 'Take a photo');
      await press(page, 'Take a photo');
      await expect(page.getByText('2 photos of at most 8')).toBeVisible();
      await checkScreen(page);
      await press(page, 'Next');
      await asks(page, 'Check the ticket');
      await checkScreen(page);
      await press(page, 'It’s right: on to the number');
      await asks(page, 'The ticket’s number');
      await expect(page.getByText('101001', { exact: true })).toBeVisible();
      await press(page, 'Next');
      await asks(page, 'Type the ticket number again');
      // A mistyped number is caught before the ticket is submitted, and nothing is lost.
      await typed(page, '101010');
      await press(page, 'Submit');
      await expect(page.getByRole('status').first()).toHaveText(
        'That isn’t this ticket’s number. Check it and type it again.',
      );
      await checkScreen(page);
      await typed(page, '101001');
      await press(page, 'Submit');
      await asks(page, 'Ticket submitted');
      await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
      await press(page, 'Print the receipts');
      await checkScreen(page);
      await press(page, 'Home');
      await expect(page.getByText('Today: 1 ticket made on this phone')).toBeVisible();
      expect(complaints).toEqual([]);
    });

    test(`AC-11-51, AC-11-55: the tower, an extreme load call, a typed number and the open designs switched (${colorScheme})`, async ({
      page,
    }) => {
      const complaints = await opened(page);
      await choose(page, 'Yes: ask after each pick');
      await choose(page, 'Always, after a scan too (as ADR-209 says today)');
      await choose(page, 'Build 1’s board: Time, Map, Work, Chats, Settings');
      await choose(page, 'Nothing on the phone');
      await press(page, /Kim Nguyen/);
      await expect(page.getByText('Today: 0 tickets made on this phone')).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'Menu' }).getByRole('button')).toHaveText([
        'Time',
        'Map',
        'Work',
        'Chats',
        'Settings',
      ]);
      await checkScreen(page);
      await page
        .getByRole('navigation', { name: 'Menu' })
        .getByRole('button', { name: 'Map' })
        .click();
      await asks(page, 'Map');
      await checkScreen(page);
      await press(page, 'Home');
      await press(page, 'New disposal');
      await press(page, 'Scan');
      await press(page, 'Next');
      await pick(page, 'C&D');
      await asks(page, 'Is that right?');
      await expect(page.getByText('You picked C&D.')).toBeVisible();
      await checkScreen(page);
      await press(page, 'Yes, that’s right');
      await asks(page, 'How full is the truck?');
      await typed(page, '96');
      await expect(page.getByRole('status').last()).toHaveText(
        '96% is at or over this project’s 95%, so it is flagged for review. Carry on if it’s right.',
      );
      await checkScreen(page);
      await press(page, 'Clear');
      await typed(page, '120');
      await expect(page.getByRole('status').last()).toHaveText('A load call is at most 100%.');
      await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
      await press(page, 'Delete the last digit');
      await expect(page.locator('output')).toHaveText('12%');
      await press(page, 'Clear');
      await typed(page, '0');
      await expect(
        page.getByText('0% bills nothing and is flagged for review.', { exact: false }),
      ).toBeVisible();
      await press(page, 'Next');
      await press(page, 'Yes, that’s right');
      await press(page, 'Next');
      await press(page, 'It’s right: on to the number');
      await asks(page, 'Scan the driver’s ticket');
      await page.getByRole('textbox', { name: 'Ticket number', exact: true }).fill('101060');
      await checkScreen(page);
      await press(page, 'Next');
      await asks(page, 'Why was the number typed?');
      await checkScreen(page);
      await pick(page, 'Barcode damaged');
      await press(page, 'Yes, that’s right');
      await asks(page, 'Type the ticket number again');
      await typed(page, '101060');
      await press(page, 'Submit');
      await asks(page, 'Ticket submitted');
      await checkScreen(page);
      expect(complaints).toEqual([]);
    });

    test(`AC-11-51, AC-11-55: a unit rate ticket for a leaner, the crew kept for the next (${colorScheme})`, async ({
      page,
    }) => {
      const complaints = await opened(page);
      await press(page, /Jo Kim/);
      await press(page, 'New unit rate ticket');
      await asks(page, 'Scan the crew’s badge');
      await press(page, 'Scan');
      await press(page, 'Next');
      await asks(page, 'A photo of the crew');
      await expect(
        page.getByText('Working crew: Coastline bucket truck crew (730417)'),
      ).toBeVisible();
      await checkScreen(page);
      await press(page, 'Take a photo');
      await press(page, 'Next');
      await asks(page, 'What work is it?');
      await pick(page, 'Stumps');
      await expect(page.getByRole('status')).toHaveText(
        'The prototype goes on with Hangers and Leaners only.',
      );
      await checkScreen(page);
      await pick(page, 'Leaners');
      await asks(page, 'Measured how, at chest height?');
      await checkScreen(page);
      await pick(page, 'Around the trunk (circumference)');
      await asks(page, 'How many inches?');
      await typed(page, '56');
      await press(page, /Decimal point/);
      await typed(page, '5');
      await expect(page.locator('output')).toHaveText('56.5in');
      await checkScreen(page);
      await press(page, 'Next');
      await asks(page, 'Photos');
      await expect(page.getByText('This work asks for photos.', { exact: false })).toBeVisible();
      await checkScreen(page);
      await press(page, 'Next');
      await expect(page.getByText('56.5 in around')).toBeVisible();
      await press(page, 'It’s right: on to the number');
      await press(page, 'Next');
      await typed(page, '301001');
      await press(page, 'Submit');
      await press(page, 'Next ticket');
      await asks(page, 'A photo of the crew');
      await expect(
        page.getByText('Working crew: Coastline bucket truck crew (730417)'),
      ).toBeVisible();
      expect(complaints).toEqual([]);
    });

    test(`AC-11-51, AC-11-55: sending the work, record by record, a duplicate not saved and said so (${colorScheme})`, async ({
      page,
    }) => {
      const complaints = await opened(page);
      await press(page, /Kim Nguyen/);
      await page
        .getByRole('navigation', { name: 'Menu' })
        .getByRole('button', { name: 'Sync' })
        .click();
      await asks(page, 'Send your work');
      await expect(page.getByText('2 field events wait on this phone.')).toBeVisible();
      await checkScreen(page);
      await press(page, 'Send now');
      await expect(page.getByText('Sending 1 of 2…')).toBeVisible();
      await expect(page.getByText('Everything is sent.')).toBeVisible();
      await expect(page.getByRole('listitem')).toHaveCount(2);
      await expect(page.getByRole('listitem').nth(0)).toContainText('Saved');
      await expect(page.getByRole('listitem').nth(1)).toContainText('Not saved');
      await expect(page.getByText('Nothing waiting to send')).toBeVisible();
      await press(page, /Refresh the lists/);
      await expect(page.getByText('The lists are up to date.')).toBeVisible();
      await checkScreen(page);
      expect(complaints).toEqual([]);
    });
  });
}

test('AC-11-56: every kind of screen holds 320 CSS pixels wide and text at 200% without scrolling sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const complaints = await opened(page);
  const sideways = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  const larger = () =>
    page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
  const seen: string[] = [];
  const each = async (what: string) => {
    expect(await sideways(), `${what} at 320 px`).toBe(false);
    await larger();
    expect(await sideways(), `${what} at 320 px and 200% text`).toBe(false);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    seen.push(what);
  };
  await each('home');
  await press(page, 'New collection');
  await press(page, 'Scan');
  await each('the badge');
  await press(page, 'Start the load');
  await press(page, 'Complete the load');
  await pick(page, 'Vegetative');
  await press(page, 'No field tag');
  await press(page, 'Capture GPS');
  await press(page, 'Look up the address');
  await each('where it was collected');
  await press(page, 'Next');
  await press(page, 'Take a photo');
  await each('the photos');
  await press(page, 'Next');
  await each('the review');
  await press(page, 'It’s right: on to the number');
  await press(page, 'Next');
  await each('the keypad');
  await press(page, /Kim Nguyen/);
  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('button', { name: 'Sync' })
    .click();
  await press(page, 'Send now');
  await expect(page.getByText('Everything is sent.')).toBeVisible();
  await each('sending the work');
  expect(seen).toHaveLength(7);
  await checkScreen(page);
  expect(complaints).toEqual([]);
});
