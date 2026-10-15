// The flag catalogue: every flag Open ADMS can raise, as one closed set, each with the message a
// reviewer reads, word for word from spec/FLAGS.md §3 (approved, ADR-290), and what it does to
// the money (spec/FLAGS.md §1; spec/DATA-MODEL.md §5, `Flag`; spec/acceptance/06-reconciliation.md
// AC-06-136, 137, 138; adms-validation §5.4b; ADR-052, 060, 166, 285, 290, 294, 295, 328, 344).
//
// A flag says the ticket and the problem, plainly, and nothing else: never a cause, never what to
// do (ADR-052). A flag that isn't here doesn't exist: a new one is a code change with an ADR.
//
// Two things are kept apart on purpose. What a message is *told* is what its words need (a site's
// name, a time). The *facts* are what the flag was raised on, kept with their hash so "have the
// facts changed?" can be answered on a reprocess (ADR-166): the same facts keep the same flag,
// with its acceptance; changed facts clear it and, if the problem is still there, raise a new one.
// The check that raises a flag says both. Nothing here decides when a flag is raised.
import type { FieldEventKindName } from './field-event-details.ts';
import { ProjectClock, enDash } from './project-clock.ts';
import { sha256 } from './sha256.ts';

// What a flag does to the money (spec/FLAGS.md §1), as the database keeps it.
export const flagBillings = ['BILLS', 'LINE_NOT_BILLED', 'NOT_BILLED'] as const;
export type FlagBilling = (typeof flagBillings)[number];

// spec/FLAGS.md §3, in the page's order: 77 codes (`FlagCode`, held to the page by a test).
export const flagCodes = [
  // §3.1 Between a ticket's field events
  'DEBRIS_TYPE_MISMATCH',
  'CERT_NUMBER_MISMATCH',
  'DISPOSAL_BEFORE_COLLECTION_ENDED',
  'OVERLAPPING_LOADS',
  'SPLIT_SUFFIX_GAP',
  'CARRIED_COUNT_MISMATCH',
  // §3.2 The certification
  'NO_CERTIFICATION',
  'TYPED_CAPACITY_DIFFERS',
  'TAG_EXPIRED',
  'CERTIFICATION_REVOKED',
  'CERTIFICATION_REPLACED',
  // §3.3 Place and time
  'OUTSIDE_PROJECT_BOUNDARY',
  'NO_ZONE',
  'OUTSIDE_SITE_AREA',
  'PROJECT_NOT_ACTIVE',
  'SITE_NOT_YET_ACTIVE',
  'SITE_CLOSED',
  'NO_ROAD_ROUTE',
  'DEVICE_CLOCK_OFF',
  'WORK_TIME_AFTER_RECEIVED',
  'WORK_TIME_BEFORE_ENROLMENT',
  'DEVICE_TIME_ZONE_DIFFERS',
  'PHONE_OUT_OF_SERVICE',
  'TYPED_TICKET_NUMBER',
  'BACK_OFFICE_RECORD',
  // §3.4 Where the debris went
  'SITE_DOES_NOT_TAKE_LOADS',
  'SITE_NOT_FOR_HAUL_OUTS',
  'INELIGIBLE_SITE',
  'TIPPING_FEE_RULE_MISSING',
  'HAUL_OUT_DUMPED_AT_TDSR',
  // §3.5 Quantity
  'LOAD_CALL_ZERO',
  'LOAD_CALL_LOW',
  'LOAD_CALL_HIGH',
  'PILE_CALL_NOT_HIGHER',
  'QUANTITY_MISSING_FOR_PAY_ITEM',
  'SHARED_SCALE_WEIGHT',
  'RECEIPT_TWO_DEBRIS_TYPES',
  'SCALE_WEIGHT_UNUSABLE',
  'CARRIED_TICKET_NOT_FOUND',
  'CARRIED_TICKET_ON_ANOTHER_LOAD',
  // §3.6 The pay item's settings, and unit rate work
  'MEASUREMENT_MISSING',
  'GPS_MISSING',
  'PHOTOS_MISSING',
  'DECIMAL_COUNT',
  'NO_SIZE_BAND',
  'OUTSIDE_SIZE_BAND',
  'MARKED_INELIGIBLE',
  'STUMP_UNDER_24',
  'ROOT_BALL_NOT_WIDER',
  'FILL_WITHOUT_EXPOSED_ROOT_BALL',
  'ROOT_BALL_MISSING',
  'NO_SURVEY',
  'CREW_ITEM_OVER_12_HOURS',
  'CREW_TIME_OVERLAP',
  // §3.7 Forms, certifications and sites
  'ROE_MISSING',
  'ROE_NOT_ON_PROJECT',
  'ROE_UNSIGNED',
  'ROE_OUT_OF_SCOPE',
  'NO_PRE_WORK_SURVEY',
  'CERTIFICATION_PHOTO_MISSING',
  'PERMIT_OUTSTANDING',
  // §3.8 Pricing
  'NO_PRICING_RULE',
  'DUPLICATE_TRANSACTION_NUMBER',
  'NO_RATE_FOR_PRIME',
  'RATE_TO_BE_NEGOTIATED',
  // §3.9 The engine
  'NOT_PROCESSED',
  // §3.10 A record that should not have been possible
  'DETAIL_MISSING',
  'TYPED_NUMBER_NO_REASON',
  'WRONG_KIND_OF_BADGE',
  'GPS_UNREADABLE',
  'NOT_A_TICKET_NUMBER',
  'ENDED_BEFORE_STARTED',
  'SPLIT_NOT_ALLOWED',
  'OUTSIDE_CONTROL_RANGES',
  'ASSIGNMENT_ON_ANOTHER_PROJECT',
  'SCALE_NET_DISAGREES',
  'TWO_QUANTITIES',
  // §3.11 The engine, on a ticket that was priced before (ADR-360)
  'NOT_PROCESSED_LINES_STAND',
  // §3.12 A certification, read across its project (ADR-529)
  'SUB_NAME_ALIKE',
] as const;
export type FlagCode = (typeof flagCodes)[number];

// A certification's five views (ADR-179), as the database keeps them.
export const certificationViews = [
  'OPERATOR_WITH_PLACARD',
  'INTERIOR_OR_BACK',
  'RIGHT',
  'LEFT',
  'FRONT',
] as const;
export type CertificationView = (typeof certificationViews)[number];

// The page words one view, "no left side photo"; the other four follow it (agent default,
// ADR-344).
const viewWords: Record<CertificationView, string> = {
  OPERATOR_WITH_PLACARD: 'operator with placard',
  INTERIOR_OR_BACK: 'interior or back',
  RIGHT: 'right side',
  LEFT: 'left side',
  FRONT: 'front',
};

type Nothing = Record<string, never>;

// What each flag's message is told. A figure a later task works out (a diameter, a weight, a
// band) is told as that task writes it: "30.0", "7.33", "2–24".
export interface FlagTold {
  DEBRIS_TYPE_MISMATCH: { collection: string; disposal: string };
  CERT_NUMBER_MISMATCH: { collection: string; disposal: string };
  DISPOSAL_BEFORE_COLLECTION_ENDED: { disposalStartedAt: Date; collectionEndedAt: Date };
  OVERLAPPING_LOADS: {
    loadingStartedAt: Date;
    loadingEndedAt: Date;
    otherTicketNumber: string;
    certNumber: string;
  };
  // The suffixes present and the ones skipped, without their dashes; a bare collection beside
  // suffixed ones.
  SPLIT_SUFFIX_GAP: {
    suffixes: readonly string[];
    missing: readonly string[];
    bareBesideSuffixed: boolean;
  };
  // What the tower counted, in the plural: "stumps".
  CARRIED_COUNT_MISMATCH: { towerCount: number; listed: number; counted: string };
  NO_CERTIFICATION: { certNumber: string };
  TYPED_CAPACITY_DIFFERS: { typedCy: number; certifiedCy: number };
  // A calendar day: 2026-09-30.
  TAG_EXPIRED: { certNumber: string; tagExpiry: string };
  CERTIFICATION_REVOKED: { certNumber: string; revokedFrom: string };
  CERTIFICATION_REPLACED: { certNumber: string; replacedBy: string; replacedOn: string };
  OUTSIDE_PROJECT_BOUNDARY: Nothing;
  NO_ZONE: Nothing;
  OUTSIDE_SITE_AREA: { site: string };
  PROJECT_NOT_ACTIVE: { day: string };
  SITE_NOT_YET_ACTIVE: { site: string; day: string };
  SITE_CLOSED: { site: string; day: string };
  NO_ROAD_ROUTE: Nothing;
  DEVICE_CLOCK_OFF: { differenceMinutes: number };
  WORK_TIME_AFTER_RECEIVED: { workTime: Date; receivedAt: Date };
  WORK_TIME_BEFORE_ENROLMENT: { workTime: Date };
  DEVICE_TIME_ZONE_DIFFERS: { deviceOffsetMinutes: number; projectOffsetMinutes: number };
  PHONE_OUT_OF_SERVICE: Nothing;
  TYPED_TICKET_NUMBER: { reason: string };
  BACK_OFFICE_RECORD: { person: string; reason: string };
  SITE_DOES_NOT_TAKE_LOADS: { site: string };
  SITE_NOT_FOR_HAUL_OUTS: { site: string };
  INELIGIBLE_SITE: { site: string };
  TIPPING_FEE_RULE_MISSING: { site: string };
  HAUL_OUT_DUMPED_AT_TDSR: { site: string };
  LOAD_CALL_ZERO: Nothing;
  LOAD_CALL_LOW: { loadCall: number };
  LOAD_CALL_HIGH: { loadCall: number };
  PILE_CALL_NOT_HIGHER: {
    pile: string;
    loadCall: number;
    pileBefore: string;
    loadCallBefore: number;
  };
  // "priced per ton, but the load has no scale weight": how it is priced, and what is lacking.
  QUANTITY_MISSING_FOR_PAY_ITEM: { payItem: string; pricedPer: string; lacking: string };
  SHARED_SCALE_WEIGHT: { shareTons: string; netTons: string };
  RECEIPT_TWO_DEBRIS_TYPES: { receipt: string; debrisTypes: readonly string[] };
  SCALE_WEIGHT_UNUSABLE: { receipt: string };
  CARRIED_TICKET_NOT_FOUND: { carriedTicketNumber: string };
  CARRIED_TICKET_ON_ANOTHER_LOAD: { carriedTicketNumber: string; otherLoadNumber: string };
  MEASUREMENT_MISSING: Nothing;
  GPS_MISSING: Nothing;
  PHOTOS_MISSING: Nothing;
  DECIMAL_COUNT: { count: string; payItem: string };
  NO_SIZE_BAND: { inches: string; payableType: string };
  OUTSIDE_SIZE_BAND: { inches: string; side: 'over' | 'under'; payItem: string; band: string };
  MARKED_INELIGIBLE: Nothing;
  // Whether a band of its payable type holds it: with none it has no pay item and bills nothing.
  STUMP_UNDER_24: { inches: string; bandHoldsIt: boolean };
  ROOT_BALL_NOT_WIDER: { rootBallInches: string; stumpInches: string };
  FILL_WITHOUT_EXPOSED_ROOT_BALL: Nothing;
  ROOT_BALL_MISSING: Nothing;
  NO_SURVEY: Nothing;
  CREW_ITEM_OVER_12_HOURS: {
    item: string;
    hours: string;
    day: string;
    certNumber: string;
    limitHours: number;
  };
  CREW_TIME_OVERLAP: {
    startedAt: Date;
    endedAt: Date;
    otherTicketNumber: string;
    certNumber: string;
  };
  ROE_MISSING: Nothing;
  ROE_NOT_ON_PROJECT: { roe: string };
  ROE_UNSIGNED: { roe: string };
  ROE_OUT_OF_SCOPE: { roe: string };
  NO_PRE_WORK_SURVEY: Nothing;
  CERTIFICATION_PHOTO_MISSING: { view: CertificationView };
  SUB_NAME_ALIKE: { sub: string; alike: string };
  PERMIT_OUTSTANDING: Nothing;
  NO_PRICING_RULE: { prime: string };
  DUPLICATE_TRANSACTION_NUMBER: { slot: number; payItems: readonly string[] };
  NO_RATE_FOR_PRIME: { payItem: string; prime: string };
  RATE_TO_BE_NEGOTIATED: Nothing;
  NOT_PROCESSED: Nothing;
  NOT_PROCESSED_LINES_STAND: Nothing;
  // What the field event has none of: "debris type".
  DETAIL_MISSING: { event: FieldEventKindName; missing: string };
  TYPED_NUMBER_NO_REASON: Nothing;
  WRONG_KIND_OF_BADGE: {
    work: 'a load' | 'a haul-out' | 'unit rate work';
    certifies: 'crew' | 'container';
    certNumber: string;
  };
  GPS_UNREADABLE: Nothing;
  NOT_A_TICKET_NUMBER: Nothing;
  ENDED_BEFORE_STARTED: { event: FieldEventKindName; endedAt: Date; startedAt: Date };
  SPLIT_NOT_ALLOWED: { split: 'load' | 'haul-out' };
  OUTSIDE_CONTROL_RANGES: Nothing;
  ASSIGNMENT_ON_ANOTHER_PROJECT: Nothing;
  // Tons as the message says them: "17.60", "17.10".
  SCALE_NET_DISAGREES: { receipt: string; netTons: string; grossLessTareTons: string };
  TWO_QUANTITIES: Nothing;
}

// A field event's kind as a message says it.
const eventWords: Record<FieldEventKindName, string> = {
  COLLECTION: 'collection',
  DISPOSAL: 'disposal',
  HAUL_OUT_COLLECTION: 'haul-out collection',
  HAUL_OUT_DISPOSAL: 'haul-out disposal',
  UNIT_RATE: 'unit rate event',
};

// What a flag is on: a ticket, or the record it sits on where it isn't a ticket's (spec/FLAGS.md
// §1, §3.7).
export type FlagSubject =
  | { readonly ticketNumber: string }
  | { readonly certNumber: string }
  | { readonly site: string }
  // A survey, by the ROE number it names; one that names none is "Survey" (agent default,
  // ADR-347).
  | { readonly surveyOnRoe: string | null };

const subjectWords = (subject: FlagSubject): string => {
  if ('ticketNumber' in subject) return `Ticket ${subject.ticketNumber}`;
  if ('certNumber' in subject) return `Certification ${subject.certNumber}`;
  if ('site' in subject) return subject.site;
  return subject.surveyOnRoe === null ? 'Survey' : `Survey on ROE ${subject.surveyOnRoe}`;
};

// How a message ends (spec/FLAGS.md §1, and the messages the page words otherwise).
const endings = {
  REVIEW: '. Flagged for review.',
  NOT_BILLED: '. Flagged for review; not billed.',
  NOT_PRICED: '. Flagged for review; not priced.',
  WEIGHT_NOT_USED: '. Flagged for review; its weight is not used.',
  NOT_BILLED_YET: '. Not billed yet.',
  // A ticket the worker failed on that had lines: they stand as they were (ADR-360).
  LINES_STAND: '. Flagged for review; its lines are as of its last run.',
  // A flag on a record that isn't a ticket (§3.7).
  RECORD: '.',
} as const;
type Ending = keyof typeof endings;

interface Entry<Code extends FlagCode> {
  readonly billing: FlagBilling | ((told: FlagTold[Code]) => FlagBilling);
  readonly ending: Ending;
  readonly words: (told: FlagTold[Code], clock: ProjectClock) => string;
}

// "A", "A and C", "A, B and C".
const listed = (things: readonly string[]): string =>
  things.length < 2
    ? things.join('')
    : `${things.slice(0, -1).join(', ')} and ${things.at(-1) ?? ''}`;

const dashed = (suffixes: readonly string[]): string =>
  listed(suffixes.map((suffix) => `-${suffix}`));

// "2 h 14 m"; under an hour, "14 m".
const hoursAndMinutes = (minutes: number): string => {
  const size = Math.abs(Math.round(minutes));
  const hours = Math.floor(size / 60);
  return hours === 0 ? `${String(size)} m` : `${String(hours)} h ${String(size % 60)} m`;
};

const catalogue: { readonly [Code in FlagCode]: Entry<Code> } = {
  DEBRIS_TYPE_MISMATCH: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `debris type mismatch (collection ${told.collection}, disposal ${told.disposal})`,
  },
  CERT_NUMBER_MISMATCH: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `truck number doesn't match (collection ${told.collection}, disposal ${told.disposal})`,
  },
  DISPOSAL_BEFORE_COLLECTION_ENDED: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told, clock) =>
      `disposal started ${clock.time(told.disposalStartedAt)}, before its collection ended ${clock.time(told.collectionEndedAt)}`,
  },
  OVERLAPPING_LOADS: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told, clock) =>
      `loading ${clock.time(told.loadingStartedAt)}${enDash}${clock.time(told.loadingEndedAt)} overlaps ticket ${told.otherTicketNumber} on truck ${told.certNumber}`,
  },
  SPLIT_SUFFIX_GAP: {
    billing: 'BILLS',
    ending: 'REVIEW',
    // The page words a gap. A bare collection beside suffixed ones is worded here (agent default,
    // ADR-344).
    words: (told) => {
      const gap =
        told.missing.length === 0
          ? null
          : `collections ${dashed(told.suffixes)}, no ${dashed(told.missing)}`;
      const bare = told.bareBesideSuffixed
        ? `a collection with no suffix beside ${dashed(told.suffixes)}`
        : null;
      return [gap, bare].filter((part) => part !== null).join('; ');
    },
  },
  CARRIED_COUNT_MISMATCH: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `tower counted ${String(told.towerCount)} ${told.counted}, the collection lists ${String(told.listed)}`,
  },
  NO_CERTIFICATION: {
    billing: 'NOT_BILLED',
    ending: 'NOT_BILLED',
    words: (told) => `no certification ${told.certNumber} on this project`,
  },
  TYPED_CAPACITY_DIFFERS: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `capacity typed ${String(told.typedCy)}, certified ${String(told.certifiedCy)}`,
  },
  TAG_EXPIRED: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `review certification ${told.certNumber} (tag expired ${ProjectClock.dateOf(told.tagExpiry)})`,
  },
  CERTIFICATION_REVOKED: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `review certification ${told.certNumber} (revoked from ${ProjectClock.dateOf(told.revokedFrom)})`,
  },
  CERTIFICATION_REPLACED: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `review certification ${told.certNumber} (replaced by ${told.replacedBy} on ${ProjectClock.dateOf(told.replacedOn)})`,
  },
  OUTSIDE_PROJECT_BOUNDARY: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: () => 'collected outside the project boundary',
  },
  NO_ZONE: { billing: 'BILLS', ending: 'REVIEW', words: () => 'not inside any zone' },
  OUTSIDE_SITE_AREA: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `dumped outside ${told.site}'s area`,
  },
  PROJECT_NOT_ACTIVE: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `project not active on ${ProjectClock.dateOf(told.day)}`,
  },
  SITE_NOT_YET_ACTIVE: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `${told.site} not yet active on ${ProjectClock.dateOf(told.day)}`,
  },
  SITE_CLOSED: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `${told.site} closed on ${ProjectClock.dateOf(told.day)}`,
  },
  NO_ROAD_ROUTE: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: () => 'no road route found; straight-line distance used',
  },
  DEVICE_CLOCK_OFF: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `device clock was ${hoursAndMinutes(told.differenceMinutes)} off at sync`,
  },
  WORK_TIME_AFTER_RECEIVED: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told, clock) =>
      `work time ${clock.time(told.workTime)} is after it was received at ${clock.time(told.receivedAt)}`,
  },
  WORK_TIME_BEFORE_ENROLMENT: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told, clock) =>
      `work time ${clock.time(told.workTime)} is before its phone was enrolled`,
  },
  DEVICE_TIME_ZONE_DIFFERS: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `phone was on ${ProjectClock.offsetOf(told.deviceOffsetMinutes)}; the project is on ${ProjectClock.offsetOf(told.projectOffsetMinutes)}`,
  },
  PHONE_OUT_OF_SERVICE: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: () => 'made on a phone taken out of service',
  },
  TYPED_TICKET_NUMBER: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `typed ticket number (${told.reason})`,
  },
  BACK_OFFICE_RECORD: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `record created in the back office by ${told.person} (${told.reason})`,
  },
  SITE_DOES_NOT_TAKE_LOADS: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `dumped at ${told.site}, which isn't marked Takes loads`,
  },
  SITE_NOT_FOR_HAUL_OUTS: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `left ${told.site}, which isn't marked Haul-outs leave here`,
  },
  INELIGIBLE_SITE: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `dumped at ${told.site}, an ineligible site`,
  },
  // The fee's line is the one that doesn't bill; the ticket's other lines do.
  TIPPING_FEE_RULE_MISSING: {
    billing: 'LINE_NOT_BILLED',
    ending: 'REVIEW',
    words: (told) =>
      `dumped at ${told.site}, which charges a tipping fee, but no rule on this project gives it one`,
  },
  HAUL_OUT_DUMPED_AT_TDSR: {
    billing: 'NOT_BILLED',
    ending: 'NOT_PRICED',
    words: (told) => `a haul-out dumped at ${told.site}, a TDSR`,
  },
  LOAD_CALL_ZERO: { billing: 'NOT_BILLED', ending: 'NOT_BILLED', words: () => 'load call 0%' },
  LOAD_CALL_LOW: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `load call ${String(told.loadCall)}%`,
  },
  LOAD_CALL_HIGH: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `load call ${String(told.loadCall)}%`,
  },
  PILE_CALL_NOT_HIGHER: {
    billing: 'NOT_BILLED',
    ending: 'NOT_BILLED',
    words: (told) =>
      `pile -${told.pile}'s load call ${String(told.loadCall)}% is not higher than pile -${told.pileBefore}'s ${String(told.loadCallBefore)}%`,
  },
  QUANTITY_MISSING_FOR_PAY_ITEM: {
    billing: 'LINE_NOT_BILLED',
    ending: 'REVIEW',
    words: (told) => `${told.payItem} is priced ${told.pricedPer}, but ${told.lacking}`,
  },
  SHARED_SCALE_WEIGHT: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `one scale weight shared by two containers, split by certified capacity (${told.shareTons} of ${told.netTons} tons)`,
  },
  RECEIPT_TWO_DEBRIS_TYPES: {
    billing: 'LINE_NOT_BILLED',
    ending: 'WEIGHT_NOT_USED',
    words: (told) =>
      `scale receipt ${told.receipt} covers two debris types (${told.debrisTypes.join(', ')})`,
  },
  SCALE_WEIGHT_UNUSABLE: {
    billing: 'LINE_NOT_BILLED',
    ending: 'WEIGHT_NOT_USED',
    words: (told) => `scale receipt ${told.receipt} has no usable net weight`,
  },
  CARRIED_TICKET_NOT_FOUND: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `carried ticket ${told.carriedTicketNumber} not found`,
  },
  CARRIED_TICKET_ON_ANOTHER_LOAD: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `carried ticket ${told.carriedTicketNumber} is already on load ${told.otherLoadNumber}`,
  },
  MEASUREMENT_MISSING: { billing: 'BILLS', ending: 'REVIEW', words: () => 'no measurement' },
  GPS_MISSING: { billing: 'BILLS', ending: 'REVIEW', words: () => 'no GPS' },
  PHOTOS_MISSING: { billing: 'BILLS', ending: 'REVIEW', words: () => 'no photos' },
  DECIMAL_COUNT: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `count ${told.count}; ${told.payItem} takes whole counts`,
  },
  NO_SIZE_BAND: {
    billing: 'NOT_BILLED',
    ending: 'NOT_BILLED',
    words: (told) => `${told.inches} in fits no ${told.payableType} pay item`,
  },
  OUTSIDE_SIZE_BAND: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `${told.inches} in is ${told.side} ${told.payItem}'s band (${told.band} in)`,
  },
  MARKED_INELIGIBLE: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: () => 'marked ineligible by the monitor',
  },
  // "As its band says; with no band, no."
  STUMP_UNDER_24: {
    billing: (told) => (told.bandHoldsIt ? 'BILLS' : 'NOT_BILLED'),
    ending: 'REVIEW',
    words: (told) => `not an eligible stump (${told.inches} in, under 24 in)`,
  },
  ROOT_BALL_NOT_WIDER: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `root ball (${told.rootBallInches} in) is not wider than the stump (${told.stumpInches} in)`,
  },
  FILL_WITHOUT_EXPOSED_ROOT_BALL: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: () => 'fill paid, but the root ball is not half exposed',
  },
  ROOT_BALL_MISSING: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: () => 'no root ball measurement',
  },
  NO_SURVEY: { billing: 'BILLS', ending: 'REVIEW', words: () => 'no survey' },
  CREW_ITEM_OVER_12_HOURS: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `${told.item} ${told.hours} h on ${ProjectClock.dateOf(told.day)} for crew ${told.certNumber} (over ${String(told.limitHours)} h)`,
  },
  CREW_TIME_OVERLAP: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told, clock) =>
      `crew time ${clock.time(told.startedAt)}${enDash}${clock.time(told.endedAt)} overlaps ticket ${told.otherTicketNumber} for crew ${told.certNumber}`,
  },
  ROE_MISSING: { billing: 'BILLS', ending: 'REVIEW', words: () => 'no ROE' },
  ROE_NOT_ON_PROJECT: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `ROE ${told.roe} is not on this project`,
  },
  ROE_UNSIGNED: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `ROE ${told.roe} is not signed`,
  },
  ROE_OUT_OF_SCOPE: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `outside the scope of ROE ${told.roe}`,
  },
  NO_PRE_WORK_SURVEY: { billing: 'BILLS', ending: 'RECORD', words: () => 'no pre-work survey' },
  CERTIFICATION_PHOTO_MISSING: {
    billing: 'BILLS',
    ending: 'RECORD',
    words: (told) => `no ${viewWords[told.view]} photo`,
  },
  // Two spellings of one sub, never merged and never decided here (ADR-529 (f)).
  SUB_NAME_ALIKE: {
    billing: 'BILLS',
    ending: 'RECORD',
    words: (told) => `sub “${told.sub}” looks like “${told.alike}” on this project`,
  },
  PERMIT_OUTSTANDING: { billing: 'BILLS', ending: 'RECORD', words: () => 'permit outstanding' },
  NO_PRICING_RULE: {
    billing: 'NOT_BILLED',
    ending: 'NOT_BILLED',
    words: (told) => `no pricing rule on a ${told.prime} contract matches`,
  },
  DUPLICATE_TRANSACTION_NUMBER: {
    billing: 'LINE_NOT_BILLED',
    ending: 'NOT_BILLED',
    words: (told) =>
      `two rules create transaction ${String(told.slot)} (${told.payItems.join(', ')})`,
  },
  NO_RATE_FOR_PRIME: {
    billing: 'LINE_NOT_BILLED',
    ending: 'REVIEW',
    words: (told) => `pay item ${told.payItem} has no rate for ${told.prime}`,
  },
  RATE_TO_BE_NEGOTIATED: {
    billing: 'LINE_NOT_BILLED',
    ending: 'NOT_BILLED_YET',
    words: () => 'rate to be negotiated',
  },
  NOT_PROCESSED: {
    billing: 'NOT_BILLED',
    ending: 'NOT_BILLED',
    words: () => 'could not be processed',
  },
  NOT_PROCESSED_LINES_STAND: {
    billing: 'BILLS',
    ending: 'LINES_STAND',
    words: () => 'could not be processed',
  },
  DETAIL_MISSING: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `${eventWords[told.event]} has no ${told.missing}`,
  },
  TYPED_NUMBER_NO_REASON: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: () => 'typed ticket number (no reason picked)',
  },
  WRONG_KIND_OF_BADGE: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `${told.work} recorded on ${told.certifies} certification ${told.certNumber}`,
  },
  GPS_UNREADABLE: { billing: 'BILLS', ending: 'REVIEW', words: () => 'GPS unreadable' },
  NOT_A_TICKET_NUMBER: {
    billing: 'NOT_BILLED',
    ending: 'NOT_BILLED',
    words: () => 'not a valid ticket number',
  },
  ENDED_BEFORE_STARTED: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told, clock) =>
      `${eventWords[told.event]} ended ${clock.time(told.endedAt)}, before it started ${clock.time(told.startedAt)}`,
  },
  SPLIT_NOT_ALLOWED: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) => `a split ${told.split} on a project that doesn't allow split loads`,
  },
  OUTSIDE_CONTROL_RANGES: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: () => "number is in none of the project's control ticket ranges",
  },
  ASSIGNMENT_ON_ANOTHER_PROJECT: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: () => 'recorded under an assignment on another project',
  },
  SCALE_NET_DISAGREES: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: (told) =>
      `scale receipt ${told.receipt}'s net (${told.netTons} tons) is not its gross less its tare (${told.grossLessTareTons} tons)`,
  },
  TWO_QUANTITIES: {
    billing: 'BILLS',
    ending: 'REVIEW',
    words: () => 'disposal has both a load call and a scale weight',
  },
};

// A fact a flag keeps: text, a number, yes or no, nothing, or a list or a set of them. A time
// is kept as its instant in ISO 8601, a day as 2026-10-12.
export type Fact =
  string | number | boolean | null | readonly Fact[] | { readonly [name: string]: Fact };
export type FlagFacts = Readonly<Record<string, Fact>>;

// The facts as one text, the same whatever order they were given in: every set's names sorted.
const written = (fact: Fact): string => {
  if (fact === null || typeof fact !== 'object') return JSON.stringify(fact);
  if (Array.isArray(fact)) return `[${(fact as readonly Fact[]).map(written).join(',')}]`;
  const set = fact as Readonly<Record<string, Fact>>;
  const names = Object.keys(set).sort();
  return `{${names.map((name) => `${JSON.stringify(name)}:${written(set[name] ?? null)}`).join(',')}}`;
};

// A flag as a check raises it: what the worker writes as a `Flag`.
export interface FlagRaised<Code extends FlagCode = FlagCode> {
  readonly code: Code;
  readonly subject: FlagSubject;
  // The field event it is about, where it is about one (a split's property, the end whose
  // certification it is); none on a flag about the whole ticket.
  readonly fieldEventId: string | null;
  readonly message: string;
  readonly billing: FlagBilling;
  readonly facts: FlagFacts;
  readonly factsSha256: string;
}

// A flag already on a ticket and not cleared, as the worker reads it back.
export interface FlagStanding {
  readonly id: string;
  readonly code: FlagCode;
  readonly fieldEventId: string | null;
  readonly factsSha256: string;
}

// What makes a flag the same flag: its code, the field event it is about and its facts.
const markOf = (flag: FlagStanding | FlagRaised): string =>
  JSON.stringify([flag.code, flag.fieldEventId, flag.factsSha256]);

// What a reprocess does with a ticket's flags (spec/FLAGS.md §1; ADR-166).
export interface FlagsCompared<Standing extends FlagStanding> {
  // Raised before on the same facts: kept as it is, with its acceptance.
  readonly kept: readonly Standing[];
  // Its facts no longer raise it: cleared, never deleted.
  readonly cleared: readonly Standing[];
  // New, or raised again on changed facts: to be looked at.
  readonly raised: readonly FlagRaised[];
}

// The flags of one project, worded in its time zone.
export class Flags {
  readonly clock: ProjectClock;

  constructor(timeZone: string) {
    this.clock = new ProjectClock(timeZone);
  }

  raise<Code extends FlagCode>(
    code: Code,
    subject: FlagSubject,
    told: FlagTold[Code],
    facts: FlagFacts,
    fieldEventId: string | null = null,
  ): FlagRaised<Code> {
    const entry: Entry<Code> = catalogue[code];
    return {
      code,
      subject,
      fieldEventId,
      message: `${subjectWords(subject)}: ${entry.words(told, this.clock)}${endings[entry.ending]}`,
      billing: typeof entry.billing === 'function' ? entry.billing(told) : entry.billing,
      facts,
      factsSha256: Flags.hashOf(facts),
    };
  }

  // The SHA-256 of the facts, the same for the same facts in any order.
  static hashOf(facts: FlagFacts): string {
    return sha256(written(facts));
  }

  // Which of the flags a ticket's facts raise now a reviewer has accepted: the same flag as one
  // that stands accepted. Changed facts are another flag, to be looked at again (ADR-166).
  static accepted(
    standingAccepted: readonly FlagStanding[],
    now: readonly FlagRaised[],
  ): { accepted: boolean }[] {
    const accepted = new Set(standingAccepted.map(markOf));
    return now.map((flag) => ({ accepted: accepted.has(markOf(flag)) }));
  }

  // The flags a ticket has against the ones its current facts raise. A flag is the same flag when
  // its code, the field event it is about and its facts are: nothing else is compared, so a
  // message reworded by a renamed site changes no flag.
  static compared<Standing extends FlagStanding>(
    standing: readonly Standing[],
    now: readonly FlagRaised[],
  ): FlagsCompared<Standing> {
    const mark = markOf;
    const raisedNow = new Set(now.map(mark));
    const raisedBefore = new Set(standing.map(mark));
    return {
      kept: standing.filter((flag) => raisedNow.has(mark(flag))),
      cleared: standing.filter((flag) => !raisedNow.has(mark(flag))),
      raised: now.filter((flag) => !raisedBefore.has(mark(flag))),
    };
  }
}
