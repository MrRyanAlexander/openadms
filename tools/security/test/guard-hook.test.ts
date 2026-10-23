// The agents' guard hook (.claude/hooks/guard.sh; AGENTS.md, Git and write boundaries): each call it
// must block, and each it must let through. The hook reads the tool call as JSON on stdin and
// exits 2 to block it; anything else lets it run.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
// ADMS_GUARD_HOOK points the tests at a loosened copy, to prove each rule's removal is caught.
const hook = process.env['ADMS_GUARD_HOOK'] ?? join(root, '.claude', 'hooks', 'guard.sh');

interface Verdict {
  readonly blocked: boolean;
  readonly message: string;
}

function guard(
  tool: string,
  toolInput: Record<string, string>,
  path?: string,
  project = root,
): Verdict {
  // /bin/bash by its full path: one test empties PATH.
  const result = spawnSync('/bin/bash', [hook], {
    input: JSON.stringify({ tool_name: tool, tool_input: toolInput }),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: project,
      ...(path === undefined ? {} : { PATH: path }),
    },
  });
  return { blocked: result.status === 2, message: result.stderr };
}

const bash = (command: string): Verdict => guard('Bash', { command });
const write = (tool: string, path: string): Verdict => guard(tool, { file_path: path });

// A migration folder outside the repository, so the stub rule is tried on real files.
const scratch = mkdtempSync(join(tmpdir(), 'adms-guard-'));
const migration = (name: string, sql: string): string => {
  const folder = join(scratch, 'prisma', 'migrations', name);
  mkdirSync(folder, { recursive: true });
  const file = join(folder, 'migration.sql');
  writeFileSync(file, sql);
  return file;
};
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

// A throw-away repository on the named branch, so the commit rule is tried whatever branch this
// checkout is on.
const repository = (branch: string): string => {
  const folder = mkdtempSync(join(scratch, `repo-${branch}-`));
  spawnSync('git', ['init', '--quiet', '--initial-branch', branch, folder]);
  return folder;
};

describe('git: the agent commits its own work on a branch, never on main (AGENTS.md, Git)', () => {
  it.each([
    'cd packages/db && git push',
    'git push origin phase3-field-app',
    'git pull',
    'git status; git stash',
    'git checkout main',
    'git checkout -- apps/field/src/home.tsx',
    'git switch main',
    'git reset --hard',
    'git -C . reset HEAD~1',
    'git restore apps',
    'git clean -fd',
    'git rm -r spec',
    'git rebase main',
    'git merge main',
    'git branch -D old',
    'git branch -m new-name',
    'git tag v1',
    'git init',
    'git add apps && git commit -m "x" && git push',
  ])('blocks: %s', (command) => {
    const verdict = bash(command);
    expect(verdict.blocked).toBe(true);
    expect(verdict.message).toContain('AGENTS.md, Git');
  });

  it.each([
    'git status',
    'git diff --stat',
    'git log --oneline',
    'git --no-pager log -3',
    'git branch --show-current',
    'git check-ignore -v infra/local/.env',
    'git ls-files',
    'git add apps/field packages/domain',
    'git add -A',
    'git mv spec/old.md spec/new.md',
    'git checkout -b web-platform',
    'git switch -c web-platform',
  ])('lets through: %s', (command) => {
    expect(bash(command).blocked).toBe(false);
  });

  it('lets a commit through on a work branch', () => {
    const work = repository('web-platform');
    expect(
      guard('Bash', { command: 'git add -A && git commit -m "x"' }, undefined, work).blocked,
    ).toBe(false);
  });

  it.each(['main', 'master'])('blocks a commit on %s', (branch) => {
    const trunk = repository(branch);
    const verdict = guard('Bash', { command: 'git -C . commit -m "x"' }, undefined, trunk);
    expect(verdict.blocked).toBe(true);
    expect(verdict.message).toContain(`never commit on ${branch}`);
  });

  it('lets a commit through on main when the same command starts a branch first', () => {
    const trunk = repository('main');
    const command = 'git checkout -b web-platform && git add -A && git commit -m "x"';
    expect(guard('Bash', { command }, undefined, trunk).blocked).toBe(false);
  });
});

describe('an env file is never printed, read or written by hand', () => {
  it.each([
    'cat infra/local/.env',
    'cat apps/api/.env | grep URL',
    'cd packages/db && head -3 .env',
    'tail -n 2 "apps/worker/.env"',
    'less .env.local',
    'base64 packages/db/.env',
  ])('blocks: %s', (command) => {
    expect(bash(command).blocked).toBe(true);
  });

  it.each([
    'shasum apps/api/.env apps/worker/.env packages/db/.env',
    '(set -a; . infra/local/.env; pnpm test)',
    'cat apps/api/.env.example',
    'ls -la infra/local/.env',
    'cat spec/ARCHITECTURE.md',
    'cat packages/scenarios/src/environment.ts',
  ])('lets through: %s', (command) => {
    expect(bash(command).blocked).toBe(false);
  });

  it.each(['Read', 'Edit', 'Write'])('%s of an env file is blocked', (tool) => {
    expect(write(tool, join(root, 'apps', 'api', '.env')).blocked).toBe(true);
    expect(write(tool, join(root, 'infra', 'local', '.env.local')).blocked).toBe(true);
    expect(write(tool, join(root, 'apps', 'api', '.env.example')).blocked).toBe(false);
  });
});

describe('the write boundaries (AGENTS.md)', () => {
  it.each([
    ['development/', join(root, 'development', 'notes.md')],
    ['node_modules', join(root, 'node_modules', 'zod', 'index.js')],
    ['.git', join(root, '.git', 'config')],
    ['build output', join(root, 'packages', 'db', 'dist', 'index.js')],
    ['the generated Prisma client', join(root, 'packages', 'db', 'src', 'generated', 'client.ts')],
    ["the local stack's generated files", join(root, 'infra', 'local', '.generated', 'x.crt')],
    ["the installer's record", join(root, 'tools', 'setup', '.state', 'installation.json')],
    ['the map cache', join(root, 'infra', 'local', '.cache', 'maps', 'x.osm.pbf')],
    ['the historical root compose file', join(root, 'docker-compose.yml')],
    ['the lockfile', join(root, 'pnpm-lock.yaml')],
  ])('blocks a write to %s', (_what, path) => {
    expect(write('Write', path).blocked).toBe(true);
    expect(write('Edit', path).blocked).toBe(true);
  });

  it.each([
    join(root, 'packages', 'db', 'src', 'index.ts'),
    join(root, 'packages', 'db', 'prisma', 'schema', 'evidence.prisma'),
    join(root, 'infra', 'local', 'compose.yaml'),
    join(root, 'spec', 'DATA-MODEL.md'),
    join(root, 'agent_store', 'PLAN.md'),
    join(root, 'apps', 'api', 'README.md'),
    join(root, 'README.md'),
    join(root, 'package.json'),
  ])('lets through a write to %s', (path) => {
    expect(write('Write', path).blocked).toBe(false);
    expect(write('Edit', path).blocked).toBe(false);
  });

  it("doesn't stop a read of anything but an env file", () => {
    expect(write('Read', join(root, 'development', 'notes.md')).blocked).toBe(false);
    expect(write('Read', join(root, 'pnpm-lock.yaml')).blocked).toBe(false);
  });
});

describe('a migration is written once, into its empty stub (ADR-113)', () => {
  const stub = migration('20261001000000_stub', '-- This is an empty migration.\n\n');
  const applied = migration('20261001000001_applied', 'CREATE TABLE "x" ("id" UUID NOT NULL);\n');

  it('lets a Write into a stub that holds only comments', () => {
    expect(write('Write', stub).blocked).toBe(false);
  });

  it('blocks an Edit of the stub: a guard migration is written whole', () => {
    expect(write('Edit', stub).blocked).toBe(true);
  });

  it('blocks any change to a migration that holds SQL', () => {
    const verdict = write('Write', applied);
    expect(verdict.blocked).toBe(true);
    expect(verdict.message).toContain('never edit a generated or applied migration');
    expect(write('Edit', applied).blocked).toBe(true);
  });

  it('blocks a migration file Prisma never made', () => {
    const missing = join(scratch, 'prisma', 'migrations', '20261001000002_new', 'migration.sql');
    expect(write('Write', missing).blocked).toBe(true);
  });
});

describe('the hook itself', () => {
  it('lets other tools through', () => {
    expect(guard('WebSearch', { query: 'x' }).blocked).toBe(false);
  });

  it("fails closed when it can't read the call (no jq)", () => {
    // A PATH with bash's own basics but no jq.
    const verdict = guard('Bash', { command: 'git status' }, '/nonexistent');
    expect(verdict.blocked).toBe(true);
    expect(verdict.message).toContain('jq');
  });
});
