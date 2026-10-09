// Setup's endpoints, step 5 (spec/parts/01-setup.md; ARCHITECTURE §6; AC-01-22…30, 83;
// AC-10-27; BACKLOG 2.4.2; ADR-160, 211, 214, 308, 425): a project's form for one document
// type, the debris types on its load and haul-out forms, and the firm's own fields on a form as
// its next version. The door has already asked the caller's role and that they hold Setup; the
// service asks again inside its own piece of work.
import {
  addFormDebrisTypeEndpoint,
  addFormDefinitionEndpoint,
  createFormEndpoint,
  type BodyOf,
  type ParamsOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { FormSetup } from './form-setup.ts';
import { answered, stated } from './setup-answered.ts';
import { formDebrisTypeRecord, formDefinitionRecord, formRecord } from './setup-records.ts';

export const apiFormSetup = Symbol('the API’s form setup');

type OnForm = ParamsOf<typeof addFormDebrisTypeEndpoint>;

@Controller()
export class FormSetupController {
  private readonly forms: FormSetup;

  constructor(@Inject(apiFormSetup) forms: FormSetup) {
    this.forms = forms;
  }

  @Serves(createFormEndpoint)
  async create(
    @Param() params: ParamsOf<typeof createFormEndpoint>,
    @Body() body: BodyOf<typeof createFormEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.forms.form(callerOf(request).userId, {
      projectId: params.projectId,
      ...stated(body),
    });
    return createFormEndpoint.answer.parse(
      answered(request, outcome, formRecord, 'A form was created.'),
    );
  }

  @Serves(addFormDebrisTypeEndpoint)
  async addDebrisType(
    @Param() params: OnForm,
    @Body() body: BodyOf<typeof addFormDebrisTypeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.forms.debrisType(callerOf(request).userId, {
      formId: params.formId,
      ...stated(body),
    });
    return addFormDebrisTypeEndpoint.answer.parse(
      answered(request, outcome, formDebrisTypeRecord, 'A debris type was added to a form.'),
    );
  }

  @Serves(addFormDefinitionEndpoint)
  async addDefinition(
    @Param() params: OnForm,
    @Body() body: BodyOf<typeof addFormDefinitionEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.forms.ownFields(
      callerOf(request).userId,
      params.formId,
      body.fields,
    );
    return addFormDefinitionEndpoint.answer.parse(
      answered(request, outcome, formDefinitionRecord, 'A form’s own fields were saved.'),
    );
  }
}
