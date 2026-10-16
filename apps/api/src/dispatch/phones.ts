// The firm's phones, from the back office (ARCHITECTURE §7.4; spec/parts/02-people-and-devices.md;
// spec/acceptance/02-people-and-devices.md AC-02-15, 59, 60; ADR-134, 240, 281, 428).
//
// - **A page of them is read** by an admin or a manager/analyst: the dispatch board names a
//   phone, and whoever reviews a ticket may ask what became of the phone that made it. Each says
//   which version of the master passcode's check it holds; never its key.
// - **One is taken out of service**, as lost or retired, by an admin or a manager/analyst who
//   holds Dispatch now, read inside the same piece of work (ADR-364). Its removal time is this
//   moment, or one stated by hand; its record is kept, with a reason from the firm's list where
//   one is picked. What it made later is received and flagged by the worker, never refused
//   (ADR-134). Each mark (lost, or a lost one made retired) starts the firm's time again, after
//   which the worker revokes its key (ADR-520, 530); its turn-in revokes it sooner (ADR-488).
// - **One is renamed, and a found one put back in service** (ADR-530; C102), by the same people.
//   A phone whose key is revoked stays as it is: it is wiped and enrolled anew.
import type { Prisma } from '@open-adms/db';
import { PhoneRules, type PhoneRemoval } from '@open-adms/domain';

import { Refused, type Outcome } from '../setup/setup-service.ts';
import { DispatchService } from './dispatch-service.ts';

type Tx = Prisma.TransactionClient;

const phoneRead = {
  id: true,
  name: true,
  status: true,
  enrolledAt: true,
  outOfServiceAt: true,
  outOfServiceMarkedAt: true,
  outOfServiceReasonId: true,
  outOfServiceReason: { select: { name: true } },
  keyRevokedAt: true,
  keyRevokedBy: true,
  masterPasscodeVersion: true,
} as const;

type PhoneRow = Prisma.DeviceGetPayload<{ select: typeof phoneRead }>;

// A phone as an answer says it.
export interface PhoneRead {
  readonly id: string;
  readonly name: string;
  readonly status: 'ACTIVE' | 'LOST' | 'RETIRED';
  readonly enrolledAt: string;
  readonly outOfServiceAt: string | null;
  readonly outOfServiceMarkedAt: string | null;
  readonly outOfServiceReasonId: string | null;
  // That reason's name, as the list has it now (C170).
  readonly outOfServiceReason: string | null;
  readonly keyRevokedAt: string | null;
  readonly keyRevokedBy: 'TURN_IN' | 'FIRM_TIME' | null;
  readonly masterPasscodeVersion: number;
  readonly holdsCurrentPasscode: boolean;
}

// Which phones a page holds: those in service or those out of it, after the last phone of the
// page before, `limit` at most.
export interface PhonesAsked {
  readonly outOfService: boolean;
  readonly after?: string | undefined;
  readonly limit: number;
}

export type PhonesPage =
  | { readonly done: true; readonly phones: readonly PhoneRead[]; readonly next: string | null }
  | { readonly done: false; readonly code: 'NOT_ALLOWED' };

// A phone of that id the firm doesn't have: the read answers it as not found.
export class NotFoundPhone extends Error {}

export interface PhoneSessionsPage {
  readonly sessions: readonly {
    readonly id: string;
    readonly userId: string;
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly revokedAt: string | null;
    readonly masterPasscodeSession: 'AS_MONITOR' | 'TEMPORARY' | null;
    readonly offlineSignIn: boolean;
    readonly signedInAt: string | null;
    readonly signedInUtcOffsetMinutes: number | null;
  }[];
  readonly next: string | null;
}

export interface PhoneRemoved {
  readonly status: PhoneRemoval;
  // The removal time stated by hand, as the request wrote it; now where none is.
  readonly outOfServiceAt?: string | undefined;
  // From the firm's reasons list: a value offered for a phone's removal.
  readonly reasonId?: string | undefined;
  // Why, in the person's own words: the audit record's reason.
  readonly note?: string | undefined;
}

export class Phones extends DispatchService {
  private readonly rules = new PhoneRules();

  // A page of the firm's phones, in the order they were enrolled.
  async list(readerId: string, asked: PhonesAsked): Promise<PhonesPage> {
    return this.db.$read(async (tx): Promise<PhonesPage> => {
      const reader = await tx.user.findUnique({
        where: { id: readerId },
        select: { role: true, archivedAt: true },
      });
      if (
        reader?.archivedAt !== null ||
        (reader.role !== 'ADMIN' && reader.role !== 'MANAGER_ANALYST')
      ) {
        return { done: false, code: 'NOT_ALLOWED' };
      }
      const rows = await tx.device.findMany({
        where: {
          status: asked.outOfService ? { not: 'ACTIVE' } : 'ACTIVE',
          ...(asked.after === undefined ? {} : { id: { gt: asked.after } }),
        },
        orderBy: { id: 'asc' },
        // One more than the page, to know whether another follows.
        take: asked.limit + 1,
        select: phoneRead,
      });
      const page = rows.slice(0, asked.limit);
      const current = await this.currentVersion(tx);
      return {
        done: true,
        phones: page.map((row) => this.shown(row, current)),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // A phone's sessions, newest first (C170; ADR-535 (1)): whose, when, until when, whether
  // ended, which way one under the master passcode was opened and whether it came from a sign-in
  // made offline. Never a token or its hash. Null for a reader who isn't the back office.
  async sessions(
    readerId: string,
    deviceId: string,
    asked: { readonly after?: string | undefined; readonly limit: number },
  ): Promise<PhoneSessionsPage | null> {
    return this.db.$read(async (tx): Promise<PhoneSessionsPage | null> => {
      const reader = await tx.user.findUnique({
        where: { id: readerId },
        select: { role: true, archivedAt: true },
      });
      if (
        reader?.archivedAt !== null ||
        (reader.role !== 'ADMIN' && reader.role !== 'MANAGER_ANALYST')
      ) {
        return null;
      }
      const phone = await tx.device.findUnique({ where: { id: deviceId }, select: { id: true } });
      if (phone === null) throw new NotFoundPhone();
      const rows = await tx.session.findMany({
        where: { deviceId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: asked.limit + 1,
        ...(asked.after === undefined ? {} : { cursor: { id: asked.after }, skip: 1 }),
        select: {
          id: true,
          userId: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
          masterPasscodeSession: true,
          offlineSignInId: true,
          signedInAt: true,
          signedInUtcOffsetMinutes: true,
        },
      });
      const page = rows.slice(0, asked.limit);
      return {
        sessions: page.map((row) => ({
          id: row.id,
          userId: row.userId,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          revokedAt: row.revokedAt?.toISOString() ?? null,
          masterPasscodeSession: row.masterPasscodeSession,
          offlineSignIn: row.offlineSignInId !== null,
          signedInAt: row.signedInAt?.toISOString() ?? null,
          signedInUtcOffsetMinutes: row.signedInUtcOffsetMinutes,
        })),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // The phone is out of service: lost, or retired, from now or from the removal time stated; a
  // lost one may be made retired. Each mark is now.
  async remove(
    person: string,
    deviceId: string,
    removed: PhoneRemoved,
  ): Promise<Outcome<PhoneRead>> {
    return this.dispatching(person, removed.note, async (tx) => {
      const phone = await this.phone(tx, deviceId);
      const now = this.clock.now();
      const asked = {
        status: removed.status,
        outOfServiceAt:
          removed.outOfServiceAt === undefined ? undefined : new Date(removed.outOfServiceAt),
      };
      const refusal = this.rules.removalRefusal(phone, asked, now);
      if (refusal !== null) throw new Refused(refusal);
      if (removed.reasonId !== undefined) await this.removalReason(tx, removed.reasonId);
      const row = await tx.device.update({
        where: { id: deviceId },
        data: {
          status: removed.status,
          outOfServiceAt: this.rules.removedAt(phone, asked, now),
          outOfServiceMarkedAt: now,
          ...(removed.reasonId === undefined ? {} : { outOfServiceReasonId: removed.reasonId }),
        },
        select: phoneRead,
      });
      return this.shown(row, await this.currentVersion(tx));
    });
  }

  // A found phone back in service, its key standing: its removal, mark and reason cleared.
  async putBack(person: string, deviceId: string, note: string): Promise<Outcome<PhoneRead>> {
    return this.dispatching(person, note, async (tx) => {
      const refusal = this.rules.returnRefusal(await this.phone(tx, deviceId));
      if (refusal !== null) throw new Refused(refusal);
      const row = await tx.device.update({
        where: { id: deviceId },
        data: {
          status: 'ACTIVE',
          outOfServiceAt: null,
          outOfServiceMarkedAt: null,
          outOfServiceReasonId: null,
        },
        select: phoneRead,
      });
      return this.shown(row, await this.currentVersion(tx));
    });
  }

  // Another name, as the dispatch board calls it.
  async rename(person: string, deviceId: string, name: string): Promise<Outcome<PhoneRead>> {
    return this.dispatching(person, undefined, async (tx) => {
      await this.phone(tx, deviceId);
      const row = await tx.device.update({
        where: { id: deviceId },
        data: { name },
        select: phoneRead,
      });
      return this.shown(row, await this.currentVersion(tx));
    });
  }

  // A dispatch change, by a person who may dispatch now, their note the audit record's reason.
  private dispatching<T>(
    person: string,
    note: string | undefined,
    work: (tx: Tx) => Promise<T>,
  ): Promise<Outcome<T>> {
    return this.writeAs(
      { actorId: person, source: 'BACK_OFFICE', ...(note === undefined ? {} : { reason: note }) },
      async (tx) => {
        await this.mayDispatch(tx, person);
        return work(tx);
      },
    );
  }

  // The phone, read under its row's lock for the rest of the piece of work: a phone's key
  // revoked by the worker at the same moment is seen, or waits for this change.
  private async phone(tx: Tx, deviceId: string) {
    await tx.$queryRaw`SELECT "id" FROM "device" WHERE "id" = ${deviceId}::uuid FOR UPDATE`;
    const phone = await tx.device.findUnique({ where: { id: deviceId }, select: phoneRead });
    if (phone === null) {
      throw new Refused({ code: 'NOT_FOUND', message: 'The firm has no such phone.' });
    }
    return phone;
  }

  // A reason picked from the firm's list: one in service, offered for a phone's removal.
  private async removalReason(tx: Tx, reasonId: string): Promise<void> {
    const reason = await tx.reason.findUnique({
      where: { id: reasonId },
      select: { uses: true, archivedAt: true },
    });
    if (reason?.archivedAt !== null || !reason.uses.includes('PHONE_REMOVAL')) {
      throw new Refused({
        code: 'UNKNOWN_REASON',
        message:
          'That reason isn’t one the firm offers for taking a phone out of service. Nothing was changed.',
      });
    }
  }

  // The version of the master passcode in force: the highest.
  private async currentVersion(tx: Tx): Promise<number> {
    const kept = await tx.masterPasscode.aggregate({ _max: { version: true } });
    return kept._max.version ?? 0;
  }

  private shown(row: PhoneRow, current: number): PhoneRead {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      enrolledAt: row.enrolledAt.toISOString(),
      outOfServiceAt: row.outOfServiceAt?.toISOString() ?? null,
      outOfServiceMarkedAt: row.outOfServiceMarkedAt?.toISOString() ?? null,
      outOfServiceReasonId: row.outOfServiceReasonId,
      outOfServiceReason: row.outOfServiceReason?.name ?? null,
      keyRevokedAt: row.keyRevokedAt?.toISOString() ?? null,
      keyRevokedBy: row.keyRevokedBy,
      masterPasscodeVersion: row.masterPasscodeVersion,
      holdsCurrentPasscode: row.masterPasscodeVersion === current,
    };
  }
}
