// What the firm calls its ADMS (the user, 2026-10-22; packages/domain's BrandName): a column of the
// firm's one settings record, the product's own name until the seed or the firm says another.
// The database holds the rule itself: trimmed, 1 to 40 characters, no control character; a change
// is audited in the security domain with what it was.
import { describe, expect, it } from 'vitest';

import type { Database } from '../src/database.ts';
import { Seed } from '../src/seed.ts';
import { refusedBy } from './support/database.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

const set = `UPDATE "firm_settings" SET "brand_name" = $1 WHERE "id" = 1`;

describe('what the firm calls its ADMS', () => {
  it('is a column of the firm’s settings, Open ADMS until the firm says another', async () => {
    const { db } = tested;
    const [row] = await db.rows<{ brand_name: string; column_default: string }>(
      `SELECT "brand_name", (SELECT "column_default" FROM information_schema.columns
        WHERE "table_name" = 'firm_settings' AND "column_name" = 'brand_name') AS "column_default"
       FROM "firm_settings" WHERE "id" = 1`,
    );
    expect(row?.column_default).toBe("'Open ADMS'::text");
    expect(typeof row?.brand_name).toBe('string');
  });

  it('is changed by the API alone, audited in the security domain with the name it was', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    const [before] = await db.rows<{ brand_name: string }>(
      `SELECT "brand_name" FROM "firm_settings" WHERE "id" = 1`,
    );
    expect(await db.run(set, ['Gates ADMS'])).toBe(1);
    expect(
      await db.rows(
        `SELECT "domain"::text, "changed_fields", "prior_value"->>'brand_name' AS "was"
         FROM "audit_record"
         WHERE "table_name" = 'firm_settings' AND "operation" = 'UPDATE' ORDER BY "id" DESC LIMIT 1`,
      ),
    ).toEqual([{ domain: 'SECURITY', changed_fields: ['brand_name'], was: before?.brand_name }]);
  });

  it('is one to forty characters, kept trimmed, with no control character in it', async () => {
    const { db, world } = tested;
    await db.as('adms_api');
    await db.actor(world.admin, 'BACK_OFFICE');
    expect(await db.run(set, ['x'.repeat(40)])).toBe(1);
    expect(await db.run(set, ['G'])).toBe(1);
    for (const name of ['', ' ', ' Gates ADMS', 'Gates ADMS ', 'x'.repeat(41), 'Gates\nADMS']) {
      expect((await db.refused(set, [name])).code, JSON.stringify(name)).toBe(refusedBy.check);
    }
  });
});

describe('the seed’s name for the firm’s ADMS', () => {
  // The seed refuses a name before it touches the database, so none is needed to ask it.
  const noDatabase = {} as Database;

  it('is refused when the database would refuse it, and is the product’s own name when none is given', () => {
    expect(() => new Seed(noDatabase, { brandName: 'x'.repeat(41) })).toThrow(/isn't one/);
    expect(() => new Seed(noDatabase, { brandName: '   ' })).toThrow(/isn't one/);
    expect(() => new Seed(noDatabase, { brandName: '  Gates ADMS ' })).not.toThrow();
    expect(() => new Seed(noDatabase)).not.toThrow();
  });
});
