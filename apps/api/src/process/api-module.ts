// The API's endpoints, one controller per part; each task that adds an endpoint names its
// controller here.
import { Module } from '@nestjs/common';

import { PasswordResetsController } from '../sign-in/password-resets.controller.ts';
import { HealthController } from './health.controller.ts';

@Module({ controllers: [HealthController, PasswordResetsController] })
export class ApiModule {}
