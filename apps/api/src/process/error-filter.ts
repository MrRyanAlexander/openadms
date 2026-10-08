// The one error filter (ARCHITECTURE §6, Output; AC-10-33; T-26; ADR-385): whatever is thrown,
// the caller gets a plain code and the request's id. No stack trace, query, file path or internal
// message leaves the server; what failed inside is logged, by its kind (logs.ts). What the
// database's own constraints refused is a refusal, not a failure (database-refusal.ts).
import { errorAnswerSchema, type ErrorCode } from '@open-adms/contracts';
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { databaseRefusalOf } from './database-refusal.ts';
import { Limited } from './limits.ts';
import { errorLogged } from './logs.ts';
import { Refusal } from './refusal.ts';

const codes: Readonly<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  413: 'TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(thrown: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    // What the database's own constraints refused is the caller's to hear, plainly (ADR-424).
    const refused = databaseRefusalOf(thrown);
    if (refused !== undefined) {
      request.log.info(
        { why: refused.code, sqlState: refused.sqlState, constraint: refused.constraint },
        'The database refused what a request asked for.',
      );
      void reply
        .status(refused.status)
        .header('content-type', 'application/json; charset=utf-8')
        .send(
          errorAnswerSchema.parse({
            code: refused.code,
            requestId: request.id,
            message: refused.said,
          }),
        );
      return;
    }
    const status = ErrorFilter.statusOf(thrown);
    if (status >= 500) {
      request.log.error({ err: errorLogged(thrown) }, 'A request failed inside the server.');
    }
    // A caller over a rate limit: the log says which limit, never who (ADR-416).
    if (thrown instanceof Limited) {
      request.log.warn({ limit: thrown.limit }, 'A caller was limited.');
      void reply.header('retry-after', String(thrown.retryAfterSeconds));
    }
    void reply
      .status(status)
      .header('content-type', 'application/json; charset=utf-8')
      .send(
        errorAnswerSchema.parse({
          code:
            status >= 500
              ? 'INTERNAL_ERROR'
              : thrown instanceof Refusal
                ? thrown.code
                : (codes[status] ?? 'BAD_REQUEST'),
          requestId: request.id,
          ...(status < 500 && thrown instanceof Refusal && thrown.said !== undefined
            ? { message: thrown.said }
            : {}),
          ...(status < 500 && thrown instanceof Refusal && thrown.reason !== undefined
            ? { reason: thrown.reason }
            : {}),
          ...(thrown instanceof Limited ? { retryAfterSeconds: thrown.retryAfterSeconds } : {}),
        }),
      );
  }

  // The framework's own refusals and the server's (a body that isn't JSON, one too large) keep
  // their status; anything else is the server's failure.
  private static statusOf(thrown: unknown): number {
    const status =
      thrown instanceof HttpException
        ? thrown.getStatus()
        : (thrown as { statusCode?: unknown } | null)?.statusCode;
    return typeof status === 'number' && status >= 400 && status < 500 ? status : 500;
  }
}
