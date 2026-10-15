// Two-step sign-in's endpoints (ARCHITECTURE §6; AC-02-14, 74; AC-10-26; ADR-170, 412): a
// signed-in person sets their authenticator up in two calls, and an admin clears somebody
// else's. The secret is in one answer, to its owner, once; the log says what was done and never
// holds a secret, a setup or a code.
import {
  beginTwoStepSetupEndpoint,
  clearTwoStepEndpoint,
  confirmTwoStepSetupEndpoint,
  removeOwnTwoStepEndpoint,
  twoStepClearedAnswerSchema,
  twoStepSetupAnswerSchema,
  type SessionAnswer,
  type TwoStepClearedAnswer,
  type TwoStepSetupAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { apiLimits, Limits } from '../process/limits.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { callerOf } from './admission.ts';
import { SessionTokens } from './session-tokens.ts';
import { apiSessionTokens, sessionAnswer } from './sessions.controller.ts';
import { TwoStep } from './two-step.ts';

export const apiTwoStep = Symbol('the API’s two-step sign-in');

const statusOf = {
  NOT_FOUND: 404,
  NOT_ALLOWED: 403,
  TWO_STEP_ALREADY_SET_UP: 409,
  TWO_STEP_NOT_SET_UP: 409,
  TWO_STEP_REFUSED: 422,
} as const;

@Controller()
export class TwoStepController {
  private readonly twoStep: TwoStep;
  private readonly tokens: SessionTokens;
  private readonly limits: Limits;

  constructor(
    @Inject(apiTwoStep) twoStep: TwoStep,
    @Inject(apiSessionTokens) tokens: SessionTokens,
    @Inject(apiLimits) limits: Limits,
  ) {
    this.twoStep = twoStep;
    this.tokens = tokens;
    this.limits = limits;
  }

  @Serves(beginTwoStepSetupEndpoint)
  async begin(@Req() request: FastifyRequest): Promise<TwoStepSetupAnswer> {
    const begun = await this.twoStep.begin(callerOf(request).userId);
    if (!begun.begun) throw new Refusal(begun.code, statusOf[begun.code]);
    request.log.info('The setup of an authenticator was begun.');
    return twoStepSetupAnswerSchema.parse({
      secret: begun.secret,
      uri: begun.uri,
      setup: begun.setup,
      expiresAt: begun.expiresAt.toISOString(),
    });
  }

  @Serves(confirmTwoStepSetupEndpoint)
  async confirm(
    @Body() body: { setup: string; code: string },
    @Req() request: FastifyRequest,
  ): Promise<SessionAnswer> {
    const caller = callerOf(request);
    this.limits.mayTry(request.ip);
    const outcome = await this.twoStep.confirm(
      caller.userId,
      caller.sessionId,
      body.setup,
      body.code,
    );
    if (!outcome.confirmed) {
      request.log.info({ why: outcome.code }, 'The setup of an authenticator was refused.');
      if (outcome.code === 'TWO_STEP_REFUSED') this.limits.wrongTry(request.ip);
      throw new Refusal(outcome.code, statusOf[outcome.code]);
    }
    request.log.info('An authenticator was set up.');
    return sessionAnswer(
      { ...caller, twoStepSetUp: true, twoStepSetupRequired: false },
      this.tokens,
    );
  }

  @Serves(removeOwnTwoStepEndpoint)
  async removeOwn(
    @Body() body: { code: string },
    @Req() request: FastifyRequest,
  ): Promise<TwoStepClearedAnswer> {
    const caller = callerOf(request);
    this.limits.mayTry(request.ip);
    const outcome = await this.twoStep.removeOwn(caller.userId, caller.sessionId, body.code);
    if (!outcome.removed) {
      request.log.info({ why: outcome.code }, 'Removing one’s own authenticator was refused.');
      if (outcome.code === 'TWO_STEP_REFUSED') this.limits.wrongTry(request.ip);
      throw new Refusal(outcome.code, statusOf[outcome.code]);
    }
    request.log.warn({ told: outcome.told }, 'A person removed their own authenticator.');
    return twoStepClearedAnswerSchema.parse({ status: 'cleared' });
  }

  @Serves(clearTwoStepEndpoint)
  async clear(
    @Param() params: { userId: string },
    @Req() request: FastifyRequest,
  ): Promise<TwoStepClearedAnswer> {
    const outcome = await this.twoStep.clearByAdmin(callerOf(request).userId, params.userId);
    if (!outcome.cleared) {
      request.log.info({ why: outcome.code }, 'Clearing an authenticator was refused.');
      throw new Refusal(outcome.code, statusOf[outcome.code]);
    }
    request.log.warn('An admin cleared a person’s authenticator.');
    return twoStepClearedAnswerSchema.parse({ status: 'cleared' });
  }
}
