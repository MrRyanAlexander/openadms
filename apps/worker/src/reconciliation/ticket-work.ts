// What the worker concludes for one ticket (spec/parts/06-reconciliation.md steps 2 to 5 and 7;
// adms-ticket-workflows §4.7; BACKLOG C70; ADR-352): its flags, its status, the zone of each
// collection and unit rate event, a unit rate ticket's pay item worked out again, and, once the
// ticket is whole, its completed load or haul-out with a row for each collection, its share and
// its mileage. No rule is here: every check and every formula is `packages/domain`'s, handed what
// it reads (invariant 11). Nothing is written here either: `TicketWrite` writes what this finds.
//
// Unpriced: the rules, the lines and the pricing flags are Milestone 1.6's.
import {
  HaulOutQuantities,
  LoadQuantities,
  Mileage,
  PlaceChecks,
  QuantityChecks,
  RoeChecks,
  ScaleWeight,
  TicketChecks,
  UnitRateChecks,
  placeOf,
  type CarriedTicketRead,
  type FlagRaised,
  type Flags,
  type MileageEnds,
  type MileageMeasured,
  type PayItemWorkedOut,
  type Ticket,
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
  readonly collections: readonly CollectionWorked[];
}

export interface TicketWorked {
  readonly ticket: Ticket<WorkerFieldEvent>;
  readonly status: WorkerStatus;
  // Every flag the ticket's facts raise now.
  readonly flags: readonly FlagRaised[];
  readonly zones: readonly ZoneAttached[];
  readonly workedOut: PayItemWorkedOut | null;
  // None while the ticket isn't whole, and on a unit rate ticket.
  readonly completed: CompletedWorked | null;
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
    return {
      ticket,
      // A reviewer's acceptance is a mark of its own, task 1.8.x's: until it is built no flag
      // is read as accepted.
      status: ticket.status(flags.map(() => ({ accepted: false }))),
      flags,
      zones: place.zones,
      workedOut: unitRate.workedOut,
      completed,
    };
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
