// The ledger, a project's tickets to QC and lock, and a project's audit trail through their
// endpoints, against the database (REQ-406, 407; spec/acceptance/09 AC-09-08; ADR-224, 539).
// OWASP API1, API3; ASVS V8. The real process, in this test's own memory, on the installation's
// database as `adms_api`: it needs `pnpm local:up` after `pnpm installer`. Each test's work is
// undone (support/database.ts).
//
// The API's login writes no line: lines are the worker's, so the ledger here is empty and its
// total $0.00; the mission's ledger, $5,548.25 on 19 lines for P1 and $324.00 on 2 for P2, is
// read through this endpoint by the story `golden-mission`.
import { randomUUID } from 'node:crypto';

import {
  listProjectTicketsEndpoint,
  readLedgerEndpoint,
  readProjectAuditTrailEndpoint,
  setQcStatusEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation } from './support/database.ts';
import { luisHolds, p1WithTickets } from './support/review.ts';
import { luissEmail, longer, worldOn } from './support/served.ts';
import { ask, saved, told, viewerSignsIn } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);
const worldWithoutViews = worldOn(() => db, { luisSees: false });

describe('the ledger', () => {
  it('a project’s lines a page at a time with what every line the filters match comes to, the database’s exact sum: none here, so $0.00 on 0 lines, whatever the filters; a first day after the last is refused in plain words; a project nobody has is not found; a viewer is refused at the door', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis);
      const ledger = (query: string, projectId = p.project.id) =>
        ask(served, luis, readLedgerEndpoint, { ids: { projectId }, query });
      expect(saved(readLedgerEndpoint, await ledger(''))).toEqual({
        lines: [],
        total: { lines: 0, amount: '0.00' },
        next: null,
      });
      expect(
        saved(
          readLedgerEndpoint,
          await ledger(
            `?workflow=LOAD&primeId=${randomUUID()}&invoiceBatchId=${randomUUID()}&locked=true&from=2026-10-12&to=2026-10-14&limit=10`,
          ),
        ).total,
      ).toEqual({ lines: 0, amount: '0.00' });
      expect(saved(readLedgerEndpoint, await ledger('?locked=false')).total).toEqual({
        lines: 0,
        amount: '0.00',
      });
      const backwards = await ledger('?from=2026-10-14&to=2026-10-12');
      expect([...told(backwards), backwards.body]).toMatchObject([
        400,
        'BAD_REQUEST',
        { message: 'The first day comes after the last.' },
      ]);
      expect(told(await ledger('?limit=201'))).toEqual([400, 'BAD_REQUEST']);
      expect(told(await ledger('', randomUUID()))).toEqual([404, 'NOT_FOUND']);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      expect(
        told(await ask(served, viewer, readLedgerEndpoint, { ids: { projectId: p.project.id } })),
      ).toEqual([403, 'NOT_ALLOWED']);
    });
  });
});

describe('a project’s tickets to QC and lock', () => {
  it('AC-09-08 one workflow’s tickets of any status by number, each with what a mark or a lock names, its QC status and lock, what its lines come to, and why it can’t be locked now in the domain’s words; narrowed by status, QC status (NONE: no mark yet), locked or not and the days it counts on', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      await p.created('COLLECTION', '101033');
      const luis = await luisHolds(served, tx, who.luis, 'QC');
      const tickets = (query: string) =>
        ask(served, luis, listProjectTicketsEndpoint, { ids: p.ids, query });
      const loads = saved(listProjectTicketsEndpoint, await tickets('?workflow=LOAD&limit=1'));
      expect(loads).toEqual({
        tickets: [
          {
            workflow: 'LOAD',
            ticketNumber: '101031',
            statuses: ['PENDING'],
            ticketDate: '2026-10-14',
            fieldEvents: [{ id: p.collection.id, kind: 'COLLECTION', splitSuffix: '' }],
            target: null,
            qcStatus: null,
            lock: null,
            lines: 0,
            amount: '0.00',
            lockRefusal: {
              code: 'NOT_COMPLETED',
              message: 'Ticket 101031 isn’t completed yet. Nothing was locked.',
            },
          },
        ],
        next: '101031',
      });
      expect(
        saved(listProjectTicketsEndpoint, await tickets('?workflow=LOAD&after=101031')).tickets.map(
          (ticket) => ticket.ticketNumber,
        ),
      ).toEqual(['101033']);

      const record = { unitRateTicketId: p.unitRate.id };
      saved(
        setQcStatusEndpoint,
        await ask(served, luis, setQcStatusEndpoint, {
          payload: { record, status: 'QC_APPROVED' },
        }),
      );
      const unitRate = saved(listProjectTicketsEndpoint, await tickets('?workflow=UNIT_RATE'));
      expect(unitRate.tickets).toEqual([
        expect.objectContaining({
          ticketNumber: '301001',
          target: record,
          qcStatus: 'QC_APPROVED',
          lockRefusal: {
            code: 'NOT_COMPLETED',
            message: 'Ticket 301001 isn’t completed yet. Nothing was locked.',
          },
        }),
      ]);
      const numbers = async (query: string) =>
        saved(listProjectTicketsEndpoint, await tickets(query)).tickets.map(
          (ticket) => ticket.ticketNumber,
        );
      expect(await numbers('?workflow=UNIT_RATE&qcStatus=QC_APPROVED')).toEqual(['301001']);
      expect(await numbers('?workflow=UNIT_RATE&qcStatus=QC_ISSUES')).toEqual([]);
      expect(await numbers('?workflow=UNIT_RATE&qcStatus=NONE')).toEqual([]);
      expect(await numbers('?workflow=LOAD&qcStatus=NONE')).toEqual(['101031', '101033']);
      expect(await numbers('?workflow=UNIT_RATE&locked=true')).toEqual([]);
      expect(await numbers('?workflow=UNIT_RATE&locked=false')).toEqual(['301001']);
      expect(await numbers('?workflow=LOAD&status=PENDING&from=2026-10-14&to=2026-10-14')).toEqual([
        '101031',
        '101033',
      ]);
      expect(await numbers('?workflow=LOAD&from=2026-10-15')).toEqual([]);
      expect(await numbers('?workflow=LOAD&status=COMPLETED')).toEqual([]);
      expect(told(await tickets(''))).toEqual([400, 'BAD_REQUEST']);
    });
  });
});

describe('a project’s audit trail', () => {
  it('REQ-407 every change to a project’s records, newest first, a page at a time, narrowed by domain and by who made it; a manager/analyst reads only what their views let them, never the security domain', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const trail = (signed: Parameters<typeof ask>[1], query: string) =>
        ask(served, signed, readProjectAuditTrailEndpoint, { ids: p.ids, query });
      const first = saved(readProjectAuditTrailEndpoint, await trail(p.dana, '?limit=2'));
      expect(first.entries).toHaveLength(2);
      expect(first.next).not.toBeNull();
      const all = saved(readProjectAuditTrailEndpoint, await trail(p.dana, '?limit=200'));
      const ids = all.entries.map((entry) => BigInt(entry.id));
      expect(ids).toEqual([...ids].sort((left, right) => (left < right ? 1 : -1)));
      expect(
        all.entries.filter((entry) => entry.tableName === 'project').map((entry) => entry.recordId),
      ).toContain(p.project.id);
      expect(
        all.entries
          .filter((entry) => entry.tableName === 'field_event')
          .map((entry) => entry.recordId)
          .sort(),
      ).toEqual([p.collection.id, p.unitRate.id].sort());
      const danas = saved(
        readProjectAuditTrailEndpoint,
        await trail(p.dana, `?actorId=${who.dana}&limit=200`),
      );
      expect(new Set(danas.entries.map((entry) => entry.actor?.id))).toEqual(new Set([who.dana]));
      expect(
        saved(readProjectAuditTrailEndpoint, await trail(p.dana, `?actorId=${who.luis}`)).entries,
      ).toEqual([]);
      const billing = saved(
        readProjectAuditTrailEndpoint,
        await trail(p.dana, '?domain=BILLING&limit=200'),
      );
      expect(billing.entries.map((entry) => entry.tableName)).not.toContain('field_event');

      const luis = await luisHolds(served, tx, who.luis);
      const luiss = saved(readProjectAuditTrailEndpoint, await trail(luis, '?limit=200'));
      expect(luiss.entries.map((entry) => entry.id)).toEqual(all.entries.map((entry) => entry.id));
      expect(
        saved(readProjectAuditTrailEndpoint, await trail(luis, '?domain=SECURITY')).entries,
      ).toEqual([]);
      expect(
        told(
          await ask(served, luis, readProjectAuditTrailEndpoint, {
            ids: { projectId: randomUUID() },
          }),
        ),
      ).toEqual([404, 'NOT_FOUND']);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      expect(told(await trail(viewer, ''))).toEqual([403, 'NOT_ALLOWED']);
    });
  });

  it('a manager/analyst let see none of the back office’s areas is refused; one let see review alone reads a ticket’s records and not the setup’s', async () => {
    await worldWithoutViews(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const unseeing = await served.signedIn(luissEmail, longer);
      expect(
        told(await ask(served, unseeing, readProjectAuditTrailEndpoint, { ids: p.ids })),
      ).toEqual([403, 'NOT_ALLOWED']);
      const reviewing = await luisHolds(served, tx, who.luis, 'VIEW_REVIEW');
      const tables = new Set(
        saved(
          readProjectAuditTrailEndpoint,
          await ask(served, reviewing, readProjectAuditTrailEndpoint, {
            ids: p.ids,
            query: '?limit=200',
          }),
        ).entries.map((entry) => entry.tableName),
      );
      expect(tables.has('field_event')).toBe(true);
      expect(tables.has('project')).toBe(false);
    });
  });
});
