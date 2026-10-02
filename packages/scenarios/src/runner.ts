// The scenario runner (ARCHITECTURE §15; REQ-017; ADR-275): runs a story on its own database, on
// the story's clock, with simulated phones, and reports each step and each check as it goes. A story
// is told in project time and asserts exact results; a failed check doesn't stop the story, an
// error does. The database is dropped afterwards unless the run keeps it for a person to look at.
import { isDeepStrictEqual } from 'node:util';

import type { Database } from '@open-adms/db';
import type { Policy } from '@open-adms/domain';

import { projectTime, StoryClock } from './clock.ts';
import { SimulatedDevice, type PhoneSetup, type SyncIntake } from './device.ts';
import { ApiSyncIntake } from './intake.ts';
import { builtInPolicy } from './policy.ts';
import { StoryDatabase } from './story-database.ts';

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
  // The release's policy values, which a new project's settings start from (ADR-303).
  readonly policy: Policy;
  // Where phones sync to: the stand-in for the API's sync endpoint.
  readonly intake: SyncIntake;
  // Moves the clock to a time (with its offset) and says what happens then.
  at(time: string, what: string): void;
  phone(setup: PhoneSetup): SimulatedDevice;
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
    const open: Database[] = [];
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
      open.push(api, worker);
      const clock = new StoryClock(story.start);
      const context: StoryContext = {
        clock,
        api,
        worker,
        policy: builtInPolicy(),
        intake: new ApiSyncIntake(api, clock),
        at(time, what) {
          clock.set(time);
          out(`  ${projectTime(story.timeZone, clock.now())}  ${what}`);
        },
        phone: (setup) => new SimulatedDevice(setup, clock),
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
