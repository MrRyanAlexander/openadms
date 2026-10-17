// What waits for a person, read by the back office (spec/parts/05-sync.md step 6;
// spec/parts/08-review-and-corrections.md, "One review queue"; AC-05-46; AC-10-73; BACKLOG
// 2.8.4, C106, C139; ADR-022, 338, 468, 471, 482, 526 (1)). OWASP ASVS 5.0 V8; API Security
// Top 10 API3, API4.
//
// - **Open to an admin, and to a manager/analyst granted "view review"** (the user, ADR-539;
//   ADR-526 (1) (a) opened them to the whole back office). Asked again here, inside the read,
//   whatever the door asked.
// - **A page at a time**, oldest first (by id, which a UUIDv7 orders by when it was made), by
//   project or by phone, waiting or resolved; one more is read than the page holds, to know
//   whether another follows.
// - **What was sent, exactly as sent**; never where a file is kept (a file set aside is read by
//   its own request, `PhotographFiles.setAside`).
import type {
  Database,
  FieldEvent,
  Photo,
  Prisma,
  QuarantinedRecord,
  Roe,
  SetAsideFile,
} from '@open-adms/db';

import { HeldReview, type HeldShown } from './held-review.ts';
import { backOfficeReader } from './review-reads.ts';

type Tx = Prisma.TransactionClient;

// Which a page holds.
export interface WaitingAsked {
  readonly projectId?: string | undefined;
  readonly deviceId?: string | undefined;
  // Only those waiting, only those resolved, or (undefined) both.
  readonly waiting?: boolean | undefined;
  readonly after?: string | undefined;
  readonly limit: number;
}

export interface Page<T> {
  readonly rows: readonly T[];
  readonly next: string | null;
}

// A file set aside beside its photograph.
export interface SetAsideShown {
  readonly file: SetAsideFile;
  readonly photo: {
    readonly projectId: string;
    readonly belongsTo: { readonly kind: string; readonly id: string };
    readonly fingerprinted: string;
    readonly kept: boolean;
  };
}

// A quarantined record with the record that holds its number.
export interface QuarantinedShown {
  readonly kept: QuarantinedRecord;
  readonly holder:
    | { readonly kind: 'FIELD_EVENT'; readonly fieldEvent: FieldEvent }
    | { readonly kind: 'ROE'; readonly roe: Roe };
}

const resolvedOrNot = (waiting: boolean | undefined) =>
  waiting === undefined ? {} : { resolvedAt: waiting ? null : { not: null } };

const paged = <T extends { readonly id: string }>(rows: readonly T[], limit: number) => {
  const page = rows.slice(0, limit);
  return { page, next: rows.length > limit ? (page.at(-1)?.id ?? null) : null };
};

// What a photograph belongs to, by the column that names it.
const belongsTo = (photo: {
  readonly fieldEventId: string | null;
  readonly certificationId: string | null;
  readonly scaleReceiptId: string | null;
  readonly roeId: string | null;
  readonly surveyId: string | null;
  readonly incidentId: string | null;
  readonly dropOffLogId: string | null;
  readonly quarantinedRecordId: string | null;
  readonly heldRecordId: string | null;
}): { kind: string; id: string } => {
  const named: [string, string | null][] = [
    ['FIELD_EVENT', photo.fieldEventId],
    ['CERTIFICATION', photo.certificationId],
    ['SCALE_RECEIPT', photo.scaleReceiptId],
    ['ROE', photo.roeId],
    ['SURVEY', photo.surveyId],
    ['INCIDENT', photo.incidentId],
    ['DROP_OFF_LOG', photo.dropOffLogId],
    ['QUARANTINED_RECORD', photo.quarantinedRecordId],
    ['HELD_RECORD', photo.heldRecordId],
  ];
  const [kind, id] = named.find(([, one]) => one !== null) ?? [];
  if (kind === undefined || id === undefined || id === null) {
    throw new Error('A photograph belongs to nothing.');
  }
  return { kind, id };
};

export class HeldReads {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  heldRecords(readerId: string, asked: WaitingAsked): Promise<Page<HeldShown>> {
    return this.db.$read(async (tx) => {
      await HeldReads.reader(tx, readerId);
      const rows = await tx.heldRecord.findMany({
        where: {
          ...(asked.projectId === undefined ? {} : { projectId: asked.projectId }),
          ...(asked.deviceId === undefined ? {} : { deviceId: asked.deviceId }),
          ...resolvedOrNot(asked.waiting),
          ...(asked.after === undefined ? {} : { id: { gt: asked.after } }),
        },
        orderBy: { id: 'asc' },
        take: asked.limit + 1,
        select: { id: true },
      });
      const { page, next } = paged(rows, asked.limit);
      const shown: HeldShown[] = [];
      for (const { id } of page) shown.push(await HeldReview.shown(tx, id));
      return { rows: shown, next };
    });
  }

  setAsideFiles(readerId: string, asked: WaitingAsked): Promise<Page<SetAsideShown>> {
    return this.db.$read(async (tx) => {
      await HeldReads.reader(tx, readerId);
      const rows = await tx.setAsideFile.findMany({
        where: {
          ...(asked.projectId === undefined ? {} : { photo: { projectId: asked.projectId } }),
          ...(asked.deviceId === undefined ? {} : { deviceId: asked.deviceId }),
          ...resolvedOrNot(asked.waiting),
          ...(asked.after === undefined ? {} : { id: { gt: asked.after } }),
        },
        orderBy: { id: 'asc' },
        take: asked.limit + 1,
        include: { photo: true },
      });
      const { page, next } = paged(rows, asked.limit);
      return { rows: page.map((row) => HeldReads.besideItsPhotograph(row)), next };
    });
  }

  // One file set aside, beside its photograph.
  setAsideFile(readerId: string, setAsideFileId: string): Promise<SetAsideShown> {
    return this.db.$read(async (tx) => {
      await HeldReads.reader(tx, readerId);
      return HeldReads.besideItsPhotograph(
        await tx.setAsideFile.findUniqueOrThrow({
          where: { id: setAsideFileId },
          include: { photo: true },
        }),
      );
    });
  }

  private static besideItsPhotograph({
    photo,
    ...file
  }: SetAsideFile & { readonly photo: Photo }): SetAsideShown {
    const depth = file.file === 'DEPTH';
    const fingerprinted = depth ? photo.depthSha256 : photo.uploadedSha256;
    if (fingerprinted === null) throw new Error('A depth file set aside for no depth file.');
    return {
      file,
      photo: {
        projectId: photo.projectId,
        belongsTo: belongsTo(photo),
        fingerprinted,
        kept: (depth ? photo.depthUploadedAt : photo.uploadedAt) !== null,
      },
    };
  }

  quarantinedRecords(readerId: string, asked: WaitingAsked): Promise<Page<QuarantinedShown>> {
    return this.db.$read(async (tx) => {
      await HeldReads.reader(tx, readerId);
      const rows = await tx.quarantinedRecord.findMany({
        where: {
          ...(asked.projectId === undefined ? {} : { projectId: asked.projectId }),
          ...(asked.deviceId === undefined ? {} : { deviceId: asked.deviceId }),
          ...resolvedOrNot(asked.waiting),
          ...(asked.after === undefined ? {} : { id: { gt: asked.after } }),
        },
        orderBy: { id: 'asc' },
        take: asked.limit + 1,
        include: { holdingEvent: true, holdingRoe: true },
      });
      const { page, next } = paged(rows, asked.limit);
      return {
        rows: page.map(({ holdingEvent, holdingRoe, ...kept }) => {
          if (holdingEvent !== null) {
            return { kept, holder: { kind: 'FIELD_EVENT' as const, fieldEvent: holdingEvent } };
          }
          if (holdingRoe !== null)
            return { kept, holder: { kind: 'ROE' as const, roe: holdingRoe } };
          throw new Error('A quarantined record with no record holding its number.');
        }),
        next,
      };
    });
  }

  // An admin, or a manager/analyst in service granted "view review"; anybody else is refused.
  private static async reader(tx: Tx, readerId: string): Promise<void> {
    await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
  }
}
