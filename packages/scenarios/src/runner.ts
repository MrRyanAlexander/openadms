// The scenario runner (ARCHITECTURE §15; REQ-017; ADR-275): runs a story on its own database, on
// the story's clock, with simulated phones, and reports each step and each check as it goes. A story
// is told in project time and asserts exact results; a failed check doesn't stop the story, an
// error does. The database is dropped afterwards unless the run keeps it for a person to look at.
import { isDeepStrictEqual } from 'node:util';

import {
  DeviceKeys,
  Enrolment,
  Intake,
  NoMail,
  PasswordHasher,
  PhoneChallenges,
  PhoneProofs,
  PhoneTokens,
} from '@open-adms/api';
import type { Database, ViewerDatabase } from '@open-adms/db';
import { MasterPasscodeTries, PhoneProofRules, type Policy } from '@open-adms/domain';

import { projectTime, StoryClock } from './clock.ts';
import { SimulatedDevice, type PhoneSetup } from './device.ts';
import { builtInPolicy } from './policy.ts';
import { SoftwareKey, type EnrolledPhone } from './software-key.ts';
import { StoryDatabase, storyMasterPasscode } from './story-database.ts';

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

export interface StoryContext {
  readonly clock: StoryClock;
  // The services' own clients, on the story's database.
  readonly api: Database;
  readonly worker: Database;
  // The read-only login's way in, for a read-only viewer's reads: `$viewed` alone (ADR-434).
  readonly viewed: ViewerDatabase;
  // The release's policy values, which a new project's settings start from (ADR-303).
  readonly policy: Policy;
  // Where phones sync to: the API's intake, with no endpoint in front of it until Phase 2
  // (ADR-338). It takes each record a phone sends and answers it; `topUp` is the sync's last
  // step, the phone's number blocks made full again.
  readonly intake: Intake;
  // Moves the clock to a time (with its offset) and says what happens then.
  at(time: string, what: string): void;
  phone(setup: PhoneSetup): SimulatedDevice;
  // Enrols a phone as a real one is (ARCHITECTURE §7.1, §7.4; ADR-439, 440): once, under the
  // firm's master passcode, through the API's `Enrolment`, with a device key made in software.
  // `at` is when it was enrolled, where that is not the story's clock now (a phone enrolled the
  // evening before its work is told).
  enrolled(name: string, at?: Date): Promise<EnrolledPhone>;
  // A phone's proof of itself, as its sync begins: the API's `PhoneProofs`, on the story's clock.
  readonly proofs: PhoneProofs;
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
      database = await StoryDatabase.create();
      const migrations = database.migrate();
      const seeded = await database.seed();
      out(
        `  Its own database, ${database.name}: only the logins connect; ` +
          `${String(migrations)} migrations applied; seed: ${seeded.join('; ')}`,
      );
      const api = database.open('api');
      const worker = database.open('worker');
      const viewed = database.openViewer();
      open.push(api, worker, viewed);
      const clock = new StoryClock(story.start);
      const policy = builtInPolicy();
      const hasher = new PasswordHasher(storySigningSecret);
      const keys = new DeviceKeys();
      const proofRules = new PhoneProofRules(policy);
      const context: StoryContext = {
        clock,
        api,
        worker,
        viewed,
        policy,
        intake: new Intake(api, clock, policy),
        at(time, what) {
          clock.set(time);
          out(`  ${projectTime(story.timeZone, clock.now())}  ${what}`);
        },
        phone: (setup) => new SimulatedDevice(setup, clock),
        async enrolled(name, at) {
          const key = new SoftwareKey();
          const outcome = await new Enrolment(api, {
            rules: new MasterPasscodeTries(policy),
            hasher,
            keys,
            mail: new NoMail(),
            clock: at === undefined ? clock : { now: () => at },
            requestNow: () => undefined,
          }).enrol({ name, passcode: storyMasterPasscode, publicKey: key.publicKey });
          if (!outcome.enrolled) throw new Error(`${name} was not enrolled: ${outcome.why}.`);
          return { id: outcome.deviceId, name, key };
        },
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
