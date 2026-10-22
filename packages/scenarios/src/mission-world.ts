// The golden mission's own world, for the field app's browser tests of it (ARCHITECTURE §15;
// spec/golden/MISSION.md; PLAN item 3.10.1; ADR-572, 603): a database of its own, made as a
// story's is, on a clock the tests move, served by the API's own process at the stories' address
// (`https://stories.adms.localhost`, over HTTPS through the stack's proxy) with the one page that
// tests it on its CORS list. Its phones are the browser's, enrolled through their first screen;
// every field event of the mission is captured on their screens and synced through the real
// endpoints. The world is the mission's back office and its worker: what the mission makes in the
// back office, it makes as the stories make it, through the same shared steps.
//
// **Made before the tests' phones**, on its clock: Thursday 8 October, Dana Reyes's setup of P1
// (`setUpP1ForTheField`), its map, pay items and rules (`loadP1Map`, `setUpP1Pricing`) and Luis
// Ortega's grants; the six monitors created on the yard phone, P1-YARD, the world's own (enrolled
// with a key made here, as a story's are), online under the master passcode; Friday, P2
// (`setUpP2`); Saturday, Sam Grant's five certifications on P1 and Rivera's self-loader on P2,
// each made on the yard phone with Lee Morgan helping and its five photographs sent from it
// (`certifyP1`, `certifyP2Loader`). Then what setup queued is worked by the worker.
//
// **Asked by the tests**, a line at a time (cli.ts `mission`): the time now; Luis's boards, once
// the field phones are enrolled (`boardP1`, `boardP2`), each assignment naming its phone; the
// worker's queue worked through (`QueueRuns`), as the worker's own job loop takes it up; the
// mission's review (`MissionReview`); and what stands, read through the API at Luis's and Dana's
// browsers: each of the mission's tickets with its statuses and standing flags, the review queue
// of each workflow, and the ledger line by line; and, once the review is done, the audit rows the
// mission names, each ticket's history read at Luis's browser (`MissionAudit`). Its approved outcomes (`goldenOutcomes`) are
// handed to the tests with the cast, to check what the screens made against.
import {
  readTicketEndpoint,
  reviewQueueEndpoint,
  ticketAnswerSchema,
  type TicketAnswer,
} from '@open-adms/contracts';
import { uuidv7 } from '@open-adms/domain';
import { MapServers, Mileages, Reconciliation } from '@open-adms/worker';

import { localMapServers } from './map-servers.ts';
import { storiesHostname } from './over-https.ts';
import { StoryStage, type StoryContext } from './runner.ts';
import { MissionAudit, payItemCodes } from './stories/golden-audit.ts';
import {
  goldenOutcomes,
  ledgerLine,
  missionTicketNumbers,
  queueLine,
  ticketLine,
  totalOf,
  type AuditTickets,
  type GoldenOutcomes,
  type LedgerTotal,
} from './stories/golden-outcomes.ts';
import { MissionReview } from './stories/golden-review.ts';
import {
  boardP1,
  p1Monitors,
  p1Phones,
  setUpP1ForTheField,
  type P1Field,
  type P1MonitorName,
  type P1PhoneName,
} from './stories/p1-field-setup.ts';
import {
  certifyP1,
  loadP1Map,
  p1BackOffice,
  QueueRuns,
  setUpP1Pricing,
  type P1BackOffice,
} from './stories/p1-office.ts';
import { danasEmail, luissEmail, p1TimeZone } from './stories/p1.ts';
import { boardP2, certifyP2Loader, p2Phones, setUpP2, type P2PhoneName } from './stories/p2.ts';
import { StoryDatabase, storyMasterPasscode } from './story-database.ts';

// A monitor of the mission, as a test signs them in.
export interface MissionMonitor {
  readonly name: string;
  readonly monitorNumber: string;
  readonly password: string;
}

const workflowsRead = ['LOAD', 'HAUL_OUT', 'UNIT_RATE'] as const;
type WorkflowRead = (typeof workflowsRead)[number];

// What stands on a project, read through the API.
export interface MissionStanding {
  // Each of the mission's tickets the project has, in the outcomes' order and words.
  readonly tickets: readonly string[];
  // Each with its statuses, by number.
  readonly statuses: readonly string[];
  // The review queue of each workflow, as the endpoint answers it.
  readonly queue: Readonly<Record<WorkflowRead, readonly string[]>>;
  // Every line of the ledger, in order, and what they come to.
  readonly ledger: readonly string[];
  readonly total: LedgerTotal;
}

// What the tests may ask, one at a time.
export type MissionAsked =
  | { readonly do: 'at'; readonly time: string }
  // The world set up by the back office's screens: Dana's and Luis's sign-ins, and the setup the
  // screens made adopted.
  | { readonly do: 'people' }
  | { readonly do: 'adopt' }
  | { readonly do: 'board' }
  | { readonly do: 'worker' }
  | { readonly do: 'review' }
  | { readonly do: 'read' }
  | { readonly do: 'audit' };

export type MissionAnswer =
  | {
      readonly ok: true;
      readonly standing?: { readonly p1: MissionStanding; readonly p2: MissionStanding };
      // P1's audit rows the mission names, by ticket.
      readonly audit?: AuditTickets;
      // How Dana and Luis sign in at the back office's sign-in screen.
      readonly people?: Readonly<Record<'dana' | 'luis', BackOfficeSignIn>>;
      // The monitors, once the setup is adopted.
      readonly cast?: Readonly<Record<P1MonitorName, MissionMonitor>>;
    }
  | { readonly ok: false; readonly error: string };

// How a person of the back office signs in through its screens: their address, their password and
// their authenticator's key, made up for the world.
export interface BackOfficeSignIn {
  readonly email: string;
  readonly password: string;
  readonly secret: string;
}

// Who sets the mission up: by the stories' shared steps, or by a person at the back office's
// screens (the golden mission through every screen, BUILD.md's done-when 2).
export type MissionSetUp = 'stories' | 'screens';

// Who the world makes before anything else, in either way it is set up.
interface Before {
  readonly yard: string;
  readonly dana: string;
  readonly luis: string;
}

// Where the mission's people are, as the world made them.
interface Made {
  readonly p1: string;
  readonly p2: string;
  readonly p2Tdsr: string;
  readonly dana: string;
  readonly luis: string;
  readonly people: Readonly<Record<P1MonitorName, { readonly id: string } & MissionMonitor>>;
  readonly field: P1Field;
}

export class MissionWorld {
  // Where the browser tests' page reaches the world's API.
  static readonly apiOrigin = `https://${storiesHostname}`;
  // The world's master passcode, which whoever holds it types on a phone: made up, no
  // installation's.
  static readonly masterPasscode = storyMasterPasscode;

  readonly database: string;
  cast: Readonly<Record<P1MonitorName, MissionMonitor>> = {} as Record<
    P1MonitorName,
    MissionMonitor
  >;
  readonly outcomes: GoldenOutcomes = goldenOutcomes;
  private readonly made: StoryDatabase;
  private readonly stage: StoryStage;
  private readonly before: Before;
  private made_: Made | undefined;
  private backOffice: P1BackOffice;
  private readonly queue: QueueRuns;
  // The pay items' codes, by id, read once the setup is done.
  private codes: ReadonlyMap<string, string> | undefined;

  private constructor(made: StoryDatabase, stage: StoryStage, before: Before) {
    this.made = made;
    this.database = made.name;
    this.stage = stage;
    this.before = before;
    const story = stage.context;
    // Until the mission is set up, the back office's people have no project of theirs to name.
    this.backOffice = p1BackOffice(story, { dana: before.dana, luis: before.luis, p1: '' });
    this.queue = new QueueRuns(
      story,
      new Reconciliation(
        story.worker,
        story.clock,
        {
          crewItemHoursLimit: story.policy.crewDayHours,
          deviceClockOffLimitMinutes: story.policy.deviceClockOffLimitMinutes,
          longestRunMs: 600_000,
        },
        new Mileages(new MapServers(localMapServers())),
      ),
    );
  }

  // The world made and set up, its API listening for the one page origin given, on the clock at
  // Saturday 10 October once the certifications are made. The caller closes it.
  static async opened(
    pageOrigin: string,
    setUp: MissionSetUp = 'stories',
    officeOrigin?: string,
  ): Promise<MissionWorld> {
    const made = await StoryDatabase.create();
    let stage: StoryStage | undefined;
    try {
      made.migrate();
      await made.seed();
      stage = StoryStage.open({
        database: made,
        timeZone: p1TimeZone,
        start: '2026-10-08T08:00:00-04:00',
        // The world says nothing of its own; a check of a shared step that fails stops it.
        out: () => undefined,
        checked: (passed) => {
          if (!passed) throw new Error('A check of the mission’s setup failed.');
        },
        corsOrigins: officeOrigin === undefined ? [pageOrigin] : [pageOrigin, officeOrigin],
      });
      const story = stage.context;
      const yard = (await story.enrolled('P1-YARD')).id;
      if (setUp === 'screens') {
        return new MissionWorld(made, stage, await MissionWorld.peopleForScreens(story, yard));
      }
      const world = await MissionWorld.setUp(story, yard);
      const opened = new MissionWorld(made, stage, { yard, dana: world.dana, luis: world.luis });
      opened.adopted(world);
      // What setup queued (a site's permit, a certification's views) is worked before Monday.
      await opened.queue.ran(world.p1);
      return opened;
    } catch (problem) {
      await stage?.close();
      await made.drop();
      throw problem;
    }
  }

  // Dana Reyes and Luis Ortega, made before the screens set anything up, as the stories' shared
  // step makes them (Luis writes the board: Dana grants him *dispatch*, ADR-428, 429).
  private static async peopleForScreens(story: StoryContext, yard: string): Promise<Before> {
    const dana = uuidv7(story.clock.now());
    const luis = await story.api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({
        data: { id: dana, name: 'Dana Reyes', role: 'ADMIN', email: danasEmail },
      });
      const made = await tx.user.create({
        data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST', email: luissEmail },
      });
      for (const permission of ['DISPATCH', 'VIEW_DISPATCH'] as const) {
        await tx.userPermission.create({ data: { userId: made.id, permission } });
      }
      return made.id;
    });
    return { yard, dana, luis };
  }

  // The mission's §1 as its back office and its yard set it up, Thursday to Saturday.
  private static async setUp(story: StoryContext, yard: string): Promise<Made> {
    const field = await setUpP1ForTheField(story, yard);
    const lookup = async (name: string) =>
      (await story.api.contract.findFirstOrThrow({ where: { name } })).id;
    const office = {
      ...field,
      contract: await lookup('Coastline, Bayline ROW 2026'),
      sam: field.monitors['Sam Grant'].id,
      lee: field.monitors['Lee Morgan'].id,
      samPhone: yard,
    };
    story.clock.set('2026-10-08T08:40:00-04:00');
    await loadP1Map(story, office);
    await setUpP1Pricing(story, office);
    await p1BackOffice(story, office).grantLuis(
      'CORRECT',
      'RENUMBER',
      'VOID',
      'ACCEPT_FLAG',
      'QC',
      'LOCK_INVOICED',
      'VIEW_REVIEW',
    );
    story.clock.set('2026-10-09T09:00:00-04:00');
    const p2 = await setUpP2(story, office);
    await certifyP1(story, office);
    await certifyP2Loader(story, office, p2);
    return {
      p1: field.p1,
      p2: p2.p2,
      p2Tdsr: p2.tdsr,
      dana: field.dana,
      luis: field.luis,
      people: field.monitors,
      field,
    };
  }

  private get world(): Made {
    if (this.made_ === undefined) throw new Error('The mission isn’t set up yet: adopt it first.');
    return this.made_;
  }

  private adopted(world: Made): void {
    this.made_ = world;
    this.cast = Object.fromEntries(
      Object.entries(world.people).map(([name, { monitorNumber, password }]) => [
        name,
        { name, monitorNumber, password },
      ]),
    ) as Record<P1MonitorName, MissionMonitor>;
    this.backOffice = p1BackOffice(this.stage.context, {
      dana: world.dana,
      luis: world.luis,
      p1: world.p1,
    });
  }

  // Dana's and Luis's sign-ins for the back office's screens: each made at the world's API as a
  // person's first sign-in is (their password set, their authenticator set up), handed over as
  // what they would type. The world keeps its own sessions for its reads.
  private async signIns(): Promise<Record<'dana' | 'luis', BackOfficeSignIn>> {
    const handed = (browser: Awaited<ReturnType<P1BackOffice['danas']>>, email: string) => {
      const { password, secret } = browser.handedOver();
      if (secret === null) throw new Error(`${email} has no authenticator.`);
      return { email, password, secret };
    };
    return {
      dana: handed(await this.backOffice.danas(), danasEmail),
      luis: handed(await this.backOffice.luiss(), luissEmail),
    };
  }

  // What the back office's screens set up, read by its names: P1 and P2, Coastline, the sites,
  // the forms and the unit rate work; then what the yard does with it, as the stories do: the six
  // monitors created on the yard's phone, Saturday's certifications on Sam's, and what they queued
  // worked.
  private async adopt(): Promise<void> {
    const story = this.stage.context;
    const { api } = story;
    const { yard, dana, luis } = this.before;
    const project = async (name: string) =>
      (await api.project.findFirstOrThrow({ where: { name } })).id;
    const p1 = await project('Bayline County ROW, Hurricane Delphine');
    const p2 = await project('Bayline County PPDR, Hurricane Delphine');
    const coastline = (
      await api.contractor.findFirstOrThrow({ where: { name: 'Coastline Haulers LLC' } })
    ).id;
    const site = async (projectId: string, name: string) =>
      (await api.disposalSite.findFirstOrThrow({ where: { projectId, name } })).id;
    const form = async (documentType: 'LOAD' | 'HAUL_OUT') =>
      (await api.form.findFirstOrThrow({ where: { projectId: p1, documentType } })).id;
    const monitors: Partial<Record<P1MonitorName, Awaited<ReturnType<StoryContext['monitor']>>>> =
      {};
    for (const name of p1Monitors) monitors[name] = await story.monitor(name, yard);
    const unitRateWork = [];
    for (const code of [
      'HNG-RMV-EA',
      'LNR-RMV-EA-24',
      'LNR-RMV-EA-99',
      'STP-RMV-EA-36',
      'STP-RMV-EA-48',
      'WG-RMV-EA',
      'CREW-TIME-HR',
    ]) {
      const item = await api.payItem.findFirstOrThrow({ where: { projectId: p1, code } });
      unitRateWork.push({ id: item.id, code });
    }
    const field: P1Field = {
      dana,
      luis,
      p1,
      coastline,
      tdsr: await site(p1, 'Marsh Road TDSR'),
      landfill: await site(p1, 'Bayline County Landfill'),
      cypress: await site(p1, 'Cypress Creek Landfill'),
      loadForm: await form('LOAD'),
      haulOutForm: await form('HAUL_OUT'),
      monitors: monitors as P1Field['monitors'],
      unitRateWork,
    };
    const office = {
      ...field,
      contract: (
        await api.contract.findFirstOrThrow({ where: { name: 'Coastline, Bayline ROW 2026' } })
      ).id,
      sam: field.monitors['Sam Grant'].id,
      lee: field.monitors['Lee Morgan'].id,
      samPhone: yard,
    };
    await certifyP1(story, office);
    await certifyP2Loader(story, office, { p2 });
    this.adopted({
      p1,
      p2,
      p2Tdsr: await site(p2, 'Marsh Road TDSR'),
      dana,
      luis,
      people: field.monitors,
      field,
    });
    await this.queue.ran(p1);
  }

  // One of the tests' asks, answered.
  async asked(ask: MissionAsked): Promise<MissionAnswer> {
    try {
      switch (ask.do) {
        case 'at':
          this.stage.context.clock.set(ask.time);
          return { ok: true };
        case 'people':
          return { ok: true, people: await this.signIns() };
        case 'adopt':
          await this.adopt();
          return { ok: true, cast: this.cast };
        case 'board':
          await this.boards();
          return { ok: true };
        case 'worker':
          await this.queue.settle(this.world.p1);
          await this.queue.settle(this.world.p2);
          return { ok: true };
        case 'review':
          await new MissionReview(
            this.stage.context,
            this.world.p1,
            this.backOffice,
            this.queue,
          ).done();
          return { ok: true };
        case 'read':
          return {
            ok: true,
            standing: {
              p1: await this.standing(this.world.p1, missionTicketNumbers.p1),
              p2: await this.standing(this.world.p2, missionTicketNumbers.p2),
            },
          };
        case 'audit':
          return {
            ok: true,
            audit: await new MissionAudit(
              await this.backOffice.luiss(),
              await this.backOffice.danas(),
              this.world.p1,
            ).read(),
          };
      }
    } catch (problem) {
      return { ok: false, error: problem instanceof Error ? problem.message : String(problem) };
    }
  }

  // Luis writes P1's boards for Monday and Tuesday and P2's for Monday, now by the world's
  // clock, each assignment naming the phone the browser enrolled under its name.
  private async boards(): Promise<void> {
    const story = this.stage.context;
    const enrolled = async <N extends string>(names: readonly N[]): Promise<Record<N, string>> => {
      const ids: Partial<Record<N, string>> = {};
      for (const name of names) {
        ids[name] = (await story.api.device.findFirstOrThrow({ where: { name } })).id;
      }
      return ids as Record<N, string>;
    };
    await boardP1(story, this.world.field, await enrolled<P1PhoneName>(p1Phones));
    await boardP2(
      story,
      {
        luis: this.world.luis,
        ana: this.world.people['Ana Brooks'].id,
        kim: this.world.people['Kim Nguyen'].id,
      },
      { p2: this.world.p2, tdsr: this.world.p2Tdsr },
      await enrolled<P2PhoneName>(p2Phones),
    );
  }

  // What stands on a project, read through the API at the back office's browsers: each ticket
  // the mission names that the project has, the review queue and the ledger.
  private async standing(projectId: string, numbers: readonly string[]): Promise<MissionStanding> {
    const luis = await this.backOffice.luiss();
    const codes = await this.payItemCodes();
    const tickets: TicketAnswer[] = [];
    for (const ticketNumber of numbers) {
      const workflow: WorkflowRead = ticketNumber.startsWith('2')
        ? 'HAUL_OUT'
        : ticketNumber.startsWith('3')
          ? 'UNIT_RATE'
          : 'LOAD';
      const asked = await luis.asked(readTicketEndpoint, {
        ids: { projectId, workflow, ticketNumber },
      });
      if (asked.status === 404) continue;
      if (asked.status !== 200) {
        throw new Error(`Ticket ${ticketNumber} was read ${String(asked.status)}.`);
      }
      tickets.push(ticketAnswerSchema.parse(asked.body));
    }
    const standingFlags = (ticket: TicketAnswer) =>
      ticket.flags
        .filter((flag) => flag.clearedAt === null)
        .sort((left, right) => (left.id < right.id ? -1 : 1))
        .map((flag) => flag.message);
    const queue: Partial<Record<WorkflowRead, string[]>> = {};
    for (const workflow of workflowsRead) {
      const answer = await luis.answered(reviewQueueEndpoint, {
        ids: { projectId },
        query: { workflow },
      });
      if (answer.next !== null) throw new Error('The review queue holds more than a page.');
      queue[workflow] = answer.tickets.map((ticket) =>
        queueLine(
          ticket.ticketNumber,
          ticket.statuses,
          ticket.flags.map((flag) => flag.message),
        ),
      );
    }
    const ledger = tickets
      .flatMap((ticket) =>
        ticket.lines.map((line) =>
          ledgerLine({
            ticketNumber: ticket.ticketNumber,
            splitSuffix: line.splitSuffix,
            slot: line.slot,
            code: codes.get(line.payItemId) ?? line.payItemId,
            quantity: line.quantity,
            rate: line.rate,
            amount: line.amount,
          }),
        ),
      )
      .sort();
    return {
      tickets: tickets.map((ticket) =>
        ticketLine(ticket.ticketNumber, ticket.statuses, standingFlags(ticket)),
      ),
      statuses: tickets
        .map((ticket) => `${ticket.ticketNumber} ${ticket.statuses.join(',')}`)
        .sort(),
      queue: queue as Record<WorkflowRead, string[]>,
      ledger,
      total: totalOf(ledger),
    };
  }

  // Every pay item's code on both projects, read at Dana's browser once.
  private async payItemCodes(): Promise<ReadonlyMap<string, string>> {
    this.codes ??= await payItemCodes(await this.backOffice.danas(), [
      this.world.p1,
      this.world.p2,
    ]);
    return this.codes;
  }

  async close(): Promise<void> {
    try {
      await this.stage.close();
    } finally {
      await this.made.drop();
    }
  }
}
