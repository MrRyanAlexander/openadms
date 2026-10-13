// The API as a process (ARCHITECTURE §3, §6; BACKLOG 2.1.2, 2.1.3; ADR-380…385, 387…392): NestJS
// on the Fastify adapter, with the structured log, the server's own request ids, the one error
// filter, the boundary every request passes, the headers every answer carries and the API's
// database. It speaks plain HTTP to the proxy beside it and publishes no port: HTTPS is the
// proxy's (Caddy locally), the only way in.
import 'reflect-metadata';

import {
  filePartMediaType,
  sendPhotoFilePartEndpoint,
  setupChoicesMonitorsAtMost,
} from '@open-adms/contracts';
import type { Database, ViewerDatabase } from '@open-adms/db';
import {
  MasterPasscodeRules,
  MasterPasscodeTries,
  PasswordRules,
  PasscodeSessionRules,
  PhoneProofRules,
  RateLimits,
  SignInTries,
  TwoStepRules,
  type Policy,
} from '@open-adms/domain';
import {
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
  type Type,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { apiCertifications } from '../certification/certifications.controller.ts';
import { Certifications } from '../certification/certifications.ts';
import { apiAssignments } from '../dispatch/assignments.controller.ts';
import { Assignments } from '../dispatch/assignments.ts';
import { MasterPasscode } from '../dispatch/master-passcode.ts';
import { apiMasterPasscode, apiPhones } from '../dispatch/phones.controller.ts';
import { Phones } from '../dispatch/phones.ts';
import { MediaStore, type Media } from '../media/media-store.ts';
import { apiPhotoFiles, PhotoFiles } from '../media/photo-files.ts';
import { apiPhotographFiles, PhotographFiles } from '../media/photograph-files.ts';
import { Receiving } from '../media/receiving.ts';
import { NumberAllocator } from '../numbering/number-allocator.ts';
import { apiPeople } from '../people/people.controller.ts';
import { People } from '../people/people.ts';
import { apiAddressLookups } from '../phone/address-lookups.controller.ts';
import { AddressLookups } from '../phone/address-lookups.ts';
import { AddressServer, type Addresses } from '../phone/address-server.ts';
import { DeviceKeys } from '../phone/device-keys.ts';
import { apiEnrolment } from '../phone/enrolment.controller.ts';
import { Enrolment } from '../phone/enrolment.ts';
import { MasterPasscodeCheck } from '../phone/master-passcode-check.ts';
import { OfflineChecks } from '../phone/offline-checks.ts';
import { PhoneAssignments } from '../phone/phone-assignments.ts';
import { apiPhoneLists } from '../phone/phone-lists.controller.ts';
import { PhoneLists } from '../phone/phone-lists.ts';
import { apiPhoneLoginList } from '../phone/phone-login-list.controller.ts';
import { PhoneLoginList } from '../phone/phone-login-list.ts';
import { apiPasscodeSessions } from '../phone/passcode-sessions.controller.ts';
import { PasscodeSessions } from '../phone/passcode-sessions.ts';
import { apiPasscodeUses } from '../phone/passcode-uses.controller.ts';
import { PasscodeUses } from '../phone/passcode-uses.ts';
import { apiSetupChoices } from '../phone/setup-choices.controller.ts';
import { SetupChoices } from '../phone/setup-choices.ts';
import { apiPhoneMonitors } from '../phone/phone-monitors.controller.ts';
import { PhoneMonitors } from '../phone/phone-monitors.ts';
import { PhoneChallenges } from '../phone/phone-challenges.ts';
import { apiPhoneProofs } from '../phone/phone-proofs.controller.ts';
import { PhoneProofs } from '../phone/phone-proofs.ts';
import { apiPhoneSignIns } from '../phone/phone-sign-ins.controller.ts';
import { PhoneSignIns } from '../phone/phone-sign-ins.ts';
import { PhoneTokens } from '../phone/phone-tokens.ts';
import { apiUnplannedAssignments } from '../phone/unplanned-assignments.controller.ts';
import { UnplannedAssignments } from '../phone/unplanned-assignments.ts';
import { Acceptances } from '../review/acceptances.ts';
import { BackOfficeRecords } from '../review/back-office-records.ts';
import { apiCorrections } from '../review/corrections.controller.ts';
import { Corrections } from '../review/corrections.ts';
import { InvoiceLocks } from '../review/invoice-locks.ts';
import { QcMarks } from '../review/qc-marks.ts';
import { QuarantineReview } from '../review/quarantine-review.ts';
import {
  apiAcceptances,
  apiInvoiceLocks,
  apiQcMarks,
  apiVoids,
} from '../review/review-marks.controller.ts';
import { apiBackOfficeRecords, apiQuarantineReview } from '../review/review-records.controller.ts';
import { Voids } from '../review/voids.ts';
import { apiContractorSetup } from '../setup/contractor-setup.controller.ts';
import { ContractorSetup } from '../setup/contractor-setup.ts';
import { apiFormSetup } from '../setup/form-setup.controller.ts';
import { FormSetup } from '../setup/form-setup.ts';
import { apiListSetup } from '../setup/list-setup.controller.ts';
import { ListSetup } from '../setup/list-setup.ts';
import { PayItemSetup } from '../setup/pay-item-setup.ts';
import { apiPayItemSetup, apiRuleSetup } from '../setup/pricing-setup.controller.ts';
import { apiProjectSetup } from '../setup/project-setup.controller.ts';
import { ProjectSetup } from '../setup/project-setup.ts';
import { RuleSetup } from '../setup/rule-setup.ts';
import type { Clock } from '../setup/setup-service.ts';
import { apiSetupStanding } from '../setup/setup-standing.controller.ts';
import { SetupStanding } from '../setup/setup-standing.ts';
import { apiSiteSetup } from '../setup/site-setup.controller.ts';
import { SiteSetup } from '../setup/site-setup.ts';
import { Admission } from '../sign-in/admission.ts';
import { shippedBreachedPasswords } from '../sign-in/breached-list.ts';
import { mailFor, type Mail } from '../sign-in/mail.ts';
import { OneTimeCodes } from '../sign-in/one-time-codes.ts';
import { PasswordHasher } from '../sign-in/password-hasher.ts';
import { apiPasswords } from '../sign-in/password-resets.controller.ts';
import { Passwords } from '../sign-in/passwords.ts';
import { ResetCodes } from '../sign-in/reset-codes.ts';
import { SessionTokens } from '../sign-in/session-tokens.ts';
import { apiSessions, apiSessionTokens } from '../sign-in/sessions.controller.ts';
import { Sessions } from '../sign-in/sessions.ts';
import { TwoStepSecrets } from '../sign-in/two-step-secrets.ts';
import { apiTwoStep } from '../sign-in/two-step.controller.ts';
import { TwoStep, TwoStepCheck } from '../sign-in/two-step.ts';
import { WrongTries } from '../sign-in/wrong-tries.ts';
import { Intake } from '../sync/intake.ts';
import { apiSync } from '../sync/sync.controller.ts';
import { Sync } from '../sync/sync.ts';
import { apiViewerReads } from '../viewer/viewer-reads.controller.ts';
import { ViewerReads } from '../viewer/viewer-reads.ts';
import { answersWith } from './answer-headers.ts';
import {
  apiDatabase,
  apiMedia,
  apiViewerDatabase,
  openApiDatabase,
  openApiViewerDatabase,
} from './api-database.ts';
import { Boundary, requestNow } from './boundary.ts';
import { ErrorFilter } from './error-filter.ts';
import { apiLimits, Limits } from './limits.ts';
import { logged, ProcessLog } from './logs.ts';
import type { Settings } from './settings.ts';

export type ProcessSettings = Pick<
  Settings,
  | 'host'
  | 'port'
  | 'databaseUrl'
  | 'readOnlyDatabaseUrl'
  | 'corsOrigins'
  | 'trustedProxies'
  | 'tokenSigningSecret'
  | 'smtpUrl'
  | 'smtpAddress'
  | 'mailFrom'
  | 'addressesUrl'
  | 'mapCaFile'
  | 'mapServersAt'
  | 'media'
>;

// The installation's policy, whole: the process reads its own values (the body limit, the pool,
// sign-in's and the rate limits'), and each service behind an endpoint reads its own.
export type ProcessPolicy = Policy;

// What a test puts in place of the process's own: where the log goes instead of standard output,
// the database (a test's own piece of work, undone afterwards), the read-only login's database
// for a viewer's reads, the mail, the time, who a phone's address lookup asks and where files
// are kept.
export interface ProcessParts {
  readonly stream?: { write(line: string): void };
  readonly database?: Database;
  readonly viewerDatabase?: ViewerDatabase;
  readonly mail?: Mail;
  readonly clock?: Clock;
  readonly addresses?: Addresses;
  readonly media?: Media;
}

export interface Route {
  readonly method: string;
  readonly path: string;
}

// The given endpoints with what every one of them may be handed: the API's database and the
// read-only login's, each opened once and closed when the process stops, and the services that
// stand on them.
@Module({})
class ProcessModule implements OnApplicationShutdown {
  private readonly database: Database;
  private readonly viewerDatabase: ViewerDatabase;
  private readonly media: Media;

  constructor(
    @Inject(apiDatabase) database: Database,
    @Inject(apiViewerDatabase) viewerDatabase: ViewerDatabase,
    @Inject(apiMedia) media: Media,
  ) {
    this.database = database;
    this.viewerDatabase = viewerDatabase;
    this.media = media;
  }

  // `handed`: each thing a controller may name to be handed, by the symbol it names it with.
  static around(module: Type<unknown>, handed: ReadonlyMap<symbol, unknown>): DynamicModule {
    return {
      module: ProcessModule,
      global: true,
      imports: [module],
      providers: [...handed].map(([provide, useValue]) => ({ provide, useValue })),
      exports: [...handed.keys()],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.database.$disconnect();
    await this.viewerDatabase.$disconnect();
    // The object store's connections, where the process opened them.
    if (this.media instanceof MediaStore) this.media.close();
  }
}

export class ApiProcess {
  readonly app: NestFastifyApplication;
  // Every route the process serves, as it was mapped (a test holds them to the contracts' list).
  readonly routes: readonly Route[];
  private readonly settings: ProcessSettings;

  private constructor(app: NestFastifyApplication, routes: Route[], settings: ProcessSettings) {
    this.app = app;
    this.routes = routes;
    this.settings = settings;
  }

  static async create(
    module: Type<unknown>,
    settings: ProcessSettings,
    policy: ProcessPolicy,
    more: ProcessParts = {},
  ): Promise<ApiProcess> {
    const adapter = new FastifyAdapter({
      ...logged,
      logger: { ...logged.logger, ...(more.stream === undefined ? {} : { stream: more.stream }) },
      // A body that says it is larger, or turns out to be, is refused before it is read whole.
      bodyLimit: policy.requestBodyLimitBytes,
      // Whose word is taken for the address a request came from: a listed proxy's, nobody
      // else's. With none listed it is the address that connected (ADR-416).
      trustProxy: settings.trustedProxies.length > 0 ? [...settings.trustedProxies] : false,
    });
    const server = adapter.getInstance();
    const routes: Route[] = [];
    server.addHook('onRoute', (route) => {
      for (const method of [route.method].flat()) routes.push({ method, path: route.url });
      // The media endpoint takes a part of a file, up to the policy's size (ADR-482); every
      // other route keeps the body limit above.
      if (
        route.url === sendPhotoFilePartEndpoint.path &&
        [route.method].flat().includes(sendPhotoFilePartEndpoint.method)
      ) {
        route.bodyLimit = policy.mediaPartBytesAtMost;
      }
    });
    // A part of a file is read as bytes, never parsed (AC-10-47): what it is the media endpoint
    // asks of its first bytes. Sent to any other route, it is no body that route takes.
    server.addContentTypeParser(
      filePartMediaType,
      { parseAs: 'buffer' },
      (_request, body, done) => {
        done(null, body);
      },
    );
    const database = more.database ?? openApiDatabase(settings, policy.databasePoolConnections);
    // A read-only viewer's reads go by the read-only login, its viewer stated (ADR-434).
    const viewerDatabase =
      more.viewerDatabase ?? openApiViewerDatabase(settings, policy.databasePoolConnections);
    const clock = more.clock ?? { now: () => new Date() };
    const limits = new Limits(new RateLimits(policy), clock);
    answersWith(server, settings.corsOrigins, (request) => limits.arrived(request.ip));
    const mail = more.mail ?? mailFor(settings);
    // The object store the API keeps files in (task 2.6.4, part 1), under the API's own identity.
    const media =
      more.media ??
      new MediaStore({ ...settings.media, timeoutMs: policy.mediaStoreAnswerSeconds * 1000 });
    // Our own address server, asked for a phone's address lookup and by nothing else here
    // (task 2.5.3, part 5): no phone and no browser reaches it.
    const addresses =
      more.addresses ??
      new AddressServer({
        url: settings.addressesUrl,
        caFile: settings.mapCaFile,
        timeoutMs: policy.addressLookupAnswerSeconds * 1000,
        at: settings.mapServersAt,
      });
    const hasher = new PasswordHasher(settings.tokenSigningSecret);
    const tokens = new SessionTokens(settings.tokenSigningSecret, policy.accessTokenMinutes);
    const tries = new WrongTries(database, {
      rules: new SignInTries(policy),
      clock,
      mail,
      requestNow,
    });
    const check = new TwoStepCheck(
      new TwoStepRules(policy),
      new OneTimeCodes(),
      new TwoStepSecrets(settings.tokenSigningSecret),
    );
    const sessions = new Sessions(database, {
      tokens,
      hasher,
      tries,
      twoStep: check,
      clock,
      policy,
      requestNow,
    });
    const twoStep = new TwoStep(database, { check, clock, mail, sessions, requestNow });
    const breached = shippedBreachedPasswords();
    // What a phone's login-list entry for a monitor is made from (task 2.5.3, part 4).
    const offline = new OfflineChecks(settings.tokenSigningSecret);
    const passwords = new Passwords(database, {
      rules: new PasswordRules(policy, breached),
      hasher,
      resetCodes: new ResetCodes(settings.tokenSigningSecret, policy.passwordResetMinutes),
      mail,
      clock,
      resetMinutes: policy.passwordResetMinutes,
      sessions,
      tries,
      limits,
      offline,
    });
    const people = new People(database, { clock, sessions, mail });
    // A phone's proof of itself (task 2.5.1): nobody is signed in.
    const proofRules = new PhoneProofRules(policy);
    const phoneProofs = new PhoneProofs(database, {
      rules: proofRules,
      challenges: new PhoneChallenges(settings.tokenSigningSecret, proofRules),
      keys: new DeviceKeys(),
      tokens: new PhoneTokens(settings.tokenSigningSecret, policy.phoneTokenMinutes),
      clock,
      challengeSeconds: policy.phoneChallengeSeconds,
    });
    // A monitor's sign-in on a proven phone (task 2.5.2, part 2).
    const phoneSignIns = new PhoneSignIns(database, {
      tokens,
      hasher,
      offline,
      tries,
      assignments: new PhoneAssignments(database),
      clock,
      hours: policy.monitorSessionHours,
      requestNow,
    });
    // The master passcode's one check, for every act under it (tasks 2.5.1, 2.5.2).
    const passcodeCheck = new MasterPasscodeCheck(database, {
      rules: new MasterPasscodeTries(policy),
      hasher,
      mail,
      clock,
      requestNow,
    });
    // What a phone reports besides its records (task 2.5.4), by its own endpoints and in a sync.
    const unplanned = new UnplannedAssignments(database, { clock, requestNow });
    const passcodeUses = new PasscodeUses(database, { clock, requestNow });
    const certifications = new Certifications(database, clock, policy);
    // The login list's service also makes the passcode's check a sync brings (ADR-473).
    const loginList = new PhoneLoginList(database, {
      assignments: new PhoneAssignments(database),
      offline,
      clock,
      entriesPerCall: policy.loginListEntriesPerCall,
    });
    const app = await NestFactory.create<NestFastifyApplication>(
      ProcessModule.around(
        module,
        new Map<symbol, unknown>([
          [apiDatabase, database],
          [apiViewerDatabase, viewerDatabase],
          [apiMedia, media],
          [apiViewerReads, new ViewerReads(viewerDatabase)],
          [apiPasswords, passwords],
          [apiSessions, sessions],
          [apiSessionTokens, tokens],
          [apiTwoStep, twoStep],
          [apiPeople, people],
          [apiLimits, limits],
          // Setup's services (task 2.4.2): each change is written as the signed-in person.
          [apiProjectSetup, new ProjectSetup(database, clock, policy)],
          [apiContractorSetup, new ContractorSetup(database, clock, policy)],
          [apiListSetup, new ListSetup(database, clock)],
          [apiFormSetup, new FormSetup(database, clock)],
          [apiPayItemSetup, new PayItemSetup(database, clock, policy)],
          [apiRuleSetup, new RuleSetup(database, clock, policy)],
          [apiSiteSetup, new SiteSetup(database, clock, policy)],
          [apiSetupStanding, new SetupStanding(database)],
          // Dispatch and phones (task 2.4.3).
          [apiPhones, new Phones(database, clock)],
          [apiAssignments, new Assignments(database, clock)],
          // Review's marks (task 2.4.4): each queues the run its action needs.
          [apiVoids, new Voids(database, clock, policy)],
          [apiAcceptances, new Acceptances(database, clock, policy)],
          [apiQcMarks, new QcMarks(database, clock, policy)],
          [apiInvoiceLocks, new InvoiceLocks(database, clock, policy)],
          [apiCorrections, new Corrections(database, clock, policy)],
          [apiQuarantineReview, new QuarantineReview(database, clock, policy)],
          [apiBackOfficeRecords, new BackOfficeRecords(database, clock, policy)],
          // A certification's changes (task 2.4.4, part 4): only an admin revokes.
          [apiCertifications, certifications],
          // A phone enrolled under the master passcode (task 2.5.1): nobody is signed in.
          [
            apiEnrolment,
            new Enrolment(database, { passcode: passcodeCheck, keys: new DeviceKeys(), clock }),
          ],
          // A monitor created on a proven phone under the master passcode (task 2.5.2).
          [
            apiPhoneMonitors,
            new PhoneMonitors(database, {
              passcode: passcodeCheck,
              rules: new PasswordRules(policy, breached),
              hasher,
              offline,
              clock,
            }),
          ],
          [apiPhoneProofs, phoneProofs],
          [apiPhoneSignIns, phoneSignIns],
          // A session opened on a proven phone under the master passcode (task 2.5.4, part 3).
          [
            apiPasscodeSessions,
            new PasscodeSessions(database, {
              passcode: passcodeCheck,
              tokens,
              rules: new PasscodeSessionRules(policy.monitorSessionHours),
              assignments: new PhoneAssignments(database),
              clock,
            }),
          ],
          // What a phone being set up under the master passcode picks from (task 2.5.4, part 4).
          [
            apiSetupChoices,
            new SetupChoices(database, {
              passcode: passcodeCheck,
              clock,
              monitorsAtMost: setupChoicesMonitorsAtMost,
            }),
          ],
          // The lists a phone takes for its monitor's assignment (task 2.5.3).
          [
            apiPhoneLists,
            new PhoneLists(database, { assignments: new PhoneAssignments(database), clock }),
          ],
          // The login list and the master passcode's check a phone takes (task 2.5.3, part 4).
          [apiPhoneLoginList, loginList],
          // An address looked up for a phone's GPS (task 2.5.3, part 5).
          [apiAddressLookups, new AddressLookups(addresses)],
          // What a phone reports besides field events (task 2.5.4): an unplanned assignment.
          [apiUnplannedAssignments, unplanned],
          // And every other use of the master passcode it logged with no connection (part 5).
          [apiPasscodeUses, passcodeUses],
          // A phone's sync, whole (task 2.6.2): its reports, its records, its numbers.
          [
            apiSync,
            new Sync(database, {
              intake: new Intake(database, clock, policy),
              certifications,
              unplanned,
              uses: passcodeUses,
              numbers: new NumberAllocator(database, clock, policy),
              loginList,
              clock,
            }),
          ],
          // A photograph's files, sent by the phone that took it (task 2.6.4, part 3).
          [
            apiPhotoFiles,
            new PhotoFiles(database, {
              media,
              receiving: new Receiving(policy.mediaReceivingBytesAtMost),
              limits,
              clock,
              fileBytesAtMost: policy.mediaFileBytesAtMost,
            }),
          ],
          // A photograph's file, read by the back office (task 2.6.4, part 4).
          [
            apiPhotographFiles,
            new PhotographFiles(database, { media, fileBytesAtMost: policy.mediaFileBytesAtMost }),
          ],
          [
            apiMasterPasscode,
            new MasterPasscode(database, {
              rules: new MasterPasscodeRules(breached),
              hasher,
              tries,
              mail,
              clock,
            }),
          ],
        ]),
      ),
      adapter,
      { logger: new ProcessLog(server.log) },
    );
    app.useGlobalFilters(new ErrorFilter());
    app.useGlobalInterceptors(
      new Boundary(new Admission(sessions, tokens, limits, phoneProofs, phoneSignIns)),
    );
    app.enableShutdownHooks();
    return new ApiProcess(app, routes, settings);
  }

  async listen(): Promise<void> {
    await this.app.listen(this.settings.port, this.settings.host);
  }

  async close(): Promise<void> {
    await this.app.close();
  }
}
