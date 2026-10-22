// The audit log, read (ARCHITECTURE §5.3; invariants 2, 3, 5; REQ-407; spec/acceptance/10-api-and-
// sync.md AC-10-111; ADR-097, 544; the Phase 2 audit's F5). "Corrected in place, prior value kept"
// is a promise to an auditor and to whoever QCs a ticket; the database keeps it (every change one
// row, append-only, its actor real), and this reads it back.
//
// - **A ticket's history** is every change to the records it is made of: its field events and
//   what is recorded beside them (item lines, carried tickets, waypoints, photographs' records), the completed
//   record and its rows (those dissolved too), its lines (the ones the worker removed included:
//   each was copied whole into the log first, so it is found by the log's own copy), its flags
//   and their acceptances, and its QC marks, locks, voids and unvoids. Which records those are is
//   worked out here, with the API's own login; what of them a reader is shown is the reader's.
// - **The back office** reads a ticket's history with *view review*, and a record's history by
//   the area it belongs to (`recordHistory`): a ticket's records *view review*, the board and the
//   number blocks *view dispatch*, setup *view setup*; people, phones, sign-in's records and the
//   firm's settings an admin alone, as every row of the log's security domain is (a person's
//   phone number among them, ADR-315).
// - **A client user or an auditor** reads a ticket's history through the database's own view
//   `viewer_audit_record` (`ViewerReads`): the rows of their projects' records, each value only
//   where the read-only login may read that column, never why or which request. A contractor user
//   is shown none. The database decides; this only narrows to the ticket.
// - **Newest first, a page at a time**, by the log's own number.
import type { AuditTrailAnswer } from '@open-adms/contracts';
import type { Database, Prisma } from '@open-adms/db';
import type { ViewPermission, WorkflowName } from '@open-adms/domain';

import { Refusal } from '../process/refusal.ts';
import { backOfficeReader, backOfficeSees } from './review-reads.ts';

type Tx = Prisma.TransactionClient;

// A page asked for: after the last entry of the page before, `limit` at most.
export interface AuditPageAsked {
  readonly after?: string | undefined;
  readonly limit: number;
}

// What a removed line was priced on, as the log's copy of it says: the column and the record.
export interface LineOf {
  readonly column: 'completed_load_id' | 'completed_haul_out_id' | 'field_event_id';
  readonly id: string;
}

// Which rows of the log a ticket's history is: each table with the ids of its records.
export type RecordKeys = readonly { readonly table: string; readonly ids: readonly string[] }[];

// The records a ticket's history reads, and the area each other table belongs to.
const reviewTables = new Set([
  'field_event',
  'field_event_item',
  'carried_ticket',
  'field_event_waypoint',
  'photo',
  'completed_load',
  'completed_load_collection',
  'completed_haul_out',
  'completed_haul_out_collection',
  'transaction',
  'flag',
  'flag_acceptance',
  'qc_mark',
  'invoice_lock',
  'invoice_batch',
  'ticket_void',
  'ticket_unvoid',
  'scale_receipt',
  'roe',
  'roe_scope_item',
  'survey',
  'incident',
  'drop_off_log',
  'certification',
  'certification_box',
  'certification_helper',
  'quarantined_record',
  'held_record',
  'set_aside_file',
  'reconciliation_run',
  'reconciliation_decision',
  'reconciliation_job',
  'reconciliation_job_ticket',
  'synced_record',
  'sync',
]);
const dispatchTables = new Set(['assignment', 'assignment_pay_item', 'number_block']);
// The log's security domain: a person, their phone and sign-in, and the firm's settings.
const securityTables = new Set([
  'user',
  'device',
  'user_credential',
  'session',
  'security_event',
  'master_passcode',
  'master_passcode_tries',
  'user_permission',
  'user_viewer_project',
  'firm_settings',
  'audit_record',
]);

// The view a table's history is read with, or an admin's alone.
export function viewOfTable(table: string): ViewPermission | 'ADMIN' {
  if (securityTables.has(table)) return 'ADMIN';
  if (reviewTables.has(table)) return 'VIEW_REVIEW';
  if (dispatchTables.has(table)) return 'VIEW_DISPATCH';
  return 'VIEW_SETUP';
}

// The tables a reader's views let them read the log of, as a filter on the log: the same areas
// `viewOfTable` gives one record's history. An admin reads every table; the security domain is
// theirs alone, whatever else a person sees.
export function tablesSeenWith(
  sees: Readonly<Record<ViewPermission, boolean>>,
): Prisma.AuditRecordWhereInput {
  const seen = [
    ...(sees.VIEW_REVIEW ? reviewTables : []),
    ...(sees.VIEW_DISPATCH ? dispatchTables : []),
  ];
  if (!sees.VIEW_SETUP) return { tableName: { in: seen } };
  const unseen = [
    ...securityTables,
    ...(sees.VIEW_REVIEW ? [] : reviewTables),
    ...(sees.VIEW_DISPATCH ? [] : dispatchTables),
  ];
  return { tableName: { notIn: unseen } };
}

// One row of the log, as either reader reads it.
interface Logged {
  readonly id: bigint;
  readonly occurredAt: Date;
  readonly tableName: string;
  readonly recordId: string;
  readonly operation: 'INSERT' | 'UPDATE' | 'DELETE';
  readonly changedFields: readonly string[];
  readonly priorValue: Prisma.JsonValue;
  readonly newValue: Prisma.JsonValue;
  readonly actor: { readonly id: string; readonly name: string } | null;
  readonly source: 'DEVICE' | 'BACK_OFFICE' | 'SYSTEM';
  readonly deviceId: string | null;
  readonly reason: string | null;
}

// The rows a ticket's records are, as a Prisma filter on the log or its viewer view.
export const ofRecords = (keys: RecordKeys) => ({
  OR: keys
    .filter((key) => key.ids.length > 0)
    .map((key) => ({ tableName: key.table, recordId: { in: [...key.ids] } })),
});

// A page of the log, newest first.
export const auditPaged = (asked: AuditPageAsked) => ({
  orderBy: { id: 'desc' as const },
  take: asked.limit + 1,
});
export const auditAfter = (asked: AuditPageAsked) =>
  asked.after === undefined ? {} : { id: { lt: BigInt(asked.after) } };

// What the database holds as JSON, as the contracts' JSON: the same values, read from a row.
type Json = AuditTrailAnswer['entries'][number]['priorValue'];
const json = (value: Prisma.JsonValue): Json => value as Json;

export function answered(rows: readonly Logged[], limit: number): AuditTrailAnswer {
  const page = rows.slice(0, limit);
  return {
    entries: page.map((row) => ({
      id: row.id.toString(),
      occurredAt: row.occurredAt.toISOString(),
      tableName: row.tableName,
      recordId: row.recordId,
      operation: row.operation,
      changedFields: [...row.changedFields],
      priorValue: json(row.priorValue),
      newValue: json(row.newValue),
      actor: row.actor,
      source: row.source,
      deviceId: row.deviceId,
      reason: row.reason,
    })),
    next: rows.length > limit ? (page.at(-1)?.id.toString() ?? null) : null,
  };
}

export class AuditTrail {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // The records one ticket is made of, now and before: none where it has no field event. Read as
  // whoever `tx` is: the API's login, or a viewer's (whose rows are the database's to say), with
  // the lines the worker removed found in the log as that reader reads it (`removedLines`).
  static async ticketRecords(
    tx: Tx,
    projectId: string,
    workflow: WorkflowName,
    ticketNumber: string,
    removedLines: (
      tx: Tx,
      on: readonly LineOf[],
    ) => Promise<readonly { readonly recordId: string }[]> = (tx, on) =>
      tx.auditRecord.findMany({
        where: {
          tableName: 'transaction',
          operation: 'DELETE',
          OR: on.map(({ column, id }) => ({ priorValue: { path: [column], equals: id } })),
        },
        select: { recordId: true },
      }),
  ): Promise<RecordKeys | undefined> {
    const named = { projectId, workflow, ticketNumber };
    const events = (await tx.fieldEvent.findMany({ where: named, select: { id: true } })).map(
      (row) => row.id,
    );
    if (events.length === 0) return undefined;
    const loads =
      workflow === 'LOAD'
        ? (
            await tx.completedLoad.findMany({
              where: { projectId, ticketNumber },
              select: { id: true },
            })
          ).map((row) => row.id)
        : [];
    const haulOuts =
      workflow === 'HAUL_OUT'
        ? (
            await tx.completedHaulOut.findMany({
              where: { projectId, ticketNumber },
              select: { id: true },
            })
          ).map((row) => row.id)
        : [];
    const ids = (rows: readonly { readonly id: string }[]): string[] => rows.map((row) => row.id);
    const onTheTicket = {
      projectId,
      OR: [
        { completedLoadId: { in: loads } },
        { completedHaulOutId: { in: haulOuts } },
        { fieldEventId: { in: events } },
      ],
    };
    const flags = ids(await tx.flag.findMany({ where: named, select: { id: true } }));
    // A line the worker removed is in the log alone, copied whole as it was (ADR-085).
    const removed = await removedLines(tx, [
      ...loads.map((id) => ({ column: 'completed_load_id' as const, id })),
      ...haulOuts.map((id) => ({ column: 'completed_haul_out_id' as const, id })),
      ...events.map((id) => ({ column: 'field_event_id' as const, id })),
    ]);
    return [
      { table: 'field_event', ids: events },
      {
        table: 'field_event_item',
        ids: ids(
          await tx.fieldEventItem.findMany({
            where: { fieldEventId: { in: events } },
            select: { id: true },
          }),
        ),
      },
      {
        table: 'carried_ticket',
        ids: ids(
          await tx.carriedTicket.findMany({
            where: { fieldEventId: { in: events } },
            select: { id: true },
          }),
        ),
      },
      {
        table: 'field_event_waypoint',
        ids: ids(
          await tx.fieldEventWaypoint.findMany({
            where: { fieldEventId: { in: events } },
            select: { id: true },
          }),
        ),
      },
      {
        table: 'photo',
        ids: ids(
          await tx.photo.findMany({
            where: { fieldEventId: { in: events } },
            select: { id: true },
          }),
        ),
      },
      { table: 'completed_load', ids: loads },
      {
        table: 'completed_load_collection',
        ids: ids(
          await tx.completedLoadCollection.findMany({
            where: { completedLoadId: { in: loads } },
            select: { id: true },
          }),
        ),
      },
      { table: 'completed_haul_out', ids: haulOuts },
      {
        table: 'completed_haul_out_collection',
        ids: ids(
          await tx.completedHaulOutCollection.findMany({
            where: { completedHaulOutId: { in: haulOuts } },
            select: { id: true },
          }),
        ),
      },
      {
        table: 'transaction',
        ids: [
          ...ids(await tx.transaction.findMany({ where: onTheTicket, select: { id: true } })),
          ...removed.map((row) => row.recordId),
        ],
      },
      { table: 'flag', ids: flags },
      {
        table: 'flag_acceptance',
        ids: ids(
          await tx.flagAcceptance.findMany({
            where: { projectId, flagId: { in: flags } },
            select: { id: true },
          }),
        ),
      },
      {
        table: 'qc_mark',
        ids: ids(await tx.qcMark.findMany({ where: onTheTicket, select: { id: true } })),
      },
      {
        table: 'invoice_lock',
        ids: ids(await tx.invoiceLock.findMany({ where: onTheTicket, select: { id: true } })),
      },
      {
        table: 'ticket_void',
        ids: ids(await tx.ticketVoid.findMany({ where: named, select: { id: true } })),
      },
      {
        table: 'ticket_unvoid',
        ids: ids(await tx.ticketUnvoid.findMany({ where: named, select: { id: true } })),
      },
    ];
  }

  // A ticket's history, for the back office (view review).
  ticketHistory(
    readerId: string,
    projectId: string,
    workflow: WorkflowName,
    ticketNumber: string,
    asked: AuditPageAsked,
  ): Promise<AuditTrailAnswer> {
    return this.db.$read(async (tx) => {
      await backOfficeReader(tx, readerId, 'VIEW_REVIEW');
      const keys = await AuditTrail.ticketRecords(tx, projectId, workflow, ticketNumber);
      if (keys === undefined) throw new Refusal('NOT_FOUND', 404);
      const admin = await AuditTrail.isAdmin(tx, readerId);
      return answered(await AuditTrail.logged(tx, ofRecords(keys), asked, admin), asked.limit);
    });
  }

  // One record's history, for whoever reads the area it belongs to.
  recordHistory(
    readerId: string,
    tableName: string,
    recordId: string,
    asked: AuditPageAsked,
  ): Promise<AuditTrailAnswer> {
    return this.db.$read(async (tx) => {
      const view = viewOfTable(tableName);
      const admin = await AuditTrail.isAdmin(tx, readerId);
      if (view === 'ADMIN') {
        if (!admin) throw new Refusal('NOT_ALLOWED', 403);
      } else {
        await backOfficeReader(tx, readerId, view);
      }
      return answered(
        await AuditTrail.logged(tx, { tableName, recordId }, asked, admin),
        asked.limit,
      );
    });
  }

  // A project's whole history, newest first (REQ-407): every row of the log whose record holds
  // the project's id (the project itself, and each of its records that names it), narrowed by
  // the log's domain and by who made the change. A reader is shown the areas they read (an
  // admin every one): a manager/analyst with no view of the back office's is refused. A record
  // that names its project only through another (an item line, a certification's box) is read
  // through that record's or its ticket's history.
  //
  // The rows are found by the project's id inside each row's own values, so a log that outgrows
  // one piece of work (`DATABASE_WORK_LONGEST_MS`) is answered busy, never cut short.
  projectHistory(
    readerId: string,
    projectId: string,
    asked: AuditPageAsked & {
      readonly domain?: 'SECURITY' | 'BILLING' | 'OPERATIONS' | 'RECORDS' | undefined;
      readonly actorId?: string | undefined;
    },
  ): Promise<AuditTrailAnswer> {
    return this.db.$read(async (tx) => {
      const admin = await AuditTrail.isAdmin(tx, readerId);
      const sees = {
        VIEW_REVIEW: admin || (await backOfficeSees(tx, readerId, 'VIEW_REVIEW')),
        VIEW_SETUP: admin || (await backOfficeSees(tx, readerId, 'VIEW_SETUP')),
        VIEW_DISPATCH: admin || (await backOfficeSees(tx, readerId, 'VIEW_DISPATCH')),
      };
      if (!sees.VIEW_REVIEW && !sees.VIEW_SETUP && !sees.VIEW_DISPATCH) {
        throw new Refusal('NOT_ALLOWED', 403);
      }
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (project === null) throw new Refusal('NOT_FOUND', 404);
      const where: Prisma.AuditRecordWhereInput = {
        AND: [
          {
            OR: [
              { tableName: 'project', recordId: projectId },
              { newValue: { path: ['project_id'], equals: projectId } },
              { priorValue: { path: ['project_id'], equals: projectId } },
            ],
          },
          ...(admin ? [] : [tablesSeenWith(sees)]),
          ...(asked.domain === undefined ? [] : [{ domain: asked.domain }]),
          ...(asked.actorId === undefined ? [] : [{ actorId: asked.actorId }]),
        ],
      };
      return answered(await AuditTrail.logged(tx, where, asked, admin), asked.limit);
    });
  }

  // An admin in service, read now (ADR-415).
  private static async isAdmin(tx: Tx, readerId: string): Promise<boolean> {
    const reader = await tx.user.findUnique({
      where: { id: readerId },
      select: { role: true, archivedAt: true },
    });
    return reader?.role === 'ADMIN' && reader.archivedAt === null;
  }

  // The rows, newest first: the security domain's to an admin alone.
  private static async logged(
    tx: Tx,
    where: Prisma.AuditRecordWhereInput,
    asked: AuditPageAsked,
    admin: boolean,
  ): Promise<Logged[]> {
    const rows = await tx.auditRecord.findMany({
      where: {
        AND: [
          where,
          auditAfter(asked),
          ...(admin ? [] : [{ domain: { not: 'SECURITY' as const } }]),
        ],
      },
      include: { actor: { select: { id: true, name: true } } },
      ...auditPaged(asked),
    });
    return rows;
  }
}
