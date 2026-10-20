// Certifying on the phone (adms-certifications §3A; spec/parts/03-certification.md steps 1–11;
// adms-field-app §4A; BACKLOG 3.5.5, C118, C127, C129; REQ-322; AC-03-09, 14, 36, AC-11-42;
// ADR-015, 045, 070, 076, 080, 082, 108, 151, 179, 294, 320, 469, 477, 573, 585), from New to
// submitted.
//
// - **The number at New** (step 1): the phone's next cert number, shown, written on the placard
//   and the driver's badge and typed again; or a pre-printed sheet's own, typed twice (Q-142). A
//   number already in the phone's lists is said, never refused: the server answers it.
// - **Container or crew**, then **whose**: the prime picked; a sub typed into tier 1 or tier 2,
//   the prime's known subs of that tier offered as it is typed (ADR-108; AC-03-14); the two tiers
//   held to the domain's `CertificationSubs` before going on.
// - **The driver and the tag**, as the sheet has them (recorded, never checked: ADR-153).
// - **The vehicle type** picked from the firm's list of that kind, or typed (ADR-070); a crew's
//   crew type picked.
// - **A container's boxes** (steps 7–8): the primary, then each box's feature (picked or typed),
//   shape, whether it adds or subtracts and the measurements its shape holds, in whole inches;
//   **the capacity worked out by the domain's `Capacity` as they are entered, shown, never typed**
//   (AC-11-42); measurements that give none hold Next with the domain's own words. A crew is never
//   measured (invariant 10).
// - **Five views** (step 9), one photograph each, taken again in its place (ADR-179).
// - **Who certified it** (step 10): the monitor, recorded; a helper picked from the people
//   assigned with them (ADR-294; AC-03-36); the representatives' names. A modified truck's
//   certification names the one it replaces, and why (ADR-082).
// - The review, every value once; **sealed at submit** (ADR-477). Submitted, the number to write
//   on the placard and the badge is shown again.
//
// Nothing here waits on the server (ADR-030), and nothing is refused over eligibility (ADR-052):
// what the server's own rules refuse is answered at the sync, shown with its words and kept.
import type { PhoneAssignmentAnswer } from '@open-adms/contracts';
import {
  Capacity,
  CertificationChanges,
  CertificationSubs,
  boxShapes,
  boxSigns,
  certificationViews,
  type BoxShape,
  type BoxSign,
  type CertificationKind,
  type CertificationView,
  type Measurement,
} from '@open-adms/domain';
import { Fragment, useEffect, useId, useState, type ReactNode } from 'react';

import { TakePhoto } from './camera.tsx';
import { PhotoDrawn, Step, TypeAgain } from './capture.tsx';
import {
  Banner,
  Button,
  ListPicker,
  ListPicks,
  ListRow,
  StatusStrip,
  TextEntry,
  type Standing,
} from './look/index.ts';
import {
  capacityOf,
  emptyBox,
  type CertificationBox,
  type CertificationDetails,
  type PhoneCertification,
  type ViewPhoto,
} from './phone/certifications.ts';
import type { HeldLists } from './phone/lists.ts';
import type { SignedIn } from './phone/monitor.ts';
import type { CaptureParts } from './ticket-capture.tsx';
import { say, timeOfDay, words } from './words.ts';

const said = words.certify;
// How many characters a record keeps of a name or a number as written, of words typed, and of a
// box's inches and corners (the sync contract's).
const writtenLongest = 200;
const wordsLongest = 2000;
const numberLongest = 40;
const inchesLongest = 4;
const cornersLongest = 2;

// Where the certification is: New, being filled in, a box measured, a photograph shown, or
// submitted.
export type Certifying =
  | { readonly at: 'new' }
  | { readonly at: 'fill'; readonly id: string }
  | { readonly at: 'box'; readonly id: string; readonly position: number }
  | { readonly at: 'photo'; readonly id: string; readonly photoId: string }
  | { readonly at: 'submitted'; readonly id: string };

type CertifyStep =
  | 'kind'
  | 'prime'
  | 'subs'
  | 'driver'
  | 'tag'
  | 'type'
  | 'crewType'
  | 'primary'
  | 'boxes'
  | 'photos'
  | 'who'
  | 'notes'
  | 'review';

// The steps a certification takes: a container is measured, a crew never.
function stepsOf(kind: CertificationKind | null): CertifyStep[] {
  return [
    'kind',
    'prime',
    'subs',
    'driver',
    'tag',
    'type',
    ...(kind === 'CREW' ? (['crewType'] as const) : (['primary', 'boxes'] as const)),
    'photos',
    'who',
    'notes',
    'review',
  ];
}

// What home calls an open certification.
export const certificationTitle = (certification: Pick<PhoneCertification, 'certNumber'>) =>
  say(words.home.open.certification, { number: certification.certNumber });

// When it was begun, as home lists it.
export const certificationStarted = (certification: PhoneCertification): string =>
  say(words.home.open.started, {
    time: timeOfDay(new Date(certification.certifiedAt), certification.timeZone),
  });

// A day as the sheet's expiries are typed: 2026-10-09.
const isDay = (typed: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(typed) &&
  !Number.isNaN(Date.parse(`${typed}T00:00:00Z`)) &&
  new Date(`${typed}T00:00:00Z`).toISOString().startsWith(typed);

// Inches as typed: a whole number, or nothing yet; anything else is said.
const inchesOf = (typed: string): number | null =>
  /^\d+$/.test(typed.trim()) && Number(typed.trim()) >= 1 ? Number(typed.trim()) : null;

const inchesTyped = (value: number | null): string => (value === null ? '' : String(value));

export function CertificationCapture({
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
  readonly start: Certifying;
  readonly onHome: () => void;
  // What shows below every screen: the warning before the lock after inactivity.
  readonly after?: ReactNode;
}) {
  const [at, setAt] = useState<Certifying>(start);
  const certification = 'id' in at ? parts.certifications.certification(at.id) : undefined;

  switch (at.at) {
    case 'new':
      return (
        <NewCertification
          parts={parts}
          signedIn={signedIn}
          assignment={assignment}
          held={held}
          standing={standing}
          onOpened={(opened) => {
            setAt({ at: 'fill', id: opened.id });
          }}
          onCancel={onHome}
          below={after}
        />
      );
    case 'fill':
      if (certification === undefined) return null;
      return (
        <Certify
          key={certification.id}
          parts={parts}
          certification={certification}
          held={held}
          standing={standing}
          onBox={(position) => {
            setAt({ at: 'box', id: certification.id, position });
          }}
          onPhoto={(photoId) => {
            setAt({ at: 'photo', id: certification.id, photoId });
          }}
          onSubmitted={() => {
            setAt({ at: 'submitted', id: certification.id });
          }}
          onLeave={onHome}
          below={after}
        />
      );
    case 'box':
      if (certification === undefined) return null;
      return (
        <BoxMeasured
          key={`${certification.id}-${String(at.position)}`}
          parts={parts}
          certification={certification}
          position={at.position}
          held={held}
          standing={standing}
          onDone={() => {
            setAt({ at: 'fill', id: certification.id });
          }}
          below={after}
        />
      );
    case 'photo': {
      const photo = certification?.photos.find(({ id }) => id === at.photoId);
      if (certification === undefined || photo === undefined) return null;
      const label = viewLabel(certification, photo);
      return (
        <main data-screen="certification-photo" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <h1>{label}</h1>
            <PhotoDrawn tickets={parts.certifications} photo={photo} label={label} large />
          </div>
          <div className="screen-actions">
            <Button
              main
              wide
              onPress={() => {
                setAt({ at: 'fill', id: certification.id });
              }}
            >
              {said.photoBack}
            </Button>
          </div>
          {after}
        </main>
      );
    }
    case 'submitted': {
      if (certification === undefined) return null;
      const { capacityCy } = capacityOf(certification);
      return (
        <main data-screen="certification-submitted" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <h1>{say(said.submitted.title, { number: certification.certNumber })}</h1>
            <Banner tone="good" announced>
              <p>{said.submitted.saved}</p>
            </Banner>
            <dl className="facts">
              <dt>{said.review.number}</dt>
              <dd className="big-number">{certification.certNumber}</dd>
              {certification.kind === 'CREW' || capacityCy === null ? null : (
                <>
                  <dt>{said.review.capacity}</dt>
                  <dd>{say(said.cy, { capacity: capacityCy })}</dd>
                </>
              )}
            </dl>
            <p>{say(said.submitted.placard, { number: certification.certNumber })}</p>
            <p className="quiet">{said.submitted.sealed}</p>
          </div>
          <div className="screen-actions">
            <Button
              main
              wide
              onPress={() => {
                setAt({ at: 'new' });
              }}
            >
              {words.home.start.certification}
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
}

// What a view's photograph is called, to the eye and to a screen reader.
const viewLabel = (certification: Pick<PhoneCertification, 'timeZone'>, photo: ViewPhoto) =>
  say(said.taken, {
    view: said.views[photo.view],
    time: timeOfDay(new Date(photo.capturedAt), certification.timeZone),
  });

// New: the phone's next cert number, shown, written on the placard and the badge and typed again;
// or the pre-printed sheet's own, typed twice. It opens only once the two match.
function NewCertification({
  parts,
  signedIn,
  assignment,
  held,
  standing,
  onOpened,
  onCancel,
  below,
}: {
  readonly parts: CaptureParts;
  readonly signedIn: SignedIn;
  readonly assignment: PhoneAssignmentAnswer;
  readonly held: HeldLists;
  readonly standing: Standing;
  readonly onOpened: (certification: PhoneCertification) => void;
  readonly onCancel: () => void;
  readonly below?: ReactNode;
}) {
  const titleId = useId();
  const [made, setMade] = useState<string | null | undefined>(undefined);
  const [sheet, setSheet] = useState(false);
  const [typed, setTyped] = useState('');
  const [again, setAgain] = useState('');
  const [wrong, setWrong] = useState(false);
  useEffect(() => {
    let shown = true;
    void parts.certifications.nextCertNumber().then((next) => {
      if (shown) setMade(next);
    });
    return () => {
      shown = false;
    };
  }, [parts.certifications]);
  if (made === undefined) return null;

  const begin = (certNumber: string, from: 'MADE' | 'TYPED') => {
    void parts.certifications
      .begin({
        monitorId: signedIn.userId,
        projectId: assignment.project.id,
        timeZone: assignment.project.timeZone,
        assignmentId: assignment.id,
        step: 'kind',
        number: { certNumber, from },
      })
      .then(onOpened);
  };
  const frame = (title: string, actions: ReactNode, children: ReactNode) => (
    <main data-screen="new-certification" className="screen">
      <Step
        standing={standing}
        title={title}
        titleId={titleId}
        step={1}
        steps={1}
        onBack={onCancel}
        actions={
          <>
            {actions}
            <Button wide onPress={onCancel}>
              {said.cancel}
            </Button>
          </>
        }
      >
        {children}
      </Step>
      {below}
    </main>
  );

  if (sheet || made === null) {
    const written = typed.trim();
    const listed = held.lists.certifications.some((one) => one.certNumber === written);
    return frame(
      said.number.sheetTitle,
      <>
        <Button
          main
          wide
          isDisabled={written === '' || again.trim() === ''}
          onPress={() => {
            if (again.trim() !== written) {
              setWrong(true);
              setAgain('');
              return;
            }
            begin(written, 'TYPED');
          }}
        >
          {said.number.open}
        </Button>
        {made === null ? null : (
          <Button
            wide
            onPress={() => {
              setSheet(false);
              setWrong(false);
            }}
          >
            {said.number.made}
          </Button>
        )}
      </>,
      <>
        {made === null ? (
          <Banner tone="notice">
            <p>{said.number.none}</p>
          </Banner>
        ) : null}
        {wrong ? (
          <Banner tone="problem" announced>
            <p>{said.number.wrong}</p>
          </Banner>
        ) : null}
        {listed ? (
          <Banner tone="notice" announced>
            <p>{say(said.number.held, { number: written })}</p>
          </Banner>
        ) : null}
        <TextEntry
          label={said.number.sheetLabel}
          value={typed}
          onChange={setTyped}
          longest={numberLongest}
        />
        <TextEntry
          label={said.number.sheetAgain}
          value={again}
          onChange={setAgain}
          longest={numberLongest}
        />
      </>,
    );
  }

  return frame(
    said.number.againTitle,
    <>
      <Button
        main
        wide
        isDisabled={typed === ''}
        onPress={() => {
          if (typed !== made) {
            setWrong(true);
            setTyped('');
            return;
          }
          begin(made, 'MADE');
        }}
      >
        {said.number.open}
      </Button>
      <Button
        wide
        onPress={() => {
          setSheet(true);
          setTyped('');
          setWrong(false);
        }}
      >
        {said.number.sheet}
      </Button>
    </>,
    <>
      <dl className="facts">
        <dt>{said.number.shown}</dt>
        <dd className="big-number">{made}</dd>
      </dl>
      <p>{said.number.noteIt}</p>
      <TypeAgain titleId={titleId} number={made} value={typed} onChange={setTyped} wrong={wrong} />
    </>,
  );
}

// What the certifying screens hold typed and not yet kept.
type Typed =
  | 'firstTierSub'
  | 'secondTierSub'
  | 'driverName'
  | 'driverPhone'
  | 'driverLicenceNumber'
  | 'driverLicenceState'
  | 'driverLicenceExpiry'
  | 'tagNumber'
  | 'tagState'
  | 'tagExpiry'
  | 'vehicleTypeOther'
  | 'clientRepresentativeName'
  | 'contractorRepresentativeName'
  | 'notes'
  | 'reason'
  | 'length'
  | 'width'
  | 'height';

// A certification being filled in: its steps as its kind has them, kept at once.
function Certify({
  parts,
  certification,
  held,
  standing,
  onBox,
  onPhoto,
  onSubmitted,
  onLeave,
  below,
}: {
  readonly parts: CaptureParts;
  readonly certification: PhoneCertification;
  readonly held: HeldLists;
  readonly standing: Standing;
  readonly onBox: (position: number) => void;
  readonly onPhoto: (photoId: string) => void;
  readonly onSubmitted: () => void;
  readonly onLeave: () => void;
  readonly below?: ReactNode;
}) {
  const titleId = useId();
  const { lists } = held;
  const [now, setNow] = useState(certification);
  const steps = stepsOf(now.kind);
  const [step, setStep] = useState<CertifyStep>(
    steps.find((one) => one === certification.step) ?? 'kind',
  );
  const primary = certification.boxes[0];
  const [typed, setTyped] = useState<Readonly<Record<Typed, string>>>(() => ({
    firstTierSub: certification.firstTierSub ?? '',
    secondTierSub: certification.secondTierSub ?? '',
    driverName: certification.driverName ?? '',
    driverPhone: certification.driverPhone ?? '',
    driverLicenceNumber: certification.driverLicenceNumber ?? '',
    driverLicenceState: certification.driverLicenceState ?? '',
    driverLicenceExpiry: certification.driverLicenceExpiry ?? '',
    tagNumber: certification.tagNumber ?? '',
    tagState: certification.tagState ?? '',
    tagExpiry: certification.tagExpiry ?? '',
    vehicleTypeOther: certification.vehicleTypeOther ?? '',
    clientRepresentativeName: certification.clientRepresentativeName ?? '',
    contractorRepresentativeName: certification.contractorRepresentativeName ?? '',
    notes: certification.notes ?? '',
    reason: certification.replaces?.reason ?? '',
    length: inchesTyped(primary?.length ?? null),
    width: inchesTyped(primary?.width ?? null),
    height: inchesTyped(primary?.height ?? null),
  }));
  const [otherType, setOtherType] = useState(certification.vehicleTypeOther !== null);
  const [replacing, setReplacing] = useState(certification.replaces !== null);
  const [replacedId, setReplacedId] = useState(certification.replaces?.replacedId ?? null);
  const [cancelling, setCancelling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notKept, setNotKept] = useState<string | null>(null);
  const place = Math.max(0, steps.indexOf(step));
  const typing = (name: Typed) => (value: string) => {
    setTyped((before) => ({ ...before, [name]: value }));
  };
  const text = (name: Typed): string | null => {
    const value = typed[name].trim();
    return value === '' ? null : value;
  };

  // Kept at once, merged with what the phone holds now, never this screen's copy alone.
  const changed = async (change: Partial<CertificationDetails> & { readonly step?: string }) => {
    const next = await parts.certifications.changed(now.id, change);
    setNow(next);
    return next;
  };
  const go = (to: CertifyStep | undefined) => {
    if (to === undefined) return;
    setStep(to);
    void changed({ step: to });
  };
  const onward = () => {
    go(steps[steps.indexOf(step) + 1]);
  };
  const back = () => {
    const before = steps[place - 1];
    if (before !== undefined) go(before);
  };
  const frame = (title: string, actions: ReactNode, children?: ReactNode) => (
    <main data-screen="certify" className="screen">
      <Step
        standing={standing}
        title={title}
        titleId={titleId}
        step={place + 1}
        steps={steps.length}
        onBack={place === 0 ? undefined : back}
        actions={
          <>
            {actions}
            <Button wide onPress={onLeave}>
              {words.capture.leave}
            </Button>
            <Button
              wide
              onPress={() => {
                setCancelling(true);
              }}
            >
              {said.cancel}
            </Button>
          </>
        }
      >
        <p>{certificationTitle(now)}</p>
        {children}
      </Step>
      {below}
    </main>
  );
  const next = (enabled: boolean, onPress: () => void) => (
    <Button main wide isDisabled={!enabled} onPress={onPress}>
      {words.capture.next}
    </Button>
  );
  const prime = lists.primes.find(({ id }) => id === now.primeId);

  if (cancelling) {
    return (
      <main data-screen="cancel-certification" className="screen">
        <StatusStrip standing={standing} />
        <div className="screen-body">
          <h1>{say(said.cancelTitle, { number: now.certNumber })}</h1>
          <p>{said.cancelAbout}</p>
        </div>
        <div className="screen-actions">
          <Button
            main
            wide
            onPress={() => {
              setCancelling(false);
            }}
          >
            {said.cancelNo}
          </Button>
          <Button
            wide
            onPress={() => {
              void parts.certifications.cancel(now.id).then(onLeave);
            }}
          >
            {said.cancelYes}
          </Button>
        </div>
        {below}
      </main>
    );
  }

  switch (step) {
    case 'kind':
      return frame(
        said.kindTitle,
        next(now.kind !== null, () => {
          onward();
        }),
        <ListPicker
          labelledBy={titleId}
          choices={(['CONTAINER', 'CREW'] as const).map((kind) => ({
            key: kind,
            label: said.kinds[kind],
          }))}
          picked={now.kind}
          onPick={(picked) => {
            void changed({ kind: picked as CertificationKind });
          }}
        />,
      );
    case 'prime':
      return frame(
        said.primeTitle,
        next(now.primeId !== null, () => {
          onward();
        }),
        lists.primes.length === 0 ? (
          <Banner tone="notice">
            <p>{said.noPrimes}</p>
          </Banner>
        ) : (
          <ListPicker
            labelledBy={titleId}
            choices={lists.primes.map(({ id, name }) => ({ key: id, label: name }))}
            picked={now.primeId}
            onPick={(primeId) => {
              void changed({ primeId });
            }}
          />
        ),
      );
    case 'subs': {
      const refusal =
        prime === undefined
          ? null
          : new CertificationSubs(prime.id, prime.name).check(
              CertificationSubs.typed(typed.firstTierSub),
              CertificationSubs.typed(typed.secondTierSub),
            );
      return frame(
        said.subsTitle,
        next(refusal === null, () => {
          void changed({
            firstTierSub: text('firstTierSub'),
            secondTierSub: text('secondTierSub'),
          }).then(() => {
            onward();
          });
        }),
        <>
          <p>{said.subsAbout}</p>
          {refusal === null ? null : (
            <Banner tone="problem" announced>
              <p>{refusal.message}</p>
            </Banner>
          )}
          <SubTyped
            label={said.firstTier}
            tier={1}
            prime={prime}
            value={typed.firstTierSub}
            onChange={typing('firstTierSub')}
          />
          <SubTyped
            label={said.secondTier}
            tier={2}
            prime={prime}
            value={typed.secondTierSub}
            onChange={typing('secondTierSub')}
          />
        </>,
      );
    }
    case 'driver': {
      const expiry = typed.driverLicenceExpiry.trim();
      const badDay = expiry !== '' && !isDay(expiry);
      return frame(
        said.driverTitle,
        next(!badDay, () => {
          void changed({
            driverName: text('driverName'),
            driverPhone: text('driverPhone'),
            driverLicenceNumber: text('driverLicenceNumber'),
            driverLicenceState: text('driverLicenceState'),
            driverLicenceExpiry: text('driverLicenceExpiry'),
          }).then(() => {
            onward();
          });
        }),
        <>
          {(
            [
              ['driverName', said.driverName],
              ['driverPhone', said.driverPhone],
              ['driverLicenceNumber', said.licenceNumber],
              ['driverLicenceState', said.licenceState],
              ['driverLicenceExpiry', said.licenceExpiry],
            ] as const
          ).map(([name, label]) => (
            <TextEntry
              key={name}
              label={label}
              value={typed[name]}
              onChange={typing(name)}
              longest={name === 'driverLicenceExpiry' ? 10 : writtenLongest}
            />
          ))}
          {badDay ? <p role="status">{say(said.notADay, { label: said.licenceExpiry })}</p> : null}
        </>,
      );
    }
    case 'tag': {
      const expiry = typed.tagExpiry.trim();
      const badDay = expiry !== '' && !isDay(expiry);
      return frame(
        said.tagTitle,
        next(!badDay, () => {
          void changed({
            tagNumber: text('tagNumber'),
            tagState: text('tagState'),
            tagExpiry: text('tagExpiry'),
          }).then(() => {
            onward();
          });
        }),
        <>
          {(
            [
              ['tagNumber', said.tagNumber],
              ['tagState', said.tagState],
              ['tagExpiry', said.tagExpiry],
            ] as const
          ).map(([name, label]) => (
            <TextEntry
              key={name}
              label={label}
              value={typed[name]}
              onChange={typing(name)}
              longest={name === 'tagExpiry' ? 10 : writtenLongest}
            />
          ))}
          {badDay ? <p role="status">{say(said.notADay, { label: said.tagExpiry })}</p> : null}
        </>,
      );
    }
    case 'type': {
      const kind = now.kind ?? 'CONTAINER';
      const other = text('vehicleTypeOther');
      return frame(
        said.typeTitle,
        next(!otherType || other !== null, () => {
          void changed(
            otherType
              ? { vehicleTypeId: null, vehicleTypeOther: other }
              : { vehicleTypeOther: null },
          ).then(() => {
            onward();
          });
        }),
        <>
          <ListPicker
            labelledBy={titleId}
            choices={[
              ...lists.vehicleTypes
                .filter((type) => type.kind === kind)
                .map(({ id, name }) => ({ key: id, label: name })),
              { key: 'other', label: said.other },
            ]}
            picked={otherType ? 'other' : now.vehicleTypeId}
            onPick={(picked) => {
              if (picked === 'other') {
                setOtherType(true);
                return;
              }
              setOtherType(false);
              void changed({ vehicleTypeId: picked, vehicleTypeOther: null });
            }}
          />
          {otherType ? (
            <TextEntry
              label={said.typeOther}
              value={typed.vehicleTypeOther}
              onChange={typing('vehicleTypeOther')}
              longest={writtenLongest}
            />
          ) : null}
        </>,
      );
    }
    case 'crewType':
      return frame(
        said.crewTypeTitle,
        next(true, () => {
          onward();
        }),
        <ListPicker
          labelledBy={titleId}
          choices={lists.crewTypes.map(({ id, name }) => ({ key: id, label: name }))}
          picked={now.crewTypeId}
          onPick={(crewTypeId) => {
            void changed({ crewTypeId });
          }}
        />,
      );
    case 'primary': {
      const measured = {
        length: inchesOf(typed.length),
        width: inchesOf(typed.width),
        height: inchesOf(typed.height),
      };
      const whole = measured.length !== null && measured.width !== null && measured.height !== null;
      return frame(
        said.primaryTitle,
        next(whole, () => {
          void changed({
            boxes: [{ ...emptyBox, ...measured }, ...now.boxes.slice(1)],
          }).then(() => {
            onward();
          });
        }),
        <>
          <p>{said.primaryAbout}</p>
          {(['length', 'width', 'height'] as const).map((name) => (
            <InchesTyped
              key={name}
              label={said.measurements[name]}
              value={typed[name]}
              onChange={typing(name)}
              longest={inchesLongest}
            />
          ))}
        </>,
      );
    }
    case 'boxes': {
      const reading = capacityOf(now);
      const featureless = now.boxes
        .slice(1)
        .some((box) => box.featureId === null && box.featureOther === null);
      return frame(
        said.boxesTitle,
        next(reading.capacityCy !== null && !featureless, () => {
          onward();
        }),
        <>
          <p>{said.boxesAbout}</p>
          <CapacityShown reading={reading} />
          {featureless ? <p role="status">{said.needsFeature}</p> : null}
          <ul className="list-rows">
            {now.boxes.map((box, position) => {
              const volume = reading.boxes.find((one) => one.position === position)?.cubicInches;
              const detail = say(said.boxDetail, {
                shape: said.shapes[box.shape],
                sign: said.signs[box.sign],
              });
              return (
                <li key={position}>
                  <ListRow
                    label={
                      position === 0
                        ? said.primaryRow
                        : say(said.boxRow, {
                            number: position,
                            feature: featureName(box, lists.vehicleFeatures),
                          })
                    }
                    detail={
                      volume === undefined
                        ? detail
                        : `${detail} · ${say(said.boxVolume, { volume })}`
                    }
                    onPress={() => {
                      if (position === 0) go('primary');
                      else onBox(position);
                    }}
                  />
                </li>
              );
            })}
          </ul>
          <Button
            wide
            onPress={() => {
              void changed({ boxes: [...now.boxes, emptyBox] }).then((after) => {
                onBox(after.boxes.length - 1);
              });
            }}
          >
            {said.addBox}
          </Button>
        </>,
      );
    }
    case 'photos':
      return frame(
        said.photosTitle,
        next(true, () => {
          onward();
        }),
        <>
          <p>{said.photosAbout}</p>
          {certificationViews.map((view) => (
            <ViewPhotoField
              key={view}
              view={view}
              certification={now}
              parts={parts}
              onTaken={async (bytes) => {
                const where = await parts.locator.where();
                const photo = await parts.certifications.photographed(
                  now.id,
                  view,
                  bytes,
                  where.kind === 'fix' ? where.fix : null,
                );
                const after = parts.certifications.certification(now.id);
                if (after !== undefined) setNow(after);
                return photo !== null;
              }}
              onOpen={onPhoto}
            />
          ))}
        </>,
      );
    case 'who': {
      const helpersId = `${titleId}-helpers`;
      return frame(
        said.whoTitle,
        next(true, () => {
          void changed({
            clientRepresentativeName: text('clientRepresentativeName'),
            contractorRepresentativeName: text('contractorRepresentativeName'),
          }).then(() => {
            onward();
          });
        }),
        <>
          <h2 id={helpersId}>{said.helpers}</h2>
          {lists.helpers.length === 0 ? (
            <p>{said.noHelpers}</p>
          ) : (
            <ListPicks
              labelledBy={helpersId}
              choices={lists.helpers.map(({ id, name }) => ({ key: id, label: name }))}
              picked={now.helperIds}
              onPicked={(helperIds) => {
                void changed({ helperIds });
              }}
            />
          )}
          <TextEntry
            label={said.clientRep}
            value={typed.clientRepresentativeName}
            onChange={typing('clientRepresentativeName')}
            longest={writtenLongest}
          />
          <TextEntry
            label={said.contractorRep}
            value={typed.contractorRepresentativeName}
            onChange={typing('contractorRepresentativeName')}
            longest={writtenLongest}
          />
        </>,
      );
    }
    case 'notes': {
      const replacesId = `${titleId}-replaces`;
      const refusal =
        replacing && replacedId !== null
          ? new CertificationChanges(now.certNumber).replacement(typed.reason)
          : null;
      return frame(
        said.notesTitle,
        next(refusal === null, () => {
          const reason = text('reason');
          void changed({
            notes: text('notes'),
            replaces:
              replacing && replacedId !== null && reason !== null ? { replacedId, reason } : null,
          }).then(() => {
            onward();
          });
        }),
        <>
          <TextEntry
            label={said.notes}
            value={typed.notes}
            onChange={typing('notes')}
            longest={wordsLongest}
          />
          {replacing ? (
            <>
              <h2 id={replacesId}>{said.replacesTitle}</h2>
              <ListPicker
                labelledBy={replacesId}
                choices={parts.certifications
                  .replaceable(now.projectId, lists)
                  .filter(({ id }) => id !== now.id)
                  .map(({ id, certNumber }) => ({ key: id, label: certNumber }))}
                picked={replacedId}
                onPick={setReplacedId}
              />
              {refusal === null ? null : (
                <Banner tone="problem" announced>
                  <p>{refusal.message}</p>
                </Banner>
              )}
              <TextEntry
                label={said.replacesReason}
                value={typed.reason}
                onChange={typing('reason')}
                longest={wordsLongest}
              />
              <Button
                wide
                onPress={() => {
                  setReplacing(false);
                  setReplacedId(null);
                }}
              >
                {said.replacesNot}
              </Button>
            </>
          ) : (
            <Button
              wide
              onPress={() => {
                setReplacing(true);
              }}
            >
              {said.replaces}
            </Button>
          )}
        </>,
      );
    }
    case 'review':
      return frame(
        said.review.title,
        <Button
          main
          wide
          isDisabled={submitting}
          onPress={() => {
            setSubmitting(true);
            setNotKept(null);
            void parts.certifications.submit(now.id).then((outcome) => {
              setSubmitting(false);
              if (outcome.kind === 'sealed') onSubmitted();
              else setNotKept(outcome.notice.message);
            });
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
          <Reviewed certification={now} held={held} parts={parts} />
          <h2>{said.review.photos}</h2>
          {now.photos.length === 0 ? (
            <p>{said.review.none}</p>
          ) : (
            <ul className="photo-strip-photos">
              {now.photos.map((photo) => (
                <li key={photo.id}>
                  <PhotoDrawn
                    tickets={parts.certifications}
                    photo={photo}
                    label={viewLabel(now, photo)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>,
      );
  }
}

// A box's feature, by name: the firm's picked, or the one typed.
function featureName(
  box: CertificationBox,
  features: readonly { readonly id: string; readonly name: string }[],
): string {
  return (
    box.featureOther ?? features.find(({ id }) => id === box.featureId)?.name ?? said.review.none
  );
}

// The capacity the boxes work out to, or why there is none yet, in the domain's own words.
function CapacityShown({ reading }: { readonly reading: ReturnType<typeof capacityOf> }) {
  if (reading.capacityCy === null || reading.cubicYards === null) {
    return (
      <Banner tone="notice">
        <p role="status">{say(said.noCapacity, { reason: reading.refusal?.message ?? '' })}</p>
      </Banner>
    );
  }
  return (
    <div role="status">
      <dl className="facts">
        <dt>{said.review.capacity}</dt>
        <dd className="big-number">{say(said.cy, { capacity: reading.capacityCy })}</dd>
      </dl>
      <p className="quiet">{say(said.worked, { cubicYards: reading.cubicYards })}</p>
    </div>
  );
}

// Whole inches typed, with a calm word where what is typed isn't one.
function InchesTyped({
  label,
  value,
  onChange,
  longest,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly longest: number;
}) {
  const wrong = value.trim() !== '' && inchesOf(value) === null;
  return (
    <>
      <TextEntry label={label} value={value} onChange={onChange} whole longest={longest} />
      {wrong ? <p role="status">{say(said.notWhole, { label })}</p> : null}
    </>
  );
}

// A sub typed into its tier, the prime's known subs of that tier offered as it is typed: a pick
// fills the name in, and anything else is typed whole (ADR-108; AC-03-14).
function SubTyped({
  label,
  tier,
  prime,
  value,
  onChange,
}: {
  readonly label: string;
  readonly tier: 1 | 2;
  readonly prime: HeldLists['lists']['primes'][number] | undefined;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const knownId = useId();
  const typedNow = value.trim().toLowerCase();
  const known = (prime?.subs ?? []).filter(
    (sub) => sub.tier === tier && (typedNow === '' || sub.name.toLowerCase().includes(typedNow)),
  );
  return (
    <>
      <TextEntry label={label} value={value} onChange={onChange} longest={writtenLongest} />
      {prime === undefined || known.length === 0 ? null : (
        <>
          <p id={knownId}>{say(said.known, { prime: prime.name, tier })}</p>
          <ListPicker
            labelledBy={knownId}
            choices={known.map(({ name }) => ({ key: name, label: name }))}
            picked={known.find(({ name }) => CertificationSubs.sameName(name, value))?.name ?? null}
            onPick={onChange}
          />
        </>
      )}
    </>
  );
}

// One of the five views: its photograph, shown and opened full size, or the way to take it.
function ViewPhotoField({
  view,
  certification,
  parts,
  onTaken,
  onOpen,
}: {
  readonly view: CertificationView;
  readonly certification: PhoneCertification;
  readonly parts: CaptureParts;
  readonly onTaken: (bytes: Uint8Array) => Promise<boolean>;
  readonly onOpen: (photoId: string) => void;
}) {
  const photo = certification.photos.find((one) => one.view === view);
  const name = said.views[view];
  return (
    <section className="field">
      <h2 className="field-label">{name}</h2>
      {photo === undefined ? (
        <p>{said.noPhoto}</p>
      ) : (
        <Button
          wide
          aria-label={say(said.open, { view: name })}
          onPress={() => {
            onOpen(photo.id);
          }}
        >
          <PhotoDrawn
            tickets={parts.certifications}
            photo={photo}
            label={viewLabel(certification, photo)}
          />
        </Button>
      )}
      <TakePhoto camera={parts.camera} onTaken={onTaken}>
        {say(photo === undefined ? said.take : said.retake, { view: name })}
      </TakePhoto>
    </section>
  );
}

// One box measured, after the primary: its feature picked or typed, its shape, whether it adds or
// subtracts, and the measurements its shape holds (the domain's `Capacity.measurementsOf`); what
// it works out to, and the capacity or why there is none, shown as it is typed. Back keeps it as
// it stands.
function BoxMeasured({
  parts,
  certification,
  position,
  held,
  standing,
  onDone,
  below,
}: {
  readonly parts: CaptureParts;
  readonly certification: PhoneCertification;
  readonly position: number;
  readonly held: HeldLists;
  readonly standing: Standing;
  readonly onDone: () => void;
  readonly below?: ReactNode;
}) {
  const titleId = useId();
  const featureId = useId();
  const shapeId = useId();
  const signId = useId();
  const { vehicleFeatures } = held.lists;
  const kept = certification.boxes[position] ?? emptyBox;
  const [box, setBox] = useState(kept);
  const [other, setOther] = useState(kept.featureOther !== null);
  const [otherName, setOtherName] = useState(kept.featureOther ?? '');
  const [inches, setInches] = useState<Readonly<Partial<Record<Measurement, string>>>>(() =>
    Object.fromEntries(
      (
        [
          'length',
          'secondLength',
          'width',
          'height',
          'diameter',
          'radius',
          'run',
          'corners',
        ] as const
      ).map((name) => [name, inchesTyped(kept[name])]),
    ),
  );
  const measured: CertificationBox = {
    ...box,
    featureId: other ? null : box.featureId,
    featureOther: other ? (otherName.trim() === '' ? null : otherName.trim()) : null,
    length: inchesOf(inches.length ?? ''),
    secondLength: inchesOf(inches.secondLength ?? ''),
    width: inchesOf(inches.width ?? ''),
    height: inchesOf(inches.height ?? ''),
    diameter: inchesOf(inches.diameter ?? ''),
    radius: inchesOf(inches.radius ?? ''),
    run: inchesOf(inches.run ?? ''),
    corners: inchesOf(inches.corners ?? ''),
  };
  const boxes = certification.boxes.map((one, at) => (at === position ? measured : one));
  const reading = capacityOf({ kind: 'CONTAINER', boxes });
  const volume = reading.boxes.find((one) => one.position === position)?.cubicInches;
  const hasFeature = measured.featureId !== null || measured.featureOther !== null;
  const keep = (next: readonly CertificationBox[]) => {
    void parts.certifications.changed(certification.id, { boxes: next }).then(onDone);
  };

  return (
    <main data-screen="certify-box" className="screen">
      <Step
        standing={standing}
        title={say(said.boxTitle, { number: position })}
        titleId={titleId}
        step={1}
        steps={1}
        onBack={() => {
          keep(boxes);
        }}
        actions={
          <>
            <Button
              main
              wide
              isDisabled={!hasFeature}
              onPress={() => {
                keep(boxes);
              }}
            >
              {said.boxDone}
            </Button>
            <Button
              wide
              onPress={() => {
                keep(certification.boxes.filter((_one, at) => at !== position));
              }}
            >
              {said.boxRemove}
            </Button>
          </>
        }
      >
        <h2 id={featureId}>{said.feature}</h2>
        <ListPicker
          labelledBy={featureId}
          choices={[
            ...vehicleFeatures.map(({ id, name }) => ({ key: id, label: name })),
            { key: 'other', label: said.other },
          ]}
          picked={other ? 'other' : box.featureId}
          onPick={(picked) => {
            if (picked === 'other') {
              setOther(true);
              return;
            }
            setOther(false);
            setBox((before) => ({ ...before, featureId: picked, featureOther: null }));
          }}
        />
        {other ? (
          <TextEntry
            label={said.featureOther}
            value={otherName}
            onChange={setOtherName}
            longest={writtenLongest}
          />
        ) : null}
        {hasFeature ? null : <p role="status">{said.needsFeature}</p>}
        <h2 id={shapeId}>{said.shape}</h2>
        <ListPicker
          labelledBy={shapeId}
          choices={boxShapes.map((shape) => ({ key: shape, label: said.shapes[shape] }))}
          picked={box.shape}
          onPick={(picked) => {
            setBox((before) => ({ ...before, shape: picked as BoxShape }));
          }}
        />
        <h2 id={signId}>{said.sign}</h2>
        <ListPicker
          labelledBy={signId}
          choices={boxSigns.map((sign) => ({ key: sign, label: said.signs[sign] }))}
          picked={box.sign}
          onPick={(picked) => {
            setBox((before) => ({ ...before, sign: picked as BoxSign }));
          }}
        />
        {Capacity.measurementsOf(box.shape).map((name) => (
          <InchesTyped
            key={name}
            label={said.measurements[name]}
            value={inches[name] ?? ''}
            onChange={(value) => {
              setInches((before) => ({ ...before, [name]: value }));
            }}
            longest={name === 'corners' ? cornersLongest : inchesLongest}
          />
        ))}
        {volume === undefined ? null : <p role="status">{say(said.boxVolume, { volume })}</p>}
        <CapacityShown reading={reading} />
      </Step>
      {below}
    </main>
  );
}

// Everything a certification holds, once.
function Reviewed({
  certification,
  held,
  parts,
}: {
  readonly certification: PhoneCertification;
  readonly held: HeldLists;
  readonly parts: CaptureParts;
}) {
  const review = said.review;
  const { lists } = held;
  const shown = (value: string | null) => value ?? review.none;
  const named = (list: readonly { id: string; name: string }[], id: string | null) =>
    list.find((one) => one.id === id)?.name ?? review.none;
  const joined = (...values: (string | null)[]) => {
    const some = values.filter((value): value is string => value !== null);
    return some.length === 0 ? review.none : some.join(' · ');
  };
  const reading = capacityOf(certification);
  const rows: [string, string][] = [
    [review.number, certification.certNumber],
    [review.kind, certification.kind === null ? review.none : said.kinds[certification.kind]],
    [review.prime, named(lists.primes, certification.primeId)],
    [review.firstTier, shown(CertificationSubs.typed(certification.firstTierSub))],
    [review.secondTier, shown(CertificationSubs.typed(certification.secondTierSub))],
    [review.driver, joined(certification.driverName, certification.driverPhone)],
    [
      review.licence,
      joined(
        certification.driverLicenceNumber,
        certification.driverLicenceState,
        certification.driverLicenceExpiry,
      ),
    ],
    [review.tag, joined(certification.tagNumber, certification.tagState, certification.tagExpiry)],
    [
      review.type,
      certification.vehicleTypeOther ?? named(lists.vehicleTypes, certification.vehicleTypeId),
    ],
  ];
  if (certification.kind === 'CREW') {
    rows.push([review.crewType, named(lists.crewTypes, certification.crewTypeId)]);
  } else {
    rows.push([
      review.capacity,
      reading.capacityCy === null ? review.none : say(said.cy, { capacity: reading.capacityCy }),
    ]);
  }
  const helpers = certification.helperIds.map((id) => named(lists.helpers, id));
  const replaced = parts.certifications
    .replaceable(certification.projectId, lists)
    .find(({ id }) => id === certification.replaces?.replacedId);
  rows.push(
    [review.helpers, helpers.length === 0 ? review.none : helpers.join(', ')],
    [review.clientRep, shown(certification.clientRepresentativeName)],
    [review.contractorRep, shown(certification.contractorRepresentativeName)],
    [
      review.replaces,
      certification.replaces === null || replaced === undefined
        ? review.none
        : `${replaced.certNumber} · ${certification.replaces.reason}`,
    ],
    [review.notes, shown(certification.notes)],
  );
  return (
    <dl className="facts">
      {rows.map(([term, value]) => (
        <Fragment key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
