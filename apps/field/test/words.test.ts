// Every word a screen shows comes from the translation file (ADR-172; AC-11-04): no screen's
// words are written into its code. Read from every TSX module: no text between its tags, and no
// text written into an attribute a person reads or hears. The words themselves are English, in
// US units. The browser test reads what the screen shows (e2e/door.e2e.ts).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { metricWords, screensUnder, wordsOf, writtenIn } from '@open-adms/look/testing/words';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import english from '../src/words/en.json' with { type: 'json' };

const field = join(dirname(fileURLToPath(import.meta.url)), '..');
const screens = screensUnder(field);

describe('AC-11-04 the words on a screen', () => {
  it('are read from every screen of the app', () => {
    expect(screens.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'src/shell.tsx',
        'src/home.tsx',
        'src/look/keypad.tsx',
        'src/unit-rate.tsx',
      ]),
    );
  });

  it.each(screens.map(({ path, file }) => [path, file] as const))(
    '%s writes no word of its own, between its tags or into an attribute read aloud',
    (_path, file) => {
      expect(writtenIn(file)).toEqual([]);
    },
  );

  it('the check finds a word written into a screen, by each way it could be', () => {
    const file = ts.createSourceFile(
      'made-up.tsx',
      [
        'export const A = () => <p>Sync now</p>;',
        "export const B = () => <p>{'Sync now'}</p>;",
        'export const C = () => <button aria-label="Sync now" />;',
        'export const D = () => <img alt={`Ticket ${n}`} />;',
        'export const E = () => <p>{words.sync.now}</p>;',
        'export const F = () => <p className="strip" />;',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    expect(writtenIn(file)).toEqual([
      'Sync now',
      'Sync now',
      'aria-label="Sync now"',
      'alt={`Ticket ${n}`}',
    ]);
  });

  it.each([['the app’s', english]] as const)(
    '%s are English first, every one given, and in US units',
    (_whose, file) => {
      expect(file.language).toBe('en');
      const words = wordsOf(file);
      expect(words.filter((word) => word.trim() === '')).toEqual([]);
      expect(metricWords(file)).toEqual([]);
    },
  );
});
