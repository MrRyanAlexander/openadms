// An enrolled phone with nobody signed in (ARCHITECTURE §7.2, §7.4; BACKLOG 3.2.2…3.2.4; ADR-572,
// 574, 575): what it is called, and whether the server knows it, asked once it opens by the phone
// proving itself (AC-02-18): in service, out of service, or not taken. Nothing waits on the
// answer. A monitor signs in here with their Monitor ID and password: online where the phone
// reaches the server (AC-02-35, 36), else against its login list (AC-02-39, AC-11-19). Wrong tries
// against the list wait from the policy's first count and lock the screen at its second until the
// master passcode is typed here (AC-02-40). A sign-in that ended is said first (AC-11-14, 21, 64).
// The fields take a paste and a password manager (AC-11-54, 63). Whoever holds the master passcode
// creates a monitor from here (AC-02-07), and sets the phone up for a monitor with no assignment,
// online or, on the project whose lists it holds, with no connection (AC-02-38, AC-11-24; task
// 3.3.1, ADR-576); set up, the screen says for whom, their Monitor ID filled in.
import { provenPhoneEndpoint } from '@open-adms/contracts';
import { useEffect, useState } from 'react';

import { Banner, Button, StatusStrip, TextEntry } from './look/index.ts';
import type { Enrolment, PhoneIdentity } from './phone/identity.ts';
import type { LoginList, ScreenTries } from './phone/login-list.ts';
import { MonitorOnPhone, type SignedIn } from './phone/monitor.ts';
import type { SigningIn } from './phone/signing-in.ts';
import { refusalWords } from './refusals.ts';
import { counted, say, words } from './words.ts';

type Standing = keyof typeof words.phone.standing;

// Why the last sign-in ended under the monitor: the server no longer took it, it didn't take the
// one made offline, or the phone was left alone too long.
export type Ended =
  | { readonly why: 'ended' }
  | { readonly why: 'offlineRefused' }
  | { readonly why: 'inactive'; readonly minutes: number };

// Who the phone was just set up for, on which project.
export interface SetUpFor {
  readonly name: string;
  readonly monitorNumber: string;
  readonly project: string;
}

export function Phone({
  enrolment,
  identity,
  signingIn,
  loginList,
  ended,
  setUpFor,
  onSignedIn,
  onCreateMonitor,
  onSetUp,
}: {
  readonly enrolment: Enrolment;
  readonly identity: PhoneIdentity;
  readonly signingIn: SigningIn;
  readonly loginList: LoginList;
  readonly ended: Ended | null;
  readonly setUpFor: SetUpFor | null;
  readonly onSignedIn: (signedIn: SignedIn) => void;
  readonly onCreateMonitor: () => void;
  readonly onSetUp: () => void;
}) {
  const said = words.phone;
  const [standing, setStanding] = useState<Standing>('checking');
  const [monitorNumber, setMonitorNumber] = useState(setUpFor?.monitorNumber ?? '');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tries, setTries] = useState<ScreenTries | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let shown = true;
    void identity.asPhone(provenPhoneEndpoint).then((reply) => {
      if (!shown) return;
      if (reply.kind === 'answered') {
        setStanding(reply.answer.status === 'ACTIVE' ? 'inService' : 'outOfService');
      } else if (reply.kind === 'refused') {
        setStanding('notProven');
      } else {
        setStanding('unreachable');
      }
    });
    void loginList.screen().then((held) => {
      if (shown) setTries(held);
    });
    return () => {
      shown = false;
    };
  }, [identity, loginList]);

  // While a wait is on the screen, the seconds left are counted down and the button comes back.
  const waitUntil = tries?.waitUntil ?? null;
  const waiting = waitUntil !== null && waitUntil.getTime() > now.getTime();
  useEffect(() => {
    if (waitUntil === null) return;
    const ticking = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      window.clearInterval(ticking);
    };
  }, [waitUntil]);

  const signIn = async () => {
    if (!MonitorOnPhone.signInReadable(monitorNumber, password)) {
      setProblem(said.incomplete);
      return;
    }
    setBusy(true);
    setProblem(null);
    setNotice(null);
    const outcome = await signingIn.signIn(monitorNumber, password);
    setPassword('');
    setBusy(false);
    setTries(await loginList.screen());
    setNow(new Date());
    switch (outcome.kind) {
      case 'signedIn':
        onSignedIn(outcome.signedIn);
        return;
      case 'refused':
        setProblem(
          refusalWords(outcome.reply, {
            SIGN_IN_REFUSED: said.refused,
            PHONE_NOT_PROVEN: said.standing.notProven,
          }),
        );
        return;
      case 'wrong':
        setProblem(outcome.cost.kind === 'COUNTED' ? said.refused : null);
        return;
      case 'closed':
        return;
      case 'anotherMonitor':
        setProblem(
          outcome.name === null
            ? said.anotherMonitorUnnamed
            : say(said.anotherMonitor, { name: outcome.name }),
        );
        return;
      case 'noList':
        setProblem(said.noList);
        return;
    }
  };

  const unlock = async () => {
    setBusy(true);
    setProblem(null);
    const unlocked = await signingIn.unlock(passcode);
    setPasscode('');
    setBusy(false);
    if (unlocked === 'unlocked') {
      setTries(await loginList.screen());
      setNotice(said.unlocked);
    } else {
      setProblem(unlocked === 'wrong' ? words.refusals.passcode : said.noPasscodeCheck);
    }
  };

  const endedWords =
    ended === null
      ? null
      : ended.why === 'inactive'
        ? counted(said.inactive, ended.minutes)
        : said[ended.why];
  const secondsLeft =
    waitUntil === null ? 0 : Math.ceil((waitUntil.getTime() - now.getTime()) / 1000);
  const locked = tries?.locked ?? false;

  return (
    <main data-screen="phone" className="screen">
      <StatusStrip standing={{ signedIn: null, waiting: 0, lastSent: null, now }} />
      <div className="screen-body">
        <h1>{words.app.name}</h1>
        <p>{say(said.enrolled, { name: enrolment.name })}</p>
        <p role="status">{said.standing[standing]}</p>
        {endedWords === null ? (
          <p>{said.nobody}</p>
        ) : (
          <Banner tone="notice">
            <p>{endedWords}</p>
          </Banner>
        )}
        {setUpFor === null ? null : (
          <Banner tone="good">
            <p>{say(said.setUpFor, { name: setUpFor.name, project: setUpFor.project })}</p>
          </Banner>
        )}
        {locked ? (
          <>
            <Banner tone="notice" announced>
              <p>{said.locked}</p>
            </Banner>
            <TextEntry label={said.passcode} secret value={passcode} onChange={setPasscode} />
          </>
        ) : (
          <>
            <TextEntry
              label={said.monitorNumber}
              hint={said.monitorNumberHint}
              value={monitorNumber}
              onChange={setMonitorNumber}
              autoComplete="username"
            />
            <TextEntry
              label={said.passwordLabel}
              secret
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </>
        )}
        {waiting && !locked ? (
          <Banner tone="problem" announced>
            <p>{counted(words.refusals.wait, secondsLeft)}</p>
          </Banner>
        ) : null}
        {problem === null ? null : (
          <Banner tone="problem" announced>
            <p>{problem}</p>
          </Banner>
        )}
        {notice === null ? null : (
          <Banner tone="good" announced>
            <p>{notice}</p>
          </Banner>
        )}
      </div>
      <div className="screen-actions">
        {locked ? (
          <Button main wide isDisabled={busy || passcode === ''} onPress={() => void unlock()}>
            {busy ? said.unlocking : said.unlock}
          </Button>
        ) : (
          <Button main wide isDisabled={busy || waiting} onPress={() => void signIn()}>
            {busy ? said.signingIn : said.signIn}
          </Button>
        )}
        <Button wide isDisabled={busy} onPress={onSetUp}>
          {said.setUp}
        </Button>
        <Button wide isDisabled={busy} onPress={onCreateMonitor}>
          {said.createMonitor}
        </Button>
      </div>
    </main>
  );
}
