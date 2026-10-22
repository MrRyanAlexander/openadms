// What waits for a person beside the review queue (spec/parts/05-sync.md step 6; spec/parts/
// 08-review-and-corrections.md, "One review queue"; adms-exceptions; ADR-022, 468, 482, 498, 526,
// 545): nothing a phone sends is ever dropped.
// - **Quarantined records**: a second field event of one kind under a number another holds, or an
//   ROE number another ROE holds, shown beside the record that holds it. Real work under the wrong
//   number is given the number it should have had; a second copy of the same record is marked so
//   and nothing is made from it. Never renumber a phantom: that double-bills.
// - **Held records**: what a sync couldn't save, exactly as sent, with why and what its phone was
//   told; saved as corrected (the record as it should be, in the sync's own shape), or closed.
// - **Files set aside**: a photograph's file that wasn't the file its phone fingerprinted; read,
//   or closed (the photograph's own file won't come).
// - **Jobs set aside**: a job of the worker that failed too often; its tickets put back as a
//   reprocess naming it, nothing changed.
import {
  closeHeldRecordEndpoint,
  closeSetAsideFileEndpoint,
  correctedRecordSchema,
  listHeldRecordsEndpoint,
  listQuarantinedRecordsEndpoint,
  listSetAsideFilesEndpoint,
  listSetAsideJobsEndpoint,
  markSecondCopyEndpoint,
  renumberQuarantinedRecordEndpoint,
  reprocessTicketsEndpoint,
  saveHeldRecordEndpoint,
  setAsideFileEndpoint,
  type HeldRecordsAnswer,
  type QuarantinedRecordsAnswer,
  type SetAsideFilesAnswer,
  type SetAsideJobsAnswer,
} from '@open-adms/contracts';
import { fieldEventKinds as reviewKinds } from '@open-adms/domain';
import { Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';
import { Link } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import { ChoiceField } from '../look/fields.tsx';
import { FormDialog, text, type FieldSpec, type Values } from '../look/form-dialog.tsx';
import { PagedTable } from '../look/paged-table.tsx';
import { Trouble, useApi } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { useTold, type SetupWritten } from '../setup/common.tsx';
import { counted, say, words } from '../words.ts';
import { ticketHref } from './queue.tsx';
import { at, personOf, Reviewed, useReviewing } from './reviewing.tsx';

type Quarantined = QuarantinedRecordsAnswer['quarantinedRecords'][number];
type Held = HeldRecordsAnswer['heldRecords'][number];
type SetAsideFile = SetAsideFilesAnswer['setAsideFiles'][number];
type Job = SetAsideJobsAnswer['jobs'][number];

const noteField: FieldSpec = { kind: 'text', key: 'note', label: words.review.note, longest: 500 };
const requiredNote: FieldSpec = { ...noteField, required: true };
const optionalNote = (values: Values): { note?: string } => {
  const note = text(values, 'note');
  return note === '' ? {} : { note };
};

// Waiting or resolved, picked above a list; the list read again after an act.
function useWaiting() {
  const [waiting, setWaiting] = useState<'true' | 'false'>('true');
  const [reloaded, setReloaded] = useState(0);
  const [told, tell] = useTold();
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const picker = (
    <ChoiceField
      label={words.waiting.show}
      options={[
        { id: 'true', label: words.waiting.waiting },
        { id: 'false', label: words.waiting.resolved },
      ]}
      value={waiting}
      onChange={(value) => {
        setWaiting(value === 'false' ? 'false' : 'true');
      }}
    />
  );
  const done = (written: SetupWritten): null => {
    setFailed(null);
    tell(written);
    setReloaded((count) => count + 1);
    return null;
  };
  return { waiting, picker, reloaded, told, failed, setFailed, done };
}

// What a phone sent, in a line: its kind and number where it has them.
const textIn = (value: unknown): string => (typeof value === 'string' ? value : '');
function sentOf(sent: unknown): string {
  const said = words.waiting;
  if (typeof sent !== 'object' || sent === null) return said.unreadable;
  const wire = sent as Record<string, unknown>;
  const event = wire['fieldEvent'] as Record<string, unknown> | undefined;
  if (event !== undefined) {
    const suffix = textIn(event['splitSuffix']);
    const kind = reviewKinds.find((each) => each === event['kind']);
    return say(said.sentEvent, {
      kind: kind === undefined ? textIn(event['kind']) : words.review.kinds[kind],
      number: `${textIn(event['ticketNumber'])}${suffix === '' ? '' : `-${suffix}`}`,
    });
  }
  const roe = wire['roe'] as Record<string, unknown> | undefined;
  if (roe !== undefined) return say(said.sentRoe, { number: textIn(roe['roeNumber']) });
  const record = textIn(wire['record']);
  return record === '' ? said.unreadable : say(said.sentRecord, { record });
}

const resolutionOf = (
  row: { resolvedAt: string | null; resolvedById: string | null; resolution: string | null },
  names: ReturnType<typeof useReviewing>['names'],
  clock: ReturnType<typeof useReviewing>['clock'],
): string =>
  row.resolvedAt === null
    ? words.waiting.notResolved
    : say(words.waiting.resolvedBy, {
        person: personOf(names, row.resolvedById),
        at: at(clock, row.resolvedAt),
        how: row.resolution ?? '',
      });

export function Quarantine({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="quarantine" className="page" id="content">
      <Reviewed projectId={projectId}>
        <QuarantineOf projectId={projectId} />
      </Reviewed>
    </main>
  );
}

function QuarantineOf({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const said = words.waiting.quarantine;
  const { names, clock } = useReviewing();
  const { session } = useSigned();
  const mayRenumber = holds(session, 'RENUMBER');
  const state = useWaiting();
  const [open, setOpen] = useState<{ kind: 'renumber' | 'copy'; row: Quarantined } | null>(null);
  const closed = () => {
    setOpen(null);
  };
  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {state.told}
      {state.failed === null ? null : <Trouble reply={state.failed} />}
      <div className="page-tools">{state.picker}</div>
      <PagedTable
        caption={said.title}
        served={listQuarantinedRecordsEndpoint}
        asking={{ query: { projectId, waiting: state.waiting, limit: '50' } }}
        rowsOf={(answer) => answer.quarantinedRecords}
        nextOf={(answer) => answer.next}
        keyOf={(row: Quarantined) => row.id}
        reloaded={state.reloaded}
        columns={[
          { label: said.sent, names: true, cell: (row) => sentOf(row.sent) },
          { label: said.monitor, cell: (row) => personOf(names, row.monitorId) },
          { label: said.received, cell: (row) => at(clock, row.receivedAt) },
          { label: said.reason, cell: (row) => said.reasons[row.reason] },
          {
            label: said.holder,
            cell: (row) =>
              row.holder.kind === 'FIELD_EVENT' ? (
                <Link
                  className="link"
                  href={ticketHref(
                    projectId,
                    row.holder.fieldEvent.workflow,
                    row.holder.fieldEvent.ticketNumber,
                  )}
                >
                  {say(said.holderEvent, {
                    kind: words.review.kinds[row.holder.fieldEvent.kind],
                    number: row.holder.fieldEvent.ticketNumber,
                    monitor: personOf(names, row.holder.fieldEvent.monitorId),
                    at: at(clock, row.holder.fieldEvent.endedAt),
                  })}
                </Link>
              ) : (
                say(said.holderRoe, { number: row.holder.roe.roeNumber })
              ),
          },
          { label: said.resolution, cell: (row) => resolutionOf(row, names, clock) },
          ...(mayRenumber
            ? [
                {
                  label: words.common.actions,
                  cell: (row: Quarantined) =>
                    row.resolvedAt !== null ? null : (
                      <div className="row-actions">
                        <Button
                          onPress={() => {
                            setOpen({ kind: 'renumber', row });
                          }}
                        >
                          {say(words.common.of, { what: said.renumber, name: sentOf(row.sent) })}
                        </Button>
                        <Button
                          onPress={() => {
                            setOpen({ kind: 'copy', row });
                          }}
                        >
                          {say(words.common.of, { what: said.secondCopy, name: sentOf(row.sent) })}
                        </Button>
                      </div>
                    ),
                },
              ]
            : []),
        ]}
      />
      {open?.kind === 'renumber' ? (
        <FormDialog
          title={say(words.common.of, { what: said.renumber, name: sentOf(open.row.sent) })}
          fields={
            open.row.holder.kind === 'ROE'
              ? [
                  {
                    kind: 'text',
                    key: 'number',
                    label: said.roeNumber,
                    required: true,
                    longest: 40,
                  },
                  noteField,
                ]
              : [
                  {
                    kind: 'text',
                    key: 'number',
                    label: said.ticketNumber,
                    required: true,
                    longest: 40,
                  },
                  { kind: 'text', key: 'suffix', label: said.splitSuffix, longest: 4 },
                  noteField,
                ]
          }
          initial={{}}
          saveLabel={said.renumber}
          save={async (values) => {
            const typed = text(values, 'number');
            const suffix = text(values, 'suffix');
            const reply = await api.ask(renumberQuarantinedRecordEndpoint, {
              params: { quarantinedRecordId: open.row.id },
              body: {
                to:
                  open.row.holder.kind === 'ROE'
                    ? { roeNumber: typed }
                    : {
                        ticketNumber: typed,
                        ...(suffix === '' ? {} : { splitSuffix: suffix.toUpperCase() }),
                      },
                ...optionalNote(values),
              },
            });
            return reply.kind === 'answered' ? state.done(reply.answer) : reply;
          }}
          onClose={closed}
        >
          <p>{said.renumberAbout}</p>
        </FormDialog>
      ) : null}
      {open?.kind === 'copy' ? (
        <FormDialog
          title={say(words.common.of, { what: said.secondCopy, name: sentOf(open.row.sent) })}
          fields={[noteField]}
          initial={{}}
          saveLabel={said.secondCopy}
          save={async (values) => {
            const reply = await api.ask(markSecondCopyEndpoint, {
              params: { quarantinedRecordId: open.row.id },
              body: optionalNote(values),
            });
            return reply.kind === 'answered' ? state.done(reply.answer) : reply;
          }}
          onClose={closed}
        >
          <p>{said.secondCopyAbout}</p>
        </FormDialog>
      ) : null}
    </>
  );
}

export function HeldRecords({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="held" className="page" id="content">
      <Reviewed projectId={projectId}>
        <HeldOf projectId={projectId} />
        <SetAsideFiles projectId={projectId} />
      </Reviewed>
    </main>
  );
}

function HeldOf({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const said = words.waiting.held;
  const { names, clock } = useReviewing();
  const { session } = useSigned();
  const mayCorrect = holds(session, 'CORRECT');
  const mayClose = holds(session, 'VOID');
  const state = useWaiting();
  const [open, setOpen] = useState<{ kind: 'save' | 'close'; row: Held } | null>(null);
  const closed = () => {
    setOpen(null);
  };
  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {state.told}
      {state.failed === null ? null : <Trouble reply={state.failed} />}
      <div className="page-tools">{state.picker}</div>
      <PagedTable
        caption={said.title}
        served={listHeldRecordsEndpoint}
        asking={{ query: { projectId, waiting: state.waiting, limit: '50' } }}
        rowsOf={(answer) => answer.heldRecords}
        nextOf={(answer) => answer.next}
        keyOf={(row: Held) => row.id}
        reloaded={state.reloaded}
        columns={[
          { label: said.sent, names: true, cell: (row) => sentOf(row.sent) },
          { label: said.monitor, cell: (row) => personOf(names, row.sentMonitorId) },
          { label: said.received, cell: (row) => at(clock, row.receivedAt) },
          { label: said.why, cell: (row) => row.message },
          { label: said.photos, numeric: true, cell: (row) => String(row.photos.length) },
          { label: said.resolution, cell: (row) => resolutionOf(row, names, clock) },
          ...(mayCorrect || mayClose
            ? [
                {
                  label: words.common.actions,
                  cell: (row: Held) =>
                    row.resolvedAt !== null ? null : (
                      <div className="row-actions">
                        {mayCorrect && row.sentId !== null && row.sentAs !== 'REPORT' ? (
                          <Button
                            onPress={() => {
                              setOpen({ kind: 'save', row });
                            }}
                          >
                            {say(words.common.of, { what: said.save, name: sentOf(row.sent) })}
                          </Button>
                        ) : null}
                        {mayClose ? (
                          <Button
                            onPress={() => {
                              setOpen({ kind: 'close', row });
                            }}
                          >
                            {say(words.common.of, { what: said.close, name: sentOf(row.sent) })}
                          </Button>
                        ) : null}
                      </div>
                    ),
                },
              ]
            : []),
        ]}
      />
      {open?.kind === 'save' ? (
        <FormDialog
          title={say(words.common.of, { what: said.save, name: sentOf(open.row.sent) })}
          fields={[
            { kind: 'long', key: 'record', label: said.record, hint: said.recordHint },
            requiredNote,
          ]}
          initial={{ record: JSON.stringify(open.row.sent, null, 2) }}
          saveLabel={said.save}
          save={async (values) => {
            let parsed: unknown;
            try {
              parsed = JSON.parse(text(values, 'record'));
            } catch {
              return { kind: 'refused', code: 'BAD_REQUEST', message: said.notJson };
            }
            const record = correctedRecordSchema.safeParse(parsed);
            if (!record.success) {
              return {
                kind: 'refused',
                code: 'BAD_REQUEST',
                message: say(said.notRecord, {
                  problem: record.error.issues
                    .slice(0, 3)
                    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                    .join('; '),
                }),
              };
            }
            const reply = await api.ask(saveHeldRecordEndpoint, {
              params: { heldRecordId: open.row.id },
              body: { record: record.data, note: text(values, 'note') },
            });
            return reply.kind === 'answered' ? state.done(reply.answer) : reply;
          }}
          onClose={closed}
        >
          <p>{open.row.message}</p>
        </FormDialog>
      ) : null}
      {open?.kind === 'close' ? (
        <FormDialog
          title={say(words.common.of, { what: said.close, name: sentOf(open.row.sent) })}
          fields={[requiredNote]}
          initial={{}}
          saveLabel={said.close}
          save={async (values) => {
            const reply = await api.ask(closeHeldRecordEndpoint, {
              params: { heldRecordId: open.row.id },
              body: { note: text(values, 'note') },
            });
            return reply.kind === 'answered' ? state.done(reply.answer) : reply;
          }}
          onClose={closed}
        >
          <p>{said.closeAbout}</p>
        </FormDialog>
      ) : null}
    </>
  );
}

function SetAsideFiles({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const said = words.waiting.files;
  const { names, clock } = useReviewing();
  const { session } = useSigned();
  const mayClose = holds(session, 'VOID');
  const state = useWaiting();
  const [open, setOpen] = useState<SetAsideFile | null>(null);
  const saveFile = (row: SetAsideFile) => {
    void api.file(setAsideFileEndpoint, { params: { setAsideFileId: row.id } }).then((read) => {
      if (read.kind !== 'file') {
        state.setFailed(read);
        return;
      }
      const url = URL.createObjectURL(read.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = read.name ?? `set-aside-${row.id}`;
      link.click();
      URL.revokeObjectURL(url);
    });
  };
  return (
    <section aria-labelledby="set-aside-files">
      <h2 id="set-aside-files">{said.title}</h2>
      <p>{said.about}</p>
      {state.told}
      {state.failed === null ? null : <Trouble reply={state.failed} />}
      <div className="page-tools">{state.picker}</div>
      <PagedTable
        caption={said.title}
        served={listSetAsideFilesEndpoint}
        asking={{ query: { projectId, waiting: state.waiting, limit: '50' } }}
        rowsOf={(answer) => answer.setAsideFiles}
        nextOf={(answer) => answer.next}
        keyOf={(row: SetAsideFile) => row.id}
        reloaded={state.reloaded}
        columns={[
          {
            label: said.belongsTo,
            names: true,
            cell: (row) =>
              say(said.belongs, {
                kind: said.owners[row.photograph.belongsTo.kind],
                file: said.fileKinds[row.file],
              }),
          },
          { label: said.received, cell: (row) => at(clock, row.receivedAt) },
          {
            label: said.kept,
            cell: (row) => (row.photograph.kept ? words.common.yes : words.common.no),
          },
          { label: said.resolution, cell: (row) => resolutionOf(row, names, clock) },
          {
            label: words.common.actions,
            cell: (row) => (
              <div className="row-actions">
                <Button
                  onPress={() => {
                    saveFile(row);
                  }}
                >
                  {said.download}
                </Button>
                {mayClose && row.resolvedAt === null ? (
                  <Button
                    onPress={() => {
                      setOpen(row);
                    }}
                  >
                    {said.close}
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />
      {open === null ? null : (
        <FormDialog
          title={said.close}
          fields={[requiredNote]}
          initial={{}}
          saveLabel={said.close}
          save={async (values) => {
            const reply = await api.ask(closeSetAsideFileEndpoint, {
              params: { setAsideFileId: open.id },
              body: { note: text(values, 'note') },
            });
            return reply.kind === 'answered' ? state.done(reply.answer) : reply;
          }}
          onClose={() => {
            setOpen(null);
          }}
        >
          <p>{said.closeAbout}</p>
        </FormDialog>
      )}
    </section>
  );
}

export function SetAsideJobs({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="set-aside-jobs" className="page" id="content">
      <Reviewed projectId={projectId}>
        <JobsOf projectId={projectId} />
      </Reviewed>
    </main>
  );
}

function JobsOf({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const said = words.waiting.jobs;
  const { names, clock } = useReviewing();
  const { session } = useSigned();
  const mayPutBack = holds(session, 'CORRECT');
  const state = useWaiting();
  const [open, setOpen] = useState<Job | null>(null);
  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {state.told}
      <PagedTable
        caption={said.title}
        served={listSetAsideJobsEndpoint}
        asking={{ params: { projectId }, query: { limit: '50' } }}
        rowsOf={(answer) => answer.jobs}
        nextOf={(answer) => answer.next}
        keyOf={(job: Job) => job.id}
        reloaded={state.reloaded}
        columns={[
          { label: said.setAside, names: true, cell: (job) => at(clock, job.setAsideAt) },
          { label: said.queued, cell: (job) => at(clock, job.queuedAt) },
          { label: said.started, cell: (job) => words.history.triggers[job.trigger] },
          { label: said.askedBy, cell: (job) => personOf(names, job.requestedById) },
          { label: said.tries, numeric: true, cell: (job) => String(job.tries) },
          {
            label: said.tickets,
            cell: (job) => (
              <ul className="plain-list">
                {job.tickets.map((ticket) => (
                  <li key={`${ticket.workflow}-${ticket.ticketNumber}`}>
                    <Link
                      className="link"
                      href={ticketHref(projectId, ticket.workflow, ticket.ticketNumber)}
                    >
                      {ticket.ticketNumber}
                    </Link>
                    {ticket.waiting ? ` (${said.waiting})` : ''}
                  </li>
                ))}
              </ul>
            ),
          },
          ...(mayPutBack
            ? [
                {
                  label: words.common.actions,
                  cell: (job: Job) => (
                    <Button
                      onPress={() => {
                        setOpen(job);
                      }}
                    >
                      {say(words.common.of, {
                        what: said.putBack,
                        name: counted(said.ticketsCounted, job.tickets.length),
                      })}
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
      {open === null ? null : (
        <FormDialog
          title={said.putBack}
          fields={[noteField]}
          initial={{}}
          saveLabel={said.putBack}
          save={async (values) => {
            const reply = await api.ask(reprocessTicketsEndpoint, {
              params: { projectId },
              body: { setAsideJobId: open.id, ...optionalNote(values) },
            });
            return reply.kind === 'answered' ? state.done(reply.answer) : reply;
          }}
          onClose={() => {
            setOpen(null);
          }}
        >
          <p>{said.putBackAbout}</p>
        </FormDialog>
      )}
    </>
  );
}
