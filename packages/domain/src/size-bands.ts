// The size bands of one payable type's pay items on a project (spec/parts/01-setup.md step 6;
// spec/DATA-MODEL.md §3 "PayItem"; ADR-210, 213, 217, 309). Where one payable type has several pay
// items, each one's band, in inches, says which a measurement falls in: the phone works the pay
// item out from it, and reconciliation again. Setup refuses a band that overlaps another of the
// same payable type, and warns, never refuses, where a measurement would fall in no band. A lone
// pay item's band only flags its out-of-range work (ADR-210).
//
// A band holds both its ends, in tenths of an inch, as the database keeps them (decimal(8,1)): 6–24
// and 24.1–99 meet, with no gap between them. Either end may be open: "24 in and up".

import type { SetupWarning } from './form-debris-types.ts';

// One pay item of the payable type, as setup holds its band.
export interface BandedPayItem {
  readonly id: string;
  readonly code: string;
  // Empty is open: from nought, or up with no end.
  readonly bandFrom: number | null;
  readonly bandTo: number | null;
  // Taken off; its band no longer counts.
  readonly archived: boolean;
}

// A setting setup won't save, and why (ADR-217; the only refusals setup makes are bad settings,
// AC-01-80).
export interface SetupRefusal {
  readonly code: 'SIZE_BAND_OVERLAP' | 'SIZE_BAND_INVALID';
  readonly message: string;
  // The codes of the pay items whose bands it overlaps, in band order.
  readonly overlaps: readonly string[];
}

export interface BandCheck {
  readonly refusal: SetupRefusal | null;
  readonly warnings: readonly SetupWarning[];
}

// A band in whole tenths of an inch; an open end is the furthest there is.
interface Tenths {
  readonly payItem: BandedPayItem;
  readonly from: number;
  readonly to: number;
}

export class SizeBands {
  // The payable type's name, as the messages say it.
  private readonly payableType: string;
  private readonly payItems: readonly BandedPayItem[];

  constructor(payableType: string, payItems: readonly BandedPayItem[]) {
    this.payableType = payableType;
    this.payItems = payItems;
  }

  // What setup says as it saves this pay item's band, a new one or a change: refused when it is no
  // band at all or overlaps another; otherwise saved, with a warning for each stretch between the
  // payable type's bands that falls in none.
  check(payItem: BandedPayItem): BandCheck {
    if (payItem.archived || (payItem.bandFrom === null && payItem.bandTo === null)) {
      return { refusal: null, warnings: [] };
    }
    const invalid = SizeBands.invalid(payItem);
    if (invalid !== null) {
      return {
        refusal: { code: 'SIZE_BAND_INVALID', message: invalid, overlaps: [] },
        warnings: [],
      };
    }
    const candidate = SizeBands.tenths(payItem);
    const others = this.payItems
      .filter((other) => other.id !== payItem.id && !other.archived)
      .filter((other) => other.bandFrom !== null || other.bandTo !== null)
      .map((other) => SizeBands.tenths(other))
      .sort((a, b) => a.from - b.from);
    const overlapping = others.filter(
      (other) => other.from <= candidate.to && candidate.from <= other.to,
    );
    if (overlapping.length > 0) {
      const named = overlapping.map(
        (other) => `${other.payItem.code} (${SizeBands.range(other.from, other.to)})`,
      );
      return {
        refusal: {
          code: 'SIZE_BAND_OVERLAP',
          message: `${this.payableType}: ${SizeBands.range(candidate.from, candidate.to)} overlaps ${SizeBands.and(named)}. Bands of one payable type can't overlap.`,
          overlaps: overlapping.map((other) => other.payItem.code),
        },
        warnings: [],
      };
    }
    const bands = [...others, candidate].sort((a, b) => a.from - b.from);
    const warnings: SetupWarning[] = [];
    for (let index = 1; index < bands.length; index += 1) {
      const below = bands[index - 1];
      const above = bands[index];
      if (below === undefined || above === undefined || above.from - below.to <= 1) continue;
      warnings.push({
        code: 'SIZE_BAND_GAP',
        message: `${this.payableType}: ${SizeBands.range(below.to + 1, above.from - 1)} falls in no band; a measurement there gets no pay item and is flagged. Saved as it is.`,
      });
    }
    return { refusal: null, warnings };
  }

  // Why a band can't be a band, or null: its ends are inches in tenths, nought or more, the from no
  // more than the to. The database keeps a tenth, so a finer number would be rounded unseen.
  private static invalid(payItem: BandedPayItem): string | null {
    for (const end of [payItem.bandFrom, payItem.bandTo]) {
      if (end === null) continue;
      if (!Number.isFinite(end) || end < 0 || Math.abs(end * 10 - Math.round(end * 10)) > 1e-9) {
        return `${payItem.code}: a band's ends are inches to a tenth, nought or more: ${String(end)}.`;
      }
    }
    if (payItem.bandFrom !== null && payItem.bandTo !== null && payItem.bandFrom > payItem.bandTo) {
      return `${payItem.code}: a band runs from its lower end to its higher: ${String(payItem.bandFrom)}–${String(payItem.bandTo)} in.`;
    }
    return null;
  }

  private static tenths(payItem: BandedPayItem): Tenths {
    return {
      payItem,
      from: payItem.bandFrom === null ? 0 : Math.round(payItem.bandFrom * 10),
      to: payItem.bandTo === null ? Number.POSITIVE_INFINITY : Math.round(payItem.bandTo * 10),
    };
  }

  // A band as people read it: "6–24 in", "36.1 in", "24 in and up".
  private static range(from: number, to: number): string {
    const inches = (tenths: number): string => String(tenths / 10);
    if (to === Number.POSITIVE_INFINITY) return `${inches(from)} in and up`;
    if (from === to) return `${inches(from)} in`;
    return `${inches(from)}–${inches(to)} in`;
  }

  private static and(names: readonly string[]): string {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
  }
}
