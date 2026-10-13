// A story's own API (ARCHITECTURE §6, §15; BACKLOG 2.7.1, C31, C134; ADR-491): the API's process
// itself, `ApiProcess` with `ApiModule` as `apps/api/src/main.ts` starts it, every endpoint and
// the boundary every request passes, run on the story's own database and on the story's clock,
// listening on this machine at 127.0.0.1:3180, and reached only over HTTPS through the local
// stack's proxy (`OverHttps`). The installation's own API, in its container, keeps the
// installation's database and the real time, so no story could run on it.
//
// - **Started when a story first asks it**, and stopped when the story ends: a story that never
//   asks starts nothing. One at a time: a second run while one holds the port is told so.
// - **One clock at a time.** A process has one clock: each request runs on the clock of the
//   server it was sent through (the story's, or a clock of field days told again), and two
//   requests at once on two clocks stop the story.
// - **A phone proves itself as a real one does** (ARCHITECTURE §7.4): it asks a challenge, signs
//   it with its own device key and holds the token it is given until it runs out by the clock
//   in use, then proves itself again; a request answered `PHONE_NOT_PROVEN` proves it again once.
// - **Every request a story's phone makes goes through its endpoint** (BACKLOG 2.7.1 part 2):
//   enrolment, a monitor created, a sign-in, a session under the master passcode and what a
//   setup picks from, its lists, a sync, a file's part and the turn-in. **A phone holds its
//   monitor's session** as it holds its own token: a sign-in or a session opened on it is the
//   one its monitor's requests carry, in the contracts' header beside the phone's token.
// - **A person of the back office or a read-only viewer reaches it at their browser** (BACKLOG
//   2.7.1 part 4): signed in with their email address, password and authenticator's code, the
//   session held only as the cookies it sets, its CSRF value sent with every call that isn't a
//   GET (`OfficeBrowser`).
// - **Started again**, it holds nothing in memory: no part of a file not yet whole, no count.
import {
  challengePhoneEndpoint,
  createMonitorOnPhoneEndpoint,
  enrolPhoneEndpoint,
  filePartMediaType,
  monitorCreatedAnswerSchema,
  monitorSessionHeader,
  monitorSignedInAnswerSchema,
  openPasscodeSessionOnPhoneEndpoint,
  passcodeSessionOpenedAnswerSchema,
  phoneChallengeAnswerSchema,
  phoneEnrolledAnswerSchema,
  phoneListsAnswerSchema,
  phoneListsEndpoint,
  phoneProvenAnswerSchema,
  phoneSetupChoicesAnswerSchema,
  phoneSetupChoicesEndpoint,
  provePhoneEndpoint,
  sendPhotoFilePartEndpoint,
  signInOnPhoneEndpoint,
  syncAnsweredSchema,
  syncPhoneEndpoint,
  turnInAnswerSchema,
  turnInPhoneEndpoint,
  type Endpoint,
  type MonitorCreatedAnswer,
  type MonitorSignedInAnswer,
  type PasscodeSessionOpenedAnswer,
  type PhoneEnrolledAnswer,
  type PhoneListsAnswer,
  type PhoneSetupChoicesAnswer,
} from '@open-adms/contracts';
import type { MasterPasscodeSessionKind } from '@open-adms/domain';
import { ApiModule, ApiProcess, NoMail, type Addresses } from '@open-adms/api';
import type { Policy } from '@open-adms/domain';

import { answered, codeOf, OverHttps, type Asked, type AskedWith } from './over-https.ts';
import type { PhoneServer } from './device.ts';
import type { SoftwareKey } from './software-key.ts';
import type { StoryDatabase } from './story-database.ts';
import type { StoryMedia } from './story-media.ts';

// The signing secret of a story's API: made up, the same for every story, used nowhere else.
export const storySigningSecret = 'made-up-signing-secret-for-the-stories-only';

// Where the stories' API listens: the stack's proxy names it (infra/local/Caddyfile).
export const storyApiPort = 3180;

interface Clock {
  now(): Date;
}

// No story looks an address up through its API: the address server is the API's own tests'.
const noAddresses: Addresses = {
  addressOf: () => Promise.reject(new Error('A story’s API asks no address server.')),
};

// Every request a story's phone makes, on one clock: each answer as the contracts read it, and
// any answer but a 200 stops the story. The passcode is typed by whoever holds it, so it is
// handed in; a monitor's password likewise.
export interface PhoneRequests {
  // A sync, a file's part, a turn-in.
  readonly server: PhoneServer;
  // Enrolled under the master passcode, nobody signed in: the phone's id.
  enrol(sent: {
    readonly name: string;
    readonly passcode: string;
    readonly publicKey: string;
  }): Promise<PhoneEnrolledAnswer>;
  // A monitor created on the phone under the master passcode.
  monitorCreated(
    deviceId: string,
    sent: { readonly name: string; readonly password: string; readonly passcode: string },
  ): Promise<MonitorCreatedAnswer>;
  // A monitor signs in on the phone, which holds their session from then on.
  signedIn(
    deviceId: string,
    sent: { readonly monitorNumber: string; readonly password: string },
  ): Promise<MonitorSignedInAnswer>;
  // A session opened on the phone under the master passcode, which the phone holds likewise.
  passcodeSession(
    deviceId: string,
    sent: {
      readonly personId: string;
      readonly kind: MasterPasscodeSessionKind;
      readonly passcode: string;
    },
  ): Promise<PasscodeSessionOpenedAnswer>;
  // What a setup under the master passcode picks from, nobody signed in.
  setupChoices(
    deviceId: string,
    sent: {
      readonly passcode: string;
      readonly projectId: string | null;
      readonly monitorsAfter: string | null;
    },
  ): Promise<PhoneSetupChoicesAnswer>;
  // The lists of the assignment the phone takes now for the monitor signed in on it.
  lists(deviceId: string): Promise<PhoneListsAnswer>;
}

export interface StoryApiParts {
  readonly database: StoryDatabase;
  readonly clock: Clock;
  readonly policy: Policy;
  readonly media: StoryMedia;
}

export class StoryApi {
  private readonly parts: StoryApiParts;
  private readonly keys = new Map<string, SoftwareKey>();
  private readonly tokens = new Map<string, { readonly token: string; readonly until: Date }>();
  // The session of the monitor signed in on each phone, as the phone holds it.
  private readonly sessions = new Map<string, string>();
  private door: OverHttps | undefined;
  private process: ApiProcess | undefined;
  private starting: Promise<ApiProcess> | undefined;
  // The clock the requests in flight are told on, and how many are.
  private on: Clock;
  private inFlight = 0;

  constructor(parts: StoryApiParts) {
    this.parts = parts;
    this.on = parts.clock;
  }

  // A phone the story enrolled: its key, which only it holds, signs its challenges.
  enrolled(deviceId: string, key: SoftwareKey): void {
    this.keys.set(deviceId, key);
  }

  // Every request a phone makes, on a clock. Started again, the process is stopped before the
  // first request sent through these, and starts afresh.
  requests(at: Clock, startedAgain = false): PhoneRequests {
    let restart = startedAgain;
    const asked = async <T>(work: () => Promise<T>): Promise<T> => {
      if (restart) {
        restart = false;
        await this.stop();
      }
      return this.during(at, work);
    };
    const holding = <T extends { readonly token: string }>(deviceId: string, answer: T): T => {
      this.sessions.set(deviceId, answer.token);
      return answer;
    };
    return {
      server: {
        received: (deviceId, sent) =>
          asked(async () => ({
            answered: syncAnsweredSchema.parse(
              await this.asPhone(deviceId, syncPhoneEndpoint, { json: sent }),
            ),
          })),
        filePart: (deviceId, part) =>
          asked(() =>
            this.asPhone(deviceId, sendPhotoFilePartEndpoint, {
              ids: { photoId: part.photoId, file: part.file },
              query: { offset: String(part.offset), length: String(part.length) },
              bytes: { of: part.bytes, contentType: filePartMediaType },
            }),
          ),
        turnIn: (deviceId, sent) =>
          asked(async () =>
            turnInAnswerSchema.parse(
              await this.asPhone(deviceId, turnInPhoneEndpoint, { json: sent }),
            ),
          ),
      },
      enrol: (sent) =>
        asked(async () =>
          phoneEnrolledAnswerSchema.parse(
            answered(enrolPhoneEndpoint, await this.ask(enrolPhoneEndpoint, { json: sent })),
          ),
        ),
      monitorCreated: (deviceId, sent) =>
        asked(async () =>
          monitorCreatedAnswerSchema.parse(
            await this.asPhone(deviceId, createMonitorOnPhoneEndpoint, { json: sent }),
          ),
        ),
      signedIn: (deviceId, sent) =>
        asked(async () =>
          holding(
            deviceId,
            monitorSignedInAnswerSchema.parse(
              await this.asPhone(deviceId, signInOnPhoneEndpoint, { json: sent }),
            ),
          ),
        ),
      passcodeSession: (deviceId, sent) =>
        asked(async () =>
          holding(
            deviceId,
            passcodeSessionOpenedAnswerSchema.parse(
              await this.asPhone(deviceId, openPasscodeSessionOnPhoneEndpoint, { json: sent }),
            ),
          ),
        ),
      setupChoices: (deviceId, sent) =>
        asked(async () =>
          phoneSetupChoicesAnswerSchema.parse(
            await this.asPhone(deviceId, phoneSetupChoicesEndpoint, { json: sent }),
          ),
        ),
      lists: (deviceId) =>
        asked(async () =>
          phoneListsAnswerSchema.parse(await this.asMonitor(deviceId, phoneListsEndpoint, {})),
        ),
    };
  }

  // A phone proves itself, as its sync begins (ARCHITECTURE §9 (1); AC-05-03, AC-10-45), on the
  // story's clock: it asks a challenge, signs it with the key only it holds and sends both back;
  // proven, it holds the token it is given, and its next request sends that. What it was
  // answered (`PROVEN`, or the API's one code for a proof that isn't one), and the same signed
  // answer sent again.
  async proves(deviceId: string): Promise<{ readonly answer: string; again(): Promise<string> }> {
    return this.during(this.parts.clock, async () => {
      const proof = await this.signedChallenge(deviceId);
      const answer = await this.proved(deviceId, proof);
      return {
        answer,
        again: () =>
          this.during(this.parts.clock, async () =>
            proofAnswer(await this.ask(provePhoneEndpoint, { ids: { deviceId }, json: proof })),
          ),
      };
    });
  }

  // A request of a person at their browser (BACKLOG 2.7.1 part 4): on the story's clock, with
  // the cookies and the CSRF value the browser holds (`OfficeBrowser`). The answer as it came.
  sent(served: Endpoint, more: AskedWith): Promise<Asked> {
    return this.during(this.parts.clock, () => this.ask(served, more));
  }

  // Stops the process, where one runs, and closes the way to it.
  async close(): Promise<void> {
    await this.stop();
    this.door?.close();
    this.door = undefined;
  }

  private async stop(): Promise<void> {
    const running = this.process;
    this.process = undefined;
    await running?.close();
  }

  private async during<T>(at: Clock, work: () => Promise<T>): Promise<T> {
    if (this.inFlight > 0 && this.on !== at) {
      throw new Error('Two of the story’s requests at once on two clocks: its API has one.');
    }
    this.on = at;
    this.inFlight += 1;
    try {
      return await work();
    } finally {
      this.inFlight -= 1;
    }
  }

  // A request of a proven phone: its token, proving itself first where it holds none that is
  // good now, and once more where the API says it isn't proven. The answer's body; any answer
  // but a 200 stops the story, saying what came back.
  private async asPhone(deviceId: string, served: Endpoint, more: AskedWith): Promise<unknown> {
    let answer = await this.ask(served, this.withToken(more, await this.tokenOf(deviceId)));
    if (answer.status === 401 && codeOf(answer) === 'PHONE_NOT_PROVEN') {
      this.tokens.delete(deviceId);
      answer = await this.ask(served, this.withToken(more, await this.tokenOf(deviceId)));
    }
    return answered(served, answer);
  }

  // A request of the monitor signed in on a proven phone: the phone's token and the session the
  // phone holds for its monitor, side by side (ADR-443).
  private asMonitor(deviceId: string, served: Endpoint, more: AskedWith): Promise<unknown> {
    const session = this.sessions.get(deviceId);
    if (session === undefined) {
      throw new Error(`${served.name} was asked on a phone nobody is signed in on.`);
    }
    return this.asPhone(deviceId, served, {
      ...more,
      headers: { ...more.headers, [monitorSessionHeader]: session },
    });
  }

  private withToken(more: AskedWith, token: string): AskedWith {
    return { ...more, headers: { ...more.headers, authorization: `Bearer ${token}` } };
  }

  private async tokenOf(deviceId: string): Promise<string> {
    const held = this.tokens.get(deviceId);
    if (held !== undefined && this.on.now() < held.until) return held.token;
    const answer = await this.proved(deviceId, await this.signedChallenge(deviceId));
    const token = this.tokens.get(deviceId)?.token;
    if (token === undefined) throw new Error(`provePhone was answered ${answer}.`);
    return token;
  }

  // A challenge the API made for the phone, signed with its own key.
  private async signedChallenge(
    deviceId: string,
  ): Promise<{ readonly challenge: string; readonly signature: string }> {
    const key = this.keys.get(deviceId);
    if (key === undefined) throw new Error('A phone the story never enrolled can’t prove itself.');
    const { challenge } = phoneChallengeAnswerSchema.parse(
      answered(
        challengePhoneEndpoint,
        await this.ask(challengePhoneEndpoint, { ids: { deviceId } }),
      ),
    );
    return { challenge, signature: key.signed(challenge) };
  }

  // The proof sent: proven, the phone holds its token until it runs out by the clock in use.
  private async proved(
    deviceId: string,
    proof: { readonly challenge: string; readonly signature: string },
  ): Promise<string> {
    const now = this.on.now();
    const answer = await this.ask(provePhoneEndpoint, { ids: { deviceId }, json: proof });
    if (answer.status === 200) {
      const proven = phoneProvenAnswerSchema.parse(answer.body);
      this.tokens.set(deviceId, {
        token: proven.token,
        until: new Date(now.getTime() + proven.expiresInSeconds * 1000),
      });
    }
    return proofAnswer(answer);
  }

  private async ask(served: Endpoint, more: AskedWith): Promise<Asked> {
    await this.started();
    this.door ??= new OverHttps();
    return this.door.ask(served, more);
  }

  private async started(): Promise<void> {
    if (this.process !== undefined) return;
    this.starting ??= this.start();
    try {
      this.process = await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  private async start(): Promise<ApiProcess> {
    const { database, policy, media } = this.parts;
    const api = await ApiProcess.create(
      ApiModule,
      {
        host: '127.0.0.1',
        port: storyApiPort,
        // Unread: the process is handed the story's own clients below.
        databaseUrl: '',
        readOnlyDatabaseUrl: '',
        // No browser asks a story's API.
        corsOrigins: [],
        // No proxy is believed: a caller's address is the one that connected.
        trustedProxies: [],
        tokenSigningSecret: storySigningSecret,
        smtpUrl: '',
        smtpAddress: undefined,
        mailFrom: 'open-adms@adms.localhost',
        addressesUrl: 'https://addresses.adms.localhost',
        mapCaFile: null,
        mapServersAt: undefined,
        media: {
          url: 'https://s3.adms.localhost',
          bucket: 'adms-media',
          region: 'us-east-1',
          accessKey: 'unread',
          secretKey: 'unread',
          caFile: null,
          at: undefined,
        },
      },
      policy,
      {
        // The API's log goes nowhere: a story says what happens itself.
        stream: { write: () => undefined },
        database: database.open('api'),
        viewerDatabase: database.openViewer(),
        mail: new NoMail(),
        clock: { now: () => this.on.now() },
        addresses: noAddresses,
        media,
      },
    );
    try {
      await api.listen();
    } catch (problem) {
      await api.close();
      throw new Error(
        `The stories’ API could not listen at 127.0.0.1:${String(storyApiPort)}; another run ` +
          `of the stories may hold it (${problem instanceof Error ? problem.message : String(problem)}).`,
        { cause: problem },
      );
    }
    return api;
  }
}

// A proof's answer: proven, or the code it was refused with.
function proofAnswer(answer: Asked): string {
  return answer.status === 200 ? 'PROVEN' : (codeOf(answer) ?? `answered ${String(answer.status)}`);
}
