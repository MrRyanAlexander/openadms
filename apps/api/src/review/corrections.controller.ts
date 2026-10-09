// The endpoints of corrections to a ticket's own records (spec/parts/08-review-and-corrections.md
// steps 2…4; AC-04-102, 103; AC-10-27, 28, 37; BACKLOG 2.4.4; ADR-028, 051, 337, 364, 431): a
// field event's captured details, its number, a line of its items, a ticket it carries, a
// photograph's two marks and a scale receipt. The door has already asked the caller's role and
// that they hold the action's own permission, correct or renumber (admission.ts), and the
// boundary has read what was sent by the request's schema; the service asks the permission again
// inside its own piece of work, and queues the tickets the change moves there. The log says what
// was done or why not, by code: never a number, a value, a label or a note.
import {
  correctCarriedTicketEndpoint,
  correctFieldEventEndpoint,
  correctItemLineEndpoint,
  correctScaleReceiptEndpoint,
  markPhotographEndpoint,
  renumberFieldEventEndpoint,
  type BodyOf,
  type ParamsOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { stated } from '../setup/setup-answered.ts';
import { callerOf } from '../sign-in/admission.ts';
import { Corrections } from './corrections.ts';
import {
  carriedTicketRecord,
  fieldEventRecord,
  itemLineRecord,
  photographRecord,
  reviewed,
  scaleReceiptRecord,
} from './review-answered.ts';

export const apiCorrections = Symbol('the API’s corrections');

@Controller()
export class CorrectionsController {
  private readonly corrections: Corrections;

  constructor(@Inject(apiCorrections) corrections: Corrections) {
    this.corrections = corrections;
  }

  @Serves(correctFieldEventEndpoint)
  async fieldEvent(
    @Param() params: ParamsOf<typeof correctFieldEventEndpoint>,
    @Body() body: BodyOf<typeof correctFieldEventEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const { startedAt, endedAt, ...rest } = stated(body.changes);
    const outcome = await this.corrections.fieldEvent(
      callerOf(request).userId,
      params.fieldEventId,
      {
        ...rest,
        ...(startedAt === undefined ? {} : { startedAt: new Date(startedAt) }),
        ...(endedAt === undefined ? {} : { endedAt: new Date(endedAt) }),
      },
      body.note,
    );
    return correctFieldEventEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => fieldEventRecord(record),
        'A field event was corrected.',
      ),
    );
  }

  @Serves(renumberFieldEventEndpoint)
  async renumber(
    @Param() params: ParamsOf<typeof renumberFieldEventEndpoint>,
    @Body() body: BodyOf<typeof renumberFieldEventEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.renumber(
      callerOf(request).userId,
      params.fieldEventId,
      stated({ ticketNumber: body.ticketNumber, splitSuffix: body.splitSuffix }),
      body.note,
    );
    return renumberFieldEventEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => fieldEventRecord(record),
        'A field event was renumbered.',
      ),
    );
  }

  @Serves(correctItemLineEndpoint)
  async itemLine(
    @Param() params: ParamsOf<typeof correctItemLineEndpoint>,
    @Body() body: BodyOf<typeof correctItemLineEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.itemLine(
      callerOf(request).userId,
      params.fieldEventId,
      params.itemNameId,
      body.quantity,
      body.note,
    );
    return correctItemLineEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => itemLineRecord(record),
        'An item line was corrected.',
      ),
    );
  }

  @Serves(correctCarriedTicketEndpoint)
  async carriedTicket(
    @Param() params: ParamsOf<typeof correctCarriedTicketEndpoint>,
    @Body() body: BodyOf<typeof correctCarriedTicketEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.carriedTicket(
      callerOf(request).userId,
      params.fieldEventId,
      body.carriedTicketNumber,
      body.carried,
      body.note,
    );
    return correctCarriedTicketEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => carriedTicketRecord(record),
        'A carried ticket was corrected.',
      ),
    );
  }

  @Serves(markPhotographEndpoint)
  async photograph(
    @Param() params: ParamsOf<typeof markPhotographEndpoint>,
    @Body() body: BodyOf<typeof markPhotographEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.photograph(
      callerOf(request).userId,
      params.photoId,
      stated(body.marks),
      body.note,
    );
    return markPhotographEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => photographRecord(record),
        'A photograph was marked.',
      ),
    );
  }

  @Serves(correctScaleReceiptEndpoint)
  async scaleReceipt(
    @Param() params: ParamsOf<typeof correctScaleReceiptEndpoint>,
    @Body() body: BodyOf<typeof correctScaleReceiptEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.scaleReceipt(
      callerOf(request).userId,
      params.scaleReceiptId,
      stated(body.changes),
      body.note,
    );
    return correctScaleReceiptEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => scaleReceiptRecord(record),
        'A scale receipt was corrected.',
      ),
    );
  }
}
