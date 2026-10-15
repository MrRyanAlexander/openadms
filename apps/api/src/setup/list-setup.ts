// The firm's own values on its lists (spec/LISTS.md; ADR-070, 194, 302, 527 (6)): a value the
// firm adds has a name and no key, and goes at the end of its list. The two lists the setup
// story's firm adds to have an add of their own, a project's field tags are added by
// `ProjectSetup`, and **every other list's value is added here with what its list asks beside its
// name** (the domain's `ListValues.addRefusal`; ADR-527 (6)). **Every list's values are renamed,
// archived and put back here**, a project's field tags among them: a built-in value is renamed if
// the firm uses another word, and never archived (the domain's `ListValues`, and the database).
import type { FirmList } from '@open-adms/contracts';
import type { DebrisType, PayableType, Prisma } from '@open-adms/db';
import { ListValues, listValueSettings, type ListValueSetting } from '@open-adms/domain';

import { archiveChange, type Outcome, QueueingService, Refused } from './setup-service.ts';

type Tx = Prisma.TransactionClient;

// A list value as renaming and archiving read it: every list's table has these.
interface ListRow {
  readonly id: string;
  readonly key: string | null;
  readonly name: string;
  readonly position: number;
  readonly archivedAt: Date | null;
}

// A value the firm adds: its name and what its list asks beside it.
export type NewListValue = { readonly name: string } & Partial<
  Readonly<Record<ListValueSetting, unknown>>
>;

interface ListTable {
  findUniqueOrThrow(args: { where: { id: string } }): Promise<ListRow>;
  aggregate(args: { _max: { position: true } }): Promise<{ _max: { position: number | null } }>;
  create(args: { data: Record<string, unknown> }): Promise<ListRow>;
  update(args: {
    where: { id: string };
    data: { name?: string; archivedAt?: Date | null };
  }): Promise<ListRow>;
}

// Each list's table, by the name a path gives it.
const tables: Record<FirmList, (tx: Tx) => unknown> = {
  'program-types': (tx) => tx.programType,
  'declaration-reference-types': (tx) => tx.declarationReferenceType,
  'debris-types': (tx) => tx.debrisType,
  'reduction-methods': (tx) => tx.reductionMethod,
  'payable-types': (tx) => tx.payableType,
  'kinds-of-work': (tx) => tx.kindOfWork,
  'item-names': (tx) => tx.itemName,
  'vehicle-types': (tx) => tx.vehicleType,
  'vehicle-features': (tx) => tx.vehicleFeature,
  'crew-types': (tx) => tx.crewType,
  'site-types': (tx) => tx.siteType,
  'site-labels': (tx) => tx.siteLabel,
  'incident-types': (tx) => tx.incidentType,
  'incident-sub-types': (tx) => tx.incidentSubType,
  reasons: (tx) => tx.reason,
  'survey-work-types': (tx) => tx.surveyWorkType,
  'clock-activities': (tx) => tx.clockActivity,
  'field-tags': (tx) => tx.fieldTag,
};

// The column a rule's pick names a value of the list by, where a rule may pick one (spec/RULES.md
// §3): a rule picking an archived value is not valid and never runs (ADR-357).
const pickedAs: Partial<Record<FirmList, keyof Prisma.RuleCriterionPickWhereInput>> = {
  'site-types': 'siteTypeId',
  'item-names': 'itemNameId',
  'field-tags': 'fieldTagId',
};

export class ListSetup extends QueueingService {
  // A debris type in the firm's library, named as its contracts name the work: Mulch.
  debrisType(person: string, name: string): Promise<Outcome<DebrisType>> {
    return this.setup(person, async (tx) => {
      const last = await tx.debrisType.aggregate({ _max: { position: true } });
      return tx.debrisType.create({ data: { name, position: (last._max.position ?? 0) + 1 } });
    });
  }

  // A payable type, the work a pay item prices: Stump fill.
  payableType(person: string, name: string): Promise<Outcome<PayableType>> {
    return this.setup(person, async (tx) => {
      const last = await tx.payableType.aggregate({ _max: { position: true } });
      return tx.payableType.create({ data: { name, position: (last._max.position ?? 0) + 1 } });
    });
  }

  // A value of the firm's own, at the end of its list, with what its list asks beside its name;
  // a setting another list asks, or one missing, isn't saved. Adding queues nothing: no rule picks
  // a value before it is there.
  add(person: string, list: FirmList, value: NewListValue): Promise<Outcome<ListRow>> {
    return this.setup(person, async (tx) => {
      const { name, ...settings } = value;
      const stated = listValueSettings.filter((setting) => settings[setting] !== undefined);
      const refusal = new ListValues().addRefusal(list, stated);
      if (refusal !== null) throw new Refused(refusal);
      const table = ListSetup.table(tx, list);
      const last = await table.aggregate({ _max: { position: true } });
      return table.create({
        data: { ...settings, name, position: (last._max.position ?? 0) + 1 },
      });
    });
  }

  // Renamed, audited with the name before. Behaviour follows a built-in key or an id, never a
  // name (spec/LISTS.md), so nothing is queued.
  rename(person: string, list: FirmList, valueId: string, name: string): Promise<Outcome<ListRow>> {
    return this.setup(person, (tx) =>
      ListSetup.table(tx, list).update({ where: { id: valueId }, data: { name } }),
    );
  }

  // Off new picks and kept on old records; put back as it was. A built-in value is never
  // archived. Each project whose rules pick it is queued.
  archive(
    person: string,
    list: FirmList,
    valueId: string,
    archive: boolean,
  ): Promise<Outcome<ListRow>> {
    return this.setup(person, async (tx) => {
      const table = ListSetup.table(tx, list);
      const value = await table.findUniqueOrThrow({ where: { id: valueId } });
      if (archive) {
        const refusal = new ListValues().archiveRefusal(value);
        if (refusal !== null) throw new Refused(refusal);
      }
      const change = archiveChange(value.archivedAt, archive, this.clock.now());
      if (change === null) return value;
      const changed = await table.update({ where: { id: valueId }, data: change });
      const column = pickedAs[list];
      if (column !== undefined) {
        for (const projectId of await this.projectsPicking(tx, { [column]: valueId })) {
          await this.setupChanged(tx, person, projectId);
        }
      }
      return changed;
    });
  }

  // Every list's table has an id, a key, a name, a position and an archive: read through those.
  private static table(tx: Tx, list: FirmList): ListTable {
    return tables[list](tx) as ListTable;
  }
}
