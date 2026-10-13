// A map's file, sent whole by the back office, and a map or a site's shape loaded from it
// (spec/parts/01-setup.md steps 3 and 7; ARCHITECTURE §3, §6 "Uploads"; AC-01-56, AC-01-59;
// BACKLOG 2.6.4, C86, C100; ADR-485; KD-76). The door has already asked the caller's role and
// that they hold Setup; the service asks again. The log says who sent which file and how large
// it is: never where it is kept or anything it holds (OWASP ASVS 5.0 16.2.5).
import {
  addSiteShapeFileEndpoint,
  loadMapFileEndpoint,
  sendMapFileEndpoint,
  type BodyOf,
  type ParamsOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { MapFiles, type MapFileSent } from './map-files.ts';
import { answered } from './setup-answered.ts';
import { mapVersionRecord, siteAreaVersionRecord } from './setup-records.ts';

export const apiMapFiles = Symbol('the API’s map files');

const sent = (file: MapFileSent): MapFileSent => file;

@Controller()
export class MapFilesController {
  private readonly files: MapFiles;

  constructor(@Inject(apiMapFiles) files: MapFiles) {
    this.files = files;
  }

  @Serves(sendMapFileEndpoint)
  async send(
    @Param() params: ParamsOf<typeof sendMapFileEndpoint>,
    @Body() bytes: Uint8Array,
    @Req() request: FastifyRequest,
  ) {
    const caller = callerOf(request);
    const outcome = await this.files.send(caller.userId, params.projectId, bytes);
    request.log.info({ userId: caller.userId, bytes: bytes.byteLength }, 'A map’s file was sent.');
    return sendMapFileEndpoint.answer.parse(
      answered(request, outcome, sent, 'A map’s file was read and kept.'),
    );
  }

  @Serves(loadMapFileEndpoint)
  async loadMap(
    @Param() params: ParamsOf<typeof loadMapFileEndpoint>,
    @Body() body: BodyOf<typeof loadMapFileEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.files.loadMap(
      callerOf(request).userId,
      params.projectId,
      params.mapFileId,
      body,
    );
    return loadMapFileEndpoint.answer.parse(
      answered(request, outcome, mapVersionRecord, 'A project’s map was loaded from a file.'),
    );
  }

  @Serves(addSiteShapeFileEndpoint)
  async siteShape(
    @Param() params: ParamsOf<typeof addSiteShapeFileEndpoint>,
    @Body() body: BodyOf<typeof addSiteShapeFileEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.files.siteShape(
      callerOf(request).userId,
      params.siteId,
      params.mapFileId,
      body.layer,
    );
    return addSiteShapeFileEndpoint.answer.parse(
      answered(
        request,
        outcome,
        siteAreaVersionRecord,
        'A site’s own shape was saved from a file.',
      ),
    );
  }
}
