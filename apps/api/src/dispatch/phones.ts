// The firm's phones, from the back office (ARCHITECTURE §7.4; spec/parts/02-people-and-devices.md;
// spec/acceptance/02-people-and-devices.md AC-02-15, 59, 60; ADR-134, 240, 281, 428).
//
// - **A page of them is read** by an admin or a manager/analyst: the dispatch board names a
//   phone, and whoever reviews a ticket may ask what became of the phone that made it. Each says
//   which version of the master passcode's check it holds; never its key.
// - **One is taken out of service**, as lost or retired, by an admin or a manager/analyst who
//   holds Dispatch now, read inside the same piece of work (ADR-364). Its removal time is this
//   moment; its record is kept. What it made later is received and flagged by the worker, never
//   refused (ADR-134); revoking its key once it has synced and been wiped is the sync's (C47).
import type { Prisma } from '@open-adms/db';
import { DispatchRights, PhoneRules, type PhoneRemoval } from '@open-adms/domain';

import { Refused, SetupService, type Outcome } from '../setup/setup-service.ts';

type Tx = Prisma.TransactionClient;

const phoneRead = {
  id: true,
  name: true,
  status: true,
  enrolledAt: true,
  outOfServiceAt: true,
  keyRevokedAt: true,
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
  readonly keyRevokedAt: string | null;
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

export interface PhoneRemoved {
  readonly status: PhoneRemoval;
  // Why, in the person's own words: the audit record's reason.
  readonly note?: string | undefined;
}

export class Phones extends SetupService {
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

  // The phone is out of service from now: lost, or retired.
  async remove(
    person: string,
    deviceId: string,
    removed: PhoneRemoved,
  ): Promise<Outcome<PhoneRead>> {
    return this.writeAs(
      {
        actorId: person,
        source: 'BACK_OFFICE',
        ...(removed.note === undefined ? {} : { reason: removed.note }),
      },
      async (tx) => {
        await this.mayDispatch(tx, person);
        const phone = await tx.device.findUnique({ where: { id: deviceId }, select: phoneRead });
        if (phone === null) {
          throw new Refused({ code: 'NOT_FOUND', message: 'The firm has no such phone.' });
        }
        const refusal = this.rules.removalRefusal(phone);
        if (refusal !== null) throw new Refused(refusal);
        const row = await tx.device.update({
          where: { id: deviceId },
          data: { status: removed.status, outOfServiceAt: this.clock.now() },
          select: phoneRead,
        });
        return this.shown(row, await this.currentVersion(tx));
      },
    );
  }

  // Refuses, with nothing changed, anybody who may not dispatch now.
  private async mayDispatch(tx: Tx, person: string): Promise<void> {
    const user = await tx.user.findUnique({ where: { id: person } });
    const granted =
      user === null
        ? []
        : await tx.userPermission.findMany({ where: { userId: person, archivedAt: null } });
    const refusal = new DispatchRights(
      user === null
        ? null
        : {
            name: user.name,
            role: user.role,
            archived: user.archivedAt !== null,
            granted: granted.map((grant) => grant.permission),
          },
    ).refusal();
    if (refusal !== null) throw new Refused(refusal);
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
      keyRevokedAt: row.keyRevokedAt?.toISOString() ?? null,
      masterPasscodeVersion: row.masterPasscodeVersion,
      holdsCurrentPasscode: row.masterPasscodeVersion === current,
    };
  }
}
