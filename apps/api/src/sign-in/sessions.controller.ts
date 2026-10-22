// Signing in and out, and keeping a session going (ARCHITECTURE §6, Back-office sessions;
// AC-10-09, 12…18; ADR-408…410). The tokens leave only as cookies; an answer's body holds who is
// signed in and the session's CSRF value, never a token. The log says that a sign-in worked or
// why it didn't, never the name or the password that was typed.
import {
  changePasswordEndpoint,
  csrfAnswerSchema,
  currentSessionEndpoint,
  endOwnSessionEndpoint,
  listOwnSessionsEndpoint,
  ownSessionsAnswerSchema,
  passwordSetAnswerSchema,
  refreshSessionEndpoint,
  sessionAnswerSchema,
  sessionCsrfEndpoint,
  signedOutAnswerSchema,
  signInEndpoint,
  signOutEndpoint,
  sessionsEndedAnswerSchema,
  type CsrfAnswer,
  type OwnSessionsAnswer,
  type SessionsEndedAnswer,
  type PasswordSetAnswer,
  type SessionAnswer,
  type SignedOutAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { apiLimits, Limits } from '../process/limits.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { callerOf, refreshTokenOf } from './admission.ts';
import { apiPasswords } from './password-resets.controller.ts';
import { Passwords } from './passwords.ts';
import { accessCookie, cookieSet, cookiesCleared, refreshCookie } from './session-cookies.ts';
import { SessionTokens } from './session-tokens.ts';
import { Sessions, type Caller, type Opened } from './sessions.ts';

export const apiSessions = Symbol('the API’s sessions');
export const apiSessionTokens = Symbol('the API’s session tokens');

// Who is signed in, as an answer says it.
export function sessionAnswer(caller: Caller, tokens: SessionTokens): SessionAnswer {
  return sessionAnswerSchema.parse({
    user: {
      id: caller.userId,
      name: caller.name,
      role: caller.role,
      viewerKind: caller.viewerKind,
    },
    granted: caller.granted,
    passwordChangeRequired: caller.passwordChangeRequired,
    twoStepSetUp: caller.twoStepSetUp,
    twoStepSetupRequired: caller.twoStepSetupRequired,
    csrf: tokens.csrf(caller.sessionId),
  });
}

@Controller()
export class SessionsController {
  private readonly sessions: Sessions;
  private readonly tokens: SessionTokens;
  private readonly passwords: Passwords;
  private readonly limits: Limits;

  constructor(
    @Inject(apiSessions) sessions: Sessions,
    @Inject(apiSessionTokens) tokens: SessionTokens,
    @Inject(apiPasswords) passwords: Passwords,
    @Inject(apiLimits) limits: Limits,
  ) {
    this.sessions = sessions;
    this.tokens = tokens;
    this.passwords = passwords;
    this.limits = limits;
  }

  @Serves(signInEndpoint)
  async signIn(
    @Body() body: { email: string; password: string; code?: string },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionAnswer> {
    // An address refused too often already, here or at this login, is stopped before the login
    // is touched: its try is never a wrong try there (ADR-416).
    const underWay = this.limits.mayTry(request.ip, body.email);
    try {
      const outcome = await this.sessions.signIn(body.email, body.password, body.code);
      if (!outcome.signedIn) {
        request.log.info({ why: outcome.why }, 'A sign-in was refused.');
        // The one refusal told apart: the password was right, and the authenticator's code is
        // asked for. Nothing was opened and nothing written.
        if (outcome.why === 'CODE_NEEDED') throw new Refusal('TWO_STEP_CODE_NEEDED', 401);
        this.limits.wrongTry(request.ip, body.email);
        throw new Refusal('SIGN_IN_REFUSED', 401);
      }
      this.limits.signedIn(request.ip, body.email);
      request.log.info('A sign-in worked.');
      return this.opened(reply, outcome);
    } finally {
      underWay.over();
    }
  }

  @Serves(refreshSessionEndpoint)
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionAnswer> {
    const outcome = await this.sessions.refresh(refreshTokenOf(request));
    if (!outcome.refreshed) {
      if (outcome.reused) {
        request.log.warn('A refresh token was presented a second time: its session is ended.');
      }
      void reply.header('set-cookie', cookiesCleared);
      throw new Refusal('NOT_SIGNED_IN', 401);
    }
    return this.opened(reply, outcome);
  }

  @Serves(signOutEndpoint)
  async signOut(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SignedOutAnswer> {
    await this.sessions.signOut(refreshTokenOf(request));
    void reply.header('set-cookie', cookiesCleared);
    return signedOutAnswerSchema.parse({ status: 'signed-out' });
  }

  @Serves(currentSessionEndpoint)
  current(@Req() request: FastifyRequest): SessionAnswer {
    return this.answer(callerOf(request));
  }

  @Serves(listOwnSessionsEndpoint)
  async listOwn(@Req() request: FastifyRequest): Promise<OwnSessionsAnswer> {
    const caller = callerOf(request);
    const sessions = await this.sessions.own(caller.userId, caller.sessionId);
    return ownSessionsAnswerSchema.parse({
      sessions: sessions.map((session) => ({
        id: session.id,
        openedAt: session.openedAt.toISOString(),
        endsBy: session.endsBy.toISOString(),
        current: session.current,
      })),
    });
  }

  @Serves(endOwnSessionEndpoint)
  async endOwn(
    @Body() body: { sessionId: string },
    @Req() request: FastifyRequest,
  ): Promise<SessionsEndedAnswer> {
    const caller = callerOf(request);
    if (!(await this.sessions.endOwn(caller.userId, body.sessionId, caller.sessionId))) {
      throw new Refusal('NOT_FOUND', 404);
    }
    request.log.info('A person ended one of their own sessions.');
    return sessionsEndedAnswerSchema.parse({ status: 'ended', sessions: 1 });
  }

  @Serves(sessionCsrfEndpoint)
  async csrf(@Req() request: FastifyRequest): Promise<CsrfAnswer> {
    const csrf = await this.sessions.csrfFor(refreshTokenOf(request));
    if (csrf === undefined) throw new Refusal('NOT_SIGNED_IN', 401);
    return csrfAnswerSchema.parse({ csrf });
  }

  @Serves(changePasswordEndpoint)
  async changePassword(
    @Body() body: { current: string; password: string },
    @Req() request: FastifyRequest,
  ): Promise<PasswordSetAnswer> {
    const caller = callerOf(request);
    const underWay = this.limits.mayTry(request.ip);
    try {
      const outcome = await this.passwords.changeOwn(
        caller.userId,
        caller.sessionId,
        body.current,
        body.password,
      );
      if (!outcome.set) {
        if (outcome.code === 'NOT_FOUND' || outcome.code === 'NOT_ALLOWED') {
          throw new Refusal('NOT_SIGNED_IN', 401);
        }
        if (outcome.code === 'RESET_REFUSED' || outcome.code === 'NO_MAIL') {
          throw new Error('Changing a password answered as a reset does.');
        }
        if (outcome.code === 'PASSWORD_WRONG') this.limits.wrongTry(request.ip);
        throw new Refusal(outcome.code, 422, outcome.message);
      }
      return passwordSetAnswerSchema.parse({ status: 'ok' });
    } finally {
      underWay.over();
    }
  }

  private opened(reply: FastifyReply, opened: Opened): SessionAnswer {
    void reply.header('set-cookie', [
      cookieSet(accessCookie, opened.access, this.tokens.accessSeconds),
      cookieSet(refreshCookie, opened.refresh, opened.refreshSeconds),
    ]);
    return this.answer(opened.caller);
  }

  private answer(caller: Caller): SessionAnswer {
    return sessionAnswer(caller, this.tokens);
  }
}
