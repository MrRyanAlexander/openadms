// Photographs from the camera, through the field app's screens (BACKLOG 3.6.1; REQ-316; ADR-101,
// 157, 571, 586), in the run's own world (e2e/world-setup.ts) against the real API: Ana Brooks on
// P1 takes a collection's photographs with the app's own camera (Chromium's fake one, as
// e2e/browser.ts says), never a file or the gallery: each photograph taken again in its place or
// removed before submitting, and gone with the original's SHA-256 as the file's, the browser
// build keeping the original. The camera refused: e2e/camera-refused.e2e.ts.
import { createHash } from 'node:crypto';

import type { BrowserContext, Page } from '@playwright/test';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import {
  enrolled,
  filled,
  openedUnder,
  photographed,
  recorded,
  toApi,
  type Asked,
} from './phone-page.ts';
import { worldCast, worldOrigin, type CastMonitor } from './world.ts';

const said = english.capture;
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

async function signedIn(page: Page, monitor: CastMonitor): Promise<void> {
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(heading(page)).toHaveText(english.home.title);
}

// The phone's place, as the browser gives it: allowed for the app's own page, here at Heron St.
async function placed(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['geolocation'], { origin: worldOrigin() });
  await context.setGeolocation({ latitude: 39.1385, longitude: -75.5537 });
}

const syncs = (asked: readonly Asked[]) =>
  toApi(asked).filter(({ path }) => path === '/phones/current/syncs');

// A collection opened under 730415's badge and the phone's next number: the number.
async function opened(page: Page): Promise<string> {
  await page.getByRole('button', { name: english.home.start.collection }).click();
  await page.getByRole('button', { name: said.split.normal }).click();
  await page.getByLabel(said.badge.label).fill('730415');
  await page.getByRole('button', { name: said.badge.start }).click();
  return openedUnder(page);
}

test('AC-04-79, AC-11-44, AC-11-68, AC-11-78: Ana takes two photographs from the camera, opened only then; the second taken again in its place from full size, the first removed; the one left goes with its original’s SHA-256 as the file’s, and the file sent is the one taken', async ({
  page,
  context,
}) => {
  const { ana } = worldCast();
  await placed(context);
  const asked = recorded(page);
  // Each part of a photograph's file as it went, by its photograph.
  const parts = new Map<string, Buffer[]>();
  page.on('request', (sent) => {
    const file = /\/phones\/current\/photos\/([^/]+)\/files\/photo/.exec(sent.url());
    const bytes = sent.postDataBuffer();
    if (sent.method() !== 'PATCH' || file?.[1] === undefined || bytes === null) return;
    parts.set(file[1], [...(parts.get(file[1]) ?? []), bytes]);
  });
  await enrolled(page, 'P1-COL-E2E-PHOTOS');
  await signedIn(page, ana);
  await expect.poll(() => syncs(asked).length).toBe(2);
  const number = await opened(page);

  // Two from the camera, each shown itself.
  await photographed(page);
  await photographed(page);
  await expect(page.getByRole('img', { name: /^Photo \d of 2, / })).toHaveCount(2);
  await expect(
    page.getByText(filled(english.look.photos.count.other, { count: '2', max: '8' })),
  ).toBeVisible();

  // The second taken again from full size: in its place, still two.
  await page.getByRole('button', { name: filled(said.photos.open, { number: '2' }) }).click();
  await expect(heading(page)).toContainText('Photo 2 of 2');
  await checkScreen(page);
  await photographed(page, page.getByRole('button', { name: said.photos.retake }));
  await expect(heading(page)).toContainText(number);
  await expect(page.getByRole('img', { name: /^Photo \d of 2, / })).toHaveCount(2);

  // The camera open is the only thing that can be reached: checked as the phone shows it, then
  // put away with nothing taken.
  await page.getByRole('button', { name: english.look.photos.take }).click();
  const camera = page.getByRole('dialog', { name: said.camera.title });
  await expect(camera.getByRole('img', { name: said.camera.view })).toBeVisible();
  // React Aria's modal makes the rest of the page inert: out of reach of a press, focus or a
  // screen reader.
  expect(
    await page
      .getByRole('button', { name: said.open.complete })
      .evaluate((button) => button.closest('[inert]') !== null),
  ).toBe(true);
  await checkScreen(page);
  await camera.getByRole('button', { name: said.camera.away }).click();
  await expect(camera).toBeHidden();
  await expect(page.getByRole('img', { name: /^Photo \d of 2, / })).toHaveCount(2);

  // The first removed: never sent.
  await page.getByRole('button', { name: filled(said.photos.open, { number: '1' }) }).click();
  await page.getByRole('button', { name: said.photos.remove }).click();
  await expect(page.getByRole('img', { name: /^Photo 1 of 1, / })).toHaveCount(1);

  // Completed and submitted.
  await page.getByRole('button', { name: said.open.complete }).click();
  await page.getByRole('option', { name: 'Vegetative', exact: true }).click();
  await page.getByRole('button', { name: said.tag.none }).click();
  await page.getByRole('button', { name: said.place.capture }).click();
  await page.getByLabel(said.place.typed).fill('14 Heron St');
  await page.getByRole('button', { name: said.next }).click();
  await expect(heading(page)).toHaveText(said.photos.title);
  await page.getByRole('button', { name: said.next }).click();
  await expect(heading(page)).toHaveText(said.review.title);
  await expect(page.getByRole('img', { name: /^Photo 1 of 1, / })).toBeVisible();
  await page.getByRole('button', { name: said.review.submit }).click();
  await expect(page.getByText(filled(said.submitted.saved, { number }))).toBeVisible();

  // The sync: one photograph, its two fingerprints the same, no depth file; then its file, the
  // one taken, a JPEG whose SHA-256 is that one.
  const before = syncs(asked).length;
  await page.getByRole('button', { name: said.submitted.home }).click();
  await page.getByRole('button', { name: english.menu.sync }).click();
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect.poll(() => syncs(asked).length).toBeGreaterThan(before);
  const body = syncs(asked)
    .slice(before)
    .map(({ body: sent }) => sent as { photos: Record<string, unknown>[] })
    .find(({ photos }) => photos.length > 0);
  expect(body?.photos).toHaveLength(1);
  const [photo] = body?.photos ?? [];
  expect(photo).toMatchObject({ view: null, depthSha256: null });
  expect(photo?.['uploadedSha256']).toBe(photo?.['originalSha256']);
  const id = String(photo?.['id']);
  await expect
    .poll(
      () =>
        toApi(asked)
          .filter(
            ({ path, method }) =>
              method === 'PATCH' && path.startsWith(`/phones/current/photos/${id}/`),
          )
          .at(-1)?.answer,
    )
    .toEqual({ upload: 'KEPT' });
  const file = Buffer.concat(parts.get(id) ?? []);
  expect([...file.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  expect(createHash('sha256').update(file).digest('hex')).toBe(photo?.['originalSha256']);
  expect([...parts.keys()]).toEqual([id]);
});
