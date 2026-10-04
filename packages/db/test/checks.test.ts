// The checks Prisma can't declare, and the keys it does (ARCHITECTURE §5.4; ADR-270 (1)): a field
// event's kind belongs to its workflow; a load call is 0-100 and only where it's taken; one field
// event of each kind per ticket; a completed load's links unique (invariant 17).
import { describe, expect, it } from 'vitest';

import { refusedBy } from './support/database.ts';
import { eventInsertOf, fieldEventLike } from './support/example-world.ts';
import { eachTestRolledBack } from './support/lifecycle.ts';

const tested = eachTestRolledBack();

interface Synced {
  workflow: string;
  kind: string;
  ticketNumber: string;
  splitSuffix?: string;
  loadCall?: number | null;
  estimateCy?: number;
}

// A field event on P1 as the API writes it at sync; the test picks the shape.
function syncStatement(event: Synced): [string, unknown[]] {
  return eventInsertOf(
    fieldEventLike(tested.world, {
      workflow: event.workflow,
      kind: event.kind,
      ticket_number: event.ticketNumber,
      split_suffix: event.splitSuffix ?? '',
      load_call: event.loadCall ?? null,
      estimate_cy: event.estimateCy ?? null,
    }),
  );
}

async function sync(event: Synced): Promise<void> {
  expect(await tested.db.run(...syncStatement(event))).toBe(1);
}

async function refusedSync(event: Synced): Promise<string> {
  return (await tested.db.refused(...syncStatement(event))).code;
}

describe('a field event', () => {
  it('belongs to its workflow', async () => {
    await tested.db.as('adms_api');
    for (const [workflow, kind] of [
      ['LOAD', 'UNIT_RATE'],
      ['LOAD', 'HAUL_OUT_COLLECTION'],
      ['HAUL_OUT', 'COLLECTION'],
      ['HAUL_OUT', 'DISPOSAL'],
      ['UNIT_RATE', 'DISPOSAL'],
    ] as const) {
      expect(
        await refusedSync({ workflow, kind, ticketNumber: '101020' }),
        `${workflow} ${kind}`,
      ).toBe(refusedBy.check);
    }
    await sync({ workflow: 'HAUL_OUT', kind: 'HAUL_OUT_DISPOSAL', ticketNumber: '201001' });
    await sync({ workflow: 'UNIT_RATE', kind: 'UNIT_RATE', ticketNumber: '301001' });
  });

  it("carries a load call 0-100, only at the tower or a haul-out's loading end", async () => {
    await tested.db.as('adms_api');
    for (const [kind, loadCall] of [
      ['DISPOSAL', 101],
      ['DISPOSAL', -1],
      ['COLLECTION', 50],
      ['HAUL_OUT_DISPOSAL', 50],
    ] as const) {
      const workflow = kind.startsWith('HAUL_OUT') ? 'HAUL_OUT' : 'LOAD';
      expect(
        await refusedSync({ workflow, kind, ticketNumber: '101021', loadCall }),
        `${kind} ${String(loadCall)}`,
      ).toBe(refusedBy.check);
    }
    // A 0 is accepted and flagged (ADR-116); missing is allowed (a weight or a count instead).
    await sync({ workflow: 'LOAD', kind: 'DISPOSAL', ticketNumber: '101022', loadCall: 0 });
    await sync({ workflow: 'LOAD', kind: 'DISPOSAL', ticketNumber: '101023', loadCall: null });
    await sync({
      workflow: 'HAUL_OUT',
      kind: 'HAUL_OUT_COLLECTION',
      ticketNumber: '201002',
      loadCall: 100,
    });
  });

  it('is one of each kind per project, workflow, bare number and split suffix', async () => {
    await tested.db.as('adms_api');
    expect(
      await refusedSync({ workflow: 'LOAD', kind: 'COLLECTION', ticketNumber: '101001' }),
    ).toBe(refusedBy.unique);
    // A split load's collections, one per property, each with its estimate (ADR-055, 325), and a
    // unit rate ticket reusing the number.
    for (const [splitSuffix, estimateCy] of [
      ['A', 12],
      ['B', 18],
    ] as const) {
      await sync({
        workflow: 'LOAD',
        kind: 'COLLECTION',
        ticketNumber: '102001',
        splitSuffix,
        estimateCy,
      });
    }
    await sync({ workflow: 'UNIT_RATE', kind: 'UNIT_RATE', ticketNumber: '101001' });
  });
});

describe('a completed load', () => {
  it("links each field event once, so a load can't bill twice", async () => {
    const { db, world } = tested;
    // Two events no completed load links yet, so each attempt below breaks exactly one key.
    await db.as('adms_api');
    await sync({ workflow: 'LOAD', kind: 'COLLECTION', ticketNumber: '101040' });
    await sync({ workflow: 'LOAD', kind: 'DISPOSAL', ticketNumber: '101040', loadCall: 60 });
    const unlinked = await db.one<{ collection: string; disposal: string }>(
      `SELECT max("id"::text) FILTER (WHERE "kind" = 'COLLECTION') AS collection,
         max("id"::text) FILTER (WHERE "kind" = 'DISPOSAL') AS disposal
       FROM "field_event" WHERE "project_id" = $1 AND "ticket_number" = '101040'`,
      [world.p1],
    );
    const linked = world.loads.l101001;
    await db.as('adms_worker');
    await db.actor(world.worker, 'SYSTEM');
    const conclude = `INSERT INTO "completed_load" ("project_id", "ticket_number", "collection_event_id", "disposal_event_id", "updated_at")
       VALUES ($1, $2, $3, $4, now())`;
    for (const [what, ticket, collectionId, disposalId] of [
      ['its collection again', '101040', linked.collection, unlinked.disposal],
      ['its disposal again', '101040', unlinked.collection, linked.disposal],
      ['its ticket number again', '101001', unlinked.collection, unlinked.disposal],
    ]) {
      expect(
        (await db.refused(conclude, [world.p1, ticket, collectionId, disposalId])).code,
        what,
      ).toBe(refusedBy.unique);
    }
    expect(
      await db.run(conclude, [world.p1, '101040', unlinked.collection, unlinked.disposal]),
    ).toBe(1);
  });
});
