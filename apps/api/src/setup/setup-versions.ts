// The setup version: a number for what a project's phones are shown of its setup (ARCHITECTURE
// §7's note, §9 (6); spec/DATA-MODEL.md §4.5; AC-02-37, AC-02-43, AC-05-48; BACKLOG 2.5.3, C117,
// C118; ADR-240, 453).
//
// - **What is numbered is the project's setup as a phone is shown it**, whole for the project:
//   the lists a monitor picks from and what each site's phones ask for. A phone's own lists are
//   its assignment's part of it, so a field event's assignment and version together say what
//   its phone showed. Not the certifications, the ROEs or a phone's blocks of numbers: each is
//   a record with its own history, and a new one makes no new version.
// - **A version is made when a phone is first sent lists that differ from the newest one**, and
//   at no other time: what is kept is what a phone was sent. The record names the device key's
//   actor on that phone (ADR-440): no person made it.
// - **The database numbers and keeps them** (the guard migration): 1, 2, 3… per project with no
//   gap, a new one only for a change, never edited, never deleted.
// - Never a rate, a rule, a transaction or a load's pay item (invariant 20): none is read here.
import { byDeviceKey, type Database, type Prisma } from '@open-adms/db';
import type {
  DumpedForm,
  IncidentOffer,
  NumberSeriesName,
  QuantityAskName,
} from '@open-adms/domain';

import { SetupStanding } from './setup-standing.ts';

interface Named {
  readonly id: string;
  readonly name: string;
}

// What a project's phones are shown of its setup: the contracts' `setupShownSchema`.
export interface SetupShown {
  // The project's pre-printed stock, for a project that numbers from it.
  readonly controlRanges: readonly {
    readonly series: NumberSeriesName;
    readonly firstNumber: number;
    readonly lastNumber: number;
  }[];
  // The entries on the project's load and haul-out forms, without those hidden on phones; each
  // id is the entry's.
  readonly debrisTypes: { readonly LOAD: readonly Named[]; readonly HAUL_OUT: readonly Named[] };
  readonly fieldTags: readonly Named[];
  readonly typedNumberReasons: readonly Named[];
  readonly sites: readonly (Named & {
    readonly siteType: Named;
    readonly takesLoads: boolean;
    readonly haulOutsLeaveHere: boolean;
  })[];
  // Every unit rate pay item of the project; a phone holds those its assignment names.
  readonly payItems: readonly {
    readonly id: string;
    readonly code: string;
    readonly bandFrom: number | null;
    readonly bandTo: number | null;
    readonly archived: boolean;
    readonly payableType: Named;
    readonly kindOfWork: Named;
    readonly countIsAlwaysOne: boolean;
    readonly gpsRequired: boolean;
    readonly measurementRequired: boolean;
    readonly decimalsAllowed: boolean;
    readonly photosRequired: boolean;
    readonly monitorMayMarkIneligible: boolean;
    readonly quantityFromCarriedTickets: boolean;
  }[];
  readonly itemNames: readonly (Named & { readonly kindOfWorkId: string })[];
  readonly incidentTypes: readonly (Named & { readonly subTypes: readonly Named[] })[];
  readonly incidentOffers: readonly IncidentOffer[];
  readonly contractors: readonly Named[];
  readonly surveyWorkTypes: readonly Named[];
  // What each live site's phones ask for (ADR-227, 243), for the debris types phones hold.
  readonly quantityLookup: readonly {
    readonly siteId: string;
    readonly form: DumpedForm;
    readonly debrisTypeId: string;
    readonly primeId: string;
    readonly asks: QuantityAskName;
  }[];
}

const name = ({ id, name }: Named): Named => ({ id, name });

// One writing of a value whatever order its keys were made or kept in: the database keeps an
// object's keys in its own order.
const written = (value: unknown): string =>
  JSON.stringify(value, (_key, part: unknown) =>
    part !== null && typeof part === 'object' && !Array.isArray(part)
      ? Object.fromEntries(
          Object.entries(part).sort(([one], [other]) => (one < other ? -1 : one > other ? 1 : 0)),
        )
      : part,
  );

export class SetupVersions {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // The project's live sites, as a phone is shown one: its name, its type and what it is for.
  static async sitesShownIn(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<SetupShown['sites']> {
    const sites = await tx.disposalSite.findMany({
      where: { projectId, archivedAt: null },
      select: {
        id: true,
        name: true,
        takesLoads: true,
        haulOutsLeaveHere: true,
        siteType: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return sites.map((site) => ({
      ...name(site),
      siteType: name(site.siteType),
      takesLoads: site.takesLoads,
      haulOutsLeaveHere: site.haulOutsLeaveHere,
    }));
  }

  // The project's unit rate pay items, as a phone is shown one: its code and capture settings,
  // never a rate. Every one, or only those in service.
  static async payItemsShownIn(
    tx: Prisma.TransactionClient,
    projectId: string,
    only?: 'IN_SERVICE',
  ): Promise<SetupShown['payItems']> {
    const payItems = await tx.payItem.findMany({
      where: {
        projectId,
        kindOfWorkId: { not: null },
        ...(only === undefined ? {} : { archivedAt: null }),
      },
      select: {
        id: true,
        code: true,
        bandFrom: true,
        bandTo: true,
        archivedAt: true,
        payableType: { select: { id: true, name: true } },
        kindOfWork: { select: { id: true, name: true } },
        countIsAlwaysOne: true,
        gpsRequired: true,
        measurementRequired: true,
        decimalsAllowed: true,
        photosRequired: true,
        monitorMayMarkIneligible: true,
        quantityFromCarriedTickets: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return payItems.flatMap((payItem) =>
      payItem.kindOfWork === null
        ? []
        : [
            {
              id: payItem.id,
              code: payItem.code,
              bandFrom: payItem.bandFrom?.toNumber() ?? null,
              bandTo: payItem.bandTo?.toNumber() ?? null,
              archived: payItem.archivedAt !== null,
              payableType: name(payItem.payableType),
              kindOfWork: name(payItem.kindOfWork),
              countIsAlwaysOne: payItem.countIsAlwaysOne,
              gpsRequired: payItem.gpsRequired,
              measurementRequired: payItem.measurementRequired,
              decimalsAllowed: payItem.decimalsAllowed,
              photosRequired: payItem.photosRequired,
              monitorMayMarkIneligible: payItem.monitorMayMarkIneligible,
              quantityFromCarriedTickets: payItem.quantityFromCarriedTickets,
            },
          ],
    );
  }

  // What the project's phones are shown now, inside a piece of work that is already reading.
  // One query at a time: a piece of work has one connection.
  static async shownIn(tx: Prisma.TransactionClient, projectId: string): Promise<SetupShown> {
    const controlRanges = await tx.controlRange.findMany({
      where: { projectId, archivedAt: null },
      orderBy: [{ series: 'asc' }, { firstNumber: 'asc' }],
    });
    const forms = await tx.form.findMany({
      where: { projectId, documentType: { in: ['LOAD', 'HAUL_OUT'] } },
    });
    const entries = await tx.formDebrisType.findMany({
      where: {
        formId: { in: forms.map((form) => form.id) },
        hiddenOnPhones: false,
        archivedAt: null,
      },
      include: { debrisType: true },
      orderBy: { createdAt: 'asc' },
    });
    const named = (documentType: 'LOAD' | 'HAUL_OUT') =>
      entries
        .filter((entry) => entry.documentType === documentType)
        .map((entry) => ({ id: entry.id, name: entry.debrisType.name }));
    const fieldTags = await tx.fieldTag.findMany({
      where: { projectId, archivedAt: null },
      orderBy: { position: 'asc' },
    });
    const reasons = await tx.reason.findMany({
      where: { uses: { has: 'TYPED_NUMBER' }, archivedAt: null },
      orderBy: { position: 'asc' },
    });
    const sites = await SetupVersions.sitesShownIn(tx, projectId);
    // An archived one too: an assignment may still name it.
    const payItems = await SetupVersions.payItemsShownIn(tx, projectId);
    const kindsOfWork = [...new Set(payItems.map(({ kindOfWork }) => kindOfWork.id))];
    const itemNames = await tx.itemName.findMany({
      where: { kindOfWorkId: { in: kindsOfWork }, archivedAt: null },
      orderBy: { position: 'asc' },
    });
    const incidentTypes = await tx.incidentType.findMany({
      where: { archivedAt: null },
      include: { subTypes: { where: { archivedAt: null }, orderBy: { position: 'asc' } } },
      orderBy: { position: 'asc' },
    });
    // What the project's incident form offers, and the contractors on the project to pick "the
    // contractor involved" from (ADR-328).
    const incidentForm = await tx.form.findFirst({
      where: { projectId, documentType: 'INCIDENT' },
    });
    const incidentOffers = (incidentForm?.incidentOffers ?? []) as IncidentOffer[];
    const placed = incidentOffers.includes('CONTRACTOR')
      ? await tx.projectContractor.findMany({
          where: { projectId, archivedAt: null },
          include: { contractor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const surveyWorkTypes = await tx.surveyWorkType.findMany({
      where: { archivedAt: null },
      orderBy: { position: 'asc' },
    });
    // What each site's phones ask for, for the debris types a phone holds: one hidden on phones
    // has no row.
    const carried = new Set(entries.map((entry) => entry.id));
    const asks = await SetupStanding.quantityLookupOf(tx, projectId);
    return {
      controlRanges: controlRanges.map(({ series, firstNumber, lastNumber }) => ({
        series,
        firstNumber,
        lastNumber,
      })),
      debrisTypes: { LOAD: named('LOAD'), HAUL_OUT: named('HAUL_OUT') },
      fieldTags: fieldTags.map(name),
      typedNumberReasons: reasons.map(name),
      sites,
      payItems,
      itemNames: itemNames.map((item) => ({ ...name(item), kindOfWorkId: item.kindOfWorkId })),
      incidentTypes: incidentTypes.map((type) => ({
        ...name(type),
        subTypes: type.subTypes.map(name),
      })),
      incidentOffers,
      contractors: placed.map((place) => name(place.contractor)),
      surveyWorkTypes: surveyWorkTypes.map(name),
      quantityLookup: asks
        .filter((ask) => carried.has(ask.debrisTypeId))
        .map(({ siteId, form, debrisTypeId, primeId, asks }) => ({
          siteId,
          form,
          debrisTypeId,
          primeId,
          asks,
        })),
    };
  }

  // The version that is what a phone is being sent: the project's newest where nothing a phone
  // is shown has changed since, and otherwise a new one, the next number, made now for that
  // phone.
  async numbered(projectId: string, shown: SetupShown, deviceId: string): Promise<number> {
    const sent = written(shown);
    const newest = await this.newest(projectId);
    if (newest !== null && written(newest.content) === sent) return newest.version;
    const before = newest?.version ?? 0;
    try {
      const made = await this.db.$write(byDeviceKey(deviceId), (tx) =>
        tx.setupManifest.create({
          data: {
            projectId,
            version: before + 1,
            content: JSON.parse(sent) as Prisma.InputJsonObject,
          },
          select: { version: true },
        }),
      );
      return made.version;
    } catch (refused) {
      // Two phones sent the same change at one moment: the database took the first and refused
      // the second, whose version is the one just made.
      const now = await this.newest(projectId);
      if (now !== null && now.version > before && written(now.content) === sent) return now.version;
      throw refused;
    }
  }

  private newest(projectId: string) {
    return this.db.$read((tx) =>
      tx.setupManifest.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
        select: { version: true, content: true },
      }),
    );
  }
}
