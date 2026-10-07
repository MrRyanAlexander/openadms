// The endpoints of the firm's people (ARCHITECTURE §6, Authorization, §7.0; AC-02-08, 12, 13, 72;
// AC-10-25; ADR-406, 415): an admin creates a back-office or an outside user, gives and takes a
// manager/analyst's permissions and a viewer's projects, sets a password, ends sessions and
// archives; an admin or a manager/analyst reads a person. The door has already asked the
// caller's role (admission.ts); each service asks again inside its own piece of work. The log
// says what was done, never a name, an address or a password.
import {
  archivePersonEndpoint,
  createPersonEndpoint,
  endPersonSessionsEndpoint,
  passwordSetAnswerSchema,
  personAnswerSchema,
  readPersonEndpoint,
  sessionsEndedAnswerSchema,
  setPermissionsEndpoint,
  setPersonPasswordEndpoint,
  setViewerProjectsEndpoint,
  type PasswordSetAnswer,
  type PersonAnswer,
  type SessionsEndedAnswer,
} from '@open-adms/contracts';
import type { PermissionName } from '@open-adms/domain';
import { Body, Controller, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { apiPasswords } from '../sign-in/password-resets.controller.ts';
import { Passwords } from '../sign-in/passwords.ts';
import { People, type NewPerson, type PeopleRefused, type PersonOutcome } from './people.ts';

export const apiPeople = Symbol('the API’s people');

const statusOf: Readonly<Record<PeopleRefused, number>> = {
  NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  EMAIL_HELD: 409,
  LAST_ADMIN: 409,
  NOT_A_MANAGER_ANALYST: 422,
  NOT_A_VIEWER: 422,
  UNKNOWN_CONTRACTOR: 422,
  UNKNOWN_PROJECT: 422,
};

interface Named {
  readonly userId: string;
}

@Controller()
export class PeopleController {
  private readonly people: People;
  private readonly passwords: Passwords;

  constructor(@Inject(apiPeople) people: People, @Inject(apiPasswords) passwords: Passwords) {
    this.people = people;
    this.passwords = passwords;
  }

  @Serves(createPersonEndpoint)
  async create(@Body() body: NewPerson, @Req() request: FastifyRequest): Promise<PersonAnswer> {
    const outcome = await this.people.create(callerOf(request).userId, body);
    return this.answered(request, outcome, 'A person was created.');
  }

  @Serves(readPersonEndpoint)
  async read(@Param() params: Named, @Req() request: FastifyRequest): Promise<PersonAnswer> {
    const outcome = await this.people.read(callerOf(request).userId, params.userId);
    if (!outcome.done) throw new Refusal(outcome.code, statusOf[outcome.code]);
    return personAnswerSchema.parse(outcome.person);
  }

  @Serves(setPermissionsEndpoint)
  async setPermissions(
    @Param() params: Named,
    @Body() body: { permissions: PermissionName[] },
    @Req() request: FastifyRequest,
  ): Promise<PersonAnswer> {
    const outcome = await this.people.setPermissions(
      callerOf(request).userId,
      params.userId,
      body.permissions,
    );
    return this.answered(request, outcome, 'A person’s permissions were set.');
  }

  @Serves(setViewerProjectsEndpoint)
  async setViewerProjects(
    @Param() params: Named,
    @Body() body: { projectIds: string[] },
    @Req() request: FastifyRequest,
  ): Promise<PersonAnswer> {
    const outcome = await this.people.setViewerProjects(
      callerOf(request).userId,
      params.userId,
      body.projectIds,
    );
    return this.answered(request, outcome, 'A viewer’s projects were set.');
  }

  @Serves(setPersonPasswordEndpoint)
  async setPassword(
    @Param() params: Named,
    @Body() body: { password: string },
    @Req() request: FastifyRequest,
  ): Promise<PasswordSetAnswer> {
    const outcome = await this.passwords.setByAdmin(
      callerOf(request).userId,
      params.userId,
      body.password,
    );
    if (!outcome.set) {
      request.log.info({ why: outcome.code }, 'Setting a person’s password was refused.');
      if (outcome.code === 'NOT_ALLOWED') throw new Refusal('NOT_ALLOWED', 403);
      if (outcome.code === 'NOT_FOUND') throw new Refusal('NOT_FOUND', 404);
      if (outcome.code === 'RESET_REFUSED' || outcome.code === 'NO_MAIL') {
        throw new Error('An admin’s setting of a password answered as a reset does.');
      }
      // Why the password wasn't taken, in the domain's plain words, for whoever typed it.
      throw new Refusal(outcome.code, 422, outcome.message);
    }
    request.log.warn('An admin set a person’s password.');
    return passwordSetAnswerSchema.parse({ status: 'ok' });
  }

  @Serves(endPersonSessionsEndpoint)
  async endSessions(
    @Param() params: Named,
    @Req() request: FastifyRequest,
  ): Promise<SessionsEndedAnswer> {
    const outcome = await this.people.endSessions(callerOf(request).userId, params.userId);
    if (!outcome.done) throw new Refusal(outcome.code, statusOf[outcome.code]);
    request.log.warn({ sessions: outcome.sessions }, 'An admin ended a person’s sessions.');
    return sessionsEndedAnswerSchema.parse({ status: 'ended', sessions: outcome.sessions });
  }

  @Serves(archivePersonEndpoint)
  async archive(@Param() params: Named, @Req() request: FastifyRequest): Promise<PersonAnswer> {
    const outcome = await this.people.archive(callerOf(request).userId, params.userId);
    return this.answered(request, outcome, 'A person was archived.');
  }

  private answered(request: FastifyRequest, outcome: PersonOutcome, done: string): PersonAnswer {
    if (!outcome.done) {
      request.log.info({ why: outcome.code }, 'A change to a person was refused.');
      throw new Refusal(outcome.code, statusOf[outcome.code]);
    }
    request.log.info(done);
    return personAnswerSchema.parse(outcome.person);
  }
}
