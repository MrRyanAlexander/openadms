// The one review queue (spec/parts/08-review-and-corrections.md, "One review queue"; ADR-228):
// one workflow's tickets waiting for a person, by number, each with its open flags in the
// worker's own words, a pending ticket listed as pending and never flagged for waiting; the
// project's open flags counted by cause, any one cause picked to see only its tickets; what waits
// beside it (quarantined records, held records, jobs set aside) one press away. The workflow and
// the cause are in the address, so Back and a link copied keep a reviewer's place. A ticket is
// opened by its number from here, or found by its number. A ticket made in the back office
// because a phone failed starts here too.
import { reviewQueueEndpoint, type ReviewQueueAnswer } from '@open-adms/contracts';
import { flagCodes, workflows, type WorkflowName } from '@open-adms/domain';
import { Button, ScreenTitle, TextEntry } from '@open-adms/look';
import { useState } from 'react';
import { Link } from 'react-aria-components';

import { ChoiceField, SelectField } from '../look/fields.tsx';
import { PagedTable } from '../look/paged-table.tsx';
import { useRead } from '../reading.tsx';
import { navigate, useWhere } from '../router.tsx';
import { holds, useSigned } from '../session.tsx';
import { counted, say, words } from '../words.ts';
import { NewFieldEvent } from './made-here.tsx';
import { Reviewed } from './reviewing.tsx';

type Row = ReviewQueueAnswer['tickets'][number];
type Cause = (typeof flagCodes)[number];

export const ticketHref = (projectId: string, workflow: WorkflowName, ticketNumber: string) =>
  `/projects/${projectId}/tickets/${workflow}/${encodeURIComponent(ticketNumber)}`;

const workflowOf = (said: string | null): WorkflowName =>
  workflows.find((workflow) => workflow === said) ?? 'LOAD';
const causeOf = (said: string | null): Cause | null =>
  flagCodes.find((code) => code === said) ?? null;

export function ReviewQueue({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="review-queue" className="page" id="content">
      <Reviewed projectId={projectId}>
        <QueueOf projectId={projectId} />
      </Reviewed>
    </main>
  );
}

function QueueOf({ projectId }: { readonly projectId: string }) {
  const said = words.review.queue;
  const { session } = useSigned();
  const { query } = useWhere();
  const workflow = workflowOf(query.get('workflow'));
  const cause = causeOf(query.get('cause'));
  const [making, setMaking] = useState(false);
  const [reloaded, setReloaded] = useState(0);
  // The causes counted, read with the first page of the workflow as it stands.
  const [counts] = useRead(reviewQueueEndpoint, {
    params: { projectId },
    query: { workflow, limit: '1' },
  });
  const moved = (next: { readonly workflow?: WorkflowName; readonly cause?: Cause | null }) => {
    const to = new URLSearchParams();
    to.set('workflow', next.workflow ?? workflow);
    const nextCause = next.cause === undefined ? cause : next.cause;
    if (nextCause !== null) to.set('cause', nextCause);
    navigate(`/projects/${projectId}/review?${to.toString()}`, { replace: true });
  };
  const causes = counts.kind === 'answered' ? counts.answer.causes : [];
  const waitingOnJobs = counts.kind === 'answered' ? counts.answer.waitingOnSetAsideJobs : 0;

  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <div className="page-tools">
        <ChoiceField
          label={said.workflow}
          options={workflows.map((each) => ({ id: each, label: words.review.workflows[each] }))}
          value={workflow}
          onChange={(each) => {
            moved({ workflow: workflowOf(each), cause: null });
          }}
        />
        <SelectField
          label={said.cause}
          placeholder={said.everyCause}
          options={[
            { id: '', label: said.everyCause },
            ...causes.map((each) => ({
              id: each.code,
              label: say(said.causeCounted, {
                cause: words.review.causes[each.code],
                flags: each.flags,
                tickets: each.tickets,
              }),
            })),
          ]}
          value={cause ?? ''}
          onChange={(each) => {
            moved({ cause: causeOf(each) });
          }}
        />
      </div>
      <nav className="row-actions" aria-label={said.waitingBeside}>
        <Link className="link" href={`/projects/${projectId}/quarantine`}>
          {said.quarantine}
        </Link>
        <Link className="link" href={`/projects/${projectId}/held`}>
          {said.held}
        </Link>
        <Link className="link" href={`/projects/${projectId}/set-aside-jobs`}>
          {waitingOnJobs === 0 ? said.jobs : counted(said.jobsWaiting, waitingOnJobs)}
        </Link>
      </nav>
      <FindTicket projectId={projectId} workflow={workflow} />
      {holds(session, 'CORRECT') ? (
        <div className="page-tools">
          <Button
            onPress={() => {
              setMaking(true);
            }}
          >
            {said.newFieldEvent}
          </Button>
        </div>
      ) : null}
      <PagedTable
        caption={say(said.caption, { workflow: words.review.workflows[workflow] })}
        served={reviewQueueEndpoint}
        asking={{
          params: { projectId },
          query: { workflow, limit: '50', ...(cause === null ? {} : { cause }) },
        }}
        rowsOf={(answer) => answer.tickets}
        nextOf={(answer) => answer.next}
        keyOf={(row: Row) => row.ticketNumber}
        reloaded={reloaded}
        columns={[
          {
            label: said.ticket,
            names: true,
            cell: (row) => (
              <Link className="link" href={ticketHref(projectId, row.workflow, row.ticketNumber)}>
                {row.ticketNumber}
              </Link>
            ),
          },
          {
            label: said.status,
            cell: (row) => row.statuses.map((status) => words.review.statuses[status]).join(', '),
          },
          {
            label: said.flags,
            cell: (row) =>
              row.flags.length === 0 && !row.waitingOnSetAsideJob ? (
                words.common.none
              ) : (
                <ul className="plain-list">
                  {row.flags.map((flag) => (
                    <li key={flag.id}>{flag.message}</li>
                  ))}
                  {row.waitingOnSetAsideJob ? <li>{said.waitingOnJob}</li> : null}
                </ul>
              ),
          },
        ]}
      />
      {making ? (
        <NewFieldEvent
          projectId={projectId}
          workflow={workflow}
          onClose={() => {
            setMaking(false);
          }}
          onMade={(made) => {
            setReloaded((count) => count + 1);
            navigate(ticketHref(projectId, made.workflow, made.ticketNumber));
          }}
        />
      ) : null}
    </>
  );
}

// A ticket found by its number, in the workflow picked: its page, whatever its status.
function FindTicket({
  projectId,
  workflow,
}: {
  readonly projectId: string;
  readonly workflow: WorkflowName;
}) {
  const said = words.review.queue;
  const [number, setNumber] = useState('');
  return (
    <form
      className="page-tools"
      role="search"
      aria-label={said.find}
      onSubmit={(event) => {
        event.preventDefault();
        const wanted = number.trim();
        if (wanted !== '') navigate(ticketHref(projectId, workflow, wanted));
      }}
    >
      <TextEntry label={said.findNumber} value={number} onChange={setNumber} longest={40} />
      <Button type="submit">{said.open}</Button>
    </form>
  );
}
