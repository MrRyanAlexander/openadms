// What a phone being set up under the master passcode picks from (ARCHITECTURE §7.1, §7.5;
// AC-02-38; AC-10-22, 32; BACKLOG 2.5.4, C93, C124; ADR-416, 438, 462 (4)(f), 463). Open to a
// phone that has proved itself; the master passcode in the request opens the read. The log says
// that the choices were read or why not, by code, id and count: never the passcode, a project's
// or a site's name, a monitor's name or their number.
import {
  phoneSetupChoicesAnswerSchema,
  phoneSetupChoicesEndpoint,
  type BodyOf,
  type PhoneSetupChoicesAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { apiLimits, Limits } from '../process/limits.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { phoneOf } from '../sign-in/admission.ts';
import { atThePasscode } from './master-passcode-check.ts';
import { SetupChoices } from './setup-choices.ts';

export const apiSetupChoices = Symbol('the API’s choices for a phone set up under the passcode');

@Controller()
export class SetupChoicesController {
  private readonly choices: SetupChoices;
  private readonly limits: Limits;

  constructor(@Inject(apiSetupChoices) choices: SetupChoices, @Inject(apiLimits) limits: Limits) {
    this.choices = choices;
    this.limits = limits;
  }

  @Serves(phoneSetupChoicesEndpoint)
  async read(
    @Body() body: BodyOf<typeof phoneSetupChoicesEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<PhoneSetupChoicesAnswer> {
    const phone = phoneOf(request);
    // An address refused too often already is stopped before the passcode is touched, as at
    // enrolment: its try is never a wrong try there (ADR-416, 438).
    this.limits.mayTry(request.ip, atThePasscode);
    const outcome = await this.choices.read(phone, body);
    if (!outcome.read) {
      request.log.info(
        { why: outcome.why, deviceId: phone.deviceId },
        'A read of what a phone is set up from was refused.',
      );
      if (outcome.why === 'PHONE_OUT_OF_SERVICE') {
        throw new Refusal(
          'PHONE_OUT_OF_SERVICE',
          409,
          'Not read: this phone was taken out of service. A phone is set up while it is in service.',
        );
      }
      this.limits.wrongTry(request.ip, atThePasscode);
      throw new Refusal('MASTER_PASSCODE_REFUSED', 401);
    }
    this.limits.signedIn(request.ip, atThePasscode);
    request.log.warn(
      {
        deviceId: phone.deviceId,
        projects: outcome.projects.length,
        monitors: outcome.monitors.length,
        ...(outcome.project === null ? {} : { projectId: outcome.project.id }),
      },
      'What a phone is set up from was read under the master passcode.',
    );
    return phoneSetupChoicesAnswerSchema.parse({
      projects: outcome.projects,
      project: outcome.project,
      monitors: outcome.monitors,
      moreMonitorsAfter: outcome.moreMonitorsAfter,
    });
  }
}
