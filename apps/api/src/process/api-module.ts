// The API's endpoints, one controller per part; each task that adds an endpoint names its
// controller here.
import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.ts';

@Module({ controllers: [HealthController] })
export class ApiModule {}
