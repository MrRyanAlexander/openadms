// Prisma's config for a scenario story's own database (ADR-275), used only by the scenario harness
// (`prisma migrate deploy --config prisma.story.config.js`). The same schema and migrations as
// prisma.config.js, and the same adms_owner login from the .env beside this file, on the same
// server; only the database's name changes, to ADMS_STORY_DATABASE, which must name a story's
// database (adms_story_…). So it can reach no other server, and neither the installation's own
// database nor its shadow. prisma.config.js, which the installer uses, is untouched by it.
// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig } from 'prisma/config';

const envFile = new URL('.env', import.meta.url);
if (!existsSync(envFile)) throw new Error('packages/db/.env is missing: run `pnpm installer`.');
const owner = parseEnv(readFileSync(envFile, 'utf8'))['DATABASE_URL'];
if (owner === undefined) throw new Error('packages/db/.env has no DATABASE_URL.');
const story = process.env['ADMS_STORY_DATABASE'] ?? '';
if (!/^adms_story_[a-z0-9_]+$/.test(story)) {
  throw new Error('ADMS_STORY_DATABASE must name a story database (adms_story_…).');
}
const url = new URL(owner);
url.pathname = `/${story}`;

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: url.toString() },
});
