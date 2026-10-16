// The chain's steps (ADR-533): the commands the `adms-verify` skill runs, in its order, and what is
// read from each one's output for the summary. Reading is text in, lines and counts out, so it is
// tested without running anything. A count's key is what `agent_store/CHAIN.md` is read for
// (expected.ts).

// The part of Vitest's JSON report read here (vitest.config.js writes it).
export interface VitestReport {
  readonly startTime?: number;
  readonly testResults: readonly {
    readonly name: string;
    readonly status: string;
    readonly message?: string;
    readonly assertionResults?: readonly {
      readonly status: string;
      readonly fullName?: string;
      readonly title?: string;
    }[];
  }[];
}

// What a step is read with beside its output: the repository's root, the report of the test run
// it made, the migrations on disk.
export interface Beside {
  readonly root: string;
  readonly report?: VitestReport;
  readonly migrations?: number;
}

export interface Count {
  readonly key: string;
  readonly value: number;
}

export interface Reading {
  // Shown under the step, pass or fail.
  readonly lines: readonly string[];
  // Held against CHAIN.md.
  readonly counts: readonly Count[];
  // What failed or was skipped, by name.
  readonly problems: readonly string[];
}

export interface Step {
  // What `pnpm chain <name>` calls it.
  readonly name: string;
  readonly command: readonly string[];
  // A failure here leaves the rest not run: what comes after would fail by the hundred.
  readonly stopsTheRun: boolean;
  readonly read: (output: string, beside: Beside) => Reading;
}

const colour = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');

// A command's output as lines, its colours and blank lines taken out.
export function plainLines(output: string): string[] {
  return output
    .replace(colour, '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
}

const tidy = (line: string): string => line.trim().replace(/\s+/g, ' ');

function localUp(output: string): Reading {
  const lines = plainLines(output);
  // Compose names a container Healthy again each time it waits on it: each is counted once.
  const healthy = new Set(
    lines.flatMap((line) => /Container (\S+)\s+Healthy$/.exec(line)?.[1] ?? []),
  ).size;
  return {
    lines: [
      `${String(healthy)} containers Healthy`,
      ...lines.filter((l) => / → \d{3}\b/.test(l)).map(tidy),
    ],
    counts: [],
    problems: [],
  };
}

function installerCheck(output: string, beside: Beside): Reading {
  const lines = plainLines(output).map(tidy);
  const ticks = lines.filter((line) => line.startsWith('✓')).length;
  const crosses = lines.filter((line) => line.startsWith('✗'));
  const { migrations } = beside;
  return {
    lines: [
      `${String(ticks)} ✓, ${String(crosses.length)} ✗` +
        (migrations === undefined
          ? ''
          : `; ${String(migrations)} migrations in packages/db/prisma/migrations/`),
    ],
    counts: [
      { key: 'installer:check ✓', value: ticks },
      ...(migrations === undefined ? [] : [{ key: 'migrations at head', value: migrations }]),
    ],
    problems: crosses,
  };
}

function install(output: string): Reading {
  const lines = plainLines(output).map(tidy);
  return {
    lines: lines.filter((line) => /Lockfile passes|Already up to date|Done in/.test(line)),
    counts: [],
    problems: lines.filter((line) => /\bERR_|^ERROR\b/.test(line)),
  };
}

function typecheck(output: string): Reading {
  return {
    lines: [],
    counts: [],
    problems: plainLines(output)
      .map(tidy)
      .filter((line) => /error TS\d+/.test(line)),
  };
}

// The total in a Vitest summary line: `Tests  2 failed | 3150 passed (3152)` is 3152.
function totalOf(line: string | undefined): number | undefined {
  const total = line === undefined ? undefined : /\((\d+)\)$/.exec(line)?.[1];
  return total === undefined ? undefined : Number(total);
}

function test(output: string, beside: Beside): Reading {
  const summary = plainLines(output)
    .map(tidy)
    .filter((line) => /^(Test Files|Tests) \d/.test(line));
  const counts: Count[] = [];
  const files = totalOf(summary.find((line) => line.startsWith('Test Files ')));
  const tests = totalOf(summary.find((line) => line.startsWith('Tests ')));
  if (files !== undefined) counts.push({ key: 'test files', value: files });
  if (tests !== undefined) counts.push({ key: 'tests', value: tests });
  const problems: string[] = [];
  const { report } = beside;
  if (report === undefined) {
    return {
      lines: [...summary, 'No report of this run (.cache/adms/test-run.json): no project counted.'],
      counts,
      problems,
    };
  }
  // Each project by its folder: a test file sits in <folder>/test/.
  const projects = new Map<string, { tests: number; files: number }>();
  for (const file of report.testResults) {
    const path = file.name.startsWith(`${beside.root}/`)
      ? file.name.slice(beside.root.length + 1)
      : file.name;
    const folder = path.split('/test/')[0] ?? path;
    const project = projects.get(folder) ?? { tests: 0, files: 0 };
    const assertions = file.assertionResults ?? [];
    projects.set(folder, { tests: project.tests + assertions.length, files: project.files + 1 });
    for (const assertion of assertions) {
      if (assertion.status === 'passed') continue;
      const name = assertion.fullName ?? assertion.title ?? 'a test with no name';
      problems.push(
        `${path} › ${name}${assertion.status === 'failed' ? '' : ` (${assertion.status})`}`,
      );
    }
    if (file.status !== 'passed' && !assertions.some((a) => a.status === 'failed')) {
      problems.push(`${path}: ${plainLines(file.message ?? '')[0] ?? `the file ${file.status}`}`);
    }
  }
  for (const [folder, project] of [...projects].sort(([a], [b]) => a.localeCompare(b))) {
    counts.push({ key: `tests in ${folder}`, value: project.tests });
    counts.push({ key: `files in ${folder}`, value: project.files });
  }
  return { lines: summary, counts, problems };
}

function scenarios(output: string): Reading {
  const lines = plainLines(output);
  const counts: Count[] = [];
  const shown: string[] = [];
  const problems: string[] = [];
  let story = '';
  for (const line of lines) {
    const template = /^This run’s template, \S+: (\d+) migrations applied/.exec(line)?.[1];
    if (template !== undefined) {
      counts.push({ key: 'story migrations', value: Number(template) });
      shown.push(`${template} migrations applied to this run’s template`);
    }
    story = /^Story ([a-z0-9-]+):/.exec(line)?.[1] ?? story;
    const result = /^\s+(passed|FAILED): (\d+) checks/.exec(line);
    if (result?.[2] !== undefined) {
      counts.push({ key: `checks in ${story}`, value: Number(result[2]) });
      if (result[1] === 'FAILED') problems.push(`${story}: ${tidy(line)}`);
    }
    if (/^\s+✗ /.test(line)) problems.push(`${story}: ${tidy(line)}`);
    const stories = /^Stories: (\d+) passed, (\d+) failed\./.exec(line);
    if (stories?.[1] !== undefined && stories[2] !== undefined) {
      counts.push({ key: 'stories', value: Number(stories[1]) + Number(stories[2]) });
      shown.push(line);
    }
  }
  return { lines: shown, counts, problems };
}

function security(output: string): Reading {
  const lines = plainLines(output).map(tidy);
  const counts: Count[] = [];
  const shown: string[] = [];
  for (const line of lines) {
    const grants = /(\d+) files, (\d+) tests: \d+ passed, \d+ failed/.exec(line);
    if (grants?.[1] !== undefined && grants[2] !== undefined) {
      counts.push({ key: 'grant test files', value: Number(grants[1]) });
      counts.push({ key: 'grant tests', value: Number(grants[2]) });
      shown.push(line);
    }
    const checks = /^Security checks: (\d+) passed, (\d+) failed\./.exec(line);
    if (checks?.[1] !== undefined && checks[2] !== undefined) {
      counts.push({ key: 'security checks', value: Number(checks[1]) + Number(checks[2]) });
      shown.push(line);
    }
  }
  return { lines: shown, counts, problems: lines.filter((line) => line.startsWith('✗')) };
}

function lint(output: string): Reading {
  const lines = plainLines(output);
  const problems: string[] = [];
  let file = '';
  for (const line of lines) {
    if (line.startsWith('/')) file = line.trim();
    const found = /^\s+(\d+:\d+)\s+(error|warning)\s+(.*)$/.exec(line);
    if (found !== null) problems.push(`${file}:${found[1] ?? ''} ${tidy(found[3] ?? '')}`);
    if (line.startsWith('[warn] ') && !line.includes('Code style issues')) problems.push(line);
  }
  return {
    lines: lines.map(tidy).filter((line) => /^All matched files use Prettier|^✖ \d+/.test(line)),
    counts: [],
    problems,
  };
}

function licences(output: string): Reading {
  const lines = plainLines(output).map(tidy);
  const counts: Count[] = [];
  const shown: string[] = [];
  for (const line of lines) {
    const total = /^(\d+) packages: \d+ allowed, \d+ refused, \d+ undecided\./.exec(line)?.[1];
    if (total !== undefined) {
      counts.push({ key: 'licensed packages', value: Number(total) });
      shown.push(line);
    }
  }
  return {
    lines: shown,
    counts,
    problems: lines.filter((line) => /^(refused|undecided) /.test(line)),
  };
}

// The chain in the skill's order: `pnpm ready` (the stack up, then the installation re-checked),
// the frozen install, typecheck, the tests, the stories, the security checks (after the tests, so
// it reports their grant tests rather than run them again, ADR-446), lint, licences.
export function chainSteps(options: { readonly fresh: boolean }): readonly Step[] {
  return [
    { name: 'local:up', command: ['pnpm', 'local:up'], stopsTheRun: true, read: localUp },
    {
      name: 'installer:check',
      command: ['pnpm', 'installer:check'],
      stopsTheRun: true,
      read: installerCheck,
    },
    {
      name: 'install',
      command: ['pnpm', 'install', '--frozen-lockfile'],
      stopsTheRun: true,
      read: install,
    },
    { name: 'typecheck', command: ['pnpm', 'typecheck'], stopsTheRun: true, read: typecheck },
    { name: 'test', command: ['pnpm', 'test'], stopsTheRun: false, read: test },
    { name: 'scenarios', command: ['pnpm', 'scenarios'], stopsTheRun: false, read: scenarios },
    {
      name: 'security',
      command: ['pnpm', 'security', ...(options.fresh ? ['--fresh'] : [])],
      stopsTheRun: false,
      read: security,
    },
    { name: 'lint', command: ['pnpm', 'lint'], stopsTheRun: false, read: lint },
    { name: 'licences', command: ['pnpm', 'licences'], stopsTheRun: false, read: licences },
  ];
}

// The steps named on the command line, in the chain's order; none named is all of them. `ready`
// is its two steps.
export function chosenSteps(steps: readonly Step[], named: readonly string[]): readonly Step[] {
  if (named.length === 0) return steps;
  const wanted = new Set(
    named.flatMap((name) => (name === 'ready' ? ['local:up', 'installer:check'] : [name])),
  );
  const unknown = [...wanted].filter((name) => !steps.some((step) => step.name === name));
  if (unknown.length > 0) {
    throw new Error(
      `No step named ${unknown.join(', ')}. The steps: ready, ${steps.map((s) => s.name).join(', ')}.`,
    );
  }
  return steps.filter((step) => wanted.has(step.name));
}
