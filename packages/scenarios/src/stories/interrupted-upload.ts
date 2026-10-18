// The twenty-first story (BACKLOG 2.6.4 part 4, C137, C138; ADR-101, 481…483; spec/acceptance/
// 05-sync.md AC-05-09; 04-field-capture.md AC-04-77; 10-api-and-sync.md AC-10-48;
// spec/THREAT-MODEL.md T-25; REQ-203): a photograph's file goes up after the records, in
// parts, and an interrupted upload goes on from where it stopped. The phone syncs through the
// API's own `Sync` and sends its files to the API's own `PhotoFiles`, on the story's own
// database, keeping them in the story's own store.
//
// Monday 12 October 2026: Ana Brooks collects 101001 at 14 Heron St on P1-COL-1 and takes three
// photographs with it: the pile, the pile from the street, the truck's bed. The phone's signal at
// the curb is poor, so it sends parts of 4 KiB. At 12:05 it finds signal and syncs: the records,
// then the files, until the signal drops after the pile's first part. At 12:20 the signal is
// back and the pile goes on from where it stopped; the street's first part goes, and the signal
// drops again. Over lunch the API is started again, and holds none of the street's file; at 13:00
// the phone is told so, and starts that file again. The bed's file was changed on the phone after
// it was fingerprinted: the server sets it aside for a person, and the phone keeps it. The back
// office reads the pile's file back.
//
// Not here: a person's resolution of a file set aside (Phase 4); the phone that asks where a file
// stands after it restarts (Phase 3, the field app).
import { PhotographFiles } from '@open-adms/api';
import type { FilePartSent } from '@open-adms/contracts';
import { deviceKeyActorId } from '@open-adms/db';
import { uuidv7 } from '@open-adms/domain';

import { made, NoSignal, type PhoneServer } from '../device.ts';
import type { Story } from '../runner.ts';
import { assigned, firstBlocks, taken } from './board.ts';
import { p1TimeZone as timeZone, setUpP1 } from './p1.ts';

const monday = (time: string): string => `2026-10-12T${time}:00-04:00`;

// A part of 4 KiB, on a poor signal; each photograph a file of 10,000 bytes, so three parts.
const partBytes = 4096;
const fileBytes = 10_000;

export const interruptedUpload: Story = {
  name: 'interrupted-upload',
  title:
    'A photograph’s file goes up after the records, in parts: the signal drops and it goes on from where it stopped; the API starts again and the phone sends that file again; a file changed on the phone is set aside, never kept as the photograph’s; the back office reads back the one kept',
  timeZone,
  start: monday('06:30'),

  async run(story) {
    const { api, clock } = story;

    story.at(
      monday('06:30'),
      'Dana Reyes has set up P1 and enrolled P1-COL-1; at the yard Ana Brooks signs in, and the phone takes her assignment and a block of load numbers',
    );
    const phone = await story.enrolled('P1-COL-1');
    const dana = uuidv7(clock.now());
    const p1 = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      return (await setUpP1(tx, story.policy)).project;
    });
    const ana = await story.monitor('Ana Brooks', phone.id);
    const collections = await assigned(api, clock, dana, {
      workDate: '2026-10-12',
      projectId: p1,
      personId: ana.id,
      fieldEventKinds: ['COLLECTION'],
      deviceId: phone.id,
    });
    await firstBlocks(story, phone.id, timeZone, p1, ['LOAD']);
    if ((await taken(story, ana, phone.id)) !== collections) {
      throw new Error('P1-COL-1 took another assignment than Ana’s.');
    }
    const anasPhone = story.phone({
      name: 'P1-COL-1',
      deviceId: phone.id,
      monitorId: ana.id,
      assignmentId: collections,
      projectId: p1,
      lists: await story.lists.held({ assignmentId: collections, deviceId: phone.id }),
      timeZone,
    });
    anasPhone.sendsPartsOf(partBytes);

    story.at(monday('08:15'), 'Ana scans the truck’s badge at 14 Heron St, offline');
    const started = anasPhone.begin('LOAD', 'COLLECTION', '730416');
    story.at(monday('08:40'), 'She completes 101001 and takes three photographs with it');
    const completed = anasPhone.complete(started, { number: made });
    if (!completed.saved) throw new Error('The collection was not saved on the phone.');
    const of = { kind: 'FIELD_EVENT', id: completed.event.id } as const;
    const pile = anasPhone.photograph({ of, bytes: fileBytes });
    const street = anasPhone.photograph({ of, bytes: fileBytes });
    const bed = anasPhone.photograph({ of, bytes: fileBytes });
    // What the phone sends of the pile, as it shrank it: the bytes its fingerprint is of.
    const pileBytes = Buffer.from(anasPhone.fileOf(pile.id));
    // The phone's gallery wrote the bed's file again after it was fingerprinted: what it holds
    // now is a JPEG of the same size whose SHA-256 is no longer the record's.
    const changed = Buffer.from(anasPhone.fileOf(bed.id));
    changed[changed.length - 1] = (changed.at(-1) ?? 0) ^ 0xff;
    anasPhone.swapFile(bed.id, changed);
    const names = new Map([
      [pile.id, 'the pile'],
      [street.id, 'the street'],
      [bed.id, 'the bed'],
    ]);

    // Where each part went, and how it was answered: the server's own words, or no signal.
    const parts: [string | undefined, number, string][] = [];
    const through = (server: PhoneServer, signalFor = Infinity): PhoneServer => {
      let sent = 0;
      return {
        received: (deviceId, sync) => server.received(deviceId, sync),
        filePart: async (deviceId, part: FilePartSent) => {
          sent += 1;
          if (sent > signalFor) {
            parts.push([names.get(part.photoId), part.offset, 'NO SIGNAL']);
            throw new NoSignal();
          }
          const answer = (await server.filePart(deviceId, part)) as { upload: string };
          parts.push([names.get(part.photoId), part.offset, answer.upload]);
          return answer;
        },
      };
    };
    // Each photograph's upload time, in the order taken (all three at 08:40).
    const photos = async () => {
      const rows = await api.photo.findMany();
      return [pile, street, bed].map(({ id }) => [
        names.get(id),
        rows.find((row) => row.id === id)?.uploadedAt?.toISOString() ?? null,
      ]);
    };
    const placeOf = async (photoId: string): Promise<string> =>
      (await api.photo.findUniqueOrThrow({ where: { id: photoId } })).objectKey;

    // ------------------------------------------------------------------------------------------
    story.at(
      monday('12:05'),
      'At the curb P1-COL-1 finds a weak signal and syncs: the records, then the photographs’ files',
    );
    const answered = await anasPhone.sync(through(story.server, 1));
    story.check(
      'AC-05-09 the collection and its three photographs’ records are saved first; then the pile’s file goes up in parts of 4 KiB after them, and the signal drops after the first',
      [
        answered,
        anasPhone.answers.map(({ answer }) => answer.answer),
        parts.splice(0),
        anasPhone.filesWaiting.map(({ name, from }) => [names.get(name.split(' ')[0] ?? ''), from]),
      ],
      [
        4,
        ['SAVED', 'SAVED', 'SAVED', 'SAVED'],
        [
          ['the pile', 0, 'RECEIVING'],
          ['the pile', 4096, 'NO SIGNAL'],
        ],
        [
          ['the pile', 4096],
          ['the street', 0],
          ['the bed', 0],
        ],
      ],
    );
    story.check(
      'AC-05-09 nothing is kept of a file not yet whole: no record says a file arrived, and the store holds nothing; the part taken is held only in the API’s memory',
      [await photos(), story.media.keys],
      [
        [
          ['the pile', null],
          ['the street', null],
          ['the bed', null],
        ],
        [],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      monday('12:20'),
      'The signal is back for a moment: the phone goes on with its files, and loses it again',
    );
    await anasPhone.upload(through(story.server, 3));
    const pilePlace = await placeOf(pile.id);
    const kept = await story.media.read(pilePlace, story.policy.mediaFileBytesAtMost);
    story.check(
      'AC-05-09 the pile goes on from where it stopped, never from its first byte; whole, the server finds its SHA-256 is the one the phone gave at capture, and keeps it once at its place, its upload time written; the street’s first part goes, and the signal drops',
      [
        parts.splice(0),
        await photos(),
        kept?.bytes.equals(pileBytes) === true && kept.contentType === 'image/jpeg',
      ],
      [
        [
          ['the pile', 4096, 'RECEIVING'],
          ['the pile', 8192, 'KEPT'],
          ['the street', 0, 'RECEIVING'],
          ['the street', 4096, 'NO SIGNAL'],
        ],
        [
          ['the pile', '2026-10-12T16:20:00.000Z'],
          ['the street', null],
          ['the bed', null],
        ],
        true,
      ],
    );
    const uploaded = await api.auditRecord.findMany({
      where: { tableName: 'photo', operation: 'UPDATE' },
    });
    story.check(
      'AC-04-77 its upload time is written once, as the phone’s own act: the device key’s, from that phone',
      uploaded.map((row) => [
        names.get(row.recordId),
        row.changedFields,
        row.actorId === deviceKeyActorId,
        row.source,
        row.deviceId === phone.id,
      ]),
      [['the pile', ['uploaded_at'], true, 'DEVICE', true]],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      monday('13:00'),
      'Over lunch the API was started again; Ana’s phone finds signal and goes on',
    );
    await anasPhone.upload(through(story.phonesOn(clock).server));
    story.check(
      'AC-05-09, ADR-482 (2) the API started again holds none of the street’s file: told so, the phone sends it again from its first byte, and it is kept',
      [parts.splice(0, 4), (await photos())[1]],
      [
        [
          ['the street', 4096, 'RECEIVING'],
          ['the street', 0, 'RECEIVING'],
          ['the street', 4096, 'RECEIVING'],
          ['the street', 8192, 'KEPT'],
        ],
        ['the street', '2026-10-12T17:00:00.000Z'],
      ],
    );
    const setAside = await api.setAsideFile.findMany();
    const bedPlace = await placeOf(bed.id);
    story.check(
      'T-25, ADR-482 (5) the bed’s file, changed on the phone after it was fingerprinted, is set aside on the server for a person, once, at a place of its own beside the photograph’s, and never kept as the photograph’s; the phone sends it again from its first byte, is told so again, and keeps it',
      [
        parts.splice(0),
        setAside.map((row) => [
          names.get(row.photoId),
          row.file,
          row.deviceId === phone.id,
          row.receivedSha256 === bed.uploadedSha256,
          row.byteCount,
          row.contentType,
          row.objectKey.startsWith(`${bedPlace}.set-aside/`),
        ]),
        (await photos())[2],
        anasPhone.holdsFiles.map((name) => names.get(name.split(' ')[0] ?? '')),
      ],
      [
        [
          ['the bed', 0, 'RECEIVING'],
          ['the bed', 4096, 'RECEIVING'],
          ['the bed', 8192, 'NOT_MATCHED'],
          ['the bed', 0, 'RECEIVING'],
          ['the bed', 4096, 'RECEIVING'],
          ['the bed', 8192, 'NOT_MATCHED'],
        ],
        [['the bed', 'PHOTO', true, false, 10_000, 'image/jpeg', true]],
        ['the bed', null],
        ['the bed'],
      ],
    );
    story.check(
      'AC-04-77, AC-10-49 each photograph kept is one object at the place the server made for it; the set-aside file is beside the bed’s, and nothing is at the bed’s own',
      [...story.media.keys].sort(),
      [pilePlace, await placeOf(street.id), setAside[0]?.objectKey ?? ''].sort(),
    );

    // ------------------------------------------------------------------------------------------
    story.at(monday('15:30'), 'At the office Luis Ortega opens 101001 and its photographs');
    const files = new PhotographFiles(api, {
      media: story.media,
      fileBytesAtMost: story.policy.mediaFileBytesAtMost,
    });
    const read = await files.kept(pile.id, 'photo');
    const notYet = await files.kept(bed.id, 'photo').then(
      () => 'read',
      (refused: unknown) => (refused instanceof Error ? refused.message : String(refused)),
    );
    story.check(
      'AC-10-48 the back office reads the pile’s file back as the very bytes the phone sent, under the type their first bytes said; the bed’s, never kept, is not found',
      [read.bytes.equals(pileBytes), read.contentType, notYet],
      [true, 'image/jpeg', 'NOT_FOUND'],
    );
  },
};
