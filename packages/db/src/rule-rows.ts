// A project's rules, read from the database's rows into the domain's entries (spec/RULES.md;
// ADR-313, 357, 359). There is one reading of them: setup's rule builder checks a rule from it
// before it saves (apps/api's RuleBook), and the worker runs the rules from it (apps/worker), so
// a rule setup calls valid is the rule the worker runs, and one that names something archived
// runs for neither.
//
// Each picked value comes with its name and whether it is gone: archived, or a zone name the
// project's current map doesn't have. Read one query at a time: a piece of work has one
// connection.
import type { RuleActionLine, RuleEntry, RuleForm, RulePick } from '@open-adms/domain';

import type { Prisma } from './generated/prisma/client.ts';

// What a picked value is called, and whether it is still there to pick.
export interface RuleNamed {
  readonly name: string;
  readonly gone: boolean;
}

const isArchived = (record: { archivedAt: Date | null }): boolean => record.archivedAt !== null;

export class RuleRows {
  private readonly tx: Prisma.TransactionClient;
  private readonly projectId: string;

  constructor(tx: Prisma.TransactionClient, projectId: string) {
    this.tx = tx;
    this.projectId = projectId;
  }

  // Every rule of the project, archived and inactive ones included, in the order written, each
  // with the lines still on it.
  async entries(named?: ReadonlyMap<string, RuleNamed>): Promise<RuleEntry[]> {
    const { tx } = this;
    const own = { projectId: this.projectId };
    const live = { ...own, archivedAt: null };
    const names = named ?? (await this.names());
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
    const forms = await tx.form.findMany({ where: own });
    const payItemOf = (id: string | null): RuleActionLine['payItem'] => {
      const payItem = payItems.find((each) => each.id === id);
      return payItem === undefined
        ? null
        : { id: payItem.id, code: payItem.code, archived: isArchived(payItem) };
    };
    return rules.map((rule) => {
      const contract = contracts.find((each) => each.id === rule.contractId);
      const form = forms.find((each) => each.id === rule.formId);
      return {
        id: rule.id,
        name: rule.name,
        formId: rule.formId,
        form: rule.documentType as RuleForm,
        formArchived: form !== undefined && isArchived(form),
        contract:
          contract === undefined
            ? null
            : { id: contract.id, name: contract.name, archived: isArchived(contract) },
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
                RuleRows.pick(
                  pick.contractorId ??
                    pick.formDebrisTypeId ??
                    pick.fieldTagId ??
                    pick.disposalSiteId ??
                    pick.siteTypeId ??
                    pick.payItemId ??
                    pick.itemNameId ??
                    pick.zoneName ??
                    '',
                  names,
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
                name: names.get(item.itemNameId)?.name ?? item.itemNameId,
              })),
          })),
      };
    });
  }

  // Everything on the project a criterion may pick, by its id (a zone by its name, as the project's
  // current map, its newest version, has it): what it is called, and whether it is gone.
  async names(): Promise<ReadonlyMap<string, RuleNamed>> {
    const { tx } = this;
    const own = { projectId: this.projectId };
    const names = new Map<string, RuleNamed>();
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
  static pick(value: string, named: ReadonlyMap<string, RuleNamed>): RulePick {
    const found = named.get(value);
    return { value, name: found?.name ?? value, gone: found?.gone ?? true };
  }
}
