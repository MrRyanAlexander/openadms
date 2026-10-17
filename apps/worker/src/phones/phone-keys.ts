// A lost phone's key revoked after the firm's time (REQ-214; ARCHITECTURE §7.4; spec/acceptance/
// 10-api-and-sync.md AC-10-83; ADR-520, 530). NIST SP 800-63B-4 §4.6: an authenticator reported
// lost is invalidated promptly; the firm says how promptly.
//
// - **At each pass of the worker's loop, before the projects**, it reads the firm's settings and
//   every phone out of service whose key stands and whose last mark (lost, or retired) is the
//   firm's hours old or more. Off, nothing is read further.
// - **Each phone is its own piece of work, as the system actor**: its row locked and read again
//   (still out of service, its key still standing, still due under the setting as it is now),
//   every block of numbers it still holds retired whole (nobody can say what a phone out of the
//   firm's hands used, ADR-065), its key revoked (`FIRM_TIME`), and a security event
//   `DEVICE_KEY_REVOKED` naming it. The database lets the system actor do that and nothing more,
//   and only once the firm's hours have passed by its own clock. Sign-in's records stay the
//   API's alone (AC-10-11): a monitor's session on the phone is dead with its key, since the door
//   reads the phone before any session, and the turn-in ends it.
// - **A phone that fails never stops the others**; it is tried again at the next pass. What was
//   done is in the log by the phone's id alone.
// - A phone revoked so may still sync and be turned in under the master passcode (the API's).
import { systemActor, type Database } from '@open-adms/db';
import { PhoneKeyRules } from '@open-adms/domain';

import type { WorkerLog } from '../process/logs.ts';

// How many due phones are read at a time; every one due is revoked in the same pass.
const readAtOnce = 100;

export interface PhoneKeysRevoked {
  readonly revoked: readonly string[];
  readonly failed: readonly string[];
}

export class PhoneKeyBackstop {
  private readonly db: Database;
  private readonly log: WorkerLog;
  private readonly clock: { now(): Date };
  private readonly rules = new PhoneKeyRules();

  constructor(db: Database, log: WorkerLog, clock: { now(): Date }) {
    this.db = db;
    this.log = log;
    this.clock = clock;
  }

  // Every phone due now, each revoked or left for the next pass.
  async pass(): Promise<PhoneKeysRevoked> {
    const settings = await this.db.firmSettings.findUnique({
      where: { id: 1 },
      select: { phoneKeyRevokedAfterHours: true },
    });
    const hours = settings?.phoneKeyRevokedAfterHours ?? null;
    if (hours === null) return { revoked: [], failed: [] };
    const markedBy = this.rules.markedBy(this.clock.now(), hours);
    const revoked: string[] = [];
    const failed: string[] = [];
    let after: string | undefined;
    for (;;) {
      const due = await this.db.device.findMany({
        where: {
          status: { not: 'ACTIVE' },
          keyRevokedAt: null,
          outOfServiceMarkedAt: { lte: markedBy },
          ...(after === undefined ? {} : { id: { gt: after } }),
        },
        orderBy: { id: 'asc' },
        take: readAtOnce,
        select: { id: true },
      });
      for (const { id } of due) {
        try {
          if (await this.revoke(id)) {
            revoked.push(id);
            this.log.warn('A lost phone’s key was revoked after the firm’s time.', {
              deviceId: id,
            });
          }
        } catch (caught) {
          failed.push(id);
          this.log.error('A lost phone’s key could not be revoked; it is tried again.', caught, {
            deviceId: id,
          });
        }
      }
      if (due.length < readAtOnce) break;
      after = due.at(-1)?.id;
    }
    return { revoked, failed };
  }

  // One phone, read again under its row's lock: whether it was revoked now.
  private async revoke(deviceId: string): Promise<boolean> {
    return this.db.$write(systemActor, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "device" WHERE "id" = ${deviceId}::uuid FOR UPDATE`;
      const phone = await tx.device.findUnique({
        where: { id: deviceId },
        select: { status: true, keyRevokedAt: true, outOfServiceMarkedAt: true },
      });
      const settings = await tx.firmSettings.findUnique({
        where: { id: 1 },
        select: { phoneKeyRevokedAfterHours: true },
      });
      const now = this.clock.now();
      // Put back in service, turned in, or the firm's time changed since it was read.
      if (
        phone === null ||
        phone.status === 'ACTIVE' ||
        phone.keyRevokedAt !== null ||
        !this.rules.due(
          phone.outOfServiceMarkedAt,
          settings?.phoneKeyRevokedAfterHours ?? null,
          now,
        )
      ) {
        return false;
      }
      await tx.numberBlock.updateMany({
        where: { deviceId, status: 'ISSUED' },
        data: { status: 'RETIRED', endedAt: now },
      });
      await tx.device.updateMany({
        where: { id: deviceId, keyRevokedAt: null },
        data: { keyRevokedAt: now, keyRevokedBy: 'FIRM_TIME' },
      });
      await tx.securityEvent.createMany({
        data: [{ kind: 'DEVICE_KEY_REVOKED', occurredAt: now, deviceId }],
      });
      return true;
    });
  }
}
