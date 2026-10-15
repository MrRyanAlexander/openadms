// What a phone sent that the server can't save, held for a person (spec/parts/05-sync.md step 6;
// AC-05-15, 46; ARCHITECTURE §9 (4); BACKLOG 2.6.2, 2.8.4; ADR-468, 471, 472, 526 (5)). One way
// in, for a sync's records and photographs and for a report a phone made, at a sync or at the
// report's own endpoint.
//
// - **Exactly as sent**, as inert data: never a field event, never paired, never billed, never
//   read by the worker, until a person decides what it is.
// - **Once for its phone and its fingerprint**: the same thing sent again by the same phone is
//   the same held record, however often and however it came; anything changed is another.
// - **Written as the device key's actor on that phone**: the monitor it names may be nobody the
//   server knows. The phone is known for certain, from its proof.
import { createHash } from 'node:crypto';

import { sentCanonical, type RecordNames } from '@open-adms/contracts';
import { byDeviceKey, Prisma, type Database } from '@open-adms/db';
import { NotSaved, type HeldNotice } from '@open-adms/domain';

import { databaseRefusalOf } from '../process/database-refusal.ts';
import type { Clock } from '../setup/setup-service.ts';

// The fingerprint a held record is known by on its phone: the SHA-256, in hex, of what stood
// in the record's place as canonical JSON in UTF-8 (ADR-472; the contracts' `sentCanonical`).
export function sentFingerprint(sent: unknown): string {
  return createHash('sha256').update(sentCanonical(sent), 'utf8').digest('hex');
}

export const apiHeldThings = Symbol('where the API holds what a phone sent for a person');

export class HeldThings {
  private readonly db: Database;
  private readonly clock: Clock;

  constructor(db: Database, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  // Holds what was sent, once for this phone and this fingerprint, with the words that say it is
  // held; `syncId` is the sync that brought it, or none for a report made to its own endpoint.
  // Answers what its phone is told.
  async held<N extends HeldNotice>(
    deviceId: string,
    syncId: string | null,
    sent: unknown,
    notice: N,
    names: RecordNames,
  ): Promise<N> {
    const told = NotSaved.heldForReview(notice);
    const sentSha256 = sentFingerprint(sent);
    const where = { deviceId_sentSha256: { deviceId, sentSha256 } };
    const kept = await this.db.$read((tx) =>
      tx.heldRecord.findUnique({ where, select: { id: true } }),
    );
    if (kept !== null) return told;
    try {
      await this.db.$write(byDeviceKey(deviceId), (tx) =>
        tx.heldRecord.create({
          data: {
            deviceId,
            syncId,
            sentId: names.id,
            projectId: names.projectId,
            sentMonitorId: names.monitorId,
            payload: sent === null ? Prisma.JsonNull : (sent as Prisma.InputJsonValue),
            sentSha256,
            reason: told.reason,
            message: told.message,
            receivedAt: this.clock.now(),
          },
          select: { id: true },
        }),
      );
    } catch (error) {
      // The same thing, sent by the same phone at the same moment: it is held already.
      if (databaseRefusalOf(error)?.constraint !== 'held_record_device_id_sent_sha256_key') {
        throw error;
      }
    }
    return told;
  }
}
