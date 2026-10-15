// Setup's endpoints, step 7 (spec/parts/01-setup.md; ARCHITECTURE §6; AC-01-52…57; AC-10-27;
// BACKLOG 2.4.2, C97, C98; ADR-111, 142, 145, 215, 222, 298, 422, 426): a disposal site entered
// on a project, a change to one, its own shape and the link to its tipping fee pay item; a site
// archived and put back, its own labels given and taken off, its tipping fee link taken off
// (ADR-527 (9)). Each
// moves what the tickets at the site are checked against, and its answer says what it queued.
// The door has already asked the caller's role and that they hold Setup; the service asks again
// inside its own piece of work.
import {
  addSiteShapeEndpoint,
  archiveSiteEndpoint,
  archiveSiteLabelEndpoint,
  archiveTippingFeeEndpoint,
  changeSiteEndpoint,
  createSiteEndpoint,
  giveSiteLabelEndpoint,
  linkTippingFeeEndpoint,
  unarchiveSiteEndpoint,
  type BodyOf,
  type ParamsOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { answered, stated } from './setup-answered.ts';
import {
  siteAreaVersionRecord,
  siteLabelRecord,
  siteRecord,
  siteTippingFeeRecord,
} from './setup-records.ts';
import { SiteSetup } from './site-setup.ts';

export const apiSiteSetup = Symbol('the API’s site setup');

type AtSite = ParamsOf<typeof changeSiteEndpoint>;

@Controller()
export class SiteSetupController {
  private readonly sites: SiteSetup;

  constructor(@Inject(apiSiteSetup) sites: SiteSetup) {
    this.sites = sites;
  }

  @Serves(createSiteEndpoint)
  async create(
    @Param() params: ParamsOf<typeof createSiteEndpoint>,
    @Body() body: BodyOf<typeof createSiteEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.sites.site(callerOf(request).userId, {
      projectId: params.projectId,
      ...stated(body),
    });
    return createSiteEndpoint.answer.parse(
      answered(request, outcome, siteRecord, 'A disposal site was entered.'),
    );
  }

  @Serves(changeSiteEndpoint)
  async change(
    @Param() params: AtSite,
    @Body() body: BodyOf<typeof changeSiteEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.sites.change(callerOf(request).userId, params.siteId, stated(body));
    return changeSiteEndpoint.answer.parse(
      answered(request, outcome, siteRecord, 'A disposal site was changed.'),
    );
  }

  @Serves(addSiteShapeEndpoint)
  async addShape(
    @Param() params: AtSite,
    @Body() body: BodyOf<typeof addSiteShapeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.sites.shape(callerOf(request).userId, params.siteId, body);
    return addSiteShapeEndpoint.answer.parse(
      answered(request, outcome, siteAreaVersionRecord, 'A site’s own shape was saved.'),
    );
  }

  @Serves(linkTippingFeeEndpoint)
  async linkTippingFee(
    @Param() params: AtSite,
    @Body() body: BodyOf<typeof linkTippingFeeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.sites.tippingFee(
      callerOf(request).userId,
      params.siteId,
      body.payItemId,
    );
    return linkTippingFeeEndpoint.answer.parse(
      answered(
        request,
        outcome,
        siteTippingFeeRecord,
        'A site was linked to a tipping fee pay item.',
      ),
    );
  }
  @Serves(archiveSiteEndpoint)
  async archive(@Param() params: AtSite, @Req() request: FastifyRequest) {
    const outcome = await this.sites.archive(callerOf(request).userId, params.siteId, true);
    return archiveSiteEndpoint.answer.parse(
      answered(request, outcome, siteRecord, 'A site was archived.'),
    );
  }

  @Serves(unarchiveSiteEndpoint)
  async unarchive(@Param() params: AtSite, @Req() request: FastifyRequest) {
    const outcome = await this.sites.archive(callerOf(request).userId, params.siteId, false);
    return unarchiveSiteEndpoint.answer.parse(
      answered(request, outcome, siteRecord, 'A site was put back.'),
    );
  }

  @Serves(giveSiteLabelEndpoint)
  async giveLabel(
    @Param() params: ParamsOf<typeof giveSiteLabelEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.sites.label(
      callerOf(request).userId,
      params.siteId,
      params.siteLabelId,
    );
    return giveSiteLabelEndpoint.answer.parse(
      answered(request, outcome, siteLabelRecord, 'A site was given a label.'),
    );
  }

  @Serves(archiveSiteLabelEndpoint)
  async archiveLabel(
    @Param() params: ParamsOf<typeof archiveSiteLabelEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.sites.archiveLabel(
      callerOf(request).userId,
      params.siteId,
      params.siteLabelId,
    );
    return archiveSiteLabelEndpoint.answer.parse(
      answered(request, outcome, siteLabelRecord, 'A label was taken off a site.'),
    );
  }

  @Serves(archiveTippingFeeEndpoint)
  async archiveTippingFee(
    @Param() params: ParamsOf<typeof archiveTippingFeeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.sites.archiveTippingFee(
      callerOf(request).userId,
      params.siteId,
      params.payItemId,
    );
    return archiveTippingFeeEndpoint.answer.parse(
      answered(request, outcome, siteTippingFeeRecord, 'A site’s tipping fee link was taken off.'),
    );
  }
}
