// "Sync and turn in" under the master passcode (ARCHITECTURE §8; BACKLOG 3.4.3; ADR-096, 488, 530,
// 580; AC-02-58, AC-11-08, 34, 35), from the sign-in screen with nobody signed in, from Settings
// with the monitor signed in, and from Sync where the phone's key alone is no longer taken: the
// passcode, then the phone syncs everything and sends every file as the master user, and asks to
// be turned in. **Told it lacks something, the phone keeps everything** and the screen shows the
// server's words and what it lacks (and how many records this version of the app can't read,
// C183); **told to wipe, the phone is erased** and says so, and opens at enrolment again. **The
// passcode is held in this screen's memory for the act alone** and let go when it is done or left.
import type { TurnInHolds } from '@open-adms/contracts';
import { useState } from 'react';

import {
  Banner,
  Button,
  ScreenActions,
  ScreenTitle,
  StatusStrip,
  TextEntry,
  type Standing,
} from './look/index.ts';
import type { PhoneTurnIn } from './phone/turn-in.ts';
import { refusalWords } from './refusals.ts';
import { counted, words } from './words.ts';

const said = words.turnIn;

// What the server lacks, in the screen's words, a line for each kind it names.
function lacking(missing: TurnInHolds): string[] {
  const kinds = [
    'unplannedAssignments',
    'passcodeUses',
    'records',
    'held',
    'photos',
  ] as const satisfies readonly (keyof TurnInHolds)[];
  return kinds.flatMap((kind) =>
    missing[kind].length === 0 ? [] : [counted(said.notTurnedIn[kind], missing[kind].length)],
  );
}

export function TurnIn({
  turnIn,
  standing,
  onCancel,
  onDone,
}: {
  readonly turnIn: PhoneTurnIn;
  readonly standing: Standing;
  readonly onCancel: () => void;
  // Turned in and erased: the phone opens again, at enrolment.
  readonly onDone: () => void;
}) {
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notTurnedIn, setNotTurnedIn] = useState<{
    readonly message: string;
    readonly lacks: readonly string[];
    readonly unreadable: number;
  } | null>(null);
  const [done, setDone] = useState(false);

  const turnedIn = async () => {
    setBusy(true);
    setProblem(null);
    setNotTurnedIn(null);
    const outcome = await turnIn.turnedIn(passcode);
    setPasscode('');
    setBusy(false);
    switch (outcome.kind) {
      case 'turnedIn':
        setDone(true);
        return;
      case 'notTurnedIn':
        setNotTurnedIn({
          message: outcome.message,
          lacks: lacking(outcome.notOnTheServer),
          unreadable: outcome.unreadable,
        });
        return;
      case 'wrong':
        setProblem(words.refusals.passcode);
        return;
      default:
        setProblem(refusalWords(outcome));
    }
  };

  if (done) {
    return (
      <main data-screen="turned-in" className="screen">
        <StatusStrip standing={{ signedIn: null, waiting: 0, lastSent: null, now: new Date() }} />
        <div className="screen-body">
          <ScreenTitle>{said.done.title}</ScreenTitle>
          <Banner tone="good" announced>
            <p>{said.done.erased}</p>
          </Banner>
        </div>
        <ScreenActions>
          <Button main wide onPress={onDone}>
            {said.done.enrol}
          </Button>
        </ScreenActions>
      </main>
    );
  }

  return (
    <main data-screen="turn-in" className="screen">
      <StatusStrip standing={{ ...standing, sending: busy }} />
      <div className="screen-body">
        <ScreenTitle>{said.title}</ScreenTitle>
        <p>{said.needs}</p>
        <TextEntry label={said.passcode} secret value={passcode} onChange={setPasscode} />
        {problem === null ? null : (
          <Banner tone="problem" announced>
            <p>{problem}</p>
          </Banner>
        )}
        {notTurnedIn === null ? null : (
          <section aria-labelledby="not-turned-in">
            <h2 id="not-turned-in">{said.notTurnedIn.title}</h2>
            <Banner tone="problem" announced>
              <p>{notTurnedIn.message}</p>
            </Banner>
            <p>{said.notTurnedIn.kept}</p>
            <p>{said.notTurnedIn.lacks}</p>
            <ul>
              {notTurnedIn.lacks.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {notTurnedIn.unreadable === 0 ? null : (
              <p>{counted(said.notTurnedIn.unreadable, notTurnedIn.unreadable)}</p>
            )}
          </section>
        )}
      </div>
      <ScreenActions>
        <Button main wide busy={busy} isDisabled={passcode === ''} onPress={() => void turnedIn()}>
          {busy ? said.turning : said.turnIn}
        </Button>
        <Button wide busy={busy} onPress={onCancel}>
          {said.cancel}
        </Button>
      </ScreenActions>
    </main>
  );
}
