// A monitor signs in on a phone, online (ARCHITECTURE §6, Device sessions, Abuse; §7.2;
// spec/acceptance/02-people-and-devices.md AC-02-39; spec/acceptance/10-api-and-sync.md
// AC-10-18, 19, 32; spec/THREAT-MODEL.md T-14, T-16; BACKLOG 2.5.2, C90, C112, C113; ADR-105,
// 120, 134, 409, 417, 440, 441, 443). NIST SP 800-63B-4 §2.2, §3.1.1.2, §3.2.2, §5.1; OWASP
// ASVS 5.0 6.1.1, 6.3.1, 6.3.3, 7.2.2…7.2.4, 7.3.1, 7.3.2, 7.4.1, 7.4.2.
//
// - **Two things open it: the phone and the monitor's own ID and password.** The call comes from
//   an enrolled phone that has proved itself with its device key (the factor the firm holds),
//   and carries the monitor's Monitor ID and password. Neither opens anything alone: a back-
//   office sign-in refuses a monitor (sessions.ts), and the database lets a monitor's session be
//   opened only on a phone (ADR-443's guard).
// - **A phone in service only** (ADR-441 (6)(c)). One taken out of service still proves itself
//   and hands over its work (ADR-134); it signs nobody in, and is told so before the password is
//   read, so its try is never a wrong try.
// - **Wrong tries follow everybody's rule and numbers** (ADR-441 (6)(a); the domain's
//   `SignInTries`): a wait from the fifth in a row, a lock at the fiftieth until an admin sets
//   the password anew. Each is counted on the monitor's own sign-in record and is a security
//   event naming the phone. Whatever is wrong, the caller is told the same thing in about the
//   same time.
// - **The session is a row** (ADR-443): the monitor and the phone, ending the firm's hours after
//   the sign-in whatever is asked of it (its settings record, 24 as shipped from
//   `MONITOR_SESSION_HOURS`, ADR-531), and never for quiet (ADR-441 (6)(b)). Its token is the session's id and 32 random bytes; the server keeps only their
//   SHA-256. One monitor at a time on a phone: a sign-in ends any other on it.
// - **Read on every request** (`onPhone`): an archived monitor, a password set anew (it ends their
//   sessions), a sign-out, another monitor signed in on the phone, and a revoked key (the phone's
//   own proof is read first) each stop it at once. A session opened under the master passcode
//   (passcode-sessions.ts; ADR-462) is read the same way, and says that it is one.
// - **Written as the monitor, from that phone**: the session, the reset count and the event;
//   and their offline seed where they have none yet (offline-checks.ts; ADR-454), since a
//   phone's login-list entry for them is made from it.
// - **The phone takes the monitor's assignment** (ADR-240, 444; AC-02-35): a sign-in is answered
//   their assignment for the day, read by phone-assignments.ts, or why the phone took none. A
//   monitor with none is signed in all the same (ADR-441 (6)(d)).
import { randomBytes } from 'node:crypto';

import type { Database, DeviceStatus } from '@open-adms/db';
import type { MasterPasscodeSessionKind } from '@open-adms/domain';

import { FirmSettings } from '../firm/firm-settings.ts';
import type { Clock } from '../setup/setup-service.ts';
import type { PasswordHasher } from '../sign-in/password-hasher.ts';
import type { SessionTokens } from '../sign-in/session-tokens.ts';
import type { WrongTries } from '../sign-in/wrong-tries.ts';
import type { OfflineChecks } from './offline-checks.ts';
import type { AssignmentAtSignIn, PhoneAssignments } from './phone-assignments.ts';

// Why a sign-in was refused: for the server's log only. A caller is never told which, but for a
// phone taken out of service, which is told apart before the password is read.
export type PhoneSignInRefused = 'NOBODY' | 'WRONG' | 'WAITING' | 'LOCKED';

// The monitor signed in on a phone, as the database has them now.
export interface MonitorOnPhone {
  readonly sessionId: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly monitorNumber: string;
  readonly name: string;
  readonly expiresAt: Date;
  // How the session was opened where it was opened under the master passcode
  // (passcode-sessions.ts; ADR-462); null on the monitor's own sign-in.
  readonly masterPasscodeSession: MasterPasscodeSessionKind | null;
}

export type PhoneSignInOutcome =
  | ({
      readonly signedIn: true;
      readonly token: string;
      // The assignment the phone takes, or why it took none.
      readonly assignment: AssignmentAtSignIn;
    } & MonitorOnPhone)
  | { readonly signedIn: false; readonly why: PhoneSignInRefused | 'PHONE_OUT_OF_SERVICE' };

// The phone the call came from, as its proof's token read it now.
export interface SigningInPhone {
  readonly deviceId: string;
  readonly status: DeviceStatus;
}

export interface PhoneSignInsParts {
  readonly tokens: SessionTokens;
  readonly hasher: PasswordHasher;
  readonly offline: Pick<OfflineChecks, 'seedOf' | 'stale'>;
  readonly tries: WrongTries;
  readonly assignments: PhoneAssignments;
  readonly clock: Clock;
  readonly requestNow: () => string | undefined;
}

export class PhoneSignIns {
  private readonly db: Database;
  private readonly parts: PhoneSignInsParts;
  // What a try at no real login is checked against, so that it takes as long as a real one.
  private decoy: Promise<string> | undefined;

  constructor(db: Database, parts: PhoneSignInsParts) {
    this.db = db;
    this.parts = parts;
  }

  async signIn(
    phone: SigningInPhone,
    monitorNumber: string,
    password: string,
  ): Promise<PhoneSignInOutcome> {
    const { tokens, hasher, offline, tries, assignments, clock, requestNow } = this.parts;
    // Before the password is read: a phone out of service never spends a monitor's count.
    if (phone.status !== 'ACTIVE') return { signedIn: false, why: 'PHONE_OUT_OF_SERVICE' };
    const person = await this.named(monitorNumber);
    const kept = person?.credential;
    if (person === undefined || kept?.passwordHash == null) {
      await this.spend(password);
      return { signedIn: false, why: 'NOBODY' };
    }
    // A login that waits or is locked: nothing is checked and nothing is written.
    if (tries.closed(kept)) {
      await this.spend(password);
      return {
        signedIn: false,
        why: kept.lockedUntil !== null && kept.lockedUntil > clock.now() ? 'WAITING' : 'LOCKED',
      };
    }
    const on = { deviceId: phone.deviceId };
    if (!(await hasher.verify(password, kept.passwordHash))) {
      const cost = await tries.wrong(person, on);
      return { signedIn: false, why: cost.kind === 'LOCKED' ? 'LOCKED' : 'WRONG' };
    }
    // Made again where it has no key or was made under settings since raised.
    const passwordHash = hasher.stale(kept.passwordHash) ? await hasher.hash(password) : undefined;
    // Their offline seed, where there is none yet, this process can't open it, or the hash is
    // made again (a seed never outlives its hash): what a phone's login list is made from.
    const offlineSeed =
      passwordHash !== undefined || offline.stale(person.id, kept.offlineSeed)
        ? await offline.seedOf(person.id, password)
        : undefined;
    const now = clock.now();
    const hours = await this.db.$read((tx) => FirmSettings.monitorSessionHours(tx));
    const expiresAt = new Date(now.getTime() + hours * 3_600_000);
    const made = tokens.newRefresh();
    const requestId = requestNow();
    const session = await this.db.$write(
      { actorId: person.id, source: 'DEVICE', deviceId: phone.deviceId },
      async (tx) => {
        if (kept.failedSignIns > 0 || kept.lockedUntil !== null || offlineSeed !== undefined) {
          await tx.userCredential.update({
            where: { userId: person.id },
            data: {
              failedSignIns: 0,
              lockedUntil: null,
              ...(passwordHash === undefined ? {} : { passwordHash }),
              ...(offlineSeed === undefined ? {} : { offlineSeed }),
            },
          });
        }
        // One monitor at a time on a phone (ARCHITECTURE §7.2): whoever was signed in on it is
        // signed out.
        await tx.session.updateMany({
          where: { deviceId: phone.deviceId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.securityEvent.create({
          data: {
            kind: 'SIGN_IN',
            userId: person.id,
            deviceId: phone.deviceId,
            occurredAt: now,
            ...(requestId ? { requestId } : {}),
          },
        });
        return tx.session.create({
          data: {
            userId: person.id,
            deviceId: phone.deviceId,
            refreshTokenHash: made.hash,
            createdAt: now,
            expiresAt,
          },
          select: { id: true },
        });
      },
    );
    return {
      signedIn: true,
      token: tokens.refresh(session.id, made.secret),
      sessionId: session.id,
      deviceId: phone.deviceId,
      userId: person.id,
      monitorNumber: person.monitorNumber,
      name: person.name,
      expiresAt,
      masterPasscodeSession: null,
      assignment: await assignments.taken(person.id, phone.deviceId, now),
    };
  }

  // The monitor signed in on the phone by that token, read now; undefined when the token isn't a
  // session of that phone's, or the session has ended, or its monitor may no longer sign in.
  async onPhone(deviceId: string, token: string | undefined): Promise<MonitorOnPhone | undefined> {
    const read = this.parts.tokens.readRefresh(token);
    if (read === undefined) return undefined;
    const now = this.parts.clock.now();
    const row = await this.db.$read((tx) =>
      tx.session.findUnique({
        where: { id: read.sessionId },
        select: {
          id: true,
          deviceId: true,
          refreshTokenHash: true,
          expiresAt: true,
          revokedAt: true,
          masterPasscodeSession: true,
          user: {
            select: { id: true, name: true, role: true, monitorNumber: true, archivedAt: true },
          },
        },
      }),
    );
    if (row?.deviceId !== deviceId) return undefined;
    if (!this.parts.tokens.sameHash(read.hash, row.refreshTokenHash)) return undefined;
    if (row.revokedAt !== null || row.expiresAt <= now) return undefined;
    const { user } = row;
    if (user.role !== 'MONITOR' || user.archivedAt !== null || user.monitorNumber === null) {
      return undefined;
    }
    return {
      sessionId: row.id,
      deviceId,
      userId: user.id,
      monitorNumber: user.monitorNumber,
      name: user.name,
      expiresAt: row.expiresAt,
      masterPasscodeSession: row.masterPasscodeSession,
    };
  }

  // The monitor signs out: their session ends. Written as them, from that phone.
  async signOut(monitor: MonitorOnPhone): Promise<void> {
    const now = this.parts.clock.now();
    await this.db.$write(
      { actorId: monitor.userId, source: 'DEVICE', deviceId: monitor.deviceId },
      (tx) =>
        tx.session.updateMany({
          where: { id: monitor.sessionId, revokedAt: null },
          data: { revokedAt: now },
        }),
    );
  }

  // How long a sign-in that ends then has left, in whole seconds, now.
  secondsLeft(until: Date): number {
    return Math.max(0, Math.ceil((until.getTime() - this.parts.clock.now().getTime()) / 1000));
  }

  // The one monitor in service with that Monitor ID, compared whole, as the system writes it.
  private async named(monitorNumber: string) {
    const typed = monitorNumber.trim().toUpperCase();
    const person = await this.db.$read((tx) =>
      tx.user.findFirst({
        where: { monitorNumber: typed, role: 'MONITOR', archivedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          monitorNumber: true,
          credential: {
            select: {
              passwordHash: true,
              offlineSeed: true,
              failedSignIns: true,
              lockedUntil: true,
            },
          },
        },
      }),
    );
    if (person?.monitorNumber == null) return undefined;
    return { ...person, monitorNumber: person.monitorNumber };
  }

  // The work of checking a password, done for a try that can't succeed.
  private async spend(password: string): Promise<void> {
    this.decoy ??= this.parts.hasher.hash(randomBytes(24).toString('base64url'));
    await this.parts.hasher.verify(password, await this.decoy);
  }
}
