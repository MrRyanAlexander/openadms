// A phone with a monitor signed in (ARCHITECTURE §7.1, §7.2; BACKLOG 3.2.3, C114, C115, C117;
// ADR-240, 444, 450, 573, 574): the bottom menu (Q-217: Work, Time where the project has the time
// clock on, Sync, Settings) over three places. **Work** is home for the assignment the phone took
// (its project, its one site, a button for each work it allows, AC-11-18), or the words for why
// there is none, offering the master passcode's setup for the monitor signed in (AC-11-15, 24;
// task 3.3.1, ADR-576): set up, the lists are read again and home is the assignment made.
// **Sync** says when the phone last synced, what of its own the server didn't take, in the server's
// words (AC-05-46, AC-11-31), and how stale the lists are, and syncs on asking; **Settings** says
// who is signed in on which phone and signs them out. **The phone syncs** (task 3.4.1, ADR-578) on
// signing in, whenever it finds a connection or comes back to the front, **every few minutes on its
// own** (the policy's, five as shipped: the user, ADR-588; AC-11-89), and on asking, then reads
// the lists (AC-11-16; coming back to the front and on its own, only where the sync says they
// moved); told there is no assignment, the phone keeps the lists it holds. A request answered `NOT_SIGNED_IN` sends
// the monitor back to sign in, keeping everything the phone holds (AC-11-14). Every screen's strip
// says how much waits to go and when the phone last synced. **Time** is in the menu, and the
// strip says where the worker stands on its clock, only where the phone holds its assignment and
// its lists say the project has the time clock on (task 3.7.2, ADR-598, 601; C177).
//
// With every read of the lists the login list is read too (AC-02-41; task 3.2.4, ADR-575), and a
// sign-in made with no connection is reported before the sync (AC-11-21): refused, the monitor is
// sent back to sign in online. **Left alone for the policy's minutes, the phone signs them out**
// (AC-02-40, AC-11-20, 64), warning the policy's seconds before so one tap keeps the session
// (WCAG 2.2.1); nothing on the phone not yet submitted is touched.
//
// Task 3.3.2 (ADR-577): a session under the master passcode is shown as the passcode's on every
// screen (the status strip) and in Settings, and ends when its time comes by the phone's clock,
// with no signal too (a temporary one at midnight in the project's time zone, AC-11-26). Settings
// hands the phone over to another monitor and moves it to another site, each under the passcode
// (AC-02-46, 47, AC-11-27); handed over, or the phone locked by the passcode's tenth wrong try
// with no signal, the monitor is signed out and the sign-in screen says why.
//
// Task 3.4.3 (ADR-580): Settings offers "Sync and turn in" under the master passcode, the monitor
// still signed in; so does Sync, where the server no longer takes the phone's key alone (revoked by
// the firm's time, AC-11-35).
//
// Task 3.5.1 (ADR-571, 573, 581): home starts a collection where the assignment makes them, lists
// the monitor's open tickets, each opened where it was left, and says their own count of today's
// tickets; the capture's screens take the place of the menu until the monitor goes home. The lock
// after inactivity watches them too; nothing a ticket holds is lost to it. Task 3.5.2 (ADR-582):
// home starts a disposal, a haul-out's collection and a haul-out's disposal the same way. Task
// 3.5.3 (ADR-583): unit rate work too, a crew's open tickets named by the crew, and where its
// work is photographed by stage, the next stage to do (ADR-590). Task 3.5.5
// (ADR-585): certifying, an open certification named by its number. Task 3.6.2 (ADR-595): home
// prints any receipt again, of the monitor's tickets and certifications submitted on the project
// on this phone, and nothing is recorded of it. Task 3.6.3 (ADR-596): home's "Scan a barcode"
// says what the phone holds of the monitor's under a number scanned back, and nothing is recorded
// of it either.
//
// Task 3.7.2 (ADR-241, 601; AC-02-50…52): the time clock where the project has it on. Time enters
// a clock-in, a break and a clock-out by hand on the assignment; the clock-out shows the day's
// activity, pre-filled from the worker's field events, to change and approve. **The two nudges,
// never a stop:** starting a field event from home while not clocked in asks "You’re not clocked
// in. Clock in now?" and the work starts either way; Settings' "Sign out" while clocked in (or on
// a break) asks "Clock out?", which clocks out first or signs out still clocked in. Opening a
// ticket left open is no start, and the lock after inactivity, a handover and a session's end
// sign out with no nudge: nobody is there to answer it.
import type { ClockStanding } from '@open-adms/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CertificationCapture,
  certificationStarted,
  certificationTitle,
  type Certifying,
} from './certify.tsx';
import { ClockInNudge, ClockOut, ClockOutNudge, TimeClock } from './clock.tsx';
import { FormCapture, formBegun, formStarted, formTitle, type Filling } from './forms.tsx';
import { Home } from './home.tsx';
import {
  Banner,
  BottomMenu,
  Button,
  ScannerKeysAnywhere,
  ScreenActions,
  ScreenTitle,
  StatusStrip,
  Toggle,
  type MenuItem,
} from './look/index.ts';
import { Move } from './move.tsx';
import { certificationReceipt, ticketReceipt } from './phone/printing.ts';
import { ReceiptsToPrint, type Reprintable } from './printing.tsx';
import { scannedBack } from './phone/scanning.ts';
import { ScanBack } from './scan.tsx';
import type { Ended, SetUpFor } from './phone.tsx';
import type { ClockOf, PhoneClock } from './phone/clock.ts';
import type { Enrolment } from './phone/identity.ts';
import type { HeldLists, PhoneLists } from './phone/lists.ts';
import type { MonitorOnPhone, SignedIn } from './phone/monitor.ts';
import type { NotSavedShown, PhoneOutbox } from './phone/outbox.ts';
import type { PhoneSettings } from './phone/settings.ts';
import type { PhoneSetup } from './phone/setup.ts';
import { SignedInRuns } from './phone/signed-in-runs.ts';
import type { ListsAfter, PhoneSync, SyncRun } from './phone/sync.ts';
import { workOfForm, workOfKind, worksOf, type Work } from './phone/works.ts';
import type { NotAnswered } from './server.ts';
import { refusalWords } from './refusals.ts';
import { Setup } from './setup.tsx';
import {
  TicketCapture,
  type CaptureParts,
  type CapturedKind,
  type Capturing,
} from './ticket-capture.tsx';
import { stagesLeft } from './unit-rate.tsx';
import { counted, lastSynced, listsRead, say, timeOfDay, words } from './words.ts';

// How long the phone may be left alone, in minutes, and how long before the end it warns, in
// seconds (the policy's).
export interface Inactivity {
  readonly lockMinutes: number;
  readonly warningSeconds: number;
}

// The bottom menu (Q-217): Time only where the project has the time clock on.
const menu: readonly MenuItem[] = ['work', 'sync', 'settings'];
const menuWithTime: readonly MenuItem[] = ['work', 'time', 'sync', 'settings'];

// Where the worker stands, as the status strip says it.
const stripClock: Readonly<Record<ClockStanding, 'in' | 'break' | 'out'>> = {
  IN: 'in',
  BREAK: 'break',
  OUT: 'out',
};

// The works whose capture is built, each the kind of field event it starts.
const captured: ReadonlyMap<Work, CapturedKind> = new Map(
  (
    ['COLLECTION', 'DISPOSAL', 'HAUL_OUT_COLLECTION', 'HAUL_OUT_DISPOSAL', 'UNIT_RATE'] as const
  ).map((kind) => [workOfKind[kind], kind]),
);

// The works that are forms that are no ticket's, each the form it starts (task 3.5.4, ADR-584).
const formed: ReadonlyMap<Work, keyof typeof workOfForm> = new Map(
  (['ROE', 'SURVEY', 'INCIDENT', 'DROP_OFF_LOG'] as const).map((form) => [workOfForm[form], form]),
);

// What a run came to that the screen says: nothing, where it synced and its lists were read or
// were the same; otherwise the request it stopped at.
function stoppedAt(run: SyncRun | null): NotAnswered | null {
  if (run === null || run.kind === 'nobodySignedIn') return null;
  if (run.kind !== 'synced') return run;
  const { lists } = run;
  return lists === 'same' || lists.kind === 'taken' || lists.kind === 'none' ? null : lists;
}

// What one thing not saved is, in the screen's words.
function whatNotSaved(shown: NotSavedShown): string {
  const what = words.sync.what;
  if (shown.kind !== 'record') return what[shown.kind];
  const { record } = shown;
  switch (record.record) {
    case 'FIELD_EVENT': {
      const { ticketNumber, splitSuffix } = record.fieldEvent;
      return `${say(what.FIELD_EVENT, { number: `${ticketNumber}${splitSuffix}` })}, ${words.sync.fieldEvent[record.fieldEvent.kind]}`;
    }
    case 'SCALE_RECEIPT':
      return say(what.SCALE_RECEIPT, { number: record.scaleReceipt.receiptNumber });
    case 'ROE':
      return say(what.ROE, { number: record.roe.roeNumber });
    case 'CERTIFICATION':
      return say(what.CERTIFICATION, { number: record.certification.certNumber });
    default:
      return what[record.record];
  }
}

// The signed-in phone with its own settings given to every screen (BUILD.md, settled 7): a scan
// field takes a scanner's keys anywhere on its screen unless the phone's setting says otherwise.
export function SignedInPhone({
  settings,
  ...rest
}: { readonly settings: PhoneSettings } & Omit<
  Parameters<typeof SignedInScreens>[0],
  'scannerKeysAnywhere' | 'onScannerKeysAnywhere'
>) {
  const [scannerKeysAnywhere, setScannerKeysAnywhere] = useState(
    () => settings.now().scannerKeysAnywhere,
  );
  return (
    <ScannerKeysAnywhere.Provider value={scannerKeysAnywhere}>
      <SignedInScreens
        {...rest}
        scannerKeysAnywhere={scannerKeysAnywhere}
        onScannerKeysAnywhere={(on) => {
          void settings.keep({ scannerKeysAnywhere: on }).then((kept) => {
            setScannerKeysAnywhere(kept.scannerKeysAnywhere);
          });
        }}
      />
    </ScannerKeysAnywhere.Provider>
  );
}

function SignedInScreens({
  scannerKeysAnywhere,
  onScannerKeysAnywhere,
  enrolment,
  monitor,
  lists,
  sync,
  outbox,
  capture,
  clock,
  inactivity,
  syncEveryMinutes,
  setup,
  signedIn: first,
  onSignedOut,
  onHandedOver,
  onTurnIn,
}: {
  readonly scannerKeysAnywhere: boolean;
  readonly onScannerKeysAnywhere: (on: boolean) => void;
  readonly enrolment: Enrolment;
  readonly monitor: MonitorOnPhone;
  readonly lists: PhoneLists;
  readonly sync: PhoneSync;
  readonly outbox: PhoneOutbox;
  readonly capture: CaptureParts;
  // The worker's own time clock (task 3.7.2).
  readonly clock: PhoneClock;
  readonly inactivity: Inactivity;
  readonly syncEveryMinutes: number;
  readonly setup: PhoneSetup;
  readonly signedIn: SignedIn;
  // Signed out by the monitor (nothing to say), or why the sign-in ended under them.
  readonly onSignedOut: (ended: Ended | null) => void;
  // Handed over to another monitor under the passcode, or set up for them: the phone is theirs.
  readonly onHandedOver: (to: SetUpFor) => void;
  // "Sync and turn in" asked for, the monitor signed in as they are now.
  readonly onTurnIn: (signedIn: SignedIn) => void;
}) {
  const [signedIn, setSignedIn] = useState(first);
  const [held, setHeld] = useState<HeldLists | undefined>(undefined);
  const [place, setPlace] = useState<MenuItem>('work');
  const [reading, setReading] = useState(false);
  const [lastRun, setLastRun] = useState<SyncRun | null>(null);
  const [lastSync, setLastSync] = useState<Date | undefined>(undefined);
  const [waiting, setWaiting] = useState(() => outbox.waiting());
  const [files, setFiles] = useState(() => outbox.filesWaiting());
  const [notSaved, setNotSaved] = useState<readonly NotSavedShown[]>(() => outbox.notSaved());
  const [signingOut, setSigningOut] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [warned, setWarned] = useState(false);
  const [settingUp, setSettingUp] = useState<'setUp' | 'handOver' | null>(null);
  const [moving, setMoving] = useState(false);
  const [capturing, setCapturing] = useState<Capturing | null>(null);
  const [filling, setFilling] = useState<Filling | null>(null);
  const [certifying, setCertifying] = useState<Certifying | null>(null);
  const [reprinting, setReprinting] = useState(false);
  const [scanningBack, setScanningBack] = useState(false);
  const [numbersLow, setNumbersLow] = useState(false);
  // A nudge of the time clock's being asked: on starting a field event, or on signing out.
  const [nudge, setNudge] = useState<
    { readonly at: 'start'; readonly work: Work } | 'signOut' | null
  >(null);
  // The clock-out's screens, and what follows them: Time again, or the sign-out.
  const [clockingOut, setClockingOut] = useState<'time' | 'signOut' | null>(null);
  const lastTouched = useRef(Date.now());
  // Whether these screens are still the monitor's: a read that ends after they signed out, or
  // after the lock, says nothing.
  const theirs = useRef(true);

  // The phone syncs now, then reads the lists and the login list: what the server answered is
  // kept, and the screen shows it. A sign-in the server no longer took was dropped by the run: the
  // monitor signs in again. A session ended on this phone meanwhile (a sign-out, the lock, a
  // handover) is that act's to follow, never the run's (`SignedInRuns`).
  const runs = useMemo(() => new SignedInRuns({ sync, monitor, lists }), [sync, monitor, lists]);
  const read = useCallback(
    async (after: ListsAfter = 'read') => {
      setReading(true);
      const outcome = await runs.run(after);
      if (!theirs.current || outcome.kind === 'overtaken') return;
      if (outcome.kind === 'signedOut') {
        theirs.current = false;
        onSignedOut({ why: outcome.why });
        return;
      }
      const { session, held: kept, lastSynced: synced, ran } = outcome;
      setSignedIn(session);
      setHeld(kept);
      setLastRun(ran);
      setLastSync(synced);
      setWaiting(outbox.waiting());
      setFiles(outbox.filesWaiting());
      setNotSaved(outbox.notSaved());
      setNow(new Date());
      setReading(false);
    },
    [onSignedOut, outbox, runs],
  );

  // On signing in, and again whenever the phone finds a connection or comes back to the front.
  useEffect(() => {
    void read();
    const online = () => void read();
    const front = () => {
      if (document.visibilityState === 'visible') void read('unlessMoved');
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', front);
    return () => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', front);
    };
  }, [read]);
  // And on its own every few minutes (the user, ADR-588), signal or not: a try with none stops at
  // once and keeps everything, and a run already under way is shared, never sent twice.
  useEffect(() => {
    const every = window.setInterval(() => {
      void read('unlessMoved');
    }, syncEveryMinutes * 60_000);
    return () => {
      window.clearInterval(every);
    };
  }, [read, syncEveryMinutes]);
  useEffect(() => {
    theirs.current = true;
    return () => {
      theirs.current = false;
    };
  }, []);

  // Whether fewer than two days' worth of numbers are left (ADR-065): read again whenever the
  // lists are, and on coming back from the capture.
  useEffect(() => {
    const kinds = signedIn.assignment?.fieldEventKinds ?? [];
    // The series this work makes numbers of: a collection the load series, a haul-out's
    // collection the haul-out series, unit rate work its own.
    const madeOf = [
      ...(kinds.includes('COLLECTION') ? (['LOAD'] as const) : []),
      ...(kinds.includes('HAUL_OUT_COLLECTION') ? (['HAUL_OUT'] as const) : []),
      ...(kinds.includes('UNIT_RATE') ? (['UNIT_RATE'] as const) : []),
    ];
    if (capturing !== null || madeOf.length === 0) return;
    let shown = true;
    void Promise.all(madeOf.map((workflow) => capture.tickets.low(workflow))).then((low) => {
      if (shown) setNumbersLow(low.some(Boolean));
    });
    return () => {
      shown = false;
    };
  }, [capture, capturing, held, signedIn]);

  // The lock after inactivity: a touch or a key anywhere is something done; past the warning's
  // moment the warning shows, and at the end the monitor is signed out. Heard as the event comes
  // down to its target, before it: a button's press stops it rising again (React Aria's), and a
  // monitor working by its buttons alone is working all the same.
  useEffect(() => {
    const touched = () => {
      lastTouched.current = Date.now();
      setWarned(false);
    };
    document.addEventListener('pointerdown', touched, true);
    document.addEventListener('keydown', touched, true);
    const lockAfter = inactivity.lockMinutes * 60_000;
    const warnAfter = lockAfter - inactivity.warningSeconds * 1000;
    const checking = window.setInterval(() => {
      // The session's own end, by the phone's clock (AC-11-26).
      if (Date.now() >= signedIn.until.getTime() && theirs.current) {
        theirs.current = false;
        const temporary = signedIn.masterPasscodeSession === 'TEMPORARY';
        void monitor.signOut().then(() => {
          onSignedOut({ why: temporary ? 'temporaryEnded' : 'ended' });
        });
        return;
      }
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
      document.removeEventListener('pointerdown', touched, true);
      document.removeEventListener('keydown', touched, true);
      window.clearInterval(checking);
    };
  }, [inactivity, monitor, onSignedOut, signedIn]);

  const signOut = async () => {
    theirs.current = false;
    setSigningOut(true);
    await monitor.signOut();
    onSignedOut(null);
  };

  // The lists held of the assignment's project, which the capture's screens work from.
  const heldNow =
    held !== undefined && held.assignment.project.id === signedIn.assignment?.project.id
      ? held
      : undefined;
  // The worker's clock on the assignment, where the project has the time clock on.
  const clockOf: ClockOf | null =
    signedIn.assignment !== null && heldNow?.lists.timeClock.enabled === true
      ? { workerId: signedIn.userId, assignment: signedIn.assignment }
      : null;
  const clockStanding = clockOf === null ? null : clock.standing(clockOf);
  const shownPlace = place === 'time' && clockOf === null ? 'work' : place;

  const marked = signedIn.masterPasscodeSession;
  const standing = {
    signedIn:
      marked === null
        ? signedIn.name
        : say(words.look.strip.underPasscode[marked], { name: signedIn.name }),
    waiting,
    sending: reading,
    lastSent: lastSync ?? null,
    now,
    ...(signedIn.assignment === null ? {} : { timeZone: signedIn.assignment.project.timeZone }),
    ...(clockStanding === null ? {} : { clock: stripClock[clockStanding] }),
  };
  const synced = lastSynced(lastSync, now);
  const stale = listsRead(held?.readAt, now);
  const stopped = stoppedAt(lastRun);
  const unread = stopped === null ? null : refusalWords(stopped);
  const passcodeNeeded = stopped?.kind === 'refused' && stopped.code === 'MASTER_PASSCODE_NEEDED';
  const turnIn = () => {
    theirs.current = false;
    onTurnIn(signedIn);
  };
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
      <BottomMenu
        items={clockOf === null ? menu : menuWithTime}
        current={shownPlace}
        onPick={setPlace}
      />
    </>
  );

  // Passed on, or locked: the monitor signed out already by the phone; these screens are done.
  const handedTo = (to: SetUpFor) => {
    theirs.current = false;
    onHandedOver(to);
  };
  const locked = () => {
    theirs.current = false;
    onSignedOut({ why: 'phoneLocked' });
  };

  if (settingUp !== null) {
    const handingOver = settingUp === 'handOver';
    return (
      <>
        <Setup
          setup={setup}
          standing={standing}
          forMonitor={
            handingOver
              ? null
              : {
                  monitorId: signedIn.userId,
                  monitorNumber: signedIn.monitorNumber,
                  name: signedIn.name,
                }
          }
          handingOver={handingOver}
          onDone={(made, to) => {
            setSettingUp(null);
            if (to.monitorId === signedIn.userId) {
              void read();
              return;
            }
            const { name, monitorNumber } = to;
            handedTo({ name, monitorNumber, project: made.assignment.project.name });
          }}
          onHandedOver={({ name, monitorNumber }) => {
            handedTo({ name, monitorNumber, project: null });
          }}
          onLocked={locked}
          onCancel={() => {
            setSettingUp(null);
          }}
        />
        {warning}
      </>
    );
  }

  if (moving && signedIn.assignment !== null) {
    return (
      <>
        <Move
          setup={setup}
          standing={standing}
          project={signedIn.assignment.project.name}
          currentSiteId={signedIn.assignment.site?.id ?? null}
          onDone={() => {
            setMoving(false);
            setPlace('work');
            void read();
          }}
          onLocked={locked}
          onCancel={() => {
            setMoving(false);
          }}
        />
        {warning}
      </>
    );
  }

  // A work started from home: a field event's capture, a certification or a form.
  const started = (work: Work) => {
    const kind = captured.get(work);
    if (kind !== undefined) setCapturing({ at: 'new', kind });
    if (work === 'certification') setCertifying({ at: 'new' });
    const form = formed.get(work);
    const { assignment } = signedIn;
    if (form === undefined || heldNow === undefined || assignment === null) return;
    // A drop-off log picks nothing first: it opens straight away (ADR-584).
    if (form === 'DROP_OFF_LOG') {
      void capture.forms.begin(formBegun(form, signedIn, assignment, heldNow)).then((begun) => {
        setFilling({ at: 'fill', id: begun.id });
      });
    } else setFilling({ at: 'new', kind: form });
  };

  // The time clock's nudges and its clock-out (task 3.7.2).
  if (nudge === 'signOut' && clockOf !== null) {
    return (
      <ClockOutNudge
        standing={standing}
        onClockOut={() => {
          setNudge(null);
          setClockingOut('signOut');
        }}
        onSignOut={() => {
          setNudge(null);
          void signOut();
        }}
        onBack={() => {
          setNudge(null);
        }}
        after={warning}
      />
    );
  }
  if (nudge !== null && nudge !== 'signOut' && clockOf !== null) {
    return (
      <ClockInNudge
        clock={clock}
        of={clockOf}
        standing={standing}
        onGoOn={() => {
          setNudge(null);
          setWaiting(outbox.waiting());
          started(nudge.work);
        }}
        after={warning}
      />
    );
  }
  if (clockingOut !== null && clockOf !== null && heldNow !== undefined) {
    const then = clockingOut;
    return (
      <ClockOut
        clock={clock}
        of={clockOf}
        activities={heldNow.lists.timeClock.activities}
        standing={standing}
        signsOut={then === 'signOut'}
        onDone={() => {
          setClockingOut(null);
          setWaiting(outbox.waiting());
          if (then === 'signOut') void signOut();
          else setPlace('time');
        }}
        onBack={() => {
          setClockingOut(null);
        }}
        after={warning}
      />
    );
  }

  // The capture's screens, for the lists held of the assignment's project (task 3.5.1).
  if (capturing !== null && signedIn.assignment !== null && heldNow !== undefined) {
    return (
      <TicketCapture
        parts={capture}
        signedIn={signedIn}
        assignment={signedIn.assignment}
        held={heldNow}
        standing={standing}
        start={capturing}
        onHome={() => {
          setCapturing(null);
          setWaiting(outbox.waiting());
          setPlace('work');
        }}
        after={warning}
      />
    );
  }

  // A form's screens, for the lists held of the assignment's project (task 3.5.4).
  if (filling !== null && signedIn.assignment !== null && heldNow !== undefined) {
    return (
      <FormCapture
        parts={capture}
        signedIn={signedIn}
        assignment={signedIn.assignment}
        held={heldNow}
        standing={standing}
        start={filling}
        onHome={() => {
          setFilling(null);
          setWaiting(outbox.waiting());
          setPlace('work');
        }}
        after={warning}
      />
    );
  }

  // A certification's screens, for the lists held of the assignment's project (task 3.5.5).
  if (certifying !== null && signedIn.assignment !== null && heldNow !== undefined) {
    return (
      <CertificationCapture
        parts={capture}
        signedIn={signedIn}
        assignment={signedIn.assignment}
        held={heldNow}
        standing={standing}
        start={certifying}
        onHome={() => {
          setCertifying(null);
          setWaiting(outbox.waiting());
          setPlace('work');
        }}
        after={warning}
      />
    );
  }

  // A receipt printed again (task 3.6.2): the monitor's own, of the assignment's project.
  if (reprinting && signedIn.assignment !== null && heldNow !== undefined) {
    const { assignment } = signedIn;
    const project = assignment.project;
    const monitor = { name: signedIn.name, monitorNumber: signedIn.monitorNumber };
    const receipts: Reprintable[] = [
      ...capture.tickets.submittedOf(signedIn.userId, project.id).map((ticket) => ({
        id: ticket.id,
        receipt: ticketReceipt(ticket, heldNow.lists, project.name, monitor),
        closedAt: ticket.closedAt ?? ticket.startedAt,
        timeZone: ticket.timeZone,
      })),
      ...capture.certifications.submittedOf(signedIn.userId, project.id).map((one) => ({
        id: one.id,
        receipt: certificationReceipt(one, heldNow.lists, project.name, monitor),
        closedAt: one.closedAt ?? one.certifiedAt,
        timeZone: one.timeZone,
      })),
    ].sort((one, other) => other.closedAt.localeCompare(one.closedAt));
    return (
      <ReceiptsToPrint
        printer={capture.printer}
        standing={standing}
        receipts={receipts}
        onBack={() => {
          setReprinting(false);
        }}
        below={warning}
      />
    );
  }

  // A number scanned back (task 3.6.3): what the phone holds of the monitor's under it, on the
  // assignment's project, never asked of the server.
  if (scanningBack && signedIn.assignment !== null && heldNow !== undefined) {
    const projectId = signedIn.assignment.project.id;
    return (
      <ScanBack
        camera={capture.camera}
        standing={standing}
        find={(number) =>
          scannedBack(number, {
            tickets: capture.tickets.numbered(signedIn.userId, projectId, number),
            certifications: capture.certifications.numbered(signedIn.userId, projectId, number),
            lists: heldNow.lists,
          })
        }
        onBack={() => {
          setScanningBack(false);
        }}
        below={warning}
      />
    );
  }

  if (shownPlace === 'time' && clockOf !== null) {
    return (
      <TimeClock
        clock={clock}
        of={clockOf}
        standing={standing}
        onEntered={() => {
          setWaiting(outbox.waiting());
        }}
        onClockOut={() => {
          setClockingOut('time');
        }}
        after={bottom}
      />
    );
  }

  if (shownPlace === 'work' && signedIn.assignment !== null) {
    const { assignment } = signedIn;
    const { tickets, forms, certifications } = capture;
    const submitted =
      tickets.submittedOf(signedIn.userId, assignment.project.id).length > 0 ||
      certifications.submittedOf(signedIn.userId, assignment.project.id).length > 0;
    const open = tickets
      .openOf(signedIn.userId)
      .filter((ticket) => ticket.projectId === assignment.project.id);
    const openForms = forms
      .openOf(signedIn.userId)
      .filter((form) => form.projectId === assignment.project.id);
    const openCertifications = certifications
      .openOf(signedIn.userId)
      .filter((certification) => certification.projectId === assignment.project.id);
    const said = words.home.open;
    // A drop-off log is made at the assignment's site: with none, it isn't started.
    const startsForms = [...formed.entries()]
      .filter(([, form]) => form !== 'DROP_OFF_LOG' || assignment.site !== null)
      .map(([work]) => work);
    return (
      <Home
        standing={standing}
        project={assignment.project.name}
        site={assignment.site?.name ?? null}
        works={worksOf(assignment)}
        startable={
          heldNow === undefined ? [] : [...captured.keys(), 'certification', ...startsForms]
        }
        onStart={(work) => {
          // A field event started while not clocked in: the nudge first, never a stop (AC-02-51).
          if (captured.has(work) && clockStanding === 'OUT') setNudge({ at: 'start', work });
          else started(work);
        }}
        today={counted(
          words.home.today,
          tickets.todayOf(signedIn.userId, assignment.project.id, assignment.project.timeZone),
        )}
        open={[
          ...open.map((ticket) => ({
            id: ticket.id,
            label: say(
              ticket.kind === 'UNIT_RATE'
                ? said.crew
                : ticket.splitSuffix === ''
                  ? said.ticket
                  : said.split,
              {
                truck: ticket.certNumber,
                number: ticket.ticketNumber,
                suffix: ticket.splitSuffix,
              },
            ),
            detail: [
              say(said.started, {
                time: timeOfDay(new Date(ticket.startedAt), ticket.timeZone),
              }),
              // Work photographed by stage: the next stage to do (ADR-590).
              heldNow === undefined ? null : stagesLeft(ticket, heldNow.lists),
            ]
              .filter((part) => part !== null)
              .join(' · '),
          })),
          ...openForms.map((form) => ({
            id: form.id,
            label: formTitle(form, heldNow),
            detail: formStarted(form),
          })),
          ...openCertifications.map((certification) => ({
            id: certification.id,
            label: certificationTitle(certification),
            detail: certificationStarted(certification),
          })),
        ]}
        onOpen={(id) => {
          const ticket = tickets.ticket(id);
          if (ticket !== undefined) {
            // Unit rate work has no open ticket of a load's: it opens where it was left (ADR-592).
            setCapturing(
              ticket.step === 'open' && ticket.kind !== 'UNIT_RATE'
                ? { at: 'open', id }
                : { at: 'complete', id },
            );
          } else if (forms.form(id) !== undefined) setFilling({ at: 'fill', id });
          else if (certifications.certification(id) !== undefined) {
            setCertifying({ at: 'fill', id });
          }
        }}
        numbersLow={numbersLow}
        {...(submitted && heldNow !== undefined
          ? {
              onReceipts: () => {
                setReprinting(true);
              },
            }
          : {})}
        {...(heldNow === undefined
          ? {}
          : {
              onScanBack: () => {
                setScanningBack(true);
              },
            })}
        after={bottom}
      >
        <p>{synced}</p>
      </Home>
    );
  }

  if (shownPlace === 'work') {
    const said = words.work;
    return (
      <main data-screen="no-assignment" className="screen">
        <StatusStrip standing={standing} />
        <div className="screen-body">
          <ScreenTitle>{words.home.title}</ScreenTitle>
          <Banner tone="notice">
            <p>{said.noAssignment[signedIn.noAssignment ?? 'NONE_THAT_DAY']}</p>
          </Banner>
          {held === undefined ? null : (
            <p>{say(said.held, { project: held.assignment.project.name })}</p>
          )}
          <p role="status">{reading ? said.checking : stale}</p>
          <p>{synced}</p>
          {unread === null ? null : <p>{unread}</p>}
        </div>
        <ScreenActions>
          <Button main wide busy={reading} onPress={() => void read()}>
            {reading ? said.checking : said.checkAgain}
          </Button>
          <Button
            wide
            busy={reading}
            onPress={() => {
              setSettingUp('setUp');
            }}
          >
            {said.setUp}
          </Button>
        </ScreenActions>
        {bottom}
      </main>
    );
  }

  if (shownPlace === 'sync') {
    const said = words.sync;
    return (
      <main data-screen="sync" className="screen">
        <StatusStrip standing={standing} />
        <div className="screen-body">
          <ScreenTitle>{said.title}</ScreenTitle>
          <p role="status">{reading ? said.syncing : (unread ?? synced)}</p>
          {waiting === 0 && files === 0 && notSaved.length === 0 ? (
            <p>{said.nothingWaits}</p>
          ) : null}
          {files === 0 ? null : <p>{counted(said.files, files)}</p>}
          {notSaved.length === 0 ? null : (
            <section aria-labelledby="not-saved">
              <h2 id="not-saved">{said.notSaved.title}</h2>
              <p>{said.notSaved.intro}</p>
              <ul>
                {notSaved.map((one) => (
                  <li key={one.id}>
                    <strong>{whatNotSaved(one)}</strong>
                    <p>{one.message ?? said.notSaved.report}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p>
            {held === undefined
              ? said.noLists
              : say(said.lists, {
                  project: held.assignment.project.name,
                  version: held.lists.setupVersion,
                })}
          </p>
          <p>{stale}</p>
        </div>
        <ScreenActions>
          <Button main wide busy={reading} onPress={() => void read()}>
            {reading ? said.syncing : said.syncNow}
          </Button>
          {passcodeNeeded ? (
            <Button wide busy={reading} onPress={turnIn}>
              {said.turnIn}
            </Button>
          ) : null}
        </ScreenActions>
        {bottom}
      </main>
    );
  }

  const said = words.settings;
  return (
    <main data-screen="settings" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <ScreenTitle>{said.title}</ScreenTitle>
        <p>
          {say(said.signedInAs, { name: signedIn.name, monitorNumber: signedIn.monitorNumber })}
        </p>
        {signedIn.offline ? <p>{said.offline}</p> : null}
        {marked === null ? null : <p>{said.underPasscode[marked]}</p>}
        <p>{say(said.phone, { name: enrolment.name })}</p>
        <Toggle
          label={said.scannerKeysAnywhere}
          on={scannerKeysAnywhere}
          onChange={onScannerKeysAnywhere}
        />
        <p className="field-hint">{said.scannerKeysHint}</p>
      </div>
      <ScreenActions>
        <Button
          main
          wide
          busy={signingOut}
          onPress={() => {
            // Signing out while clocked in: "Clock out?" first, never a stop (AC-02-51).
            if (clockStanding === 'IN' || clockStanding === 'BREAK') setNudge('signOut');
            else void signOut();
          }}
        >
          {signingOut ? said.signingOut : said.signOut}
        </Button>
        <Button
          wide
          busy={signingOut}
          onPress={() => {
            setSettingUp('handOver');
          }}
        >
          {said.handOver}
        </Button>
        {signedIn.assignment === null ? null : (
          <Button
            wide
            busy={signingOut}
            onPress={() => {
              setMoving(true);
            }}
          >
            {said.move}
          </Button>
        )}
        <Button wide busy={signingOut} onPress={turnIn}>
          {said.turnIn}
        </Button>
      </ScreenActions>
      {bottom}
    </main>
  );
}
