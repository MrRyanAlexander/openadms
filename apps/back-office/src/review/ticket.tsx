// One ticket, whole, as the back office reads it (spec/parts/08-review-and-corrections.md; ADR-224,
// 236): its number and the field events under it side by side, in field time; what the worker
// concluded from them (the completed load or haul-out, its lines with their rates and amounts);
// its flags in the worker's words with every acceptance they had; its QC mark, locks, voids and
// unvoids; and its history from the audit log, with what each run decided and why. A reviewer
// works out what happened before touching anything (adms-exceptions §4.3a): real work under the
// wrong number is renumbered, a detail keyed wrong is corrected, a phantom is voided with a reason,
// a flag that is right as it is is accepted with a reason. Each act queues the ticket, and the
// page reads it again as the worker works it. A ticket locked as invoiced is unlocked first.
import {
  acceptFlagEndpoint,
  readTicketDecisionsEndpoint,
  readTicketEndpoint,
  readTicketHistoryEndpoint,
  reprocessTicketsEndpoint,
  unvoidTicketEndpoint,
  voidTicketEndpoint,
  withdrawAcceptanceEndpoint,
  type FlagRecord,
  type TicketAnswer,
} from '@open-adms/contracts';
import { workflows, type WorkflowName } from '@open-adms/domain';
import { Banner, Button, ScreenTitle } from '@open-adms/look';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import { FormDialog, picked, text, type FieldSpec, type Values } from '../look/form-dialog.tsx';
import { Table } from '../look/paged-table.tsx';
import { Shown, Trouble, useApi, useRead } from '../reading.tsx';
import { navigate, useWhere } from '../router.tsx';
import { holds, useSigned } from '../session.tsx';
import { useTold, type SetupWritten } from '../setup/common.tsx';
import { money, number, say, words } from '../words.ts';
import { FieldEventCard } from './field-event-card.tsx';
import { AuditEntries, Decisions } from './history.tsx';
import { NewFieldEvent } from './made-here.tsx';
import { ticketHref } from './queue.tsx';
import {
  at,
  nameOf,
  payItemOf,
  personOf,
  reasonsFor,
  Reviewed,
  useReviewing,
} from './reviewing.tsx';

type Open =
  | { readonly kind: 'void' }
  | { readonly kind: 'unvoid' }
  | { readonly kind: 'reprocess' }
  | { readonly kind: 'accept'; readonly flag: FlagRecord }
  | { readonly kind: 'withdraw'; readonly acceptanceId: string }
  | { readonly kind: 'make' };

export function TicketPage({
  projectId,
  workflow,
  ticketNumber,
}: {
  readonly projectId: string;
  readonly workflow: string;
  readonly ticketNumber: string;
}) {
  const known = workflows.find((each) => each === workflow);
  return (
    <main data-screen="ticket" className="page" id="content">
      <Reviewed projectId={projectId}>
        {known === undefined ? (
          <Trouble reply={{ kind: 'refused', code: 'NOT_FOUND' }} />
        ) : (
          <TicketOf projectId={projectId} workflow={known} ticketNumber={ticketNumber} />
        )}
      </Reviewed>
    </main>
  );
}

// The ticket read again a few times after an act, while the worker takes up what it queued:
// until a field event's reconciliation is newer than it was when the act was made (or, arriving
// from an act on another ticket, than at the first read here), or the tries run out.
function useWorkedAgain(
  read: ReturnType<typeof useRead<typeof readTicketEndpoint>>[0],
  reload: () => void,
  arrivedQueued: boolean,
) {
  const waiting = useRef<{ since: string | null; tries: number } | null>(
    arrivedQueued ? { since: null, tries: 15 } : null,
  );
  const latest = (answer: TicketAnswer): string =>
    answer.fieldEvents
      .map((event) => event.reconciledAt ?? '')
      .sort()
      .at(-1) ?? '';
  useEffect(() => {
    const wait = waiting.current;
    if (wait === null || read.kind === 'loading') return;
    if (read.kind === 'answered') {
      if (wait.since === null) wait.since = latest(read.answer);
      else if (latest(read.answer) > wait.since) {
        waiting.current = null;
        return;
      }
    }
    if (wait.tries <= 0) {
      waiting.current = null;
      return;
    }
    wait.tries -= 1;
    const timer = window.setTimeout(reload, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [read, reload]);
  return () => {
    waiting.current = {
      since: read.kind === 'answered' ? latest(read.answer) : null,
      tries: 15,
    };
    reload();
  };
}

function TicketOf({
  projectId,
  workflow,
  ticketNumber,
}: {
  readonly projectId: string;
  readonly workflow: WorkflowName;
  readonly ticketNumber: string;
}) {
  const said = words.review.ticket;
  const { session } = useSigned();
  const ids = { projectId, workflow, ticketNumber };
  const [read, reload] = useRead(readTicketEndpoint, { params: ids });
  const [reloaded, setReloaded] = useState(0);
  const [told, tell] = useTold();
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const { query } = useWhere();
  const workedAgain = useWorkedAgain(
    read,
    () => {
      reload();
      setReloaded((count) => count + 1);
    },
    query.get('queued') === '1',
  );
  const done = (written: SetupWritten) => {
    setFailed(null);
    tell(written);
    workedAgain();
  };
  const title = say(said.title, {
    workflow: words.review.workflows[workflow],
    number: ticketNumber,
  });
  return (
    <>
      <ScreenTitle>{title}</ScreenTitle>
      <p>
        <Link className="link" href={`/projects/${projectId}/review?workflow=${workflow}`}>
          {said.backToQueue}
        </Link>
      </p>
      {told}
      {failed === null ? null : <Trouble reply={failed} />}
      <Shown read={read}>
        {(answer) => (
          <TicketWhole
            answer={answer}
            reloaded={reloaded}
            mayCorrect={holds(session, 'CORRECT')}
            mayRenumber={holds(session, 'RENUMBER')}
            mayVoid={holds(session, 'VOID')}
            mayAccept={holds(session, 'ACCEPT_FLAG')}
            onDone={done}
            onFailed={setFailed}
            onMoved={(to) => {
              navigate(`${ticketHref(projectId, workflow, to)}?queued=1`);
            }}
          />
        )}
      </Shown>
    </>
  );
}

function TicketWhole({
  answer,
  reloaded,
  mayCorrect,
  mayRenumber,
  mayVoid,
  mayAccept,
  onDone,
  onFailed,
  onMoved,
}: {
  readonly answer: TicketAnswer;
  readonly reloaded: number;
  readonly mayCorrect: boolean;
  readonly mayRenumber: boolean;
  readonly mayVoid: boolean;
  readonly mayAccept: boolean;
  readonly onDone: (written: SetupWritten) => void;
  readonly onFailed: (reply: NotAnswered) => void;
  // A field event renumbered away: the page follows it to its ticket.
  readonly onMoved: (ticketNumber: string) => void;
}) {
  const api = useApi();
  const { names, clock, project } = useReviewing();
  const said = words.review.ticket;
  const [open, setOpen] = useState<Open | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const closed = () => {
    setOpen(null);
  };
  const lockInForce = answer.locks.find((lock) => lock.unlockedAt === null) ?? null;
  const locked = lockInForce !== null;
  // Voided by a person (their void stands until it is lifted) or by a rule's Void ticket (the
  // worker's status): either way it is unvoided, not voided again.
  const voidInForce = answer.voids.find((each) => each.liftedAt === null) ?? null;
  const isVoid = voidInForce !== null || answer.statuses.includes('VOID');
  const ticket = { workflow: answer.workflow, ticketNumber: answer.ticketNumber };
  const noteField: FieldSpec = {
    kind: 'text',
    key: 'note',
    label: words.review.note,
    longest: 500,
  };
  const noted = (values: Values): { note?: string } => {
    const note = text(values, 'note');
    return note === '' ? {} : { note };
  };
  const sent = async (
    reply: Promise<{ kind: 'answered'; answer: SetupWritten } | NotAnswered>,
  ): Promise<NotAnswered | null> => {
    const answered = await reply;
    if (answered.kind !== 'answered') return answered;
    onDone(answered.answer);
    return null;
  };
  const standing = (flag: FlagRecord) =>
    flag.acceptances.find((acceptance) => acceptance.withdrawnAt === null) ?? null;

  return (
    <>
      <dl className="facts">
        <div className="fact">
          <dt>{said.status}</dt>
          <dd>{answer.statuses.map((status) => words.review.statuses[status]).join(', ')}</dd>
        </div>
        <div className="fact">
          <dt>{said.qc}</dt>
          <dd>
            {answer.qcMark === null
              ? words.review.qc.QC_REVIEW
              : words.review.qc[answer.qcMark.status]}
          </dd>
        </div>
        <div className="fact">
          <dt>{said.lock}</dt>
          <dd>
            {lockInForce === null
              ? said.notLocked
              : say(said.lockedBy, {
                  person: personOf(names, lockInForce.lockedById),
                  at: at(clock, lockInForce.lockedAt),
                })}
          </dd>
        </div>
      </dl>
      {locked ? (
        <Banner tone="notice">
          <p>{said.lockedNotice}</p>
        </Banner>
      ) : null}
      {project.closedAt === null ? null : (
        <Banner tone="notice">
          <p>{said.closedNotice}</p>
        </Banner>
      )}
      {voidInForce === null ? null : (
        <Banner tone="notice">
          <p>
            {say(said.voidedBy, {
              person: personOf(names, voidInForce.voidedById),
              reason: nameOf(names.reasons, voidInForce.reasonId),
              at: at(clock, voidInForce.voidedAt),
            })}
            {voidInForce.note === null ? '' : ` “${voidInForce.note}”`}
          </p>
        </Banner>
      )}

      <div className="row-actions">
        {mayVoid && !locked && !isVoid ? (
          <Button
            onPress={() => {
              setOpen({ kind: 'void' });
            }}
          >
            {said.void}
          </Button>
        ) : null}
        {mayVoid && !locked && isVoid ? (
          <Button
            onPress={() => {
              setOpen({ kind: 'unvoid' });
            }}
          >
            {said.unvoid}
          </Button>
        ) : null}
        {mayCorrect && !locked ? (
          <Button
            onPress={() => {
              setOpen({ kind: 'reprocess' });
            }}
          >
            {said.reprocess}
          </Button>
        ) : null}
        {mayCorrect && !locked ? (
          <Button
            onPress={() => {
              setOpen({ kind: 'make' });
            }}
          >
            {said.makeHere}
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="ticket-flags">
        <h2 id="ticket-flags">{said.flags}</h2>
        {answer.flags.length === 0 ? (
          <p className="quiet">{said.noFlags}</p>
        ) : (
          <ul className="flag-list">
            {answer.flags.map((flag) => {
              const acceptance = standing(flag);
              return (
                <li key={flag.id} className="flag">
                  <p>
                    <strong>{flag.message}</strong>{' '}
                    {flag.clearedAt === null
                      ? acceptance === null
                        ? said.flagOpen
                        : said.flagAccepted
                      : said.flagCleared}
                    {' · '}
                    {said.billing[flag.billing]}
                  </p>
                  {flag.acceptances.map((each) => (
                    <p key={each.id} className="quiet">
                      {say(said.acceptance, {
                        person: personOf(names, each.acceptedById),
                        reason: nameOf(names.reasons, each.reasonId),
                        at: at(clock, each.acceptedAt),
                      })}
                      {each.note === null ? '' : ` “${each.note}”`}
                      {each.withdrawnAt === null
                        ? ''
                        : ` ${say(said.withdrawn, {
                            person: personOf(names, each.withdrawnById),
                            at: at(clock, each.withdrawnAt),
                          })}`}
                    </p>
                  ))}
                  {mayAccept && !locked && flag.clearedAt === null ? (
                    acceptance === null ? (
                      <Button
                        onPress={() => {
                          setOpen({ kind: 'accept', flag });
                        }}
                      >
                        {say(words.common.of, { what: said.accept, name: flag.message })}
                      </Button>
                    ) : (
                      <Button
                        onPress={() => {
                          setOpen({ kind: 'withdraw', acceptanceId: acceptance.id });
                        }}
                      >
                        {say(words.common.of, { what: said.withdraw, name: flag.message })}
                      </Button>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="ticket-events">
        <h2 id="ticket-events">{said.fieldEvents}</h2>
        <div className="event-cards">
          {answer.fieldEvents.map((event) => (
            <FieldEventCard
              key={event.id}
              event={event}
              reloaded={reloaded}
              allowed={{ correct: mayCorrect && !locked, renumber: mayRenumber && !locked }}
              onDone={onDone}
              onFailed={onFailed}
              onRenumbered={(to) => {
                if (to !== answer.ticketNumber) onMoved(to);
              }}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="ticket-concluded">
        <h2 id="ticket-concluded">{said.concluded}</h2>
        {answer.completed === null ? (
          <p className="quiet">
            {answer.workflow === 'UNIT_RATE' ? said.unitRateConcluded : said.noCompleted}
          </p>
        ) : (
          <>
            <dl className="facts">
              <div className="fact">
                <dt>{said.quantityFrom}</dt>
                <dd>{said.quantitySources[answer.completed.quantitySource]}</dd>
              </div>
              {answer.completed.capacityCy === null ? null : (
                <div className="fact">
                  <dt>{said.capacity}</dt>
                  <dd>{say(said.cubicYards, { amount: number(answer.completed.capacityCy) })}</dd>
                </div>
              )}
              {answer.completed.loadCall === null ? null : (
                <div className="fact">
                  <dt>{said.loadCall}</dt>
                  <dd>{`${String(answer.completed.loadCall)}%`}</dd>
                </div>
              )}
              {answer.completed.volumeCy === null ? null : (
                <div className="fact">
                  <dt>{said.volume}</dt>
                  <dd>{say(said.cubicYards, { amount: answer.completed.volumeCy })}</dd>
                </div>
              )}
              {answer.completed.weightTons === null ? null : (
                <div className="fact">
                  <dt>{said.weight}</dt>
                  <dd>{say(said.tons, { amount: answer.completed.weightTons })}</dd>
                </div>
              )}
            </dl>
            <Table
              caption={said.collections}
              rows={answer.completed.collections}
              keyOf={(row) => row.id}
              columns={[
                {
                  label: said.property,
                  names: true,
                  cell: (row) => (row.splitSuffix === '' ? said.whole : `-${row.splitSuffix}`),
                },
                { label: said.share, numeric: true, cell: (row) => row.shareFraction },
                {
                  label: said.volume,
                  numeric: true,
                  cell: (row) => row.volumeCy ?? row.weightTons ?? words.common.none,
                },
                {
                  label: said.mileage,
                  numeric: true,
                  cell: (row) =>
                    row.mileage === null
                      ? words.common.none
                      : `${row.mileage}${row.mileageSource === null ? '' : ` (${said.mileageSources[row.mileageSource]})`}`,
                },
              ]}
            />
          </>
        )}
        <Table
          caption={said.lines}
          rows={answer.lines}
          keyOf={(line) => line.id}
          columns={[
            {
              label: said.line,
              names: true,
              cell: (line) =>
                `${line.splitSuffix === '' ? '' : `-${line.splitSuffix} `}#${String(line.slot)}`,
            },
            { label: said.payItem, cell: (line) => payItemOf(names, line.payItemId) },
            { label: said.prime, cell: (line) => nameOf(names.contractors, line.primeId) },
            {
              label: said.quantity,
              numeric: true,
              cell: (line) => `${line.quantity} ${words.review.units[line.unit]}`,
            },
            { label: said.rate, numeric: true, cell: (line) => money(line.rate) },
            { label: said.amount, numeric: true, cell: (line) => money(line.amount) },
            { label: said.rule, cell: (line) => nameOf(names.rules, line.ruleId) },
          ]}
        />
      </section>

      <section aria-labelledby="ticket-history">
        <h2 id="ticket-history">{said.history}</h2>
        {showHistory ? (
          <>
            <AuditEntries
              caption={said.history}
              served={readTicketHistoryEndpoint}
              asking={{
                params: {
                  projectId: answer.projectId,
                  workflow: answer.workflow,
                  ticketNumber: answer.ticketNumber,
                },
                query: { limit: '50' },
              }}
              reloaded={reloaded}
            />
            <Decisions
              served={readTicketDecisionsEndpoint}
              asking={{
                params: {
                  projectId: answer.projectId,
                  workflow: answer.workflow,
                  ticketNumber: answer.ticketNumber,
                },
                query: { limit: '20' },
              }}
              reloaded={reloaded}
            />
          </>
        ) : (
          <Button
            onPress={() => {
              setShowHistory(true);
            }}
          >
            {said.showHistory}
          </Button>
        )}
      </section>

      {open?.kind === 'void' ? (
        <FormDialog
          title={said.void}
          fields={[
            {
              kind: 'pick',
              key: 'reasonId',
              label: words.review.reason,
              required: true,
              options: reasonsFor(names, 'VOID'),
            },
            noteField,
          ]}
          initial={{}}
          saveLabel={said.void}
          save={(values) =>
            sent(
              api.ask(voidTicketEndpoint, {
                params: { projectId: answer.projectId },
                body: { ...ticket, reasonId: picked(values, 'reasonId') ?? '', ...noted(values) },
              }),
            )
          }
          onClose={closed}
        >
          <p>{said.voidAbout}</p>
        </FormDialog>
      ) : null}
      {open?.kind === 'unvoid' ? (
        <FormDialog
          title={said.unvoid}
          fields={[noteField]}
          initial={{}}
          saveLabel={said.unvoid}
          save={(values) =>
            sent(
              api.ask(unvoidTicketEndpoint, {
                params: { projectId: answer.projectId },
                body: { ...ticket, ...noted(values) },
              }),
            )
          }
          onClose={closed}
        />
      ) : null}
      {open?.kind === 'reprocess' ? (
        <FormDialog
          title={said.reprocess}
          fields={[noteField]}
          initial={{}}
          saveLabel={said.reprocess}
          save={(values) =>
            sent(
              api.ask(reprocessTicketsEndpoint, {
                params: { projectId: answer.projectId },
                body: { tickets: [ticket], ...noted(values) },
              }),
            )
          }
          onClose={closed}
        >
          <p>{said.reprocessAbout}</p>
        </FormDialog>
      ) : null}
      {open?.kind === 'accept' ? (
        <FormDialog
          title={said.accept}
          fields={[
            {
              kind: 'pick',
              key: 'reasonId',
              label: words.review.reason,
              required: true,
              options: reasonsFor(names, 'ACCEPT_FLAG'),
            },
            noteField,
          ]}
          initial={{}}
          saveLabel={said.accept}
          save={(values) =>
            sent(
              api.ask(acceptFlagEndpoint, {
                params: { flagId: open.flag.id },
                body: { reasonId: picked(values, 'reasonId') ?? '', ...noted(values) },
              }),
            )
          }
          onClose={closed}
        >
          <p>{open.flag.message}</p>
        </FormDialog>
      ) : null}
      {open?.kind === 'withdraw' ? (
        <FormDialog
          title={said.withdraw}
          fields={[{ ...noteField, required: true }]}
          initial={{}}
          saveLabel={said.withdraw}
          save={(values) =>
            sent(
              api.ask(withdrawAcceptanceEndpoint, {
                params: { flagAcceptanceId: open.acceptanceId },
                body: { note: text(values, 'note') },
              }),
            )
          }
          onClose={closed}
        />
      ) : null}
      {open?.kind === 'make' ? (
        <NewFieldEvent
          projectId={answer.projectId}
          workflow={answer.workflow}
          number={answer.ticketNumber}
          onClose={closed}
          onMade={(made) => {
            closed();
            onDone({ warnings: [] });
            if (made.ticketNumber !== answer.ticketNumber) {
              navigate(ticketHref(answer.projectId, made.workflow, made.ticketNumber));
            }
          }}
        />
      ) : null}
    </>
  );
}
