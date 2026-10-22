// Every word a screen of the back office shows comes from its translation file (ADR-172;
// ARCHITECTURE §14): no text between a screen's tags, none written into an attribute a person reads
// or hears; the words English, every one given, in US units.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { metricWords, screensUnder, wordsOf, writtenIn } from '@open-adms/look/testing/words';
import { describe, expect, it } from 'vitest';

import english from '../src/words/en.json' with { type: 'json' };

const office = join(dirname(fileURLToPath(import.meta.url)), '..');
const screens = screensUnder(office);

describe('the words on a screen of the back office', () => {
  it('are read from every screen of the app', () => {
    expect(screens.map(({ path }) => path)).toEqual(
      expect.arrayContaining(['src/main.tsx', 'src/shell.tsx', 'src/screens/sign-in.tsx']),
    );
  });

  it.each(screens.map(({ path, file }) => [path, file] as const))(
    '%s writes no word of its own',
    (_path, file) => {
      expect(writtenIn(file)).toEqual([]);
    },
  );

  it('are English first, every one given, and in US units', () => {
    expect(english.language).toBe('en');
    expect(wordsOf(english).filter((word) => word.trim() === '')).toEqual([]);
    expect(metricWords(english)).toEqual([]);
  });
});
