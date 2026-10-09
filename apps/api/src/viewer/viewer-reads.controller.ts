// A read-only viewer's reads, asked for (ARCHITECTURE §5.5, §6; AC-02-74; AC-10-29, 30, 31;
// BACKLOG 2.4.5; ADR-434). The door has asked that the caller is a read-only viewer; each read
// is then made as that caller, stated to the database by `ViewerReads`. Every one is a GET.
import {
  viewerProjectsAnswerSchema,
  viewerProjectsEndpoint,
  viewerRoesAnswerSchema,
  viewerRoesEndpoint,
  viewerTicketAnswerSchema,
  viewerTicketEndpoint,
  viewerTicketsAnswerSchema,
  viewerTicketsEndpoint,
  type ParamsOf,
  type QueryOf,
  type ViewerProjectsAnswer,
  type ViewerRoesAnswer,
  type ViewerTicketAnswer,
  type ViewerTicketsAnswer,
} from '@open-adms/contracts';
import { Controller, Inject, Param, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { ViewerReads } from './viewer-reads.ts';

export const apiViewerReads = Symbol('the API’s reads for a read-only viewer');

const projectsPage = 50;
// A page of tickets or of ROEs where none is said.
const page = 50;

@Controller()
export class ViewerReadsController {
  private readonly reads: ViewerReads;

  constructor(@Inject(apiViewerReads) reads: ViewerReads) {
    this.reads = reads;
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
}
