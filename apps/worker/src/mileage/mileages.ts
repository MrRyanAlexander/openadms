// The worker's mileage step (spec/parts/06-reconciliation.md step 4; ARCHITECTURE §3, §13
// "Mileage before pricing"; ADR-110, 162, 163, 208, 349, 350): for one collection of a load or a
// haul-out, the road point nearest its end GPS, that point's address, and the shortest road
// route from it to the disposal site's own GPS; where there is no route, the flagged straight
// line. What is kept, and when a kept mileage still stands, is the domain's `Mileage`.
//
// A split is asked once for each property or pile, from its own end GPS (ADR-162, 295); a unit
// rate ticket never is. Reading the ends from a ticket and writing the answer onto its
// collection row is the run's (task 1.5.9).
import { Mileage, type MileageEnds, type MileageMeasured } from '@open-adms/domain';

import type { MapServers } from './map-servers.ts';

export class Mileages {
  private readonly servers: MapServers;

  constructor(servers: MapServers) {
    this.servers = servers;
  }

  // `standing` is the mileage the collection already has, handed in only while neither of its
  // ends has been corrected since: it is handed back and no server is asked, so a reprocess for
  // any other reason, or newer map data, never changes a mileage (AC-06-56). Nothing keeps the
  // two ends a second time (the user, ADR-350): they are the collection's end GPS and the site's
  // GPS on the records themselves, and the run knows from what was corrected whether one moved.
  async between(
    ends: MileageEnds,
    standing: MileageMeasured | null = null,
  ): Promise<MileageMeasured> {
    if (standing !== null) return standing;
    const mileage = new Mileage(ends, await this.servers.mapData());
    const point = await this.servers.nearestRoad(ends.from);
    if (point === null) return mileage.straightLine(null);
    const roadPoint = { point, address: await this.servers.addressOf(point) };
    const miles = await this.servers.shortestRouteMiles(point, ends.to);
    return miles === null ? mileage.straightLine(roadPoint) : mileage.byRoad(roadPoint, miles);
  }
}
