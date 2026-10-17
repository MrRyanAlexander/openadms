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
//
// **A try at a secret counts while it is under way** (ADR-541; the Phase 2 audit's F2): a try let
// past `mayTry` is held as in flight until it is over, and the tries in flight count towards the
// address's limits beside those already refused. So a burst sent at once from one address is let
// through no further than the limit, not as far as the burst is long.
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

// A try at a secret under way: over once its outcome is known, whatever it was. Its refusal, if
// it was refused, is counted by `wrongTry` before it is over.
export interface TryUnderWay {
  over(): void;
}

export class Limits {
  private readonly rules: RateLimits;
  private readonly clock: Clock;
  private readonly kept = new Map<string, Counted>();
  // Tries at a secret let past `mayTry` and not yet over, by the key they count under.
  private readonly inFlight = new Map<string, number>();
  // When each address was last refused at each login, in milliseconds, oldest first.
  private readonly lastRefused = new Map<string, number>();

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
  // at any login or at this one, counting its tries still under way as refused. A try refused
  // here never reaches the login, so it is never a wrong try there. One let through is under way
  // until the caller says it is over (in a `finally`, whatever happened).
  mayTry(address: string, login?: string): TryUnderWay {
    const from = addressCounted(address);
    const keys = [
      Limits.key('WRONG_TRIES_BY_ADDRESS', from),
      ...(login === undefined
        ? []
        : [Limits.key('WRONG_TRIES_BY_ADDRESS_AT_LOGIN', Limits.pair(login, from))]),
    ];
    const limited =
      this.closed('WRONG_TRIES_BY_ADDRESS', from, true) ??
      (login === undefined
        ? undefined
        : this.closed('WRONG_TRIES_BY_ADDRESS_AT_LOGIN', Limits.pair(login, from), true));
    if (limited !== undefined) throw limited;
    for (const key of keys) this.inFlight.set(key, (this.inFlight.get(key) ?? 0) + 1);
    let done = false;
    return {
      over: () => {
        if (done) return;
        done = true;
        for (const key of keys) {
          const left = (this.inFlight.get(key) ?? 1) - 1;
          if (left > 0) this.inFlight.set(key, left);
          else this.inFlight.delete(key);
        }
      },
    };
  }

  // Whether this address was refused at that login in the last `seconds` (ADR-541): the master
  // passcode's wait holds only an address that has tried it wrong, so a stranger's wrong tries
  // never keep the firm's own supervisors out.
  refusedLately(address: string, login: string, seconds: number): boolean {
    const at = this.lastRefused.get(Limits.pair(login, addressCounted(address)));
    return at !== undefined && this.clock.now().getTime() - at < seconds * 1000;
  }

  // A try at a secret was refused.
  wrongTry(address: string, login?: string): void {
    const from = addressCounted(address);
    this.count('WRONG_TRIES_BY_ADDRESS', from);
    if (login === undefined) return;
    this.count('WRONG_TRIES_BY_ADDRESS_AT_LOGIN', Limits.pair(login, from));
    this.refusedAt(address, login);
  }

  // When an address was refused at a login, kept as soon as the login's own check knows it: the
  // master passcode's check says so inside its turn, before the next try's turn begins, so the
  // next try from that address is held by the wait however its request was timed (ADR-541).
  refusedAt(address: string, login: string): void {
    const pair = Limits.pair(login, addressCounted(address));
    // Moved to the end of the line, so the first in it is the oldest, and bounded as the counts.
    this.lastRefused.delete(pair);
    while (this.lastRefused.size >= this.rules.countsKept) {
      const oldest = this.lastRefused.keys().next();
      if (oldest.done === true) break;
      this.lastRefused.delete(oldest.value);
    }
    this.lastRefused.set(pair, this.clock.now().getTime());
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

  // How many keys have a try under way: what a test reads to see that none is left behind.
  get underWay(): number {
    return this.inFlight.size;
  }

  private taken(name: RateLimitName, who: string): Limited | undefined {
    const limited = this.closed(name, who);
    if (limited === undefined) this.count(name, who);
    return limited;
  }

  // `andUnderWay`: the tries under way count too, as if each were refused.
  private closed(name: RateLimitName, who: string, andUnderWay = false): Limited | undefined {
    const key = Limits.key(name, who);
    const limit = this.rules.of(name);
    const now = this.clock.now();
    const kept = this.kept.get(key);
    const underWay = andUnderWay ? (this.inFlight.get(key) ?? 0) : 0;
    const counted: Counted | undefined =
      underWay === 0
        ? kept
        : limit.live(kept, now)
          ? { from: kept.from, count: kept.count + underWay }
          : { from: now.getTime(), count: underWay };
    const seconds = limit.closedFor(counted, now);
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
