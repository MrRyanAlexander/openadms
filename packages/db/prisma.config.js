// Prisma's config for packages/db (ADR-267). `pnpm installer` runs the migrations through it.
// The URL is adms_owner's, from the .env beside this file, which `pnpm installer` writes (ADR-266);
// that file wins over a DATABASE_URL already in the shell, so a stray one can't redirect a
// migration. Without the file (a cloud deploy), the environment's DATABASE_URL is used.
// The shadow database that `prisma migrate dev` checks migrations in is adms_shadow, reached with
// the same login; the installer creates it, as adms_owner may not create databases (ADR-268).
// `prisma db seed` runs the seed, which the installer calls after the migrations (ADR-273).
// Prisma empties the shadow database's public schema before replaying the migrations, but not the
// schema the btree_gist extension lives in; so that schema is dropped there first, or the
// migration that makes it would fail on every replay (ADR-310). It runs on adms_shadow alone.
// Prisma offers that script only under its externalTables flag; no table is named external, so
// nothing else changes.
// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig } from 'prisma/config';

const envFile = new URL('.env', import.meta.url);
const installed = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
// Prisma needs a URL even for commands that never connect (validate, format, an offline diff).
const url =
  installed['DATABASE_URL'] ??
  process.env['DATABASE_URL'] ??
  'postgresql://not-installed@127.0.0.1:1/adms';
const shadow = new URL(url);
shadow.pathname = '/adms_shadow';

export default defineConfig({
  experimental: { externalTables: true },
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node src/seed.ts',
    initShadowDb: 'DROP SCHEMA IF EXISTS "extensions" CASCADE;',
  },
  datasource: { url, shadowDatabaseUrl: shadow.toString() },
});
