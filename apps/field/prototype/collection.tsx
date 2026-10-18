// A collection on the prototype (ADR-209; adms-field-app §4A.4): New scans the badge and the load
// waits while the truck loads; Complete takes the debris type, a field tag, where it was collected
// and photos; the review; then the number the phone makes, shown and typed again (a number a
// person copies: Q-218's two choices both type it again); submitted, printed, the next ticket.
import { useId, useState, type ReactNode } from 'react';

import {
  Banner,
  Button,
  ListPicker,
  PhotoStrip,
  ScanField,
  type Standing,
} from '../src/look/index.ts';
import { say, timeOfDay } from '../src/words.ts';
import {
  Capture,
  Confirmation,
  NumberShown,
  Submitted,
  TypeAgain,
  useSteps,
  type Asking,
} from './capture.tsx';
import type { Designs } from './designs.ts';
import { words, world } from './world.ts';

const order = [
  'badge',
  'loading',
  'debris',
  'tag',
  'place',
  'photos',
  'review',
  'shown',
  'again',
  'saved',
] as const;

export function Truck({ badge }: { readonly badge: string }) {
  const certification = world.certifications.find((held) => held.number === badge.trim());
  if (badge.trim() === '') return null;
  if (certification === undefined) {
    return (
      <Banner tone="notice" announced>
        <p>{say(words.badge.unknown, { number: badge.trim() })}</p>
      </Banner>
    );
  }
  return (
    <dl className="facts">
      <dt>{words.review.truck}</dt>
      <dd>
        {say(words.badge.truck, {
          number: certification.number,
          kind: certification.kind,
          capacity: certification.capacity,
        })}
      </dd>
      <dt>{words.review.contractor}</dt>
      <dd>
        {certification.sub === null
          ? certification.prime
          : say(words.badge.sub, { sub: certification.sub, prime: certification.prime })}
      </dd>
    </dl>
  );
}

export function Collection({
  designs,
  standing,
  number,
  onMade,
  onNext,
  onHome,
}: {
  readonly designs: Designs;
  readonly standing: Standing;
  readonly number: string;
  readonly onMade: () => void;
  readonly onNext: () => void;
  readonly onHome: () => void;
}) {
  const titleId = useId();
  const steps = useSteps(order);
  const [badge, setBadge] = useState('');
  const [debris, setDebris] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [gps, setGps] = useState(false);
  const [address, setAddress] = useState(false);
  const [photos, setPhotos] = useState<readonly string[]>([]);
  const [again, setAgain] = useState('');
  const [wrong, setWrong] = useState(false);
  const [shown, setShown] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);

  const confirmed = (value: string) => {
    if (designs.confirm === 'no') {
      steps.onward();
      return;
    }
    setAsking({
      value,
      onward: () => {
        setAsking(null);
        steps.onward();
      },
    });
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
  const next = (enabled = true) => (
    <Button main isDisabled={!enabled} onPress={steps.onward}>
      {words.flow.next}
    </Button>
  );

  const shownStep = () => {
    switch (steps.step) {
      case 'badge':
        return frame(
          words.badge.truckTitle,
          <Button main isDisabled={badge.trim() === ''} onPress={steps.onward}>
            {words.badge.start}
          </Button>,
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
      case 'loading':
        return frame(
          words.loading.title,
          <>
            <Button main onPress={steps.onward}>
              {words.loading.complete}
            </Button>
            <Button wide onPress={onHome}>
              {words.loading.cancel}
            </Button>
          </>,
          <>
            <Truck badge={badge} />
            <p>{say(words.loading.started, { time: timeOfDay(world.now, world.timeZone) })}</p>
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
      case 'tag':
        return frame(
          words.tag.title,
          <>
            {next(tag !== null && tag !== '')}
            <Button
              wide
              onPress={() => {
                setTag('');
                steps.onward();
              }}
            >
              {words.tag.none}
            </Button>
          </>,
          <ListPicker
            labelledBy={titleId}
            choices={world.fieldTags.map((fieldTag) => ({ key: fieldTag, label: fieldTag }))}
            picked={tag === '' ? null : tag}
            onPick={(fieldTag) => {
              setTag(fieldTag);
              confirmed(fieldTag);
            }}
          />,
        );
      case 'place':
        return frame(
          words.place.title,
          next(),
          <>
            <Button
              wide
              onPress={() => {
                setGps(true);
              }}
            >
              {words.place.capture}
            </Button>
            {gps ? (
              <p>
                {say(words.place.captured, {
                  latitude: world.heron.latitude,
                  longitude: world.heron.longitude,
                })}
              </p>
            ) : null}
            <Button
              wide
              isDisabled={!gps}
              onPress={() => {
                setAddress(true);
              }}
            >
              {words.place.lookUp}
            </Button>
            {address ? (
              <p className="big-number">
                {say(words.place.address, { address: world.heron.address })}
              </p>
            ) : null}
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
            <dt>{words.review.debris}</dt>
            <dd>{debris ?? words.review.none}</dd>
            <dt>{words.review.tag}</dt>
            <dd>{tag === null || tag === '' ? words.review.none : tag}</dd>
            <dt>{words.review.place}</dt>
            <dd>
              {address
                ? world.heron.address
                : gps
                  ? `${world.heron.latitude}, ${world.heron.longitude}`
                  : words.review.none}
            </dd>
            <dt>{words.review.photos}</dt>
            <dd>{photos.length}</dd>
          </dl>,
        );
      case 'shown':
        return frame(words.number.shownTitle, next(), <NumberShown number={number} />);
      case 'again':
        return frame(
          words.number.againTitle,
          <Button
            main
            isDisabled={again === ''}
            onPress={() => {
              if (again === number) {
                onMade();
                steps.go('saved');
              } else {
                setWrong(true);
                setAgain('');
              }
            }}
          >
            {words.flow.submit}
          </Button>,
          <TypeAgain
            titleId={titleId}
            number={number}
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
            number={number}
            printed={printed}
            onPrint={() => {
              setPrinted(true);
            }}
          />,
        );
    }
  };

  return (
    <main data-screen="prototype-collection" className="screen">
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
