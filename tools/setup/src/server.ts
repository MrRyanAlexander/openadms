// The installer's server mode: Open ADMS on a firm's own server (the user, 2026-10-23: "Firms are
// installing it on a server somewhere and then getting back the URLs they need to use it";
// agent_store/BUILD.md, Settled 11). It runs inside the `setup` image (infra/server/Dockerfile),
// on the server's compose network, started by `./adms` (never by hand), with every volume of
// the installation mounted under /adms. The server needs Docker alone.
//
//   server prepare   the installation's secrets (made once, never again) and its own root and each
//                    service's certificate (made where missing or ending), each placed in the
//                    volume of the one service that reads it, owned by the user that service runs
//                    as. No question. Exit 3 when a certificate was made afresh on an installed
//                    server, so `./adms start` starts the services again on it.
//   server install   the firm's answers (its names, its domain, its certificates, its email, its
//                    map region, its master passcode); the database's logins, the database, the
//                    migrations, the guards and the seed; the map extract downloaded and pinned by
//                    its SHA-256; the API's and the worker's settings. Starts with no data: no
//                    sample, no test database, no dev account (the user: production "data starts
//                    out empty with the firms answers populating the platform with their
//                    whitelabel"). The first admin is made after it, by the API's own command.
//   server site      the installation's non-secret settings, for `./adms` to keep as compose's .env
//   server check     every part asked over the network, line by line, then the firm's addresses
//
// It never prints a secret, a hash or a connection URL, as the local installer never does.
// Node 24 runs this file as-is (type stripping), so it uses erasable TypeScript only.
import { spawnSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import {
  chmodSync,
  chownSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { request, type RequestOptions } from 'node:https';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { askBrandName } from './brand.ts';
import { Database, loginRoles, type LoginRole, type Server } from './database.ts';
import { EnvFile, InstallationState } from './files.ts';
import { Interview } from './interview.ts';
import { passcodeLengths, StatementTimeout } from './policy.ts';
import { BreachedList, PasscodeHasher, SecretMaker } from './secrets.ts';

// Where each volume is mounted in the setup container (infra/server/compose.yaml, `setup`). In
// its own service each is mounted at /run/adms, so a path written into a service's settings
// starts there.
const mounted = '/adms';
const state = join(mounted, 'state');
const maps = join(mounted, 'maps');
// Each service's own volume, and the user its container runs as (compose.yaml), who owns it.
const services = {
  postgres: { owner: 999, leaf: 'postgres' },
  objectstore: { owner: 1000, leaf: 'objectstore' },
  routing: { owner: 1000, leaf: 'routing' },
  // Nominatim's image makes its own user at its start: its volume is readable inside it alone.
  addresses: { owner: 0, leaf: 'addresses' },
  api: { owner: 1000, leaf: 'api' },
  worker: { owner: 1000, leaf: undefined },
  caddy: { owner: 1000, leaf: undefined },
} as const;
type Service = keyof typeof services;
const inService = '/run/adms';
const rootInService = `${inService}/tls/root.crt`;
const databaseName = 'adms';
// The logins a service runs as, each under the release's statement timeout (ADR-394).
const timed: readonly LoginRole[] = ['adms_api', 'adms_worker', 'adms_readonly'];
// Caddy's fixed address on the installation's network (compose.yaml): the one proxy the API
// believes about a caller's address (ADR-416).
const proxy = '172.30.214.2';
const mediaBucket = 'adms-media';
// The map extract a firm is offered when it names none: the release's pinned one (Delaware,
// standing in for the example world's Bayline County), a small region to try it with.
const exampleExtract = 'https://download.geofabrik.de/north-america/us/delaware-260101.osm.pbf';
const secretKeys = [
  'POSTGRES_PASSWORD',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_API_ACCESS_KEY',
  'S3_API_SECRET_KEY',
  'ADMS_OWNER_PASSWORD',
  'ADMS_API_PASSWORD',
  'ADMS_WORKER_PASSWORD',
  'ADMS_READONLY_PASSWORD',
  'ADMS_TOKEN_SIGNING_SECRET',
  'ADMS_PASSWORD_KEY',
  'ADMS_SEALING_KEY',
] as const;
const loginPassword: Readonly<Record<LoginRole, (typeof secretKeys)[number]>> = {
  adms_owner: 'ADMS_OWNER_PASSWORD',
  adms_api: 'ADMS_API_PASSWORD',
  adms_worker: 'ADMS_WORKER_PASSWORD',
  adms_readonly: 'ADMS_READONLY_PASSWORD',
};

interface Answers {
  firm: string;
  brand: string;
  domain: string;
  tls: 'acme' | 'own';
  acmeEmail: string;
  smtpUrl: string;
  mailFrom: string;
  mapUrl: string;
  passcode: string;
}

interface Check {
  ok: boolean;
  text: string;
}

export class ServerInstall {
  private readonly root: string;
  private readonly secrets = new EnvFile(join(state, 'secrets.env'));
  private readonly site = new EnvFile(join(state, 'site.env'));
  private readonly record = new InstallationState(join(state, 'installation.json'));
  private readonly authority = join(state, 'authority');

  constructor(root: string) {
    this.root = root;
  }

  async run(command: string | undefined): Promise<number> {
    if (command === 'prepare') return this.prepare();
    if (command === 'install') return this.install();
    if (command === 'site') return this.printSite();
    if (command === 'check') return (await this.check()) ? 0 : 1;
    console.error('Usage: node tools/setup/src/index.ts server prepare|install|site|check');
    return 2;
  }

  // --- prepare -------------------------------------------------------------------------------

  private prepare(): number {
    mkdirSync(state, { recursive: true, mode: 0o700 });
    this.ensureSecrets();
    const made = this.ensureCertificates();
    for (const service of Object.keys(services) as Service[]) this.place(service);
    this.placePostgresPassword();
    this.placeStoreIdentities();
    this.placeCaddyRoot();
    const renewed = made.root === 'made' || made.leaves.length > 0;
    console.log(
      made.root === 'made'
        ? 'Made the installation’s own root and every service’s certificate.'
        : made.leaves.length === 0
          ? 'Keeping the installation’s root and every service’s certificate.'
          : `Keeping the installation’s root; made the certificates of ${made.leaves.join(', ')}.`,
    );
    return renewed && this.record.exists() ? 3 : 0;
  }

  // Each secret made once, into a file in the setup's own volume, readable by its owner alone; a
  // later prepare adds only a key a later release needs, never replacing one.
  private ensureSecrets(): void {
    const maker = new SecretMaker();
    const value = (key: (typeof secretKeys)[number]): string =>
      key === 'S3_ACCESS_KEY' || key === 'S3_API_ACCESS_KEY' ? accessKey() : maker.password();
    if (!this.secrets.exists()) {
      this.secrets.create(
        [
          'Open ADMS on this server: its secrets, made once by `./adms install` (never again).',
          'Never commit, print or share it.',
        ],
        secretKeys.map((key): [string, string] => [key, value(key)]),
      );
      console.log('+ made the installation’s secrets (kept in its setup volume, mode 0600)');
      return;
    }
    const added = this.secrets.add(
      secretKeys
        .filter((key) => this.secrets.read()[key] === undefined)
        .map((key): [string, string] => [key, value(key)]),
    );
    if (added.length > 0) console.log(`+ added the secrets ${added.join(', ')}`);
  }

  private secret(key: (typeof secretKeys)[number]): string {
    const found = this.secrets.read()[key];
    if (found === undefined) throw new Error(`The installation's secret ${key} is missing.`);
    return found;
  }

  private ensureCertificates(): { root: 'made' | 'kept'; leaves: string[] } {
    const leaves = Object.values(services).flatMap(({ leaf }) =>
      leaf === undefined ? [] : [leaf],
    );
    const result = spawnSync(
      process.execPath,
      [join(this.root, 'infra/local/src/authority-cli.ts'), this.authority, ...leaves],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error('The installation’s certificates were not made.');
    return JSON.parse(result.stdout.trim()) as { root: 'made' | 'kept'; leaves: string[] };
  }

  // A service's volume: its folder its own user's alone, the root (public) and its own
  // certificate and key in tls/.
  private place(service: Service): void {
    const { owner, leaf } = services[service];
    const folder = join(mounted, service);
    const open = owner === 0 ? 0o755 : 0o700;
    this.folder(folder, owner, open);
    this.folder(join(folder, 'tls'), owner, open);
    this.file(join(this.authority, 'caddy-root.crt'), join(folder, 'tls/root.crt'), owner, 0o644);
    if (leaf === undefined) return;
    const tls = join(this.authority, 'tls');
    this.file(join(tls, `${leaf}.crt`), join(folder, `tls/${leaf}.crt`), owner, 0o644);
    this.file(
      join(tls, `${leaf}.key`),
      join(folder, `tls/${leaf}.key`),
      owner,
      owner === 0 ? 0o644 : 0o600,
    );
  }

  // What the database's image reads once, to set a new database up.
  private placePostgresPassword(): void {
    this.text(join(mounted, 'postgres/password'), this.secret('POSTGRES_PASSWORD'), 999, 0o600);
  }

  // Who the object store knows: its own administrator (which makes the bucket) and the API, which
  // may put and get an object in the media bucket and nothing else (ADR-480), as on the local
  // stack (infra/local/src/index.ts).
  private placeStoreIdentities(): void {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:PutObject', 's3:GetObject'],
          Resource: [`arn:aws:s3:::${mediaBucket}/*`],
        },
      ],
    };
    const identities = {
      identities: [
        {
          name: 'open-adms-server',
          credentials: [
            { accessKey: this.secret('S3_ACCESS_KEY'), secretKey: this.secret('S3_SECRET_KEY') },
          ],
          actions: ['Admin', 'Read', 'List', 'Tagging', 'Write'],
        },
        {
          name: 'open-adms-api',
          credentials: [
            {
              accessKey: this.secret('S3_API_ACCESS_KEY'),
              secretKey: this.secret('S3_API_SECRET_KEY'),
            },
          ],
          policyNames: ['open-adms-media-write-once'],
        },
      ],
      policies: [{ name: 'open-adms-media-write-once', content: JSON.stringify(policy) }],
    };
    this.text(
      join(mounted, 'objectstore/s3.json'),
      `${JSON.stringify(identities, null, 2)}\n`,
      1000,
      0o600,
    );
  }

  // Where the firm's server has no public name, Caddy issues its addresses' certificates from the
  // installation's own root, as the local stack's does: only then does it hold the root's key.
  private placeCaddyRoot(): void {
    const key = join(mounted, 'caddy/tls/root.key');
    if (this.site.exists() && this.site.read()['ADMS_TLS_MODE'] === 'own') {
      this.file(join(this.authority, 'tls/root.key'), key, 1000, 0o600);
    } else {
      rmSync(key, { force: true });
    }
  }

  // --- install -------------------------------------------------------------------------------

  private async install(): Promise<number> {
    if (this.record.exists()) {
      console.log('This server is installed already: `./adms start` starts it.');
      return 1;
    }
    const interview = new Interview();
    let answers: Answers | undefined;
    try {
      answers = await this.questions(interview);
    } finally {
      interview.close();
    }
    if (answers === undefined) {
      console.log('Stopped. Nothing was written.');
      return 1;
    }
    const passcodeHash = await new PasscodeHasher().hash(answers.passcode);
    console.log('');
    await this.database();
    this.migrate();
    await this.requireGuarded();
    this.seed(passcodeHash, answers.brand);
    const map = await this.mapExtract(answers.mapUrl);
    this.writeServiceSettings(answers, map.sha256);
    this.writeSite(answers, map);
    const now = new Date().toISOString();
    this.record.save({
      format: 1,
      firm: answers.firm,
      mail: answers.smtpUrl === '' ? 'none' : 'mail server',
      database: { host: 'postgres', port: 5432, name: databaseName },
      steps: { secrets: now, keys: now, roles: now, database: now },
      createdAt: now,
      updatedAt: now,
    });
    this.placeCaddyRoot();
    console.log(`\nInstalled for ${answers.firm}. Next: its first admin, then every service.`);
    return 0;
  }

  private async questions(interview: Interview): Promise<Answers | undefined> {
    console.log(
      '\nOpen ADMS on this server: seven questions, then I set it up. It starts with no data:\n' +
        'the firm’s own clients, contracts and projects go in through the back office.\n',
    );
    let firm = '';
    while (firm === '')
      firm = await interview.ask('1. The firm that runs this installation (its name)');
    const brand = await askBrandName(
      (question, fallback) => interview.ask(question, fallback),
      firm,
      (line) => {
        console.log(line);
      },
    );
    let domain = '';
    while (!hostname.test(domain)) {
      domain = (
        await interview.ask(
          '3. The domain its people reach it at (it answers at office., field. and api. under it, e.g. adms.yourfirm.com)',
        )
      ).toLowerCase();
    }
    const port = this.port();
    console.log(
      `   Point office.${domain}, field.${domain} and api.${domain} at this server (DNS A or AAAA records).`,
    );
    const publicServer = await interview.confirm(
      '4. Can the internet reach this server at those names, on ports 80 and 443? Then Let’s Encrypt issues its certificates',
    );
    let acmeEmail = '';
    if (publicServer) {
      while (!email.test(acmeEmail)) {
        acmeEmail = await interview.ask('   An address Let’s Encrypt may write to about them');
      }
      if (port.https !== '443' || port.http !== '80') {
        console.log('   Let’s Encrypt asks on ports 80 and 443: this server listens on others.');
      }
    } else {
      console.log(
        '   Its addresses get certificates from the installation’s own root: each browser and phone trusts it once.',
      );
    }
    let smtpUrl = '';
    let mailFrom = '';
    if (await interview.confirm('5. Send email (password resets, the daily report)?')) {
      while (!/^smtps?:\/\/[^\s]+$/.test(smtpUrl)) {
        smtpUrl = await interview.askSecret(
          '   The mail server, as smtps://user:password@host:465 or smtp://user:password@host:587',
        );
      }
      while (!email.test(mailFrom)) {
        mailFrom = await interview.ask('   The address mail comes from', `adms@${domain}`);
      }
    }
    let mapUrl = '';
    while (!/^https:\/\/\S+\.osm\.pbf$/.test(mapUrl)) {
      mapUrl = await interview.ask(
        '6. Map data for the firm’s region, for road miles and addresses: an OpenStreetMap extract (.osm.pbf) from download.geofabrik.de',
        exampleExtract,
      );
    }
    console.log(
      '7. The master passcode: one per firm. It enrols the monitors’ phones and opens the supervisor actions.',
    );
    const passcode = await this.askPasscode(interview);
    console.log(
      `\nFirm: ${firm}\nADMS: ${brand}\nAddresses: https://office.${domain}${port.shown}, https://field.${domain}${port.shown}, https://api.${domain}${port.shown}` +
        `\nCertificates: ${publicServer ? `Let’s Encrypt (${acmeEmail})` : 'the installation’s own root'}` +
        `\nEmail: ${smtpUrl === '' ? 'none' : `sent from ${mailFrom}`}\nMap data: ${basename(mapUrl)}` +
        '\nMaster passcode: set (only its slow hash is kept, in the database)',
    );
    if (!(await interview.confirm(`Set up ${brand} for ${firm} on this server?`))) return undefined;
    return {
      firm,
      brand,
      domain,
      tls: publicServer ? 'acme' : 'own',
      acmeEmail,
      smtpUrl,
      mailFrom,
      mapUrl,
      passcode,
    };
  }

  private async askPasscode(interview: Interview): Promise<string> {
    const hasher = new PasscodeHasher();
    const breached = new BreachedList(
      readFileSync(join(this.root, 'packages/domain/breached-passwords.txt'), 'utf8'),
    );
    const lengths = passcodeLengths(this.policy());
    for (;;) {
      const passcode = await interview.askSecret('   Master passcode');
      const problem = hasher.problem(passcode, lengths, breached);
      if (problem !== undefined) console.log(`   ${problem}`);
      else if ((await interview.askSecret('   Once more')) === passcode) return passcode;
      else console.log('   They differ. Again, please.');
    }
  }

  // The logins, each with its own password and its statement timeout, and the one database,
  // open to the services' logins alone (ARCHITECTURE §5).
  private async database(): Promise<void> {
    const admin = await Database.administer(this.server(), this.secret('POSTGRES_PASSWORD'));
    try {
      for (const role of loginRoles) {
        if (await admin.roleExists(role)) {
          console.log(`✓ login ${role} exists`);
        } else {
          await admin.createRole(role, this.secret(loginPassword[role]));
          console.log(`+ created login ${role}`);
        }
      }
      const timeout = new StatementTimeout(this.policy()).for({}, 'the release');
      for (const role of timed) {
        await admin.setStatementTimeout(role, timeout);
        console.log(`+ a statement of ${role} is stopped after ${String(timeout)} ms`);
      }
      if ((await admin.owner(databaseName)) === undefined) {
        await admin.create(databaseName, timed);
        console.log(
          `+ created database ${databaseName}: owner adms_owner, only the logins connect`,
        );
      }
      if (await admin.publicCanConnect(databaseName)) {
        throw new Error(`Anyone may connect to ${databaseName}. Stopped.`);
      }
    } finally {
      await admin.close();
    }
    for (const role of loginRoles) {
      const problem = await Database.logInProblem(
        this.server(),
        role,
        this.secret(loginPassword[role]),
        databaseName,
      );
      if (problem !== undefined) throw new Error(`${role} can't open ${databaseName}: ${problem}.`);
      console.log(`✓ ${role} opens ${databaseName} with its own password`);
    }
  }

  private migrate(): void {
    console.log('Migrations (prisma migrate deploy, as adms_owner):');
    const { status, output } = this.prisma(['migrate', 'deploy']);
    console.log(output);
    if (status !== 0) throw new Error('The migrations did not apply. Stopped.');
  }

  private async requireGuarded(): Promise<void> {
    const gaps = await Database.guardGaps(
      this.server(),
      'adms_owner',
      this.secret('ADMS_OWNER_PASSWORD'),
      databaseName,
    );
    if (gaps.length > 0) throw new Error(`Unguarded tables:\n  ${gaps.join('\n  ')}\nStopped.`);
    console.log('✓ every table is guarded');
  }

  // The firm's lists, its settings and its name, the system's actors and the master passcode's
  // slow hash (packages/db/src/seed.ts): no sample, no person.
  private seed(passcodeHash: string, brand: string): void {
    console.log('Seed (prisma db seed, as adms_owner):');
    const { status, output } = this.prisma(['db', 'seed'], {
      ADMS_MASTER_PASSCODE_HASH: passcodeHash,
      ADMS_BRAND_NAME: brand,
    });
    console.log(output);
    if (status !== 0) throw new Error('The seed did not finish. Stopped.');
  }

  // The firm's map extract, downloaded once into its own volume and pinned by the SHA-256 it
  // arrived with (REQ-022, ADR-282): the map servers build from it, the worker checks it.
  private async mapExtract(url: string): Promise<{ name: string; sha256: string }> {
    mkdirSync(maps, { recursive: true });
    const file = join(maps, 'region.osm.pbf');
    const name = basename(new URL(url).pathname);
    console.log(`Downloading the map extract ${name} …`);
    const answer = await fetch(url);
    if (!answer.ok || answer.body === null) {
      throw new Error(`The map extract was not downloaded (${String(answer.status)}). Stopped.`);
    }
    const partial = `${file}.part`;
    const hash = createHash('sha256');
    const counted = Readable.fromWeb(answer.body).on('data', (chunk: Buffer) => hash.update(chunk));
    await pipeline(counted, createWriteStream(partial, { mode: 0o644 }));
    renameSync(partial, file);
    const sha256 = hash.digest('hex');
    console.log(
      `✓ ${name}: ${String(Math.round(statSync(file).size / 1_048_576))} MB, SHA-256 ${sha256}`,
    );
    return { name, sha256 };
  }

  // The API's and the worker's settings, each in its own service's volume, readable by its user
  // alone; read by the process itself (ADMS_ENV_FILE), never put in its container's description.
  private writeServiceSettings(answers: Answers, mapSha256: string): void {
    const { shown } = this.port();
    const url = (role: LoginRole): string =>
      `postgresql://${role}:${this.secret(loginPassword[role])}@postgres:5432/${databaseName}?sslmode=verify-full&sslrootcert=${encodeURIComponent(rootInService)}`;
    const header = (who: string): string[] => [
      `Open ADMS on this server: ${who}. Written by \`./adms install\`.`,
      'Never commit, print or share it.',
    ];
    const api = new EnvFile(join(mounted, 'api/api.env'));
    api.create(header('the API'), [
      ['DATABASE_URL', url('adms_api')],
      ['READONLY_DATABASE_URL', url('adms_readonly')],
      ['ADMS_TOKEN_SIGNING_SECRET', this.secret('ADMS_TOKEN_SIGNING_SECRET')],
      ['ADMS_PASSWORD_KEY', this.secret('ADMS_PASSWORD_KEY')],
      ['ADMS_SEALING_KEY', this.secret('ADMS_SEALING_KEY')],
      ['SMTP_URL', answers.smtpUrl],
      ...(answers.mailFrom === ''
        ? []
        : [['ADMS_MAIL_FROM', answers.mailFrom] as [string, string]]),
      ['ADMS_API_TLS_CERT_FILE', `${inService}/tls/api.crt`],
      ['ADMS_API_TLS_KEY_FILE', `${inService}/tls/api.key`],
      [
        'ADMS_CORS_ORIGINS',
        [
          `https://field.${answers.domain}${shown}`,
          'capacitor://localhost',
          'https://localhost',
          `https://office.${answers.domain}${shown}`,
        ].join(','),
      ],
      ['ADMS_TRUSTED_PROXIES', proxy],
      // The map servers and the object store on the installation's own network, over TLS from
      // its root; none of them is reachable from outside it.
      ['ADMS_ADDRESSES_URL', 'https://addresses:8080'],
      ['ADMS_MAP_CA_FILE', rootInService],
      ['ADMS_MEDIA_URL', 'https://objectstore:8333'],
      ['ADMS_MEDIA_BUCKET', mediaBucket],
      ['ADMS_MEDIA_REGION', 'us-east-1'],
      ['ADMS_MEDIA_ACCESS_KEY', this.secret('S3_API_ACCESS_KEY')],
      ['ADMS_MEDIA_SECRET_KEY', this.secret('S3_API_SECRET_KEY')],
      ['ADMS_MEDIA_CA_FILE', rootInService],
    ]);
    owned(api.path, 1000, 0o600);
    const worker = new EnvFile(join(mounted, 'worker/worker.env'));
    worker.create(header('the worker'), [
      ['DATABASE_URL', url('adms_worker')],
      ['ADMS_ROUTING_URL', 'https://routing:8443'],
      ['ADMS_ADDRESSES_URL', 'https://addresses:8080'],
      ['ADMS_MAP_CA_FILE', rootInService],
      ['ADMS_MAP_EXTRACT_SHA256', mapSha256],
    ]);
    owned(worker.path, 1000, 0o600);
    console.log('+ wrote the API’s and the worker’s settings (each in its own volume, mode 0600)');
  }

  // What compose reads beside the server's compose file: names, ports, the certificates' way and
  // the map extract's name and hash. Nothing secret.
  private writeSite(answers: Answers, map: { name: string; sha256: string }): void {
    const port = this.port();
    const api = `https://api.${answers.domain}${port.shown}`;
    this.site.create(
      ['Open ADMS on this server: its non-secret settings, written by `./adms install`.'],
      [
        ['ADMS_FIRM', answers.firm],
        ['ADMS_OFFICE_HOST', `office.${answers.domain}`],
        ['ADMS_FIELD_HOST', `field.${answers.domain}`],
        ['ADMS_API_HOST', `api.${answers.domain}`],
        ['ADMS_OFFICE_API_ORIGIN', api],
        ['ADMS_FIELD_API_ORIGIN', api],
        ['ADMS_BIND', port.bind],
        ['ADMS_HTTPS_PORT', port.https],
        ['ADMS_HTTP_PORT', port.http],
        ['ADMS_TLS_MODE', answers.tls],
        ['ADMS_ACME_EMAIL', answers.acmeEmail === '' ? 'none' : answers.acmeEmail],
        ['ADMS_MAP_NAME', map.name],
        ['ADMS_MAP_SHA256', map.sha256],
      ],
    );
  }

  private printSite(): number {
    if (!this.site.exists()) {
      console.error('Not installed: `./adms install` first.');
      return 1;
    }
    process.stdout.write(readFileSync(this.site.path, 'utf8'));
    return 0;
  }

  // --- check ---------------------------------------------------------------------------------

  private async check(): Promise<boolean> {
    if (!this.record.exists() || !this.site.exists()) {
      console.log('Not installed: `./adms install` first.');
      return false;
    }
    const site = this.site.read();
    const ca = readFileSync(join(this.authority, 'caddy-root.crt'));
    const checks: Check[] = [];
    const problem = await Database.logInProblem(
      this.server(),
      'adms_api',
      this.secret('ADMS_API_PASSWORD'),
      databaseName,
    ).catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    checks.push({
      ok: problem === undefined,
      text: `the database answers, and the API's login opens it${problem === undefined ? '' : ` (${problem})`}`,
    });
    const migrations = this.prisma(['migrate', 'status']);
    checks.push({ ok: migrations.status === 0, text: 'the migrations are at head' });
    const inside = async (host: string, port: number, path: string, what: string) => {
      const status = await asked({ host, port, path, servername: host, ca });
      checks.push({
        ok: status === 200,
        text: `${what} answers over TLS (${String(status || 'no answer')})`,
      });
    };
    await inside('api', 3000, '/health', 'the API');
    await inside('api', 3000, '/readiness', 'the API reaches its database, and');
    await inside('routing', 8443, '/status', 'the routing server');
    await inside('addresses', 8080, '/status', 'the address server');
    const port = Number(site['ADMS_HTTPS_PORT'] ?? '443');
    const shown = port === 443 ? '' : `:${String(port)}`;
    const own = site['ADMS_TLS_MODE'] === 'own';
    for (const [key, path] of [
      ['ADMS_OFFICE_HOST', '/'],
      ['ADMS_FIELD_HOST', '/'],
      ['ADMS_API_HOST', '/health'],
    ] as const) {
      const host = site[key] ?? '';
      const status = await asked({
        host: 'caddy',
        port: 443,
        path,
        servername: host,
        headers: { host: `${host}${shown}` },
        ...(own ? { ca } : {}),
      });
      checks.push({
        ok: status === 200,
        text: `https://${host}${shown} answers (${String(status || 'no answer')})${status === 200 || own ? '' : ': is its DNS record in place, and ports 80 and 443 open? Caddy asks Let’s Encrypt again by itself'}`,
      });
    }
    for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.text}`);
    console.log(`\n${site['ADMS_FIRM'] ?? 'Open ADMS'} on this server:`);
    console.log(
      `  the back office and the viewer portal  https://${site['ADMS_OFFICE_HOST'] ?? ''}${shown}`,
    );
    console.log(
      `  the field app                           https://${site['ADMS_FIELD_HOST'] ?? ''}${shown}`,
    );
    console.log(
      `  the API                                 https://${site['ADMS_API_HOST'] ?? ''}${shown}`,
    );
    console.log(
      `  the licences of what it is built on     https://${site['ADMS_OFFICE_HOST'] ?? ''}${shown}/licences/`,
    );
    if (own) {
      console.log(
        '  Its certificates are from the installation’s own root: `./adms root` prints it, for each browser and phone to trust once.',
      );
    }
    return checks.every((check) => check.ok);
  }

  // --- helpers -------------------------------------------------------------------------------

  private server(): Server {
    return {
      host: 'postgres',
      port: 5432,
      ssl: {
        ca: readFileSync(join(this.authority, 'caddy-root.crt'), 'utf8'),
        rejectUnauthorized: true,
      },
    };
  }

  // Where it listens, as `./adms` was told (its flags), and how a port shows in an address.
  private port(): { bind: string; https: string; http: string; shown: string } {
    const https = process.env['ADMS_HTTPS_PORT'] ?? '443';
    return {
      bind: process.env['ADMS_BIND'] ?? '0.0.0.0',
      https,
      http: process.env['ADMS_HTTP_PORT'] ?? '80',
      shown: https === '443' ? '' : `:${https}`,
    };
  }

  private policy(): Record<string, string> {
    return new EnvFile(join(this.root, 'packages/domain/policy.env')).read();
  }

  private prisma(
    args: string[],
    more: Record<string, string> = {},
  ): { status: number; output: string } {
    const folder = join(this.root, 'packages/db');
    const owner = `postgresql://adms_owner:${this.secret('ADMS_OWNER_PASSWORD')}@postgres:5432/${databaseName}?sslmode=verify-full&sslrootcert=${encodeURIComponent(join(this.authority, 'caddy-root.crt'))}`;
    const result = spawnSync(
      process.execPath,
      [join(folder, 'node_modules/prisma/build/index.js'), ...args],
      {
        cwd: folder,
        // No banner offering another Prisma: the release pins its own.
        env: { ...process.env, DATABASE_URL: owner, PRISMA_HIDE_UPDATE_MESSAGE: '1', ...more },
        encoding: 'utf8',
      },
    );
    const output = `${result.stderr}${result.stdout}`
      .replace(/postgres(ql)?:\/\/\S+/g, '<connection URL>')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('Loaded Prisma config'))
      .map((line) => `  ${line}`)
      .join('\n');
    return { status: result.status ?? 1, output };
  }

  private folder(path: string, owner: number, mode: number): void {
    mkdirSync(path, { recursive: true });
    owned(path, owner, mode);
  }

  private file(from: string, to: string, owner: number, mode: number): void {
    mkdirSync(dirname(to), { recursive: true });
    const next = `${to}.next`;
    copyFileSync(from, next);
    owned(next, owner, mode);
    renameSync(next, to);
  }

  private text(to: string, content: string, owner: number, mode: number): void {
    mkdirSync(dirname(to), { recursive: true });
    if (existsSync(to) && readFileSync(to, 'utf8') === content) return;
    const next = `${to}.next`;
    writeFileSync(next, content, { mode });
    owned(next, owner, mode);
    renameSync(next, to);
  }
}

const hostname =
  /^(?=.{1,200}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// An access key as the object store issues them: twenty capitals and digits.
function accessKey(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 20 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

// Owned by the user the service's container runs as, at the mode given. The setup container runs
// as root to place them; where it can't (a test), the mode alone is set.
function owned(path: string, owner: number, mode: number): void {
  try {
    chownSync(path, owner, owner);
  } catch {
    // Not root: the file stays its maker's.
  }
  chmodSync(path, mode);
}

// An HTTPS request's status, or 0 where nothing answered.
function asked(options: RequestOptions): Promise<number> {
  return new Promise((resolve) => {
    const req = request({ ...options, timeout: 10_000 }, (answer) => {
      answer.resume();
      resolve(answer.statusCode ?? 0);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => {
      resolve(0);
    });
    req.end();
  });
}
