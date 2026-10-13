// Rate limits (ARCHITECTURE §6, Abuse; AC-10-40; T-16, T-17; ADR-416): OWASP ASVS 5.0 2.4.1,
// 6.1.1, 6.3.1. The rule and its numbers are the domain's (RateLimits, from the policy); this
// keeps the counts and refuses a caller over one with 429 LIMITED and how long to wait.
//
// The counts are in this process's memory, never in the database: a row written each time a
// stranger asks would let the open web grow it (ADR-401). So they start again when the process
// does, and two processes each keep their own. What must outlast a restart and be shared, the
// count of wrong tries at a login and its lock, is in the database already (wrong-tries.ts). The
// memory is bounded: past the policy's number of counts, the oldest goes.
//
// A caller is counted by address (the domain's addressCounted: an IPv6 caller by its network), a
// login by a hash of the address typed, so nothing a stranger typed is held as it was typed.
import { createHash } from 'node:crypto';

import {
  addressCounted,
  type Counted,
  type RateLimitName,
  type RateLimits,
} from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import { Refusal } from './refusal.ts';

export const apiLimits = Symbol('the API’s rate limits');

// A caller over a limit: which one, for the server's log, and how long until it may ask again.
export class Limited extends Refusal {
  readonly limit: RateLimitName;
  readonly retryAfterSeconds: number;

  constructor(limit: RateLimitName, retryAfterSeconds: number) {
    super('LIMITED', 429);
    this.limit = limit;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class Limits {
  private readonly rules: RateLimits;
  private readonly clock: Clock;
  private readonly kept = new Map<string, Counted>();

  constructor(rules: RateLimits, clock: Clock) {
    this.rules = rules;
    this.clock = clock;
  }

  // Every request, as it arrives: counted for its address. The refusal, for one over the limit.
  arrived(address: string): Limited | undefined {
    return this.taken('REQUESTS_BY_ADDRESS', addressCounted(address));
  }

  // Every request of a signed-in person (or of a session, where only its refresh token says
  // whose it is), from whatever address.
  asked(account: string): void {
    const limited = this.taken('REQUESTS_BY_ACCOUNT', account);
    if (limited !== undefined) throw limited;
  }

  // Every request of a proven phone, counted for the phone, whatever address it came from and
  // whoever is signed in on it (ADR-490): an office's phones share its address, and one of them
  // must not spend the count of the rest.
  phoneAsked(deviceId: string): void {
    const limited = this.taken('REQUESTS_BY_PHONE', `phone ${deviceId}`);
    if (limited !== undefined) throw limited;
  }

  // Every part of a photograph's file a phone sends, or asks after (ADR-482), counted for the
  // phone, whatever address it came from.
  filePart(deviceId: string): void {
    const limited = this.taken('FILE_PARTS_BY_PHONE', `phone ${deviceId}`);
    if (limited !== undefined) throw limited;
  }

  // Before a secret is tried: refused where this address has been refused too often already,
  // at any login or at this one. A try refused here never reaches the login, so it is never a
  // wrong try there.
  mayTry(address: string, login?: string): void {
    const from = addressCounted(address);
    const limited =
      this.closed('WRONG_TRIES_BY_ADDRESS', from) ??
      (login === undefined
        ? undefined
        : this.closed('WRONG_TRIES_BY_ADDRESS_AT_LOGIN', Limits.pair(login, from)));
    if (limited !== undefined) throw limited;
  }

  // A try at a secret was refused.
  wrongTry(address: string, login?: string): void {
    const from = addressCounted(address);
    this.count('WRONG_TRIES_BY_ADDRESS', from);
    if (login !== undefined)
      this.count('WRONG_TRIES_BY_ADDRESS_AT_LOGIN', Limits.pair(login, from));
  }

  // A sign-in worked: what this address was refused at that login before counts no more.
  signedIn(address: string, login: string): void {
    this.kept.delete(
      Limits.key('WRONG_TRIES_BY_ADDRESS_AT_LOGIN', Limits.pair(login, addressCounted(address))),
    );
  }

  // The login's password was set anew: no address's refused tries at it count any more, so its
  // owner isn't kept out of it by the tries that came before.
  setAnew(login: string | null): void {
    if (login === null) return;
    const all = Limits.key('WRONG_TRIES_BY_ADDRESS_AT_LOGIN', Limits.pair(login, ''));
    for (const key of [...this.kept.keys()]) if (key.startsWith(all)) this.kept.delete(key);
  }

  // A reset by email is asked for: counted for the address that asks and for the login asked
  // for, whether or not anybody has it. Neither is counted where either is over.
  resetAsked(address: string, login: string): void {
    const from = addressCounted(address);
    const whose = Limits.login(login);
    const limited =
      this.closed('RESET_ASKS_BY_ADDRESS', from) ?? this.closed('RESET_ASKS_BY_LOGIN', whose);
    if (limited !== undefined) throw limited;
    this.count('RESET_ASKS_BY_ADDRESS', from);
    this.count('RESET_ASKS_BY_LOGIN', whose);
  }

  // How many counts are kept now.
  get size(): number {
    return this.kept.size;
  }

  private taken(name: RateLimitName, who: string): Limited | undefined {
    const limited = this.closed(name, who);
    if (limited === undefined) this.count(name, who);
    return limited;
  }

  private closed(name: RateLimitName, who: string): Limited | undefined {
    const seconds = this.rules
      .of(name)
      .closedFor(this.kept.get(Limits.key(name, who)), this.clock.now());
    return seconds === undefined ? undefined : new Limited(name, seconds);
  }

  private count(name: RateLimitName, who: string): void {
    const key = Limits.key(name, who);
    const limit = this.rules.of(name);
    const now = this.clock.now();
    const before = this.kept.get(key);
    if (limit.live(before, now)) {
      this.kept.set(key, limit.counted(before, now));
      return;
    }
    // A new stretch goes to the end of the line, so the line stays in the order the stretches
    // began and the first in it is the oldest.
    this.kept.delete(key);
    while (this.kept.size >= this.rules.countsKept) {
      const oldest = this.kept.keys().next();
      if (oldest.done === true) break;
      this.kept.delete(oldest.value);
    }
    this.kept.set(key, limit.counted(undefined, now));
  }

  private static key(name: RateLimitName, who: string): string {
    return `${name} ${who}`;
  }

  // One login as tried from one address.
  private static pair(login: string, from: string): string {
    return `${Limits.login(login)} ${from}`;
  }

  // The address a person signs in with, as sign-in compares it (whole, without regard to
  // capitals), kept only as a hash.
  private static login(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('base64url');
  }
}
