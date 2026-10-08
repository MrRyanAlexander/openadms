// Setup's endpoints for the firm's own values on its lists (spec/LISTS.md; ARCHITECTURE §6;
// AC-10-27; BACKLOG 2.4.2; ADR-070, 194, 302, 424): a debris type in the firm's library, a
// payable type. The door has already asked the caller's role and that they hold Setup; the
// service asks again inside its own piece of work.
import { addDebrisTypeEndpoint, addPayableTypeEndpoint, type BodyOf } from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { ListSetup } from './list-setup.ts';
import { answered } from './setup-answered.ts';
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
}
