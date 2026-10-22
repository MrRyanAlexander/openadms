// A project's invoice batches (spec/parts/09-invoice-deliver-closeout.md, invoicing step 2;
// adms-ledger-audit; ADR-057, 228, 363): a batch is a name and its tickets, no amounts, kept for
// ever (renamed, never archived); a name is used once on its project. Opened, a batch lists each
// lock in force that names it, with its ticket; what its tickets come to is the ledger's, read by
// the batch. Tickets are locked into a batch on the QC and lock screen.
import {
  createInvoiceBatchEndpoint,
  listInvoiceBatchesEndpoint,
  readInvoiceBatchEndpoint,
  readLedgerEndpoint,
  renameInvoiceBatchEndpoint,
  type InvoiceBatchesAnswer,
} from '@open-adms/contracts';
import { Button, ScreenTitle } from '@open-adms/look';
import { useEffect, useState } from 'react';
import { Link } from 'react-aria-components';

import { FormDialog, text } from '../look/form-dialog.tsx';
import { PagedTable, Table } from '../look/paged-table.tsx';
import { Shown, useApi, useRead } from '../reading.tsx';
import { ticketHref } from '../review/queue.tsx';
import { at, personOf, Reviewed, useReviewing } from '../review/reviewing.tsx';
import { holds, useSigned } from '../session.tsx';
import { useTold, type SetupWritten } from '../setup/common.tsx';
import { counted, money, say, words } from '../words.ts';

type Batch = InvoiceBatchesAnswer['batches'][number];

export function InvoiceBatches({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="invoice-batches" className="page" id="content">
      <Reviewed projectId={projectId}>
        <BatchesOf projectId={projectId} />
      </Reviewed>
    </main>
  );
}

function BatchesOf({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const said = words.billings.batches;
  const { names, clock } = useReviewing();
  const { session } = useSigned();
  const mayLock = holds(session, 'LOCK_INVOICED');
  const [open, setOpen] = useState<{ readonly batch: Batch | null } | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [reloaded, setReloaded] = useState(0);
  const [told, tell] = useTold();
  const done = (written: SetupWritten): null => {
    tell(written);
    setReloaded((count) => count + 1);
    return null;
  };
  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      {mayLock ? (
        <div className="page-tools">
          <Button
            main
            onPress={() => {
              setOpen({ batch: null });
            }}
          >
            {said.add}
          </Button>
        </div>
      ) : null}
      <PagedTable
        caption={said.title}
        served={listInvoiceBatchesEndpoint}
        asking={{ params: { projectId }, query: { limit: '100' } }}
        rowsOf={(answer) => answer.batches}
        nextOf={(answer) => answer.next}
        keyOf={(each: Batch) => each.batch.id}
        reloaded={reloaded}
        columns={[
          { label: said.name, names: true, cell: (each) => each.batch.name },
          {
            label: said.made,
            cell: (each) =>
              say(said.madeBy, {
                person: personOf(names, each.batch.createdById),
                at: at(clock, each.batch.createdAt),
              }),
          },
          {
            label: said.tickets,
            numeric: true,
            cell: (each) => counted(said.ticketsCounted, each.locksInForce),
          },
          {
            label: words.common.actions,
            cell: (each) => (
              <div className="row-actions">
                <Button
                  onPress={() => {
                    setShown(each.batch.id);
                  }}
                >
                  {say(words.common.of, { what: said.open, name: each.batch.name })}
                </Button>
                {mayLock ? (
                  <Button
                    onPress={() => {
                      setOpen({ batch: each });
                    }}
                  >
                    {say(words.common.of, { what: said.rename, name: each.batch.name })}
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />
      {shown === null ? null : (
        <BatchShown projectId={projectId} batchId={shown} reloaded={reloaded} />
      )}
      {open === null ? null : (
        <FormDialog
          title={
            open.batch === null
              ? said.add
              : say(words.common.of, { what: said.rename, name: open.batch.batch.name })
          }
          fields={[{ kind: 'text', key: 'name', label: said.name, required: true, longest: 200 }]}
          initial={{ name: open.batch?.batch.name ?? '' }}
          save={async (values) => {
            const name = text(values, 'name');
            const reply =
              open.batch === null
                ? await api.ask(createInvoiceBatchEndpoint, {
                    params: { projectId },
                    body: { name },
                  })
                : await api.ask(renameInvoiceBatchEndpoint, {
                    params: { invoiceBatchId: open.batch.batch.id },
                    body: { name },
                  });
            return reply.kind === 'answered' ? done(reply.answer) : reply;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

// One batch opened: its tickets, and what the ledger's lines in it come to.
function BatchShown({
  projectId,
  batchId,
  reloaded,
}: {
  readonly projectId: string;
  readonly batchId: string;
  readonly reloaded: number;
}) {
  const said = words.billings.batches;
  const { clock, names } = useReviewing();
  const [read, reload] = useRead(readInvoiceBatchEndpoint, { params: { invoiceBatchId: batchId } });
  const [total, reloadTotal] = useRead(readLedgerEndpoint, {
    params: { projectId },
    query: { invoiceBatchId: batchId, limit: '1' },
  });
  // Read again whenever the list of batches is (a rename).
  useEffect(() => {
    if (reloaded === 0) return;
    reload();
    reloadTotal();
  }, [reloaded, reload, reloadTotal]);
  return (
    <Shown read={read}>
      {(answer) => (
        <section aria-labelledby="batch-shown">
          <h2 id="batch-shown">{answer.batch.name}</h2>
          <p role="status">
            {total.kind === 'answered'
              ? say(said.comesTo, {
                  lines: counted(words.billings.ledger.lines, total.answer.total.lines),
                  amount: money(total.answer.total.amount),
                })
              : words.common.loading}
          </p>
          <Table
            caption={say(said.ticketsIn, { name: answer.batch.name })}
            rows={answer.locks}
            keyOf={(each) => each.lock.id}
            columns={[
              {
                label: said.ticket,
                names: true,
                cell: (each) => (
                  <Link
                    className="link"
                    href={ticketHref(projectId, each.ticket.workflow, each.ticket.ticketNumber)}
                  >
                    {each.ticket.ticketNumber}
                  </Link>
                ),
              },
              {
                label: said.lockedBy,
                cell: (each) =>
                  say(said.madeBy, {
                    person: personOf(names, each.lock.lockedById),
                    at: at(clock, each.lock.lockedAt),
                  }),
              },
            ]}
          />
        </section>
      )}
    </Shown>
  );
}
