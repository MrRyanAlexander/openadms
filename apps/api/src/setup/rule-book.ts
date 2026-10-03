// A project's rules, between the database's rows and the domain's reading of them (spec/RULES.md;
// ADR-313; BACKLOG C58). packages/domain's ProjectRules checks a rule against every other rule of
// its project, and reads each as a RuleEntry: this reads the rows into entries, with each picked
// value's name and whether it is gone (archived, or a zone name the project's current map doesn't
// have), and writes an entry back as rows. Both setup services that save rules use it, inside
// their own piece of work: the rule builder (RuleSetup) and a pay item's "Pays when"
// (PayItemSetup).
//
// A rule's lines are never deleted or edited in place: a change archives the lines it had and
// writes the new ones after them, so the audit log holds what the rule said before.
import type { Prisma } from '@open-adms/db';
import {
  type QuantityFrom,
  type RuleActionKind,
  type RuleActionLine,
  type RuleCriterionKey,
  type RuleCriterionLine,
  type RuleEntry,
  type RuleForm,
  type RuleOperator,
  type RulePick,
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

// What a picked value is called, and whether it is still there to pick.
interface Named {
  readonly name: string;
  readonly gone: boolean;
}

const isArchived = (record: { archivedAt: Date | null }): boolean => record.archivedAt !== null;

export class RuleBook {
  private readonly tx: Prisma.TransactionClient;
  private readonly projectId: string;
  private readonly clock: Clock;
  private names: Promise<ReadonlyMap<string, Named>> | undefined;

  constructor(tx: Prisma.TransactionClient, projectId: string, clock: Clock) {
    this.tx = tx;
    this.projectId = projectId;
    this.clock = clock;
  }

  // The form a rule is on: one of the project's own. Only a load, haul-out or unit rate form takes
  // rules; the database refuses a rule on any other.
  async formOf(formId: string): Promise<RuleForm> {
    const form = await this.tx.form.findFirstOrThrow({
      where: { id: formId, projectId: this.projectId },
    });
    return form.documentType as RuleForm;
  }

  // Every rule of the project, archived and inactive ones included, in the order written. Read one
  // query at a time: a piece of work has one connection.
  async entries(): Promise<RuleEntry[]> {
    const { tx } = this;
    const own = { projectId: this.projectId };
    const live = { ...own, archivedAt: null };
    const named = await this.named();
    const rules = await tx.rule.findMany({ where: own, orderBy: { id: 'asc' } });
    const contracts = await tx.contract.findMany({ where: own });
    const payItems = await tx.payItem.findMany({ where: own });
    const lines = await tx.ruleCriterion.findMany({ where: live, orderBy: { position: 'asc' } });
    const picks = await tx.ruleCriterionPick.findMany({ where: live, orderBy: { id: 'asc' } });
    const actions = await tx.ruleAction.findMany({ where: live, orderBy: { id: 'asc' } });
    const items = await tx.ruleActionItem.findMany({
      where: { action: own, archivedAt: null },
      orderBy: { id: 'asc' },
    });
    const payItemOf = (id: string | null): { id: string; code: string } | null => {
      const payItem = payItems.find((each) => each.id === id);
      return payItem === undefined ? null : { id: payItem.id, code: payItem.code };
    };
    return rules.map((rule) => {
      const contract = contracts.find((each) => each.id === rule.contractId);
      return {
        id: rule.id,
        name: rule.name,
        formId: rule.formId,
        form: rule.documentType as RuleForm,
        contract: contract === undefined ? null : { id: contract.id, name: contract.name },
        active: rule.active,
        archived: isArchived(rule),
        fromPayItem: payItemOf(rule.fromPayItemId),
        criteria: lines
          .filter((line) => line.ruleId === rule.id)
          .map((line) => ({
            criterion: line.criterion,
            operator: line.operator,
            picks: picks
              .filter((pick) => pick.criterionId === line.id)
              .map((pick) =>
                RuleBook.pick(
                  pick.contractorId ??
                    pick.formDebrisTypeId ??
                    pick.fieldTagId ??
                    pick.disposalSiteId ??
                    pick.siteTypeId ??
                    pick.payItemId ??
                    pick.itemNameId ??
                    pick.zoneName ??
                    '',
                  named,
                ),
              ),
            numberFrom: line.numberFrom?.toNumber() ?? null,
            numberTo: line.numberTo?.toNumber() ?? null,
            dateFrom: line.dateFrom?.toISOString().slice(0, 10) ?? null,
            dateTo: line.dateTo?.toISOString().slice(0, 10) ?? null,
            text: line.text,
          })),
        actions: actions
          .filter((action) => action.ruleId === rule.id)
          .map((action) => ({
            kind: action.kind,
            slot: action.slot,
            payItem: payItemOf(action.payItemId),
            quantityFrom: action.quantityFrom,
            items: items
              .filter((item) => item.actionId === action.id)
              .map((item) => ({
                id: item.itemNameId,
                name: named.get(item.itemNameId)?.name ?? item.itemNameId,
              })),
          })),
      };
    });
  }

  // The lines a screen hands over, as the domain reads them: each picked value with its name.
  async linesOf(criteria: readonly CriterionInput[]): Promise<RuleCriterionLine[]> {
    const named = await this.named();
    return criteria.map((line) => ({
      criterion: line.criterion,
      operator: line.operator,
      picks: (line.picks ?? []).map((value) => RuleBook.pick(value, named)),
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

  // Everything on the project a criterion may pick, by its id (a zone by its name, as the project's
  // current map, its newest version, has it): what it is called, and whether it is gone. Read once
  // for a piece of work, before it writes.
  private named(): Promise<ReadonlyMap<string, Named>> {
    this.names ??= this.readNames();
    return this.names;
  }

  private async readNames(): Promise<ReadonlyMap<string, Named>> {
    const { tx } = this;
    const own = { projectId: this.projectId };
    const names = new Map<string, Named>();
    const keep = (id: string, name: string, ...records: { archivedAt: Date | null }[]): void => {
      names.set(id, { name, gone: records.some(isArchived) });
    };
    const places = await tx.projectContractor.findMany({
      where: own,
      include: { contractor: true },
    });
    for (const place of places) {
      keep(place.contractorId, place.contractor.name, place, place.contractor);
    }
    const debrisTypes = await tx.formDebrisType.findMany({
      where: { form: own },
      include: { debrisType: true },
    });
    for (const entry of debrisTypes) keep(entry.id, entry.debrisType.name, entry);
    for (const tag of await tx.fieldTag.findMany({ where: own })) keep(tag.id, tag.name, tag);
    for (const site of await tx.disposalSite.findMany({ where: own })) {
      keep(site.id, site.name, site);
    }
    for (const type of await tx.siteType.findMany()) keep(type.id, type.name, type);
    for (const payItem of await tx.payItem.findMany({ where: own })) {
      keep(payItem.id, payItem.code, payItem);
    }
    for (const item of await tx.itemName.findMany()) keep(item.id, item.name, item);
    const map = await tx.mapVersion.findFirst({ where: own, orderBy: { version: 'desc' } });
    if (map !== null) {
      for (const zone of await tx.zone.findMany({ where: { mapVersionId: map.id } })) {
        names.set(zone.name, { name: zone.name, gone: false });
      }
    }
    return names;
  }

  // A picked value with its name. One that isn't on the project is gone; the database refuses to
  // save a pick of it.
  private static pick(value: string, named: ReadonlyMap<string, Named>): RulePick {
    const found = named.get(value);
    return { value, name: found?.name ?? value, gone: found?.gone ?? true };
  }

  private static items(
    itemNameIds: readonly string[],
    named: ReadonlyMap<string, Named>,
  ): { id: string; name: string }[] {
    return itemNameIds.map((id) => ({ id, name: named.get(id)?.name ?? id }));
  }
}
