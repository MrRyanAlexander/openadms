// A use of the firm's master passcode a phone logged with no connection, received from that
// phone (ARCHITECTURE §7's notes, §7.2, §7.3, §7.5, §10; adms-field-app §4A.0 (7), (8);
// spec/acceptance/02-people-and-devices.md AC-02-23, 42, 46; BACKLOG 2.5.4, C46, C122…C125;
// ADR-100, 106, 438, 456 (3), (5)(e), 457, 462, 464; REQ-202b, 209). OWASP ASVS 5.0 16.2.1,
// 16.2.2, 16.3.1, 16.3.3.
//
// - **Only what no other report carries** (the domain's `loggedPasscodeUses`): the phone passed
//   to a monitor who has their own assignment, a session opened on the phone under the
//   passcode, and a wrong try at it. A setup, a move and a switch that made an assignment
//   arrive as that assignment (unplanned-assignments.ts), with their own events.
// - **The phone's word, and its device key's.** The phone checked the passcode against its own
//   check; the server is never sent it here. So nothing here counts toward the server's own
//   wrong tries or opens its lock (ADR-456 (5)(e)): a wrong try a phone logged is kept as a
//   security event and moves no count.
// - **Written as the master passcode's own actor, on that phone** (ADR-438); the database lets
//   a security event a phone reported be written by nobody else, and only naming that phone.
// - **Kept as reported** (flag, never block): for a monitor archived since and from a phone out
//   of service. It is not saved only where it names somebody who is no monitor.
// - **The id is the phone's**, on the first security event of the use, so a report sent again
//   is answered "already saved" and nothing is written twice. Two of one report at the same
//   moment: the database keeps one and refuses the other (409), which sent again is saved.
// - **Three times**: the phone's instant (`occurredAt`), its clock's offset, and when the
//   server wrote it (`createdAt`).
// - **A session opened on the phone has no row here**: the server gave it no token and it opens
//   no call. The use itself says which way it was opened.
// - **One monitor at a time** (ARCHITECTURE §7.2; ADR-462): a switch or a session saved ends
//   every session on the phone that isn't that monitor's and was opened before it, by the
//   phone's clock. One opened since stands; a wrong try ends none.
import { underMasterPasscode, type Database, type Prisma } from '@open-adms/db';
import {
  PasscodeLogRules,
  type LoggedPasscodeUse,
  type LoggedPasscodeUseRefusal,
} from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';

type Tx = Prisma.TransactionClient;

// A use of the passcode as its phone reports it.
export interface ReportedPasscodeUse {
  readonly id: string;
  readonly use: LoggedPasscodeUse;
  // The monitor it was for; null for a wrong try.
  readonly personId: string | null;
  // The phone's clock when it logged it, and how far that clock stood from UTC, in minutes.
  readonly loggedAt: Date;
  readonly deviceUtcOffsetMinutes: number;
}

export type PasscodeUseReceived =
  | { readonly answer: 'SAVED' | 'ALREADY_SAVED' }
  | { readonly answer: 'NOT_SAVED'; readonly reason: LoggedPasscodeUseRefusal };

export interface PasscodeUsesParts {
  readonly clock: Clock;
  // The request the work now running is for, if any.
  readonly requestNow: () => string | undefined;
}

export class PasscodeUses {
  private readonly rules = new PasscodeLogRules();
  private readonly db: Database;
  private readonly parts: PasscodeUsesParts;

  constructor(db: Database, parts: PasscodeUsesParts) {
    this.db = db;
    this.parts = parts;
  }

  // What the phone that proved itself reported: kept once, or why it can't be kept.
  async received(deviceId: string, reported: ReportedPasscodeUse): Promise<PasscodeUseReceived> {
    return this.db.$write(underMasterPasscode(deviceId), (tx) => this.kept(tx, deviceId, reported));
  }

  // Everything is asked before anything is written.
  private async kept(
    tx: Tx,
    deviceId: string,
    reported: ReportedPasscodeUse,
  ): Promise<PasscodeUseReceived> {
    const held = await tx.securityEvent.findUnique({
      where: { id: reported.id },
      select: { deviceId: true, deviceUtcOffsetMinutes: true },
    });
    if (held !== null) {
      const answer = this.rules.reportedAgain(held, deviceId);
      return answer === 'ALREADY_SAVED' ? { answer } : { answer: 'NOT_SAVED', reason: answer };
    }
    const { personId } = reported;
    if (personId !== null) {
      const person = await tx.user.findUnique({ where: { id: personId }, select: { role: true } });
      if (!this.rules.mayBeFor(person)) return { answer: 'NOT_SAVED', reason: 'NOT_A_MONITOR' };
    }
    const requestId = this.parts.requestNow();
    // The first of them takes the phone's id: it is what a report sent again is known by.
    for (const [nth, event] of this.rules.securityEventsOf(reported.use).entries()) {
      await tx.securityEvent.create({
        data: {
          ...(nth === 0 ? { id: reported.id } : {}),
          ...event,
          ...(personId === null ? {} : { userId: personId }),
          deviceId,
          occurredAt: reported.loggedAt,
          deviceUtcOffsetMinutes: reported.deviceUtcOffsetMinutes,
          ...(requestId ? { requestId } : {}),
        },
        select: { id: true },
      });
    }
    if (personId !== null && this.rules.endsEarlierSessions(reported.use)) {
      await tx.session.updateMany({
        where: {
          deviceId,
          revokedAt: null,
          userId: { not: personId },
          createdAt: { lt: reported.loggedAt },
        },
        data: { revokedAt: this.parts.clock.now() },
      });
    }
    return { answer: 'SAVED' };
  }
}
