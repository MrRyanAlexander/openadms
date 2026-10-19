// What every capture screen shares (adms-field-app §4A.4; BACKLOG 3.5.1; ADR-561 (5), 571, 573,
// 581): the frame (the status strip, the progress header with its one question, the work, and the
// main action at the bottom in thumb reach), the truck a badge found, the number typed again where
// a person copied it, and a ticket's photographs, shown themselves.
//
// - **A copied number is typed again** (the user, Q-218, ADR-573; AC-11-82; WCAG 3.3.7, the copy
//   check essential): a number the phone made and one typed off a barcode that won't read; the
//   ticket opens only once the two match. Data entry, never an eligibility check.
// - **Photographs are shown themselves** (the user's notes, ADR-571; AC-11-78), each drawn from
//   its own bytes on a canvas, so the page's policy keeps `img-src 'self'` and takes no `blob:`
//   (AC-11-61), with words a screen reader says ("Photo 1 of 2, 8:41 AM", WCAG 1.1.1); a press
//   opens one full size. Taken from the phone's camera by the browser's own file input (the
//   camera's own screen is task 3.6.1's), at any step while the ticket is open.
// - **Where it was**: "Capture GPS", then the address looked up where there is signal, or typed
//   (ADR-111, 119): a collection's place and a unit rate ticket's one point (REQ-306).
import type { PhoneListsRecord } from '@open-adms/contracts';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button as Pressable } from 'react-aria-components';

import {
  Banner,
  Button,
  NumberKeypad,
  ProgressHeader,
  StatusStrip,
  TextEntry,
  type Standing,
} from './look/index.ts';
import { Camera } from './look/icons.tsx';
import type { AddressLookup, Locator } from './phone/place.ts';
import type { PhoneTickets, PhoneTicket, TicketDetails, TicketPhoto } from './phone/tickets.ts';
import { say, timeOfDay, words } from './words.ts';

const said = words.capture;

// The work of a capture step: its question, how far through, Back, the step's own words, and its
// actions at the bottom.
export function Step({
  standing,
  title,
  titleId,
  step,
  steps,
  onBack,
  actions,
  children,
}: {
  readonly standing: Standing;
  readonly title: string;
  readonly titleId: string;
  readonly step: number;
  readonly steps: number;
  readonly onBack?: (() => void) | undefined;
  readonly actions: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <>
      <StatusStrip standing={standing} />
      <div className="screen-body">
        {onBack === undefined ? (
          <ProgressHeader titleId={titleId} title={title} step={step} steps={steps} />
        ) : (
          <ProgressHeader
            titleId={titleId}
            title={title}
            step={step}
            steps={steps}
            onBack={onBack}
          />
        )}
        {children}
      </div>
      <div className="screen-actions">{actions}</div>
    </>
  );
}

// The truck or crew a badge's number finds in the phone's certifications: never the driver.
export function TruckFacts({
  certNumber,
  lists,
  keyedByHand = false,
}: {
  readonly certNumber: string;
  readonly lists: PhoneListsRecord;
  readonly keyedByHand?: boolean;
}) {
  const found = lists.certifications.find((held) => held.certNumber === certNumber);
  if (found === undefined) {
    return (
      <p>{say(keyedByHand ? said.badge.keyedTruck : said.badge.crew, { number: certNumber })}</p>
    );
  }
  const sub = found.secondTierSub ?? found.firstTierSub;
  return (
    <dl className="facts">
      <dt>{found.kind === 'CREW' ? said.review.crew : said.review.truck}</dt>
      <dd>
        {found.kind === 'CREW' || found.capacityCy === null
          ? say(said.badge.crew, { number: found.certNumber })
          : say(said.badge.truck, { number: found.certNumber, capacity: found.capacityCy })}
      </dd>
      <dt>{said.badge.contractor}</dt>
      <dd>
        {sub === null
          ? found.prime.name
          : say(said.badge.sub, { sub: sub.name, prime: found.prime.name })}
      </dd>
    </dl>
  );
}

// A number typed again, to match the one a person copied: the keypad, the number shown again on
// asking, and a calm word where the two didn't match.
export function TypeAgain({
  titleId,
  number,
  value,
  onChange,
  wrong,
}: {
  readonly titleId: string;
  readonly number: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly wrong: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <>
      {wrong ? (
        <Banner tone="problem" announced>
          <p>{said.number.wrong}</p>
        </Banner>
      ) : null}
      {shown ? (
        <dl className="facts">
          <dt>{said.number.shown}</dt>
          <dd className="big-number">{number}</dd>
        </dl>
      ) : null}
      <NumberKeypad
        labelledBy={titleId}
        value={value}
        onChange={onChange}
        digitsAtMost={Math.max(number.length, 10)}
      />
      {shown ? null : (
        <Button
          wide
          onPress={() => {
            setShown(true);
          }}
        >
          {said.number.showAgain}
        </Button>
      )}
    </>
  );
}

// One photograph drawn from its bytes, as large as its frame, with its words.
export function PhotoDrawn({
  tickets,
  photo,
  label,
  large = false,
}: {
  readonly tickets: PhoneTickets;
  readonly photo: TicketPhoto;
  readonly label: string;
  readonly large?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // Whether the photograph is still on the screen when its bytes come.
    const drawn = { still: true };
    const still = () => drawn.still;
    void tickets.photoBytes(photo.id).then(async (bytes) => {
      const target = canvas.current;
      if (!still() || bytes === undefined || target === null) return;
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)])).catch(
        () => undefined,
      );
      if (bitmap === undefined || !still()) return;
      const most = large ? 1200 : 160;
      const scale = Math.min(1, most / Math.max(bitmap.width, bitmap.height));
      target.width = Math.max(1, Math.round(bitmap.width * scale));
      target.height = Math.max(1, Math.round(bitmap.height * scale));
      target.getContext('2d')?.drawImage(bitmap, 0, 0, target.width, target.height);
      bitmap.close();
    });
    return () => {
      drawn.still = false;
    };
  }, [tickets, photo.id, large]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      className={large ? 'photo-large' : 'photo-thumb'}
    />
  );
}

// What a photograph is called, to the eye and to a screen reader.
export const photoLabel = (ticket: PhoneTicket, photo: TicketPhoto): string =>
  say(said.photos.taken, {
    number: ticket.photos.indexOf(photo) + 1,
    count: ticket.photos.length,
    time: timeOfDay(new Date(photo.capturedAt), ticket.timeZone),
  });

// A ticket's photographs, each shown and opened full size with a press, and the way to take
// another, at most the ticket's eight (ADR-157).
export function TicketPhotos({
  tickets,
  ticket,
  atMost,
  onTaken,
  onOpen,
}: {
  readonly tickets: PhoneTickets;
  readonly ticket: PhoneTicket;
  readonly atMost: number;
  readonly onTaken: (bytes: Uint8Array) => Promise<boolean>;
  readonly onOpen: (photo: TicketPhoto) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [refused, setRefused] = useState(false);
  const full = ticket.photos.length >= atMost;
  const listId = useId();
  return (
    <div className="photo-strip">
      <p id={listId}>
        {ticket.photos.length === 0
          ? say(words.look.photos.count.none, { max: atMost })
          : say(
              ticket.photos.length === 1
                ? words.look.photos.count.one
                : words.look.photos.count.other,
              { count: ticket.photos.length, max: atMost },
            )}
      </p>
      {ticket.photos.length === 0 ? null : (
        <ul className="photo-strip-photos" aria-labelledby={listId}>
          {ticket.photos.map((photo, place) => (
            <li key={photo.id}>
              <Pressable
                className="photo-open"
                aria-label={say(said.photos.open, { number: place + 1 })}
                onPress={() => {
                  onOpen(photo);
                }}
              >
                <PhotoDrawn tickets={tickets} photo={photo} label={photoLabel(ticket, photo)} />
              </Pressable>
            </li>
          ))}
        </ul>
      )}
      {full ? <p className="quiet">{words.look.photos.full}</p> : null}
      {refused ? (
        <Banner tone="notice" announced>
          <p>{said.photos.tooLarge}</p>
        </Banner>
      ) : null}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(chosen) => {
          const file = chosen.currentTarget.files?.[0];
          chosen.currentTarget.value = '';
          if (file === undefined) return;
          void file
            .arrayBuffer()
            .then((bytes) => onTaken(new Uint8Array(bytes)))
            .then((kept) => {
              setRefused(!kept);
            });
        }}
      />
      <Button
        wide
        icon={<Camera />}
        isDisabled={full}
        onPress={() => {
          input.current?.click();
        }}
      >
        {words.look.photos.take}
      </Button>
    </div>
  );
}

// The address typed, kept as typed where it isn't the one looked up.
export function typedAddressChange(ticket: PhoneTicket, typed: string): Partial<TicketDetails> {
  const typedNow = typed.trim();
  return typedNow !== '' && !(ticket.addressSource === 'LOOKED_UP' && ticket.address === typedNow)
    ? { address: typedNow, addressSource: 'TYPED' }
    : {};
}

// Where it was: the phone's GPS captured, then the address looked up where there is signal, or
// the street number and name typed. Nothing waits on the server (ADR-030).
export function PlaceFields({
  parts,
  ticket,
  typed,
  onTyped,
  onChanged,
}: {
  readonly parts: { readonly locator: Locator; readonly lookup: AddressLookup };
  readonly ticket: PhoneTicket;
  readonly typed: string;
  readonly onTyped: (typed: string) => void;
  readonly onChanged: (change: Partial<TicketDetails>) => Promise<unknown>;
}) {
  const [placing, setPlacing] = useState<'no' | 'fixing' | 'lookingUp'>('no');
  const [placed, setPlaced] = useState<'none' | 'refused' | 'notFound' | 'unanswered' | null>(null);
  return (
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
              await onChanged({ end: where.fix });
            } else setPlaced(where.kind);
          });
        }}
      >
        {placing === 'fixing' ? said.place.capturing : said.place.capture}
      </Button>
      {ticket.end === null ? null : (
        <p>
          {say(said.place.fix, { latitude: ticket.end.latitude, longitude: ticket.end.longitude })}
        </p>
      )}
      {placed === 'none' ? <p role="status">{said.place.noFix}</p> : null}
      {placed === 'refused' ? (
        <Banner tone="notice" announced>
          <p>{said.open.placeRefused}</p>
        </Banner>
      ) : null}
      {ticket.end === null || !navigator.onLine ? null : (
        <Button
          wide
          isDisabled={placing !== 'no'}
          onPress={() => {
            const { end } = ticket;
            if (end === null) return;
            setPlacing('lookingUp');
            void parts.lookup.at(end).then(async (found) => {
              setPlacing('no');
              if (found.kind === 'found') {
                setPlaced(null);
                onTyped(found.address);
                await onChanged({ address: found.address, addressSource: 'LOOKED_UP' });
              } else setPlaced(found.kind === 'none' ? 'notFound' : 'unanswered');
            });
          }}
        >
          {placing === 'lookingUp' ? said.place.lookingUp : said.place.lookUp}
        </Button>
      )}
      {ticket.addressSource === 'LOOKED_UP' && ticket.address !== null ? (
        <p role="status">{say(said.place.found, { address: ticket.address })}</p>
      ) : null}
      {placed === 'notFound' ? <p role="status">{said.place.notFound}</p> : null}
      {placed === 'unanswered' ? <p role="status">{said.place.unanswered}</p> : null}
      <TextEntry label={said.place.typed} value={typed} onChange={onTyped} />
    </>
  );
}
