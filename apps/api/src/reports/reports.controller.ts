// A project's reports (REQ-409, 410; spec/FROM-BUILD-1.md §9): the debris totals, the email
// summary and the daily report's PDF, each read afresh and kept nowhere. The door has already
// asked the caller's role and "view review"; the service asks again inside its own piece of work.
// **A file is handed back as a download that is never run** (OWASP ASVS 5.0 V3.2.1, V5.4), as a
// photograph's is: its type the server's, `Content-Disposition: attachment` with a name the
// server makes, and a policy that sandboxes it. The log says what was made, by size: never a
// figure, a name or an address.
import {
  dailyReportFileEndpoint,
  exportFileEndpoint,
  photoPdfEndpoint,
  receiptBatchEndpoint,
  readDebrisTotalsEndpoint,
  readEmailSummaryEndpoint,
  type ParamsOf,
  type QueryOf,
} from '@open-adms/contracts';
import { Controller, Inject, Param, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { fileAnswerPolicy } from '../media/photograph-files.controller.ts';
import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { dailyReportPdf } from './daily-report.ts';
import { DebrisTotals, type TotalsAsked } from './debris-totals.ts';
import { Documents } from './documents.ts';
import { Exports } from './exports.ts';
import { emailText, summaryOf } from './summary.ts';

export const apiDebrisTotals = Symbol('the API’s debris totals');
export const apiExports = Symbol('the API’s exports');
export const apiDocuments = Symbol('the API’s photo PDFs and receipt batch');

type Asked = QueryOf<typeof readDebrisTotalsEndpoint>;
const totalsAsked = (query: Asked): TotalsAsked => ({
  from: query.from,
  to: query.to,
  workflow: query.workflow,
  debrisTypeId: query.debrisTypeId,
  siteId: query.siteId,
  contractorId: query.contractorId,
});

// A file the server made, as a download: its type, and a name made of what it holds.
export function asDownload(
  reply: FastifyReply,
  contentType: string,
  name: string,
  bytes: Uint8Array,
): Buffer {
  void reply.headers({
    'content-type': contentType,
    'content-disposition': `attachment; filename="${name}"`,
    'content-security-policy': fileAnswerPolicy,
  });
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

@Controller()
export class ReportsController {
  private readonly totals: DebrisTotals;
  private readonly exports: Exports;
  private readonly documents: Documents;

  constructor(
    @Inject(apiDebrisTotals) totals: DebrisTotals,
    @Inject(apiExports) exports: Exports,
    @Inject(apiDocuments) documents: Documents,
  ) {
    this.totals = totals;
    this.exports = exports;
    this.documents = documents;
  }

  @Serves(readDebrisTotalsEndpoint)
  async debrisTotals(
    @Param() params: ParamsOf<typeof readDebrisTotalsEndpoint>,
    @Query() query: Asked,
    @Req() request: FastifyRequest,
  ) {
    return readDebrisTotalsEndpoint.answer.parse(
      await this.totals.read(callerOf(request).userId, params.projectId, totalsAsked(query)),
    );
  }

  @Serves(readEmailSummaryEndpoint)
  async emailSummary(
    @Param() params: ParamsOf<typeof readEmailSummaryEndpoint>,
    @Query() query: QueryOf<typeof readEmailSummaryEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const totals = await this.totals.read(
      callerOf(request).userId,
      params.projectId,
      totalsAsked(query),
    );
    const summary = summaryOf(totals);
    return readEmailSummaryEndpoint.answer.parse({
      subject: `${summary.title} – ${summary.subtitle}`,
      text: emailText(summary),
    });
  }

  @Serves(dailyReportFileEndpoint)
  async dailyReport(
    @Param() params: ParamsOf<typeof dailyReportFileEndpoint>,
    @Query() query: QueryOf<typeof dailyReportFileEndpoint>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const { totals, map, contactEmail, brand } = await this.totals.withMap(
      callerOf(request).userId,
      params.projectId,
      totalsAsked(query),
    );
    const bytes = dailyReportPdf(totals, map, contactEmail, brand);
    request.log.info({ bytes: bytes.byteLength }, 'A person made a project’s daily report.');
    return asDownload(
      reply,
      'application/pdf',
      `daily-report-${query.from}${query.to === query.from ? '' : `-to-${query.to}`}.pdf`,
      bytes,
    );
  }

  @Serves(exportFileEndpoint)
  async exportFile(
    @Param() params: ParamsOf<typeof exportFileEndpoint>,
    @Query() query: QueryOf<typeof exportFileEndpoint>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const made = await this.exports.file(
      callerOf(request).userId,
      params.projectId,
      params.dataset,
      query.format,
      {
        workflow: query.workflow,
        status: query.status,
        qcStatus: query.qcStatus,
        payItemId: query.payItemId,
        primeId: query.primeId,
        invoiceBatchId: query.invoiceBatchId,
        locked: query.locked === undefined ? undefined : query.locked === 'true',
        from: query.from,
        to: query.to,
      },
    );
    request.log.info(
      { rows: made.rows, bytes: made.bytes.byteLength },
      'A person exported a project’s records.',
    );
    return asDownload(reply, made.contentType, `${params.dataset}.${made.extension}`, made.bytes);
  }

  @Serves(photoPdfEndpoint)
  async photoPdf(
    @Param() params: ParamsOf<typeof photoPdfEndpoint>,
    @Query() query: QueryOf<typeof photoPdfEndpoint>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const bytes = await this.documents.photoPdf(callerOf(request).userId, params.projectId, query);
    request.log.info({ bytes: bytes.byteLength }, 'A person made a photo PDF.');
    return asDownload(reply, 'application/pdf', `photographs-${query.items}.pdf`, bytes);
  }

  @Serves(receiptBatchEndpoint)
  async receiptBatch(
    @Param() params: ParamsOf<typeof receiptBatchEndpoint>,
    @Query() query: QueryOf<typeof receiptBatchEndpoint>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const made = await this.documents.receiptBatch(
      callerOf(request).userId,
      params.projectId,
      query,
    );
    request.log.info(
      { bytes: made.bytes.byteLength, notFound: made.notFound.length },
      'A person made a receipt batch.',
    );
    return asDownload(reply, 'application/pdf', `receipts-${query.content}.pdf`, made.bytes);
  }
}
