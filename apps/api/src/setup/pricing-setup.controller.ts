// Setup's endpoints, steps 6 and 8 (spec/parts/01-setup.md; spec/RULES.md; ARCHITECTURE §6;
// AC-01-39…51, 60…68, 81; AC-10-27, 38; BACKLOG 2.4.2, C97; ADR-206, 229, 239, 301, 313, 420,
// 425): a pay item read off the contract, a change to one, a prime's rate on it and its "Pays
// when"; a rule written in the rule builder, and one stated anew. Each of them moves what
// tickets bill, and its answer says what it queued (ADR-422). The door has already asked the
// caller's role and that they hold Setup; each service asks again inside its own piece of work.
import {
  changePayItemEndpoint,
  changeRuleEndpoint,
  createPayItemEndpoint,
  createRuleEndpoint,
  savePaysWhenEndpoint,
  setPayItemRateEndpoint,
  type BodyOf,
  type ParamsOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { PayItemSetup } from './pay-item-setup.ts';
import { RuleSetup } from './rule-setup.ts';
import { answered, stated } from './setup-answered.ts';
import {
  payItemRateRecord,
  payItemRecord,
  rulesKeptRecord,
  savedRuleRecord,
} from './setup-records.ts';

export const apiPayItemSetup = Symbol('the API’s pay item setup');
export const apiRuleSetup = Symbol('the API’s rule setup');

type OnPayItem = ParamsOf<typeof changePayItemEndpoint>;
type RuleBody = BodyOf<typeof createRuleEndpoint>;

// A rule as its body states it, each line holding only what was sent.
const ruleStated = (body: RuleBody) => ({
  formId: body.formId,
  name: body.name,
  contractId: body.contractId,
  active: body.active,
  criteria: body.criteria.map(stated),
  actions: body.actions.map(stated),
});

@Controller()
export class PricingSetupController {
  private readonly payItems: PayItemSetup;
  private readonly rules: RuleSetup;

  constructor(
    @Inject(apiPayItemSetup) payItems: PayItemSetup,
    @Inject(apiRuleSetup) rules: RuleSetup,
  ) {
    this.payItems = payItems;
    this.rules = rules;
  }

  @Serves(createPayItemEndpoint)
  async createPayItem(
    @Param() params: ParamsOf<typeof createPayItemEndpoint>,
    @Body() body: BodyOf<typeof createPayItemEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.payItems.payItem(callerOf(request).userId, {
      projectId: params.projectId,
      ...body,
    });
    return createPayItemEndpoint.answer.parse(
      answered(request, outcome, payItemRecord, 'A pay item was entered.'),
    );
  }

  @Serves(changePayItemEndpoint)
  async changePayItem(
    @Param() params: OnPayItem,
    @Body() body: BodyOf<typeof changePayItemEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.payItems.change(
      callerOf(request).userId,
      params.payItemId,
      stated(body),
    );
    return changePayItemEndpoint.answer.parse(
      answered(request, outcome, payItemRecord, 'A pay item was changed.'),
    );
  }

  @Serves(setPayItemRateEndpoint)
  async setRate(
    @Param() params: ParamsOf<typeof setPayItemRateEndpoint>,
    @Body() body: BodyOf<typeof setPayItemRateEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.payItems.rate(
      callerOf(request).userId,
      params.payItemId,
      params.primeId,
      body.rate,
    );
    return setPayItemRateEndpoint.answer.parse(
      answered(request, outcome, payItemRateRecord, 'A prime’s rate was set on a pay item.'),
    );
  }

  @Serves(savePaysWhenEndpoint)
  async savePaysWhen(
    @Param() params: OnPayItem,
    @Body() body: BodyOf<typeof savePaysWhenEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.payItems.paysWhen(
      callerOf(request).userId,
      params.payItemId,
      body.pays.map((each) => ({ ...stated(each), criteria: each.criteria.map(stated) })),
    );
    return savePaysWhenEndpoint.answer.parse(
      answered(request, outcome, rulesKeptRecord, 'A pay item’s "Pays when" was saved.'),
    );
  }

  @Serves(createRuleEndpoint)
  async createRule(
    @Param() params: ParamsOf<typeof createRuleEndpoint>,
    @Body() body: RuleBody,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.rules.save(callerOf(request).userId, {
      projectId: params.projectId,
      ...ruleStated(body),
    });
    return createRuleEndpoint.answer.parse(
      answered(request, outcome, savedRuleRecord, 'A rule was written.'),
    );
  }

  @Serves(changeRuleEndpoint)
  async changeRule(
    @Param() params: ParamsOf<typeof changeRuleEndpoint>,
    @Body() body: RuleBody,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.rules.change(
      callerOf(request).userId,
      params.ruleId,
      ruleStated(body),
    );
    return changeRuleEndpoint.answer.parse(
      answered(request, outcome, savedRuleRecord, 'A rule was changed.'),
    );
  }
}
