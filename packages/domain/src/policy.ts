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
} as const;

export type PolicyName = (typeof policyNames)[keyof typeof policyNames];

// What each value may be: a whole number in the range the database's own checks hold a project's
// setting to. A load call is 0 to 100; a size is at least one; a crew day is 1 to 24 hours; a block
// is at least one number, and a size limit at least one byte. A statement's time limit is at least
// one millisecond (nought would switch it off) and at most what Postgres takes. A password's
// shortest length is never under the eight characters the standard allows beside a second step,
// nor over the 64 it says must be permitted; its longest never under those 64. A reset by email
// is good for a day at most, the standard's limit.
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
