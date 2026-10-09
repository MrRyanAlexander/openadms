// The health answer (AC-10-01; acceptance file 10, point 17; ADR-385): that the process answers,
// to anybody who asks, and nothing else.
import { healthAnswerSchema, healthEndpoint, type HealthAnswer } from '@open-adms/contracts';
import { Controller } from '@nestjs/common';

import { Serves } from './serves.ts';

@Controller()
export class HealthController {
  @Serves(healthEndpoint)
  answer(): HealthAnswer {
    return healthAnswerSchema.parse({ status: 'ok' });
  }
}
