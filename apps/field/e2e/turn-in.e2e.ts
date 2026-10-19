// "Sync and turn in", in the browser build (BACKLOG 3.4.3; ADR-096, 488, 530, 580), through its
// screens against the real API in the run's own world: Ana's two collections kept on her phone
// and Ana gone home, the supervisor turns it in from the sign-in screen, and every record of hers
// arrives before the phone is erased and opens at enrolment again; a phone holding a record this
// release can't read is answered not turned in, shows the server's words and what it lacks, and
// keeps everything; and P1-TWR-LF, lost and its key revoked by the firm's time, says the passcode
// is needed, and with it is synced and turned in.
import type { Page } from '@playwright/test';
import { syncExamples, type SyncedRecord } from '@open-adms/contracts';
import { uuidv7 } from '@open-adms/domain';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect, test } from './accessible.ts';
import { benched, type Bench } from './bench.ts';
import { enrolled, filled, recorded, toApi, type Asked } from './phone-page.ts';
import { worldCast, worldLostPhone, worldOrigin, worldPasscode } from './world.ts';

const at = (asked: readonly Asked[], path: string) =>
  toApi(asked).filter((one) => one.path === path);

// The browser's own databases, by name: the keyring's is gone once the phone is wiped.
const databases = (page: Page) =>
  page.evaluate(async () => (await indexedDB.databases()).map(({ name }) => name).sort());

// Signed in as one of the cast, the phone's first sync and lists read: their id and assignment.
async function signedIn(page: Page, asked: Asked[], who: 'ana' | 'lee') {
  const monitor = worldCast()[who];
  const from = toApi(asked).length;
  await page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
  await page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
  await page.getByRole('button', { name: english.phone.signIn }).click();
  await expect(page.getByText(english.work.synced.now)).toBeVisible();
  await expect.poll(() => toApi(asked).slice(from).length).toBe(4);
  const [answered, , lists] = toApi(asked).slice(from);
  return {
    userId: (answered?.answer as { userId: string }).userId,
    ...(lists?.answer as {
      assignment: { id: string; project: { id: string } };
      lists: { setupVersion: number };
    }),
  };
}

async function signedOut(page: Page) {
  await page.getByRole('button', { name: english.menu.settings }).click();
  await page.getByRole('button', { name: english.settings.signOut }).click();
  await expect(page.getByText(english.phone.nobody)).toBeVisible();
}

// The passcode typed on "Sync and turn in", and the screen it comes to.
async function turnedIn(page: Page) {
  await page.getByRole('button', { name: english.phone.turnIn }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.turnIn.title);
  await checkScreen(page);
  await page.getByLabel(english.turnIn.passcode).fill(worldPasscode());
  await page.getByRole('button', { name: english.turnIn.turnIn }).click();
}

test('AC-02-58, AC-11-08, AC-11-34, AC-05-56: with Ana gone home, the supervisor turns her phone in: it proves itself with the passcode, syncs both her records as the master user, and only told to wipe erases its keyring and its store, then opens at enrolment', async ({
  page,
}) => {
  const asked = recorded(page);
  await enrolled(page, 'P1-COL-TURN');
  const { userId, assignment, lists } = await signedIn(page, asked, 'ana');

  // Two collections of hers kept on the phone, as the capture will keep them (task 3.5.1).
  const now = new Date();
  const collection = (ticketNumber: string): SyncedRecord => ({
    record: 'FIELD_EVENT',
    fieldEvent: {
      ...syncExamples.collection,
      id: uuidv7(now),
      projectId: assignment.project.id,
      assignmentId: assignment.id,
      monitorId: userId,
      setupVersion: lists.setupVersion,
      ticketNumber,
      formDebrisTypeId: null,
      startedAt: new Date(now.getTime() - 900_000).toISOString(),
      endedAt: now.toISOString(),
    },
  });
  const records = [collection('101801'), collection('101802')];
  await benched(page);
  expect(
    await page.evaluate((kept) => (globalThis as unknown as Bench).admsBench.kept(kept), records),
  ).toEqual([null, null]);
  await signedOut(page);
  const before = toApi(asked).length;

  await turnedIn(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.turnIn.done.title);
  await expect(page.getByText(english.turnIn.done.erased)).toBeVisible();
  await checkScreen(page);

  // Proven with the passcode beside its key; the syncs and the turn-in as the master user, nobody's
  // session beside them; both her records saved; told to wipe, its numbers handed back.
  // What the turn-in asked (the sign-in screen's own read of the phone aside).
  const after = toApi(asked)
    .slice(before)
    .filter(({ method, path }) => !(method === 'GET' && path === '/phones/current'));
  expect(after.map(({ method, path, status }) => `${method} ${path} ${String(status)}`)).toEqual([
    expect.stringMatching(/^POST \/phones\/.+\/challenges 200$/) as unknown as string,
    expect.stringMatching(/^POST \/phones\/.+\/proofs 200$/) as unknown as string,
    'POST /phones/current/syncs 200',
    'POST /phones/current/turn-ins 200',
  ]);
  const [, proof, sync, turnIn] = after;
  expect((proof?.body as { passcode?: string }).passcode).toBe(worldPasscode());
  for (const one of [sync, turnIn]) expect(one?.session).toBeUndefined();
  expect((sync?.body as { records: unknown[] }).records).toEqual(records);
  expect(
    (sync?.answer as { records: { answer: string }[] }).records.map(({ answer }) => answer),
  ).toEqual(['SAVED', 'SAVED']);
  expect(turnIn?.body).toMatchObject({
    holds: { unplannedAssignments: [], passcodeUses: [], records: [], held: [], photos: [] },
  });
  const answer = turnIn?.answer as {
    turnedIn: boolean;
    wipe: boolean;
    numbers: { series: string; ended: string }[];
  };
  expect([answer.turnedIn, answer.wipe]).toEqual([true, true]);
  // The last numbers it used, from the blocks it holds: none yet, for the browser build asks for
  // its first block with the capture's generated number (task 3.5.1), so none ended.
  expect([(turnIn?.body as { lastUsed: unknown[] }).lastUsed, answer.numbers]).toEqual([[], []]);

  // Erased: the keyring's database gone, the store's keys and rows with it; opened again, it is a
  // phone not yet enrolled.
  expect(await databases(page)).not.toContain('open-adms-keyring');
  await page.getByRole('button', { name: english.turnIn.done.enrol }).click();
  await expect(page.getByLabel(english.enrol.name)).toBeVisible();
  expect(await databases(page)).not.toContain('open-adms-keyring');
});

test('AC-11-34, C183: a phone holding a record this release can’t read is answered not turned in; the screen shows the server’s words and what it lacks, and the phone keeps everything', async ({
  page,
}) => {
  const asked = recorded(page);
  await enrolled(page, 'P1-COL-KEEP');
  await signedIn(page, asked, 'lee');
  await benched(page);
  await page.evaluate(
    (id) =>
      (globalThis as unknown as Bench).admsBench.keptUnreadable(id, {
        record: 'TIME_CLOCK_ENTRY',
        entry: { id },
      }),
    uuidv7(new Date()),
  );
  await signedOut(page);

  await turnedIn(page);
  await expect(
    page.getByRole('heading', { level: 2, name: english.turnIn.notTurnedIn.title }),
  ).toBeVisible();
  const [turnIn] = at(asked, '/phones/current/turn-ins');
  const answer = turnIn?.answer as {
    turnedIn: boolean;
    wipe: boolean;
    message: string;
    notOnTheServer: { held: string[] };
  };
  expect([answer.turnedIn, answer.wipe, answer.notOnTheServer.held.length]).toEqual([
    false,
    false,
    1,
  ]);
  await expect(page.getByText(answer.message)).toBeVisible();
  await expect(page.getByText(english.turnIn.notTurnedIn.kept)).toBeVisible();
  await expect(
    page.getByText(filled(english.turnIn.notTurnedIn.held.one, { count: '1' })),
  ).toBeVisible();
  await expect(page.getByText(english.turnIn.notTurnedIn.unreadable.one)).toBeVisible();
  await checkScreen(page);
  expect(await databases(page)).toContain('open-adms-keyring');

  // Left: back at the sign-in screen, the phone as it was, still in service.
  await page.getByRole('button', { name: english.turnIn.cancel }).click();
  await expect(page.getByText(english.phone.nobody)).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(english.phone.standing.inService);
});

test('AC-11-35: P1-TWR-LF, marked lost and its key revoked by the firm’s time, is told at its proof that the passcode is needed; the supervisor types it, and the phone proves itself with it beside its signature, syncs and is turned in', async ({
  page,
}) => {
  const lost = worldLostPhone();
  const asked = recorded(page);
  await page.goto(worldOrigin());
  await expect(page.getByLabel(english.enrol.name)).toBeVisible();
  await benched(page);
  await page.evaluate(
    (phone) => (globalThis as unknown as Bench).admsBench.plantedPhone(phone),
    lost,
  );
  await page.reload();

  await expect(page.getByText(filled(english.phone.enrolled, { name: lost.name }))).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(english.phone.standing.passcodeNeeded);
  await checkScreen(page);
  const proofs = () => at(asked, `/phones/${lost.deviceId}/proofs`);
  expect(
    proofs().map(({ status, answer }) => [status, (answer as { code?: string }).code]),
  ).toEqual([[401, 'MASTER_PASSCODE_NEEDED']]);

  await turnedIn(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.turnIn.done.title);
  const [, withPasscode] = proofs();
  expect([withPasscode?.status, (withPasscode?.body as { passcode?: string }).passcode]).toEqual([
    200,
    worldPasscode(),
  ]);
  const [sync] = at(asked, '/phones/current/syncs');
  expect(sync?.answer).toMatchObject({ numbers: [], masterPasscode: null, setupVersion: null });
  const [turnIn] = at(asked, '/phones/current/turn-ins');
  expect(turnIn?.answer).toMatchObject({ turnedIn: true, wipe: true });
  expect(await databases(page)).not.toContain('open-adms-keyring');
});
