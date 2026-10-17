// Setup's reads (spec/parts/01-setup.md; REQ-217; AC-10-27; BACKLOG 2.8.8, C99, C100, C169;
// ADR-535 (2)): a project's list and its page, its forms, pay items, rates (Setup), rules, sites
// and their shapes, its map versions, the firm's lists, and a kept map's file handed back as a
// photograph's is: the bytes stored, under the type kept with them, a download never run as a page
// (ASVS V3.2.1, V5.4; ADR-483). The door has already asked the caller's role, and Setup for the
// rates; the service asks again inside its own read. The log says what was read, by count.
import {
  listFormsEndpoint,
  listListValuesEndpoint,
  listMapVersionsEndpoint,
  listPayItemRatesEndpoint,
  listPayItemsEndpoint,
  listProjectsEndpoint,
  listRulesEndpoint,
  listSiteShapesEndpoint,
  listSitesEndpoint,
  mapVersionFileEndpoint,
  readMapVersionEndpoint,
  readProjectEndpoint,
  siteShapeFileEndpoint,
  type ParamsOf,
  type QueryOf,
} from '@open-adms/contracts';
import type { MapFileType } from '@open-adms/domain';
import { Controller, Inject, Param, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { fileAnswerPolicy } from '../media/photograph-files.controller.ts';
import { Serves } from '../process/serves.ts';
import type { PageAsked } from '../review/review-reads.ts';
import { callerOf } from '../sign-in/admission.ts';
import { SetupReads, type KeptMapFile } from './setup-reads.ts';

export const apiSetupReads = Symbol('the API’s reads of setup');

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

const extensions: Record<MapFileType, string> = {
  'application/zip': 'zip',
  'application/geo+json': 'geojson',
  'application/vnd.google-earth.kml+xml': 'kml',
};

@Controller()
export class SetupReadsController {
  private readonly reads: SetupReads;

  constructor(@Inject(apiSetupReads) reads: SetupReads) {
    this.reads = reads;
  }

  @Serves(listProjectsEndpoint)
  async projects(
    @Query() query: QueryOf<typeof listProjectsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listProjectsEndpoint.answer.parse(
      await this.reads.projects(callerOf(request).userId, {
        closed: yesOrNo(query.closed),
        ...paged(query),
      }),
    );
  }

  @Serves(readProjectEndpoint)
  async project(
    @Param() params: ParamsOf<typeof readProjectEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return readProjectEndpoint.answer.parse(
      await this.reads.project(callerOf(request).userId, params.projectId),
    );
  }

  @Serves(listFormsEndpoint)
  async forms(@Param() params: ParamsOf<typeof listFormsEndpoint>, @Req() request: FastifyRequest) {
    return listFormsEndpoint.answer.parse(
      await this.reads.forms(callerOf(request).userId, params.projectId),
    );
  }

  @Serves(listPayItemsEndpoint)
  async payItems(
    @Param() params: ParamsOf<typeof listPayItemsEndpoint>,
    @Query() query: QueryOf<typeof listPayItemsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listPayItemsEndpoint.answer.parse(
      await this.reads.payItems(callerOf(request).userId, params.projectId, paged(query)),
    );
  }

  @Serves(listPayItemRatesEndpoint)
  async rates(
    @Param() params: ParamsOf<typeof listPayItemRatesEndpoint>,
    @Query() query: QueryOf<typeof listPayItemRatesEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const rates = await this.reads.rates(callerOf(request).userId, params.projectId, paged(query));
    request.log.info({ rates: rates.rates.length }, 'A person read a project’s rates.');
    return listPayItemRatesEndpoint.answer.parse(rates);
  }

  @Serves(listRulesEndpoint)
  async rules(
    @Param() params: ParamsOf<typeof listRulesEndpoint>,
    @Query() query: QueryOf<typeof listRulesEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listRulesEndpoint.answer.parse(
      await this.reads.rules(callerOf(request).userId, params.projectId, {
        archived: yesOrNo(query.archived),
        ...paged(query),
      }),
    );
  }

  @Serves(listSitesEndpoint)
  async sites(
    @Param() params: ParamsOf<typeof listSitesEndpoint>,
    @Query() query: QueryOf<typeof listSitesEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listSitesEndpoint.answer.parse(
      await this.reads.sites(callerOf(request).userId, params.projectId, paged(query)),
    );
  }

  @Serves(listSiteShapesEndpoint)
  async siteShapes(
    @Param() params: ParamsOf<typeof listSiteShapesEndpoint>,
    @Query() query: QueryOf<typeof listSiteShapesEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listSiteShapesEndpoint.answer.parse(
      await this.reads.siteShapes(callerOf(request).userId, params.siteId, paged(query)),
    );
  }

  @Serves(siteShapeFileEndpoint)
  async siteShapeFile(
    @Param() params: ParamsOf<typeof siteShapeFileEndpoint>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const kept = await this.reads.siteShapeFile(callerOf(request).userId, params.siteAreaVersionId);
    return SetupReadsController.handedBack(
      request,
      reply,
      kept,
      `${params.siteAreaVersionId}-shape`,
    );
  }

  @Serves(listMapVersionsEndpoint)
  async mapVersions(
    @Param() params: ParamsOf<typeof listMapVersionsEndpoint>,
    @Query() query: QueryOf<typeof listMapVersionsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listMapVersionsEndpoint.answer.parse(
      await this.reads.mapVersions(callerOf(request).userId, params.projectId, paged(query)),
    );
  }

  @Serves(readMapVersionEndpoint)
  async mapVersion(
    @Param() params: ParamsOf<typeof readMapVersionEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return readMapVersionEndpoint.answer.parse(
      await this.reads.mapVersion(callerOf(request).userId, params.mapVersionId),
    );
  }

  @Serves(mapVersionFileEndpoint)
  async mapVersionFile(
    @Param() params: ParamsOf<typeof mapVersionFileEndpoint>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const kept = await this.reads.mapVersionFile(
      callerOf(request).userId,
      params.mapVersionId,
      params.file,
    );
    return SetupReadsController.handedBack(
      request,
      reply,
      kept,
      `${params.mapVersionId}-${params.file}`,
    );
  }

  @Serves(listListValuesEndpoint)
  async listValues(
    @Param() params: ParamsOf<typeof listListValuesEndpoint>,
    @Query() query: QueryOf<typeof listListValuesEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    return listListValuesEndpoint.answer.parse(
      await this.reads.listValues(callerOf(request).userId, params.list, {
        archived: yesOrNo(query.archived),
        ...paged(query),
      }),
    );
  }

  // A kept file, as a download under the type it was kept as, never run as a page.
  private static handedBack(
    request: FastifyRequest,
    reply: FastifyReply,
    kept: KeptMapFile,
    name: string,
  ): Buffer {
    void reply.headers({
      'content-type': kept.contentType,
      'content-disposition': `attachment; filename="${name}.${extensions[kept.contentType]}"`,
      'content-security-policy': fileAnswerPolicy,
    });
    request.log.info(
      { userId: callerOf(request).userId, bytes: kept.bytes.byteLength },
      'A person read a kept map’s file.',
    );
    return kept.bytes;
  }
}
