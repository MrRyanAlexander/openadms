// The tickets begun on the phone (adms-field-app §4A.2, §4A.4, §4A.5; BACKLOG 3.5.1, C68, C69,
// C135, C139, C179; AC-02-44, 45, AC-04-08, 11, 91, 95, 96, AC-08-06, AC-11-36, 74…78, 80;
// ADR-031, 052, 056, 065, 209, 477, 571, 573, 581). What the capture screens keep and read, in the
// store, so a ticket left at any step is there after a sign-out and a restart (ADR-570).
//
// - **The badge, then the number, at New** (the user, ADR-571): a ticket opens under its number,
//   the next of the phone's block where the project generates them (marked used in its block in
//   the same piece of work, `PhoneLists.gaveOut`, so it is never made again), or the control
//   ticket scanned, or a number typed because the barcode won't read, with its reason. **The
//   number is typed again only where a person copied it off a pre-printed ticket** (the user,
//   Q-218, ADR-573, 589): that check is the screen's, before it opens anything.
// - **Several open, one per truck** (the user, ADR-571): a badge, or a truck keyed in by hand,
//   whose truck has a ticket open on this phone is that ticket. A ticket is its monitor's: another
//   monitor on the phone never sees it (*agent default*, as the archived queues, ADR-577).
// - **Nothing open is sent.** Submitted, it is made the field event the sync contract carries and
//   handed to the outbox, sealed (ADR-477): no screen opens it again. Its photographs follow it,
//   each with its file. A ticket half way through submitting when the phone stopped finishes when
//   it is opened again, so nothing is kept twice and nothing is lost.
// - **Cancelled, it stays on the phone, unsent** (ADR-056), keeping its number: a number the phone
//   made is never made again, and a cancelled ticket is left out of the phone's own duplicate
//   check, so a control ticket started by mistake can be scanned again (*agent default*, ADR-571).
// - **The phone's own duplicate check** (ADR-031; AC-04-96) knows only what this phone holds: a
//   number its tickets already hold for the same kind of field event is said before it is taken,
//   never refused. **A control ticket outside the project's ranges** is questioned the same way
//   (AC-04-08).
// - **Today's own count** (the user, Q-216, ADR-573; AC-11-80): the tickets this monitor submitted
//   on this phone on the project's day. **Two days' worth of numbers left** (ADR-065): fewer unused
//   than twice the most this phone made of a series in one day (the domain's `PhoneNumbers.low`).
// - **The tower and the haul-out** (BACKLOG 3.5.2; ADR-223, 227, 243, 582): a ticket holds the
//   one quantity its site's lookup asks, a load call, a count of the tickets the load carries or
//   a scale receipt copied by hand; the receipt is kept in the outbox with its disposal, before
//   it, in one change (ADR-034), and a tandem's second disposal points at the first's receipt,
//   never a second copy of it (ADR-175).
// - **Unit rate** (BACKLOG 3.5.3; REQ-306, 320; ADR-111, 207, 213, 583): a ticket holds the
//   payable type picked by name, its kind of work and the pay item the phone worked out from the
//   bands (what prints, never shown); the count, the measurement and how it was read, a stump's
//   root ball, "half or more exposed" and survey number, or the items with a count or hours each;
//   and "ineligible" where the monitor marked it. **The working crew** is the crew of the newest
//   unit rate ticket this monitor began on the project on this phone: a crew badge scanned once
//   stays theirs until they scan another (AC-04-70), and the server keeps no "current crew".
//   **Its photographs by stage** (the user, ADR-590): where its kind of work says so, a
//   photograph each of before the work, its measurement and after it, each taken again in its own
//   place, sent saying its stage.
//
// No rule lives here that the server doesn't hold too: what each kind records is the contract's
// own refusal at `PhoneOutbox.keep`, which answers before anything is sealed.
import type {
  PhoneListsRecord,
  SyncedFieldEvent,
  SyncedPhoto,
  SyncedRecord,
} from '@open-adms/contracts';
import {
  ControlTickets,
  NumberSeriesRules,
  PhoneNumbers,
  ProjectClock,
  ticketPhotosAtMost,
  uuidv7,
  type FieldEventKindName,
  type MasterPasscodeSessionKind,
  type MeasuredAs,
  type NotSavedNotice,
  type NumberSeriesName,
  type PhotoStage,
} from '@open-adms/domain';

import type { Change, Json, PhoneStore } from '../store/phone-store.ts';
import type { PhoneLists } from './lists.ts';
import type { PhoneOutbox } from './outbox.ts';
import {
  filesDropped,
  filesKept,
  filesOf,
  fingerprintsOf,
  KeptAsTaken,
  photoBytesOf,
  photoOf,
  photoTaken,
  type PhotoShrink,
  type TicketPhoto,
} from './photographs.ts';
import { offsetOf } from './reports.ts';

export type TicketState = 'OPEN' | 'SUBMITTING' | 'SUBMITTED' | 'CANCELLED';
// Where the number came from: made by the phone, scanned, typed off a barcode that won't read, or
// carried from the split chain's property before (adms-field-app §4A.3).
export type NumberFrom = 'MADE' | 'SCANNED' | 'TYPED' | 'CHAINED';
export type Workflow = SyncedFieldEvent['workflow'];

// A fix as the phone had it: exact decimal text, both halves (ADR-083; invariant 15).
export interface Fix {
  readonly latitude: string;
  readonly longitude: string;
}

export interface Waypoint {
  readonly markedAt: string;
  readonly fix: Fix | null;
}

export type { TicketPhoto } from './photographs.ts';

// A scale receipt copied by hand at the tower (ADR-034, 038; adms-scale-receipts): its number
// exactly as written and each weight as the paper says, none worked out. A tandem weighed once is
// one receipt both disposals point at: `shared` where this ticket points at the receipt kept with
// an earlier one, which is never kept twice (ADR-175, 582).
export interface TicketReceipt {
  readonly id: string;
  readonly receiptNumber: string;
  readonly grossWeightLb: number | null;
  readonly tareWeightLb: number | null;
  readonly netWeightLb: number | null;
  readonly netWeightTons: number | null;
  readonly enteredAt: string;
  readonly offset: number;
  readonly shared: boolean;
}

// An itemised unit rate ticket's line: the item picked, and its count or its hours.
export interface TicketItem {
  readonly itemNameId: string;
  readonly quantity: number;
}

// What a ticket's monitor entered after New, each as picked or typed; null where nothing was.
export interface TicketDetails {
  readonly formDebrisTypeId: string | null;
  readonly fieldTagId: string | null;
  readonly roeNumber: string | null;
  readonly estimateCy: number | null;
  readonly end: Fix | null;
  readonly address: string | null;
  readonly addressSource: 'LOOKED_UP' | 'TYPED' | null;
  readonly notes: string | null;
  // The one quantity the site's lookup asks (ADR-223, 227, 243): a load call (a haul-out's at its
  // loading end), a count of the tickets the load carries, or the scale receipt.
  readonly loadCall: number | null;
  readonly carriedCount: number | null;
  readonly scaleReceipt: TicketReceipt | null;
  // Unit rate work (ADR-207, 213): the payable type picked, its kind of work, and the pay item the
  // phone worked out; the count, or the items; a tree's measurement and how it was read, or a
  // stump's diameter two feet up with its root ball, whether half or more is exposed and its
  // survey number; and whether the monitor marked it ineligible, where the pay item allows it.
  readonly payableTypeId: string | null;
  readonly kindOfWorkId: string | null;
  readonly payItemId: string | null;
  readonly unitCount: number | null;
  readonly measurementInches: number | null;
  readonly measuredAs: MeasuredAs | null;
  readonly rootBallInches: number | null;
  readonly rootBallHalfExposed: boolean | null;
  readonly surveyNumber: string | null;
  readonly markedIneligible: boolean | null;
  readonly items: readonly TicketItem[];
}

export interface PhoneTicket extends TicketDetails {
  readonly id: string;
  readonly state: TicketState;
  readonly monitorId: string;
  readonly projectId: string;
  readonly timeZone: string;
  readonly assignmentId: string;
  readonly setupVersion: number;
  readonly masterPasscodeSession: MasterPasscodeSessionKind | null;
  readonly workflow: Workflow;
  readonly kind: FieldEventKindName;
  readonly siteId: string | null;
  readonly certNumber: string;
  readonly certKeyedByHand: boolean;
  readonly typedCapacityCy: number | null;
  readonly ticketNumber: string;
  readonly numberFrom: NumberFrom;
  readonly numberTypedReasonId: string | null;
  // A split load's property: its suffix (A, B…), empty when not split.
  readonly splitSuffix: string;
  readonly startedAt: string;
  readonly offset: number;
  // The project's day it was begun.
  readonly day: string;
  readonly start: Fix | null;
  // Where its monitor left it: the screen's own name for the step.
  readonly step: string;
  readonly waypoints: readonly Waypoint[];
  readonly photos: readonly TicketPhoto[];
  readonly endedAt: string | null;
  // When it was submitted or cancelled, and the project's day it was.
  readonly closedAt: string | null;
  readonly closedDay: string | null;
}

// What New hands over: who, on what, the badge, the number and where it came from.
export interface Begun {
  readonly monitorId: string;
  readonly projectId: string;
  readonly timeZone: string;
  readonly assignmentId: string;
  readonly setupVersion: number;
  readonly masterPasscodeSession: MasterPasscodeSessionKind | null;
  readonly workflow: Workflow;
  readonly kind: FieldEventKindName;
  readonly siteId: string | null;
  readonly certNumber: string;
  readonly certKeyedByHand: boolean;
  readonly typedCapacityCy: number | null;
  readonly ticketNumber: string;
  readonly numberFrom: NumberFrom;
  readonly numberTypedReasonId: string | null;
  readonly splitSuffix: string;
  readonly start: Fix | null;
  readonly step: string;
  // A split's next property starts with what the one before it picked (adms-field-app §4A.3).
  readonly carried?: Partial<TicketDetails>;
}

export interface TicketsOptions {
  // The most bytes one photograph's file may be (`MEDIA_FILE_BYTES_AT_MOST`): one larger would
  // never go, so it is never kept.
  readonly photoBytesAtMost: number;
  // The native shrink (ARCHITECTURE §11); the browser build keeps the original.
  readonly shrink?: PhotoShrink;
  readonly now?: () => Date;
}

// What a submit came to: the field event sealed in the outbox, or not kept, with the contract's
// words, the ticket still open.
export type Submitted =
  | { readonly kind: 'sealed'; readonly ticket: PhoneTicket }
  | { readonly kind: 'notKept'; readonly notice: NotSavedNotice };

// What New's number came to: taken, or already a ticket of this phone's (the duplicate check), or
// a control ticket outside the project's ranges: each said, never refused.
export type NumberSaid =
  | { readonly kind: 'fine' }
  | { readonly kind: 'onThisPhone'; readonly ticket: PhoneTicket }
  | { readonly kind: 'outsideStock' };

const ticketsShelf = 'tickets';
const seriesOfWorkflow: Readonly<Record<Workflow, NumberSeriesName>> = {
  LOAD: 'LOAD',
  HAUL_OUT: 'HAUL_OUT',
  UNIT_RATE: 'UNIT_RATE',
};

const isTicket = (value: unknown): value is PhoneTicket =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Uint8Array) &&
  typeof (value as { id?: unknown }).id === 'string' &&
  typeof (value as { state?: unknown }).state === 'string';

export class PhoneTickets {
  private readonly store: PhoneStore;
  private readonly lists: PhoneLists;
  private readonly outbox: PhoneOutbox;
  private readonly options: TicketsOptions;
  private readonly now: () => Date;
  private tickets: PhoneTicket[] = [];

  private constructor(
    store: PhoneStore,
    lists: PhoneLists,
    outbox: PhoneOutbox,
    options: TicketsOptions,
  ) {
    this.store = store;
    this.lists = lists;
    this.outbox = outbox;
    this.options = options;
    this.now = options.now ?? (() => new Date());
  }

  // The tickets as the store holds them; a ticket the phone stopped submitting finishes now.
  static async opened(
    store: PhoneStore,
    lists: PhoneLists,
    outbox: PhoneOutbox,
    options: TicketsOptions,
  ): Promise<PhoneTickets> {
    const tickets = new PhoneTickets(store, lists, outbox, options);
    await tickets.read();
    for (const ticket of [...tickets.tickets]) {
      const submitting =
        ticket.state === 'SUBMITTING' ||
        (ticket.state === 'OPEN' && (await store.read('records', ticket.id)) !== undefined);
      if (submitting) await tickets.sealed(ticket);
    }
    return tickets;
  }

  async read(): Promise<void> {
    const kept = await this.store.readAll(ticketsShelf);
    const tickets: PhoneTicket[] = [];
    for (const { value } of kept) if (isTicket(value)) tickets.push(value);
    this.tickets = tickets.sort((one, other) => one.startedAt.localeCompare(other.startedAt));
  }

  // A monitor's open tickets, the oldest first: home's open list.
  openOf(monitorId: string): readonly PhoneTicket[] {
    return this.tickets.filter(
      (ticket) => ticket.monitorId === monitorId && ticket.state === 'OPEN',
    );
  }

  // A monitor's submitted tickets on a project, the newest first: what home prints again
  // (task 3.6.2, ADR-595), while the phone holds them.
  submittedOf(monitorId: string, projectId: string): readonly PhoneTicket[] {
    return this.tickets
      .filter(
        (ticket) =>
          ticket.monitorId === monitorId &&
          ticket.projectId === projectId &&
          ticket.state === 'SUBMITTED',
      )
      .sort((one, other) => (other.closedAt ?? '').localeCompare(one.closedAt ?? ''));
  }

  // A monitor's field events on a project under a number, whatever became of them, the oldest
  // first: what a scan of a printed barcode finds (task 3.6.3, ADR-596). The barcode carries the
  // bare number, so a split's properties are all found.
  numbered(monitorId: string, projectId: string, number: string): readonly PhoneTicket[] {
    return this.tickets.filter(
      (ticket) =>
        ticket.monitorId === monitorId &&
        ticket.projectId === projectId &&
        ticket.ticketNumber === number,
    );
  }

  // A monitor's cancelled tickets, kept on the phone, never sent.
  cancelledOf(monitorId: string): readonly PhoneTicket[] {
    return this.tickets.filter(
      (ticket) => ticket.monitorId === monitorId && ticket.state === 'CANCELLED',
    );
  }

  // The one open ticket of a truck on this phone, for this monitor: a unit rate crew isn't held to
  // one (the user, ADR-571).
  openForTruck(monitorId: string, certNumber: string): PhoneTicket | undefined {
    return this.openOf(monitorId).find(
      (ticket) => ticket.kind !== 'UNIT_RATE' && ticket.certNumber === certNumber,
    );
  }

  ticket(id: string): PhoneTicket | undefined {
    return this.tickets.find((ticket) => ticket.id === id);
  }

  // The working crew (ADR-111; AC-04-70): the crew of the newest unit rate ticket this monitor
  // began on the project on this phone, whatever became of it; none before their first.
  workingCrew(monitorId: string, projectId: string): string | undefined {
    return this.tickets.findLast(
      (ticket) =>
        ticket.monitorId === monitorId &&
        ticket.projectId === projectId &&
        ticket.kind === 'UNIT_RATE',
    )?.certNumber;
  }

  // The next number the phone would make of a workflow's series, from its blocks; none where it
  // holds no block, or has used them up.
  async nextNumber(workflow: Workflow): Promise<string | null> {
    const series = seriesOfWorkflow[workflow];
    const held = await this.lists.held();
    if (held === undefined) return null;
    const next = new PhoneNumbers(
      held.lists.blocks.filter((block) => block.series === series),
    ).next();
    return next === null ? null : new NumberSeriesRules(series).written(next);
  }

  // Whether the phone holds less than two days' worth of a workflow's numbers (ADR-065).
  async low(workflow: Workflow): Promise<boolean> {
    const series = seriesOfWorkflow[workflow];
    const held = await this.lists.held();
    if (held === undefined) return false;
    const blocks = held.lists.blocks.filter((block) => block.series === series);
    if (blocks.length === 0) return false;
    const made = new Map<string, number>();
    for (const ticket of this.tickets) {
      if (ticket.numberFrom !== 'MADE' || seriesOfWorkflow[ticket.workflow] !== series) continue;
      made.set(ticket.day, (made.get(ticket.day) ?? 0) + 1);
    }
    return new PhoneNumbers(blocks).low(Math.max(0, ...made.values()));
  }

  // What the number taken at New is to this phone: one its tickets already hold for the same kind
  // of field event (the phone's own duplicate check, a cancelled one left out), or a control
  // ticket outside the project's ranges; else fine.
  said(
    begun: Pick<Begun, 'projectId' | 'workflow' | 'kind' | 'splitSuffix' | 'numberFrom'>,
    number: string,
    lists: PhoneListsRecord,
  ): NumberSaid {
    const held = this.tickets.find(
      (ticket) =>
        ticket.state !== 'CANCELLED' &&
        ticket.projectId === begun.projectId &&
        ticket.workflow === begun.workflow &&
        ticket.kind === begun.kind &&
        ticket.splitSuffix === begun.splitSuffix &&
        ticket.ticketNumber === number,
    );
    if (held !== undefined) return { kind: 'onThisPhone', ticket: held };
    const series = seriesOfWorkflow[begun.workflow];
    const stock = lists.numbering.ticketNumberSource === 'CONTROL' && begun.numberFrom !== 'MADE';
    if (stock && (series === 'LOAD' || series === 'HAUL_OUT')) {
      if (!new ControlTickets(lists.controlRanges).holds(series, number)) {
        return { kind: 'outsideStock' };
      }
    }
    return { kind: 'fine' };
  }

  // New: a ticket opened under its number, or the truck's open one where it has one. A number the
  // phone made is marked used in its block in the same piece of work.
  async open(begun: Begun): Promise<PhoneTicket> {
    const already = this.openForTruck(begun.monitorId, begun.certNumber);
    if (begun.kind !== 'UNIT_RATE' && already !== undefined) return already;
    const at = this.now();
    const ticket: PhoneTicket = {
      id: uuidv7(at),
      state: 'OPEN',
      monitorId: begun.monitorId,
      projectId: begun.projectId,
      timeZone: begun.timeZone,
      assignmentId: begun.assignmentId,
      setupVersion: begun.setupVersion,
      masterPasscodeSession: begun.masterPasscodeSession,
      workflow: begun.workflow,
      kind: begun.kind,
      siteId: begun.siteId,
      certNumber: begun.certNumber,
      certKeyedByHand: begun.certKeyedByHand,
      typedCapacityCy: begun.typedCapacityCy,
      ticketNumber: begun.ticketNumber,
      numberFrom: begun.numberFrom,
      numberTypedReasonId: begun.numberTypedReasonId,
      splitSuffix: begun.splitSuffix,
      startedAt: at.toISOString(),
      offset: offsetOf(at),
      day: new ProjectClock(begun.timeZone).day(at),
      start: begun.start,
      step: begun.step,
      formDebrisTypeId: begun.carried?.formDebrisTypeId ?? null,
      fieldTagId: begun.carried?.fieldTagId ?? null,
      roeNumber: null,
      estimateCy: null,
      end: null,
      address: null,
      addressSource: null,
      notes: null,
      loadCall: null,
      carriedCount: null,
      scaleReceipt: null,
      payableTypeId: null,
      kindOfWorkId: null,
      payItemId: null,
      unitCount: null,
      measurementInches: null,
      measuredAs: null,
      rootBallInches: null,
      rootBallHalfExposed: null,
      surveyNumber: null,
      markedIneligible: null,
      items: [],
      waypoints: [],
      photos: [],
      endedAt: null,
      closedAt: null,
      closedDay: null,
    };
    const changes: Change[] = [this.kept(ticket)];
    if (begun.numberFrom === 'MADE') {
      const used = await this.lists.gaveOut(
        seriesOfWorkflow[begun.workflow],
        Number(begun.ticketNumber),
      );
      if (used !== null) changes.push(used);
    }
    await this.store.change(changes);
    this.tickets.push(ticket);
    return ticket;
  }

  // What its monitor entered, or where they left it: kept at once. Never a sealed ticket's.
  async changed(id: string, change: Partial<TicketDetails> & { readonly step?: string }) {
    const ticket = this.openTicket(id);
    return this.put({ ...ticket, ...change });
  }

  // "Mark waypoint" (ADR-571, 581; AC-11-77): the phone's time when it was pressed and whatever
  // fix it had, in order, at most the policy's number; none past it.
  async markWaypoint(id: string, at: Date, fix: Fix | null, atMost: number): Promise<PhoneTicket> {
    const ticket = this.openTicket(id);
    if (ticket.waypoints.length >= atMost) return ticket;
    const waypoint = { markedAt: at.toISOString(), fix };
    return this.put({ ...ticket, waypoints: [...ticket.waypoints, waypoint] });
  }

  // A photograph taken while the ticket is open, at any step (ADR-571), at most the ticket's eight
  // (ADR-157), or taken again in the place of one (`instead`): fingerprinted now, shrunk, its
  // files kept beside the ticket, the one it takes the place of let go. **A stage of the work**
  // (ADR-590) has one photograph: taken for a stage, it takes the place of the one the stage had,
  // and taken again in the place of one, it keeps that one's stage. One too large to ever go is
  // not kept: whether it was.
  async photographed(
    id: string,
    original: Uint8Array,
    fix: Fix | null,
    instead?: string,
    stage?: PhotoStage,
  ): Promise<boolean> {
    const ticket = this.openTicket(id);
    const before = ticket.photos.find((photo) =>
      instead === undefined ? stage !== undefined && photo.stage === stage : photo.id === instead,
    );
    if (before === undefined && ticket.photos.length >= ticketPhotosAtMost) return false;
    const taken = await photoTaken(
      original,
      this.options.shrink ?? new KeptAsTaken(),
      this.options.photoBytesAtMost,
    );
    if (taken === undefined) return false;
    const at = this.now();
    const staged = stage ?? before?.stage;
    const photo: TicketPhoto = {
      ...photoOf(uuidv7(at), taken, at, offsetOf(at), fix),
      ...(staged === undefined ? {} : { stage: staged }),
    };
    const now = this.openTicket(id);
    const next: PhoneTicket = {
      ...now,
      photos:
        before === undefined
          ? [...now.photos, photo]
          : now.photos.map((one) => (one.id === before.id ? photo : one)),
    };
    await this.store.change([
      ...(before === undefined ? [] : filesDropped(ticketsShelf, before)),
      ...filesKept(ticketsShelf, photo.id, taken),
      this.kept(next),
    ]);
    this.replace(next);
    return true;
  }

  // A photograph taken off before submitting: never sent (ADR-571).
  async photoRemoved(id: string, photoId: string): Promise<PhoneTicket> {
    const ticket = this.openTicket(id);
    const next = { ...ticket, photos: ticket.photos.filter((photo) => photo.id !== photoId) };
    await this.store.change([
      ...ticket.photos
        .filter((photo) => photo.id === photoId)
        .flatMap((photo) => filesDropped(ticketsShelf, photo)),
      this.kept(next),
    ]);
    this.replace(next);
    return next;
  }

  // A photograph's file as it is kept, for the screen to draw.
  photoBytes(photoId: string): Promise<Uint8Array | undefined> {
    return photoBytesOf(this.store, ticketsShelf, photoId);
  }

  // Cancelled: kept on the phone with its number, never sent (ADR-056, 571).
  async cancel(id: string): Promise<PhoneTicket> {
    const ticket = this.openTicket(id);
    const at = this.now();
    return this.put({
      ...ticket,
      state: 'CANCELLED',
      closedAt: at.toISOString(),
      closedDay: new ProjectClock(ticket.timeZone).day(at),
    });
  }

  // Submitted: the field event made from the ticket and sealed in the outbox, then its
  // photographs, each with its file. Where the contract doesn't take the field event, nothing is
  // sealed and the ticket stays open, the contract's words said.
  async submit(id: string, end: Fix | null): Promise<Submitted> {
    const ticket = this.openTicket(id);
    const at = this.now();
    const submitting: PhoneTicket = {
      ...ticket,
      end: ticket.end ?? end,
      state: 'SUBMITTING',
      endedAt: at.toISOString(),
      closedAt: at.toISOString(),
      closedDay: new ProjectClock(ticket.timeZone).day(at),
    };
    const notice = await this.outbox.keepTogether(PhoneTickets.records(submitting));
    if (notice !== undefined) return { kind: 'notKept', notice };
    await this.put(submitting);
    return { kind: 'sealed', ticket: await this.sealed(submitting) };
  }

  // The scale receipts this monitor copied at a site on the project's day, each with the ticket
  // it was kept with, newest first: what a tandem's second disposal may point at (ADR-175).
  receiptsAt(monitorId: string, siteId: string, day: string): readonly PhoneTicket[] {
    return this.tickets
      .filter(
        (ticket) =>
          ticket.monitorId === monitorId &&
          ticket.siteId === siteId &&
          ticket.state === 'SUBMITTED' &&
          ticket.closedDay === day &&
          ticket.scaleReceipt !== null &&
          !ticket.scaleReceipt.shared,
      )
      .reverse();
  }

  // A split haul-out's pile before this one, on this phone: the one its chain submitted under
  // the same number with the suffix before (ADR-295), whose load call so far the next is shown.
  pileBefore(ticket: PhoneTicket): PhoneTicket | undefined {
    const last = ticket.splitSuffix.at(-1);
    if (last === undefined || last === 'A') return undefined;
    const suffix = `${ticket.splitSuffix.slice(0, -1)}${String.fromCharCode(last.charCodeAt(0) - 1)}`;
    return this.tickets.find(
      (one) =>
        one.monitorId === ticket.monitorId &&
        one.projectId === ticket.projectId &&
        one.kind === ticket.kind &&
        one.ticketNumber === ticket.ticketNumber &&
        one.splitSuffix === suffix &&
        one.state === 'SUBMITTED',
    );
  }

  // Today's own count (AC-11-80): what this monitor submitted on this phone on the project's day.
  todayOf(monitorId: string, projectId: string, timeZone: string): number {
    const today = new ProjectClock(timeZone).day(this.now());
    return this.tickets.filter(
      (ticket) =>
        ticket.monitorId === monitorId &&
        ticket.projectId === projectId &&
        ticket.state === 'SUBMITTED' &&
        ticket.closedDay === today,
    ).length;
  }

  // The field event a ticket is, as the sync contract carries it (ADR-236): what its kind
  // records, nothing it doesn't, no conclusion of the server's.
  static record(ticket: PhoneTicket): SyncedRecord {
    const measured = ticket.measurementInches !== null && ticket.measuredAs !== null;
    return {
      record: 'FIELD_EVENT',
      fieldEvent: {
        id: ticket.id,
        projectId: ticket.projectId,
        workflow: ticket.workflow,
        kind: ticket.kind,
        ticketNumber: ticket.ticketNumber,
        splitSuffix: ticket.splitSuffix,
        monitorId: ticket.monitorId,
        assignmentId: ticket.assignmentId,
        setupVersion: ticket.setupVersion,
        masterPasscodeSession: ticket.masterPasscodeSession,
        numberTyped: ticket.numberFrom === 'TYPED',
        numberTypedReasonId: ticket.numberTypedReasonId,
        certNumber: ticket.certNumber,
        certKeyedByHand: ticket.certKeyedByHand,
        typedCapacityCy: ticket.typedCapacityCy,
        siteId: ticket.siteId,
        startedAt: ticket.startedAt,
        endedAt: ticket.endedAt ?? ticket.startedAt,
        deviceUtcOffsetMinutes: ticket.offset,
        startLatitude: ticket.start?.latitude ?? null,
        startLongitude: ticket.start?.longitude ?? null,
        endLatitude: ticket.end?.latitude ?? null,
        endLongitude: ticket.end?.longitude ?? null,
        address: ticket.address,
        addressSource: ticket.addressSource,
        notes: ticket.notes,
        formDebrisTypeId: ticket.formDebrisTypeId,
        fieldTagId: ticket.fieldTagId,
        roeNumber: ticket.roeNumber,
        estimateCy: ticket.estimateCy,
        loadCall: ticket.loadCall,
        scaleReceiptId: ticket.scaleReceipt?.id ?? null,
        carriedCount: ticket.carriedCount,
        kindOfWorkId: ticket.kindOfWorkId,
        payableTypeId: ticket.payableTypeId,
        payItemId: ticket.payItemId,
        unitCount: ticket.unitCount,
        // A measurement goes with how it was read, or not at all: a way picked and no inches
        // typed yet is no measurement.
        measurementInches: measured ? ticket.measurementInches : null,
        measuredAs: measured ? ticket.measuredAs : null,
        rootBallInches: ticket.rootBallInches,
        rootBallHalfExposed: ticket.rootBallHalfExposed,
        surveyNumber: ticket.surveyNumber,
        markedIneligible: ticket.markedIneligible,
        items: ticket.items.map(({ itemNameId, quantity }) => ({ itemNameId, quantity })),
        carriedTickets: [],
        waypoints: ticket.waypoints.map(({ markedAt, fix }) => ({
          markedAt,
          latitude: fix?.latitude ?? null,
          longitude: fix?.longitude ?? null,
        })),
      },
    };
  }

  // What a ticket's submit keeps in the outbox, in order: the scale receipt it copied, where it
  // copied one rather than pointing at an earlier ticket's, then its field event.
  static records(ticket: PhoneTicket): SyncedRecord[] {
    const receipt = ticket.scaleReceipt;
    const event = PhoneTickets.record(ticket);
    if (receipt === null || receipt.shared || ticket.siteId === null) return [event];
    return [
      {
        record: 'SCALE_RECEIPT',
        scaleReceipt: {
          id: receipt.id,
          projectId: ticket.projectId,
          receiptNumber: receipt.receiptNumber,
          siteId: ticket.siteId,
          grossWeightLb: receipt.grossWeightLb,
          tareWeightLb: receipt.tareWeightLb,
          netWeightLb: receipt.netWeightLb,
          netWeightTons: receipt.netWeightTons,
          enteredById: ticket.monitorId,
          enteredAt: receipt.enteredAt,
          deviceUtcOffsetMinutes: receipt.offset,
        },
      },
      event,
    ];
  }

  // The photographs of a ticket submitting go to the outbox, each once with its file, its bytes
  // then dropped from beside the ticket; then the ticket is submitted. A ticket opened again half
  // way through finishes here: its field event already sealed is left as it is.
  private async sealed(ticket: PhoneTicket): Promise<PhoneTicket> {
    if ((await this.store.read('records', ticket.id)) === undefined) {
      await this.outbox.keepTogether(PhoneTickets.records(ticket));
    }
    let now = ticket;
    for (const photo of ticket.photos.filter(({ kept }) => !kept)) {
      const files = await filesOf(this.store, ticketsShelf, photo);
      if (files !== undefined) {
        const record: SyncedPhoto = {
          id: photo.id,
          projectId: ticket.projectId,
          owner: { kind: 'FIELD_EVENT', id: ticket.id },
          view: null,
          stage: photo.stage ?? null,
          takenById: ticket.monitorId,
          capturedAt: photo.capturedAt,
          deviceUtcOffsetMinutes: photo.offset,
          latitude: photo.fix?.latitude ?? null,
          longitude: photo.fix?.longitude ?? null,
          ...fingerprintsOf(photo),
        };
        await this.outbox.keepPhoto(record, files);
      }
      now = {
        ...now,
        photos: now.photos.map((one) => (one.id === photo.id ? { ...one, kept: true } : one)),
      };
      await this.store.change([...filesDropped(ticketsShelf, photo), this.kept(now)]);
      this.replace(now);
    }
    return this.put({ ...now, state: 'SUBMITTED' });
  }

  private openTicket(id: string): PhoneTicket {
    const ticket = this.ticket(id);
    if (ticket?.state !== 'OPEN') throw new Error('Only an open ticket changes on the phone.');
    return ticket;
  }

  private kept(ticket: PhoneTicket): Change {
    return { shelf: ticketsShelf, id: ticket.id, value: ticket as unknown as Json };
  }

  private async put(ticket: PhoneTicket): Promise<PhoneTicket> {
    await this.store.change([this.kept(ticket)]);
    this.replace(ticket);
    return ticket;
  }

  private replace(ticket: PhoneTicket): void {
    const at = this.tickets.findIndex(({ id }) => id === ticket.id);
    if (at === -1) this.tickets.push(ticket);
    else this.tickets[at] = ticket;
  }
}
