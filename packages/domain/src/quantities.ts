// The quantities the worker concludes from a ticket's field events and the setup
// (spec/parts/06-reconciliation.md step 5; spec/acceptance/06-reconciliation.md section H;
// adms-validation §5.5; adms-scale-receipts; spec/DATA-MODEL.md §5; ADR-013, 035, 055, 064, 076,
// 116, 165, 175, 178, 183, 187, 192, 196, 198, 203, 204, 223, 227, 295, 297, 343).
//
// Every figure is worked out here in exact decimals, rounded only where a rule says so, and never
// taken from a phone: what a phone printed is what printed, what this gives is what bills
// (ADR-217). A derived figure (a property's or a pile's share, a container's part of one weight)
// is given apart from what was observed, and the parts add up to the whole exactly (ADR-035).
//
// Nothing here decides which figure a line bills: that is read from the paying pay item, its
// Unit of Measure and its "quantity from the tickets it carries" (ADR-223, 343). Nothing here
// compares a weight with a load call, or an estimate with a load (ADR-064, 165), and nothing
// here raises a flag: where a figure can't be worked out it is missing, with why, and the flag
// is the checks'.
import { placeOf } from './tickets.ts';

// An exact decimal as the database gives it ("17.1000"), or a plain number where one is whole
// or short (65, 56.5).
export type Amount = string | number;

// What gave a completed load or haul-out its quantity, as the database keeps it.
export const quantitySources = ['LOAD_CALL', 'SCALE_WEIGHT', 'CARRIED_TICKETS'] as const;
export type QuantitySourceName = (typeof quantitySources)[number];

const decimalText = /^-?\d+(\.\d+)?$/;

// A number held exactly, as one whole number over another.
class Exact {
  static readonly nought = new Exact(0n, 1n);

  private readonly over: bigint;
  private readonly under: bigint;

  private constructor(over: bigint, under: bigint) {
    this.over = over;
    this.under = under;
  }

  static of(amount: Amount): Exact {
    const text = typeof amount === 'number' ? String(amount) : amount.trim();
    if (!decimalText.test(text)) throw new Error(`Not a decimal number: ${String(amount)}.`);
    const [whole = '', fraction = ''] = text.split('.');
    return new Exact(BigInt(whole + fraction), 10n ** BigInt(fraction.length));
  }

  plus(other: Exact): Exact {
    return new Exact(this.over * other.under + other.over * this.under, this.under * other.under);
  }

  minus(other: Exact): Exact {
    return new Exact(this.over * other.under - other.over * this.under, this.under * other.under);
  }

  times(other: Exact): Exact {
    return new Exact(this.over * other.over, this.under * other.under);
  }

  // Only ever by a number above nought.
  dividedBy(other: Exact): Exact {
    return new Exact(this.over * other.under, this.under * other.over);
  }

  isAboveNought(): boolean {
    return this.over > 0n;
  }

  isAbove(other: Exact): boolean {
    return this.over * other.under > other.over * this.under;
  }

  // To so many decimals, a half up (away from nought below it).
  rounded(decimals: number): Exact {
    const scale = 10n ** BigInt(decimals);
    const size = this.over < 0n ? -this.over : this.over;
    const count = (2n * size * scale + this.under) / (2n * this.under);
    return new Exact(this.over < 0n ? -count : count, scale);
  }

  // As text with exactly so many decimals: "52.00".
  text(decimals: number): string {
    const scale = 10n ** BigInt(decimals);
    const count = this.rounded(decimals).over;
    const size = count < 0n ? -count : count;
    const whole = String(size / scale);
    const sign = count < 0n ? '-' : '';
    if (decimals === 0) return `${sign}${whole}`;
    return `${sign}${whole}.${String(size % scale).padStart(decimals, '0')}`;
  }
}

// The decimals each figure is kept to (spec/DATA-MODEL.md §5).
const cyDecimals = 2;
const tonDecimals = 4;
const fractionDecimals = 8;
// A share of a weight is worked out to two decimals (ADR-035, 295).
const weightShareDecimals = 2;

const hundred = Exact.of(100);

// A whole shared out by its parts' sizes, each share rounded a half up to so many decimals, and
// what the rounding left over or took too much given to one: the largest part, the last of them
// where several are as large, so the same parts always give the same shares and the shares add
// up to the whole exactly (ADR-035, 295; which one takes it: ADR-343).
function sharedOut(whole: Exact, parts: readonly Exact[], decimals: number): Exact[] {
  const total = parts.reduce((sum, part) => sum.plus(part), Exact.nought);
  const shares = parts.map((part) => whole.times(part).dividedBy(total).rounded(decimals));
  const given = shares.reduce((sum, share) => sum.plus(share), Exact.nought);
  let largest = 0;
  parts.forEach((part, at) => {
    const held = parts[largest];
    if (held !== undefined && !held.isAbove(part)) largest = at;
  });
  return shares.map((share, at) => (at === largest ? share.plus(whole.minus(given)) : share));
}

// --- Scale weights -----------------------------------------------------------------------------

// The weights a scale receipt holds, as transcribed: any may be missing (ADR-038, 326).
export interface ReceiptWeights {
  readonly grossWeightLb: Amount | null;
  readonly tareWeightLb: Amount | null;
  readonly netWeightLb: Amount | null;
  readonly netWeightTons: Amount | null;
}

export interface NetWeight {
  // The receipt's net in tons, as written or as its pounds give it, whatever its sign; none
  // where the receipt holds no net and not both a gross and a tare to work one out from.
  readonly netTons: string | null;
  readonly readFrom: 'NET_TONS' | 'NET_LB' | 'GROSS_LESS_TARE' | null;
  // The weight a quantity may be taken from: the net where it is above nought, else none. A
  // receipt with no weight, or a net of nought, is a lineage token and no fault by itself
  // (ADR-036); a net below nought is never used.
  readonly usableTons: string | null;
}

// One container's part of a weight (ADR-175).
export interface ContainerWeight<K> {
  readonly key: K;
  readonly weightTons: string;
  // True when the weight was apportioned, never weighed.
  readonly weightIsShare: boolean;
}

const poundsPerTon = Exact.of(2000);

// One scale receipt's weight.
export class ScaleWeight {
  private readonly receipt: ReceiptWeights;

  constructor(receipt: ReceiptWeights) {
    this.receipt = receipt;
  }

  // What the receipt weighed, read and never guessed: its net in tons as written; else its net
  // in pounds; else its gross less its tare. A missing weight is never worked out from a
  // capacity or from one figure alone.
  net(): NetWeight {
    const { receipt } = this;
    let net: Exact | null = null;
    let readFrom: NetWeight['readFrom'] = null;
    if (receipt.netWeightTons !== null) {
      net = Exact.of(receipt.netWeightTons);
      readFrom = 'NET_TONS';
    } else if (receipt.netWeightLb !== null) {
      net = Exact.of(receipt.netWeightLb).dividedBy(poundsPerTon);
      readFrom = 'NET_LB';
    } else if (receipt.grossWeightLb !== null && receipt.tareWeightLb !== null) {
      net = Exact.of(receipt.grossWeightLb)
        .minus(Exact.of(receipt.tareWeightLb))
        .dividedBy(poundsPerTon);
      readFrom = 'GROSS_LESS_TARE';
    }
    if (net === null) return { netTons: null, readFrom: null, usableTons: null };
    const netTons = net.text(tonDecimals);
    return {
      netTons,
      readFrom,
      usableTons: Exact.of(netTons).isAboveNought() ? netTons : null,
    };
  }

  // The receipt's weight on the disposals of several containers (a truck and its trailer
  // weighed in one pass): split by certified capacity, each share to two decimals, adding up to
  // the weight exactly, each marked as a share. On one container's disposal it is that
  // container's, weighed. Where the receipt has no usable weight, a container has no capacity,
  // or none holds anything, no share can be worked out and none is given.
  sharedBy<K>(
    containers: readonly { readonly key: K; readonly capacityCy: number | null }[],
  ): readonly ContainerWeight<K>[] | null {
    const { usableTons } = this.net();
    if (usableTons === null) return null;
    const weight = Exact.of(usableTons);
    const [only] = containers;
    if (containers.length === 1 && only !== undefined) {
      return [{ key: only.key, weightTons: weight.text(tonDecimals), weightIsShare: false }];
    }
    const capacities: Exact[] = [];
    for (const container of containers) {
      if (container.capacityCy === null) return null;
      capacities.push(Exact.of(container.capacityCy));
    }
    if (!capacities.some((capacity) => capacity.isAboveNought())) return null;
    const shares = sharedOut(weight, capacities, weightShareDecimals);
    return containers.map((container, at) => ({
      key: container.key,
      weightTons: (shares[at] ?? Exact.nought).text(tonDecimals),
      weightIsShare: true,
    }));
  }
}

// --- Stumps ------------------------------------------------------------------------------------

// One-fourth pi, the cubic inches in a cubic yard, and the three figures the USACE Stump
// Conversion Guide fixes: the stump's length, the root ball as 3.6 times the stump across, and
// the root ball's height (ADR-178, 183).
const quarterPi = Exact.of('0.7854');
const cubicInchesPerCubicYard = Exact.of(46_656);
const guideStumpLength = Exact.of(24);
const guideRootBallRatio = Exact.of('3.6');
const guideRootBallHeight = Exact.of(31);

// One stump, as its ticket measured it: its diameter two feet up, and its root ball's where one
// was measured, in inches. A root-ball reading never goes into the stump CY.
export class StumpQuantities {
  private readonly diameterInches: Amount;
  private readonly rootBallInches: Amount | null;

  constructor(diameterInches: Amount, rootBallInches: Amount | null = null) {
    this.diameterInches = diameterInches;
    this.rootBallInches = rootBallInches;
  }

  // The stump's CY from its diameter two feet up, to a tenth, a half up: the guide's formula,
  // the same at every size. Only a load of stumps bills it; it never pays a stump ticket
  // (ADR-196, 198).
  stumpCy(): string {
    const across = Exact.of(this.diameterInches);
    const rootBall = guideRootBallRatio.times(across);
    const stump = across.times(across).times(quarterPi).times(guideStumpLength);
    const ball = rootBall.times(rootBall).times(quarterPi).times(guideRootBallHeight);
    return stump.plus(ball).dividedBy(cubicInchesPerCubicYard).text(1);
  }

  // The stump hole's fill, from the root ball's measured diameter and the project's fill depth
  // in inches, to a tenth, a half up. No root ball measured, no fill CY (ADR-203). The depth is
  // the project's setting, never a number of ours.
  fillCy(fillDepthInches: Amount): string | null {
    if (this.rootBallInches === null) return null;
    const rootBall = Exact.of(this.rootBallInches);
    return quarterPi
      .times(rootBall)
      .times(rootBall)
      .times(Exact.of(fillDepthInches))
      .dividedBy(cubicInchesPerCubicYard)
      .text(1);
  }
}

// --- A load that carries tickets ---------------------------------------------------------------

// A ticket a load carries, found by the number written on the collection (ADR-192, 204).
export interface CarriedTicketFound {
  readonly ticketNumber: string;
  // A stump ticket's diameter two feet up; none on any other ticket.
  readonly stumpDiameterInches: Amount | null;
  // The items on it: a white goods ticket's items removed; a stump ticket is one.
  readonly itemCount: number;
}

export interface CarriedQuantities {
  // The items on the tickets it carries.
  readonly carriedCount: number;
  // Each carried stump's CY, rounded, then added: the load always equals its stump tickets.
  // None where it carries no stump.
  readonly stumpCy: string | null;
}

// The tickets a load carries that were found.
export class CarriedTickets {
  private readonly found: readonly CarriedTicketFound[];

  constructor(found: readonly CarriedTicketFound[]) {
    this.found = found;
  }

  quantities(): CarriedQuantities {
    let stumps: Exact | null = null;
    let carriedCount = 0;
    for (const ticket of this.found) {
      carriedCount += ticket.itemCount;
      if (ticket.stumpDiameterInches === null) continue;
      const each = Exact.of(new StumpQuantities(ticket.stumpDiameterInches).stumpCy());
      stumps = (stumps ?? Exact.nought).plus(each);
    }
    return { carriedCount, stumpCy: stumps === null ? null : stumps.text(cyDecimals) };
  }
}

// --- What a pay item bills from ----------------------------------------------------------------

// What a pay item says about the quantity it prices: its Unit of Measure, and whether it takes
// the quantity from the tickets a load carries.
export interface QuantityAsked {
  readonly unit: 'CY' | 'TN' | 'EA' | 'LB' | 'HR' | 'CREW_DAY' | 'TBN';
  readonly quantityFromCarriedTickets: boolean;
}

// A load's, a haul-out's, a property's or a pile's figures, as far as each could be worked out.
export interface QuantityFigures {
  readonly volumeCy: string | null;
  readonly weightTons: string | null;
  readonly carriedCount?: number | null;
  readonly carriedStumpCy?: string | null;
}

// The one figure a pay item bills, read from the pay item and from nothing else: per ton the
// weight, per pound the weight in pounds; per CY the volume (the carried stumps' CY, where the
// pay item takes it from the tickets carried, whatever call stands beside them); per each, on
// such a pay item, the items carried.
// Where the record holds two quantities the pay item still says which, and the two are never
// compared (ADR-165, 223, 329 (7), 343). None where the figure is missing: that line bills
// nothing and is flagged by the pricing (ADR-223).
export function quantityFor(asked: QuantityAsked, figures: QuantityFigures): string | null {
  switch (asked.unit) {
    case 'TN':
      return figures.weightTons;
    case 'LB':
      return figures.weightTons === null
        ? null
        : Exact.of(figures.weightTons).times(poundsPerTon).text(2);
    case 'CY':
      return asked.quantityFromCarriedTickets ? (figures.carriedStumpCy ?? null) : figures.volumeCy;
    case 'EA':
      return asked.quantityFromCarriedTickets && typeof figures.carriedCount === 'number'
        ? String(figures.carriedCount)
        : null;
    default:
      return null;
  }
}

// --- Loads -------------------------------------------------------------------------------------

// One collection of a load: the ordinary one, or one for each property of a split.
export interface LoadCollectionTaken {
  // Empty when not split.
  readonly splitSuffix: string;
  // A split property's estimate, in CY: only its size beside the others' (ADR-064).
  readonly estimateCy: Amount | null;
}

export interface LoadTaken {
  // The certification's capacity: none while no certification is found, and on a crew's.
  readonly capacityCy: number | null;
  // The tower's call, 0–100.
  readonly loadCall: number | null;
  // This container's weight from its scale receipt, and whether it is its share of one weight
  // (ScaleWeight); none where the tower took no usable weight.
  readonly weightTons: Amount | null;
  readonly weightIsShare: boolean;
  readonly collections: readonly LoadCollectionTaken[];
  // The tickets it carries that were found; none on a load that lists none.
  readonly carried: readonly CarriedTicketFound[] | null;
}

// Why a split's shares couldn't be worked out. No flag of the catalogue says it yet (BACKLOG C70).
export type SharesNotWorkedOut = 'ESTIMATE_MISSING' | 'ESTIMATES_ARE_NOUGHT';

export interface LoadCollectionQuantities {
  readonly splitSuffix: string;
  // Its estimate ÷ the sum of the estimates; 1 on an ordinary load; 0 where no share could be
  // worked out.
  readonly shareFraction: string;
  // Its share of the load's CY and of its weight, each adding up to the load's exactly.
  readonly volumeCy: string | null;
  readonly weightTons: string | null;
}

export interface LoadQuantitiesWorked {
  // What the tower took: the weight where it took a usable one, else the call, else the tickets
  // carried; none where it took nothing. It describes the record; a line's quantity is read
  // from its pay item (quantityFor).
  readonly quantitySource: QuantitySourceName | null;
  readonly capacityCy: number | null;
  readonly loadCall: number | null;
  // Capacity × load call ÷ 100; with no call, the carried stumps' CY.
  readonly volumeCy: string | null;
  readonly weightTons: string | null;
  readonly weightIsShare: boolean;
  readonly carriedCount: number | null;
  // The carried stumps' CY by itself, which a pay item that takes its quantity from the tickets
  // carried bills whatever else the tower gave.
  readonly carriedStumpCy: string | null;
  // In the order of the suffixes.
  readonly collections: readonly LoadCollectionQuantities[];
  readonly sharesNotWorkedOut: SharesNotWorkedOut | null;
}

const bySuffix = <C extends { readonly splitSuffix: string }>(collections: readonly C[]): C[] =>
  [...collections].sort((left, right) => placeOf(left.splitSuffix) - placeOf(right.splitSuffix));

// Capacity × call ÷ 100: a whole CY times a whole percent never needs more than two decimals.
const volumeOf = (capacityCy: number | null, call: number | null): Exact | null =>
  capacityCy === null || call === null
    ? null
    : Exact.of(capacityCy).times(Exact.of(call)).dividedBy(hundred);

const tons = (weight: Amount | null): Exact | null => (weight === null ? null : Exact.of(weight));

export class LoadQuantities {
  private readonly taken: LoadTaken;

  constructor(taken: LoadTaken) {
    this.taken = taken;
  }

  work(): LoadQuantitiesWorked {
    const { capacityCy, loadCall, weightIsShare } = this.taken;
    const carried =
      this.taken.carried === null ? null : new CarriedTickets(this.taken.carried).quantities();
    const weight = tons(this.taken.weightTons);
    const fromCall = volumeOf(capacityCy, loadCall);
    const stumpCy = carried?.stumpCy ?? null;
    const volume = fromCall ?? (stumpCy === null ? null : Exact.of(stumpCy));

    const collections = bySuffix(this.taken.collections);
    const parts = LoadQuantities.parts(collections);
    const shared = (whole: Exact | null, decimals: number): (Exact | null)[] =>
      whole === null || parts.sizes === null
        ? collections.map(() => null)
        : sharedOut(whole, parts.sizes, decimals);
    const volumes = shared(volume, cyDecimals);
    const weights = shared(weight, weightShareDecimals);
    const total = parts.sizes?.reduce((sum, part) => sum.plus(part), Exact.nought) ?? null;

    return {
      quantitySource:
        weight !== null
          ? 'SCALE_WEIGHT'
          : loadCall !== null
            ? 'LOAD_CALL'
            : carried !== null
              ? 'CARRIED_TICKETS'
              : null,
      capacityCy,
      loadCall,
      volumeCy: volume?.text(cyDecimals) ?? null,
      weightTons: weight?.text(tonDecimals) ?? null,
      weightIsShare: weight !== null && weightIsShare,
      carriedCount: carried?.carriedCount ?? null,
      carriedStumpCy: carried?.stumpCy ?? null,
      collections: collections.map((collection, at) => ({
        splitSuffix: collection.splitSuffix,
        shareFraction: (parts.sizes === null || total === null
          ? Exact.nought
          : (parts.sizes[at] ?? Exact.nought).dividedBy(total)
        ).text(fractionDecimals),
        volumeCy: volumes[at]?.text(cyDecimals) ?? null,
        weightTons: weights[at]?.text(tonDecimals) ?? null,
      })),
      sharesNotWorkedOut: parts.notWorkedOut,
    };
  }

  // Each collection's size beside the others: the whole of an ordinary load; a split
  // property's estimate. Estimates are only relative sizes, never held against the load.
  private static parts(collections: readonly LoadCollectionTaken[]): {
    readonly sizes: readonly Exact[] | null;
    readonly notWorkedOut: SharesNotWorkedOut | null;
  } {
    if (collections.length === 1) return { sizes: [Exact.of(1)], notWorkedOut: null };
    const sizes: Exact[] = [];
    for (const collection of collections) {
      if (collection.estimateCy === null) return { sizes: null, notWorkedOut: 'ESTIMATE_MISSING' };
      sizes.push(Exact.of(collection.estimateCy));
    }
    if (!sizes.some((size) => size.isAboveNought())) {
      return {
        sizes: null,
        notWorkedOut: collections.length === 0 ? null : 'ESTIMATES_ARE_NOUGHT',
      };
    }
    return { sizes, notWorkedOut: null };
  }
}

// --- Haul-outs ---------------------------------------------------------------------------------

// One haul-out collection: the ordinary one, or one for each pile of a split.
export interface PileTaken {
  // Empty when not split.
  readonly splitSuffix: string;
  // The load call at the loading end: on a split, how full the container is after this pile.
  readonly loadCall: number | null;
}

export interface HaulOutTaken {
  readonly capacityCy: number | null;
  readonly piles: readonly PileTaken[];
  // As on a load: the weight its disposal took, and whether it is a share of one weight.
  readonly weightTons: Amount | null;
  readonly weightIsShare: boolean;
}

// A pile whose call isn't higher than the call of the pile before it: what it added can't be
// worked out (spec/FLAGS.md, PILE_CALL_NOT_HIGHER; ADR-295).
export interface PileCallNotHigher {
  readonly splitSuffix: string;
  readonly loadCall: number;
  readonly beforeSuffix: string;
  readonly beforeLoadCall: number;
}

export interface PileQuantities {
  readonly splitSuffix: string;
  // What this pile added: its call less the call before it; the whole call on an ordinary
  // haul-out. Nought where the piles couldn't be shared out.
  readonly pileLoadCall: number;
  // What it added ÷ the haul-out's call; 1 on an ordinary haul-out.
  readonly shareFraction: string;
  // Capacity × what it added ÷ 100, and its part of the weight.
  readonly volumeCy: string | null;
  readonly weightTons: string | null;
}

export interface HaulOutQuantitiesWorked {
  // The weight where its disposal took a usable one; else the loading end's call.
  readonly quantitySource: QuantitySourceName | null;
  readonly capacityCy: number | null;
  // The loading end's call; on a split the last pile's: how full it left.
  readonly loadCall: number | null;
  // Kept on a haul-out paid by weight too, unbilled (ADR-227).
  readonly volumeCy: string | null;
  readonly weightTons: string | null;
  readonly weightIsShare: boolean;
  // In the order of the suffixes.
  readonly piles: readonly PileQuantities[];
  // The first pile whose call isn't higher than the one before it; then no pile is shared out.
  readonly pileCallNotHigher: PileCallNotHigher | null;
  // A split with a pile that gave no call: no pile is shared out either.
  readonly pileCallMissing: boolean;
}

export class HaulOutQuantities {
  private readonly taken: HaulOutTaken;

  constructor(taken: HaulOutTaken) {
    this.taken = taken;
  }

  work(): HaulOutQuantitiesWorked {
    const { capacityCy, weightIsShare } = this.taken;
    const piles = bySuffix(this.taken.piles);
    const weight = tons(this.taken.weightTons);
    const loadCall = piles.at(-1)?.loadCall ?? null;
    const volume = volumeOf(capacityCy, loadCall);

    const pileCallMissing = piles.length > 1 && piles.some((pile) => pile.loadCall === null);
    const pileCallNotHigher = pileCallMissing ? null : HaulOutQuantities.notHigher(piles);
    const sharedOutByPile = !pileCallMissing && pileCallNotHigher === null;

    // What each pile added to the call.
    const added = piles.map((pile, at) => (pile.loadCall ?? 0) - (piles[at - 1]?.loadCall ?? 0));
    const [only] = piles;
    const lone = piles.length === 1 && only !== undefined;
    // An ordinary haul-out's one collection takes the whole weight, whatever its call.
    const sizes = lone ? [Exact.of(1)] : added.map((part) => Exact.of(part));
    const canShareWeight =
      weight !== null && sharedOutByPile && sizes.some((size) => size.isAboveNought());
    const weights = canShareWeight ? sharedOut(weight, sizes, weightShareDecimals) : [];
    const whole = lone || loadCall === null || loadCall === 0 ? null : Exact.of(loadCall);

    return {
      quantitySource: weight !== null ? 'SCALE_WEIGHT' : loadCall !== null ? 'LOAD_CALL' : null,
      capacityCy,
      loadCall,
      volumeCy: volume?.text(cyDecimals) ?? null,
      weightTons: weight?.text(tonDecimals) ?? null,
      weightIsShare: weight !== null && weightIsShare,
      piles: piles.map((pile, at) => {
        const part = added[at] ?? 0;
        if (!sharedOutByPile) {
          return {
            splitSuffix: pile.splitSuffix,
            pileLoadCall: 0,
            shareFraction: Exact.nought.text(fractionDecimals),
            volumeCy: null,
            weightTons: null,
          };
        }
        const fraction = lone
          ? Exact.of(1)
          : whole === null
            ? Exact.nought
            : Exact.of(part).dividedBy(whole);
        return {
          splitSuffix: pile.splitSuffix,
          pileLoadCall: part,
          shareFraction: fraction.text(fractionDecimals),
          volumeCy:
            pile.loadCall === null ? null : (volumeOf(capacityCy, part)?.text(cyDecimals) ?? null),
          weightTons: weights[at]?.text(tonDecimals) ?? null,
        };
      }),
      pileCallNotHigher,
      pileCallMissing,
    };
  }

  private static notHigher(piles: readonly PileTaken[]): PileCallNotHigher | null {
    for (let at = 1; at < piles.length; at += 1) {
      const before = piles[at - 1];
      const pile = piles[at];
      if (before === undefined || pile === undefined) continue;
      if (before.loadCall === null || pile.loadCall === null) continue;
      if (pile.loadCall > before.loadCall) continue;
      return {
        splitSuffix: pile.splitSuffix,
        loadCall: pile.loadCall,
        beforeSuffix: before.splitSuffix,
        beforeLoadCall: before.loadCall,
      };
    }
    return null;
  }
}
