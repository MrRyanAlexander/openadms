// The policy values (invariant 16; ADR-142, 164, 203, 303): the numbers a new project's settings
// start from, and the server's own limits (ADR-389). A threshold is policy, never a literal: none is written in this package. Each comes
// from the environment the caller hands over, under the name below. The release's own
// values, the built-in defaults, are the env file beside this package (policy.env); the firm then
// changes a project's own settings, audited.
//
// This package reads no file and no environment itself (it depends on nothing, and runs on the
// phone too): a server app reads the values and hands them to Policy.from.

// A setting's name in the environment.
export const policyNames = {
  // A load call at or under it is flagged (ADR-164).
  loadCallLowLimit: 'LOAD_CALL_LOW_LIMIT',
  // A load call at or over it is flagged (ADR-164).
  loadCallHighLimit: 'LOAD_CALL_HIGH_LIMIT',
  // The circle round a disposal site's GPS, in metres (ADR-142).
  siteCircleMeters: 'DISPOSAL_SITE_PROXIMITY_M',
  // The root-ball height the stump fill is worked out with, in inches (ADR-203).
  stumpFillDepthInches: 'STUMP_FILL_DEPTH_INCHES',
  // A crew day's length, in hours, on a pay item paid by the crew day by exact division (ADR-087,
  // 309).
  crewDayHours: 'CREW_DAY_HOURS',
  // How many unused ticket numbers a numbering phone holds after a top-up (ADR-065).
  ticketNumberBlockSize: 'TICKET_NUMBER_BLOCK_SIZE',
  // The same for a certifying phone's cert numbers (ADR-181), and for ROE numbers (ADR-323).
  certNumberBlockSize: 'CERT_NUMBER_BLOCK_SIZE',
  roeNumberBlockSize: 'ROE_NUMBER_BLOCK_SIZE',
  // The largest body the API reads from one request, in bytes (ARCHITECTURE §6, Input; ADR-389).
  requestBodyLimitBytes: 'REQUEST_BODY_LIMIT_BYTES',
  // How long one statement of a service's database login may run, in milliseconds, before the
  // database stops it (ARCHITECTURE §5.7; ADR-394). The installer sets it on each login.
  statementTimeoutMs: 'STATEMENT_TIMEOUT_MS',
  // The most connections a service's pool opens to the database (ARCHITECTURE §5.7; ADR-419).
  // Never under two: a run holds its project's lock on one and writes on another.
  databasePoolConnections: 'DATABASE_POOL_CONNECTIONS',
  // How long one piece of work waits for a connection from its service's pool, and how long it
  // may run in all, in milliseconds; and how many seconds a caller told the database is busy is
  // told to wait (ARCHITECTURE §5.7, §6, Abuse; ADR-524).
  databaseConnectionWaitMs: 'DATABASE_CONNECTION_WAIT_MS',
  databaseWorkLongestMs: 'DATABASE_WORK_LONGEST_MS',
  databaseBusyRetrySeconds: 'DATABASE_BUSY_RETRY_SECONDS',
  // The shortest and the longest password a back-office or outside user may set, in characters
  // (ARCHITECTURE §6, Passwords; NIST SP 800-63B-4 §3.1.1.2; ADR-402).
  passwordMinimumLength: 'PASSWORD_MINIMUM_LENGTH',
  passwordMaximumLength: 'PASSWORD_MAXIMUM_LENGTH',
  // How long a password reset sent by email stays good, in minutes (ADR-404).
  passwordResetMinutes: 'PASSWORD_RESET_MINUTES',
  // How long a back-office access token is good for, in minutes; how long a session lasts with
  // nothing asked of it, in minutes; and how long it lasts at the very most, in hours
  // (ARCHITECTURE §6, Back-office sessions; NIST SP 800-63B-4 §2.2.3; ADR-408).
  accessTokenMinutes: 'ACCESS_TOKEN_MINUTES',
  sessionInactivityMinutes: 'SESSION_INACTIVITY_MINUTES',
  sessionOverallHours: 'SESSION_OVERALL_HOURS',
  // Wrong tries in a row at one login before a wait is put on it, and before it is locked; the
  // first wait, in seconds, and the longest, in minutes (ARCHITECTURE §6, Abuse; NIST SP
  // 800-63B-4 §3.2.2; ADR-409).
  signInTriesBeforeWait: 'SIGN_IN_TRIES_BEFORE_WAIT',
  signInTriesBeforeLock: 'SIGN_IN_TRIES_BEFORE_LOCK',
  signInFirstWaitSeconds: 'SIGN_IN_FIRST_WAIT_SECONDS',
  signInLongestWaitMinutes: 'SIGN_IN_LONGEST_WAIT_MINUTES',
  // Two-step sign-in (ARCHITECTURE §6; NIST SP 800-63B-4 §3.1.4.2; ASVS 6.5.5; ADR-412): how many
  // thirty-second steps before and after the server's own an authenticator's code is still taken
  // in, for a phone's clock that runs a little off and the time it takes to type; and how long a
  // person has to finish setting an authenticator up, in minutes.
  twoStepCodeStepsEitherSide: 'TWO_STEP_CODE_STEPS_EITHER_SIDE',
  twoStepSetupMinutes: 'TWO_STEP_SETUP_MINUTES',
  // A phone's proof of itself (ARCHITECTURE §7.4; ADR-437): how long the challenge the server
  // makes for a phone may still be signed and sent back, in seconds.
  phoneChallengeSeconds: 'PHONE_CHALLENGE_SECONDS',
  // And how long the token a proof gives the phone is good for, in minutes (NIST SP 800-63B-4
  // §5.1; ADR-440): the calls of one sync carry it, and a phone proves itself again for another.
  phoneTokenMinutes: 'PHONE_TOKEN_MINUTES',
  // How long a monitor's sign-in on a phone lasts, in hours, whatever is asked of it; quiet
  // doesn't end it (ARCHITECTURE §6, Device sessions; NIST SP 800-63B-4 §2.2.3; ADR-443).
  monitorSessionHours: 'MONITOR_SESSION_HOURS',
  // The most login-list entries the server makes for a phone in one call (ARCHITECTURE §7.2;
  // ADR-454): each is a slow hash, so one call's work is bounded and the phone asks again.
  loginListEntriesPerCall: 'LOGIN_LIST_ENTRIES_PER_CALL',
  // The phone's own sign-in screen (ARCHITECTURE §7.2 (3); NIST SP 800-63B-4 §3.2.10; ADR-139,
  // 575): wrong tries in a row checked against its login list before a wait is put on the screen,
  // and before it locks until the master passcode; the first wait, in seconds, and the longest,
  // in minutes. Read by the field app, which the build hands them to.
  phoneSignInTriesBeforeWait: 'PHONE_SIGN_IN_TRIES_BEFORE_WAIT',
  phoneSignInTriesBeforeLock: 'PHONE_SIGN_IN_TRIES_BEFORE_LOCK',
  phoneSignInFirstWaitSeconds: 'PHONE_SIGN_IN_FIRST_WAIT_SECONDS',
  phoneSignInLongestWaitMinutes: 'PHONE_SIGN_IN_LONGEST_WAIT_MINUTES',
  // The phone's lock after inactivity (ARCHITECTURE §7.2; NIST SP 800-63B-4 §2.2.3; WCAG 2.2.1;
  // ADR-139, 575): how long a monitor's sign-in lasts with nothing touched, in minutes, and how
  // long before it closes the phone warns, in seconds.
  phoneInactivityLockMinutes: 'PHONE_INACTIVITY_LOCK_MINUTES',
  phoneInactivityWarningSeconds: 'PHONE_INACTIVITY_WARNING_SECONDS',
  // How long our address server has to answer a phone's address lookup, in seconds (ARCHITECTURE
  // §3; ADR-455): a monitor waits on it, so it is far shorter than the worker's own.
  addressLookupAnswerSeconds: 'ADDRESS_LOOKUP_ANSWER_SECONDS',
  // How long the object store has to answer one question of the API's, a file put or read
  // whole, in seconds (ARCHITECTURE §11; ADR-480).
  mediaStoreAnswerSeconds: 'MEDIA_STORE_ANSWER_SECONDS',
  // A photograph's file as the media endpoint takes it (ARCHITECTURE §6 "Uploads", §9 (5), §11;
  // ADR-482): the largest file, in bytes; the largest part of one sent in a request; how many
  // bytes of files not yet whole the API holds at once, across every phone; and how many parts
  // one phone may send in the rate limits' stretch.
  mediaFileBytesAtMost: 'MEDIA_FILE_BYTES_AT_MOST',
  mediaPartBytesAtMost: 'MEDIA_PART_BYTES_AT_MOST',
  mediaReceivingBytesAtMost: 'MEDIA_RECEIVING_BYTES_AT_MOST',
  rateLimitFilePartsPerPhone: 'RATE_LIMIT_FILE_PARTS_PER_PHONE',
  // A map's file as the back office sends it (ARCHITECTURE §3 "Project boundary and zones";
  // ADR-485): the largest file, in bytes, sent whole in one request; the most its zipped parts
  // may come to, unzipped; and how many files a zip may hold, counted before any is unzipped.
  mapFileBytesAtMost: 'MAP_FILE_BYTES_AT_MOST',
  mapFileUnzippedBytesAtMost: 'MAP_FILE_UNZIPPED_BYTES_AT_MOST',
  mapFileEntriesAtMost: 'MAP_FILE_ENTRIES_AT_MOST',
  // The most outer rings times holes one shape of a shapefile may have to be read: setting each
  // hole in its outer ring tries every pair, all at once, and nothing stops it part way (ADR-524).
  mapFileRingPairsAtMost: 'MAP_FILE_RING_PAIRS_AT_MOST',
  // How long an Esri feature layer has to give the API every page of its features, in seconds,
  // the whole exchange (ARCHITECTURE §3 "Project boundary and zones"; ADR-527 (15)).
  esriLayerAnswerSeconds: 'ESRI_LAYER_ANSWER_SECONDS',
  // Rate limits (ARCHITECTURE §6, Abuse; ASVS 2.4.1; ADR-416): how long the stretch is that
  // requests are counted over, in seconds; how many one address and one signed-in person may send
  // in it; and how many callers' counts the server keeps at once.
  rateLimitWindowSeconds: 'RATE_LIMIT_WINDOW_SECONDS',
  rateLimitRequestsPerAddress: 'RATE_LIMIT_REQUESTS_PER_ADDRESS',
  rateLimitRequestsPerAccount: 'RATE_LIMIT_REQUESTS_PER_ACCOUNT',
  rateLimitRequestsPerPhone: 'RATE_LIMIT_REQUESTS_PER_PHONE',
  rateLimitCountsKept: 'RATE_LIMIT_COUNTS_KEPT',
  // Tries at sign-in from one address (ASVS 6.1.1, 6.3.1; ADR-416): how long the stretch is, in
  // minutes; how many refused tries one address may make in it, whoever's login it tries, and
  // how many at one login; how many resets by email one address may ask for, and how many may be
  // asked for one login.
  signInAddressWindowMinutes: 'SIGN_IN_ADDRESS_WINDOW_MINUTES',
  signInWrongTriesPerAddress: 'SIGN_IN_WRONG_TRIES_PER_ADDRESS',
  signInWrongTriesPerAddressAtLogin: 'SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN',
  passwordResetAsksPerAddress: 'PASSWORD_RESET_ASKS_PER_ADDRESS',
  passwordResetAsksPerLogin: 'PASSWORD_RESET_ASKS_PER_LOGIN',
  // The shortest and the longest master passcode, in characters (ARCHITECTURE §7.5; ADR-266,
  // 530): the installer asks the firm's first one to them, and the back office each change.
  masterPasscodeMinimumLength: 'MASTER_PASSCODE_MINIMUM_LENGTH',
  masterPasscodeMaximumLength: 'MASTER_PASSCODE_MAXIMUM_LENGTH',
  // How many hours a phone marked lost or retired keeps its key before the worker revokes it,
  // nought for off (ADR-520, 530): what a new installation's firm settings start as.
  phoneKeyRevokedAfterHours: 'PHONE_KEY_REVOKED_AFTER_HOURS',
  // The worker's own (ARCHITECTURE §13; ADR-418, 419), read by the worker's process alone: how
  // many runs may take a job up before it is set aside; the longest a run may hold its project's
  // lock, in minutes; how often the worker looks for waiting jobs, in seconds; and how long a map
  // server has to answer one question, in seconds.
  jobTriesBeforeSetAside: 'JOB_TRIES_BEFORE_SET_ASIDE',
  reconciliationRunLongestMinutes: 'RECONCILIATION_RUN_LONGEST_MINUTES',
  jobQueuePollSeconds: 'JOB_QUEUE_POLL_SECONDS',
  mapServerAnswerSeconds: 'MAP_SERVER_ANSWER_SECONDS',
  // A phone's clock further than this from the server's at a sync, in whole minutes, flags that
  // sync's field events (ADR-100, 473): the worker's.
  deviceClockOffLimitMinutes: 'DEVICE_CLOCK_OFF_LIMIT_MINUTES',
  // The most tickets one job names, and the most a run takes up at once (ADR-420), read by both
  // services: the API cuts a change that touches more into jobs of that size, and the worker
  // takes up waiting jobs, the oldest first, until their tickets come to it.
  jobTicketsAtMost: 'JOB_TICKETS_AT_MOST',
  // What one phone may make the server hold for a person in a day, in bytes and in records,
  // before the admins are told (ADR-546): its records are received all the same.
  phoneHeldBytesPerDay: 'PHONE_HELD_BYTES_PER_DAY',
  phoneHeldRecordsPerDay: 'PHONE_HELD_RECORDS_PER_DAY',
  // How long a map file may take to be read, in seconds, and how much memory its reading may
  // hold, in mebibytes, apart from the API's own work (ADR-548).
  mapFileReadSeconds: 'MAP_FILE_READ_SECONDS',
  mapFileReadMemoryMebibytes: 'MAP_FILE_READ_MEMORY_MEBIBYTES',
} as const;

export type PolicyName = (typeof policyNames)[keyof typeof policyNames];

// The least body any installation's API reads from a request: one mebibyte, the release's own
// value. A sync is never heavier (the contracts' `syncBytesAtMost`), so a phone's sync always fits
// whatever an installation states (ADR-504).
export const requestBodyBytesAtLeast = 1_048_576;

// What each value may be: a whole number in the range the database's own checks hold a project's
// setting to. A load call is 0 to 100; a size is at least one; a crew day is 1 to 24 hours; a block
// is at least one number. The body a request may carry is never under a mebibyte, so that no
// installation's limit refuses a sync a phone may send (ADR-504). A statement's time limit is at
// least one millisecond (nought would switch it off) and at most what Postgres takes. A piece of
// work waits a tenth of a second for a connection at the least and ten minutes at the most, runs
// a second at the least and at most what a statement may, and a caller told the database is busy
// waits a second at the least and an hour at the most (ADR-524). A password's
// shortest length is never under the eight characters the standard allows beside a second step,
// nor over the 64 it says must be permitted; its longest never under those 64. A reset by email
// is good for a day at most, the standard's limit. A session lasts a day at most and an hour at
// most with nothing asked of it (the standard's limits where a second step is required), and its
// access token never as long as that hour. A login is locked after a hundred wrong tries in a row
// at the very most, the standard's limit. An authenticator's code is taken one step either side
// of the server's own at the most (the standard has its clock value change at least every two
// minutes), and nought takes the server's own step alone. A rate limit counts over an hour at the
// most, a limit on tries over a day at the most, and each allows at least one; the server keeps
// at least a thousand callers' counts and at most ten million. A job names at least one ticket
// and at most a hundred thousand. A phone's clock may stand a minute off at the least before
// its sync is flagged, and a day at the most. A master passcode is held to a password's own
// bounds. A lost phone keeps its key a year at the most, and nought switches the backstop off.

const ranges: Record<PolicyName, { least: number; most: number }> = {
  [policyNames.loadCallLowLimit]: { least: 0, most: 100 },
  [policyNames.loadCallHighLimit]: { least: 0, most: 100 },
  [policyNames.siteCircleMeters]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.stumpFillDepthInches]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.crewDayHours]: { least: 1, most: 24 },
  [policyNames.ticketNumberBlockSize]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.certNumberBlockSize]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.roeNumberBlockSize]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.requestBodyLimitBytes]: {
    least: requestBodyBytesAtLeast,
    most: Number.MAX_SAFE_INTEGER,
  },
  [policyNames.statementTimeoutMs]: { least: 1, most: 2147483647 },
  [policyNames.databasePoolConnections]: { least: 2, most: 1000 },
  [policyNames.databaseConnectionWaitMs]: { least: 100, most: 600000 },
  [policyNames.databaseWorkLongestMs]: { least: 1000, most: 2147483647 },
  [policyNames.databaseBusyRetrySeconds]: { least: 1, most: 3600 },
  [policyNames.passwordMinimumLength]: { least: 8, most: 64 },
  [policyNames.passwordMaximumLength]: { least: 64, most: 1024 },
  [policyNames.passwordResetMinutes]: { least: 1, most: 1440 },
  [policyNames.accessTokenMinutes]: { least: 1, most: 15 },
  [policyNames.sessionInactivityMinutes]: { least: 2, most: 60 },
  [policyNames.sessionOverallHours]: { least: 1, most: 24 },
  [policyNames.signInTriesBeforeWait]: { least: 1, most: 99 },
  [policyNames.signInTriesBeforeLock]: { least: 2, most: 100 },
  [policyNames.signInFirstWaitSeconds]: { least: 1, most: 3600 },
  [policyNames.signInLongestWaitMinutes]: { least: 1, most: 1440 },
  [policyNames.twoStepCodeStepsEitherSide]: { least: 0, most: 1 },
  [policyNames.twoStepSetupMinutes]: { least: 1, most: 60 },
  [policyNames.phoneChallengeSeconds]: { least: 10, most: 600 },
  [policyNames.phoneTokenMinutes]: { least: 1, most: 60 },
  [policyNames.monitorSessionHours]: { least: 1, most: 24 },
  [policyNames.loginListEntriesPerCall]: { least: 1, most: 500 },
  // NIST's ten wrong tries at most for a secret checked on the device (§3.2.10).
  [policyNames.phoneSignInTriesBeforeWait]: { least: 1, most: 9 },
  [policyNames.phoneSignInTriesBeforeLock]: { least: 2, most: 10 },
  [policyNames.phoneSignInFirstWaitSeconds]: { least: 1, most: 600 },
  [policyNames.phoneSignInLongestWaitMinutes]: { least: 1, most: 60 },
  // NIST's SHOULD of an hour at most where a second factor is used (§2.2.3): the device key.
  [policyNames.phoneInactivityLockMinutes]: { least: 2, most: 60 },
  // WCAG 2.2.1: at least twenty seconds to keep the session with one simple act.
  [policyNames.phoneInactivityWarningSeconds]: { least: 20, most: 300 },
  [policyNames.addressLookupAnswerSeconds]: { least: 1, most: 60 },
  [policyNames.mediaStoreAnswerSeconds]: { least: 1, most: 600 },
  [policyNames.mediaFileBytesAtMost]: { least: 1048576, most: 1073741824 },
  [policyNames.mediaPartBytesAtMost]: { least: 65536, most: 1073741824 },
  [policyNames.mediaReceivingBytesAtMost]: { least: 1048576, most: 68719476736 },
  [policyNames.rateLimitFilePartsPerPhone]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.mapFileBytesAtMost]: { least: 1048576, most: 1073741824 },
  [policyNames.mapFileUnzippedBytesAtMost]: { least: 1048576, most: 1073741824 },
  [policyNames.mapFileEntriesAtMost]: { least: 4, most: 65535 },
  [policyNames.mapFileRingPairsAtMost]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.esriLayerAnswerSeconds]: { least: 1, most: 600 },
  [policyNames.rateLimitWindowSeconds]: { least: 1, most: 3600 },
  [policyNames.rateLimitRequestsPerAddress]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.rateLimitRequestsPerAccount]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.rateLimitRequestsPerPhone]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.rateLimitCountsKept]: { least: 1000, most: 10000000 },
  [policyNames.signInAddressWindowMinutes]: { least: 1, most: 1440 },
  [policyNames.signInWrongTriesPerAddress]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.signInWrongTriesPerAddressAtLogin]: { least: 1, most: 98 },
  [policyNames.passwordResetAsksPerAddress]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.passwordResetAsksPerLogin]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.masterPasscodeMinimumLength]: { least: 8, most: 64 },
  [policyNames.masterPasscodeMaximumLength]: { least: 64, most: 1024 },
  [policyNames.phoneKeyRevokedAfterHours]: { least: 0, most: 8760 },
  [policyNames.jobTriesBeforeSetAside]: { least: 1, most: 100 },
  [policyNames.reconciliationRunLongestMinutes]: { least: 1, most: 1440 },
  [policyNames.jobQueuePollSeconds]: { least: 1, most: 3600 },
  [policyNames.mapServerAnswerSeconds]: { least: 1, most: 600 },
  [policyNames.deviceClockOffLimitMinutes]: { least: 1, most: 1440 },
  [policyNames.jobTicketsAtMost]: { least: 1, most: 100000 },
  [policyNames.phoneHeldBytesPerDay]: { least: 1048576, most: 1073741824 },
  [policyNames.phoneHeldRecordsPerDay]: { least: 10, most: 100000 },
  [policyNames.mapFileReadSeconds]: { least: 5, most: 600 },
  [policyNames.mapFileReadMemoryMebibytes]: { least: 64, most: 4096 },
};

export class Policy {
  readonly loadCallLowLimit: number;
  readonly loadCallHighLimit: number;
  readonly siteCircleMeters: number;
  readonly stumpFillDepthInches: number;
  readonly crewDayHours: number;
  readonly ticketNumberBlockSize: number;
  readonly certNumberBlockSize: number;
  readonly roeNumberBlockSize: number;
  readonly requestBodyLimitBytes: number;
  readonly statementTimeoutMs: number;
  readonly databasePoolConnections: number;
  readonly databaseConnectionWaitMs: number;
  readonly databaseWorkLongestMs: number;
  readonly databaseBusyRetrySeconds: number;
  readonly passwordMinimumLength: number;
  readonly passwordMaximumLength: number;
  readonly passwordResetMinutes: number;
  readonly accessTokenMinutes: number;
  readonly sessionInactivityMinutes: number;
  readonly sessionOverallHours: number;
  readonly signInTriesBeforeWait: number;
  readonly signInTriesBeforeLock: number;
  readonly signInFirstWaitSeconds: number;
  readonly signInLongestWaitMinutes: number;
  readonly twoStepCodeStepsEitherSide: number;
  readonly twoStepSetupMinutes: number;
  readonly phoneChallengeSeconds: number;
  readonly phoneTokenMinutes: number;
  readonly monitorSessionHours: number;
  readonly loginListEntriesPerCall: number;
  readonly phoneSignInTriesBeforeWait: number;
  readonly phoneSignInTriesBeforeLock: number;
  readonly phoneSignInFirstWaitSeconds: number;
  readonly phoneSignInLongestWaitMinutes: number;
  readonly phoneInactivityLockMinutes: number;
  readonly phoneInactivityWarningSeconds: number;
  readonly addressLookupAnswerSeconds: number;
  readonly mediaStoreAnswerSeconds: number;
  readonly mediaFileBytesAtMost: number;
  readonly mediaPartBytesAtMost: number;
  readonly mediaReceivingBytesAtMost: number;
  readonly rateLimitFilePartsPerPhone: number;
  readonly mapFileBytesAtMost: number;
  readonly mapFileUnzippedBytesAtMost: number;
  readonly mapFileEntriesAtMost: number;
  readonly mapFileRingPairsAtMost: number;
  readonly esriLayerAnswerSeconds: number;
  readonly rateLimitWindowSeconds: number;
  readonly rateLimitRequestsPerAddress: number;
  readonly rateLimitRequestsPerAccount: number;
  readonly rateLimitRequestsPerPhone: number;
  readonly rateLimitCountsKept: number;
  readonly signInAddressWindowMinutes: number;
  readonly signInWrongTriesPerAddress: number;
  readonly signInWrongTriesPerAddressAtLogin: number;
  readonly passwordResetAsksPerAddress: number;
  readonly passwordResetAsksPerLogin: number;
  readonly masterPasscodeMinimumLength: number;
  readonly masterPasscodeMaximumLength: number;
  readonly phoneKeyRevokedAfterHours: number;
  readonly jobTriesBeforeSetAside: number;
  readonly reconciliationRunLongestMinutes: number;
  readonly jobQueuePollSeconds: number;
  readonly mapServerAnswerSeconds: number;
  readonly deviceClockOffLimitMinutes: number;
  readonly jobTicketsAtMost: number;
  readonly phoneHeldBytesPerDay: number;
  readonly phoneHeldRecordsPerDay: number;
  readonly mapFileReadSeconds: number;
  readonly mapFileReadMemoryMebibytes: number;

  private constructor(values: Readonly<Record<string, string | undefined>>) {
    this.loadCallLowLimit = Policy.read(values, policyNames.loadCallLowLimit);
    this.loadCallHighLimit = Policy.read(values, policyNames.loadCallHighLimit);
    this.siteCircleMeters = Policy.read(values, policyNames.siteCircleMeters);
    this.stumpFillDepthInches = Policy.read(values, policyNames.stumpFillDepthInches);
    this.crewDayHours = Policy.read(values, policyNames.crewDayHours);
    this.ticketNumberBlockSize = Policy.read(values, policyNames.ticketNumberBlockSize);
    this.certNumberBlockSize = Policy.read(values, policyNames.certNumberBlockSize);
    this.roeNumberBlockSize = Policy.read(values, policyNames.roeNumberBlockSize);
    this.requestBodyLimitBytes = Policy.read(values, policyNames.requestBodyLimitBytes);
    this.statementTimeoutMs = Policy.read(values, policyNames.statementTimeoutMs);
    this.databasePoolConnections = Policy.read(values, policyNames.databasePoolConnections);
    this.databaseConnectionWaitMs = Policy.read(values, policyNames.databaseConnectionWaitMs);
    this.databaseWorkLongestMs = Policy.read(values, policyNames.databaseWorkLongestMs);
    this.databaseBusyRetrySeconds = Policy.read(values, policyNames.databaseBusyRetrySeconds);
    this.passwordMinimumLength = Policy.read(values, policyNames.passwordMinimumLength);
    this.passwordMaximumLength = Policy.read(values, policyNames.passwordMaximumLength);
    this.passwordResetMinutes = Policy.read(values, policyNames.passwordResetMinutes);
    this.accessTokenMinutes = Policy.read(values, policyNames.accessTokenMinutes);
    this.sessionInactivityMinutes = Policy.read(values, policyNames.sessionInactivityMinutes);
    this.sessionOverallHours = Policy.read(values, policyNames.sessionOverallHours);
    this.signInTriesBeforeWait = Policy.read(values, policyNames.signInTriesBeforeWait);
    this.signInTriesBeforeLock = Policy.read(values, policyNames.signInTriesBeforeLock);
    this.signInFirstWaitSeconds = Policy.read(values, policyNames.signInFirstWaitSeconds);
    this.signInLongestWaitMinutes = Policy.read(values, policyNames.signInLongestWaitMinutes);
    this.twoStepCodeStepsEitherSide = Policy.read(values, policyNames.twoStepCodeStepsEitherSide);
    this.twoStepSetupMinutes = Policy.read(values, policyNames.twoStepSetupMinutes);
    this.phoneChallengeSeconds = Policy.read(values, policyNames.phoneChallengeSeconds);
    this.phoneTokenMinutes = Policy.read(values, policyNames.phoneTokenMinutes);
    this.monitorSessionHours = Policy.read(values, policyNames.monitorSessionHours);
    this.loginListEntriesPerCall = Policy.read(values, policyNames.loginListEntriesPerCall);
    this.phoneSignInTriesBeforeWait = Policy.read(values, policyNames.phoneSignInTriesBeforeWait);
    this.phoneSignInTriesBeforeLock = Policy.read(values, policyNames.phoneSignInTriesBeforeLock);
    this.phoneSignInFirstWaitSeconds = Policy.read(values, policyNames.phoneSignInFirstWaitSeconds);
    this.phoneSignInLongestWaitMinutes = Policy.read(
      values,
      policyNames.phoneSignInLongestWaitMinutes,
    );
    this.phoneInactivityLockMinutes = Policy.read(values, policyNames.phoneInactivityLockMinutes);
    this.phoneInactivityWarningSeconds = Policy.read(
      values,
      policyNames.phoneInactivityWarningSeconds,
    );
    this.addressLookupAnswerSeconds = Policy.read(values, policyNames.addressLookupAnswerSeconds);
    this.mediaStoreAnswerSeconds = Policy.read(values, policyNames.mediaStoreAnswerSeconds);
    this.mediaFileBytesAtMost = Policy.read(values, policyNames.mediaFileBytesAtMost);
    this.mediaPartBytesAtMost = Policy.read(values, policyNames.mediaPartBytesAtMost);
    this.mediaReceivingBytesAtMost = Policy.read(values, policyNames.mediaReceivingBytesAtMost);
    this.rateLimitFilePartsPerPhone = Policy.read(values, policyNames.rateLimitFilePartsPerPhone);
    this.mapFileBytesAtMost = Policy.read(values, policyNames.mapFileBytesAtMost);
    this.mapFileUnzippedBytesAtMost = Policy.read(values, policyNames.mapFileUnzippedBytesAtMost);
    this.mapFileEntriesAtMost = Policy.read(values, policyNames.mapFileEntriesAtMost);
    this.mapFileRingPairsAtMost = Policy.read(values, policyNames.mapFileRingPairsAtMost);
    this.esriLayerAnswerSeconds = Policy.read(values, policyNames.esriLayerAnswerSeconds);
    this.rateLimitWindowSeconds = Policy.read(values, policyNames.rateLimitWindowSeconds);
    this.rateLimitRequestsPerAddress = Policy.read(values, policyNames.rateLimitRequestsPerAddress);
    this.rateLimitRequestsPerAccount = Policy.read(values, policyNames.rateLimitRequestsPerAccount);
    this.rateLimitRequestsPerPhone = Policy.read(values, policyNames.rateLimitRequestsPerPhone);
    this.rateLimitCountsKept = Policy.read(values, policyNames.rateLimitCountsKept);
    this.signInAddressWindowMinutes = Policy.read(values, policyNames.signInAddressWindowMinutes);
    this.signInWrongTriesPerAddress = Policy.read(values, policyNames.signInWrongTriesPerAddress);
    this.signInWrongTriesPerAddressAtLogin = Policy.read(
      values,
      policyNames.signInWrongTriesPerAddressAtLogin,
    );
    this.passwordResetAsksPerAddress = Policy.read(values, policyNames.passwordResetAsksPerAddress);
    this.passwordResetAsksPerLogin = Policy.read(values, policyNames.passwordResetAsksPerLogin);
    this.masterPasscodeMinimumLength = Policy.read(values, policyNames.masterPasscodeMinimumLength);
    this.masterPasscodeMaximumLength = Policy.read(values, policyNames.masterPasscodeMaximumLength);
    this.phoneKeyRevokedAfterHours = Policy.read(values, policyNames.phoneKeyRevokedAfterHours);
    this.jobTriesBeforeSetAside = Policy.read(values, policyNames.jobTriesBeforeSetAside);
    this.reconciliationRunLongestMinutes = Policy.read(
      values,
      policyNames.reconciliationRunLongestMinutes,
    );
    this.jobQueuePollSeconds = Policy.read(values, policyNames.jobQueuePollSeconds);
    this.mapServerAnswerSeconds = Policy.read(values, policyNames.mapServerAnswerSeconds);
    this.deviceClockOffLimitMinutes = Policy.read(values, policyNames.deviceClockOffLimitMinutes);
    this.jobTicketsAtMost = Policy.read(values, policyNames.jobTicketsAtMost);
    this.phoneHeldBytesPerDay = Policy.read(values, policyNames.phoneHeldBytesPerDay);
    this.phoneHeldRecordsPerDay = Policy.read(values, policyNames.phoneHeldRecordsPerDay);
    this.mapFileReadSeconds = Policy.read(values, policyNames.mapFileReadSeconds);
    this.mapFileReadMemoryMebibytes = Policy.read(values, policyNames.mapFileReadMemoryMebibytes);
    // Three pairs hold only together: an access token that outlasted the session's quiet time would
    // keep a session nobody uses alive; a lock that came no later than the first wait would
    // leave no wait at all; and one address allowed as many wrong tries at a login as put a wait
    // on it could, by itself, keep that login waiting.
    if (this.accessTokenMinutes >= this.sessionInactivityMinutes) {
      throw new Error(
        `The policy value ${policyNames.accessTokenMinutes} must be under ${policyNames.sessionInactivityMinutes}.`,
      );
    }
    if (this.signInTriesBeforeWait >= this.signInTriesBeforeLock) {
      throw new Error(
        `The policy value ${policyNames.signInTriesBeforeWait} must be under ${policyNames.signInTriesBeforeLock}.`,
      );
    }
    if (this.phoneSignInTriesBeforeWait >= this.phoneSignInTriesBeforeLock) {
      throw new Error(
        `The policy value ${policyNames.phoneSignInTriesBeforeWait} must be under ${policyNames.phoneSignInTriesBeforeLock}.`,
      );
    }
    // A warning as long as the quiet that closes the session would come at the moment it starts.
    if (this.phoneInactivityWarningSeconds >= this.phoneInactivityLockMinutes * 60) {
      throw new Error(
        `The policy value ${policyNames.phoneInactivityWarningSeconds} must be under ${policyNames.phoneInactivityLockMinutes}.`,
      );
    }
    // The API holds at least one whole file while it comes. (A part never goes past its file's
    // length, so a part's own limit needs no pairing.)
    if (this.mediaReceivingBytesAtMost < this.mediaFileBytesAtMost) {
      throw new Error(
        `The policy value ${policyNames.mediaReceivingBytesAtMost} must be at least ${policyNames.mediaFileBytesAtMost}.`,
      );
    }
    if (this.masterPasscodeMinimumLength > this.masterPasscodeMaximumLength) {
      throw new Error(
        `The policy value ${policyNames.masterPasscodeMinimumLength} must be at most ${policyNames.masterPasscodeMaximumLength}.`,
      );
    }
    if (this.signInWrongTriesPerAddressAtLogin >= this.signInTriesBeforeWait) {
      throw new Error(
        `The policy value ${policyNames.signInWrongTriesPerAddressAtLogin} must be under ${policyNames.signInTriesBeforeWait}.`,
      );
    }
  }

  // From an environment: an env file's values, or a process's. A value that is missing or isn't a
  // whole number in its range stops the caller, by name; nothing here stands in for it.
  static from(values: Readonly<Record<string, string | undefined>>): Policy {
    return new Policy(values);
  }

  private static read(
    values: Readonly<Record<string, string | undefined>>,
    name: PolicyName,
  ): number {
    const written = values[name]?.trim();
    if (written === undefined || written === '') {
      throw new Error(`The policy value ${name} is missing.`);
    }
    const { least, most } = ranges[name];
    const value = Number(written);
    if (!/^\d+$/.test(written) || !Number.isSafeInteger(value) || value < least || value > most) {
      const range =
        most === Number.MAX_SAFE_INTEGER
          ? `${String(least)} or more`
          : `from ${String(least)} to ${String(most)}`;
      throw new Error(`The policy value ${name} must be a whole number, ${range}: "${written}".`);
    }
    return value;
  }
}
