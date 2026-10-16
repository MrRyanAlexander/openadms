// The back office's reads of what it reviews, fixes and QCs, and its bulk acts (spec/parts/
// 08-review-and-corrections.md, "One review queue"; spec/parts/09; REQ-217; AC-10-27; BACKLOG
// 2.8.8; ADR-224, 228, 535). The door has already asked the caller's role, and for a bulk act or
// a batch renamed that they hold its permission; each service asks again inside its own piece of
// work. **A bulk act is each item's own act, in order** (ADR-535 (4)): one refused, by the
// domain's rules or the database's own, is answered with its reason and never stops the rest. The
// log says what was read or done, by count: never a name, a number or a note.
import {
  listCertificationsEndpoint,
  listDropOffLogsEndpoint,
  listFlagsEndpoint,
  listIncidentsEndpoint,
  listInvoiceBatchesEndpoint,
  listRoesEndpoint,
  listSurveysEndpoint,
  lockSeveralAsInvoicedEndpoint,
  readCertificationEndpoint,
  readFieldEventEndpoint,
  readInvoiceBatchEndpoint,
  readScaleReceiptEndpoint,
  readTicketEndpoint,
  renameInvoiceBatchEndpoint,
  reviewQueueEndpoint,
  setQcStatusesEndpoint,
  type BodyOf,
  type ParamsOf,
  type QueryOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { databaseRefusalOf } from '../process/database-refusal.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import type { Outcome } from '../setup/setup-service.ts';
import { callerOf } from '../sign-in/admission.ts';
import { InvoiceLocks } from './invoice-locks.ts';
import { QcMarks } from './qc-marks.ts';
import {
  invoiceBatchRecord,
  invoiceLockRecord,
  qcMarkRecord,
  reviewed,
} from './review-answered.ts';
import { apiInvoiceLocks, apiQcMarks } from './review-marks.controller.ts';
import { ReviewReads, type PageAsked } from './review-reads.ts';

export const apiReviewReads = Symbol('the API’s reads for review');

// A page's size where the request names none.
const pageOf = 50;
const paged = (query: {
  readonly after?: string | undefined;
  readonly limit?: string | undefined;
}): PageAsked => ({
  after: query.after,
  limit: query.limit === undefined ? pageOf : Number(query.limit),
});
const yesOrNo = (said: 'true' | 'false' | undefined): boolean | undefined =>
  said === undefined ? undefined : said === 'true';

type Several<A> = { saved: true; record: A } | { saved: false; reason: string; message: string };

// Each item its own act, in order: saved, or refused with its reason. A person who may not do
// the act at all is refused it whole, as the single act would be.
async function eachOf<I, T, A>(
  request: FastifyRequest,
  items: readonly I[],
  act: (item: I) => Promise<Outcome<T>>,
  shown: (record: T) => A,
  done: string,
): Promise<{ outcomes: Several<A>[] }> {
  const outcomes: Several<A>[] = [];
  for (const item of items) {
    let outcome: Outcome<T>;
    try {
      outcome = await act(item);
    } catch (thrown) {
      const refusal = databaseRefusalOf(thrown);
      if (refusal === undefined) throw thrown;
      outcomes.push({ saved: false, reason: refusal.code, message: refusal.said });
      continue;
    }
    if (outcome.saved) {
      outcomes.push({ saved: true, record: shown(outcome.record) });
    } else if (outcome.refusal.code === 'NOT_PERMITTED') {
      throw new Refusal('NOT_ALLOWED', 403);
    } else {
      outcomes.push({
        saved: false,
        reason: outcome.refusal.code,
        message: outcome.refusal.message,
      });
    }
  }
  request.log.info(
    {
      saved: outcomes.filter((each) => each.saved).length,
      refused: outcomes.filter((each) => !each.saved).length,
    },
    done,
  );
  return { outcomes };
}

@Controller()
export class ReviewReadsController {
  private readonly reads: ReviewReads;
  private readonly qcMarks: QcMarks;
  private readonly invoiceLocks: InvoiceLocks;

  constructor(
    @Inject(apiReviewReads) reads: ReviewReads,
    @Inject(apiQcMarks) qcMarks: QcMarks,
    @Inject(apiInvoiceLocks) invoiceLocks: InvoiceLocks,
  ) {
    this.reads = reads;
    this.qcMarks = qcMarks;
    this.invoiceLocks = invoiceLocks;
  }

  @Serves(reviewQueueEndpoint)
  async reviewQueue(
    @Param() params: ParamsOf<typeof reviewQueueEndpoint>,
    @Query() query: QueryOf<typeof reviewQueueEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return reviewQueueEndpoint.answer.parse(
      await this.reads.reviewQueue(callerOf(request).userId, params.projectId, {
        workflow: query.workflow,
        cause: query.cause,
        ...paged(query),
      }),
    );
  }

  @Serves(listFlagsEndpoint)
  async flags(
    @Param() params: ParamsOf<typeof listFlagsEndpoint>,
    @Query() query: QueryOf<typeof listFlagsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listFlagsEndpoint.answer.parse(
      await this.reads.flags(callerOf(request).userId, params.projectId, {
        cause: query.cause,
        open: yesOrNo(query.open),
        ...paged(query),
      }),
    );
  }

  @Serves(readTicketEndpoint)
  async ticket(
    @Param() params: ParamsOf<typeof readTicketEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return readTicketEndpoint.answer.parse(
      await this.reads.ticket(
        callerOf(request).userId,
        params.projectId,
        params.workflow,
        params.ticketNumber,
      ),
    );
  }

  @Serves(readFieldEventEndpoint)
  async fieldEvent(
    @Param() params: ParamsOf<typeof readFieldEventEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return readFieldEventEndpoint.answer.parse(
      await this.reads.fieldEvent(callerOf(request).userId, params.fieldEventId),
    );
  }

  @Serves(readScaleReceiptEndpoint)
  async scaleReceipt(
    @Param() params: ParamsOf<typeof readScaleReceiptEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return readScaleReceiptEndpoint.answer.parse(
      await this.reads.scaleReceipt(callerOf(request).userId, params.scaleReceiptId),
    );
  }

  @Serves(listCertificationsEndpoint)
  async certifications(
    @Param() params: ParamsOf<typeof listCertificationsEndpoint>,
    @Query() query: QueryOf<typeof listCertificationsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listCertificationsEndpoint.answer.parse(
      await this.reads.certifications(callerOf(request).userId, params.projectId, {
        certNumber: query.certNumber,
        ...paged(query),
      }),
    );
  }

  @Serves(readCertificationEndpoint)
  async certification(
    @Param() params: ParamsOf<typeof readCertificationEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return readCertificationEndpoint.answer.parse(
      await this.reads.certification(callerOf(request).userId, params.certificationId),
    );
  }

  @Serves(listRoesEndpoint)
  async roes(
    @Param() params: ParamsOf<typeof listRoesEndpoint>,
    @Query() query: QueryOf<typeof listRoesEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listRoesEndpoint.answer.parse(
      await this.reads.roes(callerOf(request).userId, params.projectId, paged(query)),
    );
  }

  @Serves(listSurveysEndpoint)
  async surveys(
    @Param() params: ParamsOf<typeof listSurveysEndpoint>,
    @Query() query: QueryOf<typeof listSurveysEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listSurveysEndpoint.answer.parse(
      await this.reads.surveys(callerOf(request).userId, params.projectId, paged(query)),
    );
  }

  @Serves(listIncidentsEndpoint)
  async incidents(
    @Param() params: ParamsOf<typeof listIncidentsEndpoint>,
    @Query() query: QueryOf<typeof listIncidentsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listIncidentsEndpoint.answer.parse(
      await this.reads.incidents(callerOf(request).userId, params.projectId, paged(query)),
    );
  }

  @Serves(listDropOffLogsEndpoint)
  async dropOffLogs(
    @Param() params: ParamsOf<typeof listDropOffLogsEndpoint>,
    @Query() query: QueryOf<typeof listDropOffLogsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listDropOffLogsEndpoint.answer.parse(
      await this.reads.dropOffLogs(callerOf(request).userId, params.projectId, paged(query)),
    );
  }

  @Serves(listInvoiceBatchesEndpoint)
  async invoiceBatches(
    @Param() params: ParamsOf<typeof listInvoiceBatchesEndpoint>,
    @Query() query: QueryOf<typeof listInvoiceBatchesEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listInvoiceBatchesEndpoint.answer.parse(
      await this.reads.invoiceBatches(callerOf(request).userId, params.projectId, paged(query)),
    );
  }

  @Serves(readInvoiceBatchEndpoint)
  async invoiceBatch(
    @Param() params: ParamsOf<typeof readInvoiceBatchEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return readInvoiceBatchEndpoint.answer.parse(
      await this.reads.invoiceBatch(callerOf(request).userId, params.invoiceBatchId),
    );
  }

  @Serves(renameInvoiceBatchEndpoint)
  async renameInvoiceBatch(
    @Param() params: ParamsOf<typeof renameInvoiceBatchEndpoint>,
    @Body() body: BodyOf<typeof renameInvoiceBatchEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.invoiceLocks.rename(
      callerOf(request).userId,
      params.invoiceBatchId,
      body.name,
    );
    return renameInvoiceBatchEndpoint.answer.parse(
      reviewed(request, outcome, invoiceBatchRecord, 'An invoice batch was renamed.'),
    );
  }

  @Serves(setQcStatusesEndpoint)
  async setQcStatuses(
    @Body() body: BodyOf<typeof setQcStatusesEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const person = callerOf(request).userId;
    return setQcStatusesEndpoint.answer.parse(
      await eachOf(
        request,
        body.marks,
        (mark) => this.qcMarks.set(person, mark.record, mark.status, mark.note),
        qcMarkRecord,
        'QC statuses were set on several records.',
      ),
    );
  }

  @Serves(lockSeveralAsInvoicedEndpoint)
  async lockSeveral(
    @Body() body: BodyOf<typeof lockSeveralAsInvoicedEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const person = callerOf(request).userId;
    return lockSeveralAsInvoicedEndpoint.answer.parse(
      await eachOf(
        request,
        body.tickets,
        (ticket) => this.invoiceLocks.lock(person, ticket, body.invoiceBatchId),
        invoiceLockRecord,
        'Several tickets were locked as invoiced.',
      ),
    );
  }
}
