// The phone sends its photographs' files (src/phone/outbox.ts, sync.ts; BACKLOG 3.4.2, REQ-316's
// sync half, C137, C138, C139, C168; AC-11-32, 33; ADR-481…483, 526 (4), 579): after the records
// and the lists, a part at a time, never larger than the server takes and smaller on a poor
// signal; one file's bytes read at a time; opened again mid-file, it asks the server where the
// file stands and goes on from there; a photograph answered not saved because its record isn't
// saved goes again once its record is saved; a held record's photographs go. Here against a
// server of the test's own; against the real API, in a real browser, e2e/photo-files.e2e.ts.
import {
  syncedRecordId,
  syncExamples,
  type SyncedPhoto,
  type SyncedRecord,
} from '@open-adms/contracts';
import { NotSaved } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { ana, done, heldP1, p1, passwords } from './phone-world.ts';

const collection = (last: string): SyncedRecord => ({
  record: 'FIELD_EVENT',
  fieldEvent: {
    ...syncExamples.collection,
    id: syncExamples.made(last),
    monitorId: ana.id,
    projectId: p1.id,
  },
});

const photoOf = (record: SyncedRecord, last: string, more: Partial<SyncedPhoto> = {}) => ({
  ...syncExamples.pilePhoto,
  id: syncExamples.made(last),
  projectId: p1.id,
  takenById: ana.id,
  owner: { kind: 'FIELD_EVENT' as const, id: syncedRecordId(record) },
  ...more,
});

// A photograph's file as a phone's camera writes one: a JPEG's first bytes, then the rest.
const jpeg = (length: number, seed = 1): Uint8Array =>
  Uint8Array.from({ length }, (_, at) => [0xff, 0xd8, 0xff, 0xe1][at] ?? (at * 31 + seed) % 256);

// Ana signed in on the phone that holds P1's lists, parts of so many bytes at most.
async function anaSignedIn(partBytes?: number) {
  const held = await heldP1(undefined, partBytes === undefined ? undefined : { partBytes });
  expect(await held.signingIn.signIn(ana.number, passwords[ana.id] ?? '')).toMatchObject({
    kind: 'signedIn',
  });
  held.server.sent.length = 0;
  return held;
}

type Held = Awaited<ReturnType<typeof anaSignedIn>>;
const parts = (held: Held) =>
  held.server.sent
    .filter(({ endpoint }) => endpoint === 'sendPhotoFilePart')
    .map(({ query, bytes }) => [Number(query?.['offset']), bytes]);

describe('the phone sends its photographs’ files', () => {
  it('AC-11-32, AC-11-33 its records go first, then its lists, then each file a part at a time, no part larger than the server takes, each where the last ended, until kept; the file then leaves the phone', async () => {
    const held = await anaSignedIn();
    const record = collection('701');
    const photo = photoOf(record, '702');
    const bytes = jpeg(200_000);
    await held.outbox.keep(record);
    expect(await held.outbox.keepPhoto(photo, [{ file: 'photo', bytes }])).toBeUndefined();
    expect(held.outbox.filesWaiting()).toBe(0);

    expect(await held.sync.run()).toMatchObject({ kind: 'synced', files: 'sent' });
    expect(done(held.server.sent)).toEqual([
      'syncPhone',
      'phoneLists',
      'phoneLoginList',
      'sendPhotoFilePart',
      'sendPhotoFilePart',
      'sendPhotoFilePart',
      'sendPhotoFilePart',
    ]);
    expect(parts(held)).toEqual([
      [0, 65_536],
      [65_536, 65_536],
      [131_072, 65_536],
      [196_608, 3392],
    ]);
    const sent = held.server.sent.filter(({ endpoint }) => endpoint === 'sendPhotoFilePart');
    expect(sent.every(({ query }) => query?.['length'] === '200000')).toBe(true);
    expect(sent.every(({ ids }) => ids?.['photoId'] === photo.id && ids['file'] === 'photo')).toBe(
      true,
    );
    // Each waited for two minutes at most, with Ana's session beside the phone's token.
    expect(
      sent.every(({ answerMs, session }) => answerMs === 120_000 && session === 'ana-online'),
    ).toBe(true);
    expect(held.server.kept.get(`${photo.id} photo`)).toEqual(bytes);
    expect([held.outbox.holdsFiles(), held.outbox.filesWaiting()]).toEqual([[], 0]);
    expect(await held.store.readAll('photoFiles')).toEqual([]);
    // Nothing more goes at the next run.
    held.server.sent.length = 0;
    await held.sync.run();
    expect(done(held.server.sent)).toEqual(['syncPhone', 'phoneLists', 'phoneLoginList']);
  });

  it('AC-11-33 the store keeps each file on a shelf of its own and a note beside its photograph, so a read of the store reads no file: one file’s bytes are read at a time, the one going', async () => {
    const held = await anaSignedIn();
    const record = collection('711');
    await held.outbox.keep(record);
    const files = [jpeg(70_000, 1), jpeg(90_000, 2), jpeg(80_000, 3)];
    for (const [place, bytes] of files.entries()) {
      await held.outbox.keepPhoto(photoOf(record, String(712 + place)), [{ file: 'photo', bytes }]);
    }
    const photographs = await held.store.readAll('photographs');
    expect(photographs.some(({ value }) => value instanceof Uint8Array)).toBe(false);
    expect(
      photographs.filter(({ id }) => id.startsWith('file:')).map(({ value }) => value),
    ).toEqual([
      { length: 70_000, begun: false },
      { length: 90_000, begun: false },
      { length: 80_000, begun: false },
    ]);
    const read: string[] = [];
    const { store } = held;
    const reading = store.read.bind(store);
    store.read = (shelf, id) => {
      if (shelf === 'photoFiles') read.push(id);
      return reading(shelf, id);
    };
    await held.sync.run();
    expect(read).toEqual(['712', '713', '714'].map((last) => `${syncExamples.made(last)} photo`));
    expect(held.server.kept.size).toBe(3);
  });

  it('AC-11-33 a part goes smaller on a poor signal: sized to go in about ten seconds at the speed the last went, never under 64 KiB nor over the most the server takes; one with no answer halves the next', async () => {
    const held = await anaSignedIn(1_048_576);
    const record = collection('721');
    await held.outbox.keep(record);
    await held.outbox.keepPhoto(photoOf(record, '722'), [
      { file: 'photo', bytes: jpeg(3_000_000) },
    ]);
    // The signal carries 50 KiB a second: a mebibyte takes twenty seconds.
    held.server.onPart = ({ bytes }) => {
      held.clock.now = new Date(held.clock.now.getTime() + (bytes / 51_200) * 1000);
    };
    await held.sync.run();
    expect(parts(held).map(([, bytes]) => bytes)).toEqual([
      1_048_576, 512_000, 512_000, 512_000, 415_424,
    ]);

    // A part with no answer: the next goes at half the size, from where the server stood.
    const poor = await anaSignedIn(1_048_576);
    const other = collection('723');
    await poor.outbox.keep(other);
    await poor.outbox.keepPhoto(photoOf(other, '724'), [{ file: 'photo', bytes: jpeg(3_000_000) }]);
    poor.server.onPart = ({ offset }) => {
      if (offset > 0) poor.server.signal = false;
    };
    expect(await poor.sync.run()).toMatchObject({ files: { kind: 'unreachable' } });
    poor.server.onPart = () => undefined;
    poor.server.signal = true;
    poor.server.sent.length = 0;
    await poor.sync.run();
    expect(parts(poor)).toEqual([
      [2_097_152, 524_288],
      [2_621_440, 378_560],
    ]);

    // However poor, never under 64 KiB: at a kibibyte a second, ten seconds' worth is less.
    const worst = await anaSignedIn(1_048_576);
    const third = collection('725');
    await worst.outbox.keep(third);
    await worst.outbox.keepPhoto(photoOf(third, '726'), [
      { file: 'photo', bytes: jpeg(1_200_000) },
    ]);
    worst.server.onPart = ({ bytes }) => {
      worst.clock.now = new Date(worst.clock.now.getTime() + (bytes / 1024) * 1000);
    };
    await worst.sync.run();
    expect(parts(worst).map(([, bytes]) => bytes)).toEqual([1_048_576, 65_536, 65_536, 20_352]);
  });

  it('AC-11-33 opened again after it stopped mid-file, it asks the server where the file stands before it sends more, and goes on from there; told the server holds none of it, it starts the file again', async () => {
    const held = await anaSignedIn();
    const record = collection('731');
    const photo = photoOf(record, '732');
    const bytes = jpeg(200_000);
    await held.outbox.keep(record);
    await held.outbox.keepPhoto(photo, [{ file: 'photo', bytes }]);
    // Two parts taken, then the signal goes.
    held.server.onPart = ({ offset }) => {
      if (offset >= 65_536) held.server.signal = false;
    };
    await held.sync.run();
    expect(parts(held)).toEqual([
      [0, 65_536],
      [65_536, 65_536],
      [131_072, 65_536],
    ]);
    // A part has gone: the store says so, and nothing of where the server stands.
    expect(await held.store.read('photographs', `file:${photo.id} photo`)).toEqual({
      length: 200_000,
      begun: true,
    });

    // The app stops, and opens again with signal.
    held.server.onPart = () => undefined;
    held.server.signal = true;
    held.server.sent.length = 0;
    const again = await held.reopened();
    expect(again.outbox.holdsFiles()).toEqual([`${photo.id} photo`]);
    expect(again.outbox.sendsFilePart()).toBeNull();
    await again.sync.run();
    expect(done(held.server.sent).slice(3)).toEqual([
      'photoFile',
      'sendPhotoFilePart',
      'sendPhotoFilePart',
    ]);
    expect(held.server.sent[3]?.ids).toEqual({ photoId: photo.id, file: 'photo' });
    expect(parts(held)).toEqual([
      [131_072, 65_536],
      [196_608, 3392],
    ]);
    expect(held.server.kept.get(`${photo.id} photo`)).toEqual(bytes);

    // Opened again where the server let the parts go (it holds them in memory alone): it starts
    // the file again.
    const other = collection('733');
    const second = photoOf(other, '734');
    await again.outbox.keep(other);
    await again.outbox.keepPhoto(second, [{ file: 'photo', bytes: jpeg(200_000, 4) }]);
    held.server.onPart = ({ offset }) => {
      if (offset > 0) held.server.signal = false;
    };
    await again.sync.run();
    held.server.filesTaken.clear();
    held.server.onPart = () => undefined;
    held.server.signal = true;
    held.server.sent.length = 0;
    const third = await held.reopened();
    await third.sync.run();
    expect(done(held.server.sent).slice(3, 4)).toEqual(['photoFile']);
    expect(parts(held)).toEqual([
      [0, 65_536],
      [65_536, 65_536],
      [131_072, 65_536],
      [196_608, 3392],
    ]);
    expect(third.outbox.holdsFiles()).toEqual([]);
  });

  it('AC-11-32, C137 a photograph answered not saved because its record isn’t saved on the server is kept with its file and shown; once its record is answered saved it goes again, is saved, and its file goes', async () => {
    const held = await anaSignedIn();
    const record = collection('741');
    const photo = photoOf(record, '742');
    await held.outbox.keep(record);
    await held.outbox.keepPhoto(photo, [{ file: 'photo', bytes: jpeg(1000) }]);
    const ownerNotSaved = NotSaved.heldForReview(NotSaved.ownerNotSaved());
    let first = true;
    held.server.photoAnswer = ({ id }) => {
      if (!first) return undefined;
      first = false;
      return { answer: 'NOT_SAVED', id, reason: 'OWNER_NOT_SAVED', message: ownerNotSaved.message };
    };
    await held.sync.run();
    // The record was answered saved in the first sync: the photograph went again in the second.
    expect(
      held.server.syncs.map(({ records, photos }) => [records.length, photos.map(({ id }) => id)]),
    ).toEqual([
      [1, [photo.id]],
      [0, [photo.id]],
    ]);
    expect(held.outbox.notSaved()).toEqual([]);
    expect(held.server.kept.has(`${photo.id} photo`)).toBe(true);

    // One whose record isn't on this phone: kept and shown, its file kept; sent again once a run.
    const elsewhere = photoOf(collection('743'), '744');
    await held.outbox.keepPhoto(elsewhere, [{ file: 'photo', bytes: jpeg(1000, 2) }]);
    held.server.photoAnswer = ({ id }) => ({
      answer: 'NOT_SAVED',
      id,
      reason: 'OWNER_NOT_SAVED',
      message: ownerNotSaved.message,
    });
    held.server.syncs.length = 0;
    held.server.sent.length = 0;
    await held.sync.run();
    await held.sync.run();
    expect(held.server.syncs.map(({ photos }) => photos.map(({ id }) => id))).toEqual([
      [elsewhere.id],
      [elsewhere.id],
    ]);
    expect(done(held.server.sent)).not.toContain('sendPhotoFilePart');
    expect(held.outbox.notSaved()).toEqual([
      {
        kind: 'photo',
        id: elsewhere.id,
        reason: 'OWNER_NOT_SAVED',
        message: ownerNotSaved.message,
      },
    ]);
    expect(held.outbox.holdsFiles()).toEqual([`${elsewhere.id} photo`]);
    // Not saved for another reason, it is not sent again.
    const other = photoOf(collection('745'), '746');
    await held.outbox.keepPhoto(other, []);
    const namesNoRecord = NotSaved.heldForReview(NotSaved.namesNoRecord());
    held.server.photoAnswer = ({ id }) =>
      id === other.id
        ? { answer: 'NOT_SAVED', id, reason: 'NAMES_NO_RECORD', message: namesNoRecord.message }
        : { answer: 'NOT_SAVED', id, reason: 'OWNER_NOT_SAVED', message: ownerNotSaved.message };
    held.server.syncs.length = 0;
    await held.sync.run();
    await held.sync.run();
    expect(held.server.syncs.map(({ photos }) => photos.map(({ id }) => id))).toEqual([
      [other.id, elsewhere.id],
      [elsewhere.id],
    ]);
  });

  it('C139, ADR-526 (4) a photograph of a record the server holds for a person is answered saved and its files go, the record still shown as not saved', async () => {
    const held = await anaSignedIn();
    const record = collection('751');
    const photo = photoOf(record, '752');
    await held.outbox.keep(record);
    await held.outbox.keepPhoto(photo, [{ file: 'photo', bytes: jpeg(1000) }]);
    const notSaved = NotSaved.heldForReview(NotSaved.namesNoRecord());
    held.server.recordAnswer = (sent) => ({
      answer: 'NOT_SAVED',
      id: syncedRecordId(sent),
      reason: notSaved.reason,
      message: notSaved.message,
    });
    await held.sync.run();
    expect(held.server.kept.has(`${photo.id} photo`)).toBe(true);
    expect(held.outbox.notSaved().map(({ kind, id }) => [kind, id])).toEqual([
      ['record', syncedRecordId(record)],
    ]);
    expect(held.outbox.holdsFiles()).toEqual([]);
  });

  it('ADR-482 (5) a file answered not the one fingerprinted goes again from its first byte, and rests till the next run where it is answered so twice; a file the server refuses for itself rests too, and the others go; told to wait, it waits and sends the same part again', async () => {
    const held = await anaSignedIn();
    const record = collection('761');
    const [one, two] = [photoOf(record, '762'), photoOf(record, '763')];
    await held.outbox.keep(record);
    await held.outbox.keepPhoto(one, [{ file: 'photo', bytes: jpeg(1000, 1) }]);
    await held.outbox.keepPhoto(two, [{ file: 'photo', bytes: jpeg(1000, 2) }]);
    held.server.unmatched.add(`${one.id} photo`);
    held.server.fileWaits.push({ code: 'LIMITED', seconds: 4 });
    await held.sync.run();
    expect(held.slept).toEqual([4200]);
    expect(
      held.server.sent
        .filter(({ endpoint }) => endpoint === 'sendPhotoFilePart')
        .map(({ ids }) => ids?.['photoId']),
    ).toEqual([one.id, one.id, one.id, two.id]);
    expect(held.server.kept.size).toBe(2);

    // Twice not matched: it rests, the other goes, and it goes again at the next run.
    const twice = await anaSignedIn();
    const other = collection('764');
    const [three, four] = [photoOf(other, '765'), photoOf(other, '766')];
    await twice.outbox.keep(other);
    await twice.outbox.keepPhoto(three, [{ file: 'photo', bytes: jpeg(1000, 3) }]);
    await twice.outbox.keepPhoto(four, [{ file: 'photo', bytes: jpeg(1000, 4) }]);
    twice.server.unmatched.add(`${three.id} photo`);
    const matching = twice.server.unmatched;
    twice.server.onPart = ({ name }) => {
      if (name === `${three.id} photo`) matching.add(name);
    };
    await twice.sync.run();
    expect(twice.outbox.holdsFiles()).toEqual([`${three.id} photo`]);
    expect(twice.server.kept.has(`${four.id} photo`)).toBe(true);
    twice.server.onPart = () => undefined;
    twice.server.unmatched.clear();
    await twice.sync.run();
    expect(twice.outbox.holdsFiles()).toEqual([]);

    // Refused for itself: it rests, kept, and the run ends with the rest sent.
    const refused = await anaSignedIn();
    const third = collection('767');
    await refused.outbox.keep(third);
    await refused.outbox.keepPhoto(photoOf(third, '768'), [{ file: 'photo', bytes: jpeg(1000) }]);
    refused.server.fileRefusal = 'UNSUPPORTED_MEDIA_TYPE';
    expect(await refused.sync.run()).toMatchObject({ kind: 'synced', files: 'sent' });
    expect(refused.outbox.holdsFiles()).toHaveLength(1);
  });

  it('a photograph’s file that could never go is never kept: an empty one, one larger than the server takes, or a depth file where its photograph gives no depth file’s fingerprint', async () => {
    const held = await anaSignedIn();
    const record = collection('771');
    const words = async (photo: SyncedPhoto, file: 'photo' | 'depth', bytes: Uint8Array) =>
      (await held.outbox.keepPhoto(photo, [{ file, bytes }]))?.message;
    expect(await words(photoOf(record, '772'), 'photo', new Uint8Array())).toBe(
      'Not saved: this record can’t be read: its photo file holds nothing.',
    );
    expect(await words(photoOf(record, '773'), 'photo', jpeg(33_554_433))).toBe(
      'Not saved: this record can’t be read: its photo file is larger than the server takes, 32 MiB.',
    );
    expect(await words(photoOf(record, '774'), 'depth', jpeg(100))).toBe(
      'Not saved: this record can’t be read: a depth file goes only where its fingerprint is given.',
    );
    expect(await held.store.readAll('photographs')).toEqual([]);
    expect(await held.store.readAll('photoFiles')).toEqual([]);
  });
});
