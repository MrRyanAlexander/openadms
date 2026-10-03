// The policy values (invariant 16; ADR-142, 164, 203, 303): the numbers a new project's settings
// start from. A threshold is policy, never a literal: none is written in this package. Each comes
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
} as const;

export type PolicyName = (typeof policyNames)[keyof typeof policyNames];

// What each value may be: a whole number in the range the database's own checks hold a project's
// setting to. A load call is 0 to 100; a size is at least one; a crew day is 1 to 24 hours.
const ranges: Record<PolicyName, { least: number; most: number }> = {
  [policyNames.loadCallLowLimit]: { least: 0, most: 100 },
  [policyNames.loadCallHighLimit]: { least: 0, most: 100 },
  [policyNames.siteCircleMeters]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.stumpFillDepthInches]: { least: 1, most: Number.MAX_SAFE_INTEGER },
  [policyNames.crewDayHours]: { least: 1, most: 24 },
};

export class Policy {
  readonly loadCallLowLimit: number;
  readonly loadCallHighLimit: number;
  readonly siteCircleMeters: number;
  readonly stumpFillDepthInches: number;
  readonly crewDayHours: number;

  private constructor(values: Readonly<Record<string, string | undefined>>) {
    this.loadCallLowLimit = Policy.read(values, policyNames.loadCallLowLimit);
    this.loadCallHighLimit = Policy.read(values, policyNames.loadCallHighLimit);
    this.siteCircleMeters = Policy.read(values, policyNames.siteCircleMeters);
    this.stumpFillDepthInches = Policy.read(values, policyNames.stumpFillDepthInches);
    this.crewDayHours = Policy.read(values, policyNames.crewDayHours);
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
