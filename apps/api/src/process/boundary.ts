// The boundary (ARCHITECTURE §6, Input; AC-10-34, 36, 43; T-12, T-28; ADR-387, 390, 408): before
// any controller runs, the endpoint's own rule of who may call is asked (admission.ts), and then
// the request's path parameters, query and body are each read by the schemas of the endpoint it
// serves. Who may call comes first: a caller who isn't let in is told nothing of what was sent. Anything they don't take refuses the whole request with a plain code and, in plain words,
// which field its schema refused (AC-10-37; ADR-431): the contracts' own words, never anything the
// caller sent. A route that names no endpoint serves nothing. The controller then runs as its request, so that a
// write it makes carries the request's id (api-database.ts).
import { AsyncLocalStorage } from 'node:async_hooks';

import { notTaken, taken } from '@open-adms/contracts';
import { type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';

import type { Admission } from '../sign-in/admission.ts';
import { Refusal } from './refusal.ts';
import { servedBy } from './serves.ts';

const requests = new AsyncLocalStorage<{ readonly requestId: string }>();

// The id of the request the work now running is for; none outside a request.
export function requestNow(): string | undefined {
  return requests.getStore()?.requestId;
}

export class Boundary implements NestInterceptor {
  private readonly admission: Admission;

  constructor(admission: Admission) {
    this.admission = admission;
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const endpoint = servedBy(context.getHandler());
    if (endpoint === undefined) {
      throw new Error('A route was mapped that names no endpoint of the contracts.');
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    await this.admission.admit(endpoint, request);
    const read = taken(endpoint, request);
    if (read === undefined) throw new Refusal('BAD_REQUEST', 400, notTaken(endpoint, request));
    Object.assign(request, read);
    return new Observable((to) =>
      requests.run({ requestId: request.id }, () => next.handle().subscribe(to)),
    );
  }
}
