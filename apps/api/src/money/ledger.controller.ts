// The ledger, a project's tickets to QC and lock, and a project's audit trail (REQ-406, 407;
// spec/parts/07, 09; ADR-224, 228, 539). The door has already asked the caller's role and, for
// the ledger and the tickets, that they hold "view review"; each service asks again inside its
// own piece of work. The log says what was read, by count: never a number, a name or an amount.
import {
  listProjectTicketsEndpoint,
  readLedgerEndpoint,
  readProjectAuditTrailEndpoint,
  type ParamsOf,
  type QueryOf,
} from '@open-adms/contracts';
import { Controller, Inject, Param, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { AuditTrail } from '../review/audit-trail.ts';
import { apiAuditTrail } from '../review/review-reads.controller.ts';
import { callerOf } from '../sign-in/admission.ts';
import { Ledger } from './ledger.ts';

export const apiLedger = Symbol('the API’s ledger');

// A page's size where the request names none.
const pageOf = 50;
export const limitOf = (limit: string | undefined): number =>
  limit === undefined ? pageOf : Number(limit);
export const yesOrNo = (said: 'true' | 'false' | undefined): boolean | undefined =>
  said === undefined ? undefined : said === 'true';

@Controller()
export class LedgerController {
  private readonly ledger: Ledger;
  private readonly auditTrail: AuditTrail;

  constructor(@Inject(apiLedger) ledger: Ledger, @Inject(apiAuditTrail) auditTrail: AuditTrail) {
    this.ledger = ledger;
    this.auditTrail = auditTrail;
  }

  @Serves(readLedgerEndpoint)
  async ledgerRead(
    @Param() params: ParamsOf<typeof readLedgerEndpoint>,
    @Query() query: QueryOf<typeof readLedgerEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const answer = await this.ledger.read(callerOf(request).userId, params.projectId, {
      workflow: query.workflow,
      payItemId: query.payItemId,
      primeId: query.primeId,
      invoiceBatchId: query.invoiceBatchId,
      locked: yesOrNo(query.locked),
      from: query.from,
      to: query.to,
      after: query.after,
      limit: limitOf(query.limit),
    });
    request.log.info({ lines: answer.lines.length }, 'A person read a project’s ledger.');
    return readLedgerEndpoint.answer.parse(answer);
  }

  @Serves(listProjectTicketsEndpoint)
  async tickets(
    @Param() params: ParamsOf<typeof listProjectTicketsEndpoint>,
    @Query() query: QueryOf<typeof listProjectTicketsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listProjectTicketsEndpoint.answer.parse(
      await this.ledger.tickets(callerOf(request).userId, params.projectId, {
        workflow: query.workflow,
        status: query.status,
        qcStatus: query.qcStatus,
        locked: yesOrNo(query.locked),
        invoiceBatchId: query.invoiceBatchId,
        from: query.from,
        to: query.to,
        after: query.after,
        limit: limitOf(query.limit),
      }),
    );
  }

  @Serves(readProjectAuditTrailEndpoint)
  async auditRecords(
    @Param() params: ParamsOf<typeof readProjectAuditTrailEndpoint>,
    @Query() query: QueryOf<typeof readProjectAuditTrailEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return readProjectAuditTrailEndpoint.answer.parse(
      await this.auditTrail.projectHistory(callerOf(request).userId, params.projectId, {
        domain: query.domain,
        actorId: query.actorId,
        after: query.after,
        limit: limitOf(query.limit),
      }),
    );
  }
}
