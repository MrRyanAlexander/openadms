// A session on a phone opened under the firm's master passcode, with a connection (ARCHITECTURE
// §6, Device sessions, Abuse; §7.2, §7.3, §7.5; spec/acceptance/02-people-and-devices.md
// AC-02-42; adms-field-app §4A.0 (7), (8); BACKLOG 2.5.4, C113, C114, C122, C123; ADR-095, 105,
// 106, 120, 438, 443, 456 (3)(d), (5)(d), 462). NIST SP 800-63B-4 §3.2.2 and its session
// chapter; OWASP ASVS 5.0 6.3.1, 7.2.4, 7.4.1, 16.3.1.
//
// - **Two things open it: the phone and the passcode.** The call comes from an enrolled phone
//   that has proved itself with its device key, and carries the master passcode, checked by the
//   one check every act under it shares (master-passcode-check.ts): a wrong one counts on the
//   same record as at enrolment, and a passcode that waits or is locked is refused here too.
// - **It authenticates nobody.** Whoever holds the passcode is not known, and the monitor it is
//   for gave no secret of their own: outside what NIST SP 800-63B calls a session (ADR-456
//   (3)(d)). So the session is **marked** with how it was opened, written as the master
//   passcode's own actor on that phone (the database lets nobody else write a marked one, and
//   lets that actor write no unmarked one), and its use is a security event naming the phone
//   and the monitor.
// - **Two ways** (the domain's `masterPasscodeSessions`): as the phone's monitor, the passcode
//   in place of their password; or the temporary session for a monitor picked from the roster.
//   The server holds neither against the board: the phone says which it was, as it says what
//   was set up on it (ADR-458 (5)).
// - **When it ends is the domain's** (`PasscodeSessionRules`): neither outlasts a monitor's own
//   sign-in, and a temporary one also ends with the day of the project whose assignment the
//   phone takes. Read on every request as any session on a phone is (`PhoneSignIns.onPhone`).
// - **One monitor at a time on a phone**: it ends any other session on the phone, as a
//   monitor's own sign-in does.
// - **A phone in service, for a monitor in service.** A phone out of service is told so before
//   the passcode is touched; a person who is no monitor in service, after it was taken, so only
//   somebody who holds the passcode learns it.
import { underMasterPasscode, type Database, type DeviceStatus } from '@open-adms/db';
import type { MasterPasscodeSessionKind, PasscodeSessionRules } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { SessionTokens } from '../sign-in/session-tokens.ts';
import type { MasterPasscodeCheck, PasscodeRefused } from './master-passcode-check.ts';
import type { AssignmentAtSignIn, PhoneAssignments } from './phone-assignments.ts';
import type { MonitorOnPhone } from './phone-sign-ins.ts';

export type PasscodeSessionOutcome =
  | ({
      readonly opened: true;
      readonly token: string;
      readonly masterPasscodeSession: MasterPasscodeSessionKind;
      // How long it lasts from now, in whole seconds.
      readonly expiresInSeconds: number;
      // The assignment the phone takes, or why it took none.
      readonly assignment: AssignmentAtSignIn;
    } & MonitorOnPhone)
  | {
      readonly opened: false;
      // The passcode's four are for the server's log only: a caller is never told which.
      readonly why: PasscodeRefused | 'PHONE_OUT_OF_SERVICE' | 'NOT_A_MONITOR';
    };

export interface PasscodeSessionToOpen {
  readonly personId: string;
  readonly kind: MasterPasscodeSessionKind;
  readonly passcode: string;
}

// The phone the call came from, as its proof's token read it now.
export interface OpeningPhone {
  readonly deviceId: string;
  readonly status: DeviceStatus;
}

export interface PasscodeSessionsParts {
  readonly passcode: MasterPasscodeCheck;
  readonly tokens: SessionTokens;
  readonly rules: PasscodeSessionRules;
  readonly assignments: PhoneAssignments;
  readonly clock: Clock;
}

export class PasscodeSessions {
  private readonly db: Database;
  private readonly parts: PasscodeSessionsParts;

  constructor(db: Database, parts: PasscodeSessionsParts) {
    this.db = db;
    this.parts = parts;
  }

  async open(phone: OpeningPhone, asked: PasscodeSessionToOpen): Promise<PasscodeSessionOutcome> {
    const { passcode, tokens, rules, assignments, clock } = this.parts;
    // Before the passcode is touched: a phone out of service never spends its count.
    if (phone.status !== 'ACTIVE') return { opened: false, why: 'PHONE_OUT_OF_SERVICE' };
    const now = clock.now();
    const checked = await passcode.check(asked.passcode, now, phone.deviceId);
    if (!checked.taken) return { opened: false, why: checked.why };
    const person = await this.db.$read((tx) =>
      tx.user.findFirst({
        where: { id: asked.personId, role: 'MONITOR', archivedAt: null },
        select: { id: true, name: true, monitorNumber: true },
      }),
    );
    if (person?.monitorNumber == null) return { opened: false, why: 'NOT_A_MONITOR' };
    const { monitorNumber } = person;
    // Read first: a temporary session ends with the day of the project the phone takes.
    const assignment = await assignments.taken(person.id, phone.deviceId, now);
    const expiresAt = rules.endsAt(
      asked.kind,
      now,
      assignment.taken ? assignment.assignment.project.timeZone : undefined,
    );
    const made = tokens.newRefresh();
    const session = await this.db.$write(underMasterPasscode(phone.deviceId), async (tx) => {
      // One monitor at a time on a phone (ARCHITECTURE §7.2): whoever was signed in on it is
      // signed out.
      await tx.session.updateMany({
        where: { deviceId: phone.deviceId, revokedAt: null },
        data: { revokedAt: now },
      });
      // A right passcode starts the count again, and its use is a security event.
      await passcode.used(tx, checked, now, { deviceId: phone.deviceId, userId: person.id });
      return tx.session.create({
        data: {
          userId: person.id,
          deviceId: phone.deviceId,
          masterPasscodeSession: asked.kind,
          refreshTokenHash: made.hash,
          createdAt: now,
          expiresAt,
        },
        select: { id: true },
      });
    });
    return {
      opened: true,
      token: tokens.refresh(session.id, made.secret),
      sessionId: session.id,
      deviceId: phone.deviceId,
      userId: person.id,
      monitorNumber,
      name: person.name,
      expiresAt,
      masterPasscodeSession: asked.kind,
      expiresInSeconds: Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
      assignment,
    };
  }
}
