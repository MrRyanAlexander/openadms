// "Create monitor" (ARCHITECTURE §7.0, §7.5; BACKLOG 3.2.2, C113; ADR-105, 120, 442, 572;
// AC-02-07): whoever holds the master passcode creates a field monitor on an enrolled phone, with a
// connection: their name, their password, their phone number where the firm keeps one. The phone
// proves itself first and only then sends the passcode; the server issues the Monitor ID, which is
// their username, and the next screen shows it. Without a connection nothing is created, and the
// screen says so. The passcode is held only until it is sent, and the password until the monitor
// is created.
import { createMonitorOnPhoneEndpoint, type MonitorCreatedAnswer } from '@open-adms/contracts';
import { useState } from 'react';

import {
  Banner,
  Button,
  ScreenActions,
  ScreenTitle,
  StatusStrip,
  TextEntry,
} from './look/index.ts';
import { Backward } from './look/icons.tsx';
import type { PhoneIdentity } from './phone/identity.ts';
import { refusalWords } from './refusals.ts';
import { words } from './words.ts';

export function CreateMonitor({
  identity,
  onCreated,
  onBack,
}: {
  readonly identity: PhoneIdentity;
  readonly onCreated: (created: MonitorCreatedAnswer) => void;
  readonly onBack: () => void;
}) {
  const said = words.createMonitor;
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [passcode, setPasscode] = useState('');
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const create = async () => {
    // As the endpoint's own schema reads it: a phone number only where one is given.
    const sent = { name, password, passcode, ...(phone.trim() === '' ? {} : { phone }) };
    if (!createMonitorOnPhoneEndpoint.body.safeParse(sent).success) {
      setProblem(said.incomplete);
      return;
    }
    setCreating(true);
    setProblem(null);
    const reply = await identity.asPhone(createMonitorOnPhoneEndpoint, { json: sent });
    setPasscode('');
    setCreating(false);
    if (reply.kind !== 'answered') {
      setProblem(
        refusalWords(reply, {
          MASTER_PASSCODE_REFUSED: words.refusals.passcode,
          PHONE_NOT_PROVEN: words.phone.standing.notProven,
        }),
      );
      return;
    }
    setPassword('');
    onCreated(reply.answer);
  };

  return (
    <main data-screen="create-monitor" className="screen">
      <StatusStrip standing={{ signedIn: null, waiting: 0, lastSent: null, now: new Date() }} />
      <div className="screen-body">
        <div>
          <Button icon={<Backward />} busy={creating} onPress={onBack}>
            {words.look.back}
          </Button>
        </div>
        <ScreenTitle>{said.title}</ScreenTitle>
        <p>{said.needs}</p>
        <TextEntry label={said.name} value={name} onChange={setName} />
        <TextEntry label={said.passwordLabel} secret value={password} onChange={setPassword} />
        <TextEntry label={said.phone} hint={said.phoneHint} value={phone} onChange={setPhone} />
        <TextEntry label={said.passcode} secret value={passcode} onChange={setPasscode} />
        {problem === null ? null : (
          <Banner tone="problem" announced>
            <p>{problem}</p>
          </Banner>
        )}
      </div>
      <ScreenActions>
        <Button main wide busy={creating} onPress={() => void create()}>
          {creating ? said.creating : said.create}
        </Button>
      </ScreenActions>
    </main>
  );
}
