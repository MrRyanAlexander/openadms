// A phone enrolled under the firm's master passcode (ARCHITECTURE §6, Abuse; §7.1, §7.4, §7.5;
// spec/acceptance/02-people-and-devices.md AC-02-15, 16, 18; spec/acceptance/10-api-and-sync.md
// AC-10-22, 44; spec/THREAT-MODEL.md §5 (4); BACKLOG C45, C88, C110; ADR-106, 240, 401,
// 436…439). NIST SP 800-63B-4 §3.1.1.2, §3.1.6, §3.2.2; OWASP ASVS 5.0 6.1.1, 6.3.1.
//
// - **Nobody is signed in.** The passcode opens enrolment, and whoever holds it is not known:
//   every write here is stated as the master passcode's own actor, for a phone (ADR-438), never
//   as an admin or a monitor who may not have done it.
// - **The passcode is checked against the version in force**, kept only as its slow hash.
//   Whatever is wrong, the caller is told the same thing in about the same time.
// - **Wrong tries follow sign-in's rule and numbers** (the domain's `MasterPasscodeTries`),
//   counted in the database against that version: a wait from the policy's first count, twice
//   as long each time; at its second count enrolment is locked until an admin changes the
//   passcode (a new version has no wrong tries). While it waits or is locked the right passcode
//   is refused too and nothing more is written. Each wrong try and the lock are security
//   events; at the lock every admin is told by mail, where the firm has any, since only an
//   admin can open it.
// - **The server keeps the public half of the phone's key only**, written one way
//   (`DeviceKeys.kept`), and never what was sent. One key, one phone: a key already held is the
//   database's refusal.
// - **A right use is a security event** (`MASTER_PASSCODE_USE`) naming the phone, written with
//   the phone in the same piece of work.
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
import type { DeviceKeys } from './device-keys.ts';

type Tx = Prisma.TransactionClient;

// Why an enrolment was refused: for the server's log only, but for the key. A caller is never
// told which of the first four it was.
export type EnrolmentRefused = 'NO_PASSCODE' | 'WRONG' | 'WAITING' | 'LOCKED' | 'KEY_REFUSED';

export type EnrolmentOutcome =
  | { readonly enrolled: true; readonly deviceId: string; readonly masterPasscodeVersion: number }
  | { readonly enrolled: false; readonly why: EnrolmentRefused };

export interface PhoneToEnrol {
  // What the dispatch board will call it.
  readonly name: string;
  readonly passcode: string;
  // As the phone sent it: base64 SubjectPublicKeyInfo.
  readonly publicKey: string;
}

export interface EnrolmentParts {
  readonly rules: MasterPasscodeTries;
  readonly hasher: PasswordHasher;
  readonly keys: DeviceKeys;
  readonly mail: Mail;
  readonly clock: Clock;
  // The request the work now running is for, if any.
  readonly requestNow: () => string | undefined;
}

export class Enrolment {
  private readonly db: Database;
  private readonly parts: EnrolmentParts;

  constructor(db: Database, parts: EnrolmentParts) {
    this.db = db;
    this.parts = parts;
  }

  async enrol(phone: PhoneToEnrol): Promise<EnrolmentOutcome> {
    const { rules, hasher, keys, clock } = this.parts;
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
    if (inForce === null) return { enrolled: false, why: 'NO_PASSCODE' };
    const now = clock.now();
    const tried = inForce.tries ?? { failedTries: 0, lockedUntil: null };
    // A passcode that waits or is locked: checked all the same, so that the answer takes as
    // long, and then refused whatever the check said. Nothing is written.
    if (rules.closed(tried.failedTries, tried.lockedUntil, now)) {
      await hasher.verify(phone.passcode, inForce.hash);
      return { enrolled: false, why: rules.locked(tried.failedTries) ? 'LOCKED' : 'WAITING' };
    }
    if (!(await hasher.verify(phone.passcode, inForce.hash))) {
      const locked = await this.wrong(inForce.version, now);
      return { enrolled: false, why: locked ? 'LOCKED' : 'WRONG' };
    }
    const publicKey = keys.kept(phone.publicKey);
    if (publicKey === undefined) return { enrolled: false, why: 'KEY_REFUSED' };
    // The phone's id is made first, so that every record of this piece of work says which
    // phone it was done on.
    const deviceId = await this.db.$read((tx) => this.newId(tx));
    await this.db.$write(underMasterPasscode(deviceId), async (tx) => {
      await tx.device.create({
        data: {
          id: deviceId,
          name: phone.name,
          publicKey,
          masterPasscodeVersion: inForce.version,
          enrolledAt: now,
        },
      });
      // A right passcode starts the count again.
      if (tried.failedTries > 0 || tried.lockedUntil !== null) {
        await tx.masterPasscodeTries.update({
          where: { version: inForce.version },
          data: { failedTries: 0, lockedUntil: null },
        });
      }
      await this.event(tx, 'MASTER_PASSCODE_USE', now, deviceId);
    });
    return { enrolled: true, deviceId, masterPasscodeVersion: inForce.version };
  }

  // One more wrong try at that version: counted, and a wait or the lock put on it. Whether it
  // locked the passcode.
  private async wrong(version: number, now: Date): Promise<boolean> {
    const cost = await this.db.$write(underMasterPasscode(), async (tx) => {
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
      await this.event(tx, 'MASTER_PASSCODE_FAILED', now);
      if (after.kind === 'LOCKED') await this.event(tx, 'MASTER_PASSCODE_LOCKOUT', now);
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
    deviceId?: string,
  ): Promise<void> {
    const requestId = this.parts.requestNow();
    await tx.securityEvent.create({
      data: {
        kind,
        occurredAt,
        ...(deviceId === undefined ? {} : { deviceId }),
        ...(requestId ? { requestId } : {}),
      },
    });
  }

  // An id as the database makes them, in time order.
  private async newId(tx: Tx): Promise<string> {
    const [made] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
    if (made === undefined) throw new Error('The database made no id.');
    return made.id;
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
        'Enrolling a phone with your firm’s Open ADMS master passcode is locked: the wrong passcode was tried too many times in a row.',
        'Phones already enrolled keep working. To enrol another, an admin changes the master passcode in the back office; each enrolled phone takes the new one at its next sync.',
        'If the tries weren’t your firm’s, the passcode itself was not guessed: nothing was enrolled.',
      ];
      try {
        await this.parts.mail.send({
          to: admin.email,
          subject: 'Enrolling a phone with your firm’s master passcode is locked',
          text: `${paragraphs.join('\n\n')}\n`,
        });
      } catch {
        // Nothing to undo.
      }
    }
  }
}
