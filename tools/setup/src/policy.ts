// The one policy value the installer acts on (ARCHITECTURE §5.7; ADR-276 (7), 394): how long a
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
