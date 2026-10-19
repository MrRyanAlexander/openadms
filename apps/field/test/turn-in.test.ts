// "Sync and turn in" (src/phone/turn-in.ts, sync.ts, outbox.ts; BACKLOG 3.4.3, REQ-313, 124c; C69,
// C141, C170, C183; ADR-096, 488, 530, 580): under the master passcode, with or without the
// monitor, the phone proves itself with the passcode beside its key, syncs every queue and sends
// every file as the master user, names what it still holds, and wipes only when told to (the
// keyring first, then the store); told it lacks something, it keeps everything; a key the firm's
// time revoked is proven with the passcode; a turn-in whose answer was lost is known done by the
// key's refusal; a record this release can't read is named by its fingerprint and never wiped over
// unless the server has it. Here against a server of the test's own; against the real API, in a
// real browser, e2e/turn-in.e2e.ts.
import { syncedRecordId, syncExamples, type SyncedRecord } from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { sentPrint } from '../src/phone/outbox.ts';
import { refusalWords } from '../src/refusals.ts';
import english from '../src/words/en.json' with { type: 'json' };
import { ana, done, heldP1, kim, p1, passcode, passwords } from './phone-world.ts';

const collection = (last: string, monitorId = ana.id): SyncedRecord => ({
  record: 'FIELD_EVENT',
  fieldEvent: {
    ...syncExamples.collection,
    id: syncExamples.made(last),
    monitorId,
    projectId: p1.id,
  },
});

const jpeg = (length: number): Uint8Array =>
  Uint8Array.from({ length }, (_, at) => [0xff, 0xd8, 0xff, 0xe1][at] ?? (at * 31) % 256);

const nothingHeld = {
  unplannedAssignments: [],
  passcodeUses: [],
  records: [],
  held: [],
  photos: [],
};

// Ana's two collections and a photograph of the first kept on the phone, Kim's collection in the
// archived queues (she had the phone before), a block of load numbers she used 101001…101005 of,
// and Ana gone home: nobody signed in.
async function anaGoneHome() {
  const held = await heldP1();
  await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '');
  // Kept as a sync's answer keeps it (the test server's lists carry no blocks, the API's do).
  await held.lists.toppedUp([
    {
      projectId: p1.id,
      series: 'LOAD',
      toppedUp: true,
      blocks: [{ firstNumber: 101001, lastNumber: 102000, lastUsedNumber: 101005 }],
    },
  ]);
  // Each series a sync reports answered with the block it holds, as the API answers it.
  held.server.numbers = (sync) =>
    sync.lastUsed.map(({ projectId, series, lastUsedNumber }) => ({
      projectId,
      series,
      toppedUp: false,
      blocks: [{ firstNumber: 101001, lastNumber: 102000, lastUsedNumber }],
    }));
  const [first, second] = [collection('401'), collection('402')];
  await held.outbox.keep(first);
  await held.outbox.keep(second);
  const photo = {
    ...syncExamples.pilePhoto,
    id: syncExamples.made('403'),
    projectId: p1.id,
    takenById: ana.id,
    owner: { kind: 'FIELD_EVENT' as const, id: syncedRecordId(first) },
  };
  await held.outbox.keepPhoto(photo, [{ file: 'photo', bytes: jpeg(2000) }]);
  const kims = collection('404', kim.id);
  await held.store.change([
    {
      shelf: 'archivedQueues',
      id: syncedRecordId(kims),
      value: { kept: 99, record: kims, told: null } as never,
    },
  ]);
  await held.monitor.signOut();
  held.server.sent.length = 0;
  return { held, first, second, kims, photo };
}

describe('Sync and turn in', () => {
  it('AC-02-58, AC-11-08, AC-05-56 with Ana gone home, the supervisor turns her phone in: it proves itself with the passcode beside its key, syncs every record (the archived queue’s too) and sends every file as the master user, names what it still holds (nothing) and the last load number it used, so the rest of its block is handed back, and told to wipe erases its keyring, then its store', async () => {
    const { held, first, second, kims, photo } = await anaGoneHome();
    const lastUsed = [{ projectId: p1.id, series: 'LOAD', lastUsedNumber: 101005 }];
    expect(await held.lists.lastUsed()).toEqual(lastUsed);
    expect(await held.monitor.signedIn()).toBeUndefined();

    expect(await held.turnIn.turnedIn(passcode)).toEqual({ kind: 'turnedIn' });

    const proofs = held.server.sent.filter(({ endpoint }) => endpoint === 'provePhone');
    expect(proofs.map(({ json }) => (json as { passcode?: string }).passcode)).toEqual([passcode]);
    expect(done(held.server.sent)).toEqual(['syncPhone', 'sendPhotoFilePart', 'turnInPhone']);
    // Everything as the master user, nobody's session beside it.
    for (const { token, session } of held.server.sent.filter(
      ({ endpoint }) => endpoint !== 'challengePhone' && endpoint !== 'provePhone',
    )) {
      expect([token, session]).toEqual(['master-user-token', undefined]);
    }
    expect(held.server.syncs.flatMap(({ records }) => records.map(syncedRecordId))).toEqual(
      [first, second, kims].map(syncedRecordId),
    );
    expect(held.server.syncs.flatMap(({ photos }) => photos.map(({ id }) => id))).toEqual([
      photo.id,
    ]);
    expect(held.server.kept.has(`${photo.id} photo`)).toBe(true);
    expect(held.server.turnIns).toEqual([{ passcode, holds: nothingHeld, lastUsed }]);

    // Wiped: the keyring first, then the store; nothing held after.
    expect(held.erased).toEqual(['keyring', 'store']);
    expect([held.store.shelves.size, held.keyring.key, held.keyring.secrets.size]).toEqual([
      0,
      undefined,
      0,
    ]);
    expect([held.outbox.wiped(), held.outbox.holds(), held.outbox.holdsFiles()]).toEqual([
      true,
      [],
      [],
    ]);
  });

  it('the master user’s token run out during the turn-in: the phone proves itself with the passcode again, once, and the turn-in goes on', async () => {
    const { held } = await anaGoneHome();
    held.server.masterTokenRunsOut = true;
    expect(await held.turnIn.turnedIn(passcode)).toEqual({ kind: 'turnedIn' });
    expect(
      held.server.sent
        .filter(({ endpoint }) => endpoint === 'provePhone')
        .map(({ json }) => (json as { passcode?: string }).passcode),
    ).toEqual([passcode, passcode]);
    expect(done(held.server.sent).filter((name) => name === 'turnInPhone')).toHaveLength(2);
    expect(held.server.turnIns).toHaveLength(1);
  });

  it('a sync that stops (told to wait too often) stops the turn-in before it is asked, and keeps everything', async () => {
    const { held } = await anaGoneHome();
    for (let wait = 0; wait < 11; wait += 1) held.server.waits.push({ code: 'BUSY', seconds: 1 });
    expect(await held.turnIn.turnedIn(passcode)).toEqual({
      kind: 'refused',
      code: 'BUSY',
      waitSeconds: 1,
    });
    expect(done(held.server.sent)).not.toContain('turnInPhone');
    expect([held.erased, held.outbox.holds().length]).toEqual([[], 4]);
  });

  it('the passcode changed between the proof and the turn-in: refused there, it is the passcode not taken, the mark dropped, nothing erased', async () => {
    const { held } = await anaGoneHome();
    held.server.turnInPasscode = 'heron-marsh-changed';
    expect(await held.turnIn.turnedIn(passcode)).toEqual({ kind: 'wrong' });
    expect(await held.store.read('keptAnswers', 'turnInAsked')).toBeUndefined();
    expect(held.erased).toEqual([]);
  });

  it('AC-11-34 answered wipe: false, the phone keeps everything, and the screen has the server’s words and what it lacks; nothing is erased', async () => {
    const { held, first } = await anaGoneHome();
    const message =
      'Not turned in: the server doesn’t have 1 record this phone holds yet. Nothing was wiped and nothing was changed. Sync the phone again, then turn it in.';
    const lacks = { ...nothingHeld, records: [syncedRecordId(first)] };
    held.server.turnInAnswer = () => ({
      turnedIn: false,
      wipe: false,
      message,
      notOnTheServer: lacks,
    });

    expect(await held.turnIn.turnedIn(passcode)).toEqual({
      kind: 'notTurnedIn',
      message,
      notOnTheServer: lacks,
      unreadable: 0,
    });
    expect(held.erased).toEqual([]);
    expect(held.keyring.key).toBeDefined();
    expect((await held.store.readAll('records')).length).toBe(2);
    expect(await held.store.read('keptAnswers', 'turnInAsked')).toBeUndefined();
    expect(held.outbox.wiped()).toBe(false);
  });

  it('a passcode the server doesn’t take at the proof sends nothing more, and keeps everything', async () => {
    const { held } = await anaGoneHome();
    expect(await held.turnIn.turnedIn('heron-marsh-wrong')).toEqual({ kind: 'wrong' });
    expect(held.server.sent.map(({ endpoint }) => endpoint)).toEqual([
      'challengePhone',
      'provePhone',
    ]);
    expect([held.erased, held.outbox.holds().length]).toEqual([[], 3]);
  });

  it('AC-11-35 P1-TWR-LF’s key revoked by the firm’s time: a monitor’s sync is told the passcode is needed, in the screen’s words; the supervisor types it, and the phone proves itself with it beside its key, syncs and is turned in', async () => {
    const held = await heldP1();
    await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    await held.outbox.keep(collection('501'));
    held.server.keyRevoked = 'firmTime';
    held.server.sent.length = 0;

    const ran = await held.sync.run();
    expect(ran).toEqual({ kind: 'refused', code: 'MASTER_PASSCODE_NEEDED' });
    expect(refusalWords(ran as never)).toBe(english.refusals.passcodeNeeded);
    expect(held.server.syncs).toEqual([]);

    held.server.sent.length = 0;
    expect(await held.turnIn.turnedIn(passcode)).toEqual({ kind: 'turnedIn' });
    expect(
      held.server.sent
        .filter(({ endpoint }) => endpoint === 'provePhone')
        .map(({ json }) => (json as { passcode?: string }).passcode),
    ).toEqual([passcode]);
    expect(held.server.syncs.flatMap(({ records }) => records.map(syncedRecordId))).toEqual([
      syncExamples.made('501'),
    ]);
    expect(held.erased).toEqual(['keyring', 'store']);
  });

  it('C141, C170 a turn-in whose answer never came keeps everything; asked again, the phone’s key alone is refused, so it was turned in, and it wipes without asking a second time', async () => {
    const { held } = await anaGoneHome();
    held.server.turnInAnswerLost = true;
    expect(await held.turnIn.turnedIn(passcode)).toEqual({ kind: 'unreachable' });
    expect(held.erased).toEqual([]);
    expect(await held.store.read('keptAnswers', 'turnInAsked')).toBeDefined();

    held.server.turnInAnswerLost = false;
    held.server.sent.length = 0;
    expect(await held.turnIn.turnedIn(passcode)).toEqual({ kind: 'turnedIn' });
    // Its read of itself by the token it held, refused; proven again by its key alone, refused.
    expect(done(held.server.sent)).toEqual(['provenPhone']);
    expect(
      held.server.sent
        .filter(({ endpoint }) => endpoint === 'provePhone')
        .map(({ json }) => (json as { passcode?: string }).passcode),
    ).toEqual([undefined]);
    expect(held.server.turnIns).toHaveLength(1);
    expect(held.erased).toEqual(['keyring', 'store']);
  });

  it('C141 a turn-in whose answer never came, and which the server didn’t do: asked again, the phone’s key still stands, and it goes as any other', async () => {
    const { held, first } = await anaGoneHome();
    held.server.turnInAnswerLost = true;
    held.server.turnInAnswer = () => ({
      turnedIn: false,
      wipe: false,
      message: 'Not turned in.',
      notOnTheServer: { ...nothingHeld, records: [syncedRecordId(first)] },
    });
    expect(await held.turnIn.turnedIn(passcode)).toEqual({ kind: 'unreachable' });

    held.server.turnInAnswerLost = false;
    held.server.turnInAnswer = () => undefined;
    expect(await held.turnIn.turnedIn(passcode)).toEqual({ kind: 'turnedIn' });
    expect(held.server.turnIns).toHaveLength(2);
    expect(held.erased).toEqual(['keyring', 'store']);
  });

  it('C183 a record the contract no longer reads is never sent, is named at turn-in by the fingerprint of what stands in its place, and the phone is not wiped over it while the server lacks it; where the server holds it, it is', async () => {
    const { held } = await anaGoneHome();
    // Kept by a later release's capture (a kind of record this one doesn't know), and one the
    // server answered saved: only the first is named.
    const unknown = { record: 'TIME_CLOCK_ENTRY', entry: { id: syncExamples.made('601') } };
    const savedOne = { record: 'TIME_CLOCK_ENTRY', entry: { id: syncExamples.made('602') } };
    await held.store.change([
      { shelf: 'records', id: syncExamples.made('601'), value: { kept: 50, record: unknown } },
      {
        shelf: 'records',
        id: syncExamples.made('602'),
        value: {
          kept: 51,
          record: savedOne,
          told: { answer: 'SAVED', id: syncExamples.made('602') },
        },
      },
    ]);
    held.server.turnInAnswer = ({ holds }) =>
      holds.held.length === 0
        ? undefined
        : {
            turnedIn: false,
            wipe: false,
            message: 'Not turned in: the server doesn’t have 1 record this phone holds yet.',
            notOnTheServer: { ...nothingHeld, held: holds.held },
          };

    const outcome = await held.turnIn.turnedIn(passcode);
    expect(outcome).toMatchObject({ kind: 'notTurnedIn', unreadable: 1 });
    expect(held.server.turnIns[0]?.holds.held).toEqual([sentPrint(unknown)]);
    expect(
      held.server.syncs.flatMap(({ records }) => records.map((one) => one.record as string)),
    ).not.toContain('TIME_CLOCK_ENTRY');
    expect(held.erased).toEqual([]);

    // The server holds it from this phone (an earlier release sent it, and it was held for a
    // person): turned in, and wiped.
    held.server.turnInAnswer = () => undefined;
    expect(await held.turnIn.turnedIn(passcode)).toEqual({ kind: 'turnedIn' });
    expect(held.server.turnIns[1]?.holds.held).toEqual([sentPrint(unknown)]);
    expect(held.erased).toEqual(['keyring', 'store']);
  });

  it('a monitor’s sync asked once the master user’s sync has begun waits for the turn-in, and finds nobody signed in after the wipe', async () => {
    const held = await heldP1();
    await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    await held.outbox.keep(collection('801'));
    held.server.sent.length = 0;
    let ran: Promise<unknown> | undefined;
    held.server.recordAnswer = () => {
      ran ??= held.sync.run();
      return undefined;
    };
    expect(await held.turnIn.turnedIn(passcode)).toEqual({ kind: 'turnedIn' });
    expect(await ran).toEqual({ kind: 'nobodySignedIn' });
    expect(held.server.sent.some(({ session }) => session !== undefined)).toBe(false);
  });

  it('a monitor’s sync under way when the phone is turned in from Settings: the turn-in waits for it, and her record goes once', async () => {
    const held = await heldP1();
    await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    await held.outbox.keep(collection('701'));
    held.server.sent.length = 0;

    const ran = held.sync.run();
    const turned = held.turnIn.turnedIn(passcode);
    expect(await ran).toMatchObject({ kind: 'synced' });
    expect(await turned).toEqual({ kind: 'turnedIn' });
    // Everything of hers, with her session, before anything of the master user's.
    const sessions = held.server.sent.map(({ session }) => session !== undefined);
    expect(sessions.lastIndexOf(true)).toBeLessThan(
      held.server.sent.findIndex(({ token }) => token === 'master-user-token'),
    );
    expect(held.server.syncs.flatMap(({ records }) => records.map(syncedRecordId))).toEqual([
      syncExamples.made('701'),
    ]);
  });
});
