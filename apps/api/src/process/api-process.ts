// The API as a process (ARCHITECTURE §3, §6; BACKLOG 2.1.2; ADR-380…385): NestJS on the Fastify
// adapter, with the structured log, the server's own request ids and the one error filter. It
// speaks plain HTTP to the proxy beside it and publishes no port: HTTPS is the proxy's (Caddy
// locally), the only way in.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { ErrorFilter } from './error-filter.ts';
import { logged, ProcessLog } from './logs.ts';
import type { Settings } from './settings.ts';

type Module = Parameters<typeof NestFactory.create>[0];

export class ApiProcess {
  readonly app: NestFastifyApplication;
  private readonly settings: Pick<Settings, 'host' | 'port'>;

  private constructor(app: NestFastifyApplication, settings: Pick<Settings, 'host' | 'port'>) {
    this.app = app;
    this.settings = settings;
  }

  // `more` is where the server's own log goes instead of standard output (a test reads it).
  static async create(
    module: Module,
    settings: Pick<Settings, 'host' | 'port'>,
    more: { stream?: { write(line: string): void } } = {},
  ): Promise<ApiProcess> {
    const adapter = new FastifyAdapter({
      ...logged,
      logger: { ...logged.logger, ...(more.stream === undefined ? {} : { stream: more.stream }) },
    });
    const app = await NestFactory.create<NestFastifyApplication>(module, adapter, {
      logger: new ProcessLog(adapter.getInstance().log),
    });
    app.useGlobalFilters(new ErrorFilter());
    app.enableShutdownHooks();
    return new ApiProcess(app, settings);
  }

  async listen(): Promise<void> {
    await this.app.listen(this.settings.port, this.settings.host);
  }

  async close(): Promise<void> {
    await this.app.close();
  }
}
