// The phone sends its photographs' files, in the browser build (BACKLOG 3.4.2; AC-11-32, 33;
// ADR-481…483, 526 (4), 579), against the real API's media endpoint in the run's own world: Kim
// signs in; three of her photographs kept on the phone (as the camera will keep them, task 3.8.2)
// go after their records with "Sync now": one of 5 MB in parts of the most the server takes, one
// of a record the server holds for a person, and one of a record not yet on the phone, answered
// not saved. The signal goes mid-file and the app is opened again: it asks the server where the
// file stands and sends the rest from there. Its record kept, the photograph not saved goes again
// and its file after it.
import type { Page } from '@playwright/test';
import { syncExamples, type SyncedPhoto, type SyncedRecord } from '@open-adms/contracts';
import { uuidv7 } from '@open-adms/domain';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { benched, type Bench } from './bench.ts';
import { enrolled, filled, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast } from './world.ts';

const partBytes = 4_194_304;

const filesAsked = (asked: readonly Asked[], photoId: string) =>
  toApi(asked).filter(({ path }) => path === `/phones/current/photos/${photoId}/files/photo`);

const told = (one: { readonly method: string; readonly url: string; readonly status?: number }) => {
  const query = new URL(one.url).searchParams;
  return `${one.method} ${query.get('offset') ?? '-'} ${String(one.status ?? 'none')}`;
};

async function signIn(page: Page) {
  const { kim } = worldCast();
  await page.getByLabel(english.phone.monitorNumber).fill(kim.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(kim.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByText(english.work.synced.now)).toBeVisible();
}

test('AC-11-32, AC-11-33, C139: Kim’s photographs go after their records, a 5 MB file in parts of the most the server takes; the signal goes mid-file, and opened again the phone asks where the file stands and sends the rest; a held record’s photograph goes; one whose record isn’t saved goes again once it is', async ({
  page,
}) => {
  const asked = recorded(page);
  await enrolled(page, 'P1-TWR-FILES');
  const from = toApi(asked).length;
  await signIn(page);
  await expect.poll(() => toApi(asked).slice(from).length).toBe(4);
  const [signedIn, , lists] = toApi(asked).slice(from);
  const kimsId = (signedIn?.answer as { userId: string }).userId;
  const { assignment, lists: held } = lists?.answer as {
    assignment: { id: string; project: { id: string }; site: { id: string } };
    lists: { setupVersion: number };
  };

  // Three disposals: one saved, one naming a monitor the server doesn't have (held for a
  // person), and one the phone keeps only later; a photograph of each.
  const now = new Date();
  const disposal = (ticketNumber: string, monitorId: string): SyncedRecord => ({
    record: 'FIELD_EVENT',
    fieldEvent: {
      ...syncExamples.disposal,
      id: uuidv7(now),
      projectId: assignment.project.id,
      assignmentId: assignment.id,
      monitorId,
      siteId: assignment.site.id,
      setupVersion: held.setupVersion,
      ticketNumber,
      formDebrisTypeId: null,
      startedAt: new Date(now.getTime() - 240_000).toISOString(),
      endedAt: now.toISOString(),
    },
  });
  const [saved, heldBack, later] = [
    disposal('109101', kimsId),
    disposal('109102', uuidv7(now)),
    disposal('109103', kimsId),
  ];
  const photoOf = (record: SyncedRecord): Omit<SyncedPhoto, 'uploadedSha256'> => {
    const rest: Omit<SyncedPhoto, 'uploadedSha256'> & { uploadedSha256?: string } = {
      ...syncExamples.pilePhoto,
    };
    delete rest.uploadedSha256;
    return {
      ...rest,
      id: uuidv7(now),
      projectId: assignment.project.id,
      owner: {
        kind: 'FIELD_EVENT',
        id: record.record === 'FIELD_EVENT' ? record.fieldEvent.id : '',
      },
      takenById: kimsId,
      capturedAt: now.toISOString(),
    };
  };
  const [large, ofHeld, waits] = [photoOf(saved), photoOf(heldBack), photoOf(later)];
  await benched(page);
  expect(
    await page.evaluate(
      (records) => (globalThis as unknown as Bench).admsBench.kept(records),
      [saved, heldBack],
    ),
  ).toEqual([null, null]);
  expect(
    await page.evaluate(
      (photos) => (globalThis as unknown as Bench).admsBench.keptPhotos(photos),
      [
        { photo: large, length: 5_000_000, seed: 1 },
        { photo: ofHeld, length: 300_000, seed: 2 },
        { photo: waits, length: 200_000, seed: 3 },
      ],
    ),
  ).toEqual([null, null, null]);

  // The signal goes after the large file's first part.
  let cut = false;
  await page.route(`**/phones/current/photos/${large.id}/files/photo?**`, async (route) => {
    const offset = new URL(route.request().url()).searchParams.get('offset');
    if (!cut && offset !== '0') {
      cut = true;
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });

  await page.getByRole('button', { name: english.menu.sync }).click();
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect.poll(() => cut).toBe(true);
  await expect(page.getByRole('button', { name: english.sync.syncNow })).toBeEnabled();

  // The records went first, then the photographs' records after them in the same sync.
  const syncs = toApi(asked).filter(({ path }) => path === '/phones/current/syncs');
  const sync = syncs.at(-1);
  const answer = sync?.answer as {
    records: { answer: string }[];
    photos: { id: string; answer: string; reason?: string; message?: string }[];
  };
  expect(answer.records.map(({ answer: one }) => one)).toEqual(['SAVED', 'NOT_SAVED']);
  expect(answer.photos.map(({ id, answer: one }) => [id, one])).toEqual([
    [large.id, 'SAVED'],
    [ofHeld.id, 'SAVED'],
    [waits.id, 'NOT_SAVED'],
  ]);
  const ownerWords = answer.photos[2]?.message ?? '';
  expect(answer.photos[2]?.reason).toBe('OWNER_NOT_SAVED');
  const api = toApi(asked);
  const syncAt = api.map(({ path }) => path).lastIndexOf('/phones/current/syncs');
  // No part of a file went before the sync was answered, and no part of the one not saved.
  api.forEach(({ method }, at) => {
    if (method === 'PATCH') expect(at).toBeGreaterThan(syncAt);
  });
  expect(filesAsked(asked, waits.id)).toEqual([]);
  // The large file's first part, of the most the server takes, taken; its second cut off.
  const first = filesAsked(asked, large.id);
  expect(first.map(told)).toEqual(['PATCH 0 200', `PATCH ${String(partBytes)} none`]);
  expect(first[0]?.bytes).toBe(partBytes);
  expect(first[0]?.answer).toEqual({
    upload: 'RECEIVING',
    received: partBytes,
    length: 5_000_000,
  });
  expect(first[0]?.session).toBe((signedIn?.answer as { token: string }).token);
  // The Sync screen says what still goes, and shows the one not saved in the server's words.
  await expect(page.getByText(ownerWords)).toBeVisible();
  await expect(page.getByText(english.sync.what.photo)).toBeVisible();
  await expect(
    page.getByText(/photographs’ files still to send\.$|photograph’s file still to send\.$/),
  ).toBeVisible();
  await checkScreen(page);

  // The app opened again, with signal: Kim signs in, and the phone asks where the large file
  // stands before it sends more of it, then sends the rest from there.
  await page.unroute(`**/phones/current/photos/${large.id}/files/photo?**`);
  const before = asked.length;
  await page.reload();
  await signIn(page);
  await expect
    .poll(() => filesAsked(asked.slice(before), large.id).map(told))
    .toEqual(['GET - 200', `PATCH ${String(partBytes)} 200`]);
  const [where, rest] = filesAsked(asked.slice(before), large.id);
  expect(where?.answer).toEqual({ upload: 'RECEIVING', received: partBytes, length: 5_000_000 });
  expect(rest?.bytes).toBe(5_000_000 - partBytes);
  expect(rest?.answer).toEqual({ upload: 'KEPT' });
  // The held record's photograph went whole too, its record still shown not saved.
  await expect.poll(() => filesAsked(asked, ofHeld.id).at(-1)?.answer).toEqual({ upload: 'KEPT' });
  await page.getByRole('button', { name: english.menu.sync }).click();
  await expect(
    page.getByText(
      `${filled(english.sync.what.FIELD_EVENT, { number: '109102' })}, ${english.sync.fieldEvent.DISPOSAL}`,
    ),
  ).toBeVisible();

  // Its record kept on the phone: the photograph not saved goes again with it, saved, and its
  // file after it.
  await benched(page);
  expect(
    await page.evaluate(
      (records) => (globalThis as unknown as Bench).admsBench.kept(records),
      [later],
    ),
  ).toEqual([null]);
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect.poll(() => filesAsked(asked, waits.id).at(-1)?.answer).toEqual({ upload: 'KEPT' });
  const carried = toApi(asked)
    .filter(({ path }) => path === '/phones/current/syncs')
    .find((one) =>
      (one.body as { records: SyncedRecord[] }).records.some(
        (record) => record.record === 'FIELD_EVENT' && record.fieldEvent.ticketNumber === '109103',
      ),
    );
  expect((carried?.body as { photos: { id: string }[] }).photos.map(({ id }) => id)).toContain(
    waits.id,
  );
  expect(
    (carried?.answer as { photos: { id: string; answer: string }[] }).photos.find(
      ({ id }) => id === waits.id,
    )?.answer,
  ).toBe('SAVED');
  await expect(page.getByText(ownerWords)).toBeHidden();
  await expect(page.getByText(/files? still to send\.$/)).toBeHidden();
  await checkScreen(page);
});
