// The health answer (AC-10-01; acceptance file 10, point 17; ADR-385): that the process answers,
// to anybody who asks, and nothing else.
import { healthAnswerSchema, type HealthAnswer } from '@open-adms/contracts';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  answer(): HealthAnswer {
    return healthAnswerSchema.parse({ status: 'ok' });
  }
}
