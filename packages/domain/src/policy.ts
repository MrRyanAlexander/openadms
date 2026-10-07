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
  // Rate limits (ARCHITECTURE §6, Abuse; ASVS 2.4.1; ADR-416): how long the stretch is that
  // requests are counted over, in seconds; how many one address and one signed-in person may send
  // in it; and how many callers' counts the server keeps at once.
  rateLimitWindowSeconds: 'RATE_LIMIT_WINDOW_SECONDS',
  rateLimitRequestsPerAddress: 'RATE_LIMIT_REQUESTS_PER_ADDRESS',
  rateLimitRequestsPerAccount: 'RATE_LIMIT_REQUESTS_PER_ACCOUNT',
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
} as const;

export type PolicyName = (typeof policyNames)[keyof typeof policyNames];

// What each value may be: a whole number in the range the database's own checks hold a project's
// setting to. A load call is 0 to 100; a size is at least one; a crew day is 1 to 24 hours; a block
// is at least one number, and a size limit at least one byte. A statement's time limit is at least
// one millisecond (nought would switch it off) and at most what Postgres takes. A password's
// shortest length is never under the eight characters the standard allows beside a second step,
// nor over the 64 it says must be permitted; its longest never under those 64. A reset by email
// is good for a day at most, the standard's limit. A session lasts a day at most and an hour at
// most with nothing asked of it (the standard's limits where a second step is required), and its
// access token never as long as that hour. A login is locked after a hundred wrong tries in a row
// at the very most, the standard's limit. An authenticator's code is taken one step either side
// of the server's own at the most (the standard has its clock value change at least every two
// minutes), and nought takes the server's own step alone. A rate limit counts over an hour at the
// most, a limit on tries over a day at the most, and each allows at least one; the server keeps
// at least a thousand callers' counts and at most ten million.
const ranges: Record<PolicyName, { least: number; most: number }> = {
  [policyNames.loadCallLowLimit]: { least: 0, most: 100 },
  [policyNames.loadCallHighLimit]: { least: 0, most: 100 },
  [policyNames.siteCircleMeters]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.stumpFillDepthInches]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.crewDayHours]: { least: 1, most: 24 },
  [policyNames.ticketNumberBlockSize]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.certNumberBlockSize]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.roeNumberBlockSize]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.requestBodyLimitBytes]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.statementTimeoutMs]: { least: 1, most: 2147483647 },
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
  [policyNames.rateLimitWindowSeconds]: { least: 1, most: 3600 },
  [policyNames.rateLimitRequestsPerAddress]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.rateLimitRequestsPerAccount]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.rateLimitCountsKept]: { least: 1000, most: 10000000 },
  [policyNames.signInAddressWindowMinutes]: { least: 1, most: 1440 },
  [policyNames.signInWrongTriesPerAddress]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.signInWrongTriesPerAddressAtLogin]: { least: 1, most: 98 },
  [policyNames.passwordResetAsksPerAddress]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.passwordResetAsksPerLogin]: { least: 1, most: Number.MAX_SAFE_INTEGER },
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
  readonly rateLimitWindowSeconds: number;
  readonly rateLimitRequestsPerAddress: number;
  readonly rateLimitRequestsPerAccount: number;
  readonly rateLimitCountsKept: number;
  readonly signInAddressWindowMinutes: number;
  readonly signInWrongTriesPerAddress: number;
  readonly signInWrongTriesPerAddressAtLogin: number;
  readonly passwordResetAsksPerAddress: number;
  readonly passwordResetAsksPerLogin: number;

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
    this.rateLimitWindowSeconds = Policy.read(values, policyNames.rateLimitWindowSeconds);
    this.rateLimitRequestsPerAddress = Policy.read(values, policyNames.rateLimitRequestsPerAddress);
    this.rateLimitRequestsPerAccount = Policy.read(values, policyNames.rateLimitRequestsPerAccount);
    this.rateLimitCountsKept = Policy.read(values, policyNames.rateLimitCountsKept);
    this.signInAddressWindowMinutes = Policy.read(values, policyNames.signInAddressWindowMinutes);
    this.signInWrongTriesPerAddress = Policy.read(values, policyNames.signInWrongTriesPerAddress);
    this.signInWrongTriesPerAddressAtLogin = Policy.read(
      values,
      policyNames.signInWrongTriesPerAddressAtLogin,
    );
    this.passwordResetAsksPerAddress = Policy.read(values, policyNames.passwordResetAsksPerAddress);
    this.passwordResetAsksPerLogin = Policy.read(values, policyNames.passwordResetAsksPerLogin);
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
