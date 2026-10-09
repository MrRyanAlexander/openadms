// The endpoints of a day's assignments (ARCHITECTURE §7; AC-02-24…32; AC-10-27; BACKLOG 2.4.3,
// C102; ADR-240, 429): a project's board for one day read a page at a time, an assignment
// written, changed and withdrawn. The door has already asked the caller's role and, for a
// change, that they hold Dispatch (admission.ts); the service asks again inside its own piece of
// work. The log says what was done or why not, by code: never a name.
import {
  assignmentsAnswerSchema,
  changeAssignmentEndpoint,
  listAssignmentsEndpoint,
  withdrawAssignmentEndpoint,
  writeAssignmentEndpoint,
  type AssignmentsAnswer,
  type BodyOf,
  type ParamsOf,
  type QueryOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { answered, stated } from '../setup/setup-answered.ts';
import { callerOf } from '../sign-in/admission.ts';
import { Assignments, type AssignmentRead } from './assignments.ts';

export const apiAssignments = Symbol('the API’s assignments');

// A page's size where the request names none.
const assignmentsPage = 50;

const asRead = (assignment: AssignmentRead): AssignmentRead => assignment;

@Controller()
export class AssignmentsController {
  private readonly assignments: Assignments;

  constructor(@Inject(apiAssignments) assignments: Assignments) {
    this.assignments = assignments;
  }

  @Serves(listAssignmentsEndpoint)
  async list(
    @Param() params: ParamsOf<typeof listAssignmentsEndpoint>,
    @Query() query: QueryOf<typeof listAssignmentsEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<AssignmentsAnswer> {
    const outcome = await this.assignments.list(callerOf(request).userId, params.projectId, {
      workDate: query.workDate,
      withdrawn: query.withdrawn === 'true',
      after: query.after,
      limit: query.limit === undefined ? assignmentsPage : Number(query.limit),
    });
    if (!outcome.done) {
      throw new Refusal(outcome.code, outcome.code === 'NOT_FOUND' ? 404 : 403);
    }
    return assignmentsAnswerSchema.parse({
      assignments: outcome.assignments,
      next: outcome.next,
    });
  }

  @Serves(writeAssignmentEndpoint)
  async write(
    @Param() params: ParamsOf<typeof writeAssignmentEndpoint>,
    @Body() body: BodyOf<typeof writeAssignmentEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.assignments.assign(callerOf(request).userId, {
      projectId: params.projectId,
      ...body,
    });
    return writeAssignmentEndpoint.answer.parse(
      answered(request, outcome, asRead, 'An assignment was written.'),
    );
  }

  @Serves(changeAssignmentEndpoint)
  async change(
    @Param() params: ParamsOf<typeof changeAssignmentEndpoint>,
    @Body() body: BodyOf<typeof changeAssignmentEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.assignments.change(
      callerOf(request).userId,
      params.assignmentId,
      stated(body),
    );
    return changeAssignmentEndpoint.answer.parse(
      answered(request, outcome, asRead, 'An assignment was changed.'),
    );
  }

  @Serves(withdrawAssignmentEndpoint)
  async withdraw(
    @Param() params: ParamsOf<typeof withdrawAssignmentEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.assignments.withdraw(callerOf(request).userId, params.assignmentId);
    return withdrawAssignmentEndpoint.answer.parse(
      answered(request, outcome, asRead, 'An assignment was withdrawn.'),
    );
  }
}
