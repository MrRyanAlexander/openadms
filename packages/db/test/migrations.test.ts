// An applied migration is never edited (invariant 18; ADR-113, 276; BACKLOG carry-forward C5). The
// guard hook stops the agent's file tools, but not a shell command; this catches any edit: each
// migration.sql must still hash to the checksum Prisma recorded when it applied it (the file's
// SHA-256), so the history on disk is the history the database ran.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

const folder = new URL('../prisma/migrations/', import.meta.url);

function onDisk(): { name: string; checksum: string }[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => ({
      name,
      checksum: createHash('sha256')
        .update(readFileSync(new URL(`${name}/migration.sql`, folder)))
        .digest('hex'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe('the migration history', () => {
  it('every applied migration is unchanged on disk, applied once, and nothing else was applied', async () => {
    const applied = await tested.db.rows<{ name: string; checksum: string }>(
      `SELECT migration_name AS name, checksum FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
    );
    expect(applied).toEqual(onDisk());
  });
});
