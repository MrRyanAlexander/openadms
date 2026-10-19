// The shell (BACKLOG 3.1.2, 3.2.2…3.2.4; ADR-565, 572, 574, 575): it opens the phone's store and
// moves between its screens. A phone not yet enrolled shows enrolment; an enrolled one, nobody
// signed in, shows what it is, the sign-in (online, or from its login list) and "Create monitor";
// with a monitor signed in, the work their assignment allows and the bottom menu, until they sign
// out or the phone is left alone too long. Whoever holds the master passcode sets the phone up
// for a monitor with no assignment from the sign-in screen, or straight on from "Monitor created"
// for the monitor just created (task 3.3.1, ADR-576); the sign-in screen then says for whom, their
// Monitor ID filled in. Nothing is shown until the store has said whether the phone is enrolled,
// which takes no network.
import type { MonitorCreatedAnswer } from '@open-adms/contracts';
import { useCallback, useEffect, useState } from 'react';

import { CreateMonitor } from './create-monitor.tsx';
import { Enrol } from './enrol.tsx';
import { MonitorCreated } from './monitor-created.tsx';
import { Phone, type Ended, type SetUpFor } from './phone.tsx';
import type { Enrolment, PhoneIdentity } from './phone/identity.ts';
import type { PhoneLists } from './phone/lists.ts';
import type { LoginList } from './phone/login-list.ts';
import type { MonitorOnPhone, SignedIn } from './phone/monitor.ts';
import type { PhoneSetup, SetupMonitor } from './phone/setup.ts';
import type { SigningIn } from './phone/signing-in.ts';
import type { Server } from './server.ts';
import { Setup } from './setup.tsx';
import { SignedInPhone, type Inactivity } from './signed-in.tsx';

// The phone as the build opens it: who it is to the server, the monitor signed in on it, the
// lists and the login list it holds, how a sign-in goes, and how long it may be left alone.
export interface OpenedPhone {
  readonly identity: PhoneIdentity;
  readonly monitor: MonitorOnPhone;
  readonly lists: PhoneLists;
  readonly loginList: LoginList;
  readonly signingIn: SigningIn;
  readonly setup: PhoneSetup;
  readonly inactivity: Inactivity;
}

type Seen =
  | { readonly screen: 'opening' }
  | { readonly screen: 'enrol' }
  | {
      readonly screen: 'phone';
      readonly enrolment: Enrolment;
      readonly ended: Ended | null;
      readonly setUpFor?: SetUpFor;
    }
  | {
      readonly screen: 'setup';
      readonly enrolment: Enrolment;
      readonly forMonitor: SetupMonitor | null;
    }
  | { readonly screen: 'signedIn'; readonly enrolment: Enrolment; readonly signedIn: SignedIn }
  | { readonly screen: 'createMonitor'; readonly enrolment: Enrolment }
  | {
      readonly screen: 'monitorCreated';
      readonly enrolment: Enrolment;
      readonly created: MonitorCreatedAnswer;
    };

export function Shell({
  server,
  phone,
}: {
  readonly server: Server;
  readonly phone: Promise<OpenedPhone>;
}) {
  const [opened, setOpened] = useState<OpenedPhone | null>(null);
  const [seen, setSeen] = useState<Seen>({ screen: 'opening' });

  useEffect(() => {
    let shown = true;
    void phone.then(async (held) => {
      const [enrolment, signedIn] = await Promise.all([
        held.identity.enrolment(),
        held.monitor.signedIn(),
      ]);
      if (!shown) return;
      setOpened(held);
      if (enrolment === undefined) setSeen({ screen: 'enrol' });
      else if (signedIn === undefined) setSeen({ screen: 'phone', enrolment, ended: null });
      else setSeen({ screen: 'signedIn', enrolment, signedIn });
    });
    return () => {
      shown = false;
    };
  }, [phone]);

  const enrolment = 'enrolment' in seen ? seen.enrolment : undefined;
  const signedOut = useCallback(
    (ended: Ended | null) => {
      if (enrolment !== undefined) setSeen({ screen: 'phone', enrolment, ended });
    },
    [enrolment],
  );

  if (opened === null || seen.screen === 'opening') return null;
  switch (seen.screen) {
    case 'enrol':
      return (
        <Enrol
          server={server}
          identity={opened.identity}
          onEnrolled={(enrolled) => {
            setSeen({ screen: 'phone', enrolment: enrolled, ended: null });
          }}
        />
      );
    case 'phone':
      return (
        <Phone
          enrolment={seen.enrolment}
          identity={opened.identity}
          signingIn={opened.signingIn}
          loginList={opened.loginList}
          ended={seen.ended}
          setUpFor={seen.setUpFor ?? null}
          onSignedIn={(signedIn) => {
            setSeen({ screen: 'signedIn', enrolment: seen.enrolment, signedIn });
          }}
          onCreateMonitor={() => {
            setSeen({ screen: 'createMonitor', enrolment: seen.enrolment });
          }}
          onSetUp={() => {
            setSeen({ screen: 'setup', enrolment: seen.enrolment, forMonitor: null });
          }}
        />
      );
    case 'setup':
      return (
        <Setup
          setup={opened.setup}
          standing={{ signedIn: null, waiting: 0, lastSent: null, now: new Date() }}
          forMonitor={seen.forMonitor}
          onDone={(made, monitor) => {
            setSeen({
              screen: 'phone',
              enrolment: seen.enrolment,
              ended: null,
              setUpFor: {
                name: monitor.name,
                monitorNumber: monitor.monitorNumber,
                project: made.assignment.project.name,
              },
            });
          }}
          onCancel={() => {
            setSeen({ screen: 'phone', enrolment: seen.enrolment, ended: null });
          }}
        />
      );
    case 'signedIn':
      return (
        <SignedInPhone
          enrolment={seen.enrolment}
          monitor={opened.monitor}
          lists={opened.lists}
          loginList={opened.loginList}
          inactivity={opened.inactivity}
          setup={opened.setup}
          signedIn={seen.signedIn}
          onSignedOut={signedOut}
        />
      );
    case 'createMonitor':
      return (
        <CreateMonitor
          identity={opened.identity}
          onCreated={(created) => {
            setSeen({ screen: 'monitorCreated', enrolment: seen.enrolment, created });
          }}
          onBack={() => {
            setSeen({ screen: 'phone', enrolment: seen.enrolment, ended: null });
          }}
        />
      );
    case 'monitorCreated':
      return (
        <MonitorCreated
          created={seen.created}
          onAnother={() => {
            setSeen({ screen: 'createMonitor', enrolment: seen.enrolment });
          }}
          onSetUp={() => {
            const { userId, monitorNumber, name } = seen.created;
            setSeen({
              screen: 'setup',
              enrolment: seen.enrolment,
              forMonitor: { monitorId: userId, monitorNumber, name },
            });
          }}
          onDone={() => {
            setSeen({ screen: 'phone', enrolment: seen.enrolment, ended: null });
          }}
        />
      );
  }
}
