// Setup's endpoints for the firm's own values on its lists (spec/LISTS.md; ARCHITECTURE §6;
// AC-10-27; BACKLOG 2.4.2; ADR-070, 194, 302, 424, 527 (6)): a debris type in the firm's
// library, a payable type; any list's value, or a project's field tag, renamed, archived and put
// back. The door has already asked the caller's role and that they hold Setup; the
// service asks again inside its own piece of work.
import {
  addDebrisTypeEndpoint,
  addListValueEndpoint,
  addPayableTypeEndpoint,
  archiveListValueEndpoint,
  renameListValueEndpoint,
  unarchiveListValueEndpoint,
  type BodyOf,
  type ParamsOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { ListSetup } from './list-setup.ts';
import { answered, stated } from './setup-answered.ts';
import { listValueRecord } from './setup-records.ts';

export const apiListSetup = Symbol('the API’s list setup');

@Controller()
export class ListSetupController {
  private readonly lists: ListSetup;

  constructor(@Inject(apiListSetup) lists: ListSetup) {
    this.lists = lists;
  }

  @Serves(addDebrisTypeEndpoint)
  async addDebrisType(
    @Body() body: BodyOf<typeof addDebrisTypeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.lists.debrisType(callerOf(request).userId, body.name);
    return addDebrisTypeEndpoint.answer.parse(
      answered(request, outcome, listValueRecord, 'A debris type was added to the firm’s library.'),
    );
  }

  @Serves(addPayableTypeEndpoint)
  async addPayableType(
    @Body() body: BodyOf<typeof addPayableTypeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.lists.payableType(callerOf(request).userId, body.name);
    return addPayableTypeEndpoint.answer.parse(
      answered(request, outcome, listValueRecord, 'A payable type was added to the firm’s list.'),
    );
  }

  @Serves(addListValueEndpoint)
  async add(
    @Param() params: ParamsOf<typeof addListValueEndpoint>,
    @Body() body: BodyOf<typeof addListValueEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.lists.add(callerOf(request).userId, params.list, stated(body));
    return addListValueEndpoint.answer.parse(
      answered(request, outcome, listValueRecord, 'A value was added to one of the firm’s lists.'),
    );
  }

  @Serves(renameListValueEndpoint)
  async rename(
    @Param() params: ParamsOf<typeof renameListValueEndpoint>,
    @Body() body: BodyOf<typeof renameListValueEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.lists.rename(
      callerOf(request).userId,
      params.list,
      params.valueId,
      body.name,
    );
    return renameListValueEndpoint.answer.parse(
      answered(request, outcome, listValueRecord, 'A list value was renamed.'),
    );
  }

  @Serves(archiveListValueEndpoint)
  async archive(
    @Param() params: ParamsOf<typeof archiveListValueEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.lists.archive(
      callerOf(request).userId,
      params.list,
      params.valueId,
      true,
    );
    return archiveListValueEndpoint.answer.parse(
      answered(request, outcome, listValueRecord, 'A list value was archived.'),
    );
  }

  @Serves(unarchiveListValueEndpoint)
  async unarchive(
    @Param() params: ParamsOf<typeof unarchiveListValueEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.lists.archive(
      callerOf(request).userId,
      params.list,
      params.valueId,
      false,
    );
    return unarchiveListValueEndpoint.answer.parse(
      answered(request, outcome, listValueRecord, 'A list value was put back.'),
    );
  }
}
