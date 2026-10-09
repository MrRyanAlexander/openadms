// The one way the API reads for a read-only viewer (BACKLOG 2.4.5, C22; ARCHITECTURE §5.5;
// spec/acceptance/10-api-and-sync.md AC-10-30, 31; ADR-270 (7), 315, 434): a read through $viewed
// is the read-only login's, states its viewer first, can write nothing, and the viewer ends with
// its transaction. What the database then shows the stated viewer is `viewers.test.ts`'s,
// `row-level-security.test.ts`'s and `contractor-users.test.ts`'s. Each test connects as the
// login itself, with the URL the installer wrote, and writes nothing.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Prisma, PrismaClient } from '../src/generated/prisma/client.ts';
import type { ViewerDatabase } from '../src/viewer.ts';
import { GuardedDatabase } from './support/database.ts';
import { openViewerOnOneConnection } from './support/service.ts';

let viewed: ViewerDatabase;
// The same connection with no viewer's read open on it: never the API's to hold.
let connection: PrismaClient;

beforeAll(async () => {
  // Refuses a database that isn't at head or hasn't been seeded.
  await (await GuardedDatabase.open()).close();
  // One connection, so that whatever follows a read is on the same one.
  ({ viewed, client: connection } = openViewerOnOneConnection());
});

afterAll(async () => {
  await viewed.$disconnect();
});

interface Stated {
  user: string;
  viewer: string;
  readOnly: string;
}

// Who the database sees reading, as its viewer policies read it.
async function stated(tx: Prisma.TransactionClient): Promise<Stated> {
  const [row] = await tx.$queryRaw<Stated[]>`SELECT current_user AS "user",
    current_setting('adms.viewer_id', true) AS viewer,
    current_setting('transaction_read_only') AS "readOnly"`;
  if (row === undefined) throw new Error('No settings row.');
  return row;
}

async function refusal(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected a refusal, but it ran.');
}

describe('a read through $viewed', () => {
  it('AC-10-30 is the read-only login’s, states its viewer before it reads, and can write nothing', async () => {
    const viewer = randomUUID();
    expect(await viewed.$viewed(viewer, stated)).toEqual({
      user: 'adms_readonly',
      viewer,
      readOnly: 'on',
    });
  });

  it('AC-10-30 the viewer ends with its read: the next on the same connection states its own', async () => {
    const [first, second] = [randomUUID(), randomUUID()];
    expect((await viewed.$viewed(first, stated)).viewer).toBe(first);
    expect((await viewed.$viewed(second, stated)).viewer).toBe(second);
  });

  it('AC-10-30 nothing of the viewer is left on the connection once the read is over', async () => {
    expect((await viewed.$viewed(randomUUID(), stated)).viewer).not.toBe('');
    const [after] = await connection.$queryRaw<
      { viewer: string | null }[]
    >`SELECT current_setting('adms.viewer_id', true) AS viewer`;
    expect(after?.viewer ?? '').toBe('');
  });

  it('AC-10-30 with no viewer, or something that is no person’s id, runs nothing', async () => {
    for (const noViewer of ['', ' ', 'none', '*', `${randomUUID()}' OR true --`]) {
      let ran = false;
      const said = await refusal(
        viewed.$viewed(noViewer, () => {
          ran = true;
          return Promise.resolve();
        }),
      );
      expect(said).toBe('A viewer’s read states the viewer: a person’s own id.');
      expect(ran).toBe(false);
    }
  });

  it('AC-10-30 stated as somebody the firm issued no viewer’s login, reads no project', async () => {
    const nobody = randomUUID();
    expect(
      await viewed.$viewed(nobody, (tx) =>
        tx.project.findMany({
          select: { id: true, name: true, timeZone: true, createdAt: true, closedAt: true },
        }),
      ),
    ).toEqual([]);
  });

  it('AC-02-81 reads only the columns the login is granted: a project’s settings are refused whoever is stated', async () => {
    const said = await refusal(
      viewed.$viewed(randomUUID(), (tx) =>
        tx.project.findMany({ select: { id: true, loadCallLowLimit: true } }),
      ),
    );
    expect(said).toContain('permission denied');
  });

  it('AC-10-30 the owner’s views the schema declares are the database’s own, column for column, and show nobody anything', async () => {
    // A view is made by a guard migration and only declared to Prisma (ADR-435): a column the
    // declaration names and the view doesn't hold would be the database's refusal here.
    const nobody = randomUUID();
    expect(
      await viewed.$viewed(nobody, async (tx) => [
        await tx.viewerTransactionMoney.findMany(),
        await tx.viewerRoeCitizen.findMany(),
        await tx.viewerPayItemName.findMany(),
        await tx.viewerDisposalSiteName.findMany(),
        await tx.viewerDebrisTypeName.findMany(),
        await tx.viewerFieldEventMonitor.findMany(),
      ]),
    ).toEqual([[], [], [], [], [], []]);
    // And the declaration leaves no column of a view out.
    const columns = await viewed.$viewed(
      nobody,
      (tx) => tx.$queryRaw<{ view: string; columns: string }[]>`
        SELECT c.relname AS view, string_agg(a.attname, ' ' ORDER BY a.attnum) AS columns
        FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
        WHERE c.relkind = 'v' AND c.relname IN ('viewer_transaction_money', 'viewer_roe_citizen',
          'viewer_pay_item_name', 'viewer_disposal_site_name', 'viewer_debris_type_name',
          'viewer_field_event_monitor')
        GROUP BY c.relname ORDER BY 1`,
    );
    expect(columns).toEqual([
      { view: 'viewer_debris_type_name', columns: 'id project_id name' },
      { view: 'viewer_disposal_site_name', columns: 'id project_id name' },
      { view: 'viewer_field_event_monitor', columns: 'id name monitor_number' },
      { view: 'viewer_pay_item_name', columns: 'id project_id code description' },
      { view: 'viewer_roe_citizen', columns: 'id project_id owner_name' },
      { view: 'viewer_transaction_money', columns: 'id project_id rate amount' },
    ]);
  });

  it('AC-10-31 a write in it is refused', async () => {
    const said = await refusal(
      viewed.$viewed(randomUUID(), (tx) => tx.client.create({ data: { name: 'Bayline County' } })),
    );
    expect(said).toMatch(/read-only transaction|permission denied/);
  });
});
