// Setting a password (ARCHITECTURE §6, Passwords, §7.0; spec/acceptance/10-api-and-sync.md
// AC-10-20, 24, 25; spec/THREAT-MODEL.md T-16, T-43; ADR-170, 402…405). A password is checked by
// the domain's rules, then kept only as its slow hash on the person's sign-in record
// (`user_credential`, read by the API alone); the database audits the change with its actor and
// never holds the hash in the audit log.
//
// Two ways, and email is never required (ADR-170):
// - **An admin sets it**, for a person who has none yet or forgot theirs. Who is an admin is read
//   here, inside the same piece of work (ADR-364).
// - **The person resets it by email**, where the firm has a mail server: a message to the address
//   the firm holds for them carries a code, good once and for a short time, and the person sets
//   the new password with it. The change is written as that person: holding the code is their
//   proof. It signs nobody in and clears no second step (ASVS 6.4.3).
//
// - **The person changes their own**, signed in, giving the one they have (ASVS 6.2.2, 6.2.3).
//
// A password an admin set is known to that admin. So it is marked, and its owner sets their own
// at their next sign-in before they may do anything else (ADR-410). A password set anew, any of
// the three ways, opens a login that wrong tries had locked and ends the person's sessions (their
// own change keeps the one it was made in): whoever held a stolen session, or the old password,
// is out (ASVS 7.4.3).
//
// Either way the person is told by email where there is mail and they have an address (NIST SP
// 800-63B-4 §4.6). A monitor never resets by email: their password is the firm's practice
// (ADR-105), set by whoever holds the master passcode or by an admin.
import type { Database, Prisma } from '@open-adms/db';
import { actorOnly, type PasswordProblemCode, type PasswordRules } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { Mail } from './mail.ts';
import type { PasswordHasher } from './password-hasher.ts';
import type { ResetCodes } from './reset-codes.ts';
import type { Sessions } from './sessions.ts';
import type { Limits } from '../process/limits.ts';
import type { OfflineChecks } from '../phone/offline-checks.ts';
import type { WrongTries } from './wrong-tries.ts';

type Tx = Prisma.TransactionClient;

export type PasswordRefusalCode =
  | PasswordProblemCode
  // Whoever asked may not set another person's password.
  | 'NOT_ALLOWED'
  // Nobody with a login has that id.
  | 'NOT_FOUND'
  | 'RESET_REFUSED'
  | 'NO_MAIL'
  // Changing one's own: the current password given is wrong, or the new one is the same.
  | 'PASSWORD_WRONG'
  | 'PASSWORD_UNCHANGED';

export type PasswordOutcome =
  // `told`: whether the person was sent the message that their password changed.
  | { readonly set: true; readonly told: boolean }
  // `message`: for a password the rules refuse, why, in plain words for whoever is setting it.
  | { readonly set: false; readonly code: PasswordRefusalCode; readonly message?: string };

export type ResetAsked =
  // `sent` is for the server's own log; a caller is never told it.
  | { readonly asked: true; readonly sent: boolean }
  | { readonly asked: false; readonly code: 'NO_MAIL' };

export interface PasswordParts {
  readonly rules: PasswordRules;
  readonly hasher: PasswordHasher;
  readonly resetCodes: ResetCodes;
  readonly mail: Mail;
  readonly clock: Clock;
  // How long a reset is good for, in minutes, as the message says it.
  readonly resetMinutes: number;
  readonly sessions: Pick<Sessions, 'endAll'>;
  readonly tries: WrongTries;
  // A password set anew starts the count of what each address was refused at the login again.
  readonly limits: Pick<Limits, 'setAnew'>;
  // A monitor's offline seed is made with their password (ADR-454).
  readonly offline: Pick<OfflineChecks, 'seedOf'>;
}

// Who may reset their own password by email: a back-office or outside user. Never a monitor, and
// never the system actor, which is no login at all (ADR-273).
const resetsByEmail = ['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER'] as const;

interface Person {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly email: string | null;
  readonly monitorNumber: string | null;
}

const personRead = {
  id: true,
  name: true,
  role: true,
  email: true,
  monitorNumber: true,
  archivedAt: true,
} as const;

export class Passwords {
  private readonly db: Database;
  private readonly parts: PasswordParts;

  constructor(db: Database, parts: PasswordParts) {
    this.db = db;
    this.parts = parts;
  }

  // An admin sets a person's password: a new person's first, or one forgotten (AC-10-25).
  async setByAdmin(adminId: string, userId: string, password: string): Promise<PasswordOutcome> {
    const outcome = await this.db.$write(
      { actorId: adminId, source: 'BACK_OFFICE' },
      async (tx): Promise<{ refused: PasswordOutcome } | { person: Person }> => {
        const admin = await tx.user.findUnique({ where: { id: adminId }, select: personRead });
        if (admin?.role !== 'ADMIN' || admin.archivedAt !== null) {
          return { refused: { set: false, code: 'NOT_ALLOWED' } };
        }
        const person = await tx.user.findUnique({ where: { id: userId }, select: personRead });
        if (person?.archivedAt !== null || actorOnly(person.role)) {
          return { refused: { set: false, code: 'NOT_FOUND' } };
        }
        // Known to the admin who typed it, so its owner sets their own at their next sign-in. A
        // monitor's is the firm's practice (ADR-105), and never signs in here.
        const refused = await this.keep(tx, person, password, {
          changeRequired: person.id !== adminId && person.role !== 'MONITOR',
        });
        return refused === undefined ? { person } : { refused };
      },
    );
    if ('refused' in outcome) return outcome.refused;
    return { set: true, told: await this.tell(outcome.person) };
  }

  // The signed-in person sets a new password, giving the one they have. A wrong current one
  // counts as a wrong try at their login, so a stolen session can't be used to guess it.
  async changeOwn(
    userId: string,
    sessionId: string,
    current: string,
    password: string,
  ): Promise<PasswordOutcome> {
    const person = await this.db.$read((tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: {
          ...personRead,
          credential: { select: { passwordHash: true, failedSignIns: true, lockedUntil: true } },
        },
      }),
    );
    const kept = person?.credential;
    if (person?.archivedAt !== null || kept?.passwordHash == null) {
      return { set: false, code: 'NOT_FOUND' };
    }
    if (this.parts.tries.closed(kept)) return { set: false, code: 'PASSWORD_WRONG' };
    if (!(await this.parts.hasher.verify(current, kept.passwordHash))) {
      await this.parts.tries.wrong(person);
      return { set: false, code: 'PASSWORD_WRONG' };
    }
    if (await this.parts.hasher.verify(password, kept.passwordHash)) {
      return { set: false, code: 'PASSWORD_UNCHANGED' };
    }
    const refused = await this.db.$write({ actorId: userId, source: 'BACK_OFFICE' }, (tx) =>
      this.keep(tx, person, password, { changeRequired: false, keepSession: sessionId }),
    );
    if (refused !== undefined) return refused;
    return { set: true, told: await this.tell(person) };
  }

  // Somebody asks for a reset to be sent to an address. Nothing is written. A message goes out
  // only when exactly one person who may reset by email has that address: where two share one,
  // the server can't know whose password is meant, and an admin sets it instead.
  async requestReset(email: string): Promise<ResetAsked> {
    if (!this.parts.mail.available) return { asked: false, code: 'NO_MAIL' };
    // Compared here, whole and without regard to capitals, never as a pattern in the database.
    const typed = email.trim().toLowerCase();
    const people = (
      await this.db.$read((tx) =>
        tx.user.findMany({
          where: { email: { not: null }, archivedAt: null, role: { in: [...resetsByEmail] } },
          select: {
            id: true,
            name: true,
            email: true,
            credential: { select: { passwordHash: true } },
          },
        }),
      )
    ).filter((held) => held.email?.trim().toLowerCase() === typed);
    const [person, another] = people;
    if (person?.email == null || another !== undefined) return { asked: true, sent: false };
    const code = this.parts.resetCodes.make(
      person.id,
      person.credential?.passwordHash ?? null,
      this.parts.clock.now(),
    );
    const sent = await this.send(person.email, 'Reset your Open ADMS password', [
      `${person.name},`,
      'Somebody asked to reset the password of your Open ADMS login. If it was you, enter this code where you asked for the reset, with your new password:',
      code,
      `The code is good once, for ${String(this.parts.resetMinutes)} minutes. Your second sign-in step, if you have one, is unchanged.`,
      'If it wasn’t you, do nothing: your password stays as it is.',
    ]);
    return { asked: true, sent };
  }

  // The person sets a new password with the code their message carried.
  async completeReset(code: string, password: string): Promise<PasswordOutcome> {
    const named = this.parts.resetCodes.read(code, this.parts.clock.now());
    if (named === undefined) return { set: false, code: 'RESET_REFUSED' };
    const outcome = await this.db.$write(
      { actorId: named.userId, source: 'BACK_OFFICE' },
      async (tx): Promise<{ refused: PasswordOutcome } | { person: Person }> => {
        const person = await tx.user.findUnique({
          where: { id: named.userId },
          select: { ...personRead, credential: { select: { passwordHash: true } } },
        });
        const now = person?.credential?.passwordHash ?? null;
        if (
          person?.archivedAt !== null ||
          !resetsByEmail.some((role) => role === person.role) ||
          !this.parts.resetCodes.signedOver(code, named, now)
        ) {
          return { refused: { set: false, code: 'RESET_REFUSED' } };
        }
        const refused = await this.keep(tx, person, password, { changeRequired: false });
        return refused === undefined ? { person } : { refused };
      },
    );
    if ('refused' in outcome) return outcome.refused;
    return { set: true, told: await this.tell(outcome.person) };
  }

  // Checks the password for this person and keeps its hash, and nothing else of it. The count of
  // wrong tries starts again, a lock opens, and the person's sessions end (all but `keepSession`).
  private async keep(
    tx: Tx,
    person: Person,
    password: string,
    how: { readonly changeRequired: boolean; readonly keepSession?: string },
  ): Promise<PasswordOutcome | undefined> {
    const problem = this.parts.rules.problem(password, {
      monitor: person.role === 'MONITOR',
      words: [person.name, person.email, person.monitorNumber],
    });
    if (problem !== undefined) return { set: false, code: problem.code, message: problem.message };
    const passwordHash = await this.parts.hasher.hash(password);
    // A monitor's offline seed is made anew with the password, so no phone's login-list entry
    // made from the old one is good at the next read; nobody else has one.
    const offlineSeed =
      person.role === 'MONITOR' ? await this.parts.offline.seedOf(person.id, password) : null;
    await tx.userCredential.upsert({
      where: { userId: person.id },
      create: {
        userId: person.id,
        passwordHash,
        offlineSeed,
        passwordChangeRequired: how.changeRequired,
      },
      update: {
        passwordHash,
        offlineSeed,
        passwordChangeRequired: how.changeRequired,
        failedSignIns: 0,
        lockedUntil: null,
      },
    });
    await this.parts.sessions.endAll(tx, person.id, how.keepSession);
    this.parts.limits.setAnew(person.email);
    return undefined;
  }

  // Tells the person their password changed, so that a change they didn't make is noticed.
  private async tell(person: Person): Promise<boolean> {
    if (!this.parts.mail.available || person.email === null) return false;
    return this.send(person.email, 'Your Open ADMS password was changed', [
      `${person.name},`,
      'The password of your Open ADMS login was just changed.',
      'If you didn’t change it or ask for it, tell an admin of your firm now.',
    ]);
  }

  // A message that can't be sent never undoes or refuses anything: email is never required.
  private async send(to: string, subject: string, paragraphs: readonly string[]): Promise<boolean> {
    try {
      await this.parts.mail.send({ to, subject, text: `${paragraphs.join('\n\n')}\n` });
      return true;
    } catch {
      return false;
    }
  }
}
