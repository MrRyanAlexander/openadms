// Enrolling a phone (ARCHITECTURE §7.1, §7.4, §7.5; AC-02-15, 18; AC-10-22, 32, 44; BACKLOG
// 2.5.1, C93; ADR-416, 438, 439). Nobody is signed in: the master passcode opens it. The log
// says that a phone was enrolled or why one wasn't, by code: never the passcode, the key or the
// phone's name.
import {
  enrolPhoneEndpoint,
  phoneEnrolledAnswerSchema,
  type BodyOf,
  type PhoneEnrolledAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { apiLimits, Limits } from '../process/limits.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { Enrolment } from './enrolment.ts';
import { atThePasscode } from './master-passcode-check.ts';

export const apiEnrolment = Symbol('the API’s enrolment of phones');

@Controller()
export class EnrolmentController {
  private readonly enrolment: Enrolment;
  private readonly limits: Limits;

  constructor(@Inject(apiEnrolment) enrolment: Enrolment, @Inject(apiLimits) limits: Limits) {
    this.enrolment = enrolment;
    this.limits = limits;
  }

  @Serves(enrolPhoneEndpoint)
  async enrol(
    @Body() body: BodyOf<typeof enrolPhoneEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<PhoneEnrolledAnswer> {
    // An address refused too often already, here or anywhere, is stopped before the passcode is
    // touched: its try is never a wrong try there, so one address can't spend the passcode's
    // count (ADR-416, 438).
    const underWay = this.limits.mayTry(request.ip, atThePasscode);
    try {
      const outcome = await this.enrolment.enrol(body);
      if (!outcome.enrolled) {
        request.log.info({ why: outcome.why }, 'An enrolment was refused.');
        // The passcode was right, and the key isn't one: told apart, since only somebody who
        // holds the passcode hears it.
        if (outcome.why === 'KEY_REFUSED') {
          throw new Refusal(
            'DEVICE_KEY_REFUSED',
            422,
            'Not enrolled: what the phone sent isn’t a public key of the kind a phone makes.',
          );
        }
        this.limits.wrongTry(request.ip, atThePasscode);
        throw new Refusal('ENROLMENT_REFUSED', 401);
      }
      this.limits.signedIn(request.ip, atThePasscode);
      request.log.warn(
        { deviceId: outcome.deviceId, masterPasscodeVersion: outcome.masterPasscodeVersion },
        'A phone was enrolled under the master passcode.',
      );
      return phoneEnrolledAnswerSchema.parse({
        deviceId: outcome.deviceId,
        masterPasscodeVersion: outcome.masterPasscodeVersion,
      });
    } finally {
      underWay.over();
    }
  }
}
