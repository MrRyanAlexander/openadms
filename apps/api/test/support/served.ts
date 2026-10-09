// The API's process on a test's own piece of work, a browser's side of it, and the example
// world's people with their logins (CONVENTIONS §6), for the tests of sign-in that run against
// the installation's database (ADR-405, 408, 412; BACKLOG C90). Each test's work is undone.
import { randomUUID } from 'node:crypto';

import {
  backOfficeRoles,
  endpoint,
  errorAnswerSchema,
  healthAnswerSchema,
  sessionAnswerSchema,
  signedInRoles,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { Body, Controller, Module } from '@nestjs/common';
import { expect } from 'vitest';

import { ApiModule } from '../../src/process/api-module.ts';
import { ApiProcess, type ProcessPolicy } from '../../src/process/api-process.ts';
import { Serves } from '../../src/process/serves.ts';
import type { Mail } from '../../src/sign-in/mail.ts';
import { OneTimeCodes } from '../../src/sign-in/one-time-codes.ts';
import { undone, ViewedWithin, type Tx } from './database.ts';
import { madeUpSettings, ready, shippedPolicy } from './process.ts';
import { NoServer, signingSecret, signInOn, TestClock } from './sign-in.ts';

export const long = 'marsh heron delphine ferry';
export const longer = 'ferry delphine heron marsh';
export const wrong = 'heron marsh ferry delphine';

// This test's own endpoint, standing in for a reviewer's write (a void): only a signed-in person
// may call it, and not one who must first set their own password.
export const ran: string[] = [];

@Controller()
class WritingController {
  @Serves(
    endpoint({
      name: 'testVoid',
      summary: 'A test’s own.',
      access: 'SIGNED_IN',
      roles: signedInRoles,
      method: 'POST',
      path: '/test/voids',
      body: healthAnswerSchema,
      answer: healthAnswerSchema,
    }),
  )
  void(@Body() body: { status: string }) {
    ran.push(body.status);
    return { status: 'ok' };
  }

  // Two that take a permission, as a reviewer's real ones will (task 2.4.4): a void and an
  // unlock, each open to an admin and to a manager/analyst who holds its grant now.
  @Serves(
    endpoint({
      name: 'testGrantedVoid',
      summary: 'A test’s own.',
      access: 'SIGNED_IN',
      roles: backOfficeRoles,
      permission: 'VOID',
      method: 'POST',
      path: '/test/granted-voids',
      answer: healthAnswerSchema,
    }),
  )
  grantedVoid() {
    ran.push('void');
    return { status: 'ok' };
  }

  @Serves(
    endpoint({
      name: 'testUnlock',
      summary: 'A test’s own.',
      access: 'SIGNED_IN',
      roles: backOfficeRoles,
      permission: 'UNLOCK_INVOICED',
      method: 'POST',
      path: '/test/unlocks',
      answer: healthAnswerSchema,
    }),
  )
  unlock() {
    ran.push('unlock');
    return { status: 'ok' };
  }
}

@Module({ imports: [ApiModule], controllers: [WritingController] })
class WritingModule {}

// The example world's people (CONVENTIONS §6).
export interface People {
  readonly dana: string;
  readonly luis: string;
  readonly viewer: string;
  readonly kim: string;
  readonly kimsId: string;
}

async function people(tx: Tx, dana: string): Promise<People> {
  await tx.user.create({
    data: { id: dana, name: 'Dana Reyes', role: 'ADMIN', email: 'dana.reyes@gates.example' },
  });
  const luis = await tx.user.create({
    data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST', email: 'Luis.Ortega@gates.example' },
  });
  const viewer = await tx.user.create({
    data: {
      name: 'Bayline County debris manager',
      role: 'READ_ONLY_VIEWER',
      viewerKind: 'CLIENT',
      seesPrivateCitizens: true,
      email: 'debris@baylinecounty.example',
    },
  });
  const kim = await tx.user.create({
    data: { name: 'Kim Nguyen', role: 'MONITOR', email: 'kim.nguyen@harbor.example' },
  });
  return {
    dana,
    luis: luis.id,
    viewer: viewer.id,
    kim: kim.id,
    kimsId: kim.monitorNumber ?? '',
  };
}

export type Cookies = Readonly<Record<string, string>>;

export interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, unknown>>;
  readonly body: unknown;
  readonly text: string;
  readonly code: string | undefined;
  readonly requestId: string;
  // The cookies the answer set, by name; a cleared one is the empty string.
  readonly cookies: Cookies;
  readonly setCookie: readonly string[];
}

export interface Signed {
  readonly cookies: Cookies;
  readonly csrf: string;
  readonly answer: Answer;
}

// The process on a test's own piece of work, and a browser's side of it.
export class Served {
  readonly lines: string[] = [];
  readonly clock = new TestClock();
  // The authenticator apps of this test's people, by the address they sign in with: the secret
  // each holds, and the step of the last code it gave.
  readonly authenticators = new Map<string, Buffer>();
  private readonly shown = new Map<string, number>();
  // The address this browser's requests come from; a test that is somebody else moves it.
  from = '198.51.100.10';
  // Who each of a read-only viewer's reads was stated as to the database, in order.
  viewerStated: readonly string[] = [];
  private api: ApiProcess | undefined;

  static async on(
    within: Database,
    mail: Mail = new NoServer(),
    policy: ProcessPolicy = shippedPolicy,
  ): Promise<Served> {
    const served = new Served();
    const viewed = new ViewedWithin(within);
    served.viewerStated = viewed.stated;
    served.api = await ApiProcess.create(
      WritingModule,
      { ...madeUpSettings, tokenSigningSecret: signingSecret },
      policy,
      {
        stream: { write: (line) => served.lines.push(line) },
        database: within,
        viewerDatabase: viewed.asTheProcessHoldsIt(),
        mail,
        clock: served.clock,
      },
    );
    await ready(served.api);
    return served;
  }

  async close(): Promise<void> {
    await this.api?.close();
  }

  async ask(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    more: {
      cookies?: Cookies;
      csrf?: string;
      payload?: object;
      bearer?: string;
      monitorSession?: string;
    } = {},
  ): Promise<Answer> {
    if (this.api === undefined) throw new Error('The process is not started.');
    const cookie = Object.entries(more.cookies ?? {})
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    const answered = await this.api.app.inject({
      method,
      url,
      remoteAddress: this.from,
      headers: {
        ...(cookie === '' ? {} : { cookie }),
        ...(more.csrf === undefined ? {} : { 'x-adms-csrf': more.csrf }),
        // A proven phone's token (ADR-440).
        ...(more.bearer === undefined ? {} : { authorization: `Bearer ${more.bearer}` }),
        // The monitor signed in on that phone (ADR-443).
        ...(more.monitorSession === undefined
          ? {}
          : { 'x-adms-monitor-session': more.monitorSession }),
      },
      ...(more.payload === undefined ? {} : { payload: more.payload }),
    });
    const setCookie = [answered.headers['set-cookie'] ?? []].flat().map(String);
    const body: unknown = answered.json();
    const refused = errorAnswerSchema.safeParse(body);
    return {
      status: answered.statusCode,
      headers: answered.headers,
      body,
      text: answered.body,
      code: refused.success ? refused.data.code : undefined,
      requestId: String(answered.headers['x-request-id']),
      setCookie,
      cookies: Object.fromEntries(
        setCookie.map((set) => {
          const [pair = ''] = set.split(';');
          const at = pair.indexOf('=');
          return [pair.slice(0, at), pair.slice(at + 1)];
        }),
      ),
    };
  }

  signIn(email: string, password: string, code?: string): Promise<Answer> {
    return this.ask('POST', '/sessions', {
      payload: { email, password, ...(code === undefined ? {} : { code }) },
    });
  }

  // The code the person's authenticator app shows now, if they have one. A code is good once,
  // so where the app already gave this step's, the person waits for the next: thirty seconds.
  codeOf(email: string): string | undefined {
    const whose = email.trim().toLowerCase();
    const secret = this.authenticators.get(whose);
    if (secret === undefined) return undefined;
    if ((this.shown.get(whose) ?? -1) >= this.step()) this.clock.later(0.5);
    this.shown.set(whose, this.step());
    return new OneTimeCodes().codeAt(secret, this.step());
  }

  // The person's app gave this step's code by a way the test took itself.
  gave(email: string): void {
    this.shown.set(email.trim().toLowerCase(), this.step());
  }

  step(): number {
    return Math.floor(this.clock.now().getTime() / 30_000);
  }

  // A sign-in that must work, with what the browser now holds.
  async signedIn(email: string, password: string): Promise<Signed> {
    const answer = await this.signIn(email, password, this.codeOf(email));
    expect([answer.status, answer.code]).toEqual([200, undefined]);
    return { cookies: answer.cookies, csrf: sessionAnswerSchema.parse(answer.body).csrf, answer };
  }

  current(cookies: Cookies): Promise<Answer> {
    return this.ask('GET', '/sessions/current', { cookies });
  }

  refresh(signed: Pick<Signed, 'cookies' | 'csrf'>): Promise<Answer> {
    return this.ask('POST', '/sessions/refreshes', signed);
  }
}

export const danasEmail = 'dana.reyes@gates.example';
export const luissEmail = 'luis.ortega@gates.example';
// What their authenticator apps hold: twenty bytes each (Dana's is RFC 6238's own test secret).
export const danasSecret = Buffer.from('12345678901234567890');
export const luissSecret = Buffer.from('09876543210987654321');

// Each test's own piece of work, started as Dana and undone: Dana and Luis each have a password
// of their own (set as themselves, so neither is marked to be changed) and an authenticator set
// up, as an admin and a manager/analyst must (ADR-412).
export type Work = (served: Served, tx: Tx, who: People, within: Database) => Promise<void>;

export function worldOn(db: () => Database) {
  return (
    work: Work,
    mail: Mail = new NoServer(),
    policy: ProcessPolicy = shippedPolicy,
  ): Promise<void> => {
    const dana = randomUUID();
    return undone(db(), dana, async (within, tx) => {
      const who = await people(tx, dana);
      const { hasher, check } = signInOn(within, mail);
      const served = await Served.on(within, mail, policy);
      for (const [userId, password, email, secret] of [
        [who.dana, long, danasEmail, danasSecret],
        [who.luis, longer, luissEmail, luissSecret],
      ] as const) {
        await tx.userCredential.create({
          data: {
            userId,
            passwordHash: await hasher.hash(password),
            twoStepSecret: check.secrets.seal(userId, secret),
          },
        });
        served.authenticators.set(email, secret);
      }
      try {
        await work(served, tx, who, within);
      } finally {
        await served.close();
      }
    });
  };
}
