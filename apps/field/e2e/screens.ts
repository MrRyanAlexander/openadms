// Which screens the field app has, and which the browser tests reached (BACKLOG 3.1.3; ADR-566;
// AC-11-51). A screen is the element that names itself with `data-screen="…"` in the app's
// source or its prototype's (task 3.1.4, ADR-568: the components on the screens not yet built),
// by a literal, once; `accessible.ts` checks each one a test shows. This reporter reads
// every check the run attached, prints the run's line, and fails the run when a screen of the
// app's was never checked, a check found anything (a second guard on the test's own failure), or
// a check names a screen the app doesn't have. A run of some tests
// alone (`-g`) says so with `ADMS_E2E_SOME=1`: the screens it didn't reach are listed, not failed.
// A reporter isn't told of a filter, so it is never guessed.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import ts from 'typescript';

export const screenAttribute = 'data-screen';
export const attachmentName = 'accessibility';
export const reporterFile = fileURLToPath(import.meta.url);
const sources = ['../src', '../prototype'].map((folder) =>
  fileURLToPath(new URL(folder, import.meta.url)),
);

// Every screen named in the given TSX modules (by default the app's own, then its prototype's),
// in order.
export function screensIn(
  modules: readonly { path: string; text: string }[] = sources.flatMap((source) =>
    readdirSync(source, { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.tsx'))
      .sort()
      .map((path) => ({ path, text: readFileSync(join(source, path), 'utf8') })),
  ),
): string[] {
  const names: string[] = [];
  for (const { path, text } of modules) {
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node): void => {
      if (ts.isJsxAttribute(node) && node.name.getText(file) === screenAttribute) {
        const value = node.initializer;
        if (value === undefined || !ts.isStringLiteral(value)) {
          throw new Error(`${path}: a screen names itself by a literal (${node.getText(file)}).`);
        }
        if (names.includes(value.text)) {
          throw new Error(`${path}: the screen "${value.text}" is named twice.`);
        }
        names.push(value.text);
      }
      node.forEachChild(visit);
    };
    visit(file);
  }
  return names;
}

// One check, as a test's result carries it (`accessible.ts`).
export interface ScreenCheck {
  readonly screen: string;
  readonly rules: number;
  readonly violations: readonly Finding[];
  readonly incomplete: readonly Finding[];
}
interface Finding {
  readonly rule: string;
  readonly help: string;
  readonly where: readonly string[];
}

export default class ScreensReached implements Reporter {
  private readonly checks: ScreenCheck[] = [];

  onTestEnd(_test: TestCase, result: TestResult): void {
    for (const attachment of result.attachments) {
      if (attachment.name === attachmentName && attachment.body !== undefined) {
        this.checks.push(JSON.parse(attachment.body.toString('utf8')) as ScreenCheck);
      }
    }
  }

  // A promise, as Playwright reads a changed status only from one.
  onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | undefined> {
    const screens = screensIn();
    const reached = new Set(this.checks.map((checked) => checked.screen));
    const findings = this.checks.reduce(
      (sum, checked) => sum + checked.violations.length + checked.incomplete.length,
      0,
    );
    const some = process.env['ADMS_E2E_SOME'] === '1';
    const unreached = screens
      .filter((screen) => !reached.has(screen))
      .map((screen) => `the ${screen} screen was reached by no browser test`);
    const unknown = [...reached]
      .filter((screen) => !screens.includes(screen))
      .map((screen) => `a check names the ${screen} screen, which the app doesn't have`);
    console.log(
      `\nAccessibility: ${String(screens.filter((screen) => reached.has(screen)).length)} of ` +
        `${String(screens.length)} screens checked, in ${String(this.checks.length)} checks; ` +
        `${String(findings)} found.`,
    );
    for (const problem of unreached) console.log(`${some ? '·' : '✗'} ${problem}`);
    for (const problem of unknown) console.log(`✗ ${problem}`);
    if (findings > 0) {
      console.log(
        `✗ ${String(findings)} found on the screens checked (each test's "${attachmentName}" attachment)`,
      );
    }
    if (some)
      console.log('Some tests alone (ADMS_E2E_SOME=1): a screen not reached is not failed.');
    const failed = findings > 0 || unknown.length > 0 || (!some && unreached.length > 0);
    return Promise.resolve(failed && result.status === 'passed' ? { status: 'failed' } : undefined);
  }

  printsToStdio(): boolean {
    return false;
  }
}
