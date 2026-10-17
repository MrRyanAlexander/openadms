// The firm's master passcode, changed from the back office (ARCHITECTURE §7.5;
// spec/acceptance/02-people-and-devices.md AC-02-21, 22, 23; spec/acceptance/10-api-and-sync.md
// AC-10-24; BACKLOG C47, C89; ADR-106, 281, 403, 428). OWASP ASVS 5.0 6.3.7, 7.5.1.
//
// - **An admin changes it**, read as an admin inside the same piece of work (ADR-364). It opens
//   every phone, so whoever changes it gives their own password again: a session left open or
//   stolen is not enough. A wrong one counts as a wrong try at their login.
// - **A change is a new version.** The database lets the API add one and never remove one, nor
//   edit one but to key the installer's and seal its seed, once (ADR-542); only its keyed slow
//   hash and its sealed offline seed are kept, and the audit log holds neither. Each phone's
//   check moves to the new version at its next sync; until then a phone says which version it
//   holds.
// - **The rules are the domain's** (`MasterPasscodeRules`): 8 to 128 characters, never one known
//   from breaches; and never the one in force again.
// - **Every admin is told by mail**, where the firm has any, so a change nobody asked for is
//   noticed. The message never holds the passcode.
import type { Database } from '@open-adms/db';
import type { MasterPasscodeRules, PasswordProblemCode } from '@open-adms/domain';

import type { OfflineChecks } from '../phone/offline-checks.ts';
import type { Clock } from '../setup/setup-service.ts';
import type { Mail } from '../sign-in/mail.ts';
import type { PasswordHasher } from '../sign-in/password-hasher.ts';
import type { WrongTries } from '../sign-in/wrong-tries.ts';

export type PasscodeRefusalCode =
  PasswordProblemCode | 'NOT_ALLOWED' | 'PASSWORD_WRONG' | 'PASSWORD_UNCHANGED';

export type PasscodeOutcome =
  // `told`: how many admins were sent the message that it changed.
  | { readonly changed: true; readonly version: number; readonly told: number }
  // `message`: for a passcode the rules refuse, why, in plain words for whoever typed it.
  | { readonly changed: false; readonly code: PasscodeRefusalCode; readonly message?: string };

export interface MasterPasscodeParts {
  readonly rules: MasterPasscodeRules;
  readonly hasher: PasswordHasher;
  readonly offline: Pick<OfflineChecks, 'passcodeSeedOf'>;
  readonly tries: WrongTries;
  readonly mail: Mail;
  readonly clock: Clock;
}

const adminRead = { id: true, name: true, role: true, email: true, archivedAt: true } as const;

export class MasterPasscode {
  private readonly db: Database;
  private readonly parts: MasterPasscodeParts;

  constructor(db: Database, parts: MasterPasscodeParts) {
    this.db = db;
    this.parts = parts;
  }

  change(adminId: string, currentPassword: string, passcode: string): Promise<PasscodeOutcome> {
    return this.parts.tries.inTurn(`person ${adminId}`, () =>
      this.changeNow(adminId, currentPassword, passcode),
    );
  }

  private async changeNow(
    adminId: string,
    currentPassword: string,
    passcode: string,
  ): Promise<PasscodeOutcome> {
    const { hasher, rules, tries } = this.parts;
    const read = await this.db.$read(async (tx) => ({
      admin: await tx.user.findUnique({
        where: { id: adminId },
        select: {
          ...adminRead,
          credential: { select: { passwordHash: true, failedSignIns: true, lockedUntil: true } },
        },
      }),
      inForce: await tx.masterPasscode.findFirst({
        orderBy: { version: 'desc' },
        select: { hash: true },
      }),
    }));
    const { admin, inForce } = read;
    const kept = admin?.credential;
    if (admin?.role !== 'ADMIN' || admin.archivedAt !== null || kept?.passwordHash == null) {
      return { changed: false, code: 'NOT_ALLOWED' };
    }
    if (tries.closed(kept)) return { changed: false, code: 'PASSWORD_WRONG' };
    if (!(await hasher.verify(currentPassword, kept.passwordHash))) {
      await tries.wrong(admin);
      return { changed: false, code: 'PASSWORD_WRONG' };
    }
    const problem = rules.problem(passcode);
    if (problem !== undefined) {
      return { changed: false, code: problem.code, message: problem.message };
    }
    if (inForce !== null && (await hasher.verify(passcode, inForce.hash))) {
      return { changed: false, code: 'PASSWORD_UNCHANGED' };
    }
    // Keyed, and its offline seed sealed for the version it will be (ADR-542). Two admins
    // changing it at one moment: the second's version is already kept, and the database's own key
    // refuses it, answered plainly (process/database-refusal.ts).
    const next = (
      await this.db.$read((tx) => tx.masterPasscode.aggregate({ _max: { version: true } }))
    )._max.version;
    const version = (next ?? 0) + 1;
    const hash = await hasher.hash(passcode);
    const offlineSeed = await this.parts.offline.passcodeSeedOf(version, passcode);
    const made = await this.db.$write(
      { actorId: adminId, source: 'BACK_OFFICE' },
      async (tx): Promise<number | undefined> => {
        const still = await tx.user.findUnique({ where: { id: adminId }, select: adminRead });
        if (still?.role !== 'ADMIN' || still.archivedAt !== null) return undefined;
        const created = await tx.masterPasscode.create({
          data: { version, hash, offlineSeed },
          select: { version: true },
        });
        return created.version;
      },
    );
    if (made === undefined) return { changed: false, code: 'NOT_ALLOWED' };
    return { changed: true, version: made, told: await this.tellAdmins(admin.name) };
  }

  // A message that can't be sent undoes nothing: email is never required.
  private async tellAdmins(by: string): Promise<number> {
    if (!this.parts.mail.available) return 0;
    const admins = await this.db.$read((tx) =>
      tx.user.findMany({
        where: { role: 'ADMIN', archivedAt: null, email: { not: null } },
        select: { name: true, email: true },
        orderBy: { id: 'asc' },
      }),
    );
    let told = 0;
    for (const admin of admins) {
      if (admin.email === null) continue;
      const paragraphs = [
        `${admin.name},`,
        `Your firm’s Open ADMS master passcode was just changed by ${by}. Each phone takes the new one at its next sync; until then a phone still answers to the old one.`,
        'If no admin of your firm meant to change it, change it again now and end that admin’s sessions.',
      ];
      try {
        await this.parts.mail.send({
          to: admin.email,
          subject: 'Your firm’s Open ADMS master passcode was changed',
          text: `${paragraphs.join('\n\n')}\n`,
        });
        told += 1;
      } catch {
        // Nothing to undo.
      }
    }
    return told;
  }
}
