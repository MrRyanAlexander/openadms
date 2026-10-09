// A refusal a service makes for a reason of its own (ARCHITECTURE §6, Output; ADR-385, 405): the
// caller gets its plain code and the request's id, as for every refusal, and nothing else, but
// for the plain words a rule of the domain's has for the person who typed something (why a
// password wasn't taken, ADR-415; why a setting wasn't saved, with the rule's own code, ADR-424):
// never a message from inside the server.
import type { ErrorCode } from '@open-adms/contracts';
import { HttpException } from '@nestjs/common';

export class Refusal extends HttpException {
  readonly code: ErrorCode;
  readonly said: string | undefined;
  // The domain's own code for the rule that refused a setting (ADR-424).
  readonly reason: string | undefined;

  constructor(code: ErrorCode, status: number, said?: string, reason?: string) {
    super(code, status);
    this.code = code;
    this.said = said;
    this.reason = reason;
  }
}
