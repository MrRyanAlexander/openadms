// The time clock (ADR-063, 241, 598; BUILD.md, settled 1): each worker's day on their assignment,
// their entries and the activity their clock-out carried, as the phone sent them; what the hours
// come to, as the API reads them (the day ends before midnight in the project's time zone; what is
// worked past it counts on the next day); and the day approved by a manager (never their own) or
// unlocked with a note. Hours by day adds each day's own and what fell on it from the day before.
// Never a rate or a pay, and never crew time's hours.
import {
  approveDayEndpoint,
  listHoursEndpoint,
  readProjectEndpoint,
  unlockDayEndpoint,
  type HoursAnswer,
} from '@open-adms/contracts';
import { ProjectClock } from '@open-adms/domain';
import { Banner, Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { DateEntry } from '../look/fields.tsx';
import { FormDialog, text } from '../look/form-dialog.tsx';
import { Table } from '../look/paged-table.tsx';
import { Shown, Trouble, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { yesNo } from '../setup/common.tsx';
import { day, say, when, words } from '../words.ts';

type Day = HoursAnswer['days'][number];

// Whole minutes as hours and minutes: 12 h 20 min.
const shown = (minutes: number): string =>
  say(words.hours.minutes, { hours: Math.floor(minutes / 60), minutes: minutes % 60 });

export function Hours({ projectId }: { readonly projectId: string }) {
  const [project] = useRead(readProjectEndpoint, { params: { projectId } });
  return (
    <main data-screen="hours" className="page" id="content">
      <Shown read={project}>
        {(answer) => <HoursOf projectId={projectId} timeZone={answer.project.timeZone} />}
      </Shown>
    </main>
  );
}

function HoursOf({
  projectId,
  timeZone,
}: {
  readonly projectId: string;
  readonly timeZone: string;
}) {
  const api = useApi();
  const said = words.hours;
  const { session } = useSigned();
  const mayApprove = holds(session, 'APPROVE_HOURS');
  const clock = new ProjectClock(timeZone);
  const [to, setTo] = useState(() => clock.day(new Date()));
  const [from, setFrom] = useState(() => clock.day(new Date(Date.now() - 6 * 86_400_000)));
  const [read, reload] = useRead(listHoursEndpoint, {
    params: { projectId },
    query: { from, to, limit: '200' },
  });
  const [unlocking, setUnlocking] = useState<Day | null>(null);
  const [told, setTold] = useState<string | null>(null);
  const [failed, setFailed] = useState<NotAnswered | null>(null);

  const approve = async (one: Day) => {
    setFailed(null);
    const reply = await api.ask(approveDayEndpoint, { params: { assignmentId: one.assignmentId } });
    if (reply.kind === 'answered') {
      setTold(words.common.saved);
      reload();
    } else setFailed(reply);
  };

  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told === null ? null : (
        <Banner tone="good" announced>
          <p>{told}</p>
        </Banner>
      )}
      {failed === null ? null : <Trouble reply={failed} />}
      <div className="page-tools">
        <DateEntry
          label={said.from}
          value={from}
          onChange={(value) => {
            if (value !== '') setFrom(value);
          }}
        />
        <DateEntry
          label={said.to}
          value={to}
          onChange={(value) => {
            if (value !== '') setTo(value);
          }}
        />
      </div>
      <Shown read={read}>
        {(answer) =>
          answer.days.length === 0 ? (
            <p>{said.noDays}</p>
          ) : (
            <>
              <Totals days={answer.days} />
              {answer.days.map((one) => (
                <section
                  key={one.assignmentId}
                  className="panel"
                  aria-labelledby={`day-${one.assignmentId}`}
                >
                  <h2 id={`day-${one.assignmentId}`}>
                    {say(words.common.of, { what: one.person.name, name: day(one.workDate) })}
                  </h2>
                  {one.withdrawn ? <p>{said.withdrawn}</p> : null}
                  <dl className="facts">
                    <dt>{said.worked}</dt>
                    <dd>{shown(one.hours.workedMinutes)}</dd>
                    <dt>{said.onBreak}</dt>
                    <dd>{shown(one.hours.breakMinutes)}</dd>
                    <dt>{said.otherDays}</dt>
                    <dd>
                      {one.hours.otherDays.length === 0
                        ? words.common.none
                        : one.hours.otherDays
                            .map((other) =>
                              say(words.common.of, {
                                what: day(other.workDate),
                                name: shown(other.workedMinutes),
                              }),
                            )
                            .join('; ')}
                    </dd>
                    <dt>{said.stillIn}</dt>
                    <dd>{yesNo(one.hours.stillClockedIn)}</dd>
                    <dt>{said.unmatched}</dt>
                    <dd>{String(one.hours.unmatchedEntries)}</dd>
                    <dt>{said.approval}</dt>
                    <dd>
                      {one.approval === null
                        ? said.notApproved
                        : say(said.approved, {
                            name: one.approval.approvedBy.name,
                            when: when(one.approval.approvedAt, timeZone),
                          })}
                    </dd>
                  </dl>
                  {one.receivedAfterApproval ? (
                    <Banner tone="notice">
                      <p>{said.receivedAfter}</p>
                    </Banner>
                  ) : null}
                  <Table
                    caption={say(words.common.of, { what: said.entries, name: one.person.name })}
                    rows={one.entries}
                    keyOf={(entry) => entry.id}
                    columns={[
                      {
                        label: said.entries,
                        names: true,
                        cell: (entry) => said.entryKinds[entry.kind],
                      },
                      { label: said.day, cell: (entry) => when(entry.at, timeZone) },
                      { label: words.dispatch.phone, cell: (entry) => entry.phone.name },
                    ]}
                  />
                  {one.activityLines.length === 0 ? null : (
                    <Table
                      caption={say(words.common.of, { what: said.lines, name: one.person.name })}
                      rows={one.activityLines}
                      keyOf={(line) => line.id}
                      columns={[
                        {
                          label: said.lines,
                          names: true,
                          cell: (line) =>
                            say(said.line, {
                              from: clock.time(new Date(line.startedAt)),
                              to: clock.time(new Date(line.endedAt)),
                            }),
                        },
                        {
                          label: said.activity,
                          cell: (line) =>
                            line.activity?.name ??
                            (line.fieldEvent === null
                              ? ''
                              : `${line.fieldEvent.ticketNumber}${line.fieldEvent.splitSuffix}`),
                        },
                        { label: words.common.notes, cell: (line) => line.note ?? '' },
                      ]}
                    />
                  )}
                  {mayApprove ? (
                    <div className="form-actions">
                      {one.approval === null ? (
                        <Button main onPress={() => void approve(one)}>
                          {say(said.approve, { name: one.person.name })}
                        </Button>
                      ) : (
                        <Button
                          onPress={() => {
                            setUnlocking(one);
                          }}
                        >
                          {say(said.unlock, { name: one.person.name })}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </section>
              ))}
            </>
          )
        }
      </Shown>
      {unlocking === null ? null : (
        <FormDialog
          title={say(said.unlock, { name: unlocking.person.name })}
          fields={[
            { kind: 'text', key: 'note', label: said.unlockNote, required: true, longest: 500 },
          ]}
          initial={{}}
          save={async (values) => {
            const reply = await api.ask(unlockDayEndpoint, {
              params: { assignmentId: unlocking.assignmentId },
              body: { note: text(values, 'note') },
            });
            if (reply.kind !== 'answered') return reply;
            setTold(words.common.saved);
            reload();
            return null;
          }}
          onClose={() => {
            setUnlocking(null);
          }}
        />
      )}
    </>
  );
}

// Each worker's hours by the day they count on: each assignment's own day, and what of it fell on
// another day (past midnight, the next), added to that day.
function Totals({ days }: { readonly days: readonly Day[] }) {
  const said = words.hours;
  const totals = new Map<
    string,
    { readonly person: string; readonly workDate: string; minutes: number }
  >();
  const add = (
    person: { readonly id: string; readonly name: string },
    workDate: string,
    minutes: number,
  ) => {
    const key = `${person.id} ${workDate}`;
    const held = totals.get(key) ?? { person: person.name, workDate, minutes: 0 };
    held.minutes += minutes;
    totals.set(key, held);
  };
  for (const one of days) {
    add(one.person, one.workDate, one.hours.workedMinutes);
    for (const other of one.hours.otherDays) add(one.person, other.workDate, other.workedMinutes);
  }
  const rows = [...totals.entries()]
    .map(([key, total]) => ({ key, ...total }))
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.person.localeCompare(b.person));
  return (
    <Table
      caption={said.totals}
      rows={rows}
      keyOf={(row) => row.key}
      columns={[
        { label: said.person, names: true, cell: (row) => row.person },
        { label: said.day, cell: (row) => day(row.workDate) },
        { label: said.totalWorked, numeric: true, cell: (row) => shown(row.minutes) },
      ]}
    />
  );
}
