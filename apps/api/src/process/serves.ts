// How a controller's method serves an endpoint (ARCHITECTURE §6, Input; AC-10-36; T-28; ADR-387):
// by naming the endpoint of `packages/contracts`, which gives the route its method and its path
// and the boundary its schemas. A route is never mapped any other way: one that is, is refused at
// the boundary.
import 'reflect-metadata';

import type { Endpoint } from '@open-adms/contracts';
import {
  applyDecorators,
  HttpCode,
  RequestMapping,
  RequestMethod,
  SetMetadata,
} from '@nestjs/common';

const served = 'open-adms:endpoint';

export function Serves(endpoint: Endpoint): MethodDecorator {
  return applyDecorators(
    RequestMapping({ path: endpoint.path, method: RequestMethod[endpoint.method] }),
    // What the OpenAPI description says an answer is, whatever the method.
    HttpCode(200),
    SetMetadata(served, endpoint),
  );
}

export function servedBy(handler: object): Endpoint | undefined {
  return Reflect.getMetadata(served, handler) as Endpoint | undefined;
}
