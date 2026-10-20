// What `agent_store/CHAIN.md` says the chain counts today (ADR-445, 533), and the counts a run saw
// held against it. Since ADR-594 the page's counts are one table that `pnpm chain record` writes
// from the last run, never a hand: a row `| \`step\` | count | value |` between the two markers.
// A page without the markers writes no count, never a guessed one.
import type { Count } from './steps.ts';

export interface Written extends Count {
  // The step whose output the count is read from.
  readonly step: string;
}

export const countsBegin = '<!-- counts: written by `pnpm chain record`, never by hand -->';
export const countsEnd = '<!-- end of counts -->';

const row = /^\| `([a-z:0-9-]+)` \| ([^|]+?) \| (\d+) \|$/gm;

function block(page: string): { begin: number; end: number } | undefined {
  const begin = page.indexOf(countsBegin);
  const end = begin < 0 ? -1 : page.indexOf(countsEnd, begin);
  return begin < 0 || end < 0 ? undefined : { begin, end: end + countsEnd.length };
}

export function writtenCounts(page: string): Written[] {
  const found = block(page);
  if (found === undefined) return [];
  return [...page.slice(found.begin, found.end).matchAll(row)].map((cells) => ({
    step: cells[1] ?? '',
    key: cells[2] ?? '',
    value: Number(cells[3]),
  }));
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

// What the newest run of each step saw, kept beside the logs (`seen.json`) so `pnpm chain record`
// can write it later: a run of some steps replaces those steps alone.
export interface StepSeen {
  readonly name: string;
  readonly passed: boolean;
  readonly at: string;
  readonly took: string;
  readonly counts: readonly Count[];
}

export interface Run {
  readonly steps: readonly StepSeen[];
}

export function merged(previous: Run | undefined, latest: readonly StepSeen[]): Run {
  const names = new Set(latest.map((step) => step.name));
  return {
    steps: [...(previous?.steps ?? []).filter((step) => !names.has(step.name)), ...latest],
  };
}

export interface Recorded {
  readonly page: string;
  // Every count whose value moved, came or went; `undefined` is "not there".
  readonly changed: readonly {
    readonly key: string;
    readonly from: number | undefined;
    readonly to: number | undefined;
  }[];
  // Steps of the run whose counts were left as the page had them, since they failed.
  readonly leftAsTheyWere: readonly string[];
}

// The page with each passed step's rows replaced by what the run saw (a count it no longer shows
// goes), every other step's rows kept, in the chain's order; the block is added at the end of a
// page that has none.
export function recorded(page: string, run: Run, order: readonly string[]): Recorded {
  const passed = new Set(run.steps.filter((step) => step.passed).map((step) => step.name));
  const before = writtenCounts(page);
  const kept = before.filter((count) => !passed.has(count.step));
  const fresh = run.steps
    .filter((step) => step.passed)
    .flatMap((step) => step.counts.map((count) => ({ step: step.name, ...count })));
  const rank = (step: string): number => {
    const at = order.indexOf(step);
    return at < 0 ? order.length : at;
  };
  // A stable sort: within a step, the page's order for kept rows and the run's for fresh ones.
  const rows = [...kept, ...fresh].sort((a, b) => rank(a.step) - rank(b.step));
  const steps = [...run.steps].sort((a, b) => rank(a.name) - rank(b.name));

  const lines = [
    countsBegin,
    '| Step | Its newest run | Took | Passed |',
    '|---|---|---|---|',
    ...steps.map(
      (step) => `| \`${step.name}\` | ${step.at} | ${step.took} | ${step.passed ? '✓' : '✗'} |`,
    ),
    '',
    '| Step | Count | Today |',
    '|---|---|---|',
    ...rows.map((count) => `| \`${count.step}\` | ${count.key} | ${String(count.value)} |`),
    countsEnd,
  ];
  const found = block(page);
  const next =
    found === undefined
      ? `${page.trimEnd()}\n\n${lines.join('\n')}\n`
      : page.slice(0, found.begin) + lines.join('\n') + page.slice(found.end);

  const was = new Map(before.map((count) => [count.key, count.value]));
  const now = new Map(rows.map((count) => [count.key, count.value]));
  const changed = [...new Set([...was.keys(), ...now.keys()])]
    .filter((key) => was.get(key) !== now.get(key))
    .map((key) => ({ key, from: was.get(key), to: now.get(key) }));
  const leftAsTheyWere = run.steps.filter((step) => !step.passed).map((step) => step.name);
  return { page: next, changed, leftAsTheyWere };
}
