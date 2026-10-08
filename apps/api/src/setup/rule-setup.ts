// Setup step 8, the rule builder (spec/parts/01-setup.md; spec/RULES.md §2…§7; ADR-109, 118, 125,
// 239, 301, 313; BACKLOG C58): a rule on one of the project's load, haul-out or unit rate forms,
// naming one of its contracts, with its criteria and actions. Before it saves, setup asks
// packages/domain's ProjectRules: an exact copy of another rule isn't saved, and neither is a
// change made here to a rule a pay item's "Pays when" wrote; two rules that add the same
// transaction # on a ticket both could meet are saved with a warning. A rule that isn't valid is
// saved all the same and never runs: the answer says whether it is, and why not.
import { ProjectRules, type RuleEntry } from '@open-adms/domain';

import { type ActionInput, type CriterionInput, RuleBook } from './rule-book.ts';
import { type Outcome, QueueingService, Refused } from './setup-service.ts';

export interface RuleInput {
  // Given on a change to a rule the project holds; left out on a new one.
  readonly id?: string;
  readonly projectId: string;
  readonly formId: string;
  readonly name: string;
  // Empty only on a rule with no Add transaction.
  readonly contractId: string | null;
  readonly active: boolean;
  readonly criteria: readonly CriterionInput[];
  readonly actions: readonly ActionInput[];
}

export interface SavedRule {
  readonly id: string;
  // "Is valid" (spec/RULES.md §7): worked out, never stored.
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

// A rule saved moves the lines of its form's tickets: each un-invoiced one is queued in the
// same piece of work, a void one left where it is (ADR-090, 360, 420).
export class RuleSetup extends QueueingService {
  save(person: string, input: RuleInput): Promise<Outcome<SavedRule>> {
    return this.setup(person, async (tx, warn) => {
      const book = new RuleBook(tx, input.projectId, this.clock);
      const rules = await book.entries();
      const stored = rules.find((rule) => rule.id === input.id);
      const entry: RuleEntry = {
        id: input.id ?? null,
        name: input.name,
        formId: input.formId,
        form: await book.formOf(input.formId),
        contract: await book.contractOf(input.contractId),
        active: input.active,
        archived: false,
        fromPayItem: stored?.fromPayItem ?? null,
        criteria: await book.linesOf(input.criteria),
        actions: await book.actionsOf(input.actions),
      };
      const check = new ProjectRules(rules).check(entry, 'RULES');
      if (check.refusal !== null) throw new Refused(check.refusal);
      warn(check.warnings);
      const said = { valid: check.valid, reasons: check.reasons };
      // A rule runs on its form's tickets, and a form is a workflow's: the one it had too,
      // where the rule moved.
      const forms = [...new Set([entry.form, ...(stored === undefined ? [] : [stored.form])])];
      await this.setupChanged(tx, person, input.projectId, { workflow: { in: forms } });
      if (stored?.id == null) return { id: await book.add(entry), ...said };
      await book.change(stored.id, entry, !sameLines(stored, entry));
      return { id: stored.id, ...said };
    });
  }
}

// Whether two entries are the same rule, their names and Active ticks apart: the domain's own
// reading of "the same" (ADR-301), asked of it rather than written twice.
export function sameLines(one: RuleEntry, other: RuleEntry): boolean {
  const check = new ProjectRules([{ ...one, id: 'the-other', archived: false }]).check(
    { ...other, id: null, archived: false, fromPayItem: null },
    'RULES',
  );
  return check.refusal?.code === 'RULE_DUPLICATE';
}
