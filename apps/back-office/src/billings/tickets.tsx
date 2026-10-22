// QC and the invoice lock, many tickets at a time (spec/parts/08-review-and-corrections.md step 7;
// spec/parts/09-invoice-deliver-closeout.md, invoicing; adms-ledger-audit; ADR-107, 121, 168,
// 228, 535 (4); AC-09-08): a project's tickets of one workflow, any status, each with its QC mark,
// its lock and batch, what its lines come to, and why it can't be locked now in the domain's own
// words, so none is missed. Tickets picked are QC'd, or locked as invoiced in a batch where one
// is named; each is its own act, answered on its own (one refused never stops the rest). QC is on
// the completed load or haul-out (a split as one), never a single field event, and changes nothing
// on the record; only a QC Approved, completed ticket locks. A locked ticket is moved between
// batches, or unlocked (a grant of its own, audited), and then worked again as the setup stands.
import {
  listInvoiceBatchesEndpoint,
  listProjectTicketsEndpoint,
  lockSeveralAsInvoicedEndpoint,
  setLockBatchEndpoint,
  setQcStatusesEndpoint,
  ticketStatuses,
  unlockInvoicedEndpoint,
  type ProjectTicket,
} from '@open-adms/contracts';
import { qcStatuses, workflows, type WorkflowName } from '@open-adms/domain';
import { Banner, Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';
import { Link } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import { CheckField, ChoiceField, SelectField } from '../look/fields.tsx';
import { FormDialog, picked, text, type Values } from '../look/form-dialog.tsx';
import { PagedTable } from '../look/paged-table.tsx';
import { Trouble, useApi, useRead } from '../reading.tsx';
import { ticketHref } from '../review/queue.tsx';
import { Reviewed } from '../review/reviewing.tsx';
import { holds, useSigned } from '../session.tsx';
import { counted, day, money, say, words } from '../words.ts';

type Target = NonNullable<ProjectTicket['target']>;
type Open =
  | { readonly kind: 'qc' }
  | { readonly kind: 'lock' }
  | { readonly kind: 'batch'; readonly ticket: ProjectTicket; readonly target: Target }
  | { readonly kind: 'unlock'; readonly ticket: ProjectTicket; readonly target: Target };

// What one act of many came to, ticket by ticket.
interface Outcome {
  readonly ticketNumber: string;
  readonly saved: boolean;
  readonly message: string;
}

export function QcAndLock({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="qc-and-lock" className="page" id="content">
      <Reviewed projectId={projectId}>
        <TicketsOf projectId={projectId} />
      </Reviewed>
    </main>
  );
}

const any = '';

function TicketsOf({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const said = words.billings.tickets;
  const { session } = useSigned();
  const mayQc = holds(session, 'QC');
  const mayLock = holds(session, 'LOCK_INVOICED');
  const mayUnlock = holds(session, 'UNLOCK_INVOICED');
  const [workflow, setWorkflow] = useState<WorkflowName>('LOAD');
  const [status, setStatus] = useState<string>(any);
  const [qcStatus, setQcStatus] = useState<string>(any);
  const [locked, setLocked] = useState<string>(any);
  const [picks, setPicks] = useState<ReadonlyMap<string, Target>>(new Map());
  const [open, setOpen] = useState<Open | null>(null);
  const [reloaded, setReloaded] = useState(0);
  const [outcomes, setOutcomes] = useState<readonly Outcome[] | null>(null);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [batches, reloadBatches] = useRead(listInvoiceBatchesEndpoint, {
    params: { projectId },
    query: { limit: '200' },
  });
  const batchOptions =
    batches.kind === 'answered'
      ? batches.answer.batches.map((each) => ({ id: each.batch.id, label: each.batch.name }))
      : [];
  const picked_ = [...picks.entries()];
  const after = (results: readonly Outcome[]) => {
    setOutcomes(results);
    setPicks(new Map());
    setReloaded((count) => count + 1);
    reloadBatches();
  };
  const pick = (ticket: ProjectTicket, on: boolean) => {
    setPicks((was) => {
      const next = new Map(was);
      if (on && ticket.target !== null) next.set(ticket.ticketNumber, ticket.target);
      else next.delete(ticket.ticketNumber);
      return next;
    });
  };
  const noted = (values: Values): { note?: string } => {
    const note = text(values, 'note');
    return note === '' ? {} : { note };
  };

  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {failed === null ? null : <Trouble reply={failed} />}
      {outcomes === null ? null : (
        <Banner tone={outcomes.every((each) => each.saved) ? 'good' : 'notice'} announced>
          <p>
            {say(said.outcome, {
              saved: counted(said.ticketsCounted, outcomes.filter((each) => each.saved).length),
              refused: counted(said.ticketsCounted, outcomes.filter((each) => !each.saved).length),
            })}
          </p>
          <ul className="plain-list">
            {outcomes
              .filter((each) => !each.saved)
              .map((each) => (
                <li key={each.ticketNumber}>
                  {say(said.refused, { ticketNumber: each.ticketNumber, message: each.message })}
                </li>
              ))}
          </ul>
        </Banner>
      )}
      <div className="page-tools">
        <ChoiceField
          label={said.workflow}
          options={workflows.map((each) => ({ id: each, label: words.review.workflows[each] }))}
          value={workflow}
          onChange={(value) => {
            setWorkflow(workflows.find((each) => each === value) ?? 'LOAD');
            setPicks(new Map());
          }}
        />
        <SelectField
          label={said.status}
          options={[
            { id: any, label: said.every },
            ...ticketStatuses.map((each) => ({ id: each, label: words.review.statuses[each] })),
          ]}
          value={status}
          onChange={(value) => {
            setStatus(value ?? any);
          }}
        />
        <SelectField
          label={said.qc}
          options={[
            { id: any, label: said.every },
            { id: 'NONE', label: said.noMark },
            ...qcStatuses.map((each) => ({ id: each, label: words.review.qc[each] })),
          ]}
          value={qcStatus}
          onChange={(value) => {
            setQcStatus(value ?? any);
          }}
        />
        <SelectField
          label={said.locked}
          options={[
            { id: any, label: said.every },
            { id: 'true', label: said.lockedOnly },
            { id: 'false', label: said.notLockedOnly },
          ]}
          value={locked}
          onChange={(value) => {
            setLocked(value ?? any);
          }}
        />
      </div>
      {mayQc || mayLock ? (
        <div className="page-tools">
          <p role="status">{counted(said.picked, picked_.length)}</p>
          {mayQc ? (
            <Button
              isDisabled={picked_.length === 0}
              onPress={() => {
                setOpen({ kind: 'qc' });
              }}
            >
              {said.setQc}
            </Button>
          ) : null}
          {mayLock ? (
            <Button
              isDisabled={picked_.length === 0}
              onPress={() => {
                setOpen({ kind: 'lock' });
              }}
            >
              {said.lock}
            </Button>
          ) : null}
        </div>
      ) : null}
      <PagedTable
        caption={say(said.caption, { workflow: words.review.workflows[workflow] })}
        served={listProjectTicketsEndpoint}
        asking={{
          params: { projectId },
          query: {
            workflow,
            limit: '100',
            ...(status === any ? {} : { status: status as ProjectTicket['statuses'][number] }),
            ...(qcStatus === any ? {} : { qcStatus: qcStatus as 'NONE' }),
            ...(locked === any ? {} : { locked: locked as 'true' | 'false' }),
          },
        }}
        rowsOf={(answer) => answer.tickets}
        nextOf={(answer) => answer.next}
        keyOf={(ticket: ProjectTicket) => ticket.ticketNumber}
        reloaded={reloaded}
        columns={[
          ...(mayQc || mayLock
            ? [
                {
                  label: said.pick,
                  cell: (ticket: ProjectTicket) =>
                    ticket.target === null ? null : (
                      <CheckField
                        label={say(said.pickTicket, { number: ticket.ticketNumber })}
                        value={picks.has(ticket.ticketNumber)}
                        onChange={(on) => {
                          pick(ticket, on);
                        }}
                      />
                    ),
                },
              ]
            : []),
          {
            label: said.ticket,
            names: true,
            cell: (ticket) => (
              <Link
                className="link"
                href={ticketHref(projectId, ticket.workflow, ticket.ticketNumber)}
              >
                {ticket.ticketNumber}
              </Link>
            ),
          },
          {
            label: said.day,
            cell: (ticket) => (ticket.ticketDate === null ? '' : day(ticket.ticketDate)),
          },
          {
            label: said.status,
            cell: (ticket) => ticket.statuses.map((each) => words.review.statuses[each]).join(', '),
          },
          {
            label: said.qc,
            cell: (ticket) =>
              ticket.qcStatus === null
                ? words.review.qc.QC_REVIEW
                : words.review.qc[ticket.qcStatus],
          },
          {
            label: said.amount,
            numeric: true,
            cell: (ticket) =>
              say(said.amountOn, {
                amount: money(ticket.amount),
                lines: counted(said.lines, ticket.lines),
              }),
          },
          {
            label: said.lockColumn,
            cell: (ticket) =>
              ticket.lock !== null
                ? ticket.lock.invoiceBatch === null
                  ? said.lockedNoBatch
                  : say(said.lockedIn, { batch: ticket.lock.invoiceBatch.name })
                : (ticket.lockRefusal?.message ?? said.mayLock),
          },
          ...(mayLock || mayUnlock
            ? [
                {
                  label: words.common.actions,
                  cell: (ticket: ProjectTicket) => {
                    const { target } = ticket;
                    if (ticket.lock === null || target === null) return null;
                    return (
                      <div className="row-actions">
                        {mayLock ? (
                          <Button
                            onPress={() => {
                              setOpen({ kind: 'batch', ticket, target });
                            }}
                          >
                            {say(words.common.of, {
                              what: said.moveBatch,
                              name: ticket.ticketNumber,
                            })}
                          </Button>
                        ) : null}
                        {mayUnlock ? (
                          <Button
                            onPress={() => {
                              setOpen({ kind: 'unlock', ticket, target });
                            }}
                          >
                            {say(words.common.of, { what: said.unlock, name: ticket.ticketNumber })}
                          </Button>
                        ) : null}
                      </div>
                    );
                  },
                },
              ]
            : []),
        ]}
      />
      {open?.kind === 'qc' ? (
        <FormDialog
          title={say(said.setQcOn, { tickets: counted(said.ticketsCounted, picked_.length) })}
          fields={[
            {
              kind: 'pick',
              key: 'status',
              label: said.qcTo,
              required: true,
              options: qcStatuses.map((each) => ({ id: each, label: words.review.qc[each] })),
            },
            { kind: 'text', key: 'note', label: words.review.note, longest: 500 },
          ]}
          initial={{ status: 'QC_APPROVED' }}
          saveLabel={said.setQc}
          save={async (values) => {
            const status =
              qcStatuses.find((each) => each === picked(values, 'status')) ?? 'QC_REVIEW';
            const reply = await api.ask(setQcStatusesEndpoint, {
              body: {
                marks: picked_.map(([, record]) => ({ record, status, ...noted(values) })),
              },
            });
            if (reply.kind !== 'answered') return reply;
            after(
              reply.answer.outcomes.map((outcome, at) => ({
                ticketNumber: picked_[at]?.[0] ?? '',
                saved: outcome.saved,
                message: outcome.saved ? '' : outcome.message,
              })),
            );
            return null;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'lock' ? (
        <FormDialog
          title={say(said.lockOn, { tickets: counted(said.ticketsCounted, picked_.length) })}
          fields={[{ kind: 'pick', key: 'batch', label: said.batch, options: batchOptions }]}
          initial={{}}
          saveLabel={said.lock}
          save={async (values) => {
            const batch = picked(values, 'batch');
            const reply = await api.ask(lockSeveralAsInvoicedEndpoint, {
              body: {
                tickets: picked_.map(([, target]) => target),
                ...(batch === null ? {} : { invoiceBatchId: batch }),
              },
            });
            if (reply.kind !== 'answered') return reply;
            after(
              reply.answer.outcomes.map((outcome, at) => ({
                ticketNumber: picked_[at]?.[0] ?? '',
                saved: outcome.saved,
                message: outcome.saved ? '' : outcome.message,
              })),
            );
            return null;
          }}
          onClose={() => {
            setOpen(null);
          }}
        >
          <p>{said.lockAbout}</p>
        </FormDialog>
      ) : null}
      {open?.kind === 'batch' ? (
        <FormDialog
          title={say(words.common.of, { what: said.moveBatch, name: open.ticket.ticketNumber })}
          fields={[{ kind: 'pick', key: 'batch', label: said.batch, options: batchOptions }]}
          initial={{ batch: open.ticket.lock?.invoiceBatch?.id ?? '' }}
          save={async (values) => {
            const reply = await api.ask(setLockBatchEndpoint, {
              body: {
                ticket: open.target,
                invoiceBatchId: picked(values, 'batch'),
              },
            });
            if (reply.kind !== 'answered') return reply;
            after([{ ticketNumber: open.ticket.ticketNumber, saved: true, message: '' }]);
            return null;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === 'unlock' ? (
        <FormDialog
          title={say(words.common.of, { what: said.unlock, name: open.ticket.ticketNumber })}
          fields={[{ kind: 'text', key: 'note', label: words.review.note, longest: 500 }]}
          initial={{}}
          saveLabel={said.unlock}
          save={async (values) => {
            const reply = await api.ask(unlockInvoicedEndpoint, {
              body: { ticket: open.target, ...noted(values) },
            });
            if (reply.kind !== 'answered') return reply;
            setFailed(null);
            after([{ ticketNumber: open.ticket.ticketNumber, saved: true, message: '' }]);
            return null;
          }}
          onClose={() => {
            setOpen(null);
          }}
        >
          <p>{said.unlockAbout}</p>
        </FormDialog>
      ) : null}
    </>
  );
}
