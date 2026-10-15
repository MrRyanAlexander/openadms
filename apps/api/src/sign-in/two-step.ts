// Two-step sign-in (ARCHITECTURE §6; spec/acceptance/02-people-and-devices.md AC-02-14, 74;
// spec/acceptance/10-api-and-sync.md AC-10-26; spec/THREAT-MODEL.md T-14, T-16; ADR-170, 412).
// NIST SP 800-63B-4 §3.1.4, §3.1.5, §3.2.2; OWASP ASVS 5.0 §6.4.4, §6.5.
//
// - **Checking a code** (`TwoStepCheck`): the person's sealed secret is opened, and the code is
//   taken in when it is the one of a step the domain's rule allows now. Sign-in keeps the step,
//   so the same code, or an older one, is never taken again.
// - **Setting it up** (`TwoStep.begin`, `confirm`): the signed-in person is handed a new secret
//   for their app and proves the app has it with a code. Nothing is kept before that, so a setup
//   left half done leaves nobody locked out. Their other sessions end.
// - **An admin clears it** (`clearByAdmin`) for somebody who lost the phone that held it: the
//   secret goes, the person's sessions end, they set one up again at their next sign-in, and it
//   is a security event. Never one's own: one who lost it can't be told from a stranger by the
//   server.
// - **A person removes their own** (`removeOwn`, ADR-530; C91) with a code from it, good once,
//   a wrong one a wrong try at their login as at sign-in: the secret goes, their other sessions
//   end, it is a security event. Whoever's role needs one sets the next one up before anything
//   else, so replacing an authenticator is removing it and setting the next one up.
//
// Setting up and clearing are each told to the person by email where the firm has mail, so that
// one they didn't make is noticed.
import type { Database } from '@open-adms/db';
import { actorOnly, type TwoStepNeed, type TwoStepRules } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { Mail } from './mail.ts';
import type { OneTimeCodes } from './one-time-codes.ts';
import type { Sessions } from './sessions.ts';
import type { TwoStepSecrets } from './two-step-secrets.ts';
import type { WrongTries } from './wrong-tries.ts';

export class TwoStepCheck {
  readonly rules: TwoStepRules;
  readonly codes: OneTimeCodes;
  readonly secrets: TwoStepSecrets;

  constructor(rules: TwoStepRules, codes: OneTimeCodes, secrets: TwoStepSecrets) {
    this.rules = rules;
    this.codes = codes;
    this.secrets = secrets;
  }

  need(role: string, viewersRequired: boolean): TwoStepNeed {
    return this.rules.need(role, viewersRequired);
  }

  // Whether a person of that role may have a second step at all, whatever the firm requires.
  offered(role: string): boolean {
    return this.rules.need(role, false) !== 'NONE';
  }

  // The step of the code, when it is one this person's authenticator shows now and none at or
  // after it was taken before; undefined for any other.
  taken(
    userId: string,
    kept: string,
    code: string,
    lastTaken: number | null,
    now: Date,
  ): number | undefined {
    const typed = this.rules.typed(code);
    const secret = this.secrets.open(userId, kept);
    if (typed === undefined || secret === undefined) return undefined;
    return this.codes.stepOf(secret, typed, this.rules.stepsTaken(now, lastTaken));
  }
}

export type SetupBegun =
  | {
      readonly begun: true;
      // For the person's app: as text to type, and as the address a QR code holds.
      readonly secret: string;
      readonly uri: string;
      // Sent back with the first code.
      readonly setup: string;
      readonly expiresAt: Date;
    }
  | { readonly begun: false; readonly code: 'NOT_FOUND' | 'TWO_STEP_ALREADY_SET_UP' };

export type SetupConfirmed =
  | { readonly confirmed: true; readonly told: boolean }
  | {
      readonly confirmed: false;
      readonly code: 'NOT_FOUND' | 'TWO_STEP_ALREADY_SET_UP' | 'TWO_STEP_REFUSED';
    };

export type TwoStepCleared =
  | { readonly cleared: true; readonly told: boolean }
  | {
      readonly cleared: false;
      readonly code: 'NOT_ALLOWED' | 'NOT_FOUND' | 'TWO_STEP_NOT_SET_UP';
    };

export type TwoStepRemoved =
  | { readonly removed: true; readonly told: boolean }
  | {
      readonly removed: false;
      readonly code: 'NOT_FOUND' | 'TWO_STEP_NOT_SET_UP' | 'TWO_STEP_REFUSED';
    };

export interface TwoStepParts {
  readonly check: TwoStepCheck;
  readonly clock: Clock;
  readonly mail: Mail;
  readonly sessions: Pick<Sessions, 'endAll'>;
  // A code that isn't the authenticator's is a wrong try at the login (ADR-530).
  readonly tries: Pick<WrongTries, 'wrong' | 'closed'>;
  // The request the work now running is for, if any.
  readonly requestNow: () => string | undefined;
}

interface Told {
  readonly name: string;
  readonly email: string | null;
}

const personRead = {
  id: true,
  name: true,
  role: true,
  email: true,
  archivedAt: true,
  credential: {
    select: { twoStepSecret: true, twoStepLastStep: true, failedSignIns: true, lockedUntil: true },
  },
} as const;

export class TwoStep {
  private readonly db: Database;
  private readonly parts: TwoStepParts;

  constructor(db: Database, parts: TwoStepParts) {
    this.db = db;
    this.parts = parts;
  }

  // A new secret for the signed-in person's authenticator app. Nothing is written.
  async begin(userId: string): Promise<SetupBegun> {
    const person = await this.db.$read((tx) =>
      tx.user.findUnique({ where: { id: userId }, select: personRead }),
    );
    if (person?.archivedAt !== null || !this.parts.check.offered(person.role)) {
      return { begun: false, code: 'NOT_FOUND' };
    }
    if (person.credential?.twoStepSecret != null) {
      return { begun: false, code: 'TWO_STEP_ALREADY_SET_UP' };
    }
    const { codes, secrets, rules } = this.parts.check;
    const secret = codes.newSecret();
    const expiresAt = rules.setupEnds(this.parts.clock.now());
    return {
      begun: true,
      secret: codes.base32(secret),
      uri: codes.uri(secret, person.email ?? person.name),
      setup: secrets.setup(userId, secret, expiresAt),
      expiresAt,
    };
  }

  // The person proves their app has the secret: it is kept, sealed, with the step of this code,
  // so the code that set it up is never also a sign-in. Their other sessions end.
  async confirm(
    userId: string,
    sessionId: string,
    setup: string,
    code: string,
  ): Promise<SetupConfirmed> {
    const now = this.parts.clock.now();
    const { codes, secrets, rules } = this.parts.check;
    const secret = secrets.readSetup(userId, setup, now);
    const typed = rules.typed(code);
    const step =
      secret === undefined || typed === undefined
        ? undefined
        : codes.stepOf(secret, typed, rules.stepsTaken(now, null));
    if (secret === undefined || step === undefined) {
      return { confirmed: false, code: 'TWO_STEP_REFUSED' };
    }
    const requestId = this.parts.requestNow();
    const outcome = await this.db.$write(
      { actorId: userId, source: 'BACK_OFFICE' },
      async (tx): Promise<{ refused: SetupConfirmed } | { person: Told }> => {
        const person = await tx.user.findUnique({ where: { id: userId }, select: personRead });
        if (person?.archivedAt !== null || !this.parts.check.offered(person.role)) {
          return { refused: { confirmed: false, code: 'NOT_FOUND' } };
        }
        // Only where there is none: of two confirmations, one finds it kept already.
        const { count } = await tx.userCredential.updateMany({
          where: { userId, twoStepSecret: null },
          data: { twoStepSecret: secrets.seal(userId, secret), twoStepLastStep: step },
        });
        if (count !== 1) {
          return { refused: { confirmed: false, code: 'TWO_STEP_ALREADY_SET_UP' } };
        }
        await tx.securityEvent.create({
          data: {
            kind: 'TWO_STEP_SET_UP',
            userId,
            occurredAt: now,
            ...(requestId ? { requestId } : {}),
          },
        });
        await this.parts.sessions.endAll(tx, userId, sessionId);
        return { person };
      },
    );
    if ('refused' in outcome) return outcome.refused;
    return {
      confirmed: true,
      told: await this.tell(
        outcome.person,
        'An authenticator was set up for your Open ADMS login',
        [
          'An authenticator app was just set up for your Open ADMS login: signing in now takes its code as well as your password.',
          'If you didn’t set it up, tell an admin of your firm now.',
        ],
      ),
    };
  }

  // An admin clears another person's authenticator (AC-10-26). Who is an admin is read here,
  // inside the same piece of work (ADR-364).
  async clearByAdmin(adminId: string, userId: string): Promise<TwoStepCleared> {
    const now = this.parts.clock.now();
    const requestId = this.parts.requestNow();
    const outcome = await this.db.$write(
      { actorId: adminId, source: 'BACK_OFFICE' },
      async (tx): Promise<{ refused: TwoStepCleared } | { person: Told }> => {
        const admin = await tx.user.findUnique({ where: { id: adminId }, select: personRead });
        if (admin?.role !== 'ADMIN' || admin.archivedAt !== null || adminId === userId) {
          return { refused: { cleared: false, code: 'NOT_ALLOWED' } };
        }
        const person = await tx.user.findUnique({ where: { id: userId }, select: personRead });
        if (person?.archivedAt !== null || actorOnly(person.role)) {
          return { refused: { cleared: false, code: 'NOT_FOUND' } };
        }
        const { count } = await tx.userCredential.updateMany({
          where: { userId, twoStepSecret: { not: null } },
          data: { twoStepSecret: null, twoStepLastStep: null },
        });
        if (count !== 1) return { refused: { cleared: false, code: 'TWO_STEP_NOT_SET_UP' } };
        await tx.securityEvent.create({
          data: {
            kind: 'TWO_STEP_CLEARED',
            userId,
            occurredAt: now,
            ...(requestId ? { requestId } : {}),
          },
        });
        await this.parts.sessions.endAll(tx, userId);
        return { person };
      },
    );
    if ('refused' in outcome) return outcome.refused;
    return {
      cleared: true,
      told: await this.tell(
        outcome.person,
        'The authenticator of your Open ADMS login was cleared',
        [
          'An admin of your firm just cleared the authenticator of your Open ADMS login. You were signed out everywhere.',
          'If your login needs one, you set a new one up the next time you sign in.',
          'If you didn’t ask for this, tell an admin of your firm now.',
        ],
      ),
    };
  }

  // The signed-in person removes their own authenticator, giving a code from it. The code is
  // taken as at sign-in (a step allowed now, after the last one taken); a wrong one, or any while
  // the login waits or is locked, is refused, and a wrong one counts. Their other sessions end.
  async removeOwn(userId: string, sessionId: string, code: string): Promise<TwoStepRemoved> {
    const now = this.parts.clock.now();
    const person = await this.db.$read((tx) =>
      tx.user.findUnique({ where: { id: userId }, select: personRead }),
    );
    const kept = person?.credential;
    if (person?.archivedAt !== null || kept == null) return { removed: false, code: 'NOT_FOUND' };
    if (kept.twoStepSecret === null) return { removed: false, code: 'TWO_STEP_NOT_SET_UP' };
    if (this.parts.tries.closed(kept)) return { removed: false, code: 'TWO_STEP_REFUSED' };
    const step = this.parts.check.taken(
      userId,
      kept.twoStepSecret,
      code,
      kept.twoStepLastStep,
      now,
    );
    if (step === undefined) {
      await this.parts.tries.wrong(person);
      return { removed: false, code: 'TWO_STEP_REFUSED' };
    }
    const requestId = this.parts.requestNow();
    const removed = await this.db.$write(
      { actorId: userId, source: 'BACK_OFFICE' },
      async (tx): Promise<boolean> => {
        // Only the secret the code was taken against: of two removals, one finds it gone.
        const { count } = await tx.userCredential.updateMany({
          where: { userId, twoStepSecret: kept.twoStepSecret },
          data: { twoStepSecret: null, twoStepLastStep: null },
        });
        if (count !== 1) return false;
        await tx.securityEvent.create({
          data: {
            kind: 'TWO_STEP_CLEARED',
            userId,
            occurredAt: now,
            ...(requestId ? { requestId } : {}),
          },
        });
        await this.parts.sessions.endAll(tx, userId, sessionId);
        return true;
      },
    );
    if (!removed) return { removed: false, code: 'TWO_STEP_NOT_SET_UP' };
    return {
      removed: true,
      told: await this.tell(person, 'The authenticator of your Open ADMS login was removed', [
        'You just removed the authenticator of your Open ADMS login, giving a code from it. Your other sessions were ended.',
        'If your login needs one, you set a new one up before anything else.',
        'If you didn’t do this, tell an admin of your firm now.',
      ]),
    };
  }

  // A message that can't be sent never undoes or refuses anything: email is never required.
  private async tell(person: Told, subject: string, said: readonly string[]): Promise<boolean> {
    if (!this.parts.mail.available || person.email === null) return false;
    try {
      await this.parts.mail.send({
        to: person.email,
        subject,
        text: `${[`${person.name},`, ...said].join('\n\n')}\n`,
      });
      return true;
    } catch {
      return false;
    }
  }
}
