// The grant tests (ARCHITECTURE §5, §15; ADR-272, 276): the database project's tests, reported
// here with real counts. They need the local stack and an installation at head, like `pnpm test`.
//
// `pnpm test` keeps its own report of the run (vitest.config.js). Where that run held every one of
// the database project's files, each passed with nothing skipped, it began within the last half
// hour, and no file of the code or an env file has changed since it began, its counts are reported
// and the tests are not run a second time (ADR-446). Anything else, or `pnpm security --fresh`,
// runs them again here.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Outcome, Repository } from './repository.ts';

export interface VitestReport {
  startTime?: number;
  testResults: { name: string; status: string; assertionResults?: { status: string }[] }[];
}

// What a run is held against: the time now, the database project's test files on disk, and when
// the code or an env file last changed.
export interface RunFacts {
  readonly now: number;
  readonly files: readonly string[];
  readonly lastChange: number;
}

export interface Counted {
  readonly files: number;
  readonly tests: number;
  readonly passed: number;
  readonly failed: number;
  readonly notPassed: readonly string[];
}

// Where `pnpm test` keeps its report (vitest.config.js), and how long a run may be reported again.
export const lastRunFile = '.cache/adms/test-run.json';
export const goodForMinutes = 30;

// The tests of one folder (the database project's), as a run's report holds them.
export class LastTestRun {
  private readonly folder: string;

  constructor(folder: string) {
    this.folder = folder;
  }

  // That folder's part of a report, counted.
  counted(report: VitestReport): Counted {
    const files = report.testResults.filter((file) => file.name.startsWith(this.folder));
    const tests = files.flatMap((file) => file.assertionResults ?? []);
    const passed = tests.filter((test) => test.status === 'passed').length;
    return {
      files: files.length,
      tests: tests.length,
      passed,
      failed: tests.filter((test) => test.status === 'failed').length,
      notPassed: files.filter((file) => file.status !== 'passed').map((file) => file.name),
    };
  }

  // The counts of an earlier run that may be reported again, or why it may not be.
  reusable(report: VitestReport | undefined, facts: RunFacts): Counted | string {
    if (report === undefined) return 'no report of an earlier run';
    const began = report.startTime;
    if (began === undefined || !Number.isFinite(began)) return 'the report says no start time';
    if (began > facts.now) return 'the report is from the future';
    if (facts.now - began > goodForMinutes * 60_000) {
      return `the last run began more than ${String(goodForMinutes)} minutes ago`;
    }
    if (facts.lastChange >= began) return 'a file changed since the last run began';
    if (facts.files.length === 0) return 'no test file found';
    const ran = new Set(report.testResults.map((file) => file.name));
    if (!facts.files.every((file) => ran.has(file))) return 'the last run did not hold every file';
    const counted = this.counted(report);
    if (counted.files !== facts.files.length) return 'the last run held a file that is gone';
    if (counted.notPassed.length > 0 || counted.tests === 0 || counted.passed !== counted.tests) {
      return 'the last run did not pass every test';
    }
    return counted;
  }
}

// The code a test run reads, and the files whose change means the tests are run again.
const code = /^(apps|packages|tools|infra|spec)\//;

export class GrantTests {
  private readonly root: string;
  private readonly repository: Repository;
  private readonly fresh: boolean;

  constructor(repository: Repository, fresh = false) {
    this.root = repository.root;
    this.repository = repository;
    this.fresh = fresh;
  }

  run(): Outcome {
    const title = 'The grant tests (Vitest, @open-adms/db)';
    const folder = join(this.root, 'packages/db/test') + '/';
    const earlier = this.fresh ? 'asked for afresh' : this.earlier(folder);
    if (typeof earlier !== 'string') {
      return {
        title,
        lines: [
          `${this.line(earlier, true)} (the run \`pnpm test\` made ${String(earlier.minutes)} min ago; nothing has changed since; \`pnpm security --fresh\` runs them again)`,
        ],
        ok: true,
      };
    }
    const kept = mkdtempSync(join(tmpdir(), 'adms-security-'));
    const output = join(kept, 'report.json');
    try {
      spawnSync(
        join(this.root, 'node_modules/.bin/vitest'),
        ['run', '--project', '@open-adms/db', '--reporter=json', `--outputFile=${output}`],
        { cwd: this.root, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] },
      );
      const report = this.read(output);
      if (report === undefined) {
        return { title, lines: ['✗ no report: is the local stack up and installed?'], ok: false };
      }
      const counted = new LastTestRun(folder).counted(report);
      const ok = counted.failed === 0 && counted.notPassed.length === 0 && counted.tests > 0;
      return {
        title,
        lines: [
          `${this.line(counted, ok)} (run here: ${earlier})`,
          ...report.testResults
            .filter((file) => file.status !== 'passed')
            .map((file) => `  ${file.name.slice(this.root.length + 1)}: ${file.status}`),
        ],
        ok,
      };
    } finally {
      rmSync(kept, { recursive: true, force: true });
    }
  }

  private line(counted: Counted, ok: boolean): string {
    return `${ok ? '✓' : '✗'} ${String(counted.files)} files, ${String(counted.tests)} tests: ${String(counted.passed)} passed, ${String(counted.failed)} failed`;
  }

  private earlier(folder: string): (Counted & { minutes: number }) | string {
    const report = this.read(join(this.root, lastRunFile));
    const now = Date.now();
    const found = new LastTestRun(folder).reusable(report, {
      now,
      files: this.testFiles(folder),
      lastChange: this.lastChange(),
    });
    if (typeof found === 'string') return found;
    return { ...found, minutes: Math.round((now - (report?.startTime ?? now)) / 60_000) };
  }

  private read(path: string): VitestReport | undefined {
    try {
      const report = JSON.parse(readFileSync(path, 'utf8')) as Partial<VitestReport>;
      return Array.isArray(report.testResults) ? (report as VitestReport) : undefined;
    } catch {
      return undefined;
    }
  }

  private testFiles(folder: string): string[] {
    try {
      return readdirSync(folder)
        .filter((name) => name.endsWith('.test.ts'))
        .map((name) => join(folder, name));
    } catch {
      return [];
    }
  }

  // When a file a commit would take, of the code or at the root (the root's pages for agents and
  // people aside), or an env file last changed.
  private lastChange(): number {
    const paths = [
      ...this.repository
        .committable()
        .filter((path) => code.test(path) || (!path.includes('/') && !path.endsWith('.md'))),
      ...this.repository.envFiles(),
    ];
    let last = 0;
    for (const path of paths) {
      try {
        last = Math.max(last, statSync(join(this.root, path)).mtimeMs);
      } catch {
        return Number.POSITIVE_INFINITY; // gone since it was listed: a change
      }
    }
    return last;
  }
}
