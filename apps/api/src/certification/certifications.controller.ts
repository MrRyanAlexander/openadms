// The endpoints of the back office's changes to a certification (spec/parts/03-certification.md
// steps 10…13; AC-03-38, 55; AC-10-27, 28, 35, 37; BACKLOG 2.4.4; ADR-079, 080, 082, 364, 433).
// The door has already asked the caller's role and, where the action takes one, that they hold
// its permission (admission.ts), and the boundary has read what was sent by the request's schema;
// each service asks again inside its own piece of work: correct for a measuring mistake, QC for
// signatures on file, an admin and nobody else for a revocation. Nobody sends a capacity. A
// certification is made on a phone, so no request here makes or replaces one (its sync does). The
// log says what was done or why not, by code: never a number, a name or a reason.
import {
  correctCertificationBoxEndpoint,
  markSignaturesOnFileEndpoint,
  revokeCertificationEndpoint,
  type BodyOf,
  type ParamsOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { apiCorrections } from '../review/corrections.controller.ts';
import { Corrections } from '../review/corrections.ts';
import { certificationRecord, reviewed } from '../review/review-answered.ts';
import { stated } from '../setup/setup-answered.ts';
import { callerOf } from '../sign-in/admission.ts';
import { Certifications } from './certifications.ts';

export const apiCertifications = Symbol('the API’s certifications');

@Controller()
export class CertificationsController {
  private readonly certifications: Certifications;
  private readonly corrections: Corrections;

  constructor(
    @Inject(apiCertifications) certifications: Certifications,
    @Inject(apiCorrections) corrections: Corrections,
  ) {
    this.certifications = certifications;
    this.corrections = corrections;
  }

  @Serves(correctCertificationBoxEndpoint)
  async box(
    @Param() params: ParamsOf<typeof correctCertificationBoxEndpoint>,
    @Body() body: BodyOf<typeof correctCertificationBoxEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.corrections.certification(
      callerOf(request).userId,
      params.certificationId,
      Number(params.position),
      stated(body.changes),
      body.note,
    );
    return correctCertificationBoxEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => certificationRecord(record),
        'A certification’s measurement was corrected.',
      ),
    );
  }

  @Serves(markSignaturesOnFileEndpoint)
  async signaturesOnFile(
    @Param() params: ParamsOf<typeof markSignaturesOnFileEndpoint>,
    @Body() body: BodyOf<typeof markSignaturesOnFileEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.certifications.signaturesOnFile(
      callerOf(request).userId,
      params.certificationId,
      body.onFile,
    );
    return markSignaturesOnFileEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        certificationRecord,
        'A certification’s signatures on file were marked.',
      ),
    );
  }

  @Serves(revokeCertificationEndpoint)
  async revoke(
    @Param() params: ParamsOf<typeof revokeCertificationEndpoint>,
    @Body() body: BodyOf<typeof revokeCertificationEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.certifications.revoke(
      callerOf(request).userId,
      params.certificationId,
      body.from,
      body.reason,
    );
    return revokeCertificationEndpoint.answer.parse(
      reviewed(request, outcome, certificationRecord, 'A certification was revoked.'),
    );
  }
}
