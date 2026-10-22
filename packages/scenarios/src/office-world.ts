// The back office's own world, for its browser tests (ARCHITECTURE §14, §15; ADR-572): a database
// of its own, made as a story's is, served by the API's own process at the stories' address
// (`https://stories.adms.localhost`, over HTTPS through the stack's proxy) with the back office's
// world page on its CORS list (`https://office-world.adms.localhost`, the same site, so the
// session's cookies go with each call as they do at an installation). The installation's database
// is never written by a browser test.
//
// **What it holds when made**: P1 as Dana Reyes sets it up for its field days, with Luis Ortega
// and the six monitors on the yard phone (the shared step `setUpP1ForTheField`), on the story's
// clock at Thursday 8 October; Dana signed in at her browser. And a day of Ana Brooks's own hours
// on P1's time clock, which Dana switches on: Luis assigns her on the yard phone for Thursday and
// Friday; on Friday morning she signs in on it and it sends Thursday's entries, in at 18:00, a
// break 20:00–20:30, out at 01:30 on Friday (a stretch past midnight, BUILD.md, settled 1). The
// world's clock then stands at Friday 9 October, 08:00.
//
// **What a test asks of it**, over a loopback control of its own (never the stack's, never a
// browser's), since the tests run in several processes at once:
// - `POST /people` a person of their own for the test (a name, a role, the grants of a
//   manager/analyst; a read-only viewer given every project of the world), created by Dana at her browser as an admin creates anybody: given a password
//   by Dana and nothing more (they sign in through the screens, choose their own password and set
//   their authenticator up there); or signed in already, their own password and authenticator set,
//   with their session's cookies handed to the test's browser. A person of a test's own never
//   shares a second step's code with another test (a code is good once).
// - `GET /mail?to=` what the API mailed an address (a reset's code), oldest first.
// - `GET /outcomes` the golden mission's approved outcomes (`goldenOutcomes`), which a test of
//   the mission's world checks what its screens made against.
// - `GET /now` the world's time, which its API judges a session and an authenticator's code by
//   (the story's clock: it stands still unless a test moves it, `POST /later`).
import { createServer, type IncomingMessage, type Server } from 'node:http';

import { randomUUID } from 'node:crypto';

import {
  changeProjectSettingsEndpoint,
  createPersonEndpoint,
  currentSessionEndpoint,
  setPermissionsEndpoint,
  setPersonPasswordEndpoint,
  setViewerProjectsEndpoint,
  type SyncedClockEntry,
} from '@open-adms/contracts';
import { permissions, type PermissionName } from '@open-adms/domain';

import { madeUpPassword, type OfficeBrowser } from './office-browser.ts';
import { storiesHostname } from './over-https.ts';
import { StoryStage } from './runner.ts';
import { assigned, synced, taken } from './stories/board.ts';
import { danasEmail, p1TimeZone } from './stories/p1.ts';
import { tellGoldenMission } from './stories/golden-mission.ts';
import { goldenOutcomes } from './stories/golden-outcomes.ts';
import type { QueueRuns } from './stories/p1-office.ts';
import { setUpP1ForTheField, type P1Field } from './stories/p1-field-setup.ts';
import { StoryDatabase } from './story-database.ts';
import { StoryMail } from './story-mail.ts';

// A person a test asks for.
export interface PersonAsked {
  readonly name: string;
  readonly role: 'ADMIN' | 'MANAGER_ANALYST' | 'READ_ONLY_VIEWER';
  readonly grants?: readonly PermissionName[];
  readonly viewerKind?: 'CLIENT' | 'AUDITOR' | 'CONTRACTOR';
  // A contractor user's contractor, by name.
  readonly contractor?: string;
  // Given a password by Dana and nothing more, or signed in already at the world's API.
  readonly as: 'givenPassword' | 'signedIn';
}

// The person made, as their test takes their place: the cookies only where signed in.
export interface PersonMade {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly secret: string | null;
  readonly cookies: readonly { readonly name: string; readonly value: string }[];
}

export class OfficeWorld {
  static readonly apiOrigin = `https://${storiesHostname}`;

  readonly database: string;
  private readonly made: StoryDatabase;
  private readonly stage: StoryStage;
  private readonly mail: StoryMail;
  private readonly ids: Readonly<Record<string, string>>;
  private readonly dana: OfficeBrowser;
  private readonly stopWorker: () => Promise<void>;
  private control: Server | undefined;
  private count = 0;
  // The control answers one ask at a time: Dana's browser is one browser.
  private turn: Promise<unknown> = Promise.resolve();

  private constructor(
    made: StoryDatabase,
    stage: StoryStage,
    mail: StoryMail,
    ids: Readonly<Record<string, string>>,
    dana: OfficeBrowser,
    stopWorker: () => Promise<void>,
  ) {
    this.made = made;
    this.database = made.name;
    this.stage = stage;
    this.mail = mail;
    this.ids = ids;
    this.dana = dana;
    this.stopWorker = stopWorker;
  }

  // The world made, its API listening for the one page origin given, and its control listening on
  // this machine's loopback. The caller closes it.
  static async opened(
    pageOrigin: string,
    kind: 'field' | 'mission' = 'field',
  ): Promise<OfficeWorld> {
    const made = await StoryDatabase.create();
    let stage: StoryStage | undefined;
    try {
      made.migrate();
      await made.seed();
      const mail = new StoryMail();
      stage = StoryStage.open({
        database: made,
        timeZone: p1TimeZone,
        start: '2026-10-08T08:00:00-04:00',
        out: () => undefined,
        checked: (passed) => {
          if (!passed) throw new Error('A check of the office world’s setup failed.');
        },
        corsOrigins: [pageOrigin],
        mail,
      });
      const story = stage.context;
      if (kind === 'mission') {
        const told = await tellGoldenMission(story, 'beforeReview');
        const dana = await story.backOffice.admin({ id: told.dana, email: danasEmail });
        const ids = { p1: told.p1, p2: told.p2, dana: told.dana, luis: told.luis };
        return new OfficeWorld(made, stage, mail, ids, dana, OfficeWorld.workerLoop(told.queue));
      }
      const yard = (await story.enrolled('P1-YARD')).id;
      const field = await setUpP1ForTheField(story, yard);
      const dana = await story.backOffice.admin({ id: field.dana, email: danasEmail });
      await OfficeWorld.anasHours(stage, field, dana, yard);
      const ids = {
        p1: field.p1,
        dana: field.dana,
        luis: field.luis,
        ana: field.monitors['Ana Brooks'].id,
      };
      return new OfficeWorld(made, stage, mail, ids, dana, () => Promise.resolve());
    } catch (problem) {
      await stage?.close();
      await made.drop();
      throw problem;
    }
  }

  // Ana Brooks's Thursday on P1's time clock, sent from the yard phone on Friday morning.
  private static async anasHours(
    stage: StoryStage,
    field: P1Field,
    dana: OfficeBrowser,
    yard: string,
  ): Promise<void> {
    const story = stage.context;
    await dana.answered(changeProjectSettingsEndpoint, {
      ids: { projectId: field.p1 },
      json: { timeClockEnabled: true },
    });
    const ana = field.monitors['Ana Brooks'];
    const assignments: Record<string, string> = {};
    for (const workDate of ['2026-10-08', '2026-10-09']) {
      assignments[workDate] = await assigned(story.api, story.clock, field.luis, {
        projectId: field.p1,
        personId: ana.id,
        workDate,
        fieldEventKinds: ['COLLECTION'],
        deviceId: yard,
      });
    }
    story.clock.set('2026-10-09T07:30:00-04:00');
    await taken(story, ana, yard);
    const entry = (kind: SyncedClockEntry['kind'], at: string): SyncedClockEntry => ({
      id: randomUUID(),
      projectId: field.p1,
      assignmentId: assignments['2026-10-08'] ?? '',
      workerId: ana.id,
      kind,
      at: new Date(at).toISOString(),
      deviceUtcOffsetMinutes: -240,
      activityLines: [],
    });
    await synced(story, yard, p1TimeZone, {
      records: [
        entry('IN', '2026-10-08T18:00:00-04:00'),
        entry('BREAK_START', '2026-10-08T20:00:00-04:00'),
        entry('BREAK_END', '2026-10-08T20:30:00-04:00'),
        entry('OUT', '2026-10-09T01:30:00-04:00'),
      ].map((clockEntry) => ({ record: 'CLOCK_ENTRY' as const, clockEntry })),
    });
    story.clock.set('2026-10-09T08:00:00-04:00');
    // Dana's session went quiet while the clock moved on a day: she signs in again now, once,
    // before any test asks her for anything.
    await dana.answered(currentSessionEndpoint);
  }

  // The control's origin, once listening.
  async listening(): Promise<string> {
    const server = createServer((asked, answer) => {
      const answering = this.turn.then(() => this.answered(asked));
      this.turn = answering.catch(() => undefined);
      void answering.then(
        (body) => {
          answer.writeHead(200, { 'content-type': 'application/json' });
          answer.end(JSON.stringify(body));
        },
        (problem: unknown) => {
          answer.writeHead(500, { 'content-type': 'application/json' });
          answer.end(JSON.stringify({ problem: String(problem) }));
        },
      );
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    this.control = server;
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('No port.');
    return `http://127.0.0.1:${String(address.port)}`;
  }

  private async answered(asked: IncomingMessage): Promise<unknown> {
    const url = new URL(asked.url ?? '/', 'http://127.0.0.1');
    if (asked.method === 'POST' && url.pathname === '/people') {
      return this.person(JSON.parse(await bodyOf(asked)) as PersonAsked);
    }
    if (asked.method === 'GET' && url.pathname === '/mail') {
      return this.mail.to(url.searchParams.get('to') ?? '');
    }
    if (asked.method === 'GET' && url.pathname === '/now') {
      return { now: this.stage.context.clock.now().toISOString() };
    }
    if (asked.method === 'POST' && url.pathname === '/later') {
      const { seconds } = JSON.parse(await bodyOf(asked)) as { seconds: number };
      const clock = this.stage.context.clock;
      clock.set(new Date(clock.now().getTime() + seconds * 1000).toISOString());
      return { now: clock.now().toISOString() };
    }
    if (asked.method === 'GET' && url.pathname === '/world') {
      return this.ids;
    }
    if (asked.method === 'GET' && url.pathname === '/outcomes') {
      return goldenOutcomes;
    }
    throw new Error(`Nothing is asked at ${asked.method ?? ''} ${url.pathname}.`);
  }

  // A person of the test's own, created by Dana at her browser.
  private async person(asked: PersonAsked): Promise<PersonMade> {
    this.count += 1;
    const slug = asked.name
      .toLowerCase()
      .replace(/[^a-z]+/g, '.')
      .replace(/^\.|\.$/g, '');
    const email = `${slug}.${String(this.count)}@gates.example`;
    const viewerKind = asked.viewerKind ?? 'CLIENT';
    // A contractor user belongs to its contractor, found by name.
    const contractorId =
      viewerKind === 'CONTRACTOR'
        ? (
            await this.stage.context.api.contractor.findFirstOrThrow({
              where: { name: asked.contractor ?? '' },
            })
          ).id
        : undefined;
    const body =
      asked.role !== 'READ_ONLY_VIEWER'
        ? { name: asked.name, email, role: asked.role }
        : contractorId === undefined
          ? { name: asked.name, email, role: asked.role, viewerKind: viewerKind === 'AUDITOR' ? ('AUDITOR' as const) : ('CLIENT' as const) }
          : {
              name: asked.name,
              email,
              role: asked.role,
              viewerKind: 'CONTRACTOR' as const,
              contractorId,
            };
    const made = await this.dana.answered(createPersonEndpoint, { json: body });
    // A read-only viewer is given every project of the world.
    if (asked.role === 'READ_ONLY_VIEWER') {
      await this.dana.answered(setViewerProjectsEndpoint, {
        ids: { userId: made.id },
        json: {
          projectIds: [this.ids['p1'], this.ids['p2']].filter((id) => id !== undefined),
        },
      });
    }
    const grants = (asked.grants ?? []).filter((grant) => permissions.includes(grant));
    if (asked.role === 'MANAGER_ANALYST' && grants.length > 0) {
      await this.dana.answered(setPermissionsEndpoint, {
        ids: { userId: made.id },
        json: { permissions: grants },
      });
    }
    if (asked.as === 'givenPassword') {
      const password = madeUpPassword();
      await this.dana.answered(setPersonPasswordEndpoint, {
        ids: { userId: made.id },
        json: { password },
      });
      return { userId: made.id, name: asked.name, email, password, secret: null, cookies: [] };
    }
    const browser = await this.stage.context.backOffice.person(this.dana, {
      id: made.id,
      email,
    });
    return { userId: made.id, name: asked.name, email, ...browser.handedOver() };
  }

  // The worker's job loop behind the world: a pass every half second, one at a time; stopped, the
  // pass under way is waited for.
  private static workerLoop(queue: QueueRuns): () => Promise<void> {
    let running = true;
    const loop = (async () => {
      while (running) {
        await queue.pass();
        await new Promise((done) => setTimeout(done, 500));
      }
    })();
    return async () => {
      running = false;
      await loop;
    };
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await new Promise<void>((done) => {
      if (this.control === undefined) done();
      else
        this.control.close(() => {
          done();
        });
    });
    await this.stage.close();
    await this.made.drop();
  }
}

function bodyOf(asked: IncomingMessage): Promise<string> {
  return new Promise((done, failed) => {
    const parts: Buffer[] = [];
    asked.on('data', (part: Buffer) => parts.push(part));
    asked.on('end', () => {
      done(Buffer.concat(parts).toString('utf8'));
    });
    asked.on('error', failed);
  });
}
