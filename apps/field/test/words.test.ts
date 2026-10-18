// Every word a screen shows comes from the translation file (ADR-172; AC-11-04): no screen's
// words are written into its code. Read from every TSX module: no text between its tags, and no
// text written into an attribute a person reads or hears. The words themselves are English, in
// US units. The browser test reads what the screen shows (e2e/door.e2e.ts). The prototype's
// screens (task 3.1.4) are held to the same, their words in its own file.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import prototypeWords from '../prototype/words.json' with { type: 'json' };
import english from '../src/words/en.json' with { type: 'json' };

const field = join(dirname(fileURLToPath(import.meta.url)), '..');
const screens = ['src', 'prototype'].flatMap((folder) =>
  readdirSync(join(field, folder), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.tsx'))
    .sort()
    .map((path) => ({
      path: `${folder}/${path}`,
      file: ts.createSourceFile(
        path,
        readFileSync(join(field, folder, path), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      ),
    })),
);

// Attributes whose text a person reads, or hears from a screen reader.
const readAloud = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'label',
  'placeholder',
  'title',
]);

// The text a screen writes into itself, by where it is.
function writtenIn(file: ts.SourceFile): string[] {
  const written: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && /[\p{L}\p{N}]/u.test(node.text)) written.push(node.text.trim());
    if (
      ts.isJsxExpression(node) &&
      node.expression !== undefined &&
      (ts.isStringLiteral(node.expression) ||
        ts.isNoSubstitutionTemplateLiteral(node.expression)) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      written.push(node.expression.text);
    }
    if (
      ts.isJsxAttribute(node) &&
      readAloud.has(node.name.getText(file)) &&
      node.initializer !== undefined &&
      (ts.isStringLiteral(node.initializer) ||
        (ts.isJsxExpression(node.initializer) &&
          node.initializer.expression !== undefined &&
          (ts.isStringLiteral(node.initializer.expression) ||
            ts.isTemplateExpression(node.initializer.expression) ||
            ts.isNoSubstitutionTemplateLiteral(node.initializer.expression))))
    ) {
      written.push(node.getText(file));
    }
    node.forEachChild(visit);
  };
  visit(file);
  return written;
}

function wordsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(wordsOf);
  return [];
}

describe('AC-11-04 the words on a screen', () => {
  it('are read from every screen of the app', () => {
    expect(screens.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'src/shell.tsx',
        'src/home.tsx',
        'src/look/keypad.tsx',
        'prototype/collection.tsx',
        'prototype/prototype.tsx',
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

  it.each([
    ['the app’s', english],
    ['the prototype’s', prototypeWords],
  ] as const)('%s are English first, every one given, and in US units', (_whose, file) => {
    expect(file.language).toBe('en');
    const words = wordsOf(file);
    expect(words.filter((word) => word.trim() === '')).toEqual([]);
    expect(
      words.filter((word) =>
        /\b(km|cm|mm|(kilo|centi|milli)?met(er|re)s?|kg|kilograms?|lit(er|re)s?|celsius|°C|hectares?)\b/i.test(
          word,
        ),
      ),
    ).toEqual([]);
  });
});
