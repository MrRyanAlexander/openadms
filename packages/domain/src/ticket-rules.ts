// Which of a project's rules may run on a ticket, and which of those pass (spec/RULES.md §4, §4a
// and §6 steps 1 and 2; spec/acceptance/07-pricing-ledger-audit.md sections A and B;
// adms-validation §5.3; ADR-018, 100, 110, 125, 126, 128, 131, 161, 162, 164, 186, 211, 239, 244,
// 295, 313, 354).
//
// Three things, each a plain class:
//   - `TicketReadings`: what the criteria read of a ticket, each from its named field event and
//     from what the worker attached (the zone, the mileage, the quantity, a unit rate ticket's
//     pay item worked out again). A split is read once for each property, a split haul-out once
//     for each pile, on its share;
//   - `CriterionCheck`: whether one line of a rule holds on a reading;
//   - `TicketRules`: the active, valid rules of the ticket's form whose contract's prime is the
//     ticket's, with the form's rules that name no contract; and those whose every line holds.
//
// A criterion reads only the ticket: a reading holds no transaction, so whether one rule passes
// never depends on another (ADR-131). **A line that compares with something the ticket doesn't
// have never holds, however it is worded** (the user, 2026-10-05, ADR-354): on a collection with
// no GPS fix neither "Mileage AT MOST 15.0" nor "Zone NOT EQUALS Zone 1" passes; only IS EMPTY
// does. Nothing is priced on a guess: with no rule adding a line the ticket is flagged for it.
//
// What the passing rules' actions write is task 1.6.3's.
import type { Named } from './checks.ts';
import { workTimeOf } from './checks.ts';
import { Mileage } from './mileage.ts';
import type { CheckedSite } from './place.ts';
import { ProjectClock } from './project-clock.ts';
import { Exact, type Amount } from './quantities.ts';
import { RuleCriteria, type RuleCriterionLine, type RuleForm } from './rule-criteria.ts';
import { RuleValidity, type RuleEntry } from './rules.ts';
import { placeOf, type GroupedFieldEvent, type Ticket } from './tickets.ts';
import type { CheckedKindOfWork } from './unit-rate-checks.ts';

// What the criteria read of a field event, beside what grouping reads.
export interface RuleFieldEvent extends GroupedFieldEvent {
  // The cert number as scanned or keyed in: the certification says whose work it is (ADR-186).
  readonly certNumber: string;
  // A load's or a haul-out's debris type: the entry picked on the project's form.
  readonly debrisType: Named | null;
  // The field tag the collecting or unit rate monitor picked, if any (ADR-216).
  readonly fieldTag: Named | null;
  // A collection's or a unit rate event's address.
  readonly address: string | null;
  // Its site, from the assignment: a disposal's, a haul-out collection's.
  readonly site: CheckedSite | null;
  // A unit rate event's kind of work, its count or pounds, and an itemised event's lines.
  readonly kindOfWork: CheckedKindOfWork | null;
  readonly unitCount: Amount | null;
  readonly items: readonly { readonly itemName: Named; readonly quantity: Amount }[];
}

// What a run knows of the project that a reading needs.
export interface ReadingSetup {
  readonly timeZone: string;
  // The project's certifications, each with the prime its truck or crew works for: a sub's is
  // the prime it works under (ADR-081, 108).
  // Its subs, where the truck or crew is a sub's: the first tier under the prime and, under that
  // one, the second (ADR-108).
  readonly certifications: readonly {
    readonly certNumber: string;
    readonly primeId: string;
    readonly firstTierSubId?: string | null;
    readonly secondTierSubId?: string | null;
  }[];
  // Every zone of every version of the project's map: a ticket's zone is read by the name it
  // had on the version the ticket was placed with (ADR-141).
  readonly zones: readonly Named[];
}

// What the worker attached to a ticket before the rules run (ADR-110).
export interface ReadingAttached {
  // The zone of each collection and unit rate event.
  readonly zones: readonly { readonly fieldEventId: string; readonly zoneId: string | null }[];
  // A unit rate ticket's pay item, worked out again by the worker (ADR-217).
  readonly workedOut: {
    readonly payItemId: string | null;
    readonly diameterInches: number | null;
  } | null;
  // A load's or a haul-out's collections, each with its share and its mileage: the whole of it
  // on a ticket that isn't split.
  readonly shares: readonly {
    readonly collectionEventId: string;
    readonly volumeCy: string | null;
    readonly weightTons: string | null;
    readonly mileage: { readonly miles: string } | null;
  }[];
}

// What the criteria read of one piece of a ticket: a load or one property of a split, a haul-out
// or one pile of a split, a unit rate ticket. Empty where the ticket doesn't have it.
export interface RuleReading {
  // Empty when not split.
  readonly splitSuffix: string;
  // A calendar day in the project's time zone: 2026-10-12.
  readonly ticketDate: string | null;
  // The prime the truck or crew works for.
  readonly contractorId: string | null;
  readonly debrisTypeId: string | null;
  readonly fieldTagId: string | null;
  readonly weightTons: string | null;
  readonly volumeCy: string | null;
  readonly collectionAddress: string | null;
  readonly zoneName: string | null;
  readonly disposalSiteId: string | null;
  readonly fromSiteId: string | null;
  readonly disposalSiteTypeId: string | null;
  // As it is kept, unrounded: the criterion compares it in tenths.
  readonly mileage: string | null;
  readonly payItemId: string | null;
  readonly unitCount: Amount | null;
  // A diameter, in inches to a tenth.
  readonly measurementInches: number | null;
  readonly items: readonly { readonly itemNameId: string; readonly count: Amount }[];
}

export interface TicketRead {
  // The ticket's prime, from its certification; none where no certification of the project has
  // the cert number scanned.
  readonly primeId: string | null;
  // Who did the work, from the same certification: the sub of the lowest tier it names, the
  // second where there is one, else the first; none on the prime's own truck or crew (ADR-081,
  // 358). A transaction records it beside the prime.
  readonly operatingSubId: string | null;
  // One for each piece the rules run on; none while the ticket waits for a field event.
  readonly readings: readonly RuleReading[];
}

const bySuffix = <E extends GroupedFieldEvent>(events: readonly E[]): E[] =>
  [...events].sort((left, right) => placeOf(left.splitSuffix) - placeOf(right.splitSuffix));

export class TicketReadings<E extends RuleFieldEvent = RuleFieldEvent> {
  private readonly clock: ProjectClock;
  private readonly primes: ReadonlyMap<string, string>;
  private readonly operatingSubs: ReadonlyMap<string, string | null>;
  private readonly zoneNames: ReadonlyMap<string, string>;

  constructor(setup: ReadingSetup) {
    this.clock = new ProjectClock(setup.timeZone);
    this.primes = new Map(setup.certifications.map((each) => [each.certNumber, each.primeId]));
    this.operatingSubs = new Map(
      setup.certifications.map((each) => [
        each.certNumber,
        each.secondTierSubId ?? each.firstTierSubId ?? null,
      ]),
    );
    this.zoneNames = new Map(setup.zones.map((zone) => [zone.id, zone.name]));
  }

  of(ticket: Ticket<E>, attached: ReadingAttached): TicketRead {
    if (!ticket.isWhole) return { primeId: null, operatingSubId: null, readings: [] };
    const event = ticket.unitRate;
    if (event !== null) {
      const primeId = this.primes.get(event.certNumber) ?? null;
      const operatingSubId = this.operatingSubs.get(event.certNumber) ?? null;
      return { primeId, operatingSubId, readings: [this.unitRate(event, primeId, attached)] };
    }
    const { disposal } = ticket;
    const collections = bySuffix(ticket.collections);
    // The certification on the field event that took the quantity: a load's disposal, a
    // haul-out's loading end, the last pile's on a split (spec/FLAGS.md §5 (1)).
    const quantityTaker = ticket.workflow === 'LOAD' ? disposal : collections.at(-1);
    const primeId = this.primes.get(quantityTaker?.certNumber ?? '') ?? null;
    return {
      primeId,
      operatingSubId: this.operatingSubs.get(quantityTaker?.certNumber ?? '') ?? null,
      readings: collections.map((collection) => {
        const share = attached.shares.find((each) => each.collectionEventId === collection.id);
        const haulOut = ticket.workflow === 'HAUL_OUT';
        return {
          splitSuffix: collection.splitSuffix,
          ticketDate: this.clock.day(collection.endedAt),
          contractorId: primeId,
          debrisTypeId: collection.debrisType?.id ?? null,
          fieldTagId: collection.fieldTag?.id ?? null,
          weightTons: share?.weightTons ?? null,
          volumeCy: share?.volumeCy ?? null,
          collectionAddress: collection.address,
          // A haul-out's collection is at a site and is given no zone (ADR-135).
          zoneName: haulOut ? null : this.zoneOf(collection, attached),
          disposalSiteId: disposal?.site?.id ?? null,
          fromSiteId: haulOut ? (collection.site?.id ?? null) : null,
          disposalSiteTypeId: disposal?.site?.siteTypeId ?? null,
          mileage: share?.mileage?.miles ?? null,
          payItemId: null,
          unitCount: null,
          measurementInches: null,
          items: [],
        };
      }),
    };
  }

  private zoneOf(event: E, attached: ReadingAttached): string | null {
    const zoneId = attached.zones.find((each) => each.fieldEventId === event.id)?.zoneId ?? null;
    return zoneId === null ? null : (this.zoneNames.get(zoneId) ?? null);
  }

  private unitRate(event: E, primeId: string | null, attached: ReadingAttached): RuleReading {
    return {
      splitSuffix: '',
      ticketDate: this.clock.day(workTimeOf(event)),
      contractorId: primeId,
      debrisTypeId: null,
      fieldTagId: event.fieldTag?.id ?? null,
      weightTons: null,
      volumeCy: null,
      collectionAddress: event.address,
      zoneName: this.zoneOf(event, attached),
      disposalSiteId: null,
      fromSiteId: null,
      disposalSiteTypeId: null,
      mileage: null,
      payItemId: attached.workedOut?.payItemId ?? null,
      unitCount: TicketReadings.unitCountOf(event),
      measurementInches: attached.workedOut?.diameterInches ?? null,
      items: event.items.map((item) => ({ itemNameId: item.itemName.id, count: item.quantity })),
    };
  }

  // The count, the hours or the pounds: crew time's highest item's hours, once; any other
  // itemised ticket's items added up (ADR-126; one that isn't white goods: agent default,
  // ADR-354).
  private static unitCountOf(event: RuleFieldEvent): Amount | null {
    const shape = event.kindOfWork?.countShape ?? 'NUMBER';
    if (shape === 'NUMBER') return event.unitCount;
    const quantities = event.items.map((item) => Exact.of(item.quantity));
    const [first, ...rest] = quantities;
    if (first === undefined) return null;
    const read =
      shape === 'ITEM_HOURS'
        ? rest.reduce((highest, each) => (each.isAbove(highest) ? each : highest), first)
        : rest.reduce((sum, each) => sum.plus(each), first);
    return read.text(2);
  }
}

// One line of a rule against one reading.
export class CriterionCheck {
  private readonly line: RuleCriterionLine;

  constructor(line: RuleCriterionLine) {
    this.line = line;
  }

  holds(reading: RuleReading): boolean {
    const { line } = this;
    // A line that can't be read as a criterion makes its rule not valid, and holds on nothing.
    if (RuleCriteria.problemWith(line) !== null) return false;
    switch (RuleCriteria.kindOf(line.criterion)) {
      case 'PICK':
        return this.picked(CriterionCheck.pickOf(line, reading));
      case 'NUMBER':
        return this.number(CriterionCheck.numberOf(line, reading));
      case 'ITEM_COUNT': {
        const item = line.picks[0]?.value;
        return this.number(reading.items.find((each) => each.itemNameId === item)?.count ?? null);
      }
      case 'DATE':
        return this.number(RuleCriteria.dayOf(reading.ticketDate), [
          RuleCriteria.dayOf(line.dateFrom),
          RuleCriteria.dayOf(line.dateTo),
        ]);
      case 'TEXT':
        return this.text(reading.collectionAddress);
    }
  }

  // The id a picked criterion reads; a zone its name, since map versions change (ADR-141).
  private static pickOf(line: RuleCriterionLine, reading: RuleReading): string | null {
    switch (line.criterion) {
      case 'CONTRACTOR':
        return reading.contractorId;
      case 'DEBRIS_TYPE':
        return reading.debrisTypeId;
      case 'FIELD_TAG':
        return reading.fieldTagId;
      case 'ZONE':
        return reading.zoneName;
      case 'DISPOSAL_SITE':
        return reading.disposalSiteId;
      case 'FROM_SITE':
        return reading.fromSiteId;
      case 'DISPOSAL_SITE_TYPE':
        return reading.disposalSiteTypeId;
      case 'PAY_ITEM':
        return reading.payItemId;
      default:
        return null;
    }
  }

  private static numberOf(line: RuleCriterionLine, reading: RuleReading): Amount | null {
    switch (line.criterion) {
      case 'WEIGHT':
        return reading.weightTons;
      case 'VOLUME':
        return reading.volumeCy;
      case 'MILEAGE':
        return reading.mileage === null ? null : Mileage.inTenths(reading.mileage);
      case 'UNIT_COUNT':
        return reading.unitCount;
      case 'MEASUREMENT':
        return reading.measurementInches;
      default:
        return null;
    }
  }

  private picked(read: string | null): boolean {
    const { operator, picks } = this.line;
    if (operator === 'IS_EMPTY') return read === null;
    if (read === null) return false;
    if (operator === 'IS_NOT_EMPTY') return true;
    const among = picks.some((pick) => pick.value === read);
    return operator === 'EQUALS' || operator === 'IS_ONE_OF' ? among : !among;
  }

  // A number, or a day as a count of days: compared exactly, with no rounding of its own. The
  // ends are the line's typed numbers unless given.
  private number(
    read: Amount | null,
    ends: readonly [number | null, number | null] = [this.line.numberFrom, this.line.numberTo],
  ): boolean {
    const { operator } = this.line;
    if (operator === 'IS_EMPTY') return read === null;
    if (read === null) return false;
    if (operator === 'IS_NOT_EMPTY') return true;
    const [from, to] = ends;
    if (from === null) return false;
    const value = Exact.of(read);
    const low = Exact.of(from);
    switch (operator) {
      case 'EQUALS':
      case 'ON':
        return value.is(low);
      case 'NOT_EQUALS':
      case 'NOT_ON':
        return !value.is(low);
      case 'AT_LEAST':
      case 'ON_OR_AFTER':
        return !low.isAbove(value);
      case 'AT_MOST':
      case 'ON_OR_BEFORE':
        return !value.isAbove(low);
      case 'MORE_THAN':
        return value.isAbove(low);
      case 'LESS_THAN':
        return low.isAbove(value);
      case 'BETWEEN':
        // Both ends included (ADR-125).
        return to !== null && !low.isAbove(value) && !value.isAbove(Exact.of(to));
      default:
        return false;
    }
  }

  // Text is compared without regard to capitals or to spaces at either end (agent default,
  // ADR-354): "heron" finds "14 Heron St".
  private text(read: string | null): boolean {
    const { operator } = this.line;
    const said = (read ?? '').trim().toLowerCase();
    if (operator === 'IS_EMPTY') return said === '';
    if (said === '') return false;
    if (operator === 'IS_NOT_EMPTY') return true;
    const typed = (this.line.text ?? '').trim().toLowerCase();
    switch (operator) {
      case 'EQUALS':
        return said === typed;
      case 'NOT_EQUALS':
        return said !== typed;
      case 'CONTAINS':
        return said.includes(typed);
      case 'STARTS_WITH':
        return said.startsWith(typed);
      default:
        return false;
    }
  }
}

// A contract of the project, with the prime that holds it.
export interface RuleContract {
  readonly id: string;
  readonly primeId: string;
}

export class TicketRules {
  private readonly rules: readonly RuleEntry[];
  private readonly primes: ReadonlyMap<string, string>;

  // The project's rules as setup holds them, and its contracts.
  constructor(rules: readonly RuleEntry[], contracts: readonly RuleContract[]) {
    this.rules = rules;
    this.primes = new Map(contracts.map((contract) => [contract.id, contract.primeId]));
  }

  // Step 1: every active, valid rule of the ticket's form whose contract's prime is the
  // ticket's, with the form's rules that name no contract (ADR-239). A ticket whose prime isn't
  // known is run on by the rules with no contract only.
  mayRunOn(form: RuleForm, primeId: string | null): RuleEntry[] {
    return this.rules.filter((rule) => {
      if (rule.form !== form || !new RuleValidity(rule).runs) return false;
      if (rule.contract === null) return true;
      return primeId !== null && this.primes.get(rule.contract.id) === primeId;
    });
  }

  // Step 2: of those, the rules whose every criterion holds on the reading.
  passing(form: RuleForm, primeId: string | null, reading: RuleReading): RuleEntry[] {
    return this.mayRunOn(form, primeId).filter((rule) =>
      rule.criteria.every((line) => new CriterionCheck(line).holds(reading)),
    );
  }
}
