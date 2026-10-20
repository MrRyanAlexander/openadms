// The phone syncs, in the browser build (BACKLOG 3.4.1; ADR-470, 473, 578), through its screens
// against the real API in the run's own world: Kim signs in and the phone syncs before it reads her
// lists, saying what it holds; the Sync screen says when it last synced and that nothing waits;
// two of her records kept on the phone (as the capture will keep them, task 3.5.1) go with
// "Sync now", one saved and one the server holds for a person, which stays on the phone, shown in
// the server's words, and goes again the same; signed out, the phone doesn't sync, even on finding
// a connection.
import { syncExamples, type SyncedRecord } from '@open-adms/contracts';
import { uuidv7 } from '@open-adms/domain';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { benched, type Bench } from './bench.ts';
import { enrolled, filled, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast } from './world.ts';

const syncs = (asked: readonly Asked[]) =>
  toApi(asked).filter(({ path }) => path === '/phones/current/syncs');

interface SyncBody {
  readonly holds: unknown;
  readonly records: readonly { readonly fieldEvent: { readonly id: string } }[];
  readonly passcodeUses: readonly unknown[];
}

test('AC-11-22, AC-11-31, AC-05-46, AC-05-01: Kim signs in and the phone syncs; her two records go with “Sync now”, one saved and one held on the server, which stays shown in the server’s words and goes again the same; signed out, the phone doesn’t sync', async ({
  page,
  context,
}) => {
  const { kim } = worldCast();
  const asked = recorded(page);
  await enrolled(page, 'P1-TWR-SYNC');
  const from = toApi(asked).length;
  await page.getByLabel(english.phone.monitorNumber).fill(kim.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(kim.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByText(english.work.synced.now)).toBeVisible();

  // The sync first, saying the phone holds no lists and no check of the passcode yet; then her
  // lists and the login list.
  await expect.poll(() => toApi(asked).slice(from).length).toBe(4);
  const after = toApi(asked).slice(from);
  expect(after.map(({ method, path, status }) => `${method} ${path} ${String(status)}`)).toEqual([
    'POST /phones/current/sign-ins 200',
    'POST /phones/current/syncs 200',
    'GET /phones/current/lists 200',
    'POST /phones/current/login-list 200',
  ]);
  const [signIn, first, lists] = after;
  const session = (signIn?.answer as { token: string }).token;
  expect(first?.session).toBe(session);
  expect(first?.body).toMatchObject({
    unplannedAssignments: [],
    passcodeUses: [],
    records: [],
    photos: [],
    lastUsed: [],
    holds: { masterPasscodeVersion: null, listsProjectId: null },
  });
  expect(first?.answer).toMatchObject({ records: [], setupVersion: null });
  const { assignment, lists: held } = lists?.answer as {
    assignment: { id: string; project: { id: string }; site: { id: string } };
    lists: { setupVersion: number };
  };

  // Sync: when it last synced, and nothing waits.
  await page.getByRole('button', { name: english.menu.sync }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.sync.title);
  await expect(page.getByRole('status')).toHaveText(english.work.synced.now);
  await expect(page.getByText(english.sync.nothingWaits)).toBeVisible();
  await checkScreen(page);

  // Two disposals of hers kept on the phone: one as the tower made it; one naming a monitor the
  // server doesn't have, which it holds for a person.
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
  const kimsId = (signIn?.answer as { userId: string }).userId;
  const saved = disposal('109001', kimsId);
  const heldBack = disposal('109002', uuidv7(now));
  await benched(page);
  expect(
    await page.evaluate(
      (records) => (globalThis as unknown as Bench).admsBench.kept(records),
      [saved, heldBack],
    ),
  ).toEqual([null, null]);

  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: english.sync.notSaved.title }),
  ).toBeVisible();
  await expect.poll(() => syncs(asked).length).toBe(2);
  const [, second] = syncs(asked);
  const sent = second?.body as SyncBody;
  expect(sent.records).toEqual([saved, heldBack]);
  expect(sent.holds).toEqual({ masterPasscodeVersion: 1, listsProjectId: assignment.project.id });
  const answers = (second?.answer as { records: { answer: string; message?: string }[] }).records;
  expect(answers.map(({ answer }) => answer)).toEqual(['SAVED', 'NOT_SAVED']);
  const words = answers[1]?.message ?? '';
  expect(words).toMatch(/Held on the server for review\.$/);
  await expect(page.getByText(english.sync.notSaved.intro)).toBeVisible();
  await expect(
    page.getByText(
      `${filled(english.sync.what.FIELD_EVENT, { number: '109002' })}, ${english.sync.fieldEvent.DISPOSAL}`,
    ),
  ).toBeVisible();
  await expect(page.getByText(words)).toBeVisible();
  await expect(page.getByText(english.sync.nothingWaits)).toBeHidden();
  await checkScreen(page);

  // Again: the one held goes once more, as it went, and stays shown; the one saved never again.
  await page.getByRole('button', { name: english.sync.syncNow }).click();
  await expect.poll(() => syncs(asked).length).toBe(3);
  const third = syncs(asked)[2]?.body as SyncBody;
  expect(third.records).toEqual([heldBack]);
  await expect
    .poll(() => syncs(asked)[2]?.answer)
    .toMatchObject({
      records: [{ answer: 'NOT_SAVED', message: words }],
    });
  await expect(page.getByText(words)).toBeVisible();

  // Signed out: nothing syncs, even on finding a connection.
  await page.getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await expect(page.getByText(english.phone.nobody)).toBeVisible();
  const before = syncs(asked).length;
  await context.setOffline(true);
  await context.setOffline(false);
  await page.waitForTimeout(500);
  expect(syncs(asked).length).toBe(before);
});

test('AC-11-89: signed in and left on home, Kim’s phone syncs on its own once five minutes have gone by, and not before', async ({
  page,
}) => {
  const { kim } = worldCast();
  await page.clock.install();
  const asked = recorded(page);
  await enrolled(page, 'P1-TWR-EVERY');
  await page.getByLabel(english.phone.monitorNumber).fill(kim.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(kim.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByText(english.work.synced.now)).toBeVisible();
  await expect.poll(() => syncs(asked).length).toBe(1);

  // Four minutes on: nothing yet.
  await page.clock.fastForward('04:00');
  await page.waitForTimeout(500);
  expect(syncs(asked).length).toBe(1);

  // Five: the phone syncs by itself, with nobody touching it.
  await page.clock.fastForward('01:00');
  await expect.poll(() => syncs(asked).length).toBe(2);
  expect(syncs(asked)[1]?.status).toBe(200);
});
