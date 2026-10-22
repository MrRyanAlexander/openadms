// The back office's own world, for its browser tests (ARCHITECTURE §14, §15; ADR-572): a database
// of its own, made as a story's is, served by the API's own process at the stories' address
// (`https://stories.adms.localhost`, over HTTPS through the stack's proxy) with the back office's
// world page on its CORS list (`https://office-world.adms.localhost`, the same site, so the
// session's cookies go with each call as they do at an installation). The installation's database
// is never written by a browser test.
//
// **What it holds when made**: P1 as Dana Reyes sets it up for its field days, with Luis Ortega
// and the six monitors on the yard phone (the shared step `setUpP1ForTheField`), on the story's
// clock at Thursday 8 October; Dana signed in at her browser.
//
// **What a test asks of it**, over a loopback control of its own (never the stack's, never a
// browser's), since the tests run in several processes at once:
// - `POST /people` a person of their own for the test (a name, a role, the grants of a
//   manager/analyst), created by Dana at her browser as an admin creates anybody: given a password
//   by Dana and nothing more (they sign in through the screens, choose their own password and set
//   their authenticator up there); or signed in already, their own password and authenticator set,
//   with their session's cookies handed to the test's browser. A person of a test's own never
//   shares a second step's code with another test (a code is good once).
// - `GET /mail?to=` what the API mailed an address (a reset's code), oldest first.
// - `GET /now` the world's time, which its API judges a session and an authenticator's code by
//   (the story's clock: it stands still unless a test moves it, `POST /later`).
import { createServer, type IncomingMessage, type Server } from 'node:http';

import {
  createPersonEndpoint,
  setPermissionsEndpoint,
  setPersonPasswordEndpoint,
} from '@open-adms/contracts';
import { permissions, type PermissionName } from '@open-adms/domain';

import { madeUpPassword, type OfficeBrowser } from './office-browser.ts';
import { storiesHostname } from './over-https.ts';
import { StoryStage } from './runner.ts';
import { danasEmail, p1TimeZone } from './stories/p1.ts';
import { setUpP1ForTheField, type P1Field } from './stories/p1-field-setup.ts';
import { StoryDatabase } from './story-database.ts';
import { StoryMail } from './story-mail.ts';

// A person a test asks for.
export interface PersonAsked {
  readonly name: string;
  readonly role: 'ADMIN' | 'MANAGER_ANALYST' | 'READ_ONLY_VIEWER';
  readonly grants?: readonly PermissionName[];
  readonly viewerKind?: 'CLIENT' | 'AUDITOR';
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
  private readonly field: P1Field;
  private readonly dana: OfficeBrowser;
  private control: Server | undefined;
  private count = 0;

  private constructor(
    made: StoryDatabase,
    stage: StoryStage,
    mail: StoryMail,
    field: P1Field,
    dana: OfficeBrowser,
  ) {
    this.made = made;
    this.database = made.name;
    this.stage = stage;
    this.mail = mail;
    this.field = field;
    this.dana = dana;
  }

  // The world made, its API listening for the one page origin given, and its control listening on
  // this machine's loopback. The caller closes it.
  static async opened(pageOrigin: string): Promise<OfficeWorld> {
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
      const yard = (await story.enrolled('P1-YARD')).id;
      const field = await setUpP1ForTheField(story, yard);
      const dana = await story.backOffice.admin({ id: field.dana, email: danasEmail });
      return new OfficeWorld(made, stage, mail, field, dana);
    } catch (problem) {
      await stage?.close();
      await made.drop();
      throw problem;
    }
  }

  // The control's origin, once listening.
  async listening(): Promise<string> {
    const server = createServer((asked, answer) => {
      void this.answered(asked).then(
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
      return { p1: this.field.p1, dana: this.field.dana, luis: this.field.luis };
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
    const body =
      asked.role === 'READ_ONLY_VIEWER'
        ? {
            name: asked.name,
            email,
            role: asked.role,
            viewerKind: asked.viewerKind ?? ('CLIENT' as const),
          }
        : { name: asked.name, email, role: asked.role };
    const made = await this.dana.answered(createPersonEndpoint, { json: body });
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

  async close(): Promise<void> {
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
