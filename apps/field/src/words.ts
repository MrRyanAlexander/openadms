// Every word a screen shows comes from the translation file (ADR-172; AC-11-04): English first,
// in US units. A screen names a word by its place in the file; a word missing from it doesn't
// compile. Another language is another file of the same shape. A word with a gap in it (`{count}`)
// is filled by `say`; one that changes with a number is picked by `counted`; a time is the
// project's, in its time zone (ADR-100).
import english from './words/en.json';

export type Words = typeof english;

export const words: Words = english;

// A word with its gaps filled. A gap the word names and the caller doesn't fill is a mistake in
// the screen, never shown as `{name}`.
export function say(word: string, filling: Readonly<Record<string, string | number>>): string {
  return word.replace(/\{(\w+)\}/g, (_gap, name: string) => {
    const value = filling[name];
    if (value === undefined) throw new Error(`"${word}" has a gap {${name}} nobody filled.`);
    return typeof value === 'number' ? numbered.format(value) : value;
  });
}

const numbered = new Intl.NumberFormat(english.language);
const plurals = new Intl.PluralRules(english.language);

// The word for a count: `none` for nothing where the file has one, else the language's own form.
export function counted(
  forms: { readonly none?: string; readonly one: string; readonly other: string },
  count: number,
  filling: Readonly<Record<string, string | number>> = {},
): string {
  const form =
    count === 0 && forms.none !== undefined
      ? forms.none
      : plurals.select(count) === 'one'
        ? forms.one
        : forms.other;
  return say(form, { count, ...filling });
}

// A time of day, and whether two moments fall on the same day, in the project's time zone.
export function timeOfDay(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(english.language, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(moment);
}

export function dayOf(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(english.language, { weekday: 'short', timeZone }).format(moment);
}

export function sameDay(one: Date, other: Date, timeZone: string): boolean {
  const date = new Intl.DateTimeFormat(english.language, { dateStyle: 'short', timeZone });
  return date.format(one) === date.format(other);
}

// How stale the phone's lists are (adms-field-app §4A.2; AC-11-16): when they were last read, in
// the largest whole unit that has passed, minutes, hours or days; never read, it says so.
export function lastSynced(readAt: Date | undefined, now: Date): string {
  const synced = english.work.synced;
  if (readAt === undefined) return synced.never;
  const minutes = Math.floor((now.getTime() - readAt.getTime()) / 60_000);
  if (minutes < 1) return synced.now;
  if (minutes < 60) return counted(synced.minutes, minutes);
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? counted(synced.hours, hours) : counted(synced.days, Math.floor(hours / 24));
}
