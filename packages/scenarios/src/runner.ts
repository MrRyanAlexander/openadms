// The scenario runner (ARCHITECTURE §15; REQ-017; ADR-275): runs a story on its own database, on
// the story's clock, with simulated phones, and reports each step and each check as it goes. A story
// is told in project time and asserts exact results; a failed check doesn't stop the story, an
// error does. The database is dropped afterwards unless the run keeps it for a person to look at.
import { isDeepStrictEqual } from 'node:util';

import {
  Certifications,
  DeviceKeys,
  Enrolment,
  Intake,
  MasterPasscodeCheck,
  NoMail,
  NumberAllocator,
  PasscodeSessions,
  PasscodeUses,
  PasswordHasher,
  PhoneAssignments,
  OfflineChecks,
  PhoneLists,
  PhoneChallenges,
  PhoneLoginList,
  PhoneMonitors,
  PhoneProofs,
  PhoneSignIns,
  PhoneTokens,
  SessionTokens,
  SetupChoices,
  Sync,
  UnplannedAssignments,
  WrongTries,
  type AssignmentAtSignIn,
  type SetupChoicesRead,
} from '@open-adms/api';
import type { Database, ViewerDatabase } from '@open-adms/db';
import {
  BreachedPasswords,
  MasterPasscodeTries,
  PasscodeSessionRules,
  PasswordRules,
  PhoneProofRules,
  SignInTries,
  type MasterPasscodeSessionKind,
  type Policy,
} from '@open-adms/domain';

import { projectTime, StoryClock } from './clock.ts';
import { SimulatedDevice, type PhoneServer, type PhoneSetup } from './device.ts';
import { builtInPolicy } from './policy.ts';
import { SoftwareKey, type EnrolledPhone } from './software-key.ts';
import { StoryDatabase, storyMasterPasscode, type StoryTemplate } from './story-database.ts';

// The signing secret of a story's API: made up, the same for every story, used nowhere else.
const storySigningSecret = 'made-up-signing-secret-for-the-stories-only';

export interface Story {
  // Its name on the command line, e.g. ticket-101001.
  readonly name: string;
  readonly title: string;
  // The project's time zone: the story is told, and printed, in it.
  readonly timeZone: string;
  // When the story's clock starts, with its offset.
  readonly start: string;
  run(context: StoryContext): Promise<void>;
}

// A field monitor the story created as a real one is: their id, the Monitor ID the database
// issued (their username, so a story reads it and never states it), and the password typed for
// them, by the firm's practice their phone number without the area code (ADR-105).
export interface StoryMonitor {
  readonly id: string;
  readonly monitorNumber: string;
  readonly name: string;
  readonly password: string;
}

export interface StoryContext {
  readonly clock: StoryClock;
  // The services' own clients, on the story's database.
  readonly api: Database;
  readonly worker: Database;
  // The read-only login's way in, for a read-only viewer's reads: `$viewed` alone (ADR-434).
  readonly viewed: ViewerDatabase;
  // The release's policy values, which a new project's settings start from (ADR-303).
  readonly policy: Policy;
  // Where phones sync to (BACKLOG 2.6.2 part 4; ADR-475): the API's own `Sync`, built as its
  // process builds it (apps/api, src/process/api-process.ts), on the story's database and
  // clock. A phone's sync is read by the contract and answered whole: its reports, its
  // records, its numbers, and what a sync brings besides. A photograph's record goes to the
  // intake behind it until its upload is built (2.6.4).
  readonly server: PhoneServer;
  // The same, on another clock: for field days told again on a clock of their own.
  serverOn(clock: { now: () => Date }): PhoneServer;
  // Moves the clock to a time (with its offset) and says what happens then.
  at(time: string, what: string): void;
  phone(setup: PhoneSetup): SimulatedDevice;
  // Enrols a phone as a real one is (ARCHITECTURE §7.1, §7.4; ADR-439, 440): once, under the
  // firm's master passcode, through the API's `Enrolment`, with a device key made in software.
  // `at` is when it was enrolled, where that is not the story's clock now (a phone enrolled the
  // evening before its work is told).
  enrolled(name: string, at?: Date): Promise<EnrolledPhone>;
  // Creates a field monitor as a real one is (ARCHITECTURE §7.0; ADR-442): on that enrolled
  // phone, online, under the firm's master passcode, through the API's `PhoneMonitors`. No story
  // writes a monitor by hand. Asked again by the same name, with or without a phone, it is the
  // monitor already created: a story that carries another on reads its people this way.
  monitor(name: string, onPhone?: string): Promise<StoryMonitor>;
  // The monitor signs in on that enrolled phone, online, with their Monitor ID and password,
  // through the API's `PhoneSignIns` (ADR-443, 444): the assignment the phone takes, or why it
  // took none. A refused sign-in stops the story. `at` is when they sign in, where that is not
  // the story's clock now (field days told again on a clock of their own).
  signedIn(monitor: StoryMonitor, onPhone: string, at?: Date): Promise<AssignmentAtSignIn>;
  // Whoever holds the firm's master passcode, on that enrolled phone with a connection, now by
  // the story's clock: what a setup picks from, read through the API's `SetupChoices`
  // (ADR-463), and a session opened for a monitor through its `PasscodeSessions` (ADR-462).
  // No story states the passcode; a refusal stops the story.
  readonly underPasscode: {
    choices(onPhone: string, projectId: string | null): Promise<SetupChoicesRead>;
    session(
      monitor: StoryMonitor,
      onPhone: string,
      kind: MasterPasscodeSessionKind,
    ): Promise<{ readonly sessionId: string; readonly expiresAt: Date }>;
  };
  // A phone's proof of itself, as its sync begins: the API's `PhoneProofs`, on the story's clock.
  readonly proofs: PhoneProofs;
  // The lists a phone takes for an assignment: the API's `PhoneLists` (task 2.5.3).
  readonly lists: PhoneLists;
  // Asserts an exact result; strict deep equality.
  check(what: string, actual: unknown, expected: unknown): void;
}

export interface StoryResult {
  readonly name: string;
  readonly database: string | undefined;
  readonly passed: number;
  readonly failed: number;
  // Why the story stopped early, if it did.
  readonly error: string | undefined;
}

export interface RunOptions {
  // Keep the story's database afterwards (pnpm scenarios clean drops it).
  readonly keep?: boolean;
  // The run's template (ADR-447): each story's database is a copy of it, so the migrations and
  // the seed run once for the run. Whoever made it drops it. Without one, each story's database
  // is migrated and seeded by itself.
  readonly template?: StoryTemplate;
}

export class Runner {
  private readonly out: (line: string) => void;
  private readonly options: RunOptions;

  constructor(out: (line: string) => void, options: RunOptions = {}) {
    this.out = out;
    this.options = options;
  }

  async run(story: Story): Promise<StoryResult> {
    const out = this.out;
    out(`Story ${story.name}: ${story.title}`);
    let passed = 0;
    let failed = 0;
    let error: string | undefined;
    let database: StoryDatabase | undefined;
    const open: Pick<Database, '$disconnect'>[] = [];
    try {
      const template = this.options.template;
      database = await StoryDatabase.create(template);
      if (template === undefined) {
        const migrations = database.migrate();
        const seeded = await database.seed();
        out(
          `  Its own database, ${database.name}: only the logins connect; ` +
            `${String(migrations)} migrations applied; seed: ${seeded.join('; ')}`,
        );
      } else {
        out(
          `  Its own database, ${database.name}: only the logins connect; ` +
            `a copy of this run’s template, ${String(template.migrations)} migrations and its seed`,
        );
      }
      const api = database.open('api');
      const worker = database.open('worker');
      const viewed = database.openViewer();
      open.push(api, worker, viewed);
      const clock = new StoryClock(story.start);
      const policy = builtInPolicy();
      const hasher = new PasswordHasher(storySigningSecret);
      const offline = new OfflineChecks(storySigningSecret);
      const keys = new DeviceKeys();
      const proofRules = new PhoneProofRules(policy);
      const passcodeAt = (at: { now: () => Date }) =>
        new MasterPasscodeCheck(api, {
          rules: new MasterPasscodeTries(policy),
          hasher,
          mail: new NoMail(),
          clock: at,
          requestNow: () => undefined,
        });
      // A monitor's password is exempt from the breached list (ADR-402 (5)): none is read here.
      const monitors = new PhoneMonitors(api, {
        passcode: passcodeAt(clock),
        rules: new PasswordRules(policy, BreachedPasswords.from('')),
        hasher,
        offline,
        clock,
      });
      const signInsAt = (at: { now: () => Date }) =>
        new PhoneSignIns(api, {
          tokens: new SessionTokens(storySigningSecret, policy.accessTokenMinutes),
          hasher,
          offline,
          tries: new WrongTries(api, {
            rules: new SignInTries(policy),
            clock: at,
            mail: new NoMail(),
            requestNow: () => undefined,
          }),
          assignments: new PhoneAssignments(api),
          clock: at,
          hours: policy.monitorSessionHours,
          requestNow: () => undefined,
        });
      const created = new Map<string, StoryMonitor>();
      // The phone as the server has it now, as its proof's token would say.
      const phoneNow = async (deviceId: string) => ({
        deviceId,
        status: (await api.device.findUniqueOrThrow({ where: { id: deviceId } })).status,
      });
      // The API's `Sync`, as `api-process.ts` builds it.
      const serverOn = (at: { now: () => Date }): PhoneServer => {
        const taking = new Intake(api, at, policy);
        const sync = new Sync(api, {
          intake: taking,
          certifications: new Certifications(api, at, policy),
          unplanned: new UnplannedAssignments(api, { clock: at, requestNow: () => undefined }),
          uses: new PasscodeUses(api, { clock: at, requestNow: () => undefined }),
          numbers: new NumberAllocator(api, at, policy),
          loginList: new PhoneLoginList(api, {
            assignments: new PhoneAssignments(api),
            offline,
            clock: at,
            entriesPerCall: policy.loginListEntriesPerCall,
          }),
          clock: at,
        });
        return {
          received: (deviceId, sent) => sync.received(deviceId, sent),
        };
      };
      const context: StoryContext = {
        clock,
        api,
        worker,
        viewed,
        policy,
        server: serverOn(clock),
        serverOn,
        at(time, what) {
          clock.set(time);
          out(`  ${projectTime(story.timeZone, clock.now())}  ${what}`);
        },
        phone: (setup) => new SimulatedDevice(setup, clock),
        async enrolled(name, at) {
          const key = new SoftwareKey();
          const enrolledAt = at === undefined ? clock : { now: () => at };
          const outcome = await new Enrolment(api, {
            passcode: passcodeAt(enrolledAt),
            keys,
            clock: enrolledAt,
          }).enrol({ name, passcode: storyMasterPasscode, publicKey: key.publicKey });
          if (!outcome.enrolled) throw new Error(`${name} was not enrolled: ${outcome.why}.`);
          return { id: outcome.deviceId, name, key };
        },
        async monitor(name, onPhone) {
          const known = created.get(name);
          if (known !== undefined) return known;
          if (onPhone === undefined)
            throw new Error(`No monitor ${name}, and no phone to create one on.`);
          // A made-up phone number without its area code, one a monitor: 555-0101, 555-0102…
          const password = `555${String(101 + created.size).padStart(4, '0')}`;
          const outcome = await monitors.create(await phoneNow(onPhone), {
            name,
            password,
            passcode: storyMasterPasscode,
          });
          if (!outcome.created) throw new Error(`${name} was not created: ${outcome.why}.`);
          const monitor = {
            id: outcome.userId,
            monitorNumber: outcome.monitorNumber,
            name,
            password,
          };
          created.set(name, monitor);
          return monitor;
        },
        async signedIn(monitor, onPhone, at) {
          const outcome = await signInsAt(at === undefined ? clock : { now: () => at }).signIn(
            await phoneNow(onPhone),
            monitor.monitorNumber,
            monitor.password,
          );
          if (!outcome.signedIn) {
            throw new Error(`${monitor.name} was not signed in: ${outcome.why}.`);
          }
          return outcome.assignment;
        },
        underPasscode: {
          async choices(onPhone, projectId) {
            const outcome = await new SetupChoices(api, {
              passcode: passcodeAt(clock),
              clock,
              // The contracts' number (`setupChoicesMonitorsAtMost`, ADR-463).
              monitorsAtMost: 1000,
            }).read(await phoneNow(onPhone), {
              passcode: storyMasterPasscode,
              projectId,
              monitorsAfter: null,
            });
            if (!outcome.read)
              throw new Error(`The setup’s choices were not read: ${outcome.why}.`);
            return outcome;
          },
          async session(monitor, onPhone, kind) {
            const outcome = await new PasscodeSessions(api, {
              passcode: passcodeAt(clock),
              tokens: new SessionTokens(storySigningSecret, policy.accessTokenMinutes),
              rules: new PasscodeSessionRules(policy.monitorSessionHours),
              assignments: new PhoneAssignments(api),
              clock,
            }).open(await phoneNow(onPhone), {
              personId: monitor.id,
              kind,
              passcode: storyMasterPasscode,
            });
            if (!outcome.opened) {
              throw new Error(`No session was opened for ${monitor.name}: ${outcome.why}.`);
            }
            return { sessionId: outcome.sessionId, expiresAt: outcome.expiresAt };
          },
        },
        lists: new PhoneLists(api, { assignments: new PhoneAssignments(api), clock }),
        proofs: new PhoneProofs(api, {
          rules: proofRules,
          challenges: new PhoneChallenges(storySigningSecret, proofRules),
          keys,
          tokens: new PhoneTokens(storySigningSecret, policy.phoneTokenMinutes),
          clock,
          challengeSeconds: policy.phoneChallengeSeconds,
        }),
        check(what, actual, expected) {
          if (isDeepStrictEqual(actual, expected)) {
            passed += 1;
            out(`      ✓ ${what}`);
          } else {
            failed += 1;
            out(`      ✗ ${what}`);
            out(`          expected ${show(expected)}`);
            out(`          got      ${show(actual)}`);
          }
        },
      };
      await story.run(context);
    } catch (caught) {
      error = redacted(caught instanceof Error ? caught.message : String(caught));
      out(`  ✗ stopped: ${error}`);
    } finally {
      for (const client of open) await client.$disconnect();
      if (database !== undefined) {
        if (this.options.keep === true) {
          await database.keep();
          out(`  Kept ${database.name} to look at; \`pnpm scenarios clean\` drops it.`);
        } else {
          await database.drop();
        }
      }
    }
    const verdict = failed === 0 && error === undefined ? 'passed' : 'FAILED';
    out(
      `  ${verdict}: ${String(passed + failed)} checks, ${String(passed)} passed, ${String(failed)} failed` +
        (error === undefined ? '' : ', stopped early'),
    );
    return { name: story.name, database: database?.name, passed, failed, error };
  }
}

function show(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

// No connection URL reaches the output, whatever an error says.
function redacted(text: string): string {
  return text.replace(/postgres(ql)?:\/\/\S+/g, '<connection URL>');
}
