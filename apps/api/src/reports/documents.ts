// Photo PDFs and the receipt batch (REQ-413, 414; spec/FROM-BUILD-1.md §1, §10): documents an
// auditor reads, drawn by packages/receipts' own PDF writer, made each time and kept nowhere.
// - **Photo PDFs, two standard layouts**: several items a page (each a row: its details, then up to
//   three photographs, three rows a page, each photograph as large as its place allows and never
//   cropped), or one item a page with its receipt beside its details and its photographs larger.
//   Items are tickets (each field event with its photographs), certifications and incidents.
// - **The receipt batch**: one or more ticket numbers, pasted with any separator, as just their
//   receipts (each field event's, as its phone prints it, from the same content model) or the
//   full record with its photographs and its receipt. **A number the project doesn't have is named
//   on the first page, never dropped.**
// A photograph is drawn from the file kept for it, the bytes its phone fingerprinted (JPEG or PNG
// as they are); a HEIC, HEIF or TIFF photograph is named in its place, to be opened in the back
// office (no converter is a dependency here). One removed from the record is left out. Read by
// whoever may see review, asked inside the read; never a rate, a driver's phone or licence number,
// or where a file is kept.
import { ProjectClock, type FieldEventKindName, type WorkflowName } from '@open-adms/domain';
import type { Database, Prisma } from '@open-adms/db';
import {
  fitted,
  fittedIn,
  linesOf,
  PdfPage,
  pdfImageOf,
  pdfOf,
  receiptPage,
  receiptPointsWide,
  Receipts,
  textWidth,
  type PdfImage,
  type Receipt,
  type Rgb,
} from '@open-adms/receipts';

import type { PhotographFiles } from '../media/photograph-files.ts';
import { Refusal } from '../process/refusal.ts';
import { backOfficeReader } from '../review/review-reads.ts';

type Tx = Prisma.TransactionClient;

export const photoItemKinds = ['tickets', 'certifications', 'incidents'] as const;
export type PhotoItemKind = (typeof photoItemKinds)[number];
export const photoLayouts = ['several', 'one'] as const;
export type PhotoLayout = (typeof photoLayouts)[number];
export const receiptContents = ['receipts', 'full'] as const;
export type ReceiptContent = (typeof receiptContents)[number];

// The most items one document draws: past it, the person is asked to narrow it, never given a part.
export const documentItemsAtMost = 500;

export interface PhotoPdfAsked {
  readonly items: PhotoItemKind;
  readonly layout: PhotoLayout;
  readonly workflow?: WorkflowName | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  // Ticket or cert numbers as pasted; left out, every item of the days asked.
  readonly numbers?: string | undefined;
}

export interface ReceiptBatchAsked {
  readonly numbers: string;
  readonly workflow?: WorkflowName | undefined;
  readonly content: ReceiptContent;
}

// One thing drawn: its title, its facts in lines, its photographs, and its receipt where it has one.
interface Item {
  readonly title: string;
  readonly facts: readonly string[];
  readonly photos: readonly PhotoShown[];
  readonly receipt: Receipt | null;
}

interface PhotoShown {
  readonly id: string;
  readonly caption: string;
}

// Numbers as pasted: split on spaces, commas, semicolons and new lines, each once, in order.
export function numbersIn(pasted: string): string[] {
  return [
    ...new Set(
      pasted
        .split(/[\s,;]+/)
        .map((number) => number.trim())
        .filter(Boolean),
    ),
  ];
}

const words = {
  photographs: 'Photographs',
  receipts: 'Receipts',
  record: 'Records with their photographs and receipts',
  notFound: (numbers: readonly string[]) => `Not found on this project: ${numbers.join(', ')}.`,
  allFound: 'Every number asked for is on this project.',
  asked: (count: number) => `${String(count)} asked for.`,
  noPhotos: 'No photographs.',
  notDrawn: (caption: string) =>
    `${caption}: a HEIC, HEIF or TIFF file, or one this document can’t read; open it in the back office.`,
  notDrawnHeading: 'Not drawn here.',
  page: (at: number, of: number) => `${String(at)} / ${String(of)}`,
  kinds: {
    COLLECTION: 'Collection (COL)',
    DISPOSAL: 'Disposal (DIS)',
    HAUL_OUT_COLLECTION: 'Haul-out collection (HOC)',
    HAUL_OUT_DISPOSAL: 'Haul-out disposal (HOD)',
    UNIT_RATE: 'Unit rate (URT)',
  } satisfies Record<FieldEventKindName, string>,
  views: {
    OPERATOR_WITH_PLACARD: 'Operator with placard',
    INTERIOR_OR_BACK: 'Interior or back',
    RIGHT: 'Right side',
    LEFT: 'Left side',
    FRONT: 'Front',
  } as Readonly<Record<string, string | undefined>>,
  stages: {
    PRE_WORK: 'Before the work',
    MEASUREMENT: 'Measurement',
    POST_WORK: 'After the work',
  } as Readonly<Record<string, string | undefined>>,
} as const;

const colours = {
  ink: { r: 0.11, g: 0.14, b: 0.2 },
  muted: { r: 0.4, g: 0.44, b: 0.5 },
  rule: { r: 0.82, g: 0.84, b: 0.87 },
  accent: { r: 0.05, g: 0.36, b: 0.42 },
  white: { r: 1, g: 1, b: 1 },
} as const satisfies Record<string, Rgb>;

// US Letter, upright.
const wide = 612;
const high = 792;
const margin = 36;

const eventInclude = {
  monitor: { select: { name: true, monitorNumber: true } },
  certification: {
    select: {
      kind: true,
      capacityCy: true,
      prime: { select: { name: true } },
      firstTierSub: { select: { name: true } },
      secondTierSub: { select: { name: true } },
    },
  },
  site: { select: { name: true } },
  formDebrisType: { select: { debrisType: { select: { name: true } } } },
  payableType: { select: { name: true } },
  payItem: { select: { code: true } },
  workedOutPayItem: { select: { code: true } },
  kindOfWork: { select: { countShape: true } },
  scaleReceipt: {
    select: {
      receiptNumber: true,
      grossWeightLb: true,
      tareWeightLb: true,
      netWeightLb: true,
      netWeightTons: true,
    },
  },
  items: {
    where: { archivedAt: null },
    select: { quantity: true, itemName: { select: { name: true } } },
  },
  photos: {
    where: { archivedAt: null },
    orderBy: { capturedAt: 'asc' },
    select: { id: true, capturedAt: true, uploadedAt: true, label: true, stage: true, view: true },
  },
} as const satisfies Prisma.FieldEventInclude;

type EventRow = Prisma.FieldEventGetPayload<{ include: typeof eventInclude }>;

const decimal = (value: { toNumber(): number } | null): number | null =>
  value === null ? null : value.toNumber();

export class Documents {
  private readonly db: Database;
  private readonly files: PhotographFiles;

  constructor(db: Database, files: PhotographFiles) {
    this.db = db;
    this.files = files;
  }

  // A photo PDF of the items asked for, in the layout asked for.
  async photoPdf(readerId: string, projectId: string, asked: PhotoPdfAsked): Promise<Uint8Array> {
    const { project, items } = await this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const project = await projectOf(tx, projectId);
      const clock = new ProjectClock(project.timeZone);
      const numbers = asked.numbers === undefined ? null : numbersIn(asked.numbers);
      const items =
        asked.items === 'tickets'
          ? await ticketItems(tx, project, clock, asked, numbers)
          : asked.items === 'certifications'
            ? await certificationItems(tx, project, clock, numbers)
            : await incidentItems(tx, project, clock, asked);
      return { project, items };
    });
    tooMany(items.length);
    const images = await this.imagesOf(items);
    const title = `${project.name}: ${words.photographs}`;
    const pages =
      asked.layout === 'several'
        ? severalPages(title, items, images)
        : items.map((item) => onePage(title, item, images));
    return pdfOf(footed(pages.length === 0 ? [emptyPage(title, words.noPhotos)] : pages));
  }

  // The receipt batch for the numbers pasted.
  async receiptBatch(
    readerId: string,
    projectId: string,
    asked: ReceiptBatchAsked,
  ): Promise<{ readonly bytes: Uint8Array; readonly notFound: readonly string[] }> {
    const numbers = numbersIn(asked.numbers);
    const { project, items, notFound } = await this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const project = await projectOf(tx, projectId);
      const clock = new ProjectClock(project.timeZone);
      const events = await tx.fieldEvent.findMany({
        where: {
          projectId,
          ticketNumber: { in: numbers },
          ...(asked.workflow === undefined ? {} : { workflow: asked.workflow }),
        },
        include: eventInclude,
        orderBy: [{ ticketNumber: 'asc' }, { startedAt: 'asc' }],
      });
      const found = new Set(events.map((event) => event.ticketNumber));
      return {
        project,
        items: numbers.flatMap((number) =>
          events
            .filter((event) => event.ticketNumber === number)
            .map((event) => eventItem(project, clock, event)),
        ),
        notFound: numbers.filter((number) => !found.has(number)),
      };
    });
    tooMany(items.length);
    const title = `${project.name}: ${asked.content === 'receipts' ? words.receipts : words.record}`;
    const first = emptyPage(
      title,
      notFound.length === 0 ? words.allFound : words.notFound(notFound),
      words.asked(numbers.length),
    );
    if (asked.content === 'receipts') {
      const receipts = items.flatMap((item) => (item.receipt === null ? [] : [item.receipt]));
      const pages = receipts.map((receipt) => receiptPage(receipt, receipt.copies[0] ?? 'MONITOR'));
      return { bytes: pdfOf([first, ...pages]), notFound };
    }
    const images = await this.imagesOf(items);
    return {
      bytes: pdfOf(footed([first, ...items.map((item) => onePage(title, item, images))])),
      notFound,
    };
  }

  // Each photograph's file, drawable or not; read one at a time, after the records' own read.
  private async imagesOf(items: readonly Item[]): Promise<ReadonlyMap<string, PdfImage | null>> {
    const images = new Map<string, PdfImage | null>();
    for (const item of items) {
      for (const photo of item.photos) {
        if (images.has(photo.id)) continue;
        const kept = await this.files.kept(photo.id, 'photo');
        images.set(photo.id, pdfImageOf(new Uint8Array(kept.bytes)));
      }
    }
    return images;
  }
}

function tooMany(count: number): void {
  if (count > documentItemsAtMost) {
    throw new Refusal(
      'BAD_REQUEST',
      400,
      `Not made: ${String(count)} items is more than one document draws (${String(documentItemsAtMost)}). Ask for fewer days or numbers.`,
    );
  }
}

async function projectOf(tx: Tx, projectId: string) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, timeZone: true, ticketNumberSource: true },
  });
  if (project === null) throw new Refusal('NOT_FOUND', 404);
  return project;
}

type ProjectRead = Awaited<ReturnType<typeof projectOf>>;

// The instants a range of the project's days covers, both days counted.
function between(clock: ProjectClock, from?: string, to?: string) {
  const starts = from === undefined ? undefined : clock.dayBounds(from).starts;
  const ends = to === undefined ? undefined : clock.dayBounds(to).ends;
  return starts === undefined && ends === undefined
    ? {}
    : {
        ...(starts === undefined ? {} : { gte: starts }),
        ...(ends === undefined ? {} : { lt: ends }),
      };
}

const at = (clock: ProjectClock, instant: Date): string =>
  `${clock.date(instant)} ${clock.time(instant)}`;

const photoCaption = (
  clock: ProjectClock,
  what: string,
  photo: { capturedAt: Date; label: string | null; stage: string | null; view: string | null },
): string => {
  const stage = photo.stage === null ? undefined : words.stages[photo.stage];
  const view = photo.view === null ? undefined : words.views[photo.view];
  const named = photo.label ?? stage ?? view ?? what;
  return `${named}, ${at(clock, photo.capturedAt)}`;
};

// A field event as an item: its facts as the back office reads them and the receipt its phone
// printed, from the same content model.
function eventItem(project: ProjectRead, clock: ProjectClock, event: EventRow): Item {
  const number =
    event.splitSuffix === '' ? event.ticketNumber : `${event.ticketNumber}-${event.splitSuffix}`;
  const kind = words.kinds[event.kind];
  const sub = event.certification?.secondTierSub ?? event.certification?.firstTierSub ?? null;
  const facts = [
    `Monitor: ${event.monitor.name} (${event.monitor.monitorNumber ?? ''})`,
    `Started ${at(clock, event.startedAt)}; ended ${at(clock, event.endedAt)}`,
    `Cert ${event.certNumber}${event.certification === null ? ' (not found on the project)' : ''}${event.certification?.capacityCy == null ? '' : `, ${String(event.certification.capacityCy)} CY`}`,
    ...(event.certification === null
      ? []
      : [`Prime: ${event.certification.prime.name}${sub === null ? '' : `; sub: ${sub.name}`}`]),
    ...(event.site === null ? [] : [`Site: ${event.site.name}`]),
    ...(event.formDebrisType === null
      ? []
      : [`Debris type: ${event.formDebrisType.debrisType.name}`]),
    ...(event.loadCall === null ? [] : [`Load call: ${String(event.loadCall)}%`]),
    ...(event.scaleReceipt === null
      ? []
      : [
          `Scale receipt ${event.scaleReceipt.receiptNumber}: ${decimal(event.scaleReceipt.netWeightTons)?.toString() ?? '—'} tons`,
        ]),
    ...(event.payableType === null ? [] : [`Payable type: ${event.payableType.name}`]),
    ...(event.unitCount === null ? [] : [`Count: ${event.unitCount.toString()}`]),
    ...(event.measurementInches === null
      ? []
      : [`Measurement: ${event.measurementInches.toString()} in`]),
    ...(event.address === null ? [] : [`Address: ${event.address}`]),
    ...(event.endLatitude === null || event.endLongitude === null
      ? []
      : [`End GPS: ${event.endLatitude.toString()}, ${event.endLongitude.toString()}`]),
    `Status: ${event.status}`,
  ];
  const receipt = Receipts.ofTicket({
    kind: event.kind,
    project: project.name,
    timeZone: project.timeZone,
    ticketNumber: event.ticketNumber,
    splitSuffix: event.splitSuffix,
    controlTicket: project.ticketNumberSource === 'CONTROL' && event.workflow !== 'UNIT_RATE',
    truck: {
      certNumber: event.certNumber,
      crew:
        event.certification === null
          ? event.kind === 'UNIT_RATE'
          : event.certification.kind === 'CREW',
      capacityCy: event.certification?.capacityCy ?? null,
      prime: event.certification?.prime.name ?? null,
      sub: sub?.name ?? null,
      keyedByHand: event.certKeyedByHand,
      typedCapacityCy: event.typedCapacityCy,
    },
    monitor: { name: event.monitor.name, monitorNumber: event.monitor.monitorNumber ?? '' },
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    site: event.site?.name ?? null,
    debrisType: event.formDebrisType?.debrisType.name ?? null,
    estimateCy: decimal(event.estimateCy),
    loadCall: event.loadCall,
    carriedCount: event.carriedCount,
    scaleReceipt:
      event.scaleReceipt === null
        ? null
        : {
            receiptNumber: event.scaleReceipt.receiptNumber,
            grossWeightLb: decimal(event.scaleReceipt.grossWeightLb),
            tareWeightLb: decimal(event.scaleReceipt.tareWeightLb),
            netWeightLb: decimal(event.scaleReceipt.netWeightLb),
            netWeightTons: decimal(event.scaleReceipt.netWeightTons),
          },
    roeNumber: event.roeNumber,
    address: event.address,
    end:
      event.endLatitude === null || event.endLongitude === null
        ? null
        : { latitude: event.endLatitude.toString(), longitude: event.endLongitude.toString() },
    unitRate:
      event.kind === 'UNIT_RATE'
        ? {
            payableType: event.payableType?.name ?? null,
            payItem: (event.payItem ?? event.workedOutPayItem)?.code ?? null,
            count: decimal(event.unitCount),
            measurement:
              event.measurementInches === null || event.measuredAs === null
                ? null
                : { inches: event.measurementInches.toNumber(), as: event.measuredAs },
            rootBallInches: decimal(event.rootBallInches),
            halfExposed: event.rootBallHalfExposed,
            surveyNumber: event.surveyNumber,
            ineligible: event.markedIneligible,
            items: event.items.map((item) => ({
              name: item.itemName.name,
              quantity: item.quantity.toNumber(),
              hours: event.kindOfWork?.countShape === 'ITEM_HOURS',
            })),
          }
        : null,
  });
  return {
    title: `${kind} ${number}`,
    facts,
    photos: event.photos
      .filter((photo) => photo.uploadedAt !== null)
      .map((photo) => ({ id: photo.id, caption: photoCaption(clock, kind, photo) })),
    receipt,
  };
}

async function ticketItems(
  tx: Tx,
  project: ProjectRead,
  clock: ProjectClock,
  asked: PhotoPdfAsked,
  numbers: readonly string[] | null,
): Promise<Item[]> {
  const events = await tx.fieldEvent.findMany({
    where: {
      projectId: project.id,
      ...(asked.workflow === undefined ? {} : { workflow: asked.workflow }),
      ...(numbers === null
        ? { endedAt: between(clock, asked.from, asked.to) }
        : { ticketNumber: { in: [...numbers] } }),
    },
    include: eventInclude,
    orderBy: [{ ticketNumber: 'asc' }, { startedAt: 'asc' }],
    take: documentItemsAtMost + 1,
  });
  return events.map((event) => eventItem(project, clock, event));
}

async function certificationItems(
  tx: Tx,
  project: ProjectRead,
  clock: ProjectClock,
  numbers: readonly string[] | null,
): Promise<Item[]> {
  const rows = await tx.certification.findMany({
    where: {
      projectId: project.id,
      ...(numbers === null ? {} : { certNumber: { in: [...numbers] } }),
    },
    include: {
      prime: { select: { name: true } },
      firstTierSub: { select: { name: true } },
      secondTierSub: { select: { name: true } },
      vehicleType: { select: { name: true } },
      crewType: { select: { name: true } },
      photos: {
        where: { archivedAt: null },
        orderBy: { capturedAt: 'asc' },
        select: {
          id: true,
          capturedAt: true,
          uploadedAt: true,
          label: true,
          stage: true,
          view: true,
        },
      },
    },
    orderBy: { certNumber: 'asc' },
    take: documentItemsAtMost + 1,
  });
  return rows.map((row) => {
    const sub = row.secondTierSub ?? row.firstTierSub;
    return {
      title: `Certification ${row.certNumber}`,
      facts: [
        `${row.kind === 'CREW' ? 'Crew' : 'Container'}${row.capacityCy === null ? '' : `, ${String(row.capacityCy)} CY`}`,
        `Prime: ${row.prime.name}${sub === null ? '' : `; sub: ${sub.name}`}`,
        ...(row.vehicleType === null && row.vehicleTypeOther === null
          ? []
          : [`Vehicle: ${row.vehicleType?.name ?? row.vehicleTypeOther ?? ''}`]),
        ...(row.crewType === null ? [] : [`Crew: ${row.crewType.name}`]),
        ...(row.driverName === null ? [] : [`Driver: ${row.driverName}`]),
        ...(row.tagNumber === null ? [] : [`Tag: ${row.tagNumber} ${row.tagState ?? ''}`.trim()]),
        `Certified ${at(clock, row.certifiedAt)}`,
        ...(row.revokedFrom === null
          ? []
          : [`Revoked from ${ProjectClock.dateOf(row.revokedFrom.toISOString().slice(0, 10))}`]),
      ],
      photos: row.photos
        .filter((photo) => photo.uploadedAt !== null)
        .map((photo) => ({ id: photo.id, caption: photoCaption(clock, 'Certification', photo) })),
      receipt: null,
    };
  });
}

async function incidentItems(
  tx: Tx,
  project: ProjectRead,
  clock: ProjectClock,
  asked: PhotoPdfAsked,
): Promise<Item[]> {
  const rows = await tx.incident.findMany({
    where: { projectId: project.id, madeAt: between(clock, asked.from, asked.to) },
    include: {
      incidentType: { select: { name: true } },
      incidentSubType: { select: { name: true } },
      monitor: { select: { name: true, monitorNumber: true } },
      photos: {
        where: { archivedAt: null },
        orderBy: { capturedAt: 'asc' },
        select: {
          id: true,
          capturedAt: true,
          uploadedAt: true,
          label: true,
          stage: true,
          view: true,
        },
      },
    },
    orderBy: { madeAt: 'asc' },
    take: documentItemsAtMost + 1,
  });
  return rows.map((row) => ({
    title: `Incident: ${row.incidentType.name}${row.incidentSubType === null ? '' : `, ${row.incidentSubType.name}`}`,
    facts: [
      `Made ${at(clock, row.madeAt)} by ${row.monitor.name} (${row.monitor.monitorNumber ?? ''})`,
      ...(row.description === null ? [] : [row.description]),
      ...(row.address === null ? [] : [`Where: ${row.address}`]),
      ...(row.certNumber === null ? [] : [`Cert ${row.certNumber}`]),
    ],
    photos: row.photos
      .filter((photo) => photo.uploadedAt !== null)
      .map((photo) => ({ id: photo.id, caption: photoCaption(clock, 'Incident', photo) })),
    receipt: null,
  }));
}

// A page's heading band.
function headed(title: string): PdfPage {
  const page = new PdfPage(wide, high);
  page.fillColour(colours.accent);
  page.rect(0, high - 44, wide, 44, 'fill');
  page.fillColour(colours.white);
  page.text(margin, high - 28, 13, true, fitted(title, 13, wide - margin * 2, true));
  page.fillColour(colours.ink);
  return page;
}

function emptyPage(title: string, ...lines: readonly string[]): PdfPage {
  const page = headed(title);
  let y = high - 80;
  for (const line of lines) {
    for (const part of linesOf(line, 11, wide - margin * 2)) {
      page.text(margin, y, 11, false, part);
      y -= 16;
    }
  }
  return page;
}

// Words in lines within a width, from a top, at most so many lines; the y below them.
function written(
  page: PdfPage,
  lines: readonly string[],
  x: number,
  top: number,
  width: number,
  size: number,
  most: number,
): number {
  let y = top;
  let drawn = 0;
  for (const line of lines) {
    for (const part of linesOf(line, size, width)) {
      if (drawn >= most) return y;
      page.text(x, y, size, false, part);
      y -= size * 1.3;
      drawn += 1;
    }
  }
  return y;
}

// A photograph within a box: drawn as large as the box allows, never cropped, its caption beneath;
// one this file can't show is named in its place.
function photoIn(
  page: PdfPage,
  image: PdfImage | null,
  caption: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const captionRoom = 20;
  if (image === null) {
    page.strokeColour(colours.rule);
    page.rect(x, y + captionRoom, width, height - captionRoom, 'stroke');
    page.fillColour(colours.muted);
    page.text(x + 4, y + height - 14, 7.5, true, words.notDrawnHeading);
    written(page, [words.notDrawn(caption)], x + 4, y + height - 26, width - 8, 7, 8);
    page.fillColour(colours.ink);
    return;
  }
  const shown = fittedIn(image, width, height - captionRoom);
  page.image(
    image,
    x + (width - shown.width) / 2,
    y + captionRoom + (height - captionRoom - shown.height),
    shown.width,
    shown.height,
  );
  page.fillColour(colours.muted);
  written(page, [caption], x, y + captionRoom - 8, width, 6.5, 2);
  page.fillColour(colours.ink);
}

// Several items a page: three rows, each its details and up to three photographs.
function severalPages(
  title: string,
  items: readonly Item[],
  images: ReadonlyMap<string, PdfImage | null>,
): PdfPage[] {
  const pages: PdfPage[] = [];
  const top = high - 56;
  const rowHeight = (top - 40) / 3;
  const detailsWidth = 170;
  const photoWidth = (wide - margin * 2 - detailsWidth - 16) / 3;
  let page = headed(title);
  items.forEach((item, at) => {
    const row = at % 3;
    if (row === 0) {
      page = headed(title);
      pages.push(page);
    }
    const y = top - rowHeight * (row + 1);
    page.strokeColour(colours.rule);
    page.lineWidth(0.5);
    page.line({ x: margin, y }, { x: wide - margin, y });
    page.text(margin, y + rowHeight - 16, 10, true, fitted(item.title, 10, detailsWidth, true));
    written(page, item.facts, margin, y + rowHeight - 30, detailsWidth, 7.5, 18);
    const shown = item.photos.slice(0, 3);
    if (shown.length === 0) {
      page.fillColour(colours.muted);
      page.text(margin + detailsWidth + 16, y + rowHeight - 16, 8, false, words.noPhotos);
      page.fillColour(colours.ink);
    }
    shown.forEach((photo, place) => {
      photoIn(
        page,
        images.get(photo.id) ?? null,
        photo.caption,
        margin + detailsWidth + 16 + place * photoWidth,
        y + 6,
        photoWidth - 8,
        rowHeight - 14,
      );
    });
    if (item.photos.length > 3) {
      page.fillColour(colours.muted);
      page.text(
        margin,
        y + 8,
        7,
        false,
        `${String(item.photos.length - 3)} more photographs in the back office.`,
      );
      page.fillColour(colours.ink);
    }
  });
  return pages;
}

// One item a page: its details, its receipt beside them, its photographs larger beneath.
function onePage(title: string, item: Item, images: ReadonlyMap<string, PdfImage | null>): PdfPage {
  const page = headed(title);
  const top = high - 70;
  page.text(margin, top, 14, true, fitted(item.title, 14, wide - margin * 2, true));
  let receiptBottom = top;
  if (item.receipt !== null) {
    const receipt = receiptPage(item.receipt, item.receipt.copies[0] ?? 'MONITOR');
    const scale = Math.min(1, 300 / receipt.height);
    receiptBottom = top - 10 - receipt.height * scale;
    page.strokeColour(colours.rule);
    page.rect(
      wide - margin - receiptPointsWide * scale,
      receiptBottom,
      receiptPointsWide * scale,
      receipt.height * scale,
      'stroke',
    );
    page.place(receipt, wide - margin - receiptPointsWide * scale, receiptBottom, scale);
  }
  const detailsWidth =
    item.receipt === null ? wide - margin * 2 : wide - margin * 2 - receiptPointsWide - 16;
  const below = written(page, item.facts, margin, top - 20, detailsWidth, 9, 30);
  const photosTop = Math.min(below, receiptBottom) - 12;
  const columns = 2;
  const boxWidth = (wide - margin * 2) / columns;
  const boxHeight = Math.min(260, (photosTop - 40) / 2);
  item.photos.slice(0, 4).forEach((photo, place) => {
    const column = place % columns;
    const row = Math.floor(place / columns);
    photoIn(
      page,
      images.get(photo.id) ?? null,
      photo.caption,
      margin + column * boxWidth,
      photosTop - (row + 1) * boxHeight,
      boxWidth - 10,
      boxHeight - 6,
    );
  });
  if (item.photos.length === 0) {
    page.fillColour(colours.muted);
    page.text(margin, photosTop - 12, 9, false, words.noPhotos);
    page.fillColour(colours.ink);
  }
  return page;
}

// Each page's number at its foot.
function footed(pages: readonly PdfPage[]): PdfPage[] {
  pages.forEach((page, at) => {
    const label = words.page(at + 1, pages.length);
    page.fillColour(colours.muted);
    page.text(wide - margin - textWidth(label, 8), 20, 8, false, label);
    page.fillColour(colours.ink);
  });
  return [...pages];
}
