// Debris totals (REQ-409; spec/FROM-BUILD-1.md §9, the user: "totals for debris, not costs or
// billable amounts"; spec/parts/09): what a project moved over a range of calendar days in its
// time zone, grouped as the email summary groups it, read from the project as it stands and kept
// nowhere ("think of them like when we generated a PDF to print").
//
// - **Never money.** No rate, amount or cost is read here, so none can reach a report.
// - **What counts, and on which day** (agent defaults, in BUILD.md): a load or a haul-out counts
//   once its completed record stands, on its collection's day (a preload on the day it was
//   collected, ADR-053), at the cubic yards and tons its property or pile was worked out at; a
//   split is one load whatever its properties; a unit rate ticket on its own field event's day.
//   A void ticket counts nowhere. A load's debris type is the one its collection named; a
//   haul-out is counted at the site it was dumped at.
// - **Equipment** is each truck, trailer or crew whose badge a monitor scanned for that work,
//   once, by its vehicle type or crew type as the firm's lists name it.
// - **Incidents**: filed in the range; open while nobody has set QC Approved or QC Void on them
//   (agent default). **Monitors on shift**: each person with an assignment on the project on a
//   day of the range, once.
// - **The filters** (debris type, site, contractor, workflow) narrow what is counted the way the
//   user's report asks ("only a specific debris stream, ticket type, site or contractor"): a
//   contractor matches a ticket whose certification names it as the prime or a sub.
// - **Limits** (C166): a range of at most `daysAtMost` days, read in one piece of work inside
//   `DATABASE_WORK_LONGEST_MS`; a wider one is refused in plain words.
import type { BrandAnswer, DebrisTotalsAnswer } from '@open-adms/contracts';
import { Prisma, type Database } from '@open-adms/db';
import type { WorkflowName } from '@open-adms/domain';

import { Branding } from '../firm/branding.ts';
import { FirmSettings } from '../firm/firm-settings.ts';
import { instantsOf, projectRead } from '../money/ledger.ts';
import { Refusal } from '../process/refusal.ts';
import { backOfficeReader } from '../review/review-reads.ts';

type Tx = Prisma.TransactionClient;
type Decimal = Prisma.Decimal;

// The widest range a report reads: a year and a day.
export const daysAtMost = 366;

export interface TotalsAsked {
  readonly from: string;
  readonly to: string;
  readonly workflow?: WorkflowName | undefined;
  readonly debrisTypeId?: string | undefined;
  readonly siteId?: string | undefined;
  readonly contractorId?: string | undefined;
}

// A place a field event was recorded at, for the report's map.
export interface MapPoint {
  readonly workflow: WorkflowName;
  readonly latitude: number;
  readonly longitude: number;
  // What it is grouped by on the map: its debris type, or its payable type.
  readonly group: string;
}

// What the report's map draws: the project's boundary and zones as its newest map holds them,
// its sites, and where the range's field events were recorded.
export interface ReportMap {
  readonly boundary: unknown;
  readonly zones: readonly { readonly name: string; readonly geometry: unknown }[];
  readonly sites: readonly {
    readonly name: string;
    readonly latitude: number;
    readonly longitude: number;
  }[];
  readonly points: readonly MapPoint[];
}

const zero = new Prisma.Decimal(0);
const exactOf = (value: Decimal, places = 2): string => value.toFixed(places);
const plus = (sum: Decimal, value: Decimal | null): Decimal =>
  value === null ? sum : sum.plus(value);
const numberOf = (value: Decimal | null): number | null =>
  value === null ? null : value.toNumber();

// The days from `from` to `to`, both counted.
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const at = new Date(`${from}T12:00:00Z`);
  const last = new Date(`${to}T12:00:00Z`);
  while (at <= last) {
    days.push(at.toISOString().slice(0, 10));
    at.setUTCDate(at.getUTCDate() + 1);
  }
  return days;
}

// A certification's kind of truck, trailer or crew, as the firm's lists name it.
const equipmentRead = {
  id: true,
  kind: true,
  vehicleTypeOther: true,
  vehicleType: { select: { name: true, position: true } },
  crewType: { select: { name: true, position: true } },
} as const;
type EquipmentRead = Prisma.CertificationGetPayload<{ select: typeof equipmentRead }>;

function equipmentOf(certifications: readonly (EquipmentRead | null)[]) {
  const counted = new Map<string, { crew: boolean; position: number; ids: Set<string> }>();
  for (const certification of certifications) {
    if (certification === null) continue;
    const crew = certification.kind === 'CREW';
    const named = crew ? certification.crewType : certification.vehicleType;
    const name = named?.name ?? certification.vehicleTypeOther ?? '';
    const kept = counted.get(name) ?? { crew, position: named?.position ?? 9999, ids: new Set() };
    kept.ids.add(certification.id);
    counted.set(name, kept);
  }
  return [...counted.entries()]
    .sort(([left, a], [right, b]) => a.position - b.position || left.localeCompare(right))
    .map(([name, kept]) => ({ name, crew: kept.crew, count: kept.ids.size }));
}

// A ticket's certification names the contractor as its prime or a sub.
const byContractor = (contractorId: string | undefined) =>
  contractorId === undefined
    ? {}
    : {
        certification: {
          OR: [
            { primeId: contractorId },
            { firstTierSubId: contractorId },
            { secondTierSubId: contractorId },
          ],
        },
      };

// A value of one of the firm's lists, in the list's own order; one a record doesn't name last.
interface Listed {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}
const listedOrder = (a: Listed | null, b: Listed | null): number =>
  a === null || b === null
    ? Number(a === null) - Number(b === null)
    : a.position - b.position || a.name.localeCompare(b.name);
const shown = (listed: Listed | null) =>
  listed === null ? null : { id: listed.id, name: listed.name };

const debrisRead = {
  formDebrisType: { select: { debrisType: { select: { id: true, name: true, position: true } } } },
} as const;

export class DebrisTotals {
  private readonly db: Database;
  // The Open ADMS release the daily report says it is built on.
  private readonly version: string;

  constructor(db: Database, version: string) {
    this.db = db;
    this.version = version;
  }

  read(readerId: string, projectId: string, asked: TotalsAsked): Promise<DebrisTotalsAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      return (await DebrisTotals.counted(tx, projectId, asked)).totals;
    });
  }

  // The totals, what the report's map draws, and where a reader writes, for the daily report.
  withMap(
    readerId: string,
    projectId: string,
    asked: TotalsAsked,
  ): Promise<{
    totals: DebrisTotalsAnswer;
    map: ReportMap;
    contactEmail: string | null;
    brand: BrandAnswer;
  }> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const { totals, points } = await DebrisTotals.counted(tx, projectId, asked);
      return {
        totals,
        map: await DebrisTotals.mapOf(tx, projectId, points),
        contactEmail: (await FirmSettings.of(tx)).reportContactEmail,
        brand: await Branding.in(tx, this.version),
      };
    });
  }

  private static async counted(tx: Tx, projectId: string, asked: TotalsAsked) {
    const { project, clock } = await projectRead(tx, projectId);
    const days = daysBetween(asked.from, asked.to);
    if (days.length > daysAtMost) {
      throw new Refusal(
        'BAD_REQUEST',
        400,
        `A report reads ${String(daysAtMost)} days at most: choose a shorter range.`,
      );
    }
    const range = instantsOf(clock, asked);
    if (range === null) throw new Refusal('BAD_REQUEST', 400, 'Not a calendar day.');
    const wanted = (workflow: WorkflowName) =>
      asked.workflow === undefined || asked.workflow === workflow;
    const named = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        client: { select: { name: true } },
        declarationEvent: { select: { name: true, reference: true } },
        programType: { select: { name: true } },
        forms: {
          where: { archivedAt: null, documentType: { in: ['LOAD', 'HAUL_OUT', 'UNIT_RATE'] } },
          orderBy: { createdAt: 'asc' },
          select: { name: true, documentType: true },
        },
      },
    });
    const formNamed = (type: 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE', otherwise: string) =>
      named.forms.find((form) => form.documentType === type)?.name ?? otherwise;
    const collected = {
      endedAt: range,
      status: { not: 'VOID' as const },
      ...(asked.debrisTypeId === undefined
        ? {}
        : { formDebrisType: { debrisTypeId: asked.debrisTypeId } }),
    };
    const dumped = {
      ...(asked.siteId === undefined ? {} : { siteId: asked.siteId }),
      ...byContractor(asked.contractorId),
    };
    const pieceRead = {
      completedLoadId: true,
      volumeCy: true,
      weightTons: true,
      collectionEvent: {
        select: {
          endedAt: true,
          endLatitude: true,
          endLongitude: true,
          certification: { select: equipmentRead },
          ...debrisRead,
        },
      },
    } as const;
    const loads = wanted('LOAD')
      ? await tx.completedLoadCollection.findMany({
          where: {
            projectId,
            dissolvedAt: null,
            completedLoad: { dissolvedAt: null, disposalEvent: dumped },
            collectionEvent: collected,
          },
          select: pieceRead,
        })
      : [];
    const haulOuts = wanted('HAUL_OUT')
      ? await tx.completedHaulOutCollection.findMany({
          where: {
            projectId,
            dissolvedAt: null,
            completedHaulOut: { dissolvedAt: null, disposalEvent: dumped },
            collectionEvent: collected,
          },
          select: {
            completedHaulOutId: true,
            volumeCy: true,
            weightTons: true,
            completedHaulOut: {
              select: {
                disposalEvent: { select: { site: { select: { id: true, name: true } } } },
              },
            },
            collectionEvent: pieceRead.collectionEvent,
          },
        })
      : [];
    const unitRate =
      wanted('UNIT_RATE') && asked.debrisTypeId === undefined
        ? await tx.fieldEvent.findMany({
            where: {
              projectId,
              kind: 'UNIT_RATE',
              status: { not: 'VOID' },
              endedAt: range,
              ...dumped,
            },
            select: {
              endedAt: true,
              endLatitude: true,
              endLongitude: true,
              unitCount: true,
              items: { where: { archivedAt: null }, select: { quantity: true } },
              certification: { select: equipmentRead },
              payableType: { select: { id: true, name: true, position: true } },
              kindOfWork: { select: { countShape: true } },
              payItem: { select: { id: true, code: true, description: true } },
              workedOutPayItem: { select: { id: true, code: true, description: true } },
            },
          })
        : [];

    // Loads by debris type: each completed load once, its properties' yards and tons summed.
    const debrisOf = (event: {
      formDebrisType: { debrisType: { id: string; name: string; position: number } } | null;
    }) => event.formDebrisType?.debrisType ?? null;
    const loadRows = new Map<
      string,
      { debrisType: Listed | null; loads: Set<string>; cy: Decimal; tons: Decimal }
    >();
    for (const piece of loads) {
      const debrisType = debrisOf(piece.collectionEvent);
      const key = debrisType?.id ?? '';
      const row = loadRows.get(key) ?? {
        debrisType,
        loads: new Set<string>(),
        cy: zero,
        tons: zero,
      };
      row.loads.add(piece.completedLoadId);
      row.cy = plus(row.cy, piece.volumeCy);
      row.tons = plus(row.tons, piece.weightTons);
      loadRows.set(key, row);
    }
    const haulOutRows = new Map<
      string,
      {
        site: { id: string; name: string } | null;
        debrisType: Listed | null;
        loads: Set<string>;
        cy: Decimal;
        tons: Decimal;
      }
    >();
    for (const piece of haulOuts) {
      const site = piece.completedHaulOut.disposalEvent.site;
      const debrisType = debrisOf(piece.collectionEvent);
      const key = `${site?.id ?? ''} ${debrisType?.id ?? ''}`;
      const row = haulOutRows.get(key) ?? {
        site,
        debrisType,
        loads: new Set<string>(),
        cy: zero,
        tons: zero,
      };
      row.loads.add(piece.completedHaulOutId);
      row.cy = plus(row.cy, piece.volumeCy);
      row.tons = plus(row.tons, piece.weightTons);
      haulOutRows.set(key, row);
    }
    const unitsOf = (event: (typeof unitRate)[number]): Decimal =>
      event.unitCount ?? event.items.reduce<Decimal>((sum, item) => sum.plus(item.quantity), zero);
    const unitRows = new Map<
      string,
      {
        payableType: Listed | null;
        payItem: { id: string; code: string; description: string } | null;
        tickets: number;
        units: Decimal;
        hours: boolean;
      }
    >();
    for (const event of unitRate) {
      const payItem = event.workedOutPayItem ?? event.payItem;
      const payableType = event.payableType;
      const hours = event.kindOfWork?.countShape === 'ITEM_HOURS';
      const key = `${payableType?.id ?? ''} ${payItem?.id ?? ''} ${String(hours)}`;
      const row = unitRows.get(key) ?? { payableType, payItem, tickets: 0, units: zero, hours };
      row.tickets += 1;
      row.units = row.units.plus(unitsOf(event));
      unitRows.set(key, row);
    }

    const incidents = await tx.incident.findMany({
      where: { projectId, madeAt: range },
      select: { qcMarks: { select: { status: true } } },
    });
    const onShift = await tx.assignment.findMany({
      where: {
        projectId,
        archivedAt: null,
        workDate: {
          gte: new Date(`${asked.from}T00:00:00Z`),
          lte: new Date(`${asked.to}T00:00:00Z`),
        },
      },
      select: { personId: true },
      distinct: ['personId'],
    });

    const counted = (hours: boolean) =>
      unitRate.filter((event) => (event.kindOfWork?.countShape === 'ITEM_HOURS') === hours);
    const sumOf = <T>(rows: readonly T[], of: (row: T) => Decimal): Decimal =>
      rows.reduce((sum, row) => sum.plus(of(row)), zero);
    const loadDays = (day: string) =>
      loads.filter((piece) => clock.day(piece.collectionEvent.endedAt) === day);
    const haulOutDays = (day: string) =>
      haulOuts.filter((piece) => clock.day(piece.collectionEvent.endedAt) === day);
    const totals: DebrisTotalsAnswer = {
      project: {
        id: project.id,
        name: project.name,
        client: named.client.name,
        declarationEvent: named.declarationEvent.name,
        reference: named.declarationEvent.reference,
        programType: named.programType.name,
        timeZone: project.timeZone,
      },
      from: asked.from,
      to: asked.to,
      headings: {
        loads: formNamed('LOAD', 'Loads'),
        haulOuts: formNamed('HAUL_OUT', 'Haul-outs'),
        unitRate: formNamed('UNIT_RATE', 'Unit rate'),
      },
      loads: {
        rows: [...loadRows.values()]
          .sort((a, b) => listedOrder(a.debrisType, b.debrisType))
          .map((row) => ({
            debrisType: shown(row.debrisType),
            loads: row.loads.size,
            cy: exactOf(row.cy),
            tons: exactOf(row.tons, 4),
          })),
        total: {
          loads: new Set(loads.map((piece) => piece.completedLoadId)).size,
          cy: exactOf(sumOf(loads, (piece) => piece.volumeCy ?? zero)),
          tons: exactOf(
            sumOf(loads, (piece) => piece.weightTons ?? zero),
            4,
          ),
        },
        equipment: equipmentOf(loads.map((piece) => piece.collectionEvent.certification)),
      },
      haulOuts: {
        rows: [...haulOutRows.values()]
          .sort(
            (a, b) =>
              (a.site?.name ?? '').localeCompare(b.site?.name ?? '') ||
              listedOrder(a.debrisType, b.debrisType),
          )
          .map((row) => ({
            site: row.site,
            debrisType: shown(row.debrisType),
            loads: row.loads.size,
            cy: exactOf(row.cy),
            tons: exactOf(row.tons, 4),
          })),
        total: {
          loads: new Set(haulOuts.map((piece) => piece.completedHaulOutId)).size,
          cy: exactOf(sumOf(haulOuts, (piece) => piece.volumeCy ?? zero)),
          tons: exactOf(
            sumOf(haulOuts, (piece) => piece.weightTons ?? zero),
            4,
          ),
        },
        equipment: equipmentOf(haulOuts.map((piece) => piece.collectionEvent.certification)),
      },
      unitRate: {
        rows: [...unitRows.values()]
          .sort(
            (a, b) =>
              listedOrder(a.payableType, b.payableType) ||
              (a.payItem?.code ?? '').localeCompare(b.payItem?.code ?? ''),
          )
          .map((row) => ({
            payableType: shown(row.payableType),
            payItem: row.payItem,
            tickets: row.tickets,
            units: exactOf(row.units),
            hours: row.hours,
          })),
        total: {
          tickets: unitRate.length,
          units: exactOf(sumOf(counted(false), unitsOf)),
          hours: exactOf(sumOf(counted(true), unitsOf)),
        },
        equipment: equipmentOf(unitRate.map((event) => event.certification)),
      },
      incidents: {
        filed: incidents.length,
        open: incidents.filter(
          (incident) =>
            !incident.qcMarks.some(
              (mark) => mark.status === 'QC_APPROVED' || mark.status === 'QC_VOID',
            ),
        ).length,
      },
      monitorsOnShift: onShift.length,
      byDay: days.map((day) => ({
        day,
        loads: new Set(loadDays(day).map((piece) => piece.completedLoadId)).size,
        loadCy: exactOf(sumOf(loadDays(day), (piece) => piece.volumeCy ?? zero)),
        haulOuts: new Set(haulOutDays(day).map((piece) => piece.completedHaulOutId)).size,
        haulOutCy: exactOf(sumOf(haulOutDays(day), (piece) => piece.volumeCy ?? zero)),
        unitRateTickets: unitRate.filter((event) => clock.day(event.endedAt) === day).length,
      })),
    };
    const pointOf = (
      workflow: WorkflowName,
      event: { endLatitude: Decimal | null; endLongitude: Decimal | null },
      group: string,
    ): MapPoint[] => {
      const latitude = numberOf(event.endLatitude);
      const longitude = numberOf(event.endLongitude);
      return latitude === null || longitude === null
        ? []
        : [{ workflow, latitude, longitude, group }];
    };
    const points = [
      ...loads.flatMap((piece) =>
        pointOf('LOAD', piece.collectionEvent, debrisOf(piece.collectionEvent)?.name ?? ''),
      ),
      ...unitRate.flatMap((event) => pointOf('UNIT_RATE', event, event.payableType?.name ?? '')),
    ];
    return { totals, points };
  }

  // The newest map's boundary and zones, the project's sites, and the points.
  private static async mapOf(
    tx: Tx,
    projectId: string,
    points: readonly MapPoint[],
  ): Promise<ReportMap> {
    const map = await tx.mapVersion.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
      select: { boundary: true, zones: { select: { name: true, geometry: true } } },
    });
    const sites = await tx.disposalSite.findMany({
      where: { projectId, archivedAt: null },
      orderBy: { name: 'asc' },
      select: { name: true, latitude: true, longitude: true },
    });
    return {
      boundary: map?.boundary ?? null,
      zones: map?.zones ?? [],
      sites: sites.map((site) => ({
        name: site.name,
        latitude: site.latitude.toNumber(),
        longitude: site.longitude.toNumber(),
      })),
      points,
    };
  }
}
