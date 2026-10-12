#!/usr/bin/env node
// Tries a list of loosenings in one command (ADR-445): each is one string swapped in one source
// file, the tests run, and the file put back byte for byte, whatever happens. It answers, per
// loosening, whether the tests caught it.
//
//   node .claude/skills/adms-verify/loosen.mjs <plan.json>
//
// The plan (keep it in the scratchpad, never in the repository):
//   {
//     "run": ["./node_modules/.bin/vitest", "run", "packages/domain/test/assignments.test.ts"],
//     "build": ["./node_modules/.bin/tsc", "--build"],        // only where the tests read dist/
//     "loosenings": [
//       { "name": "takes a day that isn't today", "file": "packages/domain/src/assignments.ts",
//         "find": "=== a.workDate", "replace": "!== undefined" }
//     ]
//   }
// Run it from the repository root, after `eval "$(fnm env --shell zsh)"`, with the stack up where
// the tests need it. The tests must pass before anything is loosened, or it stops.
//
// Verdicts: `caught` (the run failed with the string swapped), `SLIPPED` (it still passed: a
// finding), `not tried` (the string is not in the file exactly once, or the build failed: it proves
// nothing, so fix the plan). Each run's full output is kept beside the plan, in `<plan>.out/`.
// Exit 0 only when every loosening was caught.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const planPath = process.argv[2];
if (planPath === undefined) {
  console.error('Usage: node .claude/skills/adms-verify/loosen.mjs <plan.json>');
  process.exit(2);
}
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
if (!Array.isArray(plan.run) || !Array.isArray(plan.loosenings)) {
  console.error('The plan needs "run" (a command as a list) and "loosenings" (a list).');
  process.exit(2);
}
const outFolder = `${planPath}.out`;
mkdirSync(outFolder, { recursive: true });
const sha = (text) => createHash('sha256').update(text).digest('hex');

// The file being loosened now, so a stop from outside still puts it back.
let held;
const putBack = () => {
  if (held === undefined) return;
  writeFileSync(held.file, held.original);
  held = undefined;
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    putBack();
    process.exit(130);
  });
}

function ran(command, label) {
  const result = spawnSync(command[0], command.slice(1), {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  writeFileSync(`${outFolder}/${label}.log`, output);
  return { ok: result.status === 0, output };
}

// What a failed run says failed: Vitest's count, or a story's failed checks.
function failures(output) {
  const tests = /Tests\s+(\d+) failed/.exec(output)?.[1];
  if (tests !== undefined) return `${tests} tests failed`;
  const checks = output.split('\n').filter((line) => /^\s+✗ /.test(line)).length;
  if (checks > 0) return `${String(checks)} story checks failed`;
  return 'no failed test named: read its log';
}

if (plan.build !== undefined && !ran(plan.build, 'build-before').ok) {
  console.error(`The build fails before any loosening: ${outFolder}/build-before.log`);
  process.exit(2);
}
const before = ran(plan.run, 'before');
if (!before.ok) {
  console.error(`The tests don't pass before any loosening: ${outFolder}/before.log`);
  process.exit(2);
}

const verdicts = [];
plan.loosenings.forEach((loosening, index) => {
  const label = String(index + 1).padStart(2, '0');
  const name = loosening.name ?? `${loosening.file}: ${loosening.find}`;
  const original = readFileSync(loosening.file, 'utf8');
  const found = original.split(loosening.find).length - 1;
  if (found !== 1 || loosening.find === loosening.replace) {
    verdicts.push([label, 'not tried', name, `the string is in the file ${String(found)} times`]);
    return;
  }
  held = { file: loosening.file, original };
  try {
    writeFileSync(loosening.file, original.replace(loosening.find, () => loosening.replace));
    if (plan.build !== undefined && !ran(plan.build, `${label}-build`).ok) {
      verdicts.push([label, 'not tried', name, 'it did not build']);
      return;
    }
    const tried = ran(plan.run, label);
    verdicts.push(
      tried.ok
        ? [label, 'SLIPPED', name, 'the run still passed']
        : [label, 'caught', name, failures(tried.output)],
    );
  } finally {
    putBack();
  }
  if (sha(readFileSync(loosening.file, 'utf8')) !== sha(original)) {
    console.error(`${loosening.file} is not as it was. Stopped.`);
    process.exit(3);
  }
});

// The sources are back; where the tests read built code, so is the build.
if (plan.build !== undefined && !ran(plan.build, 'build-after').ok) {
  console.error(`The build fails with every source put back: ${outFolder}/build-after.log`);
  process.exit(3);
}

for (const [label, verdict, name, why] of verdicts) {
  console.log(`${label}  ${verdict.padEnd(9)}  ${name}  (${why})`);
}
const count = (verdict) => verdicts.filter((row) => row[1] === verdict).length;
console.log(
  `Loosenings: ${String(verdicts.length)} listed, ${String(count('caught'))} caught, ` +
    `${String(count('SLIPPED'))} slipped, ${String(count('not tried'))} not tried. ` +
    `Every file is as it was. Logs: ${outFolder}/`,
);
process.exit(count('caught') === verdicts.length ? 0 : 1);
