// The phone's store (ARCHITECTURE §8; BACKLOG 3.2.1; ADR-570): one store for everything a phone
// keeps between one sync and the next, for days if need be (REQ-302), encrypted at rest under a
// random key held on that phone alone and made from no password, so a supervisor can sync and turn
// in a phone its monitor walked away from (AC-02-19, AC-11-07, 08). This is the interface every
// build's store implements: the browser build's, IndexedDB under a WebCrypto key
// (browser-store.ts, for testing, never real work: AC-11-03), and the native builds' SQLCipher
// stores (3.8.1, 3.9.1). What a screen keeps, and when, is its own task's; the store holds what
// it is handed, under the shelf and id it is told, and changes nothing of it.

// Where a value is kept. A shelf is a kind of thing the phone holds, never a monitor or a day: a
// record says whose and when itself.
export const shelves = [
  // The field events, forms and certifications made on the phone, sent or not (AC-11-07).
  'records',
  // The tickets begun on the phone (ADR-571, 581): each one open as its monitor left it, its
  // photographs' bytes beside it; a cancelled one, kept unsent (ADR-056); and of each submitted
  // one what the phone's own duplicate check and today's count read.
  'tickets',
  // The forms that are no ticket's begun on the phone (ADR-584): an ROE, a survey, an incident or a
  // drop-off log, each open as its monitor left it, its photographs' bytes beside it; a cancelled
  // one, kept unsent; and of each submitted one what a post-work survey's ROEs read.
  'forms',
  // The certifications begun on the phone (ADR-585): each one open as its monitor left it, its five
  // views' bytes beside it; a cancelled one, kept unsent with its number; and of each submitted one
  // what a replacement is picked from.
  'certifications',
  // The time clock's entries each worker made on the phone (ADR-598, 601): where they stand on
  // their assignment's clock is read from them, and which field events a clock-out has carried.
  'clock',
  // The photographs waiting to go: each one's record, and a note of each of its files (ARCHITECTURE
  // §11).
  'photographs',
  // Each photograph's file itself, by itself: read one at a time, as it goes (ADR-579).
  'photoFiles',
  // The lists its assignment brought: debris types, sites, certifications, blocks… (§7.1).
  'lists',
  // The login list: one entry a monitor, for signing in offline (§7.2, ADR-105).
  'loginList',
  // An earlier monitor's work not yet sent when another took the phone (ADR-095; C122).
  'archivedQueues',
  // What the server answered that the phone keeps: a record not saved, a report until it is.
  'keptAnswers',
] as const;

export type Shelf = (typeof shelves)[number];

// What a value is: what JSON writes, or a file's bytes.
export type Json =
  string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };
export type Held = Json | Uint8Array;

// One change: a value kept under its id (replacing any there), or the id's value dropped.
export type Change =
  | { readonly shelf: Shelf; readonly id: string; readonly value: Held }
  | { readonly shelf: Shelf; readonly id: string; readonly dropped: true };

export interface Kept {
  readonly id: string;
  readonly value: Held;
}

export interface PhoneStore {
  // Every change made together, or none of them: a phone stopped half way keeps what it had.
  // Answered only once the changes are written to the phone's own storage.
  change(changes: readonly Change[]): Promise<void>;
  // The value kept under an id, or nothing.
  read(shelf: Shelf, id: string): Promise<Held | undefined>;
  // Every value on a shelf, in no order a caller may rely on.
  readAll(shelf: Shelf): Promise<Kept[]>;
  // The cryptographic erase (NIST SP 800-88; AC-11-34): the key goes first, so nothing kept can
  // be read even before the rest is gone; then everything else. Called only on the server's
  // `wipe: true` (the sync contract's suite). The store can't be used after it.
  erase(): Promise<void>;
  close(): void;
}
