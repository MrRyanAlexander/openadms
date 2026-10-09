// A stand-in for the API's sync endpoint (ARCHITECTURE §9; Phase 2): writes each field event a
// phone sends as the API's own login, through $write, attributed to the phone's monitor from that
// phone, so the database audits it as it will audit a real sync. The server's received time is the
// story's clock (ARCHITECTURE §10), never the machine's. Duplicate numbers, quarantine and the
// idempotency ledger are the real endpoint's; a second copy of a field event is refused here.
import type { Database } from '@open-adms/db';

import type { StoryClock } from './clock.ts';
import type { RecordedEvent, SyncIntake } from './device.ts';

export class ApiSyncIntake implements SyncIntake {
  private readonly api: Database;
  private readonly clock: StoryClock;

  constructor(api: Database, clock: StoryClock) {
    this.api = api;
    this.clock = clock;
  }

  async receive(event: RecordedEvent): Promise<void> {
    await this.api.$write(
      { actorId: event.monitorId, source: 'DEVICE', deviceId: event.deviceId },
      (tx) => tx.fieldEvent.create({ data: { ...event, receivedAt: this.clock.now() } }),
    );
  }
}
