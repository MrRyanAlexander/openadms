// What a read-only viewer reads (ARCHITECTURE §5.5, §14; spec/parts/02; AC-02-74; AC-10-29, 30;
// BACKLOG 2.4.5, C22; ADR-050, 169, 315, 434): a client user, a contractor user or an auditor.
// Every read here goes through the one place that states the viewer to the database
// (`ViewerDatabase.$viewed`), as the database's read-only login: which rows and which columns
// come back is the database's to say, from the viewer's own record as it stands now (their
// projects, their kind, their contractor). Nothing is filtered here a second time, and nothing
// here can write. A person who is no viewer, or was archived a moment ago, is shown nothing.
//
// A ticket's reads (ADR-435). A ticket is its project, its workflow and its bare number, and
// the field events under it: one the viewer is shown no field event of is no ticket to them.
// A line's rate and amount, an ROE's owner, who recorded a field event and the three names of
// setup come from the owner's views (`viewer.prisma`), each of which answers nothing where the
// viewer isn't to see it: what is missing there is `null` here.
import type {
  ViewerCompleted,
  ViewerRoesAnswer,
  ViewerTicketAnswer,
  ViewerTicketsAnswer,
} from '@open-adms/contracts';
import type { Prisma, ViewerDatabase } from '@open-adms/db';

type Workflow = ViewerTicketAnswer['workflow'];
type Status = ViewerTicketAnswer['statuses'][number];
// A number the database keeps exactly, as text to the places its column holds.
interface Exact {
  toFixed(places: number): string;
}
const exact = (value: Exact | null, places: number): string | null =>
  value === null ? null : value.toFixed(places);
const statusOrder: readonly Status[] = ['PENDING', 'COMPLETED', 'MANUAL_REVIEW', 'VOID'];
const inOrder = (statuses: Iterable<Status>): Status[] =>
  statusOrder.filter((status) => [...statuses].includes(status));
const present = <T>(ids: readonly (T | null)[]): T[] => [
  ...new Set(ids.filter((id): id is T => id !== null)),
];

export interface ViewerTicketsAsked {
  readonly workflow: Workflow;
  // The last ticket number of the page before.
  readonly after?: string | undefined;
  readonly limit: number;
}

export interface ViewerRoesAsked {
  // The last ROE of the page before.
  readonly after?: string | undefined;
  readonly limit: number;
}

export interface ViewerProjectsAsked {
  // The last project of the page before.
  readonly after?: string | undefined;
  readonly limit: number;
}

export interface ViewerProjectRead {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly closedAt: string | null;
}

export interface ViewerProjectsPage {
  readonly projects: ViewerProjectRead[];
  readonly next: string | null;
}

export class ViewerReads {
  private readonly viewed: ViewerDatabase;

  constructor(viewed: ViewerDatabase) {
    this.viewed = viewed;
  }

  // The projects the viewer is given, in the order they were entered: what every viewer may
  // read of a project, a contractor user included (its name, time zone and dates; ADR-315).
  async projects(viewerId: string, asked: ViewerProjectsAsked): Promise<ViewerProjectsPage> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<ViewerProjectsPage> => {
      const rows = await tx.project.findMany({
        where: asked.after === undefined ? {} : { id: { gt: asked.after } },
        orderBy: { id: 'asc' },
        // One more than the page, to know whether another follows.
        take: asked.limit + 1,
        // Only columns the read-only login is granted: any other is the database's refusal.
        select: { id: true, name: true, timeZone: true, closedAt: true },
      });
      const page = rows.slice(0, asked.limit);
      return {
        projects: page.map((row) => ({
          id: row.id,
          name: row.name,
          timeZone: row.timeZone,
          closedAt: row.closedAt?.toISOString() ?? null,
        })),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // One workflow's tickets on a project, a page at a time, by number as text (never parsed,
  // ADR-062). The numbers are grouped by the database, so a page costs a page.
  async tickets(
    viewerId: string,
    projectId: string,
    asked: ViewerTicketsAsked,
  ): Promise<ViewerTicketsAnswer> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<ViewerTicketsAnswer> => {
      const ofTheWorkflow = { projectId, workflow: asked.workflow };
      const numbered = await tx.fieldEvent.groupBy({
        by: ['ticketNumber'],
        where: {
          ...ofTheWorkflow,
          ...(asked.after === undefined ? {} : { ticketNumber: { gt: asked.after } }),
        },
        orderBy: { ticketNumber: 'asc' },
        // One more than the page, to know whether another follows.
        take: asked.limit + 1,
        _count: { _all: true },
      });
      const page = numbered.slice(0, asked.limit);
      const held = await tx.fieldEvent.groupBy({
        by: ['ticketNumber', 'status'],
        where: { ...ofTheWorkflow, ticketNumber: { in: page.map((row) => row.ticketNumber) } },
      });
      return {
        tickets: page.map((row) => ({
          workflow: asked.workflow,
          ticketNumber: row.ticketNumber,
          statuses: inOrder(
            held
              .filter((each) => each.ticketNumber === row.ticketNumber)
              .map((each) => each.status),
          ),
          fieldEvents: row._count._all,
        })),
        next: numbered.length > asked.limit ? (page.at(-1)?.ticketNumber ?? null) : null,
      };
    });
  }

  // One ticket, whole; null where the viewer is shown no field event under that number, which
  // is all the viewer is told of a ticket that isn't theirs (AC-10-29).
  async ticket(
    viewerId: string,
    projectId: string,
    workflow: Workflow,
    ticketNumber: string,
  ): Promise<ViewerTicketAnswer | null> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<ViewerTicketAnswer | null> => {
      const events = await tx.fieldEvent.findMany({
        where: { projectId, workflow, ticketNumber },
        // Field time, never the order they arrived in.
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
        // Only columns the read-only login is granted: any other is the database's refusal.
        select: {
          id: true,
          kind: true,
          splitSuffix: true,
          status: true,
          startedAt: true,
          endedAt: true,
          endLatitude: true,
          endLongitude: true,
          address: true,
          certNumber: true,
          loadCall: true,
          estimateCy: true,
          unitCount: true,
          formDebrisTypeId: true,
          siteId: true,
          workedOutPayItemId: true,
          monitorId: true,
        },
      });
      if (events.length === 0) return null;

      const completed = await this.completed(tx, projectId, workflow, ticketNumber);
      const lines =
        workflow !== 'UNIT_RATE' && completed === null
          ? []
          : await tx.transaction.findMany({
              where: {
                projectId,
                ...(workflow === 'LOAD'
                  ? { completedLoadId: completed?.id ?? null }
                  : workflow === 'HAUL_OUT'
                    ? { completedHaulOutId: completed?.id ?? null }
                    : { fieldEventId: { in: events.map((event) => event.id) } }),
              },
              // Never the rate or the amount: the login isn't granted them on the line itself.
              select: {
                id: true,
                slot: true,
                payItemId: true,
                primeId: true,
                operatingSubId: true,
                unit: true,
                quantity: true,
                completedLoadCollectionId: true,
                completedHaulOutCollectionId: true,
              },
            });
      const lineIds = lines.map((line) => line.id);
      const money = await tx.viewerTransactionMoney.findMany({
        where: { id: { in: lineIds } },
        select: { id: true, rate: true, amount: true },
      });
      const payItems = await tx.viewerPayItemName.findMany({
        where: {
          id: {
            in: present([
              ...lines.map((line) => line.payItemId),
              ...events.map((event) => event.workedOutPayItemId),
            ]),
          },
        },
        select: { id: true, code: true, description: true },
      });
      const debrisTypes = await tx.viewerDebrisTypeName.findMany({
        where: { id: { in: present(events.map((event) => event.formDebrisTypeId)) } },
        select: { id: true, name: true },
      });
      const sites = await tx.viewerDisposalSiteName.findMany({
        where: { id: { in: present(events.map((event) => event.siteId)) } },
        select: { id: true, name: true },
      });
      const monitors = await tx.viewerFieldEventMonitor.findMany({
        where: { id: { in: present(events.map((event) => event.monitorId)) } },
        select: { id: true, name: true, monitorNumber: true },
      });
      const contractors = await tx.contractor.findMany({
        where: {
          id: { in: present(lines.flatMap((line) => [line.primeId, line.operatingSubId])) },
        },
        select: { id: true, name: true },
      });

      const nameOf = (rows: readonly { id: string; name: string }[], id: string | null) =>
        rows.find((row) => row.id === id)?.name ?? null;
      const payItemOf = (id: string | null) => {
        const found = payItems.find((item) => item.id === id);
        return found === undefined ? null : { code: found.code, description: found.description };
      };
      const suffixOf = (line: (typeof lines)[number]): string =>
        completed?.collections.find(
          (row) => row.id === (line.completedLoadCollectionId ?? line.completedHaulOutCollectionId),
        )?.splitSuffix ?? '';

      return {
        workflow,
        ticketNumber,
        statuses: inOrder(events.map((event) => event.status)),
        fieldEvents: events.map((event) => {
          const monitor = monitors.find((each) => each.id === event.monitorId);
          return {
            id: event.id,
            kind: event.kind,
            splitSuffix: event.splitSuffix,
            status: event.status,
            startedAt: event.startedAt.toISOString(),
            endedAt: event.endedAt.toISOString(),
            latitude: exact(event.endLatitude, 8),
            longitude: exact(event.endLongitude, 8),
            address: event.address,
            certNumber: event.certNumber,
            loadCall: event.loadCall,
            estimateCy: exact(event.estimateCy, 1),
            unitCount: exact(event.unitCount, 2),
            debrisType: nameOf(debrisTypes, event.formDebrisTypeId),
            site: nameOf(sites, event.siteId),
            payItem: payItemOf(event.workedOutPayItemId),
            recordedBy:
              monitor === undefined
                ? null
                : { name: monitor.name, monitorNumber: monitor.monitorNumber },
          };
        }),
        completed,
        lines: lines
          .map((line) => {
            const shown = money.find((each) => each.id === line.id);
            return {
              id: line.id,
              splitSuffix: suffixOf(line),
              slot: line.slot,
              payItem: payItemOf(line.payItemId),
              unit: line.unit,
              quantity: line.quantity.toFixed(4),
              prime: nameOf(contractors, line.primeId),
              operatingSub: nameOf(contractors, line.operatingSubId),
              rate: exact(shown?.rate ?? null, 4),
              amount: exact(shown?.amount ?? null, 2),
            };
          })
          .sort(
            (left, right) =>
              left.splitSuffix.localeCompare(right.splitSuffix) || left.slot - right.slot,
          ),
      };
    });
  }

  // A project's ROEs, in the order they were made. The owner's name comes from the view that
  // shows a private citizen only to a viewer the firm lets see them (ADR-336).
  async roes(
    viewerId: string,
    projectId: string,
    asked: ViewerRoesAsked,
  ): Promise<ViewerRoesAnswer> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<ViewerRoesAnswer> => {
      const rows = await tx.roe.findMany({
        where: { projectId, ...(asked.after === undefined ? {} : { id: { gt: asked.after } }) },
        orderBy: { id: 'asc' },
        take: asked.limit + 1,
        // Never `ownerName`: the login isn't granted it on the ROE itself.
        select: { id: true, roeNumber: true, signed: true, signedDate: true },
      });
      const page = rows.slice(0, asked.limit);
      const owners = await tx.viewerRoeCitizen.findMany({
        where: { id: { in: page.map((row) => row.id) } },
        select: { id: true, ownerName: true },
      });
      return {
        roes: page.map((row) => ({
          id: row.id,
          roeNumber: row.roeNumber,
          signed: row.signed,
          signedDate: row.signedDate?.toISOString().slice(0, 10) ?? null,
          ownerName: owners.find((owner) => owner.id === row.id)?.ownerName ?? null,
        })),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // The record the worker concluded for a load or a haul-out, the one that stands (never one
  // dissolved by a correction), with its collections' rows. A unit rate ticket has none.
  private async completed(
    tx: Prisma.TransactionClient,
    projectId: string,
    workflow: Workflow,
    ticketNumber: string,
  ): Promise<ViewerCompleted | null> {
    if (workflow === 'UNIT_RATE') return null;
    const standing = { projectId, ticketNumber, dissolvedAt: null };
    const figures = {
      id: true,
      quantitySource: true,
      capacityCy: true,
      loadCall: true,
      volumeCy: true,
      weightTons: true,
      weightIsShare: true,
    } as const;
    const row = {
      id: true,
      collectionEventId: true,
      splitSuffix: true,
      shareFraction: true,
      volumeCy: true,
      weightTons: true,
      mileage: true,
      mileageSource: true,
    } as const;
    if (workflow === 'LOAD') {
      const load = await tx.completedLoad.findFirst({
        where: standing,
        select: { ...figures, carriedCount: true },
      });
      if (load === null) return null;
      const rows = await tx.completedLoadCollection.findMany({
        where: { completedLoadId: load.id, dissolvedAt: null },
        orderBy: { splitSuffix: 'asc' },
        select: row,
      });
      return {
        ...this.figures(load),
        carriedCount: load.carriedCount,
        collections: rows.map((each) => ({ ...this.row(each), pileLoadCall: null })),
      };
    }
    const haulOut = await tx.completedHaulOut.findFirst({ where: standing, select: figures });
    if (haulOut === null) return null;
    const piles = await tx.completedHaulOutCollection.findMany({
      where: { completedHaulOutId: haulOut.id, dissolvedAt: null },
      orderBy: { splitSuffix: 'asc' },
      select: { ...row, pileLoadCall: true },
    });
    return {
      ...this.figures(haulOut),
      carriedCount: null,
      collections: piles.map((each) => ({ ...this.row(each), pileLoadCall: each.pileLoadCall })),
    };
  }

  private figures(record: {
    id: string;
    quantitySource: ViewerCompleted['quantitySource'];
    capacityCy: number | null;
    loadCall: number | null;
    volumeCy: Exact | null;
    weightTons: Exact | null;
    weightIsShare: boolean;
  }) {
    return {
      id: record.id,
      quantitySource: record.quantitySource,
      capacityCy: record.capacityCy,
      loadCall: record.loadCall,
      volumeCy: exact(record.volumeCy, 2),
      weightTons: exact(record.weightTons, 4),
      weightIsShare: record.weightIsShare,
    };
  }

  private row(each: {
    id: string;
    collectionEventId: string;
    splitSuffix: string;
    shareFraction: Exact;
    volumeCy: Exact | null;
    weightTons: Exact | null;
    mileage: Exact | null;
    mileageSource: ViewerCompleted['collections'][number]['mileageSource'];
  }) {
    return {
      id: each.id,
      collectionEventId: each.collectionEventId,
      splitSuffix: each.splitSuffix,
      shareFraction: each.shareFraction.toFixed(8),
      volumeCy: exact(each.volumeCy, 2),
      weightTons: exact(each.weightTons, 4),
      mileage: exact(each.mileage, 4),
      mileageSource: each.mileageSource,
    };
  }
}
