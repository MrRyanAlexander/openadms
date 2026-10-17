// The idempotency ledger's one way in (ARCHITECTURE §9 (3); spec/DATA-MODEL.md §4.5; AC-05-16;
// BACKLOG 2.6.2, C131; ADR-471, 472; KD-56; REQ-016): a row for each record the server stored,
// written in the piece of work that stores the record, so the record and its row are saved
// together or not at all. Written once, for the phone that synced; the database refuses any
// other writer, any change and any delete.
import type { SyncedRecordKind } from '@open-adms/contracts';
import type { Prisma, SyncAnswer } from '@open-adms/db';

// The sync that brought a record: the server's own row for it, written before any record is
// read. A record received with none (a story's own intake, until its phones sync through the
// endpoint) is stored as it always was, with no row here and no job queued.
export interface Brought {
  readonly syncId: string;
}

export interface Stored {
  // The id its phone made for the record.
  readonly recordId: string;
  // A photograph's record is `PHOTO` (ADR-481).
  readonly recordKind: SyncedRecordKind | 'PHOTO';
  readonly deviceId: string;
  // As a record of its kind, or in quarantine.
  readonly answer: SyncAnswer;
  // A field event saved: the person it names, and whether they were signed in on the phone over
  // its field time (monitor-on-phone.ts; ADR-543).
  readonly monitorId?: string;
  readonly monitorSignedIn?: boolean;
}

// Inside the open piece of work that stored the record.
export async function ledgerRow(
  tx: Prisma.TransactionClient,
  brought: Brought | undefined,
  stored: Stored,
): Promise<void> {
  if (brought === undefined) return;
  await tx.syncedRecord.create({
    data: { ...stored, syncId: brought.syncId },
    select: { recordId: true },
  });
}
