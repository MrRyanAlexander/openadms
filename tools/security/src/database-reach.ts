// Who reaches Postgres (REQ-205; ARCHITECTURE §18; invariant 12; ADR-094, 508): of the product,
// only packages/db and the two server apps; of the tools, only those named below, each for its
// reason. And no model is written in SQL by hand: the product's own SQL is Prisma's tagged
// templates and changes no schema, and every table a migration makes is in the Prisma schema.
//
// A workspace reaches Postgres when it depends on a Postgres client, through any package, or on
// a workspace that does (pnpm's own answer, then the workspaces' package.json files); and a
// source file reaches it when it imports one, whichever workspace it sits in.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import type { Outcome, Repository } from './repository.ts';

// The packages that open a connection to Postgres, and the workspace that wraps them.
export const postgresClients = [
  'pg',
  'pg-native',
  'postgres',
  '@prisma/client',
  '@prisma/adapter-pg',
];
export const databasePackage = '@open-adms/db';

// The product: what a firm runs. Of it, only these reach Postgres (ARCHITECTURE §18). Each
// workspace is named by its folder: nothing shipped names the dev stack's package (AC-10-26).
export const productReaches = ['packages/db', 'apps/api', 'apps/worker'];
// The tools that reach it, never shipped as the product, each for its reason.
export const toolReaches: Readonly<Record<string, string>> = {
  'tools/setup': 'the installer creates the database and its logins (ADR-266)',
  'packages/scenarios': 'the harness runs each story on a database of its own (ADR-275)',
  'infra/local': "the dev stack's accounts, written through packages/db (ADR-412)",
};

// Whether a workspace, by its folder, may reach Postgres.
export function mayReach(folder: string): boolean {
  return productReaches.includes(folder) || toolReaches[folder] !== undefined;
}

// The product's own source, where its SQL is read.
export const productSource = ['packages/db/src/', 'apps/api/src/', 'apps/worker/src/'];

export interface Workspace {
  readonly name: string;
  // From the repository's root, '' for the root itself.
  readonly folder: string;
  // The workspaces it depends on, in any field of its package.json.
  readonly uses: readonly string[];
}

// Every workspace that reaches Postgres: those that depend on a client, and every one that
// depends on one of those, however far down.
export function reachingWorkspaces(
  direct: Iterable<string>,
  workspaces: readonly Workspace[],
): string[] {
  const reaching = new Set(direct);
  let grew = true;
  while (grew) {
    grew = false;
    for (const workspace of workspaces) {
      if (reaching.has(workspace.name)) continue;
      if (workspace.uses.some((name) => reaching.has(name))) {
        reaching.add(workspace.name);
        grew = true;
      }
    }
  }
  return [...reaching].sort();
}

// A module a source file names in an import, an export … from, a dynamic import or a require.
const named = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"\n]+)\1/gm;

export function modulesNamed(text: string): string[] {
  return [...text.matchAll(named)].map((match) => match[2] ?? '');
}

// Whether a module is a Postgres client, the database package, or a file inside either.
export function isPostgresModule(module: string): boolean {
  return [...postgresClients, databasePackage].some(
    (name) => module === name || module.startsWith(`${name}/`),
  );
}

// The SQL a source file hands Prisma: each tagged template's text, and each call that takes SQL
// as a plain string, which nothing guards against injection.
export interface SqlFound {
  readonly templates: readonly string[];
  readonly unsafe: readonly string[];
}

const template = /\$(?:queryRaw|executeRaw)(?:<[^`]*?>)?\s*`([^`]*)`/g;
const unsafeCall = /\$(?:queryRawUnsafe|executeRawUnsafe)\b|\bPrisma\.raw\s*\(/g;

export function sqlIn(text: string): SqlFound {
  return {
    templates: [...text.matchAll(template)].map((match) => match[1] ?? ''),
    unsafe: [...text.matchAll(unsafeCall)].map((match) => match[0]),
  };
}

// SQL that makes, changes or drops a schema's object, or its grants: modelling, or a guard,
// which belong in a migration and never in the product's code.
const schemaChange = /\b(?:CREATE|ALTER|DROP)\s+[A-Z]|\b(?:GRANT|REVOKE|TRUNCATE)\b/i;

export function changesSchema(sql: string): boolean {
  return schemaChange.test(sql);
}

const sourceFile = /\.(?:[cm]?[jt]s|tsx|jsx)$/;

export class DatabaseReach {
  private readonly repository: Repository;

  constructor(repository: Repository) {
    this.repository = repository;
  }

  run(): Outcome[] {
    const title = 'Who reaches Postgres (REQ-205; ARCHITECTURE §18; invariant 12)';
    const workspaces = this.workspaces();
    const reaching = reachingWorkspaces(this.dependOnAClient(workspaces), workspaces);
    const files = this.repository.committable().filter((file) => sourceFile.test(file));
    return [
      this.verdict(
        title,
        workspaces
          .filter((workspace) => reaching.includes(workspace.name))
          .map((one) => one.folder),
        workspaces.length,
      ),
      this.imports(title, files, workspaces),
      this.sql(title, files),
      this.migrations(title),
    ];
  }

  private verdict(title: string, reaching: readonly string[], read: number): Outcome {
    const strays = reaching.filter((folder) => !mayReach(folder));
    const product = reaching.filter((folder) => productReaches.includes(folder));
    const tools = reaching.filter((folder) => toolReaches[folder] !== undefined);
    return {
      title,
      lines: [
        `${strays.length === 0 ? '✓' : '✗'} of ${String(read)} workspaces, the product's that reach it: ${product.join(', ')}`,
        ...strays.map(
          (name) =>
            `  ${name}: reaches Postgres, and is neither the product's three nor a named tool`,
        ),
        ...tools.map((name) => `  a tool: ${name}, ${toolReaches[name] ?? ''}`),
      ],
      ok: strays.length === 0,
    };
  }

  private imports(
    title: string,
    files: readonly string[],
    workspaces: readonly Workspace[],
  ): Outcome {
    const allowed = workspaces.filter((workspace) => mayReach(workspace.folder));
    const database = workspaces.find((workspace) => workspace.name === databasePackage);
    const strays: string[] = [];
    for (const file of files) {
      const home = this.home(file, workspaces);
      if (allowed.some((workspace) => workspace.name === home.name)) continue;
      const text = readFileSync(join(this.repository.root, file), 'utf8');
      for (const module of modulesNamed(text)) {
        // A path into packages/db from outside it reaches Postgres as its name does.
        const intoDatabase =
          database !== undefined &&
          module.startsWith('.') &&
          `${relative(this.repository.root, resolve(this.repository.root, file, '..', module))}/`.startsWith(
            `${database.folder}/`,
          );
        if (isPostgresModule(module) || intoDatabase) strays.push(`  ${file}: imports ${module}`);
      }
    }
    return {
      title,
      lines: [
        `${strays.length === 0 ? '✓' : '✗'} no other workspace's source imports a Postgres client or packages/db: ${String(files.length)} source files read`,
        ...strays,
      ],
      ok: strays.length === 0,
    };
  }

  private sql(title: string, files: readonly string[]): Outcome {
    let templates = 0;
    const wrong: string[] = [];
    for (const file of files.filter((path) =>
      productSource.some((folder) => path.startsWith(folder)),
    )) {
      const found = sqlIn(readFileSync(join(this.repository.root, file), 'utf8'));
      templates += found.templates.length;
      for (const call of found.unsafe) wrong.push(`  ${file}: ${call} takes SQL as a plain string`);
      if (found.templates.some(changesSchema)) wrong.push(`  ${file}: SQL that changes the schema`);
    }
    return {
      title,
      lines: [
        `${wrong.length === 0 ? '✓' : '✗'} the product's own SQL: ${String(templates)} statements, each a Prisma tagged template, none changing the schema`,
        ...wrong,
      ],
      ok: wrong.length === 0,
    };
  }

  // Every table, column and view the migrations make is declared in the Prisma schema, so none
  // was modelled in SQL by hand. It replays the migrations in the shadow database.
  private migrations(title: string): Outcome {
    const folder = join(this.repository.root, 'packages/db');
    const result = spawnSync(
      join(folder, 'node_modules/.bin/prisma'),
      [
        'migrate',
        'diff',
        '--from-migrations',
        'prisma/migrations',
        '--to-schema',
        'prisma/schema',
        '--exit-code',
      ],
      { cwd: folder, encoding: 'utf8' },
    );
    const what = 'every table and view the migrations make is in the Prisma schema';
    if (result.status === 0 && result.stdout.includes('No difference detected.')) {
      return { title, lines: [`✓ ${what} (prisma migrate diff: no difference)`], ok: true };
    }
    // Exit 2 is a difference; its summary names tables and columns, never a value. Anything else
    // is a failure whose text could carry the database's address: say only that it stopped.
    const lines =
      result.status === 2
        ? result.stdout
            .split('\n')
            .filter((line) => /^\s*(\[[+*-]\]|-)/.test(line))
            .slice(0, 20)
            .map((line) => `  ${line.trim()}`)
        : [`  prisma migrate diff stopped (exit ${String(result.status)})`];
    return { title, lines: [`✗ ${what}`, ...lines], ok: false };
  }

  // The workspace a file sits in: the one with the longest folder holding it.
  private home(file: string, workspaces: readonly Workspace[]): Workspace {
    const holding = workspaces
      .filter((workspace) => workspace.folder === '' || file.startsWith(`${workspace.folder}/`))
      .sort((a, b) => b.folder.length - a.folder.length);
    const found = holding[0];
    if (found === undefined) throw new Error(`No workspace holds ${file}.`);
    return found;
  }

  private workspaces(): Workspace[] {
    const listed = JSON.parse(this.pnpm(['-r', 'list', '--json', '--depth', '-1'])) as {
      name: string;
      path: string;
    }[];
    const names = new Set(listed.map((workspace) => workspace.name));
    return listed.map((workspace) => {
      const manifest = JSON.parse(
        readFileSync(join(workspace.path, 'package.json'), 'utf8'),
      ) as Record<string, unknown>;
      const fields = [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
      ];
      const uses = fields.flatMap((field) =>
        Object.keys((manifest[field] as Record<string, string> | undefined) ?? {}).filter((name) =>
          names.has(name),
        ),
      );
      return { name: workspace.name, folder: relative(this.repository.root, workspace.path), uses };
    });
  }

  // The workspaces pnpm says depend on a Postgres client, directly or through any package.
  private dependOnAClient(workspaces: readonly Workspace[]): Set<string> {
    interface Dependent {
      name: string;
      dependents?: Dependent[];
    }
    const names = new Set(workspaces.map((workspace) => workspace.name));
    const found = new Set<string>();
    const walk = (dependents: readonly Dependent[] | undefined): void => {
      for (const dependent of dependents ?? []) {
        if (names.has(dependent.name)) found.add(dependent.name);
        walk(dependent.dependents);
      }
    };
    walk(JSON.parse(this.pnpm(['-r', 'why', ...postgresClients, '--json'])) as Dependent[]);
    return found;
  }

  private pnpm(args: string[]): string {
    const result = spawnSync('pnpm', args, {
      cwd: this.repository.root,
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    });
    if (result.status !== 0) throw new Error(`pnpm ${args.slice(0, 2).join(' ')} failed.`);
    return result.stdout;
  }
}
