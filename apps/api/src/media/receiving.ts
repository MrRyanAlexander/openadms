// What the API holds of photographs' files not yet whole, between the parts a phone sends
// (ARCHITECTURE §9 (5), §11; spec/acceptance/05-sync.md AC-05-09; ADR-482). A part goes on only
// at the offset where the last one ended; a file is let go once it is whole.
//
// **In this process's memory, bounded, and never the only copy:** the phone keeps every file
// until it is told the file is kept, so what is held here is a saving of the phone's signal and
// nothing more. Past the policy's bytes, the file whose last part came longest ago is let go
// (as the rate limits' counts are, ADR-416), and its phone, asking or sending, is told the
// server holds none of it and starts again. A process that stops holds nothing; two processes
// each hold their own. Nothing here is written to a disk or the object store: no file but a
// whole one that was checked reaches storage.
export interface Standing {
  // How many bytes are held, from the first; how long the whole file is.
  readonly received: number;
  readonly length: number;
}

// A part taken: how far the file has come, and the file itself once it is whole (and let go).
export type Took =
  | { readonly taken: false; readonly standing: Standing | undefined }
  | { readonly taken: true; readonly standing: Standing; readonly whole: Buffer | undefined };

interface Held {
  readonly length: number;
  readonly parts: Buffer[];
  received: number;
}

export class Receiving {
  private readonly bytesAtMost: number;
  // In the order their last parts came: the first is the longest waiting.
  private readonly held = new Map<string, Held>();
  private bytes = 0;

  constructor(bytesAtMost: number) {
    this.bytesAtMost = bytesAtMost;
  }

  standing(file: string): Standing | undefined {
    const held = this.held.get(file);
    return held === undefined ? undefined : { received: held.received, length: held.length };
  }

  // A part, at an offset, of a file of a length. Taken where it starts the file, or goes on
  // where the last part ended, and stays inside the file's length; otherwise nothing changes and
  // the answer says where the file stands. A part that starts a file again, or one of another
  // length, lets go of what was held of it.
  take(file: string, offset: number, length: number, part: Uint8Array): Took {
    let held = this.held.get(file);
    if (held !== undefined && (offset === 0 || held.length !== length)) {
      this.letGo(file);
      held = undefined;
    }
    const received = held?.received ?? 0;
    if (offset !== received || offset + part.byteLength > length) {
      return { taken: false, standing: this.standing(file) };
    }
    const kept: Held = held ?? { length, parts: [], received: 0 };
    this.held.delete(file);
    kept.parts.push(Buffer.from(part));
    kept.received += part.byteLength;
    this.bytes += part.byteLength;
    const standing = { received: kept.received, length };
    if (kept.received === length) {
      this.bytes -= kept.received;
      return { taken: true, standing, whole: Buffer.concat(kept.parts, length) };
    }
    this.held.set(file, kept);
    this.roomFor(file);
    return { taken: true, standing, whole: undefined };
  }

  letGo(file: string): void {
    const held = this.held.get(file);
    if (held === undefined) return;
    this.held.delete(file);
    this.bytes -= held.received;
  }

  // How many bytes are held now, across every file.
  get size(): number {
    return this.bytes;
  }

  // Lets go of the longest waiting files, never the one just taken, until what is held is
  // within the bound.
  private roomFor(kept: string): void {
    for (const [file] of this.held) {
      if (this.bytes <= this.bytesAtMost) return;
      if (file !== kept) this.letGo(file);
    }
  }
}
