// The login list and the master passcode's check a phone takes, asked for by the phone itself
// at any time it has a connection (ARCHITECTURE §7.1, §7.2, §7.5; AC-02-17, AC-02-41; BACKLOG
// 2.5.3; ADR-449, 454). Open to a proven phone with its monitor's session token. The log says
// how many monitors the list names and how many entries were made, by count and id: never a
// mark, an entry, a name or a Monitor ID.
import {
  phoneLoginListAnswerSchema,
  phoneLoginListEndpoint,
  type BodyOf,
  type PhoneLoginListAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { monitorOf } from '../sign-in/admission.ts';
import { PhoneLoginList } from './phone-login-list.ts';

export const apiPhoneLoginList = Symbol('the API’s login list for a phone');

@Controller()
export class PhoneLoginListController {
  private readonly loginList: PhoneLoginList;

  constructor(@Inject(apiPhoneLoginList) loginList: PhoneLoginList) {
    this.loginList = loginList;
  }

  @Serves(phoneLoginListEndpoint)
  async current(
    @Body() body: BodyOf<typeof phoneLoginListEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<PhoneLoginListAnswer> {
    const monitor = monitorOf(request);
    const taken = await this.loginList.taken(monitor, body);
    request.log.info(
      {
        deviceId: monitor.deviceId,
        userId: monitor.userId,
        masterPasscodeVersion: taken.masterPasscode.version,
        masterPasscodeCheckSent: taken.masterPasscode.check !== null,
        ...(taken.loginList === null
          ? { noAssignment: taken.noAssignment }
          : {
              projectId: taken.loginList.projectId,
              monitors: taken.loginList.monitors.length,
              more: taken.loginList.more,
            }),
        entriesMade: taken.made,
        monitorsWithoutSeed: taken.withoutSeed,
      },
      'A phone read its login list.',
    );
    return phoneLoginListAnswerSchema.parse({
      masterPasscode: taken.masterPasscode,
      noAssignment: taken.noAssignment,
      loginList: taken.loginList,
    });
  }
}
