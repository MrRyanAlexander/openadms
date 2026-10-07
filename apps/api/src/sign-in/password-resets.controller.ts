// A password reset by email (ARCHITECTURE §6; AC-10-25; ADR-170, 404, 405): two calls nobody is
// signed in for. Asking never says whether anybody has the address; the log says only whether a
// message went out, never to whom. A firm with no mail server answers NO_MAIL: there an admin
// sets the password.
import {
  completePasswordResetEndpoint,
  passwordSetAnswerSchema,
  requestPasswordResetEndpoint,
  resetAskedAnswerSchema,
  type PasswordSetAnswer,
  type ResetAskedAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { apiLimits, Limits } from '../process/limits.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { Passwords } from './passwords.ts';

export const apiPasswords = Symbol('the API’s passwords');

@Controller()
export class PasswordResetsController {
  private readonly passwords: Passwords;
  private readonly limits: Limits;

  constructor(@Inject(apiPasswords) passwords: Passwords, @Inject(apiLimits) limits: Limits) {
    this.passwords = passwords;
    this.limits = limits;
  }

  @Serves(requestPasswordResetEndpoint)
  async ask(
    @Body() body: { email: string },
    @Req() request: FastifyRequest,
  ): Promise<ResetAskedAnswer> {
    // Counted for the address that asks and for the address asked for, whether or not anybody
    // has it: a limit says nothing of who has a login (ADR-416).
    this.limits.resetAsked(request.ip, body.email);
    const asked = await this.passwords.requestReset(body.email);
    if (!asked.asked) throw new Refusal(asked.code, 409);
    request.log.info({ sent: asked.sent }, 'A password reset by email was asked for.');
    return resetAskedAnswerSchema.parse({ status: 'accepted' });
  }

  @Serves(completePasswordResetEndpoint)
  async complete(
    @Body() body: { code: string; password: string },
    @Req() request: FastifyRequest,
  ): Promise<PasswordSetAnswer> {
    this.limits.mayTry(request.ip);
    const outcome = await this.passwords.completeReset(body.code, body.password);
    if (!outcome.set) {
      if (
        outcome.code === 'NOT_ALLOWED' ||
        outcome.code === 'NOT_FOUND' ||
        outcome.code === 'RESET_REFUSED'
      ) {
        this.limits.wrongTry(request.ip);
        throw new Refusal('RESET_REFUSED', 400);
      }
      throw new Refusal(outcome.code, 422, outcome.message);
    }
    return passwordSetAnswerSchema.parse({ status: 'ok' });
  }
}
