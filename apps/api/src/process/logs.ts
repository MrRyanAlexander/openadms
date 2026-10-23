// The API's logs (ARCHITECTURE §6, Logs; AC-10-32; T-26; ADR-385): one JSON object a line, each
// request's lines carrying its id, and nothing secret or personal by construction. A request is
// logged as its method and its path: never its query, its headers or its body. An error is logged
// as its kind and where it was thrown: never its message, which may quote what a caller sent.
import { randomUUID } from 'node:crypto';

import type { LoggerService } from '@nestjs/common';
import { LogController, type FastifyBaseLogger, type FastifyServerOptions } from 'fastify';

interface Requested {
  readonly method: string;
  readonly url: string;
}

interface Answered {
  readonly statusCode: number;
}

export const requestIdLabel = 'requestId';

// How much the log says (ADMS_LOG_LEVEL): `debug` on a test install, `warn` on a firm's server,
// `info` where none is set (the user, 2026-10-23: production "not all the extra logs").
export const logLevels = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof logLevels)[number];
export const isLogLevel = (value: string): value is LogLevel =>
  (logLevels as readonly string[]).includes(value);

// What the server is given so that every request has an id of the server's own making (a caller's
// header is never taken as one) and is logged by the rules above.
export const logged = {
  genReqId: () => randomUUID(),
  requestIdHeader: false,
  logController: new LogController({ requestIdLogLabel: requestIdLabel }),
  logger: {
    level: 'info',
    base: { service: 'api' },
    serializers: {
      req: (request: Requested) => ({ method: request.method, path: pathOf(request.url) }),
      res: (answer: Answered) => ({ status: answer.statusCode }),
    },
  },
} satisfies FastifyServerOptions;

export function pathOf(url: string): string {
  return url.split('?', 1)[0] ?? '';
}

// The kind of an error and the frames it passed through, without its message.
export function errorLogged(error: unknown): { kind: string; code?: string; at: string[] } {
  if (!(error instanceof Error)) return { kind: typeof error, at: [] };
  const code: unknown = (error as { code?: unknown }).code;
  return {
    kind: error.constructor.name,
    ...(typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? { code } : {}),
    at: (error.stack ?? '')
      .split('\n')
      .filter((line) => line.startsWith('    at '))
      .map((line) => line.trim()),
  };
}

// The framework's own lines (starting, routes mapped) through the same structured log.
export class ProcessLog implements LoggerService {
  private readonly to: FastifyBaseLogger;

  constructor(to: FastifyBaseLogger) {
    this.to = to;
  }

  log(message: unknown, context?: string): void {
    this.to.info({ context }, String(message));
  }

  warn(message: unknown, context?: string): void {
    this.to.warn({ context }, String(message));
  }

  // The framework hands an error's message and stack as text; only that one happened is kept.
  error(_message: unknown, ...rest: unknown[]): void {
    const context = rest.at(-1);
    this.to.error(
      { context: typeof context === 'string' ? context : undefined },
      'The framework reported an error.',
    );
  }
}
