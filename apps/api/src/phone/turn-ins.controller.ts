// A phone turned in under the master passcode ("Sync and turn in"; ARCHITECTURE §7.4, §8;
// AC-02-58, 60, 61; AC-10-22, 32, 46; BACKLOG 2.6.5, C93; ADR-416, 438, 488). Open to a phone that
// has proved itself, in service or not; the master passcode in the request opens the act. The
// log says that a phone was turned in, or why not, by code, the phone's id and how many things
// the server doesn't have: never the passcode, nor any id the phone named.
import {
  turnInAnswerSchema,
  turnInPhoneEndpoint,
  type BodyOf,
  type TurnInAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { apiLimits, Limits } from '../process/limits.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { phoneOf } from '../sign-in/admission.ts';
import { atThePasscode } from './master-passcode-check.ts';
import { turnInAnswerOf, TurnIns } from './turn-ins.ts';

export const apiTurnIns = Symbol('the API’s phones turned in');

@Controller()
export class TurnInsController {
  private readonly turnIns: TurnIns;
  private readonly limits: Limits;

  constructor(@Inject(apiTurnIns) turnIns: TurnIns, @Inject(apiLimits) limits: Limits) {
    this.turnIns = turnIns;
    this.limits = limits;
  }

  @Serves(turnInPhoneEndpoint)
  async turnIn(
    @Body() body: BodyOf<typeof turnInPhoneEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<TurnInAnswer> {
    const phone = phoneOf(request);
    // An address refused too often already is stopped before the passcode is touched, as at
    // enrolment: its try is never a wrong try there (ADR-416, 438).
    this.limits.mayTry(request.ip, atThePasscode);
    const outcome = await this.turnIns.turnIn(phone, body);
    if (!outcome.checked) {
      request.log.info(
        { why: outcome.why, deviceId: phone.deviceId },
        'A turn-in was refused at the master passcode.',
      );
      this.limits.wrongTry(request.ip, atThePasscode);
      throw new Refusal('MASTER_PASSCODE_REFUSED', 401);
    }
    this.limits.signedIn(request.ip, atThePasscode);
    if (!outcome.turnedIn) {
      request.log.info(
        {
          deviceId: phone.deviceId,
          notOnTheServer: Object.values(outcome.notOnTheServer).flat().length,
        },
        'A phone was not turned in: the server doesn’t have everything it holds.',
      );
    } else {
      request.log.warn(
        { deviceId: phone.deviceId, status: phone.status },
        'A phone was turned in under the master passcode: its key is revoked.',
      );
    }
    return turnInAnswerSchema.parse(turnInAnswerOf(outcome));
  }
}
