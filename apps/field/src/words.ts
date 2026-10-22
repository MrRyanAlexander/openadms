// Every word a screen shows comes from the translation file (ADR-172; AC-11-04), through the one
// translation layer every web app shares (@open-adms/look's `Translation`): English first, in US
// units. A screen names a word by its place in the file; a word missing from it doesn't compile.
// Another language is another file of the same shape. A word with a gap in it (`{count}`) is filled
// by `say`; one that changes with a number is picked by `counted`; a time is the project's, in its
// time zone (ADR-100).
import { Translation } from '@open-adms/look';

import english from './words/en.json';

export type Words = typeof english;

const translation = new Translation(english);

export const words: Words = translation.words;
export const { say, counted } = translation;

// A time of day, and whether two moments fall on the same day, in the project's time zone.
export function timeOfDay(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(words.language, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(moment);
}

export function dayOf(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(words.language, { weekday: 'short', timeZone }).format(moment);
}

export function sameDay(one: Date, other: Date, timeZone: string): boolean {
  const date = new Intl.DateTimeFormat(words.language, { dateStyle: 'short', timeZone });
  return date.format(one) === date.format(other);
}

// How long ago something was, in the largest whole unit that has passed, minutes, hours or days;
// never, it says so.
function ago(said: typeof english.work.synced, at: Date | undefined, now: Date): string {
  if (at === undefined) return said.never;
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return said.now;
  if (minutes < 60) return counted(said.minutes, minutes);
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? counted(said.hours, hours) : counted(said.days, Math.floor(hours / 24));
}

// When the phone's last sync was answered (task 3.4.1, ADR-578): what every screen says.
export function lastSynced(answeredAt: Date | undefined, now: Date): string {
  return ago(english.work.synced, answeredAt, now);
}

// How stale the phone's lists are (adms-field-app §4A.2; AC-11-16): when they were last read.
export function listsRead(readAt: Date | undefined, now: Date): string {
  return ago(english.work.listsRead, readAt, now);
}
