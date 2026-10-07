// A refusal a service makes for a reason of its own (ARCHITECTURE §6, Output; ADR-385, 405): the
// caller gets its plain code and the request's id, as for every refusal, and nothing else.
import type { ErrorCode } from '@open-adms/contracts';
import { HttpException } from '@nestjs/common';

export class Refusal extends HttpException {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, status: number) {
    super(code, status);
    this.code = code;
  }
}
