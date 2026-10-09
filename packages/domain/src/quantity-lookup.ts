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
