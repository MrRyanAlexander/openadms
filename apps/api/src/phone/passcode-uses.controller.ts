// A use of the master passcode a phone logged with no connection, reported by that phone
// (ARCHITECTURE §7's notes, §7.3, §7.5; AC-02-23, 42, 46; BACKLOG 2.5.4, C93, C122…C125;
// ADR-106, 438, 456, 462, 464). Open to a phone that has proved itself; nobody need be signed
// in, and no passcode is sent. The log says which phone reported which use and what it was
// answered, by id and code: never a monitor's name or id.
import {
  passcodeUseAnswerSchema,
  reportPasscodeUseEndpoint,
  type BodyOf,
  type PasscodeUseAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { phoneOf } from '../sign-in/admission.ts';
import { PasscodeUses } from './passcode-uses.ts';

export const apiPasscodeUses = Symbol('the API’s uses of the master passcode phones logged');

@Controller()
export class PasscodeUsesController {
  private readonly uses: PasscodeUses;

  constructor(@Inject(apiPasscodeUses) uses: PasscodeUses) {
    this.uses = uses;
  }

  @Serves(reportPasscodeUseEndpoint)
  async report(
    @Body() body: BodyOf<typeof reportPasscodeUseEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<PasscodeUseAnswer> {
    const phone = phoneOf(request);
    const received = await this.uses.received(phone.deviceId, {
      ...body,
      loggedAt: new Date(body.loggedAt),
    });
    const reason = received.answer === 'NOT_SAVED' ? received.reason : null;
    request.log.info(
      {
        deviceId: phone.deviceId,
        useId: body.id,
        use: body.use,
        answer: received.answer,
        ...(reason === null ? {} : { reason }),
      },
      'A phone reported a use of the master passcode it logged.',
    );
    return passcodeUseAnswerSchema.parse({ useId: body.id, answer: received.answer, reason });
  }
}
