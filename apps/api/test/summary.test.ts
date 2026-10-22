// The email summary's words (REQ-410; spec/FROM-BUILD-1.md §9): the user's approved shape, its
// headings and lines from the project's own forms and lists, its figures from exact decimals read
// as text. Pure: it needs nothing.
import type { DebrisTotalsAnswer } from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { daysInWords, emailText, grouped, moved, summaryOf } from '../src/reports/summary.ts';

const id = (n: number) => `0199f000-0000-7000-8000-${String(n).padStart(12, '0')}`;

// A day like the user's example, in the example world's names.
const totals: DebrisTotalsAnswer = {
  project: {
    id: id(1),
    name: 'Bayline County ROW, Hurricane Delphine',
    client: 'Bayline County',
    declarationEvent: 'Hurricane Delphine',
    reference: 'DR-9001-FL',
    programType: 'ROW',
    timeZone: 'America/New_York',
  },
  from: '2026-10-12',
  to: '2026-10-13',
  headings: { loads: 'Debris Removal', haulOuts: 'Haul Out', unitRate: 'Unit Rate' },
  loads: {
    rows: [
      { debrisType: { id: id(2), name: 'Vegetative' }, loads: 78, cy: '3412.00', tons: '0.0000' },
      { debrisType: { id: id(3), name: 'C&D' }, loads: 31, cy: '1206.40', tons: '0.0000' },
      { debrisType: null, loads: 1, cy: '0.00', tons: '17.1000' },
    ],
    total: { loads: 110, cy: '4618.40', tons: '17.1000' },
    equipment: [
      { name: 'Truck', crew: false, count: 8 },
      { name: 'Trailer', crew: false, count: 7 },
    ],
  },
  haulOuts: {
    rows: [
      {
        site: { id: id(4), name: 'Bayline County Landfill' },
        debrisType: { id: id(5), name: 'Mulch' },
        loads: 14,
        cy: '2100.00',
        tons: '0.0000',
      },
    ],
    total: { loads: 14, cy: '2100.00', tons: '0.0000' },
    equipment: [{ name: 'Trailer', crew: false, count: 2 }],
  },
  unitRate: {
    rows: [
      {
        payableType: { id: id(6), name: 'Hangers' },
        payItem: { id: id(7), code: 'HNG-RMV-EA', description: 'Hanger removal' },
        tickets: 35,
        units: '35.00',
        hours: false,
      },
      {
        payableType: { id: id(8), name: 'Leaners' },
        payItem: { id: id(9), code: 'LNR-RMV-EA-24', description: 'Leaners under 26"' },
        tickets: 4,
        units: '4.00',
        hours: false,
      },
      {
        payableType: { id: id(8), name: 'Leaners' },
        payItem: { id: id(10), code: 'LNR-RMV-EA-36', description: 'Leaners above 26"' },
        tickets: 2,
        units: '2.00',
        hours: false,
      },
      {
        payableType: { id: id(11), name: 'Crew time' },
        payItem: { id: id(12), code: 'CREW-TIME-HR', description: 'Crew time, per hour' },
        tickets: 1,
        units: '9.75',
        hours: true,
      },
    ],
    total: { tickets: 42, units: '41.00', hours: '9.75' },
    equipment: [{ name: 'LHS', crew: true, count: 1 }],
  },
  incidents: { filed: 1, open: 0 },
  monitorsOnShift: 11,
  byDay: [],
};

describe('the email summary', () => {
  it('REQ-410 the user’s shape: the reference and project, the days, each operation headed in the project’s own words with its equipment, its lines and its total ruled off, the stats, the closing line; never a cost', () => {
    expect(emailText(summaryOf(totals)).split('\n')).toEqual([
      'DR-9001-FL Bayline County ROW, Hurricane Delphine',
      'Current Operations / Monitoring - October 12–13, 2026',
      '',
      'ROW Debris Removal Operations:',
      '• ROW Debris Removal Truck/Trailer Count  (8) Truck (7) Trailer',
      '• Vegetative                              3,412 CY    (78 loads)',
      '• C&D                                     1,206.4 CY    (31 loads)',
      '• No debris type                          17.1 TN    (1 load)',
      '  ------------------------------------------',
      '  ROW Debris Removal Total                4,618.4 CY · 17.1 TN    110 loads',
      '',
      'Haul Out Operations:',
      '• Haul Out Truck/Trailer Count            (2) Trailer',
      '• Bayline County Landfill                 2,100 CY    (14 loads)',
      '  ------------------------------------------',
      '  Haul Out Total                          2,100 CY    14 loads',
      '',
      'Unit Rate Operations:',
      '• Unit Rate Crew Count                    (1) LHS',
      '• Hangers                                 35',
      '• Leaners under 26"                       4',
      '• Leaners above 26"                       2',
      '• Crew time                               9.75 hours',
      '  ------------------------------------------',
      '  Unit Rate Total                         41 units · 9.75 hours',
      '',
      'Add’l Project Stats:',
      '• Incidents                               1 filed, 0 open',
      '• Monitors on shift                       11',
      '',
      'All figures in this report are pending final reconciliation',
      '',
    ]);
  });

  it('the days as the user writes them, and figures read as text: thousands grouped, no zero that doesn’t count, tons where a weight was taken', () => {
    expect(daysInWords('2026-10-12', '2026-10-12')).toBe('October 12, 2026');
    expect(daysInWords('2026-09-30', '2026-10-02')).toBe('September 30 – October 2, 2026');
    expect(daysInWords('2026-12-30', '2027-01-02')).toBe('December 30, 2026 – January 2, 2027');
    expect(grouped('1234567.50')).toBe('1,234,567.5');
    expect(grouped('0.00')).toBe('0');
    expect(moved('36.00', '0.0000')).toBe('36 CY');
    expect(moved('0.00', '2.8200')).toBe('2.82 TN');
    expect(moved('0.00', '0.0000')).toBe('0 CY');
  });
});
