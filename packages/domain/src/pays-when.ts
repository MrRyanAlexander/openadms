// The rules a pay item's "Pays when" writes (spec/RULES.md §1 step 5; ADR-229, 239, 292, 301, 313).
// The pay item screen says, for each form the pay item pays on, the criteria and the transaction #;
// saving it writes and keeps one rule for each of the project's contracts whose prime has a rate on
// the pay item, on each of those forms. A pay item names no form of its own, so a site's tipping
// fee can pay on loads and on haul-outs: a rule on each. Each rule is named from the pay item's
// code and description, marked as from the pay item, and changed only there (ProjectRules refuses
// a change made in the rule builder). The model is unchanged: these are ordinary rules.

import type { RuleCriterionLine, RuleForm } from './rule-criteria.ts';
import type { QuantityFrom, RuleEntry } from './rules.ts';

export interface PaysWhenPayItem {
  readonly id: string;
  readonly code: string;
  readonly description: string;
  // The primes that have a rate on it, by contractor id; an archived rate isn't one.
  readonly ratedPrimeIds: readonly string[];
}

// One of the project's contracts, with the prime that holds it.
export interface PaysWhenContract {
  readonly id: string;
  readonly name: string;
  readonly primeId: string;
  readonly archived: boolean;
}

// What "Pays when" says for one form: the criteria, and the # its transaction takes.
export interface PaysWhenOnForm {
  readonly formId: string;
  readonly form: RuleForm;
  readonly slot: number;
  readonly criteria: readonly RuleCriterionLine[];
  // On an itemised unit rate ticket: every item (as it starts), or the chosen ones (ADR-128).
  readonly quantityFrom?: QuantityFrom;
  readonly items?: readonly { readonly id: string; readonly name: string }[];
}

export class PaysWhen {
  private readonly payItem: PaysWhenPayItem;
  private readonly contracts: readonly PaysWhenContract[];

  constructor(payItem: PaysWhenPayItem, contracts: readonly PaysWhenContract[]) {
    this.payItem = payItem;
    this.contracts = contracts;
  }

  // What a rule the pay item wrote is called: its code and its description (ADR-301). Said once,
  // so a pay item whose code or description changes renames the rules it keeps the same way.
  static ruleName(payItem: Pick<PaysWhenPayItem, 'code' | 'description'>): string {
    return `${payItem.code} - ${payItem.description}`;
  }

  // The rules the pay item keeps, as they are to be saved: form by form, and within a form contract
  // by contract, in the order given. Each goes through ProjectRules' check like any other rule.
  rules(pays: readonly PaysWhenOnForm[]): RuleEntry[] {
    const { payItem } = this;
    const contracts = this.contracts.filter(
      (contract) => !contract.archived && payItem.ratedPrimeIds.includes(contract.primeId),
    );
    return pays.flatMap((on) =>
      contracts.map((contract) => ({
        id: null,
        name: PaysWhen.ruleName(payItem),
        formId: on.formId,
        form: on.form,
        contract: { id: contract.id, name: contract.name },
        active: true,
        archived: false,
        fromPayItem: { id: payItem.id, code: payItem.code },
        criteria: on.criteria,
        actions: [
          {
            kind: 'ADD_TRANSACTION' as const,
            slot: on.slot,
            payItem: { id: payItem.id, code: payItem.code },
            quantityFrom: on.quantityFrom ?? 'ALL_ITEMS',
            items: on.items ?? [],
          },
        ],
      })),
    );
  }
}
