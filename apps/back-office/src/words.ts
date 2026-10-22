// Every word a screen shows comes from the translation file (ADR-172; ARCHITECTURE §14), through
// the one translation layer every web app shares (@open-adms/look's `Translation`): English first,
// in US units. A screen names a word by its place in the file; a word missing from it doesn't
// compile. A date or a time is the project's, in its time zone (ADR-100).
import { Translation } from '@open-adms/look';

import english from './words/en.json';

export type Words = typeof english;

const translation = new Translation(english);

export const words: Words = translation.words;
export const { say, counted, number } = translation;

// An instant as a person reads it, in a time zone: 12 Oct 2026, 14:35.
export function when(at: string | Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(words.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(typeof at === 'string' ? new Date(at) : at);
}

// A calendar day, 2026-10-12, as a person reads it: 12 Oct 2026.
export function day(calendar: string): string {
  const [year, month, date] = calendar.split('-').map(Number);
  return new Intl.DateTimeFormat(words.language, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1)),
  );
}

// Dollars and cents, as the ledger reads them: $5,548.25.
export function money(amount: string | number): string {
  return new Intl.NumberFormat(words.language, { style: 'currency', currency: 'USD' }).format(
    typeof amount === 'string' ? Number(amount) : amount,
  );
}
