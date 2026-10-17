// What the two server apps export (ADR-503, task 2.7.1): `apps/api` and `apps/worker` are
// processes, not libraries, and their indexes are read by two workspaces alone, this harness and
// the dev stack's accounts (`infra/local`). So each exports what those read and nothing more: a
// service a story stopped calling (it reaches the endpoint now) leaves the index with it, and an
// endpoint's service is never called around its door. Needs no database.
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const at = (path: string): URL => new URL(path, import.meta.url);

// Every name an index exports, from `export { … } from` and `export type { … } from`; any other
// kind of export is listed whole, so that it can't hide a name.
const exported = (app: 'api' | 'worker'): { names: string[]; otherwise: string[] } => {
  const source = readFileSync(at(`../../../apps/${app}/src/index.ts`), 'utf8');
  const named = /export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'[^']+';/g;
  const names = [...source.matchAll(named)].flatMap(([, list]) => namesIn(list ?? ''));
  const otherwise = source
    .replace(named, '')
    .split('\n')
    .filter((line) => /^\s*export\b/.test(line));
  return { names, otherwise };
};

const namesIn = (list: string): string[] =>
  list
    .split(',')
    .map((each) => each.trim().replace(/^type\s+/, ''))
    .filter((each) => each !== '')
    .map((each) => each.split(/\s+as\s+/)[0] ?? each);

// Every name the readers take from an app: imported, or exported on from it.
const read = (app: 'api' | 'worker'): Set<string> => {
  const from = new RegExp(
    String.raw`(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@open-adms/${app}'`,
    'g',
  );
  const names = new Set<string>();
  for (const folder of [
    '../src/',
    './',
    '../../../infra/local/src/',
    '../../../infra/local/test/',
  ]) {
    const files = readdirSync(at(folder), { recursive: true, encoding: 'utf8' }).filter((file) =>
      file.endsWith('.ts'),
    );
    for (const file of files) {
      const source = readFileSync(at(`${folder}${file}`), 'utf8');
      for (const [, list] of source.matchAll(from))
        for (const name of namesIn(list ?? '')) names.add(name);
    }
  }
  return names;
};

describe('what the server apps export', () => {
  it.each(['api', 'worker'] as const)(
    'apps/%s exports only what the harness and the dev stack’s accounts read, each by name',
    (app) => {
      const { names, otherwise } = exported(app);
      const readHere = read(app);
      expect(otherwise).toEqual([]);
      expect(names.filter((name) => !readHere.has(name))).toEqual([]);
      expect(names.length).toBeGreaterThan(0);
    },
  );
});
