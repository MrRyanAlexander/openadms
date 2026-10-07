// The API as a process (ARCHITECTURE §3, §6; BACKLOG 2.1.2, 2.1.3; ADR-380…385, 387…392): NestJS
// on the Fastify adapter, with the structured log, the server's own request ids, the one error
// filter, the boundary every request passes, the headers every answer carries and the API's
// database. It speaks plain HTTP to the proxy beside it and publishes no port: HTTPS is the
// proxy's (Caddy locally), the only way in.
import 'reflect-metadata';

import type { Database } from '@open-adms/db';
import type { Policy } from '@open-adms/domain';
import {
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
  type Type,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { answersWith } from './answer-headers.ts';
import { apiDatabase, openApiDatabase } from './api-database.ts';
import { Boundary } from './boundary.ts';
import { ErrorFilter } from './error-filter.ts';
import { logged, ProcessLog } from './logs.ts';
import type { Settings } from './settings.ts';

export type ProcessSettings = Pick<Settings, 'host' | 'port' | 'databaseUrl' | 'corsOrigins'>;

export interface Route {
  readonly method: string;
  readonly path: string;
}

// The given endpoints with what every one of them may be handed: the API's database, opened once
// and closed when the process stops.
@Module({})
class ProcessModule implements OnApplicationShutdown {
  private readonly database: Database;

  constructor(@Inject(apiDatabase) database: Database) {
    this.database = database;
  }

  static around(module: Type<unknown>, database: Database): DynamicModule {
    return {
      module: ProcessModule,
      global: true,
      imports: [module],
      providers: [{ provide: apiDatabase, useValue: database }],
      exports: [apiDatabase],
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

  // `more` is where the server's own log goes instead of standard output (a test reads it).
  static async create(
    module: Type<unknown>,
    settings: ProcessSettings,
    policy: Pick<Policy, 'requestBodyLimitBytes'>,
    more: { stream?: { write(line: string): void } } = {},
  ): Promise<ApiProcess> {
    const adapter = new FastifyAdapter({
      ...logged,
      logger: { ...logged.logger, ...(more.stream === undefined ? {} : { stream: more.stream }) },
      // A body that says it is larger, or turns out to be, is refused before it is read whole.
      bodyLimit: policy.requestBodyLimitBytes,
    });
    const server = adapter.getInstance();
    const routes: Route[] = [];
    server.addHook('onRoute', (route) => {
      for (const method of [route.method].flat()) routes.push({ method, path: route.url });
    });
    answersWith(server, settings.corsOrigins);
    const app = await NestFactory.create<NestFastifyApplication>(
      ProcessModule.around(module, openApiDatabase(settings)),
      adapter,
      { logger: new ProcessLog(server.log) },
    );
    app.useGlobalFilters(new ErrorFilter());
    app.useGlobalInterceptors(new Boundary());
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
