// A sign-in made on a phone with no connection, taken once the phone has one (ARCHITECTURE §6,
// Device sessions; §7.2, §7.3; adms-field-app §4A.0 (6), (7); ADR-105, 443, 454, 462, 531).
// NIST SP 800-63B-4 §2.2, §5.1; OWASP ASVS 5.0 6.3.1, 7.2.1, 7.4.1, 16.3.1.
//
// The user, 2026-10-15: a phone syncs only while somebody is signed in on it, and a sign-in made
// offline counts "so long as you can still prove you are who you claim to be ... security is
// still the same once its online". So:
//
// - **The server never takes the phone's word for who signed in.** The phone sends a proof that
//   only what was typed could make (offline-checks.ts; the domain's `OfflineSignInRules`), and
//   the server checks it against what it keeps: the monitor's offline seed as kept now, or its
//   own hash of the master passcode in force. A password set anew since, or a passcode changed
//   since, makes it no proof: the monitor signs in online.
// - **The same rules as an online sign-in**: a phone in service; a monitor in service whose login
//   neither waits nor is locked; one monitor at a time on a phone, so any other session on it
//   ends. Taken, it is a session like any other, ending the firm's hours after the sign-in was
//   made (a temporary one under the passcode also with the project's day), written as the
//   monitor from that phone, or as the master passcode's actor where it was made under it.
// - **Taken once.** Its id is the phone's own and the database keeps one session of it: reported
//   again it is refused, and the monitor signs in online. A sign-in the server knows of on the
//   phone after it (online, offline or under the passcode) means it ended there: refused.
// - **Refused, somebody is told** (the user: "or else im telling someone"): one code to the
//   phone, the reason in the server's log by code, and a security event the back office is shown
//   (`OFFLINE_SIGN_IN_REFUSED`), naming the monitor and the phone. Nothing on the phone is lost:
//   its records wait there until somebody signed in sends them.
import { byDeviceKey, underMasterPasscode, type Database, type DeviceStatus } from '@open-adms/db';
import { OfflineSignInRules, type OfflineSignInKind } from '@open-adms/domain';

import { FirmSettings } from '../firm/firm-settings.ts';
import type { Clock } from '../setup/setup-service.ts';
import type { SessionTokens } from '../sign-in/session-tokens.ts';
import type { WrongTries } from '../sign-in/wrong-tries.ts';
import type { OfflineChecks } from './offline-checks.ts';
import type { PhoneAssignments } from './phone-assignments.ts';
import type { MonitorOnPhone } from './phone-sign-ins.ts';

// Why a sign-in made offline was not taken: for the server's log only. A phone is told one code.
export type OfflineSignInRefused =
  // The monitor is no monitor in service, or their login waits or is locked.
  | 'NOT_A_MONITOR'
  // The proof isn't one: made from no password or passcode the server keeps now.
  | 'NOT_PROVEN'
  // The session it would open has already run out.
  | 'RUN_OUT'
  // The server knows of a sign-in on the phone after it.
  | 'SUPERSEDED'
  // It was taken already.
  | 'ALREADY_TAKEN';

// A sign-in made offline, as the phone reported it.
export interface OfflineSignInReported {
  readonly id: string;
  readonly kind: OfflineSignInKind;
  readonly personId: string;
  readonly signedInAt: Date;
  readonly deviceUtcOffsetMinutes: number;
  readonly masterPasscodeVersion: number | null;
  readonly proof: string;
}

export type OfflineSignInOutcome =
  | ({
      readonly taken: true;
      readonly token: string;
      // How long it has left from now, in whole seconds.
      readonly expiresInSeconds: number;
    } & MonitorOnPhone)
  | { readonly taken: false; readonly why: OfflineSignInRefused | 'PHONE_OUT_OF_SERVICE' };

// The phone the call came from, as its proof's token read it now.
export interface ReportingPhone {
  readonly deviceId: string;
  readonly status: DeviceStatus;
}

export interface OfflineSignInsParts {
  readonly offline: Pick<OfflineChecks, 'signedWithSeed' | 'signedWithPasscode'>;
  readonly tokens: SessionTokens;
  readonly tries: Pick<WrongTries, 'closed'>;
  readonly assignments: PhoneAssignments;
  readonly clock: Clock;
  readonly requestNow: () => string | undefined;
}

const offlineSignIns = new OfflineSignInRules();

export class OfflineSignIns {
  private readonly db: Database;
  private readonly parts: OfflineSignInsParts;

  constructor(db: Database, parts: OfflineSignInsParts) {
    this.db = db;
    this.parts = parts;
  }

  async taken(
    phone: ReportingPhone,
    reported: OfflineSignInReported,
  ): Promise<OfflineSignInOutcome> {
    const { offline, tokens, tries, assignments, clock } = this.parts;
    if (phone.status !== 'ACTIVE') return { taken: false, why: 'PHONE_OUT_OF_SERVICE' };
    const now = clock.now();
    const underPasscode = offlineSignIns.underPasscode(reported.kind);
    const read = await this.db.$read(async (tx) => ({
      person: await tx.user.findFirst({
        where: { id: reported.personId, role: 'MONITOR', archivedAt: null },
        select: {
          id: true,
          name: true,
          monitorNumber: true,
          credential: {
            select: { offlineSeed: true, failedSignIns: true, lockedUntil: true },
          },
        },
      }),
      passcode: await tx.masterPasscode.findFirst({
        orderBy: { version: 'desc' },
        select: { version: true, hash: true },
      }),
      hours: (await FirmSettings.of(tx)).monitorSessionHours,
      taken: await tx.session.count({ where: { offlineSignInId: reported.id } }),
      later: await tx.session.count({
        where: {
          deviceId: phone.deviceId,
          OR: [
            { signedInAt: { gt: reported.signedInAt } },
            { signedInAt: null, createdAt: { gt: reported.signedInAt } },
          ],
        },
      }),
    }));
    const { person, passcode, hours } = read;
    const refused = async (why: OfflineSignInRefused): Promise<OfflineSignInOutcome> => {
      await this.told(phone.deviceId, person?.id ?? null, now);
      return { taken: false, why };
    };
    const kept = person?.credential;
    if (person?.monitorNumber == null || kept == null || tries.closed(kept)) {
      return refused('NOT_A_MONITOR');
    }
    if (read.taken > 0) return refused('ALREADY_TAKEN');
    const signed = offlineSignIns.signed({ ...reported, deviceId: phone.deviceId });
    const proven =
      underPasscode === null
        ? kept.offlineSeed !== null &&
          offline.signedWithSeed(person.id, kept.offlineSeed, signed, reported.proof)
        : passcode !== null &&
          reported.masterPasscodeVersion === passcode.version &&
          offline.signedWithPasscode(passcode.hash, signed, reported.proof);
    if (!proven) return refused('NOT_PROVEN');
    if (read.later > 0) return refused('SUPERSEDED');
    // A temporary session ends with the day of the project the phone takes for the monitor.
    const assignment =
      underPasscode === 'TEMPORARY'
        ? await assignments.taken(person.id, phone.deviceId, now)
        : undefined;
    const expiresAt = offlineSignIns.endsAt(
      reported.kind,
      reported.signedInAt,
      now,
      hours,
      assignment?.taken === true ? assignment.assignment.project.timeZone : undefined,
    );
    if (expiresAt <= now) return refused('RUN_OUT');
    const made = tokens.newRefresh();
    const requestId = this.parts.requestNow();
    const writer =
      underPasscode === null
        ? { actorId: person.id, source: 'DEVICE' as const, deviceId: phone.deviceId }
        : underMasterPasscode(phone.deviceId);
    const session = await this.db.$write(writer, async (tx) => {
      // One monitor at a time on a phone (ARCHITECTURE §7.2): whoever was signed in on it is
      // signed out.
      await tx.session.updateMany({
        where: { deviceId: phone.deviceId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.securityEvent.create({
        data: {
          kind: 'OFFLINE_SIGN_IN',
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
          masterPasscodeSession: underPasscode,
          offlineSignInId: reported.id,
          signedInAt: reported.signedInAt,
          signedInUtcOffsetMinutes: reported.deviceUtcOffsetMinutes,
          refreshTokenHash: made.hash,
          createdAt: now,
          expiresAt,
        },
        select: { id: true },
      });
    });
    return {
      taken: true,
      token: tokens.refresh(session.id, made.secret),
      sessionId: session.id,
      deviceId: phone.deviceId,
      userId: person.id,
      monitorNumber: person.monitorNumber,
      name: person.name,
      expiresAt,
      masterPasscodeSession: underPasscode,
      expiresInSeconds: Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
    };
  }

  // A sign-in made offline that the server could not take, as a security event the back office
  // is shown: written as the device key's actor on that phone, nobody having signed in.
  private async told(deviceId: string, userId: string | null, now: Date): Promise<void> {
    const requestId = this.parts.requestNow();
    await this.db.$write(byDeviceKey(deviceId), (tx) =>
      tx.securityEvent.create({
        data: {
          kind: 'OFFLINE_SIGN_IN_REFUSED',
          userId,
          deviceId,
          occurredAt: now,
          ...(requestId ? { requestId } : {}),
        },
      }),
    );
  }
}
