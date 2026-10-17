// A phone's proof of itself (ARCHITECTURE §7.4, §9 (1); AC-02-18, AC-05-03, AC-10-32, 45, 46;
// BACKLOG 2.5.1, C93, C110; ADR-416, 437, 440). Nobody is signed in for a challenge or a proof.
// A proof is no try at a secret anybody could guess (a 128-bit key), and a refused one writes
// nothing, so it is limited as every request is, by address, and no more: an office's phones
// share one address, and one phone's failed proof must never hold the others back. The log
// says that a phone proved itself or why one didn't, by code and the phone's id: never the
// challenge, the signature or the token.
import {
  challengePhoneEndpoint,
  phoneChallengeAnswerSchema,
  phoneProvenAnswerSchema,
  provenPhoneAnswerSchema,
  provenPhoneEndpoint,
  provePhoneEndpoint,
  type BodyOf,
  type ParamsOf,
  type PhoneChallengeAnswer,
  type PhoneProvenAnswer,
  type ProvenPhoneAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { phoneOf } from '../sign-in/admission.ts';
import { PhoneProofs } from './phone-proofs.ts';

export const apiPhoneProofs = Symbol('the API’s proofs of phones');

@Controller()
export class PhoneProofsController {
  private readonly proofs: PhoneProofs;

  constructor(@Inject(apiPhoneProofs) proofs: PhoneProofs) {
    this.proofs = proofs;
  }

  @Serves(challengePhoneEndpoint)
  challenge(@Param() params: ParamsOf<typeof challengePhoneEndpoint>): PhoneChallengeAnswer {
    return phoneChallengeAnswerSchema.parse(this.proofs.challenge(params.deviceId));
  }

  @Serves(provePhoneEndpoint)
  async prove(
    @Param() params: ParamsOf<typeof provePhoneEndpoint>,
    @Body() body: BodyOf<typeof provePhoneEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<PhoneProvenAnswer> {
    const outcome = await this.proofs.prove(
      params.deviceId,
      body.challenge,
      body.signature,
      body.passcode,
    );
    if (!outcome.proven) {
      request.log.info({ why: outcome.why }, 'A phone’s proof was refused.');
      // Told only to a phone whose own key signed the challenge (ADR-530).
      if (outcome.why === 'PASSCODE_NEEDED') throw new Refusal('MASTER_PASSCODE_NEEDED', 401);
      throw new Refusal('PHONE_NOT_PROVEN', 401);
    }
    request.log.info({ deviceId: params.deviceId }, 'A phone proved itself.');
    return phoneProvenAnswerSchema.parse({
      token: outcome.token,
      expiresInSeconds: outcome.expiresInSeconds,
    });
  }

  @Serves(provenPhoneEndpoint)
  async current(@Req() request: FastifyRequest): Promise<ProvenPhoneAnswer> {
    const phone = phoneOf(request);
    return provenPhoneAnswerSchema.parse({
      deviceId: phone.deviceId,
      name: phone.name,
      status: phone.status,
      outOfServiceAt: phone.outOfServiceAt?.toISOString() ?? null,
      keyRevoked: phone.keyRevoked,
      masterPasscodeVersion: phone.masterPasscodeVersion,
      masterPasscodeVersionInForce: await this.proofs.masterPasscodeVersionInForce(),
    });
  }
}
