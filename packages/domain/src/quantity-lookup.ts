// What each site's phones ask for (spec/parts/01-setup.md, "What each site's phones will ask
// for"; adms-scale-receipts, "One quantity, never both"; AC-01-74…77; ADR-223, 227, 243, 357).
//
// A load or a haul-out takes one quantity, never both. Which one is worked out ahead, from the
// rules as written: for a site, a debris type and a prime, the rules of that form that could
// meet a ticket dumped there, and the pay items they add, the tipping fee pay items left out
// (a fee never makes a phone ask for anything, ADR-224):
//   - a load: every one paid from the tickets the load carries → a count of them; every one per
//     ton or pound → the scale weight; anything else (per CY, a mix, no rule) → the load call;
//   - a haul-out's disposal: every one per ton or pound → the scale weight; anything else →
//     nothing more, since the load call was taken at the loading end, as it always is.
// The answer follows the truck's prime, since a rule runs only on its contract's prime's tickets
// (ADR-239).
//
// It reads the setup and nothing else: no ticket changes it, and it is worked out again
// whenever a rule, a pay item or a site changes. Showing it on the site's page and sending it
// with a phone's lists are Phases 2…4.
import type { Named } from './checks.ts';
import { RuleReach, RuleValidity, type RuleEntry } from './rules.ts';
import type { PricedPayItem } from './ticket-pricing.ts';
import type { RuleContract } from './ticket-rules.ts';

export const quantityAsks = ['LOAD_CALL', 'SCALE_WEIGHT', 'CARRIED_COUNT', 'NOTHING_MORE'] as const;
export type QuantityAskName = (typeof quantityAsks)[number];

// The forms whose tickets are dumped at a site.
export type DumpedForm = 'LOAD' | 'HAUL_OUT';

// A load or haul-out form of the project, with the debris types on it (each a form's own entry).
export interface LookupForm {
  readonly id: string;
  readonly form: DumpedForm;
  readonly debrisTypes: readonly Named[];
}

export interface LookupSite extends Named {
  readonly siteTypeId: string;
  readonly tippingFeePayItemIds: readonly string[];
}

export type LookupPayItem = Pick<
  PricedPayItem,
  'id' | 'code' | 'unit' | 'quantityFromCarriedTickets'
>;

// The project's setup as it stands: only what is live.
export interface LookupSetup {
  readonly primes: readonly Named[];
  readonly contracts: readonly RuleContract[];
  readonly forms: readonly LookupForm[];
  readonly sites: readonly LookupSite[];
  // Every pay item a rule can name.
  readonly payItems: readonly LookupPayItem[];
  readonly rules: readonly RuleEntry[];
}

export interface QuantityAskedAt {
  readonly siteId: string;
  readonly form: DumpedForm;
  readonly debrisTypeId: string;
  readonly primeId: string;
}

export interface QuantityAsk extends QuantityAskedAt {
  readonly asks: QuantityAskName;
}

export class QuantityLookup {
  private readonly setup: LookupSetup;
  private readonly feePayItemIds: ReadonlySet<string>;

  constructor(setup: LookupSetup) {
    this.setup = setup;
    this.feePayItemIds = new Set(setup.sites.flatMap((site) => site.tippingFeePayItemIds));
  }

  // The whole lookup: a row for each site, debris type of a load or haul-out form, and prime.
  entries(): QuantityAsk[] {
    const { sites, forms, primes } = this.setup;
    return sites.flatMap((site) =>
      forms.flatMap(({ form, debrisTypes }) =>
        debrisTypes.flatMap((debrisType) =>
          primes.map((prime) => {
            const at = { siteId: site.id, form, debrisTypeId: debrisType.id, primeId: prime.id };
            return { ...at, asks: this.asks(at) };
          }),
        ),
      ),
    );
  }

  // One site's rows: what its phones carry.
  at(siteId: string): QuantityAsk[] {
    return this.entries().filter((entry) => entry.siteId === siteId);
  }

  asks(at: QuantityAskedAt): QuantityAskName {
    const paying = this.payingAt(at);
    const byWeight = (payItem: LookupPayItem): boolean =>
      !payItem.quantityFromCarriedTickets && (payItem.unit === 'TN' || payItem.unit === 'LB');
    const weighed = paying.length > 0 && paying.every(byWeight);
    if (at.form === 'HAUL_OUT') return weighed ? 'SCALE_WEIGHT' : 'NOTHING_MORE';
    if (paying.length > 0 && paying.every((payItem) => payItem.quantityFromCarriedTickets)) {
      return 'CARRIED_COUNT';
    }
    return weighed ? 'SCALE_WEIGHT' : 'LOAD_CALL';
  }

  // The pay items the rules that could meet a ticket there would pay it at, fees left out.
  private payingAt(at: QuantityAskedAt): LookupPayItem[] {
    const { setup } = this;
    const site = setup.sites.find((each) => each.id === at.siteId);
    const known = {
      DEBRIS_TYPE: at.debrisTypeId,
      DISPOSAL_SITE: at.siteId,
      CONTRACTOR: at.primeId,
      ...(site === undefined ? {} : { DISPOSAL_SITE_TYPE: site.siteTypeId }),
    };
    const contractIds = new Set(
      setup.contracts
        .filter((contract) => contract.primeId === at.primeId)
        .map((contract) => contract.id),
    );
    return setup.rules
      .filter((rule) => rule.form === at.form && new RuleValidity(rule).runs)
      .filter((rule) => rule.contract !== null && contractIds.has(rule.contract.id))
      .filter((rule) => new RuleReach(rule).couldMeet(known))
      .flatMap((rule) => new RuleReach(rule).adds())
      .filter((added) => !this.feePayItemIds.has(added.id))
      .map((added) => {
        const payItem = setup.payItems.find((each) => each.id === added.id);
        if (payItem === undefined) {
          throw new Error(`The lookup wasn't handed pay item ${added.code}, which a rule adds.`);
        }
        return payItem;
      });
  }
}

// One row of a site's lookup as a phone holds it, for its own site (the phone's lists).
export interface HeldQuantityAsk {
  readonly form: DumpedForm;
  readonly debrisTypeId: string;
  readonly primeId: string;
  readonly asks: QuantityAskName;
}

// Where a phone's answer came from: its site's row for the truck's prime; every prime's row for
// the debris type, where the truck's prime isn't known and they all say the same; or nothing the
// phone holds, so the lookup's own answer where no rule pays (C182).
export type PhoneAskFrom = 'LOOKUP' | 'EVERY_PRIME' | 'NOT_HELD';

export interface PhoneAsk {
  readonly asks: QuantityAskName;
  readonly from: PhoneAskFrom;
}

// The kinds of field event that take a quantity at a site: a load's disposal, a haul-out's two
// ends (adms-field-app §4A.4; adms-scale-receipts, "One quantity, never both").
export type QuantityKind = 'DISPOSAL' | 'HAUL_OUT_COLLECTION' | 'HAUL_OUT_DISPOSAL';

// What a phone asks a load or a haul-out for, from the lookup it holds for its site (ADR-013,
// 223, 227, 243, 582; AC-04-38, AC-11-40, 41; C83, C182). One rule for the field app and the
// scenario harness's phone, which asks as the field app does:
//   - a haul-out's collection always takes the load call, at the loading end, whatever its
//     site's lookup says (the lookup's haul-out rows are its disposal's);
//   - a disposal or a haul-out's disposal asks what its site's row says for the debris type
//     picked and the truck's prime;
//   - where the truck's prime isn't known (a badge the phone's certifications don't hold, a
//     truck keyed in by hand), the debris type's rows of every prime, where they agree;
//   - where the phone holds no row that answers (lists read for another site, a debris type the
//     lookup was worked out without), what the lookup says where no rule pays: the load call
//     for a load, nothing more for a haul-out's disposal (*agent default*, C182). A rule that
//     pays by weight there flags the line after sync (ADR-223), and the phone offers the scale
//     receipt beside the load call, so the paper is never lost.
export class PhoneQuantityAsks {
  private readonly held: readonly HeldQuantityAsk[];

  constructor(held: readonly HeldQuantityAsk[]) {
    this.held = held;
  }

  at(kind: QuantityKind, debrisTypeId: string | null, primeId: string | null): PhoneAsk {
    if (kind === 'HAUL_OUT_COLLECTION') return { asks: 'LOAD_CALL', from: 'LOOKUP' };
    const form: DumpedForm = kind === 'DISPOSAL' ? 'LOAD' : 'HAUL_OUT';
    const rows = this.held.filter(
      (row) => row.form === form && debrisTypeId !== null && row.debrisTypeId === debrisTypeId,
    );
    const own = rows.find((row) => primeId !== null && row.primeId === primeId);
    if (own !== undefined) return { asks: own.asks, from: 'LOOKUP' };
    const [first] = rows;
    if (primeId === null && first !== undefined && rows.every((row) => row.asks === first.asks)) {
      return { asks: first.asks, from: 'EVERY_PRIME' };
    }
    return { asks: form === 'LOAD' ? 'LOAD_CALL' : 'NOTHING_MORE', from: 'NOT_HELD' };
  }

  // Whether a field event's quantity is the one asked: none other given, and a scale receipt
  // only where the weight is asked or beside a load call or nothing more, where it is offered.
  static gives(
    asked: QuantityAskName,
    given: {
      readonly loadCall: number | null;
      readonly carriedCount: number | null;
      readonly scaleReceiptId: string | null;
    },
  ): boolean {
    const { loadCall, carriedCount, scaleReceiptId } = given;
    switch (asked) {
      case 'LOAD_CALL':
        return carriedCount === null;
      case 'SCALE_WEIGHT':
        return loadCall === null && carriedCount === null;
      case 'CARRIED_COUNT':
        return loadCall === null && scaleReceiptId === null;
      case 'NOTHING_MORE':
        return loadCall === null && carriedCount === null;
    }
  }
}
