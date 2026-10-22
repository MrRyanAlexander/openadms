// The one translation layer (ADR-172; AC-11-04): a word's gaps filled, a count's form picked, a
// number written as the language writes it; and the look's own components write no word of their
// own, their words all given and in US units.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { look, Translation } from '../src/translation.ts';
import lookEnglish from '../src/words/en.json' with { type: 'json' };
import { metricWords, screensUnder, wordsOf, writtenIn } from '../testing/words-check.ts';

const english = new Translation({
  language: 'en',
  tickets: { none: 'No tickets', one: '1 ticket', other: '{count} tickets' },
  flagged: 'Ticket {number}: {why}. Flagged for review.',
});

describe('the translation layer', () => {
  it('fills a word’s gaps, numbers as the language writes them, and refuses a gap left open', () => {
    expect(
      english.say(english.words.flagged, { number: '101008', why: 'debris type mismatch' }),
    ).toBe('Ticket 101008: debris type mismatch. Flagged for review.');
    expect(english.say('{count} CY', { count: 4958 })).toBe('4,958 CY');
    expect(() => english.say(english.words.flagged, { number: '101008' })).toThrow(
      '"Ticket {number}: {why}. Flagged for review." has a gap {why} nobody filled.',
    );
  });

  it('picks a count’s form: nothing, one, or more', () => {
    expect([0, 1, 19].map((count) => english.counted(english.words.tickets, count))).toEqual([
      'No tickets',
      '1 ticket',
      '19 tickets',
    ]);
  });

  it('writes a number to the places asked: $5,548.25', () => {
    expect(english.number(5548.25, 2)).toBe('5,548.25');
    expect(english.number(324, 2)).toBe('324.00');
  });
});

describe('AC-11-04 the look’s own words', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  it.each(screensUnder(root).map(({ path, file }) => [path, file] as const))(
    '%s writes no word of its own',
    (_path, file) => {
      expect(writtenIn(file)).toEqual([]);
    },
  );

  it('are English, every one given, in US units', () => {
    expect(look.words).toBe(lookEnglish);
    expect(lookEnglish.language).toBe('en');
    expect(wordsOf(lookEnglish).filter((word) => word.trim() === '')).toEqual([]);
    expect(metricWords(lookEnglish)).toEqual([]);
  });
});
