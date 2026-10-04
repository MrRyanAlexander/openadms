// What each kind of field event records beside what every kind does (spec/DATA-MODEL.md §4.1 (2),
// §8; spec/acceptance/04-field-capture.md sections C–G; ADR-006, 034, 055, 207, 218, 236, 295,
// 325, 326, 327).
// One rule for the phone, the contracts package and the server: a detail belongs to its kinds and
// to no other, a split load's property has its suffix and its estimate both or neither, and a
// measurement says how it was read. The database holds the same with its own checks.
//
// Nothing here judges whether work was eligible (ADR-052), and no detail is required: a pick that
// is missing is flagged after sync, never refused. What is refused is a record that isn't one.

// The five kinds, as the database keeps them (ADR-236).
export const fieldEventKinds = [
  'COLLECTION',
  'DISPOSAL',
  'HAUL_OUT_COLLECTION',
  'HAUL_OUT_DISPOSAL',
  'UNIT_RATE',
] as const;
export type FieldEventKindName = (typeof fieldEventKinds)[number];

const load = ['COLLECTION', 'DISPOSAL'] as const;
const haulOut = ['HAUL_OUT_COLLECTION', 'HAUL_OUT_DISPOSAL'] as const;
const unitRate = ['UNIT_RATE'] as const;

// Each kind-specific detail and the kinds that record it.
export const fieldEventDetails = {
  formDebrisTypeId: [...load, ...haulOut],
  fieldTagId: ['COLLECTION', 'HAUL_OUT_COLLECTION', 'UNIT_RATE'],
  roeNumber: ['COLLECTION', 'UNIT_RATE'],
  // The ROE that number found, where the project has one (ADR-292).
  roeId: ['COLLECTION', 'UNIT_RATE'],
  estimateCy: ['COLLECTION'],
  loadCall: ['DISPOSAL', 'HAUL_OUT_COLLECTION'],
  // The tower's, where the paper is handed over (ADR-034, 227).
  scaleReceiptId: ['DISPOSAL', 'HAUL_OUT_DISPOSAL'],
  carriedCount: ['DISPOSAL'],
  kindOfWorkId: unitRate,
  payableTypeId: unitRate,
  payItemId: unitRate,
  unitCount: unitRate,
  measurementInches: unitRate,
  measuredAs: unitRate,
  rootBallInches: unitRate,
  rootBallHalfExposed: unitRate,
  surveyNumber: unitRate,
  markedIneligible: unitRate,
} as const satisfies Record<string, readonly FieldEventKindName[]>;
export type FieldEventDetail = keyof typeof fieldEventDetails;
// Every kind-specific detail, in the order of spec/DATA-MODEL.md §4.1 (2).
export const fieldEventDetailNames = Object.keys(fieldEventDetails) as FieldEventDetail[];

// How a tree was measured: what the monitor read, never a conversion (ADR-177).
export const measuredAs = ['CIRCUMFERENCE', 'DIAMETER'] as const;
export type MeasuredAs = (typeof measuredAs)[number];

// A field event's split suffix and its kind-specific details; a detail left out, or null, wasn't
// recorded.
export type RecordedDetails = {
  // Empty when not split.
  readonly splitSuffix: string;
} & Readonly<Partial<Record<FieldEventDetail, unknown>>>;

// Why a record isn't one, in plain words, and the detail it is about.
export interface DetailRefusal {
  readonly code:
    'NOT_THIS_KINDS' | 'SUFFIX_NOT_LETTERS' | 'SPLIT_INCOMPLETE' | 'MEASUREMENT_INCOMPLETE';
  readonly detail: FieldEventDetail | 'splitSuffix';
  readonly message: string;
}

const kindWords: Record<FieldEventKindName, string> = {
  COLLECTION: 'A collection',
  DISPOSAL: 'A disposal',
  HAUL_OUT_COLLECTION: 'A haul-out collection',
  HAUL_OUT_DISPOSAL: 'A haul-out disposal',
  UNIT_RATE: 'A unit rate event',
};

const detailWords: Record<FieldEventDetail, string> = {
  formDebrisTypeId: 'a debris type',
  fieldTagId: 'a field tag',
  roeNumber: 'an ROE',
  roeId: 'the ROE its number found',
  estimateCy: 'an estimate',
  loadCall: 'a load call',
  scaleReceiptId: 'a scale receipt',
  carriedCount: 'a count of what the load carries',
  kindOfWorkId: 'a kind of work',
  payableTypeId: 'a payable type',
  payItemId: 'a pay item',
  unitCount: 'a count',
  measurementInches: 'a measurement',
  measuredAs: 'how it was measured',
  rootBallInches: 'a root ball',
  rootBallHalfExposed: 'whether the root ball is exposed',
  surveyNumber: 'a survey number',
  markedIneligible: '"marked ineligible"',
};

const recorded = (value: unknown): boolean => value !== undefined && value !== null;

// The kinds that take a split suffix: a load's properties and a haul-out's piles (ADR-032, 295).
const splitKinds: readonly FieldEventKindName[] = ['COLLECTION', 'HAUL_OUT_COLLECTION'];

// What one kind of field event records.
export class FieldEventDetails {
  private readonly kind: FieldEventKindName;

  constructor(kind: FieldEventKindName) {
    this.kind = kind;
  }

  // The details this kind records.
  recorded(): FieldEventDetail[] {
    return fieldEventDetailNames.filter((detail) => this.takes(detail));
  }

  takes(detail: FieldEventDetail): boolean {
    return (fieldEventDetails[detail] as readonly FieldEventKindName[]).includes(this.kind);
  }

  // Whether this kind is split: one field event per property, or per pile.
  splits(): boolean {
    return splitKinds.includes(this.kind);
  }

  // A suffix as it is kept: capital letters, without its hyphen (A, B… AA).
  isSuffix(suffix: string): boolean {
    return this.splits() && /^[A-Z]+$/.test(suffix);
  }

  // Every reason these details aren't a record of this kind; none when they are.
  refusals(details: RecordedDetails): DetailRefusal[] {
    const { kind } = this;
    const { splitSuffix } = details;
    const refusals: DetailRefusal[] = [];
    for (const detail of fieldEventDetailNames) {
      if (recorded(details[detail]) && !this.takes(detail)) {
        refusals.push({
          code: 'NOT_THIS_KINDS',
          detail,
          message: `${kindWords[kind]} doesn't record ${detailWords[detail]}.`,
        });
      }
    }
    if (splitSuffix !== '') {
      if (!this.splits()) {
        refusals.push({
          code: 'NOT_THIS_KINDS',
          detail: 'splitSuffix',
          message: `${kindWords[kind]} has no split suffix: only a load's collections and a haul-out's collections are split.`,
        });
      } else if (!this.isSuffix(splitSuffix)) {
        refusals.push({
          code: 'SUFFIX_NOT_LETTERS',
          detail: 'splitSuffix',
          message: `A split suffix is capital letters (A, B…), not "${splitSuffix}".`,
        });
      }
    }
    // A split load's property: its suffix and its estimate, both or neither (ADR-006, 055). A
    // haul-out's pile gives its load call so far instead (ADR-295).
    if (kind === 'COLLECTION' && (splitSuffix !== '') !== recorded(details.estimateCy)) {
      refusals.push({
        code: 'SPLIT_INCOMPLETE',
        detail: splitSuffix === '' ? 'splitSuffix' : 'estimateCy',
        message:
          splitSuffix === ''
            ? "An estimate belongs to a split load's property: this collection has no split suffix."
            : `Split collection -${splitSuffix} has no estimate: a split load's property has both.`,
      });
    }
    if (recorded(details.measurementInches) !== recorded(details.measuredAs)) {
      refusals.push({
        code: 'MEASUREMENT_INCOMPLETE',
        detail: recorded(details.measuredAs) ? 'measurementInches' : 'measuredAs',
        message:
          'A measurement says whether it was read as a circumference or a diameter, and only a measurement does.',
      });
    }
    return refusals;
  }
}
