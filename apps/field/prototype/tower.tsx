// The tower on the prototype (ADR-209; adms-field-app §4A.4): the badge, the debris type, the load
// call typed on the keypad (an extreme call is a calm notice that it will be flagged, never a
// refusal: ADR-052, 116, 164), photos, the review; then the driver's ticket scanned, or typed with
// a reason when the barcode won't read; typed again where Q-218's choice says; submitted and
// printed.
import { useId, useState, type ReactNode } from 'react';

import {
  Banner,
  Button,
  NumberKeypad,
  ListPicker,
  PhotoStrip,
  ScanField,
  type Standing,
} from '../src/look/index.ts';
import { say } from '../src/words.ts';
import {
  Capture,
  Confirmation,
  Submitted,
  TicketScan,
  TypeAgain,
  TypedReason,
  useSteps,
  type Asking,
} from './capture.tsx';
import { Truck } from './collection.tsx';
import type { Designs } from './designs.ts';
import { words, world } from './world.ts';

type Step =
  'badge' | 'debris' | 'call' | 'photos' | 'review' | 'scan' | 'reason' | 'again' | 'saved';

// What the load call is, read: the notice that goes with it, and whether it can be a load call.
function called(typed: string): { readonly notice: ReactNode; readonly callable: boolean } {
  if (typed === '') return { notice: null, callable: false };
  const call = Number(typed);
  const { low, high } = world.loadCallLimits;
  const notice = (tone: 'notice' | 'problem', words_: string) => (
    <Banner tone={tone} announced>
      <p>{words_}</p>
    </Banner>
  );
  if (call > 100) return { notice: notice('problem', words.call.over), callable: false };
  if (call === 0) return { notice: notice('notice', words.call.zero), callable: true };
  if (call <= low) {
    return { notice: notice('notice', say(words.call.low, { call, limit: low })), callable: true };
  }
  if (call >= high) {
    return {
      notice: notice('notice', say(words.call.high, { call, limit: high })),
      callable: true,
    };
  }
  return { notice: null, callable: true };
}

export function Tower({
  designs,
  standing,
  onMade,
  onNext,
  onHome,
}: {
  readonly designs: Designs;
  readonly standing: Standing;
  readonly onMade: () => void;
  readonly onNext: () => void;
  readonly onHome: () => void;
}) {
  const titleId = useId();
  const [badge, setBadge] = useState('');
  const [debris, setDebris] = useState<string | null>(null);
  const [call, setCall] = useState('');
  const [photos, setPhotos] = useState<readonly string[]>([]);
  const [ticket, setTicket] = useState('');
  const [scanned, setScanned] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [again, setAgain] = useState('');
  const [wrong, setWrong] = useState(false);
  const [shown, setShown] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);

  const typedByHand = ticket !== '' && !scanned;
  const typedAgain = typedByHand || designs.again === 'always';
  const order: Step[] = [
    'badge',
    'debris',
    'call',
    'photos',
    'review',
    'scan',
    ...(typedByHand ? (['reason'] as const) : []),
    ...(typedAgain ? (['again'] as const) : []),
    'saved',
  ];
  const steps = useSteps(order);
  const reading = called(call);

  const confirmed = (value: string, onward = steps.onward) => {
    if (designs.confirm === 'no') {
      onward();
      return;
    }
    setAsking({
      value,
      onward: () => {
        setAsking(null);
        onward();
      },
    });
  };
  const submit = () => {
    onMade();
    steps.go('saved');
  };

  const frame = (title: string, actions: ReactNode, children?: ReactNode) => (
    <Capture
      standing={standing}
      titleId={titleId}
      title={title}
      step={steps.number}
      steps={steps.steps}
      onBack={steps.step === 'saved' ? undefined : steps.back}
      actions={actions}
    >
      {children}
    </Capture>
  );
  const next = (enabled = true, onPress = steps.onward) => (
    <Button main isDisabled={!enabled} onPress={onPress}>
      {words.flow.next}
    </Button>
  );

  const shownStep = () => {
    switch (steps.step) {
      case 'badge':
        return frame(
          words.badge.truckTitle,
          next(badge.trim() !== ''),
          <>
            <ScanField
              label={words.badge.label}
              value={badge}
              onChange={setBadge}
              onScan={() => {
                setBadge(world.certifications[0].number);
              }}
            />
            <Truck badge={badge} />
          </>,
        );
      case 'debris':
        return frame(
          words.debris.title,
          next(debris !== null),
          <ListPicker
            labelledBy={titleId}
            choices={world.debrisTypes.map((type) => ({ key: type, label: type }))}
            picked={debris}
            onPick={(type) => {
              setDebris(type);
              confirmed(type);
            }}
          />,
        );
      case 'call':
        return frame(
          words.call.title,
          next(reading.callable, () => {
            confirmed(`${call}${words.call.unit}`);
          }),
          <>
            <p>{words.call.about}</p>
            <NumberKeypad
              labelledBy={titleId}
              value={call}
              onChange={setCall}
              digitsAtMost={3}
              unit={words.call.unit}
            />
            {reading.notice}
          </>,
        );
      case 'photos':
        return frame(
          words.photos.title,
          next(),
          <PhotoStrip
            photos={photos}
            atMost={world.photosAtMost}
            onTake={() => {
              setPhotos([...photos, `photo-${String(photos.length + 1)}`]);
            }}
          />,
        );
      case 'review':
        return frame(
          words.review.title,
          <Button main onPress={steps.onward}>
            {words.review.right}
          </Button>,
          <dl className="facts">
            <dt>{words.review.truck}</dt>
            <dd>{badge}</dd>
            <dt>{words.review.site}</dt>
            <dd>{world.site}</dd>
            <dt>{words.review.debris}</dt>
            <dd>{debris ?? words.review.none}</dd>
            <dt>{words.review.call}</dt>
            <dd>{`${call}${words.call.unit}`}</dd>
            <dt>{words.review.photos}</dt>
            <dd>{photos.length}</dd>
          </dl>,
        );
      case 'scan':
        return frame(
          words.number.scanTitle,
          next(ticket.trim() !== '', typedAgain ? steps.onward : submit),
          <TicketScan
            value={ticket}
            onChange={(value) => {
              setTicket(value);
              setScanned(false);
            }}
            onScan={() => {
              setTicket(world.numbers.driversTicket);
              setScanned(true);
            }}
          />,
        );
      case 'reason':
        return frame(
          words.number.reasonTitle,
          next(reason !== null),
          <TypedReason
            titleId={titleId}
            picked={reason}
            onPick={(picked) => {
              setReason(picked);
              confirmed(picked);
            }}
          />,
        );
      case 'again':
        return frame(
          words.number.againTitle,
          <Button
            main
            isDisabled={again === ''}
            onPress={() => {
              if (again === ticket.trim()) submit();
              else {
                setWrong(true);
                setAgain('');
              }
            }}
          >
            {words.flow.submit}
          </Button>,
          <TypeAgain
            titleId={titleId}
            number={ticket.trim()}
            value={again}
            onChange={(value) => {
              setAgain(value);
              setWrong(false);
            }}
            wrong={wrong}
            shown={shown}
            onShow={() => {
              setShown(true);
            }}
          />,
        );
      case 'saved':
        return frame(
          words.flow.submittedTitle,
          <>
            <Button main onPress={onNext}>
              {words.flow.nextTicket}
            </Button>
            <Button wide onPress={onHome}>
              {words.flow.home}
            </Button>
          </>,
          <Submitted
            number={ticket.trim()}
            printed={printed}
            onPrint={() => {
              setPrinted(true);
            }}
          />,
        );
    }
  };

  return (
    <main data-screen="prototype-tower" className="screen">
      {asking === null ? (
        shownStep()
      ) : (
        <Confirmation
          standing={standing}
          asking={asking}
          onChange={() => {
            setAsking(null);
          }}
        />
      )}
    </main>
  );
}
