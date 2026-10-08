// The API's endpoints, one controller per part; each task that adds an endpoint names its
// controller here.
import { Module } from '@nestjs/common';

import { AssignmentsController } from '../dispatch/assignments.controller.ts';
import { PhonesController } from '../dispatch/phones.controller.ts';
import { PeopleController } from '../people/people.controller.ts';
import { ReviewMarksController } from '../review/review-marks.controller.ts';
import { ContractorSetupController } from '../setup/contractor-setup.controller.ts';
import { FormSetupController } from '../setup/form-setup.controller.ts';
import { ListSetupController } from '../setup/list-setup.controller.ts';
import { PricingSetupController } from '../setup/pricing-setup.controller.ts';
import { ProjectSetupController } from '../setup/project-setup.controller.ts';
import { SetupStandingController } from '../setup/setup-standing.controller.ts';
import { SiteSetupController } from '../setup/site-setup.controller.ts';
import { PasswordResetsController } from '../sign-in/password-resets.controller.ts';
import { SessionsController } from '../sign-in/sessions.controller.ts';
import { TwoStepController } from '../sign-in/two-step.controller.ts';
import { HealthController } from './health.controller.ts';

@Module({
  controllers: [
    HealthController,
    PasswordResetsController,
    SessionsController,
    TwoStepController,
    PeopleController,
    ProjectSetupController,
    ContractorSetupController,
    ListSetupController,
    FormSetupController,
    PricingSetupController,
    SiteSetupController,
    SetupStandingController,
    PhonesController,
    AssignmentsController,
    ReviewMarksController,
  ],
})
export class ApiModule {}
