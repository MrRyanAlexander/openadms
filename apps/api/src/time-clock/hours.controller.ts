// The endpoints of the time clock's hours (REQ-310; AC-02-50, 53…55; BACKLOG 3.7.1; ADR-241,
// 598): a project's workers' days read a page at a time, as the export of hours reads them; a
// day approved and unlocked. The door has already asked the caller's role and, for an approval
// or an unlock, that they hold "approve hours" (admission.ts); the service asks again inside its
// own piece of work, with "view dispatch" beside it. The log says what was done or why not, by
// code: never a name.
import {
  approveDayEndpoint,
  hoursAnswerSchema,
  listHoursEndpoint,
  unlockDayEndpoint,
  type BodyOf,
  type HoursAnswer,
  type ParamsOf,
  type QueryOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { answered } from '../setup/setup-answered.ts';
import { callerOf } from '../sign-in/admission.ts';
import { Hours, type DayApprovalRead } from './hours.ts';

export const apiHours = Symbol('the API’s hours');

// A page's size where the request names none.
const hoursPage = 50;

const asRead = (approval: DayApprovalRead): DayApprovalRead => approval;

@Controller()
export class HoursController {
  private readonly hours: Hours;

  constructor(@Inject(apiHours) hours: Hours) {
    this.hours = hours;
  }

  @Serves(listHoursEndpoint)
  async list(
    @Param() params: ParamsOf<typeof listHoursEndpoint>,
    @Query() query: QueryOf<typeof listHoursEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<HoursAnswer> {
    const outcome = await this.hours.list(callerOf(request).userId, params.projectId, {
      from: query.from,
      to: query.to,
      after: query.after,
      limit: query.limit === undefined ? hoursPage : Number(query.limit),
    });
    if (!outcome.done) {
      throw new Refusal(outcome.code, outcome.code === 'NOT_FOUND' ? 404 : 403);
    }
    return hoursAnswerSchema.parse({ days: outcome.days, next: outcome.next });
  }

  @Serves(approveDayEndpoint)
  async approve(
    @Param() params: ParamsOf<typeof approveDayEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.hours.approve(callerOf(request).userId, params.assignmentId);
    return approveDayEndpoint.answer.parse(
      answered(request, outcome, asRead, 'A worker’s day was approved.'),
    );
  }

  @Serves(unlockDayEndpoint)
  async unlock(
    @Param() params: ParamsOf<typeof unlockDayEndpoint>,
    @Body() body: BodyOf<typeof unlockDayEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.hours.unlock(
      callerOf(request).userId,
      params.assignmentId,
      body.note,
    );
    return unlockDayEndpoint.answer.parse(
      answered(request, outcome, asRead, 'A worker’s approved day was unlocked.'),
    );
  }
}
