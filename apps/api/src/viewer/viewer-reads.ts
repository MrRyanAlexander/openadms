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
  QuantityLookupAnswer,
  SetupCheckAnswer,
  ViewerCertificationsAnswer,
  ViewerCompleted,
  ViewerDropOffLogsAnswer,
  ViewerIncidentsAnswer,
  ViewerRoesAnswer,
  ViewerSetupAnswer,
  ViewerSurveysAnswer,
  ViewerTicketAnswer,
  ViewerTicketsAnswer,
} from '@open-adms/contracts';
import type { Prisma, ViewerDatabase } from '@open-adms/db';

import { quantityAsksOf, setupGapsOf, SetupStanding } from '../setup/setup-standing.ts';

type Workflow = ViewerTicketAnswer['workflow'];
// What a ticket is read with beside its field events, completed record and lines.
type ViewerTicketBeside = Pick<
  ViewerTicketAnswer,
  'flags' | 'photographs' | 'scaleReceipts' | 'itemLines' | 'carriedTickets' | 'qcStatus' | 'lock'
>;
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

// What a viewer reads of every form: when and where it was made, its notes and its answers.
const viewedForm = {
  id: true,
  madeAt: true,
  deviceUtcOffsetMinutes: true,
  latitude: true,
  longitude: true,
  notes: true,
  answers: true,
} as const;
const formShown = (row: {
  id: string;
  madeAt: Date;
  deviceUtcOffsetMinutes: number;
  latitude: Exact | null;
  longitude: Exact | null;
  notes: string | null;
  answers: Prisma.JsonValue;
}) => ({
  id: row.id,
  madeAt: row.madeAt.toISOString(),
  deviceUtcOffsetMinutes: row.deviceUtcOffsetMinutes,
  latitude: exact(row.latitude, 8),
  longitude: exact(row.longitude, 8),
  notes: row.notes,
  answers:
    typeof row.answers === 'object' && row.answers !== null && !Array.isArray(row.answers)
      ? (row.answers as Record<string, string | number | boolean>)
      : {},
});

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
          scaleReceiptId: true,
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

      const beside = await ViewerReads.beside(tx, projectId, workflow, ticketNumber, {
        eventIds: events.map((event) => event.id),
        unitRateEventId: events.find((event) => event.kind === 'UNIT_RATE')?.id ?? null,
        receiptIds: present(events.map((event) => event.scaleReceiptId)),
        completedId: completed?.id ?? null,
      });

      return {
        ...beside,
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
        select: {
          id: true,
          roeNumber: true,
          signed: true,
          signedDate: true,
          parcelId: true,
          address: true,
          latitude: true,
          longitude: true,
        },
      });
      const page = rows.slice(0, asked.limit);
      const ids = page.map((row) => row.id);
      const owners = await tx.viewerRoeCitizen.findMany({
        where: { id: { in: ids } },
        select: { id: true, ownerName: true },
      });
      // What each allows, the picks in force, each by name where the viewer is shown it.
      const scope = await tx.roeScopeItem.findMany({
        where: { roeId: { in: ids }, archivedAt: null },
        orderBy: { id: 'asc' },
        select: { id: true, roeId: true, formDebrisTypeId: true, payableTypeId: true, count: true },
      });
      const debrisTypes = await tx.viewerDebrisTypeName.findMany({
        where: { id: { in: present(scope.map((pick) => pick.formDebrisTypeId)) } },
        select: { id: true, name: true },
      });
      const payableTypes = await tx.payableType.findMany({
        where: { id: { in: present(scope.map((pick) => pick.payableTypeId)) } },
        select: { id: true, name: true },
      });
      const nameOf = (rows: readonly { id: string; name: string }[], id: string | null) =>
        rows.find((row) => row.id === id)?.name ?? null;
      return {
        roes: page.map((row) => ({
          id: row.id,
          roeNumber: row.roeNumber,
          signed: row.signed,
          signedDate: row.signedDate?.toISOString().slice(0, 10) ?? null,
          ownerName: owners.find((owner) => owner.id === row.id)?.ownerName ?? null,
          parcelId: row.parcelId,
          address: row.address,
          latitude: exact(row.latitude, 8),
          longitude: exact(row.longitude, 8),
          scope: scope
            .filter((pick) => pick.roeId === row.id)
            .map((pick) => ({
              id: pick.id,
              debrisType: nameOf(debrisTypes, pick.formDebrisTypeId),
              payableType: nameOf(payableTypes, pick.payableTypeId),
              count: pick.count,
            })),
        })),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // A project's certifications by cert number, as the database shows the viewer them: a
  // contractor user those naming its contractor; never the driver's phone or licence number
  // (ADR-169, 361, 535 (6)). Who they name is by name, where the viewer is shown it.
  async certifications(
    viewerId: string,
    projectId: string,
    asked: ViewerProjectsAsked,
  ): Promise<ViewerCertificationsAnswer> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<ViewerCertificationsAnswer> => {
      const rows = await tx.certification.findMany({
        where: { projectId },
        orderBy: [{ certNumber: 'asc' }, { id: 'asc' }],
        take: asked.limit + 1,
        ...(asked.after === undefined ? {} : { cursor: { id: asked.after }, skip: 1 }),
        // Only columns the read-only login is granted: never the driver's phone or licence.
        select: {
          id: true,
          certNumber: true,
          kind: true,
          primeId: true,
          firstTierSubId: true,
          secondTierSubId: true,
          capacityCy: true,
          vehicleTypeId: true,
          vehicleTypeOther: true,
          crewTypeId: true,
          driverName: true,
          tagNumber: true,
          tagState: true,
          tagExpiry: true,
          certifiedAt: true,
          revokedFrom: true,
          replacesId: true,
        },
      });
      const page = rows.slice(0, asked.limit);
      const ids = page.map((row) => row.id);
      const boxes = await tx.certificationBox.findMany({
        where: { certificationId: { in: ids }, archivedAt: null },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          certificationId: true,
          position: true,
          shape: true,
          sign: true,
          length: true,
          secondLength: true,
          width: true,
          height: true,
          diameter: true,
          radius: true,
          run: true,
          corners: true,
        },
      });
      const helpers = await tx.certificationHelper.groupBy({
        by: ['certificationId'],
        where: { certificationId: { in: ids }, archivedAt: null },
        _count: { _all: true },
      });
      const contractors = await tx.contractor.findMany({
        where: {
          id: {
            in: present(
              page.flatMap((row) => [row.primeId, row.firstTierSubId, row.secondTierSubId]),
            ),
          },
        },
        select: { id: true, name: true },
      });
      const vehicleTypes = await tx.vehicleType.findMany({
        where: { id: { in: present(page.map((row) => row.vehicleTypeId)) } },
        select: { id: true, name: true },
      });
      const crewTypes = await tx.crewType.findMany({
        where: { id: { in: present(page.map((row) => row.crewTypeId)) } },
        select: { id: true, name: true },
      });
      const nameOf = (named: readonly { id: string; name: string }[], id: string | null) =>
        named.find((row) => row.id === id)?.name ?? null;
      const day = (at: Date | null): string | null => at?.toISOString().slice(0, 10) ?? null;
      return {
        certifications: page.map((row) => ({
          id: row.id,
          certNumber: row.certNumber,
          kind: row.kind,
          prime: nameOf(contractors, row.primeId),
          firstTierSub: nameOf(contractors, row.firstTierSubId),
          secondTierSub: nameOf(contractors, row.secondTierSubId),
          capacityCy: row.capacityCy,
          vehicleType: nameOf(vehicleTypes, row.vehicleTypeId) ?? row.vehicleTypeOther,
          crewType: nameOf(crewTypes, row.crewTypeId),
          driverName: row.driverName,
          tagNumber: row.tagNumber,
          tagState: row.tagState,
          tagExpiry: day(row.tagExpiry),
          certifiedAt: row.certifiedAt.toISOString(),
          revokedFrom: day(row.revokedFrom),
          replacesId: row.replacesId,
          boxes: boxes
            .filter((box) => box.certificationId === row.id)
            .map((box) => ({
              id: box.id,
              position: box.position,
              shape: box.shape,
              sign: box.sign,
              length: box.length,
              secondLength: box.secondLength,
              width: box.width,
              height: box.height,
              diameter: box.diameter,
              radius: box.radius,
              run: box.run,
              corners: box.corners,
            })),
          helpers: helpers.find((each) => each.certificationId === row.id)?._count._all ?? 0,
        })),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // A project's surveys, in the order they were made; a contractor user is shown none.
  async surveys(
    viewerId: string,
    projectId: string,
    asked: ViewerProjectsAsked,
  ): Promise<ViewerSurveysAnswer> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<ViewerSurveysAnswer> => {
      const rows = await tx.survey.findMany({
        where: { projectId, ...(asked.after === undefined ? {} : { id: { gt: asked.after } }) },
        orderBy: { id: 'asc' },
        take: asked.limit + 1,
        select: { ...viewedForm, workTypeId: true, surveyNumber: true, roeNumber: true },
      });
      const page = rows.slice(0, asked.limit);
      const workTypes = await tx.surveyWorkType.findMany({
        where: { id: { in: present(page.map((row) => row.workTypeId)) } },
        select: { id: true, name: true },
      });
      return {
        surveys: page.map((row) => ({
          ...formShown(row),
          workType: workTypes.find((type) => type.id === row.workTypeId)?.name ?? null,
          surveyNumber: row.surveyNumber,
          roeNumber: row.roeNumber,
        })),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // A project's incidents, in the order they were made; a contractor user is shown none.
  async incidents(
    viewerId: string,
    projectId: string,
    asked: ViewerProjectsAsked,
  ): Promise<ViewerIncidentsAnswer> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<ViewerIncidentsAnswer> => {
      const rows = await tx.incident.findMany({
        where: { projectId, ...(asked.after === undefined ? {} : { id: { gt: asked.after } }) },
        orderBy: { id: 'asc' },
        take: asked.limit + 1,
        select: {
          ...viewedForm,
          incidentTypeId: true,
          incidentSubTypeId: true,
          description: true,
          parties: true,
          address: true,
          contractorId: true,
          certNumber: true,
          roeNumber: true,
        },
      });
      const page = rows.slice(0, asked.limit);
      const types = await tx.incidentType.findMany({
        where: { id: { in: present(page.map((row) => row.incidentTypeId)) } },
        select: { id: true, name: true },
      });
      const subTypes = await tx.incidentSubType.findMany({
        where: { id: { in: present(page.map((row) => row.incidentSubTypeId)) } },
        select: { id: true, name: true },
      });
      // An incident names a contractor by its place on the project.
      const places = await tx.projectContractor.findMany({
        where: { id: { in: present(page.map((row) => row.contractorId)) } },
        select: { id: true, contractorId: true },
      });
      const contractors = await tx.contractor.findMany({
        where: { id: { in: places.map((place) => place.contractorId) } },
        select: { id: true, name: true },
      });
      const nameOf = (named: readonly { id: string; name: string }[], id: string | null) =>
        named.find((row) => row.id === id)?.name ?? null;
      return {
        incidents: page.map((row) => ({
          ...formShown(row),
          incidentType: nameOf(types, row.incidentTypeId),
          incidentSubType: nameOf(subTypes, row.incidentSubTypeId),
          description: row.description,
          parties: row.parties,
          address: row.address,
          contractor: nameOf(
            contractors,
            places.find((place) => place.id === row.contractorId)?.contractorId ?? null,
          ),
          certNumber: row.certNumber,
          roeNumber: row.roeNumber,
        })),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // A project's citizen drop-off logs, in the order they were made: the resident and where
  // their debris came from only from the view that shows a private citizen to a viewer the firm
  // lets see them (ADR-336). A contractor user is shown none.
  async dropOffLogs(
    viewerId: string,
    projectId: string,
    asked: ViewerProjectsAsked,
  ): Promise<ViewerDropOffLogsAnswer> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<ViewerDropOffLogsAnswer> => {
      const rows = await tx.dropOffLog.findMany({
        where: { projectId, ...(asked.after === undefined ? {} : { id: { gt: asked.after } }) },
        orderBy: { id: 'asc' },
        take: asked.limit + 1,
        // Never the resident or where their debris came from: the login isn't granted them here.
        select: { ...viewedForm, siteId: true },
      });
      const page = rows.slice(0, asked.limit);
      const citizens = await tx.viewerDropOffLogCitizen.findMany({
        where: { id: { in: page.map((row) => row.id) } },
        select: { id: true, residentName: true, originAddress: true },
      });
      const sites = await tx.viewerDisposalSiteName.findMany({
        where: { id: { in: present(page.map((row) => row.siteId)) } },
        select: { id: true, name: true },
      });
      return {
        dropOffLogs: page.map((row) => {
          const citizen = citizens.find((each) => each.id === row.id);
          return {
            ...formShown(row),
            site: sites.find((site) => site.id === row.siteId)?.name ?? null,
            residentName: citizen?.residentName ?? null,
            originAddress: citizen?.originAddress ?? null,
          };
        }),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // A project's setup as a client user or an auditor reads it, never a rate; null for a viewer
  // the database doesn't show the project's setup (a contractor user), as for one nobody has.
  async setup(viewerId: string, projectId: string): Promise<ViewerSetupAnswer | null> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<ViewerSetupAnswer | null> => {
      if (!(await ViewerReads.seesSetup(tx, projectId))) return null;
      const forms = await tx.form.findMany({
        where: { projectId },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          documentType: true,
          name: true,
          debrisTypes: {
            where: { archivedAt: null },
            orderBy: { id: 'asc' },
            select: { id: true, reduced: true, debrisType: { select: { name: true } } },
          },
        },
      });
      const payItems = await tx.payItem.findMany({
        where: { projectId, archivedAt: null },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, description: true, unit: true },
      });
      const sites = await tx.disposalSite.findMany({
        where: { projectId, archivedAt: null },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          takesLoads: true,
          haulOutsLeaveHere: true,
          chargesTippingFee: true,
          ineligibleSite: true,
          activationDate: true,
          closeDate: true,
        },
      });
      const contracts = await tx.contract.findMany({
        where: { projectId, archivedAt: null },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, primeId: true },
      });
      const primes = await tx.contractor.findMany({
        where: { id: { in: present(contracts.map((contract) => contract.primeId)) } },
        select: { id: true, name: true },
      });
      const rules = await tx.rule.findMany({
        where: { projectId, archivedAt: null },
        orderBy: { id: 'asc' },
        select: { id: true, name: true, formId: true, contractId: true, active: true },
      });
      const day = (at: Date): string => at.toISOString().slice(0, 10);
      return {
        forms: forms.map((form) => ({
          id: form.id,
          documentType: form.documentType,
          name: form.name,
          debrisTypes: form.debrisTypes.map((entry) => ({
            id: entry.id,
            name: entry.debrisType.name,
            reduced: entry.reduced,
          })),
        })),
        payItems,
        sites: sites.map((site) => ({
          ...site,
          activationDate: day(site.activationDate),
          closeDate: site.closeDate === null ? null : day(site.closeDate),
        })),
        contracts: contracts.map((contract) => ({
          id: contract.id,
          name: contract.name,
          prime: primes.find((prime) => prime.id === contract.primeId)?.name ?? null,
        })),
        rules,
      };
    });
  }

  // The setup check, worked out by the domain from the setup as the database shows the viewer
  // it: for a client user and an auditor alone (ADR-535 (6)); null for anybody else.
  async setupCheck(viewerId: string, projectId: string): Promise<SetupCheckAnswer | null> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<SetupCheckAnswer | null> => {
      if (!(await ViewerReads.seesSetup(tx, projectId))) return null;
      return { gaps: setupGapsOf(await SetupStanding.readIn(tx, projectId)) };
    });
  }

  // What each site's phones ask for, the same way.
  async quantityLookup(viewerId: string, projectId: string): Promise<QuantityLookupAnswer | null> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<QuantityLookupAnswer | null> => {
      if (!(await ViewerReads.seesSetup(tx, projectId))) return null;
      return { asks: quantityAsksOf(await SetupStanding.readIn(tx, projectId)) };
    });
  }

  // Whether the database shows the viewer this photograph's record: only then is its file read.
  async photograph(viewerId: string, photoId: string): Promise<boolean> {
    return this.viewed.$viewed(viewerId, async (tx) => {
      const photo = await tx.photo.findFirst({
        where: { id: photoId, archivedAt: null },
        select: { id: true },
      });
      return photo !== null;
    });
  }

  // Whether the database shows the viewer the project's setup: its own view says so, for a
  // client user and an auditor given the project (ADR-315).
  private static async seesSetup(tx: Prisma.TransactionClient, projectId: string) {
    const project = await tx.viewerProjectSetup.findFirst({
      where: { id: projectId },
      select: { id: true },
    });
    return project !== null;
  }

  // What a viewer reads beside a ticket's field events (ADR-535 (6)), each what the database
  // shows them: the ticket's flags and whether each is accepted (a contractor user is shown none),
  // its photographs' records (never one removed, never where a file is kept), its scale receipts
  // and their site's name, its item lines and carried tickets in force, its QC status, and the
  // lock in force with its batch's name.
  private static async beside(
    tx: Prisma.TransactionClient,
    projectId: string,
    workflow: Workflow,
    ticketNumber: string,
    ids: {
      readonly eventIds: readonly string[];
      readonly unitRateEventId: string | null;
      readonly receiptIds: readonly string[];
      readonly completedId: string | null;
    },
  ): Promise<ViewerTicketBeside> {
    const flags = await tx.flag.findMany({
      where: { projectId, workflow, ticketNumber },
      orderBy: [{ raisedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, message: true, raisedAt: true, clearedAt: true },
    });
    const accepted = await tx.flagAcceptance.findMany({
      where: { flagId: { in: flags.map((flag) => flag.id) }, withdrawnAt: null },
      select: { flagId: true },
    });
    const photos = await tx.photo.findMany({
      where: {
        projectId,
        archivedAt: null,
        OR: [
          { fieldEventId: { in: [...ids.eventIds] } },
          { scaleReceiptId: { in: [...ids.receiptIds] } },
        ],
      },
      orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        fieldEventId: true,
        scaleReceiptId: true,
        view: true,
        capturedAt: true,
        uploadedAt: true,
        label: true,
      },
    });
    const receipts = await tx.scaleReceipt.findMany({
      where: { id: { in: [...ids.receiptIds] } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        receiptNumber: true,
        siteId: true,
        grossWeightLb: true,
        tareWeightLb: true,
        netWeightLb: true,
        netWeightTons: true,
      },
    });
    const sites = await tx.viewerDisposalSiteName.findMany({
      where: { id: { in: present(receipts.map((receipt) => receipt.siteId)) } },
      select: { id: true, name: true },
    });
    const items = await tx.fieldEventItem.findMany({
      where: { fieldEventId: { in: [...ids.eventIds] }, archivedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true, fieldEventId: true, itemNameId: true, quantity: true },
    });
    const itemNames = await tx.itemName.findMany({
      where: { id: { in: present(items.map((item) => item.itemNameId)) } },
      select: { id: true, name: true },
    });
    const carried = await tx.carriedTicket.findMany({
      where: { fieldEventId: { in: [...ids.eventIds] }, archivedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true, fieldEventId: true, carriedTicketNumber: true },
    });
    const key =
      workflow === 'UNIT_RATE'
        ? ids.unitRateEventId === null
          ? null
          : { fieldEventId: ids.unitRateEventId }
        : ids.completedId === null
          ? null
          : workflow === 'LOAD'
            ? { completedLoadId: ids.completedId }
            : { completedHaulOutId: ids.completedId };
    const qc =
      key === null ? null : await tx.qcMark.findFirst({ where: key, select: { status: true } });
    const lock =
      key === null
        ? null
        : await tx.invoiceLock.findFirst({
            where: { ...key, unlockedAt: null },
            select: { lockedAt: true, invoiceBatchId: true },
          });
    const batch =
      lock?.invoiceBatchId == null
        ? null
        : await tx.invoiceBatch.findUnique({
            where: { id: lock.invoiceBatchId },
            select: { name: true },
          });
    return {
      flags: flags.map((flag) => ({
        id: flag.id,
        code: flag.code,
        message: flag.message,
        raisedAt: flag.raisedAt.toISOString(),
        clearedAt: flag.clearedAt?.toISOString() ?? null,
        accepted: accepted.some((each) => each.flagId === flag.id),
      })),
      photographs: photos.map((photo) => ({
        id: photo.id,
        fieldEventId: photo.fieldEventId,
        scaleReceiptId: photo.scaleReceiptId,
        view: photo.view,
        capturedAt: photo.capturedAt.toISOString(),
        uploadedAt: photo.uploadedAt?.toISOString() ?? null,
        label: photo.label,
      })),
      scaleReceipts: receipts.map((receipt) => ({
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        site: sites.find((site) => site.id === receipt.siteId)?.name ?? null,
        grossWeightLb: exact(receipt.grossWeightLb, 2),
        tareWeightLb: exact(receipt.tareWeightLb, 2),
        netWeightLb: exact(receipt.netWeightLb, 2),
        netWeightTons: exact(receipt.netWeightTons, 4),
      })),
      itemLines: items.map((item) => ({
        id: item.id,
        fieldEventId: item.fieldEventId,
        item: itemNames.find((name) => name.id === item.itemNameId)?.name ?? null,
        quantity: item.quantity.toFixed(2),
      })),
      carriedTickets: carried.map((each) => ({
        id: each.id,
        fieldEventId: each.fieldEventId,
        carriedTicketNumber: each.carriedTicketNumber,
      })),
      qcStatus: qc?.status ?? null,
      lock:
        lock === null
          ? null
          : { lockedAt: lock.lockedAt.toISOString(), batch: batch?.name ?? null },
    };
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
