// What a back office browser test needs of the run's own world (e2e/world-setup.ts): its page's and
// its API's origins; a person of the test's own, given a password by Dana (to sign in through the
// screens) or signed in already (their session's cookies put in the test's browser); what the API
// mailed an address; and the code a person's authenticator app shows now (RFC 6238), as their phone
// would.
import { createHmac } from 'node:crypto';

import type { BrowserContext } from '@playwright/test';

export const worldPageOrigin = 'https://office-world.adms.localhost';
export const worldApiOrigin = 'https://stories.adms.localhost';

function control(): string {
  const value = process.env['ADMS_E2E_OFFICE_CONTROL'];
  if (value === undefined || value === '') {
    throw new Error("ADMS_E2E_OFFICE_CONTROL isn't set: the run's setup didn't make a world.");
  }
  return value;
}

async function asked<T>(path: string, init: RequestInit = {}): Promise<T> {
  const answer = await fetch(new URL(path, control()), init);
  const body = (await answer.json()) as T & { problem?: string };
  if (!answer.ok) {
    throw new Error(`The world refused ${path}: ${body.problem ?? String(answer.status)}`);
  }
  return body;
}

export type Role = 'ADMIN' | 'MANAGER_ANALYST' | 'READ_ONLY_VIEWER';

export interface Person {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly secret: string | null;
  readonly cookies: readonly { readonly name: string; readonly value: string }[];
}

export interface WorldIds {
  readonly p1: string;
  // The golden mission's world's alone.
  readonly p2?: string;
  readonly dana: string;
  readonly luis: string;
}

export const worldIds = (): Promise<WorldIds> => asked<WorldIds>('/world');

// What the golden mission's outcomes say (packages/scenarios' `goldenOutcomes`), the parts a back
// office test checks its screens against: the review queue before any review, a workflow at a
// time ("number STATUS · flag…"), and each ticket's status once the review is done.
export interface MissionOutcomes {
  readonly wednesday: {
    readonly p1: {
      readonly queue: Readonly<Record<'LOAD' | 'HAUL_OUT' | 'UNIT_RATE', readonly string[]>>;
    };
  };
  readonly reviewed: {
    readonly p1: {
      readonly statuses: readonly string[];
      readonly ledger: readonly string[];
      readonly total: { readonly lines: number; readonly total: string };
    };
    readonly p2: {
      readonly ledger: readonly string[];
      readonly total: { readonly lines: number; readonly total: string };
    };
  };
}

// The mission's outcomes, from a world that holds the mission.
export const missionOutcomes = (): Promise<MissionOutcomes> => asked<MissionOutcomes>('/outcomes');

// A person given a password by Dana and nothing more: they sign in through the screens.
export function givenPassword(name: string, role: Role, grants: readonly string[] = []) {
  return asked<Person>('/people', {
    method: 'POST',
    body: JSON.stringify({ name, role, grants, as: 'givenPassword' }),
  });
}

// A person signed in already, their session put in the test's browser: the page opens signed in.
export async function signedIn(
  context: BrowserContext,
  name: string,
  role: Role,
  grants: readonly string[] = [],
): Promise<Person> {
  const person = await asked<Person>('/people', {
    method: 'POST',
    body: JSON.stringify({ name, role, grants, as: 'signedIn' }),
  });
  await context.addCookies(
    person.cookies.map(({ name: cookie, value }) => ({
      name: cookie,
      value,
      url: worldApiOrigin,
      secure: true,
      httpOnly: true,
      sameSite: 'Strict' as const,
    })),
  );
  return person;
}

export interface Mailed {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export const mailTo = (address: string): Promise<readonly Mailed[]> =>
  asked<readonly Mailed[]>(`/mail?to=${encodeURIComponent(address)}`);

// The world's time, by which its API judges a session and a code: the story's clock, standing
// still unless a test moves it on (a code is good once, so a second sign-in moves it thirty
// seconds).
export async function worldNow(): Promise<Date> {
  return new Date((await asked<{ now: string }>('/now')).now);
}

export async function later(seconds: number): Promise<void> {
  await asked('/later', { method: 'POST', body: JSON.stringify({ seconds }) });
}

// The code an authenticator app shows for a key now by the world's clock (RFC 6238: HMAC-SHA1, six
// digits, thirty seconds).
export async function codeNow(secret: string): Promise<string> {
  return codeOf(secret, Math.floor((await worldNow()).getTime() / 30_000));
}

export function codeOf(secret: string, step: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const letter of secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(letter).toString(2).padStart(5, '0');
  }
  const key: number[] = [];
  for (let at = 0; at + 8 <= bits.length; at += 8) key.push(parseInt(bits.slice(at, at + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', Buffer.from(key)).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const value = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}
