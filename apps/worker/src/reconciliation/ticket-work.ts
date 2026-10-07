// What the worker concludes for one ticket (spec/parts/06-reconciliation.md steps 2 to 5 and 7;
// adms-ticket-workflows §4.7; BACKLOG C70; ADR-352): its flags, its status, the zone of each
// collection and unit rate event, a unit rate ticket's pay item worked out again, and, once the
// ticket is whole, its completed load or haul-out with a row for each collection, its share and
// its mileage; then, with the quantity attached, what the firm's rules make of it: its lines, the
// pricing flags and a rule's void (spec/parts/07-pricing-ledger-audit.md; adms-validation §5.3;
// ADR-359). No rule is here: every check and every formula is `packages/domain`'s, handed what
// it reads (invariant 11). Nothing is written here either: `TicketWrite` writes what this finds.
import {
  HaulOutQuantities,
  LoadQuantities,
  Mileage,
  PlaceChecks,
  QuantityChecks,
  RoeChecks,
  ScaleWeight,
  SizeBands,
  StumpQuantities,
  TicketChecks,
  TicketPricing,
  TicketReadings,
  UnitRateChecks,
  placeOf,
  type CarriedTicketRead,
  type FlagRaised,
  Flags,
  type MileageEnds,
  type MileageMeasured,
  type Named,
  type PayItemWorkedOut,
  type PricedLine,
  type PricedPiece,
  type Ticket,
  type TicketPriced,
  type WorkerStatus,
  type ZoneAttached,
} from '@open-adms/domain';

import {
  carriedTicketFound,
  type CollectionRowRead,
  type CompletedRead,
  type ProjectSnapshot,
  type WorkerFieldEvent,
} from './project-read.ts';

// The mileage step: `Mileages`, or whatever stands in for the map servers.
export interface MileageStep {
  between(ends: MileageEnds, standing?: MileageMeasured | null): Promise<MileageMeasured>;
}

// Whether a mileage a collection row holds still stands: neither of its ends has been corrected
// since it was written (the user, ADR-350: nothing keeps the two ends a second time).
export interface MileageStands {
  stands(
    workflow: 'LOAD' | 'HAUL_OUT',
    row: CollectionRowRead,
    disposalEventId: string,
    siteId: string,
  ): Promise<boolean>;
}

// The thresholds the worker hands the checks: policy, never numbers here (invariant 16).
export interface WorkSettings {
  // One crew item's hours in a day over this are flagged: the policy value CREW_DAY_HOURS.
  readonly crewItemHoursLimit: number;
}

export interface CollectionWorked {
  readonly collectionEventId: string;
  readonly splitSuffix: string;
  // A haul-out's pile: what it added to the call; none on a load's collection.
  readonly pileLoadCall: number | null;
  readonly shareFraction: string;
  readonly volumeCy: string | null;
  readonly weightTons: string | null;
  // None where it couldn't be worked out: the collection has no fix, or its disposal no site.
  readonly mileage: MileageMeasured | null;
}

export interface CompletedWorked {
  readonly disposalEventId: string;
  readonly quantitySource: CompletedRead['quantitySource'];
  readonly capacityCy: number | null;
  readonly loadCall: number | null;
  readonly volumeCy: string | null;
  readonly weightTons: string | null;
  readonly weightIsShare: boolean;
  // A load's; none on a haul-out.
  readonly carriedCount: number | null;
  // The carried stumps' CY: read by pricing, kept on no record.
  readonly carriedStumpCy: string | null;
  readonly collections: readonly CollectionWorked[];
}

// A flag as the worker writes it: a pricing flag names the line it is about (its # and pay
// item), since the line itself may not exist.
export type WorkedFlag = FlagRaised & {
  readonly slot?: number | null;
  readonly payItemId?: string | null;
};

export interface TicketWorked {
  readonly ticket: Ticket<WorkerFieldEvent>;
  // VOID where a rule's Void ticket ran (ADR-118, 167).
  readonly status: WorkerStatus | 'VOID';
  // Every flag the ticket's facts raise now, the checks' and pricing's.
  readonly flags: readonly WorkedFlag[];
  readonly zones: readonly ZoneAttached[];
  readonly workedOut: PayItemWorkedOut | null;
  // None while the ticket isn't whole, and on a unit rate ticket.
  readonly completed: CompletedWorked | null;
  // The ticket's lines as the rules give them now, in the order of an invoice; none while it
  // isn't whole, on a voided ticket and under a flag that says "not billed".
  readonly lines: readonly PricedLine[];
  // The rules whose Void ticket ran: the void's reason.
  readonly voidedBy: readonly Named[];
}

const text = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export class TicketWork {
  private readonly snapshot: ProjectSnapshot;
  private readonly mileages: MileageStep;
  private readonly standing: MileageStands;
  private readonly flags: Flags;
  private readonly ticketChecks: TicketChecks<WorkerFieldEvent>;
  private readonly placeChecks: PlaceChecks<WorkerFieldEvent>;
  private readonly quantityChecks: QuantityChecks<WorkerFieldEvent>;
  private readonly unitRateChecks: UnitRateChecks<WorkerFieldEvent>;
  private readonly roeChecks: RoeChecks<WorkerFieldEvent>;
  private readonly readings: TicketReadings<WorkerFieldEvent>;
  private readonly pricing: TicketPricing;
  // What a ticket's checks read of the project's other tickets.
  private readonly loadCollections: readonly WorkerFieldEvent[];
  private readonly crewTime: readonly WorkerFieldEvent[];
  private readonly unitRateTickets: ReadonlyMap<string, WorkerFieldEvent>;
  private readonly loadsListing: ReadonlyMap<string, ReadonlySet<string>>;
  private readonly capacities: ReadonlyMap<string, number | null>;

  constructor(
    snapshot: ProjectSnapshot,
    settings: WorkSettings,
    flags: Flags,
    mileages: MileageStep,
    standing: MileageStands,
  ) {
    const { project } = snapshot;
    this.snapshot = snapshot;
    this.mileages = mileages;
    this.standing = standing;
    this.flags = flags;
    this.ticketChecks = new TicketChecks({
      timeZone: project.timeZone,
      activeFrom: project.activeFrom,
      activeTo: project.activeTo,
      certifications: snapshot.certifications,
      // The difference at a sync is kept with the sync's own record, Phase 2's (ADR-344).
      deviceClockOffLimitMinutes: null,
      allowSplitLoads: project.allowSplitLoads,
      controlRanges: snapshot.controlRanges,
    });
    this.placeChecks = new PlaceChecks({
      timeZone: project.timeZone,
      siteCircleMeters: project.siteCircleMeters,
      map: snapshot.map,
    });
    this.quantityChecks = new QuantityChecks({
      timeZone: project.timeZone,
      loadCallLowLimit: project.loadCallLowLimit,
      loadCallHighLimit: project.loadCallHighLimit,
    });
    this.unitRateChecks = new UnitRateChecks({
      timeZone: project.timeZone,
      payItems: snapshot.unitRatePayItems,
      stumpCheckRootBallWider: project.stumpCheckRootBallWider,
      crewItemHoursLimit: settings.crewItemHoursLimit,
    });
    this.roeChecks = new RoeChecks({
      timeZone: project.timeZone,
      requiresRoe: project.requiresRoe,
    });
    this.readings = new TicketReadings({
      timeZone: project.timeZone,
      certifications: snapshot.certifications,
      zones: snapshot.pricing.zones,
    });
    this.pricing = new TicketPricing({
      timeZone: project.timeZone,
      rules: snapshot.pricing.rules,
      contracts: snapshot.pricing.contracts,
      primes: snapshot.pricing.primes,
      payItems: snapshot.pricing.payItems,
      stumpCheckFillNeedsExposure: project.stumpCheckFillNeedsExposure,
    });

    this.loadCollections = snapshot.fieldEvents.filter((event) => event.kind === 'COLLECTION');
    this.crewTime = snapshot.fieldEvents.filter(
      (event) => event.kind === 'UNIT_RATE' && event.kindOfWork?.countShape === 'ITEM_HOURS',
    );
    this.unitRateTickets = new Map(
      snapshot.fieldEvents
        .filter((event) => event.kind === 'UNIT_RATE')
        .map((event) => [event.ticketNumber, event]),
    );
    const listing = new Map<string, Set<string>>();
    for (const collection of this.loadCollections) {
      for (const carried of collection.carriedTicketNumbers) {
        const loads = listing.get(carried);
        if (loads === undefined) listing.set(carried, new Set([collection.ticketNumber]));
        else loads.add(collection.ticketNumber);
      }
    }
    this.loadsListing = listing;
    this.capacities = new Map(
      snapshot.certifications.map((each) => [each.certNumber, each.capacityCy]),
    );
  }

  async of(ticket: Ticket<WorkerFieldEvent>): Promise<TicketWorked> {
    const carried = this.carriedBy(ticket);
    const place = this.placeChecks.of(ticket);
    const unitRate = this.unitRateChecks.of(ticket, {
      otherCrewTime: this.crewTime.filter((event) => event.ticketNumber !== ticket.ticketNumber),
    });
    const completed = await this.completed(ticket, carried);
    const flags = [
      ...this.ticketChecks.of(ticket, {
        otherLoads: this.loadCollections,
        carried: this.counted(ticket, carried),
      }),
      ...place.flags,
      ...this.quantityChecks.of(ticket, { carried }),
      ...unitRate.flags,
      ...this.roeChecks.of(ticket),
      ...(completed?.collections ?? []).flatMap((collection) => {
        const raised =
          collection.mileage === null
            ? null
            : Mileage.noRoadRoute(
                this.flags,
                { ticketNumber: ticket.ticketNumber },
                collection.collectionEventId,
                collection.mileage,
              );
        return raised === null ? [] : [raised];
      }),
    ];
    const priced = this.priced(ticket, place.zones, unitRate.workedOut, completed, flags);
    const all: WorkedFlag[] = [...flags, ...priced.flags];
    return {
      ticket,
      // A rule's void wins over everything else the ticket would be (ADR-167); once written, the
      // ticket is out of the run until a person unvoids it (ADR-360). A flag a reviewer accepted
      // counts for nothing in the status while the same flag stands (ADR-166, 365).
      status:
        priced.voidedBy.length > 0
          ? 'VOID'
          : ticket.status(
              Flags.accepted(
                this.snapshot.standingFlags.filter(
                  (flag) =>
                    flag.accepted &&
                    flag.workflow === ticket.workflow &&
                    flag.ticketNumber === ticket.ticketNumber,
                ),
                all,
              ),
            ),
      flags: all,
      zones: place.zones,
      workedOut: unitRate.workedOut,
      completed,
      lines: priced.lines,
      voidedBy: priced.voidedBy,
    };
  }

  // What the firm's rules make of the ticket, after the checks, the zone, the mileage and the
  // quantity (adms-validation §5.3): each piece the rules run on is read from the ticket and
  // what was just attached to it, and pricing is handed the flags the checks raised.
  private priced(
    ticket: Ticket<WorkerFieldEvent>,
    zones: readonly ZoneAttached[],
    workedOut: PayItemWorkedOut | null,
    completed: CompletedWorked | null,
    raised: readonly FlagRaised[],
  ): TicketPriced {
    const read = this.readings.of(ticket, {
      // The zone the run attaches now, or the one the field event already holds.
      zones: ticket.events.map((event) => ({
        fieldEventId: event.id,
        zoneId:
          zones.find((attached) => attached.fieldEventId === event.id)?.zoneId ?? event.zoneId,
      })),
      workedOut,
      shares: completed?.collections ?? [],
    });
    const collections = [...ticket.collections].sort(
      (left, right) => placeOf(left.splitSuffix) - placeOf(right.splitSuffix),
    );
    const split = collections.length > 1;
    const pieces: PricedPiece[] = read.readings.map((reading, at) => {
      const event = ticket.unitRate ?? collections[at];
      if (event === undefined) throw new Error('A reading with no field event.');
      const isStump = ticket.unitRate !== null && event.kindOfWork?.key === 'STUMPS';
      return {
        reading,
        fieldEventId: event.id,
        // What the tickets a load carries come to is the load's own: never handed to each
        // property of a split, which would bill it once for each.
        carriedCount: split ? null : (completed?.carriedCount ?? null),
        carriedStumpCy: split ? null : (completed?.carriedStumpCy ?? null),
        countShape: ticket.unitRate === null ? null : (event.kindOfWork?.countShape ?? null),
        stump: isStump
          ? {
              fillCy:
                event.measurement === null
                  ? null
                  : new StumpQuantities(
                      SizeBands.diameter(event.measurement),
                      event.rootBallInches,
                    ).fillCy(this.snapshot.project.stumpFillDepthInches),
              rootBallHalfExposed: event.rootBallHalfExposed,
            }
          : null,
      };
    });
    const siteId = ticket.unitRate === null ? (ticket.disposal?.site?.id ?? null) : null;
    const site = this.snapshot.sites.find((each) => each.id === siteId);
    return this.pricing.of({
      ticketNumber: ticket.ticketNumber,
      form: ticket.workflow,
      primeId: read.primeId,
      operatingSubId: read.operatingSubId,
      pieces,
      dumpedAt:
        site === undefined
          ? null
          : {
              id: site.id,
              name: site.name,
              chargesTippingFee: site.chargesTippingFee,
              tippingFeePayItemIds: site.tippingFeePayItemIds,
            },
      raised,
    });
  }

  // The tickets a load's collections list as carried: whether a unit rate ticket of the project
  // has that number, and the other loads that list it too (ADR-192).
  private carriedBy(ticket: Ticket<WorkerFieldEvent>): CarriedTicketRead[] {
    if (ticket.workflow !== 'LOAD') return [];
    return ticket.collections.flatMap((collection) =>
      collection.carriedTicketNumbers.map((carriedTicketNumber) => ({
        fieldEventId: collection.id,
        carriedTicketNumber,
        found: this.unitRateTickets.has(carriedTicketNumber),
        otherLoadNumbers: [...(this.loadsListing.get(carriedTicketNumber) ?? [])]
          .filter((number) => number !== ticket.ticketNumber)
          .sort(text),
      })),
    );
  }

  // How many tickets the collection lists, and the word for what the tower counted: the kind
  // of work of the tickets found, where they are all of one kind ("stumps"), else "tickets".
  private counted(
    ticket: Ticket<WorkerFieldEvent>,
    carried: readonly CarriedTicketRead[],
  ): { listed: number; counted: string } | null {
    if (carried.length === 0 && (ticket.disposal?.carriedCount ?? null) === null) return null;
    const kinds = new Set(
      carried.map(
        (listed) => this.unitRateTickets.get(listed.carriedTicketNumber)?.kindOfWork?.name ?? null,
      ),
    );
    const [only] = [...kinds];
    return {
      listed: carried.length,
      counted: kinds.size === 1 && only != null ? only.toLowerCase() : 'tickets',
    };
  }

  // A disposal's own weight from its scale receipt: the receipt's net on one container's
  // disposal; its share by certified capacity where the receipt is on several (ADR-175). None
  // where the receipt carries two debris types, whose weight isn't used until a person fixes it
  // (ADR-069), or has no usable weight.
  private static weightOf(event: WorkerFieldEvent): {
    weightTons: string | null;
    weightIsShare: boolean;
  } {
    const none = { weightTons: null, weightIsShare: false };
    const receipt = event.scaleReceipt;
    if (receipt === null) return none;
    const debrisTypes = new Set(
      receipt.disposals.flatMap((disposal) => disposal.debrisType?.id ?? []),
    );
    if (debrisTypes.size > 1) return none;
    const share = new ScaleWeight(receipt.weights)
      .sharedBy(
        receipt.disposals.map((disposal) => ({
          key: disposal.fieldEventId,
          capacityCy: disposal.capacityCy,
        })),
      )
      ?.find((container) => container.key === event.id);
    return share === undefined
      ? none
      : { weightTons: share.weightTons, weightIsShare: share.weightIsShare };
  }

  private async completed(
    ticket: Ticket<WorkerFieldEvent>,
    carried: readonly CarriedTicketRead[],
  ): Promise<CompletedWorked | null> {
    const { disposal } = ticket;
    if (!ticket.isWhole || disposal === null || ticket.workflow === 'UNIT_RATE') return null;
    const weight = TicketWork.weightOf(disposal);
    const collections = [...ticket.collections].sort(
      (left, right) => placeOf(left.splitSuffix) - placeOf(right.splitSuffix),
    );

    if (ticket.workflow === 'LOAD') {
      // A load bills from the certification its disposal scanned (spec/FLAGS.md §5 (1)).
      const worked = new LoadQuantities({
        capacityCy: this.capacities.get(disposal.certNumber) ?? null,
        loadCall: disposal.loadCall,
        ...weight,
        collections: collections.map((collection) => ({
          splitSuffix: collection.splitSuffix,
          estimateCy: collection.estimateCy,
        })),
        carried:
          carried.length === 0
            ? null
            : carried.flatMap((listed) => {
                const found = this.unitRateTickets.get(listed.carriedTicketNumber);
                return found === undefined ? [] : [carriedTicketFound(found)];
              }),
      }).work();
      return {
        disposalEventId: disposal.id,
        // A tower that took nothing is flagged for it (DETAIL_MISSING); the record says what a
        // load is asked for, with every figure empty.
        quantitySource: worked.quantitySource ?? 'LOAD_CALL',
        capacityCy: worked.capacityCy,
        loadCall: worked.loadCall,
        volumeCy: worked.volumeCy,
        weightTons: worked.weightTons,
        weightIsShare: worked.weightIsShare,
        carriedCount: worked.carriedCount,
        carriedStumpCy: worked.carriedStumpCy,
        collections: await this.rows(
          ticket,
          collections.map((collection, at) => ({
            collection,
            pileLoadCall: null,
            shareFraction: worked.collections[at]?.shareFraction ?? '0.00000000',
            volumeCy: worked.collections[at]?.volumeCy ?? null,
            weightTons: worked.collections[at]?.weightTons ?? null,
          })),
        ),
      };
    }

    // A haul-out bills from the certification scanned at the loading end, where its call is
    // taken: the last pile's on a split.
    const worked = new HaulOutQuantities({
      capacityCy: this.capacities.get(collections.at(-1)?.certNumber ?? '') ?? null,
      piles: collections.map((collection) => ({
        splitSuffix: collection.splitSuffix,
        loadCall: collection.loadCall,
      })),
      ...weight,
    }).work();
    return {
      disposalEventId: disposal.id,
      quantitySource: worked.quantitySource === 'SCALE_WEIGHT' ? 'SCALE_WEIGHT' : 'LOAD_CALL',
      capacityCy: worked.capacityCy,
      loadCall: worked.loadCall,
      volumeCy: worked.volumeCy,
      weightTons: worked.weightTons,
      weightIsShare: worked.weightIsShare,
      carriedCount: null,
      carriedStumpCy: null,
      collections: await this.rows(
        ticket,
        collections.map((collection, at) => ({
          collection,
          pileLoadCall: worked.piles[at]?.pileLoadCall ?? 0,
          shareFraction: worked.piles[at]?.shareFraction ?? '0.00000000',
          volumeCy: worked.piles[at]?.volumeCy ?? null,
          weightTons: worked.piles[at]?.weightTons ?? null,
        })),
      ),
    };
  }

  // The mileage a collection row holds, between the ends as they are now; none where the row
  // holds none.
  private static mileageOn(row: CollectionRowRead, ends: MileageEnds): MileageMeasured | null {
    if (
      row.mileage === null ||
      row.mileageSource === null ||
      row.mapDataDate === null ||
      row.mapDataSha256 === null
    ) {
      return null;
    }
    return {
      miles: row.mileage,
      source: row.mileageSource,
      ends,
      snapped: row.snapped,
      snappedAddress: row.snappedAddress,
      mapData: { date: row.mapDataDate, sha256: row.mapDataSha256 },
    };
  }

  // Each collection's row with its mileage: from its own end GPS to the disposal site's own GPS
  // (ADR-162, 208, 295). The mileage its row already holds is handed over while it stands, and
  // then no map server is asked (AC-06-56).
  private async rows(
    ticket: Ticket<WorkerFieldEvent>,
    shares: readonly (Omit<CollectionWorked, 'collectionEventId' | 'splitSuffix' | 'mileage'> & {
      readonly collection: WorkerFieldEvent;
    })[],
  ): Promise<CollectionWorked[]> {
    const disposal = ticket.disposal;
    const workflow = ticket.workflow === 'HAUL_OUT' ? 'HAUL_OUT' : 'LOAD';
    const before = (
      workflow === 'LOAD' ? this.snapshot.completedLoads : this.snapshot.completedHaulOuts
    ).find((record) => record.disposalEventId === disposal?.id);
    const rows: CollectionWorked[] = [];
    for (const { collection, ...share } of shares) {
      const site = disposal?.site ?? null;
      let mileage: MileageMeasured | null = null;
      if (disposal !== null && site !== null && collection.endGps !== null) {
        const ends = { from: collection.endGps, to: site.gps };
        const row = before?.collections.find(
          (each) => each.collectionEventId === collection.id && each.dissolvedAt === null,
        );
        const held = row === undefined ? null : TicketWork.mileageOn(row, ends);
        const kept =
          row !== undefined &&
          held !== null &&
          (await this.standing.stands(workflow, row, disposal.id, site.id))
            ? held
            : null;
        mileage = await this.mileages.between(ends, kept);
      }
      rows.push({
        collectionEventId: collection.id,
        splitSuffix: collection.splitSuffix,
        ...share,
        mileage,
      });
    }
    return rows;
  }
}
