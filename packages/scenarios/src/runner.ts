// The scenario runner (ARCHITECTURE §15; REQ-017; ADR-275): runs a story on its own database, on
// the story's clock, with simulated phones, and reports each step and each check as it goes. A story
// is told in project time and asserts exact results; a failed check doesn't stop the story, an
// error does. The database is dropped afterwards unless the run keeps it for a person to look at.
// Every request a story's phone makes goes through the story's own API over HTTPS (`StoryApi`;
// BACKLOG 2.7.1 parts 1 and 2, ADR-491…493): no phone's act is a service called in process. The
// back office and the read-only viewers reach it at their browsers, signed in (part 4, ADR-496).
import { isDeepStrictEqual } from 'node:util';

import {
  setPersonPasswordEndpoint,
  turnInAnswerSchema,
  type Endpoint,
  type OfflineSignInReport,
  type PhoneAssignmentAnswer,
  type PhoneListsRecord,
  type PhoneLoginListAnswer,
  type PhoneSetupChoicesAnswer,
  type TurnInAnswer,
  type TurnInHolds,
  type TurnInSent,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import type { MasterPasscodeSessionKind, NoAssignmentReason, Policy } from '@open-adms/domain';

import { projectTime, StoryClock, utcOffsetMinutes } from './clock.ts';
import { SimulatedDevice, type PhoneServer, type PhoneSetup } from './device.ts';
import type { AskedWith } from './over-https.ts';
import {
  madeUpPassword,
  OfficeBrowser,
  setOnTheServer,
  signedOut,
  type OfficePerson,
} from './office-browser.ts';
import { HeldLoginList, offlineSignInReport } from './offline-sign-in.ts';
import { builtInPolicy } from './policy.ts';
import { SoftwareKey, type EnrolledPhone } from './software-key.ts';
import { StoryApi } from './story-api.ts';
import { StoryDatabase, storyMasterPasscode, type StoryTemplate } from './story-database.ts';
import { StoryMedia } from './story-media.ts';

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
  // A second worker's own client on the story's database, as a second worker container would
  // hold (BACKLOG 2.8.2, C95): a pool of its own, closed when the story ends.
  openWorker(): Database;
  // The story's API's pool, the policy's (ADR-524): how many connections, and how long each of
  // its pieces of work waited for one so far, in milliseconds.
  readonly apiPool: { readonly connections: number; waitedMs(): readonly number[] };
  // The release's policy values, which a new project's settings start from (ADR-303).
  readonly policy: Policy;
  // Where phones sync, send a photograph's files and are turned in (BACKLOG 2.7.1 part 1;
  // ADR-491): the story's own API, the API's process itself on the story's database and clock,
  // over HTTPS through the local stack's proxy (`StoryApi`). A phone proves itself with its own
  // key and holds its token as a real one does; its sync is answered whole, its files kept in
  // the story's store.
  readonly server: PhoneServer;
  // The story's own object store, where the API keeps photographs' files (ADR-483): in memory,
  // gone when the story ends.
  readonly media: StoryMedia;
  // Moves the clock to a time (with its offset) and says what happens then.
  at(time: string, what: string): void;
  phone(setup: PhoneSetup): SimulatedDevice;
  // Enrols a phone as a real one is (ARCHITECTURE §7.1, §7.4; ADR-439, 440): once, under the
  // firm's master passcode, at the enrolment endpoint, with a device key made in software.
  // `at` is when it was enrolled, where that is not the story's clock now (a phone enrolled the
  // evening before its work is told).
  enrolled(name: string, at?: Date): Promise<EnrolledPhone>;
  // Creates a field monitor as a real one is (ARCHITECTURE §7.0; ADR-442): on that enrolled
  // phone, online, under the firm's master passcode, at its endpoint. No story writes a monitor
  // by hand. Asked again by the same name, with or without a phone, it is the monitor already
  // created: a story that carries another on reads its people this way.
  monitor(name: string, onPhone?: string): Promise<StoryMonitor>;
  // The monitor signs in on that enrolled phone, online, with their Monitor ID and password, at
  // the sign-in endpoint (ADR-443, 444): the assignment the phone takes, or why it took none.
  // The phone holds their session from then on. A refused sign-in stops the story.
  signedIn(monitor: StoryMonitor, onPhone: string): Promise<TakenAtSignIn>;
  // Whoever holds the firm's master passcode, on that enrolled phone with a connection, now by
  // the story's clock: what a setup picks from (ADR-463), and a session opened for a monitor,
  // which the phone holds as a sign-in's (ADR-462). No story states the passcode; a refusal
  // stops the story.
  readonly underPasscode: {
    choices(onPhone: string, projectId: string | null): Promise<PhoneSetupChoicesAnswer>;
    session(
      monitor: StoryMonitor,
      onPhone: string,
      kind: MasterPasscodeSessionKind,
    ): Promise<TakenAtSignIn>;
    // "Sync and turn in" (ADR-488): the phone syncs, sends its files, then is turned in at the
    // turn-in endpoint over HTTPS (ADR-491); answered to wipe, it wipes. The answer.
    turnIn(phone: SimulatedDevice): Promise<TurnInAnswer>;
    // A phone whose key the firm's time revoked proves itself with the passcode typed beside its
    // signature (ADR-530): what it was answered (`PROVEN`, or the API's code). Proven, it holds
    // the token for its sync and its turn-in.
    proves(onPhone: string): Promise<string>;
    // A turn-in of that enrolled phone naming what the story says it holds, at the same
    // endpoint, with no sync before it: for a turn-in measured at its size (BACKLOG 2.8.2, C141).
    turnInNaming(
      onPhone: string,
      holds: TurnInHolds,
      lastUsed?: TurnInSent['lastUsed'],
    ): Promise<TurnInAnswer>;
  };
  // The lists a phone takes for its assignment (task 2.5.3), asked by the monitor signed in on
  // it: the assignment the phone takes now must be the one named, or the story stops.
  readonly lists: {
    held(phone: {
      readonly assignmentId: string;
      readonly deviceId: string;
    }): Promise<PhoneListsRecord>;
  };
  // Signing in with no connection, as the field app does it (BACKLOG 3.2.4, C143, C151; ADR-531,
  // 575), now by the story's clock, the phone's offset its project's.
  readonly offline: {
    // The phone reads its login list, the monitor signed in on it asking, saying what it holds,
    // and asks again while there are more: each answer as it came.
    loginList(onPhone: string): Promise<PhoneLoginListAnswer[]>;
    // The monitor types their password with no signal: the phone checks it against the entry it
    // holds, in the two slow hashes, and keeps the sign-in with its proof. False where the entry
    // doesn't open, or there is none: nothing kept.
    signIn(monitor: StoryMonitor, onPhone: string, password?: string): boolean;
    // At signal, the phone reports the sign-in it keeps (the last one, `again` for the one before
    // reported once more): `TAKEN`, the session it was given held, or the API's code.
    reported(onPhone: string, again?: boolean): Promise<string>;
  };
  // Every request above on another clock, the story's API started again on it at the first one
  // sent: for field days told again on a clock of their own. Started again, it holds no part of
  // a file not yet whole.
  phonesOn(clock: { now: () => Date }): StoryPhones;
  // A phone's proof of itself, as its sync begins: over HTTPS to the story's API, on the story's
  // clock; proven, the phone holds its token for its next requests (`StoryApi.proves`).
  readonly proofs: Pick<StoryApi, 'proves'>;
  // The back office and the read-only viewers at their browsers (BACKLOG 2.7.1 part 4; ADR-496):
  // over HTTPS to the story's API, on the story's clock, each signed in as a real person is
  // (`OfficeBrowser`). Asked again for the same person, it is the browser they already hold.
  readonly backOffice: {
    // The firm's first admin, whom the story wrote with their email address: their password set
    // on the server, as `pnpm installer:admin` lets an admin back in; they sign in with it and set
    // their authenticator up.
    admin(person: OfficePerson): Promise<OfficeBrowser>;
    // A person an admin created: that admin sets their first password at its endpoint; they sign
    // in with it, set one of their own and, an admin or a manager/analyst, their authenticator.
    person(by: OfficeBrowser, person: OfficePerson): Promise<OfficeBrowser>;
    // A browser nobody signed in at.
    readonly signedOut: Pick<OfficeBrowser, 'asked'>;
  };
  // Asserts an exact result; strict deep equality.
  check(what: string, actual: unknown, expected: unknown): void;
}

// The assignment a phone takes at a sign-in, as the API answered it, or why it took none.
export type TakenAtSignIn =
  | { readonly taken: true; readonly assignment: PhoneAssignmentAnswer }
  | { readonly taken: false; readonly why: NoAssignmentReason };

// A story's phones' requests, all on one clock.
export type StoryPhones = Pick<
  StoryContext,
  'server' | 'enrolled' | 'monitor' | 'signedIn' | 'underPasscode' | 'lists'
>;

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
    let stage: StoryStage | undefined;
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
      stage = StoryStage.open({
        database,
        timeZone: story.timeZone,
        start: story.start,
        out,
        checked(ok) {
          if (ok) passed += 1;
          else failed += 1;
        },
      });
      await story.run(stage.context);
    } catch (caught) {
      error = redacted(caught instanceof Error ? caught.message : String(caught));
      out(`  ✗ stopped: ${error}`);
    } finally {
      await stage?.close();
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

// What a story's stage is set on: its database (made, migrated and seeded already), its time
// zone and the moment its clock starts, where what happens is said, and each check's verdict.
export interface StageParts {
  readonly database: StoryDatabase;
  readonly timeZone: string;
  readonly start: string;
  readonly out: (line: string) => void;
  readonly checked: (passed: boolean) => void;
  // The pages that may call its API from a browser (ADR-572, 603): none for a story's phones.
  readonly corsOrigins?: readonly string[];
}

// A story's stage (ADR-275, 491, 603): the services' own clients on its database, its clock, its
// API over HTTPS with the phones it enrolled and the people at their browsers, as a story is told
// on it (`StoryContext`). The runner sets one for each story; the field app's browser world for
// the golden mission holds one for its run (`MissionWorld`). Closed, its API stops and its
// clients disconnect; the database is the caller's.
export class StoryStage {
  readonly context: StoryContext;
  private readonly served: StoryApi;
  private readonly open: Pick<Database, '$disconnect'>[];

  private constructor(
    context: StoryContext,
    served: StoryApi,
    open: Pick<Database, '$disconnect'>[],
  ) {
    this.context = context;
    this.served = served;
    this.open = open;
  }

  static open(parts: StageParts): StoryStage {
    const { database, out, checked } = parts;
    const api = database.open('api');
    const worker = database.open('worker');
    const open: Pick<Database, '$disconnect'>[] = [api, worker];
    const clock = new StoryClock(parts.start);
    const policy = builtInPolicy();
    const created = new Map<string, StoryMonitor>();
    const media = new StoryMedia();
    const served = new StoryApi({
      database,
      clock,
      policy,
      media,
      corsOrigins: parts.corsOrigins ?? [],
    });
    const send = (endpoint: Endpoint, more: AskedWith) => served.sent(endpoint, more);
    const browsers = new Map<string, OfficeBrowser>();
    // Every request of a story's phones on one clock, through the story's API.
    const phonesOn = (on: { now: () => Date }, startedAgain: boolean): StoryPhones => {
      const asked = served.requests(on, startedAgain);
      return {
        server: asked.server,
        async enrolled(name, moment) {
          const key = new SoftwareKey();
          // At a moment of its own, where one is given: the API's clock is then that moment.
          const enrolment = moment === undefined ? asked : served.requests({ now: () => moment });
          const { deviceId } = await enrolment.enrol({
            name,
            passcode: storyMasterPasscode,
            publicKey: key.publicKey,
          });
          served.enrolled(deviceId, key);
          return { id: deviceId, name, key };
        },
        async monitor(name, onPhone) {
          const known = created.get(name);
          if (known !== undefined) return known;
          if (onPhone === undefined)
            throw new Error(`No monitor ${name}, and no phone to create one on.`);
          // A made-up phone number without its area code, one a monitor: 555-0101, 555-0102…
          const password = `555${String(101 + created.size).padStart(4, '0')}`;
          const answer = await asked.monitorCreated(onPhone, {
            name,
            password,
            passcode: storyMasterPasscode,
          });
          const monitor = {
            id: answer.userId,
            monitorNumber: answer.monitorNumber,
            name,
            password,
          };
          created.set(name, monitor);
          return monitor;
        },
        async signedIn(monitor, onPhone) {
          return takenAt(
            await asked.signedIn(onPhone, {
              monitorNumber: monitor.monitorNumber,
              password: monitor.password,
            }),
          );
        },
        underPasscode: {
          choices: (onPhone, projectId) =>
            asked.setupChoices(onPhone, {
              passcode: storyMasterPasscode,
              projectId,
              monitorsAfter: null,
            }),
          async session(monitor, onPhone, kind) {
            return takenAt(
              await asked.passcodeSession(onPhone, {
                personId: monitor.id,
                kind,
                passcode: storyMasterPasscode,
              }),
            );
          },
          // "Sync and turn in" on the phone, the passcode typed by whoever holds it (ADR-488).
          turnIn: (phone) => phone.turnIn(asked.server, storyMasterPasscode),
          proves: async (onPhone) => (await served.proves(onPhone, storyMasterPasscode)).answer,
          async turnInNaming(onPhone, holds, lastUsed = []) {
            const { server } = asked;
            if (server.turnIn === undefined) {
              throw new Error('The story’s server turns no phone in.');
            }
            return turnInAnswerSchema.parse(
              await server.turnIn(onPhone, { passcode: storyMasterPasscode, holds, lastUsed }),
            );
          },
        },
        lists: {
          async held({ assignmentId, deviceId }) {
            const answer = await asked.lists(deviceId);
            if (answer.assignment?.id !== assignmentId || answer.lists === null) {
              throw new Error(
                `The phone’s lists are of ${answer.assignment?.id ?? answer.noAssignment ?? 'nothing'}, ` +
                  'not of the assignment the story names.',
              );
            }
            return answer.lists;
          },
        },
      };
    };
    // What each phone holds for signing in offline: its login list, the sign-in it keeps, and
    // the one it reported before.
    const offline = new Map<
      string,
      {
        readonly list: HeldLoginList;
        kept?: OfflineSignInReport;
        reported?: OfflineSignInReport;
      }
    >();
    const offlineOf = (deviceId: string) => {
      let held = offline.get(deviceId);
      if (held === undefined) {
        held = { list: new HeldLoginList() };
        offline.set(deviceId, held);
      }
      return held;
    };
    const onClock = served.requests(clock);
    const context: StoryContext = {
      clock,
      api,
      worker,
      policy,
      ...phonesOn(clock, false),
      offline: {
        async loginList(onPhone) {
          const { list } = offlineOf(onPhone);
          const answers: PhoneLoginListAnswer[] = [];
          for (let more = true; more;) {
            const answer = await onClock.loginList(onPhone, list.held());
            answers.push(answer);
            more = list.kept(answer);
          }
          return answers;
        },
        signIn(monitor, onPhone, password = monitor.password) {
          const held = offlineOf(onPhone);
          const firstHash = held.list.opened(monitor.id, password);
          if (firstHash === undefined) return false;
          const at = clock.now();
          held.kept = offlineSignInReport(
            onPhone,
            monitor.id,
            at,
            utcOffsetMinutes(parts.timeZone, at),
            firstHash,
          );
          return true;
        },
        async reported(onPhone, again = false) {
          const held = offlineOf(onPhone);
          const report = again ? held.reported : held.kept;
          if (report === undefined) throw new Error('The phone keeps no sign-in to report.');
          const answer = await onClock.offlineSignIn(onPhone, report);
          held.reported = report;
          delete held.kept;
          return answer;
        },
      },
      phonesOn: (on) => phonesOn(on, true),
      media,
      at(time, what) {
        clock.set(time);
        out(`  ${projectTime(parts.timeZone, clock.now())}  ${what}`);
      },
      phone: (setup) => new SimulatedDevice(setup, clock),
      proofs: { proves: (deviceId, passcode) => served.proves(deviceId, passcode) },
      openWorker() {
        const another = database.open('worker');
        open.push(another);
        return another;
      },
      apiPool: {
        connections: policy.databasePoolConnections,
        waitedMs: () => served.waitedMs(),
      },
      backOffice: {
        async admin(person) {
          const held = browsers.get(person.id);
          if (held !== undefined) return held;
          const password = await setOnTheServer(api, clock, policy, person);
          const browser = await OfficeBrowser.signIn(send, clock, person, password);
          browsers.set(person.id, browser);
          return browser;
        },
        async person(by, person) {
          const held = browsers.get(person.id);
          if (held !== undefined) return held;
          const password = madeUpPassword();
          await by.answered(setPersonPasswordEndpoint, {
            ids: { userId: person.id },
            json: { password },
          });
          const browser = await OfficeBrowser.signIn(send, clock, person, password);
          browsers.set(person.id, browser);
          return browser;
        },
        signedOut: signedOut(send),
      },
      check(what, actual, expected) {
        if (isDeepStrictEqual(actual, expected)) {
          checked(true);
          out(`      ✓ ${what}`);
        } else {
          checked(false);
          out(`      ✗ ${what}`);
          out(`          expected ${show(expected)}`);
          out(`          got      ${show(actual)}`);
        }
      },
    };
    return new StoryStage(context, served, open);
  }

  async close(): Promise<void> {
    await this.served.close();
    for (const client of this.open) await client.$disconnect();
  }
}

// What a sign-in or a session opened on a phone tells it of its assignment.
function takenAt(answer: {
  readonly assignment: PhoneAssignmentAnswer | null;
  readonly noAssignment: NoAssignmentReason | null;
}): TakenAtSignIn {
  if (answer.assignment !== null) return { taken: true, assignment: answer.assignment };
  if (answer.noAssignment === null) throw new Error('A sign-in was answered neither way.');
  return { taken: false, why: answer.noAssignment };
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
