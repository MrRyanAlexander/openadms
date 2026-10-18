// What `agent_store/CHAIN.md` says the chain counts today (ADR-445, 533), read from the page's own
// wording, and the counts a run saw held against it. A count the page doesn't write in its usual
// words is "not written there", never guessed.
import type { Count } from './steps.ts';

export interface Written extends Count {
  // The step whose output the count is read from.
  readonly step: string;
}

// The part of the page under a `## ` heading that starts with `title`.
function section(page: string, title: string): string {
  return page.split(/^## /m).find((part) => part.startsWith(title)) ?? '';
}

function first(page: string, pattern: RegExp): number | undefined {
  const found = pattern.exec(page)?.[1];
  return found === undefined ? undefined : Number(found);
}

export function writtenCounts(page: string): Written[] {
  const written: Written[] = [];
  const add = (step: string, key: string, value: number | undefined): void => {
    if (value !== undefined) written.push({ step, key, value });
  };
  add('installer:check', 'installer:check ✓', first(page, /\*\*(\d+) `✓`\*\*/));
  add('installer:check', 'migrations at head', first(page, /Migrations at head \| \*\*(\d+)\*\*/));

  const tests = section(page, '`pnpm test`');
  add('test', 'test files', first(tests, /Test Files (\d+) passed \(\d+\)/));
  add('test', 'tests', first(tests, /Tests (\d+) passed \(\d+\)/));
  for (const row of tests.matchAll(/^\| `([a-z]+\/[a-z-]+)` \| (\d+) \| (\d+) \|/gm)) {
    add('test', `tests in ${row[1] ?? ''}`, Number(row[2]));
    add('test', `files in ${row[1] ?? ''}`, Number(row[3]));
  }

  const stories = section(page, '`pnpm scenarios`');
  add('scenarios', 'story migrations', first(stories, /(\d+) migrations applied/));
  const passed = /Stories: (\d+) passed, (\d+)\s+failed/.exec(stories);
  if (passed?.[1] !== undefined && passed[2] !== undefined) {
    add('scenarios', 'stories', Number(passed[1]) + Number(passed[2]));
  }
  for (const cell of stories.matchAll(/`([a-z0-9-]+)` \| (\d+) \|/g)) {
    add('scenarios', `checks in ${cell[1] ?? ''}`, Number(cell[2]));
  }

  const browserTests = section(page, '`pnpm e2e`');
  add('e2e', 'browser tests', first(browserTests, /\*\*(\d+) browser tests\*\*/));
  add('e2e', 'screens', first(browserTests, /\*\*(\d+) screens? of the app\*\*/));

  const checks = section(page, '`pnpm security`');
  const grants = /(\d+) files, (\d+)\s+tests: \d+ passed/.exec(checks);
  if (grants?.[1] !== undefined && grants[2] !== undefined) {
    add('security', 'grant test files', Number(grants[1]));
    add('security', 'grant tests', Number(grants[2]));
  }
  const ending = /Security checks: (\d+) passed, (\d+) failed/.exec(checks);
  if (ending?.[1] !== undefined && ending[2] !== undefined) {
    add('security', 'security checks', Number(ending[1]) + Number(ending[2]));
  }

  add('licences', 'licensed packages', first(page, /(\d+) packages: \d+ allowed/));
  return written;
}

export interface Held {
  readonly same: readonly Count[];
  readonly differ: readonly {
    readonly key: string;
    readonly seen: number;
    readonly written: number;
  }[];
  // Seen, and the page writes no such count.
  readonly unwritten: readonly Count[];
  // Written, of a step that passed, and the run saw no such count.
  readonly unseen: readonly Written[];
}

export function heldAgainst(
  seen: readonly Count[],
  written: readonly Written[],
  passedSteps: ReadonlySet<string>,
): Held {
  const byKey = new Map(written.map((count) => [count.key, count]));
  const seenKeys = new Set(seen.map((count) => count.key));
  const same: Count[] = [];
  const differ: { key: string; seen: number; written: number }[] = [];
  const unwritten: Count[] = [];
  for (const count of seen) {
    const expected = byKey.get(count.key);
    if (expected === undefined) unwritten.push(count);
    else if (expected.value === count.value) same.push(count);
    else differ.push({ key: count.key, seen: count.value, written: expected.value });
  }
  const unseen = written.filter((count) => passedSteps.has(count.step) && !seenKeys.has(count.key));
  return { same, differ, unwritten, unseen };
}
