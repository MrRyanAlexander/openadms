// The policy values the installer acts on (ARCHITECTURE §5.7; ADR-276 (7), 394, 530): how long a
// statement of a service's database login may run, and the master passcode's shortest and longest
// (ADR-530); and which values each service runs under, for `installer:check` (C53). How long a
// statement of a service's database login may run. The release's value is in the committed
// packages/domain/policy.env, under the name the domain owns; a service's own env file may state
// another for its logins (ADR-395). The installer runs before anything is built, so it reads the
// file itself; the range is the domain's (packages/domain/src/policy.ts), and tools/setup's test
// holds the two to the same shipped value.
export const statementTimeoutName = 'STATEMENT_TIMEOUT_MS';

// What Postgres takes for statement_timeout, in milliseconds; nought would switch it off.
const most = 2147483647;

export class StatementTimeout {
  private readonly release: Readonly<Record<string, string | undefined>>;

  // The release's policy values, as its env file states them.
  constructor(release: Readonly<Record<string, string | undefined>>) {
    this.release = release;
  }

  // The service's own value when its env file states one, otherwise the release's. A value that
  // isn't a whole number of milliseconds in range stops the caller, naming where it is written
  // and never what is written.
  for(own: Readonly<Record<string, string | undefined>>, ownFile: string): number {
    const stated = own[statementTimeoutName]?.trim();
    if (stated !== undefined && stated !== '') return this.read(stated, ownFile);
    const shipped = this.release[statementTimeoutName]?.trim();
    if (shipped === undefined || shipped === '') {
      throw new Error(`The policy value ${statementTimeoutName} is missing from the release.`);
    }
    return this.read(shipped, 'packages/domain/policy.env');
  }

  private read(written: string, where: string): number {
    const value = Number(written);
    if (!/^\d+$/.test(written) || !Number.isSafeInteger(value) || value < 1 || value > most) {
      throw new Error(
        `${statementTimeoutName} in ${where} must be a whole number of milliseconds, from 1 to ${String(most)}.`,
      );
    }
    return value;
  }
}

// The master passcode's shortest and longest, in characters (ADR-266, 530): the release's values,
// the domain's names (packages/domain/src/policy.ts), held to the same shipped values by
// tools/setup's test. A value that isn't a whole number, or a shortest over the longest, stops
// the caller by name.
export const passcodeLengthNames = {
  shortest: 'MASTER_PASSCODE_MINIMUM_LENGTH',
  longest: 'MASTER_PASSCODE_MAXIMUM_LENGTH',
} as const;

export interface PasscodeLengths {
  readonly shortest: number;
  readonly longest: number;
}

export function passcodeLengths(
  release: Readonly<Record<string, string | undefined>>,
): PasscodeLengths {
  const read = (name: string): number => {
    const written = release[name]?.trim() ?? '';
    if (!/^[1-9]\d{0,3}$/.test(written)) {
      throw new Error(
        `The policy value ${name} in packages/domain/policy.env must be a whole number of characters.`,
      );
    }
    return Number(written);
  };
  const shortest = read(passcodeLengthNames.shortest);
  const longest = read(passcodeLengthNames.longest);
  if (shortest > longest) {
    throw new Error(
      `The policy value ${passcodeLengthNames.shortest} must be at most ${passcodeLengthNames.longest}.`,
    );
  }
  return { shortest, longest };
}

// What a service runs under (C53; ADR-395, 530): the release's policy values, and those its own
// env file states instead, by name and value. Policy values are never secrets; nothing else of
// the service's file is read out. Whether each is in its range is the service's own start to
// say (the domain's `Policy`): here a value that isn't a whole number is named as wrong.
export interface PolicyInForce {
  readonly fromRelease: number;
  readonly own: readonly {
    readonly name: string;
    readonly value: string;
    readonly whole: boolean;
  }[];
}

export function policyInForce(
  release: Readonly<Record<string, string | undefined>>,
  own: Readonly<Record<string, string | undefined>>,
): PolicyInForce {
  const names = Object.keys(release).sort();
  const stated = names.flatMap((name) => {
    const value = own[name]?.trim();
    return value === undefined || value === '' ? [] : [{ name, value, whole: /^\d+$/.test(value) }];
  });
  return { fromRelease: names.length - stated.length, own: stated };
}
