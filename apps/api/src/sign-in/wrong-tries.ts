// Wrong tries at a person's login, kept on their own sign-in record (ARCHITECTURE §6, Abuse;
// AC-10-18, 19; T-16; ADR-401, 409). The rule is the domain's (SignInTries); this writes what it
// says. The count and the wait are in the database, so they outlast a restart and are shared by
// every API process. Each wrong try at a real login is a security event, and so is the lock;
// while a login waits or is locked nothing more is written, so wrong tries can't grow the
// database past the lock itself.
//
// Nobody is signed in when a try fails, and every write states a person. The write is stated as
// the person whose login was tried: the row is theirs, and the event says the try failed, never
// that they made it (ADR-409). A try a phone made at a monitor's login (ADR-443) is written as a
// phone's write, naming that phone, and the security events name it too.
//
// **Tries at one login are taken one at a time** (`inTurn`; ADR-541, the Phase 2 audit's F2): a
// service reads the login's count, checks the guess and counts a wrong one inside its turn, so a
// burst sent at once is counted try by try and is refused unchecked once the login waits.
import type { Database } from '@open-adms/db';
import type { SignInTries, WrongTry } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import { InTurn } from './in-turn.ts';
import type { Mail } from './mail.ts';

export interface Tried {
  readonly failedSignIns: number;
  readonly lockedUntil: Date | null;
}

export interface TriedPerson {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
}

// The proven phone a try came from: a monitor's sign-in on a phone (ADR-443).
export interface TriedOn {
  readonly deviceId: string;
}

export interface WrongTriesParts {
  readonly rules: SignInTries;
  readonly clock: Clock;
  readonly mail: Mail;
  // The request the work now running is for, if any.
  readonly requestNow: () => string | undefined;
}

export class WrongTries {
  private readonly db: Database;
  private readonly parts: WrongTriesParts;
  private readonly turns = new InTurn();

  constructor(db: Database, parts: WrongTriesParts) {
    this.db = db;
    this.parts = parts;
  }

  // A try at one login, from reading its count to counting a wrong guess, once every earlier try
  // at it is over. `login` names it as it was typed (an address or a Monitor ID, as the service
  // compares it) or as a person's id where the caller is signed in.
  inTurn<T>(login: string, work: () => Promise<T>): Promise<T> {
    return this.turns.run(login, work);
  }

  // Whether the login may not be tried now: the right password is refused too.
  closed(kept: Tried): boolean {
    return this.parts.rules.closed(kept.failedSignIns, kept.lockedUntil, this.parts.clock.now());
  }

  // One more wrong try at the person's login: counted, and a wait or the lock put on it.
  async wrong(person: TriedPerson, on?: TriedOn): Promise<WrongTry> {
    const now = this.parts.clock.now();
    const requestId = this.parts.requestNow();
    const writer =
      on === undefined
        ? { actorId: person.id, source: 'BACK_OFFICE' as const }
        : { actorId: person.id, source: 'DEVICE' as const, deviceId: on.deviceId };
    const cost = await this.db.$write(writer, async (tx) => {
      const { failedSignIns } = await tx.userCredential.update({
        where: { userId: person.id },
        data: { failedSignIns: { increment: 1 } },
        select: { failedSignIns: true },
      });
      const after = this.parts.rules.after(failedSignIns, now);
      if (after.kind === 'WAIT') {
        await tx.userCredential.update({
          where: { userId: person.id },
          data: { lockedUntil: after.until },
        });
      }
      const event = {
        userId: person.id,
        occurredAt: now,
        ...(on === undefined ? {} : { deviceId: on.deviceId }),
        ...(requestId ? { requestId } : {}),
      };
      await tx.securityEvent.create({ data: { ...event, kind: 'SIGN_IN_FAILED' } });
      if (after.kind === 'LOCKED') {
        await tx.securityEvent.create({ data: { ...event, kind: 'LOCKOUT' } });
      }
      return after;
    });
    // A monitor has no reset by email, and no sign-in page that says so: an admin sets their
    // password anew. They aren't sent this message.
    if (cost.kind === 'LOCKED' && on === undefined) await this.tellLocked(person);
    return cost;
  }

  // The person is told their login is locked, where the firm has mail: a sign-in page says the
  // same thing to everybody, so this is how they learn it. Never required.
  private async tellLocked(person: TriedPerson): Promise<void> {
    if (!this.parts.mail.available || person.email === null) return;
    const paragraphs = [
      `${person.name},`,
      'Your Open ADMS login is locked: the wrong password was tried too many times in a row.',
      'To open it, reset your password from the sign-in page, or ask an admin of your firm to set you a new one.',
      'If the tries weren’t yours, tell an admin of your firm.',
    ];
    try {
      await this.parts.mail.send({
        to: person.email,
        subject: 'Your Open ADMS login is locked',
        text: `${paragraphs.join('\n\n')}\n`,
      });
    } catch {
      // A message that can't be sent undoes nothing.
    }
  }
}
