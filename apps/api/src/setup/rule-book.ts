// A project's rules, between the database's rows and the domain's reading of them (spec/RULES.md;
// ADR-313; BACKLOG C58). packages/domain's ProjectRules checks a rule against every other rule of
// its project, and reads each as a RuleEntry: the rows are read into entries by packages/db's
// RuleRows, the one reading the worker runs the rules from too (ADR-359), with each picked value's
// name and whether it is gone (archived, or a zone name the project's current map doesn't have);
// this writes an entry back as rows. Both setup services that save rules use it, inside
// their own piece of work: the rule builder (RuleSetup) and a pay item's "Pays when"
// (PayItemSetup).
//
// A rule's lines are never deleted or edited in place: a change archives the lines it had and
// writes the new ones after them, so the audit log holds what the rule said before.
import { RuleRows, type Prisma, type RuleNamed } from '@open-adms/db';
import {
  type QuantityFrom,
  type RuleActionKind,
  type RuleActionLine,
  type RuleCriterionKey,
  type RuleCriterionLine,
  type RuleEntry,
  type RuleForm,
  type RuleOperator,
} from '@open-adms/domain';

import { type Clock, day } from './setup-service.ts';

// One line of a rule's "ifs", as a setup screen hands it over: a picked value by its record's id
// (a zone by its name), a typed one in the field of its kind.
export interface CriterionInput {
  readonly criterion: RuleCriterionKey;
  readonly operator: RuleOperator;
  readonly picks?: readonly string[];
  readonly numberFrom?: number;
  readonly numberTo?: number;
  // Calendar days: 2026-10-15.
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly text?: string;
}

export interface ActionInput {
  readonly kind: RuleActionKind;
  readonly slot?: number;
  readonly payItemId?: string;
  // On an Add transaction: every item (as it starts), or the chosen ones.
  readonly quantityFrom?: QuantityFrom;
  readonly itemNameIds?: readonly string[];
}

// The column of a picked value's row that its criterion fills.
const pickColumns = {
  CONTRACTOR: 'contractorId',
  DEBRIS_TYPE: 'formDebrisTypeId',
  FIELD_TAG: 'fieldTagId',
  DISPOSAL_SITE: 'disposalSiteId',
  FROM_SITE: 'disposalSiteId',
  DISPOSAL_SITE_TYPE: 'siteTypeId',
  PAY_ITEM: 'payItemId',
  ITEM: 'itemNameId',
  ZONE: 'zoneName',
} as const satisfies Partial<Record<RuleCriterionKey, string>>;

export class RuleBook {
  private readonly tx: Prisma.TransactionClient;
  private readonly projectId: string;
  private readonly clock: Clock;
  private readonly rows: RuleRows;
  private names: Promise<ReadonlyMap<string, RuleNamed>> | undefined;

  constructor(tx: Prisma.TransactionClient, projectId: string, clock: Clock) {
    this.tx = tx;
    this.projectId = projectId;
    this.clock = clock;
    this.rows = new RuleRows(tx, projectId);
  }

  // The form a rule is on: one of the project's own. Only a load, haul-out or unit rate form takes
  // rules; the database refuses a rule on any other.
  async formOf(formId: string): Promise<RuleForm> {
    const form = await this.tx.form.findFirstOrThrow({
      where: { id: formId, projectId: this.projectId },
    });
    return form.documentType as RuleForm;
  }

  // Every rule of the project, archived and inactive ones included, in the order written.
  async entries(): Promise<RuleEntry[]> {
    return this.rows.entries(await this.named());
  }

  // The lines a screen hands over, as the domain reads them: each picked value with its name.
  async linesOf(criteria: readonly CriterionInput[]): Promise<RuleCriterionLine[]> {
    const named = await this.named();
    return criteria.map((line) => ({
      criterion: line.criterion,
      operator: line.operator,
      picks: (line.picks ?? []).map((value) => RuleRows.pick(value, named)),
      numberFrom: line.numberFrom ?? null,
      numberTo: line.numberTo ?? null,
      dateFrom: line.dateFrom ?? null,
      dateTo: line.dateTo ?? null,
      text: line.text ?? null,
    }));
  }

  async actionsOf(actions: readonly ActionInput[]): Promise<RuleActionLine[]> {
    const named = await this.named();
    return actions.map((action) => ({
      kind: action.kind,
      slot: action.slot ?? null,
      payItem:
        action.payItemId === undefined
          ? null
          : { id: action.payItemId, code: named.get(action.payItemId)?.name ?? action.payItemId },
      quantityFrom: action.kind === 'ADD_TRANSACTION' ? (action.quantityFrom ?? 'ALL_ITEMS') : null,
      items: RuleBook.items(action.itemNameIds ?? [], named),
    }));
  }

  async itemsOf(itemNameIds: readonly string[]): Promise<{ id: string; name: string }[]> {
    return RuleBook.items(itemNameIds, await this.named());
  }

  async contractOf(contractId: string | null): Promise<RuleEntry['contract']> {
    if (contractId === null) return null;
    const contract = await this.tx.contract.findFirst({
      where: { id: contractId, projectId: this.projectId },
    });
    return { id: contractId, name: contract?.name ?? contractId };
  }

  // Writes a new rule with its lines; its id.
  async add(entry: RuleEntry): Promise<string> {
    const rule = await this.tx.rule.create({
      data: {
        projectId: this.projectId,
        formId: entry.formId,
        documentType: entry.form,
        name: entry.name,
        contractId: entry.contract?.id ?? null,
        active: entry.active,
        fromPayItemId: entry.fromPayItem?.id ?? null,
      },
    });
    await this.writeLines(rule.id, entry, 0);
    return rule.id;
  }

  // Changes a rule the project holds: its name, contract and Active tick; and, where its criteria
  // or actions changed, the lines it had are archived and the new ones written after them.
  async change(ruleId: string, entry: RuleEntry, linesChanged: boolean): Promise<void> {
    const held = await this.tx.rule.findUniqueOrThrow({ where: { id: ruleId } });
    const contractId = entry.contract?.id ?? null;
    if (
      held.name !== entry.name ||
      held.contractId !== contractId ||
      held.active !== entry.active
    ) {
      await this.tx.rule.update({
        where: { id: ruleId },
        data: { name: entry.name, contractId, active: entry.active },
      });
    }
    if (!linesChanged) return;
    const now = this.clock.now();
    const live = { archivedAt: null };
    const archived = { archivedAt: now };
    await this.tx.ruleCriterionPick.updateMany({
      where: { line: { ruleId }, ...live },
      data: archived,
    });
    await this.tx.ruleCriterion.updateMany({ where: { ruleId, ...live }, data: archived });
    await this.tx.ruleActionItem.updateMany({
      where: { action: { ruleId }, ...live },
      data: archived,
    });
    await this.tx.ruleAction.updateMany({ where: { ruleId, ...live }, data: archived });
    // A line's place is its own on its rule, archived lines included.
    const last = await this.tx.ruleCriterion.aggregate({
      where: { ruleId },
      _max: { position: true },
    });
    await this.writeLines(ruleId, entry, last._max.position ?? 0);
  }

  // Takes a rule off the project; its lines stay as they were. Never deleted.
  async archive(ruleId: string): Promise<void> {
    await this.tx.rule.update({ where: { id: ruleId }, data: { archivedAt: this.clock.now() } });
  }

  private async writeLines(ruleId: string, entry: RuleEntry, after: number): Promise<void> {
    const own = { projectId: this.projectId, formId: entry.formId };
    for (const [index, line] of entry.criteria.entries()) {
      const criterion = await this.tx.ruleCriterion.create({
        data: {
          ruleId,
          ...own,
          position: after + index + 1,
          criterion: line.criterion,
          operator: line.operator,
          numberFrom: line.numberFrom,
          numberTo: line.numberTo,
          dateFrom: line.dateFrom === null ? null : day(line.dateFrom),
          dateTo: line.dateTo === null ? null : day(line.dateTo),
          text: line.text,
        },
      });
      for (const pick of line.picks) {
        // A criterion that picks nothing has no column: the database refuses its pick.
        const column = (pickColumns as Partial<Record<RuleCriterionKey, string>>)[line.criterion];
        await this.tx.ruleCriterionPick.create({
          data: {
            criterionId: criterion.id,
            ...own,
            criterion: line.criterion,
            ...(column === undefined ? {} : { [column]: pick.value }),
          },
        });
      }
    }
    for (const action of entry.actions) {
      const written = await this.tx.ruleAction.create({
        data: {
          ruleId,
          projectId: this.projectId,
          kind: action.kind,
          slot: action.slot,
          payItemId: action.payItem?.id ?? null,
          quantityFrom: action.quantityFrom,
        },
      });
      if (action.quantityFrom !== 'CHOSEN_ITEMS') continue;
      for (const item of action.items) {
        await this.tx.ruleActionItem.create({
          data: { actionId: written.id, itemNameId: item.id },
        });
      }
    }
  }

  // Everything on the project a criterion may pick, by its id (a zone by its name): what it is
  // called, and whether it is gone. Read once for a piece of work, before it writes.
  private named(): Promise<ReadonlyMap<string, RuleNamed>> {
    this.names ??= this.rows.names();
    return this.names;
  }

  private static items(
    itemNameIds: readonly string[],
    named: ReadonlyMap<string, RuleNamed>,
  ): { id: string; name: string }[] {
    return itemNameIds.map((id) => ({ id, name: named.get(id)?.name ?? id }));
  }
}
