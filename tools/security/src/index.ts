// The security checks (ARCHITECTURE §15, §16; REQ-018; ADR-276), one command from the root:
//   pnpm security            (--fresh runs the grant tests again whatever `pnpm test` reported)
// The dependency audit, the secrets scan, the env files and the grant tests, each with real counts;
// exit 1 if any fails. It never prints a secret. The grant tests need the local stack and an
// installation at head; the audit needs the registry.
// Node 24 runs this file as-is (type stripping), so it uses erasable TypeScript only.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DependencyAudit } from './audit.ts';
import { GrantTests } from './grants.ts';
import { Repository, type Outcome } from './repository.ts';
import { EnvFilesCheck, SecretsScan } from './secrets.ts';

// src/ or dist/: the repository root is three up.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const repository = new Repository(root);

const checks: (() => Outcome | Outcome[])[] = [
  () => new DependencyAudit(root).run(),
  () => new SecretsScan(repository).run(),
  () => new EnvFilesCheck(repository).run(),
  () => new GrantTests(repository, process.argv.includes('--fresh')).run(),
];

console.log('Security checks (ARCHITECTURE §15, §16; REQ-018)');
const outcomes: Outcome[] = [];
let heading = '';
for (const check of checks) {
  let result: Outcome[];
  try {
    result = [check()].flat();
  } catch (error) {
    result = [
      {
        title: 'A check that stopped',
        lines: [`✗ ${error instanceof Error ? error.message : String(error)}`],
        ok: false,
      },
    ];
  }
  for (const outcome of result) {
    if (outcome.title !== heading) console.log(`\n${outcome.title}:`);
    heading = outcome.title;
    for (const line of outcome.lines) console.log(`  ${line}`);
    outcomes.push(outcome);
  }
}
const failed = outcomes.filter((outcome) => !outcome.ok).length;
console.log(
  `\nSecurity checks: ${String(outcomes.length - failed)} passed, ${String(failed)} failed.`,
);
process.exitCode = failed === 0 ? 0 : 1;
