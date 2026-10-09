// The firm's master passcode, checked for an act done under it (ARCHITECTURE §6, Abuse; §7.5;
// spec/acceptance/10-api-and-sync.md AC-10-22; spec/THREAT-MODEL.md §5 (4); BACKLOG C111;
// ADR-106, 401, 438, 439, 442). NIST SP 800-63B-4 §3.1.1.2, §3.2.2; OWASP ASVS 5.0 6.1.1, 6.3.1.
// One check for every such act (a phone enrolled, a monitor created on a phone), so that wrong
// tries wherever they are made count on the one record of the version in force.
//
// - **The passcode is checked against the version in force**, kept only as its slow hash.
//   Whatever is wrong, the caller is told the same thing in about the same time.
// - **Wrong tries follow sign-in's rule and numbers** (the domain's `MasterPasscodeTries`),
//   counted in the database against that version: a wait from the policy's first count, twice
//   as long each time; at its second count the passcode is locked until an admin changes it (a
//   new version has no wrong tries). While it waits or is locked the right passcode is refused
//   too and nothing more is written. Each wrong try and the lock are security events, naming
//   the phone where the server knows it; at the lock every admin is told by mail, where the
//   firm has any, since only an admin can open it.
// - **A right use is a security event** (`MASTER_PASSCODE_USE`), written by the act itself in
//   its own piece of work (`used`), naming the phone and whoever the act is about.
// - **Whoever holds the passcode is not known**: every write here is stated as the master
//   passcode's own actor (ADR-438), never as a person.
import {
  underMasterPasscode,
  type Database,
  type Prisma,
  type SecurityEventKind,
} from '@open-adms/db';
import type { MasterPasscodeTries } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { Mail } from '../sign-in/mail.ts';
import type { PasswordHasher } from '../sign-in/password-hasher.ts';

type Tx = Prisma.TransactionClient;

// What the rate limits count an address's wrong tries at the master passcode under, as they
// count them at a login: no email address, so no person's login can be the same.
export const atThePasscode = 'the master passcode';

// Why the passcode wasn't taken: for the server's log only. A caller is never told which.
export type PasscodeRefused = 'NO_PASSCODE' | 'WRONG' | 'WAITING' | 'LOCKED';

// A passcode that was taken: its version, and what the act writes back with its own work.
export interface PasscodeTaken {
  readonly taken: true;
  readonly version: number;
  // Whether wrong tries stand against the version, for the right use to start the count again.
  readonly triedBefore: boolean;
}

export type PasscodeChecked =
  PasscodeTaken | { readonly taken: false; readonly why: PasscodeRefused };

// Who a use of the passcode is about: the phone it was done on, and the person it made or was
// for. Never who did it: that is not known.
export interface PasscodeUse {
  readonly deviceId: string;
  readonly userId?: string;
}

export interface MasterPasscodeCheckParts {
  readonly rules: MasterPasscodeTries;
  readonly hasher: PasswordHasher;
  readonly mail: Mail;
  readonly clock: Clock;
  // The request the work now running is for, if any.
  readonly requestNow: () => string | undefined;
}

export class MasterPasscodeCheck {
  private readonly db: Database;
  private readonly parts: MasterPasscodeCheckParts;

  constructor(db: Database, parts: MasterPasscodeCheckParts) {
    this.db = db;
    this.parts = parts;
  }

  // Whether what was typed is the passcode in force, now. `deviceId`: the phone it was typed
  // on, where the server knows it (a phone being enrolled has none yet).
  async check(passcode: string, now: Date, deviceId?: string): Promise<PasscodeChecked> {
    const { rules, hasher } = this.parts;
    const inForce = await this.db.$read((tx) =>
      tx.masterPasscode.findFirst({
        orderBy: { version: 'desc' },
        select: {
          version: true,
          hash: true,
          tries: { select: { failedTries: true, lockedUntil: true } },
        },
      }),
    );
    if (inForce === null) return { taken: false, why: 'NO_PASSCODE' };
    const tried = inForce.tries ?? { failedTries: 0, lockedUntil: null };
    // A passcode that waits or is locked: checked all the same, so that the answer takes as
    // long, and then refused whatever the check said. Nothing is written.
    if (rules.closed(tried.failedTries, tried.lockedUntil, now)) {
      await hasher.verify(passcode, inForce.hash);
      return { taken: false, why: rules.locked(tried.failedTries) ? 'LOCKED' : 'WAITING' };
    }
    if (!(await hasher.verify(passcode, inForce.hash))) {
      const locked = await this.wrong(inForce.version, now, deviceId);
      return { taken: false, why: locked ? 'LOCKED' : 'WRONG' };
    }
    return {
      taken: true,
      version: inForce.version,
      triedBefore: tried.failedTries > 0 || tried.lockedUntil !== null,
    };
  }

  // The right use, written with the act it opened, in that act's own piece of work: the count
  // of wrong tries starts again, and the use is a security event.
  async used(tx: Tx, taken: PasscodeTaken, now: Date, use: PasscodeUse): Promise<void> {
    if (taken.triedBefore) {
      await tx.masterPasscodeTries.update({
        where: { version: taken.version },
        data: { failedTries: 0, lockedUntil: null },
      });
    }
    await this.event(tx, 'MASTER_PASSCODE_USE', now, use);
  }

  // One more wrong try at that version: counted, and a wait or the lock put on it. Whether it
  // locked the passcode.
  private async wrong(version: number, now: Date, deviceId?: string): Promise<boolean> {
    const on = deviceId === undefined ? {} : { deviceId };
    const cost = await this.db.$write(underMasterPasscode(deviceId), async (tx) => {
      const { failedTries } = await tx.masterPasscodeTries.upsert({
        where: { version },
        create: { version, failedTries: 1 },
        update: { failedTries: { increment: 1 } },
        select: { failedTries: true },
      });
      const after = this.parts.rules.after(failedTries, now);
      if (after.kind === 'WAIT') {
        await tx.masterPasscodeTries.update({
          where: { version },
          data: { lockedUntil: after.until },
        });
      }
      await this.event(tx, 'MASTER_PASSCODE_FAILED', now, on);
      if (after.kind === 'LOCKED') await this.event(tx, 'MASTER_PASSCODE_LOCKOUT', now, on);
      return after;
    });
    if (cost.kind !== 'LOCKED') return false;
    await this.tellAdmins();
    return true;
  }

  private async event(
    tx: Tx,
    kind: SecurityEventKind,
    occurredAt: Date,
    about: Partial<PasscodeUse>,
  ): Promise<void> {
    const requestId = this.parts.requestNow();
    await tx.securityEvent.create({
      data: {
        kind,
        occurredAt,
        ...(about.deviceId === undefined ? {} : { deviceId: about.deviceId }),
        ...(about.userId === undefined ? {} : { userId: about.userId }),
        ...(requestId ? { requestId } : {}),
      },
    });
  }

  // Only an admin can open the lock, by changing the passcode, so each is told where the firm
  // has mail. A message that can't be sent undoes nothing: email is never required.
  private async tellAdmins(): Promise<void> {
    if (!this.parts.mail.available) return;
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
        'Your firm’s Open ADMS master passcode is locked: the wrong passcode was tried too many times in a row. Until it is changed no phone is enrolled with it and no monitor is created with it.',
        'Phones already enrolled keep working, and monitors sign in as before. To open it, an admin changes the master passcode in the back office; each enrolled phone takes the new one at its next sync.',
        'If the tries weren’t your firm’s, the passcode itself was not guessed: nothing was done with it.',
      ];
      try {
        await this.parts.mail.send({
          to: admin.email,
          subject: 'Your firm’s master passcode is locked',
          text: `${paragraphs.join('\n\n')}\n`,
        });
      } catch {
        // Nothing to undo.
      }
    }
  }
}
