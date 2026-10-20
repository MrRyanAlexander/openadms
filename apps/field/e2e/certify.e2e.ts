// Certifying, through the field app's screens (BACKLOG 3.5.5; REQ-322; C118, C127, C129; ADR-015,
// 045, 076, 108, 179, 294, 320, 469, 477, 585), in the run's own world (e2e/world-setup.ts) against
// the real API: Jo Kim, whose unit rate assignment on P1 certifies too, on phones of her own.
//
// 730415's boxes measured again on the phone, as AC-11-42 has them: the capacity worked out by the
// domain's `Capacity` as they are entered and shown, 65 CY, never typed; a radius corner marked to
// add said in the domain's own words; Rivera offered as Coastline's tier 1 sub as it is typed; five
// views; Lee Morgan picked as the helper; the boxes sent at the next sync, never a capacity, and the
// certification then in the lists any phone reads. A crew on a pre-printed sheet's number the
// project already holds: left part way and finished from home, sent, refused by the server and
// shown in its words, kept. A certification cancelled keeps its number.
//
// The certifications made here are on P1, whose other tests scan 730415…730418 and treat 730499 as
// a badge the lists don't hold: these take the numbers of this phone's own block, after the yard
// phone's 730415…730514, and the refused one is never saved.
import type { BrowserContext, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast, worldOrigin } from './world.ts';

const said = english.certify;
const capture = english.capture;
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

// A photograph from the camera, as the browser hands the page one: a small PNG.
const photo = {
  name: 'view.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGPI7lOGIwbiOADSQxHBtdEJMAAAAABJRU5ErkJggg==',
    'base64',
  ),
};

const at = (asked: readonly Asked[], path: string) =>
  toApi(asked).filter((record) => record.path === path);
const syncs = (asked: readonly Asked[]) => at(asked, '/phones/current/syncs');

interface SentCertification {
  readonly id: string;
  readonly certNumber: string;
  readonly kind: string;
  readonly firstTierSub: string | null;
  readonly vehicleTypeOther: string | null;
  readonly crewTypeId: string | null;
  readonly helperIds: readonly string[];
  readonly boxes: readonly Record<string, unknown>[];
}
interface SyncBody {
  readonly records: readonly {
    readonly record: string;
    readonly certification?: SentCertification;
  }[];
  readonly photos?: readonly { readonly owner: { readonly id: string }; readonly view: string }[];
}
interface SyncAnswer {
  readonly records?: readonly { readonly answer: string; readonly message?: string }[];
}

// The certifications the syncs since a moment sent, the views of the photographs, and the answers.
function sentSince(asked: readonly Asked[], from: number) {
  const runs = syncs(asked).slice(from);
  return {
    certifications: runs.flatMap(({ body }) =>
      (body as SyncBody).records.flatMap(({ certification }) =>
        certification === undefined ? [] : [certification],
      ),
    ),
    photos: runs.flatMap(({ body }) => (body as SyncBody).photos ?? []),
    answers: runs.flatMap(({ answer }) => (answer as SyncAnswer | undefined)?.records ?? []),
  };
}

// The lists the phone was last sent.
function listsHeld(asked: readonly Asked[]) {
  const read = at(asked, '/phones/current/lists').at(-1);
  return (
    read?.answer as {
      lists: {
        certifications: { certNumber: string; capacityCy: number | null; kind: string }[];
        helpers: { id: string; name: string }[];
        crewTypes: { id: string; name: string }[];
      };
    }
  ).lists;
}

// The first number of the phone's first block of cert numbers, as the sync that asked for it was
// answered.
function firstCertNumber(asked: readonly Asked[]): number | undefined {
  for (const { body, answer } of syncs(asked)) {
    const asking = (body as { lastUsed: { series: string }[] }).lastUsed;
    const at = asking.findIndex(({ series }) => series === 'CERTIFICATION');
    const numbers = (answer as { numbers?: { blocks: { firstNumber: number }[] }[] } | undefined)
      ?.numbers;
    const first = at === -1 ? undefined : numbers?.[at]?.blocks[0]?.firstNumber;
    if (first !== undefined) return first;
  }
  return undefined;
}

// Jo signed in on a phone just enrolled, her lists read and her first block of cert numbers held.
async function joOn(page: Page, asked: readonly Asked[], name: string): Promise<void> {
  const { jo } = worldCast();
  await enrolled(page, name);
  await page.getByLabel(english.phone.monitorNumber).fill(jo.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(jo.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(heading(page)).toHaveText(english.home.title);
  // Her lists name certifying: the same run asked for the phone's first block of cert numbers.
  await expect.poll(() => firstCertNumber(asked)).toBeDefined();
}

// The phone's place, as the browser gives it: allowed for the app's own page, at Marsh Road TDSR,
// where the golden mission certifies.
async function placed(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['geolocation'], { origin: worldOrigin() });
  await context.setGeolocation({ latitude: 39.0903, longitude: -75.6202 });
}

// Digits typed on the keypad.
async function keyed(page: Page, typed: string): Promise<void> {
  for (const key of typed) await page.getByRole('button', { name: key, exact: true }).click();
}

const next = (page: Page) => page.getByRole('button', { name: capture.next });
const option = (page: Page, name: string) => page.getByRole('option', { name, exact: true });

// New: the phone's next cert number, shown, typed again; the certification opens.
async function begunFromBlock(page: Page): Promise<string> {
  await page.getByRole('button', { name: english.home.start.certification }).click();
  await expect(heading(page)).toHaveText(said.number.againTitle);
  const number = (await page.locator('.big-number').textContent()) ?? '';
  expect(number).toMatch(/^\d{6}$/);
  await keyed(page, number);
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(heading(page)).toHaveText(said.kindTitle);
  return number;
}

test('AC-11-42, AC-03-14, AC-03-36, AC-03-09, AC-11-82, REQ-322, C118, C129: Jo measures 730415’s boxes: the phone works out 65 CY with the domain’s Capacity and shows it, never typed; Rivera is offered as Coastline’s sub as it is typed; Lee is picked as the helper; the five views; the sync sends the boxes, never a capacity, and the lists then hold the certification at 65 CY', async ({
  page,
  context,
}) => {
  await placed(context);
  const asked = recorded(page);
  await joOn(page, asked, 'P1-UR-CERT');
  await expect(page.locator('.screen-actions').getByRole('button')).toHaveText([
    english.home.start.unitRate,
    english.home.start.certification,
  ]);
  // After the yard phone's block, which holds the world's four.
  const first = firstCertNumber(asked);
  expect(first).toBeGreaterThan(730514);

  // New: the phone's next number, shown; typed again wrong it opens nothing.
  await page.getByRole('button', { name: english.home.start.certification }).click();
  await expect(heading(page)).toHaveText(said.number.againTitle);
  const number = String(first);
  await expect(page.locator('.big-number')).toHaveText(number);
  await expect(page.getByText(said.number.noteIt)).toBeVisible();
  await keyed(page, '7');
  await page.getByRole('button', { name: said.number.open }).click();
  await expect(page.getByText(said.number.wrong)).toBeVisible();
  await checkScreen(page);
  await keyed(page, number);
  await page.getByRole('button', { name: said.number.open }).click();

  // A container, Coastline's.
  await expect(heading(page)).toHaveText(said.kindTitle);
  await expect(next(page)).toBeDisabled();
  await option(page, said.kinds.CONTAINER).click();
  await checkScreen(page);
  await next(page).click();
  await expect(heading(page)).toHaveText(said.primeTitle);
  await option(page, 'Coastline Haulers LLC').click();
  await next(page).click();

  // A sub: Rivera offered as it is typed (AC-03-14); a tier 2 with no tier 1 held in the domain's
  // words, never sent.
  await expect(heading(page)).toHaveText(said.subsTitle);
  await page.getByRole('textbox', { name: said.secondTier, exact: true }).fill('Tidewater Hauling');
  await expect(page.getByText(/is typed into tier 2 with no tier 1 sub/)).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await page.getByRole('textbox', { name: said.secondTier, exact: true }).fill('');
  await page.getByRole('textbox', { name: said.firstTier, exact: true }).fill('riv');
  await option(page, 'Rivera Trucking').click();
  await expect(page.getByRole('textbox', { name: said.firstTier, exact: true })).toHaveValue(
    'Rivera Trucking',
  );
  await checkScreen(page);
  await next(page).click();

  // The driver and the tag, as 730416's sheet has them (spec/CONVENTIONS.md §6); a day that
  // isn't one said, Next held.
  await expect(heading(page)).toHaveText(said.driverTitle);
  await page.getByLabel(said.driverName).fill('Marco Rivera');
  await page.getByLabel(said.licenceNumber).fill('R160-542-80-112-0');
  await page.getByLabel(said.licenceState).fill('FL');
  await page.getByLabel(said.licenceExpiry).fill('2028-3-31');
  await expect(page.getByText(filled(said.notADay, { label: said.licenceExpiry }))).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await page.getByLabel(said.licenceExpiry).fill('2028-03-31');
  await next(page).click();
  await expect(heading(page)).toHaveText(said.tagTitle);
  await page.getByLabel(said.tagNumber).fill('RVT 4821');
  await page.getByLabel(said.tagState).fill('FL');
  await page.getByLabel(said.tagExpiry).fill('2027-03-31');
  await next(page).click();
  await expect(heading(page)).toHaveText(said.typeTitle);
  await option(page, 'Hydraulic Dump Trailer').click();
  await next(page).click();

  // The primary box in whole inches: what isn't one is said.
  await expect(heading(page)).toHaveText(said.primaryTitle);
  await page.getByLabel(said.measurements.length).fill('360');
  await page.getByLabel(said.measurements.width).fill('96');
  await page.getByLabel(said.measurements.height).fill('7.2');
  await expect(
    page.getByText(filled(said.notWhole, { label: said.measurements.height })),
  ).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await page.getByLabel(said.measurements.height).fill('72');
  await checkScreen(page);
  await next(page).click();

  // The primary alone works out to 53 CY; the sideboards added, 65.
  await expect(heading(page)).toHaveText(said.boxesTitle);
  await expect(page.getByText(filled(said.cy, { capacity: '53' }))).toBeVisible();
  await page.getByRole('button', { name: said.addBox }).click();
  await expect(heading(page)).toHaveText(filled(said.boxTitle, { number: '1' }));
  await expect(page.getByRole('button', { name: said.boxDone })).toBeDisabled();
  await option(page, 'Sideboards').click();
  await page.getByLabel(said.measurements.length).fill('360');
  await page.getByLabel(said.measurements.width).fill('96');
  await page.getByLabel(said.measurements.height).fill('16');
  await expect(page.getByText(filled(said.boxVolume, { volume: '552960.00' }))).toBeVisible();
  await expect(page.getByText(filled(said.cy, { capacity: '65' }))).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.boxDone }).click();

  // A radius corner marked to add: no capacity, in the domain's own words; taken off again.
  await page.getByRole('button', { name: said.addBox }).click();
  await option(page, said.other).click();
  await page.getByLabel(said.featureOther).fill('Liner');
  await option(page, said.shapes.RADIUS_CORNER).click();
  await expect(page.getByLabel(said.measurements.length)).toHaveCount(0);
  await page.getByLabel(said.measurements.radius).fill('6');
  await page.getByLabel(said.measurements.run).fill('576');
  await page.getByLabel(said.measurements.corners).fill('2');
  await expect(
    page.getByText('Box 2 (radius corner): a radius corner is always subtracted.'),
  ).toBeVisible();
  await page.getByRole('button', { name: said.boxRemove }).click();
  await expect(heading(page)).toHaveText(said.boxesTitle);
  await expect(page.getByText(filled(said.cy, { capacity: '65' }))).toBeVisible();
  await expect(page.getByText(filled(said.worked, { cubicYards: '65.19' }))).toBeVisible();
  await checkScreen(page);
  await next(page).click();

  // Five views, one each; one opened full size; the front taken again in its place.
  await expect(heading(page)).toHaveText(said.photosTitle);
  for (const view of Object.values(said.views)) {
    await page
      .locator('section', { has: page.getByRole('heading', { name: view, exact: true }) })
      .locator('input[type=file]')
      .setInputFiles(photo);
    await expect(page.getByRole('button', { name: filled(said.retake, { view }) })).toBeVisible();
  }
  await expect(page.getByRole('img')).toHaveCount(5);
  await page
    .locator('section', { has: page.getByRole('heading', { name: said.views.FRONT }) })
    .locator('input[type=file]')
    .setInputFiles(photo);
  await expect(page.getByRole('img')).toHaveCount(5);
  await checkScreen(page);
  await page.getByRole('button', { name: filled(said.open, { view: said.views.LEFT }) }).click();
  await expect(heading(page)).toHaveText(new RegExp(`^${said.views.LEFT}, taken `));
  await checkScreen(page);
  await page.getByRole('button', { name: said.photoBack }).click();
  // Back where it was left.
  await expect(heading(page)).toHaveText(said.photosTitle);
  await next(page).click();

  // Lee picked as the helper, from those assigned to P1 with Jo today (AC-03-36).
  await expect(heading(page)).toHaveText(said.whoTitle);
  const helpers = listsHeld(asked).helpers;
  expect(helpers.map(({ name }) => name)).toEqual(
    expect.arrayContaining(['Ana Brooks', 'Kim Nguyen', 'Lee Morgan']),
  );
  await option(page, 'Lee Morgan').click();
  await page.getByLabel(said.contractorRep).fill('Marco Rivera');
  await checkScreen(page);
  await next(page).click();
  await expect(heading(page)).toHaveText(said.notesTitle);
  await next(page).click();

  // The review, every value once, the capacity among them; submitted, sealed.
  await expect(heading(page)).toHaveText(said.review.title);
  for (const value of [
    number,
    said.kinds.CONTAINER,
    'Coastline Haulers LLC',
    'Rivera Trucking',
    'Hydraulic Dump Trailer',
    filled(said.cy, { capacity: '65' }),
    'Lee Morgan',
    'RVT 4821 · FL · 2027-03-31',
  ]) {
    await expect(page.locator('.facts').getByText(value, { exact: true })).toBeVisible();
  }
  await checkScreen(page);
  await page.getByRole('button', { name: said.review.submit }).click();
  await expect(heading(page)).toHaveText(filled(said.submitted.title, { number }));
  await expect(page.getByText(filled(said.submitted.placard, { number }))).toBeVisible();
  await expect(page.getByText(filled(said.cy, { capacity: '65' }))).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.submitted.home }).click();
  await expect(heading(page)).toHaveText(english.home.title);

  // Synced: the boxes, never a capacity, each with the measurements its shape holds and null for
  // the rest (C129); its five views after it; saved. The lists read with it hold it at 65 CY,
  // worked out by the server by the same rule: any phone with a connection has it (AC-03-09).
  const before = syncs(asked).length;
  const listsBefore = at(asked, '/phones/current/lists').length;
  await page.getByRole('button', { name: english.menu.sync }).click();
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect.poll(() => syncs(asked).slice(before).at(-1)?.answer).toBeDefined();
  await expect
    .poll(() => at(asked, '/phones/current/lists').slice(listsBefore).at(-1)?.answer)
    .toBeDefined();
  const sent = sentSince(asked, before);
  const [made] = sent.certifications;
  expect(made).toMatchObject({
    certNumber: number,
    kind: 'CONTAINER',
    firstTierSub: 'Rivera Trucking',
    helperIds: [helpers.find(({ name }) => name === 'Lee Morgan')?.id],
  });
  expect(made?.boxes).toEqual([
    expect.objectContaining({ shape: 'RECTANGLE', sign: 'ADD', featureId: null, length: 360 }),
    expect.objectContaining({ shape: 'RECTANGLE', sign: 'ADD', height: 16, diameter: null }),
  ]);
  expect(JSON.stringify(made)).not.toMatch(/capacity/i);
  expect(sent.photos.map(({ view }) => view).sort()).toEqual([
    'FRONT',
    'INTERIOR_OR_BACK',
    'LEFT',
    'OPERATOR_WITH_PLACARD',
    'RIGHT',
  ]);
  expect(sent.answers.map(({ answer }) => answer)).toEqual(['SAVED']);
  expect(listsHeld(asked).certifications).toContainEqual(
    expect.objectContaining({ certNumber: number, kind: 'CONTAINER', capacityCy: 65 }),
  );
  await expect(page.getByText(english.sync.nothingWaits)).toBeVisible();
});

test('AC-11-42, REQ-322, AC-11-75: a crew on a pre-printed sheet’s number the project already holds is said and still taken, left part way and finished from home, never measured; at the sync the server refuses it and the phone shows its words and keeps it; a certification cancelled keeps its number', async ({
  page,
  context,
}) => {
  await placed(context);
  const asked = recorded(page);
  await joOn(page, asked, 'P1-UR-CERT-2');

  // Cancelled: kept on the phone, never sent; the next New makes the number after it.
  const cancelled = await begunFromBlock(page);
  await page.getByRole('button', { name: said.cancel }).click();
  await expect(heading(page)).toHaveText(filled(said.cancelTitle, { number: cancelled }));
  await checkScreen(page);
  await page.getByRole('button', { name: said.cancelYes }).click();
  await expect(heading(page)).toHaveText(english.home.title);
  await page.getByRole('button', { name: english.home.start.certification }).click();
  await expect(page.locator('.big-number')).toHaveText(String(Number(cancelled) + 1));

  // The sheet's own number, typed twice: one the lists hold is said, never refused.
  await page.getByRole('button', { name: said.number.sheet }).click();
  await expect(heading(page)).toHaveText(said.number.sheetTitle);
  await page.getByLabel(said.number.sheetLabel).fill('730416');
  await page.getByLabel(said.number.sheetAgain).fill('730416');
  await expect(page.getByText(filled(said.number.held, { number: '730416' }))).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.number.open }).click();

  // A crew: its vehicle type typed, its crew type picked, no box asked.
  await option(page, said.kinds.CREW).click();
  await next(page).click();
  await expect(heading(page)).toHaveText(said.primeTitle);
  await option(page, 'Coastline Haulers LLC').click();
  for (const title of [said.subsTitle, said.driverTitle, said.tagTitle, said.typeTitle]) {
    await next(page).click();
    await expect(heading(page)).toHaveText(title);
  }
  await option(page, said.other).click();
  await expect(next(page)).toBeDisabled();
  await page.getByLabel(said.typeOther).fill('Bucket');
  await next(page).click();
  await expect(heading(page)).toHaveText(said.crewTypeTitle);
  await option(page, 'Bucket Truck').click();
  await next(page).click();
  await expect(heading(page)).toHaveText(said.photosTitle);

  // Left for now: on home's open list by its number, and opened where it was left.
  await page.getByRole('button', { name: capture.leave }).click();
  await expect(heading(page)).toHaveText(english.home.title);
  await page
    .getByRole('button', {
      name: new RegExp(`^${filled(english.home.open.certification, { number: '730416' })}`),
    })
    .click();
  await expect(heading(page)).toHaveText(said.photosTitle);
  for (const title of [said.whoTitle, said.notesTitle, said.review.title]) {
    await next(page).click();
    await expect(heading(page)).toHaveText(title);
  }
  for (const value of [said.kinds.CREW, 'Bucket', 'Bucket Truck']) {
    await expect(page.locator('.facts').getByText(value, { exact: true })).toBeVisible();
  }
  await expect(page.locator('.facts').getByText(said.review.capacity)).toHaveCount(0);
  await page.getByRole('button', { name: said.review.submit }).click();
  await expect(heading(page)).toHaveText(filled(said.submitted.title, { number: '730416' }));
  await page.getByRole('button', { name: said.submitted.home }).click();

  // At the sync: no box, its crew type; refused by the server for the number it holds, shown in
  // its words on Sync, and kept.
  const before = syncs(asked).length;
  await page.getByRole('button', { name: english.menu.sync }).click();
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: english.sync.notSaved.title }),
  ).toBeVisible();
  const sent = sentSince(asked, before);
  expect(sent.certifications).toEqual([
    expect.objectContaining({
      certNumber: '730416',
      kind: 'CREW',
      vehicleTypeOther: 'Bucket',
      crewTypeId: listsHeld(asked).crewTypes.find(({ name }) => name === 'Bucket Truck')?.id,
      boxes: [],
    }),
  ]);
  const [answer] = sent.answers;
  expect(answer?.answer).toBe('NOT_SAVED');
  await expect(
    page.getByText(filled(english.sync.what.CERTIFICATION, { number: '730416' }), { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(answer?.message ?? 'no words')).toBeVisible();
  await expect(page.getByText(english.sync.nothingWaits)).toBeHidden();
  await checkScreen(page);
});
