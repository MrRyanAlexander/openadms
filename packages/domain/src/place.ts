// The checks on place: the project's boundary and zones, a site's area, its dates and its
// facts, and a site's permit (spec/parts/06-reconciliation.md steps 3 and 4;
// spec/acceptance/06-reconciliation.md sections F and G, AC-06-118, 126, 127, 134; spec/FLAGS.md
// §3.3's place rows, §3.4, §3.7's `PERMIT_OUTSTANDING`; adms-validation §5.2; ARCHITECTURE §3
// "Project boundary and zones", "Disposal site areas"; ADR-111, 135, 136, 141, 142, 144, 173,
// 181, 205, 215, 226, 298, 346).
//
// Each kind of field event is judged against its own place, where it ended:
// - a collection and a unit rate event against the project's boundary, then its zones: the zone
//   it lies in is attached to it, with the map version used; no monitor records a zone;
// - a disposal and both ends of a haul-out against their own site's area, never the boundary,
//   so a load's zone is its collection's and nothing compares zones between field events;
// - a disposal against its site's dates and facts: the system checks where debris went, never
//   where it was headed (ADR-205).
//
// A check changes nothing, refuses nothing and guesses nothing (ADR-052). A field event with no
// GPS fix can't be placed, so nothing here is raised on it: the pay item's "GPS required" is
// task 1.5.7's. Never flagged, so never read here: the distance a collection covers (its start
// GPS isn't looked at, ADR-136), a fix's accuracy (ADR-083), a citizen drop-off log against its
// site's facts (ADR-215), a preload or a haul-out from a prior date (ADR-205).
// `TIPPING_FEE_RULE_MISSING` needs the ticket's lines: task 1.6.3's.
import type { BuiltInKey } from './built-in-keys.ts';
import { workTimeOf } from './checks.ts';
import { Flags, type FlagFacts, type FlagRaised, type FlagSubject } from './flags.ts';
import { Distance, type GpsPoint } from './geodesic.ts';
import { ShapeArea, type MapShape } from './map-shapes.ts';
import type { GroupedFieldEvent, Ticket } from './tickets.ts';

// What the checks read of a disposal site, as its project holds it now.
export interface CheckedSite {
  readonly id: string;
  readonly name: string;
  // The site type's built-in key, if it has one: a TDSR is told by it, whatever the firm calls
  // the type (ADR-194, 226).
  // Its site type, the firm's own or a built-in one: what the criterion Disposal site type reads.
  readonly siteTypeId: string;
  readonly siteTypeKey: BuiltInKey<'siteType'> | null;
  readonly takesLoads: boolean;
  readonly haulOutsLeaveHere: boolean;
  readonly ineligibleSite: boolean;
  // Empty is "permit outstanding" (ADR-111).
  readonly permitNumber: string | null;
  readonly gps: GpsPoint;
  // Calendar days in the project's time zone, 2026-10-12; a site may have no close date.
  readonly activationDate: string;
  readonly closeDate: string | null;
  // The site's own shape, where it has one: it is then the site's area, and the project's
  // circle isn't read (ADR-142, 144).
  readonly area: { readonly versionId: string; readonly shape: MapShape } | null;
}

// A site's area as it stands: the project's circle round its GPS, in metres, or its own shape.
export type SiteAreaHeld =
  | { readonly kind: 'CIRCLE'; readonly meters: number }
  | { readonly kind: 'SHAPE'; readonly shape: MapShape };

// Whether a GPS point is at a site (ADR-136, 142, 144, 346; invariant 14): in its own shape where
// it has one, however far from its GPS; else within the project's circle round its GPS, by
// geodesic distance. The worker's check flags by it (`PlaceChecks`), and a phone at the site says
// so by it, an advisory, never a refusal (C118; ADR-552 (3)(d), 585).
export class SiteArea {
  private readonly gps: GpsPoint;
  private readonly area: SiteAreaHeld;

  constructor(gps: GpsPoint, area: SiteAreaHeld) {
    this.gps = gps;
    this.area = area;
  }

  holds(point: GpsPoint): boolean {
    return this.area.kind === 'CIRCLE'
      ? new Distance(point, this.gps).isWithin(this.area.meters)
      : new ShapeArea(this.area.shape).holds(point);
  }
}

// What the checks read of a field event, beside what grouping reads.
export interface PlacedFieldEvent extends GroupedFieldEvent {
  // Where it ended; none when the phone had no fix (ADR-083).
  readonly endGps: GpsPoint | null;
  // Its site, from the assignment; none on a curb collection and on unit rate work away from a
  // site (ADR-195).
  readonly site: CheckedSite | null;
}

// The project's map as it stands: its newest version.
export interface ProjectMap {
  readonly versionId: string;
  readonly boundary: MapShape;
  // In the order the version names them; a point in two that overlap is in the first.
  readonly zones: readonly ZoneOnMap[];
}

export interface ZoneOnMap {
  readonly id: string;
  readonly name: string;
  readonly shape: MapShape;
}

export interface PlaceSetup {
  readonly timeZone: string;
  // The project's circle round a site's GPS, in metres: a project setting, started from the
  // policy value DISPOSAL_SITE_PROXIMITY_M, never a number here (invariant 16; ADR-142).
  readonly siteCircleMeters: number;
  // None on a project with no map loaded.
  readonly map: ProjectMap | null;
}

// What the worker writes on a collection or a unit rate event: the zone its end GPS lies in and
// the map version it was judged with (ADR-135, 141). Both empty where it couldn't be judged: no
// map, or no fix.
export interface ZoneAttached {
  readonly fieldEventId: string;
  readonly zoneId: string | null;
  readonly mapVersionId: string | null;
}

export interface PlaceFound {
  readonly flags: readonly FlagRaised[];
  // One for each collection and unit rate event of the ticket.
  readonly zones: readonly ZoneAttached[];
}

const fixOf = (point: GpsPoint): FlagFacts => ({
  latitude: point.latitude,
  longitude: point.longitude,
});

export class PlaceChecks<E extends PlacedFieldEvent = PlacedFieldEvent> {
  private readonly setup: PlaceSetup;
  private readonly flags: Flags;

  constructor(setup: PlaceSetup) {
    this.setup = setup;
    this.flags = new Flags(setup.timeZone);
  }

  // Every place flag the ticket's facts raise now, and the zone of each field event that takes
  // one. A ticket still missing a field event gets the checks of the one it has (ADR-244).
  of(ticket: Ticket<E>): PlaceFound {
    const subject: FlagSubject = { ticketNumber: ticket.ticketNumber };
    const flags: FlagRaised[] = [];
    const zones: ZoneAttached[] = [];

    for (const event of ticket.events) {
      if (event.kind === 'COLLECTION' || event.kind === 'UNIT_RATE') {
        zones.push(this.onTheMap(subject, event, flags));
        continue;
      }
      flags.push(...this.siteArea(subject, event));
      if (event.kind === 'DISPOSAL' || event.kind === 'HAUL_OUT_DISPOSAL') {
        flags.push(...this.siteDates(subject, event));
      }
      if (event.kind === 'DISPOSAL') flags.push(...this.loadDumped(subject, event));
      if (event.kind === 'HAUL_OUT_DISPOSAL') flags.push(...this.haulOutDumped(subject, event));
    }
    flags.push(...this.haulOutLeft(subject, ticket));
    return { flags, zones };
  }

  // The boundary, then the zones (ADR-141). Outside the boundary: flagged, and no zone is
  // looked for. Inside it and in no zone: the zone is left empty and flagged, unless the map
  // has no zones at all, since zones are optional on a map (ARCHITECTURE §3; agent default,
  // ADR-346). A project with no map has no boundary to be outside of and no zone to give.
  private onTheMap(subject: FlagSubject, event: E, flags: FlagRaised[]): ZoneAttached {
    const { map } = this.setup;
    if (map === null || event.endGps === null) {
      return { fieldEventId: event.id, zoneId: null, mapVersionId: null };
    }
    const attached = (zoneId: string | null): ZoneAttached => ({
      fieldEventId: event.id,
      zoneId,
      mapVersionId: map.versionId,
    });
    const facts = { gps: fixOf(event.endGps), mapVersionId: map.versionId };

    if (!new ShapeArea(map.boundary).holds(event.endGps)) {
      flags.push(this.flags.raise('OUTSIDE_PROJECT_BOUNDARY', subject, {}, facts, event.id));
      return attached(null);
    }
    const gps = event.endGps;
    const zone = map.zones.find((candidate) => new ShapeArea(candidate.shape).holds(gps));
    if (zone === undefined && map.zones.length > 0) {
      flags.push(this.flags.raise('NO_ZONE', subject, {}, facts, event.id));
    }
    return attached(zone?.id ?? null);
  }

  // A disposal's, and either haul-out end's, end GPS against its own site's area: the site's
  // shape where it has one, however far from the site's GPS; else the project's circle round
  // the site's GPS, by geodesic distance (ADR-136, 142, 144; invariant 14).
  private siteArea(subject: FlagSubject, event: E): FlagRaised[] {
    const { site, endGps } = event;
    if (site === null || endGps === null) return [];
    const area: SiteAreaHeld =
      site.area === null
        ? { kind: 'CIRCLE', meters: this.setup.siteCircleMeters }
        : { kind: 'SHAPE', shape: site.area.shape };
    if (new SiteArea(site.gps, area).holds(endGps)) return [];
    const facts: FlagFacts =
      site.area === null
        ? {
            gps: fixOf(endGps),
            siteId: site.id,
            siteGps: fixOf(site.gps),
            circleMeters: this.setup.siteCircleMeters,
          }
        : { gps: fixOf(endGps), siteId: site.id, areaVersionId: site.area.versionId };
    return [this.flags.raise('OUTSIDE_SITE_AREA', subject, { site: site.name }, facts, event.id)];
  }

  // A disposal's day, in the project's time zone, against its site's dates: before the
  // activation date, or after a set close date. The site is open on both days themselves
  // (ADR-173, 181; agent default, ADR-346). A haul-out's collection isn't judged: a TDSR is
  // emptied after it closes to loads.
  private siteDates(subject: FlagSubject, event: E): FlagRaised[] {
    const { site } = event;
    if (site === null) return [];
    const day = this.flags.clock.day(workTimeOf(event));
    const told = { site: site.name, day };
    const raised: FlagRaised[] = [];
    if (day < site.activationDate) {
      raised.push(
        this.flags.raise(
          'SITE_NOT_YET_ACTIVE',
          subject,
          told,
          { siteId: site.id, day, activationDate: site.activationDate },
          event.id,
        ),
      );
    }
    if (site.closeDate !== null && day > site.closeDate) {
      raised.push(
        this.flags.raise(
          'SITE_CLOSED',
          subject,
          told,
          { siteId: site.id, day, closeDate: site.closeDate },
          event.id,
        ),
      );
    }
    return raised;
  }

  // Where a load went (ADR-205, 215): both still bill.
  private loadDumped(subject: FlagSubject, event: E): FlagRaised[] {
    const { site } = event;
    if (site === null) return [];
    const told = { site: site.name };
    const raised: FlagRaised[] = [];
    if (!site.takesLoads) {
      raised.push(
        this.flags.raise(
          'SITE_DOES_NOT_TAKE_LOADS',
          subject,
          told,
          { siteId: site.id, takesLoads: false },
          event.id,
        ),
      );
    }
    if (site.ineligibleSite) {
      raised.push(
        this.flags.raise(
          'INELIGIBLE_SITE',
          subject,
          told,
          { siteId: site.id, ineligibleSite: true },
          event.id,
        ),
      );
    }
    return raised;
  }

  // A haul-out only ever leaves a TDSR: one dumped at a TDSR, the one it left included, is
  // flagged and priced no further (ADR-226, 298). Told by the built-in key, never the name.
  private haulOutDumped(subject: FlagSubject, event: E): FlagRaised[] {
    const { site } = event;
    if (site?.siteTypeKey !== 'TDSR') return [];
    return [
      this.flags.raise(
        'HAUL_OUT_DUMPED_AT_TDSR',
        subject,
        { site: site.name },
        { siteId: site.id, siteTypeKey: site.siteTypeKey },
        event.id,
      ),
    ];
  }

  // A haul-out that left a site not marked Haul-outs leave here: only a TDSR/DMS site can carry
  // the mark, so this catches one that left a landfill too (ADR-298). Once for each site, about
  // the first pile loaded there: a split haul-out's piles are one trip from one site.
  private haulOutLeft(subject: FlagSubject, ticket: Ticket<E>): FlagRaised[] {
    if (ticket.workflow !== 'HAUL_OUT') return [];
    const raised: FlagRaised[] = [];
    const told = new Set<string>();
    for (const collection of ticket.collections) {
      const { site } = collection;
      if (site === null || site.haulOutsLeaveHere || told.has(site.id)) continue;
      told.add(site.id);
      raised.push(
        this.flags.raise(
          'SITE_NOT_FOR_HAUL_OUTS',
          subject,
          { site: site.name },
          { siteId: site.id, haulOutsLeaveHere: false },
          collection.id,
        ),
      );
    }
    return raised;
  }
}

// A site's own flag (spec/FLAGS.md §3.7): it sits on the site, never on a ticket, and work
// there is never refused or flagged for it (ADR-111).
export class SiteChecks {
  private readonly flags: Flags;

  constructor(timeZone: string) {
    this.flags = new Flags(timeZone);
  }

  // A site with no permit number: outstanding until one is entered.
  permit(site: Pick<CheckedSite, 'id' | 'name' | 'permitNumber'>): readonly FlagRaised[] {
    if ((site.permitNumber ?? '').trim() !== '') return [];
    return [this.flags.raise('PERMIT_OUTSTANDING', { site: site.name }, {}, { siteId: site.id })];
  }
}
