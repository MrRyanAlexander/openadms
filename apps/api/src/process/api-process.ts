// The API as a process (ARCHITECTURE §3, §6; BACKLOG 2.1.2, 2.1.3; ADR-380…385, 387…392): NestJS
// on the Fastify adapter, with the structured log, the server's own request ids, the one error
// filter, the boundary every request passes, the headers every answer carries and the API's
// database. It speaks plain HTTP to the proxy beside it and publishes no port: HTTPS is the
// proxy's (Caddy locally), the only way in.
import 'reflect-metadata';

import type { Database } from '@open-adms/db';
import {
  PasswordRules,
  RateLimits,
  SignInTries,
  TwoStepRules,
  type Policy,
} from '@open-adms/domain';
import {
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
  type Type,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { apiPeople } from '../people/people.controller.ts';
import { People } from '../people/people.ts';
import type { Clock } from '../setup/setup-service.ts';
import { Admission } from '../sign-in/admission.ts';
import { shippedBreachedPasswords } from '../sign-in/breached-list.ts';
import { mailFor, type Mail } from '../sign-in/mail.ts';
import { OneTimeCodes } from '../sign-in/one-time-codes.ts';
import { PasswordHasher } from '../sign-in/password-hasher.ts';
import { apiPasswords } from '../sign-in/password-resets.controller.ts';
import { Passwords } from '../sign-in/passwords.ts';
import { ResetCodes } from '../sign-in/reset-codes.ts';
import { SessionTokens } from '../sign-in/session-tokens.ts';
import { apiSessions, apiSessionTokens } from '../sign-in/sessions.controller.ts';
import { Sessions } from '../sign-in/sessions.ts';
import { TwoStepSecrets } from '../sign-in/two-step-secrets.ts';
import { apiTwoStep } from '../sign-in/two-step.controller.ts';
import { TwoStep, TwoStepCheck } from '../sign-in/two-step.ts';
import { WrongTries } from '../sign-in/wrong-tries.ts';
import { answersWith } from './answer-headers.ts';
import { apiDatabase, openApiDatabase } from './api-database.ts';
import { Boundary, requestNow } from './boundary.ts';
import { ErrorFilter } from './error-filter.ts';
import { apiLimits, Limits } from './limits.ts';
import { logged, ProcessLog } from './logs.ts';
import type { Settings } from './settings.ts';

export type ProcessSettings = Pick<
  Settings,
  | 'host'
  | 'port'
  | 'databaseUrl'
  | 'corsOrigins'
  | 'trustedProxies'
  | 'tokenSigningSecret'
  | 'smtpUrl'
  | 'smtpAddress'
  | 'mailFrom'
>;

export type ProcessPolicy = Pick<
  Policy,
  | 'requestBodyLimitBytes'
  | 'databasePoolConnections'
  | 'passwordMinimumLength'
  | 'passwordMaximumLength'
  | 'passwordResetMinutes'
  | 'accessTokenMinutes'
  | 'sessionInactivityMinutes'
  | 'sessionOverallHours'
  | 'signInTriesBeforeWait'
  | 'signInTriesBeforeLock'
  | 'signInFirstWaitSeconds'
  | 'signInLongestWaitMinutes'
  | 'twoStepCodeStepsEitherSide'
  | 'twoStepSetupMinutes'
  | 'rateLimitWindowSeconds'
  | 'rateLimitRequestsPerAddress'
  | 'rateLimitRequestsPerAccount'
  | 'rateLimitCountsKept'
  | 'signInAddressWindowMinutes'
  | 'signInWrongTriesPerAddress'
  | 'signInWrongTriesPerAddressAtLogin'
  | 'passwordResetAsksPerAddress'
  | 'passwordResetAsksPerLogin'
>;

// What a test puts in place of the process's own: where the log goes instead of standard output,
// the database (a test's own piece of work, undone afterwards), the mail and the time.
export interface ProcessParts {
  readonly stream?: { write(line: string): void };
  readonly database?: Database;
  readonly mail?: Mail;
  readonly clock?: Clock;
}

export interface Route {
  readonly method: string;
  readonly path: string;
}

// The given endpoints with what every one of them may be handed: the API's database, opened once
// and closed when the process stops, and the services that stand on it.
@Module({})
class ProcessModule implements OnApplicationShutdown {
  private readonly database: Database;

  constructor(@Inject(apiDatabase) database: Database) {
    this.database = database;
  }

  static around(
    module: Type<unknown>,
    database: Database,
    passwords: Passwords,
    sessions: Sessions,
    tokens: SessionTokens,
    twoStep: TwoStep,
    people: People,
    limits: Limits,
  ): DynamicModule {
    return {
      module: ProcessModule,
      global: true,
      imports: [module],
      providers: [
        { provide: apiDatabase, useValue: database },
        { provide: apiPasswords, useValue: passwords },
        { provide: apiSessions, useValue: sessions },
        { provide: apiSessionTokens, useValue: tokens },
        { provide: apiTwoStep, useValue: twoStep },
        { provide: apiPeople, useValue: people },
        { provide: apiLimits, useValue: limits },
      ],
      exports: [
        apiDatabase,
        apiPasswords,
        apiSessions,
        apiSessionTokens,
        apiTwoStep,
        apiPeople,
        apiLimits,
      ],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.database.$disconnect();
  }
}

export class ApiProcess {
  readonly app: NestFastifyApplication;
  // Every route the process serves, as it was mapped (a test holds them to the contracts' list).
  readonly routes: readonly Route[];
  private readonly settings: ProcessSettings;

  private constructor(app: NestFastifyApplication, routes: Route[], settings: ProcessSettings) {
    this.app = app;
    this.routes = routes;
    this.settings = settings;
  }

  static async create(
    module: Type<unknown>,
    settings: ProcessSettings,
    policy: ProcessPolicy,
    more: ProcessParts = {},
  ): Promise<ApiProcess> {
    const adapter = new FastifyAdapter({
      ...logged,
      logger: { ...logged.logger, ...(more.stream === undefined ? {} : { stream: more.stream }) },
      // A body that says it is larger, or turns out to be, is refused before it is read whole.
      bodyLimit: policy.requestBodyLimitBytes,
      // Whose word is taken for the address a request came from: a listed proxy's, nobody
      // else's. With none listed it is the address that connected (ADR-416).
      trustProxy: settings.trustedProxies.length > 0 ? [...settings.trustedProxies] : false,
    });
    const server = adapter.getInstance();
    const routes: Route[] = [];
    server.addHook('onRoute', (route) => {
      for (const method of [route.method].flat()) routes.push({ method, path: route.url });
    });
    const database = more.database ?? openApiDatabase(settings, policy.databasePoolConnections);
    const clock = more.clock ?? { now: () => new Date() };
    const limits = new Limits(new RateLimits(policy), clock);
    answersWith(server, settings.corsOrigins, (request) => limits.arrived(request.ip));
    const mail = more.mail ?? mailFor(settings);
    const hasher = new PasswordHasher(settings.tokenSigningSecret);
    const tokens = new SessionTokens(settings.tokenSigningSecret, policy.accessTokenMinutes);
    const tries = new WrongTries(database, {
      rules: new SignInTries(policy),
      clock,
      mail,
      requestNow,
    });
    const check = new TwoStepCheck(
      new TwoStepRules(policy),
      new OneTimeCodes(),
      new TwoStepSecrets(settings.tokenSigningSecret),
    );
    const sessions = new Sessions(database, {
      tokens,
      hasher,
      tries,
      twoStep: check,
      clock,
      policy,
      requestNow,
    });
    const twoStep = new TwoStep(database, { check, clock, mail, sessions, requestNow });
    const passwords = new Passwords(database, {
      rules: new PasswordRules(policy, shippedBreachedPasswords()),
      hasher,
      resetCodes: new ResetCodes(settings.tokenSigningSecret, policy.passwordResetMinutes),
      mail,
      clock,
      resetMinutes: policy.passwordResetMinutes,
      sessions,
      tries,
      limits,
    });
    const people = new People(database, { clock, sessions });
    const app = await NestFactory.create<NestFastifyApplication>(
      ProcessModule.around(module, database, passwords, sessions, tokens, twoStep, people, limits),
      adapter,
      { logger: new ProcessLog(server.log) },
    );
    app.useGlobalFilters(new ErrorFilter());
    app.useGlobalInterceptors(new Boundary(new Admission(sessions, tokens, limits)));
    app.enableShutdownHooks();
    return new ApiProcess(app, routes, settings);
  }

  async listen(): Promise<void> {
    await this.app.listen(this.settings.port, this.settings.host);
  }

  async close(): Promise<void> {
    await this.app.close();
  }
}
