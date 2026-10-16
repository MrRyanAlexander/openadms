// A photograph's files, sent by the phone that took it: the media endpoint (ARCHITECTURE §6
// "Uploads", §9 (5), §11; spec/acceptance/04-field-capture.md AC-04-77; 05-sync.md AC-05-09;
// 10-api-and-sync.md AC-10-47…49; spec/THREAT-MODEL.md T-25; BACKLOG 2.6.4, C84 (12), C86, C136,
// C137; ADR-101, 480…482; REQ-203). The real process, in this test's own memory, on the
// installation's database as `adms_api`, keeping files in the local stack's own object store
// under the API's identity: it needs `pnpm ready`. Each test's database work is undone; its
// files, which the API's identity can't delete, are taken away by the stack's administrator.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  endpoints,
  filePartMediaType,
  photoFileAnswerSchema,
  photoFileEndpoint,
  photographFileEndpoint,
  sendPhotoFilePartEndpoint,
  syncAnsweredSchema,
  syncExamples,
  syncPhoneEndpoint,
  type PhotoFileAnswer,
  type SyncedFieldEvent,
  type SyncedPhoto,
} from '@open-adms/contracts';
import { deviceKeyActorId, type Database } from '@open-adms/db';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MediaStore } from '../src/media/media-store.ts';
import { Receiving } from '../src/media/receiving.ts';
import { installationPolicy } from '../src/policy.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import {
  asTheStacksAdministrator,
  installationMedia,
  tidied,
  versionsUnder,
} from './support/media.ts';
import { enrolledPhone, provenWithPasscode } from './support/phones.ts';
import {
  danasEmail,
  long,
  longer,
  luissEmail,
  worldOn,
  type Answer,
  type People,
  type Served,
} from './support/served.ts';
import { p1, told, viewerSignsIn } from './support/setup.ts';

let db: Database;
let store: MediaStore;
let administrator: S3Client;
// Every project a test made: its files are taken away after the run.
const projects = new Set<string>();

beforeAll(() => {
  db = openInstallation(installationSettings());
  store = new MediaStore(installationMedia());
  administrator = asTheStacksAdministrator(installationMedia());
});
afterAll(async () => {
  for (const projectId of projects) {
    await tidied(administrator, installationMedia(), `projects/${projectId}/`);
  }
  store.close();
  administrator.destroy();
  await db.$disconnect();
});

const world = worldOn(() => db);
// The process keeps files in the stack's own store.
const withTheStore = () => ({ media: store });

// 1:05 pm on Monday in Bayline County: the phone finds signal.
const mondayAfternoon = new Date('2026-10-12T17:05:00Z');

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// A photograph's file as a phone's camera writes one: a JPEG's first bytes, then the rest.
const jpeg = (bytes: number): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0x22]), randomBytes(bytes - 6)]);
// A depth file kept as a PNG.
const png = (bytes: number): Buffer =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    randomBytes(bytes - 8),
  ]);

interface Photographed {
  readonly projectId: string;
  readonly token: string;
  readonly photoId: string;
  readonly objectKey: string;
}

// P1 as Dana enters it; the collection phone, enrolled and proven; Kim's Monday on P1; a
// collection and its photograph synced by the phone, its record saying the file's fingerprint
// (and the depth file's, where one goes beside it).
async function photographed(
  served: Served,
  tx: Tx,
  who: People,
  files: { readonly photo: Uint8Array; readonly depth?: Uint8Array; readonly name?: string },
): Promise<Photographed> {
  served.clock.at = mondayAfternoon;
  const dana = await served.signedIn(danasEmail, long);
  const { project } = await p1(served, dana, tx);
  projects.add(project.id);
  const phone = await enrolledPhone(served, tx, files.name ?? 'P1-COL-1');
  const token = await provenWithPasscode(served, phone);
  const assignment = await tx.assignment.create({
    data: {
      personId: who.kim,
      workDate: new Date('2026-10-12'),
      projectId: project.id,
      fieldEventKinds: ['COLLECTION', 'DISPOSAL'],
      origin: 'PLANNED',
      madeById: who.dana,
    },
  });
  const collection: SyncedFieldEvent = {
    ...syncExamples.collection,
    id: randomUUID(),
    projectId: project.id,
    monitorId: who.kim,
    assignmentId: assignment.id,
    setupVersion: 1,
    formDebrisTypeId: null,
  };
  const photo: SyncedPhoto = {
    ...syncExamples.pilePhoto,
    id: randomUUID(),
    projectId: project.id,
    owner: { kind: 'FIELD_EVENT', id: collection.id },
    takenById: who.kim,
    uploadedSha256: sha256Of(files.photo),
    depthSha256: files.depth === undefined ? null : sha256Of(files.depth),
  };
  const answer = await served.ask('POST', syncPhoneEndpoint.path, {
    bearer: token,
    payload: {
      clockAt: served.clock.now().toISOString(),
      deviceUtcOffsetMinutes: -240,
      unplannedAssignments: [],
      passcodeUses: [],
      records: [{ record: 'FIELD_EVENT', fieldEvent: collection }],
      photos: [photo],
      lastUsed: [],
      holds: { masterPasscodeVersion: phone.masterPasscodeVersion, listsProjectId: null },
    },
  });
  const synced = syncAnsweredSchema.parse(answer.body);
  expect(synced.photos.map(({ answer: said }) => said)).toEqual(['SAVED']);
  const kept = await tx.photo.findUniqueOrThrow({ where: { id: photo.id } });
  return { projectId: project.id, token, photoId: photo.id, objectKey: kept.objectKey };
}

const at = (photoId: string, file: 'photo' | 'depth'): string =>
  `/phones/current/photos/${photoId}/files/${file}`;

// A part of a file, as the phone sends one.
const sent = (
  served: Served,
  token: string | undefined,
  photoId: string,
  file: 'photo' | 'depth',
  part: { readonly offset: number; readonly length: number; readonly bytes: Uint8Array },
): Promise<Answer> =>
  served.ask(
    'PATCH',
    `${at(photoId, file)}?offset=${String(part.offset)}&length=${String(part.length)}`,
    {
      bytes: part.bytes,
      contentType: filePartMediaType,
      ...(token === undefined ? {} : { bearer: token }),
    },
  );

const answered = (answer: Answer): PhotoFileAnswer => {
  expect(told(answer)).toEqual([200, undefined]);
  return photoFileAnswerSchema.parse(answer.body);
};

// The file sent in parts of so many bytes, each answered.
async function inParts(
  served: Served,
  p: Photographed,
  file: 'photo' | 'depth',
  bytes: Buffer,
  partBytes: number,
): Promise<PhotoFileAnswer[]> {
  const answers: PhotoFileAnswer[] = [];
  for (let offset = 0; offset < bytes.length; offset += partBytes) {
    answers.push(
      answered(
        await sent(served, p.token, p.photoId, file, {
          offset,
          length: bytes.length,
          bytes: bytes.subarray(offset, offset + partBytes),
        }),
      ),
    );
  }
  return answers;
}

const standing = async (served: Served, p: Photographed, file: 'photo' | 'depth') =>
  answered(await served.ask('GET', at(p.photoId, file), { bearer: p.token }));

describe('the media endpoint', () => {
  it('AC-10-47 is the one endpoint a phone sends a file to, open to a proven phone with somebody signed in on it (ADR-531), and a file is no body any other endpoint takes', async () => {
    // The other is the back office's map's file (ADR-485; KD-76).
    expect(endpoints.filter(({ file }) => file === true).map(({ name }) => name)).toEqual([
      'sendMapFile',
      'sendPhotoFilePart',
    ]);
    for (const served of [photoFileEndpoint, sendPhotoFilePartEndpoint]) {
      expect([served.access, served.path]).toEqual([
        'PHONE_IN_USE',
        '/phones/current/photos/:photoId/files/:file',
      ]);
    }
    await world(
      async (served, tx, who) => {
        const photo = jpeg(70_000);
        const p = await photographed(served, tx, who, { photo });
        // A file's part sent to the sync is no sync; JSON sent as a part is no part.
        const asSync = await served.ask('POST', syncPhoneEndpoint.path, {
          bearer: p.token,
          bytes: photo,
          contentType: filePartMediaType,
        });
        expect(told(asSync)[0]).toBe(400);
        const asJson = await served.ask(
          'PATCH',
          `${at(p.photoId, 'photo')}?offset=0&length=${String(photo.length)}`,
          { bearer: p.token, payload: { bytes: 'ffd8ff' } },
        );
        expect(told(asJson)).toEqual([400, 'BAD_REQUEST']);
        expect((asJson.body as { message?: string }).message).toBe(
          'Not taken: the body isn’t a part of a file: at least one byte, sent as a file’s part.',
        );
        // Bytes of any other type are no part either.
        const asImage = await served.ask(
          'PATCH',
          `${at(p.photoId, 'photo')}?offset=0&length=${String(photo.length)}`,
          { bearer: p.token, bytes: photo, contentType: 'image/jpeg' },
        );
        expect(told(asImage)).toEqual([415, 'UNSUPPORTED_MEDIA_TYPE']);
        expect(await standing(served, p, 'photo')).toEqual({
          upload: 'RECEIVING',
          received: 0,
          length: null,
        });
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });

  it('AC-10-47 checks a file’s kind by its own first bytes and its size before anything is held or kept', async () => {
    await world(
      async (served, tx, who) => {
        const photo = jpeg(70_000);
        const p = await photographed(served, tx, who, { photo });
        const refusals: [string, Answer, [number, string]][] = [
          [
            'a web page, whatever it says it is',
            await sent(served, p.token, p.photoId, 'photo', {
              offset: 0,
              length: 64,
              bytes: Buffer.from('<!doctype html><script>alert(1)</script>'.padEnd(64, ' ')),
            }),
            [415, 'UNSUPPORTED_MEDIA_TYPE'],
          ],
          [
            'a file larger than the policy’s',
            await sent(served, p.token, p.photoId, 'photo', {
              offset: 0,
              length: 33_554_433,
              bytes: photo.subarray(0, 1024),
            }),
            [413, 'TOO_LARGE'],
          ],
          [
            'a part past the file’s end',
            await sent(served, p.token, p.photoId, 'photo', {
              offset: 0,
              length: 1000,
              bytes: photo.subarray(0, 1001),
            }),
            [400, 'BAD_REQUEST'],
          ],
          [
            'a first part too short to tell its kind',
            await sent(served, p.token, p.photoId, 'photo', {
              offset: 0,
              length: photo.length,
              bytes: photo.subarray(0, 4),
            }),
            [400, 'BAD_REQUEST'],
          ],
          [
            'a length that isn’t one',
            await served.ask('PATCH', `${at(p.photoId, 'photo')}?offset=0&length=-1`, {
              bearer: p.token,
              bytes: photo,
              contentType: filePartMediaType,
            }),
            [400, 'BAD_REQUEST'],
          ],
        ];
        for (const [what, answer, how] of refusals) expect(told(answer), what).toEqual(how);
        expect(await standing(served, p, 'photo')).toEqual({
          upload: 'RECEIVING',
          received: 0,
          length: null,
        });
        expect(
          await versionsUnder(administrator, installationMedia(), `projects/${p.projectId}/`),
        ).toEqual([]);
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });

  it('AC-10-47, C86 a part is no larger than the policy’s, refused before it is read whole', async () => {
    await world(
      async (served, tx, who) => {
        const photo = jpeg(70_000);
        const p = await photographed(served, tx, who, { photo });
        const answer = await sent(served, p.token, p.photoId, 'photo', {
          offset: 0,
          length: photo.length,
          bytes: photo.subarray(0, 65_537),
        });
        expect(told(answer)).toEqual([413, 'TOO_LARGE']);
        // A part of the policy's size is taken.
        expect(
          answered(
            await sent(served, p.token, p.photoId, 'photo', {
              offset: 0,
              length: photo.length,
              bytes: photo.subarray(0, 65_536),
            }),
          ),
        ).toEqual({ upload: 'RECEIVING', received: 65_536, length: photo.length });
      },
      undefined,
      installationPolicy({ MEDIA_PART_BYTES_AT_MOST: '65536' }),
      withTheStore(),
    );
  });
});

describe('a file sent in parts', () => {
  it('AC-05-09, AC-04-77, AC-10-48 an interrupted upload goes on from the last part taken; whole, its fingerprint is the record’s, it is kept once at its place with its upload time, and read back it is the bytes that were sent', async () => {
    await world(
      async (served, tx, who) => {
        const photo = jpeg(150_000);
        const p = await photographed(served, tx, who, { photo });
        // The first part arrives; the second is cut off on the way (never sent here).
        expect(
          answered(
            await sent(served, p.token, p.photoId, 'photo', {
              offset: 0,
              length: photo.length,
              bytes: photo.subarray(0, 60_000),
            }),
          ),
        ).toEqual({ upload: 'RECEIVING', received: 60_000, length: 150_000 });
        // The phone asks where it stands, and a part at any other offset changes nothing.
        expect(await standing(served, p, 'photo')).toEqual({
          upload: 'RECEIVING',
          received: 60_000,
          length: 150_000,
        });
        for (const offset of [30_000, 90_000]) {
          expect(
            answered(
              await sent(served, p.token, p.photoId, 'photo', {
                offset,
                length: photo.length,
                bytes: photo.subarray(offset, offset + 30_000),
              }),
            ),
          ).toEqual({ upload: 'RECEIVING', received: 60_000, length: 150_000 });
        }
        expect((await tx.photo.findUniqueOrThrow({ where: { id: p.photoId } })).uploadedAt).toBe(
          null,
        );
        // It goes on from there.
        served.clock.at = new Date('2026-10-12T17:09:30Z');
        expect(
          answered(
            await sent(served, p.token, p.photoId, 'photo', {
              offset: 60_000,
              length: photo.length,
              bytes: photo.subarray(60_000),
            }),
          ),
        ).toEqual({ upload: 'KEPT' });
        const kept = await tx.photo.findUniqueOrThrow({ where: { id: p.photoId } });
        expect([kept.uploadedAt, kept.depthUploadedAt]).toEqual([
          new Date('2026-10-12T17:09:30Z'),
          null,
        ]);
        expect(p.objectKey).toBe(`projects/${p.projectId}/photos/${p.photoId}`);
        const back = await store.read(p.objectKey, 1_000_000);
        expect(back?.contentType).toBe('image/jpeg');
        expect(back?.bytes.equals(photo)).toBe(true);
        // Its upload time is the phone's act, under the device key's actor.
        const audited = await tx.auditRecord.findMany({
          where: { tableName: 'photo', recordId: p.photoId, operation: 'UPDATE' },
          select: { actorId: true, deviceId: true, source: true, changedFields: true },
        });
        expect(audited).toEqual([
          {
            actorId: deviceKeyActorId,
            deviceId: kept.deviceId,
            source: 'DEVICE',
            changedFields: ['uploaded_at'],
          },
        ]);
        // Kept is kept: asked, or sent again whole or in part, nothing changes.
        served.clock.at = new Date('2026-10-12T17:15:00Z');
        expect(await standing(served, p, 'photo')).toEqual({ upload: 'KEPT' });
        expect(await inParts(served, p, 'photo', jpeg(150_000), 100_000)).toEqual([
          { upload: 'KEPT' },
          { upload: 'KEPT' },
        ]);
        expect((await tx.photo.findUniqueOrThrow({ where: { id: p.photoId } })).uploadedAt).toEqual(
          new Date('2026-10-12T17:09:30Z'),
        );
        expect(
          (await versionsUnder(administrator, installationMedia(), `projects/${p.projectId}/`)).map(
            ({ key, bytes }) => [key, bytes],
          ),
        ).toEqual([[p.objectKey, 150_000]]);
        // The log says which file and where it stands, never a fingerprint or a place in
        // storage (the photograph's id is in the request's path, as every path's ids are).
        const said = served.lines.join('\n');
        expect(said).toContain('A phone sent a part of a photograph’s file.');
        for (const never of [kept.uploadedSha256, p.objectKey, `${p.photoId}.`, '.set-aside/']) {
          expect(said).not.toContain(never);
        }
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });

  it('C138, ADR-524 the last part sent twice at once to one process is taken one at a time: the file is kept once, at its place, its upload time written once; both are answered kept, neither told to start again', async () => {
    await world(
      async (served, tx, who) => {
        const photo = jpeg(150_000);
        const p = await photographed(served, tx, who, { photo });
        expect(
          answered(
            await sent(served, p.token, p.photoId, 'photo', {
              offset: 0,
              length: photo.length,
              bytes: photo.subarray(0, 100_000),
            }),
          ),
        ).toEqual({ upload: 'RECEIVING', received: 100_000, length: 150_000 });
        const last = { offset: 100_000, length: photo.length, bytes: photo.subarray(100_000) };
        const both = await Promise.all([
          sent(served, p.token, p.photoId, 'photo', last),
          sent(served, p.token, p.photoId, 'photo', last),
        ]);
        expect(both.map(answered)).toEqual([{ upload: 'KEPT' }, { upload: 'KEPT' }]);
        expect(
          (await versionsUnder(administrator, installationMedia(), `projects/${p.projectId}/`)).map(
            ({ key, bytes }) => [key, bytes],
          ),
        ).toEqual([[p.objectKey, 150_000]]);
        expect(
          await tx.auditRecord.count({
            where: { tableName: 'photo', recordId: p.photoId, operation: 'UPDATE' },
          }),
        ).toBe(1);
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });

  it('AC-04-77 the depth file goes beside it, checked against its own fingerprint; none is taken where none was promised', async () => {
    await world(
      async (served, tx, who) => {
        const photo = jpeg(40_000);
        const depth = png(20_000);
        const p = await photographed(served, tx, who, { photo, depth });
        expect(await inParts(served, p, 'depth', depth, 20_000)).toEqual([{ upload: 'KEPT' }]);
        const kept = await tx.photo.findUniqueOrThrow({ where: { id: p.photoId } });
        expect([kept.uploadedAt, kept.depthUploadedAt === null]).toEqual([null, false]);
        const back = await store.read(`${p.objectKey}.depth`, 100_000);
        expect([back?.contentType, back?.bytes.equals(depth)]).toEqual(['image/png', true]);
        // The photograph's own file is its own.
        expect(await inParts(served, p, 'photo', photo, 40_000)).toEqual([{ upload: 'KEPT' }]);
        // A photograph with no depth file has none to send.
        const plain = await photographed(served, tx, who, { photo: jpeg(1_000), name: 'P1-COL-2' });
        expect(
          told(await served.ask('GET', at(plain.photoId, 'depth'), { bearer: plain.token })),
        ).toEqual([404, 'NOT_FOUND']);
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });
});

describe('a file that isn’t the one fingerprinted', () => {
  it('C84 (12), T-25 is set aside on the server for a person, never kept as the photograph’s, and the phone sends its file again', async () => {
    await world(
      async (served, tx, who) => {
        const photo = jpeg(50_000);
        const p = await photographed(served, tx, who, { photo });
        // The same length and kind, another file: swapped, or spoiled on the way.
        const other = jpeg(50_000);
        for (let time = 0; time < 2; time += 1) {
          expect(await inParts(served, p, 'photo', other, 30_000)).toEqual([
            { upload: 'RECEIVING', received: 30_000, length: 50_000 },
            { upload: 'NOT_MATCHED' },
          ]);
        }
        const setAside = await tx.setAsideFile.findMany({ where: { photoId: p.photoId } });
        expect(
          setAside.map(({ file, receivedSha256, byteCount, contentType, objectKey }) => ({
            file,
            receivedSha256,
            byteCount,
            contentType,
            objectKey,
          })),
        ).toEqual([
          {
            file: 'PHOTO',
            receivedSha256: sha256Of(other),
            byteCount: 50_000,
            contentType: 'image/jpeg',
            objectKey: `${p.objectKey}.set-aside/${sha256Of(other)}`,
          },
        ]);
        expect((await tx.photo.findUniqueOrThrow({ where: { id: p.photoId } })).uploadedAt).toBe(
          null,
        );
        expect(await store.sizeOf(p.objectKey)).toBe(null);
        expect((await store.read(setAside[0]?.objectKey ?? '', 100_000))?.bytes.equals(other)).toBe(
          true,
        );
        // The phone starts again, and its own file is kept.
        expect(await standing(served, p, 'photo')).toEqual({
          upload: 'RECEIVING',
          received: 0,
          length: null,
        });
        expect(await inParts(served, p, 'photo', photo, 30_000)).toEqual([
          { upload: 'RECEIVING', received: 30_000, length: 50_000 },
          { upload: 'KEPT' },
        ]);
        expect((await store.read(p.objectKey, 100_000))?.bytes.equals(photo)).toBe(true);
        expect(await tx.setAsideFile.count({ where: { photoId: p.photoId } })).toBe(1);
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });

  it('C136 a file already at the photograph’s place is read back before its upload is called done: the one fingerprinted stands; any other is the server’s failure, never kept over', async () => {
    await world(
      async (served, tx, who) => {
        const photo = jpeg(30_000);
        const p = await photographed(served, tx, who, { photo });
        // A piece of work that kept the file and stopped before it wrote the time.
        expect(await store.keep(p.objectKey, photo, 'image/jpeg')).toBe('KEPT');
        expect(await inParts(served, p, 'photo', photo, 30_000)).toEqual([{ upload: 'KEPT' }]);
        expect(
          (await tx.photo.findUniqueOrThrow({ where: { id: p.photoId } })).uploadedAt,
        ).not.toBe(null);
        // Something else at another photograph's place: never called its file.
        const next = jpeg(30_000);
        const q = await photographed(served, tx, who, { photo: next, name: 'P1-COL-2' });
        expect(await store.keep(q.objectKey, jpeg(30_000), 'image/jpeg')).toBe('KEPT');
        const answer = await sent(served, q.token, q.photoId, 'photo', {
          offset: 0,
          length: next.length,
          bytes: next,
        });
        expect(told(answer)).toEqual([500, 'INTERNAL_ERROR']);
        expect((await tx.photo.findUniqueOrThrow({ where: { id: q.photoId } })).uploadedAt).toBe(
          null,
        );
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });

  it('16.5.2 a store that doesn’t answer: the part is the server’s failure, saying nothing of the store, nothing is called kept, and the phone sends the file again', async () => {
    // The installation's own store, at a port nothing listens on.
    const away = new MediaStore({
      ...installationMedia(),
      url: 'https://s3.adms.localhost:1',
      at: undefined,
    });
    try {
      await world(
        async (served, tx, who) => {
          const photo = jpeg(30_000);
          const p = await photographed(served, tx, who, { photo });
          const answer = await sent(served, p.token, p.photoId, 'photo', {
            offset: 0,
            length: photo.length,
            bytes: photo,
          });
          expect(told(answer)).toEqual([500, 'INTERNAL_ERROR']);
          expect(JSON.stringify(answer.body)).not.toMatch(/s3|adms-media|store|ECONNREFUSED/i);
          expect((await tx.photo.findUniqueOrThrow({ where: { id: p.photoId } })).uploadedAt).toBe(
            null,
          );
          expect(await standing(served, p, 'photo')).toEqual({
            upload: 'RECEIVING',
            received: 0,
            length: null,
          });
        },
        undefined,
        undefined,
        { media: away },
      );
    } finally {
      away.close();
    }
  });
});

describe('who may send one', () => {
  it('AC-10-46, ADR-482 only the phone that took it, by its token, once its record is saved; anyone else is told nothing of it', async () => {
    await world(
      async (served, tx, who) => {
        const photo = jpeg(20_000);
        const p = await photographed(served, tx, who, { photo });
        const part = { offset: 0, length: photo.length, bytes: photo };
        expect(told(await sent(served, undefined, p.photoId, 'photo', part))).toEqual([
          401,
          'PHONE_NOT_PROVEN',
        ]);
        expect(told(await served.ask('GET', at(p.photoId, 'photo')))).toEqual([
          401,
          'PHONE_NOT_PROVEN',
        ]);
        const other = await enrolledPhone(served, tx, 'P1-COL-2');
        const its = await provenWithPasscode(served, other);
        expect(told(await sent(served, its, p.photoId, 'photo', part))).toEqual([404, 'NOT_FOUND']);
        expect(told(await served.ask('GET', at(p.photoId, 'photo'), { bearer: its }))).toEqual([
          404,
          'NOT_FOUND',
        ]);
        // A photograph nobody saved: never sent, or held for a person.
        expect(told(await sent(served, p.token, randomUUID(), 'photo', part))).toEqual([
          404,
          'NOT_FOUND',
        ]);
        expect(
          told(
            await served.ask('GET', `/phones/current/photos/x/files/photo`, { bearer: p.token }),
          ),
        ).toEqual([400, 'BAD_REQUEST']);
        expect(
          await versionsUnder(administrator, installationMedia(), `projects/${p.projectId}/`),
        ).toEqual([]);
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });

  it('C86 a phone sends so many parts in the rate limits’ stretch, and is told how long to wait', async () => {
    await world(
      async (served, tx, who) => {
        const photo = jpeg(20_000);
        const p = await photographed(served, tx, who, { photo });
        expect(await standing(served, p, 'photo')).toEqual({
          upload: 'RECEIVING',
          received: 0,
          length: null,
        });
        expect(await inParts(served, p, 'photo', photo, 10_000)).toEqual([
          { upload: 'RECEIVING', received: 10_000, length: 20_000 },
          { upload: 'KEPT' },
        ]);
        const limited = await served.ask('GET', at(p.photoId, 'photo'), { bearer: p.token });
        expect(told(limited)).toEqual([429, 'LIMITED']);
        expect(limited.headers['retry-after']).toBe('60');
      },
      undefined,
      installationPolicy({ RATE_LIMIT_FILE_PARTS_PER_PHONE: '3' }),
      withTheStore(),
    );
  });
});

describe('what the API holds of files not yet whole', () => {
  it('ADR-482 takes a part only where it goes on, lets a file go once it is whole, and past its bound lets go of the one longest waiting', () => {
    const receiving = new Receiving(100);
    const part = (bytes: number) => new Uint8Array(bytes).fill(7);
    expect(receiving.take('a', 10, 50, part(10))).toEqual({ taken: false, standing: undefined });
    expect(receiving.take('a', 0, 50, part(20))).toEqual({
      taken: true,
      standing: { received: 20, length: 50 },
      whole: undefined,
    });
    expect(receiving.take('a', 0, 50, part(51)).taken).toBe(false);
    expect(receiving.standing('a')).toBe(undefined);
    expect(receiving.take('a', 0, 50, part(20)).taken).toBe(true);
    expect(receiving.take('b', 0, 60, part(30)).taken).toBe(true);
    expect(receiving.size).toBe(50);
    // Another length is another file: what was held of it goes.
    expect(receiving.take('a', 20, 40, part(10))).toEqual({ taken: false, standing: undefined });
    expect(receiving.take('a', 0, 50, part(40)).taken).toBe(true);
    // 'b' has waited longest: past a hundred bytes it goes, never the file just taken.
    expect(receiving.take('c', 0, 60, part(40)).taken).toBe(true);
    expect([receiving.standing('b'), receiving.standing('a'), receiving.size]).toEqual([
      undefined,
      { received: 40, length: 50 },
      80,
    ]);
    const whole = receiving.take('a', 40, 50, part(10));
    expect(whole.taken && whole.whole?.length).toBe(50);
    expect([receiving.standing('a'), receiving.size]).toEqual([undefined, 40]);
    // One file past the bound by itself lets every other go, and is held still.
    expect(receiving.take('d', 0, 150, part(120)).taken).toBe(true);
    expect([receiving.standing('c'), receiving.standing('d'), receiving.size]).toEqual([
      undefined,
      { received: 120, length: 150 },
      120,
    ]);
  });

  it('ADR-482 past the policy’s bound, a phone is told the server holds none of a file and sends it again', async () => {
    await world(
      async (served, tx, who) => {
        const first = jpeg(700_000);
        const p = await photographed(served, tx, who, { photo: first });
        const second = jpeg(700_000);
        const q = await photographed(served, tx, who, { photo: second, name: 'P1-COL-2' });
        const half = { offset: 0, length: 700_000 };
        expect(
          answered(
            await sent(served, p.token, p.photoId, 'photo', {
              ...half,
              bytes: first.subarray(0, 600_000),
            }),
          ),
        ).toEqual({ upload: 'RECEIVING', received: 600_000, length: 700_000 });
        expect(
          answered(
            await sent(served, q.token, q.photoId, 'photo', {
              ...half,
              bytes: second.subarray(0, 600_000),
            }),
          ),
        ).toEqual({ upload: 'RECEIVING', received: 600_000, length: 700_000 });
        expect(await standing(served, p, 'photo')).toEqual({
          upload: 'RECEIVING',
          received: 0,
          length: null,
        });
        expect(await inParts(served, p, 'photo', first, 700_000)).toEqual([{ upload: 'KEPT' }]);
      },
      undefined,
      installationPolicy({
        MEDIA_FILE_BYTES_AT_MOST: '1048576',
        MEDIA_PART_BYTES_AT_MOST: '1048576',
        MEDIA_RECEIVING_BYTES_AT_MOST: '1048576',
      }),
      withTheStore(),
    );
  });
});

// The back office's read of a photograph's file (AC-10-48; ADR-483).
const fileAt = (photoId: string, file: 'photo' | 'depth'): string =>
  `/photographs/${photoId}/files/${file}`;

describe('the back office’s read of a photograph’s file', () => {
  it('AC-10-48 answers an admin and a manager/analyst the bytes that were kept, under the type their first bytes said, as a download that is never run and kept nowhere on the way; never where the file is kept', async () => {
    expect(photographFileEndpoint.path).toBe('/photographs/:photoId/files/:file');
    await world(
      async (served, tx, who) => {
        const photo = jpeg(90_000);
        const depth = png(30_000);
        const p = await photographed(served, tx, who, { photo, depth });
        expect(await inParts(served, p, 'photo', photo, 64_000)).toEqual([
          { upload: 'RECEIVING', received: 64_000, length: 90_000 },
          { upload: 'KEPT' },
        ]);
        expect(await inParts(served, p, 'depth', depth, 64_000)).toEqual([{ upload: 'KEPT' }]);
        // Dana signed in for the project a moment ago: a code is good once.
        served.clock.at = new Date(mondayAfternoon.getTime() + 30_000);
        const dana = await served.signedIn(danasEmail, long);
        const luis = await served.signedIn(luissEmail, longer);
        for (const [person, file, bytes, type, name] of [
          [dana, 'photo', photo, 'image/jpeg', 'photo.jpg'],
          [dana, 'depth', depth, 'image/png', 'depth.png'],
          [luis, 'photo', photo, 'image/jpeg', 'photo.jpg'],
        ] as const) {
          const read = await served.ask('GET', fileAt(p.photoId, file), {
            cookies: person.cookies,
          });
          expect([read.status, read.bytes.equals(bytes)]).toEqual([200, true]);
          expect({
            type: read.headers['content-type'],
            disposition: read.headers['content-disposition'],
            sniffing: read.headers['x-content-type-options'],
            policy: read.headers['content-security-policy'],
            caching: read.headers['cache-control'],
          }).toEqual({
            type,
            disposition: `attachment; filename="${p.photoId}-${name}"`,
            sniffing: 'nosniff',
            policy: "default-src 'none'; frame-ancestors 'none'; sandbox",
            caching: 'no-store',
          });
          expect(JSON.stringify(read.headers)).not.toContain(p.objectKey);
        }
        // Reading it changed nothing, and the log says who read which file, never where.
        const reads = served.lines.filter((line) => line.includes('read a photograph’s file'));
        expect(reads).toHaveLength(3);
        expect(reads.join()).not.toContain(p.objectKey);
        expect(reads.join()).not.toContain(sha256Of(photo));
        expect(reads.join()).toContain(who.luis);
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });

  it('AC-10-48 is no phone’s and no read-only viewer’s, and nobody’s who isn’t signed in', async () => {
    await world(
      async (served, tx, who, within) => {
        const photo = jpeg(20_000);
        const p = await photographed(served, tx, who, { photo });
        expect(await inParts(served, p, 'photo', photo, 64_000)).toEqual([{ upload: 'KEPT' }]);
        const viewer = await viewerSignsIn(served, tx, who.viewer, within);
        for (const [who_, more, refused] of [
          ['nobody', {}, [401, 'NOT_SIGNED_IN']],
          ['the phone that took it', { bearer: p.token }, [401, 'NOT_SIGNED_IN']],
          ['a read-only viewer', { cookies: viewer.cookies }, [403, 'NOT_ALLOWED']],
        ] as const) {
          const read = await served.ask('GET', fileAt(p.photoId, 'photo'), more);
          expect(told(read), who_).toEqual(refused);
          expect(read.bytes.includes(photo.subarray(0, 64)), who_).toBe(false);
        }
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });

  it('AC-10-48 a photograph whose file hasn’t arrived, or with no depth file, is not found, as one there is none of is; and a file swapped at the store is never handed back as the photograph’s (T-25)', async () => {
    await world(
      async (served, tx, who) => {
        const photo = jpeg(20_000);
        const p = await photographed(served, tx, who, { photo });
        served.clock.at = new Date(mondayAfternoon.getTime() + 30_000);
        const dana = await served.signedIn(danasEmail, long);
        const read = (photoId: string, file: 'photo' | 'depth') =>
          served.ask('GET', fileAt(photoId, file), { cookies: dana.cookies });
        const notYet = await read(p.photoId, 'photo');
        expect([...told(notYet), (notYet.body as { message?: string }).message]).toEqual([
          404,
          'NOT_FOUND',
          'Not found: this photograph’s file hasn’t arrived.',
        ]);
        expect(told(await read(p.photoId, 'depth'))).toEqual([404, 'NOT_FOUND']);
        expect(told(await read(randomUUID(), 'photo'))).toEqual([404, 'NOT_FOUND']);
        expect(told(await read('not-a-photograph', 'photo'))).toEqual([400, 'BAD_REQUEST']);
        expect(await inParts(served, p, 'photo', photo, 64_000)).toEqual([{ upload: 'KEPT' }]);
        expect((await read(p.photoId, 'photo')).bytes.equals(photo)).toBe(true);
        // Somebody with the store's own keys puts another file at its place: the bucket keeps
        // the first as an older version, and the API, reading the newest, finds it isn't the
        // one its phone fingerprinted.
        await administrator.send(
          new PutObjectCommand({
            Bucket: installationMedia().bucket,
            Key: p.objectKey,
            Body: jpeg(20_000),
            ContentType: 'image/jpeg',
          }),
        );
        const swapped = await read(p.photoId, 'photo');
        expect(told(swapped)[0]).toBe(500);
        expect(swapped.bytes.includes(photo.subarray(6, 64))).toBe(false);
        expect(
          (await versionsUnder(administrator, installationMedia(), p.objectKey)).map(
            ({ bytes }) => bytes,
          ),
        ).toEqual([20_000, 20_000]);
      },
      undefined,
      undefined,
      withTheStore(),
    );
  });
});
