// The installer (ARCHITECTURE §4; REQ-007, REQ-008; ADR-266, 268). A first run asks a few questions,
// generates the secrets and sets up the database. A rerun re-checks what it knows, asks only to
// confirm it and resume, and never makes a secret again. Teardown makes the next run a first run.
// It never prints a password, a secret, a hash or a connection URL.
// The master passcode's slow hash is kept in the database alone (ARCHITECTURE §7.5; ADR-281): the
// installer makes it from what the firm types and hands it to the seed, never through a file.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:https';
import { join } from 'node:path';

import {
  Database,
  loginRoles,
  seededActors,
  type LoginRole,
  type SeededActor,
  type Server,
} from './database.ts';
import { EnvFile, InstallationState, MigrationFolder, type InstallationRecord } from './files.ts';
import { Interview } from './interview.ts';
import { StatementTimeout, statementTimeoutName } from './policy.ts';
import { BreachedList, PasscodeHasher, SecretMaker } from './secrets.ts';

const databaseName = 'adms';
const host = '127.0.0.1';
// The installation's database, open to the logins; and the shadow database `prisma migrate dev`
// checks migrations in, open only to its owner, adms_owner (ADR-268).
const databases: readonly { name: string; connect: readonly LoginRole[]; what: string }[] = [
  {
    name: databaseName,
    connect: ['adms_api', 'adms_worker', 'adms_readonly'],
    what: 'only the logins connect',
  },
  { name: 'adms_shadow', connect: [], what: "Prisma's shadow, only its owner connects" },
];
// The logins a service runs as, each under a statement timeout (ADR-394). adms_owner has none:
// it runs the migrations and the seed, never a service.
const timed: readonly LoginRole[] = ['adms_api', 'adms_worker', 'adms_readonly'];
const untimed = 'adms_owner, which runs the migrations, is under no statement timeout';
const warning = 'Git-ignored. Never commit, print or share it.';
// How the hash reaches the seed (its process's environment), and where an installation made before
// the database kept it still has it (packages/db/.env, ADR-266).
const passcodeKey = 'ADMS_MASTER_PASSCODE_HASH';
// What the worker's settings name of the map servers (apps/worker/src/process/settings.ts).
const workerMapKeys = [
  'ADMS_ROUTING_URL',
  'ADMS_ADDRESSES_URL',
  'ADMS_MAP_CA_FILE',
  'ADMS_MAP_EXTRACT_SHA256',
];
// The API is reached only through the local stack's proxy, over HTTPS (ADR-385).
const apiHostname = 'api.adms.localhost';

interface Login {
  role: LoginRole;
  file: EnvFile;
  key: string;
}

interface Check {
  ok: boolean;
  text: string;
}

export class Installer {
  private readonly root: string;
  private readonly yes: boolean;
  private readonly stackEnv: EnvFile;
  private readonly state: InstallationState;
  private readonly ownerEnv: EnvFile;
  private readonly apiEnv: EnvFile;
  private readonly workerEnv: EnvFile;
  // The release's policy values: committed, no secret in it (ADR-303).
  private readonly policyEnv: EnvFile;
  private readonly logins: Login[];
  private interview: Interview | undefined;
  // The master passcode's slow hash, in memory only, when this run has one to hand to the seed.
  private passcodeHash: string | undefined;

  constructor(root: string, yes: boolean) {
    this.root = root;
    this.yes = yes;
    this.stackEnv = new EnvFile(join(root, 'infra/local/.env'));
    this.state = new InstallationState(join(root, 'tools/setup/.state/installation.json'));
    this.ownerEnv = new EnvFile(join(root, 'packages/db/.env'));
    this.apiEnv = new EnvFile(join(root, 'apps/api/.env'));
    this.workerEnv = new EnvFile(join(root, 'apps/worker/.env'));
    this.policyEnv = new EnvFile(join(root, 'packages/domain/policy.env'));
    this.logins = [
      { role: 'adms_owner', file: this.ownerEnv, key: 'DATABASE_URL' },
      { role: 'adms_api', file: this.apiEnv, key: 'DATABASE_URL' },
      { role: 'adms_worker', file: this.workerEnv, key: 'DATABASE_URL' },
      { role: 'adms_readonly', file: this.apiEnv, key: 'READONLY_DATABASE_URL' },
    ];
  }

  async install(): Promise<void> {
    const database = await this.administer(true);
    try {
      let record: InstallationRecord;
      if (this.state.exists()) {
        record = this.state.load();
        console.log(`\nResuming. What I know about this installation:`);
        this.describe(record);
        console.log('\nChecking that it is still true:');
        const allTrue = this.report(await this.checks(database, record));
        const question = allTrue
          ? 'All true. Resume (re-check the database, run migrations and the seed)?'
          : 'Some of it is no longer true. Resume and put back what I can, without new secrets?';
        if (!(await this.confirm(question))) {
          console.log('Stopped. Nothing was changed.');
          return;
        }
        this.requireSecrets();
      } else {
        await this.refuseLeftovers(database);
        const answers = await this.firstRunQuestions();
        if (answers === undefined) {
          console.log('Stopped. Nothing was written.');
          return;
        }
        record = await this.writeSecrets(answers);
      }
      console.log('');
      await this.ensureRoles(database, record);
      await this.ensureTimeouts(database);
      await this.ensureDatabase(database, record);
      await this.verifyLogins();
      this.migrate();
      await this.requireGuarded();
      await this.requireMasterPasscode();
      this.seed();
      await this.clearEarlierHash();
      this.state.save(record);
      this.ensureWorkerSettings();
      this.startApi();
      this.startWorker();
      console.log(`\nInstalled for ${record.firm}. Rerun \`pnpm installer\` any time to re-check.`);
    } finally {
      await database.close();
      this.interview?.close();
    }
  }

  // Changes nothing; exits 1 when something it knows is no longer true.
  async check(): Promise<boolean> {
    if (!this.state.exists()) {
      console.log('Not installed: there is no installation record. Run `pnpm installer`.');
      return false;
    }
    const record = this.state.load();
    this.describe(record);
    console.log('');
    let database: Database;
    try {
      database = await this.administer(false);
    } catch {
      return this.report([
        { ok: false, text: 'the local stack answers (start it with `pnpm local:up`)' },
      ]);
    }
    try {
      return this.report(await this.checks(database, record));
    } finally {
      await database.close();
    }
  }

  async teardown(): Promise<void> {
    try {
      if (!this.yes) {
        console.log(
          `Teardown deletes this installation: the database ${databaseName} and every record in it, ` +
            'its shadow, its four logins, their env files and the installation record. ' +
            'The next run is a first run.',
        );
        const answer = await this.questions().ask('Type teardown to go on');
        if (answer !== 'teardown') {
          console.log('Stopped. Nothing was changed.');
          return;
        }
      }
      const database = await this.administer(true);
      try {
        const names = databases.map(({ name }) => name);
        for (const item of await database.drop(names)) console.log(`- dropped ${item}`);
      } finally {
        await database.close();
      }
      for (const file of [this.ownerEnv, this.apiEnv, this.workerEnv]) {
        if (file.exists()) {
          rmSync(file.path);
          console.log(`- removed ${this.relative(file.path)}`);
        }
      }
      if (this.state.exists()) {
        rmSync(join(this.root, 'tools/setup/.state'), { recursive: true });
        console.log('- removed the installation record');
      }
      console.log('Torn down. The next `pnpm installer` is a first run.');
    } finally {
      this.interview?.close();
    }
  }

  // --- first run -----------------------------------------------------------------------------

  private async firstRunQuestions(): Promise<
    { firm: string; mail: InstallationRecord['mail']; passcode: string } | undefined
  > {
    const interview = this.questions();
    console.log('\nFirst run: nothing is installed yet. Three questions, then I set it up.\n');
    let firm = '';
    while (firm === '') {
      firm = await interview.ask('1. The firm that runs this installation (its name)');
    }
    const mail = (await interview.confirm(
      '2. Send email through the local mail catcher (Mailpit, dev only)? Without email, admins reset passwords',
    ))
      ? 'mail catcher'
      : 'none';
    console.log(
      '3. The master passcode: one per firm. It opens phone setup and the supervisor actions.',
    );
    const passcode = await this.askPasscode(interview);
    console.log(
      `\nFirm: ${firm}\nEmail: ${mail}\nMaster passcode: set (only its slow hash is kept, in the database)`,
    );
    if (!(await this.confirm(`Set up Open ADMS for ${firm} on this machine?`))) return undefined;
    return { firm, mail, passcode };
  }

  private async askPasscode(interview: Interview): Promise<string> {
    const hasher = new PasscodeHasher();
    // The release's list of known breached passwords: committed, no secret in it (ADR-403).
    const breached = new BreachedList(
      readFileSync(join(this.root, 'packages/domain/breached-passwords.txt'), 'utf8'),
    );
    for (;;) {
      const passcode = await interview.askSecret('   Master passcode');
      const problem = hasher.problem(passcode, breached);
      if (problem !== undefined) console.log(`   ${problem}`);
      else if ((await interview.askSecret('   Once more')) === passcode) return passcode;
      else console.log('   They differ. Again, please.');
    }
  }

  // The only place secrets are made. Each env file is created exclusively, so none is replaced.
  private async writeSecrets(answers: {
    firm: string;
    mail: InstallationRecord['mail'];
    passcode: string;
  }): Promise<InstallationRecord> {
    const server = this.server();
    const maker = new SecretMaker();
    const url = (role: LoginRole): string =>
      `postgresql://${role}:${maker.password()}@${host}:${String(server.port)}/${databaseName}`;
    // Kept in memory for the seed, which puts it in the database; never written to a file.
    this.passcodeHash = await new PasscodeHasher().hash(answers.passcode);
    const header = (who: string): string[] => [
      `Open ADMS: ${who}. Written by \`pnpm installer\` (ADR-266).`,
      warning,
    ];

    this.ownerEnv.create(header('the database owner, for migrations and the seed only'), [
      ['DATABASE_URL', url('adms_owner')],
    ]);
    const smtpPort = this.stackEnv.read()['ADMS_SMTP_PORT'] ?? '1025';
    this.apiEnv.create(header('the API, with its own login and the read-only login'), [
      ['DATABASE_URL', url('adms_api')],
      ['READONLY_DATABASE_URL', url('adms_readonly')],
      ['ADMS_TOKEN_SIGNING_SECRET', maker.password()],
      ['SMTP_URL', answers.mail === 'mail catcher' ? `smtp://${host}:${smtpPort}` : ''],
    ]);
    this.workerEnv.create(header('the worker, with its own login and the map servers it asks'), [
      ['DATABASE_URL', url('adms_worker')],
      ...this.workerMapSettings(),
    ]);
    for (const file of [this.ownerEnv, this.apiEnv, this.workerEnv]) {
      console.log(`+ wrote ${this.relative(file.path)} (mode 0600)`);
    }

    const now = new Date().toISOString();
    const record: InstallationRecord = {
      format: 1,
      firm: answers.firm,
      mail: answers.mail,
      database: { host, port: server.port, name: databaseName },
      steps: { secrets: now },
      createdAt: now,
      updatedAt: now,
    };
    this.state.save(record);
    return record;
  }

  // Files or logins with no installation record: their secrets can't be trusted to match.
  private async refuseLeftovers(database: Database): Promise<void> {
    const found: string[] = [];
    for (const file of [this.ownerEnv, this.apiEnv, this.workerEnv]) {
      if (file.exists()) found.push(this.relative(file.path));
    }
    for (const role of loginRoles) if (await database.roleExists(role)) found.push(`login ${role}`);
    for (const { name } of databases) {
      if ((await database.owner(name)) !== undefined) found.push(`database ${name}`);
    }
    if (found.length > 0) {
      throw new Error(
        `Found an earlier install without its record: ${found.join(', ')}. ` +
          'Run `pnpm installer:teardown`, then `pnpm installer`.',
      );
    }
  }

  // --- steps, each safe to repeat --------------------------------------------------------------

  // A resume never makes a secret: a missing one means the install can't be trusted.
  private requireSecrets(): void {
    for (const { file, key } of [
      ...this.logins,
      { file: this.apiEnv, key: 'ADMS_TOKEN_SIGNING_SECRET' },
    ]) {
      if (!file.exists() || file.read()[key] === undefined) {
        throw new Error(
          `${this.relative(file.path)} (${key}) is gone, and with it a secret I won't remake. ` +
            'Nothing was changed. To start over: `pnpm installer:teardown`, then `pnpm installer`.',
        );
      }
    }
  }

  private async ensureRoles(database: Database, record: InstallationRecord): Promise<void> {
    for (const login of this.logins) {
      if (await database.roleExists(login.role)) {
        console.log(`✓ login ${login.role} exists`);
      } else {
        await database.createRole(login.role, this.password(login));
        console.log(`+ created login ${login.role} (with the password in its env file)`);
      }
    }
    record.steps.roles = new Date().toISOString();
  }

  // Each service login's statement timeout, from the policy value (ARCHITECTURE §5.7; ADR-394):
  // set on a first run, and put back on a rerun when the login has another or none. It holds for
  // the connections a login opens from now on; the API's container is started afresh below.
  private async ensureTimeouts(database: Database): Promise<void> {
    for (const login of this.logins) {
      // One kept for a login in one database only would stand in front of the login's own.
      for (const name of await database.statementTimeoutDatabases(login.role)) {
        await database.clearStatementTimeout(login.role, name);
        console.log(`- took off ${login.role}'s own statement timeout in database ${name}`);
      }
      if (!timed.includes(login.role)) {
        if ((await database.statementTimeout(login.role)) !== undefined) {
          await database.clearStatementTimeout(login.role);
          console.log(`- took off ${login.role}'s statement timeout: it runs the migrations`);
        } else {
          console.log(`✓ ${untimed}`);
        }
        continue;
      }
      const milliseconds = this.timeoutFor(login);
      const told = `a statement of ${login.role} is stopped after ${String(milliseconds)} ms (${statementTimeoutName})`;
      if ((await database.statementTimeout(login.role)) === String(milliseconds)) {
        console.log(`✓ ${told}`);
      } else {
        await database.setStatementTimeout(login.role, milliseconds);
        console.log(`+ set: ${told}`);
      }
    }
  }

  private async ensureDatabase(database: Database, record: InstallationRecord): Promise<void> {
    for (const { name, connect, what } of databases) {
      const owner = await database.owner(name);
      if (owner === undefined) {
        await database.create(name, connect);
        console.log(`+ created database ${name}: owner adms_owner, ${what}`);
      } else if (owner !== 'adms_owner') {
        throw new Error(`Database ${name} belongs to ${owner}, not adms_owner. Stopped.`);
      } else {
        console.log(`✓ database ${name} exists, owned by adms_owner`);
      }
      if (await database.publicCanConnect(name)) {
        throw new Error(`Anyone may connect to ${name}; it should be ${what}.`);
      }
    }
    record.steps.database = new Date().toISOString();
  }

  private async verifyLogins(): Promise<void> {
    for (const login of this.logins) {
      const problem = await this.logInProblem(login);
      if (problem !== undefined) {
        throw new Error(`${login.role} can't open ${databaseName}: ${problem}. Stopped.`);
      }
      console.log(`✓ ${login.role} opens ${databaseName} with its own password`);
    }
  }

  // Applies every migration not yet applied, as adms_owner; safe to repeat (ADR-268).
  // A migration still empty (Prisma's stub, its SQL not yet written) is refused, not applied.
  private migrate(): void {
    const unwritten = new MigrationFolder(
      join(this.root, 'packages/db/prisma/migrations'),
    ).unwritten();
    if (unwritten.length > 0) {
      throw new Error(
        `Migration ${unwritten.join(', ')} has no SQL yet; applied now, it would be recorded as done ` +
          'with nothing in it. Write it (or remove the stub), then rerun. Nothing was migrated.',
      );
    }
    console.log('Migrations (prisma migrate deploy, as adms_owner):');
    const { status, output } = this.prisma(['migrate', 'deploy']);
    console.log(output);
    if (status !== 0) throw new Error('The migrations did not apply. Stopped.');
  }

  // Every table has its guards (ADR-271): a migration that adds a table without its guard_table
  // line stops the install here, before anything runs against an unguarded table.
  private async requireGuarded(): Promise<void> {
    const gaps = await this.guardGaps();
    if (gaps.length > 0) {
      throw new Error(
        `Unguarded tables (add a guard migration with guard_table, ADR-271):\n  ${gaps.join('\n  ')}\nStopped.`,
      );
    }
    console.log('✓ every table is guarded (guard_gaps() is empty)');
  }

  // The seed keeps the master passcode's slow hash in the database the first time (ADR-281). This
  // finds the hash to hand it: this run's own answer; or, on an installation made before the
  // database kept it, the one still in packages/db/.env. A database that lost it (wiped, then put
  // back) leaves nothing to take it from, so the firm types the passcode again: it's the firm's own
  // secret, not one the installer made, so asking again remakes nothing.
  private async requireMasterPasscode(): Promise<void> {
    if (this.passcodeHash !== undefined || (await this.masterPasscode()) !== undefined) return;
    const earlier = this.ownerEnv.read()[passcodeKey];
    if (earlier !== undefined) {
      if (!new PasscodeHasher().wellFormed(earlier)) {
        throw new Error(`${passcodeKey} in packages/db/.env isn't an Argon2id hash. Stopped.`);
      }
      this.passcodeHash = earlier;
      return;
    }
    console.log(
      'The database holds no master passcode (it went with the database). Set it again:\n' +
        '   one per firm; it opens phone setup and the supervisor actions.',
    );
    this.passcodeHash = await new PasscodeHasher().hash(await this.askPasscode(this.questions()));
  }

  // What every installation needs in its database (packages/db/src/seed.ts, ADR-273, 281): the
  // system actor the worker writes as, and the master passcode's slow hash. The firm and the first
  // admin join with their models. Safe to repeat; it stops when what it finds isn't what it made.
  private seed(): void {
    console.log('Seed (prisma db seed, as adms_owner):');
    const { status, output } = this.prisma(
      ['db', 'seed'],
      this.passcodeHash === undefined ? {} : { [passcodeKey]: this.passcodeHash },
    );
    console.log(output);
    if (status !== 0) throw new Error('The seed did not finish. Stopped.');
  }

  // An installation made before the database kept the hash still has it in packages/db/.env; once
  // the database holds one, that copy goes. The file's other lines stay as they were.
  private async clearEarlierHash(): Promise<void> {
    if (this.ownerEnv.read()[passcodeKey] === undefined) return;
    if ((await this.masterPasscode()) === undefined) {
      throw new Error('The database still holds no master passcode. Stopped.');
    }
    this.ownerEnv.remove(passcodeKey);
    console.log(
      `- took ${passcodeKey} out of ${this.relative(this.ownerEnv.path)}: the database keeps it now`,
    );
  }

  // --- what it knows, and whether it's still true ---------------------------------------------

  private describe(record: InstallationRecord): void {
    const { database } = record;
    console.log(`  Firm: ${record.firm}`);
    console.log(`  Email: ${record.mail}`);
    console.log(
      `  Database: ${database.name} on ${database.host}:${String(database.port)} (the local stack)`,
    );
    console.log(`  Logins: ${loginRoles.join(', ')}; their passwords are in:`);
    for (const file of [this.ownerEnv, this.apiEnv, this.workerEnv]) {
      console.log(`    ${this.relative(file.path)}`);
    }
    console.log(`  Installed: ${record.createdAt}; last run: ${record.updatedAt}`);
  }

  private async checks(database: Database, record: InstallationRecord): Promise<Check[]> {
    const checks: Check[] = [
      {
        ok: true,
        text: `the local stack's Postgres answers on ${host}:${String(this.server().port)}`,
      },
    ];
    for (const file of [this.ownerEnv, this.apiEnv, this.workerEnv]) {
      const name = this.relative(file.path);
      checks.push(
        file.exists()
          ? { ok: file.ownerOnly(), text: `${name} is there, readable by its owner only` }
          : { ok: false, text: `${name} is there (missing)` },
      );
    }
    for (const role of loginRoles) {
      checks.push({ ok: await database.roleExists(role), text: `login ${role} exists` });
    }
    for (const { name, what } of databases) {
      const owner = await database.owner(name);
      checks.push({
        ok: owner === 'adms_owner',
        text: `database ${name} exists, owned by adms_owner`,
      });
      if (owner !== undefined) {
        checks.push({ ok: !(await database.publicCanConnect(name)), text: `${name}: ${what}` });
      }
    }
    for (const login of this.logins) {
      const problem = login.file.exists() ? await this.logInProblem(login) : 'no env file';
      checks.push({
        ok: problem === undefined,
        text: `${login.role} opens ${record.database.name} with its own password${problem === undefined ? '' : ` (${problem})`}`,
      });
    }
    for (const login of this.logins) {
      checks.push(
        timed.includes(login.role)
          ? await this.timeoutCheck(login)
          : await this.noTimeoutCheck(database, login.role),
      );
    }
    const migrations = this.prisma(['migrate', 'status']);
    const summary = migrations.output.trim().split('\n').at(-1)?.trim() ?? '';
    checks.push({ ok: migrations.status === 0, text: `migrations at head (${summary})` });
    let gaps: string[];
    try {
      gaps = await this.guardGaps();
    } catch (error) {
      gaps = [error instanceof Error ? error.message : String(error)];
    }
    checks.push({
      ok: gaps.length === 0,
      text: `every table is guarded${gaps.length === 0 ? '' : ` (${gaps.join('; ')})`}`,
    });
    checks.push(await this.masterPasscodeCheck());
    for (const [seeded, called] of [
      [seededActors.system, 'the system actor'],
      [seededActors.masterPasscode, "the master passcode's actor"],
    ] as const) {
      let actorProblem: string | undefined;
      try {
        actorProblem = await this.seededActorProblem(seeded);
      } catch (error) {
        actorProblem = error instanceof Error ? error.message : String(error);
      }
      checks.push({
        ok: actorProblem === undefined,
        text: `${called} is the seed's, alone, unchanged and guarded${actorProblem === undefined ? '' : ` (${actorProblem})`}`,
      });
    }
    const stated = this.workerEnv.exists() ? this.workerEnv.read() : {};
    const unnamed = workerMapKeys.filter((key) => !(key in stated));
    checks.push({
      ok: unnamed.length === 0,
      text: `apps/worker/.env names the map servers the worker asks${unnamed.length === 0 ? '' : ` (missing ${unnamed.join(', ')}: pnpm installer adds them)`}`,
    });
    const apiProblem = await this.apiProblem();
    checks.push({
      ok: apiProblem === undefined,
      text: `the API answers over HTTPS at https://${apiHostname}/health${apiProblem === undefined ? '' : ` (${apiProblem})`}`,
    });
    checks.push({
      ok: this.helper(['worker-health']).status === 0,
      text: 'the worker answers its health check in the local stack',
    });
    return checks;
  }

  // What the worker is told of the map servers (ARCHITECTURE §3; ADR-349, 419): the local
  // stack's own, each by its name over HTTPS, the stack's certificate authority, and the SHA-256
  // of the extract the stack built them from. Nothing here is secret.
  private workerMapSettings(): [string, string][] {
    const port = this.stackEnv.exists() ? this.stackEnv.read()['ADMS_HTTPS_PORT'] : undefined;
    const at = port === undefined || port === '443' ? '' : `:${port}`;
    const sha256 = this.helper(['map-sha256']).stdout.trim();
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error('The local stack did not say which map extract it has. Stopped.');
    }
    return [
      ['ADMS_ROUTING_URL', `https://routing.adms.localhost${at}`],
      ['ADMS_ADDRESSES_URL', `https://addresses.adms.localhost${at}`],
      ['ADMS_MAP_CA_FILE', join(this.root, 'infra/local/.generated/caddy-root.crt')],
      ['ADMS_MAP_EXTRACT_SHA256', sha256],
    ];
  }

  // An installation made before the worker had a process has a worker's env file with its login
  // alone: the map settings are added at its end, every line already there left as it was.
  private ensureWorkerSettings(): void {
    const name = this.relative(this.workerEnv.path);
    const added = this.workerEnv.add(this.workerMapSettings());
    if (added.length === 0) console.log(`✓ ${name} names the map servers the worker asks`);
    else console.log(`+ added to ${name}: ${added.join(', ')}`);
  }

  // The worker's settings are this installer's too: the local stack builds it, starts its
  // container afresh and asks its health answer (ADR-419).
  private startWorker(): void {
    console.log('\nStarting the worker in the local stack:');
    const result = spawnSync(
      process.execPath,
      [join(this.root, 'infra/local/src/index.ts'), 'worker'],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error('The worker did not start. Stopped.');
  }

  // Asks the local stack's helper (infra/local/src/index.ts) and takes its answer.
  private helper(args: string[]): { status: number | null; stdout: string } {
    const result = spawnSync(
      process.execPath,
      [join(this.root, 'infra/local/src/index.ts'), ...args],
      { encoding: 'utf8' },
    );
    return { status: result.status, stdout: result.stdout };
  }

  // The API's settings are this installer's, so its container starts only now (ADR-385): the
  // local stack builds it, starts it afresh and checks its health answer over HTTPS.
  private startApi(): void {
    console.log('\nStarting the API in the local stack:');
    const result = spawnSync(
      process.execPath,
      [join(this.root, 'infra/local/src/index.ts'), 'api'],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error('The API did not start. Stopped.');
  }

  // Asked as a caller would: through the proxy, the certificate checked against the stack's own.
  private apiProblem(): Promise<string | undefined> {
    const rootCert = join(this.root, 'infra/local/.generated/caddy-root.crt');
    if (!existsSync(rootCert)) return Promise.resolve('start it with `pnpm local:up`');
    const port = this.stackEnv.exists() ? this.stackEnv.read()['ADMS_HTTPS_PORT'] : undefined;
    return new Promise((resolve) => {
      const asked = request(
        {
          host,
          port: Number(port ?? '443'),
          path: '/health',
          servername: apiHostname,
          headers: { host: apiHostname },
          ca: readFileSync(rootCert),
        },
        (answer) => {
          answer.resume();
          resolve(
            answer.statusCode === 200
              ? undefined
              : `it answered ${String(answer.statusCode)}: start it with \`pnpm local:up\``,
          );
        },
      );
      asked.on('error', () => {
        resolve('no answer: start it with `pnpm local:up`');
      });
      asked.end();
    });
  }

  // Read from what the server keeps on the login, not from what it finds on signing in: a host's
  // own default for every login is the host's, and is not this installation's to judge.
  private async noTimeoutCheck(database: Database, role: LoginRole): Promise<Check> {
    const kept =
      (await database.statementTimeout(role)) !== undefined ||
      (await database.statementTimeoutDatabases(role)).length > 0;
    return {
      ok: !kept,
      text: `${untimed}${kept ? ' (it has one: `pnpm installer` takes it off)' : ''}`,
    };
  }

  // Asked as the login itself: what it finds on signing in is what its service runs under.
  private async timeoutCheck(login: Login): Promise<Check> {
    let told = `a statement of ${login.role} is stopped after the policy value ${statementTimeoutName}`;
    let problem: string | undefined;
    try {
      const milliseconds = this.timeoutFor(login);
      told = `a statement of ${login.role} is stopped after ${String(milliseconds)} ms (${statementTimeoutName})`;
      const url = new URL(login.file.read()[login.key] ?? 'postgresql://missing');
      const found = await Database.statementTimeout(
        { host: url.hostname, port: Number(url.port) },
        login.role,
        decodeURIComponent(url.password),
        url.pathname.slice(1),
      );
      if (found !== milliseconds) {
        problem = `${found === 0 ? 'it has no limit' : `it is ${String(found)} ms`}: \`pnpm installer\` sets it`;
      }
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    return {
      ok: problem === undefined,
      text: `${told}${problem === undefined ? '' : ` (${problem})`}`,
    };
  }

  // The database keeps the master passcode's slow hash, and no file does (ADR-281).
  private async masterPasscodeCheck(): Promise<Check> {
    const earlier = this.ownerEnv.exists() && this.ownerEnv.read()[passcodeKey] !== undefined;
    let version = '';
    let problem: string | undefined;
    try {
      const kept = await this.masterPasscode();
      if (kept === undefined) {
        problem = earlier
          ? 'still in packages/db/.env: `pnpm installer` moves it'
          : 'none kept: `pnpm installer` asks for it';
      } else if (!kept.argon2id) {
        problem = 'what is kept is not an Argon2id hash';
      } else {
        version = `, version ${String(kept.version)}`;
        if (earlier) problem = 'a copy is still in packages/db/.env: `pnpm installer` removes it';
      }
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    return {
      ok: problem === undefined,
      text: `the master passcode's slow hash is kept in the database alone (Argon2id${version})${problem === undefined ? '' : ` (${problem})`}`,
    };
  }

  private report(checks: Check[]): boolean {
    for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.text}`);
    return checks.every((check) => check.ok);
  }

  // --- helpers ------------------------------------------------------------------------------

  // The local stack's administrator connection; brings the stack up first when asked to.
  private async administer(bringUp: boolean): Promise<Database> {
    if (bringUp && !(await this.stackAnswers())) {
      console.log('Starting the local stack (pnpm local:up):');
      const result = spawnSync(
        process.execPath,
        [join(this.root, 'infra/local/src/index.ts'), 'up'],
        {
          stdio: 'inherit',
        },
      );
      if (result.status !== 0) throw new Error('The local stack did not start. Stopped.');
    }
    const password = this.stackEnv.exists() ? this.stackEnv.read()['POSTGRES_PASSWORD'] : undefined;
    if (password === undefined) throw new Error('The local stack has no infra/local/.env yet.');
    return Database.administer(this.server(), password);
  }

  private async stackAnswers(): Promise<boolean> {
    if (!this.stackEnv.exists()) return false;
    try {
      await (await this.administer(false)).close();
      return true;
    } catch {
      return false;
    }
  }

  private server(): Server {
    const port = this.stackEnv.exists() ? this.stackEnv.read()['ADMS_PG_PORT'] : undefined;
    return { host, port: Number(port ?? '55432') };
  }

  private password(login: Login): string {
    const url = login.file.read()[login.key];
    if (url === undefined)
      throw new Error(`${this.relative(login.file.path)} has no ${login.key}.`);
    return decodeURIComponent(new URL(url).password);
  }

  // The login's statement timeout: its service's own value when its env file states one,
  // otherwise the release's (ADR-395).
  private timeoutFor(login: Login): number {
    return new StatementTimeout(this.policyEnv.read()).for(
      login.file.exists() ? login.file.read() : {},
      this.relative(login.file.path),
    );
  }

  private logInProblem(login: Login): Promise<string | undefined> {
    const url = new URL(login.file.read()[login.key] ?? 'postgresql://missing');
    return Database.logInProblem(
      { host: url.hostname, port: Number(url.port) },
      login.role,
      decodeURIComponent(url.password),
      url.pathname.slice(1),
    );
  }

  // Asked as adms_owner, the login that runs the migrations.
  private guardGaps(): Promise<string[]> {
    const url = new URL(this.ownerEnv.read()['DATABASE_URL'] ?? 'postgresql://missing');
    return Database.guardGaps(
      { host: url.hostname, port: Number(url.port) },
      'adms_owner',
      decodeURIComponent(url.password),
      url.pathname.slice(1),
    );
  }

  // Asked as adms_owner too (ADR-276).
  private seededActorProblem(seeded: SeededActor): Promise<string | undefined> {
    const url = new URL(this.ownerEnv.read()['DATABASE_URL'] ?? 'postgresql://missing');
    return Database.seededActorProblem(
      { host: url.hostname, port: Number(url.port) },
      'adms_owner',
      decodeURIComponent(url.password),
      url.pathname.slice(1),
      seeded,
    );
  }

  // Asked as adms_owner too (ADR-281): the current version, never the hash itself.
  private masterPasscode(): Promise<{ version: number; argon2id: boolean } | undefined> {
    const url = new URL(this.ownerEnv.read()['DATABASE_URL'] ?? 'postgresql://missing');
    return Database.masterPasscode(
      { host: url.hostname, port: Number(url.port) },
      'adms_owner',
      decodeURIComponent(url.password),
      url.pathname.slice(1),
    );
  }

  // The Prisma CLI in packages/db, whose config reads adms_owner's URL from packages/db/.env; a
  // DATABASE_URL in this process's environment is left out so it can't redirect a migration.
  // Prisma never prints a password; any connection URL in its output is cut out all the same.
  // `more` is handed to the command's own environment (the seed's hash), and to nothing else.
  private prisma(
    args: string[],
    more: Record<string, string> = {},
  ): { status: number; output: string } {
    const env = { ...process.env, ...more };
    delete env['DATABASE_URL'];
    const folder = join(this.root, 'packages/db');
    const result = spawnSync(
      process.execPath,
      [join(folder, 'node_modules/prisma/build/index.js'), ...args],
      { cwd: folder, env, encoding: 'utf8' },
    );
    // Prisma's notices go to stderr and its verdict last on stdout, so the verdict stays last.
    const output = `${result.stderr}${result.stdout}`
      .replace(/postgres(ql)?:\/\/\S+/g, '<connection URL>')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('Loaded Prisma config'))
      .map((line) => `  ${line}`)
      .join('\n');
    return { status: result.status ?? 1, output };
  }

  private async confirm(question: string): Promise<boolean> {
    if (this.yes) {
      console.log(`${question} yes (--yes)`);
      return true;
    }
    return this.questions().confirm(question);
  }

  private questions(): Interview {
    this.interview ??= new Interview();
    return this.interview;
  }

  private relative(path: string): string {
    return path.slice(this.root.length + 1);
  }
}
