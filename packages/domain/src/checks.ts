// The checks between a ticket's field events, on the certification, and on its times
// (spec/parts/06-reconciliation.md step 3; spec/acceptance/06-reconciliation.md sections D, E and
// the time rows of F; spec/FLAGS.md §3.1, §3.2, §3.3; adms-validation §5.1, §5.2, §5.4a;
// adms-certifications §3A.5, §3A.6; adms-exceptions §4.3; ADR-019, 027, 033, 048, 053, 079, 082,
// 100, 111, 134, 153, 154, 156, 161, 173, 179, 192, 243, 244, 290, 342, 344).
//
// A check compares a ticket's field events with each other, or with the setup; it changes
// nothing, refuses nothing and guesses nothing (ADR-052). Each returns the flags its facts raise
// now; raising one again on unchanged facts, and clearing one, is `Flags.compared`.
//
// Never flagged, so never checked here: how long a field event has waited, a preload, a driver's
// licence, a trailer swap, a certification still at QC Review, work under an unplanned
// assignment (spec/FLAGS.md §2). The checks on place are place.ts; on quantity,
// quantity-checks.ts; on the pay item's settings and unit rate work, unit-rate-checks.ts; on
// ROEs and surveys, roe-checks.ts. §3.10's flags, for a record that should not have been
// possible, are here too (ADR-329, 345).
import {
  Flags,
  certificationViews,
  type CertificationView,
  type Fact,
  type FlagRaised,
  type FlagSubject,
} from './flags.ts';
import { SubNames } from './certifications.ts';
import { timesOverlap } from './neighbours.ts';
import type { GroupedFieldEvent, Ticket } from './tickets.ts';

// A picked value: its record and the name a message says.
export interface Named {
  readonly id: string;
  readonly name: string;
}

// What the checks read of a field event, beside what grouping reads.
export interface CheckedFieldEvent extends GroupedFieldEvent {
  // The cert number as scanned or keyed in: a snapshot (ADR-017).
  readonly certNumber: string;
  readonly certKeyedByHand: boolean;
  readonly typedCapacityCy: number | null;
  // A load's or a haul-out's debris type: the entry picked on the project's form.
  readonly debrisType: Named | null;
  readonly numberTyped: boolean;
  readonly numberTypedReason: Named | null;
  readonly source: 'DEVICE' | 'BACK_OFFICE';
  // Who created it in the back office, and why.
  readonly createdBy: Named | null;
  readonly createdReason: Named | null;
  // When the server received it, and the device's own offset at capture (ADR-100).
  readonly receivedAt: Date;
  readonly deviceUtcOffsetMinutes: number;
  // Its phone; none on a record created in the back office.
  readonly device: { readonly enrolledAt: Date; readonly outOfServiceAt: Date | null } | null;
  // How far the phone's clock stood from the server's at the sync that brought it, in whole
  // minutes, above nought when the phone's was ahead; none where no sync brought it (a record
  // created in the back office).
  readonly clockOffAtSyncMinutes: number | null;
  // The tower's count on a load that carries tickets.
  readonly carriedCount: number | null;
  // A disposal's and a haul-out collection's load call, and the scale receipt a disposal points
  // at: with the count above, the quantities a tower may have taken.
  readonly loadCall: number | null;
  readonly scaleReceiptId: string | null;
  // A unit rate event's kind of work.
  readonly kindOfWorkId: string | null;
  // A GPS fix intake couldn't read, kept as the phone sent it (ADR-338); none when every fix
  // was readable.
  readonly unreadableGps: Fact | null;
  // The project of the assignment it was recorded under; none on a back-office record.
  readonly assignmentProjectId: string | null;
}

// What the checks read of a certification of the project.
export interface CheckedCertification {
  readonly certNumber: string;
  readonly kind: 'CONTAINER' | 'CREW';
  // A container's, in whole CY; a crew has none.
  readonly capacityCy: number | null;
  // Calendar days, 2026-09-30.
  readonly tagExpiry: string | null;
  readonly revokedFrom: string | null;
  // The certification that names this one as the one it replaces.
  readonly replacedBy: { readonly certNumber: string; readonly certifiedAt: Date } | null;
}

export interface CheckSetup {
  // The project's time zone and active window (calendar days; the end may be open).
  readonly timeZone: string;
  readonly activeFrom: string;
  readonly activeTo: string | null;
  // The project's certifications: a cert number finds one of them, exactly, or none.
  readonly certifications: readonly CheckedCertification[];
  // A phone's clock further than this from the server's at a sync flags that sync's records;
  // none switches the check off. A threshold is policy, never a number here (invariant 16).
  readonly deviceClockOffLimitMinutes: number | null;
  // The project's Allow split loads.
  readonly allowSplitLoads: boolean;
  // The control ticket ranges entered and not taken off, on a project numbered from control
  // tickets; none on a project that generates its numbers.
  readonly controlRanges: readonly ControlRangeRead[] | null;
}

export interface ControlRangeRead {
  readonly series: 'LOAD' | 'HAUL_OUT';
  readonly firstNumber: number;
  readonly lastNumber: number;
}

// What a ticket's checks read beyond the ticket itself.
export interface CheckedAround<E extends CheckedFieldEvent> {
  // The collections of the project's other loads that aren't void: the ones a truck's loading
  // times are read against.
  readonly otherLoads: readonly E[];
  // On a load that carries tickets: how many its collection lists, and what the tower counted,
  // in the plural ("stumps").
  readonly carried: { readonly listed: number; readonly counted: string } | null;
}

// The work time of a field event, for every check judged "at the work time": its end, when the
// loading, the dumping or the work was done (ADR-048, 161; agent default, ADR-344).
export const workTimeOf = (event: GroupedFieldEvent): Date => event.endedAt;

const iso = (instant: Date): string => instant.toISOString();

export class TicketChecks<E extends CheckedFieldEvent = CheckedFieldEvent> {
  private readonly setup: CheckSetup;
  private readonly flags: Flags;
  private readonly certifications: ReadonlyMap<string, CheckedCertification>;

  constructor(setup: CheckSetup) {
    this.setup = setup;
    this.flags = new Flags(setup.timeZone);
    this.certifications = new Map(
      setup.certifications.map((certification) => [certification.certNumber, certification]),
    );
  }

  // Every flag of §3.1, §3.2 and §3.3's time rows the ticket's facts raise now. A ticket still
  // missing a field event gets the checks that need only the field event it has (ADR-244).
  of(ticket: Ticket<E>, around: CheckedAround<E>): readonly FlagRaised[] {
    return [
      ...this.betweenEvents(ticket, around),
      ...ticket.events.flatMap((event) => [
        ...this.certification(ticket, event),
        ...this.time(ticket, event),
        ...this.shouldNotBePossible(ticket, event),
      ]),
      ...this.backupCatches(ticket),
    ];
  }

  // A field event whose ticket number isn't digits is in no ticket and pairs with nothing until
  // a person renumbers it (ADR-329 (6); `Tickets.notTicketNumbers`). It bills nothing.
  notATicketNumber(event: E): FlagRaised {
    return this.flags.raise(
      'NOT_A_TICKET_NUMBER',
      { ticketNumber: event.ticketNumber },
      {},
      { ticketNumber: event.ticketNumber },
      event.id,
    );
  }

  // §3.10's first rows: what the phone stops, kept and flagged when it reaches the server
  // anyway (ADR-329, 345).
  private shouldNotBePossible(ticket: Ticket<E>, event: E): FlagRaised[] {
    const subject: FlagSubject = { ticketNumber: ticket.ticketNumber };
    const raised: FlagRaised[] = [];
    const missing = (detail: string, words: string): void => {
      raised.push(
        this.flags.raise(
          'DETAIL_MISSING',
          subject,
          { event: event.kind, missing: words },
          { missing: detail },
          event.id,
        ),
      );
    };
    if (event.kind !== 'UNIT_RATE' && event.debrisType === null) {
      missing('DEBRIS_TYPE', 'debris type');
    }
    // A tower takes one quantity: a load call, a scale weight or a count (ADR-223). None at all
    // is the gap; which one the load should have had is the pay item's to say (1.6.3).
    if (
      event.kind === 'DISPOSAL' &&
      event.loadCall === null &&
      event.scaleReceiptId === null &&
      event.carriedCount === null
    ) {
      missing('QUANTITY', 'load call, scale receipt or count');
    }
    if (event.kind === 'HAUL_OUT_COLLECTION' && event.loadCall === null) {
      missing('LOAD_CALL', 'load call');
    }
    if (event.kind === 'UNIT_RATE' && event.kindOfWorkId === null) {
      missing('KIND_OF_WORK', 'kind of work');
    }

    if (event.numberTyped && event.numberTypedReason === null) {
      raised.push(this.flags.raise('TYPED_NUMBER_NO_REASON', subject, {}, {}, event.id));
    }

    const certification = this.certifications.get(event.certNumber);
    if (certification !== undefined) {
      const unitRate = event.kind === 'UNIT_RATE';
      if (unitRate ? certification.kind === 'CONTAINER' : certification.kind === 'CREW') {
        raised.push(
          this.flags.raise(
            'WRONG_KIND_OF_BADGE',
            subject,
            {
              work: unitRate
                ? 'unit rate work'
                : ticket.workflow === 'HAUL_OUT'
                  ? 'a haul-out'
                  : 'a load',
              certifies: unitRate ? 'container' : 'crew',
              certNumber: certification.certNumber,
            },
            { certNumber: certification.certNumber, kind: certification.kind },
            event.id,
          ),
        );
      }
    }

    if (event.unreadableGps !== null) {
      raised.push(
        this.flags.raise('GPS_UNREADABLE', subject, {}, { sent: event.unreadableGps }, event.id),
      );
    }
    if (event.endedAt.getTime() < event.startedAt.getTime()) {
      raised.push(
        this.flags.raise(
          'ENDED_BEFORE_STARTED',
          subject,
          { event: event.kind, endedAt: event.endedAt, startedAt: event.startedAt },
          { endedAt: iso(event.endedAt), startedAt: iso(event.startedAt) },
          event.id,
        ),
      );
    }
    if (event.assignmentProjectId !== null && event.assignmentProjectId !== event.projectId) {
      raised.push(
        this.flags.raise(
          'ASSIGNMENT_ON_ANOTHER_PROJECT',
          subject,
          {},
          { projectId: event.projectId, assignmentProjectId: event.assignmentProjectId },
          event.id,
        ),
      );
    }
    return raised;
  }

  // §3.10's backup catches on the ticket itself: what setup and the phone should make
  // impossible, flagged if it happens all the same (the user, ADR-345).
  private backupCatches(ticket: Ticket<E>): FlagRaised[] {
    const subject: FlagSubject = { ticketNumber: ticket.ticketNumber };
    const raised: FlagRaised[] = [];
    const shape = ticket.splitShape;
    if (shape !== null && !this.setup.allowSplitLoads) {
      raised.push(
        this.flags.raise(
          'SPLIT_NOT_ALLOWED',
          subject,
          { split: ticket.workflow === 'HAUL_OUT' ? 'haul-out' : 'load' },
          { suffixes: shape.suffixes },
        ),
      );
    }
    // Only where ranges were entered for the ticket's series: with none there is nothing to be
    // outside of, and a unit rate number is generated on every project (ADR-056).
    const ranges = (this.setup.controlRanges ?? []).filter(
      (range) => range.series === ticket.workflow,
    );
    const number = Number(ticket.ticketNumber);
    if (
      ranges.length > 0 &&
      !ranges.some((range) => number >= range.firstNumber && number <= range.lastNumber)
    ) {
      raised.push(
        this.flags.raise(
          'OUTSIDE_CONTROL_RANGES',
          subject,
          {},
          {
            ticketNumber: ticket.ticketNumber,
            ranges: ranges.map((range) => [range.firstNumber, range.lastNumber]),
          },
        ),
      );
    }
    return raised;
  }

  // §3.1: what two monitors who couldn't see each other disagree on.
  private betweenEvents(ticket: Ticket<E>, around: CheckedAround<E>): FlagRaised[] {
    const subject: FlagSubject = { ticketNumber: ticket.ticketNumber };
    const raised: FlagRaised[] = [];
    const disposal = ticket.disposal;

    for (const collection of ticket.collections) {
      if (disposal === null) continue;
      // Only the exact entry matches, never a like name (ADR-207).
      if (
        collection.debrisType !== null &&
        disposal.debrisType !== null &&
        collection.debrisType.id !== disposal.debrisType.id
      ) {
        raised.push(
          this.flags.raise(
            'DEBRIS_TYPE_MISMATCH',
            subject,
            { collection: collection.debrisType.name, disposal: disposal.debrisType.name },
            { collection: collection.debrisType.id, disposal: disposal.debrisType.id },
            collection.id,
          ),
        );
      }
      // Compared exactly, never nearly (ADR-019).
      if (collection.certNumber !== disposal.certNumber) {
        const numbers = { collection: collection.certNumber, disposal: disposal.certNumber };
        raised.push(
          this.flags.raise('CERT_NUMBER_MISMATCH', subject, numbers, numbers, collection.id),
        );
      }
      if (disposal.startedAt.getTime() < collection.endedAt.getTime()) {
        raised.push(
          this.flags.raise(
            'DISPOSAL_BEFORE_COLLECTION_ENDED',
            subject,
            { disposalStartedAt: disposal.startedAt, collectionEndedAt: collection.endedAt },
            {
              disposalStartedAt: iso(disposal.startedAt),
              collectionEndedAt: iso(collection.endedAt),
            },
            collection.id,
          ),
        );
      }
    }

    raised.push(...this.overlappingLoads(ticket, around.otherLoads));

    // A split's lettering is read once the ticket is whole: until then a property's collection
    // may only be still to sync (agent default, ADR-344).
    const shape = ticket.splitShape;
    if (
      ticket.isWhole &&
      shape !== null &&
      (shape.missing.length > 0 || shape.bareBesideSuffixed)
    ) {
      raised.push(
        this.flags.raise('SPLIT_SUFFIX_GAP', subject, shape, {
          suffixes: shape.suffixes,
          bareBesideSuffixed: shape.bareBesideSuffixed,
        }),
      );
    }

    const towerCount = disposal?.carriedCount ?? null;
    if (towerCount !== null && around.carried !== null && towerCount !== around.carried.listed) {
      raised.push(
        this.flags.raise(
          'CARRIED_COUNT_MISMATCH',
          subject,
          {
            towerCount,
            listed: around.carried.listed,
            counted: around.carried.counted,
          },
          { towerCount, listed: around.carried.listed },
        ),
      );
    }
    return raised;
  }

  // Two collections on one certification whose loading times overlap: a truck has one open load
  // at a time (ADR-027). Raised on this ticket for each other load it overlaps; the other's own
  // run raises it there (both are flagged, ADR-342). Loading times that overlap leave no room
  // for a disposal between them, so no disposal is read, and none need have synced.
  private overlappingLoads(ticket: Ticket<E>, otherLoads: readonly E[]): FlagRaised[] {
    if (ticket.workflow !== 'LOAD') return [];
    const raised: FlagRaised[] = [];
    for (const collection of ticket.collections) {
      for (const other of otherLoads) {
        if (
          other.kind !== 'COLLECTION' ||
          other.projectId !== ticket.projectId ||
          other.ticketNumber === ticket.ticketNumber ||
          other.certNumber !== collection.certNumber ||
          !timesOverlap(collection, other)
        ) {
          continue;
        }
        raised.push(
          this.flags.raise(
            'OVERLAPPING_LOADS',
            { ticketNumber: ticket.ticketNumber },
            {
              loadingStartedAt: collection.startedAt,
              loadingEndedAt: collection.endedAt,
              otherTicketNumber: other.ticketNumber,
              certNumber: collection.certNumber,
            },
            {
              certNumber: collection.certNumber,
              loading: [iso(collection.startedAt), iso(collection.endedAt)],
              otherTicketNumber: other.ticketNumber,
              otherLoading: [iso(other.startedAt), iso(other.endedAt)],
            },
            collection.id,
          ),
        );
      }
    }
    return raised;
  }

  // The field events that took the ticket's quantity: a load's disposal, a haul-out's
  // collections, a unit rate ticket's one field event. Their certification is the one the ticket
  // bills from (spec/FLAGS.md §5 (1)).
  private static tookTheQuantity<E extends CheckedFieldEvent>(ticket: Ticket<E>): readonly E[] {
    if (ticket.workflow === 'HAUL_OUT') return ticket.collections;
    const event = ticket.workflow === 'LOAD' ? ticket.disposal : ticket.unitRate;
    return event === null ? [] : [event];
  }

  // §3.2: one field event's certification, judged at its work time, never "now" (ADR-048).
  private certification(ticket: Ticket<E>, event: E): FlagRaised[] {
    const subject: FlagSubject = { ticketNumber: ticket.ticketNumber };
    const certification = this.certifications.get(event.certNumber);
    if (certification === undefined) {
      // Where the ticket's two ends scanned different numbers and the end that took the
      // quantity found its certification, the ticket bills from that one and the difference is
      // already flagged: "not billed" would be untrue (agent default, ADR-344).
      const billsFromTheOtherEnd = TicketChecks.tookTheQuantity(ticket).some(
        (taker) =>
          taker.id !== event.id &&
          taker.certNumber !== event.certNumber &&
          this.certifications.has(taker.certNumber),
      );
      const itTookTheQuantity = TicketChecks.tookTheQuantity(ticket).some(
        (taker) => taker.id === event.id,
      );
      if (billsFromTheOtherEnd && !itTookTheQuantity) return [];
      const number = { certNumber: event.certNumber };
      return [this.flags.raise('NO_CERTIFICATION', subject, number, number, event.id)];
    }

    const raised: FlagRaised[] = [];
    const workTime = workTimeOf(event);
    const workDay = this.flags.clock.day(workTime);
    const certNumber = certification.certNumber;

    if (
      event.certKeyedByHand &&
      event.typedCapacityCy !== null &&
      certification.capacityCy !== null &&
      event.typedCapacityCy !== certification.capacityCy
    ) {
      const capacities = { typedCy: event.typedCapacityCy, certifiedCy: certification.capacityCy };
      raised.push(
        this.flags.raise('TYPED_CAPACITY_DIFFERS', subject, capacities, capacities, event.id),
      );
    }
    // A tag is good through its expiry date and expired from the day after (agent default,
    // ADR-344).
    if (certification.tagExpiry !== null && workDay > certification.tagExpiry) {
      raised.push(
        this.flags.raise(
          'TAG_EXPIRED',
          subject,
          { certNumber, tagExpiry: certification.tagExpiry },
          { certNumber, tagExpiry: certification.tagExpiry, workTime: iso(workTime) },
          event.id,
        ),
      );
    }
    if (certification.revokedFrom !== null && workDay >= certification.revokedFrom) {
      raised.push(
        this.flags.raise(
          'CERTIFICATION_REVOKED',
          subject,
          { certNumber, revokedFrom: certification.revokedFrom },
          { certNumber, revokedFrom: certification.revokedFrom, workTime: iso(workTime) },
          event.id,
        ),
      );
    }
    // Replaced at the new certification's certified time: work after that instant is flagged,
    // work earlier the same day is not (agent default, ADR-344).
    const replacedBy = certification.replacedBy;
    if (replacedBy !== null && workTime.getTime() > replacedBy.certifiedAt.getTime()) {
      const replaced = {
        certNumber,
        replacedBy: replacedBy.certNumber,
        replacedOn: this.flags.clock.day(replacedBy.certifiedAt),
      };
      raised.push(
        this.flags.raise(
          'CERTIFICATION_REPLACED',
          subject,
          replaced,
          { ...replaced, replacedAt: iso(replacedBy.certifiedAt) },
          event.id,
        ),
      );
    }
    return raised;
  }

  // §3.3's time rows: times that can't be true, and where the record came from. Nothing here
  // measures how long a field event has waited (ADR-053).
  private time(ticket: Ticket<E>, event: E): FlagRaised[] {
    const subject: FlagSubject = { ticketNumber: ticket.ticketNumber };
    const raised: FlagRaised[] = [];
    const workTime = workTimeOf(event);

    // The load's time is its collection's end, each property's or pile's own; a unit rate
    // ticket's is its one field event's end. A disposal is never judged against the window: a
    // preload dumped the day after the window closed was collected inside it (ADR-161).
    const closesTheTicket = event.kind === 'DISPOSAL' || event.kind === 'HAUL_OUT_DISPOSAL';
    if (!closesTheTicket) {
      const day = this.flags.clock.day(workTime);
      const { activeFrom, activeTo } = this.setup;
      if (day < activeFrom || (activeTo !== null && day > activeTo)) {
        raised.push(
          this.flags.raise(
            'PROJECT_NOT_ACTIVE',
            subject,
            { day },
            { day, activeFrom, activeTo },
            event.id,
          ),
        );
      }
    }

    const limit = this.setup.deviceClockOffLimitMinutes;
    const clockOff = event.clockOffAtSyncMinutes;
    if (limit !== null && clockOff !== null && Math.abs(clockOff) > limit) {
      const difference = { differenceMinutes: Math.abs(clockOff) };
      raised.push(this.flags.raise('DEVICE_CLOCK_OFF', subject, difference, difference, event.id));
    }
    if (workTime.getTime() > event.receivedAt.getTime()) {
      raised.push(
        this.flags.raise(
          'WORK_TIME_AFTER_RECEIVED',
          subject,
          { workTime, receivedAt: event.receivedAt },
          { workTime: iso(workTime), receivedAt: iso(event.receivedAt) },
          event.id,
        ),
      );
    }
    if (event.device !== null) {
      const { enrolledAt, outOfServiceAt } = event.device;
      if (workTime.getTime() < enrolledAt.getTime()) {
        raised.push(
          this.flags.raise(
            'WORK_TIME_BEFORE_ENROLMENT',
            subject,
            { workTime },
            { workTime: iso(workTime), enrolledAt: iso(enrolledAt) },
            event.id,
          ),
        );
      }
      // Judged by the work time against the removal time, never by when it arrived (ADR-134).
      if (outOfServiceAt !== null && workTime.getTime() > outOfServiceAt.getTime()) {
        raised.push(
          this.flags.raise(
            'PHONE_OUT_OF_SERVICE',
            subject,
            {},
            { workTime: iso(workTime), outOfServiceAt: iso(outOfServiceAt) },
            event.id,
          ),
        );
      }
    }
    // A record created in the back office has no phone, so no phone's time zone.
    if (event.source === 'DEVICE') {
      const projectOffsetMinutes = this.flags.clock.offsetMinutes(workTime);
      if (event.deviceUtcOffsetMinutes !== projectOffsetMinutes) {
        const offsets = {
          deviceOffsetMinutes: event.deviceUtcOffsetMinutes,
          projectOffsetMinutes,
        };
        raised.push(
          this.flags.raise('DEVICE_TIME_ZONE_DIFFERS', subject, offsets, offsets, event.id),
        );
      }
    }
    // A number typed with no reason picked is TYPED_NUMBER_NO_REASON's.
    if (event.numberTyped && event.numberTypedReason !== null) {
      raised.push(
        this.flags.raise(
          'TYPED_TICKET_NUMBER',
          subject,
          { reason: event.numberTypedReason.name },
          { reason: event.numberTypedReason.id },
          event.id,
        ),
      );
    }
    if (
      event.source === 'BACK_OFFICE' &&
      event.createdBy !== null &&
      event.createdReason !== null
    ) {
      raised.push(
        this.flags.raise(
          'BACK_OFFICE_RECORD',
          subject,
          { person: event.createdBy.name, reason: event.createdReason.name },
          { person: event.createdBy.id, reason: event.createdReason.id },
          event.id,
        ),
      );
    }
    return raised;
  }
}

// A certification's photograph, as far as its views are read.
export interface CertificationPhotograph {
  readonly view: CertificationView | null;
  // Removed from the record by the back office (ADR-337): the row stays, and it no longer
  // counts as a view (agent default, ADR-344).
  readonly archivedAt: Date | null;
}

// The certification's own flags (spec/FLAGS.md §3.7): they sit on the certification, which
// stays usable, and touch no ticket's status (ADR-179).
export class CertificationChecks {
  private readonly flags: Flags;

  constructor(timeZone: string) {
    this.flags = new Flags(timeZone);
  }

  // One flag for each of the five views it has no photograph of.
  views(
    certNumber: string,
    photographs: readonly CertificationPhotograph[],
  ): readonly FlagRaised[] {
    const present = new Set(
      photographs.filter((photo) => photo.archivedAt === null).map((photo) => photo.view),
    );
    return certificationViews
      .filter((view) => !present.has(view))
      .map((view) =>
        this.flags.raise(
          'CERTIFICATION_PHOTO_MISSING',
          { certNumber },
          { view },
          { missing: view, present: certificationViews.filter((seen) => present.has(seen)) },
        ),
      );
  }

  // One flag for each sub it names whose name is alike another sub's on the project (ADR-529
  // (f)): the same company spelled two ways, perhaps. Never which spelling is right.
  subs(
    certNumber: string,
    named: readonly (string | null)[],
    projectSubs: readonly string[],
  ): readonly FlagRaised[] {
    return named.flatMap((sub) => {
      if (sub === null) return [];
      return projectSubs
        .filter((other) => SubNames.alike(sub, other))
        .sort()
        .map((alike) =>
          this.flags.raise(
            'SUB_NAME_ALIKE',
            { certNumber },
            { sub, alike },
            { sub, alike, key: SubNames.key(sub) },
          ),
        );
    });
  }
}
