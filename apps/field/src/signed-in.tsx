// A phone with a monitor signed in (ARCHITECTURE §7.1, §7.2; BACKLOG 3.2.3, C114, C115, C117;
// ADR-240, 444, 450, 573, 574): the bottom menu (Q-217: Work, Time where the project has the time
// clock on, Sync, Settings) over three places. **Work** is home for the assignment the phone took
// (its project, its one site, a button for each work it allows, AC-11-18), or the words for why
// there is none, offering the master passcode's setup for the monitor signed in (AC-11-15, 24;
// task 3.3.1, ADR-576): set up, the lists are read again and home is the assignment made.
// **Sync** says how stale the lists are and refreshes them; **Settings** says who is signed in on
// which phone and signs them out. The lists are read on signing in, and again whenever the phone
// finds a connection or comes back to the front (AC-11-16); told there is no assignment, the
// phone keeps the lists it holds. A request answered `NOT_SIGNED_IN` sends the monitor back to
// sign in, keeping everything the phone holds (AC-11-14). Time joins the menu with the time
// clock's task (3.7.1), which tells the phone whether the project has it on.
//
// With every read of the lists the login list is read too (AC-02-41; task 3.2.4, ADR-575), and a
// sign-in made with no connection is reported before either (AC-11-21): refused, the monitor is
// sent back to sign in online. **Left alone for the policy's minutes, the phone signs them out**
// (AC-02-40, AC-11-20, 64), warning the policy's seconds before so one tap keeps the session
// (WCAG 2.2.1); nothing on the phone not yet submitted is touched.
import { useCallback, useEffect, useRef, useState } from 'react';

import { Home } from './home.tsx';
import { Banner, BottomMenu, Button, StatusStrip, type MenuItem } from './look/index.ts';
import type { Ended } from './phone.tsx';
import type { Enrolment } from './phone/identity.ts';
import type { HeldLists, ListsRead, PhoneLists } from './phone/lists.ts';
import type { LoginList } from './phone/login-list.ts';
import type { MonitorOnPhone, SignedIn } from './phone/monitor.ts';
import type { PhoneSetup } from './phone/setup.ts';
import { worksOf } from './phone/works.ts';
import { refusalWords } from './refusals.ts';
import { Setup } from './setup.tsx';
import { counted, lastSynced, say, words } from './words.ts';

// How long the phone may be left alone, in minutes, and how long before the end it warns, in
// seconds (the policy's).
export interface Inactivity {
  readonly lockMinutes: number;
  readonly warningSeconds: number;
}

const menu: readonly MenuItem[] = ['work', 'sync', 'settings'];

export function SignedInPhone({
  enrolment,
  monitor,
  lists,
  loginList,
  inactivity,
  setup,
  signedIn: first,
  onSignedOut,
}: {
  readonly enrolment: Enrolment;
  readonly monitor: MonitorOnPhone;
  readonly lists: PhoneLists;
  readonly loginList: LoginList;
  readonly inactivity: Inactivity;
  readonly setup: PhoneSetup;
  readonly signedIn: SignedIn;
  // Signed out by the monitor (nothing to say), or why the sign-in ended under them.
  readonly onSignedOut: (ended: Ended | null) => void;
}) {
  const [signedIn, setSignedIn] = useState(first);
  const [held, setHeld] = useState<HeldLists | undefined>(undefined);
  const [place, setPlace] = useState<MenuItem>('work');
  const [reading, setReading] = useState(false);
  const [lastRead, setLastRead] = useState<ListsRead | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [warned, setWarned] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const lastTouched = useRef(Date.now());
  // Whether these screens are still the monitor's: a read that ends after they signed out, or
  // after the lock, says nothing.
  const theirs = useRef(true);

  // The lists read now, then the login list: what the server answered is kept, and the screen
  // shows it.
  const read = useCallback(async () => {
    setReading(true);
    const answered = await lists.read();
    if (answered.kind === 'taken' || answered.kind === 'none') await loginList.read(monitor);
    // A sign-in the server no longer took was dropped by the read: the monitor signs in again.
    const [session, kept] = await Promise.all([monitor.signedIn(), lists.held()]);
    if (!theirs.current) return;
    if (session === undefined) {
      theirs.current = false;
      const refused = answered.kind === 'refused' && answered.code === 'SIGN_IN_REFUSED';
      onSignedOut({ why: refused ? 'offlineRefused' : 'ended' });
      return;
    }
    setSignedIn(session);
    setHeld(kept);
    setLastRead(answered);
    setNow(new Date());
    setReading(false);
  }, [lists, loginList, monitor, onSignedOut]);

  // On signing in, and again whenever the phone finds a connection or comes back to the front.
  useEffect(() => {
    void read();
    const again = () => {
      if (document.visibilityState === 'visible') void read();
    };
    window.addEventListener('online', again);
    document.addEventListener('visibilitychange', again);
    return () => {
      window.removeEventListener('online', again);
      document.removeEventListener('visibilitychange', again);
    };
  }, [read]);
  useEffect(() => {
    theirs.current = true;
    return () => {
      theirs.current = false;
    };
  }, []);

  // The lock after inactivity: a touch or a key anywhere is something done; past the warning's
  // moment the warning shows, and at the end the monitor is signed out.
  useEffect(() => {
    const touched = () => {
      lastTouched.current = Date.now();
      setWarned(false);
    };
    document.addEventListener('pointerdown', touched);
    document.addEventListener('keydown', touched);
    const lockAfter = inactivity.lockMinutes * 60_000;
    const warnAfter = lockAfter - inactivity.warningSeconds * 1000;
    const checking = window.setInterval(() => {
      const quiet = Date.now() - lastTouched.current;
      if (quiet < lockAfter) {
        setWarned(quiet >= warnAfter);
        return;
      }
      if (!theirs.current) return;
      theirs.current = false;
      void monitor.signOut().then(() => {
        onSignedOut({ why: 'inactive', minutes: inactivity.lockMinutes });
      });
    }, 1000);
    return () => {
      document.removeEventListener('pointerdown', touched);
      document.removeEventListener('keydown', touched);
      window.clearInterval(checking);
    };
  }, [inactivity, monitor, onSignedOut]);

  const signOut = async () => {
    theirs.current = false;
    setSigningOut(true);
    await monitor.signOut();
    onSignedOut(null);
  };

  const standing = {
    signedIn: signedIn.name,
    waiting: 0,
    lastSent: null,
    now,
    ...(signedIn.assignment === null ? {} : { timeZone: signedIn.assignment.project.timeZone }),
  };
  const synced = lastSynced(held?.readAt, now);
  const unread =
    lastRead !== null && lastRead.kind !== 'taken' && lastRead.kind !== 'none'
      ? refusalWords(lastRead)
      : null;
  const warning = warned ? (
    <div className="screen-warning">
      <Banner tone="notice" announced>
        <p>{counted(words.work.inactivity.warning, inactivity.warningSeconds)}</p>
      </Banner>
      <Button
        main
        wide
        onPress={() => {
          lastTouched.current = Date.now();
          setWarned(false);
        }}
      >
        {words.work.inactivity.stay}
      </Button>
    </div>
  ) : null;
  const bottom = (
    <>
      {warning}
      <BottomMenu items={menu} current={place} onPick={setPlace} />
    </>
  );

  if (settingUp) {
    return (
      <>
        <Setup
          setup={setup}
          standing={standing}
          forMonitor={{
            monitorId: signedIn.userId,
            monitorNumber: signedIn.monitorNumber,
            name: signedIn.name,
          }}
          onDone={() => {
            setSettingUp(false);
            void read();
          }}
          onCancel={() => {
            setSettingUp(false);
          }}
        />
        {warning}
      </>
    );
  }

  if (place === 'work' && signedIn.assignment !== null) {
    const { assignment } = signedIn;
    return (
      <Home
        standing={standing}
        project={assignment.project.name}
        site={assignment.site?.name ?? null}
        works={worksOf(assignment)}
        after={bottom}
      >
        <p>{synced}</p>
      </Home>
    );
  }

  if (place === 'work') {
    const said = words.work;
    return (
      <main data-screen="no-assignment" className="screen">
        <StatusStrip standing={standing} />
        <div className="screen-body">
          <h1>{words.home.title}</h1>
          <Banner tone="notice">
            <p>{said.noAssignment[signedIn.noAssignment ?? 'NONE_THAT_DAY']}</p>
          </Banner>
          {held === undefined ? null : (
            <p>{say(said.held, { project: held.assignment.project.name })}</p>
          )}
          <p role="status">{reading ? said.checking : synced}</p>
          {unread === null ? null : <p>{unread}</p>}
        </div>
        <div className="screen-actions">
          <Button main wide isDisabled={reading} onPress={() => void read()}>
            {reading ? said.checking : said.checkAgain}
          </Button>
          <Button
            wide
            isDisabled={reading}
            onPress={() => {
              setSettingUp(true);
            }}
          >
            {said.setUp}
          </Button>
        </div>
        {bottom}
      </main>
    );
  }

  if (place === 'sync') {
    const said = words.sync;
    return (
      <main data-screen="sync" className="screen">
        <StatusStrip standing={standing} />
        <div className="screen-body">
          <h1>{said.title}</h1>
          <p>
            {held === undefined
              ? said.noLists
              : say(said.lists, {
                  project: held.assignment.project.name,
                  version: held.lists.setupVersion,
                })}
          </p>
          <p role="status">{reading ? said.refreshing : (unread ?? synced)}</p>
        </div>
        <div className="screen-actions">
          <Button main wide isDisabled={reading} onPress={() => void read()}>
            {reading ? said.refreshing : said.refresh}
          </Button>
        </div>
        {bottom}
      </main>
    );
  }

  const said = words.settings;
  return (
    <main data-screen="settings" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <h1>{said.title}</h1>
        <p>
          {say(said.signedInAs, { name: signedIn.name, monitorNumber: signedIn.monitorNumber })}
        </p>
        {signedIn.offline ? <p>{said.offline}</p> : null}
        <p>{say(said.phone, { name: enrolment.name })}</p>
      </div>
      <div className="screen-actions">
        <Button main wide isDisabled={signingOut} onPress={() => void signOut()}>
          {signingOut ? said.signingOut : said.signOut}
        </Button>
      </div>
      {bottom}
    </main>
  );
}
