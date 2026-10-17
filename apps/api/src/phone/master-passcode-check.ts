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
//   new version has no wrong tries). **The wait holds only an address refused at the passcode
//   within the policy's longest wait** (ADR-541; the Phase 2 audit's F1): the passcode is one
//   value for the whole firm, so a wait that refused everybody would let one stranger keep every
//   supervisor out for days; the right passcode from anywhere else is taken. The lock holds
//   everybody. While it holds a caller the right passcode is refused too and nothing more is
//   written. Each wrong try and the lock are security events, naming the phone where the server
//   knows it. **Every admin is told by mail, where the firm has any, at the first wait** (so a
//   passcode under attack is known the same evening) **and at the lock**, since only an admin
//   can open it.
// - **Tries are taken one at a time** (ADR-541; F2): each reads the count the one before it
//   left, so a burst sent at once is counted try by try, never checked whole against one count.
// - **A right use is a security event** (`MASTER_PASSCODE_USE`), written by the act itself in
//   its own piece of work (`used`), naming the phone and whoever the act is about.
// - **The first right use of a version keys it and seals its offline seed** (ADR-542; the Phase 2
//   audit's F3), in that use's own piece of work: the installer makes the firm's first version
//   as a slow hash with no key, and only the API holds the password key and the sealing key, so
//   the API makes the keyed verifier and the seed a phone's check is made from once it has the
//   passcode in hand. The database lets each be written once that way and never again; a
//   version made in the back office is made keyed and sealed already (dispatch/master-passcode.ts).
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
import { InTurn } from '../sign-in/in-turn.ts';
import type { OfflineChecks } from './offline-checks.ts';
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
  // What its first right use writes to the version, where it isn't keyed or sealed yet: the keyed
  // verifier, and the offline seed (ADR-542). Both are made from the passcode just taken.
  readonly upgrade: {
    readonly from: string;
    readonly hash?: string;
    readonly offlineSeed?: string;
  };
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
  readonly offline: Pick<OfflineChecks, 'passcodeSeedOf'>;
  readonly mail: Mail;
  readonly clock: Clock;
  // The request the work now running is for, if any.
  readonly requestNow: () => string | undefined;
  // The address the request now running came from, at the passcode (process/limits.ts):
  // whether it was refused here within the policy's longest wait, so that its wait holds it
  // (outside a request, true: nothing unknown is let past a wait); and that it was refused now.
  readonly here: { readonly refusedLately: () => boolean; readonly refused: () => void };
}

export class MasterPasscodeCheck {
  private readonly db: Database;
  private readonly parts: MasterPasscodeCheckParts;
  private readonly turns = new InTurn();

  constructor(db: Database, parts: MasterPasscodeCheckParts) {
    this.db = db;
    this.parts = parts;
  }

  // Whether what was typed is the passcode in force, now. `deviceId`: the phone it was typed
  // on, where the server knows it (a phone being enrolled has none yet).
  check(passcode: string, now: Date, deviceId?: string): Promise<PasscodeChecked> {
    return this.turns.run(atThePasscode, () => this.checkNow(passcode, now, deviceId));
  }

  private async checkNow(passcode: string, now: Date, deviceId?: string): Promise<PasscodeChecked> {
    const { rules, hasher } = this.parts;
    const inForce = await this.db.$read((tx) =>
      tx.masterPasscode.findFirst({
        orderBy: { version: 'desc' },
        select: {
          version: true,
          hash: true,
          offlineSeed: true,
          tries: { select: { failedTries: true, lockedUntil: true } },
        },
      }),
    );
    if (inForce === null) return { taken: false, why: 'NO_PASSCODE' };
    const tried = inForce.tries ?? { failedTries: 0, lockedUntil: null };
    // A passcode that is locked, or waits for this caller: checked all the same, so that the
    // answer takes as long, and then refused whatever the check said. Nothing is written.
    if (
      rules.closedTo(tried.failedTries, tried.lockedUntil, now, this.parts.here.refusedLately())
    ) {
      await hasher.verify(passcode, inForce.hash);
      return { taken: false, why: rules.locked(tried.failedTries) ? 'LOCKED' : 'WAITING' };
    }
    if (!(await hasher.verify(passcode, inForce.hash))) {
      this.parts.here.refused();
      const locked = await this.wrong(inForce.version, now, deviceId);
      return { taken: false, why: locked ? 'LOCKED' : 'WRONG' };
    }
    return {
      taken: true,
      version: inForce.version,
      triedBefore: tried.failedTries > 0 || tried.lockedUntil !== null,
      upgrade: {
        from: inForce.hash,
        ...(hasher.keyedNow(inForce.hash) ? {} : { hash: await hasher.hash(passcode) }),
        ...(inForce.offlineSeed === null
          ? {
              offlineSeed: await this.parts.offline.passcodeSeedOf(inForce.version, passcode),
            }
          : {}),
      },
    };
  }

  // The right use, written with the act it opened, in that act's own piece of work: the count
  // of wrong tries starts again, and the use is a security event.
  async used(tx: Tx, taken: PasscodeTaken, now: Date, use: PasscodeUse): Promise<void> {
    // Each written only where it still stands as read: of two first uses at once, one writes it.
    const { from, hash, offlineSeed } = taken.upgrade;
    if (hash !== undefined) {
      await tx.masterPasscode.updateMany({
        where: { version: taken.version, hash: from },
        data: { hash },
      });
    }
    if (offlineSeed !== undefined) {
      await tx.masterPasscode.updateMany({
        where: { version: taken.version, offlineSeed: null },
        data: { offlineSeed },
      });
    }
    if (taken.triedBefore) {
      await tx.masterPasscodeTries.update({
        where: { version: taken.version },
        data: { failedTries: 0, lockedUntil: null },
      });
    }
    await this.event(tx, 'MASTER_PASSCODE_USE', now, use);
  }

  // One more wrong try at that version: counted, and a wait or the lock put on it (a wait never
  // shortened by a later try's). Whether it locked the passcode.
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
      return { after, firstWait: this.parts.rules.firstWait(failedTries), failedTries };
    });
    if (cost.firstWait) await this.tellAdmins('WAITING', cost.failedTries);
    if (cost.after.kind !== 'LOCKED') return false;
    await this.tellAdmins('LOCKED', cost.failedTries);
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
  // has mail; and each is told at the first wait, so a passcode being guessed is known before it
  // locks. A message that can't be sent undoes nothing: email is never required.
  private async tellAdmins(what: 'WAITING' | 'LOCKED', failedTries: number): Promise<void> {
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
      const paragraphs =
        what === 'LOCKED'
          ? [
              `${admin.name},`,
              'Your firm’s Open ADMS master passcode is locked: the wrong passcode was tried too many times in a row. Until it is changed no phone is enrolled with it and no monitor is created with it.',
              'Phones already enrolled keep working, and monitors sign in as before. To open it, an admin changes the master passcode in the back office; each enrolled phone takes the new one at its next sync.',
              'If the tries weren’t your firm’s, the passcode itself was not guessed: nothing was done with it.',
            ]
          : [
              `${admin.name},`,
              `Your firm’s Open ADMS master passcode was just entered wrong ${String(failedTries)} times in a row. Each address that tries it wrong now waits longer before it may try again; your supervisors elsewhere still use it as before.`,
              'If these tries weren’t your firm’s, somebody may be guessing it: change the master passcode in the back office, and tell your supervisors the new one. If it is guessed wrong many more times it locks until an admin changes it.',
            ];
      try {
        await this.parts.mail.send({
          to: admin.email,
          subject:
            what === 'LOCKED'
              ? 'Your firm’s master passcode is locked'
              : 'Your firm’s master passcode is being entered wrong',
          text: `${paragraphs.join('\n\n')}\n`,
        });
      } catch {
        // Nothing to undo.
      }
    }
  }
}
