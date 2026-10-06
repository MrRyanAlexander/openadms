// The domain's flag catalogue against the approved page itself (spec/FLAGS.md §3; ADR-290, 344, 345, 348;
// spec/acceptance/06-reconciliation.md AC-06-136, 137): the same codes in the same order, and
// every message word for word. Each flag is raised here with what the page's own example says,
// and what comes out is compared with the page. Needs no database.
import { readFileSync } from 'node:fs';

import {
  Flags,
  flagCodes,
  type FlagCode,
  type FlagSubject,
  type FlagTold,
} from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../../../spec/FLAGS.md', import.meta.url), 'utf8');

// A row of the catalogue: its code, what raises it, then its message in quotes. A withdrawn
// flag's row is struck through and has no message.
const rows = [...page.matchAll(/^\| `([A-Z0-9_]+)` \| [^|]+ \| "([^"]+)" \|/gm)].map(
  (row) => [row[1] ?? '', row[2] ?? ''] as const,
);

// "Every message ends 'Flagged for review.' unless shown otherwise" (§3): a ticket's message the
// page shows without an ending takes it; a record's (§3.7) has none.
const asThePageWordsIt = (shown: string): string =>
  shown.startsWith('Ticket ') && !shown.includes('Flagged for review') && !shown.endsWith('yet.')
    ? `${shown} Flagged for review.`
    : shown;

// Bayline County, four hours behind UTC in October.
const at = (time: string): Date => new Date(`2026-10-12T${time}:00-04:00`);
const ticket = (ticketNumber: string): FlagSubject => ({ ticketNumber });

type Example = { [Code in FlagCode]: readonly [FlagSubject, FlagTold[Code]] };

// What each of the page's examples says.
const examples: Example = {
  DEBRIS_TYPE_MISMATCH: [ticket('101008'), { collection: 'Vegetative', disposal: 'C&D' }],
  CERT_NUMBER_MISMATCH: [ticket('101008'), { collection: '730415', disposal: '730416' }],
  DISPOSAL_BEFORE_COLLECTION_ENDED: [
    ticket('101008'),
    { disposalStartedAt: at('09:12'), collectionEndedAt: at('09:40') },
  ],
  OVERLAPPING_LOADS: [
    ticket('101031'),
    {
      loadingStartedAt: at('09:10'),
      loadingEndedAt: at('09:40'),
      otherTicketNumber: '101030',
      certNumber: '730415',
    },
  ],
  SPLIT_SUFFIX_GAP: [
    ticket('102001'),
    { suffixes: ['A', 'C'], missing: ['B'], bareBesideSuffixed: false },
  ],
  CARRIED_COUNT_MISMATCH: [ticket('101014'), { towerCount: 3, listed: 4, counted: 'stumps' }],
  NO_CERTIFICATION: [ticket('101015'), { certNumber: '730499' }],
  TYPED_CAPACITY_DIFFERS: [ticket('101016'), { typedCy: 60, certifiedCy: 65 }],
  TAG_EXPIRED: [ticket('101017'), { certNumber: '730416', tagExpiry: '2026-09-30' }],
  CERTIFICATION_REVOKED: [ticket('101018'), { certNumber: '730416', revokedFrom: '2026-10-14' }],
  CERTIFICATION_REPLACED: [
    ticket('101019'),
    { certNumber: '730416', replacedBy: '730420', replacedOn: '2026-10-14' },
  ],
  OUTSIDE_PROJECT_BOUNDARY: [ticket('101020'), {}],
  NO_ZONE: [ticket('101021'), {}],
  OUTSIDE_SITE_AREA: [ticket('101022'), { site: 'Marsh Road TDSR' }],
  PROJECT_NOT_ACTIVE: [ticket('101023'), { day: '2027-02-03' }],
  SITE_NOT_YET_ACTIVE: [ticket('101024'), { site: 'Marsh Road TDSR', day: '2026-10-10' }],
  SITE_CLOSED: [ticket('101025'), { site: 'Marsh Road TDSR', day: '2026-12-01' }],
  NO_ROAD_ROUTE: [ticket('101026'), {}],
  DEVICE_CLOCK_OFF: [ticket('101008'), { differenceMinutes: 134 }],
  WORK_TIME_AFTER_RECEIVED: [ticket('101008'), { workTime: at('21:40'), receivedAt: at('20:15') }],
  WORK_TIME_BEFORE_ENROLMENT: [ticket('101027'), { workTime: at('08:05') }],
  DEVICE_TIME_ZONE_DIFFERS: [
    ticket('101028'),
    { deviceOffsetMinutes: -300, projectOffsetMinutes: -240 },
  ],
  PHONE_OUT_OF_SERVICE: [ticket('101008'), {}],
  TYPED_TICKET_NUMBER: [ticket('101060'), { reason: 'Barcode damaged' }],
  BACK_OFFICE_RECORD: [ticket('101029'), { person: 'Luis Ortega', reason: 'Phone failed' }],
  SITE_DOES_NOT_TAKE_LOADS: [ticket('101013'), { site: 'Old Quarry Pit' }],
  SITE_NOT_FOR_HAUL_OUTS: [ticket('201003'), { site: 'Bayline Transfer Station' }],
  INELIGIBLE_SITE: [ticket('101009'), { site: 'Old Quarry Pit' }],
  TIPPING_FEE_RULE_MISSING: [ticket('101011'), { site: 'Bayline County Landfill' }],
  HAUL_OUT_DUMPED_AT_TDSR: [ticket('201002'), { site: 'Marsh Road TDSR' }],
  LOAD_CALL_ZERO: [ticket('101032'), {}],
  LOAD_CALL_LOW: [ticket('101033'), { loadCall: 4 }],
  LOAD_CALL_HIGH: [ticket('101003'), { loadCall: 96 }],
  PILE_CALL_NOT_HIGHER: [
    ticket('201004'),
    { pile: 'B', loadCall: 30, pileBefore: 'A', loadCallBefore: 35 },
  ],
  QUANTITY_MISSING_FOR_PAY_ITEM: [
    ticket('101012'),
    { payItem: 'TIP-FEE-TN-BCL', pricedPer: 'per ton', lacking: 'the load has no scale weight' },
  ],
  SHARED_SCALE_WEIGHT: [ticket('101050'), { shareTons: '7.33', netTons: '17.10' }],
  RECEIPT_TWO_DEBRIS_TYPES: [
    ticket('101052'),
    { receipt: 'BCL-88241', debrisTypes: ['Vegetative', 'C&D'] },
  ],
  SCALE_WEIGHT_UNUSABLE: [ticket('101053'), { receipt: 'BCL-88250' }],
  CARRIED_TICKET_NOT_FOUND: [ticket('101014'), { carriedTicketNumber: '301099' }],
  CARRIED_TICKET_ON_ANOTHER_LOAD: [
    ticket('101014'),
    { carriedTicketNumber: '301004', otherLoadNumber: '101007' },
  ],
  MEASUREMENT_MISSING: [ticket('301010'), {}],
  GPS_MISSING: [ticket('301011'), {}],
  PHOTOS_MISSING: [ticket('301012'), {}],
  DECIMAL_COUNT: [ticket('301013'), { count: '2.5', payItem: 'HNG-RMV-EA' }],
  NO_SIZE_BAND: [ticket('301009'), { inches: '4.5', payableType: 'Leaners' }],
  OUTSIDE_SIZE_BAND: [
    ticket('301014'),
    { inches: '30.0', side: 'over', payItem: 'HNG-RMV-EA', band: '2–24' },
  ],
  MARKED_INELIGIBLE: [ticket('301015'), {}],
  STUMP_UNDER_24: [ticket('301005'), { inches: '20', bandHoldsIt: false }],
  ROOT_BALL_NOT_WIDER: [ticket('301008'), { rootBallInches: '20', stumpInches: '30' }],
  FILL_WITHOUT_EXPOSED_ROOT_BALL: [ticket('301016'), {}],
  ROOT_BALL_MISSING: [ticket('301017'), {}],
  NO_SURVEY: [ticket('301018'), {}],
  CREW_ITEM_OVER_12_HOURS: [
    ticket('301019'),
    { item: 'Skid Steer', hours: '13.25', day: '2026-10-13', certNumber: '730418', limitHours: 12 },
  ],
  CREW_TIME_OVERLAP: [
    ticket('301020'),
    {
      startedAt: at('07:00'),
      endedAt: at('11:00'),
      otherTicketNumber: '301007',
      certNumber: '730418',
    },
  ],
  ROE_MISSING: [ticket('102002'), {}],
  ROE_NOT_ON_PROJECT: [ticket('102003'), { roe: 'R-0099' }],
  ROE_UNSIGNED: [ticket('102004'), { roe: 'R-0008' }],
  ROE_OUT_OF_SCOPE: [ticket('102005'), { roe: 'R-0008' }],
  NO_PRE_WORK_SURVEY: [{ surveyOnRoe: 'R-0008' }, {}],
  CERTIFICATION_PHOTO_MISSING: [{ certNumber: '730416' }, { view: 'LEFT' }],
  PERMIT_OUTSTANDING: [{ site: 'Marsh Road TDSR' }, {}],
  NO_PRICING_RULE: [ticket('101010'), { prime: 'Summit' }],
  DUPLICATE_TRANSACTION_NUMBER: [
    ticket('301009'),
    { slot: 1, payItems: ['LNR-RMV-EA-24', 'LNR-RMV-EA-99'] },
  ],
  NO_RATE_FOR_PRIME: [ticket('101034'), { payItem: 'VEG-HAUL-CY-15', prime: 'Summit' }],
  RATE_TO_BE_NEGOTIATED: [ticket('301021'), {}],
  NOT_PROCESSED: [ticket('101035'), {}],
  NOT_PROCESSED_LINES_STAND: [ticket('101035'), {}],
  DETAIL_MISSING: [ticket('101036'), { event: 'COLLECTION', missing: 'debris type' }],
  TYPED_NUMBER_NO_REASON: [ticket('101037'), {}],
  WRONG_KIND_OF_BADGE: [
    ticket('101038'),
    { work: 'a load', certifies: 'crew', certNumber: '730417' },
  ],
  GPS_UNREADABLE: [ticket('101039'), {}],
  NOT_A_TICKET_NUMBER: [ticket('10A040'), {}],
  ENDED_BEFORE_STARTED: [
    ticket('101041'),
    { event: 'COLLECTION', endedAt: at('09:10'), startedAt: at('09:40') },
  ],
  SPLIT_NOT_ALLOWED: [ticket('101042'), { split: 'load' }],
  OUTSIDE_CONTROL_RANGES: [ticket('109999'), {}],
  ASSIGNMENT_ON_ANOTHER_PROJECT: [ticket('101043'), {}],
  SCALE_NET_DISAGREES: [
    ticket('101054'),
    { receipt: 'BCL-88251', netTons: '17.60', grossLessTareTons: '17.10' },
  ],
  TWO_QUANTITIES: [ticket('101055'), {}],
};

const flags = new Flags('America/New_York');
const raised = (code: FlagCode): string => {
  const [subject, told] = examples[code];
  return flags.raise(code, subject, told, {}).message;
};

describe('the flag catalogue, against spec/FLAGS.md', () => {
  it('AC-06-137 the domain’s codes are the page’s, in its order: 78, and a flag that isn’t on the page can’t be raised', () => {
    expect(rows.map(([code]) => code)).toEqual([...flagCodes]);
    expect(rows).toHaveLength(78);
  });

  it.each(rows)('AC-06-136 %s reads as the page words it', (code, shown) => {
    expect(raised(code as FlagCode)).toBe(asThePageWordsIt(shown));
  });
});
