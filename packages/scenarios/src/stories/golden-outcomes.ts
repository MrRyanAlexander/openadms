// The golden mission's outcomes, as the user approved them (spec/golden/MISSION.md §2…§4;
// ADR-297, 368, 603): what each ticket stands at after each evening's sync and the worker's run,
// the review queue before any review, and the ledger at the end. One home for them: the story
// `golden-mission` checks its run against them, and the field app's browser world for the golden
// mission hands them to its browser tests, which check what the screens made against them. A
// change to one is the user's to make.
//
// A ticket reads `number · STATUS`, then each flag that stands on it (not cleared, accepted or
// not) in the words `spec/FLAGS.md` gives it; a line of the ledger reads `number #slot CODE
// quantity × $rate = $amount`, a split's property or pile after its number; a row of the audit log
// reads `actor · SOURCE · OPERATION table`, then what it did (`auditLines`).
import type { AuditTrailAnswer } from '@open-adms/contracts';

export const p1TicketsByKind = {
  loads: ['101001', '101002', '101003', '101004', '101005', '101006'],
  haulOuts: ['201001', '201004'],
  liveUnitRate: ['301001', '301002', '301004', '301006', '301007'],
  voided: ['301003', '301005'],
} as const;

const loadCall96 = 'Ticket 101003: load call 96%. Flagged for review.';
const typed101060 = 'Ticket 101060: typed ticket number (Barcode damaged). Flagged for review.';
const stump301005 = [
  'Ticket 301005: not an eligible stump (20 in, under 24 in). Flagged for review.',
  'Ticket 301005: no survey. Flagged for review.',
] as const;

// What a project's ledger comes to: its lines and their sum.
export interface LedgerTotal {
  readonly lines: number;
  readonly total: string;
}

export const goldenOutcomes = {
  // Monday evening, every phone synced and the worker run on each project (AC-06-87).
  mondayNight: {
    p1: {
      tickets: [
        '101001 · COMPLETED',
        '101002 · COMPLETED',
        `101003 · MANUAL_REVIEW · ${loadCall96}`,
        '101004 · PENDING',
        '301001 · COMPLETED',
        '301002 · COMPLETED',
        '301003 · COMPLETED',
      ],
      ledger: { lines: 7, total: '$1,530.00' },
    },
    // P2's split load, whole by Monday night (AC-04-47, AC-07-68).
    p2: {
      tickets: ['102001 · COMPLETED'],
      ledger: { lines: 2, total: '$324.00' },
    },
  },
  // Tuesday evening, all but the Marsh Road tower's phone synced (AC-05-52, AC-06-103, 154).
  tuesdayNight: {
    p1: {
      tickets: [
        '101001 · COMPLETED',
        '101002 · COMPLETED',
        `101003 · MANUAL_REVIEW · ${loadCall96}`,
        '101004 · PENDING',
        '101005 · PENDING',
        '101006 · PENDING',
        '201001 · COMPLETED',
        '201004 · COMPLETED',
        '301001 · COMPLETED',
        '301002 · COMPLETED',
        '301003 · COMPLETED',
        '301004 · COMPLETED',
        `301005 · MANUAL_REVIEW · ${stump301005.join(' · ')}`,
        '301006 · COMPLETED',
        '301007 · COMPLETED',
      ],
      ledger: { lines: 17, total: '$4,879.00' },
    },
  },
  // Wednesday morning, the tower's late sync in and the worker run, before any review
  // (AC-02-56, AC-05-02, AC-06-16, AC-06-125): the loads, and the review queue as Luis reads it
  // at its endpoint, a workflow at a time, each ticket with its statuses and open flags (AC-04-12,
  // AC-08-01, AC-08-02, AC-10-93).
  wednesday: {
    p1: {
      loads: [
        '101001 · COMPLETED',
        '101002 · COMPLETED',
        `101003 · MANUAL_REVIEW · ${loadCall96}`,
        '101004 · COMPLETED',
        '101005 · COMPLETED',
        '101006 · PENDING',
        `101060 · PENDING · ${typed101060}`,
      ],
      ledger: { lines: 19, total: '$5,400.25' },
      queue: {
        LOAD: [
          `101003 MANUAL_REVIEW · ${loadCall96}`,
          '101006 PENDING',
          `101060 PENDING · ${typed101060}`,
        ],
        HAUL_OUT: [],
        UNIT_RATE: [`301005 MANUAL_REVIEW · ${stump301005.join(' · ')}`],
      },
    },
  },
  // The mission's review done (AC-08-64, AC-07-113): 101003's flag accepted, 101060 renumbered
  // to 101006 and its typed-number flag accepted, 301003 and 301005 voided.
  reviewed: {
    p1: {
      statuses: [
        ...[
          ...p1TicketsByKind.loads,
          ...p1TicketsByKind.haulOuts,
          ...p1TicketsByKind.liveUnitRate,
        ].map((number) => `${number} COMPLETED`),
        ...p1TicketsByKind.voided.map((number) => `${number} VOID`),
      ].sort(),
      queue: { LOAD: [], HAUL_OUT: [], UNIT_RATE: [] },
      ledger: [
        '101001 #1 VEG-HAUL-CY-15 52 × $7.50 = $390.00',
        '101002 #1 CD-HAUL-CY-15 36 × $8.25 = $297.00',
        '101002 #2 TIP-FEE-CY-BCL 36 × $4.00 = $144.00',
        '101003 #1 VEG-HAUL-CY-15 62.4 × $7.50 = $468.00',
        '101004 #1 VEG-HAUL-CY-15 24 × $7.50 = $180.00',
        '101005 #1 VEG-HAUL-CY-15 45.5 × $7.50 = $341.25',
        '101006 #1 VEG-HAUL-CY-15 28.8 × $7.50 = $216.00',
        '201001 #1 MULCH-HO-CY 99 × $5.10 = $504.90',
        '201001 #2 TIP-FEE-CY-BCL 99 × $4.00 = $396.00',
        '201004-A #1 MULCH-HO-TN 2.82 × $20.00 = $56.40',
        '201004-B #1 MULCH-HO-TN 7.06 × $20.00 = $141.20',
        '201004-C #1 MULCH-HO-TN 14.12 × $20.00 = $282.40',
        '301001 #1 HNG-RMV-EA 1 × $68.00 = $68.00',
        '301002 #1 LNR-RMV-EA-24 1 × $95.00 = $95.00',
        '301004 #1 STP-RMV-EA-36 1 × $110.00 = $110.00',
        '301004 #2 STP-FILL-CY 4.8 × $22.00 = $105.60',
        '301006 #1 WG-RMV-EA 6 × $40.00 = $240.00',
        '301006 #2 WG-FRN-EA 2 × $25.00 = $50.00',
        '301007 #1 CREW-TIME-HR 9.75 × $150.00 = $1462.50',
      ],
      total: { lines: 19, total: '$5,548.25' },
      // Before the split haul-out, and the split haul-out alone (golden mission §4).
      withoutSplitHaulOut: { lines: 16, total: '$5,068.25' },
      splitHaulOut: { lines: 3, total: '$480.00' },
      // The audit log, a ticket's history at a time (golden mission §4's excerpt; AC-07-111,
      // AC-08-65): each field event made on its monitor's phone, the number Kim typed and why;
      // Luis's renumber, acceptances and voids from the back office, each with the reason picked
      // and his words; the worker setting each voided ticket VOID, and 301003's one line removed,
      // its row copied whole into the log first. In the log's own order: the phones' rows as they
      // reached the server (Kim's tower phone synced before Ana's on Monday evening).
      audit: {
        '101003': [
          'Kim Nguyen · DEVICE · INSERT field_event · DISPOSAL 101003',
          'Ana Brooks · DEVICE · INSERT field_event · COLLECTION 101003',
          'Luis Ortega · BACK_OFFICE · INSERT flag_acceptance · Photos confirm · Heaped; photos confirm',
        ],
        '101006': [
          'Ana Brooks · DEVICE · INSERT field_event · COLLECTION 101006',
          'Kim Nguyen · DEVICE · INSERT field_event · DISPOSAL 101060, typed (Barcode damaged)',
          'Luis Ortega · BACK_OFFICE · UPDATE field_event · ticket_number: 101060 → 101006',
          'Luis Ortega · BACK_OFFICE · INSERT flag_acceptance · Photos confirm · Cert, times and photos match 101006',
        ],
        '301003': [
          'Jo Kim · DEVICE · INSERT field_event · UNIT_RATE 301003',
          'Luis Ortega · BACK_OFFICE · INSERT ticket_void · Duplicate ticket · Duplicate of 301001',
          'Open ADMS (system) · SYSTEM · UPDATE field_event · status: COMPLETED → VOID',
          'Open ADMS (system) · SYSTEM · DELETE transaction · #1 HNG-RMV-EA 1 × $68.00 = $68.00 · copied whole',
        ],
        '301005': [
          'Jo Kim · DEVICE · INSERT field_event · UNIT_RATE 301005',
          'Luis Ortega · BACK_OFFICE · INSERT ticket_void · Not eligible work · Under 24 in; goes out as vegetative debris',
          'Open ADMS (system) · SYSTEM · UPDATE field_event · status: MANUAL_REVIEW → VOID',
        ],
      } satisfies AuditTickets,
    },
    p2: {
      statuses: ['102001 COMPLETED'],
      ledger: [
        '102001-A #1 VEG-HAUL-CY 14.4 × $9.00 = $129.60',
        '102001-B #1 VEG-HAUL-CY 21.6 × $9.00 = $194.40',
      ],
      total: { lines: 2, total: '$324.00' },
    },
  },
} as const;

export type GoldenOutcomes = typeof goldenOutcomes;

// A ledger's sum in dollars, as the outcomes write it: `$5,548.25`.
export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The cents of a ledger line, from its amount: `… = $1462.50` is 146250.
export function centsOf(line: string): number {
  const amount = /= \$(\d+)\.(\d\d)$/.exec(line);
  if (amount?.[1] === undefined || amount[2] === undefined) {
    throw new Error(`Not a ledger line: ${line}`);
  }
  return Number(amount[1]) * 100 + Number(amount[2]);
}

// What a ledger's lines come to.
export function totalOf(lines: readonly string[]): LedgerTotal {
  return {
    lines: lines.length,
    total: dollars(lines.reduce((sum, line) => sum + centsOf(line), 0)),
  };
}

// The mission's ticket numbers, in the order the outcomes list them: loads (101060 the number
// Kim typed by mistake), haul-outs, unit rate tickets (golden mission §2, §3).
export const missionTicketNumbers = {
  p1: [
    ...p1TicketsByKind.loads,
    '101060',
    ...p1TicketsByKind.haulOuts,
    '301001',
    '301002',
    '301003',
    '301004',
    '301005',
    '301006',
    '301007',
  ],
  p2: ['102001'],
} as const;

// A ticket as the outcomes read it: its number, its statuses, then each flag standing on it.
export function ticketLine(
  ticketNumber: string,
  statuses: readonly string[],
  standingFlags: readonly string[],
): string {
  return [ticketNumber, statuses.join(','), ...standingFlags].join(' · ');
}

// A ticket on the review queue as the endpoint answers it: its number and statuses, then its
// open flags.
export function queueLine(
  ticketNumber: string,
  statuses: readonly string[],
  openFlags: readonly string[],
): string {
  return [`${ticketNumber} ${statuses.join(',')}`, ...openFlags].join(' · ');
}

// An exact decimal as the API answers it (`36.0000`), read with nothing after its last digit that
// counts (`36`), or with at least two places for money (`8.25`, `20.00`): read as text, never
// through a float.
function places(exact: string, atLeast: number): string {
  const [whole = '', part = ''] = exact.split('.');
  const kept = part.replace(/0+$/, '').padEnd(atLeast, '0');
  return kept === '' ? whole : `${whole}.${kept}`;
}

// A line of the ledger as the outcomes read it, from the exact decimals a line holds:
// `201004-A #1 MULCH-HO-TN 2.82 × $20.00 = $56.40`.
export function ledgerLine(line: {
  readonly ticketNumber: string;
  readonly splitSuffix: string;
  readonly slot: number;
  readonly code: string;
  readonly quantity: string;
  readonly rate: string;
  readonly amount: string;
}): string {
  const number =
    line.splitSuffix === '' ? line.ticketNumber : `${line.ticketNumber}-${line.splitSuffix}`;
  return `${number} ${pricedAs(line)}`;
}

// What a line prices, in the ledger's words: `#1 MULCH-HO-TN 2.82 × $20.00 = $56.40`.
function pricedAs(line: {
  readonly slot: number;
  readonly code: string;
  readonly quantity: string;
  readonly rate: string;
  readonly amount: string;
}): string {
  return `#${String(line.slot)} ${line.code} ${places(line.quantity, 0)} × $${places(line.rate, 2)} = $${places(line.amount, 2)}`;
}

// The tickets whose audit rows the mission names (golden mission §4, "Audit log (excerpt)"), and
// the void of 301005 beside them: each read whole through its history.
export const auditedTickets = [
  { workflow: 'LOAD', ticketNumber: '101003' },
  { workflow: 'LOAD', ticketNumber: '101006' },
  { workflow: 'UNIT_RATE', ticketNumber: '301003' },
  { workflow: 'UNIT_RATE', ticketNumber: '301005' },
] as const;

// Each audited ticket's rows that matter, oldest first, as `auditLines` reads them.
export type AuditTickets = Readonly<Record<string, readonly string[]>>;

type AuditEntry = AuditTrailAnswer['entries'][number];
type Row = Readonly<Record<string, unknown>>;

// What a row of the log holds, as the record's columns (`{}` where it holds none).
const columns = (value: AuditEntry['priorValue']): Row =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};

// A column's value as the log holds it, in words: text as it is, anything else as JSON.
const said = (value: unknown): string =>
  typeof value === 'string' ? value : value === undefined ? 'nothing' : JSON.stringify(value);

// A row of the log the same as another, column for column, whatever order the keys came in.
const sameRow = (left: Row, right: Row): boolean => {
  const keys = Object.keys(left).sort();
  return (
    keys.join() === Object.keys(right).sort().join() &&
    keys.every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]))
  );
};

// A ticket's rows of the audit log that matter (golden mission §4; invariants 2, 3, 5), oldest
// first, in words: what each person did to its field events (made on a phone, under the number
// as made or typed and why; corrected or renumbered in the back office, each field with its value
// before and after), its flags' acceptances and its voids, with the reason picked and the note;
// each line the worker removed, with whether the log's copy is the row whole as the log last had
// it; and the worker's setting of a field event to VOID. Every row names its actor and source.
export function auditLines(
  entries: readonly AuditEntry[],
  named: {
    readonly payItems: ReadonlyMap<string, string>;
    readonly reasons: ReadonlyMap<string, string>;
  },
): string[] {
  const lastKept = new Map<string, Row>();
  const reason = (id: unknown) =>
    typeof id === 'string' ? (named.reasons.get(id) ?? id) : said(id);
  const lines: string[] = [];
  for (const entry of entries) {
    const before = columns(entry.priorValue);
    const after = columns(entry.newValue);
    const head = `${entry.actor?.name ?? 'nobody'} · ${entry.source} · ${entry.operation} ${entry.tableName}`;
    const why = entry.reason === null ? [] : [entry.reason];
    const changes = entry.changedFields.map(
      (field) => `${field}: ${said(before[field])} → ${said(after[field])}`,
    );
    const key = `${entry.tableName} ${entry.recordId}`;
    const kept = lastKept.get(key);
    if (entry.operation !== 'DELETE') lastKept.set(key, after);
    if (entry.source === 'SYSTEM') {
      if (entry.tableName === 'transaction' && entry.operation === 'DELETE') {
        const line = pricedAs({
          slot: Number(before['slot']),
          code: named.payItems.get(said(before['pay_item_id'])) ?? said(before['pay_item_id']),
          quantity: said(before['quantity']),
          rate: said(before['rate']),
          amount: said(before['amount']),
        });
        const whole = kept !== undefined && sameRow(before, kept);
        lines.push([head, line, whole ? 'copied whole' : 'not copied whole'].join(' · '));
      } else if (
        entry.tableName === 'field_event' &&
        entry.operation === 'UPDATE' &&
        after['status'] === 'VOID' &&
        before['status'] !== 'VOID'
      ) {
        lines.push([head, `status: ${said(before['status'])} → VOID`].join(' · '));
      }
      continue;
    }
    if (entry.tableName === 'field_event') {
      if (entry.operation === 'INSERT') {
        const typed =
          after['number_typed'] === true
            ? `, typed (${reason(after['number_typed_reason_id'])})`
            : '';
        lines.push(
          [head, `${said(after['kind'])} ${said(after['ticket_number'])}${typed}`, ...why].join(
            ' · ',
          ),
        );
      } else {
        lines.push([head, ...changes, ...why].join(' · '));
      }
    } else if (entry.tableName === 'flag_acceptance' || entry.tableName === 'ticket_void') {
      lines.push([head, reason(after['reason_id'] ?? before['reason_id']), ...why].join(' · '));
    }
  }
  return lines;
}
