// A photograph added in the back office to a record made there (ARCHITECTURE §6 "Uploads";
// T-25; BACKLOG 2.8.7; ADR-482, 521, 534 (2)): its file whole in the body, as bytes, at most the
// policy's size (its route's own body limit), what it is on and when it was taken in the query.
// The door has already asked the caller's role and that they may correct records; the service
// asks again before the file is kept and inside the piece of work that writes its record. The
// log says which record and how large: never a fingerprint, a place in storage or anything the
// file holds (OWASP ASVS 5.0 16.2.5).
import { addPhotographEndpoint, type QueryOf } from '@open-adms/contracts';
import { Body, Controller, Inject, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { photographRecord, reviewed } from '../review/review-answered.ts';
import { callerOf } from '../sign-in/admission.ts';
import { apiBackOfficePhotographs, BackOfficePhotographs } from './back-office-photographs.ts';

@Controller()
export class BackOfficePhotographsController {
  private readonly photographs: BackOfficePhotographs;

  constructor(@Inject(apiBackOfficePhotographs) photographs: BackOfficePhotographs) {
    this.photographs = photographs;
  }

  @Serves(addPhotographEndpoint)
  async add(
    @Query() query: QueryOf<typeof addPhotographEndpoint>,
    @Body() bytes: Uint8Array,
    @Req() request: FastifyRequest,
  ) {
    const caller = callerOf(request);
    const outcome = await this.photographs.add(caller.userId, {
      on: query.on,
      recordId: query.recordId,
      view: query.view ?? null,
      capturedAt: new Date(query.capturedAt),
      utcOffsetMinutes: Number(query.utcOffsetMinutes),
      bytes,
    });
    request.log.info(
      { userId: caller.userId, on: query.on, bytes: bytes.byteLength },
      'A photograph was sent from the back office.',
    );
    return addPhotographEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => photographRecord(record),
        'A photograph was added in the back office.',
      ),
    );
  }
}
