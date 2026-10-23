// Where the tests run (ARCHITECTURE §5.1): never in the installation's own database, `adms`. That
// one is the firm's: it holds the firm's own people and records, and a first run loads the sample
// projects into it, so a test there would find rows it didn't make. The installer makes a test
// database beside it, `adms_test`, as it makes `adms`: owned by adms_owner, open to the same
// logins alone, migrated by the same migrations and seeded by the same seed, so the roles, grants
// and guards the tests prove are the real ones, and a test starts from the seed alone.
//
// `ADMS_TEST_DATABASE` names another database on the same server for a run: a throw-away copy a
// guard's loosening is tried on, or a story's own (packages/scenarios). Whatever it names, it is
// never the installation's own database nor its shadow, so no test and no story can reach either.
// The logins' URLs are the installer's, read from their env files by whoever asks; only the
// database's name in them is changed here. No URL is ever printed.

import process from 'node:process';

// The installation's test database, beside `adms` and `adms_shadow` (tools/setup's installer).
export const testDatabaseName = 'adms_test';

// The installation's own database and Prisma's shadow of it: never a test's.
const installationDatabases: readonly string[] = ['adms', 'adms_shadow'];

// Whether a database's name may be a test's: an Open ADMS database on the local stack, other than
// the installation's own and its shadow.
export function isTestDatabase(name: string): boolean {
  return /^adms_[a-z0-9_]+$/.test(name) && !installationDatabases.includes(name);
}

// The database this run's tests use: `ADMS_TEST_DATABASE` where it is set, the installation's test
// database otherwise. Refuses a name that isn't a test's, before anything connects.
export function testDatabase(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const named = environment['ADMS_TEST_DATABASE'] ?? testDatabaseName;
  if (!isTestDatabase(named)) {
    throw new Error(
      `ADMS_TEST_DATABASE must name a test's database (adms_…), never the installation's own or its shadow, not ${named}.`,
    );
  }
  return named;
}

// A login's URL as the installer wrote it, pointed at a test's database instead: the same server,
// login, password and TLS; only the database's name changes.
export function atTestDatabase(url: string, name: string = testDatabase()): string {
  if (!isTestDatabase(name)) throw new Error(`${name} is no test's database.`);
  const at = new URL(url);
  at.pathname = `/${name}`;
  return at.toString();
}
