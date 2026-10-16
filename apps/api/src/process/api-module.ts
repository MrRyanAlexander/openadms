// The API's endpoints, one controller per part; each task that adds an endpoint names its
// controller here.
import { Module } from '@nestjs/common';

import { CertificationsController } from '../certification/certifications.controller.ts';
import { AssignmentsController } from '../dispatch/assignments.controller.ts';
import { PhonesController } from '../dispatch/phones.controller.ts';
import { PeopleController } from '../people/people.controller.ts';
import { EnrolmentController } from '../phone/enrolment.controller.ts';
import { OfflineSignInsController } from '../phone/offline-sign-ins.controller.ts';
import { PasscodeSessionsController } from '../phone/passcode-sessions.controller.ts';
import { PasscodeUsesController } from '../phone/passcode-uses.controller.ts';
import { SetupChoicesController } from '../phone/setup-choices.controller.ts';
import { PhoneMonitorsController } from '../phone/phone-monitors.controller.ts';
import { PhoneProofsController } from '../phone/phone-proofs.controller.ts';
import { PhoneListsController } from '../phone/phone-lists.controller.ts';
import { PhoneLoginListController } from '../phone/phone-login-list.controller.ts';
import { UnplannedAssignmentsController } from '../phone/unplanned-assignments.controller.ts';
import { AddressLookupsController } from '../phone/address-lookups.controller.ts';
import { PhoneSignInsController } from '../phone/phone-sign-ins.controller.ts';
import { CorrectionsController } from '../review/corrections.controller.ts';
import { ReviewMarksController } from '../review/review-marks.controller.ts';
import { ReviewRecordsController } from '../review/review-records.controller.ts';
import { ReviewReadsController } from '../review/review-reads.controller.ts';
import { HeldController } from '../review/held.controller.ts';
import { ContractorSetupController } from '../setup/contractor-setup.controller.ts';
import { FormSetupController } from '../setup/form-setup.controller.ts';
import { ListSetupController } from '../setup/list-setup.controller.ts';
import { PricingSetupController } from '../setup/pricing-setup.controller.ts';
import { ProjectSetupController } from '../setup/project-setup.controller.ts';
import { SetupStandingController } from '../setup/setup-standing.controller.ts';
import { SetupReadsController } from '../setup/setup-reads.controller.ts';
import { FirmSettingsController } from '../firm/firm-settings.controller.ts';
import { MapFilesController } from '../setup/map-files.controller.ts';
import { SiteSetupController } from '../setup/site-setup.controller.ts';
import { PasswordResetsController } from '../sign-in/password-resets.controller.ts';
import { SessionsController } from '../sign-in/sessions.controller.ts';
import { TwoStepController } from '../sign-in/two-step.controller.ts';
import { PhotoFilesController } from '../media/photo-files.controller.ts';
import { PhotographFilesController } from '../media/photograph-files.controller.ts';
import { BackOfficePhotographsController } from '../media/back-office-photographs.controller.ts';
import { SyncController } from '../sync/sync.controller.ts';
import { TurnInsController } from '../phone/turn-ins.controller.ts';
import { ViewerReadsController } from '../viewer/viewer-reads.controller.ts';
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
    SetupReadsController,
    SiteSetupController,
    MapFilesController,
    SetupStandingController,
    FirmSettingsController,
    PhonesController,
    EnrolmentController,
    PhoneProofsController,
    PhoneMonitorsController,
    PhoneSignInsController,
    PasscodeSessionsController,
    OfflineSignInsController,
    PasscodeUsesController,
    PhoneListsController,
    PhoneLoginListController,
    AddressLookupsController,
    SetupChoicesController,
    UnplannedAssignmentsController,
    SyncController,
    TurnInsController,
    PhotoFilesController,
    PhotographFilesController,
    BackOfficePhotographsController,
    AssignmentsController,
    ReviewMarksController,
    CorrectionsController,
    ReviewRecordsController,
    ReviewReadsController,
    HeldController,
    CertificationsController,
    ViewerReadsController,
  ],
})
export class ApiModule {}
