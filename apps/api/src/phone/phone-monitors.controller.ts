// Creating a monitor on a phone (ARCHITECTURE §7.0, §7.5; AC-02-07; AC-10-22, 32; BACKLOG 2.5.2,
// C93; ADR-416, 438, 441, 442). Open to a phone that has proved itself; the master passcode in
// the request opens the act. The log says that a monitor was created or why one wasn't, by code
// and id: never the passcode, the password, the monitor's name or their number.
import {
  createMonitorOnPhoneEndpoint,
  monitorCreatedAnswerSchema,
  type BodyOf,
  type MonitorCreatedAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { apiLimits, Limits } from '../process/limits.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { phoneOf } from '../sign-in/admission.ts';
import { atThePasscode } from './master-passcode-check.ts';
import { PhoneMonitors } from './phone-monitors.ts';

export const apiPhoneMonitors = Symbol('the API’s monitors created on phones');

@Controller()
export class PhoneMonitorsController {
  private readonly monitors: PhoneMonitors;
  private readonly limits: Limits;

  constructor(
    @Inject(apiPhoneMonitors) monitors: PhoneMonitors,
    @Inject(apiLimits) limits: Limits,
  ) {
    this.monitors = monitors;
    this.limits = limits;
  }

  @Serves(createMonitorOnPhoneEndpoint)
  async create(
    @Body() body: BodyOf<typeof createMonitorOnPhoneEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<MonitorCreatedAnswer> {
    const phone = phoneOf(request);
    // An address refused too often already is stopped before the passcode is touched, as at
    // enrolment: its try is never a wrong try there (ADR-416, 438).
    const underWay = this.limits.mayTry(request.ip, atThePasscode);
    try {
      const outcome = await this.monitors.create(phone, body);
      if (!outcome.created) {
        request.log.info(
          { why: outcome.why, deviceId: phone.deviceId },
          'Creating a monitor on a phone was refused.',
        );
        if (outcome.why === 'PHONE_OUT_OF_SERVICE') {
          throw new Refusal(
            'PHONE_OUT_OF_SERVICE',
            409,
            'Not created: this phone was taken out of service. A monitor is created on a phone in service.',
          );
        }
        // The passcode was right: why the password wasn't taken, in the domain's plain words,
        // for whoever typed it. No wrong try.
        if (outcome.why === 'PASSWORD_REFUSED')
          throw new Refusal(outcome.code, 422, outcome.message);
        this.limits.wrongTry(request.ip, atThePasscode);
        throw new Refusal('MASTER_PASSCODE_REFUSED', 401);
      }
      this.limits.signedIn(request.ip, atThePasscode);
      request.log.warn(
        { deviceId: phone.deviceId, userId: outcome.userId },
        'A monitor was created on a phone under the master passcode.',
      );
      return monitorCreatedAnswerSchema.parse({
        userId: outcome.userId,
        monitorNumber: outcome.monitorNumber,
        name: outcome.name,
      });
    } finally {
      underWay.over();
    }
  }
}
