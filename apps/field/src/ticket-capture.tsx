// A ticket's capture on the phone, from New to submitted (adms-field-app §4A.2…§4A.6;
// adms-ticket-workflows; BACKLOG 3.5.1…3.5.3; AC-04-44, AC-11-05, 74…79; ADR-030, 056, 155, 477,
// 571, 573, 581…583): New (`new-ticket.tsx`), the open ticket, its Complete (the collection's,
// `collection.tsx`; the tower's and the haul-out's, `tower.tsx`; unit rate's, `unit-rate.tsx`), a
// photograph shown full size, taken again in its place or removed while the ticket is open
// (ADR-571, 586), and submitted.
//
// - **The open ticket**: its truck, its number, when it was begun, a word where the phone's fix
//   puts it away from its site (C118, ADR-585), "Mark waypoint" on a
//   collection (ADR-581), its photographs; Complete, leave it for now (it waits on home, where the
//   monitor left it, across sign-outs and restarts: ADR-571), or cancel it (kept on the phone,
//   never sent: ADR-056). **A load turned away at a tower gets nothing** (ADR-155; AC-04-44): its
//   disposal, opened at New, is cancelled, and no other record is made.
// - **Submitted, sealed for the monitor** (ADR-477): the next ticket, or a split's next property
//   or pile under the same number (adms-field-app §4A.3). **Its receipt prints as it is
//   submitted** (task 3.6.2, ADR-595; AC-04-97): its copies through the phone's printer, said on
//   the screen with "Print the receipt again"; a collection from a control ticket prints none (the
//   ticket handed over, its stub kept). **On a control-ticket project the tower may instead write
//   the load call, the monitor's name and the truck on the back of the driver's ticket** (ADR-115;
//   REQ-321), as the screen says.
import type { PhoneAssignmentAnswer } from '@open-adms/contracts';
import { SiteArea, ticketPhotosAtMost, type SiteAreaHeld } from '@open-adms/domain';
import { useState, type ReactNode } from 'react';

import { TakePhoto } from './camera.tsx';
import { CancelTicket, PhotoDrawn, photoLabel, TicketPhotos, TruckFacts } from './capture.tsx';
import { CompleteCollection } from './collection.tsx';
import { Banner, Button, StatusStrip, type Standing } from './look/index.ts';
import { NewTicket, nextSuffix } from './new-ticket.tsx';
import type { Camera } from './phone/camera.ts';
import type { PhoneCertifications } from './phone/certifications.ts';
import type { PhoneForms } from './phone/forms.ts';
import type { HeldLists, PhoneLists } from './phone/lists.ts';
import type { SignedIn } from './phone/monitor.ts';
import type { AddressLookup, Locator } from './phone/place.ts';
import type { PhoneTickets, PhoneTicket } from './phone/tickets.ts';
import { ticketReceipt, type Printed, type ReceiptPrinter } from './phone/printing.ts';
import { workOfKind } from './phone/works.ts';
import { printed, ReceiptPrinted } from './printing.tsx';
import { CompleteDisposal, CompleteHaulOut } from './tower.tsx';
import { CompleteUnitRate } from './unit-rate.tsx';
import { counted, say, timeOfDay, words } from './words.ts';

const said = words.capture;

// What the capture screens work with: the phone's tickets, its forms (ADR-584), its certifications
// (ADR-585) and its lists, its place, the address lookup, and the most waypoints a collection takes
// (the policy's).
export interface CaptureParts {
  readonly tickets: PhoneTickets;
  readonly forms: PhoneForms;
  readonly certifications: PhoneCertifications;
  readonly lists: PhoneLists;
  readonly locator: Locator;
  readonly lookup: AddressLookup;
  // The camera, opened only when a photograph is taken (task 3.6.1, ADR-586).
  readonly camera: Camera;
  // The phone's printer, which every submit prints its receipt on (task 3.6.2, ADR-595).
  readonly printer: ReceiptPrinter;
  readonly waypointsAtMost: number;
}

// The site a ticket's work is at, by name, where the phone's fix at New puts it outside the site's
// area as the lists hold it (the domain's `SiteArea`, the worker's rule; ADR-552 (3)(d), 585):
// an advisory, never a refusal. None where the work is at no site or the phone had no fix.
function awayFrom(ticket: PhoneTicket, held: HeldLists): string | undefined {
  const site = held.lists.sites.find(({ id }) => id === ticket.siteId);
  if (site === undefined || ticket.start === null) return undefined;
  const area: SiteAreaHeld =
    site.area.kind === 'CIRCLE'
      ? site.area
      : { kind: 'SHAPE', shape: { geometry: site.area.geometry, box: site.area.box } };
  return new SiteArea(site, area).holds(ticket.start) ? undefined : site.name;
}

// The kinds of field event captured here: a load's two, a haul-out's two, and unit rate work.
export type CapturedKind = PhoneTicket['kind'];

// Where the capture is: New, a ticket open, being completed, a photograph shown, or submitted.
export type Capturing =
  | {
      readonly at: 'new';
      readonly kind: CapturedKind;
      readonly split?: { readonly after: PhoneTicket };
    }
  | { readonly at: 'open'; readonly id: string; readonly reopened?: boolean }
  | { readonly at: 'complete'; readonly id: string }
  | {
      readonly at: 'photo';
      readonly id: string;
      readonly photoId: string;
      readonly from: 'open' | 'complete';
    }
  | { readonly at: 'submitted'; readonly id: string };

export function TicketCapture({
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
  readonly start: Capturing;
  readonly onHome: () => void;
  // What shows below every screen: the warning before the lock after inactivity.
  readonly after?: ReactNode;
}) {
  const [at, setAt] = useState<Capturing>(start);
  const [lists, setLists] = useState(held);
  const [print, setPrint] = useState<Printed | null>(null);
  const ticket = 'id' in at ? parts.tickets.ticket(at.id) : undefined;
  const receiptOf = (of: PhoneTicket) =>
    ticketReceipt(of, lists.lists, assignment.project.name, {
      name: signedIn.name,
      monitorNumber: signedIn.monitorNumber,
    });

  switch (at.at) {
    case 'new':
      return (
        <NewTicket
          key={`${at.kind}-${at.split?.after.id ?? 'first'}`}
          kind={at.kind}
          parts={parts}
          signedIn={signedIn}
          assignment={assignment}
          held={lists}
          standing={standing}
          {...(at.split === undefined ? {} : { after: at.split.after })}
          onListsRead={setLists}
          onOpened={(opened, reopened) => {
            // Unit rate work goes straight on to its own steps, the crew first (the user,
            // ADR-592): the open ticket is a load's and a haul-out's.
            setAt(
              opened.kind === 'UNIT_RATE'
                ? { at: 'complete', id: opened.id }
                : { at: 'open', id: opened.id, reopened },
            );
          }}
          onCancel={onHome}
          below={after}
        />
      );
    case 'open':
      if (ticket === undefined) return null;
      return (
        <OpenTicket
          parts={parts}
          ticket={ticket}
          lists={lists}
          standing={standing}
          reopened={at.reopened ?? false}
          onComplete={() => {
            setAt({ at: 'complete', id: ticket.id });
          }}
          onPhoto={(photoId) => {
            setAt({ at: 'photo', id: ticket.id, photoId, from: 'open' });
          }}
          onLeave={onHome}
          below={after}
        />
      );
    case 'complete':
      if (ticket === undefined) return null;
      return (
        <Complete
          parts={parts}
          ticket={ticket}
          held={lists}
          standing={standing}
          onBackToTicket={() => {
            setAt({ at: 'open', id: ticket.id });
          }}
          onPhoto={(photoId) => {
            setAt({ at: 'photo', id: ticket.id, photoId, from: 'complete' });
          }}
          onSubmitted={() => {
            // Its receipt prints as it is submitted, its copies (none for a control ticket's
            // collection): said, never waited on.
            const submitted = parts.tickets.ticket(ticket.id);
            setPrint(null);
            setAt({ at: 'submitted', id: ticket.id });
            if (submitted === undefined) return;
            const receipt = receiptOf(submitted);
            if (receipt.copies.length > 0) {
              void printed(parts.printer, receipt, receipt.copies).then(setPrint);
            }
          }}
          onLeave={onHome}
          below={after}
        />
      );
    case 'photo': {
      const photo = ticket?.photos.find(({ id }) => id === at.photoId);
      if (ticket === undefined || photo === undefined) return null;
      const back = () => {
        setAt(
          at.from === 'open' ? { at: 'open', id: ticket.id } : { at: 'complete', id: ticket.id },
        );
      };
      return (
        <main data-screen="photo" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <h1>{photoLabel(ticket, photo)}</h1>
            <PhotoDrawn
              tickets={parts.tickets}
              photo={photo}
              label={photoLabel(ticket, photo)}
              large
            />
          </div>
          <div className="screen-actions">
            <Button main wide onPress={back}>
              {said.photos.back}
            </Button>
            {ticket.state === 'OPEN' ? (
              <>
                <TakePhoto
                  camera={parts.camera}
                  onTaken={async (bytes) => {
                    const placed = await parts.locator.where();
                    const kept = await parts.tickets.photographed(
                      ticket.id,
                      bytes,
                      placed.kind === 'fix' ? placed.fix : null,
                      photo.id,
                    );
                    if (kept) back();
                    return kept;
                  }}
                >
                  {said.photos.retake}
                </TakePhoto>
                <Button
                  wide
                  onPress={() => {
                    void parts.tickets.photoRemoved(ticket.id, photo.id).then(back);
                  }}
                >
                  {said.photos.remove}
                </Button>
              </>
            ) : null}
          </div>
          {after}
        </main>
      );
    }
    case 'submitted': {
      if (ticket === undefined) return null;
      const { kind } = ticket;
      const disposal = kind === 'DISPOSAL' || kind === 'HAUL_OUT_DISPOSAL';
      const onPaper = lists.lists.numbering.ticketNumberSource === 'CONTROL';
      return (
        <main data-screen="submitted" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <h1>{say(said.submitted.title, { number: ticket.ticketNumber })}</h1>
            <Banner tone="good" announced>
              <p>{say(said.submitted.saved, { number: ticket.ticketNumber })}</p>
            </Banner>
            <p className="quiet">{said.submitted.sealed}</p>
            <ReceiptPrinted
              key={ticket.id}
              printer={parts.printer}
              receipt={receiptOf(ticket)}
              first={print}
            />
            {kind === 'DISPOSAL' && onPaper ? <p>{said.submitted.onTheBack}</p> : null}
          </div>
          <div className="screen-actions">
            {ticket.splitSuffix === '' || disposal ? null : (
              <Button
                main
                wide
                onPress={() => {
                  setAt({ at: 'new', kind, split: { after: ticket } });
                }}
              >
                {say(
                  kind === 'COLLECTION' ? said.submitted.nextProperty : said.submitted.nextPile,
                  {
                    number: ticket.ticketNumber,
                    suffix: nextSuffix(ticket.splitSuffix),
                  },
                )}
              </Button>
            )}
            <Button
              main={ticket.splitSuffix === ''}
              wide
              onPress={() => {
                setAt({ at: 'new', kind });
              }}
            >
              {words.home.start[workOfKind[kind]]}
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

// Complete, as the ticket's kind takes it.
function Complete({
  ticket,
  held,
  ...completing
}: {
  readonly parts: CaptureParts;
  readonly ticket: PhoneTicket;
  readonly held: HeldLists;
  readonly standing: Standing;
  readonly onBackToTicket: () => void;
  readonly onPhoto: (photoId: string) => void;
  readonly onSubmitted: () => void;
  readonly onLeave: () => void;
  readonly below?: ReactNode;
}) {
  switch (ticket.kind) {
    case 'COLLECTION':
      return <CompleteCollection {...completing} ticket={ticket} lists={held.lists} />;
    case 'HAUL_OUT_COLLECTION':
      return <CompleteHaulOut {...completing} ticket={ticket} lists={held.lists} />;
    case 'DISPOSAL':
    case 'HAUL_OUT_DISPOSAL':
      return <CompleteDisposal {...completing} ticket={ticket} held={held} />;
    case 'UNIT_RATE':
      return <CompleteUnitRate {...completing} ticket={ticket} held={held} />;
  }
}

function OpenTicket({
  parts,
  ticket,
  lists,
  standing,
  reopened,
  onComplete,
  onPhoto,
  onLeave,
  below,
}: {
  readonly parts: CaptureParts;
  readonly ticket: PhoneTicket;
  readonly lists: HeldLists;
  readonly standing: Standing;
  readonly reopened: boolean;
  readonly onComplete: () => void;
  readonly onPhoto: (photoId: string) => void;
  readonly onLeave: () => void;
  readonly below?: ReactNode;
}) {
  const [now, setNow] = useState(ticket);
  const [marked, setMarked] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [marking, setMarking] = useState(false);
  const titled = say(now.splitSuffix === '' ? said.open.title : said.open.split, {
    kind: said.kinds[now.kind],
    number: now.ticketNumber,
    suffix: now.splitSuffix,
  });
  const full = now.waypoints.length >= parts.waypointsAtMost;
  // Begun away from the assignment's site, by the phone's fix at New: said, never refused (C118).
  const away = awayFrom(now, lists);

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

  return (
    <main data-screen="open-ticket" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <h1>{titled}</h1>
        {reopened ? (
          <Banner tone="info" announced>
            <p>{say(said.badge.open, { truck: now.certNumber, number: now.ticketNumber })}</p>
          </Banner>
        ) : null}
        <TruckFacts
          certNumber={now.certNumber}
          lists={lists.lists}
          keyedByHand={now.certKeyedByHand}
        />
        <p>{say(said.open.started, { time: timeOfDay(new Date(now.startedAt), now.timeZone) })}</p>
        {away === undefined ? null : (
          <Banner tone="notice">
            <p>{say(said.open.notAtSite, { site: away })}</p>
          </Banner>
        )}
        {now.kind === 'COLLECTION' ? (
          <>
            <p>{counted(said.open.waypoints, now.waypoints.length)}</p>
            {marked === null ? null : <p role="status">{marked}</p>}
            {full ? <p>{say(said.open.waypointsFull, { max: parts.waypointsAtMost })}</p> : null}
            {refused ? (
              <Banner tone="notice">
                <p>{said.open.placeRefused}</p>
              </Banner>
            ) : null}
            <Button
              wide
              isDisabled={full || marking}
              onPress={() => {
                setMarking(true);
                const at = new Date();
                void parts.locator.where().then(async (placed) => {
                  setRefused(placed.kind === 'refused');
                  const fixed = placed.kind === 'fix' ? placed.fix : null;
                  const next = await parts.tickets.markWaypoint(
                    now.id,
                    at,
                    fixed,
                    parts.waypointsAtMost,
                  );
                  setNow(next);
                  setMarked(
                    say(fixed === null ? said.open.waypointNoFix : said.open.waypointFix, {
                      number: next.waypoints.length,
                      time: timeOfDay(at, now.timeZone),
                    }),
                  );
                  setMarking(false);
                });
              }}
            >
              {said.open.waypoint}
            </Button>
          </>
        ) : null}
        <TicketPhotos
          tickets={parts.tickets}
          camera={parts.camera}
          ticket={now}
          atMost={ticketPhotosAtMost}
          onTaken={async (bytes) => {
            const placed = await parts.locator.where();
            const kept = await parts.tickets.photographed(
              now.id,
              bytes,
              placed.kind === 'fix' ? placed.fix : null,
            );
            const after = parts.tickets.ticket(now.id);
            if (after !== undefined) setNow(after);
            return kept;
          }}
          onOpen={(photo) => {
            onPhoto(photo.id);
          }}
        />
      </div>
      <div className="screen-actions">
        <Button main wide onPress={onComplete}>
          {said.open.complete}
        </Button>
        <Button wide onPress={onLeave}>
          {said.leave}
        </Button>
        <Button
          wide
          onPress={() => {
            setCancelling(true);
          }}
        >
          {said.open.cancel}
        </Button>
      </div>
      {below}
    </main>
  );
}
