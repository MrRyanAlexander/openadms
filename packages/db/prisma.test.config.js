// Prisma's config for a test's database (src/test-database.ts): the installation's test database,
// adms_test, which the installer migrates and seeds through it beside adms; a story's own, which
// the scenario harness migrates (ADR-275); a copy a guard stub is tried on. The same schema,
// migrations and seed as prisma.config.js, and the same adms_owner login from the .env beside this
// file, on the same server; only the database's name changes, to ADMS_TEST_DATABASE, which must
// name a test's database. So it can reach no other server, and neither the installation's own
// database nor its shadow. prisma.config.js, which the installer migrates adms through, is
// untouched by it. The URL asks TLS alone; Prisma's engine is handed it in its own words
// (prisma.url.js; ADR-517).
// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig } from 'prisma/config';

import { schemaEngineUrl } from './prisma.url.js';
import { atTestDatabase } from './src/test-database.ts';

const envFile = new URL('.env', import.meta.url);
if (!existsSync(envFile)) throw new Error('packages/db/.env is missing: run `pnpm installer`.');
const owner = parseEnv(readFileSync(envFile, 'utf8'))['DATABASE_URL'];
if (owner === undefined) throw new Error('packages/db/.env has no DATABASE_URL.');
const named = process.env['ADMS_TEST_DATABASE'];
if (named === undefined) {
  throw new Error("ADMS_TEST_DATABASE must name the test's database this config reaches.");
}

export default defineConfig({
  schema: 'prisma/schema',
  // The same seed, told to seed the database ADMS_TEST_DATABASE names (src/seed.ts).
  migrations: { path: 'prisma/migrations', seed: 'node src/seed.ts --test-database' },
  datasource: { url: schemaEngineUrl(atTestDatabase(owner, named)) },
});
