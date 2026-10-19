// Enrolment (ARCHITECTURE §7.1, §7.4; BACKLOG 3.2.2; ADR-240, 572; AC-02-18, AC-11-11): the
// first screen of a phone not yet enrolled. Whoever holds the master passcode gives the phone the
// name the dispatch board will call it and the passcode, with a connection; the phone makes its
// device key and sends its public half. It says that this build is for testing (AC-11-03) and
// whether the server answers. The passcode is held only until it is sent.
import { useEffect, useState } from 'react';

import { Banner, Button, StatusStrip, TextEntry } from './look/index.ts';
import { PhoneIdentity, type Enrolment } from './phone/identity.ts';
import { refusalWords } from './refusals.ts';
import type { Server } from './server.ts';
import { words } from './words.ts';

type Reach = keyof typeof words.shell.server;

export function Enrol({
  server,
  identity,
  onEnrolled,
}: {
  readonly server: Server;
  readonly identity: PhoneIdentity;
  readonly onEnrolled: (enrolment: Enrolment) => void;
}) {
  const [reach, setReach] = useState<Reach>('checking');
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let shown = true;
    void server.answers().then((answers) => {
      if (shown) setReach(answers ? 'answers' : 'unreachable');
    });
    return () => {
      shown = false;
    };
  }, [server]);

  const enrol = async () => {
    if (!PhoneIdentity.enrolmentReadable(name, passcode)) {
      setProblem(words.enrol.incomplete);
      return;
    }
    setEnrolling(true);
    setProblem(null);
    const reply = await identity.enrol(name, passcode);
    setPasscode('');
    setEnrolling(false);
    if (reply.kind !== 'answered') {
      setProblem(
        refusalWords(reply, {
          ENROLMENT_REFUSED: words.refusals.passcode,
          DEVICE_KEY_REFUSED: words.enrol.keyRefused,
        }),
      );
      return;
    }
    const enrolment = await identity.enrolment();
    if (enrolment !== undefined) onEnrolled(enrolment);
  };

  return (
    <main data-screen="enrol" className="screen">
      <StatusStrip standing={{ signedIn: null, waiting: 0, lastSent: null, now: new Date() }} />
      <div className="screen-body">
        <h1>{words.app.name}</h1>
        <Banner tone="notice">
          <p>{words.shell.testBuild}</p>
        </Banner>
        <p>{words.enrol.notEnrolled}</p>
        <p role="status">{words.shell.server[reach]}</p>
        <TextEntry
          label={words.enrol.name}
          hint={words.enrol.nameHint}
          value={name}
          onChange={setName}
        />
        <TextEntry label={words.enrol.passcode} secret value={passcode} onChange={setPasscode} />
        {problem === null ? null : (
          <Banner tone="problem" announced>
            <p>{problem}</p>
          </Banner>
        )}
      </div>
      <div className="screen-actions">
        <Button main wide isDisabled={enrolling} onPress={() => void enrol()}>
          {enrolling ? words.enrol.enrolling : words.enrol.enrol}
        </Button>
      </div>
    </main>
  );
}
