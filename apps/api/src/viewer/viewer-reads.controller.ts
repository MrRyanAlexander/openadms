// A read-only viewer's reads, asked for (ARCHITECTURE §5.5, §6; AC-02-74; AC-10-29, 30, 31;
// BACKLOG 2.4.5; ADR-434). The door has asked that the caller is a read-only viewer; each read
// is then made as that caller, stated to the database by `ViewerReads`. Every one is a GET.
import {
  viewerProjectsAnswerSchema,
  viewerProjectsEndpoint,
  type QueryOf,
  type ViewerProjectsAnswer,
} from '@open-adms/contracts';
import { Controller, Inject, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { ViewerReads } from './viewer-reads.ts';

export const apiViewerReads = Symbol('the API’s reads for a read-only viewer');

const projectsPage = 50;

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
}
