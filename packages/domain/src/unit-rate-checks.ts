// The checks on unit rate work: the pay item worked out again from the bands, the pay item's
// settings, the stump checks and a crew's hours (spec/parts/06-reconciliation.md steps 3 and 5;
// spec/acceptance/06-reconciliation.md section I, AC-06-83, 135; spec/FLAGS.md §3.6;
// adms-validation §5.2 "The pay item's settings, and unit rate work", §5.3a;
// adms-ticket-workflows §4.5; ADR-068, 157, 158, 159, 177, 187, 189, 194, 198, 203, 207, 210,
// 213, 217, 345, 347).
//
// The worker works a unit rate ticket's pay item out again, with the one rule the phone used
// (`SizeBands.payItemFor`, invariant 11): the phone's answer is what printed, this one is what
// bills, and a corrected measurement moves the ticket to another pay item (ADR-217). Every
// setting the firm can tick on that pay item is then checked; none is stored and ignored
// (adms-validation §5.3a; KD-28).
//
// A check changes nothing, refuses nothing and guesses nothing (ADR-052). The stump checks hang
// on the kind of work's built-in key, never its name, so a renamed "Stumps" changes nothing
// (ADR-194). Never flagged, so never read here: a monitor's own hours (ADR-100, 241).
// `FILL_WITHOUT_EXPOSED_ROOT_BALL` needs the ticket's lines: task 1.6.3's.
import type { BuiltInKey } from './built-in-keys.ts';
import { workTimeOf, type Named } from './checks.ts';
import { Flags, type FlagRaised, type FlagSubject } from './flags.ts';
import type { GpsPoint } from './geodesic.ts';
import { enDash } from './project-clock.ts';
import type { Amount } from './quantities.ts';
import { SizeBands, type BandedPayItem, type TreeMeasurement } from './size-bands.ts';
import type { GroupedFieldEvent, Ticket } from './tickets.ts';

// What a kind of work's monitor counts, as the database keeps it (ADR-040, 084).
export const countShapes = ['NUMBER', 'ITEM_COUNTS', 'ITEM_HOURS'] as const;
export type CountShapeName = (typeof countShapes)[number];

// FEMA's test of a stump: its diameter two feet up, in inches. Under it the stump isn't an
// eligible one (ADR-187, 189); the flag's code and words say the figure.
const eligibleStumpInches = 24;

// What the checks read of a kind of work.
export interface CheckedKindOfWork extends Named {
  // Its built-in key, if it has one: the stump checks are told by it (ADR-194, 198).
  readonly key: BuiltInKey<'kindOfWork'> | null;
  // Items with hours each is crew time.
  readonly countShape: CountShapeName;
}

// One of the project's unit rate pay items, with the capture settings a ticket is checked
// against (ADR-157, 158, 207).
export interface UnitRatePayItem extends BandedPayItem {
  readonly payableTypeId: string;
  readonly gpsRequired: boolean;
  readonly measurementRequired: boolean;
  readonly decimalsAllowed: boolean;
  readonly photosRequired: boolean;
}

// What the checks read of a unit rate event, beside what grouping reads.
export interface UnitRateFieldEvent extends GroupedFieldEvent {
  // The crew's badge: a crew is its certification (ADR-228).
  readonly certNumber: string;
  readonly kindOfWork: CheckedKindOfWork | null;
  // What the monitor picked by name.
  readonly payableType: Named | null;
  // The count or the pounds; none on itemised work, whose items hold it.
  readonly unitCount: Amount | null;
  // A tree's measurement and how it was read; a stump's diameter two feet up.
  readonly measurement: TreeMeasurement | null;
  readonly rootBallInches: number | null;
  readonly surveyNumber: string | null;
  readonly markedIneligible: boolean | null;
  // Where it ended; none when the phone had no fix.
  readonly endGps: GpsPoint | null;
  // Its photographs' records. One the back office removed counts for nothing (ADR-337, 345).
  readonly photographs: readonly { readonly archivedAt: Date | null }[];
  // An itemised event's lines: a count each, or hours to the quarter hour.
  readonly items: readonly { readonly itemName: Named; readonly quantity: Amount }[];
}

export interface UnitRateSetup {
  readonly timeZone: string;
  // The project's unit rate pay items, archived ones marked.
  readonly payItems: readonly UnitRatePayItem[];
  // The project's stump check "the root ball is wider than the stump" (ADR-203).
  readonly stumpCheckRootBallWider: boolean;
  // One crew item's hours in a day over this are flagged; none switches the check off. A
  // threshold is policy, never a number here (invariant 16): the length of a crew day.
  readonly crewItemHoursLimit: number | null;
}

// What a unit rate ticket's checks read beyond the ticket itself.
export interface UnitRateAround<E extends UnitRateFieldEvent> {
  // The project's other crew-time field events that aren't void: the ones a crew's day and its
  // times are read against.
  readonly otherCrewTime: readonly E[];
}

// The worker's own answer, kept on the field event beside the phone's (ADR-217).
export interface PayItemWorkedOut {
  readonly fieldEventId: string;
  // None where no band fits, or nothing says which: the ticket has no pay item.
  readonly payItemId: string | null;
  // The diameter the bands read, in inches to a tenth; none where nothing was measured.
  readonly diameterInches: number | null;
}

export interface UnitRateFound {
  readonly flags: readonly FlagRaised[];
  // None on a ticket that isn't unit rate work.
  readonly workedOut: PayItemWorkedOut | null;
}

const iso = (instant: Date): string => instant.toISOString();

// Hours and counts are kept to two decimals: in whole hundredths nothing is lost adding them.
const hundredths = (amount: Amount): number => Math.round(Number(amount) * 100);

// A band as a message says it, before its "in": "2–24", "up to 24", "from 24".
const bandWords = (payItem: BandedPayItem): string => {
  if (payItem.bandFrom === null) return `up to ${String(payItem.bandTo)}`;
  if (payItem.bandTo === null) return `from ${String(payItem.bandFrom)}`;
  return `${String(payItem.bandFrom)}${enDash}${String(payItem.bandTo)}`;
};

export class UnitRateChecks<E extends UnitRateFieldEvent = UnitRateFieldEvent> {
  private readonly setup: UnitRateSetup;
  private readonly flags: Flags;

  constructor(setup: UnitRateSetup) {
    this.setup = setup;
    this.flags = new Flags(setup.timeZone);
  }

  // The pay item the ticket falls to, and every flag of §3.6 its facts raise now, all but the
  // one that needs its lines.
  of(ticket: Ticket<E>, around: UnitRateAround<E>): UnitRateFound {
    const event = ticket.unitRate;
    if (event === null) return { flags: [], workedOut: null };
    const subject: FlagSubject = { ticketNumber: ticket.ticketNumber };

    // The payable type's pay items: one, and it is that one; several, and the band says which.
    const { payableType } = event;
    const ofThePayableType =
      payableType === null
        ? []
        : this.setup.payItems.filter((payItem) => payItem.payableTypeId === payableType.id);
    const live = ofThePayableType.filter((payItem) => !payItem.archived);
    const worked = new SizeBands(payableType?.name ?? '', ofThePayableType).payItemFor(
      event.measurement,
    );
    const payItem = live.find((candidate) => candidate.id === worked.payItem?.id) ?? null;
    const diameter = worked.diameterInches;
    const isStump = event.kindOfWork?.key === 'STUMPS';
    const stumpUnder = isStump && diameter !== null && diameter < eligibleStumpInches;

    const flags: FlagRaised[] = [];
    const raise = (flag: FlagRaised): void => {
      flags.push(flag);
    };

    if (payableType !== null && live.length > 1 && payItem === null) {
      if (diameter === null) {
        // Several pay items and nothing measured: no band can say which.
        raise(
          this.flags.raise(
            'MEASUREMENT_MISSING',
            subject,
            {},
            { payableTypeId: payableType.id, payItemId: null },
            event.id,
          ),
        );
      } else if (!stumpUnder) {
        // A stump under 24 in that no band holds is said once, as that.
        raise(
          this.flags.raise(
            'NO_SIZE_BAND',
            subject,
            { inches: diameter.toFixed(1), payableType: payableType.name },
            {
              payableTypeId: payableType.id,
              diameterInches: diameter,
              bands: live.map((banded) => [banded.id, banded.bandFrom, banded.bandTo]),
            },
            event.id,
          ),
        );
      }
    }

    // A payable type's only pay item: its band picks nothing, and only flags work under or
    // over it (ADR-210).
    if (payItem !== null && live.length === 1 && diameter !== null) {
      const under = payItem.bandFrom !== null && diameter < payItem.bandFrom;
      const over = payItem.bandTo !== null && diameter > payItem.bandTo;
      if (under || over) {
        raise(
          this.flags.raise(
            'OUTSIDE_SIZE_BAND',
            subject,
            {
              inches: diameter.toFixed(1),
              side: over ? 'over' : 'under',
              payItem: payItem.code,
              band: bandWords(payItem),
            },
            {
              payItemId: payItem.id,
              diameterInches: diameter,
              band: [payItem.bandFrom, payItem.bandTo],
            },
            event.id,
          ),
        );
      }
    }

    if (payItem !== null) flags.push(...this.settings(subject, event, payItem));

    if (event.markedIneligible === true) {
      raise(
        this.flags.raise('MARKED_INELIGIBLE', subject, {}, { markedIneligible: true }, event.id),
      );
    }

    if (isStump) {
      if (stumpUnder) {
        raise(
          this.flags.raise(
            'STUMP_UNDER_24',
            subject,
            { inches: String(diameter), bandHoldsIt: payItem !== null },
            { diameterInches: diameter, payItemId: payItem?.id ?? null },
            event.id,
          ),
        );
      }
      const rootBall = event.rootBallInches;
      if (
        this.setup.stumpCheckRootBallWider &&
        rootBall !== null &&
        diameter !== null &&
        rootBall <= diameter
      ) {
        raise(
          this.flags.raise(
            'ROOT_BALL_NOT_WIDER',
            subject,
            { rootBallInches: String(rootBall), stumpInches: String(diameter) },
            { rootBallInches: rootBall, diameterInches: diameter },
            event.id,
          ),
        );
      }
      if (payItem?.measurementRequired === true && rootBall === null) {
        raise(
          this.flags.raise('ROOT_BALL_MISSING', subject, {}, { payItemId: payItem.id }, event.id),
        );
      }
      if ((event.surveyNumber ?? '').trim() === '') {
        raise(this.flags.raise('NO_SURVEY', subject, {}, {}, event.id));
      }
    }

    flags.push(...this.crewTime(subject, event, around.otherCrewTime));

    return {
      flags,
      workedOut: {
        fieldEventId: event.id,
        payItemId: payItem?.id ?? null,
        diameterInches: diameter,
      },
    };
  }

  // The capture settings ticked on the pay item, each checked on the ticket (ADR-157, 158, 207):
  // flagged, never blocked, and the ticket still bills.
  private settings(subject: FlagSubject, event: E, payItem: UnitRatePayItem): FlagRaised[] {
    const raised: FlagRaised[] = [];
    const about = { payItemId: payItem.id };
    if (payItem.measurementRequired && event.measurement === null) {
      raised.push(this.flags.raise('MEASUREMENT_MISSING', subject, {}, about, event.id));
    }
    // The fix the boundary and the zone are judged from: where the work ended.
    if (payItem.gpsRequired && event.endGps === null) {
      raised.push(this.flags.raise('GPS_MISSING', subject, {}, about, event.id));
    }
    // Required is at least one, counted from what is on the record now (ADR-181, 345).
    const photoCount = event.photographs.filter((photo) => photo.archivedAt === null).length;
    if (payItem.photosRequired && photoCount === 0) {
      raised.push(
        this.flags.raise('PHOTOS_MISSING', subject, {}, { ...about, photoCount }, event.id),
      );
    }
    if (
      !payItem.decimalsAllowed &&
      event.unitCount !== null &&
      hundredths(event.unitCount) % 100 !== 0
    ) {
      const count = String(Number(event.unitCount));
      raised.push(
        this.flags.raise(
          'DECIMAL_COUNT',
          subject,
          { count, payItem: payItem.code },
          { ...about, count },
          event.id,
        ),
      );
    }
    return raised;
  }

  // A crew's hours (ADR-068, 159): each item's hours added over the crew's day across its
  // crew-time tickets, and two of its crew-time tickets whose times overlap. A crew is its
  // certification, and the day is the project's, by each ticket's work time. Only crew-time
  // tickets are read: nothing here is a monitor's hours.
  private crewTime(subject: FlagSubject, event: E, others: readonly E[]): FlagRaised[] {
    if (event.kindOfWork?.countShape !== 'ITEM_HOURS') return [];
    const { clock } = this.flags;
    const crew = others.filter(
      (other) =>
        other.kind === 'UNIT_RATE' &&
        other.kindOfWork?.countShape === 'ITEM_HOURS' &&
        other.projectId === event.projectId &&
        other.certNumber === event.certNumber &&
        other.ticketNumber !== event.ticketNumber,
    );
    const raised: FlagRaised[] = [];

    const limit = this.setup.crewItemHoursLimit;
    if (limit !== null) {
      const day = clock.day(workTimeOf(event));
      const thatDay = [event, ...crew.filter((other) => clock.day(workTimeOf(other)) === day)].sort(
        (left, right) =>
          workTimeOf(left).getTime() - workTimeOf(right).getTime() ||
          left.ticketNumber.localeCompare(right.ticketNumber),
      );
      for (const line of event.items) {
        // In field order: the ticket whose hours take the item's day over the limit is flagged,
        // and each one after it; the message says the day's hours.
        let total = 0;
        let overAt: number | null = null;
        const tickets: string[] = [];
        for (const [place, ticket] of thatDay.entries()) {
          const logged = ticket.items
            .filter((item) => item.itemName.id === line.itemName.id)
            .reduce((sum, item) => sum + hundredths(item.quantity), 0);
          if (logged === 0) continue;
          tickets.push(ticket.ticketNumber);
          total += logged;
          if (overAt === null && total > limit * 100) overAt = place;
        }
        if (overAt === null || thatDay.indexOf(event) < overAt) continue;
        const hours = (total / 100).toFixed(2);
        raised.push(
          this.flags.raise(
            'CREW_ITEM_OVER_12_HOURS',
            subject,
            {
              item: line.itemName.name,
              hours,
              day,
              certNumber: event.certNumber,
              limitHours: limit,
            },
            {
              itemNameId: line.itemName.id,
              day,
              certNumber: event.certNumber,
              hours,
              limitHours: limit,
              tickets,
            },
            event.id,
          ),
        );
      }
    }

    // Times that can't both be true (ADR-159): raised on this ticket for each one it overlaps;
    // the other's own run raises it there.
    for (const other of crew) {
      if (
        event.startedAt.getTime() >= other.endedAt.getTime() ||
        other.startedAt.getTime() >= event.endedAt.getTime()
      ) {
        continue;
      }
      raised.push(
        this.flags.raise(
          'CREW_TIME_OVERLAP',
          subject,
          {
            startedAt: event.startedAt,
            endedAt: event.endedAt,
            otherTicketNumber: other.ticketNumber,
            certNumber: event.certNumber,
          },
          {
            certNumber: event.certNumber,
            crewTime: [iso(event.startedAt), iso(event.endedAt)],
            otherTicketNumber: other.ticketNumber,
            otherCrewTime: [iso(other.startedAt), iso(other.endedAt)],
          },
          event.id,
        ),
      );
    }
    return raised;
  }
}
