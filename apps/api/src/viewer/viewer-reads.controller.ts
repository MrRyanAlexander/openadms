// A read-only viewer's reads, asked for (ARCHITECTURE §5.5, §6; AC-02-74; AC-10-29, 30, 31;
// BACKLOG 2.4.5; ADR-434). The door has asked that the caller is a read-only viewer; each read
// is then made as that caller, stated to the database by `ViewerReads`. Every one is a GET. A
// photograph's file is read only once the database has shown the viewer its record, and then by
// the key the viewer is never told (ADR-535 (6)), handed back as the back office's is.
import {
  viewerCertificationsEndpoint,
  viewerDropOffLogsEndpoint,
  viewerIncidentsEndpoint,
  viewerPhotographFileEndpoint,
  viewerQuantityLookupEndpoint,
  viewerSetupCheckEndpoint,
  viewerSetupEndpoint,
  viewerSurveysEndpoint,
  viewerProjectsAnswerSchema,
  viewerProjectsEndpoint,
  viewerRoesAnswerSchema,
  viewerRoesEndpoint,
  viewerTicketAnswerSchema,
  viewerTicketEndpoint,
  viewerTicketHistoryEndpoint,
  viewerTicketsAnswerSchema,
  viewerTicketsEndpoint,
  type ParamsOf,
  type QueryOf,
  type ViewerProjectsAnswer,
  type ViewerRoesAnswer,
  type ViewerTicketAnswer,
  type ViewerTicketsAnswer,
} from '@open-adms/contracts';
import type { PhotoFileType } from '@open-adms/domain';
import { Controller, Inject, Param, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { fileAnswerPolicy } from '../media/photograph-files.controller.ts';
import { apiPhotographFiles, PhotographFiles } from '../media/photograph-files.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { ViewerReads } from './viewer-reads.ts';

export const apiViewerReads = Symbol('the API’s reads for a read-only viewer');

const projectsPage = 50;
const extensions: Record<PhotoFileType, string> = {
  'image/jpeg': 'jpg',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/png': 'png',
  'image/tiff': 'tif',
};
// A page of tickets or of ROEs where none is said.
const page = 50;

@Controller()
export class ViewerReadsController {
  private readonly reads: ViewerReads;
  private readonly files: PhotographFiles;

  constructor(
    @Inject(apiViewerReads) reads: ViewerReads,
    @Inject(apiPhotographFiles) files: PhotographFiles,
  ) {
    this.reads = reads;
    this.files = files;
  }

  @Serves(viewerProjectsEndpoint)
  async projects(
    @Query() query: QueryOf<typeof viewerProjectsEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<ViewerProjectsAnswer> {
    return viewerProjectsAnswerSchema.parse(
      await this.reads.projects(callerOf(request).userId, {
        after: query.after,
        limit: query.limit === undefined ? projectsPage : Number(query.limit),
      }),
    );
  }

  @Serves(viewerRoesEndpoint)
  async roes(
    @Param() params: ParamsOf<typeof viewerRoesEndpoint>,
    @Query() query: QueryOf<typeof viewerRoesEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<ViewerRoesAnswer> {
    return viewerRoesAnswerSchema.parse(
      await this.reads.roes(callerOf(request).userId, params.projectId, {
        after: query.after,
        limit: query.limit === undefined ? page : Number(query.limit),
      }),
    );
  }

  @Serves(viewerTicketsEndpoint)
  async tickets(
    @Param() params: ParamsOf<typeof viewerTicketsEndpoint>,
    @Query() query: QueryOf<typeof viewerTicketsEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<ViewerTicketsAnswer> {
    return viewerTicketsAnswerSchema.parse(
      await this.reads.tickets(callerOf(request).userId, params.projectId, {
        workflow: query.workflow,
        after: query.after,
        limit: query.limit === undefined ? page : Number(query.limit),
      }),
    );
  }

  // A ticket the database shows this viewer nothing of is answered as one nobody has: the
  // answer never says that somebody else's exists (AC-10-29).
  @Serves(viewerTicketEndpoint)
  async ticket(
    @Param() params: ParamsOf<typeof viewerTicketEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<ViewerTicketAnswer> {
    const ticket = await this.reads.ticket(
      callerOf(request).userId,
      params.projectId,
      params.workflow,
      params.ticketNumber,
    );
    if (ticket === null) throw new Refusal('NOT_FOUND', 404);
    return viewerTicketAnswerSchema.parse(ticket);
  }

  // What the audit log holds of a ticket, as this viewer is shown it (ADR-544): a ticket the
  // database shows this viewer nothing of is answered as one nobody has.
  @Serves(viewerTicketHistoryEndpoint)
  async ticketHistory(
    @Param() params: ParamsOf<typeof viewerTicketHistoryEndpoint>,
    @Query() query: QueryOf<typeof viewerTicketHistoryEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const history = await this.reads.ticketHistory(
      callerOf(request).userId,
      params.projectId,
      params.workflow,
      params.ticketNumber,
      { after: query.after, limit: query.limit === undefined ? page : Number(query.limit) },
    );
    if (history === null) throw new Refusal('NOT_FOUND', 404);
    return viewerTicketHistoryEndpoint.answer.parse(history);
  }

  @Serves(viewerCertificationsEndpoint)
  async certifications(
    @Param() params: ParamsOf<typeof viewerCertificationsEndpoint>,
    @Query() query: QueryOf<typeof viewerCertificationsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return viewerCertificationsEndpoint.answer.parse(
      await this.reads.certifications(callerOf(request).userId, params.projectId, {
        after: query.after,
        limit: query.limit === undefined ? page : Number(query.limit),
      }),
    );
  }

  @Serves(viewerSurveysEndpoint)
  async surveys(
    @Param() params: ParamsOf<typeof viewerSurveysEndpoint>,
    @Query() query: QueryOf<typeof viewerSurveysEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return viewerSurveysEndpoint.answer.parse(
      await this.reads.surveys(callerOf(request).userId, params.projectId, {
        after: query.after,
        limit: query.limit === undefined ? page : Number(query.limit),
      }),
    );
  }

  @Serves(viewerIncidentsEndpoint)
  async incidents(
    @Param() params: ParamsOf<typeof viewerIncidentsEndpoint>,
    @Query() query: QueryOf<typeof viewerIncidentsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return viewerIncidentsEndpoint.answer.parse(
      await this.reads.incidents(callerOf(request).userId, params.projectId, {
        after: query.after,
        limit: query.limit === undefined ? page : Number(query.limit),
      }),
    );
  }

  @Serves(viewerDropOffLogsEndpoint)
  async dropOffLogs(
    @Param() params: ParamsOf<typeof viewerDropOffLogsEndpoint>,
    @Query() query: QueryOf<typeof viewerDropOffLogsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return viewerDropOffLogsEndpoint.answer.parse(
      await this.reads.dropOffLogs(callerOf(request).userId, params.projectId, {
        after: query.after,
        limit: query.limit === undefined ? page : Number(query.limit),
      }),
    );
  }

  // A project's setup the database doesn't show this viewer is answered as one nobody has.
  @Serves(viewerSetupEndpoint)
  async setup(
    @Param() params: ParamsOf<typeof viewerSetupEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const setup = await this.reads.setup(callerOf(request).userId, params.projectId);
    if (setup === null) throw new Refusal('NOT_FOUND', 404);
    return viewerSetupEndpoint.answer.parse(setup);
  }

  @Serves(viewerSetupCheckEndpoint)
  async setupCheck(
    @Param() params: ParamsOf<typeof viewerSetupCheckEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const check = await this.reads.setupCheck(callerOf(request).userId, params.projectId);
    if (check === null) throw new Refusal('NOT_FOUND', 404);
    return viewerSetupCheckEndpoint.answer.parse(check);
  }

  @Serves(viewerQuantityLookupEndpoint)
  async quantityLookup(
    @Param() params: ParamsOf<typeof viewerQuantityLookupEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const lookup = await this.reads.quantityLookup(callerOf(request).userId, params.projectId);
    if (lookup === null) throw new Refusal('NOT_FOUND', 404);
    return viewerQuantityLookupEndpoint.answer.parse(lookup);
  }

  // A photograph the database doesn't show this viewer is answered as one nobody has; its file
  // is read only after.
  @Serves(viewerPhotographFileEndpoint)
  async photographFile(
    @Param() params: ParamsOf<typeof viewerPhotographFileEndpoint>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const caller = callerOf(request);
    if (!(await this.reads.photograph(caller.userId, params.photoId))) {
      throw new Refusal('NOT_FOUND', 404);
    }
    const kept = await this.files.kept(params.photoId, params.file);
    void reply.headers({
      'content-type': kept.contentType,
      'content-disposition': `attachment; filename="${params.photoId}-${params.file}.${extensions[kept.contentType]}"`,
      'content-security-policy': fileAnswerPolicy,
    });
    request.log.info(
      { userId: caller.userId, file: params.file, bytes: kept.bytes.byteLength },
      'A viewer read a photograph’s file.',
    );
    return kept.bytes;
  }
}
