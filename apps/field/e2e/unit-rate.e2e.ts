// Unit rate work, through the field app's screens (BACKLOG 3.5.3; ADR-111, 207, 213, 571, 573,
// 583, 589…593), in the run's own world (e2e/world-setup.ts) against the real API: Jo Kim on P1's
// unit rate work, every one of its unit rate pay items hers, with its two crews certified, the
// bucket truck crew 730417 and the skid steer crew 730418 (the golden mission's 301001…301007, here
// each phone's own block). **The crew is the first step** (the user, ADR-592): the working crew
// kept, or a new crew's badge and its photo; the ticket opens at once under the phone's next
// number, never typed again (ADR-589), and goes straight on to the work, never to a load's open
// ticket; the work is picked by name, never a field tag (ADR-591); **hangers, leaners and stumps
// open the ticket's dashboard**, pre-work, measurement and post-work, each dropping back to it
// once done (ADR-590, 592); its kind of work's screen asks what it records, and the phone works
// its pay item out from the bands, never showing it or a rate; where the work was done looked up
// on the stack's own map (ADR-593); it goes at the next sync as the contract carries it, each
// stage's photograph saying its stage.
import type { BrowserContext, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, photographed, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast, worldOrigin, type CastMonitor } from './world.ts';

const said = english.capture;
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

const at = (asked: readonly Asked[], path: string) =>
  toApi(asked).filter((record) => record.path === path);
const syncs = (asked: readonly Asked[]) => at(asked, '/phones/current/syncs');

interface SentEvent {
  readonly id: string;
  readonly kind: string;
  readonly ticketNumber: string;
  readonly certNumber: string;
  readonly payableTypeId: string | null;
  readonly kindOfWorkId: string | null;
  readonly payItemId: string | null;
  readonly unitCount: number | null;
  readonly measurementInches: number | null;
  readonly measuredAs: string | null;
  readonly rootBallInches: number | null;
  readonly rootBallHalfExposed: boolean | null;
  readonly surveyNumber: string | null;
  readonly markedIneligible: boolean | null;
  readonly fieldTagId: string | null;
  readonly items: readonly { readonly itemNameId: string; readonly quantity: number }[];
  readonly endLatitude: string | null;
}
interface HeldLists {
  readonly payItems: readonly { readonly id: string; readonly code: string }[];
  readonly itemNames: readonly { readonly id: string; readonly name: string }[];
}

// The field events the syncs since a moment sent, their photographs, and what each was answered.
function sentSince(asked: readonly Asked[], from: number) {
  const runs = syncs(asked).slice(from);
  return {
    events: runs.flatMap(({ body }) =>
      (body as { records: { record: string; fieldEvent?: SentEvent }[] }).records.flatMap(
        (record) => (record.fieldEvent === undefined ? [] : [record.fieldEvent]),
      ),
    ),
    photos: runs.flatMap(
      ({ body }) => (body as { photos: { owner: { id: string }; stage: string | null }[] }).photos,
    ),
    answers: runs.flatMap(
      ({ answer }) =>
        (answer as { records?: { answer: string }[] } | undefined)?.records?.map(
          ({ answer: one }) => one,
        ) ?? [],
    ),
  };
}

// The lists the phone was last sent: the codes of its pay items and the names of its items, by
// id, for the test to read what went (the screens show neither code).
function listsHeld(asked: readonly Asked[]): HeldLists {
  const read = at(asked, '/phones/current/lists').at(-1);
  return (read?.answer as { lists: HeldLists }).lists;
}
const codeOf = (lists: HeldLists, id: string | null) =>
  lists.payItems.find((one) => one.id === id)?.code ?? null;
const itemOf = (lists: HeldLists, id: string) =>
  lists.itemNames.find((one) => one.id === id)?.name ?? id;

async function signedIn(page: Page, monitor: CastMonitor) {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(heading(page)).toHaveText(english.home.title);
}

// The phone's place, as the browser gives it: allowed for the app's own page, at a street in
// Bayline County.
async function placed(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['geolocation'], { origin: worldOrigin() });
  await context.setGeolocation({ latitude: 39.1385, longitude: -75.5537 });
}

// Digits and a decimal point typed on the keypad.
async function keyed(page: Page, typed: string): Promise<void> {
  for (const key of typed) {
    // The point is named by its words beside it, the digits by themselves.
    await (
      key === '.'
        ? page.getByRole('button', { name: english.look.keypad.point })
        : page.getByRole('button', { name: key, exact: true })
    ).click();
  }
}

// Sync now, from the Sync screen, and back to Work once its run has gone.
async function syncedNow(page: Page, asked: readonly Asked[]): Promise<number> {
  const before = syncs(asked).length;
  await page.getByRole('button', { name: english.menu.sync }).click();
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect.poll(() => syncs(asked).slice(before).at(-1)?.answer).toBeDefined();
  await expect(page.getByText(english.sync.nothingWaits)).toBeVisible();
  await page.getByRole('button', { name: english.menu.work }).click();
  return before;
}

// A heading that is one of several words.
const oneOf = (...said: readonly string[]) =>
  new RegExp(`^(${said.map((one) => one.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`);

// The number a unit rate ticket opened under, as its crew's line on its screen says it.
async function openedFor(page: Page, crew: string): Promise<string> {
  const line = page.getByText(
    new RegExp(
      `^${english.home.open.crew.replace('{truck}', crew).replace('{number}', String.raw`\d{6}`)}$`,
    ),
  );
  await expect(line).toBeVisible();
  return /\d{6}$/.exec((await line.textContent()) ?? '')?.[0] ?? '';
}

// New: the crew, the first step (ADR-592): the working crew kept ("Same crew"), straight on to the
// work, or a new crew's badge scanned and its photo's step passed. The ticket opens at once under
// the phone's next number, never typed again (ADR-589). The number it opened under.
async function begun(page: Page, crew: { readonly same: string } | { readonly scan: string }) {
  await page.getByRole('button', { name: english.home.start.unitRate }).click();
  if ('same' in crew) {
    await expect(heading(page)).toHaveText(said.crew.title);
    await page.getByRole('button', { name: filled(said.crew.same, { number: crew.same }) }).click();
    await expect(heading(page)).toHaveText(said.work.title);
    return openedFor(page, crew.same);
  }
  await expect(heading(page)).toHaveText(oneOf(said.crew.title, said.badge.crewTitle));
  if ((await heading(page).textContent()) === said.crew.title) {
    await page.getByRole('button', { name: said.crew.change }).click();
  }
  await expect(heading(page)).toHaveText(said.badge.crewTitle);
  await page.getByLabel(said.badge.label).fill(crew.scan);
  await page.getByRole('button', { name: said.badge.crewStart }).click();
  await expect(heading(page)).toHaveText(said.crew.photoTitle);
  const number = await openedFor(page, crew.scan);
  await page.getByRole('button', { name: said.next }).click();
  await expect(heading(page)).toHaveText(said.work.title);
  return number;
}

// The work picked by name: no field tag is asked (ADR-591).
async function workPicked(page: Page, work: string) {
  await expect(heading(page)).toHaveText(said.work.title);
  await page.getByRole('option', { name: work, exact: true }).click();
}

// The ticket's dashboard, for work photographed by stage (ADR-590, 592): its heading the work and
// the number.
async function onDashboard(page: Page, work: string, number: string) {
  await expect(heading(page)).toHaveText(filled(said.open.title, { kind: work, number }));
}

// From the dashboard, a stage's photograph taken straight from the camera, and back on it.
async function staged(page: Page, stage: 'PRE_WORK' | 'POST_WORK') {
  await photographed(page, page.getByRole('button', { name: said.stages.take[stage] }));
  await expect(page.getByRole('button', { name: said.stages.again[stage] })).toBeVisible();
}

// From the dashboard, the measurement: its photograph (taken, or passed with Next: never held),
// then a tree measured around or across, the inches on the keypad, and back on the dashboard.
async function measured(page: Page, way: string, inches: string, photo = true) {
  await page.getByRole('button', { name: said.stages.measure }).click();
  await expect(heading(page)).toHaveText(said.stages.measurePhotoTitle);
  if (photo) {
    await photographed(page, page.getByRole('button', { name: said.stages.take.MEASUREMENT }));
  } else await page.getByRole('button', { name: said.next }).click();
  await expect(heading(page)).toHaveText(said.measure.howTitle);
  await page.getByRole('option', { name: way, exact: true }).click();
  await expect(heading(page)).toHaveText(said.measure.inchesTitle);
  await keyed(page, inches);
  await page.getByRole('button', { name: said.next }).click();
}

// Where the work was done (the phone's fix, and the address looked up where there is signal: the
// stack's own map, ADR-593), photos (none more; work by stage has no such step, ADR-592), the
// review showing each value given, never a code or a rate, and submitted for the crew.
async function submitted(
  page: Page,
  crew: string,
  number: string,
  shown: readonly string[],
  byStage = false,
) {
  await expect(heading(page)).toHaveText(said.place.workTitle);
  await page.getByRole('button', { name: said.place.capture }).click();
  await expect(page.getByText(/^GPS: /)).toBeVisible();
  await page.getByRole('button', { name: said.next }).click();
  if (!byStage) {
    await expect(heading(page)).toHaveText(said.photos.title);
    await page.getByRole('button', { name: said.next }).click();
  }
  await expect(heading(page)).toHaveText(said.review.title);
  for (const value of [filled(said.badge.crew, { number: crew }), number, ...shown]) {
    await expect(page.locator('.facts').getByText(value, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText(/[A-Z]+-[A-Z]+-|\$/)).toHaveCount(0);
  await page
    .getByRole('button', { name: filled(said.review.submitCrew, { number: crew }) })
    .click();
  await expect(page.getByText(filled(said.submitted.saved, { number }))).toBeVisible();
  await page.getByRole('button', { name: said.submitted.home }).click();
}

test('AC-11-74, AC-11-82, AC-11-90, AC-11-91, AC-04-70, AC-11-43, AC-11-76, REQ-306, REQ-320, REQ-112b: Jo scans the bucket truck crew 730417, the first step, and the ticket opens at once under her phone’s next number (the golden mission’s 301001 on the first phone), never typed again, straight on to the crew’s photo and the work, never a load’s open ticket and never a field tag; a hanger opens its dashboard, its pre-work photo taken and left while the next tree’s is taken, then come back to for its measurement 3 in across with its photo, and the post-work photo, each part dropping back to the dashboard, to do then done; where the work was done is looked up on the stack’s map; the review shows the three large under their stages, with no step for other photos; leaners go with the pay item the phone worked out from the bands, never shown, nor a rate; the crew stays hers, confirmed on each; two open at once for one crew; a stage left without its photo never holds Complete; "ineligible" offered only where the pay item allows it', async ({
  page,
  context,
}) => {
  const { jo } = worldCast();
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P1-UR-E2E');
  await signedIn(page, jo);
  await expect(page.getByText('Bayline County ROW, Hurricane Delphine')).toBeVisible();
  await expect(page.getByRole('button', { name: english.home.start.unitRate })).toBeEnabled();

  // New: no working crew yet, so the crew's badge, the ticket's first step (ADR-592).
  await page.getByRole('button', { name: english.home.start.unitRate }).click();
  await expect(heading(page)).toHaveText(said.badge.crewTitle);
  await expect(page.getByText(/^Step 1 of /)).toBeVisible();
  await page.getByLabel(said.badge.label).fill('730417');
  await expect(page.getByText(filled(said.badge.crew, { number: '730417' }))).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.badge.crewStart }).click();
  // Opened at once under the number made, never typed again (ADR-589), and straight on to the
  // crew's photo: no load's open ticket, no Complete to find (ADR-592). The first of this phone's
  // own block, whichever of Jo's phones synced first (ADR-585: her certifying phones take unit
  // rate blocks too).
  await expect(heading(page)).toHaveText(said.crew.photoTitle);
  const first = Number(await openedFor(page, '730417'));
  expect(first).toBeGreaterThanOrEqual(301001);
  const n = (after: number) => String(first + after);
  await expect(page.getByText(said.number.againTitle)).toHaveCount(0);
  await expect(page.getByRole('button', { name: said.open.complete })).toHaveCount(0);
  await photographed(page);
  await expect(page.getByRole('img')).toHaveCount(1);
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();

  // The work by name, each payable type once; no field tag after it (ADR-591).
  await expect(heading(page)).toHaveText(said.work.title);
  await expect(page.getByRole('option')).toHaveText([
    'Hangers',
    'Leaners',
    'Stumps',
    'White Goods',
    'Crew time',
  ]);
  await checkScreen(page);
  await workPicked(page, 'Hangers');

  // The hanger's dashboard (ADR-590, 592): its crew and number, each part to do.
  await onDashboard(page, 'Hangers', n(0));
  await expect(page.getByText('Field tag')).toHaveCount(0);
  for (const stage of ['PRE_WORK', 'POST_WORK'] as const) {
    await expect(page.getByRole('button', { name: said.stages.take[stage] })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: said.stages.measure })).toBeVisible();
  await expect(page.getByText(said.stages.toDo, { exact: true })).toHaveCount(3);
  await checkScreen(page);
  // The pre-work photo straight from the camera, and back on the dashboard, done.
  await staged(page, 'PRE_WORK');
  await onDashboard(page, 'Hangers', n(0));
  await expect(page.getByText(said.stages.done, { exact: true })).toHaveCount(1);
  await checkScreen(page);
  // Stepped out of it for the next tree: home says the hanger waits on its measurement.
  await page.getByRole('button', { name: said.leave }).click();
  const hangerRow = page.getByText(
    filled(english.home.open.crew, { truck: '730417', number: n(0) }),
    { exact: true },
  );
  await expect(hangerRow).toBeVisible();
  await expect(
    page.getByText(filled(said.stages.next, { stage: said.stages.names.MEASUREMENT })),
  ).toBeVisible();
  await checkScreen(page);

  // The next tree, a leaner: the working crew offered first and kept, straight on to the work;
  // its pre-work photo, and stepped out of it in turn.
  const leaner = await begun(page, { same: '730417' });
  expect(leaner).toBe(n(1));
  await workPicked(page, 'Leaners');
  await onDashboard(page, 'Leaners', n(1));
  await staged(page, 'PRE_WORK');
  await page.getByRole('button', { name: said.leave }).click();

  // Back to the hanger, at its dashboard: the measurement's photo, then its limb measured across,
  // and back on the dashboard; then the post-work photo; every part done.
  await hangerRow.click();
  await onDashboard(page, 'Hangers', n(0));
  await measured(page, said.measure.across, '3');
  await onDashboard(page, 'Hangers', n(0));
  await expect(
    page.getByRole('button', { name: filled(said.stages.measured, { measured: '3 in across' }) }),
  ).toBeVisible();
  await staged(page, 'POST_WORK');
  await expect(page.getByText(said.stages.done, { exact: true })).toHaveCount(3);
  await checkScreen(page);
  await page.getByRole('button', { name: said.open.complete }).click();
  // No "ineligible": the hanger's pay item doesn't allow it. Where: the fix, then the street
  // looked up on the stack's own map (ADR-593).
  await expect(heading(page)).toHaveText(said.place.workTitle);
  await page.getByRole('button', { name: said.place.capture }).click();
  await page.getByRole('button', { name: said.place.lookUp }).click();
  await expect(page.getByText(/^Address found: \S/)).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();
  // No step for other photos (ADR-592): the review, each stage's photograph large under its
  // stage, then the crew's.
  await expect(heading(page)).toHaveText(said.review.title);
  await expect(page.getByRole('heading', { name: said.stages.photosTitle })).toBeVisible();
  for (const stage of ['PRE_WORK', 'MEASUREMENT', 'POST_WORK'] as const) {
    const shown = page
      .getByRole('figure', { name: said.stages.names[stage] })
      .getByRole('img', { name: new RegExp(`^${said.stages.names[stage]} photo, `) });
    await expect(shown).toBeVisible();
    expect((await shown.boundingBox())?.width ?? 0).toBeGreaterThan(240);
  }
  await expect(page.getByRole('heading', { name: said.review.photos, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: english.look.photos.take })).toHaveCount(0);
  await checkScreen(page);
  await page
    .getByRole('button', { name: said.stages.open.replace('{stage}', 'post-work') })
    .click();
  await expect(heading(page)).toHaveText(/^Post-work photo, /);
  await page.getByRole('button', { name: said.photos.back }).click();
  await expect(heading(page)).toHaveText(said.review.title);
  for (const value of [
    filled(said.badge.crew, { number: '730417' }),
    n(0),
    'Hangers',
    '3 in across',
    '1',
  ]) {
    await expect(page.locator('.facts').getByText(value, { exact: true }).first()).toBeVisible();
  }
  await page
    .getByRole('button', { name: filled(said.review.submitCrew, { number: '730417' }) })
    .click();
  await expect(page.getByText(filled(said.submitted.saved, { number: n(0) }))).toBeVisible();
  await page.getByRole('button', { name: said.submitted.home }).click();

  // The leaner finished from home, at its dashboard: measured around, and its last two photos.
  await page
    .getByText(filled(english.home.open.crew, { truck: '730417', number: n(1) }), { exact: true })
    .click();
  await onDashboard(page, 'Leaners', n(1));
  await measured(page, said.measure.around, '56.5');
  await staged(page, 'POST_WORK');
  await page.getByRole('button', { name: said.open.complete }).click();
  await submitted(page, '730417', n(1), ['Leaners', '56.5 in around'], true);

  // Two open at once for the same crew: a crew isn't held to one; the first left for now.
  const big = await begun(page, { same: '730417' });
  await page.getByRole('button', { name: said.leave }).click();
  const spare = await begun(page, { same: '730417' });
  expect([big, spare]).toEqual([n(2), n(3)]);
  await page.getByRole('button', { name: said.leave }).click();
  for (const number of [big, spare]) {
    await expect(
      page.getByText(filled(english.home.open.crew, { truck: '730417', number }), {
        exact: true,
      }),
    ).toBeVisible();
  }
  await checkScreen(page);
  // The first finished with no stage photographed: Complete is never held. A leaner 80 in around
  // falls in 24.1–99 in, whose pay item lets the monitor mark it ineligible: offered, and marked.
  await page.getByText(filled(english.home.open.crew, { truck: '730417', number: big })).click();
  await workPicked(page, 'Leaners');
  await measured(page, said.measure.around, '80', false);
  await onDashboard(page, 'Leaners', big);
  await page.getByRole('button', { name: said.open.complete }).click();
  await expect(heading(page)).toHaveText(said.ineligible.title);
  await checkScreen(page);
  await page.getByRole('option', { name: said.ineligible.mark, exact: true }).click();
  await submitted(page, '730417', big, ['Leaners', '80 in around', said.review.ineligible], true);
  // The other cancelled from its work's step: kept on the phone, never sent.
  await page.getByText(filled(english.home.open.crew, { truck: '730417', number: spare })).click();
  await expect(heading(page)).toHaveText(said.work.title);
  await page.getByRole('button', { name: said.open.cancel }).click();
  await page.getByRole('button', { name: said.open.cancelYes }).click();
  await expect(heading(page)).toHaveText(english.home.title);
  await expect(page.getByText(filled(english.home.today.other, { count: '3' }))).toBeVisible();

  // At the sync: each as the contract carries it, the pay item the phone worked out, and each
  // stage's photograph saying its stage (AC-04-104).
  const lists = listsHeld(asked);
  const from = await syncedNow(page, asked);
  const { events, photos, answers } = sentSince(asked, from);
  expect(answers).toEqual(['SAVED', 'SAVED', 'SAVED']);
  expect(
    events.map((event) => [
      event.kind,
      event.ticketNumber,
      event.certNumber,
      codeOf(lists, event.payItemId),
      event.unitCount,
      event.measurementInches,
      event.measuredAs,
      event.markedIneligible,
      event.endLatitude !== null,
    ]),
  ).toEqual([
    ['UNIT_RATE', n(0), '730417', 'HNG-RMV-EA', 1, 3, 'DIAMETER', null, true],
    ['UNIT_RATE', n(1), '730417', 'LNR-RMV-EA-24', 1, 56.5, 'CIRCUMFERENCE', null, true],
    ['UNIT_RATE', n(2), '730417', 'LNR-RMV-EA-99', 1, 80, 'CIRCUMFERENCE', true, true],
  ]);
  const stagesOf = (event: SentEvent | undefined) =>
    photos.filter(({ owner }) => owner.id === event?.id).map(({ stage }) => stage);
  expect([stagesOf(events[0]), stagesOf(events[1]), stagesOf(events[2])]).toEqual([
    [null, 'PRE_WORK', 'MEASUREMENT', 'POST_WORK'],
    ['PRE_WORK', 'MEASUREMENT', 'POST_WORK'],
    [],
  ]);
});

test('REQ-112b, REQ-306, AC-04-70: on another phone the skid steer crew 730418’s stump takes its diameter two feet up, its root ball, "half or more exposed" and survey number; Jo changes crew to 730417 for white goods, counted whole, and back to 730418 for crew time, its hours to the quarter hour', async ({
  page,
  context,
}) => {
  const { jo } = worldCast();
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P1-UR-E2E-2');
  await signedIn(page, jo);

  // A stump: its dashboard, its measurement from it (ADR-590, 592), the photo passed with Next;
  // its diameter across two feet up, never around.
  const stump = await begun(page, { scan: '730418' });
  await workPicked(page, 'Stumps');
  await onDashboard(page, 'Stumps', stump);
  await page.getByRole('button', { name: said.stages.measure }).click();
  await expect(heading(page)).toHaveText(said.stages.measurePhotoTitle);
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();
  await expect(heading(page)).toHaveText(said.stump.title);
  await expect(page.getByText(said.stump.about)).toBeVisible();
  await keyed(page, '30');
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();
  await expect(heading(page)).toHaveText(said.stump.rootBallTitle);
  await keyed(page, '96');
  await page.getByRole('button', { name: said.next }).click();
  await expect(heading(page)).toHaveText(said.stump.exposedTitle);
  await checkScreen(page);
  await page.getByRole('option', { name: said.stump.halfOrMore, exact: true }).click();
  await expect(heading(page)).toHaveText(said.stump.surveyTitle);
  await page.getByLabel(said.stump.surveyLabel).fill('APN 14-0321-007');
  await checkScreen(page);
  await page.getByRole('button', { name: said.next }).click();
  // Back on its dashboard, the measurement entered and no photograph taken: Complete is never
  // held.
  await onDashboard(page, 'Stumps', stump);
  await expect(
    page.getByRole('button', {
      name: filled(said.stages.measured, { measured: '30 in across, two feet up' }),
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: said.open.complete }).click();
  await submitted(
    page,
    '730418',
    stump,
    [
      'Stumps',
      '30 in across, two feet up',
      '96 in across',
      said.review.halfOrMore,
      'APN 14-0321-007',
    ],
    true,
  );

  // White goods: the crew changed to 730417; each item counted, whole.
  await page.getByRole('button', { name: english.home.start.unitRate }).click();
  await expect(heading(page)).toHaveText(said.crew.title);
  await expect(
    page.getByRole('button', { name: filled(said.crew.same, { number: '730418' }) }),
  ).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: english.look.back }).click();
  const goods = await begun(page, { scan: '730417' });
  await workPicked(page, 'White Goods');
  await expect(heading(page)).toHaveText(said.items.countsTitle);
  await page.getByLabel('Washer', { exact: true }).fill('1.5');
  await expect(page.getByText(said.items.notWhole)).toBeVisible();
  await expect(page.getByRole('button', { name: said.next })).toBeDisabled();
  await checkScreen(page);
  for (const [item, count] of [
    ['Washer', '2'],
    ['Dryer', '1'],
    ['Fridge, freon recovered', '2'],
    ['Fridge, no freon', '1'],
  ] as const) {
    await page.getByLabel(item, { exact: true }).fill(count);
  }
  await page.getByRole('button', { name: said.next }).click();
  await submitted(page, '730417', goods, [
    'White Goods',
    'Washer: 2 · Dryer: 1 · Fridge, freon recovered: 2 · Fridge, no freon: 1',
  ]);

  // Crew time: back to 730418; hours to the quarter hour.
  const hours = await begun(page, { scan: '730418' });
  await workPicked(page, 'Crew time');
  await expect(heading(page)).toHaveText(said.items.hoursTitle);
  const skidSteer = filled(said.items.hours, { item: 'Skid Steer' });
  await page.getByLabel(skidSteer, { exact: true }).fill('9.7');
  await expect(page.getByText(said.items.notQuarter)).toBeVisible();
  await expect(page.getByRole('button', { name: said.next })).toBeDisabled();
  await checkScreen(page);
  await page.getByLabel(skidSteer, { exact: true }).fill('9.75');
  await page.getByLabel(filled(said.items.hours, { item: 'Truck' }), { exact: true }).fill('8.5');
  await page.getByRole('button', { name: said.next }).click();
  await submitted(page, '730418', hours, ['Crew time', 'Skid Steer: 9.75 h · Truck: 8.5 h']);

  const lists = listsHeld(asked);
  const from = await syncedNow(page, asked);
  const { events, answers } = sentSince(asked, from);
  expect(answers).toEqual(['SAVED', 'SAVED', 'SAVED']);
  const [stumped, removed, worked] = events;
  expect([
    codeOf(lists, stumped?.payItemId ?? null),
    stumped?.unitCount,
    stumped?.measurementInches,
    stumped?.measuredAs,
    stumped?.rootBallInches,
    stumped?.rootBallHalfExposed,
    stumped?.surveyNumber,
  ]).toEqual(['STP-RMV-EA-36', 1, 30, 'DIAMETER', 96, true, 'APN 14-0321-007']);
  expect([
    removed?.certNumber,
    codeOf(lists, removed?.payItemId ?? null),
    removed?.unitCount,
    removed?.items.map(({ itemNameId, quantity }) => [itemOf(lists, itemNameId), quantity]),
  ]).toEqual([
    '730417',
    'WG-RMV-EA',
    null,
    [
      ['Washer', 2],
      ['Dryer', 1],
      ['Fridge, freon recovered', 2],
      ['Fridge, no freon', 1],
    ],
  ]);
  expect([
    worked?.certNumber,
    codeOf(lists, worked?.payItemId ?? null),
    worked?.items.map(({ itemNameId, quantity }) => [itemOf(lists, itemNameId), quantity]),
  ]).toEqual([
    '730418',
    'CREW-TIME-HR',
    [
      ['Skid Steer', 9.75],
      ['Truck', 8.5],
    ],
  ]);
});
