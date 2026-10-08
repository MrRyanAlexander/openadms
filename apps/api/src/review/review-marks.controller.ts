// The endpoints of review's marks (spec/parts/08-review-and-corrections.md steps 5…7;
// spec/parts/09-invoice-deliver-closeout.md, invoicing; AC-02-12; AC-09-18; AC-10-27, 28;
// BACKLOG 2.4.4; ADR-364…367, 430): a ticket voided and unvoided, a flag accepted, a QC status
// set, an invoice batch named, a ticket locked as invoiced, put in a batch and unlocked. The door
// has already asked the caller's role and that they hold the action's own permission
// (admission.ts); each service asks again inside its own piece of work, and queues the run its
// action needs there. The log says what was done or why not, by code: never a name, a number or
// a note.
import {
  acceptFlagEndpoint,
  createInvoiceBatchEndpoint,
  lockAsInvoicedEndpoint,
  setLockBatchEndpoint,
  setQcStatusEndpoint,
  unlockInvoicedEndpoint,
  unvoidTicketEndpoint,
  voidTicketEndpoint,
  type BodyOf,
  type ParamsOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { Acceptances } from './acceptances.ts';
import { InvoiceLocks } from './invoice-locks.ts';
import { QcMarks } from './qc-marks.ts';
import {
  flagAcceptanceRecord,
  invoiceBatchRecord,
  invoiceLockRecord,
  qcMarkRecord,
  reviewed,
  ticketUnvoidRecord,
  ticketVoidRecord,
} from './review-answered.ts';
import { Voids } from './voids.ts';

export const apiVoids = Symbol('the API’s voids');
export const apiAcceptances = Symbol('the API’s flag acceptances');
export const apiQcMarks = Symbol('the API’s QC marks');
export const apiInvoiceLocks = Symbol('the API’s invoice locks');

@Controller()
export class ReviewMarksController {
  private readonly voids: Voids;
  private readonly acceptances: Acceptances;
  private readonly qcMarks: QcMarks;
  private readonly invoiceLocks: InvoiceLocks;

  constructor(
    @Inject(apiVoids) voids: Voids,
    @Inject(apiAcceptances) acceptances: Acceptances,
    @Inject(apiQcMarks) qcMarks: QcMarks,
    @Inject(apiInvoiceLocks) invoiceLocks: InvoiceLocks,
  ) {
    this.voids = voids;
    this.acceptances = acceptances;
    this.qcMarks = qcMarks;
    this.invoiceLocks = invoiceLocks;
  }

  @Serves(voidTicketEndpoint)
  async void(
    @Param() params: ParamsOf<typeof voidTicketEndpoint>,
    @Body() body: BodyOf<typeof voidTicketEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.voids.ticket(
      callerOf(request).userId,
      params.projectId,
      { workflow: body.workflow, ticketNumber: body.ticketNumber },
      body.reasonId,
      body.note,
    );
    return voidTicketEndpoint.answer.parse(
      reviewed(request, outcome, ({ record }) => ticketVoidRecord(record), 'A ticket was voided.'),
    );
  }

  @Serves(unvoidTicketEndpoint)
  async unvoid(
    @Param() params: ParamsOf<typeof unvoidTicketEndpoint>,
    @Body() body: BodyOf<typeof unvoidTicketEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.voids.lift(
      callerOf(request).userId,
      params.projectId,
      { workflow: body.workflow, ticketNumber: body.ticketNumber },
      body.note,
    );
    return unvoidTicketEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => ticketUnvoidRecord(record),
        'A ticket was unvoided.',
      ),
    );
  }

  @Serves(acceptFlagEndpoint)
  async accept(
    @Param() params: ParamsOf<typeof acceptFlagEndpoint>,
    @Body() body: BodyOf<typeof acceptFlagEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.acceptances.flag(
      callerOf(request).userId,
      params.flagId,
      body.reasonId,
      body.note,
    );
    return acceptFlagEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => flagAcceptanceRecord(record),
        'A flag was accepted.',
      ),
    );
  }

  @Serves(setQcStatusEndpoint)
  async qc(@Body() body: BodyOf<typeof setQcStatusEndpoint>, @Req() request: FastifyRequest) {
    const outcome = await this.qcMarks.set(
      callerOf(request).userId,
      body.record,
      body.status,
      body.note,
    );
    return setQcStatusEndpoint.answer.parse(
      reviewed(request, outcome, qcMarkRecord, 'A QC status was set.'),
    );
  }

  @Serves(createInvoiceBatchEndpoint)
  async batch(
    @Param() params: ParamsOf<typeof createInvoiceBatchEndpoint>,
    @Body() body: BodyOf<typeof createInvoiceBatchEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.invoiceLocks.batch(
      callerOf(request).userId,
      params.projectId,
      body.name,
    );
    return createInvoiceBatchEndpoint.answer.parse(
      reviewed(request, outcome, invoiceBatchRecord, 'An invoice batch was named.'),
    );
  }

  @Serves(lockAsInvoicedEndpoint)
  async lock(@Body() body: BodyOf<typeof lockAsInvoicedEndpoint>, @Req() request: FastifyRequest) {
    const outcome = await this.invoiceLocks.lock(
      callerOf(request).userId,
      body.ticket,
      body.invoiceBatchId,
    );
    return lockAsInvoicedEndpoint.answer.parse(
      reviewed(request, outcome, invoiceLockRecord, 'A ticket was locked as invoiced.'),
    );
  }

  @Serves(setLockBatchEndpoint)
  async intoBatch(
    @Body() body: BodyOf<typeof setLockBatchEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.invoiceLocks.intoBatch(
      callerOf(request).userId,
      body.ticket,
      body.invoiceBatchId,
    );
    return setLockBatchEndpoint.answer.parse(
      reviewed(request, outcome, invoiceLockRecord, 'A locked ticket’s batch was set.'),
    );
  }

  @Serves(unlockInvoicedEndpoint)
  async unlock(
    @Body() body: BodyOf<typeof unlockInvoicedEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.invoiceLocks.unlock(
      callerOf(request).userId,
      body.ticket,
      body.note,
    );
    return unlockInvoicedEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => invoiceLockRecord(record),
        'A ticket was unlocked.',
      ),
    );
  }
}
