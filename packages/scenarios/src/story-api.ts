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
// - **What a phone sends goes with somebody signed in on it** (ADR-531): its monitor's session
//   while it lasts by the clock in use; once it has run out (a story's phone goes on recording
//   for days after its monitor's sign-in), or where nobody signed in on it, the master user at
//   the phone: **a phone nobody is signed in on proves itself with the story's master passcode
//   beside its key**, as whoever holds the passcode does at the yard, and that one token does
//   all its key's does besides. A sync and a file's part alike; the turn-in carries the passcode.
// - **A person of the back office or a read-only viewer reaches it at their browser** (BACKLOG
//   2.7.1 part 4): signed in with their email address, password and authenticator's code, the
//   session held only as the cookies it sets, its CSRF value sent with every call that isn't a
//   GET (`OfficeBrowser`).
// - **Started again**, it holds nothing in memory: no part of a file not yet whole, no count.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  challengePhoneEndpoint,
  createMonitorOnPhoneEndpoint,
  enrolPhoneEndpoint,
  errorAnswerSchema,
  filePartMediaType,
  monitorCreatedAnswerSchema,
  monitorSessionHeader,
  monitorSignedInAnswerSchema,
  offlineSignInTakenAnswerSchema,
  openPasscodeSessionOnPhoneEndpoint,
  passcodeSessionOpenedAnswerSchema,
  phoneChallengeAnswerSchema,
  phoneEnrolledAnswerSchema,
  phoneListsAnswerSchema,
  phoneListsEndpoint,
  phoneLoginListAnswerSchema,
  phoneLoginListEndpoint,
  phoneProvenAnswerSchema,
  phoneSetupChoicesAnswerSchema,
  phoneSetupChoicesEndpoint,
  provePhoneEndpoint,
  sendPhotoFilePartEndpoint,
  signInOnPhoneEndpoint,
  syncAnsweredSchema,
  syncPhoneEndpoint,
  takeOfflineSignInOnPhoneEndpoint,
  toldToWait as waitAsked,
  turnInAnswerSchema,
  turnInPhoneEndpoint,
  type Endpoint,
  type MonitorCreatedAnswer,
  type MonitorSignedInAnswer,
  type OfflineSignInReport,
  type PasscodeSessionOpenedAnswer,
  type PhoneEnrolledAnswer,
  type PhoneListsAnswer,
  type PhoneLoginListAnswer,
  type PhoneSetupChoicesAnswer,
} from '@open-adms/contracts';
import type { MasterPasscodeSessionKind } from '@open-adms/domain';
import { ApiModule, ApiProcess, NoMail, type Addresses } from '@open-adms/api';
import type { Actor, Database, Prisma } from '@open-adms/db';
import type { Policy } from '@open-adms/domain';

import { localMapServers } from './map-servers.ts';
import { answered, codeOf, OverHttps, type Asked, type AskedWith } from './over-https.ts';
import { ToldToWait, type PhoneServer } from './device.ts';
import type { SoftwareKey } from './software-key.ts';
import { storyMasterPasscode, type StoryDatabase } from './story-database.ts';
import type { StoryMedia } from './story-media.ts';

// The signing secret of a story's API, and its password and sealing keys (ADR-542): made up, the
// same for every story, used nowhere else.
export const storySigningSecret = 'made-up-signing-secret-for-the-stories-only';
export const storyPasswordKey = 'made-up-password-key-for-the-stories-only';
export const storySealingKey = 'made-up-sealing-key-for-the-stories-only';

// Where the stories' API listens: the stack's proxy names it (infra/local/Caddyfile).
export const storyApiPort = 3180;

// The stack's certificate for a process on this machine (infra/local/src/certificates.ts), which
// `pnpm local:up` makes: the stories' API serves HTTPS with it, as the API's container does with
// its own.
function storyApiTls(): { certFile: string; keyFile: string } {
  const tls = new URL('../../../infra/local/.generated/tls/', import.meta.url);
  const certFile = fileURLToPath(new URL('host.crt', tls));
  const keyFile = fileURLToPath(new URL('host.key', tls));
  if (!existsSync(certFile) || !existsSync(keyFile)) {
    throw new Error('The local stack has no certificates yet: run `pnpm local:up`.');
  }
  return { certFile, keyFile };
}

interface Clock {
  now(): Date;
}

// No story looks an address up through its API: the address server is the API's own tests', and
// the field app's browser world's (ADR-593), which asks the local stack's.
const noAddresses: Addresses = {
  addressOf: () => Promise.reject(new Error('A story’s API asks no address server.')),
};

// Every request a story's phone makes, on one clock: each answer as the contracts read it, and
// any answer but a 200 stops the story, but a limit reached (`429 LIMITED`): the phone is told
// to wait the seconds the answer says (`ToldToWait`; ADR-505). The passcode is typed by whoever holds it, so it is
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
  // The login list, asked by the monitor signed in on it, saying what the phone holds.
  loginList(
    deviceId: string,
    held: {
      readonly masterPasscodeVersion: number | null;
      readonly entries: readonly { readonly monitorId: string; readonly mark: string }[];
    },
  ): Promise<PhoneLoginListAnswer>;
  // A sign-in made with no connection, reported (ADR-531): taken, the phone holds the session it
  // is given; refused, the API's one code, which stops no story.
  offlineSignIn(deviceId: string, report: OfflineSignInReport): Promise<string>;
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
  // Each phone's token, until when, and whether it was proven with the passcode beside its key.
  private readonly tokens = new Map<
    string,
    { readonly token: string; readonly until: Date; readonly withPasscode: boolean }
  >();
  // The session of the monitor signed in on each phone, as the phone holds it, and until when.
  private readonly sessions = new Map<string, { readonly token: string; readonly until: Date }>();
  private door: OverHttps | undefined;
  private process: ApiProcess | undefined;
  private starting: Promise<ApiProcess> | undefined;
  // Closed when the story ends: a request still in flight then is refused, never served by a
  // process started again that nobody would stop (ADR-505).
  private closed = false;
  // A proof under way, by phone: a phone's requests at once wait on its one proof, as a real
  // phone's do, never each proving it again and spending the challenge the others answer.
  private readonly proving = new Map<string, Promise<string>>();
  // The clock the requests in flight are told on, and how many are.
  private on: Clock;
  private inFlight = 0;
  // The API's last few error lines (a failure's kind and frames, never what was sent: ADR-385),
  // so a story stopped on a 5xx says why (C155).
  private readonly errorLines: string[] = [];
  private readonly waited: number[] = [];

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
    const holding = <T extends { readonly token: string; readonly expiresInSeconds: number }>(
      deviceId: string,
      answer: T,
    ): T => {
      const until = new Date(at.now().getTime() + answer.expiresInSeconds * 1000);
      this.sessions.set(deviceId, { token: answer.token, until });
      return answer;
    };
    return {
      server: {
        received: (deviceId, sent) =>
          asked(async () => ({
            answered: syncAnsweredSchema.parse(
              await this.asSender(deviceId, syncPhoneEndpoint, { json: sent }),
            ),
          })),
        filePart: (deviceId, part) =>
          asked(() =>
            this.asSender(deviceId, sendPhotoFilePartEndpoint, {
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
      loginList: (deviceId, held) =>
        asked(async () =>
          phoneLoginListAnswerSchema.parse(
            await this.asMonitor(deviceId, phoneLoginListEndpoint, { json: held }),
          ),
        ),
      offlineSignIn: (deviceId, report) =>
        asked(async () => {
          const answer = await this.askedAsPhone(
            deviceId,
            takeOfflineSignInOnPhoneEndpoint,
            { json: report },
            false,
          );
          toldToWait(answer);
          if (answer.status !== 200) return codeOf(answer) ?? String(answer.status);
          holding(deviceId, offlineSignInTakenAnswerSchema.parse(answer.body));
          return 'TAKEN';
        }),
    };
  }

  // A phone proves itself, as its sync begins (ARCHITECTURE §9 (1); AC-05-03, AC-10-45), on the
  // story's clock: it asks a challenge, signs it with the key only it holds and sends both back;
  // proven, it holds the token it is given, and its next request sends that. What it was
  // answered (`PROVEN`, or the API's one code for a proof that isn't one), and the same signed
  // answer sent again. Whoever holds the master passcode types it beside the phone's signature
  // for a phone whose key the firm's time revoked (ADR-530): `passcode`.
  async proves(
    deviceId: string,
    passcode?: string,
  ): Promise<{ readonly answer: string; again(): Promise<string> }> {
    return this.during(this.parts.clock, async () => {
      const signed = await this.signedChallenge(deviceId);
      const proof = passcode === undefined ? signed : { ...signed, passcode };
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

  // Stops the process, where one runs, and closes the way to it, for good.
  async close(): Promise<void> {
    this.closed = true;
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
    } catch (problem) {
      if (problem instanceof Error && / was answered 5\d\d /.test(problem.message)) {
        const logged = this.errorLines.length === 0 ? ['nothing'] : this.errorLines.toReversed();
        throw new Error(
          `${problem.message} The stories’ API logged, last first:\n${logged.join('\n')}`,
          { cause: problem },
        );
      }
      throw problem;
    } finally {
      this.inFlight -= 1;
    }
  }

  private kept(line: string): void {
    if (!/"level":(50|60)\b/.test(line)) return;
    this.errorLines.push(line.trim());
    if (this.errorLines.length > 5) this.errorLines.shift();
  }

  // A request of a proven phone: its token, proving itself first where it holds none that is
  // good now, and once more where the API says it isn't proven. The answer's body; a limit
  // reached, the phone told to wait; any other answer but a 200 stops the story, saying what
  // came back. `master`: the request needs the master user at the phone (ADR-531).
  private async asPhone(
    deviceId: string,
    served: Endpoint,
    more: AskedWith,
    master = false,
  ): Promise<unknown> {
    const answer = await this.askedAsPhone(deviceId, served, more, master);
    toldToWait(answer);
    return answered(served, answer);
  }

  private async askedAsPhone(
    deviceId: string,
    served: Endpoint,
    more: AskedWith,
    master: boolean,
  ): Promise<Asked> {
    let answer = await this.ask(served, this.withToken(more, await this.tokenOf(deviceId, master)));
    if (answer.status === 401 && codeOf(answer) === 'PHONE_NOT_PROVEN') {
      this.tokens.delete(deviceId);
      answer = await this.ask(served, this.withToken(more, await this.tokenOf(deviceId, master)));
    }
    return answer;
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
      headers: { ...more.headers, [monitorSessionHeader]: session.token },
    });
  }

  // What a phone sends, with somebody signed in on it (ADR-531): its monitor's session while it
  // lasts, else the master user, by its proof with the story's passcode beside its key. A session
  // the server ended meanwhile (a sign-in on the phone since, reported from offline) is dropped,
  // and the master user sends, as a supervisor at the phone would.
  private async asSender(deviceId: string, served: Endpoint, more: AskedWith): Promise<unknown> {
    const session = this.sessions.get(deviceId);
    let answer =
      session !== undefined && this.signedIn(deviceId)
        ? await this.askedAsPhone(
            deviceId,
            served,
            { ...more, headers: { ...more.headers, [monitorSessionHeader]: session.token } },
            false,
          )
        : await this.askedAsPhone(deviceId, served, more, true);
    if (answer.status === 401 && codeOf(answer) === 'NOT_SIGNED_IN') {
      this.sessions.delete(deviceId);
      answer = await this.askedAsPhone(deviceId, served, more, true);
    }
    toldToWait(answer);
    return answered(served, answer);
  }

  // Whether the phone holds a monitor's session good now.
  private signedIn(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    return session !== undefined && this.on.now() < session.until;
  }

  private withToken(more: AskedWith, token: string): AskedWith {
    return { ...more, headers: { ...more.headers, authorization: `Bearer ${token}` } };
  }

  // The phone's token good now. A phone nobody is signed in on proves itself with the story's
  // master passcode beside its key, the master user at it, as at the yard: the one token then
  // does all a key's proof does besides (ADR-531), and two proofs of one phone never meet at one
  // moment of the story's clock (a phone answers only a challenge made after its last). One
  // proof of a phone at a time (ADR-505).
  private async tokenOf(deviceId: string, master = false): Promise<string> {
    const held = this.tokens.get(deviceId);
    if (held !== undefined && this.on.now() < held.until && (!master || held.withPasscode)) {
      return held.token;
    }
    let proving = this.proving.get(deviceId);
    if (proving === undefined) {
      // Never the token it held: a proof refused leaves the phone holding none.
      this.tokens.delete(deviceId);
      const withPasscode = master || !this.signedIn(deviceId);
      proving = (async () =>
        this.proved(deviceId, {
          ...(await this.signedChallenge(deviceId)),
          ...(withPasscode ? { passcode: storyMasterPasscode } : {}),
        }))().finally(() => this.proving.delete(deviceId));
      this.proving.set(deviceId, proving);
    }
    const answer = await proving;
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
    const asked = await this.ask(challengePhoneEndpoint, { ids: { deviceId } });
    toldToWait(asked);
    const { challenge } = phoneChallengeAnswerSchema.parse(answered(challengePhoneEndpoint, asked));
    return { challenge, signature: key.signed(challenge) };
  }

  // The proof sent: proven, the phone holds its token until it runs out by the clock in use.
  private async proved(
    deviceId: string,
    proof: { readonly challenge: string; readonly signature: string; readonly passcode?: string },
  ): Promise<string> {
    const now = this.on.now();
    const answer = await this.ask(provePhoneEndpoint, { ids: { deviceId }, json: proof });
    toldToWait(answer);
    if (answer.status === 200) {
      const proven = phoneProvenAnswerSchema.parse(answer.body);
      this.tokens.set(deviceId, {
        token: proven.token,
        until: new Date(now.getTime() + proven.expiresInSeconds * 1000),
        withPasscode: proof.passcode !== undefined,
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
    if (this.closed) throw new Error('The story has ended: its API takes no more requests.');
    this.starting ??= this.start();
    try {
      this.process = await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  // How long each of the API's pieces of work waited for a connection, in milliseconds, in the
  // order they began (ADR-524): from asking for it to the work's first step.
  waitedMs(): readonly number[] {
    return [...this.waited];
  }

  private start(): Promise<ApiProcess> {
    return listeningApi({
      ...this.parts,
      clock: { now: () => this.on.now() },
      // No browser asks a story's API.
      corsOrigins: [],
      log: (line) => {
        this.kept(line);
      },
      waited: this.waited,
    });
  }
}

// What the API's own process is started on, away from an installation (ARCHITECTURE §15;
// ADR-491, 572): a story's database, the policy, an object store kept in memory, a clock, the
// pages that may call it from a browser, and where its log lines go.
export interface ListeningParts {
  readonly database: StoryDatabase;
  readonly policy: Policy;
  readonly media: StoryMedia;
  readonly clock: Clock;
  // None for a story's phones; the field app's browser tests' own page for theirs (ADR-572).
  readonly corsOrigins: readonly string[];
  readonly log: (line: string) => void;
  // How long each piece of work waited for a connection, where a story counts it (ADR-524).
  readonly waited?: number[];
  // Whether a phone's address lookup asks the local stack's own address server, as an
  // installation's API asks its own: the field app's browser world's (`pnpm field:try`, the
  // browser tests; ADR-593). None for a story's phones.
  readonly asksAddresses?: boolean;
}

// The API's own process, `ApiProcess` with `ApiModule` as `apps/api/src/main.ts` starts it, on a
// story's database, listening at 127.0.0.1:3180 over HTTPS, which the stack's proxy reaches as
// `stories.adms.localhost` (infra/local/Caddyfile). One at a time: a second while one holds the
// port is told so.
export async function listeningApi(parts: ListeningParts): Promise<ApiProcess> {
  const { database, policy, media, clock, corsOrigins, log, waited } = parts;
  const map = parts.asksAddresses === true ? localMapServers() : undefined;
  // The policy's pool, as an installation's API runs on (ADR-419, 524).
  const pool = {
    maxConnections: policy.databasePoolConnections,
    pieceOfWork: {
      waitMs: policy.databaseConnectionWaitMs,
      longestMs: policy.databaseWorkLongestMs,
    },
  };
  const opened = database.open('api', pool);
  const api = await ApiProcess.create(
    ApiModule,
    {
      host: '127.0.0.1',
      port: storyApiPort,
      // Over HTTPS alone, with the stack's certificate for a process on this machine: Caddy
      // reaches it so, checking it against the stack's root (KD-78; ADR-517).
      tls: storyApiTls(),
      // Unread: the process is handed the story's own clients below.
      databaseUrl: '',
      readOnlyDatabaseUrl: '',
      corsOrigins: [...corsOrigins],
      // No proxy is believed: a caller's address is the one that connected.
      trustedProxies: [],
      tokenSigningSecret: storySigningSecret,
      passwordKey: storyPasswordKey,
      sealingKey: storySealingKey,
      smtpUrl: '',
      smtpAddress: undefined,
      smtpCaFile: null,
      mailFrom: 'open-adms@adms.localhost',
      addressesUrl: map?.addresses ?? 'https://addresses.adms.localhost',
      mapCaFile: map?.caFile ?? null,
      mapServersAt: undefined,
      esriPrivateHosts: [],
      esriCaFile: null,
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
      // A story says what happens itself; of the API's log, only what the caller keeps.
      stream: { write: log },
      database: waited === undefined ? opened : timed(opened, waited),
      viewerDatabase: database.openViewer(pool),
      mail: new NoMail(),
      clock,
      ...(map === undefined ? { addresses: noAddresses } : {}),
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

// A service's database whose every piece of work says how long it waited to begin: from asking
// for a connection to the work's first step, written into `waited` (ADR-524).
function timed(db: Database, waited: number[]): Database {
  const began =
    <T>(asked: number, work: (tx: Prisma.TransactionClient) => Promise<T>) =>
    (tx: Prisma.TransactionClient): Promise<T> => {
      waited.push(performance.now() - asked);
      return work(tx);
    };
  return new Proxy(db, {
    get(target, name) {
      if (name === '$write') {
        return <T>(actor: Actor, work: (tx: Prisma.TransactionClient) => Promise<T>) =>
          target.$write(actor, began(performance.now(), work));
      }
      if (name === '$read') {
        return <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
          target.$read(began(performance.now(), work));
      }
      const value: unknown = Reflect.get(target, name, target);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

// A limit reached (`429 LIMITED`, ARCHITECTURE §6, Abuse; ADR-416) or the database busy (`503
// BUSY`, ADR-524): the phone is told to wait the seconds the answer says, read as the contracts
// read it for any client, whichever of its requests it was, its proof among them (ADR-505).
function toldToWait(answer: Asked): void {
  if (answer.status !== 429 && answer.status !== 503) return;
  const seconds = waitAsked(answer.body);
  const code = errorAnswerSchema.safeParse(answer.body).data?.code;
  if (seconds !== null && code !== undefined) throw new ToldToWait(seconds, code);
}

// A proof's answer: proven, or the code it was refused with.
function proofAnswer(answer: Asked): string {
  return answer.status === 200 ? 'PROVEN' : (codeOf(answer) ?? `answered ${String(answer.status)}`);
}
