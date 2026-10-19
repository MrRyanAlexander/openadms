// The phone syncs (ARCHITECTURE §9; adms-field-app §4A.5; BACKLOG 3.4.1, REQ-308, 308c, C130, C133,
// C152, C153, C181; AC-05-01, 06, AC-11-22, 29, 30; ADR-099, 240, 473, 474, 504, 524, 531, 578):
// **whenever it has a connection and somebody is signed in on it**, never with nobody (AC-11-22;
// the master user's sync is "Sync and turn in", task 3.4.3). A run sends one sync at a time from
// the outbox (outbox.ts), each answered before the next, until nothing more goes: the phone's own
// records first, then an earlier monitor's archived ones in the background (AC-05-06), with the
// reports it holds ahead of them (C181).
//
// - **No answer** (no signal, or what came back is no answer to what was sent): the run stops and
//   everything stays, to go again as it was at the next.
// - **Told to wait** (`429 LIMITED`, `503 BUSY`; AC-11-30): it waits the seconds it was told, and a
//   little more at random so phones told at once don't come back at once, then sends the same sync
//   again; told so ten times in a row (a fault, never a busy server: C152), the run stops, holding
//   everything.
// - **What a sync brings** besides its answers (ADR-473): the blocks of numbers of each series
//   reported, held from then on; the master passcode's check where the phone held another; and the
//   setup version of the project whose lists it holds, which makes it read its lists again where
//   it isn't theirs (`PhoneLists.readUnless`, AC-11-17); the login list is read with the lists.
// - **When it was last answered** is kept, and every screen says it ("Last synced").
// - **Then its photographs' files** (AC-11-32, 33; ADR-482, 579), after the records and the lists
//   (so a monitor's lists never wait behind megabytes): a question or a part at a time from the
//   outbox, each answered before the next, until none goes. Where it began a file before the app
//   last opened, it asks where the file stands first (`photoFileEndpoint`). A part is waited for
//   two minutes at most: past it, no answer, and the next part is half the size. No answer stops
//   the files and keeps them, to go on from where the server stood next time; told to wait, it
//   waits as a sync does; a file refused for itself (too large, not an image, not this phone's)
//   rests until the next run and the rest go.
//
// Which occasions read the lists whatever the sync brought (*agent default*, ADR-578): signing in,
// finding a connection and the monitor asking read them after the sync, as task 3.2.3 built (an
// assignment may have changed, a truck been certified); coming back to the front, which a phone
// does many times an hour, reads them only where the setup version moved or no assignment is taken.
import {
  photoFileEndpoint,
  sendPhotoFilePartEndpoint,
  syncPhoneEndpoint,
  waitAnswers,
  type ErrorCode,
} from '@open-adms/contracts';

import type { NotAnswered } from '../server.ts';
import type { PhoneStore } from '../store/phone-store.ts';
import type { ListsRead, PhoneLists } from './lists.ts';
import type { LoginList } from './login-list.ts';
import type { MonitorOnPhone } from './monitor.ts';
import type { PhoneOutbox } from './outbox.ts';

// Whether the lists are read after the sync whatever it brought, or only where it says they moved.
export type ListsAfter = 'read' | 'unlessMoved';

// What a run came to: synced (and the lists after it, read or the same, and the photographs'
// files, all sent or where they stopped), nobody signed in, or why it stopped, everything kept.
export type SyncRun =
  | {
      readonly kind: 'synced';
      readonly at: Date;
      readonly lists: ListsRead | 'same';
      readonly files: 'sent' | NotAnswered;
    }
  | { readonly kind: 'nobodySignedIn' }
  | NotAnswered;

// Told to wait so many times in a row, a run stops: a phone that waits as it is told is let through
// at the next stretch (ADR-524), so more is a fault (C152).
const waitsInARowAtMost = 10;
// How much longer than it was told a phone waits, at most, at random: a tenth.
const waitSpread = 0.1;

// How long a part of a file is waited for: past it, it is a poor signal's, and the next is
// smaller (ADR-579). A part of the most the server takes, 4 MiB, goes in it at 35 KB a second.
const partAnswerMs = 120_000;
// What the media endpoint refuses of a file itself: it rests till the next run, the rest go on.
const fileRefusals: readonly ErrorCode[] = [
  'TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'BAD_REQUEST',
  'NOT_FOUND',
];

const keptAnswers = 'keptAnswers';
const lastSyncId = 'lastSync';

export class PhoneSync {
  private readonly store: PhoneStore;
  private readonly outbox: PhoneOutbox;
  private readonly monitor: MonitorOnPhone;
  private readonly lists: PhoneLists;
  private readonly loginList: LoginList;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  // A run under way, and the one more asked while it is: occasions at once never each send the
  // same sync, and one that comes during a run is never lost (the lists it asks for read after).
  private running: Promise<SyncRun> | undefined;
  private again: { lists: ListsAfter; readonly run: Promise<SyncRun> } | undefined;

  constructor(
    parts: {
      readonly store: PhoneStore;
      readonly outbox: PhoneOutbox;
      readonly monitor: MonitorOnPhone;
      readonly lists: PhoneLists;
      readonly loginList: LoginList;
    },
    {
      now = () => new Date(),
      sleep = (milliseconds: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, milliseconds);
        }),
      random = Math.random,
    }: {
      readonly now?: () => Date;
      readonly sleep?: (milliseconds: number) => Promise<void>;
      readonly random?: () => number;
    } = {},
  ) {
    this.store = parts.store;
    this.outbox = parts.outbox;
    this.monitor = parts.monitor;
    this.lists = parts.lists;
    this.loginList = parts.loginList;
    this.now = now;
    this.sleep = sleep;
    this.random = random;
  }

  // A run now, by the monitor signed in; asked while one is under way, one more after it, which
  // every occasion asked meanwhile shares (reading the lists whatever, where any of them asked).
  run(lists: ListsAfter = 'read'): Promise<SyncRun> {
    if (this.running === undefined) {
      this.running = this.ran(lists).finally(() => {
        this.running = undefined;
      });
      return this.running;
    }
    if (this.again === undefined) {
      const again: { lists: ListsAfter; readonly run: Promise<SyncRun> } = {
        lists,
        run: this.running.then(() => {
          this.again = undefined;
          return this.run(again.lists);
        }),
      };
      this.again = again;
    } else if (lists === 'read') {
      this.again.lists = 'read';
    }
    return this.again.run;
  }

  // When a sync was last answered, by the phone's clock; never, before the first.
  async lastSynced(): Promise<Date | undefined> {
    const kept = await this.store.read(keptAnswers, lastSyncId);
    if (typeof kept !== 'object' || kept === null || Array.isArray(kept)) return undefined;
    const { answeredAt } = kept as Readonly<Record<string, unknown>>;
    return typeof answeredAt === 'string' && !Number.isNaN(Date.parse(answeredAt))
      ? new Date(answeredAt)
      : undefined;
  }

  private async ran(lists: ListsAfter): Promise<SyncRun> {
    const signedIn = await this.monitor.signedIn();
    if (signedIn === undefined) return { kind: 'nobodySignedIn' };
    await this.outbox.read();
    let setupVersion: number | null = null;
    let at: Date | undefined;
    for (let waitsInARow = 0, first = true; first || this.outbox.goesNext();) {
      const sync = this.outbox.sends();
      // Each sync after the first carries something, or the run is over: nothing is sent for
      // nothing.
      const carries =
        sync.unplannedAssignments.length +
        sync.passcodeUses.length +
        sync.records.length +
        sync.photos.length;
      if (!first && carries === 0) break;
      const reply = await this.monitor.ask(
        syncPhoneEndpoint,
        { json: sync },
        { carriesReports: true },
      );
      if (reply.kind !== 'answered') {
        await this.outbox.answered(undefined);
        const told = reply.kind === 'refused' ? reply.waitSeconds : undefined;
        const waits =
          reply.kind === 'refused' && (waitAnswers as readonly string[]).includes(reply.code);
        if (!waits || told === undefined || waitsInARow >= waitsInARowAtMost) return reply;
        waitsInARow += 1;
        await this.sleep(told * 1000 * (1 + this.random() * waitSpread));
        continue;
      }
      const read = await this.outbox.answered(reply.answer);
      if (read === null) return { kind: 'unreadable' };
      first = false;
      waitsInARow = 0;
      at = this.now();
      await this.lists.toppedUp(read.numbers);
      if (read.masterPasscode !== null) await this.loginList.keepPasscode(read.masterPasscode);
      setupVersion = read.setupVersion?.version ?? setupVersion;
      await this.store.change([
        { shelf: keptAnswers, id: lastSyncId, value: { answeredAt: at.toISOString() } },
      ]);
    }
    const afterwards =
      lists === 'unlessMoved' && signedIn.assignment !== null && setupVersion !== null
        ? await this.lists.readUnless(setupVersion)
        : await this.lists.read();
    if (afterwards !== 'same' && (afterwards.kind === 'taken' || afterwards.kind === 'none')) {
      await this.loginList.read(this.monitor);
    }
    const files = await this.sentFiles();
    return { kind: 'synced', at: at ?? this.now(), lists: afterwards, files };
  }

  // The photographs' files the outbox holds, a question or a part at a time, until none goes; or
  // where they stopped, everything kept. The sync just before carried the phone's reports.
  private async sentFiles(): Promise<'sent' | NotAnswered> {
    for (let waitsInARow = 0; ;) {
      const asked = this.outbox.asksWhereFileStands();
      const part = asked === null ? this.outbox.sendsFilePart() : null;
      const named = asked ?? part;
      if (named === null) return 'sent';
      const ids = { photoId: named.photoId, file: named.file };
      const reply =
        part === null
          ? await this.monitor.ask(photoFileEndpoint, { ids }, { carriesReports: true })
          : await this.monitor.ask(
              sendPhotoFilePartEndpoint,
              {
                ids,
                query: { offset: String(part.offset), length: String(part.length) },
                bytes: part.bytes,
                answerMs: partAnswerMs,
              },
              { carriesReports: true },
            );
      if (reply.kind === 'answered') {
        waitsInARow = 0;
        // What it can't read is no answer: the run stops there rather than ask again for ever.
        const read =
          part === null
            ? await this.outbox.fileStandsAnswered(reply.answer)
            : (await this.outbox.filePartAnswered(reply.answer)) !== null;
        if (!read) return { kind: 'unreadable' };
        continue;
      }
      if (reply.kind === 'refused' && fileRefusals.includes(reply.code)) {
        await this.outbox.fileTurnedAway();
        continue;
      }
      const told = reply.kind === 'refused' ? reply.waitSeconds : undefined;
      const waits =
        reply.kind === 'refused' && (waitAnswers as readonly string[]).includes(reply.code);
      if (waits && told !== undefined && waitsInARow < waitsInARowAtMost) {
        this.outbox.fileToldToWait();
        waitsInARow += 1;
        await this.sleep(told * 1000 * (1 + this.random() * waitSpread));
        continue;
      }
      // No answer, or no answer it can read: what was sent is taken for nothing.
      if (part === null) await this.outbox.fileStandsAnswered(undefined);
      else await this.outbox.filePartAnswered(undefined);
      return reply;
    }
  }
}
