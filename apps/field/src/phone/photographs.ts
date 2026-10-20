// A photograph as the phone takes it (ARCHITECTURE §11; REQ-316; BACKLOG 3.6.1; AC-11-44;
// ADR-101, 157, 586): fingerprinted at capture, shrunk, and kept beside the ticket, form or
// certification it was taken for until that is submitted, when it follows it to the outbox.
//
// - **The original's SHA-256 at capture**, before anything touches it (MASVS-CRYPTO-1).
// - **The shrink is native, never the web layer's** (ARCHITECTURE §11): re-encoded at the
//   original resolution, its location, time and depth data kept, or the depth as a file of its
//   own. `PhotoShrink` is what the iPhone and Android builds implement (tasks 3.8.2, 3.9.1), its
//   size and quality from configuration measured on real phones (AC-11-45). **The browser build
//   keeps the original** (`KeptAsTaken`): the file sent is the one taken, its fingerprints one.
// - **Each file sent is fingerprinted too**, the shrunk photograph's and a depth file's, so anyone
//   can show the file sent came from the one taken. A file larger than the server ever takes
//   (`MEDIA_FILE_BYTES_AT_MOST`) would never go, so it is never kept.
import type { PhotoStage } from '@open-adms/domain';

import type { Change, PhoneStore, Shelf } from '../store/phone-store.ts';
import type { Fix } from './tickets.ts';

// What a shrink hands back: the file to send, and the depth data where it couldn't travel inside.
export interface Shrunk {
  readonly photo: Uint8Array;
  readonly depth: Uint8Array | null;
}

// The native shrink's interface (ARCHITECTURE §11).
export interface PhotoShrink {
  shrunk(original: Uint8Array): Promise<Shrunk>;
}

// The browser build's: the original, as taken (AC-11-44).
export class KeptAsTaken implements PhotoShrink {
  shrunk(original: Uint8Array): Promise<Shrunk> {
    return Promise.resolve({ photo: original, depth: null });
  }
}

// A photograph's three fingerprints, as the sync contract carries them (ADR-481).
export interface PhotoFingerprints {
  readonly originalSha256: string;
  readonly uploadedSha256: string;
  readonly depthSha256: string | null;
}

// A photograph taken and kept beside its ticket, form or certification.
export interface TicketPhoto extends PhotoFingerprints {
  readonly id: string;
  readonly capturedAt: string;
  readonly offset: number;
  readonly fix: Fix | null;
  // The file sent's size.
  readonly bytes: number;
  // Handed to the outbox with its files, at submit.
  readonly kept: boolean;
  // The stage of the work it shows, where a unit rate ticket's kind of work is photographed by
  // stage (ADR-590); none on every other photograph.
  readonly stage?: PhotoStage;
}

// A photograph taken, fingerprinted and shrunk, its files not yet kept.
export interface Taken extends PhotoFingerprints {
  readonly photo: Uint8Array;
  readonly depth: Uint8Array | null;
}

const photoPrefix = 'photo:';
const depthPrefix = 'depth:';

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256Of = async (bytes: Uint8Array): Promise<string> =>
  hex(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));

// The original fingerprinted, then shrunk and each file fingerprinted: none where a file is empty
// or larger than the server ever takes.
export async function photoTaken(
  original: Uint8Array,
  shrink: PhotoShrink,
  bytesAtMost: number,
): Promise<Taken | undefined> {
  if (original.byteLength === 0) return undefined;
  const originalSha256 = await sha256Of(original);
  const { photo, depth } = await shrink.shrunk(original);
  const goes = (file: Uint8Array) => file.byteLength > 0 && file.byteLength <= bytesAtMost;
  if (!goes(photo) || (depth !== null && !goes(depth))) return undefined;
  return {
    originalSha256,
    uploadedSha256: photo === original ? originalSha256 : await sha256Of(photo),
    depthSha256: depth === null ? null : await sha256Of(depth),
    photo,
    depth,
  };
}

// What a photograph taken now is, beside its record.
export function photoOf(id: string, taken: Taken, at: Date, offset: number, fix: Fix | null) {
  const { originalSha256, uploadedSha256, depthSha256, photo } = taken;
  const kept: TicketPhoto = {
    id,
    capturedAt: at.toISOString(),
    offset,
    fix,
    originalSha256,
    uploadedSha256,
    depthSha256,
    bytes: photo.byteLength,
    kept: false,
  };
  return kept;
}

// Its files kept on its record's shelf.
export function filesKept(shelf: Shelf, id: string, taken: Taken): Change[] {
  return [
    { shelf, id: `${photoPrefix}${id}`, value: taken.photo },
    ...(taken.depth === null ? [] : [{ shelf, id: `${depthPrefix}${id}`, value: taken.depth }]),
  ];
}

// Its files let go from its record's shelf: sent, taken again or taken off.
export function filesDropped(shelf: Shelf, photo: TicketPhoto): Change[] {
  return [
    { shelf, id: `${photoPrefix}${photo.id}`, dropped: true },
    ...(photo.depthSha256 === null
      ? []
      : [{ shelf, id: `${depthPrefix}${photo.id}`, dropped: true } as const]),
  ];
}

// The photograph's file, for the screen to draw.
export async function photoBytesOf(
  store: PhoneStore,
  shelf: Shelf,
  id: string,
): Promise<Uint8Array | undefined> {
  const kept = await store.read(shelf, `${photoPrefix}${id}`);
  return kept instanceof Uint8Array ? kept : undefined;
}

// Its files as the outbox keeps them, the depth file's beside the photograph's where there is one:
// none where one is missing.
export async function filesOf(
  store: PhoneStore,
  shelf: Shelf,
  photo: TicketPhoto,
): Promise<{ readonly file: 'photo' | 'depth'; readonly bytes: Uint8Array }[] | undefined> {
  const bytes = await photoBytesOf(store, shelf, photo.id);
  if (bytes === undefined) return undefined;
  if (photo.depthSha256 === null) return [{ file: 'photo', bytes }];
  const depth = await store.read(shelf, `${depthPrefix}${photo.id}`);
  return depth instanceof Uint8Array
    ? [
        { file: 'photo', bytes },
        { file: 'depth', bytes: depth },
      ]
    : undefined;
}

// What the sync contract carries of its fingerprints.
export const fingerprintsOf = ({
  originalSha256,
  uploadedSha256,
  depthSha256,
}: PhotoFingerprints): PhotoFingerprints => ({ originalSha256, uploadedSha256, depthSha256 });
