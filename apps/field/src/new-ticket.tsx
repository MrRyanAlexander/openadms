// New, on the phone, for a load's two field events and a haul-out's (adms-field-app §4A.2…§4A.6;
// adms-ticket-workflows; BACKLOG 3.5.1, 3.5.2; C68, C96, C114…C117; AC-02-44, AC-04-08, 11, 91,
// 95, 96, 98, AC-11-38, 39, 74, 76, 82; ADR-030, 031, 052, 056, 137, 154, 209, 295, 421, 571, 573,
// 581, 582).
//
// - **The badge, then the number** (the user, ADR-571): "normal or split?" first where the project
//   allows split loads, for a collection (its properties) and a haul-out's collection (its piles,
//   ADR-295); then the badge scanned (its truck or crew from the phone's certifications); then the
//   number. **Where the number is made** (a collection, a haul-out's collection): the phone's
//   next number shown and typed again, or the control ticket scanned. **Where it is carried** (a
//   disposal, a haul-out's disposal): the driver's ticket scanned, never typed again, and never a
//   number made there (ADR-019; REQ-308a). Either way a barcode that won't read is typed, with a
//   reason from the firm's list, and typed again (Q-218, ADR-573).
// - **A badge whose truck has a ticket open on this phone opens that ticket.** A badge the lists
//   don't hold is warned, with how stale they are; the lists are read again where there is signal;
//   the monitor carries on, or keys the truck in by hand, the capacity read off it typed (the user,
//   ADR-421; C96). A number this phone already holds for the same kind of field event (the same
//   barcode scanned twice at a tower, `adms-exceptions` Scenario A), or a control ticket outside
//   the project's ranges, is questioned, never refused (ADR-031, 052).
//
// Nothing here waits on the server (ADR-030; AC-11-05): the lists are read again only where there
// is signal.
import type { PhoneAssignmentAnswer, PhoneListsRecord } from '@open-adms/contracts';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Step, TruckFacts, TypeAgain } from './capture.tsx';
import {
  Banner,
  Button,
  ListPicker,
  NumberKeypad,
  ScanField,
  type Standing,
} from './look/index.ts';
import type { HeldLists } from './phone/lists.ts';
import type { SignedIn } from './phone/monitor.ts';
import type { Fix, NumberFrom, NumberSaid, PhoneTicket, Workflow } from './phone/tickets.ts';
import type { CaptureParts, CapturedKind } from './ticket-capture.tsx';
import { listsRead, say, timeOfDay, words } from './words.ts';

const said = words.capture;

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

// The suffix after a split's last: A, B… Z, then AA (the domain's `isSuffix` takes capitals).
export const nextSuffix = (suffix: string): string => {
  const last = suffix.at(-1) ?? '@';
  return last === 'Z'
    ? `${suffix}A`
    : `${suffix.slice(0, -1)}${String.fromCharCode(last.charCodeAt(0) + 1)}`;
};

export const workflowOf = (kind: CapturedKind): Workflow =>
  kind === 'COLLECTION' || kind === 'DISPOSAL' ? 'LOAD' : 'HAUL_OUT';

// Whether this kind makes the ticket's number: a load's collection and a haul-out's (the truck
// carries it to the other end). A disposal of either takes the number off the driver's ticket.
const makesNumber = (kind: CapturedKind): boolean =>
  kind === 'COLLECTION' || kind === 'HAUL_OUT_COLLECTION';

// Whether the phone makes the number from its blocks, rather than taking a control ticket.
function generates(kind: CapturedKind, lists: PhoneListsRecord): boolean {
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
  const splits = lists.allowSplitLoads && makesNumber(kind);
  const [step, setStep] = useState<NewStep>(splits ? 'split' : 'badge');
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

  // The next of a split's chain opens straight away under the same number and badge: a load's
  // next property with its debris type and field tag, a haul-out's next pile with its debris
  // type alone, since a pile is told apart by its field tag (ADR-295).
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
        carried:
          kind === 'COLLECTION'
            ? { formDebrisTypeId: after.formDebrisTypeId, fieldTagId: after.fieldTagId }
            : { formDebrisTypeId: after.formDebrisTypeId },
      })
      .then((opened) => {
        onOpened(opened, false);
      });
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

  const toNumber = useCallback(async () => {
    if (!generated) {
      setStep('control');
      return;
    }
    setMade(await parts.tickets.nextNumber(workflow));
    setAgain('');
    setWrong(false);
    setStep('made');
  }, [generated, parts.tickets, workflow]);

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
    ...(splits ? (['split'] as const) : []),
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
    <NewScreen kind={kind}>
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
        scanWords.title,
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
          label={scanWords.label}
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
