// A photograph's files, taken from the phone that took it (ARCHITECTURE §6 "Uploads", §9 (2), (5),
// §11; spec/acceptance/04-field-capture.md AC-04-77; 05-sync.md AC-05-09; 10-api-and-sync.md
// AC-10-47…49; spec/THREAT-MODEL.md T-25; BACKLOG 2.6.4, C84 (12), C136, C137; ADR-101, 263,
// 401, 480…482; REQ-203).
//
// What OWASP ASVS 5.0 V5 asks of a file a caller sends, and how it is met here: the size is
// bounded before it is read (the request's own limit, then the policy's file size against the
// length the phone states); its kind is told by its own first bytes, never by a name or a type
// it is sent with (the domain's `photoFileTypeOf`); it is kept where the server placed it, in
// object storage outside anything served as a page, and handed back only as the bytes that were
// stored; its name is never the caller's. And ADR-101's own: **the whole file's SHA-256 is read
// before it is kept, and only the file the phone fingerprinted is kept as the photograph's.**
//
// - **Only the phone that took it**, once its record is saved: any other photograph, or a depth
//   file nobody promised, is one this phone has none of (404), told nothing more.
// - **A part goes on from the last one taken** (`Receiving`); one that doesn't is answered with
//   where the file stands, and nothing changes.
// - **Whole, its fingerprint is read.** The record's (the depth file's own, for it): the file
//   is kept once, at its place, and its upload time written, by the phone, once. Any other: the
//   file is a photograph's evidence all the same, or the sign of one swapped (T-25), so it is
//   **set aside** at a place of its own beside the photograph's and a row says what arrived, for
//   a person; never kept as the photograph's; the phone is told, and sends its file again.
// - **Kept already is kept:** a part sent again after that changes nothing. A file found at the
//   photograph's place that its record doesn't say was uploaded (a process that stopped between
//   keeping it and writing the time) is read back and its fingerprint checked before the time is
//   written (C136).
// - **Nothing a phone sends changes what the server has** (ADR-477): no file is overwritten,
//   moved or deleted, here or by the store's identity (ADR-480).
import { createHash } from 'node:crypto';

import type { PhotoFileAnswer } from '@open-adms/contracts';
import { byDeviceKey, type Database } from '@open-adms/db';
import { photoFileSignatureBytes, photoFileTypeOf } from '@open-adms/domain';

import { Refusal } from '../process/refusal.ts';
import type { Limits } from '../process/limits.ts';
import type { Clock } from '../setup/setup-service.ts';
import type { Media } from './media-store.ts';
import type { Receiving } from './receiving.ts';

export const apiPhotoFiles = Symbol('a photograph’s files');

export type PhotoFile = 'photo' | 'depth';

export interface PhotoFilesParts {
  readonly media: Media;
  readonly receiving: Receiving;
  readonly limits: Limits;
  readonly clock: Clock;
  readonly fileBytesAtMost: number;
}

// The photograph's file as this service needs it: which phone took it, its place, its
// fingerprint and whether it was kept.
interface Photographed {
  readonly id: string;
  readonly deviceId: string;
  readonly objectKey: string;
  readonly sha256: string;
  readonly uploadedAt: Date | null;
}

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export class PhotoFiles {
  private readonly db: Database;
  private readonly media: Media;
  private readonly receiving: Receiving;
  private readonly limits: Limits;
  private readonly clock: Clock;
  private readonly fileBytesAtMost: number;
  // One piece of work at a time for one file, so that two parts sent at once can't both
  // finish it.
  private readonly busy = new Map<string, Promise<unknown>>();

  constructor(db: Database, parts: PhotoFilesParts) {
    this.db = db;
    this.media = parts.media;
    this.receiving = parts.receiving;
    this.limits = parts.limits;
    this.clock = parts.clock;
    this.fileBytesAtMost = parts.fileBytesAtMost;
  }

  // Where a file stands, as its phone asks.
  async standing(deviceId: string, photoId: string, file: PhotoFile): Promise<PhotoFileAnswer> {
    this.limits.filePart(deviceId);
    const photo = await this.photographed(deviceId, photoId, file);
    if (photo.uploadedAt !== null) return { upload: 'KEPT' };
    return PhotoFiles.receivingAnswer(this.receiving.standing(PhotoFiles.named(photo, file)));
  }

  // A part of a file, at an offset, of a file of a length.
  async part(
    deviceId: string,
    photoId: string,
    file: PhotoFile,
    sent: { readonly offset: number; readonly length: number; readonly bytes: Uint8Array },
  ): Promise<PhotoFileAnswer> {
    this.limits.filePart(deviceId);
    if (sent.length > this.fileBytesAtMost) {
      throw new Refusal(
        'TOO_LARGE',
        413,
        `Not taken: a photograph’s file is at most ${String(this.fileBytesAtMost)} bytes.`,
      );
    }
    if (sent.offset + sent.bytes.byteLength > sent.length) {
      throw new Refusal('BAD_REQUEST', 400, 'Not taken: the part goes past the file’s length.');
    }
    if (sent.offset === 0) {
      const told = Math.min(photoFileSignatureBytes, sent.length);
      if (sent.bytes.byteLength < told) {
        throw new Refusal(
          'BAD_REQUEST',
          400,
          `Not taken: a file’s first part holds at least its first ${String(told)} bytes.`,
        );
      }
      if (photoFileTypeOf(sent.bytes.subarray(0, photoFileSignatureBytes)) === null) {
        throw new Refusal(
          'UNSUPPORTED_MEDIA_TYPE',
          415,
          'Not taken: a photograph’s file is a JPEG, HEIC or HEIF, PNG or TIFF image.',
        );
      }
    }
    const photo = await this.photographed(deviceId, photoId, file);
    const named = PhotoFiles.named(photo, file);
    return this.oneAtATime(named, async () => {
      if ((await this.uploadedAt(photo, file)) !== null) {
        this.receiving.letGo(named);
        return { upload: 'KEPT' };
      }
      const took = this.receiving.take(named, sent.offset, sent.length, sent.bytes);
      if (!took.taken) return PhotoFiles.receivingAnswer(took.standing);
      if (took.whole === undefined) return PhotoFiles.receivingAnswer(took.standing);
      return this.whole(photo, file, took.whole);
    });
  }

  // The file arrived whole: kept as the photograph's where it is the one fingerprinted, set
  // aside where it isn't.
  private async whole(
    photo: Photographed,
    file: PhotoFile,
    bytes: Buffer,
  ): Promise<PhotoFileAnswer> {
    const type = photoFileTypeOf(bytes.subarray(0, photoFileSignatureBytes));
    if (type === null) throw new Error('A file whose first part was an image no longer is one.');
    const received = sha256Of(bytes);
    if (received !== photo.sha256) {
      await this.setAside(photo, file, bytes, type, received);
      return { upload: 'NOT_MATCHED' };
    }
    const kept = await this.media.keep(photo.objectKey, bytes, type);
    if (kept === 'ALREADY_THERE') {
      // Kept before, by a piece of work that stopped before it wrote the time: the file there
      // is the one that stands, and it must be this one.
      const there = await this.media.read(photo.objectKey, this.fileBytesAtMost);
      if (there === null || sha256Of(there.bytes) !== photo.sha256) {
        throw new Error('The file at a photograph’s place isn’t the one its phone fingerprinted.');
      }
    }
    await this.uploaded(photo, file);
    return { upload: 'KEPT' };
  }

  private async setAside(
    photo: Photographed,
    file: PhotoFile,
    bytes: Buffer,
    contentType: string,
    receivedSha256: string,
  ): Promise<void> {
    // A place of its own beside the photograph's, one for each different file that arrives.
    const objectKey = `${photo.objectKey}.set-aside/${receivedSha256}`;
    await this.media.keep(objectKey, bytes, contentType);
    const which = file === 'photo' ? 'PHOTO' : 'DEPTH';
    // The phone's own act, with nobody signed in: written under the device key's actor, as a
    // proof is (ADR-440).
    await this.db.$write(byDeviceKey(photo.deviceId), async (tx) => {
      const already = await tx.setAsideFile.findUnique({
        where: { photoId_file_receivedSha256: { photoId: photo.id, file: which, receivedSha256 } },
        select: { id: true },
      });
      if (already !== null) return;
      await tx.setAsideFile.create({
        data: {
          photoId: photo.id,
          file: which,
          deviceId: photo.deviceId,
          receivedSha256,
          byteCount: bytes.byteLength,
          contentType,
          objectKey,
        },
      });
    });
  }

  // Its upload time, written once, by the phone.
  private async uploaded(photo: Photographed, file: PhotoFile): Promise<void> {
    const at = this.clock.now();
    await this.db.$write(byDeviceKey(photo.deviceId), (tx) =>
      file === 'photo'
        ? tx.photo.updateMany({
            where: { id: photo.id, uploadedAt: null },
            data: { uploadedAt: at },
          })
        : tx.photo.updateMany({
            where: { id: photo.id, depthUploadedAt: null },
            data: { depthUploadedAt: at },
          }),
    );
  }

  private async uploadedAt(photo: Photographed, file: PhotoFile): Promise<Date | null> {
    const now = await this.db.$read((tx) =>
      tx.photo.findUnique({
        where: { id: photo.id },
        select: { uploadedAt: true, depthUploadedAt: true },
      }),
    );
    return (file === 'photo' ? now?.uploadedAt : now?.depthUploadedAt) ?? null;
  }

  // The photograph this phone took, by its id, as far as the file asked for goes; none is a
  // photograph this phone has none of.
  private async photographed(
    deviceId: string,
    photoId: string,
    file: PhotoFile,
  ): Promise<Photographed> {
    const photo = await this.db.$read((tx) =>
      tx.photo.findFirst({
        where: { id: photoId, deviceId },
        select: {
          id: true,
          deviceId: true,
          objectKey: true,
          depthObjectKey: true,
          uploadedSha256: true,
          depthSha256: true,
          uploadedAt: true,
          depthUploadedAt: true,
        },
      }),
    );
    if (photo?.deviceId === undefined || photo.deviceId === null) {
      throw new Refusal('NOT_FOUND', 404);
    }
    if (file === 'photo') {
      return {
        id: photo.id,
        deviceId: photo.deviceId,
        objectKey: photo.objectKey,
        sha256: photo.uploadedSha256,
        uploadedAt: photo.uploadedAt,
      };
    }
    if (photo.depthObjectKey === null || photo.depthSha256 === null) {
      throw new Refusal('NOT_FOUND', 404);
    }
    return {
      id: photo.id,
      deviceId: photo.deviceId,
      objectKey: photo.depthObjectKey,
      sha256: photo.depthSha256,
      uploadedAt: photo.depthUploadedAt,
    };
  }

  private async oneAtATime<T>(file: string, work: () => Promise<T>): Promise<T> {
    const before = this.busy.get(file) ?? Promise.resolve();
    const now = before.then(work, work);
    const settled = now.catch(() => undefined);
    this.busy.set(file, settled);
    try {
      return await now;
    } finally {
      if (this.busy.get(file) === settled) this.busy.delete(file);
    }
  }

  private static named(photo: Photographed, file: PhotoFile): string {
    return `${photo.id} ${file}`;
  }

  private static receivingAnswer(
    standing: { readonly received: number; readonly length: number } | undefined,
  ): PhotoFileAnswer {
    return standing === undefined
      ? { upload: 'RECEIVING', received: 0, length: null }
      : { upload: 'RECEIVING', received: standing.received, length: standing.length };
  }
}
