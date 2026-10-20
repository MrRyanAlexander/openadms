// `pnpm chain`: the whole verification chain in one command, and one summary (ADR-533; C116).
//   pnpm chain                     every step, in the `adms-verify` skill's order
//   pnpm chain <step> …            the steps named (`ready` is local:up and installer:check)
//   pnpm chain --fresh             `pnpm security` runs the grant tests again whatever `pnpm test` reported
//   pnpm chain record              writes the last run's counts into agent_store/CHAIN.md (ADR-594)
// Each step's whole output goes to .cache/adms/chain/ (git-ignored), with what the run saw
// (`seen.json`); what is printed is each step's key lines, what failed by name, and the counts held
// against agent_store/CHAIN.md. A failed `pnpm ready`, install or typecheck leaves the rest not run.
// It leaves the stack up: the close-out stops it. Exit 0 only when every step run passed; a count
// that differs from CHAIN.md is printed, not failed: it is read, explained, then recorded.
// Node 24 runs this file as-is (type stripping), so it uses erasable TypeScript only.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  heldAgainst,
  merged,
  recorded,
  writtenCounts,
  type Run,
  type StepSeen,
} from './expected.ts';
import {
  chainSteps,
  chosenSteps,
  plainLines,
  type Count,
  type Reading,
  type Step,
  type VitestReport,
} from './steps.ts';

// src/ or dist/: the repository root is three up.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const logs = '.cache/adms/chain';
const shownProblems = 20;

function took(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes === 0
    ? `${String(seconds)}s`
    : `${String(minutes)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

// When a step began, to the minute, as CHAIN.md shows it.
function stamp(milliseconds: number): string {
  return `${new Date(milliseconds).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

// One command, its output kept whole (both streams, in the order they came).
function ran(command: readonly string[]): Promise<{ code: number; output: string }> {
  const [program, ...args] = command;
  return new Promise((resolve) => {
    if (program === undefined) {
      resolve({ code: 2, output: 'No command.' });
      return;
    }
    const child = spawn(program, args, {
      cwd: root,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (output += chunk));
    child.stderr.on('data', (chunk: string) => (output += chunk));
    child.on('error', (error) => {
      resolve({ code: 127, output: `${output}\n${error.message}` });
    });
    child.on('close', (code, signal) => {
      resolve({
        code: code ?? 1,
        output: signal === null ? output : `${output}\nStopped by ${signal}.`,
      });
    });
  });
}

// The report `pnpm test` just wrote (vitest.config.js), if it is this run's.
function reportSince(began: number): VitestReport | undefined {
  const path = join(root, process.env['ADMS_TEST_REPORT'] ?? '.cache/adms/test-run.json');
  try {
    const report = JSON.parse(readFileSync(path, 'utf8')) as Partial<VitestReport>;
    if (!Array.isArray(report.testResults) || (report.startTime ?? 0) < began - 1000) {
      return undefined;
    }
    return report as VitestReport;
  } catch {
    return undefined;
  }
}

function migrationsOnDisk(): number {
  const folder = join(root, 'packages/db/prisma/migrations');
  return readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

function shown(step: Step, code: number, time: number, reading: Reading, log: string): string[] {
  const head = `${code === 0 ? '✓' : '✗'} ${step.name} · ${took(time)}`;
  const problems = reading.problems.slice(0, shownProblems).map((line) => `    ✗ ${line}`);
  if (reading.problems.length > shownProblems) {
    problems.push(`    … and ${String(reading.problems.length - shownProblems)} more (the log)`);
  }
  return [
    code === 0 ? head : `${head} (exit ${String(code)}; ${log})`,
    ...reading.lines.map((line) => `    ${line}`),
    ...problems,
  ];
}

// `pnpm chain record`: the last run's counts written into CHAIN.md, each passed step's in place of
// what the page had; nothing is run.
function record(): number {
  const seenFile = join(root, logs, 'seen.json');
  const chainPage = join(root, 'agent_store/CHAIN.md');
  if (!existsSync(seenFile)) {
    console.error(`No run to record (${logs}/seen.json): run \`pnpm chain\` first.`);
    return 2;
  }
  const run = JSON.parse(readFileSync(seenFile, 'utf8')) as Run;
  const page = existsSync(chainPage) ? readFileSync(chainPage, 'utf8') : '';
  const order = chainSteps({ fresh: false }).map((step) => step.name);
  const outcome = recorded(page, run, order);
  writeFileSync(chainPage, outcome.page);
  console.log(
    `Recorded the newest run of ${String(run.steps.length)} steps into agent_store/CHAIN.md: ` +
      `${String(outcome.changed.length)} counts changed.`,
  );
  for (const count of outcome.changed) {
    console.log(
      `  ${count.key}: ${count.from === undefined ? 'new' : String(count.from)} → ` +
        (count.to === undefined ? 'gone' : String(count.to)),
    );
  }
  if (outcome.leftAsTheyWere.length > 0) {
    console.log(`Left as the page had them (failed): ${outcome.leftAsTheyWere.join(', ')}.`);
  }
  return 0;
}

async function main(args: readonly string[]): Promise<number> {
  if (process.versions.node.split('.')[0] !== '24') {
    console.error(
      `This is Node ${process.versions.node}; the chain runs on Node 24. ` +
        'First: eval "$(fnm env --shell zsh)"',
    );
    return 2;
  }
  if (args[0] === 'record') return record();
  let steps: readonly Step[];
  try {
    steps = chosenSteps(
      chainSteps({ fresh: args.includes('--fresh') }),
      args.filter((arg) => arg !== '--fresh'),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const seenFile = join(root, logs, 'seen.json');
  const previous = existsSync(seenFile)
    ? (JSON.parse(readFileSync(seenFile, 'utf8')) as Run)
    : undefined;
  rmSync(join(root, logs), { recursive: true, force: true });
  mkdirSync(join(root, logs), { recursive: true });
  console.log(
    `The chain (ADR-533): ${steps.map((step) => step.name).join(', ')}. ` +
      `Each step's whole output: ${logs}/.`,
  );

  const began = Date.now();
  const seen: Count[] = [];
  const seenBySteps: StepSeen[] = [];
  const passed = new Set<string>();
  const failed: string[] = [];
  const notRun: string[] = [];
  let stoppedBy: string | undefined;
  for (const [index, step] of steps.entries()) {
    if (stoppedBy !== undefined) {
      notRun.push(step.name);
      continue;
    }
    const start = Date.now();
    const { code, output } = await ran(step.command);
    const time = Date.now() - start;
    const log = `${logs}/${String(index + 1).padStart(2, '0')}-${step.name.replace(':', '-')}.log`;
    writeFileSync(join(root, log), output);
    const report = step.name === 'test' ? reportSince(start) : undefined;
    const migrations = step.name === 'installer:check' ? migrationsOnDisk() : undefined;
    let reading = step.read(output, {
      root,
      ...(report === undefined ? {} : { report }),
      ...(migrations === undefined ? {} : { migrations }),
    });
    // A failure the reader names nothing of: the output's last lines.
    if (code !== 0 && reading.problems.length === 0) {
      reading = { ...reading, problems: plainLines(output).slice(-12) };
    }
    console.log(shown(step, code, time, reading, log).join('\n'));
    seen.push(...reading.counts);
    seenBySteps.push({
      name: step.name,
      passed: code === 0,
      at: stamp(start),
      took: took(time),
      counts: reading.counts,
    });
    if (code === 0) passed.add(step.name);
    else {
      failed.push(step.name);
      if (step.stopsTheRun) stoppedBy = step.name;
    }
  }

  const chainPage = join(root, 'agent_store/CHAIN.md');
  if (existsSync(chainPage)) {
    const held = heldAgainst(seen, writtenCounts(readFileSync(chainPage, 'utf8')), passed);
    console.log(
      `\nCounts against agent_store/CHAIN.md: ${String(held.same.length)} the same, ` +
        `${String(held.differ.length)} differ, ${String(held.unwritten.length)} not written there, ` +
        `${String(held.unseen.length)} written there and not seen.`,
    );
    for (const count of held.differ) {
      console.log(`  ≠ ${count.key}: ${String(count.seen)} (CHAIN.md: ${String(count.written)})`);
    }
    for (const count of held.unwritten) console.log(`  + ${count.key}: ${String(count.value)}`);
    for (const count of held.unseen) {
      console.log(`  − ${count.key}: not seen (CHAIN.md: ${String(count.value)})`);
    }
  } else {
    console.log('\nNo agent_store/CHAIN.md here: the counts are held against nothing.');
  }
  writeFileSync(seenFile, `${JSON.stringify(merged(previous, seenBySteps), null, 2)}\n`);
  console.log(
    `\nThe chain: ${String(passed.size)} passed, ${String(failed.length)} failed` +
      (failed.length === 0 ? '' : ` (${failed.join(', ')})`) +
      `, ${String(notRun.length)} not run` +
      (stoppedBy === undefined ? '' : ` (stopped by ${stoppedBy})`) +
      `, in ${took(Date.now() - began)}.`,
  );
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
