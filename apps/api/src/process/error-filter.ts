// The one error filter (ARCHITECTURE §6, Output; AC-10-33; T-26; ADR-385): whatever is thrown,
// the caller gets a plain code and the request's id. No stack trace, query, file path or internal
// message leaves the server; what failed inside is logged, by its kind (logs.ts).
import { errorAnswerSchema, type ErrorCode } from '@open-adms/contracts';
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

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
    const status = ErrorFilter.statusOf(thrown);
    if (status >= 500) {
      request.log.error({ err: errorLogged(thrown) }, 'A request failed inside the server.');
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
