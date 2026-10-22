// Signing in under the master passcode, from the sign-in screen (ARCHITECTURE §7.2, §7.3; BACKLOG
// 3.3.2, C124; ADR-120, 462, 531, 577; AC-02-42, AC-11-26): the passcode, then whom for, picked from
// the roster (the server's monitors a page at a time with signal; the login list's with none). For
// the phone's own monitor it signs in as them; for anybody else it opens the temporary session,
// which ends with the project's day; each row says which. With no signal the passcode's wrong
// tries wait and, at the tenth, lock the phone (ADR-577). **The passcode is held in this screen's
// memory for the act alone** and let go when the session is opened or left (AC-11-23, 63).
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
import type { PhoneLists } from './phone/lists.ts';
import type { SignedIn } from './phone/monitor.ts';
import type { PasscodeSessions } from './phone/passcode-sessions.ts';
import type { PhoneSetup, SetupMonitor } from './phone/setup.ts';
import { passcodeWrong, refusalWords } from './refusals.ts';
import { words } from './words.ts';

const said = words.session;
const titleId = 'session-question';

export function PasscodeSession({
  setup,
  sessions,
  lists,
  standing,
  onSignedIn,
  onLocked,
  onCancel,
}: {
  readonly setup: PhoneSetup;
  readonly sessions: PasscodeSessions;
  readonly lists: PhoneLists;
  readonly standing: Standing;
  readonly onSignedIn: (signedIn: SignedIn) => void;
  readonly onLocked: () => void;
  readonly onCancel: () => void;
}) {
  const [step, setStep] = useState<'passcode' | 'monitor'>('passcode');
  const [passcode, setPasscode] = useState('');
  const [online, setOnline] = useState(true);
  const [monitors, setMonitors] = useState<readonly SetupMonitor[]>([]);
  const [moreAfter, setMoreAfter] = useState<string | null>(null);
  const [phones, setPhones] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<SetupMonitor | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const opened = async () => {
    setBusy(true);
    setProblem(null);
    const [outcome, held] = await Promise.all([setup.opened(passcode), lists.phonesMonitor()]);
    setBusy(false);
    setPhones(held);
    switch (outcome.kind) {
      case 'online':
      case 'offline': {
        setOnline(outcome.kind === 'online');
        // The phone's own monitor first, where the roster names them.
        const first = outcome.monitors.filter(({ monitorId }) => monitorId === held);
        const rest = outcome.monitors.filter(({ monitorId }) => monitorId !== held);
        setMonitors([...first, ...rest]);
        setMoreAfter(outcome.kind === 'online' ? outcome.moreMonitorsAfter : null);
        setStep('monitor');
        return;
      }
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

  const open = async () => {
    if (monitor === null) {
      setProblem(said.monitor.none);
      return;
    }
    setBusy(true);
    setProblem(null);
    const outcome = await sessions.opened(monitor, passcode, online);
    setBusy(false);
    switch (outcome.kind) {
      case 'signedIn':
        setPasscode('');
        onSignedIn(outcome.signedIn);
        return;
      case 'wrong':
        setProblem(passcodeWrong(outcome.waitUntil));
        return;
      case 'waiting':
        setProblem(passcodeWrong(outcome.until));
        return;
      case 'locked':
        setPasscode('');
        onLocked();
        return;
      case 'noCheck':
        setProblem(said.noCheck);
        return;
      case 'refused':
        setProblem(
          refusalWords(outcome.reply, { MASTER_PASSCODE_REFUSED: words.refusals.passcode }),
        );
    }
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
      <main data-screen="session-passcode" className="screen">
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

  return (
    <main data-screen="session-monitor" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <ProgressHeader
          titleId={titleId}
          title={said.monitor.title}
          step={2}
          steps={2}
          onBack={() => {
            setProblem(null);
            setStep('passcode');
          }}
        />
        {online ? null : <p>{said.offline}</p>}
        <ListPicker
          labelledBy={titleId}
          choices={monitors.map(({ monitorId, monitorNumber, name }) => ({
            key: monitorId,
            label: name,
            detail: `${monitorNumber} · ${monitorId === phones ? said.monitor.phones : said.monitor.temporary}`,
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
        <Button main wide busy={busy} onPress={() => void open()}>
          {busy ? said.opening : said.open}
        </Button>
        {cancel}
      </ScreenActions>
    </main>
  );
}
