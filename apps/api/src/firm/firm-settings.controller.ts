// The firm's own settings' endpoints (REQ-214, 215; ADR-520, 530): read them, change the hours a
// lost phone keeps its key, change whether read-only viewers must use two-step sign-in. The door
// has already asked the caller's role and permission (admission.ts); the service asks again
// inside its own piece of work. The log says what was done or why not, by code: never a note.
import {
  changePhoneKeyHoursEndpoint,
  changeViewerTwoStepEndpoint,
  firmSettingsAnswerSchema,
  firmSettingsEndpoint,
  type BodyOf,
  type FirmSettingsAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import type { Outcome } from '../setup/setup-service.ts';
import { callerOf } from '../sign-in/admission.ts';
import { FirmSettings, type FirmSettingsRead } from './firm-settings.ts';

export const apiFirmSettings = Symbol('the API’s firm settings');

@Controller()
export class FirmSettingsController {
  private readonly settings: FirmSettings;

  constructor(@Inject(apiFirmSettings) settings: FirmSettings) {
    this.settings = settings;
  }

  @Serves(firmSettingsEndpoint)
  async read(@Req() request: FastifyRequest): Promise<FirmSettingsAnswer> {
    const read = await this.settings.read(callerOf(request).userId);
    if (read === undefined) throw new Refusal('NOT_ALLOWED', 403);
    return firmSettingsAnswerSchema.parse(read);
  }

  @Serves(changePhoneKeyHoursEndpoint)
  async changePhoneKey(
    @Body() body: BodyOf<typeof changePhoneKeyHoursEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<FirmSettingsAnswer> {
    const outcome = await this.settings.changePhoneKeyHours(
      callerOf(request).userId,
      body.hours,
      body.note,
    );
    return FirmSettingsController.answered(
      request,
      outcome,
      'The hours a lost phone keeps its key were changed.',
    );
  }

  @Serves(changeViewerTwoStepEndpoint)
  async changeViewerTwoStep(
    @Body() body: BodyOf<typeof changeViewerTwoStepEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<FirmSettingsAnswer> {
    const outcome = await this.settings.changeViewerTwoStep(
      callerOf(request).userId,
      body.required,
      body.note,
    );
    return FirmSettingsController.answered(
      request,
      outcome,
      'Whether read-only viewers must use two-step sign-in was changed.',
    );
  }

  private static answered(
    request: FastifyRequest,
    outcome: Outcome<FirmSettingsRead>,
    done: string,
  ): FirmSettingsAnswer {
    if (!outcome.saved) {
      request.log.info(
        { why: outcome.refusal.code },
        'A change to the firm’s settings was refused.',
      );
      throw new Refusal('NOT_ALLOWED', 403);
    }
    request.log.warn(done);
    return firmSettingsAnswerSchema.parse(outcome.record);
  }
}
