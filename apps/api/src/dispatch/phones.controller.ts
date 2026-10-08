// The endpoints of the firm's phones and its master passcode (ARCHITECTURE §7.4, §7.5; AC-02-21,
// 23, 59; AC-10-24, 27; BACKLOG 2.4.3; ADR-428): a page of the phones, one taken out of service,
// the master passcode changed. The door has already asked the caller's role and permission
// (admission.ts); each service asks again inside its own piece of work. The log says what was
// done or why not, by code: never a name, a note, a password or the passcode.
import {
  changeMasterPasscodeEndpoint,
  listPhonesEndpoint,
  masterPasscodeAnswerSchema,
  phonesAnswerSchema,
  removePhoneEndpoint,
  type AnswerOf,
  type BodyOf,
  type MasterPasscodeAnswer,
  type ParamsOf,
  type PhonesAnswer,
  type QueryOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { answered } from '../setup/setup-answered.ts';
import { callerOf } from '../sign-in/admission.ts';
import { MasterPasscode } from './master-passcode.ts';
import { Phones } from './phones.ts';

export const apiPhones = Symbol('the API’s phones');
export const apiMasterPasscode = Symbol('the API’s master passcode');

// A page's size where the request names none.
const phonesPage = 50;

@Controller()
export class PhonesController {
  private readonly phones: Phones;
  private readonly passcode: MasterPasscode;

  constructor(
    @Inject(apiPhones) phones: Phones,
    @Inject(apiMasterPasscode) passcode: MasterPasscode,
  ) {
    this.phones = phones;
    this.passcode = passcode;
  }

  @Serves(listPhonesEndpoint)
  async list(
    @Query() query: QueryOf<typeof listPhonesEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<PhonesAnswer> {
    const outcome = await this.phones.list(callerOf(request).userId, {
      outOfService: query.outOfService === 'true',
      after: query.after,
      limit: query.limit === undefined ? phonesPage : Number(query.limit),
    });
    if (!outcome.done) throw new Refusal(outcome.code, 403);
    return phonesAnswerSchema.parse({ phones: outcome.phones, next: outcome.next });
  }

  @Serves(removePhoneEndpoint)
  async remove(
    @Param() params: ParamsOf<typeof removePhoneEndpoint>,
    @Body() body: BodyOf<typeof removePhoneEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<AnswerOf<typeof removePhoneEndpoint>> {
    const outcome = await this.phones.remove(callerOf(request).userId, params.deviceId, body);
    if (!outcome.saved && outcome.refusal.code === 'NOT_FOUND') {
      request.log.info({ why: 'NOT_FOUND' }, 'Taking a phone out of service was refused.');
      throw new Refusal('NOT_FOUND', 404);
    }
    if (outcome.saved) request.log.warn({ status: body.status }, 'A phone left service.');
    return removePhoneEndpoint.answer.parse(
      answered(request, outcome, (phone) => phone, 'A phone was taken out of service.'),
    );
  }

  @Serves(changeMasterPasscodeEndpoint)
  async changePasscode(
    @Body() body: BodyOf<typeof changeMasterPasscodeEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<MasterPasscodeAnswer> {
    const outcome = await this.passcode.change(
      callerOf(request).userId,
      body.currentPassword,
      body.passcode,
    );
    if (!outcome.changed) {
      request.log.info({ why: outcome.code }, 'Changing the master passcode was refused.');
      if (outcome.code === 'NOT_ALLOWED') throw new Refusal('NOT_ALLOWED', 403);
      // Why it wasn't taken, in the domain's plain words, for whoever typed it.
      throw new Refusal(outcome.code, 422, outcome.message);
    }
    request.log.warn(
      { version: outcome.version, told: outcome.told },
      'An admin changed the master passcode.',
    );
    return masterPasscodeAnswerSchema.parse({ status: 'ok', version: outcome.version });
  }
}
