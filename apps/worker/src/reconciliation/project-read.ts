// What a run reads of one project before it works a ticket (spec/parts/06-reconciliation.md
// step 1; spec/acceptance/06-reconciliation.md section A; BACKLOG C70; ADR-352): its settings,
// its setup as it stands now, every field event that isn't void, and what the worker concluded
// before. Everything is read as it is, flat, and put together here: each field event is handed to
// the domain's checks with what they read of it (its certification by number, its site, its
// receipt with every disposal that points at it, its ROE).
//
// Pricing's setup is read with it (ADR-359): the rules as packages/db's RuleRows reads them, the
// one reading setup checks them from too, the contracts with their primes, and every pay item
// with its live rates and crew-day steps, archived ones too (a rule that names one never runs).
//
// Never read: a record in quarantine (ADR-022: a second field event of one kind is no ticket's
// until a person resolves it), an incident, a drop-off log (ADR-236: neither is a ticket's field
// event).
import { RuleRows, type Database, type Prisma, type TicketStatus } from '@open-adms/db';
import {
  SizeBands,
  type BuiltInKey,
  type CarriedTicketFound,
  type CertificationPhotograph,
  type CheckedCertification,
  type CheckedFieldEvent,
  type CheckedKindOfWork,
  type CheckedRoe,
  type CheckedSite,
  type CheckedSurvey,
  type ControlRangeRead,
  type Fact,
  type FlagStanding,
  type GpsPoint,
  type MapGeometry,
  type MapShape,
  type MileageSource,
  type Named,
  type PlacedFieldEvent,
  type PricedPayItem,
  type ProjectMap,
  type QuantifiedFieldEvent,
  type ReceiptDisposal,
  type RoeFieldEvent,
  type RuleContract,
  type RuleEntry,
  type RuleFieldEvent,
  type UnitRateFieldEvent,
  type UnitRatePayItem,
} from '@open-adms/domain';

// A field event as the worker reads it: what every check reads of it, and what the worker wrote
// on it before.
export interface WorkerFieldEvent
  extends
    CheckedFieldEvent,
    PlacedFieldEvent,
    QuantifiedFieldEvent,
    UnitRateFieldEvent,
    RoeFieldEvent,
    RuleFieldEvent {
  readonly status: TicketStatus;
  readonly reconciledAt: Date | null;
  readonly zoneId: string | null;
  readonly mapVersionId: string | null;
  readonly workedOutPayItemId: string | null;
  // A split property's estimate, in CY, as the column keeps it.
  readonly estimateCy: string | null;
  // The numbers of the tickets a collection lists as carried.
  readonly carriedTicketNumbers: readonly string[];
  // A stump's "half or more of the root ball exposed"; none where the monitor wasn't asked.
  readonly rootBallHalfExposed: boolean | null;
}

// A certification of the project, with its record's id, whose work it is and its photographs.
export interface ReadCertification extends CheckedCertification {
  readonly id: string;
  readonly primeId: string;
  readonly firstTierSubId: string | null;
  readonly secondTierSubId: string | null;
  readonly photographs: readonly CertificationPhotograph[];
}

// A site of the project, with what pricing reads of it (ADR-222, 311).
export interface ReadSite extends CheckedSite {
  readonly chargesTippingFee: boolean;
  // The pay items linked to it as its tipping fee; a link taken off isn't one.
  readonly tippingFeePayItemIds: readonly string[];
}

// What pricing reads of the firm's setup, as it stands now.
export interface PricingRead {
  readonly rules: readonly RuleEntry[];
  readonly contracts: readonly RuleContract[];
  // The project's primes, each by its contractor's name as recorded.
  readonly primes: readonly Named[];
  readonly payItems: readonly PricedPayItem[];
  // Every zone of every version of the project's map (ADR-141).
  readonly zones: readonly Named[];
}

export interface ReadSurvey extends CheckedSurvey {
  readonly madeAt: Date;
}

// A collection's row of a completed load or haul-out, as it stands.
export interface CollectionRowRead {
  readonly id: string;
  readonly completedId: string;
  readonly collectionEventId: string;
  readonly splitSuffix: string;
  readonly pileLoadCall: number | null;
  readonly shareFraction: string;
  readonly volumeCy: string | null;
  readonly weightTons: string | null;
  readonly mileage: string | null;
  readonly mileageSource: MileageSource | null;
  readonly snapped: GpsPoint | null;
  readonly snappedAddress: string | null;
  readonly mapDataDate: string | null;
  readonly mapDataSha256: string | null;
  readonly dissolvedAt: Date | null;
}

// A completed load or haul-out, as it stands.
export interface CompletedRead {
  readonly id: string;
  readonly ticketNumber: string;
  readonly disposalEventId: string;
  readonly quantitySource: 'LOAD_CALL' | 'SCALE_WEIGHT' | 'CARRIED_TICKETS';
  readonly capacityCy: number | null;
  readonly loadCall: number | null;
  readonly volumeCy: string | null;
  readonly weightTons: string | null;
  readonly weightIsShare: boolean;
  readonly carriedCount: number | null;
  readonly dissolvedAt: Date | null;
  readonly collections: readonly CollectionRowRead[];
}

// A flag that stands (not cleared), with what it is on.
export interface StandingFlag extends FlagStanding {
  readonly workflow: 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE' | null;
  readonly ticketNumber: string | null;
  readonly certificationId: string | null;
  readonly disposalSiteId: string | null;
  readonly surveyId: string | null;
}

export interface ProjectSnapshot {
  readonly project: {
    readonly id: string;
    readonly timeZone: string;
    readonly activeFrom: string;
    readonly activeTo: string | null;
    readonly allowSplitLoads: boolean;
    readonly loadCallLowLimit: number | null;
    readonly loadCallHighLimit: number | null;
    readonly stumpCheckRootBallWider: boolean;
    readonly stumpCheckFillNeedsExposure: boolean;
    readonly stumpFillDepthInches: number;
    readonly siteCircleMeters: number;
    readonly requiresRoe: boolean;
  };
  // None on a project that generates its numbers.
  readonly controlRanges: readonly ControlRangeRead[] | null;
  readonly certifications: readonly ReadCertification[];
  readonly sites: readonly ReadSite[];
  readonly map: ProjectMap | null;
  readonly unitRatePayItems: readonly UnitRatePayItem[];
  readonly pricing: PricingRead;
  readonly surveys: readonly ReadSurvey[];
  // Every field event of the project that isn't void. A voided ticket is out of the run until a
  // person unvoids it, whoever voided it, a person or a rule (the user, ADR-360).
  readonly fieldEvents: readonly WorkerFieldEvent[];
  readonly completedLoads: readonly CompletedRead[];
  readonly completedHaulOuts: readonly CompletedRead[];
  readonly standingFlags: readonly StandingFlag[];
}

interface Decimal {
  toFixed(places: number): string;
  toString(): string;
}

const day = (date: Date): string => date.toISOString().slice(0, 10);
const dayOrNone = (date: Date | null): string | null => (date === null ? null : day(date));
const fix = (latitude: Decimal | null, longitude: Decimal | null): GpsPoint | null =>
  latitude === null || longitude === null
    ? null
    : { latitude: latitude.toFixed(8), longitude: longitude.toFixed(8) };
const text = (amount: Decimal | null): string | null =>
  amount === null ? null : amount.toString();
const fixed = (amount: Decimal | null, places: number): string | null =>
  amount === null ? null : amount.toFixed(places);

// A shape as the database keeps it: its GeoJSON geometry and its box (ADR-311).
const shapeOf = (row: {
  readonly geometry: Prisma.JsonValue;
  readonly westLongitude: Decimal;
  readonly southLatitude: Decimal;
  readonly eastLongitude: Decimal;
  readonly northLatitude: Decimal;
}): MapShape => ({
  geometry: row.geometry as unknown as MapGeometry,
  box: {
    westLongitude: row.westLongitude.toFixed(8),
    southLatitude: row.southLatitude.toFixed(8),
    eastLongitude: row.eastLongitude.toFixed(8),
    northLatitude: row.northLatitude.toFixed(8),
  },
});

const byId = <T extends { readonly id: string }>(rows: readonly T[]): Map<string, T> =>
  new Map(rows.map((row) => [row.id, row]));

function grouped<T>(rows: readonly T[], key: (row: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const at = key(row);
    if (at === null) continue;
    const group = groups.get(at);
    if (group === undefined) groups.set(at, [row]);
    else group.push(row);
  }
  return groups;
}

export class ProjectRead {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async of(projectId: string): Promise<ProjectSnapshot> {
    const { db } = this;
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    const programType = await db.programType.findUniqueOrThrow({
      where: { id: project.programTypeId },
    });
    const controlRanges =
      project.ticketNumberSource === 'CONTROL'
        ? (
            await db.controlRange.findMany({
              where: { projectId, archivedAt: null, series: { in: ['LOAD', 'HAUL_OUT'] } },
              orderBy: [{ series: 'asc' }, { firstNumber: 'asc' }],
            })
          ).map((range) => ({
            series: range.series as ControlRangeRead['series'],
            firstNumber: range.firstNumber,
            lastNumber: range.lastNumber,
          }))
        : null;

    const certifications = await this.certifications(projectId);
    const sites = await this.sites(projectId);
    const map = await this.map(projectId);
    const unitRatePayItems = (
      await db.payItem.findMany({
        where: { projectId, kindOfWorkId: { not: null } },
        orderBy: { code: 'asc' },
      })
    ).map((payItem) => ({
      id: payItem.id,
      code: payItem.code,
      bandFrom: payItem.bandFrom === null ? null : Number(payItem.bandFrom),
      bandTo: payItem.bandTo === null ? null : Number(payItem.bandTo),
      archived: payItem.archivedAt !== null,
      payableTypeId: payItem.payableTypeId,
      gpsRequired: payItem.gpsRequired,
      measurementRequired: payItem.measurementRequired,
      decimalsAllowed: payItem.decimalsAllowed,
      photosRequired: payItem.photosRequired,
    }));

    const roes = await this.roes(projectId);
    const surveyWorkTypes = byId(await db.surveyWorkType.findMany());
    const surveys = (
      await db.survey.findMany({
        where: { projectId },
        orderBy: [{ madeAt: 'asc' }, { id: 'asc' }],
      })
    ).map((survey) => ({
      id: survey.id,
      madeAt: survey.madeAt,
      roeNumber: survey.roeNumber,
      roe: survey.roeId === null ? null : (roes.get(survey.roeId) ?? null),
      workTypeKey: (surveyWorkTypes.get(survey.workTypeId)?.key ??
        null) as BuiltInKey<'surveyWorkType'> | null,
    }));

    const fieldEvents = await this.fieldEvents(projectId, certifications, sites, roes);
    return {
      project: {
        id: project.id,
        timeZone: project.timeZone,
        activeFrom: day(project.activeFrom),
        activeTo: dayOrNone(project.activeTo),
        allowSplitLoads: project.allowSplitLoads,
        loadCallLowLimit: project.loadCallLowLimit,
        loadCallHighLimit: project.loadCallHighLimit,
        stumpCheckRootBallWider: project.stumpCheckRootBallWider,
        stumpCheckFillNeedsExposure: project.stumpCheckFillNeedsExposure,
        stumpFillDepthInches: project.stumpFillDepthInches,
        siteCircleMeters: project.siteCircleMeters,
        requiresRoe: programType.requiresRoe,
      },
      controlRanges,
      certifications,
      sites,
      map,
      unitRatePayItems,
      pricing: await this.pricing(projectId),
      surveys,
      fieldEvents,
      completedLoads: await this.completedLoads(projectId),
      completedHaulOuts: await this.completedHaulOuts(projectId),
      standingFlags: (
        await db.flag.findMany({ where: { projectId, clearedAt: null }, orderBy: { id: 'asc' } })
      ).map((flag) => ({
        id: flag.id,
        code: flag.code,
        fieldEventId: flag.fieldEventId,
        factsSha256: flag.factsSha256,
        workflow: flag.workflow,
        ticketNumber: flag.ticketNumber,
        certificationId: flag.certificationId,
        disposalSiteId: flag.disposalSiteId,
        surveyId: flag.surveyId,
      })),
    };
  }

  // The project's certifications, each with what replaced it and its photographs.
  private async certifications(projectId: string): Promise<ReadCertification[]> {
    const rows = await this.db.certification.findMany({
      where: { projectId },
      orderBy: { certNumber: 'asc' },
    });
    const replacedBy = new Map(
      rows.flatMap((row) => (row.replacesId === null ? [] : [[row.replacesId, row] as const])),
    );
    const photographs = grouped(
      await this.db.photo.findMany({
        where: { projectId, certificationId: { not: null } },
        orderBy: { id: 'asc' },
      }),
      (photo) => photo.certificationId,
    );
    return rows.map((row) => {
      const newer = replacedBy.get(row.id);
      return {
        id: row.id,
        certNumber: row.certNumber,
        kind: row.kind,
        capacityCy: row.capacityCy,
        primeId: row.primeId,
        firstTierSubId: row.firstTierSubId,
        secondTierSubId: row.secondTierSubId,
        tagExpiry: dayOrNone(row.tagExpiry),
        revokedFrom: dayOrNone(row.revokedFrom),
        replacedBy:
          newer === undefined
            ? null
            : { certNumber: newer.certNumber, certifiedAt: newer.certifiedAt },
        photographs: (photographs.get(row.id) ?? []).map((photo) => ({
          view: photo.view,
          archivedAt: photo.archivedAt,
        })),
      };
    });
  }

  // The project's sites, each with its own shape's current version where it has one.
  private async sites(projectId: string): Promise<ReadSite[]> {
    const rows = await this.db.disposalSite.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
    });
    const areas = new Map<string, { versionId: string; shape: MapShape }>();
    const versions = await this.db.siteAreaVersion.findMany({
      where: { siteId: { in: rows.map((row) => row.id) } },
      orderBy: { version: 'asc' },
    });
    // The newest version of each is the one that stands.
    for (const version of versions) {
      areas.set(version.siteId, { versionId: version.id, shape: shapeOf(version) });
    }
    const fees = grouped(
      await this.db.disposalSiteTippingFee.findMany({
        where: { projectId, archivedAt: null },
        orderBy: { id: 'asc' },
      }),
      (fee) => fee.siteId,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      siteTypeId: row.siteTypeId,
      siteTypeKey: row.siteTypeKey as BuiltInKey<'siteType'> | null,
      takesLoads: row.takesLoads,
      haulOutsLeaveHere: row.haulOutsLeaveHere,
      ineligibleSite: row.ineligibleSite,
      permitNumber: row.permitNumber,
      gps: { latitude: row.latitude.toFixed(8), longitude: row.longitude.toFixed(8) },
      activationDate: day(row.activationDate),
      closeDate: dayOrNone(row.closeDate),
      area: areas.get(row.id) ?? null,
      chargesTippingFee: row.chargesTippingFee,
      tippingFeePayItemIds: (fees.get(row.id) ?? []).map((fee) => fee.payItemId),
    }));
  }

  // What the rules run on: the project's rules, its contracts, its primes, and every pay item
  // with the rate each prime has on it now.
  private async pricing(projectId: string): Promise<PricingRead> {
    const { db } = this;
    const rules = await db.$read((tx) => new RuleRows(tx, projectId).entries());
    const contracts = await db.contract.findMany({ where: { projectId }, orderBy: { id: 'asc' } });
    const places = await db.projectContractor.findMany({
      where: { projectId, asPrimeId: { not: null } },
      orderBy: { id: 'asc' },
    });
    const contractors = byId(
      await db.contractor.findMany({
        where: { id: { in: places.map((place) => place.contractorId) } },
      }),
    );
    const rates = grouped(
      await db.payItemRate.findMany({
        where: { projectId, archivedAt: null },
        orderBy: { id: 'asc' },
      }),
      (rate) => rate.payItemId,
    );
    const steps = grouped(
      await db.payItemCrewDayStep.findMany({
        where: { payItem: { projectId }, archivedAt: null },
        orderBy: { fromHours: 'asc' },
      }),
      (step) => step.payItemId,
    );
    const payItems = await db.payItem.findMany({ where: { projectId }, orderBy: { code: 'asc' } });
    const zones = await db.zone.findMany({
      where: { mapVersion: { projectId } },
      orderBy: { id: 'asc' },
    });
    return {
      rules,
      contracts: contracts.map((contract) => ({ id: contract.id, primeId: contract.primeId })),
      primes: places.map((place) => ({
        id: place.contractorId,
        name: contractors.get(place.contractorId)?.name ?? '',
      })),
      payItems: payItems.map((payItem) => ({
        id: payItem.id,
        code: payItem.code,
        unit: payItem.unit,
        countIsAlwaysOne: payItem.countIsAlwaysOne,
        quantityFromCarriedTickets: payItem.quantityFromCarriedTickets,
        crewTimeConversion: payItem.crewTimeConversion,
        crewDayHours: text(payItem.crewDayHours),
        crewDaySteps: (steps.get(payItem.id) ?? []).map((step) => ({
          fromHours: step.fromHours.toString(),
          toHours: step.toHours.toString(),
          quantity: step.quantity.toString(),
        })),
        rates: (rates.get(payItem.id) ?? []).map((rate) => ({
          primeId: rate.primeId,
          rate: rate.rate.toFixed(4),
        })),
      })),
      zones: zones.map((zone) => ({ id: zone.id, name: zone.name })),
    };
  }

  // The project's map as it stands: its newest version, its zones in the order they were
  // written with it.
  private async map(projectId: string): Promise<ProjectMap | null> {
    const version = await this.db.mapVersion.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    if (version === null) return null;
    const zones = await this.db.zone.findMany({
      where: { mapVersionId: version.id },
      orderBy: { id: 'asc' },
    });
    return {
      versionId: version.id,
      boundary: shapeOf({ ...version, geometry: version.boundary }),
      zones: zones.map((zone) => ({ id: zone.id, name: zone.name, shape: shapeOf(zone) })),
    };
  }

  // The project's ROEs, each with the scope picks that haven't been taken off.
  private async roes(projectId: string): Promise<Map<string, CheckedRoe>> {
    const rows = await this.db.roe.findMany({ where: { projectId } });
    const scope = grouped(
      await this.db.roeScopeItem.findMany({ where: { projectId, archivedAt: null } }),
      (item) => item.roeId,
    );
    return new Map(
      rows.map((row) => {
        const picks = scope.get(row.id) ?? [];
        return [
          row.id,
          {
            id: row.id,
            roeNumber: row.roeNumber,
            signed: row.signed,
            scopeDebrisTypeIds: picks.flatMap((pick) =>
              pick.formDebrisTypeId === null ? [] : [pick.formDebrisTypeId],
            ),
            scopePayableTypeIds: picks.flatMap((pick) =>
              pick.payableTypeId === null ? [] : [pick.payableTypeId],
            ),
          },
        ];
      }),
    );
  }

  private async fieldEvents(
    projectId: string,
    certifications: readonly ReadCertification[],
    sites: readonly ReadSite[],
    roes: ReadonlyMap<string, CheckedRoe>,
  ): Promise<WorkerFieldEvent[]> {
    const { db } = this;
    const rows = await db.fieldEvent.findMany({
      where: { projectId, status: { not: 'VOID' } },
      orderBy: { id: 'asc' },
    });
    const ids = rows.map((row) => row.id);
    const idsOf = (pick: (row: (typeof rows)[number]) => string | null): string[] => [
      ...new Set(rows.flatMap((row) => pick(row) ?? [])),
    ];

    const items = grouped(
      await db.fieldEventItem.findMany({
        where: { fieldEventId: { in: ids } },
        orderBy: { id: 'asc' },
      }),
      (item) => item.fieldEventId,
    );
    const carried = grouped(
      await db.carriedTicket.findMany({
        where: { fieldEventId: { in: ids } },
        orderBy: { carriedTicketNumber: 'asc' },
      }),
      (ticket) => ticket.fieldEventId,
    );
    const photographs = grouped(
      await db.photo.findMany({ where: { projectId, fieldEventId: { not: null } } }),
      (photo) => photo.fieldEventId,
    );
    const itemNames = byId(await db.itemName.findMany());
    const kindsOfWork = byId(await db.kindOfWork.findMany());
    const payableTypes = byId(await db.payableType.findMany());
    const reasons = byId(await db.reason.findMany());
    const debrisTypes = byId(await db.debrisType.findMany());
    const fieldTags = byId(await db.fieldTag.findMany({ where: { projectId } }));
    const formDebrisTypes = byId(
      await db.formDebrisType.findMany({
        where: { id: { in: idsOf((row) => row.formDebrisTypeId) } },
      }),
    );
    const people = byId(
      await db.user.findMany({ where: { id: { in: idsOf((row) => row.createdById) } } }),
    );
    const devices = byId(
      await db.device.findMany({ where: { id: { in: idsOf((row) => row.deviceId) } } }),
    );
    const assignments = byId(
      await db.assignment.findMany({ where: { id: { in: idsOf((row) => row.assignmentId) } } }),
    );
    const receipts = byId(
      await db.scaleReceipt.findMany({
        where: { id: { in: idsOf((row) => row.scaleReceiptId) } },
      }),
    );

    const certificationOf = new Map(certifications.map((each) => [each.certNumber, each]));
    const siteOf = byId(sites);
    const named = (row: { id: string; name: string } | undefined): Named | null =>
      row === undefined ? null : { id: row.id, name: row.name };
    const debrisTypeOf = (formDebrisTypeId: string | null): Named | null => {
      if (formDebrisTypeId === null) return null;
      const entry = formDebrisTypes.get(formDebrisTypeId);
      if (entry === undefined) return null;
      // The entry on the form is what is compared; its name is the library's (ADR-207, 226).
      return { id: entry.id, name: debrisTypes.get(entry.debrisTypeId)?.name ?? '' };
    };

    // Every disposal that points at a receipt, of every ticket that isn't void: nothing else
    // says two containers were weighed together (ADR-038, 114).
    const disposalsOn = new Map<string, ReceiptDisposal[]>();
    for (const row of rows) {
      if (row.scaleReceiptId === null) continue;
      const pointing: ReceiptDisposal = {
        fieldEventId: row.id,
        ticketNumber: row.ticketNumber,
        capacityCy: certificationOf.get(row.certNumber)?.capacityCy ?? null,
        debrisType: debrisTypeOf(row.formDebrisTypeId),
      };
      const others = disposalsOn.get(row.scaleReceiptId);
      if (others === undefined) disposalsOn.set(row.scaleReceiptId, [pointing]);
      else others.push(pointing);
    }

    return rows.map((row) => {
      const device = row.deviceId === null ? undefined : devices.get(row.deviceId);
      const receipt = row.scaleReceiptId === null ? undefined : receipts.get(row.scaleReceiptId);
      const kindOfWork = row.kindOfWorkId === null ? undefined : kindsOfWork.get(row.kindOfWorkId);
      return {
        id: row.id,
        projectId: row.projectId,
        workflow: row.workflow,
        kind: row.kind,
        ticketNumber: row.ticketNumber,
        splitSuffix: row.splitSuffix,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        certNumber: row.certNumber,
        certKeyedByHand: row.certKeyedByHand,
        typedCapacityCy: row.typedCapacityCy,
        debrisType: debrisTypeOf(row.formDebrisTypeId),
        fieldTag: row.fieldTagId === null ? null : named(fieldTags.get(row.fieldTagId)),
        address: row.address,
        rootBallHalfExposed: row.rootBallHalfExposed,
        numberTyped: row.numberTyped,
        numberTypedReason:
          row.numberTypedReasonId === null ? null : named(reasons.get(row.numberTypedReasonId)),
        source: row.source,
        createdBy: row.createdById === null ? null : named(people.get(row.createdById)),
        createdReason:
          row.createdReasonId === null ? null : named(reasons.get(row.createdReasonId)),
        receivedAt: row.receivedAt,
        deviceUtcOffsetMinutes: row.deviceUtcOffsetMinutes,
        device:
          device === undefined
            ? null
            : { enrolledAt: device.enrolledAt, outOfServiceAt: device.outOfServiceAt },
        // The difference at the sync is kept with the sync's own record, Phase 2's (ADR-344).
        clockOffAtSyncMinutes: null,
        carriedCount: row.carriedCount,
        loadCall: row.loadCall,
        scaleReceiptId: row.scaleReceiptId,
        kindOfWorkId: row.kindOfWorkId,
        unreadableGps: row.unreadableGps as Fact | null,
        assignmentProjectId:
          row.assignmentId === null ? null : (assignments.get(row.assignmentId)?.projectId ?? null),
        endGps: fix(row.endLatitude, row.endLongitude),
        site: row.siteId === null ? null : (siteOf.get(row.siteId) ?? null),
        scaleReceipt:
          receipt === undefined
            ? null
            : {
                id: receipt.id,
                receiptNumber: receipt.receiptNumber,
                weights: {
                  grossWeightLb: text(receipt.grossWeightLb),
                  tareWeightLb: text(receipt.tareWeightLb),
                  netWeightLb: text(receipt.netWeightLb),
                  netWeightTons: text(receipt.netWeightTons),
                },
                disposals: disposalsOn.get(receipt.id) ?? [],
              },
        kindOfWork:
          kindOfWork === undefined
            ? null
            : ({
                id: kindOfWork.id,
                name: kindOfWork.name,
                key: kindOfWork.key as BuiltInKey<'kindOfWork'> | null,
                countShape: kindOfWork.countShape,
              } satisfies CheckedKindOfWork),
        payableType: row.payableTypeId === null ? null : named(payableTypes.get(row.payableTypeId)),
        unitCount: text(row.unitCount),
        measurement:
          row.measurementInches === null || row.measuredAs === null
            ? null
            : { inches: Number(row.measurementInches), measuredAs: row.measuredAs },
        rootBallInches: row.rootBallInches === null ? null : Number(row.rootBallInches),
        surveyNumber: row.surveyNumber,
        markedIneligible: row.markedIneligible,
        photographs: (photographs.get(row.id) ?? []).map((photo) => ({
          archivedAt: photo.archivedAt,
        })),
        items: (items.get(row.id) ?? []).map((item) => ({
          itemName: named(itemNames.get(item.itemNameId)) ?? { id: item.itemNameId, name: '' },
          quantity: item.quantity.toString(),
        })),
        roeNumber: row.roeNumber,
        roe: row.roeId === null ? null : (roes.get(row.roeId) ?? null),
        status: row.status,
        reconciledAt: row.reconciledAt,
        zoneId: row.zoneId,
        mapVersionId: row.mapVersionId,
        workedOutPayItemId: row.workedOutPayItemId,
        estimateCy: fixed(row.estimateCy, 1),
        carriedTicketNumbers: (carried.get(row.id) ?? []).map(
          (ticket) => ticket.carriedTicketNumber,
        ),
      };
    });
  }

  private async completedLoads(projectId: string): Promise<CompletedRead[]> {
    const rows = await this.db.completedLoad.findMany({
      where: { projectId },
      orderBy: { id: 'asc' },
    });
    const collections = grouped(
      await this.db.completedLoadCollection.findMany({
        where: { projectId },
        orderBy: { id: 'asc' },
      }),
      (row) => row.completedLoadId,
    );
    return rows.map((row) => ({
      ...ProjectRead.completed(row),
      carriedCount: row.carriedCount,
      collections: (collections.get(row.id) ?? []).map((each) => ({
        ...ProjectRead.collectionRow(each),
        completedId: each.completedLoadId,
        pileLoadCall: null,
      })),
    }));
  }

  private async completedHaulOuts(projectId: string): Promise<CompletedRead[]> {
    const rows = await this.db.completedHaulOut.findMany({
      where: { projectId },
      orderBy: { id: 'asc' },
    });
    const collections = grouped(
      await this.db.completedHaulOutCollection.findMany({
        where: { projectId },
        orderBy: { id: 'asc' },
      }),
      (row) => row.completedHaulOutId,
    );
    return rows.map((row) => ({
      ...ProjectRead.completed(row),
      carriedCount: null,
      collections: (collections.get(row.id) ?? []).map((each) => ({
        ...ProjectRead.collectionRow(each),
        completedId: each.completedHaulOutId,
        pileLoadCall: each.pileLoadCall,
      })),
    }));
  }

  private static completed(row: {
    readonly id: string;
    readonly ticketNumber: string;
    readonly disposalEventId: string;
    readonly quantitySource: CompletedRead['quantitySource'];
    readonly capacityCy: number | null;
    readonly loadCall: number | null;
    readonly volumeCy: Decimal | null;
    readonly weightTons: Decimal | null;
    readonly weightIsShare: boolean;
    readonly dissolvedAt: Date | null;
  }): Omit<CompletedRead, 'carriedCount' | 'collections'> {
    return {
      id: row.id,
      ticketNumber: row.ticketNumber,
      disposalEventId: row.disposalEventId,
      quantitySource: row.quantitySource,
      capacityCy: row.capacityCy,
      loadCall: row.loadCall,
      volumeCy: fixed(row.volumeCy, 2),
      weightTons: fixed(row.weightTons, 4),
      weightIsShare: row.weightIsShare,
      dissolvedAt: row.dissolvedAt,
    };
  }

  private static collectionRow(row: {
    readonly id: string;
    readonly collectionEventId: string;
    readonly splitSuffix: string;
    readonly shareFraction: Decimal;
    readonly volumeCy: Decimal | null;
    readonly weightTons: Decimal | null;
    readonly mileage: Decimal | null;
    readonly mileageSource: MileageSource | null;
    readonly snappedLatitude: Decimal | null;
    readonly snappedLongitude: Decimal | null;
    readonly snappedAddress: string | null;
    readonly mapDataDate: Date | null;
    readonly mapDataSha256: string | null;
    readonly dissolvedAt: Date | null;
  }): Omit<CollectionRowRead, 'completedId' | 'pileLoadCall'> {
    return {
      id: row.id,
      collectionEventId: row.collectionEventId,
      splitSuffix: row.splitSuffix,
      shareFraction: row.shareFraction.toFixed(8),
      volumeCy: fixed(row.volumeCy, 2),
      weightTons: fixed(row.weightTons, 4),
      mileage: fixed(row.mileage, 4),
      mileageSource: row.mileageSource,
      snapped: fix(row.snappedLatitude, row.snappedLongitude),
      snappedAddress: row.snappedAddress,
      mapDataDate: dayOrNone(row.mapDataDate),
      mapDataSha256: row.mapDataSha256,
      dissolvedAt: row.dissolvedAt,
    };
  }
}

// A ticket a load carries, as found among the project's unit rate tickets (ADR-192, 204): a
// stump ticket's diameter two feet up; the items on an itemised ticket, one on any other.
export function carriedTicketFound(event: WorkerFieldEvent): CarriedTicketFound {
  const isStump = event.kindOfWork?.key === 'STUMPS';
  const itemised = event.kindOfWork?.countShape === 'ITEM_COUNTS';
  return {
    ticketNumber: event.ticketNumber,
    stumpDiameterInches:
      isStump && event.measurement !== null ? SizeBands.diameter(event.measurement) : null,
    itemCount: itemised ? event.items.reduce((sum, item) => sum + Number(item.quantity), 0) : 1,
  };
}
