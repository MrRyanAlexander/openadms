// The back office's exports (REQ-412; spec/FROM-BUILD-1.md §10; AC-09-27, 28): what the back
// office assembles the client package from by hand, as files to take away: a project's tickets,
// its transactions (the ledger, line by line), its certifications and its audit history, each as
// CSV, Excel-compatible CSV or JSON (`table-file.ts`), narrowed as the ledger's own reads are.
// **Each is read through the read the screen uses** (`Ledger`, `ReviewReads`, `AuditTrail`), a page
// at a time to the end, so whoever exports is shown exactly what they may read there and nothing
// more: money to whoever sees review (ADR-224, 539), the security domain to an admin alone. Never
// a driver's phone or licence number; never where a file is kept. Made each time, kept nowhere.
import type { exportDatasets } from '@open-adms/contracts';
import type { WorkflowName } from '@open-adms/domain';
import { workflows } from '@open-adms/domain';
import type { Database } from '@open-adms/db';

import type { AuditTrail } from '../review/audit-trail.ts';
import type { ReviewReads } from '../review/review-reads.ts';
import type { Ledger, LedgerAsked } from '../money/ledger.ts';
import { tableFile, type Column, type TableFile, type TableFormat } from './table-file.ts';

export type ExportDataset = (typeof exportDatasets)[number];

// What every export is narrowed by: the ledger's own filters (the audit history takes none).
export type ExportAsked = Omit<LedgerAsked, 'after' | 'limit'>;

// A page as large as the reads let one be.
const page = 200;

type LedgerLine = Awaited<ReturnType<Ledger['read']>>['lines'][number];
type ProjectTicket = Awaited<ReturnType<Ledger['tickets']>>['tickets'][number];
type CertificationRow = Awaited<
  ReturnType<ReviewReads['certifications']>
>['certifications'][number];
type AuditEntry = Awaited<ReturnType<AuditTrail['projectHistory']>>['entries'][number];

const transactionColumns: readonly Column<LedgerLine>[] = [
  { name: 'workflow', cell: (line) => line.workflow },
  { name: 'ticket_number', cell: (line) => line.ticketNumber },
  { name: 'split_suffix', cell: (line) => line.splitSuffix },
  { name: 'slot', cell: (line) => line.slot },
  { name: 'ticket_date', cell: (line) => line.ticketDate },
  { name: 'pay_item_code', cell: (line) => line.payItem.code },
  { name: 'pay_item_description', cell: (line) => line.payItem.description },
  { name: 'payable_type', cell: (line) => line.payableType },
  { name: 'unit', cell: (line) => line.unit },
  { name: 'quantity', cell: (line) => line.quantity },
  { name: 'rate', cell: (line) => line.rate },
  { name: 'amount', cell: (line) => line.amount },
  { name: 'contract', cell: (line) => line.contract.name },
  { name: 'prime', cell: (line) => line.prime.name },
  { name: 'operating_sub', cell: (line) => line.operatingSub?.name ?? null },
  { name: 'rule', cell: (line) => line.rule.name },
  { name: 'status', cell: (line) => line.status },
  { name: 'qc_status', cell: (line) => line.qcStatus },
  { name: 'locked', cell: (line) => line.lock !== null },
  { name: 'invoice_batch', cell: (line) => line.lock?.invoiceBatch?.name ?? null },
  { name: 'mileage', cell: (line) => line.mileage },
  { name: 'mileage_source', cell: (line) => line.mileageSource },
];

const ticketColumns: readonly Column<ProjectTicket>[] = [
  { name: 'workflow', cell: (ticket) => ticket.workflow },
  { name: 'ticket_number', cell: (ticket) => ticket.ticketNumber },
  { name: 'ticket_date', cell: (ticket) => ticket.ticketDate },
  { name: 'statuses', cell: (ticket) => ticket.statuses.join(' ') },
  {
    name: 'field_events',
    cell: (ticket) =>
      ticket.fieldEvents
        .map((event) => `${event.kind}${event.splitSuffix === '' ? '' : `-${event.splitSuffix}`}`)
        .join(' '),
  },
  { name: 'qc_status', cell: (ticket) => ticket.qcStatus },
  { name: 'locked', cell: (ticket) => ticket.lock !== null },
  { name: 'invoice_batch', cell: (ticket) => ticket.lock?.invoiceBatch?.name ?? null },
  { name: 'lines', cell: (ticket) => ticket.lines },
  { name: 'amount', cell: (ticket) => ticket.amount },
  { name: 'why_not_lockable', cell: (ticket) => ticket.lockRefusal?.message ?? null },
];

const auditColumns: readonly Column<AuditEntry>[] = [
  { name: 'id', cell: (entry) => entry.id },
  { name: 'occurred_at', cell: (entry) => entry.occurredAt },
  { name: 'table', cell: (entry) => entry.tableName },
  { name: 'record_id', cell: (entry) => entry.recordId },
  { name: 'operation', cell: (entry) => entry.operation },
  { name: 'changed_fields', cell: (entry) => entry.changedFields.join(' ') },
  { name: 'prior_value', cell: (entry) => JSON.stringify(entry.priorValue) },
  { name: 'new_value', cell: (entry) => JSON.stringify(entry.newValue) },
  { name: 'actor', cell: (entry) => entry.actor?.name ?? null },
  { name: 'source', cell: (entry) => entry.source },
  { name: 'device_id', cell: (entry) => entry.deviceId },
  { name: 'reason', cell: (entry) => entry.reason },
];

export class Exports {
  private readonly db: Database;
  private readonly ledger: Ledger;
  private readonly reads: ReviewReads;
  private readonly audit: AuditTrail;

  constructor(
    db: Database,
    parts: { readonly ledger: Ledger; readonly reads: ReviewReads; readonly audit: AuditTrail },
  ) {
    this.db = db;
    this.ledger = parts.ledger;
    this.reads = parts.reads;
    this.audit = parts.audit;
  }

  // The file, made from every page the reader may read.
  async file(
    readerId: string,
    projectId: string,
    dataset: ExportDataset,
    format: TableFormat,
    asked: ExportAsked,
  ): Promise<TableFile & { readonly rows: number }> {
    switch (dataset) {
      case 'transactions': {
        const rows = await everyPage<LedgerLine>(async (after) => {
          const read = await this.ledger.read(readerId, projectId, {
            ...asked,
            after,
            limit: page,
          });
          return { rows: read.lines, next: read.next };
        });
        return { ...tableFile(format, transactionColumns, rows), rows: rows.length };
      }
      case 'tickets': {
        const rows: ProjectTicket[] = [];
        const wanted: readonly WorkflowName[] =
          asked.workflow === undefined ? workflows : [asked.workflow];
        for (const workflow of wanted) {
          rows.push(
            ...(await everyPage<ProjectTicket>(async (after) => {
              const read = await this.ledger.tickets(readerId, projectId, {
                workflow,
                locked: asked.locked,
                invoiceBatchId: asked.invoiceBatchId,
                from: asked.from,
                to: asked.to,
                after,
                limit: page,
              });
              return { rows: read.tickets, next: read.next };
            })),
          );
        }
        return { ...tableFile(format, ticketColumns, rows), rows: rows.length };
      }
      case 'certifications': {
        const rows = await everyPage<CertificationRow>(async (after) => {
          const read = await this.reads.certifications(readerId, projectId, { after, limit: page });
          return { rows: read.certifications, next: read.next };
        });
        const names = await this.namesFor(projectId);
        const named = (id: string | null) => (id === null ? null : (names.get(id) ?? null));
        const columns: readonly Column<CertificationRow>[] = [
          { name: 'cert_number', cell: (row) => row.certification.certNumber },
          { name: 'kind', cell: (row) => row.certification.kind },
          { name: 'prime', cell: (row) => named(row.certification.primeId) },
          { name: 'first_tier_sub', cell: (row) => named(row.certification.firstTierSubId) },
          { name: 'second_tier_sub', cell: (row) => named(row.certification.secondTierSubId) },
          { name: 'capacity_cy', cell: (row) => row.certification.capacityCy },
          {
            name: 'vehicle_type',
            cell: (row) =>
              named(row.certification.vehicleTypeId) ?? row.certification.vehicleTypeOther,
          },
          { name: 'crew_type', cell: (row) => named(row.certification.crewTypeId) },
          { name: 'driver_name', cell: (row) => row.certification.driverName },
          { name: 'tag_number', cell: (row) => row.certification.tagNumber },
          { name: 'tag_state', cell: (row) => row.certification.tagState },
          { name: 'tag_expiry', cell: (row) => row.certification.tagExpiry },
          { name: 'certified_at', cell: (row) => row.certification.certifiedAt },
          {
            name: 'source',
            cell: (row) => (row.certification.deviceId === null ? 'BACK_OFFICE' : 'DEVICE'),
          },
          { name: 'signatures_on_file', cell: (row) => row.certification.signaturesOnFile },
          { name: 'revoked_from', cell: (row) => row.certification.revokedFrom },
          { name: 'revoked_reason', cell: (row) => row.certification.revokedReason },
          { name: 'qc_status', cell: (row) => row.qcMark?.status ?? null },
          { name: 'photographs', cell: (row) => row.photographs.length },
          {
            name: 'open_flags',
            cell: (row) => row.flags.filter((flag) => flag.clearedAt === null).length,
          },
        ];
        return { ...tableFile(format, columns, rows), rows: rows.length };
      }
      case 'audit-history': {
        const rows = await everyPage<AuditEntry>(async (after) => {
          const read = await this.audit.projectHistory(readerId, projectId, { after, limit: page });
          return { rows: read.entries, next: read.next };
        });
        return { ...tableFile(format, auditColumns, rows), rows: rows.length };
      }
    }
  }

  // The names a certification names by id: the project's contractors and the firm's vehicle and
  // crew types. Read after the certifications' own read has asked who reads.
  private namesFor(projectId: string): Promise<ReadonlyMap<string, string>> {
    return this.db.$read(async (tx) => {
      const contractors = await tx.projectContractor.findMany({
        where: { projectId },
        select: { contractorId: true, contractor: { select: { name: true } } },
      });
      const vehicleTypes = await tx.vehicleType.findMany({ select: { id: true, name: true } });
      const crewTypes = await tx.crewType.findMany({ select: { id: true, name: true } });
      return new Map<string, string>([
        ...contractors.map((place): [string, string] => [
          place.contractorId,
          place.contractor.name,
        ]),
        ...vehicleTypes.map((type): [string, string] => [type.id, type.name]),
        ...crewTypes.map((type): [string, string] => [type.id, type.name]),
      ]);
    });
  }
}

// Every page of a read, from the first to the last.
async function everyPage<Row>(
  read: (after: string | undefined) => Promise<{ rows: readonly Row[]; next: string | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  let after: string | undefined;
  for (;;) {
    const answered = await read(after);
    rows.push(...answered.rows);
    if (answered.next === null) return rows;
    after = answered.next;
  }
}
