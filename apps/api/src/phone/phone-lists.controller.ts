// The lists a phone takes, asked for by the phone itself at any time it has a connection
// (ARCHITECTURE §7.1's lists note, §9 (6); AC-02-37, AC-03-09, AC-07-91; BACKLOG 2.5.3, C114;
// ADR-151, 449, 450). Open to a proven phone with its monitor's session token. The log says
// which assignment's lists were read and which setup version they are, or why none, by id and code.
import {
  phoneListsAnswerSchema,
  phoneListsEndpoint,
  type PhoneListsAnswer,
} from '@open-adms/contracts';
import { Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { monitorOf } from '../sign-in/admission.ts';
import { PhoneLists } from './phone-lists.ts';

export const apiPhoneLists = Symbol('the API’s lists for a phone');

@Controller()
export class PhoneListsController {
  private readonly lists: PhoneLists;

  constructor(@Inject(apiPhoneLists) lists: PhoneLists) {
    this.lists = lists;
  }

  @Serves(phoneListsEndpoint)
  async current(@Req() request: FastifyRequest): Promise<PhoneListsAnswer> {
    const monitor = monitorOf(request);
    const taken = await this.lists.taken(monitor.userId, monitor.deviceId);
    request.log.info(
      {
        deviceId: monitor.deviceId,
        userId: monitor.userId,
        ...(taken.taken
          ? { assignmentId: taken.assignment.id, setupVersion: taken.lists.setupVersion }
          : { noAssignment: taken.why }),
      },
      'A phone read its lists.',
    );
    return phoneListsAnswerSchema.parse(
      taken.taken
        ? { assignment: taken.assignment, noAssignment: null, lists: taken.lists }
        : { assignment: null, noAssignment: taken.why, lists: null },
    );
  }
}
