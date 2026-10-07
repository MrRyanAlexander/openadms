// What only somebody on the firm's own server can do (ARCHITECTURE §6, Authorization: "the last
// admin can't be removed or locked out"; AC-02-13; ADR-409 (5), 412 (9), 413 (2), 414 (2), 415):
//
// - **Make the first admin.** The installer seeds nobody who can sign in, and only an admin
//   creates people: so the first one is made here, once, while the firm has no admin.
// - **Let an admin back in.** An admin whose login wrong tries locked, who forgot their password
//   in a firm with no mail, or who lost the phone that held their authenticator, and has no other
//   admin to ask: their password is set anew here and, if asked, their authenticator cleared, so
//   they set one up again at their next sign-in.
//
// It is run by `pnpm installer:admin` (admin.ts), which reads the API's own settings: whoever
// can run it already holds the server and its secrets, and that is its whole proof. It is no
// endpoint and nothing of the API's process reaches it. It never makes a second admin (an admin
// does that in the back office) and never touches anybody who isn't one.
//
// Every write names a real person (ADR-097): the admin themselves, with the reason said, so the
// audit log shows it was done on the server and for whom. Clearing an authenticator is a
// security event, as an admin's clearing is.
import { randomUUID } from 'node:crypto';

import type { Database, Prisma } from '@open-adms/db';
import type { PasswordRules } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { PasswordHasher } from '../sign-in/password-hasher.ts';
import type { Sessions } from '../sign-in/sessions.ts';

type Tx = Prisma.TransactionClient;

export const serverReason = 'Done on the server, by pnpm installer:admin.';

// Where the firm stands for an email address: it has no admin yet; the address is an admin's;
// or it has admins and the address is none of theirs.
export type AdminStanding =
  | { readonly kind: 'NO_ADMIN_YET' }
  | { readonly kind: 'ADMIN'; readonly name: string; readonly hasAuthenticator: boolean }
  | { readonly kind: 'NOT_AN_ADMIN' };

export type ServerAdminOutcome =
  | { readonly done: true; readonly name: string; readonly sessionsEnded: number }
  | {
      readonly done: false;
      readonly code: 'ADMIN_EXISTS' | 'NOT_AN_ADMIN' | 'EMAIL_HELD' | 'PASSWORD_REFUSED';
      // Why a password wasn't taken, in the domain's plain words.
      readonly message?: string;
    };

export interface ServerAdminParts {
  readonly rules: PasswordRules;
  readonly hasher: PasswordHasher;
  readonly sessions: Pick<Sessions, 'endAll'>;
  readonly clock: Clock;
}

const signsInHere = ['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER'] as const;

export class ServerAdmin {
  private readonly db: Database;
  private readonly parts: ServerAdminParts;

  constructor(db: Database, parts: ServerAdminParts) {
    this.db = db;
    this.parts = parts;
  }

  async standing(email: string): Promise<AdminStanding> {
    return this.db.$read(async (tx) => {
      const admin = await this.adminNamed(tx, email);
      if (admin !== undefined) {
        return {
          kind: 'ADMIN',
          name: admin.name,
          hasAuthenticator: admin.credential?.twoStepSecret != null,
        };
      }
      return { kind: (await this.admins(tx)) === 0 ? 'NO_ADMIN_YET' : 'NOT_AN_ADMIN' };
    });
  }

  // The firm's first admin, with a password of their own: they typed it, so nothing is marked
  // to be changed. They set their authenticator up at their first sign-in (ADR-412).
  async makeFirst(name: string, email: string, password: string): Promise<ServerAdminOutcome> {
    const id = randomUUID();
    const address = email.trim();
    const problem = this.parts.rules.problem(password, {
      monitor: false,
      words: [name, address, null],
    });
    if (problem !== undefined) {
      return { done: false, code: 'PASSWORD_REFUSED', message: problem.message };
    }
    const passwordHash = await this.parts.hasher.hash(password);
    return this.db.$write(
      { actorId: id, source: 'BACK_OFFICE', reason: serverReason },
      async (tx): Promise<ServerAdminOutcome> => {
        if ((await this.admins(tx)) > 0) return { done: false, code: 'ADMIN_EXISTS' };
        if (await this.held(tx, address)) return { done: false, code: 'EMAIL_HELD' };
        await tx.user.create({
          data: { id, name: name.trim(), role: 'ADMIN', email: address, monitorNumber: null },
        });
        await tx.userCredential.create({ data: { userId: id, passwordHash } });
        return { done: true, name: name.trim(), sessionsEnded: 0 };
      },
    );
  }

  // An admin's password set anew: the count of wrong tries starts again, a lock opens, their
  // sessions end. With `clearAuthenticator`, the authenticator goes too.
  async letBackIn(
    email: string,
    password: string,
    clearAuthenticator: boolean,
  ): Promise<ServerAdminOutcome> {
    const admin = await this.db.$read((tx) => this.adminNamed(tx, email));
    if (admin === undefined) return { done: false, code: 'NOT_AN_ADMIN' };
    const problem = this.parts.rules.problem(password, {
      monitor: false,
      words: [admin.name, admin.email, null],
    });
    if (problem !== undefined) {
      return { done: false, code: 'PASSWORD_REFUSED', message: problem.message };
    }
    const passwordHash = await this.parts.hasher.hash(password);
    const now = this.parts.clock.now();
    return this.db.$write(
      { actorId: admin.id, source: 'BACK_OFFICE', reason: serverReason },
      async (tx): Promise<ServerAdminOutcome> => {
        // Read again inside the work: still an admin, still in service.
        const still = await tx.user.findUnique({
          where: { id: admin.id },
          select: { role: true, archivedAt: true },
        });
        if (still?.role !== 'ADMIN' || still.archivedAt !== null) {
          return { done: false, code: 'NOT_AN_ADMIN' };
        }
        const cleared = { twoStepSecret: null, twoStepLastStep: null };
        const { count } = clearAuthenticator
          ? await tx.userCredential.updateMany({
              where: { userId: admin.id, twoStepSecret: { not: null } },
              data: cleared,
            })
          : { count: 0 };
        await tx.userCredential.upsert({
          where: { userId: admin.id },
          create: { userId: admin.id, passwordHash },
          update: {
            passwordHash,
            passwordChangeRequired: false,
            failedSignIns: 0,
            lockedUntil: null,
          },
        });
        if (count === 1) {
          await tx.securityEvent.create({
            data: { kind: 'TWO_STEP_CLEARED', userId: admin.id, occurredAt: now },
          });
        }
        return {
          done: true,
          name: admin.name,
          sessionsEnded: await this.parts.sessions.endAll(tx, admin.id),
        };
      },
    );
  }

  private admins(tx: Tx): Promise<number> {
    return tx.user.count({ where: { role: 'ADMIN', archivedAt: null } });
  }

  // The one admin in service the firm holds that address for, compared as sign-in compares it.
  private async adminNamed(tx: Tx, email: string) {
    const typed = email.trim().toLowerCase();
    const admins = await tx.user.findMany({
      where: { role: 'ADMIN', archivedAt: null, email: { not: null } },
      select: {
        id: true,
        name: true,
        email: true,
        credential: { select: { twoStepSecret: true } },
      },
    });
    const [admin, another] = admins.filter((held) => held.email?.trim().toLowerCase() === typed);
    return another === undefined ? admin : undefined;
  }

  private async held(tx: Tx, email: string): Promise<boolean> {
    const typed = email.toLowerCase();
    const people = await tx.user.findMany({
      where: { email: { not: null }, archivedAt: null, role: { in: [...signsInHere] } },
      select: { email: true },
    });
    return people.some((person) => person.email?.trim().toLowerCase() === typed);
  }
}
