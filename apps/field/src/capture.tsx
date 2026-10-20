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
//   opens one full size. Taken from the camera only (`camera.tsx`, task 3.6.1, ADR-586), at any
//   step while the ticket is open; taken again or removed from its full size before submitting.
// - **Where it was**: "Capture GPS", then the address looked up where there is signal, or typed
//   (ADR-111, 119): a collection's place and a unit rate ticket's one point (REQ-306).
import type { PhoneListsRecord } from '@open-adms/contracts';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button as Pressable } from 'react-aria-components';

import { TakePhoto } from './camera.tsx';
import {
  Banner,
  Button,
  NumberKeypad,
  ProgressHeader,
  StatusStrip,
  TextEntry,
  type Standing,
} from './look/index.ts';
import type { Camera } from './phone/camera.ts';
import type { AddressLookup, Locator } from './phone/place.ts';
import type { PhoneTicket, TicketDetails, TicketPhoto } from './phone/tickets.ts';
import { say, timeOfDay, words } from './words.ts';

const said = words.capture;

// What holds a ticket's or a form's photographs' bytes (`PhoneTickets`, `PhoneForms`).
export interface PhotoBytes {
  photoBytes(photoId: string): Promise<Uint8Array | undefined>;
}
// A ticket or a form, as its photographs are shown.
export type Photographed = Pick<PhoneTicket, 'photos' | 'timeZone'>;
// Where a ticket or a form was, and what its place step changes.
export type Placed = Pick<PhoneTicket, 'end' | 'address' | 'addressSource'>;
export type PlaceChange = Partial<Pick<TicketDetails, 'end' | 'address' | 'addressSource'>>;

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

// "Cancel the ticket?", asked before a ticket started by mistake is cancelled: kept on the phone,
// never sent, its number never used again (ADR-056, 571). A disposal is told a load turned away
// gets nothing (ADR-155).
export function CancelTicket({
  ticket,
  standing,
  onKeep,
  onCancel,
  below,
}: {
  readonly ticket: Pick<PhoneTicket, 'ticketNumber' | 'kind'>;
  readonly standing: Standing;
  readonly onKeep: () => void;
  readonly onCancel: () => void;
  readonly below?: ReactNode;
}) {
  const disposal = ticket.kind === 'DISPOSAL' || ticket.kind === 'HAUL_OUT_DISPOSAL';
  return (
    <main data-screen="cancel-ticket" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <h1>{say(said.open.cancelTitle, { number: ticket.ticketNumber })}</h1>
        <p>{said.open.cancelAbout}</p>
        {disposal ? <p>{said.open.turnedAway}</p> : null}
      </div>
      <div className="screen-actions">
        <Button main wide onPress={onKeep}>
          {said.open.cancelNo}
        </Button>
        <Button wide onPress={onCancel}>
          {said.open.cancelYes}
        </Button>
      </div>
      {below}
    </main>
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
  readonly tickets: PhotoBytes;
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

// What a photograph is called, to the eye and to a screen reader: a stage of the work's by its
// stage ("Pre-work photo, 8:41 AM", ADR-590).
export const photoLabel = (ticket: Photographed, photo: TicketPhoto): string => {
  const time = timeOfDay(new Date(photo.capturedAt), ticket.timeZone);
  return photo.stage === undefined
    ? say(said.photos.taken, {
        number: ticket.photos.indexOf(photo) + 1,
        count: ticket.photos.length,
        time,
      })
    : say(said.photos.stageTaken, { stage: said.stages.names[photo.stage], time });
};

// A ticket's photographs, each shown and opened full size with a press, and the way to take
// another, at most the ticket's eight (ADR-157).
export function TicketPhotos({
  tickets,
  camera,
  ticket,
  atMost,
  onTaken,
  onOpen,
}: {
  readonly tickets: PhotoBytes;
  readonly camera: Camera;
  readonly ticket: Photographed;
  readonly atMost: number;
  readonly onTaken: (bytes: Uint8Array) => Promise<boolean>;
  readonly onOpen: (photo: TicketPhoto) => void;
}) {
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
      <TakePhoto camera={camera} isDisabled={full} onTaken={onTaken}>
        {words.look.photos.take}
      </TakePhoto>
    </div>
  );
}

// The address typed, kept as typed where it isn't the one looked up.
export function typedAddressChange(ticket: Placed, typed: string): PlaceChange {
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
  readonly ticket: Placed;
  readonly typed: string;
  readonly onTyped: (typed: string) => void;
  readonly onChanged: (change: PlaceChange) => Promise<unknown>;
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
