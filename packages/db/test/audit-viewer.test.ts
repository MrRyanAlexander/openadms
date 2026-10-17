// The audit log as a read-only viewer reads it (spec/acceptance/10-api-and-sync.md AC-10-111;
// ARCHITECTURE §5.3, §5.5; ADR-097, 315, 361, 544; the Phase 2 audit's F5): the owner's view
// `viewer_audit_record`, which asks the viewer's questions itself. Read as the read-only login
// with the viewer stated, as `ViewerDatabase.$viewed` reads it.
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { backOfficeEventLike, eventInsertOf } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();
const reason = 'A note a correction carries';

async function asTheApi(): Promise<void> {
  const { db, world } = tested;
  await db.as('adms_api');
  await db.actor(world.admin, 'BACK_OFFICE', { reason });
}

// What the viewer is shown of the log about one record, oldest first.
async function shown(viewerId: string, recordId: string) {
  const { db } = tested;
  await db.viewer(viewerId);
  await db.as('adms_readonly');
  const rows = await db.rows<{
    operation: string;
    changed_fields: string[];
    prior_value: Record<string, unknown> | null;
    new_value: Record<string, unknown> | null;
    actor_name: string | null;
    source: string;
  }>(
    `SELECT "operation"::text, "changed_fields", "prior_value", "new_value", "actor_name",
       "source"::text
     FROM "viewer_audit_record" WHERE "record_id" = $1 ORDER BY "id"`,
    [recordId],
  );
  await db.administer();
  return rows;
}

describe('the audit log, as a viewer reads it (ADR-544)', () => {
  it('AC-10-111 a client user and an auditor are shown the changes to their project’s records, who made each and from where; a contractor user, and a viewer not given the project, nothing', async () => {
    const { db, world } = tested;
    await asTheApi();
    const { id } = await db.one<{ id: string }>(...eventInsertOf(backOfficeEventLike(world)));
    await db.run(`UPDATE "field_event" SET "notes" = 'Loaded from the alley.' WHERE "id" = $1`, [
      id,
    ]);
    const onP2 = await db.one<{ id: string }>(
      ...eventInsertOf(
        backOfficeEventLike(world, {
          project_id: world.p2,
          ticket_number: '201020',
          certification_id: null,
        }),
      ),
    );
    for (const viewer of [world.clientViewer, world.auditor]) {
      const rows = await shown(viewer, id);
      expect(
        rows.map((row) => [row.operation, row.actor_name, row.source, row.new_value?.['notes']]),
        viewer,
      ).toEqual([
        ['INSERT', 'Dana Reyes', 'BACK_OFFICE', null],
        ['UPDATE', 'Dana Reyes', 'BACK_OFFICE', 'Loaded from the alley.'],
      ]);
      expect(rows[1]?.changed_fields).toEqual(['notes']);
    }
    // Coastline's contractor user is shown none, however its own; Bayline's client user, given
    // P1 alone, none of P2's; the auditor, given both, P2's too.
    expect(await shown(world.coastlineViewer, id)).toEqual([]);
    expect(await shown(world.clientViewer, onP2.id)).toEqual([]);
    expect(await shown(world.auditor, onP2.id)).toHaveLength(1);
  });

  it('AC-10-111 of each change, only the columns the read-only login may read: a certification’s driver’s phone never, in the values or in what changed; never why, or which request; the log’s security domain never; and nobody stated, nothing', async () => {
    const { db, world } = tested;
    await asTheApi();
    await db.run(
      `UPDATE "certification" SET "driver_phone" = '3025550199', "tag_number" = 'DE 4471' WHERE "id" = $1`,
      [world.certifications.c730415],
    );
    const [, change] = (await shown(world.clientViewer, world.certifications.c730415)).slice(-2);
    expect(change?.changed_fields).toEqual(['tag_number']);
    expect(Object.keys(change?.new_value ?? {})).not.toContain('driver_phone');
    expect(Object.keys(change?.prior_value ?? {})).not.toContain('driver_phone');
    expect(change?.new_value?.['tag_number']).toBe('DE 4471');
    // What the view holds: no reason, no request.
    const columns = await db.rows<{ name: string }>(
      `SELECT attname::text AS name FROM pg_attribute
       WHERE attrelid = 'viewer_audit_record'::regclass AND attnum > 0 ORDER BY attnum`,
    );
    expect(columns.map(({ name }) => name)).toEqual([
      'id',
      'occurred_at',
      'table_name',
      'record_id',
      'operation',
      'changed_fields',
      'prior_value',
      'new_value',
      'actor_id',
      'actor_name',
      'source',
      'device_id',
      'project_id',
    ]);
    // The security domain: a person's sign-in record is never one of a project's.
    await db.viewer(world.auditor);
    await db.as('adms_readonly');
    expect(
      (
        await db.one<{ count: number }>(
          `SELECT count(*)::int AS count FROM "viewer_audit_record"
           WHERE "table_name" IN ('user_credential', 'session', 'security_event', 'user')`,
        )
      ).count,
    ).toBe(0);
    // Nobody stated: nothing; and the log itself is the read-only login's never.
    await db.noViewer();
    expect(
      (await db.one<{ count: number }>(`SELECT count(*)::int AS count FROM "viewer_audit_record"`))
        .count,
    ).toBe(0);
    expect((await db.refused(`SELECT 1 FROM "audit_record" LIMIT 1`)).code).toBe(refusedBy.grant);
  });
});
