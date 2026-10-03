// Setup steps 1 to 3, and the project's own lists and map (spec/parts/01-setup.md; ADR-023, 026,
// 127, 135, 141, 216, 303, 311): the client and the declaration event, searched for and picked or
// created; the project under them; the kinds of unit rate work it allows; its field tags; its map.
// A new project's settings start as packages/domain's NewProjectSettings says, from the policy
// values: the database gives none a default (ADR-303).
import type {
  Client,
  Database,
  DeclarationEvent,
  FieldTag,
  MapSource,
  MapVersion,
  Prisma,
  Project,
  TicketNumberSource,
  Workflow,
} from '@open-adms/db';
import {
  MapShapes,
  NewProjectSettings,
  type Policy,
  type ProjectSettings,
} from '@open-adms/domain';

import { type Clock, day, type Outcome, Refused, SetupService } from './setup-service.ts';

export interface NewClient {
  readonly name: string;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly notes?: string;
}

export interface NewDeclarationEvent {
  readonly name: string;
  // As written: DR-9001-FL.
  readonly reference: string;
  readonly referenceTypeId: string;
}

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
}

export class ProjectSetup extends SetupService {
  private readonly policy: Policy;

  constructor(db: Database, clock: Clock, policy: Policy) {
    super(db, clock);
    this.policy = policy;
  }

  // Step 1: search first; a client that exists is picked, never created again (ADR-023).
  findClients(search: string): Promise<Client[]> {
    return this.db.client.findMany({
      where: { name: { contains: search, mode: 'insensitive' }, archivedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  client(person: string, input: NewClient): Promise<Outcome<Client>> {
    return this.write(person, (tx) =>
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

  // Step 2: by its name or its reference; one declaration event is shared by every client's
  // projects under it (ADR-026).
  findDeclarationEvents(search: string): Promise<DeclarationEvent[]> {
    return this.db.declarationEvent.findMany({
      where: {
        archivedAt: null,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
    });
  }

  declarationEvent(person: string, input: NewDeclarationEvent): Promise<Outcome<DeclarationEvent>> {
    return this.write(person, (tx) =>
      tx.declarationEvent.create({
        data: {
          name: input.name,
          reference: input.reference,
          referenceTypeId: input.referenceTypeId,
        },
      }),
    );
  }

  // Step 3: the project, with a new project's settings, and the kinds of unit rate work it allows.
  project(person: string, input: NewProject): Promise<Outcome<Project>> {
    return this.write(person, async (tx) => {
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
      return project;
    });
  }

  // The firm changes a project's own settings afterwards, audited with the value before.
  changeSettings(
    person: string,
    projectId: string,
    changes: Partial<ProjectSettings>,
  ): Promise<Outcome<Project>> {
    return this.write(person, (tx) =>
      tx.project.update({ where: { id: projectId }, data: changes }),
    );
  }

  // A field tag: the project's own list, starting empty; added at the end of it (ADR-216).
  fieldTag(person: string, projectId: string, name: string): Promise<Outcome<FieldTag>> {
    return this.write(person, async (tx) => {
      const last = await tx.fieldTag.aggregate({ where: { projectId }, _max: { position: true } });
      return tx.fieldTag.create({
        data: { projectId, name, position: (last._max.position ?? 0) + 1 },
      });
    });
  }

  // The project's map: its boundary and its zones, as the next version; an earlier version and its
  // zones stay as they were (ADR-141). The zones are written with their version, in the same piece
  // of work: the database takes them no other way. Phase 1 takes GeoJSON only (ADR-311).
  loadMap(person: string, input: NewMap): Promise<Outcome<MapVersion>> {
    return this.write(person, async (tx) => {
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
      return version;
    });
  }

  private static notLoaded(problem: string): Refused {
    return new Refused({ code: 'MAP_NOT_READ', message: `Not loaded: ${problem}` });
  }
}
