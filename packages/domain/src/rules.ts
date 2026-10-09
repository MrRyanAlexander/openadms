// A project's rules as setup checks them (spec/RULES.md §2, §4a, §5, §7; spec/parts/01-setup.md
// step 8; ADR-118, 125, 229, 239, 301, 313). Three things are worked out here, each as the rule
// builder saves a rule:
//   - "Is valid" (§7), never stored or typed: a rule that isn't valid is saved all the same and
//     never runs, and the reasons are given;
//   - the one refusal: an exact copy of another rule of the project isn't saved, and the error names
//     the rule it copies (ADR-301); a rule a pay item's "Pays when" wrote is changed only from its
//     pay item (ADR-229);
//   - the warning, never a refusal, when two rules add the same transaction # and a ticket could
//     meet both (ADR-125): at run time such a ticket is flagged and neither bills (§6.4).
// A rule that names an archived form, contract or pay item is not valid either, as one whose
// criterion picks an archived value isn't (ADR-357).
// Nothing here reads a ticket: how the worker runs the rules is the engine's (BACKLOG 1.6).

import type { SetupWarning } from './form-debris-types.ts';
import {
  type RuleCriterionKey,
  type RuleCriterionLine,
  type RuleForm,
  RuleCriteria,
} from './rule-criteria.ts';

// The actions a rule can carry, and no other: there is no Flag action (ADR-164).
export const ruleActionKinds = ['ADD_TRANSACTION', 'REMOVE_TRANSACTION', 'VOID_TICKET'] as const;
export type RuleActionKind = (typeof ruleActionKinds)[number];
export type QuantityFrom = 'ALL_ITEMS' | 'CHOSEN_ITEMS';

// One action of a rule (spec/RULES.md §5). The # is the transaction's slot on the ticket.
export interface RuleActionLine {
  readonly kind: RuleActionKind;
  readonly slot: number | null;
  // `archived` where the pay item has been taken off the project: the rule then never runs (§7).
  readonly payItem: {
    readonly id: string;
    readonly code: string;
    readonly archived?: boolean;
  } | null;
  // On an Add transaction: every item of an itemised ticket, or the chosen ones (ADR-128).
  readonly quantityFrom: QuantityFrom | null;
  readonly items: readonly { readonly id: string; readonly name: string }[];
}

// A rule as setup holds it, with the lines still on it (an archived line is left out).
export interface RuleEntry {
  // Empty on a rule not saved yet.
  readonly id: string | null;
  readonly name: string;
  readonly formId: string;
  readonly form: RuleForm;
  // Its form taken off the project (§7).
  readonly formArchived?: boolean;
  readonly contract: {
    readonly id: string;
    readonly name: string;
    readonly archived?: boolean;
  } | null;
  readonly active: boolean;
  readonly archived: boolean;
  // The pay item whose "Pays when" wrote it (ADR-229).
  readonly fromPayItem: { readonly id: string; readonly code: string } | null;
  readonly criteria: readonly RuleCriterionLine[];
  readonly actions: readonly RuleActionLine[];
}

// A rule setup won't save, and why (the only refusals setup makes are bad settings, AC-01-80).
export interface RuleRefusal {
  readonly code: 'RULE_DUPLICATE' | 'RULE_FROM_PAY_ITEM';
  readonly message: string;
  // The rule it copies, by id; empty on RULE_FROM_PAY_ITEM.
  readonly sameAs: string | null;
}

export interface RuleCheck {
  readonly refusal: RuleRefusal | null;
  readonly warnings: readonly SetupWarning[];
  // "Is valid", and why not.
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

// spec/RULES.md §7: only Active + Valid rules run.
export class RuleValidity {
  private readonly rule: RuleEntry;

  constructor(rule: RuleEntry) {
    this.rule = rule;
  }

  get valid(): boolean {
    return this.reasons().length === 0;
  }

  // Whether the worker takes it at all: active, valid and not archived.
  get runs(): boolean {
    return this.rule.active && !this.rule.archived && this.valid;
  }

  // Why the rule isn't valid, each in plain words; none when it is.
  reasons(): string[] {
    const { rule } = this;
    const reasons: string[] = [];
    if (rule.name.trim() === '') reasons.push('It has no name.');
    if (rule.formArchived === true) reasons.push('Its form is archived.');
    if (rule.contract?.archived === true) {
      reasons.push(`Its contract "${rule.contract.name}" is archived.`);
    }
    if (rule.criteria.length === 0) reasons.push('It has no criterion: a rule needs at least one.');
    if (rule.actions.length === 0) reasons.push('It has no action: a rule needs at least one.');
    const formCriteria = new RuleCriteria(rule.form);
    for (const line of rule.criteria) {
      const label = RuleCriteria.labelOf(line.criterion);
      if (!formCriteria.takes(line.criterion)) {
        reasons.push(`${label} doesn't apply to a ${formCriteria.formName} rule.`);
        continue;
      }
      const problem = RuleCriteria.problemWith(line);
      if (problem !== null) reasons.push(problem);
      for (const pick of line.picks) {
        if (pick.gone) reasons.push(`${label}: "${pick.name}" is no longer on the project.`);
      }
    }
    if (
      rule.contract === null &&
      rule.actions.some((action) => action.kind === 'ADD_TRANSACTION')
    ) {
      reasons.push('It adds a transaction, so it must name a contract.');
    }
    for (const action of rule.actions) {
      if (action.kind === 'ADD_TRANSACTION') {
        if (action.slot === null) reasons.push('An Add transaction has no #.');
        if (action.payItem === null) {
          reasons.push(
            action.slot === null
              ? 'An Add transaction has no pay item.'
              : `Add transaction ${String(action.slot)} has no pay item.`,
          );
        } else if (action.payItem.archived === true) {
          reasons.push(`Pay item ${action.payItem.code} is archived.`);
        }
      }
      if (action.kind === 'REMOVE_TRANSACTION' && action.slot === null) {
        reasons.push('A Remove transaction has no #.');
      }
    }
    return reasons;
  }
}

// How far a rule reaches, worked out ahead of any ticket: whether it could meet a ticket of which
// some picked values are already known (its debris type, the site it is dumped at, its prime), and
// what it would add. A criterion that isn't known ahead (a mileage, a date, a zone) is left open:
// the rule could meet it. The setup check and the sites' quantity lookup both ask this (ADR-227,
// 229).
export class RuleReach {
  private readonly rule: RuleEntry;

  constructor(rule: RuleEntry) {
    this.rule = rule;
  }

  // `known` holds, by criterion, the id of the value the ticket would have.
  couldMeet(known: Partial<Record<RuleCriterionKey, string>>): boolean {
    return this.rule.criteria.every((line) => {
      const value = known[line.criterion];
      if (value === undefined || RuleCriteria.kindOf(line.criterion) !== 'PICK') return true;
      const picked = line.picks.some((pick) => pick.value === value);
      switch (line.operator) {
        case 'EQUALS':
        case 'IS_ONE_OF':
          return picked;
        case 'NOT_EQUALS':
        case 'IS_NOT_ONE_OF':
          return !picked;
        case 'IS_EMPTY':
          return false;
        default:
          return true;
      }
    });
  }

  // The pay items its Add transactions name.
  adds(): { readonly id: string; readonly code: string }[] {
    return this.rule.actions.flatMap((action) =>
      action.kind === 'ADD_TRANSACTION' && action.payItem !== null ? [action.payItem] : [],
    );
  }
}

// What a criterion's lines let its value be, for telling two rules apart: one of some values, or
// anything but some; or a stretch of numbers or days.
type Values =
  | { readonly kind: 'ONLY'; readonly values: ReadonlySet<string> }
  | { readonly kind: 'NOT'; readonly values: ReadonlySet<string> };

interface Stretch {
  readonly from: number;
  readonly fromOpen: boolean;
  readonly to: number;
  readonly toOpen: boolean;
}

// "No value at all", among a criterion's values.
const empty = '\u0000empty';
const everything: Stretch = {
  from: Number.NEGATIVE_INFINITY,
  fromOpen: true,
  to: Number.POSITIVE_INFINITY,
  toOpen: true,
};
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class ProjectRules {
  // Every rule of the project, archived and inactive ones included.
  private readonly rules: readonly RuleEntry[];

  constructor(rules: readonly RuleEntry[]) {
    this.rules = rules;
  }

  // What setup says as it saves this rule, a new one or a change. `changedFrom` is where the change
  // was made: the rule builder, or a pay item's "Pays when".
  check(rule: RuleEntry, changedFrom: 'RULES' | 'PAY_ITEM' = 'RULES'): RuleCheck {
    const validity = new RuleValidity(rule);
    const reasons = validity.reasons();
    const answer = (refusal: RuleRefusal | null, warnings: readonly SetupWarning[]): RuleCheck => ({
      refusal,
      warnings,
      valid: reasons.length === 0,
      reasons,
    });

    const stored = this.rules.find((other) => other.id !== null && other.id === rule.id);
    const fromPayItem = stored?.fromPayItem ?? rule.fromPayItem;
    if (changedFrom === 'RULES' && fromPayItem !== null) {
      return answer(
        {
          code: 'RULE_FROM_PAY_ITEM',
          message: `Not saved: this rule is from pay item ${fromPayItem.code}. Change it on the pay item.`,
          sameAs: null,
        },
        [],
      );
    }
    // A rule being archived is never refused; one put back is checked like a new one.
    if (rule.archived) return answer(null, []);

    const others = this.rules.filter(
      (other) => !other.archived && (other.id === null || other.id !== rule.id),
    );
    const signature = ProjectRules.signatureOf(rule);
    const copied = others.find((other) => ProjectRules.signatureOf(other) === signature);
    if (copied !== undefined) {
      return answer(
        {
          code: 'RULE_DUPLICATE',
          message: `Not saved: this rule is the same as "${copied.name}".`,
          sameAs: copied.id,
        },
        [],
      );
    }
    return answer(
      null,
      others.flatMap((other) => ProjectRules.overlapOf(rule, other)),
    );
  }

  // What makes two rules the same rule (ADR-301): the form, the contract (or none), the criteria
  // and the actions, in any order. The name and the Active tick are left out.
  private static signatureOf(rule: RuleEntry): string {
    const tenThousandths = (value: number | null): number | null =>
      value === null ? null : Math.round(value * 10_000);
    const criteria = rule.criteria.map((line) =>
      JSON.stringify([
        line.criterion,
        line.operator,
        [...new Set(line.picks.map((pick) => pick.value))].sort(),
        tenThousandths(line.numberFrom),
        tenThousandths(line.numberTo),
        line.dateFrom,
        line.dateTo,
        line.text,
      ]),
    );
    const actions = rule.actions.map((action) =>
      JSON.stringify([
        action.kind,
        action.slot,
        action.payItem?.id ?? null,
        action.kind === 'ADD_TRANSACTION' ? (action.quantityFrom ?? 'ALL_ITEMS') : null,
        action.quantityFrom === 'CHOSEN_ITEMS'
          ? [...new Set(action.items.map((item) => item.id))].sort()
          : [],
      ]),
    );
    return JSON.stringify([
      rule.formId,
      rule.contract?.id ?? null,
      [...new Set(criteria)].sort(),
      [...new Set(actions)].sort(),
    ]);
  }

  // The warning, if any, that a ticket could meet both rules and both add the same transaction #.
  // Rules on different forms, or naming different contracts, never meet on one ticket (ADR-239).
  private static overlapOf(rule: RuleEntry, other: RuleEntry): SetupWarning[] {
    if (rule.formId !== other.formId) return [];
    if ((rule.contract?.id ?? null) !== (other.contract?.id ?? null)) return [];
    const added = (entry: RuleEntry): number[] =>
      entry.actions.flatMap((action) =>
        action.kind === 'ADD_TRANSACTION' && action.slot !== null ? [action.slot] : [],
      );
    const slot = added(rule)
      .filter((own) => added(other).includes(own))
      .sort((a, b) => a - b)[0];
    if (slot === undefined) return [];

    let overlap: string | null = null;
    const criteria = new Set(rule.criteria.map((line) => line.criterion));
    for (const criterion of criteria) {
      if (!other.criteria.some((line) => line.criterion === criterion)) continue;
      const lines = [...rule.criteria, ...other.criteria].filter(
        (line) => line.criterion === criterion,
      );
      const kind = RuleCriteria.kindOf(criterion);
      // A ticket lists many items, so two Item lines never keep two rules apart.
      if (kind === 'ITEM_COUNT') continue;
      if (kind === 'PICK' || kind === 'TEXT') {
        if (ProjectRules.noValueMeets(lines)) return [];
        continue;
      }
      const stretch = ProjectRules.stretchOf(lines);
      if (stretch === null) return [];
      if (overlap === null && ProjectRules.narrowed(stretch)) {
        overlap = `their ${RuleCriteria.labelOf(criterion)} ranges overlap ${ProjectRules.said(criterion, stretch)}`;
      }
    }
    const names = `"${rule.name}" and "${other.name}" both add transaction ${String(slot)}`;
    return [
      {
        code: 'RULES_OVERLAP',
        message: `${names}, and ${overlap ?? 'a ticket could meet both'}. A ticket that meets both is flagged, and neither bills. Saved as it is.`,
      },
    ];
  }

  // The numbers or days that meet every one of these lines of one criterion: null when none does.
  // IS EMPTY meets no number, so it and a line that needs one are never both met; NOT EQUALS and
  // NOT ON leave every value in.
  private static stretchOf(lines: readonly RuleCriterionLine[]): Stretch | null {
    let stretch: Stretch | null = everything;
    let emptyOnly = false;
    let needsValue = false;
    const lowest = Number.NEGATIVE_INFINITY;
    const highest = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const isDate = RuleCriteria.kindOf(line.criterion) === 'DATE';
      const from = isDate ? RuleCriteria.dayOf(line.dateFrom) : line.numberFrom;
      const to = isDate ? RuleCriteria.dayOf(line.dateTo) : line.numberTo;
      if (line.operator === 'IS_EMPTY') emptyOnly = true;
      if (line.operator === 'IS_NOT_EMPTY') needsValue = true;
      if (from === null || stretch === null) continue;
      switch (line.operator) {
        case 'EQUALS':
        case 'ON':
          stretch = ProjectRules.within(stretch, from, false, from, false);
          break;
        case 'BETWEEN':
          stretch = ProjectRules.within(stretch, from, false, to ?? from, false);
          break;
        case 'AT_LEAST':
        case 'ON_OR_AFTER':
          stretch = ProjectRules.within(stretch, from, false, highest, true);
          break;
        case 'AT_MOST':
        case 'ON_OR_BEFORE':
          stretch = ProjectRules.within(stretch, lowest, true, from, false);
          break;
        case 'MORE_THAN':
          stretch = ProjectRules.within(stretch, from, true, highest, true);
          break;
        case 'LESS_THAN':
          stretch = ProjectRules.within(stretch, lowest, true, from, true);
          break;
        default:
          continue;
      }
      needsValue = true;
    }
    return emptyOnly && needsValue ? null : stretch;
  }

  // The part of a stretch that lies within another, or null when they share nothing.
  private static within(
    current: Stretch,
    lower: number,
    lowerOpen: boolean,
    upper: number,
    upperOpen: boolean,
  ): Stretch | null {
    const fromHere = lower > current.from || (lower === current.from && lowerOpen);
    const toHere = upper < current.to || (upper === current.to && upperOpen);
    const next: Stretch = {
      from: fromHere ? lower : current.from,
      fromOpen: fromHere ? lowerOpen : current.fromOpen,
      to: toHere ? upper : current.to,
      toOpen: toHere ? upperOpen : current.toOpen,
    };
    if (next.from > next.to) return null;
    if (next.from === next.to && (next.fromOpen || next.toOpen)) return null;
    return next;
  }

  private static narrowed(stretch: Stretch): boolean {
    return stretch.from !== everything.from || stretch.to !== everything.to;
  }

  // Whether no value can meet every one of these lines of one picked or text criterion, as far as
  // it can be told: EQUALS two different sites; IS ONE OF lists that share nothing; IS EMPTY and
  // a picked value. Text that CONTAINS or STARTS WITH something is never told apart.
  private static noValueMeets(lines: readonly RuleCriterionLine[]): boolean {
    let values: Values = { kind: 'NOT', values: new Set() };
    for (const line of lines) {
      const text = line.text === null ? [] : [line.text];
      const picked =
        RuleCriteria.kindOf(line.criterion) === 'TEXT'
          ? text
          : line.picks.map((pick) => pick.value);
      switch (line.operator) {
        case 'EQUALS':
        case 'IS_ONE_OF':
          values = ProjectRules.both(values, { kind: 'ONLY', values: new Set(picked) });
          break;
        case 'NOT_EQUALS':
        case 'IS_NOT_ONE_OF':
          values = ProjectRules.both(values, { kind: 'NOT', values: new Set(picked) });
          break;
        case 'IS_EMPTY':
          values = ProjectRules.both(values, { kind: 'ONLY', values: new Set([empty]) });
          break;
        case 'IS_NOT_EMPTY':
          values = ProjectRules.both(values, { kind: 'NOT', values: new Set([empty]) });
          break;
        default:
          break;
      }
    }
    return values.kind === 'ONLY' && values.values.size === 0;
  }

  private static both(a: Values, b: Values): Values {
    if (a.kind === 'ONLY' && b.kind === 'ONLY') {
      return {
        kind: 'ONLY',
        values: new Set([...a.values].filter((value) => b.values.has(value))),
      };
    }
    if (a.kind === 'NOT' && b.kind === 'NOT') {
      return { kind: 'NOT', values: new Set([...a.values, ...b.values]) };
    }
    const [only, not] = a.kind === 'ONLY' ? [a, b] : [b, a];
    return {
      kind: 'ONLY',
      values: new Set([...only.values].filter((value) => !not.values.has(value))),
    };
  }

  // A stretch as the warning says it: "at 15.0", "up to 10.0", "from 15 Oct 2026 on".
  private static said(criterion: RuleCriterionKey, stretch: Stretch): string {
    const value = (at: number): string => {
      if (RuleCriteria.kindOf(criterion) === 'DATE') {
        const day = new Date(at * 86_400_000);
        return `${String(day.getUTCDate())} ${months[day.getUTCMonth()] ?? ''} ${String(day.getUTCFullYear())}`;
      }
      // Mileage is compared in tenths of a mile (ADR-125).
      return criterion === 'MILEAGE' ? at.toFixed(1) : String(at);
    };
    const { from, fromOpen, to, toOpen } = stretch;
    if (from === to) return `at ${value(from)}`;
    if (from === Number.NEGATIVE_INFINITY) return `${toOpen ? 'below' : 'up to'} ${value(to)}`;
    if (to === Number.POSITIVE_INFINITY) {
      return fromOpen ? `above ${value(from)}` : `from ${value(from)} on`;
    }
    return `${fromOpen ? 'above' : 'from'} ${value(from)} ${toOpen ? 'to below' : 'to'} ${value(to)}`;
  }
}
