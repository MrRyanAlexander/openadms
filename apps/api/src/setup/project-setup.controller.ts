// Setup's endpoints, steps 1 to 3 and the project's own lists (spec/parts/01-setup.md;
// ARCHITECTURE §6; AC-01-80; AC-10-27, 38; BACKLOG 2.4.2; ADR-316, 424): the client and the
// declaration event, searched for and picked or created; the project; its settings, its active
// window and its close; its number series and control ranges; its field tags; its map. The door has
// already asked the caller's role and that they hold Setup (admission.ts); each service asks
// again inside its own piece of work, and writes as that person.
import {
  addFieldTagEndpoint,
  archiveClientEndpoint,
  archiveControlRangeEndpoint,
  archiveDeclarationEventEndpoint,
  changeClientEndpoint,
  changeDeclarationEventEndpoint,
  changeProjectSettingsEndpoint,
  changeProjectWindowEndpoint,
  closeProjectEndpoint,
  createClientEndpoint,
  createDeclarationEventEndpoint,
  createProjectEndpoint,
  enterControlRangeEndpoint,
  findClientsEndpoint,
  findDeclarationEventsEndpoint,
  loadMapEndpoint,
  startNumberSeriesEndpoint,
  unarchiveClientEndpoint,
  unarchiveDeclarationEventEndpoint,
  type BodyOf,
  type ParamsOf,
  type QueryOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { ProjectSetup } from './project-setup.ts';
import { answered, searched, stated } from './setup-answered.ts';
import {
  clientRecord,
  controlRangeRecord,
  declarationEventRecord,
  fieldTagRecord,
  mapVersionRecord,
  numberSeriesRecord,
  projectRecord,
} from './setup-records.ts';

export const apiProjectSetup = Symbol('the API’s project setup');

type InProject = ParamsOf<typeof changeProjectSettingsEndpoint>;

@Controller()
export class ProjectSetupController {
  private readonly projects: ProjectSetup;

  constructor(@Inject(apiProjectSetup) projects: ProjectSetup) {
    this.projects = projects;
  }

  @Serves(findClientsEndpoint)
  async findClients(@Query() query: QueryOf<typeof findClientsEndpoint>) {
    const found = await this.projects.findClients(searched(query));
    return findClientsEndpoint.answer.parse({
      records: found.records.map(clientRecord),
      next: found.next,
    });
  }

  @Serves(createClientEndpoint)
  async createClient(
    @Body() body: BodyOf<typeof createClientEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.client(callerOf(request).userId, stated(body));
    return createClientEndpoint.answer.parse(
      answered(request, outcome, clientRecord, 'A client was created.'),
    );
  }

  @Serves(changeClientEndpoint)
  async changeClient(
    @Param() params: ParamsOf<typeof changeClientEndpoint>,
    @Body() body: BodyOf<typeof changeClientEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.changeClient(
      callerOf(request).userId,
      params.clientId,
      stated(body),
    );
    return changeClientEndpoint.answer.parse(
      answered(request, outcome, clientRecord, 'A client was changed.'),
    );
  }

  @Serves(archiveClientEndpoint)
  async archiveClient(
    @Param() params: ParamsOf<typeof archiveClientEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.archiveClient(
      callerOf(request).userId,
      params.clientId,
      true,
    );
    return archiveClientEndpoint.answer.parse(
      answered(request, outcome, clientRecord, 'A client was archived.'),
    );
  }

  @Serves(unarchiveClientEndpoint)
  async unarchiveClient(
    @Param() params: ParamsOf<typeof unarchiveClientEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.archiveClient(
      callerOf(request).userId,
      params.clientId,
      false,
    );
    return unarchiveClientEndpoint.answer.parse(
      answered(request, outcome, clientRecord, 'A client was put back.'),
    );
  }

  @Serves(findDeclarationEventsEndpoint)
  async findDeclarationEvents(@Query() query: QueryOf<typeof findDeclarationEventsEndpoint>) {
    const found = await this.projects.findDeclarationEvents(searched(query));
    return findDeclarationEventsEndpoint.answer.parse({
      records: found.records.map(declarationEventRecord),
      next: found.next,
    });
  }

  @Serves(createDeclarationEventEndpoint)
  async createDeclarationEvent(
    @Body() body: BodyOf<typeof createDeclarationEventEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.declarationEvent(callerOf(request).userId, body);
    return createDeclarationEventEndpoint.answer.parse(
      answered(request, outcome, declarationEventRecord, 'A declaration event was created.'),
    );
  }

  @Serves(changeDeclarationEventEndpoint)
  async changeDeclarationEvent(
    @Param() params: ParamsOf<typeof changeDeclarationEventEndpoint>,
    @Body() body: BodyOf<typeof changeDeclarationEventEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.changeDeclarationEvent(
      callerOf(request).userId,
      params.declarationEventId,
      stated(body),
    );
    return changeDeclarationEventEndpoint.answer.parse(
      answered(request, outcome, declarationEventRecord, 'A declaration event was changed.'),
    );
  }

  @Serves(archiveDeclarationEventEndpoint)
  async archiveDeclarationEvent(
    @Param() params: ParamsOf<typeof archiveDeclarationEventEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.archiveDeclarationEvent(
      callerOf(request).userId,
      params.declarationEventId,
      true,
    );
    return archiveDeclarationEventEndpoint.answer.parse(
      answered(request, outcome, declarationEventRecord, 'A declaration event was archived.'),
    );
  }

  @Serves(unarchiveDeclarationEventEndpoint)
  async unarchiveDeclarationEvent(
    @Param() params: ParamsOf<typeof unarchiveDeclarationEventEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.archiveDeclarationEvent(
      callerOf(request).userId,
      params.declarationEventId,
      false,
    );
    return unarchiveDeclarationEventEndpoint.answer.parse(
      answered(request, outcome, declarationEventRecord, 'A declaration event was put back.'),
    );
  }

  @Serves(createProjectEndpoint)
  async createProject(
    @Body() body: BodyOf<typeof createProjectEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const { numbersFrom, ...project } = body;
    const outcome = await this.projects.project(callerOf(request).userId, {
      ...project,
      ...(numbersFrom === undefined ? {} : { numbersFrom: stated(numbersFrom) }),
    });
    return createProjectEndpoint.answer.parse(
      answered(request, outcome, projectRecord, 'A project was created.'),
    );
  }

  @Serves(changeProjectSettingsEndpoint)
  async changeSettings(
    @Param() params: InProject,
    @Body() body: BodyOf<typeof changeProjectSettingsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.changeSettings(
      callerOf(request).userId,
      params.projectId,
      stated(body),
    );
    return changeProjectSettingsEndpoint.answer.parse(
      answered(request, outcome, projectRecord, 'A project’s settings were changed.'),
    );
  }

  @Serves(changeProjectWindowEndpoint)
  async changeWindow(
    @Param() params: InProject,
    @Body() body: BodyOf<typeof changeProjectWindowEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.changeWindow(
      callerOf(request).userId,
      params.projectId,
      stated(body),
    );
    return changeProjectWindowEndpoint.answer.parse(
      answered(request, outcome, projectRecord, 'A project’s active window was changed.'),
    );
  }

  @Serves(closeProjectEndpoint)
  async close(@Param() params: InProject, @Req() request: FastifyRequest) {
    const outcome = await this.projects.close(callerOf(request).userId, params.projectId);
    return closeProjectEndpoint.answer.parse(
      answered(request, outcome, projectRecord, 'A project was closed.'),
    );
  }

  @Serves(startNumberSeriesEndpoint)
  async startNumberSeries(
    @Param() params: InProject,
    @Body() body: BodyOf<typeof startNumberSeriesEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.numberSeries(
      callerOf(request).userId,
      params.projectId,
      body.series,
      body.firstNumber,
    );
    return startNumberSeriesEndpoint.answer.parse(
      answered(request, outcome, numberSeriesRecord, 'A number series was started.'),
    );
  }

  @Serves(enterControlRangeEndpoint)
  async enterControlRange(
    @Param() params: InProject,
    @Body() body: BodyOf<typeof enterControlRangeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.controlRange(callerOf(request).userId, {
      projectId: params.projectId,
      ...body,
    });
    return enterControlRangeEndpoint.answer.parse(
      answered(request, outcome, controlRangeRecord, 'A control range was entered.'),
    );
  }

  @Serves(archiveControlRangeEndpoint)
  async archiveControlRange(
    @Param() params: ParamsOf<typeof archiveControlRangeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.archiveControlRange(
      callerOf(request).userId,
      params.controlRangeId,
    );
    return archiveControlRangeEndpoint.answer.parse(
      answered(request, outcome, controlRangeRecord, 'A control range was archived.'),
    );
  }

  @Serves(addFieldTagEndpoint)
  async addFieldTag(
    @Param() params: InProject,
    @Body() body: BodyOf<typeof addFieldTagEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.fieldTag(
      callerOf(request).userId,
      params.projectId,
      body.name,
    );
    return addFieldTagEndpoint.answer.parse(
      answered(request, outcome, fieldTagRecord, 'A field tag was added.'),
    );
  }

  // The map as GeoJSON, read by the domain's MapShapes: what it can't read isn't loaded.
  @Serves(loadMapEndpoint)
  async loadMap(
    @Param() params: InProject,
    @Body() body: BodyOf<typeof loadMapEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.projects.loadMap(callerOf(request).userId, {
      projectId: params.projectId,
      ...body,
    });
    return loadMapEndpoint.answer.parse(
      answered(request, outcome, mapVersionRecord, 'A project’s map was loaded.'),
    );
  }
}
