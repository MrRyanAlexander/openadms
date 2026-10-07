// The rules a password is held to when it is set (ARCHITECTURE §6, Passwords; spec/acceptance/
// 10-api-and-sync.md AC-10-21, 23, 24; spec/THREAT-MODEL.md T-16; BACKLOG C35; ADR-402, 403):
// NIST SP 800-63B-4 §3.1.1.2 and OWASP ASVS 5.0 §6.2. Long is enough: no rule asks for a capital,
// a digit or a symbol, and nothing here knows a password's age, so none is ever refused or made
// to change because time has passed. A password is refused only for its length, for being on the
// list of known breached passwords, or for being made of words anybody would try first for this
// person.
//
// A monitor's password is the firm's practice, their phone number without the area code
// (ADR-105): it is exempt from the length, the list and the words, and what protects a monitor
// is ARCHITECTURE §7.2.
//
// This package reads no file: a server app reads the list (the file beside this package,
// breached-passwords.txt) and hands its text to BreachedPasswords.from, as it does the policy
// values.
import type { Policy } from './policy.ts';

export const passwordProblemCodes = [
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'PASSWORD_BREACHED',
  'PASSWORD_EASY_TO_GUESS',
] as const;

export type PasswordProblemCode = (typeof passwordProblemCodes)[number];

// Why a password is refused, in plain words for the person setting it.
export interface PasswordProblem {
  readonly code: PasswordProblemCode;
  readonly message: string;
}

// Whose password it is: what the rules need to know of them.
export interface PasswordHolder {
  // A field monitor (ADR-105): exempt, as above.
  readonly monitor: boolean;
  // What anybody would try first for this person: their name, their email address, their
  // Monitor ID. Blank ones are passed over.
  readonly words: readonly (string | null | undefined)[];
}

// The words of this product, which no password may be made of (ASVS 6.1.2, 6.2.11; NIST's
// "context-specific words, such as the name of the service"). A person's own words join them.
export const contextWords = [
  'open adms',
  'adms',
  'debris',
  'monitor',
  'monitoring',
  'password',
  'passcode',
] as const;

// A password as it is compared and hashed: Unicode's composed form (NFC), so the same password
// typed on two keyboards is one password (NIST SP 800-63B-4 §3.1.1.2). Nothing else is changed:
// no trimming, no case folding, no cutting short.
export function passwordAsKept(password: string): string {
  return password.normalize('NFC');
}

// Its length as the standard counts it: each Unicode code point is one character.
function lengthOf(password: string): number {
  return Array.from(passwordAsKept(password)).length;
}

// The known breached passwords, held whole and in lower case. A password is on the list when all
// of it, whatever its capitals, is an entry: never a part of it, never a word inside it.
export class BreachedPasswords {
  private readonly entries: ReadonlySet<string>;

  private constructor(entries: ReadonlySet<string>) {
    this.entries = entries;
  }

  // From the list's text, one password a line.
  static from(text: string): BreachedPasswords {
    const entries = new Set<string>();
    for (const line of text.split('\n')) {
      const entry = line.endsWith('\r') ? line.slice(0, -1) : line;
      if (entry !== '') entries.add(passwordAsKept(entry).toLowerCase());
    }
    return new BreachedPasswords(entries);
  }

  get size(): number {
    return this.entries.size;
  }

  has(password: string): boolean {
    return this.entries.has(passwordAsKept(password).toLowerCase());
  }
}

export class PasswordRules {
  private readonly shortest: number;
  private readonly longest: number;
  private readonly breached: BreachedPasswords;

  constructor(
    policy: Pick<Policy, 'passwordMinimumLength' | 'passwordMaximumLength'>,
    breached: BreachedPasswords,
  ) {
    this.shortest = policy.passwordMinimumLength;
    this.longest = policy.passwordMaximumLength;
    this.breached = breached;
  }

  // Why the password is refused for this person, or undefined when it is taken.
  problem(password: string, holder: PasswordHolder): PasswordProblem | undefined {
    const length = lengthOf(password);
    if (length > this.longest) {
      return {
        code: 'PASSWORD_TOO_LONG',
        message: `A password can have at most ${String(this.longest)} characters.`,
      };
    }
    if (holder.monitor) {
      return length === 0
        ? { code: 'PASSWORD_TOO_SHORT', message: 'A password can’t be empty.' }
        : undefined;
    }
    if (length < this.shortest) {
      return {
        code: 'PASSWORD_TOO_SHORT',
        message: `A password needs at least ${String(this.shortest)} characters.`,
      };
    }
    if (this.breached.has(password)) {
      return {
        code: 'PASSWORD_BREACHED',
        message: 'That password is on a list of passwords known from breaches. Choose another.',
      };
    }
    if (PasswordRules.madeOf(password, holder.words)) {
      return {
        code: 'PASSWORD_EASY_TO_GUESS',
        message:
          'That password is made only of your own name or address and words like “password”. Choose another.',
      };
    }
    return undefined;
  }

  // Whether the whole password, its letters alone, is nothing but the product's and the person's
  // own words, one after another: "Dana Reyes 2026!", "openadms-password". A password that only
  // has such a word inside it is not refused.
  private static madeOf(password: string, own: PasswordHolder['words']): boolean {
    const letters = (text: string): string =>
      passwordAsKept(text)
        .toLowerCase()
        .replace(/[^\p{L}]/gu, '');
    const words = new Set<string>();
    for (const word of [...contextWords, ...own]) {
      if (word === null || word === undefined) continue;
      // The whole of it, and each part of it: a name's parts, an address's.
      for (const piece of [word, ...word.split(/[^\p{L}\p{N}]+/u)]) {
        if (letters(piece).length >= 3) words.add(letters(piece));
      }
    }
    const written = letters(password);
    if (written === '') return false;
    // reaches[n]: the first n letters are words end to end.
    const reaches: boolean[] = [true];
    for (let end = 1; end <= written.length; end += 1) {
      reaches[end] = [...words].some(
        (word) =>
          word.length <= end &&
          reaches[end - word.length] === true &&
          written.startsWith(word, end - word.length),
      );
    }
    return reaches[written.length] === true;
  }
}
