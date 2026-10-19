// The collection, on the phone (adms-field-app §4A.2…§4A.6; adms-ticket-workflows; BACKLOG 3.5.1,
// C68, C96, C114…C117, C121, C135, C139, C171, C176; AC-02-44, 45, AC-04-08, 11, 24, 91, 92, 95,
// 96, 98, AC-08-06, AC-11-05, 36…39, 68, 74…80, 82; ADR-030, 031, 052, 056, 083, 111, 137, 154,
// 209, 421, 477, 571, 573, 581).
//
// - **New** (the user, ADR-571): "normal or split?" first where the project allows split loads
//   (ADR-137), then the badge scanned (its truck or crew from the phone's certifications), then the
//   number: the phone's next number shown and typed again, or the control ticket scanned, or a
//   number typed because the barcode won't read, with a reason from the firm's list, and typed
//   again (Q-218, ADR-573). **A badge whose truck has a ticket open on this phone opens that
//   ticket.** A badge the lists don't hold is warned, with how stale they are; the lists are read
//   again where there is signal; the monitor carries on, or keys the truck in by hand, the
//   capacity read off it typed (the user, ADR-421; C96). A number this phone already holds, or a
//   control ticket outside the project's ranges, is questioned, never refused (ADR-031, 052).
// - **The open ticket**: its truck, its number, when it was begun, "Mark waypoint" (ADR-581), its
//   photographs; Complete, leave it for now (it waits on home, where the monitor left it, across
//   sign-outs and restarts: ADR-571), or cancel it (kept on the phone, never sent: ADR-056).
// - **Complete**: the debris type and the field tag, each picked by name (ADR-207, 218; invariant
//   20); for a split's property, its ROE and its estimate (ADR-032, 055); where it was collected
//   (GPS, then the address looked up or typed: ADR-111, 119); photos; **the review, every value
//   once, the only "is this right?"** (the user, Q-215, ADR-573), the photographs themselves; then
//   **submitted, sealed for the monitor** (ADR-477): the next ticket, or the split's next property
//   under the same number, its debris type and field tag carried (adms-field-app §4A.3).
//
// Nothing here waits on the server (ADR-030; AC-11-05): the lists read again and the address
// looked up are offered where there is signal and skipped where there isn't. Every value entered
// is kept on the phone at once.
import type { PhoneAssignmentAnswer, PhoneListsRecord } from '@open-adms/contracts';
import { ticketPhotosAtMost } from '@open-adms/domain';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { PhotoDrawn, photoLabel, Step, TicketPhotos, TruckFacts, TypeAgain } from './capture.tsx';
import {
  Banner,
  Button,
  ListPicker,
  NumberKeypad,
  ScanField,
  StatusStrip,
  TextEntry,
  type Standing,
} from './look/index.ts';
import type { HeldLists, PhoneLists } from './phone/lists.ts';
import type { SignedIn } from './phone/monitor.ts';
import type { AddressLookup, Locator } from './phone/place.ts';
import type { Fix, NumberFrom, NumberSaid, PhoneTickets, PhoneTicket } from './phone/tickets.ts';
import { counted, listsRead, say, timeOfDay, words } from './words.ts';

const said = words.capture;

// What the capture screens work with: the phone's tickets and lists, its place, the address
// lookup, and the most waypoints a collection takes (the policy's).
export interface CaptureParts {
  readonly tickets: PhoneTickets;
  readonly lists: PhoneLists;
  readonly locator: Locator;
  readonly lookup: AddressLookup;
  readonly waypointsAtMost: number;
}

// Where the capture is: New, a ticket open, being completed, a photograph shown, or submitted.
export type Capturing =
  | { readonly at: 'new'; readonly split?: { readonly after: PhoneTicket } }
  | { readonly at: 'open'; readonly id: string; readonly reopened?: boolean }
  | { readonly at: 'complete'; readonly id: string }
  | {
      readonly at: 'photo';
      readonly id: string;
      readonly photoId: string;
      readonly from: 'open' | 'complete';
    }
  | { readonly at: 'submitted'; readonly id: string };

const completeSteps = ['debris', 'tag', 'roe', 'estimate', 'place', 'photos', 'review'] as const;
type CompleteStep = (typeof completeSteps)[number];

// The suffix after a split's last: A, B… Z, then AA (the domain's `isSuffix` takes capitals).
const nextSuffix = (suffix: string): string => {
  const last = suffix.at(-1) ?? '@';
  return last === 'Z'
    ? `${suffix}A`
    : `${suffix.slice(0, -1)}${String.fromCharCode(last.charCodeAt(0) + 1)}`;
};

// The steps a ticket's Complete takes: an ROE where it is a split's property or the phone holds
// the project's ROEs, an estimate where it is a split's property.
function stepsOf(ticket: PhoneTicket, lists: PhoneListsRecord): CompleteStep[] {
  const split = ticket.splitSuffix !== '';
  return completeSteps.filter(
    (step) => (step !== 'roe' || split || lists.roes.length > 0) && (step !== 'estimate' || split),
  );
}

export function CollectionCapture({
  parts,
  signedIn,
  assignment,
  held,
  standing,
  start,
  onHome,
  after,
}: {
  readonly parts: CaptureParts;
  readonly signedIn: SignedIn;
  readonly assignment: PhoneAssignmentAnswer;
  readonly held: HeldLists;
  readonly standing: Standing;
  readonly start: Capturing;
  readonly onHome: () => void;
  // What shows below every screen: the warning before the lock after inactivity.
  readonly after?: ReactNode;
}) {
  const [at, setAt] = useState<Capturing>(start);
  const [lists, setLists] = useState(held);
  const ticket = 'id' in at ? parts.tickets.ticket(at.id) : undefined;

  switch (at.at) {
    case 'new':
      return (
        <NewCollection
          parts={parts}
          signedIn={signedIn}
          assignment={assignment}
          held={lists}
          standing={standing}
          {...(at.split === undefined ? {} : { after: at.split.after })}
          onListsRead={setLists}
          onOpened={(opened, reopened) => {
            setAt({ at: 'open', id: opened.id, reopened });
          }}
          onCancel={onHome}
          below={after}
        />
      );
    case 'open':
      if (ticket === undefined) return null;
      return (
        <OpenTicket
          parts={parts}
          ticket={ticket}
          lists={lists.lists}
          standing={standing}
          reopened={at.reopened ?? false}
          onComplete={() => {
            setAt({ at: 'complete', id: ticket.id });
          }}
          onPhoto={(photoId) => {
            setAt({ at: 'photo', id: ticket.id, photoId, from: 'open' });
          }}
          onLeave={onHome}
          below={after}
        />
      );
    case 'complete':
      if (ticket === undefined) return null;
      return (
        <CompleteCollection
          parts={parts}
          ticket={ticket}
          lists={lists.lists}
          standing={standing}
          onBackToTicket={() => {
            setAt({ at: 'open', id: ticket.id });
          }}
          onPhoto={(photoId) => {
            setAt({ at: 'photo', id: ticket.id, photoId, from: 'complete' });
          }}
          onSubmitted={() => {
            setAt({ at: 'submitted', id: ticket.id });
          }}
          onLeave={onHome}
          below={after}
        />
      );
    case 'photo': {
      const photo = ticket?.photos.find(({ id }) => id === at.photoId);
      if (ticket === undefined || photo === undefined) return null;
      const back = () => {
        setAt(
          at.from === 'open' ? { at: 'open', id: ticket.id } : { at: 'complete', id: ticket.id },
        );
      };
      return (
        <main data-screen="photo" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <h1>{photoLabel(ticket, photo)}</h1>
            <PhotoDrawn
              tickets={parts.tickets}
              photo={photo}
              label={photoLabel(ticket, photo)}
              large
            />
          </div>
          <div className="screen-actions">
            <Button main wide onPress={back}>
              {said.photos.back}
            </Button>
            {ticket.state === 'OPEN' ? (
              <Button
                wide
                onPress={() => {
                  void parts.tickets.photoRemoved(ticket.id, photo.id).then(back);
                }}
              >
                {said.photos.remove}
              </Button>
            ) : null}
          </div>
          {after}
        </main>
      );
    }
    case 'submitted':
      if (ticket === undefined) return null;
      return (
        <main data-screen="submitted" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <h1>{say(said.submitted.title, { number: ticket.ticketNumber })}</h1>
            <Banner tone="good" announced>
              <p>{say(said.submitted.saved, { number: ticket.ticketNumber })}</p>
            </Banner>
            <p className="quiet">{said.submitted.sealed}</p>
          </div>
          <div className="screen-actions">
            {ticket.splitSuffix === '' ? null : (
              <Button
                main
                wide
                onPress={() => {
                  setAt({ at: 'new', split: { after: ticket } });
                }}
              >
                {say(said.submitted.nextProperty, {
                  number: ticket.ticketNumber,
                  suffix: nextSuffix(ticket.splitSuffix),
                })}
              </Button>
            )}
            <Button
              main={ticket.splitSuffix === ''}
              wide
              onPress={() => {
                setAt({ at: 'new' });
              }}
            >
              {said.submitted.another}
            </Button>
            <Button wide onPress={onHome}>
              {said.submitted.home}
            </Button>
          </div>
          {after}
        </main>
      );
  }
}

type NewStep =
  | 'split'
  | 'badge'
  | 'unknown'
  | 'keyed'
  | 'made'
  | 'control'
  | 'typed'
  | 'reason'
  | 'again'
  | 'question';

// The number New is about to open the ticket under, and where it came from.
interface Numbered {
  readonly number: string;
  readonly from: NumberFrom;
  readonly reasonId: string | null;
}

function NewCollection({
  parts,
  signedIn,
  assignment,
  held,
  standing,
  after,
  onListsRead,
  onOpened,
  onCancel,
  below,
}: {
  readonly parts: CaptureParts;
  readonly signedIn: SignedIn;
  readonly assignment: PhoneAssignmentAnswer;
  readonly held: HeldLists;
  readonly standing: Standing;
  // The split's property before, where this is the next of its chain.
  readonly after?: PhoneTicket;
  readonly onListsRead: (held: HeldLists) => void;
  readonly onOpened: (ticket: PhoneTicket, reopened: boolean) => void;
  readonly onCancel: () => void;
  readonly below?: ReactNode;
}) {
  const titleId = useId();
  const { lists } = held;
  const generated =
    lists.numbering.ticketNumberSource === 'GENERATED' && lists.numbering.series.includes('LOAD');
  const [step, setStep] = useState<NewStep>(lists.allowSplitLoads ? 'split' : 'badge');
  const [split, setSplit] = useState(false);
  const [badge, setBadge] = useState('');
  const [keyed, setKeyed] = useState(false);
  const [capacity, setCapacity] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const [scanned, setScanned] = useState('');
  const [typed, setTyped] = useState('');
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [again, setAgain] = useState('');
  const [wrong, setWrong] = useState(false);
  const [asked, setAsked] = useState<{ said: NumberSaid; numbered: Numbered } | null>(null);
  const [reading, setReading] = useState<'no' | 'reading' | 'notRead' | 'stillNot'>('no');
  const [opening, setOpening] = useState(false);
  // Whatever fix the phone has by the time the ticket opens, asked when the badge is scanned.
  const fix = useRef<Fix | null>(null);
  const certNumber = badge.trim();
  const known = lists.certifications.some((held) => held.certNumber === certNumber);

  // The next of a split's chain opens straight away under the same number and badge.
  const chained = useRef(false);
  useEffect(() => {
    if (after === undefined || chained.current) return;
    chained.current = true;
    void parts.tickets
      .open({
        ...base(after.certNumber, after.certKeyedByHand, after.typedCapacityCy),
        ticketNumber: after.ticketNumber,
        numberFrom: 'CHAINED',
        numberTypedReasonId: null,
        splitSuffix: nextSuffix(after.splitSuffix),
        carried: { formDebrisTypeId: after.formDebrisTypeId, fieldTagId: after.fieldTagId },
      })
      .then((opened) => {
        onOpened(opened, false);
      });
  });

  const base = (cert: string, byHand: boolean, typedCapacityCy: number | null) => ({
    monitorId: signedIn.userId,
    projectId: assignment.project.id,
    timeZone: assignment.project.timeZone,
    assignmentId: assignment.id,
    setupVersion: lists.setupVersion,
    masterPasscodeSession: signedIn.masterPasscodeSession,
    workflow: 'LOAD' as const,
    kind: 'COLLECTION' as const,
    siteId: assignment.site?.id ?? null,
    certNumber: cert,
    certKeyedByHand: byHand,
    typedCapacityCy,
    start: fix.current,
    step: 'open',
  });

  const open = async (numbered: Numbered) => {
    setOpening(true);
    const opened = await parts.tickets.open({
      ...base(certNumber, keyed, keyed && capacity !== '' ? Number(capacity) : null),
      ticketNumber: numbered.number,
      numberFrom: numbered.from,
      numberTypedReasonId: numbered.reasonId,
      splitSuffix: split ? 'A' : '',
    });
    onOpened(opened, false);
  };

  // The number taken: questioned where this phone already holds it or it is outside the
  // project's control tickets, else the ticket opens.
  const take = (numbered: Numbered) => {
    const told = parts.tickets.said(
      {
        projectId: assignment.project.id,
        workflow: 'LOAD',
        kind: 'COLLECTION',
        splitSuffix: split ? 'A' : '',
        numberFrom: numbered.from,
      },
      numbered.number,
      lists,
    );
    if (told.kind === 'fine') {
      void open(numbered);
      return;
    }
    setAsked({ said: told, numbered });
    setStep('question');
  };

  const toNumber = useCallback(async () => {
    if (!generated) {
      setStep('control');
      return;
    }
    setMade(await parts.tickets.nextNumber('LOAD'));
    setAgain('');
    setWrong(false);
    setStep('made');
  }, [generated, parts.tickets]);

  const badged = () => {
    if (certNumber === '') return;
    const already = parts.tickets.openForTruck(signedIn.userId, certNumber);
    if (already !== undefined) {
      onOpened(already, true);
      return;
    }
    void parts.locator.where().then((placed) => {
      if (placed.kind === 'fix') fix.current = placed.fix;
    });
    if (known) void toNumber();
    else {
      setReading('no');
      setStep('unknown');
    }
  };

  const order: NewStep[] = [
    ...(lists.allowSplitLoads ? (['split'] as const) : []),
    'badge',
    ...(step === 'unknown' || step === 'keyed' ? (['unknown'] as const) : []),
    ...(keyed ? (['keyed'] as const) : []),
    ...(generated ? (['made'] as const) : (['control'] as const)),
    ...(step === 'typed' || step === 'reason' || step === 'again'
      ? (['typed', 'reason', 'again'] as const)
      : []),
    ...(step === 'question' ? (['question'] as const) : []),
  ];
  const place = Math.max(0, order.indexOf(step));
  const back = () => {
    const before = order[place - 1];
    if (before === undefined) onCancel();
    else setStep(before === 'unknown' && known ? 'badge' : before);
  };
  const frame = (title: string, actions: ReactNode, children?: ReactNode) => (
    <main data-screen="new-collection" className="screen">
      <Step
        standing={standing}
        title={title}
        titleId={titleId}
        step={place + 1}
        steps={order.length}
        onBack={back}
        actions={actions}
      >
        {children}
      </Step>
      {below}
    </main>
  );

  if (after !== undefined) return frame(said.number.title, null);

  switch (step) {
    case 'split':
      return frame(
        said.split.title,
        <>
          <Button
            main
            wide
            onPress={() => {
              setSplit(false);
              setStep('badge');
            }}
          >
            {said.split.normal}
          </Button>
          <Button
            wide
            onPress={() => {
              setSplit(true);
              setStep('badge');
            }}
          >
            {said.split.split}
          </Button>
        </>,
        <p>{said.split.about}</p>,
      );
    case 'badge':
      return frame(
        said.badge.title,
        <Button main wide isDisabled={certNumber === ''} onPress={badged}>
          {said.badge.start}
        </Button>,
        <>
          <ScanField
            label={said.badge.label}
            value={badge}
            onChange={setBadge}
            onScan={() => {
              document.querySelector<HTMLInputElement>('.scan-field input')?.focus();
            }}
            onEnter={badged}
          />
          {known ? <TruckFacts certNumber={certNumber} lists={lists} /> : null}
        </>,
      );
    case 'unknown':
      return frame(
        said.unknownBadge.title,
        <>
          <Button main wide onPress={() => void toNumber()}>
            {say(said.unknownBadge.continue, { number: certNumber })}
          </Button>
          <Button
            wide
            onPress={() => {
              setKeyed(true);
              setStep('keyed');
            }}
          >
            {said.unknownBadge.keyIn}
          </Button>
          {navigator.onLine ? (
            <Button
              wide
              isDisabled={reading === 'reading'}
              onPress={() => {
                setReading('reading');
                void parts.lists.read().then(async (read) => {
                  const now = await parts.lists.held();
                  if (read.kind !== 'taken' || now === undefined) {
                    setReading('notRead');
                    return;
                  }
                  onListsRead(now);
                  if (now.lists.certifications.some((one) => one.certNumber === certNumber)) {
                    setReading('no');
                    void toNumber();
                  } else setReading('stillNot');
                });
              }}
            >
              {reading === 'reading' ? said.unknownBadge.refreshing : said.unknownBadge.refresh}
            </Button>
          ) : null}
        </>,
        <>
          <Banner tone="notice" announced>
            <p>{say(said.unknownBadge.warning, { number: certNumber })}</p>
            <p>
              {say(said.unknownBadge.stale, {
                when: listsRead(held.readAt, new Date()).toLowerCase(),
              })}
            </p>
          </Banner>
          {reading === 'stillNot' ? (
            <p role="status">{say(said.unknownBadge.stillNot, { number: certNumber })}</p>
          ) : null}
          {reading === 'notRead' ? <p role="status">{said.unknownBadge.notRead}</p> : null}
        </>,
      );
    case 'keyed':
      return frame(
        said.keyed.title,
        <Button main wide onPress={() => void toNumber()}>
          {said.next}
        </Button>,
        <>
          <p>{said.keyed.about}</p>
          <NumberKeypad
            labelledBy={titleId}
            value={capacity}
            onChange={setCapacity}
            digitsAtMost={4}
            unit={said.keyed.unit}
          />
        </>,
      );
    case 'made':
      if (made === null) {
        return frame(
          said.number.title,
          <Button wide onPress={onCancel}>
            {said.leave}
          </Button>,
          <Banner tone="notice" announced>
            <p>{said.number.none}</p>
          </Banner>,
        );
      }
      return frame(
        said.number.title,
        <Button
          main
          wide
          isDisabled={again === '' || opening}
          onPress={() => {
            if (again !== made) {
              setWrong(true);
              setAgain('');
              return;
            }
            take({ number: made, from: 'MADE', reasonId: null });
          }}
        >
          {said.number.open}
        </Button>,
        <>
          <dl className="facts">
            <dt>{said.number.shown}</dt>
            <dd className="big-number">{made}</dd>
          </dl>
          <p>{said.number.noteIt}</p>
          <h2 id={`${titleId}-again`}>{said.number.againTitle}</h2>
          <TypeAgain
            titleId={`${titleId}-again`}
            number={made}
            value={again}
            onChange={(value) => {
              setAgain(value);
              setWrong(false);
            }}
            wrong={wrong}
          />
        </>,
      );
    case 'control':
      return frame(
        said.number.controlTitle,
        <>
          <Button
            main
            wide
            isDisabled={scanned.trim() === '' || opening}
            onPress={() => {
              take({ number: scanned.trim(), from: 'SCANNED', reasonId: null });
            }}
          >
            {said.number.open}
          </Button>
          <Button
            wide
            onPress={() => {
              setTyped('');
              setStep('typed');
            }}
          >
            {said.number.wontRead}
          </Button>
        </>,
        <ScanField
          label={said.number.controlLabel}
          value={scanned}
          onChange={setScanned}
          onScan={() => {
            document.querySelector<HTMLInputElement>('.scan-field input')?.focus();
          }}
          onEnter={() => {
            if (scanned.trim() !== '')
              take({ number: scanned.trim(), from: 'SCANNED', reasonId: null });
          }}
        />,
      );
    case 'typed':
      return frame(
        said.number.typedTitle,
        <Button
          main
          wide
          isDisabled={typed === ''}
          onPress={() => {
            setStep('reason');
          }}
        >
          {said.next}
        </Button>,
        <>
          <p>{said.number.typedAbout}</p>
          <NumberKeypad labelledBy={titleId} value={typed} onChange={setTyped} digitsAtMost={10} />
        </>,
      );
    case 'reason':
      return frame(
        said.number.reasonTitle,
        null,
        <ListPicker
          labelledBy={titleId}
          choices={lists.typedNumberReasons.map(({ id, name }) => ({ key: id, label: name }))}
          picked={reasonId}
          onPick={(picked) => {
            setReasonId(picked);
            setAgain('');
            setWrong(false);
            setStep('again');
          }}
        />,
      );
    case 'again':
      return frame(
        said.number.againTitle,
        <Button
          main
          wide
          isDisabled={again === '' || opening}
          onPress={() => {
            if (again !== typed) {
              setWrong(true);
              setAgain('');
              return;
            }
            take({ number: typed, from: 'TYPED', reasonId });
          }}
        >
          {said.number.open}
        </Button>,
        <TypeAgain
          titleId={titleId}
          number={typed}
          value={again}
          onChange={(value) => {
            setAgain(value);
            setWrong(false);
          }}
          wrong={wrong}
        />,
      );
    case 'question': {
      if (asked === null) return null;
      const { numbered } = asked;
      return frame(
        said.question.title,
        <>
          <Button main wide isDisabled={opening} onPress={() => void open(numbered)}>
            {say(said.question.use, { number: numbered.number })}
          </Button>
          <Button wide onPress={back}>
            {said.question.back}
          </Button>
        </>,
        <Banner tone="notice" announced>
          <p>
            {asked.said.kind === 'onThisPhone'
              ? say(said.question.onThisPhone, {
                  number: numbered.number,
                  kind: said.kinds[asked.said.ticket.kind].toLowerCase(),
                  time: timeOfDay(
                    new Date(asked.said.ticket.startedAt),
                    assignment.project.timeZone,
                  ),
                })
              : say(said.question.outsideStock, { number: numbered.number })}
          </p>
        </Banner>,
      );
    }
  }
}

function OpenTicket({
  parts,
  ticket,
  lists,
  standing,
  reopened,
  onComplete,
  onPhoto,
  onLeave,
  below,
}: {
  readonly parts: CaptureParts;
  readonly ticket: PhoneTicket;
  readonly lists: PhoneListsRecord;
  readonly standing: Standing;
  readonly reopened: boolean;
  readonly onComplete: () => void;
  readonly onPhoto: (photoId: string) => void;
  readonly onLeave: () => void;
  readonly below?: ReactNode;
}) {
  const [now, setNow] = useState(ticket);
  const [marked, setMarked] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [marking, setMarking] = useState(false);
  const titled = say(now.splitSuffix === '' ? said.open.title : said.open.split, {
    kind: said.kinds[now.kind],
    number: now.ticketNumber,
    suffix: now.splitSuffix,
  });
  const full = now.waypoints.length >= parts.waypointsAtMost;

  if (cancelling) {
    return (
      <main data-screen="cancel-ticket" className="screen">
        <StatusStrip standing={standing} />
        <div className="screen-body">
          <h1>{say(said.open.cancelTitle, { number: now.ticketNumber })}</h1>
          <p>{said.open.cancelAbout}</p>
        </div>
        <div className="screen-actions">
          <Button
            main
            wide
            onPress={() => {
              setCancelling(false);
            }}
          >
            {said.open.cancelNo}
          </Button>
          <Button
            wide
            onPress={() => {
              void parts.tickets.cancel(now.id).then(onLeave);
            }}
          >
            {said.open.cancelYes}
          </Button>
        </div>
        {below}
      </main>
    );
  }

  return (
    <main data-screen="open-ticket" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <h1>{titled}</h1>
        {reopened ? (
          <Banner tone="info" announced>
            <p>{say(said.badge.open, { truck: now.certNumber, number: now.ticketNumber })}</p>
          </Banner>
        ) : null}
        <TruckFacts certNumber={now.certNumber} lists={lists} keyedByHand={now.certKeyedByHand} />
        <p>{say(said.open.started, { time: timeOfDay(new Date(now.startedAt), now.timeZone) })}</p>
        {now.kind === 'COLLECTION' ? (
          <>
            <p>{counted(said.open.waypoints, now.waypoints.length)}</p>
            {marked === null ? null : <p role="status">{marked}</p>}
            {full ? <p>{say(said.open.waypointsFull, { max: parts.waypointsAtMost })}</p> : null}
            {refused ? (
              <Banner tone="notice">
                <p>{said.open.placeRefused}</p>
              </Banner>
            ) : null}
            <Button
              wide
              isDisabled={full || marking}
              onPress={() => {
                setMarking(true);
                const at = new Date();
                void parts.locator.where().then(async (placed) => {
                  setRefused(placed.kind === 'refused');
                  const fixed = placed.kind === 'fix' ? placed.fix : null;
                  const next = await parts.tickets.markWaypoint(
                    now.id,
                    at,
                    fixed,
                    parts.waypointsAtMost,
                  );
                  setNow(next);
                  setMarked(
                    say(fixed === null ? said.open.waypointNoFix : said.open.waypointFix, {
                      number: next.waypoints.length,
                      time: timeOfDay(at, now.timeZone),
                    }),
                  );
                  setMarking(false);
                });
              }}
            >
              {said.open.waypoint}
            </Button>
          </>
        ) : null}
        <TicketPhotos
          tickets={parts.tickets}
          ticket={now}
          atMost={ticketPhotosAtMost}
          onTaken={async (bytes) => {
            const placed = await parts.locator.where();
            const kept = await parts.tickets.photographed(
              now.id,
              bytes,
              placed.kind === 'fix' ? placed.fix : null,
            );
            const after = parts.tickets.ticket(now.id);
            if (after !== undefined) setNow(after);
            return kept;
          }}
          onOpen={(photo) => {
            onPhoto(photo.id);
          }}
        />
      </div>
      <div className="screen-actions">
        <Button main wide onPress={onComplete}>
          {said.open.complete}
        </Button>
        <Button wide onPress={onLeave}>
          {said.leave}
        </Button>
        <Button
          wide
          onPress={() => {
            setCancelling(true);
          }}
        >
          {said.open.cancel}
        </Button>
      </div>
      {below}
    </main>
  );
}

function CompleteCollection({
  parts,
  ticket,
  lists,
  standing,
  onBackToTicket,
  onPhoto,
  onSubmitted,
  onLeave,
  below,
}: {
  readonly parts: CaptureParts;
  readonly ticket: PhoneTicket;
  readonly lists: PhoneListsRecord;
  readonly standing: Standing;
  readonly onBackToTicket: () => void;
  readonly onPhoto: (photoId: string) => void;
  readonly onSubmitted: () => void;
  readonly onLeave: () => void;
  readonly below?: ReactNode;
}) {
  const titleId = useId();
  const steps = stepsOf(ticket, lists);
  const [now, setNow] = useState(ticket);
  const left = steps.find((step) => step === ticket.step);
  const [step, setStep] = useState<CompleteStep>(left ?? 'debris');
  const [roeTyped, setRoeTyped] = useState(ticket.roeNumber ?? '');
  const [estimate, setEstimate] = useState(
    ticket.estimateCy === null ? '' : String(ticket.estimateCy),
  );
  const [placing, setPlacing] = useState<'no' | 'fixing' | 'lookingUp'>('no');
  const [placed, setPlaced] = useState<'none' | 'refused' | 'notFound' | 'unanswered' | null>(null);
  const [typedAddress, setTypedAddress] = useState(
    ticket.addressSource === 'TYPED' ? (ticket.address ?? '') : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [notKept, setNotKept] = useState<string | null>(null);
  const place = steps.indexOf(step);
  const split = now.splitSuffix !== '';

  // Kept at once, with where the monitor is.
  const changed = async (change: Parameters<PhoneTickets['changed']>[1]) => {
    setNow(await parts.tickets.changed(now.id, change));
  };
  const go = (to: CompleteStep | undefined) => {
    if (to === undefined) return;
    setStep(to);
    void changed({ step: to });
  };
  const onward = () => {
    go(steps[place + 1]);
  };
  const back = () => {
    const before = steps[place - 1];
    if (before === undefined) onBackToTicket();
    else go(before);
  };
  const frame = (title: string, actions: ReactNode, children?: ReactNode) => (
    <main data-screen="complete-collection" className="screen">
      <Step
        standing={standing}
        title={title}
        titleId={titleId}
        step={place + 1}
        steps={steps.length}
        onBack={back}
        actions={
          <>
            {actions}
            <Button wide onPress={onLeave}>
              {said.leave}
            </Button>
          </>
        }
      >
        {children}
      </Step>
      {below}
    </main>
  );
  const named = (list: readonly { id: string; name: string }[], id: string | null) =>
    list.find((one) => one.id === id)?.name ?? said.review.none;

  switch (step) {
    case 'debris':
      return frame(
        said.debris.title,
        // A pick already made (a split's next property carries it) moves on as it is.
        now.formDebrisTypeId === null ? null : (
          <Button main wide onPress={onward}>
            {said.next}
          </Button>
        ),
        <ListPicker
          labelledBy={titleId}
          choices={lists.debrisTypes.LOAD.map(({ id, name }) => ({ key: id, label: name }))}
          picked={now.formDebrisTypeId}
          onPick={(picked) => {
            void changed({ formDebrisTypeId: picked }).then(onward);
          }}
        />,
      );
    case 'tag':
      return frame(
        said.tag.title,
        <>
          {now.fieldTagId === null ? null : (
            <Button main wide onPress={onward}>
              {said.next}
            </Button>
          )}
          <Button
            main={now.fieldTagId === null}
            wide
            onPress={() => {
              void changed({ fieldTagId: null }).then(onward);
            }}
          >
            {said.tag.none}
          </Button>
        </>,
        <ListPicker
          labelledBy={titleId}
          choices={lists.fieldTags.map(({ id, name }) => ({ key: id, label: name }))}
          picked={now.fieldTagId}
          onPick={(picked) => {
            void changed({ fieldTagId: picked }).then(onward);
          }}
        />,
      );
    case 'roe':
      return frame(
        said.roe.title,
        <>
          <Button
            main
            wide
            isDisabled={split && roeTyped.trim() === ''}
            onPress={() => {
              void changed({ roeNumber: roeTyped.trim() === '' ? null : roeTyped.trim() }).then(
                onward,
              );
            }}
          >
            {split || roeTyped.trim() !== '' ? said.next : said.roe.none}
          </Button>
        </>,
        <>
          {lists.roes.length === 0 ? null : (
            <ListPicker
              labelledBy={titleId}
              choices={lists.roes.map((roe) => ({
                key: roe.roeNumber,
                label: roe.roeNumber,
                detail: roe.address ?? said.roe.noAddress,
              }))}
              picked={lists.roes.some(({ roeNumber }) => roeNumber === roeTyped) ? roeTyped : null}
              onPick={setRoeTyped}
            />
          )}
          <TextEntry label={said.roe.typeIt} value={roeTyped} onChange={setRoeTyped} />
        </>,
      );
    case 'estimate':
      return frame(
        said.estimate.title,
        <Button
          main
          wide
          isDisabled={estimate === '' || Number.isNaN(Number(estimate))}
          onPress={() => {
            void changed({ estimateCy: Math.round(Number(estimate) * 10) / 10 }).then(onward);
          }}
        >
          {said.next}
        </Button>,
        <NumberKeypad
          labelledBy={titleId}
          value={estimate}
          onChange={setEstimate}
          digitsAtMost={6}
          decimal
          unit={said.estimate.unit}
        />,
      );
    case 'place':
      return frame(
        said.place.title,
        <Button
          main
          wide
          onPress={() => {
            const typedNow = typedAddress.trim();
            const change =
              typedNow !== '' && !(now.addressSource === 'LOOKED_UP' && now.address === typedNow)
                ? { address: typedNow, addressSource: 'TYPED' as const }
                : {};
            void changed(change).then(onward);
          }}
        >
          {said.next}
        </Button>,
        <>
          <Button
            wide
            isDisabled={placing !== 'no'}
            onPress={() => {
              setPlacing('fixing');
              void parts.locator.where().then(async (where) => {
                setPlacing('no');
                if (where.kind === 'fix') {
                  setPlaced(null);
                  await changed({ end: where.fix });
                } else setPlaced(where.kind);
              });
            }}
          >
            {placing === 'fixing' ? said.place.capturing : said.place.capture}
          </Button>
          {now.end === null ? null : (
            <p>
              {say(said.place.fix, { latitude: now.end.latitude, longitude: now.end.longitude })}
            </p>
          )}
          {placed === 'none' ? <p role="status">{said.place.noFix}</p> : null}
          {placed === 'refused' ? (
            <Banner tone="notice" announced>
              <p>{said.open.placeRefused}</p>
            </Banner>
          ) : null}
          {now.end === null || !navigator.onLine ? null : (
            <Button
              wide
              isDisabled={placing !== 'no'}
              onPress={() => {
                const { end } = now;
                if (end === null) return;
                setPlacing('lookingUp');
                void parts.lookup.at(end).then(async (found) => {
                  setPlacing('no');
                  if (found.kind === 'found') {
                    setPlaced(null);
                    setTypedAddress(found.address);
                    await changed({ address: found.address, addressSource: 'LOOKED_UP' });
                  } else setPlaced(found.kind === 'none' ? 'notFound' : 'unanswered');
                });
              }}
            >
              {placing === 'lookingUp' ? said.place.lookingUp : said.place.lookUp}
            </Button>
          )}
          {now.addressSource === 'LOOKED_UP' && now.address !== null ? (
            <p role="status">{say(said.place.found, { address: now.address })}</p>
          ) : null}
          {placed === 'notFound' ? <p role="status">{said.place.notFound}</p> : null}
          {placed === 'unanswered' ? <p role="status">{said.place.unanswered}</p> : null}
          <TextEntry label={said.place.typed} value={typedAddress} onChange={setTypedAddress} />
        </>,
      );
    case 'photos':
      return frame(
        said.photos.title,
        <Button main wide onPress={onward}>
          {said.next}
        </Button>,
        <TicketPhotos
          tickets={parts.tickets}
          ticket={now}
          atMost={ticketPhotosAtMost}
          onTaken={async (bytes) => {
            const where = await parts.locator.where();
            const kept = await parts.tickets.photographed(
              now.id,
              bytes,
              where.kind === 'fix' ? where.fix : null,
            );
            const after = parts.tickets.ticket(now.id);
            if (after !== undefined) setNow(after);
            return kept;
          }}
          onOpen={(photo) => {
            onPhoto(photo.id);
          }}
        />,
      );
    case 'review': {
      const reason = lists.typedNumberReasons.find(({ id }) => id === now.numberTypedReasonId);
      return frame(
        said.review.title,
        <Button
          main
          wide
          isDisabled={submitting}
          onPress={() => {
            setSubmitting(true);
            setNotKept(null);
            void (async () => {
              const end =
                now.end ??
                (await parts.locator
                  .where()
                  .then((where) => (where.kind === 'fix' ? where.fix : null)));
              const outcome = await parts.tickets.submit(now.id, end);
              setSubmitting(false);
              if (outcome.kind === 'sealed') onSubmitted();
              else setNotKept(outcome.notice.message);
            })();
          }}
        >
          {submitting ? said.review.submitting : said.review.submit}
        </Button>,
        <>
          <p>{said.review.about}</p>
          {notKept === null ? null : (
            <Banner tone="problem" announced>
              <p>{say(said.review.notKept, { message: notKept })}</p>
            </Banner>
          )}
          <dl className="facts">
            <dt>{said.review.truck}</dt>
            <dd>{now.certNumber}</dd>
            <dt>{said.review.number}</dt>
            <dd>
              {now.splitSuffix === '' ? now.ticketNumber : `${now.ticketNumber}-${now.splitSuffix}`}
              {reason === undefined
                ? null
                : ` · ${say(said.review.typed, { reason: reason.name })}`}
            </dd>
            <dt>{said.review.debris}</dt>
            <dd>{named(lists.debrisTypes.LOAD, now.formDebrisTypeId)}</dd>
            <dt>{said.review.tag}</dt>
            <dd>{named(lists.fieldTags, now.fieldTagId)}</dd>
            {steps.includes('roe') ? (
              <>
                <dt>{said.review.roe}</dt>
                <dd>{now.roeNumber ?? said.review.none}</dd>
              </>
            ) : null}
            {split ? (
              <>
                <dt>{said.review.estimate}</dt>
                <dd>
                  {now.estimateCy === null
                    ? said.review.none
                    : say(said.review.estimateCy, { estimate: now.estimateCy })}
                </dd>
              </>
            ) : null}
            <dt>{said.review.place}</dt>
            <dd>
              {now.address ??
                (now.end === null
                  ? said.review.none
                  : say(said.place.fix, {
                      latitude: now.end.latitude,
                      longitude: now.end.longitude,
                    }))}
            </dd>
            <dt>{said.review.waypoints}</dt>
            <dd>{counted(said.open.waypoints, now.waypoints.length)}</dd>
          </dl>
          <h2>{said.review.photos}</h2>
          {now.photos.length === 0 ? (
            <p>{said.review.none}</p>
          ) : (
            <TicketPhotos
              tickets={parts.tickets}
              ticket={now}
              atMost={ticketPhotosAtMost}
              onTaken={async (bytes) => {
                const kept = await parts.tickets.photographed(now.id, bytes, null);
                const after = parts.tickets.ticket(now.id);
                if (after !== undefined) setNow(after);
                return kept;
              }}
              onOpen={(photo) => {
                onPhoto(photo.id);
              }}
            />
          )}
        </>,
      );
    }
  }
}
