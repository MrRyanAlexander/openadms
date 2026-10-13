// A person of the back office or a read-only viewer at their browser, signed in to the story's
// own API over HTTPS (ARCHITECTURE §6, Back-office sessions; BACKLOG 2.7.1 part 4; ADR-496), as
// the back office's pages and the portal will be:
//
// - **Signed in as a real person is**: their email address and password, and the code their
//   authenticator app shows now where they have one (NIST SP 800-63B §5.1.4: a code is good once,
//   so a second sign-in waits for the next thirty seconds of the story's clock). A password an
//   admin set for them is changed for one of their own at once; an admin or a manager/analyst
//   with no authenticator sets one up at once, as the API serves them nothing else until then.
// - **The session is the cookies the API sets**, sent back as a browser sends them; the CSRF
//   value its answers hold goes with every call that isn't a GET (OWASP ASVS 5.0 3.5.1).
// - **The story's clock moves on by hours and days**, so an access token runs out between two
//   requests: answered `NOT_SIGNED_IN`, the browser gets a new one with its refresh token, as a
//   page does; where the session itself has ended (thirty minutes quiet, twelve hours old), the
//   person signs in again. The request is then sent once more.
// - **What its holder types is never a story's**: a password is made up here, and the first
//   admin's is set on the server as `pnpm installer:admin` lets an admin back in (ADR-415).
import { randomBytes } from 'node:crypto';

import {
  beginTwoStepSetupEndpoint,
  changePasswordEndpoint,
  confirmTwoStepSetupEndpoint,
  csrfHeader,
  currentSessionEndpoint,
  refreshSessionEndpoint,
  sessionAnswerSchema,
  signInEndpoint,
  type AnswerOf,
  type Endpoint,
  type SessionAnswer,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { PasswordRules, type Policy } from '@open-adms/domain';
import {
  OneTimeCodes,
  PasswordHasher,
  ServerAdmin,
  shippedBreachedPasswords,
} from '@open-adms/api';

import { answered, codeOf, type Asked, type AskedWith } from './over-https.ts';
import { storySigningSecret } from './story-api.ts';

interface Clock {
  now(): Date;
}

// A person who signs in at a browser: their id, and the email address the firm holds for them.
export interface OfficePerson {
  readonly id: string;
  readonly email: string;
}

// How a browser's request reaches the story's API: over HTTPS, on the story's clock.
export type Send = (served: Endpoint, more: AskedWith) => Promise<Asked>;

// A password nobody will ever type again: twenty-four characters, made up afresh.
export const madeUpPassword = (): string => randomBytes(18).toString('base64url');

// The firm's first admin's password, set on the server as `pnpm installer:admin` lets an admin
// back in (ADR-415): whoever runs it already holds the server. The admin has no session yet, so
// there is none to end. The password set.
export async function setOnTheServer(
  db: Database,
  clock: Clock,
  policy: Policy,
  admin: OfficePerson,
): Promise<string> {
  const password = madeUpPassword();
  const outcome = await new ServerAdmin(db, {
    rules: new PasswordRules(policy, shippedBreachedPasswords()),
    hasher: new PasswordHasher(storySigningSecret),
    sessions: { endAll: () => Promise.resolve(0) },
    clock,
  }).letBackIn(admin.email, password, false);
  if (!outcome.done) throw new Error(`The admin’s password wasn’t set: ${outcome.code}.`);
  return password;
}

export class OfficeBrowser {
  readonly userId: string;
  private readonly send: Send;
  private readonly clock: Clock;
  private readonly email: string;
  private password: string;
  // What the person's authenticator app holds, once they have set one up.
  private secret: Buffer | undefined;
  // The step whose code the app last gave: a code is good once.
  private lastStep = -1;
  private readonly cookies = new Map<string, string>();
  private csrf: string | undefined;

  private constructor(send: Send, clock: Clock, person: OfficePerson, password: string) {
    this.send = send;
    this.clock = clock;
    this.userId = person.id;
    this.email = person.email;
    this.password = password;
  }

  // The person signs in with the password they were given: where an admin set it, they set one
  // of their own; where their role must have an authenticator and they have none, they set one
  // up. Any refusal stops the story.
  static async signIn(
    send: Send,
    clock: Clock,
    person: OfficePerson,
    password: string,
  ): Promise<OfficeBrowser> {
    const browser = new OfficeBrowser(send, clock, person, password);
    let session = await browser.signedIn();
    if (session.passwordChangeRequired) {
      const own = madeUpPassword();
      await browser.answered(changePasswordEndpoint, {
        json: { current: password, password: own },
      });
      browser.password = own;
      session = await browser.answered(currentSessionEndpoint);
    }
    if (session.twoStepSetupRequired) {
      const begun = await browser.answered(beginTwoStepSetupEndpoint);
      browser.secret = base32Read(begun.secret);
      const confirmed = await browser.answered(confirmTwoStepSetupEndpoint, {
        json: { setup: begun.setup, code: browser.code() },
      });
      browser.csrf = confirmed.csrf;
    }
    return browser;
  }

  // Any answer, as the API gave it: for a refusal a story checks.
  async asked(served: Endpoint, more: AskedWith = {}): Promise<Asked> {
    const answer = await this.once(served, more);
    if (answer.status !== 401 || codeOf(answer) !== 'NOT_SIGNED_IN') return answer;
    await this.renewed();
    return this.once(served, more);
  }

  // The body of a 200, read by the endpoint's answer; anything else stops the story.
  async answered<E extends Endpoint>(served: E, more: AskedWith = {}): Promise<AnswerOf<E>> {
    return served.answer.parse(answered(served, await this.asked(served, more))) as AnswerOf<E>;
  }

  private async once(served: Endpoint, more: AskedWith): Promise<Asked> {
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const answer = await this.send(served, {
      ...more,
      headers: {
        ...more.headers,
        ...(cookie === '' ? {} : { cookie }),
        ...(served.method === 'GET' || this.csrf === undefined ? {} : { [csrfHeader]: this.csrf }),
      },
    });
    this.keep(answer);
    return answer;
  }

  // The cookies an answer set, as a browser keeps them: one set empty is taken away.
  private keep(answer: Asked): void {
    for (const line of answer.setCookies) {
      const [pair = ''] = line.split(';');
      const at = pair.indexOf('=');
      if (at < 1) continue;
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  // A new access token with the refresh token; where the session has ended, a sign-in again.
  private async renewed(): Promise<void> {
    const refreshed = await this.once(refreshSessionEndpoint, {});
    if (refreshed.status === 200) {
      this.opened(refreshSessionEndpoint, refreshed);
      return;
    }
    await this.signedIn();
  }

  private async signedIn(): Promise<SessionAnswer> {
    const code = this.secret === undefined ? {} : { code: this.code() };
    this.cookies.clear();
    this.csrf = undefined;
    const answer = await this.once(signInEndpoint, {
      json: { email: this.email, password: this.password, ...code },
    });
    return this.opened(signInEndpoint, answer);
  }

  private opened(served: Endpoint, answer: Asked): SessionAnswer {
    const session = sessionAnswerSchema.parse(answered(served, answer));
    this.csrf = session.csrf;
    return session;
  }

  // The code the person's app shows now, by the story's clock.
  private code(): string {
    if (this.secret === undefined) throw new Error(`${this.email} has no authenticator.`);
    const step = Math.floor(this.clock.now().getTime() / 30_000);
    if (step <= this.lastStep) {
      throw new Error(
        `${this.email}’s authenticator already gave this step’s code: the story’s clock must move ` +
          'on thirty seconds before they sign in again.',
      );
    }
    this.lastStep = step;
    return new OneTimeCodes().codeAt(this.secret, step);
  }
}

// A browser nobody signed in at: every request goes without a session.
export function signedOut(send: Send): Pick<OfficeBrowser, 'asked'> {
  return { asked: (served: Endpoint, more?: AskedWith) => send(served, more ?? {}) };
}

// What an authenticator app does with the text it is shown (RFC 4648's base32, no padding).
function base32Read(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const letter of text.replace(/=+$/, '').toUpperCase()) {
    const value = alphabet.indexOf(letter);
    if (value < 0) throw new Error('An authenticator’s secret that isn’t base32.');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let at = 0; at + 8 <= bits.length; at += 8) bytes.push(parseInt(bits.slice(at, at + 8), 2));
  return Buffer.from(bytes);
}
