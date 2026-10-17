// Who reaches Postgres (REQ-205; ADR-508): which workspaces may, how a reach is found through
// another workspace, what counts as importing a client, and what of the product's SQL is refused.
// The check itself runs in `pnpm security`, on the repository and the stack's shadow database.
import { describe, expect, it } from 'vitest';

import {
  changesSchema,
  isPostgresModule,
  mayReach,
  modulesNamed,
  productReaches,
  reachingWorkspaces,
  sqlIn,
  toolReaches,
  type Workspace,
} from '../src/database-reach.ts';

// A line that names a module, put together here so that this file names none itself: the check
// reads every source file, this one included.
const importing = (module: string) => `import { thing } from '${module}';`;
const raw = (call: string, sql: string) => `await tx.$${call}\`${sql}\`;`;

describe('AC-10-56 the workspaces that may reach Postgres', () => {
  it('are packages/db and the two server apps of the product, and three named tools', () => {
    expect(productReaches).toEqual(['packages/db', 'apps/api', 'apps/worker']);
    expect(Object.keys(toolReaches).sort()).toEqual([
      'infra/local',
      'packages/scenarios',
      'tools/setup',
    ]);
    for (const folder of [...productReaches, ...Object.keys(toolReaches)]) {
      expect(mayReach(folder), folder).toBe(true);
    }
    for (const folder of [
      'apps/back-office',
      'apps/field',
      'packages/domain',
      'packages/contracts',
      'tools/security',
      'tools/licences',
      '',
    ]) {
      expect(mayReach(folder), folder).toBe(false);
    }
  });
});

describe('a workspace that reaches Postgres', () => {
  const workspace = (name: string, uses: string[] = []): Workspace => ({
    name,
    folder: name.replace('@open-adms/', ''),
    uses,
  });
  const workspaces = [
    workspace('@open-adms/db'),
    workspace('@open-adms/domain'),
    workspace('@open-adms/contracts', ['@open-adms/domain']),
    workspace('@open-adms/api', ['@open-adms/contracts', '@open-adms/db']),
    workspace('@open-adms/back-office', ['@open-adms/contracts']),
    workspace('@open-adms/scenarios', ['@open-adms/api']),
  ];

  it('is one pnpm says depends on a client, and every one that depends on such, however far down', () => {
    expect(reachingWorkspaces(['@open-adms/db'], workspaces)).toEqual([
      '@open-adms/api',
      '@open-adms/db',
      '@open-adms/scenarios',
    ]);
  });

  it('is one that reaches it through a workspace that adds nothing of its own', () => {
    const through = [
      ...workspaces.filter((one) => one.name !== '@open-adms/back-office'),
      workspace('@open-adms/back-office', ['@open-adms/contracts']),
    ];
    expect(
      reachingWorkspaces(['@open-adms/contracts'], through).includes('@open-adms/back-office'),
    ).toBe(true);
  });

  it('is found whatever order the workspaces are listed in', () => {
    expect(reachingWorkspaces(['@open-adms/db'], [...workspaces].reverse())).toEqual([
      '@open-adms/api',
      '@open-adms/db',
      '@open-adms/scenarios',
    ]);
  });

  it('is none where nothing depends on a client', () => {
    expect(reachingWorkspaces([], workspaces)).toEqual([]);
  });
});

describe('a source file that imports a Postgres client', () => {
  it.each([
    'pg',
    'pg/lib/client',
    'pg-native',
    'postgres',
    '@prisma/client',
    '@prisma/adapter-pg',
    '@open-adms/db',
    '@open-adms/db/src/actor.ts',
  ])('names %s', (module) => {
    expect(modulesNamed(importing(module))).toEqual([module]);
    expect(isPostgresModule(module)).toBe(true);
  });

  it('is found by any way of naming a module', () => {
    const [pg, postgres, prisma, db] = ['pg', 'postgres', '@prisma/client', '@open-adms/db'];
    const text = [
      `import client from '${pg}';`,
      `import '${postgres}';`,
      `export { x } from "${prisma}";`,
      `const pool = require('${pg}');`,
      `const later = await import('${db}');`,
      `import {\n  a,\n  b,\n} from '${pg}';`,
    ].join('\n');
    expect(modulesNamed(text)).toEqual([
      'pg',
      'postgres',
      '@prisma/client',
      'pg',
      '@open-adms/db',
      'pg',
    ]);
  });

  it.each([
    'pg-format',
    'pgsql-ast-parser',
    '@prisma/config',
    '@open-adms/domain',
    'node:net',
    './pg.ts',
  ])('is not one that names %s', (module) => {
    expect(isPostgresModule(module)).toBe(false);
  });
});

describe("the product's own SQL", () => {
  it('is each tagged template Prisma is handed, its text read whole', () => {
    const text = [
      raw('queryRaw<{ id: string }[]>', 'SELECT uuidv7()::text AS id'),
      raw('executeRaw', 'SET TRANSACTION READ ONLY'),
      raw('queryRaw', "SELECT set_config('adms.viewer_id', ${viewerId}, true)"),
    ].join('\n');
    expect(sqlIn(text)).toEqual({
      templates: [
        'SELECT uuidv7()::text AS id',
        'SET TRANSACTION READ ONLY',
        "SELECT set_config('adms.viewer_id', ${viewerId}, true)",
      ],
      unsafe: [],
    });
  });

  it('is refused where a call takes SQL as a plain string', () => {
    const unsafe = [
      '$queryRaw' + 'Unsafe(sql)',
      '$executeRaw' + 'Unsafe(sql)',
      'Prisma.' + 'raw (sql)',
    ];
    expect(sqlIn(unsafe.join('\n')).unsafe).toEqual([
      '$queryRawUnsafe',
      '$executeRawUnsafe',
      'Prisma.raw (',
    ]);
  });

  it.each([
    'CREATE TABLE "note" ("id" uuid)',
    'alter table "field_event" add column "x" text',
    'DROP TRIGGER "device_audit" ON "device"',
    'CREATE OR REPLACE FUNCTION f() RETURNS void AS $$ $$ LANGUAGE sql',
    'CREATE VIEW "v" AS SELECT 1',
    'GRANT SELECT ON "audit_record" TO adms_api',
    'REVOKE INSERT ON "field_event" FROM adms_worker',
    'TRUNCATE "audit_record"',
  ])('changes the schema: %s', (sql) => {
    expect(changesSchema(sql)).toBe(true);
  });

  it.each([
    'SELECT uuidv7()::text AS id',
    'SET TRANSACTION READ ONLY',
    'SELECT 1',
    "SELECT pg_try_advisory_xact_lock(hashtextextended('adms.reconciliation', 0)) AS locked",
    "SELECT set_config('adms.actor_id', $1, true)",
  ])('changes nothing of the schema: %s', (sql) => {
    expect(changesSchema(sql)).toBe(false);
  });
});
