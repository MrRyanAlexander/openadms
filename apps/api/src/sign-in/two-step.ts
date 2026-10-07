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
//   is a security event. Never one's own: a person who still has their authenticator has
//   nothing to clear, and one who lost it can't be told from a stranger by the server.
//
// Setting up and clearing are each told to the person by email where the firm has mail, so that
// one they didn't make is noticed.
import type { Database } from '@open-adms/db';
import type { TwoStepNeed, TwoStepRules } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { Mail } from './mail.ts';
import type { OneTimeCodes } from './one-time-codes.ts';
import type { Sessions } from './sessions.ts';
import type { TwoStepSecrets } from './two-step-secrets.ts';

export class TwoStepCheck {
  readonly rules: TwoStepRules;
  readonly codes: OneTimeCodes;
  readonly secrets: TwoStepSecrets;

  constructor(rules: TwoStepRules, codes: OneTimeCodes, secrets: TwoStepSecrets) {
    this.rules = rules;
    this.codes = codes;
    this.secrets = secrets;
  }

  need(role: string): TwoStepNeed {
    return this.rules.need(role);
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

export interface TwoStepParts {
  readonly check: TwoStepCheck;
  readonly clock: Clock;
  readonly mail: Mail;
  readonly sessions: Pick<Sessions, 'endAll'>;
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
  credential: { select: { twoStepSecret: true } },
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
    if (person?.archivedAt !== null || this.parts.check.need(person.role) === 'NONE') {
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
        if (person?.archivedAt !== null || this.parts.check.need(person.role) === 'NONE') {
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
        if (person?.archivedAt !== null || person.role === 'SYSTEM') {
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
