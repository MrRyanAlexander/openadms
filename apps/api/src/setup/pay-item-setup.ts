// Setup step 6 (spec/parts/01-setup.md; spec/RULES.md §1; ADR-206, 213, 217, 221, 229, 301, 309;
// BACKLOG C58): a pay item read off the contract, with its code, description, payable type, Unit
// of Measure, size band, capture settings and a rate for each prime; and its "Pays when", which
// writes and keeps the pay item's rules. Before a pay item is saved, setup asks packages/domain's
// SizeBands: a band that overlaps another of its payable type isn't saved; a gap is saved with a
// warning. No capture setting has a default: whoever enters a pay item states each (ADR-309).
//
// A pay item added, a rate set and a "Pays when" saved each move what tickets bill: the
// project's un-invoiced tickets are queued in the same piece of work (ADR-090, 420). Which
// tickets a pay item or a rate reaches is the firm's rules' to say, so every ticket of the
// project that isn't void or locked as invoiced is named: the run writes only what differs.
import type { BillingUnit, CrewTimeConversion, PayItem, PayItemRate } from '@open-adms/db';
import {
  PaysWhen,
  type PaysWhenOnForm,
  ProjectRules,
  type QuantityFrom,
  type RuleEntry,
  SizeBands,
} from '@open-adms/domain';

import { type CriterionInput, RuleBook } from './rule-book.ts';
import { sameLines } from './rule-setup.ts';
import { type Outcome, QueueingService, Refused } from './setup-service.ts';

export interface NewPayItem {
  readonly projectId: string;
  // The firm's own string, unique on the project; and what the work is, in the firm's words.
  readonly code: string;
  readonly description: string;
  readonly payableTypeId: string;
  readonly unit: BillingUnit;
  // Set on a unit rate pay item, one a monitor picks; empty on every other.
  readonly kindOfWorkId: string | null;
  // The size band, in inches to a tenth, both ends included; either end may be open.
  readonly bandFrom: number | null;
  readonly bandTo: number | null;
  readonly countIsAlwaysOne: boolean;
  readonly gpsRequired: boolean;
  readonly measurementRequired: boolean;
  readonly decimalsAllowed: boolean;
  readonly photosRequired: boolean;
  readonly monitorMayMarkIneligible: boolean;
  readonly quantityFromCarriedTickets: boolean;
  // How crew time's hours become a quantity: on an HR or CREW_DAY pay item, and only there.
  readonly crewTimeConversion: CrewTimeConversion | null;
  readonly crewDayHours: number | null;
  // Its rate for each prime that works under it: exact decimals, "7.50".
  readonly rates: readonly { readonly primeId: string; readonly rate: string }[];
}

// What may be changed on a pay item the project holds: its Unit of Measure, how crew time's
// hours become a quantity on it, and its capture settings. Its code, payable type, kind of work
// and band say which pay item it is and stay as entered (ADR-423).
export type PayItemChanges = Partial<
  Pick<
    NewPayItem,
    | 'unit'
    | 'crewTimeConversion'
    | 'crewDayHours'
    | 'countIsAlwaysOne'
    | 'gpsRequired'
    | 'measurementRequired'
    | 'decimalsAllowed'
    | 'photosRequired'
    | 'monitorMayMarkIneligible'
    | 'quantityFromCarriedTickets'
  >
>;

// What "Pays when" says for one form: the criteria, and the # its transaction takes.
export interface PaysWhenInput {
  readonly formId: string;
  readonly slot: number;
  readonly criteria: readonly CriterionInput[];
  readonly quantityFrom?: QuantityFrom;
  readonly itemNameIds?: readonly string[];
}

// What saving "Pays when" did to the rules the pay item keeps, each by its id.
export interface RulesKept {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly archived: readonly string[];
  readonly unchanged: readonly string[];
}

export class PayItemSetup extends QueueingService {
  payItem(person: string, input: NewPayItem): Promise<Outcome<PayItem>> {
    return this.write(person, async (tx, warn) => {
      const { rates, ...settings } = input;
      const payableType = await tx.payableType.findUniqueOrThrow({
        where: { id: input.payableTypeId },
      });
      const others = await tx.payItem.findMany({
        where: { projectId: input.projectId, payableTypeId: input.payableTypeId },
      });
      const bands = new SizeBands(
        payableType.name,
        others.map((other) => ({
          id: other.id,
          code: other.code,
          bandFrom: other.bandFrom?.toNumber() ?? null,
          bandTo: other.bandTo?.toNumber() ?? null,
          archived: other.archivedAt !== null,
        })),
      );
      const check = bands.check({
        id: '',
        code: input.code,
        bandFrom: input.bandFrom,
        bandTo: input.bandTo,
        archived: false,
      });
      if (check.refusal !== null) throw new Refused(check.refusal);
      warn(check.warnings);
      const payItem = await tx.payItem.create({ data: settings });
      for (const { primeId, rate } of rates) {
        await tx.payItemRate.create({
          data: { projectId: input.projectId, payItemId: payItem.id, primeId, rate },
        });
      }
      // A unit rate ticket's pay item is worked out from its payable type and its band: a new
      // pay item may be the one.
      await this.setupChanged(tx, person, input.projectId);
      return payItem;
    });
  }

  // A change to a pay item the project holds, audited with the value before: a price agreed at
  // last takes it from TBN to its unit (AC-07-63); a capture setting ticked or unticked. What
  // the database's own checks refuse (a conversion on a pay item that isn't by the hour or the
  // crew day) throws, and nothing is saved. Tickets locked as invoiced keep the lines they have
  // (ADR-090).
  change(person: string, payItemId: string, changes: PayItemChanges): Promise<Outcome<PayItem>> {
    return this.write(person, async (tx) => {
      const payItem = await tx.payItem.update({ where: { id: payItemId }, data: changes });
      await this.setupChanged(tx, person, payItem.projectId);
      return payItem;
    });
  }

  // A prime's rate on the pay item: set for the first time (a price agreed at last), changed,
  // or put back after it was taken off; never a second row for the prime. Audited with the
  // value before. Tickets locked as invoiced keep the lines they have (ADR-090).
  rate(
    person: string,
    payItemId: string,
    primeId: string,
    rate: string,
  ): Promise<Outcome<PayItemRate>> {
    return this.write(person, async (tx) => {
      const payItem = await tx.payItem.findUniqueOrThrow({ where: { id: payItemId } });
      const saved = await tx.payItemRate.upsert({
        where: { payItemId_primeId: { payItemId, primeId } },
        create: { projectId: payItem.projectId, payItemId, primeId, rate },
        update: { rate, archivedAt: null },
      });
      await this.setupChanged(tx, person, payItem.projectId);
      return saved;
    });
  }

  // Saves the pay item's "Pays when": one rule for each form it pays on and each of the project's
  // contracts whose prime has a rate on it (packages/domain's PaysWhen), matched to the rules the
  // pay item already keeps. A rule it no longer needs is archived, one it lacks is written, one
  // whose criteria or name changed is changed, and the rest are left alone. Each goes through
  // ProjectRules' check like any other rule; a refusal saves nothing at all.
  paysWhen(
    person: string,
    payItemId: string,
    pays: readonly PaysWhenInput[],
  ): Promise<Outcome<RulesKept>> {
    return this.write(person, async (tx, warn) => {
      const payItem = await tx.payItem.findUniqueOrThrow({
        where: { id: payItemId },
        include: { rates: { where: { archivedAt: null } } },
      });
      const contracts = await tx.contract.findMany({
        where: { projectId: payItem.projectId },
        orderBy: { id: 'asc' },
      });
      const book = new RuleBook(tx, payItem.projectId, this.clock);
      const on: PaysWhenOnForm[] = [];
      for (const each of pays) {
        on.push({
          formId: each.formId,
          form: await book.formOf(each.formId),
          slot: each.slot,
          criteria: await book.linesOf(each.criteria),
          quantityFrom: each.quantityFrom ?? 'ALL_ITEMS',
          items: await book.itemsOf(each.itemNameIds ?? []),
        });
      }
      const wanted = new PaysWhen(
        {
          id: payItem.id,
          code: payItem.code,
          description: payItem.description,
          ratedPrimeIds: payItem.rates.map((rate) => rate.primeId),
        },
        contracts.map((contract) => ({
          id: contract.id,
          name: contract.name,
          primeId: contract.primeId,
          archived: contract.archivedAt !== null,
        })),
      ).rules(on);

      let rules = await book.entries();
      // The rules it keeps today, each with its id; one is matched to the wanted rule of its form
      // and contract, once.
      const kept = new Map<string, RuleEntry>();
      for (const rule of rules) {
        if (rule.id !== null && rule.fromPayItem?.id === payItem.id && !rule.archived) {
          kept.set(rule.id, rule);
        }
      }
      const matched = wanted.map((rule) => {
        const match = [...kept].find(
          ([, held]) => held.formId === rule.formId && held.contract?.id === rule.contract?.id,
        );
        if (match !== undefined) kept.delete(match[0]);
        return { rule, held: match?.[1] ?? null };
      });

      const done = {
        added: [] as string[],
        changed: [] as string[],
        archived: [] as string[],
        unchanged: [] as string[],
      };
      for (const id of kept.keys()) {
        await book.archive(id);
        done.archived.push(id);
        rules = rules.map((rule) => (rule.id === id ? { ...rule, archived: true } : rule));
      }
      for (const { rule, held } of matched) {
        const heldId = held?.id ?? null;
        const linesChanged = held === null || !sameLines(held, rule);
        if (held !== null && heldId !== null && !linesChanged && held.name === rule.name) {
          done.unchanged.push(heldId);
          continue;
        }
        const entry: RuleEntry = { ...rule, id: heldId };
        const check = new ProjectRules(rules).check(entry, 'PAY_ITEM');
        if (check.refusal !== null) throw new Refused(check.refusal);
        warn(check.warnings);
        if (heldId === null) {
          const id = await book.add(entry);
          done.added.push(id);
          rules = [...rules, { ...entry, id }];
        } else {
          await book.change(heldId, entry, linesChanged);
          done.changed.push(heldId);
          rules = rules.map((other) => (other.id === heldId ? entry : other));
        }
      }
      if (done.added.length + done.changed.length + done.archived.length > 0) {
        await this.setupChanged(tx, person, payItem.projectId);
      }
      return done;
    });
  }
}
