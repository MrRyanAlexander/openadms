// A back-office or outside user's session (ARCHITECTURE §6, Back-office sessions, Abuse;
// spec/acceptance/10-api-and-sync.md AC-10-09, 12…19 and AC-02-39's web half; spec/THREAT-MODEL.md
// T-14, T-16, T-24; ADR-398, 401, 408, 409). NIST SP 800-63B-4 §2.2.3, §3.2.2, §5; ASVS 5.0 V7.
//
// - **Signing in**: the email address the firm holds for the person, and their password. Only
//   an admin, a manager/analyst or a read-only viewer signs in here: never a monitor (their ID
//   and password open a phone's calls only, ADR-105) and never the system actor, which is no
//   login. Whatever is wrong, the caller is told the same thing in about the same time.
// - **The second step** (ADR-170, 412; NIST SP 800-63B-4 §3.1.4; ASVS 5.0 V6.5): a person who
//   has an authenticator gets a session only with its code. A right password without one opens
//   nothing and says a code is needed; a wrong code is a wrong try at the login like a wrong
//   password, and a code is good once. An admin or a manager/analyst with no authenticator yet
//   gets a session that opens nothing but setting one up.
// - **A session** is one row; its refresh token rotates in place and is good once. One presented
//   again ends the session: whoever copied it and the person are both signed out.
// - **It ends** when the person signs out, when nothing was asked of it for the policy's minutes,
//   at the policy's hours after sign-in whatever was asked, when its refresh token is used twice,
//   when the person's password is set anew, and at once for a person who was archived or is no
//   longer a kind of user that signs in here: all of that is read from the database each time.
// - **What the person may do** is read with it: their role and the permissions they hold at that
//   moment (ADR-415). A grant taken away, or a role changed, bites at their very next request.
import { randomBytes } from 'node:crypto';

import type { Database, Prisma } from '@open-adms/db';
import type { Policy } from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { PasswordHasher } from './password-hasher.ts';
import type { SessionTokens } from './session-tokens.ts';
import type { TwoStepCheck } from './two-step.ts';
import type { WrongTries } from './wrong-tries.ts';

type Tx = Prisma.TransactionClient;

// Who signs in at the back office and the portal.
export const signsInHere = ['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER'] as const;

export type SignsInHere = (typeof signsInHere)[number];

// Who a request is from, as the database has them now.
export interface Caller {
  readonly sessionId: string;
  readonly userId: string;
  readonly name: string;
  readonly role: SignsInHere;
  // The permissions they hold now: one taken away isn't among them (ADR-315, 415).
  readonly granted: readonly string[];
  // Somebody else set their password: they set their own before anything else (ADR-410).
  readonly passwordChangeRequired: boolean;
  // Whether they have an authenticator, and whether they must set one up before anything else:
  // an admin or a manager/analyst with none (ADR-412).
  readonly twoStepSetUp: boolean;
  readonly twoStepSetupRequired: boolean;
}

// A session's tokens, for its cookies, and how long the refresh token's cookie may live.
export interface Opened {
  readonly caller: Caller;
  readonly access: string;
  readonly refresh: string;
  readonly refreshSeconds: number;
}

// Why a sign-in was refused: for the server's log only. A caller is never told which.
// `CODE_NEEDED` is the one a caller is told apart: the password was right, the person has an
// authenticator and no code was sent.
export type SignInRefused =
  'NOBODY' | 'WRONG' | 'WAITING' | 'LOCKED' | 'CODE_NEEDED' | 'WRONG_CODE';

export type SignInOutcome =
  | ({ readonly signedIn: true } & Opened)
  | { readonly signedIn: false; readonly why: SignInRefused };

export type RefreshOutcome =
  | ({ readonly refreshed: true } & Opened)
  // `reused`: the token had been used before, and its session is now ended.
  | { readonly refreshed: false; readonly reused: boolean };

export type SessionPolicy = Pick<Policy, 'sessionInactivityMinutes' | 'sessionOverallHours'>;

export interface SessionParts {
  readonly tokens: SessionTokens;
  readonly hasher: PasswordHasher;
  readonly tries: WrongTries;
  readonly twoStep: TwoStepCheck;
  readonly clock: Clock;
  readonly policy: SessionPolicy;
  readonly requestNow: () => string | undefined;
}

const sessionRead = {
  id: true,
  deviceId: true,
  refreshTokenHash: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      role: true,
      archivedAt: true,
      permissions: { where: { archivedAt: null }, select: { permission: true } },
      credential: { select: { passwordChangeRequired: true, twoStepSecret: true } },
    },
  },
} as const;

type SessionRow = Prisma.SessionGetPayload<{ select: typeof sessionRead }>;

const signsIn = (role: string): role is SignsInHere => signsInHere.some((here) => here === role);

export class Sessions {
  private readonly db: Database;
  private readonly parts: SessionParts;
  // What a try at no real login is checked against, so that it takes as long as a real one.
  private decoy: Promise<string> | undefined;

  constructor(db: Database, parts: SessionParts) {
    this.db = db;
    this.parts = parts;
  }

  async signIn(email: string, password: string, code?: string): Promise<SignInOutcome> {
    const person = await this.named(email);
    const kept = person?.credential;
    if (person === undefined || kept?.passwordHash == null) {
      await this.spend(password);
      return { signedIn: false, why: 'NOBODY' };
    }
    // A login that waits or is locked: nothing is checked and nothing is written.
    if (this.parts.tries.closed(kept)) {
      await this.spend(password);
      return {
        signedIn: false,
        why:
          kept.lockedUntil !== null && kept.lockedUntil > this.parts.clock.now()
            ? 'WAITING'
            : 'LOCKED',
      };
    }
    if (!(await this.parts.hasher.verify(password, kept.passwordHash))) {
      const cost = await this.parts.tries.wrong(person);
      return { signedIn: false, why: cost.kind === 'LOCKED' ? 'LOCKED' : 'WRONG' };
    }
    const now = this.parts.clock.now();
    // The second step, for a person who has an authenticator: only once the password is right.
    let step: number | undefined;
    if (kept.twoStepSecret !== null) {
      if (code === undefined) return { signedIn: false, why: 'CODE_NEEDED' };
      step = this.parts.twoStep.taken(
        person.id,
        kept.twoStepSecret,
        code,
        kept.twoStepLastStep,
        now,
      );
      if (step === undefined) return this.wrongCode(person);
    }
    // Made again where it has no key or was made under settings since raised.
    const passwordHash = this.parts.hasher.stale(kept.passwordHash)
      ? await this.parts.hasher.hash(password)
      : undefined;
    const requestId = this.parts.requestNow();
    const made = this.parts.tokens.newRefresh();
    const expiresAt = this.until(now, now);
    const session = await this.db.$write(
      { actorId: person.id, source: 'BACK_OFFICE' },
      async (tx) => {
        // A code is good once: its step is kept only where no later one is, so of two sign-ins
        // with one code, one finds it spent.
        if (step !== undefined) {
          const { count } = await tx.userCredential.updateMany({
            where: {
              userId: person.id,
              OR: [{ twoStepLastStep: null }, { twoStepLastStep: { lt: step } }],
            },
            data: { twoStepLastStep: step },
          });
          if (count !== 1) return undefined;
        }
        if (kept.failedSignIns > 0 || kept.lockedUntil !== null || passwordHash !== undefined) {
          await tx.userCredential.update({
            where: { userId: person.id },
            data: {
              failedSignIns: 0,
              lockedUntil: null,
              ...(passwordHash === undefined ? {} : { passwordHash }),
            },
          });
        }
        await tx.securityEvent.create({
          data: {
            kind: 'SIGN_IN',
            userId: person.id,
            occurredAt: now,
            ...(requestId ? { requestId } : {}),
          },
        });
        return tx.session.create({
          data: { userId: person.id, refreshTokenHash: made.hash, createdAt: now, expiresAt },
          select: { id: true },
        });
      },
    );
    if (session === undefined) return this.wrongCode(person);
    return {
      signedIn: true,
      ...this.opened(
        {
          sessionId: session.id,
          userId: person.id,
          name: person.name,
          role: person.role,
          granted: person.permissions.map(({ permission }) => permission),
          passwordChangeRequired: kept.passwordChangeRequired,
          ...this.twoStepOf(person.role, kept.twoStepSecret),
        },
        made.secret,
        expiresAt,
        now,
      ),
    };
  }

  // A new access token and a new refresh token for the session the given one belongs to.
  async refresh(token: string): Promise<RefreshOutcome> {
    const read = this.parts.tokens.readRefresh(token);
    if (read === undefined) return { refreshed: false, reused: false };
    const now = this.parts.clock.now();
    const session = await this.db.$read((tx) => this.alive(tx, read.sessionId, now));
    if (session === undefined) return { refreshed: false, reused: false };
    const made = this.parts.tokens.newRefresh();
    const expiresAt = this.until(session.row.createdAt, now);
    const rotated = await this.db.$write(
      {
        actorId: session.caller.userId,
        source: 'BACK_OFFICE',
        ...(this.parts.tokens.sameHash(read.hash, session.row.refreshTokenHash)
          ? {}
          : { reason: 'A refresh token was presented a second time.' }),
      },
      async (tx) => {
        // Only the token in force rotates, and only once: of two calls with it, one finds it gone.
        const { count } = this.parts.tokens.sameHash(read.hash, session.row.refreshTokenHash)
          ? await tx.session.updateMany({
              where: { id: read.sessionId, refreshTokenHash: read.hash, revokedAt: null },
              data: { refreshTokenHash: made.hash, expiresAt },
            })
          : { count: 0 };
        if (count === 1) return true;
        await tx.session.updateMany({
          where: { id: read.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
        return false;
      },
    );
    if (!rotated) return { refreshed: false, reused: true };
    return { refreshed: true, ...this.opened(session.caller, made.secret, expiresAt, now) };
  }

  // Ends the session the refresh token is in force for. Anything else ends nothing.
  async signOut(token: string): Promise<boolean> {
    const read = this.parts.tokens.readRefresh(token);
    if (read === undefined) return false;
    const now = this.parts.clock.now();
    const session = await this.db.$read((tx) => this.alive(tx, read.sessionId, now));
    if (session === undefined) return false;
    if (!this.parts.tokens.sameHash(read.hash, session.row.refreshTokenHash)) return false;
    const { count } = await this.db.$write(
      { actorId: session.caller.userId, source: 'BACK_OFFICE' },
      (tx) =>
        tx.session.updateMany({
          where: { id: read.sessionId, revokedAt: null },
          data: { revokedAt: now },
        }),
    );
    return count === 1;
  }

  // Who an access token is from, read from the database now; undefined when its session has
  // ended or its person may no longer sign in here.
  async caller(accessToken: string | undefined): Promise<Caller | undefined> {
    const now = this.parts.clock.now();
    const sessionId = this.parts.tokens.sessionOfAccess(accessToken, now);
    if (sessionId === undefined) return undefined;
    return (await this.db.$read((tx) => this.alive(tx, sessionId, now)))?.caller;
  }

  // The CSRF value of the session the refresh token is in force for.
  async csrfFor(token: string): Promise<string | undefined> {
    const read = this.parts.tokens.readRefresh(token);
    if (read === undefined) return undefined;
    const session = await this.db.$read((tx) =>
      this.alive(tx, read.sessionId, this.parts.clock.now()),
    );
    if (session === undefined) return undefined;
    if (!this.parts.tokens.sameHash(read.hash, session.row.refreshTokenHash)) return undefined;
    return this.parts.tokens.csrf(read.sessionId);
  }

  // Ends every session of a person but one, inside the piece of work that changed their
  // password, cleared their authenticator or archived them, or in which an admin ended them
  // (ADR-410, 415; ASVS 7.4.3, 7.4.5); a monitor's sign-ins on phones among them (ADR-443).
  // Answers how many were open.
  async endAll(tx: Tx, userId: string, except?: string): Promise<number> {
    const { count } = await tx.session.updateMany({
      where: { userId, revokedAt: null, ...(except === undefined ? {} : { id: { not: except } }) },
      data: { revokedAt: this.parts.clock.now() },
    });
    return count;
  }

  // The one person the firm holds that address for, among those who sign in here. Compared
  // whole and without regard to capitals, never as a pattern in the database. Where two share
  // an address neither is meant, as for a reset by email (ADR-404).
  private async named(email: string) {
    const typed = email.trim().toLowerCase();
    const people = (
      await this.db.$read((tx) =>
        tx.user.findMany({
          where: { email: { not: null }, archivedAt: null, role: { in: [...signsInHere] } },
          select: {
            id: true,
            name: true,
            role: true,
            email: true,
            permissions: { where: { archivedAt: null }, select: { permission: true } },
            credential: {
              select: {
                passwordHash: true,
                failedSignIns: true,
                lockedUntil: true,
                passwordChangeRequired: true,
                twoStepSecret: true,
                twoStepLastStep: true,
              },
            },
          },
        }),
      )
    ).filter((held) => held.email?.trim().toLowerCase() === typed);
    const [person, another] = people;
    if (person === undefined || another !== undefined || !signsIn(person.role)) return undefined;
    return { ...person, role: person.role };
  }

  // A session that is in force, and who it is of, as the database has both now.
  private async alive(
    tx: Tx,
    sessionId: string,
    now: Date,
  ): Promise<{ row: SessionRow; caller: Caller } | undefined> {
    const row = await tx.session.findUnique({ where: { id: sessionId }, select: sessionRead });
    // Ended: signed out or revoked, or run out.
    if (row === null) return undefined;
    if (row.revokedAt !== null || row.expiresAt <= now) return undefined;
    // A monitor's session on a phone (ADR-443) is never a back-office one, whatever its token.
    if (row.deviceId !== null) return undefined;
    if (row.user.archivedAt !== null || !signsIn(row.user.role)) return undefined;
    return {
      row,
      caller: {
        sessionId,
        userId: row.user.id,
        name: row.user.name,
        role: row.user.role,
        granted: row.user.permissions.map(({ permission }) => permission),
        passwordChangeRequired: row.user.credential?.passwordChangeRequired ?? false,
        ...this.twoStepOf(row.user.role, row.user.credential?.twoStepSecret ?? null),
      },
    };
  }

  // Where a person stands with the second step: whether they have an authenticator, and whether
  // their role needs one they haven't.
  private twoStepOf(
    role: string,
    kept: string | null,
  ): Pick<Caller, 'twoStepSetUp' | 'twoStepSetupRequired'> {
    const twoStepSetUp = kept !== null;
    return {
      twoStepSetUp,
      twoStepSetupRequired: !twoStepSetUp && this.parts.twoStep.need(role) === 'REQUIRED',
    };
  }

  // A code that isn't the authenticator's, or was used before: a wrong try at the login, counted
  // and written as a wrong password is (NIST SP 800-63B-4 §3.2.2).
  private async wrongCode(person: {
    readonly id: string;
    readonly name: string;
    readonly email: string | null;
  }): Promise<SignInOutcome> {
    const cost = await this.parts.tries.wrong(person);
    return { signedIn: false, why: cost.kind === 'LOCKED' ? 'LOCKED' : 'WRONG_CODE' };
  }

  // When a session used at `now` ends unless it is used again: after the policy's quiet minutes,
  // and never later than the policy's hours after it began.
  private until(began: Date, now: Date): Date {
    const { sessionInactivityMinutes, sessionOverallHours } = this.parts.policy;
    return new Date(
      Math.min(
        now.getTime() + sessionInactivityMinutes * 60_000,
        began.getTime() + sessionOverallHours * 3_600_000,
      ),
    );
  }

  private opened(caller: Caller, secret: string, expiresAt: Date, now: Date): Opened {
    return {
      caller,
      access: this.parts.tokens.access(caller.sessionId, now),
      refresh: this.parts.tokens.refresh(caller.sessionId, secret),
      refreshSeconds: Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
    };
  }

  // The work of checking a password, done for a try that can't succeed.
  private async spend(password: string): Promise<void> {
    this.decoy ??= this.parts.hasher.hash(randomBytes(24).toString('base64url'));
    await this.parts.hasher.verify(password, await this.decoy);
  }
}
