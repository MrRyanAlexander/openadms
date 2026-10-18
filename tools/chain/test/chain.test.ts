import { describe, expect, it } from 'vitest';

import { heldAgainst, writtenCounts } from '../src/expected.ts';
import { chainSteps, chosenSteps, plainLines, type Beside, type Step } from '../src/steps.ts';

const steps = chainSteps({ fresh: false });
const root = '/repo';

function step(name: string): Step {
  const found = steps.find((s) => s.name === name);
  if (found === undefined) throw new Error(`no step ${name}`);
  return found;
}

const read = (name: string, output: string, beside: Partial<Beside> = {}) =>
  step(name).read(output, { root, ...beside });

describe('the steps', () => {
  it('are the skill’s chain, in its order: the stack and the installation first, security after the tests', () => {
    expect(steps.map((s) => [s.name, s.command.join(' '), s.stopsTheRun])).toEqual([
      ['local:up', 'pnpm local:up', true],
      ['installer:check', 'pnpm installer:check', true],
      ['install', 'pnpm install --frozen-lockfile', true],
      ['typecheck', 'pnpm typecheck', true],
      ['test', 'pnpm test', false],
      ['scenarios', 'pnpm scenarios', false],
      ['e2e', 'pnpm e2e', false],
      ['security', 'pnpm security', false],
      ['lint', 'pnpm lint', false],
      ['licences', 'pnpm licences', false],
    ]);
    expect(step('security').command).toEqual(['pnpm', 'security']);
    expect(chainSteps({ fresh: true }).find((s) => s.name === 'security')?.command).toEqual([
      'pnpm',
      'security',
      '--fresh',
    ]);
  });

  it('are chosen by name in the chain’s order, `ready` its two, none named all of them', () => {
    expect(chosenSteps(steps, [])).toBe(steps);
    expect(chosenSteps(steps, ['security', 'ready', 'test']).map((s) => s.name)).toEqual([
      'local:up',
      'installer:check',
      'test',
      'security',
    ]);
    expect(() => chosenSteps(steps, ['tests', 'lint'])).toThrow(
      'No step named tests. The steps: ready, local:up, installer:check, install, typecheck, test, scenarios, e2e, security, lint, licences.',
    );
  });
});

describe('a command’s output', () => {
  it('is read without its colours, carriage returns or blank lines', () => {
    const escape = String.fromCharCode(27);
    expect(plainLines(`${escape}[32m✓${escape}[39m one\r\n\r\n  two  \rthree\n`)).toEqual([
      '✓ one',
      '  two',
      'three',
    ]);
  });
});

describe('each step’s reading', () => {
  it('local:up: each container that was healthy, once however often Compose names it, and the health answers', () => {
    const reading = read(
      'local:up',
      [
        ' Container open-adms-local-postgres-1  Healthy',
        ' Container open-adms-local-caddy-1  Healthy',
        ' Container open-adms-local-postgres-1 Healthy ',
        ' Container open-adms-local-caddy-1  Started',
        'https://adms.localhost/health → 200 ok',
        'https://api.adms.localhost/health → 200 {"status":"ok"}',
      ].join('\n'),
    );
    expect(reading.lines).toEqual([
      '2 containers Healthy',
      'https://adms.localhost/health → 200 ok',
      'https://api.adms.localhost/health → 200 {"status":"ok"}',
    ]);
  });

  it('installer:check: its ✓ and ✗ counted, each ✗ named, the migrations on disk', () => {
    const reading = read(
      'installer:check',
      '✓ login adms_api exists\n  ✓ migrations at head\n✗ migrations: 1 not applied\nInstalled for P1',
      { migrations: 132 },
    );
    expect(reading.lines).toEqual(['2 ✓, 1 ✗; 132 migrations in packages/db/prisma/migrations/']);
    expect(reading.counts).toEqual([
      { key: 'installer:check ✓', value: 2 },
      { key: 'migrations at head', value: 132 },
    ]);
    expect(reading.problems).toEqual(['✗ migrations: 1 not applied']);
  });

  it('typecheck: each TypeScript error named', () => {
    const reading = read(
      'typecheck',
      '✔ Generated Prisma Client (7.10.0)\napps/api/src/a.ts(3,7): error TS2322: Type …\n',
    );
    expect(reading.problems).toEqual(['apps/api/src/a.ts(3,7): error TS2322: Type …']);
  });

  it('test: the totals from the summary, each project from the report, each test that did not pass by name', () => {
    const output = '\n Test Files  1 failed | 2 passed (3)\n      Tests  1 failed | 4 passed (5)\n';
    const report = {
      startTime: 1,
      testResults: [
        {
          name: '/repo/apps/api/test/door.test.ts',
          status: 'failed',
          assertionResults: [
            { status: 'passed', fullName: 'the door opens' },
            { status: 'failed', fullName: 'the door AC-10-01 refuses HTTP' },
          ],
        },
        {
          name: '/repo/apps/api/test/boundary.test.ts',
          status: 'passed',
          assertionResults: [
            { status: 'passed', fullName: 'a' },
            { status: 'skipped', fullName: 'b' },
          ],
        },
        {
          name: '/repo/packages/db/test/grants.test.ts',
          status: 'failed',
          message: 'Cannot reach the database\n at …',
          assertionResults: [],
        },
      ],
    };
    const reading = read('test', output, { report });
    expect(reading.lines).toEqual([
      'Test Files 1 failed | 2 passed (3)',
      'Tests 1 failed | 4 passed (5)',
    ]);
    expect(reading.counts).toEqual([
      { key: 'test files', value: 3 },
      { key: 'tests', value: 5 },
      { key: 'tests in apps/api', value: 4 },
      { key: 'files in apps/api', value: 2 },
      { key: 'tests in packages/db', value: 0 },
      { key: 'files in packages/db', value: 1 },
    ]);
    expect(reading.problems).toEqual([
      'apps/api/test/door.test.ts › the door AC-10-01 refuses HTTP',
      'apps/api/test/boundary.test.ts › b (skipped)',
      'packages/db/test/grants.test.ts: Cannot reach the database',
    ]);
  });

  it('test: with no report of this run, the totals alone, and it says so', () => {
    const reading = read('test', ' Test Files  9 passed (9)\n      Tests  90 passed (90)\n');
    expect(reading.counts).toEqual([
      { key: 'test files', value: 9 },
      { key: 'tests', value: 90 },
    ]);
    expect(reading.lines.at(-1)).toBe(
      'No report of this run (.cache/adms/test-run.json): no project counted.',
    );
  });

  it('scenarios: the template’s migrations, each story’s checks, each failed check by its story', () => {
    const output = [
      'This run’s template, adms_story_template_x: 132 migrations applied; seed: 3 users',
      'Story sync: a phone syncs',
      '      ✓ one',
      '  passed: 51 checks, 51 passed, 0 failed',
      'Story burst: a thousand loads',
      '      ✗ every load received',
      '          expected 1000',
      '  ✗ stopped: the API answered 500',
      '  FAILED: 8 checks, 7 passed, 1 failed, stopped early',
      'Stories: 1 passed, 1 failed.',
    ].join('\n');
    const reading = read('scenarios', output);
    expect(reading.lines).toEqual([
      '132 migrations applied to this run’s template',
      'Stories: 1 passed, 1 failed.',
    ]);
    expect(reading.counts).toEqual([
      { key: 'story migrations', value: 132 },
      { key: 'checks in sync', value: 51 },
      { key: 'checks in burst', value: 8 },
      { key: 'stories', value: 2 },
    ]);
    expect(reading.problems).toEqual([
      'burst: ✗ every load received',
      'burst: ✗ stopped: the API answered 500',
      'burst: FAILED: 8 checks, 7 passed, 1 failed, stopped early',
    ]);
  });

  it('security: the grant tests and the checks counted, each ✗ named', () => {
    const output = [
      'Dependency audit:',
      '  ✓ 0 open advisories',
      'Env files:',
      '  ✗ apps/api/.env is tracked by git',
      'The grant tests:',
      '  ✓ 48 files, 1083 tests: 1083 passed, 0 failed (the run `pnpm test` made 4 min ago; …)',
      '',
      'Security checks: 11 passed, 1 failed.',
    ].join('\n');
    const reading = read('security', output);
    expect(reading.counts).toEqual([
      { key: 'grant test files', value: 48 },
      { key: 'grant tests', value: 1083 },
      { key: 'security checks', value: 12 },
    ]);
    expect(reading.lines.at(-1)).toBe('Security checks: 11 passed, 1 failed.');
    expect(reading.problems).toEqual(['✗ apps/api/.env is tracked by git']);
  });

  it('lint: each ESLint problem by file and place, each file Prettier would change', () => {
    const output = [
      '/repo/apps/api/src/a.ts',
      '  3:7  error  Unexpected any  @typescript-eslint/no-explicit-any',
      '✖ 1 problem (1 error, 0 warnings)',
      'Checking formatting...',
      '[warn] tools/chain/src/index.ts',
      '[warn] Code style issues found in the above file. Run Prettier with --write to fix.',
    ].join('\n');
    const reading = read('lint', output);
    expect(reading.lines).toEqual(['✖ 1 problem (1 error, 0 warnings)']);
    expect(reading.problems).toEqual([
      '/repo/apps/api/src/a.ts:3:7 Unexpected any @typescript-eslint/no-explicit-any',
      '[warn] tools/chain/src/index.ts',
    ]);
    expect(read('lint', 'All matched files use Prettier code style!').lines).toEqual([
      'All matched files use Prettier code style!',
    ]);
  });

  it('e2e: every browser test counted, whatever became of it, each that failed by name', () => {
    const output = [
      'Running 7 tests using 1 worker',
      '  ✓  1 e2e/door.e2e.ts:33:1 › AC-11-01, AC-11-03: the browser build is served over HTTPS (456ms)',
      '  ✘  3 e2e/door.e2e.ts:77:1 › AC-11-61: the page is served with its policy (205ms)',
      '  1) e2e/door.e2e.ts:77:1 › AC-11-61: the page is served with its policy ',
      '    Error: expect(received).toEqual(expected) // deep equality',
      '  1 failed',
      '    e2e/door.e2e.ts:77:1 › AC-11-61: the page is served with its policy ',
      '  1 skipped',
      '  5 passed (2.4s)',
    ].join('\n');
    const reading = read('e2e', output);
    expect(reading.counts).toEqual([{ key: 'browser tests', value: 7 }]);
    expect(reading.lines).toEqual(['1 failed', '1 skipped', '5 passed (2.4s)']);
    expect(reading.problems).toEqual([
      'e2e/door.e2e.ts:77:1 › AC-11-61: the page is served with its policy',
    ]);
    expect(read('e2e', 'Error: browserType.launch: Executable doesn’t exist').counts).toEqual([]);
  });

  it('licences: the packages counted, each refused or undecided named', () => {
    const output =
      'allowed   MIT                    a@1.0.0\nrefused   SSPL-1.0               b@2.0.0\n' +
      '3 packages: 2 allowed, 1 refused, 0 undecided.';
    const reading = read('licences', output);
    expect(reading.counts).toEqual([{ key: 'licensed packages', value: 3 }]);
    expect(reading.problems).toEqual(['refused SSPL-1.0 b@2.0.0']);
  });
});

// CHAIN.md's own wording, cut down (agent_store/CHAIN.md).
const page = `# Open ADMS — The chain's counts, today

## \`pnpm ready\`

| \`pnpm installer:check\` | **37 \`✓\`**, no \`✗\`, exit 0 |
| Migrations at head | **132** (\`packages/db/prisma/migrations/\` is the list) |

## \`pnpm test\`

**\`Test Files 181 passed (181)\`, \`Tests 3152 passed (3152)\`.**

| Project | Tests | Files | Needs |
|---|---|---|---|
| \`packages/domain\` | 833 | 45 | nothing |
| \`infra/local\` | 77 | 6 | \`pnpm ready\` |

## \`pnpm lint\`, \`pnpm licences\`

- Licences: **\`454 packages: 454 allowed, 0 refused, 0 undecided.\`** on the Mac

## \`pnpm scenarios\`

\`This run’s template, adms_story_template_…: 132 migrations applied\`, then **\`Stories: 23 passed, 0
failed.\`**

| Story | Checks | | Story | Checks |
|---|---|---|---|---|
| \`ticket-101001\` | 16 | | \`p1-priced\` | 28 |

## \`pnpm e2e\`

**7 browser tests**, \`7 passed (1.9s)\`

## \`pnpm security\`

the grant tests **\`48 files, 1083
tests: 1083 passed, 0 failed\`**; ending **\`Security checks: 12 passed, 0 failed.\`**
`;

describe('CHAIN.md', () => {
  it('is read for each count in its own words, under the step it is read from', () => {
    expect(writtenCounts(page).map((c) => [c.step, c.key, c.value])).toEqual([
      ['installer:check', 'installer:check ✓', 37],
      ['installer:check', 'migrations at head', 132],
      ['test', 'test files', 181],
      ['test', 'tests', 3152],
      ['test', 'tests in packages/domain', 833],
      ['test', 'files in packages/domain', 45],
      ['test', 'tests in infra/local', 77],
      ['test', 'files in infra/local', 6],
      ['scenarios', 'story migrations', 132],
      ['scenarios', 'stories', 23],
      ['scenarios', 'checks in ticket-101001', 16],
      ['scenarios', 'checks in p1-priced', 28],
      ['e2e', 'browser tests', 7],
      ['security', 'grant test files', 48],
      ['security', 'grant tests', 1083],
      ['security', 'security checks', 12],
      ['licences', 'licensed packages', 454],
    ]);
  });

  it('writes nothing it is not read for: a page in other words gives no count, never a guess', () => {
    expect(writtenCounts('# The chain\n\nAbout three thousand tests.\n')).toEqual([]);
  });

  it('is held against what a run saw: the same, a difference, a count it does not write, one a passed step did not show', () => {
    const written = writtenCounts(page);
    const held = heldAgainst(
      [
        { key: 'tests', value: 3152 },
        { key: 'tests in packages/domain', value: 840 },
        { key: 'tests in tools/chain', value: 14 },
        { key: 'stories', value: 23 },
      ],
      written,
      new Set(['test']),
    );
    expect(held.same).toEqual([
      { key: 'tests', value: 3152 },
      { key: 'stories', value: 23 },
    ]);
    expect(held.differ).toEqual([{ key: 'tests in packages/domain', seen: 840, written: 833 }]);
    expect(held.unwritten).toEqual([{ key: 'tests in tools/chain', value: 14 }]);
    // Only the steps that passed are asked for what they did not show: scenarios did not pass.
    expect(held.unseen.map((c) => c.key)).toEqual([
      'test files',
      'files in packages/domain',
      'tests in infra/local',
      'files in infra/local',
    ]);
  });
});
