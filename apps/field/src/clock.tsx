// The time clock's screens (adms-field-app §4A.0 (13); BACKLOG 3.7.2, REQ-310, C177; AC-02-50…52;
// ADR-241, 598, 601), where the project has the time clock on and the phone holds the worker's
// assignment: **Time** in the bottom menu says where they stand and offers only what may come
// next (a clock-in; a break or a clock-out; the break's end or a clock-out), each entered now by
// hand; **the clock-out** shows the day's activity pre-filled a line an hour from their field
// events, each line's times and note theirs to change or the line to take off, a line of what the
// app can't know added from the firm's list, then approved as they clock out. **The two nudges**
// (ADR-241 (2)): "You’re not clocked in. Clock in now?" on starting a field event, and "Clock
// out?" on signing out while clocked in; neither stops the work. Every rule is the domain's
// (`ClockDay`) or the phone's clock's (`PhoneClock`); these screens only show and ask.
import { ClockDay, ProjectClock, type ClockEntryKind } from '@open-adms/domain';
import { Fragment, useState, type ReactNode } from 'react';

import {
  Banner,
  Button,
  ListPicker,
  ListRow,
  ScreenActions,
  ScreenTitle,
  StatusStrip,
  TextEntry,
  TimeEntry,
  type Standing,
} from './look/index.ts';
import type { ApprovedLine, ClockOf, PhoneClock, WorkDone } from './phone/clock.ts';
import { counted, say, timeOfDay, words } from './words.ts';

const said = words.clock;

// Time, in the bottom menu: where the worker stands, the day's entries on the assignment, and
// what may come next. A clock-out goes on to the day's activity.
export function TimeClock({
  clock,
  of,
  standing,
  onEntered,
  onClockOut,
  after,
}: {
  readonly clock: PhoneClock;
  readonly of: ClockOf;
  readonly standing: Standing;
  readonly onEntered: () => void;
  readonly onClockOut: () => void;
  readonly after?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  const timeZone = of.assignment.project.timeZone;
  const entries = clock.entriesOf(of);
  const enter = async (kind: Exclude<ClockEntryKind, 'OUT'>) => {
    setBusy(true);
    setProblem(null);
    const notice = await clock.enter(of, kind);
    setBusy(false);
    setProblem(notice?.message ?? null);
    setKept(notice === undefined);
    onEntered();
  };
  return (
    <main data-screen="time" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <ScreenTitle>{said.title}</ScreenTitle>
        <p role="status">{said.standing[clock.standing(of)]}</p>
        <p className="quiet">{said.about}</p>
        <section aria-labelledby="clock-entries">
          <h2 id="clock-entries">{said.entries.title}</h2>
          {entries.length === 0 ? (
            <p>{said.entries.none}</p>
          ) : (
            <dl className="facts">
              {entries.map((entry) => (
                <Fragment key={entry.id}>
                  <dt>{said.entries[entry.kind]}</dt>
                  <dd>{timeOfDay(new Date(entry.at), timeZone)}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </section>
        {kept ? <p>{said.kept}</p> : null}
        {problem === null ? null : (
          <Banner tone="problem" announced>
            <p>{problem}</p>
          </Banner>
        )}
      </div>
      <ScreenActions>
        {clock.next(of).map((kind, place) => (
          <Button
            key={kind}
            main={place === 0}
            wide
            busy={busy}
            onPress={() => {
              if (kind === 'OUT') onClockOut();
              else void enter(kind);
            }}
          >
            {said.enter[kind]}
          </Button>
        ))}
      </ScreenActions>
      {after}
    </main>
  );
}

// "You’re not clocked in. Clock in now?", on starting a field event: clocked in now, or not, the
// work goes on.
export function ClockInNudge({
  clock,
  of,
  standing,
  onGoOn,
  after,
}: {
  readonly clock: PhoneClock;
  readonly of: ClockOf;
  readonly standing: Standing;
  // The work started, whether or not the worker clocked in.
  readonly onGoOn: () => void;
  readonly after?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const said = words.clock.nudgeIn;
  return (
    <main data-screen="clock-in-nudge" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <ScreenTitle>{said.title}</ScreenTitle>
        <p>{said.about}</p>
        {problem === null ? null : (
          <Banner tone="problem" announced>
            <p>{problem}</p>
          </Banner>
        )}
      </div>
      <ScreenActions>
        <Button
          main
          wide
          busy={busy}
          onPress={() => {
            setBusy(true);
            void clock.enter(of, 'IN').then((notice) => {
              setBusy(false);
              if (notice === undefined) onGoOn();
              else setProblem(notice.message);
            });
          }}
        >
          {said.yes}
        </Button>
        <Button wide busy={busy} onPress={onGoOn}>
          {said.no}
        </Button>
      </ScreenActions>
      {after}
    </main>
  );
}

// "Clock out?", on signing out while clocked in or on a break: clock out first, sign out still
// clocked in, or go back.
export function ClockOutNudge({
  standing,
  onClockOut,
  onSignOut,
  onBack,
  after,
}: {
  readonly standing: Standing;
  readonly onClockOut: () => void;
  readonly onSignOut: () => void;
  readonly onBack: () => void;
  readonly after?: ReactNode;
}) {
  const said = words.clock.nudgeOut;
  return (
    <main data-screen="clock-out-nudge" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <ScreenTitle>{said.title}</ScreenTitle>
        <p>{said.about}</p>
      </div>
      <ScreenActions>
        <Button main wide onPress={onClockOut}>
          {said.yes}
        </Button>
        <Button wide onPress={onSignOut}>
          {said.no}
        </Button>
        <Button wide onPress={onBack}>
          {said.back}
        </Button>
      </ScreenActions>
      {after}
    </main>
  );
}

// A line of the day as the worker has it now: its times as typed ("08:20") on its day, the field
// event it was pre-filled from (and every field event of its hour) or the activity picked, and
// their note.
interface DraftLine {
  readonly key: string;
  readonly day: string;
  readonly from: string;
  readonly to: string;
  readonly fieldEventId: string | null;
  readonly activityId: string | null;
  readonly note: string;
  readonly work: readonly WorkDone[];
}

// What a pre-filled line's field events are, in words: the first by its kind and number, and how
// many more.
function workWords(work: readonly WorkDone[]): string {
  const [first] = work;
  if (first === undefined) return '';
  const { kind, ticketNumber, splitSuffix } = first.ticket;
  return counted(said.line.work, work.length - 1, {
    kind: words.capture.kinds[kind],
    number: splitSuffix === '' ? ticketNumber : `${ticketNumber}-${splitSuffix}`,
  });
}

// The clock-out: the day's activity, pre-filled, each line opened to change; a line added from
// the firm's list; approved as the worker clocks out. What they change is held here until they
// approve it.
export function ClockOut({
  clock,
  of,
  activities,
  standing,
  signsOut,
  onDone,
  onBack,
  after,
}: {
  readonly clock: PhoneClock;
  readonly of: ClockOf;
  // The firm's list of what the app can't know (travel, standby, training), as the lists hold it.
  readonly activities: readonly { readonly id: string; readonly name: string }[];
  readonly standing: Standing;
  // Whether the worker is signed out once clocked out (the sign-out's nudge).
  readonly signsOut: boolean;
  readonly onDone: () => void;
  readonly onBack: () => void;
  readonly after?: ReactNode;
}) {
  const { timeZone, name: project } = of.assignment.project;
  const projectClock = new ProjectClock(timeZone);
  const day = new ClockDay(of.assignment.workDate, timeZone);
  const [lines, setLines] = useState<readonly DraftLine[]>(() =>
    clock.prefilled(of).map((line) => ({
      key: line.fieldEventId,
      day: projectClock.day(line.startedAt),
      from: projectClock.time(line.startedAt),
      to: projectClock.time(line.endedAt),
      fieldEventId: line.fieldEventId,
      activityId: null,
      note: '',
      work: line.work,
    })),
  );
  const [editing, setEditing] = useState<DraftLine | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const titleId = 'clock-out-title';

  if (editing !== null) {
    return (
      <LineEditor
        line={editing === 'new' ? null : editing}
        activities={activities}
        day={day}
        workDate={of.assignment.workDate}
        standing={standing}
        onSave={(saved) => {
          setLines((now) =>
            now.some(({ key }) => key === saved.key)
              ? now.map((one) => (one.key === saved.key ? saved : one))
              : [...now, saved],
          );
          setEditing(null);
        }}
        onRemove={(key) => {
          setLines((now) => now.filter((one) => one.key !== key));
          setEditing(null);
        }}
        onBack={() => {
          setEditing(null);
        }}
        after={after}
      />
    );
  }

  const approve = async () => {
    const approved: ApprovedLine[] = [];
    for (const line of lines) {
      const typed = day.typedLine(line.from, line.to, line.day);
      if (typed.kind !== 'line') {
        setEditing(line);
        return;
      }
      approved.push({
        startedAt: typed.startedAt,
        endedAt: typed.endedAt,
        fieldEventId: line.fieldEventId,
        activityId: line.activityId,
        note: line.note.trim() === '' ? null : line.note,
        carries: line.work.map(({ id }) => id),
      });
    }
    setBusy(true);
    setProblem(null);
    const notice = await clock.clockedOut(of, approved);
    setBusy(false);
    if (notice === undefined) onDone();
    else setProblem(notice.message);
  };

  const activityName = (id: string | null) => activities.find((one) => one.id === id)?.name ?? '';
  const times = (line: DraftLine) => {
    const typed = day.typedLine(line.from, line.to, line.day);
    return typed.kind === 'line'
      ? say(said.out.line, {
          from: timeOfDay(typed.startedAt, timeZone),
          to: timeOfDay(typed.endedAt, timeZone),
        })
      : say(said.out.line, { from: line.from, to: line.to });
  };
  return (
    <main data-screen="clock-out" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <ScreenTitle id={titleId}>{said.out.title}</ScreenTitle>
        <p>{said.out.about}</p>
        <p className="quiet">{project}</p>
        {lines.length === 0 ? (
          <p>{said.out.none}</p>
        ) : (
          <ul className="list-rows" aria-labelledby={titleId}>
            {lines.map((line) => {
              const what =
                line.activityId === null ? workWords(line.work) : activityName(line.activityId);
              return (
                <li key={line.key}>
                  <ListRow
                    label={times(line)}
                    detail={line.note.trim() === '' ? what : `${what} · ${line.note.trim()}`}
                    onPress={() => {
                      setEditing(line);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {activities.length === 0 ? null : (
          <Button
            wide
            busy={busy}
            onPress={() => {
              setEditing('new');
            }}
          >
            {said.out.add}
          </Button>
        )}
        {signsOut ? <p>{said.out.signOutAfter}</p> : null}
        {problem === null ? null : (
          <Banner tone="problem" announced>
            <p>{problem}</p>
          </Banner>
        )}
      </div>
      <ScreenActions>
        <Button main wide busy={busy} onPress={() => void approve()}>
          {busy ? said.out.approving : said.out.approve}
        </Button>
        <Button wide busy={busy} onPress={onBack}>
          {said.out.back}
        </Button>
      </ScreenActions>
      {after}
    </main>
  );
}

// One line opened: its times and note, and for a line added, what it was from the firm's list.
// Saved only as a line the domain reads; taken off where it was one already.
function LineEditor({
  line,
  activities,
  day,
  workDate,
  standing,
  onSave,
  onRemove,
  onBack,
  after,
}: {
  readonly line: DraftLine | null;
  readonly activities: readonly { readonly id: string; readonly name: string }[];
  readonly day: ClockDay;
  readonly workDate: string;
  readonly standing: Standing;
  readonly onSave: (line: DraftLine) => void;
  readonly onRemove: (key: string) => void;
  readonly onBack: () => void;
  readonly after?: ReactNode;
}) {
  const said = words.clock.line;
  // The field event a pre-filled line names; none for a line of the firm's list.
  const prefilledFrom = line?.fieldEventId ?? null;
  const [from, setFrom] = useState(line?.from ?? '');
  const [to, setTo] = useState(line?.to ?? '');
  const [note, setNote] = useState(line?.note ?? '');
  const [activityId, setActivityId] = useState<string | null>(line?.activityId ?? null);
  const [problem, setProblem] = useState<string | null>(null);
  const titleId = 'activity-line-title';
  const adding = line === null;
  const whatId = 'activity-line-what';

  const save = () => {
    if (prefilledFrom === null && activityId === null) {
      setProblem(said.pickOne);
      return;
    }
    const lineDay = line?.day ?? workDate;
    const typed = day.typedLine(from, to, lineDay);
    if (typed.kind === 'notATime') {
      setProblem(said.notATime[typed.which]);
      return;
    }
    if (typed.kind === 'endsFirst') {
      setProblem(said.endsFirst);
      return;
    }
    onSave({
      key: line?.key ?? `added ${crypto.randomUUID()}`,
      day: lineDay,
      from,
      to,
      fieldEventId: prefilledFrom,
      activityId: prefilledFrom === null ? activityId : null,
      note,
      work: line?.work ?? [],
    });
  };

  return (
    <main data-screen="activity-line" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <ScreenTitle id={titleId}>{adding ? said.addTitle : said.editTitle}</ScreenTitle>
        {line === null || prefilledFrom === null ? null : <p>{workWords(line.work)}</p>}
        {prefilledFrom === null ? (
          <section aria-labelledby={whatId}>
            <h2 id={whatId}>{said.what}</h2>
            <ListPicker
              labelledBy={whatId}
              choices={activities.map(({ id, name }) => ({ key: id, label: name }))}
              picked={activityId}
              onPick={setActivityId}
            />
          </section>
        ) : null}
        <TimeEntry label={said.from} value={from} onChange={setFrom} />
        <TimeEntry label={said.to} value={to} onChange={setTo} />
        <TextEntry label={said.note} value={note} onChange={setNote} longest={2000} />
        {problem === null ? null : (
          <Banner tone="problem" announced>
            <p>{problem}</p>
          </Banner>
        )}
      </div>
      <ScreenActions>
        <Button main wide onPress={save}>
          {said.save}
        </Button>
        {line === null ? null : (
          <Button
            wide
            onPress={() => {
              onRemove(line.key);
            }}
          >
            {said.remove}
          </Button>
        )}
        <Button wide onPress={onBack}>
          {said.back}
        </Button>
      </ScreenActions>
      {after}
    </main>
  );
}
