// The tower's Complete and the haul-out's loading end, on the phone (adms-field-app §4A.4,
// §4A.6; adms-scale-receipts; adms-ticket-workflows; BACKLOG 3.5.2; C83, C177, C182; AC-04-38,
// AC-11-05, 40, 41, 78, 79; ADR-013, 034, 038, 111, 116, 175, 223, 227, 243, 295, 573, 582).
//
// - **A disposal, a haul-out's disposal** (`complete-disposal`): the site is the assignment's; the
//   debris type picked on its own, by name (ADR-207, 211); then **one quantity, from the site's
//   lookup** for that debris type and the truck's prime (the domain's `PhoneQuantityAsks`): the
//   load call typed 0–100 on the keypad (no picker, no steps, no suggestion; 0 taken: ADR-111,
//   116), the scale receipt copied by hand (its number as written, each weight as the paper says,
//   none worked out: ADR-038), the count of the tickets the load carries (C83), or nothing more
//   for a haul-out whose load call was taken where it was loaded (ADR-013). **Never both**: where
//   the weight is asked, no load call is (AC-04-38). Beside a load call, or nothing more, the
//   scale receipt is offered, never asked (ADR-227's agent default: a Final Disposal tower may
//   take its number). **A tandem weighed once** points its second disposal at the receipt copied
//   with the first, never a second copy (ADR-175). **Where the phone holds no row of the lookup
//   that answers** (its lists read for another site: C182), it says so and asks what the lookup
//   says where no rule pays: the load call, the scale receipt offered.
// - **A haul-out's collection** (`complete-haul-out`): the debris type, never a field tag (the
//   user, ADR-591), and **the load call at the loading end, always** (ADR-013); a split
//   haul-out's pile gives **the load call so far**, the pile before's shown (ADR-295).
// - Then photos (the empty bed at the tower, the load at the loading end), **the review, every
//   value once, the only check** (the user, Q-215, ADR-573), the photographs themselves; then
//   submitted, sealed (ADR-477). The tower holds no ticket list (ADR-071): it records what it is
//   given.
//
// Nothing here waits on the server (ADR-030; AC-11-05). Every value entered is kept at once.
import type { PhoneListsRecord } from '@open-adms/contracts';
import {
  PhoneQuantityAsks,
  ProjectClock,
  ticketPhotosAtMost,
  uuidv7,
  type QuantityAskName,
} from '@open-adms/domain';
import { useId, useState, type ReactNode } from 'react';

import { Step, TicketPhotos } from './capture.tsx';
import {
  Banner,
  Button,
  ListPicker,
  NumberKeypad,
  TextEntry,
  type Standing,
} from './look/index.ts';
import type { HeldLists } from './phone/lists.ts';
import { offsetOf } from './phone/reports.ts';
import type { PhoneTickets, PhoneTicket, TicketReceipt } from './phone/tickets.ts';
import type { CaptureParts } from './ticket-capture.tsx';
import { say, words } from './words.ts';

const said = words.capture;

interface Completing {
  readonly parts: CaptureParts;
  readonly ticket: PhoneTicket;
  readonly standing: Standing;
  readonly onBackToTicket: () => void;
  readonly onPhoto: (photoId: string) => void;
  readonly onSubmitted: () => void;
  readonly onLeave: () => void;
  readonly below?: ReactNode;
}

// What a load call typed is: a whole number 0–100, or not one yet.
const callOf = (typed: string): number | null => {
  if (typed === '' || !/^\d+$/.test(typed)) return null;
  const call = Number(typed);
  return call <= 100 ? call : null;
};

// A weight as the paper shows it, typed: none where nothing is, a number to its places, or not a
// number at all.
const weightOf = (typed: string, places: number): number | null | 'not' => {
  const plain = typed.trim().replace(/,/g, '');
  if (plain === '') return null;
  if (!/^\d+(\.\d*)?$/.test(plain)) return 'not';
  const factor = 10 ** places;
  return Math.round(Number(plain) * factor) / factor;
};

const named = (list: readonly { id: string; name: string }[], id: string | null) =>
  list.find((one) => one.id === id)?.name ?? said.review.none;

// The frame of a Complete's step: its question, how far through, Back, and "Leave it for now"
// beneath its own actions.
function Frame({
  screen,
  standing,
  title,
  titleId,
  step,
  steps,
  onBack,
  actions,
  onLeave,
  below,
  children,
}: {
  readonly screen: 'disposal' | 'haulOut';
  readonly standing: Standing;
  readonly title: string;
  readonly titleId: string;
  readonly step: number;
  readonly steps: number;
  readonly onBack: () => void;
  readonly actions: ReactNode;
  readonly onLeave: () => void;
  readonly below?: ReactNode;
  readonly children?: ReactNode;
}) {
  const inner = (
    <>
      <Step
        standing={standing}
        title={title}
        titleId={titleId}
        step={step}
        steps={steps}
        onBack={onBack}
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
    </>
  );
  return screen === 'disposal' ? (
    <main data-screen="complete-disposal" className="screen">
      {inner}
    </main>
  ) : (
    <main data-screen="complete-haul-out" className="screen">
      {inner}
    </main>
  );
}

// The load call typed on the keypad: 0–100, nothing more said about it (AC-11-40).
function LoadCall({
  titleId,
  typed,
  onChange,
  about,
}: {
  readonly titleId: string;
  readonly typed: string;
  readonly onChange: (typed: string) => void;
  readonly about: string;
}) {
  return (
    <>
      <p>{about}</p>
      <NumberKeypad
        labelledBy={titleId}
        value={typed}
        onChange={onChange}
        digitsAtMost={3}
        unit={said.call.unit}
      />
      {typed !== '' && callOf(typed) === null ? (
        <Banner tone="problem" announced>
          <p>{said.call.over}</p>
        </Banner>
      ) : null}
    </>
  );
}

// The photographs step and the review's photographs: each drawn, opened with a press.
function Photos({
  parts,
  ticket,
  onChanged,
  onPhoto,
}: {
  readonly parts: CaptureParts;
  readonly ticket: PhoneTicket;
  readonly onChanged: (ticket: PhoneTicket) => void;
  readonly onPhoto: (photoId: string) => void;
}) {
  return (
    <TicketPhotos
      tickets={parts.tickets}
      camera={parts.camera}
      ticket={ticket}
      atMost={ticketPhotosAtMost}
      onTaken={async (bytes) => {
        const where = await parts.locator.where();
        const kept = await parts.tickets.photographed(
          ticket.id,
          bytes,
          where.kind === 'fix' ? where.fix : null,
        );
        const after = parts.tickets.ticket(ticket.id);
        if (after !== undefined) onChanged(after);
        return kept;
      }}
      onOpen={(photo) => {
        onPhoto(photo.id);
      }}
    />
  );
}

// Submit: the end's fix, whatever the phone has, and the ticket sealed in the outbox; the
// contract's words where it isn't kept.
function useSubmit(parts: CaptureParts, onSubmitted: () => void) {
  const [submitting, setSubmitting] = useState(false);
  const [notKept, setNotKept] = useState<string | null>(null);
  const submit = (ticket: PhoneTicket) => {
    setSubmitting(true);
    setNotKept(null);
    void (async () => {
      const where = await parts.locator.where();
      const outcome = await parts.tickets.submit(
        ticket.id,
        where.kind === 'fix' ? where.fix : null,
      );
      setSubmitting(false);
      if (outcome.kind === 'sealed') onSubmitted();
      else setNotKept(outcome.notice.message);
    })();
  };
  return { submitting, notKept, submit };
}

// What the review says of a receipt: its number, and each weight the paper showed.
function receiptWords(receipt: TicketReceipt): string {
  const weights = [
    receipt.grossWeightLb === null
      ? null
      : say(said.receipt.grossShown, { lb: receipt.grossWeightLb }),
    receipt.tareWeightLb === null
      ? null
      : say(said.receipt.tareShown, { lb: receipt.tareWeightLb }),
    receipt.netWeightLb === null ? null : say(said.receipt.netShown, { lb: receipt.netWeightLb }),
    receipt.netWeightTons === null
      ? null
      : say(said.receipt.tonsShown, { tons: receipt.netWeightTons }),
  ].filter((one): one is string => one !== null);
  return [receipt.receiptNumber, ...weights].join(' · ');
}

type DisposalStep = 'debris' | 'quantity' | 'receipt' | 'weights' | 'photos' | 'review';

export function CompleteDisposal({
  parts,
  ticket,
  held,
  standing,
  onBackToTicket,
  onPhoto,
  onSubmitted,
  onLeave,
  below,
}: Completing & { readonly held: HeldLists }) {
  const titleId = useId();
  const { lists } = held;
  const [now, setNow] = useState(ticket);
  const kind = now.kind === 'HAUL_OUT_DISPOSAL' ? 'HAUL_OUT_DISPOSAL' : 'DISPOSAL';
  const debrisTypes = kind === 'DISPOSAL' ? lists.debrisTypes.LOAD : lists.debrisTypes.HAUL_OUT;
  // The lookup the phone holds is its site's: a ticket begun at another site holds none of it.
  const heldHere = held.assignment.site?.id === now.siteId ? lists.quantityLookup : [];
  const primeId =
    lists.certifications.find((one) => one.certNumber === now.certNumber)?.prime.id ?? null;
  const asked = new PhoneQuantityAsks(heldHere).at(kind, now.formDebrisTypeId, primeId);
  const asks: QuantityAskName = asked.asks;
  const [adding, setAdding] = useState(now.scaleReceipt !== null && asks !== 'SCALE_WEIGHT');
  const receiptStep = asks === 'SCALE_WEIGHT' || adding;
  const steps: DisposalStep[] = [
    'debris',
    'quantity',
    ...(receiptStep ? (['receipt', 'weights'] as const) : []),
    'photos',
    'review',
  ];
  const left = steps.find((step) => step === ticket.step);
  const [step, setStep] = useState<DisposalStep>(left ?? 'debris');
  const [call, setCall] = useState(now.loadCall === null ? '' : String(now.loadCall));
  const [count, setCount] = useState(now.carriedCount === null ? '' : String(now.carriedCount));
  const [receiptNumber, setReceiptNumber] = useState(now.scaleReceipt?.receiptNumber ?? '');
  const shown = (value: number | null | undefined) => (value == null ? '' : String(value));
  const [gross, setGross] = useState(shown(now.scaleReceipt?.grossWeightLb));
  const [tare, setTare] = useState(shown(now.scaleReceipt?.tareWeightLb));
  const [net, setNet] = useState(shown(now.scaleReceipt?.netWeightLb));
  const [tons, setTons] = useState(shown(now.scaleReceipt?.netWeightTons));
  const { submitting, notKept, submit } = useSubmit(parts, onSubmitted);
  const place = steps.indexOf(step);
  const siteName = held.assignment.site?.name ?? '';
  const day = new ProjectClock(now.timeZone).day(new Date());
  const earlier =
    now.siteId === null ? [] : parts.tickets.receiptsAt(now.monitorId, now.siteId, day);

  const changed = async (change: Parameters<PhoneTickets['changed']>[1]) => {
    const next = await parts.tickets.changed(now.id, change);
    setNow(next);
    return next;
  };
  const go = (to: DisposalStep | undefined) => {
    if (to === undefined) return;
    setStep(to);
    void changed({ step: to });
  };
  const onward = (from: DisposalStep = step) => {
    go(steps[steps.indexOf(from) + 1]);
  };
  // A receipt pointed at, a tandem's, is the earlier ticket's as it was copied: its weights are
  // never typed again here, so a second copy of one paper is never made (ADR-175).
  const sharing = now.scaleReceipt?.shared === true;
  const back = () => {
    const before = steps[place - 1];
    if (before === undefined) onBackToTicket();
    else go(before === 'weights' && sharing ? 'receipt' : before);
  };
  const frame = (title: string, actions: ReactNode, children?: ReactNode) => (
    <Frame
      screen="disposal"
      standing={standing}
      title={title}
      titleId={titleId}
      step={place + 1}
      steps={steps.length}
      onBack={back}
      actions={actions}
      onLeave={onLeave}
      below={below}
    >
      {children}
    </Frame>
  );
  const next = (enabled: boolean, onPress: () => void) => (
    <Button main wide isDisabled={!enabled} onPress={onPress}>
      {said.next}
    </Button>
  );
  // The weights typed, each as the paper shows it.
  const weights = {
    grossWeightLb: weightOf(gross, 2),
    tareWeightLb: weightOf(tare, 2),
    netWeightLb: weightOf(net, 2),
    netWeightTons: weightOf(tons, 4),
  };
  const weightsRead = Object.values(weights).every((weight) => weight !== 'not');
  // The receipt as copied: kept with this ticket, its weights as typed.
  const copied = (): TicketReceipt => {
    const at = new Date();
    const read = (weight: number | null | 'not') => (weight === 'not' ? null : weight);
    return {
      id: now.scaleReceipt !== null && !now.scaleReceipt.shared ? now.scaleReceipt.id : uuidv7(at),
      receiptNumber: receiptNumber.trim(),
      grossWeightLb: read(weights.grossWeightLb),
      tareWeightLb: read(weights.tareWeightLb),
      netWeightLb: read(weights.netWeightLb),
      netWeightTons: read(weights.netWeightTons),
      enteredAt: at.toISOString(),
      offset: offsetOf(at),
      shared: false,
    };
  };
  const notHeld =
    asked.from === 'NOT_HELD' && heldHere.length === 0 ? (
      <Banner tone="notice" announced>
        <p>
          {say(kind === 'DISPOSAL' ? said.quantity.notHeldLoad : said.quantity.notHeldHaulOut, {
            site: siteName,
          })}
        </p>
      </Banner>
    ) : null;
  // The scale receipt offered beside a load call (once one is typed) or nothing more: what was
  // entered kept, then the receipt's steps.
  const offerReceipt = (
    <Button
      wide
      isDisabled={asks === 'LOAD_CALL' && callOf(call) === null}
      onPress={() => {
        setAdding(true);
        void changed({
          loadCall: asks === 'LOAD_CALL' ? callOf(call) : null,
          carriedCount: null,
        }).then(() => {
          go('receipt');
        });
      }}
    >
      {said.receipt.add}
    </Button>
  );

  // The quantity the site's lookup asks, one and never two.
  const quantity = () => {
    switch (asks) {
      case 'LOAD_CALL':
        return frame(
          said.call.title,
          <>
            {next(callOf(call) !== null, () => {
              void changed({ loadCall: callOf(call), carriedCount: null }).then(() => {
                onward();
              });
            })}
            {adding || now.siteId === null ? null : offerReceipt}
          </>,
          <>
            {notHeld}
            <LoadCall titleId={titleId} typed={call} onChange={setCall} about={said.call.about} />
            {adding || now.siteId === null ? null : (
              <p className="quiet">{said.receipt.addAbout}</p>
            )}
          </>,
        );
      case 'CARRIED_COUNT':
        return frame(
          said.count.title,
          next(/^\d+$/.test(count), () => {
            void changed({ carriedCount: Number(count), loadCall: null, scaleReceipt: null }).then(
              () => {
                onward();
              },
            );
          }),
          <>
            <p>{said.count.about}</p>
            <NumberKeypad
              labelledBy={titleId}
              value={count}
              onChange={setCount}
              digitsAtMost={4}
              unit={said.count.unit}
            />
          </>,
        );
      case 'SCALE_WEIGHT':
        return frame(
          said.weight.title,
          next(true, () => {
            void changed({ loadCall: null, carriedCount: null }).then(() => {
              onward();
            });
          }),
          <p>{say(said.weight.about, { site: siteName })}</p>,
        );
      case 'NOTHING_MORE':
        return frame(
          said.nothing.title,
          <>
            {next(true, () => {
              void changed({ loadCall: null, carriedCount: null }).then(() => {
                onward();
              });
            })}
            {adding || now.siteId === null ? null : offerReceipt}
          </>,
          <>
            {notHeld}
            <p>{said.nothing.about}</p>
            {adding || now.siteId === null ? null : (
              <p className="quiet">{said.receipt.addAbout}</p>
            )}
          </>,
        );
    }
  };

  switch (step) {
    case 'debris':
      return frame(
        said.debris.title,
        now.formDebrisTypeId === null
          ? null
          : next(true, () => {
              onward();
            }),
        <ListPicker
          labelledBy={titleId}
          choices={debrisTypes.map(({ id, name }) => ({ key: id, label: name }))}
          picked={now.formDebrisTypeId}
          onPick={(picked) => {
            void changed({ formDebrisTypeId: picked }).then(() => {
              onward('debris');
            });
          }}
        />,
      );
    case 'quantity':
      return quantity();
    case 'receipt':
      return frame(
        said.receipt.title,
        <>
          {next(receiptNumber.trim() !== '', () => {
            if (sharing && receiptNumber.trim() === now.scaleReceipt.receiptNumber) go('photos');
            else onward();
          })}
          {asks === 'SCALE_WEIGHT' ? null : (
            <Button
              wide
              onPress={() => {
                setAdding(false);
                void changed({ scaleReceipt: null, step: 'photos' }).then(() => {
                  setStep('photos');
                });
              }}
            >
              {said.receipt.leaveOut}
            </Button>
          )}
        </>,
        <>
          {earlier.length === 0 ? null : (
            <>
              <p>{said.receipt.sameAbout}</p>
              <ListPicker
                labelledBy={titleId}
                choices={earlier.flatMap((one) =>
                  one.scaleReceipt === null
                    ? []
                    : [
                        {
                          key: one.scaleReceipt.id,
                          label: say(said.receipt.same, {
                            number: one.ticketNumber,
                            receipt: one.scaleReceipt.receiptNumber,
                          }),
                          detail: receiptWords(one.scaleReceipt),
                        },
                      ],
                )}
                picked={now.scaleReceipt?.shared === true ? now.scaleReceipt.id : null}
                onPick={(picked) => {
                  const from = earlier.find((one) => one.scaleReceipt?.id === picked)?.scaleReceipt;
                  if (from == null) return;
                  setReceiptNumber(from.receiptNumber);
                  setGross(shown(from.grossWeightLb));
                  setTare(shown(from.tareWeightLb));
                  setNet(shown(from.netWeightLb));
                  setTons(shown(from.netWeightTons));
                  void changed({ scaleReceipt: { ...from, shared: true } }).then(() => {
                    go('photos');
                  });
                }}
              />
            </>
          )}
          <p>{said.receipt.about}</p>
          <TextEntry
            label={said.receipt.number}
            value={receiptNumber}
            onChange={setReceiptNumber}
          />
        </>,
      );
    case 'weights':
      return frame(
        said.receipt.weightsTitle,
        next(weightsRead, () => {
          void changed({ scaleReceipt: copied() }).then(() => {
            onward();
          });
        }),
        <>
          <p>{said.receipt.weightsAbout}</p>
          <TextEntry label={said.receipt.gross} value={gross} onChange={setGross} decimal />
          <TextEntry label={said.receipt.tare} value={tare} onChange={setTare} decimal />
          <TextEntry label={said.receipt.net} value={net} onChange={setNet} decimal />
          <TextEntry label={said.receipt.tons} value={tons} onChange={setTons} decimal />
          {weightsRead ? null : (
            <Banner tone="problem" announced>
              <p>{said.receipt.notANumber}</p>
            </Banner>
          )}
        </>,
      );
    case 'photos':
      return frame(
        said.photos.title,
        next(true, () => {
          onward();
        }),
        <Photos parts={parts} ticket={now} onChanged={setNow} onPhoto={onPhoto} />,
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
            submit(now);
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
              {now.ticketNumber}
              {reason === undefined
                ? null
                : ` · ${say(said.review.typed, { reason: reason.name })}`}
            </dd>
            <dt>{said.review.site}</dt>
            <dd>{siteName}</dd>
            <dt>{said.review.debris}</dt>
            <dd>{named(debrisTypes, now.formDebrisTypeId)}</dd>
            {now.loadCall === null ? null : (
              <>
                <dt>{said.review.call}</dt>
                <dd>{say(said.review.callShown, { call: now.loadCall })}</dd>
              </>
            )}
            {now.carriedCount === null ? null : (
              <>
                <dt>{said.review.count}</dt>
                <dd>{now.carriedCount}</dd>
              </>
            )}
            {now.scaleReceipt === null ? null : (
              <>
                <dt>{said.review.receipt}</dt>
                <dd>{receiptWords(now.scaleReceipt)}</dd>
              </>
            )}
          </dl>
          <h2>{said.review.photos}</h2>
          {now.photos.length === 0 ? (
            <p>{said.review.none}</p>
          ) : (
            <Photos parts={parts} ticket={now} onChanged={setNow} onPhoto={onPhoto} />
          )}
        </>,
      );
    }
  }
}

type HaulOutStep = 'debris' | 'call' | 'photos' | 'review';
const haulOutSteps: readonly HaulOutStep[] = ['debris', 'call', 'photos', 'review'];

export function CompleteHaulOut({
  parts,
  ticket,
  lists,
  standing,
  onBackToTicket,
  onPhoto,
  onSubmitted,
  onLeave,
  below,
}: Completing & { readonly lists: PhoneListsRecord }) {
  const titleId = useId();
  const [now, setNow] = useState(ticket);
  const left = haulOutSteps.find((step) => step === ticket.step);
  const [step, setStep] = useState<HaulOutStep>(left ?? 'debris');
  const [call, setCall] = useState(now.loadCall === null ? '' : String(now.loadCall));
  const { submitting, notKept, submit } = useSubmit(parts, onSubmitted);
  const place = haulOutSteps.indexOf(step);
  const split = now.splitSuffix !== '';
  // The pile before this one in the chain, and the load call so far it gave.
  const pileBefore = split ? parts.tickets.pileBefore(now) : undefined;

  const changed = async (change: Parameters<PhoneTickets['changed']>[1]) => {
    const next = await parts.tickets.changed(now.id, change);
    setNow(next);
    return next;
  };
  const go = (to: HaulOutStep | undefined) => {
    if (to === undefined) return;
    setStep(to);
    void changed({ step: to });
  };
  const onward = () => {
    go(haulOutSteps[place + 1]);
  };
  const back = () => {
    const earlier = haulOutSteps[place - 1];
    if (earlier === undefined) onBackToTicket();
    else go(earlier);
  };
  const frame = (title: string, actions: ReactNode, children?: ReactNode) => (
    <Frame
      screen="haulOut"
      standing={standing}
      title={title}
      titleId={titleId}
      step={place + 1}
      steps={haulOutSteps.length}
      onBack={back}
      actions={actions}
      onLeave={onLeave}
      below={below}
    >
      {children}
    </Frame>
  );
  const next = (enabled: boolean, onPress: () => void) => (
    <Button main wide isDisabled={!enabled} onPress={onPress}>
      {said.next}
    </Button>
  );

  switch (step) {
    case 'debris':
      return frame(
        said.debris.title,
        now.formDebrisTypeId === null ? null : next(true, onward),
        <ListPicker
          labelledBy={titleId}
          choices={lists.debrisTypes.HAUL_OUT.map(({ id, name }) => ({ key: id, label: name }))}
          picked={now.formDebrisTypeId}
          onPick={(picked) => {
            void changed({ formDebrisTypeId: picked }).then(onward);
          }}
        />,
      );
    case 'call':
      return frame(
        split ? said.call.pileTitle : said.call.haulOutTitle,
        next(callOf(call) !== null, () => {
          void changed({ loadCall: callOf(call) }).then(onward);
        }),
        <>
          <LoadCall
            titleId={titleId}
            typed={call}
            onChange={setCall}
            about={split ? said.call.pileAbout : said.call.haulOutAbout}
          />
          {pileBefore?.loadCall == null ? null : (
            <p>
              {say(said.call.pileBefore, {
                suffix: pileBefore.splitSuffix,
                call: pileBefore.loadCall,
              })}
            </p>
          )}
        </>,
      );
    case 'photos':
      return frame(
        said.photos.title,
        next(true, onward),
        <Photos parts={parts} ticket={now} onChanged={setNow} onPhoto={onPhoto} />,
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
            submit(now);
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
              {split ? `${now.ticketNumber}-${now.splitSuffix}` : now.ticketNumber}
              {reason === undefined
                ? null
                : ` · ${say(said.review.typed, { reason: reason.name })}`}
            </dd>
            <dt>{said.review.debris}</dt>
            <dd>{named(lists.debrisTypes.HAUL_OUT, now.formDebrisTypeId)}</dd>
            <dt>{split ? said.review.callSoFar : said.review.call}</dt>
            <dd>
              {now.loadCall === null
                ? said.review.none
                : say(said.review.callShown, { call: now.loadCall })}
            </dd>
          </dl>
          <h2>{said.review.photos}</h2>
          {now.photos.length === 0 ? (
            <p>{said.review.none}</p>
          ) : (
            <Photos parts={parts} ticket={now} onChanged={setNow} onPhoto={onPhoto} />
          )}
        </>,
      );
    }
  }
}
