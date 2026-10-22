// Setup as the back office reads it (spec/parts/01-setup.md; REQ-217; BACKLOG 2.8.8, C99, C100,
// C169; ADR-229, 316, 357, 485, 527, 529, 535 (2)). OWASP API1, API3, API4; ASVS V8, 3.2.1, V5.4.
//
// - **Open to an admin, and to a manager/analyst granted "view setup"** (the user, ADR-539); the
//   projects and the lists' values to every admin and manager/analyst in service. Asked again
//   inside the read. **A pay item's rates are a read of their own, which takes Setup** (an admin,
//   or a manager/analyst who holds it now, with "view setup" beside it): the domain's
//   `SetupRights`, asked here as a setup save asks it.
// - **Each list is a page**, in the order its screen reads it (a name, a code, a list's own
//   order, a version newest first); one row more is read to know whether another follows.
// - **A rule is read as the worker runs it** (packages/db's `RuleRows`), whole, with "Is valid"
//   as the domain's `RuleValidity` works it out now, never stored (spec/RULES.md §7).
// - **A kept map's file is handed back as it was kept** (ADR-483, 485): the bytes stored, read
//   only from the place the server made for it, their fingerprint and kind checked again; never
//   where it is kept.
import type {
  FirmList,
  FormsAnswer,
  ListValueRead,
  ListValuesAnswer,
  MapVersionAnswer,
  MapVersionsAnswer,
  PayItemRatesAnswer,
  PayItemsAnswer,
  ProjectAnswer,
  ProjectsAnswer,
  RuleRead,
  RulesAnswer,
  SiteShapeVersionsAnswer,
  SitesAnswer,
} from '@open-adms/contracts';
import { RuleRows, type Database, type MapVersion, type Prisma } from '@open-adms/db';
import {
  mapFileSignatureBytes,
  mapFileTypeOf,
  RuleValidity,
  type MapFileType,
} from '@open-adms/domain';
import { createHash } from 'node:crypto';

import type { Media } from '../media/media-store.ts';
import { Refusal } from '../process/refusal.ts';
import { backOfficeReader, fromCursor, pageOf, type PageAsked } from '../review/review-reads.ts';
import { setupRefusalOf } from './setup-service.ts';
import {
  contractorPlaceRecord,
  contractRecord,
  controlRangeRecord,
  crewDayStepsRecord,
  formDebrisTypeRecord,
  formDefinitionRecord,
  formRecord,
  listValueRecord,
  mapVersionRecord,
  numberSeriesRecord,
  payItemRateRecord,
  payItemRecord,
  projectRecord,
  siteAreaVersionRecord,
  siteLabelRecord,
  siteRecord,
  siteTippingFeeRecord,
} from './setup-records.ts';

type Tx = Prisma.TransactionClient;

const notFound = (words?: string): Refusal => new Refusal('NOT_FOUND', 404, words);

// A kept map's file, as it is handed back.
export interface KeptMapFile {
  readonly bytes: Buffer;
  readonly contentType: MapFileType;
}

// Each list's table, read through what every list has, and what its list asks beside a name.
type ListRow = {
  readonly id: string;
  readonly key?: string | null;
  readonly name: string;
  readonly position: number;
  readonly archivedAt: Date | null;
} & Readonly<Record<string, unknown>>;
interface ListTable {
  findMany(args: object): Promise<ListRow[]>;
}
const tables: Record<FirmList, (tx: Tx) => unknown> = {
  'program-types': (tx: Tx) => tx.programType,
  'declaration-reference-types': (tx: Tx) => tx.declarationReferenceType,
  'debris-types': (tx: Tx) => tx.debrisType,
  'reduction-methods': (tx: Tx) => tx.reductionMethod,
  'payable-types': (tx: Tx) => tx.payableType,
  'kinds-of-work': (tx: Tx) => tx.kindOfWork,
  'item-names': (tx: Tx) => tx.itemName,
  'vehicle-types': (tx: Tx) => tx.vehicleType,
  'vehicle-features': (tx: Tx) => tx.vehicleFeature,
  'crew-types': (tx: Tx) => tx.crewType,
  'site-types': (tx: Tx) => tx.siteType,
  'site-labels': (tx: Tx) => tx.siteLabel,
  'incident-types': (tx: Tx) => tx.incidentType,
  'incident-sub-types': (tx: Tx) => tx.incidentSubType,
  reasons: (tx: Tx) => tx.reason,
  'survey-work-types': (tx: Tx) => tx.surveyWorkType,
  'clock-activities': (tx: Tx) => tx.clockActivity,
  'field-tags': (tx: Tx) => tx.fieldTag,
} as const;

// What a list's value has beside its name, where its list asks it; null where it doesn't.
const asked = (row: ListRow, column: string): unknown => (column in row ? row[column] : null);

const listValueRead = (row: ListRow): ListValueRead => ({
  ...listValueRecord({ ...row, key: row.key ?? null }),
  requiresRoe: asked(row, 'requiresRoe') as boolean | null,
  countShape: asked(row, 'countShape') as string | null,
  photosByStage: asked(row, 'photosByStage') as boolean | null,
  kindOfWorkId: asked(row, 'kindOfWorkId') as string | null,
  certifies: asked(row, 'certifies') as 'CONTAINER' | 'CREW' | null,
  incidentTypeId: asked(row, 'incidentTypeId') as string | null,
  uses: asked(row, 'uses') as string[] | null,
  projectId: asked(row, 'projectId') as string | null,
});

const fingerprintOf = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const listedMapVersion = (
  version: MapVersion & { readonly zones: readonly { id: string; name: string }[] },
): MapVersionsAnswer['mapVersions'][number] => ({
  ...mapVersionRecord(version),
  zonesFileKept: version.zonesFileKey !== null,
  zones: version.zones.map((zone) => ({ id: zone.id, name: zone.name })),
});

export class SetupReads {
  private readonly db: Database;
  private readonly media: Media;
  private readonly fileBytesAtMost: number;

  constructor(db: Database, parts: { readonly media: Media; readonly fileBytesAtMost: number }) {
    this.db = db;
    this.media = parts.media;
    this.fileBytesAtMost = parts.fileBytesAtMost;
  }

  // The firm's projects in name order, closed ones or open ones where asked.
  projects(
    readerId: string,
    page: PageAsked & { readonly closed?: boolean | undefined },
  ): Promise<ProjectsAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, null);
      const rows = await tx.project.findMany({
        where: page.closed === undefined ? {} : { closedAt: page.closed ? { not: null } : null },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...fromCursor(page),
      });
      const { rows: shown, next } = pageOf(rows, page.limit);
      return { projects: shown.map(projectRecord), next };
    });
  }

  // One project's page: its record, kinds of work, contractors' places by name and contracts, and
  // how it numbers its tickets: each series it started and the control ticket ranges entered.
  project(readerId: string, projectId: string): Promise<ProjectAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, null);
      const project = await tx.project.findUnique({
        where: { id: projectId },
        include: {
          kindsOfWork: { orderBy: { kindOfWorkId: 'asc' } },
          contractors: { orderBy: { id: 'asc' }, include: { contractor: true } },
          contracts: { orderBy: [{ name: 'asc' }, { id: 'asc' }] },
          numberSeries: { orderBy: { series: 'asc' } },
          controlRanges: { orderBy: [{ series: 'asc' }, { firstNumber: 'asc' }] },
        },
      });
      if (project === null) throw notFound();
      const { kindsOfWork, contractors, contracts, numberSeries, controlRanges, ...record } =
        project;
      return {
        project: projectRecord(record),
        kindOfWorkIds: kindsOfWork.map((kind) => kind.kindOfWorkId),
        contractors: contractors.map(({ contractor, ...place }) => ({
          ...contractorPlaceRecord(place),
          name: contractor.name,
        })),
        contracts: contracts.map(contractRecord),
        numberSeries: numberSeries.map(numberSeriesRecord),
        controlRanges: controlRanges.map(controlRangeRecord),
      };
    });
  }

  // A project's forms, each with its debris types' entries and its fields' newest version.
  forms(readerId: string, projectId: string): Promise<FormsAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_SETUP');
      await SetupReads.projectIn(tx, projectId);
      const forms = await tx.form.findMany({
        where: { projectId },
        orderBy: { id: 'asc' },
        include: {
          debrisTypes: { orderBy: { id: 'asc' } },
          definitions: { orderBy: { version: 'desc' }, take: 1 },
        },
      });
      return {
        forms: forms.map(({ debrisTypes, definitions, ...form }) => {
          const [newest] = definitions;
          return {
            form: formRecord(form),
            debrisTypes: debrisTypes.map(formDebrisTypeRecord),
            definition: newest === undefined ? null : formDefinitionRecord(newest),
          };
        }),
      };
    });
  }

  // A project's pay items by code, each with its crew day's steps in force: never a rate.
  payItems(readerId: string, projectId: string, page: PageAsked): Promise<PayItemsAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_SETUP');
      await SetupReads.projectIn(tx, projectId);
      const rows = await tx.payItem.findMany({
        where: { projectId },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        include: {
          crewDaySteps: { where: { archivedAt: null }, orderBy: { fromHours: 'asc' } },
        },
        ...fromCursor(page),
      });
      const { rows: shown, next } = pageOf(rows, page.limit);
      return {
        payItems: shown.map(({ crewDaySteps, ...payItem }) => ({
          payItem: payItemRecord(payItem),
          crewDaySteps: crewDayStepsRecord(payItem.id, crewDaySteps).steps,
        })),
        next,
      };
    });
  }

  // A project's rates by pay item and prime: only to whoever may set one (ADR-535 (2)).
  rates(readerId: string, projectId: string, page: PageAsked): Promise<PayItemRatesAnswer> {
    return this.db.$read(async (tx) => {
      if ((await setupRefusalOf(tx, readerId)) !== null) throw new Refusal('NOT_ALLOWED', 403);
      await SetupReads.projectIn(tx, projectId);
      const rows = await tx.payItemRate.findMany({
        where: { projectId },
        orderBy: [{ payItemId: 'asc' }, { primeId: 'asc' }, { id: 'asc' }],
        ...fromCursor(page),
      });
      const { rows: shown, next } = pageOf(rows, page.limit);
      return { rates: shown.map(payItemRateRecord), next };
    });
  }

  // A project's rules in the order written, each whole and whether it is valid now.
  rules(
    readerId: string,
    projectId: string,
    page: PageAsked & { readonly archived?: boolean | undefined },
  ): Promise<RulesAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_SETUP');
      await SetupReads.projectIn(tx, projectId);
      const ids = await tx.rule.findMany({
        where: {
          projectId,
          ...(page.archived === undefined
            ? {}
            : { archivedAt: page.archived ? { not: null } : null }),
        },
        orderBy: { id: 'asc' },
        select: { id: true },
        ...fromCursor(page),
      });
      const { rows: shown, next } = pageOf(ids, page.limit);
      const wanted = new Set(shown.map((row) => row.id));
      const entries = (await new RuleRows(tx, projectId).entries()).filter(
        (entry) => entry.id !== null && wanted.has(entry.id),
      );
      return {
        rules: entries.map((entry): RuleRead => {
          const reasons = new RuleValidity(entry).reasons();
          return {
            id: entry.id ?? '',
            name: entry.name,
            formId: entry.formId,
            form: entry.form,
            contractId: entry.contract?.id ?? null,
            active: entry.active,
            archived: entry.archived,
            fromPayItemId: entry.fromPayItem?.id ?? null,
            criteria: entry.criteria.map((line) => ({
              criterion: line.criterion,
              operator: line.operator,
              picks: line.picks.map((pick) => ({
                value: pick.value,
                name: pick.name,
                gone: pick.gone,
              })),
              numberFrom: line.numberFrom,
              numberTo: line.numberTo,
              dateFrom: line.dateFrom,
              dateTo: line.dateTo,
              text: line.text,
            })),
            actions: entry.actions.map((action) => ({
              kind: action.kind,
              slot: action.slot,
              payItemId: action.payItem?.id ?? null,
              quantityFrom: action.quantityFrom,
              itemNameIds: action.items.map((item) => item.id),
            })),
            valid: reasons.length === 0,
            reasons: [...reasons],
          };
        }),
        next,
      };
    });
  }

  // A project's sites in name order, each with its labels, fee links and newest shape.
  sites(readerId: string, projectId: string, page: PageAsked): Promise<SitesAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_SETUP');
      await SetupReads.projectIn(tx, projectId);
      const rows = await tx.disposalSite.findMany({
        where: { projectId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        include: {
          labels: { orderBy: { id: 'asc' } },
          tippingFees: { orderBy: { id: 'asc' } },
          areaVersions: { orderBy: { version: 'desc' }, take: 1 },
        },
        ...fromCursor(page),
      });
      const { rows: shown, next } = pageOf(rows, page.limit);
      return {
        sites: shown.map(({ labels, tippingFees, areaVersions, ...site }) => {
          const [newest] = areaVersions;
          return {
            site: siteRecord(site),
            labels: labels.map(siteLabelRecord),
            tippingFees: tippingFees.map(siteTippingFeeRecord),
            shape: newest === undefined ? null : siteAreaVersionRecord(newest),
          };
        }),
        next,
      };
    });
  }

  // A site's shape versions, newest first, each with its shape.
  siteShapes(readerId: string, siteId: string, page: PageAsked): Promise<SiteShapeVersionsAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_SETUP');
      const site = await tx.disposalSite.findUnique({
        where: { id: siteId },
        select: { id: true },
      });
      if (site === null) throw notFound();
      const rows = await tx.siteAreaVersion.findMany({
        where: { siteId },
        orderBy: [{ version: 'desc' }],
        ...fromCursor(page),
      });
      const { rows: shown, next } = pageOf(rows, page.limit);
      return {
        versions: shown.map((version) => ({
          ...siteAreaVersionRecord(version),
          shape: version.geometry as SiteShapeVersionsAnswer['versions'][number]['shape'],
        })),
        next,
      };
    });
  }

  // A project's map versions, newest first, each with its zones' names.
  mapVersions(readerId: string, projectId: string, page: PageAsked): Promise<MapVersionsAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_SETUP');
      await SetupReads.projectIn(tx, projectId);
      const rows = await tx.mapVersion.findMany({
        where: { projectId },
        orderBy: [{ version: 'desc' }],
        include: { zones: { orderBy: { name: 'asc' }, select: { id: true, name: true } } },
        ...fromCursor(page),
      });
      const { rows: shown, next } = pageOf(rows, page.limit);
      return { mapVersions: shown.map(listedMapVersion), next };
    });
  }

  // One map version with its boundary and its zones' shapes.
  mapVersion(readerId: string, mapVersionId: string): Promise<MapVersionAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_SETUP');
      const version = await tx.mapVersion.findUnique({
        where: { id: mapVersionId },
        include: { zones: { orderBy: { name: 'asc' } } },
      });
      if (version === null) throw notFound();
      type Shape = MapVersionAnswer['boundary'];
      return {
        mapVersion: listedMapVersion(version),
        boundary: version.boundary as Shape,
        zones: version.zones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          shape: zone.geometry as Shape,
        })),
      };
    });
  }

  // One of the firm's lists in its own order: its values in service, or the archived ones.
  listValues(
    readerId: string,
    list: FirmList,
    page: PageAsked & { readonly archived?: boolean | undefined },
  ): Promise<ListValuesAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, null);
      const table = tables[list](tx) as ListTable;
      const rows = await table.findMany({
        where: { archivedAt: page.archived === true ? { not: null } : null },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        ...fromCursor(page),
      });
      const { rows: shown, next } = pageOf(rows, page.limit);
      return { values: shown.map(listValueRead), next };
    });
  }

  // The file a site's shape version was loaded from, as it was kept.
  async siteShapeFile(readerId: string, siteAreaVersionId: string): Promise<KeptMapFile> {
    const place = await this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_SETUP');
      const version = await tx.siteAreaVersion.findUnique({
        where: { id: siteAreaVersionId },
        select: { uploadedFileKey: true },
      });
      if (version === null) throw notFound();
      return version.uploadedFileKey;
    });
    return this.keptAt(place, 'Not found: this shape was drawn, and no file was kept.');
  }

  // A map version's file, or its zones' copy, as it was kept.
  async mapVersionFile(
    readerId: string,
    mapVersionId: string,
    file: 'map' | 'zones',
  ): Promise<KeptMapFile> {
    const place = await this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_SETUP');
      const version = await tx.mapVersion.findUnique({
        where: { id: mapVersionId },
        select: { uploadedFileKey: true, zonesFileKey: true },
      });
      if (version === null) throw notFound();
      return file === 'map' ? version.uploadedFileKey : version.zonesFileKey;
    });
    return this.keptAt(
      place,
      file === 'map'
        ? 'Not found: this map was drawn, and no file was kept.'
        : 'Not found: this map’s zones came with its own file.',
    );
  }

  // A map's file kept where the server placed it, by its own fingerprint, checked again.
  private async keptAt(place: string | null, none: string): Promise<KeptMapFile> {
    if (place === null) throw notFound(none);
    const kept = await this.media.read(place, this.fileBytesAtMost);
    if (kept === null)
      throw new Error('The store holds no map’s file where its record says one is.');
    if (!place.endsWith(`/${fingerprintOf(kept.bytes)}`)) {
      throw new Error('The store holds another file where a map’s file was kept.');
    }
    const type = mapFileTypeOf(kept.bytes.subarray(0, mapFileSignatureBytes));
    if (type === null || type !== kept.contentType) {
      throw new Error('A map’s file isn’t the kind of file it was kept as.');
    }
    return { bytes: kept.bytes, contentType: type };
  }

  private static async projectIn(tx: Tx, projectId: string): Promise<void> {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (project === null) throw notFound();
  }
}
