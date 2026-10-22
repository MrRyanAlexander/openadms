// New, on the phone, for a load's two field events, a haul-out's and a unit rate ticket
// (adms-field-app §4A.2…§4A.6; adms-ticket-workflows; BACKLOG 3.5.1…3.5.3; C68, C96, C114…C117;
// AC-02-44, AC-04-08, 11, 70, 91, 95, 96, 98, AC-11-38, 39, 74, 76, 82; ADR-030, 031, 052, 056,
// 111, 137, 154, 209, 295, 421, 571, 573, 581…583).
//
// - **The badge, then the number** (the user, ADR-571): "normal or split?" first where the project
//   allows split loads, for a collection (its properties) and a haul-out's collection (its piles,
//   ADR-295); then the badge scanned (its truck or crew from the phone's certifications); then the
//   number. **Where the number is made** (a collection, a haul-out's collection): the phone's
//   next number, **the ticket opening under it at once, never typed again** (the user, ADR-589:
//   "we really don't want to block work re-entering it"), or the control ticket scanned. **Where
//   it is carried** (a disposal, a haul-out's disposal): the driver's ticket scanned, never typed
//   again, and never a number made there (ADR-019; REQ-308a). Either way a pre-printed barcode
//   that won't read is typed, with a reason from the firm's list, and typed again (Q-218, ADR-573):
//   the one number still copied by a person.
// - **Unit rate** (ADR-111, 571, 583, 589, 592; AC-04-70, AC-11-74): **the crew is the first
//   step** (the user, ADR-592): where the monitor has a working crew, "Same crew" or a new crew's
//   badge scanned; with none, the badge. The phone's next number of the unit rate series, always
//   made there (ADR-056), opens the ticket at once, and it goes straight on to the work (a new
//   crew's photo first), never to a load's open ticket. A crew isn't held to one open ticket (the
//   user's rule is one per truck), and a crew is never keyed in by hand: it has no capacity to type.
// - **A badge whose truck has a ticket open on this phone opens that ticket.** A badge the lists
//   don't hold is warned, with how stale they are; the lists are read again where there is signal;
//   the monitor carries on, or keys the truck in by hand, the capacity read off it typed (the user,
//   ADR-421; C96). A number this phone already holds for the same kind of field event (the same
//   barcode scanned twice at a tower, `adms-exceptions` Scenario A), or a control ticket outside
//   the project's ranges, is questioned, never refused (ADR-031, 052).
// - **Scanned by a keyboard-style scanner or the camera** (task 3.6.3, ADR-596; `scan.tsx`): the
//   badge and the number alike; the ticket's number's field opens no keyboard on a phone, so one
//   typed by hand goes through "The barcode won't read", with its reason (Q-105).
//
// Nothing here waits on the server (ADR-030; AC-11-05): the lists are read again only where there
// is signal.
import type { PhoneAssignmentAnswer, PhoneListsRecord } from '@open-adms/contracts';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Step, TruckFacts, TypeAgain } from './capture.tsx';
import { Banner, Button, ListPicker, NumberKeypad, type Standing } from './look/index.ts';
import type { HeldLists } from './phone/lists.ts';
import type { SignedIn } from './phone/monitor.ts';
import type { Fix, NumberFrom, NumberSaid, PhoneTicket, Workflow } from './phone/tickets.ts';
import type { CaptureParts, CapturedKind } from './ticket-capture.tsx';
import { ScanEntry } from './scan.tsx';
import { unitRateStepsAtNew } from './unit-rate.tsx';
import { listsRead, say, timeOfDay, words } from './words.ts';

const said = words.capture;

type NewStep =
  | 'split'
  | 'crew'
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

// The suffix after a split's last: A, B… Z, then AA (the domain's `isSuffix` takes capitals).
export const nextSuffix = (suffix: string): string => {
  const last = suffix.at(-1) ?? '@';
  return last === 'Z'
    ? `${suffix}A`
    : `${suffix.slice(0, -1)}${String.fromCharCode(last.charCodeAt(0) + 1)}`;
};

export const workflowOf = (kind: CapturedKind): Workflow => {
  if (kind === 'UNIT_RATE') return 'UNIT_RATE';
  return kind === 'COLLECTION' || kind === 'DISPOSAL' ? 'LOAD' : 'HAUL_OUT';
};

// Whether this kind makes the ticket's number: a load's collection and a haul-out's (the truck
// carries it to the other end), and a unit rate ticket. A disposal of either takes the number off
// the driver's ticket.
const makesNumber = (kind: CapturedKind): boolean =>
  kind === 'COLLECTION' || kind === 'HAUL_OUT_COLLECTION' || kind === 'UNIT_RATE';

// Whether the phone makes the number from its blocks, rather than taking a control ticket: a unit
// rate ticket's always is (ADR-056).
function generates(kind: CapturedKind, lists: PhoneListsRecord): boolean {
  if (kind === 'UNIT_RATE') return true;
  const series = workflowOf(kind) === 'LOAD' ? 'LOAD' : 'HAUL_OUT';
  return (
    makesNumber(kind) &&
    lists.numbering.ticketNumberSource === 'GENERATED' &&
    lists.numbering.series.includes(series)
  );
}

// The screen's own name, for each kind's New.
function NewScreen({
  kind,
  children,
}: {
  readonly kind: CapturedKind;
  readonly children: ReactNode;
}) {
  switch (kind) {
    case 'COLLECTION':
      return (
        <main data-screen="new-collection" className="screen">
          {children}
        </main>
      );
    case 'HAUL_OUT_COLLECTION':
      return (
        <main data-screen="new-haul-out" className="screen">
          {children}
        </main>
      );
    case 'DISPOSAL':
    case 'HAUL_OUT_DISPOSAL':
      return (
        <main data-screen="new-disposal" className="screen">
          {children}
        </main>
      );
    case 'UNIT_RATE':
      return (
        <main data-screen="new-unit-rate" className="screen">
          {children}
        </main>
      );
  }
}

export function NewTicket({
  kind,
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
  readonly kind: CapturedKind;
  readonly parts: CaptureParts;
  readonly signedIn: SignedIn;
  readonly assignment: PhoneAssignmentAnswer;
  readonly held: HeldLists;
  readonly standing: Standing;
  // The split's property or pile before, where this is the next of its chain.
  readonly after?: PhoneTicket;
  readonly onListsRead: (held: HeldLists) => void;
  readonly onOpened: (ticket: PhoneTicket, reopened: boolean) => void;
  readonly onCancel: () => void;
  readonly below?: ReactNode;
}) {
  const titleId = useId();
  const { lists } = held;
  const workflow = workflowOf(kind);
  const generated = generates(kind, lists);
  const unitRate = kind === 'UNIT_RATE';
  const splits = lists.allowSplitLoads && (kind === 'COLLECTION' || kind === 'HAUL_OUT_COLLECTION');
  // The monitor's working crew on this project, where they have one (AC-04-70).
  const crew = unitRate
    ? parts.tickets.workingCrew(signedIn.userId, assignment.project.id)
    : undefined;
  const [step, setStep] = useState<NewStep>(
    splits ? 'split' : crew === undefined ? 'badge' : 'crew',
  );
  const [split, setSplit] = useState(false);
  const [badge, setBadge] = useState('');
  const [keyed, setKeyed] = useState(false);
  const [capacity, setCapacity] = useState('');
  const [scanned, setScanned] = useState('');
  const [typed, setTyped] = useState('');
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [again, setAgain] = useState('');
  const [wrong, setWrong] = useState(false);
  const [asked, setAsked] = useState<{ said: NumberSaid; numbered: Numbered } | null>(null);
  const [reading, setReading] = useState<'no' | 'reading' | 'notRead' | 'stillNot'>('no');
  const [opening, setOpening] = useState(false);
  // Whatever fix the phone has by the time the ticket opens, asked when the badge is scanned; and
  // the asking, which the ticket waits for (at most the locator's own few seconds): a number the
  // phone makes opens it at once (ADR-589), and its start must still be where it began.
  const fix = useRef<Fix | null>(null);
  const placing = useRef<Promise<unknown>>(Promise.resolve());
  // The badge taken, as it was taken: "Same crew" opens the ticket in the same press that sets
  // the badge, before the screen has it; and whether it was the working crew kept, whose ticket
  // goes straight on to the work (a new crew's to its photo first; ADR-592).
  const badgeTaken = useRef('');
  const sameCrew = useRef(false);
  const certNumber = badge.trim();
  const known = lists.certifications.some((one) => one.certNumber === certNumber);
  const scanWords = makesNumber(kind)
    ? { title: said.number.controlTitle, label: said.number.controlLabel }
    : { title: said.number.ticketTitle, label: said.number.ticketLabel };

  const base = (cert: string, byHand: boolean, typedCapacityCy: number | null) => ({
    monitorId: signedIn.userId,
    projectId: assignment.project.id,
    timeZone: assignment.project.timeZone,
    assignmentId: assignment.id,
    setupVersion: lists.setupVersion,
    masterPasscodeSession: signedIn.masterPasscodeSession,
    workflow,
    kind,
    siteId: assignment.site?.id ?? null,
    certNumber: cert,
    certKeyedByHand: byHand,
    typedCapacityCy,
    start: fix.current,
    step: 'open',
  });

  // The next of a split's chain opens straight away under the same number and badge, with the
  // debris type of the property or pile before (ADR-295); no field tag is taken on a phone (the
  // user, ADR-591).
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
        carried: { formDebrisTypeId: after.formDebrisTypeId },
      })
      .then((opened) => {
        onOpened(opened, false);
      });
  });

  const open = async (numbered: Numbered) => {
    setOpening(true);
    await placing.current;
    const opened = await parts.tickets.open({
      ...base(
        badgeTaken.current === '' ? certNumber : badgeTaken.current,
        keyed,
        keyed && capacity !== '' ? Number(capacity) : null,
      ),
      ticketNumber: numbered.number,
      numberFrom: numbered.from,
      numberTypedReasonId: numbered.reasonId,
      splitSuffix: split ? 'A' : '',
      ...(unitRate ? { step: sameCrew.current ? 'work' : 'crew' } : {}),
    });
    onOpened(opened, false);
  };

  // The number taken: questioned where this phone already holds it or it is outside the
  // project's control tickets, else the ticket opens.
  const take = (numbered: Numbered) => {
    const told = parts.tickets.said(
      {
        projectId: assignment.project.id,
        workflow,
        kind,
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

  const toNumber = async () => {
    if (!generated) {
      setStep('control');
      return;
    }
    // The phone's next number, the ticket opening under it at once (ADR-589); none held, the
    // screen says so.
    const next = await parts.tickets.nextNumber(workflow);
    if (next === null) setStep('made');
    else take({ number: next, from: 'MADE', reasonId: null });
  };

  const badged = (cert = certNumber) => {
    if (cert === '') return;
    const already = unitRate ? undefined : parts.tickets.openForTruck(signedIn.userId, cert);
    if (already !== undefined) {
      onOpened(already, true);
      return;
    }
    badgeTaken.current = cert;
    placing.current = parts.locator.where().then((placed) => {
      if (placed.kind === 'fix') fix.current = placed.fix;
    });
    if (lists.certifications.some((one) => one.certNumber === cert)) void toNumber();
    else {
      setReading('no');
      setStep('unknown');
    }
  };

  const order: NewStep[] = [
    ...(splits ? (['split'] as const) : []),
    ...(crew === undefined ? [] : (['crew'] as const)),
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
  // Unit rate's New is all its first step, the crew, of the ticket's own steps (ADR-592).
  const shownStep = unitRate ? 1 : place + 1;
  const shownSteps = unitRate ? unitRateStepsAtNew(lists) : order.length;
  const back = () => {
    const before = order[place - 1];
    if (before === undefined) onCancel();
    else if (before === 'badge' && crew !== undefined && badge === crew) setStep('crew');
    else setStep(before === 'unknown' && known ? 'badge' : before);
  };
  const frame = (title: string, actions: ReactNode, children?: ReactNode) => (
    <NewScreen kind={kind}>
      <Step
        standing={standing}
        title={title}
        titleId={titleId}
        step={shownStep}
        steps={shownSteps}
        onBack={back}
        actions={actions}
      >
        {children}
      </Step>
      {below}
    </NewScreen>
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
        <p>{kind === 'COLLECTION' ? said.split.about : said.split.piles}</p>,
      );
    case 'crew':
      if (crew === undefined) return null;
      return frame(
        said.crew.title,
        <>
          <Button
            main
            wide
            onPress={() => {
              sameCrew.current = true;
              setBadge(crew);
              badged(crew);
            }}
          >
            {say(said.crew.same, { number: crew })}
          </Button>
          <Button
            wide
            onPress={() => {
              sameCrew.current = false;
              setBadge('');
              setStep('badge');
            }}
          >
            {said.crew.change}
          </Button>
        </>,
        <>
          <p>{said.crew.about}</p>
          <TruckFacts certNumber={crew} lists={lists} />
        </>,
      );
    case 'badge':
      return frame(
        unitRate ? said.badge.crewTitle : said.badge.title,
        <Button
          main
          wide
          isDisabled={certNumber === ''}
          onPress={() => {
            badged();
          }}
        >
          {unitRate ? said.badge.crewStart : said.badge.start}
        </Button>,
        <>
          <ScanEntry
            camera={parts.camera}
            label={said.badge.label}
            value={badge}
            onChange={setBadge}
            onEnter={(value) => {
              badged(value.trim());
            }}
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
          {unitRate ? null : (
            <Button
              wide
              onPress={() => {
                setKeyed(true);
                setStep('keyed');
              }}
            >
              {said.unknownBadge.keyIn}
            </Button>
          )}
          {navigator.onLine ? (
            <Button
              wide
              busy={reading === 'reading'}
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
      // Reached only where the phone holds no number to make: a number made opens the ticket.
      return frame(
        said.number.title,
        <Button wide onPress={onCancel}>
          {said.leave}
        </Button>,
        <Banner tone="notice" announced>
          <p>{said.number.none}</p>
        </Banner>,
      );
    case 'control':
      return frame(
        scanWords.title,
        <>
          <Button
            main
            wide
            isDisabled={scanned.trim() === ''}
            busy={opening}
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
        <ScanEntry
          camera={parts.camera}
          label={scanWords.label}
          value={scanned}
          onChange={setScanned}
          keyboard={false}
          onEnter={(value) => {
            if (value.trim() !== '')
              take({ number: value.trim(), from: 'SCANNED', reasonId: null });
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
          movesOn
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
          isDisabled={again === ''}
          busy={opening}
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
          <Button main wide busy={opening} onPress={() => void open(numbered)}>
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
