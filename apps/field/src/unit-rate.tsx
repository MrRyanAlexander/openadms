// A unit rate ticket's steps, on the phone (adms-field-app §4A.4, §4A.6; adms-ticket-workflows
// §4.5; BACKLOG 3.5.3; REQ-112b, 306, 320; AC-04-70, AC-11-43, 78, 79, 90, 91; ADR-111, 157, 177,
// 198, 207, 210, 213, 477, 571, 573, 583, 590…592). New takes the crew (`new-ticket.tsx`), and the
// ticket comes straight here, never to a load's open ticket (the user, ADR-592).
//
// **The steps** (the user, ADR-592): **the crew** (a new crew's photo; the working crew kept goes
// on past it); **what work it is, by its payable type, by name**, each once (ADR-207, 213), so it
// sets up what comes next; never a field tag (the user, ADR-591); then **the kind of work's own
// screen** (the domain's `PhoneUnitRate`, REQ-112b): a count where it isn't always one; a tree
// measured, around or across, in inches to a tenth (ADR-177); a stump's diameter two feet up, its
// root ball, whether half or more is exposed and its survey number (ADR-198), the exposure asked
// only where a root ball is measured (`PhoneUnitRate.asksExposure`, ADR-605); items with a count
// each, or with hours each to the quarter hour (ADR-084). **The pay item is worked out from the
// bands as the work is entered** and kept on the ticket to print: **never shown, nor any rate**
// (invariant 20; AC-11-43). "Ineligible" is offered where that pay item allows the monitor to mark
// it (ADR-210); an ROE where the phone holds the project's; **one point**, where the work was done
// (REQ-306); photos; **the review, every value once, the crew first, and submitted for that
// crew**: its confirmation on each completion (REQ-320; the user, Q-215, ADR-573).
//
// **Work photographed by stage** (the user, ADR-590, 592; AC-11-90, 91): where the kind of work
// says so (Hangers, Leaners and Stumps as shipped), the work picked opens **the ticket's
// dashboard**: its crew, its number and three buttons, pre-work, measurement and post-work, each
// to do in the notice colour or done in the good colour, with its word and icon (never colour
// alone), the next one to do edged. **Each opens its own part and drops back to the dashboard once
// done**: the pre-work and post-work photos straight from the camera; the measurement its photo,
// then the kind of work's own screen. The ticket is left between them and opened again from home
// at its dashboard, home saying the next stage. Each stage has one photograph, taken again in its
// place; there is no step for other photos. Complete goes on to where the work was done and the
// review, which shows **each stage's photograph large, under its stage**.
//
// Nothing here waits on the server (ADR-030; AC-11-05), and nothing is refused (ADR-052): a value
// left out is flagged after sync, and a stage left without its photograph never holds Complete.
// Every value entered is kept on the phone at once.
import type { PhoneListsRecord } from '@open-adms/contracts';
import {
  PhoneUnitRate,
  photoStages,
  ticketPhotosAtMost,
  type PhotoStage,
  type UnitRateAsked,
} from '@open-adms/domain';
import { useId, useState, type ReactNode } from 'react';
import { Button as Pressable } from 'react-aria-components';

import { TakePhoto } from './camera.tsx';
import {
  CancelTicket,
  PhotoDrawn,
  photoLabel,
  PlaceFields,
  Step,
  TicketPhotos,
  TruckFacts,
  typedAddressChange,
} from './capture.tsx';
import { Camera as CameraIcon, Clock, Tick } from './look/icons.tsx';
import {
  Banner,
  Button,
  ListPicker,
  NumberKeypad,
  TextEntry,
  type Standing,
} from './look/index.ts';
import type { HeldLists } from './phone/lists.ts';
import type { PhoneTicket, TicketDetails, TicketItem } from './phone/tickets.ts';
import type { CaptureParts } from './ticket-capture.tsx';
import { say, timeOfDay, words } from './words.ts';

const said = words.capture;

type UnitRateStep =
  | 'crew'
  | 'work'
  | 'stages'
  | 'measurePhoto'
  | 'count'
  | 'how'
  | 'inches'
  | 'stump'
  | 'rootBall'
  | 'exposed'
  | 'survey'
  | 'items'
  | 'ineligible'
  | 'roe'
  | 'place'
  | 'photos'
  | 'review';

// What the measurement typed is: inches to a tenth, or not one yet.
const inchesOf = (typed: string): number | null => {
  if (!/^\d+(\.\d?)?$/.test(typed)) return null;
  return Math.round(Number(typed) * 10) / 10;
};

const shown = (value: number | null): string => (value === null ? '' : String(value));

// What the steps hang on that the ticket holds: a stump's root ball, which its exposure question
// is asked of.
type Entered = Pick<PhoneTicket, 'rootBallInches'>;

// The steps the kind of work's own screen takes: its count, its measurement, its items.
function kindStepsOf(asked: UnitRateAsked | null, entered: Entered): UnitRateStep[] {
  const kind: UnitRateStep[] = [];
  if (asked !== null) {
    if (asked.count === 'ASKED') kind.push('count');
    if (asked.measured === 'TREE') kind.push('how', 'inches');
    if (asked.screen === 'STUMP') {
      kind.push('stump', 'rootBall');
      if (PhoneUnitRate.asksExposure(entered.rootBallInches)) kind.push('exposed');
      kind.push('survey');
    }
    if (asked.screen === 'ITEM_COUNTS' || asked.screen === 'ITEM_HOURS') kind.push('items');
  }
  return kind;
}

// The steps this ticket takes, by the work picked and what was entered (ADR-592): the crew, the
// work, then the ticket's dashboard where the work is photographed by stage (its measurement's
// own steps go from it, `measuringOf`), or else the kind of work's own screen; where it was, and
// the review. Photos are a step of their own only for work not photographed by stage.
function stepsOf(
  asked: UnitRateAsked | null,
  entered: Entered,
  ineligible: boolean,
  lists: PhoneListsRecord,
): UnitRateStep[] {
  const staged = asked?.photosByStage === true;
  return [
    'crew',
    'work',
    ...(staged ? (['stages'] as const) : kindStepsOf(asked, entered)),
    ...(ineligible ? (['ineligible'] as const) : []),
    ...(lists.roes.length === 0 ? [] : (['roe'] as const)),
    'place',
    ...(staged ? [] : (['photos'] as const)),
    'review',
  ];
}

// How many steps New counts the crew as the first of, before the work is picked.
export const unitRateStepsAtNew = (lists: PhoneListsRecord): number =>
  stepsOf(null, { rootBallInches: null }, false, lists).length;

// The measurement's own steps, from the dashboard of work photographed by stage and back to it:
// its photograph, then the kind of work's own screen (ADR-592).
const measuringOf = (asked: UnitRateAsked | null, entered: Entered): UnitRateStep[] =>
  asked?.photosByStage === true ? ['measurePhoto', ...kindStepsOf(asked, entered)] : [];

// What the measurement's stage says was entered, in the review's words; none until the kind of
// work's own screen has what it asks (a stump's root ball and survey number may stay blank, and
// its exposure is asked only of a root ball: `PhoneUnitRate.stumpMeasured`).
function measuredOf(ticket: PhoneTicket, asked: UnitRateAsked | null): string | null {
  if (asked === null) return null;
  const parts: string[] = [];
  if (asked.count === 'ASKED') {
    if (ticket.unitCount === null) return null;
    parts.push(String(ticket.unitCount));
  }
  if (asked.measured === 'TREE') {
    if (ticket.measurementInches === null || ticket.measuredAs === null) return null;
    parts.push(
      say(ticket.measuredAs === 'CIRCUMFERENCE' ? said.review.around : said.review.across, {
        inches: ticket.measurementInches,
      }),
    );
  }
  if (asked.screen === 'STUMP') {
    const measured = PhoneUnitRate.stumpMeasured({
      diameterInches: ticket.measurementInches,
      rootBallInches: ticket.rootBallInches,
      rootBallHalfExposed: ticket.rootBallHalfExposed,
    });
    if (ticket.measurementInches === null || !measured) return null;
    parts.push(say(said.review.stumpAcross, { inches: ticket.measurementInches }));
  }
  if (asked.screen === 'ITEM_COUNTS' || asked.screen === 'ITEM_HOURS') {
    if (ticket.items.length === 0) return null;
    parts.push(String(ticket.items.reduce((all, { quantity }) => all + quantity, 0)));
  }
  return parts.join(' · ');
}

// The photograph a stage of the work has, if one is taken.
const stagePhoto = (ticket: PhoneTicket, stage: PhotoStage) =>
  ticket.photos.find((photo) => photo.stage === stage);

// Whether a stage is done: its photograph taken, and the measurement's own steps too.
function stageDone(ticket: PhoneTicket, asked: UnitRateAsked | null, stage: PhotoStage): boolean {
  if (stagePhoto(ticket, stage) === undefined) return false;
  return (
    stage !== 'MEASUREMENT' ||
    kindStepsOf(asked, ticket).length === 0 ||
    measuredOf(ticket, asked) !== null
  );
}

// What home says beside an open unit rate ticket of work photographed by stage: the next stage to
// do, or that all three are done; nothing for other work (ADR-590).
export function stagesLeft(ticket: PhoneTicket, lists: PhoneListsRecord): string | null {
  if (ticket.payableTypeId === null) return null;
  const asked = new PhoneUnitRate(lists.payItems).asks(ticket.payableTypeId);
  if (asked?.photosByStage !== true) return null;
  const next = photoStages.find((stage) => !stageDone(ticket, asked, stage));
  return next === undefined
    ? said.stages.allDone
    : say(said.stages.next, { stage: said.stages.names[next] });
}

// An item's quantity as typed: none where empty, a number, or not a number at all.
const quantityOf = (typed: string): number | null | 'not' => {
  const plain = typed.trim();
  if (plain === '') return null;
  if (!/^\d+(\.\d*)?$/.test(plain)) return 'not';
  return Math.round(Number(plain) * 100) / 100;
};

export function CompleteUnitRate({
  parts,
  ticket,
  held,
  standing,
  onPhoto,
  onSubmitted,
  onLeave,
  below,
}: {
  readonly parts: CaptureParts;
  readonly ticket: PhoneTicket;
  readonly held: HeldLists;
  readonly standing: Standing;
  readonly onPhoto: (photoId: string) => void;
  readonly onSubmitted: () => void;
  readonly onLeave: () => void;
  readonly below?: ReactNode;
}) {
  const titleId = useId();
  const { lists } = held;
  const phone = new PhoneUnitRate(lists.payItems);
  const [now, setNow] = useState(ticket);
  const asked = now.payableTypeId === null ? null : phone.asks(now.payableTypeId);
  const measurement =
    now.measurementInches === null || now.measuredAs === null
      ? null
      : { inches: now.measurementInches, measuredAs: now.measuredAs };
  const ineligible =
    now.payableTypeId !== null && phone.mayMarkIneligible(now.payableTypeId, measurement);
  const steps = stepsOf(asked, now, ineligible, lists);
  const measuring = measuringOf(asked, now);
  const left = [...steps, ...measuring].find((step) => step === ticket.step);
  const [step, setStep] = useState<UnitRateStep>(left ?? 'crew');
  const [cancelling, setCancelling] = useState(false);
  const [count, setCount] = useState(shown(now.unitCount));
  const [inches, setInches] = useState(shown(now.measurementInches));
  const [rootBall, setRootBall] = useState(shown(now.rootBallInches));
  const [survey, setSurvey] = useState(now.surveyNumber ?? '');
  const [quantities, setQuantities] = useState<ReadonlyMap<string, string>>(
    new Map(now.items.map(({ itemNameId, quantity }) => [itemNameId, String(quantity)])),
  );
  const [roeTyped, setRoeTyped] = useState(now.roeNumber ?? '');
  const [typedAddress, setTypedAddress] = useState(
    now.addressSource === 'TYPED' ? (now.address ?? '') : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [notKept, setNotKept] = useState<string | null>(null);
  // The measurement's own steps count as the dashboard's.
  const place = Math.max(0, steps.indexOf(measuring.includes(step) ? 'stages' : step));
  const itemNames = lists.itemNames.filter(
    ({ kindOfWorkId }) => kindOfWorkId === asked?.kindOfWork.id,
  );

  // Kept at once: the pay item worked out again from what the ticket holds now on the phone (never
  // this screen's copy, which a change just kept may have moved past), and "ineligible" dropped
  // where it is no longer the monitor's to mark.
  const changed = async (change: Partial<TicketDetails> & { readonly step?: string }) => {
    const merged = { ...(parts.tickets.ticket(now.id) ?? now), ...change };
    const measured =
      merged.measurementInches === null || merged.measuredAs === null
        ? null
        : { inches: merged.measurementInches, measuredAs: merged.measuredAs };
    const payItemId =
      merged.payableTypeId === null
        ? null
        : (phone.payItemFor(merged.payableTypeId, measured)?.id ?? null);
    const mayMark =
      merged.payableTypeId !== null && phone.mayMarkIneligible(merged.payableTypeId, measured);
    const next = await parts.tickets.changed(now.id, {
      ...change,
      payItemId,
      markedIneligible: mayMark ? merged.markedIneligible : null,
    });
    setNow(next);
    return next;
  };
  const go = (to: UnitRateStep | undefined) => {
    if (to === undefined) return;
    setStep(to);
    void changed({ step: to });
  };
  // On to the step after this one, among the steps as they stand once a change is kept: the
  // measurement's last step back to the dashboard.
  const onward = (after: PhoneTicket = now) => {
    const askedNow = after.payableTypeId === null ? null : phone.asks(after.payableTypeId);
    const measuredNow =
      after.measurementInches === null || after.measuredAs === null
        ? null
        : { inches: after.measurementInches, measuredAs: after.measuredAs };
    const measuringNow = measuringOf(askedNow, after);
    if (measuringNow.includes(step)) {
      go(measuringNow[measuringNow.indexOf(step) + 1] ?? 'stages');
      return;
    }
    const stepsNow = stepsOf(
      askedNow,
      after,
      after.payableTypeId !== null && phone.mayMarkIneligible(after.payableTypeId, measuredNow),
      lists,
    );
    go(stepsNow[stepsNow.indexOf(step) + 1]);
  };
  // Back a step: the measurement's first back to the dashboard. The crew has none: it is the
  // first step, and the ticket is left or cancelled from it.
  const back = () => {
    if (measuring.includes(step)) {
      go(measuring[measuring.indexOf(step) - 1] ?? 'stages');
      return;
    }
    go(steps[place - 1]);
  };
  // A screen of the ticket's: its actions, then "Leave it for now", and on the crew, the work and
  // the dashboard "Cancel the ticket" too.
  const cancellable = step === 'crew' || step === 'work' || step === 'stages';
  const frame = (title: string, actions: ReactNode, children?: ReactNode) => (
    <main data-screen="complete-unit-rate" className="screen">
      <Step
        standing={standing}
        title={title}
        titleId={titleId}
        step={place + 1}
        steps={steps.length}
        onBack={step === 'crew' ? undefined : back}
        actions={
          <>
            {actions}
            <Button wide onPress={onLeave}>
              {said.leave}
            </Button>
            {cancellable ? (
              <Button
                wide
                onPress={() => {
                  setCancelling(true);
                }}
              >
                {said.open.cancel}
              </Button>
            ) : null}
          </>
        }
      >
        {children}
      </Step>
      {below}
    </main>
  );
  const next = (enabled: boolean, onPress: () => void) => (
    <Button main wide isDisabled={!enabled} onPress={onPress}>
      {said.next}
    </Button>
  );
  // A photograph taken now, for a stage of the work where one is named (its own place, ADR-590).
  const taken = async (bytes: Uint8Array, stage?: PhotoStage) => {
    const where = await parts.locator.where();
    const kept = await parts.tickets.photographed(
      now.id,
      bytes,
      where.kind === 'fix' ? where.fix : null,
      undefined,
      stage,
    );
    const after = parts.tickets.ticket(now.id);
    if (after !== undefined) setNow(after);
    return kept;
  };
  // Work photographed by stage: its stages' photographs apart, the strip showing the others (the
  // crew's) in what is left of the ticket's eight.
  const staged = asked?.photosByStage === true;
  const stagesTaken = staged ? now.photos.filter(({ stage }) => stage !== undefined) : [];
  const others = { ...now, photos: now.photos.filter((photo) => !stagesTaken.includes(photo)) };
  const photos = (
    <TicketPhotos
      tickets={parts.tickets}
      camera={parts.camera}
      ticket={others}
      atMost={ticketPhotosAtMost - stagesTaken.length}
      onTaken={(bytes) => taken(bytes)}
      onOpen={(photo) => {
        onPhoto(photo.id);
      }}
    />
  );
  // The photographs that are no stage's (the crew's), each pressed to open it full size; nothing
  // more taken here.
  const othersShown = (
    <ul className="photo-strip-photos">
      {others.photos.map((photo) => (
        <li key={photo.id}>
          <Pressable
            className="photo-open"
            aria-label={say(said.photos.open, { number: now.photos.indexOf(photo) + 1 })}
            onPress={() => {
              onPhoto(photo.id);
            }}
          >
            <PhotoDrawn tickets={parts.tickets} photo={photo} label={photoLabel(now, photo)} />
          </Pressable>
        </li>
      ))}
    </ul>
  );
  // A stage's photograph, pressed to open it full size.
  const stageShown = (stage: PhotoStage, large: boolean) => {
    const photo = stagePhoto(now, stage);
    if (photo === undefined) return null;
    return (
      <Pressable
        className="photo-open"
        aria-label={say(said.stages.open, { stage: said.stages.inWords[stage] })}
        onPress={() => {
          onPhoto(photo.id);
        }}
      >
        <PhotoDrawn
          tickets={parts.tickets}
          photo={photo}
          label={photoLabel(now, photo)}
          large={large}
        />
      </Pressable>
    );
  };

  // The work picked: what its kind of work records starts afresh, a count of one recorded where
  // its pay items are always one.
  const picked = (payableTypeId: string) => {
    const work = phone.asks(payableTypeId);
    if (work === null) return;
    const same = payableTypeId === now.payableTypeId;
    if (!same) {
      setCount('');
      setInches('');
      setRootBall('');
      setSurvey('');
      setQuantities(new Map());
    }
    const fresh: Partial<TicketDetails> = same
      ? {}
      : {
          unitCount: work.count === 'ONE' ? 1 : null,
          measurementInches: null,
          measuredAs: null,
          rootBallInches: null,
          rootBallHalfExposed: null,
          surveyNumber: null,
          markedIneligible: null,
          items: [],
        };
    void changed({ payableTypeId, kindOfWorkId: work.kindOfWork.id, ...fresh }).then(onward);
  };

  // The items as typed, each a number or empty; whole counts where decimals aren't allowed, hours
  // to the quarter hour.
  const typedItems = itemNames.map((item) => ({
    item,
    quantity: quantityOf(quantities.get(item.id) ?? ''),
  }));
  const hours = asked?.screen === 'ITEM_HOURS';
  const itemProblem = typedItems.some(({ quantity }) => quantity === 'not')
    ? said.items.notANumber
    : hours &&
        typedItems.some(
          ({ quantity }) => typeof quantity === 'number' && !PhoneUnitRate.quarterHour(quantity),
        )
      ? said.items.notQuarter
      : !hours &&
          asked?.decimals !== true &&
          typedItems.some(
            ({ quantity }) => typeof quantity === 'number' && !Number.isInteger(quantity),
          )
        ? said.items.notWhole
        : null;
  const countTyped = quantityOf(count);
  const countProblem =
    countTyped === 'not'
      ? said.items.notANumber
      : typeof countTyped === 'number' && asked?.decimals !== true && !Number.isInteger(countTyped)
        ? said.howMany.notWhole
        : null;

  const named = (list: readonly { id: string; name: string }[], id: string | null) =>
    list.find((one) => one.id === id)?.name ?? said.review.none;

  if (cancelling) {
    return (
      <CancelTicket
        ticket={now}
        standing={standing}
        onKeep={() => {
          setCancelling(false);
        }}
        onCancel={() => {
          void parts.tickets.cancel(now.id).then(onLeave);
        }}
        below={below}
      />
    );
  }

  switch (step) {
    case 'crew':
      return frame(
        said.crew.photoTitle,
        next(true, () => {
          onward();
        }),
        <>
          <Banner tone="info">
            <p>{say(words.home.open.crew, { truck: now.certNumber, number: now.ticketNumber })}</p>
          </Banner>
          <TruckFacts certNumber={now.certNumber} lists={lists} />
          <p>{said.crew.photoAbout}</p>
          {photos}
        </>,
      );
    case 'work':
      return frame(
        said.work.title,
        now.payableTypeId === null
          ? null
          : next(true, () => {
              onward();
            }),
        <>
          <Banner tone="info">
            <p>{say(words.home.open.crew, { truck: now.certNumber, number: now.ticketNumber })}</p>
          </Banner>
          <ListPicker
            movesOn
            labelledBy={titleId}
            choices={phone.payableTypes().map(({ id, name }) => ({ key: id, label: name }))}
            picked={now.payableTypeId}
            onPick={picked}
          />
        </>,
      );
    case 'stages': {
      const measured = measuredOf(now, asked);
      const nextStage = photoStages.find((stage) => !stageDone(now, asked, stage));
      return frame(
        say(said.open.title, {
          kind: named(phone.payableTypes(), now.payableTypeId),
          number: now.ticketNumber,
        }),
        <Button
          main
          wide
          onPress={() => {
            onward();
          }}
        >
          {said.open.complete}
        </Button>,
        <>
          <TruckFacts certNumber={now.certNumber} lists={lists} />
          <p>
            {say(said.open.started, { time: timeOfDay(new Date(now.startedAt), now.timeZone) })}
          </p>
          <p>{said.stages.about}</p>
          <ol className="stages">
            {photoStages.map((stage, index) => {
              const photo = stagePhoto(now, stage);
              const done = stageDone(now, asked, stage);
              const tone = done ? 'done' : 'toDo';
              const icon = done ? <Tick /> : stage === 'MEASUREMENT' ? <Clock /> : <CameraIcon />;
              return (
                <li key={stage} className={stage === nextStage ? 'stage stage-next' : 'stage'}>
                  <div className="stage-head">
                    <h2>
                      {say(said.stages.numbered, {
                        number: index + 1,
                        stage: said.stages.names[stage],
                      })}
                    </h2>
                    <span
                      className={
                        done ? 'stage-state stage-state-done' : 'stage-state stage-state-to-do'
                      }
                    >
                      {done ? <Tick /> : <Clock />}
                      {done ? said.stages.done : said.stages.toDo}
                    </span>
                  </div>
                  {stageShown(stage, false)}
                  {stage === 'MEASUREMENT' ? (
                    // The measurement's own part: its photograph, then what it measured, and back.
                    <Button
                      wide
                      tone={tone}
                      icon={icon}
                      onPress={() => {
                        go('measurePhoto');
                      }}
                    >
                      {measured === null
                        ? said.stages.measure
                        : say(said.stages.measured, { measured })}
                    </Button>
                  ) : (
                    // Before and after the work: the camera straight away, and back here.
                    <TakePhoto
                      camera={parts.camera}
                      tone={tone}
                      icon={icon}
                      isDisabled={photo === undefined && now.photos.length >= ticketPhotosAtMost}
                      onTaken={(bytes) => taken(bytes, stage)}
                    >
                      {photo === undefined ? said.stages.take[stage] : said.stages.again[stage]}
                    </TakePhoto>
                  )}
                </li>
              );
            })}
          </ol>
        </>,
      );
    }
    case 'measurePhoto': {
      const photo = stagePhoto(now, 'MEASUREMENT');
      return frame(
        said.stages.measurePhotoTitle,
        next(true, () => {
          onward();
        }),
        <>
          <p>{said.stages.measurePhotoAbout}</p>
          {stageShown('MEASUREMENT', true)}
          <TakePhoto
            camera={parts.camera}
            tone={photo === undefined ? 'toDo' : 'done'}
            icon={photo === undefined ? <CameraIcon /> : <Tick />}
            isDisabled={photo === undefined && now.photos.length >= ticketPhotosAtMost}
            onTaken={async (bytes) => {
              const kept = await taken(bytes, 'MEASUREMENT');
              // Taken: on to what it measured (or back to the dashboard where nothing is asked).
              if (kept) onward();
              return kept;
            }}
          >
            {photo === undefined ? said.stages.take.MEASUREMENT : said.stages.again.MEASUREMENT}
          </TakePhoto>
        </>,
      );
    }
    case 'count':
      return frame(
        said.howMany.title,
        next(typeof countTyped === 'number' && countProblem === null, () => {
          void changed({ unitCount: typeof countTyped === 'number' ? countTyped : null }).then(
            onward,
          );
        }),
        <>
          <NumberKeypad
            labelledBy={titleId}
            value={count}
            onChange={setCount}
            digitsAtMost={6}
            decimal={asked?.decimals === true}
            unit={said.howMany.unit}
          />
          {countProblem === null ? null : (
            <Banner tone="problem" announced>
              <p>{countProblem}</p>
            </Banner>
          )}
        </>,
      );
    case 'how':
      return frame(
        said.measure.howTitle,
        now.measuredAs === null
          ? null
          : next(true, () => {
              onward();
            }),
        <>
          <p>{said.measure.about}</p>
          <ListPicker
            movesOn
            labelledBy={titleId}
            choices={[
              { key: 'CIRCUMFERENCE', label: said.measure.around },
              { key: 'DIAMETER', label: said.measure.across },
            ]}
            picked={now.measuredAs}
            onPick={(way) => {
              void changed({
                measuredAs: way === 'CIRCUMFERENCE' ? 'CIRCUMFERENCE' : 'DIAMETER',
              }).then(onward);
            }}
          />
        </>,
      );
    case 'inches':
    case 'stump':
      return frame(
        step === 'stump' ? said.stump.title : said.measure.inchesTitle,
        next(inchesOf(inches) !== null, () => {
          void changed({
            measurementInches: inchesOf(inches),
            ...(step === 'stump' ? { measuredAs: 'DIAMETER' as const } : {}),
          }).then(onward);
        }),
        <>
          {step === 'stump' ? <p>{said.stump.about}</p> : null}
          <NumberKeypad
            labelledBy={titleId}
            value={inches}
            onChange={setInches}
            digitsAtMost={5}
            decimal
            unit={said.measure.unit}
          />
        </>,
      );
    case 'rootBall':
      return frame(
        said.stump.rootBallTitle,
        next(rootBall === '' || inchesOf(rootBall) !== null, () => {
          // Left empty, the root ball takes its exposure answer with it, and that question is
          // not asked (ADR-605).
          void changed(
            PhoneUnitRate.rootBallEntered(inchesOf(rootBall), now.rootBallHalfExposed),
          ).then(onward);
        }),
        <>
          <p>{said.stump.rootBallAbout}</p>
          <NumberKeypad
            labelledBy={titleId}
            value={rootBall}
            onChange={setRootBall}
            digitsAtMost={5}
            decimal
            unit={said.measure.unit}
          />
        </>,
      );
    case 'exposed':
      return frame(
        said.stump.exposedTitle,
        now.rootBallHalfExposed === null
          ? null
          : next(true, () => {
              onward();
            }),
        <ListPicker
          movesOn
          labelledBy={titleId}
          choices={[
            { key: 'yes', label: said.stump.halfOrMore },
            { key: 'no', label: said.stump.lessThanHalf },
          ]}
          picked={now.rootBallHalfExposed === null ? null : now.rootBallHalfExposed ? 'yes' : 'no'}
          onPick={(answer) => {
            void changed({ rootBallHalfExposed: answer === 'yes' }).then(onward);
          }}
        />,
      );
    case 'survey':
      return frame(
        said.stump.surveyTitle,
        <Button
          main
          wide
          onPress={() => {
            void changed({ surveyNumber: survey.trim() === '' ? null : survey.trim() }).then(
              onward,
            );
          }}
        >
          {survey.trim() === '' ? said.stump.surveyNone : said.next}
        </Button>,
        <TextEntry label={said.stump.surveyLabel} value={survey} onChange={setSurvey} />,
      );
    case 'items':
      return frame(
        hours ? said.items.hoursTitle : said.items.countsTitle,
        next(itemProblem === null, () => {
          const items: TicketItem[] = typedItems.flatMap(({ item, quantity }) =>
            typeof quantity === 'number' && quantity > 0 ? [{ itemNameId: item.id, quantity }] : [],
          );
          void changed({ items, unitCount: null }).then(onward);
        }),
        <>
          <p>{hours ? said.items.hoursAbout : said.items.countsAbout}</p>
          {itemNames.map((item) => (
            <TextEntry
              key={item.id}
              label={hours ? say(said.items.hours, { item: item.name }) : item.name}
              value={quantities.get(item.id) ?? ''}
              onChange={(typed) => {
                setQuantities(new Map([...quantities, [item.id, typed]]));
              }}
              decimal
            />
          ))}
          {itemProblem === null ? null : (
            <Banner tone="problem" announced>
              <p>{itemProblem}</p>
            </Banner>
          )}
        </>,
      );
    case 'ineligible':
      return frame(
        said.ineligible.title,
        now.markedIneligible === null
          ? null
          : next(true, () => {
              onward();
            }),
        <>
          <p>{said.ineligible.about}</p>
          <ListPicker
            labelledBy={titleId}
            choices={[
              { key: 'eligible', label: said.ineligible.eligible },
              { key: 'ineligible', label: said.ineligible.mark },
            ]}
            picked={
              now.markedIneligible === null
                ? null
                : now.markedIneligible
                  ? 'ineligible'
                  : 'eligible'
            }
            onPick={(answer) => {
              void changed({ markedIneligible: answer === 'ineligible' }).then(onward);
            }}
          />
        </>,
      );
    case 'roe':
      return frame(
        said.roe.workTitle,
        <Button
          main
          wide
          onPress={() => {
            void changed({ roeNumber: roeTyped.trim() === '' ? null : roeTyped.trim() }).then(
              onward,
            );
          }}
        >
          {roeTyped.trim() === '' ? said.roe.none : said.next}
        </Button>,
        <>
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
          <TextEntry label={said.roe.typeIt} value={roeTyped} onChange={setRoeTyped} />
        </>,
      );
    case 'place':
      return frame(
        said.place.workTitle,
        next(true, () => {
          void changed(typedAddressChange(now, typedAddress)).then(onward);
        }),
        <PlaceFields
          parts={parts}
          ticket={now}
          typed={typedAddress}
          onTyped={setTypedAddress}
          onChanged={changed}
        />,
      );
    case 'photos':
      return frame(
        said.photos.title,
        next(true, () => {
          onward();
        }),
        photos,
      );
    case 'review': {
      const reason = lists.typedNumberReasons.find(({ id }) => id === now.numberTypedReasonId);
      const itemized = asked?.screen === 'ITEM_COUNTS' || asked?.screen === 'ITEM_HOURS';
      return frame(
        said.review.title,
        <Button
          main
          wide
          busy={submitting}
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
          {submitting
            ? said.review.submitting
            : say(said.review.submitCrew, { number: now.certNumber })}
        </Button>,
        <>
          <p>{said.review.about}</p>
          {notKept === null ? null : (
            <Banner tone="problem" announced>
              <p>{say(said.review.notKept, { message: notKept })}</p>
            </Banner>
          )}
          <TruckFacts certNumber={now.certNumber} lists={lists} />
          <dl className="facts">
            <dt>{said.review.number}</dt>
            <dd>
              {now.ticketNumber}
              {reason === undefined
                ? null
                : ` · ${say(said.review.typed, { reason: reason.name })}`}
            </dd>
            <dt>{said.review.work}</dt>
            <dd>{named(phone.payableTypes(), now.payableTypeId)}</dd>
            {itemized ? null : (
              <>
                <dt>{said.review.howMany}</dt>
                <dd>{now.unitCount ?? said.review.none}</dd>
              </>
            )}
            {asked?.measured === 'TREE' ? (
              <>
                <dt>{said.review.measured}</dt>
                <dd>
                  {now.measurementInches === null || now.measuredAs === null
                    ? said.review.none
                    : say(
                        now.measuredAs === 'CIRCUMFERENCE'
                          ? said.review.around
                          : said.review.across,
                        { inches: now.measurementInches },
                      )}
                </dd>
              </>
            ) : null}
            {asked?.screen === 'STUMP' ? (
              <>
                <dt>{said.review.stump}</dt>
                <dd>
                  {now.measurementInches === null
                    ? said.review.none
                    : say(said.review.stumpAcross, { inches: now.measurementInches })}
                </dd>
                <dt>{said.review.rootBall}</dt>
                <dd>
                  {now.rootBallInches === null
                    ? said.review.none
                    : say(said.review.across, { inches: now.rootBallInches })}
                </dd>
                {PhoneUnitRate.asksExposure(now.rootBallInches) ? (
                  <>
                    <dt>{said.review.exposed}</dt>
                    <dd>
                      {now.rootBallHalfExposed === null
                        ? said.review.none
                        : now.rootBallHalfExposed
                          ? said.review.halfOrMore
                          : said.review.lessThanHalf}
                    </dd>
                  </>
                ) : null}
                <dt>{said.review.survey}</dt>
                <dd>{now.surveyNumber ?? said.review.none}</dd>
              </>
            ) : null}
            {itemized ? (
              <>
                <dt>{said.review.items}</dt>
                <dd>
                  {now.items.length === 0
                    ? said.review.none
                    : now.items
                        .map(({ itemNameId, quantity }) =>
                          say(hours ? said.review.itemHours : said.review.itemCount, {
                            item: named(lists.itemNames, itemNameId),
                            count: quantity,
                            hours: quantity,
                          }),
                        )
                        .join(' · ')}
                </dd>
              </>
            ) : null}
            {ineligible ? (
              <>
                <dt>{said.review.eligibility}</dt>
                <dd>
                  {now.markedIneligible === true ? said.review.ineligible : said.review.eligible}
                </dd>
              </>
            ) : null}
            {lists.roes.length === 0 ? null : (
              <>
                <dt>{said.review.roe}</dt>
                <dd>{now.roeNumber ?? said.review.none}</dd>
              </>
            )}
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
          </dl>
          {staged ? (
            <>
              <h2>{said.stages.photosTitle}</h2>
              <div className="stage-photos">
                {photoStages.map((stage) => (
                  <figure key={stage} className="stage-photo">
                    <figcaption>{said.stages.names[stage]}</figcaption>
                    {stageShown(stage, true) ?? (
                      <p>{say(said.stages.notTaken, { stage: said.stages.inWords[stage] })}</p>
                    )}
                  </figure>
                ))}
              </div>
              {others.photos.length === 0 ? null : (
                <>
                  <h2>{said.review.photos}</h2>
                  {othersShown}
                </>
              )}
            </>
          ) : (
            <>
              <h2>{said.review.photos}</h2>
              {now.photos.length === 0 ? <p>{said.review.none}</p> : photos}
            </>
          )}
        </>,
      );
    }
  }
}
