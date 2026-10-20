// The forms that are no ticket's, through the field app's screens (BACKLOG 3.5.4; REQ-307; ADR-149,
// 150, 160, 181, 184, 328, 571, 573, 584), in the run's own world (e2e/world-setup.ts) against the
// real API. An ROE takes the next number of the phone's ROE block at New, typed again; its form
// asks for the GPS; a pre-work survey names it, and a post-work survey, made with the network off,
// picks it from the ROEs whose pre-work survey is done: on P2, where the golden mission makes
// them and nobody else's work does, so no other test's collection meets the ROE. An incident is
// its type, then the firm's sub-type, then only what P1's incident form offers, with the firm's
// own field, not required (ADR-587); it is left part way and finished from home. A drop-off log at the
// assignment's site answers the firm's own fields of every type. Each goes at the next sync as
// the contract carries it, sealed.
import type { BrowserContext, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { enrolled, filled, photographed, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast, worldOrigin, worldPasscode, type CastMonitor } from './world.ts';

const said = english.forms;
const capture = english.capture;
const p2 = 'Bayline County PPDR, Hurricane Delphine';
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

const at = (asked: readonly Asked[], path: string) =>
  toApi(asked).filter((record) => record.path === path);
const syncs = (asked: readonly Asked[]) => at(asked, '/phones/current/syncs');

// A form as the sync sent it: what the test reads of it by name.
interface SentForm {
  readonly id: string;
  readonly answers?: Readonly<Record<string, unknown>>;
  readonly incidentSubTypeId?: string | null;
  readonly contractorId?: string | null;
  readonly formDefinitionId?: string;
}
interface SentRecord {
  readonly record: string;
  readonly roe?: SentForm;
  readonly survey?: SentForm;
  readonly incident?: SentForm;
  readonly dropOffLog?: SentForm;
}
interface SentPhoto {
  readonly id: string;
  readonly owner: { readonly kind: string; readonly id: string };
}

// The records and photographs the syncs since a moment sent, and what each record was answered.
function sentSince(asked: readonly Asked[], from: number) {
  const runs = syncs(asked).slice(from);
  return {
    records: runs.flatMap(({ body }) => (body as { records: SentRecord[] }).records),
    photos: runs.flatMap(({ body }) => (body as { photos?: SentPhoto[] }).photos ?? []),
    answers: runs.flatMap(
      ({ answer }) =>
        (answer as { records?: { answer: string }[] } | undefined)?.records?.map(
          ({ answer: one }) => one,
        ) ?? [],
    ),
  };
}

// The lists the phone was last sent.
function listsHeld(asked: readonly Asked[]) {
  const read = at(asked, '/phones/current/lists').at(-1);
  return (
    read?.answer as {
      lists: {
        roes: { roeNumber: string; preWorkSurveyDone: boolean }[];
        sites: { id: string; name: string }[];
        surveyWorkTypes: { id: string; key: string | null }[];
      };
    }
  ).lists;
}

async function signedIn(page: Page, monitor: Pick<CastMonitor, 'monitorNumber' | 'password'>) {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(heading(page)).toHaveText(english.home.title);
}

// The phone's place, as the browser gives it: allowed for the app's own page, on Cedar Ct.
async function placed(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['geolocation'], { origin: worldOrigin() });
  await context.setGeolocation({ latitude: 39.1022, longitude: -75.5841 });
}

// Digits typed on the keypad.
async function keyed(page: Page, typed: string): Promise<void> {
  for (const key of typed) await page.getByRole('button', { name: key, exact: true }).click();
}

const next = (page: Page) => page.getByRole('button', { name: capture.next });

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

// The review: each value shown once, then submitted, and home.
async function submitted(page: Page, title: string, kind: string, shown: readonly string[]) {
  await expect(heading(page)).toHaveText(title);
  for (const value of shown) {
    await expect(page.locator('.facts').getByText(value, { exact: true }).first()).toBeVisible();
  }
  await checkScreen(page);
  await page.getByRole('button', { name: said.review.submit }).click();
  await expect(heading(page)).toHaveText(filled(said.submitted.title, { kind }));
  await expect(page.getByText(said.submitted.sealed)).toBeVisible();
  await checkScreen(page);
  await page.getByRole('button', { name: said.submitted.home }).click();
  await expect(heading(page)).toHaveText(english.home.title);
}

// "Capture GPS", and the fix shown.
async function fixed(page: Page) {
  await page.getByRole('button', { name: capture.place.capture }).click();
  await expect(page.getByText(/^GPS: /)).toBeVisible();
}

// A row of a list by the words it starts with.
const picked = (page: Page, name: string) =>
  page.getByRole('option', {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });

test('AC-11-84, AC-11-85, AC-11-82, AC-04-80, AC-04-83, AC-11-05, REQ-307, C118: on P2, the ROE takes R-0001, the next of the phone’s ROE block, shown and typed again; its form asks for the GPS; a pre-work survey names it, and with the network off a post-work survey picks it from the ROEs whose pre-work survey is done; all three go at the next sync, and the lists then say its pre-work survey is done', async ({
  page,
  context,
}) => {
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P2-COL-2');
  // Ana created on the phone, and the phone set up for her on P2's ROEs and surveys, as the
  // setup tests make theirs: P1's cast stays as it is.
  await page.getByRole('button', { name: english.phone.createMonitor }).click();
  await page.getByLabel(english.createMonitor.name).fill('Ana Brooks');
  await page.getByLabel(english.createMonitor.passwordLabel).fill('5550127');
  await page.getByLabel(english.createMonitor.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.createMonitor.create }).click();
  await expect(page.getByRole('heading', { name: english.monitorCreated.title })).toBeVisible();
  await expect.poll(() => at(asked, '/phones/current/monitors').at(-1)?.answer).toBeDefined();
  const { monitorNumber } = at(asked, '/phones/current/monitors').at(-1)?.answer as {
    monitorNumber: string;
  };
  await page
    .getByRole('button', { name: filled(english.monitorCreated.setUp, { name: 'Ana Brooks' }) })
    .click();
  await page.getByLabel(english.setup.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.setup.next }).click();
  await picked(page, p2).click();
  await page.getByRole('button', { name: english.setup.next }).click();
  await picked(page, english.setup.work.forms.ROE).click();
  await picked(page, english.setup.work.forms.SURVEY).click();
  await page.getByRole('button', { name: english.setup.next }).click();
  await expect(page.getByRole('heading', { name: english.setup.site.title })).toBeVisible();
  await page.getByRole('button', { name: english.setup.make }).click();
  await expect(page.getByRole('status')).toHaveText(english.setup.made.saved);
  await page.getByRole('button', { name: english.setup.made.done }).click();
  await signedIn(page, { monitorNumber, password: '5550127' });
  await expect(page.locator('.screen-actions').getByRole('button')).toHaveText([
    english.home.start.roe,
    english.home.start.survey,
  ]);
  // Her lists name ROEs: the same run asked for the phone's first ROE block.
  await expect.poll(() => syncs(asked)[1]?.answer).toBeDefined();

  // New ROE: the phone's next number, shown; typed again wrong it opens nothing.
  await page.getByRole('button', { name: english.home.start.roe }).click();
  await expect(heading(page)).toHaveText(said.roeNumber.againTitle);
  await expect(page.locator('.big-number')).toHaveText('R-0001');
  await keyed(page, '2');
  await page.getByRole('button', { name: said.roeNumber.open }).click();
  await expect(page.getByText(said.roeNumber.wrong)).toBeVisible();
  await checkScreen(page);
  await keyed(page, '1');
  await page.getByRole('button', { name: said.roeNumber.open }).click();

  // The property, whether and when it was signed (a day that isn't one is said, Next held), the
  // place the form asks for, and the photo of the signed paper.
  await expect(heading(page)).toHaveText(said.roe.propertyTitle);
  await page.getByLabel(said.roe.parcel).fill('APN 14-0321-007');
  await page.getByLabel(said.roe.owner).fill('Rosa Delgado');
  await checkScreen(page);
  await next(page).click();
  await expect(heading(page)).toHaveText(said.roe.signedTitle);
  await page.getByRole('option', { name: said.roe.signedBefore, exact: true }).click();
  await page.getByLabel(said.roe.signedDay).fill('2026-10-9');
  await expect(page.getByText(said.roe.notADay)).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await checkScreen(page);
  await page.getByLabel(said.roe.signedDay).fill('2026-10-09');
  await next(page).click();
  await expect(heading(page)).toHaveText(said.roe.placeTitle);
  await expect(page.getByText(said.roe.gpsRequired)).toBeVisible();
  await fixed(page);
  await page.getByLabel(capture.place.typed).fill('412 Cedar Ct');
  await checkScreen(page);
  await next(page).click();
  await expect(heading(page)).toHaveText(said.roe.photoTitle);
  await photographed(page);
  await expect(page.getByRole('img')).toHaveCount(1);
  // A photograph opened full size, and back.
  await page.getByRole('button', { name: filled(capture.photos.open, { number: '1' }) }).click();
  await expect(heading(page)).toHaveText(/^Photo 1 of 1, /);
  await checkScreen(page);
  await page.getByRole('button', { name: said.photoBack }).click();
  await expect(heading(page)).toHaveText(said.roe.photoTitle);
  await next(page).click();
  await submitted(page, said.review.title.ROE, 'ROE R-0001', [
    'R-0001',
    'APN 14-0321-007',
    'Rosa Delgado',
    '412 Cedar Ct',
    filled(said.review.signedOn, { day: '2026-10-09' }),
  ]);

  // A pre-work survey: its work type from the firm's list, the ROE's own left to its button.
  await page.getByRole('button', { name: english.home.start.survey }).click();
  await expect(heading(page)).toHaveText(said.survey.typeTitle);
  await expect(page.getByRole('option')).toHaveText(['Pre-work survey', 'Post-work survey']);
  await checkScreen(page);
  await page.getByRole('option', { name: 'Pre-work survey', exact: true }).click();
  await expect(heading(page)).toHaveText(said.survey.roeTitle);
  // The server hasn't the ROE yet: it is typed by its number.
  await page.getByLabel(capture.roe.typeIt).fill('R-0001');
  await checkScreen(page);
  await next(page).click();
  await expect(heading(page)).toHaveText(said.survey.numberTitle);
  await page.getByRole('button', { name: said.survey.numberNone }).click();
  await expect(heading(page)).toHaveText(said.place.title);
  await fixed(page);
  await checkScreen(page);
  await next(page).click();
  await expect(heading(page)).toHaveText(said.photosTitle);
  await next(page).click();
  await expect(heading(page)).toHaveText(said.notes.title);
  await page.getByLabel(said.notes.label).fill('Fence and mailbox standing');
  await checkScreen(page);
  await next(page).click();
  await submitted(page, said.review.title.SURVEY, 'Pre-work survey', [
    'Pre-work survey',
    'R-0001',
    'Fence and mailbox standing',
  ]);

  // With the network off, the post-work survey picks R-0001: its pre-work survey was made here.
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByRole('button', { name: english.home.start.survey }).click();
  await page.getByRole('option', { name: 'Post-work survey', exact: true }).click();
  await expect(heading(page)).toHaveText(said.survey.roeTitle);
  await expect(page.getByText(said.survey.postWorkAbout)).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(1);
  await checkScreen(page);
  await picked(page, 'R-0001').click();
  await next(page).click();
  await page.getByLabel(said.survey.numberLabel).fill('S-412');
  await next(page).click();
  await fixed(page);
  await next(page).click();
  await next(page).click();
  await next(page).click();
  await submitted(page, said.review.title.SURVEY, 'Post-work survey', [
    'Post-work survey',
    'R-0001',
    'S-412',
  ]);
  await context.setOffline(false);

  // At the sync: each as the contract carries it.
  const from = await syncedNow(page, asked);
  const { records, photos, answers } = sentSince(asked, from);
  expect(answers).toEqual(['SAVED', 'SAVED', 'SAVED']);
  const [roe, pre, post] = records;
  expect(roe).toMatchObject({
    record: 'ROE',
    roe: {
      roeNumber: 'R-0001',
      parcelId: 'APN 14-0321-007',
      ownerName: 'Rosa Delgado',
      address: '412 Cedar Ct',
      signed: true,
      signedDate: '2026-10-09',
      latitude: '39.10220000',
      longitude: '-75.58410000',
    },
  });
  expect(roe?.roe).not.toHaveProperty('formDefinitionId');
  const lists = listsHeld(asked);
  const workType = (key: string) => lists.surveyWorkTypes.find((one) => one.key === key)?.id;
  expect([pre?.survey, post?.survey]).toMatchObject([
    {
      workTypeId: workType('PRE_WORK'),
      roeNumber: 'R-0001',
      surveyNumber: null,
      notes: 'Fence and mailbox standing',
    },
    { workTypeId: workType('POST_WORK'), roeNumber: 'R-0001', surveyNumber: 'S-412' },
  ]);
  expect(photos.map(({ owner }) => owner)).toEqual([{ kind: 'ROE', id: roe?.roe?.id }]);
  // The lists read after it: the ROE is the project's, its pre-work survey done.
  await expect
    .poll(() => listsHeld(asked).roes)
    .toEqual([expect.objectContaining({ roeNumber: 'R-0001', preWorkSurveyDone: true })]);
  // And the next ROE number is the block's next: R-0001 is never made again.
  await page.getByRole('button', { name: english.home.start.roe }).click();
  await expect(page.locator('.big-number')).toHaveText('R-0002');
});

test('AC-04-101, AC-04-86, AC-04-87, AC-04-99, AC-11-86, AC-11-75, AC-11-78, REQ-307, C67: Ana’s incident is its type, then the firm’s sub-type, then only what P1’s incident form offers, the contractor involved and a cert number and nowhere to take an ROE number; the firm’s "Police report number" is not required, so Next goes on with it blank, and it is answered; left part way, it waits on home and is finished there; one started by mistake is cancelled and never sent', async ({
  page,
  context,
}) => {
  const { ana } = worldCast();
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P1-INC-E2E');
  await signedIn(page, ana);

  await page.getByRole('button', { name: english.home.start.incident }).click();
  await expect(heading(page)).toHaveText(said.incident.typeTitle);
  await checkScreen(page);
  await page.getByRole('option', { name: 'Property damage', exact: true }).click();
  await expect(heading(page)).toHaveText(
    filled(said.incident.subTypeTitle, { type: 'Property damage' }),
  );
  await checkScreen(page);
  await page.getByRole('option', { name: 'Mailbox struck', exact: true }).click();
  await expect(heading(page)).toHaveText(said.incident.detailsTitle);
  await page.getByLabel(said.incident.description).fill('The loader’s arm struck the mailbox');
  await page.getByLabel(said.incident.parties).fill('Resident at 22 Elm St');
  await checkScreen(page);
  await next(page).click();
  await expect(heading(page)).toHaveText(said.incident.contractorTitle);
  await checkScreen(page);
  await page.getByRole('option', { name: 'Coastline Haulers LLC', exact: true }).click();
  await next(page).click();
  await expect(heading(page)).toHaveText(said.incident.certTitle);
  await page.getByLabel(said.incident.certLabel).fill('730416');
  await checkScreen(page);
  await next(page).click();
  // P1 offers no ROE number: straight on to where it happened.
  await expect(heading(page)).toHaveText(said.incident.placeTitle);
  await fixed(page);
  await page.getByLabel(capture.place.typed).fill('22 Elm St');
  await next(page).click();
  // The firm's own field, not required (ADR-587): Next goes on while it is blank; she answers it.
  await expect(heading(page)).toHaveText(said.own.title);
  await expect(next(page)).toBeEnabled();
  await expect(
    page.getByText(filled(said.own.needed, { fields: 'Police report number' })),
  ).toHaveCount(0);
  await checkScreen(page);
  await page.getByLabel('Police report number', { exact: true }).fill('BC-2026-1187');
  await next(page).click();
  await expect(heading(page)).toHaveText(said.photosTitle);
  await photographed(page);
  await expect(page.getByRole('img')).toHaveCount(1);
  // Left for now: it waits on home, and opens where she left it.
  await page.getByRole('button', { name: capture.leave }).click();
  const row = page.getByText(filled(english.home.open.form.INCIDENT, { type: 'Property damage' }));
  await expect(row).toBeVisible();
  await checkScreen(page);
  await row.click();
  await expect(heading(page)).toHaveText(said.photosTitle);
  await expect(page.getByRole('img')).toHaveCount(1);
  await next(page).click();
  await next(page).click();
  await submitted(page, said.review.title.INCIDENT, 'Incident · Property damage', [
    'Property damage · Mailbox struck',
    'The loader’s arm struck the mailbox',
    'Resident at 22 Elm St',
    'Coastline Haulers LLC',
    '730416',
    '22 Elm St',
    'BC-2026-1187',
  ]);

  // One started by mistake: cancelled, kept on the phone, never sent.
  await page.getByRole('button', { name: english.home.start.incident }).click();
  await page.getByRole('option', { name: 'Near miss', exact: true }).click();
  await expect(heading(page)).toHaveText(said.incident.detailsTitle);
  await page.getByRole('button', { name: said.cancel }).click();
  await expect(heading(page)).toHaveText(
    filled(said.cancelTitle, {
      form: filled(english.home.open.form.INCIDENT, { type: 'Near miss' }),
    }),
  );
  await checkScreen(page);
  await page.getByRole('button', { name: said.cancelYes }).click();
  await expect(heading(page)).toHaveText(english.home.title);
  await expect(page.getByText(english.home.open.title)).toHaveCount(0);

  const from = await syncedNow(page, asked);
  const { records, photos, answers } = sentSince(asked, from);
  expect(answers).toEqual(['SAVED']);
  const incident = records[0]?.incident;
  expect(incident).toMatchObject({
    description: 'The loader’s arm struck the mailbox',
    parties: 'Resident at 22 Elm St',
    address: '22 Elm St',
    certNumber: '730416',
    roeNumber: null,
    answers: { 'police-report': 'BC-2026-1187' },
  });
  expect([incident?.incidentSubTypeId, incident?.contractorId, incident?.formDefinitionId]).toEqual(
    [expect.any(String), expect.any(String), expect.any(String)],
  );
  expect(photos.map(({ owner }) => owner)).toEqual([{ kind: 'INCIDENT', id: incident?.id }]);
});

test('AC-04-88, AC-11-87, AC-11-86, AC-11-78, REQ-307, C69, C127: Kim logs a resident’s drop-off at Marsh Road TDSR, the assignment’s site, never asked; the firm’s own fields of every type: a number that isn’t one said, a required yes or no holding Next, a pick, and a required photograph that never holds it; at the sync the log goes with its answers, the photograph’s answer its own photograph', async ({
  page,
  context,
}) => {
  const { kim } = worldCast();
  await placed(context);
  const asked = recorded(page);
  await enrolled(page, 'P1-DO-E2E');
  await signedIn(page, kim);

  await page.getByRole('button', { name: english.home.start.dropOff }).click();
  await expect(heading(page)).toHaveText(said.dropOff.residentTitle);
  await expect(page.locator('.facts').getByText('Marsh Road TDSR')).toBeVisible();
  await page.getByLabel(said.dropOff.residentName).fill('Carl Jensen');
  await page.getByLabel(said.dropOff.origin).fill('14 Heron St');
  await checkScreen(page);
  await next(page).click();
  await expect(heading(page)).toHaveText(said.dropOff.placeTitle);
  await fixed(page);
  await next(page).click();

  await expect(heading(page)).toHaveText(said.own.title);
  await page.getByLabel('Bags of household trash').fill('three');
  await expect(
    page.getByText(filled(said.own.notANumber, { label: 'Bags of household trash' })),
  ).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await page.getByLabel('Bags of household trash').fill('3');
  // The yes or no is required; the photograph, required too, never holds Next.
  await expect(
    page.getByText(filled(said.own.needed, { fields: 'Resident showed ID?' })),
  ).toBeVisible();
  await checkScreen(page);
  await page.getByRole('option', { name: said.own.yes, exact: true }).click();
  await page.getByRole('option', { name: 'Yard waste', exact: true }).click();
  await expect(next(page)).toBeEnabled();
  await photographed(page, page.getByRole('button', { name: said.own.photo }));
  await expect(page.getByRole('img')).toHaveCount(1);
  await checkScreen(page);
  await next(page).click();
  await expect(heading(page)).toHaveText(said.photosTitle);
  await expect(page.getByRole('img')).toHaveCount(1);
  await next(page).click();
  await next(page).click();
  await submitted(page, said.review.title.DROP_OFF_LOG, 'Drop-off log', [
    'Marsh Road TDSR',
    'Carl Jensen',
    '14 Heron St',
    '3',
    said.review.yes,
    'Yard waste',
    said.own.photoTaken,
  ]);

  const from = await syncedNow(page, asked);
  const { records, photos, answers } = sentSince(asked, from);
  expect(answers).toEqual(['SAVED']);
  const log = records[0]?.dropOffLog;
  const marshRoad = listsHeld(asked).sites.find(({ name }) => name === 'Marsh Road TDSR')?.id;
  expect(log).toMatchObject({
    siteId: marshRoad,
    residentName: 'Carl Jensen',
    originAddress: '14 Heron St',
    answers: { bags: 3, 'id-shown': true, 'load-kind': 'Yard waste' },
  });
  const [pile] = photos;
  expect(pile?.owner).toEqual({ kind: 'DROP_OFF_LOG', id: log?.id });
  expect(log?.answers?.['pile-photo']).toBe(pile?.id);
});
