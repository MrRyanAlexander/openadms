// The health answer (AC-10-01; acceptance file 10, point 17; ADR-385): that the process answers,
// to anybody who asks, and nothing else. The readiness answer (ADR-507): the same, said only
// while the database answers the API too; otherwise 503 `UNAVAILABLE`.
import {
  healthAnswerSchema,
  healthEndpoint,
  readinessEndpoint,
  type HealthAnswer,
} from '@open-adms/contracts';
import { Controller, Inject } from '@nestjs/common';

import { apiReadiness, type Readiness } from './readiness.ts';
import { Serves } from './serves.ts';

@Controller()
export class HealthController {
  private readonly readiness: Readiness;

  constructor(@Inject(apiReadiness) readiness: Readiness) {
    this.readiness = readiness;
  }

  @Serves(healthEndpoint)
  answer(): HealthAnswer {
    return healthAnswerSchema.parse({ status: 'ok' });
  }

  @Serves(readinessEndpoint)
  async ready(): Promise<HealthAnswer> {
    await this.readiness.ready();
    return healthAnswerSchema.parse({ status: 'ok' });
  }
}
