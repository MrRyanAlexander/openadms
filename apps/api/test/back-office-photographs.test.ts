// A photograph added in the back office to a record made there: the third endpoint that takes a
// file (ARCHITECTURE §6 "Uploads", §11; spec/acceptance/03-certification.md AC-03-65;
// 10-api-and-sync.md AC-10-92; spec/THREAT-MODEL.md T-25; BACKLOG 2.8.7; ADR-101, 482, 521,
// 534 (2)). OWASP ASVS 5.0 V5. The real process, in this test's own memory, on the
// test database as `adms_api`, keeping files in the local stack's own object store
// under the API's identity: it needs `pnpm ready`. Each test's database work is undone; its
// files, which the API's identity can't delete, are taken away by the stack's administrator.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  addPhotographEndpoint,
  addPrimeEndpoint,
  createCertificationEndpoint,
  createContractorEndpoint,
  filePartMediaType,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import type { S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Certifications } from '../src/certification/certifications.ts';
import { MediaStore } from '../src/media/media-store.ts';
import { installationPolicy } from '../src/policy.ts';
import { testSettings, openTestDatabase, type Tx } from './support/database.ts';
import {
  asTheStacksAdministrator,
  installationMedia,
  tidied,
  versionsUnder,
} from './support/media.ts';
import { shippedPolicy } from './support/process.ts';
import { audited, jobsFor, luisHolds, p1WithTickets, reasonNamed } from './support/review.ts';
import { worldOn, type People, type Served } from './support/served.ts';
import {
  ask,
  notSaved,
  plainly,
  saved,
  told,
  viewerSignsIn,
  type Browser,
} from './support/setup.ts';

let db: Database;
let store: MediaStore;
let administrator: S3Client;
// Every project a test made: its files are taken away after the run.
const projects = new Set<string>();

beforeAll(() => {
  db = openTestDatabase(testSettings());
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
// The process keeps files in the stack's own store; a file past a mebibyte, the least the
// policy allows, is too large.
const mebibyte = 1_048_576;
const small = installationPolicy({ MEDIA_FILE_BYTES_AT_MOST: String(mebibyte) });
const withTheStore = () => ({ media: store });

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
// A photograph of a sheet's page, as a scanner writes one: a JPEG's first bytes, then the rest.
const jpeg = (bytes: number): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0x22]), randomBytes(bytes - 6)]);

const box = {
  featureId: null,
  featureOther: null,
  shape: 'RECTANGLE',
  sign: 'ADD',
  length: 240,
  secondLength: null,
  width: 90,
  height: 60,
  diameter: null,
  radius: null,
  run: null,
  corners: null,
};

// P1 with Coastline its prime, and the sheet 88120 entered from paper by Luis, who holds correct.
async function sheetEntered(served: Served, tx: Tx, within: Database, who: People) {
  const p = await p1WithTickets(served, tx, within, who);
  projects.add(p.project.id);
  const coastline = saved(
    createContractorEndpoint,
    await ask(served, p.dana, createContractorEndpoint, {
      payload: { name: 'Coastline Haulers LLC', kind: 'HAULER' },
    }),
  ).record.id;
  saved(
    addPrimeEndpoint,
    await ask(served, p.dana, addPrimeEndpoint, {
      ids: p.ids,
      payload: { contractorId: coastline },
    }),
  );
  const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
  const sheet = saved(
    createCertificationEndpoint,
    await ask(served, luis, createCertificationEndpoint, {
      ids: p.ids,
      payload: {
        certNumber: '88120',
        kind: 'CONTAINER',
        primeId: coastline,
        firstTierSub: null,
        secondTierSub: null,
        vehicleTypeId: null,
        vehicleTypeOther: 'Dump trailer',
        crewTypeId: null,
        boxes: [box],
        driverName: null,
        driverPhone: null,
        driverLicenceNumber: null,
        driverLicenceState: null,
        driverLicenceExpiry: null,
        tagNumber: null,
        tagState: null,
        tagExpiry: null,
        certifiedAt: '2026-10-10T14:10:00Z',
        deviceUtcOffsetMinutes: -240,
        certifiedById: who.kim,
        helperIds: [],
        clientRepresentativeName: null,
        contractorRepresentativeName: null,
        replaces: null,
        notes: null,
        reasonId: await reasonNamed(tx, 'Device failed'),
      },
    }),
  ).record;
  return { ...p, coastline, luis, sheet };
}

const added = (
  served: Served,
  as: Browser,
  query: Record<string, string>,
  bytes: Uint8Array,
): ReturnType<Served['ask']> =>
  served.ask('POST', `${addPhotographEndpoint.path}?${new URLSearchParams(query).toString()}`, {
    ...as,
    bytes,
    contentType: filePartMediaType,
  });

const taken = { capturedAt: '2026-10-10T14:20:00Z', utcOffsetMinutes: '-240' };

describe('a photograph added in the back office', () => {
  it('AC-03-65, AC-10-92 Luis adds the front view of the sheet 88120, entered from paper: kept once where the server places it, its fingerprints the server’s reading of its bytes, its upload time written as it is kept, the record and the time in the audit log under him, never where it is kept; the certification’s own flags are queued; and it is read back as it was sent', async () => {
    await world(
      async (served, tx, who, within) => {
        const s = await sheetEntered(served, tx, within, who);
        const front = jpeg(60_000);
        const answer = await added(
          served,
          s.luis,
          { on: 'CERTIFICATION', recordId: s.sheet.id, view: 'FRONT', ...taken },
          front,
        );
        const { record, queued } = saved(addPhotographEndpoint, answer);
        expect(record).toMatchObject({
          projectId: s.project.id,
          certificationId: s.sheet.id,
          fieldEventId: null,
          view: 'FRONT',
          capturedAt: '2026-10-10T14:20:00.000Z',
          removedAt: null,
        });
        expect(record.uploadedAt).not.toBeNull();
        expect(queued).toMatchObject({ tickets: 0 });
        expect(queued?.jobs).toHaveLength(1);
        const kept = await tx.photo.findUniqueOrThrow({ where: { id: record.id } });
        expect([
          kept.originalSha256,
          kept.uploadedSha256,
          kept.deviceId,
          kept.objectKey,
          kept.deviceUtcOffsetMinutes,
        ]).toEqual([
          sha256Of(front),
          sha256Of(front),
          null,
          `projects/${s.project.id}/photos/${record.id}`,
          -240,
        ]);
        const versions = await versionsUnder(administrator, installationMedia(), kept.objectKey);
        expect(versions.map(({ bytes }) => bytes)).toEqual([60_000]);
        const changes = await audited(tx, answer, 'photo');
        expect(
          changes.map(({ operation, actorId, source }) => [operation, actorId, source]),
        ).toEqual([
          ['INSERT', who.luis, 'BACK_OFFICE'],
          ['UPDATE', who.luis, 'BACK_OFFICE'],
        ]);
        expect(JSON.stringify(answer.body)).not.toContain(kept.objectKey);
        expect(served.lines.join('')).not.toContain(kept.objectKey);
        const read = await served.ask('GET', `/photographs/${record.id}/files/photo`, {
          cookies: s.luis.cookies,
        });
        expect([read.status, read.bytes.equals(front), read.headers['content-type']]).toEqual([
          200,
          true,
          'image/jpeg',
        ]);
        expect(await jobsFor(tx, s.project.id, who.luis)).toContainEqual(['CORRECTION']);
      },
      undefined,
      small,
      withTheStore(),
    );
  });

  it('AC-10-92 a field event made in the back office takes one, and its ticket is queued; a phone’s record, a view on anything but a certification, a record nobody made and a ticket locked as invoiced are refused, nothing kept', async () => {
    await world(
      async (served, tx, who, within) => {
        const s = await sheetEntered(served, tx, within, who);
        const onTheCollection = saved(
          addPhotographEndpoint,
          await added(
            served,
            s.luis,
            { on: 'FIELD_EVENT', recordId: s.collection.id, ...taken },
            jpeg(20_000),
          ),
        );
        expect([onTheCollection.record.fieldEventId, onTheCollection.record.view]).toEqual([
          s.collection.id,
          null,
        ]);
        expect(onTheCollection.queued).toMatchObject({ tickets: 1 });
        // Kim's own certification, made on her phone's sync.
        const certifications = new Certifications(within, served.clock, shippedPolicy);
        const fromAPhone = await certifications.certify({
          projectId: s.project.id,
          certNumber: '730415',
          kind: 'CONTAINER',
          primeId: s.coastline,
          boxes: [{ shape: 'RECTANGLE', sign: 'ADD', length: 240, width: 90, height: 60 }],
          certifiedById: who.kim,
          certifiedAt: new Date('2026-10-10T13:10:00Z'),
          deviceUtcOffsetMinutes: -240,
        });
        if (!fromAPhone.saved) throw new Error(fromAPhone.refusal.message);
        const photos = await tx.photo.count();
        expect(
          notSaved(
            await added(
              served,
              s.luis,
              { on: 'CERTIFICATION', recordId: fromAPhone.record.id, view: 'LEFT', ...taken },
              jpeg(20_000),
            ),
          ),
        ).toEqual([
          'NOT_MADE_IN_THE_BACK_OFFICE',
          'This certification was made on a phone: its photographs are its phone’s, and none is added in the back office. Nothing was saved.',
        ]);
        expect(
          notSaved(
            await added(
              served,
              s.luis,
              { on: 'FIELD_EVENT', recordId: s.collection.id, view: 'FRONT', ...taken },
              jpeg(20_000),
            ),
          )[0],
        ).toBe('VIEW_NOT_ON_THIS_RECORD');
        expect(
          told(
            await added(
              served,
              s.luis,
              { on: 'SURVEY', recordId: randomUUID(), ...taken },
              jpeg(20_000),
            ),
          ),
        ).toEqual([404, 'NOT_FOUND']);
        expect(await tx.photo.count()).toBe(photos);
      },
      undefined,
      small,
      withTheStore(),
    );
  });

  it('AC-10-92 (ASVS 5.2.1, 5.2.2) a file past the policy’s size is refused before it is read, one that is no image by its first bytes too, and a query that can’t be one says which field; nobody, a viewer and a manager/analyst without correct are refused at the door; nothing is kept', async () => {
    await world(
      async (served, tx, who, within) => {
        const s = await sheetEntered(served, tx, within, who);
        const on = { on: 'CERTIFICATION', recordId: s.sheet.id, view: 'FRONT', ...taken };
        expect(told(await added(served, s.luis, on, jpeg(mebibyte + 1)))).toEqual([
          413,
          'TOO_LARGE',
        ]);
        const pdf = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ the sheet scanned as a PDF');
        const notAnImage = await added(served, s.luis, on, pdf);
        expect(told(notAnImage)).toEqual([415, 'UNSUPPORTED_MEDIA_TYPE']);
        expect(plainly(notAnImage)).toBe(
          'Not taken: a photograph’s file is a JPEG, HEIC or HEIF, PNG or TIFF image.',
        );
        const wrongView = await added(served, s.luis, { ...on, view: 'TOP' }, jpeg(20_000));
        expect(told(wrongView)).toEqual([400, 'BAD_REQUEST']);
        expect(plainly(wrongView)).toMatch(/^Not taken: view in the query /);
        // JSON is no file.
        const asJson = await served.ask(
          'POST',
          `${addPhotographEndpoint.path}?${new URLSearchParams(on).toString()}`,
          { ...s.luis, payload: { bytes: 'ffd8ff' } },
        );
        expect(told(asJson)).toEqual([400, 'BAD_REQUEST']);
        expect(told(await added(served, { cookies: {} } as Browser, on, jpeg(20_000)))).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        const viewer = await viewerSignsIn(served, tx, who.viewer, within);
        expect(told(await added(served, viewer, on, jpeg(20_000)))).toEqual([403, 'NOT_ALLOWED']);
        await tx.userPermission.updateMany({
          where: { userId: who.luis, permission: 'CORRECT' },
          data: { archivedAt: new Date() },
        });
        expect(told(await added(served, s.luis, on, jpeg(20_000)))).toEqual([403, 'NOT_ALLOWED']);
        expect(await tx.photo.count({ where: { certificationId: s.sheet.id } })).toBe(0);
        expect(
          await versionsUnder(administrator, installationMedia(), `projects/${s.project.id}/`),
        ).toEqual([]);
      },
      undefined,
      small,
      withTheStore(),
    );
  });
});
