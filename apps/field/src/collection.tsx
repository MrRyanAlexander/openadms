// The collection's Complete, on the phone (adms-field-app §4A.2…§4A.6; adms-ticket-workflows;
// BACKLOG 3.5.1, C121, C139; AC-02-45, AC-04-24, 92, 98, AC-11-05, 36, 37, 68, 77…79; ADR-030,
// 032, 055, 083, 111, 119, 207, 218, 477, 571, 573, 581). New, the open ticket and submitted are
// every capture's (`new-ticket.tsx`, `ticket-capture.tsx`).
//
// **Complete**: the debris type, picked by name (ADR-207; invariant 20), and never a field tag
// (the user, ADR-591); for a split's property, its ROE and its estimate (ADR-032, 055); where it
// was collected
// (GPS, then the address looked up or typed: ADR-111, 119); photos; **the review, every value
// once, the only "is this right?"** (the user, Q-215, ADR-573), the photographs themselves; then
// **submitted, sealed for the monitor** (ADR-477).
//
// Nothing here waits on the server (ADR-030; AC-11-05): the address is looked up only where there
// is signal. Every value entered is kept on the phone at once.
import type { PhoneListsRecord } from '@open-adms/contracts';
import { ticketPhotosAtMost } from '@open-adms/domain';
import { useId, useState, type ReactNode } from 'react';

import { PlaceFields, Step, TicketPhotos, typedAddressChange } from './capture.tsx';
import {
  Banner,
  Button,
  ListPicker,
  NumberKeypad,
  TextEntry,
  type Standing,
} from './look/index.ts';
import type { PhoneTickets, PhoneTicket } from './phone/tickets.ts';
import type { CaptureParts } from './ticket-capture.tsx';
import { counted, say, words } from './words.ts';

const said = words.capture;

const completeSteps = ['debris', 'roe', 'estimate', 'place', 'photos', 'review'] as const;
type CompleteStep = (typeof completeSteps)[number];

// The steps a ticket's Complete takes: an ROE where it is a split's property or the phone holds
// the project's ROEs, an estimate where it is a split's property.
function stepsOf(ticket: PhoneTicket, lists: PhoneListsRecord): CompleteStep[] {
  const split = ticket.splitSuffix !== '';
  return completeSteps.filter(
    (step) => (step !== 'roe' || split || lists.roes.length > 0) && (step !== 'estimate' || split),
  );
}

export function CompleteCollection({
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
            void changed(typedAddressChange(now, typedAddress)).then(onward);
          }}
        >
          {said.next}
        </Button>,
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
        <Button main wide onPress={onward}>
          {said.next}
        </Button>,
        <TicketPhotos
          tickets={parts.tickets}
          camera={parts.camera}
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
              camera={parts.camera}
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
