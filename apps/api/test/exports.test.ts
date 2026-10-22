// The exports, photo PDFs and the receipt batch through their endpoints, against the database
// (REQ-412, 413, 414; spec/FROM-BUILD-1.md §1, §10; AC-09-27, 28): each a download that is never
// run, made each time and kept nowhere. The real process, in this test's own memory, on the
// installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm installer`. Each
// test's work is undone. And the table writer itself: a cell a spreadsheet would run is text.
import { exportFileEndpoint, photoPdfEndpoint, receiptBatchEndpoint } from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { numbersIn } from '../src/reports/documents.ts';
import { safeCell, tableFile } from '../src/reports/table-file.ts';
import { installationSettings, openInstallation } from './support/database.ts';
import { luisHolds, p1WithTickets } from './support/review.ts';
import { worldOn } from './support/served.ts';
import { ask, told, viewerSignsIn } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

describe('a table written as a file', () => {
  it('ASVS 1.3.3 a cell beginning =, +, -, @, a tab or a carriage return is written as text; a plain number stays a number', () => {
    expect(
      ['=SUM(A1)', '+1', '-cmd', '@x', '\tx', '\rx', '-12.5', '7', 'Vegetative', null].map(
        safeCell,
      ),
    ).toEqual(["'=SUM(A1)", "'+1", "'-cmd", "'@x", "'\tx", "'\rx", '-12.5', '7', 'Vegetative', '']);
  });

  it('REQ-412 CSV quoted as RFC 4180 has it, CRLF lines; Excel-compatible the same led by its byte order mark; JSON rows by column name', () => {
    const columns = [
      { name: 'ticket', cell: (row: { n: string; note: string }) => row.n },
      { name: 'note', cell: (row: { n: string; note: string }) => row.note },
    ];
    const rows = [{ n: '101001', note: 'Heaped, "photos confirm"' }];
    const csv = new TextDecoder().decode(tableFile('csv', columns, rows).bytes);
    expect(csv).toBe('ticket,note\r\n101001,"Heaped, ""photos confirm"""\r\n');
    const excel = tableFile('excel', columns, rows).bytes;
    expect([...excel.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(JSON.parse(new TextDecoder().decode(tableFile('json', columns, rows).bytes))).toEqual([
      { ticket: '101001', note: 'Heaped, "photos confirm"' },
    ]);
  });

  it('REQ-414 numbers pasted with any separator, each once, in order', () => {
    expect(numbersIn('101001, 101002;101003\n101001  301004')).toEqual([
      '101001',
      '101002',
      '101003',
      '301004',
    ]);
  });
});

describe('the exports, photo PDFs and the receipt batch', () => {
  it('REQ-412 a project’s tickets, transactions, certifications and audit history as CSV, Excel-compatible CSV and JSON, sent as downloads that are never run; a viewer is refused at the door', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis);
      const exported = (dataset: string, query: string) =>
        ask(served, luis, exportFileEndpoint, {
          ids: { projectId: p.project.id, dataset },
          query,
        });
      const tickets = await exported('tickets', '?format=csv&workflow=LOAD');
      expect(tickets.status).toBe(200);
      expect(tickets.headers).toMatchObject({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="tickets.csv"',
        'x-content-type-options': 'nosniff',
      });
      const ticketLines = tickets.bytes.toString('utf8').trimEnd().split('\r\n');
      expect(ticketLines[0]).toBe(
        'workflow,ticket_number,ticket_date,statuses,field_events,qc_status,locked,invoice_batch,lines,amount,why_not_lockable',
      );
      expect(ticketLines.some((line) => line.startsWith('LOAD,101031,'))).toBe(true);
      const ledger = await exported('transactions', '?format=json');
      expect(ledger.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(JSON.parse(ledger.bytes.toString('utf8'))).toEqual([]);
      const certifications = await exported('certifications', '?format=excel');
      expect([...certifications.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      expect(certifications.bytes.toString('utf8')).not.toMatch(/phone|licence/i);
      const audit = await exported('audit-history', '?format=csv');
      expect(audit.bytes.toString('utf8')).toContain('field_event');
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      expect(
        told(
          await ask(served, viewer, exportFileEndpoint, {
            ids: { projectId: p.project.id, dataset: 'transactions' },
            query: '?format=csv',
          }),
        ),
      ).toEqual([403, 'NOT_ALLOWED']);
    });
  });

  it('REQ-413, 414 a photo PDF in each layout; the receipt batch, its first page naming the number the project doesn’t have, then each field event’s receipt; the full record the same with its details', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis);
      for (const layout of ['several', 'one']) {
        const photos = await ask(served, luis, photoPdfEndpoint, {
          ids: { projectId: p.project.id },
          query: `?items=tickets&layout=${layout}&numbers=101031`,
        });
        expect(photos.status).toBe(200);
        expect(photos.headers['content-type']).toBe('application/pdf');
        const file = photos.bytes.toString('latin1');
        expect(file.startsWith('%PDF-1.4\n')).toBe(true);
        expect(file).toContain('(Collection \\(COL\\) 101031) Tj');
      }
      const batch = (content: string) =>
        ask(served, luis, receiptBatchEndpoint, {
          ids: { projectId: p.project.id },
          query: `?numbers=${encodeURIComponent('101031, 109999')}&content=${content}`,
        });
      const receipts = (await batch('receipts')).bytes.toString('latin1');
      expect(receipts).toContain('(Not found on this project: 109999.) Tj');
      expect(receipts).toContain('(Ticket 101031) Tj');
      expect(receipts.match(/\/Type \/Page /g)).toHaveLength(2);
      const full = (await batch('full')).bytes.toString('latin1');
      expect(full).toContain('(Collection \\(COL\\) 101031) Tj');
      expect(full).toMatch(/\(Monitor: /);
    });
  });
});
