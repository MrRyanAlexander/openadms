// The dependency audit (ARCHITECTURE §15, §16; ADR-276): `pnpm audit` against the registry's
// advisories. Every advisory, at any severity, fails the check, unless pnpm-workspace.yaml accepts
// it by its GitHub advisory id (auditConfig.ignoreGhsas), each one named in an ADR with why it
// can't be reached. pnpm leaves the accepted ones out of its report; this names them on every run.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Outcome } from './repository.ts';

interface Advisory {
  github_advisory_id: string;
  module_name: string;
  severity: string;
  title: string;
  findings: { version: string }[];
}

interface AuditReport {
  advisories: Record<string, Advisory>;
  metadata: { totalDependencies: number };
}

export class DependencyAudit {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  run(): Outcome {
    // pnpm exits 1 when it finds an advisory; the report says which, so the status isn't the verdict.
    const result = spawnSync('pnpm', ['audit', '--json'], { cwd: this.root, encoding: 'utf8' });
    let report: AuditReport;
    try {
      report = JSON.parse(result.stdout) as AuditReport;
    } catch {
      const reason = result.stderr.trim().split('\n').at(-1) ?? 'no report';
      return {
        title: 'Dependency audit (pnpm audit)',
        lines: [`✗ no report from the registry: ${reason}`],
        ok: false,
      };
    }
    const open = Object.values(report.advisories);
    const accepted = this.accepted();
    const lines = [
      open.length === 0
        ? '✓ 0 open advisories'
        : `✗ ${String(open.length)} open ${open.length === 1 ? 'advisory' : 'advisories'}`,
      ...open.map(
        (advisory) =>
          `  ${advisory.severity} ${advisory.github_advisory_id} ${advisory.module_name}@${advisory.findings.map((finding) => finding.version).join(',')}: ${advisory.title}`,
      ),
      `  accepted by id (pnpm-workspace.yaml, ADR-276): ${accepted.length === 0 ? 'none' : accepted.join(', ')}`,
    ];
    return {
      title: `Dependency audit (pnpm audit, ${String(report.metadata.totalDependencies)} packages)`,
      lines,
      ok: open.length === 0,
    };
  }

  private accepted(): string[] {
    return acceptedAdvisories(readFileSync(join(this.root, 'pnpm-workspace.yaml'), 'utf8'));
  }
}

// The ids under auditConfig.ignoreGhsas in pnpm-workspace.yaml's text.
export function acceptedAdvisories(workspace: string): string[] {
  const block = /^auditConfig:\n {2}ignoreGhsas:\n((?: {4}- .*\n?| *#.*\n?)*)/m.exec(workspace);
  if (block?.[1] === undefined) return [];
  return [...block[1].matchAll(/^ {4}- (GHSA-[\w-]+)/gm)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}
