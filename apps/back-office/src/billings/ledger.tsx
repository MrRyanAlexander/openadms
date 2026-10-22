// A project's ledger (spec/parts/07-pricing-ledger-audit.md; adms-ledger-audit; REQ-406;
// AC-07-112, 113; AC-09-28): every line as it stands, the current truth the worker drew from the
// tickets' field events and the setup (ADR-085): its ticket (and property or pile), # slot, pay
// item, quantity, rate, amount, contract, prime and operating sub, rule, ticket date, and what
// people marked on the ticket (status, QC, lock and batch). Narrowed by workflow, pay item, prime,
// batch, locked or not and the days the work counts on. What every matching line comes to is the
// server's sum, exact to the cent, never added up here.
import {
  listInvoiceBatchesEndpoint,
  readLedgerEndpoint,
  type LedgerLine,
} from '@open-adms/contracts';
import { workflows } from '@open-adms/domain';
import { ScreenTitle } from '@open-adms/look';
import { useState } from 'react';
import { Link } from 'react-aria-components';

import { DateEntry, SelectField } from '../look/fields.tsx';
import { PagedTable } from '../look/paged-table.tsx';
import { useRead } from '../reading.tsx';
import { ticketHref } from '../review/queue.tsx';
import { optionsOf, Reviewed, useReviewing } from '../review/reviewing.tsx';
import { counted, day, money, say, words } from '../words.ts';

export function Ledger({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="ledger" className="page" id="content">
      <Reviewed projectId={projectId}>
        <LedgerOf projectId={projectId} />
      </Reviewed>
    </main>
  );
}

// The filters a ledger and a list of tickets share, as their query takes them.
export interface Filters {
  readonly workflow?: (typeof workflows)[number];
  readonly payItemId?: string;
  readonly primeId?: string;
  readonly invoiceBatchId?: string;
  readonly locked?: 'true' | 'false';
  readonly from?: string;
  readonly to?: string;
}

const any = '';

function LedgerOf({ projectId }: { readonly projectId: string }) {
  const said = words.billings.ledger;
  const { names } = useReviewing();
  const [filters, setFilters] = useState<Filters>({});
  const [batches] = useRead(listInvoiceBatchesEndpoint, {
    params: { projectId },
    query: { limit: '200' },
  });
  const [total] = useRead(readLedgerEndpoint, {
    params: { projectId },
    query: { ...filters, limit: '1' },
  });
  const set = (key: keyof Filters, value: string | null) => {
    setFilters((was) =>
      Object.fromEntries(
        Object.entries({ ...was, [key]: value ?? any }).filter(([, kept]) => kept !== any),
      ),
    );
  };
  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <div className="page-tools">
        <SelectField
          label={said.workflow}
          options={[
            { id: any, label: said.every },
            ...workflows.map((each) => ({ id: each, label: words.review.workflows[each] })),
          ]}
          value={filters.workflow ?? any}
          onChange={(value) => {
            set('workflow', value);
          }}
        />
        <SelectField
          label={said.payItem}
          options={[
            { id: any, label: said.every },
            ...names.payItems.map((item) => ({
              id: item.id,
              label: `${item.code} · ${item.description}`,
            })),
          ]}
          value={filters.payItemId ?? any}
          onChange={(value) => {
            set('payItemId', value);
          }}
        />
        <SelectField
          label={said.prime}
          options={[{ id: any, label: said.every }, ...optionsOf(names.contractors)]}
          value={filters.primeId ?? any}
          onChange={(value) => {
            set('primeId', value);
          }}
        />
        <SelectField
          label={said.batch}
          options={[
            { id: any, label: said.every },
            ...(batches.kind === 'answered'
              ? batches.answer.batches.map((each) => ({
                  id: each.batch.id,
                  label: each.batch.name,
                }))
              : []),
          ]}
          value={filters.invoiceBatchId ?? any}
          onChange={(value) => {
            set('invoiceBatchId', value);
          }}
        />
        <SelectField
          label={said.locked}
          options={[
            { id: any, label: said.every },
            { id: 'true', label: said.lockedOnly },
            { id: 'false', label: said.notLockedOnly },
          ]}
          value={filters.locked ?? any}
          onChange={(value) => {
            set('locked', value);
          }}
        />
        <DateEntry
          label={words.common.from}
          value={filters.from ?? ''}
          onChange={(value) => {
            set('from', value);
          }}
        />
        <DateEntry
          label={words.common.to}
          value={filters.to ?? ''}
          onChange={(value) => {
            set('to', value);
          }}
        />
      </div>
      <p className="ledger-total" role="status">
        {total.kind === 'answered'
          ? say(said.total, {
              lines: counted(said.lines, total.answer.total.lines),
              amount: money(total.answer.total.amount),
            })
          : words.common.loading}
      </p>
      <PagedTable
        caption={said.title}
        served={readLedgerEndpoint}
        asking={{ params: { projectId }, query: { ...filters, limit: '100' } }}
        rowsOf={(answer) => answer.lines}
        nextOf={(answer) => answer.next}
        keyOf={(line: LedgerLine) => line.id}
        columns={[
          {
            label: said.ticket,
            names: true,
            cell: (line) => (
              <Link className="link" href={ticketHref(projectId, line.workflow, line.ticketNumber)}>
                {`${line.ticketNumber}${line.splitSuffix === '' ? '' : `-${line.splitSuffix}`} #${String(line.slot)}`}
              </Link>
            ),
          },
          { label: said.day, cell: (line) => day(line.ticketDate) },
          {
            label: said.payItem,
            cell: (line) => `${line.payItem.code} · ${line.payItem.description}`,
          },
          {
            label: said.quantity,
            numeric: true,
            cell: (line) => `${line.quantity} ${words.review.units[line.unit]}`,
          },
          { label: said.rate, numeric: true, cell: (line) => money(line.rate) },
          { label: said.amount, numeric: true, cell: (line) => money(line.amount) },
          {
            label: said.prime,
            cell: (line) =>
              line.operatingSub === null
                ? line.prime.name
                : say(said.primeAndSub, { prime: line.prime.name, sub: line.operatingSub.name }),
          },
          { label: said.contract, cell: (line) => line.contract.name },
          { label: said.rule, cell: (line) => line.rule.name },
          { label: said.status, cell: (line) => words.review.statuses[line.status] },
          {
            label: said.qc,
            cell: (line) =>
              line.qcStatus === null ? words.review.qc.QC_REVIEW : words.review.qc[line.qcStatus],
          },
          {
            label: said.lock,
            cell: (line) =>
              line.lock === null
                ? said.notLocked
                : line.lock.invoiceBatch === null
                  ? said.lockedNoBatch
                  : say(said.lockedIn, { batch: line.lock.invoiceBatch.name }),
          },
          {
            label: said.mileage,
            numeric: true,
            cell: (line) => line.mileage ?? '',
          },
        ]}
      />
    </>
  );
}
