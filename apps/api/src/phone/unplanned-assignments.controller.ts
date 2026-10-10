// An unplanned assignment reported by the phone it was made on (ARCHITECTURE §7's note, §7.5,
// §9 (3), (4); AC-02-38, AC-05-40; BACKLOG 2.5.4, C46, C93; ADR-240, 438, 456, 457). Open to a
// phone that has proved itself; nobody need be signed in, and no passcode is sent. The log says
// which phone reported which assignment and what it was answered, by id and code: never a
// monitor's name, a site or what the work is. A site move and a monitor switch are reported
// here too (ADR-458): the log says what the assignment was made at.
import {
  reportUnplannedAssignmentEndpoint,
  unplannedAssignmentAnswerSchema,
  type BodyOf,
  type UnplannedAssignmentAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { phoneOf } from '../sign-in/admission.ts';
import { UnplannedAssignments } from './unplanned-assignments.ts';

export const apiUnplannedAssignments = Symbol('the API’s unplanned assignments from phones');

@Controller()
export class UnplannedAssignmentsController {
  private readonly unplanned: UnplannedAssignments;

  constructor(@Inject(apiUnplannedAssignments) unplanned: UnplannedAssignments) {
    this.unplanned = unplanned;
  }

  @Serves(reportUnplannedAssignmentEndpoint)
  async report(
    @Body() body: BodyOf<typeof reportUnplannedAssignmentEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<UnplannedAssignmentAnswer> {
    const phone = phoneOf(request);
    const received = await this.unplanned.received(phone.deviceId, {
      ...body,
      madeAt: new Date(body.madeAt),
    });
    const reason = received.answer === 'NOT_SAVED' ? received.reason : null;
    request.log.info(
      {
        deviceId: phone.deviceId,
        assignmentId: body.id,
        occasion: body.occasion,
        answer: received.answer,
        ...(reason === null ? {} : { reason }),
        ...(received.answer === 'SAVED' ? { workDate: received.workDate } : {}),
      },
      'A phone reported an unplanned assignment made under the master passcode.',
    );
    return unplannedAssignmentAnswerSchema.parse({
      assignmentId: body.id,
      answer: received.answer,
      reason,
    });
  }
}
