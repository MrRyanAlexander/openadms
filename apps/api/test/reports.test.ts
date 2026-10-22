// A project's reports through their endpoints, against the database (REQ-409, 410; spec/
// FROM-BUILD-1.md §9): the debris totals, the email summary in the user's shape, and the daily
// report's PDF, each read afresh, never a cost. The real process, in this test's own memory, on
// the installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm installer`.
// Each test's work is undone.
//
// The API's login writes no completed load or haul-out: those are the worker's, so what counts
// here is the unit rate work made in the back office; the mission's totals are the story's.
import { randomUUID } from 'node:crypto';

import {
  changeReportContactEndpoint,
  dailyReportFileEndpoint,
  readDebrisTotalsEndpoint,
  readEmailSummaryEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { luisHolds, p1WithTickets } from './support/review.ts';
import { worldOn, type Served } from './support/served.ts';
import { ask, saved, told, viewerSignsIn } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// P1 with Dana's two pending tickets of 14 October, and on the 15th the crew's three hangers.
async function p1WithHangers(served: Served, tx: Tx, within: Database, who: { dana: string }) {
  const p = await p1WithTickets(served, tx, within, who);
  const hangers = await tx.payableType.findFirstOrThrow({ where: { name: 'Hangers' } });
  await p.created('UNIT_RATE', '301002', {
    payableTypeId: hangers.id,
    unitCount: 3,
    startedAt: new Date('2026-10-15T14:00:00Z'),
    endedAt: new Date('2026-10-15T14:20:00Z'),
  });
  return { ...p, hangers };
}

describe('debris totals', () => {
  it('REQ-409 what a project moved over a range of days in its time zone, never a cost: here the crew’s hangers on the 15th, counted by payable type, no load or haul-out (none is completed), each day’s counts; a void or pending load counts nowhere; a range past 366 days, or backwards, is refused in plain words; a viewer is refused at the door', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithHangers(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis);
      const totals = (query: string) =>
        ask(served, luis, readDebrisTotalsEndpoint, { ids: p.ids, query });
      const read = saved(readDebrisTotalsEndpoint, await totals('?from=2026-10-15&to=2026-10-16'));
      expect(read).toMatchObject({
        project: {
          id: p.project.id,
          name: 'Bayline County ROW, Hurricane Delphine',
          client: 'Bayline County',
          reference: 'DR-9001-FL',
          programType: 'ROW',
          timeZone: 'America/New_York',
        },
        from: '2026-10-15',
        to: '2026-10-16',
        loads: { rows: [], total: { loads: 0, cy: '0.00', tons: '0.0000' }, equipment: [] },
        haulOuts: { rows: [], total: { loads: 0, cy: '0.00', tons: '0.0000' }, equipment: [] },
        unitRate: {
          rows: [
            {
              payableType: { id: p.hangers.id, name: 'Hangers' },
              payItem: null,
              tickets: 1,
              units: '3.00',
              hours: false,
            },
          ],
          total: { tickets: 1, units: '3.00', hours: '0.00' },
          equipment: [],
        },
        incidents: { filed: 0, open: 0 },
        monitorsOnShift: 0,
        byDay: [
          {
            day: '2026-10-15',
            loads: 0,
            loadCy: '0.00',
            haulOuts: 0,
            haulOutCy: '0.00',
            unitRateTickets: 1,
          },
          {
            day: '2026-10-16',
            loads: 0,
            loadCy: '0.00',
            haulOuts: 0,
            haulOutCy: '0.00',
            unitRateTickets: 0,
          },
        ],
      });
      expect(JSON.stringify(read)).not.toMatch(/"(rate|amount|cost)"/i);
      expect(
        saved(readDebrisTotalsEndpoint, await totals('?from=2026-10-14&to=2026-10-14')).unitRate
          .total,
      ).toEqual({ tickets: 1, units: '0.00', hours: '0.00' });
      expect(
        saved(
          readDebrisTotalsEndpoint,
          await totals('?from=2026-10-15&to=2026-10-15&workflow=LOAD'),
        ).unitRate.total,
      ).toEqual({ tickets: 0, units: '0.00', hours: '0.00' });
      expect(
        saved(
          readDebrisTotalsEndpoint,
          await totals(`?from=2026-10-15&to=2026-10-15&contractorId=${randomUUID()}`),
        ).unitRate.total,
      ).toEqual({ tickets: 0, units: '0.00', hours: '0.00' });
      const tooLong = await totals('?from=2026-01-01&to=2027-01-02');
      expect([...told(tooLong), tooLong.body]).toMatchObject([
        400,
        'BAD_REQUEST',
        { message: 'A report reads 366 days at most: choose a shorter range.' },
      ]);
      expect(told(await totals('?from=2026-10-16&to=2026-10-15'))).toEqual([400, 'BAD_REQUEST']);
      expect(told(await totals('?from=2026-10-16'))).toEqual([400, 'BAD_REQUEST']);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      expect(
        told(
          await ask(served, viewer, readDebrisTotalsEndpoint, {
            ids: p.ids,
            query: '?from=2026-10-15&to=2026-10-15',
          }),
        ),
      ).toEqual([403, 'NOT_ALLOWED']);
    });
  });
});

describe('the email summary', () => {
  it('REQ-410 the user’s shape as plain text: the reference and the project, the days, a section per operation in the project’s own words with its total ruled off, the project’s stats, and the closing line', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithHangers(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis);
      const summary = saved(
        readEmailSummaryEndpoint,
        await ask(served, luis, readEmailSummaryEndpoint, {
          ids: p.ids,
          query: '?from=2026-10-15&to=2026-10-15',
        }),
      );
      expect(summary.subject).toBe(
        'DR-9001-FL Bayline County ROW, Hurricane Delphine – Current Operations / Monitoring - October 15, 2026',
      );
      expect(summary.text.split('\n')).toEqual([
        'DR-9001-FL Bayline County ROW, Hurricane Delphine',
        'Current Operations / Monitoring - October 15, 2026',
        '',
        'ROW Loads Operations:',
        '• None recorded',
        '  ------------------------------------------',
        '  ROW Loads Total     0 CY    0 loads',
        '',
        'Haul-outs Operations:',
        '• None recorded',
        '  ------------------------------------------',
        '  Haul-outs Total     0 CY    0 loads',
        '',
        'Unit rate Operations:',
        '• Hangers             3',
        '  ------------------------------------------',
        '  Unit rate Total     3 units',
        '',
        'Add’l Project Stats:',
        '• Incidents           0 filed, 0 open',
        '• Monitors on shift   0',
        '',
        'All figures in this report are pending final reconciliation',
        '',
      ]);
    });
  });
});

describe('the daily report', () => {
  it('REQ-410 a landscape PDF of eight pages, sent as a download that is never run: the title page, the outline, a page per operation with its map drawn as plain lines, the stats, the estimates (none recorded, said so), and the end page with Open ADMS, Open Recover and the firm’s address once it has one', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithHangers(served, tx, within, who);
      const report = () =>
        ask(served, p.dana, dailyReportFileEndpoint, {
          ids: p.ids,
          query: '?from=2026-10-15&to=2026-10-15',
        });
      const first = await report();
      expect(first.status).toBe(200);
      expect(first.headers).toMatchObject({
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="daily-report-2026-10-15.pdf"',
        'x-content-type-options': 'nosniff',
      });
      expect(String(first.headers['content-security-policy'])).toContain('sandbox');
      const file = first.bytes.toString('latin1');
      expect(file.startsWith('%PDF-1.4\n')).toBe(true);
      expect(file.match(/\/Type \/Page /g)).toHaveLength(8);
      expect(file.match(/\/MediaBox \[0 0 792 612\]/g)).toHaveLength(8);
      for (const words of [
        '(Bayline County ROW, Hurricane Delphine) Tj',
        '(Daily Report) Tj',
        '(Open ADMS) Tj',
        '(Open Recover) Tj',
        '(Hangers) Tj',
        '(No estimates or objectives are recorded for this project in Open ADMS, so none is shown',
        '(To be added to the distribution list for this report, ask whoever sent it to you.) Tj',
        '(All figures in this report are pending final reconciliation) Tj',
      ]) {
        expect(file, words).toContain(words);
      }
      expect(file).not.toMatch(/https?:\/\//);
      saved(
        changeReportContactEndpoint,
        await ask(served, p.dana, changeReportContactEndpoint, {
          payload: { email: 'reports@gates.example' },
        }),
      );
      expect((await report()).bytes.toString('latin1')).toContain(
        '(To be added to the distribution list for this report, write to reports@gates.example.) Tj',
      );
    });
  });
});
