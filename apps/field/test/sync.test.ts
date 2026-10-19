// The phone syncs (src/phone/sync.ts, outbox.ts; BACKLOG 3.4.1, REQ-308, 308c, C128, C130, C132,
// C133, C152, C153, C181; ADR-470, 473, 504, 524, 577, 578): only with somebody signed in; a sync
// at a time until nothing more goes, each within the contract's counts and weight; told to wait,
// it waits and sends the same sync again; a record not saved stays, shown in the server's words,
// and goes again once a time the store is read, the same text; the reports it holds go in the sync
// and not ahead of it; an earlier monitor's archived queue goes too, never shown; and what a sync
// brings is kept. Here against a server of the test's own; against the real API, in a real
// browser, e2e/sync.e2e.ts.
import {
  sentCanonical,
  sentWeight,
  syncBytesAtMost,
  syncedRecordBytesAtMost,
  syncedRecordId,
  syncExamples,
  syncRecordsAtMost,
  type SyncedRecord,
} from '@open-adms/contracts';
import { NotSaved } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { sentPrint } from '../src/phone/outbox.ts';
import { ana, done, heldP1, kim, p1, passwords, phone, towerLists } from './phone-world.ts';

const collection = (last: string, more = {}): SyncedRecord => ({
  record: 'FIELD_EVENT',
  fieldEvent: {
    ...syncExamples.collection,
    id: syncExamples.made(last),
    monitorId: ana.id,
    projectId: p1.id,
    ...more,
  },
});

// Ana signed in on the phone that holds P1's lists, the server's record of it cleared.
async function anaSignedIn() {
  const held = await heldP1();
  expect(await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
    kind: 'signedIn',
  });
  held.server.sent.length = 0;
  return held;
}

const recordsSent = (held: Awaited<ReturnType<typeof anaSignedIn>>) =>
  held.server.syncs.map(({ records }) => records.map(syncedRecordId));

describe('the phone syncs', () => {
  it('AC-11-22 with nobody signed in it doesn’t sync, and asks nothing; with a monitor signed in it does, with their session beside the phone’s token', async () => {
    const held = await heldP1();
    await held.outbox.keep(collection('101'));
    expect(await held.sync.run()).toEqual({ kind: 'nobodySignedIn' });
    expect(held.server.sent).toEqual([]);
    expect(held.outbox.holds()).toEqual([syncExamples.made('101')]);

    await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    held.server.sent.length = 0;
    expect(await held.sync.run()).toMatchObject({ kind: 'synced' });
    const [sync] = held.server.sent.filter(({ endpoint }) => endpoint === 'syncPhone');
    expect([sync?.token, sync?.session]).toEqual(['phone-token', 'ana-online']);
    expect(held.outbox.holds()).toEqual([]);
    // Then the lists, then the login list, as every sync of the monitor's asking.
    expect(done(held.server.sent)).toEqual(['syncPhone', 'phoneLists', 'phoneLoginList']);
  });

  it('AC-11-29 450 records go in syncs that each keep within the contract’s counts and its weight, each answered before the next, nothing twice; a record heavier than a record may weigh is never kept', async () => {
    const held = await anaSignedIn();
    const ids: string[] = [];
    for (let made = 0; made < 450; made += 1) {
      const record = collection(String(10_000 + made), { notes: 'Bagged leaves at the curb.' });
      ids.push(syncedRecordId(record));
      expect(await held.outbox.keep(record)).toBeUndefined();
    }
    expect(held.outbox.waiting()).toBe(450);
    await held.sync.run();
    const sent = recordsSent(held);
    expect(sent.map((one) => one.length)).toEqual([200, 200, 50]);
    expect(sent.flat()).toEqual(ids);
    for (const sync of held.server.syncs) {
      expect(sync.records.length).toBeLessThanOrEqual(syncRecordsAtMost);
      expect(sentWeight(sync)).toBeLessThanOrEqual(syncBytesAtMost);
    }
    expect([held.outbox.waiting(), held.outbox.holds()]).toEqual([0, []]);

    // Heavier than a record may be as made: the capture is told why, and nothing is kept.
    const answers: Record<string, string> = {};
    for (let field = 0; field < 70; field += 1) answers[`field${String(field)}`] = 'z'.repeat(4000);
    const tooHeavy = collection('9999', { notes: 'x'.repeat(4000), answers });
    expect(sentWeight(tooHeavy)).toBeGreaterThan(syncedRecordBytesAtMost);
    expect(await held.outbox.keep(tooHeavy)).toMatchObject({ reason: 'NOT_A_RECORD' });
    expect(held.outbox.holds()).toEqual([]);
    expect((await held.store.readAll('records')).length).toBe(450);
  });

  it('AC-11-30 told 429 LIMITED, then 503 BUSY, it waits the seconds it was told and a little more, then sends the same sync again, unchanged; told to ten times in a row, it stops, holding everything', async () => {
    const held = await anaSignedIn();
    await held.outbox.keep(collection('201'));
    await held.outbox.keep(collection('202'));
    held.server.waits.push({ code: 'LIMITED', seconds: 5 }, { code: 'BUSY', seconds: 3 });
    expect(await held.sync.run()).toMatchObject({ kind: 'synced' });
    expect(held.slept).toEqual([5250, 3150]);
    const [first, ...again] = held.server.syncs;
    for (const sync of again) {
      expect([sync.records, sync.passcodeUses, sync.unplannedAssignments]).toEqual([
        first?.records,
        first?.passcodeUses,
        first?.unplannedAssignments,
      ]);
    }
    expect(held.server.syncs).toHaveLength(3);
    expect(held.outbox.holds()).toEqual([]);

    const told = await anaSignedIn();
    await told.outbox.keep(collection('203'));
    for (let wait = 0; wait < 11; wait += 1) told.server.waits.push({ code: 'BUSY', seconds: 1 });
    expect(await told.sync.run()).toEqual({ kind: 'refused', code: 'BUSY', waitSeconds: 1 });
    expect([told.slept.length, told.server.syncs.length]).toEqual([10, 11]);
    expect(told.outbox.holds()).toEqual([syncExamples.made('203')]);
    expect(told.outbox.notSaved()).toEqual([]);
    expect(await told.sync.lastSynced()).toBeUndefined();
  });

  it('AC-11-31, AC-05-20, AC-05-46 a record answered not saved, or kept in quarantine, stays on the phone and is shown in the server’s words; with the next read of the store it goes again once, the same text under the same fingerprint, and answered already saved (a person saved it as corrected) it leaves the list, still kept on the phone', async () => {
    const held = await anaSignedIn();
    const [unreadable, duplicate, fine] = [collection('301'), collection('302'), collection('303')];
    for (const record of [unreadable, duplicate, fine]) await held.outbox.keep(record);
    const held301 = NotSaved.heldForReview(NotSaved.namesNoRecord());
    const quarantined =
      'Ticket 101001: this ticket already has a collection. Not saved: kept in quarantine for review.';
    held.server.recordAnswer = (record) => {
      const id = syncedRecordId(record);
      if (id === syncedRecordId(unreadable)) {
        return { answer: 'NOT_SAVED', id, reason: held301.reason, message: held301.message };
      }
      if (id === syncedRecordId(duplicate)) {
        return {
          answer: 'QUARANTINED',
          id,
          reason: 'DUPLICATE_FIELD_EVENT',
          message: quarantined,
          heldBy: syncExamples.made('399'),
        };
      }
      return undefined;
    };
    await held.sync.run();
    expect(held301.message).toMatch(/Held on the server for review\.$/);
    expect(held.outbox.notSaved()).toEqual([
      {
        kind: 'record',
        id: syncedRecordId(unreadable),
        reason: 'NAMES_NO_RECORD',
        message: held301.message,
        record: unreadable,
      },
      {
        kind: 'record',
        id: syncedRecordId(duplicate),
        reason: 'DUPLICATE_FIELD_EVENT',
        message: quarantined,
        record: duplicate,
      },
    ]);
    // One sync: the kept two went once this time the store was read, and wait for the next.
    expect(recordsSent(held)).toEqual([[unreadable, duplicate, fine].map(syncedRecordId)]);
    expect(held.outbox.waiting()).toBe(0);

    // The next run reads the store and sends them again, as they went; a person has since saved
    // the one held as corrected.
    held.server.recordAnswer = (record) => {
      const id = syncedRecordId(record);
      return id === syncedRecordId(unreadable)
        ? { answer: 'ALREADY_SAVED', id }
        : {
            answer: 'QUARANTINED',
            id,
            reason: 'DUPLICATE_FIELD_EVENT',
            message: quarantined,
            heldBy: syncExamples.made('399'),
          };
    };
    await held.sync.run();
    const [, again] = held.server.syncs;
    expect(again?.records.map(syncedRecordId)).toEqual([unreadable, duplicate].map(syncedRecordId));
    expect(again?.records.map((one) => sentPrint(one))).toEqual(
      [unreadable, duplicate].map((one) => sentPrint(one)),
    );
    expect(sentCanonical(again?.records[0])).toBe(sentCanonical(unreadable));
    expect(held.outbox.notSaved().map(({ id }) => id)).toEqual([syncedRecordId(duplicate)]);
    expect(held.outbox.holds()).toEqual([syncExamples.made('302')]);
    // Once a time the store is read: the next sync of this read carries it no more.
    expect(held.outbox.sends().records).toEqual([]);
    // Every record stays on the phone, each marked as the server answered it.
    const kept = await held.store.readAll('records');
    expect(
      kept
        .map(({ value }) => value as { told: { answer: string } })
        .map(({ told }) => told.answer)
        .sort(),
    ).toEqual(['ALREADY_SAVED', 'QUARANTINED', 'SAVED']);
  });

  it('C181 the reports the phone holds go in the sync, ahead of its records, and not to their own endpoints; saved, they leave the phone; not saved, they are kept, shown and never sent again', async () => {
    const held = await anaSignedIn();
    await held.reports.keepUse('SIGN_IN_UNLOCK', null);
    await held.reports.keepUse('WRONG_TRY', null);
    await held.outbox.keep(collection('401'));
    await held.sync.run();
    const named = done(held.server.sent);
    expect(named).not.toContain('reportPasscodeUse');
    expect(named[0]).toBe('syncPhone');
    // Made in the same millisecond by the test's clock, so in either order (reports.ts).
    expect(held.server.syncs[0]?.passcodeUses.map(({ use }) => use).sort()).toEqual([
      'SIGN_IN_UNLOCK',
      'WRONG_TRY',
    ]);
    expect(await held.reports.held()).toEqual({ unplannedAssignments: [], passcodeUses: [] });

    held.server.notSaved = 'NOT_A_MONITOR';
    await held.reports.keepUse('WRONG_TRY', null);
    const unplanned = {
      ...syncExamples.unplanned,
      id: syncExamples.made('402'),
      projectId: p1.id,
      personId: kim.id,
    };
    await held.reports.keepUnplanned(unplanned);
    await held.sync.run();
    expect(held.outbox.notSaved()).toMatchObject([
      { kind: 'unplannedAssignment', id: unplanned.id, reason: 'NOT_A_MONITOR', message: null },
      { kind: 'passcodeUse', reason: 'NOT_A_MONITOR', message: null },
    ]);
    const syncs = held.server.syncs.length;
    await held.sync.run();
    expect(held.server.syncs.length).toBe(syncs + 1);
    expect([
      held.server.syncs.at(-1)?.passcodeUses,
      held.server.syncs.at(-1)?.unplannedAssignments,
    ]).toEqual([[], []]);
    expect(held.outbox.holds()).toHaveLength(2);
  });

  it('AC-05-06 an earlier monitor’s records not yet sent, archived when the phone was passed on, go in the background after the phone’s own: sent as theirs, never counted or shown to the next', async () => {
    const held = await anaSignedIn();
    await held.outbox.keep(collection('501'));
    await held.outbox.keep(collection('502'));
    // Handed to Kim under the passcode: Ana's unsent work is archived under her id.
    await held.setup.passedOn(kim.id);
    expect((await held.store.readAll('archivedQueues')).map(({ id }) => id).sort()).toEqual([
      `${ana.id}:${syncExamples.made('501')}`,
      `${ana.id}:${syncExamples.made('502')}`,
    ]);
    await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    await held.outbox.read();
    expect([held.outbox.waiting(), held.outbox.holds().length]).toEqual([0, 2]);
    await held.outbox.keep(collection('503'));
    held.server.recordAnswer = (record) => {
      const id = syncedRecordId(record);
      return id === syncExamples.made('502')
        ? { answer: 'NOT_SAVED', id, reason: 'NAMES_NO_RECORD', message: 'Not saved.' }
        : undefined;
    };
    await held.sync.run();
    expect(recordsSent(held)).toEqual([
      ['503', '501', '502'].map((last) => syncExamples.made(last)),
    ]);
    expect(
      held.server.syncs[0]?.records.map(
        (one) => one.record === 'FIELD_EVENT' && one.fieldEvent.monitorId,
      ),
    ).toEqual([ana.id, ana.id, ana.id]);
    // Not shown, but held: the turn-in names it.
    expect(held.outbox.notSaved()).toEqual([]);
    expect(held.outbox.turnsIn('x').holds.records).toEqual([syncExamples.made('502')]);
    const archived = await held.store.readAll('archivedQueues');
    expect(
      archived.map(({ value }) => (value as { told: { answer: string } }).told.answer).sort(),
    ).toEqual(['NOT_SAVED', 'SAVED']);
  });

  it('AC-11-17, C133, AC-05-47, AC-02-23 every sync says what the phone holds; what it brings is kept: the blocks of each series topped up, the master passcode’s check where the phone held another; and coming back to the front, the lists are read again only where the setup version moved', async () => {
    const held = await anaSignedIn();
    const block = { firstNumber: 101001, lastNumber: 102000, lastUsedNumber: 101006 };
    const later = { firstNumber: 103001, lastNumber: 104000, lastUsedNumber: 103002 };
    // The lists held say the phone has LOAD numbers, the last used 103002 of two blocks.
    const lists = await held.store.read('lists', 'assignment');
    await held.store.change([
      {
        shelf: 'lists',
        id: 'assignment',
        value: {
          ...(lists as object),
          lists: {
            ...towerLists,
            blocks: [
              { ...later, series: 'LOAD', status: 'ISSUED' },
              { ...block, series: 'LOAD', status: 'ISSUED' },
            ],
          },
        },
      },
    ]);
    held.server.numbers = (sync) =>
      sync.lastUsed.map(({ projectId, series }) => ({
        projectId,
        series,
        toppedUp: true,
        blocks: [block, { firstNumber: 102001, lastNumber: 103000, lastUsedNumber: null }],
      }));
    await held.sync.run('unlessMoved');
    const [sync] = held.server.syncs;
    expect(sync?.holds).toEqual({ masterPasscodeVersion: 1, listsProjectId: p1.id });
    expect(sync?.lastUsed).toEqual([{ projectId: p1.id, series: 'LOAD', lastUsedNumber: 103002 }]);
    expect((await held.lists.held())?.lists.blocks.map(({ firstNumber }) => firstNumber)).toEqual([
      101001, 102001,
    ]);
    // The same setup version: the lists not read again.
    expect(done(held.server.sent)).toEqual(['syncPhone']);
    expect(await held.sync.lastSynced()).toEqual(held.clock.now);

    // A check brought by the sync is kept by it, the lists not read: the phone held none here.
    await held.store.change([{ shelf: 'loginList', id: 'passcode', dropped: true }]);
    held.server.sent.length = 0;
    await held.sync.run('unlessMoved');
    expect(done(held.server.sent)).toEqual(['syncPhone']);
    expect((await held.loginList.passcode())?.version).toBe(1);

    // Moved: read again, then the login list.
    held.server.setupVersion = towerLists.setupVersion + 1;
    held.server.sent.length = 0;
    await held.sync.run('unlessMoved');
    expect(done(held.server.sent)).toEqual(['syncPhone', 'phoneLists', 'phoneLoginList']);

    // A phone just enrolled holds no lists and no check of the passcode: it says so, and is
    // brought the check, and keeps it.
    const fresh = await phone();
    await fresh.signingIn.signIn(ana.number, passwords[ana.id] ?? '');
    fresh.server.sent.length = 0;
    await fresh.sync.run();
    expect(fresh.server.syncs[0]?.holds).toEqual({
      masterPasscodeVersion: null,
      listsProjectId: null,
    });
    expect((await fresh.loginList.passcode())?.version).toBe(1);
  });

  it('AC-05-01, AC-11-16 an occasion that comes while a run is under way is never lost: one more run after it, shared by every occasion meanwhile, reading the lists where any of them asked', async () => {
    const held = await anaSignedIn();
    const [first, second, third] = [held.sync.run(), held.sync.run('unlessMoved'), held.sync.run()];
    await Promise.all([first, second, third]);
    expect(done(held.server.sent)).toEqual([
      'syncPhone',
      'phoneLists',
      'phoneLoginList',
      'syncPhone',
      'phoneLists',
      'phoneLoginList',
    ]);
  });

  it('AC-05-01 with no signal the run stops and everything stays; with signal again it goes', async () => {
    const held = await anaSignedIn();
    await held.outbox.keep(collection('601'));
    held.server.signal = false;
    expect(await held.sync.run()).toEqual({ kind: 'unreachable' });
    expect(held.outbox.holds()).toEqual([syncExamples.made('601')]);
    held.server.signal = true;
    expect(await held.sync.run()).toMatchObject({ kind: 'synced' });
    expect(held.outbox.holds()).toEqual([]);
  });
});
