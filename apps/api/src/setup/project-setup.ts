// Setup steps 1 to 3, and the project's own lists and map (spec/parts/01-setup.md; ADR-023, 026,
// 127, 135, 141, 216, 303, 311): the client and the declaration event, searched for and picked or
// created; the project under them; the kinds of unit rate work it allows; its field tags; its map.
// A new project's settings start as packages/domain's NewProjectSettings says, from the policy
// values: the database gives none a default (ADR-303). Its number series start with it, and a
// control-ticket project's ranges are entered after (ADR-056, 062, 323).
import type {
  Client,
  ControlRange,
  DeclarationEvent,
  FieldTag,
  MapSource,
  MapVersion,
  NumberSeries,
  Prisma,
  Project,
  ProjectNumberSeries,
  TicketNumberSource,
  Workflow,
} from '@open-adms/db';
import {
  ControlRanges,
  MapShapes,
  NewProjectNumbers,
  NewProjectSettings,
  NumberSeriesRules,
  ProjectClosing,
  type ClosingItem,
  type ProjectOpenItems,
  type ProjectSettings,
} from '@open-adms/domain';

import {
  afterInNameOrder,
  day,
  type Found,
  type Outcome,
  paged,
  QueueingService,
  Refused,
  type Searched,
} from './setup-service.ts';

export interface NewClient {
  readonly name: string;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly notes?: string;
}

// A client changed: only what is stated; a contact or the notes cleared with null.
export interface ClientChanges {
  readonly name?: string;
  readonly contactName?: string | null;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
  readonly notes?: string | null;
}

export interface NewDeclarationEvent {
  readonly name: string;
  // As written: DR-9001-FL.
  readonly reference: string;
  readonly referenceTypeId: string;
}

export type DeclarationEventChanges = Partial<NewDeclarationEvent>;

export interface NewProject {
  readonly name: string;
  readonly clientId: string;
  readonly declarationEventId: string;
  readonly programTypeId: string;
  // An IANA name: America/New_York.
  readonly timeZone: string;
  // Calendar days: 2026-10-12. The window's end may be empty.
  readonly activeFrom: string;
  readonly activeTo: string | null;
  readonly ticketNumberSource: TicketNumberSource;
  readonly workflows: readonly Workflow[];
  // The kinds of unit rate work it allows.
  readonly kindOfWorkIds: readonly string[];
  // Where a series starts, where the firm says: a ticket series otherwise starts at 100,001
  // (ADR-062), and there is a cert-number series only once it is seeded here or later (Q-96).
  readonly numbersFrom?: Readonly<Partial<Record<NumberSeries, number>>>;
}

// A project's active window, changed: either end, as calendar days; the end may be emptied.
export type ActiveWindow = Partial<Pick<NewProject, 'activeFrom' | 'activeTo'>>;

export interface NewControlRange {
  readonly projectId: string;
  readonly series: NumberSeries;
  readonly firstNumber: number;
  readonly lastNumber: number;
}

export interface NewMap {
  readonly projectId: string;
  readonly source: MapSource;
  // The file's name, or the Esri layer's address.
  readonly sourceName: string | null;
  // GeoJSON: the boundary as a geometry, a Feature or a FeatureCollection; the zones, if the map
  // has any, as Features, each named in the field the admin picked.
  readonly boundary: unknown;
  readonly zones: unknown;
  readonly zoneNameField: string | null;
  // Where the file it was loaded from is kept, when it came as a map's file (ADR-485).
  readonly uploadedFileKey?: string;
  // On a map fetched from Esri with zones, the zones' layer (the boundary's own or another) and
  // where its copy is kept (ADR-527 (15)).
  readonly zonesSourceName?: string;
  readonly zonesFileKey?: string;
}

// A change to what a project's tickets are checked against (its settings, a control range, a
// new map version) queues its un-invoiced tickets in the same piece of work (ADR-090, 420;
// AC-06-03).
export class ProjectSetup extends QueueingService {
  // Step 1: search first; a client that exists is picked, never created again (ADR-023). A page
  // at a time in name order, those in service or the archived ones (ADR-527 (3)).
  findClients(asked: Searched): Promise<Found<Client>> {
    return this.db.$read(async (tx) => {
      const last =
        asked.after === undefined
          ? null
          : await tx.client.findUnique({ where: { id: asked.after } });
      // Nothing follows a record nobody has.
      if (asked.after !== undefined && last === null) return { records: [], next: null };
      const rows = await tx.client.findMany({
        where: {
          name: { contains: asked.search, mode: 'insensitive' },
          archivedAt: null,
          ...afterInNameOrder(last),
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: asked.limit + 1,
      });
      return paged(rows, asked.limit);
    });
  }

  client(person: string, input: NewClient): Promise<Outcome<Client>> {
    return this.setup(person, (tx) =>
      tx.client.create({
        data: {
          name: input.name,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          notes: input.notes ?? null,
        },
      }),
    );
  }

  // A client's own fields, audited with the value before (AC-01-02). Nothing a ticket is judged
  // by is here, so nothing is queued.
  changeClient(person: string, clientId: string, changes: ClientChanges): Promise<Outcome<Client>> {
    return this.setup(person, (tx) => tx.client.update({ where: { id: clientId }, data: changes }));
  }

  // Step 2: by its name or its reference; one declaration event is shared by every client's
  // projects under it (ADR-026).
  findDeclarationEvents(asked: Searched): Promise<Found<DeclarationEvent>> {
    return this.db.$read(async (tx) => {
      const last =
        asked.after === undefined
          ? null
          : await tx.declarationEvent.findUnique({ where: { id: asked.after } });
      if (asked.after !== undefined && last === null) return { records: [], next: null };
      const rows = await tx.declarationEvent.findMany({
        where: {
          archivedAt: null,
          AND: [
            {
              OR: [
                { name: { contains: asked.search, mode: 'insensitive' } },
                { reference: { contains: asked.search, mode: 'insensitive' } },
              ],
            },
            afterInNameOrder(last),
          ],
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: asked.limit + 1,
      });
      return paged(rows, asked.limit);
    });
  }

  declarationEvent(person: string, input: NewDeclarationEvent): Promise<Outcome<DeclarationEvent>> {
    return this.setup(person, (tx) =>
      tx.declarationEvent.create({
        data: {
          name: input.name,
          reference: input.reference,
          referenceTypeId: input.referenceTypeId,
        },
      }),
    );
  }

  // Its name, its reference as written or its reference type, audited with the value before.
  changeDeclarationEvent(
    person: string,
    declarationEventId: string,
    changes: DeclarationEventChanges,
  ): Promise<Outcome<DeclarationEvent>> {
    return this.setup(person, (tx) =>
      tx.declarationEvent.update({ where: { id: declarationEventId }, data: changes }),
    );
  }

  // Step 3: the project, with a new project's settings, the kinds of unit rate work it allows and
  // its number series.
  project(person: string, input: NewProject): Promise<Outcome<Project>> {
    return this.setup(person, async (tx) => {
      const numbers = new NewProjectNumbers(input.ticketNumberSource).series(
        input.numbersFrom ?? {},
      );
      if (numbers.refusal !== null) throw new Refused(numbers.refusal);
      const programType = await tx.programType.findUniqueOrThrow({
        where: { id: input.programTypeId },
      });
      const project = await tx.project.create({
        data: {
          name: input.name,
          clientId: input.clientId,
          declarationEventId: input.declarationEventId,
          programTypeId: programType.id,
          timeZone: input.timeZone,
          activeFrom: day(input.activeFrom),
          activeTo: input.activeTo === null ? null : day(input.activeTo),
          ticketNumberSource: input.ticketNumberSource,
          workflows: [...input.workflows],
          ...new NewProjectSettings(this.policy).for(programType),
        },
      });
      for (const kindOfWorkId of input.kindOfWorkIds) {
        await tx.projectKindOfWork.create({ data: { projectId: project.id, kindOfWorkId } });
      }
      for (const { series, firstNumber } of numbers.series) {
        await tx.projectNumberSeries.create({
          data: { projectId: project.id, series, firstNumber, nextNumber: firstNumber },
        });
      }
      return project;
    });
  }

  // A series the project doesn't have yet, from the number the firm says: its cert numbers, seeded
  // after the project was made. A series that exists is never started again.
  numberSeries(
    person: string,
    projectId: string,
    series: NumberSeries,
    firstNumber: number,
  ): Promise<Outcome<ProjectNumberSeries>> {
    return this.setup(person, async (tx) => {
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      const refusal =
        new NewProjectNumbers(project.ticketNumberSource).refusal(series) ??
        new NumberSeriesRules(series).start(firstNumber);
      if (refusal !== null) throw new Refused(refusal);
      return tx.projectNumberSeries.create({
        data: { projectId, series, firstNumber, nextNumber: firstNumber },
      });
    });
  }

  // A run of pre-printed control tickets, on a project that numbers its tickets from them
  // (ADR-056): sent with the phones' lists. Refused when it shares a number with a range of the
  // same series already entered.
  controlRange(person: string, input: NewControlRange): Promise<Outcome<ControlRange>> {
    return this.setup(person, async (tx) => {
      const project = await tx.project.findUniqueOrThrow({ where: { id: input.projectId } });
      const entered = await tx.controlRange.findMany({ where: { projectId: input.projectId } });
      const refusal = new ControlRanges(
        project.ticketNumberSource,
        entered.map((range) => ({ ...range, archived: range.archivedAt !== null })),
      ).check({ ...input, archived: false });
      if (refusal !== null) throw new Refused(refusal);
      const range = await tx.controlRange.create({ data: { ...input } });
      // A number outside every range is flagged; one inside a new range no longer is.
      await this.setupChanged(tx, person, input.projectId);
      return range;
    });
  }

  // A range entered by mistake is taken off, never deleted.
  archiveControlRange(person: string, controlRangeId: string): Promise<Outcome<ControlRange>> {
    return this.setup(person, async (tx) => {
      const range = await tx.controlRange.update({
        where: { id: controlRangeId },
        data: { archivedAt: this.clock.now() },
      });
      await this.setupChanged(tx, person, range.projectId);
      return range;
    });
  }

  // The firm changes a project's own settings afterwards, audited with the value before.
  changeSettings(
    person: string,
    projectId: string,
    changes: Partial<ProjectSettings>,
  ): Promise<Outcome<Project>> {
    return this.setup(person, async (tx) => {
      const project = await tx.project.update({ where: { id: projectId }, data: changes });
      await this.setupChanged(tx, person, projectId);
      return project;
    });
  }

  // The project's active window, changed: an ordinary edit, audited with the dates before
  // (AC-09-25). A ticket outside the window is flagged and one now inside it no longer is, so
  // the project's un-invoiced tickets are queued. An end before the start is the database's to
  // refuse: the call throws, and nothing is saved.
  changeWindow(person: string, projectId: string, window: ActiveWindow): Promise<Outcome<Project>> {
    return this.setup(person, async (tx) => {
      const project = await tx.project.update({
        where: { id: projectId },
        data: {
          ...(window.activeFrom === undefined ? {} : { activeFrom: day(window.activeFrom) }),
          ...(window.activeTo === undefined
            ? {}
            : { activeTo: window.activeTo === null ? null : day(window.activeTo) }),
        },
      });
      await this.setupChanged(tx, person, projectId);
      return project;
    });
  }

  // What is still open on the project, read before an admin closes it (ADR-529 (b)).
  closingCheck(person: string, projectId: string): Promise<Outcome<readonly ClosingItem[]>> {
    return this.asAdmin(person, 'close a project', async (tx) =>
      new ProjectClosing(await ProjectSetup.openItems(tx, projectId)).items(),
    );
  }

  // An admin closes the project, by hand (ADR-529 (b)): what is still open is said with it, and
  // never stops it; only work the worker has under way does. In the same piece of work, before
  // the mark: every assignment on it that stands is withdrawn ("Project closed."), and every
  // number block its phones hold is retired, so no phone takes its work again. From the mark on,
  // the database refuses every write to its records, the worker's too. A project closed already
  // is answered as it stands, and nothing is written.
  close(person: string, projectId: string): Promise<Outcome<Project>> {
    return this.asAdmin(person, 'close a project', async (tx, warn) => {
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      if (project.closedAt !== null) return project;
      const closing = new ProjectClosing(await ProjectSetup.openItems(tx, projectId));
      const refusal = closing.refusal(project.name);
      if (refusal !== null) throw new Refused(refusal);
      warn(closing.items());
      const now = this.clock.now();
      await tx.assignment.updateMany({
        where: { projectId, archivedAt: null },
        data: { archivedAt: now, withdrawalNote: 'Project closed.' },
      });
      await tx.numberBlock.updateMany({
        where: { projectId, status: 'ISSUED' },
        data: { status: 'RETIRED', endedAt: now },
      });
      return tx.project.update({ where: { id: projectId }, data: { closedAt: now } });
    });
  }

  // An admin reopens a closed project, with a reason, kept by the audit (ADR-529 (b)). What its
  // close withdrew and retired stays so.
  reopen(person: string, projectId: string, reason: string): Promise<Outcome<Project>> {
    return this.asAdmin(
      person,
      'reopen a project',
      async (tx) => {
        const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
        const refusal = ProjectClosing.reopenRefusal(project);
        if (refusal !== null) throw new Refused(refusal);
        return tx.project.update({ where: { id: projectId }, data: { closedAt: null } });
      },
      reason,
    );
  }

  // What is open on a project, counted (ADR-529 (b)).
  private static async openItems(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<ProjectOpenItems> {
    const phones = await tx.device.findMany({
      where: {
        keyRevokedAt: null,
        OR: [
          { assignments: { some: { projectId } } },
          { numberBlocks: { some: { projectId } } },
          { fieldEvents: { some: { projectId } } },
        ],
      },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    // A ticket, as QC and the lock mark it: a completed load or haul-out, or a unit rate event,
    // that isn't void.
    const notVoid = { status: { not: 'VOID' as const } };
    const tickets = [
      ...(
        await tx.completedLoad.findMany({
          where: { projectId, dissolvedAt: null, disposalEvent: notVoid },
          select: { id: true },
        })
      ).map(({ id }) => `load ${id}`),
      ...(
        await tx.completedHaulOut.findMany({
          where: { projectId, dissolvedAt: null, disposalEvent: notVoid },
          select: { id: true },
        })
      ).map(({ id }) => `haul-out ${id}`),
      ...(
        await tx.fieldEvent.findMany({
          where: { projectId, kind: 'UNIT_RATE', ...notVoid },
          select: { id: true },
        })
      ).map(({ id }) => `unit rate ${id}`),
    ];
    const marked = (row: {
      completedLoadId: string | null;
      completedHaulOutId: string | null;
      fieldEventId: string | null;
    }): string =>
      row.completedLoadId !== null
        ? `load ${row.completedLoadId}`
        : row.completedHaulOutId !== null
          ? `haul-out ${row.completedHaulOutId}`
          : `unit rate ${row.fieldEventId ?? ''}`;
    const marks = { completedLoadId: true, completedHaulOutId: true, fieldEventId: true } as const;
    const approved = new Set(
      (
        await tx.qcMark.findMany({ where: { projectId, status: 'QC_APPROVED' }, select: marks })
      ).map(marked),
    );
    const locked = new Set(
      (
        await tx.invoiceLock.findMany({ where: { projectId, unlockedAt: null }, select: marks })
      ).map(marked),
    );
    return {
      phonesNotTurnedIn: phones.map(({ name }) => name),
      ticketsNotQcApproved: tickets.filter((ticket) => !approved.has(ticket)).length,
      ticketsNotInvoiced: tickets.filter((ticket) => !locked.has(ticket)).length,
      heldWaiting: await tx.heldRecord.count({ where: { projectId, resolvedAt: null } }),
      quarantinedWaiting: await tx.quarantinedRecord.count({
        where: { projectId, resolvedAt: null },
      }),
      jobsWaiting: await tx.reconciliationJob.count({
        where: { projectId, finishedAt: null, setAsideAt: null },
      }),
    };
  }

  // A field tag: the project's own list, starting empty; added at the end of it (ADR-216).
  fieldTag(person: string, projectId: string, name: string): Promise<Outcome<FieldTag>> {
    return this.setup(person, async (tx) => {
      const last = await tx.fieldTag.aggregate({ where: { projectId }, _max: { position: true } });
      return tx.fieldTag.create({
        data: { projectId, name, position: (last._max.position ?? 0) + 1 },
      });
    });
  }

  // The project's map: its boundary and its zones, as the next version; an earlier version and its
  // zones stay as they were (ADR-141). The zones are written with their version, in the same piece
  // of work: the database takes them no other way. As GeoJSON, or read from a map's file kept
  // beforehand, whose place the version keeps (`MapFiles`, ADR-485).
  loadMap(person: string, input: NewMap): Promise<Outcome<MapVersion>> {
    return this.setup(person, async (tx) => {
      const boundary = new MapShapes(input.boundary).shape();
      if (boundary.read === null) throw ProjectSetup.notLoaded(boundary.problem);
      const zones =
        input.zones === null
          ? { read: [], problem: null }
          : new MapShapes(input.zones).zones(input.zoneNameField ?? '');
      if (zones.read === null) throw ProjectSetup.notLoaded(zones.problem);
      const last = await tx.mapVersion.aggregate({
        where: { projectId: input.projectId },
        _max: { version: true },
      });
      const version = await tx.mapVersion.create({
        data: {
          projectId: input.projectId,
          version: (last._max.version ?? 0) + 1,
          source: input.source,
          sourceName: input.sourceName,
          zoneNameField: input.zoneNameField,
          uploadedFileKey: input.uploadedFileKey ?? null,
          zonesSourceName: input.zonesSourceName ?? null,
          zonesFileKey: input.zonesFileKey ?? null,
          boundary: boundary.read.geometry satisfies Prisma.InputJsonObject,
          ...boundary.read.box,
          loadedById: person,
        },
      });
      for (const zone of zones.read) {
        await tx.zone.create({
          data: {
            mapVersionId: version.id,
            name: zone.name,
            geometry: zone.geometry satisfies Prisma.InputJsonObject,
            ...zone.box,
          },
        });
      }
      await this.setupChanged(tx, person, input.projectId);
      return version;
    });
  }

  private static notLoaded(problem: string): Refused {
    return new Refused({ code: 'MAP_NOT_READ', message: `Not loaded: ${problem}` });
  }
}
