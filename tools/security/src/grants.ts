// The grant tests (ARCHITECTURE §5, §15; ADR-272, 276): the database project's tests, run again
// here so the security checks report them with real counts. They need the local stack and an
// installation at head, like `pnpm test`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Outcome } from './repository.ts';

interface VitestReport {
  numTotalTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: { name: string; status: string }[];
}

export class GrantTests {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  run(): Outcome {
    const title = 'The grant tests (Vitest, @open-adms/db)';
    const folder = mkdtempSync(join(tmpdir(), 'adms-security-'));
    const output = join(folder, 'report.json');
    try {
      spawnSync(
        join(this.root, 'node_modules/.bin/vitest'),
        ['run', '--project', '@open-adms/db', '--reporter=json', `--outputFile=${output}`],
        { cwd: this.root, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let report: VitestReport;
      try {
        report = JSON.parse(readFileSync(output, 'utf8')) as VitestReport;
      } catch {
        return { title, lines: ['✗ no report: is the local stack up and installed?'], ok: false };
      }
      const files = report.testResults;
      const failedFiles = files.filter((file) => file.status !== 'passed');
      const ok =
        report.numFailedTests === 0 && failedFiles.length === 0 && report.numTotalTests > 0;
      return {
        title,
        lines: [
          `${ok ? '✓' : '✗'} ${String(files.length)} files, ${String(report.numTotalTests)} tests: ${String(report.numPassedTests)} passed, ${String(report.numFailedTests)} failed`,
          ...failedFiles.map(
            (file) => `  ${file.name.slice(this.root.length + 1)}: ${file.status}`,
          ),
        ],
        ok,
      };
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
}
