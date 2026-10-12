// An address looked up for a phone's GPS (ARCHITECTURE §3, §6; AC-04-24; BACKLOG 2.5.3; ADR-111,
// 119, 455). Open to a proven phone with its monitor's session token. The log says who asked,
// whether an address was found and how long the address server took: never the point, never
// the address.
import {
  phoneAddressLookupAnswerSchema,
  phoneAddressLookupEndpoint,
  type BodyOf,
  type PhoneAddressLookupAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { errorLogged } from '../process/logs.ts';
import { Serves } from '../process/serves.ts';
import { monitorOf } from '../sign-in/admission.ts';
import { AddressLookups } from './address-lookups.ts';

export const apiAddressLookups = Symbol('the API’s address lookups for a phone');

@Controller()
export class AddressLookupsController {
  private readonly lookups: AddressLookups;

  constructor(@Inject(apiAddressLookups) lookups: AddressLookups) {
    this.lookups = lookups;
  }

  @Serves(phoneAddressLookupEndpoint)
  async lookedUp(
    @Body() body: BodyOf<typeof phoneAddressLookupEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<PhoneAddressLookupAnswer> {
    const monitor = monitorOf(request);
    const started = performance.now();
    const found = await this.lookups.lookedUp(body);
    const said = {
      deviceId: monitor.deviceId,
      userId: monitor.userId,
      found: found.address !== null,
      ...(found.noAddress === null ? {} : { noAddress: found.noAddress }),
      addressServerMs: Math.round(performance.now() - started),
    };
    if (found.noAddress === 'NOT_ANSWERED') {
      request.log.warn(
        { ...said, error: errorLogged(found.failure) },
        'The address server gave a phone’s lookup no answer.',
      );
    } else {
      request.log.info(said, 'A phone looked up an address.');
    }
    return phoneAddressLookupAnswerSchema.parse({
      address: found.address,
      noAddress: found.noAddress,
    });
  }
}
