// The golden mission's own world, as its browser tests reach it (spec/golden/MISSION.md; PLAN
// item 3.10.1; ADR-572, 603): the field app built for the stories' address (`dist/world`, as the
// run's own world has it) served from this machine's loopback under the app's own policy, and
// the scenario harness's `MissionWorld` in a process of its own (`cli.ts mission`): the field app
// depends on nothing that reaches Postgres (`pnpm security`, "Who reaches Postgres"). The
// mission's test makes it, asks it a line at a time, and closes it; the installation's database
// is never written by it.
//
// The world is the mission's back office and its worker: it moves the time on, writes Luis
// Ortega's boards once the phones are enrolled, works the worker's queue, does Luis's review,
// and reads what stands through the API at the back office's browsers, the audit log's rows
// included. The mission's approved
// outcomes come with its cast, from their one home in the scenario harness
// (`packages/scenarios/src/stories/golden-outcomes.ts`).
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import type { Readable, Writable } from 'node:stream';
import { createInterface, type Interface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { servedHeaders, servedPolicy } from '../page.ts';
import { servedFolder } from './stack.ts';
import { worldApiOrigin } from './world.ts';

const harness = fileURLToPath(new URL('../../../packages/scenarios/src/cli.ts', import.meta.url));

// A monitor of the mission, with their Monitor ID and made-up password.
export interface MissionMonitor {
  readonly name: string;
  readonly monitorNumber: string;
  readonly password: string;
}

export type MissionMonitorName =
  'Ana Brooks' | 'Kim Nguyen' | 'Tariq Patel' | 'Jo Kim' | 'Sam Grant' | 'Lee Morgan';

type Workflow = 'LOAD' | 'HAUL_OUT' | 'UNIT_RATE';

export interface LedgerTotal {
  readonly lines: number;
  readonly total: string;
}

// What stands on a project, as the world read it through the API: each of the mission's tickets
// the project has (`number · STATUS · each flag standing on it`), each with its statuses, the
// review queue of each workflow as its endpoint answers it, and the ledger line by line.
export interface MissionStanding {
  readonly tickets: readonly string[];
  readonly statuses: readonly string[];
  readonly queue: Readonly<Record<Workflow, readonly string[]>>;
  readonly ledger: readonly string[];
  readonly total: LedgerTotal;
}

// The mission's approved outcomes, as their home writes them.
export interface MissionOutcomes {
  readonly mondayNight: {
    readonly p1: { readonly tickets: readonly string[]; readonly ledger: LedgerTotal };
    readonly p2: { readonly tickets: readonly string[]; readonly ledger: LedgerTotal };
  };
  readonly tuesdayNight: {
    readonly p1: { readonly tickets: readonly string[]; readonly ledger: LedgerTotal };
  };
  readonly wednesday: {
    readonly p1: {
      readonly loads: readonly string[];
      readonly ledger: LedgerTotal;
      readonly queue: Readonly<Record<Workflow, readonly string[]>>;
    };
  };
  readonly reviewed: {
    readonly p1: {
      readonly statuses: readonly string[];
      readonly queue: Readonly<Record<Workflow, readonly string[]>>;
      readonly ledger: readonly string[];
      readonly total: LedgerTotal;
      // Each audited ticket's rows of the audit log that matter, oldest first.
      readonly audit: Readonly<Record<string, readonly string[]>>;
    };
    readonly p2: {
      readonly statuses: readonly string[];
      readonly ledger: readonly string[];
      readonly total: LedgerTotal;
    };
  };
}

interface Ready {
  readonly ready: true;
  readonly apiOrigin: string;
  readonly masterPasscode: string;
  readonly cast: Readonly<Record<MissionMonitorName, MissionMonitor>>;
  readonly outcomes: MissionOutcomes;
}

// How Dana Reyes and Luis Ortega sign in at the back office's screens.
export interface BackOfficeSignIn {
  readonly email: string;
  readonly password: string;
  readonly secret: string;
}

type Answer =
  | {
      readonly ok: true;
      readonly standing?: { p1: MissionStanding; p2: MissionStanding };
      readonly audit?: Readonly<Record<string, readonly string[]>>;
      readonly people?: Readonly<Record<'dana' | 'luis', BackOfficeSignIn>>;
      readonly cast?: Readonly<Record<MissionMonitorName, MissionMonitor>>;
    }
  | { readonly ok: false; readonly error: string };

export class MissionWorld {
  // Where the mission's page is, and its made-up master passcode, as a phone is enrolled there.
  readonly origin: string;
  readonly passcode: string;
  cast: Readonly<Record<MissionMonitorName, MissionMonitor>>;
  readonly outcomes: MissionOutcomes;
  private readonly made: ChildProcessByStdio<Writable, Readable, null>;
  private readonly answers: Interface;
  private readonly page: { close: () => Promise<void> };

  private constructor(
    page: { readonly origin: string; close: () => Promise<void> },
    made: ChildProcessByStdio<Writable, Readable, null>,
    answers: Interface,
    ready: Ready,
  ) {
    this.page = page;
    this.origin = page.origin;
    this.made = made;
    this.answers = answers;
    this.passcode = ready.masterPasscode;
    this.cast = ready.cast;
    this.outcomes = ready.outcomes;
  }

  // The page served and the world made for it: set up to Saturday 10 October by the stories, or,
  // set up by the back office's screens (at `officeOrigin`), holding only Dana, Luis and the yard's
  // phone until the test adopts what the screens made.
  static async opened(officeOrigin?: string): Promise<MissionWorld> {
    const page = await servedFolder(fileURLToPath(new URL('../dist/world', import.meta.url)), {
      'content-security-policy': servedPolicy(worldApiOrigin),
      ...servedHeaders,
    });
    const asked = officeOrigin === undefined ? [] : ['screens', officeOrigin];
    const made = spawn(process.execPath, [harness, 'mission', page.origin, ...asked], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const answers = createInterface({ input: made.stdout });
    try {
      const ready = await new Promise<Ready>((resolve, reject) => {
        made.once('exit', (code) => {
          reject(
            new Error(`The mission's world wasn't made (the harness ended with ${String(code)}).`),
          );
        });
        answers.once('line', (line) => {
          const read = JSON.parse(line) as Partial<Ready>;
          if (read.ready === true && read.apiOrigin === worldApiOrigin) resolve(read as Ready);
          else reject(new Error('The harness said something other than that the world was ready.'));
        });
      });
      return new MissionWorld(page, made, answers, ready);
    } catch (problem) {
      made.kill('SIGTERM');
      await page.close();
      throw problem;
    }
  }

  // The time now, by the world's clock: its API's and its worker's.
  async at(time: string): Promise<void> {
    await this.asked({ do: 'at', time });
  }

  // How Dana and Luis sign in at the back office's screens (the world set up by them).
  async people(): Promise<Readonly<Record<'dana' | 'luis', BackOfficeSignIn>>> {
    const answer = await this.asked({ do: 'people' });
    if (answer.people === undefined) throw new Error('The world named nobody.');
    return answer.people;
  }

  // What the back office's screens set up, adopted: the monitors created on the yard's phone and
  // Saturday's certifications made, as the stories do; the cast is theirs.
  async adopt(): Promise<void> {
    const answer = await this.asked({ do: 'adopt' });
    if (answer.cast === undefined) throw new Error('The world adopted no cast.');
    this.cast = answer.cast;
  }

  // Luis writes P1's boards for Monday and Tuesday and P2's for Monday, naming the phones the
  // tests enrolled.
  async boards(): Promise<void> {
    await this.asked({ do: 'board' });
  }

  // The worker takes up every job the syncs and the review queued, until none waits.
  async worker(): Promise<void> {
    await this.asked({ do: 'worker' });
  }

  // Luis's review of the mission, each act followed by the worker's run of it.
  async review(): Promise<void> {
    await this.asked({ do: 'review' });
  }

  // What stands on P1 and P2, read through the API.
  async standing(): Promise<{ readonly p1: MissionStanding; readonly p2: MissionStanding }> {
    const answer = await this.asked({ do: 'read' });
    if (answer.standing === undefined) throw new Error('The world read nothing.');
    return answer.standing;
  }

  // P1's audit rows the mission names, each ticket's history read through the API at Luis's
  // browser: who did what, from where and why, prior values and removed lines kept.
  async audit(): Promise<Readonly<Record<string, readonly string[]>>> {
    const answer = await this.asked({ do: 'audit' });
    if (answer.audit === undefined) throw new Error('The world read no audit rows.');
    return answer.audit;
  }

  async close(): Promise<void> {
    try {
      const stopped = once(this.made, 'exit');
      this.made.stdin.end();
      await stopped;
    } finally {
      await this.page.close();
    }
  }

  // One thing asked, and its answer: the world answers in turn, a line for each.
  private async asked(ask: Readonly<Record<string, string>>): Promise<Answer & { ok: true }> {
    const answered = new Promise<string>((resolve, reject) => {
      const exited = () => {
        reject(new Error('The mission’s world ended before it answered.'));
      };
      this.made.once('exit', exited);
      this.answers.once('line', (line) => {
        this.made.off('exit', exited);
        resolve(line);
      });
    });
    this.made.stdin.write(`${JSON.stringify(ask)}\n`);
    const answer = JSON.parse(await answered) as Answer;
    if (!answer.ok)
      throw new Error(`The mission’s world couldn’t ${ask['do'] ?? ''}: ${answer.error}`);
    return answer;
  }
}
