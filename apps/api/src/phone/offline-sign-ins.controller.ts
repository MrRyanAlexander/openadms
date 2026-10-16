// A sign-in made on a phone with no connection, reported once it has one (ARCHITECTURE §7.2,
// §7.3; ADR-531). Open to a phone in service that has proved itself. The log says that one was
// taken or why not, by code and id: never the proof, the token, the monitor's name or number.
import {
  offlineSignInTakenAnswerSchema,
  takeOfflineSignInOnPhoneEndpoint,
  type BodyOf,
  type OfflineSignInTakenAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { phoneOf } from '../sign-in/admission.ts';
import { OfflineSignIns } from './offline-sign-ins.ts';

export const apiOfflineSignIns = Symbol('the API’s sign-ins made offline');

@Controller()
export class OfflineSignInsController {
  private readonly signIns: OfflineSignIns;

  constructor(@Inject(apiOfflineSignIns) signIns: OfflineSignIns) {
    this.signIns = signIns;
  }

  @Serves(takeOfflineSignInOnPhoneEndpoint)
  async taken(
    @Body() body: BodyOf<typeof takeOfflineSignInOnPhoneEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<OfflineSignInTakenAnswer> {
    const phone = phoneOf(request);
    const outcome = await this.signIns.taken(phone, {
      ...body,
      signedInAt: new Date(body.signedInAt),
    });
    if (!outcome.taken) {
      request.log.warn(
        { why: outcome.why, deviceId: phone.deviceId },
        'A sign-in made on a phone with no connection was not taken.',
      );
      if (outcome.why === 'PHONE_OUT_OF_SERVICE') {
        throw new Refusal(
          'PHONE_OUT_OF_SERVICE',
          409,
          'Not signed in: this phone was taken out of service. A monitor signs in on a phone in service.',
        );
      }
      throw new Refusal(
        'SIGN_IN_REFUSED',
        401,
        'Not signed in: the sign-in made with no connection couldn’t be taken. Nothing on the phone was changed. Sign in again, with a connection.',
      );
    }
    request.log.info(
      {
        deviceId: phone.deviceId,
        userId: outcome.userId,
        masterPasscodeSession: outcome.masterPasscodeSession,
      },
      'A sign-in made on a phone with no connection was taken.',
    );
    return offlineSignInTakenAnswerSchema.parse({
      token: outcome.token,
      userId: outcome.userId,
      monitorNumber: outcome.monitorNumber,
      name: outcome.name,
      expiresInSeconds: outcome.expiresInSeconds,
      masterPasscodeSession: outcome.masterPasscodeSession,
    });
  }
}
