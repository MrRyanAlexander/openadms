// The local stack's helper (ARCHITECTURE §4; BACKLOG 0.2.3; ADR-263). Run from the root:
//   pnpm start         the one command: `pnpm installer` (its questions on a first run, a check
//                      and a resume after), then `pnpm local:up`, then where each part answers
//   pnpm local:up      generate the dev passwords if missing, fetch the map extract if missing and
//                      check it against its pinned SHA-256, make the stack's root and each
//                      service's certificate where one is missing or ending (ADR-517), build the
//                      field app's browser build (ADR-565) and the back office, start every service, wait until all
//                      are healthy, make the object store's media bucket if it isn't there and
//                      see that it keeps versions (ADR-480), check each page over HTTPS;
//                      then, once `pnpm installer` has made the API's settings, build the API,
//                      start its container afresh and check its health answer over HTTPS (ADR-385),
//                      and the same for the worker, whose health answer is asked inside its own
//                      container (ADR-419); a container still running exactly what was just
//                      built, under the settings it was started with, is kept as it is (ADR-448)
//   pnpm local:down    stop and remove the containers and network; data volumes are kept
//   pnpm local:wipe    down, plus the data volumes, the generated .env and the certificates;
//                      the downloaded map extract (public data, infra/local/.cache/) is kept
//   pnpm local:status  list the services and their health
// Node 24 runs this file as-is (type stripping), so it uses erasable TypeScript only.
// It never prints a password or key (ARCHITECTURE §4).
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { StackAuthority, type Made } from './certificates.ts';
import { MapExtract } from './map-extract.ts';

const project = 'open-adms-local';
// The API's and the worker's containers are each in a profile of their own: they exist only once
// the installer has run.
const withApi = ['--profile', 'api'];
const withWorker = ['--profile', 'worker'];
const withServices = [...withApi, ...withWorker];
// What the worker's settings must name before it can start (apps/worker/src/process/settings.ts).
const workerMapKeys = ['ADMS_ROUTING_URL', 'ADMS_ADDRESSES_URL'];
// And the API's, for a phone's address lookup (apps/api/src/process/settings.ts; ADR-455).
const apiMapKeys = ['ADMS_ADDRESSES_URL'];
// And what its settings must name of the object store it keeps files in (ADR-480).
const apiMediaKeys = [
  'ADMS_MEDIA_URL',
  'ADMS_MEDIA_BUCKET',
  'ADMS_MEDIA_REGION',
  'ADMS_MEDIA_ACCESS_KEY',
  'ADMS_MEDIA_SECRET_KEY',
];
// The one bucket the API keeps files in (ARCHITECTURE §11). compose.yaml's policy for the API's
// identity names it, and the installer writes it into the API's settings: both ask here.
const mediaBucket = 'adms-media';
// Who the API is at the object store, and the one policy it holds there (compose.yaml).
const apiIdentity = 'open-adms-api';
const apiPolicy = 'open-adms-media-write-once';
// What each service's container runs, from this checkout (compose.yaml mounts the same): the
// built code and the files read beside it. Its dependencies are the lockfile's.
const runs = {
  api: [
    'apps/api/dist',
    'packages/contracts/dist',
    'packages/db/dist',
    'packages/domain/dist',
    'packages/domain/policy.env',
    'packages/domain/breached-passwords.txt',
    'packages/receipts/dist',
    'pnpm-lock.yaml',
    'infra/local/compose.yaml',
    'infra/local/.generated/caddy-root.crt',
    'infra/local/.generated/tls/api.crt',
    'infra/local/.generated/tls/api.key',
  ],
  worker: [
    'apps/worker/dist',
    'packages/db/dist',
    'packages/domain/dist',
    'packages/domain/policy.env',
    'pnpm-lock.yaml',
    'infra/local/compose.yaml',
    'infra/local/.generated/caddy-root.crt',
  ],
} as const;
type Service = keyof typeof runs;
// Which services read which certificate when they start (compose.yaml): one made afresh is read
// only by a container started afresh. The API's and the worker's are made afresh by `started`
// below, which reads their certificates among what they run.
const readsCertificate: Readonly<Record<string, readonly string[]>> = {
  postgres: ['postgres'],
  objectstore: ['objectstore-tls'],
  mail: ['mail'],
  routing: ['routing-tls'],
  addresses: ['addresses'],
};
const holdsRoot = ['caddy', 'objectstore-tls', 'addresses', 'routing-tls'];

class DevSecrets {
  // Each made once: the database administrator's password, the object store's administrator
  // (the stack's own, which makes the bucket), and the identity the API uses at the object
  // store, which may put and get an object in the media bucket and nothing else (ADR-480).
  private readonly made: readonly (readonly [string, () => string])[] = [
    ['POSTGRES_PASSWORD', () => randomBytes(32).toString('base64url')],
    ['S3_ACCESS_KEY', () => this.accessKey()],
    ['S3_SECRET_KEY', () => randomBytes(30).toString('base64url')],
    ['S3_API_ACCESS_KEY', () => this.accessKey()],
    ['S3_API_SECRET_KEY', () => randomBytes(30).toString('base64url')],
  ];

  // Generated once, into a git-ignored file readable only by its owner.
  generate(): string {
    return [
      '# Open ADMS local stack: dev passwords, generated by `pnpm local:up` (ADR-263).',
      '# Git-ignored. Never commit, print or share. `pnpm local:wipe` deletes it with the data.',
      ...this.made.map(([key, make]) => `${key}=${make()}`),
      '',
    ].join('\n');
  }

  // For a file made before a later secret was needed: the lines for the keys it doesn't state
  // yet, to be added at its end. Only the keys already there are read, never a value.
  missingFrom(stated: readonly string[]): { keys: string[]; lines: string } {
    const missing = this.made.filter(([key]) => !stated.includes(key));
    return {
      keys: missing.map(([key]) => key),
      lines: missing.map(([key, make]) => `${key}=${make()}\n`).join(''),
    };
  }

  private accessKey(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 20 }, () => alphabet[randomInt(alphabet.length)]).join('');
  }
}

class LocalStack {
  readonly root: string;
  readonly envFile: string;
  readonly generated: string;
  readonly rootCert: string;
  readonly authority: StackAuthority;
  readonly map: MapExtract;
  // The repository's root, and the API's own settings, written by `pnpm installer`.
  readonly repository: string;
  readonly apiEnvFile: string;
  readonly workerEnvFile: string;
  private generatedClient = false;

  constructor(root: string) {
    this.root = root;
    this.envFile = join(root, '.env');
    this.generated = join(root, '.generated');
    this.authority = new StackAuthority(this.generated);
    this.rootCert = this.authority.rootCert;
    this.repository = join(root, '..', '..');
    this.apiEnvFile = join(this.repository, 'apps', 'api', '.env');
    this.workerEnvFile = join(this.repository, 'apps', 'worker', '.env');
    this.map = MapExtract.fromSettings((key) => this.setting(key), join(root, '.cache', 'maps'));
  }

  async up(): Promise<void> {
    this.ensureSecrets();
    await this.ensureMap();
    const made = this.ensureCertificates();
    this.writeStoreIdentities();
    this.writeDatabasePassword();
    this.fieldApp();
    this.backOffice();
    // A first run builds the road tiles and imports the addresses before either server answers.
    const timeout = this.setting('ADMS_UP_TIMEOUT_S') ?? '1800';
    this.compose(['up', '--detach', '--wait', '--wait-timeout', timeout]);
    this.restartFor(made);
    this.ensureStoreIdentities();
    this.ensureMediaBucket();
    await this.checkPage('adms.localhost', '/health');
    await this.checkPage('field.adms.localhost', '/');
    await this.checkPage('office.adms.localhost', '/');
    await this.checkPage('routing.adms.localhost', '/status');
    await this.checkPage('addresses.adms.localhost', '/status');
    await this.api();
    this.worker();
    this.whereEachAnswers();
  }

  // Where each part answers, over HTTPS, once it is up.
  private whereEachAnswers(): void {
    const port = Number(this.setting('ADMS_HTTPS_PORT') ?? '443');
    const at = (hostname: string) => `https://${hostname}${port === 443 ? '' : `:${String(port)}`}`;
    const apiUp = existsSync(this.apiEnvFile);
    console.log('');
    console.log('Open ADMS is up:');
    console.log(`  the back office and the viewer portal  ${at('office.adms.localhost')}`);
    console.log(`  the field app (its browser build)       ${at('field.adms.localhost')}`);
    console.log(
      apiUp
        ? `  the API                                 ${at('api.adms.localhost')}`
        : '  the API and the worker: not yet; run `pnpm installer`, then `pnpm local:up` again',
    );
    console.log('  Trust infra/local/.generated/caddy-root.crt in your browser to open them.');
  }

  down(): void {
    this.compose([...withServices, 'down', '--remove-orphans']);
  }

  wipe(): void {
    this.compose([...withServices, 'down', '--volumes', '--remove-orphans']);
    rmSync(this.envFile, { force: true });
    rmSync(this.generated, { recursive: true, force: true });
    console.log('Removed the data volumes, the generated .env and the stack’s certificates.');
    console.log('Kept the downloaded map extract in infra/local/.cache/maps/ (public data).');
  }

  status(): void {
    this.compose([...withServices, 'ps', '--all']);
  }

  // The field app's browser build (ADR-565), which Caddy serves from the folder it mounts
  // read-only: built before Caddy starts, so that folder is this checkout's and never one Docker
  // makes. It needs no settings: the API it talks to is the stack's own.
  fieldApp(): void {
    console.log('Building the field app (tsc --build, vite build in apps/field) …');
    this.build('pnpm', ['--filter', '@open-adms/field', 'build']);
  }

  // The back office and its viewer portal (ARCHITECTURE §14), built the same way and for the same
  // reason: its folder is this checkout's before Caddy mounts it.
  // Its browser tests' own build too (dist/world, the stories' API its one server), which Caddy
  // serves at office-world.adms.localhost.
  backOffice(): void {
    console.log('Building the back office (tsc --build, vite build in apps/back-office) …');
    this.build('pnpm', ['--filter', '@open-adms/back-office', 'build']);
    this.build('pnpm', ['--filter', '@open-adms/back-office', 'build:world']);
  }

  // `pnpm installer` asks for this alone once it has written the API's settings (the stack is up).
  // The API runs the code as built, so it is built first and its container made afresh: a
  // container left from an earlier `up` would still be running what it loaded then.
  async api(): Promise<void> {
    if (!existsSync(this.apiEnvFile)) {
      console.log('The API waits for `pnpm installer`: it has no settings yet (apps/api/.env).');
      return;
    }
    // An installation made before the API asked the address server: only the keys are read.
    const keys = Object.keys(parseEnv(readFileSync(this.apiEnvFile, 'utf8')));
    if (!apiMapKeys.every((key) => keys.includes(key))) {
      console.log(
        'The API waits for `pnpm installer`: its settings (apps/api/.env) don’t name the address server yet.',
      );
      return;
    }
    // Or before it kept files in the object store.
    if (!apiMediaKeys.every((key) => keys.includes(key))) {
      console.log(
        'The API waits for `pnpm installer`: its settings (apps/api/.env) don’t name the object store yet.',
      );
      return;
    }
    console.log('Building the API (pnpm generate, tsc --build apps/api) …');
    this.generate();
    this.build(join(this.repository, 'node_modules', '.bin', 'tsc'), ['--build', 'apps/api']);
    this.started('api', withApi, this.apiEnvFile);
    await this.checkPage('api.adms.localhost', '/health');
  }

  // `pnpm installer` asks for this alone once the worker's settings name the map servers. As the
  // API: built first, its container made afresh. Its container is healthy once its own health
  // answer is; the answer is then asked for and shown.
  worker(): void {
    const keys = existsSync(this.workerEnvFile)
      ? Object.keys(parseEnv(readFileSync(this.workerEnvFile, 'utf8')))
      : [];
    if (!workerMapKeys.every((key) => keys.includes(key))) {
      console.log(
        'The worker waits for `pnpm installer`: its settings (apps/worker/.env) don’t name the map servers yet.',
      );
      return;
    }
    console.log('Building the worker (pnpm generate, tsc --build apps/worker) …');
    this.generate();
    this.build(join(this.repository, 'node_modules', '.bin', 'tsc'), ['--build', 'apps/worker']);
    this.started('worker', withWorker, this.workerEnvFile);
    this.workerHealth();
  }

  // The worker's health answer, asked inside its own container: it publishes no port.
  workerHealth(): void {
    const result = spawnSync(
      'docker',
      [
        ...this.composeArgs(),
        ...withWorker,
        'exec',
        '--no-TTY',
        'worker',
        'node',
        '-e',
        "fetch('http://127.0.0.1:3001/health').then(async (r) => { console.log(String(r.status) + ' ' + (await r.text())); process.exit(r.ok ? 0 : 1); }, () => process.exit(1))",
      ],
      { encoding: 'utf8', env: this.environment() },
    );
    console.log(
      `the worker’s health answer → ${result.status === 0 ? result.stdout.trim() : 'no answer'}`,
    );
    if (result.status !== 0) process.exitCode = 1;
  }

  // The SHA-256 of the extract the stack's map servers are built from: public, and the
  // installer's to write into the worker's settings.
  mapSha256(): void {
    console.log(this.map.sha256);
  }

  // The bucket the API keeps files in: public, and the installer's to write into the API's
  // settings.
  mediaBucket(): void {
    console.log(mediaBucket);
  }

  // The object store reads who it knows when its container is made, and compose makes no
  // container again for a change to that list alone. Where the store doesn't know the API's
  // identity under its one policy, its container is made afresh: its data is in its volume.
  private ensureStoreIdentities(): void {
    const knows = (): boolean =>
      this.storeShell(['s3.config.show'])
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .some((words) => words[0] === apiIdentity && words.at(-1) === apiPolicy);
    if (knows()) return;
    console.log(
      'Making the object store’s container afresh: it doesn’t know the API’s identity yet.',
    );
    // Its TLS shares its network (compose.yaml), so it is made afresh with it.
    this.compose([
      'up',
      '--detach',
      '--wait',
      '--wait-timeout',
      '120',
      '--force-recreate',
      '--no-deps',
      'objectstore',
      'objectstore-tls',
    ]);
    if (!knows()) {
      throw new Error(
        `The object store does not know ${apiIdentity} under the policy ${apiPolicy}.`,
      );
    }
  }

  // The media bucket, made once by the object store's own administration and never by the API,
  // whose identity can make no bucket (ADR-480). It keeps every version of an object
  // (ARCHITECTURE §4, Backups), so even a put the API never makes, over a key already there,
  // would lose nothing. Asked for again on every `up`: a bucket already there is left as it is.
  private ensureMediaBucket(): void {
    const listed = this.storeShell([`s3.bucket.list`]);
    const there = listed.split('\n').some((line) => line.trim().split(/\s+/)[0] === mediaBucket);
    if (!there) this.storeShell([`s3.bucket.create -name ${mediaBucket}`]);
    const versioning = (): boolean =>
      /versioning[^\n]*Enabled/i.test(
        this.storeShell([`s3.bucket.versioning -name ${mediaBucket}`]),
      );
    if (!versioning()) this.storeShell([`s3.bucket.versioning -name ${mediaBucket} -enable`]);
    if (!versioning()) {
      throw new Error(`The object store’s bucket ${mediaBucket} does not keep versions.`);
    }
    console.log(
      `${there ? 'Keeping' : 'Made'} the object store’s bucket ${mediaBucket} (it keeps every version).`,
    );
  }

  // The object store's own shell, inside its container: its commands on standard input, what it
  // says taken back. Nothing secret is sent or shown.
  private storeShell(commands: string[]): string {
    const result = spawnSync(
      'docker',
      [...this.composeArgs(), 'exec', '--no-TTY', 'objectstore', 'weed', 'shell'],
      { encoding: 'utf8', input: `${commands.join('\n')}\n`, env: this.environment() },
    );
    if (result.status !== 0) {
      throw new Error(`The object store’s shell failed (exit ${String(result.status)}).`);
    }
    return result.stdout;
  }

  // What compose is told beside infra/local/.env: the map extract's path, name and hash. They
  // reach compose from here, never from a file.
  private environment(): NodeJS.ProcessEnv {
    return { ...process.env, ...this.map.environment() };
  }

  // The Prisma client, made once for one `up`: the API's build and the worker's read the same.
  private generate(): void {
    if (this.generatedClient) return;
    this.build('pnpm', ['generate']);
    this.generatedClient = true;
  }

  // A service's container, running what was just built (ADR-448). A container loads its code
  // when it starts, so one left from an earlier `up` is made afresh, unless it is the very
  // container this helper last started, still running, and what it runs and its settings are
  // byte for byte what they were then: that one is kept. Compose still makes it again by itself
  // where the service's own definition changed.
  private started(service: Service, profile: string[], envFile: string): void {
    const now = this.fingerprint(service, envFile);
    const record = join(this.generated, `${service}.started`);
    const kept = existsSync(record) ? readFileSync(record, 'utf8') : '';
    const running = this.container(service, profile);
    const keep = running !== '' && kept === `${running} ${now}\n`;
    const whose = service === 'api' ? 'API' : 'worker';
    console.log(
      keep
        ? `Keeping the ${whose}’s container: it runs what was just built, under the same settings.`
        : `Starting the ${whose}’s container afresh on what was just built.`,
    );
    rmSync(record, { force: true });
    this.compose([
      ...profile,
      'up',
      '--detach',
      '--wait',
      '--wait-timeout',
      '120',
      ...(keep ? [] : ['--force-recreate']),
      '--no-deps',
      service,
    ]);
    const after = this.container(service, profile);
    if (after === '') return;
    mkdirSync(this.generated, { recursive: true });
    writeFileSync(record, `${after} ${now}\n`, { mode: 0o600 });
  }

  // The id of a service's container while it is running, or ''.
  private container(service: Service, profile: string[]): string {
    const found = spawnSync(
      'docker',
      [...this.composeArgs(), ...profile, 'ps', '--quiet', '--status', 'running', service],
      { encoding: 'utf8', env: this.environment() },
    );
    return found.status === 0 ? found.stdout.trim() : '';
  }

  // One SHA-256 over every file a service's container runs and over its settings file. Only the
  // hash leaves this function: nothing of a file's content is kept or printed.
  private fingerprint(service: Service, envFile: string): string {
    const hash = createHash('sha256');
    const add = (path: string): void => {
      hash.update(`${path}\0`);
      hash.update(createHash('sha256').update(readFileSync(path)).digest());
    };
    const walk = (path: string): void => {
      const entries = readdirSync(path, { withFileTypes: true }).sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      );
      for (const entry of entries) {
        const inside = join(path, entry.name);
        if (entry.isDirectory()) walk(inside);
        else if (entry.isFile()) add(inside);
      }
    };
    for (const relative of runs[service]) {
      const path = join(this.repository, relative);
      if (!existsSync(path)) hash.update(`${relative}\0missing\0`);
      else if (relative.endsWith('/dist')) walk(path);
      else add(path);
    }
    add(envFile);
    return hash.digest('hex');
  }

  private build(command: string, args: string[]): void {
    const result = spawnSync(command, args, { cwd: this.repository, stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error(`${args.join(' ')} failed (exit ${String(result.status)}).`);
    }
  }

  // A first run generates the passwords. If the data volumes outlived their .env, the passwords
  // that opened them are gone: stop rather than make new ones that won't match. A file made
  // before a later secret was needed gains it at its end, every line already there left as it
  // was: the object store reads its identities afresh each time its container is made.
  private ensureSecrets(): void {
    if (existsSync(this.envFile)) {
      console.log('Keeping the dev passwords in infra/local/.env.');
      const text = readFileSync(this.envFile, 'utf8');
      const missing = new DevSecrets().missingFrom(Object.keys(parseEnv(text)));
      if (missing.keys.length > 0) {
        appendFileSync(this.envFile, `${text.endsWith('\n') ? '' : '\n'}${missing.lines}`);
        console.log(`Added to infra/local/.env: ${missing.keys.join(', ')}.`);
      }
      return;
    }
    if (this.volumes().length > 0) {
      throw new Error(
        'infra/local/.env is missing but the data volumes exist. Run `pnpm local:wipe` to start fresh.',
      );
    }
    writeFileSync(this.envFile, new DevSecrets().generate(), { mode: 0o600, flag: 'wx' });
    console.log('Generated new dev passwords into infra/local/.env (git-ignored, mode 0600).');
  }

  // The routing and address servers read one map extract; it is downloaded once and checked
  // against its pinned SHA-256 every time (REQ-022, ADR-282).
  private async ensureMap(): Promise<void> {
    if (!existsSync(this.map.file)) {
      console.log(`Downloading the map extract ${this.map.name} into infra/local/.cache/maps/ …`);
    }
    const did = await this.map.ensure();
    console.log(
      did === 'kept'
        ? `Keeping the map extract ${this.map.name} (SHA-256 matches its pin).`
        : `Downloaded the map extract ${this.map.name} (SHA-256 matches its pin).`,
    );
    console.log('A first run builds the road tiles and imports the addresses: a few minutes.');
  }

  private volumes(): string[] {
    const found = this.run('docker', [
      'volume',
      'ls',
      '--quiet',
      '--filter',
      `label=com.docker.compose.project=${project}`,
    ]);
    return found.split('\n').filter((name) => name !== '');
  }

  // The stack's root and each service's certificate, made where one is missing, isn't the root's
  // or is ending (certificates.ts; ADR-517). The root is public: browsers and curl are given it.
  private ensureCertificates(): Made {
    const made = this.authority.ensure();
    console.log(
      made.root === 'made'
        ? 'Made the stack’s root and every service’s certificate (infra/local/.generated/).'
        : made.leaves.length === 0
          ? 'Keeping the stack’s root and every service’s certificate.'
          : `Keeping the stack’s root; made the certificates of ${made.leaves.join(', ')}.`,
    );
    console.log('The stack’s root certificate: infra/local/.generated/caddy-root.crt');
    return made;
  }

  // A container reads its certificate when it starts: one already running when its certificate
  // was made afresh is made again. `up` makes again by itself only a container whose definition
  // changed.
  private restartFor(made: Made): void {
    const services = new Set<string>(
      made.root === 'made'
        ? [...Object.values(readsCertificate).flat(), ...holdsRoot]
        : made.leaves.flatMap((leaf) => readsCertificate[leaf] ?? []),
    );
    if (services.size === 0) return;
    console.log(`Starting afresh on their new certificates: ${[...services].join(', ')}.`);
    this.compose([
      'up',
      '--detach',
      '--wait',
      '--wait-timeout',
      '300',
      '--force-recreate',
      '--no-deps',
      ...services,
    ]);
  }

  // Who the object store knows (ADR-263, 480), written from infra/local/.env into a file readable
  // by its owner alone and mounted read-only (the store's root filesystem is read-only, so compose
  // can't copy a config into it). `open-adms-local` is the stack's own administrator: `pnpm
  // local:up` makes the media bucket through the store's own shell, and a test tidies up as it.
  // `open-adms-api` is the identity the API uses: it may put and get an object in the media bucket
  // and nothing else. It can delete no object and no bucket, make no bucket, list nothing and
  // change no bucket's settings (apps/api/test/media-store.test.ts). Written only when it changed;
  // nothing of it is printed.
  private writeStoreIdentities(): void {
    const secrets = parseEnv(readFileSync(this.envFile, 'utf8'));
    const value = (key: string): string => {
      const found = secrets[key];
      if (found === undefined) throw new Error(`infra/local/.env has no ${key}.`);
      return found;
    };
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
          name: 'open-adms-local',
          credentials: [{ accessKey: value('S3_ACCESS_KEY'), secretKey: value('S3_SECRET_KEY') }],
          actions: ['Admin', 'Read', 'List', 'Tagging', 'Write'],
        },
        {
          name: apiIdentity,
          credentials: [
            { accessKey: value('S3_API_ACCESS_KEY'), secretKey: value('S3_API_SECRET_KEY') },
          ],
          policyNames: [apiPolicy],
        },
      ],
      policies: [{ name: apiPolicy, content: JSON.stringify(policy) }],
    };
    this.writeOwn('objectstore/s3.json', `${JSON.stringify(identities, null, 2)}\n`);
  }

  // The database administrator's password, which Postgres's image reads to set a new database up
  // (compose.yaml, `postgres_password`): from infra/local/.env, readable by its owner alone.
  private writeDatabasePassword(): void {
    const password = parseEnv(readFileSync(this.envFile, 'utf8'))['POSTGRES_PASSWORD'];
    if (password === undefined) throw new Error('infra/local/.env has no POSTGRES_PASSWORD.');
    this.writeOwn('postgres/password', password);
  }

  // A file under .generated/ readable by its owner alone, written only when it changed.
  private writeOwn(relative: string, text: string): void {
    const file = join(this.generated, relative);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    if (existsSync(file) && readFileSync(file, 'utf8') === text) return;
    writeFileSync(file, text, { mode: 0o600 });
  }

  // Over HTTPS, verified against Caddy's own root: the stack's health page and each map server.
  private async checkPage(hostname: string, path: string): Promise<void> {
    const port = Number(this.setting('ADMS_HTTPS_PORT') ?? '443');
    const url = `https://${hostname}${port === 443 ? '' : `:${String(port)}`}${path}`;
    const { status, body } = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port,
            path,
            servername: hostname,
            headers: { host: hostname },
            ca: readFileSync(this.rootCert),
          },
          (res) => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => (text += chunk));
            res.on('end', () => {
              resolve({ status: res.statusCode ?? 0, body: text });
            });
          },
        );
        req.on('error', reject);
        req.end();
      },
    );
    // A page's answer is HTML over several lines: shown on one.
    const shown = body.replace(/\s+/g, ' ').trim();
    console.log(
      `${url} → ${String(status)} ${shown.length > 60 ? `${shown.slice(0, 60)}…` : shown}`,
    );
    if (status !== 200) process.exitCode = 1;
  }

  // Non-secret settings (ports, the map extract) from the environment or infra/local/.env.
  private setting(key: string): string | undefined {
    if (process.env[key] !== undefined) return process.env[key];
    if (!existsSync(this.envFile)) return undefined;
    const line = readFileSync(this.envFile, 'utf8')
      .split('\n')
      .find((entry) => entry.startsWith(`${key}=`));
    return line?.slice(key.length + 1);
  }

  private compose(args: string[]): void {
    const result = spawnSync('docker', [...this.composeArgs(), ...args], {
      stdio: 'inherit',
      env: this.environment(),
    });
    if (result.status !== 0) {
      const what =
        args.find((arg) => !arg.startsWith('--') && arg !== 'api' && arg !== 'worker') ?? '';
      throw new Error(`docker compose ${what} failed (exit ${String(result.status)}).`);
    }
  }

  private composeArgs(): string[] {
    return ['compose', '--project-directory', this.root, '--file', join(this.root, 'compose.yaml')];
  }

  private run(command: string, args: string[]): string {
    const result = spawnSync(command, args, { encoding: 'utf8' });
    if (result.status !== 0)
      throw new Error(`${command} ${args[0] ?? ''} failed: ${result.stderr}`);
    return result.stdout;
  }
}

// src/ or dist/, the stack's folder is one up.
const folder = join(dirname(fileURLToPath(import.meta.url)), '..');
const commands: Record<string, (stack: LocalStack) => Promise<void> | void> = {
  up: (stack) => stack.up(),
  api: (stack) => stack.api(),
  worker: (stack) => {
    stack.worker();
  },
  'worker-health': (stack) => {
    stack.workerHealth();
  },
  'map-sha256': (stack) => {
    stack.mapSha256();
  },
  'media-bucket': (stack) => {
    stack.mediaBucket();
  },
  down: (stack) => {
    stack.down();
  },
  wipe: (stack) => {
    stack.wipe();
  },
  status: (stack) => {
    stack.status();
  },
};

const command = commands[process.argv[2] ?? ''];
if (command === undefined) {
  console.error('Usage: node infra/local/src/index.ts up|down|wipe|status');
  process.exitCode = 2;
} else {
  try {
    await command(new LocalStack(folder));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
