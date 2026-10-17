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
// - **Counted against the phone's daily budget** (ADR-546; the Phase 2 audit's F7): its bytes are
//   kept with it, and a phone that made the server hold more than the firm's policy in the last
//   24 hours (`PHONE_HELD_BYTES_PER_DAY`, `PHONE_HELD_RECORDS_PER_DAY`) is still received and held
//   (flag, never block), but once a day it is a security event (`PHONE_HELD_BUDGET_PASSED`, which
//   the phones list shows) and every admin is told by mail. Taking it out of service is a person's
//   act.
import { createHash } from 'node:crypto';

import { sentCanonical, type RecordNames } from '@open-adms/contracts';
import { byDeviceKey, Prisma, type Database } from '@open-adms/db';
import { NotSaved, type HeldNotice } from '@open-adms/domain';

import { databaseRefusalOf } from '../process/database-refusal.ts';
import type { Clock } from '../setup/setup-service.ts';
import type { Mail } from '../sign-in/mail.ts';

// The fingerprint a held record is known by on its phone: the SHA-256, in hex, of what stood
// in the record's place as canonical JSON in UTF-8 (ADR-472; the contracts' `sentCanonical`).
export function sentFingerprint(sent: unknown): string {
  return createHash('sha256').update(sentCanonical(sent), 'utf8').digest('hex');
}

export const apiHeldThings = Symbol('where the API holds what a phone sent for a person');

// What one phone may make the server hold in a day, and who is told when it does more.
export interface HeldBudget {
  readonly bytesPerDay: number;
  readonly recordsPerDay: number;
  readonly mail: Mail;
}

const aDay = 24 * 3_600_000;

export class HeldThings {
  private readonly db: Database;
  private readonly clock: Clock;
  private readonly budget: HeldBudget | undefined;

  // With no budget, nothing is counted against one (a test of holding alone).
  constructor(db: Database, clock: Clock, budget?: HeldBudget) {
    this.db = db;
    this.clock = clock;
    this.budget = budget;
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
    const sentBytes = Buffer.byteLength(sentCanonical(sent), 'utf8');
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
            sentBytes,
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
      return told;
    }
    await this.counted(deviceId);
    return told;
  }

  // The phone's last 24 hours of held records against its budget: past it, once a day, a
  // security event and every admin told.
  private async counted(deviceId: string): Promise<void> {
    const budget = this.budget;
    if (budget === undefined) return;
    const now = this.clock.now();
    const since = new Date(now.getTime() - aDay);
    const kept = await this.db.$read((tx) =>
      tx.heldRecord.aggregate({
        where: { deviceId, receivedAt: { gte: since } },
        _count: { _all: true },
        _sum: { sentBytes: true },
      }),
    );
    const records = kept._count._all;
    const bytes = kept._sum.sentBytes ?? 0;
    if (records <= budget.recordsPerDay && bytes <= budget.bytesPerDay) return;
    const phone = await this.db.$write(byDeviceKey(deviceId), async (tx) => {
      const told = await tx.securityEvent.count({
        where: { deviceId, kind: 'PHONE_HELD_BUDGET_PASSED', occurredAt: { gte: since } },
      });
      if (told > 0) return undefined;
      await tx.securityEvent.create({
        data: { kind: 'PHONE_HELD_BUDGET_PASSED', deviceId, occurredAt: now },
      });
      return tx.device.findUniqueOrThrow({ where: { id: deviceId }, select: { name: true } });
    });
    if (phone !== undefined) await this.tellAdmins(phone.name, records, bytes);
  }

  // Only a person takes a phone out of service, so each admin is told where the firm has mail.
  // A message that can't be sent undoes nothing.
  private async tellAdmins(phone: string, records: number, bytes: number): Promise<void> {
    const mail = this.budget?.mail;
    if (mail?.available !== true) return;
    const admins = await this.db.$read((tx) =>
      tx.user.findMany({
        where: { role: 'ADMIN', archivedAt: null, email: { not: null } },
        select: { name: true, email: true },
        orderBy: { id: 'asc' },
      }),
    );
    for (const admin of admins) {
      if (admin.email === null) continue;
      const paragraphs = [
        `${admin.name},`,
        `The phone ${phone} sent the server ${String(records)} records it couldn’t save in the last 24 hours (${String(Math.ceil(bytes / 1024))} KiB), more than your firm expects of one phone in a day. Each is kept for a person to look at, and the phone is marked on the phones list.`,
        'If the phone isn’t where it should be, or nobody at your firm knows why it sends so much, take it out of service in the back office.',
      ];
      try {
        await mail.send({
          to: admin.email,
          subject: `The phone ${phone} is sending more than it should`,
          text: `${paragraphs.join('\n\n')}\n`,
        });
      } catch {
        // Nothing to undo.
      }
    }
  }
}
