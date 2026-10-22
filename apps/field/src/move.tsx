// Moving the phone to another of its project's sites under the master passcode (ARCHITECTURE §7.1;
// adms-field-app §4A.0 (9); BACKLOG 3.3.2, C123; ADR-195, 458, 577; AC-02-47, AC-11-27), from
// Settings, for the monitor signed in: the passcode, then the site. With signal the sites are the
// server's (the passcode checked there); with none, those the phone holds, against its own check
// (its wrong tries waiting and, at the tenth, locking the phone, ADR-577). The move is an
// unplanned assignment at the new site, with the same work, taken at once and reported as a setup
// is; what was made at the earlier site keeps it. **The passcode is held in this screen's memory
// for the act alone** and let go when the move is made or left (AC-11-23, 63).
import { useState } from 'react';

import {
  Banner,
  Button,
  ListPicker,
  ProgressHeader,
  ScreenActions,
  ScreenTitle,
  StatusStrip,
  TextEntry,
  type Standing,
} from './look/index.ts';
import type { PhoneSetup, SetupMade, SetupSite } from './phone/setup.ts';
import { passcodeWrong, refusalWords } from './refusals.ts';
import { say, words } from './words.ts';

const said = words.move;
const titleId = 'move-question';

export function Move({
  setup,
  standing,
  project,
  currentSiteId,
  onDone,
  onLocked,
  onCancel,
}: {
  readonly setup: PhoneSetup;
  readonly standing: Standing;
  // The project the phone holds, and the site it is at now (none at the curb).
  readonly project: string;
  readonly currentSiteId: string | null;
  readonly onDone: (made: SetupMade) => void;
  readonly onLocked: () => void;
  readonly onCancel: () => void;
}) {
  const [step, setStep] = useState<'passcode' | 'site' | 'made'>('passcode');
  const [passcode, setPasscode] = useState('');
  const [online, setOnline] = useState(true);
  const [sites, setSites] = useState<readonly SetupSite[]>([]);
  const [site, setSite] = useState<SetupSite | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [made, setMade] = useState<SetupMade | null>(null);

  const opened = async () => {
    setBusy(true);
    setProblem(null);
    const outcome = await setup.forMove(passcode);
    setBusy(false);
    switch (outcome.kind) {
      case 'online':
      case 'offline':
        setOnline(outcome.kind === 'online');
        setSites(outcome.sites.filter(({ id }) => id !== currentSiteId));
        setStep('site');
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
      case 'closed':
      case 'notSignedIn':
        setProblem(said[outcome.kind]);
        return;
      default:
        setPasscode('');
        setProblem(refusalWords(outcome, { MASTER_PASSCODE_REFUSED: words.refusals.passcode }));
    }
  };

  const move = async () => {
    if (site === null) {
      setProblem(said.site.none);
      return;
    }
    setBusy(true);
    setProblem(null);
    const outcome = await setup.moved(site, online ? passcode : null);
    setPasscode('');
    setBusy(false);
    if (outcome === undefined) {
      setProblem(said.notSignedIn);
      return;
    }
    setMade(outcome);
    setStep('made');
  };

  const shown =
    problem === null ? null : (
      <Banner tone="problem" announced>
        <p>{problem}</p>
      </Banner>
    );
  const cancel = (
    <Button wide busy={busy} onPress={onCancel}>
      {said.cancel}
    </Button>
  );

  if (step === 'passcode') {
    return (
      <main data-screen="move-passcode" className="screen">
        <StatusStrip standing={standing} />
        <div className="screen-body">
          <ScreenTitle id={titleId}>{said.title}</ScreenTitle>
          <p>{said.needs}</p>
          <TextEntry label={said.passcode} secret value={passcode} onChange={setPasscode} />
          {shown}
        </div>
        <ScreenActions>
          <Button main wide busy={busy} isDisabled={passcode === ''} onPress={() => void opened()}>
            {busy ? said.checking : said.next}
          </Button>
          {cancel}
        </ScreenActions>
      </main>
    );
  }

  if (step === 'site') {
    return (
      <main data-screen="move-site" className="screen">
        <StatusStrip standing={standing} />
        <div className="screen-body">
          <ProgressHeader
            titleId={titleId}
            title={said.site.title}
            step={2}
            steps={2}
            onBack={() => {
              setProblem(null);
              setStep('passcode');
            }}
          />
          {online ? null : <p>{say(said.offline, { project })}</p>}
          {sites.length === 0 ? (
            <p>{said.site.nothing}</p>
          ) : (
            <ListPicker
              labelledBy={titleId}
              choices={sites.map(({ id, name, siteType }) => ({
                key: id,
                label: name,
                detail: siteType.name,
              }))}
              picked={site?.id ?? null}
              onPick={(key) => {
                setSite(sites.find(({ id }) => id === key) ?? null);
              }}
            />
          )}
          {shown}
        </div>
        <ScreenActions>
          <Button main wide busy={busy} isDisabled={sites.length === 0} onPress={() => void move()}>
            {busy ? said.making : said.make}
          </Button>
          {cancel}
        </ScreenActions>
      </main>
    );
  }

  if (made === null || site === null) return null;
  return (
    <main data-screen="move-made" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <ScreenTitle>{said.made.title}</ScreenTitle>
        <Banner tone="good">
          <p>{say(said.made.to, { site: site.name })}</p>
        </Banner>
        <p role="status">{words.setup.made[made.report]}</p>
      </div>
      <ScreenActions>
        <Button
          main
          wide
          onPress={() => {
            onDone(made);
          }}
        >
          {said.made.done}
        </Button>
      </ScreenActions>
    </main>
  );
}
