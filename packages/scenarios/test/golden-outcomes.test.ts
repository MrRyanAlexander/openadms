// The golden mission's approved outcomes (spec/golden/MISSION.md §2…§4; ADR-603), the one home
// the story `golden-mission` and the field app's browser test of the mission both check against:
// each line's amount is its quantity at its rate, each total its lines' sum, and the end comes to
// the figures the page states (P1 $5,548.25 on 19 lines, $5,068.25 on 16 before the split
// haul-out plus its $480.00 on three; P2 $324.00 on two). And the ways a read is written in their
// words: a ticket, a review queue's line, a ledger line from the API's exact decimals, read as
// text, and a ticket's audit rows that matter (golden mission §4). Needs no database.
import { describe, expect, it } from 'vitest';

import {
  auditLines,
  centsOf,
  goldenOutcomes,
  ledgerLine,
  queueLine,
  ticketLine,
  totalOf,
} from '../src/stories/golden-outcomes.ts';

const { reviewed } = goldenOutcomes;

// A line's quantity × rate in cents, worked out apart from its stated amount, half up.
function worked(line: string): number {
  const read = /^\S+ #\d (\S+) ([\d.]+) × \$([\d.]+) = /.exec(line);
  if (read?.[2] === undefined || read[3] === undefined) throw new Error(`Not a line: ${line}`);
  const [whole = '', part = ''] = read[2].split('.');
  const quantityHundredths = Number(whole) * 100 + Number(part.padEnd(2, '0').slice(0, 2));
  const rateCents = Math.round(Number(read[3]) * 100);
  return Math.round((quantityHundredths * rateCents) / 100);
}

describe('the golden mission’s outcomes', () => {
  it('AC-07-113 each line of the end ledger is its quantity at its rate', () => {
    for (const line of [...reviewed.p1.ledger, ...reviewed.p2.ledger]) {
      expect(worked(line), line).toBe(centsOf(line));
    }
  });

  it('AC-07-113 P1 comes to $5,548.25 on 19 lines: $5,068.25 on 16 before the split haul-out, its $480.00 on three; P2 to $324.00 on two', () => {
    const split = reviewed.p1.ledger.filter((line) => line.startsWith('201004-'));
    const before = reviewed.p1.ledger.filter((line) => !line.startsWith('201004-'));
    expect([totalOf(reviewed.p1.ledger), totalOf(before), totalOf(split)]).toEqual([
      { lines: 19, total: '$5,548.25' },
      { lines: 16, total: '$5,068.25' },
      { lines: 3, total: '$480.00' },
    ]);
    expect([reviewed.p1.total, reviewed.p1.withoutSplitHaulOut, reviewed.p1.splitHaulOut]).toEqual([
      totalOf(reviewed.p1.ledger),
      totalOf(before),
      totalOf(split),
    ]);
    expect(totalOf(reviewed.p2.ledger)).toEqual({ lines: 2, total: '$324.00' });
    expect(reviewed.p2.total).toEqual(totalOf(reviewed.p2.ledger));
  });

  it('AC-08-64 after the review every live ticket is COMPLETED and the two voided are VOID, and nothing waits on the queue', () => {
    expect(reviewed.p1.statuses).toHaveLength(15);
    expect(reviewed.p1.statuses.filter((line) => line.endsWith(' VOID'))).toEqual([
      '301003 VOID',
      '301005 VOID',
    ]);
    expect(Object.values(reviewed.p1.queue).flat()).toEqual([]);
  });

  it('writes a read in the outcomes’ words: a ticket, a queue line, and a ledger line from exact decimals, never through a float', () => {
    expect(
      ticketLine(
        '101003',
        ['MANUAL_REVIEW'],
        ['Ticket 101003: load call 96%. Flagged for review.'],
      ),
    ).toBe(goldenOutcomes.mondayNight.p1.tickets[2]);
    expect(ticketLine('101004', ['PENDING'], [])).toBe('101004 · PENDING');
    expect(queueLine('101006', ['PENDING'], [])).toBe('101006 PENDING');
    expect(
      [
        {
          ticketNumber: '201004',
          splitSuffix: 'A',
          slot: 1,
          code: 'MULCH-HO-TN',
          quantity: '2.8200',
          rate: '20.0000',
          amount: '56.40',
        },
        {
          ticketNumber: '101002',
          splitSuffix: '',
          slot: 1,
          code: 'CD-HAUL-CY-15',
          quantity: '36.0000',
          rate: '8.2500',
          amount: '297.00',
        },
        {
          ticketNumber: '301007',
          splitSuffix: '',
          slot: 1,
          code: 'CREW-TIME-HR',
          quantity: '9.7500',
          rate: '150.0000',
          amount: '1462.50',
        },
      ].map(ledgerLine),
    ).toEqual([
      '201004-A #1 MULCH-HO-TN 2.82 × $20.00 = $56.40',
      '101002 #1 CD-HAUL-CY-15 36 × $8.25 = $297.00',
      '301007 #1 CREW-TIME-HR 9.75 × $150.00 = $1462.50',
    ]);
  });

  it('AC-07-111, AC-08-65 reads a ticket’s audit rows that matter, in the log’s order: people’s acts with the reason picked and their words, the value before kept; a removed line copied whole or not; the worker’s VOID; nothing else', () => {
    const at = '2026-10-14T12:00:00.000Z';
    const person = (name: string) => ({ id: `id-${name}`, name });
    const system = person('Open ADMS (system)');
    const entry = (
      id: number,
      row: {
        tableName: string;
        recordId: string;
        operation: 'INSERT' | 'UPDATE' | 'DELETE';
        actor: { id: string; name: string };
        source: 'DEVICE' | 'BACK_OFFICE' | 'SYSTEM';
        changedFields?: string[];
        priorValue?: Record<string, string | number | boolean | null> | null;
        newValue?: Record<string, string | number | boolean | null> | null;
        reason?: string | null;
      },
    ) => ({
      id: String(id),
      occurredAt: at,
      deviceId: null,
      changedFields: [],
      priorValue: null,
      newValue: null,
      reason: null,
      ...row,
    });
    const line = {
      id: 'line-1',
      slot: 1,
      pay_item_id: 'pay-hng',
      quantity: 1,
      rate: 68,
      amount: 68,
    };
    const entries = [
      entry(1, {
        tableName: 'field_event',
        recordId: 'dis',
        operation: 'INSERT',
        actor: person('Kim Nguyen'),
        source: 'DEVICE',
        newValue: {
          kind: 'DISPOSAL',
          ticket_number: '101060',
          number_typed: true,
          number_typed_reason_id: 'reason-barcode',
        },
      }),
      entry(2, {
        tableName: 'photo',
        recordId: 'photo-1',
        operation: 'INSERT',
        actor: person('Kim Nguyen'),
        source: 'DEVICE',
      }),
      entry(3, {
        tableName: 'transaction',
        recordId: 'line-1',
        operation: 'INSERT',
        actor: system,
        source: 'SYSTEM',
        newValue: line,
      }),
      entry(4, {
        tableName: 'field_event',
        recordId: 'dis',
        operation: 'UPDATE',
        actor: person('Luis Ortega'),
        source: 'BACK_OFFICE',
        changedFields: ['ticket_number'],
        priorValue: { ticket_number: '101060' },
        newValue: { ticket_number: '101006' },
      }),
      entry(5, {
        tableName: 'ticket_void',
        recordId: 'void-1',
        operation: 'INSERT',
        actor: person('Luis Ortega'),
        source: 'BACK_OFFICE',
        newValue: { reason_id: 'reason-duplicate' },
        reason: 'Duplicate of 301001',
      }),
      entry(6, {
        tableName: 'field_event',
        recordId: 'dis',
        operation: 'UPDATE',
        actor: system,
        source: 'SYSTEM',
        changedFields: ['status', 'reconciled_at'],
        priorValue: { status: 'COMPLETED' },
        newValue: { status: 'VOID' },
      }),
      entry(7, {
        tableName: 'transaction',
        recordId: 'line-1',
        operation: 'DELETE',
        actor: system,
        source: 'SYSTEM',
        priorValue: { ...line },
      }),
      entry(8, {
        tableName: 'transaction',
        recordId: 'line-2',
        operation: 'INSERT',
        actor: system,
        source: 'SYSTEM',
        newValue: { ...line, id: 'line-2' },
      }),
      entry(9, {
        tableName: 'transaction',
        recordId: 'line-2',
        operation: 'DELETE',
        actor: system,
        source: 'SYSTEM',
        priorValue: { ...line, id: 'line-2', amount: 60 },
      }),
      entry(10, {
        tableName: 'field_event',
        recordId: 'col',
        operation: 'UPDATE',
        actor: system,
        source: 'SYSTEM',
        changedFields: ['status'],
        priorValue: { status: 'PENDING' },
        newValue: { status: 'COMPLETED' },
      }),
    ];
    expect(
      auditLines(entries, {
        payItems: new Map([['pay-hng', 'HNG-RMV-EA']]),
        reasons: new Map([
          ['reason-barcode', 'Barcode damaged'],
          ['reason-duplicate', 'Duplicate ticket'],
        ]),
      }),
    ).toEqual([
      'Kim Nguyen · DEVICE · INSERT field_event · DISPOSAL 101060, typed (Barcode damaged)',
      'Luis Ortega · BACK_OFFICE · UPDATE field_event · ticket_number: 101060 → 101006',
      'Luis Ortega · BACK_OFFICE · INSERT ticket_void · Duplicate ticket · Duplicate of 301001',
      'Open ADMS (system) · SYSTEM · UPDATE field_event · status: COMPLETED → VOID',
      'Open ADMS (system) · SYSTEM · DELETE transaction · #1 HNG-RMV-EA 1 × $68.00 = $68.00 · copied whole',
      'Open ADMS (system) · SYSTEM · DELETE transaction · #1 HNG-RMV-EA 1 × $68.00 = $60.00 · not copied whole',
    ]);
  });
});
