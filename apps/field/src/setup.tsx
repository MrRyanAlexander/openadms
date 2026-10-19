// Setting the phone up under the master passcode, a screen a question (ARCHITECTURE §7.1, §7.5;
// adms-field-app §4A.0 (5); BACKLOG 3.3.1; ADR-240, 457, 463, 576; AC-02-38, AC-11-23…25, 63):
// the passcode, then the project (with a connection), the work, the site, the unit rate work where
// it is unit rate work, and the monitor (paged, online), unless the setup is already for one: the
// monitor signed in with no assignment, or the one just created ("Monitor created", REQ-311a).
// With no connection it is offered only on the project whose lists the phone holds, and says so.
// **The passcode is held in this screen's memory for the act alone**, masked as it is typed, and
// let go when the setup is made or left (AC-11-23, 63). Back goes a question back until the setup
// is made; Cancel leaves it, nothing made.
import { useState } from 'react';

import {
  Banner,
  Button,
  ListPicker,
  ListPicks,
  ProgressHeader,
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
import { refusalWords } from './refusals.ts';
import { say, words } from './words.ts';

type Step = 'passcode' | 'project' | 'work' | 'site' | 'payItems' | 'monitor' | 'made';

const said = words.setup;
const titleId = 'setup-question';
const noSite = 'none';

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
  onDone,
  onCancel,
}: {
  readonly setup: PhoneSetup;
  readonly standing: Standing;
  // The monitor it is for, where that is already known; null to pick one.
  readonly forMonitor: SetupMonitor | null;
  readonly onDone: (made: SetupMade, monitor: SetupMonitor) => void;
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
  const [made, setMade] = useState<SetupMade | null>(null);

  const unitRate = work.includes('kind:UNIT_RATE');
  const steps: Step[] = [
    'passcode',
    ...(online ? (['project'] as const) : []),
    'work',
    'site',
    ...(unitRate ? (['payItems'] as const) : []),
    ...(forMonitor === null ? (['monitor'] as const) : []),
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
        setStep('work');
        return;
      case 'wrong':
        setPasscode('');
        setProblem(words.refusals.passcode);
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
      isDisabled={busy}
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
    <Button wide isDisabled={busy} onPress={onCancel}>
      {said.cancel}
    </Button>
  );

  switch (step) {
    case 'passcode':
      return (
        <main data-screen="setup-passcode" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <h1 id={titleId}>{said.title}</h1>
            <p>{said.needs}</p>
            <TextEntry label={said.passcode} secret value={passcode} onChange={setPasscode} />
            {shown}
          </div>
          <div className="screen-actions">
            <Button main wide isDisabled={busy || passcode === ''} onPress={() => void opened()}>
              {busy ? said.checking : said.next}
            </Button>
            {cancel}
          </div>
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
          <div className="screen-actions">
            <Button
              main
              wide
              isDisabled={busy || project === null}
              onPress={() => void projectPicked()}
            >
              {busy ? said.checking : said.next}
            </Button>
            {cancel}
          </div>
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
          <div className="screen-actions">
            {next('work', work.length > 0, said.work.none)}
            {cancel}
          </div>
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
          <div className="screen-actions">
            {next('site', true, '')}
            {cancel}
          </div>
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
          <div className="screen-actions">
            {next(
              'payItems',
              payItems.length > 0 || choices.payItems.length === 0,
              said.payItems.none,
            )}
            {cancel}
          </div>
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
              <Button wide isDisabled={busy} onPress={() => void more()}>
                {busy ? said.monitor.loading : said.monitor.more}
              </Button>
            )}
            {shown}
          </div>
          <div className="screen-actions">
            {next('monitor', monitor !== null, said.monitor.none)}
            {cancel}
          </div>
        </main>
      );
    case 'made': {
      if (made === null || monitor === null) return null;
      const name = monitor.name;
      return (
        <main data-screen="setup-made" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <h1>{said.made.title}</h1>
            <Banner tone="good">
              <p>{say(said.made.for, { name, project: made.assignment.project.name })}</p>
            </Banner>
            <p role="status">{said.made[made.report]}</p>
            {made.takenHere || made.report === 'saved' ? null : (
              <p>{say(said.made.notHere, { name })}</p>
            )}
          </div>
          <div className="screen-actions">
            <Button
              main
              wide
              onPress={() => {
                onDone(made, monitor);
              }}
            >
              {said.made.done}
            </Button>
          </div>
        </main>
      );
    }
  }
}
