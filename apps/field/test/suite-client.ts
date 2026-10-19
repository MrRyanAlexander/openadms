// The field app's own sync client as the suite any client of the sync contract must pass drives
// one (packages/contracts, `syncClientSuite`; BACKLOG 3.4.1, C130; ADR-578): what the suite hands
// it kept in the phone's own store first, as its monitors would have, and read back by an outbox
// opened afresh from that store. Shared by the suite's run under Vitest (sync-client.test.ts) and
// in Chromium over the browser build's own store (e2e/sync-client.e2e.ts), so it imports no test
// runner.
import type { SyncClient, SyncClientHolds, SyncClientMaker } from '@open-adms/contracts';

import { PhoneOutbox } from '../src/phone/outbox.ts';
import { PhoneReports } from '../src/phone/reports.ts';
import type { PhoneStore } from '../src/store/phone-store.ts';

// The outbox opened over a store, its numbers those handed.
const opened = (store: PhoneStore, holds: SyncClientHolds) =>
  PhoneOutbox.opened(store, {
    holding: () =>
      Promise.resolve({
        holds: { masterPasscodeVersion: null, listsProjectId: null },
        lastUsed: holds.lastUsed,
      }),
    filePartBytesAtMost: holds.filePartBytesAtMost,
    fileBytesAtMost: 33_554_432,
    wipe: () => store.erase(),
  });

// What the suite hands the phone, kept in its store as its monitors would have: the reports by
// `PhoneReports`, each record and photograph by the outbox, each in the order handed; then an
// outbox opened afresh from the store.
async function keptThenOpened(store: PhoneStore, holds: SyncClientHolds): Promise<PhoneOutbox> {
  const reports = new PhoneReports(store);
  for (const report of holds.unplannedAssignments) await reports.keepUnplanned(report);
  for (const report of holds.passcodeUses) await reports.keepUseReport(report);
  const keeping = await opened(store, holds);
  for (const record of holds.records) {
    const refused = await keeping.keep(record);
    if (refused !== undefined) throw new Error(refused.message);
  }
  for (const photo of holds.photos) {
    const files = holds.files.filter(({ photoId }) => photoId === photo.id);
    const refused = await keeping.keepPhoto(photo, files);
    if (refused !== undefined) throw new Error(refused.message);
  }
  for (const { photoId, file, bytes } of holds.files) {
    if (holds.photos.some(({ id }) => id === photoId)) continue;
    const refused = await keeping.keepFile(photoId, file, bytes);
    if (refused !== undefined) throw new Error(refused.message);
  }
  return opened(store, holds);
}

// The outbox as the suite drives a client; `afresh`, opened again from its store after each
// answer to a sync. Opened again as after the app stopped, it is an outbox opened afresh from the
// same store: what it knew in memory alone is gone.
function client(
  store: PhoneStore,
  holds: SyncClientHolds,
  first: PhoneOutbox,
  afresh: boolean,
): SyncClient {
  let outbox = first;
  const driven: SyncClient = {
    sends: () => outbox.sends(),
    answered: async (answer) => {
      await outbox.answered(answer);
      if (afresh) outbox = await opened(store, holds);
    },
    holds: () => outbox.holds(),
    notSaved: () => outbox.notSaved(),
    sendsFilePart: () => outbox.sendsFilePart(),
    filePartAnswered: async (answer) => {
      await outbox.filePartAnswered(answer);
    },
    holdsFiles: () => outbox.holdsFiles(),
    asksWhereFileStands: () => outbox.asksWhereFileStands(),
    fileStandsAnswered: async (answer) => {
      await outbox.fileStandsAnswered(answer);
    },
    reopened: async () => client(store, holds, await opened(store, holds), afresh),
    turnsIn: (passcode) => outbox.turnsIn(passcode),
    turnInAnswered: async (answer) => {
      await outbox.turnInAnswered(answer);
    },
    wiped: () => outbox.wiped(),
  };
  return driven;
}

// A maker of clients for the suite, each over a store of its own; `afresh`, opened again from its
// store after each answer to a sync.
export const suiteMaker =
  (store: () => PhoneStore | Promise<PhoneStore>, afresh: boolean): SyncClientMaker =>
  async (holds) => {
    const made = await store();
    return client(made, holds, await keptThenOpened(made, holds), afresh);
  };
