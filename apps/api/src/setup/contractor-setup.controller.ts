// Setup's endpoints, step 4 (spec/parts/01-setup.md; ARCHITECTURE §6; AC-01-21, 80; AC-10-27;
// BACKLOG 2.4.2; ADR-108, 146, 305, 321, 424, 426): a contractor, searched for and picked or
// created, changed, archived and put back; a prime added to a project; a contract, changed,
// archived and put back; a sub typed twice merged into one (ADR-527 (1), (2), (11)). The door
// has already asked the caller's role and that they hold Setup; the service asks again inside
// its own piece of work.
import {
  addPrimeEndpoint,
  archiveContractEndpoint,
  archiveContractorEndpoint,
  changeContractEndpoint,
  changeContractorEndpoint,
  createContractEndpoint,
  createContractorEndpoint,
  findContractorsEndpoint,
  mergeContractorEndpoint,
  unarchiveContractEndpoint,
  unarchiveContractorEndpoint,
  type BodyOf,
  type ParamsOf,
  type QueryOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { ContractorSetup } from './contractor-setup.ts';
import { answered, searched, stated } from './setup-answered.ts';
import { contractorPlaceRecord, contractorRecord, contractRecord } from './setup-records.ts';

export const apiContractorSetup = Symbol('the API’s contractor setup');

@Controller()
export class ContractorSetupController {
  private readonly contractors: ContractorSetup;

  constructor(@Inject(apiContractorSetup) contractors: ContractorSetup) {
    this.contractors = contractors;
  }

  @Serves(findContractorsEndpoint)
  async find(@Query() query: QueryOf<typeof findContractorsEndpoint>) {
    const found = await this.contractors.findContractors(searched(query));
    return findContractorsEndpoint.answer.parse({
      records: found.records.map(contractorRecord),
      next: found.next,
    });
  }

  @Serves(createContractorEndpoint)
  async create(
    @Body() body: BodyOf<typeof createContractorEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.contractors.contractor(callerOf(request).userId, stated(body));
    return createContractorEndpoint.answer.parse(
      answered(request, outcome, contractorRecord, 'A contractor was created.'),
    );
  }

  @Serves(changeContractorEndpoint)
  async change(
    @Param() params: ParamsOf<typeof changeContractorEndpoint>,
    @Body() body: BodyOf<typeof changeContractorEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.contractors.changeContractor(
      callerOf(request).userId,
      params.contractorId,
      stated(body),
    );
    return changeContractorEndpoint.answer.parse(
      answered(request, outcome, contractorRecord, 'A contractor was changed.'),
    );
  }

  @Serves(archiveContractorEndpoint)
  async archive(
    @Param() params: ParamsOf<typeof archiveContractorEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.contractors.archiveContractor(
      callerOf(request).userId,
      params.contractorId,
      true,
    );
    return archiveContractorEndpoint.answer.parse(
      answered(request, outcome, contractorRecord, 'A contractor was archived.'),
    );
  }

  @Serves(unarchiveContractorEndpoint)
  async unarchive(
    @Param() params: ParamsOf<typeof unarchiveContractorEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.contractors.archiveContractor(
      callerOf(request).userId,
      params.contractorId,
      false,
    );
    return unarchiveContractorEndpoint.answer.parse(
      answered(request, outcome, contractorRecord, 'A contractor was put back.'),
    );
  }

  @Serves(addPrimeEndpoint)
  async addPrime(
    @Param() params: ParamsOf<typeof addPrimeEndpoint>,
    @Body() body: BodyOf<typeof addPrimeEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.contractors.addPrime(
      callerOf(request).userId,
      params.projectId,
      body.contractorId,
    );
    return addPrimeEndpoint.answer.parse(
      answered(request, outcome, contractorPlaceRecord, 'A prime was added to a project.'),
    );
  }

  @Serves(createContractEndpoint)
  async createContract(
    @Param() params: ParamsOf<typeof createContractEndpoint>,
    @Body() body: BodyOf<typeof createContractEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.contractors.contract(callerOf(request).userId, {
      projectId: params.projectId,
      ...stated(body),
    });
    return createContractEndpoint.answer.parse(
      answered(request, outcome, contractRecord, 'A contract was created.'),
    );
  }

  @Serves(changeContractEndpoint)
  async changeContract(
    @Param() params: ParamsOf<typeof changeContractEndpoint>,
    @Body() body: BodyOf<typeof changeContractEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.contractors.changeContract(
      callerOf(request).userId,
      params.contractId,
      stated(body),
    );
    return changeContractEndpoint.answer.parse(
      answered(request, outcome, contractRecord, 'A contract was changed.'),
    );
  }

  @Serves(archiveContractEndpoint)
  async archiveContract(
    @Param() params: ParamsOf<typeof archiveContractEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.contractors.archiveContract(
      callerOf(request).userId,
      params.contractId,
      true,
    );
    return archiveContractEndpoint.answer.parse(
      answered(request, outcome, contractRecord, 'A contract was archived.'),
    );
  }

  @Serves(unarchiveContractEndpoint)
  async unarchiveContract(
    @Param() params: ParamsOf<typeof unarchiveContractEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.contractors.archiveContract(
      callerOf(request).userId,
      params.contractId,
      false,
    );
    return unarchiveContractEndpoint.answer.parse(
      answered(request, outcome, contractRecord, 'A contract was put back.'),
    );
  }

  @Serves(mergeContractorEndpoint)
  async merge(
    @Param() params: ParamsOf<typeof mergeContractorEndpoint>,
    @Body() body: BodyOf<typeof mergeContractorEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.contractors.merge(
      callerOf(request).userId,
      params.contractorId,
      body.intoContractorId,
    );
    return mergeContractorEndpoint.answer.parse(
      answered(request, outcome, contractorRecord, 'A contractor was merged into another.'),
    );
  }
}
