// A story's own object store (ARCHITECTURE §11, §15; BACKLOG 2.6.4 part 4; ADR-483): the API's
// `Media`, kept in the story's memory and gone when the story ends, as its database is dropped.
// It keeps to what the API's own store keeps to: a file is kept once under a key of the store's
// form and never again, nothing is deleted, and a file read back is the bytes that were kept,
// under the type they were kept under. The real store and the API's identity at it are proven
// by the API's own tests (apps/api, test/media-store.test.ts, test/photo-files.test.ts).
import { isMediaKey, type KeptFile, type Media } from '@open-adms/api';

export class StoryMedia implements Media {
  private readonly kept = new Map<string, KeptFile>();

  keep(key: string, bytes: Uint8Array, contentType: string): Promise<'KEPT' | 'ALREADY_THERE'> {
    StoryMedia.formOf(key);
    if (this.kept.has(key)) return Promise.resolve('ALREADY_THERE');
    this.kept.set(key, { bytes: Buffer.from(bytes), contentType });
    return Promise.resolve('KEPT');
  }

  sizeOf(key: string): Promise<number | null> {
    StoryMedia.formOf(key);
    return Promise.resolve(this.kept.get(key)?.bytes.length ?? null);
  }

  read(key: string, bytesAtMost: number): Promise<KeptFile | null> {
    StoryMedia.formOf(key);
    const kept = this.kept.get(key);
    if (kept === undefined) return Promise.resolve(null);
    if (kept.bytes.length > bytesAtMost) {
      return Promise.reject(new Error('A file read back is larger than the caller takes.'));
    }
    return Promise.resolve({ bytes: Buffer.from(kept.bytes), contentType: kept.contentType });
  }

  // Every key a file is kept under, in the order kept: for a story's own checks.
  get keys(): readonly string[] {
    return [...this.kept.keys()];
  }

  private static formOf(key: string): void {
    if (!isMediaKey(key)) throw new Error('Not a place the store keeps a file at.');
  }
}
