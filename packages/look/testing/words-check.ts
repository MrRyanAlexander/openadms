// The translation layer's checks, for every web app's unit tests (ADR-172; AC-11-04): no screen
// writes a word of its own, between its tags or into an attribute a person reads or hears; and a
// translation file's words are all given, in US units.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

// Every TSX module under an app's folder, parsed, by its path from that folder.
export function screensUnder(root: string, folders: readonly string[] = ['src']) {
  return folders.flatMap((folder) =>
    readdirSync(join(root, folder), { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.tsx'))
      .sort()
      .map((path) => ({
        path: `${folder}/${path}`,
        file: ts.createSourceFile(
          path,
          readFileSync(join(root, folder, path), 'utf8'),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        ),
      })),
  );
}

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
export function writtenIn(file: ts.SourceFile): string[] {
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

export function wordsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(wordsOf);
  return [];
}

// A translation file's words that aren't US units: a metric unit named anywhere.
export function metricWords(file: unknown): string[] {
  return wordsOf(file).filter((word) =>
    /\b(km|cm|mm|(kilo|centi|milli)?met(er|re)s?|kg|kilograms?|lit(er|re)s?|celsius|°C|hectares?)\b/i.test(
      word,
    ),
  );
}
