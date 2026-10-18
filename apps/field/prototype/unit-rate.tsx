// A unit rate ticket on the prototype (adms-field-app §4A.4, §4A.6): the crew badge, scanned once
// and kept as the working crew until the monitor changes it, shown on every ticket; the crew's
// photo; the kind of work by its payable type, by name; for a leaner, how it was measured and the
// inches on the keypad; photos; the review; the number the phone makes, shown and typed again;
// submitted, printed, the next ticket with the same crew.
import { useId, useState, type ReactNode } from 'react';

import {
  Banner,
  Button,
  ListPicker,
  NumberKeypad,
  PhotoStrip,
  ScanField,
  type Standing,
} from '../src/look/index.ts';
import { say } from '../src/words.ts';
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

type Step =
  | 'crew'
  | 'crewPhoto'
  | 'work'
  | 'measureHow'
  | 'inches'
  | 'photos'
  | 'review'
  | 'shown'
  | 'again'
  | 'saved';

const goesOn = new Set(['Hangers', 'Leaners']);

export function UnitRate({
  designs,
  standing,
  number,
  crew,
  onCrew,
  onMade,
  onNext,
  onHome,
}: {
  readonly designs: Designs;
  readonly standing: Standing;
  readonly number: string;
  // The working crew's badge, kept from one ticket to the next.
  readonly crew: string | null;
  readonly onCrew: (crew: string | null) => void;
  readonly onMade: () => void;
  readonly onNext: () => void;
  readonly onHome: () => void;
}) {
  const titleId = useId();
  const [badge, setBadge] = useState(crew ?? '');
  const [crewPhotos, setCrewPhotos] = useState<readonly string[]>([]);
  const [work, setWork] = useState<string | null>(null);
  const [how, setHow] = useState<'around' | 'across' | null>(null);
  const [inches, setInches] = useState('');
  const [photos, setPhotos] = useState<readonly string[]>([]);
  const [again, setAgain] = useState('');
  const [wrong, setWrong] = useState(false);
  const [shown, setShown] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);

  const order: Step[] = [
    ...(crew === null ? (['crew'] as const) : []),
    'crewPhoto',
    'work',
    ...(work === 'Leaners' ? (['measureHow', 'inches'] as const) : []),
    'photos',
    'review',
    'shown',
    'again',
    'saved',
  ];
  const steps = useSteps(order);
  const working = world.crews.find((held) => held.number === (crew ?? badge).trim());

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
  const measured =
    how === null || inches === ''
      ? words.review.none
      : say(words.unitRate.measured, {
          inches,
          how: how === 'around' ? words.unitRate.aroundShort : words.unitRate.acrossShort,
        });

  const shownStep = () => {
    switch (steps.step) {
      case 'crew':
        return frame(
          words.badge.crewTitle,
          <Button
            main
            isDisabled={badge.trim() === ''}
            onPress={() => {
              onCrew(badge.trim());
              steps.go('crewPhoto');
            }}
          >
            {words.flow.next}
          </Button>,
          <ScanField
            label={words.badge.label}
            value={badge}
            onChange={setBadge}
            onScan={() => {
              setBadge(world.crews[0].number);
            }}
          />,
        );
      case 'crewPhoto':
        return frame(
          words.unitRate.crewPhoto,
          <>
            {next()}
            <Button
              wide
              onPress={() => {
                onCrew(null);
                setBadge('');
                steps.go('crew');
              }}
            >
              {words.unitRate.changeCrew}
            </Button>
          </>,
          <>
            <Banner tone="info">
              <p>
                {say(words.unitRate.working, {
                  crew: working?.name ?? crew ?? badge,
                  number: crew ?? badge,
                })}
              </p>
            </Banner>
            <PhotoStrip
              photos={crewPhotos}
              atMost={world.photosAtMost}
              onTake={() => {
                setCrewPhotos([...crewPhotos, `crew-${String(crewPhotos.length + 1)}`]);
              }}
            />
          </>,
        );
      case 'work':
        return frame(
          words.unitRate.work,
          next(work !== null && goesOn.has(work)),
          <>
            <ListPicker
              labelledBy={titleId}
              choices={world.payableTypes.map((type) => ({ key: type, label: type }))}
              picked={work}
              onPick={(type) => {
                setWork(type);
                // A leaner's measurement adds its steps: the next is named, not read from the
                // steps as they stood before the pick.
                if (goesOn.has(type)) {
                  confirmed(type, () => {
                    steps.go(type === 'Leaners' ? 'measureHow' : 'photos');
                  });
                }
              }}
            />
            {work !== null && !goesOn.has(work) ? (
              <Banner tone="info" announced>
                <p>{words.unitRate.onlySome}</p>
              </Banner>
            ) : null}
          </>,
        );
      case 'measureHow':
        return frame(
          words.unitRate.measureHow,
          next(how !== null),
          <ListPicker
            labelledBy={titleId}
            choices={[
              { key: 'around', label: words.unitRate.around },
              { key: 'across', label: words.unitRate.across },
            ]}
            picked={how}
            onPick={(picked) => {
              const way = picked === 'around' ? 'around' : 'across';
              setHow(way);
              confirmed(way === 'around' ? words.unitRate.around : words.unitRate.across);
            }}
          />,
        );
      case 'inches':
        return frame(
          words.unitRate.inches,
          <Button
            main
            isDisabled={inches === '' || inches.endsWith('.')}
            onPress={() => {
              confirmed(`${inches} ${words.unitRate.unit}`);
            }}
          >
            {words.flow.next}
          </Button>,
          <NumberKeypad
            labelledBy={titleId}
            value={inches}
            onChange={setInches}
            digitsAtMost={4}
            decimal
            unit={words.unitRate.unit}
          />,
        );
      case 'photos':
        return frame(
          words.photos.title,
          next(),
          <>
            {photos.length === 0 ? (
              <Banner tone="notice">
                <p>{words.photos.required}</p>
              </Banner>
            ) : null}
            <PhotoStrip
              photos={photos}
              atMost={world.photosAtMost}
              onTake={() => {
                setPhotos([...photos, `photo-${String(photos.length + 1)}`]);
              }}
            />
          </>,
        );
      case 'review':
        return frame(
          words.review.title,
          <Button main onPress={steps.onward}>
            {words.review.right}
          </Button>,
          <dl className="facts">
            <dt>{words.review.crew}</dt>
            <dd>{working?.name ?? crew ?? badge}</dd>
            <dt>{words.review.work}</dt>
            <dd>{work ?? words.review.none}</dd>
            {work === 'Leaners' ? (
              <>
                <dt>{words.review.measured}</dt>
                <dd>{measured}</dd>
              </>
            ) : null}
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
    <main data-screen="prototype-unit-rate" className="screen">
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
