// Setting the phone up under the master passcode, a screen a question (ARCHITECTURE §7.1, §7.5;
// adms-field-app §4A.0 (5); BACKLOG 3.3.1; ADR-240, 457, 463, 576; AC-02-38, AC-11-23…25, 63):
// the passcode, then the project (with a connection), the work, the site, the unit rate work where
// it is unit rate work, and the monitor (paged, online), unless the setup is already for one: the
// monitor signed in with no assignment, or the one just created ("Monitor created", REQ-311a).
// With no connection it is offered only on the project whose lists the phone holds, and says so.
// **The passcode is held in this screen's memory for the act alone**, masked as it is typed, and
// let go when the setup is made or left (AC-11-23, 63). Back goes a question back until the setup
// is made; Cancel leaves it, nothing made.
//
// **Handing the phone over** (task 3.3.2; ADR-458, 464, 577; AC-02-46, AC-11-27): the same
// questions, the monitor asked before their work. Picked somebody other than the phone's monitor,
// it is a switch: where the phone holds their assignment for today it is handed over at once;
// otherwise the supervisor says whether they have their own assignment (handed over, no
// assignment made) or sets their work up here (an unplanned assignment, `MONITOR_SWITCH`). With
// no signal the passcode's wrong tries wait and, at the tenth, lock the phone (ADR-577).
import { useState } from 'react';

import {
  Banner,
  Button,
  ListPicker,
  ListPicks,
  ProgressHeader,
  ScreenActions,
  ScreenTitle,
  StatusStrip,
  TextEntry,
  type Choice,
  type Standing,
} from './look/index.ts';
import type {
  PhoneSetup,
  ProjectChoices,
  SetupMade,
  SetupMonitor,
  SetupPayItem,
  SetupProject,
  SetupWork,
} from './phone/setup.ts';
import type { ReportStanding } from './phone/reports.ts';
import { passcodeWrong, refusalWords } from './refusals.ts';
import { say, words } from './words.ts';

type Step =
  | 'passcode'
  | 'project'
  | 'monitor'
  | 'handOver'
  | 'work'
  | 'site'
  | 'payItems'
  | 'made'
  | 'handed';

const said = words.setup;
const titleId = 'setup-question';
const noSite = 'none';
const theirOwn = 'own';
const setUpHere = 'setUp';

const kinds = Object.keys(said.work.kinds) as (keyof typeof said.work.kinds)[];
const forms = Object.keys(said.work.forms) as (keyof typeof said.work.forms)[];
const workChoices: readonly Choice[] = [
  ...kinds.map((kind) => ({ key: `kind:${kind}`, label: said.work.kinds[kind] })),
  { key: 'certifying', label: said.work.certifying },
  ...forms.map((form) => ({ key: `form:${form}`, label: said.work.forms[form] })),
];

function workOf(keys: readonly string[]): SetupWork {
  return {
    fieldEventKinds: kinds.filter((kind) => keys.includes(`kind:${kind}`)),
    certifying: keys.includes('certifying'),
    formDocumentTypes: forms.filter((form) => keys.includes(`form:${form}`)),
  };
}

// A unit rate pay item by its payable type, never its code (invariant 20): its kind of work and
// its size band beneath.
function payItemChoice(payItem: SetupPayItem): Choice {
  const { bandFrom, bandTo } = payItem;
  const band =
    bandFrom !== null && bandTo !== null
      ? say(said.payItems.band, { from: bandFrom, to: bandTo })
      : bandFrom !== null
        ? say(said.payItems.bandFrom, { from: bandFrom })
        : bandTo !== null
          ? say(said.payItems.bandTo, { to: bandTo })
          : null;
  const detail = [payItem.kindOfWork.name, band].filter((part) => part !== null).join(' · ');
  return { key: payItem.id, label: payItem.payableType.name, detail };
}

export function Setup({
  setup,
  standing,
  forMonitor,
  handingOver = false,
  onDone,
  onHandedOver,
  onLocked,
  onCancel,
}: {
  readonly setup: PhoneSetup;
  readonly standing: Standing;
  // The monitor it is for, where that is already known; null to pick one.
  readonly forMonitor: SetupMonitor | null;
  // Asked to hand the phone over (Settings), rather than to set it up.
  readonly handingOver?: boolean;
  readonly onDone: (made: SetupMade, monitor: SetupMonitor) => void;
  // Handed over to a monitor with their own assignment: no assignment made.
  readonly onHandedOver: (monitor: SetupMonitor) => void;
  // The phone locked by the passcode's tenth wrong try with no signal (ADR-577).
  readonly onLocked: () => void;
  readonly onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>('passcode');
  const [passcode, setPasscode] = useState('');
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [projects, setProjects] = useState<readonly SetupProject[]>([]);
  const [project, setProject] = useState<SetupProject | null>(null);
  const [choices, setChoices] = useState<ProjectChoices>({ sites: [], payItems: [] });
  const [monitors, setMonitors] = useState<readonly SetupMonitor[]>([]);
  const [moreAfter, setMoreAfter] = useState<string | null>(null);
  const [work, setWork] = useState<readonly string[]>([]);
  const [site, setSite] = useState<string | null>(null);
  const [payItems, setPayItems] = useState<readonly string[]>([]);
  const [monitor, setMonitor] = useState<SetupMonitor | null>(forMonitor);
  const [switching, setSwitching] = useState(false);
  const [handOver, setHandOver] = useState<string | null>(null);
  const [made, setMade] = useState<SetupMade | null>(null);
  const [handed, setHanded] = useState<ReportStanding | null>(null);

  const unitRate = work.includes('kind:UNIT_RATE');
  const steps: Step[] = [
    'passcode',
    ...(online ? (['project'] as const) : []),
    ...(forMonitor === null ? (['monitor'] as const) : []),
    ...(switching ? (['handOver'] as const) : []),
    'work',
    'site',
    ...(unitRate ? (['payItems'] as const) : []),
  ];
  const last = steps.at(-1);
  const at = steps.indexOf(step) + 1;
  const back = () => {
    setProblem(null);
    const before = steps[steps.indexOf(step) - 1];
    if (before === undefined || before === 'passcode') onCancel();
    else setStep(before);
  };
  const onward = (from: Step) => {
    setProblem(null);
    setStep(steps[steps.indexOf(from) + 1] ?? 'made');
  };

  const opened = async () => {
    setBusy(true);
    setProblem(null);
    const outcome = await setup.opened(passcode);
    setBusy(false);
    switch (outcome.kind) {
      case 'online':
        setOnline(true);
        setProjects(outcome.projects);
        setMonitors(outcome.monitors);
        setMoreAfter(outcome.moreMonitorsAfter);
        setStep('project');
        return;
      case 'offline':
        setOnline(false);
        setProject(outcome.project);
        setChoices(outcome.choices);
        setMonitors(outcome.monitors);
        setMoreAfter(null);
        setStep(forMonitor === null ? 'monitor' : 'work');
        return;
      case 'wrong':
        setPasscode('');
        setProblem(passcodeWrong(outcome.waitUntil));
        return;
      case 'waiting':
        setProblem(passcodeWrong(outcome.until));
        return;
      case 'locked':
        setPasscode('');
        onLocked();
        return;
      case 'noLists':
      case 'noCheck':
        setProblem(said[outcome.kind]);
        return;
      default:
        setPasscode('');
        setProblem(refusalWords(outcome, { MASTER_PASSCODE_REFUSED: words.refusals.passcode }));
    }
  };

  const projectPicked = async () => {
    if (project === null) return;
    setBusy(true);
    setProblem(null);
    const outcome = await setup.project(passcode, project.id);
    setBusy(false);
    if (outcome.kind === 'project') {
      setChoices(outcome.choices);
      setSite(null);
      setPayItems([]);
      onward('project');
    } else if (outcome.kind === 'closed') {
      setProblem(said.project.closed);
    } else {
      setProblem(refusalWords(outcome, { MASTER_PASSCODE_REFUSED: words.refusals.passcode }));
    }
  };

  const more = async () => {
    if (moreAfter === null) return;
    setBusy(true);
    const outcome = await setup.moreMonitors(passcode, moreAfter);
    setBusy(false);
    if (outcome.kind === 'monitors') {
      setMonitors([...monitors, ...outcome.monitors]);
      setMoreAfter(outcome.moreMonitorsAfter);
    } else {
      setProblem(refusalWords(outcome, { MASTER_PASSCODE_REFUSED: words.refusals.passcode }));
    }
  };

  // The monitor picked: a switch where they are not the phone's monitor; handed over at once where
  // the phone holds their assignment for today (AC-11-27).
  const monitorPicked = async () => {
    if (monitor === null) {
      setProblem(said.monitor.none);
      return;
    }
    setBusy(true);
    setProblem(null);
    const isSwitch = await setup.isSwitch(monitor.monitorId);
    if (isSwitch && (await setup.holdsAssignmentFor(monitor.monitorId))) {
      await handOverNow(monitor);
      return;
    }
    setBusy(false);
    setSwitching(isSwitch);
    setStep(isSwitch ? 'handOver' : 'work');
  };

  const handOverNow = async (to: SetupMonitor) => {
    setBusy(true);
    const report = await setup.handedOver(to, online ? passcode : null);
    setPasscode('');
    setBusy(false);
    setHanded(report);
    setStep('handed');
  };

  // The last question answered: the assignment made, and the passcode let go.
  const make = async () => {
    if (project === null || monitor === null) return;
    setBusy(true);
    setProblem(null);
    const picked = choices.sites.find(({ id }) => id === site) ?? null;
    const outcome = await setup.made(
      {
        project,
        work: workOf(work),
        site: picked,
        payItemIds: unitRate ? payItems : [],
        monitor,
      },
      online ? passcode : null,
    );
    setPasscode('');
    setBusy(false);
    setMade(outcome);
    setStep('made');
  };

  // The main button of a question: on to the next, or the setup made at the last.
  const next = (from: Step, ready: boolean, none: string) => (
    <Button
      main
      wide
      busy={busy}
      onPress={() => {
        if (!ready) setProblem(none);
        else if (from === last) void make();
        else onward(from);
      }}
    >
      {busy ? said.making : from === last ? said.make : said.next}
    </Button>
  );
  const header = (title: string) => (
    <ProgressHeader titleId={titleId} title={title} step={at} steps={steps.length} onBack={back} />
  );
  const shown = (
    <>
      {online || project === null ? null : <p>{say(said.offline, { project: project.name })}</p>}
      {problem === null ? null : (
        <Banner tone="problem" announced>
          <p>{problem}</p>
        </Banner>
      )}
    </>
  );
  const cancel = (
    <Button wide busy={busy} onPress={onCancel}>
      {said.cancel}
    </Button>
  );

  switch (step) {
    case 'passcode':
      return (
        <main data-screen="setup-passcode" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <ScreenTitle id={titleId}>{handingOver ? said.handOverTitle : said.title}</ScreenTitle>
            <p>{handingOver ? said.handOverNeeds : said.needs}</p>
            <TextEntry label={said.passcode} secret value={passcode} onChange={setPasscode} />
            {shown}
          </div>
          <ScreenActions>
            <Button
              main
              wide
              busy={busy}
              isDisabled={passcode === ''}
              onPress={() => void opened()}
            >
              {busy ? said.checking : said.next}
            </Button>
            {cancel}
          </ScreenActions>
        </main>
      );
    case 'project':
      return (
        <main data-screen="setup-project" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            {header(said.project.title)}
            <ListPicker
              labelledBy={titleId}
              choices={projects.map(({ id, name }) => ({ key: id, label: name }))}
              picked={project?.id ?? null}
              onPick={(key) => {
                setProject(projects.find(({ id }) => id === key) ?? null);
              }}
            />
            {shown}
          </div>
          <ScreenActions>
            <Button
              main
              wide
              busy={busy}
              isDisabled={project === null}
              onPress={() => void projectPicked()}
            >
              {busy ? said.checking : said.next}
            </Button>
            {cancel}
          </ScreenActions>
        </main>
      );
    case 'work':
      return (
        <main data-screen="setup-work" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            {header(said.work.title)}
            <p>{said.work.hint}</p>
            <ListPicks
              labelledBy={titleId}
              choices={workChoices}
              picked={work}
              onPicked={setWork}
            />
            {shown}
          </div>
          <ScreenActions>
            {next('work', work.length > 0, said.work.none)}
            {cancel}
          </ScreenActions>
        </main>
      );
    case 'site':
      return (
        <main data-screen="setup-site" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            {header(said.site.title)}
            <ListPicker
              labelledBy={titleId}
              choices={[
                { key: noSite, label: said.site.none, detail: said.site.noneDetail },
                ...choices.sites.map(({ id, name, siteType }) => ({
                  key: id,
                  label: name,
                  detail: siteType.name,
                })),
              ]}
              picked={site ?? noSite}
              onPick={(key) => {
                setSite(key === noSite ? null : key);
              }}
            />
            {shown}
          </div>
          <ScreenActions>
            {next('site', true, '')}
            {cancel}
          </ScreenActions>
        </main>
      );
    case 'payItems':
      return (
        <main data-screen="setup-pay-items" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            {header(said.payItems.title)}
            {choices.payItems.length === 0 ? (
              <p>{said.payItems.nothing}</p>
            ) : (
              <ListPicks
                labelledBy={titleId}
                choices={choices.payItems.map(payItemChoice)}
                picked={payItems}
                onPicked={setPayItems}
              />
            )}
            {shown}
          </div>
          <ScreenActions>
            {next(
              'payItems',
              payItems.length > 0 || choices.payItems.length === 0,
              said.payItems.none,
            )}
            {cancel}
          </ScreenActions>
        </main>
      );
    case 'monitor':
      return (
        <main data-screen="setup-monitor" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            {header(said.monitor.title)}
            <ListPicker
              labelledBy={titleId}
              choices={monitors.map(({ monitorId, monitorNumber, name }) => ({
                key: monitorId,
                label: name,
                detail: monitorNumber,
              }))}
              picked={monitor?.monitorId ?? null}
              onPick={(key) => {
                setMonitor(monitors.find(({ monitorId }) => monitorId === key) ?? null);
              }}
            />
            {moreAfter === null ? null : (
              <Button wide busy={busy} onPress={() => void more()}>
                {busy ? said.monitor.loading : said.monitor.more}
              </Button>
            )}
            {shown}
          </div>
          <ScreenActions>
            <Button main wide busy={busy} onPress={() => void monitorPicked()}>
              {busy ? said.checking : said.next}
            </Button>
            {cancel}
          </ScreenActions>
        </main>
      );
    case 'handOver': {
      if (monitor === null) return null;
      const { name } = monitor;
      return (
        <main data-screen="setup-hand-over" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            {header(say(said.handOver.title, { name }))}
            <ListPicker
              labelledBy={titleId}
              choices={[
                {
                  key: theirOwn,
                  label: say(said.handOver.own, { name }),
                  detail: said.handOver.ownDetail,
                },
                {
                  key: setUpHere,
                  label: say(said.handOver.setUp, { name }),
                  detail: said.handOver.setUpDetail,
                },
              ]}
              picked={handOver}
              onPick={setHandOver}
            />
            {shown}
          </div>
          <ScreenActions>
            <Button
              main
              wide
              busy={busy}
              isDisabled={handOver === null}
              onPress={() => {
                if (handOver === theirOwn) void handOverNow(monitor);
                else onward('handOver');
              }}
            >
              {busy ? said.making : said.next}
            </Button>
            {cancel}
          </ScreenActions>
        </main>
      );
    }
    case 'handed': {
      if (handed === null || monitor === null) return null;
      return (
        <main data-screen="setup-handed" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <ScreenTitle>{said.handed.title}</ScreenTitle>
            <Banner tone="good">
              <p>{say(said.handed.to, { name: monitor.name })}</p>
            </Banner>
            <p role="status">{said.made[handed]}</p>
          </div>
          <ScreenActions>
            <Button
              main
              wide
              onPress={() => {
                onHandedOver(monitor);
              }}
            >
              {said.handed.done}
            </Button>
          </ScreenActions>
        </main>
      );
    }
    case 'made': {
      if (made === null || monitor === null) return null;
      const name = monitor.name;
      return (
        <main data-screen="setup-made" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <ScreenTitle>{said.made.title}</ScreenTitle>
            <Banner tone="good">
              <p>{say(said.made.for, { name, project: made.assignment.project.name })}</p>
            </Banner>
            <p role="status">{said.made[made.report]}</p>
            {made.takenHere || made.report === 'saved' ? null : (
              <p>{say(said.made.notHere, { name })}</p>
            )}
          </div>
          <ScreenActions>
            <Button
              main
              wide
              onPress={() => {
                onDone(made, monitor);
              }}
            >
              {said.made.done}
            </Button>
          </ScreenActions>
        </main>
      );
    }
  }
}
