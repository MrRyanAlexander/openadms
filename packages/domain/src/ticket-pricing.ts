// What the passing rules' actions write on a ticket: its lines, each with its quantity, rate and
// amount, and the flags pricing raises (spec/RULES.md §5, §6 steps 3…9;
// spec/acceptance/07-pricing-ledger-audit.md sections C…F; adms-ledger-audit §6.1a, §6.1b;
// adms-validation §5.3, §5.5; spec/FLAGS.md §3.4, §3.5, §3.6, §3.8; ADR-060, 068, 085, 087, 118,
// 126, 128, 130, 131, 162, 167, 198, 203, 206, 212, 222, 223, 226, 239, 295, 355).
//
// A ticket is priced one piece at a time: a load or each property of a split, a haul-out or each
// pile, a unit rate ticket. On each piece every rule that passes is found first; then every Add
// transaction runs in # order, then every Remove transaction, then any Void ticket. The order
// the rules were written in never matters, and the same ticket and setup always give the same
// lines (ADR-130).
//
// Nothing is priced on a guess. A line whose quantity can't be worked out bills nothing and is
// flagged; a ticket under a flag that says "not billed" gets no lines until it is corrected
// (spec/FLAGS.md §1); a haul-out dumped at a TDSR skips the rules altogether (ADR-226). A rate
// comes from nowhere but the pay item, for the prime of the rule's contract (invariant 7).
//
// The user, 2026-10-05 (ADR-355): an amount is rounded to the cent a half up; a crew day by exact
// division is kept to four decimals; hours that fall in no step of a pay item paid in steps bill
// nothing on that line, and the ticket is flagged.
//
// Writing the lines as transactions is the worker's (tasks 1.7.1, 1.7.2).
import type { Named } from './checks.ts';
import { Flags, type FlagFacts, type FlagRaised, type FlagSubject } from './flags.ts';
import { Exact, quantityFor, type Amount, type QuantityAsked } from './quantities.ts';
import type { RuleForm } from './rule-criteria.ts';
import type { RuleActionLine, RuleEntry } from './rules.ts';
import { TicketRules, type RuleContract, type RuleReading } from './ticket-rules.ts';
import type { CountShapeName } from './unit-rate-checks.ts';

export type BillingUnit = QuantityAsked['unit'];

// How a crew time pay item turns hours into a quantity, as the database keeps it (ADR-087).
export const crewTimeConversions = ['PER_HOUR', 'PER_DAY_EXACT', 'PER_DAY_STEPS'] as const;
export type CrewTimeConversionName = (typeof crewTimeConversions)[number];

// The decimals a line keeps (spec/DATA-MODEL.md §5, `Transaction`).
const quantityDecimals = 4;
const rateDecimals = 4;
const amountDecimals = 2;

// What pricing reads of a pay item.
export interface PricedPayItem {
  readonly id: string;
  readonly code: string;
  readonly unit: BillingUnit;
  readonly countIsAlwaysOne: boolean;
  readonly quantityFromCarriedTickets: boolean;
  readonly crewTimeConversion: CrewTimeConversionName | null;
  // The day length of a crew day by exact division.
  readonly crewDayHours: Amount | null;
  // The steps of a crew day paid in steps, both ends included.
  readonly crewDaySteps: readonly {
    readonly fromHours: Amount;
    readonly toHours: Amount;
    readonly quantity: Amount;
  }[];
  // A rate for each prime that works under it; none at all on a $0 pay item (ADR-128, 206).
  readonly rates: readonly { readonly primeId: string; readonly rate: Amount }[];
}

// What a run knows of the project that pricing needs.
export interface PricingSetup {
  readonly timeZone: string;
  readonly rules: readonly RuleEntry[];
  readonly contracts: readonly RuleContract[];
  // The project's primes, for a message that names one.
  readonly primes: readonly Named[];
  // Every pay item a rule can name.
  readonly payItems: readonly PricedPayItem[];
  // The project's stump check "fill is paid only where the root ball is half exposed" (ADR-203).
  readonly stumpCheckFillNeedsExposure: boolean;
}

// Where a load or a haul-out was dumped, with the site's tipping fee pay items (ADR-222, 311).
export interface PricedDumpSite extends Named {
  readonly chargesTippingFee: boolean;
  readonly tippingFeePayItemIds: readonly string[];
}

// One piece of a ticket the rules run on, as the worker has it once the quantity is attached.
export interface PricedPiece {
  readonly reading: RuleReading;
  // The property's or the pile's collection; the unit rate event.
  readonly fieldEventId: string;
  // What the tickets a load carries come to (ADR-192, 204).
  readonly carriedCount?: number | null;
  readonly carriedStumpCy?: string | null;
  // What a unit rate ticket's monitor counts; none on a load or a haul-out.
  readonly countShape: CountShapeName | null;
  // A stump ticket's fill CY and its "half or more exposed" answer; none on any other ticket.
  readonly stump: {
    readonly fillCy: string | null;
    readonly rootBallHalfExposed: boolean | null;
  } | null;
}

export interface TicketToPrice {
  readonly ticketNumber: string;
  readonly form: RuleForm;
  // From the certification that took the quantity; the sub that did the work, where one did.
  readonly primeId: string | null;
  readonly operatingSubId: string | null;
  // None while the ticket waits for a field event.
  readonly pieces: readonly PricedPiece[];
  readonly dumpedAt: PricedDumpSite | null;
  // The flags the checks raise on the ticket now, accepted or not: accepting never changes what
  // bills.
  readonly raised: readonly FlagRaised[];
}

// One priced line: what the worker writes as a transaction.
export interface PricedLine {
  // Empty when not split.
  readonly splitSuffix: string;
  readonly fieldEventId: string;
  readonly slot: number;
  readonly ruleId: string;
  readonly payItemId: string;
  readonly contractId: string;
  readonly primeId: string;
  readonly operatingSubId: string | null;
  readonly unit: BillingUnit;
  readonly quantity: string;
  readonly rate: string;
  readonly amount: string;
}

// A flag pricing raises, with the line it is about where it is about one: the line itself may
// not exist (spec/DATA-MODEL.md §5, `Flag.slot`, `payItemId`).
export interface PricingFlagRaised extends FlagRaised {
  readonly slot: number | null;
  readonly payItemId: string | null;
}

export interface TicketPriced {
  // The rules whose Void ticket ran, by name: the void's reason (ADR-118). A voided ticket has
  // no lines.
  readonly voidedBy: readonly Named[];
  // In the order of the pieces, then of the #: as on an invoice.
  readonly lines: readonly PricedLine[];
  readonly flags: readonly PricingFlagRaised[];
}

interface Add {
  readonly rule: RuleEntry;
  readonly slot: number;
  readonly payItem: { readonly id: string; readonly code: string };
  readonly action: RuleActionLine;
}

// A line's quantity; or why there is none, in the flag's words; or a stump with no fill, which
// gets no fill line and no flag of its own (ADR-203).
type Quantity =
  | { readonly quantity: Exact }
  | { readonly pricedPer: string; readonly lacking: string }
  | 'NO_FILL';

const unitWords: Record<BillingUnit, string> = {
  CY: 'per cubic yard',
  TN: 'per ton',
  EA: 'per each',
  LB: 'per pound',
  HR: 'per hour',
  CREW_DAY: 'per crew day',
  TBN: 'to be negotiated',
};

const nothing: TicketPriced = { voidedBy: [], lines: [], flags: [] };

export class TicketPricing {
  private readonly setup: PricingSetup;
  private readonly rules: TicketRules;
  private readonly flags: Flags;
  private readonly payItems: ReadonlyMap<string, PricedPayItem>;
  private readonly primeNames: ReadonlyMap<string, string>;

  constructor(setup: PricingSetup) {
    this.setup = setup;
    this.rules = new TicketRules(setup.rules, setup.contracts);
    this.flags = new Flags(setup.timeZone);
    this.payItems = new Map(setup.payItems.map((payItem) => [payItem.id, payItem]));
    this.primeNames = new Map(setup.primes.map((prime) => [prime.id, prime.name]));
  }

  of(ticket: TicketToPrice): TicketPriced {
    // A haul-out dumped at a TDSR skips the rules until it is corrected (ADR-226).
    if (ticket.raised.some((flag) => flag.code === 'HAUL_OUT_DUMPED_AT_TDSR')) return nothing;
    const pieces = ticket.pieces.map((piece) => ({
      piece,
      passing: this.rules.passing(ticket.form, ticket.primeId, piece.reading),
    }));
    // A rule's void always wins, and the ticket is voided whole (ADR-167).
    const voidedBy = TicketPricing.voiding(pieces.flatMap((each) => each.passing));
    if (voidedBy.length > 0) return { voidedBy, lines: [], flags: [] };
    // Under a flag that says "not billed" nothing is billed until it is corrected; with no
    // prime known the certification's flag says so already.
    const { primeId } = ticket;
    if (primeId === null || ticket.raised.some((flag) => flag.billing === 'NOT_BILLED')) {
      return nothing;
    }
    const priced = pieces.map(({ piece, passing }) => this.piece(ticket, primeId, piece, passing));
    return {
      voidedBy: [],
      lines: priced.flatMap((each) => each.lines),
      flags: priced.flatMap((each) => each.flags),
    };
  }

  private static voiding(passing: readonly RuleEntry[]): Named[] {
    const found = new Map<string, Named>();
    for (const rule of passing) {
      if (!rule.actions.some((action) => action.kind === 'VOID_TICKET')) continue;
      const id = rule.id ?? '';
      found.set(id, { id, name: rule.name });
    }
    return [...found.values()].sort(
      (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
  }

  private piece(
    ticket: TicketToPrice,
    primeId: string,
    piece: PricedPiece,
    passing: readonly RuleEntry[],
  ): { lines: PricedLine[]; flags: PricingFlagRaised[] } {
    const subject: FlagSubject = { ticketNumber: ticket.ticketNumber };
    // A flag on one property or pile of a split names its collection.
    const about = piece.reading.splitSuffix === '' ? null : piece.fieldEventId;
    const raise = (
      flag: FlagRaised,
      slot: number | null = null,
      payItemId: string | null = null,
    ): PricingFlagRaised => ({ ...flag, slot, payItemId });

    const adds: Add[] = passing.flatMap((rule) =>
      rule.actions.flatMap((action) =>
        action.kind === 'ADD_TRANSACTION' && action.slot !== null && action.payItem !== null
          ? [{ rule, slot: action.slot, payItem: action.payItem, action }]
          : [],
      ),
    );
    const slots = new Map<number, Add[]>();
    for (const add of adds) slots.set(add.slot, [...(slots.get(add.slot) ?? []), add]);

    let lines: PricedLine[] = [];
    let flags: PricingFlagRaised[] = [];
    for (const slot of [...slots.keys()].sort((left, right) => left - right)) {
      const [add, ...others] = slots.get(slot) ?? [];
      if (add === undefined) continue;
      if (others.length > 0) {
        // Two creates of one #: neither bills; the ticket's other lines do (ADR-118).
        const all = [add, ...others];
        flags.push(
          raise(
            this.flags.raise(
              'DUPLICATE_TRANSACTION_NUMBER',
              subject,
              { slot, payItems: all.map((each) => each.payItem.code).sort() },
              {
                slot,
                rules: all.map((each) => each.rule.id ?? '').sort(),
                payItems: all.map((each) => each.payItem.id).sort(),
              },
              about,
            ),
            slot,
          ),
        );
        continue;
      }
      const made = this.line(ticket, primeId, piece, add, subject, about);
      if (made.line !== null) lines.push(made.line);
      flags.push(...made.flags.map((flag) => raise(flag, slot, add.payItem.id)));
    }

    // A fill line paid where the root ball isn't half exposed (ADR-203): it still bills.
    const fill = lines.find(
      (line) => ticket.form === 'UNIT_RATE' && piece.stump !== null && line.unit === 'CY',
    );
    if (
      fill !== undefined &&
      this.setup.stumpCheckFillNeedsExposure &&
      piece.stump?.rootBallHalfExposed === false
    ) {
      flags.push(
        raise(
          this.flags.raise(
            'FILL_WITHOUT_EXPOSED_ROOT_BALL',
            subject,
            {},
            { slot: fill.slot, payItemId: fill.payItemId, rootBallHalfExposed: false },
            about,
          ),
          fill.slot,
          fill.payItemId,
        ),
      );
    }

    // Every Remove transaction, after every Add: the line goes, and what was flagged on it.
    const removed = new Set(
      passing.flatMap((rule) =>
        rule.actions.flatMap((action) =>
          action.kind === 'REMOVE_TRANSACTION' && action.slot !== null ? [action.slot] : [],
        ),
      ),
    );
    lines = lines.filter((line) => !removed.has(line.slot));
    flags = flags.filter((flag) => flag.slot === null || !removed.has(flag.slot));

    // No rule of the ticket's prime creates a line (ADR-239).
    if (adds.length === 0) {
      const prime = this.primeNames.get(primeId);
      if (prime === undefined) throw new Error(`Prime ${primeId} is not one of the project's.`);
      flags.push(
        raise(this.flags.raise('NO_PRICING_RULE', subject, { prime }, { primeId }, about)),
      );
    }

    // Dumped at a site that charges a tipping fee, and no rule gives it one of the site's fee
    // pay items: a missing rule (ADR-222). A fee a rule added and another removed isn't one.
    const site = ticket.dumpedAt;
    if (
      ticket.form !== 'UNIT_RATE' &&
      site?.chargesTippingFee === true &&
      !adds.some((add) => site.tippingFeePayItemIds.includes(add.payItem.id))
    ) {
      flags.push(
        raise(
          this.flags.raise(
            'TIPPING_FEE_RULE_MISSING',
            subject,
            { site: site.name },
            { siteId: site.id, tippingFeePayItemIds: [...site.tippingFeePayItemIds].sort() },
            about,
          ),
        ),
      );
    }
    return { lines, flags };
  }

  // One Add transaction: its line, or the flag that says why it bills nothing.
  private line(
    ticket: TicketToPrice,
    primeId: string,
    piece: PricedPiece,
    add: Add,
    subject: FlagSubject,
    about: string | null,
  ): { line: PricedLine | null; flags: FlagRaised[] } {
    const payItem = this.payItems.get(add.payItem.id);
    const contract = add.rule.contract;
    if (payItem === undefined)
      throw new Error(`Pay item ${add.payItem.code} isn't on the project.`);
    if (contract === null || add.rule.id === null) {
      throw new Error(`Rule "${add.rule.name}" adds a transaction and can't run.`);
    }
    const kept: FlagFacts = { slot: add.slot, payItemId: payItem.id };
    // To be negotiated: nothing until the rate is agreed (ADR-068).
    if (payItem.unit === 'TBN') {
      return {
        line: null,
        flags: [this.flags.raise('RATE_TO_BE_NEGOTIATED', subject, {}, kept, about)],
      };
    }
    const worked = TicketPricing.quantity(ticket.form, piece, payItem, add.action);
    if (worked === 'NO_FILL') return { line: null, flags: [] };
    if (!('quantity' in worked)) {
      return {
        line: null,
        flags: [
          this.flags.raise(
            'QUANTITY_MISSING_FOR_PAY_ITEM',
            subject,
            { payItem: payItem.code, pricedPer: worked.pricedPer, lacking: worked.lacking },
            { ...kept, unit: payItem.unit },
            about,
          ),
        ],
      };
    }
    // The pay item's rate for the rule's contract's prime; a $0 line where it has none (ADR-212).
    const flags: FlagRaised[] = [];
    const held = payItem.rates.find((each) => each.primeId === primeId);
    if (held === undefined && payItem.rates.length > 0) {
      const prime = this.primeNames.get(primeId);
      if (prime === undefined) throw new Error(`Prime ${primeId} is not one of the project's.`);
      flags.push(
        this.flags.raise(
          'NO_RATE_FOR_PRIME',
          subject,
          { payItem: payItem.code, prime },
          { ...kept, primeId },
          about,
        ),
      );
    }
    // The amount is the quantity as the line keeps it, times the rate, to the cent a half up:
    // anyone can check a line by hand (the user, ADR-355).
    const quantity = Exact.of(worked.quantity.text(quantityDecimals));
    const rate = Exact.of(Exact.of(held?.rate ?? 0).text(rateDecimals));
    return {
      line: {
        splitSuffix: piece.reading.splitSuffix,
        fieldEventId: piece.fieldEventId,
        slot: add.slot,
        ruleId: add.rule.id,
        payItemId: payItem.id,
        contractId: contract.id,
        primeId,
        operatingSubId: ticket.operatingSubId,
        unit: payItem.unit,
        quantity: quantity.text(quantityDecimals),
        rate: rate.text(rateDecimals),
        amount: quantity.times(rate).text(amountDecimals),
      },
      flags,
    };
  }

  // The one figure a line bills: the pay item's Unit of Measure says which (adms-validation
  // §5.5).
  private static quantity(
    form: RuleForm,
    piece: PricedPiece,
    payItem: PricedPayItem,
    action: RuleActionLine,
  ): Quantity {
    const pricedPer = unitWords[payItem.unit];
    if (form !== 'UNIT_RATE') {
      const what = form === 'LOAD' ? 'the load' : 'the haul-out';
      const figure = quantityFor(payItem, {
        volumeCy: piece.reading.volumeCy,
        weightTons: piece.reading.weightTons,
        carriedCount: piece.carriedCount ?? null,
        carriedStumpCy: piece.carriedStumpCy ?? null,
      });
      const weighed = payItem.unit === 'TN' || payItem.unit === 'LB';
      // A net of nought is no weight to bill (ADR-223).
      if (figure !== null && (!weighed || Exact.of(figure).isAboveNought())) {
        return { quantity: Exact.of(figure) };
      }
      const carried = payItem.quantityFromCarriedTickets;
      const lacking: Record<BillingUnit, string> = {
        TN: 'has no scale weight',
        LB: 'has no scale weight',
        CY: carried ? 'carries no stump tickets' : 'has no volume',
        EA: carried ? 'carries no tickets' : 'has no count',
        HR: 'has no hours',
        CREW_DAY: 'has no hours',
        TBN: 'has no rate',
      };
      return { pricedPer, lacking: `${what} ${lacking[payItem.unit]}` };
    }
    switch (payItem.unit) {
      case 'CY': {
        // A stump ticket's fill CY, never the stump's own CY; no root ball, no fill line
        // (ADR-198, 203).
        if (piece.stump === null) return { pricedPer, lacking: 'the ticket has no cubic yards' };
        return piece.stump.fillCy === null ? 'NO_FILL' : { quantity: Exact.of(piece.stump.fillCy) };
      }
      case 'EA': {
        if (payItem.countIsAlwaysOne) return { quantity: Exact.of(1) };
        const count = TicketPricing.counted(piece, action);
        return count === null
          ? { pricedPer, lacking: 'the ticket has no count' }
          : { quantity: count };
      }
      case 'LB': {
        // HHW's pounds, entered as the count (ADR-054).
        const pounds = TicketPricing.counted(piece, action);
        return pounds === null
          ? { pricedPer, lacking: 'the ticket has no pounds' }
          : { quantity: pounds };
      }
      case 'HR':
      case 'CREW_DAY':
        return TicketPricing.crewTime(piece, payItem, action);
      default:
        return { pricedPer, lacking: 'the ticket has no scale weight' };
    }
  }

  // The count, the pounds or the hours a line reads: the ticket's own (crew time's highest
  // item's hours, once; an itemised ticket's items added up), or the same of the items the
  // rule's "Quantity from" chooses (ADR-126, 128).
  private static counted(piece: PricedPiece, action: RuleActionLine): Exact | null {
    const { reading } = piece;
    if (action.quantityFrom !== 'CHOSEN_ITEMS') {
      return reading.unitCount === null ? null : Exact.of(reading.unitCount);
    }
    const chosen = new Set(action.items.map((item) => item.id));
    const counts = reading.items
      .filter((item) => chosen.has(item.itemNameId))
      .map((item) => Exact.of(item.count));
    if (piece.countShape !== 'ITEM_HOURS') {
      return counts.reduce((sum, each) => sum.plus(each), Exact.nought);
    }
    const [first, ...rest] = counts;
    if (first === undefined) return null;
    return rest.reduce((highest, each) => (each.isAbove(highest) ? each : highest), first);
  }

  // Hours through the pay item's conversion: per hour; per day by exact division, to four
  // decimals a half up; per day in the steps the firm entered. These three are the only ones
  // (ADR-087; the decimals and the hours in no step: the user, ADR-355).
  private static crewTime(
    piece: PricedPiece,
    payItem: PricedPayItem,
    action: RuleActionLine,
  ): Quantity {
    const pricedPer = unitWords[payItem.unit];
    const hours = TicketPricing.counted(piece, action);
    if (hours === null) return { pricedPer, lacking: 'the ticket has no hours' };
    if (payItem.unit === 'HR') return { quantity: hours };
    if (payItem.crewTimeConversion === 'PER_DAY_STEPS') {
      const step = payItem.crewDaySteps.find(
        (each) =>
          !Exact.of(each.fromHours).isAbove(hours) && !hours.isAbove(Exact.of(each.toHours)),
      );
      return step === undefined
        ? { pricedPer: `${pricedPer} in steps`, lacking: `${hours.text(2)} h falls in no step` }
        : { quantity: Exact.of(step.quantity) };
    }
    const dayHours = payItem.crewDayHours === null ? Exact.nought : Exact.of(payItem.crewDayHours);
    if (!dayHours.isAboveNought()) return { pricedPer, lacking: 'the pay item has no day length' };
    return { quantity: hours.dividedBy(dayHours).rounded(quantityDecimals) };
  }
}
