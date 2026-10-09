// The checks on a load's and a haul-out's quantity (spec/parts/06-reconciliation.md step 3;
// spec/acceptance/06-reconciliation.md section H, AC-06-80, 85…95, 129, 132; spec/FLAGS.md §3.5;
// adms-validation §5.2 "Quantity", §5.5; adms-scale-receipts; ADR-036, 038, 069, 116, 164, 175,
// 181, 192, 295, 329, 347, 348).
//
// What is judged:
// - the load call that is the ticket's: a load's disposal's, a haul-out's loading-end call, on a
//   split haul-out the last pile's and never a pile's running call (ADR-295);
// - a split haul-out's piles, each call higher than the one before it;
// - the scale receipt a disposal points at: a net that can't be used, two debris types on one
//   receipt, one weight on several containers;
// - the tickets a load carries: one that matches no ticket, one another load lists too.
//
// A check changes nothing, refuses nothing and guesses nothing (ADR-052). The limits are the
// project's settings, started from the policy values, never numbers here (invariant 16). Never
// flagged, so never read here: a scale weight against a load call (ADR-165, 223), a split's
// estimates against the load (ADR-064), "hauling paid twice" on a load of stumps (ADR-199), a
// receipt with no weight at all, which is a lineage token (ADR-036). A line whose pay item needs
// a quantity the ticket doesn't have is the pricing's: `QUANTITY_MISSING_FOR_PAY_ITEM`, task
// 1.6.3.
import type { Named } from './checks.ts';
import { Flags, type FlagRaised, type FlagSubject } from './flags.ts';
import { HaulOutQuantities, ScaleWeight, type ReceiptWeights } from './quantities.ts';
import { placeOf, type GroupedFieldEvent, type Ticket } from './tickets.ts';

// A disposal that points at a scale receipt.
export interface ReceiptDisposal {
  readonly fieldEventId: string;
  readonly ticketNumber: string;
  // The capacity its ticket bills from; none while no certification is found.
  readonly capacityCy: number | null;
  // The debris type that disposal picked.
  readonly debrisType: Named | null;
}

// What the checks read of a scale receipt.
export interface CheckedReceipt {
  readonly id: string;
  // The site's own number, as transcribed.
  readonly receiptNumber: string;
  readonly weights: ReceiptWeights;
  // Every disposal that points at it, of every ticket that isn't void, the ticket's own among
  // them: nothing else says two containers were weighed together (ADR-038, 114).
  readonly disposals: readonly ReceiptDisposal[];
}

// What the checks read of a field event, beside what grouping reads.
export interface QuantifiedFieldEvent extends GroupedFieldEvent {
  // A disposal's and a haul-out collection's load call, 0–100.
  readonly loadCall: number | null;
  // The receipt a disposal or a haul-out disposal points at.
  readonly scaleReceipt: CheckedReceipt | null;
}

export interface QuantitySetup {
  readonly timeZone: string;
  // The project's load-call limits; none is the limit switched off (ADR-164).
  readonly loadCallLowLimit: number | null;
  readonly loadCallHighLimit: number | null;
}

// A ticket a load's collection lists by its number (ADR-192).
export interface CarriedTicketRead {
  // The collection that lists it.
  readonly fieldEventId: string;
  readonly carriedTicketNumber: string;
  // Whether a ticket of the project has that number.
  readonly found: boolean;
  // The other loads, not void, that list it too.
  readonly otherLoadNumbers: readonly string[];
}

// What a ticket's quantity checks read beyond the ticket itself.
export interface QuantifiedAround {
  readonly carried: readonly CarriedTicketRead[];
}

const text = (amount: string | number | null): string | null =>
  amount === null ? null : String(amount);

// Tons as a message says them: to two decimals, and further only where the figure goes further
// ("7.3300" is 7.33, "17.1000" is 17.10).
const tonsWords = (tons: string): string => tons.replace(/(\.\d{2}\d*?)0+$/, '$1');

export class QuantityChecks<E extends QuantifiedFieldEvent = QuantifiedFieldEvent> {
  private readonly setup: QuantitySetup;
  private readonly flags: Flags;

  constructor(setup: QuantitySetup) {
    this.setup = setup;
    this.flags = new Flags(setup.timeZone);
  }

  // Every flag of §3.5 the ticket's facts raise now, all but the pricing's. A ticket still
  // missing a field event gets the checks of the one it has (ADR-244).
  of(ticket: Ticket<E>, around: QuantifiedAround): readonly FlagRaised[] {
    const subject: FlagSubject = { ticketNumber: ticket.ticketNumber };
    return [
      ...this.loadCall(subject, ticket),
      ...this.piles(subject, ticket),
      ...ticket.events.flatMap((event) => this.scaleReceipt(subject, event)),
      ...this.carried(subject, ticket, around.carried),
    ];
  }

  // A split haul-out's piles are read once the ticket is whole: until then a pile's collection
  // may only be still to sync, and the last call isn't known (as a split's lettering, ADR-344).
  private static pilesOf<E extends QuantifiedFieldEvent>(ticket: Ticket<E>): readonly E[] | null {
    if (ticket.workflow !== 'HAUL_OUT') return null;
    if (ticket.isSplit && !ticket.isWhole) return null;
    return [...ticket.collections].sort(
      (left, right) => placeOf(left.splitSuffix) - placeOf(right.splitSuffix),
    );
  }

  // The field event that took the ticket's load call: a load's disposal; a haul-out's
  // collection, the last pile's on a split.
  private static callTaker<E extends QuantifiedFieldEvent>(ticket: Ticket<E>): E | null {
    if (ticket.workflow === 'LOAD') return ticket.disposal;
    return QuantityChecks.pilesOf(ticket)?.at(-1) ?? null;
  }

  // 0% is flagged whatever the limits, and with them switched off: it bills nothing (ADR-116,
  // 181). It is said once, as that, never as a low call too. A call at a limit is flagged
  // (ADR-164).
  private loadCall(subject: FlagSubject, ticket: Ticket<E>): FlagRaised[] {
    const taker = QuantityChecks.callTaker(ticket);
    const call = taker?.loadCall ?? null;
    if (taker === null || call === null) return [];
    if (call === 0) {
      return [this.flags.raise('LOAD_CALL_ZERO', subject, {}, { loadCall: 0 }, taker.id)];
    }
    const { loadCallLowLimit: low, loadCallHighLimit: high } = this.setup;
    const raised: FlagRaised[] = [];
    if (low !== null && call <= low) {
      raised.push(
        this.flags.raise(
          'LOAD_CALL_LOW',
          subject,
          { loadCall: call },
          { loadCall: call, limit: low },
          taker.id,
        ),
      );
    }
    if (high !== null && call >= high) {
      raised.push(
        this.flags.raise(
          'LOAD_CALL_HIGH',
          subject,
          { loadCall: call },
          { loadCall: call, limit: high },
          taker.id,
        ),
      );
    }
    return raised;
  }

  // A pile whose call isn't higher than the call of the pile before it: what it added can't be
  // worked out, and no pile is shared out until it is corrected (ADR-295). About the first such
  // pile, as the quantities find it. A pile with no call is `DETAIL_MISSING`'s.
  private piles(subject: FlagSubject, ticket: Ticket<E>): FlagRaised[] {
    const piles = QuantityChecks.pilesOf(ticket);
    if (piles === null || !ticket.isSplit) return [];
    const { pileCallNotHigher: found } = new HaulOutQuantities({
      capacityCy: null,
      piles,
      weightTons: null,
      weightIsShare: false,
    }).work();
    // A bare collection beside lettered ones has no letter to say: its lettering is flagged.
    if (found === null || found.splitSuffix === '' || found.beforeSuffix === '') return [];
    return [
      this.flags.raise(
        'PILE_CALL_NOT_HIGHER',
        subject,
        {
          pile: found.splitSuffix,
          loadCall: found.loadCall,
          pileBefore: found.beforeSuffix,
          loadCallBefore: found.beforeLoadCall,
        },
        { piles: piles.map((pile) => [pile.splitSuffix, pile.loadCall]) },
        piles.find((pile) => pile.splitSuffix === found.splitSuffix)?.id ?? null,
      ),
    ];
  }

  // The receipt a disposal points at. Raised on each ticket whose disposal points at it: the
  // other's own run raises it there.
  private scaleReceipt(subject: FlagSubject, event: E): FlagRaised[] {
    const receipt = event.scaleReceipt;
    if (receipt === null) return [];
    const { weights } = receipt;
    const weight = new ScaleWeight(weights);
    const net = weight.net();

    // A net below nought; or no net written, and only one of the gross and the tare to work
    // one out from. A missing weight is never worked out from the other figure (ADR-038). A
    // receipt with no weight at all, or a net of nought, is a lineage token and no fault by
    // itself (ADR-036); no legal limit is recorded to test against (spec/FLAGS.md §5 (2)).
    const belowNought = net.netTons?.startsWith('-') ?? false;
    const halfAWeighing =
      net.netTons === null && (weights.grossWeightLb === null) !== (weights.tareWeightLb === null);
    if (belowNought || halfAWeighing) {
      return [
        this.flags.raise(
          'SCALE_WEIGHT_UNUSABLE',
          subject,
          { receipt: receipt.receiptNumber },
          {
            scaleReceiptId: receipt.id,
            grossWeightLb: text(weights.grossWeightLb),
            tareWeightLb: text(weights.tareWeightLb),
            netWeightLb: text(weights.netWeightLb),
            netWeightTons: text(weights.netWeightTons),
          },
          event.id,
        ),
      ];
    }

    const raised: FlagRaised[] = [];
    const figures = {
      grossWeightLb: text(weights.grossWeightLb),
      tareWeightLb: text(weights.tareWeightLb),
      netWeightLb: text(weights.netWeightLb),
      netWeightTons: text(weights.netWeightTons),
    };
    // A net that isn't the gross less the tare: kept as typed, never corrected, and it still
    // bills from the net as written (ADR-329 (4), 348).
    const disagrees = weight.netAgainstGrossLessTare();
    if (disagrees !== null) {
      raised.push(
        this.flags.raise(
          'SCALE_NET_DISAGREES',
          subject,
          {
            receipt: receipt.receiptNumber,
            netTons: tonsWords(disagrees.netTons),
            grossLessTareTons: tonsWords(disagrees.grossLessTareTons),
          },
          { scaleReceiptId: receipt.id, ...figures },
          event.id,
        ),
      );
    }
    // A load's disposal that took a call and a weight too. Which bills is the paying pay item's
    // to say, and the two are never compared (ADR-165, 329 (7), 348). A receipt with no weight
    // beside a call is a lineage token and no second quantity (ADR-036).
    if (event.kind === 'DISPOSAL' && event.loadCall !== null && net.usableTons !== null) {
      raised.push(
        this.flags.raise(
          'TWO_QUANTITIES',
          subject,
          {},
          { loadCall: event.loadCall, scaleReceiptId: receipt.id, netTons: net.usableTons },
          event.id,
        ),
      );
    }

    // A receipt covers one debris type. Only the exact entry is the same type (ADR-207).
    const disposals = [...receipt.disposals].sort(
      (left, right) =>
        left.ticketNumber.localeCompare(right.ticketNumber) ||
        left.fieldEventId.localeCompare(right.fieldEventId),
    );
    const debrisTypes = new Map<string, string>();
    for (const disposal of disposals) {
      if (disposal.debrisType !== null) {
        debrisTypes.set(disposal.debrisType.id, disposal.debrisType.name);
      }
    }
    if (debrisTypes.size > 1) {
      // Its weight isn't used, so nothing is said of how it would have been shared.
      return [
        ...raised,
        this.flags.raise(
          'RECEIPT_TWO_DEBRIS_TYPES',
          subject,
          { receipt: receipt.receiptNumber, debrisTypes: [...debrisTypes.values()] },
          { scaleReceiptId: receipt.id, debrisTypes: [...debrisTypes.keys()].sort() },
          event.id,
        ),
      ];
    }

    // One weight on several containers' disposals, split by certified capacity (ADR-175). Where
    // no share can be worked out (no usable weight, a container with no capacity) none is said.
    if (disposals.length < 2) return raised;
    const shares = weight.sharedBy(
      disposals.map((disposal) => ({
        key: disposal.fieldEventId,
        capacityCy: disposal.capacityCy,
      })),
    );
    const share = shares?.find((container) => container.key === event.id);
    if (share === undefined || net.usableTons === null) return raised;
    return [
      ...raised,
      this.flags.raise(
        'SHARED_SCALE_WEIGHT',
        subject,
        { shareTons: tonsWords(share.weightTons), netTons: tonsWords(net.usableTons) },
        {
          scaleReceiptId: receipt.id,
          netTons: net.usableTons,
          shareTons: share.weightTons,
          containers: disposals.map((disposal) => [disposal.fieldEventId, disposal.capacityCy]),
        },
        event.id,
      ),
    ];
  }

  // The tickets a load carries, by the numbers its collection lists (ADR-192): flagged, never
  // refused, and the load bills from the tickets found.
  private carried(
    subject: FlagSubject,
    ticket: Ticket<E>,
    carried: readonly CarriedTicketRead[],
  ): FlagRaised[] {
    if (ticket.workflow !== 'LOAD') return [];
    const raised: FlagRaised[] = [];
    for (const listed of carried) {
      const { carriedTicketNumber } = listed;
      if (!listed.found) {
        raised.push(
          this.flags.raise(
            'CARRIED_TICKET_NOT_FOUND',
            subject,
            { carriedTicketNumber },
            { carriedTicketNumber },
            listed.fieldEventId,
          ),
        );
      }
      for (const otherLoadNumber of listed.otherLoadNumbers) {
        if (otherLoadNumber === ticket.ticketNumber) continue;
        raised.push(
          this.flags.raise(
            'CARRIED_TICKET_ON_ANOTHER_LOAD',
            subject,
            { carriedTicketNumber, otherLoadNumber },
            { carriedTicketNumber, otherLoadNumber },
            listed.fieldEventId,
          ),
        );
      }
    }
    return raised;
  }
}
