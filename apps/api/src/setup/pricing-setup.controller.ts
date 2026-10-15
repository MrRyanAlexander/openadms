// Setup's endpoints, steps 6 and 8 (spec/parts/01-setup.md; spec/RULES.md; ARCHITECTURE §6;
// AC-01-39…51, 60…68, 81; AC-10-27, 38; BACKLOG 2.4.2, C97; ADR-206, 229, 239, 301, 313, 420,
// 425): a pay item read off the contract, a change to one, a prime's rate on it and its "Pays
// when"; a rule written in the rule builder, and one stated anew; a pay item archived and put
// back, a prime's rate taken off, a crew day's steps, a rule archived and put back (ADR-527 (7),
// (8)). Each of them moves what
// tickets bill, and its answer says what it queued (ADR-422). The door has already asked the
// caller's role and that they hold Setup; each service asks again inside its own piece of work.
import {
  archivePayItemEndpoint,
  archivePayItemRateEndpoint,
  archiveRuleEndpoint,
  changePayItemEndpoint,
  changeRuleEndpoint,
  createPayItemEndpoint,
  createRuleEndpoint,
  savePaysWhenEndpoint,
  setCrewDayStepsEndpoint,
  setPayItemRateEndpoint,
  unarchivePayItemEndpoint,
  unarchiveRuleEndpoint,
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
  crewDayStepsRecord,
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
  @Serves(archivePayItemEndpoint)
  async archivePayItem(@Param() params: OnPayItem, @Req() request: FastifyRequest) {
    const outcome = await this.payItems.archive(callerOf(request).userId, params.payItemId, true);
    return archivePayItemEndpoint.answer.parse(
      answered(request, outcome, payItemRecord, 'A pay item was archived.'),
    );
  }

  @Serves(unarchivePayItemEndpoint)
  async unarchivePayItem(@Param() params: OnPayItem, @Req() request: FastifyRequest) {
    const outcome = await this.payItems.archive(callerOf(request).userId, params.payItemId, false);
    return unarchivePayItemEndpoint.answer.parse(
      answered(request, outcome, payItemRecord, 'A pay item was put back.'),
    );
  }

  @Serves(archivePayItemRateEndpoint)
  async archiveRate(
    @Param() params: ParamsOf<typeof archivePayItemRateEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.payItems.archiveRate(
      callerOf(request).userId,
      params.payItemId,
      params.primeId,
    );
    return archivePayItemRateEndpoint.answer.parse(
      answered(request, outcome, payItemRateRecord, 'A prime’s rate was taken off a pay item.'),
    );
  }

  @Serves(setCrewDayStepsEndpoint)
  async setCrewDaySteps(
    @Param() params: OnPayItem,
    @Body() body: BodyOf<typeof setCrewDayStepsEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.payItems.crewDaySteps(
      callerOf(request).userId,
      params.payItemId,
      body.steps,
    );
    return setCrewDayStepsEndpoint.answer.parse(
      answered(
        request,
        outcome,
        (steps) => crewDayStepsRecord(params.payItemId, steps),
        'A pay item’s crew day steps were stated.',
      ),
    );
  }

  @Serves(archiveRuleEndpoint)
  async archiveRule(
    @Param() params: ParamsOf<typeof archiveRuleEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.rules.archive(callerOf(request).userId, params.ruleId, true);
    return archiveRuleEndpoint.answer.parse(
      answered(request, outcome, savedRuleRecord, 'A rule was archived.'),
    );
  }

  @Serves(unarchiveRuleEndpoint)
  async unarchiveRule(
    @Param() params: ParamsOf<typeof unarchiveRuleEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.rules.archive(callerOf(request).userId, params.ruleId, false);
    return unarchiveRuleEndpoint.answer.parse(
      answered(request, outcome, savedRuleRecord, 'A rule was put back.'),
    );
  }
}
