// The endpoints of corrections to an ROE and to the forms, of a quarantined record resolved and
// of a record created in the back office (spec/parts/08-review-and-corrections.md steps 2, 9,
// "One review queue"; AC-08-19, 21, 25, 26; AC-10-27, 28, 37; BACKLOG 2.4.4; ADR-022, 149, 156,
// 327, 338, 364, 432). The door has already asked the caller's role and that they hold the
// action's own permission, correct or renumber (admission.ts), and the boundary has read what was
// sent by the request's schema; each service asks the permission again inside its own piece of
// work, and queues the tickets the change moves there. The log says what was done or why not, by
// code: never a number, a name, an address or a note.
import {
  correctDropOffLogEndpoint,
  correctIncidentEndpoint,
  createDropOffLogEndpoint,
  createIncidentEndpoint,
  createRoeEndpoint,
  createSurveyEndpoint,
  correctRoeEndpoint,
  correctRoeScopeEndpoint,
  correctSurveyEndpoint,
  createFieldEventEndpoint,
  markSecondCopyEndpoint,
  renumberQuarantinedRecordEndpoint,
  type BodyOf,
  type ParamsOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { stated } from '../setup/setup-answered.ts';
import { callerOf } from '../sign-in/admission.ts';
import { BackOfficeRecords } from './back-office-records.ts';
import { apiCorrections } from './corrections.controller.ts';
import { Corrections } from './corrections.ts';
import { QuarantineReview } from './quarantine-review.ts';
import {
  dropOffLogRecord,
  fieldEventRecord,
  incidentRecord,
  quarantinedRecord,
  reviewed,
  roeRecord,
  roeScopeItemRecord,
  surveyRecord,
} from './review-answered.ts';

export const apiQuarantineReview = Symbol('the API’s quarantine review');
export const apiBackOfficeRecords = Symbol('the API’s back-office records');

@Controller()
export class ReviewRecordsController {
  private readonly corrections: Corrections;
  private readonly quarantine: QuarantineReview;
  private readonly records: BackOfficeRecords;

  constructor(
    @Inject(apiCorrections) corrections: Corrections,
    @Inject(apiQuarantineReview) quarantine: QuarantineReview,
    @Inject(apiBackOfficeRecords) records: BackOfficeRecords,
  ) {
    this.corrections = corrections;
    this.quarantine = quarantine;
    this.records = records;
  }

  @Serves(correctRoeEndpoint)
  async roe(
    @Param() params: ParamsOf<typeof correctRoeEndpoint>,
    @Body() body: BodyOf<typeof correctRoeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.roe(
      callerOf(request).userId,
      params.roeId,
      stated(body.changes),
      body.note,
    );
    return correctRoeEndpoint.answer.parse(
      reviewed(request, outcome, ({ record }) => roeRecord(record), 'An ROE was corrected.'),
    );
  }

  @Serves(correctRoeScopeEndpoint)
  async roeScope(
    @Param() params: ParamsOf<typeof correctRoeScopeEndpoint>,
    @Body() body: BodyOf<typeof correctRoeScopeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.roeScope(
      callerOf(request).userId,
      params.roeId,
      stated(body.pick),
      body.inScope,
      body.note,
    );
    return correctRoeScopeEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => roeScopeItemRecord(record),
        'An ROE’s scope was corrected.',
      ),
    );
  }

  @Serves(correctSurveyEndpoint)
  async survey(
    @Param() params: ParamsOf<typeof correctSurveyEndpoint>,
    @Body() body: BodyOf<typeof correctSurveyEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.survey(
      callerOf(request).userId,
      params.surveyId,
      stated(body.changes),
      body.note,
    );
    return correctSurveyEndpoint.answer.parse(
      reviewed(request, outcome, ({ record }) => surveyRecord(record), 'A survey was corrected.'),
    );
  }

  @Serves(correctIncidentEndpoint)
  async incident(
    @Param() params: ParamsOf<typeof correctIncidentEndpoint>,
    @Body() body: BodyOf<typeof correctIncidentEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.incident(
      callerOf(request).userId,
      params.incidentId,
      stated(body.changes),
      body.note,
    );
    return correctIncidentEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => incidentRecord(record),
        'An incident was corrected.',
      ),
    );
  }

  @Serves(correctDropOffLogEndpoint)
  async dropOffLog(
    @Param() params: ParamsOf<typeof correctDropOffLogEndpoint>,
    @Body() body: BodyOf<typeof correctDropOffLogEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.dropOffLog(
      callerOf(request).userId,
      params.dropOffLogId,
      stated(body.changes),
      body.note,
    );
    return correctDropOffLogEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => dropOffLogRecord(record),
        'A drop-off log was corrected.',
      ),
    );
  }

  @Serves(renumberQuarantinedRecordEndpoint)
  async renumberQuarantined(
    @Param() params: ParamsOf<typeof renumberQuarantinedRecordEndpoint>,
    @Body() body: BodyOf<typeof renumberQuarantinedRecordEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.quarantine.renumber(
      callerOf(request).userId,
      params.quarantinedRecordId,
      stated(body.to),
      body.note,
    );
    return renumberQuarantinedRecordEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => quarantinedRecord(record),
        'A quarantined record was renumbered.',
      ),
    );
  }

  @Serves(markSecondCopyEndpoint)
  async secondCopy(
    @Param() params: ParamsOf<typeof markSecondCopyEndpoint>,
    @Body() body: BodyOf<typeof markSecondCopyEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.quarantine.secondCopy(
      callerOf(request).userId,
      params.quarantinedRecordId,
      body.note,
    );
    return markSecondCopyEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => quarantinedRecord(record),
        'A quarantined record was marked a second copy.',
      ),
    );
  }

  // A detail left out is empty; what a phone alone would have said isn't entered.
  @Serves(createFieldEventEndpoint)
  async fieldEvent(
    @Param() params: ParamsOf<typeof createFieldEventEndpoint>,
    @Body() body: BodyOf<typeof createFieldEventEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.records.fieldEvent(callerOf(request).userId, {
      projectId: params.projectId,
      workflow: body.workflow,
      kind: body.kind,
      ticketNumber: body.ticketNumber,
      splitSuffix: body.splitSuffix ?? '',
      monitorId: body.monitorId,
      certNumber: body.certNumber,
      certKeyedByHand: false,
      siteId: body.siteId ?? null,
      startedAt: new Date(body.startedAt),
      endedAt: new Date(body.endedAt),
      deviceUtcOffsetMinutes: body.deviceUtcOffsetMinutes,
      startLatitude: body.start?.latitude ?? null,
      startLongitude: body.start?.longitude ?? null,
      endLatitude: body.end?.latitude ?? null,
      endLongitude: body.end?.longitude ?? null,
      address: body.address ?? null,
      addressSource: body.addressSource ?? null,
      notes: body.notes ?? null,
      formDebrisTypeId: body.formDebrisTypeId ?? null,
      fieldTagId: body.fieldTagId ?? null,
      roeNumber: body.roeNumber ?? null,
      estimateCy: body.estimateCy ?? null,
      loadCall: body.loadCall ?? null,
      scaleReceiptId: body.scaleReceiptId ?? null,
      carriedCount: body.carriedCount ?? null,
      kindOfWorkId: body.kindOfWorkId ?? null,
      payableTypeId: body.payableTypeId ?? null,
      payItemId: body.payItemId ?? null,
      unitCount: body.unitCount ?? null,
      measurementInches: body.measurementInches ?? null,
      measuredAs: body.measuredAs ?? null,
      rootBallInches: body.rootBallInches ?? null,
      rootBallHalfExposed: body.rootBallHalfExposed ?? null,
      surveyNumber: body.surveyNumber ?? null,
      markedIneligible: body.markedIneligible ?? null,
      items: body.items ?? [],
      carriedTickets: body.carriedTickets ?? [],
      // Paper keeps no waypoint: a field event created in the back office has none (ADR-581).
      waypoints: [],
      reasonId: body.reasonId,
    });
    return createFieldEventEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => fieldEventRecord(record),
        'A field event was created in the back office.',
      ),
    );
  }

  // A form made on paper: whose it was, when and where, and a reason picked.
  @Serves(createRoeEndpoint)
  async createRoe(
    @Param() params: ParamsOf<typeof createRoeEndpoint>,
    @Body() body: BodyOf<typeof createRoeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.records.roe(callerOf(request).userId, {
      ...body,
      projectId: params.projectId,
      madeAt: body.madeAt === null ? null : new Date(body.madeAt),
    });
    return createRoeEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => roeRecord(record),
        'An ROE was entered in the back office.',
      ),
    );
  }

  @Serves(createSurveyEndpoint)
  async createSurvey(
    @Param() params: ParamsOf<typeof createSurveyEndpoint>,
    @Body() body: BodyOf<typeof createSurveyEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.records.survey(callerOf(request).userId, {
      ...body,
      projectId: params.projectId,
      madeAt: new Date(body.madeAt),
    });
    return createSurveyEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => surveyRecord(record),
        'A survey was entered in the back office.',
      ),
    );
  }

  @Serves(createIncidentEndpoint)
  async createIncident(
    @Param() params: ParamsOf<typeof createIncidentEndpoint>,
    @Body() body: BodyOf<typeof createIncidentEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.records.incident(callerOf(request).userId, {
      ...body,
      projectId: params.projectId,
      madeAt: new Date(body.madeAt),
    });
    return createIncidentEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => incidentRecord(record),
        'An incident was entered in the back office.',
      ),
    );
  }

  @Serves(createDropOffLogEndpoint)
  async createDropOffLog(
    @Param() params: ParamsOf<typeof createDropOffLogEndpoint>,
    @Body() body: BodyOf<typeof createDropOffLogEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.records.dropOffLog(callerOf(request).userId, {
      ...body,
      projectId: params.projectId,
      madeAt: new Date(body.madeAt),
    });
    return createDropOffLogEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => dropOffLogRecord(record),
        'A drop-off log was entered in the back office.',
      ),
    );
  }
}
