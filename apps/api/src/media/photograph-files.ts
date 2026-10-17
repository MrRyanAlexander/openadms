// A photograph's file, read by the back office (ARCHITECTURE §6 "Uploads", §11; spec/acceptance/
// 10-api-and-sync.md AC-10-48; spec/THREAT-MODEL.md T-25; BACKLOG 2.6.4 part 4, C138; ADR-101,
// 482 (10), 483).
//
// What OWASP ASVS 5.0 asks of a file handed back that a caller once sent (V3.2.1, V5.4), and how
// it is met here and in the controller: **the bytes that were stored and nothing made of them**,
// read from the store at the place the server made; **the type they were kept under, which their
// own first bytes said** (the domain's `photoFileTypeOf`), asked again of the bytes read, so the
// answer's type is never one a file could choose; and in the controller a download that is never
// run as a page. Never where the file is kept (API3).
//
// - **Only a file that arrived.** A photograph whose file hasn't come, or that has no depth file,
//   is not found; nor is a photograph there is none of.
// - **The file kept is the one its phone fingerprinted** (ADR-101): its SHA-256 is read again
//   before it is handed back. One that isn't, or a store that holds none where the record says
//   one arrived, is the server's failure, never answered as the photograph's file.
// - **Nothing is changed by reading it**, and a photograph removed from the record is read all
//   the same: nothing is deleted (ADR-051).
// - **A file set aside is read the same way** (ADR-482 (5), 526 (1)): the bytes kept at its own
//   place, checked against the fingerprint the server read when it arrived and the type its
//   bytes said then.
import { createHash } from 'node:crypto';

import type { Database } from '@open-adms/db';
import { photoFileSignatureBytes, photoFileTypeOf, type PhotoFileType } from '@open-adms/domain';

import { Refusal } from '../process/refusal.ts';
import type { Media } from './media-store.ts';
import type { PhotoFile } from './photo-files.ts';

export const apiPhotographFiles = Symbol('the back office’s read of a photograph’s file');

export interface KeptPhotographFile {
  readonly bytes: Buffer;
  readonly contentType: PhotoFileType;
}

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export class PhotographFiles {
  private readonly db: Database;
  private readonly media: Media;
  private readonly fileBytesAtMost: number;

  constructor(db: Database, parts: { readonly media: Media; readonly fileBytesAtMost: number }) {
    this.db = db;
    this.media = parts.media;
    this.fileBytesAtMost = parts.fileBytesAtMost;
  }

  async kept(photoId: string, file: PhotoFile): Promise<KeptPhotographFile> {
    const photo = await this.db.$read((tx) =>
      tx.photo.findUnique({
        where: { id: photoId },
        select: {
          objectKey: true,
          uploadedSha256: true,
          uploadedAt: true,
          depthObjectKey: true,
          depthSha256: true,
          depthUploadedAt: true,
        },
      }),
    );
    if (photo === null) throw new Refusal('NOT_FOUND', 404);
    const [place, sha256, arrived] =
      file === 'photo'
        ? [photo.objectKey, photo.uploadedSha256, photo.uploadedAt]
        : [photo.depthObjectKey, photo.depthSha256, photo.depthUploadedAt];
    if (place === null || sha256 === null || arrived === null) {
      throw new Refusal(
        'NOT_FOUND',
        404,
        file === 'photo'
          ? 'Not found: this photograph’s file hasn’t arrived.'
          : 'Not found: this photograph has no depth file that has arrived.',
      );
    }
    const kept = await this.media.read(place, this.fileBytesAtMost);
    if (kept === null) {
      throw new Error('The store holds no file where a photograph’s record says one arrived.');
    }
    if (sha256Of(kept.bytes) !== sha256) {
      throw new Error('The file kept for a photograph isn’t the one its phone fingerprinted.');
    }
    const type = photoFileTypeOf(kept.bytes.subarray(0, photoFileSignatureBytes));
    if (type === null || type !== kept.contentType) {
      throw new Error('A photograph’s file isn’t the kind of image it was kept as.');
    }
    return { bytes: kept.bytes, contentType: type };
  }

  // A file set aside, as the server kept it.
  async setAside(setAsideFileId: string): Promise<KeptPhotographFile> {
    const file = await this.db.$read((tx) =>
      tx.setAsideFile.findUnique({
        where: { id: setAsideFileId },
        select: { objectKey: true, receivedSha256: true, contentType: true },
      }),
    );
    if (file === null) throw new Refusal('NOT_FOUND', 404);
    const kept = await this.media.read(file.objectKey, this.fileBytesAtMost);
    if (kept === null) {
      throw new Error('The store holds no file where a file set aside was kept.');
    }
    if (sha256Of(kept.bytes) !== file.receivedSha256) {
      throw new Error('The file kept set aside isn’t the one that arrived.');
    }
    const type = photoFileTypeOf(kept.bytes.subarray(0, photoFileSignatureBytes));
    if (type === null || type !== file.contentType || type !== kept.contentType) {
      throw new Error('A file set aside isn’t the kind of image it was kept as.');
    }
    return { bytes: kept.bytes, contentType: type };
  }
}
